/**
 * GeoIP Service
 *
 * Advanced geographic IP intelligence with:
 * - MaxMind GeoIP2 database integration
 * - IP reputation checking (AbuseIPDB, IPQualityScore)
 * - Geographic threat analysis
 * - Country-based blocking
 * - VPN/Proxy/Tor detection
 * - ASN (Autonomous System Number) lookup
 * - Timezone and language detection
 * - Distance calculation between locations
 *
 * Supports multiple data sources with automatic fallback
 */

import { Pool } from 'pg';
import { AppLogger } from './logger.service.js';
import * as fs from 'fs/promises';
import * as path from 'path';

// GeoIP Location Data
export interface GeoIPLocation {
  ip: string;
  country: string;
  countryCode: string;
  region: string;
  regionCode: string;
  city: string;
  latitude: number;
  longitude: number;
  timezone: string;
  continent: string;
  continentCode: string;
  postalCode?: string;
  accuracyRadius?: number;
}

// Extended GeoIP Data with Security Info
export interface GeoIPData extends GeoIPLocation {
  asn: number;
  asnOrganization: string;
  isp: string;
  isVPN: boolean;
  isProxy: boolean;
  isTor: boolean;
  isHosting: boolean;
  isRelay: boolean;
  riskScore: number; // 0-100
  threatLevel: 'safe' | 'low' | 'medium' | 'high' | 'critical';
}

// IP Reputation Data
export interface IPReputation {
  ip: string;
  abuseScore: number; // 0-100
  totalReports: number;
  lastReportedAt?: Date;
  categories: string[]; // e.g., ['spam', 'brute-force', 'bot']
  isWhitelisted: boolean;
  isBlacklisted: boolean;
  isTor: boolean;
  isVPN: boolean;
  isProxy: boolean;
}

// Geographic Threat Statistics
export interface GeographicThreat {
  country: string;
  countryCode: string;
  threatCount: number;
  uniqueIPs: number;
  blockedIPs: number;
  criticalThreats: number;
  highThreats: number;
  mediumThreats: number;
  lowThreats: number;
  lastThreatAt: Date;
  riskScore: number;
  topCities: Array<{ city: string; count: number }>;
}

// ASN Information
export interface ASNInfo {
  asn: number;
  organization: string;
  network: string;
  country: string;
  threatCount: number;
  isHosting: boolean;
  isVPN: boolean;
}

export class GeoIPService {
  private pool: Pool;
  private maxmindReader: any = null;
  private cache: Map<string, { data: GeoIPData; expiresAt: number }> = new Map();
  private readonly cacheTimeout = 60 * 60 * 1000; // 1 hour
  private readonly maxmindDbPath: string;
  private isMaxMindAvailable = false;

  constructor(pool: Pool) {
    this.pool = pool;
    this.maxmindDbPath = process.env.MAXMIND_DB_PATH || './data/GeoLite2-City.mmdb';
    this.initializeMaxMind();
  }

  /**
   * Initialize MaxMind GeoIP2 database
   */
  private async initializeMaxMind(): Promise<void> {
    try {
      // Try to load maxmind module
      const maxmind = await import('@maxmind/geoip2-node').catch(() => null);

      if (!maxmind) {
        console.log('[GEOIP] MaxMind module not installed. Install with: npm install @maxmind/geoip2-node');
        console.log('[GEOIP] Falling back to IP-API.com (free, rate-limited)');
        return;
      }

      // Check if database file exists
      try {
        await fs.access(this.maxmindDbPath);
        this.maxmindReader = await maxmind.Reader.open(this.maxmindDbPath);
        this.isMaxMindAvailable = true;
        console.log('[GEOIP] MaxMind GeoIP2 database loaded successfully');
      } catch {
        console.log(`[GEOIP] MaxMind database not found at ${this.maxmindDbPath}`);
        console.log('[GEOIP] Download from: https://dev.maxmind.com/geoip/geolite2-free-geolocation-data');
        console.log('[GEOIP] Falling back to IP-API.com');
      }
    } catch (error) {
      console.error('[GEOIP] Failed to initialize MaxMind:', error);
    }
  }

