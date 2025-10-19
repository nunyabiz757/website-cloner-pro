/**
 * Advanced Analytics Service
 *
 * Comprehensive analytics tracking, funnel analysis, user journey tracking,
 * A/B testing, and custom reporting capabilities.
 */

import { Pool } from 'pg';
import { getPool } from '../config/database.js';
import { RedisCacheService } from './redis-cache.service.js';
import { logAuditEvent } from '../utils/audit-logger.js';

// ============================================================================
// INTERFACES
// ============================================================================

export interface AnalyticsEvent {
    id: string;
    user_id?: string;
    session_id: string;
    event_type: string;
    event_category: string;
    event_action: string;
    event_label?: string;
    event_value?: number;
    template_id?: string;
    page_url?: string;
    referrer_url?: string;
    device_type?: string;
    browser?: string;
    browser_version?: string;
    os?: string;
    os_version?: string;
    screen_resolution?: string;
    country_code?: string;
    region?: string;
    city?: string;
    timezone?: string;
    metadata: Record<string, any>;
    event_timestamp: Date;
    created_at: Date;
}

export interface UserBehaviorSession {
    id: string;
    user_id: string;
    session_id: string;
    session_start: Date;
    session_end?: Date;
    session_duration_seconds?: number;
    pages_viewed: number;
    unique_pages_viewed: number;
    templates_viewed: number;
    templates_cloned: number;
    templates_favorited: number;
    searches_performed: number;
    filters_applied: number;
    converted: boolean;
    conversion_type?: string;
    conversion_value?: number;
    time_to_conversion_seconds?: number;
    entry_page?: string;
    exit_page?: string;
    referrer_source?: string;
    utm_source?: string;
    utm_medium?: string;
    utm_campaign?: string;
    utm_content?: string;
    device_type?: string;
    browser?: string;
    os?: string;
    metadata: Record<string, any>;
    created_at: Date;
    updated_at: Date;
}

export interface FunnelAnalysis {
    id: string;
    funnel_name: string;
    funnel_description?: string;
    steps: FunnelStep[];
    is_active: boolean;
    created_by?: string;
    created_at: Date;
    updated_at: Date;
}

export interface FunnelStep {
    step: number;
    name: string;
    event_type: string;
    event_action?: string;
    required: boolean;
}

export interface FunnelStepEvent {
    id: string;
    funnel_id: string;
    user_id?: string;
    session_id: string;
    step_number: number;
    step_name: string;
    step_completed: boolean;
    step_started_at: Date;
    step_completed_at?: Date;
    time_spent_seconds?: number;
    template_id?: string;
    metadata: Record<string, any>;
    created_at: Date;
}

export interface FunnelConversionRate {
    step_number: number;
    step_name: string;
    users_entered: number;
    users_completed: number;
    completion_rate: number;
    avg_time_seconds: number;
    drop_off_rate: number;
}

export interface TemplatePerformance {
    template_id: string;
    template_name: string;
    total_views: number;
    total_clones: number;
    clone_rate: number;
    avg_view_duration: number;
    bounce_rate: number;
    total_revenue: number;
}

export interface UserEngagementMetrics {
    total_sessions: number;
    total_page_views: number;
    avg_session_duration: number;
    templates_viewed: number;
    templates_cloned: number;
    conversion_rate: number;
    last_active_at?: Date;
}

export interface ABTestExperiment {
    id: string;
    name: string;
    description?: string;
    hypothesis?: string;
    experiment_type: string;
    status: 'draft' | 'running' | 'paused' | 'completed';
    variants: ABTestVariant[];
    traffic_allocation?: Record<string, number>;
    target_audience?: Record<string, any>;
    sample_size_target?: number;
    start_date?: Date;
    end_date?: Date;
    actual_start_date?: Date;
    actual_end_date?: Date;
    winner_variant?: string;
    confidence_level?: number;
    statistical_significance: boolean;
    created_by?: string;
    created_at: Date;
    updated_at: Date;
}

export interface ABTestVariant {
    name: string;
    description?: string;
    config: Record<string, any>;
    weight?: number;
}

export interface ABTestResult {
    id: string;
    experiment_id: string;
    user_id?: string;
    session_id: string;
    variant_name: string;
    assigned_at: Date;
    converted: boolean;
    conversion_type?: string;
    conversion_value?: number;
    converted_at?: Date;
    interactions: number;
    time_spent_seconds: number;
    metadata: Record<string, any>;
    created_at: Date;
}

