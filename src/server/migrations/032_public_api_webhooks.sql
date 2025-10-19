-- =====================================================================================
-- Phase 5 Feature 5: Public API & Webhooks
-- =====================================================================================
-- This migration creates the infrastructure for:
-- 1. API Key Management - Secure key generation and rotation
-- 2. Rate Limiting - Per-key request throttling
-- 3. Usage Tracking - Detailed API usage analytics
-- 4. Webhook System - Event-driven integrations
-- 5. Webhook Delivery - Retry logic and delivery tracking
-- 6. API Versioning - Support for multiple API versions
-- 7. Developer Portal - API documentation and testing
-- =====================================================================================

-- =====================================================================================
-- TABLE 1: api_keys
-- Stores API keys for authentication and authorization
-- =====================================================================================
CREATE TABLE IF NOT EXISTS api_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Key Information
    key_name VARCHAR(200) NOT NULL,
    api_key VARCHAR(255) UNIQUE NOT NULL, -- Hashed key stored
    key_prefix VARCHAR(20) NOT NULL, -- First chars for identification (e.g., "pk_live_")
    key_type VARCHAR(50) NOT NULL DEFAULT 'standard', -- standard, restricted, admin

    -- API Version
    api_version VARCHAR(20) DEFAULT 'v1',

    -- Status
    status VARCHAR(50) DEFAULT 'active', -- active, revoked, expired, suspended

    -- Rate Limiting
    rate_limit_per_minute INTEGER DEFAULT 60,
    rate_limit_per_hour INTEGER DEFAULT 1000,
    rate_limit_per_day INTEGER DEFAULT 10000,

    -- Scopes and Permissions (JSON array of allowed scopes)
    scopes JSONB DEFAULT '[]'::jsonb, -- ["templates:read", "templates:write", etc.]

    -- IP Restrictions (JSON array of allowed IPs/CIDR blocks)
    allowed_ips JSONB DEFAULT '[]'::jsonb, -- ["192.168.1.0/24", "10.0.0.1"]

    -- Allowed Origins (for CORS)
    allowed_origins JSONB DEFAULT '[]'::jsonb, -- ["https://example.com"]

    -- Usage Statistics
    total_requests BIGINT DEFAULT 0,
    last_used_at TIMESTAMPTZ,
    last_used_ip VARCHAR(45), -- IPv6 support

    -- Expiration
    expires_at TIMESTAMPTZ,

    -- Metadata
    description TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    revoked_at TIMESTAMPTZ,
    revoked_reason TEXT,

    -- Indexes
    CONSTRAINT valid_key_type CHECK (key_type IN ('standard', 'restricted', 'admin')),
    CONSTRAINT valid_status CHECK (status IN ('active', 'revoked', 'expired', 'suspended'))
);

CREATE INDEX idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX idx_api_keys_status ON api_keys(status);
CREATE INDEX idx_api_keys_key_prefix ON api_keys(key_prefix);
CREATE INDEX idx_api_keys_expires_at ON api_keys(expires_at) WHERE expires_at IS NOT NULL;

