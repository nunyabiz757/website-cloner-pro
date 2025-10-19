import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { AppLogger } from '../services/logger.service.js';

/**
 * Image Security Utility
 * Handles EXIF stripping, re-encoding, and image exploit prevention
 */

export interface ImageSecurityOptions {
  stripExif?: boolean;
  stripMetadata?: boolean;
  reEncode?: boolean;
  maxWidth?: number;
  maxHeight?: number;
  quality?: number;
  format?: 'jpeg' | 'png' | 'webp' | 'avif' | 'original';
  validateDimensions?: boolean;
  validateFileSize?: boolean;
  maxFileSize?: number; // in bytes
  preventExploits?: boolean;
}

export interface ImageMetadata {
  format: string;
  width: number;
  height: number;
  space: string;
  channels: number;
  depth: string;
  density: number;
  hasAlpha: boolean;
  hasProfile: boolean;
  exif?: any;
  icc?: any;
  iptc?: any;
  xmp?: any;
  orientation?: number;
}

export interface ProcessingResult {
  success: boolean;
  originalPath: string;
  processedPath: string;
  originalSize: number;
  processedSize: number;
  compressionRatio: number;
  metadata: {
    before: Partial<ImageMetadata>;
    after: Partial<ImageMetadata>;
  };
  strippedData: {
    exif: boolean;
    icc: boolean;
    iptc: boolean;
    xmp: boolean;
  };
  warnings: string[];
  errors: string[];
}

export interface ImageAnalysis {
  isValid: boolean;
  isSafe: boolean;
  format: string;
  dimensions: { width: number; height: number };
  fileSize: number;
  hasExif: boolean;
  hasMetadata: boolean;
  warnings: string[];
  threats: string[];
  metadata: Partial<ImageMetadata>;
}

export class ImageSecurityError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'ImageSecurityError';
  }
}

export class ImageSecurityUtil {
  private defaultOptions: Required<ImageSecurityOptions> = {
    stripExif: true,
    stripMetadata: true,
    reEncode: true,
    maxWidth: 4096,
    maxHeight: 4096,
    quality: 85,
    format: 'original',
    validateDimensions: true,
    validateFileSize: true,
    maxFileSize: 10 * 1024 * 1024, // 10 MB
    preventExploits: true,
  };

  // Supported image formats
  private supportedFormats = ['jpeg', 'png', 'webp', 'gif', 'tiff', 'avif', 'svg'];

  // Dangerous EXIF tags that could contain exploits
  private dangerousExifTags = [
    'UserComment',
    'ImageDescription',
    'Make',
    'Model',
    'Software',
    'Copyright',
    'Artist',
    'ProcessingSoftware',
  ];

  constructor(defaultOptions?: Partial<ImageSecurityOptions>) {
    if (defaultOptions) {
      this.defaultOptions = { ...this.defaultOptions, ...defaultOptions };
    }
  }

