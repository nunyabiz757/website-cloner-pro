import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import { WordPressExportService } from '../services/WordPressExportService.js';

const router = express.Router();
const exportService = new WordPressExportService();

// Store active exports in memory (in production, use Redis or database)
const activeExports = new Map<
  string,
  {
    status: 'generating' | 'completed' | 'failed';
    result?: any;
    error?: string;
    progress?: number;
  }
>();

/**
 * Generate WordPress export
 * POST /api/wordpress-export/generate
 */
router.post('/generate', async (req, res) => {
  try {
    const {
      cloneId,
      targetBuilder,
      themeName,
      themeAuthor,
      themeDescription,
      preserveStructure,
      generateShortcodes,
    } = req.body;

    // Validate required fields
    if (!cloneId) {
      return res.status(400).json({
        success: false,
        error: 'Clone ID is required',
      });
    }

    if (!targetBuilder) {
      return res.status(400).json({
        success: false,
        error: 'Target builder is required',
      });
    }

    const validBuilders = [
      'plugin-free',
      'elementor',
      'divi',
      'beaver-builder',
      'kadence',
      'optimizepress',
      'brizy',
      'generateblocks',
      'crocoblock',
    ];
    if (!validBuilders.includes(targetBuilder)) {
      return res.status(400).json({
        success: false,
        error: `Invalid target builder. Must be one of: ${validBuilders.join(', ')}`,
      });
    }

    // Check if clone exists
    const clonePath = path.join(process.cwd(), 'temp', cloneId);
    try {
      await fs.access(clonePath);
    } catch {
      return res.status(404).json({
        success: false,
        error: 'Clone not found',
      });
    }

    // Generate export ID
    const exportId = `wp_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    // Start export generation in background
    activeExports.set(exportId, { status: 'generating', progress: 0 });

    // Generate export asynchronously
    (async () => {
      try {
        // Find HTML files in clone directory
        const htmlFiles = await findHtmlFiles(clonePath);
        if (htmlFiles.length === 0) {
          throw new Error('No HTML files found in clone');
        }

        // Read HTML content
        const htmlContent = await fs.readFile(htmlFiles[0], 'utf-8');

        // Find CSS and JS files
        const cssFiles = await findFilesByExtension(clonePath, '.css');
        const jsFiles = await findFilesByExtension(clonePath, '.js');

        // Read CSS and JS content
        const cssContent = await Promise.all(
          cssFiles.map(async (file) => ({
            path: path.relative(clonePath, file),
            content: await fs.readFile(file, 'utf-8'),
          }))
        );

        const jsContent = await Promise.all(
          jsFiles.map(async (file) => ({
            path: path.relative(clonePath, file),
            content: await fs.readFile(file, 'utf-8'),
          }))
        );

        // Generate WordPress export
        activeExports.set(exportId, { status: 'generating', progress: 50 });

        const result = await exportService.generateWordPressExport({
          exportId,
          targetBuilder,
          htmlContent,
          cssFiles: cssContent,
          jsFiles: jsContent,
          themeName: themeName || 'Custom Cloned Theme',
          themeAuthor: themeAuthor || 'Website Cloner Pro',
          themeDescription: themeDescription || 'Generated from cloned website',
          preserveStructure: preserveStructure !== false,
          generateShortcodes: generateShortcodes !== false,
        });

        activeExports.set(exportId, {
          status: 'completed',
          result,
          progress: 100,
        });
      } catch (error) {
        console.error('WordPress export generation failed:', error);
        activeExports.set(exportId, {
          status: 'failed',
          error: error instanceof Error ? error.message : 'Export generation failed',
          progress: 0,
        });
      }
    })();

    res.json({
      success: true,
      exportId,
      message: 'WordPress export generation started',
    });
  } catch (error) {
    console.error('WordPress export initiation failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to start export generation',
    });
  }
});

/**
 * Get WordPress export status
 * GET /api/wordpress-export/status/:exportId
 */
router.get('/status/:exportId', async (req, res) => {
  try {
    const { exportId } = req.params;

    const exportData = activeExports.get(exportId);
    if (!exportData) {
      return res.status(404).json({
        success: false,
        error: 'Export not found',
      });
    }

    res.json({
      success: true,
      exportId,
      status: exportData.status,
      progress: exportData.progress,
      result: exportData.result,
      error: exportData.error,
    });
  } catch (error) {
    console.error('Failed to get export status:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get export status',
    });
  }
});

/**
 * Download WordPress export ZIP
 * GET /api/wordpress-export/download/:exportId
 */
router.get('/download/:exportId', async (req, res) => {
  try {
    const { exportId } = req.params;

    const exportData = activeExports.get(exportId);
    if (!exportData) {
      return res.status(404).json({
        success: false,
        error: 'Export not found',
      });
    }

    if (exportData.status !== 'completed') {
      return res.status(400).json({
        success: false,
        error: `Export is ${exportData.status}`,
      });
    }

    const zipPath = exportData.result?.zipPath;
    if (!zipPath) {
      return res.status(404).json({
        success: false,
        error: 'Export ZIP file not found',
      });
    }

    // Check if file exists
    try {
      await fs.access(zipPath);
    } catch {
      return res.status(404).json({
        success: false,
        error: 'Export ZIP file not found on disk',
      });
    }

    // Set headers for download
    const filename = path.basename(zipPath);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Stream file to response
    const fileStream = (await import('fs')).createReadStream(zipPath);
    fileStream.pipe(res);

    fileStream.on('error', (error) => {
      console.error('Error streaming file:', error);
      if (!res.headersSent) {
        res.status(500).json({
          success: false,
          error: 'Failed to download export',
        });
      }
    });
  } catch (error) {
    console.error('Failed to download export:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to download export',
    });
  }
});

/**
 * Get list of available exports
 * GET /api/wordpress-export/list
 */
router.get('/list', async (req, res) => {
  try {
    const exports = Array.from(activeExports.entries()).map(([exportId, data]) => ({
      exportId,
      status: data.status,
      progress: data.progress,
      builderType: data.result?.builderType,
      fileCount: data.result?.fileCount,
      totalSize: data.result?.totalSize,
      createdAt: data.result?.createdAt,
    }));

    res.json({
      success: true,
      exports,
      total: exports.length,
    });
  } catch (error) {
    console.error('Failed to list exports:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list exports',
    });
  }
});

/**
 * Get export result details
 * GET /api/wordpress-export/result/:exportId
 */
router.get('/result/:exportId', async (req, res) => {
  try {
    const { exportId } = req.params;

    const exportData = activeExports.get(exportId);
    if (!exportData) {
      return res.status(404).json({
        success: false,
        error: 'Export not found',
      });
    }

    if (exportData.status !== 'completed') {
      return res.status(400).json({
        success: false,
        error: `Export is ${exportData.status}`,
      });
    }

    res.json({
      success: true,
      exportId,
      result: exportData.result,
    });
  } catch (error) {
    console.error('Failed to get export result:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get export result',
    });
  }
});

/**
 * Delete WordPress export
 * DELETE /api/wordpress-export/:exportId
 */
router.delete('/:exportId', async (req, res) => {
  try {
    const { exportId } = req.params;

    const exportData = activeExports.get(exportId);
    if (!exportData) {
      return res.status(404).json({
        success: false,
        error: 'Export not found',
      });
    }

    // Delete export files if they exist
    if (exportData.result?.exportPath) {
      try {
        await fs.rm(exportData.result.exportPath, { recursive: true, force: true });
      } catch (error) {
        console.error('Failed to delete export files:', error);
      }
    }

    if (exportData.result?.zipPath) {
      try {
        await fs.unlink(exportData.result.zipPath);
      } catch (error) {
        console.error('Failed to delete ZIP file:', error);
      }
    }

    // Remove from active exports
    activeExports.delete(exportId);

    res.json({
      success: true,
      message: 'Export deleted successfully',
    });
  } catch (error) {
    console.error('Failed to delete export:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete export',
    });
  }
});

/**
 * Cleanup old exports
 * POST /api/wordpress-export/cleanup
 */
router.post('/cleanup', async (req, res) => {
  try {
    const { olderThanHours = 24 } = req.body;
    const cutoffTime = Date.now() - olderThanHours * 60 * 60 * 1000;

    let cleanedCount = 0;

    for (const [exportId, data] of activeExports.entries()) {
      if (data.result?.createdAt && new Date(data.result.createdAt).getTime() < cutoffTime) {
        // Delete export files
        if (data.result?.exportPath) {
          try {
            await fs.rm(data.result.exportPath, { recursive: true, force: true });
          } catch (error) {
            console.error('Failed to delete export files:', error);
          }
        }

        if (data.result?.zipPath) {
          try {
            await fs.unlink(data.result.zipPath);
          } catch (error) {
            console.error('Failed to delete ZIP file:', error);
          }
        }

        activeExports.delete(exportId);
        cleanedCount++;
      }
    }

    res.json({
      success: true,
      message: `Cleaned up ${cleanedCount} old exports`,
      cleanedCount,
    });
  } catch (error) {
    console.error('Failed to cleanup exports:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to cleanup exports',
    });
  }
});

// Helper functions

/**
 * Find all HTML files in directory recursively
 */
async function findHtmlFiles(dirPath: string): Promise<string[]> {
  const htmlFiles: string[] = [];

  async function scan(currentPath: string) {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);

      if (entry.isDirectory()) {
        await scan(fullPath);
      } else if (entry.isFile() && /\.html?$/i.test(entry.name)) {
        htmlFiles.push(fullPath);
      }
    }
  }

  await scan(dirPath);
  return htmlFiles;
}

/**
 * Find all files with specific extension recursively
 */
async function findFilesByExtension(dirPath: string, extension: string): Promise<string[]> {
  const files: string[] = [];

  async function scan(currentPath: string) {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);

      if (entry.isDirectory()) {
        await scan(fullPath);
      } else if (entry.isFile() && path.extname(entry.name).toLowerCase() === extension) {
        files.push(fullPath);
      }
    }
  }

  await scan(dirPath);
  return files;
}

export default router;
