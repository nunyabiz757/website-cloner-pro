-- =====================================================================================
-- Phase 5 Feature 6: Monetization & Subscriptions
-- =====================================================================================
-- This migration creates the infrastructure for:
-- 1. Subscription Plans - Tiered pricing with features
-- 2. User Subscriptions - Active subscription management
-- 3. Usage Billing - Metered usage tracking
-- 4. Invoices - Invoice generation and tracking
-- 5. Payment Methods - Stored payment methods
-- 6. Payments - Payment transaction records
-- 7. Subscription Changes - Upgrade/downgrade tracking
-- 8. Trial Management - Free trial tracking
-- 9. Dunning Management - Failed payment handling
-- =====================================================================================

-- =====================================================================================
-- TABLE 1: subscription_plans
-- Defines available subscription tiers and pricing
-- =====================================================================================
CREATE TABLE IF NOT EXISTS subscription_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Plan Information
    plan_name VARCHAR(200) NOT NULL UNIQUE,
    plan_slug VARCHAR(200) NOT NULL UNIQUE,
    display_name VARCHAR(200) NOT NULL,
    description TEXT,

    -- Pricing
    price_monthly DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    price_yearly DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    currency VARCHAR(3) DEFAULT 'USD',

    -- Billing
    billing_interval VARCHAR(20) DEFAULT 'monthly', -- monthly, yearly, one-time
    trial_days INTEGER DEFAULT 0,

    -- Features and Limits
    features JSONB DEFAULT '{}'::jsonb, -- Feature flags
    limits JSONB DEFAULT '{}'::jsonb, -- Usage limits

    -- Limits Examples:
    -- {"templates": 100, "api_calls": 10000, "storage_gb": 50, "team_members": 5}

    -- External Integration
    stripe_price_id_monthly VARCHAR(255), -- Stripe Price ID for monthly
    stripe_price_id_yearly VARCHAR(255), -- Stripe Price ID for yearly
    stripe_product_id VARCHAR(255), -- Stripe Product ID

    -- Status
    is_active BOOLEAN DEFAULT true,
    is_public BOOLEAN DEFAULT true, -- Show on pricing page
    is_featured BOOLEAN DEFAULT false,

    -- Ordering
    sort_order INTEGER DEFAULT 0,

    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT valid_billing_interval CHECK (billing_interval IN ('monthly', 'yearly', 'one-time'))
);

CREATE INDEX idx_subscription_plans_slug ON subscription_plans(plan_slug);
CREATE INDEX idx_subscription_plans_active ON subscription_plans(is_active) WHERE is_active = true;
CREATE INDEX idx_subscription_plans_public ON subscription_plans(is_public) WHERE is_public = true;

-- =====================================================================================
-- TABLE 2: subscriptions
-- User subscription records
-- =====================================================================================
CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    plan_id UUID NOT NULL REFERENCES subscription_plans(id) ON DELETE RESTRICT,

    -- Subscription Details
    status VARCHAR(50) DEFAULT 'active', -- active, canceled, past_due, trialing, paused, expired
    billing_interval VARCHAR(20) NOT NULL,

    -- Pricing (snapshot at subscription time)
    amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',

    -- Billing Cycle
    current_period_start TIMESTAMPTZ NOT NULL,
    current_period_end TIMESTAMPTZ NOT NULL,
    next_billing_date TIMESTAMPTZ,

    -- Trial
    trial_start TIMESTAMPTZ,
    trial_end TIMESTAMPTZ,

    -- Cancellation
    cancel_at_period_end BOOLEAN DEFAULT false,
    canceled_at TIMESTAMPTZ,
    cancellation_reason TEXT,
    cancellation_feedback TEXT,

    -- External Integration
    stripe_subscription_id VARCHAR(255) UNIQUE,
    stripe_customer_id VARCHAR(255),

    -- Usage Tracking
    usage_reset_at TIMESTAMPTZ, -- When usage counters reset

    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT valid_status CHECK (status IN ('active', 'canceled', 'past_due', 'trialing', 'paused', 'expired'))
);

CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_plan_id ON subscriptions(plan_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_stripe_customer ON subscriptions(stripe_customer_id);
CREATE INDEX idx_subscriptions_next_billing ON subscriptions(next_billing_date);
CREATE UNIQUE INDEX idx_subscriptions_active_user ON subscriptions(user_id)
    WHERE status IN ('active', 'trialing');

-- =====================================================================================
-- TABLE 3: subscription_usage
-- Tracks metered usage for billing
-- =====================================================================================
CREATE TABLE IF NOT EXISTS subscription_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Usage Period
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,

    -- Usage Metrics (all nullable, only track what's used)
    templates_created INTEGER DEFAULT 0,
    templates_stored INTEGER DEFAULT 0,
    api_calls INTEGER DEFAULT 0,
    bandwidth_gb DECIMAL(10,2) DEFAULT 0.00,
    storage_gb DECIMAL(10,2) DEFAULT 0.00,
    webhook_deliveries INTEGER DEFAULT 0,
    ai_generations INTEGER DEFAULT 0,
    team_members INTEGER DEFAULT 0,

    -- Overage Tracking
    templates_overage INTEGER DEFAULT 0,
    api_calls_overage INTEGER DEFAULT 0,
    bandwidth_overage DECIMAL(10,2) DEFAULT 0.00,
    storage_overage DECIMAL(10,2) DEFAULT 0.00,

    -- Overage Charges
    overage_amount DECIMAL(10,2) DEFAULT 0.00,
    overage_currency VARCHAR(3) DEFAULT 'USD',

    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(subscription_id, period_start)
);

CREATE INDEX idx_subscription_usage_subscription ON subscription_usage(subscription_id);
CREATE INDEX idx_subscription_usage_user ON subscription_usage(user_id);
CREATE INDEX idx_subscription_usage_period ON subscription_usage(period_start, period_end);

-- =====================================================================================
-- TABLE 4: invoices
-- Invoice records for subscriptions and one-time charges
-- =====================================================================================
CREATE TABLE IF NOT EXISTS invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,

    -- Invoice Details
    invoice_number VARCHAR(100) UNIQUE NOT NULL,
    status VARCHAR(50) DEFAULT 'draft', -- draft, open, paid, void, uncollectible

    -- Amounts
    subtotal DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    tax DECIMAL(10,2) DEFAULT 0.00,
    discount DECIMAL(10,2) DEFAULT 0.00,
    total DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    amount_due DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    amount_paid DECIMAL(10,2) DEFAULT 0.00,
    amount_remaining DECIMAL(10,2) DEFAULT 0.00,
    currency VARCHAR(3) DEFAULT 'USD',

    -- Line Items (JSONB array)
    line_items JSONB DEFAULT '[]'::jsonb,
    -- [{description, quantity, unit_price, amount, type}]

    -- Billing Period
    period_start TIMESTAMPTZ,
    period_end TIMESTAMPTZ,

    -- Dates
    invoice_date TIMESTAMPTZ DEFAULT NOW(),
    due_date TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    voided_at TIMESTAMPTZ,

    -- Payment
    payment_method_id UUID REFERENCES payment_methods(id) ON DELETE SET NULL,
    payment_intent_id VARCHAR(255), -- Stripe Payment Intent ID

    -- External Integration
    stripe_invoice_id VARCHAR(255) UNIQUE,

    -- Customer Info (snapshot)
    billing_email VARCHAR(255),
    billing_name VARCHAR(255),
    billing_address JSONB,

    -- PDF Generation
    pdf_url TEXT,
    pdf_generated_at TIMESTAMPTZ,

    -- Metadata
    notes TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT valid_status CHECK (status IN ('draft', 'open', 'paid', 'void', 'uncollectible'))
);

