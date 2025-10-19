-- Migration Rollback: Multi-Page Crawl Conversion System
-- Version: 039
-- Description: Rollback all changes from 039_multi_page_crawl_conversion.sql

-- Drop views
DROP VIEW IF EXISTS builder_conversion_quality CASCADE;
DROP VIEW IF EXISTS session_conversion_stats CASCADE;
DROP VIEW IF EXISTS crawl_session_summary CASCADE;

-- Drop triggers
DROP TRIGGER IF EXISTS update_session_progress_on_page_update ON crawled_pages;
DROP TRIGGER IF EXISTS update_session_progress_on_page_insert ON crawled_pages;
DROP TRIGGER IF EXISTS update_crawl_pagination_updated_at ON crawl_pagination;
DROP TRIGGER IF EXISTS update_pb_conversions_updated_at ON page_builder_conversions;
DROP TRIGGER IF EXISTS update_crawled_pages_updated_at ON crawled_pages;
DROP TRIGGER IF EXISTS update_crawl_sessions_updated_at ON crawl_sessions;

-- Drop functions
DROP FUNCTION IF EXISTS archive_completed_crawl_sessions(INTEGER);
DROP FUNCTION IF EXISTS cleanup_old_crawl_sessions(INTEGER);
DROP FUNCTION IF EXISTS update_session_progress();
DROP FUNCTION IF EXISTS update_updated_at_column();

-- Drop tables
DROP TABLE IF EXISTS crawl_query_performance CASCADE;
DROP TABLE IF EXISTS archived_crawl_sessions CASCADE;
DROP TABLE IF EXISTS crawl_batch_metrics CASCADE;
DROP TABLE IF EXISTS crawl_pagination CASCADE;
DROP TABLE IF EXISTS page_builder_conversions CASCADE;
DROP TABLE IF EXISTS crawled_pages CASCADE;
DROP TABLE IF EXISTS crawl_sessions CASCADE;

-- Drop enum types
DROP TYPE IF EXISTS conversion_status_type CASCADE;
DROP TYPE IF EXISTS builder_type CASCADE;
DROP TYPE IF EXISTS crawl_status CASCADE;
