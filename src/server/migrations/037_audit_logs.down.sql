-- Rollback Migration: 037_audit_logs
-- Description: Remove audit logging system
-- Author: System
-- Date: 2025-10-18

-- ============================================================================
-- DROP TRIGGERS
-- ============================================================================

DROP TRIGGER IF EXISTS audit_logs_statistics_trigger ON audit_logs;

-- ============================================================================
-- DROP FUNCTIONS
-- ============================================================================

DROP FUNCTION IF EXISTS trigger_update_audit_statistics();
DROP FUNCTION IF EXISTS update_audit_statistics(DATE);
DROP FUNCTION IF EXISTS archive_old_audit_logs();

-- ============================================================================
-- DROP VIEWS
-- ============================================================================

DROP VIEW IF EXISTS audit_logs_summary;

-- ============================================================================
-- DROP TABLES
-- ============================================================================

DROP TABLE IF EXISTS audit_statistics CASCADE;
DROP TABLE IF EXISTS audit_retention_policies CASCADE;
DROP TABLE IF EXISTS audit_logs CASCADE;

-- ============================================================================
-- REVOKE PERMISSIONS
-- ============================================================================

-- Permissions are automatically revoked when tables are dropped
