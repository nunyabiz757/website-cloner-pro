-- Rollback Migration: Stripe Integration Enhancements
-- Created: 2025-10-17

-- Drop updated functions
DROP FUNCTION IF EXISTS get_credit_transactions(UUID, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS add_credits(UUID, INTEGER, VARCHAR, DECIMAL, VARCHAR, VARCHAR, VARCHAR, TEXT, JSONB);

-- Remove columns from credit_transactions
ALTER TABLE credit_transactions
  DROP COLUMN IF EXISTS stripe_payment_intent_id,
  DROP COLUMN IF EXISTS stripe_subscription_id,
  DROP COLUMN IF EXISTS reference_type,
  DROP COLUMN IF EXISTS reference_id,
  DROP COLUMN IF EXISTS description;

-- Remove columns from payment_intents
ALTER TABLE payment_intents
  DROP COLUMN IF EXISTS completed_at,
  DROP COLUMN IF EXISTS failure_reason,
  DROP COLUMN IF EXISTS amount_usd;

-- Remove columns from credit_packages
ALTER TABLE credit_packages
  DROP COLUMN IF EXISTS stripe_price_id,
  DROP COLUMN IF EXISTS features;

-- Remove columns from credits
ALTER TABLE credits
  DROP COLUMN IF EXISTS next_refresh_date,
  DROP COLUMN IF EXISTS last_refresh_date,
  DROP COLUMN IF EXISTS subscription_start_date_old,
  DROP COLUMN IF EXISTS subscription_end_date_old,
  DROP COLUMN IF EXISTS last_credit_refresh_old;

-- Drop indexes
DROP INDEX IF EXISTS idx_webhook_events_event_id;
DROP INDEX IF EXISTS idx_webhook_events_type;
DROP INDEX IF EXISTS idx_webhook_events_created;
DROP INDEX IF EXISTS idx_credit_packages_stripe_price;

-- Recreate original add_credits function
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
    SELECT credits_available INTO v_credits_before
    FROM credits
    WHERE user_id = p_user_id
    FOR UPDATE;

    IF v_credits_before IS NULL THEN
        PERFORM initialize_user_credits(p_user_id, 0);
        v_credits_before := 0;
    END IF;

    v_credits_after := v_credits_before + p_credits_to_add;

    UPDATE credits
    SET credits_available = v_credits_after,
        updated_at = CURRENT_TIMESTAMP
    WHERE user_id = p_user_id;

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

-- Recreate original get_credit_transactions function
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
