import express from 'express';
import WordPressPluginGeneratorService from '../services/WordPressPluginGeneratorService.js';
import archiver from 'archiver';
import fs from 'fs';
import path from 'path';

const router = express.Router();

/**
 * Generate WordPress plugin
 * POST /api/wordpress-plugin-generator/generate
 */
router.post('/generate', async (req, res) => {
  try {
    const request = req.body;

    if (!request.pluginName || !request.pluginSlug || !request.description) {
      return res.status(400).json({
        success: false,
        error: 'Plugin name, slug, and description are required',
      });
    }

    if (!request.features || !Array.isArray(request.features) || request.features.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'At least one feature is required',
      });
    }

    const plugin = await WordPressPluginGeneratorService.generatePlugin(request);

    res.json({
      success: true,
      plugin,
    });
  } catch (error) {
    console.error('Failed to generate plugin:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate plugin',
    });
  }
});

/**
 * Detect plugin conflicts
 * POST /api/wordpress-plugin-generator/detect-conflicts
 */
router.post('/detect-conflicts', (req, res) => {
  try {
    const request = req.body;

    if (!request.pluginSlug || !request.features) {
      return res.status(400).json({
        success: false,
        error: 'Plugin slug and features are required',
      });
    }

    const conflictReport = WordPressPluginGeneratorService.detectConflicts(request);

    res.json({
      success: true,
      conflictReport,
    });
  } catch (error) {
    console.error('Failed to detect conflicts:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to detect conflicts',
    });
  }
});

/**
 * Download generated plugin as ZIP
 * POST /api/wordpress-plugin-generator/download
 */
router.post('/download', async (req, res) => {
  try {
    const request = req.body;

    if (!request.pluginName || !request.pluginSlug || !request.features) {
      return res.status(400).json({
        success: false,
        error: 'Plugin name, slug, and features are required',
      });
    }

    // Generate plugin
    const plugin = await WordPressPluginGeneratorService.generatePlugin(request);

    // Create temp directory
    const tempDir = path.join(process.cwd(), 'temp', `plugin-${Date.now()}`);
    const pluginDir = path.join(tempDir, plugin.pluginSlug);

    // Ensure directories exist
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    // Create plugin files
    for (const file of plugin.files) {
      const filePath = path.join(pluginDir, file.path);
      const fileDir = path.dirname(filePath);

      if (!fs.existsSync(fileDir)) {
        fs.mkdirSync(fileDir, { recursive: true });
      }

      fs.writeFileSync(filePath, file.content);
    }

    // Create ZIP archive
    const zipPath = path.join(tempDir, `${plugin.pluginSlug}.zip`);
    const output = fs.createWriteStream(zipPath);
    const archive = archiver('zip', { zlib: { level: 9 } });

    output.on('close', () => {
      // Set headers for download
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${plugin.pluginSlug}.zip"`);

      // Stream the file
      const fileStream = fs.createReadStream(zipPath);
      fileStream.pipe(res);

      // Cleanup after streaming
      fileStream.on('end', () => {
        setTimeout(() => {
          try {
            fs.rmSync(tempDir, { recursive: true, force: true });
          } catch (error) {
            console.error('Failed to cleanup temp files:', error);
          }
        }, 1000);
      });
    });

    archive.on('error', (err) => {
      throw err;
    });

    archive.pipe(output);
    archive.directory(pluginDir, plugin.pluginSlug);
    archive.finalize();
  } catch (error) {
    console.error('Failed to download plugin:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to download plugin',
    });
  }
});

/**
 * Validate plugin configuration
 * POST /api/wordpress-plugin-generator/validate
 */
