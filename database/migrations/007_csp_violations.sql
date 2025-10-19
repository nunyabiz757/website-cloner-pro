-- CSP Violation Reporting Migration
-- Creates tables and functions for Content Security Policy violation tracking

-- CSP Violations Table
CREATE TABLE IF NOT EXISTS csp_violations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Violation Details
    document_uri TEXT NOT NULL,
    violated_directive TEXT NOT NULL,
    effective_directive TEXT,
    original_policy TEXT,
    blocked_uri TEXT,
    status_code INTEGER,

    -- Source Information
    source_file TEXT,
    line_number INTEGER,
    column_number INTEGER,

    -- Request Context
    referrer TEXT,
    user_agent TEXT,
    ip_address VARCHAR(45),

    -- User Context (if authenticated)
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,

    -- Disposition
    disposition VARCHAR(20), -- 'enforce' or 'report'

    -- Sample (for script violations)
    script_sample TEXT,

    -- Metadata
    severity VARCHAR(20) DEFAULT 'medium', -- 'low', 'medium', 'high', 'critical'
    is_reviewed BOOLEAN DEFAULT FALSE,
    is_false_positive BOOLEAN DEFAULT FALSE,
    notes TEXT,

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TIMESTAMP,
    reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,

    -- Indexes
    INDEX idx_csp_violations_created_at (created_at),
    INDEX idx_csp_violations_violated_directive (violated_directive),
    INDEX idx_csp_violations_blocked_uri (blocked_uri),
    INDEX idx_csp_violations_document_uri (document_uri),
    INDEX idx_csp_violations_user_id (user_id),
    INDEX idx_csp_violations_ip_address (ip_address),
    INDEX idx_csp_violations_severity (severity),
    INDEX idx_csp_violations_is_reviewed (is_reviewed)
);

-- CSP Violation Patterns Table (for tracking repeated violations)
CREATE TABLE IF NOT EXISTS csp_violation_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Pattern Identification
    pattern_hash VARCHAR(64) UNIQUE NOT NULL, -- SHA-256 of key fields
    violated_directive TEXT NOT NULL,
    blocked_uri TEXT,
    document_uri TEXT,

    -- Statistics
    occurrence_count INTEGER DEFAULT 1,
    first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Status
    is_whitelisted BOOLEAN DEFAULT FALSE,
    is_critical BOOLEAN DEFAULT FALSE,

    -- Action taken
    action_taken VARCHAR(50), -- 'ignored', 'policy_updated', 'blocked', 'investigated'

    -- Metadata
    notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_csp_patterns_pattern_hash (pattern_hash),
    INDEX idx_csp_patterns_directive (violated_directive),
    INDEX idx_csp_patterns_count (occurrence_count),
    INDEX idx_csp_patterns_last_seen (last_seen)
);

-- CSP Violation Alerts Table
CREATE TABLE IF NOT EXISTS csp_violation_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Alert Details
    alert_type VARCHAR(50) NOT NULL, -- 'threshold_exceeded', 'new_pattern', 'critical_violation'
    severity VARCHAR(20) NOT NULL,
    message TEXT NOT NULL,

    -- Related Violation/Pattern
    violation_id UUID REFERENCES csp_violations(id) ON DELETE CASCADE,
    pattern_id UUID REFERENCES csp_violation_patterns(id) ON DELETE CASCADE,

    -- Alert Status
    is_acknowledged BOOLEAN DEFAULT FALSE,
    acknowledged_at TIMESTAMP,
    acknowledged_by UUID REFERENCES users(id) ON DELETE SET NULL,

    -- Notification Status
    notification_sent BOOLEAN DEFAULT FALSE,
    notification_sent_at TIMESTAMP,
    notification_method VARCHAR(50), -- 'email', 'slack', 'webhook'

    -- Timestamps
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_csp_alerts_created_at (created_at),
    INDEX idx_csp_alerts_acknowledged (is_acknowledged),
    INDEX idx_csp_alerts_severity (severity)
);

