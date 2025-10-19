-- Rollback: Credit Management System
-- Description: Removes credit system tables and functions

-- Drop triggers
DROP TRIGGER IF EXISTS trigger_update_credits_updated_at ON credits;
DROP TRIGGER IF EXISTS trigger_update_subscriptions_updated_at ON subscriptions;
DROP TRIGGER IF EXISTS trigger_update_payment_intents_updated_at ON payment_intents;

-- Drop functions
DROP FUNCTION IF EXISTS update_credits_updated_at() CASCADE;
DROP FUNCTION IF EXISTS initialize_user_credits(UUID, INTEGER) CASCADE;
DROP FUNCTION IF EXISTS get_user_credits(UUID) CASCADE;
DROP FUNCTION IF EXISTS consume_credits(UUID, INTEGER, JSONB) CASCADE;
DROP FUNCTION IF EXISTS add_credits(UUID, INTEGER, VARCHAR, DECIMAL, VARCHAR, VARCHAR, UUID, TEXT, JSONB) CASCADE;
DROP FUNCTION IF EXISTS get_credit_transactions(UUID, INTEGER, INTEGER) CASCADE;
DROP FUNCTION IF EXISTS get_credit_statistics(UUID, TIMESTAMPTZ, TIMESTAMPTZ) CASCADE;
DROP FUNCTION IF EXISTS cleanup_old_payment_intents(INTEGER) CASCADE;

-- Drop indexes (in reverse order)
DROP INDEX IF EXISTS idx_subscriptions_period_end;
DROP INDEX IF EXISTS idx_subscriptions_status;
DROP INDEX IF EXISTS idx_subscriptions_stripe_id;
DROP INDEX IF EXISTS idx_subscriptions_user_id;
DROP INDEX IF EXISTS idx_stripe_customers_stripe_id;
DROP INDEX IF EXISTS idx_stripe_customers_user_id;
DROP INDEX IF EXISTS idx_payment_intents_status;
DROP INDEX IF EXISTS idx_payment_intents_stripe_id;
DROP INDEX IF EXISTS idx_payment_intents_user_id;
DROP INDEX IF EXISTS idx_credit_transactions_user_created;
DROP INDEX IF EXISTS idx_credit_transactions_created_at;
DROP INDEX IF EXISTS idx_credit_transactions_type;
DROP INDEX IF EXISTS idx_credit_transactions_user_id;
DROP INDEX IF EXISTS idx_credit_packages_type;
DROP INDEX IF EXISTS idx_credit_packages_active;
DROP INDEX IF EXISTS idx_credits_subscription_status;
DROP INDEX IF EXISTS idx_credits_user_id;

-- Drop tables (in reverse order of dependencies)
DROP TABLE IF EXISTS subscriptions CASCADE;
DROP TABLE IF EXISTS stripe_customers CASCADE;
DROP TABLE IF EXISTS payment_intents CASCADE;
DROP TABLE IF EXISTS credit_transactions CASCADE;
DROP TABLE IF EXISTS credit_packages CASCADE;
DROP TABLE IF EXISTS credits CASCADE;
