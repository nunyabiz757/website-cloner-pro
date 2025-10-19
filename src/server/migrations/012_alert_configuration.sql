-- Migration: Alert Configuration
-- Description: Create tables for security alert configuration and history
-- Created: 2025-01-15

-- Alert configuration table
CREATE TABLE IF NOT EXISTS alert_configurations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    enabled BOOLEAN DEFAULT TRUE,

    -- Alert conditions
    event_types TEXT[] NOT NULL, -- Array of event types to monitor
    severity_levels TEXT[] NOT NULL, -- Array of severity levels (critical, high, medium, low)
    threshold_count INTEGER DEFAULT 1, -- Number of events before alerting
    threshold_window_minutes INTEGER DEFAULT 5, -- Time window for threshold

    -- Alert channels
    email_enabled BOOLEAN DEFAULT FALSE,
    email_recipients TEXT[], -- Array of email addresses
    slack_enabled BOOLEAN DEFAULT FALSE,
    slack_webhook_url TEXT,
    slack_channel VARCHAR(255),

    -- Alert settings
    cooldown_minutes INTEGER DEFAULT 60, -- Cooldown period between alerts
    priority VARCHAR(50) DEFAULT 'medium', -- low, medium, high, urgent
    include_details BOOLEAN DEFAULT TRUE,
    aggregate_similar BOOLEAN DEFAULT TRUE, -- Aggregate similar events

    -- Metadata
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_triggered_at TIMESTAMP,
    trigger_count INTEGER DEFAULT 0,

    CONSTRAINT valid_priority CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
    CONSTRAINT valid_threshold CHECK (threshold_count > 0),
    CONSTRAINT valid_window CHECK (threshold_window_minutes > 0),
    CONSTRAINT valid_cooldown CHECK (cooldown_minutes >= 0)
);

-- Alert history table
CREATE TABLE IF NOT EXISTS alert_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_configuration_id UUID REFERENCES alert_configurations(id) ON DELETE CASCADE,

    -- Alert details
    title VARCHAR(500) NOT NULL,
    message TEXT NOT NULL,
    severity VARCHAR(50) NOT NULL,
    priority VARCHAR(50) NOT NULL,
    event_count INTEGER DEFAULT 1,

    -- Related events
    security_event_ids UUID[], -- Array of security event IDs that triggered this alert

    -- Delivery status
    email_sent BOOLEAN DEFAULT FALSE,
    email_sent_at TIMESTAMP,
    email_error TEXT,
    slack_sent BOOLEAN DEFAULT FALSE,
    slack_sent_at TIMESTAMP,
    slack_error TEXT,

    -- Metadata
    triggered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT valid_severity CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    CONSTRAINT valid_priority CHECK (priority IN ('low', 'medium', 'high', 'urgent'))
);

-- Alert suppression table (for cooldown management)
CREATE TABLE IF NOT EXISTS alert_suppressions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_configuration_id UUID REFERENCES alert_configurations(id) ON DELETE CASCADE,
    suppressed_until TIMESTAMP NOT NULL,
    reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT unique_suppression UNIQUE (alert_configuration_id, suppressed_until)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_alert_configs_enabled ON alert_configurations(enabled);
CREATE INDEX IF NOT EXISTS idx_alert_configs_event_types ON alert_configurations USING GIN(event_types);
CREATE INDEX IF NOT EXISTS idx_alert_configs_severity ON alert_configurations USING GIN(severity_levels);
CREATE INDEX IF NOT EXISTS idx_alert_history_config ON alert_history(alert_configuration_id);
CREATE INDEX IF NOT EXISTS idx_alert_history_triggered ON alert_history(triggered_at);
CREATE INDEX IF NOT EXISTS idx_alert_history_severity ON alert_history(severity);
CREATE INDEX IF NOT EXISTS idx_alert_suppressions_config ON alert_suppressions(alert_configuration_id);
CREATE INDEX IF NOT EXISTS idx_alert_suppressions_until ON alert_suppressions(suppressed_until);

