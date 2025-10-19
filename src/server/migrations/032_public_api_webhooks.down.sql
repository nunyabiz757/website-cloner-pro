-- =====================================================================================
-- Rollback Migration: Phase 5 Feature 5 - Public API & Webhooks
-- =====================================================================================
-- This rollback script safely removes all Public API & Webhooks infrastructure
-- =====================================================================================

-- Drop triggers
DROP TRIGGER IF EXISTS api_scopes_update_timestamp ON api_scopes;
DROP TRIGGER IF EXISTS api_documentation_update_timestamp ON api_documentation;
DROP TRIGGER IF EXISTS webhooks_update_timestamp ON webhooks;
DROP TRIGGER IF EXISTS api_keys_update_timestamp ON api_keys;

-- Drop trigger function
DROP FUNCTION IF EXISTS update_api_timestamp();

-- Drop functions (in reverse dependency order)
DROP FUNCTION IF EXISTS update_quota_usage(UUID, UUID, VARCHAR, INTEGER, BIGINT);
DROP FUNCTION IF EXISTS get_api_key_statistics(UUID, TIMESTAMPTZ, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS log_api_request(UUID, UUID, VARCHAR, VARCHAR, INTEGER, INTEGER, VARCHAR, BOOLEAN);
DROP FUNCTION IF EXISTS get_pending_webhook_deliveries(INTEGER);
DROP FUNCTION IF EXISTS update_webhook_stats(UUID, BOOLEAN);
DROP FUNCTION IF EXISTS create_webhook_delivery(UUID, VARCHAR, UUID, JSONB);
DROP FUNCTION IF EXISTS check_rate_limit(UUID, VARCHAR);
DROP FUNCTION IF EXISTS update_api_key_usage(UUID, VARCHAR);

-- Drop tables (in reverse dependency order)
DROP TABLE IF EXISTS api_quota_usage;
DROP TABLE IF EXISTS api_scopes;
DROP TABLE IF EXISTS api_documentation;
DROP TABLE IF EXISTS webhook_events;
DROP TABLE IF EXISTS webhook_deliveries;
DROP TABLE IF EXISTS webhooks;
DROP TABLE IF EXISTS api_rate_limits;
DROP TABLE IF EXISTS api_usage_logs;
DROP TABLE IF EXISTS api_keys;

-- =====================================================================================
-- END OF ROLLBACK
-- =====================================================================================
