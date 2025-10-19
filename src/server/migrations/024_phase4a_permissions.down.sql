-- Rollback migration for Phase 4A Permissions
-- This will remove all Phase 4A versioning and analytics permissions

-- Delete role_permission mappings first
DELETE FROM role_permissions
WHERE permission_id IN (
    SELECT id FROM permissions
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
);

-- Delete permissions
DELETE FROM permissions
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
);

-- Success message
DO $$
BEGIN
    RAISE NOTICE '✅ Rollback of 024_phase4a_permissions completed';
    RAISE NOTICE '   - All Phase 4A permissions removed';
END $$;
