-- Sessions table for Redis-backed session management
-- This is for reference/backup. Primary sessions stored in Redis.

-- User sessions tracking table (for audit and management)
CREATE TABLE IF NOT EXISTS user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    session_id VARCHAR(255) UNIQUE NOT NULL,
    fingerprint VARCHAR(255) NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    device_info JSONB, -- Browser, OS, Device type
    last_activity TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP
);

-- Indexes for sessions
CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_session_id ON user_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_fingerprint ON user_sessions(fingerprint);
CREATE INDEX IF NOT EXISTS idx_user_sessions_active ON user_sessions(is_active);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expires ON user_sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_user_sessions_last_activity ON user_sessions(last_activity);

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_active ON user_sessions(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_last_activity ON user_sessions(user_id, last_activity DESC);

-- Remember me tokens table
CREATE TABLE IF NOT EXISTS remember_me_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    token_hash VARCHAR(255) UNIQUE NOT NULL,
    series VARCHAR(255) NOT NULL, -- Token series for rotation
    fingerprint VARCHAR(255) NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    expires_at TIMESTAMP NOT NULL,
    last_used TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for remember me tokens
CREATE INDEX IF NOT EXISTS idx_remember_tokens_user ON remember_me_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_remember_tokens_hash ON remember_me_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_remember_tokens_series ON remember_me_tokens(series);
CREATE INDEX IF NOT EXISTS idx_remember_tokens_expires ON remember_me_tokens(expires_at);

-- Function to clean up expired sessions
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Mark expired sessions as inactive
    UPDATE user_sessions
    SET is_active = FALSE, ended_at = NOW()
    WHERE is_active = TRUE
    AND (expires_at < NOW() OR last_activity < NOW() - INTERVAL '30 minutes');

    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    -- Delete old inactive sessions (older than 90 days)
    DELETE FROM user_sessions
    WHERE is_active = FALSE
    AND ended_at < NOW() - INTERVAL '90 days';

    -- Delete expired remember me tokens
    DELETE FROM remember_me_tokens
    WHERE expires_at < NOW();

    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update last_activity
CREATE OR REPLACE FUNCTION update_session_activity()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_activity = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Note: Trigger would be on session updates in application logic
-- CREATE TRIGGER update_session_activity_trigger
-- BEFORE UPDATE ON user_sessions
-- FOR EACH ROW EXECUTE FUNCTION update_session_activity();
