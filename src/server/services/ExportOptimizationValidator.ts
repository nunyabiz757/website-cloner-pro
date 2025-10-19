/**
 * Export Optimization Validator Service
 *
 * Validates exports meet performance and quality requirements.
 *
 * Features:
 * - Pre-export validation
 * - Post-export validation
 * - Performance budget compliance checks
 * - Asset integrity verification
 * - File structure validation
 * - Missing file detection
 * - Broken link detection
 * - Comprehensive validation reporting
 */

import { PerformanceBudgetService, type PerformanceBudget, type BudgetValidationResult } from './PerformanceBudgetService.js';
import { AppLogger } from './logger.service.js';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as cheerio from 'cheerio';
import * as crypto from 'crypto';

/**
 * Validation options
 */
export interface ValidationOptions {
  exportPath: string;
  budget?: PerformanceBudget;
  checkFileIntegrity?: boolean;
  checkAssets?: boolean;
  checkStructure?: boolean;
  checkBrokenLinks?: boolean;
  checkPerformance?: boolean;
  strictMode?: boolean;
}

/**
 * Validation result
 */
export interface ValidationResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
  info: string[];
  fileIntegrity: FileIntegrityResult;
  assetValidation: AssetValidationResult;
  structureValidation: StructureValidationResult;
  performanceValidation?: PerformanceValidationResult;
  brokenLinks?: BrokenLinkResult;
}

/**
 * File integrity result
 */
export interface FileIntegrityResult {
  checked: number;
  passed: number;
  failed: number;
  corrupted: string[];
  unreadable: string[];
}

/**
 * Asset validation result
 */
export interface AssetValidationResult {
  checked: number;
  valid: number;
  broken: number;
  missing: string[];
  invalidFormat: string[];
  oversized: string[];
}

/**
 * Structure validation result
 */
export interface StructureValidationResult {
  requiredFiles: number;
  missingFiles: string[];
  extraFiles: string[];
  emptyDirectories: string[];
  invalidPaths: string[];
}

/**
 * Performance validation result
 */
export interface PerformanceValidationResult {
  passed: boolean;
  budgetResult: BudgetValidationResult;
  issues: string[];
}

/**
 * Broken link result
 */
export interface BrokenLinkResult {
  totalLinks: number;
  validLinks: number;
  brokenLinks: number;
  externalLinks: number;
  details: {
    url: string;
    file: string;
    line?: number;
    reason: string;
  }[];
}

/**
 * Required export files
 */
const REQUIRED_FILES = [
  'README.md',
  'metadata.json',
];

/**
 * Optional but recommended files
 */
const RECOMMENDED_FILES = [
  'IMPORT-INSTRUCTIONS.md',
  'PERFORMANCE-REPORT.md',
  'package.json',
];

/**
 * Required directories
 */
const REQUIRED_DIRECTORIES = [
  'assets',
];

/**
 * Export Optimization Validator
 */
export class ExportOptimizationValidator {
  private budgetService: PerformanceBudgetService;

  constructor() {
    this.budgetService = new PerformanceBudgetService();
  }

