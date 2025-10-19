-- =====================================================================================
-- Phase 5 Feature 7: Template Monetization - Revenue Sharing & Payment Processing
-- =====================================================================================
-- This migration creates the infrastructure for:
-- 1. Template Sales - Track template purchases and downloads
-- 2. Creator Earnings - Revenue tracking for template creators
-- 3. Revenue Splits - Configurable revenue sharing
-- 4. Payouts - Creator payment processing
-- 5. Affiliate Links - Referral tracking
-- 6. Commissions - Affiliate commission tracking
-- 7. Sales Analytics - Revenue analytics and reporting
-- =====================================================================================

-- =====================================================================================
-- TABLE 1: template_pricing
-- Pricing configuration for templates
-- =====================================================================================
CREATE TABLE IF NOT EXISTS template_pricing (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
    creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Pricing
    price DECIMAL(10,2) NOT NULL DEFAULT 0.00,
    currency VARCHAR(3) DEFAULT 'USD',
    pricing_model VARCHAR(50) DEFAULT 'one-time', -- one-time, subscription, free

    -- Licensing
    license_type VARCHAR(50) DEFAULT 'standard', -- standard, extended, commercial
    license_terms TEXT,

    -- Revenue Split (percentages)
    platform_commission_percent DECIMAL(5,2) DEFAULT 30.00, -- Platform takes %
    creator_revenue_percent DECIMAL(5,2) DEFAULT 70.00, -- Creator gets %
    affiliate_commission_percent DECIMAL(5,2) DEFAULT 10.00, -- Affiliate gets % of platform commission

    -- Special Pricing
    discount_price DECIMAL(10,2),
    discount_valid_from TIMESTAMPTZ,
    discount_valid_until TIMESTAMPTZ,

    -- Status
    is_for_sale BOOLEAN DEFAULT true,
    is_featured BOOLEAN DEFAULT false,

    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(template_id),
    CONSTRAINT valid_pricing_model CHECK (pricing_model IN ('one-time', 'subscription', 'free')),
    CONSTRAINT valid_license_type CHECK (license_type IN ('standard', 'extended', 'commercial'))
);

CREATE INDEX idx_template_pricing_template ON template_pricing(template_id);
CREATE INDEX idx_template_pricing_creator ON template_pricing(creator_id);
CREATE INDEX idx_template_pricing_for_sale ON template_pricing(is_for_sale) WHERE is_for_sale = true;

-- =====================================================================================
-- TABLE 2: template_purchases
-- Records of template purchases
-- =====================================================================================
CREATE TABLE IF NOT EXISTS template_purchases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES templates(id) ON DELETE RESTRICT,
    buyer_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    creator_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,

    -- Purchase Details
    purchase_type VARCHAR(50) DEFAULT 'sale', -- sale, renewal, upgrade
    license_type VARCHAR(50) NOT NULL,

    -- Pricing
    price_paid DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',

    -- Revenue Split
    platform_revenue DECIMAL(10,2) NOT NULL,
    creator_revenue DECIMAL(10,2) NOT NULL,
    affiliate_commission DECIMAL(10,2) DEFAULT 0.00,

    -- Payment
    payment_id UUID REFERENCES payments(id),
    payment_status VARCHAR(50) DEFAULT 'completed', -- pending, completed, refunded, failed

    -- Affiliate
    affiliate_id UUID REFERENCES users(id),
    affiliate_link_id UUID REFERENCES affiliate_links(id),

    -- Refund
    refunded BOOLEAN DEFAULT false,
    refund_amount DECIMAL(10,2) DEFAULT 0.00,
    refunded_at TIMESTAMPTZ,
    refund_reason TEXT,

    -- Access
    download_count INTEGER DEFAULT 0,
    last_downloaded_at TIMESTAMPTZ,
    access_expires_at TIMESTAMPTZ, -- NULL = lifetime access

    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT valid_purchase_type CHECK (purchase_type IN ('sale', 'renewal', 'upgrade')),
    CONSTRAINT valid_payment_status CHECK (payment_status IN ('pending', 'completed', 'refunded', 'failed'))
);

CREATE INDEX idx_template_purchases_template ON template_purchases(template_id);
CREATE INDEX idx_template_purchases_buyer ON template_purchases(buyer_id);
CREATE INDEX idx_template_purchases_creator ON template_purchases(creator_id);
CREATE INDEX idx_template_purchases_affiliate ON template_purchases(affiliate_id);
CREATE INDEX idx_template_purchases_created_at ON template_purchases(created_at);
CREATE INDEX idx_template_purchases_payment_status ON template_purchases(payment_status);

