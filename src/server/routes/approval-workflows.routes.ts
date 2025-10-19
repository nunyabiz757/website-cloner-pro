/**
 * Approval Workflows Routes
 *
 * REST API endpoints for template approval workflows
 */

import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/rbac.middleware.js';
import { getApprovalWorkflowsService } from '../services/approval-workflows.service.js';
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
// WORKFLOW MANAGEMENT ROUTES
// ============================================================================

/**
 * POST /api/workflows
 * Create a new approval workflow
 */
router.post(
    '/',
    authenticate,
    requirePermission('workflows.create'),
    [
        body('name').isString().trim().isLength({ min: 1, max: 200 }),
        body('description').optional().isString().trim(),
        body('team_id').optional().isUUID(),
        body('steps').isArray({ min: 1 }),
        body('steps.*.step').isInt({ min: 1 }),
        body('steps.*.name').isString().trim().isLength({ min: 1, max: 200 }),
        body('steps.*.reviewers').isArray({ min: 1 }),
        body('steps.*.reviewers.*').isUUID(),
        body('steps.*.approvals_required').isInt({ min: 1 }),
        body('steps.*.auto_approve').optional().isBoolean(),
        body('require_all_steps').optional().isBoolean(),
        body('allow_skip_steps').optional().isBoolean(),
        body('auto_publish_on_approval').optional().isBoolean(),
        body('is_active').optional().isBoolean(),
        body('is_default').optional().isBoolean()
    ],
    async (req: Request, res: Response) => {
        if (handleValidationErrors(req, res)) return;

        try {
            const service = getApprovalWorkflowsService();

            const workflow = await service.createWorkflow({
                name: req.body.name,
                description: req.body.description,
                team_id: req.body.team_id,
                steps: req.body.steps,
                require_all_steps: req.body.require_all_steps,
                allow_skip_steps: req.body.allow_skip_steps,
                auto_publish_on_approval: req.body.auto_publish_on_approval,
                is_active: req.body.is_active,
                is_default: req.body.is_default,
                created_by: req.user!.id
            });

            res.status(201).json({
                success: true,
                data: workflow
            });

        } catch (error: any) {
            console.error('Error creating workflow:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to create workflow'
            });
        }
    }
);

/**
 * GET /api/workflows
 * Get workflows (for a team or global)
 */
router.get(
    '/',
    authenticate,
    requirePermission('workflows.view'),
    [
        query('team_id').optional().isUUID(),
        query('active_only').optional().isBoolean()
    ],
    async (req: Request, res: Response) => {
        if (handleValidationErrors(req, res)) return;

        try {
            const service = getApprovalWorkflowsService();

            const workflows = await service.getWorkflows(
                req.query.team_id as string | undefined,
                req.query.active_only === 'true'
            );

            res.json({
                success: true,
                data: workflows
            });

        } catch (error: any) {
            console.error('Error getting workflows:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to get workflows'
            });
        }
    }
);

/**
 * GET /api/workflows/default
 * Get default workflow for a team
 */
router.get(
    '/default',
    authenticate,
    requirePermission('workflows.view'),
    [
        query('team_id').optional().isUUID()
    ],
    async (req: Request, res: Response) => {
        if (handleValidationErrors(req, res)) return;

        try {
            const service = getApprovalWorkflowsService();

            const workflow = await service.getDefaultWorkflow(
                req.query.team_id as string | undefined
            );

            if (!workflow) {
                return res.status(404).json({
                    success: false,
                    error: 'No default workflow found'
                });
            }

            res.json({
                success: true,
                data: workflow
            });

        } catch (error: any) {
            console.error('Error getting default workflow:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to get default workflow'
            });
        }
    }
);

/**
 * GET /api/workflows/:id
 * Get a specific workflow
 */
router.get(
    '/:id',
    authenticate,
    requirePermission('workflows.view'),
    [
        param('id').isUUID()
    ],
    async (req: Request, res: Response) => {
        if (handleValidationErrors(req, res)) return;

        try {
            const service = getApprovalWorkflowsService();

            const workflow = await service.getWorkflow(req.params.id, req.user!.id);

            if (!workflow) {
                return res.status(404).json({
                    success: false,
                    error: 'Workflow not found'
                });
            }

            res.json({
                success: true,
                data: workflow
            });

        } catch (error: any) {
            console.error('Error getting workflow:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to get workflow'
            });
        }
    }
);

/**
 * PUT /api/workflows/:id
 * Update a workflow
 */
