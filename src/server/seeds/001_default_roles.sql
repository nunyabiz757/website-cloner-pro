-- Seed: Default Roles and Permissions
-- Description: Creates default system roles and permissions

-- Insert default permissions
INSERT INTO permissions (code, name, resource, action, description) VALUES
  -- User management permissions
  ('users:read', 'Read Users', 'users', 'read', 'View user information'),
  ('users:create', 'Create Users', 'users', 'create', 'Create new users'),
  ('users:update', 'Update Users', 'users', 'update', 'Modify user information'),
  ('users:delete', 'Delete Users', 'users', 'delete', 'Delete users'),

  -- Role management permissions
  ('roles:read', 'Read Roles', 'roles', 'read', 'View role information'),
  ('roles:create', 'Create Roles', 'roles', 'create', 'Create new roles'),
  ('roles:update', 'Update Roles', 'roles', 'update', 'Modify role information'),
  ('roles:delete', 'Delete Roles', 'roles', 'delete', 'Delete roles'),

  -- Website management permissions
  ('websites:read', 'Read Websites', 'websites', 'read', 'View website clones'),
  ('websites:create', 'Create Websites', 'websites', 'create', 'Create new website clones'),
  ('websites:update', 'Update Websites', 'websites', 'update', 'Modify website clones'),
  ('websites:delete', 'Delete Websites', 'websites', 'delete', 'Delete website clones'),
  ('websites:publish', 'Publish Websites', 'websites', 'publish', 'Publish website clones'),

  -- Audit log permissions
  ('audit:read', 'Read Audit Logs', 'audit', 'read', 'View audit logs'),
  ('audit:export', 'Export Audit Logs', 'audit', 'export', 'Export audit logs'),

  -- Security permissions
  ('security:alerts', 'Manage Security Alerts', 'security', 'alerts', 'Manage security alerts'),
  ('security:monitoring', 'Security Monitoring', 'security', 'monitoring', 'Monitor security events'),
  ('security:config', 'Security Configuration', 'security', 'config', 'Configure security settings'),

  -- System administration
  ('system:config', 'System Configuration', 'system', 'config', 'Configure system settings'),
  ('system:monitoring', 'System Monitoring', 'system', 'monitoring', 'Monitor system health'),
  ('system:backup', 'System Backup', 'system', 'backup', 'Manage system backups')
ON CONFLICT (code) DO NOTHING;

-- Insert default roles
INSERT INTO roles (name, description) VALUES
  ('admin', 'Administrator with full system access'),
  ('editor', 'Can create and edit content'),
  ('viewer', 'Can only view content'),
  ('moderator', 'Can moderate content and manage users')
ON CONFLICT (name) DO NOTHING;

-- Get role IDs
DO $$
DECLARE
  admin_role_id UUID;
  editor_role_id UUID;
  viewer_role_id UUID;
  moderator_role_id UUID;

  users_read_perm UUID;
  users_create_perm UUID;
  users_update_perm UUID;
  users_delete_perm UUID;

  roles_read_perm UUID;
  roles_create_perm UUID;
  roles_update_perm UUID;
  roles_delete_perm UUID;

  websites_read_perm UUID;
  websites_create_perm UUID;
  websites_update_perm UUID;
  websites_delete_perm UUID;
  websites_publish_perm UUID;

  audit_read_perm UUID;
  audit_export_perm UUID;

  security_alerts_perm UUID;
  security_monitoring_perm UUID;
  security_config_perm UUID;

  system_config_perm UUID;
  system_monitoring_perm UUID;
  system_backup_perm UUID;
