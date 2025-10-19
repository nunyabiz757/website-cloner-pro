import express from 'express';
import AssetEmbeddingService from '../services/AssetEmbeddingService.js';
import { WordPressAPIClient, type WordPressConfig } from '../services/wordpress/WordPressAPIClient.js';
import { logAuditEvent } from '../utils/audit-logger.js';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';

const router = express.Router();

/**
 * Process assets with automatic embedding decisions
 * POST /api/asset-embedding/process
 */
router.post('/process', async (req, res) => {
  try {
    const { html, assets, options } = req.body;

    if (!html) {
      return res.status(400).json({
        success: false,
        error: 'HTML content is required',
      });
    }

    if (!assets || typeof assets !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Assets object is required (key: path, value: base64 content)',
      });
    }

    // Convert base64 assets to Buffer map
    const assetMap = new Map<string, Buffer>();
    for (const [path, base64Content] of Object.entries(assets)) {
      if (typeof base64Content === 'string') {
        assetMap.set(path, Buffer.from(base64Content, 'base64'));
      }
    }

    const result = await AssetEmbeddingService.processAssets(
      html,
      assetMap,
      options || {}
    );

    res.json({
      success: true,
      result: {
        html: result.html,
        decisions: result.decisions,
        stats: result.stats,
        recommendations: result.recommendations,
      },
    });
  } catch (error) {
    console.error('Asset processing failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Processing failed',
    });
  }
});

/**
 * Analyze assets without processing
 * POST /api/asset-embedding/analyze
 */
router.post('/analyze', async (req, res) => {
  try {
    const { html, assets, options } = req.body;

    if (!html) {
      return res.status(400).json({
        success: false,
        error: 'HTML content is required',
      });
    }

    if (!assets || typeof assets !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Assets object is required',
      });
    }

    // Convert base64 assets to Buffer map
    const assetMap = new Map<string, Buffer>();
    for (const [path, base64Content] of Object.entries(assets)) {
      if (typeof base64Content === 'string') {
        assetMap.set(path, Buffer.from(base64Content, 'base64'));
      }
    }

    const analysis = await AssetEmbeddingService.analyzeAssets(
      html,
      assetMap,
      options || {}
    );

    res.json({
      success: true,
      analysis: {
        totalAssets: analysis.totalAssets,
        totalSize: analysis.totalSize,
        averageSize: analysis.averageSize,
        assetsByType: analysis.assetsByType,
        usageCounts: Object.fromEntries(analysis.usageCounts),
        criticalAssets: analysis.criticalAssets,
      },
    });
  } catch (error) {
    console.error('Asset analysis failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Analysis failed',
    });
  }
});

/**
 * Calculate optimal thresholds based on HTTP version
 * GET /api/asset-embedding/calculate-thresholds
 */
router.get('/calculate-thresholds', async (req, res) => {
  try {
    const { http2 } = req.query;

    const useHTTP2 = http2 === 'true' || http2 === '1';
    const thresholds = AssetEmbeddingService.calculateOptimalThresholds(useHTTP2);

    res.json({
      success: true,
      http2: useHTTP2,
      thresholds: {
        inlineThreshold: thresholds.inlineThreshold,
        imageThreshold: thresholds.imageThreshold,
        fontThreshold: thresholds.fontThreshold,
      },
      formatted: {
        inlineThreshold: AssetEmbeddingService['formatBytes'](thresholds.inlineThreshold),
        imageThreshold: AssetEmbeddingService['formatBytes'](thresholds.imageThreshold),
        fontThreshold: AssetEmbeddingService['formatBytes'](thresholds.fontThreshold),
      },
    });
  } catch (error) {
    console.error('Threshold calculation failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Calculation failed',
    });
  }
});

/**
 * Quick process with default options
 * POST /api/asset-embedding/quick-process
 */
router.post('/quick-process', async (req, res) => {
  try {
    const { html, assets } = req.body;

    if (!html || !assets) {
      return res.status(400).json({
        success: false,
        error: 'HTML content and assets are required',
      });
    }

    // Convert base64 assets to Buffer map
    const assetMap = new Map<string, Buffer>();
    for (const [path, base64Content] of Object.entries(assets)) {
      if (typeof base64Content === 'string') {
        assetMap.set(path, Buffer.from(base64Content, 'base64'));
      }
    }

    // Use default options optimized for HTTP/2
    const result = await AssetEmbeddingService.processAssets(html, assetMap, {
      optimizeForHTTP2: true,
      enableBase64: true,
      enableInlineSVG: true,
    });

    res.json({
      success: true,
      html: result.html,
      stats: result.stats,
    });
  } catch (error) {
    console.error('Quick processing failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Processing failed',
    });
  }
});