CREATE INDEX idx_invoices_user_id ON invoices(user_id);
CREATE INDEX idx_invoices_subscription_id ON invoices(subscription_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_invoice_number ON invoices(invoice_number);
CREATE INDEX idx_invoices_due_date ON invoices(due_date);
CREATE INDEX idx_invoices_stripe_invoice ON invoices(stripe_invoice_id);

-- =====================================================================================
-- TABLE 5: payment_methods
-- Stored payment methods for users
-- =====================================================================================
CREATE TABLE IF NOT EXISTS payment_methods (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Payment Method Type
    type VARCHAR(50) NOT NULL, -- card, bank_account, paypal, etc.

    -- Card Details (if type = card)
    card_brand VARCHAR(50), -- visa, mastercard, amex, etc.
    card_last4 VARCHAR(4),
    card_exp_month INTEGER,
    card_exp_year INTEGER,
    card_fingerprint VARCHAR(255),

    -- Bank Account Details (if type = bank_account)
    bank_name VARCHAR(255),
    bank_account_last4 VARCHAR(4),
    bank_routing_number VARCHAR(20),

    -- Status
    is_default BOOLEAN DEFAULT false,
    is_verified BOOLEAN DEFAULT false,

    -- External Integration
    stripe_payment_method_id VARCHAR(255) UNIQUE,
    stripe_customer_id VARCHAR(255),

    -- Billing Address
    billing_name VARCHAR(255),
    billing_email VARCHAR(255),
    billing_address JSONB,

    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_used_at TIMESTAMPTZ,

    CONSTRAINT valid_type CHECK (type IN ('card', 'bank_account', 'paypal', 'other'))
);

CREATE INDEX idx_payment_methods_user_id ON payment_methods(user_id);
CREATE INDEX idx_payment_methods_default ON payment_methods(user_id, is_default) WHERE is_default = true;
CREATE INDEX idx_payment_methods_stripe ON payment_methods(stripe_payment_method_id);

-- =====================================================================================
-- TABLE 6: payments
-- Payment transaction records
-- =====================================================================================
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
    invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
    payment_method_id UUID REFERENCES payment_methods(id) ON DELETE SET NULL,

    -- Payment Details
    amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    status VARCHAR(50) DEFAULT 'pending', -- pending, succeeded, failed, canceled, refunded

    -- Payment Intent
    payment_intent_id VARCHAR(255),
    charge_id VARCHAR(255),

    -- External Integration
    stripe_payment_id VARCHAR(255) UNIQUE,

    -- Failure Details
    failure_code VARCHAR(100),
    failure_message TEXT,

    -- Refund Details
    refunded BOOLEAN DEFAULT false,
    refund_amount DECIMAL(10,2) DEFAULT 0.00,
    refunded_at TIMESTAMPTZ,
    refund_reason TEXT,

    -- Metadata
    description TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    succeeded_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,

    CONSTRAINT valid_status CHECK (status IN ('pending', 'succeeded', 'failed', 'canceled', 'refunded'))
);

CREATE INDEX idx_payments_user_id ON payments(user_id);
CREATE INDEX idx_payments_subscription_id ON payments(subscription_id);
CREATE INDEX idx_payments_invoice_id ON payments(invoice_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_stripe ON payments(stripe_payment_id);

-- =====================================================================================
-- TABLE 7: subscription_changes
-- Tracks subscription upgrades, downgrades, and changes
-- =====================================================================================
CREATE TABLE IF NOT EXISTS subscription_changes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,

    -- Change Details
    change_type VARCHAR(50) NOT NULL, -- upgrade, downgrade, cancel, reactivate, pause

    -- From/To
    from_plan_id UUID REFERENCES subscription_plans(id),
    to_plan_id UUID REFERENCES subscription_plans(id),
    from_status VARCHAR(50),
    to_status VARCHAR(50),

    -- Pricing Change
    old_amount DECIMAL(10,2),
    new_amount DECIMAL(10,2),
    prorated_amount DECIMAL(10,2),

    -- Timing
    effective_date TIMESTAMPTZ NOT NULL,
    scheduled BOOLEAN DEFAULT false,

    -- Reason
    reason TEXT,
    user_initiated BOOLEAN DEFAULT true,

    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,

    -- Timestamp
    created_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT valid_change_type CHECK (change_type IN ('upgrade', 'downgrade', 'cancel', 'reactivate', 'pause', 'resume'))
);

