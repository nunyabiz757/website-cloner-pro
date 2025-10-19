-- Rollback migration for White-Label Marketplace

-- Drop triggers first
DROP TRIGGER IF EXISTS marketplace_settings_update_timestamp ON marketplace_settings;
DROP TRIGGER IF EXISTS seller_profiles_update_timestamp ON seller_profiles;
DROP TRIGGER IF EXISTS marketplace_template_listings_update_timestamp ON marketplace_template_listings;
DROP TRIGGER IF EXISTS marketplace_review_stats ON marketplace_reviews;
DROP TRIGGER IF EXISTS marketplace_transaction_seller_stats ON marketplace_transactions;

-- Drop trigger functions
DROP FUNCTION IF EXISTS update_marketplace_timestamp();
DROP FUNCTION IF EXISTS trigger_update_listing_stats();
DROP FUNCTION IF EXISTS trigger_update_seller_stats();

-- Drop functions
DROP FUNCTION IF EXISTS get_top_sellers(UUID, INTEGER);
DROP FUNCTION IF EXISTS get_marketplace_statistics(UUID, DATE, DATE);
DROP FUNCTION IF EXISTS calculate_seller_payout(UUID, DATE, DATE);
DROP FUNCTION IF EXISTS update_listing_stats(UUID);
DROP FUNCTION IF EXISTS update_seller_stats(UUID);

-- Drop tables in reverse dependency order
DROP TABLE IF EXISTS marketplace_analytics CASCADE;
DROP TABLE IF EXISTS marketplace_email_templates CASCADE;
DROP TABLE IF EXISTS marketplace_reviews CASCADE;
DROP TABLE IF EXISTS marketplace_template_listings CASCADE;
DROP TABLE IF EXISTS marketplace_categories CASCADE;
DROP TABLE IF EXISTS seller_payouts CASCADE;
DROP TABLE IF EXISTS marketplace_transactions CASCADE;
DROP TABLE IF EXISTS seller_profiles CASCADE;
DROP TABLE IF EXISTS marketplace_settings CASCADE;

-- Success message
DO $$
BEGIN
    RAISE NOTICE '✅ Rollback of 030_white_label_marketplace completed';
    RAISE NOTICE '   - All white-label marketplace tables, functions, and triggers removed';
END $$;
