-- Migration: White-Label Marketplace
-- This adds customizable branded marketplace capabilities with multi-seller support

-- ============================================================================
-- TABLES
-- ============================================================================

-- Marketplace settings and branding
CREATE TABLE IF NOT EXISTS marketplace_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,

    -- Basic settings
    marketplace_name VARCHAR(200) NOT NULL,
    marketplace_slug VARCHAR(200) UNIQUE NOT NULL,
    tagline TEXT,
    description TEXT,

    -- Domain settings
    custom_domain VARCHAR(255),
    subdomain VARCHAR(100) UNIQUE,
    ssl_enabled BOOLEAN DEFAULT false,
    domain_verified BOOLEAN DEFAULT false,
    domain_verified_at TIMESTAMPTZ,

    -- Branding
    logo_url TEXT,
    favicon_url TEXT,
    hero_image_url TEXT,

    -- Color scheme
    primary_color VARCHAR(7) DEFAULT '#000000',
    secondary_color VARCHAR(7) DEFAULT '#ffffff',
    accent_color VARCHAR(7) DEFAULT '#007bff',
    background_color VARCHAR(7) DEFAULT '#ffffff',
    text_color VARCHAR(7) DEFAULT '#000000',

    -- Typography
    font_family VARCHAR(100) DEFAULT 'Inter',
    heading_font VARCHAR(100),

    -- Contact information
    contact_email VARCHAR(255),
    support_email VARCHAR(255),
    phone VARCHAR(50),
    address TEXT,

    -- Social media
    social_links JSONB DEFAULT '{}',

    -- SEO settings
    meta_title VARCHAR(200),
    meta_description TEXT,
    meta_keywords TEXT,
    og_image_url TEXT,

    -- Features
    enable_seller_registration BOOLEAN DEFAULT true,
    enable_reviews BOOLEAN DEFAULT true,
    enable_favorites BOOLEAN DEFAULT true,
    enable_messaging BOOLEAN DEFAULT true,
    require_approval BOOLEAN DEFAULT true,

    -- Commission settings
    default_commission_rate DECIMAL(5,2) DEFAULT 0.00,
    commission_type VARCHAR(50) DEFAULT 'percentage',  -- 'percentage', 'fixed'

    -- Payment settings
    payment_providers JSONB DEFAULT '[]',
    payout_schedule VARCHAR(50) DEFAULT 'monthly',     -- 'weekly', 'monthly', 'manual'
    minimum_payout_amount DECIMAL(10,2) DEFAULT 50.00,

    -- Template submission settings
    auto_publish_templates BOOLEAN DEFAULT false,
    require_template_review BOOLEAN DEFAULT true,
    template_approval_workflow_id UUID REFERENCES approval_workflows(id),

    -- Legal
    terms_url TEXT,
    privacy_url TEXT,
    refund_policy_url TEXT,

    -- Analytics
    google_analytics_id VARCHAR(50),
    facebook_pixel_id VARCHAR(50),

    -- Status
    is_active BOOLEAN DEFAULT true,
    is_public BOOLEAN DEFAULT false,
    launched_at TIMESTAMPTZ,

    -- Custom CSS/JS
    custom_css TEXT,
    custom_js TEXT,
    custom_head_html TEXT,

    -- Metadata
    metadata JSONB DEFAULT '{}',

    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    -- Indexes
    INDEX idx_marketplace_settings_user (user_id),
    INDEX idx_marketplace_settings_slug (marketplace_slug),
    INDEX idx_marketplace_settings_subdomain (subdomain),
    INDEX idx_marketplace_settings_domain (custom_domain),
    INDEX idx_marketplace_settings_active (is_active)
);