-- =====================================================================================
-- TABLE 2: api_usage_logs
-- Detailed logs of API requests for analytics and debugging
-- =====================================================================================
CREATE TABLE IF NOT EXISTS api_usage_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    api_key_id UUID REFERENCES api_keys(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,

    -- Request Information
    method VARCHAR(10) NOT NULL, -- GET, POST, PUT, DELETE, etc.
    endpoint VARCHAR(500) NOT NULL,
    api_version VARCHAR(20),

    -- Request Details
    request_headers JSONB,
    request_body JSONB,
    query_params JSONB,

    -- Response Information
    status_code INTEGER NOT NULL,
    response_time_ms INTEGER, -- Response time in milliseconds
    response_size_bytes INTEGER,

    -- Client Information
    ip_address VARCHAR(45),
    user_agent TEXT,
    referer TEXT,

    -- Rate Limiting
    rate_limit_hit BOOLEAN DEFAULT false,
    rate_limit_remaining INTEGER,

    -- Error Tracking
    error_message TEXT,
    error_code VARCHAR(100),

    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,

    -- Timestamp
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_api_usage_logs_api_key_id ON api_usage_logs(api_key_id);
CREATE INDEX idx_api_usage_logs_user_id ON api_usage_logs(user_id);
CREATE INDEX idx_api_usage_logs_created_at ON api_usage_logs(created_at);
CREATE INDEX idx_api_usage_logs_endpoint ON api_usage_logs(endpoint);
CREATE INDEX idx_api_usage_logs_status_code ON api_usage_logs(status_code);

-- =====================================================================================
-- TABLE 3: api_rate_limits
-- Tracks rate limit buckets for fine-grained control
-- =====================================================================================
CREATE TABLE IF NOT EXISTS api_rate_limits (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    api_key_id UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,

    -- Rate Limit Window
    window_type VARCHAR(20) NOT NULL, -- minute, hour, day
    window_start TIMESTAMPTZ NOT NULL,
    window_end TIMESTAMPTZ NOT NULL,

    -- Counters
    request_count INTEGER DEFAULT 0,
    limit_amount INTEGER NOT NULL,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT valid_window_type CHECK (window_type IN ('minute', 'hour', 'day')),
    UNIQUE(api_key_id, window_type, window_start)
);

CREATE INDEX idx_api_rate_limits_api_key_id ON api_rate_limits(api_key_id);
CREATE INDEX idx_api_rate_limits_window ON api_rate_limits(window_start, window_end);

-- =====================================================================================
-- TABLE 4: webhooks
-- Webhook endpoint configurations
-- =====================================================================================
CREATE TABLE IF NOT EXISTS webhooks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Webhook Configuration
    webhook_name VARCHAR(200) NOT NULL,
    url TEXT NOT NULL, -- Target URL to send webhooks
    secret VARCHAR(255) NOT NULL, -- For HMAC signature verification

    -- Status
    status VARCHAR(50) DEFAULT 'active', -- active, disabled, failed

    -- Events to subscribe to (JSON array)
    events JSONB DEFAULT '[]'::jsonb, -- ["template.created", "template.updated", etc.]

    -- Delivery Settings
    max_retries INTEGER DEFAULT 3,
    retry_delay_seconds INTEGER DEFAULT 60, -- Initial retry delay (exponential backoff)
    timeout_seconds INTEGER DEFAULT 30,

    -- HTTP Settings
    headers JSONB DEFAULT '{}'::jsonb, -- Custom headers to send
    http_method VARCHAR(10) DEFAULT 'POST',

    -- Filtering
    filters JSONB DEFAULT '{}'::jsonb, -- Additional filters for events

    -- Statistics
    total_deliveries BIGINT DEFAULT 0,
    successful_deliveries BIGINT DEFAULT 0,
    failed_deliveries BIGINT DEFAULT 0,
    last_delivery_at TIMESTAMPTZ,
    last_success_at TIMESTAMPTZ,
    last_failure_at TIMESTAMPTZ,

    -- Failure Handling
    consecutive_failures INTEGER DEFAULT 0,
    disabled_at TIMESTAMPTZ,
    disabled_reason TEXT,

    -- Metadata
    description TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT valid_status CHECK (status IN ('active', 'disabled', 'failed')),
    CONSTRAINT valid_http_method CHECK (http_method IN ('POST', 'PUT', 'PATCH'))
);

CREATE INDEX idx_webhooks_user_id ON webhooks(user_id);
CREATE INDEX idx_webhooks_status ON webhooks(status);
CREATE INDEX idx_webhooks_events ON webhooks USING gin(events);

