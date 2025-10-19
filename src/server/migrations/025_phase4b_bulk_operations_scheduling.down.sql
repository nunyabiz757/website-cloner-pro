-- =====================================================================================
-- Phase 4B Rollback: Bulk Operations, Export/Import, and Scheduling
-- =====================================================================================
-- This migration rolls back all Phase 4B changes
-- =====================================================================================

-- Drop triggers first
DROP TRIGGER IF EXISTS trigger_scheduled_operations_timestamp ON scheduled_operations;
DROP TRIGGER IF EXISTS trigger_template_import_timestamp ON template_import_jobs;
DROP TRIGGER IF EXISTS trigger_template_export_timestamp ON template_export_packages;
DROP TRIGGER IF EXISTS trigger_bulk_operations_timestamp ON bulk_operations;
DROP TRIGGER IF EXISTS trigger_update_bulk_operation_progress ON bulk_operation_items;

-- Drop functions
DROP FUNCTION IF EXISTS cleanup_expired_exports();
DROP FUNCTION IF EXISTS get_due_scheduled_operations();
DROP FUNCTION IF EXISTS get_pending_bulk_operations();
DROP FUNCTION IF EXISTS calculate_next_run_time(UUID, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS update_bulk_operation_progress();
DROP FUNCTION IF EXISTS update_phase4b_timestamp();

-- Drop tables in reverse order of dependencies
DROP TABLE IF EXISTS scheduled_operation_runs CASCADE;
DROP TABLE IF EXISTS scheduled_operations CASCADE;
DROP TABLE IF EXISTS template_import_jobs CASCADE;
DROP TABLE IF EXISTS template_export_packages CASCADE;
DROP TABLE IF EXISTS bulk_operation_items CASCADE;
DROP TABLE IF EXISTS bulk_operations CASCADE;
