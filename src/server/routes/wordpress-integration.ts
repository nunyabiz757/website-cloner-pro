/**
 * WordPress Integration API Routes
 *
 * Endpoints for WordPress template import and verification
 */

import express, { Request, Response, Router } from 'express';
import {
  createWordPressPostCreator,
  createWordPressClient,
  createTemplateVerifier,
  type WordPressCredentials,
  type ElementorImportOptions,
  type GutenbergImportOptions,
} from '../services/wordpress/index.js';
import { recognizeComponents } from '../services/page-builder/recognizer/component-recognizer.js';
import { exportToElementor } from '../services/page-builder/exporters/elementor-exporter.js';
import { exportToGutenberg } from '../services/page-builder/exporters/gutenberg-exporter.js';
import { mapToElementorWidget } from '../services/page-builder/mappers/elementor-mapper.js';
import { AppLogger } from '../utils/logger.js';
import { authenticate } from '../middleware/auth.js';

const router: Router = express.Router();

/**
 * Test WordPress connection
 * POST /api/wordpress/test-connection
 */
router.post('/test-connection', authenticate, async (req: Request, res: Response) => {
  try {
    const credentials: WordPressCredentials = req.body;

    if (!credentials.siteUrl) {
      return res.status(400).json({ error: 'Site URL is required' });
    }

    const client = createWordPressClient(credentials);
    const result = await client.testConnection();

    if (result.success) {
      const siteInfo = await client.getSiteInfo();
      return res.json({
        success: true,
        message: result.message,
        siteInfo,
      });
    } else {
      return res.status(400).json({
        success: false,
        message: result.message,
      });
    }
  } catch (error) {
    AppLogger.error('WordPress connection test failed', error as Error);
    return res.status(500).json({
      error: 'Connection test failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Import HTML to WordPress as Elementor page
 * POST /api/wordpress/import/elementor
 */
router.post('/import/elementor', authenticate, async (req: Request, res: Response) => {
  try {
    const { html, credentials, options } = req.body as {
      html: string;
      credentials: WordPressCredentials;
      options: ElementorImportOptions;
    };

    if (!html || !credentials) {
      return res.status(400).json({ error: 'HTML and credentials are required' });
    }

    // Step 1: Recognize components
    const components = await recognizeComponents(html, { minConfidence: 0.6 });

    if (components.length === 0) {
      return res.status(400).json({
        error: 'No components recognized from HTML',
        suggestion: 'Try adjusting the HTML structure or lowering the confidence threshold',
      });
    }

    // Step 2: Map to Elementor widgets
    const widgets = components.map((component) => mapToElementorWidget(component));

    // Step 3: Export to Elementor format
    const elementorExport = exportToElementor(widgets, options.title);

    // Step 4: Create WordPress post
    const postCreator = createWordPressPostCreator(credentials);
    const result = await postCreator.createFromElementorExport(elementorExport, options);

    AppLogger.info('Elementor import completed', {
      success: result.success,
      postId: result.postId,
      componentsRecognized: components.length,
    });

    return res.json({
      success: result.success,
      postId: result.postId,
      postLink: result.postLink,
      editLink: result.editLink,
      componentsRecognized: components.length,
      widgetsCreated: widgets.length,
      mediaUploaded: result.mediaUploaded,
      errors: result.errors,
      warnings: result.warnings,
    });
  } catch (error) {
    AppLogger.error('Elementor import failed', error as Error);
    return res.status(500).json({
      error: 'Import failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Import HTML to WordPress as Gutenberg page
 * POST /api/wordpress/import/gutenberg
 */
router.post('/import/gutenberg', authenticate, async (req: Request, res: Response) => {
  try {
    const { html, credentials, options } = req.body as {
      html: string;
      credentials: WordPressCredentials;
      options: GutenbergImportOptions;
    };

    if (!html || !credentials) {
      return res.status(400).json({ error: 'HTML and credentials are required' });
    }

    // Step 1: Recognize components
    const components = await recognizeComponents(html, { minConfidence: 0.6 });

    if (components.length === 0) {
      return res.status(400).json({
        error: 'No components recognized from HTML',
      });
    }

    // Step 2: Export to Gutenberg blocks
    const gutenbergBlocks = exportToGutenberg(components, {
      preserveLayout: true,
      useGroupBlocks: true,
    });

    // Step 3: Create WordPress post
    const postCreator = createWordPressPostCreator(credentials);
    const result = await postCreator.createFromGutenbergBlocks(gutenbergBlocks, options);

    AppLogger.info('Gutenberg import completed', {
      success: result.success,
      postId: result.postId,
      componentsRecognized: components.length,
    });

    return res.json({
      success: result.success,
      postId: result.postId,
      postLink: result.postLink,
      editLink: result.editLink,
      componentsRecognized: components.length,
      mediaUploaded: result.mediaUploaded,
      errors: result.errors,
      warnings: result.warnings,
    });
  } catch (error) {
    AppLogger.error('Gutenberg import failed', error as Error);
    return res.status(500).json({
      error: 'Import failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Verify imported template
 * POST /api/wordpress/verify
 */
router.post('/verify', authenticate, async (req: Request, res: Response) => {
  try {
    const { credentials, postId, originalUrl, options } = req.body;

    if (!credentials || !postId) {
      return res.status(400).json({ error: 'Credentials and post ID are required' });
    }

    const client = createWordPressClient(credentials);
    const verifier = createTemplateVerifier(client);

    const verificationResult = await verifier.verifyTemplate({
      postId,
      originalUrl: originalUrl || 'https://example.com',
      takeScreenshots: options?.takeScreenshots !== false,
      checkAssets: options?.checkAssets !== false,
      checkConsoleErrors: options?.checkConsoleErrors !== false,
      timeout: options?.timeout || 30000,
    });

    await verifier.closeBrowser();

    AppLogger.info('Template verification completed', {
      postId,
      success: verificationResult.success,
    });

    return res.json(verificationResult);
  } catch (error) {
    AppLogger.error('Template verification failed', error as Error);
    return res.status(500).json({
      error: 'Verification failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Get WordPress site information
 * POST /api/wordpress/site-info
 */
router.post('/site-info', authenticate, async (req: Request, res: Response) => {
  try {
    const credentials: WordPressCredentials = req.body;

    if (!credentials.siteUrl) {
      return res.status(400).json({ error: 'Site URL is required' });
    }

    const client = createWordPressClient(credentials);
    const siteInfo = await client.getSiteInfo();

    return res.json(siteInfo);
  } catch (error) {
    AppLogger.error('Failed to get WordPress site info', error as Error);
    return res.status(500).json({
      error: 'Failed to get site info',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Preview export without importing
 * POST /api/wordpress/preview-export
 */
router.post('/preview-export', authenticate, async (req: Request, res: Response) => {
  try {
    const { html, format } = req.body as {
      html: string;
      format: 'elementor' | 'gutenberg';
    };

    if (!html || !format) {
      return res.status(400).json({ error: 'HTML and format are required' });
    }

    // Recognize components
    const components = await recognizeComponents(html, { minConfidence: 0.6 });

    let exportData: any;

    if (format === 'elementor') {
      const widgets = components.map((component) => mapToElementorWidget(component));
      exportData = exportToElementor(widgets, 'Preview Export');
    } else {
      exportData = exportToGutenberg(components, {
        preserveLayout: true,
        useGroupBlocks: true,
      });
    }

    return res.json({
      format,
      componentsRecognized: components.length,
      exportData,
      components: components.map((c) => ({
        type: c.componentType,
        confidence: c.confidence,
        element: c.element.tagName,
      })),
    });
  } catch (error) {
    AppLogger.error('Preview export failed', error as Error);
    return res.status(500).json({
      error: 'Preview failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
