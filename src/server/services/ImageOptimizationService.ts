import sharp from 'sharp';
import * as cheerio from 'cheerio';
import axios from 'axios';
import path from 'path';
import fs from 'fs/promises';
import { URL } from 'url';

interface OptimizationOptions {
  quality?: number; // 1-100
  format?: 'webp' | 'avif' | 'jpeg' | 'png' | 'original';
  resize?: {
    width?: number;
    height?: number;
    fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside';
  };
  progressive?: boolean;
  stripMetadata?: boolean;
  generateResponsive?: boolean; // Generate multiple sizes
  convertToModernFormats?: boolean; // Generate WebP/AVIF versions
  lazyLoad?: boolean;
}

interface ImageResult {
  original: {
    url: string;
    size: number;
    format: string;
    width: number;
    height: number;
  };
  optimized: {
    data: Buffer;
    size: number;
    format: string;
    width: number;
    height: number;
    base64?: string;
  };
  webp?: {
    data: Buffer;
    size: number;
    base64?: string;
  };
  avif?: {
    data: Buffer;
    size: number;
    base64?: string;
  };
  responsive?: Array<{
    width: number;
    data: Buffer;
    size: number;
  }>;
  savings: {
    bytes: number;
    percentage: number;
  };
}

interface BatchResult {
  images: ImageResult[];
  totalOriginalSize: number;
  totalOptimizedSize: number;
  totalSavings: number;
  savingsPercentage: number;
  processedCount: number;
  failedCount: number;
}

export class ImageOptimizationService {
  private tempDir: string;

  constructor() {
    this.tempDir = path.join(process.cwd(), 'temp', 'images');
  }

  /**
   * Optimize single image from URL
   */
  async optimizeImage(
    imageUrl: string,
    options: OptimizationOptions = {}
  ): Promise<ImageResult> {
    const defaults: OptimizationOptions = {
      quality: 85,
      format: 'original',
      progressive: true,
      stripMetadata: true,
      generateResponsive: false,
      convertToModernFormats: true,
      lazyLoad: false,
    };

    const opts = { ...defaults, ...options };

    // Fetch original image
    const { data: imageBuffer, contentType, size: originalSize } =
      await this.fetchImage(imageUrl);

    // Get original metadata
    const image = sharp(imageBuffer);
    const metadata = await image.metadata();

    const original = {
      url: imageUrl,
      size: originalSize,
      format: metadata.format || 'unknown',
      width: metadata.width || 0,
      height: metadata.height || 0,
    };

    // Apply optimizations
    let optimizedImage = sharp(imageBuffer);

    // Resize if requested
    if (opts.resize) {
      optimizedImage = optimizedImage.resize({
        width: opts.resize.width,
        height: opts.resize.height,
        fit: opts.resize.fit || 'cover',
        withoutEnlargement: true,
      });
    }

    // Strip metadata
    if (opts.stripMetadata) {
      optimizedImage = optimizedImage.rotate(); // Auto-orient based on EXIF
    }

    // Convert to target format
    let optimizedBuffer: Buffer;
    let outputFormat = opts.format === 'original' ? metadata.format : opts.format;

    switch (outputFormat) {
      case 'jpeg':
      case 'jpg':
        optimizedBuffer = await optimizedImage
          .jpeg({
            quality: opts.quality,
            progressive: opts.progressive,
            mozjpeg: true,
          })
          .toBuffer();
        break;

      case 'png':
        optimizedBuffer = await optimizedImage
          .png({
            quality: opts.quality,
            compressionLevel: 9,
            progressive: opts.progressive,
          })
          .toBuffer();
        break;

      case 'webp':
        optimizedBuffer = await optimizedImage
          .webp({
            quality: opts.quality,
          })
          .toBuffer();
        break;

      case 'avif':
        optimizedBuffer = await optimizedImage
          .avif({
            quality: opts.quality,
          })
          .toBuffer();
        break;

      default:
        // Keep original format
        if (metadata.format === 'jpeg' || metadata.format === 'jpg') {
          optimizedBuffer = await optimizedImage
            .jpeg({
              quality: opts.quality,
              progressive: opts.progressive,
              mozjpeg: true,
            })
            .toBuffer();
        } else if (metadata.format === 'png') {
          optimizedBuffer = await optimizedImage
            .png({
              quality: opts.quality,
              compressionLevel: 9,
            })
            .toBuffer();
        } else {
          optimizedBuffer = imageBuffer;
        }
    }

    const optimizedMetadata = await sharp(optimizedBuffer).metadata();

    const result: ImageResult = {
      original,
      optimized: {
        data: optimizedBuffer,
        size: optimizedBuffer.length,
        format: outputFormat || metadata.format || 'unknown',
        width: optimizedMetadata.width || 0,
        height: optimizedMetadata.height || 0,
        base64: optimizedBuffer.toString('base64'),
      },
      savings: {
        bytes: originalSize - optimizedBuffer.length,
        percentage: ((originalSize - optimizedBuffer.length) / originalSize) * 100,
      },
    };

    // Generate WebP version
    if (opts.convertToModernFormats) {
      try {
        const webpBuffer = await sharp(imageBuffer)
          .webp({ quality: opts.quality })
          .toBuffer();

        result.webp = {
          data: webpBuffer,
          size: webpBuffer.length,
          base64: webpBuffer.toString('base64'),
        };
      } catch (error) {
        console.error('Failed to generate WebP:', error);
      }

      // Generate AVIF version
      try {
        const avifBuffer = await sharp(imageBuffer)
          .avif({ quality: opts.quality })
          .toBuffer();

        result.avif = {
          data: avifBuffer,
          size: avifBuffer.length,
          base64: avifBuffer.toString('base64'),
        };
      } catch (error) {
        console.error('Failed to generate AVIF:', error);
      }
    }

    // Generate responsive sizes
    if (opts.generateResponsive && metadata.width) {
      const sizes = [320, 640, 768, 1024, 1280, 1920];
      const responsiveImages = [];

      for (const width of sizes) {
        if (width < metadata.width) {
          const resizedBuffer = await sharp(imageBuffer)
            .resize({ width, withoutEnlargement: true })
            .jpeg({ quality: opts.quality, progressive: true })
            .toBuffer();

          responsiveImages.push({
            width,
            data: resizedBuffer,
            size: resizedBuffer.length,
          });
        }
      }

      result.responsive = responsiveImages;
    }

    return result;
  }

