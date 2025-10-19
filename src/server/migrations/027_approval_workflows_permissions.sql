-- Migration: Approval Workflows Permissions
-- This adds RBAC permissions for the approval workflows system

-- ============================================================================
-- PERMISSIONS
-- ============================================================================

-- Insert approval workflow permissions
INSERT INTO permissions (name, description, category, resource_type, action) VALUES
('workflows.create', 'Create approval workflows', 'workflows', 'workflow', 'create'),
('workflows.view', 'View approval workflows', 'workflows', 'workflow', 'read'),
('workflows.update', 'Update approval workflows', 'workflows', 'workflow', 'update'),
('workflows.delete', 'Delete approval workflows', 'workflows', 'workflow', 'delete'),
('approvals.submit', 'Submit templates for approval', 'approvals', 'approval_request', 'create'),
('approvals.view', 'View approval requests', 'approvals', 'approval_request', 'read'),
('approvals.cancel', 'Cancel approval requests', 'approvals', 'approval_request', 'update'),
('approvals.review', 'Review and approve/reject submissions', 'approvals', 'approval_review', 'create')
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

    -- ADMIN - Full access to all workflow features
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT admin_role_id, id FROM permissions
    WHERE name IN (
        'workflows.create',
        'workflows.view',
        'workflows.update',
        'workflows.delete',
        'approvals.submit',
        'approvals.view',
        'approvals.cancel',
        'approvals.review'
    )
    ON CONFLICT DO NOTHING;

    -- EDITOR - Can create workflows, submit, view, and review
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT editor_role_id, id FROM permissions
    WHERE name IN (
        'workflows.create',
        'workflows.view',
        'workflows.update',
        'approvals.submit',
        'approvals.view',
        'approvals.cancel',
        'approvals.review'
    )
    ON CONFLICT DO NOTHING;

    -- MEMBER - Can submit for approval, view, and review
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT member_role_id, id FROM permissions
    WHERE name IN (
        'workflows.view',
        'approvals.submit',
        'approvals.view',
        'approvals.cancel',
        'approvals.review'
    )
    ON CONFLICT DO NOTHING;

    -- VIEWER - Can only view workflows and approval requests
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT viewer_role_id, id FROM permissions
    WHERE name IN (
        'workflows.view',
        'approvals.view'
    )
    ON CONFLICT DO NOTHING;

END $$;

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 027_approval_workflows_permissions completed successfully';
    RAISE NOTICE '   - 8 approval workflow permissions added';
    RAISE NOTICE '   - Permissions assigned to 4 roles';
    RAISE NOTICE '   - Admin: Full access (8 permissions)';
    RAISE NOTICE '   - Editor: Create/update workflows + submit/review (7 permissions)';
    RAISE NOTICE '   - Member: Submit for approval + review (5 permissions)';
    RAISE NOTICE '   - Viewer: View only (2 permissions)';
END $$;
