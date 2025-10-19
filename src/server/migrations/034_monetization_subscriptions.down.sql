-- =====================================================================================
-- Rollback Migration: Phase 5 Feature 6 - Monetization & Subscriptions
-- =====================================================================================
-- This rollback script safely removes all Monetization & Subscriptions infrastructure
-- =====================================================================================

-- Drop triggers
DROP TRIGGER IF EXISTS payments_update_timestamp ON payments;
DROP TRIGGER IF EXISTS payment_methods_update_timestamp ON payment_methods;
DROP TRIGGER IF EXISTS invoices_update_timestamp ON invoices;
DROP TRIGGER IF EXISTS subscriptions_update_timestamp ON subscriptions;
DROP TRIGGER IF EXISTS subscription_plans_update_timestamp ON subscription_plans;

-- Drop trigger function
DROP FUNCTION IF EXISTS update_subscription_timestamp();

-- Drop functions (in reverse dependency order)
DROP FUNCTION IF EXISTS calculate_proration(UUID, DECIMAL);
DROP FUNCTION IF EXISTS generate_invoice_number();
DROP FUNCTION IF EXISTS update_usage(UUID, VARCHAR, INTEGER);
DROP FUNCTION IF EXISTS check_usage_limit(UUID, VARCHAR, INTEGER);
DROP FUNCTION IF EXISTS get_active_subscription(UUID);

-- Drop tables (in reverse dependency order)
DROP TABLE IF EXISTS promo_code_redemptions;
DROP TABLE IF EXISTS promo_codes;
DROP TABLE IF EXISTS dunning_attempts;
DROP TABLE IF EXISTS subscription_changes;
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS payment_methods;
DROP TABLE IF EXISTS invoices;
DROP TABLE IF EXISTS subscription_usage;
DROP TABLE IF EXISTS subscriptions;
DROP TABLE IF EXISTS subscription_plans;

-- =====================================================================================
-- END OF ROLLBACK
-- =====================================================================================
