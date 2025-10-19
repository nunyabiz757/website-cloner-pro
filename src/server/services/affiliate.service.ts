import { Pool } from 'pg';
import { getPool } from '../config/database.js';
import { getRedisCacheService } from './redis-cache.service.js';
import type { RedisCacheService } from './redis-cache.service.js';
import { logAuditEvent } from '../utils/audit-logger.js';
import * as crypto from 'crypto';

// =====================================================================================
// Types and Interfaces
// =====================================================================================

export interface AffiliateLink {
    id: string;
    affiliate_id: string;
    link_code: string;
    link_url: string;
    target_type: 'general' | 'template' | 'marketplace';
    target_id?: string;
    clicks: number;
    conversions: number;
    conversion_rate: number;
    total_commission: number;
    currency: string;
    is_active: boolean;
    cookie_duration_days: number;
    campaign_name?: string;
    metadata: Record<string, any>;
    created_at: Date;
    updated_at: Date;
    last_clicked_at?: Date;
}

export interface AffiliateClick {
    id: string;
    affiliate_link_id: string;
    affiliate_id: string;
    ip_address?: string;
    user_agent?: string;
    referer?: string;
    country?: string;
    city?: string;
    converted: boolean;
    purchase_id?: string;
    converted_at?: Date;
    cookie_id: string;
    expires_at: Date;
    created_at: Date;
}

export interface AffiliateCommission {
    id: string;
    affiliate_id: string;
    purchase_id: string;
    affiliate_link_id?: string;
    commission_amount: number;
    commission_percent: number;
    currency: string;
    status: 'pending' | 'approved' | 'paid' | 'reversed';
    payout_id?: string;
    paid_at?: Date;
    reversed: boolean;
    reversed_at?: Date;
    reversal_reason?: string;
    metadata: Record<string, any>;
    created_at: Date;
    updated_at: Date;
}

export interface CreateAffiliateLinkParams {
    affiliate_id: string;
    target_type: 'general' | 'template' | 'marketplace';
    target_id?: string;
    campaign_name?: string;
    cookie_duration_days?: number;
}

// =====================================================================================
// Affiliate Service
// =====================================================================================

export class AffiliateService {
    private pool: Pool;
    private cache: RedisCacheService;

    constructor() {
        this.pool = getPool();
        this.cache = getRedisCacheService();
    }

    // =====================================================================================
    // Affiliate Link Management
    // =====================================================================================

    /**
     * Generate unique link code
     */
    private generateLinkCode(): string {
        return crypto.randomBytes(8).toString('hex');
    }

    /**
     * Create affiliate link
     */
    async createAffiliateLink(params: CreateAffiliateLinkParams): Promise<AffiliateLink> {
        const linkCode = this.generateLinkCode();
        const baseUrl = process.env.APP_URL || 'https://app.example.com';
        const linkUrl = `${baseUrl}/ref/${linkCode}`;

        const result = await this.pool.query<AffiliateLink>(
            `INSERT INTO affiliate_links (
                affiliate_id, link_code, link_url,
                target_type, target_id, campaign_name, cookie_duration_days
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING *`,
            [
                params.affiliate_id,
                linkCode,
                linkUrl,
                params.target_type,
                params.target_id,
                params.campaign_name,
                params.cookie_duration_days || 30
            ]
        );

        const link = result.rows[0];

        // Audit log
        await logAuditEvent({
            userId: params.affiliate_id,
            action: 'affiliate_link.created',
            resourceType: 'affiliate_link',
            resourceId: link.id,
            details: { link_code: linkCode, target_type: params.target_type }
        });

        return this.formatLink(link);
    }

    /**
     * Get affiliate link by ID
     */
    async getAffiliateLinkById(linkId: string, affiliateId: string): Promise<AffiliateLink | null> {
        const result = await this.pool.query<AffiliateLink>(
            'SELECT * FROM affiliate_links WHERE id = $1 AND affiliate_id = $2',
            [linkId, affiliateId]
        );

        if (result.rows.length === 0) {
            return null;
        }

        return this.formatLink(result.rows[0]);
    }

