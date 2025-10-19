import express from 'express';
import PerformanceFixService from '../services/PerformanceFixService.js';

const router = express.Router();

/**
 * Get all available performance fixes
 * GET /api/performance-fix/fixes
 */
router.get('/fixes', async (req, res) => {
  try {
    const { category, risk, impact } = req.query;

    const fixes = PerformanceFixService.getAvailableFixes({
      category: category as string,
      risk: risk as string,
      impact: impact as string,
    });

    res.json({
      success: true,
      fixes,
      total: fixes.length,
    });
  } catch (error) {
    console.error('Failed to get fixes:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get fixes',
    });
  }
});

/**
 * Get fix modes (safe/aggressive/custom)
 * GET /api/performance-fix/modes
 */
router.get('/modes', async (req, res) => {
  try {
    const modes = PerformanceFixService.getFixModes();

    res.json({
      success: true,
      modes,
    });
  } catch (error) {
    console.error('Failed to get modes:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get modes',
    });
  }
});

/**
 * Create a new fix application session
 * POST /api/performance-fix/session
 */
router.post('/session', async (req, res) => {
  try {
    const { content, mode } = req.body;

    if (!content) {
      return res.status(400).json({
        success: false,
        error: 'Content is required',
      });
    }

    if (mode && !['live', 'test'].includes(mode)) {
      return res.status(400).json({
        success: false,
        error: 'Mode must be either "live" or "test"',
      });
    }

    const session = await PerformanceFixService.createSession(
      content,
      mode || 'test'
    );

    res.json({
      success: true,
      session: {
        sessionId: session.sessionId,
        mode: session.mode,
        availableFixesCount: session.availableFixes.length,
        createdAt: session.createdAt,
      },
    });
  } catch (error) {
    console.error('Failed to create session:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create session',
    });
  }
});

/**
 * Get session details
 * GET /api/performance-fix/session/:sessionId
 */
router.get('/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    const session = PerformanceFixService.getSession(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found',
      });
    }

    res.json({
      success: true,
      session: {
        sessionId: session.sessionId,
        mode: session.mode,
        appliedFixes: session.appliedFixes.map(f => ({
          fixId: f.fixId,
          success: f.success,
          improvements: f.improvements,
        })),
        availableFixes: session.availableFixes,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
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
 * Check if a fix can be applied
 * GET /api/performance-fix/session/:sessionId/can-apply/:fixId
 */
router.get('/session/:sessionId/can-apply/:fixId', async (req, res) => {
  try {
    const { sessionId, fixId } = req.params;

    const result = PerformanceFixService.canApplyFix(sessionId, fixId);

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error('Failed to check if fix can be applied:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to check fix',
    });
  }
});

/**
 * Apply a single fix
 * POST /api/performance-fix/session/:sessionId/apply
 */
router.post('/session/:sessionId/apply', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { fixId, content } = req.body;

    if (!fixId) {
      return res.status(400).json({
        success: false,
        error: 'fixId is required',
      });
    }

    if (!content) {
      return res.status(400).json({
        success: false,
        error: 'content is required',
      });
    }

    const result = await PerformanceFixService.applyFix(sessionId, fixId, content);

    res.json({
      success: true,
      result: {
        fixId: result.fixId,
        applied: result.applied,
        success: result.success,
        improvements: result.improvements,
        warnings: result.warnings,
        errors: result.errors,
        hasRollback: !!result.rollbackData,
      },
    });
  } catch (error) {
    console.error('Failed to apply fix:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to apply fix',
    });
  }
});

/**
 * Apply multiple fixes
 * POST /api/performance-fix/session/:sessionId/apply-multiple
 */
router.post('/session/:sessionId/apply-multiple', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { fixIds, content } = req.body;

    if (!fixIds || !Array.isArray(fixIds)) {
      return res.status(400).json({
        success: false,
        error: 'fixIds array is required',
      });
    }

    if (!content) {
      return res.status(400).json({
        success: false,
        error: 'content is required',
      });
    }

    const results = await PerformanceFixService.applyFixes(
      sessionId,
      fixIds,
      content
    );

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    res.json({
      success: true,
      results: results.map(r => ({
        fixId: r.fixId,
        applied: r.applied,
        success: r.success,
        improvements: r.improvements,
        warnings: r.warnings,
        errors: r.errors,
      })),
      summary: {
        total: results.length,
        successful,
        failed,
      },
    });
  } catch (error) {
    console.error('Failed to apply fixes:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to apply fixes',
    });
  }
});

/**
 * Apply fixes by mode
 * POST /api/performance-fix/session/:sessionId/apply-mode
 */
router.post('/session/:sessionId/apply-mode', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { mode, customFixIds, content } = req.body;

    if (!mode) {
      return res.status(400).json({
        success: false,
        error: 'mode is required (safe, aggressive, or custom)',
      });
    }

    if (!['safe', 'aggressive', 'custom'].includes(mode)) {
      return res.status(400).json({
        success: false,
        error: 'mode must be one of: safe, aggressive, custom',
      });
    }

    if (mode === 'custom' && (!customFixIds || !Array.isArray(customFixIds))) {
      return res.status(400).json({
        success: false,
        error: 'customFixIds array is required for custom mode',
      });
    }

    if (!content) {
      return res.status(400).json({
        success: false,
        error: 'content is required',
      });
    }

    const results = await PerformanceFixService.applyMode(
      sessionId,
      mode,
      customFixIds || [],
      content
    );

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    res.json({
      success: true,
      mode,
      results: results.map(r => ({
        fixId: r.fixId,
        applied: r.applied,
        success: r.success,
        improvements: r.improvements,
      })),
      summary: {
        total: results.length,
        successful,
        failed,
      },
    });
  } catch (error) {
    console.error('Failed to apply mode:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to apply mode',
    });
  }
});

/**
 * Rollback a specific fix
 * POST /api/performance-fix/session/:sessionId/rollback/:fixId
 */
router.post('/session/:sessionId/rollback/:fixId', async (req, res) => {
  try {
    const { sessionId, fixId } = req.params;

    const result = await PerformanceFixService.rollbackFix(sessionId, fixId);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.message,
      });
    }

    res.json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    console.error('Failed to rollback fix:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to rollback fix',
    });
  }
});

/**
 * Commit session to live
 * POST /api/performance-fix/session/:sessionId/commit
 */
router.post('/session/:sessionId/commit', async (req, res) => {
  try {
    const { sessionId } = req.params;

    const result = await PerformanceFixService.commitSession(sessionId);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.message,
      });
    }

    res.json({
      success: true,
      message: result.message,
      finalState: result.finalState,
    });
  } catch (error) {
    console.error('Failed to commit session:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to commit session',
    });
  }
});

/**
 * Discard session
 * DELETE /api/performance-fix/session/:sessionId
 */
router.delete('/session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    const result = await PerformanceFixService.discardSession(sessionId);

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: result.message,
      });
    }

    res.json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    console.error('Failed to discard session:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to discard session',
    });
  }
});

/**
 * Get session summary
 * GET /api/performance-fix/session/:sessionId/summary
 */
router.get('/session/:sessionId/summary', async (req, res) => {
  try {
    const { sessionId } = req.params;

    const summary = PerformanceFixService.getSessionSummary(sessionId);

    if (!summary) {
      return res.status(404).json({
        success: false,
        error: 'Session not found',
      });
    }

    res.json({
      success: true,
      summary,
    });
  } catch (error) {
    console.error('Failed to get session summary:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get session summary',
    });
  }
});

export default router;
