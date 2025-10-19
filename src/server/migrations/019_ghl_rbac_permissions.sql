-- Migration: GHL RBAC Permissions
-- Created: 2025-10-15
-- Description: Adds GHL-specific permissions and assigns them to roles

-- ============================================================================
-- ADD GHL-SPECIFIC PERMISSIONS
-- ============================================================================

-- GHL Cloning permissions
INSERT INTO permissions (code, name, resource, action, description) VALUES
('clone:ghl:copy', 'Copy GHL Pages', 'ghl_pages', 'copy', 'Copy GoHighLevel page data'),
('clone:ghl:paste', 'Paste GHL Pages', 'ghl_pages', 'paste', 'Paste GHL page data to builder'),
('clone:ghl:view', 'View GHL Clones', 'ghl_pages', 'view', 'View cloned GHL pages'),
('clone:ghl:delete', 'Delete GHL Clones', 'ghl_pages', 'delete', 'Delete cloned GHL pages'),
('clone:ghl:export', 'Export GHL Clones', 'ghl_pages', 'export', 'Export cloned GHL pages'),
('clone:ghl:template', 'Create GHL Templates', 'ghl_pages', 'template', 'Save cloned pages as templates'),
('clone:ghl:view_templates', 'View GHL Templates', 'ghl_templates', 'view', 'View GHL clone templates'),
('clone:ghl:use_templates', 'Use GHL Templates', 'ghl_templates', 'use', 'Use GHL clone templates'),
('clone:ghl:manage_templates', 'Manage GHL Templates', 'ghl_templates', 'manage', 'Create, update, delete GHL templates'),
('clone:ghl:view_public_templates', 'View Public Templates', 'ghl_templates', 'view_public', 'View community shared templates')
ON CONFLICT (code) DO NOTHING;

-- Credit management permissions
INSERT INTO permissions (code, name, resource, action, description) VALUES
('credits:view', 'View Credits', 'credits', 'view', 'View credit balance and details'),
('credits:purchase', 'Purchase Credits', 'credits', 'purchase', 'Purchase credit packages'),
('credits:history', 'View Credit History', 'credits', 'view_history', 'View credit transaction history'),
('credits:subscribe', 'Manage Subscriptions', 'credits', 'subscribe', 'Create and manage credit subscriptions'),
('credits:admin_adjust', 'Admin Adjust Credits', 'credits', 'admin_adjust', 'Admin adjustment of user credits'),
('credits:admin_view_all', 'View All User Credits', 'credits', 'admin_view_all', 'View all users credit balances'),
('credits:admin_refund', 'Process Refunds', 'credits', 'admin_refund', 'Process credit refunds')
ON CONFLICT (code) DO NOTHING;

-- GHL detection permissions
INSERT INTO permissions (code, name, resource, action, description) VALUES
('ghl:detect', 'Detect GHL Sites', 'ghl_detection', 'detect', 'Use GHL site detection service'),
('ghl:view_detection_log', 'View Detection Log', 'ghl_detection', 'view_log', 'View GHL detection history'),
('ghl:view_statistics', 'View GHL Statistics', 'ghl_statistics', 'view', 'View cloning and detection statistics')
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- ASSIGN PERMISSIONS TO ROLES
-- ============================================================================

-- Helper function to assign permission to role
CREATE OR REPLACE FUNCTION assign_ghl_permission_to_role(
    p_role_name VARCHAR(100),
    p_permission_code VARCHAR(255)
)
RETURNS BOOLEAN AS $$
DECLARE
    v_role_id UUID;
    v_permission_id UUID;
BEGIN
    -- Get role ID
    SELECT id INTO v_role_id FROM roles WHERE name = p_role_name;
    IF v_role_id IS NULL THEN
        RAISE NOTICE 'Role not found: %', p_role_name;
        RETURN false;
    END IF;

    -- Get permission ID
    SELECT id INTO v_permission_id FROM permissions WHERE code = p_permission_code;
    IF v_permission_id IS NULL THEN
        RAISE NOTICE 'Permission not found: %', p_permission_code;
        RETURN false;
    END IF;

    -- Assign permission to role
    INSERT INTO role_permissions (role_id, permission_id)
    VALUES (v_role_id, v_permission_id)
    ON CONFLICT (role_id, permission_id) DO NOTHING;

    RETURN true;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VIEWER ROLE - View only access
-- ============================================================================
SELECT assign_ghl_permission_to_role('viewer', 'clone:ghl:view');
SELECT assign_ghl_permission_to_role('viewer', 'clone:ghl:view_templates');
SELECT assign_ghl_permission_to_role('viewer', 'clone:ghl:view_public_templates');
SELECT assign_ghl_permission_to_role('viewer', 'credits:view');
SELECT assign_ghl_permission_to_role('viewer', 'ghl:view_statistics');