CREATE INDEX idx_subscription_changes_user ON subscription_changes(user_id);
CREATE INDEX idx_subscription_changes_subscription ON subscription_changes(subscription_id);
CREATE INDEX idx_subscription_changes_effective_date ON subscription_changes(effective_date);

-- =====================================================================================
-- TABLE 8: dunning_attempts
-- Tracks failed payment retry attempts
-- =====================================================================================
CREATE TABLE IF NOT EXISTS dunning_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,

    -- Attempt Details
    attempt_number INTEGER NOT NULL DEFAULT 1,
    status VARCHAR(50) DEFAULT 'pending', -- pending, succeeded, failed, abandoned

    -- Amount
    amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',

    -- Retry Schedule
    scheduled_at TIMESTAMPTZ NOT NULL,
    attempted_at TIMESTAMPTZ,
    next_attempt_at TIMESTAMPTZ,

    -- Result
    payment_id UUID REFERENCES payments(id),
    failure_reason TEXT,

    -- Actions Taken
    email_sent BOOLEAN DEFAULT false,
    email_sent_at TIMESTAMPTZ,

    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT valid_status CHECK (status IN ('pending', 'succeeded', 'failed', 'abandoned'))
);

CREATE INDEX idx_dunning_attempts_subscription ON dunning_attempts(subscription_id);
CREATE INDEX idx_dunning_attempts_user ON dunning_attempts(user_id);
CREATE INDEX idx_dunning_attempts_status ON dunning_attempts(status);
CREATE INDEX idx_dunning_attempts_scheduled ON dunning_attempts(scheduled_at) WHERE status = 'pending';

-- =====================================================================================
-- TABLE 9: promo_codes
-- Promotional codes and discounts
-- =====================================================================================
CREATE TABLE IF NOT EXISTS promo_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Code Details
    code VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(200),
    description TEXT,

    -- Discount
    discount_type VARCHAR(20) NOT NULL, -- percentage, fixed_amount
    discount_value DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',

    -- Duration
    duration VARCHAR(20) NOT NULL, -- once, repeating, forever
    duration_in_months INTEGER, -- If duration = repeating

    -- Restrictions
    max_redemptions INTEGER, -- NULL = unlimited
    times_redeemed INTEGER DEFAULT 0,
    first_time_only BOOLEAN DEFAULT false,

    -- Plan Restrictions (NULL = all plans)
    applicable_plan_ids JSONB, -- Array of plan IDs

    -- Date Restrictions
    valid_from TIMESTAMPTZ,
    valid_until TIMESTAMPTZ,

    -- Status
    is_active BOOLEAN DEFAULT true,

    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id),

    CONSTRAINT valid_discount_type CHECK (discount_type IN ('percentage', 'fixed_amount')),
    CONSTRAINT valid_duration CHECK (duration IN ('once', 'repeating', 'forever'))
);

CREATE INDEX idx_promo_codes_code ON promo_codes(code);
CREATE INDEX idx_promo_codes_active ON promo_codes(is_active) WHERE is_active = true;
CREATE INDEX idx_promo_codes_valid_until ON promo_codes(valid_until);