-- =====================================================================================
-- TABLE 5: webhook_deliveries
-- Tracks individual webhook delivery attempts
-- =====================================================================================
CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    webhook_id UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,

    -- Event Information
    event_type VARCHAR(100) NOT NULL,
    event_id UUID,
    payload JSONB NOT NULL,

    -- Delivery Attempt
    attempt_number INTEGER DEFAULT 1,
    status VARCHAR(50) DEFAULT 'pending', -- pending, success, failed, retrying

    -- Request Information
    request_url TEXT NOT NULL,
    request_headers JSONB,
    request_body JSONB,

    -- Response Information
    response_status_code INTEGER,
    response_headers JSONB,
    response_body TEXT,
    response_time_ms INTEGER,

    -- Error Tracking
    error_message TEXT,
    error_code VARCHAR(100),

    -- Retry Information
    next_retry_at TIMESTAMPTZ,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    sent_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,

    CONSTRAINT valid_delivery_status CHECK (status IN ('pending', 'success', 'failed', 'retrying'))
);

CREATE INDEX idx_webhook_deliveries_webhook_id ON webhook_deliveries(webhook_id);
CREATE INDEX idx_webhook_deliveries_status ON webhook_deliveries(status);
CREATE INDEX idx_webhook_deliveries_event_type ON webhook_deliveries(event_type);
CREATE INDEX idx_webhook_deliveries_next_retry ON webhook_deliveries(next_retry_at) WHERE status = 'retrying';
CREATE INDEX idx_webhook_deliveries_created_at ON webhook_deliveries(created_at);

-- =====================================================================================
-- TABLE 6: webhook_events
-- Event log for webhook-triggerable events
-- =====================================================================================
CREATE TABLE IF NOT EXISTS webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,

    -- Event Information
    event_type VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100) NOT NULL, -- template, user, team, etc.
    resource_id UUID,

    -- Event Payload
    payload JSONB NOT NULL,

    -- Processing Status
    processed BOOLEAN DEFAULT false,
    processed_at TIMESTAMPTZ,
    webhook_count INTEGER DEFAULT 0, -- Number of webhooks triggered

    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,

    -- Timestamp
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_webhook_events_user_id ON webhook_events(user_id);
CREATE INDEX idx_webhook_events_event_type ON webhook_events(event_type);
CREATE INDEX idx_webhook_events_processed ON webhook_events(processed) WHERE NOT processed;
CREATE INDEX idx_webhook_events_created_at ON webhook_events(created_at);

-- =====================================================================================
-- TABLE 7: api_documentation
-- Versioned API documentation and examples
-- =====================================================================================
CREATE TABLE IF NOT EXISTS api_documentation (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Documentation Information
    api_version VARCHAR(20) NOT NULL,
    endpoint VARCHAR(500) NOT NULL,
    http_method VARCHAR(10) NOT NULL,

    -- Content
    title VARCHAR(200) NOT NULL,
    description TEXT,

    -- Request Documentation
    request_parameters JSONB DEFAULT '[]'::jsonb,
    request_body_schema JSONB,
    request_headers JSONB DEFAULT '[]'::jsonb,

    -- Response Documentation
    response_schema JSONB,
    response_examples JSONB DEFAULT '[]'::jsonb,
    error_responses JSONB DEFAULT '[]'::jsonb,

    -- Code Examples
    code_examples JSONB DEFAULT '[]'::jsonb, -- [{language, code}]

    -- Metadata
    category VARCHAR(100), -- templates, users, webhooks, etc.
    tags JSONB DEFAULT '[]'::jsonb,
    deprecated BOOLEAN DEFAULT false,
    deprecation_message TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(api_version, endpoint, http_method)
);

CREATE INDEX idx_api_documentation_version ON api_documentation(api_version);
CREATE INDEX idx_api_documentation_category ON api_documentation(category);
CREATE INDEX idx_api_documentation_deprecated ON api_documentation(deprecated);

