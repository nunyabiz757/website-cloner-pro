import { Request, Response, NextFunction } from 'express';
import {
  getImageSecurityUtil,
  ImageSecurityError,
  ImageSecurityOptions,
} from '../utils/image-security.util.js';
import { AppLogger } from '../services/logger.service.js';
import fs from 'fs/promises';
import path from 'path';

/**
 * Image Security Middleware
 * Automatically scans and processes uploaded images
 */

export interface ImageScanOptions extends ImageSecurityOptions {
  autoProcess?: boolean;
  replaceOriginal?: boolean;
  deleteOnFailure?: boolean;
  blockUnsafe?: boolean;
  requireProcessing?: boolean;
}

/**
 * Scan uploaded image for security threats
 */
export function scanImage(options?: ImageScanOptions) {
  const defaultOptions: ImageScanOptions = {
    stripExif: true,
    stripMetadata: true,
    reEncode: true,
    maxWidth: 4096,
    maxHeight: 4096,
    quality: 85,
    format: 'original',
    validateDimensions: true,
    validateFileSize: true,
    maxFileSize: 10 * 1024 * 1024,
    preventExploits: true,
    autoProcess: true,
    replaceOriginal: false,
    deleteOnFailure: true,
    blockUnsafe: true,
    requireProcessing: false,
  };

  const config = { ...defaultOptions, ...options };

  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      // Check if file was uploaded
      if (!req.file) {
        next();
        return;
      }

      const filePath = req.file.path;
      const imageUtil = getImageSecurityUtil();

      // Check if file is an image
      if (!imageUtil.isImageFile(filePath)) {
        next();
        return;
      }

      AppLogger.info('Scanning uploaded image', {
        userId: req.user?.userId,
        filename: req.file.originalname,
        size: req.file.size,
      });

      // Analyze image
      let analysis;

      try {
        analysis = await imageUtil.analyzeImage(filePath);
      } catch (error) {
        AppLogger.logSecurityEvent('image_scan.analysis_failed', 'high', {
          userId: req.user?.userId,
          filename: req.file.originalname,
          error: (error as Error).message,
        });

        if (config.deleteOnFailure) {
          await fs.unlink(filePath).catch(() => {});
        }

        res.status(400).json({
          success: false,
          error: 'Failed to analyze image',
          details: (error as Error).message,
        });
        return;
      }

      // Check if image is valid
      if (!analysis.isValid) {
        AppLogger.logSecurityEvent('image_scan.invalid_image', 'high', {
          userId: req.user?.userId,
          filename: req.file.originalname,
          threats: analysis.threats,
        });

        if (config.deleteOnFailure) {
          await fs.unlink(filePath).catch(() => {});
        }

        res.status(400).json({
          success: false,
          error: 'Invalid image',
          details: analysis.threats.join('; '),
        });
        return;
      }

      // Check if image is safe
      if (!analysis.isSafe && config.blockUnsafe) {
        AppLogger.logSecurityEvent('image_scan.unsafe_image', 'critical', {
          userId: req.user?.userId,
          filename: req.file.originalname,
          threats: analysis.threats,
        });

        if (config.deleteOnFailure) {
          await fs.unlink(filePath).catch(() => {});
        }

        res.status(400).json({
          success: false,
          error: 'Image contains security threats',
          details: analysis.threats.join('; '),
        });
        return;
      }

      // Auto-process image
      if (config.autoProcess) {
        try {
          const outputPath = config.replaceOriginal
            ? filePath
            : filePath.replace(
                path.extname(filePath),
                `-processed${path.extname(filePath)}`
              );

          const result = await imageUtil.processImage(filePath, outputPath, config);

          // Update request file info
          if (config.replaceOriginal) {
            req.file.size = result.processedSize;
          } else {
            // Store both paths
            (req as any).originalImagePath = filePath;
            (req as any).processedImagePath = outputPath;
            req.file.path = outputPath;
            req.file.size = result.processedSize;
          }

          // Attach processing result to request
          (req as any).imageProcessingResult = result;

          AppLogger.info('Image processed automatically', {
            userId: req.user?.userId,
            filename: req.file.originalname,
            originalSize: result.originalSize,
            processedSize: result.processedSize,
            compressionRatio: result.compressionRatio.toFixed(2),
            strippedExif: result.strippedData.exif,
          });
        } catch (error) {
          AppLogger.error('Image processing failed', error as Error, {
            userId: req.user?.userId,
            filename: req.file.originalname,
          });

          if (config.requireProcessing) {
            if (config.deleteOnFailure) {
              await fs.unlink(filePath).catch(() => {});
            }

            res.status(500).json({
              success: false,
              error: 'Image processing failed',
              details: (error as Error).message,
            });
            return;
          }

          // Continue without processing if not required
          (req as any).imageProcessingError = (error as Error).message;
        }
      }

      // Attach analysis to request
      (req as any).imageAnalysis = analysis;

      AppLogger.info('Image scan passed', {
        userId: req.user?.userId,
        filename: req.file.originalname,
        format: analysis.format,
        dimensions: analysis.dimensions,
        hasExif: analysis.hasExif,
        isSafe: analysis.isSafe,
      });

      next();
    } catch (error) {
      AppLogger.error('Image scan error', error as Error, {
        userId: req.user?.userId,
        filename: req.file?.originalname,
      });

      if (req.file?.path && config.deleteOnFailure) {
        await fs.unlink(req.file.path).catch(() => {});
      }

      res.status(500).json({
        success: false,
        error: 'Image scan failed',
        details: (error as Error).message,
      });
    }
  };
}

