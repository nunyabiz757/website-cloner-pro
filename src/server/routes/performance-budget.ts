import express from 'express';
import PerformanceBudgetService from '../services/PerformanceBudgetService.js';

const router = express.Router();

/**
 * Get default performance budget
 * GET /api/performance-budget/default
 */
router.get('/default', (req, res) => {
  try {
    const defaultBudget = PerformanceBudgetService.getDefaultBudget();

    res.json({
      success: true,
      budget: defaultBudget,
    });
  } catch (error) {
    console.error('Failed to get default budget:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get default budget',
    });
  }
});

/**
 * Get project budget
 * GET /api/performance-budget/project/:projectId
 */
router.get('/project/:projectId', (req, res) => {
  try {
    const { projectId } = req.params;

    const budget = PerformanceBudgetService.getProjectBudget(projectId);

    res.json({
      success: true,
      budget,
    });
  } catch (error) {
    console.error('Failed to get project budget:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get project budget',
    });
  }
});

/**
 * Set project budget
 * POST /api/performance-budget/project/:projectId
 */
router.post('/project/:projectId', (req, res) => {
  try {
    const { projectId } = req.params;
    const budgetConfig = req.body;

    const budget = PerformanceBudgetService.setProjectBudget(projectId, budgetConfig);

    res.json({
      success: true,
      budget,
      message: 'Project budget updated successfully',
    });
  } catch (error) {
    console.error('Failed to set project budget:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to set project budget',
    });
  }
});

/**
 * Delete project budget
 * DELETE /api/performance-budget/project/:projectId
 */
router.delete('/project/:projectId', (req, res) => {
  try {
    const { projectId } = req.params;

    const deleted = PerformanceBudgetService.deleteProjectBudget(projectId);

    if (deleted) {
      res.json({
        success: true,
        message: 'Project budget deleted successfully',
      });
    } else {
      res.status(404).json({
        success: false,
        error: 'Project budget not found',
      });
    }
  } catch (error) {
    console.error('Failed to delete project budget:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete project budget',
    });
  }
});

/**
 * List all project budgets
 * GET /api/performance-budget/projects
 */
router.get('/projects', (req, res) => {
  try {
    const budgets = PerformanceBudgetService.listProjectBudgets();

    res.json({
      success: true,
      budgets,
      count: budgets.length,
    });
  } catch (error) {
    console.error('Failed to list project budgets:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list project budgets',
    });
  }
});

/**
 * Calculate metrics only
 * POST /api/performance-budget/calculate-metrics
 */
router.post('/calculate-metrics', async (req, res) => {
  try {
    const { html, css = [], js = [], images = [], assets } = req.body;

    if (!html) {
      return res.status(400).json({
        success: false,
        error: 'HTML content is required',
      });
    }

    // Convert assets if provided
    let assetMap: Map<string, Buffer> | undefined;
    if (assets && typeof assets === 'object') {
      assetMap = new Map();
      for (const [path, base64Content] of Object.entries(assets)) {
        if (typeof base64Content === 'string') {
          assetMap.set(path, Buffer.from(base64Content, 'base64'));
        }
      }
    }

    const metrics = await PerformanceBudgetService.calculateMetrics(
      html,
      css,
      js,
      images,
      assetMap
    );

    res.json({
      success: true,
      metrics,
    });
  } catch (error) {
    console.error('Failed to calculate metrics:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to calculate metrics',
    });
  }
});

/**
 * Validate content against budget
 * POST /api/performance-budget/validate
 */
router.post('/validate', async (req, res) => {
  try {
    const {
      html,
      css = [],
      js = [],
      images = [],
      assets,
      budget,
      projectId,
      criticalCSSSize,
    } = req.body;

    if (!html) {
      return res.status(400).json({
        success: false,
        error: 'HTML content is required',
      });
    }

    // Get budget (from request, project, or default)
    let budgetToUse = budget;
    if (!budgetToUse && projectId) {
      budgetToUse = PerformanceBudgetService.getProjectBudget(projectId);
    }
    if (!budgetToUse) {
      budgetToUse = PerformanceBudgetService.getDefaultBudget();
    }

    // Convert assets if provided
    let assetMap: Map<string, Buffer> | undefined;
    if (assets && typeof assets === 'object') {
      assetMap = new Map();
      for (const [path, base64Content] of Object.entries(assets)) {
        if (typeof base64Content === 'string') {
          assetMap.set(path, Buffer.from(base64Content, 'base64'));
        }
      }
    }

    const result = await PerformanceBudgetService.validateBudget(
      html,
      css,
      js,
      images,
      budgetToUse,
      assetMap,
      criticalCSSSize
    );

    res.json({
      success: true,
      validation: result,
    });
  } catch (error) {
    console.error('Failed to validate budget:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to validate budget',
    });
  }
});

