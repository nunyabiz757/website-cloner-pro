/**
 * Marketplace Routes
 *
 * REST API endpoints for white-label marketplace management
 */

import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/rbac.middleware.js';
import { getMarketplaceService } from '../services/marketplace.service.js';
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
// MARKETPLACE MANAGEMENT ROUTES
// ============================================================================

/**
 * POST /api/marketplace
 * Create a new marketplace
 */
router.post(
    '/',
    authenticate,
    requirePermission('marketplace.create'),
    [
        body('marketplace_name').isString().trim().isLength({ min: 1, max: 200 }),
        body('marketplace_slug').optional().isString().trim().isLength({ max: 200 }),
        body('team_id').optional().isUUID(),
        body('tagline').optional().isString(),
        body('description').optional().isString(),
        body('subdomain').optional().isString().trim().isLength({ max: 100 }),
        body('primary_color').optional().isString().matches(/^#[0-9A-F]{6}$/i),
        body('secondary_color').optional().isString().matches(/^#[0-9A-F]{6}$/i),
        body('accent_color').optional().isString().matches(/^#[0-9A-F]{6}$/i)
    ],
    async (req: Request, res: Response) => {
        if (handleValidationErrors(req, res)) return;

        try {
            const service = getMarketplaceService();

            const marketplace = await service.createMarketplace({
                user_id: req.user!.id,
                ...req.body
            });

            res.status(201).json({
                success: true,
                data: marketplace
            });

        } catch (error: any) {
            console.error('Error creating marketplace:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to create marketplace'
            });
        }
    }
);

/**
 * GET /api/marketplace/my-marketplaces
 * Get current user's marketplaces
 */
router.get(
    '/my-marketplaces',
    authenticate,
    async (req: Request, res: Response) => {
        try {
            const service = getMarketplaceService();

            const marketplaces = await service.getUserMarketplaces(req.user!.id);

            res.json({
                success: true,
                data: marketplaces
            });

        } catch (error: any) {
            console.error('Error getting marketplaces:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to get marketplaces'
            });
        }
    }
);

/**
 * GET /api/marketplace/:id
 * Get marketplace by ID
 */
router.get(
    '/:id',
    [
        param('id').isUUID()
    ],
    async (req: Request, res: Response) => {
        if (handleValidationErrors(req, res)) return;

        try {
            const service = getMarketplaceService();

            const marketplace = await service.getMarketplace(req.params.id);

            if (!marketplace) {
                return res.status(404).json({
                    success: false,
                    error: 'Marketplace not found'
                });
            }

            res.json({
                success: true,
                data: marketplace
            });

        } catch (error: any) {
            console.error('Error getting marketplace:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to get marketplace'
            });
        }
    }
);

/**
 * GET /api/marketplace/slug/:slug
 * Get marketplace by slug
 */
router.get(
    '/slug/:slug',
    [
        param('slug').isString()
    ],
    async (req: Request, res: Response) => {
        if (handleValidationErrors(req, res)) return;

        try {
            const service = getMarketplaceService();

            const marketplace = await service.getMarketplaceBySlug(req.params.slug);

            if (!marketplace) {
                return res.status(404).json({
                    success: false,
                    error: 'Marketplace not found'
                });
            }

            res.json({
                success: true,
                data: marketplace
            });

        } catch (error: any) {
            console.error('Error getting marketplace:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to get marketplace'
            });
        }
    }
);

/**
 * PUT /api/marketplace/:id
 * Update marketplace settings
 */
