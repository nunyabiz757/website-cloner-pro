-- Migration: Credit Management System
-- Created: 2025-10-15
-- Description: Implements credit system for GHL cloning with purchases and subscriptions

-- ============================================================================
-- CREDITS TABLE
-- ============================================================================
-- Tracks user credit balances and subscription information
CREATE TABLE IF NOT EXISTS credits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    credits_available INTEGER DEFAULT 0 CHECK (credits_available >= 0),
    credits_used INTEGER DEFAULT 0 CHECK (credits_used >= 0),
    subscription_type VARCHAR(50) DEFAULT 'none', -- 'none', 'basic', 'pro', 'enterprise'
    subscription_status VARCHAR(50) DEFAULT 'inactive', -- 'active', 'cancelled', 'expired', 'inactive'
    subscription_credits_per_month INTEGER DEFAULT 0,
    subscription_start_date TIMESTAMPTZ,
    subscription_end_date TIMESTAMPTZ,
    last_credit_refresh TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id)
);

-- ============================================================================
-- CREDIT PACKAGES TABLE
-- ============================================================================
-- Defines available credit packages for purchase
CREATE TABLE IF NOT EXISTS credit_packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL,
    credits INTEGER NOT NULL CHECK (credits > 0),
    price_usd DECIMAL(10, 2) NOT NULL CHECK (price_usd >= 0),
    price_per_credit DECIMAL(10, 2) NOT NULL CHECK (price_per_credit >= 0),
    is_active BOOLEAN DEFAULT true,
    sort_order INTEGER DEFAULT 0,
    description TEXT,
    package_type VARCHAR(50) DEFAULT 'one_time', -- 'one_time', 'subscription'
    subscription_interval VARCHAR(20), -- 'monthly', 'yearly' for subscription packages
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- CREDIT TRANSACTIONS TABLE
-- ============================================================================
-- Logs all credit-related transactions
CREATE TABLE IF NOT EXISTS credit_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    transaction_type VARCHAR(50) NOT NULL, -- 'purchase', 'consumption', 'refund', 'subscription_renewal', 'admin_adjustment', 'bonus'
    credits_change INTEGER NOT NULL, -- positive for additions, negative for consumption
    credits_before INTEGER NOT NULL,
    credits_after INTEGER NOT NULL,
    amount_usd DECIMAL(10, 2),
    payment_method VARCHAR(50), -- 'stripe', 'paypal', 'admin', 'subscription'
    payment_id VARCHAR(255),
    payment_status VARCHAR(50), -- 'pending', 'completed', 'failed', 'refunded'
    package_id UUID REFERENCES credit_packages(id),
    subscription_period_start TIMESTAMPTZ,
    subscription_period_end TIMESTAMPTZ,
    reason TEXT, -- For admin adjustments or special cases
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- PAYMENT INTENTS TABLE
-- ============================================================================
-- Tracks Stripe payment intents for credit purchases
CREATE TABLE IF NOT EXISTS payment_intents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stripe_payment_intent_id VARCHAR(255) UNIQUE,
    stripe_customer_id VARCHAR(255),
    amount DECIMAL(10, 2) NOT NULL CHECK (amount >= 0),
    currency VARCHAR(3) DEFAULT 'usd',
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'processing', 'succeeded', 'failed', 'cancelled'
    package_id UUID REFERENCES credit_packages(id),
    credits_to_add INTEGER NOT NULL CHECK (credits_to_add > 0),
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- STRIPE CUSTOMERS TABLE
-- ============================================================================
-- Maps users to Stripe customer IDs
CREATE TABLE IF NOT EXISTS stripe_customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
    stripe_customer_id VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255),
    default_payment_method VARCHAR(255),
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- SUBSCRIPTIONS TABLE
-- ============================================================================
-- Tracks active subscriptions for recurring credits
CREATE TABLE IF NOT EXISTS subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stripe_subscription_id VARCHAR(255) UNIQUE NOT NULL,
    stripe_customer_id VARCHAR(255) NOT NULL,
    package_id UUID REFERENCES credit_packages(id),
    status VARCHAR(50) NOT NULL DEFAULT 'active', -- 'active', 'past_due', 'cancelled', 'unpaid', 'incomplete'
    current_period_start TIMESTAMPTZ NOT NULL,
    current_period_end TIMESTAMPTZ NOT NULL,
    cancel_at_period_end BOOLEAN DEFAULT false,
    cancelled_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    trial_start TIMESTAMPTZ,
    trial_end TIMESTAMPTZ,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- STRIPE WEBHOOK EVENTS TABLE
