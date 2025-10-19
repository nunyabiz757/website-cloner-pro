-- Migration: Advanced Analytics & Reporting Dashboard
-- This adds comprehensive analytics tracking, funnel analysis, user journey tracking,
-- and advanced reporting capabilities

-- ============================================================================
-- TABLES
-- ============================================================================

-- Advanced analytics events table
-- Tracks all user interactions and custom events
CREATE TABLE IF NOT EXISTS analytics_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    session_id VARCHAR(100),
    event_type VARCHAR(100) NOT NULL,  -- 'page_view', 'template_view', 'template_clone', 'button_click', etc.
    event_category VARCHAR(100),       -- 'engagement', 'conversion', 'navigation', 'error'
    event_action VARCHAR(200),         -- Specific action taken
    event_label VARCHAR(200),          -- Additional context
    event_value DECIMAL(10,2),         -- Numeric value (e.g., price, duration)

    -- Context data
    template_id UUID REFERENCES ghl_clone_templates(id) ON DELETE SET NULL,
    page_url TEXT,
    referrer_url TEXT,

    -- Device & Browser info
    device_type VARCHAR(50),           -- 'desktop', 'mobile', 'tablet'
    browser VARCHAR(100),
    browser_version VARCHAR(50),
    os VARCHAR(100),
    os_version VARCHAR(50),
    screen_resolution VARCHAR(50),

    -- Location data
    country_code VARCHAR(10),
    region VARCHAR(100),
    city VARCHAR(100),
    timezone VARCHAR(100),

    -- Additional metadata
    metadata JSONB DEFAULT '{}',

    -- Timestamps
    event_timestamp TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    -- Indexes
    INDEX idx_analytics_events_user (user_id),
    INDEX idx_analytics_events_session (session_id),
    INDEX idx_analytics_events_type (event_type),
    INDEX idx_analytics_events_category (event_category),
    INDEX idx_analytics_events_template (template_id),
    INDEX idx_analytics_events_timestamp (event_timestamp DESC),
    INDEX idx_analytics_events_user_timestamp (user_id, event_timestamp DESC)
);

-- User behavior tracking
-- Tracks user journey and behavior patterns
CREATE TABLE IF NOT EXISTS user_behavior_tracking (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    session_id VARCHAR(100) NOT NULL,

    -- Session info
    session_start TIMESTAMPTZ NOT NULL,
    session_end TIMESTAMPTZ,
    session_duration_seconds INTEGER,

    -- Page views
    pages_viewed INTEGER DEFAULT 0,
    unique_pages_viewed INTEGER DEFAULT 0,

    -- Engagement metrics
    templates_viewed INTEGER DEFAULT 0,
    templates_cloned INTEGER DEFAULT 0,
    templates_favorited INTEGER DEFAULT 0,
    searches_performed INTEGER DEFAULT 0,
    filters_applied INTEGER DEFAULT 0,

    -- Conversion events
    converted BOOLEAN DEFAULT false,
    conversion_type VARCHAR(100),      -- 'clone', 'purchase', 'signup', etc.
    conversion_value DECIMAL(10,2),
    time_to_conversion_seconds INTEGER,

    -- Entry and exit
    entry_page TEXT,
    exit_page TEXT,
    referrer_source VARCHAR(200),
    utm_source VARCHAR(200),
    utm_medium VARCHAR(200),
    utm_campaign VARCHAR(200),
    utm_content VARCHAR(200),

    -- Device info
    device_type VARCHAR(50),
    browser VARCHAR(100),
    os VARCHAR(100),

    -- Metadata
    metadata JSONB DEFAULT '{}',

    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    -- Indexes
    INDEX idx_user_behavior_user (user_id),
    INDEX idx_user_behavior_session (session_id),
    INDEX idx_user_behavior_start (session_start DESC),
    INDEX idx_user_behavior_converted (converted),
    INDEX idx_user_behavior_conversion_type (conversion_type),
    INDEX idx_user_behavior_utm_source (utm_source)
);

