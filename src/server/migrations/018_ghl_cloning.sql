-- Migration: GHL Cloning System
-- Created: 2025-10-15
-- Description: Implements GoHighLevel page cloning with detection, templates, and sessions

-- ============================================================================
-- GHL CLONED PAGES TABLE
-- ============================================================================
-- Stores cloned GHL page data and metadata
CREATE TABLE IF NOT EXISTS ghl_cloned_pages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Source information
    source_url TEXT NOT NULL,
    source_domain VARCHAR(255),
    source_title VARCHAR(500),
    source_meta_description TEXT,
    source_favicon_url TEXT,

    -- Destination information (if pasted)
    destination_url TEXT,
    destination_account_id VARCHAR(255), -- GHL account/location ID
    destination_funnel_id VARCHAR(255), -- GHL funnel ID
    destination_page_id VARCHAR(255), -- GHL page ID

    -- Cloning details
    clone_status VARCHAR(50) DEFAULT 'copied', -- 'copied', 'pasted', 'failed', 'partial'
    credits_consumed INTEGER DEFAULT 1 CHECK (credits_consumed >= 0),
    page_size_bytes INTEGER,
    page_load_time_ms INTEGER,

    -- Extracted data (stored as compressed/optimized JSONB)
    html_content TEXT, -- Full HTML (consider external storage for large pages)
    custom_css TEXT, -- Custom CSS extracted
    custom_js TEXT, -- Custom JavaScript
    tracking_codes JSONB, -- Array of tracking codes
    forms JSONB, -- Form configurations
    assets JSONB, -- Images, videos, fonts metadata
    ghl_data JSONB, -- GHL-specific data structures
    metadata JSONB, -- Additional metadata

    -- Quality metrics
    elements_count INTEGER DEFAULT 0,
    images_count INTEGER DEFAULT 0,
    scripts_count INTEGER DEFAULT 0,
    forms_count INTEGER DEFAULT 0,
    has_custom_css BOOLEAN DEFAULT false,
    has_custom_js BOOLEAN DEFAULT false,
    has_tracking_codes BOOLEAN DEFAULT false,

    -- Error handling
    errors JSONB, -- Array of errors encountered
    warnings JSONB, -- Array of warnings

    -- Timestamps
    copied_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    pasted_at TIMESTAMPTZ,
    last_accessed TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMPTZ, -- For temporary storage (30 days default)
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- GHL PAGE ASSETS TABLE
-- ============================================================================
-- Separate table for managing page assets (images, videos, fonts, etc.)
CREATE TABLE IF NOT EXISTS ghl_page_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cloned_page_id UUID NOT NULL REFERENCES ghl_cloned_pages(id) ON DELETE CASCADE,
    asset_type VARCHAR(50) NOT NULL, -- 'image', 'video', 'font', 'css', 'js', 'other'
    original_url TEXT NOT NULL,
    downloaded_url TEXT, -- If we download and rehost
    file_size_bytes INTEGER,
    mime_type VARCHAR(100),
    width INTEGER, -- For images/videos
    height INTEGER, -- For images/videos
    alt_text TEXT, -- For images
    element_selector TEXT, -- CSS selector where used
    is_background BOOLEAN DEFAULT false,
    download_status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'downloaded', 'failed', 'skipped'
    error_message TEXT,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- GHL DETECTION LOG TABLE
-- ============================================================================
-- Tracks which sites are detected as GHL and confidence levels
CREATE TABLE IF NOT EXISTS ghl_detection_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    url TEXT NOT NULL,
    domain VARCHAR(255),
    is_ghl_site BOOLEAN NOT NULL,
    detection_confidence DECIMAL(3, 2) CHECK (detection_confidence >= 0 AND detection_confidence <= 1), -- 0.00 to 1.00
    detection_markers JSONB, -- What markers were found
    page_builder_version VARCHAR(50),
    ghl_account_type VARCHAR(50), -- 'agency', 'location', 'subaccount'
    detected_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    metadata JSONB
);

