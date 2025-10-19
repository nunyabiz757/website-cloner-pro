import express, { Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { getTemplateMonetizationService } from '../services/template-monetization.service.js';
import { getAffiliateService } from '../services/affiliate.service.js';

const router = express.Router();

// =====================================================================================
// Template Pricing Routes
// =====================================================================================

/**
 * Create pricing for template
 * POST /api/template-monetization/pricing
 */
router.post('/pricing', [
    body('template_id').isUUID(),
    body('price').isFloat({ min: 0 }),
    body('currency').optional().isString(),
    body('pricing_model').optional().isIn(['one-time', 'subscription', 'free']),
    body('license_type').optional().isIn(['standard', 'extended', 'commercial']),
    body('license_terms').optional().isString(),
    body('platform_commission_percent').optional().isFloat({ min: 0, max: 100 }),
    body('creator_revenue_percent').optional().isFloat({ min: 0, max: 100 }),
    body('affiliate_commission_percent').optional().isFloat({ min: 0, max: 100 })
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

        const service = getTemplateMonetizationService();
        const pricing = await service.createPricing({
            ...req.body,
            creator_id: userId
        });

        res.status(201).json({
            success: true,
            data: pricing
        });
    } catch (error: any) {
        console.error('Error creating pricing:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Get template pricing
 * GET /api/template-monetization/pricing/:templateId
 */
router.get('/pricing/:templateId', [
    param('templateId').isUUID()
], async (req: Request, res: Response) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const service = getTemplateMonetizationService();
        const pricing = await service.getTemplatePricing(req.params.templateId);

        if (!pricing) {
            return res.status(404).json({
                success: false,
                error: 'Pricing not found'
            });
        }

        res.json({
            success: true,
            data: pricing
        });
    } catch (error: any) {
        console.error('Error fetching pricing:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Update template pricing
 * PUT /api/template-monetization/pricing/:templateId
 */
router.put('/pricing/:templateId', [
    param('templateId').isUUID(),
    body('price').optional().isFloat({ min: 0 }),
    body('discount_price').optional().isFloat({ min: 0 }),
    body('discount_valid_from').optional().isISO8601(),
    body('discount_valid_until').optional().isISO8601(),
    body('is_for_sale').optional().isBoolean(),
    body('is_featured').optional().isBoolean(),
    body('license_terms').optional().isString()
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

        const service = getTemplateMonetizationService();
        const pricing = await service.updatePricing(
            req.params.templateId,
            userId,
            req.body
        );

        res.json({
            success: true,
            data: pricing
        });
    } catch (error: any) {
        console.error('Error updating pricing:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Get featured templates
 * GET /api/template-monetization/pricing/featured
 */
router.get('/featured', [
    query('limit').optional().isInt({ min: 1, max: 100 })
], async (req: Request, res: Response) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const limit = parseInt(req.query.limit as string) || 20;

        const service = getTemplateMonetizationService();
        const templates = await service.getFeaturedTemplates(limit);

        res.json({
            success: true,
            data: templates
        });
    } catch (error: any) {
        console.error('Error fetching featured templates:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// =====================================================================================
// Template Purchase Routes
// =====================================================================================

/**
 * Purchase template
 * POST /api/template-monetization/purchases
 */
router.post('/purchases', [
    body('template_id').isUUID(),
    body('payment_id').optional().isUUID(),
    body('affiliate_link_id').optional().isUUID()
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

        const service = getTemplateMonetizationService();
        const purchase = await service.purchaseTemplate({
            ...req.body,
            buyer_id: userId
        });

        res.status(201).json({
            success: true,
            data: purchase
        });
    } catch (error: any) {
        console.error('Error purchasing template:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Get user's purchases
 * GET /api/template-monetization/purchases
 */
router.get('/purchases', [
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

        const service = getTemplateMonetizationService();
        const purchases = await service.getUserPurchases(userId, limit, offset);

        res.json({
            success: true,
            data: purchases
        });
    } catch (error: any) {
        console.error('Error fetching purchases:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Get purchase by ID
 * GET /api/template-monetization/purchases/:id
 */
router.get('/purchases/:id', [
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

        const service = getTemplateMonetizationService();
        const purchase = await service.getPurchaseById(req.params.id);

        if (!purchase) {
            return res.status(404).json({
                success: false,
                error: 'Purchase not found'
            });
        }

        res.json({
            success: true,
            data: purchase
        });
    } catch (error: any) {
        console.error('Error fetching purchase:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Track download
 * POST /api/template-monetization/purchases/:id/download
 */
router.post('/purchases/:id/download', [
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

        const service = getTemplateMonetizationService();
        await service.trackDownload(req.params.id, userId);

        res.json({
            success: true,
            message: 'Download tracked'
        });
    } catch (error: any) {
        console.error('Error tracking download:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Check template ownership
 * GET /api/template-monetization/ownership/:templateId
 */
router.get('/ownership/:templateId', [
    param('templateId').isUUID()
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

        const service = getTemplateMonetizationService();
        const owns = await service.userOwnsTemplate(userId, req.params.templateId);

        res.json({
            success: true,
            data: { owns }
        });
    } catch (error: any) {
        console.error('Error checking ownership:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// =====================================================================================
// Creator Earnings Routes
// =====================================================================================

/**
 * Get creator earnings
 * GET /api/template-monetization/earnings
 */
router.get('/earnings', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized'
            });
        }

        const service = getTemplateMonetizationService();
        const earnings = await service.getCreatorEarnings(userId);

        res.json({
            success: true,
            data: earnings
        });
    } catch (error: any) {
        console.error('Error fetching earnings:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Get creator statistics
 * GET /api/template-monetization/earnings/stats
 */
router.get('/earnings/stats', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized'
            });
        }

        const service = getTemplateMonetizationService();
        const stats = await service.getCreatorStats(userId);

        res.json({
            success: true,
            data: stats
        });
    } catch (error: any) {
        console.error('Error fetching creator stats:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Get creator sales
 * GET /api/template-monetization/sales
 */
router.get('/sales', [
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

        const service = getTemplateMonetizationService();
        const sales = await service.getCreatorSales(userId, limit, offset);

        res.json({
            success: true,
            data: sales
        });
    } catch (error: any) {
        console.error('Error fetching sales:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Update payout settings
 * PUT /api/template-monetization/earnings/payout-settings
 */
router.put('/earnings/payout-settings', [
    body('minimum_payout').optional().isFloat({ min: 0 }),
    body('payout_method').optional().isString(),
    body('payout_details').optional().isObject()
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

        const service = getTemplateMonetizationService();
        const earnings = await service.updatePayoutSettings(userId, req.body);

        res.json({
            success: true,
            data: earnings
        });
    } catch (error: any) {
        console.error('Error updating payout settings:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// =====================================================================================
// Payout Routes
// =====================================================================================

/**
 * Request payout
 * POST /api/template-monetization/payouts
 */
router.post('/payouts', [
    body('amount').isFloat({ min: 0 }),
    body('payout_method').isString()
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

        const service = getTemplateMonetizationService();
        const payout = await service.requestPayout(
            userId,
            req.body.amount,
            req.body.payout_method
        );

        res.status(201).json({
            success: true,
            data: payout
        });
    } catch (error: any) {
        console.error('Error requesting payout:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Get creator payouts
 * GET /api/template-monetization/payouts
 */
router.get('/payouts', [
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

        const service = getTemplateMonetizationService();
        const payouts = await service.getCreatorPayouts(userId, limit, offset);

        res.json({
            success: true,
            data: payouts
        });
    } catch (error: any) {
        console.error('Error fetching payouts:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Get payout by ID
 * GET /api/template-monetization/payouts/:id
 */
router.get('/payouts/:id', [
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

        const service = getTemplateMonetizationService();
        const payout = await service.getPayoutById(req.params.id);

        if (!payout) {
            return res.status(404).json({
                success: false,
                error: 'Payout not found'
            });
        }

        res.json({
            success: true,
            data: payout
        });
    } catch (error: any) {
        console.error('Error fetching payout:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// =====================================================================================
// Affiliate Link Routes
// =====================================================================================

/**
 * Create affiliate link
 * POST /api/template-monetization/affiliate/links
 */
router.post('/affiliate/links', [
    body('target_type').isIn(['general', 'template', 'marketplace']),
    body('target_id').optional().isUUID(),
    body('campaign_name').optional().isString(),
    body('cookie_duration_days').optional().isInt({ min: 1, max: 365 })
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

        const affiliateService = getAffiliateService();
        const link = await affiliateService.createAffiliateLink({
            ...req.body,
            affiliate_id: userId
        });

        res.status(201).json({
            success: true,
            data: link
        });
    } catch (error: any) {
        console.error('Error creating affiliate link:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Get affiliate links
 * GET /api/template-monetization/affiliate/links
 */
router.get('/affiliate/links', [
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

        const affiliateService = getAffiliateService();
        const links = await affiliateService.getAffiliateLinks(userId, limit, offset);

        res.json({
            success: true,
            data: links
        });
    } catch (error: any) {
        console.error('Error fetching affiliate links:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Get affiliate link by ID
 * GET /api/template-monetization/affiliate/links/:id
 */
router.get('/affiliate/links/:id', [
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

        const affiliateService = getAffiliateService();
        const link = await affiliateService.getAffiliateLinkById(req.params.id, userId);

        if (!link) {
            return res.status(404).json({
                success: false,
                error: 'Link not found'
            });
        }

        res.json({
            success: true,
            data: link
        });
    } catch (error: any) {
        console.error('Error fetching affiliate link:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Update affiliate link
 * PUT /api/template-monetization/affiliate/links/:id
 */
router.put('/affiliate/links/:id', [
    param('id').isUUID(),
    body('is_active').optional().isBoolean(),
    body('campaign_name').optional().isString()
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

        const affiliateService = getAffiliateService();
        const link = await affiliateService.updateAffiliateLink(
            req.params.id,
            userId,
            req.body
        );

        res.json({
            success: true,
            data: link
        });
    } catch (error: any) {
        console.error('Error updating affiliate link:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Delete affiliate link
 * DELETE /api/template-monetization/affiliate/links/:id
 */
router.delete('/affiliate/links/:id', [
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

        const affiliateService = getAffiliateService();
        await affiliateService.deleteAffiliateLink(req.params.id, userId);

        res.json({
            success: true,
            message: 'Affiliate link deleted'
        });
    } catch (error: any) {
        console.error('Error deleting affiliate link:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Get affiliate earnings
 * GET /api/template-monetization/affiliate/earnings
 */
router.get('/affiliate/earnings', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized'
            });
        }

        const affiliateService = getAffiliateService();
        const earnings = await affiliateService.getAffiliateEarnings(userId);

        res.json({
            success: true,
            data: earnings
        });
    } catch (error: any) {
        console.error('Error fetching affiliate earnings:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Get affiliate commissions
 * GET /api/template-monetization/affiliate/commissions
 */
router.get('/affiliate/commissions', [
    query('status').optional().isString(),
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

        const status = req.query.status as string;
        const limit = parseInt(req.query.limit as string) || 50;
        const offset = parseInt(req.query.offset as string) || 0;

        const affiliateService = getAffiliateService();
        const commissions = await affiliateService.getAffiliateCommissions(
            userId,
            status,
            limit,
            offset
        );

        res.json({
            success: true,
            data: commissions
        });
    } catch (error: any) {
        console.error('Error fetching commissions:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Get top performing links
 * GET /api/template-monetization/affiliate/top-links
 */
router.get('/affiliate/top-links', [
    query('limit').optional().isInt({ min: 1, max: 50 })
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

        const limit = parseInt(req.query.limit as string) || 10;

        const affiliateService = getAffiliateService();
        const links = await affiliateService.getTopPerformingLinks(userId, limit);

        res.json({
            success: true,
            data: links
        });
    } catch (error: any) {
        console.error('Error fetching top links:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Track affiliate click (public endpoint)
 * GET /api/template-monetization/ref/:linkCode
 */
router.get('/ref/:linkCode', [
    param('linkCode').isString()
], async (req: Request, res: Response) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const affiliateService = getAffiliateService();
        const clickData = await affiliateService.trackClick(
            req.params.linkCode,
            {
                ip_address: req.ip,
                user_agent: req.headers['user-agent'],
                referer: req.headers['referer'] as string
            }
        );

        // Set cookie for 30 days
        res.cookie('affiliate_tracking', clickData.cookie_id, {
            maxAge: 30 * 24 * 60 * 60 * 1000,
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production'
        });

        // Redirect to homepage or target
        res.redirect('/');
    } catch (error: any) {
        console.error('Error tracking click:', error);
        res.redirect('/');
    }
});

export default router;