-- Function to cleanup old CSP violations
CREATE OR REPLACE FUNCTION cleanup_old_csp_violations(retention_days INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Delete old violations that have been reviewed
    DELETE FROM csp_violations
    WHERE created_at < NOW() - (retention_days || ' days')::INTERVAL
    AND is_reviewed = TRUE;

    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get CSP violation statistics
CREATE OR REPLACE FUNCTION get_csp_violation_stats(days INTEGER DEFAULT 7)
RETURNS TABLE (
    total_violations BIGINT,
    unique_patterns BIGINT,
    critical_violations BIGINT,
    unreviewed_violations BIGINT,
    top_directive VARCHAR,
    top_blocked_uri TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*)::BIGINT as total_violations,
        COUNT(DISTINCT violated_directive || ':' || COALESCE(blocked_uri, ''))::BIGINT as unique_patterns,
        COUNT(*) FILTER (WHERE severity = 'critical')::BIGINT as critical_violations,
        COUNT(*) FILTER (WHERE is_reviewed = FALSE)::BIGINT as unreviewed_violations,
        (
            SELECT violated_directive
            FROM csp_violations
            WHERE created_at >= NOW() - (days || ' days')::INTERVAL
            GROUP BY violated_directive
            ORDER BY COUNT(*) DESC
            LIMIT 1
        ) as top_directive,
        (
            SELECT blocked_uri
            FROM csp_violations
            WHERE created_at >= NOW() - (days || ' days')::INTERVAL
            AND blocked_uri IS NOT NULL
            GROUP BY blocked_uri
            ORDER BY COUNT(*) DESC
            LIMIT 1
        ) as top_blocked_uri
    FROM csp_violations
    WHERE created_at >= NOW() - (days || ' days')::INTERVAL;
END;
$$ LANGUAGE plpgsql;

-- Function to find or create violation pattern
CREATE OR REPLACE FUNCTION upsert_csp_violation_pattern(
    p_violated_directive TEXT,
    p_blocked_uri TEXT,
    p_document_uri TEXT
)
RETURNS UUID AS $$
DECLARE
    v_pattern_hash VARCHAR(64);
    v_pattern_id UUID;
BEGIN
    -- Generate pattern hash
    v_pattern_hash := encode(
        digest(
            COALESCE(p_violated_directive, '') || '||' ||
            COALESCE(p_blocked_uri, '') || '||' ||
            COALESCE(p_document_uri, ''),
            'sha256'
        ),
        'hex'
    );

    -- Insert or update pattern
    INSERT INTO csp_violation_patterns (
        pattern_hash,
        violated_directive,
        blocked_uri,
        document_uri,
        occurrence_count,
        last_seen
    )
    VALUES (
        v_pattern_hash,
        p_violated_directive,
        p_blocked_uri,
        p_document_uri,
        1,
        NOW()
    )
    ON CONFLICT (pattern_hash)
    DO UPDATE SET
        occurrence_count = csp_violation_patterns.occurrence_count + 1,
        last_seen = NOW(),
        updated_at = NOW()
    RETURNING id INTO v_pattern_id;

    RETURN v_pattern_id;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update pattern statistics
CREATE OR REPLACE FUNCTION update_csp_pattern_on_violation()
RETURNS TRIGGER AS $$
BEGIN
    -- Update or create pattern
    PERFORM upsert_csp_violation_pattern(
        NEW.violated_directive,
        NEW.blocked_uri,
        NEW.document_uri
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_csp_pattern
AFTER INSERT ON csp_violations
FOR EACH ROW
EXECUTE FUNCTION update_csp_pattern_on_violation();

-- View for recent CSP violations
CREATE OR REPLACE VIEW recent_csp_violations AS
SELECT
    cv.id,
    cv.document_uri,
    cv.violated_directive,
    cv.blocked_uri,
    cv.severity,
    cv.disposition,
    cv.user_agent,
    cv.ip_address,
    cv.created_at,
    u.email as user_email
FROM csp_violations cv
LEFT JOIN users u ON cv.user_id = u.id
WHERE cv.created_at >= NOW() - INTERVAL '24 hours'
ORDER BY cv.created_at DESC
LIMIT 100;

-- View for critical CSP violations
CREATE OR REPLACE VIEW critical_csp_violations AS
SELECT
    cv.id,
    cv.document_uri,
    cv.violated_directive,
    cv.blocked_uri,
    cv.script_sample,
    cv.user_agent,
    cv.ip_address,
    cv.created_at,
    cv.is_reviewed
FROM csp_violations cv
WHERE cv.severity = 'critical'
AND cv.is_reviewed = FALSE
ORDER BY cv.created_at DESC;

-- View for CSP violation patterns summary
CREATE OR REPLACE VIEW csp_violation_patterns_summary AS
SELECT
    cvp.id,
    cvp.violated_directive,
    cvp.blocked_uri,
    cvp.document_uri,
    cvp.occurrence_count,
    cvp.first_seen,
    cvp.last_seen,
    cvp.is_whitelisted,
    cvp.is_critical,
    cvp.action_taken,
    EXTRACT(EPOCH FROM (cvp.last_seen - cvp.first_seen)) / 3600 as hours_active
FROM csp_violation_patterns cvp
WHERE cvp.occurrence_count > 1
ORDER BY cvp.occurrence_count DESC, cvp.last_seen DESC;

-- Materialized view for CSP analytics
CREATE MATERIALIZED VIEW IF NOT EXISTS csp_analytics_summary AS
SELECT
    DATE_TRUNC('hour', created_at) as hour,
    violated_directive,
    COUNT(*) as violation_count,
    COUNT(DISTINCT ip_address) as unique_ips,
    COUNT(DISTINCT user_id) as unique_users,
    COUNT(*) FILTER (WHERE severity = 'critical') as critical_count,
    COUNT(*) FILTER (WHERE disposition = 'enforce') as enforced_count,
    COUNT(*) FILTER (WHERE disposition = 'report') as reported_count
FROM csp_violations
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE_TRUNC('hour', created_at), violated_directive;

-- Create unique index for concurrent refresh
CREATE UNIQUE INDEX IF NOT EXISTS idx_csp_analytics_summary_unique
ON csp_analytics_summary (hour, violated_directive);

-- Function to refresh CSP analytics
CREATE OR REPLACE FUNCTION refresh_csp_analytics()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY csp_analytics_summary;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT SELECT, INSERT ON csp_violations TO PUBLIC;
GRANT SELECT, INSERT, UPDATE ON csp_violation_patterns TO PUBLIC;
GRANT SELECT, INSERT, UPDATE ON csp_violation_alerts TO PUBLIC;
GRANT SELECT ON recent_csp_violations TO PUBLIC;
GRANT SELECT ON critical_csp_violations TO PUBLIC;
GRANT SELECT ON csp_violation_patterns_summary TO PUBLIC;

-- Add comments
COMMENT ON TABLE csp_violations IS 'Stores all Content Security Policy violation reports';
COMMENT ON TABLE csp_violation_patterns IS 'Tracks patterns and repeated CSP violations';
COMMENT ON TABLE csp_violation_alerts IS 'Stores alerts generated from CSP violations';
COMMENT ON COLUMN csp_violations.disposition IS 'Whether violation was enforced or just reported';
COMMENT ON COLUMN csp_violations.violated_directive IS 'The CSP directive that was violated';
COMMENT ON COLUMN csp_violations.effective_directive IS 'The actual directive that caused the block';
COMMENT ON FUNCTION upsert_csp_violation_pattern IS 'Creates or updates violation pattern with occurrence count';
COMMENT ON VIEW recent_csp_violations IS 'Shows CSP violations from the last 24 hours';
COMMENT ON VIEW critical_csp_violations IS 'Shows unreviewed critical CSP violations';
