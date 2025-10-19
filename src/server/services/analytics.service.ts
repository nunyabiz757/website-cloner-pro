/**
 * Analytics Service
 * Handles activity logging, metrics collection, and analytics reporting
 */

import { Pool } from 'pg';
import { getPool } from '../config/database.js';
import { RedisCacheService } from './redis-cache.service.js';

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface ActivityLogParams {
    userId: string;
    activityType: string;
    resourceType?: string;
    resourceId?: string;
    resourceName?: string;
    sessionId?: string;
    ipAddress?: string;
    userAgent?: string;
    metadata?: Record<string, any>;
}

export interface DailyStats {
    date: Date;
    userId: string | null;
    metricType: string;
    metricCategory: string;
    metricValue: number;
    metadata: any;
}

export interface TemplatePerformance {
    templateId: string;
    date: Date;
    views: number;
    uniqueViews: number;
    downloads: number;
    uniqueDownloads: number;
    uses: number;
    uniqueUses: number;
    favoritesAdded: number;
    favoritesRemoved: number;
    newReviews: number;
    avgRating: number;
    viewToDownloadRate: number;
    downloadToUseRate: number;
    engagementScore: number;
    trendingScore: number;
}

export interface UserEngagement {
    userId: string;
    date: Date;
    logins: number;
    templatesCreated: number;
    templatesUpdated: number;
    templatesViewed: number;
    templatesDownloaded: number;
    searchesPerformed: number;
    reviewsWritten: number;
    sessionCount: number;
    totalSessionDurationSeconds: number;
    avgSessionDurationSeconds: number;
    engagementScore: number;
    activityLevel: string;
}

export interface AnalyticsSummary {
    metricType: string;
    metricCategory: string;
    totalValue: number;
    avgValue: number;
    minValue: number;
    maxValue: number;
}

export interface DashboardStats {
    overview: {
        totalTemplates: number;
        totalUsers: number;
        totalClones: number;
        totalViews: number;
        totalDownloads: number;
    };
    trends: {
        templatesCreatedToday: number;
        templatesCreatedThisWeek: number;
        templatesCreatedThisMonth: number;
        usersActiveToday: number;
        usersActiveThisWeek: number;
    };
    topTemplates: Array<{
        templateId: string;
        templateName: string;
        views: number;
        downloads: number;
        rating: number;
        engagementScore: number;
    }>;
    recentActivity: Array<{
        activityType: string;
        resourceName: string;
        userName: string;
        timestamp: Date;
    }>;
}

export interface TrendingTemplate {
    templateId: string;
    templateName: string;
    trendingScore: number;
    views24h: number;
    downloads24h: number;
    engagementScore: number;
    rating: number;
}

// ============================================================================
// Service Class
// ============================================================================

export class AnalyticsService {
    private pool: Pool;
    private cache: RedisCacheService;

    constructor(pool: Pool, cache: RedisCacheService) {
        this.pool = pool;
        this.cache = cache;
    }

    // ========================================================================
    // Activity Logging
    // ========================================================================

    /**
     * Log user activity
     */
    async logActivity(params: ActivityLogParams): Promise<string> {
        const {
            userId,
            activityType,
            resourceType,
            resourceId,
            resourceName,
            sessionId,
            ipAddress,
            userAgent,
            metadata
        } = params;

        try {
            const result = await this.pool.query(
                `SELECT log_user_activity($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb) as activity_id`,
                [
                    userId,
                    activityType,
                    resourceType || null,
                    resourceId || null,
                    resourceName || null,
                    sessionId || null,
                    ipAddress || null,
                    userAgent || null,
                    JSON.stringify(metadata || {})
                ]
            );

            return result.rows[0].activity_id;

        } catch (error: any) {
            console.error('Error logging activity:', error);
            throw new Error(`Failed to log activity: ${error.message}`);
        }
    }

    /**
     * Get user activity log
     */
    async getUserActivity(
        userId: string,
        limit: number = 50,
        offset: number = 0
    ): Promise<any[]> {
        const result = await this.pool.query(
            `SELECT * FROM user_activity_log
             WHERE user_id = $1
             ORDER BY created_at DESC
             LIMIT $2 OFFSET $3`,
            [userId, limit, offset]
        );

        return result.rows;
    }

