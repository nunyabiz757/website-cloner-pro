import { Pool } from 'pg';
import { getPool } from '../config/database.js';
import { getRedisCacheService } from './redis-cache.service.js';
import type { RedisCacheService } from './redis-cache.service.js';
import { logAuditEvent } from '../utils/audit-logger.js';
import Stripe from 'stripe';

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
    apiVersion: '2025-09-30.clover'
});

// =====================================================================================
// Types and Interfaces
// =====================================================================================

export interface PaymentMethod {
    id: string;
    user_id: string;
    stripe_payment_method_id: string;
    type: 'card' | 'bank_account' | 'paypal';
    is_default: boolean;
    card_brand?: string;
    card_last4?: string;
    card_exp_month?: number;
    card_exp_year?: number;
    bank_name?: string;
    bank_last4?: string;
    billing_details: {
        name?: string;
        email?: string;
        phone?: string;
        address?: {
            line1?: string;
            line2?: string;
            city?: string;
            state?: string;
            postal_code?: string;
            country?: string;
        };
    };
    metadata: Record<string, any>;
    created_at: Date;
    updated_at: Date;
}

export interface AddPaymentMethodParams {
    user_id: string;
    stripe_payment_method_id: string;
    set_as_default?: boolean;
}

export interface UpdatePaymentMethodParams {
    billing_details?: {
        name?: string;
        email?: string;
        phone?: string;
        address?: {
            line1?: string;
            line2?: string;
            city?: string;
            state?: string;
            postal_code?: string;
            country?: string;
        };
    };
    metadata?: Record<string, any>;
}

// =====================================================================================
// Payment Method Service
// =====================================================================================

export class PaymentMethodService {
    private pool: Pool;
    private cache: RedisCacheService;
    private stripe: Stripe;

    constructor() {
        this.pool = getPool();
        this.cache = getRedisCacheService();
        this.stripe = stripe;
    }

    // =====================================================================================
    // Payment Method Management
    // =====================================================================================

