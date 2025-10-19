-- Rollback: Role Hierarchy System
-- Description: Removes role hierarchy functionality

-- Drop views
DROP VIEW IF EXISTS vw_role_permissions_flattened CASCADE;
DROP VIEW IF EXISTS vw_user_effective_permissions CASCADE;

-- Drop functions
DROP FUNCTION IF EXISTS get_role_hierarchy(UUID, INTEGER) CASCADE;
DROP FUNCTION IF EXISTS get_user_effective_permissions(UUID) CASCADE;
DROP FUNCTION IF EXISTS has_permission(UUID, TEXT) CASCADE;
DROP FUNCTION IF EXISTS assign_permission_to_role(UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS revoke_permission_from_role(UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS check_role_cycle(UUID, UUID, INTEGER) CASCADE;
DROP FUNCTION IF EXISTS get_role_descendants(UUID, INTEGER) CASCADE;
DROP FUNCTION IF EXISTS get_role_ancestors(UUID, INTEGER) CASCADE;

-- Drop indexes
DROP INDEX IF EXISTS idx_role_permissions_role_id;
DROP INDEX IF EXISTS idx_role_permissions_permission_id;
DROP INDEX IF EXISTS idx_role_hierarchy_parent_id;
DROP INDEX IF EXISTS idx_role_hierarchy_child_id;
DROP INDEX IF EXISTS idx_permissions_resource_action;
DROP INDEX IF EXISTS idx_permissions_code;

-- Drop tables
DROP TABLE IF EXISTS role_permissions CASCADE;
DROP TABLE IF EXISTS role_hierarchy CASCADE;
DROP TABLE IF EXISTS permissions CASCADE;

-- Restore original roles table (if it was modified)
-- Note: This assumes the original table structure
-- Adjust based on actual schema changes made in the up migration
