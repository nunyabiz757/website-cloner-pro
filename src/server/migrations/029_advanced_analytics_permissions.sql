-- Migration: Advanced Analytics Permissions
-- This adds RBAC permissions for the advanced analytics system

-- ============================================================================
-- PERMISSIONS
-- ============================================================================

-- Insert advanced analytics permissions
INSERT INTO permissions (name, description, category, resource_type, action) VALUES
('analytics.view', 'View advanced analytics data', 'analytics', 'analytics', 'read'),
('analytics.manage', 'Manage analytics funnels, A/B tests, and dashboards', 'analytics', 'analytics', 'create'),
('analytics.export', 'Export analytics data and reports', 'analytics', 'analytics', 'export')
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- ROLE PERMISSIONS ASSIGNMENT
-- ============================================================================

-- Get role IDs
DO $$
DECLARE
    admin_role_id UUID;
    editor_role_id UUID;
    member_role_id UUID;
    viewer_role_id UUID;
BEGIN
    -- Get role IDs
    SELECT id INTO admin_role_id FROM roles WHERE name = 'admin';
    SELECT id INTO editor_role_id FROM roles WHERE name = 'editor';
    SELECT id INTO member_role_id FROM roles WHERE name = 'member';
    SELECT id INTO viewer_role_id FROM roles WHERE name = 'viewer';

    -- ADMIN - Full access to all analytics features
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT admin_role_id, id FROM permissions
    WHERE name IN (
        'analytics.view',
        'analytics.manage',
        'analytics.export'
    )
    ON CONFLICT DO NOTHING;

    -- EDITOR - Can view, manage, and export analytics
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT editor_role_id, id FROM permissions
    WHERE name IN (
        'analytics.view',
        'analytics.manage',
        'analytics.export'
    )
    ON CONFLICT DO NOTHING;

    -- MEMBER - Can view and export analytics
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT member_role_id, id FROM permissions
    WHERE name IN (
        'analytics.view',
        'analytics.export'
    )
    ON CONFLICT DO NOTHING;

    -- VIEWER - Can only view analytics
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT viewer_role_id, id FROM permissions
    WHERE name IN (
        'analytics.view'
    )
    ON CONFLICT DO NOTHING;

END $$;

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 029_advanced_analytics_permissions completed successfully';
    RAISE NOTICE '   - 3 advanced analytics permissions added';
    RAISE NOTICE '   - Permissions assigned to 4 roles';
    RAISE NOTICE '   - Admin: Full access (3 permissions)';
    RAISE NOTICE '   - Editor: Manage + export (3 permissions)';
    RAISE NOTICE '   - Member: View + export (2 permissions)';
    RAISE NOTICE '   - Viewer: View only (1 permission)';
END $$;
