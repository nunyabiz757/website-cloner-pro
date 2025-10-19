-- Rollback: Resource Ownership Validation
-- Description: Removes resource ownership tracking

-- Drop views
DROP VIEW IF EXISTS vw_user_owned_resources CASCADE;
DROP VIEW IF EXISTS vw_shared_resources CASCADE;
DROP VIEW IF EXISTS vw_ownership_statistics CASCADE;

-- Drop functions
DROP FUNCTION IF EXISTS register_resource_ownership(UUID, TEXT, TEXT, JSONB) CASCADE;
DROP FUNCTION IF EXISTS verify_resource_ownership(UUID, TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS transfer_resource_ownership(TEXT, TEXT, UUID, UUID, TEXT) CASCADE;
DROP FUNCTION IF EXISTS share_resource_with_user(TEXT, TEXT, UUID, UUID, TEXT, TIMESTAMPTZ) CASCADE;
DROP FUNCTION IF EXISTS share_resource_with_role(TEXT, TEXT, UUID, TEXT, TEXT, TIMESTAMPTZ) CASCADE;
DROP FUNCTION IF EXISTS revoke_resource_share(UUID) CASCADE;
DROP FUNCTION IF EXISTS get_resource_owner(TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS get_user_owned_resources(UUID, TEXT, INTEGER, INTEGER) CASCADE;
DROP FUNCTION IF EXISTS get_shared_resources(UUID, TEXT, INTEGER, INTEGER) CASCADE;
DROP FUNCTION IF EXISTS get_ownership_history(TEXT, TEXT, INTEGER, INTEGER) CASCADE;
DROP FUNCTION IF EXISTS validate_ownership_chain(TEXT, TEXT, UUID, INTEGER) CASCADE;
DROP FUNCTION IF EXISTS cleanup_expired_shares() CASCADE;
DROP FUNCTION IF EXISTS get_ownership_statistics() CASCADE;

-- Drop indexes
DROP INDEX IF EXISTS idx_resource_ownership_history_resource;
DROP INDEX IF EXISTS idx_resource_ownership_history_from_user;
DROP INDEX IF EXISTS idx_resource_ownership_history_to_user;
DROP INDEX IF EXISTS idx_resource_ownership_history_created_at;
DROP INDEX IF EXISTS idx_resource_shares_shared_with_user;
DROP INDEX IF EXISTS idx_resource_shares_shared_with_role;
DROP INDEX IF EXISTS idx_resource_shares_ownership_id;
DROP INDEX IF EXISTS idx_resource_shares_expires_at;
DROP INDEX IF EXISTS idx_resource_shares_created_at;
DROP INDEX IF EXISTS idx_resource_ownership_resource;
DROP INDEX IF EXISTS idx_resource_ownership_owner_id;
DROP INDEX IF EXISTS idx_resource_ownership_created_at;

-- Drop tables
DROP TABLE IF EXISTS resource_ownership_history CASCADE;
DROP TABLE IF EXISTS resource_shares CASCADE;
DROP TABLE IF EXISTS resource_ownership CASCADE;
