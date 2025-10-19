import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { ExportService } from '../services/ExportService.js';
import { SelfContainedExportService } from '../services/SelfContainedExportService.js';
import { PerformanceOptimizedExportService } from '../services/PerformanceOptimizedExportService.js';
import type {
  ApiResponse,
  ClonedWebsite,
  PerformanceAnalysis,
  OptimizationResult,
} from '../../shared/types/index.js';

const router = express.Router();
const exportService = new ExportService();
const selfContainedService = new SelfContainedExportService();
const performanceService = new PerformanceOptimizedExportService();

// In-memory storage (should be replaced with database)
const websites = new Map<string, ClonedWebsite>();
const performanceData = new Map<string, PerformanceAnalysis>();
const optimizationData = new Map<string, OptimizationResult[]>();
const exportPackages = new Map<string, string>(); // exportId -> zipPath

/**
 * POST /api/export/generate
 * Generate WordPress builder export package
 */
router.post('/generate', async (req, res) => {
  try {
    const { websiteId, builder, includeOriginals, optimizationLevel } = req.body as {
      websiteId: string;
      builder: 'elementor' | 'gutenberg' | 'divi' | 'beaver-builder' | 'bricks' | 'oxygen';
      includeOriginals?: boolean;
      optimizationLevel?: 'maximum-performance' | 'balanced' | 'maximum-quality';
    };

    // Get website data
    const website = websites.get(websiteId);
    if (!website) {
      return res.status(404).json({
        success: false,
        error: 'Website not found',
      } as ApiResponse<never>);
    }

    // Get performance analysis
    const performance = performanceData.get(websiteId);
    if (!performance) {
      return res.status(400).json({
        success: false,
        error: 'Performance analysis not found. Run analysis first.',
      } as ApiResponse<never>);
    }

    // Get optimization results
    const optimizations = optimizationData.get(websiteId) || [];

    // Generate export package
    const zipPath = await exportService.generateExport(
      website,
      performance,
      optimizations,
      {
        builder,
        includeOriginals: includeOriginals ?? false,
        optimizationLevel: optimizationLevel ?? 'balanced',
      }
    );

    // Store export package
    const exportId = crypto.randomUUID();
    exportPackages.set(exportId, zipPath);

    res.json({
      success: true,
      data: {
        id: exportId,
        websiteId,
        builder,
        downloadUrl: `/api/export/download/${exportId}`,
        createdAt: new Date().toISOString(),
      },
      message: `Export package generated successfully for ${builder}`,
    } as ApiResponse<any>);
  } catch (error) {
    console.error('Export generation error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Export generation failed',
    } as ApiResponse<never>);
  }
});

/**
 * GET /api/export/download/:exportId
 * Download export package as ZIP
 */
router.get('/download/:exportId', async (req, res) => {
  try {
    const { exportId } = req.params;

    // Get export package path
    const zipPath = exportPackages.get(exportId);
    if (!zipPath) {
      return res.status(404).json({
        success: false,
        error: 'Export package not found',
      } as ApiResponse<never>);
    }

    // Check if file exists
    if (!fs.existsSync(zipPath)) {
      return res.status(404).json({
        success: false,
        error: 'Export file not found',
      } as ApiResponse<never>);
    }

    // Send file
    const filename = `website-export-${exportId}.zip`;
    res.download(zipPath, filename, (err) => {
      if (err) {
        console.error('Download error:', err);
        if (!res.headersSent) {
          res.status(500).json({
            success: false,
            error: 'Download failed',
          } as ApiResponse<never>);
        }
      }

      // Clean up after download
      setTimeout(() => {
        try {
          fs.unlinkSync(zipPath);
          exportPackages.delete(exportId);
        } catch (cleanupError) {
          console.error('Cleanup error:', cleanupError);
        }
      }, 1000);
    });
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({
      success: false,
      error: 'Download failed',
    } as ApiResponse<never>);
  }
});

/**
 * GET /api/export/status/:exportId
 * Get export status
 */
router.get('/status/:exportId', async (req, res) => {
  try {
    const { exportId } = req.params;

    const zipPath = exportPackages.get(exportId);
    if (!zipPath) {
      return res.status(404).json({
        success: false,
        error: 'Export not found',
      } as ApiResponse<never>);
    }

    const exists = fs.existsSync(zipPath);
    const stats = exists ? fs.statSync(zipPath) : null;

    res.json({
      success: true,
      data: {
        id: exportId,
        status: exists ? 'ready' : 'not_found',
        size: stats ? stats.size : 0,
        createdAt: stats ? stats.birthtime.toISOString() : null,
      },
    } as ApiResponse<any>);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to get export status',
    } as ApiResponse<never>);
  }
});

