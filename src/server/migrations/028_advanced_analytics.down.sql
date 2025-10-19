-- Rollback migration for Advanced Analytics

-- Drop triggers first
DROP TRIGGER IF EXISTS analytics_event_behavior_update ON analytics_events;
DROP TRIGGER IF EXISTS custom_dashboards_update_timestamp ON custom_dashboards;
DROP TRIGGER IF EXISTS report_schedules_update_timestamp ON report_schedules;

-- Drop trigger functions
DROP FUNCTION IF EXISTS update_user_behavior_on_event();
DROP FUNCTION IF EXISTS update_dashboard_timestamp();

-- Drop functions
DROP FUNCTION IF EXISTS aggregate_daily_template_analytics(DATE);
DROP FUNCTION IF EXISTS calculate_ab_test_significance(UUID);
DROP FUNCTION IF EXISTS get_user_engagement_metrics(UUID, TIMESTAMPTZ, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS get_template_performance_comparison(UUID[], DATE, DATE);
DROP FUNCTION IF EXISTS get_funnel_conversion_rates(UUID, TIMESTAMPTZ, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS track_analytics_event(UUID, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, DECIMAL, UUID, JSONB);

-- Drop tables in reverse dependency order
DROP TABLE IF EXISTS report_history CASCADE;
DROP TABLE IF EXISTS report_schedules CASCADE;
DROP TABLE IF EXISTS custom_dashboards CASCADE;
DROP TABLE IF EXISTS ab_test_results CASCADE;
DROP TABLE IF EXISTS ab_test_experiments CASCADE;
DROP TABLE IF EXISTS template_analytics_extended CASCADE;
DROP TABLE IF EXISTS funnel_step_events CASCADE;
DROP TABLE IF EXISTS funnel_analysis CASCADE;
DROP TABLE IF EXISTS user_behavior_tracking CASCADE;
DROP TABLE IF EXISTS analytics_events CASCADE;

-- Success message
DO $$
BEGIN
    RAISE NOTICE '✅ Rollback of 028_advanced_analytics completed';
    RAISE NOTICE '   - All advanced analytics tables, functions, and triggers removed';
END $$;