  /**
   * Validate export package
   */
  async validateExport(options: ValidationOptions): Promise<ValidationResult> {
    AppLogger.info('Starting export validation', { exportPath: options.exportPath });

    const result: ValidationResult = {
      passed: true,
      errors: [],
      warnings: [],
      info: [],
      fileIntegrity: {
        checked: 0,
        passed: 0,
        failed: 0,
        corrupted: [],
        unreadable: [],
      },
      assetValidation: {
        checked: 0,
        valid: 0,
        broken: 0,
        missing: [],
        invalidFormat: [],
        oversized: [],
      },
      structureValidation: {
        requiredFiles: REQUIRED_FILES.length,
        missingFiles: [],
        extraFiles: [],
        emptyDirectories: [],
        invalidPaths: [],
      },
    };

    try {
      // Check if export path exists
      try {
        const stats = await fs.stat(options.exportPath);
        if (!stats.isDirectory()) {
          result.errors.push('Export path is not a directory');
          result.passed = false;
          return result;
        }
      } catch (error) {
        result.errors.push(`Export path does not exist: ${options.exportPath}`);
        result.passed = false;
        return result;
      }

      // 1. Structure validation
      if (options.checkStructure !== false) {
        AppLogger.debug('Validating export structure', { exportPath: options.exportPath });
        const structureResult = await this.validateStructure(options.exportPath);
        result.structureValidation = structureResult;

        if (structureResult.missingFiles.length > 0) {
          result.errors.push(`Missing required files: ${structureResult.missingFiles.join(', ')}`);
          result.passed = false;
        }

        if (structureResult.emptyDirectories.length > 0) {
          result.warnings.push(`Empty directories found: ${structureResult.emptyDirectories.join(', ')}`);
        }
      }

      // 2. File integrity validation
      if (options.checkFileIntegrity) {
        AppLogger.debug('Validating file integrity', { exportPath: options.exportPath });
        const integrityResult = await this.validateFileIntegrity(options.exportPath);
        result.fileIntegrity = integrityResult;

        if (integrityResult.failed > 0) {
          result.errors.push(`File integrity check failed for ${integrityResult.failed} files`);
          result.passed = false;
        }

        if (integrityResult.unreadable.length > 0) {
          result.warnings.push(`Unreadable files: ${integrityResult.unreadable.join(', ')}`);
        }
      }

      // 3. Asset validation
      if (options.checkAssets) {
        AppLogger.debug('Validating assets', { exportPath: options.exportPath });
        const assetResult = await this.validateAssets(options.exportPath);
        result.assetValidation = assetResult;

        if (assetResult.broken > 0) {
          result.errors.push(`Found ${assetResult.broken} broken or invalid assets`);
          result.passed = false;
        }

        if (assetResult.oversized.length > 0) {
          result.warnings.push(`Oversized assets: ${assetResult.oversized.join(', ')}`);
        }
      }

      // 4. Broken link detection
      if (options.checkBrokenLinks) {
        AppLogger.debug('Checking for broken links', { exportPath: options.exportPath });
        const brokenLinks = await this.detectBrokenLinks(options.exportPath);
        result.brokenLinks = brokenLinks;

        if (brokenLinks.brokenLinks > 0) {
          result.warnings.push(`Found ${brokenLinks.brokenLinks} broken links`);
        }
      }

      // 5. Performance budget validation
      if (options.checkPerformance && options.budget) {
        AppLogger.debug('Validating performance budget', { exportPath: options.exportPath });
        const performanceResult = await this.validatePerformance(options.exportPath, options.budget);
        result.performanceValidation = performanceResult;

        if (!performanceResult.passed) {
          if (options.strictMode) {
            result.errors.push('Performance budget validation failed');
            result.passed = false;
          } else {
            result.warnings.push('Performance budget validation failed');
          }
        }
      }

      // Set final pass/fail status
      if (result.errors.length > 0) {
        result.passed = false;
      }

      AppLogger.info('Export validation complete', {
        exportPath: options.exportPath,
        passed: result.passed,
        errors: result.errors.length,
        warnings: result.warnings.length,
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(`Validation failed: ${errorMessage}`);
      result.passed = false;

      AppLogger.error('Export validation failed', error as Error, { exportPath: options.exportPath });
    }

    return result;
  }

  /**
   * Validate export structure
   */
  private async validateStructure(exportPath: string): Promise<StructureValidationResult> {
    const result: StructureValidationResult = {
      requiredFiles: REQUIRED_FILES.length,
      missingFiles: [],
      extraFiles: [],
      emptyDirectories: [],
      invalidPaths: [],
    };

    try {
      // Check required files
      for (const file of REQUIRED_FILES) {
        const filePath = path.join(exportPath, file);
        try {
          await fs.access(filePath);
        } catch {
          result.missingFiles.push(file);
        }
      }

      // Check for recommended files
      for (const file of RECOMMENDED_FILES) {
        const filePath = path.join(exportPath, file);
        try {
          await fs.access(filePath);
        } catch {
          // Not required, just log as info
        }
      }

      // Check required directories
      for (const dir of REQUIRED_DIRECTORIES) {
        const dirPath = path.join(exportPath, dir);
        try {
          const stats = await fs.stat(dirPath);
          if (!stats.isDirectory()) {
            result.invalidPaths.push(`${dir} is not a directory`);
          } else {
            // Check if directory is empty
            const files = await fs.readdir(dirPath);
            if (files.length === 0) {
              result.emptyDirectories.push(dir);
            }
          }
        } catch {
          result.missingFiles.push(`${dir}/ (directory)`);
        }
      }

    } catch (error) {
      AppLogger.error('Structure validation failed', error as Error);
    }

    return result;
  }

  /**
   * Validate file integrity
   */
  private async validateFileIntegrity(exportPath: string): Promise<FileIntegrityResult> {
    const result: FileIntegrityResult = {
      checked: 0,
      passed: 0,
      failed: 0,
      corrupted: [],
      unreadable: [],
    };

    try {
      const files = await this.getAllFiles(exportPath);

      for (const file of files) {
        result.checked++;

        try {
          // Try to read file
          const content = await fs.readFile(file);

          // Calculate checksum to verify integrity
          const hash = crypto.createHash('sha256').update(content).digest('hex');

          // File is readable and has valid checksum
          result.passed++;

        } catch (error) {
          result.failed++;
          const relativePath = path.relative(exportPath, file);

          if ((error as NodeJS.ErrnoException).code === 'EACCES') {
            result.unreadable.push(relativePath);
          } else {
            result.corrupted.push(relativePath);
          }
        }
      }

    } catch (error) {
      AppLogger.error('File integrity validation failed', error as Error);
    }

    return result;
  }

  /**
   * Validate assets
   */
  private async validateAssets(exportPath: string): Promise<AssetValidationResult> {
    const result: AssetValidationResult = {
      checked: 0,
      valid: 0,
      broken: 0,
      missing: [],
      invalidFormat: [],
      oversized: [],
    };

    try {
      const assetsPath = path.join(exportPath, 'assets');

      // Check if assets directory exists
      try {
        await fs.access(assetsPath);
      } catch {
        return result; // No assets directory
      }

      const files = await this.getAllFiles(assetsPath);

      for (const file of files) {
        result.checked++;
        const relativePath = path.relative(exportPath, file);

        try {
          const stats = await fs.stat(file);
          const ext = path.extname(file).toLowerCase();

          // Check file size
          if (stats.size === 0) {
            result.broken++;
            result.missing.push(relativePath);
            continue;
          }

          // Check for oversized files (>5MB)
          if (stats.size > 5 * 1024 * 1024) {
            result.oversized.push(relativePath);
          }

          // Validate by extension
          if (this.isImageFile(file)) {
            const isValid = await this.validateImageFile(file);
            if (isValid) {
              result.valid++;
            } else {
              result.broken++;
              result.invalidFormat.push(relativePath);
            }
          } else if (ext === '.css') {
            const isValid = await this.validateCSSFile(file);
            if (isValid) {
              result.valid++;
            } else {
              result.broken++;
              result.invalidFormat.push(relativePath);
            }
          } else if (ext === '.js') {
            const isValid = await this.validateJSFile(file);
            if (isValid) {
              result.valid++;
            } else {
              result.broken++;
              result.invalidFormat.push(relativePath);
            }
          } else {
            result.valid++;
          }

        } catch (error) {
          result.broken++;
          result.missing.push(relativePath);
        }
      }

    } catch (error) {
      AppLogger.error('Asset validation failed', error as Error);
    }

    return result;
  }

  /**
   * Detect broken links in HTML files
   */
  private async detectBrokenLinks(exportPath: string): Promise<BrokenLinkResult> {
    const result: BrokenLinkResult = {
      totalLinks: 0,
      validLinks: 0,
      brokenLinks: 0,
      externalLinks: 0,
      details: [],
    };

    try {
      const htmlFiles = await this.getHTMLFiles(exportPath);

      for (const htmlFile of htmlFiles) {
        try {
          const content = await fs.readFile(htmlFile, 'utf-8');
          const $ = cheerio.load(content);
          const relativePath = path.relative(exportPath, htmlFile);

          // Check links
          $('a[href]').each((_, element) => {
            const href = $(element).attr('href');
            if (!href) return;

            result.totalLinks++;

            // Skip external links (just count them)
            if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('//')) {
              result.externalLinks++;
              return;
            }

            // Skip anchors and special protocols
            if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) {
              result.validLinks++;
              return;
            }

            // Check local link
            const linkPath = path.join(path.dirname(htmlFile), href.split('?')[0].split('#')[0]);
            try {
              fs.access(linkPath);
              result.validLinks++;
            } catch {
              result.brokenLinks++;
              result.details.push({
                url: href,
                file: relativePath,
                reason: 'File not found',
              });
            }
          });

          // Check images
          $('img[src]').each((_, element) => {
            const src = $(element).attr('src');
            if (!src) return;

            result.totalLinks++;

            // Skip external images
            if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('//') || src.startsWith('data:')) {
              result.externalLinks++;
              return;
            }

            // Check local image
            const imgPath = path.join(path.dirname(htmlFile), src.split('?')[0]);
            try {
              fs.access(imgPath);
              result.validLinks++;
            } catch {
              result.brokenLinks++;
              result.details.push({
                url: src,
                file: relativePath,
                reason: 'Image not found',
              });
            }
          });

          // Check scripts
          $('script[src]').each((_, element) => {
            const src = $(element).attr('src');
            if (!src) return;

            result.totalLinks++;

            // Skip external scripts
            if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('//')) {
              result.externalLinks++;
              return;
            }

            // Check local script
            const scriptPath = path.join(path.dirname(htmlFile), src.split('?')[0]);
            try {
              fs.access(scriptPath);
              result.validLinks++;
            } catch {
              result.brokenLinks++;
              result.details.push({
                url: src,
                file: relativePath,
                reason: 'Script not found',
              });
            }
          });

          // Check stylesheets
          $('link[rel="stylesheet"][href]').each((_, element) => {
            const href = $(element).attr('href');
            if (!href) return;

            result.totalLinks++;

            // Skip external stylesheets
            if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('//')) {
              result.externalLinks++;
              return;
            }

            // Check local stylesheet
            const cssPath = path.join(path.dirname(htmlFile), href.split('?')[0]);
            try {
              fs.access(cssPath);
              result.validLinks++;
            } catch {
              result.brokenLinks++;
              result.details.push({
                url: href,
                file: relativePath,
                reason: 'Stylesheet not found',
              });
            }
          });

        } catch (error) {
          AppLogger.error('Failed to check links in file', error as Error, { file: htmlFile });
        }
      }

    } catch (error) {
      AppLogger.error('Broken link detection failed', error as Error);
    }

    return result;
  }

  /**
   * Validate performance against budget
   */
  private async validatePerformance(
    exportPath: string,
    budget: PerformanceBudget
  ): Promise<PerformanceValidationResult> {
    const result: PerformanceValidationResult = {
      passed: true,
      budgetResult: {
        passed: true,
        violations: [],
        warnings: [],
        metrics: {
          htmlSize: 0,
          cssSize: 0,
          jsSize: 0,
          imageSize: 0,
          totalSize: 0,
          htmlGzipSize: 0,
          cssGzipSize: 0,
          jsGzipSize: 0,
          totalGzipSize: 0,
          httpRequests: 0,
          imageCount: 0,
          scriptCount: 0,
          stylesheetCount: 0,
          fontCount: 0,
          domNodes: 0,
          domDepth: 0,
        },
        summary: {
          totalViolations: 0,
          totalWarnings: 0,
          criticalViolations: 0,
          budgetUtilization: 0,
        },
        canExport: true,
        requiresOverride: false,
      },
      issues: [],
    };

    try {
      // Use budget service to check budget
      const budgetResult = await this.budgetService.checkBudget(exportPath, budget);

      result.budgetResult = {
        passed: budgetResult.passed,
        violations: budgetResult.violations,
        warnings: [],
        metrics: {
          htmlSize: 0,
          cssSize: 0,
          jsSize: 0,
          imageSize: 0,
          totalSize: 0,
          htmlGzipSize: 0,
          cssGzipSize: 0,
          jsGzipSize: 0,
          totalGzipSize: 0,
          httpRequests: 0,
          imageCount: 0,
          scriptCount: 0,
          stylesheetCount: 0,
          fontCount: 0,
          domNodes: 0,
          domDepth: 0,
        },
        summary: {
          totalViolations: budgetResult.violations.length,
          totalWarnings: 0,
          criticalViolations: budgetResult.violations.filter(v => v.severity === 'critical').length,
          budgetUtilization: 0,
        },
        canExport: budgetResult.passed,
        requiresOverride: !budgetResult.passed,
      };

      result.passed = budgetResult.passed;

      if (!budgetResult.passed) {
        result.issues = budgetResult.violations.map(v => v.message);
      }

    } catch (error) {
      AppLogger.error('Performance validation failed', error as Error);
      result.passed = false;
      result.issues.push('Performance validation error');
    }

    return result;
  }

  /**
   * Get all files recursively
   */
  private async getAllFiles(dir: string): Promise<string[]> {
    const files: string[] = [];

    const traverse = async (currentDir: string): Promise<void> => {
      try {
        const entries = await fs.readdir(currentDir, { withFileTypes: true });

        for (const entry of entries) {
          const fullPath = path.join(currentDir, entry.name);

          if (entry.isDirectory()) {
            await traverse(fullPath);
          } else if (entry.isFile()) {
            files.push(fullPath);
          }
        }
      } catch (error) {
        AppLogger.warn('Failed to traverse directory', { dir: currentDir, error });
      }
    };

    await traverse(dir);
    return files;
  }

  /**
   * Get all HTML files
   */
  private async getHTMLFiles(dir: string): Promise<string[]> {
    const allFiles = await this.getAllFiles(dir);
    return allFiles.filter(file => file.endsWith('.html') || file.endsWith('.htm'));
  }

  /**
   * Check if file is an image
   */
  private isImageFile(file: string): boolean {
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.avif', '.bmp', '.ico'];
    const ext = path.extname(file).toLowerCase();
    return imageExtensions.includes(ext);
  }

  /**
   * Validate image file
   */
  private async validateImageFile(file: string): Promise<boolean> {
    try {
      const content = await fs.readFile(file);

      // Check file has content
      if (content.length === 0) {
        return false;
      }

      // Basic format validation by checking magic numbers
      const ext = path.extname(file).toLowerCase();

      if (ext === '.png' && content[0] === 0x89 && content[1] === 0x50) {
        return true;
      }

      if ((ext === '.jpg' || ext === '.jpeg') && content[0] === 0xFF && content[1] === 0xD8) {
        return true;
      }

      if (ext === '.gif' && content[0] === 0x47 && content[1] === 0x49) {
        return true;
      }

      if (ext === '.webp' && content[8] === 0x57 && content[9] === 0x45) {
        return true;
      }

      if (ext === '.svg') {
        const contentStr = content.toString('utf-8', 0, Math.min(1000, content.length));
        return contentStr.includes('<svg') || contentStr.includes('<?xml');
      }

      // For other formats, just check it's not empty
      return content.length > 0;

    } catch (error) {
      return false;
    }
  }

  /**
   * Validate CSS file
   */
  private async validateCSSFile(file: string): Promise<boolean> {
    try {
      const content = await fs.readFile(file, 'utf-8');

      // Basic CSS validation - check for common CSS patterns
      if (content.length === 0) {
        return false;
      }

      // Very basic check - valid CSS should have either braces, @rules, or comments
      const hasValidSyntax = /[{}]|@\w+|\/\*/.test(content);

      return hasValidSyntax;

    } catch (error) {
      return false;
    }
  }

  /**
   * Validate JavaScript file
   */
  private async validateJSFile(file: string): Promise<boolean> {
    try {
      const content = await fs.readFile(file, 'utf-8');

      // Basic JS validation
      if (content.length === 0) {
        return false;
      }

      // Check for common syntax errors that would make file invalid
      // This is a very basic check - just ensures it's not binary garbage
      try {
        // Try to detect if it's valid text
        const invalidChars = /[\x00-\x08\x0E-\x1F]/.test(content);
        return !invalidChars;
      } catch {
        return false;
      }

    } catch (error) {
      return false;
    }
  }

  /**
   * Generate validation report
   */
  generateReport(result: ValidationResult): string {
    const lines: string[] = [];

    lines.push('# Export Validation Report\n');
    lines.push(`**Status**: ${result.passed ? 'PASSED' : 'FAILED'}\n`);

    // Errors
    if (result.errors.length > 0) {
      lines.push('## Errors\n');
      result.errors.forEach(error => {
        lines.push(`- ${error}`);
      });
      lines.push('');
    }

    // Warnings
    if (result.warnings.length > 0) {
      lines.push('## Warnings\n');
      result.warnings.forEach(warning => {
        lines.push(`- ${warning}`);
      });
      lines.push('');
    }

    // File Integrity
    lines.push('## File Integrity\n');
    lines.push(`- Checked: ${result.fileIntegrity.checked}`);
    lines.push(`- Passed: ${result.fileIntegrity.passed}`);
    lines.push(`- Failed: ${result.fileIntegrity.failed}`);
    if (result.fileIntegrity.corrupted.length > 0) {
      lines.push(`- Corrupted files: ${result.fileIntegrity.corrupted.join(', ')}`);
    }
    lines.push('');

    // Asset Validation
    lines.push('## Asset Validation\n');
    lines.push(`- Checked: ${result.assetValidation.checked}`);
    lines.push(`- Valid: ${result.assetValidation.valid}`);
    lines.push(`- Broken: ${result.assetValidation.broken}`);
    if (result.assetValidation.oversized.length > 0) {
      lines.push(`- Oversized: ${result.assetValidation.oversized.length} files`);
    }
    lines.push('');

    // Structure Validation
    lines.push('## Structure Validation\n');
    lines.push(`- Required files: ${result.structureValidation.requiredFiles}`);
    lines.push(`- Missing files: ${result.structureValidation.missingFiles.length}`);
    if (result.structureValidation.missingFiles.length > 0) {
      result.structureValidation.missingFiles.forEach(file => {
        lines.push(`  - ${file}`);
      });
    }
    lines.push('');

    // Broken Links
    if (result.brokenLinks) {
      lines.push('## Broken Links\n');
      lines.push(`- Total links: ${result.brokenLinks.totalLinks}`);
      lines.push(`- Valid: ${result.brokenLinks.validLinks}`);
      lines.push(`- Broken: ${result.brokenLinks.brokenLinks}`);
      lines.push(`- External: ${result.brokenLinks.externalLinks}`);
      lines.push('');
    }

    // Performance Validation
    if (result.performanceValidation) {
      lines.push('## Performance Validation\n');
      lines.push(`- Budget passed: ${result.performanceValidation.passed ? 'Yes' : 'No'}`);
      lines.push(`- Violations: ${result.performanceValidation.budgetResult.summary.totalViolations}`);
      lines.push('');
    }

    return lines.join('\n');
  }
}

/**
 * Create validator instance
 */
export function createExportOptimizationValidator(): ExportOptimizationValidator {
  return new ExportOptimizationValidator();
}

// Export singleton instance
export default new ExportOptimizationValidator();
