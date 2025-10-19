/**
 * Optimization Pipeline API Routes
 *
 * REST API endpoints for the optimized export pipeline.
 *
 * Endpoints:
 * - POST /api/optimization-pipeline/export - Run optimized export
 * - POST /api/optimization-pipeline/preview - Preview optimizations (dry run)
 * - GET /api/optimization-pipeline/status/:exportId - Get export status
 * - POST /api/optimization-pipeline/validate - Validate export package
 * - GET /api/optimization-pipeline/manifest/:exportId - Get export manifest
 * - POST /api/optimization-pipeline/rollback/:exportId - Rollback export
 */

import express, { type Request, type Response } from 'express';
import { z } from 'zod';
import OptimizedExportPipeline, { type OptimizedExportOptions, type ExportProgress } from '../services/OptimizedExportPipeline.js';
import ExportOptimizationValidator, { type ValidationOptions } from '../services/ExportOptimizationValidator.js';
import { AppLogger } from '../services/logger.service.js';
import * as fs from 'fs/promises';
import * as path from 'path';

const router = express.Router();

/**
 * Zod schemas for request validation
 */

// Performance budget schema
const PerformanceBudgetSchema = z.object({
  maxHTMLSize: z.number().optional(),
  maxCSSSize: z.number().optional(),
  maxJSSize: z.number().optional(),
  maxImageSize: z.number().optional(),
  maxTotalSize: z.number().optional(),
  maxHTMLGzipSize: z.number().optional(),
  maxCSSGzipSize: z.number().optional(),
  maxJSGzipSize: z.number().optional(),
  maxTotalGzipSize: z.number().optional(),
  maxHTTPRequests: z.number().optional(),
  maxImageCount: z.number().optional(),
  maxScriptCount: z.number().optional(),
  maxStylesheetCount: z.number().optional(),
  maxFontCount: z.number().optional(),
  maxDOMNodes: z.number().optional(),
  maxDOMDepth: z.number().optional(),
  maxCriticalCSSSize: z.number().optional(),
  enforcement: z.enum(['strict', 'warning', 'disabled']).optional(),
  allowOverride: z.boolean().optional(),
});

// Export options schema
const ExportOptionsSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  outputPath: z.string().min(1, 'Output path is required'),
  budget: PerformanceBudgetSchema.optional(),
  autoOptimize: z.boolean().optional(),
  budgetEnforcement: z.enum(['strict', 'warning', 'disabled']).optional(),
  format: z.enum(['zip', 'tar', 'tar.gz', 'folder']).optional(),
  includeSourceMaps: z.boolean().optional(),
  compressionLevel: z.number().min(0).max(9).optional(),
  aggressive: z.boolean().optional(),
  dryRun: z.boolean().optional(),
  skipBackup: z.boolean().optional(),
  includePerformanceReport: z.boolean().optional(),
  includeBudgetReport: z.boolean().optional(),
  includeManifest: z.boolean().optional(),
  validateBeforeExport: z.boolean().optional(),
  validateAfterExport: z.boolean().optional(),
  customMetadata: z.record(z.any()).optional(),
});

// Validation options schema
const ValidationOptionsSchema = z.object({
  exportPath: z.string().min(1, 'Export path is required'),
  budget: PerformanceBudgetSchema.optional(),
  checkFileIntegrity: z.boolean().optional(),
  checkAssets: z.boolean().optional(),
  checkStructure: z.boolean().optional(),
  checkBrokenLinks: z.boolean().optional(),
  checkPerformance: z.boolean().optional(),
  strictMode: z.boolean().optional(),
});

/**
 * Middleware for request validation
 */
function validateRequest<T>(schema: z.ZodSchema<T>) {
  return (req: Request, res: Response, next: express.NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors.map(e => ({
            path: e.path.join('.'),
            message: e.message,
          })),
        });
      }
      next(error);
    }
  };
}

/**
 * POST /api/optimization-pipeline/export
 * Run optimized export with full pipeline
 */
