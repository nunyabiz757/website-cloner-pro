-- Migration: Team Collaboration System
-- This adds multi-user team functionality with roles and permissions

-- ============================================================================
-- TEAMS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS teams (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    slug VARCHAR(200) UNIQUE NOT NULL,
    description TEXT,
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Plan and limits
    plan_type VARCHAR(50) DEFAULT 'free', -- 'free', 'team', 'enterprise'
    max_members INTEGER DEFAULT 5,
    max_templates INTEGER DEFAULT 50,
    max_storage_mb INTEGER DEFAULT 1000,

    -- Settings
    settings JSONB DEFAULT '{}'::JSONB,

    -- Metadata
    avatar_url TEXT,
    website_url TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- TEAM MEMBERS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS team_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Role and permissions
    role VARCHAR(50) DEFAULT 'member', -- 'owner', 'admin', 'editor', 'member', 'viewer'
    permissions JSONB DEFAULT '{}'::JSONB, -- Custom permissions override

    -- Status
    status VARCHAR(50) DEFAULT 'active', -- 'active', 'inactive', 'suspended'

    -- Metadata
    title VARCHAR(100), -- Job title within team
    joined_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_active_at TIMESTAMPTZ,

    UNIQUE(team_id, user_id)
);

-- ============================================================================
-- TEAM INVITATIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS team_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,

    -- Invitee info
    email VARCHAR(255) NOT NULL,
    role VARCHAR(50) DEFAULT 'member',

    -- Invitation details
    invited_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    invitation_token VARCHAR(255) UNIQUE NOT NULL,
    message TEXT,

    -- Status
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'accepted', 'declined', 'expired', 'cancelled'

    -- Expiration
    expires_at TIMESTAMPTZ NOT NULL,

    -- Tracking
    accepted_at TIMESTAMPTZ,
    declined_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(team_id, email, status)
);

-- ============================================================================
-- TEAM TEMPLATES TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS team_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    template_id UUID NOT NULL REFERENCES ghl_clone_templates(id) ON DELETE CASCADE,

    -- Sharing details
    shared_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,

    -- Permissions
    permissions JSONB DEFAULT '{
        "view": true,
        "edit": false,
        "delete": false,
        "share": false,
        "download": true
    }'::JSONB,

    -- Metadata
    shared_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_accessed_at TIMESTAMPTZ,
    access_count INTEGER DEFAULT 0,

    UNIQUE(team_id, template_id)
);

-- ============================================================================
-- TEAM ACTIVITY LOG TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS team_activity_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,

    -- Activity details
    activity_type VARCHAR(50) NOT NULL, -- 'member_added', 'member_removed', 'template_shared', etc.
    resource_type VARCHAR(50), -- 'member', 'template', 'invitation', 'settings'
    resource_id UUID,
    resource_name VARCHAR(255),

    -- Details
    details JSONB DEFAULT '{}'::JSONB,
    ip_address INET,
    user_agent TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Teams indexes
CREATE INDEX IF NOT EXISTS idx_teams_owner_id ON teams(owner_id);
CREATE INDEX IF NOT EXISTS idx_teams_slug ON teams(slug);
CREATE INDEX IF NOT EXISTS idx_teams_plan_type ON teams(plan_type);
CREATE INDEX IF NOT EXISTS idx_teams_created_at ON teams(created_at DESC);

-- Team members indexes
CREATE INDEX IF NOT EXISTS idx_team_members_team_id ON team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user_id ON team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_team_members_role ON team_members(team_id, role);
CREATE INDEX IF NOT EXISTS idx_team_members_status ON team_members(status);

-- Team invitations indexes
CREATE INDEX IF NOT EXISTS idx_team_invitations_team_id ON team_invitations(team_id);
CREATE INDEX IF NOT EXISTS idx_team_invitations_email ON team_invitations(email);
CREATE INDEX IF NOT EXISTS idx_team_invitations_token ON team_invitations(invitation_token);
CREATE INDEX IF NOT EXISTS idx_team_invitations_status ON team_invitations(status);
CREATE INDEX IF NOT EXISTS idx_team_invitations_expires_at ON team_invitations(expires_at);

-- Team templates indexes
CREATE INDEX IF NOT EXISTS idx_team_templates_team_id ON team_templates(team_id);
CREATE INDEX IF NOT EXISTS idx_team_templates_template_id ON team_templates(template_id);
CREATE INDEX IF NOT EXISTS idx_team_templates_shared_by ON team_templates(shared_by);

