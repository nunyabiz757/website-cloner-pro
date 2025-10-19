-- Rollback migration for Marketplace Permissions

-- Delete role permissions for marketplace permissions
DELETE FROM role_permissions
WHERE permission_id IN (
    SELECT id FROM permissions WHERE name IN (
        'marketplace.create',
        'marketplace.view',
        'marketplace.update',
        'marketplace.delete',
        'marketplace.manage_sellers',
        'marketplace.create_listing',
        'marketplace.manage_listings'
    )
);

-- Delete permissions
DELETE FROM permissions
WHERE name IN (
    'marketplace.create',
    'marketplace.view',
    'marketplace.update',
    'marketplace.delete',
    'marketplace.manage_sellers',
    'marketplace.create_listing',
    'marketplace.manage_listings'
);

-- Success message
DO $$
BEGIN
    RAISE NOTICE '✅ Rollback of 031_marketplace_permissions completed';
    RAISE NOTICE '   - All marketplace permissions removed';
END $$;
