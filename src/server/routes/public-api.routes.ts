import express, { Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { getPublicApiService } from '../services/public-api.service.js';
import { getWebhookService } from '../services/webhook.service.js';

const router = express.Router();
const publicApiService = getPublicApiService();
const webhookService = getWebhookService();

// =====================================================================================
// Middleware
// =====================================================================================

/**
 * Validation error handler
 */
const handleValidation = (req: Request, res: Response, next: Function) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }
    next();
};

/**
 * Extract user ID from request (assumes authentication middleware)
 */
const getUserId = (req: Request): string => {
    return (req as any).user?.id || (req as any).userId;
};

// =====================================================================================
// API KEY ROUTES
// =====================================================================================

/**
 * Create API key
 * POST /api/public-api/keys
 */
router.post(
    '/keys',
    [
        body('key_name').isString().isLength({ min: 1, max: 200 }).withMessage('Key name is required'),
        body('key_type').optional().isIn(['standard', 'restricted', 'admin']).withMessage('Invalid key type'),
        body('scopes').optional().isArray().withMessage('Scopes must be an array'),
        body('rate_limit_per_minute').optional().isInt({ min: 1 }).withMessage('Invalid rate limit'),
        body('rate_limit_per_hour').optional().isInt({ min: 1 }).withMessage('Invalid rate limit'),
        body('rate_limit_per_day').optional().isInt({ min: 1 }).withMessage('Invalid rate limit'),
        body('allowed_ips').optional().isArray().withMessage('Allowed IPs must be an array'),
        body('allowed_origins').optional().isArray().withMessage('Allowed origins must be an array'),
        body('expires_at').optional().isISO8601().withMessage('Invalid expiration date')
    ],
    handleValidation,
    async (req: Request, res: Response) => {
        try {
            const userId = getUserId(req);
            const result = await publicApiService.createApiKey({
                user_id: userId,
                ...req.body
            });

            res.status(201).json({
                success: true,
                data: {
                    api_key: result.apiKey,
                    plain_key: result.plainKey,
                    message: 'API key created successfully. Store the plain key securely - it will not be shown again.'
                }
            });
        } catch (error: any) {
            console.error('Error creating API key:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }
);

/**
 * Get all API keys for user
 * GET /api/public-api/keys
 */
router.get('/keys', async (req: Request, res: Response) => {
    try {
        const userId = getUserId(req);
        const keys = await publicApiService.getUserApiKeys(userId);

        res.json({
            success: true,
            data: keys
        });
    } catch (error: any) {
        console.error('Error fetching API keys:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Get API key by ID
 * GET /api/public-api/keys/:id
 */
router.get(
    '/keys/:id',
    [param('id').isUUID().withMessage('Invalid API key ID')],
    handleValidation,
    async (req: Request, res: Response) => {
        try {
            const userId = getUserId(req);
            const key = await publicApiService.getApiKeyById(req.params.id, userId);

            if (!key) {
                return res.status(404).json({ success: false, error: 'API key not found' });
            }

            res.json({
                success: true,
                data: key
            });
        } catch (error: any) {
            console.error('Error fetching API key:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }
);

/**
 * Update API key
 * PUT /api/public-api/keys/:id
 */
router.put(
    '/keys/:id',
    [
        param('id').isUUID().withMessage('Invalid API key ID'),
        body('key_name').optional().isString().isLength({ min: 1, max: 200 }),
        body('scopes').optional().isArray(),
        body('rate_limit_per_minute').optional().isInt({ min: 1 }),
        body('rate_limit_per_hour').optional().isInt({ min: 1 }),
        body('rate_limit_per_day').optional().isInt({ min: 1 }),
        body('allowed_ips').optional().isArray(),
        body('allowed_origins').optional().isArray(),
        body('expires_at').optional().isISO8601()
    ],
    handleValidation,
    async (req: Request, res: Response) => {
        try {
            const userId = getUserId(req);
            const key = await publicApiService.updateApiKey(req.params.id, userId, req.body);

            res.json({
                success: true,
                data: key
            });
        } catch (error: any) {
            console.error('Error updating API key:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }
);

/**
 * Revoke API key
 * POST /api/public-api/keys/:id/revoke
 */
router.post(
    '/keys/:id/revoke',
    [
        param('id').isUUID().withMessage('Invalid API key ID'),
        body('reason').optional().isString()
    ],
    handleValidation,
    async (req: Request, res: Response) => {
        try {
            const userId = getUserId(req);
            await publicApiService.revokeApiKey(req.params.id, userId, req.body.reason);

            res.json({
                success: true,
                message: 'API key revoked successfully'
            });
        } catch (error: any) {
            console.error('Error revoking API key:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }
);

/**
 * Get API key statistics
 * GET /api/public-api/keys/:id/statistics
 */
router.get(
    '/keys/:id/statistics',
    [
        param('id').isUUID().withMessage('Invalid API key ID'),
        query('start_date').optional().isISO8601(),
        query('end_date').optional().isISO8601()
    ],
    handleValidation,
    async (req: Request, res: Response) => {
        try {
            const userId = getUserId(req);

            // Verify ownership
            const key = await publicApiService.getApiKeyById(req.params.id, userId);
            if (!key) {
                return res.status(404).json({ success: false, error: 'API key not found' });
            }

            const startDate = req.query.start_date ? new Date(req.query.start_date as string) : undefined;
            const endDate = req.query.end_date ? new Date(req.query.end_date as string) : undefined;

            const stats = await publicApiService.getApiKeyStatistics(req.params.id, startDate, endDate);

            res.json({
                success: true,
                data: stats
            });
        } catch (error: any) {
            console.error('Error fetching API key statistics:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }
);

/**
 * Get API key usage logs
 * GET /api/public-api/keys/:id/logs
 */
router.get(
    '/keys/:id/logs',
    [
        param('id').isUUID().withMessage('Invalid API key ID'),
        query('limit').optional().isInt({ min: 1, max: 1000 }),
        query('offset').optional().isInt({ min: 0 })
    ],
    handleValidation,
    async (req: Request, res: Response) => {
        try {
            const userId = getUserId(req);

            // Verify ownership
            const key = await publicApiService.getApiKeyById(req.params.id, userId);
            if (!key) {
                return res.status(404).json({ success: false, error: 'API key not found' });
            }

            const limit = parseInt(req.query.limit as string) || 100;
            const offset = parseInt(req.query.offset as string) || 0;

            const logs = await publicApiService.getUsageLogs(req.params.id, limit, offset);

            res.json({
                success: true,
                data: logs,
                pagination: {
                    limit,
                    offset
                }
            });
        } catch (error: any) {
            console.error('Error fetching usage logs:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }
);

// =====================================================================================
// WEBHOOK ROUTES
// =====================================================================================

/**
 * Create webhook
 * POST /api/public-api/webhooks
 */
router.post(
    '/webhooks',
    [
        body('webhook_name').isString().isLength({ min: 1, max: 200 }).withMessage('Webhook name is required'),
        body('url').isURL().withMessage('Valid URL is required'),
        body('events').isArray({ min: 1 }).withMessage('At least one event is required'),
        body('max_retries').optional().isInt({ min: 0, max: 10 }),
        body('retry_delay_seconds').optional().isInt({ min: 10, max: 3600 }),
        body('timeout_seconds').optional().isInt({ min: 5, max: 300 }),
        body('http_method').optional().isIn(['POST', 'PUT', 'PATCH'])
    ],
    handleValidation,
    async (req: Request, res: Response) => {
        try {
            const userId = getUserId(req);
            const webhook = await webhookService.createWebhook({
                user_id: userId,
                ...req.body
            });

            res.status(201).json({
                success: true,
                data: webhook
            });
        } catch (error: any) {
            console.error('Error creating webhook:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }
);

/**
 * Get all webhooks for user
 * GET /api/public-api/webhooks
 */
router.get('/webhooks', async (req: Request, res: Response) => {
    try {
        const userId = getUserId(req);
        const webhooks = await webhookService.getUserWebhooks(userId);

        res.json({
            success: true,
            data: webhooks
        });
    } catch (error: any) {
        console.error('Error fetching webhooks:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * Get webhook by ID
 * GET /api/public-api/webhooks/:id
 */
router.get(
    '/webhooks/:id',
    [param('id').isUUID().withMessage('Invalid webhook ID')],
    handleValidation,
    async (req: Request, res: Response) => {
        try {
            const userId = getUserId(req);
            const webhook = await webhookService.getWebhookById(req.params.id, userId);

            if (!webhook) {
                return res.status(404).json({ success: false, error: 'Webhook not found' });
            }

            res.json({
                success: true,
                data: webhook
            });
        } catch (error: any) {
            console.error('Error fetching webhook:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }
);

/**
 * Update webhook
 * PUT /api/public-api/webhooks/:id
 */
router.put(
    '/webhooks/:id',
    [
        param('id').isUUID().withMessage('Invalid webhook ID'),
        body('webhook_name').optional().isString().isLength({ min: 1, max: 200 }),
        body('url').optional().isURL(),
        body('events').optional().isArray({ min: 1 }),
        body('max_retries').optional().isInt({ min: 0, max: 10 }),
        body('retry_delay_seconds').optional().isInt({ min: 10, max: 3600 }),
        body('timeout_seconds').optional().isInt({ min: 5, max: 300 }),
        body('http_method').optional().isIn(['POST', 'PUT', 'PATCH'])
    ],
    handleValidation,
    async (req: Request, res: Response) => {
        try {
            const userId = getUserId(req);
            const webhook = await webhookService.updateWebhook(req.params.id, userId, req.body);

            res.json({
                success: true,
                data: webhook
            });
        } catch (error: any) {
            console.error('Error updating webhook:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }
);

/**
 * Delete webhook
 * DELETE /api/public-api/webhooks/:id
 */
router.delete(
    '/webhooks/:id',
    [param('id').isUUID().withMessage('Invalid webhook ID')],
    handleValidation,
    async (req: Request, res: Response) => {
        try {
            const userId = getUserId(req);
            await webhookService.deleteWebhook(req.params.id, userId);

            res.json({
                success: true,
                message: 'Webhook deleted successfully'
            });
        } catch (error: any) {
            console.error('Error deleting webhook:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }
);

/**
 * Enable webhook
 * POST /api/public-api/webhooks/:id/enable
 */
router.post(
    '/webhooks/:id/enable',
    [param('id').isUUID().withMessage('Invalid webhook ID')],
    handleValidation,
    async (req: Request, res: Response) => {
        try {
            const userId = getUserId(req);
            await webhookService.setWebhookStatus(req.params.id, userId, 'active');

            res.json({
                success: true,
                message: 'Webhook enabled successfully'
            });
        } catch (error: any) {
            console.error('Error enabling webhook:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }
);

/**
 * Disable webhook
 * POST /api/public-api/webhooks/:id/disable
 */
router.post(
    '/webhooks/:id/disable',
    [param('id').isUUID().withMessage('Invalid webhook ID')],
    handleValidation,
    async (req: Request, res: Response) => {
        try {
            const userId = getUserId(req);
            await webhookService.setWebhookStatus(req.params.id, userId, 'disabled');

            res.json({
                success: true,
                message: 'Webhook disabled successfully'
            });
        } catch (error: any) {
            console.error('Error disabling webhook:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }
);

/**
 * Get webhook deliveries
 * GET /api/public-api/webhooks/:id/deliveries
 */
router.get(
    '/webhooks/:id/deliveries',
    [
        param('id').isUUID().withMessage('Invalid webhook ID'),
        query('limit').optional().isInt({ min: 1, max: 500 }),
        query('offset').optional().isInt({ min: 0 })
    ],
    handleValidation,
    async (req: Request, res: Response) => {
        try {
            const userId = getUserId(req);
            const limit = parseInt(req.query.limit as string) || 50;
            const offset = parseInt(req.query.offset as string) || 0;

            const deliveries = await webhookService.getWebhookDeliveries(
                req.params.id,
                userId,
                limit,
                offset
            );

            res.json({
                success: true,
                data: deliveries,
                pagination: {
                    limit,
                    offset
                }
            });
        } catch (error: any) {
            console.error('Error fetching webhook deliveries:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }
);

/**
 * Retry webhook delivery
 * POST /api/public-api/webhooks/:webhookId/deliveries/:deliveryId/retry
 */
router.post(
    '/webhooks/:webhookId/deliveries/:deliveryId/retry',
    [
        param('webhookId').isUUID().withMessage('Invalid webhook ID'),
        param('deliveryId').isUUID().withMessage('Invalid delivery ID')
    ],
    handleValidation,
    async (req: Request, res: Response) => {
        try {
            const userId = getUserId(req);
            await webhookService.retryDelivery(
                req.params.deliveryId,
                req.params.webhookId,
                userId
            );

            res.json({
                success: true,
                message: 'Webhook delivery retry scheduled'
            });
        } catch (error: any) {
            console.error('Error retrying webhook delivery:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }
);

/**
 * Trigger webhook event (for testing)
 * POST /api/public-api/webhooks/trigger
 */
router.post(
    '/webhooks/trigger',
    [
        body('event_type').isString().withMessage('Event type is required'),
        body('resource_type').isString().withMessage('Resource type is required'),
        body('payload').isObject().withMessage('Payload is required')
    ],
    handleValidation,
    async (req: Request, res: Response) => {
        try {
            const userId = getUserId(req);
            const eventId = await webhookService.triggerEvent({
                user_id: userId,
                event_type: req.body.event_type,
                resource_type: req.body.resource_type,
                resource_id: req.body.resource_id,
                payload: req.body.payload,
                metadata: req.body.metadata
            });

            res.json({
                success: true,
                data: { event_id: eventId },
                message: 'Webhook event triggered successfully'
            });
        } catch (error: any) {
            console.error('Error triggering webhook event:', error);
            res.status(500).json({ success: false, error: error.message });
        }
    }
);

export default router;
