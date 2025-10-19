-- Rollback migration for Team Collaboration
-- This will completely remove all team collaboration features

-- Drop triggers first
DROP TRIGGER IF EXISTS team_member_removed ON team_members;
DROP TRIGGER IF EXISTS team_member_added ON team_members;
DROP TRIGGER IF EXISTS teams_update_timestamp ON teams;

-- Drop trigger functions
DROP FUNCTION IF EXISTS trigger_log_member_removed();
DROP FUNCTION IF EXISTS trigger_log_member_added();
DROP FUNCTION IF EXISTS update_team_timestamp();

-- Drop functions
DROP FUNCTION IF EXISTS get_team_statistics(UUID);
DROP FUNCTION IF EXISTS cleanup_expired_invitations();
DROP FUNCTION IF EXISTS log_team_activity(UUID, UUID, VARCHAR, VARCHAR, UUID, VARCHAR, JSONB, INET, TEXT);
DROP FUNCTION IF EXISTS check_team_member_limit(UUID);
DROP FUNCTION IF EXISTS get_user_team_role(UUID, UUID);
DROP FUNCTION IF EXISTS is_team_member(UUID, UUID);
DROP FUNCTION IF EXISTS get_team_template_count(UUID);
DROP FUNCTION IF EXISTS get_team_member_count(UUID);

-- Drop tables in reverse dependency order
DROP TABLE IF EXISTS team_activity_log CASCADE;
DROP TABLE IF EXISTS team_templates CASCADE;
DROP TABLE IF EXISTS team_invitations CASCADE;
DROP TABLE IF EXISTS team_members CASCADE;
DROP TABLE IF EXISTS teams CASCADE;

-- Success message
DO $$
BEGIN
    RAISE NOTICE '✅ Rollback of 025_team_collaboration completed';
    RAISE NOTICE '   - All team collaboration tables, functions, and triggers removed';
END $$;