/**
 * Batch process multiple pages
 * POST /api/asset-embedding/batch-process
 */
router.post('/batch-process', async (req, res) => {
  try {
    const { pages, globalOptions } = req.body;

    if (!pages || !Array.isArray(pages)) {
      return res.status(400).json({
        success: false,
        error: 'Pages array is required',
      });
    }

    const results = [];

    for (const page of pages) {
      if (!page.html || !page.assets) {
        results.push({
          success: false,
          error: 'Missing HTML or assets',
          pageName: page.name || 'Unknown',
        });
        continue;
      }

      try {
        // Convert base64 assets to Buffer map
        const assetMap = new Map<string, Buffer>();
        for (const [path, base64Content] of Object.entries(page.assets)) {
          if (typeof base64Content === 'string') {
            assetMap.set(path, Buffer.from(base64Content, 'base64'));
          }
        }

        const result = await AssetEmbeddingService.processAssets(
          page.html,
          assetMap,
          { ...globalOptions, ...page.options }
        );

        results.push({
          success: true,
          pageName: page.name || 'Unknown',
          stats: result.stats,
          decisionsCount: {
            inline: result.decisions.filter(d => d.decision === 'inline').length,
            base64: result.decisions.filter(d => d.decision === 'base64').length,
            external: result.decisions.filter(d => d.decision === 'external').length,
            wordpress: result.decisions.filter(d => d.decision === 'wordpress').length,
          },
        });
      } catch (error) {
        results.push({
          success: false,
          pageName: page.name || 'Unknown',
          error: error instanceof Error ? error.message : 'Processing failed',
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
    console.error('Batch processing failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Batch processing failed',
    });
  }
});

/**
 * Get embedding statistics for assets
 * POST /api/asset-embedding/stats
 */
router.post('/stats', async (req, res) => {
  try {
    const { html, assets, options } = req.body;

    if (!html || !assets) {
      return res.status(400).json({
        success: false,
        error: 'HTML content and assets are required',
      });
    }

    // Convert base64 assets to Buffer map
    const assetMap = new Map<string, Buffer>();
    for (const [path, base64Content] of Object.entries(assets)) {
      if (typeof base64Content === 'string') {
        assetMap.set(path, Buffer.from(base64Content, 'base64'));
      }
    }

    const result = await AssetEmbeddingService.processAssets(
      html,
      assetMap,
      options || {}
    );

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
 * Upload assets to WordPress media library
 * POST /api/asset-embedding/wordpress-upload
 */
router.post('/wordpress-upload', async (req, res) => {
  const startTime = Date.now();
  const userId = (req as any).user?.id;

  try {
    const { assets, wordPressConfig } = req.body;

    if (!assets || typeof assets !== 'object') {
      return res.status(400).json({
        success: false,
        error: 'Assets object is required',
      });
    }

    if (!wordPressConfig || !wordPressConfig.siteUrl) {
      return res.status(400).json({
        success: false,
        error: 'WordPress configuration (siteUrl, username, applicationPassword) is required',
      });
    }

    // Validate WordPress config
    const config: WordPressConfig = {
      siteUrl: wordPressConfig.siteUrl,
      username: wordPressConfig.username || process.env.WP_USERNAME || '',
      applicationPassword: wordPressConfig.applicationPassword || process.env.WP_APP_PASSWORD || '',
    };

    if (!config.username || !config.applicationPassword) {
      return res.status(400).json({
        success: false,
        error: 'WordPress username and application password are required',
      });
    }

    // Create WordPress API client
    const wpClient = new WordPressAPIClient(config);

    // Test connection first
    console.log('[WP-UPLOAD] Testing WordPress connection...');
    const connectionTest = await wpClient.testConnection();

    if (!connectionTest.success) {
      return res.status(502).json({
        success: false,
        error: `WordPress connection failed: ${connectionTest.error}`,
      });
    }

    console.log(`[WP-UPLOAD] Connected to WordPress ${connectionTest.version}`);

    const uploadResults = [];
    const mediaIds: Record<string, number> = {}; // Store media IDs by path
    const tempDir = path.join(process.cwd(), 'temp', 'wp-uploads', crypto.randomUUID());

    try {
      // Create temp directory for file uploads
      await fs.mkdir(tempDir, { recursive: true });

      for (const [assetPath, base64Content] of Object.entries(assets)) {
        if (typeof base64Content !== 'string') {
          uploadResults.push({
            path: assetPath,
            success: false,
            error: 'Invalid asset content (expected base64 string)',
          });
          continue;
        }

        try {
          // Decode base64 content
          const content = Buffer.from(base64Content, 'base64');

          // Extract filename and create temp file
          const fileName = path.basename(assetPath);
          const tempFilePath = path.join(tempDir, fileName);

          // Write to temp file
          await fs.writeFile(tempFilePath, content);

          console.log(`[WP-UPLOAD] Uploading ${fileName} (${content.length} bytes)...`);

          // Upload to WordPress
          const media = await wpClient.uploadMedia({
            filePath: tempFilePath,
            fileName: fileName,
            title: fileName,
            alt: fileName,
          });

          console.log(`[WP-UPLOAD] Uploaded ${fileName} → Media ID ${media.id}`);

          // Store media ID
          mediaIds[assetPath] = media.id;

          uploadResults.push({
            path: assetPath,
            success: true,
            wordPressUrl: media.source_url,
            mediaId: media.id,
            size: content.length,
            mimeType: media.mime_type,
            title: media.title.rendered,
          });

          // Clean up temp file
          await fs.unlink(tempFilePath).catch(() => {});
        } catch (error) {
          console.error(`[WP-UPLOAD] Failed to upload ${assetPath}:`, error);

          uploadResults.push({
            path: assetPath,
            success: false,
            error: error instanceof Error ? error.message : 'Upload failed',
          });
        }
      }
    } finally {
      // Clean up temp directory
      await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }

    const successful = uploadResults.filter(r => r.success).length;
    const failed = uploadResults.filter(r => !r.success).length;

    console.log(`[WP-UPLOAD] Complete: ${successful} succeeded, ${failed} failed`);

    // Log to audit
    await logAuditEvent({
      userId: userId || 'system',
      action: 'wordpress.media.upload',
      resourceType: 'wordpress_media',
      resourceId: config.siteUrl,
      details: {
        totalAssets: uploadResults.length,
        successful,
        failed,
        mediaIds: Object.values(mediaIds),
      },
      durationMs: Date.now() - startTime,
      severity: failed > 0 ? 'warning' : 'info',
      category: 'export',
    });

    res.json({
      success: true,
      uploads: uploadResults,
      mediaIds, // Map of path → media ID for client-side reference
      summary: {
        total: uploadResults.length,
        successful,
        failed,
        durationMs: Date.now() - startTime,
      },
    });
  } catch (error) {
    console.error('[WP-UPLOAD] Upload process failed:', error);

    // Log failure to audit
    await logAuditEvent({
      userId: userId || 'system',
      action: 'wordpress.media.upload.failed',
      resourceType: 'wordpress_media',
      resourceId: 'unknown',
      errorMessage: error instanceof Error ? error.message : 'Upload process failed',
      durationMs: Date.now() - startTime,
      severity: 'error',
      category: 'export',
    });

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Upload failed',
    });
  }
});

/**
 * Get decision breakdown for specific assets
 * POST /api/asset-embedding/decision-preview
 */
router.post('/decision-preview', async (req, res) => {
  try {
    const { html, assets, options } = req.body;

    if (!html || !assets) {
      return res.status(400).json({
        success: false,
        error: 'HTML content and assets are required',
      });
    }

    // Convert base64 assets to Buffer map
    const assetMap = new Map<string, Buffer>();
    for (const [path, base64Content] of Object.entries(assets)) {
      if (typeof base64Content === 'string') {
        assetMap.set(path, Buffer.from(base64Content, 'base64'));
      }
    }

    const result = await AssetEmbeddingService.processAssets(
      html,
      assetMap,
      options || {}
    );

    // Group decisions by type
    const decisionsByType = {
      inline: result.decisions.filter(d => d.decision === 'inline'),
      base64: result.decisions.filter(d => d.decision === 'base64'),
      external: result.decisions.filter(d => d.decision === 'external'),
      wordpress: result.decisions.filter(d => d.decision === 'wordpress'),
    };

    res.json({
      success: true,
      preview: {
        totalAssets: result.decisions.length,
        decisionCounts: {
          inline: decisionsByType.inline.length,
          base64: decisionsByType.base64.length,
          external: decisionsByType.external.length,
          wordpress: decisionsByType.wordpress.length,
        },
        decisions: result.decisions.map(d => ({
          path: d.path,
          type: d.type,
          size: d.size,
          sizeFormatted: d.sizeFormatted,
          decision: d.decision,
          reason: d.reason,
          isCritical: d.isCritical,
        })),
        stats: result.stats,
      },
    });
  } catch (error) {
    console.error('Decision preview failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Preview failed',
    });
  }
});

export default router;
