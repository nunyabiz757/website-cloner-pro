import express from 'express';
import OptimizationService from '../services/OptimizationService.js';
import { ImageOptimizationService } from '../services/ImageOptimizationService.js';
import { CodeMinificationService } from '../services/CodeMinificationService.js';
import { FontOptimizationService } from '../services/FontOptimizationService.js';
import { LazyLoadService } from '../services/LazyLoadService.js';
import { ResourceHintsService } from '../services/ResourceHintsService.js';
import { CriticalCSSService } from '../services/CriticalCSSService.js';
import { TreeShakingService } from '../services/TreeShakingService.js';
import { BundleOptimizationService } from '../services/BundleOptimizationService.js';
import type { ApiResponse, OptimizationResult, OptimizationSettings } from '../../shared/types/index.js';

const router = express.Router();

// Initialize new optimization services
const imageOptimizationService = new ImageOptimizationService();
const codeMinificationService = new CodeMinificationService();
const fontOptimizationService = new FontOptimizationService();
const lazyLoadService = new LazyLoadService();
const resourceHintsService = new ResourceHintsService();
const criticalCSSService = new CriticalCSSService();
const treeShakingService = new TreeShakingService();
const bundleOptimizationService = new BundleOptimizationService();

// Mock storage
const projects = new Map<string, any>();

/**
 * POST /api/optimization/apply
 * Apply optimization fixes
 */
router.post('/apply', async (req, res) => {
  try {
    const { websiteId, issueIds, settings } = req.body;

    if (!websiteId || !issueIds || !Array.isArray(issueIds)) {
      return res.status(400).json({
        success: false,
        error: 'Website ID and issue IDs are required',
      } as ApiResponse<never>);
    }

    const website = projects.get(websiteId);
    if (!website) {
      return res.status(404).json({
        success: false,
        error: 'Website not found',
      } as ApiResponse<never>);
    }

    const analysis = website.performanceAnalysis;
    if (!analysis) {
      return res.status(404).json({
        success: false,
        error: 'Performance analysis not found. Run analysis first.',
      } as ApiResponse<never>);
    }

    // Get issues to fix
    const allIssues = [...analysis.issues, ...analysis.opportunities];
    const issuesToFix = allIssues.filter(issue => issueIds.includes(issue.id));

    if (issuesToFix.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No matching issues found',
      } as ApiResponse<never>);
    }

    // Apply fixes
    const defaultSettings: OptimizationSettings = {
      images: {
        quality: 85,
        format: 'webp',
        responsive: true,
        lazyLoad: true,
        compressionType: 'lossy',
        generateSrcset: true,
      },
      css: {
        extractCritical: true,
        removeUnused: true,
        minify: true,
        inline: false,
        inlineThreshold: 14000,
      },
      javascript: {
        minify: true,
        removeUnused: false,
        defer: true,
        async: false,
        splitBundles: false,
      },
      fonts: {
        fontDisplay: 'swap',
        subset: true,
        preload: true,
        selfHost: true,
        format: 'woff2',
      },
      html: {
        minify: true,
        addResourceHints: true,
        lazyLoadIframes: true,
        addDimensions: true,
      },
    };

    const mergedSettings = { ...defaultSettings, ...settings };

    const results = await OptimizationService.applyMultipleFixes(
      issuesToFix,
      website,
      mergedSettings
    );

    // Update website in storage
    projects.set(websiteId, website);

    res.json({
      success: true,
      data: results,
      message: `Applied ${results.filter(r => r.success).length} optimizations`,
    } as ApiResponse<OptimizationResult[]>);

  } catch (error) {
    console.error('Optimization error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to apply optimizations',
    } as ApiResponse<never>);
  }
});

/**
 * POST /api/optimization/apply-all
 * Apply all auto-fixable optimizations
 */
router.post('/apply-all', async (req, res) => {
  try {
    const { websiteId, settings } = req.body;

    const website = projects.get(websiteId);
    if (!website || !website.performanceAnalysis) {
      return res.status(404).json({
        success: false,
        error: 'Website or performance analysis not found',
      } as ApiResponse<never>);
    }

    const analysis = website.performanceAnalysis;
    const allIssues = [...analysis.issues, ...analysis.opportunities];
    const autoFixable = allIssues.filter(issue => issue.autoFixable);

    const results = await OptimizationService.applyMultipleFixes(
      autoFixable,
      website,
      settings
    );

    projects.set(websiteId, website);

    res.json({
      success: true,
      data: results,
      message: `Applied ${results.filter(r => r.success).length} of ${autoFixable.length} optimizations`,
    } as ApiResponse<OptimizationResult[]>);

  } catch (error) {
    console.error('Apply all error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to apply all optimizations',
    } as ApiResponse<never>);
  }
});

/**
 * POST /api/optimization/images
 * Optimize images in HTML
 */
router.post('/images', async (req, res) => {
  try {
    const { htmlContent, baseUrl, options } = req.body;

    if (!htmlContent || !baseUrl) {
      return res.status(400).json({
        success: false,
        error: 'HTML content and base URL are required',
      } as ApiResponse<never>);
    }

    const result = await imageOptimizationService.optimizeHtmlImages(
      htmlContent,
      baseUrl,
      options
    );

    res.json({
      success: true,
      data: result,
      message: 'Images optimized successfully',
    } as ApiResponse<any>);
  } catch (error) {
    console.error('Image optimization error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Image optimization failed',
    } as ApiResponse<never>);
  }
});

