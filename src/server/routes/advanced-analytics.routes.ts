/**
 * Advanced Analytics Routes
 *
 * REST API endpoints for advanced analytics, funnel analysis, A/B testing, and custom dashboards
 */

import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/rbac.middleware.js';
import { getAdvancedAnalyticsService } from '../services/advanced-analytics.service.js';
import { param, body, query, validationResult } from 'express-validator';

const router = Router();

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

const handleValidationErrors = (req: Request, res: Response): boolean => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        res.status(400).json({
            success: false,
            error: 'Validation failed',
            details: errors.array()
        });
        return true;
    }
    return false;
};

// ============================================================================
// EVENT TRACKING ROUTES
// ============================================================================

/**
 * POST /api/advanced-analytics/events
 * Track an analytics event
 */
router.post(
    '/events',
    [
        body('session_id').isString(),
        body('event_type').isString(),
        body('event_category').isString(),
        body('event_action').isString(),
        body('event_label').optional().isString(),
        body('event_value').optional().isNumeric(),
        body('template_id').optional().isUUID(),
        body('user_id').optional().isUUID(),
        body('metadata').optional().isObject()
    ],
    async (req: Request, res: Response) => {
        if (handleValidationErrors(req, res)) return;

        try {
            const service = getAdvancedAnalyticsService();

            const eventId = await service.trackEvent({
                ...req.body,
                user_id: req.body.user_id || (req.user?.id)
            });

            res.status(201).json({
                success: true,
                data: { event_id: eventId }
            });

        } catch (error: any) {
            console.error('Error tracking event:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to track event'
            });
        }
    }
);

/**
 * GET /api/advanced-analytics/events
 * Get events with filters
 */
router.get(
    '/events',
    authenticate,
    requirePermission('analytics.view'),
    [
        query('user_id').optional().isUUID(),
        query('session_id').optional().isString(),
        query('event_type').optional().isString(),
        query('event_category').optional().isString(),
        query('template_id').optional().isUUID(),
        query('start_date').optional().isISO8601(),
        query('end_date').optional().isISO8601(),
        query('limit').optional().isInt({ min: 1, max: 1000 }),
        query('offset').optional().isInt({ min: 0 })
    ],
    async (req: Request, res: Response) => {
        if (handleValidationErrors(req, res)) return;

        try {
            const service = getAdvancedAnalyticsService();

            const result = await service.getEvents({
                user_id: req.query.user_id as string,
                session_id: req.query.session_id as string,
                event_type: req.query.event_type as string,
                event_category: req.query.event_category as string,
                template_id: req.query.template_id as string,
                start_date: req.query.start_date ? new Date(req.query.start_date as string) : undefined,
                end_date: req.query.end_date ? new Date(req.query.end_date as string) : undefined,
                limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
                offset: req.query.offset ? parseInt(req.query.offset as string) : undefined
            });

            res.json({
                success: true,
                data: result.events,
                pagination: {
                    total: result.total,
                    limit: req.query.limit ? parseInt(req.query.limit as string) : 100,
                    offset: req.query.offset ? parseInt(req.query.offset as string) : 0
                }
            });

        } catch (error: any) {
            console.error('Error getting events:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to get events'
            });
        }
    }
);

// ============================================================================
// FUNNEL ANALYSIS ROUTES
// ============================================================================

/**
 * POST /api/advanced-analytics/funnels
 * Create a funnel
 */
router.post(
    '/funnels',
    authenticate,
    requirePermission('analytics.manage'),
    [
        body('funnel_name').isString().trim().isLength({ min: 1, max: 200 }),
        body('funnel_description').optional().isString(),
        body('steps').isArray({ min: 1 }),
        body('steps.*.step').isInt({ min: 1 }),
        body('steps.*.name').isString(),
        body('steps.*.event_type').isString(),
        body('steps.*.required').isBoolean()
    ],
    async (req: Request, res: Response) => {
        if (handleValidationErrors(req, res)) return;

        try {
            const service = getAdvancedAnalyticsService();

            const funnel = await service.createFunnel({
                funnel_name: req.body.funnel_name,
                funnel_description: req.body.funnel_description,
                steps: req.body.steps,
                created_by: req.user!.id
            });

            res.status(201).json({
                success: true,
                data: funnel
            });

        } catch (error: any) {
            console.error('Error creating funnel:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to create funnel'
            });
        }
    }
);