router.put(
    '/:id',
    authenticate,
    requirePermission('workflows.update'),
    [
        param('id').isUUID(),
        body('name').optional().isString().trim().isLength({ min: 1, max: 200 }),
        body('description').optional().isString().trim(),
        body('steps').optional().isArray({ min: 1 }),
        body('steps.*.step').optional().isInt({ min: 1 }),
        body('steps.*.name').optional().isString().trim().isLength({ min: 1, max: 200 }),
        body('steps.*.reviewers').optional().isArray({ min: 1 }),
        body('steps.*.reviewers.*').optional().isUUID(),
        body('steps.*.approvals_required').optional().isInt({ min: 1 }),
        body('steps.*.auto_approve').optional().isBoolean(),
        body('require_all_steps').optional().isBoolean(),
        body('allow_skip_steps').optional().isBoolean(),
        body('auto_publish_on_approval').optional().isBoolean(),
        body('is_active').optional().isBoolean(),
        body('is_default').optional().isBoolean()
    ],
    async (req: Request, res: Response) => {
        if (handleValidationErrors(req, res)) return;

        try {
            const service = getApprovalWorkflowsService();

            const workflow = await service.updateWorkflow({
                workflow_id: req.params.id,
                user_id: req.user!.id,
                ...req.body
            });

            res.json({
                success: true,
                data: workflow
            });

        } catch (error: any) {
            console.error('Error updating workflow:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to update workflow'
            });
        }
    }
);

/**
 * DELETE /api/workflows/:id
 * Delete a workflow
 */
router.delete(
    '/:id',
    authenticate,
    requirePermission('workflows.delete'),
    [
        param('id').isUUID()
    ],
    async (req: Request, res: Response) => {
        if (handleValidationErrors(req, res)) return;

        try {
            const service = getApprovalWorkflowsService();

            await service.deleteWorkflow(req.params.id, req.user!.id);

            res.json({
                success: true,
                message: 'Workflow deleted successfully'
            });

        } catch (error: any) {
            console.error('Error deleting workflow:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to delete workflow'
            });
        }
    }
);

/**
 * GET /api/workflows/:id/statistics
 * Get workflow statistics
 */
router.get(
    '/:id/statistics',
    authenticate,
    requirePermission('workflows.view'),
    [
        param('id').isUUID()
    ],
    async (req: Request, res: Response) => {
        if (handleValidationErrors(req, res)) return;

        try {
            const service = getApprovalWorkflowsService();

            const stats = await service.getWorkflowStatistics(req.params.id);

            res.json({
                success: true,
                data: stats
            });

        } catch (error: any) {
            console.error('Error getting workflow statistics:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to get workflow statistics'
            });
        }
    }
);

// ============================================================================
// APPROVAL REQUEST ROUTES
// ============================================================================

/**
 * POST /api/workflows/requests
 * Submit a template for approval
 */
router.post(
    '/requests',
    authenticate,
    requirePermission('approvals.submit'),
    [
        body('workflow_id').isUUID(),
        body('template_id').isUUID(),
        body('title').isString().trim().isLength({ min: 1, max: 255 }),
        body('description').optional().isString().trim(),
        body('metadata').optional().isObject()
    ],
    async (req: Request, res: Response) => {
        if (handleValidationErrors(req, res)) return;

        try {
            const service = getApprovalWorkflowsService();

            const request = await service.submitForApproval({
                workflow_id: req.body.workflow_id,
                template_id: req.body.template_id,
                requested_by: req.user!.id,
                title: req.body.title,
                description: req.body.description,
                metadata: req.body.metadata
            });

            res.status(201).json({
                success: true,
                data: request
            });

        } catch (error: any) {
            console.error('Error submitting approval request:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to submit approval request'
            });
        }
    }
);

/**
 * GET /api/workflows/requests
 * Get approval requests (with filters)
 */
router.get(
    '/requests',
    authenticate,
    requirePermission('approvals.view'),
    [
        query('user_id').optional().isUUID(),
        query('template_id').optional().isUUID(),
        query('workflow_id').optional().isUUID(),
        query('status').optional().isIn(['pending', 'in_review', 'approved', 'rejected', 'cancelled']),
        query('limit').optional().isInt({ min: 1, max: 100 }),
        query('offset').optional().isInt({ min: 0 })
    ],
    async (req: Request, res: Response) => {
        if (handleValidationErrors(req, res)) return;

        try {
            const service = getApprovalWorkflowsService();

            const result = await service.getApprovalRequests({
                user_id: req.query.user_id as string | undefined,
                template_id: req.query.template_id as string | undefined,
                workflow_id: req.query.workflow_id as string | undefined,
                status: req.query.status as string | undefined,
                limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
                offset: req.query.offset ? parseInt(req.query.offset as string) : undefined
            });

            res.json({
                success: true,
                data: result.requests,
                pagination: {
                    total: result.total,
                    limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
                    offset: req.query.offset ? parseInt(req.query.offset as string) : 0
                }
            });

        } catch (error: any) {
            console.error('Error getting approval requests:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to get approval requests'
            });
        }
    }
);

/**
 * GET /api/workflows/requests/:id
 * Get a specific approval request
 */
router.get(
    '/requests/:id',
    authenticate,
    requirePermission('approvals.view'),
    [
        param('id').isUUID()
    ],
    async (req: Request, res: Response) => {
        if (handleValidationErrors(req, res)) return;

        try {
            const service = getApprovalWorkflowsService();

            const request = await service.getApprovalRequest(req.params.id, req.user!.id);

            if (!request) {
                return res.status(404).json({
                    success: false,
                    error: 'Approval request not found'
                });
            }

            res.json({
                success: true,
                data: request
            });

        } catch (error: any) {
            console.error('Error getting approval request:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to get approval request'
            });
        }
    }
);

