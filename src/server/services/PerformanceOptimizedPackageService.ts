/**
 * Performance Optimized Package Service
 *
 * Creates optimized export packages with comprehensive manifests and reports.
 *
 * Features:
 * - Multiple format support (ZIP, TAR.GZ, folder)
 * - Manifest generation with all metrics
 * - Performance report inclusion
 * - Source map handling
 * - Backup creation
 * - Compression level optimization
 * - Progress tracking
 * - Restore point creation
 */

import { type AutoOptimizationResult } from './AutoOptimizationService.js';
import { type BudgetValidationResult } from './PerformanceBudgetService.js';
import { AppLogger } from './logger.service.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import archiver from 'archiver';
import * as tar from 'tar';
import * as crypto from 'crypto';

/**
 * Package format options
 */
export type PackageFormat = 'zip' | 'tar' | 'tar.gz' | 'folder';

/**
 * Package creation options
 */
export interface PackageOptions {
  projectId: string;
  sourcePath: string;
  outputPath: string;
  format?: PackageFormat;
  compressionLevel?: number; // 0-9
  includeSourceMaps?: boolean;
  includePerformanceReport?: boolean;
  includeBudgetReport?: boolean;
  includeManifest?: boolean;
  optimization?: AutoOptimizationResult;
  budget?: BudgetValidationResult | null;
  metadata?: Record<string, any>;
  onProgress?: (progress: PackageProgress) => void;
}

/**
 * Package progress information
 */
export interface PackageProgress {
  stage: 'analyzing' | 'collecting' | 'compressing' | 'finalizing' | 'complete';
  percentage: number;
  message: string;
  filesProcessed?: number;
  totalFiles?: number;
  bytesProcessed?: number;
  totalBytes?: number;
}

/**
 * Package manifest
 */
export interface PackageManifest {
  id: string;
  version: string;
  created: number;
  projectId: string;
  format: PackageFormat;
  compression: {
    level: number;
    enabled: boolean;
  };
  files: PackageFile[];
  optimization: OptimizationSummary;
  budget?: BudgetSummary;
  performance: PerformanceSummary;
  checksums: {
    algorithm: string;
    packageChecksum: string;
    fileChecksums: Record<string, string>;
  };
  metadata?: Record<string, any>;
}

/**
 * Package file information
 */
export interface PackageFile {
  path: string;
  size: number;
  compressedSize?: number;
  type: 'html' | 'css' | 'js' | 'image' | 'font' | 'other';
  optimized: boolean;
  checksum: string;
}

/**
 * Optimization summary
 */
export interface OptimizationSummary {
  enabled: boolean;
  actionsApplied: number;
  totalSavings: number;
  percentageReduction: number;
  originalSize: number;
  optimizedSize: number;
}

/**
 * Budget summary
 */
export interface BudgetSummary {
  enforced: boolean;
  passed: boolean;
  violations: number;
  criticalViolations: number;
}

/**
 * Performance summary
 */
export interface PerformanceSummary {
  totalSize: number;
  compressedSize?: number;
  fileCount: number;
  htmlFiles: number;
  cssFiles: number;
  jsFiles: number;
  imageFiles: number;
  fontFiles: number;
  otherFiles: number;
}

/**
 * Package result
 */
export interface PackageResult {
  success: boolean;
  packagePath: string;
  manifest: PackageManifest;
  size: number;
  compressedSize?: number;
  duration: number;
  backupPath?: string;
  errors: string[];
  warnings: string[];
}

/**
 * Performance Optimized Package Service
 */
