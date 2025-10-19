-- Cookie Tracking Migration
-- Creates table for tracking and monitoring cookies

-- Cookie Tracking Table
CREATE TABLE IF NOT EXISTS cookie_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    cookie_name VARCHAR(255) NOT NULL,
    cookie_value_hash VARCHAR(64) NOT NULL, -- SHA-256 hash of cookie value
    ip_address VARCHAR(45),
    user_agent TEXT,
    expires_at TIMESTAMP,
    is_secure BOOLEAN DEFAULT FALSE,
    is_http_only BOOLEAN DEFAULT FALSE,
    same_site VARCHAR(20), -- 'strict', 'lax', 'none'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_accessed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    access_count INTEGER DEFAULT 1,

    -- Unique constraint to prevent duplicate tracking entries
    UNIQUE(cookie_name, cookie_value_hash)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_cookie_tracking_user_id ON cookie_tracking(user_id);
CREATE INDEX IF NOT EXISTS idx_cookie_tracking_cookie_name ON cookie_tracking(cookie_name);
CREATE INDEX IF NOT EXISTS idx_cookie_tracking_expires_at ON cookie_tracking(expires_at);
CREATE INDEX IF NOT EXISTS idx_cookie_tracking_created_at ON cookie_tracking(created_at);
CREATE INDEX IF NOT EXISTS idx_cookie_tracking_ip_address ON cookie_tracking(ip_address);
CREATE INDEX IF NOT EXISTS idx_cookie_tracking_is_secure ON cookie_tracking(is_secure);
CREATE INDEX IF NOT EXISTS idx_cookie_tracking_last_accessed ON cookie_tracking(last_accessed);

-- Composite index for common queries
CREATE INDEX IF NOT EXISTS idx_cookie_tracking_user_name ON cookie_tracking(user_id, cookie_name);

-- Function to cleanup expired cookies
CREATE OR REPLACE FUNCTION cleanup_expired_cookies()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM cookie_tracking
    WHERE expires_at IS NOT NULL
    AND expires_at < NOW();

    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to cleanup orphaned cookies
CREATE OR REPLACE FUNCTION cleanup_orphaned_cookies()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM cookie_tracking ct
    WHERE ct.user_id IS NOT NULL
    AND NOT EXISTS (
        SELECT 1 FROM users u WHERE u.id = ct.user_id
    );

    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get cookie statistics
CREATE OR REPLACE FUNCTION get_cookie_statistics()
RETURNS TABLE (
    total_cookies BIGINT,
    secure_cookies BIGINT,
    http_only_cookies BIGINT,
    expired_cookies BIGINT,
    active_cookies BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*)::BIGINT as total_cookies,
        COUNT(*) FILTER (WHERE is_secure = TRUE)::BIGINT as secure_cookies,
        COUNT(*) FILTER (WHERE is_http_only = TRUE)::BIGINT as http_only_cookies,
        COUNT(*) FILTER (WHERE expires_at IS NOT NULL AND expires_at < NOW())::BIGINT as expired_cookies,
        COUNT(*) FILTER (WHERE expires_at IS NULL OR expires_at >= NOW())::BIGINT as active_cookies
    FROM cookie_tracking;
END;
$$ LANGUAGE plpgsql;