-- ============================================================================
-- EDITOR ROLE - Can copy, paste, use templates, purchase credits
-- ============================================================================
SELECT assign_ghl_permission_to_role('editor', 'clone:ghl:copy');
SELECT assign_ghl_permission_to_role('editor', 'clone:ghl:paste');
SELECT assign_ghl_permission_to_role('editor', 'clone:ghl:view');
SELECT assign_ghl_permission_to_role('editor', 'clone:ghl:delete');
SELECT assign_ghl_permission_to_role('editor', 'clone:ghl:export');
SELECT assign_ghl_permission_to_role('editor', 'clone:ghl:view_templates');
SELECT assign_ghl_permission_to_role('editor', 'clone:ghl:use_templates');
SELECT assign_ghl_permission_to_role('editor', 'clone:ghl:view_public_templates');
SELECT assign_ghl_permission_to_role('editor', 'credits:view');
SELECT assign_ghl_permission_to_role('editor', 'credits:purchase');
SELECT assign_ghl_permission_to_role('editor', 'credits:history');
SELECT assign_ghl_permission_to_role('editor', 'credits:subscribe');
SELECT assign_ghl_permission_to_role('editor', 'ghl:detect');
SELECT assign_ghl_permission_to_role('editor', 'ghl:view_statistics');

-- ============================================================================
-- MODERATOR ROLE - Editor + template creation and management
-- ============================================================================
SELECT assign_ghl_permission_to_role('moderator', 'clone:ghl:copy');
SELECT assign_ghl_permission_to_role('moderator', 'clone:ghl:paste');
SELECT assign_ghl_permission_to_role('moderator', 'clone:ghl:view');
SELECT assign_ghl_permission_to_role('moderator', 'clone:ghl:delete');
SELECT assign_ghl_permission_to_role('moderator', 'clone:ghl:export');
SELECT assign_ghl_permission_to_role('moderator', 'clone:ghl:template');
SELECT assign_ghl_permission_to_role('moderator', 'clone:ghl:view_templates');
SELECT assign_ghl_permission_to_role('moderator', 'clone:ghl:use_templates');
SELECT assign_ghl_permission_to_role('moderator', 'clone:ghl:manage_templates');
SELECT assign_ghl_permission_to_role('moderator', 'clone:ghl:view_public_templates');
SELECT assign_ghl_permission_to_role('moderator', 'credits:view');
SELECT assign_ghl_permission_to_role('moderator', 'credits:purchase');
SELECT assign_ghl_permission_to_role('moderator', 'credits:history');
SELECT assign_ghl_permission_to_role('moderator', 'credits:subscribe');
SELECT assign_ghl_permission_to_role('moderator', 'ghl:detect');
SELECT assign_ghl_permission_to_role('moderator', 'ghl:view_detection_log');
SELECT assign_ghl_permission_to_role('moderator', 'ghl:view_statistics');

-- ============================================================================
-- ADMIN ROLE - All permissions
-- ============================================================================
-- GHL cloning permissions
SELECT assign_ghl_permission_to_role('admin', 'clone:ghl:copy');
SELECT assign_ghl_permission_to_role('admin', 'clone:ghl:paste');
SELECT assign_ghl_permission_to_role('admin', 'clone:ghl:view');
SELECT assign_ghl_permission_to_role('admin', 'clone:ghl:delete');
SELECT assign_ghl_permission_to_role('admin', 'clone:ghl:export');
SELECT assign_ghl_permission_to_role('admin', 'clone:ghl:template');
SELECT assign_ghl_permission_to_role('admin', 'clone:ghl:view_templates');
SELECT assign_ghl_permission_to_role('admin', 'clone:ghl:use_templates');
SELECT assign_ghl_permission_to_role('admin', 'clone:ghl:manage_templates');
SELECT assign_ghl_permission_to_role('admin', 'clone:ghl:view_public_templates');

-- Credit management permissions
SELECT assign_ghl_permission_to_role('admin', 'credits:view');
SELECT assign_ghl_permission_to_role('admin', 'credits:purchase');
SELECT assign_ghl_permission_to_role('admin', 'credits:history');
SELECT assign_ghl_permission_to_role('admin', 'credits:subscribe');
SELECT assign_ghl_permission_to_role('admin', 'credits:admin_adjust');
SELECT assign_ghl_permission_to_role('admin', 'credits:admin_view_all');
SELECT assign_ghl_permission_to_role('admin', 'credits:admin_refund');

-- GHL detection permissions
SELECT assign_ghl_permission_to_role('admin', 'ghl:detect');
SELECT assign_ghl_permission_to_role('admin', 'ghl:view_detection_log');
SELECT assign_ghl_permission_to_role('admin', 'ghl:view_statistics');

-- ============================================================================
-- CLEANUP
-- ============================================================================
-- Drop the helper function as it's no longer needed
DROP FUNCTION IF EXISTS assign_ghl_permission_to_role(VARCHAR, VARCHAR);

-- ============================================================================
-- VERIFICATION QUERY
-- ============================================================================
-- View all GHL permissions by role
-- SELECT
--     r.name as role_name,
--     p.code as permission_code,
--     p.name as permission_name,
--     p.resource,
--     p.action
-- FROM roles r
-- JOIN role_permissions rp ON r.id = rp.role_id
-- JOIN permissions p ON rp.permission_id = p.id
-- WHERE p.code LIKE 'clone:ghl:%' OR p.code LIKE 'credits:%' OR p.code LIKE 'ghl:%'
-- ORDER BY r.name, p.code;