-- =====================================================================================
-- TABLE 8: api_scopes
-- Available API scopes and their permissions
-- =====================================================================================
CREATE TABLE IF NOT EXISTS api_scopes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Scope Information
    scope_name VARCHAR(100) UNIQUE NOT NULL, -- e.g., "templates:read"
    display_name VARCHAR(200) NOT NULL,
    description TEXT,

    -- Scope Category
    category VARCHAR(100) NOT NULL, -- templates, users, webhooks, etc.

    -- Permission Level
    permission_level VARCHAR(50) NOT NULL, -- read, write, delete, admin

    -- Requirements
    requires_scopes JSONB DEFAULT '[]'::jsonb, -- Other scopes this depends on

    -- Status
    is_default BOOLEAN DEFAULT false,
    is_dangerous BOOLEAN DEFAULT false, -- Requires special approval

    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT valid_permission_level CHECK (permission_level IN ('read', 'write', 'delete', 'admin'))
);

CREATE INDEX idx_api_scopes_category ON api_scopes(category);
CREATE INDEX idx_api_scopes_is_default ON api_scopes(is_default);

-- =====================================================================================
-- TABLE 9: api_quota_usage
-- Daily/monthly quota tracking for API usage
-- =====================================================================================
CREATE TABLE IF NOT EXISTS api_quota_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    api_key_id UUID REFERENCES api_keys(id) ON DELETE SET NULL,

    -- Quota Period
    period_type VARCHAR(20) NOT NULL, -- daily, monthly
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,

    -- Usage Counters
    requests_count BIGINT DEFAULT 0,
    bandwidth_bytes BIGINT DEFAULT 0,

    -- Quota Limits (NULL = unlimited)
    requests_limit BIGINT,
    bandwidth_limit BIGINT,

    -- Percentage Used
    requests_used_percent DECIMAL(5,2) DEFAULT 0.00,
    bandwidth_used_percent DECIMAL(5,2) DEFAULT 0.00,

    -- Overage
    requests_overage BIGINT DEFAULT 0,
    bandwidth_overage BIGINT DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT valid_period_type CHECK (period_type IN ('daily', 'monthly')),
    UNIQUE(user_id, api_key_id, period_type, period_start)
);

CREATE INDEX idx_api_quota_usage_user_id ON api_quota_usage(user_id);
CREATE INDEX idx_api_quota_usage_api_key_id ON api_quota_usage(api_key_id);
CREATE INDEX idx_api_quota_usage_period ON api_quota_usage(period_start, period_end);

-- =====================================================================================
-- FUNCTIONS
-- =====================================================================================

-- =====================================================================================
-- FUNCTION: update_api_key_usage
-- Updates API key usage statistics
-- =====================================================================================
CREATE OR REPLACE FUNCTION update_api_key_usage(
    p_api_key_id UUID,
    p_ip_address VARCHAR(45)
)
RETURNS void AS $$
BEGIN
    UPDATE api_keys
    SET
        total_requests = total_requests + 1,
        last_used_at = NOW(),
        last_used_ip = p_ip_address,
        updated_at = NOW()
    WHERE id = p_api_key_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================================
-- FUNCTION: check_rate_limit
-- Checks if API key has exceeded rate limits
-- =====================================================================================
CREATE OR REPLACE FUNCTION check_rate_limit(
    p_api_key_id UUID,
    p_window_type VARCHAR(20)
)
RETURNS TABLE(
    is_limited BOOLEAN,
    remaining INTEGER,
    reset_at TIMESTAMPTZ
) AS $$
DECLARE
    v_limit INTEGER;
    v_window_duration INTERVAL;
    v_window_start TIMESTAMPTZ;
    v_window_end TIMESTAMPTZ;
    v_current_count INTEGER;
