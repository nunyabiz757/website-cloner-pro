-- Rollback migration for Template Marketplace Permissions
-- This will remove all template marketplace permissions

-- Delete role_permission mappings first
DELETE FROM role_permissions
WHERE permission_id IN (
    SELECT id FROM permissions
    WHERE code LIKE 'templates:%'
);

-- Delete permissions
DELETE FROM permissions
WHERE code IN (
    'templates:create',
    'templates:view',
    'templates:view:all',
    'templates:update',
    'templates:update:all',
    'templates:delete',
    'templates:delete:all',
    'templates:publish',
    'templates:feature',
    'templates:verify',
    'templates:search',
    'templates:download',
    'templates:use',
    'templates:review:create',
    'templates:review:update',
    'templates:review:delete',
    'templates:review:moderate',
    'templates:categories:manage',
    'templates:tags:manage',
    'templates:collections:create',
    'templates:collections:update',
    'templates:collections:delete',
    'templates:collections:view'
);

-- Success message
DO $$
BEGIN
    RAISE NOTICE '✅ Rollback of 022_template_marketplace_permissions completed';
END $$;
