import express, { Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import { getImageSecurityUtil } from '../utils/image-security.util.js';
import { authenticateJWT } from '../middleware/auth.middleware.js';
import { AppLogger } from '../services/logger.service.js';
import { z } from 'zod';

/**
 * Image Processing Routes
 * Handles secure image uploads with EXIF stripping and re-encoding
 */

const router = express.Router();

// Upload configuration
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/svg+xml',
];

// Multer configuration
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const userDir = path.join(UPLOAD_DIR, 'images', req.user?.userId || 'anonymous');
    await fs.mkdir(userDir, { recursive: true });
    cb(null, userDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = crypto.randomBytes(16).toString('hex');
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1,
  },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      return cb(
        new Error(
          `Invalid file type. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`
        )
      );
    }
    cb(null, true);
  },
});

// Validation schemas
const processOptionsSchema = z.object({
  stripExif: z.boolean().optional().default(true),
  stripMetadata: z.boolean().optional().default(true),
  reEncode: z.boolean().optional().default(true),
  format: z.enum(['jpeg', 'png', 'webp', 'avif', 'original']).optional().default('original'),
  quality: z.number().min(1).max(100).optional().default(85),
  maxWidth: z.number().optional(),
  maxHeight: z.number().optional(),
});

/**
 * POST /api/images/upload
 * Upload and process image with security measures
 */
router.post(
  '/upload',
  authenticateJWT,
  upload.single('image'),
  async (req: Request, res: Response): Promise<void> => {
    const startTime = Date.now();

    try {
      if (!req.file) {
        res.status(400).json({
          success: false,
          error: 'No image uploaded',
        });
        return;
      }

      const filePath = req.file.path;
      const imageUtil = getImageSecurityUtil();

      // Parse options
      const options = processOptionsSchema.parse(
        req.body.options ? JSON.parse(req.body.options) : {}
      );

      AppLogger.info('Image uploaded', {
        userId: req.user?.userId,
        filename: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype,
      });

      // Analyze image
      const analysis = await imageUtil.analyzeImage(filePath);

      if (!analysis.isValid) {
        await fs.unlink(filePath).catch(() => {});

        res.status(400).json({
          success: false,
          error: 'Invalid image',
          details: analysis.threats,
        });
        return;
      }

      if (!analysis.isSafe) {
        AppLogger.logSecurityEvent('image.unsafe_upload', 'high', {
          userId: req.user?.userId,
          filename: req.file.originalname,
          threats: analysis.threats,
        });

        await fs.unlink(filePath).catch(() => {});

        res.status(400).json({
          success: false,
          error: 'Image contains security threats',
          details: analysis.threats,
        });
        return;
      }

      // Process image
      const processedPath = filePath.replace(
        path.extname(filePath),
        options.format !== 'original'
          ? `-processed.${options.format}`
          : `-processed${path.extname(filePath)}`
      );

      const result = await imageUtil.processImage(filePath, processedPath, {
        stripExif: options.stripExif,
        stripMetadata: options.stripMetadata,
        reEncode: options.reEncode,
        format: options.format,
        quality: options.quality,
        maxWidth: options.maxWidth,
        maxHeight: options.maxHeight,
        validateDimensions: true,
        preventExploits: true,
      });

      // Delete original if processing succeeded
      if (result.success && processedPath !== filePath) {
        await fs.unlink(filePath).catch(() => {});
      }

      const duration = Date.now() - startTime;

      res.json({
        success: true,
        image: {
          filename: path.basename(processedPath),
          path: processedPath,
          url: `/uploads/images/${req.user?.userId}/${path.basename(processedPath)}`,
          size: result.processedSize,
          format: result.metadata.after.format,
          dimensions: {
            width: result.metadata.after.width,
            height: result.metadata.after.height,
          },
        },
        processing: {
          originalSize: result.originalSize,
          processedSize: result.processedSize,
          compressionRatio: result.compressionRatio.toFixed(2),
          strippedExif: result.strippedData.exif,
          strippedMetadata: result.strippedData.icc,
          warnings: result.warnings,
        },
        analysis: {
          format: analysis.format,
          originalDimensions: analysis.dimensions,
          hasExif: analysis.hasExif,
          hasMetadata: analysis.hasMetadata,
        },
        durationMs: duration,
      });
    } catch (error) {
      AppLogger.error('Image upload failed', error as Error, {
        userId: req.user?.userId,
      });

      if (req.file?.path) {
        await fs.unlink(req.file.path).catch(() => {});
      }

      res.status(500).json({
        success: false,
        error: 'Image upload failed',
        details: (error as Error).message,
      });
    }
  }
);