-- =====================================================================================
-- TABLE 3: creator_earnings
-- Tracks creator earnings and balance
-- =====================================================================================
CREATE TABLE IF NOT EXISTS creator_earnings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Earnings
    total_earned DECIMAL(10,2) DEFAULT 0.00,
    available_balance DECIMAL(10,2) DEFAULT 0.00,
    pending_balance DECIMAL(10,2) DEFAULT 0.00, -- Not yet cleared
    withdrawn_total DECIMAL(10,2) DEFAULT 0.00,

    -- Currency
    currency VARCHAR(3) DEFAULT 'USD',

    -- Stats
    total_sales INTEGER DEFAULT 0,
    total_refunds INTEGER DEFAULT 0,
    total_templates_sold INTEGER DEFAULT 0, -- Unique templates

    -- Payout Info
    minimum_payout DECIMAL(10,2) DEFAULT 50.00,
    payout_method VARCHAR(50), -- stripe, paypal, bank_transfer
    payout_details JSONB, -- Encrypted payout information

    -- Status
    is_verified BOOLEAN DEFAULT false,
    verified_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(creator_id)
);

CREATE INDEX idx_creator_earnings_creator ON creator_earnings(creator_id);
CREATE INDEX idx_creator_earnings_balance ON creator_earnings(available_balance);

-- =====================================================================================
-- TABLE 4: creator_payouts
-- Payout requests and history
-- =====================================================================================
CREATE TABLE IF NOT EXISTS creator_payouts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,

    -- Payout Details
    amount DECIMAL(10,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    payout_method VARCHAR(50) NOT NULL,

    -- Status
    status VARCHAR(50) DEFAULT 'pending', -- pending, processing, completed, failed, canceled

    -- Processing
    processed_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    failure_reason TEXT,

    -- External Reference
    stripe_payout_id VARCHAR(255),
    paypal_payout_id VARCHAR(255),
    transaction_id VARCHAR(255),

    -- Metadata
    notes TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT valid_status CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'canceled'))
);

CREATE INDEX idx_creator_payouts_creator ON creator_payouts(creator_id);
CREATE INDEX idx_creator_payouts_status ON creator_payouts(status);
CREATE INDEX idx_creator_payouts_created_at ON creator_payouts(created_at);

-- =====================================================================================
-- TABLE 5: affiliate_links
-- Unique affiliate tracking links
-- =====================================================================================
CREATE TABLE IF NOT EXISTS affiliate_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    affiliate_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Link Details
    link_code VARCHAR(50) UNIQUE NOT NULL, -- Unique code for URL
    link_url TEXT NOT NULL, -- Full tracking URL
    target_type VARCHAR(50) DEFAULT 'general', -- general, template, marketplace
    target_id UUID, -- Template ID or marketplace ID

    -- Tracking
    clicks INTEGER DEFAULT 0,
    conversions INTEGER DEFAULT 0,
    conversion_rate DECIMAL(5,2) DEFAULT 0.00,

    -- Earnings
    total_commission DECIMAL(10,2) DEFAULT 0.00,
    currency VARCHAR(3) DEFAULT 'USD',

    -- Status
    is_active BOOLEAN DEFAULT true,

    -- Cookie Settings
    cookie_duration_days INTEGER DEFAULT 30,

    -- Metadata
    campaign_name VARCHAR(200),
    metadata JSONB DEFAULT '{}'::jsonb,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_clicked_at TIMESTAMPTZ,

    CONSTRAINT valid_target_type CHECK (target_type IN ('general', 'template', 'marketplace'))
);

CREATE INDEX idx_affiliate_links_affiliate ON affiliate_links(affiliate_id);
CREATE INDEX idx_affiliate_links_code ON affiliate_links(link_code);
CREATE INDEX idx_affiliate_links_target ON affiliate_links(target_type, target_id);

-- =====================================================================================
-- TABLE 6: affiliate_clicks
-- Tracks clicks on affiliate links
-- =====================================================================================
CREATE TABLE IF NOT EXISTS affiliate_clicks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    affiliate_link_id UUID NOT NULL REFERENCES affiliate_links(id) ON DELETE CASCADE,
    affiliate_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Click Details
    ip_address VARCHAR(45),
    user_agent TEXT,
    referer TEXT,

    -- Location
    country VARCHAR(2),
    city VARCHAR(100),

    -- Conversion
    converted BOOLEAN DEFAULT false,
    purchase_id UUID REFERENCES template_purchases(id),
    converted_at TIMESTAMPTZ,

    -- Cookie
    cookie_id VARCHAR(255),
    expires_at TIMESTAMPTZ,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_affiliate_clicks_link ON affiliate_clicks(affiliate_link_id);
