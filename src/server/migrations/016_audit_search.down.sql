-- Rollback: Audit Log Search and Filtering
-- Description: Removes audit search functionality

-- Drop views
DROP VIEW IF EXISTS vw_audit_log_timeline CASCADE;
DROP VIEW IF EXISTS vw_audit_statistics CASCADE;
DROP VIEW IF EXISTS vw_suspicious_activities CASCADE;

-- Drop functions
DROP FUNCTION IF EXISTS search_audit_logs(TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, JSONB, INTEGER, INTEGER, INTEGER, INTEGER) CASCADE;
DROP FUNCTION IF EXISTS get_audit_log_statistics(TIMESTAMPTZ, TIMESTAMPTZ) CASCADE;
DROP FUNCTION IF EXISTS get_suspicious_activities(INTEGER, INTEGER) CASCADE;
DROP FUNCTION IF EXISTS get_user_audit_timeline(UUID, TIMESTAMPTZ, TIMESTAMPTZ) CASCADE;
DROP FUNCTION IF EXISTS export_audit_logs_csv(UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ) CASCADE;
DROP FUNCTION IF EXISTS export_audit_logs_json(UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ) CASCADE;
DROP FUNCTION IF EXISTS get_export_status(UUID) CASCADE;
DROP FUNCTION IF EXISTS cleanup_expired_exports() CASCADE;

-- Drop indexes
DROP INDEX IF EXISTS idx_audit_log_bookmarks_user_id;
DROP INDEX IF EXISTS idx_audit_log_bookmarks_audit_log_id;
DROP INDEX IF EXISTS idx_audit_log_bookmarks_created_at;
DROP INDEX IF EXISTS idx_audit_log_saved_searches_created_by;
DROP INDEX IF EXISTS idx_audit_log_saved_searches_is_public;
DROP INDEX IF EXISTS idx_audit_log_saved_searches_created_at;
DROP INDEX IF EXISTS idx_audit_log_exports_user_id;
DROP INDEX IF EXISTS idx_audit_log_exports_status;
DROP INDEX IF EXISTS idx_audit_log_exports_created_at;
DROP INDEX IF EXISTS idx_audit_log_exports_expires_at;
DROP INDEX IF EXISTS idx_audit_log_fulltext;
DROP INDEX IF EXISTS idx_audit_log_details_gin;

-- Drop tables
DROP TABLE IF EXISTS audit_log_bookmarks CASCADE;
DROP TABLE IF EXISTS audit_log_saved_searches CASCADE;
DROP TABLE IF EXISTS audit_log_exports CASCADE;

-- Drop extensions
DROP EXTENSION IF EXISTS pg_trgm;
