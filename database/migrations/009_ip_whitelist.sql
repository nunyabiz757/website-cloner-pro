-- IP Whitelist Migration
-- Adds IP-based restrictions for API keys

-- IP whitelist table
CREATE TABLE IF NOT EXISTS api_key_ip_whitelist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    api_key_id UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
    ip_address VARCHAR(45) NOT NULL, -- Supports both IPv4 and IPv6
    cidr_range VARCHAR(50), -- CIDR notation for IP ranges (e.g., 192.168.1.0/24)
    description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    updated_at TIMESTAMP DEFAULT NOW(),
    last_used_at TIMESTAMP,
    use_count INTEGER DEFAULT 0,
    CONSTRAINT unique_api_key_ip UNIQUE(api_key_id, ip_address)
);

-- IP access logs (for tracking and auditing)
CREATE TABLE IF NOT EXISTS api_key_ip_access_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    api_key_id UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
    ip_address VARCHAR(45) NOT NULL,
    access_granted BOOLEAN NOT NULL,
    denial_reason VARCHAR(255),
    endpoint VARCHAR(255),
    method VARCHAR(10),
    user_agent TEXT,
    request_timestamp TIMESTAMP DEFAULT NOW(),
    response_status INTEGER,
    INDEX idx_ip_access_api_key (api_key_id),
    INDEX idx_ip_access_ip (ip_address),
    INDEX idx_ip_access_timestamp (request_timestamp),
    INDEX idx_ip_access_granted (access_granted)
);

-- IP blacklist (for blocking malicious IPs)
CREATE TABLE IF NOT EXISTS api_key_ip_blacklist (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ip_address VARCHAR(45) NOT NULL UNIQUE,
    cidr_range VARCHAR(50),
    reason TEXT NOT NULL,
    severity VARCHAR(20) DEFAULT 'medium', -- low, medium, high, critical
    is_active BOOLEAN DEFAULT TRUE,
    expires_at TIMESTAMP, -- NULL for permanent blacklist
    created_at TIMESTAMP DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    updated_at TIMESTAMP DEFAULT NOW(),
    blocked_attempts INTEGER DEFAULT 0,
    INDEX idx_ip_blacklist_ip (ip_address),
    INDEX idx_ip_blacklist_active (is_active)
);

-- Indexes for performance
CREATE INDEX idx_ip_whitelist_api_key ON api_key_ip_whitelist(api_key_id);
CREATE INDEX idx_ip_whitelist_ip ON api_key_ip_whitelist(ip_address);
CREATE INDEX idx_ip_whitelist_active ON api_key_ip_whitelist(is_active);

-- Function to check if IP is whitelisted
CREATE OR REPLACE FUNCTION is_ip_whitelisted(
    p_api_key_id UUID,
    p_ip_address VARCHAR(45)
) RETURNS BOOLEAN AS $$
DECLARE
    v_has_whitelist BOOLEAN;
    v_is_whitelisted BOOLEAN;
BEGIN
    -- Check if API key has any whitelist entries
    SELECT EXISTS(
        SELECT 1 FROM api_key_ip_whitelist
        WHERE api_key_id = p_api_key_id
        AND is_active = TRUE
    ) INTO v_has_whitelist;

    -- If no whitelist exists, allow all IPs
    IF NOT v_has_whitelist THEN
        RETURN TRUE;
    END IF;

    -- Check exact IP match
    SELECT EXISTS(
        SELECT 1 FROM api_key_ip_whitelist
        WHERE api_key_id = p_api_key_id
        AND ip_address = p_ip_address
        AND is_active = TRUE
    ) INTO v_is_whitelisted;

    IF v_is_whitelisted THEN
        RETURN TRUE;
    END IF;

    -- Check CIDR range match
    SELECT EXISTS(
        SELECT 1 FROM api_key_ip_whitelist
        WHERE api_key_id = p_api_key_id
        AND cidr_range IS NOT NULL
        AND p_ip_address::inet << cidr_range::inet
        AND is_active = TRUE
    ) INTO v_is_whitelisted;

    RETURN v_is_whitelisted;
END;
$$ LANGUAGE plpgsql;

