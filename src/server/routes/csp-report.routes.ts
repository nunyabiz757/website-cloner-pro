import express, { Request, Response } from 'express';
import { Pool } from 'pg';
import { getCSPViolationService, initializeCSPViolationService } from '../services/csp-violation.service.js';
import { getCSPAlertService } from '../services/csp-alert.service.js';
import { AppLogger } from '../services/logger.service.js';
import { authenticateJWT } from '../middleware/auth.middleware.js';
import { z } from 'zod';
import { validateRequest } from '../middleware/validation.middleware.js';

const router = express.Router();

// Initialize database pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Initialize CSP service
const cspService = initializeCSPViolationService(pool);

/**
 * CSP Violation Report Endpoint
 * Receives Content Security Policy violation reports from browsers
 */

/**
 * @route POST /api/csp-report
 * @desc Receive CSP violation report from browser
 * @access Public (browsers send this automatically)
 */
router.post('/', async (req: Request, res: Response): Promise<void> => {
  try {
    // CSP reports come in a specific format
    const reportData = req.body['csp-report'] || req.body;

    // Validate report has required fields
    if (!reportData || !reportData['document-uri'] || !reportData['violated-directive']) {
      AppLogger.warn('Invalid CSP report received', {
        body: req.body,
        ip: req.ip,
      });

      // Return 204 to browser (accepted but not logging invalid reports)
      res.status(204).send();
      return;
    }

    // Extract context
    const context = {
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip || req.socket.remoteAddress,
      userId: req.user && 'userId' in req.user ? req.user.userId : undefined,
    };

    // Log the violation
    const violationId = await cspService.logViolation(reportData, context);

    // Check if alert should be triggered
    try {
      const alertService = getCSPAlertService();
      await alertService.checkAndCreateAlerts(violationId);
    } catch (error) {
      // Alert service might not be initialized, just log
      AppLogger.debug('CSP alert service not available', {
        error: (error as Error).message,
      });
    }

    // Always return 204 No Content for CSP reports (browser doesn't care about response)
    res.status(204).send();
  } catch (error) {
    AppLogger.error('Failed to process CSP report', error as Error, {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    // Still return 204 to browser
    res.status(204).send();
  }
});

/**
 * @route GET /api/csp-report/violations
 * @desc Get recent CSP violations (admin only)
 * @access Private
 */
router.get('/violations', authenticateJWT, async (req: Request, res: Response): Promise<void> => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;

    const violations = await cspService.getRecentViolations(limit);

    res.json({
      success: true,
      data: {
        violations,
        count: violations.length,
      },
    });
  } catch (error) {
    AppLogger.error('Failed to get CSP violations', error as Error);

    res.status(500).json({
      success: false,
      error: 'Failed to retrieve CSP violations',
      code: 'CSP_VIOLATIONS_ERROR',
    });
  }
});

/**
 * @route GET /api/csp-report/violations/critical
 * @desc Get critical CSP violations (admin only)
 * @access Private
 */
router.get('/violations/critical', authenticateJWT, async (req: Request, res: Response): Promise<void> => {
  try {
    const violations = await cspService.getCriticalViolations();

    res.json({
      success: true,
      data: {
        violations,
        count: violations.length,
      },
    });
  } catch (error) {
    AppLogger.error('Failed to get critical CSP violations', error as Error);

    res.status(500).json({
      success: false,
      error: 'Failed to retrieve critical CSP violations',
      code: 'CSP_CRITICAL_ERROR',
    });
  }
});

/**
 * @route GET /api/csp-report/violations/:id
 * @desc Get specific CSP violation (admin only)
 * @access Private
 */
router.get('/violations/:id', authenticateJWT, async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const violation = await cspService.getViolation(id);

    if (!violation) {
      res.status(404).json({
        success: false,
        error: 'CSP violation not found',
        code: 'VIOLATION_NOT_FOUND',
      });
      return;
    }

    res.json({
      success: true,
      data: violation,
    });
  } catch (error) {
    AppLogger.error('Failed to get CSP violation', error as Error, {
      violationId: req.params.id,
    });

    res.status(500).json({
      success: false,
      error: 'Failed to retrieve CSP violation',
      code: 'CSP_VIOLATION_ERROR',
    });
  }
});

/**
 * @route GET /api/csp-report/patterns
 * @desc Get CSP violation patterns (admin only)
 * @access Private
 */
