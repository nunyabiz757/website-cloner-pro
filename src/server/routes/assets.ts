import express from 'express';
import { UnusedAssetDetectionService } from '../services/analysis/UnusedAssetDetectionService.js';
import { logAuditEvent } from '../utils/audit-logger.js';
import path from 'path';
import fs from 'fs/promises';

const router = express.Router();

/**
 * Get unused assets report for a project
 * GET /api/assets/unused/:projectId
 */
router.get('/unused/:projectId', async (req, res) => {
  const startTime = Date.now();
  const userId = (req as any).user?.id;
  const { projectId } = req.params;

  try {
    console.log(`[UNUSED-ASSETS] Scanning project ${projectId}...`);

    // Get project directory
    const projectDir = path.join(process.cwd(), 'projects', projectId);

    // Check if project exists
    try {
      await fs.access(projectDir);
    } catch {
      return res.status(404).json({
        success: false,
        error: 'Project not found',
      });
    }

    // Find all HTML files
    const htmlFiles: string[] = [];
    const findHtmlFiles = async (dir: string): Promise<void> => {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          // Skip node_modules and other common excluded directories
          if (!['node_modules', '.git', 'dist', 'build'].includes(entry.name)) {
            await findHtmlFiles(fullPath);
          }
        } else if (entry.isFile() && entry.name.endsWith('.html')) {
          const content = await fs.readFile(fullPath, 'utf-8');
          htmlFiles.push(content);
        }
      }
    };

    await findHtmlFiles(projectDir);

    // Find all CSS files
    const cssFiles: string[] = [];
    const findCssFiles = async (dir: string): Promise<void> => {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          if (!['node_modules', '.git', 'dist', 'build'].includes(entry.name)) {
            await findCssFiles(fullPath);
          }
        } else if (entry.isFile() && entry.name.endsWith('.css')) {
          const content = await fs.readFile(fullPath, 'utf-8');
          cssFiles.push(content);
        }
      }
    };

    await findCssFiles(projectDir);

    // Find all assets
    const assets: Array<{
      url: string;
      type: 'image' | 'css' | 'javascript' | 'font' | 'video' | 'audio' | 'other';
      size: number;
      path: string;
      filename: string;
    }> = [];

    const findAssets = async (dir: string, baseDir: string = projectDir): Promise<void> => {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          if (!['node_modules', '.git', 'dist', 'build'].includes(entry.name)) {
            await findAssets(fullPath, baseDir);
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          let type: typeof assets[0]['type'] = 'other';

          // Determine asset type
          if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif', '.svg', '.ico'].includes(ext)) {
            type = 'image';
          } else if (['.css'].includes(ext)) {
            type = 'css';
          } else if (['.js', '.mjs'].includes(ext)) {
            type = 'javascript';
          } else if (['.woff', '.woff2', '.ttf', '.otf', '.eot'].includes(ext)) {
            type = 'font';
          } else if (['.mp4', '.webm', '.ogv'].includes(ext)) {
            type = 'video';
          } else if (['.mp3', '.wav', '.ogg'].includes(ext)) {
            type = 'audio';
          } else {
            // Skip non-asset files
            continue;
          }

          const stats = await fs.stat(fullPath);
          const relativePath = path.relative(baseDir, fullPath).replace(/\\/g, '/');

          assets.push({
            url: `/${relativePath}`,
            type,
            size: stats.size,
            path: `/${relativePath}`,
            filename: entry.name,
          });
        }
      }
    };

    await findAssets(projectDir);

    console.log(`[UNUSED-ASSETS] Found ${htmlFiles.length} HTML files, ${cssFiles.length} CSS files, ${assets.length} assets`);

    // Run unused asset detection
    const report = await UnusedAssetDetectionService.detectUnusedAssets(
      htmlFiles,
      cssFiles,
      assets
    );

    console.log(`[UNUSED-ASSETS] Scan complete: ${report.unusedAssets} unused assets found, ${report.potentialSavingsFormatted} potential savings`);

    // Log to audit
    await logAuditEvent({
      userId: userId || 'system',
      action: 'assets.scan',
      resourceType: 'project',
      resourceId: projectId,
      details: {
        totalAssets: report.totalAssets,
        unusedAssets: report.unusedAssets,
        potentialSavings: report.potentialSavings,
        confidence: report.confidence,
      },
      durationMs: Date.now() - startTime,
      severity: 'info',
      category: 'analysis',
    });

    res.json({
      success: true,
      data: report,
    });
  } catch (error) {
    console.error('[UNUSED-ASSETS] Scan failed:', error);

    // Log failure to audit
    await logAuditEvent({
      userId: userId || 'system',
      action: 'assets.scan.failed',
      resourceType: 'project',
      resourceId: projectId,
      errorMessage: error instanceof Error ? error.message : 'Scan failed',
      durationMs: Date.now() - startTime,
      severity: 'error',
      category: 'analysis',
    });

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to scan assets',
    });
  }
});

