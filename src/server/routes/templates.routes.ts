/**
 * Template Marketplace API Routes
 *
 * Endpoints:
 * - GET    /api/templates                  - Search/browse templates
 * - GET    /api/templates/featured         - Get featured templates
 * - GET    /api/templates/recommendations  - Get personalized recommendations
 * - GET    /api/templates/categories       - Get all categories
 * - GET    /api/templates/tags             - Get popular tags
 * - GET    /api/templates/:id              - Get template details
 * - POST   /api/templates                  - Create new template
 * - PUT    /api/templates/:id              - Update template
 * - DELETE /api/templates/:id              - Delete template
 * - GET    /api/templates/:id/reviews      - Get template reviews
 * - POST   /api/templates/:id/reviews      - Add review
 * - POST   /api/templates/:id/favorite     - Add to favorites
 * - DELETE /api/templates/:id/favorite     - Remove from favorites
 * - GET    /api/templates/favorites        - Get user's favorites
 * - POST   /api/templates/:id/download     - Track download
 * - POST   /api/templates/:id/use          - Track usage
 */

import { Router, Request, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/rbac.middleware.js';
import { getTemplateMarketplaceService } from '../services/template-marketplace.service.js';
import { body, param, query, validationResult } from 'express-validator';

const router = Router();

// ============================================================================
// Validation Middleware
// ============================================================================

const validateRequest = (req: Request, res: Response, next: NextFunction) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({
            success: false,
            errors: errors.array()
        });
    }
    next();
};

// ============================================================================
// Template CRUD Routes
// ============================================================================

/**
 * GET /api/templates
 * Search and browse templates with filters
 */
router.get('/',
    authenticate,
    [
        query('q').optional().isString().trim(),
        query('category').optional().isUUID(),
        query('tags').optional().isString(),
        query('minRating').optional().isFloat({ min: 0, max: 5 }),
        query('maxPrice').optional().isInt({ min: 0 }),
        query('featured').optional().isBoolean(),
        query('verified').optional().isBoolean(),
        query('sortBy').optional().isIn(['popular', 'rating', 'recent', 'name']),
        query('sortOrder').optional().isIn(['asc', 'desc']),
        query('limit').optional().isInt({ min: 1, max: 100 }),
        query('offset').optional().isInt({ min: 0 })
    ],
    validateRequest,
    async (req: Request, res: Response) => {
        try {
            const service = await getTemplateMarketplaceService();

            const params = {
                query: req.query.q as string,
                categoryId: req.query.category as string,
                tags: req.query.tags ? (req.query.tags as string).split(',') : undefined,
                minRating: req.query.minRating ? parseFloat(req.query.minRating as string) : undefined,
                maxPrice: req.query.maxPrice ? parseInt(req.query.maxPrice as string) : undefined,
                isFeatured: req.query.featured === 'true' ? true : undefined,
                isVerified: req.query.verified === 'true' ? true : undefined,
                sortBy: (req.query.sortBy as any) || 'popular',
                sortOrder: (req.query.sortOrder as any) || 'desc',
                limit: req.query.limit ? parseInt(req.query.limit as string) : 20,
                offset: req.query.offset ? parseInt(req.query.offset as string) : 0
            };

            const result = await service.searchTemplates(params, req.user?.userId);

            res.json({
                success: true,
                data: result.templates,
                pagination: {
                    total: result.total,
                    page: result.page,
                    pageSize: result.pageSize,
                    totalPages: Math.ceil(result.total / result.pageSize)
                }
            });

        } catch (error: any) {
            console.error('Error searching templates:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to search templates',
                message: error.message
            });
        }
    }
);

/**
 * GET /api/templates/featured
 * Get featured templates
 */
router.get('/featured',
    authenticate,
    async (req: Request, res: Response) => {
        try {
            const service = await getTemplateMarketplaceService();
            const limit = parseInt(req.query.limit as string) || 12;

            const result = await service.searchTemplates({
                isFeatured: true,
                sortBy: 'popular',
                limit
            }, req.user?.userId);

            res.json({
                success: true,
                data: result.templates
            });

        } catch (error: any) {
            console.error('Error getting featured templates:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get featured templates',
                message: error.message
            });
        }
    }
);

/**
 * GET /api/templates/recommendations
 * Get personalized template recommendations
 */
router.get('/recommendations',
    authenticate,
    async (req: Request, res: Response) => {
        try {
            const service = await getTemplateMarketplaceService();
            const limit = parseInt(req.query.limit as string) || 10;

            const recommendations = await service.getRecommendations(req.user!.userId, limit);

            res.json({
                success: true,
                data: recommendations
            });

        } catch (error: any) {
            console.error('Error getting recommendations:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get recommendations',
                message: error.message
            });
        }
    }
);

/**
 * GET /api/templates/categories
 * Get all template categories
 */
router.get('/categories',
    authenticate,
    async (req: Request, res: Response) => {
        try {
            const service = await getTemplateMarketplaceService();
            const categories = await service.getCategories();

            res.json({
                success: true,
                data: categories
            });

        } catch (error: any) {
            console.error('Error getting categories:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get categories',
                message: error.message
            });
        }
    }
);

