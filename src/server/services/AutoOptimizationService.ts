/**
 * Auto-Apply Optimization Service
 *
 * Automatically applies performance recommendations to exports
 * Features:
 * - Auto-applies optimization recommendations
 * - Integrates with export pipeline
 * - Enforces performance budgets
 * - Validates optimizations
 * - Generates optimization reports
 */

import { OptimizationService } from './OptimizationService.js';
import { PerformanceBudgetService, type PerformanceBudget, type BudgetViolation } from './PerformanceBudgetService.js';
import { PerformanceAuditService, type PerformanceRecommendation } from './PerformanceAuditService.js';
import type { OptimizationSettings, PerformanceIssue } from '../../shared/types/index.js';
import * as cheerio from 'cheerio';
import * as fs from 'fs/promises';
import * as path from 'path';
import { AppLogger } from '../utils/logger.js';

export interface AutoOptimizationOptions {
  targetDir: string;
  budget?: PerformanceBudget;
  applyAll?: boolean; // Apply all recommendations
  aggressive?: boolean; // Use aggressive optimization
  dryRun?: boolean; // Preview without applying
  skipBackup?: boolean; // Skip creating backups
}

export interface OptimizationAction {
  type: 'image' | 'css' | 'js' | 'html' | 'font' | 'resource-hint';
  file: string;
  action: string;
  recommendation: PerformanceRecommendation;
  applied: boolean;
  error?: string;
  before?: {
    size: number;
    gzipSize?: number;
  };
  after?: {
    size: number;
    gzipSize?: number;
  };
  savings?: {
    bytes: number;
    percentage: number;
  };
}

export interface AutoOptimizationResult {
  success: boolean;
  actionsApplied: number;
  actionsFailed: number;
  totalActions: number;
  actions: OptimizationAction[];
  budgetViolations: BudgetViolation[];
  budgetPassed: boolean;
  summary: {
    totalSavings: number;
    percentageReduction: number;
    originalSize: number;
    optimizedSize: number;
  };
  timing: {
    started: Date;
    completed: Date;
    duration: number;
  };
}

/**
 * Auto-Apply Optimization Service
 */
export class AutoOptimizationService {
  private optimizationService: OptimizationService;
  private budgetService: PerformanceBudgetService;
  private auditService: PerformanceAuditService;

  constructor() {
    this.optimizationService = new OptimizationService();
    this.budgetService = new PerformanceBudgetService();
    this.auditService = new PerformanceAuditService();
  }

  /**
   * Auto-apply optimizations to export directory
   */
  async autoOptimize(options: AutoOptimizationOptions): Promise<AutoOptimizationResult> {
    const startTime = Date.now();
    const result: AutoOptimizationResult = {
      success: false,
      actionsApplied: 0,
      actionsFailed: 0,
      totalActions: 0,
      actions: [],
      budgetViolations: [],
      budgetPassed: false,
      summary: {
        totalSavings: 0,
        percentageReduction: 0,
        originalSize: 0,
        optimizedSize: 0,
      },
      timing: {
        started: new Date(),
        completed: new Date(),
        duration: 0,
      },
    };

    try {
      AppLogger.info('Starting auto-optimization', { targetDir: options.targetDir });

      // 1. Create backup if not skipped
      if (!options.skipBackup && !options.dryRun) {
        await this.createBackup(options.targetDir);
      }

      // 2. Run performance audit to get recommendations
      const recommendations = await this.getRecommendations(options.targetDir);
      AppLogger.info('Performance audit complete', { recommendationsCount: recommendations.length });

      // 3. Apply optimizations based on recommendations
      for (const recommendation of recommendations) {
        const action = await this.applyRecommendation(
          recommendation,
          options.targetDir,
          options.aggressive || false,
          options.dryRun || false
        );

        result.actions.push(action);
        result.totalActions++;

        if (action.applied) {
          result.actionsApplied++;

          if (action.savings) {
            result.summary.totalSavings += action.savings.bytes;
          }
        } else if (action.error) {
          result.actionsFailed++;
        }
      }

      // 4. Check performance budget if provided
      if (options.budget) {
        const budgetResult = await this.budgetService.checkBudget(options.targetDir, options.budget);
        result.budgetViolations = budgetResult.violations;
        result.budgetPassed = budgetResult.passed;

        AppLogger.info('Performance budget check', {
          passed: budgetResult.passed,
          violations: budgetResult.violations.length,
        });
      }

      // 5. Calculate summary
      result.summary.originalSize = result.actions.reduce((sum, a) => sum + (a.before?.size || 0), 0);
      result.summary.optimizedSize = result.actions.reduce((sum, a) => sum + (a.after?.size || 0), 0);

      if (result.summary.originalSize > 0) {
        result.summary.percentageReduction =
          ((result.summary.originalSize - result.summary.optimizedSize) / result.summary.originalSize) * 100;
      }

      result.success = result.actionsFailed === 0 && (!options.budget || result.budgetPassed);

      const endTime = Date.now();
      result.timing.completed = new Date();
      result.timing.duration = endTime - startTime;

      AppLogger.info('Auto-optimization complete', {
        success: result.success,
        actionsApplied: result.actionsApplied,
        actionsFailed: result.actionsFailed,
        totalSavings: result.summary.totalSavings,
        duration: result.timing.duration,
      });
    } catch (error) {
      AppLogger.error('Auto-optimization failed', error as Error);
      result.success = false;
      result.actionsFailed = result.totalActions - result.actionsApplied;
    }

    return result;
  }

