-- Migration: 015_key_rotation.sql
-- Description: Key rotation tracking and management
-- Created: 2025-01-15

-- ============================================================================
-- TABLES
-- ============================================================================

-- Table: encryption_keys
-- Tracks all encryption keys with versioning
CREATE TABLE IF NOT EXISTS encryption_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key_version INTEGER NOT NULL UNIQUE,
    key_hash VARCHAR(64) NOT NULL, -- SHA-256 hash of the key (for verification, not the key itself)
    algorithm VARCHAR(50) NOT NULL DEFAULT 'aes-256-gcm',
    key_purpose VARCHAR(100) NOT NULL, -- 'primary', 'backup', 'archived'
    is_active BOOLEAN DEFAULT FALSE,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    activated_at TIMESTAMP,
    deactivated_at TIMESTAMP,
    metadata JSONB,
    CONSTRAINT valid_key_purpose CHECK (key_purpose IN ('primary', 'backup', 'archived', 'retired'))
);

-- Table: key_rotation_history
-- Complete audit trail of key rotations
CREATE TABLE IF NOT EXISTS key_rotation_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rotation_type VARCHAR(50) NOT NULL, -- 'scheduled', 'manual', 'emergency'
    from_key_version INTEGER REFERENCES encryption_keys(key_version) ON DELETE SET NULL,
    to_key_version INTEGER NOT NULL REFERENCES encryption_keys(key_version) ON DELETE CASCADE,
    rotation_status VARCHAR(50) NOT NULL, -- 'started', 'in_progress', 'completed', 'failed', 'rolled_back'
    records_re_encrypted INTEGER DEFAULT 0,
    records_failed INTEGER DEFAULT 0,
    initiated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP,
    error_message TEXT,
    metadata JSONB,
    CONSTRAINT valid_rotation_type CHECK (rotation_type IN ('scheduled', 'manual', 'emergency')),
    CONSTRAINT valid_rotation_status CHECK (rotation_status IN ('started', 'in_progress', 'completed', 'failed', 'rolled_back'))
);

-- Table: key_rotation_schedule
-- Configurable rotation schedule
CREATE TABLE IF NOT EXISTS key_rotation_schedule (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_name VARCHAR(100) NOT NULL UNIQUE,
    rotation_interval_days INTEGER NOT NULL,
    enabled BOOLEAN DEFAULT TRUE,
    last_rotation_at TIMESTAMP,
    next_rotation_at TIMESTAMP,
    auto_rotate BOOLEAN DEFAULT FALSE,
    notify_before_days INTEGER DEFAULT 7,
    notification_emails TEXT[], -- Array of emails to notify
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT positive_interval CHECK (rotation_interval_days > 0),
    CONSTRAINT positive_notify_days CHECK (notify_before_days >= 0)
);

-- Table: re_encryption_queue
-- Tracks records that need re-encryption during rotation
CREATE TABLE IF NOT EXISTS re_encryption_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    rotation_id UUID NOT NULL REFERENCES key_rotation_history(id) ON DELETE CASCADE,
    table_name VARCHAR(100) NOT NULL,
    record_id UUID NOT NULL,
    column_name VARCHAR(100) NOT NULL,
    encryption_status VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
    from_key_version INTEGER,
    to_key_version INTEGER NOT NULL,
    retry_count INTEGER DEFAULT 0,
    last_error TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMP,
    CONSTRAINT valid_encryption_status CHECK (encryption_status IN ('pending', 'processing', 'completed', 'failed'))
);

