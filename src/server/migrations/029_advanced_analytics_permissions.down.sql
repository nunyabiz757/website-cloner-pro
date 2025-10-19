-- Rollback migration for Advanced Analytics Permissions

-- Delete role permissions for advanced analytics permissions
DELETE FROM role_permissions
WHERE permission_id IN (
    SELECT id FROM permissions WHERE name IN (
        'analytics.view',
        'analytics.manage',
        'analytics.export'
    )
);

-- Delete permissions
DELETE FROM permissions
WHERE name IN (
    'analytics.view',
    'analytics.manage',
    'analytics.export'
);

-- Success message
DO $$
BEGIN
    RAISE NOTICE '✅ Rollback of 029_advanced_analytics_permissions completed';
    RAISE NOTICE '   - All advanced analytics permissions removed';
END $$;
