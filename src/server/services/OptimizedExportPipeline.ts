/**
 * Optimized Export Pipeline Service
 *
 * Complete pipeline service that integrates auto-optimization, budget enforcement,
 * package generation, verification, and validation into a seamless export process.
 *
 * Features:
 * - Pre-export analysis
 * - Auto-apply optimizations
 * - Performance budget enforcement (strict/warning/disabled modes)
 * - Package generation with manifests
 * - Post-export verification
 * - Detailed reporting
 * - Progress callbacks
 * - Error recovery and rollback capabilities
 */

import { AutoOptimizationService, type AutoOptimizationResult, type AutoOptimizationOptions } from './AutoOptimizationService.js';
import { PerformanceBudgetService, type PerformanceBudget, type BudgetValidationResult } from './PerformanceBudgetService.js';
import { ExportPackageService, type ExportPackage, type ExportMetadata } from './ExportPackageService.js';
import { PerformanceAuditService } from './PerformanceAuditService.js';
import { ExportOptimizationValidator } from './ExportOptimizationValidator.js';
import { PerformanceOptimizedPackageService } from './PerformanceOptimizedPackageService.js';
import { AppLogger } from './logger.service.js';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Export progress stages
 */
export type ExportStage = 'analyzing' | 'optimizing' | 'packaging' | 'verifying' | 'complete' | 'error' | 'rollback';

/**
 * Budget enforcement modes
 */
export type BudgetEnforcementMode = 'strict' | 'warning' | 'disabled';

/**
 * Export format options
 */
export type ExportFormat = 'zip' | 'tar' | 'tar.gz' | 'folder';

/**
 * Export progress information
 */
export interface ExportProgress {
  stage: ExportStage;
  percentage: number;
  message: string;
  currentFile?: string;
  processedFiles?: number;
  totalFiles?: number;
  estimatedTimeRemaining?: number; // milliseconds
}

/**
 * Optimized export options
 */
export interface OptimizedExportOptions {
  projectId: string;
  outputPath: string;
  budget?: PerformanceBudget;
  autoOptimize?: boolean;
  budgetEnforcement?: BudgetEnforcementMode;
  format?: ExportFormat;
  includeSourceMaps?: boolean;
  compressionLevel?: number; // 0-9
  onProgress?: (progress: ExportProgress) => void;
  aggressive?: boolean; // Use aggressive optimization
  dryRun?: boolean; // Preview without applying
  skipBackup?: boolean;
  includePerformanceReport?: boolean;
  includeBudgetReport?: boolean;
  includeManifest?: boolean;
  validateBeforeExport?: boolean;
  validateAfterExport?: boolean;
  customMetadata?: Record<string, any>;
}

/**
 * Export manifest with comprehensive metadata
 */
export interface ExportManifest {
  exportId: string;
  timestamp: number;
  version: string;
  projectId: string;
  options: OptimizedExportOptions;
  files: {
    path: string;
    size: number;
    hash?: string;
    optimized: boolean;
  }[];
  optimization: {
    applied: boolean;
    actionsCount: number;
    totalSavings: number;
    percentageReduction: number;
  };
  budget: {
    enforced: boolean;
    mode: BudgetEnforcementMode;
    passed: boolean;
    violations: number;
  };
  verification: {
    performed: boolean;
    passed: boolean;
    issues: number;
  };
  performance: {
    totalDuration: number;
    stages: Record<string, number>;
  };
}

/**
 * Verification result details
 */
export interface VerificationResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
  info: string[];
  fileIntegrity: {
    checked: number;
    passed: number;
    failed: number;
  };
  assetValidation: {
    checked: number;
    valid: number;
    broken: number;
  };
  structureValidation: {
    requiredFiles: number;
    missingFiles: string[];
    extraFiles: string[];
  };
}

/**
 * Optimized export result
 */
export interface OptimizedExportResult {
  success: boolean;
  exportId: string;
  exportPath: string;
  manifest: ExportManifest;
  optimization: AutoOptimizationResult;
  budget: BudgetValidationResult | null;
  verification: VerificationResult;
  timing: {
    total: number;
    analysis: number;
    optimization: number;
    packaging: number;
    verification: number;
  };
  warnings: string[];
  errors: string[];
  canRollback: boolean;
  backupPath?: string;
}

/**
 * Export state for rollback
 */
interface ExportState {
  exportId: string;
  stage: ExportStage;
  backupPath?: string;
  tempPath?: string;
  startTime: number;
  options: OptimizedExportOptions;
}

/**
 * Optimized Export Pipeline Service
 */