export interface ABTestSignificance {
    variant_name: string;
    sample_size: number;
    conversion_rate: number;
    confidence_level: number;
    is_significant: boolean;
    recommended_winner: boolean;
}

export interface CustomDashboard {
    id: string;
    user_id: string;
    team_id?: string;
    name: string;
    description?: string;
    layout: Record<string, any>;
    widgets: Record<string, any>[];
    filters: Record<string, any>;
    is_public: boolean;
    is_default: boolean;
    created_at: Date;
    updated_at: Date;
}

// ============================================================================
// REQUEST/RESPONSE INTERFACES
// ============================================================================

export interface TrackEventParams {
    user_id?: string;
    session_id: string;
    event_type: string;
    event_category: string;
    event_action: string;
    event_label?: string;
    event_value?: number;
    template_id?: string;
    page_url?: string;
    referrer_url?: string;
    device_info?: {
        type?: string;
        browser?: string;
        browser_version?: string;
        os?: string;
        os_version?: string;
        screen_resolution?: string;
    };
    location_info?: {
        country_code?: string;
        region?: string;
        city?: string;
        timezone?: string;
    };
    metadata?: Record<string, any>;
}

export interface CreateFunnelParams {
    funnel_name: string;
    funnel_description?: string;
    steps: FunnelStep[];
    created_by: string;
}

export interface CreateABTestParams {
    name: string;
    description?: string;
    hypothesis?: string;
    experiment_type: string;
    variants: ABTestVariant[];
    traffic_allocation?: Record<string, number>;
    target_audience?: Record<string, any>;
    sample_size_target?: number;
    start_date?: Date;
    end_date?: Date;
    created_by: string;
}

export interface CreateDashboardParams {
    user_id: string;
    team_id?: string;
    name: string;
    description?: string;
    layout: Record<string, any>;
    widgets: Record<string, any>[];
    filters?: Record<string, any>;
    is_public?: boolean;
}

// ============================================================================
// SERVICE CLASS
// ============================================================================

export class AdvancedAnalyticsService {
    private pool: Pool;
    private cache: RedisCacheService;

    constructor() {
        this.pool = getPool();
        this.cache = RedisCacheService.getInstance();
    }

    // ========================================================================
    // EVENT TRACKING
    // ========================================================================

    /**
     * Track an analytics event
     */
    async trackEvent(params: TrackEventParams): Promise<string> {
        const result = await this.pool.query<{ id: string }>(
            `SELECT track_analytics_event($1, $2, $3, $4, $5, $6, $7, $8, $9) as id`,
            [
                params.user_id || null,
                params.session_id,
                params.event_type,
                params.event_category,
                params.event_action,
                params.event_label || null,
                params.event_value || null,
                params.template_id || null,
                JSON.stringify(params.metadata || {})
            ]
        );

        return result.rows[0].id;
    }