/**
 * POST /api/images/process
 * Process existing image
 */
router.post(
  '/process',
  authenticateJWT,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { imagePath, options } = req.body;

      if (!imagePath) {
        res.status(400).json({
          success: false,
          error: 'imagePath is required',
        });
        return;
      }

      // Validate path
      const userDir = path.join(UPLOAD_DIR, 'images', req.user?.userId || 'anonymous');
      const resolvedPath = path.resolve(imagePath);

      if (!resolvedPath.startsWith(userDir)) {
        res.status(403).json({
          success: false,
          error: 'Access denied',
        });
        return;
      }

      // Check file exists
      try {
        await fs.access(resolvedPath);
      } catch {
        res.status(404).json({
          success: false,
          error: 'Image not found',
        });
        return;
      }

      const imageUtil = getImageSecurityUtil();
      const processedOptions = processOptionsSchema.parse(options || {});

      const outputPath = resolvedPath.replace(
        path.extname(resolvedPath),
        `-processed${path.extname(resolvedPath)}`
      );

      const result = await imageUtil.processImage(
        resolvedPath,
        outputPath,
        processedOptions
      );

      res.json({
        success: true,
        result,
      });
    } catch (error) {
      AppLogger.error('Image processing failed', error as Error, {
        userId: req.user?.userId,
      });

      res.status(500).json({
        success: false,
        error: 'Image processing failed',
        details: (error as Error).message,
      });
    }
  }
);

/**
 * POST /api/images/strip-exif
 * Strip EXIF from existing image
 */
router.post(
  '/strip-exif',
  authenticateJWT,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { imagePath } = req.body;

      if (!imagePath) {
        res.status(400).json({
          success: false,
          error: 'imagePath is required',
        });
        return;
      }

      // Validate path
      const userDir = path.join(UPLOAD_DIR, 'images', req.user?.userId || 'anonymous');
      const resolvedPath = path.resolve(imagePath);

      if (!resolvedPath.startsWith(userDir)) {
        res.status(403).json({
          success: false,
          error: 'Access denied',
        });
        return;
      }

      const imageUtil = getImageSecurityUtil();
      await imageUtil.stripExif(resolvedPath);

      res.json({
        success: true,
        message: 'EXIF data stripped successfully',
      });
    } catch (error) {
      AppLogger.error('EXIF stripping failed', error as Error, {
        userId: req.user?.userId,
      });

      res.status(500).json({
        success: false,
        error: 'EXIF stripping failed',
      });
    }
  }
);

/**
 * POST /api/images/analyze
 * Analyze image for security threats
 */
router.post(
  '/analyze',
  authenticateJWT,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { imagePath } = req.body;

      if (!imagePath) {
        res.status(400).json({
          success: false,
          error: 'imagePath is required',
        });
        return;
      }

      // Validate path
      const userDir = path.join(UPLOAD_DIR, 'images', req.user?.userId || 'anonymous');
      const resolvedPath = path.resolve(imagePath);

      if (!resolvedPath.startsWith(userDir)) {
        res.status(403).json({
          success: false,
          error: 'Access denied',
        });
        return;
      }

      const imageUtil = getImageSecurityUtil();
      const analysis = await imageUtil.analyzeImage(resolvedPath);

      res.json({
        success: true,
        analysis,
      });
    } catch (error) {
      AppLogger.error('Image analysis failed', error as Error, {
        userId: req.user?.userId,
      });

      res.status(500).json({
        success: false,
        error: 'Image analysis failed',
      });
    }
  }
);

/**
 * POST /api/images/batch-process
 * Process multiple images
 */
