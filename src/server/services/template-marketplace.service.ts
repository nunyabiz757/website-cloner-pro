/**
 * Template Marketplace Service
 * Handles template CRUD, search, ratings, favorites, and recommendations
 */

import { Pool, PoolClient } from 'pg';
import { getPool } from '../config/database.js';
import { RedisCacheService } from './redis-cache.service.js';
import { logAuditEvent } from '../utils/audit-logger.js';

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface Template {
    id: string;
    userId: string;
    clonedPageId: string | null;
    name: string;
    description: string | null;
    categoryId: string | null;
    categoryName?: string;
    thumbnailUrl: string | null;
    previewUrl: string | null;
    isPublic: boolean;
    isPrivate: boolean;
    isFeatured: boolean;
    isVerified: boolean;
    priceCredits: number;
    ratingAverage: number;
    ratingCount: number;
    viewCount: number;
    downloadCount: number;
    useCount: number;
    favoriteCount: number;
    tags?: string[];
    createdAt: Date;
    updatedAt: Date;
}

export interface TemplateCategory {
    id: string;
    name: string;
    slug: string;
    description: string | null;
    icon: string | null;
    parentId: string | null;
    sortOrder: number;
    templateCount?: number;
    createdAt: Date;
    updatedAt: Date;
}

export interface TemplateTag {
    id: string;
    name: string;
    slug: string;
    usageCount: number;
    createdAt: Date;
}

export interface TemplateReview {
    id: string;
    templateId: string;
    userId: string;
    userName?: string;
    rating: number;
    reviewText: string | null;
    helpfulCount: number;
    isModerated: boolean;
    moderationStatus: string | null;
    createdAt: Date;
    updatedAt: Date;
}

export interface TemplateCollection {
    id: string;
    userId: string;
    name: string;
    description: string | null;
    isPublic: boolean;
    itemCount?: number;
    createdAt: Date;
    updatedAt: Date;
}

export interface CreateTemplateParams {
    userId: string;
    clonedPageId?: string;
    name: string;
    description?: string;
    categoryId?: string;
    thumbnailUrl?: string;
    previewUrl?: string;
    isPublic?: boolean;
    isPrivate?: boolean;
    priceCredits?: number;
    tags?: string[];
}

export interface UpdateTemplateParams {
    name?: string;
    description?: string;
    categoryId?: string;
    thumbnailUrl?: string;
    previewUrl?: string;
    isPublic?: boolean;
    isPrivate?: boolean;
    priceCredits?: number;
    tags?: string[];
}

export interface SearchTemplatesParams {
    query?: string;
    categoryId?: string;
    tags?: string[];
    minRating?: number;
    maxPrice?: number;
    isFeatured?: boolean;
    isVerified?: boolean;
    sortBy?: 'popular' | 'rating' | 'recent' | 'name';
    sortOrder?: 'asc' | 'desc';
    limit?: number;
    offset?: number;
}

export interface TemplateUsageEvent {
    templateId: string;
    userId: string;
    action: 'view' | 'download' | 'use' | 'favorite';
    metadata?: Record<string, any>;
}

// ============================================================================
// Service Class
// ============================================================================

export class TemplateMarketplaceService {
    private pool: Pool;
    private cache: RedisCacheService;

    constructor(pool: Pool, cache: RedisCacheService) {
        this.pool = pool;
        this.cache = cache;
    }

    // ========================================================================
    // Template CRUD Operations
    // ========================================================================