    /**
     * Get events with filters
     */
    async getEvents(filters: {
        user_id?: string;
        session_id?: string;
        event_type?: string;
        event_category?: string;
        template_id?: string;
        start_date?: Date;
        end_date?: Date;
        limit?: number;
        offset?: number;
    }): Promise<{ events: AnalyticsEvent[], total: number }> {
        const conditions: string[] = [];
        const params: any[] = [];
        let paramCount = 1;

        if (filters.user_id) {
            conditions.push(`user_id = $${paramCount++}`);
            params.push(filters.user_id);
        }

        if (filters.session_id) {
            conditions.push(`session_id = $${paramCount++}`);
            params.push(filters.session_id);
        }

        if (filters.event_type) {
            conditions.push(`event_type = $${paramCount++}`);
            params.push(filters.event_type);
        }

        if (filters.event_category) {
            conditions.push(`event_category = $${paramCount++}`);
            params.push(filters.event_category);
        }

        if (filters.template_id) {
            conditions.push(`template_id = $${paramCount++}`);
            params.push(filters.template_id);
        }

        if (filters.start_date) {
            conditions.push(`event_timestamp >= $${paramCount++}`);
            params.push(filters.start_date);
        }

        if (filters.end_date) {
            conditions.push(`event_timestamp <= $${paramCount++}`);
            params.push(filters.end_date);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        // Get total count
        const countResult = await this.pool.query(
            `SELECT COUNT(*) FROM analytics_events ${whereClause}`,
            params
        );

        const total = parseInt(countResult.rows[0].count);

        // Get events
        const limit = filters.limit || 100;
        const offset = filters.offset || 0;

        params.push(limit, offset);

        const result = await this.pool.query<AnalyticsEvent>(
            `SELECT * FROM analytics_events ${whereClause}
            ORDER BY event_timestamp DESC
            LIMIT $${paramCount++} OFFSET $${paramCount++}`,
            params
        );

        const events = result.rows.map(row => this.mapEventRow(row));

        return { events, total };
    }

    // ========================================================================
    // FUNNEL ANALYSIS
    // ========================================================================

    /**
     * Create a funnel
     */
    async createFunnel(params: CreateFunnelParams): Promise<FunnelAnalysis> {
        const result = await this.pool.query<FunnelAnalysis>(
            `INSERT INTO funnel_analysis (
                funnel_name, funnel_description, steps, created_by
            ) VALUES ($1, $2, $3, $4)
            RETURNING *`,
            [
                params.funnel_name,
                params.funnel_description || null,
                JSON.stringify(params.steps),
                params.created_by
            ]
        );

        const funnel = this.mapFunnelRow(result.rows[0]);

        await logAuditEvent({
            userId: params.created_by,
            action: 'funnel.created',
            resourceType: 'funnel_analysis',
            resourceId: funnel.id,
            details: { funnel_name: funnel.funnel_name }
        });

        return funnel;
    }

    /**
     * Get funnel conversion rates
     */
    async getFunnelConversionRates(
        funnelId: string,
        startDate: Date,
        endDate: Date
    ): Promise<FunnelConversionRate[]> {
        const cacheKey = `funnel_conversion:${funnelId}:${startDate.toISOString()}:${endDate.toISOString()}`;
        const cached = await this.cache.get<FunnelConversionRate[]>(cacheKey);
        if (cached) return cached;

        const result = await this.pool.query<FunnelConversionRate>(
            'SELECT * FROM get_funnel_conversion_rates($1, $2, $3)',
            [funnelId, startDate, endDate]
        );

        const rates = result.rows;

        // Cache for 10 minutes
        await this.cache.set(cacheKey, rates, 600);

        return rates;
    }

    /**
     * Get all funnels
     */
    async getFunnels(activeOnly: boolean = true): Promise<FunnelAnalysis[]> {
        const cacheKey = `funnels:active:${activeOnly}`;
        const cached = await this.cache.get<FunnelAnalysis[]>(cacheKey);
        if (cached) return cached;

        let query = 'SELECT * FROM funnel_analysis';

        if (activeOnly) {
            query += ' WHERE is_active = true';
        }

        query += ' ORDER BY created_at DESC';

        const result = await this.pool.query<FunnelAnalysis>(query);

        const funnels = result.rows.map(row => this.mapFunnelRow(row));

        // Cache for 5 minutes
        await this.cache.set(cacheKey, funnels, 300);

        return funnels;
    }

    // ========================================================================
    // TEMPLATE PERFORMANCE
    // ========================================================================

    /**
     * Get template performance comparison
     */
    async getTemplatePerformanceComparison(
        templateIds: string[],
        startDate: Date,
        endDate: Date
    ): Promise<TemplatePerformance[]> {
        const cacheKey = `template_performance:${templateIds.join(',')}:${startDate.toISOString()}:${endDate.toISOString()}`;
        const cached = await this.cache.get<TemplatePerformance[]>(cacheKey);
        if (cached) return cached;

        const result = await this.pool.query<TemplatePerformance>(
            'SELECT * FROM get_template_performance_comparison($1, $2, $3)',
            [templateIds, startDate, endDate]
        );

        const performance = result.rows;

        // Cache for 10 minutes
        await this.cache.set(cacheKey, performance, 600);

        return performance;
    }

    // ========================================================================
    // USER ENGAGEMENT
    // ========================================================================

    /**
     * Get user engagement metrics
     */
    async getUserEngagementMetrics(
        userId: string,
        startDate: Date,
        endDate: Date
    ): Promise<UserEngagementMetrics> {
        const cacheKey = `user_engagement:${userId}:${startDate.toISOString()}:${endDate.toISOString()}`;
        const cached = await this.cache.get<UserEngagementMetrics>(cacheKey);
        if (cached) return cached;

        const result = await this.pool.query<UserEngagementMetrics>(
            'SELECT * FROM get_user_engagement_metrics($1, $2, $3)',
            [userId, startDate, endDate]
        );

        const metrics = result.rows[0] || {
            total_sessions: 0,
            total_page_views: 0,
            avg_session_duration: 0,
            templates_viewed: 0,
            templates_cloned: 0,
            conversion_rate: 0,
            last_active_at: null
        };

        // Cache for 5 minutes
        await this.cache.set(cacheKey, metrics, 300);

        return metrics;
    }

    /**
     * Get user behavior sessions
     */
    async getUserBehaviorSessions(
        userId: string,
        limit: number = 50
    ): Promise<UserBehaviorSession[]> {
        const result = await this.pool.query<UserBehaviorSession>(
            `SELECT * FROM user_behavior_tracking
            WHERE user_id = $1
            ORDER BY session_start DESC
            LIMIT $2`,
            [userId, limit]
        );

        return result.rows.map(row => this.mapBehaviorRow(row));
    }

    // ========================================================================
    // A/B TESTING
    // ========================================================================

    /**
     * Create an A/B test experiment
     */
    async createABTest(params: CreateABTestParams): Promise<ABTestExperiment> {
        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            // Validate variants
            if (!params.variants || params.variants.length < 2) {
                throw new Error('A/B test must have at least 2 variants');
            }

            const result = await client.query<ABTestExperiment>(
                `INSERT INTO ab_test_experiments (
                    name, description, hypothesis, experiment_type,
                    variants, traffic_allocation, target_audience,
                    sample_size_target, start_date, end_date, created_by
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
                RETURNING *`,
                [
                    params.name,
                    params.description || null,
                    params.hypothesis || null,
                    params.experiment_type,
                    JSON.stringify(params.variants),
                    JSON.stringify(params.traffic_allocation || {}),
                    JSON.stringify(params.target_audience || {}),
                    params.sample_size_target || null,
                    params.start_date || null,
                    params.end_date || null,
                    params.created_by
                ]
            );

            await client.query('COMMIT');

            const experiment = this.mapABTestRow(result.rows[0]);

            await logAuditEvent({
                userId: params.created_by,
                action: 'ab_test.created',
                resourceType: 'ab_test_experiment',
                resourceId: experiment.id,
                details: { experiment_name: experiment.name }
            });

            return experiment;

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Start an A/B test
     */
    async startABTest(experimentId: string, userId: string): Promise<void> {
        await this.pool.query(
            `UPDATE ab_test_experiments
            SET status = 'running', actual_start_date = CURRENT_TIMESTAMP
            WHERE id = $1`,
            [experimentId]
        );

        await logAuditEvent({
            userId,
            action: 'ab_test.started',
            resourceType: 'ab_test_experiment',
            resourceId: experimentId
        });

        // Invalidate cache
        await this.cache.del(`ab_test:${experimentId}`);
    }

    /**
     * Assign user to variant
     */
    async assignToVariant(
        experimentId: string,
        userId: string,
        sessionId: string
    ): Promise<string> {
        const client = await this.pool.connect();

        try {
            // Check if user already assigned
            const existing = await client.query(
                'SELECT variant_name FROM ab_test_results WHERE experiment_id = $1 AND user_id = $2',
                [experimentId, userId]
            );

            if (existing.rows.length > 0) {
                return existing.rows[0].variant_name;
            }

            // Get experiment
            const experiment = await client.query<ABTestExperiment>(
                'SELECT * FROM ab_test_experiments WHERE id = $1',
                [experimentId]
            );

            if (experiment.rows.length === 0) {
                throw new Error('Experiment not found');
            }

            const exp = this.mapABTestRow(experiment.rows[0]);

            // Randomly assign to variant based on traffic allocation
            const variant = this.selectVariant(exp.variants, exp.traffic_allocation);

            // Create assignment
            await client.query(
                `INSERT INTO ab_test_results (
                    experiment_id, user_id, session_id, variant_name
                ) VALUES ($1, $2, $3, $4)`,
                [experimentId, userId, sessionId, variant.name]
            );

            return variant.name;

        } finally {
            client.release();
        }
    }

    /**
     * Record A/B test conversion
     */
    async recordABTestConversion(
        experimentId: string,
        userId: string,
        conversionType: string,
        conversionValue?: number
    ): Promise<void> {
        await this.pool.query(
            `UPDATE ab_test_results
            SET converted = true, conversion_type = $1, conversion_value = $2, converted_at = CURRENT_TIMESTAMP
            WHERE experiment_id = $3 AND user_id = $4`,
            [conversionType, conversionValue || null, experimentId, userId]
        );
    }

    /**
     * Get A/B test statistical significance
     */
    async getABTestSignificance(experimentId: string): Promise<ABTestSignificance[]> {
        const cacheKey = `ab_test_significance:${experimentId}`;
        const cached = await this.cache.get<ABTestSignificance[]>(cacheKey);
        if (cached) return cached;

        const result = await this.pool.query<ABTestSignificance>(
            'SELECT * FROM calculate_ab_test_significance($1)',
            [experimentId]
        );

        const significance = result.rows;

        // Cache for 5 minutes
        await this.cache.set(cacheKey, significance, 300);

        return significance;
    }

    /**
     * Get A/B test experiments
     */
    async getABTests(filters?: {
        status?: string;
        experiment_type?: string;
    }): Promise<ABTestExperiment[]> {
        let query = 'SELECT * FROM ab_test_experiments WHERE 1=1';
        const params: any[] = [];
        let paramCount = 1;

        if (filters?.status) {
            query += ` AND status = $${paramCount++}`;
            params.push(filters.status);
        }

        if (filters?.experiment_type) {
            query += ` AND experiment_type = $${paramCount++}`;
            params.push(filters.experiment_type);
        }

        query += ' ORDER BY created_at DESC';

        const result = await this.pool.query<ABTestExperiment>(query, params);

        return result.rows.map(row => this.mapABTestRow(row));
    }

    // ========================================================================
    // CUSTOM DASHBOARDS
    // ========================================================================

    /**
     * Create a custom dashboard
     */
    async createDashboard(params: CreateDashboardParams): Promise<CustomDashboard> {
        const result = await this.pool.query<CustomDashboard>(
            `INSERT INTO custom_dashboards (
                user_id, team_id, name, description, layout, widgets, filters, is_public
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *`,
            [
                params.user_id,
                params.team_id || null,
                params.name,
                params.description || null,
                JSON.stringify(params.layout),
                JSON.stringify(params.widgets),
                JSON.stringify(params.filters || {}),
                params.is_public || false
            ]
        );

        return this.mapDashboardRow(result.rows[0]);
    }

    /**
     * Get user dashboards
     */
    async getUserDashboards(userId: string): Promise<CustomDashboard[]> {
        const result = await this.pool.query<CustomDashboard>(
            `SELECT * FROM custom_dashboards
            WHERE user_id = $1
            ORDER BY is_default DESC, created_at DESC`,
            [userId]
        );

        return result.rows.map(row => this.mapDashboardRow(row));
    }

    /**
     * Update dashboard
     */
    async updateDashboard(
        dashboardId: string,
        userId: string,
        updates: Partial<CreateDashboardParams>
    ): Promise<CustomDashboard> {
        const sets: string[] = [];
        const values: any[] = [];
        let paramCount = 1;

        if (updates.name !== undefined) {
            sets.push(`name = $${paramCount++}`);
            values.push(updates.name);
        }

        if (updates.description !== undefined) {
            sets.push(`description = $${paramCount++}`);
            values.push(updates.description);
        }

        if (updates.layout !== undefined) {
            sets.push(`layout = $${paramCount++}`);
            values.push(JSON.stringify(updates.layout));
        }

        if (updates.widgets !== undefined) {
            sets.push(`widgets = $${paramCount++}`);
            values.push(JSON.stringify(updates.widgets));
        }

        if (updates.filters !== undefined) {
            sets.push(`filters = $${paramCount++}`);
            values.push(JSON.stringify(updates.filters));
        }

        if (updates.is_public !== undefined) {
            sets.push(`is_public = $${paramCount++}`);
            values.push(updates.is_public);
        }

        values.push(dashboardId, userId);

        const result = await this.pool.query<CustomDashboard>(
            `UPDATE custom_dashboards
            SET ${sets.join(', ')}
            WHERE id = $${paramCount++} AND user_id = $${paramCount++}
            RETURNING *`,
            values
        );

        if (result.rows.length === 0) {
            throw new Error('Dashboard not found or not authorized');
        }

        return this.mapDashboardRow(result.rows[0]);
    }

    /**
     * Delete dashboard
     */
    async deleteDashboard(dashboardId: string, userId: string): Promise<void> {
        const result = await this.pool.query(
            'DELETE FROM custom_dashboards WHERE id = $1 AND user_id = $2',
            [dashboardId, userId]
        );

        if (result.rowCount === 0) {
            throw new Error('Dashboard not found or not authorized');
        }
    }

    // ========================================================================
    // HELPER METHODS
    // ========================================================================

    /**
     * Select variant based on traffic allocation
     */
    private selectVariant(variants: ABTestVariant[], allocation?: Record<string, number>): ABTestVariant {
        if (!allocation || Object.keys(allocation).length === 0) {
            // Equal distribution
            return variants[Math.floor(Math.random() * variants.length)];
        }

        // Weighted distribution
        const rand = Math.random() * 100;
        let cumulative = 0;

        for (const variant of variants) {
            cumulative += allocation[variant.name] || (100 / variants.length);
            if (rand <= cumulative) {
                return variant;
            }
        }

        return variants[0];
    }

    /**
     * Map database row to AnalyticsEvent
     */
    private mapEventRow(row: any): AnalyticsEvent {
        return {
            ...row,
            metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
            event_timestamp: new Date(row.event_timestamp),
            created_at: new Date(row.created_at)
        };
    }

    /**
     * Map database row to UserBehaviorSession
     */
    private mapBehaviorRow(row: any): UserBehaviorSession {
        return {
            ...row,
            metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
            session_start: new Date(row.session_start),
            session_end: row.session_end ? new Date(row.session_end) : undefined,
            created_at: new Date(row.created_at),
            updated_at: new Date(row.updated_at)
        };
    }

    /**
     * Map database row to FunnelAnalysis
     */
    private mapFunnelRow(row: any): FunnelAnalysis {
        return {
            ...row,
            steps: typeof row.steps === 'string' ? JSON.parse(row.steps) : row.steps,
            created_at: new Date(row.created_at),
            updated_at: new Date(row.updated_at)
        };
    }

    /**
     * Map database row to ABTestExperiment
     */
    private mapABTestRow(row: any): ABTestExperiment {
        return {
            ...row,
            variants: typeof row.variants === 'string' ? JSON.parse(row.variants) : row.variants,
            traffic_allocation: row.traffic_allocation ? (typeof row.traffic_allocation === 'string' ? JSON.parse(row.traffic_allocation) : row.traffic_allocation) : undefined,
            target_audience: row.target_audience ? (typeof row.target_audience === 'string' ? JSON.parse(row.target_audience) : row.target_audience) : undefined,
            start_date: row.start_date ? new Date(row.start_date) : undefined,
            end_date: row.end_date ? new Date(row.end_date) : undefined,
            actual_start_date: row.actual_start_date ? new Date(row.actual_start_date) : undefined,
            actual_end_date: row.actual_end_date ? new Date(row.actual_end_date) : undefined,
            created_at: new Date(row.created_at),
            updated_at: new Date(row.updated_at)
        };
    }

    /**
     * Map database row to CustomDashboard
     */
    private mapDashboardRow(row: any): CustomDashboard {
        return {
            ...row,
            layout: typeof row.layout === 'string' ? JSON.parse(row.layout) : row.layout,
            widgets: typeof row.widgets === 'string' ? JSON.parse(row.widgets) : row.widgets,
            filters: typeof row.filters === 'string' ? JSON.parse(row.filters) : row.filters,
            created_at: new Date(row.created_at),
            updated_at: new Date(row.updated_at)
        };
    }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let instance: AdvancedAnalyticsService | null = null;

export function getAdvancedAnalyticsService(): AdvancedAnalyticsService {
    if (!instance) {
        instance = new AdvancedAnalyticsService();
    }
    return instance;
}
