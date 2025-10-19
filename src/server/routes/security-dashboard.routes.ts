import express, { Request, Response } from 'express';
import { Pool } from 'pg';
import { z } from 'zod';
import { initializeSecurityMetricsService } from '../services/security-metrics.service.js';
import { authenticateJWT } from '../middleware/auth.middleware.js';
import { AppLogger } from '../services/logger.service.js';

/**
 * Security Dashboard Routes
 * Provides endpoints for security monitoring and metrics
 */

const router = express.Router();
let securityMetricsService: ReturnType<typeof initializeSecurityMetricsService>;

export function initializeSecurityDashboardRoutes(pool: Pool) {
  securityMetricsService = initializeSecurityMetricsService(pool);
}

// Validation schemas
const timeRangeSchema = z.object({
  range: z.enum(['24h', '7d', '30d']).optional().default('24h'),
});

const limitSchema = z.object({
  limit: z.number().min(1).max(100).optional().default(10),
});

/**
 * GET /api/security/dashboard
 * Get comprehensive security dashboard data
 */
router.get(
  '/dashboard',
  authenticateJWT,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { range } = timeRangeSchema.parse(req.query);

      const dashboardData = await securityMetricsService.getDashboardData(range);

      res.json({
        success: true,
        data: dashboardData,
        timestamp: new Date(),
      });
    } catch (error) {
      AppLogger.error('Failed to get security dashboard', error as Error, {
        userId: req.user?.userId,
      });

      res.status(500).json({
        success: false,
        error: 'Failed to retrieve security dashboard',
      });
    }
  }
);

/**
 * GET /api/security/overview
 * Get security overview metrics
 */
router.get(
  '/overview',
  authenticateJWT,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { range } = timeRangeSchema.parse(req.query);

      const overview = await securityMetricsService.getSecurityOverview(range);

      res.json({
        success: true,
        data: overview,
      });
    } catch (error) {
      AppLogger.error('Failed to get security overview', error as Error);

      res.status(500).json({
        success: false,
        error: 'Failed to retrieve security overview',
      });
    }
  }
);

/**
 * GET /api/security/login-metrics
 * Get login attempt metrics
 */
router.get(
  '/login-metrics',
  authenticateJWT,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { range } = timeRangeSchema.parse(req.query);

      const metrics = await securityMetricsService.getLoginMetrics(range);

      res.json({
        success: true,
        data: metrics,
      });
    } catch (error) {
      AppLogger.error('Failed to get login metrics', error as Error);

      res.status(500).json({
        success: false,
        error: 'Failed to retrieve login metrics',
      });
    }
  }
);

/**
 * GET /api/security/api-key-metrics
 * Get API key metrics
 */
router.get(
  '/api-key-metrics',
  authenticateJWT,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const metrics = await securityMetricsService.getAPIKeyMetrics();

      res.json({
        success: true,
        data: metrics,
      });
    } catch (error) {
      AppLogger.error('Failed to get API key metrics', error as Error);

      res.status(500).json({
        success: false,
        error: 'Failed to retrieve API key metrics',
      });
    }
  }
);

/**
 * GET /api/security/session-metrics
 * Get session metrics
 */
router.get(
  '/session-metrics',
  authenticateJWT,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const metrics = await securityMetricsService.getSessionMetrics();

      res.json({
        success: true,
        data: metrics,
      });
    } catch (error) {
      AppLogger.error('Failed to get session metrics', error as Error);

      res.status(500).json({
        success: false,
        error: 'Failed to retrieve session metrics',
      });
    }
  }
);

/**
 * GET /api/security/csp-metrics
 * Get CSP violation metrics
 */
router.get(
  '/csp-metrics',
  authenticateJWT,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { range } = timeRangeSchema.parse(req.query);

      const metrics = await securityMetricsService.getCSPMetrics(range);

      res.json({
        success: true,
        data: metrics,
      });
    } catch (error) {
      AppLogger.error('Failed to get CSP metrics', error as Error);

      res.status(500).json({
        success: false,
        error: 'Failed to retrieve CSP metrics',
      });
    }
  }
);

/**
 * GET /api/security/threat-summary
 * Get threat summary
 */
router.get(
  '/threat-summary',
  authenticateJWT,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const summary = await securityMetricsService.getThreatSummary();

      res.json({
        success: true,
        data: summary,
      });
    } catch (error) {
      AppLogger.error('Failed to get threat summary', error as Error);

      res.status(500).json({
        success: false,
        error: 'Failed to retrieve threat summary',
      });
    }
  }
);

/**
 * GET /api/security/timeline
 * Get security events timeline
 */