/**
 * Validate and block export if budget exceeded
 * POST /api/performance-budget/validate-export
 */
router.post('/validate-export', async (req, res) => {
  try {
    const {
      html,
      css = [],
      js = [],
      images = [],
      assets,
      projectId,
      override = false,
    } = req.body;

    if (!html) {
      return res.status(400).json({
        success: false,
        error: 'HTML content is required',
      });
    }

    // Get project budget
    const budget = projectId
      ? PerformanceBudgetService.getProjectBudget(projectId)
      : PerformanceBudgetService.getDefaultBudget();

    // Convert assets if provided
    let assetMap: Map<string, Buffer> | undefined;
    if (assets && typeof assets === 'object') {
      assetMap = new Map();
      for (const [path, base64Content] of Object.entries(assets)) {
        if (typeof base64Content === 'string') {
          assetMap.set(path, Buffer.from(base64Content, 'base64'));
        }
      }
    }

    const result = await PerformanceBudgetService.validateBudget(
      html,
      css,
      js,
      images,
      budget,
      assetMap
    );

    // Check if export is blocked
    if (!result.canExport && !override) {
      return res.status(403).json({
        success: false,
        error: 'Export blocked due to budget violations',
        validation: result,
        canOverride: result.requiresOverride && budget.allowOverride,
        message: result.summary.criticalViolations > 0
          ? `Export blocked: ${result.summary.criticalViolations} critical budget violation(s)`
          : `Export blocked: ${result.summary.totalViolations} budget violation(s)`,
      });
    }

    // Export allowed (either passed or override used)
    res.json({
      success: true,
      allowed: true,
      validation: result,
      overrideUsed: override && !result.canExport,
      message: result.passed
        ? 'All budget checks passed'
        : override
        ? 'Export allowed with override'
        : 'Export allowed with warnings',
    });
  } catch (error) {
    console.error('Failed to validate export:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to validate export',
    });
  }
});

/**
 * Quick validation with default budget
 * POST /api/performance-budget/quick-validate
 */
router.post('/quick-validate', async (req, res) => {
  try {
    const { html, css = [], js = [] } = req.body;

    if (!html) {
      return res.status(400).json({
        success: false,
        error: 'HTML content is required',
      });
    }

    const budget = PerformanceBudgetService.getDefaultBudget();
    const result = await PerformanceBudgetService.validateBudget(
      html,
      css,
      js,
      [],
      budget
    );

    res.json({
      success: true,
      passed: result.passed,
      canExport: result.canExport,
      summary: result.summary,
    });
  } catch (error) {
    console.error('Failed to quick validate:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to quick validate',
    });
  }
});

/**
 * Generate budget report
 * POST /api/performance-budget/report
 */
router.post('/report', async (req, res) => {
  try {
    const {
      html,
      css = [],
      js = [],
      images = [],
      assets,
      budget,
      projectId,
    } = req.body;

    if (!html) {
      return res.status(400).json({
        success: false,
        error: 'HTML content is required',
      });
    }

    // Get budget
    let budgetToUse = budget;
    if (!budgetToUse && projectId) {
      budgetToUse = PerformanceBudgetService.getProjectBudget(projectId);
    }
    if (!budgetToUse) {
      budgetToUse = PerformanceBudgetService.getDefaultBudget();
    }

    // Convert assets if provided
    let assetMap: Map<string, Buffer> | undefined;
    if (assets && typeof assets === 'object') {
      assetMap = new Map();
      for (const [path, base64Content] of Object.entries(assets)) {
        if (typeof base64Content === 'string') {
          assetMap.set(path, Buffer.from(base64Content, 'base64'));
        }
      }
    }

    const result = await PerformanceBudgetService.validateBudget(
      html,
      css,
      js,
      images,
      budgetToUse,
      assetMap
    );

    const report = PerformanceBudgetService.generateReport(result);

    res.json({
      success: true,
      report,
      validation: result,
    });
  } catch (error) {
    console.error('Failed to generate report:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate report',
    });
  }
});

/**
 * Get budget presets
 * GET /api/performance-budget/presets
 */