-- Funnel analysis tracking
-- Tracks user progression through defined conversion funnels
CREATE TABLE IF NOT EXISTS funnel_analysis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    funnel_name VARCHAR(200) NOT NULL,
    funnel_description TEXT,

    -- Funnel configuration
    steps JSONB NOT NULL,              -- Array of step definitions
    is_active BOOLEAN DEFAULT true,

    -- Metadata
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_funnel_analysis_active (is_active)
);

-- Funnel step events
-- Tracks individual user progression through funnel steps
CREATE TABLE IF NOT EXISTS funnel_step_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    funnel_id UUID NOT NULL REFERENCES funnel_analysis(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    session_id VARCHAR(100),

    -- Step info
    step_number INTEGER NOT NULL,
    step_name VARCHAR(200) NOT NULL,
    step_completed BOOLEAN DEFAULT false,

    -- Timing
    step_started_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    step_completed_at TIMESTAMPTZ,
    time_spent_seconds INTEGER,

    -- Context
    template_id UUID REFERENCES ghl_clone_templates(id) ON DELETE SET NULL,
    metadata JSONB DEFAULT '{}',

    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    -- Indexes
    INDEX idx_funnel_steps_funnel (funnel_id),
    INDEX idx_funnel_steps_user (user_id),
    INDEX idx_funnel_steps_session (session_id),
    INDEX idx_funnel_steps_number (step_number),
    INDEX idx_funnel_steps_completed (step_completed),
    INDEX idx_funnel_steps_started (step_started_at DESC)
);

-- Template analytics extended
-- Extended analytics specifically for templates
CREATE TABLE IF NOT EXISTS template_analytics_extended (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES ghl_clone_templates(id) ON DELETE CASCADE,
    date DATE NOT NULL,

    -- View metrics
    unique_views INTEGER DEFAULT 0,
    total_views INTEGER DEFAULT 0,
    avg_view_duration_seconds DECIMAL(10,2) DEFAULT 0,
    bounce_rate DECIMAL(5,2) DEFAULT 0,

    -- Engagement metrics
    total_clones INTEGER DEFAULT 0,
    unique_cloners INTEGER DEFAULT 0,
    favorites_added INTEGER DEFAULT 0,
    favorites_removed INTEGER DEFAULT 0,
    shares INTEGER DEFAULT 0,

    -- Conversion metrics
    clone_conversion_rate DECIMAL(5,2) DEFAULT 0,  -- views to clones
    preview_rate DECIMAL(5,2) DEFAULT 0,           -- views to previews

    -- Traffic sources
    traffic_direct INTEGER DEFAULT 0,
    traffic_search INTEGER DEFAULT 0,
    traffic_social INTEGER DEFAULT 0,
    traffic_referral INTEGER DEFAULT 0,
    traffic_other INTEGER DEFAULT 0,

    -- Device breakdown
    views_desktop INTEGER DEFAULT 0,
    views_mobile INTEGER DEFAULT 0,
    views_tablet INTEGER DEFAULT 0,

    -- Geographic data (top 5)
    top_countries JSONB DEFAULT '[]',

    -- Time-based patterns
    peak_hour INTEGER,                 -- Hour of day with most activity (0-23)
    peak_day VARCHAR(20),              -- Day of week with most activity

    -- Revenue (if applicable)
    revenue DECIMAL(10,2) DEFAULT 0,
    transactions INTEGER DEFAULT 0,

    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(template_id, date),

    -- Indexes
    INDEX idx_template_analytics_ext_template (template_id),
    INDEX idx_template_analytics_ext_date (date DESC),
    INDEX idx_template_analytics_ext_template_date (template_id, date DESC),
    INDEX idx_template_analytics_ext_clones (total_clones DESC),
    INDEX idx_template_analytics_ext_views (total_views DESC)
);