    /**
     * Get affiliate link by code
     */
    async getAffiliateLinkByCode(linkCode: string): Promise<AffiliateLink | null> {
        // Check cache
        const cacheKey = `affiliate_link:${linkCode}`;
        const cached = await this.cache.get<AffiliateLink>(cacheKey);
        if (cached) {
            return cached;
        }

        const result = await this.pool.query<AffiliateLink>(
            'SELECT * FROM affiliate_links WHERE link_code = $1',
            [linkCode]
        );

        if (result.rows.length === 0) {
            return null;
        }

        const link = this.formatLink(result.rows[0]);

        // Cache for 5 minutes
        await this.cache.set(cacheKey, link, { ttl: 300 });

        return link;
    }

    /**
     * Get all affiliate links for user
     */
    async getAffiliateLinks(
        affiliateId: string,
        limit: number = 50,
        offset: number = 0
    ): Promise<AffiliateLink[]> {
        const result = await this.pool.query<AffiliateLink>(
            `SELECT * FROM affiliate_links
             WHERE affiliate_id = $1
             ORDER BY created_at DESC
             LIMIT $2 OFFSET $3`,
            [affiliateId, limit, offset]
        );

        return result.rows.map(row => this.formatLink(row));
    }

    /**
     * Update affiliate link
     */
    async updateAffiliateLink(
        linkId: string,
        affiliateId: string,
        updates: {
            is_active?: boolean;
            campaign_name?: string;
        }
    ): Promise<AffiliateLink> {
        const updateFields: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        if (updates.is_active !== undefined) {
            updateFields.push(`is_active = $${paramIndex}`);
            values.push(updates.is_active);
            paramIndex++;
        }

        if (updates.campaign_name !== undefined) {
            updateFields.push(`campaign_name = $${paramIndex}`);
            values.push(updates.campaign_name);
            paramIndex++;
        }

        if (updateFields.length === 0) {
            throw new Error('No fields to update');
        }

        updateFields.push('updated_at = NOW()');
        values.push(linkId, affiliateId);

        const result = await this.pool.query<AffiliateLink>(
            `UPDATE affiliate_links
             SET ${updateFields.join(', ')}
             WHERE id = $${paramIndex} AND affiliate_id = $${paramIndex + 1}
             RETURNING *`,
            values
        );

        if (result.rows.length === 0) {
            throw new Error('Affiliate link not found or unauthorized');
        }

        const link = result.rows[0];

        // Clear cache
        await this.cache.delete(`affiliate_link:${link.link_code}`);

        // Audit log
        await logAuditEvent({
            userId: affiliateId,
            action: 'affiliate_link.updated',
            resourceType: 'affiliate_link',
            resourceId: linkId,
            details: { updated_fields: Object.keys(updates) }
        });

        return this.formatLink(link);
    }

    /**
     * Delete affiliate link
     */
    async deleteAffiliateLink(linkId: string, affiliateId: string): Promise<void> {
        // Get link first to get link_code for cache clearing
        const linkResult = await this.pool.query<AffiliateLink>(
            'SELECT * FROM affiliate_links WHERE id = $1 AND affiliate_id = $2',
            [linkId, affiliateId]
        );

        if (linkResult.rows.length === 0) {
            throw new Error('Affiliate link not found or unauthorized');
        }

        const link = linkResult.rows[0];

        await this.pool.query(
            'DELETE FROM affiliate_links WHERE id = $1',
            [linkId]
        );

        // Clear cache
        await this.cache.delete(`affiliate_link:${link.link_code}`);

        // Audit log
        await logAuditEvent({
            userId: affiliateId,
            action: 'affiliate_link.deleted',
            resourceType: 'affiliate_link',
            resourceId: linkId,
            details: { link_code: link.link_code }
        });
    }