router.post('/export', validateRequest(ExportOptionsSchema), async (req: Request, res: Response) => {
  try {
    const options: OptimizedExportOptions = req.body;

    AppLogger.info('Export pipeline request received', {
      projectId: options.projectId,
      autoOptimize: options.autoOptimize,
      budgetEnforcement: options.budgetEnforcement,
    });

    // Setup progress tracking for SSE
    const progressUpdates: ExportProgress[] = [];
    options.onProgress = (progress) => {
      progressUpdates.push(progress);
    };

    // Run export pipeline
    const result = await OptimizedExportPipeline.export(options);

    // Return result
    res.json({
      success: result.success,
      exportId: result.exportId,
      exportPath: result.exportPath,
      manifest: result.manifest,
      optimization: {
        actionsApplied: result.optimization.actionsApplied,
        actionsFailed: result.optimization.actionsFailed,
        totalSavings: result.optimization.summary.totalSavings,
        percentageReduction: result.optimization.summary.percentageReduction,
      },
      budget: result.budget ? {
        passed: result.budget.passed,
        violations: result.budget.summary.totalViolations,
        criticalViolations: result.budget.summary.criticalViolations,
      } : null,
      verification: {
        passed: result.verification.passed,
        errors: result.verification.errors.length,
        warnings: result.verification.warnings.length,
      },
      timing: result.timing,
      warnings: result.warnings,
      errors: result.errors,
      canRollback: result.canRollback,
      progress: progressUpdates,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    AppLogger.error('Export pipeline request failed', error as Error);

    res.status(500).json({
      success: false,
      error: 'Export pipeline failed',
      message: errorMessage,
    });
  }
});

/**
 * POST /api/optimization-pipeline/preview
 * Preview optimizations without applying (dry run)
 */
router.post('/preview', validateRequest(ExportOptionsSchema), async (req: Request, res: Response) => {
  try {
    const options: OptimizedExportOptions = req.body;

    AppLogger.info('Export preview request received', {
      projectId: options.projectId,
    });

    // Run preview
    const preview = await OptimizedExportPipeline.preview(options);

    res.json({
      success: true,
      preview: {
        optimizations: {
          actionsCount: preview.optimizations.totalActions,
          actionsApplied: preview.optimizations.actionsApplied,
          actionsFailed: preview.optimizations.actionsFailed,
          totalSavings: preview.optimizations.summary.totalSavings,
          percentageReduction: preview.optimizations.summary.percentageReduction,
          actions: preview.optimizations.actions.map(a => ({
            type: a.type,
            file: a.file,
            action: a.action,
            savings: a.savings,
            error: a.error,
          })),
        },
        budget: preview.budget ? {
          passed: preview.budget.passed,
          violations: preview.budget.summary.totalViolations,
          criticalViolations: preview.budget.summary.criticalViolations,
          violations_details: preview.budget.violations.map(v => ({
            metric: v.metric,
            severity: v.severity,
            message: v.message,
            recommendations: v.recommendations,
          })),
        } : null,
        estimatedTime: preview.estimatedTime,
        estimatedSize: preview.estimatedSize,
        warnings: preview.warnings,
      },
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    AppLogger.error('Export preview request failed', error as Error);

    res.status(500).json({
      success: false,
      error: 'Export preview failed',
      message: errorMessage,
    });
  }
});

/**
 * GET /api/optimization-pipeline/status/:exportId
 * Get export status
 */
router.get('/status/:exportId', (req: Request, res: Response) => {
  try {
    const { exportId } = req.params;

    if (!exportId) {
      return res.status(400).json({
        success: false,
        error: 'Export ID is required',
      });
    }

    const status = OptimizedExportPipeline.getExportStatus(exportId);

    if (!status.found) {
      return res.status(404).json({
        success: false,
        error: 'Export not found',
        message: 'Export may have been completed or cleaned up',
      });
    }

    res.json({
      success: true,
      exportId,
      status: {
        stage: status.stage,
        startTime: status.startTime,
        duration: status.duration,
        canRollback: status.canRollback,
      },
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    AppLogger.error('Failed to get export status', error as Error);

    res.status(500).json({
      success: false,
      error: 'Failed to get export status',
      message: errorMessage,
    });
  }
});

/**
 * POST /api/optimization-pipeline/validate
 * Validate export package
 */
router.post('/validate', validateRequest(ValidationOptionsSchema), async (req: Request, res: Response) => {
  try {
    const options: ValidationOptions = req.body;

    AppLogger.info('Export validation request received', {
      exportPath: options.exportPath,
    });

    // Run validation
    const result = await ExportOptimizationValidator.validateExport(options);

    res.json({
      success: true,
      validation: {
        passed: result.passed,
        errors: result.errors,
        warnings: result.warnings,
        info: result.info,
        fileIntegrity: result.fileIntegrity,
        assetValidation: result.assetValidation,
        structureValidation: result.structureValidation,
        performanceValidation: result.performanceValidation,
        brokenLinks: result.brokenLinks,
      },
      report: ExportOptimizationValidator.generateReport(result),
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    AppLogger.error('Export validation request failed', error as Error);

    res.status(500).json({
      success: false,
      error: 'Export validation failed',
      message: errorMessage,
    });
  }
});

/**
 * GET /api/optimization-pipeline/manifest/:exportId
 * Get export manifest
 */
router.get('/manifest/:exportId', async (req: Request, res: Response) => {
  try {
    const { exportId } = req.params;

    if (!exportId) {
      return res.status(400).json({
        success: false,
        error: 'Export ID is required',
      });
    }

    // Get export status to find path
    const status = OptimizedExportPipeline.getExportStatus(exportId);

    if (!status.found) {
      return res.status(404).json({
        success: false,
        error: 'Export not found',
      });
    }

    // Try to read manifest from export directory
    // This is a simplified implementation - in production you'd track export paths
    const manifestPath = path.join(process.cwd(), 'exports', exportId, 'export-manifest.json');

    try {
      const manifestContent = await fs.readFile(manifestPath, 'utf-8');
      const manifest = JSON.parse(manifestContent);

      res.json({
        success: true,
        exportId,
        manifest,
      });

    } catch (error) {
      return res.status(404).json({
        success: false,
        error: 'Manifest not found',
        message: 'Export manifest file does not exist',
      });
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    AppLogger.error('Failed to get export manifest', error as Error);

    res.status(500).json({
      success: false,
      error: 'Failed to get export manifest',
      message: errorMessage,
    });
  }
});

/**
 * POST /api/optimization-pipeline/rollback/:exportId
 * Rollback export to previous state
 */
router.post('/rollback/:exportId', async (req: Request, res: Response) => {
  try {
    const { exportId } = req.params;

    if (!exportId) {
      return res.status(400).json({
        success: false,
        error: 'Export ID is required',
      });
    }

    AppLogger.info('Export rollback request received', { exportId });

    // Perform rollback
    const result = await OptimizedExportPipeline.rollback(exportId);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: 'Rollback failed',
        message: result.message,
      });
    }

    res.json({
      success: true,
      exportId,
      message: result.message,
      restoredPath: result.restoredPath,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    AppLogger.error('Export rollback request failed', error as Error);

    res.status(500).json({
      success: false,
      error: 'Export rollback failed',
      message: errorMessage,
    });
  }
});

/**
 * GET /api/optimization-pipeline/health
 * Health check endpoint
 */
router.get('/health', (req: Request, res: Response) => {
  res.json({
    success: true,
    service: 'Optimization Pipeline',
    status: 'healthy',
    timestamp: Date.now(),
    version: '1.0.0',
  });
});

/**
 * POST /api/optimization-pipeline/export/stream
 * Run optimized export with SSE progress streaming
 */
router.post('/export/stream', validateRequest(ExportOptionsSchema), async (req: Request, res: Response) => {
  try {
    const options: OptimizedExportOptions = req.body;

    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Send initial connection event
    res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: Date.now() })}\n\n`);

    // Setup progress callback
    options.onProgress = (progress) => {
      res.write(`data: ${JSON.stringify({
        type: 'progress',
        progress,
        timestamp: Date.now(),
      })}\n\n`);
    };

    AppLogger.info('Export pipeline stream request received', {
      projectId: options.projectId,
    });

    // Run export pipeline
    const result = await OptimizedExportPipeline.export(options);

    // Send final result
    res.write(`data: ${JSON.stringify({
      type: 'complete',
      result: {
        success: result.success,
        exportId: result.exportId,
        exportPath: result.exportPath,
        timing: result.timing,
        warnings: result.warnings,
        errors: result.errors,
      },
      timestamp: Date.now(),
    })}\n\n`);

    res.end();

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    AppLogger.error('Export pipeline stream request failed', error as Error);

    res.write(`data: ${JSON.stringify({
      type: 'error',
      error: 'Export pipeline failed',
      message: errorMessage,
      timestamp: Date.now(),
    })}\n\n`);

    res.end();
  }
});

/**
 * DELETE /api/optimization-pipeline/export/:exportId
 * Delete export and cleanup
 */
router.delete('/export/:exportId', async (req: Request, res: Response) => {
  try {
    const { exportId } = req.params;

    if (!exportId) {
      return res.status(400).json({
        success: false,
        error: 'Export ID is required',
      });
    }

    AppLogger.info('Export cleanup request received', { exportId });

    // Get export status
    const status = OptimizedExportPipeline.getExportStatus(exportId);

    if (!status.found) {
      return res.status(404).json({
        success: false,
        error: 'Export not found',
      });
    }

    // Clean up export directory (simplified - in production you'd track paths better)
    const exportPath = path.join(process.cwd(), 'exports', exportId);

    try {
      await fs.rm(exportPath, { recursive: true, force: true });

      res.json({
        success: true,
        message: 'Export cleaned up successfully',
        exportId,
      });

    } catch (error) {
      AppLogger.warn('Failed to cleanup export directory', { exportId, error });

      res.json({
        success: true,
        message: 'Export marked for cleanup (directory may not exist)',
        exportId,
      });
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    AppLogger.error('Export cleanup request failed', error as Error);

    res.status(500).json({
      success: false,
      error: 'Export cleanup failed',
      message: errorMessage,
    });
  }
});

/**
 * Error handling middleware
 */
router.use((error: Error, req: Request, res: Response, next: express.NextFunction) => {
  AppLogger.error('Optimization pipeline route error', error);

  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'An error occurred',
  });
});

export default router;
