-- Rollback: Key Rotation Support
-- Description: Removes key rotation functionality

-- Drop views
DROP VIEW IF EXISTS vw_active_keys CASCADE;
DROP VIEW IF EXISTS vw_rotation_status CASCADE;

-- Drop functions
DROP FUNCTION IF EXISTS get_active_key_version() CASCADE;
DROP FUNCTION IF EXISTS start_key_rotation(TEXT, UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS complete_key_rotation(UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS fail_key_rotation(UUID, TEXT) CASCADE;
DROP FUNCTION IF EXISTS queue_for_re_encryption(TEXT, TEXT, UUID) CASCADE;
DROP FUNCTION IF EXISTS get_next_re_encryption_batch(INTEGER) CASCADE;
DROP FUNCTION IF EXISTS mark_re_encrypted(UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS get_rotation_progress(UUID) CASCADE;
DROP FUNCTION IF EXISTS get_key_usage_stats(UUID, TIMESTAMPTZ, TIMESTAMPTZ) CASCADE;
DROP FUNCTION IF EXISTS get_due_rotations() CASCADE;
DROP FUNCTION IF EXISTS record_key_usage(UUID, TEXT) CASCADE;
DROP FUNCTION IF EXISTS get_key_hierarchy(UUID, INTEGER) CASCADE;
DROP FUNCTION IF EXISTS has_rotation_cycle(UUID, UUID, INTEGER) CASCADE;
DROP FUNCTION IF EXISTS cleanup_old_rotation_history(INTEGER) CASCADE;

-- Drop indexes
DROP INDEX IF EXISTS idx_key_usage_metrics_key_version_id;
DROP INDEX IF EXISTS idx_key_usage_metrics_recorded_at;
DROP INDEX IF EXISTS idx_re_encryption_queue_status;
DROP INDEX IF EXISTS idx_re_encryption_queue_rotation_id;
DROP INDEX IF EXISTS idx_re_encryption_queue_created_at;
DROP INDEX IF EXISTS idx_key_rotation_schedule_next_rotation;
DROP INDEX IF EXISTS idx_key_rotation_schedule_is_active;
DROP INDEX IF EXISTS idx_key_rotation_history_rotation_id;
DROP INDEX IF EXISTS idx_key_rotation_history_started_at;
DROP INDEX IF EXISTS idx_key_rotation_history_completed_at;
DROP INDEX IF EXISTS idx_key_rotation_history_old_key;
DROP INDEX IF EXISTS idx_key_rotation_history_new_key;
DROP INDEX IF EXISTS idx_encryption_keys_status;
DROP INDEX IF EXISTS idx_encryption_keys_is_active;
DROP INDEX IF EXISTS idx_encryption_keys_created_at;
DROP INDEX IF EXISTS idx_encryption_keys_expires_at;
DROP INDEX IF EXISTS idx_encryption_keys_rotated_at;

-- Drop tables
DROP TABLE IF EXISTS key_usage_metrics CASCADE;
DROP TABLE IF EXISTS re_encryption_queue CASCADE;
DROP TABLE IF EXISTS key_rotation_schedule CASCADE;
DROP TABLE IF EXISTS key_rotation_history CASCADE;
DROP TABLE IF EXISTS encryption_keys CASCADE;