-- =====================================================================================
-- TABLE 10: promo_code_redemptions
-- Tracks promo code usage
-- =====================================================================================
CREATE TABLE IF NOT EXISTS promo_code_redemptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    promo_code_id UUID NOT NULL REFERENCES promo_codes(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,

    -- Discount Applied
    discount_amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',

    -- Status
    status VARCHAR(50) DEFAULT 'active', -- active, expired, canceled

    -- Expiration (if duration limited)
    expires_at TIMESTAMPTZ,

    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(promo_code_id, user_id),
    CONSTRAINT valid_status CHECK (status IN ('active', 'expired', 'canceled'))
);

CREATE INDEX idx_promo_code_redemptions_promo_code ON promo_code_redemptions(promo_code_id);
CREATE INDEX idx_promo_code_redemptions_user ON promo_code_redemptions(user_id);
CREATE INDEX idx_promo_code_redemptions_subscription ON promo_code_redemptions(subscription_id);

-- =====================================================================================
-- FUNCTIONS
-- =====================================================================================

-- =====================================================================================
-- FUNCTION: get_active_subscription
-- Gets the active subscription for a user
-- =====================================================================================
CREATE OR REPLACE FUNCTION get_active_subscription(p_user_id UUID)
RETURNS TABLE(
    subscription_id UUID,
    plan_id UUID,
    plan_name VARCHAR,
    status VARCHAR,
    current_period_end TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        s.id,
        s.plan_id,
        sp.plan_name,
        s.status,
        s.current_period_end
    FROM subscriptions s
    JOIN subscription_plans sp ON sp.id = s.plan_id
    WHERE s.user_id = p_user_id
    AND s.status IN ('active', 'trialing')
    ORDER BY s.created_at DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================================
-- FUNCTION: check_usage_limit
-- Checks if user has exceeded usage limits
-- =====================================================================================
CREATE OR REPLACE FUNCTION check_usage_limit(
    p_user_id UUID,
    p_metric VARCHAR,
    p_requested_amount INTEGER
)
RETURNS TABLE(
    allowed BOOLEAN,
    current_usage INTEGER,
    limit_amount INTEGER,
    remaining INTEGER
) AS $$
DECLARE
    v_subscription RECORD;
    v_current_usage INTEGER;
    v_limit INTEGER;
BEGIN
    -- Get active subscription with limits
    SELECT s.id, sp.limits
    INTO v_subscription
    FROM subscriptions s
    JOIN subscription_plans sp ON sp.id = s.plan_id
    WHERE s.user_id = p_user_id
    AND s.status IN ('active', 'trialing')
    LIMIT 1;

    IF v_subscription IS NULL THEN
        -- No active subscription, deny
        RETURN QUERY SELECT false, 0, 0, 0;
        RETURN;
    END IF;

    -- Get current usage for current period
    SELECT
        CASE p_metric
            WHEN 'templates' THEN templates_created
            WHEN 'api_calls' THEN api_calls
            WHEN 'storage' THEN CAST(storage_gb AS INTEGER)
            WHEN 'bandwidth' THEN CAST(bandwidth_gb AS INTEGER)
            ELSE 0
        END INTO v_current_usage
    FROM subscription_usage
    WHERE subscription_id = v_subscription.id
    AND period_end > NOW()
    ORDER BY created_at DESC
    LIMIT 1;

    v_current_usage := COALESCE(v_current_usage, 0);

    -- Get limit from plan
    v_limit := COALESCE((v_subscription.limits->>p_metric)::INTEGER, 999999);

    -- Check if allowed
    RETURN QUERY SELECT
        (v_current_usage + p_requested_amount) <= v_limit AS allowed,
        v_current_usage,
        v_limit,
        GREATEST(0, v_limit - v_current_usage) AS remaining;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================================
-- FUNCTION: update_usage
-- Updates subscription usage metrics
-- =====================================================================================
CREATE OR REPLACE FUNCTION update_usage(
    p_subscription_id UUID,
    p_metric VARCHAR,
    p_amount INTEGER
)
RETURNS void AS $$
DECLARE
    v_period_start TIMESTAMPTZ;
    v_period_end TIMESTAMPTZ;
BEGIN
    -- Get current period from subscription
    SELECT current_period_start, current_period_end
    INTO v_period_start, v_period_end
    FROM subscriptions
    WHERE id = p_subscription_id;

    -- Upsert usage record
    INSERT INTO subscription_usage (
        subscription_id,
        user_id,
        period_start,
        period_end,
        templates_created,
        api_calls,
        bandwidth_gb,
        storage_gb
    )
    SELECT
        p_subscription_id,
        user_id,
        v_period_start,
        v_period_end,
        CASE WHEN p_metric = 'templates' THEN p_amount ELSE 0 END,
        CASE WHEN p_metric = 'api_calls' THEN p_amount ELSE 0 END,
        CASE WHEN p_metric = 'bandwidth' THEN p_amount ELSE 0 END,
        CASE WHEN p_metric = 'storage' THEN p_amount ELSE 0 END
    FROM subscriptions WHERE id = p_subscription_id
    ON CONFLICT (subscription_id, period_start)
    DO UPDATE SET
        templates_created = subscription_usage.templates_created +
            CASE WHEN p_metric = 'templates' THEN p_amount ELSE 0 END,
        api_calls = subscription_usage.api_calls +
            CASE WHEN p_metric = 'api_calls' THEN p_amount ELSE 0 END,
        bandwidth_gb = subscription_usage.bandwidth_gb +
            CASE WHEN p_metric = 'bandwidth' THEN p_amount ELSE 0 END,
        storage_gb = subscription_usage.storage_gb +
            CASE WHEN p_metric = 'storage' THEN p_amount ELSE 0 END,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- =====================================================================================
-- FUNCTION: generate_invoice_number
-- Generates unique invoice numbers
-- =====================================================================================
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS VARCHAR AS $$
DECLARE
    v_year VARCHAR(4);
    v_month VARCHAR(2);
    v_sequence INTEGER;
    v_invoice_number VARCHAR(100);
BEGIN
    v_year := TO_CHAR(NOW(), 'YYYY');
    v_month := TO_CHAR(NOW(), 'MM');

    -- Get next sequence for this month
    SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM 10) AS INTEGER)), 0) + 1
    INTO v_sequence
    FROM invoices
    WHERE invoice_number LIKE 'INV-' || v_year || v_month || '%';

    v_invoice_number := 'INV-' || v_year || v_month || LPAD(v_sequence::TEXT, 4, '0');

    RETURN v_invoice_number;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================================
