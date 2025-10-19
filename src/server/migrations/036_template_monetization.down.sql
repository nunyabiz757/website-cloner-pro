-- =====================================================================================
-- Rollback Migration: Template Monetization
-- =====================================================================================
-- This rollback script safely removes all Template Monetization infrastructure
-- =====================================================================================

-- Drop triggers
DROP TRIGGER IF EXISTS affiliate_links_update_timestamp ON affiliate_links;
DROP TRIGGER IF EXISTS creator_payouts_update_timestamp ON creator_payouts;
DROP TRIGGER IF EXISTS creator_earnings_update_timestamp ON creator_earnings;
DROP TRIGGER IF EXISTS template_purchases_update_timestamp ON template_purchases;
DROP TRIGGER IF EXISTS template_pricing_update_timestamp ON template_pricing;

-- Drop trigger function
DROP FUNCTION IF EXISTS update_monetization_timestamp();

-- Drop functions (in reverse dependency order)
DROP FUNCTION IF EXISTS request_payout(UUID, DECIMAL, VARCHAR);
DROP FUNCTION IF EXISTS get_creator_stats(UUID);
DROP FUNCTION IF EXISTS track_affiliate_click(VARCHAR, VARCHAR, TEXT, TEXT);
DROP FUNCTION IF EXISTS process_template_purchase(UUID, UUID, UUID);

-- Drop tables (in reverse dependency order)
DROP TABLE IF EXISTS revenue_analytics;
DROP TABLE IF EXISTS affiliate_commissions;
DROP TABLE IF EXISTS affiliate_clicks;
DROP TABLE IF EXISTS affiliate_links;
DROP TABLE IF EXISTS creator_payouts;
DROP TABLE IF EXISTS creator_earnings;
DROP TABLE IF EXISTS template_purchases;
DROP TABLE IF EXISTS template_pricing;

-- =====================================================================================
-- END OF ROLLBACK
-- =====================================================================================
