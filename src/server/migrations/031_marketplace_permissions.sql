-- Migration: Marketplace Permissions
-- This adds RBAC permissions for the white-label marketplace system

-- ============================================================================
-- PERMISSIONS
-- ============================================================================

-- Insert marketplace permissions
INSERT INTO permissions (name, description, category, resource_type, action) VALUES
('marketplace.create', 'Create new marketplaces', 'marketplace', 'marketplace', 'create'),
('marketplace.view', 'View marketplace settings and statistics', 'marketplace', 'marketplace', 'read'),
('marketplace.update', 'Update marketplace settings', 'marketplace', 'marketplace', 'update'),
('marketplace.delete', 'Delete marketplaces', 'marketplace', 'marketplace', 'delete'),
('marketplace.manage_sellers', 'Approve/reject sellers and manage seller accounts', 'marketplace', 'seller', 'manage'),
('marketplace.create_listing', 'Create template listings', 'marketplace', 'listing', 'create'),
('marketplace.manage_listings', 'Approve/reject and manage template listings', 'marketplace', 'listing', 'manage')
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

    -- ADMIN - Full access to all marketplace features
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT admin_role_id, id FROM permissions
    WHERE name IN (
        'marketplace.create',
        'marketplace.view',
        'marketplace.update',
        'marketplace.delete',
        'marketplace.manage_sellers',
        'marketplace.create_listing',
        'marketplace.manage_listings'
    )
    ON CONFLICT DO NOTHING;

    -- EDITOR - Can create and manage marketplace, approve sellers and listings
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT editor_role_id, id FROM permissions
    WHERE name IN (
        'marketplace.create',
        'marketplace.view',
        'marketplace.update',
        'marketplace.manage_sellers',
        'marketplace.create_listing',
        'marketplace.manage_listings'
    )
    ON CONFLICT DO NOTHING;

    -- MEMBER - Can view and create listings
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT member_role_id, id FROM permissions
    WHERE name IN (
        'marketplace.view',
        'marketplace.create_listing'
    )
    ON CONFLICT DO NOTHING;

    -- VIEWER - Can only view marketplaces
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT viewer_role_id, id FROM permissions
    WHERE name IN (
        'marketplace.view'
    )
    ON CONFLICT DO NOTHING;

END $$;

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 031_marketplace_permissions completed successfully';
    RAISE NOTICE '   - 7 marketplace permissions added';
    RAISE NOTICE '   - Permissions assigned to 4 roles';
    RAISE NOTICE '   - Admin: Full access (7 permissions)';
    RAISE NOTICE '   - Editor: Create/manage marketplace + approve sellers/listings (6 permissions)';
    RAISE NOTICE '   - Member: View + create listings (2 permissions)';
    RAISE NOTICE '   - Viewer: View only (1 permission)';
END $$;