-- Function to find suspicious cookie patterns
CREATE OR REPLACE FUNCTION find_suspicious_cookies()
RETURNS TABLE (
    cookie_name VARCHAR,
    access_count INTEGER,
    created_at TIMESTAMP,
    reason VARCHAR
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ct.cookie_name,
        ct.access_count,
        ct.created_at,
        'High access count' as reason
    FROM cookie_tracking ct
    WHERE ct.access_count > 1000
    AND ct.created_at > NOW() - INTERVAL '1 hour'
    ORDER BY ct.access_count DESC
    LIMIT 50;
END;
$$ LANGUAGE plpgsql;

-- Function to get cookie security score
CREATE OR REPLACE FUNCTION get_cookie_security_score()
RETURNS TABLE (
    score NUMERIC,
    total_cookies BIGINT,
    secure_percentage NUMERIC,
    http_only_percentage NUMERIC,
    same_site_percentage NUMERIC
) AS $$
DECLARE
    total BIGINT;
    secure_count BIGINT;
    http_only_count BIGINT;
    same_site_count BIGINT;
    calculated_score NUMERIC;
BEGIN
    SELECT COUNT(*) INTO total FROM cookie_tracking;

    IF total = 0 THEN
        RETURN QUERY SELECT 0::NUMERIC, 0::BIGINT, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC;
        RETURN;
    END IF;

    SELECT COUNT(*) INTO secure_count FROM cookie_tracking WHERE is_secure = TRUE;
    SELECT COUNT(*) INTO http_only_count FROM cookie_tracking WHERE is_http_only = TRUE;
    SELECT COUNT(*) INTO same_site_count FROM cookie_tracking WHERE same_site IS NOT NULL;

    calculated_score :=
        (secure_count::NUMERIC / total * 40) +
        (http_only_count::NUMERIC / total * 35) +
        (same_site_count::NUMERIC / total * 25);

    RETURN QUERY
    SELECT
        ROUND(calculated_score, 2) as score,
        total as total_cookies,
        ROUND((secure_count::NUMERIC / total * 100), 2) as secure_percentage,
        ROUND((http_only_count::NUMERIC / total * 100), 2) as http_only_percentage,
        ROUND((same_site_count::NUMERIC / total * 100), 2) as same_site_percentage;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update last_accessed timestamp
CREATE OR REPLACE FUNCTION update_cookie_last_accessed()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_accessed = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_cookie_last_accessed
BEFORE UPDATE ON cookie_tracking
FOR EACH ROW
WHEN (OLD.access_count < NEW.access_count)
EXECUTE FUNCTION update_cookie_last_accessed();

-- View for cookie security compliance
CREATE OR REPLACE VIEW cookie_security_compliance AS
SELECT
    cookie_name,
    COUNT(*) as total_count,
    COUNT(*) FILTER (WHERE is_secure = TRUE) as secure_count,
    COUNT(*) FILTER (WHERE is_http_only = TRUE) as http_only_count,
    COUNT(*) FILTER (WHERE same_site IS NOT NULL) as same_site_count,
    ROUND((COUNT(*) FILTER (WHERE is_secure = TRUE)::NUMERIC / COUNT(*) * 100), 2) as secure_percentage,
    ROUND((COUNT(*) FILTER (WHERE is_http_only = TRUE)::NUMERIC / COUNT(*) * 100), 2) as http_only_percentage,
    ROUND((COUNT(*) FILTER (WHERE same_site IS NOT NULL)::NUMERIC / COUNT(*) * 100), 2) as same_site_percentage
FROM cookie_tracking
GROUP BY cookie_name
ORDER BY total_count DESC;

-- View for high-risk cookies
CREATE OR REPLACE VIEW high_risk_cookies AS
SELECT
    ct.cookie_name,
    ct.user_id,
    ct.ip_address,
    ct.access_count,
    ct.is_secure,
    ct.is_http_only,
    ct.same_site,
    ct.created_at,
    ct.last_accessed,
    CASE
        WHEN ct.is_secure = FALSE AND ct.is_http_only = FALSE THEN 'CRITICAL'
        WHEN ct.is_secure = FALSE OR ct.is_http_only = FALSE THEN 'HIGH'
        WHEN ct.same_site IS NULL THEN 'MEDIUM'
        ELSE 'LOW'
    END as risk_level
FROM cookie_tracking ct
WHERE
    ct.is_secure = FALSE
    OR ct.is_http_only = FALSE
    OR ct.same_site IS NULL
ORDER BY
    CASE
        WHEN ct.is_secure = FALSE AND ct.is_http_only = FALSE THEN 1
        WHEN ct.is_secure = FALSE OR ct.is_http_only = FALSE THEN 2
        WHEN ct.same_site IS NULL THEN 3
        ELSE 4
    END,
    ct.access_count DESC;

-- View for cookie usage by user
CREATE OR REPLACE VIEW cookie_usage_by_user AS
SELECT
    u.id as user_id,
    u.email,
    COUNT(DISTINCT ct.cookie_name) as unique_cookies,
    SUM(ct.access_count) as total_accesses,
    MAX(ct.last_accessed) as last_cookie_access,
    COUNT(*) FILTER (WHERE ct.is_secure = TRUE) as secure_cookies,
    COUNT(*) FILTER (WHERE ct.is_secure = FALSE) as non_secure_cookies
FROM users u
LEFT JOIN cookie_tracking ct ON u.id = ct.user_id
GROUP BY u.id, u.email
HAVING COUNT(ct.id) > 0
ORDER BY unique_cookies DESC;

-- Materialized view for cookie analytics (refresh periodically)
CREATE MATERIALIZED VIEW IF NOT EXISTS cookie_analytics_summary AS
SELECT
    DATE_TRUNC('day', created_at) as day,
    cookie_name,
    COUNT(*) as created_count,
    SUM(access_count) as total_accesses,
    AVG(access_count) as avg_access_count,
    COUNT(*) FILTER (WHERE is_secure = TRUE) as secure_count,
    COUNT(*) FILTER (WHERE is_http_only = TRUE) as http_only_count,
    COUNT(DISTINCT user_id) as unique_users,
    COUNT(DISTINCT ip_address) as unique_ips
FROM cookie_tracking
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE_TRUNC('day', created_at), cookie_name;

-- Create unique index for concurrent refresh
CREATE UNIQUE INDEX IF NOT EXISTS idx_cookie_analytics_summary_unique
ON cookie_analytics_summary (day, cookie_name);

-- Function to refresh analytics
CREATE OR REPLACE FUNCTION refresh_cookie_analytics()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY cookie_analytics_summary;
END;
$$ LANGUAGE plpgsql;

-- Grant necessary permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON cookie_tracking TO PUBLIC;
GRANT SELECT ON cookie_security_compliance TO PUBLIC;
GRANT SELECT ON high_risk_cookies TO PUBLIC;
GRANT SELECT ON cookie_usage_by_user TO PUBLIC;

-- Add comments for documentation
COMMENT ON TABLE cookie_tracking IS 'Tracks all cookies for security monitoring and compliance';
COMMENT ON COLUMN cookie_tracking.cookie_value_hash IS 'SHA-256 hash of cookie value for tracking without storing actual value';
COMMENT ON COLUMN cookie_tracking.access_count IS 'Number of times this cookie has been accessed';
COMMENT ON VIEW cookie_security_compliance IS 'Shows security compliance metrics for each cookie type';
COMMENT ON VIEW high_risk_cookies IS 'Lists cookies with security vulnerabilities';
COMMENT ON FUNCTION get_cookie_security_score() IS 'Calculates overall cookie security score (0-100)';
