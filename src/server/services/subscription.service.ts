import { Pool } from 'pg';
import { getPool } from '../config/database.js';
import { getRedisCacheService } from './redis-cache.service.js';
import type { RedisCacheService } from './redis-cache.service.js';
import { logAuditEvent } from '../utils/audit-logger.js';

// =====================================================================================
// Types and Interfaces
// =====================================================================================

export interface SubscriptionPlan {
    id: string;
    plan_name: string;
    plan_slug: string;
    display_name: string;
    description?: string;
    price_monthly: number;
    price_yearly: number;
    currency: string;
    billing_interval: 'monthly' | 'yearly' | 'one-time';
    trial_days: number;
    features: Record<string, any>;
    limits: Record<string, number>;
    stripe_price_id_monthly?: string;
    stripe_price_id_yearly?: string;
    stripe_product_id?: string;
    is_active: boolean;
    is_public: boolean;
    is_featured: boolean;
    sort_order: number;
    metadata: Record<string, any>;
    created_at: Date;
    updated_at: Date;
}

export interface Subscription {
    id: string;
    user_id: string;
    plan_id: string;
    status: 'active' | 'canceled' | 'past_due' | 'trialing' | 'paused' | 'expired';
    billing_interval: 'monthly' | 'yearly' | 'one-time';
    amount: number;
    currency: string;
    current_period_start: Date;
    current_period_end: Date;
    next_billing_date?: Date;
    trial_start?: Date;
    trial_end?: Date;
    cancel_at_period_end: boolean;
    canceled_at?: Date;
    cancellation_reason?: string;
    cancellation_feedback?: string;
    stripe_subscription_id?: string;
    stripe_customer_id?: string;
    usage_reset_at?: Date;
    metadata: Record<string, any>;
    created_at: Date;
    updated_at: Date;
}

export interface CreateSubscriptionParams {
    user_id: string;
    plan_id: string;
    billing_interval: 'monthly' | 'yearly';
    payment_method_id?: string;
    promo_code?: string;
}

export interface UpdateSubscriptionParams {
    plan_id?: string;
    billing_interval?: 'monthly' | 'yearly';
    cancel_at_period_end?: boolean;
}

export interface UsageCheck {
    allowed: boolean;
    current_usage: number;
    limit_amount: number;
    remaining: number;
}

export interface SubscriptionUsage {
    id: string;
    subscription_id: string;
    user_id: string;
    period_start: Date;
    period_end: Date;
    templates_created: number;
    templates_stored: number;
    api_calls: number;
    bandwidth_gb: number;
    storage_gb: number;
    webhook_deliveries: number;
    ai_generations: number;
    team_members: number;
    created_at: Date;
    updated_at: Date;
}

// =====================================================================================
// Subscription Service
// =====================================================================================

export class SubscriptionService {
    private pool: Pool;
    private cache: RedisCacheService;

    constructor() {
        this.pool = getPool();
        this.cache = getRedisCacheService();
    }

    // =====================================================================================
    // Subscription Plan Management
    // =====================================================================================

    /**
     * Get all public subscription plans
     */
    async getPublicPlans(): Promise<SubscriptionPlan[]> {
        const cacheKey = 'subscription:plans:public';
        const cached = await this.cache.get<SubscriptionPlan[]>(cacheKey);

        if (cached) {
            return cached;
        }

        const result = await this.pool.query<SubscriptionPlan>(
            `SELECT * FROM subscription_plans
             WHERE is_active = true AND is_public = true
             ORDER BY sort_order ASC`
        );

        const plans = result.rows.map(row => this.formatPlan(row));
        await this.cache.set(cacheKey, plans, { ttl: 3600 });

        return plans;
    }

    /**
     * Get plan by ID
     */
    async getPlanById(planId: string): Promise<SubscriptionPlan | null> {
        const cacheKey = `subscription:plan:${planId}`;
        const cached = await this.cache.get<SubscriptionPlan>(cacheKey);

        if (cached) {
            return cached;
        }

        const result = await this.pool.query<SubscriptionPlan>(
            'SELECT * FROM subscription_plans WHERE id = $1',
            [planId]
        );

        if (result.rows.length === 0) {
            return null;
        }

        const plan = this.formatPlan(result.rows[0]);
        await this.cache.set(cacheKey, plan, { ttl: 3600 });

        return plan;
    }

    /**
     * Get plan by slug
     */
    async getPlanBySlug(slug: string): Promise<SubscriptionPlan | null> {
        const cacheKey = `subscription:plan:slug:${slug}`;
        const cached = await this.cache.get<SubscriptionPlan>(cacheKey);

        if (cached) {
            return cached;
        }

        const result = await this.pool.query<SubscriptionPlan>(
            'SELECT * FROM subscription_plans WHERE plan_slug = $1',
            [slug]
        );

        if (result.rows.length === 0) {
            return null;
        }

        const plan = this.formatPlan(result.rows[0]);
        await this.cache.set(cacheKey, plan, { ttl: 3600 });

        return plan;
    }

