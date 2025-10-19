import express from 'express';
import CriticalCSSService from '../services/CriticalCSSService.js';

const router = express.Router();

/**
 * Extract critical CSS from HTML and CSS
 * POST /api/critical-css/extract
 */
router.post('/extract', async (req, res) => {
  try {
    const { html, css, options } = req.body;

    if (!html) {
      return res.status(400).json({
        success: false,
        error: 'HTML content is required',
      });
    }

    if (!css) {
      return res.status(400).json({
        success: false,
        error: 'CSS content is required',
      });
    }

    const result = await CriticalCSSService.extractCriticalCSS(html, css, options || {});

    res.json({
      success: true,
      result: {
        critical: result.critical,
        nonCritical: result.nonCritical,
        inlined: result.inlined,
        stats: result.stats,
        recommendations: result.recommendations,
      },
    });
  } catch (error) {
    console.error('Critical CSS extraction failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Extraction failed',
    });
  }
});

/**
 * Extract critical CSS and return detailed paths
 * POST /api/critical-css/extract-detailed
 */
router.post('/extract-detailed', async (req, res) => {
  try {
    const { html, css, options } = req.body;

    if (!html || !css) {
      return res.status(400).json({
        success: false,
        error: 'HTML and CSS content are required',
      });
    }

    const result = await CriticalCSSService.extractCriticalCSS(html, css, options || {});

    res.json({
      success: true,
      result: {
        critical: result.critical,
        nonCritical: result.nonCritical,
        inlined: result.inlined,
        stats: result.stats,
        paths: result.paths,
        recommendations: result.recommendations,
      },
    });
  } catch (error) {
    console.error('Detailed extraction failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Extraction failed',
    });
  }
});

/**
 * Analyze CSS coverage in HTML
 * POST /api/critical-css/analyze-coverage
 */
router.post('/analyze-coverage', async (req, res) => {
  try {
    const { html, css } = req.body;

    if (!html || !css) {
      return res.status(400).json({
        success: false,
        error: 'HTML and CSS content are required',
      });
    }

    const coverage = await CriticalCSSService.analyzeCoverage(html, css);

    res.json({
      success: true,
      coverage: {
        used: coverage.used,
        unused: coverage.unused,
        coverage: coverage.coverage,
        usedCount: coverage.used.length,
        unusedCount: coverage.unused.length,
        totalCount: coverage.used.length + coverage.unused.length,
      },
    });
  } catch (error) {
    console.error('Coverage analysis failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Analysis failed',
    });
  }
});

/**
 * Get above-the-fold HTML snapshot
 * POST /api/critical-css/above-the-fold
 */
router.post('/above-the-fold', async (req, res) => {
  try {
    const { html, viewportHeight } = req.body;

    if (!html) {
      return res.status(400).json({
        success: false,
        error: 'HTML content is required',
      });
    }

    const snapshot = CriticalCSSService.getAboveTheFoldHTML(
      html,
      viewportHeight || 600
    );

    res.json({
      success: true,
      snapshot,
      viewportHeight: viewportHeight || 600,
    });
  } catch (error) {
    console.error('Above-the-fold extraction failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Extraction failed',
    });
  }
});

/**
 * Quick critical CSS extraction with default options
 * POST /api/critical-css/quick-extract
 */
router.post('/quick-extract', async (req, res) => {
  try {
    const { html, css } = req.body;

    if (!html || !css) {
      return res.status(400).json({
        success: false,
        error: 'HTML and CSS content are required',
      });
    }

    // Use default options for quick extraction
    const result = await CriticalCSSService.extractCriticalCSS(html, css, {
      viewportWidth: 1920,
      viewportHeight: 1080,
      includeFonts: true,
      includeKeyframes: false,
      minify: true,
    });

    res.json({
      success: true,
      critical: result.critical,
      stats: result.stats,
      recommendations: result.recommendations,
    });
  } catch (error) {
    console.error('Quick extraction failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Extraction failed',
    });
  }
});

/**
 * Get extraction statistics only (no actual extraction)
 * POST /api/critical-css/stats
 */
router.post('/stats', async (req, res) => {
  try {
    const { html, css } = req.body;

    if (!html || !css) {
      return res.status(400).json({
        success: false,
        error: 'HTML and CSS content are required',
      });
    }

    const result = await CriticalCSSService.extractCriticalCSS(html, css, {
      minify: false,
    });

    res.json({
      success: true,
      stats: result.stats,
      recommendations: result.recommendations,
    });
  } catch (error) {
    console.error('Stats retrieval failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get stats',
    });
  }
});

/**
 * Batch extract critical CSS for multiple pages
 * POST /api/critical-css/batch-extract
 */
router.post('/batch-extract', async (req, res) => {
  try {
    const { pages } = req.body;

    if (!pages || !Array.isArray(pages)) {
      return res.status(400).json({
        success: false,
        error: 'Pages array is required',
      });
    }

    const results = [];

    for (const page of pages) {
      if (!page.html || !page.css) {
        results.push({
          success: false,
          error: 'Missing HTML or CSS',
          pageName: page.name || 'Unknown',
        });
        continue;
      }

      try {
        const result = await CriticalCSSService.extractCriticalCSS(
          page.html,
          page.css,
          page.options || {}
        );

        results.push({
          success: true,
          pageName: page.name || 'Unknown',
          critical: result.critical,
          stats: result.stats,
          recommendations: result.recommendations,
        });
      } catch (error) {
        results.push({
          success: false,
          pageName: page.name || 'Unknown',
          error: error instanceof Error ? error.message : 'Extraction failed',
        });
      }
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    res.json({
      success: true,
      results,
      summary: {
        total: results.length,
        successful,
        failed,
      },
    });
  } catch (error) {
    console.error('Batch extraction failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Batch extraction failed',
    });
  }
});

export default router;