    // =====================================================================================
    // Click Tracking
    // =====================================================================================

    /**
     * Track affiliate click
     */
    async trackClick(
        linkCode: string,
        clickData: {
            ip_address?: string;
            user_agent?: string;
            referer?: string;
            country?: string;
            city?: string;
        }
    ): Promise<{ click_id: string; cookie_id: string }> {
        const result = await this.pool.query<{ click_id: string }>(
            'SELECT track_affiliate_click($1, $2, $3, $4) as click_id',
            [linkCode, clickData.ip_address, clickData.user_agent, clickData.referer]
        );

        const clickId = result.rows[0].click_id;

        // Get click details to retrieve cookie_id
        const clickResult = await this.pool.query<AffiliateClick>(
            'SELECT * FROM affiliate_clicks WHERE id = $1',
            [clickId]
        );

        const click = clickResult.rows[0];

        // Update location if provided
        if (clickData.country || clickData.city) {
            await this.pool.query(
                `UPDATE affiliate_clicks
                 SET country = $2, city = $3
                 WHERE id = $1`,
                [clickId, clickData.country, clickData.city]
            );
        }

        return {
            click_id: clickId,
            cookie_id: click.cookie_id
        };
    }

    /**
     * Get affiliate clicks
     */
    async getAffiliateClicks(
        affiliateId: string,
        linkId?: string,
        limit: number = 100,
        offset: number = 0
    ): Promise<AffiliateClick[]> {
        let query = 'SELECT * FROM affiliate_clicks WHERE affiliate_id = $1';
        const values: any[] = [affiliateId];
        let paramIndex = 2;

        if (linkId) {
            query += ` AND affiliate_link_id = $${paramIndex}`;
            values.push(linkId);
            paramIndex++;
        }

        query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        values.push(limit, offset);

        const result = await this.pool.query<AffiliateClick>(query, values);

        return result.rows.map(row => this.formatClick(row));
    }

    /**
     * Mark click as converted
     */
    async markClickConverted(cookieId: string, purchaseId: string): Promise<void> {
        await this.pool.query(
            `UPDATE affiliate_clicks
             SET converted = true,
                 purchase_id = $2,
                 converted_at = NOW()
             WHERE cookie_id = $1 AND expires_at > NOW()`,
            [cookieId, purchaseId]
        );
    }

    // =====================================================================================
    // Commission Management
    // =====================================================================================

