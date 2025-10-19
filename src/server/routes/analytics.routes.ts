/**
 * Analytics API Routes
 *
 * Endpoints:
 * - GET    /api/analytics/dashboard           - Get dashboard statistics
 * - GET    /api/analytics/activity            - Get user activity log
 * - GET    /api/analytics/stats               - Get daily statistics
 * - GET    /api/analytics/summary             - Get analytics summary
 * - GET    /api/analytics/templates/:id       - Get template performance
 * - GET    /api/analytics/trending            - Get trending templates
 * - GET    /api/analytics/top                 - Get top templates
 * - GET    /api/analytics/engagement          - Get user engagement
 * - GET    /api/analytics/export              - Export analytics data
 */

import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/rbac.middleware.js';
import { getAnalyticsService } from '../services/analytics.service.js';
import { param, query, validationResult } from 'express-validator';

const router = Router();

// Validation middleware
const validateRequest = (req: Request, res: Response, next: any) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            errors: errors.array()
        });
    }
    next();
};

/**
 * GET /api/analytics/dashboard
 * Get comprehensive dashboard statistics
 */
router.get('/dashboard',
    authenticate,
    async (req: Request, res: Response) => {
        try {
            const service = await getAnalyticsService();

            // If user has analytics:view:all permission, show global stats
            // Otherwise show user-specific stats
            const hasGlobalAccess = req.user?.permissions?.includes('analytics:view:all');
            const userId = hasGlobalAccess ? undefined : req.user!.userId;

            const stats = await service.getDashboardStats(userId);

            res.json({
                success: true,
                data: stats
            });

        } catch (error: any) {
            console.error('Error getting dashboard stats:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get dashboard statistics',
                message: error.message
            });
        }
    }
);

/**
 * GET /api/analytics/activity
 * Get user activity log
 */
router.get('/activity',
    authenticate,
    [
        query('limit').optional().isInt({ min: 1, max: 100 }),
        query('offset').optional().isInt({ min: 0 })
    ],
    validateRequest,
    async (req: Request, res: Response) => {
        try {
            const service = await getAnalyticsService();
            const limit = parseInt(req.query.limit as string) || 50;
            const offset = parseInt(req.query.offset as string) || 0;

            const activity = await service.getUserActivity(
                req.user!.userId,
                limit,
                offset
            );

            res.json({
                success: true,
                data: activity,
                pagination: {
                    limit,
                    offset,
                    count: activity.length
                }
            });

        } catch (error: any) {
            console.error('Error getting user activity:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get user activity',
                message: error.message
            });
        }
    }
);

/**
 * GET /api/analytics/stats
 * Get daily statistics for date range
 */
router.get('/stats',
    authenticate,
    [
        query('startDate').isDate(),
        query('endDate').isDate(),
        query('metricType').optional().isString()
    ],
    validateRequest,
    async (req: Request, res: Response) => {
        try {
            const service = await getAnalyticsService();

            // Check if user wants their own stats or global
            const hasGlobalAccess = req.user?.permissions?.includes('analytics:view:all');
            const userId = hasGlobalAccess && req.query.userId
                ? req.query.userId as string
                : req.user!.userId;

            const stats = await service.getDailyStats(
                req.query.startDate as string,
                req.query.endDate as string,
                userId,
                req.query.metricType as string | undefined
            );

            res.json({
                success: true,
                data: stats,
                count: stats.length
            });

        } catch (error: any) {
            console.error('Error getting daily stats:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get daily statistics',
                message: error.message
            });
        }
    }
);

/**
 * GET /api/analytics/summary
 * Get analytics summary
 */
router.get('/summary',
    authenticate,
    [
        query('startDate').isDate(),
        query('endDate').isDate()
    ],
    validateRequest,
    async (req: Request, res: Response) => {
        try {
            const service = await getAnalyticsService();

            const summary = await service.getAnalyticsSummary(
                req.user!.userId,
                req.query.startDate as string,
                req.query.endDate as string
            );

            res.json({
                success: true,
                data: summary
            });

        } catch (error: any) {
            console.error('Error getting analytics summary:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get analytics summary',
                message: error.message
            });
        }
    }
);

/**
 * GET /api/analytics/templates/:id
 * Get template performance metrics
 */