    /**
     * Get recent activity across all users (for admin dashboard)
     */
    async getRecentActivity(limit: number = 20): Promise<any[]> {
        const result = await this.pool.query(
            `SELECT ual.*, u.email as user_email
             FROM user_activity_log ual
             LEFT JOIN users u ON ual.user_id = u.id
             ORDER BY ual.created_at DESC
             LIMIT $1`,
            [limit]
        );

        return result.rows;
    }

    // ========================================================================
    // Daily Statistics
    // ========================================================================

    /**
     * Update daily statistics
     */
    async updateDailyStats(
        userId: string | null,
        metricType: string,
        metricCategory: string,
        increment: number = 1,
        metadata: Record<string, any> = {}
    ): Promise<void> {
        const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

        try {
            await this.pool.query(
                `SELECT update_daily_analytics($1::date, $2, $3, $4, $5, $6::jsonb)`,
                [
                    date,
                    userId,
                    metricType,
                    metricCategory,
                    increment,
                    JSON.stringify(metadata)
                ]
            );

        } catch (error: any) {
            console.error('Error updating daily stats:', error);
            // Don't throw - analytics should not break main functionality
        }
    }

    /**
     * Get daily statistics for date range
     */
    async getDailyStats(
        startDate: string,
        endDate: string,
        userId?: string,
        metricType?: string
    ): Promise<DailyStats[]> {
        const conditions: string[] = [];
        const values: any[] = [startDate, endDate];
        let paramCount = 3;

        if (userId) {
            conditions.push(`user_id = $${paramCount++}`);
            values.push(userId);
        }

        if (metricType) {
            conditions.push(`metric_type = $${paramCount++}`);
            values.push(metricType);
        }

        const whereClause = conditions.length > 0
            ? `AND ${conditions.join(' AND ')}`
            : '';

        const result = await this.pool.query(
            `SELECT * FROM analytics_daily_stats
             WHERE date BETWEEN $1 AND $2
             ${whereClause}
             ORDER BY date DESC`,
            values
        );

        return result.rows;
    }

    /**
     * Get analytics summary for user
     */
    async getAnalyticsSummary(
        userId: string,
        startDate: string,
        endDate: string
    ): Promise<AnalyticsSummary[]> {
        const result = await this.pool.query(
            `SELECT * FROM get_analytics_summary($1, $2::date, $3::date)`,
            [userId, startDate, endDate]
        );

        return result.rows;
    }

    // ========================================================================
    // Template Performance
    // ========================================================================

    /**
     * Update template performance metrics
     */
    async updateTemplatePerformance(
        templateId: string,
        date?: string
    ): Promise<void> {
        const targetDate = date || new Date().toISOString().split('T')[0];

        try {
            await this.pool.query(
                `SELECT update_template_performance_metrics($1, $2::date)`,
                [templateId, targetDate]
            );

        } catch (error: any) {
            console.error('Error updating template performance:', error);
        }
    }

    /**
     * Get template performance metrics
     */
    async getTemplatePerformance(
        templateId: string,
        startDate: string,
        endDate: string
    ): Promise<TemplatePerformance[]> {
        const result = await this.pool.query(
            `SELECT * FROM template_performance_metrics
             WHERE template_id = $1
               AND date BETWEEN $2 AND $3
             ORDER BY date DESC`,
            [templateId, startDate, endDate]
        );

        return result.rows;
    }

    /**
     * Get trending templates
     */
    async getTrendingTemplates(limit: number = 10): Promise<TrendingTemplate[]> {
        const cacheKey = `analytics:trending:${limit}`;
        const cached = await this.cache.get(cacheKey);

        if (cached) {
            return JSON.parse(cached);
        }

        const result = await this.pool.query(
            `SELECT
                t.id as template_id,
                t.name as template_name,
                COALESCE(pm.trending_score, 0) as trending_score,
                COALESCE(pm.views, 0) as views_24h,
                COALESCE(pm.downloads, 0) as downloads_24h,
                COALESCE(pm.engagement_score, 0) as engagement_score,
                t.rating_average as rating
             FROM ghl_clone_templates t
             LEFT JOIN template_performance_metrics pm
                ON t.id = pm.template_id
                AND pm.date = CURRENT_DATE
             WHERE t.is_public = true
             ORDER BY pm.trending_score DESC NULLS LAST,
                      pm.engagement_score DESC NULLS LAST
             LIMIT $1`,
            [limit]
        );

        const trending = result.rows;

        // Cache for 15 minutes
        await this.cache.set(cacheKey, JSON.stringify(trending), 900);

        return trending;
    }

