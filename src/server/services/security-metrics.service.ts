import { Pool } from 'pg';
import { AppLogger } from './logger.service.js';
import { GeoIPService, initializeGeoIPService } from './geoip.service.js';

/**
 * Security Metrics Service
 * Aggregates and provides security metrics for the dashboard
 */

export interface SecurityOverview {
  totalEvents: number;
  criticalEvents: number;
  highEvents: number;
  mediumEvents: number;
  lowEvents: number;
  eventsLast24Hours: number;
  eventsLast7Days: number;
  topEventTypes: Array<{ type: string; count: number }>;
  recentEvents: SecurityEvent[];
}

export interface SecurityEvent {
  id: string;
  event_type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  user_id?: string;
  ip_address?: string;
  user_agent?: string;
  metadata?: any;
  created_at: Date;
}

export interface LoginMetrics {
  totalAttempts: number;
  successfulLogins: number;
  failedLogins: number;
  blockedAttempts: number;
  uniqueIPs: number;
  suspiciousAttempts: number;
  failureRate: number;
}

export interface APIKeyMetrics {
  totalKeys: number;
  activeKeys: number;
  expiredKeys: number;
  revokedKeys: number;
  keysWithWhitelist: number;
  totalAPIRequests: number;
  deniedRequests: number;
  suspiciousIPs: number;
}

export interface SessionMetrics {
  activeSessions: number;
  totalSessions: number;
  suspiciousSessions: number;
  averageSessionDuration: number;
  sessionsLast24Hours: number;
  concurrentSessionViolations: number;
}

export interface CSPMetrics {
  totalViolations: number;
  violationsLast24Hours: number;
  criticalViolations: number;
  uniqueViolatedDirectives: number;
  topViolatedDirectives: Array<{ directive: string; count: number }>;
  newPatterns: number;
}

export interface ThreatSummary {
  activeThreatLevel: 'low' | 'medium' | 'high' | 'critical';
  blockedIPs: number;
  suspiciousActivities: number;
  potentialBreaches: number;
  recentThreats: Array<{
    type: string;
    severity: string;
    count: number;
    lastOccurrence: Date;
  }>;
}

export class SecurityMetricsService {
  private pool: Pool;
  private geoIPService: GeoIPService;

  constructor(pool: Pool) {
    this.pool = pool;
    this.geoIPService = initializeGeoIPService(pool);
  }

  /**
   * Get comprehensive security overview
   */
  async getSecurityOverview(timeRange: '24h' | '7d' | '30d' = '24h'): Promise<SecurityOverview> {
    try {
      const hours = timeRange === '24h' ? 24 : timeRange === '7d' ? 168 : 720;

      // Get event counts by severity
      const severityResult = await this.pool.query(
        `SELECT
          COUNT(*)::INTEGER as total_events,
          COUNT(*) FILTER (WHERE severity = 'critical')::INTEGER as critical_events,
          COUNT(*) FILTER (WHERE severity = 'high')::INTEGER as high_events,
          COUNT(*) FILTER (WHERE severity = 'medium')::INTEGER as medium_events,
          COUNT(*) FILTER (WHERE severity = 'low')::INTEGER as low_events,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours')::INTEGER as events_24h,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '7 days')::INTEGER as events_7d
         FROM security_events
         WHERE created_at >= NOW() - INTERVAL '${hours} hours'`
      );

      const metrics = severityResult.rows[0];

      // Get top event types
      const topEventsResult = await this.pool.query(
        `SELECT event_type, COUNT(*)::INTEGER as count
         FROM security_events
         WHERE created_at >= NOW() - INTERVAL '${hours} hours'
         GROUP BY event_type
         ORDER BY count DESC
         LIMIT 10`
      );

      // Get recent events
      const recentEventsResult = await this.pool.query(
        `SELECT * FROM security_events
         WHERE created_at >= NOW() - INTERVAL '${hours} hours'
         ORDER BY created_at DESC
         LIMIT 50`
      );

      return {
        totalEvents: metrics.total_events || 0,
        criticalEvents: metrics.critical_events || 0,
        highEvents: metrics.high_events || 0,
        mediumEvents: metrics.medium_events || 0,
        lowEvents: metrics.low_events || 0,
        eventsLast24Hours: metrics.events_24h || 0,
        eventsLast7Days: metrics.events_7d || 0,
        topEventTypes: topEventsResult.rows,
        recentEvents: recentEventsResult.rows,
      };
    } catch (error) {
      AppLogger.error('Failed to get security overview', error as Error);
      throw error;
    }
  }