/**
 * GET /api/advanced-analytics/funnels
 * Get all funnels
 */
router.get(
    '/funnels',
    authenticate,
    requirePermission('analytics.view'),
    [
        query('active_only').optional().isBoolean()
    ],
    async (req: Request, res: Response) => {
        if (handleValidationErrors(req, res)) return;

        try {
            const service = getAdvancedAnalyticsService();

            const funnels = await service.getFunnels(
                req.query.active_only === 'true'
            );

            res.json({
                success: true,
                data: funnels
            });

        } catch (error: any) {
            console.error('Error getting funnels:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to get funnels'
            });
        }
    }
);

/**
 * GET /api/advanced-analytics/funnels/:id/conversion-rates
 * Get funnel conversion rates
 */
router.get(
    '/funnels/:id/conversion-rates',
    authenticate,
    requirePermission('analytics.view'),
    [
        param('id').isUUID(),
        query('start_date').isISO8601(),
        query('end_date').isISO8601()
    ],
    async (req: Request, res: Response) => {
        if (handleValidationErrors(req, res)) return;

        try {
            const service = getAdvancedAnalyticsService();

            const rates = await service.getFunnelConversionRates(
                req.params.id,
                new Date(req.query.start_date as string),
                new Date(req.query.end_date as string)
            );

            res.json({
                success: true,
                data: rates
            });

        } catch (error: any) {
            console.error('Error getting funnel conversion rates:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to get funnel conversion rates'
            });
        }
    }
);

// ============================================================================
// TEMPLATE PERFORMANCE ROUTES
// ============================================================================

/**
 * POST /api/advanced-analytics/templates/performance
 * Get template performance comparison
 */
router.post(
    '/templates/performance',
    authenticate,
    requirePermission('analytics.view'),
    [
        body('template_ids').isArray({ min: 1 }),
        body('template_ids.*').isUUID(),
        body('start_date').isISO8601(),
        body('end_date').isISO8601()
    ],
    async (req: Request, res: Response) => {
        if (handleValidationErrors(req, res)) return;

        try {
            const service = getAdvancedAnalyticsService();

            const performance = await service.getTemplatePerformanceComparison(
                req.body.template_ids,
                new Date(req.body.start_date),
                new Date(req.body.end_date)
            );

            res.json({
                success: true,
                data: performance
            });

        } catch (error: any) {
            console.error('Error getting template performance:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to get template performance'
            });
        }
    }
);

// ============================================================================
// USER ENGAGEMENT ROUTES
// ============================================================================

/**
 * GET /api/advanced-analytics/users/:userId/engagement
 * Get user engagement metrics
 */
router.get(
    '/users/:userId/engagement',
    authenticate,
    requirePermission('analytics.view'),
    [
        param('userId').isUUID(),
        query('start_date').isISO8601(),
        query('end_date').isISO8601()
    ],
    async (req: Request, res: Response) => {
        if (handleValidationErrors(req, res)) return;

        try {
            const service = getAdvancedAnalyticsService();

            const metrics = await service.getUserEngagementMetrics(
                req.params.userId,
                new Date(req.query.start_date as string),
                new Date(req.query.end_date as string)
            );

            res.json({
                success: true,
                data: metrics
            });

        } catch (error: any) {
            console.error('Error getting user engagement:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to get user engagement'
            });
        }
    }
);

/**
 * GET /api/advanced-analytics/users/:userId/sessions
 * Get user behavior sessions
 */
router.get(
    '/users/:userId/sessions',
    authenticate,
    requirePermission('analytics.view'),
    [
        param('userId').isUUID(),
        query('limit').optional().isInt({ min: 1, max: 100 })
    ],
    async (req: Request, res: Response) => {
        if (handleValidationErrors(req, res)) return;

        try {
            const service = getAdvancedAnalyticsService();

            const sessions = await service.getUserBehaviorSessions(
                req.params.userId,
                req.query.limit ? parseInt(req.query.limit as string) : 50
            );

            res.json({
                success: true,
                data: sessions
            });

        } catch (error: any) {
            console.error('Error getting user sessions:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to get user sessions'
            });
        }
    }
);

// ============================================================================
// A/B TESTING ROUTES
// ============================================================================

