import Stripe from 'stripe';
import { Pool } from 'pg';
import { AppLogger } from '../utils/logger.util.js';
import { CreditService } from './credit.service.js';
import { RedisCacheService } from './redis-cache.service.js';

/**
 * Stripe Integration Service
 *
 * Manages Stripe payment operations for credit purchases:
 * - Payment intent creation for one-time purchases
 * - Subscription management (create, update, cancel)
 * - Webhook signature verification
 * - Payment success/failure handling
 * - Customer management
 * - Credit package to Stripe price mapping
 *
 * Features:
 * - Idempotency support for payment retries
 * - Webhook event deduplication
 * - Automatic credit addition on successful payment
 * - Subscription lifecycle management
 * - Customer metadata tracking
 */

export interface CreatePaymentIntentParams {
  userId: string;
  packageId: string;
  email: string;
  metadata?: Record<string, any>;
}

export interface CreateSubscriptionParams {
  userId: string;
  packageId: string;
  email: string;
  paymentMethodId?: string;
  metadata?: Record<string, any>;
}

export interface PaymentIntentResult {
  clientSecret: string;
  paymentIntentId: string;
  amount: number;
  currency: string;
}

export interface SubscriptionResult {
  subscriptionId: string;
  clientSecret?: string;
  status: string;
  currentPeriodEnd: Date;
}

export interface WebhookEvent {
  id: string;
  type: string;
  data: any;
  created: number;
}

export class StripeService {
  private stripe: Stripe;
  private pool: Pool;
  private logger: AppLogger;
  private creditService: CreditService;
  private webhookSecret: string;
  private readonly WEBHOOK_TOLERANCE = 300; // 5 minutes

  constructor(pool: Pool, creditService: CreditService) {
    const apiKey = process.env.STRIPE_SECRET_KEY;
    if (!apiKey) {
      throw new Error('STRIPE_SECRET_KEY environment variable is required');
    }

    this.stripe = new Stripe(apiKey, {
      apiVersion: '2024-11-20.acacia',
      typescript: true,
    });

    this.pool = pool;
    this.creditService = creditService;
    this.logger = AppLogger.getInstance();

    this.webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
    if (!this.webhookSecret) {
      this.logger.warn('STRIPE_WEBHOOK_SECRET not set - webhook signature verification disabled', {
        component: 'StripeService',
      });
    }
  }