  /**
   * Get login metrics
   */
  async getLoginMetrics(timeRange: '24h' | '7d' | '30d' = '24h'): Promise<LoginMetrics> {
    try {
      const hours = timeRange === '24h' ? 24 : timeRange === '7d' ? 168 : 720;

      const result = await this.pool.query(
        `SELECT
          COUNT(*)::INTEGER as total_attempts,
          COUNT(*) FILTER (WHERE success = TRUE)::INTEGER as successful_logins,
          COUNT(*) FILTER (WHERE success = FALSE)::INTEGER as failed_logins,
          COUNT(*) FILTER (WHERE blocked = TRUE)::INTEGER as blocked_attempts,
          COUNT(DISTINCT ip_address)::INTEGER as unique_ips,
          COUNT(*) FILTER (WHERE is_suspicious = TRUE)::INTEGER as suspicious_attempts
         FROM login_attempts
         WHERE attempted_at >= NOW() - INTERVAL '${hours} hours'`
      );

      const metrics = result.rows[0];
      const totalAttempts = metrics.total_attempts || 0;
      const failedLogins = metrics.failed_logins || 0;

      return {
        totalAttempts,
        successfulLogins: metrics.successful_logins || 0,
        failedLogins,
        blockedAttempts: metrics.blocked_attempts || 0,
        uniqueIPs: metrics.unique_ips || 0,
        suspiciousAttempts: metrics.suspicious_attempts || 0,
        failureRate: totalAttempts > 0 ? (failedLogins / totalAttempts) * 100 : 0,
      };
    } catch (error) {
      AppLogger.error('Failed to get login metrics', error as Error);
      throw error;
    }
  }

  /**
   * Get API key metrics
   */
  async getAPIKeyMetrics(): Promise<APIKeyMetrics> {
    try {
      const keysResult = await this.pool.query(
        `SELECT
          COUNT(*)::INTEGER as total_keys,
          COUNT(*) FILTER (WHERE revoked = FALSE AND (expires_at IS NULL OR expires_at > NOW()))::INTEGER as active_keys,
          COUNT(*) FILTER (WHERE expires_at < NOW() AND expires_at IS NOT NULL)::INTEGER as expired_keys,
          COUNT(*) FILTER (WHERE revoked = TRUE)::INTEGER as revoked_keys
         FROM api_keys`
      );

      const whitelistResult = await this.pool.query(
        `SELECT COUNT(DISTINCT api_key_id)::INTEGER as keys_with_whitelist
         FROM api_key_ip_whitelist
         WHERE is_active = TRUE`
      );

      const accessResult = await this.pool.query(
        `SELECT
          COUNT(*)::INTEGER as total_requests,
          COUNT(*) FILTER (WHERE access_granted = FALSE)::INTEGER as denied_requests
         FROM api_key_ip_access_logs
         WHERE request_timestamp >= NOW() - INTERVAL '24 hours'`
      );

      const suspiciousResult = await this.pool.query(
        `SELECT COUNT(DISTINCT ip_address)::INTEGER as suspicious_ips
         FROM suspicious_ip_access`
      );

      const keys = keysResult.rows[0];
      const access = accessResult.rows[0];

      return {
        totalKeys: keys.total_keys || 0,
        activeKeys: keys.active_keys || 0,
        expiredKeys: keys.expired_keys || 0,
        revokedKeys: keys.revoked_keys || 0,
        keysWithWhitelist: whitelistResult.rows[0].keys_with_whitelist || 0,
        totalAPIRequests: access.total_requests || 0,
        deniedRequests: access.denied_requests || 0,
        suspiciousIPs: suspiciousResult.rows[0].suspicious_ips || 0,
      };
    } catch (error) {
      AppLogger.error('Failed to get API key metrics', error as Error);
      throw error;
    }
  }

