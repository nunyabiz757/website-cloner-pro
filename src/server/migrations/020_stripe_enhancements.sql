-- Migration: Stripe Integration Enhancements
-- Created: 2025-10-17
-- Description: Add missing Stripe fields and indexes for credit packages

-- Add stripe_price_id and features to credit_packages
ALTER TABLE credit_packages
  ADD COLUMN IF NOT EXISTS stripe_price_id VARCHAR(255) UNIQUE,
  ADD COLUMN IF NOT EXISTS features TEXT[];

-- Add indexes for webhook events
CREATE INDEX IF NOT EXISTS idx_webhook_events_event_id ON stripe_webhook_events(event_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_type ON stripe_webhook_events(event_type);
CREATE INDEX IF NOT EXISTS idx_webhook_events_created ON stripe_webhook_events(created_at DESC);

-- Add index for stripe_price_id on credit_packages
CREATE INDEX IF NOT EXISTS idx_credit_packages_stripe_price ON credit_packages(stripe_price_id) WHERE stripe_price_id IS NOT NULL;

-- Add missing fields to payment_intents for better tracking
ALTER TABLE payment_intents
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failure_reason TEXT,
  ADD COLUMN IF NOT EXISTS amount_usd DECIMAL(10, 2);

-- Update existing payment_intents to use amount_usd
UPDATE payment_intents SET amount_usd = amount WHERE amount_usd IS NULL;

-- Update credit_transactions to support Stripe identifiers
ALTER TABLE credit_transactions
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS reference_type VARCHAR(100),
  ADD COLUMN IF NOT EXISTS reference_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS description TEXT;

-- Add credits table fields for next refresh tracking
ALTER TABLE credits
  ADD COLUMN IF NOT EXISTS next_refresh_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_refresh_date TIMESTAMPTZ;

-- Rename subscription_start_date to match new fields
ALTER TABLE credits RENAME COLUMN subscription_start_date TO subscription_start_date_old;
ALTER TABLE credits RENAME COLUMN subscription_end_date TO subscription_end_date_old;
ALTER TABLE credits RENAME COLUMN last_credit_refresh TO last_credit_refresh_old;

-- Update function signatures to match Stripe service expectations
CREATE OR REPLACE FUNCTION add_credits(
    p_user_id UUID,
    p_credits_to_add INTEGER,
    p_transaction_type VARCHAR(50),
    p_amount_usd DECIMAL(10, 2) DEFAULT NULL,
    p_stripe_payment_intent_id VARCHAR(255) DEFAULT NULL,
    p_stripe_subscription_id VARCHAR(255) DEFAULT NULL,
    p_reference_id VARCHAR(255) DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
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
        stripe_payment_intent_id,
        stripe_subscription_id,
        reference_id,
        description,
        payment_status,
        metadata
    )
    VALUES (
        p_user_id,
        p_transaction_type,
        p_credits_to_add,
        v_credits_before,
        v_credits_after,
        p_amount_usd,
        p_stripe_payment_intent_id,
        p_stripe_subscription_id,
        p_reference_id,
        p_description,
        'completed',
        p_metadata
    )
    RETURNING id INTO v_transaction_id;

    RETURN QUERY SELECT true, v_credits_before, v_credits_after, v_transaction_id;
END;
$$ LANGUAGE plpgsql;

-- Update credit transaction history function to include new fields
CREATE OR REPLACE FUNCTION get_credit_transactions(
    p_user_id UUID,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    id UUID,
    user_id UUID,
    transaction_type VARCHAR(50),
    credits_change INTEGER,
    credits_before INTEGER,
    credits_after INTEGER,
    description TEXT,
    reference_type VARCHAR(100),
    reference_id VARCHAR(255),
    amount_usd DECIMAL(10, 2),
    stripe_payment_intent_id VARCHAR(255),
    stripe_subscription_id VARCHAR(255),
    metadata JSONB,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ct.id,
        ct.user_id,
        ct.transaction_type,
        ct.credits_change,
        ct.credits_before,
        ct.credits_after,
        ct.description,
        ct.reference_type,
        ct.reference_id,
        ct.amount_usd,
        ct.stripe_payment_intent_id,
        ct.stripe_subscription_id,
        ct.metadata,
        ct.created_at
    FROM credit_transactions ct
    WHERE ct.user_id = p_user_id
    ORDER BY ct.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

-- Add comment explaining migration
COMMENT ON TABLE stripe_webhook_events IS 'Tracks processed Stripe webhook events for idempotency and debugging';
COMMENT ON COLUMN credit_packages.stripe_price_id IS 'Stripe Price ID for subscription packages';
COMMENT ON COLUMN credit_packages.features IS 'Array of feature descriptions for the package';
