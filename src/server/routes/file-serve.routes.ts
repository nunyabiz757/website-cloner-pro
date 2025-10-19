import express, { Request, Response } from 'express';
import { Pool } from 'pg';
import path from 'path';
import fs from 'fs/promises';
import { getPreSignedUrlUtil, validateFilePath, generateContentDisposition } from '../utils/presigned-url.util.js';
import { getFileAccessService, initializeFileAccessService } from '../services/file-access.service.js';
import { AppLogger } from '../services/logger.service.js';
import { authenticateJWT } from '../middleware/auth.middleware.js';
import { z } from 'zod';
import { validateRequest } from '../middleware/validation.middleware.js';
import mime from 'mime-types';

const router = express.Router();

// Initialize database pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Initialize file access service
const fileAccessService = initializeFileAccessService(pool);

/**
 * Secure File Serving Routes
 * Serves files with pre-signed URL validation
 */

/**
 * @route GET /api/files/:token
 * @desc Serve file with pre-signed URL token
 * @access Public (with valid token)
 */
router.get('/:token', async (req: Request, res: Response): Promise<void> => {
  const startTime = Date.now();
  const { token } = req.params;

  try {
    const preSignedUtil = getPreSignedUrlUtil();

    // Validate token
    const payload = preSignedUtil.validateToken(token, {
      ipAddress: req.ip || req.socket.remoteAddress,
      userId: req.user && 'userId' in req.user ? req.user.userId : undefined,
    });

    if (!payload) {
      await fileAccessService.logAccess({
        filePath: 'unknown',
        accessGranted: false,
        denialReason: 'Invalid or expired token',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        method: req.method,
        statusCode: 403,
        durationMs: Date.now() - startTime,
      });

      res.status(403).json({
        success: false,
        error: 'Invalid or expired access token',
        code: 'INVALID_TOKEN',
      });
      return;
    }

    // Validate file path for security
    if (!validateFilePath(payload.filePath)) {
      AppLogger.logSecurityEvent('file_serve.path_traversal_attempt', 'high', {
        filePath: payload.filePath,
        ip: req.ip,
        token: token.substring(0, 20) + '...',
      });

      await fileAccessService.logAccess({
        filePath: payload.filePath,
        accessGranted: false,
        denialReason: 'Invalid file path - security violation',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        method: req.method,
        statusCode: 403,
        durationMs: Date.now() - startTime,
      });

      res.status(403).json({
        success: false,
        error: 'Invalid file path',
        code: 'INVALID_PATH',
      });
      return;
    }

    // Check download limit if specified
    if (payload.maxDownloads !== undefined) {
      const canDownload = await fileAccessService.checkDownloadLimit(token);

      if (!canDownload) {
        await fileAccessService.logAccess({
          filePath: payload.filePath,
          accessGranted: false,
          denialReason: 'Download limit exceeded',
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          method: req.method,
          statusCode: 429,
          durationMs: Date.now() - startTime,
        });

        res.status(429).json({
          success: false,
          error: 'Download limit exceeded',
          code: 'DOWNLOAD_LIMIT_EXCEEDED',
        });
        return;
      }
    }

    // Resolve file path (ensure it's within allowed directory)
    const uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
    const resolvedPath = path.resolve(uploadDir, payload.filePath.replace(/^\//, ''));

    // Verify file is within upload directory (prevent directory traversal)
    if (!resolvedPath.startsWith(uploadDir)) {
      AppLogger.logSecurityEvent('file_serve.directory_traversal_attempt', 'critical', {
        requestedPath: payload.filePath,
        resolvedPath,
        uploadDir,
        ip: req.ip,
      });

      await fileAccessService.logAccess({
        filePath: payload.filePath,
        accessGranted: false,
        denialReason: 'Directory traversal attempt blocked',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        method: req.method,
        statusCode: 403,
        durationMs: Date.now() - startTime,
      });

      res.status(403).json({
        success: false,
        error: 'Access denied',
        code: 'ACCESS_DENIED',
      });
      return;
    }

    // Check if file exists
    try {
      await fs.access(resolvedPath);
    } catch {
      await fileAccessService.logAccess({
        filePath: payload.filePath,
        accessGranted: false,
        denialReason: 'File not found',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        method: req.method,
        statusCode: 404,
        durationMs: Date.now() - startTime,
      });

      res.status(404).json({
        success: false,
        error: 'File not found',
        code: 'FILE_NOT_FOUND',
      });
      return;
    }

    // Get file stats
    const stats = await fs.stat(resolvedPath);
    const fileSize = stats.size;

    // Determine content type
    const contentType = payload.contentType || mime.lookup(resolvedPath) || 'application/octet-stream';

    // Set headers
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Length', fileSize);

    // Set content disposition
    const filename = payload.filename || path.basename(resolvedPath);
    const disposition = payload.contentDisposition || 'inline';
    res.setHeader('Content-Disposition', generateContentDisposition(disposition, filename));

    // Set caching headers
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    // Handle HEAD requests
    if (req.method === 'HEAD') {
      await fileAccessService.logAccess({
        filePath: payload.filePath,
        fileSize,
        contentType,
        accessGranted: true,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        method: req.method,
        statusCode: 200,
        bytesSent: 0,
        durationMs: Date.now() - startTime,
        userId: payload.userId,
      });

      res.status(200).end();
      return;
    }

    // Stream file to response
    const fileStream = (await import('fs')).createReadStream(resolvedPath);

    let bytesSent = 0;

    fileStream.on('data', (chunk) => {
      bytesSent += chunk.length;
    });

    fileStream.on('end', async () => {
      // Increment download count
      if (payload.maxDownloads !== undefined) {
        await fileAccessService.incrementDownloadCount(token);
      }

      // Log successful access
      await fileAccessService.logAccess({
        filePath: payload.filePath,
        fileSize,
        contentType,
        accessGranted: true,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        method: req.method,
        statusCode: 200,
        bytesSent,
        durationMs: Date.now() - startTime,
        userId: payload.userId,
      });

      AppLogger.info('File served successfully', {
        filePath: payload.filePath,
        fileSize,
        bytesSent,
        userId: payload.userId,
      });
    });

    fileStream.on('error', async (error) => {
      AppLogger.error('Error streaming file', error);

      await fileAccessService.logAccess({
        filePath: payload.filePath,
        accessGranted: false,
        denialReason: 'File streaming error',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        method: req.method,
        statusCode: 500,
        durationMs: Date.now() - startTime,
      });

      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: 'Error streaming file',
          code: 'STREAM_ERROR',
        });
      }
    });

    fileStream.pipe(res);
  } catch (error) {
    AppLogger.error('Error serving file', error as Error, {
      token: token.substring(0, 20) + '...',
    });

    await fileAccessService.logAccess({
      filePath: 'unknown',
      accessGranted: false,
      denialReason: 'Internal server error',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      method: req.method,
      statusCode: 500,
      durationMs: Date.now() - startTime,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to serve file',
      code: 'SERVER_ERROR',
    });
  }
});