  /**
   * Get session metrics
   */
  async getSessionMetrics(): Promise<SessionMetrics> {
    try {
      const result = await this.pool.query(
        `SELECT
          COUNT(*) FILTER (WHERE expires_at > NOW())::INTEGER as active_sessions,
          COUNT(*)::INTEGER as total_sessions,
          COUNT(*) FILTER (WHERE is_suspicious = TRUE)::INTEGER as suspicious_sessions,
          AVG(EXTRACT(EPOCH FROM (COALESCE(expires_at, NOW()) - created_at)))::INTEGER as avg_duration,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours')::INTEGER as sessions_24h
         FROM sessions
         WHERE created_at >= NOW() - INTERVAL '30 days'`
      );

      const violationsResult = await this.pool.query(
        `SELECT COUNT(*)::INTEGER as violations
         FROM session_violations
         WHERE created_at >= NOW() - INTERVAL '24 hours'`
      );

      const metrics = result.rows[0];

      return {
        activeSessions: metrics.active_sessions || 0,
        totalSessions: metrics.total_sessions || 0,
        suspiciousSessions: metrics.suspicious_sessions || 0,
        averageSessionDuration: metrics.avg_duration || 0,
        sessionsLast24Hours: metrics.sessions_24h || 0,
        concurrentSessionViolations: violationsResult.rows[0].violations || 0,
      };
    } catch (error) {
      AppLogger.error('Failed to get session metrics', error as Error);
      throw error;
    }
  }

  /**
   * Get CSP violation metrics
   */
  async getCSPMetrics(timeRange: '24h' | '7d' | '30d' = '24h'): Promise<CSPMetrics> {
    try {
      const hours = timeRange === '24h' ? 24 : timeRange === '7d' ? 168 : 720;

      const result = await this.pool.query(
        `SELECT
          COUNT(*)::INTEGER as total_violations,
          COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '24 hours')::INTEGER as violations_24h,
          COUNT(*) FILTER (WHERE severity = 'critical')::INTEGER as critical_violations,
          COUNT(DISTINCT violated_directive)::INTEGER as unique_directives
         FROM csp_violations
         WHERE created_at >= NOW() - INTERVAL '${hours} hours'`
      );

      const topDirectivesResult = await this.pool.query(
        `SELECT violated_directive as directive, COUNT(*)::INTEGER as count
         FROM csp_violations
         WHERE created_at >= NOW() - INTERVAL '${hours} hours'
         GROUP BY violated_directive
         ORDER BY count DESC
         LIMIT 10`
      );

      const newPatternsResult = await this.pool.query(
        `SELECT COUNT(*)::INTEGER as new_patterns
         FROM csp_violation_patterns
         WHERE first_seen >= NOW() - INTERVAL '24 hours'`
      );

      const metrics = result.rows[0];

      return {
        totalViolations: metrics.total_violations || 0,
        violationsLast24Hours: metrics.violations_24h || 0,
        criticalViolations: metrics.critical_violations || 0,
        uniqueViolatedDirectives: metrics.unique_directives || 0,
        topViolatedDirectives: topDirectivesResult.rows,
        newPatterns: newPatternsResult.rows[0].new_patterns || 0,
      };
    } catch (error) {
      AppLogger.error('Failed to get CSP metrics', error as Error);
      throw error;
    }
  }