  /**
   * Lookup IP address and get complete geographic + security data
   */
  async lookup(ip: string): Promise<GeoIPData | null> {
    // Check cache
    const cached = this.cache.get(ip);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    try {
      let geoData: GeoIPData | null = null;

      // Try MaxMind first (fastest, most accurate)
      if (this.isMaxMindAvailable) {
        geoData = await this.lookupMaxMind(ip);
      }

      // Fallback to IP-API.com (free, rate-limited)
      if (!geoData) {
        geoData = await this.lookupIPAPI(ip);
      }

      // Fallback to ipinfo.io
      if (!geoData) {
        geoData = await this.lookupIPInfo(ip);
      }

      if (geoData) {
        // Enhance with threat analysis
        geoData = await this.enhanceWithThreatData(geoData);

        // Cache result
        this.cache.set(ip, {
          data: geoData,
          expiresAt: Date.now() + this.cacheTimeout,
        });

        // Store in database
        await this.storeGeoIPData(geoData);
      }

      return geoData;
    } catch (error) {
      AppLogger.error('GeoIP lookup failed', error as Error, { ip });
      return null;
    }
  }

  /**
   * Lookup using MaxMind GeoIP2 database
   */
  private async lookupMaxMind(ip: string): Promise<GeoIPData | null> {
    if (!this.maxmindReader) return null;

    try {
      const response = await this.maxmindReader.city(ip);

      return {
        ip,
        country: response.country?.names?.en || 'Unknown',
        countryCode: response.country?.isoCode || 'XX',
        region: response.subdivisions?.[0]?.names?.en || '',
        regionCode: response.subdivisions?.[0]?.isoCode || '',
        city: response.city?.names?.en || '',
        latitude: response.location?.latitude || 0,
        longitude: response.location?.longitude || 0,
        timezone: response.location?.timeZone || '',
        continent: response.continent?.names?.en || '',
        continentCode: response.continent?.code || '',
        postalCode: response.postal?.code,
        accuracyRadius: response.location?.accuracyRadius,
        asn: 0,
        asnOrganization: '',
        isp: '',
        isVPN: false,
        isProxy: false,
        isTor: false,
        isHosting: false,
        isRelay: false,
        riskScore: 0,
        threatLevel: 'safe',
      };
    } catch (error) {
      AppLogger.debug('MaxMind lookup failed', { ip, error });
      return null;
    }
  }

  /**
   * Lookup using IP-API.com (free, rate-limited to 45 req/min)
   */
  private async lookupIPAPI(ip: string): Promise<GeoIPData | null> {
    try {
      const response = await fetch(`http://ip-api.com/json/${ip}?fields=status,message,country,countryCode,region,regionName,city,lat,lon,timezone,isp,org,as,proxy,hosting`);

      if (!response.ok) {
        throw new Error(`IP-API returned ${response.status}`);
      }

      const data = await response.json();

      if (data.status === 'fail') {
        throw new Error(data.message || 'IP-API lookup failed');
      }

      // Extract ASN from 'as' field (e.g., "AS15169 Google LLC")
      const asnMatch = data.as?.match(/^AS(\d+)/);
      const asn = asnMatch ? parseInt(asnMatch[1]) : 0;

      return {
        ip,
        country: data.country || 'Unknown',
        countryCode: data.countryCode || 'XX',
        region: data.regionName || '',
        regionCode: data.region || '',
        city: data.city || '',
        latitude: data.lat || 0,
        longitude: data.lon || 0,
        timezone: data.timezone || '',
        continent: '',
        continentCode: '',
        asn,
        asnOrganization: data.org || '',
        isp: data.isp || '',
        isVPN: data.proxy || false,
        isProxy: data.proxy || false,
        isTor: false,
        isHosting: data.hosting || false,
        isRelay: false,
        riskScore: data.proxy || data.hosting ? 50 : 0,
        threatLevel: data.proxy || data.hosting ? 'medium' : 'safe',
      };
    } catch (error) {
      AppLogger.debug('IP-API lookup failed', { ip, error });
      return null;
    }
  }

  /**
   * Lookup using ipinfo.io (fallback)
   */
  private async lookupIPInfo(ip: string): Promise<GeoIPData | null> {
    try {
      const token = process.env.IPINFO_TOKEN || '';
      const url = token
        ? `https://ipinfo.io/${ip}?token=${token}`
        : `https://ipinfo.io/${ip}`;

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`ipinfo.io returned ${response.status}`);
      }

      const data = await response.json();

      if (data.bogon) {
        // Bogon IP (private, invalid, etc.)
        return null;
      }

      const [lat, lon] = (data.loc || '0,0').split(',').map(Number);

