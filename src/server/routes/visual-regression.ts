import { Router } from 'express';
import { VisualRegressionService, type ComparisonResult, type VisualTest } from '../services/VisualRegressionService.js';
import path from 'path';

const router = Router();
const visualService = new VisualRegressionService();

// In-memory storage (replace with database in production)
const visualTests = new Map<string, VisualTest>();

/**
 * Run visual regression test
 * POST /api/visual-regression/test
 */
router.post('/test', async (req, res) => {
  try {
    const { originalUrl, optimizedUrl, viewports, threshold, testName } = req.body;

    if (!originalUrl || !optimizedUrl) {
      return res.status(400).json({
        success: false,
        error: 'originalUrl and optimizedUrl are required',
      });
    }

    // Create test record
    const testId = Date.now().toString();
    const test: VisualTest = {
      id: testId,
      name: testName || `Visual Test ${new Date().toLocaleString()}`,
      viewports: viewports || [
        { width: 1920, height: 1080, name: 'Desktop' },
        { width: 768, height: 1024, name: 'Tablet' },
        { width: 375, height: 667, name: 'Mobile' },
      ],
      threshold: threshold || 5,
      results: [],
      status: 'running',
      createdAt: new Date().toISOString(),
    };

    visualTests.set(testId, test);

    // Run test asynchronously
    runTestAsync(testId, originalUrl, optimizedUrl, test.viewports, test.threshold);

    res.json({
      success: true,
      data: {
        testId,
        status: 'running',
        message: 'Visual regression test started',
      },
    });
  } catch (error) {
    console.error('Error starting visual test:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to start visual test',
    });
  }
});

/**
 * Get visual test status and results
 * GET /api/visual-regression/test/:testId
 */
router.get('/test/:testId', (req, res) => {
  try {
    const { testId } = req.params;
    const test = visualTests.get(testId);

    if (!test) {
      return res.status(404).json({
        success: false,
        error: 'Test not found',
      });
    }

    res.json({
      success: true,
      data: test,
    });
  } catch (error) {
    console.error('Error getting test:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get test',
    });
  }
});

/**
 * Get all visual tests
 * GET /api/visual-regression/tests
 */
router.get('/tests', (req, res) => {
  try {
    const tests = Array.from(visualTests.values());
    res.json({
      success: true,
      data: tests,
    });
  } catch (error) {
    console.error('Error getting tests:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get tests',
    });
  }
});

/**
 * Get screenshot image
 * GET /api/visual-regression/screenshot/:filename
 */
router.get('/screenshot/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    const screenshotsDir = path.join(process.cwd(), 'temp', 'screenshots');
    const filepath = path.join(screenshotsDir, filename);

    res.sendFile(filepath);
  } catch (error) {
    console.error('Error getting screenshot:', error);
    res.status(404).json({
      success: false,
      error: 'Screenshot not found',
    });
  }
});

/**
 * Compare specific elements
 * POST /api/visual-regression/compare-elements
 */
router.post('/compare-elements', async (req, res) => {
  try {
    const { originalUrl, optimizedUrl, selectors, viewport } = req.body;

    if (!originalUrl || !optimizedUrl || !selectors) {
      return res.status(400).json({
        success: false,
        error: 'originalUrl, optimizedUrl, and selectors are required',
      });
    }

    const results = await visualService.compareElements(
      originalUrl,
      optimizedUrl,
      selectors,
      viewport
    );

    res.json({
      success: true,
      data: results,
    });
  } catch (error) {
    console.error('Error comparing elements:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to compare elements',
    });
  }
});

/**
 * Capture single screenshot
 * POST /api/visual-regression/capture
 */
router.post('/capture', async (req, res) => {
  try {
    const { url, viewport, fullPage, delay, selector } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'url is required',
      });
    }

    const screenshotPath = await visualService.captureScreenshot({
      url,
      viewport,
      fullPage,
      delay,
      selector,
    });

    const filename = path.basename(screenshotPath);

    res.json({
      success: true,
      data: {
        filename,
        url: `/api/visual-regression/screenshot/${filename}`,
      },
    });
  } catch (error) {
    console.error('Error capturing screenshot:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to capture screenshot',
    });
  }
});

/**
 * Delete visual test
 * DELETE /api/visual-regression/test/:testId
 */
router.delete('/test/:testId', (req, res) => {
  try {
    const { testId } = req.params;
    const deleted = visualTests.delete(testId);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Test not found',
      });
    }

    res.json({
      success: true,
      message: 'Test deleted',
    });
  } catch (error) {
    console.error('Error deleting test:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete test',
    });
  }
});

/**
 * Cleanup old screenshots
 * POST /api/visual-regression/cleanup
 */
router.post('/cleanup', async (req, res) => {
  try {
    const { olderThanDays } = req.body;
    const deletedCount = await visualService.cleanupScreenshots(olderThanDays || 7);

    res.json({
      success: true,
      data: {
        deletedCount,
        message: `Deleted ${deletedCount} old screenshot(s)`,
      },
    });
  } catch (error) {
    console.error('Error cleaning up screenshots:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cleanup screenshots',
    });
  }
});

/**
 * Generate test report
 * GET /api/visual-regression/test/:testId/report
 */
router.get('/test/:testId/report', async (req, res) => {
  try {
    const { testId } = req.params;
    const test = visualTests.get(testId);

    if (!test) {
      return res.status(404).json({
        success: false,
        error: 'Test not found',
      });
    }

    if (test.status !== 'completed') {
      return res.status(400).json({
        success: false,
        error: 'Test is not yet completed',
      });
    }

    const report = await visualService.generateReport(test.results);

    res.json({
      success: true,
      data: {
        report,
        summary: {
          total: test.results.length,
          passed: test.results.filter((r) => r.passed).length,
          failed: test.results.filter((r) => !r.passed).length,
          avgDifference:
            test.results.reduce((sum, r) => sum + r.diffPercentage, 0) / test.results.length,
        },
      },
    });
  } catch (error) {
    console.error('Error generating report:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate report',
    });
  }
});

/**
 * Helper function to run test asynchronously
 */
async function runTestAsync(
  testId: string,
  originalUrl: string,
  optimizedUrl: string,
  viewports: Array<{ width: number; height: number; name: string }>,
  threshold: number
) {
  const test = visualTests.get(testId);
  if (!test) return;

  try {
    const results = await visualService.runVisualTest(originalUrl, optimizedUrl, viewports, threshold);

    test.results = results;
    test.status = 'completed';
    test.completedAt = new Date().toISOString();
    visualTests.set(testId, test);
  } catch (error) {
    console.error('Visual test failed:', error);
    test.status = 'failed';
    test.completedAt = new Date().toISOString();
    visualTests.set(testId, test);
  } finally {
    // Close browser to free resources
    await visualService.closeBrowser();
  }
}

export default router;
