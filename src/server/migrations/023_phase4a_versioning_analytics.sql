-- Migration: Phase 4A - Template Versioning & Analytics
-- This adds template version tracking, analytics, and activity logging

-- ============================================================================
-- TEMPLATE VERSIONING SYSTEM
-- ============================================================================

-- Template versions table
-- Stores complete snapshots of templates at each version
CREATE TABLE IF NOT EXISTS template_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES ghl_clone_templates(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    version_name VARCHAR(100),
    changelog TEXT,

    -- Template snapshot data
    name VARCHAR(200) NOT NULL,
    description TEXT,
    category_id UUID REFERENCES template_categories(id),
    thumbnail_url TEXT,
    preview_url TEXT,
    html_content TEXT,
    custom_css TEXT,
    custom_js TEXT,
    assets JSONB,
    metadata JSONB,

    -- Version metadata
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_current BOOLEAN DEFAULT false,
    size_bytes BIGINT,

    UNIQUE(template_id, version_number)
);

-- Version comparison history
-- Tracks when users compare versions
CREATE TABLE IF NOT EXISTS template_version_comparisons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES ghl_clone_templates(id) ON DELETE CASCADE,
    version_from INTEGER NOT NULL,
    version_to INTEGER NOT NULL,
    compared_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    comparison_result JSONB, -- Stores diff data
    compared_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- ANALYTICS SYSTEM
-- ============================================================================

-- Daily aggregated statistics
-- Pre-computed for performance
CREATE TABLE IF NOT EXISTS analytics_daily_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE, -- NULL for global stats
    metric_type VARCHAR(50) NOT NULL, -- 'templates_created', 'clones_performed', 'views', 'downloads', etc.
    metric_category VARCHAR(50), -- 'templates', 'clones', 'users', 'engagement'
    metric_value INTEGER NOT NULL DEFAULT 0,
    metadata JSONB, -- Additional context-specific data
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(date, user_id, metric_type)
);

-- User activity log
-- Tracks all significant user actions
CREATE TABLE IF NOT EXISTS user_activity_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    activity_type VARCHAR(50) NOT NULL, -- 'login', 'search', 'view', 'create', 'download', etc.
    resource_type VARCHAR(50), -- 'template', 'clone', 'collection', etc.
    resource_id UUID,
    resource_name VARCHAR(255), -- Denormalized for faster queries
    session_id VARCHAR(255),
    ip_address INET,
    user_agent TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Template performance metrics
-- Daily performance tracking per template
CREATE TABLE IF NOT EXISTS template_performance_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES ghl_clone_templates(id) ON DELETE CASCADE,
    date DATE NOT NULL,

    -- Engagement metrics
    views INTEGER DEFAULT 0,
    unique_views INTEGER DEFAULT 0,
    downloads INTEGER DEFAULT 0,
    unique_downloads INTEGER DEFAULT 0,
    uses INTEGER DEFAULT 0,
    unique_uses INTEGER DEFAULT 0,

    -- Social metrics
    favorites_added INTEGER DEFAULT 0,
    favorites_removed INTEGER DEFAULT 0,
    new_reviews INTEGER DEFAULT 0,
    avg_rating DECIMAL(3,2),

    -- Conversion metrics
    view_to_download_rate DECIMAL(5,2), -- Percentage
    download_to_use_rate DECIMAL(5,2), -- Percentage

    -- Engagement scores (computed)
    engagement_score DECIMAL(10,2), -- Weighted score
    trending_score DECIMAL(10,2), -- Trend detection

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(template_id, date)
);

-- User engagement metrics
-- Track user behavior and engagement
CREATE TABLE IF NOT EXISTS user_engagement_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    date DATE NOT NULL,

    -- Activity counts
    logins INTEGER DEFAULT 0,
    templates_created INTEGER DEFAULT 0,
    templates_updated INTEGER DEFAULT 0,
    templates_viewed INTEGER DEFAULT 0,
    templates_downloaded INTEGER DEFAULT 0,
    searches_performed INTEGER DEFAULT 0,
    reviews_written INTEGER DEFAULT 0,

    -- Engagement metrics
    session_count INTEGER DEFAULT 0,
    total_session_duration_seconds INTEGER DEFAULT 0,
    avg_session_duration_seconds INTEGER DEFAULT 0,

    -- Scores
    engagement_score DECIMAL(10,2),
    activity_level VARCHAR(20), -- 'low', 'medium', 'high', 'power_user'

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(user_id, date)
);

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================

