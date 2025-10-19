import express, { Request, Response } from 'express';
import { Pool } from 'pg';
import { CreditService } from '../services/credit.service.js';
import { StripeService } from '../services/stripe.service.js';
import { RedisCacheService } from '../services/redis-cache.service.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/rbac.middleware.js';
import { getPool } from '../config/database.config.js';

const router = express.Router();

// Initialize services
const pool = getPool();
const cache = new RedisCacheService();
// Initialize cache asynchronously when first used
let cacheInitialized = false;
const ensureCacheInitialized = async () => {
  if (!cacheInitialized) {
    await cache.initialize();
    cacheInitialized = true;
  }
};

const creditService = new CreditService(pool, cache);
const stripeService = new StripeService(pool, creditService);

/**
 * Get user's credit balance
 * GET /api/credits/balance
 */
router.get('/balance', authenticate, requirePermission('credits', 'view'), async (req: Request, res: Response) => {
  try {
    if (!req.user || !('userId' in req.user)) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTH_REQUIRED',
      });
    }

    const balance = await creditService.getBalance(req.user.userId);

    if (!balance) {
      // Initialize credits if not exists
      await creditService.initializeUserCredits(req.user.userId, 0);
      const newBalance = await creditService.getBalance(req.user.userId);

      return res.json({
        success: true,
        balance: newBalance,
      });
    }

    res.json({
      success: true,
      balance,
    });
  } catch (error) {
    console.error('Get balance error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get credit balance',
      code: 'BALANCE_ERROR',
    });
  }
});

/**
 * Get available credit packages
 * GET /api/credits/packages
 */
router.get('/packages', authenticate, async (req: Request, res: Response) => {
  try {
    const { type } = req.query;
    const packageType = type === 'subscription' ? 'subscription' : type === 'one_time' ? 'one_time' : undefined;

    const packages = await creditService.getCreditPackages(packageType);

    res.json({
      success: true,
      packages,
    });
  } catch (error) {
    console.error('Get packages error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get credit packages',
      code: 'PACKAGES_ERROR',
    });
  }
});

/**
 * Get credit transaction history
 * GET /api/credits/transactions
 */
router.get('/transactions', authenticate, requirePermission('credits', 'view'), async (req: Request, res: Response) => {
  try {
    if (!req.user || !('userId' in req.user)) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTH_REQUIRED',
      });
    }

    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const result = await creditService.getTransactions(req.user.userId, limit, offset);

    res.json({
      success: true,
      transactions: result.transactions,
      total: result.total,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get transaction history',
      code: 'TRANSACTIONS_ERROR',
    });
  }
});

/**
 * Get credit statistics
 * GET /api/credits/statistics
 */
router.get('/statistics', authenticate, requirePermission('credits', 'view'), async (req: Request, res: Response) => {
  try {
    if (!req.user || !('userId' in req.user)) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTH_REQUIRED',
      });
    }

    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;

    const statistics = await creditService.getStatistics(req.user.userId, startDate, endDate);

    res.json({
      success: true,
      statistics,
    });
  } catch (error) {
    console.error('Get statistics error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get credit statistics',
      code: 'STATISTICS_ERROR',
    });
  }
});

/**
 * Create payment intent for one-time credit purchase
 * POST /api/credits/purchase
 */
router.post('/purchase', authenticate, requirePermission('credits', 'purchase'), async (req: Request, res: Response) => {
  try {
    if (!req.user || !('userId' in req.user)) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTH_REQUIRED',
      });
    }

    const { packageId } = req.body;

    if (!packageId) {
      return res.status(400).json({
        success: false,
        error: 'Package ID is required',
        code: 'VALIDATION_ERROR',
      });
    }

    // Get user info
    const userResult = await pool.query(
      'SELECT email, first_name, last_name FROM users WHERE id = $1',
      [req.user.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
        code: 'USER_NOT_FOUND',
      });
    }

    const user = userResult.rows[0];
    const email = user.email;
    const name = `${user.first_name || ''} ${user.last_name || ''}`.trim();

    // Create payment intent
    const paymentIntent = await stripeService.createPaymentIntent({
      userId: req.user.userId,
      packageId,
      email,
      metadata: {
        name,
        ipAddress: req.ip,
      },
    });

    res.json({
      success: true,
      clientSecret: paymentIntent.clientSecret,
      paymentIntentId: paymentIntent.paymentIntentId,
      amount: paymentIntent.amount,
      currency: paymentIntent.currency,
    });
  } catch (error) {
    console.error('Create payment intent error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Purchase failed';

    if (errorMessage.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: errorMessage,
        code: 'PACKAGE_NOT_FOUND',
      });
    }

    if (errorMessage.includes('requires a subscription')) {
      return res.status(400).json({
        success: false,
        error: errorMessage,
        code: 'INVALID_PACKAGE_TYPE',
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to create payment intent',
      code: 'PAYMENT_ERROR',
    });
  }
});

/**
 * Create subscription
 * POST /api/credits/subscribe
 */
