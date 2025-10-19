import { Pool } from 'pg';
import { getPool } from '../config/database.js';
import { getRedisCacheService } from './redis-cache.service.js';
import type { RedisCacheService } from './redis-cache.service.js';
import { logAuditEvent } from '../utils/audit-logger.js';

// =====================================================================================
// Types and Interfaces
// =====================================================================================

export interface TemplatePricing {
    id: string;
    template_id: string;
    creator_id: string;
    price: number;
    currency: string;
    pricing_model: 'one-time' | 'subscription' | 'free';
    license_type: 'standard' | 'extended' | 'commercial';
    license_terms?: string;
    platform_commission_percent: number;
    creator_revenue_percent: number;
    affiliate_commission_percent: number;
    discount_price?: number;
    discount_valid_from?: Date;
    discount_valid_until?: Date;
    is_for_sale: boolean;
    is_featured: boolean;
    metadata: Record<string, any>;
    created_at: Date;
    updated_at: Date;
}

export interface TemplatePurchase {
    id: string;
    template_id: string;
    buyer_id: string;
    creator_id: string;
    purchase_type: 'sale' | 'renewal' | 'upgrade';
    license_type: string;
    price_paid: number;
    currency: string;
    platform_revenue: number;
    creator_revenue: number;
    affiliate_commission: number;
    payment_id?: string;
    payment_status: 'pending' | 'completed' | 'refunded' | 'failed';
    affiliate_id?: string;
    affiliate_link_id?: string;
    refunded: boolean;
    refund_amount: number;
    refunded_at?: Date;
    refund_reason?: string;
    download_count: number;
    last_downloaded_at?: Date;
    access_expires_at?: Date;
    metadata: Record<string, any>;
    created_at: Date;
    updated_at: Date;
}

export interface CreatorEarnings {
    id: string;
    creator_id: string;
    total_earned: number;
    available_balance: number;
    pending_balance: number;
    withdrawn_total: number;
    currency: string;
    total_sales: number;
    total_refunds: number;
    total_templates_sold: number;
    minimum_payout: number;
    payout_method?: string;
    payout_details?: Record<string, any>;
    is_verified: boolean;
    verified_at?: Date;
    created_at: Date;
    updated_at: Date;
}

export interface CreatorPayout {
    id: string;
    creator_id: string;
    amount: number;
    currency: string;
    payout_method: string;
    status: 'pending' | 'processing' | 'completed' | 'failed' | 'canceled';
    processed_at?: Date;
    completed_at?: Date;
    failed_at?: Date;
    failure_reason?: string;
    stripe_payout_id?: string;
    paypal_payout_id?: string;
    transaction_id?: string;
    notes?: string;
    metadata: Record<string, any>;
    created_at: Date;
    updated_at: Date;
}

export interface CreatePricingParams {
    template_id: string;
    creator_id: string;
    price: number;
    currency?: string;
    pricing_model?: 'one-time' | 'subscription' | 'free';
    license_type?: 'standard' | 'extended' | 'commercial';
    license_terms?: string;
    platform_commission_percent?: number;
    creator_revenue_percent?: number;
    affiliate_commission_percent?: number;
    is_for_sale?: boolean;
}

export interface UpdatePricingParams {
    price?: number;
    discount_price?: number;
    discount_valid_from?: Date;
    discount_valid_until?: Date;
    is_for_sale?: boolean;
    is_featured?: boolean;
    license_terms?: string;
}

export interface PurchaseTemplateParams {
    template_id: string;
    buyer_id: string;
    payment_id?: string;
    affiliate_link_id?: string;
}

// =====================================================================================
// Template Monetization Service
// =====================================================================================

export class TemplateMonetizationService {
    private pool: Pool;
    private cache: RedisCacheService;

    constructor() {
        this.pool = getPool();
        this.cache = getRedisCacheService();
    }

    // =====================================================================================
    // Template Pricing Management
    // =====================================================================================