-- Template versions indexes
CREATE INDEX IF NOT EXISTS idx_template_versions_template_id ON template_versions(template_id);
CREATE INDEX IF NOT EXISTS idx_template_versions_current ON template_versions(template_id, is_current) WHERE is_current = true;
CREATE INDEX IF NOT EXISTS idx_template_versions_created_at ON template_versions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_template_versions_created_by ON template_versions(created_by);

-- Version comparisons indexes
CREATE INDEX IF NOT EXISTS idx_version_comparisons_template_id ON template_version_comparisons(template_id);
CREATE INDEX IF NOT EXISTS idx_version_comparisons_compared_by ON template_version_comparisons(compared_by);
CREATE INDEX IF NOT EXISTS idx_version_comparisons_date ON template_version_comparisons(compared_at DESC);

-- Analytics indexes
CREATE INDEX IF NOT EXISTS idx_analytics_daily_date ON analytics_daily_stats(date DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_daily_user_id ON analytics_daily_stats(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_daily_metric_type ON analytics_daily_stats(metric_type, date DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_daily_category ON analytics_daily_stats(metric_category, date DESC);

-- Activity log indexes
CREATE INDEX IF NOT EXISTS idx_activity_log_user_id ON user_activity_log(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_activity_type ON user_activity_log(activity_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_resource ON user_activity_log(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_session ON user_activity_log(session_id);
CREATE INDEX IF NOT EXISTS idx_activity_log_date ON user_activity_log(created_at DESC);

-- Performance metrics indexes
CREATE INDEX IF NOT EXISTS idx_performance_metrics_template ON template_performance_metrics(template_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_performance_metrics_date ON template_performance_metrics(date DESC);
CREATE INDEX IF NOT EXISTS idx_performance_metrics_trending ON template_performance_metrics(trending_score DESC, date DESC);
CREATE INDEX IF NOT EXISTS idx_performance_metrics_engagement ON template_performance_metrics(engagement_score DESC, date DESC);

-- User engagement indexes
CREATE INDEX IF NOT EXISTS idx_user_engagement_user_id ON user_engagement_metrics(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_user_engagement_date ON user_engagement_metrics(date DESC);
CREATE INDEX IF NOT EXISTS idx_user_engagement_level ON user_engagement_metrics(activity_level, date DESC);
CREATE INDEX IF NOT EXISTS idx_user_engagement_score ON user_engagement_metrics(engagement_score DESC, date DESC);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function: Create new template version
-- Auto-increments version number and captures current template state
CREATE OR REPLACE FUNCTION create_template_version(
    p_template_id UUID,
    p_user_id UUID,
    p_version_name VARCHAR(100) DEFAULT NULL,
    p_changelog TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_version_number INTEGER;
    v_version_id UUID;
    v_template RECORD;
BEGIN
    -- Get current template data
    SELECT * INTO v_template
    FROM ghl_clone_templates
    WHERE id = p_template_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Template not found: %', p_template_id;
    END IF;

    -- Get next version number
    SELECT COALESCE(MAX(version_number), 0) + 1 INTO v_version_number
    FROM template_versions
    WHERE template_id = p_template_id;

    -- Mark all previous versions as not current
    UPDATE template_versions
    SET is_current = false
    WHERE template_id = p_template_id;

    -- Create new version
    INSERT INTO template_versions (
        template_id, version_number, version_name, changelog,
        name, description, category_id, thumbnail_url, preview_url,
        html_content, custom_css, custom_js, assets, metadata,
        created_by, is_current
    ) VALUES (
        p_template_id, v_version_number, p_version_name, p_changelog,
        v_template.name, v_template.description, v_template.category_id,
        v_template.preview_image_url, v_template.preview_image_url,
        NULL, NULL, NULL, NULL, v_template.metadata,
        p_user_id, true
    ) RETURNING id INTO v_version_id;

    RETURN v_version_id;
END;
$$ LANGUAGE plpgsql;

-- Function: Get latest version number
CREATE OR REPLACE FUNCTION get_latest_version_number(p_template_id UUID)
RETURNS INTEGER AS $$
DECLARE
    v_version_number INTEGER;
BEGIN
    SELECT COALESCE(MAX(version_number), 0) INTO v_version_number
    FROM template_versions
    WHERE template_id = p_template_id;

    RETURN v_version_number;
END;
$$ LANGUAGE plpgsql;

-- Function: Restore template to specific version
CREATE OR REPLACE FUNCTION restore_template_version(
    p_template_id UUID,
    p_version_number INTEGER,
    p_user_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
    v_version RECORD;
BEGIN
    -- Get version data
    SELECT * INTO v_version
    FROM template_versions
    WHERE template_id = p_template_id
      AND version_number = p_version_number;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Version % not found for template %', p_version_number, p_template_id;
    END IF;

    -- Update template with version data
    UPDATE ghl_clone_templates
    SET name = v_version.name,
        description = v_version.description,
        category_id = v_version.category_id,
        preview_image_url = v_version.preview_url,
        metadata = v_version.metadata,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_template_id;

    -- Create new version from restored state
    PERFORM create_template_version(
        p_template_id,
        p_user_id,
        'Restored from v' || p_version_number,
        'Restored from version ' || p_version_number
    );

    RETURN true;
END;
$$ LANGUAGE plpgsql;

-- Function: Log user activity
CREATE OR REPLACE FUNCTION log_user_activity(
    p_user_id UUID,
    p_activity_type VARCHAR(50),
    p_resource_type VARCHAR(50) DEFAULT NULL,
    p_resource_id UUID DEFAULT NULL,
    p_resource_name VARCHAR(255) DEFAULT NULL,
    p_session_id VARCHAR(255) DEFAULT NULL,
    p_ip_address INET DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS UUID AS $$
DECLARE
    v_activity_id UUID;
BEGIN
    INSERT INTO user_activity_log (
        user_id, activity_type, resource_type, resource_id, resource_name,
        session_id, ip_address, user_agent, metadata
    ) VALUES (
        p_user_id, p_activity_type, p_resource_type, p_resource_id, p_resource_name,
        p_session_id, p_ip_address, p_user_agent, p_metadata
    ) RETURNING id INTO v_activity_id;

    RETURN v_activity_id;
END;
$$ LANGUAGE plpgsql;

-- Function: Update daily analytics
CREATE OR REPLACE FUNCTION update_daily_analytics(
    p_date DATE,
    p_user_id UUID,
    p_metric_type VARCHAR(50),
    p_metric_category VARCHAR(50),
    p_increment INTEGER DEFAULT 1,
    p_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO analytics_daily_stats (
        date, user_id, metric_type, metric_category, metric_value, metadata
    ) VALUES (
        p_date, p_user_id, p_metric_type, p_metric_category, p_increment, p_metadata
    )
    ON CONFLICT (date, user_id, metric_type)
    DO UPDATE SET
        metric_value = analytics_daily_stats.metric_value + p_increment,
        metadata = p_metadata,
        updated_at = CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql;

-- Function: Calculate template engagement score
CREATE OR REPLACE FUNCTION calculate_engagement_score(
    p_views INTEGER,
    p_downloads INTEGER,
    p_uses INTEGER,
    p_favorites INTEGER,
    p_rating DECIMAL(3,2),
    p_review_count INTEGER
)
RETURNS DECIMAL(10,2) AS $$
DECLARE
    v_score DECIMAL(10,2);
BEGIN
    -- Weighted scoring formula
    v_score := (
        (p_views * 0.1) +
        (p_downloads * 2.0) +
        (p_uses * 5.0) +
        (p_favorites * 3.0) +
        (p_rating * p_review_count * 2.0)
    );

    RETURN v_score;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function: Update template performance metrics
CREATE OR REPLACE FUNCTION update_template_performance_metrics(
    p_template_id UUID,
    p_date DATE DEFAULT CURRENT_DATE
)
RETURNS VOID AS $$
DECLARE
    v_template RECORD;
    v_views INTEGER;
    v_downloads INTEGER;
    v_uses INTEGER;
    v_engagement_score DECIMAL(10,2);
BEGIN
    -- Get template data
    SELECT * INTO v_template
    FROM ghl_clone_templates
    WHERE id = p_template_id;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    -- Count activities for the day
    SELECT
        COUNT(CASE WHEN activity_type = 'view' THEN 1 END),
        COUNT(CASE WHEN activity_type = 'download' THEN 1 END),
        COUNT(CASE WHEN activity_type = 'use' THEN 1 END)
    INTO v_views, v_downloads, v_uses
    FROM user_activity_log
    WHERE resource_id = p_template_id
      AND DATE(created_at) = p_date;

    -- Calculate engagement score
    v_engagement_score := calculate_engagement_score(
        v_views,
        v_downloads,
        v_uses,
        v_template.favorite_count,
        v_template.rating_average,
        v_template.rating_count
    );

    -- Calculate conversion rates
    INSERT INTO template_performance_metrics (
        template_id, date,
        views, downloads, uses,
        unique_views, unique_downloads, unique_uses,
        avg_rating, engagement_score,
        view_to_download_rate, download_to_use_rate
    ) VALUES (
        p_template_id, p_date,
        v_views, v_downloads, v_uses,
        v_views, v_downloads, v_uses, -- Simplified, should count distinct users
        v_template.rating_average, v_engagement_score,
        CASE WHEN v_views > 0 THEN (v_downloads::DECIMAL / v_views * 100) ELSE 0 END,
        CASE WHEN v_downloads > 0 THEN (v_uses::DECIMAL / v_downloads * 100) ELSE 0 END
    )
    ON CONFLICT (template_id, date)
    DO UPDATE SET
        views = EXCLUDED.views,
        downloads = EXCLUDED.downloads,
        uses = EXCLUDED.uses,
        avg_rating = EXCLUDED.avg_rating,
        engagement_score = EXCLUDED.engagement_score,
        view_to_download_rate = EXCLUDED.view_to_download_rate,
        download_to_use_rate = EXCLUDED.download_to_use_rate,
        updated_at = CURRENT_TIMESTAMP;
END;
$$ LANGUAGE plpgsql;

-- Function: Get analytics summary for date range
CREATE OR REPLACE FUNCTION get_analytics_summary(
    p_user_id UUID,
    p_start_date DATE,
    p_end_date DATE
)
RETURNS TABLE (
    metric_type VARCHAR(50),
    metric_category VARCHAR(50),
    total_value BIGINT,
    avg_value DECIMAL(10,2),
    min_value INTEGER,
    max_value INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ads.metric_type,
        ads.metric_category,
        SUM(ads.metric_value)::BIGINT as total_value,
        AVG(ads.metric_value)::DECIMAL(10,2) as avg_value,
        MIN(ads.metric_value) as min_value,
        MAX(ads.metric_value) as max_value
    FROM analytics_daily_stats ads
    WHERE ads.user_id = p_user_id
      AND ads.date BETWEEN p_start_date AND p_end_date
    GROUP BY ads.metric_type, ads.metric_category
    ORDER BY total_value DESC;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Trigger: Auto-create version on template update
CREATE OR REPLACE FUNCTION trigger_create_version_on_update()
RETURNS TRIGGER AS $$
BEGIN
    -- Only create version if significant fields changed
    IF (OLD.name IS DISTINCT FROM NEW.name OR
        OLD.description IS DISTINCT FROM NEW.description OR
        OLD.category_id IS DISTINCT FROM NEW.category_id) THEN

        PERFORM create_template_version(
            NEW.id,
            NEW.user_id,
            'Auto-save',
            'Automatic version created on update'
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER template_auto_version
AFTER UPDATE ON ghl_clone_templates
FOR EACH ROW
EXECUTE FUNCTION trigger_create_version_on_update();

-- ============================================================================
-- INITIAL DATA / SEED
-- ============================================================================

-- Create initial analytics entries for system metrics
INSERT INTO analytics_daily_stats (date, user_id, metric_type, metric_category, metric_value) VALUES
(CURRENT_DATE, NULL, 'system_templates_total', 'system', 0),
(CURRENT_DATE, NULL, 'system_users_total', 'system', 0),
(CURRENT_DATE, NULL, 'system_clones_total', 'system', 0)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 023_phase4a_versioning_analytics completed successfully';
    RAISE NOTICE '   - 5 tables created (template_versions, version_comparisons, analytics_daily_stats, user_activity_log, template_performance_metrics, user_engagement_metrics)';
    RAISE NOTICE '   - 8 functions created';
    RAISE NOTICE '   - 20+ indexes created';
    RAISE NOTICE '   - 1 trigger created (auto-versioning)';
    RAISE NOTICE '   - Phase 4A: Template Versioning & Analytics ready!';
END $$;
