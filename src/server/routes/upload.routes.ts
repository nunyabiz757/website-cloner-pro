import express, { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import { getArchiveUtil } from '../utils/archive.util.js';
import { authenticateJWT } from '../middleware/auth.middleware.js';
import { AppLogger } from '../services/logger.service.js';
import { z } from 'zod';

/**
 * Upload Routes
 * Handles secure file uploads with archive validation
 */

const router = express.Router();

// Upload configuration
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB
const ALLOWED_MIME_TYPES = [
  'application/zip',
  'application/x-zip-compressed',
  'application/x-tar',
  'application/gzip',
  'application/x-gzip',
];

// Multer configuration
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const userDir = path.join(UPLOAD_DIR, req.user?.userId || 'anonymous');
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
    // Check MIME type
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
const uploadOptionsSchema = z.object({
  analyze: z.boolean().optional().default(false),
  extract: z.boolean().optional().default(false),
  maxTotalSize: z.number().optional(),
  maxFileSize: z.number().optional(),
  maxFiles: z.number().optional(),
  allowedExtensions: z.array(z.string()).optional(),
});

/**
 * POST /api/upload/archive
 * Upload and optionally analyze/extract archive
 */
router.post(
  '/archive',
  authenticateJWT,
  upload.single('file'),
  async (req: Request, res: Response): Promise<void> => {
    const startTime = Date.now();

    try {
      if (!req.file) {
        res.status(400).json({
          success: false,
          error: 'No file uploaded',
        });
        return;
      }

      // Parse options
      const options = uploadOptionsSchema.parse(
        req.body.options ? JSON.parse(req.body.options) : {}
      );

      const filePath = req.file.path;
      const archiveUtil = getArchiveUtil();

      AppLogger.info('Archive uploaded', {
        userId: req.user?.userId,
        filename: req.file.originalname,
        size: req.file.size,
        path: filePath,
      });

      let analysisResult = null;
      let extractionResult = null;

      // Analyze archive
      if (options.analyze || options.extract) {
        try {
          analysisResult = await archiveUtil.analyzeArchive(filePath);

          if (analysisResult.isSuspicious) {
            AppLogger.logSecurityEvent('upload.suspicious_archive', 'medium', {
              userId: req.user?.userId,
              filename: req.file.originalname,
              warnings: analysisResult.warnings,
              compressionRatio: analysisResult.compressionRatio,
            });
          }
        } catch (error) {
          // Delete uploaded file
          await fs.unlink(filePath).catch(() => {});

          res.status(400).json({
            success: false,
            error: 'Failed to analyze archive',
            details: (error as Error).message,
          });
          return;
        }
      }

      // Extract archive
      if (options.extract) {
        const extractPath = path.join(
          path.dirname(filePath),
          path.basename(filePath, path.extname(filePath))
        );

        try {
          extractionResult = await archiveUtil.extractArchive(filePath, {
            extractPath,
            maxTotalSize: options.maxTotalSize,
            maxFileSize: options.maxFileSize,
            maxFiles: options.maxFiles,
            allowedExtensions: options.allowedExtensions,
            overwrite: false,
            validatePaths: true,
          });

          AppLogger.info('Archive extracted', {
            userId: req.user?.userId,
            filename: req.file.originalname,
            extractPath,
            filesExtracted: extractionResult.extractedFiles.length,
            totalSize: extractionResult.totalSize,
          });
        } catch (error) {
          // Delete uploaded file and any extracted files
          await fs.unlink(filePath).catch(() => {});

          res.status(400).json({
            success: false,
            error: 'Failed to extract archive',
            details: (error as Error).message,
          });
          return;
        }
      }

      const duration = Date.now() - startTime;

      res.json({
        success: true,
        file: {
          filename: req.file.originalname,
          path: filePath,
          size: req.file.size,
          mimetype: req.file.mimetype,
        },
        analysis: analysisResult,
        extraction: extractionResult,
        durationMs: duration,
      });
    } catch (error) {
      AppLogger.error('Upload failed', error as Error, {
        userId: req.user?.userId,
      });

      // Cleanup on error
      if (req.file?.path) {
        await fs.unlink(req.file.path).catch(() => {});
      }

      res.status(500).json({
        success: false,
        error: 'Upload failed',
        details: (error as Error).message,
      });
    }
  }
);

/**
 * POST /api/upload/analyze
 * Analyze existing archive file
 */
router.post(
  '/analyze',
  authenticateJWT,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { filePath } = req.body;

      if (!filePath) {
        res.status(400).json({
          success: false,
          error: 'filePath is required',
        });
        return;
      }

      // Validate path (must be within user's upload directory)
      const userDir = path.join(UPLOAD_DIR, req.user?.userId || 'anonymous');
      const resolvedPath = path.resolve(filePath);

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
          error: 'File not found',
        });
        return;
      }

      const archiveUtil = getArchiveUtil();
      const analysisResult = await archiveUtil.analyzeArchive(resolvedPath);

      res.json({
        success: true,
        analysis: analysisResult,
      });
    } catch (error) {
      AppLogger.error('Analysis failed', error as Error, {
        userId: req.user?.userId,
      });

      res.status(500).json({
        success: false,
        error: 'Analysis failed',
        details: (error as Error).message,
      });
    }
  }
);