    /**
     * Get top performing templates
     */
    async getTopTemplates(
        metricType: 'views' | 'downloads' | 'engagement' | 'rating',
        limit: number = 10,
        dateRange: number = 30 // days
    ): Promise<any[]> {
        const cacheKey = `analytics:top:${metricType}:${limit}:${dateRange}`;
        const cached = await this.cache.get(cacheKey);

        if (cached) {
            return JSON.parse(cached);
        }

        const startDate = new Date();
        startDate.setDate(startDate.getDate() - dateRange);

        let orderBy = 'total_views DESC';
        let selectMetric = 'SUM(pm.views) as total_views';

        switch (metricType) {
            case 'downloads':
                orderBy = 'total_downloads DESC';
                selectMetric = 'SUM(pm.downloads) as total_downloads';
                break;
            case 'engagement':
                orderBy = 'avg_engagement DESC';
                selectMetric = 'AVG(pm.engagement_score) as avg_engagement';
                break;
            case 'rating':
                orderBy = 't.rating_average DESC, t.rating_count DESC';
                selectMetric = 't.rating_average, t.rating_count';
                break;
        }

        const result = await this.pool.query(
            `SELECT
                t.id as template_id,
                t.name as template_name,
                ${selectMetric},
                t.rating_average,
                t.download_count,
                t.view_count
             FROM ghl_clone_templates t
             LEFT JOIN template_performance_metrics pm
                ON t.id = pm.template_id
                AND pm.date >= $1
             WHERE t.is_public = true
             GROUP BY t.id, t.name, t.rating_average, t.rating_count, t.download_count, t.view_count
             ORDER BY ${orderBy}
             LIMIT $2`,
            [startDate.toISOString().split('T')[0], limit]
        );

        const topTemplates = result.rows;

        // Cache for 1 hour
        await this.cache.set(cacheKey, JSON.stringify(topTemplates), 3600);

        return topTemplates;
    }

    // ========================================================================
    // User Engagement
    // ========================================================================

    /**
     * Get user engagement metrics
     */
    async getUserEngagement(
        userId: string,
        startDate: string,
        endDate: string
    ): Promise<UserEngagement[]> {
        const result = await this.pool.query(
            `SELECT * FROM user_engagement_metrics
             WHERE user_id = $1
               AND date BETWEEN $2 AND $3
             ORDER BY date DESC`,
            [userId, startDate, endDate]
        );

        return result.rows;
    }

    /**
     * Get active users count
     */
    async getActiveUsersCount(days: number = 30): Promise<number> {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);

        const result = await this.pool.query(
            `SELECT COUNT(DISTINCT user_id) as active_users
             FROM user_activity_log
             WHERE created_at >= $1`,
            [startDate]
        );

