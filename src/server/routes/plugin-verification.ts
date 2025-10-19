import express from 'express';
import PluginFreeVerificationService from '../services/PluginFreeVerificationService.js';
import DependencyEliminationService from '../services/DependencyEliminationService.js';

const router = express.Router();

/**
 * Verify if content is plugin-free
 * POST /api/plugin-verification/verify
 */
router.post('/verify', async (req, res) => {
  try {
    const { files, options } = req.body;

    if (!files) {
      return res.status(400).json({
        success: false,
        error: 'Files object is required',
      });
    }

    // Validate files object
    const { php = [], html = [], css = [], js = [] } = files;

    const report = await PluginFreeVerificationService.verifyPluginFree(
      '',
      { php, html, css, js },
      {
        strictMode: options?.strictMode || false,
        allowWordPressCore: options?.allowWordPressCore !== false,
        allowThemeFunctions: options?.allowThemeFunctions !== false,
        customWhitelist: options?.customWhitelist || [],
      }
    );

    res.json({
      success: true,
      report,
      textReport: PluginFreeVerificationService.generateTextReport(report),
    });
  } catch (error) {
    console.error('Verification failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Verification failed',
    });
  }
});

/**
 * Quick check if single content is plugin-free
 * POST /api/plugin-verification/quick-check
 */
router.post('/quick-check', async (req, res) => {
  try {
    const { content, type } = req.body;

    if (!content || !type) {
      return res.status(400).json({
        success: false,
        error: 'Content and type are required',
      });
    }

    if (!['php', 'html', 'css', 'js'].includes(type)) {
      return res.status(400).json({
        success: false,
        error: 'Type must be one of: php, html, css, js',
      });
    }

    const isClean = await PluginFreeVerificationService.quickCheck(content, type as any);

    res.json({
      success: true,
      isClean,
      message: isClean ? 'Content is plugin-free' : 'Plugin dependencies detected',
    });
  } catch (error) {
    console.error('Quick check failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Quick check failed',
    });
  }
});

/**
 * Eliminate dependencies from content
 * POST /api/plugin-verification/eliminate
 */
router.post('/eliminate', async (req, res) => {
  try {
    const { content, type, options } = req.body;

    if (!content || !type) {
      return res.status(400).json({
        success: false,
        error: 'Content and type are required',
      });
    }

    if (!['html', 'php', 'css', 'js'].includes(type)) {
      return res.status(400).json({
        success: false,
        error: 'Type must be one of: html, php, css, js',
      });
    }

    let result;

    switch (type) {
      case 'html':
        result = await DependencyEliminationService.eliminateFromHTML(content, options);
        break;
      case 'php':
        result = await DependencyEliminationService.eliminateFromPHP(content, options);
        break;
      case 'css':
        result = await DependencyEliminationService.eliminateFromCSS(content, options);
        break;
      case 'js':
        result = await DependencyEliminationService.eliminateFromJS(content, options);
        break;
    }

    res.json({
      success: true,
      result,
    });
  } catch (error) {
    console.error('Elimination failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Elimination failed',
    });
  }
});

/**
 * Eliminate dependencies from multiple files
 * POST /api/plugin-verification/eliminate-batch
 */
router.post('/eliminate-batch', async (req, res) => {
  try {
    const { files, options } = req.body;

    if (!files) {
      return res.status(400).json({
        success: false,
        error: 'Files object is required',
      });
    }

    const results: Record<string, any> = {};

    // Process HTML
    if (files.html && files.html.length > 0) {
      const htmlResults = [];
      for (const content of files.html) {
        const result = await DependencyEliminationService.eliminateFromHTML(content, options);
        htmlResults.push(result);
      }
      results.html = htmlResults;
    }

    // Process PHP
    if (files.php && files.php.length > 0) {
      const phpResults = [];
      for (const content of files.php) {
        const result = await DependencyEliminationService.eliminateFromPHP(content, options);
        phpResults.push(result);
      }
      results.php = phpResults;
    }

    // Process CSS
    if (files.css && files.css.length > 0) {
      const cssResults = [];
      for (const content of files.css) {
        const result = await DependencyEliminationService.eliminateFromCSS(content, options);
        cssResults.push(result);
      }
      results.css = cssResults;
    }

    // Process JS
    if (files.js && files.js.length > 0) {
      const jsResults = [];
      for (const content of files.js) {
        const result = await DependencyEliminationService.eliminateFromJS(content, options);
        jsResults.push(result);
      }
      results.js = jsResults;
    }

    // Generate confirmation report
    const confirmationReport = DependencyEliminationService.generateConfirmationReport({
      html: results.html?.[0],
      php: results.php?.[0],
      css: results.css?.[0],
      js: results.js?.[0],
    });

    res.json({
      success: true,
      results,
      confirmationReport,
    });
  } catch (error) {
    console.error('Batch elimination failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Batch elimination failed',
    });
  }
});

/**
 * Get verification statistics
 * GET /api/plugin-verification/stats
 */
router.get('/stats', async (req, res) => {
  try {
    // Return statistics about the verification service
    res.json({
      success: true,
      stats: {
        supportedFileTypes: ['php', 'html', 'css', 'js'],
        detectedPlugins: [
          'Elementor',
          'WooCommerce',
          'Yoast SEO',
          'Jetpack',
          'Advanced Custom Fields',
          'WPBakery Page Builder',
          'Contact Form 7',
          'Gravity Forms',
        ],
        verificationModes: ['strict', 'standard', 'lenient'],
        eliminationOptions: [
          'removeShortcodes',
          'convertToStatic',
          'removePluginClasses',
          'removePluginScripts',
          'removePluginStyles',
          'preserveLayout',
        ],
      },
    });
  } catch (error) {
    console.error('Failed to get stats:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get stats',
    });
  }
});

export default router;
