-- Migration: Add RBAC permissions for Template Marketplace (Phase 3)
-- This adds permissions for template operations and assigns them to roles

-- ============================================================================
-- Add Template Marketplace Permissions
-- ============================================================================

-- Insert new permissions
INSERT INTO permissions (code, name, resource, action, description) VALUES
-- Template CRUD permissions
('templates:create', 'Create Templates', 'templates', 'create', 'Create and save new templates'),
('templates:view', 'View Templates', 'templates', 'view', 'View public and own templates'),
('templates:view:all', 'View All Templates', 'templates', 'view:all', 'View all templates including private'),
('templates:update', 'Update Templates', 'templates', 'update', 'Update own templates'),
('templates:update:all', 'Update Any Template', 'templates', 'update:all', 'Update any template (admin)'),
('templates:delete', 'Delete Templates', 'templates', 'delete', 'Delete own templates'),
('templates:delete:all', 'Delete Any Template', 'templates', 'delete:all', 'Delete any template (admin)'),

-- Template publishing permissions
('templates:publish', 'Publish Templates', 'templates', 'publish', 'Make templates public'),
('templates:feature', 'Feature Templates', 'templates', 'feature', 'Mark templates as featured (admin)'),
('templates:verify', 'Verify Templates', 'templates', 'verify', 'Mark templates as verified (admin)'),

-- Template marketplace permissions
('templates:search', 'Search Templates', 'templates', 'search', 'Search and browse marketplace'),
('templates:download', 'Download Templates', 'templates', 'download', 'Download templates'),
('templates:use', 'Use Templates', 'templates', 'use', 'Apply templates to pages'),

-- Review permissions
('templates:review:create', 'Write Reviews', 'template_reviews', 'create', 'Write reviews for templates'),
('templates:review:update', 'Update Reviews', 'template_reviews', 'update', 'Update own reviews'),
('templates:review:delete', 'Delete Reviews', 'template_reviews', 'delete', 'Delete own reviews'),
('templates:review:moderate', 'Moderate Reviews', 'template_reviews', 'moderate', 'Moderate any review (admin)'),

-- Category permissions
('templates:categories:manage', 'Manage Categories', 'template_categories', 'manage', 'Create/update/delete categories (admin)'),

-- Tag permissions
('templates:tags:manage', 'Manage Tags', 'template_tags', 'manage', 'Create/update/delete tags (admin)'),

-- Collection permissions
('templates:collections:create', 'Create Collections', 'template_collections', 'create', 'Create template collections'),
('templates:collections:update', 'Update Collections', 'template_collections', 'update', 'Update own collections'),
('templates:collections:delete', 'Delete Collections', 'template_collections', 'delete', 'Delete own collections'),
('templates:collections:view', 'View Collections', 'template_collections', 'view', 'View public collections')

ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- Assign Permissions to Roles
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
    SELECT id INTO admin_role_id FROM roles WHERE code = 'admin';
    SELECT id INTO editor_role_id FROM roles WHERE code = 'editor';
    SELECT id INTO member_role_id FROM roles WHERE code = 'member';
    SELECT id INTO viewer_role_id FROM roles WHERE code = 'viewer';

    -- ========================================================================
    -- ADMIN: Full access to all template features
    -- ========================================================================
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT admin_role_id, id FROM permissions
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
    )
    ON CONFLICT DO NOTHING;

    -- ========================================================================
    -- EDITOR: Can create, manage own templates, and use marketplace
    -- ========================================================================
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT editor_role_id, id FROM permissions
    WHERE code IN (
        'templates:create',
        'templates:view',
        'templates:update',
        'templates:delete',
        'templates:publish',
        'templates:search',
        'templates:download',
        'templates:use',
        'templates:review:create',
        'templates:review:update',
        'templates:review:delete',
        'templates:collections:create',
        'templates:collections:update',
        'templates:collections:delete',
        'templates:collections:view'
    )
    ON CONFLICT DO NOTHING;

    -- ========================================================================
    -- MEMBER: Can create private templates, use marketplace, write reviews
    -- ========================================================================
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT member_role_id, id FROM permissions
    WHERE code IN (
        'templates:create',
        'templates:view',
        'templates:update',
        'templates:delete',
        'templates:search',
        'templates:download',
        'templates:use',
        'templates:review:create',
        'templates:review:update',
        'templates:review:delete',
        'templates:collections:create',
        'templates:collections:update',
        'templates:collections:delete',
        'templates:collections:view'
    )
    ON CONFLICT DO NOTHING;

    -- ========================================================================
    -- VIEWER: Can only browse and view templates (read-only)
    -- ========================================================================
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT viewer_role_id, id FROM permissions
    WHERE code IN (
        'templates:view',
        'templates:search',
        'templates:collections:view'
    )
    ON CONFLICT DO NOTHING;

END $$;

-- ============================================================================
-- Create indexes for better query performance
-- ============================================================================

-- Already created in 021_template_marketplace.sql, but adding here for reference:
-- CREATE INDEX IF NOT EXISTS idx_templates_user_public ON ghl_clone_templates(user_id, is_public);
-- CREATE INDEX IF NOT EXISTS idx_templates_category ON ghl_clone_templates(category_id) WHERE is_public = true;
-- CREATE INDEX IF NOT EXISTS idx_templates_featured ON ghl_clone_templates(is_featured, rating_average) WHERE is_public = true;

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
        'migration', '022_template_marketplace_permissions',
        'description', 'Added RBAC permissions for Template Marketplace',
        'permissions_added', 24,
        'roles_updated', 4
    ),
    CURRENT_TIMESTAMP
);

-- Success message
DO $$
BEGIN
    RAISE NOTICE '✅ Migration 022_template_marketplace_permissions completed successfully';
    RAISE NOTICE '   - 24 permissions added';
    RAISE NOTICE '   - Permissions assigned to 4 roles (admin, editor, member, viewer)';
END $$;