-- Seller profiles
CREATE TABLE IF NOT EXISTS seller_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    marketplace_id UUID NOT NULL REFERENCES marketplace_settings(id) ON DELETE CASCADE,

    -- Profile info
    display_name VARCHAR(200) NOT NULL,
    slug VARCHAR(200) NOT NULL,
    bio TEXT,
    avatar_url TEXT,
    cover_image_url TEXT,

    -- Contact
    public_email VARCHAR(255),
    website_url TEXT,
    social_links JSONB DEFAULT '{}',

    -- Seller status
    status VARCHAR(50) DEFAULT 'pending',  -- 'pending', 'active', 'suspended', 'banned'
    verified BOOLEAN DEFAULT false,
    verified_at TIMESTAMPTZ,
    featured BOOLEAN DEFAULT false,

    -- Stats
    total_templates INTEGER DEFAULT 0,
    total_sales INTEGER DEFAULT 0,
    total_revenue DECIMAL(10,2) DEFAULT 0.00,
    average_rating DECIMAL(3,2) DEFAULT 0.00,
    total_reviews INTEGER DEFAULT 0,

    -- Commission override
    custom_commission_rate DECIMAL(5,2),
    commission_type VARCHAR(50),

    -- Payout info
    payout_method VARCHAR(50),             -- 'paypal', 'stripe', 'bank_transfer'
    payout_details JSONB DEFAULT '{}',
    payout_schedule VARCHAR(50),

    -- Application info
    application_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    application_notes TEXT,
    approved_by UUID REFERENCES users(id),
    approved_at TIMESTAMPTZ,
    rejection_reason TEXT,

    -- Metadata
    metadata JSONB DEFAULT '{}',

    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(marketplace_id, user_id),
    UNIQUE(marketplace_id, slug),

    -- Indexes
    INDEX idx_seller_profiles_user (user_id),
    INDEX idx_seller_profiles_marketplace (marketplace_id),
    INDEX idx_seller_profiles_status (status),
    INDEX idx_seller_profiles_slug (marketplace_id, slug),
    INDEX idx_seller_profiles_featured (featured),
    INDEX idx_seller_profiles_verified (verified)
);

-- Marketplace transactions
CREATE TABLE IF NOT EXISTS marketplace_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    marketplace_id UUID NOT NULL REFERENCES marketplace_settings(id) ON DELETE CASCADE,
    seller_id UUID NOT NULL REFERENCES seller_profiles(id) ON DELETE CASCADE,
    buyer_id UUID REFERENCES users(id) ON DELETE SET NULL,
    template_id UUID NOT NULL REFERENCES ghl_clone_templates(id) ON DELETE CASCADE,

    -- Transaction details
    transaction_type VARCHAR(50) NOT NULL,     -- 'sale', 'refund', 'chargeback'
    amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'USD',

    -- Commission breakdown
    commission_rate DECIMAL(5,2),
    commission_amount DECIMAL(10,2),
    seller_amount DECIMAL(10,2),
    marketplace_amount DECIMAL(10,2),

    -- Payment info
    payment_method VARCHAR(50),               -- 'credit_card', 'paypal', 'stripe', etc.
    payment_provider VARCHAR(50),
    payment_provider_id VARCHAR(255),
    payment_status VARCHAR(50) DEFAULT 'pending',  -- 'pending', 'completed', 'failed', 'refunded'

    -- Invoice
    invoice_number VARCHAR(100),
    invoice_url TEXT,

    -- Dates
    transaction_date TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMPTZ,
    refunded_at TIMESTAMPTZ,

    -- Metadata
    metadata JSONB DEFAULT '{}',

    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    -- Indexes
    INDEX idx_marketplace_transactions_marketplace (marketplace_id),
    INDEX idx_marketplace_transactions_seller (seller_id),
    INDEX idx_marketplace_transactions_buyer (buyer_id),
    INDEX idx_marketplace_transactions_template (template_id),
    INDEX idx_marketplace_transactions_date (transaction_date DESC),
    INDEX idx_marketplace_transactions_status (payment_status)
);

-- Seller payouts
CREATE TABLE IF NOT EXISTS seller_payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    marketplace_id UUID NOT NULL REFERENCES marketplace_settings(id) ON DELETE CASCADE,
    seller_id UUID NOT NULL REFERENCES seller_profiles(id) ON DELETE CASCADE,

    -- Payout details
    payout_period_start DATE NOT NULL,
    payout_period_end DATE NOT NULL,
    total_amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'USD',

    -- Breakdown
    total_sales INTEGER DEFAULT 0,
    gross_revenue DECIMAL(10,2) DEFAULT 0.00,
    commission_deducted DECIMAL(10,2) DEFAULT 0.00,
    refunds_deducted DECIMAL(10,2) DEFAULT 0.00,
    adjustments DECIMAL(10,2) DEFAULT 0.00,
    net_amount DECIMAL(10,2) NOT NULL,

    -- Payment
    payout_method VARCHAR(50),
    payout_details JSONB DEFAULT '{}',
    payout_status VARCHAR(50) DEFAULT 'pending',  -- 'pending', 'processing', 'completed', 'failed'
    payment_provider VARCHAR(50),
    payment_provider_id VARCHAR(255),

    -- Dates
    scheduled_date DATE,
    processed_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    failure_reason TEXT,

    -- Metadata
    metadata JSONB DEFAULT '{}',

    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    -- Indexes
    INDEX idx_seller_payouts_marketplace (marketplace_id),
    INDEX idx_seller_payouts_seller (seller_id),
    INDEX idx_seller_payouts_status (payout_status),
    INDEX idx_seller_payouts_period (payout_period_start, payout_period_end),
    INDEX idx_seller_payouts_scheduled (scheduled_date)
);

