import AdmZip from 'adm-zip';
import tar from 'tar';
import fs from 'fs/promises';
import path from 'path';
import { createReadStream, createWriteStream } from 'fs';
import { createGunzip } from 'zlib';
import { AppLogger } from '../services/logger.service.js';
import { pipeline } from 'stream/promises';

/**
 * Archive Utility
 * Safe archive extraction with decompression bomb prevention
 */

export interface ArchiveExtractionOptions {
  maxTotalSize?: number; // Maximum total uncompressed size in bytes
  maxFileSize?: number; // Maximum individual file size in bytes
  maxFiles?: number; // Maximum number of files
  maxNestingLevel?: number; // Maximum archive nesting depth
  allowedExtensions?: string[]; // Whitelist of allowed file extensions
  extractPath?: string; // Destination path for extraction
  overwrite?: boolean; // Allow overwriting existing files
  validatePaths?: boolean; // Enable path traversal validation
}

export interface ArchiveInfo {
  totalFiles: number;
  totalUncompressedSize: number;
  totalCompressedSize: number;
  compressionRatio: number;
  files: Array<{
    path: string;
    size: number;
    compressedSize: number;
    isDirectory: boolean;
  }>;
  nestingLevel: number;
  isSuspicious: boolean;
  warnings: string[];
}

export interface ExtractionResult {
  success: boolean;
  extractedFiles: string[];
  totalSize: number;
  warnings: string[];
  errors: string[];
}

export class ArchiveSecurityError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'ArchiveSecurityError';
  }
}

export class ArchiveUtil {
  private defaultOptions: Required<ArchiveExtractionOptions> = {
    maxTotalSize: 1024 * 1024 * 1024, // 1 GB
    maxFileSize: 100 * 1024 * 1024, // 100 MB
    maxFiles: 10000,
    maxNestingLevel: 2,
    allowedExtensions: [],
    extractPath: '',
    overwrite: false,
    validatePaths: true,
  };

  // Suspicious compression ratios
  private suspiciousCompressionRatio = 100; // 100:1 ratio is suspicious
  private criticalCompressionRatio = 1000; // 1000:1 ratio is critical

  // Known archive extensions
  private archiveExtensions = [
    '.zip',
    '.tar',
    '.tar.gz',
    '.tgz',
    '.tar.bz2',
    '.tbz2',
    '.gz',
    '.bz2',
    '.7z',
    '.rar',
  ];

  constructor(defaultOptions?: Partial<ArchiveExtractionOptions>) {
    if (defaultOptions) {
      this.defaultOptions = { ...this.defaultOptions, ...defaultOptions };
    }
  }

  /**
   * Analyze archive without extraction
   */
  async analyzeArchive(archivePath: string): Promise<ArchiveInfo> {
    try {
      const stats = await fs.stat(archivePath);
      const compressedSize = stats.size;
      const ext = path.extname(archivePath).toLowerCase();

      let info: ArchiveInfo;

      if (ext === '.zip') {
        info = await this.analyzeZip(archivePath, compressedSize);
      } else if (ext === '.tar' || ext === '.tar.gz' || ext === '.tgz') {
        info = await this.analyzeTar(archivePath, compressedSize);
      } else {
        throw new ArchiveSecurityError(
          `Unsupported archive format: ${ext}`,
          'UNSUPPORTED_FORMAT'
        );
      }

      // Check for suspicious patterns
      info.isSuspicious = this.detectSuspiciousPatterns(info);

      AppLogger.info('Archive analyzed', {
        archivePath,
        totalFiles: info.totalFiles,
        totalUncompressedSize: info.totalUncompressedSize,
        compressionRatio: info.compressionRatio,
        isSuspicious: info.isSuspicious,
      });

      return info;
    } catch (error) {
      AppLogger.error('Failed to analyze archive', error as Error, { archivePath });
      throw error;
    }
  }

  /**
   * Extract archive safely with limits
   */
  async extractArchive(
    archivePath: string,
    options?: ArchiveExtractionOptions
  ): Promise<ExtractionResult> {
    const mergedOptions = { ...this.defaultOptions, ...options };
    const result: ExtractionResult = {
      success: false,
      extractedFiles: [],
      totalSize: 0,
      warnings: [],
      errors: [],
    };

    try {
      // Analyze archive first
      const info = await this.analyzeArchive(archivePath);

      // Validate before extraction
      this.validateArchive(info, mergedOptions);

      // Determine extraction path
      const extractPath =
        mergedOptions.extractPath ||
        path.join(path.dirname(archivePath), path.basename(archivePath, path.extname(archivePath)));

      // Create extraction directory
      await fs.mkdir(extractPath, { recursive: true });

      // Extract based on format
      const ext = path.extname(archivePath).toLowerCase();

      if (ext === '.zip') {
        await this.extractZip(archivePath, extractPath, mergedOptions, result);
      } else if (ext === '.tar' || ext === '.tar.gz' || ext === '.tgz') {
        await this.extractTar(archivePath, extractPath, mergedOptions, result);
      }

      result.success = true;

      AppLogger.info('Archive extracted successfully', {
        archivePath,
        extractPath,
        filesExtracted: result.extractedFiles.length,
        totalSize: result.totalSize,
      });

      return result;
    } catch (error) {
      result.errors.push((error as Error).message);
      AppLogger.error('Failed to extract archive', error as Error, { archivePath });
      throw error;
    }
  }