  /**
   * Get threat summary
   */
  async getThreatSummary(): Promise<ThreatSummary> {
    try {
      // Get blocked IPs
      const blockedIPsResult = await this.pool.query(
        `SELECT COUNT(*)::INTEGER as count
         FROM api_key_ip_blacklist
         WHERE is_active = TRUE`
      );

      // Get suspicious activities
      const suspiciousResult = await this.pool.query(
        `SELECT COUNT(*)::INTEGER as count
         FROM security_events
         WHERE severity IN ('high', 'critical')
         AND created_at >= NOW() - INTERVAL '24 hours'`
      );

      // Get potential breaches
      const breachesResult = await this.pool.query(
        `SELECT COUNT(*)::INTEGER as count
         FROM security_events
         WHERE event_type LIKE '%breach%' OR event_type LIKE '%intrusion%'
         AND created_at >= NOW() - INTERVAL '7 days'`
      );

      // Get recent threats
      const threatsResult = await this.pool.query(
        `SELECT
          event_type as type,
          severity,
          COUNT(*)::INTEGER as count,
          MAX(created_at) as last_occurrence
         FROM security_events
         WHERE severity IN ('high', 'critical')
         AND created_at >= NOW() - INTERVAL '24 hours'
         GROUP BY event_type, severity
         ORDER BY count DESC
         LIMIT 10`
      );

      // Calculate threat level
      const criticalCount = suspiciousResult.rows[0].count || 0;
      const blockedCount = blockedIPsResult.rows[0].count || 0;

      let activeThreatLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
      if (criticalCount >= 10 || blockedCount >= 20) {
        activeThreatLevel = 'critical';
      } else if (criticalCount >= 5 || blockedCount >= 10) {
        activeThreatLevel = 'high';
      } else if (criticalCount >= 2 || blockedCount >= 5) {
        activeThreatLevel = 'medium';
      }

      return {
        activeThreatLevel,
        blockedIPs: blockedCount,
        suspiciousActivities: criticalCount,
        potentialBreaches: breachesResult.rows[0].count || 0,
        recentThreats: threatsResult.rows,
      };
    } catch (error) {
      AppLogger.error('Failed to get threat summary', error as Error);
      throw error;
    }
  }

  /**
   * Get security events timeline
   */
  async getSecurityTimeline(hours: number = 24): Promise<
    Array<{
      timestamp: Date;
      critical: number;
      high: number;
      medium: number;
      low: number;
    }>
  > {
    try {
      const result = await this.pool.query(
        `SELECT
          date_trunc('hour', created_at) as timestamp,
          COUNT(*) FILTER (WHERE severity = 'critical')::INTEGER as critical,
          COUNT(*) FILTER (WHERE severity = 'high')::INTEGER as high,
          COUNT(*) FILTER (WHERE severity = 'medium')::INTEGER as medium,
          COUNT(*) FILTER (WHERE severity = 'low')::INTEGER as low
         FROM security_events
         WHERE created_at >= NOW() - INTERVAL '${hours} hours'
         GROUP BY date_trunc('hour', created_at)
         ORDER BY timestamp ASC`
      );

      return result.rows;
    } catch (error) {
      AppLogger.error('Failed to get security timeline', error as Error);
      throw error;
    }
  }

  /**
   * Get geographic distribution of threats
   */
  async getGeographicThreats(): Promise<
    Array<{
      country: string;
      countryCode: string;
      threatCount: number;
      blockedIPs: number;
      criticalCount: number;
      highCount: number;
      uniqueIPs: number;
      riskScore: number;
    }>
  > {
    try {
      // Get threat IPs with severity counts
      const result = await this.pool.query(
        `SELECT
          ip_address,
          COUNT(*)::INTEGER as threat_count,
          COUNT(*) FILTER (WHERE severity = 'critical')::INTEGER as critical_count,
          COUNT(*) FILTER (WHERE severity = 'high')::INTEGER as high_count
         FROM security_events
         WHERE ip_address IS NOT NULL
         AND created_at >= NOW() - INTERVAL '7 days'
         GROUP BY ip_address
         ORDER BY threat_count DESC
         LIMIT 100`
      );

      // Get blocked IPs for cross-reference
      const blockedResult = await this.pool.query(
        `SELECT ip_address FROM api_key_ip_blacklist WHERE is_active = TRUE`
      );
      const blockedIPSet = new Set(blockedResult.rows.map((r) => r.ip_address));

      // Map IPs to countries using GeoIP service
      const countryMap = new Map<string, {
        country: string;
        countryCode: string;
        threatCount: number;
        blockedIPs: number;
        criticalCount: number;
        highCount: number;
        uniqueIPs: Set<string>;
        totalRiskScore: number;
      }>();

      for (const row of result.rows) {
        const geoData = await this.geoIPService.lookup(row.ip_address);

        if (geoData) {
          const key = geoData.countryCode || 'UNKNOWN';
          const country = geoData.country || 'Unknown';

          if (!countryMap.has(key)) {
            countryMap.set(key, {
              country,
              countryCode: key,
              threatCount: 0,
              blockedIPs: 0,
              criticalCount: 0,
              highCount: 0,
              uniqueIPs: new Set(),
              totalRiskScore: 0,
            });
          }

          const entry = countryMap.get(key)!;
          entry.threatCount += row.threat_count;
          entry.criticalCount += row.critical_count;
          entry.highCount += row.high_count;
          entry.uniqueIPs.add(row.ip_address);
          entry.totalRiskScore += geoData.riskScore || 0;

          if (blockedIPSet.has(row.ip_address)) {
            entry.blockedIPs++;
          }
        }
      }

      // Convert map to sorted array
      return Array.from(countryMap.values())
        .map((entry) => ({
          country: entry.country,
          countryCode: entry.countryCode,
          threatCount: entry.threatCount,
          blockedIPs: entry.blockedIPs,
          criticalCount: entry.criticalCount,
          highCount: entry.highCount,
          uniqueIPs: entry.uniqueIPs.size,
          riskScore: Math.round(entry.totalRiskScore / entry.uniqueIPs.size),
        }))
        .sort((a, b) => b.threatCount - a.threatCount)
        .slice(0, 20);
    } catch (error) {
      AppLogger.error('Failed to get geographic threats', error as Error);
      return [];
    }
  }