/**
 * Strip EXIF data from uploaded image
 */
export function stripExif() {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.file) {
        next();
        return;
      }

      const filePath = req.file.path;
      const imageUtil = getImageSecurityUtil();

      if (!imageUtil.isImageFile(filePath)) {
        next();
        return;
      }

      await imageUtil.stripExif(filePath, filePath);

      AppLogger.info('EXIF data stripped', {
        userId: req.user?.userId,
        filename: req.file.originalname,
      });

      next();
    } catch (error) {
      AppLogger.error('Failed to strip EXIF', error as Error, {
        userId: req.user?.userId,
      });

      // Don't block request on EXIF stripping failure
      next();
    }
  };
}

/**
 * Validate image dimensions
 */
export function validateImageDimensions(maxWidth: number, maxHeight: number) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.file) {
        next();
        return;
      }

      const filePath = req.file.path;
      const imageUtil = getImageSecurityUtil();

      if (!imageUtil.isImageFile(filePath)) {
        next();
        return;
      }

      const dimensions = await imageUtil.getImageDimensions(filePath);

      if (dimensions.width > maxWidth || dimensions.height > maxHeight) {
        AppLogger.logSecurityEvent('image.dimensions_exceeded', 'medium', {
          userId: req.user?.userId,
          filename: req.file.originalname,
          dimensions,
          limits: { maxWidth, maxHeight },
        });

        await fs.unlink(filePath).catch(() => {});

        res.status(400).json({
          success: false,
          error: 'Image dimensions exceed limits',
          details: `Maximum dimensions: ${maxWidth}x${maxHeight}, actual: ${dimensions.width}x${dimensions.height}`,
        });
        return;
      }

      next();
    } catch (error) {
      AppLogger.error('Dimension validation failed', error as Error);

      res.status(500).json({
        success: false,
        error: 'Failed to validate image dimensions',
      });
    }
  };
}

/**
 * Sanitize SVG files
 */
export function sanitizeSVG() {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.file) {
        next();
        return;
      }

      const filePath = req.file.path;

      if (!filePath.toLowerCase().endsWith('.svg')) {
        next();
        return;
      }

      const imageUtil = getImageSecurityUtil();
      await imageUtil.sanitizeSVG(filePath, filePath);

      AppLogger.info('SVG sanitized', {
        userId: req.user?.userId,
        filename: req.file.originalname,
      });

      next();
    } catch (error) {
      AppLogger.error('SVG sanitization failed', error as Error);

      await fs.unlink(req.file.path).catch(() => {});

      res.status(400).json({
        success: false,
        error: 'Failed to sanitize SVG',
        details: (error as Error).message,
      });
    }
  };
}

/**
 * Re-encode image to specific format
 */