  /**
   * Extract archive with streaming (for large files)
   */
  async extractArchiveStreaming(
    archivePath: string,
    extractPath: string,
    options?: ArchiveExtractionOptions
  ): Promise<ExtractionResult> {
    const mergedOptions = { ...this.defaultOptions, ...options };
    const result: ExtractionResult = {
      success: false,
      extractedFiles: [],
      totalSize: 0,
      warnings: [],
      errors: [],
    };

    try {
      await fs.mkdir(extractPath, { recursive: true });

      const ext = path.extname(archivePath).toLowerCase();

      if (ext === '.tar' || ext === '.tar.gz' || ext === '.tgz') {
        await this.extractTarStreaming(archivePath, extractPath, mergedOptions, result);
      } else {
        throw new ArchiveSecurityError(
          'Streaming extraction only supported for tar archives',
          'UNSUPPORTED_STREAMING'
        );
      }

      result.success = true;

      AppLogger.info('Archive extracted via streaming', {
        archivePath,
        extractPath,
        filesExtracted: result.extractedFiles.length,
      });

      return result;
    } catch (error) {
      result.errors.push((error as Error).message);
      throw error;
    }
  }

  /**
   * Check if file is an archive
   */
  isArchive(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return this.archiveExtensions.includes(ext);
  }

  /**
   * Detect nested archives within an archive
   */
  async detectNestedArchives(archivePath: string): Promise<string[]> {
    try {
      const info = await this.analyzeArchive(archivePath);
      const nestedArchives: string[] = [];

      for (const file of info.files) {
        if (!file.isDirectory && this.isArchive(file.path)) {
          nestedArchives.push(file.path);
        }
      }

      return nestedArchives;
    } catch (error) {
      AppLogger.error('Failed to detect nested archives', error as Error, { archivePath });
      return [];
    }
  }

  /**
   * Calculate nesting level of archives
   */
  async calculateNestingLevel(
    archivePath: string,
    currentLevel: number = 0,
    maxLevel: number = 10
  ): Promise<number> {
    if (currentLevel >= maxLevel) {
      return currentLevel;
    }

    try {
      const nestedArchives = await this.detectNestedArchives(archivePath);

      if (nestedArchives.length === 0) {
        return currentLevel;
      }

      // For simplicity, return current level + 1 if nested archives found
      // In production, you'd extract and recursively check each nested archive
      return currentLevel + 1;
    } catch (error) {
      return currentLevel;
    }
  }

  /**
   * Validate archive before extraction
   */
  private validateArchive(
    info: ArchiveInfo,
    options: Required<ArchiveExtractionOptions>
  ): void {
    const errors: string[] = [];

    // Check total size
    if (info.totalUncompressedSize > options.maxTotalSize) {
      errors.push(
        `Total uncompressed size (${this.formatBytes(info.totalUncompressedSize)}) exceeds limit (${this.formatBytes(options.maxTotalSize)})`
      );
    }

    // Check file count
    if (info.totalFiles > options.maxFiles) {
      errors.push(
        `File count (${info.totalFiles}) exceeds limit (${options.maxFiles})`
      );
    }

    // Check individual file sizes
    for (const file of info.files) {
      if (file.size > options.maxFileSize) {
        errors.push(
          `File ${file.path} size (${this.formatBytes(file.size)}) exceeds limit (${this.formatBytes(options.maxFileSize)})`
        );
      }
    }

    // Check nesting level
    if (info.nestingLevel > options.maxNestingLevel) {
      errors.push(
        `Archive nesting level (${info.nestingLevel}) exceeds limit (${options.maxNestingLevel})`
      );
    }

    // Check compression ratio for decompression bombs
    if (info.compressionRatio > this.criticalCompressionRatio) {
      errors.push(
        `Compression ratio (${info.compressionRatio.toFixed(2)}:1) indicates potential decompression bomb`
      );
    }

    // Check allowed extensions
    if (options.allowedExtensions.length > 0) {
      for (const file of info.files) {
        if (!file.isDirectory) {
          const ext = path.extname(file.path).toLowerCase();
          if (!options.allowedExtensions.includes(ext)) {
            errors.push(`File extension ${ext} is not allowed for file: ${file.path}`);
          }
        }
      }
    }

    if (errors.length > 0) {
      throw new ArchiveSecurityError(
        'Archive validation failed',
        'VALIDATION_FAILED',
        { errors }
      );
    }
  }