router.get('/patterns', authenticateJWT, async (req: Request, res: Response): Promise<void> => {
  try {
    const minOccurrences = parseInt(req.query.minOccurrences as string) || 5;

    const patterns = await cspService.getViolationPatterns(minOccurrences);

    res.json({
      success: true,
      data: {
        patterns,
        count: patterns.length,
      },
    });
  } catch (error) {
    AppLogger.error('Failed to get CSP violation patterns', error as Error);

    res.status(500).json({
      success: false,
      error: 'Failed to retrieve CSP violation patterns',
      code: 'CSP_PATTERNS_ERROR',
    });
  }
});

/**
 * @route GET /api/csp-report/statistics
 * @desc Get CSP violation statistics (admin only)
 * @access Private
 */
router.get('/statistics', authenticateJWT, async (req: Request, res: Response): Promise<void> => {
  try {
    const days = parseInt(req.query.days as string) || 7;

    const stats = await cspService.getViolationStats(days);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    AppLogger.error('Failed to get CSP violation statistics', error as Error);

    res.status(500).json({
      success: false,
      error: 'Failed to retrieve CSP violation statistics',
      code: 'CSP_STATS_ERROR',
    });
  }
});

/**
 * @route PUT /api/csp-report/violations/:id/review
 * @desc Mark CSP violation as reviewed (admin only)
 * @access Private
 */
const reviewSchema = z.object({
  isFalsePositive: z.boolean().optional().default(false),
  notes: z.string().optional(),
});

router.put(
  '/violations/:id/review',
  authenticateJWT,
  validateRequest({ body: reviewSchema }),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { isFalsePositive, notes } = req.body;

      if (!req.user || !('userId' in req.user)) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'AUTH_REQUIRED',
        });
        return;
      }

      const reviewedBy = req.user.userId;

      await cspService.markAsReviewed(id, reviewedBy, isFalsePositive, notes);

      res.json({
        success: true,
        message: 'CSP violation marked as reviewed',
      });
    } catch (error) {
      AppLogger.error('Failed to review CSP violation', error as Error, {
        violationId: req.params.id,
      });

      res.status(500).json({
        success: false,
        error: 'Failed to review CSP violation',
        code: 'CSP_REVIEW_ERROR',
      });
    }
  }
);

/**
 * @route PUT /api/csp-report/patterns/:id/whitelist
 * @desc Whitelist a CSP violation pattern (admin only)
 * @access Private
 */
const whitelistSchema = z.object({
  notes: z.string().optional(),
});

router.put(
  '/patterns/:id/whitelist',
  authenticateJWT,
  validateRequest({ body: whitelistSchema }),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;
      const { notes } = req.body;

      await cspService.whitelistPattern(id, notes);

      res.json({
        success: true,
        message: 'CSP violation pattern whitelisted',
      });
    } catch (error) {
      AppLogger.error('Failed to whitelist CSP pattern', error as Error, {
        patternId: req.params.id,
      });

      res.status(500).json({
        success: false,
        error: 'Failed to whitelist CSP pattern',
        code: 'CSP_WHITELIST_ERROR',
      });
    }
  }
);

/**
 * @route PUT /api/csp-report/patterns/:id/critical
 * @desc Mark CSP violation pattern as critical (admin only)
 * @access Private
 */
router.put(
  '/patterns/:id/critical',
  authenticateJWT,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      await cspService.markPatternAsCritical(id);

      res.json({
        success: true,
        message: 'CSP violation pattern marked as critical',
      });
    } catch (error) {
      AppLogger.error('Failed to mark CSP pattern as critical', error as Error, {
        patternId: req.params.id,
      });

      res.status(500).json({
        success: false,
        error: 'Failed to mark pattern as critical',
        code: 'CSP_CRITICAL_ERROR',
      });
    }
  }
);

/**
 * @route POST /api/csp-report/cleanup
 * @desc Cleanup old CSP violations (admin only)
 * @access Private
 */
const cleanupSchema = z.object({
  retentionDays: z.number().min(1).max(365).optional().default(90),
});

router.post(
  '/cleanup',
  authenticateJWT,
  validateRequest({ body: cleanupSchema }),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { retentionDays } = req.body;

      const deletedCount = await cspService.cleanupOldViolations(retentionDays);

      res.json({
        success: true,
        message: `Cleaned up ${deletedCount} old CSP violation(s)`,
        data: {
          deletedCount,
          retentionDays,
        },
      });
    } catch (error) {
      AppLogger.error('Failed to cleanup CSP violations', error as Error);

      res.status(500).json({
        success: false,
        error: 'Failed to cleanup CSP violations',
        code: 'CSP_CLEANUP_ERROR',
      });
    }
  }
);

/**
 * Health check endpoint for CSP reporting
 */
router.get('/health', (req: Request, res: Response): void => {
  res.json({
    success: true,
    status: 'operational',
    service: 'csp-reporting',
  });
});

export default router;