    /**
     * Create pricing for template
     */
    async createPricing(params: CreatePricingParams): Promise<TemplatePricing> {
        const result = await this.pool.query<TemplatePricing>(
            `INSERT INTO template_pricing (
                template_id, creator_id, price, currency,
                pricing_model, license_type, license_terms,
                platform_commission_percent, creator_revenue_percent, affiliate_commission_percent,
                is_for_sale
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            RETURNING *`,
            [
                params.template_id,
                params.creator_id,
                params.price,
                params.currency || 'USD',
                params.pricing_model || 'one-time',
                params.license_type || 'standard',
                params.license_terms,
                params.platform_commission_percent || 30.00,
                params.creator_revenue_percent || 70.00,
                params.affiliate_commission_percent || 10.00,
                params.is_for_sale !== undefined ? params.is_for_sale : true
            ]
        );

        const pricing = result.rows[0];

        // Clear cache
        await this.cache.delete(`template_pricing:${params.template_id}`);

        // Audit log
        await logAuditEvent({
            userId: params.creator_id,
            action: 'template_pricing.created',
            resourceType: 'template_pricing',
            resourceId: pricing.id,
            details: { template_id: params.template_id, price: params.price }
        });

        return this.formatPricing(pricing);
    }

    /**
     * Get pricing for template
     */
    async getTemplatePricing(templateId: string): Promise<TemplatePricing | null> {
        // Check cache
        const cacheKey = `template_pricing:${templateId}`;
        const cached = await this.cache.get<TemplatePricing>(cacheKey);
        if (cached) {
            return cached;
        }

        const result = await this.pool.query<TemplatePricing>(
            'SELECT * FROM template_pricing WHERE template_id = $1',
            [templateId]
        );

        if (result.rows.length === 0) {
            return null;
        }

        const pricing = this.formatPricing(result.rows[0]);

        // Cache for 1 hour
        await this.cache.set(cacheKey, pricing, { ttl: 3600 });

        return pricing;
    }

    /**
     * Update template pricing
     */
    async updatePricing(
        templateId: string,
        creatorId: string,
        params: UpdatePricingParams
    ): Promise<TemplatePricing> {
        const updates: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        if (params.price !== undefined) {
            updates.push(`price = $${paramIndex}`);
            values.push(params.price);
            paramIndex++;
        }

        if (params.discount_price !== undefined) {
            updates.push(`discount_price = $${paramIndex}`);
            values.push(params.discount_price);
            paramIndex++;
        }

        if (params.discount_valid_from !== undefined) {
            updates.push(`discount_valid_from = $${paramIndex}`);
            values.push(params.discount_valid_from);
            paramIndex++;
        }

        if (params.discount_valid_until !== undefined) {
            updates.push(`discount_valid_until = $${paramIndex}`);
            values.push(params.discount_valid_until);
            paramIndex++;
        }

        if (params.is_for_sale !== undefined) {
            updates.push(`is_for_sale = $${paramIndex}`);
            values.push(params.is_for_sale);
            paramIndex++;
        }

        if (params.is_featured !== undefined) {
            updates.push(`is_featured = $${paramIndex}`);
            values.push(params.is_featured);
            paramIndex++;
        }

        if (params.license_terms !== undefined) {
            updates.push(`license_terms = $${paramIndex}`);
            values.push(params.license_terms);
            paramIndex++;
        }

        if (updates.length === 0) {
            throw new Error('No fields to update');
        }

        updates.push('updated_at = NOW()');
        values.push(templateId, creatorId);

        const result = await this.pool.query<TemplatePricing>(
            `UPDATE template_pricing
             SET ${updates.join(', ')}
             WHERE template_id = $${paramIndex} AND creator_id = $${paramIndex + 1}
             RETURNING *`,
            values
        );

        if (result.rows.length === 0) {
            throw new Error('Template pricing not found or unauthorized');
        }

        const pricing = result.rows[0];

        // Clear cache
        await this.cache.delete(`template_pricing:${templateId}`);

        // Audit log
        await logAuditEvent({
            userId: creatorId,
            action: 'template_pricing.updated',
            resourceType: 'template_pricing',
            resourceId: pricing.id,
            details: { template_id: templateId, updated_fields: Object.keys(params) }
        });

        return this.formatPricing(pricing);
    }

    /**
     * Get featured templates for sale
     */
    async getFeaturedTemplates(limit: number = 20): Promise<TemplatePricing[]> {
        const result = await this.pool.query<TemplatePricing>(
            `SELECT * FROM template_pricing
             WHERE is_for_sale = true AND is_featured = true
             ORDER BY created_at DESC
             LIMIT $1`,
            [limit]
        );

        return result.rows.map(row => this.formatPricing(row));
    }

    // =====================================================================================
    // Template Purchase Management
    // =====================================================================================