  /**
   * Get top threat actors (by IP)
   */
  async getTopThreatActors(limit: number = 10): Promise<
    Array<{
      ipAddress: string;
      eventCount: number;
      severities: { critical: number; high: number; medium: number; low: number };
      lastSeen: Date;
      isBlocked: boolean;
    }>
  > {
    try {
      const result = await this.pool.query(
        `SELECT
          se.ip_address,
          COUNT(*)::INTEGER as event_count,
          COUNT(*) FILTER (WHERE severity = 'critical')::INTEGER as critical,
          COUNT(*) FILTER (WHERE severity = 'high')::INTEGER as high,
          COUNT(*) FILTER (WHERE severity = 'medium')::INTEGER as medium,
          COUNT(*) FILTER (WHERE severity = 'low')::INTEGER as low,
          MAX(se.created_at) as last_seen,
          EXISTS(
            SELECT 1 FROM api_key_ip_blacklist bl
            WHERE bl.ip_address = se.ip_address
            AND bl.is_active = TRUE
          ) as is_blocked
         FROM security_events se
         WHERE se.ip_address IS NOT NULL
         AND se.created_at >= NOW() - INTERVAL '7 days'
         GROUP BY se.ip_address
         ORDER BY event_count DESC
         LIMIT $1`,
        [limit]
      );

      return result.rows.map((row) => ({
        ipAddress: row.ip_address,
        eventCount: row.event_count,
        severities: {
          critical: row.critical,
          high: row.high,
          medium: row.medium,
          low: row.low,
        },
        lastSeen: row.last_seen,
        isBlocked: row.is_blocked,
      }));
    } catch (error) {
      AppLogger.error('Failed to get top threat actors', error as Error);
      throw error;
    }
  }