-- FUNCTION: calculate_proration
-- Calculates prorated amount for plan changes
-- =====================================================================================
CREATE OR REPLACE FUNCTION calculate_proration(
    p_subscription_id UUID,
    p_new_amount DECIMAL
)
RETURNS DECIMAL AS $$
DECLARE
    v_subscription RECORD;
    v_days_remaining INTEGER;
    v_days_in_period INTEGER;
    v_unused_amount DECIMAL;
    v_prorated_amount DECIMAL;
BEGIN
    SELECT
        amount,
        current_period_start,
        current_period_end
    INTO v_subscription
    FROM subscriptions
    WHERE id = p_subscription_id;

    -- Calculate days
    v_days_remaining := EXTRACT(DAY FROM v_subscription.current_period_end - NOW());
    v_days_in_period := EXTRACT(DAY FROM v_subscription.current_period_end - v_subscription.current_period_start);

    -- Calculate unused amount from current plan
    v_unused_amount := (v_subscription.amount / v_days_in_period) * v_days_remaining;

    -- Calculate prorated amount for new plan
    v_prorated_amount := (p_new_amount / v_days_in_period) * v_days_remaining;

    -- Return credit/charge
    RETURN v_prorated_amount - v_unused_amount;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================================
-- TRIGGERS
-- =====================================================================================