/**
 * POST /api/export/self-contained
 * Create self-contained export with all dependencies embedded
 */
router.post('/self-contained', async (req, res) => {
  try {
    const { htmlContent, baseUrl, options } = req.body;

    if (!htmlContent || !baseUrl) {
      return res.status(400).json({
        success: false,
        error: 'HTML content and base URL are required',
      } as ApiResponse<never>);
    }

    const result = await selfContainedService.createSelfContainedExport(
      htmlContent,
      baseUrl,
      options
    );

    res.json({
      success: true,
      data: result,
      message: 'Self-contained export created successfully',
    } as ApiResponse<any>);
  } catch (error) {
    console.error('Failed to create self-contained export:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create export',
    } as ApiResponse<never>);
  }
});

/**
 * POST /api/export/optimized
 * Create performance-optimized export
 */
router.post('/optimized', async (req, res) => {
  try {
    const { htmlContent, options } = req.body;

    if (!htmlContent) {
      return res.status(400).json({
        success: false,
        error: 'HTML content is required',
      } as ApiResponse<never>);
    }

    const result = await performanceService.optimizeExport(htmlContent, options);

    res.json({
      success: true,
      data: result,
      message: 'Optimized export created successfully',
    } as ApiResponse<any>);
  } catch (error) {
    console.error('Failed to create optimized export:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to optimize export',
    } as ApiResponse<never>);
  }
});

/**
 * POST /api/export/combined
 * Create combined export (self-contained + optimized)
 */
router.post('/combined', async (req, res) => {
  try {
    const { htmlContent, baseUrl, selfContainedOptions, optimizationOptions } = req.body;

    if (!htmlContent || !baseUrl) {
      return res.status(400).json({
        success: false,
        error: 'HTML content and base URL are required',
      } as ApiResponse<never>);
    }

    // Step 1: Create self-contained export
    const selfContainedResult = await selfContainedService.createSelfContainedExport(
      htmlContent,
      baseUrl,
      selfContainedOptions
    );

    // Step 2: Optimize the result
    const optimizedResult = await performanceService.optimizeExport(
      selfContainedResult.content || htmlContent,
      optimizationOptions
    );

    // Step 3: Calculate size analysis
    const sizeAnalysis = await selfContainedService.calculateSize(
      optimizedResult.optimizedHtml
    );

    res.json({
      success: true,
      data: {
        format: selfContainedResult.format,
        content: optimizedResult.optimizedHtml,
        originalSize: selfContainedResult.size,
        optimizedSize: optimizedResult.optimizedSize,
        totalCompressionRatio:
          ((selfContainedResult.size - optimizedResult.optimizedSize) /
            selfContainedResult.size) *
          100,
        inlinedResources: selfContainedResult.inlinedResources,
        optimizations: optimizedResult.optimizations,
        criticalCSS: optimizedResult.criticalCSS,
        recommendations: optimizedResult.recommendations,
        sizeAnalysis,
      },
      message: 'Combined export created successfully',
    } as ApiResponse<any>);
  } catch (error) {
    console.error('Failed to create combined export:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create combined export',
    } as ApiResponse<never>);
  }
});

/**
 * POST /api/export/self-contained/download
 * Download self-contained export as file
 */
router.post('/self-contained/download', async (req, res) => {
  try {
    const { htmlContent, baseUrl, options, filename } = req.body;

    if (!htmlContent || !baseUrl) {
      return res.status(400).json({
        success: false,
        error: 'HTML content and base URL are required',
      } as ApiResponse<never>);
    }

    const result = await selfContainedService.createSelfContainedExport(
      htmlContent,
      baseUrl,
      options
    );

    if (result.format === 'single-file' && result.content) {
      // Send as HTML file
      res.setHeader('Content-Type', 'text/html');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${filename || 'export.html'}"`
      );
      res.send(result.content);
    } else if (result.format === 'zip' && result.zipPath) {
      // Send as ZIP file
      res.download(result.zipPath, filename || 'export.zip', async (err) => {
        if (err) {
          console.error('Download error:', err);
        }
        // Clean up ZIP file after download
        try {
          fs.unlinkSync(result.zipPath!);
        } catch {}
      });
    } else {
      throw new Error('Invalid export result');
    }
  } catch (error) {
    console.error('Failed to download export:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to download export',
    } as ApiResponse<never>);
  }
});

/**
 * POST /api/export/optimized/download
 * Download optimized export as file
 */
