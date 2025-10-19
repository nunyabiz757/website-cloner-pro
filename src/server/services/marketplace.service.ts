/**
 * Marketplace Service
 *
 * Manages white-label marketplace settings, branding, sellers, listings, and transactions.
 */

import { Pool } from 'pg';
import { getPool } from '../config/database.js';
import { getRedisCacheService } from './redis-cache.service.js';
import type { RedisCacheService } from './redis-cache.service.js';
import { logAuditEvent } from '../utils/audit-logger.js';
import { customAlphabet } from 'nanoid';

const nanoid = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 10);

// ============================================================================
// INTERFACES
// ============================================================================

export interface MarketplaceSettings {
    id: string;
    user_id: string;
    team_id?: string;
    marketplace_name: string;
    marketplace_slug: string;
    tagline?: string;
    description?: string;
    custom_domain?: string;
    subdomain?: string;
    ssl_enabled: boolean;
    domain_verified: boolean;
    domain_verified_at?: Date;
    logo_url?: string;
    favicon_url?: string;
    hero_image_url?: string;
    primary_color: string;
    secondary_color: string;
    accent_color: string;
    background_color: string;
    text_color: string;
    font_family: string;
    heading_font?: string;
    contact_email?: string;
    support_email?: string;
    phone?: string;
    address?: string;
    social_links: Record<string, string>;
    meta_title?: string;
    meta_description?: string;
    meta_keywords?: string;
    og_image_url?: string;
    enable_seller_registration: boolean;
    enable_reviews: boolean;
    enable_favorites: boolean;
    enable_messaging: boolean;
    require_approval: boolean;
    default_commission_rate: number;
    commission_type: string;
    payment_providers: string[];
    payout_schedule: string;
    minimum_payout_amount: number;
    auto_publish_templates: boolean;
    require_template_review: boolean;
    template_approval_workflow_id?: string;
    terms_url?: string;
    privacy_url?: string;
    refund_policy_url?: string;
    google_analytics_id?: string;
    facebook_pixel_id?: string;
    is_active: boolean;
    is_public: boolean;
    launched_at?: Date;
    custom_css?: string;
    custom_js?: string;
    custom_head_html?: string;
    metadata: Record<string, any>;
    created_at: Date;
    updated_at: Date;
}

export interface SellerProfile {
    id: string;
    user_id: string;
    marketplace_id: string;
    display_name: string;
    slug: string;
    bio?: string;
    avatar_url?: string;
    cover_image_url?: string;
    public_email?: string;
    website_url?: string;
    social_links: Record<string, string>;
    status: 'pending' | 'active' | 'suspended' | 'banned';
    verified: boolean;
    verified_at?: Date;
    featured: boolean;
    total_templates: number;
    total_sales: number;
    total_revenue: number;
    average_rating: number;
    total_reviews: number;
    custom_commission_rate?: number;
    commission_type?: string;
    payout_method?: string;
    payout_details: Record<string, any>;
    payout_schedule?: string;
    application_date: Date;
    application_notes?: string;
    approved_by?: string;
    approved_at?: Date;
    rejection_reason?: string;
    metadata: Record<string, any>;
    created_at: Date;
    updated_at: Date;
}

export interface MarketplaceListing {
    id: string;
    marketplace_id: string;
    seller_id: string;
    template_id: string;
    category_id?: string;
    title: string;
    description?: string;
    features: string[];
    tags: string[];
    price: number;
    currency: string;
    is_free: boolean;
    original_price?: number;
    discount_percentage?: number;
    images: string[];
    demo_url?: string;
    video_url?: string;
    status: 'draft' | 'pending_review' | 'active' | 'rejected' | 'suspended';
    published_at?: Date;
    rejected_at?: Date;
    rejection_reason?: string;
    views: number;
    clones: number;
    sales: number;
    revenue: number;
    average_rating: number;
    review_count: number;
    meta_title?: string;
    meta_description?: string;
    is_featured: boolean;
    featured_until?: Date;
    metadata: Record<string, any>;
    created_at: Date;
    updated_at: Date;
}