    /**
     * Get affiliate commissions
     */
    async getAffiliateCommissions(
        affiliateId: string,
        status?: string,
        limit: number = 50,
        offset: number = 0
    ): Promise<AffiliateCommission[]> {
        let query = 'SELECT * FROM affiliate_commissions WHERE affiliate_id = $1';
        const values: any[] = [affiliateId];
        let paramIndex = 2;

        if (status) {
            query += ` AND status = $${paramIndex}`;
            values.push(status);
            paramIndex++;
        }

        query += ` ORDER BY created_at DESC LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        values.push(limit, offset);

        const result = await this.pool.query<AffiliateCommission>(query, values);

        return result.rows.map(row => this.formatCommission(row));
    }

    /**
     * Get commission by ID
     */
    async getCommissionById(commissionId: string): Promise<AffiliateCommission | null> {
        const result = await this.pool.query<AffiliateCommission>(
            'SELECT * FROM affiliate_commissions WHERE id = $1',
            [commissionId]
        );

        if (result.rows.length === 0) {
            return null;
        }

        return this.formatCommission(result.rows[0]);
    }

    /**
     * Update commission status
     */
    async updateCommissionStatus(
        commissionId: string,
        status: 'pending' | 'approved' | 'paid' | 'reversed',
        payoutId?: string
    ): Promise<AffiliateCommission> {
        const updates: string[] = ['status = $2'];
        const values: any[] = [commissionId, status];
        let paramIndex = 3;

        if (status === 'paid' && payoutId) {
            updates.push(`payout_id = $${paramIndex}`);
            updates.push('paid_at = NOW()');
            values.push(payoutId);
            paramIndex++;
        } else if (status === 'paid' && !payoutId) {
            updates.push('paid_at = NOW()');
        }

        updates.push('updated_at = NOW()');

        const result = await this.pool.query<AffiliateCommission>(
            `UPDATE affiliate_commissions
             SET ${updates.join(', ')}
             WHERE id = $1
             RETURNING *`,
            values
        );

        if (result.rows.length === 0) {
            throw new Error('Commission not found');
        }

        return this.formatCommission(result.rows[0]);
    }

    /**
     * Get affiliate earnings summary
     */
    async getAffiliateEarnings(affiliateId: string): Promise<{
        total_commissions: number;
        pending_commissions: number;
        approved_commissions: number;
        paid_commissions: number;
        total_clicks: number;
        total_conversions: number;
        conversion_rate: number;
    }> {
        const result = await this.pool.query(
            `SELECT
                COALESCE(SUM(CASE WHEN status != 'reversed' THEN commission_amount ELSE 0 END), 0) as total_commissions,
                COALESCE(SUM(CASE WHEN status = 'pending' THEN commission_amount ELSE 0 END), 0) as pending_commissions,
                COALESCE(SUM(CASE WHEN status = 'approved' THEN commission_amount ELSE 0 END), 0) as approved_commissions,
                COALESCE(SUM(CASE WHEN status = 'paid' THEN commission_amount ELSE 0 END), 0) as paid_commissions
             FROM affiliate_commissions
             WHERE affiliate_id = $1`,
            [affiliateId]
        );

        const clicksResult = await this.pool.query(
            `SELECT
                COUNT(*) as total_clicks,
                COUNT(*) FILTER (WHERE converted = true) as total_conversions
             FROM affiliate_clicks
             WHERE affiliate_id = $1`,
            [affiliateId]
        );

        const earnings = result.rows[0];
        const clicks = clicksResult.rows[0];

        return {
            total_commissions: parseFloat(earnings.total_commissions),
            pending_commissions: parseFloat(earnings.pending_commissions),
            approved_commissions: parseFloat(earnings.approved_commissions),
            paid_commissions: parseFloat(earnings.paid_commissions),
            total_clicks: parseInt(clicks.total_clicks),
            total_conversions: parseInt(clicks.total_conversions),
            conversion_rate: clicks.total_clicks > 0
                ? (clicks.total_conversions / clicks.total_clicks) * 100
                : 0
        };
    }

    /**
     * Get top performing links
     */
    async getTopPerformingLinks(
        affiliateId: string,
        limit: number = 10
    ): Promise<AffiliateLink[]> {
        const result = await this.pool.query<AffiliateLink>(
            `SELECT * FROM affiliate_links
             WHERE affiliate_id = $1
             ORDER BY total_commission DESC, conversions DESC
             LIMIT $2`,
            [affiliateId, limit]
        );

        return result.rows.map(row => this.formatLink(row));
    }

    // =====================================================================================
    // Helper Methods
    // =====================================================================================

    /**
     * Format link from database
     */
    private formatLink(row: any): AffiliateLink {
        return {
            ...row,
            metadata: typeof row.metadata === 'object' ? row.metadata : JSON.parse(row.metadata || '{}')
        };
    }

    /**
     * Format click from database
     */
    private formatClick(row: any): AffiliateClick {
        return row;
    }

    /**
     * Format commission from database
     */
    private formatCommission(row: any): AffiliateCommission {
        return {
            ...row,
            metadata: typeof row.metadata === 'object' ? row.metadata : JSON.parse(row.metadata || '{}')
        };
    }
}

// Singleton instance
let affiliateServiceInstance: AffiliateService | null = null;

export function getAffiliateService(): AffiliateService {
    if (!affiliateServiceInstance) {
        affiliateServiceInstance = new AffiliateService();
    }
    return affiliateServiceInstance;
}