  /**
   * Analyze image for security threats
   */
  async analyzeImage(imagePath: string): Promise<ImageAnalysis> {
    try {
      const stats = await fs.stat(imagePath);
      const fileSize = stats.size;

      const metadata = await sharp(imagePath).metadata();

      const analysis: ImageAnalysis = {
        isValid: true,
        isSafe: true,
        format: metadata.format || 'unknown',
        dimensions: {
          width: metadata.width || 0,
          height: metadata.height || 0,
        },
        fileSize,
        hasExif: !!metadata.exif,
        hasMetadata: !!(metadata.exif || metadata.icc || metadata.iptc || metadata.xmp),
        warnings: [],
        threats: [],
        metadata: {
          format: metadata.format,
          width: metadata.width,
          height: metadata.height,
          space: metadata.space,
          channels: metadata.channels,
          depth: metadata.depth,
          density: metadata.density,
          hasAlpha: metadata.hasAlpha,
          hasProfile: metadata.hasProfile,
          orientation: metadata.orientation,
        },
      };

      // Check if format is supported
      if (!this.supportedFormats.includes(analysis.format)) {
        analysis.isValid = false;
        analysis.threats.push(`Unsupported image format: ${analysis.format}`);
      }

      // Check dimensions
      if (analysis.dimensions.width === 0 || analysis.dimensions.height === 0) {
        analysis.isValid = false;
        analysis.threats.push('Invalid image dimensions');
      }

      // Check for suspicious dimensions (potential DoS)
      if (
        analysis.dimensions.width > 50000 ||
        analysis.dimensions.height > 50000
      ) {
        analysis.isSafe = false;
        analysis.threats.push(
          'Extremely large dimensions detected (potential DoS attack)'
        );
      }

      // Check for decompression bomb (small file, huge dimensions)
      const pixelCount = analysis.dimensions.width * analysis.dimensions.height;
      const bytesPerPixel = fileSize / pixelCount;

      if (bytesPerPixel < 0.01 && pixelCount > 10000000) {
        // Less than 0.01 bytes per pixel for >10MP image
        analysis.isSafe = false;
        analysis.threats.push(
          'Potential decompression bomb detected (high compression ratio)'
        );
      }

      // Check for EXIF data
      if (metadata.exif) {
        analysis.warnings.push('Image contains EXIF data (privacy risk)');

        // Parse EXIF for dangerous content
        try {
          const exifData = metadata.exif.toString('utf8');

          // Check for script tags or suspicious content
          if (
            exifData.includes('<script') ||
            exifData.includes('javascript:') ||
            exifData.includes('onerror=')
          ) {
            analysis.isSafe = false;
            analysis.threats.push('EXIF data contains suspicious content');
          }
        } catch {
          // EXIF parsing failed, be cautious
          analysis.warnings.push('Failed to parse EXIF data');
        }
      }

      // Check for embedded profiles (ICC)
      if (metadata.icc) {
        analysis.warnings.push('Image contains ICC color profile');
      }

      // Check orientation (can be used for tracking)
      if (metadata.orientation && metadata.orientation !== 1) {
        analysis.warnings.push('Image has non-standard orientation');
      }

      // SVG specific checks
      if (analysis.format === 'svg') {
        const content = await fs.readFile(imagePath, 'utf8');

        if (content.includes('<script')) {
          analysis.isSafe = false;
          analysis.threats.push('SVG contains script tags');
        }

        if (content.includes('javascript:') || content.includes('data:')) {
          analysis.isSafe = false;
          analysis.threats.push('SVG contains JavaScript or data URIs');
        }

        if (content.includes('<foreignObject')) {
          analysis.warnings.push('SVG contains foreignObject (potential XSS)');
        }
      }

      AppLogger.info('Image analyzed', {
        imagePath: path.basename(imagePath),
        isValid: analysis.isValid,
        isSafe: analysis.isSafe,
        format: analysis.format,
        dimensions: analysis.dimensions,
        hasExif: analysis.hasExif,
        threatCount: analysis.threats.length,
      });

      return analysis;
    } catch (error) {
      AppLogger.error('Failed to analyze image', error as Error, { imagePath });
      throw new ImageSecurityError(
        'Image analysis failed',
        'ANALYSIS_FAILED',
        { error: (error as Error).message }
      );
    }
  }