  /**
   * Get top threat countries by severity
   */
  async getTopThreatCountries(limit: number = 10): Promise<
    Array<{
      country: string;
      countryCode: string;
      threatCount: number;
      criticalEvents: number;
      highEvents: number;
      uniqueIPs: number;
      blockedIPs: number;
      averageRiskScore: number;
    }>
  > {
    try {
      const result = await this.pool.query(
        `SELECT
          ip_address,
          COUNT(*) FILTER (WHERE severity = 'critical')::INTEGER as critical_count,
          COUNT(*) FILTER (WHERE severity = 'high')::INTEGER as high_count,
          COUNT(*)::INTEGER as total_count
         FROM security_events
         WHERE ip_address IS NOT NULL
         AND created_at >= NOW() - INTERVAL '7 days'
         AND severity IN ('critical', 'high')
         GROUP BY ip_address
         HAVING COUNT(*) > 0`
      );

      const blockedResult = await this.pool.query(
        `SELECT ip_address FROM api_key_ip_blacklist WHERE is_active = TRUE`
      );
      const blockedIPSet = new Set(blockedResult.rows.map((r) => r.ip_address));

      const countryMap = new Map<string, {
        country: string;
        countryCode: string;
        threatCount: number;
        criticalEvents: number;
        highEvents: number;
        uniqueIPs: Set<string>;
        blockedIPs: number;
        totalRiskScore: number;
      }>();

      for (const row of result.rows) {
        const geoData = await this.geoIPService.lookup(row.ip_address);
        if (geoData) {
          const key = geoData.countryCode || 'UNKNOWN';
          if (!countryMap.has(key)) {
            countryMap.set(key, {
              country: geoData.country || 'Unknown',
              countryCode: key,
              threatCount: 0,
              criticalEvents: 0,
              highEvents: 0,
              uniqueIPs: new Set(),
              blockedIPs: 0,
              totalRiskScore: 0,
            });
          }

          const entry = countryMap.get(key)!;
          entry.threatCount += row.total_count;
          entry.criticalEvents += row.critical_count;
          entry.highEvents += row.high_count;
          entry.uniqueIPs.add(row.ip_address);
          entry.totalRiskScore += geoData.riskScore || 0;

          if (blockedIPSet.has(row.ip_address)) {
            entry.blockedIPs++;
          }
        }
      }

      return Array.from(countryMap.values())
        .map((entry) => ({
          country: entry.country,
          countryCode: entry.countryCode,
          threatCount: entry.threatCount,
          criticalEvents: entry.criticalEvents,
          highEvents: entry.highEvents,
          uniqueIPs: entry.uniqueIPs.size,
          blockedIPs: entry.blockedIPs,
          averageRiskScore: Math.round(entry.totalRiskScore / entry.uniqueIPs.size),
        }))
        .sort((a, b) => b.threatCount - a.threatCount)
        .slice(0, limit);
    } catch (error) {
      AppLogger.error('Failed to get top threat countries', error as Error);
      return [];
    }
  }

