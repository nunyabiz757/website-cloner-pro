-- Rollback migration for Phase 4A - Versioning & Analytics
-- This will completely remove all versioning and analytics features

-- Drop triggers first
DROP TRIGGER IF EXISTS template_auto_version ON ghl_clone_templates;

-- Drop trigger functions
DROP FUNCTION IF EXISTS trigger_create_version_on_update();

-- Drop functions
DROP FUNCTION IF EXISTS get_analytics_summary(UUID, DATE, DATE);
DROP FUNCTION IF EXISTS update_template_performance_metrics(UUID, DATE);
DROP FUNCTION IF EXISTS calculate_engagement_score(INTEGER, INTEGER, INTEGER, INTEGER, DECIMAL, INTEGER);
DROP FUNCTION IF EXISTS update_daily_analytics(DATE, UUID, VARCHAR, VARCHAR, INTEGER, JSONB);
DROP FUNCTION IF EXISTS log_user_activity(UUID, VARCHAR, VARCHAR, UUID, VARCHAR, VARCHAR, INET, TEXT, JSONB);
DROP FUNCTION IF EXISTS restore_template_version(UUID, INTEGER, UUID);
DROP FUNCTION IF EXISTS get_latest_version_number(UUID);
DROP FUNCTION IF EXISTS create_template_version(UUID, UUID, VARCHAR, TEXT);

-- Drop tables in reverse dependency order
DROP TABLE IF EXISTS user_engagement_metrics CASCADE;
DROP TABLE IF EXISTS template_performance_metrics CASCADE;
DROP TABLE IF EXISTS user_activity_log CASCADE;
DROP TABLE IF EXISTS analytics_daily_stats CASCADE;
DROP TABLE IF EXISTS template_version_comparisons CASCADE;
DROP TABLE IF EXISTS template_versions CASCADE;

-- Success message
DO $$
BEGIN
    RAISE NOTICE '✅ Rollback of 023_phase4a_versioning_analytics completed';
    RAISE NOTICE '   - All Phase 4A tables, functions, and triggers removed';
END $$;
