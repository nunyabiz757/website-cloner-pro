import express, { Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { getBulkOperationsService } from '../services/bulk-operations.service.js';

const router = express.Router();

// =====================================================================================
// Bulk Operations Routes
// =====================================================================================

/**
 * Create bulk operation
 * POST /api/phase4b/bulk-operations
 */
router.post('/bulk-operations', [
    body('operation_type').isIn(['clone', 'export', 'delete', 'update', 'import']),
    body('resource_type').isIn(['templates', 'clones', 'pages']),
    body('items').isArray({ min: 1 }),
    body('options').optional().isObject()
], async (req: Request, res: Response) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const userId = (req as any).user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized'
            });
        }

        const service = getBulkOperationsService();
        const operation = await service.createBulkOperation({
            ...req.body,
            user_id: userId
        });

        res.status(201).json({
            success: true,
            data: operation
        });
    } catch (error: any) {
        console.error('Error creating bulk operation:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Get bulk operation by ID
 * GET /api/phase4b/bulk-operations/:id
 */
router.get('/bulk-operations/:id', [
    param('id').isUUID()
], async (req: Request, res: Response) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const userId = (req as any).user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized'
            });
        }

        const service = getBulkOperationsService();
        const operation = await service.getBulkOperationById(req.params.id, userId);

        if (!operation) {
            return res.status(404).json({
                success: false,
                error: 'Operation not found'
            });
        }

        res.json({
            success: true,
            data: operation
        });
    } catch (error: any) {
        console.error('Error fetching bulk operation:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Get user's bulk operations
 * GET /api/phase4b/bulk-operations
 */
router.get('/bulk-operations', [
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('offset').optional().isInt({ min: 0 })
], async (req: Request, res: Response) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const userId = (req as any).user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized'
            });
        }

        const limit = parseInt(req.query.limit as string) || 50;
        const offset = parseInt(req.query.offset as string) || 0;

        const service = getBulkOperationsService();
        const operations = await service.getUserBulkOperations(userId, limit, offset);

        res.json({
            success: true,
            data: operations
        });
    } catch (error: any) {
        console.error('Error fetching bulk operations:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Get operation progress
 * GET /api/phase4b/bulk-operations/:id/progress
 */
router.get('/bulk-operations/:id/progress', [
    param('id').isUUID()
], async (req: Request, res: Response) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const userId = (req as any).user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized'
            });
        }

        const service = getBulkOperationsService();
        const progress = await service.getOperationProgress(req.params.id, userId);

        if (!progress) {
            return res.status(404).json({
                success: false,
                error: 'Operation not found'
            });
        }

        res.json({
            success: true,
            data: progress
        });
    } catch (error: any) {
        console.error('Error fetching operation progress:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Get operation items
 * GET /api/phase4b/bulk-operations/:id/items
 */
router.get('/bulk-operations/:id/items', [
    param('id').isUUID(),
    query('status').optional().isString()
], async (req: Request, res: Response) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const userId = (req as any).user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized'
            });
        }

        const service = getBulkOperationsService();
        const items = await service.getOperationItems(
            req.params.id,
            userId,
            req.query.status as string
        );

        res.json({
            success: true,
            data: items
        });
    } catch (error: any) {
        console.error('Error fetching operation items:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Start bulk operation
 * POST /api/phase4b/bulk-operations/:id/start
 */
router.post('/bulk-operations/:id/start', [
    param('id').isUUID()
], async (req: Request, res: Response) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const userId = (req as any).user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized'
            });
        }

        const service = getBulkOperationsService();
        const operation = await service.startOperation(req.params.id, userId);

        res.json({
            success: true,
            data: operation
        });
    } catch (error: any) {
        console.error('Error starting bulk operation:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Cancel bulk operation
 * POST /api/phase4b/bulk-operations/:id/cancel
 */
router.post('/bulk-operations/:id/cancel', [
    param('id').isUUID()
], async (req: Request, res: Response) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const userId = (req as any).user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized'
            });
        }

        const service = getBulkOperationsService();
        const operation = await service.cancelOperation(req.params.id, userId);

        res.json({
            success: true,
            data: operation
        });
    } catch (error: any) {
        console.error('Error cancelling bulk operation:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Retry bulk operation
 * POST /api/phase4b/bulk-operations/:id/retry
 */
router.post('/bulk-operations/:id/retry', [
    param('id').isUUID()
], async (req: Request, res: Response) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const userId = (req as any).user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized'
            });
        }

        const service = getBulkOperationsService();
        const operation = await service.retryOperation(req.params.id, userId);

        res.json({
            success: true,
            data: operation
        });
    } catch (error: any) {
        console.error('Error retrying bulk operation:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Delete bulk operation
 * DELETE /api/phase4b/bulk-operations/:id
 */
router.delete('/bulk-operations/:id', [
    param('id').isUUID()
], async (req: Request, res: Response) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const userId = (req as any).user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized'
            });
        }

        const service = getBulkOperationsService();
        await service.deleteOperation(req.params.id, userId);

        res.json({
            success: true,
            message: 'Operation deleted successfully'
        });
    } catch (error: any) {
        console.error('Error deleting bulk operation:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Get user statistics
 * GET /api/phase4b/bulk-operations/stats
 */
router.get('/stats', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized'
            });
        }

        const service = getBulkOperationsService();
        const stats = await service.getUserStatistics(userId);

        res.json({
            success: true,
            data: stats
        });
    } catch (error: any) {
        console.error('Error fetching statistics:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

export default router;