  /**
   * Process image with security measures
   */
  async processImage(
    inputPath: string,
    outputPath?: string,
    options?: ImageSecurityOptions
  ): Promise<ProcessingResult> {
    const mergedOptions = { ...this.defaultOptions, ...options };

    const result: ProcessingResult = {
      success: false,
      originalPath: inputPath,
      processedPath: outputPath || inputPath,
      originalSize: 0,
      processedSize: 0,
      compressionRatio: 0,
      metadata: {
        before: {},
        after: {},
      },
      strippedData: {
        exif: false,
        icc: false,
        iptc: false,
        xmp: false,
      },
      warnings: [],
      errors: [],
    };

    try {
      // Get original file size
      const stats = await fs.stat(inputPath);
      result.originalSize = stats.size;

      // Analyze image first
      const analysis = await this.analyzeImage(inputPath);

      if (!analysis.isValid) {
        throw new ImageSecurityError(
          'Invalid image',
          'INVALID_IMAGE',
          { threats: analysis.threats }
        );
      }

      if (!analysis.isSafe && mergedOptions.preventExploits) {
        throw new ImageSecurityError(
          'Image contains security threats',
          'UNSAFE_IMAGE',
          { threats: analysis.threats }
        );
      }

      result.metadata.before = analysis.metadata;
      result.warnings.push(...analysis.warnings);

      // Validate dimensions
      if (mergedOptions.validateDimensions) {
        if (
          analysis.dimensions.width > mergedOptions.maxWidth ||
          analysis.dimensions.height > mergedOptions.maxHeight
        ) {
          result.warnings.push(
            `Image dimensions (${analysis.dimensions.width}x${analysis.dimensions.height}) exceed limits`
          );
        }
      }

      // Validate file size
      if (mergedOptions.validateFileSize) {
        if (result.originalSize > mergedOptions.maxFileSize) {
          throw new ImageSecurityError(
            'Image file size exceeds limit',
            'FILE_TOO_LARGE',
            {
              size: result.originalSize,
              limit: mergedOptions.maxFileSize,
            }
          );
        }
      }

      // Create Sharp pipeline
      let pipeline = sharp(inputPath);

      // Strip metadata
      if (mergedOptions.stripMetadata || mergedOptions.stripExif) {
        pipeline = pipeline.withMetadata({
          exif: {},
          icc: mergedOptions.stripMetadata ? undefined : analysis.metadata.icc,
          iptc: {},
          xmp: {},
        });

        result.strippedData.exif = true;
        result.strippedData.iptc = true;
        result.strippedData.xmp = true;

        if (mergedOptions.stripMetadata) {
          result.strippedData.icc = true;
        }
      }

      // Resize if exceeds dimensions
      if (
        mergedOptions.validateDimensions &&
        (analysis.dimensions.width > mergedOptions.maxWidth ||
          analysis.dimensions.height > mergedOptions.maxHeight)
      ) {
        pipeline = pipeline.resize(mergedOptions.maxWidth, mergedOptions.maxHeight, {
          fit: 'inside',
          withoutEnlargement: true,
        });

        result.warnings.push('Image resized to fit maximum dimensions');
      }

      // Re-encode image
      if (mergedOptions.reEncode) {
        const outputFormat =
          mergedOptions.format === 'original'
            ? (analysis.format as any)
            : mergedOptions.format;

        switch (outputFormat) {
          case 'jpeg':
            pipeline = pipeline.jpeg({
              quality: mergedOptions.quality,
              mozjpeg: true,
            });
            break;
          case 'png':
            pipeline = pipeline.png({
              compressionLevel: 9,
              quality: mergedOptions.quality,
            });
            break;
          case 'webp':
            pipeline = pipeline.webp({
              quality: mergedOptions.quality,
            });
            break;
          case 'avif':
            pipeline = pipeline.avif({
              quality: mergedOptions.quality,
            });
            break;
          default:
            // Keep original format
            break;
        }
      }

      // Determine output path
      const finalOutputPath = outputPath || this.generateOutputPath(inputPath);

      // Process and save
      await pipeline.toFile(finalOutputPath);

      result.processedPath = finalOutputPath;

      // Get processed file size
      const processedStats = await fs.stat(finalOutputPath);
      result.processedSize = processedStats.size;
      result.compressionRatio = result.originalSize / result.processedSize;

      // Get processed metadata
      const processedMetadata = await sharp(finalOutputPath).metadata();
      result.metadata.after = {
        format: processedMetadata.format,
        width: processedMetadata.width,
        height: processedMetadata.height,
        space: processedMetadata.space,
        channels: processedMetadata.channels,
        depth: processedMetadata.depth,
        density: processedMetadata.density,
        hasAlpha: processedMetadata.hasAlpha,
        hasProfile: processedMetadata.hasProfile,
      };

      result.success = true;

      AppLogger.info('Image processed successfully', {
        originalPath: path.basename(inputPath),
        processedPath: path.basename(finalOutputPath),
        originalSize: result.originalSize,
        processedSize: result.processedSize,
        compressionRatio: result.compressionRatio.toFixed(2),
        strippedExif: result.strippedData.exif,
      });

      return result;
    } catch (error) {
      result.errors.push((error as Error).message);
      AppLogger.error('Failed to process image', error as Error, { inputPath });
      throw error;
    }
  }