/**
 * GET /api/templates/tags
 * Get popular tags
 */
router.get('/tags',
    authenticate,
    async (req: Request, res: Response) => {
        try {
            const service = await getTemplateMarketplaceService();
            const limit = parseInt(req.query.limit as string) || 50;

            const tags = await service.getPopularTags(limit);

            res.json({
                success: true,
                data: tags
            });

        } catch (error: any) {
            console.error('Error getting tags:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get tags',
                message: error.message
            });
        }
    }
);

/**
 * GET /api/templates/:id
 * Get template details
 */
router.get('/:id',
    authenticate,
    [param('id').isUUID()],
    validateRequest,
    async (req: Request, res: Response) => {
        try {
            const service = await getTemplateMarketplaceService();
            const template = await service.getTemplate(req.params.id, req.user?.userId);

            if (!template) {
                return res.status(404).json({
                    success: false,
                    error: 'Template not found'
                });
            }

            res.json({
                success: true,
                data: template
            });

        } catch (error: any) {
            console.error('Error getting template:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get template',
                message: error.message
            });
        }
    }
);

/**
 * POST /api/templates
 * Create new template
 */
router.post('/',
    authenticate,
    requirePermission('templates', 'create'),
    [
        body('name').notEmpty().trim().isLength({ min: 1, max: 200 }),
        body('description').optional().trim().isLength({ max: 2000 }),
        body('categoryId').optional().isUUID(),
        body('clonedPageId').optional().isUUID(),
        body('thumbnailUrl').optional().isURL(),
        body('previewUrl').optional().isURL(),
        body('isPublic').optional().isBoolean(),
        body('isPrivate').optional().isBoolean(),
        body('priceCredits').optional().isInt({ min: 0 }),
        body('tags').optional().isArray(),
        body('tags.*').optional().isString().trim()
    ],
    validateRequest,
    async (req: Request, res: Response) => {
        try {
            const service = await getTemplateMarketplaceService();

            const template = await service.createTemplate({
                userId: req.user!.userId,
                name: req.body.name,
                description: req.body.description,
                categoryId: req.body.categoryId,
                clonedPageId: req.body.clonedPageId,
                thumbnailUrl: req.body.thumbnailUrl,
                previewUrl: req.body.previewUrl,
                isPublic: req.body.isPublic !== undefined ? req.body.isPublic : true,
                isPrivate: req.body.isPrivate !== undefined ? req.body.isPrivate : false,
                priceCredits: req.body.priceCredits || 0,
                tags: req.body.tags || []
            });

            res.status(201).json({
                success: true,
                data: template,
                message: 'Template created successfully'
            });

        } catch (error: any) {
            console.error('Error creating template:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to create template',
                message: error.message
            });
        }
    }
);

/**
 * PUT /api/templates/:id
 * Update template
 */
router.put('/:id',
    authenticate,
    requirePermission('templates', 'update'),
    [
        param('id').isUUID(),
        body('name').optional().trim().isLength({ min: 1, max: 200 }),
        body('description').optional().trim().isLength({ max: 2000 }),
        body('categoryId').optional().isUUID(),
        body('thumbnailUrl').optional().isURL(),
        body('previewUrl').optional().isURL(),
        body('isPublic').optional().isBoolean(),
        body('isPrivate').optional().isBoolean(),
        body('priceCredits').optional().isInt({ min: 0 }),
        body('tags').optional().isArray(),
        body('tags.*').optional().isString().trim()
    ],
    validateRequest,
    async (req: Request, res: Response) => {
        try {
            const service = await getTemplateMarketplaceService();

            const template = await service.updateTemplate(
                req.params.id,
                req.user!.userId,
                req.body
            );

            res.json({
                success: true,
                data: template,
                message: 'Template updated successfully'
            });

        } catch (error: any) {
            console.error('Error updating template:', error);

            if (error.message === 'Template not found') {
                return res.status(404).json({
                    success: false,
                    error: error.message
                });
            }

            if (error.message === 'Not authorized to update this template') {
                return res.status(403).json({
                    success: false,
                    error: error.message
                });
            }

            res.status(500).json({
                success: false,
                error: 'Failed to update template',
                message: error.message
            });
        }
    }
);

/**
 * DELETE /api/templates/:id
 * Delete template
 */
router.delete('/:id',
    authenticate,
    requirePermission('templates', 'delete'),
    [param('id').isUUID()],
    validateRequest,
    async (req: Request, res: Response) => {
        try {
            const service = await getTemplateMarketplaceService();
            await service.deleteTemplate(req.params.id, req.user!.userId);

            res.json({
                success: true,
                message: 'Template deleted successfully'
            });

        } catch (error: any) {
            console.error('Error deleting template:', error);

            if (error.message === 'Template not found or not authorized') {
                return res.status(404).json({
                    success: false,
                    error: error.message
                });
            }

            res.status(500).json({
                success: false,
                error: 'Failed to delete template',
                message: error.message
            });
        }
    }
);

