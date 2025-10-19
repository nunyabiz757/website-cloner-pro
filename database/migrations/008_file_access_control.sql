-- File Access Control Migration
-- Creates tables for tracking file access and pre-signed URL usage

-- File Access Tokens Table
CREATE TABLE IF NOT EXISTS file_access_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Token Information
    token_hash VARCHAR(64) UNIQUE NOT NULL, -- SHA-256 hash of token
    file_path TEXT NOT NULL,

    -- Access Control
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    allowed_ip_address VARCHAR(45),
    max_downloads INTEGER, -- NULL = unlimited
    download_count INTEGER DEFAULT 0,

    -- Token Metadata
    expires_at TIMESTAMP NOT NULL,
    content_type VARCHAR(255),
    content_disposition VARCHAR(20), -- 'inline' or 'attachment'
    custom_filename VARCHAR(255),

    -- Status
    is_revoked BOOLEAN DEFAULT FALSE,
    revoked_at TIMESTAMP,
    revoked_by UUID REFERENCES users(id) ON DELETE SET NULL,
    revoked_reason TEXT,

    -- Audit
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    last_accessed TIMESTAMP,

    -- Indexes
    INDEX idx_file_tokens_token_hash (token_hash),
    INDEX idx_file_tokens_file_path (file_path),
    INDEX idx_file_tokens_user_id (user_id),
    INDEX idx_file_tokens_expires_at (expires_at),
    INDEX idx_file_tokens_is_revoked (is_revoked)
);

-- File Access Logs Table
CREATE TABLE IF NOT EXISTS file_access_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- File Information
    file_path TEXT NOT NULL,
    file_size BIGINT,
    content_type VARCHAR(255),

    -- Access Details
    token_id UUID REFERENCES file_access_tokens(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,

    -- Request Details
    method VARCHAR(10), -- GET, HEAD, etc.
    status_code INTEGER, -- HTTP status code
    bytes_sent BIGINT,
    duration_ms INTEGER, -- Request duration in milliseconds

    -- Security
    access_granted BOOLEAN NOT NULL,
    denial_reason VARCHAR(255), -- If access denied

    -- Timestamps
    accessed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    -- Indexes
    INDEX idx_file_access_file_path (file_path),
    INDEX idx_file_access_user_id (user_id),
    INDEX idx_file_access_ip_address (ip_address),
    INDEX idx_file_access_accessed_at (accessed_at),
    INDEX idx_file_access_granted (access_granted),
    INDEX idx_file_access_token_id (token_id)
);

-- File Metadata Table (Optional - for enhanced security)
CREATE TABLE IF NOT EXISTS file_metadata (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- File Information
    file_path TEXT UNIQUE NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    file_size BIGINT,
    content_type VARCHAR(255),
    checksum VARCHAR(64), -- SHA-256 checksum

    -- Ownership
    owner_id UUID REFERENCES users(id) ON DELETE SET NULL,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,

    -- Access Control
    is_public BOOLEAN DEFAULT FALSE,
    requires_authentication BOOLEAN DEFAULT TRUE,
    allowed_users UUID[], -- Array of user IDs with access

    -- Security Scan
    virus_scan_status VARCHAR(20), -- 'pending', 'clean', 'infected', 'failed'
    virus_scan_date TIMESTAMP,

    -- Timestamps
    uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_accessed TIMESTAMP,
    access_count INTEGER DEFAULT 0,

    -- Indexes
    INDEX idx_file_metadata_path (file_path),
    INDEX idx_file_metadata_owner (owner_id),
    INDEX idx_file_metadata_public (is_public),
    INDEX idx_file_metadata_scan_status (virus_scan_status)
);