    /**
     * Purchase template
     */
    async purchaseTemplate(params: PurchaseTemplateParams): Promise<TemplatePurchase> {
        const result = await this.pool.query<{ purchase_id: string }>(
            'SELECT process_template_purchase($1, $2, $3) as purchase_id',
            [params.template_id, params.buyer_id, params.affiliate_link_id]
        );

        const purchaseId = result.rows[0].purchase_id;

        // Update payment_id if provided
        if (params.payment_id) {
            await this.pool.query(
                `UPDATE template_purchases
                 SET payment_id = $1, payment_status = 'completed'
                 WHERE id = $2`,
                [params.payment_id, purchaseId]
            );
        }

        // Get purchase details
        const purchase = await this.getPurchaseById(purchaseId);

        if (!purchase) {
            throw new Error('Purchase not found after creation');
        }

        // Audit log
        await logAuditEvent({
            userId: params.buyer_id,
            action: 'template.purchased',
            resourceType: 'template_purchase',
            resourceId: purchaseId,
            details: { template_id: params.template_id, price: purchase.price_paid }
        });

        return purchase;
    }

    /**
     * Get purchase by ID
     */
    async getPurchaseById(purchaseId: string): Promise<TemplatePurchase | null> {
        const result = await this.pool.query<TemplatePurchase>(
            'SELECT * FROM template_purchases WHERE id = $1',
            [purchaseId]
        );

        if (result.rows.length === 0) {
            return null;
        }

        return this.formatPurchase(result.rows[0]);
    }

    /**
     * Get user's purchases
     */
    async getUserPurchases(
        userId: string,
        limit: number = 50,
        offset: number = 0
    ): Promise<TemplatePurchase[]> {
        const result = await this.pool.query<TemplatePurchase>(
            `SELECT * FROM template_purchases
             WHERE buyer_id = $1
             ORDER BY created_at DESC
             LIMIT $2 OFFSET $3`,
            [userId, limit, offset]
        );

        return result.rows.map(row => this.formatPurchase(row));
    }

    /**
     * Check if user owns template
     */
    async userOwnsTemplate(userId: string, templateId: string): Promise<boolean> {
        const result = await this.pool.query(
            `SELECT id FROM template_purchases
             WHERE buyer_id = $1 AND template_id = $2
             AND payment_status = 'completed'
             AND refunded = false
             LIMIT 1`,
            [userId, templateId]
        );

        return result.rows.length > 0;
    }

    /**
     * Track download
     */
    async trackDownload(purchaseId: string, userId: string): Promise<void> {
        await this.pool.query(
            `UPDATE template_purchases
             SET download_count = download_count + 1,
                 last_downloaded_at = NOW()
             WHERE id = $1 AND buyer_id = $2`,
            [purchaseId, userId]
        );
    }