-- Team activity log indexes
CREATE INDEX IF NOT EXISTS idx_team_activity_team_id ON team_activity_log(team_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_team_activity_user_id ON team_activity_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_team_activity_type ON team_activity_log(activity_type, created_at DESC);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function: Get team member count
CREATE OR REPLACE FUNCTION get_team_member_count(p_team_id UUID)
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM team_members
    WHERE team_id = p_team_id
      AND status = 'active';

    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- Function: Get team template count
CREATE OR REPLACE FUNCTION get_team_template_count(p_team_id UUID)
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO v_count
    FROM team_templates
    WHERE team_id = p_team_id;

    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- Function: Check if user is team member
CREATE OR REPLACE FUNCTION is_team_member(p_team_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM team_members
        WHERE team_id = p_team_id
          AND user_id = p_user_id
          AND status = 'active'
    ) INTO v_exists;

    RETURN v_exists;
END;
$$ LANGUAGE plpgsql;

-- Function: Get user's role in team
CREATE OR REPLACE FUNCTION get_user_team_role(p_team_id UUID, p_user_id UUID)
RETURNS VARCHAR(50) AS $$
DECLARE
    v_role VARCHAR(50);
BEGIN
    SELECT role INTO v_role
    FROM team_members
    WHERE team_id = p_team_id
      AND user_id = p_user_id
      AND status = 'active';

    RETURN v_role;
END;
$$ LANGUAGE plpgsql;

-- Function: Check team member limit
CREATE OR REPLACE FUNCTION check_team_member_limit(p_team_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_current_count INTEGER;
    v_max_members INTEGER;
BEGIN
    SELECT get_team_member_count(p_team_id) INTO v_current_count;

    SELECT max_members INTO v_max_members
    FROM teams
    WHERE id = p_team_id;

    RETURN v_current_count < v_max_members;
END;
$$ LANGUAGE plpgsql;

-- Function: Log team activity
CREATE OR REPLACE FUNCTION log_team_activity(
    p_team_id UUID,
    p_user_id UUID,
    p_activity_type VARCHAR(50),
    p_resource_type VARCHAR(50) DEFAULT NULL,
    p_resource_id UUID DEFAULT NULL,
    p_resource_name VARCHAR(255) DEFAULT NULL,
    p_details JSONB DEFAULT '{}'::JSONB,
    p_ip_address INET DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_activity_id UUID;
BEGIN
    INSERT INTO team_activity_log (
        team_id, user_id, activity_type, resource_type, resource_id,
        resource_name, details, ip_address, user_agent
    ) VALUES (
        p_team_id, p_user_id, p_activity_type, p_resource_type, p_resource_id,
        p_resource_name, p_details, p_ip_address, p_user_agent
    ) RETURNING id INTO v_activity_id;

    RETURN v_activity_id;
END;
$$ LANGUAGE plpgsql;

-- Function: Cleanup expired invitations
CREATE OR REPLACE FUNCTION cleanup_expired_invitations()
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER;
BEGIN
    UPDATE team_invitations
    SET status = 'expired'
    WHERE status = 'pending'
      AND expires_at < CURRENT_TIMESTAMP;

    GET DIAGNOSTICS v_count = ROW_COUNT;

    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- Function: Get team statistics
CREATE OR REPLACE FUNCTION get_team_statistics(p_team_id UUID)
RETURNS TABLE (
    member_count INTEGER,
    template_count INTEGER,
    active_invitations INTEGER,
    recent_activity_count INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        get_team_member_count(p_team_id) as member_count,
        get_team_template_count(p_team_id) as template_count,
        (SELECT COUNT(*)::INTEGER FROM team_invitations
         WHERE team_id = p_team_id AND status = 'pending') as active_invitations,
        (SELECT COUNT(*)::INTEGER FROM team_activity_log
         WHERE team_id = p_team_id AND created_at >= CURRENT_TIMESTAMP - INTERVAL '7 days') as recent_activity_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Trigger: Update teams updated_at timestamp
CREATE OR REPLACE FUNCTION update_team_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER teams_update_timestamp
BEFORE UPDATE ON teams
FOR EACH ROW
EXECUTE FUNCTION update_team_timestamp();

-- Trigger: Auto-log team member additions
CREATE OR REPLACE FUNCTION trigger_log_member_added()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM log_team_activity(
        NEW.team_id,
        NEW.user_id,
        'member_added',
        'member',
        NEW.id,
        NULL,
        jsonb_build_object('role', NEW.role)
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER team_member_added
AFTER INSERT ON team_members
FOR EACH ROW
EXECUTE FUNCTION trigger_log_member_added();

-- Trigger: Auto-log team member removals
CREATE OR REPLACE FUNCTION trigger_log_member_removed()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM log_team_activity(
        OLD.team_id,
        OLD.user_id,
        'member_removed',
        'member',
        OLD.id,
        NULL,
        jsonb_build_object('role', OLD.role)
    );
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER team_member_removed
BEFORE DELETE ON team_members
FOR EACH ROW
EXECUTE FUNCTION trigger_log_member_removed();

-- ============================================================================
-- DEFAULT DATA
-- ============================================================================

-- Insert default team plan types metadata
INSERT INTO analytics_daily_stats (date, user_id, metric_type, metric_category, metric_value) VALUES
(CURRENT_DATE, NULL, 'teams_created', 'teams', 0),
(CURRENT_DATE, NULL, 'team_invitations_sent', 'teams', 0),
(CURRENT_DATE, NULL, 'team_templates_shared', 'teams', 0)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 025_team_collaboration completed successfully';
    RAISE NOTICE '   - 5 tables created (teams, team_members, team_invitations, team_templates, team_activity_log)';
    RAISE NOTICE '   - 8 functions created';
    RAISE NOTICE '   - 3 triggers created';
    RAISE NOTICE '   - 15+ indexes created';
    RAISE NOTICE '   - Team Collaboration System ready!';
END $$;