  /**
   * Get or create Stripe customer for user
   */
  async getOrCreateCustomer(userId: string, email: string, name?: string): Promise<string> {
    try {
      // Check if customer already exists in database
      const result = await this.pool.query(
        `SELECT stripe_customer_id FROM stripe_customers WHERE user_id = $1`,
        [userId]
      );

      if (result.rows.length > 0 && result.rows[0].stripe_customer_id) {
        return result.rows[0].stripe_customer_id;
      }

      // Create new Stripe customer
      const customer = await this.stripe.customers.create({
        email,
        name,
        metadata: {
          userId,
          source: 'website-cloner-pro',
        },
      });

      // Store in database
      await this.pool.query(
        `INSERT INTO stripe_customers (user_id, stripe_customer_id, email, created_at, updated_at)
        VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (user_id) DO UPDATE SET
          stripe_customer_id = $2,
          email = $3,
          updated_at = CURRENT_TIMESTAMP`,
        [userId, customer.id, email]
      );

      this.logger.info('Stripe customer created', {
        component: 'StripeService',
        userId,
        customerId: customer.id,
      });

      return customer.id;
    } catch (error) {
      this.logger.error('Failed to get or create Stripe customer', {
        component: 'StripeService',
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Create payment intent for one-time credit purchase
   */
  async createPaymentIntent(params: CreatePaymentIntentParams): Promise<PaymentIntentResult> {
    try {
      const { userId, packageId, email, metadata } = params;

      // Get credit package details
      const creditPackage = await this.creditService.getCreditPackageById(packageId);
      if (!creditPackage) {
        throw new Error(`Credit package not found: ${packageId}`);
      }

      if (creditPackage.packageType !== 'one_time') {
        throw new Error('This package requires a subscription');
      }

      // Get or create customer
      const customerId = await this.getOrCreateCustomer(userId, email);

      // Create payment intent
      const amount = Math.round(creditPackage.priceUsd * 100); // Convert to cents
      const paymentIntent = await this.stripe.paymentIntents.create({
        amount,
        currency: 'usd',
        customer: customerId,
        metadata: {
          userId,
          packageId,
          credits: creditPackage.credits.toString(),
          packageName: creditPackage.name,
          ...metadata,
        },
        automatic_payment_methods: {
          enabled: true,
        },
      });

      // Store payment intent in database
      await this.pool.query(
        `INSERT INTO payment_intents (
          user_id,
          stripe_payment_intent_id,
          package_id,
          amount_usd,
          currency,
          status,
          metadata,
          created_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [
          userId,
          paymentIntent.id,
          packageId,
          creditPackage.priceUsd,
          'usd',
          paymentIntent.status,
          JSON.stringify(paymentIntent.metadata),
        ]
      );

      this.logger.info('Payment intent created', {
        component: 'StripeService',
        userId,
        paymentIntentId: paymentIntent.id,
        amount,
        packageId,
      });

      return {
        clientSecret: paymentIntent.client_secret!,
        paymentIntentId: paymentIntent.id,
        amount,
        currency: 'usd',
      };
    } catch (error) {
      this.logger.error('Failed to create payment intent', {
        component: 'StripeService',
        params,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Create subscription for recurring credits
   */
  async createSubscription(params: CreateSubscriptionParams): Promise<SubscriptionResult> {
    try {
      const { userId, packageId, email, paymentMethodId, metadata } = params;

      // Get credit package details
      const creditPackage = await this.creditService.getCreditPackageById(packageId);
      if (!creditPackage) {
        throw new Error(`Credit package not found: ${packageId}`);
      }

      if (creditPackage.packageType !== 'subscription') {
        throw new Error('This package is not a subscription');
      }

      if (!creditPackage.stripePriceId) {
        throw new Error('Package does not have a Stripe price ID configured');
      }

      // Get or create customer
      const customerId = await this.getOrCreateCustomer(userId, email);

      // Attach payment method if provided
      if (paymentMethodId) {
        await this.stripe.paymentMethods.attach(paymentMethodId, {
          customer: customerId,
        });

        // Set as default payment method
        await this.stripe.customers.update(customerId, {
          invoice_settings: {
            default_payment_method: paymentMethodId,
          },
        });
      }

      // Create subscription
      const subscription = await this.stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: creditPackage.stripePriceId }],
        metadata: {
          userId,
          packageId,
          credits: creditPackage.credits.toString(),
          packageName: creditPackage.name,
          ...metadata,
        },
        payment_behavior: 'default_incomplete',
        payment_settings: { save_default_payment_method: 'on_subscription' },
        expand: ['latest_invoice.payment_intent'],
      });

      // Store subscription in database
      await this.pool.query(
        `INSERT INTO subscriptions (
          user_id,
          stripe_subscription_id,
          stripe_customer_id,
          package_id,
          status,
          current_period_start,
          current_period_end,
          cancel_at_period_end,
          metadata,
          created_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        [
          userId,
          subscription.id,
          customerId,
          packageId,
          subscription.status,
          new Date(subscription.current_period_start * 1000),
          new Date(subscription.current_period_end * 1000),
          subscription.cancel_at_period_end,
          JSON.stringify(subscription.metadata),
        ]
      );

      // Update user's credit subscription info
      await this.creditService.updateSubscription(
        userId,
        creditPackage.name,
        subscription.status,
        creditPackage.credits
      );

      this.logger.info('Subscription created', {
        component: 'StripeService',
        userId,
        subscriptionId: subscription.id,
        packageId,
      });

      // Extract client secret if payment is required
      let clientSecret: string | undefined;
      if (subscription.status === 'incomplete') {
        const latestInvoice = subscription.latest_invoice as Stripe.Invoice;
        if (latestInvoice && typeof latestInvoice.payment_intent !== 'string') {
          clientSecret = latestInvoice.payment_intent?.client_secret || undefined;
        }
      }

      return {
        subscriptionId: subscription.id,
        clientSecret,
        status: subscription.status,
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      };
    } catch (error) {
      this.logger.error('Failed to create subscription', {
        component: 'StripeService',
        params,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(userId: string, subscriptionId: string, immediate: boolean = false): Promise<void> {
    try {
      // Verify subscription belongs to user
      const result = await this.pool.query(
        `SELECT stripe_subscription_id FROM subscriptions WHERE user_id = $1 AND stripe_subscription_id = $2`,
        [userId, subscriptionId]
      );

      if (result.rows.length === 0) {
        throw new Error('Subscription not found or does not belong to user');
      }

      if (immediate) {
        // Cancel immediately
        await this.stripe.subscriptions.cancel(subscriptionId);
      } else {
        // Cancel at period end
        await this.stripe.subscriptions.update(subscriptionId, {
          cancel_at_period_end: true,
        });
      }

      // Update database
      await this.pool.query(
        `UPDATE subscriptions SET
          cancel_at_period_end = true,
          canceled_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE stripe_subscription_id = $1`,
        [subscriptionId]
      );

      this.logger.info('Subscription canceled', {
        component: 'StripeService',
        userId,
        subscriptionId,
        immediate,
      });
    } catch (error) {
      this.logger.error('Failed to cancel subscription', {
        component: 'StripeService',
        userId,
        subscriptionId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Reactivate canceled subscription
   */
  async reactivateSubscription(userId: string, subscriptionId: string): Promise<void> {
    try {
      // Verify subscription belongs to user
      const result = await this.pool.query(
        `SELECT stripe_subscription_id FROM subscriptions WHERE user_id = $1 AND stripe_subscription_id = $2`,
        [userId, subscriptionId]
      );

      if (result.rows.length === 0) {
        throw new Error('Subscription not found or does not belong to user');
      }

      // Reactivate
      await this.stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: false,
      });

      // Update database
      await this.pool.query(
        `UPDATE subscriptions SET
          cancel_at_period_end = false,
          canceled_at = NULL,
          updated_at = CURRENT_TIMESTAMP
        WHERE stripe_subscription_id = $1`,
        [subscriptionId]
      );

      this.logger.info('Subscription reactivated', {
        component: 'StripeService',
        userId,
        subscriptionId,
      });
    } catch (error) {
      this.logger.error('Failed to reactivate subscription', {
        component: 'StripeService',
        userId,
        subscriptionId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(payload: string | Buffer, signature: string): Stripe.Event {
    if (!this.webhookSecret) {
      throw new Error('Webhook secret not configured');
    }

    try {
      return this.stripe.webhooks.constructEvent(payload, signature, this.webhookSecret);
    } catch (error) {
      this.logger.error('Webhook signature verification failed', {
        component: 'StripeService',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Check if webhook event was already processed (deduplication)
   */
  private async isEventProcessed(eventId: string): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT EXISTS (
        SELECT 1 FROM stripe_webhook_events WHERE event_id = $1
      ) as exists`,
      [eventId]
    );
    return result.rows[0].exists;
  }

  /**
   * Mark webhook event as processed
   */
  private async markEventProcessed(eventId: string, eventType: string, eventData: any): Promise<void> {
    await this.pool.query(
      `INSERT INTO stripe_webhook_events (event_id, event_type, event_data, processed_at, created_at)
      VALUES ($1, $2, $3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (event_id) DO NOTHING`,
      [eventId, eventType, JSON.stringify(eventData)]
    );
  }

  /**
   * Handle payment intent succeeded event
   */
  async handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    try {
      const userId = paymentIntent.metadata.userId;
      const packageId = paymentIntent.metadata.packageId;
      const credits = parseInt(paymentIntent.metadata.credits, 10);

      if (!userId || !packageId || !credits) {
        throw new Error('Missing required metadata in payment intent');
      }

      // Get credit package
      const creditPackage = await this.creditService.getCreditPackageById(packageId);
      if (!creditPackage) {
        throw new Error(`Credit package not found: ${packageId}`);
      }

      // Add credits to user
      await this.creditService.addCredits(
        userId,
        credits,
        'purchase',
        paymentIntent.amount / 100, // Convert from cents
        paymentIntent.id,
        undefined,
        packageId,
        `Credit purchase: ${creditPackage.name}`,
        {
          stripeCustomerId: paymentIntent.customer,
          paymentMethod: paymentIntent.payment_method,
        }
      );

      // Update payment intent status
      await this.pool.query(
        `UPDATE payment_intents SET
          status = $2,
          completed_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE stripe_payment_intent_id = $1`,
        [paymentIntent.id, 'succeeded']
      );

      this.logger.info('Payment intent succeeded - credits added', {
        component: 'StripeService',
        userId,
        paymentIntentId: paymentIntent.id,
        credits,
      });
    } catch (error) {
      this.logger.error('Failed to handle payment intent succeeded', {
        component: 'StripeService',
        paymentIntentId: paymentIntent.id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Handle payment intent failed event
   */
  async handlePaymentIntentFailed(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    try {
      // Update payment intent status
      await this.pool.query(
        `UPDATE payment_intents SET
          status = $2,
          failure_reason = $3,
          updated_at = CURRENT_TIMESTAMP
        WHERE stripe_payment_intent_id = $1`,
        [paymentIntent.id, 'failed', paymentIntent.last_payment_error?.message || 'Unknown error']
      );

      this.logger.warn('Payment intent failed', {
        component: 'StripeService',
        paymentIntentId: paymentIntent.id,
        userId: paymentIntent.metadata.userId,
        reason: paymentIntent.last_payment_error?.message,
      });
    } catch (error) {
      this.logger.error('Failed to handle payment intent failed', {
        component: 'StripeService',
        paymentIntentId: paymentIntent.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Handle subscription created/updated event
   */
  async handleSubscriptionUpdated(subscription: Stripe.Subscription): Promise<void> {
    try {
      const userId = subscription.metadata.userId;
      const packageId = subscription.metadata.packageId;
      const credits = parseInt(subscription.metadata.credits, 10);

      if (!userId) {
        throw new Error('Missing userId in subscription metadata');
      }

      // Update subscription in database
      await this.pool.query(
        `INSERT INTO subscriptions (
          user_id,
          stripe_subscription_id,
          stripe_customer_id,
          package_id,
          status,
          current_period_start,
          current_period_end,
          cancel_at_period_end,
          metadata,
          created_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (stripe_subscription_id) DO UPDATE SET
          status = $5,
          current_period_start = $6,
          current_period_end = $7,
          cancel_at_period_end = $8,
          updated_at = CURRENT_TIMESTAMP`,
        [
          userId,
          subscription.id,
          subscription.customer,
          packageId,
          subscription.status,
          new Date(subscription.current_period_start * 1000),
          new Date(subscription.current_period_end * 1000),
          subscription.cancel_at_period_end,
          JSON.stringify(subscription.metadata),
        ]
      );

      // Update user's credit subscription info if active
      if (subscription.status === 'active' && packageId) {
        const creditPackage = await this.creditService.getCreditPackageById(packageId);
        if (creditPackage) {
          await this.creditService.updateSubscription(
            userId,
            creditPackage.name,
            subscription.status,
            creditPackage.credits
          );
        }
      }

      this.logger.info('Subscription updated', {
        component: 'StripeService',
        userId,
        subscriptionId: subscription.id,
        status: subscription.status,
      });
    } catch (error) {
      this.logger.error('Failed to handle subscription updated', {
        component: 'StripeService',
        subscriptionId: subscription.id,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Handle subscription deleted event
   */
  async handleSubscriptionDeleted(subscription: Stripe.Subscription): Promise<void> {
    try {
      const userId = subscription.metadata.userId;

      // Update subscription status
      await this.pool.query(
        `UPDATE subscriptions SET
          status = 'canceled',
          canceled_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        WHERE stripe_subscription_id = $1`,
        [subscription.id]
      );

      // Update user's credit subscription info
      if (userId) {
        await this.creditService.updateSubscription(userId, 'none', 'canceled', 0);
      }

      this.logger.info('Subscription deleted', {
        component: 'StripeService',
        userId,
        subscriptionId: subscription.id,
      });
    } catch (error) {
      this.logger.error('Failed to handle subscription deleted', {
        component: 'StripeService',
        subscriptionId: subscription.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Handle invoice payment succeeded (for subscription renewals)
   */
  async handleInvoicePaymentSucceeded(invoice: Stripe.Invoice): Promise<void> {
    try {
      // Only process subscription invoices
      if (!invoice.subscription) {
        return;
      }

      const subscription = await this.stripe.subscriptions.retrieve(invoice.subscription as string);
      const userId = subscription.metadata.userId;
      const packageId = subscription.metadata.packageId;
      const credits = parseInt(subscription.metadata.credits, 10);

      if (!userId || !packageId || !credits) {
        return;
      }

      // Add monthly credits for subscription renewal
      const creditPackage = await this.creditService.getCreditPackageById(packageId);
      if (!creditPackage) {
        return;
      }

      await this.creditService.addCredits(
        userId,
        credits,
        'subscription_refresh',
        invoice.amount_paid / 100,
        undefined,
        subscription.id,
        packageId,
        `Monthly subscription renewal: ${creditPackage.name}`,
        {
          invoiceId: invoice.id,
          periodStart: new Date(invoice.period_start * 1000),
          periodEnd: new Date(invoice.period_end * 1000),
        }
      );

      this.logger.info('Subscription invoice paid - credits added', {
        component: 'StripeService',
        userId,
        subscriptionId: subscription.id,
        invoiceId: invoice.id,
        credits,
      });
    } catch (error) {
      this.logger.error('Failed to handle invoice payment succeeded', {
        component: 'StripeService',
        invoiceId: invoice.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Process webhook event
   * Main entry point for webhook handling
   */
  async processWebhookEvent(event: Stripe.Event): Promise<void> {
    // Check if already processed (deduplication)
    if (await this.isEventProcessed(event.id)) {
      this.logger.info('Webhook event already processed, skipping', {
        component: 'StripeService',
        eventId: event.id,
        eventType: event.type,
      });
      return;
    }

    try {
      this.logger.info('Processing webhook event', {
        component: 'StripeService',
        eventId: event.id,
        eventType: event.type,
      });

      // Route to appropriate handler
      switch (event.type) {
        case 'payment_intent.succeeded':
          await this.handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent);
          break;

        case 'payment_intent.payment_failed':
          await this.handlePaymentIntentFailed(event.data.object as Stripe.PaymentIntent);
          break;

        case 'customer.subscription.created':
        case 'customer.subscription.updated':
          await this.handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
          break;

        case 'customer.subscription.deleted':
          await this.handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
          break;

        case 'invoice.payment_succeeded':
          await this.handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice);
          break;

        default:
          this.logger.debug('Unhandled webhook event type', {
            component: 'StripeService',
            eventId: event.id,
            eventType: event.type,
          });
      }

      // Mark as processed
      await this.markEventProcessed(event.id, event.type, event.data.object);

      this.logger.info('Webhook event processed successfully', {
        component: 'StripeService',
        eventId: event.id,
        eventType: event.type,
      });
    } catch (error) {
      this.logger.error('Failed to process webhook event', {
        component: 'StripeService',
        eventId: event.id,
        eventType: event.type,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}

export default StripeService;
