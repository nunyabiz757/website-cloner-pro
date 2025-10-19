import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import { PerformanceAuditService } from '../services/PerformanceAuditService.js';
import { CoreWebVitalsService } from '../services/CoreWebVitalsService.js';
import { PerformanceMetricsService } from '../services/PerformanceMetricsService.js';
import { AssetOptimizationService } from '../services/AssetOptimizationService.js';
import { CriticalCSSService } from '../services/CriticalCSSService.js';

const router = express.Router();

const auditService = new PerformanceAuditService();
const webVitalsService = new CoreWebVitalsService();
const metricsService = new PerformanceMetricsService();
const assetOptimizationService = new AssetOptimizationService();
const criticalCSSService = new CriticalCSSService();

// Store active audits in memory (in production, use Redis or database)
const activeAudits = new Map<
  string,
  {
    status: 'running' | 'completed' | 'failed';
    progress: number;
    result?: any;
    error?: string;
    startedAt: string;
  }
>();

/**
 * Run comprehensive performance audit
 * POST /api/performance-audit/run
 */
router.post('/run', async (req, res) => {
  try {
    const {
      url,
      htmlContent,
      cssContent,
      jsContent,
      includeWebVitals,
      includeAssetOptimization,
      includeCriticalCSS,
      includeResponsive,
      includeAnimations,
      includeFrameworks,
      includeDependencies,
      includeThirdParty,
    } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL is required',
      });
    }

    // Generate audit ID
    const auditId = `audit_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    // Start audit in background
    activeAudits.set(auditId, {
      status: 'running',
      progress: 0,
      startedAt: new Date().toISOString(),
    });

    // Run audit asynchronously
    (async () => {
      try {
        const result = await auditService.runComprehensiveAudit({
          url,
          htmlContent,
          cssContent,
          jsContent,
          includeWebVitals,
          includeAssetOptimization,
          includeCriticalCSS,
          includeResponsive,
          includeAnimations,
          includeFrameworks,
          includeDependencies,
          includeThirdParty,
        });

        activeAudits.set(auditId, {
          status: 'completed',
          progress: 100,
          result,
          startedAt: activeAudits.get(auditId)?.startedAt || new Date().toISOString(),
        });
      } catch (error) {
        console.error('Audit failed:', error);
        activeAudits.set(auditId, {
          status: 'failed',
          progress: 0,
          error: error instanceof Error ? error.message : 'Audit failed',
          startedAt: activeAudits.get(auditId)?.startedAt || new Date().toISOString(),
        });
      }
    })();

    res.json({
      success: true,
      auditId,
      message: 'Performance audit started',
    });
  } catch (error) {
    console.error('Failed to start audit:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to start audit',
    });
  }
});

/**
 * Get audit status
 * GET /api/performance-audit/status/:auditId
 */
router.get('/status/:auditId', async (req, res) => {
  try {
    const { auditId } = req.params;

    const audit = activeAudits.get(auditId);
    if (!audit) {
      return res.status(404).json({
        success: false,
        error: 'Audit not found',
      });
    }

    res.json({
      success: true,
      auditId,
      status: audit.status,
      progress: audit.progress,
      startedAt: audit.startedAt,
      error: audit.error,
    });
  } catch (error) {
    console.error('Failed to get audit status:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get audit status',
    });
  }
});

/**
 * Get audit results
 * GET /api/performance-audit/result/:auditId
 */
router.get('/result/:auditId', async (req, res) => {
  try {
    const { auditId } = req.params;

    const audit = activeAudits.get(auditId);
    if (!audit) {
      return res.status(404).json({
        success: false,
        error: 'Audit not found',
      });
    }

    if (audit.status !== 'completed') {
      return res.status(400).json({
        success: false,
        error: `Audit is ${audit.status}`,
      });
    }

    res.json({
      success: true,
      auditId,
      result: audit.result,
    });
  } catch (error) {
    console.error('Failed to get audit result:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get audit result',
    });
  }
});

/**
 * Download audit report as HTML
 * GET /api/performance-audit/report/:auditId
 */
router.get('/report/:auditId', async (req, res) => {
  try {
    const { auditId } = req.params;

    const audit = activeAudits.get(auditId);
    if (!audit) {
      return res.status(404).json({
        success: false,
        error: 'Audit not found',
      });
    }

    if (audit.status !== 'completed') {
      return res.status(400).json({
        success: false,
        error: `Audit is ${audit.status}`,
      });
    }

    const htmlReport = auditService.generateHTMLReport(audit.result);

    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Disposition', `attachment; filename="performance-audit-${auditId}.html"`);
    res.send(htmlReport);
  } catch (error) {
    console.error('Failed to generate report:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate report',
    });
  }
});

/**
 * Measure Core Web Vitals
 * POST /api/performance-audit/web-vitals
 */
router.post('/web-vitals', async (req, res) => {
  try {
    const { url, options } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL is required',
      });
    }

    const vitals = await webVitalsService.measureWebVitals(url, options);

    res.json({
      success: true,
      vitals,
    });
  } catch (error) {
    console.error('Web Vitals measurement failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Web Vitals measurement failed',
    });
  }
});

/**
 * Measure performance metrics
 * POST /api/performance-audit/metrics
 */
router.post('/metrics', async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL is required',
      });
    }

    const metrics = await metricsService.measurePerformance(url);

    res.json({
      success: true,
      metrics,
    });
  } catch (error) {
    console.error('Performance metrics measurement failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Performance metrics measurement failed',
    });
  }
});

/**
 * Analyze assets for optimization
 * POST /api/performance-audit/assets
 */
router.post('/assets', async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL is required',
      });
    }

    const analysis = await assetOptimizationService.analyzeAssets(url);

    res.json({
      success: true,
      analysis,
    });
  } catch (error) {
    console.error('Asset analysis failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Asset analysis failed',
    });
  }
});

/**
 * Extract critical CSS
 * POST /api/performance-audit/critical-css
 */
router.post('/critical-css', async (req, res) => {
  try {
    const { url, cssContent, viewportWidth, viewportHeight } = req.body;

    if (!url || !cssContent) {
      return res.status(400).json({
        success: false,
        error: 'URL and CSS content are required',
      });
    }

    const result = await criticalCSSService.extractCriticalCSS(
      url,
      cssContent,
      viewportWidth,
      viewportHeight
    );

    res.json({
      success: true,
      result,
    });
  } catch (error) {
    console.error('Critical CSS extraction failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Critical CSS extraction failed',
    });
  }
});

/**
 * Extract critical CSS for multiple viewports
 * POST /api/performance-audit/critical-css-multi
 */
router.post('/critical-css-multi', async (req, res) => {
  try {
    const { url, cssContent, viewports } = req.body;

    if (!url || !cssContent) {
      return res.status(400).json({
        success: false,
        error: 'URL and CSS content are required',
      });
    }

    const defaultViewports = [
      { width: 375, height: 667, name: 'Mobile' },
      { width: 768, height: 1024, name: 'Tablet' },
      { width: 1920, height: 1080, name: 'Desktop' },
    ];

    const results = await criticalCSSService.extractCriticalCSSMultiViewport(
      url,
      cssContent,
      viewports || defaultViewports
    );

    res.json({
      success: true,
      results,
    });
  } catch (error) {
    console.error('Multi-viewport critical CSS extraction failed:', error);
    res.status(500).json({
      success: false,
      error:
        error instanceof Error
          ? error.message
          : 'Multi-viewport critical CSS extraction failed',
    });
  }
});

/**
 * Generate optimized HTML with critical CSS
 * POST /api/performance-audit/optimize-html
 */
router.post('/optimize-html', async (req, res) => {
  try {
    const { originalHTML, criticalCSS, nonCriticalCSSUrl } = req.body;

    if (!originalHTML || !criticalCSS || !nonCriticalCSSUrl) {
      return res.status(400).json({
        success: false,
        error: 'Original HTML, critical CSS, and non-critical CSS URL are required',
      });
    }

    const optimizedHTML = criticalCSSService.generateOptimizedHTML(
      originalHTML,
      criticalCSS,
      nonCriticalCSSUrl
    );

    res.json({
      success: true,
      optimizedHTML,
    });
  } catch (error) {
    console.error('HTML optimization failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'HTML optimization failed',
    });
  }
});

/**
 * List all audits
 * GET /api/performance-audit/list
 */
router.get('/list', async (req, res) => {
  try {
    const audits = Array.from(activeAudits.entries()).map(([auditId, data]) => ({
      auditId,
      status: data.status,
      progress: data.progress,
      startedAt: data.startedAt,
      overallScore: data.result?.summary?.overallScore,
      executionTime: data.result?.executionTime,
    }));

    res.json({
      success: true,
      audits,
      total: audits.length,
    });
  } catch (error) {
    console.error('Failed to list audits:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list audits',
    });
  }
});

/**
 * Delete audit
 * DELETE /api/performance-audit/:auditId
 */
router.delete('/:auditId', async (req, res) => {
  try {
    const { auditId } = req.params;

    if (!activeAudits.has(auditId)) {
      return res.status(404).json({
        success: false,
        error: 'Audit not found',
      });
    }

    activeAudits.delete(auditId);

    res.json({
      success: true,
      message: 'Audit deleted successfully',
    });
  } catch (error) {
    console.error('Failed to delete audit:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete audit',
    });
  }
});

/**
 * Cleanup old audits
 * POST /api/performance-audit/cleanup
 */
router.post('/cleanup', async (req, res) => {
  try {
    const { olderThanHours = 24 } = req.body;
    const cutoffTime = Date.now() - olderThanHours * 60 * 60 * 1000;

    let cleanedCount = 0;

    for (const [auditId, data] of activeAudits.entries()) {
      const startedAt = new Date(data.startedAt).getTime();
      if (startedAt < cutoffTime) {
        activeAudits.delete(auditId);
        cleanedCount++;
      }
    }

    res.json({
      success: true,
      message: `Cleaned up ${cleanedCount} old audits`,
      cleanedCount,
    });
  } catch (error) {
    console.error('Failed to cleanup audits:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to cleanup audits',
    });
  }
});

export default router;