export class OptimizedExportPipeline {
  private autoOptimizationService: AutoOptimizationService;
  private budgetService: PerformanceBudgetService;
  private packageService: ExportPackageService;
  private optimizedPackageService: PerformanceOptimizedPackageService;
  private auditService: PerformanceAuditService;
  private validator: ExportOptimizationValidator;

  // Track active exports for rollback
  private activeExports: Map<string, ExportState> = new Map();

  constructor() {
    this.autoOptimizationService = new AutoOptimizationService();
    this.budgetService = new PerformanceBudgetService();
    this.packageService = new ExportPackageService();
    this.optimizedPackageService = new PerformanceOptimizedPackageService();
    this.auditService = new PerformanceAuditService();
    this.validator = new ExportOptimizationValidator();
  }

  /**
   * Run optimized export pipeline
   */
  async export(options: OptimizedExportOptions): Promise<OptimizedExportResult> {
    const exportId = this.generateExportId();
    const startTime = Date.now();
    const timing = {
      total: 0,
      analysis: 0,
      optimization: 0,
      packaging: 0,
      verification: 0,
    };

    const warnings: string[] = [];
    const errors: string[] = [];

    // Initialize export state
    const state: ExportState = {
      exportId,
      stage: 'analyzing',
      startTime,
      options,
    };
    this.activeExports.set(exportId, state);

    try {
      AppLogger.info('Starting optimized export pipeline', {
        exportId,
        projectId: options.projectId,
        autoOptimize: options.autoOptimize,
        budgetEnforcement: options.budgetEnforcement,
      });

      // Report progress
      this.reportProgress(options, {
        stage: 'analyzing',
        percentage: 0,
        message: 'Initializing export pipeline...',
      });

      // Stage 1: Pre-export analysis and validation
      const analysisStart = Date.now();
      AppLogger.info('Stage 1: Pre-export analysis', { exportId });

      const preAnalysis = await this.performPreExportAnalysis(options, exportId);
      timing.analysis = Date.now() - analysisStart;

      if (preAnalysis.errors.length > 0) {
        errors.push(...preAnalysis.errors);

        if (options.validateBeforeExport) {
          throw new Error(`Pre-export validation failed: ${preAnalysis.errors.join(', ')}`);
        }
      }

      if (preAnalysis.warnings.length > 0) {
        warnings.push(...preAnalysis.warnings);
      }

      this.reportProgress(options, {
        stage: 'analyzing',
        percentage: 20,
        message: 'Pre-export analysis complete',
      });

      // Stage 2: Auto-optimization (if enabled)
      let optimizationResult: AutoOptimizationResult;

      if (options.autoOptimize !== false) {
        state.stage = 'optimizing';
        const optimizationStart = Date.now();

        AppLogger.info('Stage 2: Auto-optimization', { exportId });

        this.reportProgress(options, {
          stage: 'optimizing',
          percentage: 25,
          message: 'Starting auto-optimization...',
        });

        optimizationResult = await this.performOptimization(options, exportId);
        timing.optimization = Date.now() - optimizationStart;

        this.reportProgress(options, {
          stage: 'optimizing',
          percentage: 50,
          message: `Optimization complete: ${optimizationResult.actionsApplied} actions applied`,
        });

        AppLogger.info('Auto-optimization complete', {
          exportId,
          actionsApplied: optimizationResult.actionsApplied,
          totalSavings: optimizationResult.summary.totalSavings,
        });
      } else {
        // Create empty optimization result
        optimizationResult = this.createEmptyOptimizationResult();
        AppLogger.info('Auto-optimization skipped', { exportId });
      }

      // Stage 3: Performance budget validation
      let budgetResult: BudgetValidationResult | null = null;

      if (options.budget || options.budgetEnforcement !== 'disabled') {
        AppLogger.info('Stage 3: Performance budget validation', { exportId });

        this.reportProgress(options, {
          stage: 'optimizing',
          percentage: 55,
          message: 'Validating performance budget...',
        });

        budgetResult = await this.validateBudget(options, exportId);

        if (!budgetResult.passed) {
          const message = `Budget validation failed: ${budgetResult.summary.totalViolations} violations`;

          if (options.budgetEnforcement === 'strict') {
            errors.push(message);
            throw new Error(message);
          } else {
            warnings.push(message);
          }
        }

        this.reportProgress(options, {
          stage: 'optimizing',
          percentage: 60,
          message: budgetResult.passed ? 'Budget validation passed' : 'Budget validation warnings',
        });
      }

      // Stage 4: Package generation
      state.stage = 'packaging';
      const packagingStart = Date.now();

      AppLogger.info('Stage 4: Package generation', { exportId });

      this.reportProgress(options, {
        stage: 'packaging',
        percentage: 65,
        message: 'Generating export package...',
      });

      const exportPath = await this.generatePackage(options, exportId, optimizationResult, budgetResult);
      state.tempPath = exportPath;
      timing.packaging = Date.now() - packagingStart;

      this.reportProgress(options, {
        stage: 'packaging',
        percentage: 85,
        message: 'Package generation complete',
      });

      // Stage 5: Post-export verification
      let verificationResult: VerificationResult;

      if (options.validateAfterExport !== false) {
        state.stage = 'verifying';
        const verificationStart = Date.now();

        AppLogger.info('Stage 5: Post-export verification', { exportId });

        this.reportProgress(options, {
          stage: 'verifying',
          percentage: 90,
          message: 'Verifying export package...',
        });

        verificationResult = await this.performVerification(exportPath, options, exportId);
        timing.verification = Date.now() - verificationStart;

        if (!verificationResult.passed) {
          warnings.push(`Verification issues: ${verificationResult.errors.length} errors, ${verificationResult.warnings.length} warnings`);
        }

        this.reportProgress(options, {
          stage: 'verifying',
          percentage: 95,
          message: 'Verification complete',
        });
      } else {
        verificationResult = this.createEmptyVerificationResult();
        AppLogger.info('Post-export verification skipped', { exportId });
      }

      // Generate manifest
      const manifest = this.generateManifest(
        exportId,
        options,
        optimizationResult,
        budgetResult,
        verificationResult,
        timing
      );

      // Save manifest
      await this.saveManifest(exportPath, manifest);

      // Complete
      state.stage = 'complete';
      timing.total = Date.now() - startTime;

      this.reportProgress(options, {
        stage: 'complete',
        percentage: 100,
        message: 'Export complete!',
      });

      const result: OptimizedExportResult = {
        success: true,
        exportId,
        exportPath,
        manifest,
        optimization: optimizationResult,
        budget: budgetResult,
        verification: verificationResult,
        timing,
        warnings,
        errors,
        canRollback: !!state.backupPath,
        backupPath: state.backupPath,
      };

      AppLogger.info('Optimized export pipeline complete', {
        exportId,
        totalDuration: timing.total,
        success: true,
      });

      return result;

    } catch (error) {
      state.stage = 'error';
      timing.total = Date.now() - startTime;

      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      errors.push(errorMessage);

      AppLogger.error('Export pipeline failed', error as Error, { exportId });

      this.reportProgress(options, {
        stage: 'error',
        percentage: 0,
        message: `Export failed: ${errorMessage}`,
      });

      // Return failed result
      return {
        success: false,
        exportId,
        exportPath: '',
        manifest: this.generateManifest(
          exportId,
          options,
          this.createEmptyOptimizationResult(),
          null,
          this.createEmptyVerificationResult(),
          timing
        ),
        optimization: this.createEmptyOptimizationResult(),
        budget: null,
        verification: this.createEmptyVerificationResult(),
        timing,
        warnings,
        errors,
        canRollback: !!state.backupPath,
        backupPath: state.backupPath,
      };
    } finally {
      // Clean up active export state (but keep for potential rollback)
      // We'll keep it for 1 hour for rollback capability
      setTimeout(() => {
        this.activeExports.delete(exportId);
      }, 3600000); // 1 hour
    }
  }