-- Function to cleanup expired tokens
CREATE OR REPLACE FUNCTION cleanup_expired_file_tokens(retention_days INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Delete expired tokens older than retention period
    DELETE FROM file_access_tokens
    WHERE expires_at < NOW() - (retention_days || ' days')::INTERVAL;

    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to cleanup old access logs
CREATE OR REPLACE FUNCTION cleanup_old_file_access_logs(retention_days INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM file_access_logs
    WHERE accessed_at < NOW() - (retention_days || ' days')::INTERVAL;

    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get file access statistics
CREATE OR REPLACE FUNCTION get_file_access_stats(days INTEGER DEFAULT 7)
RETURNS TABLE (
    total_accesses BIGINT,
    unique_files BIGINT,
    unique_users BIGINT,
    unique_ips BIGINT,
    denied_accesses BIGINT,
    total_bytes_sent BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*)::BIGINT as total_accesses,
        COUNT(DISTINCT file_path)::BIGINT as unique_files,
        COUNT(DISTINCT user_id)::BIGINT as unique_users,
        COUNT(DISTINCT ip_address)::BIGINT as unique_ips,
        COUNT(*) FILTER (WHERE access_granted = FALSE)::BIGINT as denied_accesses,
        COALESCE(SUM(bytes_sent), 0)::BIGINT as total_bytes_sent
    FROM file_access_logs
    WHERE accessed_at >= NOW() - (days || ' days')::INTERVAL;
END;
$$ LANGUAGE plpgsql;

-- Function to check if token has reached download limit
CREATE OR REPLACE FUNCTION check_token_download_limit(p_token_hash VARCHAR)
RETURNS BOOLEAN AS $$
DECLARE
    v_max_downloads INTEGER;
    v_download_count INTEGER;
BEGIN
    SELECT max_downloads, download_count
    INTO v_max_downloads, v_download_count
    FROM file_access_tokens
    WHERE token_hash = p_token_hash
    AND is_revoked = FALSE
    AND expires_at > NOW();

    -- If no max downloads, return true
    IF v_max_downloads IS NULL THEN
        RETURN TRUE;
    END IF;

    -- Check if limit reached
    RETURN v_download_count < v_max_downloads;
END;
$$ LANGUAGE plpgsql;

-- Function to increment token download count
CREATE OR REPLACE FUNCTION increment_token_download_count(p_token_hash VARCHAR)
RETURNS void AS $$
BEGIN
    UPDATE file_access_tokens
    SET download_count = download_count + 1,
        last_accessed = NOW()
    WHERE token_hash = p_token_hash;
END;
$$ LANGUAGE plpgsql;

-- Function to revoke token
CREATE OR REPLACE FUNCTION revoke_file_token(
    p_token_hash VARCHAR,
    p_revoked_by UUID,
    p_reason TEXT
)
RETURNS void AS $$
BEGIN
    UPDATE file_access_tokens
    SET is_revoked = TRUE,
        revoked_at = NOW(),
        revoked_by = p_revoked_by,
        revoked_reason = p_reason
    WHERE token_hash = p_token_hash;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update file metadata access count
CREATE OR REPLACE FUNCTION update_file_metadata_access()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.access_granted = TRUE THEN
        UPDATE file_metadata
        SET access_count = access_count + 1,
            last_accessed = NEW.accessed_at
        WHERE file_path = NEW.file_path;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_file_metadata_access
AFTER INSERT ON file_access_logs
FOR EACH ROW
EXECUTE FUNCTION update_file_metadata_access();

-- View for active tokens
CREATE OR REPLACE VIEW active_file_tokens AS
SELECT
    fat.id,
    fat.file_path,
    fat.user_id,
    u.email as user_email,
    fat.allowed_ip_address,
    fat.max_downloads,
    fat.download_count,
    fat.expires_at,
    fat.created_at,
    EXTRACT(EPOCH FROM (fat.expires_at - NOW())) as seconds_until_expiry
FROM file_access_tokens fat
LEFT JOIN users u ON fat.user_id = u.id
WHERE fat.is_revoked = FALSE
AND fat.expires_at > NOW()
AND (fat.max_downloads IS NULL OR fat.download_count < fat.max_downloads)
ORDER BY fat.expires_at ASC;

-- View for suspicious file access
CREATE OR REPLACE VIEW suspicious_file_access AS
SELECT
    fal.file_path,
    fal.ip_address,
    fal.user_id,
    COUNT(*) as access_attempts,
    COUNT(*) FILTER (WHERE access_granted = FALSE) as denied_attempts,
    MAX(fal.accessed_at) as last_attempt,
    array_agg(DISTINCT fal.denial_reason) FILTER (WHERE fal.denial_reason IS NOT NULL) as denial_reasons
FROM file_access_logs fal
WHERE fal.accessed_at >= NOW() - INTERVAL '1 hour'
GROUP BY fal.file_path, fal.ip_address, fal.user_id
HAVING COUNT(*) FILTER (WHERE access_granted = FALSE) >= 5
ORDER BY denied_attempts DESC;

-- View for top accessed files
CREATE OR REPLACE VIEW top_accessed_files AS
SELECT
    fm.file_path,
    fm.file_name,
    fm.file_size,
    fm.owner_id,
    u.email as owner_email,
    fm.access_count,
    fm.last_accessed,
    fm.uploaded_at
FROM file_metadata fm
LEFT JOIN users u ON fm.owner_id = u.id
ORDER BY fm.access_count DESC
LIMIT 100;

-- Materialized view for file access analytics
CREATE MATERIALIZED VIEW IF NOT EXISTS file_access_analytics AS
SELECT
    DATE_TRUNC('hour', accessed_at) as hour,
    COUNT(*) as total_accesses,
    COUNT(DISTINCT file_path) as unique_files,
    COUNT(DISTINCT user_id) as unique_users,
    COUNT(DISTINCT ip_address) as unique_ips,
    COUNT(*) FILTER (WHERE access_granted = TRUE) as granted_count,
    COUNT(*) FILTER (WHERE access_granted = FALSE) as denied_count,
    SUM(bytes_sent) as total_bytes,
    AVG(duration_ms) as avg_duration_ms
FROM file_access_logs
WHERE accessed_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE_TRUNC('hour', accessed_at);

-- Create unique index for concurrent refresh
CREATE UNIQUE INDEX IF NOT EXISTS idx_file_access_analytics_unique
ON file_access_analytics (hour);

-- Function to refresh analytics
CREATE OR REPLACE FUNCTION refresh_file_access_analytics()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY file_access_analytics;
END;
$$ LANGUAGE plpgsql;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON file_access_tokens TO PUBLIC;
GRANT SELECT, INSERT ON file_access_logs TO PUBLIC;
GRANT SELECT, INSERT, UPDATE ON file_metadata TO PUBLIC;
GRANT SELECT ON active_file_tokens TO PUBLIC;
GRANT SELECT ON suspicious_file_access TO PUBLIC;
GRANT SELECT ON top_accessed_files TO PUBLIC;

-- Add comments
COMMENT ON TABLE file_access_tokens IS 'Stores pre-signed URL tokens for temporary file access';
COMMENT ON TABLE file_access_logs IS 'Logs all file access attempts for security auditing';
COMMENT ON TABLE file_metadata IS 'Stores metadata and access control information for files';
COMMENT ON COLUMN file_access_tokens.token_hash IS 'SHA-256 hash of the access token';
COMMENT ON COLUMN file_access_tokens.max_downloads IS 'Maximum number of downloads allowed (NULL = unlimited)';
COMMENT ON COLUMN file_access_logs.access_granted IS 'Whether access was granted or denied';
COMMENT ON FUNCTION check_token_download_limit IS 'Checks if token has remaining downloads';
COMMENT ON VIEW suspicious_file_access IS 'Shows IPs with multiple failed access attempts';