-- ============================================================================
-- Tracks processed webhook events for deduplication
CREATE TABLE IF NOT EXISTS stripe_webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id VARCHAR(255) UNIQUE NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    event_data JSONB,
    processed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- INDEXES
-- ============================================================================
-- Credits indexes
CREATE INDEX IF NOT EXISTS idx_credits_user_id ON credits(user_id);
CREATE INDEX IF NOT EXISTS idx_credits_subscription_status ON credits(subscription_status) WHERE subscription_status = 'active';

-- Credit packages indexes
CREATE INDEX IF NOT EXISTS idx_credit_packages_active ON credit_packages(is_active, sort_order) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_credit_packages_type ON credit_packages(package_type);

-- Credit transactions indexes
CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id ON credit_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_type ON credit_transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_created_at ON credit_transactions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_created ON credit_transactions(user_id, created_at DESC);

-- Payment intents indexes
CREATE INDEX IF NOT EXISTS idx_payment_intents_user_id ON payment_intents(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_intents_stripe_id ON payment_intents(stripe_payment_intent_id);
CREATE INDEX IF NOT EXISTS idx_payment_intents_status ON payment_intents(status);

-- Stripe customers indexes
CREATE INDEX IF NOT EXISTS idx_stripe_customers_user_id ON stripe_customers(user_id);
CREATE INDEX IF NOT EXISTS idx_stripe_customers_stripe_id ON stripe_customers(stripe_customer_id);

-- Subscriptions indexes
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_id ON subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_period_end ON subscriptions(current_period_end) WHERE status = 'active';

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to initialize credits for a new user
CREATE OR REPLACE FUNCTION initialize_user_credits(p_user_id UUID, p_initial_credits INTEGER DEFAULT 0)
RETURNS UUID AS $$
DECLARE
    v_credit_id UUID;
BEGIN
    INSERT INTO credits (user_id, credits_available)
    VALUES (p_user_id, p_initial_credits)
    ON CONFLICT (user_id) DO NOTHING
    RETURNING id INTO v_credit_id;

    RETURN v_credit_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get user credit balance
CREATE OR REPLACE FUNCTION get_user_credits(p_user_id UUID)
RETURNS TABLE (
    credits_available INTEGER,
    credits_used INTEGER,
    subscription_type VARCHAR(50),
    subscription_status VARCHAR(50),
    subscription_credits_per_month INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.credits_available,
        c.credits_used,
        c.subscription_type,
        c.subscription_status,
        c.subscription_credits_per_month
    FROM credits c
    WHERE c.user_id = p_user_id;

    -- If no record exists, return default values
    IF NOT FOUND THEN
        RETURN QUERY SELECT 0, 0, 'none'::VARCHAR(50), 'inactive'::VARCHAR(50), 0;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to consume credits (with transaction safety)
CREATE OR REPLACE FUNCTION consume_credits(
    p_user_id UUID,
    p_credits_to_consume INTEGER,
    p_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS TABLE (
    success BOOLEAN,
    credits_before INTEGER,
    credits_after INTEGER,
    transaction_id UUID
) AS $$
DECLARE
    v_credits_before INTEGER;
    v_credits_after INTEGER;
    v_transaction_id UUID;
BEGIN
    -- Lock the row to prevent race conditions
    SELECT credits_available INTO v_credits_before
    FROM credits
    WHERE user_id = p_user_id
    FOR UPDATE;

    -- Check if user has enough credits
    IF v_credits_before IS NULL THEN
        RAISE EXCEPTION 'User credits not found';
    END IF;

    IF v_credits_before < p_credits_to_consume THEN
        RAISE EXCEPTION 'Insufficient credits';
    END IF;

    v_credits_after := v_credits_before - p_credits_to_consume;

    -- Update credits
    UPDATE credits
    SET credits_available = v_credits_after,
        credits_used = credits_used + p_credits_to_consume,
        updated_at = CURRENT_TIMESTAMP
    WHERE user_id = p_user_id;

    -- Record transaction
    INSERT INTO credit_transactions (
        user_id,
        transaction_type,
        credits_change,
        credits_before,
        credits_after,
        payment_status,
        metadata
    )
    VALUES (
        p_user_id,
        'consumption',
        -p_credits_to_consume,
        v_credits_before,
        v_credits_after,
        'completed',
        p_metadata
    )
    RETURNING id INTO v_transaction_id;

    RETURN QUERY SELECT true, v_credits_before, v_credits_after, v_transaction_id;
END;
$$ LANGUAGE plpgsql;

-- Function to add credits (purchase, admin adjustment, etc.)
CREATE OR REPLACE FUNCTION add_credits(
    p_user_id UUID,
    p_credits_to_add INTEGER,
    p_transaction_type VARCHAR(50),
    p_amount_usd DECIMAL(10, 2) DEFAULT NULL,
    p_payment_method VARCHAR(50) DEFAULT NULL,
    p_payment_id VARCHAR(255) DEFAULT NULL,
    p_package_id UUID DEFAULT NULL,
    p_reason TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS TABLE (
    success BOOLEAN,
    credits_before INTEGER,
    credits_after INTEGER,
    transaction_id UUID
) AS $$
DECLARE
    v_credits_before INTEGER;
    v_credits_after INTEGER;
    v_transaction_id UUID;
BEGIN
    -- Lock the row
    SELECT credits_available INTO v_credits_before
    FROM credits
    WHERE user_id = p_user_id
    FOR UPDATE;

    IF v_credits_before IS NULL THEN
        -- Initialize if doesn't exist
        PERFORM initialize_user_credits(p_user_id, 0);
        v_credits_before := 0;
    END IF;

    v_credits_after := v_credits_before + p_credits_to_add;

    -- Update credits
    UPDATE credits
    SET credits_available = v_credits_after,
        updated_at = CURRENT_TIMESTAMP
    WHERE user_id = p_user_id;

    -- Record transaction
    INSERT INTO credit_transactions (
        user_id,
        transaction_type,
        credits_change,
        credits_before,
        credits_after,
        amount_usd,
        payment_method,
        payment_id,
        payment_status,
        package_id,
        reason,
        metadata
    )
    VALUES (
        p_user_id,
        p_transaction_type,
        p_credits_to_add,
        v_credits_before,
        v_credits_after,
        p_amount_usd,
        p_payment_method,
        p_payment_id,
        'completed',
        p_package_id,
        p_reason,
        p_metadata
    )
    RETURNING id INTO v_transaction_id;

    RETURN QUERY SELECT true, v_credits_before, v_credits_after, v_transaction_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get credit transaction history
CREATE OR REPLACE FUNCTION get_credit_transactions(
    p_user_id UUID,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    id UUID,
    transaction_type VARCHAR(50),
    credits_change INTEGER,
    credits_before INTEGER,
    credits_after INTEGER,
    amount_usd DECIMAL(10, 2),
    payment_method VARCHAR(50),
    payment_status VARCHAR(50),
    reason TEXT,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ct.id,
        ct.transaction_type,
        ct.credits_change,
        ct.credits_before,
        ct.credits_after,
        ct.amount_usd,
        ct.payment_method,
        ct.payment_status,
        ct.reason,
        ct.created_at
    FROM credit_transactions ct
    WHERE ct.user_id = p_user_id
    ORDER BY ct.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

-- Function to get credit statistics
CREATE OR REPLACE FUNCTION get_credit_statistics(
    p_user_id UUID,
    p_start_date TIMESTAMPTZ DEFAULT NULL,
    p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
    total_purchased INTEGER,
    total_consumed INTEGER,
    total_refunded INTEGER,
    total_spent DECIMAL(10, 2),
    transaction_count BIGINT,
    avg_credits_per_purchase DECIMAL(10, 2)
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COALESCE(SUM(credits_change) FILTER (WHERE transaction_type IN ('purchase', 'subscription_renewal', 'bonus')), 0)::INTEGER as total_purchased,
        COALESCE(ABS(SUM(credits_change) FILTER (WHERE transaction_type = 'consumption')), 0)::INTEGER as total_consumed,
        COALESCE(SUM(credits_change) FILTER (WHERE transaction_type = 'refund'), 0)::INTEGER as total_refunded,
        COALESCE(SUM(amount_usd) FILTER (WHERE transaction_type = 'purchase'), 0)::DECIMAL(10, 2) as total_spent,
        COUNT(*)::BIGINT as transaction_count,
        COALESCE(AVG(credits_change) FILTER (WHERE transaction_type = 'purchase'), 0)::DECIMAL(10, 2) as avg_credits_per_purchase
    FROM credit_transactions
    WHERE user_id = p_user_id
        AND (p_start_date IS NULL OR created_at >= p_start_date)
        AND (p_end_date IS NULL OR created_at <= p_end_date);
END;
$$ LANGUAGE plpgsql;

-- Function to cleanup old payment intents
CREATE OR REPLACE FUNCTION cleanup_old_payment_intents(p_days_old INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
    v_deleted_count INTEGER;
BEGIN
    DELETE FROM payment_intents
    WHERE created_at < CURRENT_TIMESTAMP - (p_days_old || ' days')::INTERVAL
        AND status IN ('cancelled', 'failed');

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Trigger to update updated_at on credits table
CREATE OR REPLACE FUNCTION update_credits_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_credits_updated_at
    BEFORE UPDATE ON credits
    FOR EACH ROW
    EXECUTE FUNCTION update_credits_updated_at();

-- Trigger to update updated_at on subscriptions table
CREATE TRIGGER trigger_update_subscriptions_updated_at
    BEFORE UPDATE ON subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_credits_updated_at();

-- Trigger to update updated_at on payment_intents table
CREATE TRIGGER trigger_update_payment_intents_updated_at
    BEFORE UPDATE ON payment_intents
    FOR EACH ROW
    EXECUTE FUNCTION update_credits_updated_at();

-- ============================================================================
-- DEFAULT DATA
-- ============================================================================

-- Insert default credit packages
INSERT INTO credit_packages (name, credits, price_usd, price_per_credit, sort_order, description, package_type) VALUES
('Starter Pack', 2, 25.00, 12.50, 1, 'Perfect for testing - 2 pages', 'one_time'),
('Small Pack', 10, 125.00, 12.50, 2, 'Small projects - 10 pages', 'one_time'),
('Medium Pack', 20, 200.00, 10.00, 3, 'Medium projects - 20 pages', 'one_time'),
('Large Pack', 50, 375.00, 7.50, 4, 'Large projects - 50 pages', 'one_time'),
('Enterprise Pack', 100, 500.00, 5.00, 5, 'Best value - 100 pages', 'one_time'),
('Basic Monthly', 10, 99.00, 9.90, 10, 'Monthly subscription - 10 credits/month', 'subscription'),
('Pro Monthly', 50, 299.00, 5.98, 11, 'Monthly subscription - 50 credits/month', 'subscription'),
('Enterprise Monthly', 200, 799.00, 3.995, 12, 'Monthly subscription - 200 credits/month', 'subscription')
ON CONFLICT DO NOTHING;

-- Initialize credits for existing users (with 0 credits)
INSERT INTO credits (user_id, credits_available)
SELECT id, 0
FROM users
WHERE id NOT IN (SELECT user_id FROM credits)
ON CONFLICT (user_id) DO NOTHING;
