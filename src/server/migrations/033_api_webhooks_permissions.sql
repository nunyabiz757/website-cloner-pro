-- =====================================================================================
-- RBAC Permissions for Public API & Webhooks Feature
-- =====================================================================================
-- This migration adds role-based access control permissions for API key management
-- and webhook configuration capabilities
-- =====================================================================================

-- Insert API & Webhook permissions
INSERT INTO permissions (name, description, category, resource_type, action) VALUES
-- API Key Management
('api.keys.create', 'Create new API keys', 'api', 'api_key', 'create'),
('api.keys.view', 'View API keys and usage statistics', 'api', 'api_key', 'read'),
('api.keys.update', 'Update API key settings and scopes', 'api', 'api_key', 'update'),
('api.keys.delete', 'Revoke/delete API keys', 'api', 'api_key', 'delete'),
('api.usage.view', 'View API usage logs and analytics', 'api', 'api_usage', 'read'),

-- Webhook Management
('webhooks.create', 'Create new webhooks', 'webhooks', 'webhook', 'create'),
('webhooks.view', 'View webhook configurations and delivery logs', 'webhooks', 'webhook', 'read'),
('webhooks.update', 'Update webhook settings', 'webhooks', 'webhook', 'update'),
('webhooks.delete', 'Delete webhooks', 'webhooks', 'webhook', 'delete'),
('webhooks.test', 'Test webhook deliveries', 'webhooks', 'webhook', 'execute'),

-- API Documentation
('api.docs.view', 'View API documentation', 'api', 'documentation', 'read'),
('api.docs.manage', 'Manage API documentation', 'api', 'documentation', 'manage')

ON CONFLICT (name) DO NOTHING;

-- =====================================================================================
-- Assign Permissions to Roles
-- =====================================================================================

-- Admin Role: Full access to all API and webhook features
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'admin'
AND p.name IN (
    'api.keys.create',
    'api.keys.view',
    'api.keys.update',
    'api.keys.delete',
    'api.usage.view',
    'webhooks.create',
    'webhooks.view',
    'webhooks.update',
    'webhooks.delete',
    'webhooks.test',
    'api.docs.view',
    'api.docs.manage'
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Manager Role: Can create and manage API keys and webhooks for their scope
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'manager'
AND p.name IN (
    'api.keys.create',
    'api.keys.view',
    'api.keys.update',
    'api.keys.delete',
    'api.usage.view',
    'webhooks.create',
    'webhooks.view',
    'webhooks.update',
    'webhooks.delete',
    'webhooks.test',
    'api.docs.view'
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Editor Role: Can create API keys and webhooks, view usage
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'editor'
AND p.name IN (
    'api.keys.create',
    'api.keys.view',
    'api.keys.update',
    'api.usage.view',
    'webhooks.create',
    'webhooks.view',
    'webhooks.update',
    'webhooks.test',
    'api.docs.view'
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Viewer Role: Read-only access to API keys and webhooks
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'viewer'
AND p.name IN (
    'api.keys.view',
    'api.usage.view',
    'webhooks.view',
    'api.docs.view'
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- =====================================================================================
-- Permission Summary
-- =====================================================================================
-- Total Permissions Added: 12
--
-- Admin (12):    Full access to all API and webhook features
-- Manager (11):  All except api.docs.manage
-- Editor (9):    Create/update keys and webhooks, view usage
-- Viewer (4):    Read-only access
-- =====================================================================================
