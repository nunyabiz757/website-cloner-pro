/**
 * Template Versioning API Routes
 *
 * Endpoints:
 * - GET    /api/templates/:id/versions           - List all versions
 * - GET    /api/templates/:id/versions/:version  - Get specific version
 * - POST   /api/templates/:id/versions           - Create new version
 * - PUT    /api/templates/:id/versions/:version/restore - Restore version
 * - DELETE /api/templates/:id/versions/:version  - Delete version
 * - POST   /api/templates/:id/versions/compare   - Compare versions
 * - GET    /api/templates/:id/versions/comparisons - Get comparison history
 */

import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/rbac.middleware.js';
import { getTemplateVersioningService } from '../services/template-versioning.service.js';
import { param, body, query, validationResult } from 'express-validator';

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
 * GET /api/templates/:id/versions
 * List all versions of a template
 */
router.get('/:id/versions',
    authenticate,
    requirePermission('templates', 'versions:view'),
    [
        param('id').isUUID(),
        query('limit').optional().isInt({ min: 1, max: 100 })
    ],
    validateRequest,
    async (req: Request, res: Response) => {
        try {
            const service = await getTemplateVersioningService();
            const limit = parseInt(req.query.limit as string) || 50;

            const versions = await service.getVersions(req.params.id, limit);

            res.json({
                success: true,
                data: versions,
                count: versions.length
            });

        } catch (error: any) {
            console.error('Error getting template versions:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get template versions',
                message: error.message
            });
        }
    }
);

/**
 * GET /api/templates/:id/versions/:version
 * Get a specific version
 */
router.get('/:id/versions/:version',
    authenticate,
    requirePermission('templates', 'versions:view'),
    [
        param('id').isUUID(),
        param('version').isInt({ min: 1 })
    ],
    validateRequest,
    async (req: Request, res: Response) => {
        try {
            const service = await getTemplateVersioningService();
            const version = await service.getVersion(
                req.params.id,
                parseInt(req.params.version)
            );

            res.json({
                success: true,
                data: version
            });

        } catch (error: any) {
            console.error('Error getting template version:', error);

            if (error.message.includes('not found')) {
                return res.status(404).json({
                    success: false,
                    error: error.message
                });
            }

            res.status(500).json({
                success: false,
                error: 'Failed to get template version',
                message: error.message
            });
        }
    }
);

/**
 * POST /api/templates/:id/versions
 * Create a new version manually
 */
router.post('/:id/versions',
    authenticate,
    requirePermission('templates', 'versions:create'),
    [
        param('id').isUUID(),
        body('versionName').optional().isString().trim().isLength({ max: 100 }),
        body('changelog').optional().isString().trim()
    ],
    validateRequest,
    async (req: Request, res: Response) => {
        try {
            const service = await getTemplateVersioningService();

            const version = await service.createVersion({
                templateId: req.params.id,
                userId: req.user!.userId,
                versionName: req.body.versionName,
                changelog: req.body.changelog
            });

            res.status(201).json({
                success: true,
                data: version,
                message: 'Version created successfully'
            });

        } catch (error: any) {
            console.error('Error creating template version:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to create template version',
                message: error.message
            });
        }
    }
);

/**
 * PUT /api/templates/:id/versions/:version/restore
 * Restore template to a specific version
 */
router.put('/:id/versions/:version/restore',
    authenticate,
    requirePermission('templates', 'versions:restore'),
    [
        param('id').isUUID(),
        param('version').isInt({ min: 1 })
    ],
    validateRequest,
    async (req: Request, res: Response) => {
        try {
            const service = await getTemplateVersioningService();

            await service.restoreVersion({
                templateId: req.params.id,
                versionNumber: parseInt(req.params.version),
                userId: req.user!.userId
            });

            res.json({
                success: true,
                message: `Template restored to version ${req.params.version}`
            });

        } catch (error: any) {
            console.error('Error restoring template version:', error);

            if (error.message.includes('not found')) {
                return res.status(404).json({
                    success: false,
                    error: error.message
                });
            }

            res.status(500).json({
                success: false,
                error: 'Failed to restore template version',
                message: error.message
            });
        }
    }
);

/**
 * DELETE /api/templates/:id/versions/:version
 * Delete a specific version
 */
router.delete('/:id/versions/:version',
    authenticate,
    requirePermission('templates', 'versions:delete'),
    [
        param('id').isUUID(),
        param('version').isInt({ min: 1 })
    ],
    validateRequest,
    async (req: Request, res: Response) => {
        try {
            const service = await getTemplateVersioningService();

            await service.deleteVersion(
                req.params.id,
                parseInt(req.params.version),
                req.user!.userId
            );

            res.json({
                success: true,
                message: 'Version deleted successfully'
            });

        } catch (error: any) {
            console.error('Error deleting template version:', error);

            if (error.message.includes('not found') || error.message.includes('not authorized')) {
                return res.status(404).json({
                    success: false,
                    error: error.message
                });
            }

            if (error.message.includes('Cannot delete')) {
                return res.status(400).json({
                    success: false,
                    error: error.message
                });
            }

            res.status(500).json({
                success: false,
                error: 'Failed to delete template version',
                message: error.message
            });
        }
    }
);

/**
 * POST /api/templates/:id/versions/compare
 * Compare two versions
 */
router.post('/:id/versions/compare',
    authenticate,
    requirePermission('templates', 'versions:compare'),
    [
        param('id').isUUID(),
        body('versionFrom').isInt({ min: 1 }),
        body('versionTo').isInt({ min: 1 })
    ],
    validateRequest,
    async (req: Request, res: Response) => {
        try {
            const service = await getTemplateVersioningService();

            const comparison = await service.compareVersions({
                templateId: req.params.id,
                versionFrom: req.body.versionFrom,
                versionTo: req.body.versionTo,
                userId: req.user!.userId
            });

            res.json({
                success: true,
                data: comparison,
                message: `Found ${comparison.diff.length} difference(s)`
            });

        } catch (error: any) {
            console.error('Error comparing template versions:', error);

            if (error.message.includes('not found')) {
                return res.status(404).json({
                    success: false,
                    error: error.message
                });
            }

            res.status(500).json({
                success: false,
                error: 'Failed to compare template versions',
                message: error.message
            });
        }
    }
);

/**
 * GET /api/templates/:id/versions/comparisons
 * Get comparison history
 */
router.get('/:id/versions/comparisons',
    authenticate,
    requirePermission('templates', 'versions:view'),
    [
        param('id').isUUID(),
        query('limit').optional().isInt({ min: 1, max: 100 })
    ],
    validateRequest,
    async (req: Request, res: Response) => {
        try {
            const service = await getTemplateVersioningService();
            const limit = parseInt(req.query.limit as string) || 20;

            const comparisons = await service.getComparisonHistory(req.params.id, limit);

            res.json({
                success: true,
                data: comparisons,
                count: comparisons.length
            });

        } catch (error: any) {
            console.error('Error getting comparison history:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get comparison history',
                message: error.message
            });
        }
    }
);

export default router;