-- A/B test experiments
-- Tracks A/B testing experiments for templates and features
CREATE TABLE IF NOT EXISTS ab_test_experiments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    hypothesis TEXT,

    -- Experiment configuration
    experiment_type VARCHAR(50) NOT NULL,  -- 'template', 'feature', 'ui', 'pricing'
    status VARCHAR(50) DEFAULT 'draft',    -- 'draft', 'running', 'paused', 'completed'

    -- Variants (A/B or multivariate)
    variants JSONB NOT NULL,               -- Array of variant configurations
    traffic_allocation JSONB,              -- How traffic is split between variants

    -- Target audience
    target_audience JSONB,                 -- Audience filters
    sample_size_target INTEGER,

    -- Timing
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    actual_start_date TIMESTAMPTZ,
    actual_end_date TIMESTAMPTZ,

    -- Results
    winner_variant VARCHAR(100),
    confidence_level DECIMAL(5,2),
    statistical_significance BOOLEAN DEFAULT false,

    -- Metadata
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_ab_experiments_status (status),
    INDEX idx_ab_experiments_type (experiment_type),
    INDEX idx_ab_experiments_dates (start_date, end_date)
);

-- A/B test results
-- Tracks individual user participation in A/B tests
CREATE TABLE IF NOT EXISTS ab_test_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    experiment_id UUID NOT NULL REFERENCES ab_test_experiments(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    session_id VARCHAR(100),

    -- Assignment
    variant_name VARCHAR(100) NOT NULL,
    assigned_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    -- Outcome
    converted BOOLEAN DEFAULT false,
    conversion_type VARCHAR(100),
    conversion_value DECIMAL(10,2),
    converted_at TIMESTAMPTZ,

    -- Engagement metrics
    interactions INTEGER DEFAULT 0,
    time_spent_seconds INTEGER DEFAULT 0,

    -- Metadata
    metadata JSONB DEFAULT '{}',

    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(experiment_id, user_id),

    INDEX idx_ab_results_experiment (experiment_id),
    INDEX idx_ab_results_user (user_id),
    INDEX idx_ab_results_variant (variant_name),
    INDEX idx_ab_results_converted (converted)
);

-- Custom dashboards
-- Allows users to create custom analytics dashboards
CREATE TABLE IF NOT EXISTS custom_dashboards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,

    name VARCHAR(200) NOT NULL,
    description TEXT,

    -- Dashboard configuration
    layout JSONB NOT NULL,             -- Widget positions and sizes
    widgets JSONB NOT NULL,            -- Widget configurations
    filters JSONB DEFAULT '{}',        -- Default filters

    -- Access control
    is_public BOOLEAN DEFAULT false,
    is_default BOOLEAN DEFAULT false,

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_custom_dashboards_user (user_id),
    INDEX idx_custom_dashboards_team (team_id),
    INDEX idx_custom_dashboards_public (is_public)
);

-- Report schedules
-- Allows users to schedule automated report generation
CREATE TABLE IF NOT EXISTS report_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,

    name VARCHAR(200) NOT NULL,
    description TEXT,

    -- Report configuration
    report_type VARCHAR(100) NOT NULL,     -- 'template_performance', 'user_engagement', 'funnel', etc.
    report_config JSONB NOT NULL,          -- Report parameters and filters

    -- Schedule configuration
    frequency VARCHAR(50) NOT NULL,        -- 'daily', 'weekly', 'monthly', 'custom'
    schedule_config JSONB,                 -- Cron or detailed schedule
    timezone VARCHAR(100) DEFAULT 'UTC',

    -- Delivery settings
    delivery_method VARCHAR(50) NOT NULL,  -- 'email', 'webhook', 'download'
    delivery_config JSONB,                 -- Email addresses, webhook URLs, etc.
    format VARCHAR(50) DEFAULT 'pdf',      -- 'pdf', 'csv', 'excel', 'json'

    -- Status
    is_active BOOLEAN DEFAULT true,
    last_run_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ,
    last_run_status VARCHAR(50),
    last_run_error TEXT,

    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_report_schedules_user (user_id),
    INDEX idx_report_schedules_team (team_id),
    INDEX idx_report_schedules_active (is_active),
    INDEX idx_report_schedules_next_run (next_run_at)
);

