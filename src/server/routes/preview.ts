import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import { TemporaryHostingService } from '../services/TemporaryHostingService.js';
import { RealTimePreviewService } from '../services/RealTimePreviewService.js';
import { DeviceSimulatorService } from '../services/DeviceSimulatorService.js';
import { BeforeAfterComparisonService } from '../services/BeforeAfterComparisonService.js';

const router = express.Router();

// Initialize services
const hostingService = new TemporaryHostingService();
const previewService = new RealTimePreviewService();
const deviceSimulator = new DeviceSimulatorService();
const comparisonService = new BeforeAfterComparisonService();

/**
 * Host a cloned site temporarily
 * POST /api/preview/host
 */
router.post('/host', async (req, res) => {
  try {
    const { cloneId, htmlContent, assets, options } = req.body;

    if (!cloneId || !htmlContent) {
      return res.status(400).json({
        success: false,
        error: 'Clone ID and HTML content are required',
      });
    }

    // Convert base64 assets to Buffer
    const assetBuffers = (assets || []).map((asset: any) => ({
      path: asset.path,
      content: Buffer.from(asset.content, 'base64'),
    }));

    const hostedSite = await hostingService.hostSite(
      cloneId,
      htmlContent,
      assetBuffers,
      options
    );

    res.json({
      success: true,
      site: hostedSite,
    });
  } catch (error) {
    console.error('Failed to host site:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to host site',
    });
  }
});

/**
 * Get hosted site information
 * GET /api/preview/hosted/:previewId
 */
router.get('/hosted/:previewId', async (req, res) => {
  try {
    const { previewId } = req.params;
    const site = await hostingService.getHostedSite(previewId);

    if (!site) {
      return res.status(404).json({
        success: false,
        error: 'Site not found',
      });
    }

    res.json({
      success: true,
      site,
    });
  } catch (error) {
    console.error('Failed to get hosted site:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get hosted site',
    });
  }
});

/**
 * List all hosted sites
 * GET /api/preview/hosted
 */
router.get('/hosted', async (req, res) => {
  try {
    const sites = await hostingService.listHostedSites();

    res.json({
      success: true,
      sites,
      count: sites.length,
    });
  } catch (error) {
    console.error('Failed to list hosted sites:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list hosted sites',
    });
  }
});

/**
 * Delete hosted site
 * DELETE /api/preview/hosted/:previewId
 */
router.delete('/hosted/:previewId', async (req, res) => {
  try {
    const { previewId } = req.params;
    const deleted = await hostingService.deleteHostedSite(previewId);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Site not found',
      });
    }

    res.json({
      success: true,
      message: 'Site deleted successfully',
    });
  } catch (error) {
    console.error('Failed to delete hosted site:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete hosted site',
    });
  }
});

/**
 * Extend hosting period
 * POST /api/preview/hosted/:previewId/extend
 */
router.post('/hosted/:previewId/extend', async (req, res) => {
  try {
    const { previewId } = req.params;
    const { additionalHours } = req.body;

    if (!additionalHours) {
      return res.status(400).json({
        success: false,
        error: 'Additional hours is required',
      });
    }

    const site = await hostingService.extendHosting(previewId, additionalHours);

    if (!site) {
      return res.status(404).json({
        success: false,
        error: 'Site not found or cannot extend beyond maximum TTL',
      });
    }

    res.json({
      success: true,
      site,
    });
  } catch (error) {
    console.error('Failed to extend hosting:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to extend hosting',
    });
  }
});

/**
 * Create shareable link
 * POST /api/preview/hosted/:previewId/share
 */
router.post('/hosted/:previewId/share', async (req, res) => {
  try {
    const { previewId } = req.params;
    const { password } = req.body;

    const shareInfo = await hostingService.createShareableLink(previewId, password);

    res.json({
      success: true,
      ...shareInfo,
    });
  } catch (error) {
    console.error('Failed to create shareable link:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create shareable link',
    });
  }
});

/**
 * Download hosted site as ZIP
 * GET /api/preview/hosted/:previewId/download
 */
router.get('/hosted/:previewId/download', async (req, res) => {
  try {
    const { previewId } = req.params;
    const zipPath = await hostingService.createDownloadArchive(previewId);

    res.download(zipPath, `preview-${previewId}.zip`, async (err) => {
      if (err) {
        console.error('Download error:', err);
      }
      // Clean up ZIP file after download
      try {
        await fs.unlink(zipPath);
      } catch {}
    });
  } catch (error) {
    console.error('Failed to create download:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create download',
    });
  }
});

/**
 * Get capacity information
 * GET /api/preview/capacity
 */
router.get('/capacity', async (req, res) => {
  try {
    const capacity = hostingService.getCapacityInfo();

    res.json({
      success: true,
      capacity,
    });
  } catch (error) {
    console.error('Failed to get capacity:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get capacity',
    });
  }
});

/**
 * Create real-time preview session
 * POST /api/preview/realtime/session
 */
router.post('/realtime/session', async (req, res) => {
  try {
    const { cloneId, filePath } = req.body;

    if (!cloneId || !filePath) {
      return res.status(400).json({
        success: false,
        error: 'Clone ID and file path are required',
      });
    }

    const sessionId = await previewService.createSession(cloneId, filePath);

    res.json({
      success: true,
      sessionId,
      wsUrl: `/ws?session=${sessionId}`,
    });
  } catch (error) {
    console.error('Failed to create preview session:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create preview session',
    });
  }
});

/**
 * Get preview session info
 * GET /api/preview/realtime/session/:sessionId
 */
