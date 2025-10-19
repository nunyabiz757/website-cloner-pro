import express from 'express';
import ThemeJsonGenerationService from '../services/ThemeJsonGenerationService.js';

const router = express.Router();

/**
 * Generate Complete Theme.json
 * POST /api/theme-json-generation/generate
 */
router.post('/generate', async (req, res) => {
  try {
    const { html, css, options } = req.body;

    if (!html) {
      return res.status(400).json({
        success: false,
        error: 'HTML content is required',
      });
    }

    const themeJson = await ThemeJsonGenerationService.generateThemeJson(
      html,
      css || '',
      options
    );

    res.json({
      success: true,
      themeJson,
      downloadUrl: '/api/theme-json-generation/download',
    });
  } catch (error) {
    console.error('Failed to generate theme.json:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate theme.json',
    });
  }
});

/**
 * Extract Design Tokens Only
 * POST /api/theme-json-generation/extract-tokens
 */
router.post('/extract-tokens', async (req, res) => {
  try {
    const { html, css } = req.body;

    if (!html) {
      return res.status(400).json({
        success: false,
        error: 'HTML content is required',
      });
    }

    const tokens = ThemeJsonGenerationService.extractDesignTokens(html, css || '');

    res.json({
      success: true,
      tokens,
    });
  } catch (error) {
    console.error('Failed to extract design tokens:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to extract tokens',
    });
  }
});

/**
 * Get Theme.json Schema
 * GET /api/theme-json-generation/schema
 */
router.get('/schema', (req, res) => {
  res.json({
    success: true,
    schema: {
      $schema: 'https://schemas.wp.org/trunk/theme.json',
      version: 2,
      description: 'WordPress Full Site Editing theme.json schema',
      documentation: 'https://developer.wordpress.org/block-editor/how-to-guides/themes/theme-json/',
      sections: {
        settings: 'Theme settings for colors, typography, spacing, layout',
        styles: 'Default styles for blocks and elements',
        templateParts: 'Reusable template parts (header, footer, etc.)',
        customTemplates: 'Custom page templates',
        patterns: 'Block patterns',
      },
    },
  });
});

/**
 * Health Check
 * GET /api/theme-json-generation/health
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'Theme.json Generation Service',
    status: 'operational',
    features: [
      'Automatic theme.json generation',
      'Design token extraction',
      'Color palette generation',
      'Typography scale extraction',
      'Spacing scale generation',
      'Layout detection',
    ],
    version: '1.0.0',
  });
});

export default router;