-- Function to check if alert should be triggered
CREATE OR REPLACE FUNCTION should_trigger_alert(
    p_alert_config_id UUID,
    p_event_type VARCHAR,
    p_severity VARCHAR
) RETURNS BOOLEAN AS $$
DECLARE
    v_config RECORD;
    v_recent_events INTEGER;
    v_suppressed BOOLEAN;
BEGIN
    -- Get alert configuration
    SELECT * INTO v_config
    FROM alert_configurations
    WHERE id = p_alert_config_id AND enabled = TRUE;

    IF NOT FOUND THEN
        RETURN FALSE;
    END IF;

    -- Check if event type matches
    IF NOT (p_event_type = ANY(v_config.event_types)) THEN
        RETURN FALSE;
    END IF;

    -- Check if severity matches
    IF NOT (p_severity = ANY(v_config.severity_levels)) THEN
        RETURN FALSE;
    END IF;

    -- Check if alert is suppressed (cooldown)
    SELECT EXISTS(
        SELECT 1 FROM alert_suppressions
        WHERE alert_configuration_id = p_alert_config_id
        AND suppressed_until > CURRENT_TIMESTAMP
    ) INTO v_suppressed;

    IF v_suppressed THEN
        RETURN FALSE;
    END IF;

    -- Check threshold
    SELECT COUNT(*) INTO v_recent_events
    FROM security_events
    WHERE event_type = p_event_type
    AND severity = p_severity
    AND created_at > CURRENT_TIMESTAMP - (v_config.threshold_window_minutes || ' minutes')::INTERVAL;

    IF v_recent_events >= v_config.threshold_count THEN
        RETURN TRUE;
    END IF;

    RETURN FALSE;
END;
$$ LANGUAGE plpgsql;