  /**
   * Get VPN/Proxy threats
   */
  async getVPNThreats(): Promise<{
    totalVPNIPs: number;
    vpnThreatEvents: number;
    topVPNCountries: Array<{ country: string; count: number }>;
    blockedVPNs: number;
  }> {
    try {
      const result = await this.pool.query(
        `SELECT DISTINCT ip_address
         FROM security_events
         WHERE ip_address IS NOT NULL
         AND created_at >= NOW() - INTERVAL '7 days'`
      );

      let vpnCount = 0;
      let vpnThreatEvents = 0;
      let blockedVPNs = 0;
      const vpnCountries = new Map<string, number>();

      const blockedResult = await this.pool.query(
        `SELECT ip_address FROM api_key_ip_blacklist WHERE is_active = TRUE`
      );
      const blockedIPSet = new Set(blockedResult.rows.map((r) => r.ip_address));

      for (const row of result.rows) {
        const geoData = await this.geoIPService.lookup(row.ip_address);
        if (geoData?.isVPN || geoData?.isProxy) {
          vpnCount++;

          // Count events from this VPN IP
          const eventResult = await this.pool.query(
            `SELECT COUNT(*)::INTEGER as count FROM security_events WHERE ip_address = $1`,
            [row.ip_address]
          );
          vpnThreatEvents += eventResult.rows[0].count;

          if (blockedIPSet.has(row.ip_address)) {
            blockedVPNs++;
          }

          if (geoData.country) {
            vpnCountries.set(geoData.country, (vpnCountries.get(geoData.country) || 0) + 1);
          }
        }
      }

      const topVPNCountries = Array.from(vpnCountries.entries())
        .map(([country, count]) => ({ country, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      return {
        totalVPNIPs: vpnCount,
        vpnThreatEvents,
        topVPNCountries,
        blockedVPNs,
      };
    } catch (error) {
      AppLogger.error('Failed to get VPN threats', error as Error);
      return {
        totalVPNIPs: 0,
        vpnThreatEvents: 0,
        topVPNCountries: [],
        blockedVPNs: 0,
      };
    }
  }

  /**
   * Get Tor network threats
   */
  async getTorThreats(): Promise<{
    totalTorIPs: number;
    torThreatEvents: number;
    blockedTorNodes: number;
    exitNodeCountries: Array<{ country: string; count: number }>;
  }> {
    try {
      const result = await this.pool.query(
        `SELECT DISTINCT ip_address
         FROM security_events
         WHERE ip_address IS NOT NULL
         AND created_at >= NOW() - INTERVAL '7 days'`
      );

      let torCount = 0;
      let torThreatEvents = 0;
      let blockedTor = 0;
      const torCountries = new Map<string, number>();

      const blockedResult = await this.pool.query(
        `SELECT ip_address FROM api_key_ip_blacklist WHERE is_active = TRUE`
      );
      const blockedIPSet = new Set(blockedResult.rows.map((r) => r.ip_address));

      for (const row of result.rows) {
        const geoData = await this.geoIPService.lookup(row.ip_address);
        if (geoData?.isTor) {
          torCount++;

          const eventResult = await this.pool.query(
            `SELECT COUNT(*)::INTEGER as count FROM security_events WHERE ip_address = $1`,
            [row.ip_address]
          );
          torThreatEvents += eventResult.rows[0].count;

          if (blockedIPSet.has(row.ip_address)) {
            blockedTor++;
          }

          if (geoData.country) {
            torCountries.set(geoData.country, (torCountries.get(geoData.country) || 0) + 1);
          }
        }
      }

      const exitNodeCountries = Array.from(torCountries.entries())
        .map(([country, count]) => ({ country, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      return {
        totalTorIPs: torCount,
        torThreatEvents,
        blockedTorNodes: blockedTor,
        exitNodeCountries,
      };
    } catch (error) {
      AppLogger.error('Failed to get Tor threats', error as Error);
      return {
        totalTorIPs: 0,
        torThreatEvents: 0,
        blockedTorNodes: 0,
        exitNodeCountries: [],
      };
    }
  }

  /**
   * Get ASN (Autonomous System Number) threat statistics
   */
  async getASNThreats(limit: number = 10): Promise<
    Array<{
      asn: string;
      organization: string;
      threatCount: number;
      uniqueIPs: number;
      blockedIPs: number;
      countries: string[];
      isHosting: boolean;
    }>
  > {
    try {
      const result = await this.pool.query(
        `SELECT ip_address, COUNT(*)::INTEGER as threat_count
         FROM security_events
         WHERE ip_address IS NOT NULL
         AND created_at >= NOW() - INTERVAL '7 days'
         GROUP BY ip_address`
      );

      const blockedResult = await this.pool.query(
        `SELECT ip_address FROM api_key_ip_blacklist WHERE is_active = TRUE`
      );
      const blockedIPSet = new Set(blockedResult.rows.map((r) => r.ip_address));

      const asnMap = new Map<string, {
        asn: string;
        organization: string;
        threatCount: number;
        uniqueIPs: Set<string>;
        blockedIPs: number;
        countries: Set<string>;
        isHosting: boolean;
      }>();

      for (const row of result.rows) {
        const geoData = await this.geoIPService.lookup(row.ip_address);
        if (geoData?.asn) {
          const key = geoData.asn;
          if (!asnMap.has(key)) {
            asnMap.set(key, {
              asn: geoData.asn,
              organization: geoData.organization || 'Unknown',
              threatCount: 0,
              uniqueIPs: new Set(),
              blockedIPs: 0,
              countries: new Set(),
              isHosting: geoData.isHosting || false,
            });
          }

          const entry = asnMap.get(key)!;
          entry.threatCount += row.threat_count;
          entry.uniqueIPs.add(row.ip_address);

          if (geoData.country) {
            entry.countries.add(geoData.country);
          }

          if (blockedIPSet.has(row.ip_address)) {
            entry.blockedIPs++;
          }
        }
      }

      return Array.from(asnMap.values())
        .map((entry) => ({
          asn: entry.asn,
          organization: entry.organization,
          threatCount: entry.threatCount,
          uniqueIPs: entry.uniqueIPs.size,
          blockedIPs: entry.blockedIPs,
          countries: Array.from(entry.countries),
          isHosting: entry.isHosting,
        }))
        .sort((a, b) => b.threatCount - a.threatCount)
        .slice(0, limit);
    } catch (error) {
      AppLogger.error('Failed to get ASN threats', error as Error);
      return [];
    }
  }

  /**
   * Detect suspicious location changes for a user
   */
  async detectSuspiciousLocationChanges(userId: string): Promise<
    Array<{
      timestamp: Date;
      previousIP: string;
      currentIP: string;
      previousLocation: string;
      currentLocation: string;
      distance: number;
      timeElapsed: number;
      suspicious: boolean;
      reason: string;
    }>
  > {
    try {
      const result = await this.pool.query(
        `SELECT ip_address, created_at
         FROM security_events
         WHERE user_id = $1
         AND ip_address IS NOT NULL
         ORDER BY created_at DESC
         LIMIT 50`,
        [userId]
      );

      const suspiciousChanges: Array<any> = [];

      for (let i = 1; i < result.rows.length; i++) {
        const current = result.rows[i - 1];
        const previous = result.rows[i];

        if (current.ip_address !== previous.ip_address) {
          const detection = await this.geoIPService.detectSuspiciousLocationChange(
            userId,
            current.ip_address
          );

          if (detection.suspicious) {
            const [currentGeo, previousGeo] = await Promise.all([
              this.geoIPService.lookup(current.ip_address),
              this.geoIPService.lookup(previous.ip_address),
            ]);

            const timeElapsed =
              (new Date(current.created_at).getTime() - new Date(previous.created_at).getTime()) /
              1000 /
              60 /
              60; // hours

            suspiciousChanges.push({
              timestamp: current.created_at,
              previousIP: previous.ip_address,
              currentIP: current.ip_address,
              previousLocation: previousGeo
                ? `${previousGeo.city || 'Unknown'}, ${previousGeo.country || 'Unknown'}`
                : 'Unknown',
              currentLocation: currentGeo
                ? `${currentGeo.city || 'Unknown'}, ${currentGeo.country || 'Unknown'}`
                : 'Unknown',
              distance: detection.distance || 0,
              timeElapsed,
              suspicious: true,
              reason: detection.reason || 'Unknown',
            });
          }
        }
      }

      return suspiciousChanges;
    } catch (error) {
      AppLogger.error('Failed to detect suspicious location changes', error as Error);
      return [];
    }
  }

  /**
   * Get comprehensive security dashboard data
   */
  async getDashboardData(timeRange: '24h' | '7d' | '30d' = '24h'): Promise<{
    overview: SecurityOverview;
    loginMetrics: LoginMetrics;
    apiKeyMetrics: APIKeyMetrics;
    sessionMetrics: SessionMetrics;
    cspMetrics: CSPMetrics;
    threatSummary: ThreatSummary;
    timeline: Awaited<ReturnType<typeof this.getSecurityTimeline>>;
    topThreats: Awaited<ReturnType<typeof this.getTopThreatActors>>;
  }> {
    try {
      const [
        overview,
        loginMetrics,
        apiKeyMetrics,
        sessionMetrics,
        cspMetrics,
        threatSummary,
        timeline,
        topThreats,
      ] = await Promise.all([
        this.getSecurityOverview(timeRange),
        this.getLoginMetrics(timeRange),
        this.getAPIKeyMetrics(),
        this.getSessionMetrics(),
        this.getCSPMetrics(timeRange),
        this.getThreatSummary(),
        this.getSecurityTimeline(timeRange === '24h' ? 24 : timeRange === '7d' ? 168 : 720),
        this.getTopThreatActors(10),
      ]);

      return {
        overview,
        loginMetrics,
        apiKeyMetrics,
        sessionMetrics,
        cspMetrics,
        threatSummary,
        timeline,
        topThreats,
      };
    } catch (error) {
      AppLogger.error('Failed to get dashboard data', error as Error);
      throw error;
    }
  }
}

/**
 * Singleton instance
 */
let securityMetricsService: SecurityMetricsService | null = null;

export function initializeSecurityMetricsService(pool: Pool): SecurityMetricsService {
  securityMetricsService = new SecurityMetricsService(pool);
  return securityMetricsService;
}

export function getSecurityMetricsService(): SecurityMetricsService {
  if (!securityMetricsService) {
    throw new Error(
      'SecurityMetricsService not initialized. Call initializeSecurityMetricsService first.'
    );
  }
  return securityMetricsService;
}