export class PerformanceOptimizedPackageService {
  /**
   * Create optimized package
   */
  async createOptimizedPackage(options: PackageOptions): Promise<string> {
    const startTime = Date.now();
    const packageId = this.generatePackageId();

    AppLogger.info('Creating optimized package', {
      packageId,
      projectId: options.projectId,
      format: options.format || 'zip',
    });

    try {
      // Report progress
      this.reportProgress(options, {
        stage: 'analyzing',
        percentage: 0,
        message: 'Analyzing source files...',
      });

      // Analyze source files
      const files = await this.analyzeSourceFiles(options.sourcePath);

      this.reportProgress(options, {
        stage: 'collecting',
        percentage: 20,
        message: 'Collecting files for package...',
        totalFiles: files.length,
      });

      // Generate manifest
      const manifest = await this.generateManifest(
        packageId,
        options,
        files
      );

      // Save manifest
      const manifestPath = path.join(options.sourcePath, 'package-manifest.json');
      await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');

      // Generate performance report if requested
      if (options.includePerformanceReport && options.optimization) {
        this.reportProgress(options, {
          stage: 'collecting',
          percentage: 30,
          message: 'Generating performance report...',
        });

        const reportPath = path.join(options.sourcePath, 'PERFORMANCE-OPTIMIZATION-REPORT.md');
        await this.generatePerformanceReport(options.optimization, reportPath);
      }

      // Generate budget report if requested
      if (options.includeBudgetReport && options.budget) {
        this.reportProgress(options, {
          stage: 'collecting',
          percentage: 35,
          message: 'Generating budget report...',
        });

        const reportPath = path.join(options.sourcePath, 'BUDGET-VALIDATION-REPORT.md');
        await this.generateBudgetReport(options.budget, reportPath);
      }

      // Create package based on format
      const format = options.format || 'zip';
      let packagePath: string;

      this.reportProgress(options, {
        stage: 'compressing',
        percentage: 40,
        message: `Creating ${format.toUpperCase()} package...`,
      });

      switch (format) {
        case 'zip':
          packagePath = await this.createZipPackage(options, manifest);
          break;

        case 'tar':
          packagePath = await this.createTarPackage(options, manifest, false);
          break;

        case 'tar.gz':
          packagePath = await this.createTarPackage(options, manifest, true);
          break;

        case 'folder':
          packagePath = options.outputPath;
          break;

        default:
          throw new Error(`Unsupported package format: ${format}`);
      }

      this.reportProgress(options, {
        stage: 'finalizing',
        percentage: 90,
        message: 'Finalizing package...',
      });

      // Calculate final package checksum
      if (format !== 'folder') {
        const packageChecksum = await this.calculateFileChecksum(packagePath);
        manifest.checksums.packageChecksum = packageChecksum;

        // Update manifest with checksum
        const manifestPath = path.join(options.sourcePath, 'package-manifest.json');
        await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
      }

      const duration = Date.now() - startTime;

      this.reportProgress(options, {
        stage: 'complete',
        percentage: 100,
        message: 'Package created successfully!',
      });

      AppLogger.info('Optimized package created successfully', {
        packageId,
        packagePath,
        duration,
      });

      return packagePath;

    } catch (error) {
      AppLogger.error('Failed to create optimized package', error as Error, {
        packageId,
        projectId: options.projectId,
      });
      throw error;
    }
  }

  /**
   * Create restore point
   */
  async createRestorePoint(sourcePath: string): Promise<string> {
    const timestamp = Date.now();
    const restorePointPath = `${sourcePath}_restore_${timestamp}`;

    AppLogger.info('Creating restore point', { sourcePath, restorePointPath });

    try {
      await fs.cp(sourcePath, restorePointPath, { recursive: true });

      AppLogger.info('Restore point created', { restorePointPath });
      return restorePointPath;

    } catch (error) {
      AppLogger.error('Failed to create restore point', error as Error, { sourcePath });
      throw error;
    }
  }

