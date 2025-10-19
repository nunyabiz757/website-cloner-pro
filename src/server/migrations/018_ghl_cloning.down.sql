-- Rollback: GHL Cloning System
-- Description: Removes GHL cloning tables and functions

-- Drop triggers
DROP TRIGGER IF EXISTS trigger_set_default_clone_expiration ON ghl_cloned_pages;
DROP TRIGGER IF EXISTS trigger_update_ghl_clone_sessions_updated_at ON ghl_clone_sessions;
DROP TRIGGER IF EXISTS trigger_update_ghl_clone_templates_updated_at ON ghl_clone_templates;
DROP TRIGGER IF EXISTS trigger_update_ghl_page_assets_updated_at ON ghl_page_assets;
DROP TRIGGER IF EXISTS trigger_update_ghl_cloned_pages_updated_at ON ghl_cloned_pages;

-- Drop functions
DROP FUNCTION IF EXISTS set_default_clone_expiration() CASCADE;
DROP FUNCTION IF EXISTS update_ghl_updated_at() CASCADE;
DROP FUNCTION IF EXISTS get_user_clone_stats(UUID) CASCADE;
DROP FUNCTION IF EXISTS cleanup_expired_clone_sessions() CASCADE;
DROP FUNCTION IF EXISTS cleanup_expired_cloned_pages() CASCADE;
DROP FUNCTION IF EXISTS increment_template_use_count(UUID) CASCADE;
DROP FUNCTION IF EXISTS search_cloned_pages(UUID, TEXT, VARCHAR, TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, INTEGER) CASCADE;
DROP FUNCTION IF EXISTS get_popular_cloned_urls(INTEGER) CASCADE;
DROP FUNCTION IF EXISTS get_ghl_detection_statistics(INTEGER) CASCADE;

-- Drop indexes
DROP INDEX IF EXISTS idx_ghl_clone_sessions_cloned_page_id;
DROP INDEX IF EXISTS idx_ghl_clone_sessions_expires_at;
DROP INDEX IF EXISTS idx_ghl_clone_sessions_status;
DROP INDEX IF EXISTS idx_ghl_clone_sessions_token;
DROP INDEX IF EXISTS idx_ghl_clone_sessions_user_id;
DROP INDEX IF EXISTS idx_ghl_clone_templates_name_trgm;
DROP INDEX IF EXISTS idx_ghl_clone_templates_tags;
DROP INDEX IF EXISTS idx_ghl_clone_templates_category;
DROP INDEX IF EXISTS idx_ghl_clone_templates_public;
DROP INDEX IF EXISTS idx_ghl_clone_templates_user_id;
DROP INDEX IF EXISTS idx_ghl_detection_log_user_id;
DROP INDEX IF EXISTS idx_ghl_detection_log_detected_at;
DROP INDEX IF EXISTS idx_ghl_detection_log_is_ghl;
DROP INDEX IF EXISTS idx_ghl_detection_log_domain;
DROP INDEX IF EXISTS idx_ghl_detection_log_url;
DROP INDEX IF EXISTS idx_ghl_page_assets_download_status;
DROP INDEX IF EXISTS idx_ghl_page_assets_asset_type;
DROP INDEX IF EXISTS idx_ghl_page_assets_cloned_page_id;
DROP INDEX IF EXISTS idx_ghl_cloned_pages_source_title_trgm;
DROP INDEX IF EXISTS idx_ghl_cloned_pages_source_url_trgm;
DROP INDEX IF EXISTS idx_ghl_cloned_pages_user_created;
DROP INDEX IF EXISTS idx_ghl_cloned_pages_expires_at;
DROP INDEX IF EXISTS idx_ghl_cloned_pages_copied_at;
DROP INDEX IF EXISTS idx_ghl_cloned_pages_created_at;
DROP INDEX IF EXISTS idx_ghl_cloned_pages_source_domain;
DROP INDEX IF EXISTS idx_ghl_cloned_pages_status;
DROP INDEX IF EXISTS idx_ghl_cloned_pages_user_id;

-- Drop tables
DROP TABLE IF EXISTS ghl_clone_sessions CASCADE;
DROP TABLE IF EXISTS ghl_clone_templates CASCADE;
DROP TABLE IF EXISTS ghl_detection_log CASCADE;
DROP TABLE IF EXISTS ghl_page_assets CASCADE;
DROP TABLE IF EXISTS ghl_cloned_pages CASCADE;