BEGIN
    -- Determine window duration and limit
    CASE p_window_type
        WHEN 'minute' THEN
            v_window_duration := '1 minute'::interval;
            SELECT rate_limit_per_minute INTO v_limit FROM api_keys WHERE id = p_api_key_id;
        WHEN 'hour' THEN
            v_window_duration := '1 hour'::interval;
            SELECT rate_limit_per_hour INTO v_limit FROM api_keys WHERE id = p_api_key_id;
        WHEN 'day' THEN
            v_window_duration := '1 day'::interval;
            SELECT rate_limit_per_day INTO v_limit FROM api_keys WHERE id = p_api_key_id;
    END CASE;

    -- Calculate current window
    v_window_start := date_trunc(
        CASE p_window_type
            WHEN 'minute' THEN 'minute'
            WHEN 'hour' THEN 'hour'
            WHEN 'day' THEN 'day'
        END,
        NOW()
    );
    v_window_end := v_window_start + v_window_duration;

    -- Get or create rate limit record
    INSERT INTO api_rate_limits (api_key_id, window_type, window_start, window_end, limit_amount, request_count)
    VALUES (p_api_key_id, p_window_type, v_window_start, v_window_end, v_limit, 1)
    ON CONFLICT (api_key_id, window_type, window_start)
    DO UPDATE SET
        request_count = api_rate_limits.request_count + 1,
        updated_at = NOW()
    RETURNING api_rate_limits.request_count INTO v_current_count;

    -- Return result
    RETURN QUERY SELECT
        v_current_count > v_limit AS is_limited,
        GREATEST(0, v_limit - v_current_count) AS remaining,
        v_window_end AS reset_at;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================================
-- FUNCTION: create_webhook_delivery
-- Creates a webhook delivery record
-- =====================================================================================
CREATE OR REPLACE FUNCTION create_webhook_delivery(
    p_webhook_id UUID,
    p_event_type VARCHAR(100),
    p_event_id UUID,
    p_payload JSONB
)
RETURNS UUID AS $$
DECLARE
    v_delivery_id UUID;
    v_webhook_url TEXT;
    v_max_retries INTEGER;
BEGIN
    -- Get webhook configuration
    SELECT url, max_retries
    INTO v_webhook_url, v_max_retries
    FROM webhooks
    WHERE id = p_webhook_id AND status = 'active';

    IF v_webhook_url IS NULL THEN
        RAISE EXCEPTION 'Webhook not found or not active';
    END IF;

    -- Create delivery record
    INSERT INTO webhook_deliveries (
        webhook_id,
        event_type,
        event_id,
        payload,
        request_url,
        max_retries,
        status
    ) VALUES (
        p_webhook_id,
        p_event_type,
        p_event_id,
        p_payload,
        v_webhook_url,
        v_max_retries,
        'pending'
    ) RETURNING id INTO v_delivery_id;

    RETURN v_delivery_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================================
-- FUNCTION: update_webhook_stats
-- Updates webhook statistics after delivery attempt
-- =====================================================================================
CREATE OR REPLACE FUNCTION update_webhook_stats(
    p_webhook_id UUID,
    p_success BOOLEAN
)
RETURNS void AS $$
BEGIN
    UPDATE webhooks
    SET
        total_deliveries = total_deliveries + 1,
        successful_deliveries = CASE WHEN p_success THEN successful_deliveries + 1 ELSE successful_deliveries END,
        failed_deliveries = CASE WHEN NOT p_success THEN failed_deliveries + 1 ELSE failed_deliveries END,
        last_delivery_at = NOW(),
        last_success_at = CASE WHEN p_success THEN NOW() ELSE last_success_at END,
        last_failure_at = CASE WHEN NOT p_success THEN NOW() ELSE last_failure_at END,
        consecutive_failures = CASE
            WHEN p_success THEN 0
            ELSE consecutive_failures + 1
        END,
        status = CASE
            WHEN NOT p_success AND consecutive_failures + 1 >= 10 THEN 'failed'
            ELSE status
        END,
        updated_at = NOW()
    WHERE id = p_webhook_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================================