  /**
   * Detect suspicious patterns in archive
   */
  private detectSuspiciousPatterns(info: ArchiveInfo): boolean {
    const warnings: string[] = [];

    // High compression ratio
    if (info.compressionRatio > this.suspiciousCompressionRatio) {
      warnings.push(
        `High compression ratio: ${info.compressionRatio.toFixed(2)}:1`
      );
    }

    // Many small files (potential zip bomb)
    const smallFiles = info.files.filter((f) => !f.isDirectory && f.size < 1024);
    if (smallFiles.length > 1000) {
      warnings.push(`Large number of small files: ${smallFiles.length}`);
    }

    // Duplicate file names
    const fileNames = info.files.map((f) => path.basename(f.path));
    const uniqueNames = new Set(fileNames);
    if (fileNames.length !== uniqueNames.size) {
      warnings.push('Duplicate file names detected');
    }

    // Path traversal attempts
    const traversalAttempts = info.files.filter(
      (f) => f.path.includes('..') || f.path.startsWith('/')
    );
    if (traversalAttempts.length > 0) {
      warnings.push(
        `Path traversal attempts detected: ${traversalAttempts.length} files`
      );
    }

    // Nested archives
    if (info.nestingLevel > 0) {
      warnings.push(`Nested archives detected: level ${info.nestingLevel}`);
    }

    info.warnings = warnings;
    return warnings.length > 0;
  }

  /**
   * Analyze ZIP archive
   */
  private async analyzeZip(
    archivePath: string,
    compressedSize: number
  ): Promise<ArchiveInfo> {
    const zip = new AdmZip(archivePath);
    const entries = zip.getEntries();

    let totalUncompressedSize = 0;
    const files: ArchiveInfo['files'] = [];

    for (const entry of entries) {
      const size = entry.header.size;
      totalUncompressedSize += size;

      files.push({
        path: entry.entryName,
        size: size,
        compressedSize: entry.header.compressedSize,
        isDirectory: entry.isDirectory,
      });
    }

    const compressionRatio =
      compressedSize > 0 ? totalUncompressedSize / compressedSize : 1;

    // Detect nesting level
    const nestedArchives = files.filter(
      (f) => !f.isDirectory && this.isArchive(f.path)
    );
    const nestingLevel = nestedArchives.length > 0 ? 1 : 0;

    return {
      totalFiles: entries.length,
      totalUncompressedSize,
      totalCompressedSize: compressedSize,
      compressionRatio,
      files,
      nestingLevel,
      isSuspicious: false,
      warnings: [],
    };
  }

  /**
   * Analyze TAR archive
   */
  private async analyzeTar(
    archivePath: string,
    compressedSize: number
  ): Promise<ArchiveInfo> {
    let totalUncompressedSize = 0;
    const files: ArchiveInfo['files'] = [];

    await tar.list({
      file: archivePath,
      onentry: (entry) => {
        const size = entry.size || 0;
        totalUncompressedSize += size;

        files.push({
          path: entry.path,
          size: size,
          compressedSize: 0, // TAR doesn't provide per-file compressed size
          isDirectory: entry.type === 'Directory',
        });
      },
    });

    const compressionRatio =
      compressedSize > 0 ? totalUncompressedSize / compressedSize : 1;

    const nestedArchives = files.filter(
      (f) => !f.isDirectory && this.isArchive(f.path)
    );
    const nestingLevel = nestedArchives.length > 0 ? 1 : 0;

    return {
      totalFiles: files.length,
      totalUncompressedSize,
      totalCompressedSize: compressedSize,
      compressionRatio,
      files,
      nestingLevel,
      isSuspicious: false,
      warnings: [],
    };
  }

