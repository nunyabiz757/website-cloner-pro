-- Migration Rollback: GeoIP Service
-- Description: Remove GeoIP service tables and functions

-- Drop triggers
DROP TRIGGER IF EXISTS geoip_cache_updated_at ON geoip_cache;
DROP TRIGGER IF EXISTS blocked_countries_updated_at ON blocked_countries;
DROP TRIGGER IF EXISTS asn_statistics_updated_at ON asn_statistics;
DROP TRIGGER IF EXISTS geo_analytics_updated_at ON geographic_threat_analytics;

-- Drop function
DROP FUNCTION IF EXISTS update_geoip_updated_at();

-- Drop tables (in reverse dependency order)
DROP TABLE IF EXISTS geographic_threat_analytics;
DROP TABLE IF EXISTS asn_statistics;
DROP TABLE IF EXISTS user_location_history;
DROP TABLE IF EXISTS blocked_countries;
DROP TABLE IF EXISTS geoip_cache;