CREATE INDEX idx_affiliate_clicks_affiliate ON affiliate_clicks(affiliate_id);
CREATE INDEX idx_affiliate_clicks_cookie ON affiliate_clicks(cookie_id);
CREATE INDEX idx_affiliate_clicks_created_at ON affiliate_clicks(created_at);
CREATE INDEX idx_affiliate_clicks_converted ON affiliate_clicks(converted) WHERE converted = true;

-- =====================================================================================
-- TABLE 7: affiliate_commissions
-- Commission records for affiliates
-- =====================================================================================
CREATE TABLE IF NOT EXISTS affiliate_commissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    affiliate_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    purchase_id UUID NOT NULL REFERENCES template_purchases(id) ON DELETE RESTRICT,
    affiliate_link_id UUID REFERENCES affiliate_links(id),

    -- Commission Details
    commission_amount DECIMAL(10,2) NOT NULL,
    commission_percent DECIMAL(5,2) NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',

    -- Status
    status VARCHAR(50) DEFAULT 'pending', -- pending, approved, paid, reversed

    -- Payment
    payout_id UUID REFERENCES creator_payouts(id),
    paid_at TIMESTAMPTZ,

    -- Reversal
    reversed BOOLEAN DEFAULT false,
    reversed_at TIMESTAMPTZ,
    reversal_reason TEXT,

    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT valid_status CHECK (status IN ('pending', 'approved', 'paid', 'reversed'))
);

CREATE INDEX idx_affiliate_commissions_affiliate ON affiliate_commissions(affiliate_id);
CREATE INDEX idx_affiliate_commissions_purchase ON affiliate_commissions(purchase_id);
CREATE INDEX idx_affiliate_commissions_status ON affiliate_commissions(status);
CREATE INDEX idx_affiliate_commissions_created_at ON affiliate_commissions(created_at);

-- =====================================================================================
-- TABLE 8: revenue_analytics
-- Aggregated revenue analytics (daily snapshots)
-- =====================================================================================
CREATE TABLE IF NOT EXISTS revenue_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Period
    date DATE NOT NULL,
    period_type VARCHAR(20) DEFAULT 'daily', -- daily, weekly, monthly

    -- Overall Metrics
    total_revenue DECIMAL(10,2) DEFAULT 0.00,
    platform_revenue DECIMAL(10,2) DEFAULT 0.00,
    creator_revenue DECIMAL(10,2) DEFAULT 0.00,
    affiliate_revenue DECIMAL(10,2) DEFAULT 0.00,

    -- Sales Metrics
    total_sales INTEGER DEFAULT 0,
    total_refunds INTEGER DEFAULT 0,
    unique_buyers INTEGER DEFAULT 0,
    unique_templates_sold INTEGER DEFAULT 0,

    -- Average Values
    average_sale_price DECIMAL(10,2) DEFAULT 0.00,
    average_creator_earning DECIMAL(10,2) DEFAULT 0.00,

    -- Top Performers
    top_template_id UUID REFERENCES templates(id),
    top_creator_id UUID REFERENCES users(id),
    top_affiliate_id UUID REFERENCES users(id),

    -- Currency
    currency VARCHAR(3) DEFAULT 'USD',

    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(date, period_type),
    CONSTRAINT valid_period_type CHECK (period_type IN ('daily', 'weekly', 'monthly'))
);

CREATE INDEX idx_revenue_analytics_date ON revenue_analytics(date);
CREATE INDEX idx_revenue_analytics_period ON revenue_analytics(period_type, date);

-- =====================================================================================
-- FUNCTIONS
-- =====================================================================================