-- Table: key_usage_metrics
-- Track which keys are being used for encryption/decryption
CREATE TABLE IF NOT EXISTS key_usage_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key_version INTEGER NOT NULL REFERENCES encryption_keys(key_version) ON DELETE CASCADE,
    operation_type VARCHAR(50) NOT NULL, -- 'encrypt', 'decrypt'
    usage_count INTEGER DEFAULT 0,
    last_used_at TIMESTAMP,
    metrics_date DATE NOT NULL,
    CONSTRAINT valid_operation_type CHECK (operation_type IN ('encrypt', 'decrypt')),
    CONSTRAINT unique_key_metrics UNIQUE (key_version, operation_type, metrics_date)
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Encryption keys indexes
CREATE INDEX idx_encryption_keys_version ON encryption_keys(key_version);
CREATE INDEX idx_encryption_keys_active ON encryption_keys(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_encryption_keys_purpose ON encryption_keys(key_purpose);
CREATE INDEX idx_encryption_keys_created_at ON encryption_keys(created_at);

-- Key rotation history indexes
CREATE INDEX idx_rotation_history_status ON key_rotation_history(rotation_status);
CREATE INDEX idx_rotation_history_type ON key_rotation_history(rotation_type);
CREATE INDEX idx_rotation_history_to_key ON key_rotation_history(to_key_version);
CREATE INDEX idx_rotation_history_started_at ON key_rotation_history(started_at);
CREATE INDEX idx_rotation_history_completed_at ON key_rotation_history(completed_at);

-- Key rotation schedule indexes
CREATE INDEX idx_rotation_schedule_enabled ON key_rotation_schedule(enabled) WHERE enabled = TRUE;
CREATE INDEX idx_rotation_schedule_next_rotation ON key_rotation_schedule(next_rotation_at) WHERE enabled = TRUE;

-- Re-encryption queue indexes
CREATE INDEX idx_re_encryption_queue_rotation ON re_encryption_queue(rotation_id);
CREATE INDEX idx_re_encryption_queue_status ON re_encryption_queue(encryption_status);
CREATE INDEX idx_re_encryption_queue_table ON re_encryption_queue(table_name, record_id);
CREATE INDEX idx_re_encryption_queue_pending ON re_encryption_queue(rotation_id, encryption_status) WHERE encryption_status = 'pending';

-- Key usage metrics indexes
CREATE INDEX idx_key_usage_metrics_version ON key_usage_metrics(key_version);
CREATE INDEX idx_key_usage_metrics_date ON key_usage_metrics(metrics_date);
CREATE INDEX idx_key_usage_metrics_version_date ON key_usage_metrics(key_version, metrics_date);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function: get_active_key_version
-- Returns the currently active key version
CREATE OR REPLACE FUNCTION get_active_key_version()
RETURNS INTEGER AS $$
DECLARE
    active_version INTEGER;
BEGIN
    SELECT key_version INTO active_version
    FROM encryption_keys
    WHERE is_active = TRUE
    ORDER BY key_version DESC
    LIMIT 1;

    RETURN active_version;
END;
$$ LANGUAGE plpgsql;

-- Function: activate_key
-- Activates a key version and deactivates all others
CREATE OR REPLACE FUNCTION activate_key(p_key_version INTEGER)
RETURNS BOOLEAN AS $$
BEGIN
    -- Check if key exists
    IF NOT EXISTS (SELECT 1 FROM encryption_keys WHERE key_version = p_key_version) THEN
        RAISE EXCEPTION 'Key version % does not exist', p_key_version;
    END IF;

    -- Deactivate all keys
    UPDATE encryption_keys
    SET is_active = FALSE,
        deactivated_at = CURRENT_TIMESTAMP
    WHERE is_active = TRUE;

    -- Activate the specified key
    UPDATE encryption_keys
    SET is_active = TRUE,
        activated_at = CURRENT_TIMESTAMP,
        key_purpose = 'primary'
    WHERE key_version = p_key_version;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Function: register_new_key
-- Registers a new encryption key
CREATE OR REPLACE FUNCTION register_new_key(
    p_key_hash VARCHAR(64),
    p_algorithm VARCHAR(50),
    p_created_by UUID,
    p_metadata JSONB DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
    new_version INTEGER;
BEGIN
    -- Get next version number
    SELECT COALESCE(MAX(key_version), 0) + 1 INTO new_version
    FROM encryption_keys;

    -- Insert new key
    INSERT INTO encryption_keys (
        key_version,
        key_hash,
        algorithm,
        key_purpose,
        is_active,
        created_by,
        metadata
    ) VALUES (
        new_version,
        p_key_hash,
        p_algorithm,
        'backup',
        FALSE,
        p_created_by,
        p_metadata
    );

    RETURN new_version;
END;
$$ LANGUAGE plpgsql;

-- Function: start_key_rotation
-- Initiates a key rotation process
CREATE OR REPLACE FUNCTION start_key_rotation(
    p_rotation_type VARCHAR(50),
    p_to_key_version INTEGER,
    p_initiated_by UUID,
    p_metadata JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    rotation_id UUID;
    current_key_version INTEGER;
BEGIN
    -- Get current active key
    current_key_version := get_active_key_version();

    -- Check if target key exists
    IF NOT EXISTS (SELECT 1 FROM encryption_keys WHERE key_version = p_to_key_version) THEN
        RAISE EXCEPTION 'Target key version % does not exist', p_to_key_version;
    END IF;

    -- Check for existing in-progress rotation
    IF EXISTS (
        SELECT 1 FROM key_rotation_history
        WHERE rotation_status IN ('started', 'in_progress')
    ) THEN
        RAISE EXCEPTION 'A key rotation is already in progress';
    END IF;

    -- Create rotation record
    INSERT INTO key_rotation_history (
        rotation_type,
        from_key_version,
        to_key_version,
        rotation_status,
        initiated_by,
        metadata
    ) VALUES (
        p_rotation_type,
        current_key_version,
        p_to_key_version,
        'started',
        p_initiated_by,
        p_metadata
    )
    RETURNING id INTO rotation_id;

    RETURN rotation_id;
END;
$$ LANGUAGE plpgsql;

-- Function: complete_key_rotation
-- Marks a key rotation as completed
CREATE OR REPLACE FUNCTION complete_key_rotation(
    p_rotation_id UUID,
    p_records_re_encrypted INTEGER DEFAULT 0,
    p_records_failed INTEGER DEFAULT 0
)
RETURNS BOOLEAN AS $$
DECLARE
    target_key_version INTEGER;
BEGIN
    -- Get target key version
    SELECT to_key_version INTO target_key_version
    FROM key_rotation_history
    WHERE id = p_rotation_id;

    IF target_key_version IS NULL THEN
        RAISE EXCEPTION 'Rotation ID % not found', p_rotation_id;
    END IF;

    -- Update rotation record
    UPDATE key_rotation_history
    SET rotation_status = 'completed',
        records_re_encrypted = p_records_re_encrypted,
        records_failed = p_records_failed,
        completed_at = CURRENT_TIMESTAMP
    WHERE id = p_rotation_id;

    -- Activate the new key
    PERFORM activate_key(target_key_version);

    -- Archive old keys
    UPDATE encryption_keys
    SET key_purpose = 'archived'
    WHERE is_active = FALSE
      AND key_purpose = 'primary'
      AND key_version < target_key_version;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Function: fail_key_rotation
-- Marks a key rotation as failed
CREATE OR REPLACE FUNCTION fail_key_rotation(
    p_rotation_id UUID,
    p_error_message TEXT
)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE key_rotation_history
    SET rotation_status = 'failed',
        error_message = p_error_message,
        completed_at = CURRENT_TIMESTAMP
    WHERE id = p_rotation_id;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Function: get_rotation_statistics
-- Returns statistics for a rotation
CREATE OR REPLACE FUNCTION get_rotation_statistics(p_rotation_id UUID)
RETURNS TABLE (
    rotation_id UUID,
    rotation_type VARCHAR(50),
    rotation_status VARCHAR(50),
    from_key_version INTEGER,
    to_key_version INTEGER,
    total_records INTEGER,
    records_completed INTEGER,
    records_pending INTEGER,
    records_failed INTEGER,
    progress_percentage NUMERIC,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    duration_seconds INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        rh.id,
        rh.rotation_type,
        rh.rotation_status,
        rh.from_key_version,
        rh.to_key_version,
        COUNT(req.id)::INTEGER AS total_records,
        COUNT(CASE WHEN req.encryption_status = 'completed' THEN 1 END)::INTEGER AS records_completed,
        COUNT(CASE WHEN req.encryption_status = 'pending' THEN 1 END)::INTEGER AS records_pending,
        COUNT(CASE WHEN req.encryption_status = 'failed' THEN 1 END)::INTEGER AS records_failed,
        CASE
            WHEN COUNT(req.id) > 0 THEN
                ROUND((COUNT(CASE WHEN req.encryption_status = 'completed' THEN 1 END)::NUMERIC / COUNT(req.id)::NUMERIC) * 100, 2)
            ELSE 0
        END AS progress_percentage,
        rh.started_at,
        rh.completed_at,
        CASE
            WHEN rh.completed_at IS NOT NULL THEN
                EXTRACT(EPOCH FROM (rh.completed_at - rh.started_at))::INTEGER
            ELSE
                EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - rh.started_at))::INTEGER
        END AS duration_seconds
    FROM key_rotation_history rh
    LEFT JOIN re_encryption_queue req ON req.rotation_id = rh.id
    WHERE rh.id = p_rotation_id
    GROUP BY rh.id, rh.rotation_type, rh.rotation_status, rh.from_key_version,
             rh.to_key_version, rh.started_at, rh.completed_at;
END;
$$ LANGUAGE plpgsql;

-- Function: calculate_next_rotation_date
-- Calculates the next rotation date based on schedule
CREATE OR REPLACE FUNCTION calculate_next_rotation_date(
    p_schedule_id UUID
)
RETURNS TIMESTAMP AS $$
DECLARE
    interval_days INTEGER;
    last_rotation TIMESTAMP;
    next_rotation TIMESTAMP;
BEGIN
    SELECT rotation_interval_days, last_rotation_at
    INTO interval_days, last_rotation
    FROM key_rotation_schedule
    WHERE id = p_schedule_id;

    IF last_rotation IS NULL THEN
        -- If never rotated, schedule from now
        next_rotation := CURRENT_TIMESTAMP + (interval_days || ' days')::INTERVAL;
    ELSE
        -- Schedule from last rotation
        next_rotation := last_rotation + (interval_days || ' days')::INTERVAL;
    END IF;

    RETURN next_rotation;
END;
$$ LANGUAGE plpgsql;

-- Function: update_next_rotation_date
-- Updates the next rotation date for a schedule
CREATE OR REPLACE FUNCTION update_next_rotation_date(
    p_schedule_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
    next_date TIMESTAMP;
BEGIN
    next_date := calculate_next_rotation_date(p_schedule_id);

    UPDATE key_rotation_schedule
    SET next_rotation_at = next_date,
        last_rotation_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_schedule_id;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Function: get_due_rotations
-- Returns schedules that are due for rotation
CREATE OR REPLACE FUNCTION get_due_rotations()
RETURNS TABLE (
    schedule_id UUID,
    schedule_name VARCHAR(100),
    rotation_interval_days INTEGER,
    last_rotation_at TIMESTAMP,
    next_rotation_at TIMESTAMP,
    days_overdue INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        krs.id,
        krs.schedule_name,
        krs.rotation_interval_days,
        krs.last_rotation_at,
        krs.next_rotation_at,
        EXTRACT(DAY FROM (CURRENT_TIMESTAMP - krs.next_rotation_at))::INTEGER AS days_overdue
    FROM key_rotation_schedule krs
    WHERE krs.enabled = TRUE
      AND krs.auto_rotate = TRUE
      AND krs.next_rotation_at <= CURRENT_TIMESTAMP
    ORDER BY krs.next_rotation_at ASC;
END;
$$ LANGUAGE plpgsql;

-- Function: get_upcoming_rotations
-- Returns schedules with rotations coming up soon
CREATE OR REPLACE FUNCTION get_upcoming_rotations(p_days_ahead INTEGER DEFAULT 7)
RETURNS TABLE (
    schedule_id UUID,
    schedule_name VARCHAR(100),
    rotation_interval_days INTEGER,
    last_rotation_at TIMESTAMP,
    next_rotation_at TIMESTAMP,
    days_until_rotation INTEGER,
    should_notify BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        krs.id,
        krs.schedule_name,
        krs.rotation_interval_days,
        krs.last_rotation_at,
        krs.next_rotation_at,
        EXTRACT(DAY FROM (krs.next_rotation_at - CURRENT_TIMESTAMP))::INTEGER AS days_until_rotation,
        EXTRACT(DAY FROM (krs.next_rotation_at - CURRENT_TIMESTAMP))::INTEGER <= krs.notify_before_days AS should_notify
    FROM key_rotation_schedule krs
    WHERE krs.enabled = TRUE
      AND krs.next_rotation_at > CURRENT_TIMESTAMP
      AND krs.next_rotation_at <= (CURRENT_TIMESTAMP + (p_days_ahead || ' days')::INTERVAL)
    ORDER BY krs.next_rotation_at ASC;
END;
$$ LANGUAGE plpgsql;

-- Function: record_key_usage
-- Records key usage for metrics (called by encryption service)
CREATE OR REPLACE FUNCTION record_key_usage(
    p_key_version INTEGER,
    p_operation_type VARCHAR(50)
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO key_usage_metrics (
        key_version,
        operation_type,
        usage_count,
        last_used_at,
        metrics_date
    ) VALUES (
        p_key_version,
        p_operation_type,
        1,
        CURRENT_TIMESTAMP,
        CURRENT_DATE
    )
    ON CONFLICT (key_version, operation_type, metrics_date)
    DO UPDATE SET
        usage_count = key_usage_metrics.usage_count + 1,
        last_used_at = CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql;

-- Function: get_key_usage_summary
-- Returns usage summary for all keys
CREATE OR REPLACE FUNCTION get_key_usage_summary(p_days_back INTEGER DEFAULT 30)
RETURNS TABLE (
    key_version INTEGER,
    is_active BOOLEAN,
    key_purpose VARCHAR(100),
    total_encryptions BIGINT,
    total_decryptions BIGINT,
    last_encryption_at TIMESTAMP,
    last_decryption_at TIMESTAMP,
    days_since_creation INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ek.key_version,
        ek.is_active,
        ek.key_purpose,
        COALESCE(SUM(CASE WHEN kum.operation_type = 'encrypt' THEN kum.usage_count ELSE 0 END), 0) AS total_encryptions,
        COALESCE(SUM(CASE WHEN kum.operation_type = 'decrypt' THEN kum.usage_count ELSE 0 END), 0) AS total_decryptions,
        MAX(CASE WHEN kum.operation_type = 'encrypt' THEN kum.last_used_at END) AS last_encryption_at,
        MAX(CASE WHEN kum.operation_type = 'decrypt' THEN kum.last_used_at END) AS last_decryption_at,
        EXTRACT(DAY FROM (CURRENT_TIMESTAMP - ek.created_at))::INTEGER AS days_since_creation
    FROM encryption_keys ek
    LEFT JOIN key_usage_metrics kum ON kum.key_version = ek.key_version
        AND kum.metrics_date >= CURRENT_DATE - (p_days_back || ' days')::INTERVAL
    GROUP BY ek.key_version, ek.is_active, ek.key_purpose, ek.created_at
    ORDER BY ek.key_version DESC;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- VIEWS
-- ============================================================================

-- View: rotation_status_summary
-- Summary of rotation statuses
CREATE OR REPLACE VIEW rotation_status_summary AS
SELECT
    rotation_status,
    COUNT(*) AS rotation_count,
    MIN(started_at) AS earliest_rotation,
    MAX(completed_at) AS latest_rotation,
    AVG(EXTRACT(EPOCH FROM (completed_at - started_at))) AS avg_duration_seconds,
    SUM(records_re_encrypted) AS total_records_re_encrypted,
    SUM(records_failed) AS total_records_failed
FROM key_rotation_history
GROUP BY rotation_status;

-- View: active_encryption_keys_view
-- View of all active encryption keys
CREATE OR REPLACE VIEW active_encryption_keys_view AS
SELECT
    ek.id,
    ek.key_version,
    ek.algorithm,
    ek.key_purpose,
    ek.is_active,
    ek.created_at,
    ek.activated_at,
    EXTRACT(DAY FROM (CURRENT_TIMESTAMP - ek.created_at))::INTEGER AS days_active,
    u.username AS created_by_username
FROM encryption_keys ek
LEFT JOIN users u ON u.id = ek.created_by
WHERE ek.is_active = TRUE OR ek.key_purpose IN ('primary', 'backup');

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Trigger: update_rotation_schedule_timestamp
CREATE OR REPLACE FUNCTION update_rotation_schedule_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_rotation_schedule_timestamp
    BEFORE UPDATE ON key_rotation_schedule
    FOR EACH ROW
    EXECUTE FUNCTION update_rotation_schedule_timestamp();

-- ============================================================================
-- DEFAULT DATA
-- ============================================================================

-- Create default rotation schedule
INSERT INTO key_rotation_schedule (
    schedule_name,
    rotation_interval_days,
    enabled,
    auto_rotate,
    notify_before_days,
    next_rotation_at
) VALUES (
    'default_90_day_rotation',
    90, -- Rotate every 90 days
    TRUE,
    FALSE, -- Manual approval required by default
    7, -- Notify 7 days before
    CURRENT_TIMESTAMP + INTERVAL '90 days'
) ON CONFLICT (schedule_name) DO NOTHING;

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE encryption_keys IS 'Tracks all encryption keys with versioning and lifecycle management';
COMMENT ON TABLE key_rotation_history IS 'Complete audit trail of all key rotation events';
COMMENT ON TABLE key_rotation_schedule IS 'Configurable schedules for automated key rotation';
COMMENT ON TABLE re_encryption_queue IS 'Queue for tracking records during key rotation';
COMMENT ON TABLE key_usage_metrics IS 'Metrics tracking encryption/decryption operations per key';

COMMENT ON FUNCTION get_active_key_version() IS 'Returns the currently active encryption key version';
COMMENT ON FUNCTION activate_key(INTEGER) IS 'Activates a key version and deactivates all others';
COMMENT ON FUNCTION register_new_key(VARCHAR, VARCHAR, UUID, JSONB) IS 'Registers a new encryption key';
COMMENT ON FUNCTION start_key_rotation(VARCHAR, INTEGER, UUID, JSONB) IS 'Initiates a new key rotation process';
COMMENT ON FUNCTION complete_key_rotation(UUID, INTEGER, INTEGER) IS 'Marks a key rotation as completed successfully';
COMMENT ON FUNCTION fail_key_rotation(UUID, TEXT) IS 'Marks a key rotation as failed';
COMMENT ON FUNCTION get_rotation_statistics(UUID) IS 'Returns detailed statistics for a rotation';
COMMENT ON FUNCTION get_due_rotations() IS 'Returns rotation schedules that are currently due';
COMMENT ON FUNCTION get_upcoming_rotations(INTEGER) IS 'Returns rotation schedules coming up in specified days';
COMMENT ON FUNCTION record_key_usage(INTEGER, VARCHAR) IS 'Records key usage for metrics tracking';
COMMENT ON FUNCTION get_key_usage_summary(INTEGER) IS 'Returns usage summary for all encryption keys';