  /**
   * Get optimization recommendations from performance audit
   */
  private async getRecommendations(targetDir: string): Promise<PerformanceRecommendation[]> {
    try {
      // Run performance audit
      const auditResult = await this.auditService.auditDirectory(targetDir);

      return auditResult.recommendations || [];
    } catch (error) {
      AppLogger.error('Failed to get recommendations', error as Error);
      return [];
    }
  }

  /**
   * Apply a single recommendation
   */
  private async applyRecommendation(
    recommendation: PerformanceRecommendation,
    targetDir: string,
    aggressive: boolean,
    dryRun: boolean
  ): Promise<OptimizationAction> {
    const action: OptimizationAction = {
      type: this.getActionType(recommendation),
      file: recommendation.resource || '',
      action: recommendation.title,
      recommendation,
      applied: false,
    };

    try {
      // Get file path
      const filePath = path.join(targetDir, action.file);

      // Check if file exists
      try {
        await fs.access(filePath);
      } catch {
        action.error = 'File not found';
        return action;
      }

      // Get original file stats
      const originalStats = await fs.stat(filePath);
      action.before = {
        size: originalStats.size,
      };

      if (dryRun) {
        action.applied = true;
        action.after = action.before; // No changes in dry run
        return action;
      }

      // Apply optimization based on type
      switch (action.type) {
        case 'image':
          await this.optimizeImage(filePath, aggressive);
          break;

        case 'css':
          await this.optimizeCSS(filePath, aggressive);
          break;

        case 'js':
          await this.optimizeJS(filePath, aggressive);
          break;

        case 'html':
          await this.optimizeHTML(filePath, aggressive);
          break;

        case 'font':
          await this.optimizeFont(filePath, aggressive);
          break;

        case 'resource-hint':
          // Resource hints are added to HTML files
          await this.addResourceHints(targetDir, recommendation);
          break;

        default:
          action.error = `Unknown optimization type: ${action.type}`;
          return action;
      }

      // Get optimized file stats
      const optimizedStats = await fs.stat(filePath);
      action.after = {
        size: optimizedStats.size,
      };

      // Calculate savings
      action.savings = {
        bytes: action.before.size - action.after.size,
        percentage: ((action.before.size - action.after.size) / action.before.size) * 100,
      };

      action.applied = true;

      AppLogger.debug('Optimization applied', {
        file: action.file,
        type: action.type,
        savings: action.savings,
      });
    } catch (error) {
      action.error = error instanceof Error ? error.message : 'Unknown error';
      AppLogger.error('Failed to apply optimization', {
        file: action.file,
        error: action.error,
      });
    }

    return action;
  }

