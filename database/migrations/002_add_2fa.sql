-- Add 2FA columns to users table
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_secret VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_backup_codes TEXT; -- JSON array of hashed backup codes

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_users_mfa_enabled ON users(mfa_enabled);

-- Create mfa_sessions table for temporary 2FA verification
CREATE TABLE IF NOT EXISTS mfa_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    session_token VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_mfa_sessions_token ON mfa_sessions(session_token);
CREATE INDEX idx_mfa_sessions_user ON mfa_sessions(user_id);
CREATE INDEX idx_mfa_sessions_expires ON mfa_sessions(expires_at);

-- Clean up expired MFA sessions (run this periodically)
-- DELETE FROM mfa_sessions WHERE expires_at < NOW();