    // =====================================================================================
    // Subscription Management
    // =====================================================================================

    /**
     * Create new subscription
     */
    async createSubscription(params: CreateSubscriptionParams): Promise<Subscription> {
        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            // Get plan details
            const planResult = await client.query<SubscriptionPlan>(
                'SELECT * FROM subscription_plans WHERE id = $1 AND is_active = true',
                [params.plan_id]
            );

            if (planResult.rows.length === 0) {
                throw new Error('Subscription plan not found');
            }

            const plan = planResult.rows[0];

            // Calculate pricing
            const amount = params.billing_interval === 'monthly'
                ? plan.price_monthly
                : plan.price_yearly;

            // Calculate period dates
            const currentPeriodStart = new Date();
            const currentPeriodEnd = new Date();
            if (params.billing_interval === 'monthly') {
                currentPeriodEnd.setMonth(currentPeriodEnd.getMonth() + 1);
            } else {
                currentPeriodEnd.setFullYear(currentPeriodEnd.getFullYear() + 1);
            }

            // Handle trial period
            let trialStart: Date | null = null;
            let trialEnd: Date | null = null;
            let status: string = 'active';

            if (plan.trial_days > 0) {
                trialStart = new Date();
                trialEnd = new Date();
                trialEnd.setDate(trialEnd.getDate() + plan.trial_days);
                status = 'trialing';
            }

            // Create subscription
            const result = await client.query<Subscription>(
                `INSERT INTO subscriptions (
                    user_id, plan_id, status, billing_interval, amount, currency,
                    current_period_start, current_period_end, next_billing_date,
                    trial_start, trial_end, usage_reset_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                RETURNING *`,
                [
                    params.user_id,
                    params.plan_id,
                    status,
                    params.billing_interval,
                    amount,
                    plan.currency,
                    currentPeriodStart,
                    currentPeriodEnd,
                    trialEnd || currentPeriodEnd,
                    trialStart,
                    trialEnd,
                    currentPeriodEnd
                ]
            );

            await client.query('COMMIT');

            const subscription = this.formatSubscription(result.rows[0]);

            // Clear cache
            await this.cache.delete(`subscription:user:${params.user_id}`);

            // Audit log
            await logAuditEvent({
                userId: params.user_id,
                action: 'subscription.created',
                resourceType: 'subscription',
                resourceId: subscription.id,
                details: { plan_id: params.plan_id, billing_interval: params.billing_interval }
            });

            return subscription;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Get active subscription for user
     */
    async getActiveSubscription(userId: string): Promise<Subscription | null> {
        const cacheKey = `subscription:user:${userId}:active`;
        const cached = await this.cache.get<Subscription>(cacheKey);

        if (cached) {
            return cached;
        }

        const result = await this.pool.query<Subscription>(
            `SELECT * FROM subscriptions
             WHERE user_id = $1 AND status IN ('active', 'trialing')
             ORDER BY created_at DESC
             LIMIT 1`,
            [userId]
        );

        if (result.rows.length === 0) {
            return null;
        }

        const subscription = this.formatSubscription(result.rows[0]);
        await this.cache.set(cacheKey, subscription, { ttl: 300 });

        return subscription;
    }

    /**
     * Get subscription by ID
     */
    async getSubscriptionById(subscriptionId: string, userId: string): Promise<Subscription | null> {
        const result = await this.pool.query<Subscription>(
            'SELECT * FROM subscriptions WHERE id = $1 AND user_id = $2',
            [subscriptionId, userId]
        );

        if (result.rows.length === 0) {
            return null;
        }

        return this.formatSubscription(result.rows[0]);
    }

    /**
     * Update subscription (upgrade/downgrade)
     */
    async updateSubscription(
        subscriptionId: string,
        userId: string,
        params: UpdateSubscriptionParams
    ): Promise<Subscription> {
        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            // Get current subscription
            const currentSub = await this.getSubscriptionById(subscriptionId, userId);
            if (!currentSub) {
                throw new Error('Subscription not found');
            }

            const updates: string[] = [];
            const values: any[] = [];
            let paramIndex = 1;

            if (params.plan_id && params.plan_id !== currentSub.plan_id) {
                // Get new plan
                const newPlan = await this.getPlanById(params.plan_id);
                if (!newPlan) {
                    throw new Error('New plan not found');
                }

                updates.push(`plan_id = $${paramIndex++}`);
                values.push(params.plan_id);

                const newAmount = params.billing_interval === 'monthly'
                    ? newPlan.price_monthly
                    : newPlan.price_yearly;

                updates.push(`amount = $${paramIndex++}`);
                values.push(newAmount);

                // Log subscription change
                await client.query(
                    `INSERT INTO subscription_changes (
                        user_id, subscription_id, change_type,
                        from_plan_id, to_plan_id, old_amount, new_amount, effective_date
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
                    [
                        userId,
                        subscriptionId,
                        newAmount > currentSub.amount ? 'upgrade' : 'downgrade',
                        currentSub.plan_id,
                        params.plan_id,
                        currentSub.amount,
                        newAmount
                    ]
                );
            }

            if (params.billing_interval) {
                updates.push(`billing_interval = $${paramIndex++}`);
                values.push(params.billing_interval);
            }

            if (params.cancel_at_period_end !== undefined) {
                updates.push(`cancel_at_period_end = $${paramIndex++}`);
                values.push(params.cancel_at_period_end);
            }

            if (updates.length === 0) {
                throw new Error('No updates provided');
            }

            updates.push(`updated_at = NOW()`);
            values.push(subscriptionId, userId);

            const result = await client.query<Subscription>(
                `UPDATE subscriptions
                 SET ${updates.join(', ')}
                 WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}
                 RETURNING *`,
                values
            );

            await client.query('COMMIT');

            const subscription = this.formatSubscription(result.rows[0]);

            // Clear cache
            await this.cache.delete(`subscription:user:${userId}:active`);

            // Audit log
            await logAuditEvent({
                userId,
                action: 'subscription.updated',
                resourceType: 'subscription',
                resourceId: subscriptionId,
                details: params
            });

            return subscription;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Cancel subscription
     */
    async cancelSubscription(
        subscriptionId: string,
        userId: string,
        reason?: string,
        feedback?: string,
        immediate: boolean = false
    ): Promise<void> {
        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            if (immediate) {
                await client.query(
                    `UPDATE subscriptions
                     SET status = 'canceled',
                         canceled_at = NOW(),
                         cancellation_reason = $3,
                         cancellation_feedback = $4,
                         updated_at = NOW()
                     WHERE id = $1 AND user_id = $2`,
                    [subscriptionId, userId, reason, feedback]
                );
            } else {
                await client.query(
                    `UPDATE subscriptions
                     SET cancel_at_period_end = true,
                         cancellation_reason = $3,
                         cancellation_feedback = $4,
                         updated_at = NOW()
                     WHERE id = $1 AND user_id = $2`,
                    [subscriptionId, userId, reason, feedback]
                );
            }

            // Log subscription change
            await client.query(
                `INSERT INTO subscription_changes (
                    user_id, subscription_id, change_type, reason, effective_date
                ) VALUES ($1, $2, 'cancel', $3, NOW())`,
                [userId, subscriptionId, reason]
            );

            await client.query('COMMIT');

            // Clear cache
            await this.cache.delete(`subscription:user:${userId}:active`);

            // Audit log
            await logAuditEvent({
                userId,
                action: 'subscription.canceled',
                resourceType: 'subscription',
                resourceId: subscriptionId,
                details: { reason, immediate }
            });
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    // =====================================================================================
    // Usage Tracking
    // =====================================================================================

    /**
     * Check if user can perform action based on usage limits
     */
    async checkUsageLimit(
        userId: string,
        metric: string,
        requestedAmount: number = 1
    ): Promise<UsageCheck> {
        const result = await this.pool.query<UsageCheck>(
            'SELECT * FROM check_usage_limit($1, $2, $3)',
            [userId, metric, requestedAmount]
        );

        return result.rows[0];
    }

    /**
     * Track usage
     */
    async trackUsage(
        subscriptionId: string,
        metric: string,
        amount: number
    ): Promise<void> {
        await this.pool.query(
            'SELECT update_usage($1, $2, $3)',
            [subscriptionId, metric, amount]
        );
    }

    /**
     * Get current usage for subscription
     */
    async getCurrentUsage(subscriptionId: string): Promise<SubscriptionUsage | null> {
        const result = await this.pool.query<SubscriptionUsage>(
            `SELECT * FROM subscription_usage
             WHERE subscription_id = $1
             AND period_end > NOW()
             ORDER BY created_at DESC
             LIMIT 1`,
            [subscriptionId]
        );

        if (result.rows.length === 0) {
            return null;
        }

        return result.rows[0];
    }

    // =====================================================================================
    // Helper Methods
    // =====================================================================================

    /**
     * Format plan from database
     */
    private formatPlan(row: any): SubscriptionPlan {
        return {
            ...row,
            features: typeof row.features === 'object' ? row.features : JSON.parse(row.features || '{}'),
            limits: typeof row.limits === 'object' ? row.limits : JSON.parse(row.limits || '{}'),
            metadata: typeof row.metadata === 'object' ? row.metadata : JSON.parse(row.metadata || '{}')
        };
    }

    /**
     * Format subscription from database
     */
    private formatSubscription(row: any): Subscription {
        return {
            ...row,
            metadata: typeof row.metadata === 'object' ? row.metadata : JSON.parse(row.metadata || '{}')
        };
    }
}

// Singleton instance
let subscriptionServiceInstance: SubscriptionService | null = null;

export function getSubscriptionService(): SubscriptionService {
    if (!subscriptionServiceInstance) {
        subscriptionServiceInstance = new SubscriptionService();
    }
    return subscriptionServiceInstance;
}
