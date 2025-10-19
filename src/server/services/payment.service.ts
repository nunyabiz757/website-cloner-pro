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

export interface Payment {
    id: string;
    user_id: string;
    subscription_id?: string;
    invoice_id?: string;
    payment_method_id?: string;
    amount: number;
    currency: string;
    status: 'pending' | 'succeeded' | 'failed' | 'canceled' | 'refunded';
    payment_intent_id?: string;
    charge_id?: string;
    stripe_payment_id?: string;
    failure_code?: string;
    failure_message?: string;
    refunded: boolean;
    refund_amount: number;
    refunded_at?: Date;
    refund_reason?: string;
    description?: string;
    metadata: Record<string, any>;
    created_at: Date;
    updated_at: Date;
    succeeded_at?: Date;
    failed_at?: Date;
}

export interface CreatePaymentParams {
    user_id: string;
    amount: number;
    currency?: string;
    payment_method_id?: string;
    subscription_id?: string;
    invoice_id?: string;
    description?: string;
    metadata?: Record<string, any>;
}

export interface PaymentIntent {
    id: string;
    client_secret: string;
    amount: number;
    currency: string;
    status: string;
}

// =====================================================================================
// Payment Service
// =====================================================================================

export class PaymentService {
    private pool: Pool;
    private cache: RedisCacheService;
    private stripe: Stripe;

    constructor() {
        this.pool = getPool();
        this.cache = getRedisCacheService();
        this.stripe = stripe;
    }

    // =====================================================================================
    // Payment Intent Management
    // =====================================================================================