/**
 * @route POST /api/files/generate-url
 * @desc Generate pre-signed URL for file
 * @access Private
 */
const generateUrlSchema = z.object({
  filePath: z.string().min(1),
  expiresIn: z.number().min(60).max(86400).optional(), // 1 min to 24 hours
  maxDownloads: z.number().min(1).max(1000).optional(),
  contentType: z.string().optional(),
  contentDisposition: z.enum(['inline', 'attachment']).optional(),
  filename: z.string().optional(),
  restrictToIp: z.boolean().optional(),
});

router.post(
  '/generate-url',
  authenticateJWT,
  validateRequest({ body: generateUrlSchema }),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        filePath,
        expiresIn,
        maxDownloads,
        contentType,
        contentDisposition,
        filename,
        restrictToIp,
      } = req.body;

      if (!req.user || !('userId' in req.user)) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'AUTH_REQUIRED',
        });
        return;
      }

      const userId = req.user.userId;

      // Validate file path
      if (!validateFilePath(filePath)) {
        res.status(400).json({
          success: false,
          error: 'Invalid file path',
          code: 'INVALID_PATH',
        });
        return;
      }

      // Check if file exists
      const uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
      const resolvedPath = path.resolve(uploadDir, filePath.replace(/^\//, ''));

      try {
        await fs.access(resolvedPath);
      } catch {
        res.status(404).json({
          success: false,
          error: 'File not found',
          code: 'FILE_NOT_FOUND',
        });
        return;
      }

      const preSignedUtil = getPreSignedUrlUtil();

      const baseUrl = `${req.protocol}://${req.get('host')}/api/files`;

      const result = preSignedUtil.generatePresignedUrl(filePath, baseUrl, {
        expiresIn,
        maxDownloads,
        userId,
        contentType,
        contentDisposition,
        filename,
        allowedIpAddress: restrictToIp ? req.ip : undefined,
      });

      // Store token in database for tracking
      await fileAccessService.createToken({
        token: result.token,
        filePath,
        userId,
        expiresAt: result.expiresAt,
        maxDownloads,
        allowedIpAddress: restrictToIp ? req.ip : undefined,
        contentType,
        contentDisposition,
        customFilename: filename,
      });

      res.json({
        success: true,
        data: {
          url: result.url,
          expiresAt: result.expiresAt,
          maxDownloads,
        },
      });

      AppLogger.info('Pre-signed URL generated', {
        filePath,
        userId,
        expiresIn,
        maxDownloads,
      });
    } catch (error) {
      AppLogger.error('Failed to generate pre-signed URL', error as Error);

      res.status(500).json({
        success: false,
        error: 'Failed to generate pre-signed URL',
        code: 'GENERATION_ERROR',
      });
    }
  }
);