router.get('/templates/:id',
    authenticate,
    [
        param('id').isUUID(),
        query('startDate').isDate(),
        query('endDate').isDate()
    ],
    validateRequest,
    async (req: Request, res: Response) => {
        try {
            const service = await getAnalyticsService();

            const performance = await service.getTemplatePerformance(
                req.params.id,
                req.query.startDate as string,
                req.query.endDate as string
            );

            res.json({
                success: true,
                data: performance,
                count: performance.length
            });

        } catch (error: any) {
            console.error('Error getting template performance:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get template performance',
                message: error.message
            });
        }
    }
);

/**
 * GET /api/analytics/trending
 * Get trending templates
 */
router.get('/trending',
    authenticate,
    [
        query('limit').optional().isInt({ min: 1, max: 50 })
    ],
    validateRequest,
    async (req: Request, res: Response) => {
        try {
            const service = await getAnalyticsService();
            const limit = parseInt(req.query.limit as string) || 10;

            const trending = await service.getTrendingTemplates(limit);

            res.json({
                success: true,
                data: trending,
                count: trending.length
            });

        } catch (error: any) {
            console.error('Error getting trending templates:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get trending templates',
                message: error.message
            });
        }
    }
);

/**
 * GET /api/analytics/top
 * Get top performing templates
 */
router.get('/top',
    authenticate,
    [
        query('metric').isIn(['views', 'downloads', 'engagement', 'rating']),
        query('limit').optional().isInt({ min: 1, max: 50 }),
        query('days').optional().isInt({ min: 1, max: 365 })
    ],
    validateRequest,
    async (req: Request, res: Response) => {
        try {
            const service = await getAnalyticsService();
            const limit = parseInt(req.query.limit as string) || 10;
            const days = parseInt(req.query.days as string) || 30;

            const topTemplates = await service.getTopTemplates(
                req.query.metric as any,
                limit,
                days
            );

            res.json({
                success: true,
                data: topTemplates,
                count: topTemplates.length,
                metric: req.query.metric,
                dateRange: `Last ${days} days`
            });

        } catch (error: any) {
            console.error('Error getting top templates:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get top templates',
                message: error.message
            });
        }
    }
);

/**
 * GET /api/analytics/engagement
 * Get user engagement metrics
 */
router.get('/engagement',
    authenticate,
    [
        query('startDate').isDate(),
        query('endDate').isDate()
    ],
    validateRequest,
    async (req: Request, res: Response) => {
        try {
            const service = await getAnalyticsService();

            const engagement = await service.getUserEngagement(
                req.user!.userId,
                req.query.startDate as string,
                req.query.endDate as string
            );

            res.json({
                success: true,
                data: engagement,
                count: engagement.length
            });

        } catch (error: any) {
            console.error('Error getting user engagement:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get user engagement',
                message: error.message
            });
        }
    }
);

/**
 * GET /api/analytics/export
 * Export analytics data to CSV
 */
router.get('/export',
    authenticate,
    requirePermission('analytics', 'export'),
    [
        query('startDate').isDate(),
        query('endDate').isDate(),
        query('metricTypes').optional().isString()
    ],
    validateRequest,
    async (req: Request, res: Response) => {
        try {
            const service = await getAnalyticsService();

            const metricTypes = req.query.metricTypes
                ? (req.query.metricTypes as string).split(',')
                : undefined;

            const csv = await service.exportAnalyticsCSV(
                req.user!.userId,
                req.query.startDate as string,
                req.query.endDate as string,
                metricTypes
            );

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="analytics-${Date.now()}.csv"`);
            res.send(csv);

        } catch (error: any) {
            console.error('Error exporting analytics:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to export analytics',
                message: error.message
            });
        }
    }
);

/**
 * GET /api/analytics/active-users
 * Get active users count (admin only)
 */
router.get('/active-users',
    authenticate,
    requirePermission('analytics', 'view:all'),
    [
        query('days').optional().isInt({ min: 1, max: 365 })
    ],
    validateRequest,
    async (req: Request, res: Response) => {
        try {
            const service = await getAnalyticsService();
            const days = parseInt(req.query.days as string) || 30;

            const activeUsers = await service.getActiveUsersCount(days);

            res.json({
                success: true,
                data: {
                    activeUsers,
                    period: `Last ${days} days`
                }
            });

        } catch (error: any) {
            console.error('Error getting active users:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get active users count',
                message: error.message
            });
        }
    }
);

export default router;
