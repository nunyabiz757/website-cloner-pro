import express from 'express';
import ExportPackageService from '../services/ExportPackageService.js';
import fs from 'fs';
import path from 'path';
import archiver from 'archiver';

const router = express.Router();

/**
 * Get standard export structure
 * GET /api/export-package/structure
 */
router.get('/structure', (req, res) => {
  try {
    const structure = ExportPackageService.getStandardStructure();

    res.json({
      success: true,
      structure,
    });
  } catch (error) {
    console.error('Failed to get export structure:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get structure',
    });
  }
});

/**
 * Create export package
 * POST /api/export-package/create
 */
router.post('/create', async (req, res) => {
  try {
    const {
      exportType,
      projectName,
      sourceUrl,
      platform,
      builder,
      files,
      performanceReport,
      budgetValidation,
      verificationResults,
      metadata = {},
    } = req.body;

    if (!exportType || !projectName) {
      return res.status(400).json({
        success: false,
        error: 'Export type and project name are required',
      });
    }

    const packageData = await ExportPackageService.createPackage(exportType, {
      projectName,
      sourceUrl,
      platform,
      builder,
      files,
      performanceReport,
      budgetValidation,
      verificationResults,
      metadata,
    });

    res.json({
      success: true,
      package: packageData,
    });
  } catch (error) {
    console.error('Failed to create export package:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create package',
    });
  }
});

/**
 * Generate README for package
 * POST /api/export-package/readme
 */
router.post('/readme', (req, res) => {
  try {
    const { packageData } = req.body;

    if (!packageData) {
      return res.status(400).json({
        success: false,
        error: 'Package data is required',
      });
    }

    const readme = ExportPackageService.generateReadme(packageData);

    res.json({
      success: true,
      readme,
    });
  } catch (error) {
    console.error('Failed to generate README:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate README',
    });
  }
});

/**
 * Generate metadata for package
 * POST /api/export-package/metadata
 */
router.post('/metadata', (req, res) => {
  try {
    const { packageData } = req.body;

    if (!packageData) {
      return res.status(400).json({
        success: false,
        error: 'Package data is required',
      });
    }

    const metadata = ExportPackageService.generateMetadata(packageData);

    res.json({
      success: true,
      metadata: JSON.parse(metadata),
      metadataString: metadata,
    });
  } catch (error) {
    console.error('Failed to generate metadata:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate metadata',
    });
  }
});

/**
 * Generate file tree for package
 * POST /api/export-package/file-tree
 */
router.post('/file-tree', (req, res) => {
  try {
    const { packageData } = req.body;

    if (!packageData) {
      return res.status(400).json({
        success: false,
        error: 'Package data is required',
      });
    }

    const fileTree = ExportPackageService.generateFileTree(packageData);

    res.json({
      success: true,
      fileTree,
    });
  } catch (error) {
    console.error('Failed to generate file tree:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate file tree',
    });
  }
});

/**
 * Validate package structure
 * POST /api/export-package/validate
 */
router.post('/validate', async (req, res) => {
  try {
    const { packagePath } = req.body;

    if (!packagePath) {
      return res.status(400).json({
        success: false,
        error: 'Package path is required',
      });
    }

    const validation = await ExportPackageService.validatePackage(packagePath);

    res.json({
      success: true,
      validation,
    });
  } catch (error) {
    console.error('Failed to validate package:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to validate package',
    });
  }
});

/**
 * Finalize and zip package
 * POST /api/export-package/finalize
 */
router.post('/finalize', async (req, res) => {
  try {
    const { packageData } = req.body;

    if (!packageData) {
      return res.status(400).json({
        success: false,
        error: 'Package data is required',
      });
    }

    const zipPath = await ExportPackageService.finalizePackage(packageData);

    res.json({
      success: true,
      zipPath,
      message: 'Package finalized successfully',
    });
  } catch (error) {
    console.error('Failed to finalize package:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to finalize package',
    });
  }
});

/**
 * Download finalized package
 * GET /api/export-package/download/:packageId
 */
router.get('/download/:packageId', async (req, res) => {
  try {
    const { packageId } = req.params;

    // Construct path to the zipped package
    const zipPath = path.join(process.cwd(), 'exports', `${packageId}.zip`);

    if (!fs.existsSync(zipPath)) {
      return res.status(404).json({
        success: false,
        error: 'Package not found',
      });
    }

    // Set headers for download
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${packageId}.zip"`);

    // Stream the file
    const fileStream = fs.createReadStream(zipPath);
    fileStream.pipe(res);

    fileStream.on('error', (error) => {
      console.error('Error streaming package:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to download package',
      });
    });
  } catch (error) {
    console.error('Failed to download package:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to download package',
    });
  }
});

/**
 * Get package info
 * GET /api/export-package/info/:packageId
 */
