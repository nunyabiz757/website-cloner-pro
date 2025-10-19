import { Request, Response, NextFunction } from 'express';
import { getArchiveUtil, ArchiveSecurityError } from '../utils/archive.util.js';
import { AppLogger } from '../services/logger.service.js';
import fs from 'fs/promises';

/**
 * Archive Scan Middleware
 * Automatically scans uploaded archives for security threats
 */

export interface ArchiveScanOptions {
  maxTotalSize?: number;
  maxFileSize?: number;
  maxFiles?: number;
  maxNestingLevel?: number;
  maxCompressionRatio?: number;
  blockSuspicious?: boolean;
  autoExtract?: boolean;
  deleteOnFailure?: boolean;
}

/**
 * Scan uploaded archive for security threats
 */
export function scanArchive(options?: ArchiveScanOptions) {
  const defaultOptions: Required<ArchiveScanOptions> = {
    maxTotalSize: 1024 * 1024 * 1024, // 1 GB
    maxFileSize: 100 * 1024 * 1024, // 100 MB
    maxFiles: 10000,
    maxNestingLevel: 2,
    maxCompressionRatio: 1000,
    blockSuspicious: true,
    autoExtract: false,
    deleteOnFailure: true,
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
      const archiveUtil = getArchiveUtil();

      // Check if file is an archive
      if (!archiveUtil.isArchive(filePath)) {
        next();
        return;
      }

      AppLogger.info('Scanning uploaded archive', {
        userId: req.user?.userId,
        filename: req.file.originalname,
        size: req.file.size,
      });

      // Analyze archive
      let analysisResult;

      try {
        analysisResult = await archiveUtil.analyzeArchive(filePath);
      } catch (error) {
        AppLogger.logSecurityEvent('archive_scan.analysis_failed', 'high', {
          userId: req.user?.userId,
          filename: req.file.originalname,
          error: (error as Error).message,
        });

        if (config.deleteOnFailure) {
          await fs.unlink(filePath).catch(() => {});
        }

        res.status(400).json({
          success: false,
          error: 'Failed to analyze archive',
          details: (error as Error).message,
        });
        return;
      }

      // Check total size
      if (analysisResult.totalUncompressedSize > config.maxTotalSize) {
        AppLogger.logSecurityEvent('archive_scan.size_exceeded', 'high', {
          userId: req.user?.userId,
          filename: req.file.originalname,
          totalSize: analysisResult.totalUncompressedSize,
          limit: config.maxTotalSize,
        });

        if (config.deleteOnFailure) {
          await fs.unlink(filePath).catch(() => {});
        }

        res.status(400).json({
          success: false,
          error: 'Archive too large',
          details: `Total uncompressed size exceeds limit of ${formatBytes(config.maxTotalSize)}`,
        });
        return;
      }

      // Check file count
      if (analysisResult.totalFiles > config.maxFiles) {
        AppLogger.logSecurityEvent('archive_scan.file_count_exceeded', 'high', {
          userId: req.user?.userId,
          filename: req.file.originalname,
          totalFiles: analysisResult.totalFiles,
          limit: config.maxFiles,
        });

        if (config.deleteOnFailure) {
          await fs.unlink(filePath).catch(() => {});
        }

        res.status(400).json({
          success: false,
          error: 'Too many files in archive',
          details: `Archive contains ${analysisResult.totalFiles} files, limit is ${config.maxFiles}`,
        });
        return;
      }

      // Check individual file sizes
      const oversizedFiles = analysisResult.files.filter(
        (f) => !f.isDirectory && f.size > config.maxFileSize
      );

      if (oversizedFiles.length > 0) {
        AppLogger.logSecurityEvent('archive_scan.oversized_files', 'high', {
          userId: req.user?.userId,
          filename: req.file.originalname,
          oversizedFiles: oversizedFiles.map((f) => ({
            path: f.path,
            size: f.size,
          })),
        });

        if (config.deleteOnFailure) {
          await fs.unlink(filePath).catch(() => {});
        }

        res.status(400).json({
          success: false,
          error: 'Archive contains oversized files',
          details: `${oversizedFiles.length} file(s) exceed size limit of ${formatBytes(config.maxFileSize)}`,
        });
        return;
      }

      // Check nesting level
      if (analysisResult.nestingLevel > config.maxNestingLevel) {
        AppLogger.logSecurityEvent('archive_scan.nesting_exceeded', 'critical', {
          userId: req.user?.userId,
          filename: req.file.originalname,
          nestingLevel: analysisResult.nestingLevel,
          limit: config.maxNestingLevel,
        });

        if (config.deleteOnFailure) {
          await fs.unlink(filePath).catch(() => {});
        }

        res.status(400).json({
          success: false,
          error: 'Archive nesting too deep',
          details: `Nesting level ${analysisResult.nestingLevel} exceeds limit of ${config.maxNestingLevel}`,
        });
        return;
      }

      // Check compression ratio (decompression bomb detection)
      if (analysisResult.compressionRatio > config.maxCompressionRatio) {
        AppLogger.logSecurityEvent(
          'archive_scan.decompression_bomb_detected',
          'critical',
          {
            userId: req.user?.userId,
            filename: req.file.originalname,
            compressionRatio: analysisResult.compressionRatio,
            limit: config.maxCompressionRatio,
          }
        );

        if (config.deleteOnFailure) {
          await fs.unlink(filePath).catch(() => {});
        }

        res.status(400).json({
          success: false,
          error: 'Potential decompression bomb detected',
          details: `Compression ratio ${analysisResult.compressionRatio.toFixed(2)}:1 exceeds safe limit`,
        });
        return;
      }

      // Check for suspicious patterns
      if (config.blockSuspicious && analysisResult.isSuspicious) {
        AppLogger.logSecurityEvent('archive_scan.suspicious_archive', 'high', {
          userId: req.user?.userId,
          filename: req.file.originalname,
          warnings: analysisResult.warnings,
          compressionRatio: analysisResult.compressionRatio,
        });

        if (config.deleteOnFailure) {
          await fs.unlink(filePath).catch(() => {});
        }

        res.status(400).json({
          success: false,
          error: 'Suspicious archive detected',
          details: analysisResult.warnings.join('; '),
        });
        return;
      }

      // Attach analysis result to request for use by route handlers
      (req as any).archiveAnalysis = analysisResult;

      AppLogger.info('Archive scan passed', {
        userId: req.user?.userId,
        filename: req.file.originalname,
        totalFiles: analysisResult.totalFiles,
        totalSize: analysisResult.totalUncompressedSize,
        compressionRatio: analysisResult.compressionRatio,
      });

      next();
    } catch (error) {
      AppLogger.error('Archive scan error', error as Error, {
        userId: req.user?.userId,
        filename: req.file?.originalname,
      });

      if (req.file?.path && config.deleteOnFailure) {
        await fs.unlink(req.file.path).catch(() => {});
      }

      res.status(500).json({
        success: false,
        error: 'Archive scan failed',
        details: (error as Error).message,
      });
    }
  };
}