router.get('/realtime/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const session = previewService.getSession(sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found',
      });
    }

    res.json({
      success: true,
      session: {
        id: session.id,
        cloneId: session.cloneId,
        clientCount: session.clients.size,
        lastUpdate: session.lastUpdate,
      },
    });
  } catch (error) {
    console.error('Failed to get session:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get session',
    });
  }
});

/**
 * List all preview sessions
 * GET /api/preview/realtime/sessions
 */
router.get('/realtime/sessions', async (req, res) => {
  try {
    const sessions = previewService.listSessions();

    res.json({
      success: true,
      sessions,
      count: sessions.length,
    });
  } catch (error) {
    console.error('Failed to list sessions:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list sessions',
    });
  }
});

/**
 * Close preview session
 * DELETE /api/preview/realtime/session/:sessionId
 */
router.delete('/realtime/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const closed = await previewService.closeSession(sessionId);

    if (!closed) {
      return res.status(404).json({
        success: false,
        error: 'Session not found',
      });
    }

    res.json({
      success: true,
      message: 'Session closed successfully',
    });
  } catch (error) {
    console.error('Failed to close session:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to close session',
    });
  }
});

/**
 * Get device profiles
 * GET /api/preview/devices
 */
router.get('/devices', async (req, res) => {
  try {
    const { category } = req.query;

    let devices;
    if (category) {
      devices = deviceSimulator.getDevicesByCategory(category as any);
    } else {
      devices = deviceSimulator.getDeviceProfiles();
    }

    res.json({
      success: true,
      devices,
      count: devices.length,
    });
  } catch (error) {
    console.error('Failed to get devices:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get devices',
    });
  }
});

/**
 * Simulate device
 * POST /api/preview/simulate
 */
router.post('/simulate', async (req, res) => {
  try {
    const { url, deviceName, options } = req.body;

    if (!url || !deviceName) {
      return res.status(400).json({
        success: false,
        error: 'URL and device name are required',
      });
    }

    const result = await deviceSimulator.simulateDevice(url, deviceName, options);

    res.json({
      success: true,
      result,
    });
  } catch (error) {
    console.error('Failed to simulate device:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to simulate device',
    });
  }
});

/**
 * Simulate multiple devices
 * POST /api/preview/simulate-multiple
 */
router.post('/simulate-multiple', async (req, res) => {
  try {
    const { url, deviceNames, options } = req.body;

    if (!url || !deviceNames || !Array.isArray(deviceNames)) {
      return res.status(400).json({
        success: false,
        error: 'URL and device names array are required',
      });
    }

    const results = await deviceSimulator.simulateMultipleDevices(
      url,
      deviceNames,
      options
    );

    res.json({
      success: true,
      results,
      count: results.length,
    });
  } catch (error) {
    console.error('Failed to simulate multiple devices:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to simulate multiple devices',
    });
  }
});

/**
 * Simulate device rotation
 * POST /api/preview/simulate-rotation
 */
router.post('/simulate-rotation', async (req, res) => {
  try {
    const { url, deviceName } = req.body;

    if (!url || !deviceName) {
      return res.status(400).json({
        success: false,
        error: 'URL and device name are required',
      });
    }

    const result = await deviceSimulator.simulateRotation(url, deviceName);

    res.json({
      success: true,
      result,
    });
  } catch (error) {
    console.error('Failed to simulate rotation:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to simulate rotation',
    });
  }
});

/**
 * Compare original vs cloned
 * POST /api/preview/compare
 */
router.post('/compare', async (req, res) => {
  try {
    const { originalUrl, clonedUrl, options } = req.body;

    if (!originalUrl || !clonedUrl) {
      return res.status(400).json({
        success: false,
        error: 'Original URL and cloned URL are required',
      });
    }

    const result = await comparisonService.compare(originalUrl, clonedUrl, options);

    res.json({
      success: true,
      result,
    });
  } catch (error) {
    console.error('Failed to compare:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to compare',
    });
  }
});

/**
 * Compare across multiple viewports
 * POST /api/preview/compare-viewports
 */
router.post('/compare-viewports', async (req, res) => {
  try {
    const { originalUrl, clonedUrl, viewports } = req.body;

    if (!originalUrl || !clonedUrl) {
      return res.status(400).json({
        success: false,
        error: 'Original URL and cloned URL are required',
      });
    }

    const defaultViewports = [
      { width: 375, height: 667, name: 'Mobile' },
      { width: 768, height: 1024, name: 'Tablet' },
      { width: 1920, height: 1080, name: 'Desktop' },
    ];

    const result = await comparisonService.compareMultipleViewports(
      originalUrl,
      clonedUrl,
      viewports || defaultViewports
    );

    res.json({
      success: true,
      results: result,
      count: result.length,
    });
  } catch (error) {
    console.error('Failed to compare viewports:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to compare viewports',
    });
  }
});

/**
 * Generate comparison report
 * POST /api/preview/compare/report
 */
router.post('/compare/report', async (req, res) => {
  try {
    const { originalUrl, clonedUrl, options } = req.body;

    if (!originalUrl || !clonedUrl) {
      return res.status(400).json({
        success: false,
        error: 'Original URL and cloned URL are required',
      });
    }

    const comparison = await comparisonService.compare(originalUrl, clonedUrl, options);
    const report = comparisonService.generateReport(comparison);

    res.json({
      success: true,
      report,
      comparison,
    });
  } catch (error) {
    console.error('Failed to generate report:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate report',
    });
  }
});

export default router;

// Export preview router for serving hosted sites
export const previewRouter = hostingService.getPreviewRouter();