-- FUNCTION: get_pending_webhook_deliveries
-- Gets webhook deliveries that need to be sent or retried
-- =====================================================================================
CREATE OR REPLACE FUNCTION get_pending_webhook_deliveries(
    p_limit INTEGER DEFAULT 100
)
RETURNS TABLE(
    delivery_id UUID,
    webhook_id UUID,
    webhook_url TEXT,
    webhook_secret VARCHAR(255),
    event_type VARCHAR(100),
    payload JSONB,
    headers JSONB,
    attempt_number INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        wd.id,
        wd.webhook_id,
        w.url,
        w.secret,
        wd.event_type,
        wd.payload,
        w.headers,
        wd.attempt_number
    FROM webhook_deliveries wd
    JOIN webhooks w ON w.id = wd.webhook_id
    WHERE
        (wd.status = 'pending' OR (wd.status = 'retrying' AND wd.next_retry_at <= NOW()))
        AND w.status = 'active'
        AND wd.retry_count < wd.max_retries
    ORDER BY wd.created_at ASC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================================
-- FUNCTION: log_api_request
-- Logs an API request for analytics
-- =====================================================================================
CREATE OR REPLACE FUNCTION log_api_request(
    p_api_key_id UUID,
    p_user_id UUID,
    p_method VARCHAR(10),
    p_endpoint VARCHAR(500),
    p_status_code INTEGER,
    p_response_time_ms INTEGER,
    p_ip_address VARCHAR(45),
    p_rate_limit_hit BOOLEAN DEFAULT false
)
RETURNS UUID AS $$
DECLARE
    v_log_id UUID;
BEGIN
    INSERT INTO api_usage_logs (
        api_key_id,
        user_id,
        method,
        endpoint,
        status_code,
        response_time_ms,
        ip_address,
        rate_limit_hit
    ) VALUES (
        p_api_key_id,
        p_user_id,
        p_method,
        p_endpoint,
        p_status_code,
        p_response_time_ms,
        p_ip_address,
        p_rate_limit_hit
    ) RETURNING id INTO v_log_id;

    RETURN v_log_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================================
-- FUNCTION: get_api_key_statistics
-- Gets comprehensive statistics for an API key
-- =====================================================================================
CREATE OR REPLACE FUNCTION get_api_key_statistics(
    p_api_key_id UUID,
    p_start_date TIMESTAMPTZ DEFAULT NOW() - INTERVAL '30 days',
    p_end_date TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TABLE(
    total_requests BIGINT,
    successful_requests BIGINT,
    failed_requests BIGINT,
    avg_response_time_ms NUMERIC,
    rate_limit_hits BIGINT,
    unique_endpoints INTEGER,
    bandwidth_bytes BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*)::BIGINT,
        COUNT(*) FILTER (WHERE status_code < 400)::BIGINT,
        COUNT(*) FILTER (WHERE status_code >= 400)::BIGINT,
        AVG(response_time_ms)::NUMERIC,
        COUNT(*) FILTER (WHERE rate_limit_hit = true)::BIGINT,
        COUNT(DISTINCT endpoint)::INTEGER,
        SUM(COALESCE(response_size_bytes, 0))::BIGINT
    FROM api_usage_logs
    WHERE
        api_key_id = p_api_key_id
        AND created_at BETWEEN p_start_date AND p_end_date;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================================
-- FUNCTION: update_quota_usage
-- Updates quota usage for a user/API key
-- =====================================================================================
CREATE OR REPLACE FUNCTION update_quota_usage(
    p_user_id UUID,
    p_api_key_id UUID,
    p_period_type VARCHAR(20),
    p_requests INTEGER DEFAULT 1,
    p_bandwidth_bytes BIGINT DEFAULT 0
)
RETURNS void AS $$
DECLARE
    v_period_start TIMESTAMPTZ;
    v_period_end TIMESTAMPTZ;
BEGIN
    -- Calculate period boundaries
    CASE p_period_type
        WHEN 'daily' THEN
            v_period_start := date_trunc('day', NOW());
            v_period_end := v_period_start + INTERVAL '1 day';
        WHEN 'monthly' THEN
            v_period_start := date_trunc('month', NOW());
            v_period_end := v_period_start + INTERVAL '1 month';
    END CASE;

    -- Upsert quota usage
    INSERT INTO api_quota_usage (
        user_id,
        api_key_id,
        period_type,
        period_start,
        period_end,
        requests_count,
        bandwidth_bytes
    ) VALUES (
        p_user_id,
        p_api_key_id,
        p_period_type,
        v_period_start,
        v_period_end,
        p_requests,
        p_bandwidth_bytes
    )
    ON CONFLICT (user_id, api_key_id, period_type, period_start)
    DO UPDATE SET
        requests_count = api_quota_usage.requests_count + p_requests,
        bandwidth_bytes = api_quota_usage.bandwidth_bytes + p_bandwidth_bytes,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- =====================================================================================
-- TRIGGERS
-- =====================================================================================

-- Trigger function to update timestamps
CREATE OR REPLACE FUNCTION update_api_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply timestamp triggers
CREATE TRIGGER api_keys_update_timestamp
    BEFORE UPDATE ON api_keys
    FOR EACH ROW
    EXECUTE FUNCTION update_api_timestamp();

CREATE TRIGGER webhooks_update_timestamp
    BEFORE UPDATE ON webhooks
    FOR EACH ROW
    EXECUTE FUNCTION update_api_timestamp();

CREATE TRIGGER api_documentation_update_timestamp
    BEFORE UPDATE ON api_documentation
    FOR EACH ROW
    EXECUTE FUNCTION update_api_timestamp();

CREATE TRIGGER api_scopes_update_timestamp
    BEFORE UPDATE ON api_scopes
    FOR EACH ROW
    EXECUTE FUNCTION update_api_timestamp();

-- =====================================================================================
-- SEED DATA: Default API Scopes
-- =====================================================================================

INSERT INTO api_scopes (scope_name, display_name, description, category, permission_level, is_default) VALUES
-- Template Scopes
('templates:read', 'Read Templates', 'View template information', 'templates', 'read', true),
('templates:write', 'Write Templates', 'Create and update templates', 'templates', 'write', false),
('templates:delete', 'Delete Templates', 'Delete templates', 'templates', 'delete', false),

-- User Scopes
('users:read', 'Read User Profile', 'View user profile information', 'users', 'read', true),
('users:write', 'Update User Profile', 'Update user profile', 'users', 'write', false),

-- Webhook Scopes
('webhooks:read', 'Read Webhooks', 'View webhook configurations', 'webhooks', 'read', false),
('webhooks:write', 'Manage Webhooks', 'Create and update webhooks', 'webhooks', 'write', false),

-- API Key Scopes
('api_keys:read', 'Read API Keys', 'View API key information', 'api_keys', 'read', false),
('api_keys:write', 'Manage API Keys', 'Create and revoke API keys', 'api_keys', 'write', false),

-- Analytics Scopes
('analytics:read', 'Read Analytics', 'View analytics and usage data', 'analytics', 'read', false),

-- Team Scopes
('teams:read', 'Read Teams', 'View team information', 'teams', 'read', false),
('teams:write', 'Manage Teams', 'Create and update teams', 'teams', 'write', false),

-- Admin Scopes (dangerous)
('admin:all', 'Full Admin Access', 'Complete administrative access', 'admin', 'admin', false)
ON CONFLICT (scope_name) DO NOTHING;

-- Update dangerous scopes
UPDATE api_scopes
SET is_dangerous = true
WHERE scope_name IN ('templates:delete', 'users:write', 'admin:all');

-- =====================================================================================
-- COMMENTS
-- =====================================================================================

COMMENT ON TABLE api_keys IS 'API keys for authentication and authorization';
COMMENT ON TABLE api_usage_logs IS 'Detailed logs of API requests';
COMMENT ON TABLE api_rate_limits IS 'Rate limit tracking per API key';
COMMENT ON TABLE webhooks IS 'Webhook endpoint configurations';
COMMENT ON TABLE webhook_deliveries IS 'Individual webhook delivery attempts';
COMMENT ON TABLE webhook_events IS 'Event log for webhook-triggerable events';
COMMENT ON TABLE api_documentation IS 'Versioned API documentation';
COMMENT ON TABLE api_scopes IS 'Available API scopes and permissions';
COMMENT ON TABLE api_quota_usage IS 'Daily/monthly quota tracking';

-- =====================================================================================
-- END OF MIGRATION
-- =====================================================================================
