-- Migration: Multi-Page Crawl Conversion System
-- Description: Tables for managing multi-page website crawling and page builder conversion
-- Version: 039
-- Created: 2025-10-18

-- Create enum types for status tracking
DO $$ BEGIN
    CREATE TYPE crawl_status AS ENUM (
        'pending',
        'crawling',
        'converting',
        'completed',
        'failed',
        'paused'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE builder_type AS ENUM (
        'elementor',
        'gutenberg',
        'divi',
        'beaver-builder'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE conversion_status_type AS ENUM (
        'pending',
        'converting',
        'completed',
        'failed'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================================================
-- Table: crawl_sessions
-- Manages crawl session metadata and overall progress
-- ============================================================================
CREATE TABLE IF NOT EXISTS crawl_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,

    -- Crawl configuration
    start_url TEXT NOT NULL,
    status crawl_status NOT NULL DEFAULT 'pending',

    -- Progress tracking
    total_pages INTEGER DEFAULT 0,
    crawled_pages INTEGER DEFAULT 0,
    converted_pages INTEGER DEFAULT 0,
    failed_pages INTEGER DEFAULT 0,

    -- Crawl options (JSON)
    options JSONB DEFAULT '{}'::jsonb,

    -- Metadata
    crawl_method VARCHAR(50), -- 'sitemap' or 'regular'
    sitemap_used TEXT,

    -- Timing
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    last_activity_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Error tracking
    error TEXT,
    error_count INTEGER DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for crawl_sessions
CREATE INDEX IF NOT EXISTS idx_crawl_sessions_user_id ON crawl_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_crawl_sessions_project_id ON crawl_sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_crawl_sessions_status ON crawl_sessions(status);
CREATE INDEX IF NOT EXISTS idx_crawl_sessions_created_at ON crawl_sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_crawl_sessions_last_activity ON crawl_sessions(last_activity_at DESC);

-- ============================================================================
-- Table: crawled_pages
-- Stores individual crawled page data
-- ============================================================================
CREATE TABLE IF NOT EXISTS crawled_pages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES crawl_sessions(id) ON DELETE CASCADE,

    -- Page information
    url TEXT NOT NULL,
    title TEXT,
    html TEXT, -- Full HTML content
    depth INTEGER DEFAULT 0,

    -- Page metadata (JSON)
    metadata JSONB DEFAULT '{}'::jsonb,

    -- Assets (JSON arrays)
    assets JSONB DEFAULT '{
        "images": [],
        "css": [],
        "js": [],
        "fonts": []
    }'::jsonb,

    -- Links found on page
    links JSONB DEFAULT '[]'::jsonb,

    -- Conversion tracking
    converted BOOLEAN DEFAULT FALSE,
    conversion_status conversion_status_type DEFAULT 'pending',
    conversion_error TEXT,

    -- Timestamps
    crawled_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    converted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for crawled_pages (optimized for large datasets)
CREATE INDEX IF NOT EXISTS idx_crawled_pages_session_id ON crawled_pages(session_id);
CREATE INDEX IF NOT EXISTS idx_crawled_pages_url ON crawled_pages(url);
CREATE INDEX IF NOT EXISTS idx_crawled_pages_converted ON crawled_pages(converted);
CREATE INDEX IF NOT EXISTS idx_crawled_pages_conversion_status ON crawled_pages(conversion_status);
CREATE INDEX IF NOT EXISTS idx_crawled_pages_crawled_at ON crawled_pages(crawled_at DESC);
CREATE INDEX IF NOT EXISTS idx_crawled_pages_session_converted ON crawled_pages(session_id, converted);

-- Composite index for pagination queries
CREATE INDEX IF NOT EXISTS idx_crawled_pages_session_created ON crawled_pages(session_id, created_at DESC);

-- Unique constraint to prevent duplicate URLs per session
CREATE UNIQUE INDEX IF NOT EXISTS idx_crawled_pages_session_url_unique ON crawled_pages(session_id, url);

-- ============================================================================
-- Table: page_builder_conversions
-- Stores converted page builder data
-- ============================================================================
CREATE TABLE IF NOT EXISTS page_builder_conversions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    page_id UUID NOT NULL REFERENCES crawled_pages(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES crawl_sessions(id) ON DELETE CASCADE,

    -- Builder information
    builder_type builder_type NOT NULL,

    -- Conversion data (full JSON export)
    conversion_data JSONB NOT NULL,

    -- Statistics
    component_count INTEGER DEFAULT 0,
    widget_count INTEGER DEFAULT 0,
    section_count INTEGER DEFAULT 0,

    -- Quality metrics
    conversion_quality DECIMAL(5,2) DEFAULT 0.00, -- 0-100 score
    confidence_score DECIMAL(5,2) DEFAULT 0.00, -- Average confidence
    manual_review_needed BOOLEAN DEFAULT FALSE,

    -- Component breakdown (JSON)
    component_breakdown JSONB DEFAULT '{}'::jsonb,

    -- Conversion metadata
    conversion_options JSONB DEFAULT '{}'::jsonb,
    warnings JSONB DEFAULT '[]'::jsonb,
    errors JSONB DEFAULT '[]'::jsonb,

    -- File information (if exported to file)
    file_path TEXT,
    file_size INTEGER,

    -- Timestamps
    converted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for page_builder_conversions
CREATE INDEX IF NOT EXISTS idx_pb_conversions_page_id ON page_builder_conversions(page_id);
CREATE INDEX IF NOT EXISTS idx_pb_conversions_session_id ON page_builder_conversions(session_id);
CREATE INDEX IF NOT EXISTS idx_pb_conversions_builder_type ON page_builder_conversions(builder_type);
CREATE INDEX IF NOT EXISTS idx_pb_conversions_quality ON page_builder_conversions(conversion_quality DESC);
CREATE INDEX IF NOT EXISTS idx_pb_conversions_manual_review ON page_builder_conversions(manual_review_needed);
CREATE INDEX IF NOT EXISTS idx_pb_conversions_converted_at ON page_builder_conversions(converted_at DESC);

-- Unique constraint: one conversion per page per builder type
CREATE UNIQUE INDEX IF NOT EXISTS idx_pb_conversions_page_builder_unique
    ON page_builder_conversions(page_id, builder_type);

-- ============================================================================
-- Table: crawl_pagination
-- Manages pagination state for large crawls (1000+ pages)
-- ============================================================================
CREATE TABLE IF NOT EXISTS crawl_pagination (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES crawl_sessions(id) ON DELETE CASCADE,

    -- Batch information
    current_batch INTEGER DEFAULT 0,
    total_batches INTEGER DEFAULT 0,
    pages_per_batch INTEGER DEFAULT 100,

    -- Resume state
    last_page_index INTEGER DEFAULT 0,
    last_page_url TEXT,
    resume_token TEXT,

    -- Batch tracking (JSON array of batch metadata)
    batch_history JSONB DEFAULT '[]'::jsonb,

    -- State preservation (for resume)
    crawl_state JSONB DEFAULT '{}'::jsonb,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for crawl_pagination
CREATE INDEX IF NOT EXISTS idx_crawl_pagination_session_id ON crawl_pagination(session_id);
CREATE INDEX IF NOT EXISTS idx_crawl_pagination_current_batch ON crawl_pagination(current_batch);

-- Unique constraint: one pagination record per session
CREATE UNIQUE INDEX IF NOT EXISTS idx_crawl_pagination_session_unique ON crawl_pagination(session_id);

-- ============================================================================
-- Table: crawl_batch_metrics
-- Tracks performance metrics for each batch
-- ============================================================================
CREATE TABLE IF NOT EXISTS crawl_batch_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES crawl_sessions(id) ON DELETE CASCADE,
    batch_number INTEGER NOT NULL,

    -- Batch statistics
    pages_processed INTEGER DEFAULT 0,
    pages_succeeded INTEGER DEFAULT 0,
    pages_failed INTEGER DEFAULT 0,

    -- Performance metrics
    duration_ms INTEGER,
    avg_page_time_ms INTEGER,
    memory_usage_mb DECIMAL(10,2),

    -- Error tracking
    errors JSONB DEFAULT '[]'::jsonb,

    -- Timestamps
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for crawl_batch_metrics
CREATE INDEX IF NOT EXISTS idx_batch_metrics_session_id ON crawl_batch_metrics(session_id);
CREATE INDEX IF NOT EXISTS idx_batch_metrics_batch_number ON crawl_batch_metrics(batch_number);
CREATE INDEX IF NOT EXISTS idx_batch_metrics_session_batch ON crawl_batch_metrics(session_id, batch_number);

-- ============================================================================
-- Functions and Triggers
-- ============================================================================

-- Function: Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_crawl_sessions_updated_at
    BEFORE UPDATE ON crawl_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_crawled_pages_updated_at
    BEFORE UPDATE ON crawled_pages
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_pb_conversions_updated_at
    BEFORE UPDATE ON page_builder_conversions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_crawl_pagination_updated_at
    BEFORE UPDATE ON crawl_pagination
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Function: Update session progress when pages are added/updated
CREATE OR REPLACE FUNCTION update_session_progress()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE crawl_sessions
    SET
        crawled_pages = (
            SELECT COUNT(*)
            FROM crawled_pages
            WHERE session_id = NEW.session_id
        ),
        converted_pages = (
            SELECT COUNT(*)
            FROM crawled_pages
            WHERE session_id = NEW.session_id AND converted = TRUE
        ),
        failed_pages = (
            SELECT COUNT(*)
            FROM crawled_pages
            WHERE session_id = NEW.session_id AND conversion_status = 'failed'
        ),
        last_activity_at = NOW()
    WHERE id = NEW.session_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update session progress
CREATE TRIGGER update_session_progress_on_page_insert
    AFTER INSERT ON crawled_pages
    FOR EACH ROW
    EXECUTE FUNCTION update_session_progress();

CREATE TRIGGER update_session_progress_on_page_update
    AFTER UPDATE ON crawled_pages
    FOR EACH ROW
    WHEN (OLD.converted IS DISTINCT FROM NEW.converted OR
          OLD.conversion_status IS DISTINCT FROM NEW.conversion_status)
    EXECUTE FUNCTION update_session_progress();

-- ============================================================================
-- Views for easier querying
-- ============================================================================

-- View: Session summary with conversion statistics
CREATE OR REPLACE VIEW crawl_session_summary AS
SELECT
    cs.id,
    cs.user_id,
    cs.project_id,
    cs.start_url,
    cs.status,
    cs.crawled_pages,
    cs.converted_pages,
    cs.failed_pages,
    cs.total_pages,
    ROUND((cs.crawled_pages::DECIMAL / NULLIF(cs.total_pages, 0)) * 100, 2) as progress_percentage,
    ROUND((cs.converted_pages::DECIMAL / NULLIF(cs.crawled_pages, 0)) * 100, 2) as conversion_percentage,
    cs.crawl_method,
    cs.started_at,
    cs.completed_at,
    EXTRACT(EPOCH FROM (COALESCE(cs.completed_at, NOW()) - cs.started_at)) as duration_seconds,
    cs.created_at
FROM crawl_sessions cs;

-- View: Page conversion statistics per session
CREATE OR REPLACE VIEW session_conversion_stats AS
SELECT
    cp.session_id,
    COUNT(*) as total_pages,
    COUNT(*) FILTER (WHERE cp.converted = TRUE) as converted_count,
    COUNT(*) FILTER (WHERE cp.conversion_status = 'failed') as failed_count,
    COUNT(*) FILTER (WHERE cp.conversion_status = 'pending') as pending_count,
    AVG(LENGTH(cp.html)) as avg_html_size,
    AVG(JSONB_ARRAY_LENGTH(cp.assets->'images')) as avg_images_per_page,
    AVG(JSONB_ARRAY_LENGTH(cp.links)) as avg_links_per_page
FROM crawled_pages cp
GROUP BY cp.session_id;

-- View: Builder conversion quality metrics
CREATE OR REPLACE VIEW builder_conversion_quality AS
SELECT
    pbc.session_id,
    pbc.builder_type,
    COUNT(*) as conversion_count,
    AVG(pbc.conversion_quality) as avg_quality,
    AVG(pbc.confidence_score) as avg_confidence,
    AVG(pbc.component_count) as avg_components,
    AVG(pbc.widget_count) as avg_widgets,
    COUNT(*) FILTER (WHERE pbc.manual_review_needed = TRUE) as manual_review_count
FROM page_builder_conversions pbc
GROUP BY pbc.session_id, pbc.builder_type;

-- ============================================================================
-- Cleanup and Maintenance
-- ============================================================================

-- Function: Clean up old crawl sessions
CREATE OR REPLACE FUNCTION cleanup_old_crawl_sessions(days_old INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    -- Delete sessions older than specified days (cascades to all related tables)
    DELETE FROM crawl_sessions
    WHERE created_at < NOW() - (days_old || ' days')::INTERVAL
    AND status IN ('completed', 'failed');

    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function: Archive completed crawl sessions to separate table
CREATE TABLE IF NOT EXISTS archived_crawl_sessions (
    LIKE crawl_sessions INCLUDING ALL
);

CREATE OR REPLACE FUNCTION archive_completed_crawl_sessions(days_old INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
    archived_count INTEGER;
BEGIN
    -- Archive old completed sessions
    WITH archived AS (
        DELETE FROM crawl_sessions
        WHERE created_at < NOW() - (days_old || ' days')::INTERVAL
        AND status = 'completed'
        RETURNING *
    )
    INSERT INTO archived_crawl_sessions
    SELECT * FROM archived;

    GET DIAGNOSTICS archived_count = ROW_COUNT;
    RETURN archived_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Performance Monitoring
-- ============================================================================

-- Table: Track query performance for optimization
CREATE TABLE IF NOT EXISTS crawl_query_performance (
    id SERIAL PRIMARY KEY,
    query_type VARCHAR(100),
    execution_time_ms INTEGER,
    rows_affected INTEGER,
    session_id UUID,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_query_performance_query_type ON crawl_query_performance(query_type);
CREATE INDEX IF NOT EXISTS idx_query_performance_created_at ON crawl_query_performance(created_at DESC);

-- ============================================================================
-- Permissions
-- ============================================================================

-- Grant appropriate permissions (adjust based on your user roles)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_user;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_user;
-- GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO app_user;

-- ============================================================================
-- Migration Complete
-- ============================================================================

COMMENT ON TABLE crawl_sessions IS 'Manages multi-page website crawl sessions with progress tracking';
COMMENT ON TABLE crawled_pages IS 'Stores individual crawled page data with HTML and metadata';
COMMENT ON TABLE page_builder_conversions IS 'Stores page builder conversion results (Elementor, Gutenberg, etc.)';
COMMENT ON TABLE crawl_pagination IS 'Manages pagination state for large crawls (1000+ pages)';
COMMENT ON TABLE crawl_batch_metrics IS 'Tracks performance metrics for crawl batches';