  /**
   * Determine action type from recommendation
   */
  private getActionType(recommendation: PerformanceRecommendation): OptimizationAction['type'] {
    const resource = recommendation.resource?.toLowerCase() || '';
    const title = recommendation.title.toLowerCase();

    if (resource.match(/\.(jpg|jpeg|png|gif|webp|svg)$/)) {
      return 'image';
    }

    if (resource.match(/\.css$/)) {
      return 'css';
    }

    if (resource.match(/\.js$/)) {
      return 'js';
    }

    if (resource.match(/\.(woff|woff2|ttf|otf)$/)) {
      return 'font';
    }

    if (resource.match(/\.html$/)) {
      return 'html';
    }

    if (title.includes('preload') || title.includes('preconnect') || title.includes('dns-prefetch')) {
      return 'resource-hint';
    }

    return 'html'; // Default
  }

  /**
   * Optimize image file
   */
  private async optimizeImage(filePath: string, aggressive: boolean): Promise<void> {
    const settings: OptimizationSettings = {
      images: {
        format: 'auto',
        quality: aggressive ? 70 : 85,
        responsive: true,
        lazyLoad: true,
        compressionType: aggressive ? 'lossy' : 'lossless',
        generateSrcset: false,
      },
      css: { minify: false, extractCritical: false, removeUnused: false },
      javascript: { minify: false, defer: false, async: false },
      html: { minify: false },
    };

    await this.optimizationService.optimizeImage(filePath, filePath, settings.images);
  }

  /**
   * Optimize CSS file
   */
  private async optimizeCSS(filePath: string, aggressive: boolean): Promise<void> {
    const settings: OptimizationSettings = {
      images: { format: 'auto', quality: 85, responsive: false, lazyLoad: false },
      css: {
        minify: true,
        extractCritical: aggressive,
        removeUnused: aggressive,
        inline: false,
      },
      javascript: { minify: false, defer: false, async: false },
      html: { minify: false },
    };

    await this.optimizationService.optimizeCSS(filePath, filePath, settings.css);
  }

  /**
   * Optimize JavaScript file
   */
  private async optimizeJS(filePath: string, aggressive: boolean): Promise<void> {
    const settings: OptimizationSettings = {
      images: { format: 'auto', quality: 85, responsive: false, lazyLoad: false },
      css: { minify: false, extractCritical: false, removeUnused: false },
      javascript: {
        minify: true,
        defer: aggressive,
        async: false,
        removeUnused: aggressive,
      },
      html: { minify: false },
    };

    await this.optimizationService.optimizeJS(filePath, filePath, settings.javascript);
  }

  /**
   * Optimize HTML file
   */
  private async optimizeHTML(filePath: string, aggressive: boolean): Promise<void> {
    const settings: OptimizationSettings = {
      images: { format: 'auto', quality: 85, responsive: false, lazyLoad: false },
      css: { minify: false, extractCritical: false, removeUnused: false },
      javascript: { minify: false, defer: false, async: false },
      html: {
        minify: true,
        addResourceHints: aggressive,
        lazyLoadIframes: aggressive,
      },
    };

    await this.optimizationService.optimizeHTML(filePath, filePath, settings.html);
  }

  /**
   * Optimize font file
   */
  private async optimizeFont(filePath: string, aggressive: boolean): Promise<void> {
    // Font optimization using OptimizationService
    await this.optimizationService.optimizeFont(filePath, path.dirname(filePath), {
      subset: aggressive,
      unicodeRange: aggressive ? 'latin' : undefined,
    });
  }

  /**
   * Add resource hints to HTML files
   */
  private async addResourceHints(targetDir: string, recommendation: PerformanceRecommendation): Promise<void> {
    // Find HTML files
    const htmlFiles = await this.findHTMLFiles(targetDir);

    for (const htmlFile of htmlFiles) {
      await this.addResourceHintsToFile(htmlFile, recommendation);
    }
  }