export function reencodeImage(format: 'jpeg' | 'png' | 'webp' | 'avif', quality: number = 85) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.file) {
        next();
        return;
      }

      const filePath = req.file.path;
      const imageUtil = getImageSecurityUtil();

      if (!imageUtil.isImageFile(filePath)) {
        next();
        return;
      }

      const outputPath = filePath.replace(
        path.extname(filePath),
        `.${format}`
      );

      await imageUtil.processImage(filePath, outputPath, {
        reEncode: true,
        format,
        quality,
        stripExif: true,
        stripMetadata: true,
      });

      // Update file path
      req.file.path = outputPath;
      req.file.mimetype = `image/${format}`;

      // Update file size
      const stats = await fs.stat(outputPath);
      req.file.size = stats.size;

      // Delete original if different
      if (outputPath !== filePath) {
        await fs.unlink(filePath).catch(() => {});
      }

      AppLogger.info('Image re-encoded', {
        userId: req.user?.userId,
        filename: req.file.originalname,
        format,
      });

      next();
    } catch (error) {
      AppLogger.error('Image re-encoding failed', error as Error);

      res.status(500).json({
        success: false,
        error: 'Failed to re-encode image',
      });
    }
  };
}

/**
 * Check for image exploits
 */
export function checkImageExploits() {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.file) {
        next();
        return;
      }

      const filePath = req.file.path;
      const imageUtil = getImageSecurityUtil();

      if (!imageUtil.isImageFile(filePath)) {
        next();
        return;
      }

      const analysis = await imageUtil.analyzeImage(filePath);

      if (analysis.threats.length > 0) {
        AppLogger.logSecurityEvent('image.exploits_detected', 'critical', {
          userId: req.user?.userId,
          filename: req.file.originalname,
          threats: analysis.threats,
        });

        await fs.unlink(filePath).catch(() => {});

        res.status(400).json({
          success: false,
          error: 'Image contains potential exploits',
          details: analysis.threats.join('; '),
        });
        return;
      }

      next();
    } catch (error) {
      AppLogger.error('Exploit check failed', error as Error);

      res.status(500).json({
        success: false,
        error: 'Failed to check for exploits',
      });
    }
  };
}

/**
 * Log image upload for audit
 */
export function logImageUpload() {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.file) {
        next();
        return;
      }

      const imageUtil = getImageSecurityUtil();

      if (!imageUtil.isImageFile(req.file.path)) {
        next();
        return;
      }

      const analysis = (req as any).imageAnalysis;
      const processingResult = (req as any).imageProcessingResult;

      AppLogger.info('Image upload logged', {
        userId: req.user?.userId,
        filename: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype,
        format: analysis?.format,
        dimensions: analysis?.dimensions,
        hasExif: analysis?.hasExif,
        hasMetadata: analysis?.hasMetadata,
        processed: !!processingResult,
        strippedExif: processingResult?.strippedData?.exif,
        compressionRatio: processingResult?.compressionRatio,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      next();
    } catch (error) {
      // Don't block request on logging failure
      AppLogger.error('Failed to log image upload', error as Error);
      next();
    }
  };
}

/**
 * Resize image if exceeds dimensions
 */
export function resizeImage(maxWidth: number, maxHeight: number, quality: number = 85) {
  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      if (!req.file) {
        next();
        return;
      }

      const filePath = req.file.path;
      const imageUtil = getImageSecurityUtil();

      if (!imageUtil.isImageFile(filePath)) {
        next();
        return;
      }

      const dimensions = await imageUtil.getImageDimensions(filePath);

      if (dimensions.width > maxWidth || dimensions.height > maxHeight) {
        await imageUtil.processImage(filePath, filePath, {
          maxWidth,
          maxHeight,
          quality,
          validateDimensions: true,
          reEncode: true,
        });

        const newStats = await fs.stat(filePath);
        req.file.size = newStats.size;

        AppLogger.info('Image resized', {
          userId: req.user?.userId,
          filename: req.file.originalname,
          originalDimensions: dimensions,
          maxDimensions: { maxWidth, maxHeight },
        });
      }

      next();
    } catch (error) {
      AppLogger.error('Image resize failed', error as Error);

      res.status(500).json({
        success: false,
        error: 'Failed to resize image',
      });
    }
  };
}