router.get(
  '/timeline',
  authenticateJWT,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { range } = timeRangeSchema.parse(req.query);
      const hours = range === '24h' ? 24 : range === '7d' ? 168 : 720;

      const timeline = await securityMetricsService.getSecurityTimeline(hours);

      res.json({
        success: true,
        data: timeline,
      });
    } catch (error) {
      AppLogger.error('Failed to get security timeline', error as Error);

      res.status(500).json({
        success: false,
        error: 'Failed to retrieve security timeline',
      });
    }
  }
);

/**
 * GET /api/security/top-threats
 * Get top threat actors
 */
router.get(
  '/top-threats',
  authenticateJWT,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { limit } = limitSchema.parse(req.query);

      const threats = await securityMetricsService.getTopThreatActors(limit);

      res.json({
        success: true,
        data: threats,
      });
    } catch (error) {
      AppLogger.error('Failed to get top threats', error as Error);

      res.status(500).json({
        success: false,
        error: 'Failed to retrieve top threats',
      });
    }
  }
);

/**
 * GET /api/security/geographic-threats
 * Get geographic distribution of threats
 */
router.get(
  '/geographic-threats',
  authenticateJWT,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const threats = await securityMetricsService.getGeographicThreats();

      res.json({
        success: true,
        data: threats,
      });
    } catch (error) {
      AppLogger.error('Failed to get geographic threats', error as Error);

      res.status(500).json({
        success: false,
        error: 'Failed to retrieve geographic threats',
      });
    }
  }
);

/**
 * GET /api/security/events
 * Get security events with filtering
 */
router.get(
  '/events',
  authenticateJWT,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const {
        severity,
        type,
        limit = 50,
        offset = 0,
      } = req.query;

      let query = `SELECT * FROM security_events WHERE 1=1`;
      const params: any[] = [];
      let paramCount = 1;

      if (severity) {
        query += ` AND severity = $${paramCount}`;
        params.push(severity);
        paramCount++;
      }

      if (type) {
        query += ` AND event_type = $${paramCount}`;
        params.push(type);
        paramCount++;
      }

      query += ` ORDER BY created_at DESC LIMIT $${paramCount} OFFSET $${paramCount + 1}`;
      params.push(Number(limit), Number(offset));

      const result = await securityMetricsService['pool'].query(query, params);

      // Get total count
      let countQuery = `SELECT COUNT(*)::INTEGER as total FROM security_events WHERE 1=1`;
      const countParams: any[] = [];
      let countParamCount = 1;

      if (severity) {
        countQuery += ` AND severity = $${countParamCount}`;
        countParams.push(severity);
        countParamCount++;
      }

      if (type) {
        countQuery += ` AND event_type = $${countParamCount}`;
        countParams.push(type);
      }

      const countResult = await securityMetricsService['pool'].query(
        countQuery,
        countParams
      );

      res.json({
        success: true,
        data: {
          events: result.rows,
          total: countResult.rows[0].total,
          limit: Number(limit),
          offset: Number(offset),
        },
      });
    } catch (error) {
      AppLogger.error('Failed to get security events', error as Error);

      res.status(500).json({
        success: false,
        error: 'Failed to retrieve security events',
      });
    }
  }
);

/**
 * GET /api/security/events/:id
 * Get specific security event details
 */
router.get(
  '/events/:id',
  authenticateJWT,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { id } = req.params;

      const result = await securityMetricsService['pool'].query(
        'SELECT * FROM security_events WHERE id = $1',
        [id]
      );

      if (result.rows.length === 0) {
        res.status(404).json({
          success: false,
          error: 'Security event not found',
        });
        return;
      }

      res.json({
        success: true,
        data: result.rows[0],
      });
    } catch (error) {
      AppLogger.error('Failed to get security event', error as Error);

      res.status(500).json({
        success: false,
        error: 'Failed to retrieve security event',
      });
    }
  }
);

/**
 * GET /api/security/stats
 * Get quick security statistics
 */
router.get(
  '/stats',
  authenticateJWT,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const result = await securityMetricsService['pool'].query(
        `SELECT
          (SELECT COUNT(*) FROM security_events WHERE created_at >= NOW() - INTERVAL '24 hours')::INTEGER as events_24h,
          (SELECT COUNT(*) FROM security_events WHERE severity = 'critical' AND created_at >= NOW() - INTERVAL '24 hours')::INTEGER as critical_24h,
          (SELECT COUNT(*) FROM api_key_ip_blacklist WHERE is_active = TRUE)::INTEGER as blocked_ips,
          (SELECT COUNT(*) FROM sessions WHERE expires_at > NOW())::INTEGER as active_sessions,
          (SELECT COUNT(*) FROM api_keys WHERE revoked = FALSE AND (expires_at IS NULL OR expires_at > NOW()))::INTEGER as active_api_keys`
      );

      res.json({
        success: true,
        data: result.rows[0],
      });
    } catch (error) {
      AppLogger.error('Failed to get security stats', error as Error);

      res.status(500).json({
        success: false,
        error: 'Failed to retrieve security stats',
      });
    }
  }
);

export default router;
