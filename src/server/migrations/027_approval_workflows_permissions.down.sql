-- Rollback migration for Approval Workflows Permissions

-- Delete role permissions for approval workflow permissions
DELETE FROM role_permissions
WHERE permission_id IN (
    SELECT id FROM permissions WHERE name IN (
        'workflows.create',
        'workflows.view',
        'workflows.update',
        'workflows.delete',
        'approvals.submit',
        'approvals.view',
        'approvals.cancel',
        'approvals.review'
    )
);

-- Delete permissions
DELETE FROM permissions
WHERE name IN (
    'workflows.create',
    'workflows.view',
    'workflows.update',
    'workflows.delete',
    'approvals.submit',
    'approvals.view',
    'approvals.cancel',
    'approvals.review'
);

-- Success message
DO $$
BEGIN
    RAISE NOTICE '✅ Rollback of 027_approval_workflows_permissions completed';
    RAISE NOTICE '   - All approval workflow permissions removed';
END $$;
