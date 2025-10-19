-- Migration: GeoIP Service
-- Description: Add tables for GeoIP caching, country blocking, and geographic threat analysis
-- Created: 2025-01-XX

-- GeoIP Cache Table
-- Stores cached GeoIP lookups to reduce API calls
CREATE TABLE IF NOT EXISTS geoip_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ip_address VARCHAR(45) NOT NULL UNIQUE, -- IPv4 and IPv6
    country VARCHAR(100),
    country_code VARCHAR(2),
    region VARCHAR(100),
    city VARCHAR(100),
    postal_code VARCHAR(20),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),
    timezone VARCHAR(50),

    -- Network information
    asn VARCHAR(50),
    organization VARCHAR(255),
    isp VARCHAR(255),

    -- Threat indicators
    is_vpn BOOLEAN DEFAULT FALSE,
    is_proxy BOOLEAN DEFAULT FALSE,
    is_tor BOOLEAN DEFAULT FALSE,
    is_hosting BOOLEAN DEFAULT FALSE,
    is_datacenter BOOLEAN DEFAULT FALSE,

    -- Risk assessment
    risk_score INTEGER DEFAULT 0, -- 0-100
    threat_level VARCHAR(20), -- 'low', 'medium', 'high', 'critical'

    -- Metadata
    lookup_source VARCHAR(50), -- 'maxmind', 'ip-api', 'ipinfo'
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for GeoIP cache
CREATE INDEX IF NOT EXISTS idx_geoip_cache_ip ON geoip_cache(ip_address);
CREATE INDEX IF NOT EXISTS idx_geoip_cache_country_code ON geoip_cache(country_code);
CREATE INDEX IF NOT EXISTS idx_geoip_cache_asn ON geoip_cache(asn);
CREATE INDEX IF NOT EXISTS idx_geoip_cache_vpn ON geoip_cache(is_vpn) WHERE is_vpn = TRUE;
CREATE INDEX IF NOT EXISTS idx_geoip_cache_proxy ON geoip_cache(is_proxy) WHERE is_proxy = TRUE;
CREATE INDEX IF NOT EXISTS idx_geoip_cache_tor ON geoip_cache(is_tor) WHERE is_tor = TRUE;
CREATE INDEX IF NOT EXISTS idx_geoip_cache_expires ON geoip_cache(expires_at);

-- Blocked Countries Table
-- Allows blocking entire countries for security
CREATE TABLE IF NOT EXISTS blocked_countries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    country_code VARCHAR(2) NOT NULL UNIQUE,
    country_name VARCHAR(100) NOT NULL,

    -- Blocking configuration
    block_type VARCHAR(20) DEFAULT 'full', -- 'full', 'api_only', 'login_only'
    is_active BOOLEAN DEFAULT TRUE,

    -- Reason and metadata
    reason TEXT,
    blocked_by UUID REFERENCES users(id),
    threat_count INTEGER DEFAULT 0,
    last_threat_at TIMESTAMP,

    -- Audit
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for blocked countries
CREATE INDEX IF NOT EXISTS idx_blocked_countries_code ON blocked_countries(country_code);
CREATE INDEX IF NOT EXISTS idx_blocked_countries_active ON blocked_countries(is_active) WHERE is_active = TRUE;

-- User Location History Table
-- Tracks user location changes for suspicious activity detection
CREATE TABLE IF NOT EXISTS user_location_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ip_address VARCHAR(45) NOT NULL,

    -- Location data (denormalized for historical accuracy)
    country VARCHAR(100),
    country_code VARCHAR(2),
    city VARCHAR(100),
    latitude DECIMAL(10, 8),
    longitude DECIMAL(11, 8),

    -- Connection metadata
    user_agent TEXT,
    device_fingerprint VARCHAR(255),

    -- Flags
    is_suspicious BOOLEAN DEFAULT FALSE,
    suspicion_reason TEXT,
    distance_from_previous DECIMAL(10, 2), -- km
    time_from_previous INTEGER, -- seconds

    -- Timestamp
    detected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for user location history
CREATE INDEX IF NOT EXISTS idx_user_location_user_id ON user_location_history(user_id);
CREATE INDEX IF NOT EXISTS idx_user_location_ip ON user_location_history(ip_address);
CREATE INDEX IF NOT EXISTS idx_user_location_suspicious ON user_location_history(is_suspicious) WHERE is_suspicious = TRUE;
CREATE INDEX IF NOT EXISTS idx_user_location_detected ON user_location_history(detected_at DESC);