/**
 * Remove unused assets from a project
 * POST /api/assets/remove/:projectId
 */
router.post('/remove/:projectId', async (req, res) => {
  const startTime = Date.now();
  const userId = (req as any).user?.id;
  const { projectId } = req.params;
  const { assets: assetUrls } = req.body;

  try {
    if (!assetUrls || !Array.isArray(assetUrls)) {
      return res.status(400).json({
        success: false,
        error: 'Assets array is required',
      });
    }

    console.log(`[UNUSED-ASSETS] Removing ${assetUrls.length} assets from project ${projectId}...`);

    // Get project directory
    const projectDir = path.join(process.cwd(), 'projects', projectId);

    // Check if project exists
    try {
      await fs.access(projectDir);
    } catch {
      return res.status(404).json({
        success: false,
        error: 'Project not found',
      });
    }

    const removedAssets: string[] = [];
    const failedAssets: Array<{ url: string; error: string }> = [];

    for (const assetUrl of assetUrls) {
      try {
        // Convert URL to file path
        const relativePath = assetUrl.startsWith('/') ? assetUrl.slice(1) : assetUrl;
        const filePath = path.join(projectDir, relativePath);

        // Ensure file is within project directory (security check)
        const normalizedPath = path.normalize(filePath);
        const normalizedProjectDir = path.normalize(projectDir);

        if (!normalizedPath.startsWith(normalizedProjectDir)) {
          failedAssets.push({
            url: assetUrl,
            error: 'Invalid path (outside project directory)',
          });
          continue;
        }

        // Check if file exists
        try {
          await fs.access(filePath);
        } catch {
          failedAssets.push({
            url: assetUrl,
            error: 'File not found',
          });
          continue;
        }

        // Remove the file
        await fs.unlink(filePath);
        removedAssets.push(assetUrl);

        console.log(`[UNUSED-ASSETS] Removed ${assetUrl}`);
      } catch (error) {
        console.error(`[UNUSED-ASSETS] Failed to remove ${assetUrl}:`, error);

        failedAssets.push({
          url: assetUrl,
          error: error instanceof Error ? error.message : 'Removal failed',
        });
      }
    }

    const successful = removedAssets.length;
    const failed = failedAssets.length;

    console.log(`[UNUSED-ASSETS] Removal complete: ${successful} succeeded, ${failed} failed`);

    // Log to audit
    await logAuditEvent({
      userId: userId || 'system',
      action: 'assets.remove',
      resourceType: 'project',
      resourceId: projectId,
      details: {
        totalRequested: assetUrls.length,
        successful,
        failed,
        removedAssets: removedAssets.slice(0, 50), // Limit to first 50 for audit log
      },
      durationMs: Date.now() - startTime,
      severity: failed > 0 ? 'warning' : 'info',
      category: 'modification',
    });

    res.json({
      success: true,
      removedAssets,
      failedAssets,
      summary: {
        total: assetUrls.length,
        successful,
        failed,
        durationMs: Date.now() - startTime,
      },
    });
  } catch (error) {
    console.error('[UNUSED-ASSETS] Removal process failed:', error);

    // Log failure to audit
    await logAuditEvent({
      userId: userId || 'system',
      action: 'assets.remove.failed',
      resourceType: 'project',
      resourceId: projectId,
      errorMessage: error instanceof Error ? error.message : 'Removal process failed',
      durationMs: Date.now() - startTime,
      severity: 'error',
      category: 'modification',
    });

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to remove assets',
    });
  }
});

/**
 * Get removal recommendations for assets
 * POST /api/assets/recommendations/:projectId
 */
router.post('/recommendations/:projectId', async (req, res) => {
  const { projectId } = req.params;
  const { report } = req.body;

  try {
    if (!report || !report.unusedList) {
      return res.status(400).json({
        success: false,
        error: 'Unused assets report is required',
      });
    }

    console.log(`[UNUSED-ASSETS] Generating recommendations for project ${projectId}...`);

    const recommendations = UnusedAssetDetectionService.getRemovalRecommendations(report);

    res.json({
      success: true,
      recommendations: {
        safe: recommendations.safe.map(a => ({
          url: a.asset.url,
          size: a.asset.size,
          confidence: a.confidence,
        })),
        review: recommendations.review.map(a => ({
          url: a.asset.url,
          size: a.asset.size,
          confidence: a.confidence,
        })),
        risky: recommendations.risky.map(a => ({
          url: a.asset.url,
          size: a.asset.size,
          confidence: a.confidence,
        })),
      },
      summary: {
        safe: recommendations.safe.length,
        review: recommendations.review.length,
        risky: recommendations.risky.length,
        safeSavings: recommendations.safe.reduce((sum, a) => sum + a.asset.size, 0),
      },
    });
  } catch (error) {
    console.error('[UNUSED-ASSETS] Recommendations failed:', error);

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate recommendations',
    });
  }
});

export default router;
