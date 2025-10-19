-- =====================================================================================
-- RBAC Permissions for Monetization & Subscriptions Feature
-- =====================================================================================
-- This migration adds role-based access control permissions for subscription
-- management, billing, and payment operations
-- =====================================================================================

-- Insert Subscription & Billing permissions
INSERT INTO permissions (name, description, category, resource_type, action) VALUES
-- Subscription Management
('subscriptions.create', 'Subscribe to plans', 'subscriptions', 'subscription', 'create'),
('subscriptions.view', 'View subscription details and history', 'subscriptions', 'subscription', 'read'),
('subscriptions.update', 'Update subscription (upgrade/downgrade)', 'subscriptions', 'subscription', 'update'),
('subscriptions.cancel', 'Cancel subscriptions', 'subscriptions', 'subscription', 'delete'),
('subscriptions.manage_all', 'Manage all user subscriptions (admin)', 'subscriptions', 'subscription', 'manage'),

-- Plan Management
('plans.view', 'View subscription plans', 'subscriptions', 'plan', 'read'),
('plans.manage', 'Create and manage subscription plans', 'subscriptions', 'plan', 'manage'),

-- Usage Tracking
('usage.view', 'View usage metrics and limits', 'subscriptions', 'usage', 'read'),
('usage.track', 'Track and update usage metrics', 'subscriptions', 'usage', 'write'),

-- Invoice Management
('invoices.view', 'View invoices and billing history', 'billing', 'invoice', 'read'),
('invoices.manage', 'Create and manage invoices', 'billing', 'invoice', 'manage'),
('invoices.download', 'Download invoice PDFs', 'billing', 'invoice', 'execute'),

-- Payment Management
('payments.create', 'Make payments', 'billing', 'payment', 'create'),
('payments.view', 'View payment history', 'billing', 'payment', 'read'),
('payments.refund', 'Process refunds', 'billing', 'payment', 'delete'),

-- Payment Method Management
('payment_methods.create', 'Add payment methods', 'billing', 'payment_method', 'create'),
('payment_methods.view', 'View saved payment methods', 'billing', 'payment_method', 'read'),
('payment_methods.update', 'Update payment methods', 'billing', 'payment_method', 'update'),
('payment_methods.delete', 'Delete payment methods', 'billing', 'payment_method', 'delete'),

-- Promo Code Management
('promo_codes.create', 'Create promo codes', 'subscriptions', 'promo_code', 'create'),
('promo_codes.view', 'View promo codes', 'subscriptions', 'promo_code', 'read'),
('promo_codes.apply', 'Apply promo codes to subscriptions', 'subscriptions', 'promo_code', 'execute'),
('promo_codes.manage', 'Manage all promo codes', 'subscriptions', 'promo_code', 'manage')

ON CONFLICT (name) DO NOTHING;

-- =====================================================================================
-- Assign Permissions to Roles
-- =====================================================================================

-- Admin Role: Full access to all subscription and billing features
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'admin'
AND p.name IN (
    'subscriptions.create',
    'subscriptions.view',
    'subscriptions.update',
    'subscriptions.cancel',
    'subscriptions.manage_all',
    'plans.view',
    'plans.manage',
    'usage.view',
    'usage.track',
    'invoices.view',
    'invoices.manage',
    'invoices.download',
    'payments.create',
    'payments.view',
    'payments.refund',
    'payment_methods.create',
    'payment_methods.view',
    'payment_methods.update',
    'payment_methods.delete',
    'promo_codes.create',
    'promo_codes.view',
    'promo_codes.apply',
    'promo_codes.manage'
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Manager Role: Can manage own subscriptions and view billing
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'manager'
AND p.name IN (
    'subscriptions.create',
    'subscriptions.view',
    'subscriptions.update',
    'subscriptions.cancel',
    'plans.view',
    'usage.view',
    'invoices.view',
    'invoices.download',
    'payments.create',
    'payments.view',
    'payment_methods.create',
    'payment_methods.view',
    'payment_methods.update',
    'payment_methods.delete',
    'promo_codes.view',
    'promo_codes.apply'
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Editor Role: Can manage own subscription and payments
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'editor'
AND p.name IN (
    'subscriptions.create',
    'subscriptions.view',
    'subscriptions.update',
    'plans.view',
    'usage.view',
    'invoices.view',
    'invoices.download',
    'payments.create',
    'payments.view',
    'payment_methods.create',
    'payment_methods.view',
    'payment_methods.update',
    'payment_methods.delete',
    'promo_codes.apply'
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- Viewer Role: Read-only access to subscription and billing info
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.name = 'viewer'
AND p.name IN (
    'subscriptions.view',
    'plans.view',
    'usage.view',
    'invoices.view',
    'invoices.download',
    'payments.view',
    'payment_methods.view'
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- =====================================================================================
-- Permission Summary
-- =====================================================================================
-- Total Permissions Added: 23
--
-- Admin (23):     Full access to all subscription and billing features
-- Manager (16):   Manage own subscriptions, cannot manage plans or refunds
-- Editor (14):    Manage own subscription and payments
-- Viewer (7):     Read-only access to billing information
-- =====================================================================================