-- ASN Statistics Table
-- Aggregates threat statistics by Autonomous System Number
CREATE TABLE IF NOT EXISTS asn_statistics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asn VARCHAR(50) NOT NULL UNIQUE,
    organization VARCHAR(255),

    -- Threat metrics
    total_threats INTEGER DEFAULT 0,
    critical_threats INTEGER DEFAULT 0,
    high_threats INTEGER DEFAULT 0,
    unique_threat_ips INTEGER DEFAULT 0,
    blocked_ips INTEGER DEFAULT 0,

    -- Geographic distribution
    countries TEXT[], -- Array of country codes

    -- Flags
    is_hosting BOOLEAN DEFAULT FALSE,
    is_vpn_provider BOOLEAN DEFAULT FALSE,
    is_tor_related BOOLEAN DEFAULT FALSE,
    is_blocked BOOLEAN DEFAULT FALSE,

    -- Metadata
    first_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_threat_at TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for ASN statistics
CREATE INDEX IF NOT EXISTS idx_asn_statistics_asn ON asn_statistics(asn);
CREATE INDEX IF NOT EXISTS idx_asn_statistics_organization ON asn_statistics(organization);
CREATE INDEX IF NOT EXISTS idx_asn_statistics_blocked ON asn_statistics(is_blocked) WHERE is_blocked = TRUE;
CREATE INDEX IF NOT EXISTS idx_asn_statistics_hosting ON asn_statistics(is_hosting) WHERE is_hosting = TRUE;

-- Geographic Threat Analytics Table
-- Pre-aggregated statistics for dashboard performance
CREATE TABLE IF NOT EXISTS geographic_threat_analytics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    country_code VARCHAR(2) NOT NULL,
    country_name VARCHAR(100) NOT NULL,

    -- Time period
    period_start TIMESTAMP NOT NULL,
    period_end TIMESTAMP NOT NULL,
    period_type VARCHAR(20) DEFAULT 'daily', -- 'hourly', 'daily', 'weekly', 'monthly'

    -- Threat metrics
    total_threats INTEGER DEFAULT 0,
    critical_threats INTEGER DEFAULT 0,
    high_threats INTEGER DEFAULT 0,
    medium_threats INTEGER DEFAULT 0,
    low_threats INTEGER DEFAULT 0,
    unique_ips INTEGER DEFAULT 0,
    blocked_ips INTEGER DEFAULT 0,

    -- VPN/Proxy metrics
    vpn_threats INTEGER DEFAULT 0,
    proxy_threats INTEGER DEFAULT 0,
    tor_threats INTEGER DEFAULT 0,

    -- Average risk score
    avg_risk_score DECIMAL(5, 2) DEFAULT 0,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(country_code, period_start, period_type)
);

-- Indexes for geographic threat analytics
CREATE INDEX IF NOT EXISTS idx_geo_analytics_country ON geographic_threat_analytics(country_code);
CREATE INDEX IF NOT EXISTS idx_geo_analytics_period ON geographic_threat_analytics(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_geo_analytics_type ON geographic_threat_analytics(period_type);

-- Add updated_at trigger for all tables
CREATE OR REPLACE FUNCTION update_geoip_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER geoip_cache_updated_at
    BEFORE UPDATE ON geoip_cache
    FOR EACH ROW
    EXECUTE FUNCTION update_geoip_updated_at();

CREATE TRIGGER blocked_countries_updated_at
    BEFORE UPDATE ON blocked_countries
    FOR EACH ROW
    EXECUTE FUNCTION update_geoip_updated_at();

CREATE TRIGGER asn_statistics_updated_at
    BEFORE UPDATE ON asn_statistics
    FOR EACH ROW
    EXECUTE FUNCTION update_geoip_updated_at();

CREATE TRIGGER geo_analytics_updated_at
    BEFORE UPDATE ON geographic_threat_analytics
    FOR EACH ROW
    EXECUTE FUNCTION update_geoip_updated_at();

-- Add comment to tables
COMMENT ON TABLE geoip_cache IS 'Caches GeoIP lookup results to reduce API calls and improve performance';
COMMENT ON TABLE blocked_countries IS 'Manages country-level blocking rules for security';
COMMENT ON TABLE user_location_history IS 'Tracks user location changes for impossible travel detection';
COMMENT ON TABLE asn_statistics IS 'Aggregates threat statistics by Autonomous System Number';
COMMENT ON TABLE geographic_threat_analytics IS 'Pre-aggregated geographic threat metrics for dashboard performance';