router.get('/info/:packageId', async (req, res) => {
  try {
    const { packageId } = req.params;

    const packageDir = path.join(process.cwd(), 'exports', packageId);
    const metadataPath = path.join(packageDir, 'metadata.json');

    if (!fs.existsSync(metadataPath)) {
      return res.status(404).json({
        success: false,
        error: 'Package metadata not found',
      });
    }

    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));

    // Check if zip exists
    const zipPath = path.join(process.cwd(), 'exports', `${packageId}.zip`);
    const isFinalized = fs.existsSync(zipPath);

    // Get file size
    let zipSize = 0;
    if (isFinalized) {
      const stats = fs.statSync(zipPath);
      zipSize = stats.size;
    }

    res.json({
      success: true,
      packageInfo: {
        packageId,
        metadata,
        isFinalized,
        zipSize,
        zipPath: isFinalized ? zipPath : null,
      },
    });
  } catch (error) {
    console.error('Failed to get package info:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get package info',
    });
  }
});

/**
 * List all packages
 * GET /api/export-package/list
 */
router.get('/list', async (req, res) => {
  try {
    const exportsDir = path.join(process.cwd(), 'exports');

    if (!fs.existsSync(exportsDir)) {
      return res.json({
        success: true,
        packages: [],
      });
    }

    const entries = fs.readdirSync(exportsDir, { withFileTypes: true });
    const packages = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const metadataPath = path.join(exportsDir, entry.name, 'metadata.json');

        if (fs.existsSync(metadataPath)) {
          const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
          const zipPath = path.join(exportsDir, `${entry.name}.zip`);
          const isFinalized = fs.existsSync(zipPath);

          packages.push({
            packageId: entry.name,
            metadata,
            isFinalized,
            createdAt: metadata.exportDate,
          });
        }
      }
    }

    // Sort by creation date (newest first)
    packages.sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    res.json({
      success: true,
      packages,
      total: packages.length,
    });
  } catch (error) {
    console.error('Failed to list packages:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list packages',
    });
  }
});

/**
 * Delete package
 * DELETE /api/export-package/:packageId
 */
router.delete('/:packageId', async (req, res) => {
  try {
    const { packageId } = req.params;

    const packageDir = path.join(process.cwd(), 'exports', packageId);
    const zipPath = path.join(process.cwd(), 'exports', `${packageId}.zip`);

    let deleted = false;

    // Delete directory
    if (fs.existsSync(packageDir)) {
      fs.rmSync(packageDir, { recursive: true, force: true });
      deleted = true;
    }

    // Delete zip
    if (fs.existsSync(zipPath)) {
      fs.unlinkSync(zipPath);
      deleted = true;
    }

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Package not found',
      });
    }

    res.json({
      success: true,
      message: 'Package deleted successfully',
    });
  } catch (error) {
    console.error('Failed to delete package:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete package',
    });
  }
});

/**
 * Add file to existing package
 * POST /api/export-package/:packageId/add-file
 */
router.post('/:packageId/add-file', async (req, res) => {
  try {
    const { packageId } = req.params;
    const { filePath, content, relativePath } = req.body;

    if (!relativePath || !content) {
      return res.status(400).json({
        success: false,
        error: 'Relative path and content are required',
      });
    }

    const packageDir = path.join(process.cwd(), 'exports', packageId);

    if (!fs.existsSync(packageDir)) {
      return res.status(404).json({
        success: false,
        error: 'Package not found',
      });
    }

    const fullPath = path.join(packageDir, relativePath);
    const fileDir = path.dirname(fullPath);

    // Create directory if needed
    if (!fs.existsSync(fileDir)) {
      fs.mkdirSync(fileDir, { recursive: true });
    }

    // Write file
    fs.writeFileSync(fullPath, content);

    res.json({
      success: true,
      message: 'File added successfully',
      path: fullPath,
    });
  } catch (error) {
    console.error('Failed to add file to package:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to add file',
    });
  }
});

/**
 * Get package statistics
 * GET /api/export-package/stats
 */
router.get('/stats', async (req, res) => {
  try {
    const exportsDir = path.join(process.cwd(), 'exports');

    if (!fs.existsSync(exportsDir)) {
      return res.json({
        success: true,
        stats: {
          totalPackages: 0,
          totalSize: 0,
          byExportType: {},
          byPlatform: {},
        },
      });
    }

    const entries = fs.readdirSync(exportsDir, { withFileTypes: true });
    let totalPackages = 0;
    let totalSize = 0;
    const byExportType: Record<string, number> = {};
    const byPlatform: Record<string, number> = {};

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const metadataPath = path.join(exportsDir, entry.name, 'metadata.json');

        if (fs.existsSync(metadataPath)) {
          totalPackages++;
          const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));

          // Count by export type
          const exportType = metadata.exportType || 'unknown';
          byExportType[exportType] = (byExportType[exportType] || 0) + 1;

          // Count by platform
          const platform = metadata.platform || 'unknown';
          byPlatform[platform] = (byPlatform[platform] || 0) + 1;
        }
      } else if (entry.name.endsWith('.zip')) {
        const zipPath = path.join(exportsDir, entry.name);
        const stats = fs.statSync(zipPath);
        totalSize += stats.size;
      }
    }

    res.json({
      success: true,
      stats: {
        totalPackages,
        totalSize,
        totalSizeFormatted: formatBytes(totalSize),
        byExportType,
        byPlatform,
      },
    });
  } catch (error) {
    console.error('Failed to get package stats:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get stats',
    });
  }
});

// Helper function to format bytes
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default router;