  /**
   * Strip EXIF data only (quick operation)
   */
  async stripExif(imagePath: string, outputPath?: string): Promise<string> {
    try {
      const finalOutputPath = outputPath || imagePath;

      await sharp(imagePath)
        .withMetadata({
          exif: {},
          iptc: {},
          xmp: {},
        })
        .toFile(finalOutputPath);

      AppLogger.info('EXIF data stripped', {
        imagePath: path.basename(imagePath),
      });

      return finalOutputPath;
    } catch (error) {
      AppLogger.error('Failed to strip EXIF', error as Error, { imagePath });
      throw error;
    }
  }

  /**
   * Sanitize SVG files
   */
  async sanitizeSVG(svgPath: string, outputPath?: string): Promise<string> {
    try {
      let content = await fs.readFile(svgPath, 'utf8');

      // Remove script tags
      content = content.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

      // Remove event handlers
      content = content.replace(/on\w+\s*=\s*["'][^"']*["']/gi, '');

      // Remove javascript: URIs
      content = content.replace(/javascript:[^"']*/gi, '');

      // Remove data: URIs (potential XSS)
      content = content.replace(/data:text\/html[^"']*/gi, '');

      // Remove foreignObject (can embed HTML)
      content = content.replace(/<foreignObject\b[^>]*>[\s\S]*?<\/foreignObject>/gi, '');

      const finalOutputPath = outputPath || svgPath;
      await fs.writeFile(finalOutputPath, content, 'utf8');

      AppLogger.info('SVG sanitized', {
        svgPath: path.basename(svgPath),
      });

      return finalOutputPath;
    } catch (error) {
      AppLogger.error('Failed to sanitize SVG', error as Error, { svgPath });
      throw error;
    }
  }

  /**
   * Generate safe filename for processed image
   */
  private generateOutputPath(inputPath: string): string {
    const dir = path.dirname(inputPath);
    const ext = path.extname(inputPath);
    const base = path.basename(inputPath, ext);
    const hash = crypto.randomBytes(8).toString('hex');

    return path.join(dir, `${base}-processed-${hash}${ext}`);
  }

  /**
   * Check if file is an image
   */
  isImageFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase().substring(1);
    return this.supportedFormats.includes(ext);
  }

  /**
   * Get safe image dimensions
   */
  async getImageDimensions(
    imagePath: string
  ): Promise<{ width: number; height: number }> {
    try {
      const metadata = await sharp(imagePath).metadata();
      return {
        width: metadata.width || 0,
        height: metadata.height || 0,
      };
    } catch (error) {
      throw new ImageSecurityError(
        'Failed to get image dimensions',
        'METADATA_ERROR'
      );
    }
  }

  /**
   * Batch process images
   */
  async batchProcess(
    imagePaths: string[],
    outputDir: string,
    options?: ImageSecurityOptions
  ): Promise<ProcessingResult[]> {
    const results: ProcessingResult[] = [];

    await fs.mkdir(outputDir, { recursive: true });

    for (const imagePath of imagePaths) {
      try {
        const outputPath = path.join(
          outputDir,
          path.basename(imagePath)
        );

        const result = await this.processImage(imagePath, outputPath, options);
        results.push(result);
      } catch (error) {
        AppLogger.error('Batch processing failed for image', error as Error, {
          imagePath,
        });

        results.push({
          success: false,
          originalPath: imagePath,
          processedPath: '',
          originalSize: 0,
          processedSize: 0,
          compressionRatio: 0,
          metadata: { before: {}, after: {} },
          strippedData: { exif: false, icc: false, iptc: false, xmp: false },
          warnings: [],
          errors: [(error as Error).message],
        });
      }
    }

    return results;
  }
}

/**
 * Singleton instance
 */
let imageSecurityUtil: ImageSecurityUtil | null = null;

export function initializeImageSecurityUtil(
  options?: Partial<ImageSecurityOptions>
): ImageSecurityUtil {
  imageSecurityUtil = new ImageSecurityUtil(options);
  return imageSecurityUtil;
}

export function getImageSecurityUtil(): ImageSecurityUtil {
  if (!imageSecurityUtil) {
    throw new Error(
      'ImageSecurityUtil not initialized. Call initializeImageSecurityUtil first.'
    );
  }
  return imageSecurityUtil;
}