router.post('/optimized/download', async (req, res) => {
  try {
    const { htmlContent, options, filename } = req.body;

    if (!htmlContent) {
      return res.status(400).json({
        success: false,
        error: 'HTML content is required',
      } as ApiResponse<never>);
    }

    const result = await performanceService.optimizeExport(htmlContent, options);

    res.setHeader('Content-Type', 'text/html');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename || 'optimized.html'}"`
    );
    res.send(result.optimizedHtml);
  } catch (error) {
    console.error('Failed to download optimized export:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to download export',
    } as ApiResponse<never>);
  }
});

/**
 * POST /api/export/combined/download
 * Download combined export as file
 */
router.post('/combined/download', async (req, res) => {
  try {
    const {
      htmlContent,
      baseUrl,
      selfContainedOptions,
      optimizationOptions,
      filename,
    } = req.body;

    if (!htmlContent || !baseUrl) {
      return res.status(400).json({
        success: false,
        error: 'HTML content and base URL are required',
      } as ApiResponse<never>);
    }

    // Create self-contained export
    const selfContainedResult = await selfContainedService.createSelfContainedExport(
      htmlContent,
      baseUrl,
      selfContainedOptions
    );

    // Optimize the result
    const optimizedResult = await performanceService.optimizeExport(
      selfContainedResult.content || htmlContent,
      optimizationOptions
    );

    res.setHeader('Content-Type', 'text/html');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename || 'export-optimized.html'}"`
    );
    res.send(optimizedResult.optimizedHtml);
  } catch (error) {
    console.error('Failed to download combined export:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to download export',
    } as ApiResponse<never>);
  }
});

/**
 * POST /api/export/compress
 * Generate compressed versions
 */
router.post('/compress', async (req, res) => {
  try {
    const { htmlContent } = req.body;

    if (!htmlContent) {
      return res.status(400).json({
        success: false,
        error: 'HTML content is required',
      } as ApiResponse<never>);
    }

    const compressed = await performanceService.generateCompressedVersions(htmlContent);

    res.json({
      success: true,
      data: {
        originalSize: Buffer.byteLength(htmlContent, 'utf8'),
        gzipSize: compressed.gzipSize,
        brotliSize: compressed.brotliSize,
        gzipRatio: (
          (1 - compressed.gzipSize / Buffer.byteLength(htmlContent, 'utf8')) *
          100
        ).toFixed(2),
        brotliRatio: (
          (1 - compressed.brotliSize / Buffer.byteLength(htmlContent, 'utf8')) *
          100
        ).toFixed(2),
      },
      message: 'Compressed versions generated successfully',
    } as ApiResponse<any>);
  } catch (error) {
    console.error('Failed to compress:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to compress',
    } as ApiResponse<never>);
  }
});

/**
 * POST /api/export/size-analysis
 * Calculate size breakdown
 */
router.post('/size-analysis', async (req, res) => {
  try {
    const { htmlContent } = req.body;

    if (!htmlContent) {
      return res.status(400).json({
        success: false,
        error: 'HTML content is required',
      } as ApiResponse<never>);
    }

    const analysis = await selfContainedService.calculateSize(htmlContent);

    res.json({
      success: true,
      data: analysis,
      message: 'Size analysis completed',
    } as ApiResponse<any>);
  } catch (error) {
    console.error('Failed to analyze size:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to analyze size',
    } as ApiResponse<never>);
  }
});

/**
 * POST /api/export/recommendations
 * Get export recommendations
 */
router.post('/recommendations', async (req, res) => {
  try {
    const { htmlContent } = req.body;

    if (!htmlContent) {
      return res.status(400).json({
        success: false,
        error: 'HTML content is required',
      } as ApiResponse<never>);
    }

    // Run optimization without applying changes to get recommendations
    const result = await performanceService.optimizeExport(htmlContent, {
      minifyHtml: false,
      minifyCSS: false,
      minifyJS: false,
      optimizeImages: false,
    });

    res.json({
      success: true,
      data: {
        recommendations: result.recommendations,
        currentOptimizations: result.optimizations,
      },
      message: 'Recommendations generated',
    } as ApiResponse<any>);
  } catch (error) {
    console.error('Failed to get recommendations:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get recommendations',
    } as ApiResponse<never>);
  }
});

/**
 * POST /api/export/cleanup
 * Cleanup old export files
 */
router.post('/cleanup', async (req, res) => {
  try {
    const { maxAgeHours } = req.body;

    const deletedCount = await selfContainedService.cleanup(maxAgeHours || 24);

    res.json({
      success: true,
      data: { deletedCount },
      message: `Cleaned up ${deletedCount} old export files`,
    } as ApiResponse<any>);
  } catch (error) {
    console.error('Failed to cleanup:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to cleanup',
    } as ApiResponse<never>);
  }
});

export default router;