/**
 * Validate archive path for extraction/access
 */
export function validateArchivePath() {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const { filePath } = req.body;

      if (!filePath) {
        res.status(400).json({
          success: false,
          error: 'filePath is required',
        });
        return;
      }

      // Check for path traversal
      if (filePath.includes('..') || filePath.includes('\0')) {
        AppLogger.logSecurityEvent('archive_scan.path_traversal_attempt', 'high', {
          userId: req.user?.userId,
          filePath,
        });

        res.status(400).json({
          success: false,
          error: 'Invalid file path',
        });
        return;
      }

      next();
    } catch (error) {
      res.status(500).json({
        success: false,
        error: 'Path validation failed',
      });
    }
  };
}

/**
 * Check archive extensions
 */
export function checkArchiveExtensions(allowedExtensions: string[]) {
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
      const archiveUtil = getArchiveUtil();

      if (!archiveUtil.isArchive(filePath)) {
        next();
        return;
      }

      // Analyze to get file list
      const analysisResult = await archiveUtil.analyzeArchive(filePath);

      // Check all file extensions
      const invalidFiles = analysisResult.files.filter((file) => {
        if (file.isDirectory) return false;

        const ext = file.path.substring(file.path.lastIndexOf('.')).toLowerCase();
        return !allowedExtensions.includes(ext);
      });

      if (invalidFiles.length > 0) {
        AppLogger.logSecurityEvent('archive_scan.invalid_extensions', 'medium', {
          userId: req.user?.userId,
          filename: req.file.originalname,
          invalidFiles: invalidFiles.map((f) => f.path),
        });

        await fs.unlink(filePath).catch(() => {});

        res.status(400).json({
          success: false,
          error: 'Archive contains files with disallowed extensions',
          details: `${invalidFiles.length} file(s) have invalid extensions`,
        });
        return;
      }

      next();
    } catch (error) {
      AppLogger.error('Extension check failed', error as Error, {
        userId: req.user?.userId,
      });

      if (req.file?.path) {
        await fs.unlink(req.file.path).catch(() => {});
      }

      res.status(500).json({
        success: false,
        error: 'Extension check failed',
      });
    }
  };
}

/**
 * Log archive upload for audit
 */
export function logArchiveUpload() {
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

      const archiveUtil = getArchiveUtil();

      if (!archiveUtil.isArchive(req.file.path)) {
        next();
        return;
      }

      const analysisResult = (req as any).archiveAnalysis;

      AppLogger.info('Archive upload logged', {
        userId: req.user?.userId,
        filename: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype,
        totalFiles: analysisResult?.totalFiles,
        totalUncompressedSize: analysisResult?.totalUncompressedSize,
        compressionRatio: analysisResult?.compressionRatio,
        nestingLevel: analysisResult?.nestingLevel,
        isSuspicious: analysisResult?.isSuspicious,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
      });

      next();
    } catch (error) {
      // Don't block request on logging failure
      AppLogger.error('Failed to log archive upload', error as Error);
      next();
    }
  };
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}