-- ============================================================================
-- GHL CLONE TEMPLATES TABLE
-- ============================================================================
-- Save frequently cloned pages as templates for reuse
CREATE TABLE IF NOT EXISTS ghl_clone_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    cloned_page_id UUID NOT NULL REFERENCES ghl_cloned_pages(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100), -- 'landing-page', 'sales-page', 'opt-in', 'thank-you', 'webinar', 'other'
    tags TEXT[], -- Array of tags for searchability
    is_public BOOLEAN DEFAULT false, -- If shared with community
    use_count INTEGER DEFAULT 0 CHECK (use_count >= 0),
    thumbnail_url TEXT,
    preview_url TEXT,
    rating DECIMAL(3, 2) CHECK (rating >= 0 AND rating <= 5), -- 0.00 to 5.00
    rating_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- GHL CLONE SESSIONS TABLE
-- ============================================================================
-- Track copy/paste sessions for browser extension
CREATE TABLE IF NOT EXISTS ghl_clone_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_token VARCHAR(255) UNIQUE NOT NULL,
    cloned_page_id UUID REFERENCES ghl_cloned_pages(id) ON DELETE SET NULL,
    status VARCHAR(50) DEFAULT 'active', -- 'active', 'completed', 'expired', 'abandoned'
    copied_at TIMESTAMPTZ,
    pasted_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL,
    browser_info JSONB, -- Browser, OS, extension version
    extension_version VARCHAR(50),
    ip_address INET,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- GHL cloned pages indexes