router.put(
    '/:id',
    authenticate,
    requirePermission('marketplace.update'),
    [
        param('id').isUUID(),
        body('marketplace_name').optional().isString().trim().isLength({ min: 1, max: 200 }),
        body('tagline').optional().isString(),
        body('description').optional().isString(),
        body('custom_domain').optional().isString(),
        body('subdomain').optional().isString().trim().isLength({ max: 100 }),
        body('logo_url').optional().isURL(),
        body('favicon_url').optional().isURL(),
        body('hero_image_url').optional().isURL(),
        body('primary_color').optional().isString().matches(/^#[0-9A-F]{6}$/i),
        body('secondary_color').optional().isString().matches(/^#[0-9A-F]{6}$/i),
        body('accent_color').optional().isString().matches(/^#[0-9A-F]{6}$/i),
        body('background_color').optional().isString().matches(/^#[0-9A-F]{6}$/i),
        body('text_color').optional().isString().matches(/^#[0-9A-F]{6}$/i),
        body('font_family').optional().isString(),
        body('heading_font').optional().isString(),
        body('contact_email').optional().isEmail(),
        body('support_email').optional().isEmail(),
        body('phone').optional().isString(),
        body('address').optional().isString(),
        body('social_links').optional().isObject(),
        body('meta_title').optional().isString().isLength({ max: 200 }),
        body('meta_description').optional().isString(),
        body('meta_keywords').optional().isString(),
        body('og_image_url').optional().isURL(),
        body('enable_seller_registration').optional().isBoolean(),
        body('enable_reviews').optional().isBoolean(),
        body('enable_favorites').optional().isBoolean(),
        body('enable_messaging').optional().isBoolean(),
        body('require_approval').optional().isBoolean(),
        body('default_commission_rate').optional().isDecimal(),
        body('commission_type').optional().isIn(['percentage', 'fixed']),
        body('payment_providers').optional().isArray(),
        body('payout_schedule').optional().isIn(['weekly', 'monthly', 'manual']),
        body('minimum_payout_amount').optional().isDecimal(),
        body('auto_publish_templates').optional().isBoolean(),
        body('require_template_review').optional().isBoolean(),
        body('template_approval_workflow_id').optional().isUUID(),
        body('terms_url').optional().isURL(),
        body('privacy_url').optional().isURL(),
        body('refund_policy_url').optional().isURL(),
        body('google_analytics_id').optional().isString(),
        body('facebook_pixel_id').optional().isString(),
        body('is_active').optional().isBoolean(),
        body('is_public').optional().isBoolean(),
        body('custom_css').optional().isString(),
        body('custom_js').optional().isString(),
        body('custom_head_html').optional().isString()
    ],
    async (req: Request, res: Response) => {
        if (handleValidationErrors(req, res)) return;

        try {
            const service = getMarketplaceService();

            const marketplace = await service.updateMarketplace({
                marketplace_id: req.params.id,
                user_id: req.user!.id,
                ...req.body
            });

            res.json({
                success: true,
                data: marketplace
            });

        } catch (error: any) {
            console.error('Error updating marketplace:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to update marketplace'
            });
        }
    }
);

/**
 * GET /api/marketplace/:id/statistics
 * Get marketplace statistics
 */
router.get(
    '/:id/statistics',
    authenticate,
    requirePermission('marketplace.view'),
    [
        param('id').isUUID(),
        query('start_date').isISO8601(),
        query('end_date').isISO8601()
    ],
    async (req: Request, res: Response) => {
        if (handleValidationErrors(req, res)) return;

        try {
            const service = getMarketplaceService();

            const stats = await service.getMarketplaceStatistics(
                req.params.id,
                new Date(req.query.start_date as string),
                new Date(req.query.end_date as string)
            );

            res.json({
                success: true,
                data: stats
            });

        } catch (error: any) {
            console.error('Error getting marketplace statistics:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to get marketplace statistics'
            });
        }
    }
);

// ============================================================================
// SELLER MANAGEMENT ROUTES
// ============================================================================

/**
 * POST /api/marketplace/:id/sellers/apply
 * Apply to become a seller
 */
router.post(
    '/:id/sellers/apply',
    authenticate,
    [
        param('id').isUUID(),
        body('display_name').isString().trim().isLength({ min: 1, max: 200 }),
        body('bio').optional().isString(),
        body('avatar_url').optional().isURL(),
        body('public_email').optional().isEmail(),
        body('website_url').optional().isURL(),
        body('social_links').optional().isObject(),
        body('payout_method').optional().isIn(['paypal', 'stripe', 'bank_transfer']),
        body('payout_details').optional().isObject(),
        body('application_notes').optional().isString()
    ],
    async (req: Request, res: Response) => {
        if (handleValidationErrors(req, res)) return;

        try {
            const service = getMarketplaceService();

            const seller = await service.applyAsSeller({
                user_id: req.user!.id,
                marketplace_id: req.params.id,
                ...req.body
            });

            res.status(201).json({
                success: true,
                data: seller
            });

        } catch (error: any) {
            console.error('Error applying as seller:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to apply as seller'
            });
        }
    }
);

/**
 * GET /api/marketplace/:id/sellers
 * Get sellers for marketplace
 */
router.get(
    '/:id/sellers',
    [
        param('id').isUUID(),
        query('status').optional().isIn(['pending', 'active', 'suspended', 'banned']),
        query('limit').optional().isInt({ min: 1, max: 100 })
    ],
    async (req: Request, res: Response) => {
        if (handleValidationErrors(req, res)) return;

        try {
            const service = getMarketplaceService();

            const sellers = await service.getMarketplaceSellers(
                req.params.id,
                req.query.status as string,
                req.query.limit ? parseInt(req.query.limit as string) : 50
            );

            res.json({
                success: true,
                data: sellers
            });

        } catch (error: any) {
            console.error('Error getting sellers:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to get sellers'
            });
        }
    }
);

/**
 * GET /api/marketplace/sellers/:sellerId
 * Get seller profile
 */
router.get(
    '/sellers/:sellerId',
    [
        param('sellerId').isUUID()
    ],
    async (req: Request, res: Response) => {
        if (handleValidationErrors(req, res)) return;

        try {
            const service = getMarketplaceService();

            const seller = await service.getSellerProfile(req.params.sellerId);

            if (!seller) {
                return res.status(404).json({
                    success: false,
                    error: 'Seller not found'
                });
            }

            res.json({
                success: true,
                data: seller
            });

        } catch (error: any) {
            console.error('Error getting seller:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to get seller'
            });
        }
    }
);