    /**
     * Refund purchase
     */
    async refundPurchase(
        purchaseId: string,
        refundAmount: number,
        reason?: string
    ): Promise<TemplatePurchase> {
        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            // Get purchase
            const purchaseResult = await client.query<TemplatePurchase>(
                'SELECT * FROM template_purchases WHERE id = $1',
                [purchaseId]
            );

            if (purchaseResult.rows.length === 0) {
                throw new Error('Purchase not found');
            }

            const purchase = purchaseResult.rows[0];

            // Update purchase
            await client.query(
                `UPDATE template_purchases
                 SET refunded = true,
                     refund_amount = $2,
                     refunded_at = NOW(),
                     refund_reason = $3,
                     payment_status = 'refunded',
                     updated_at = NOW()
                 WHERE id = $1`,
                [purchaseId, refundAmount, reason]
            );

            // Update creator earnings
            await client.query(
                `UPDATE creator_earnings
                 SET total_earned = total_earned - $2,
                     available_balance = available_balance - $2,
                     total_refunds = total_refunds + 1,
                     updated_at = NOW()
                 WHERE creator_id = $1`,
                [purchase.creator_id, purchase.creator_revenue]
            );

            // Reverse affiliate commission if applicable
            if (purchase.affiliate_id && purchase.affiliate_commission > 0) {
                await client.query(
                    `UPDATE affiliate_commissions
                     SET reversed = true,
                         reversed_at = NOW(),
                         reversal_reason = $2,
                         status = 'reversed'
                     WHERE purchase_id = $1`,
                    [purchaseId, reason]
                );
            }

            await client.query('COMMIT');

            // Get updated purchase
            const updatedPurchase = await this.getPurchaseById(purchaseId);

            // Audit log
            await logAuditEvent({
                userId: purchase.buyer_id,
                action: 'template_purchase.refunded',
                resourceType: 'template_purchase',
                resourceId: purchaseId,
                details: { refund_amount: refundAmount, reason }
            });

            return updatedPurchase!;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    // =====================================================================================
    // Creator Earnings Management
    // =====================================================================================

    /**
     * Get creator earnings
     */
    async getCreatorEarnings(creatorId: string): Promise<CreatorEarnings | null> {
        const result = await this.pool.query<CreatorEarnings>(
            'SELECT * FROM creator_earnings WHERE creator_id = $1',
            [creatorId]
        );

        if (result.rows.length === 0) {
            return null;
        }

        return this.formatEarnings(result.rows[0]);
    }

    /**
     * Get creator statistics
     */
    async getCreatorStats(creatorId: string): Promise<any> {
        const result = await this.pool.query(
            'SELECT * FROM get_creator_stats($1)',
            [creatorId]
        );

        if (result.rows.length === 0) {
            return null;
        }

        return result.rows[0];
    }

    /**
     * Get creator sales history
     */
    async getCreatorSales(
        creatorId: string,
        limit: number = 50,
        offset: number = 0
    ): Promise<TemplatePurchase[]> {
        const result = await this.pool.query<TemplatePurchase>(
            `SELECT * FROM template_purchases
             WHERE creator_id = $1
             ORDER BY created_at DESC
             LIMIT $2 OFFSET $3`,
            [creatorId, limit, offset]
        );

        return result.rows.map(row => this.formatPurchase(row));
    }

    /**
     * Update payout settings
     */
    async updatePayoutSettings(
        creatorId: string,
        settings: {
            minimum_payout?: number;
            payout_method?: string;
            payout_details?: Record<string, any>;
        }
    ): Promise<CreatorEarnings> {
        const updates: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        if (settings.minimum_payout !== undefined) {
            updates.push(`minimum_payout = $${paramIndex}`);
            values.push(settings.minimum_payout);
            paramIndex++;
        }

        if (settings.payout_method !== undefined) {
            updates.push(`payout_method = $${paramIndex}`);
            values.push(settings.payout_method);
            paramIndex++;
        }

        if (settings.payout_details !== undefined) {
            updates.push(`payout_details = $${paramIndex}::jsonb`);
            values.push(JSON.stringify(settings.payout_details));
            paramIndex++;
        }

        if (updates.length === 0) {
            throw new Error('No fields to update');
        }

        updates.push('updated_at = NOW()');
        values.push(creatorId);

        // Ensure creator earnings record exists
        await this.pool.query(
            `INSERT INTO creator_earnings (creator_id, currency)
             VALUES ($1, 'USD')
             ON CONFLICT (creator_id) DO NOTHING`,
            [creatorId]
        );

        const result = await this.pool.query<CreatorEarnings>(
            `UPDATE creator_earnings
             SET ${updates.join(', ')}
             WHERE creator_id = $${paramIndex}
             RETURNING *`,
            values
        );

        return this.formatEarnings(result.rows[0]);
    }

    // =====================================================================================
    // Payout Management
    // =====================================================================================

    /**
     * Request payout
     */
    async requestPayout(
        creatorId: string,
        amount: number,
        payoutMethod: string
    ): Promise<CreatorPayout> {
        const result = await this.pool.query<{ payout_id: string }>(
            'SELECT request_payout($1, $2, $3) as payout_id',
            [creatorId, amount, payoutMethod]
        );

        const payoutId = result.rows[0].payout_id;

        // Get payout details
        const payout = await this.getPayoutById(payoutId);

        if (!payout) {
            throw new Error('Payout not found after creation');
        }

        // Audit log
        await logAuditEvent({
            userId: creatorId,
            action: 'payout.requested',
            resourceType: 'creator_payout',
            resourceId: payoutId,
            details: { amount, payout_method: payoutMethod }
        });

        return payout;
    }

    /**
     * Get payout by ID
     */
    async getPayoutById(payoutId: string): Promise<CreatorPayout | null> {
        const result = await this.pool.query<CreatorPayout>(
            'SELECT * FROM creator_payouts WHERE id = $1',
            [payoutId]
        );

        if (result.rows.length === 0) {
            return null;
        }

        return this.formatPayout(result.rows[0]);
    }

    /**
     * Get creator payouts
     */
    async getCreatorPayouts(
        creatorId: string,
        limit: number = 50,
        offset: number = 0
    ): Promise<CreatorPayout[]> {
        const result = await this.pool.query<CreatorPayout>(
            `SELECT * FROM creator_payouts
             WHERE creator_id = $1
             ORDER BY created_at DESC
             LIMIT $2 OFFSET $3`,
            [creatorId, limit, offset]
        );

        return result.rows.map(row => this.formatPayout(row));
    }

    /**
     * Update payout status
     */
    async updatePayoutStatus(
        payoutId: string,
        status: 'pending' | 'processing' | 'completed' | 'failed' | 'canceled',
        details?: {
            stripe_payout_id?: string;
            paypal_payout_id?: string;
            transaction_id?: string;
            failure_reason?: string;
        }
    ): Promise<CreatorPayout> {
        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            // Get current payout
            const payoutResult = await client.query<CreatorPayout>(
                'SELECT * FROM creator_payouts WHERE id = $1',
                [payoutId]
            );

            if (payoutResult.rows.length === 0) {
                throw new Error('Payout not found');
            }

            const payout = payoutResult.rows[0];

            // Build update query
            const updates: string[] = ['status = $2'];
            const values: any[] = [payoutId, status];
            let paramIndex = 3;

            if (status === 'processing') {
                updates.push('processed_at = NOW()');
            } else if (status === 'completed') {
                updates.push('completed_at = NOW()');
            } else if (status === 'failed') {
                updates.push('failed_at = NOW()');
            }

            if (details?.stripe_payout_id) {
                updates.push(`stripe_payout_id = $${paramIndex}`);
                values.push(details.stripe_payout_id);
                paramIndex++;
            }

            if (details?.paypal_payout_id) {
                updates.push(`paypal_payout_id = $${paramIndex}`);
                values.push(details.paypal_payout_id);
                paramIndex++;
            }

            if (details?.transaction_id) {
                updates.push(`transaction_id = $${paramIndex}`);
                values.push(details.transaction_id);
                paramIndex++;
            }

            if (details?.failure_reason) {
                updates.push(`failure_reason = $${paramIndex}`);
                values.push(details.failure_reason);
                paramIndex++;
            }

            updates.push('updated_at = NOW()');

            // Update payout
            await client.query(
                `UPDATE creator_payouts
                 SET ${updates.join(', ')}
                 WHERE id = $1`,
                values
            );

            // Update creator earnings based on status
            if (status === 'completed') {
                await client.query(
                    `UPDATE creator_earnings
                     SET pending_balance = pending_balance - $2,
                         withdrawn_total = withdrawn_total + $2,
                         updated_at = NOW()
                     WHERE creator_id = $1`,
                    [payout.creator_id, payout.amount]
                );
            } else if (status === 'failed' || status === 'canceled') {
                // Return amount to available balance
                await client.query(
                    `UPDATE creator_earnings
                     SET available_balance = available_balance + $2,
                         pending_balance = pending_balance - $2,
                         updated_at = NOW()
                     WHERE creator_id = $1`,
                    [payout.creator_id, payout.amount]
                );
            }

            await client.query('COMMIT');

            // Get updated payout
            const updatedPayout = await this.getPayoutById(payoutId);

            // Audit log
            await logAuditEvent({
                userId: payout.creator_id,
                action: `payout.${status}`,
                resourceType: 'creator_payout',
                resourceId: payoutId,
                details: { status, ...details }
            });

            return updatedPayout!;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    // =====================================================================================
    // Helper Methods
    // =====================================================================================

    /**
     * Format pricing from database
     */
    private formatPricing(row: any): TemplatePricing {
        return {
            ...row,
            metadata: typeof row.metadata === 'object' ? row.metadata : JSON.parse(row.metadata || '{}')
        };
    }

    /**
     * Format purchase from database
     */
    private formatPurchase(row: any): TemplatePurchase {
        return {
            ...row,
            metadata: typeof row.metadata === 'object' ? row.metadata : JSON.parse(row.metadata || '{}')
        };
    }

    /**
     * Format earnings from database
     */
    private formatEarnings(row: any): CreatorEarnings {
        return {
            ...row,
            payout_details: typeof row.payout_details === 'object'
                ? row.payout_details
                : JSON.parse(row.payout_details || '{}')
        };
    }

    /**
     * Format payout from database
     */
    private formatPayout(row: any): CreatorPayout {
        return {
            ...row,
            metadata: typeof row.metadata === 'object' ? row.metadata : JSON.parse(row.metadata || '{}')
        };
    }
}

// Singleton instance
let templateMonetizationServiceInstance: TemplateMonetizationService | null = null;

export function getTemplateMonetizationService(): TemplateMonetizationService {
    if (!templateMonetizationServiceInstance) {
        templateMonetizationServiceInstance = new TemplateMonetizationService();
    }
    return templateMonetizationServiceInstance;
}