-- Function to check if IP is blacklisted
CREATE OR REPLACE FUNCTION is_ip_blacklisted(
    p_ip_address VARCHAR(45)
) RETURNS TABLE(
    is_blacklisted BOOLEAN,
    reason TEXT,
    severity VARCHAR(20)
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        TRUE,
        b.reason,
        b.severity
    FROM api_key_ip_blacklist b
    WHERE b.ip_address = p_ip_address
    AND b.is_active = TRUE
    AND (b.expires_at IS NULL OR b.expires_at > NOW())
    LIMIT 1;

    -- Check CIDR range blacklist
    IF NOT FOUND THEN
        RETURN QUERY
        SELECT
            TRUE,
            b.reason,
            b.severity
        FROM api_key_ip_blacklist b
        WHERE b.cidr_range IS NOT NULL
        AND p_ip_address::inet << b.cidr_range::inet
        AND b.is_active = TRUE
        AND (b.expires_at IS NULL OR b.expires_at > NOW())
        LIMIT 1;
    END IF;

    -- If not blacklisted
    IF NOT FOUND THEN
        RETURN QUERY SELECT FALSE, NULL::TEXT, NULL::VARCHAR(20);
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Function to update whitelist IP usage
CREATE OR REPLACE FUNCTION update_whitelist_ip_usage(
    p_api_key_id UUID,
    p_ip_address VARCHAR(45)
) RETURNS VOID AS $$
BEGIN
    UPDATE api_key_ip_whitelist
    SET
        last_used_at = NOW(),
        use_count = use_count + 1,
        updated_at = NOW()
    WHERE api_key_id = p_api_key_id
    AND (ip_address = p_ip_address OR p_ip_address::inet << cidr_range::inet);
END;
$$ LANGUAGE plpgsql;

-- Function to log IP access
CREATE OR REPLACE FUNCTION log_ip_access(
    p_api_key_id UUID,
    p_ip_address VARCHAR(45),
    p_access_granted BOOLEAN,
    p_denial_reason VARCHAR(255) DEFAULT NULL,
    p_endpoint VARCHAR(255) DEFAULT NULL,
    p_method VARCHAR(10) DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL,
    p_response_status INTEGER DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_log_id UUID;
BEGIN
    INSERT INTO api_key_ip_access_logs (
        api_key_id,
        ip_address,
        access_granted,
        denial_reason,
        endpoint,
        method,
        user_agent,
        response_status
    ) VALUES (
        p_api_key_id,
        p_ip_address,
        p_access_granted,
        p_denial_reason,
        p_endpoint,
        p_method,
        p_user_agent,
        p_response_status
    ) RETURNING id INTO v_log_id;

    RETURN v_log_id;
END;
$$ LANGUAGE plpgsql;

-- Function to add IP to blacklist
CREATE OR REPLACE FUNCTION add_ip_to_blacklist(
    p_ip_address VARCHAR(45),
    p_reason TEXT,
    p_severity VARCHAR(20) DEFAULT 'medium',
    p_expires_at TIMESTAMP DEFAULT NULL,
    p_created_by UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_blacklist_id UUID;
BEGIN
    INSERT INTO api_key_ip_blacklist (
        ip_address,
        reason,
        severity,
        expires_at,
        created_by
    ) VALUES (
        p_ip_address,
        p_reason,
        p_severity,
        p_expires_at,
        p_created_by
    )
    ON CONFLICT (ip_address) DO UPDATE
    SET
        reason = EXCLUDED.reason,
        severity = EXCLUDED.severity,
        expires_at = EXCLUDED.expires_at,
        is_active = TRUE,
        updated_at = NOW(),
        blocked_attempts = api_key_ip_blacklist.blocked_attempts + 1
    RETURNING id INTO v_blacklist_id;

    RETURN v_blacklist_id;
END;
$$ LANGUAGE plpgsql;

-- Function to increment blacklist blocked attempts
CREATE OR REPLACE FUNCTION increment_blacklist_attempts(
    p_ip_address VARCHAR(45)
) RETURNS VOID AS $$
BEGIN
    UPDATE api_key_ip_blacklist
    SET
        blocked_attempts = blocked_attempts + 1,
        updated_at = NOW()
    WHERE ip_address = p_ip_address
    AND is_active = TRUE;
END;
$$ LANGUAGE plpgsql;

-- Function to cleanup expired blacklist entries
CREATE OR REPLACE FUNCTION cleanup_expired_blacklist() RETURNS INTEGER AS $$
DECLARE
    v_deleted_count INTEGER;
BEGIN
    DELETE FROM api_key_ip_blacklist
    WHERE expires_at IS NOT NULL
    AND expires_at < NOW()
    RETURNING COUNT(*) INTO v_deleted_count;

    RETURN COALESCE(v_deleted_count, 0);
END;
$$ LANGUAGE plpgsql;

-- View for API keys with whitelist info
CREATE OR REPLACE VIEW api_keys_with_ip_whitelist AS
SELECT
    ak.id,
    ak.key_hash,
    ak.name,
    ak.user_id,
    ak.is_active,
    COUNT(DISTINCT w.id) as whitelist_count,
    ARRAY_AGG(DISTINCT w.ip_address) FILTER (WHERE w.ip_address IS NOT NULL) as whitelisted_ips,
    ARRAY_AGG(DISTINCT w.cidr_range) FILTER (WHERE w.cidr_range IS NOT NULL) as whitelisted_ranges,
    ak.created_at,
    ak.last_used_at
FROM api_keys ak
LEFT JOIN api_key_ip_whitelist w ON ak.id = w.api_key_id AND w.is_active = TRUE
GROUP BY ak.id, ak.key_hash, ak.name, ak.user_id, ak.is_active, ak.created_at, ak.last_used_at;

-- View for suspicious IP access patterns
CREATE OR REPLACE VIEW suspicious_ip_access AS
SELECT
    ip_address,
    COUNT(*) as total_attempts,
    SUM(CASE WHEN access_granted = FALSE THEN 1 ELSE 0 END) as denied_attempts,
    SUM(CASE WHEN access_granted = TRUE THEN 1 ELSE 0 END) as granted_attempts,
    MAX(request_timestamp) as last_attempt,
    ARRAY_AGG(DISTINCT denial_reason) FILTER (WHERE denial_reason IS NOT NULL) as denial_reasons,
    COUNT(DISTINCT api_key_id) as api_keys_attempted
FROM api_key_ip_access_logs
WHERE request_timestamp >= NOW() - INTERVAL '1 hour'
GROUP BY ip_address
HAVING SUM(CASE WHEN access_granted = FALSE THEN 1 ELSE 0 END) >= 5
ORDER BY denied_attempts DESC;

-- View for IP whitelist usage statistics
CREATE OR REPLACE VIEW ip_whitelist_statistics AS
SELECT
    w.id,
    w.api_key_id,
    ak.name as api_key_name,
    w.ip_address,
    w.cidr_range,
    w.description,
    w.use_count,
    w.last_used_at,
    w.created_at,
    COALESCE(
        (SELECT COUNT(*) FROM api_key_ip_access_logs l
         WHERE l.api_key_id = w.api_key_id
         AND l.ip_address = w.ip_address
         AND l.access_granted = TRUE),
        0
    ) as successful_accesses,
    COALESCE(
        (SELECT COUNT(*) FROM api_key_ip_access_logs l
         WHERE l.api_key_id = w.api_key_id
         AND l.ip_address = w.ip_address
         AND l.access_granted = FALSE),
        0
    ) as denied_accesses
FROM api_key_ip_whitelist w
JOIN api_keys ak ON w.api_key_id = ak.id
WHERE w.is_active = TRUE;

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_ip_whitelist_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_ip_whitelist_updated_at
    BEFORE UPDATE ON api_key_ip_whitelist
    FOR EACH ROW
    EXECUTE FUNCTION update_ip_whitelist_timestamp();

CREATE TRIGGER update_ip_blacklist_updated_at
    BEFORE UPDATE ON api_key_ip_blacklist
    FOR EACH ROW
    EXECUTE FUNCTION update_ip_whitelist_timestamp();

-- Comments for documentation
COMMENT ON TABLE api_key_ip_whitelist IS 'IP whitelist for API key access control';
COMMENT ON TABLE api_key_ip_access_logs IS 'Access logs for IP-based API key validation';
COMMENT ON TABLE api_key_ip_blacklist IS 'Blacklist of malicious or blocked IPs';
COMMENT ON FUNCTION is_ip_whitelisted(UUID, VARCHAR) IS 'Check if IP is whitelisted for API key';
COMMENT ON FUNCTION is_ip_blacklisted(VARCHAR) IS 'Check if IP is blacklisted globally';
COMMENT ON FUNCTION log_ip_access IS 'Log API key access attempt with IP information';

-- Insert sample data for testing (optional, remove in production)
-- Example: Whitelist localhost for testing
-- INSERT INTO api_key_ip_whitelist (api_key_id, ip_address, description)
-- SELECT id, '127.0.0.1', 'Localhost for development'
-- FROM api_keys LIMIT 1;