BEGIN
  -- Get role IDs
  SELECT id INTO admin_role_id FROM roles WHERE name = 'admin';
  SELECT id INTO editor_role_id FROM roles WHERE name = 'editor';
  SELECT id INTO viewer_role_id FROM roles WHERE name = 'viewer';
  SELECT id INTO moderator_role_id FROM roles WHERE name = 'moderator';

  -- Get permission IDs
  SELECT id INTO users_read_perm FROM permissions WHERE code = 'users:read';
  SELECT id INTO users_create_perm FROM permissions WHERE code = 'users:create';
  SELECT id INTO users_update_perm FROM permissions WHERE code = 'users:update';
  SELECT id INTO users_delete_perm FROM permissions WHERE code = 'users:delete';

  SELECT id INTO roles_read_perm FROM permissions WHERE code = 'roles:read';
  SELECT id INTO roles_create_perm FROM permissions WHERE code = 'roles:create';
  SELECT id INTO roles_update_perm FROM permissions WHERE code = 'roles:update';
  SELECT id INTO roles_delete_perm FROM permissions WHERE code = 'roles:delete';

  SELECT id INTO websites_read_perm FROM permissions WHERE code = 'websites:read';
  SELECT id INTO websites_create_perm FROM permissions WHERE code = 'websites:create';
  SELECT id INTO websites_update_perm FROM permissions WHERE code = 'websites:update';
  SELECT id INTO websites_delete_perm FROM permissions WHERE code = 'websites:delete';
  SELECT id INTO websites_publish_perm FROM permissions WHERE code = 'websites:publish';

  SELECT id INTO audit_read_perm FROM permissions WHERE code = 'audit:read';
  SELECT id INTO audit_export_perm FROM permissions WHERE code = 'audit:export';

  SELECT id INTO security_alerts_perm FROM permissions WHERE code = 'security:alerts';
  SELECT id INTO security_monitoring_perm FROM permissions WHERE code = 'security:monitoring';
  SELECT id INTO security_config_perm FROM permissions WHERE code = 'security:config';

  SELECT id INTO system_config_perm FROM permissions WHERE code = 'system:config';
  SELECT id INTO system_monitoring_perm FROM permissions WHERE code = 'system:monitoring';
  SELECT id INTO system_backup_perm FROM permissions WHERE code = 'system:backup';

  -- Admin role gets all permissions
  INSERT INTO role_permissions (role_id, permission_id) VALUES
    (admin_role_id, users_read_perm),
    (admin_role_id, users_create_perm),
    (admin_role_id, users_update_perm),
    (admin_role_id, users_delete_perm),
    (admin_role_id, roles_read_perm),
    (admin_role_id, roles_create_perm),
    (admin_role_id, roles_update_perm),
    (admin_role_id, roles_delete_perm),
    (admin_role_id, websites_read_perm),
    (admin_role_id, websites_create_perm),
    (admin_role_id, websites_update_perm),
    (admin_role_id, websites_delete_perm),
    (admin_role_id, websites_publish_perm),
    (admin_role_id, audit_read_perm),
    (admin_role_id, audit_export_perm),
    (admin_role_id, security_alerts_perm),
    (admin_role_id, security_monitoring_perm),
    (admin_role_id, security_config_perm),
    (admin_role_id, system_config_perm),
    (admin_role_id, system_monitoring_perm),
    (admin_role_id, system_backup_perm)
  ON CONFLICT (role_id, permission_id) DO NOTHING;

  -- Editor role permissions
  INSERT INTO role_permissions (role_id, permission_id) VALUES
    (editor_role_id, users_read_perm),
    (editor_role_id, websites_read_perm),
    (editor_role_id, websites_create_perm),
    (editor_role_id, websites_update_perm),
    (editor_role_id, websites_delete_perm),
    (editor_role_id, websites_publish_perm),
    (editor_role_id, audit_read_perm)
  ON CONFLICT (role_id, permission_id) DO NOTHING;

  -- Viewer role permissions
  INSERT INTO role_permissions (role_id, permission_id) VALUES
    (viewer_role_id, users_read_perm),
    (viewer_role_id, websites_read_perm),
    (viewer_role_id, audit_read_perm)
  ON CONFLICT (role_id, permission_id) DO NOTHING;

  -- Moderator role permissions
  INSERT INTO role_permissions (role_id, permission_id) VALUES
    (moderator_role_id, users_read_perm),
    (moderator_role_id, users_update_perm),
    (moderator_role_id, websites_read_perm),
    (moderator_role_id, websites_update_perm),
    (moderator_role_id, websites_delete_perm),
    (moderator_role_id, audit_read_perm),
    (moderator_role_id, security_monitoring_perm)
  ON CONFLICT (role_id, permission_id) DO NOTHING;
END $$;