-- =====================================================================================
-- FUNCTION: process_template_purchase
-- Processes a template purchase and distributes revenue
-- =====================================================================================
CREATE OR REPLACE FUNCTION process_template_purchase(
    p_template_id UUID,
    p_buyer_id UUID,
    p_affiliate_link_id UUID DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_purchase_id UUID;
    v_pricing RECORD;
    v_creator_id UUID;
    v_affiliate_id UUID;
    v_platform_rev DECIMAL;
    v_creator_rev DECIMAL;
    v_affiliate_comm DECIMAL;
BEGIN
    -- Get template pricing and creator
    SELECT tp.*, t.user_id
    INTO v_pricing
    FROM template_pricing tp
    JOIN templates t ON t.id = tp.template_id
    WHERE tp.template_id = p_template_id;

    IF v_pricing IS NULL THEN
        RAISE EXCEPTION 'Template pricing not found';
    END IF;

    v_creator_id := v_pricing.user_id;

    -- Calculate revenue splits
    v_platform_rev := v_pricing.price * (v_pricing.platform_commission_percent / 100);
    v_creator_rev := v_pricing.price * (v_pricing.creator_revenue_percent / 100);
    v_affiliate_comm := 0;

    -- Get affiliate if present
    IF p_affiliate_link_id IS NOT NULL THEN
        SELECT affiliate_id INTO v_affiliate_id
        FROM affiliate_links
        WHERE id = p_affiliate_link_id;

        IF v_affiliate_id IS NOT NULL THEN
            v_affiliate_comm := v_platform_rev * (v_pricing.affiliate_commission_percent / 100);
            v_platform_rev := v_platform_rev - v_affiliate_comm;
        END IF;
    END IF;

    -- Create purchase record
    INSERT INTO template_purchases (
        template_id, buyer_id, creator_id,
        license_type, price_paid, currency,
        platform_revenue, creator_revenue, affiliate_commission,
        affiliate_id, affiliate_link_id
    ) VALUES (
        p_template_id, p_buyer_id, v_creator_id,
        v_pricing.license_type, v_pricing.price, v_pricing.currency,
        v_platform_rev, v_creator_rev, v_affiliate_comm,
        v_affiliate_id, p_affiliate_link_id
    ) RETURNING id INTO v_purchase_id;

    -- Update creator earnings
    INSERT INTO creator_earnings (creator_id, total_earned, available_balance, total_sales, currency)
    VALUES (v_creator_id, v_creator_rev, v_creator_rev, 1, v_pricing.currency)
    ON CONFLICT (creator_id)
    DO UPDATE SET
        total_earned = creator_earnings.total_earned + v_creator_rev,
        available_balance = creator_earnings.available_balance + v_creator_rev,
        total_sales = creator_earnings.total_sales + 1,
        updated_at = NOW();

    -- Create affiliate commission if applicable
    IF v_affiliate_id IS NOT NULL AND v_affiliate_comm > 0 THEN
        INSERT INTO affiliate_commissions (
            affiliate_id, purchase_id, affiliate_link_id,
            commission_amount, commission_percent, currency
        ) VALUES (
            v_affiliate_id, v_purchase_id, p_affiliate_link_id,
            v_affiliate_comm, v_pricing.affiliate_commission_percent, v_pricing.currency
        );

        -- Update affiliate link stats
        UPDATE affiliate_links
        SET conversions = conversions + 1,
            total_commission = total_commission + v_affiliate_comm,
            conversion_rate = (conversions + 1)::DECIMAL / NULLIF(clicks, 0) * 100,
            updated_at = NOW()
        WHERE id = p_affiliate_link_id;
    END IF;

    RETURN v_purchase_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================================
-- FUNCTION: track_affiliate_click
-- Records an affiliate link click
-- =====================================================================================
CREATE OR REPLACE FUNCTION track_affiliate_click(
    p_link_code VARCHAR,
    p_ip_address VARCHAR,
    p_user_agent TEXT,
    p_referer TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    v_click_id UUID;
    v_link RECORD;
    v_cookie_id VARCHAR;
    v_expires_at TIMESTAMPTZ;
BEGIN
    -- Get affiliate link
    SELECT * INTO v_link
    FROM affiliate_links
    WHERE link_code = p_link_code AND is_active = true;

    IF v_link IS NULL THEN
        RAISE EXCEPTION 'Affiliate link not found or inactive';
    END IF;

    -- Generate cookie ID
    v_cookie_id := 'aff_' || md5(random()::text || clock_timestamp()::text);
    v_expires_at := NOW() + (v_link.cookie_duration_days || ' days')::INTERVAL;

    -- Record click
    INSERT INTO affiliate_clicks (
        affiliate_link_id, affiliate_id,
        ip_address, user_agent, referer,
        cookie_id, expires_at
    ) VALUES (
        v_link.id, v_link.affiliate_id,
        p_ip_address, p_user_agent, p_referer,
        v_cookie_id, v_expires_at
    ) RETURNING id INTO v_click_id;

    -- Update link stats
    UPDATE affiliate_links
    SET clicks = clicks + 1,
        last_clicked_at = NOW(),
        updated_at = NOW()
    WHERE id = v_link.id;

    RETURN v_click_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================================
-- FUNCTION: get_creator_stats
-- Gets comprehensive creator statistics
-- =====================================================================================
CREATE OR REPLACE FUNCTION get_creator_stats(p_creator_id UUID)
RETURNS TABLE(
    total_earned DECIMAL,
    available_balance DECIMAL,
    total_sales INTEGER,
    total_templates_sold INTEGER,
    average_sale_price DECIMAL,
    best_selling_template_id UUID,
    total_revenue_this_month DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ce.total_earned,
        ce.available_balance,
        ce.total_sales,
        ce.total_templates_sold,
        COALESCE(AVG(tp.price_paid), 0) as avg_sale_price,
        (
            SELECT template_id
            FROM template_purchases
            WHERE creator_id = p_creator_id
            GROUP BY template_id
            ORDER BY COUNT(*) DESC
            LIMIT 1
        ) as best_selling,
        (
            SELECT COALESCE(SUM(creator_revenue), 0)
            FROM template_purchases
            WHERE creator_id = p_creator_id
            AND created_at >= date_trunc('month', NOW())
        ) as month_revenue
    FROM creator_earnings ce
    LEFT JOIN template_purchases tp ON tp.creator_id = ce.creator_id
    WHERE ce.creator_id = p_creator_id
    GROUP BY ce.creator_id, ce.total_earned, ce.available_balance,
             ce.total_sales, ce.total_templates_sold;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================================
-- FUNCTION: request_payout
-- Creates a payout request for a creator
-- =====================================================================================
CREATE OR REPLACE FUNCTION request_payout(
    p_creator_id UUID,
    p_amount DECIMAL,
    p_payout_method VARCHAR
)
RETURNS UUID AS $$
DECLARE
    v_payout_id UUID;
    v_earnings RECORD;
BEGIN
    -- Check available balance
    SELECT * INTO v_earnings
    FROM creator_earnings
    WHERE creator_id = p_creator_id;

    IF v_earnings IS NULL THEN
        RAISE EXCEPTION 'Creator earnings not found';
    END IF;

    IF v_earnings.available_balance < p_amount THEN
        RAISE EXCEPTION 'Insufficient balance';
    END IF;

    IF p_amount < v_earnings.minimum_payout THEN
        RAISE EXCEPTION 'Amount below minimum payout threshold';
    END IF;

    -- Create payout request
    INSERT INTO creator_payouts (
        creator_id, amount, currency, payout_method
    ) VALUES (
        p_creator_id, p_amount, v_earnings.currency, p_payout_method
    ) RETURNING id INTO v_payout_id;

    -- Update creator earnings
    UPDATE creator_earnings
    SET available_balance = available_balance - p_amount,
        pending_balance = pending_balance + p_amount,
        updated_at = NOW()
    WHERE creator_id = p_creator_id;

    RETURN v_payout_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================================
-- TRIGGERS
-- =====================================================================================

CREATE OR REPLACE FUNCTION update_monetization_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply timestamp triggers
CREATE TRIGGER template_pricing_update_timestamp
    BEFORE UPDATE ON template_pricing
    FOR EACH ROW
    EXECUTE FUNCTION update_monetization_timestamp();

CREATE TRIGGER template_purchases_update_timestamp
    BEFORE UPDATE ON template_purchases
    FOR EACH ROW
    EXECUTE FUNCTION update_monetization_timestamp();

CREATE TRIGGER creator_earnings_update_timestamp
    BEFORE UPDATE ON creator_earnings
    FOR EACH ROW
    EXECUTE FUNCTION update_monetization_timestamp();

CREATE TRIGGER creator_payouts_update_timestamp
    BEFORE UPDATE ON creator_payouts
    FOR EACH ROW
    EXECUTE FUNCTION update_monetization_timestamp();

CREATE TRIGGER affiliate_links_update_timestamp
    BEFORE UPDATE ON affiliate_links
    FOR EACH ROW
    EXECUTE FUNCTION update_monetization_timestamp();

-- =====================================================================================
-- COMMENTS
-- =====================================================================================

COMMENT ON TABLE template_pricing IS 'Pricing and licensing for templates';
COMMENT ON TABLE template_purchases IS 'Template purchase records';
COMMENT ON TABLE creator_earnings IS 'Creator earnings and balances';
COMMENT ON TABLE creator_payouts IS 'Creator payout requests and history';
COMMENT ON TABLE affiliate_links IS 'Affiliate tracking links';
COMMENT ON TABLE affiliate_clicks IS 'Affiliate link click tracking';
COMMENT ON TABLE affiliate_commissions IS 'Affiliate commission records';
COMMENT ON TABLE revenue_analytics IS 'Aggregated revenue analytics';

-- =====================================================================================
-- END OF MIGRATION
-- =====================================================================================
