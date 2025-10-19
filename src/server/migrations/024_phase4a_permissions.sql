-- Migration: Add RBAC permissions for Phase 4A (Versioning & Analytics)
-- This adds permissions for template versioning and analytics features

-- ============================================================================
-- Add Phase 4A Permissions
-- ============================================================================

-- Insert new permissions
INSERT INTO permissions (code, name, resource, action, description) VALUES
-- Template versioning permissions
('templates:versions:view', 'View Template Versions', 'templates', 'versions:view', 'View template version history'),
('templates:versions:create', 'Create Template Versions', 'templates', 'versions:create', 'Create new template versions manually'),
('templates:versions:restore', 'Restore Template Versions', 'templates', 'versions:restore', 'Restore templates to previous versions'),
('templates:versions:compare', 'Compare Template Versions', 'templates', 'versions:compare', 'Compare two template versions'),
('templates:versions:delete', 'Delete Template Versions', 'templates', 'versions:delete', 'Delete template versions'),

-- Analytics permissions
('analytics:view', 'View Analytics', 'analytics', 'view', 'View own analytics and statistics'),
('analytics:view:all', 'View All Analytics', 'analytics', 'view:all', 'View analytics for all users (admin)'),
('analytics:export', 'Export Analytics', 'analytics', 'export', 'Export analytics data to CSV'),
('analytics:dashboard', 'Access Analytics Dashboard', 'analytics', 'dashboard', 'Access analytics dashboard'),
('analytics:activity:view', 'View Activity Log', 'analytics', 'activity:view', 'View user activity log'),
('analytics:templates', 'View Template Analytics', 'analytics', 'templates', 'View template performance metrics'),
('analytics:trending', 'View Trending Data', 'analytics', 'trending', 'View trending templates and statistics')

ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- Assign Permissions to Roles
-- ============================================================================

DO $$
DECLARE
    admin_role_id UUID;
    editor_role_id UUID;
    member_role_id UUID;
    viewer_role_id UUID;
BEGIN
    -- Get role IDs
    SELECT id INTO admin_role_id FROM roles WHERE code = 'admin';
    SELECT id INTO editor_role_id FROM roles WHERE code = 'editor';
    SELECT id INTO member_role_id FROM roles WHERE code = 'member';
    SELECT id INTO viewer_role_id FROM roles WHERE code = 'viewer';

    -- ========================================================================
    -- ADMIN: Full access to versioning and analytics
    -- ========================================================================
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT admin_role_id, id FROM permissions
    WHERE code IN (
        'templates:versions:view',
        'templates:versions:create',
        'templates:versions:restore',
        'templates:versions:compare',
        'templates:versions:delete',
        'analytics:view',
        'analytics:view:all',
        'analytics:export',
        'analytics:dashboard',
        'analytics:activity:view',
        'analytics:templates',
        'analytics:trending'
    )
    ON CONFLICT DO NOTHING;

    -- ========================================================================
    -- EDITOR: Full versioning, limited analytics
    -- ========================================================================
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT editor_role_id, id FROM permissions
    WHERE code IN (
        'templates:versions:view',
        'templates:versions:create',
        'templates:versions:restore',
        'templates:versions:compare',
        'templates:versions:delete',
        'analytics:view',
        'analytics:export',
        'analytics:dashboard',
        'analytics:activity:view',
        'analytics:templates',
        'analytics:trending'
    )
    ON CONFLICT DO NOTHING;

    -- ========================================================================
    -- MEMBER: View versioning, basic analytics
    -- ========================================================================
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT member_role_id, id FROM permissions
    WHERE code IN (
        'templates:versions:view',
        'templates:versions:create',
        'templates:versions:restore',
        'templates:versions:compare',
        'analytics:view',
        'analytics:dashboard',
        'analytics:activity:view',
        'analytics:templates',
        'analytics:trending'
    )
    ON CONFLICT DO NOTHING;

    -- ========================================================================
    -- VIEWER: View-only analytics, no versioning
    -- ========================================================================
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT viewer_role_id, id FROM permissions
    WHERE code IN (
        'analytics:view',
        'analytics:dashboard',
        'analytics:trending'
    )
    ON CONFLICT DO NOTHING;

END $$;

-- ============================================================================
-- Audit Log
-- ============================================================================

-- Log migration
INSERT INTO audit_logs (
    event_type,
    details,
    created_at
) VALUES (
    'migration:applied',
    jsonb_build_object(
        'migration', '024_phase4a_permissions',
        'description', 'Added RBAC permissions for Phase 4A (Versioning & Analytics)',
        'permissions_added', 12,
        'roles_updated', 4
    ),
    CURRENT_TIMESTAMP
);

-- Success message
DO $$
BEGIN
    RAISE NOTICE '✅ Migration 024_phase4a_permissions completed successfully';
    RAISE NOTICE '   - 12 permissions added';
    RAISE NOTICE '   - Permissions assigned to 4 roles (admin, editor, member, viewer)';
    RAISE NOTICE '   - Phase 4A: Versioning & Analytics RBAC ready!';
END $$;