  /**
   * Extract ZIP archive
   */
  private async extractZip(
    archivePath: string,
    extractPath: string,
    options: Required<ArchiveExtractionOptions>,
    result: ExtractionResult
  ): Promise<void> {
    const zip = new AdmZip(archivePath);
    const entries = zip.getEntries();

    for (const entry of entries) {
      if (entry.isDirectory) {
        continue;
      }

      // Validate path
      if (options.validatePaths) {
        const sanitizedPath = this.sanitizePath(entry.entryName);
        if (!sanitizedPath) {
          result.warnings.push(`Skipped suspicious path: ${entry.entryName}`);
          continue;
        }
      }

      const targetPath = path.join(extractPath, entry.entryName);

      // Ensure target is within extract path
      if (!this.isPathSafe(targetPath, extractPath)) {
        result.warnings.push(`Blocked path traversal: ${entry.entryName}`);
        AppLogger.logSecurityEvent('archive.path_traversal_blocked', 'high', {
          archivePath,
          entryPath: entry.entryName,
          targetPath,
        });
        continue;
      }

      // Check if file exists
      if (!options.overwrite) {
        try {
          await fs.access(targetPath);
          result.warnings.push(`File already exists: ${entry.entryName}`);
          continue;
        } catch {
          // File doesn't exist, proceed
        }
      }

      // Create directory structure
      await fs.mkdir(path.dirname(targetPath), { recursive: true });

      // Extract file
      const content = entry.getData();
      await fs.writeFile(targetPath, content);

      result.extractedFiles.push(targetPath);
      result.totalSize += entry.header.size;
    }
  }

  /**
   * Extract TAR archive
   */
  private async extractTar(
    archivePath: string,
    extractPath: string,
    options: Required<ArchiveExtractionOptions>,
    result: ExtractionResult
  ): Promise<void> {
    await tar.extract({
      file: archivePath,
      cwd: extractPath,
      filter: (path, entry) => {
        // Validate path
        if (options.validatePaths) {
          const sanitizedPath = this.sanitizePath(path);
          if (!sanitizedPath) {
            result.warnings.push(`Skipped suspicious path: ${path}`);
            return false;
          }
        }

        const targetPath = path;
        const fullPath = path.join(extractPath, targetPath);

        // Check path safety
        if (!this.isPathSafe(fullPath, extractPath)) {
          result.warnings.push(`Blocked path traversal: ${path}`);
          return false;
        }

        return true;
      },
      onentry: (entry) => {
        if (entry.type !== 'Directory') {
          const fullPath = path.join(extractPath, entry.path);
          result.extractedFiles.push(fullPath);
          result.totalSize += entry.size || 0;
        }
      },
    });
  }

  /**
   * Extract TAR archive with streaming
   */
  private async extractTarStreaming(
    archivePath: string,
    extractPath: string,
    options: Required<ArchiveExtractionOptions>,
    result: ExtractionResult
  ): Promise<void> {
    const extract = tar.extract({
      cwd: extractPath,
      filter: (path) => {
        if (options.validatePaths) {
          const sanitizedPath = this.sanitizePath(path);
          if (!sanitizedPath) {
            result.warnings.push(`Skipped suspicious path: ${path}`);
            return false;
          }
        }

        const fullPath = path.join(extractPath, path);
        return this.isPathSafe(fullPath, extractPath);
      },
      onentry: (entry) => {
        if (entry.type !== 'Directory') {
          const fullPath = path.join(extractPath, entry.path);
          result.extractedFiles.push(fullPath);
          result.totalSize += entry.size || 0;
        }
      },
    });

    const readStream = createReadStream(archivePath);
    const gunzip = archivePath.endsWith('.gz') ? createGunzip() : null;

    if (gunzip) {
      await pipeline(readStream, gunzip, extract);
    } else {
      await pipeline(readStream, extract);
    }
  }

  /**
   * Sanitize file path
   */
  private sanitizePath(filePath: string): string | null {
    // Remove null bytes
    if (filePath.includes('\0')) {
      return null;
    }

    // Normalize path
    const normalized = path.normalize(filePath);

    // Check for path traversal
    if (normalized.includes('..') || path.isAbsolute(normalized)) {
      return null;
    }

    return normalized;
  }

  /**
   * Check if path is safe (no traversal)
   */
  private isPathSafe(targetPath: string, basePath: string): boolean {
    const resolvedTarget = path.resolve(targetPath);
    const resolvedBase = path.resolve(basePath);

    return resolvedTarget.startsWith(resolvedBase);
  }

  /**
   * Format bytes to human-readable string
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }
}

/**
 * Singleton instance
 */
let archiveUtil: ArchiveUtil | null = null;

export function initializeArchiveUtil(
  options?: Partial<ArchiveExtractionOptions>
): ArchiveUtil {
  archiveUtil = new ArchiveUtil(options);
  return archiveUtil;
}

export function getArchiveUtil(): ArchiveUtil {
  if (!archiveUtil) {
    throw new Error('ArchiveUtil not initialized. Call initializeArchiveUtil first.');
  }
  return archiveUtil;
}
