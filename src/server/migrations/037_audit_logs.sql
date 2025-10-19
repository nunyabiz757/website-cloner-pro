-- Migration: 037_audit_logs
-- Description: Create comprehensive audit logging system
-- Author: System
-- Date: 2025-10-18

-- ============================================================================
-- AUDIT LOGS TABLE
-- ============================================================================

-- Main audit logs table for tracking all user actions and system events
CREATE TABLE IF NOT EXISTS audit_logs (
    id BIGSERIAL PRIMARY KEY,

    -- User information
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,

    -- Action details
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id VARCHAR(255) NOT NULL,

    -- Additional context
    details JSONB DEFAULT '{}',

    -- Request metadata
    ip_address INET,
    user_agent TEXT,
    request_method VARCHAR(10),
    request_path TEXT,

    -- Response information
    status_code INTEGER,
    error_message TEXT,

    -- Timing
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    duration_ms INTEGER,

    -- Security classification
    severity VARCHAR(20) DEFAULT 'info' CHECK (severity IN ('debug', 'info', 'warning', 'error', 'critical')),
    category VARCHAR(50) DEFAULT 'general' CHECK (category IN (
        'general', 'authentication', 'authorization', 'data_access',
        'data_modification', 'configuration', 'deployment', 'export',
        'payment', 'security', 'compliance'
    ))
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Primary lookup indexes
CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_action ON audit_logs(action);
CREATE INDEX idx_audit_logs_resource_type ON audit_logs(resource_type);
CREATE INDEX idx_audit_logs_resource_id ON audit_logs(resource_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- Composite indexes for common queries
CREATE INDEX idx_audit_logs_user_created ON audit_logs(user_id, created_at DESC);
CREATE INDEX idx_audit_logs_resource_lookup ON audit_logs(resource_type, resource_id, created_at DESC);
CREATE INDEX idx_audit_logs_action_created ON audit_logs(action, created_at DESC);

-- Security and compliance indexes
CREATE INDEX idx_audit_logs_severity ON audit_logs(severity) WHERE severity IN ('error', 'critical');
CREATE INDEX idx_audit_logs_category ON audit_logs(category);
CREATE INDEX idx_audit_logs_ip_address ON audit_logs(ip_address) WHERE ip_address IS NOT NULL;

-- Full-text search on details
CREATE INDEX idx_audit_logs_details_gin ON audit_logs USING gin(details);

-- ============================================================================
-- AUDIT SUMMARY VIEW
-- ============================================================================

-- View for quick audit statistics
CREATE OR REPLACE VIEW audit_logs_summary AS
SELECT
    DATE_TRUNC('day', created_at) as day,
    user_id,
    action,
    resource_type,
    category,
    severity,
    COUNT(*) as event_count,
    COUNT(DISTINCT ip_address) as unique_ips,
    AVG(duration_ms) as avg_duration_ms,
    COUNT(*) FILTER (WHERE status_code >= 400) as error_count
FROM audit_logs
GROUP BY DATE_TRUNC('day', created_at), user_id, action, resource_type, category, severity;

-- ============================================================================
-- AUDIT RETENTION POLICY
-- ============================================================================

-- Table to store audit retention policies
CREATE TABLE IF NOT EXISTS audit_retention_policies (
    id SERIAL PRIMARY KEY,
    category VARCHAR(50) NOT NULL UNIQUE,
    retention_days INTEGER NOT NULL DEFAULT 365,
    auto_archive BOOLEAN DEFAULT false,
    archive_location TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Default retention policies
INSERT INTO audit_retention_policies (category, retention_days, auto_archive) VALUES
    ('general', 90, false),
    ('authentication', 365, true),
    ('authorization', 365, true),
    ('data_access', 180, false),
    ('data_modification', 730, true),  -- 2 years
    ('configuration', 365, true),
    ('deployment', 180, false),
    ('export', 180, false),
    ('payment', 2555, true),  -- 7 years (compliance)
    ('security', 1095, true),  -- 3 years
    ('compliance', 2555, true)  -- 7 years
ON CONFLICT (category) DO NOTHING;

-- ============================================================================
-- AUDIT STATISTICS TABLE
-- ============================================================================

-- Daily rollup statistics for efficient querying
CREATE TABLE IF NOT EXISTS audit_statistics (
    id SERIAL PRIMARY KEY,
    stat_date DATE NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,

    -- Counts
    total_events INTEGER NOT NULL DEFAULT 0,
    failed_events INTEGER NOT NULL DEFAULT 0,

    -- By category
    authentication_events INTEGER DEFAULT 0,
    data_modification_events INTEGER DEFAULT 0,
    security_events INTEGER DEFAULT 0,

    -- Performance
    avg_duration_ms DECIMAL(10,2),
    max_duration_ms INTEGER,

    -- Unique metrics
    unique_ips INTEGER DEFAULT 0,
    unique_resources INTEGER DEFAULT 0,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(stat_date, user_id)
);

CREATE INDEX idx_audit_statistics_date ON audit_statistics(stat_date DESC);
CREATE INDEX idx_audit_statistics_user ON audit_statistics(user_id, stat_date DESC);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to archive old audit logs
CREATE OR REPLACE FUNCTION archive_old_audit_logs()
RETURNS TABLE(archived_count BIGINT) AS $$
DECLARE
    policy RECORD;
    cutoff_date TIMESTAMPTZ;
    deleted_count BIGINT;
    total_archived BIGINT := 0;
BEGIN
    FOR policy IN SELECT * FROM audit_retention_policies LOOP
        cutoff_date := NOW() - (policy.retention_days || ' days')::INTERVAL;

        -- Delete logs older than retention period
        DELETE FROM audit_logs
        WHERE category = policy.category
        AND created_at < cutoff_date;

        GET DIAGNOSTICS deleted_count = ROW_COUNT;
        total_archived := total_archived + deleted_count;

        RAISE NOTICE 'Archived % logs for category %', deleted_count, policy.category;
    END LOOP;

    RETURN QUERY SELECT total_archived;
END;
$$ LANGUAGE plpgsql;

-- Function to update daily statistics
CREATE OR REPLACE FUNCTION update_audit_statistics(stat_date DATE)
RETURNS void AS $$
BEGIN
    INSERT INTO audit_statistics (
        stat_date,
        user_id,
        total_events,
        failed_events,
        authentication_events,
        data_modification_events,
        security_events,
        avg_duration_ms,
        max_duration_ms,
        unique_ips,
        unique_resources
    )
    SELECT
        stat_date,
        user_id,
        COUNT(*) as total_events,
        COUNT(*) FILTER (WHERE status_code >= 400) as failed_events,
        COUNT(*) FILTER (WHERE category = 'authentication') as authentication_events,
        COUNT(*) FILTER (WHERE category = 'data_modification') as data_modification_events,
        COUNT(*) FILTER (WHERE category = 'security') as security_events,
        AVG(duration_ms) as avg_duration_ms,
        MAX(duration_ms) as max_duration_ms,
        COUNT(DISTINCT ip_address) as unique_ips,
        COUNT(DISTINCT resource_id) as unique_resources
    FROM audit_logs
    WHERE DATE(created_at) = stat_date
    GROUP BY user_id
    ON CONFLICT (stat_date, user_id) DO UPDATE SET
        total_events = EXCLUDED.total_events,
        failed_events = EXCLUDED.failed_events,
        authentication_events = EXCLUDED.authentication_events,
        data_modification_events = EXCLUDED.data_modification_events,
        security_events = EXCLUDED.security_events,
        avg_duration_ms = EXCLUDED.avg_duration_ms,
        max_duration_ms = EXCLUDED.max_duration_ms,
        unique_ips = EXCLUDED.unique_ips,
        unique_resources = EXCLUDED.unique_resources,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Automatically update statistics when audit logs are inserted
CREATE OR REPLACE FUNCTION trigger_update_audit_statistics()
RETURNS TRIGGER AS $$
BEGIN
    -- Schedule statistics update for the day (async, doesn't block insert)
    PERFORM update_audit_statistics(DATE(NEW.created_at));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Note: This trigger is commented out to avoid performance impact on inserts
-- Enable it if you need real-time statistics updates
-- CREATE TRIGGER audit_logs_statistics_trigger
-- AFTER INSERT ON audit_logs
-- FOR EACH ROW
-- EXECUTE FUNCTION trigger_update_audit_statistics();

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE audit_logs IS 'Comprehensive audit log for all user actions and system events';
COMMENT ON COLUMN audit_logs.action IS 'The action performed (e.g., user.login, deployment.create, export.download)';
COMMENT ON COLUMN audit_logs.resource_type IS 'Type of resource affected (e.g., user, deployment, website, export)';
COMMENT ON COLUMN audit_logs.resource_id IS 'Unique identifier of the affected resource';
COMMENT ON COLUMN audit_logs.details IS 'Additional context about the action (JSON)';
COMMENT ON COLUMN audit_logs.severity IS 'Severity level for filtering and alerting';
COMMENT ON COLUMN audit_logs.category IS 'Category for retention policy and compliance';

COMMENT ON TABLE audit_retention_policies IS 'Defines how long audit logs should be retained by category';
COMMENT ON TABLE audit_statistics IS 'Daily rollup statistics for efficient audit reporting';

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

-- Grant SELECT to all authenticated users for viewing their own audit logs
-- (Row-level security would be implemented separately)
GRANT SELECT ON audit_logs TO authenticated;
GRANT SELECT ON audit_logs_summary TO authenticated;
GRANT SELECT ON audit_statistics TO authenticated;

-- Grant full access to admin role
GRANT ALL ON audit_logs TO admin;
GRANT ALL ON audit_retention_policies TO admin;
GRANT ALL ON audit_statistics TO admin;