  /**
   * Restore from restore point
   */
  async restoreFromPoint(restorePointPath: string, targetPath: string): Promise<void> {
    AppLogger.info('Restoring from restore point', { restorePointPath, targetPath });

    try {
      // Remove target if exists
      try {
        await fs.rm(targetPath, { recursive: true, force: true });
      } catch (error) {
        // Ignore if doesn't exist
      }

      // Restore from backup
      await fs.cp(restorePointPath, targetPath, { recursive: true });

      AppLogger.info('Restored from restore point', { targetPath });

    } catch (error) {
      AppLogger.error('Failed to restore from restore point', error as Error, {
        restorePointPath,
        targetPath,
      });
      throw error;
    }
  }

  /**
   * Extract package
   */
  async extractPackage(packagePath: string, targetPath: string): Promise<void> {
    AppLogger.info('Extracting package', { packagePath, targetPath });

    try {
      const format = this.detectPackageFormat(packagePath);

      // Create target directory
      await fs.mkdir(targetPath, { recursive: true });

      switch (format) {
        case 'zip':
          await this.extractZipPackage(packagePath, targetPath);
          break;

        case 'tar':
        case 'tar.gz':
          await this.extractTarPackage(packagePath, targetPath);
          break;

        default:
          throw new Error(`Cannot extract package format: ${format}`);
      }

      AppLogger.info('Package extracted successfully', { targetPath });

    } catch (error) {
      AppLogger.error('Failed to extract package', error as Error, { packagePath });
      throw error;
    }
  }