router.post(
  '/batch-process',
  authenticateJWT,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { imagePaths, options } = req.body;

      if (!imagePaths || !Array.isArray(imagePaths)) {
        res.status(400).json({
          success: false,
          error: 'imagePaths array is required',
        });
        return;
      }

      // Validate all paths
      const userDir = path.join(UPLOAD_DIR, 'images', req.user?.userId || 'anonymous');

      for (const imagePath of imagePaths) {
        const resolvedPath = path.resolve(imagePath);

        if (!resolvedPath.startsWith(userDir)) {
          res.status(403).json({
            success: false,
            error: 'Access denied',
          });
          return;
        }
      }

      const imageUtil = getImageSecurityUtil();
      const processedOptions = processOptionsSchema.parse(options || {});

      const outputDir = path.join(userDir, 'processed');
      const results = await imageUtil.batchProcess(
        imagePaths,
        outputDir,
        processedOptions
      );

      res.json({
        success: true,
        results,
        summary: {
          total: results.length,
          successful: results.filter((r) => r.success).length,
          failed: results.filter((r) => !r.success).length,
        },
      });
    } catch (error) {
      AppLogger.error('Batch processing failed', error as Error, {
        userId: req.user?.userId,
      });

      res.status(500).json({
        success: false,
        error: 'Batch processing failed',
      });
    }
  }
);

/**
 * GET /api/images/list
 * List user's uploaded images
 */
router.get(
  '/list',
  authenticateJWT,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userDir = path.join(UPLOAD_DIR, 'images', req.user?.userId || 'anonymous');

      try {
        await fs.access(userDir);
      } catch {
        res.json({
          success: true,
          images: [],
        });
        return;
      }

      const entries = await fs.readdir(userDir, { withFileTypes: true });
      const images = [];

      for (const entry of entries) {
        if (entry.isFile()) {
          const filePath = path.join(userDir, entry.name);
          const stats = await fs.stat(filePath);
          const ext = path.extname(entry.name).toLowerCase();

          if (['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg'].includes(ext)) {
            images.push({
              name: entry.name,
              path: filePath,
              url: `/uploads/images/${req.user?.userId}/${entry.name}`,
              size: stats.size,
              created: stats.birthtime,
              modified: stats.mtime,
            });
          }
        }
      }

      res.json({
        success: true,
        images,
      });
    } catch (error) {
      AppLogger.error('Failed to list images', error as Error, {
        userId: req.user?.userId,
      });

      res.status(500).json({
        success: false,
        error: 'Failed to list images',
      });
    }
  }
);

/**
 * DELETE /api/images/:filename
 * Delete image
 */
router.delete(
  '/:filename',
  authenticateJWT,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { filename } = req.params;

      if (!filename) {
        res.status(400).json({
          success: false,
          error: 'filename is required',
        });
        return;
      }

      const userDir = path.join(UPLOAD_DIR, 'images', req.user?.userId || 'anonymous');
      const filePath = path.join(userDir, filename);

      // Validate path
      if (!filePath.startsWith(userDir)) {
        res.status(403).json({
          success: false,
          error: 'Access denied',
        });
        return;
      }

      await fs.unlink(filePath);

      AppLogger.info('Image deleted', {
        userId: req.user?.userId,
        filename,
      });

      res.json({
        success: true,
        message: 'Image deleted successfully',
      });
    } catch (error) {
      AppLogger.error('Failed to delete image', error as Error, {
        userId: req.user?.userId,
      });

      res.status(500).json({
        success: false,
        error: 'Failed to delete image',
      });
    }
  }
);

/**
 * GET /api/images/quota
 * Get user's image storage quota
 */
router.get(
  '/quota',
  authenticateJWT,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userDir = path.join(UPLOAD_DIR, 'images', req.user?.userId || 'anonymous');
      const quota = 500 * 1024 * 1024; // 500 MB per user

      let used = 0;
      let imageCount = 0;

      try {
        await fs.access(userDir);

        const entries = await fs.readdir(userDir, { withFileTypes: true });

        for (const entry of entries) {
          if (entry.isFile()) {
            const filePath = path.join(userDir, entry.name);
            const stats = await fs.stat(filePath);
            used += stats.size;
            imageCount++;
          }
        }
      } catch {
        // Directory doesn't exist
      }

      res.json({
        success: true,
        quota: {
          total: quota,
          used,
          available: quota - used,
          percentage: (used / quota) * 100,
          imageCount,
        },
      });
    } catch (error) {
      AppLogger.error('Failed to get quota', error as Error, {
        userId: req.user?.userId,
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get quota',
      });
    }
  }
);

export default router;
