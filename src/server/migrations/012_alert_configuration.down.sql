-- Rollback: Alert Configuration System
-- Description: Removes alert configuration functionality

-- Drop views
DROP VIEW IF EXISTS vw_active_alerts CASCADE;
DROP VIEW IF EXISTS vw_alert_statistics CASCADE;

-- Drop functions
DROP FUNCTION IF EXISTS create_alert_rule(TEXT, TEXT, JSONB, TEXT, INTEGER, BOOLEAN, UUID) CASCADE;
DROP FUNCTION IF EXISTS update_alert_rule(UUID, TEXT, TEXT, JSONB, TEXT, INTEGER, BOOLEAN) CASCADE;
DROP FUNCTION IF EXISTS delete_alert_rule(UUID) CASCADE;
DROP FUNCTION IF EXISTS trigger_alert(UUID, JSONB) CASCADE;
DROP FUNCTION IF EXISTS acknowledge_alert(UUID, UUID, TEXT) CASCADE;
DROP FUNCTION IF EXISTS resolve_alert(UUID, UUID, TEXT) CASCADE;
DROP FUNCTION IF EXISTS get_active_alerts(INTEGER, INTEGER) CASCADE;
DROP FUNCTION IF EXISTS get_alert_history(UUID, TIMESTAMPTZ, TIMESTAMPTZ) CASCADE;
DROP FUNCTION IF EXISTS cleanup_old_alerts(INTEGER) CASCADE;
DROP FUNCTION IF EXISTS get_alert_statistics(TIMESTAMPTZ, TIMESTAMPTZ) CASCADE;

-- Drop indexes
DROP INDEX IF EXISTS idx_alert_history_alert_rule_id;
DROP INDEX IF EXISTS idx_alert_history_status;
DROP INDEX IF EXISTS idx_alert_history_severity;
DROP INDEX IF EXISTS idx_alert_history_triggered_at;
DROP INDEX IF EXISTS idx_alert_history_acknowledged_at;
DROP INDEX IF EXISTS idx_alert_history_resolved_at;
DROP INDEX IF EXISTS idx_alert_rules_is_active;
DROP INDEX IF EXISTS idx_alert_rules_severity;
DROP INDEX IF EXISTS idx_alert_rules_created_at;

-- Drop tables
DROP TABLE IF EXISTS alert_history CASCADE;
DROP TABLE IF EXISTS alert_rules CASCADE;