-- Trigger function for timestamp updates
CREATE OR REPLACE FUNCTION update_subscription_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply timestamp triggers
CREATE TRIGGER subscription_plans_update_timestamp
    BEFORE UPDATE ON subscription_plans
    FOR EACH ROW
    EXECUTE FUNCTION update_subscription_timestamp();

CREATE TRIGGER subscriptions_update_timestamp
    BEFORE UPDATE ON subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_subscription_timestamp();

CREATE TRIGGER invoices_update_timestamp
    BEFORE UPDATE ON invoices
    FOR EACH ROW
    EXECUTE FUNCTION update_subscription_timestamp();

CREATE TRIGGER payment_methods_update_timestamp
    BEFORE UPDATE ON payment_methods
    FOR EACH ROW
    EXECUTE FUNCTION update_subscription_timestamp();

CREATE TRIGGER payments_update_timestamp
    BEFORE UPDATE ON payments
    FOR EACH ROW
    EXECUTE FUNCTION update_subscription_timestamp();

-- =====================================================================================
-- SEED DATA: Default Subscription Plans
-- =====================================================================================

INSERT INTO subscription_plans (
    plan_name, plan_slug, display_name, description,
    price_monthly, price_yearly,
    features, limits,
    is_public, is_featured, sort_order
) VALUES
-- Free Plan
(
    'Free', 'free', 'Free Plan', 'Perfect for getting started',
    0.00, 0.00,
    '{"basic_templates": true, "community_support": true}'::jsonb,
    '{"templates": 5, "api_calls": 1000, "storage_gb": 1, "team_members": 1}'::jsonb,
    true, false, 1
),
-- Starter Plan
(
    'Starter', 'starter', 'Starter Plan', 'Great for individuals and small projects',
    29.00, 290.00,
    '{"all_templates": true, "email_support": true, "api_access": true}'::jsonb,
    '{"templates": 50, "api_calls": 10000, "storage_gb": 10, "team_members": 3}'::jsonb,
    true, false, 2
),
-- Professional Plan
(
    'Professional', 'professional', 'Professional Plan', 'For growing businesses',
    99.00, 990.00,
    '{"all_templates": true, "priority_support": true, "api_access": true, "webhooks": true, "white_label": true}'::jsonb,
    '{"templates": 200, "api_calls": 100000, "storage_gb": 50, "team_members": 10}'::jsonb,
    true, true, 3
),
-- Enterprise Plan
(
    'Enterprise', 'enterprise', 'Enterprise Plan', 'For large organizations',
    299.00, 2990.00,
    '{"all_templates": true, "dedicated_support": true, "api_access": true, "webhooks": true, "white_label": true, "custom_features": true}'::jsonb,
    '{"templates": -1, "api_calls": -1, "storage_gb": 500, "team_members": -1}'::jsonb,
    true, false, 4
)
ON CONFLICT (plan_slug) DO NOTHING;

-- =====================================================================================
-- COMMENTS
-- =====================================================================================

COMMENT ON TABLE subscription_plans IS 'Subscription plan definitions with pricing and limits';
COMMENT ON TABLE subscriptions IS 'Active user subscriptions';
COMMENT ON TABLE subscription_usage IS 'Metered usage tracking for billing';
COMMENT ON TABLE invoices IS 'Invoice records and billing history';
COMMENT ON TABLE payment_methods IS 'Stored payment methods';
COMMENT ON TABLE payments IS 'Payment transaction records';
COMMENT ON TABLE subscription_changes IS 'Subscription upgrade/downgrade history';
COMMENT ON TABLE dunning_attempts IS 'Failed payment retry tracking';
COMMENT ON TABLE promo_codes IS 'Promotional discount codes';
COMMENT ON TABLE promo_code_redemptions IS 'Promo code usage tracking';

-- =====================================================================================
-- END OF MIGRATION
-- =====================================================================================