/**
 * POST /api/optimization/minify
 * Minify HTML, CSS, and JavaScript
 */
router.post('/minify', async (req, res) => {
  try {
    const { htmlContent, options } = req.body;

    if (!htmlContent) {
      return res.status(400).json({
        success: false,
        error: 'HTML content is required',
      } as ApiResponse<never>);
    }

    const result = await codeMinificationService.minifyAll(htmlContent, options);

    res.json({
      success: true,
      data: result,
      message: 'Code minified successfully',
    } as ApiResponse<any>);
  } catch (error) {
    console.error('Minification error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Minification failed',
    } as ApiResponse<never>);
  }
});

/**
 * POST /api/optimization/fonts
 * Optimize fonts in HTML
 */
router.post('/fonts', async (req, res) => {
  try {
    const { htmlContent, baseUrl, options } = req.body;

    if (!htmlContent || !baseUrl) {
      return res.status(400).json({
        success: false,
        error: 'HTML content and base URL are required',
      } as ApiResponse<never>);
    }

    const result = await fontOptimizationService.optimizeFonts(
      htmlContent,
      baseUrl,
      options
    );

    res.json({
      success: true,
      data: result,
      message: 'Fonts optimized successfully',
    } as ApiResponse<any>);
  } catch (error) {
    console.error('Font optimization error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Font optimization failed',
    } as ApiResponse<never>);
  }
});

/**
 * POST /api/optimization/lazy-load
 * Add lazy loading to images, iframes, and videos
 */
router.post('/lazy-load', async (req, res) => {
  try {
    const { htmlContent, options } = req.body;

    if (!htmlContent) {
      return res.status(400).json({
        success: false,
        error: 'HTML content is required',
      } as ApiResponse<never>);
    }

    const result = await lazyLoadService.addLazyLoading(htmlContent, options);

    res.json({
      success: true,
      data: result,
      message: 'Lazy loading added successfully',
    } as ApiResponse<any>);
  } catch (error) {
    console.error('Lazy loading error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Lazy loading failed',
    } as ApiResponse<never>);
  }
});

/**
 * POST /api/optimization/resource-hints
 * Add resource hints (DNS prefetch, preconnect, preload)
 */
router.post('/resource-hints', async (req, res) => {
  try {
    const { htmlContent, baseUrl, options } = req.body;

    if (!htmlContent || !baseUrl) {
      return res.status(400).json({
        success: false,
        error: 'HTML content and base URL are required',
      } as ApiResponse<never>);
    }

    const result = await resourceHintsService.addResourceHints(
      htmlContent,
      baseUrl,
      options
    );

    res.json({
      success: true,
      data: result,
      message: 'Resource hints added successfully',
    } as ApiResponse<any>);
  } catch (error) {
    console.error('Resource hints error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Resource hints failed',
    } as ApiResponse<never>);
  }
});

/**
 * POST /api/optimization/critical-css
 * Extract critical CSS
 */
router.post('/critical-css', async (req, res) => {
  try {
    const { url, cssContent, viewportWidth, viewportHeight } = req.body;

    if (!url || !cssContent) {
      return res.status(400).json({
        success: false,
        error: 'URL and CSS content are required',
      } as ApiResponse<never>);
    }

    const result = await criticalCSSService.extractCriticalCSS(
      url,
      Array.isArray(cssContent) ? cssContent : [cssContent],
      viewportWidth,
      viewportHeight
    );

    res.json({
      success: true,
      data: result,
      message: 'Critical CSS extracted successfully',
    } as ApiResponse<any>);
  } catch (error) {
    console.error('Critical CSS error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Critical CSS extraction failed',
    } as ApiResponse<never>);
  }
});

/**
 * POST /api/optimization/tree-shake
 * Remove unused code (tree shaking)
 */
router.post('/tree-shake', async (req, res) => {
  try {
    const { htmlContent, options } = req.body;

    if (!htmlContent) {
      return res.status(400).json({
        success: false,
        error: 'HTML content is required',
      } as ApiResponse<never>);
    }

    const result = await treeShakingService.shakeTree(htmlContent, options);

    res.json({
      success: true,
      data: result,
      message: 'Tree shaking completed successfully',
    } as ApiResponse<any>);
  } catch (error) {
    console.error('Tree shaking error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Tree shaking failed',
    } as ApiResponse<never>);
  }
});

/**
 * POST /api/optimization/bundle
 * Optimize bundles (combine and split)
 */
router.post('/bundle', async (req, res) => {
  try {
    const { htmlContent, options } = req.body;

    if (!htmlContent) {
      return res.status(400).json({
        success: false,
        error: 'HTML content is required',
      } as ApiResponse<never>);
    }

    const result = await bundleOptimizationService.optimizeBundles(htmlContent, options);

    res.json({
      success: true,
      data: result,
      message: 'Bundle optimization completed successfully',
    } as ApiResponse<any>);
  } catch (error) {
    console.error('Bundle optimization error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Bundle optimization failed',
    } as ApiResponse<never>);
  }
});

export default router;
