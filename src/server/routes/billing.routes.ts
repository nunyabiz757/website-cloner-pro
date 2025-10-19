import express, { Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { getSubscriptionService } from '../services/subscription.service.js';
import { getPaymentService } from '../services/payment.service.js';
import { getInvoiceService } from '../services/invoice.service.js';
import { getPaymentMethodService } from '../services/payment-method.service.js';

const router = express.Router();

// =====================================================================================
// Subscription Plans Routes
// =====================================================================================

/**
 * Get all public subscription plans
 * GET /api/billing/plans
 */
router.get('/plans', async (req: Request, res: Response) => {
    try {
        const subscriptionService = getSubscriptionService();
        const plans = await subscriptionService.getPublicPlans();

        res.json({
            success: true,
            data: plans
        });
    } catch (error: any) {
        console.error('Error fetching plans:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Get subscription plan by ID
 * GET /api/billing/plans/:id
 */
router.get('/plans/:id', [
    param('id').isUUID()
], async (req: Request, res: Response) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const subscriptionService = getSubscriptionService();
        const plan = await subscriptionService.getPlanById(req.params.id);

        if (!plan) {
            return res.status(404).json({
                success: false,
                error: 'Plan not found'
            });
        }

        res.json({
            success: true,
            data: plan
        });
    } catch (error: any) {
        console.error('Error fetching plan:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// =====================================================================================
// Subscription Management Routes
// =====================================================================================

/**
 * Create subscription
 * POST /api/billing/subscriptions
 */
router.post('/subscriptions', [
    body('plan_id').isUUID(),
    body('billing_interval').isIn(['monthly', 'yearly']),
    body('payment_method_id').optional().isString(),
    body('promo_code').optional().isString()
], async (req: Request, res: Response) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const userId = (req as any).user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized'
            });
        }

        const subscriptionService = getSubscriptionService();
        const subscription = await subscriptionService.createSubscription({
            user_id: userId,
            plan_id: req.body.plan_id,
            billing_interval: req.body.billing_interval,
            payment_method_id: req.body.payment_method_id,
            promo_code: req.body.promo_code
        });

        res.status(201).json({
            success: true,
            data: subscription
        });
    } catch (error: any) {
        console.error('Error creating subscription:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Get active subscription for user
 * GET /api/billing/subscriptions/active
 */
router.get('/subscriptions/active', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized'
            });
        }

        const subscriptionService = getSubscriptionService();
        const subscription = await subscriptionService.getActiveSubscription(userId);

        res.json({
            success: true,
            data: subscription
        });
    } catch (error: any) {
        console.error('Error fetching active subscription:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Get subscription by ID
 * GET /api/billing/subscriptions/:id
 */
router.get('/subscriptions/:id', [
    param('id').isUUID()
], async (req: Request, res: Response) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const userId = (req as any).user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized'
            });
        }

        const subscriptionService = getSubscriptionService();
        const subscription = await subscriptionService.getSubscriptionById(req.params.id, userId);

        if (!subscription) {
            return res.status(404).json({
                success: false,
                error: 'Subscription not found'
            });
        }

        res.json({
            success: true,
            data: subscription
        });
    } catch (error: any) {
        console.error('Error fetching subscription:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Update subscription
 * PUT /api/billing/subscriptions/:id
 */
router.put('/subscriptions/:id', [
    param('id').isUUID(),
    body('plan_id').optional().isUUID(),
    body('billing_interval').optional().isIn(['monthly', 'yearly']),
    body('cancel_at_period_end').optional().isBoolean()
], async (req: Request, res: Response) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const userId = (req as any).user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized'
            });
        }

        const subscriptionService = getSubscriptionService();
        const subscription = await subscriptionService.updateSubscription(
            req.params.id,
            userId,
            {
                plan_id: req.body.plan_id,
                billing_interval: req.body.billing_interval,
                cancel_at_period_end: req.body.cancel_at_period_end
            }
        );

        res.json({
            success: true,
            data: subscription
        });
    } catch (error: any) {
        console.error('Error updating subscription:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Cancel subscription
 * POST /api/billing/subscriptions/:id/cancel
 */
router.post('/subscriptions/:id/cancel', [
    param('id').isUUID(),
    body('reason').optional().isString(),
    body('feedback').optional().isString(),
    body('immediate').optional().isBoolean()
], async (req: Request, res: Response) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const userId = (req as any).user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized'
            });
        }

        const subscriptionService = getSubscriptionService();
        await subscriptionService.cancelSubscription(
            req.params.id,
            userId,
            req.body.reason,
            req.body.feedback,
            req.body.immediate || false
        );

        res.json({
            success: true,
            message: 'Subscription cancelled successfully'
        });
    } catch (error: any) {
        console.error('Error cancelling subscription:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Check usage limit
 * POST /api/billing/subscriptions/check-usage
 */
router.post('/subscriptions/check-usage', [
    body('metric').isString(),
    body('amount').optional().isInt({ min: 1 })
], async (req: Request, res: Response) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const userId = (req as any).user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized'
            });
        }

        const subscriptionService = getSubscriptionService();
        const usageCheck = await subscriptionService.checkUsageLimit(
            userId,
            req.body.metric,
            req.body.amount || 1
        );

        res.json({
            success: true,
            data: usageCheck
        });
    } catch (error: any) {
        console.error('Error checking usage:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Get current usage
 * GET /api/billing/subscriptions/usage
 */
router.get('/subscriptions/usage', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized'
            });
        }

        const subscriptionService = getSubscriptionService();
        const activeSubscription = await subscriptionService.getActiveSubscription(userId);

        if (!activeSubscription) {
            return res.status(404).json({
                success: false,
                error: 'No active subscription found'
            });
        }

        const usage = await subscriptionService.getCurrentUsage(activeSubscription.id);

        res.json({
            success: true,
            data: usage
        });
    } catch (error: any) {
        console.error('Error fetching usage:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// =====================================================================================
// Payment Routes
// =====================================================================================

/**
 * Create payment intent
 * POST /api/billing/payments/intents
 */
router.post('/payments/intents', [
    body('amount').isFloat({ min: 0.5 }),
    body('currency').optional().isString(),
    body('payment_method_id').optional().isString(),
    body('subscription_id').optional().isUUID(),
    body('description').optional().isString(),
    body('metadata').optional().isObject()
], async (req: Request, res: Response) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const userId = (req as any).user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized'
            });
        }

        const paymentService = getPaymentService();
        const paymentIntent = await paymentService.createPaymentIntent({
            user_id: userId,
            amount: req.body.amount,
            currency: req.body.currency,
            payment_method_id: req.body.payment_method_id,
            subscription_id: req.body.subscription_id,
            description: req.body.description,
            metadata: req.body.metadata
        });

        res.status(201).json({
            success: true,
            data: paymentIntent
        });
    } catch (error: any) {
        console.error('Error creating payment intent:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Confirm payment intent
 * POST /api/billing/payments/intents/:id/confirm
 */
router.post('/payments/intents/:id/confirm', [
    param('id').isString()
], async (req: Request, res: Response) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const paymentService = getPaymentService();
        const payment = await paymentService.confirmPaymentIntent(req.params.id);

        res.json({
            success: true,
            data: payment
        });
    } catch (error: any) {
        console.error('Error confirming payment:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Get payment by ID
 * GET /api/billing/payments/:id
 */
router.get('/payments/:id', [
    param('id').isUUID()
], async (req: Request, res: Response) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const userId = (req as any).user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized'
            });
        }

        const paymentService = getPaymentService();
        const payment = await paymentService.getPaymentById(req.params.id, userId);

        if (!payment) {
            return res.status(404).json({
                success: false,
                error: 'Payment not found'
            });
        }

        res.json({
            success: true,
            data: payment
        });
    } catch (error: any) {
        console.error('Error fetching payment:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Get user payments
 * GET /api/billing/payments
 */
router.get('/payments', [
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('offset').optional().isInt({ min: 0 })
], async (req: Request, res: Response) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const userId = (req as any).user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized'
            });
        }

        const limit = parseInt(req.query.limit as string) || 50;
        const offset = parseInt(req.query.offset as string) || 0;

        const paymentService = getPaymentService();
        const payments = await paymentService.getUserPayments(userId, limit, offset);

        res.json({
            success: true,
            data: payments
        });
    } catch (error: any) {
        console.error('Error fetching payments:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Refund payment
 * POST /api/billing/payments/:id/refund
 */
router.post('/payments/:id/refund', [
    param('id').isUUID(),
    body('amount').optional().isFloat({ min: 0.5 }),
    body('reason').optional().isString()
], async (req: Request, res: Response) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const userId = (req as any).user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized'
            });
        }

        const paymentService = getPaymentService();
        const payment = await paymentService.refundPayment(
            req.params.id,
            userId,
            req.body.amount,
            req.body.reason
        );

        res.json({
            success: true,
            data: payment
        });
    } catch (error: any) {
        console.error('Error refunding payment:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// =====================================================================================
// Invoice Routes
// =====================================================================================

/**
 * Generate invoice
 * POST /api/billing/invoices
 */
router.post('/invoices', [
    body('subscription_id').optional().isUUID(),
    body('billing_reason').isString(),
    body('amount_due').isFloat({ min: 0 }),
    body('currency').optional().isString(),
    body('period_start').optional().isISO8601(),
    body('period_end').optional().isISO8601(),
    body('due_date').optional().isISO8601(),
    body('items').isArray(),
    body('items.*.description').isString(),
    body('items.*.quantity').isInt({ min: 1 }),
    body('items.*.unit_amount').isFloat({ min: 0 })
], async (req: Request, res: Response) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const userId = (req as any).user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized'
            });
        }

        const invoiceService = getInvoiceService();
        const invoice = await invoiceService.generateInvoice({
            user_id: userId,
            subscription_id: req.body.subscription_id,
            billing_reason: req.body.billing_reason,
            amount_due: req.body.amount_due,
            currency: req.body.currency,
            period_start: req.body.period_start ? new Date(req.body.period_start) : undefined,
            period_end: req.body.period_end ? new Date(req.body.period_end) : undefined,
            due_date: req.body.due_date ? new Date(req.body.due_date) : undefined,
            items: req.body.items,
            metadata: req.body.metadata
        });

        res.status(201).json({
            success: true,
            data: invoice
        });
    } catch (error: any) {
        console.error('Error generating invoice:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Get invoice by ID
 * GET /api/billing/invoices/:id
 */
router.get('/invoices/:id', [
    param('id').isUUID()
], async (req: Request, res: Response) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const userId = (req as any).user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized'
            });
        }

        const invoiceService = getInvoiceService();
        const invoice = await invoiceService.getInvoiceById(req.params.id, userId);

        if (!invoice) {
            return res.status(404).json({
                success: false,
                error: 'Invoice not found'
            });
        }

        res.json({
            success: true,
            data: invoice
        });
    } catch (error: any) {
        console.error('Error fetching invoice:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Get invoice items
 * GET /api/billing/invoices/:id/items
 */
router.get('/invoices/:id/items', [
    param('id').isUUID()
], async (req: Request, res: Response) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const invoiceService = getInvoiceService();
        const items = await invoiceService.getInvoiceItems(req.params.id);

        res.json({
            success: true,
            data: items
        });
    } catch (error: any) {
        console.error('Error fetching invoice items:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Get user invoices
 * GET /api/billing/invoices
 */
router.get('/invoices', [
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('offset').optional().isInt({ min: 0 }),
    query('status').optional().isString()
], async (req: Request, res: Response) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const userId = (req as any).user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized'
            });
        }

        const limit = parseInt(req.query.limit as string) || 50;
        const offset = parseInt(req.query.offset as string) || 0;
        const status = req.query.status as string;

        const invoiceService = getInvoiceService();
        const invoices = await invoiceService.getUserInvoices(userId, limit, offset, status);

        res.json({
            success: true,
            data: invoices
        });
    } catch (error: any) {
        console.error('Error fetching invoices:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Mark invoice as paid
 * POST /api/billing/invoices/:id/pay
 */
router.post('/invoices/:id/pay', [
    param('id').isUUID(),
    body('payment_id').isString()
], async (req: Request, res: Response) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const userId = (req as any).user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized'
            });
        }

        const invoiceService = getInvoiceService();
        const invoice = await invoiceService.markInvoicePaid(
            req.params.id,
            userId,
            req.body.payment_id
        );

        res.json({
            success: true,
            data: invoice
        });
    } catch (error: any) {
        console.error('Error marking invoice as paid:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Void invoice
 * POST /api/billing/invoices/:id/void
 */
router.post('/invoices/:id/void', [
    param('id').isUUID(),
    body('reason').optional().isString()
], async (req: Request, res: Response) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const userId = (req as any).user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized'
            });
        }

        const invoiceService = getInvoiceService();
        const invoice = await invoiceService.voidInvoice(
            req.params.id,
            userId,
            req.body.reason
        );

        res.json({
            success: true,
            data: invoice
        });
    } catch (error: any) {
        console.error('Error voiding invoice:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// =====================================================================================
// Payment Method Routes
// =====================================================================================

/**
 * Add payment method
 * POST /api/billing/payment-methods
 */
router.post('/payment-methods', [
    body('stripe_payment_method_id').isString(),
    body('set_as_default').optional().isBoolean()
], async (req: Request, res: Response) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const userId = (req as any).user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized'
            });
        }

        const paymentMethodService = getPaymentMethodService();
        const paymentMethod = await paymentMethodService.addPaymentMethod({
            user_id: userId,
            stripe_payment_method_id: req.body.stripe_payment_method_id,
            set_as_default: req.body.set_as_default
        });

        res.status(201).json({
            success: true,
            data: paymentMethod
        });
    } catch (error: any) {
        console.error('Error adding payment method:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Get all payment methods
 * GET /api/billing/payment-methods
 */
router.get('/payment-methods', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized'
            });
        }

        const paymentMethodService = getPaymentMethodService();
        const paymentMethods = await paymentMethodService.getPaymentMethods(userId);

        res.json({
            success: true,
            data: paymentMethods
        });
    } catch (error: any) {
        console.error('Error fetching payment methods:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Get default payment method
 * GET /api/billing/payment-methods/default
 */
router.get('/payment-methods/default', async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized'
            });
        }

        const paymentMethodService = getPaymentMethodService();
        const paymentMethod = await paymentMethodService.getDefaultPaymentMethod(userId);

        res.json({
            success: true,
            data: paymentMethod
        });
    } catch (error: any) {
        console.error('Error fetching default payment method:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Set default payment method
 * POST /api/billing/payment-methods/:id/set-default
 */
router.post('/payment-methods/:id/set-default', [
    param('id').isUUID()
], async (req: Request, res: Response) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const userId = (req as any).user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized'
            });
        }

        const paymentMethodService = getPaymentMethodService();
        const paymentMethod = await paymentMethodService.setDefaultPaymentMethod(
            req.params.id,
            userId
        );

        res.json({
            success: true,
            data: paymentMethod
        });
    } catch (error: any) {
        console.error('Error setting default payment method:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Update payment method
 * PUT /api/billing/payment-methods/:id
 */
router.put('/payment-methods/:id', [
    param('id').isUUID(),
    body('billing_details').optional().isObject(),
    body('metadata').optional().isObject()
], async (req: Request, res: Response) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const userId = (req as any).user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized'
            });
        }

        const paymentMethodService = getPaymentMethodService();
        const paymentMethod = await paymentMethodService.updatePaymentMethod(
            req.params.id,
            userId,
            {
                billing_details: req.body.billing_details,
                metadata: req.body.metadata
            }
        );

        res.json({
            success: true,
            data: paymentMethod
        });
    } catch (error: any) {
        console.error('Error updating payment method:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Remove payment method
 * DELETE /api/billing/payment-methods/:id
 */
router.delete('/payment-methods/:id', [
    param('id').isUUID()
], async (req: Request, res: Response) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                success: false,
                errors: errors.array()
            });
        }

        const userId = (req as any).user?.id;
        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized'
            });
        }

        const paymentMethodService = getPaymentMethodService();
        await paymentMethodService.removePaymentMethod(req.params.id, userId);

        res.json({
            success: true,
            message: 'Payment method removed successfully'
        });
    } catch (error: any) {
        console.error('Error removing payment method:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// =====================================================================================
// Stripe Webhook Handler
// =====================================================================================

/**
 * Handle Stripe webhooks
 * POST /api/billing/webhooks/stripe
 */
router.post('/webhooks/stripe', express.raw({ type: 'application/json' }), async (req: Request, res: Response) => {
    try {
        const signature = req.headers['stripe-signature'] as string;

        if (!signature) {
            return res.status(400).json({
                success: false,
                error: 'Missing stripe-signature header'
            });
        }

        const paymentService = getPaymentService();
        const event = paymentService.constructWebhookEvent(req.body, signature);

        // Handle the event
        await paymentService.handleWebhookEvent(event);

        res.json({ received: true });
    } catch (error: any) {
        console.error('Webhook error:', error);
        res.status(400).json({
            success: false,
            error: error.message
        });
    }
});

export default router;