  /**
   * Preview export without applying changes (dry run)
   */
  async preview(options: OptimizedExportOptions): Promise<{
    optimizations: AutoOptimizationResult;
    budget: BudgetValidationResult | null;
    estimatedTime: number;
    estimatedSize: number;
    warnings: string[];
  }> {
    AppLogger.info('Starting export preview', { projectId: options.projectId });

    const previewOptions: OptimizedExportOptions = {
      ...options,
      dryRun: true,
      skipBackup: true,
    };

    const startTime = Date.now();

    // Run optimization in dry-run mode
    const optimizations = await this.performOptimization(previewOptions, 'preview');

    // Validate budget if provided
    let budget: BudgetValidationResult | null = null;
    if (options.budget || options.budgetEnforcement !== 'disabled') {
      budget = await this.validateBudget(previewOptions, 'preview');
    }

    // Estimate final size
    const estimatedSize = optimizations.summary.optimizedSize;

    // Calculate estimated time based on preview
    const estimatedTime = (Date.now() - startTime) * 2; // Rough estimate

    const warnings: string[] = [];
    if (budget && !budget.passed) {
      warnings.push(`Budget validation will fail with ${budget.summary.totalViolations} violations`);
    }
    if (optimizations.actionsFailed > 0) {
      warnings.push(`${optimizations.actionsFailed} optimizations may fail`);
    }

    return {
      optimizations,
      budget,
      estimatedTime,
      estimatedSize,
      warnings,
    };
  }