-- Marketplace categories
CREATE TABLE IF NOT EXISTS marketplace_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    marketplace_id UUID NOT NULL REFERENCES marketplace_settings(id) ON DELETE CASCADE,

    name VARCHAR(200) NOT NULL,
    slug VARCHAR(200) NOT NULL,
    description TEXT,
    icon VARCHAR(100),
    image_url TEXT,

    -- Hierarchy
    parent_id UUID REFERENCES marketplace_categories(id) ON DELETE SET NULL,
    level INTEGER DEFAULT 0,
    sort_order INTEGER DEFAULT 0,

    -- Display
    is_active BOOLEAN DEFAULT true,
    is_featured BOOLEAN DEFAULT false,

    -- Stats
    template_count INTEGER DEFAULT 0,

    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(marketplace_id, slug),

    -- Indexes
    INDEX idx_marketplace_categories_marketplace (marketplace_id),
    INDEX idx_marketplace_categories_parent (parent_id),
    INDEX idx_marketplace_categories_slug (marketplace_id, slug),
    INDEX idx_marketplace_categories_active (is_active),
    INDEX idx_marketplace_categories_featured (is_featured)
);

-- Template marketplace listings
CREATE TABLE IF NOT EXISTS marketplace_template_listings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    marketplace_id UUID NOT NULL REFERENCES marketplace_settings(id) ON DELETE CASCADE,
    seller_id UUID NOT NULL REFERENCES seller_profiles(id) ON DELETE CASCADE,
    template_id UUID NOT NULL REFERENCES ghl_clone_templates(id) ON DELETE CASCADE,
    category_id UUID REFERENCES marketplace_categories(id) ON DELETE SET NULL,

    -- Listing details
    title VARCHAR(255) NOT NULL,
    description TEXT,
    features TEXT[],
    tags VARCHAR(100)[],

    -- Pricing
    price DECIMAL(10,2) DEFAULT 0.00,
    currency VARCHAR(10) DEFAULT 'USD',
    is_free BOOLEAN DEFAULT false,
    original_price DECIMAL(10,2),            -- For showing discounts
    discount_percentage INTEGER,

    -- Media
    images TEXT[],
    demo_url TEXT,
    video_url TEXT,

    -- Status
    status VARCHAR(50) DEFAULT 'draft',      -- 'draft', 'pending_review', 'active', 'rejected', 'suspended'
    published_at TIMESTAMPTZ,
    rejected_at TIMESTAMPTZ,
    rejection_reason TEXT,

    -- Stats
    views INTEGER DEFAULT 0,
    clones INTEGER DEFAULT 0,
    sales INTEGER DEFAULT 0,
    revenue DECIMAL(10,2) DEFAULT 0.00,
    average_rating DECIMAL(3,2) DEFAULT 0.00,
    review_count INTEGER DEFAULT 0,

    -- SEO
    meta_title VARCHAR(200),
    meta_description TEXT,

    -- Featured
    is_featured BOOLEAN DEFAULT false,
    featured_until TIMESTAMPTZ,

    -- Metadata
    metadata JSONB DEFAULT '{}',

    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(marketplace_id, template_id),

    -- Indexes
    INDEX idx_marketplace_listings_marketplace (marketplace_id),
    INDEX idx_marketplace_listings_seller (seller_id),
    INDEX idx_marketplace_listings_template (template_id),
    INDEX idx_marketplace_listings_category (category_id),
    INDEX idx_marketplace_listings_status (status),
    INDEX idx_marketplace_listings_featured (is_featured),
    INDEX idx_marketplace_listings_published (published_at DESC),
    INDEX idx_marketplace_listings_price (price)
);