    /**
     * Add payment method for user
     */
    async addPaymentMethod(params: AddPaymentMethodParams): Promise<PaymentMethod> {
        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            // Get Stripe customer
            const userResult = await client.query(
                'SELECT stripe_customer_id FROM users WHERE id = $1',
                [params.user_id]
            );

            if (userResult.rows.length === 0) {
                throw new Error('User not found');
            }

            const stripeCustomerId = userResult.rows[0].stripe_customer_id;

            if (!stripeCustomerId) {
                throw new Error('User has no Stripe customer ID');
            }

            // Attach payment method to customer in Stripe
            const paymentMethod = await this.stripe.paymentMethods.attach(
                params.stripe_payment_method_id,
                { customer: stripeCustomerId }
            );

            // If set as default, unset all other defaults
            if (params.set_as_default) {
                await client.query(
                    'UPDATE payment_methods SET is_default = false WHERE user_id = $1',
                    [params.user_id]
                );

                // Set as default in Stripe
                await this.stripe.customers.update(stripeCustomerId, {
                    invoice_settings: {
                        default_payment_method: params.stripe_payment_method_id
                    }
                });
            }

            // Extract payment method details
            const pmData = this.extractPaymentMethodData(paymentMethod);

            // Create payment method in database
            const result = await client.query<PaymentMethod>(
                `INSERT INTO payment_methods (
                    user_id, stripe_payment_method_id, type, is_default,
                    card_brand, card_last4, card_exp_month, card_exp_year,
                    bank_name, bank_last4, billing_details, metadata
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                RETURNING *`,
                [
                    params.user_id,
                    params.stripe_payment_method_id,
                    pmData.type,
                    params.set_as_default || false,
                    pmData.card_brand,
                    pmData.card_last4,
                    pmData.card_exp_month,
                    pmData.card_exp_year,
                    pmData.bank_name,
                    pmData.bank_last4,
                    JSON.stringify(pmData.billing_details),
                    JSON.stringify({})
                ]
            );

            await client.query('COMMIT');

            const newPaymentMethod = result.rows[0];

            // Clear cache
            await this.cache.delete(`payment_methods:${params.user_id}`);

            // Audit log
            await logAuditEvent({
                userId: params.user_id,
                action: 'payment_method.added',
                resourceType: 'payment_method',
                resourceId: newPaymentMethod.id,
                details: { type: pmData.type, last4: pmData.card_last4 || pmData.bank_last4 }
            });

            return this.formatPaymentMethod(newPaymentMethod);
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Get payment method by ID
     */
    async getPaymentMethodById(paymentMethodId: string, userId: string): Promise<PaymentMethod | null> {
        const result = await this.pool.query<PaymentMethod>(
            'SELECT * FROM payment_methods WHERE id = $1 AND user_id = $2',
            [paymentMethodId, userId]
        );

        if (result.rows.length === 0) {
            return null;
        }

        return this.formatPaymentMethod(result.rows[0]);
    }

    /**
     * Get all payment methods for user
     */
    async getPaymentMethods(userId: string): Promise<PaymentMethod[]> {
        // Check cache
        const cacheKey = `payment_methods:${userId}`;
        const cached = await this.cache.get<PaymentMethod[]>(cacheKey);
        if (cached) {
            return cached;
        }

        const result = await this.pool.query<PaymentMethod>(
            `SELECT * FROM payment_methods
             WHERE user_id = $1
             ORDER BY is_default DESC, created_at DESC`,
            [userId]
        );

        const paymentMethods = result.rows.map(row => this.formatPaymentMethod(row));

        // Cache for 5 minutes
        await this.cache.set(cacheKey, paymentMethods, { ttl: 300 });

        return paymentMethods;
    }

    /**
     * Get default payment method
     */
    async getDefaultPaymentMethod(userId: string): Promise<PaymentMethod | null> {
        const result = await this.pool.query<PaymentMethod>(
            'SELECT * FROM payment_methods WHERE user_id = $1 AND is_default = true',
            [userId]
        );

        if (result.rows.length === 0) {
            return null;
        }

        return this.formatPaymentMethod(result.rows[0]);
    }

    /**
     * Set default payment method
     */
    async setDefaultPaymentMethod(paymentMethodId: string, userId: string): Promise<PaymentMethod> {
        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            // Get payment method
            const pmResult = await client.query<PaymentMethod>(
                'SELECT * FROM payment_methods WHERE id = $1 AND user_id = $2',
                [paymentMethodId, userId]
            );

            if (pmResult.rows.length === 0) {
                throw new Error('Payment method not found');
            }

            const paymentMethod = pmResult.rows[0];

            // Unset all other defaults
            await client.query(
                'UPDATE payment_methods SET is_default = false WHERE user_id = $1',
                [userId]
            );

            // Set as default
            const result = await client.query<PaymentMethod>(
                `UPDATE payment_methods
                 SET is_default = true, updated_at = NOW()
                 WHERE id = $1
                 RETURNING *`,
                [paymentMethodId]
            );

            // Update in Stripe
            const userResult = await client.query(
                'SELECT stripe_customer_id FROM users WHERE id = $1',
                [userId]
            );

            if (userResult.rows[0].stripe_customer_id) {
                await this.stripe.customers.update(userResult.rows[0].stripe_customer_id, {
                    invoice_settings: {
                        default_payment_method: paymentMethod.stripe_payment_method_id
                    }
                });
            }

            await client.query('COMMIT');

            const updatedPaymentMethod = result.rows[0];

            // Clear cache
            await this.cache.delete(`payment_methods:${userId}`);

            // Audit log
            await logAuditEvent({
                userId,
                action: 'payment_method.set_default',
                resourceType: 'payment_method',
                resourceId: paymentMethodId,
                details: {}
            });

            return this.formatPaymentMethod(updatedPaymentMethod);
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Update payment method
     */
    async updatePaymentMethod(
        paymentMethodId: string,
        userId: string,
        params: UpdatePaymentMethodParams
    ): Promise<PaymentMethod> {
        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            // Get payment method
            const pmResult = await client.query<PaymentMethod>(
                'SELECT * FROM payment_methods WHERE id = $1 AND user_id = $2',
                [paymentMethodId, userId]
            );

            if (pmResult.rows.length === 0) {
                throw new Error('Payment method not found');
            }

            const paymentMethod = pmResult.rows[0];

            // Update in Stripe if billing details changed
            if (params.billing_details) {
                await this.stripe.paymentMethods.update(
                    paymentMethod.stripe_payment_method_id,
                    { billing_details: params.billing_details as any }
                );
            }

            // Build update query
            const updates: string[] = [];
            const values: any[] = [paymentMethodId];
            let paramIndex = 2;

            if (params.billing_details) {
                updates.push(`billing_details = $${paramIndex}`);
                values.push(JSON.stringify(params.billing_details));
                paramIndex++;
            }

            if (params.metadata) {
                updates.push(`metadata = metadata || $${paramIndex}::jsonb`);
                values.push(JSON.stringify(params.metadata));
                paramIndex++;
            }

            if (updates.length === 0) {
                return this.formatPaymentMethod(paymentMethod);
            }

            updates.push('updated_at = NOW()');

            const result = await client.query<PaymentMethod>(
                `UPDATE payment_methods
                 SET ${updates.join(', ')}
                 WHERE id = $1
                 RETURNING *`,
                values
            );

            await client.query('COMMIT');

            const updatedPaymentMethod = result.rows[0];

            // Clear cache
            await this.cache.delete(`payment_methods:${userId}`);

            // Audit log
            await logAuditEvent({
                userId,
                action: 'payment_method.updated',
                resourceType: 'payment_method',
                resourceId: paymentMethodId,
                details: { updated_fields: Object.keys(params) }
            });

            return this.formatPaymentMethod(updatedPaymentMethod);
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Remove payment method
     */
    async removePaymentMethod(paymentMethodId: string, userId: string): Promise<void> {
        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            // Get payment method
            const pmResult = await client.query<PaymentMethod>(
                'SELECT * FROM payment_methods WHERE id = $1 AND user_id = $2',
                [paymentMethodId, userId]
            );

            if (pmResult.rows.length === 0) {
                throw new Error('Payment method not found');
            }

            const paymentMethod = pmResult.rows[0];

            // Detach from Stripe
            await this.stripe.paymentMethods.detach(paymentMethod.stripe_payment_method_id);

            // Delete from database
            await client.query(
                'DELETE FROM payment_methods WHERE id = $1',
                [paymentMethodId]
            );

            await client.query('COMMIT');

            // Clear cache
            await this.cache.delete(`payment_methods:${userId}`);

            // Audit log
            await logAuditEvent({
                userId,
                action: 'payment_method.removed',
                resourceType: 'payment_method',
                resourceId: paymentMethodId,
                details: { type: paymentMethod.type }
            });
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
     * Extract payment method data from Stripe
     */
    private extractPaymentMethodData(paymentMethod: Stripe.PaymentMethod): any {
        const data: any = {
            type: paymentMethod.type,
            billing_details: paymentMethod.billing_details || {}
        };

        if (paymentMethod.type === 'card' && paymentMethod.card) {
            data.card_brand = paymentMethod.card.brand;
            data.card_last4 = paymentMethod.card.last4;
            data.card_exp_month = paymentMethod.card.exp_month;
            data.card_exp_year = paymentMethod.card.exp_year;
        } else if (paymentMethod.type === 'us_bank_account' && paymentMethod.us_bank_account) {
            data.bank_name = paymentMethod.us_bank_account.bank_name;
            data.bank_last4 = paymentMethod.us_bank_account.last4;
        }

        return data;
    }

    /**
     * Format payment method from database
     */
    private formatPaymentMethod(row: any): PaymentMethod {
        return {
            ...row,
            billing_details: typeof row.billing_details === 'object'
                ? row.billing_details
                : JSON.parse(row.billing_details || '{}'),
            metadata: typeof row.metadata === 'object'
                ? row.metadata
                : JSON.parse(row.metadata || '{}')
        };
    }

    /**
     * Verify payment method ownership
     */
    async verifyPaymentMethod(paymentMethodId: string, userId: string): Promise<boolean> {
        const result = await this.pool.query(
            'SELECT id FROM payment_methods WHERE stripe_payment_method_id = $1 AND user_id = $2',
            [paymentMethodId, userId]
        );

        return result.rows.length > 0;
    }
}

// Singleton instance
let paymentMethodServiceInstance: PaymentMethodService | null = null;

export function getPaymentMethodService(): PaymentMethodService {
    if (!paymentMethodServiceInstance) {
        paymentMethodServiceInstance = new PaymentMethodService();
    }
    return paymentMethodServiceInstance;
}