router.post('/validate', (req, res) => {
  try {
    const request = req.body;
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate plugin name
    if (!request.pluginName || request.pluginName.trim().length === 0) {
      errors.push('Plugin name is required');
    }

    // Validate plugin slug
    if (!request.pluginSlug || request.pluginSlug.trim().length === 0) {
      errors.push('Plugin slug is required');
    } else if (!/^[a-z0-9-]+$/.test(request.pluginSlug)) {
      errors.push('Plugin slug must contain only lowercase letters, numbers, and hyphens');
    }

    // Validate description
    if (!request.description || request.description.trim().length === 0) {
      errors.push('Plugin description is required');
    }

    // Validate features
    if (!request.features || !Array.isArray(request.features)) {
      errors.push('Features must be an array');
    } else if (request.features.length === 0) {
      errors.push('At least one feature is required');
    } else {
      request.features.forEach((feature: any, index: number) => {
        if (!feature.type) {
          errors.push(`Feature ${index + 1}: type is required`);
        }
        if (!feature.name) {
          errors.push(`Feature ${index + 1}: name is required`);
        }
        if (!feature.config) {
          errors.push(`Feature ${index + 1}: config is required`);
        }
      });
    }

    // Check for excessive features
    if (request.features && request.features.length > 10) {
      warnings.push('Plugin has many features - consider splitting into multiple plugins');
    }

    res.json({
      success: true,
      validation: {
        isValid: errors.length === 0,
        errors,
        warnings,
      },
    });
  } catch (error) {
    console.error('Failed to validate plugin:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to validate plugin',
    });
  }
});

/**
 * Get plugin templates
 * GET /api/wordpress-plugin-generator/templates
 */
router.get('/templates', (req, res) => {
  try {
    const templates = [
      {
        id: 'custom-post-type',
        name: 'Custom Post Type Plugin',
        description: 'Plugin with custom post type and taxonomy',
        features: [
          {
            type: 'custom-post-type',
            name: 'Portfolio Items',
            config: {
              postType: 'portfolio',
              labels: {
                name: 'Portfolio',
                singular_name: 'Portfolio Item',
              },
              public: true,
              supports: ['title', 'editor', 'thumbnail'],
              has_archive: true,
              show_in_rest: true,
            },
          },
          {
            type: 'custom-taxonomy',
            name: 'Portfolio Categories',
            config: {
              taxonomy: 'portfolio_category',
              postTypes: ['portfolio'],
              labels: {
                name: 'Categories',
                singular_name: 'Category',
              },
              hierarchical: true,
            },
          },
        ],
      },
      {
        id: 'shortcode',
        name: 'Shortcode Plugin',
        description: 'Simple shortcode plugin',
        features: [
          {
            type: 'shortcode',
            name: 'Contact Form Shortcode',
            config: {
              tag: 'contact_form',
              attributes: {
                email: 'admin@example.com',
                subject: 'Contact Form',
              },
              supportedContent: false,
            },
          },
        ],
      },
      {
        id: 'rest-api',
        name: 'REST API Plugin',
        description: 'Plugin with REST API endpoint',
        features: [
          {
            type: 'rest-api-endpoint',
            name: 'Custom API Endpoint',
            config: {
              endpoint: 'data',
              method: 'GET',
              requireAuth: false,
            },
          },
        ],
      },
      {
        id: 'widget',
        name: 'Widget Plugin',
        description: 'Plugin with custom widget',
        features: [
          {
            type: 'widget',
            name: 'Custom Widget',
            config: {
              name: 'My Custom Widget',
              widgetId: 'custom_widget',
              description: 'A custom widget for your sidebar',
            },
          },
        ],
      },
    ];

    res.json({
      success: true,
      templates,
    });
  } catch (error) {
    console.error('Failed to get templates:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get templates',
    });
  }
});

/**
 * Get supported feature types
 * GET /api/wordpress-plugin-generator/feature-types
 */
