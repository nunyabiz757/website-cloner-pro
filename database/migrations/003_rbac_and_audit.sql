-- RBAC (Role-Based Access Control) Schema

-- Roles table
CREATE TABLE IF NOT EXISTS roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    is_system BOOLEAN DEFAULT FALSE, -- System roles cannot be deleted
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Permissions table
CREATE TABLE IF NOT EXISTS permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource VARCHAR(100) NOT NULL, -- e.g., 'projects', 'users', 'settings'
    action VARCHAR(50) NOT NULL, -- e.g., 'create', 'read', 'update', 'delete'
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(resource, action)
);

-- Role permissions (many-to-many)
CREATE TABLE IF NOT EXISTS role_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
    permission_id UUID REFERENCES permissions(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(role_id, permission_id)
);

-- User roles (many-to-many)
CREATE TABLE IF NOT EXISTS user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    role_id UUID REFERENCES roles(id) ON DELETE CASCADE,
    assigned_by UUID REFERENCES users(id),
    assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP, -- Optional: for temporary role assignments
    UNIQUE(user_id, role_id)
);

-- Indexes for RBAC
CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission ON role_permissions(permission_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles(role_id);
CREATE INDEX IF NOT EXISTS idx_permissions_resource_action ON permissions(resource, action);

-- Insert default roles
INSERT INTO roles (name, description, is_system) VALUES
    ('admin', 'Full system access', TRUE),
    ('user', 'Standard user access', TRUE),
    ('moderator', 'Moderation access', TRUE),
    ('viewer', 'Read-only access', TRUE)
ON CONFLICT (name) DO NOTHING;

-- Insert default permissions
INSERT INTO permissions (resource, action, description) VALUES
    -- Project permissions
    ('projects', 'create', 'Create new projects'),
    ('projects', 'read', 'View projects'),
    ('projects', 'update', 'Edit projects'),
    ('projects', 'delete', 'Delete projects'),
    ('projects', 'deploy', 'Deploy projects'),
    ('projects', 'export', 'Export projects'),

    -- User management permissions
    ('users', 'create', 'Create new users'),
    ('users', 'read', 'View users'),
    ('users', 'update', 'Edit users'),
    ('users', 'delete', 'Delete users'),
    ('users', 'manage_roles', 'Manage user roles'),

    -- Settings permissions
    ('settings', 'read', 'View settings'),
    ('settings', 'update', 'Update settings'),

    -- Analytics permissions
    ('analytics', 'read', 'View analytics'),

    -- Audit logs permissions
    ('audit_logs', 'read', 'View audit logs'),
    ('audit_logs', 'export', 'Export audit logs')
ON CONFLICT (resource, action) DO NOTHING;

-- Assign permissions to default roles

-- Admin: all permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'admin'
ON CONFLICT DO NOTHING;

-- User: basic project and own user permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'user'
AND (
    (p.resource = 'projects' AND p.action IN ('create', 'read', 'update', 'delete', 'deploy', 'export'))
    OR (p.resource = 'users' AND p.action = 'read')
    OR (p.resource = 'settings' AND p.action = 'read')
)
ON CONFLICT DO NOTHING;

-- Moderator: project and user management (no delete)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'moderator'
AND (
    (p.resource = 'projects')
    OR (p.resource = 'users' AND p.action IN ('read', 'update'))
    OR (p.resource = 'settings' AND p.action = 'read')
    OR (p.resource = 'analytics' AND p.action = 'read')
)
ON CONFLICT DO NOTHING;

-- Viewer: read-only access
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r, permissions p
WHERE r.name = 'viewer'
AND p.action = 'read'
ON CONFLICT DO NOTHING;

-- Audit Logs Schema

-- Audit logs table (immutable)
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(100) NOT NULL, -- e.g., 'user.login', 'project.created', 'settings.updated'
    event_category VARCHAR(50) NOT NULL, -- e.g., 'authentication', 'authorization', 'data_access'
    severity VARCHAR(20) NOT NULL, -- 'low', 'medium', 'high', 'critical'
    actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    actor_email VARCHAR(255),
    actor_ip VARCHAR(45),
    actor_user_agent TEXT,
    resource_type VARCHAR(100), -- e.g., 'project', 'user', 'setting'
    resource_id UUID,
    action VARCHAR(50) NOT NULL, -- e.g., 'create', 'read', 'update', 'delete'
    status VARCHAR(20) NOT NULL, -- 'success', 'failure', 'blocked'
    details JSONB, -- Additional event-specific data
    metadata JSONB, -- Request metadata (method, path, etc.)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Indexes for audit logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_event_type ON audit_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_category ON audit_logs(event_category);
CREATE INDEX IF NOT EXISTS idx_audit_logs_severity ON audit_logs(severity);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_email ON audit_logs(actor_email);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_status ON audit_logs(status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_created ON audit_logs(actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource_created ON audit_logs(resource_type, resource_id, created_at DESC);

-- Security events table (subset of audit logs for critical events)
CREATE TABLE IF NOT EXISTS security_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(100) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
    actor_ip VARCHAR(45),
    details JSONB,
    resolved BOOLEAN DEFAULT FALSE,
    resolved_at TIMESTAMP,
    resolved_by UUID REFERENCES users(id) ON DELETE SET NULL,
    resolution_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

-- Indexes for security events
CREATE INDEX IF NOT EXISTS idx_security_events_resolved ON security_events(resolved);
CREATE INDEX IF NOT EXISTS idx_security_events_severity ON security_events(severity);
CREATE INDEX IF NOT EXISTS idx_security_events_created_at ON security_events(created_at DESC);

-- API Keys table
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    key_hash VARCHAR(255) NOT NULL UNIQUE,
    key_prefix VARCHAR(10) NOT NULL, -- First 8 chars for identification
    scopes TEXT[], -- Array of allowed scopes/permissions
    rate_limit INTEGER DEFAULT 1000, -- Requests per hour
    last_used_at TIMESTAMP,
    expires_at TIMESTAMP,
    revoked BOOLEAN DEFAULT FALSE,
    revoked_at TIMESTAMP,
    revoked_by UUID REFERENCES users(id) ON DELETE SET NULL,
    revoked_reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for API keys
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys(key_prefix);
CREATE INDEX IF NOT EXISTS idx_api_keys_revoked ON api_keys(revoked);
CREATE INDEX IF NOT EXISTS idx_api_keys_expires ON api_keys(expires_at);

-- API key usage tracking
CREATE TABLE IF NOT EXISTS api_key_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    api_key_id UUID REFERENCES api_keys(id) ON DELETE CASCADE,
    endpoint VARCHAR(255),
    method VARCHAR(10),
    status_code INTEGER,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for API key usage
CREATE INDEX IF NOT EXISTS idx_api_key_usage_key ON api_key_usage(api_key_id);
CREATE INDEX IF NOT EXISTS idx_api_key_usage_created ON api_key_usage(created_at DESC);

-- Create partition for audit logs (optional - for high volume)
-- This will help with performance when you have millions of audit logs
-- Uncomment if needed:
-- CREATE TABLE audit_logs_y2025m01 PARTITION OF audit_logs
-- FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');

-- Function to automatically partition audit logs (optional)
CREATE OR REPLACE FUNCTION create_audit_log_partition()
RETURNS TRIGGER AS $$
DECLARE
    partition_date TEXT;
    partition_name TEXT;
    start_date TEXT;
    end_date TEXT;
BEGIN
    partition_date := to_char(NEW.created_at, 'YYYY_MM');
    partition_name := 'audit_logs_' || partition_date;
    start_date := to_char(date_trunc('month', NEW.created_at), 'YYYY-MM-DD');
    end_date := to_char(date_trunc('month', NEW.created_at) + interval '1 month', 'YYYY-MM-DD');

    -- Check if partition exists, create if not
    IF NOT EXISTS (
        SELECT 1 FROM pg_class WHERE relname = partition_name
    ) THEN
        EXECUTE format(
            'CREATE TABLE IF NOT EXISTS %I PARTITION OF audit_logs FOR VALUES FROM (%L) TO (%L)',
            partition_name, start_date, end_date
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for automatic partitioning (optional, commented out)
-- CREATE TRIGGER audit_logs_insert_trigger
-- BEFORE INSERT ON audit_logs
-- FOR EACH ROW EXECUTE FUNCTION create_audit_log_partition();

-- Add updated_at trigger for roles
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_roles_updated_at
BEFORE UPDATE ON roles
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_api_keys_updated_at
BEFORE UPDATE ON api_keys
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