/**
 * POST /api/advanced-analytics/ab-tests
 * Create an A/B test experiment
 */
router.post(
    '/ab-tests',
    authenticate,
    requirePermission('analytics.manage'),
    [
        body('name').isString().trim().isLength({ min: 1, max: 200 }),
        body('description').optional().isString(),
        body('hypothesis').optional().isString(),
        body('experiment_type').isString(),
        body('variants').isArray({ min: 2 }),
        body('variants.*.name').isString(),
        body('variants.*.config').isObject(),
        body('traffic_allocation').optional().isObject(),
        body('target_audience').optional().isObject(),
        body('sample_size_target').optional().isInt({ min: 1 }),
        body('start_date').optional().isISO8601(),
        body('end_date').optional().isISO8601()
    ],
    async (req: Request, res: Response) => {
        if (handleValidationErrors(req, res)) return;

        try {
            const service = getAdvancedAnalyticsService();

            const experiment = await service.createABTest({
                name: req.body.name,
                description: req.body.description,
                hypothesis: req.body.hypothesis,
                experiment_type: req.body.experiment_type,
                variants: req.body.variants,
                traffic_allocation: req.body.traffic_allocation,
                target_audience: req.body.target_audience,
                sample_size_target: req.body.sample_size_target,
                start_date: req.body.start_date ? new Date(req.body.start_date) : undefined,
                end_date: req.body.end_date ? new Date(req.body.end_date) : undefined,
                created_by: req.user!.id
            });

            res.status(201).json({
                success: true,
                data: experiment
            });

        } catch (error: any) {
            console.error('Error creating A/B test:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to create A/B test'
            });
        }
    }
);

/**
 * GET /api/advanced-analytics/ab-tests
 * Get A/B test experiments
 */
router.get(
    '/ab-tests',
    authenticate,
    requirePermission('analytics.view'),
    [
        query('status').optional().isIn(['draft', 'running', 'paused', 'completed']),
        query('experiment_type').optional().isString()
    ],
    async (req: Request, res: Response) => {
        if (handleValidationErrors(req, res)) return;

        try {
            const service = getAdvancedAnalyticsService();

            const experiments = await service.getABTests({
                status: req.query.status as string,
                experiment_type: req.query.experiment_type as string
            });

            res.json({
                success: true,
                data: experiments
            });

        } catch (error: any) {
            console.error('Error getting A/B tests:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to get A/B tests'
            });
        }
    }
);

/**
 * POST /api/advanced-analytics/ab-tests/:id/start
 * Start an A/B test
 */
router.post(
    '/ab-tests/:id/start',
    authenticate,
    requirePermission('analytics.manage'),
    [
        param('id').isUUID()
    ],
    async (req: Request, res: Response) => {
        if (handleValidationErrors(req, res)) return;

        try {
            const service = getAdvancedAnalyticsService();

            await service.startABTest(req.params.id, req.user!.id);

            res.json({
                success: true,
                message: 'A/B test started successfully'
            });

        } catch (error: any) {
            console.error('Error starting A/B test:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to start A/B test'
            });
        }
    }
);

/**
 * POST /api/advanced-analytics/ab-tests/:id/assign
 * Assign user to variant
 */
router.post(
    '/ab-tests/:id/assign',
    [
        param('id').isUUID(),
        body('user_id').isUUID(),
        body('session_id').isString()
    ],
    async (req: Request, res: Response) => {
        if (handleValidationErrors(req, res)) return;

        try {
            const service = getAdvancedAnalyticsService();

            const variant = await service.assignToVariant(
                req.params.id,
                req.body.user_id,
                req.body.session_id
            );

            res.json({
                success: true,
                data: { variant }
            });

        } catch (error: any) {
            console.error('Error assigning to variant:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to assign to variant'
            });
        }
    }
);

/**
 * POST /api/advanced-analytics/ab-tests/:id/convert
 * Record A/B test conversion
 */
router.post(
    '/ab-tests/:id/convert',
    [
        param('id').isUUID(),
        body('user_id').isUUID(),
        body('conversion_type').isString(),
        body('conversion_value').optional().isNumeric()
    ],
    async (req: Request, res: Response) => {
        if (handleValidationErrors(req, res)) return;

        try {
            const service = getAdvancedAnalyticsService();

            await service.recordABTestConversion(
                req.params.id,
                req.body.user_id,
                req.body.conversion_type,
                req.body.conversion_value
            );

            res.json({
                success: true,
                message: 'Conversion recorded successfully'
            });

        } catch (error: any) {
            console.error('Error recording conversion:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to record conversion'
            });
        }
    }
);

