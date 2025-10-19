-- Migration: Template Marketplace System
-- Created: 2025-10-17
-- Description: Enhanced template system with categories, ratings, reviews, and marketplace

-- ============================================================================
-- TEMPLATE CATEGORIES TABLE
-- ============================================================================
-- Predefined categories for organizing templates
CREATE TABLE IF NOT EXISTS template_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    slug VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    icon VARCHAR(50), -- Icon name/class
    parent_id UUID REFERENCES template_categories(id) ON DELETE SET NULL,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- TEMPLATE TAGS TABLE
-- ============================================================================
-- User-generated tags for templates
CREATE TABLE IF NOT EXISTS template_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL UNIQUE,
    slug VARCHAR(50) NOT NULL UNIQUE,
    usage_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- ENHANCE GHL_CLONE_TEMPLATES TABLE
-- ============================================================================
-- Add marketplace fields to existing template table
ALTER TABLE ghl_clone_templates
    ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES template_categories(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS preview_image_url TEXT,
    ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false, -- Admin verified quality
    ADD COLUMN IF NOT EXISTS download_count INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS view_count INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS rating_average DECIMAL(3, 2) DEFAULT 0.00 CHECK (rating_average >= 0 AND rating_average <= 5),
    ADD COLUMN IF NOT EXISTS rating_count INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS price_credits INTEGER DEFAULT 0 CHECK (price_credits >= 0), -- 0 = free
    ADD COLUMN IF NOT EXISTS license_type VARCHAR(50) DEFAULT 'free', -- 'free', 'personal', 'commercial'
    ADD COLUMN IF NOT EXISTS requirements JSONB, -- {"ghl_version": "2.0", "features": ["forms", "tracking"]}
    ADD COLUMN IF NOT EXISTS metadata JSONB, -- Additional flexible data
    ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_updated_at TIMESTAMPTZ;

-- ============================================================================
-- TEMPLATE TAG MAPPINGS TABLE
-- ============================================================================
-- Many-to-many relationship between templates and tags
CREATE TABLE IF NOT EXISTS template_tag_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES ghl_clone_templates(id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES template_tags(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(template_id, tag_id)
);

-- ============================================================================
-- TEMPLATE REVIEWS TABLE
-- ============================================================================
-- User reviews and ratings for templates
CREATE TABLE IF NOT EXISTS template_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES ghl_clone_templates(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    title VARCHAR(200),
    review_text TEXT,
    helpful_count INTEGER DEFAULT 0,
    is_verified_purchase BOOLEAN DEFAULT false, -- Did they actually use this template?
    is_approved BOOLEAN DEFAULT true, -- Admin moderation
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(template_id, user_id) -- One review per user per template
);

-- ============================================================================
-- TEMPLATE REVIEW HELPFUL TABLE
-- ============================================================================
-- Track which users found reviews helpful
CREATE TABLE IF NOT EXISTS template_review_helpful (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    review_id UUID NOT NULL REFERENCES template_reviews(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(review_id, user_id)
);

-- ============================================================================
-- TEMPLATE USAGE TABLE
-- ============================================================================
-- Track template usage for analytics and recommendations
CREATE TABLE IF NOT EXISTS template_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES ghl_clone_templates(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action VARCHAR(50) NOT NULL, -- 'view', 'download', 'use', 'favorite'
    cloned_page_id UUID REFERENCES ghl_cloned_pages(id) ON DELETE SET NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- TEMPLATE FAVORITES TABLE
-- ============================================================================
-- User favorites/bookmarks
CREATE TABLE IF NOT EXISTS template_favorites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES ghl_clone_templates(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(template_id, user_id)
);

-- ============================================================================
-- TEMPLATE COLLECTIONS TABLE
-- ============================================================================
-- User-created collections of templates
CREATE TABLE IF NOT EXISTS template_collections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    is_public BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- TEMPLATE COLLECTION ITEMS TABLE
-- ============================================================================
-- Templates within collections
CREATE TABLE IF NOT EXISTS template_collection_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    collection_id UUID NOT NULL REFERENCES template_collections(id) ON DELETE CASCADE,
    template_id UUID NOT NULL REFERENCES ghl_clone_templates(id) ON DELETE CASCADE,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(collection_id, template_id)
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Template categories
CREATE INDEX IF NOT EXISTS idx_template_categories_slug ON template_categories(slug);
CREATE INDEX IF NOT EXISTS idx_template_categories_parent ON template_categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_template_categories_active ON template_categories(is_active) WHERE is_active = true;

-- Template tags
CREATE INDEX IF NOT EXISTS idx_template_tags_slug ON template_tags(slug);
CREATE INDEX IF NOT EXISTS idx_template_tags_usage ON template_tags(usage_count DESC);

-- Enhanced templates
CREATE INDEX IF NOT EXISTS idx_templates_category ON ghl_clone_templates(category_id);
CREATE INDEX IF NOT EXISTS idx_templates_public ON ghl_clone_templates(is_public) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS idx_templates_featured ON ghl_clone_templates(is_featured) WHERE is_featured = true;
CREATE INDEX IF NOT EXISTS idx_templates_rating ON ghl_clone_templates(rating_average DESC);
CREATE INDEX IF NOT EXISTS idx_templates_downloads ON ghl_clone_templates(download_count DESC);
CREATE INDEX IF NOT EXISTS idx_templates_published ON ghl_clone_templates(published_at) WHERE published_at IS NOT NULL;

-- Template tag mappings
CREATE INDEX IF NOT EXISTS idx_template_tags_template ON template_tag_mappings(template_id);
CREATE INDEX IF NOT EXISTS idx_template_tags_tag ON template_tag_mappings(tag_id);

-- Template reviews
CREATE INDEX IF NOT EXISTS idx_template_reviews_template ON template_reviews(template_id);
CREATE INDEX IF NOT EXISTS idx_template_reviews_user ON template_reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_template_reviews_rating ON template_reviews(rating DESC);
CREATE INDEX IF NOT EXISTS idx_template_reviews_approved ON template_reviews(is_approved) WHERE is_approved = true;

-- Template usage
CREATE INDEX IF NOT EXISTS idx_template_usage_template ON template_usage(template_id);
CREATE INDEX IF NOT EXISTS idx_template_usage_user ON template_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_template_usage_action ON template_usage(action);
CREATE INDEX IF NOT EXISTS idx_template_usage_created ON template_usage(created_at DESC);

-- Template favorites
CREATE INDEX IF NOT EXISTS idx_template_favorites_user ON template_favorites(user_id);
CREATE INDEX IF NOT EXISTS idx_template_favorites_template ON template_favorites(template_id);

-- Template collections
CREATE INDEX IF NOT EXISTS idx_template_collections_user ON template_collections(user_id);
CREATE INDEX IF NOT EXISTS idx_template_collections_public ON template_collections(is_public) WHERE is_public = true;

-- Template collection items
CREATE INDEX IF NOT EXISTS idx_template_collection_items_collection ON template_collection_items(collection_id);
CREATE INDEX IF NOT EXISTS idx_template_collection_items_template ON template_collection_items(template_id);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to update template rating when review added/updated
CREATE OR REPLACE FUNCTION update_template_rating()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE ghl_clone_templates
    SET
        rating_average = (
            SELECT COALESCE(AVG(rating), 0)
            FROM template_reviews
            WHERE template_id = NEW.template_id AND is_approved = true
        ),
        rating_count = (
            SELECT COUNT(*)
            FROM template_reviews
            WHERE template_id = NEW.template_id AND is_approved = true
        ),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = NEW.template_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_template_rating
    AFTER INSERT OR UPDATE ON template_reviews
    FOR EACH ROW
    EXECUTE FUNCTION update_template_rating();

-- Function to increment tag usage count
CREATE OR REPLACE FUNCTION increment_tag_usage()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE template_tags
    SET usage_count = usage_count + 1
    WHERE id = NEW.tag_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_increment_tag_usage
    AFTER INSERT ON template_tag_mappings
    FOR EACH ROW
    EXECUTE FUNCTION increment_tag_usage();

-- Function to decrement tag usage count
CREATE OR REPLACE FUNCTION decrement_tag_usage()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE template_tags
    SET usage_count = GREATEST(usage_count - 1, 0)
    WHERE id = OLD.tag_id;

    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_decrement_tag_usage
    AFTER DELETE ON template_tag_mappings
    FOR EACH ROW
    EXECUTE FUNCTION decrement_tag_usage();

-- Function to track template usage
CREATE OR REPLACE FUNCTION track_template_usage(
    p_template_id UUID,
    p_user_id UUID,
    p_action VARCHAR(50),
    p_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS UUID AS $$
DECLARE
    v_usage_id UUID;
BEGIN
    -- Insert usage record
    INSERT INTO template_usage (template_id, user_id, action, metadata)
    VALUES (p_template_id, p_user_id, p_action, p_metadata)
    RETURNING id INTO v_usage_id;

    -- Update counters on template
    IF p_action = 'download' THEN
        UPDATE ghl_clone_templates
        SET download_count = download_count + 1,
            use_count = use_count + 1
        WHERE id = p_template_id;
    ELSIF p_action = 'view' THEN
        UPDATE ghl_clone_templates
        SET view_count = view_count + 1
        WHERE id = p_template_id;
    END IF;

    RETURN v_usage_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get template recommendations
CREATE OR REPLACE FUNCTION get_template_recommendations(
    p_user_id UUID,
    p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
    template_id UUID,
    score DECIMAL(10, 2)
) AS $$
BEGIN
    RETURN QUERY
    WITH user_favorites AS (
        -- Get user's favorite templates
        SELECT tf.template_id
        FROM template_favorites tf
        WHERE tf.user_id = p_user_id
    ),
    favorite_tags AS (
        -- Get tags from favorite templates
        SELECT DISTINCT ttm.tag_id
        FROM template_tag_mappings ttm
        WHERE ttm.template_id IN (SELECT template_id FROM user_favorites)
    ),
    similar_templates AS (
        -- Find templates with similar tags
        SELECT
            ttm.template_id,
            COUNT(*) as tag_matches
        FROM template_tag_mappings ttm
        WHERE ttm.tag_id IN (SELECT tag_id FROM favorite_tags)
            AND ttm.template_id NOT IN (SELECT template_id FROM user_favorites)
        GROUP BY ttm.template_id
    )
    SELECT
        t.id as template_id,
        (
            COALESCE(st.tag_matches, 0) * 10 + -- Tag similarity
            (t.rating_average * 5) +            -- Rating weight
            (LOG(t.download_count + 1) * 2) +   -- Popularity weight
            (CASE WHEN t.is_featured THEN 10 ELSE 0 END) + -- Featured boost
            (CASE WHEN t.is_verified THEN 5 ELSE 0 END)    -- Verified boost
        )::DECIMAL(10, 2) as score
    FROM ghl_clone_templates t
    LEFT JOIN similar_templates st ON st.template_id = t.id
    WHERE t.is_public = true
        AND t.published_at IS NOT NULL
        AND t.id NOT IN (SELECT template_id FROM user_favorites)
    ORDER BY score DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Function to search templates
CREATE OR REPLACE FUNCTION search_templates(
    p_query TEXT,
    p_category_id UUID DEFAULT NULL,
    p_tags TEXT[] DEFAULT NULL,
    p_min_rating DECIMAL DEFAULT 0,
    p_limit INTEGER DEFAULT 50,
    p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
    template_id UUID,
    name VARCHAR(255),
    description TEXT,
    category_name VARCHAR(100),
    rating_average DECIMAL(3, 2),
    download_count INTEGER,
    preview_image_url TEXT,
    relevance_score DECIMAL(10, 2)
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        t.id as template_id,
        t.name,
        t.description,
        tc.name as category_name,
        t.rating_average,
        t.download_count,
        t.preview_image_url,
        (
            -- Text search relevance
            (CASE WHEN t.name ILIKE '%' || p_query || '%' THEN 10 ELSE 0 END) +
            (CASE WHEN t.description ILIKE '%' || p_query || '%' THEN 5 ELSE 0 END) +
            -- Rating and popularity
            (t.rating_average * 2) +
            (LOG(t.download_count + 1))
        )::DECIMAL(10, 2) as relevance_score
    FROM ghl_clone_templates t
    LEFT JOIN template_categories tc ON t.category_id = tc.id
    WHERE t.is_public = true
        AND t.published_at IS NOT NULL
        AND (p_query IS NULL OR t.name ILIKE '%' || p_query || '%' OR t.description ILIKE '%' || p_query || '%')
        AND (p_category_id IS NULL OR t.category_id = p_category_id)
        AND t.rating_average >= p_min_rating
        AND (p_tags IS NULL OR EXISTS (
            SELECT 1
            FROM template_tag_mappings ttm
            JOIN template_tags tt ON ttm.tag_id = tt.id
            WHERE ttm.template_id = t.id
                AND tt.slug = ANY(p_tags)
        ))
    ORDER BY relevance_score DESC, t.download_count DESC
    LIMIT p_limit
    OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Trigger to update updated_at on template categories
CREATE TRIGGER trigger_update_template_categories_updated_at
    BEFORE UPDATE ON template_categories
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();

-- Trigger to update updated_at on template reviews
CREATE TRIGGER trigger_update_template_reviews_updated_at
    BEFORE UPDATE ON template_reviews
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();

-- Trigger to update updated_at on template collections
CREATE TRIGGER trigger_update_template_collections_updated_at
    BEFORE UPDATE ON template_collections
    FOR EACH ROW
    EXECUTE FUNCTION update_timestamp();

-- ============================================================================
-- SEED DEFAULT CATEGORIES
-- ============================================================================

INSERT INTO template_categories (name, slug, description, icon, sort_order) VALUES
('Landing Pages', 'landing-pages', 'High-converting landing page templates', 'landing-page', 1),
('Sales Pages', 'sales-pages', 'Product and service sales page templates', 'shopping-cart', 2),
('Lead Capture', 'lead-capture', 'Lead generation and capture pages', 'magnet', 3),
('Thank You Pages', 'thank-you', 'Post-conversion thank you pages', 'check-circle', 4),
('Webinar Funnels', 'webinar-funnels', 'Complete webinar funnel templates', 'video', 5),
('E-commerce', 'ecommerce', 'Product pages and shopping experiences', 'store', 6),
('Opt-in Pages', 'opt-in', 'Email opt-in and subscription pages', 'envelope', 7),
('Coming Soon', 'coming-soon', 'Coming soon and launch pages', 'clock', 8),
('Event Pages', 'event', 'Event registration and information pages', 'calendar', 9),
('Service Pages', 'services', 'Service offering and booking pages', 'briefcase', 10)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================================
-- SEED POPULAR TAGS
-- ============================================================================

INSERT INTO template_tags (name, slug) VALUES
('High Converting', 'high-converting'),
('Mobile Optimized', 'mobile-optimized'),
('Video Background', 'video-background'),
('Form Heavy', 'form-heavy'),
('Minimal Design', 'minimal'),
('Bold Design', 'bold'),
('Corporate', 'corporate'),
('Modern', 'modern'),
('Clean', 'clean'),
('Colorful', 'colorful')
ON CONFLICT (slug) DO NOTHING;

-- Create update_timestamp function if not exists
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