-- Function to create alert suppression
CREATE OR REPLACE FUNCTION create_alert_suppression(
    p_alert_config_id UUID,
    p_cooldown_minutes INTEGER,
    p_reason TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
    v_suppression_id UUID;
BEGIN
    INSERT INTO alert_suppressions (
        alert_configuration_id,
        suppressed_until,
        reason
    ) VALUES (
        p_alert_config_id,
        CURRENT_TIMESTAMP + (p_cooldown_minutes || ' minutes')::INTERVAL,
        p_reason
    )
    RETURNING id INTO v_suppression_id;

    RETURN v_suppression_id;
END;
$$ LANGUAGE plpgsql;

-- Function to record alert trigger
CREATE OR REPLACE FUNCTION record_alert_trigger(
    p_alert_config_id UUID,
    p_title VARCHAR,
    p_message TEXT,
    p_severity VARCHAR,
    p_priority VARCHAR,
    p_event_ids UUID[],
    p_email_sent BOOLEAN DEFAULT FALSE,
    p_slack_sent BOOLEAN DEFAULT FALSE
) RETURNS UUID AS $$
DECLARE
    v_history_id UUID;
BEGIN
    -- Insert alert history
    INSERT INTO alert_history (
        alert_configuration_id,
        title,
        message,
        severity,
        priority,
        event_count,
        security_event_ids,
        email_sent,
        slack_sent
    ) VALUES (
        p_alert_config_id,
        p_title,
        p_message,
        p_severity,
        p_priority,
        COALESCE(array_length(p_event_ids, 1), 0),
        p_event_ids,
        p_email_sent,
        p_slack_sent
    )
    RETURNING id INTO v_history_id;

    -- Update alert configuration
    UPDATE alert_configurations
    SET last_triggered_at = CURRENT_TIMESTAMP,
        trigger_count = trigger_count + 1
    WHERE id = p_alert_config_id;

    RETURN v_history_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get active alerts for an event
CREATE OR REPLACE FUNCTION get_active_alerts_for_event(
    p_event_type VARCHAR,
    p_severity VARCHAR
) RETURNS TABLE(
    alert_id UUID,
    alert_name VARCHAR,
    threshold_count INTEGER,
    threshold_window_minutes INTEGER,
    cooldown_minutes INTEGER,
    email_enabled BOOLEAN,
    email_recipients TEXT[],
    slack_enabled BOOLEAN,
    slack_webhook_url TEXT,
    slack_channel VARCHAR,
    priority VARCHAR,
    include_details BOOLEAN,
    aggregate_similar BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ac.id,
        ac.name,
        ac.threshold_count,
        ac.threshold_window_minutes,
        ac.cooldown_minutes,
        ac.email_enabled,
        ac.email_recipients,
        ac.slack_enabled,
        ac.slack_webhook_url,
        ac.slack_channel,
        ac.priority,
        ac.include_details,
        ac.aggregate_similar
    FROM alert_configurations ac
    WHERE ac.enabled = TRUE
    AND p_event_type = ANY(ac.event_types)
    AND p_severity = ANY(ac.severity_levels)
    AND NOT EXISTS (
        SELECT 1 FROM alert_suppressions asup
        WHERE asup.alert_configuration_id = ac.id
        AND asup.suppressed_until > CURRENT_TIMESTAMP
    );
END;
$$ LANGUAGE plpgsql;

-- Function to clean up old suppressions
CREATE OR REPLACE FUNCTION cleanup_expired_suppressions() RETURNS INTEGER AS $$
DECLARE
    v_deleted_count INTEGER;
BEGIN
    DELETE FROM alert_suppressions
    WHERE suppressed_until < CURRENT_TIMESTAMP;

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get alert statistics
CREATE OR REPLACE FUNCTION get_alert_statistics(
    p_days INTEGER DEFAULT 30
) RETURNS TABLE(
    total_alerts INTEGER,
    critical_alerts INTEGER,
    high_priority_alerts INTEGER,
    email_success_rate NUMERIC,
    slack_success_rate NUMERIC,
    most_triggered_alert VARCHAR,
    most_triggered_count INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*)::INTEGER AS total_alerts,
        COUNT(*) FILTER (WHERE severity = 'critical')::INTEGER AS critical_alerts,
        COUNT(*) FILTER (WHERE priority = 'urgent' OR priority = 'high')::INTEGER AS high_priority_alerts,
        ROUND(
            (COUNT(*) FILTER (WHERE email_sent = TRUE AND email_error IS NULL)::NUMERIC /
            NULLIF(COUNT(*) FILTER (WHERE email_sent = TRUE)::NUMERIC, 0)) * 100,
            2
        ) AS email_success_rate,
        ROUND(
            (COUNT(*) FILTER (WHERE slack_sent = TRUE AND slack_error IS NULL)::NUMERIC /
            NULLIF(COUNT(*) FILTER (WHERE slack_sent = TRUE)::NUMERIC, 0)) * 100,
            2
        ) AS slack_success_rate,
        (
            SELECT ac.name
            FROM alert_configurations ac
            WHERE ac.id = (
                SELECT alert_configuration_id
                FROM alert_history
                WHERE triggered_at > CURRENT_TIMESTAMP - (p_days || ' days')::INTERVAL
                GROUP BY alert_configuration_id
                ORDER BY COUNT(*) DESC
                LIMIT 1
            )
        ) AS most_triggered_alert,
        (
            SELECT COUNT(*)::INTEGER
            FROM alert_history
            WHERE triggered_at > CURRENT_TIMESTAMP - (p_days || ' days')::INTERVAL
            GROUP BY alert_configuration_id
            ORDER BY COUNT(*) DESC
            LIMIT 1
        ) AS most_triggered_count
    FROM alert_history
    WHERE triggered_at > CURRENT_TIMESTAMP - (p_days || ' days')::INTERVAL;
END;
$$ LANGUAGE plpgsql;

-- View for alert dashboard
CREATE OR REPLACE VIEW alert_dashboard AS
SELECT
    ac.id,
    ac.name,
    ac.description,
    ac.enabled,
    ac.event_types,
    ac.severity_levels,
    ac.priority,
    ac.email_enabled,
    ac.slack_enabled,
    ac.trigger_count,
    ac.last_triggered_at,
    COUNT(ah.id) FILTER (WHERE ah.triggered_at > CURRENT_TIMESTAMP - INTERVAL '24 hours') AS triggers_24h,
    COUNT(ah.id) FILTER (WHERE ah.triggered_at > CURRENT_TIMESTAMP - INTERVAL '7 days') AS triggers_7d,
    COUNT(ah.id) FILTER (WHERE ah.triggered_at > CURRENT_TIMESTAMP - INTERVAL '30 days') AS triggers_30d,
    EXISTS(
        SELECT 1 FROM alert_suppressions asup
        WHERE asup.alert_configuration_id = ac.id
        AND asup.suppressed_until > CURRENT_TIMESTAMP
    ) AS is_suppressed,
    (
        SELECT suppressed_until
        FROM alert_suppressions
        WHERE alert_configuration_id = ac.id
        AND suppressed_until > CURRENT_TIMESTAMP
        ORDER BY suppressed_until DESC
        LIMIT 1
    ) AS suppressed_until
FROM alert_configurations ac
LEFT JOIN alert_history ah ON ac.id = ah.alert_configuration_id
GROUP BY ac.id;

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_alert_config_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_alert_config_timestamp
    BEFORE UPDATE ON alert_configurations
    FOR EACH ROW
    EXECUTE FUNCTION update_alert_config_timestamp();

-- Insert default alert configurations
INSERT INTO alert_configurations (
    name,
    description,
    event_types,
    severity_levels,
    threshold_count,
    threshold_window_minutes,
    email_enabled,
    slack_enabled,
    priority,
    cooldown_minutes
) VALUES
(
    'Critical Security Events',
    'Alert on any critical security event',
    ARRAY['brute_force', 'sql_injection', 'xss_attempt', 'session_hijack', 'api_key_denied'],
    ARRAY['critical'],
    1,
    5,
    TRUE,
    TRUE,
    'urgent',
    30
),
(
    'Failed Login Attempts',
    'Alert on multiple failed login attempts',
    ARRAY['login_failed'],
    ARRAY['high', 'medium'],
    5,
    10,
    TRUE,
    TRUE,
    'high',
    60
),
(
    'API Key Issues',
    'Alert on API key authentication failures',
    ARRAY['api_key_denied', 'api_key_expired'],
    ARRAY['high', 'critical'],
    3,
    15,
    TRUE,
    FALSE,
    'medium',
    120
),
(
    'Malicious File Uploads',
    'Alert on malicious file detection',
    ARRAY['archive_bomb', 'malicious_file'],
    ARRAY['critical', 'high'],
    1,
    5,
    TRUE,
    TRUE,
    'urgent',
    15
);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON alert_configurations TO website_cloner_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON alert_history TO website_cloner_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON alert_suppressions TO website_cloner_app;
GRANT SELECT ON alert_dashboard TO website_cloner_app;

-- Comments
COMMENT ON TABLE alert_configurations IS 'Configuration for security alert rules';
COMMENT ON TABLE alert_history IS 'History of triggered security alerts';
COMMENT ON TABLE alert_suppressions IS 'Temporary suppressions for alert cooldown periods';
COMMENT ON FUNCTION should_trigger_alert IS 'Check if an alert should be triggered for an event';
COMMENT ON FUNCTION get_active_alerts_for_event IS 'Get all active alert configurations for an event type and severity';
COMMENT ON VIEW alert_dashboard IS 'Dashboard view of alert configurations with statistics';