/**
 * POST /api/upload/extract
 * Extract existing archive file
 */
router.post(
  '/extract',
  authenticateJWT,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { filePath, options } = req.body;

      if (!filePath) {
        res.status(400).json({
          success: false,
          error: 'filePath is required',
        });
        return;
      }

      // Validate path
      const userDir = path.join(UPLOAD_DIR, req.user?.userId || 'anonymous');
      const resolvedPath = path.resolve(filePath);

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
          error: 'File not found',
        });
        return;
      }

      const archiveUtil = getArchiveUtil();
      const extractPath = path.join(
        path.dirname(resolvedPath),
        path.basename(resolvedPath, path.extname(resolvedPath))
      );

      const extractionResult = await archiveUtil.extractArchive(resolvedPath, {
        extractPath,
        ...options,
        validatePaths: true,
      });

      res.json({
        success: true,
        extraction: extractionResult,
      });
    } catch (error) {
      AppLogger.error('Extraction failed', error as Error, {
        userId: req.user?.userId,
      });

      res.status(500).json({
        success: false,
        error: 'Extraction failed',
        details: (error as Error).message,
      });
    }
  }
);

/**
 * GET /api/upload/files
 * List uploaded files for current user
 */
router.get(
  '/files',
  authenticateJWT,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userDir = path.join(UPLOAD_DIR, req.user?.userId || 'anonymous');

      // Check directory exists
      try {
        await fs.access(userDir);
      } catch {
        res.json({
          success: true,
          files: [],
        });
        return;
      }

      const entries = await fs.readdir(userDir, { withFileTypes: true });
      const files = [];

      for (const entry of entries) {
        if (entry.isFile()) {
          const filePath = path.join(userDir, entry.name);
          const stats = await fs.stat(filePath);

          files.push({
            name: entry.name,
            path: filePath,
            size: stats.size,
            created: stats.birthtime,
            modified: stats.mtime,
          });
        }
      }

      res.json({
        success: true,
        files,
      });
    } catch (error) {
      AppLogger.error('Failed to list files', error as Error, {
        userId: req.user?.userId,
      });

      res.status(500).json({
        success: false,
        error: 'Failed to list files',
      });
    }
  }
);

/**
 * DELETE /api/upload/file
 * Delete uploaded file
 */
router.delete(
  '/file',
  authenticateJWT,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { filePath } = req.body;

      if (!filePath) {
        res.status(400).json({
          success: false,
          error: 'filePath is required',
        });
        return;
      }

      // Validate path
      const userDir = path.join(UPLOAD_DIR, req.user?.userId || 'anonymous');
      const resolvedPath = path.resolve(filePath);

      if (!resolvedPath.startsWith(userDir)) {
        res.status(403).json({
          success: false,
          error: 'Access denied',
        });
        return;
      }

      await fs.unlink(resolvedPath);

      AppLogger.info('File deleted', {
        userId: req.user?.userId,
        filePath: resolvedPath,
      });

      res.json({
        success: true,
        message: 'File deleted successfully',
      });
    } catch (error) {
      AppLogger.error('Failed to delete file', error as Error, {
        userId: req.user?.userId,
      });

      res.status(500).json({
        success: false,
        error: 'Failed to delete file',
      });
    }
  }
);

/**
 * GET /api/upload/quota
 * Get user's upload quota and usage
 */
router.get(
  '/quota',
  authenticateJWT,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userDir = path.join(UPLOAD_DIR, req.user?.userId || 'anonymous');
      const quota = 1024 * 1024 * 1024; // 1 GB per user

      let used = 0;
      let fileCount = 0;

      try {
        await fs.access(userDir);

        const entries = await fs.readdir(userDir, { withFileTypes: true });

        for (const entry of entries) {
          if (entry.isFile()) {
            const filePath = path.join(userDir, entry.name);
            const stats = await fs.stat(filePath);
            used += stats.size;
            fileCount++;
          }
        }
      } catch {
        // Directory doesn't exist, usage is 0
      }

      res.json({
        success: true,
        quota: {
          total: quota,
          used,
          available: quota - used,
          percentage: (used / quota) * 100,
          fileCount,
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

/**
 * Error handler for multer
 */
router.use((err: any, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({
        success: false,
        error: `File too large. Maximum size: ${MAX_FILE_SIZE / 1024 / 1024} MB`,
      });
      return;
    }

    res.status(400).json({
      success: false,
      error: err.message,
    });
    return;
  }

  if (err) {
    res.status(400).json({
      success: false,
      error: err.message,
    });
    return;
  }

  next();
});

export default router;