  /**
   * Optimize all images in HTML
   */
  async optimizeHtmlImages(
    htmlContent: string,
    baseUrl: string,
    options: OptimizationOptions = {}
  ): Promise<{
    optimizedHtml: string;
    results: BatchResult;
  }> {
    const $ = cheerio.load(htmlContent);
    const images: ImageResult[] = [];
    let processedCount = 0;
    let failedCount = 0;

    // Find all img tags
    const imgTags = $('img[src]').toArray();

    for (const imgTag of imgTags) {
      const $img = $(imgTag);
      const src = $img.attr('src');

      if (!src || src.startsWith('data:')) {
        continue; // Skip data URLs
      }

      try {
        const absoluteUrl = this.resolveUrl(src, baseUrl);
        const result = await this.optimizeImage(absoluteUrl, options);

        images.push(result);
        processedCount++;

        // Update img tag with optimized image
        if (options.convertToModernFormats && result.webp && result.avif) {
          // Create picture element with modern formats
          const $picture = $('<picture>');

          // AVIF source (smallest, best compression)
          $picture.append(
            `<source srcset="data:image/avif;base64,${result.avif.base64}" type="image/avif">`
          );

          // WebP source (good compression, wide support)
          $picture.append(
            `<source srcset="data:image/webp;base64,${result.webp.base64}" type="image/webp">`
          );

          // Original format as fallback
          $img.attr('src', `data:image/${result.optimized.format};base64,${result.optimized.base64}`);
          $img.attr('data-original-src', src);

          // Add loading attribute
          if (options.lazyLoad) {
            $img.attr('loading', 'lazy');
            $img.attr('decoding', 'async');
          }

          // Add dimensions to prevent layout shift
          if (result.optimized.width && result.optimized.height) {
            $img.attr('width', result.optimized.width.toString());
            $img.attr('height', result.optimized.height.toString());
          }

          $picture.append($img.clone());
          $img.replaceWith($picture);
        } else {
          // Just replace src with optimized version
          $img.attr('src', `data:image/${result.optimized.format};base64,${result.optimized.base64}`);
          $img.attr('data-original-src', src);

          if (options.lazyLoad) {
            $img.attr('loading', 'lazy');
            $img.attr('decoding', 'async');
          }

          if (result.optimized.width && result.optimized.height) {
            $img.attr('width', result.optimized.width.toString());
            $img.attr('height', result.optimized.height.toString());
          }
        }

        // Add responsive srcset if generated
        if (result.responsive && result.responsive.length > 0) {
          const srcset = result.responsive
            .map((resp) => `data:image/jpeg;base64,${resp.data.toString('base64')} ${resp.width}w`)
            .join(', ');
          $img.attr('srcset', srcset);
          $img.attr('sizes', '(max-width: 768px) 100vw, 50vw');
        }
      } catch (error) {
        console.error(`Failed to optimize image ${src}:`, error);
        failedCount++;
      }
    }

    // Process background images in style attributes
    const elementsWithBg = $('[style*="background"]').toArray();
    for (const element of elementsWithBg) {
      const $el = $(element);
      const style = $el.attr('style') || '';
      const urlMatches = style.match(/url\(['"]?([^'"()]+)['"]?\)/g);

      if (urlMatches) {
        let updatedStyle = style;

        for (const match of urlMatches) {
          const urlMatch = match.match(/url\(['"]?([^'"()]+)['"]?\)/);
          if (urlMatch && urlMatch[1] && !urlMatch[1].startsWith('data:')) {
            try {
              const absoluteUrl = this.resolveUrl(urlMatch[1], baseUrl);
              const result = await this.optimizeImage(absoluteUrl, {
                ...options,
                convertToModernFormats: false, // Can't use picture in backgrounds
              });

              images.push(result);
              processedCount++;

              const dataUrl = `data:image/${result.optimized.format};base64,${result.optimized.base64}`;
              updatedStyle = updatedStyle.replace(urlMatch[1], dataUrl);
            } catch (error) {
              console.error(`Failed to optimize background image:`, error);
              failedCount++;
            }
          }
        }

        $el.attr('style', updatedStyle);
      }
    }

    const totalOriginalSize = images.reduce((sum, img) => sum + img.original.size, 0);
    const totalOptimizedSize = images.reduce((sum, img) => sum + img.optimized.size, 0);
    const totalSavings = totalOriginalSize - totalOptimizedSize;
    const savingsPercentage = totalOriginalSize > 0
      ? (totalSavings / totalOriginalSize) * 100
      : 0;

    return {
      optimizedHtml: $.html(),
      results: {
        images,
        totalOriginalSize,
        totalOptimizedSize,
        totalSavings,
        savingsPercentage,
        processedCount,
        failedCount,
      },
    };
  }