router.post('/subscribe', authenticate, requirePermission('credits', 'purchase'), async (req: Request, res: Response) => {
  try {
    if (!req.user || !('userId' in req.user)) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTH_REQUIRED',
      });
    }

    const { packageId, paymentMethodId } = req.body;

    if (!packageId) {
      return res.status(400).json({
        success: false,
        error: 'Package ID is required',
        code: 'VALIDATION_ERROR',
      });
    }

    // Get user info
    const userResult = await pool.query(
      'SELECT email, first_name, last_name FROM users WHERE id = $1',
      [req.user.userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found',
        code: 'USER_NOT_FOUND',
      });
    }

    const user = userResult.rows[0];
    const email = user.email;
    const name = `${user.first_name || ''} ${user.last_name || ''}`.trim();

    // Create subscription
    const subscription = await stripeService.createSubscription({
      userId: req.user.userId,
      packageId,
      email,
      paymentMethodId,
      metadata: {
        name,
        ipAddress: req.ip,
      },
    });

    res.json({
      success: true,
      subscriptionId: subscription.subscriptionId,
      clientSecret: subscription.clientSecret,
      status: subscription.status,
      currentPeriodEnd: subscription.currentPeriodEnd,
    });
  } catch (error) {
    console.error('Create subscription error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Subscription failed';

    if (errorMessage.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: errorMessage,
        code: 'PACKAGE_NOT_FOUND',
      });
    }

    if (errorMessage.includes('not a subscription')) {
      return res.status(400).json({
        success: false,
        error: errorMessage,
        code: 'INVALID_PACKAGE_TYPE',
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to create subscription',
      code: 'SUBSCRIPTION_ERROR',
    });
  }
});

/**
 * Cancel subscription
 * POST /api/credits/subscription/cancel
 */
router.post('/subscription/cancel', authenticate, requirePermission('credits', 'purchase'), async (req: Request, res: Response) => {
  try {
    if (!req.user || !('userId' in req.user)) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTH_REQUIRED',
      });
    }

    const { subscriptionId, immediate } = req.body;

    if (!subscriptionId) {
      return res.status(400).json({
        success: false,
        error: 'Subscription ID is required',
        code: 'VALIDATION_ERROR',
      });
    }

    await stripeService.cancelSubscription(req.user.userId, subscriptionId, immediate === true);

    res.json({
      success: true,
      message: immediate ? 'Subscription canceled immediately' : 'Subscription will cancel at period end',
    });
  } catch (error) {
    console.error('Cancel subscription error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Cancellation failed';

    if (errorMessage.includes('not found') || errorMessage.includes('does not belong')) {
      return res.status(404).json({
        success: false,
        error: errorMessage,
        code: 'SUBSCRIPTION_NOT_FOUND',
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to cancel subscription',
      code: 'CANCEL_ERROR',
    });
  }
});

/**
 * Reactivate canceled subscription
 * POST /api/credits/subscription/reactivate
 */
router.post('/subscription/reactivate', authenticate, requirePermission('credits', 'purchase'), async (req: Request, res: Response) => {
  try {
    if (!req.user || !('userId' in req.user)) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTH_REQUIRED',
      });
    }

    const { subscriptionId } = req.body;

    if (!subscriptionId) {
      return res.status(400).json({
        success: false,
        error: 'Subscription ID is required',
        code: 'VALIDATION_ERROR',
      });
    }

    await stripeService.reactivateSubscription(req.user.userId, subscriptionId);

    res.json({
      success: true,
      message: 'Subscription reactivated successfully',
    });
  } catch (error) {
    console.error('Reactivate subscription error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Reactivation failed';

    if (errorMessage.includes('not found') || errorMessage.includes('does not belong')) {
      return res.status(404).json({
        success: false,
        error: errorMessage,
        code: 'SUBSCRIPTION_NOT_FOUND',
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to reactivate subscription',
      code: 'REACTIVATE_ERROR',
    });
  }
});

/**
 * Stripe webhook endpoint
 * POST /api/credits/webhook
 */
router.post('/webhook', express.raw({ type: 'application/json' }), async (req: Request, res: Response) => {
  try {
    const signature = req.headers['stripe-signature'] as string;

    if (!signature) {
      return res.status(400).json({
        success: false,
        error: 'Missing stripe-signature header',
        code: 'MISSING_SIGNATURE',
      });
    }

    // Verify webhook signature
    const event = stripeService.verifyWebhookSignature(req.body, signature);

    // Process webhook event
    await stripeService.processWebhookEvent(event);

    res.json({
      success: true,
      received: true,
    });
  } catch (error) {
    console.error('Webhook processing error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Webhook failed';

    if (errorMessage.includes('signature')) {
      return res.status(400).json({
        success: false,
        error: 'Invalid webhook signature',
        code: 'INVALID_SIGNATURE',
      });
    }

    res.status(500).json({
      success: false,
      error: 'Webhook processing failed',
      code: 'WEBHOOK_ERROR',
    });
  }
});

/**
 * Admin: Get all user balances
 * GET /api/credits/admin/balances
 */
router.get('/admin/balances', authenticate, requirePermission('credits', 'admin_view_all'), async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const result = await creditService.getAllUserBalances(limit, offset);

    res.json({
      success: true,
      balances: result.balances,
      total: result.total,
      limit,
      offset,
    });
  } catch (error) {
    console.error('Get all balances error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user balances',
      code: 'ADMIN_ERROR',
    });
  }
});

/**
 * Admin: Adjust user credits
 * POST /api/credits/admin/adjust
 */
router.post('/admin/adjust', authenticate, requirePermission('credits', 'admin_adjust'), async (req: Request, res: Response) => {
  try {
    if (!req.user || !('userId' in req.user)) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTH_REQUIRED',
      });
    }

    const { userId, creditsChange, reason } = req.body;

    if (!userId || creditsChange === undefined || !reason) {
      return res.status(400).json({
        success: false,
        error: 'User ID, credits change, and reason are required',
        code: 'VALIDATION_ERROR',
      });
    }

    const result = await creditService.adminAdjustCredits(
      userId,
      creditsChange,
      reason,
      req.user.userId
    );

    res.json({
      success: true,
      message: 'Credits adjusted successfully',
      result,
    });
  } catch (error) {
    console.error('Admin adjust credits error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to adjust credits',
      code: 'ADMIN_ADJUST_ERROR',
    });
  }
});

export default router;