  /**
   * Rollback export to previous state
   */
  async rollback(exportId: string): Promise<{
    success: boolean;
    message: string;
    restoredPath?: string;
  }> {
    AppLogger.info('Starting export rollback', { exportId });

    const state = this.activeExports.get(exportId);

    if (!state) {
      return {
        success: false,
        message: 'Export not found or already cleaned up',
      };
    }

    if (!state.backupPath) {
      return {
        success: false,
        message: 'No backup available for rollback',
      };
    }

    try {
      // Restore from backup
      const targetPath = state.options.outputPath;

      // Remove current export if exists
      try {
        await fs.rm(targetPath, { recursive: true, force: true });
      } catch (error) {
        AppLogger.warn('Failed to remove current export during rollback', { error });
      }

      // Restore backup
      await fs.cp(state.backupPath, targetPath, { recursive: true });

      // Clean up temp files
      if (state.tempPath) {
        try {
          await fs.rm(state.tempPath, { recursive: true, force: true });
        } catch (error) {
          AppLogger.warn('Failed to remove temp files during rollback', { error });
        }
      }

      AppLogger.info('Export rollback successful', { exportId });

      return {
        success: true,
        message: 'Export rolled back successfully',
        restoredPath: targetPath,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      AppLogger.error('Export rollback failed', error as Error, { exportId });

      return {
        success: false,
        message: `Rollback failed: ${errorMessage}`,
      };
    }
  }

  /**
   * Get export status
   */
  getExportStatus(exportId: string): {
    found: boolean;
    stage?: ExportStage;
    startTime?: number;
    duration?: number;
    canRollback?: boolean;
  } {
    const state = this.activeExports.get(exportId);

    if (!state) {
      return { found: false };
    }

    return {
      found: true,
      stage: state.stage,
      startTime: state.startTime,
      duration: Date.now() - state.startTime,
      canRollback: !!state.backupPath,
    };
  }

  /**
   * Perform pre-export analysis
   */
  private async performPreExportAnalysis(
    options: OptimizedExportOptions,
    exportId: string
  ): Promise<{ errors: string[]; warnings: string[]; info: string[] }> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const info: string[] = [];

    try {
      // Validate output path
      const outputDir = path.dirname(options.outputPath);
      try {
        await fs.access(outputDir);
      } catch {
        errors.push(`Output directory does not exist: ${outputDir}`);
      }

      // Check if target directory exists
      try {
        const stats = await fs.stat(options.outputPath);
        if (stats.isDirectory()) {
          // Check if directory is empty
          const files = await fs.readdir(options.outputPath);
          if (files.length > 0) {
            warnings.push(`Target directory is not empty: ${options.outputPath}`);
          }
        }
      } catch {
        // Directory doesn't exist - this is fine
        info.push('Target directory will be created');
      }

      // Validate budget if provided
      if (options.budget) {
        const defaultBudget = this.budgetService.getDefaultBudget();
        const hasValidMetrics = Object.keys(options.budget).some(key =>
          key in defaultBudget && typeof (options.budget as any)[key] === 'number'
        );

        if (!hasValidMetrics) {
          warnings.push('Budget provided but contains no valid metrics');
        }
      }

      // Check compression level
      if (options.compressionLevel !== undefined) {
        if (options.compressionLevel < 0 || options.compressionLevel > 9) {
          errors.push('Compression level must be between 0 and 9');
        }
      }

      info.push(`Export format: ${options.format || 'zip'}`);
      info.push(`Auto-optimization: ${options.autoOptimize !== false ? 'enabled' : 'disabled'}`);
      info.push(`Budget enforcement: ${options.budgetEnforcement || 'warning'}`);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      errors.push(`Pre-export analysis failed: ${errorMessage}`);
    }

    return { errors, warnings, info };
  }

  /**
   * Perform optimization
   */
  private async performOptimization(
    options: OptimizedExportOptions,
    exportId: string
  ): Promise<AutoOptimizationResult> {
    const optimizationOptions: AutoOptimizationOptions = {
      targetDir: options.outputPath,
      budget: options.budget,
      aggressive: options.aggressive,
      dryRun: options.dryRun,
      skipBackup: options.skipBackup,
    };

    return await this.autoOptimizationService.autoOptimize(optimizationOptions);
  }