router.get('/presets', (req, res) => {
  try {
    const presets = {
      strict: {
        name: 'Strict',
        description: 'Very tight budgets for maximum performance',
        maxHTMLSize: 51200,         // 50KB
        maxCSSSize: 25600,          // 25KB
        maxJSSize: 51200,           // 50KB
        maxImageSize: 256000,       // 250KB
        maxTotalSize: 524288,       // 512KB
        maxHTTPRequests: 30,
        maxDOMNodes: 1000,
        enforcement: 'strict',
      },
      moderate: {
        name: 'Moderate',
        description: 'Balanced budgets for good performance',
        maxHTMLSize: 102400,        // 100KB
        maxCSSSize: 51200,          // 50KB
        maxJSSize: 102400,          // 100KB
        maxImageSize: 512000,       // 500KB
        maxTotalSize: 1048576,      // 1MB
        maxHTTPRequests: 50,
        maxDOMNodes: 1500,
        enforcement: 'warning',
      },
      relaxed: {
        name: 'Relaxed',
        description: 'Lenient budgets for feature-rich sites',
        maxHTMLSize: 204800,        // 200KB
        maxCSSSize: 102400,         // 100KB
        maxJSSize: 204800,          // 200KB
        maxImageSize: 1048576,      // 1MB
        maxTotalSize: 2097152,      // 2MB
        maxHTTPRequests: 100,
        maxDOMNodes: 2500,
        enforcement: 'warning',
      },
      mobile: {
        name: 'Mobile-First',
        description: 'Optimized for mobile networks',
        maxHTMLSize: 40960,         // 40KB
        maxCSSSize: 20480,          // 20KB
        maxJSSize: 40960,           // 40KB
        maxImageSize: 204800,       // 200KB
        maxTotalSize: 409600,       // 400KB
        maxHTTPRequests: 25,
        maxDOMNodes: 800,
        enforcement: 'strict',
      },
      enterprise: {
        name: 'Enterprise',
        description: 'Suitable for complex applications',
        maxHTMLSize: 307200,        // 300KB
        maxCSSSize: 153600,         // 150KB
        maxJSSize: 307200,          // 300KB
        maxImageSize: 2097152,      // 2MB
        maxTotalSize: 3145728,      // 3MB
        maxHTTPRequests: 150,
        maxDOMNodes: 3000,
        enforcement: 'warning',
      },
    };

    res.json({
      success: true,
      presets,
    });
  } catch (error) {
    console.error('Failed to get presets:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get presets',
    });
  }
});

/**
 * Apply preset to project
 * POST /api/performance-budget/project/:projectId/preset/:presetName
 */
router.post('/project/:projectId/preset/:presetName', (req, res) => {
  try {
    const { projectId, presetName } = req.params;

    const presets: any = {
      strict: {
        maxHTMLSize: 51200,
        maxCSSSize: 25600,
        maxJSSize: 51200,
        maxImageSize: 256000,
        maxTotalSize: 524288,
        maxHTTPRequests: 30,
        maxDOMNodes: 1000,
        enforcement: 'strict',
      },
      moderate: {
        maxHTMLSize: 102400,
        maxCSSSize: 51200,
        maxJSSize: 102400,
        maxImageSize: 512000,
        maxTotalSize: 1048576,
        maxHTTPRequests: 50,
        maxDOMNodes: 1500,
        enforcement: 'warning',
      },
      relaxed: {
        maxHTMLSize: 204800,
        maxCSSSize: 102400,
        maxJSSize: 204800,
        maxImageSize: 1048576,
        maxTotalSize: 2097152,
        maxHTTPRequests: 100,
        maxDOMNodes: 2500,
        enforcement: 'warning',
      },
      mobile: {
        maxHTMLSize: 40960,
        maxCSSSize: 20480,
        maxJSSize: 40960,
        maxImageSize: 204800,
        maxTotalSize: 409600,
        maxHTTPRequests: 25,
        maxDOMNodes: 800,
        enforcement: 'strict',
      },
      enterprise: {
        maxHTMLSize: 307200,
        maxCSSSize: 153600,
        maxJSSize: 307200,
        maxImageSize: 2097152,
        maxTotalSize: 3145728,
        maxHTTPRequests: 150,
        maxDOMNodes: 3000,
        enforcement: 'warning',
      },
    };

    const preset = presets[presetName];
    if (!preset) {
      return res.status(404).json({
        success: false,
        error: `Preset '${presetName}' not found`,
      });
    }

    const budget = PerformanceBudgetService.setProjectBudget(projectId, preset);

    res.json({
      success: true,
      budget,
      message: `Applied '${presetName}' preset to project`,
    });
  } catch (error) {
    console.error('Failed to apply preset:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to apply preset',
    });
  }
});

export default router;