export interface MarketplaceTransaction {
    id: string;
    marketplace_id: string;
    seller_id: string;
    buyer_id?: string;
    template_id: string;
    transaction_type: string;
    amount: number;
    currency: string;
    commission_rate: number;
    commission_amount: number;
    seller_amount: number;
    marketplace_amount: number;
    payment_method?: string;
    payment_provider?: string;
    payment_provider_id?: string;
    payment_status: string;
    invoice_number?: string;
    invoice_url?: string;
    transaction_date: Date;
    completed_at?: Date;
    refunded_at?: Date;
    metadata: Record<string, any>;
    created_at: Date;
}

export interface MarketplaceStatistics {
    total_sellers: number;
    active_sellers: number;
    total_listings: number;
    active_listings: number;
    total_transactions: number;
    gross_revenue: number;
    commission_earned: number;
    avg_transaction_value: number;
    total_reviews: number;
    avg_rating: number;
}

// ============================================================================
// REQUEST/RESPONSE INTERFACES
// ============================================================================

export interface CreateMarketplaceParams {
    user_id: string;
    team_id?: string;
    marketplace_name: string;
    marketplace_slug?: string;
    tagline?: string;
    description?: string;
    subdomain?: string;
    primary_color?: string;
    secondary_color?: string;
    accent_color?: string;
}

export interface UpdateMarketplaceParams {
    marketplace_id: string;
    user_id: string;
    marketplace_name?: string;
    tagline?: string;
    description?: string;
    custom_domain?: string;
    subdomain?: string;
    logo_url?: string;
    favicon_url?: string;
    hero_image_url?: string;
    primary_color?: string;
    secondary_color?: string;
    accent_color?: string;
    background_color?: string;
    text_color?: string;
    font_family?: string;
    heading_font?: string;
    contact_email?: string;
    support_email?: string;
    phone?: string;
    address?: string;
    social_links?: Record<string, string>;
    meta_title?: string;
    meta_description?: string;
    meta_keywords?: string;
    og_image_url?: string;
    enable_seller_registration?: boolean;
    enable_reviews?: boolean;
    enable_favorites?: boolean;
    enable_messaging?: boolean;
    require_approval?: boolean;
    default_commission_rate?: number;
    commission_type?: string;
    payment_providers?: string[];
    payout_schedule?: string;
    minimum_payout_amount?: number;
    auto_publish_templates?: boolean;
    require_template_review?: boolean;
    template_approval_workflow_id?: string;
    terms_url?: string;
    privacy_url?: string;
    refund_policy_url?: string;
    google_analytics_id?: string;
    facebook_pixel_id?: string;
    is_active?: boolean;
    is_public?: boolean;
    custom_css?: string;
    custom_js?: string;
    custom_head_html?: string;
}

export interface ApplyAsSellerParams {
    user_id: string;
    marketplace_id: string;
    display_name: string;
    bio?: string;
    avatar_url?: string;
    public_email?: string;
    website_url?: string;
    social_links?: Record<string, string>;
    payout_method?: string;
    payout_details?: Record<string, any>;
    application_notes?: string;
}

export interface CreateListingParams {
    marketplace_id: string;
    seller_id: string;
    template_id: string;
    category_id?: string;
    title: string;
    description?: string;
    features?: string[];
    tags?: string[];
    price?: number;
    currency?: string;
    is_free?: boolean;
    original_price?: number;
    images?: string[];
    demo_url?: string;
    video_url?: string;
}

// ============================================================================
// SERVICE CLASS
// ============================================================================

export class MarketplaceService {
    private pool: Pool;
    private cache: RedisCacheService;

    constructor() {
        this.pool = getPool();
        this.cache = getRedisCacheService();
    }

    // ========================================================================
    // MARKETPLACE MANAGEMENT
    // ========================================================================