  /**
   * Add resource hints to a single HTML file
   */
  private async addResourceHintsToFile(filePath: string, recommendation: PerformanceRecommendation): Promise<void> {
    const html = await fs.readFile(filePath, 'utf-8');
    const $ = cheerio.load(html);

    // Determine hint type from recommendation
    const hintType = this.getResourceHintType(recommendation);
    const resource = recommendation.resource || '';

    // Add hint to head
    if (hintType && resource) {
      const existingHint = $(`head link[rel="${hintType}"][href="${resource}"]`);

      if (existingHint.length === 0) {
        $('head').prepend(`<link rel="${hintType}" href="${resource}" />`);
        await fs.writeFile(filePath, $.html());
      }
    }
  }

  /**
   * Get resource hint type from recommendation
   */
  private getResourceHintType(recommendation: PerformanceRecommendation): string | null {
    const title = recommendation.title.toLowerCase();

    if (title.includes('preload')) {
      return 'preload';
    }

    if (title.includes('preconnect')) {
      return 'preconnect';
    }

    if (title.includes('dns-prefetch')) {
      return 'dns-prefetch';
    }

    if (title.includes('prefetch')) {
      return 'prefetch';
    }

    return null;
  }

  /**
   * Find all HTML files in directory
   */
  private async findHTMLFiles(dir: string): Promise<string[]> {
    const htmlFiles: string[] = [];

    const traverse = async (currentDir: string): Promise<void> => {
      const entries = await fs.readdir(currentDir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name);

        if (entry.isDirectory()) {
          await traverse(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.html')) {
          htmlFiles.push(fullPath);
        }
      }
    };

    await traverse(dir);
    return htmlFiles;
  }

  /**
   * Create backup of directory
   */
  private async createBackup(targetDir: string): Promise<string> {
    const backupDir = `${targetDir}_backup_${Date.now()}`;

    await fs.cp(targetDir, backupDir, { recursive: true });

    AppLogger.info('Backup created', { backupDir });
    return backupDir;
  }

  /**
   * Generate optimization report
   */
  generateReport(result: AutoOptimizationResult): string {
    const lines: string[] = [];

    lines.push('# Auto-Optimization Report\n');
    lines.push(`**Status**: ${result.success ? '✅ Success' : '❌ Failed'}\n`);
    lines.push(`**Duration**: ${(result.timing.duration / 1000).toFixed(2)}s\n`);
    lines.push(`**Actions Applied**: ${result.actionsApplied} / ${result.totalActions}\n`);
    lines.push(`**Actions Failed**: ${result.actionsFailed}\n\n`);

    // Summary
    lines.push('## Summary\n');
    lines.push(`- **Original Size**: ${this.formatBytes(result.summary.originalSize)}`);
    lines.push(`- **Optimized Size**: ${this.formatBytes(result.summary.optimizedSize)}`);
    lines.push(`- **Total Savings**: ${this.formatBytes(result.summary.totalSavings)} (${result.summary.percentageReduction.toFixed(2)}%)\n`);

    // Budget violations
    if (result.budgetViolations.length > 0) {
      lines.push('## Performance Budget Violations\n');

      for (const violation of result.budgetViolations) {
        lines.push(`- **${violation.metric}**: ${this.formatBytes(violation.actual)} / ${this.formatBytes(violation.budget)} (${violation.exceeded > 0 ? '+' : ''}${this.formatBytes(violation.exceeded)})`);
      }

      lines.push('');
    }

    // Actions
    lines.push('## Optimization Actions\n');

    for (const action of result.actions) {
      const status = action.applied ? '✅' : '❌';
      const savings = action.savings ? ` (saved ${this.formatBytes(action.savings.bytes)})` : '';

      lines.push(`${status} **${action.type}**: ${action.file}${savings}`);

      if (action.error) {
        lines.push(`   Error: ${action.error}`);
      }
    }

    return lines.join('\n');
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
 * Create auto-optimization service instance
 */
export function createAutoOptimizationService(): AutoOptimizationService {
  return new AutoOptimizationService();
}