    /**
     * Create a new template
     */
    async createTemplate(params: CreateTemplateParams): Promise<Template> {
        const {
            userId,
            clonedPageId,
            name,
            description,
            categoryId,
            thumbnailUrl,
            previewUrl,
            isPublic = true,
            isPrivate = false,
            priceCredits = 0,
            tags = []
        } = params;

        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');

            // Create template
            const templateResult = await client.query(
                `INSERT INTO ghl_clone_templates (
                    user_id, cloned_page_id, name, description, category_id,
                    thumbnail_url, preview_url, is_public, is_private, price_credits
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                RETURNING *`,
                [userId, clonedPageId, name, description, categoryId,
                 thumbnailUrl, previewUrl, isPublic, isPrivate, priceCredits]
            );

            const template = templateResult.rows[0];

            // Add tags if provided
            if (tags.length > 0) {
                await this.addTemplateTags(template.id, tags, client);
            }

            await client.query('COMMIT');

            await logAuditEvent({
                userId,
                action: 'template:create',
                resource: 'template',
                resourceId: template.id,
                details: { name, categoryId, isPublic }
            });

            return this.mapTemplateRow(template);

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Get template by ID
     */
    async getTemplate(templateId: string, userId?: string): Promise<Template | null> {
        const cacheKey = `template:${templateId}`;
        const cached = await this.cache.get(cacheKey);

        if (cached) {
            return JSON.parse(cached);
        }

        const result = await this.pool.query(
            `SELECT t.*, c.name as category_name,
                    ARRAY_AGG(DISTINCT tg.name) FILTER (WHERE tg.name IS NOT NULL) as tags
             FROM ghl_clone_templates t
             LEFT JOIN template_categories c ON t.category_id = c.id
             LEFT JOIN template_tag_mappings tm ON t.id = tm.template_id
             LEFT JOIN template_tags tg ON tm.tag_id = tg.id
             WHERE t.id = $1
               AND (t.is_public = true OR t.user_id = $2)
             GROUP BY t.id, c.name`,
            [templateId, userId || null]
        );

        if (result.rows.length === 0) {
            return null;
        }

        const template = this.mapTemplateRow(result.rows[0]);

        // Cache for 5 minutes
        await this.cache.set(cacheKey, JSON.stringify(template), 300);

        // Track view if userId provided
        if (userId) {
            await this.trackUsage({ templateId, userId, action: 'view' });
        }

        return template;
    }

    /**
     * Update template
     */
    async updateTemplate(
        templateId: string,
        userId: string,
        params: UpdateTemplateParams
    ): Promise<Template> {
        const {
            name,
            description,
            categoryId,
            thumbnailUrl,
            previewUrl,
            isPublic,
            isPrivate,
            priceCredits,
            tags
        } = params;

        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');

            // Verify ownership
            const ownerCheck = await client.query(
                `SELECT user_id FROM ghl_clone_templates WHERE id = $1`,
                [templateId]
            );

            if (ownerCheck.rows.length === 0) {
                throw new Error('Template not found');
            }

            if (ownerCheck.rows[0].user_id !== userId) {
                throw new Error('Not authorized to update this template');
            }

            // Build update query dynamically
            const updates: string[] = [];
            const values: any[] = [];
            let paramCount = 1;

            if (name !== undefined) {
                updates.push(`name = $${paramCount++}`);
                values.push(name);
            }
            if (description !== undefined) {
                updates.push(`description = $${paramCount++}`);
                values.push(description);
            }
            if (categoryId !== undefined) {
                updates.push(`category_id = $${paramCount++}`);
                values.push(categoryId);
            }
            if (thumbnailUrl !== undefined) {
                updates.push(`thumbnail_url = $${paramCount++}`);
                values.push(thumbnailUrl);
            }
            if (previewUrl !== undefined) {
                updates.push(`preview_url = $${paramCount++}`);
                values.push(previewUrl);
            }
            if (isPublic !== undefined) {
                updates.push(`is_public = $${paramCount++}`);
                values.push(isPublic);
            }
            if (isPrivate !== undefined) {
                updates.push(`is_private = $${paramCount++}`);
                values.push(isPrivate);
            }
            if (priceCredits !== undefined) {
                updates.push(`price_credits = $${paramCount++}`);
                values.push(priceCredits);
            }

            updates.push(`updated_at = CURRENT_TIMESTAMP`);
            values.push(templateId);

            const updateResult = await client.query(
                `UPDATE ghl_clone_templates
                 SET ${updates.join(', ')}
                 WHERE id = $${paramCount}
                 RETURNING *`,
                values
            );

            // Update tags if provided
            if (tags !== undefined) {
                // Remove existing tags
                await client.query(
                    `DELETE FROM template_tag_mappings WHERE template_id = $1`,
                    [templateId]
                );

                // Add new tags
                if (tags.length > 0) {
                    await this.addTemplateTags(templateId, tags, client);
                }
            }

            await client.query('COMMIT');

            // Invalidate cache
            await this.cache.del(`template:${templateId}`);

            await logAuditEvent({
                userId,
                action: 'template:update',
                resource: 'template',
                resourceId: templateId,
                details: params
            });

            return this.mapTemplateRow(updateResult.rows[0]);

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Delete template
     */
    async deleteTemplate(templateId: string, userId: string): Promise<void> {
        const result = await this.pool.query(
            `DELETE FROM ghl_clone_templates
             WHERE id = $1 AND user_id = $2
             RETURNING id`,
            [templateId, userId]
        );

        if (result.rows.length === 0) {
            throw new Error('Template not found or not authorized');
        }

        await this.cache.del(`template:${templateId}`);

        await logAuditEvent({
            userId,
            action: 'template:delete',
            resource: 'template',
            resourceId: templateId
        });
    }

    // ========================================================================
    // Search & Discovery
    // ========================================================================

    /**
     * Search templates with filters
     */
    async searchTemplates(params: SearchTemplatesParams, userId?: string): Promise<{
        templates: Template[];
        total: number;
        page: number;
        pageSize: number;
    }> {
        const {
            query,
            categoryId,
            tags,
            minRating,
            maxPrice,
            isFeatured,
            isVerified,
            sortBy = 'popular',
            sortOrder = 'desc',
            limit = 20,
            offset = 0
        } = params;

        // Build WHERE conditions
        const conditions: string[] = ['t.is_public = true'];
        const values: any[] = [];
        let paramCount = 1;

        if (query) {
            values.push(query);
            conditions.push(`(t.name ILIKE $${paramCount} OR t.description ILIKE $${paramCount})`);
            paramCount++;
        }

        if (categoryId) {
            values.push(categoryId);
            conditions.push(`t.category_id = $${paramCount++}`);
        }

        if (minRating !== undefined) {
            values.push(minRating);
            conditions.push(`t.rating_average >= $${paramCount++}`);
        }

        if (maxPrice !== undefined) {
            values.push(maxPrice);
            conditions.push(`t.price_credits <= $${paramCount++}`);
        }

        if (isFeatured !== undefined) {
            values.push(isFeatured);
            conditions.push(`t.is_featured = $${paramCount++}`);
        }

        if (isVerified !== undefined) {
            values.push(isVerified);
            conditions.push(`t.is_verified = $${paramCount++}`);
        }

        // Build ORDER BY
        let orderByClause = '';
        switch (sortBy) {
            case 'popular':
                orderByClause = `t.download_count ${sortOrder}, t.use_count ${sortOrder}`;
                break;
            case 'rating':
                orderByClause = `t.rating_average ${sortOrder}, t.rating_count ${sortOrder}`;
                break;
            case 'recent':
                orderByClause = `t.created_at ${sortOrder}`;
                break;
            case 'name':
                orderByClause = `t.name ${sortOrder}`;
                break;
        }

        // Get total count
        const countResult = await this.pool.query(
            `SELECT COUNT(DISTINCT t.id) as total
             FROM ghl_clone_templates t
             LEFT JOIN template_tag_mappings tm ON t.id = tm.template_id
             LEFT JOIN template_tags tg ON tm.tag_id = tg.id
             WHERE ${conditions.join(' AND ')}
             ${tags && tags.length > 0 ? `AND tg.slug = ANY($${paramCount})` : ''}`,
            tags && tags.length > 0 ? [...values, tags] : values
        );

        const total = parseInt(countResult.rows[0].total);

        // Get templates
        const templateResult = await this.pool.query(
            `SELECT DISTINCT t.*, c.name as category_name,
                    ARRAY_AGG(DISTINCT tg.name) FILTER (WHERE tg.name IS NOT NULL) as tags
             FROM ghl_clone_templates t
             LEFT JOIN template_categories c ON t.category_id = c.id
             LEFT JOIN template_tag_mappings tm ON t.id = tm.template_id
             LEFT JOIN template_tags tg ON tm.tag_id = tg.id
             WHERE ${conditions.join(' AND ')}
             ${tags && tags.length > 0 ? `AND tg.slug = ANY($${paramCount})` : ''}
             GROUP BY t.id, c.name
             ORDER BY ${orderByClause}
             LIMIT $${paramCount + (tags && tags.length > 0 ? 1 : 0)}
             OFFSET $${paramCount + (tags && tags.length > 0 ? 2 : 1)}`,
            tags && tags.length > 0
                ? [...values, tags, limit, offset]
                : [...values, limit, offset]
        );

        const templates = templateResult.rows.map(row => this.mapTemplateRow(row));

        return {
            templates,
            total,
            page: Math.floor(offset / limit) + 1,
            pageSize: limit
        };
    }

    /**
     * Get template recommendations for user
     */
    async getRecommendations(userId: string, limit: number = 10): Promise<Template[]> {
        const result = await this.pool.query(
            `SELECT t.*, c.name as category_name,
                    r.score as recommendation_score,
                    ARRAY_AGG(DISTINCT tg.name) FILTER (WHERE tg.name IS NOT NULL) as tags
             FROM get_template_recommendations($1, $2) r
             JOIN ghl_clone_templates t ON r.template_id = t.id
             LEFT JOIN template_categories c ON t.category_id = c.id
             LEFT JOIN template_tag_mappings tm ON t.id = tm.template_id
             LEFT JOIN template_tags tg ON tm.tag_id = tg.id
             GROUP BY t.id, c.name, r.score
             ORDER BY r.score DESC`,
            [userId, limit]
        );

        return result.rows.map(row => this.mapTemplateRow(row));
    }

    // ========================================================================
    // Categories
    // ========================================================================

    /**
     * Get all categories
     */
    async getCategories(): Promise<TemplateCategory[]> {
        const cacheKey = 'template:categories';
        const cached = await this.cache.get(cacheKey);

        if (cached) {
            return JSON.parse(cached);
        }

        const result = await this.pool.query(
            `SELECT c.*,
                    COUNT(t.id) as template_count
             FROM template_categories c
             LEFT JOIN ghl_clone_templates t ON c.id = t.category_id AND t.is_public = true
             GROUP BY c.id
             ORDER BY c.sort_order, c.name`
        );

        const categories = result.rows.map(row => this.mapCategoryRow(row));

        // Cache for 1 hour
        await this.cache.set(cacheKey, JSON.stringify(categories), 3600);

        return categories;
    }

    // ========================================================================
    // Tags
    // ========================================================================

    /**
     * Get popular tags
     */
    async getPopularTags(limit: number = 50): Promise<TemplateTag[]> {
        const cacheKey = `template:tags:popular:${limit}`;
        const cached = await this.cache.get(cacheKey);

        if (cached) {
            return JSON.parse(cached);
        }

        const result = await this.pool.query(
            `SELECT * FROM template_tags
             ORDER BY usage_count DESC, name ASC
             LIMIT $1`,
            [limit]
        );

        const tags = result.rows.map(row => this.mapTagRow(row));

        // Cache for 10 minutes
        await this.cache.set(cacheKey, JSON.stringify(tags), 600);

        return tags;
    }

    /**
     * Add tags to template
     */
    private async addTemplateTags(
        templateId: string,
        tagNames: string[],
        client?: PoolClient
    ): Promise<void> {
        const db = client || this.pool;

        for (const tagName of tagNames) {
            const slug = tagName.toLowerCase().replace(/[^a-z0-9]+/g, '-');

            // Insert or get tag
            const tagResult = await db.query(
                `INSERT INTO template_tags (name, slug)
                 VALUES ($1, $2)
                 ON CONFLICT (slug) DO UPDATE SET slug = EXCLUDED.slug
                 RETURNING id`,
                [tagName, slug]
            );

            const tagId = tagResult.rows[0].id;

            // Create mapping
            await db.query(
                `INSERT INTO template_tag_mappings (template_id, tag_id)
                 VALUES ($1, $2)
                 ON CONFLICT DO NOTHING`,
                [templateId, tagId]
            );
        }
    }

    // ========================================================================
    // Reviews & Ratings
    // ========================================================================

    /**
     * Add review for template
     */
    async addReview(params: {
        templateId: string;
        userId: string;
        rating: number;
        reviewText?: string;
    }): Promise<TemplateReview> {
        const { templateId, userId, rating, reviewText } = params;

        if (rating < 1 || rating > 5) {
            throw new Error('Rating must be between 1 and 5');
        }

        const result = await this.pool.query(
            `INSERT INTO template_reviews (template_id, user_id, rating, review_text)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (template_id, user_id)
             DO UPDATE SET rating = EXCLUDED.rating,
                          review_text = EXCLUDED.review_text,
                          updated_at = CURRENT_TIMESTAMP
             RETURNING *`,
            [templateId, userId, rating, reviewText || null]
        );

        await logAuditEvent({
            userId,
            action: 'template:review',
            resource: 'template',
            resourceId: templateId,
            details: { rating }
        });

        return this.mapReviewRow(result.rows[0]);
    }

    /**
     * Get reviews for template
     */
    async getReviews(templateId: string, limit: number = 20, offset: number = 0): Promise<{
        reviews: TemplateReview[];
        total: number;
    }> {
        const countResult = await this.pool.query(
            `SELECT COUNT(*) as total FROM template_reviews
             WHERE template_id = $1 AND is_moderated = false`,
            [templateId]
        );

        const result = await this.pool.query(
            `SELECT r.*, u.email as user_name
             FROM template_reviews r
             LEFT JOIN users u ON r.user_id = u.id
             WHERE r.template_id = $1 AND r.is_moderated = false
             ORDER BY r.created_at DESC
             LIMIT $2 OFFSET $3`,
            [templateId, limit, offset]
        );

        return {
            reviews: result.rows.map(row => this.mapReviewRow(row)),
            total: parseInt(countResult.rows[0].total)
        };
    }

    // ========================================================================
    // Favorites & Collections
    // ========================================================================

    /**
     * Add template to favorites
     */
    async addToFavorites(templateId: string, userId: string): Promise<void> {
        await this.pool.query(
            `INSERT INTO template_favorites (template_id, user_id)
             VALUES ($1, $2)
             ON CONFLICT DO NOTHING`,
            [templateId, userId]
        );

        await this.trackUsage({ templateId, userId, action: 'favorite' });

        await logAuditEvent({
            userId,
            action: 'template:favorite',
            resource: 'template',
            resourceId: templateId
        });
    }

    /**
     * Remove template from favorites
     */
    async removeFromFavorites(templateId: string, userId: string): Promise<void> {
        await this.pool.query(
            `DELETE FROM template_favorites
             WHERE template_id = $1 AND user_id = $2`,
            [templateId, userId]
        );

        await logAuditEvent({
            userId,
            action: 'template:unfavorite',
            resource: 'template',
            resourceId: templateId
        });
    }

    /**
     * Get user's favorite templates
     */
    async getFavorites(userId: string): Promise<Template[]> {
        const result = await this.pool.query(
            `SELECT t.*, c.name as category_name,
                    ARRAY_AGG(DISTINCT tg.name) FILTER (WHERE tg.name IS NOT NULL) as tags
             FROM template_favorites f
             JOIN ghl_clone_templates t ON f.template_id = t.id
             LEFT JOIN template_categories c ON t.category_id = c.id
             LEFT JOIN template_tag_mappings tm ON t.id = tm.template_id
             LEFT JOIN template_tags tg ON tm.tag_id = tg.id
             WHERE f.user_id = $1
             GROUP BY t.id, c.name, f.created_at
             ORDER BY f.created_at DESC`,
            [userId]
        );

        return result.rows.map(row => this.mapTemplateRow(row));
    }

    // ========================================================================
    // Usage Tracking
    // ========================================================================

    /**
     * Track template usage event
     */
    async trackUsage(event: TemplateUsageEvent): Promise<void> {
        const { templateId, userId, action, metadata } = event;

        await this.pool.query(
            `SELECT track_template_usage($1, $2, $3, $4::jsonb)`,
            [templateId, userId, action, JSON.stringify(metadata || {})]
        );
    }

    // ========================================================================
    // Helper Methods
    // ========================================================================

    private mapTemplateRow(row: any): Template {
        return {
            id: row.id,
            userId: row.user_id,
            clonedPageId: row.cloned_page_id,
            name: row.name,
            description: row.description,
            categoryId: row.category_id,
            categoryName: row.category_name,
            thumbnailUrl: row.thumbnail_url,
            previewUrl: row.preview_url,
            isPublic: row.is_public,
            isPrivate: row.is_private,
            isFeatured: row.is_featured,
            isVerified: row.is_verified,
            priceCredits: row.price_credits,
            ratingAverage: parseFloat(row.rating_average) || 0,
            ratingCount: row.rating_count || 0,
            viewCount: row.view_count || 0,
            downloadCount: row.download_count || 0,
            useCount: row.use_count || 0,
            favoriteCount: row.favorite_count || 0,
            tags: row.tags || [],
            createdAt: new Date(row.created_at),
            updatedAt: new Date(row.updated_at)
        };
    }

    private mapCategoryRow(row: any): TemplateCategory {
        return {
            id: row.id,
            name: row.name,
            slug: row.slug,
            description: row.description,
            icon: row.icon,
            parentId: row.parent_id,
            sortOrder: row.sort_order,
            templateCount: parseInt(row.template_count) || 0,
            createdAt: new Date(row.created_at),
            updatedAt: new Date(row.updated_at)
        };
    }

    private mapTagRow(row: any): TemplateTag {
        return {
            id: row.id,
            name: row.name,
            slug: row.slug,
            usageCount: row.usage_count || 0,
            createdAt: new Date(row.created_at)
        };
    }

    private mapReviewRow(row: any): TemplateReview {
        return {
            id: row.id,
            templateId: row.template_id,
            userId: row.user_id,
            userName: row.user_name,
            rating: row.rating,
            reviewText: row.review_text,
            helpfulCount: row.helpful_count || 0,
            isModerated: row.is_moderated,
            moderationStatus: row.moderation_status,
            createdAt: new Date(row.created_at),
            updatedAt: new Date(row.updated_at)
        };
    }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let templateMarketplaceServiceInstance: TemplateMarketplaceService | null = null;

export async function getTemplateMarketplaceService(): Promise<TemplateMarketplaceService> {
    if (!templateMarketplaceServiceInstance) {
        const pool = getPool();
        const cache = new RedisCacheService();
        await cache.initialize();
        templateMarketplaceServiceInstance = new TemplateMarketplaceService(pool, cache);
    }
    return templateMarketplaceServiceInstance;
}