  /**
   * Validate performance budget
   */
  private async validateBudget(
    options: OptimizedExportOptions,
    exportId: string
  ): Promise<BudgetValidationResult> {
    const budget = options.budget || this.budgetService.getDefaultBudget();

    // For now, return a check result using the checkBudget method
    // In a real implementation, this would analyze the actual export content
    const result = await this.budgetService.checkBudget(options.outputPath, budget);

    return {
      passed: result.passed,
      violations: result.violations,
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
        totalViolations: result.violations.length,
        totalWarnings: 0,
        criticalViolations: result.violations.filter(v => v.severity === 'critical').length,
        budgetUtilization: 0,
      },
      canExport: result.passed,
      requiresOverride: !result.passed,
    };
  }

  /**
   * Generate export package
   */
  private async generatePackage(
    options: OptimizedExportOptions,
    exportId: string,
    optimizationResult: AutoOptimizationResult,
    budgetResult: BudgetValidationResult | null
  ): Promise<string> {
    return await this.optimizedPackageService.createOptimizedPackage({
      projectId: options.projectId,
      sourcePath: options.outputPath,
      outputPath: options.outputPath,
      format: options.format || 'zip',
      compressionLevel: options.compressionLevel || 6,
      includeSourceMaps: options.includeSourceMaps,
      includePerformanceReport: options.includePerformanceReport,
      optimization: optimizationResult,
      budget: budgetResult,
      metadata: options.customMetadata,
    });
  }

  /**
   * Perform post-export verification
   */
  private async performVerification(
    exportPath: string,
    options: OptimizedExportOptions,
    exportId: string
  ): Promise<VerificationResult> {
    return await this.validator.validateExport({
      exportPath,
      budget: options.budget,
      checkFileIntegrity: true,
      checkAssets: true,
      checkStructure: true,
      checkBrokenLinks: true,
    });
  }

  /**
   * Generate export manifest
   */
  private generateManifest(
    exportId: string,
    options: OptimizedExportOptions,
    optimization: AutoOptimizationResult,
    budget: BudgetValidationResult | null,
    verification: VerificationResult,
    timing: OptimizedExportResult['timing']
  ): ExportManifest {
    return {
      exportId,
      timestamp: Date.now(),
      version: '1.0.0',
      projectId: options.projectId,
      options,
      files: [],
      optimization: {
        applied: options.autoOptimize !== false,
        actionsCount: optimization.actionsApplied,
        totalSavings: optimization.summary.totalSavings,
        percentageReduction: optimization.summary.percentageReduction,
      },
      budget: {
        enforced: options.budgetEnforcement !== 'disabled',
        mode: options.budgetEnforcement || 'warning',
        passed: budget?.passed || false,
        violations: budget?.summary.totalViolations || 0,
      },
      verification: {
        performed: options.validateAfterExport !== false,
        passed: verification.passed,
        issues: verification.errors.length + verification.warnings.length,
      },
      performance: {
        totalDuration: timing.total,
        stages: {
          analysis: timing.analysis,
          optimization: timing.optimization,
          packaging: timing.packaging,
          verification: timing.verification,
        },
      },
    };
  }

  /**
   * Save manifest to file
   */
  private async saveManifest(exportPath: string, manifest: ExportManifest): Promise<void> {
    const manifestPath = path.join(exportPath, 'export-manifest.json');
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
  }

  /**
   * Report progress to callback
   */
  private reportProgress(options: OptimizedExportOptions, progress: ExportProgress): void {
    if (options.onProgress) {
      try {
        options.onProgress(progress);
      } catch (error) {
        AppLogger.warn('Progress callback error', { error });
      }
    }
  }

  /**
   * Generate unique export ID
   */
  private generateExportId(): string {
    return `export_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  /**
   * Create empty optimization result
   */
  private createEmptyOptimizationResult(): AutoOptimizationResult {
    return {
      success: true,
      actionsApplied: 0,
      actionsFailed: 0,
      totalActions: 0,
      actions: [],
      budgetViolations: [],
      budgetPassed: true,
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
  }

  /**
   * Create empty verification result
   */
  private createEmptyVerificationResult(): VerificationResult {
    return {
      passed: true,
      errors: [],
      warnings: [],
      info: [],
      fileIntegrity: {
        checked: 0,
        passed: 0,
        failed: 0,
      },
      assetValidation: {
        checked: 0,
        valid: 0,
        broken: 0,
      },
      structureValidation: {
        requiredFiles: 0,
        missingFiles: [],
        extraFiles: [],
      },
    };
  }
}

/**
 * Create optimized export pipeline instance
 */
export function createOptimizedExportPipeline(): OptimizedExportPipeline {
  return new OptimizedExportPipeline();
}

// Export singleton instance
export default new OptimizedExportPipeline();