/**
 * POST /api/marketplace/sellers/:sellerId/approve
 * Approve seller application
 */
router.post(
    '/sellers/:sellerId/approve',
    authenticate,
    requirePermission('marketplace.manage_sellers'),
    [
        param('sellerId').isUUID()
    ],
    async (req: Request, res: Response) => {
        if (handleValidationErrors(req, res)) return;

        try {
            const service = getMarketplaceService();

            await service.approveSeller(req.params.sellerId, req.user!.id);

            res.json({
                success: true,
                message: 'Seller approved successfully'
            });

        } catch (error: any) {
            console.error('Error approving seller:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to approve seller'
            });
        }
    }
);

/**
 * POST /api/marketplace/sellers/:sellerId/reject
 * Reject seller application
 */
router.post(
    '/sellers/:sellerId/reject',
    authenticate,
    requirePermission('marketplace.manage_sellers'),
    [
        param('sellerId').isUUID(),
        body('reason').isString().trim().isLength({ min: 1 })
    ],
    async (req: Request, res: Response) => {
        if (handleValidationErrors(req, res)) return;

        try {
            const service = getMarketplaceService();

            await service.rejectSeller(req.params.sellerId, req.user!.id, req.body.reason);

            res.json({
                success: true,
                message: 'Seller rejected'
            });

        } catch (error: any) {
            console.error('Error rejecting seller:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to reject seller'
            });
        }
    }
);

// ============================================================================
// LISTING MANAGEMENT ROUTES
// ============================================================================

/**
 * POST /api/marketplace/:id/listings
 * Create a template listing
 */
router.post(
    '/:id/listings',
    authenticate,
    requirePermission('marketplace.create_listing'),
    [
        param('id').isUUID(),
        body('seller_id').isUUID(),
        body('template_id').isUUID(),
        body('category_id').optional().isUUID(),
        body('title').isString().trim().isLength({ min: 1, max: 255 }),
        body('description').optional().isString(),
        body('features').optional().isArray(),
        body('tags').optional().isArray(),
        body('price').optional().isDecimal(),
        body('currency').optional().isString().isLength({ min: 3, max: 3 }),
        body('is_free').optional().isBoolean(),
        body('original_price').optional().isDecimal(),
        body('images').optional().isArray(),
        body('demo_url').optional().isURL(),
        body('video_url').optional().isURL()
    ],
    async (req: Request, res: Response) => {
        if (handleValidationErrors(req, res)) return;

        try {
            const service = getMarketplaceService();

            const listing = await service.createListing({
                marketplace_id: req.params.id,
                ...req.body
            });

            res.status(201).json({
                success: true,
                data: listing
            });

        } catch (error: any) {
            console.error('Error creating listing:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to create listing'
            });
        }
    }
);

/**
 * GET /api/marketplace/:id/listings
 * Get marketplace listings
 */
router.get(
    '/:id/listings',
    [
        param('id').isUUID(),
        query('status').optional().isIn(['draft', 'pending_review', 'active', 'rejected', 'suspended']),
        query('seller_id').optional().isUUID(),
        query('category_id').optional().isUUID(),
        query('is_featured').optional().isBoolean(),
        query('limit').optional().isInt({ min: 1, max: 100 }),
        query('offset').optional().isInt({ min: 0 })
    ],
    async (req: Request, res: Response) => {
        if (handleValidationErrors(req, res)) return;

        try {
            const service = getMarketplaceService();

            const result = await service.getMarketplaceListings(req.params.id, {
                status: req.query.status as string,
                seller_id: req.query.seller_id as string,
                category_id: req.query.category_id as string,
                is_featured: req.query.is_featured === 'true' ? true : undefined,
                limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
                offset: req.query.offset ? parseInt(req.query.offset as string) : undefined
            });

            res.json({
                success: true,
                data: result.listings,
                pagination: {
                    total: result.total,
                    limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
                    offset: req.query.offset ? parseInt(req.query.offset as string) : 0
                }
            });

        } catch (error: any) {
            console.error('Error getting listings:', error);
            res.status(500).json({
                success: false,
                error: error.message || 'Failed to get listings'
            });
        }
    }
);

export default router;