    /**
     * Create a new marketplace
     */
    async createMarketplace(params: CreateMarketplaceParams): Promise<MarketplaceSettings> {
        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            // Generate slug if not provided
            const slug = params.marketplace_slug || this.generateSlug(params.marketplace_name);

            // Check if slug is available
            const existing = await client.query(
                'SELECT id FROM marketplace_settings WHERE marketplace_slug = $1',
                [slug]
            );

            if (existing.rows.length > 0) {
                throw new Error('Marketplace slug already exists');
            }

            // Generate subdomain
            const subdomain = params.subdomain || slug;

            const result = await client.query<MarketplaceSettings>(
                `INSERT INTO marketplace_settings (
                    user_id, team_id, marketplace_name, marketplace_slug,
                    tagline, description, subdomain,
                    primary_color, secondary_color, accent_color
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                RETURNING *`,
                [
                    params.user_id,
                    params.team_id || null,
                    params.marketplace_name,
                    slug,
                    params.tagline || null,
                    params.description || null,
                    subdomain,
                    params.primary_color || '#000000',
                    params.secondary_color || '#ffffff',
                    params.accent_color || '#007bff'
                ]
            );

            await client.query('COMMIT');

            const marketplace = this.mapMarketplaceRow(result.rows[0]);

            await logAuditEvent({
                userId: params.user_id,
                action: 'marketplace.created',
                resourceType: 'marketplace',
                resourceId: marketplace.id,
                details: {
                    marketplace_name: marketplace.marketplace_name,
                    slug: marketplace.marketplace_slug
                }
            });

            return marketplace;

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Get marketplace by ID
     */
    async getMarketplace(marketplaceId: string): Promise<MarketplaceSettings | null> {
        const cacheKey = `marketplace:${marketplaceId}`;
        const cached = await this.cache.get<MarketplaceSettings>(cacheKey);
        if (cached) return cached;

        const result = await this.pool.query<MarketplaceSettings>(
            'SELECT * FROM marketplace_settings WHERE id = $1',
            [marketplaceId]
        );

        if (result.rows.length === 0) {
            return null;
        }

        const marketplace = this.mapMarketplaceRow(result.rows[0]);

        // Cache for 10 minutes
        await this.cache.set(cacheKey, marketplace, { ttl: 600 });

        return marketplace;
    }

    /**
     * Get marketplace by slug
     */
    async getMarketplaceBySlug(slug: string): Promise<MarketplaceSettings | null> {
        const cacheKey = `marketplace:slug:${slug}`;
        const cached = await this.cache.get<MarketplaceSettings>(cacheKey);
        if (cached) return cached;

        const result = await this.pool.query<MarketplaceSettings>(
            'SELECT * FROM marketplace_settings WHERE marketplace_slug = $1',
            [slug]
        );

        if (result.rows.length === 0) {
            return null;
        }

        const marketplace = this.mapMarketplaceRow(result.rows[0]);

        // Cache for 10 minutes
        await this.cache.set(cacheKey, marketplace, { ttl: 600 });

        return marketplace;
    }

    /**
     * Update marketplace settings
     */
    async updateMarketplace(params: UpdateMarketplaceParams): Promise<MarketplaceSettings> {
        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            // Check ownership
            const marketplace = await client.query(
                'SELECT user_id FROM marketplace_settings WHERE id = $1',
                [params.marketplace_id]
            );

            if (marketplace.rows.length === 0) {
                throw new Error('Marketplace not found');
            }

            if (marketplace.rows[0].user_id !== params.user_id) {
                throw new Error('Not authorized to update this marketplace');
            }

            // Build update query
            const updates: string[] = [];
            const values: any[] = [];
            let paramCount = 1;

            // Add all possible updates
            const fields: Array<keyof UpdateMarketplaceParams> = [
                'marketplace_name', 'tagline', 'description', 'custom_domain', 'subdomain',
                'logo_url', 'favicon_url', 'hero_image_url',
                'primary_color', 'secondary_color', 'accent_color', 'background_color', 'text_color',
                'font_family', 'heading_font',
                'contact_email', 'support_email', 'phone', 'address',
                'meta_title', 'meta_description', 'meta_keywords', 'og_image_url',
                'enable_seller_registration', 'enable_reviews', 'enable_favorites', 'enable_messaging', 'require_approval',
                'default_commission_rate', 'commission_type',
                'payout_schedule', 'minimum_payout_amount',
                'auto_publish_templates', 'require_template_review', 'template_approval_workflow_id',
                'terms_url', 'privacy_url', 'refund_policy_url',
                'google_analytics_id', 'facebook_pixel_id',
                'is_active', 'is_public',
                'custom_css', 'custom_js', 'custom_head_html'
            ];

            for (const field of fields) {
                if (params[field] !== undefined) {
                    updates.push(`${field} = $${paramCount++}`);
                    values.push(params[field]);
                }
            }

            // Handle social_links and payment_providers separately (JSONB)
            if (params.social_links !== undefined) {
                updates.push(`social_links = $${paramCount++}`);
                values.push(JSON.stringify(params.social_links));
            }

            if (params.payment_providers !== undefined) {
                updates.push(`payment_providers = $${paramCount++}`);
                values.push(JSON.stringify(params.payment_providers));
            }

            if (updates.length === 0) {
                throw new Error('No updates provided');
            }

            values.push(params.marketplace_id);

            const result = await client.query<MarketplaceSettings>(
                `UPDATE marketplace_settings
                SET ${updates.join(', ')}
                WHERE id = $${paramCount}
                RETURNING *`,
                values
            );

            await client.query('COMMIT');

            const updated = this.mapMarketplaceRow(result.rows[0]);

            await logAuditEvent({
                userId: params.user_id,
                action: 'marketplace.updated',
                resourceType: 'marketplace',
                resourceId: updated.id
            });

            // Invalidate cache
            await this.cache.delete(`marketplace:${params.marketplace_id}`);
            await this.cache.delete(`marketplace:slug:${updated.marketplace_slug}`);

            return updated;

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Get marketplaces for a user
     */
    async getUserMarketplaces(userId: string): Promise<MarketplaceSettings[]> {
        const result = await this.pool.query<MarketplaceSettings>(
            'SELECT * FROM marketplace_settings WHERE user_id = $1 ORDER BY created_at DESC',
            [userId]
        );

        return result.rows.map(row => this.mapMarketplaceRow(row));
    }

    // ========================================================================
    // SELLER MANAGEMENT
    // ========================================================================

    /**
     * Apply to become a seller
     */
    async applyAsSeller(params: ApplyAsSellerParams): Promise<SellerProfile> {
        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            // Check if already applied
            const existing = await client.query(
                'SELECT id, status FROM seller_profiles WHERE marketplace_id = $1 AND user_id = $2',
                [params.marketplace_id, params.user_id]
            );

            if (existing.rows.length > 0) {
                const status = existing.rows[0].status;
                if (status === 'active') {
                    throw new Error('Already an active seller');
                } else if (status === 'pending') {
                    throw new Error('Application already pending');
                } else if (status === 'banned') {
                    throw new Error('Banned from this marketplace');
                }
            }

            // Generate slug from display name
            const slug = this.generateSlug(params.display_name);

            // Check slug uniqueness
            const slugCheck = await client.query(
                'SELECT id FROM seller_profiles WHERE marketplace_id = $1 AND slug = $2',
                [params.marketplace_id, slug]
            );

            if (slugCheck.rows.length > 0) {
                throw new Error('Display name already taken');
            }

            // Get marketplace settings
            const marketplace = await client.query(
                'SELECT require_approval FROM marketplace_settings WHERE id = $1',
                [params.marketplace_id]
            );

            if (marketplace.rows.length === 0) {
                throw new Error('Marketplace not found');
            }

            const requireApproval = marketplace.rows[0].require_approval;
            const initialStatus = requireApproval ? 'pending' : 'active';

            const result = await client.query<SellerProfile>(
                `INSERT INTO seller_profiles (
                    user_id, marketplace_id, display_name, slug,
                    bio, avatar_url, public_email, website_url, social_links,
                    payout_method, payout_details, application_notes, status
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                RETURNING *`,
                [
                    params.user_id,
                    params.marketplace_id,
                    params.display_name,
                    slug,
                    params.bio || null,
                    params.avatar_url || null,
                    params.public_email || null,
                    params.website_url || null,
                    JSON.stringify(params.social_links || {}),
                    params.payout_method || null,
                    JSON.stringify(params.payout_details || {}),
                    params.application_notes || null,
                    initialStatus
                ]
            );

            await client.query('COMMIT');

            const seller = this.mapSellerRow(result.rows[0]);

            await logAuditEvent({
                userId: params.user_id,
                action: 'seller.applied',
                resourceType: 'seller_profile',
                resourceId: seller.id,
                details: {
                    marketplace_id: params.marketplace_id,
                    display_name: params.display_name
                }
            });

            return seller;

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Approve seller application
     */
    async approveSeller(sellerId: string, approvedBy: string): Promise<void> {
        await this.pool.query(
            `UPDATE seller_profiles
            SET status = 'active', approved_by = $1, approved_at = CURRENT_TIMESTAMP
            WHERE id = $2`,
            [approvedBy, sellerId]
        );

        await logAuditEvent({
            userId: approvedBy,
            action: 'seller.approved',
            resourceType: 'seller_profile',
            resourceId: sellerId
        });
    }

    /**
     * Reject seller application
     */
    async rejectSeller(sellerId: string, rejectedBy: string, reason: string): Promise<void> {
        await this.pool.query(
            `UPDATE seller_profiles
            SET status = 'rejected', rejection_reason = $1
            WHERE id = $2`,
            [reason, sellerId]
        );

        await logAuditEvent({
            userId: rejectedBy,
            action: 'seller.rejected',
            resourceType: 'seller_profile',
            resourceId: sellerId,
            details: { reason }
        });
    }

    /**
     * Get seller profile
     */
    async getSellerProfile(sellerId: string): Promise<SellerProfile | null> {
        const result = await this.pool.query<SellerProfile>(
            'SELECT * FROM seller_profiles WHERE id = $1',
            [sellerId]
        );

        if (result.rows.length === 0) {
            return null;
        }

        return this.mapSellerRow(result.rows[0]);
    }

    /**
     * Get sellers for marketplace
     */
    async getMarketplaceSellers(
        marketplaceId: string,
        status?: string,
        limit: number = 50
    ): Promise<SellerProfile[]> {
        let query = 'SELECT * FROM seller_profiles WHERE marketplace_id = $1';
        const params: any[] = [marketplaceId];

        if (status) {
            query += ' AND status = $2';
            params.push(status);
        }

        query += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1);
        params.push(limit);

        const result = await this.pool.query<SellerProfile>(query, params);

        return result.rows.map(row => this.mapSellerRow(row));
    }

    // ========================================================================
    // LISTING MANAGEMENT
    // ========================================================================

    /**
     * Create a template listing
     */
    async createListing(params: CreateListingParams): Promise<MarketplaceListing> {
        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            // Check if seller is active
            const seller = await client.query(
                'SELECT status FROM seller_profiles WHERE id = $1',
                [params.seller_id]
            );

            if (seller.rows.length === 0 || seller.rows[0].status !== 'active') {
                throw new Error('Seller not active');
            }

            // Check if template already listed
            const existing = await client.query(
                'SELECT id FROM marketplace_template_listings WHERE marketplace_id = $1 AND template_id = $2',
                [params.marketplace_id, params.template_id]
            );

            if (existing.rows.length > 0) {
                throw new Error('Template already listed in this marketplace');
            }

            // Get marketplace settings
            const marketplace = await client.query(
                'SELECT require_template_review, auto_publish_templates FROM marketplace_settings WHERE id = $1',
                [params.marketplace_id]
            );

            if (marketplace.rows.length === 0) {
                throw new Error('Marketplace not found');
            }

            const requireReview = marketplace.rows[0].require_template_review;
            const autoPublish = marketplace.rows[0].auto_publish_templates;

            let initialStatus = 'draft';
            if (autoPublish) {
                initialStatus = 'active';
            } else if (requireReview) {
                initialStatus = 'pending_review';
            }

            const result = await client.query<MarketplaceListing>(
                `INSERT INTO marketplace_template_listings (
                    marketplace_id, seller_id, template_id, category_id,
                    title, description, features, tags,
                    price, currency, is_free, original_price,
                    images, demo_url, video_url, status
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
                RETURNING *`,
                [
                    params.marketplace_id,
                    params.seller_id,
                    params.template_id,
                    params.category_id || null,
                    params.title,
                    params.description || null,
                    params.features || [],
                    params.tags || [],
                    params.price || 0,
                    params.currency || 'USD',
                    params.is_free || false,
                    params.original_price || null,
                    params.images || [],
                    params.demo_url || null,
                    params.video_url || null,
                    initialStatus
                ]
            );

            await client.query('COMMIT');

            return this.mapListingRow(result.rows[0]);

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Get marketplace listings
     */
    async getMarketplaceListings(
        marketplaceId: string,
        filters?: {
            status?: string;
            seller_id?: string;
            category_id?: string;
            is_featured?: boolean;
            limit?: number;
            offset?: number;
        }
    ): Promise<{ listings: MarketplaceListing[], total: number }> {
        const conditions: string[] = ['marketplace_id = $1'];
        const params: any[] = [marketplaceId];
        let paramCount = 2;

        if (filters?.status) {
            conditions.push(`status = $${paramCount++}`);
            params.push(filters.status);
        }

        if (filters?.seller_id) {
            conditions.push(`seller_id = $${paramCount++}`);
            params.push(filters.seller_id);
        }

        if (filters?.category_id) {
            conditions.push(`category_id = $${paramCount++}`);
            params.push(filters.category_id);
        }

        if (filters?.is_featured !== undefined) {
            conditions.push(`is_featured = $${paramCount++}`);
            params.push(filters.is_featured);
        }

        const whereClause = conditions.join(' AND ');

        // Get total count
        const countResult = await this.pool.query(
            `SELECT COUNT(*) FROM marketplace_template_listings WHERE ${whereClause}`,
            params
        );

        const total = parseInt(countResult.rows[0].count);

        // Get listings
        const limit = filters?.limit || 50;
        const offset = filters?.offset || 0;

        params.push(limit, offset);

        const result = await this.pool.query<MarketplaceListing>(
            `SELECT * FROM marketplace_template_listings
            WHERE ${whereClause}
            ORDER BY is_featured DESC, published_at DESC NULLS LAST
            LIMIT $${paramCount++} OFFSET $${paramCount++}`,
            params
        );

        const listings = result.rows.map(row => this.mapListingRow(row));

        return { listings, total };
    }

    /**
     * Get marketplace statistics
     */
    async getMarketplaceStatistics(
        marketplaceId: string,
        startDate: Date,
        endDate: Date
    ): Promise<MarketplaceStatistics> {
        const cacheKey = `marketplace_stats:${marketplaceId}:${startDate.toISOString()}:${endDate.toISOString()}`;
        const cached = await this.cache.get<MarketplaceStatistics>(cacheKey);
        if (cached) return cached;

        const result = await this.pool.query<MarketplaceStatistics>(
            'SELECT * FROM get_marketplace_statistics($1, $2, $3)',
            [marketplaceId, startDate, endDate]
        );

        const stats = result.rows[0];

        // Cache for 10 minutes
        await this.cache.set(cacheKey, stats, { ttl: 600 });

        return stats;
    }

    // ========================================================================
    // HELPER METHODS
    // ========================================================================

    /**
     * Generate URL-safe slug from text
     */
    private generateSlug(text: string): string {
        const base = text
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '');

        return `${base}-${nanoid(6)}`;
    }

    /**
     * Map database row to MarketplaceSettings
     */
    private mapMarketplaceRow(row: any): MarketplaceSettings {
        return {
            ...row,
            social_links: typeof row.social_links === 'string' ? JSON.parse(row.social_links) : row.social_links,
            payment_providers: typeof row.payment_providers === 'string' ? JSON.parse(row.payment_providers) : row.payment_providers,
            metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
            domain_verified_at: row.domain_verified_at ? new Date(row.domain_verified_at) : undefined,
            launched_at: row.launched_at ? new Date(row.launched_at) : undefined,
            created_at: new Date(row.created_at),
            updated_at: new Date(row.updated_at)
        };
    }

    /**
     * Map database row to SellerProfile
     */
    private mapSellerRow(row: any): SellerProfile {
        return {
            ...row,
            social_links: typeof row.social_links === 'string' ? JSON.parse(row.social_links) : row.social_links,
            payout_details: typeof row.payout_details === 'string' ? JSON.parse(row.payout_details) : row.payout_details,
            metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
            verified_at: row.verified_at ? new Date(row.verified_at) : undefined,
            application_date: new Date(row.application_date),
            approved_at: row.approved_at ? new Date(row.approved_at) : undefined,
            created_at: new Date(row.created_at),
            updated_at: new Date(row.updated_at)
        };
    }

    /**
     * Map database row to MarketplaceListing
     */
    private mapListingRow(row: any): MarketplaceListing {
        return {
            ...row,
            metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
            published_at: row.published_at ? new Date(row.published_at) : undefined,
            rejected_at: row.rejected_at ? new Date(row.rejected_at) : undefined,
            featured_until: row.featured_until ? new Date(row.featured_until) : undefined,
            created_at: new Date(row.created_at),
            updated_at: new Date(row.updated_at)
        };
    }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let instance: MarketplaceService | null = null;

export function getMarketplaceService(): MarketplaceService {
    if (!instance) {
        instance = new MarketplaceService();
    }
    return instance;
}