// ============================================================================
// Review Routes
// ============================================================================

/**
 * GET /api/templates/:id/reviews
 * Get template reviews
 */
router.get('/:id/reviews',
    authenticate,
    [
        param('id').isUUID(),
        query('limit').optional().isInt({ min: 1, max: 100 }),
        query('offset').optional().isInt({ min: 0 })
    ],
    validateRequest,
    async (req: Request, res: Response) => {
        try {
            const service = await getTemplateMarketplaceService();
            const limit = parseInt(req.query.limit as string) || 20;
            const offset = parseInt(req.query.offset as string) || 0;

            const result = await service.getReviews(req.params.id, limit, offset);

            res.json({
                success: true,
                data: result.reviews,
                pagination: {
                    total: result.total,
                    limit,
                    offset
                }
            });

        } catch (error: any) {
            console.error('Error getting reviews:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get reviews',
                message: error.message
            });
        }
    }
);

/**
 * POST /api/templates/:id/reviews
 * Add review for template
 */
router.post('/:id/reviews',
    authenticate,
    [
        param('id').isUUID(),
        body('rating').isInt({ min: 1, max: 5 }),
        body('reviewText').optional().trim().isLength({ max: 2000 })
    ],
    validateRequest,
    async (req: Request, res: Response) => {
        try {
            const service = await getTemplateMarketplaceService();

            const review = await service.addReview({
                templateId: req.params.id,
                userId: req.user!.userId,
                rating: req.body.rating,
                reviewText: req.body.reviewText
            });

            res.status(201).json({
                success: true,
                data: review,
                message: 'Review added successfully'
            });

        } catch (error: any) {
            console.error('Error adding review:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to add review',
                message: error.message
            });
        }
    }
);

// ============================================================================
// Favorites Routes
// ============================================================================

/**
 * POST /api/templates/:id/favorite
 * Add template to favorites
 */
router.post('/:id/favorite',
    authenticate,
    [param('id').isUUID()],
    validateRequest,
    async (req: Request, res: Response) => {
        try {
            const service = await getTemplateMarketplaceService();
            await service.addToFavorites(req.params.id, req.user!.userId);

            res.json({
                success: true,
                message: 'Template added to favorites'
            });

        } catch (error: any) {
            console.error('Error adding to favorites:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to add to favorites',
                message: error.message
            });
        }
    }
);

/**
 * DELETE /api/templates/:id/favorite
 * Remove template from favorites
 */
router.delete('/:id/favorite',
    authenticate,
    [param('id').isUUID()],
    validateRequest,
    async (req: Request, res: Response) => {
        try {
            const service = await getTemplateMarketplaceService();
            await service.removeFromFavorites(req.params.id, req.user!.userId);

            res.json({
                success: true,
                message: 'Template removed from favorites'
            });

        } catch (error: any) {
            console.error('Error removing from favorites:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to remove from favorites',
                message: error.message
            });
        }
    }
);

/**
 * GET /api/templates/favorites
 * Get user's favorite templates
 */
router.get('/user/favorites',
    authenticate,
    async (req: Request, res: Response) => {
        try {
            const service = await getTemplateMarketplaceService();
            const favorites = await service.getFavorites(req.user!.userId);

            res.json({
                success: true,
                data: favorites
            });

        } catch (error: any) {
            console.error('Error getting favorites:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to get favorites',
                message: error.message
            });
        }
    }
);

// ============================================================================
// Usage Tracking Routes
// ============================================================================

/**
 * POST /api/templates/:id/download
 * Track template download
 */
router.post('/:id/download',
    authenticate,
    [param('id').isUUID()],
    validateRequest,
    async (req: Request, res: Response) => {
        try {
            const service = await getTemplateMarketplaceService();

            await service.trackUsage({
                templateId: req.params.id,
                userId: req.user!.userId,
                action: 'download',
                metadata: {
                    timestamp: new Date().toISOString(),
                    userAgent: req.headers['user-agent']
                }
            });

            res.json({
                success: true,
                message: 'Download tracked'
            });

        } catch (error: any) {
            console.error('Error tracking download:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to track download',
                message: error.message
            });
        }
    }
);

/**
 * POST /api/templates/:id/use
 * Track template usage
 */
router.post('/:id/use',
    authenticate,
    [param('id').isUUID()],
    validateRequest,
    async (req: Request, res: Response) => {
        try {
            const service = await getTemplateMarketplaceService();

            await service.trackUsage({
                templateId: req.params.id,
                userId: req.user!.userId,
                action: 'use',
                metadata: {
                    timestamp: new Date().toISOString(),
                    context: req.body.context || 'unknown'
                }
            });

            res.json({
                success: true,
                message: 'Usage tracked'
            });

        } catch (error: any) {
            console.error('Error tracking usage:', error);
            res.status(500).json({
                success: false,
                error: 'Failed to track usage',
                message: error.message
            });
        }
    }
);

export default router;