/**
 * PUT /api/workflows/requests/:id/cancel
 * Cancel an approval request
 */
router.put(
    '/requests/:id/cancel',
    authenticate,
    requirePermission('approvals.cancel'),
    [
        param('id').isUUID()
    ],
    async (req: Request, res: Response) => {
        if (handleValidationErrors(req, res)) return;

        try {
            const service = getApprovalWorkflowsService();

            await service.cancelApprovalRequest(req.params.id, req.user!.id);

            res.json({
                success: true,
                message: 'Approval request cancelled successfully'
            });

        } catch (error: any) {
            console.error('Error cancelling approval request:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to cancel approval request'
            });
        }
    }
);

/**
 * GET /api/workflows/requests/:id/reviews
 * Get reviews for an approval request
 */
router.get(
    '/requests/:id/reviews',
    authenticate,
    requirePermission('approvals.view'),
    [
        param('id').isUUID()
    ],
    async (req: Request, res: Response) => {
        if (handleValidationErrors(req, res)) return;

        try {
            const service = getApprovalWorkflowsService();

            const reviews = await service.getReviewsForRequest(req.params.id);

            res.json({
                success: true,
                data: reviews
            });

        } catch (error: any) {
            console.error('Error getting reviews:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to get reviews'
            });
        }
    }
);

// ============================================================================
// REVIEW ROUTES
// ============================================================================

/**
 * POST /api/workflows/reviews/:id/submit
 * Submit a review decision
 */
router.post(
    '/reviews/:id/submit',
    authenticate,
    requirePermission('approvals.review'),
    [
        param('id').isUUID(),
        body('decision').isIn(['approve', 'reject', 'request_changes']),
        body('comments').optional().isString().trim(),
        body('attachments').optional().isArray(),
        body('attachments.*').optional().isString()
    ],
    async (req: Request, res: Response) => {
        if (handleValidationErrors(req, res)) return;

        try {
            const service = getApprovalWorkflowsService();

            await service.submitReview({
                review_id: req.params.id,
                reviewer_id: req.user!.id,
                decision: req.body.decision,
                comments: req.body.comments,
                attachments: req.body.attachments
            });

            res.json({
                success: true,
                message: 'Review submitted successfully'
            });

        } catch (error: any) {
            console.error('Error submitting review:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to submit review'
            });
        }
    }
);

/**
 * GET /api/workflows/reviews/pending
 * Get pending reviews for current user
 */
router.get(
    '/reviews/pending',
    authenticate,
    [
        query('limit').optional().isInt({ min: 1, max: 100 })
    ],
    async (req: Request, res: Response) => {
        if (handleValidationErrors(req, res)) return;

        try {
            const service = getApprovalWorkflowsService();

            const reviews = await service.getPendingReviews(
                req.user!.id,
                req.query.limit ? parseInt(req.query.limit as string) : 50
            );

            res.json({
                success: true,
                data: reviews
            });

        } catch (error: any) {
            console.error('Error getting pending reviews:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to get pending reviews'
            });
        }
    }
);

// ============================================================================
// NOTIFICATION ROUTES
// ============================================================================

/**
 * GET /api/workflows/notifications
 * Get notifications for current user
 */
router.get(
    '/notifications',
    authenticate,
    [
        query('unread_only').optional().isBoolean(),
        query('limit').optional().isInt({ min: 1, max: 100 })
    ],
    async (req: Request, res: Response) => {
        if (handleValidationErrors(req, res)) return;

        try {
            const service = getApprovalWorkflowsService();

            const notifications = await service.getNotifications(
                req.user!.id,
                req.query.unread_only === 'true',
                req.query.limit ? parseInt(req.query.limit as string) : 50
            );

            res.json({
                success: true,
                data: notifications
            });

        } catch (error: any) {
            console.error('Error getting notifications:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to get notifications'
            });
        }
    }
);

/**
 * PUT /api/workflows/notifications/:id/read
 * Mark notification as read
 */
router.put(
    '/notifications/:id/read',
    authenticate,
    [
        param('id').isUUID()
    ],
    async (req: Request, res: Response) => {
        if (handleValidationErrors(req, res)) return;

        try {
            const service = getApprovalWorkflowsService();

            await service.markNotificationRead(req.params.id, req.user!.id);

            res.json({
                success: true,
                message: 'Notification marked as read'
            });

        } catch (error: any) {
            console.error('Error marking notification as read:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to mark notification as read'
            });
        }
    }
);

/**
 * PUT /api/workflows/notifications/read-all
 * Mark all notifications as read
 */
router.put(
    '/notifications/read-all',
    authenticate,
    async (req: Request, res: Response) => {
        try {
            const service = getApprovalWorkflowsService();

            await service.markAllNotificationsRead(req.user!.id);

            res.json({
                success: true,
                message: 'All notifications marked as read'
            });

        } catch (error: any) {
            console.error('Error marking all notifications as read:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to mark all notifications as read'
            });
        }
    }
);

export default router;