/**
 * @route DELETE /api/files/revoke-token
 * @desc Revoke a pre-signed URL token
 * @access Private
 */
const revokeTokenSchema = z.object({
  token: z.string().min(1),
  reason: z.string().optional(),
});

router.delete(
  '/revoke-token',
  authenticateJWT,
  validateRequest({ body: revokeTokenSchema }),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { token, reason } = req.body;

      if (!req.user || !('userId' in req.user)) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'AUTH_REQUIRED',
        });
        return;
      }

      const userId = req.user.userId;

      await fileAccessService.revokeToken(token, userId, reason);

      res.json({
        success: true,
        message: 'Token revoked successfully',
      });

      AppLogger.info('Pre-signed URL token revoked', {
        userId,
        reason,
      });
    } catch (error) {
      AppLogger.error('Failed to revoke token', error as Error);

      res.status(500).json({
        success: false,
        error: 'Failed to revoke token',
        code: 'REVOKE_ERROR',
      });
    }
  }
);

/**
 * @route GET /api/files/access-logs
 * @desc Get file access logs (admin only)
 * @access Private
 */
router.get('/access-logs', authenticateJWT, async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const filePath = req.query.filePath as string;

    const logs = await fileAccessService.getAccessLogs(limit, filePath);

    res.json({
      success: true,
      data: {
        logs,
        count: logs.length,
      },
    });
  } catch (error) {
    AppLogger.error('Failed to get access logs', error as Error);

    res.status(500).json({
      success: false,
      error: 'Failed to retrieve access logs',
      code: 'LOGS_ERROR',
    });
  }
});

/**
 * @route GET /api/files/statistics
 * @desc Get file access statistics (admin only)
 * @access Private
 */
router.get('/statistics', authenticateJWT, async (req: Request, res: Response): Promise<void> => {
  try {
    const days = parseInt(req.query.days as string) || 7;

    const stats = await fileAccessService.getStatistics(days);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    AppLogger.error('Failed to get file statistics', error as Error);

    res.status(500).json({
      success: false,
      error: 'Failed to retrieve statistics',
      code: 'STATS_ERROR',
    });
  }
});

export default router;