        return parseInt(result.rows[0].active_users) || 0;
    }

    // ========================================================================
    // Dashboard Statistics
    // ========================================================================

    /**
     * Get comprehensive dashboard statistics
     */
    async getDashboardStats(userId?: string): Promise<DashboardStats> {
        const cacheKey = userId ? `analytics:dashboard:${userId}` : 'analytics:dashboard:global';
        const cached = await this.cache.get(cacheKey);

        if (cached) {
            return JSON.parse(cached);
        }

        // Get overview stats
        const overviewResult = await this.pool.query(
            userId
                ? `SELECT
                    COUNT(DISTINCT t.id) as total_templates,
                    SUM(t.view_count) as total_views,
                    SUM(t.download_count) as total_downloads
                   FROM ghl_clone_templates t
                   WHERE t.user_id = $1`
                : `SELECT
                    COUNT(DISTINCT t.id) as total_templates,
                    COUNT(DISTINCT u.id) as total_users,
                    COUNT(DISTINCT cp.id) as total_clones,
                    SUM(t.view_count) as total_views,
                    SUM(t.download_count) as total_downloads
                   FROM ghl_clone_templates t
                   CROSS JOIN users u
                   CROSS JOIN ghl_cloned_pages cp`,
            userId ? [userId] : []
        );

        const overview = {
            totalTemplates: parseInt(overviewResult.rows[0].total_templates) || 0,
            totalUsers: parseInt(overviewResult.rows[0].total_users) || 0,
            totalClones: parseInt(overviewResult.rows[0].total_clones) || 0,
            totalViews: parseInt(overviewResult.rows[0].total_views) || 0,
            totalDownloads: parseInt(overviewResult.rows[0].total_downloads) || 0
        };

        // Get trends
        const today = new Date().toISOString().split('T')[0];
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        const monthAgo = new Date();
        monthAgo.setDate(monthAgo.getDate() - 30);

        const trendsResult = await this.pool.query(
            `SELECT
                COUNT(CASE WHEN DATE(created_at) = $1 THEN 1 END) as created_today,
                COUNT(CASE WHEN created_at >= $2 THEN 1 END) as created_this_week,
                COUNT(CASE WHEN created_at >= $3 THEN 1 END) as created_this_month
             FROM ghl_clone_templates
             WHERE ${userId ? 'user_id = $4' : 'true'}`,
            userId
                ? [today, weekAgo, monthAgo, userId]
                : [today, weekAgo, monthAgo]
        );

        const activeUsersToday = await this.getActiveUsersCount(1);
        const activeUsersWeek = await this.getActiveUsersCount(7);

        const trends = {
            templatesCreatedToday: parseInt(trendsResult.rows[0].created_today) || 0,
            templatesCreatedThisWeek: parseInt(trendsResult.rows[0].created_this_week) || 0,
            templatesCreatedThisMonth: parseInt(trendsResult.rows[0].created_this_month) || 0,
            usersActiveToday: activeUsersToday,
            usersActiveThisWeek: activeUsersWeek
        };

        // Get top templates
        const topTemplates = await this.getTopTemplates('engagement', 5, 30);

        // Get recent activity
        const recentActivity = userId
            ? await this.getUserActivity(userId, 10)
            : await this.getRecentActivity(10);

        const stats: DashboardStats = {
            overview,
            trends,
            topTemplates: topTemplates.map(t => ({
                templateId: t.template_id,
                templateName: t.template_name,
                views: t.total_views || t.view_count || 0,
                downloads: t.download_count || 0,
                rating: parseFloat(t.rating_average) || 0,
                engagementScore: parseFloat(t.avg_engagement) || 0
            })),
            recentActivity: recentActivity.map(a => ({
                activityType: a.activity_type,
                resourceName: a.resource_name || 'Unknown',
                userName: a.user_email || 'Unknown',
                timestamp: new Date(a.created_at)
            }))
        };

        // Cache for 5 minutes
        await this.cache.set(cacheKey, JSON.stringify(stats), 300);

        return stats;
    }

    // ========================================================================
    // Data Export
    // ========================================================================

    /**
     * Export analytics data to CSV format
     */
    async exportAnalyticsCSV(
        userId: string,
        startDate: string,
        endDate: string,
        metricTypes?: string[]
    ): Promise<string> {
        const conditions: string[] = ['user_id = $1', 'date BETWEEN $2 AND $3'];
        const values: any[] = [userId, startDate, endDate];

        if (metricTypes && metricTypes.length > 0) {
            conditions.push(`metric_type = ANY($4)`);
            values.push(metricTypes);
        }

        const result = await this.pool.query(
            `SELECT date, metric_type, metric_category, metric_value, metadata
             FROM analytics_daily_stats
             WHERE ${conditions.join(' AND ')}
             ORDER BY date DESC, metric_type`,
            values
        );

        // Convert to CSV
        const headers = ['Date', 'Metric Type', 'Category', 'Value', 'Metadata'];
        const rows = result.rows.map(row => [
            row.date,
            row.metric_type,
            row.metric_category,
            row.metric_value,
            JSON.stringify(row.metadata || {})
        ]);

        const csv = [
            headers.join(','),
            ...rows.map(row => row.join(','))
        ].join('\n');

        return csv;
    }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let analyticsServiceInstance: AnalyticsService | null = null;

export async function getAnalyticsService(): Promise<AnalyticsService> {
    if (!analyticsServiceInstance) {
        const pool = getPool();
        const cache = new RedisCacheService();
        await cache.initialize();
        analyticsServiceInstance = new AnalyticsService(pool, cache);
    }
    return analyticsServiceInstance;
}