/**
 * GET /api/advanced-analytics/ab-tests/:id/significance
 * Get A/B test statistical significance
 */
router.get(
    '/ab-tests/:id/significance',
    authenticate,
    requirePermission('analytics.view'),
    [
        param('id').isUUID()
    ],
    async (req: Request, res: Response) => {
        if (handleValidationErrors(req, res)) return;

        try {
            const service = getAdvancedAnalyticsService();

            const significance = await service.getABTestSignificance(req.params.id);

            res.json({
                success: true,
                data: significance
            });

        } catch (error: any) {
            console.error('Error getting A/B test significance:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to get A/B test significance'
            });
        }
    }
);

// ============================================================================
// CUSTOM DASHBOARDS ROUTES
// ============================================================================

/**
 * POST /api/advanced-analytics/dashboards
 * Create a custom dashboard
 */
router.post(
    '/dashboards',
    authenticate,
    requirePermission('analytics.manage'),
    [
        body('name').isString().trim().isLength({ min: 1, max: 200 }),
        body('description').optional().isString(),
        body('team_id').optional().isUUID(),
        body('layout').isObject(),
        body('widgets').isArray(),
        body('filters').optional().isObject(),
        body('is_public').optional().isBoolean()
    ],
    async (req: Request, res: Response) => {
        if (handleValidationErrors(req, res)) return;

        try {
            const service = getAdvancedAnalyticsService();

            const dashboard = await service.createDashboard({
                user_id: req.user!.id,
                team_id: req.body.team_id,
                name: req.body.name,
                description: req.body.description,
                layout: req.body.layout,
                widgets: req.body.widgets,
                filters: req.body.filters,
                is_public: req.body.is_public
            });

            res.status(201).json({
                success: true,
                data: dashboard
            });

        } catch (error: any) {
            console.error('Error creating dashboard:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to create dashboard'
            });
        }
    }
);

/**
 * GET /api/advanced-analytics/dashboards
 * Get user dashboards
 */
router.get(
    '/dashboards',
    authenticate,
    async (req: Request, res: Response) => {
        try {
            const service = getAdvancedAnalyticsService();

            const dashboards = await service.getUserDashboards(req.user!.id);

            res.json({
                success: true,
                data: dashboards
            });

        } catch (error: any) {
            console.error('Error getting dashboards:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to get dashboards'
            });
        }
    }
);

/**
 * PUT /api/advanced-analytics/dashboards/:id
 * Update a dashboard
 */
router.put(
    '/dashboards/:id',
    authenticate,
    requirePermission('analytics.manage'),
    [
        param('id').isUUID(),
        body('name').optional().isString().trim().isLength({ min: 1, max: 200 }),
        body('description').optional().isString(),
        body('layout').optional().isObject(),
        body('widgets').optional().isArray(),
        body('filters').optional().isObject(),
        body('is_public').optional().isBoolean()
    ],
    async (req: Request, res: Response) => {
        if (handleValidationErrors(req, res)) return;

        try {
            const service = getAdvancedAnalyticsService();

            const dashboard = await service.updateDashboard(
                req.params.id,
                req.user!.id,
                req.body
            );

            res.json({
                success: true,
                data: dashboard
            });

        } catch (error: any) {
            console.error('Error updating dashboard:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to update dashboard'
            });
        }
    }
);

/**
 * DELETE /api/advanced-analytics/dashboards/:id
 * Delete a dashboard
 */
router.delete(
    '/dashboards/:id',
    authenticate,
    requirePermission('analytics.manage'),
    [
        param('id').isUUID()
    ],
    async (req: Request, res: Response) => {
        if (handleValidationErrors(req, res)) return;

        try {
            const service = getAdvancedAnalyticsService();

            await service.deleteDashboard(req.params.id, req.user!.id);

            res.json({
                success: true,
                message: 'Dashboard deleted successfully'
            });

        } catch (error: any) {
            console.error('Error deleting dashboard:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to delete dashboard'
            });
        }
    }
);

export default router;