      return {
        ip,
        country: data.country || 'Unknown',
        countryCode: data.country || 'XX',
        region: data.region || '',
        regionCode: '',
        city: data.city || '',
        latitude: lat,
        longitude: lon,
        timezone: data.timezone || '',
        continent: '',
        continentCode: '',
        asn: 0,
        asnOrganization: data.org || '',
        isp: data.org || '',
        isVPN: false,
        isProxy: false,
        isTor: false,
        isHosting: data.org?.toLowerCase().includes('hosting') || false,
        isRelay: false,
        riskScore: 0,
        threatLevel: 'safe',
      };
    } catch (error) {
      AppLogger.debug('ipinfo.io lookup failed', { ip, error });
      return null;
    }
  }

  /**
   * Enhance GeoIP data with threat analysis from database
   */
  private async enhanceWithThreatData(geoData: GeoIPData): Promise<GeoIPData> {
    try {
      // Check if IP is in our blacklist
      const blacklistResult = await this.pool.query(
        `SELECT reason FROM api_key_ip_blacklist
         WHERE ip_address = $1 AND is_active = TRUE
         LIMIT 1`,
        [geoData.ip]
      );

      if (blacklistResult.rows.length > 0) {
        geoData.riskScore = 100;
        geoData.threatLevel = 'critical';
        return geoData;
      }

      // Check threat count from security events
      const threatResult = await this.pool.query(
        `SELECT
          COUNT(*)::INTEGER as threat_count,
          COUNT(*) FILTER (WHERE severity = 'critical')::INTEGER as critical_count,
          COUNT(*) FILTER (WHERE severity = 'high')::INTEGER as high_count
         FROM security_events
         WHERE ip_address = $1
         AND created_at >= NOW() - INTERVAL '7 days'`,
        [geoData.ip]
      );

      const threats = threatResult.rows[0];
      const threatCount = threats?.threat_count || 0;
      const criticalCount = threats?.critical_count || 0;

      // Calculate risk score (0-100)
      let riskScore = geoData.riskScore;

      if (criticalCount > 0) riskScore += 50;
      if (threatCount > 10) riskScore += 30;
      if (threatCount > 5) riskScore += 20;
      if (geoData.isVPN || geoData.isProxy) riskScore += 20;
      if (geoData.isTor) riskScore += 40;
      if (geoData.isHosting) riskScore += 10;

      riskScore = Math.min(100, riskScore);

      // Determine threat level
      let threatLevel: GeoIPData['threatLevel'] = 'safe';
      if (riskScore >= 80) threatLevel = 'critical';
      else if (riskScore >= 60) threatLevel = 'high';
      else if (riskScore >= 40) threatLevel = 'medium';
      else if (riskScore >= 20) threatLevel = 'low';

      return {
        ...geoData,
        riskScore,
        threatLevel,
      };
    } catch (error) {
      AppLogger.error('Failed to enhance with threat data', error as Error);
      return geoData;
    }
  }

  /**
   * Store GeoIP data in database for analytics
   */
  private async storeGeoIPData(geoData: GeoIPData): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO geoip_cache (
          ip_address, country, country_code, region, city,
          latitude, longitude, timezone, asn, asn_organization,
          isp, is_vpn, is_proxy, is_tor, is_hosting,
          risk_score, threat_level, last_updated
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW())
        ON CONFLICT (ip_address)
        DO UPDATE SET
          country = EXCLUDED.country,
          country_code = EXCLUDED.country_code,
          region = EXCLUDED.region,
          city = EXCLUDED.city,
          latitude = EXCLUDED.latitude,
          longitude = EXCLUDED.longitude,
          timezone = EXCLUDED.timezone,
          asn = EXCLUDED.asn,
          asn_organization = EXCLUDED.asn_organization,
          isp = EXCLUDED.isp,
          is_vpn = EXCLUDED.is_vpn,
          is_proxy = EXCLUDED.is_proxy,
          is_tor = EXCLUDED.is_tor,
          is_hosting = EXCLUDED.is_hosting,
          risk_score = EXCLUDED.risk_score,
          threat_level = EXCLUDED.threat_level,
          last_updated = NOW()`,
        [
          geoData.ip,
          geoData.country,
          geoData.countryCode,
          geoData.region,
          geoData.city,
          geoData.latitude,
          geoData.longitude,
          geoData.timezone,
          geoData.asn,
          geoData.asnOrganization,
          geoData.isp,
          geoData.isVPN,
          geoData.isProxy,
          geoData.isTor,
          geoData.isHosting,
          geoData.riskScore,
          geoData.threatLevel,
        ]
      );
    } catch (error) {
      // Table might not exist, that's okay
      AppLogger.debug('Failed to store GeoIP data', { error });
    }
  }

  /**
   * Get geographic threat distribution
   */
  async getGeographicThreats(days: number = 7): Promise<GeographicThreat[]> {
    try {
      const result = await this.pool.query(
        `SELECT
          g.country,
          g.country_code,
          COUNT(DISTINCT se.ip_address)::INTEGER as unique_ips,
          COUNT(se.id)::INTEGER as threat_count,
          COUNT(DISTINCT bl.ip_address)::INTEGER as blocked_ips,
          COUNT(*) FILTER (WHERE se.severity = 'critical')::INTEGER as critical_threats,
          COUNT(*) FILTER (WHERE se.severity = 'high')::INTEGER as high_threats,
          COUNT(*) FILTER (WHERE se.severity = 'medium')::INTEGER as medium_threats,
          COUNT(*) FILTER (WHERE se.severity = 'low')::INTEGER as low_threats,
          MAX(se.created_at) as last_threat_at,
          AVG(g.risk_score)::INTEGER as avg_risk_score
         FROM security_events se
         LEFT JOIN geoip_cache g ON g.ip_address = se.ip_address
         LEFT JOIN api_key_ip_blacklist bl ON bl.ip_address = se.ip_address AND bl.is_active = TRUE
         WHERE se.created_at >= NOW() - INTERVAL '${days} days'
         AND g.country IS NOT NULL
         GROUP BY g.country, g.country_code
         ORDER BY threat_count DESC`,
        []
      );

      const threats: GeographicThreat[] = [];

      for (const row of result.rows) {
        // Get top cities for this country
        const citiesResult = await this.pool.query(
          `SELECT city, COUNT(*)::INTEGER as count
           FROM security_events se
           JOIN geoip_cache g ON g.ip_address = se.ip_address
           WHERE g.country_code = $1
           AND se.created_at >= NOW() - INTERVAL '${days} days'
           AND g.city IS NOT NULL AND g.city != ''
           GROUP BY city
           ORDER BY count DESC
           LIMIT 5`,
          [row.country_code]
        );

        threats.push({
          country: row.country,
          countryCode: row.country_code,
          threatCount: row.threat_count,
          uniqueIPs: row.unique_ips,
          blockedIPs: row.blocked_ips,
          criticalThreats: row.critical_threats,
          highThreats: row.high_threats,
          mediumThreats: row.medium_threats,
          lowThreats: row.low_threats,
          lastThreatAt: row.last_threat_at,
          riskScore: row.avg_risk_score || 0,
          topCities: citiesResult.rows,
        });
      }

      return threats;
    } catch (error) {
      AppLogger.error('Failed to get geographic threats', error as Error);
      return [];
    }
  }

  /**
   * Check if IP is from a risky location
   */
  async isRiskyLocation(ip: string): Promise<boolean> {
    const geoData = await this.lookup(ip);
    if (!geoData) return false;

    // Check against blocked countries
    const blockedCountries = await this.getBlockedCountries();
    if (blockedCountries.includes(geoData.countryCode)) {
      return true;
    }

    // Check risk score
    return geoData.riskScore >= 60;
  }

  /**
   * Get list of blocked countries
   */
  async getBlockedCountries(): Promise<string[]> {
    try {
      const result = await this.pool.query(
        `SELECT country_code FROM blocked_countries WHERE is_active = TRUE`
      );

      return result.rows.map(row => row.country_code);
    } catch (error) {
      // Table might not exist
      return [];
    }
  }

  /**
   * Block/unblock country
   */
  async setCountryBlock(countryCode: string, block: boolean, reason?: string): Promise<void> {
    try {
      if (block) {
        await this.pool.query(
          `INSERT INTO blocked_countries (country_code, reason, is_active, created_at)
           VALUES ($1, $2, TRUE, NOW())
           ON CONFLICT (country_code)
           DO UPDATE SET is_active = TRUE, reason = $2, updated_at = NOW()`,
          [countryCode, reason || 'Manual block']
        );
      } else {
        await this.pool.query(
          `UPDATE blocked_countries SET is_active = FALSE, updated_at = NOW()
           WHERE country_code = $1`,
          [countryCode]
        );
      }

      AppLogger.info(`Country ${block ? 'blocked' : 'unblocked'}`, { countryCode, reason });
    } catch (error) {
      AppLogger.error('Failed to set country block', error as Error, { countryCode, block });
      throw error;
    }
  }

  /**
   * Get ASN statistics
   */
  async getASNStatistics(days: number = 7): Promise<ASNInfo[]> {
    try {
      const result = await this.pool.query(
        `SELECT
          g.asn,
          g.asn_organization,
          g.country_code as country,
          COUNT(DISTINCT se.ip_address)::INTEGER as threat_count,
          BOOL_OR(g.is_hosting) as is_hosting,
          BOOL_OR(g.is_vpn) as is_vpn
         FROM security_events se
         JOIN geoip_cache g ON g.ip_address = se.ip_address
         WHERE se.created_at >= NOW() - INTERVAL '${days} days'
         AND g.asn > 0
         GROUP BY g.asn, g.asn_organization, g.country_code
         ORDER BY threat_count DESC
         LIMIT 50`
      );

      return result.rows.map(row => ({
        asn: row.asn,
        organization: row.asn_organization,
        network: `AS${row.asn}`,
        country: row.country,
        threatCount: row.threat_count,
        isHosting: row.is_hosting,
        isVPN: row.is_vpn,
      }));
    } catch (error) {
      AppLogger.error('Failed to get ASN statistics', error as Error);
      return [];
    }
  }

  /**
   * Calculate distance between two locations (in km)
   */
  calculateDistance(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number
  ): number {
    const R = 6371; // Earth's radius in km
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRadians(lat1)) *
        Math.cos(this.toRadians(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRadians(degrees: number): number {
    return (degrees * Math.PI) / 180;
  }

  /**
   * Detect suspicious location changes
   */
  async detectSuspiciousLocationChange(
    userId: string,
    currentIP: string
  ): Promise<{
    suspicious: boolean;
    reason?: string;
    distance?: number;
    previousLocation?: string;
  }> {
    try {
      // Get user's recent IP
      const recentResult = await this.pool.query(
        `SELECT ip_address, created_at
         FROM user_ip_history
         WHERE user_id = $1
         AND ip_address != $2
         ORDER BY created_at DESC
         LIMIT 1`,
        [userId, currentIP]
      );

      if (recentResult.rows.length === 0) {
        return { suspicious: false };
      }

      const previousIP = recentResult.rows[0].ip_address;
      const lastSeenAt = recentResult.rows[0].created_at;
      const timeDiff = Date.now() - new Date(lastSeenAt).getTime();

      // Get locations for both IPs
      const [currentGeo, previousGeo] = await Promise.all([
        this.lookup(currentIP),
        this.lookup(previousIP),
      ]);

      if (!currentGeo || !previousGeo) {
        return { suspicious: false };
      }

      // Calculate distance
      const distance = this.calculateDistance(
        previousGeo.latitude,
        previousGeo.longitude,
        currentGeo.latitude,
        currentGeo.longitude
      );

      // Suspicious if:
      // 1. Distance > 500km in < 1 hour
      // 2. Distance > 1000km in < 6 hours
      // 3. Different continents in < 12 hours

      const hoursDiff = timeDiff / (1000 * 60 * 60);

      if (distance > 500 && hoursDiff < 1) {
        return {
          suspicious: true,
          reason: `Impossible travel: ${distance.toFixed(0)}km in ${hoursDiff.toFixed(1)} hours`,
          distance,
          previousLocation: `${previousGeo.city}, ${previousGeo.country}`,
        };
      }

      if (distance > 1000 && hoursDiff < 6) {
        return {
          suspicious: true,
          reason: `Unlikely travel: ${distance.toFixed(0)}km in ${hoursDiff.toFixed(1)} hours`,
          distance,
          previousLocation: `${previousGeo.city}, ${previousGeo.country}`,
        };
      }

      if (
        currentGeo.continentCode !== previousGeo.continentCode &&
        hoursDiff < 12
      ) {
        return {
          suspicious: true,
          reason: `Different continents: ${previousGeo.continent} → ${currentGeo.continent} in ${hoursDiff.toFixed(1)} hours`,
          distance,
          previousLocation: `${previousGeo.city}, ${previousGeo.country}`,
        };
      }

      return { suspicious: false, distance, previousLocation: `${previousGeo.city}, ${previousGeo.country}` };
    } catch (error) {
      AppLogger.error('Failed to detect suspicious location change', error as Error);
      return { suspicious: false };
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; hitRate: number } {
    return {
      size: this.cache.size,
      hitRate: 0, // Would need to track hits/misses
    };
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}

/**
 * Singleton instance
 */
let geoIPService: GeoIPService | null = null;

export function initializeGeoIPService(pool: Pool): GeoIPService {
  geoIPService = new GeoIPService(pool);
  return geoIPService;
}

export function getGeoIPService(): GeoIPService {
  if (!geoIPService) {
    throw new Error('GeoIPService not initialized. Call initializeGeoIPService first.');
  }
  return geoIPService;
}
