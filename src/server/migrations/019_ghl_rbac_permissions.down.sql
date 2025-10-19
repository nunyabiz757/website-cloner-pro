-- Rollback: GHL RBAC Permissions
-- Description: Removes GHL-specific permissions from roles and permissions table

-- Delete role-permission assignments for GHL permissions
DELETE FROM role_permissions
WHERE permission_id IN (
    SELECT id FROM permissions
    WHERE code LIKE 'clone:ghl:%'
       OR code LIKE 'credits:%'
       OR code LIKE 'ghl:%'
);

-- Delete GHL permissions
DELETE FROM permissions
WHERE code LIKE 'clone:ghl:%'
   OR code LIKE 'credits:%'
   OR code LIKE 'ghl:%';