  /**
   * Get optimization recommendations
   */
  async analyzeImages(
    htmlContent: string,
    baseUrl: string
  ): Promise<{
    totalImages: number;
    oversizedImages: number;
    unoptimizedFormats: number;
    missingDimensions: number;
    totalSize: number;
    recommendations: string[];
  }> {
    const $ = cheerio.load(htmlContent);
    let totalImages = 0;
    let oversizedImages = 0;
    let unoptimizedFormats = 0;
    let missingDimensions = 0;
    let totalSize = 0;
    const recommendations: string[] = [];

    const imgTags = $('img[src]').toArray();

    for (const imgTag of imgTags) {
      const $img = $(imgTag);
      const src = $img.attr('src');

      if (!src || src.startsWith('data:')) continue;

      totalImages++;

      try {
        const absoluteUrl = this.resolveUrl(src, baseUrl);
        const { size, contentType } = await this.fetchImageMetadata(absoluteUrl);

        totalSize += size;

        // Check for oversized images (>500KB)
        if (size > 500 * 1024) {
          oversizedImages++;
        }

        // Check for unoptimized formats
        if (contentType.includes('png') || contentType.includes('bmp')) {
          unoptimizedFormats++;
        }

        // Check for missing dimensions
        if (!$img.attr('width') || !$img.attr('height')) {
          missingDimensions++;
        }
      } catch (error) {
        console.error(`Failed to analyze image ${src}:`, error);
      }
    }

    if (oversizedImages > 0) {
      recommendations.push(
        `${oversizedImages} image(s) are larger than 500KB. Consider compressing them.`
      );
    }

    if (unoptimizedFormats > 0) {
      recommendations.push(
        `${unoptimizedFormats} image(s) use PNG format. Consider converting to WebP or AVIF.`
      );
    }

    if (missingDimensions > 0) {
      recommendations.push(
        `${missingDimensions} image(s) are missing width/height attributes, which can cause layout shift.`
      );
    }

    if (totalImages > 20) {
      recommendations.push(
        `High image count (${totalImages}). Consider lazy loading for offscreen images.`
      );
    }

    const avgSize = totalSize / totalImages;
    if (avgSize > 200 * 1024) {
      recommendations.push(
        `Average image size is ${this.formatBytes(avgSize)}. Consider reducing quality or dimensions.`
      );
    }

    return {
      totalImages,
      oversizedImages,
      unoptimizedFormats,
      missingDimensions,
      totalSize,
      recommendations,
    };
  }

  /**
   * Fetch image from URL
   */
  private async fetchImage(url: string): Promise<{
    data: Buffer;
    contentType: string;
    size: number;
  }> {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    const data = Buffer.from(response.data);
    const contentType = response.headers['content-type'] || 'image/jpeg';

    return {
      data,
      contentType,
      size: data.length,
    };
  }

  /**
   * Fetch image metadata without downloading full image
   */
  private async fetchImageMetadata(url: string): Promise<{
    size: number;
    contentType: string;
  }> {
    const response = await axios.head(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      },
    });

    const size = parseInt(response.headers['content-length'] || '0', 10);
    const contentType = response.headers['content-type'] || 'image/jpeg';

    return { size, contentType };
  }

  /**
   * Resolve relative URL to absolute
   */
  private resolveUrl(url: string, baseUrl: string): string {
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('//')) {
      return url.startsWith('//') ? `https:${url}` : url;
    }

    try {
      const resolved = new URL(url, baseUrl);
      return resolved.href;
    } catch (error) {
      console.error(`Failed to resolve URL ${url} with base ${baseUrl}:`, error);
      return url;
    }
  }

  /**
   * Format bytes to human-readable string
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  }
}