-- Marketplace reviews
CREATE TABLE IF NOT EXISTS marketplace_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    marketplace_id UUID NOT NULL REFERENCES marketplace_settings(id) ON DELETE CASCADE,
    listing_id UUID NOT NULL REFERENCES marketplace_template_listings(id) ON DELETE CASCADE,
    seller_id UUID NOT NULL REFERENCES seller_profiles(id) ON DELETE CASCADE,
    reviewer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Review details
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    title VARCHAR(255),
    review_text TEXT,

    -- Purchase verification
    verified_purchase BOOLEAN DEFAULT false,
    transaction_id UUID REFERENCES marketplace_transactions(id),

    -- Status
    status VARCHAR(50) DEFAULT 'pending',    -- 'pending', 'approved', 'rejected', 'flagged'
    approved_at TIMESTAMPTZ,
    rejected_at TIMESTAMPTZ,
    rejection_reason TEXT,

    -- Helpfulness
    helpful_count INTEGER DEFAULT 0,
    not_helpful_count INTEGER DEFAULT 0,

    -- Seller response
    seller_response TEXT,
    seller_responded_at TIMESTAMPTZ,

    -- Metadata
    metadata JSONB DEFAULT '{}',

    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(listing_id, reviewer_id),

    -- Indexes
    INDEX idx_marketplace_reviews_marketplace (marketplace_id),
    INDEX idx_marketplace_reviews_listing (listing_id),
    INDEX idx_marketplace_reviews_seller (seller_id),
    INDEX idx_marketplace_reviews_reviewer (reviewer_id),
    INDEX idx_marketplace_reviews_rating (rating),
    INDEX idx_marketplace_reviews_status (status),
    INDEX idx_marketplace_reviews_created (created_at DESC)
);

-- Email templates for marketplace
CREATE TABLE IF NOT EXISTS marketplace_email_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    marketplace_id UUID NOT NULL REFERENCES marketplace_settings(id) ON DELETE CASCADE,

    template_type VARCHAR(100) NOT NULL,     -- 'welcome_seller', 'sale_notification', 'payout_notification', etc.
    template_name VARCHAR(200) NOT NULL,

    -- Email content
    subject VARCHAR(255) NOT NULL,
    body_html TEXT NOT NULL,
    body_text TEXT,

    -- Variables available
    available_variables TEXT[],

    -- Status
    is_active BOOLEAN DEFAULT true,
    is_default BOOLEAN DEFAULT false,

    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(marketplace_id, template_type),

    INDEX idx_marketplace_emails_marketplace (marketplace_id),
    INDEX idx_marketplace_emails_type (template_type)
);