CREATE INDEX IF NOT EXISTS idx_ghl_cloned_pages_user_id ON ghl_cloned_pages(user_id);
CREATE INDEX IF NOT EXISTS idx_ghl_cloned_pages_status ON ghl_cloned_pages(clone_status);
CREATE INDEX IF NOT EXISTS idx_ghl_cloned_pages_source_domain ON ghl_cloned_pages(source_domain);
CREATE INDEX IF NOT EXISTS idx_ghl_cloned_pages_created_at ON ghl_cloned_pages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ghl_cloned_pages_copied_at ON ghl_cloned_pages(copied_at DESC);
CREATE INDEX IF NOT EXISTS idx_ghl_cloned_pages_expires_at ON ghl_cloned_pages(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ghl_cloned_pages_user_created ON ghl_cloned_pages(user_id, created_at DESC);

-- Full-text search on source URL and title
CREATE INDEX IF NOT EXISTS idx_ghl_cloned_pages_source_url_trgm ON ghl_cloned_pages USING gin(source_url gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_ghl_cloned_pages_source_title_trgm ON ghl_cloned_pages USING gin(source_title gin_trgm_ops);

-- GHL page assets indexes
CREATE INDEX IF NOT EXISTS idx_ghl_page_assets_cloned_page_id ON ghl_page_assets(cloned_page_id);
CREATE INDEX IF NOT EXISTS idx_ghl_page_assets_asset_type ON ghl_page_assets(asset_type);
CREATE INDEX IF NOT EXISTS idx_ghl_page_assets_download_status ON ghl_page_assets(download_status);

-- GHL detection log indexes
CREATE INDEX IF NOT EXISTS idx_ghl_detection_log_url ON ghl_detection_log(url);
CREATE INDEX IF NOT EXISTS idx_ghl_detection_log_domain ON ghl_detection_log(domain);
CREATE INDEX IF NOT EXISTS idx_ghl_detection_log_is_ghl ON ghl_detection_log(is_ghl_site);
CREATE INDEX IF NOT EXISTS idx_ghl_detection_log_detected_at ON ghl_detection_log(detected_at DESC);
CREATE INDEX IF NOT EXISTS idx_ghl_detection_log_user_id ON ghl_detection_log(user_id) WHERE user_id IS NOT NULL;

-- GHL clone templates indexes
CREATE INDEX IF NOT EXISTS idx_ghl_clone_templates_user_id ON ghl_clone_templates(user_id);
CREATE INDEX IF NOT EXISTS idx_ghl_clone_templates_public ON ghl_clone_templates(is_public, rating DESC, use_count DESC) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS idx_ghl_clone_templates_category ON ghl_clone_templates(category) WHERE category IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ghl_clone_templates_tags ON ghl_clone_templates USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_ghl_clone_templates_name_trgm ON ghl_clone_templates USING gin(name gin_trgm_ops);

-- GHL clone sessions indexes
CREATE INDEX IF NOT EXISTS idx_ghl_clone_sessions_user_id ON ghl_clone_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_ghl_clone_sessions_token ON ghl_clone_sessions(session_token);
CREATE INDEX IF NOT EXISTS idx_ghl_clone_sessions_status ON ghl_clone_sessions(status);
CREATE INDEX IF NOT EXISTS idx_ghl_clone_sessions_expires_at ON ghl_clone_sessions(expires_at) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_ghl_clone_sessions_cloned_page_id ON ghl_clone_sessions(cloned_page_id) WHERE cloned_page_id IS NOT NULL;

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to get user's cloning statistics
CREATE OR REPLACE FUNCTION get_user_clone_stats(p_user_id UUID)
RETURNS TABLE (
    total_clones BIGINT,
    successful_clones BIGINT,
    failed_clones BIGINT,
    partial_clones BIGINT,
    total_credits_used BIGINT,
    total_pages_pasted BIGINT,
    total_templates_created BIGINT,
    avg_page_size BIGINT,
    most_cloned_domain TEXT,
    last_clone_date TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*)::BIGINT as total_clones,
        COUNT(*) FILTER (WHERE clone_status IN ('copied', 'pasted'))::BIGINT as successful_clones,
        COUNT(*) FILTER (WHERE clone_status = 'failed')::BIGINT as failed_clones,
        COUNT(*) FILTER (WHERE clone_status = 'partial')::BIGINT as partial_clones,
        COALESCE(SUM(credits_consumed), 0)::BIGINT as total_credits_used,
        COUNT(*) FILTER (WHERE pasted_at IS NOT NULL)::BIGINT as total_pages_pasted,
        (SELECT COUNT(*)::BIGINT FROM ghl_clone_templates WHERE user_id = p_user_id) as total_templates_created,
        COALESCE(AVG(page_size_bytes), 0)::BIGINT as avg_page_size,
        (SELECT source_domain
         FROM ghl_cloned_pages
         WHERE user_id = p_user_id AND source_domain IS NOT NULL
         GROUP BY source_domain
         ORDER BY COUNT(*) DESC
         LIMIT 1) as most_cloned_domain,
        MAX(created_at) as last_clone_date
    FROM ghl_cloned_pages
    WHERE user_id = p_user_id;
END;
$$ LANGUAGE plpgsql;

-- Function to cleanup expired clone sessions
CREATE OR REPLACE FUNCTION cleanup_expired_clone_sessions()
RETURNS INTEGER AS $$
DECLARE
    v_deleted_count INTEGER;
BEGIN
    UPDATE ghl_clone_sessions
    SET status = 'expired',
        updated_at = CURRENT_TIMESTAMP
    WHERE expires_at < CURRENT_TIMESTAMP
        AND status = 'active';

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to cleanup expired cloned pages
CREATE OR REPLACE FUNCTION cleanup_expired_cloned_pages()
RETURNS INTEGER AS $$
DECLARE
    v_deleted_count INTEGER;
BEGIN
    DELETE FROM ghl_cloned_pages
    WHERE expires_at IS NOT NULL
        AND expires_at < CURRENT_TIMESTAMP
        AND clone_status != 'pasted'; -- Keep pasted pages

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to increment template use count
CREATE OR REPLACE FUNCTION increment_template_use_count(p_template_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE ghl_clone_templates
    SET use_count = use_count + 1,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_template_id;

    RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

-- Function to search cloned pages
CREATE OR REPLACE FUNCTION search_cloned_pages(
    p_user_id UUID,
    p_search_query TEXT DEFAULT NULL,
    p_status VARCHAR(50) DEFAULT NULL,
    p_start_date TIMESTAMPTZ DEFAULT NULL,
    p_end_date TIMESTAMPTZ DEFAULT NULL,
    p_limit INTEGER DEFAULT 20,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    id UUID,
    source_url TEXT,
    source_domain VARCHAR(255),
    source_title VARCHAR(500),
    clone_status VARCHAR(50),
    credits_consumed INTEGER,
    page_size_bytes INTEGER,
    copied_at TIMESTAMPTZ,
    pasted_at TIMESTAMPTZ,
    has_custom_css BOOLEAN,
    has_custom_js BOOLEAN,
    elements_count INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        gcp.id,
        gcp.source_url,
        gcp.source_domain,
        gcp.source_title,
        gcp.clone_status,
        gcp.credits_consumed,
        gcp.page_size_bytes,
        gcp.copied_at,
        gcp.pasted_at,
        gcp.has_custom_css,
        gcp.has_custom_js,
        gcp.elements_count
    FROM ghl_cloned_pages gcp
    WHERE gcp.user_id = p_user_id
        AND (p_search_query IS NULL OR
             gcp.source_url ILIKE '%' || p_search_query || '%' OR
             gcp.source_title ILIKE '%' || p_search_query || '%')
        AND (p_status IS NULL OR gcp.clone_status = p_status)
        AND (p_start_date IS NULL OR gcp.created_at >= p_start_date)
        AND (p_end_date IS NULL OR gcp.created_at <= p_end_date)
    ORDER BY gcp.created_at DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

-- Function to get popular cloned URLs (system-wide)
CREATE OR REPLACE FUNCTION get_popular_cloned_urls(p_limit INTEGER DEFAULT 10)
RETURNS TABLE (
    source_url TEXT,
    source_domain VARCHAR(255),
    source_title VARCHAR(500),
    clone_count BIGINT,
    unique_users BIGINT,
    avg_page_size BIGINT,
    last_cloned TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        gcp.source_url,
        gcp.source_domain,
        gcp.source_title,
        COUNT(*)::BIGINT as clone_count,
        COUNT(DISTINCT gcp.user_id)::BIGINT as unique_users,
        AVG(gcp.page_size_bytes)::BIGINT as avg_page_size,
        MAX(gcp.created_at) as last_cloned
    FROM ghl_cloned_pages gcp
    WHERE gcp.clone_status IN ('copied', 'pasted')
    GROUP BY gcp.source_url, gcp.source_domain, gcp.source_title
    ORDER BY clone_count DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to get GHL detection statistics
CREATE OR REPLACE FUNCTION get_ghl_detection_statistics(
    p_days_back INTEGER DEFAULT 30
)
RETURNS TABLE (
    total_detections BIGINT,
    ghl_sites_detected BIGINT,
    non_ghl_sites BIGINT,
    avg_confidence DECIMAL(3, 2),
    unique_domains BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*)::BIGINT as total_detections,
        COUNT(*) FILTER (WHERE is_ghl_site = true)::BIGINT as ghl_sites_detected,
        COUNT(*) FILTER (WHERE is_ghl_site = false)::BIGINT as non_ghl_sites,
        AVG(detection_confidence)::DECIMAL(3, 2) as avg_confidence,
        COUNT(DISTINCT domain)::BIGINT as unique_domains
    FROM ghl_detection_log
    WHERE detected_at >= CURRENT_TIMESTAMP - (p_days_back || ' days')::INTERVAL;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Trigger to update updated_at on ghl_cloned_pages
CREATE OR REPLACE FUNCTION update_ghl_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_ghl_cloned_pages_updated_at
    BEFORE UPDATE ON ghl_cloned_pages
    FOR EACH ROW
    EXECUTE FUNCTION update_ghl_updated_at();

CREATE TRIGGER trigger_update_ghl_page_assets_updated_at
    BEFORE UPDATE ON ghl_page_assets
    FOR EACH ROW
    EXECUTE FUNCTION update_ghl_updated_at();

CREATE TRIGGER trigger_update_ghl_clone_templates_updated_at
    BEFORE UPDATE ON ghl_clone_templates
    FOR EACH ROW
    EXECUTE FUNCTION update_ghl_updated_at();

CREATE TRIGGER trigger_update_ghl_clone_sessions_updated_at
    BEFORE UPDATE ON ghl_clone_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_ghl_updated_at();

-- Trigger to set default expiration on cloned pages (30 days)
CREATE OR REPLACE FUNCTION set_default_clone_expiration()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.expires_at IS NULL THEN
        NEW.expires_at = CURRENT_TIMESTAMP + INTERVAL '30 days';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_set_default_clone_expiration
    BEFORE INSERT ON ghl_cloned_pages
    FOR EACH ROW
    EXECUTE FUNCTION set_default_clone_expiration();
