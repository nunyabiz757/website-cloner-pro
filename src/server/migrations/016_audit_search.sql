-- Migration: 016_audit_search.sql
-- Description: Advanced audit log search and filtering capabilities
-- Created: 2025-01-15

-- ============================================================================
-- EXTENSIONS
-- ============================================================================

-- Enable full-text search extension
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================================
-- INDEXES FOR ADVANCED SEARCH
-- ============================================================================

-- Full-text search indexes for audit_logs
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_trgm ON audit_logs USING gin (action gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_audit_logs_details_gin ON audit_logs USING gin (details jsonb_path_ops);
CREATE INDEX IF NOT EXISTS idx_audit_logs_metadata_gin ON audit_logs USING gin (metadata jsonb_path_ops);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_timestamp ON audit_logs(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_timestamp ON audit_logs(action, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource_timestamp ON audit_logs(resource_type, resource_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_ip_timestamp ON audit_logs(ip_address, timestamp DESC);

-- B-tree indexes for exact matches and ranges
CREATE INDEX IF NOT EXISTS idx_audit_logs_status ON audit_logs(status) WHERE status IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp_range ON audit_logs(timestamp DESC);

-- ============================================================================
-- TABLES
-- ============================================================================

-- Table: audit_log_exports
-- Tracks audit log export requests and files
CREATE TABLE IF NOT EXISTS audit_log_exports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    export_name VARCHAR(255) NOT NULL,
    export_format VARCHAR(20) NOT NULL, -- 'csv', 'json', 'pdf'
    filters JSONB,
    total_records INTEGER DEFAULT 0,
    file_path TEXT,
    file_size BIGINT,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    download_count INTEGER DEFAULT 0,
    last_downloaded_at TIMESTAMP,
    CONSTRAINT valid_export_format CHECK (export_format IN ('csv', 'json', 'pdf'))
);

-- Table: audit_log_saved_searches
-- Save frequently used search queries
CREATE TABLE IF NOT EXISTS audit_log_saved_searches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    search_name VARCHAR(255) NOT NULL,
    search_filters JSONB NOT NULL,
    is_public BOOLEAN DEFAULT FALSE,
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP,
    use_count INTEGER DEFAULT 0,
    CONSTRAINT unique_user_search_name UNIQUE (created_by, search_name)
);

-- Table: audit_log_bookmarks
-- Bookmark specific audit log entries for quick access
CREATE TABLE IF NOT EXISTS audit_log_bookmarks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    audit_log_id UUID NOT NULL REFERENCES audit_logs(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_user_bookmark UNIQUE (user_id, audit_log_id)
);

-- ============================================================================
-- INDEXES FOR NEW TABLES
-- ============================================================================

CREATE INDEX idx_audit_exports_created_by ON audit_log_exports(created_by);
CREATE INDEX idx_audit_exports_created_at ON audit_log_exports(created_at DESC);
CREATE INDEX idx_audit_exports_expires_at ON audit_log_exports(expires_at) WHERE expires_at IS NOT NULL;

CREATE INDEX idx_audit_saved_searches_user ON audit_log_saved_searches(created_by);
CREATE INDEX idx_audit_saved_searches_public ON audit_log_saved_searches(is_public) WHERE is_public = TRUE;

CREATE INDEX idx_audit_bookmarks_user ON audit_log_bookmarks(user_id);
CREATE INDEX idx_audit_bookmarks_audit_log ON audit_log_bookmarks(audit_log_id);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function: search_audit_logs
-- Advanced search with full-text and filter support
CREATE OR REPLACE FUNCTION search_audit_logs(
    p_search_query TEXT DEFAULT NULL,
    p_user_id UUID DEFAULT NULL,
    p_action TEXT DEFAULT NULL,
    p_resource_type TEXT DEFAULT NULL,
    p_resource_id UUID DEFAULT NULL,
    p_status TEXT DEFAULT NULL,
    p_ip_address VARCHAR(45) DEFAULT NULL,
    p_start_date TIMESTAMP DEFAULT NULL,
    p_end_date TIMESTAMP DEFAULT NULL,
    p_details_filter JSONB DEFAULT NULL,
    p_limit INTEGER DEFAULT 100,
    p_offset INTEGER DEFAULT 0,
    p_order_by TEXT DEFAULT 'timestamp',
    p_order_direction TEXT DEFAULT 'DESC'
)
RETURNS TABLE (
    id UUID,
    user_id UUID,
    username VARCHAR(100),
    action TEXT,
    resource_type VARCHAR(100),
    resource_id UUID,
    status VARCHAR(50),
    ip_address VARCHAR(45),
    user_agent TEXT,
    details JSONB,
    metadata JSONB,
    timestamp TIMESTAMP,
    relevance_score REAL
) AS $$
DECLARE
    query TEXT;
    order_clause TEXT;
BEGIN
    -- Build order clause
    order_clause := format('ORDER BY %I %s', p_order_by, p_order_direction);

    -- Build dynamic query
    query := 'SELECT
        al.id,
        al.user_id,
        u.username,
        al.action,
        al.resource_type,
        al.resource_id,
        al.status,
        al.ip_address,
        al.user_agent,
        al.details,
        al.metadata,
        al.timestamp,
        CASE
            WHEN $1 IS NOT NULL THEN
                similarity(al.action, $1) +
                COALESCE((al.details::text <-> $1)::numeric, 0) * 0.5
            ELSE 0
        END AS relevance_score
    FROM audit_logs al
    LEFT JOIN users u ON u.id = al.user_id
    WHERE 1=1';

    -- Add filters
    IF p_search_query IS NOT NULL THEN
        query := query || ' AND (
            al.action ILIKE ''%'' || $1 || ''%'' OR
            al.details::text ILIKE ''%'' || $1 || ''%'' OR
            al.metadata::text ILIKE ''%'' || $1 || ''%''
        )';
    END IF;

    IF p_user_id IS NOT NULL THEN
        query := query || ' AND al.user_id = $2';
    END IF;

    IF p_action IS NOT NULL THEN
        query := query || ' AND al.action = $3';
    END IF;

    IF p_resource_type IS NOT NULL THEN
        query := query || ' AND al.resource_type = $4';
    END IF;

    IF p_resource_id IS NOT NULL THEN
        query := query || ' AND al.resource_id = $5';
    END IF;

    IF p_status IS NOT NULL THEN
        query := query || ' AND al.status = $6';
    END IF;

    IF p_ip_address IS NOT NULL THEN
        query := query || ' AND al.ip_address = $7';
    END IF;

    IF p_start_date IS NOT NULL THEN
        query := query || ' AND al.timestamp >= $8';
    END IF;

    IF p_end_date IS NOT NULL THEN
        query := query || ' AND al.timestamp <= $9';
    END IF;

    IF p_details_filter IS NOT NULL THEN
        query := query || ' AND al.details @> $10';
    END IF;

    -- Add ordering and pagination
    query := query || ' ' || order_clause || ' LIMIT $11 OFFSET $12';

    -- Execute query
    RETURN QUERY EXECUTE query
    USING p_search_query, p_user_id, p_action, p_resource_type, p_resource_id,
          p_status, p_ip_address, p_start_date, p_end_date, p_details_filter,
          p_limit, p_offset;
END;
$$ LANGUAGE plpgsql;

-- Function: get_audit_log_statistics
-- Get comprehensive audit log statistics
CREATE OR REPLACE FUNCTION get_audit_log_statistics(
    p_start_date TIMESTAMP DEFAULT NULL,
    p_end_date TIMESTAMP DEFAULT NULL
)
RETURNS TABLE (
    total_logs BIGINT,
    unique_users BIGINT,
    unique_actions BIGINT,
    success_count BIGINT,
    failure_count BIGINT,
    warning_count BIGINT,
    most_common_action TEXT,
    most_active_user UUID,
    most_active_ip VARCHAR(45),
    logs_by_hour JSONB,
    logs_by_day JSONB,
    logs_by_action JSONB,
    logs_by_status JSONB
) AS $$
BEGIN
    RETURN QUERY
    WITH date_filtered AS (
        SELECT *
        FROM audit_logs
        WHERE (p_start_date IS NULL OR timestamp >= p_start_date)
          AND (p_end_date IS NULL OR timestamp <= p_end_date)
    ),
    stats AS (
        SELECT
            COUNT(*) as total,
            COUNT(DISTINCT user_id) as users,
            COUNT(DISTINCT action) as actions,
            COUNT(*) FILTER (WHERE status = 'success') as success,
            COUNT(*) FILTER (WHERE status = 'failure') as failure,
            COUNT(*) FILTER (WHERE status = 'warning') as warning
        FROM date_filtered
    ),
    top_action AS (
        SELECT action
        FROM date_filtered
        GROUP BY action
        ORDER BY COUNT(*) DESC
        LIMIT 1
    ),
    top_user AS (
        SELECT user_id
        FROM date_filtered
        WHERE user_id IS NOT NULL
        GROUP BY user_id
        ORDER BY COUNT(*) DESC
        LIMIT 1
    ),
    top_ip AS (
        SELECT ip_address
        FROM date_filtered
        WHERE ip_address IS NOT NULL
        GROUP BY ip_address
        ORDER BY COUNT(*) DESC
        LIMIT 1
    ),
    by_hour AS (
        SELECT jsonb_object_agg(hour, count) as data
        FROM (
            SELECT
                EXTRACT(HOUR FROM timestamp) as hour,
                COUNT(*) as count
            FROM date_filtered
            GROUP BY EXTRACT(HOUR FROM timestamp)
            ORDER BY hour
        ) h
    ),
    by_day AS (
        SELECT jsonb_object_agg(day, count) as data
        FROM (
            SELECT
                DATE(timestamp) as day,
                COUNT(*) as count
            FROM date_filtered
            GROUP BY DATE(timestamp)
            ORDER BY day
        ) d
    ),
    by_action AS (
        SELECT jsonb_object_agg(action, count) as data
        FROM (
            SELECT
                action,
                COUNT(*) as count
            FROM date_filtered
            GROUP BY action
            ORDER BY count DESC
            LIMIT 20
        ) a
    ),
    by_status AS (
        SELECT jsonb_object_agg(status, count) as data
        FROM (
            SELECT
                COALESCE(status, 'unknown') as status,
                COUNT(*) as count
            FROM date_filtered
            GROUP BY status
        ) s
    )
    SELECT
        stats.total,
        stats.users,
        stats.actions,
        stats.success,
        stats.failure,
        stats.warning,
        top_action.action,
        top_user.user_id,
        top_ip.ip_address,
        by_hour.data,
        by_day.data,
        by_action.data,
        by_status.data
    FROM stats, top_action, top_user, top_ip, by_hour, by_day, by_action, by_status;
END;
$$ LANGUAGE plpgsql;

-- Function: get_user_audit_timeline
-- Get timeline of user activities
CREATE OR REPLACE FUNCTION get_user_audit_timeline(
    p_user_id UUID,
    p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
    id UUID,
    action TEXT,
    resource_type VARCHAR(100),
    resource_id UUID,
    status VARCHAR(50),
    timestamp TIMESTAMP,
    details JSONB,
    time_since_previous INTERVAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        al.id,
        al.action,
        al.resource_type,
        al.resource_id,
        al.status,
        al.timestamp,
        al.details,
        al.timestamp - LAG(al.timestamp) OVER (ORDER BY al.timestamp) as time_since_previous
    FROM audit_logs al
    WHERE al.user_id = p_user_id
    ORDER BY al.timestamp DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function: get_resource_audit_history
-- Get complete history for a specific resource
CREATE OR REPLACE FUNCTION get_resource_audit_history(
    p_resource_type VARCHAR(100),
    p_resource_id UUID,
    p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
    id UUID,
    user_id UUID,
    username VARCHAR(100),
    action TEXT,
    status VARCHAR(50),
    timestamp TIMESTAMP,
    details JSONB,
    ip_address VARCHAR(45)
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        al.id,
        al.user_id,
        u.username,
        al.action,
        al.status,
        al.timestamp,
        al.details,
        al.ip_address
    FROM audit_logs al
    LEFT JOIN users u ON u.id = al.user_id
    WHERE al.resource_type = p_resource_type
      AND al.resource_id = p_resource_id
    ORDER BY al.timestamp DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function: get_audit_logs_by_ip
-- Get all audit logs from a specific IP address
CREATE OR REPLACE FUNCTION get_audit_logs_by_ip(
    p_ip_address VARCHAR(45),
    p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
    id UUID,
    user_id UUID,
    username VARCHAR(100),
    action TEXT,
    resource_type VARCHAR(100),
    status VARCHAR(50),
    timestamp TIMESTAMP,
    user_agent TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        al.id,
        al.user_id,
        u.username,
        al.action,
        al.resource_type,
        al.status,
        al.timestamp,
        al.user_agent
    FROM audit_logs al
    LEFT JOIN users u ON u.id = al.user_id
    WHERE al.ip_address = p_ip_address
    ORDER BY al.timestamp DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function: get_failed_actions
-- Get all failed actions within a time range
CREATE OR REPLACE FUNCTION get_failed_actions(
    p_start_date TIMESTAMP DEFAULT NULL,
    p_end_date TIMESTAMP DEFAULT NULL,
    p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
    id UUID,
    user_id UUID,
    username VARCHAR(100),
    action TEXT,
    resource_type VARCHAR(100),
    resource_id UUID,
    timestamp TIMESTAMP,
    details JSONB,
    ip_address VARCHAR(45)
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        al.id,
        al.user_id,
        u.username,
        al.action,
        al.resource_type,
        al.resource_id,
        al.timestamp,
        al.details,
        al.ip_address
    FROM audit_logs al
    LEFT JOIN users u ON u.id = al.user_id
    WHERE al.status = 'failure'
      AND (p_start_date IS NULL OR al.timestamp >= p_start_date)
      AND (p_end_date IS NULL OR al.timestamp <= p_end_date)
    ORDER BY al.timestamp DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function: get_suspicious_activities
-- Detect potentially suspicious activities
CREATE OR REPLACE FUNCTION get_suspicious_activities(
    p_lookback_hours INTEGER DEFAULT 24,
    p_limit INTEGER DEFAULT 100
)
RETURNS TABLE (
    pattern_type TEXT,
    user_id UUID,
    username VARCHAR(100),
    ip_address VARCHAR(45),
    activity_count BIGINT,
    first_seen TIMESTAMP,
    last_seen TIMESTAMP,
    sample_actions TEXT[]
) AS $$
BEGIN
    RETURN QUERY
    -- Multiple failed login attempts
    SELECT
        'multiple_failed_logins'::TEXT as pattern_type,
        al.user_id,
        u.username,
        al.ip_address,
        COUNT(*) as activity_count,
        MIN(al.timestamp) as first_seen,
        MAX(al.timestamp) as last_seen,
        ARRAY_AGG(DISTINCT al.action ORDER BY al.action) as sample_actions
    FROM audit_logs al
    LEFT JOIN users u ON u.id = al.user_id
    WHERE al.action LIKE '%login%'
      AND al.status = 'failure'
      AND al.timestamp >= NOW() - (p_lookback_hours || ' hours')::INTERVAL
    GROUP BY al.user_id, u.username, al.ip_address
    HAVING COUNT(*) >= 5

    UNION ALL

    -- High volume of requests from single IP
    SELECT
        'high_volume_requests'::TEXT as pattern_type,
        al.user_id,
        u.username,
        al.ip_address,
        COUNT(*) as activity_count,
        MIN(al.timestamp) as first_seen,
        MAX(al.timestamp) as last_seen,
        ARRAY_AGG(DISTINCT al.action ORDER BY al.action LIMIT 5) as sample_actions
    FROM audit_logs al
    LEFT JOIN users u ON u.id = al.user_id
    WHERE al.timestamp >= NOW() - (p_lookback_hours || ' hours')::INTERVAL
    GROUP BY al.user_id, u.username, al.ip_address
    HAVING COUNT(*) >= 100

    UNION ALL

    -- Access from multiple IPs for same user
    SELECT
        'multiple_ips'::TEXT as pattern_type,
        al.user_id,
        u.username,
        NULL::VARCHAR(45) as ip_address,
        COUNT(DISTINCT al.ip_address) as activity_count,
        MIN(al.timestamp) as first_seen,
        MAX(al.timestamp) as last_seen,
        ARRAY_AGG(DISTINCT al.ip_address ORDER BY al.ip_address LIMIT 5) as sample_actions
    FROM audit_logs al
    LEFT JOIN users u ON u.id = al.user_id
    WHERE al.user_id IS NOT NULL
      AND al.timestamp >= NOW() - (p_lookback_hours || ' hours')::INTERVAL
    GROUP BY al.user_id, u.username
    HAVING COUNT(DISTINCT al.ip_address) >= 5

    ORDER BY last_seen DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function: cleanup_old_exports
-- Remove expired export files
CREATE OR REPLACE FUNCTION cleanup_old_exports()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM audit_log_exports
    WHERE expires_at IS NOT NULL
      AND expires_at < CURRENT_TIMESTAMP;

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Trigger: update_saved_search_timestamp
CREATE OR REPLACE FUNCTION update_saved_search_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_saved_search_timestamp
    BEFORE UPDATE ON audit_log_saved_searches
    FOR EACH ROW
    EXECUTE FUNCTION update_saved_search_timestamp();

-- ============================================================================
-- VIEWS
-- ============================================================================

-- View: audit_log_summary
CREATE OR REPLACE VIEW audit_log_summary AS
SELECT
    DATE(timestamp) as log_date,
    COUNT(*) as total_logs,
    COUNT(DISTINCT user_id) as unique_users,
    COUNT(DISTINCT action) as unique_actions,
    COUNT(*) FILTER (WHERE status = 'success') as success_count,
    COUNT(*) FILTER (WHERE status = 'failure') as failure_count,
    COUNT(DISTINCT ip_address) as unique_ips
FROM audit_logs
GROUP BY DATE(timestamp)
ORDER BY log_date DESC;

-- View: recent_failed_actions
CREATE OR REPLACE VIEW recent_failed_actions AS
SELECT
    al.id,
    al.user_id,
    u.username,
    al.action,
    al.resource_type,
    al.timestamp,
    al.ip_address,
    al.details
FROM audit_logs al
LEFT JOIN users u ON u.id = al.user_id
WHERE al.status = 'failure'
  AND al.timestamp >= NOW() - INTERVAL '24 hours'
ORDER BY al.timestamp DESC;

-- View: user_activity_summary
CREATE OR REPLACE VIEW user_activity_summary AS
SELECT
    u.id as user_id,
    u.username,
    COUNT(al.id) as total_actions,
    COUNT(DISTINCT al.action) as unique_actions,
    MAX(al.timestamp) as last_activity,
    COUNT(*) FILTER (WHERE al.status = 'failure') as failed_actions,
    COUNT(DISTINCT al.ip_address) as unique_ips
FROM users u
LEFT JOIN audit_logs al ON al.user_id = u.id
GROUP BY u.id, u.username;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE audit_log_exports IS 'Tracks audit log export requests and generated files';
COMMENT ON TABLE audit_log_saved_searches IS 'Stores frequently used search queries for quick access';
COMMENT ON TABLE audit_log_bookmarks IS 'User bookmarks for important audit log entries';

COMMENT ON FUNCTION search_audit_logs IS 'Advanced audit log search with full-text and multi-filter support';
COMMENT ON FUNCTION get_audit_log_statistics IS 'Comprehensive statistics for audit logs';
COMMENT ON FUNCTION get_user_audit_timeline IS 'Timeline of user activities with time gaps';
COMMENT ON FUNCTION get_resource_audit_history IS 'Complete history for a specific resource';
COMMENT ON FUNCTION get_audit_logs_by_ip IS 'All audit logs from a specific IP address';
COMMENT ON FUNCTION get_failed_actions IS 'Failed actions within a time range';
COMMENT ON FUNCTION get_suspicious_activities IS 'Detect potentially suspicious activity patterns';
COMMENT ON FUNCTION cleanup_old_exports IS 'Remove expired export files';