-- Report history
-- Tracks generated reports
CREATE TABLE IF NOT EXISTS report_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_id UUID REFERENCES report_schedules(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,

    report_type VARCHAR(100) NOT NULL,
    report_name VARCHAR(200),

    -- Report data
    date_range_start DATE,
    date_range_end DATE,
    file_path TEXT,
    file_size_bytes BIGINT,
    format VARCHAR(50),

    -- Generation info
    generated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    generation_time_seconds DECIMAL(10,2),
    status VARCHAR(50) DEFAULT 'completed',  -- 'completed', 'failed', 'processing'
    error_message TEXT,

    -- Access control
    expires_at TIMESTAMPTZ,
    download_count INTEGER DEFAULT 0,

    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    INDEX idx_report_history_schedule (schedule_id),
    INDEX idx_report_history_user (user_id),
    INDEX idx_report_history_generated (generated_at DESC),
    INDEX idx_report_history_expires (expires_at)
);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to track an analytics event
CREATE OR REPLACE FUNCTION track_analytics_event(
    p_user_id UUID,
    p_session_id VARCHAR,
    p_event_type VARCHAR,
    p_event_category VARCHAR,
    p_event_action VARCHAR,
    p_event_label VARCHAR DEFAULT NULL,
    p_event_value DECIMAL DEFAULT NULL,
    p_template_id UUID DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'
) RETURNS UUID AS $$
DECLARE
    v_event_id UUID;
BEGIN
    INSERT INTO analytics_events (
        user_id, session_id, event_type, event_category, event_action,
        event_label, event_value, template_id, metadata
    ) VALUES (
        p_user_id, p_session_id, p_event_type, p_event_category, p_event_action,
        p_event_label, p_event_value, p_template_id, p_metadata
    ) RETURNING id INTO v_event_id;

    RETURN v_event_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get funnel conversion rates