    /**
     * Create payment intent for Stripe
     */
    async createPaymentIntent(params: CreatePaymentParams): Promise<PaymentIntent> {
        try {
            // Get or create Stripe customer
            const customer = await this.getOrCreateStripeCustomer(params.user_id);

            // Create payment intent in Stripe
            const paymentIntent = await this.stripe.paymentIntents.create({
                amount: Math.round(params.amount * 100), // Convert to cents
                currency: params.currency || 'usd',
                customer: customer.id,
                payment_method: params.payment_method_id,
                description: params.description,
                metadata: {
                    user_id: params.user_id,
                    subscription_id: params.subscription_id || '',
                    invoice_id: params.invoice_id || '',
                    ...params.metadata
                }
            });

            // Create payment record in database
            await this.pool.query(
                `INSERT INTO payments (
                    user_id, subscription_id, invoice_id, payment_method_id,
                    amount, currency, status, payment_intent_id, description, metadata
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
                [
                    params.user_id,
                    params.subscription_id,
                    params.invoice_id,
                    params.payment_method_id,
                    params.amount,
                    params.currency || 'USD',
                    'pending',
                    paymentIntent.id,
                    params.description,
                    JSON.stringify(params.metadata || {})
                ]
            );

            // Audit log
            await logAuditEvent({
                userId: params.user_id,
                action: 'payment.intent_created',
                resourceType: 'payment',
                resourceId: paymentIntent.id,
                details: { amount: params.amount, currency: params.currency }
            });

            return {
                id: paymentIntent.id,
                client_secret: paymentIntent.client_secret || '',
                amount: paymentIntent.amount / 100,
                currency: paymentIntent.currency,
                status: paymentIntent.status
            };
        } catch (error: any) {
            console.error('Error creating payment intent:', error);
            throw new Error(`Failed to create payment intent: ${error.message}`);
        }
    }

    /**
     * Confirm payment intent
     */
    async confirmPaymentIntent(paymentIntentId: string): Promise<Payment> {
        try {
            const paymentIntent = await this.stripe.paymentIntents.confirm(paymentIntentId);

            // Update payment record
            const result = await this.pool.query<Payment>(
                `UPDATE payments
                 SET status = $2,
                     charge_id = $3,
                     succeeded_at = CASE WHEN $2 = 'succeeded' THEN NOW() ELSE NULL END,
                     failed_at = CASE WHEN $2 = 'failed' THEN NOW() ELSE NULL END,
                     updated_at = NOW()
                 WHERE payment_intent_id = $1
                 RETURNING *`,
                [
                    paymentIntentId,
                    paymentIntent.status === 'succeeded' ? 'succeeded' : 'failed',
                    paymentIntent.latest_charge?.toString()
                ]
            );

            if (result.rows.length === 0) {
                throw new Error('Payment record not found');
            }

            const payment = result.rows[0];

            // Audit log
            await logAuditEvent({
                userId: payment.user_id,
                action: `payment.${payment.status}`,
                resourceType: 'payment',
                resourceId: payment.id,
                details: { amount: payment.amount, status: payment.status }
            });

            return payment;
        } catch (error: any) {
            console.error('Error confirming payment intent:', error);
            throw new Error(`Failed to confirm payment: ${error.message}`);
        }
    }

    // =====================================================================================
    // Payment Management
    // =====================================================================================

    /**
     * Get payment by ID
     */
    async getPaymentById(paymentId: string, userId: string): Promise<Payment | null> {
        const result = await this.pool.query<Payment>(
            'SELECT * FROM payments WHERE id = $1 AND user_id = $2',
            [paymentId, userId]
        );

        if (result.rows.length === 0) {
            return null;
        }

        return this.formatPayment(result.rows[0]);
    }

    /**
     * Get payments for user
     */
    async getUserPayments(
        userId: string,
        limit: number = 50,
        offset: number = 0
    ): Promise<Payment[]> {
        const result = await this.pool.query<Payment>(
            `SELECT * FROM payments
             WHERE user_id = $1
             ORDER BY created_at DESC
             LIMIT $2 OFFSET $3`,
            [userId, limit, offset]
        );

        return result.rows.map(row => this.formatPayment(row));
    }

    /**
     * Get payments for subscription
     */
    async getSubscriptionPayments(subscriptionId: string): Promise<Payment[]> {
        const result = await this.pool.query<Payment>(
            `SELECT * FROM payments
             WHERE subscription_id = $1
             ORDER BY created_at DESC`,
            [subscriptionId]
        );

        return result.rows.map(row => this.formatPayment(row));
    }

    // =====================================================================================
    // Refund Management
    // =====================================================================================

    /**
     * Refund payment
     */
    async refundPayment(
        paymentId: string,
        userId: string,
        amount?: number,
        reason?: string
    ): Promise<Payment> {
        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            // Get payment
            const paymentResult = await client.query<Payment>(
                'SELECT * FROM payments WHERE id = $1 AND user_id = $2',
                [paymentId, userId]
            );

            if (paymentResult.rows.length === 0) {
                throw new Error('Payment not found');
            }

            const payment = paymentResult.rows[0];

            if (payment.status !== 'succeeded') {
                throw new Error('Can only refund succeeded payments');
            }

            // Process refund in Stripe
            const refund = await this.stripe.refunds.create({
                payment_intent: payment.payment_intent_id || undefined,
                amount: amount ? Math.round(amount * 100) : undefined,
                reason: reason as any
            });

            // Update payment record
            const updateResult = await client.query<Payment>(
                `UPDATE payments
                 SET refunded = true,
                     refund_amount = $2,
                     refunded_at = NOW(),
                     refund_reason = $3,
                     status = 'refunded',
                     updated_at = NOW()
                 WHERE id = $1
                 RETURNING *`,
                [paymentId, amount || payment.amount, reason]
            );

            await client.query('COMMIT');

            const updatedPayment = updateResult.rows[0];

            // Audit log
            await logAuditEvent({
                userId,
                action: 'payment.refunded',
                resourceType: 'payment',
                resourceId: paymentId,
                details: { amount: amount || payment.amount, reason }
            });

            return this.formatPayment(updatedPayment);
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    // =====================================================================================
    // Stripe Customer Management
    // =====================================================================================

    /**
     * Get or create Stripe customer for user
     */
    private async getOrCreateStripeCustomer(userId: string): Promise<Stripe.Customer> {
        // Check if user has Stripe customer ID
        const result = await this.pool.query(
            'SELECT stripe_customer_id FROM users WHERE id = $1',
            [userId]
        );

        if (result.rows.length === 0) {
            throw new Error('User not found');
        }

        let stripeCustomerId = result.rows[0].stripe_customer_id;

        // If no customer, create one
        if (!stripeCustomerId) {
            const userResult = await this.pool.query(
                'SELECT email, name FROM users WHERE id = $1',
                [userId]
            );

            const user = userResult.rows[0];

            const customer = await this.stripe.customers.create({
                email: user.email,
                name: user.name,
                metadata: {
                    user_id: userId
                }
            });

            stripeCustomerId = customer.id;

            // Save customer ID
            await this.pool.query(
                'UPDATE users SET stripe_customer_id = $2 WHERE id = $1',
                [userId, stripeCustomerId]
            );

            return customer;
        }

        // Retrieve existing customer
        const customer = await this.stripe.customers.retrieve(stripeCustomerId);
        return customer as Stripe.Customer;
    }

    /**
     * Update Stripe customer
     */
    async updateStripeCustomer(
        userId: string,
        data: {
            email?: string;
            name?: string;
            phone?: string;
            address?: any;
        }
    ): Promise<Stripe.Customer> {
        const customer = await this.getOrCreateStripeCustomer(userId);

        const updatedCustomer = await this.stripe.customers.update(customer.id, data);

        return updatedCustomer;
    }

    // =====================================================================================
    // Webhook Handling
    // =====================================================================================

    /**
     * Handle Stripe webhook events
     */
    async handleWebhookEvent(event: Stripe.Event): Promise<void> {
        try {
            switch (event.type) {
                case 'payment_intent.succeeded':
                    await this.handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent);
                    break;

                case 'payment_intent.payment_failed':
                    await this.handlePaymentIntentFailed(event.data.object as Stripe.PaymentIntent);
                    break;

                case 'charge.refunded':
                    await this.handleChargeRefunded(event.data.object as Stripe.Charge);
                    break;

                default:
                    console.log(`Unhandled event type: ${event.type}`);
            }
        } catch (error) {
            console.error('Error handling webhook event:', error);
            throw error;
        }
    }

    /**
     * Handle payment intent succeeded
     */
    private async handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent): Promise<void> {
        await this.pool.query(
            `UPDATE payments
             SET status = 'succeeded',
                 charge_id = $2,
                 succeeded_at = NOW(),
                 updated_at = NOW()
             WHERE payment_intent_id = $1`,
            [paymentIntent.id, paymentIntent.latest_charge?.toString()]
        );
    }

    /**
     * Handle payment intent failed
     */
    private async handlePaymentIntentFailed(paymentIntent: Stripe.PaymentIntent): Promise<void> {
        await this.pool.query(
            `UPDATE payments
             SET status = 'failed',
                 failure_code = $2,
                 failure_message = $3,
                 failed_at = NOW(),
                 updated_at = NOW()
             WHERE payment_intent_id = $1`,
            [
                paymentIntent.id,
                paymentIntent.last_payment_error?.code,
                paymentIntent.last_payment_error?.message
            ]
        );
    }

    /**
     * Handle charge refunded
     */
    private async handleChargeRefunded(charge: Stripe.Charge): Promise<void> {
        await this.pool.query(
            `UPDATE payments
             SET refunded = true,
                 refund_amount = $2,
                 refunded_at = NOW(),
                 status = 'refunded',
                 updated_at = NOW()
             WHERE charge_id = $1`,
            [charge.id, charge.amount_refunded / 100]
        );
    }

    // =====================================================================================
    // Helper Methods
    // =====================================================================================

    /**
     * Format payment from database
     */
    private formatPayment(row: any): Payment {
        return {
            ...row,
            metadata: typeof row.metadata === 'object' ? row.metadata : JSON.parse(row.metadata || '{}')
        };
    }

    /**
     * Construct Stripe webhook event
     */
    constructWebhookEvent(payload: string | Buffer, signature: string): Stripe.Event {
        const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
        return this.stripe.webhooks.constructEvent(payload, signature, webhookSecret);
    }
}

// Singleton instance
let paymentServiceInstance: PaymentService | null = null;

export function getPaymentService(): PaymentService {
    if (!paymentServiceInstance) {
        paymentServiceInstance = new PaymentService();
    }
    return paymentServiceInstance;
}