  /**
   * Analyze source files
   */
  private async analyzeSourceFiles(sourcePath: string): Promise<PackageFile[]> {
    const files: PackageFile[] = [];

    const traverse = async (dir: string): Promise<void> => {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          await traverse(fullPath);
        } else if (entry.isFile()) {
          const stats = await fs.stat(fullPath);
          const relativePath = path.relative(sourcePath, fullPath);
          const checksum = await this.calculateFileChecksum(fullPath);

          files.push({
            path: relativePath,
            size: stats.size,
            type: this.detectFileType(relativePath),
            optimized: false,
            checksum,
          });
        }
      }
    };

    await traverse(sourcePath);
    return files;
  }

  /**
   * Generate package manifest
   */
  private async generateManifest(
    packageId: string,
    options: PackageOptions,
    files: PackageFile[]
  ): Promise<PackageManifest> {
    const fileChecksums: Record<string, string> = {};
    files.forEach(file => {
      fileChecksums[file.path] = file.checksum;
    });

    // Calculate performance summary
    const performance: PerformanceSummary = {
      totalSize: files.reduce((sum, f) => sum + f.size, 0),
      fileCount: files.length,
      htmlFiles: files.filter(f => f.type === 'html').length,
      cssFiles: files.filter(f => f.type === 'css').length,
      jsFiles: files.filter(f => f.type === 'js').length,
      imageFiles: files.filter(f => f.type === 'image').length,
      fontFiles: files.filter(f => f.type === 'font').length,
      otherFiles: files.filter(f => f.type === 'other').length,
    };

    // Generate optimization summary
    const optimization: OptimizationSummary = options.optimization ? {
      enabled: true,
      actionsApplied: options.optimization.actionsApplied,
      totalSavings: options.optimization.summary.totalSavings,
      percentageReduction: options.optimization.summary.percentageReduction,
      originalSize: options.optimization.summary.originalSize,
      optimizedSize: options.optimization.summary.optimizedSize,
    } : {
      enabled: false,
      actionsApplied: 0,
      totalSavings: 0,
      percentageReduction: 0,
      originalSize: performance.totalSize,
      optimizedSize: performance.totalSize,
    };

    // Generate budget summary
    const budget: BudgetSummary | undefined = options.budget ? {
      enforced: true,
      passed: options.budget.passed,
      violations: options.budget.summary.totalViolations,
      criticalViolations: options.budget.summary.criticalViolations,
    } : undefined;

    return {
      id: packageId,
      version: '1.0.0',
      created: Date.now(),
      projectId: options.projectId,
      format: options.format || 'zip',
      compression: {
        level: options.compressionLevel || 6,
        enabled: (options.format || 'zip') !== 'folder',
      },
      files,
      optimization,
      budget,
      performance,
      checksums: {
        algorithm: 'sha256',
        packageChecksum: '', // Will be filled after package creation
        fileChecksums,
      },
      metadata: options.metadata,
    };
  }

  /**
   * Generate performance report
   */
  private async generatePerformanceReport(
    optimization: AutoOptimizationResult,
    outputPath: string
  ): Promise<void> {
    const lines: string[] = [];

    lines.push('# Performance Optimization Report\n');
    lines.push(`**Generated**: ${new Date().toLocaleString()}\n`);
    lines.push(`**Status**: ${optimization.success ? 'Success' : 'Failed'}\n`);

    lines.push('## Summary\n');
    lines.push(`- Actions Applied: ${optimization.actionsApplied}`);
    lines.push(`- Actions Failed: ${optimization.actionsFailed}`);
    lines.push(`- Total Actions: ${optimization.totalActions}`);
    lines.push(`- Total Savings: ${this.formatBytes(optimization.summary.totalSavings)}`);
    lines.push(`- Percentage Reduction: ${optimization.summary.percentageReduction.toFixed(2)}%`);
    lines.push(`- Original Size: ${this.formatBytes(optimization.summary.originalSize)}`);
    lines.push(`- Optimized Size: ${this.formatBytes(optimization.summary.optimizedSize)}\n`);

    lines.push('## Optimization Actions\n');
    optimization.actions.forEach(action => {
      const status = action.applied ? '✓' : '✗';
      const savings = action.savings ? ` (saved ${this.formatBytes(action.savings.bytes)})` : '';
      lines.push(`${status} **${action.type}**: ${action.file}${savings}`);
      if (action.error) {
        lines.push(`   Error: ${action.error}`);
      }
    });
    lines.push('');

    if (optimization.budgetViolations.length > 0) {
      lines.push('## Budget Violations\n');
      optimization.budgetViolations.forEach(violation => {
        lines.push(`- **${violation.metric}**: ${this.formatBytes(violation.actual)} / ${this.formatBytes(violation.budget)} (${violation.severity})`);
      });
      lines.push('');
    }

    await fs.writeFile(outputPath, lines.join('\n'), 'utf-8');
  }

  /**
   * Generate budget report
   */
  private async generateBudgetReport(
    budget: BudgetValidationResult,
    outputPath: string
  ): Promise<void> {
    const lines: string[] = [];

    lines.push('# Budget Validation Report\n');
    lines.push(`**Generated**: ${new Date().toLocaleString()}\n`);
    lines.push(`**Status**: ${budget.passed ? 'Passed' : 'Failed'}\n`);

    lines.push('## Summary\n');
    lines.push(`- Total Violations: ${budget.summary.totalViolations}`);
    lines.push(`- Critical Violations: ${budget.summary.criticalViolations}`);
    lines.push(`- Warnings: ${budget.summary.totalWarnings}`);
    lines.push(`- Budget Utilization: ${budget.summary.budgetUtilization.toFixed(2)}%`);
    lines.push(`- Can Export: ${budget.canExport ? 'Yes' : 'No'}`);
    lines.push(`- Requires Override: ${budget.requiresOverride ? 'Yes' : 'No'}\n`);

    if (budget.violations.length > 0) {
      lines.push('## Violations\n');
      budget.violations.forEach(violation => {
        lines.push(`### ${violation.metric} [${violation.severity.toUpperCase()}]`);
        lines.push(`- ${violation.message}`);
        lines.push('- Recommendations:');
        violation.recommendations.forEach(rec => {
          lines.push(`  - ${rec}`);
        });
        lines.push('');
      });
    }

    if (budget.warnings.length > 0) {
      lines.push('## Warnings\n');
      budget.warnings.forEach(warning => {
        lines.push(`- ${warning.message}`);
      });
      lines.push('');
    }

    await fs.writeFile(outputPath, lines.join('\n'), 'utf-8');
  }

  /**
   * Create ZIP package
   */
  private async createZipPackage(
    options: PackageOptions,
    manifest: PackageManifest
  ): Promise<string> {
    const outputPath = `${options.outputPath}.zip`;
    const output = await fs.open(outputPath, 'w');
    const archive = archiver('zip', {
      zlib: { level: options.compressionLevel || 6 },
    });

    return new Promise((resolve, reject) => {
      const stream = output.createWriteStream();

      stream.on('close', () => {
        resolve(outputPath);
      });

      archive.on('error', (err) => {
        reject(err);
      });

      archive.on('progress', (progress) => {
        const percentage = 40 + (progress.fs.processedBytes / progress.fs.totalBytes) * 50;
        this.reportProgress(options, {
          stage: 'compressing',
          percentage,
          message: 'Compressing files...',
          filesProcessed: progress.entries.processed,
          totalFiles: progress.entries.total,
          bytesProcessed: progress.fs.processedBytes,
          totalBytes: progress.fs.totalBytes,
        });
      });

      archive.pipe(stream);
      archive.directory(options.sourcePath, false);
      archive.finalize();
    });
  }

  /**
   * Create TAR package
   */
  private async createTarPackage(
    options: PackageOptions,
    manifest: PackageManifest,
    gzip: boolean
  ): Promise<string> {
    const ext = gzip ? '.tar.gz' : '.tar';
    const outputPath = `${options.outputPath}${ext}`;

    await tar.create(
      {
        file: outputPath,
        gzip,
        cwd: path.dirname(options.sourcePath),
      },
      [path.basename(options.sourcePath)]
    );

    return outputPath;
  }

  /**
   * Extract ZIP package
   */
  private async extractZipPackage(packagePath: string, targetPath: string): Promise<void> {
    const AdmZip = (await import('adm-zip')).default;
    const zip = new AdmZip(packagePath);
    zip.extractAllTo(targetPath, true);
  }

  /**
   * Extract TAR package
   */
  private async extractTarPackage(packagePath: string, targetPath: string): Promise<void> {
    await tar.extract({
      file: packagePath,
      cwd: targetPath,
    });
  }

  /**
   * Detect package format from file extension
   */
  private detectPackageFormat(packagePath: string): PackageFormat {
    if (packagePath.endsWith('.tar.gz')) return 'tar.gz';
    if (packagePath.endsWith('.tar')) return 'tar';
    if (packagePath.endsWith('.zip')) return 'zip';
    return 'folder';
  }

  /**
   * Detect file type from extension
   */
  private detectFileType(filePath: string): PackageFile['type'] {
    const ext = path.extname(filePath).toLowerCase();

    if (['.html', '.htm'].includes(ext)) return 'html';
    if (['.css'].includes(ext)) return 'css';
    if (['.js', '.mjs', '.cjs'].includes(ext)) return 'js';
    if (['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.avif', '.ico'].includes(ext)) return 'image';
    if (['.woff', '.woff2', '.ttf', '.otf', '.eot'].includes(ext)) return 'font';

    return 'other';
  }

  /**
   * Calculate file checksum
   */
  private async calculateFileChecksum(filePath: string): Promise<string> {
    const content = await fs.readFile(filePath);
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Report progress
   */
  private reportProgress(options: PackageOptions, progress: PackageProgress): void {
    if (options.onProgress) {
      try {
        options.onProgress(progress);
      } catch (error) {
        AppLogger.warn('Package progress callback error', { error });
      }
    }
  }

  /**
   * Generate package ID
   */
  private generatePackageId(): string {
    return `pkg_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Format bytes to human-readable string
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  }
}

/**
 * Create performance optimized package service instance
 */
export function createPerformanceOptimizedPackageService(): PerformanceOptimizedPackageService {
  return new PerformanceOptimizedPackageService();
}

// Export singleton instance
export default new PerformanceOptimizedPackageService();