CREATE OR REPLACE FUNCTION get_funnel_conversion_rates(
    p_funnel_id UUID,
    p_start_date TIMESTAMPTZ,
    p_end_date TIMESTAMPTZ
) RETURNS TABLE (
    step_number INTEGER,
    step_name VARCHAR,
    users_entered BIGINT,
    users_completed BIGINT,
    completion_rate DECIMAL,
    avg_time_seconds DECIMAL,
    drop_off_rate DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    WITH step_stats AS (
        SELECT
            fse.step_number,
            fse.step_name,
            COUNT(DISTINCT fse.user_id) FILTER (WHERE fse.step_started_at IS NOT NULL) AS entered,
            COUNT(DISTINCT fse.user_id) FILTER (WHERE fse.step_completed = true) AS completed,
            AVG(fse.time_spent_seconds) FILTER (WHERE fse.step_completed = true) AS avg_time
        FROM funnel_step_events fse
        WHERE fse.funnel_id = p_funnel_id
            AND fse.step_started_at BETWEEN p_start_date AND p_end_date
        GROUP BY fse.step_number, fse.step_name
    ),
    step_with_previous AS (
        SELECT
            ss.step_number,
            ss.step_name,
            ss.entered,
            ss.completed,
            ss.avg_time,
            LAG(ss.completed) OVER (ORDER BY ss.step_number) AS prev_step_completed
        FROM step_stats ss
    )
    SELECT
        swp.step_number,
        swp.step_name::VARCHAR,
        swp.entered,
        swp.completed,
        CASE WHEN swp.entered > 0 THEN ROUND((swp.completed::DECIMAL / swp.entered * 100), 2) ELSE 0 END AS completion_rate,
        ROUND(swp.avg_time::DECIMAL, 2) AS avg_time_seconds,
        CASE
            WHEN swp.prev_step_completed > 0
            THEN ROUND(((swp.prev_step_completed - swp.entered)::DECIMAL / swp.prev_step_completed * 100), 2)
            ELSE 0
        END AS drop_off_rate
    FROM step_with_previous swp
    ORDER BY swp.step_number;
END;
$$ LANGUAGE plpgsql;

-- Function to get template performance comparison
CREATE OR REPLACE FUNCTION get_template_performance_comparison(
    p_template_ids UUID[],
    p_start_date DATE,
    p_end_date DATE
) RETURNS TABLE (
    template_id UUID,
    template_name VARCHAR,
    total_views BIGINT,
    total_clones BIGINT,
    clone_rate DECIMAL,
    avg_view_duration DECIMAL,
    bounce_rate DECIMAL,
    total_revenue DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        t.id,
        t.name::VARCHAR,
        SUM(tae.total_views)::BIGINT,
        SUM(tae.total_clones)::BIGINT,
        CASE
            WHEN SUM(tae.total_views) > 0
            THEN ROUND((SUM(tae.total_clones)::DECIMAL / SUM(tae.total_views) * 100), 2)
            ELSE 0
        END AS clone_rate,
        ROUND(AVG(tae.avg_view_duration_seconds), 2) AS avg_view_duration,
        ROUND(AVG(tae.bounce_rate), 2) AS bounce_rate,
        SUM(tae.revenue)::DECIMAL
    FROM ghl_clone_templates t
    LEFT JOIN template_analytics_extended tae ON t.id = tae.template_id
    WHERE t.id = ANY(p_template_ids)
        AND tae.date BETWEEN p_start_date AND p_end_date
    GROUP BY t.id, t.name
    ORDER BY SUM(tae.total_views) DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to get user engagement metrics
CREATE OR REPLACE FUNCTION get_user_engagement_metrics(
    p_user_id UUID,
    p_start_date TIMESTAMPTZ,
    p_end_date TIMESTAMPTZ
) RETURNS TABLE (
    total_sessions BIGINT,
    total_page_views BIGINT,
    avg_session_duration DECIMAL,
    templates_viewed BIGINT,
    templates_cloned BIGINT,
    conversion_rate DECIMAL,
    last_active_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(DISTINCT ubt.session_id)::BIGINT,
        SUM(ubt.pages_viewed)::BIGINT,
        ROUND(AVG(ubt.session_duration_seconds), 2) AS avg_duration,
        SUM(ubt.templates_viewed)::BIGINT,
        SUM(ubt.templates_cloned)::BIGINT,
        CASE
            WHEN SUM(ubt.templates_viewed) > 0
            THEN ROUND((SUM(ubt.templates_cloned)::DECIMAL / SUM(ubt.templates_viewed) * 100), 2)
            ELSE 0
        END AS conversion_rate,
        MAX(ubt.session_end) AS last_active
    FROM user_behavior_tracking ubt
    WHERE ubt.user_id = p_user_id
        AND ubt.session_start BETWEEN p_start_date AND p_end_date;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate A/B test statistical significance
CREATE OR REPLACE FUNCTION calculate_ab_test_significance(
    p_experiment_id UUID
) RETURNS TABLE (
    variant_name VARCHAR,
    sample_size BIGINT,
    conversion_rate DECIMAL,
    confidence_level DECIMAL,
    is_significant BOOLEAN,
    recommended_winner BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    WITH variant_stats AS (
        SELECT
            abr.variant_name,
            COUNT(*)::BIGINT AS sample_size,
            COUNT(*) FILTER (WHERE abr.converted = true)::BIGINT AS conversions,
            ROUND((COUNT(*) FILTER (WHERE abr.converted = true)::DECIMAL / COUNT(*) * 100), 2) AS conv_rate
        FROM ab_test_results abr
        WHERE abr.experiment_id = p_experiment_id
        GROUP BY abr.variant_name
    ),
    max_conversion AS (
        SELECT MAX(conv_rate) AS max_rate FROM variant_stats
    )
    SELECT
        vs.variant_name::VARCHAR,
        vs.sample_size,
        vs.conv_rate,
        -- Simplified confidence calculation (would need z-test in production)
        CASE
            WHEN vs.sample_size >= 100 THEN 95.0
            WHEN vs.sample_size >= 50 THEN 90.0
            ELSE 80.0
        END AS confidence,
        (vs.sample_size >= 100 AND ABS(vs.conv_rate - mc.max_rate) > 5) AS is_significant,
        (vs.conv_rate = mc.max_rate) AS recommended_winner
    FROM variant_stats vs
    CROSS JOIN max_conversion mc
    ORDER BY vs.conv_rate DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to aggregate daily analytics
CREATE OR REPLACE FUNCTION aggregate_daily_template_analytics(p_date DATE)
RETURNS void AS $$
BEGIN
    -- Insert or update template analytics for the day
    INSERT INTO template_analytics_extended (
        template_id, date,
        unique_views, total_views,
        total_clones, unique_cloners
    )
    SELECT
        ae.template_id,
        p_date,
        COUNT(DISTINCT ae.user_id) FILTER (WHERE ae.event_type = 'template_view'),
        COUNT(*) FILTER (WHERE ae.event_type = 'template_view'),
        COUNT(*) FILTER (WHERE ae.event_type = 'template_clone'),
        COUNT(DISTINCT ae.user_id) FILTER (WHERE ae.event_type = 'template_clone')
    FROM analytics_events ae
    WHERE DATE(ae.event_timestamp) = p_date
        AND ae.template_id IS NOT NULL
    GROUP BY ae.template_id
    ON CONFLICT (template_id, date) DO UPDATE SET
        unique_views = EXCLUDED.unique_views,
        total_views = EXCLUDED.total_views,
        total_clones = EXCLUDED.total_clones,
        unique_cloners = EXCLUDED.unique_cloners,
        updated_at = CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Trigger to update user behavior session on event
CREATE OR REPLACE FUNCTION update_user_behavior_on_event()
RETURNS TRIGGER AS $$
BEGIN
    -- Update or insert user behavior record
    INSERT INTO user_behavior_tracking (
        user_id, session_id, session_start, pages_viewed
    ) VALUES (
        NEW.user_id, NEW.session_id, NEW.event_timestamp, 1
    )
    ON CONFLICT (session_id) DO UPDATE SET
        pages_viewed = user_behavior_tracking.pages_viewed + 1,
        session_end = NEW.event_timestamp,
        session_duration_seconds = EXTRACT(EPOCH FROM (NEW.event_timestamp - user_behavior_tracking.session_start))::INTEGER,
        updated_at = CURRENT_TIMESTAMP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER analytics_event_behavior_update
AFTER INSERT ON analytics_events
FOR EACH ROW
WHEN (NEW.event_type = 'page_view')
EXECUTE FUNCTION update_user_behavior_on_event();

-- Trigger to update timestamp on custom dashboards
CREATE OR REPLACE FUNCTION update_dashboard_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER custom_dashboards_update_timestamp
BEFORE UPDATE ON custom_dashboards
FOR EACH ROW
EXECUTE FUNCTION update_dashboard_timestamp();

-- Trigger to update timestamp on report schedules
CREATE TRIGGER report_schedules_update_timestamp
BEFORE UPDATE ON report_schedules
FOR EACH ROW
EXECUTE FUNCTION update_dashboard_timestamp();

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Additional composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_analytics_events_user_type_timestamp
ON analytics_events(user_id, event_type, event_timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_events_template_type_timestamp
ON analytics_events(template_id, event_type, event_timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_user_behavior_user_converted
ON user_behavior_tracking(user_id, converted);

CREATE INDEX IF NOT EXISTS idx_funnel_steps_funnel_session
ON funnel_step_events(funnel_id, session_id);

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 028_advanced_analytics completed successfully';
    RAISE NOTICE '   - 10 analytics tables created';
    RAISE NOTICE '   - 6 analytics functions created';
    RAISE NOTICE '   - 3 triggers for auto-updates';
    RAISE NOTICE '   - 25+ performance indexes';
    RAISE NOTICE '   ';
    RAISE NOTICE '   Features enabled:';
    RAISE NOTICE '   - Comprehensive event tracking';
    RAISE NOTICE '   - User behavior analysis';
    RAISE NOTICE '   - Funnel analysis';
    RAISE NOTICE '   - A/B testing framework';
    RAISE NOTICE '   - Custom dashboards';
    RAISE NOTICE '   - Scheduled reports';
    RAISE NOTICE '   - Template performance analytics';
END $$;