router.get('/feature-types', (req, res) => {
  try {
    const featureTypes = [
      {
        type: 'custom-post-type',
        name: 'Custom Post Type',
        description: 'Register a custom post type (e.g., Portfolio, Products)',
        complexity: 'low',
        requiredConfig: ['postType', 'labels', 'public', 'supports'],
      },
      {
        type: 'custom-taxonomy',
        name: 'Custom Taxonomy',
        description: 'Register a custom taxonomy (e.g., Categories, Tags)',
        complexity: 'low',
        requiredConfig: ['taxonomy', 'postTypes', 'labels'],
      },
      {
        type: 'shortcode',
        name: 'Shortcode',
        description: 'Create a custom shortcode',
        complexity: 'low',
        requiredConfig: ['tag', 'callback'],
      },
      {
        type: 'widget',
        name: 'Widget',
        description: 'Create a custom widget',
        complexity: 'medium',
        requiredConfig: ['name', 'widgetId', 'description'],
      },
      {
        type: 'rest-api-endpoint',
        name: 'REST API Endpoint',
        description: 'Add a custom REST API endpoint',
        complexity: 'medium',
        requiredConfig: ['endpoint', 'method'],
      },
      {
        type: 'ajax-handler',
        name: 'AJAX Handler',
        description: 'Add an AJAX handler for dynamic requests',
        complexity: 'medium',
        requiredConfig: ['action'],
      },
      {
        type: 'gutenberg-block',
        name: 'Gutenberg Block',
        description: 'Create a custom Gutenberg block',
        complexity: 'high',
        requiredConfig: ['blockName', 'name'],
      },
      {
        type: 'admin-page',
        name: 'Admin Page',
        description: 'Add a custom admin page',
        complexity: 'low',
        requiredConfig: ['pageTitle', 'menuTitle'],
      },
      {
        type: 'custom-fields',
        name: 'Custom Fields',
        description: 'Add custom meta fields',
        complexity: 'medium',
        requiredConfig: ['fields', 'postTypes'],
      },
      {
        type: 'cron-job',
        name: 'Cron Job',
        description: 'Schedule a recurring task',
        complexity: 'medium',
        requiredConfig: ['schedule', 'callback'],
      },
    ];

    res.json({
      success: true,
      featureTypes,
    });
  } catch (error) {
    console.error('Failed to get feature types:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get feature types',
    });
  }
});

/**
 * Preview plugin code
 * POST /api/wordpress-plugin-generator/preview
 */
router.post('/preview', async (req, res) => {
  try {
    const { pluginName, pluginSlug, description, features, fileToPreview } = req.body;

    if (!pluginName || !pluginSlug || !features) {
      return res.status(400).json({
        success: false,
        error: 'Plugin name, slug, and features are required',
      });
    }

    // Generate plugin
    const plugin = await WordPressPluginGeneratorService.generatePlugin({
      pluginName,
      pluginSlug,
      description: description || 'Custom plugin',
      features,
    });

    // Get specific file or main file
    let file = plugin.files.find(f => f.path === fileToPreview);
    if (!file) {
      file = plugin.files.find(f => f.path === `${pluginSlug}.php`);
    }

    if (!file) {
      return res.status(404).json({
        success: false,
        error: 'File not found',
      });
    }

    res.json({
      success: true,
      preview: {
        file: file.path,
        content: file.content,
        type: file.type,
        size: file.size,
        availableFiles: plugin.files.map(f => ({
          path: f.path,
          type: f.type,
          description: f.description,
        })),
      },
    });
  } catch (error) {
    console.error('Failed to preview plugin:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to preview plugin',
    });
  }
});

/**
 * Get plugin statistics
 * POST /api/wordpress-plugin-generator/stats
 */
router.post('/stats', async (req, res) => {
  try {
    const request = req.body;

    if (!request.pluginName || !request.pluginSlug || !request.features) {
      return res.status(400).json({
        success: false,
        error: 'Plugin name, slug, and features are required',
      });
    }

    // Generate plugin
    const plugin = await WordPressPluginGeneratorService.generatePlugin(request);

    // Calculate statistics
    const stats = {
      totalFiles: plugin.files.length,
      totalSize: plugin.size,
      totalSizeFormatted: formatBytes(plugin.size),
      filesByType: plugin.files.reduce((acc, file) => {
        acc[file.type] = (acc[file.type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
      sizeByType: plugin.files.reduce((acc, file) => {
        acc[file.type] = (acc[file.type] || 0) + file.size;
        return acc;
      }, {} as Record<string, number>),
      features: plugin.files.filter(f => f.path.startsWith('includes/')).length,
      complexity: plugin.complexityLevel,
      securityScore: plugin.securityScore,
      directories: plugin.structure.directories.length,
      lines: plugin.files.reduce((sum, file) => {
        return sum + (file.content.split('\n').length);
      }, 0),
    };

    res.json({
      success: true,
      stats,
    });
  } catch (error) {
    console.error('Failed to get plugin stats:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get stats',
    });
  }
});

// Helper function
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default router;