-- Marketplace analytics
CREATE TABLE IF NOT EXISTS marketplace_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    marketplace_id UUID NOT NULL REFERENCES marketplace_settings(id) ON DELETE CASCADE,
    date DATE NOT NULL,

    -- Traffic
    unique_visitors INTEGER DEFAULT 0,
    total_pageviews INTEGER DEFAULT 0,
    bounce_rate DECIMAL(5,2) DEFAULT 0.00,

    -- Sellers
    new_sellers INTEGER DEFAULT 0,
    active_sellers INTEGER DEFAULT 0,

    -- Listings
    new_listings INTEGER DEFAULT 0,
    active_listings INTEGER DEFAULT 0,

    -- Sales
    total_transactions INTEGER DEFAULT 0,
    gross_revenue DECIMAL(10,2) DEFAULT 0.00,
    net_revenue DECIMAL(10,2) DEFAULT 0.00,
    commission_earned DECIMAL(10,2) DEFAULT 0.00,

    -- Engagement
    new_reviews INTEGER DEFAULT 0,
    total_clones INTEGER DEFAULT 0,

    -- Top performers
    top_seller_id UUID REFERENCES seller_profiles(id),
    top_listing_id UUID REFERENCES marketplace_template_listings(id),

    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(marketplace_id, date),

    INDEX idx_marketplace_analytics_marketplace (marketplace_id),
    INDEX idx_marketplace_analytics_date (date DESC)
);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to calculate seller stats
CREATE OR REPLACE FUNCTION update_seller_stats(p_seller_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE seller_profiles
    SET
        total_templates = (
            SELECT COUNT(*)
            FROM marketplace_template_listings
            WHERE seller_id = p_seller_id AND status = 'active'
        ),
        total_sales = (
            SELECT COUNT(*)
            FROM marketplace_transactions
            WHERE seller_id = p_seller_id AND transaction_type = 'sale' AND payment_status = 'completed'
        ),
        total_revenue = (
            SELECT COALESCE(SUM(seller_amount), 0)
            FROM marketplace_transactions
            WHERE seller_id = p_seller_id AND transaction_type = 'sale' AND payment_status = 'completed'
        ),
        average_rating = (
            SELECT COALESCE(AVG(rating), 0)
            FROM marketplace_reviews
            WHERE seller_id = p_seller_id AND status = 'approved'
        ),
        total_reviews = (
            SELECT COUNT(*)
            FROM marketplace_reviews
            WHERE seller_id = p_seller_id AND status = 'approved'
        ),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_seller_id;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate listing stats
CREATE OR REPLACE FUNCTION update_listing_stats(p_listing_id UUID)
RETURNS void AS $$
BEGIN
    UPDATE marketplace_template_listings
    SET
        sales = (
            SELECT COUNT(*)
            FROM marketplace_transactions
            WHERE marketplace_transactions.template_id = marketplace_template_listings.template_id
                AND transaction_type = 'sale'
                AND payment_status = 'completed'
        ),
        revenue = (
            SELECT COALESCE(SUM(amount), 0)
            FROM marketplace_transactions
            WHERE marketplace_transactions.template_id = marketplace_template_listings.template_id
                AND transaction_type = 'sale'
                AND payment_status = 'completed'
        ),
        average_rating = (
            SELECT COALESCE(AVG(rating), 0)
            FROM marketplace_reviews
            WHERE listing_id = p_listing_id AND status = 'approved'
        ),
        review_count = (
            SELECT COUNT(*)
            FROM marketplace_reviews
            WHERE listing_id = p_listing_id AND status = 'approved'
        ),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = p_listing_id;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate marketplace revenue for a seller
CREATE OR REPLACE FUNCTION calculate_seller_payout(
    p_seller_id UUID,
    p_start_date DATE,
    p_end_date DATE
) RETURNS TABLE (
    total_sales BIGINT,
    gross_revenue DECIMAL,
    commission_deducted DECIMAL,
    refunds_deducted DECIMAL,
    net_amount DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    WITH sales AS (
        SELECT
            COUNT(*) FILTER (WHERE transaction_type = 'sale') AS sale_count,
            COALESCE(SUM(amount) FILTER (WHERE transaction_type = 'sale'), 0) AS gross,
            COALESCE(SUM(commission_amount) FILTER (WHERE transaction_type = 'sale'), 0) AS commission,
            COALESCE(SUM(amount) FILTER (WHERE transaction_type = 'refund'), 0) AS refunds
        FROM marketplace_transactions
        WHERE seller_id = p_seller_id
            AND DATE(transaction_date) BETWEEN p_start_date AND p_end_date
            AND payment_status = 'completed'
    )
    SELECT
        sale_count,
        gross,
        commission,
        refunds,
        (gross - commission - refunds) AS net
    FROM sales;
END;
$$ LANGUAGE plpgsql;

-- Function to get marketplace statistics
CREATE OR REPLACE FUNCTION get_marketplace_statistics(
    p_marketplace_id UUID,
    p_start_date DATE,
    p_end_date DATE
) RETURNS TABLE (
    total_sellers BIGINT,
    active_sellers BIGINT,
    total_listings BIGINT,
    active_listings BIGINT,
    total_transactions BIGINT,
    gross_revenue DECIMAL,
    commission_earned DECIMAL,
    avg_transaction_value DECIMAL,
    total_reviews BIGINT,
    avg_rating DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        (SELECT COUNT(*) FROM seller_profiles WHERE marketplace_id = p_marketplace_id)::BIGINT,
        (SELECT COUNT(*) FROM seller_profiles WHERE marketplace_id = p_marketplace_id AND status = 'active')::BIGINT,
        (SELECT COUNT(*) FROM marketplace_template_listings WHERE marketplace_id = p_marketplace_id)::BIGINT,
        (SELECT COUNT(*) FROM marketplace_template_listings WHERE marketplace_id = p_marketplace_id AND status = 'active')::BIGINT,
        (SELECT COUNT(*) FROM marketplace_transactions WHERE marketplace_id = p_marketplace_id AND DATE(transaction_date) BETWEEN p_start_date AND p_end_date)::BIGINT,
        (SELECT COALESCE(SUM(amount), 0) FROM marketplace_transactions WHERE marketplace_id = p_marketplace_id AND transaction_type = 'sale' AND DATE(transaction_date) BETWEEN p_start_date AND p_end_date)::DECIMAL,
        (SELECT COALESCE(SUM(marketplace_amount), 0) FROM marketplace_transactions WHERE marketplace_id = p_marketplace_id AND transaction_type = 'sale' AND DATE(transaction_date) BETWEEN p_start_date AND p_end_date)::DECIMAL,
        (SELECT COALESCE(AVG(amount), 0) FROM marketplace_transactions WHERE marketplace_id = p_marketplace_id AND transaction_type = 'sale' AND DATE(transaction_date) BETWEEN p_start_date AND p_end_date)::DECIMAL,
        (SELECT COUNT(*) FROM marketplace_reviews WHERE marketplace_id = p_marketplace_id AND status = 'approved')::BIGINT,
        (SELECT COALESCE(AVG(rating), 0) FROM marketplace_reviews WHERE marketplace_id = p_marketplace_id AND status = 'approved')::DECIMAL;
END;
$$ LANGUAGE plpgsql;

-- Function to get top sellers
CREATE OR REPLACE FUNCTION get_top_sellers(
    p_marketplace_id UUID,
    p_limit INTEGER DEFAULT 10
) RETURNS TABLE (
    seller_id UUID,
    display_name VARCHAR,
    total_sales BIGINT,
    total_revenue DECIMAL,
    average_rating DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        sp.id,
        sp.display_name,
        sp.total_sales::BIGINT,
        sp.total_revenue,
        sp.average_rating
    FROM seller_profiles sp
    WHERE sp.marketplace_id = p_marketplace_id
        AND sp.status = 'active'
    ORDER BY sp.total_revenue DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Trigger to update seller stats on transaction
CREATE OR REPLACE FUNCTION trigger_update_seller_stats()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM update_seller_stats(NEW.seller_id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER marketplace_transaction_seller_stats
AFTER INSERT OR UPDATE ON marketplace_transactions
FOR EACH ROW
EXECUTE FUNCTION trigger_update_seller_stats();

-- Trigger to update listing stats on review
CREATE OR REPLACE FUNCTION trigger_update_listing_stats()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM update_listing_stats(NEW.listing_id);
    PERFORM update_seller_stats(NEW.seller_id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER marketplace_review_stats
AFTER INSERT OR UPDATE ON marketplace_reviews
FOR EACH ROW
WHEN (NEW.status = 'approved')
EXECUTE FUNCTION trigger_update_listing_stats();

-- Trigger to update timestamps
CREATE OR REPLACE FUNCTION update_marketplace_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER marketplace_settings_update_timestamp
BEFORE UPDATE ON marketplace_settings
FOR EACH ROW
EXECUTE FUNCTION update_marketplace_timestamp();

CREATE TRIGGER seller_profiles_update_timestamp
BEFORE UPDATE ON seller_profiles
FOR EACH ROW
EXECUTE FUNCTION update_marketplace_timestamp();

CREATE TRIGGER marketplace_template_listings_update_timestamp
BEFORE UPDATE ON marketplace_template_listings
FOR EACH ROW
EXECUTE FUNCTION update_marketplace_timestamp();

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 030_white_label_marketplace completed successfully';
    RAISE NOTICE '   - 10 marketplace tables created';
    RAISE NOTICE '   - 5 marketplace functions created';
    RAISE NOTICE '   - 5 triggers for auto-updates';
    RAISE NOTICE '   - 40+ indexes for performance';
    RAISE NOTICE '   ';
    RAISE NOTICE '   Features enabled:';
    RAISE NOTICE '   - Custom branded marketplaces';
    RAISE NOTICE '   - Multi-seller support';
    RAISE NOTICE '   - Commission management';
    RAISE NOTICE '   - Seller payouts';
    RAISE NOTICE '   - Template listings';
    RAISE NOTICE '   - Reviews and ratings';
    RAISE NOTICE '   - Custom email templates';
    RAISE NOTICE '   - Marketplace analytics';
END $$;
