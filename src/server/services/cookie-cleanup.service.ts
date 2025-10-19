import { Pool } from 'pg';
import { AppLogger } from './logger.service.js';
import cron from 'node-cron';

/**
 * Cookie Cleanup Service
 * Manages cookie cleanup, tracking, and maintenance
 */

export interface CookieTrackingEntry {
  id: string;
  userId?: string;
  cookieName: string;
  cookieValue: string; // Hashed value for tracking
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
  expiresAt?: Date;
  lastAccessed?: Date;
  accessCount: number;
  isSecure: boolean;
  isHttpOnly: boolean;
  sameSite?: string;
}

export interface CookieCleanupStats {
  expiredCookiesRemoved: number;
  orphanedCookiesRemoved: number;
  suspiciousCookiesRemoved: number;
  totalCookiesTracked: number;
}

export class CookieCleanupService {
  private pool: Pool;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Start automated cookie cleanup jobs
   */
  startAutomatedCleanup(): void {
    AppLogger.info('Starting automated cookie cleanup service');

    // Clean up expired cookies every hour
    cron.schedule('0 * * * *', async () => {
      await this.cleanupExpiredCookies();
    });

    // Clean up orphaned cookies every 6 hours
    cron.schedule('0 */6 * * *', async () => {
      await this.cleanupOrphanedCookies();
    });

    // Clean up suspicious cookies every 3 hours
    cron.schedule('0 */3 * * *', async () => {
      await this.cleanupSuspiciousCookies();
    });

    // Generate cleanup report daily
    cron.schedule('0 2 * * *', async () => {
      await this.generateCleanupReport();
    });

    // Clean up old tracking entries weekly
    cron.schedule('0 3 * * 0', async () => {
      await this.cleanupOldTrackingEntries(30); // 30 days retention
    });
  }

  /**
   * Stop automated cleanup
   */
  stopAutomatedCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      AppLogger.info('Automated cookie cleanup stopped');
    }
  }

  /**
   * Track cookie creation
   */
  async trackCookie(
    cookieName: string,
    cookieValue: string,
    options: {
      userId?: string;
      ipAddress?: string;
      userAgent?: string;
      expiresAt?: Date;
      isSecure?: boolean;
      isHttpOnly?: boolean;
      sameSite?: string;
    } = {}
  ): Promise<void> {
    try {
      // Hash the cookie value for privacy
      const crypto = await import('crypto');
      const valueHash = crypto.createHash('sha256').update(cookieValue).digest('hex');

      await this.pool.query(
        `INSERT INTO cookie_tracking (
          user_id, cookie_name, cookie_value_hash, ip_address, user_agent,
          expires_at, is_secure, is_http_only, same_site,
          created_at, last_accessed, access_count
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW(), 1)
        ON CONFLICT (cookie_name, cookie_value_hash)
        DO UPDATE SET
          last_accessed = NOW(),
          access_count = cookie_tracking.access_count + 1`,
        [
          options.userId || null,
          cookieName,
          valueHash,
          options.ipAddress || null,
          options.userAgent || null,
          options.expiresAt || null,
          options.isSecure || false,
          options.isHttpOnly || false,
          options.sameSite || null,
        ]
      );

      AppLogger.debug('Cookie tracked', { cookieName });
    } catch (error) {
      AppLogger.error('Failed to track cookie', error as Error, { cookieName });
    }
  }

  /**
   * Clean up expired cookies from tracking
   */
  async cleanupExpiredCookies(): Promise<number> {
    try {
      const result = await this.pool.query(
        `DELETE FROM cookie_tracking
         WHERE expires_at IS NOT NULL
         AND expires_at < NOW()`
      );

      const deletedCount = result.rowCount || 0;

      AppLogger.info('Expired cookies cleaned up', {
        deletedCount,
      });

      return deletedCount;
    } catch (error) {
      AppLogger.error('Failed to cleanup expired cookies', error as Error);
      return 0;
    }
  }

  /**
   * Clean up orphaned cookies (user deleted but cookies remain)
   */
  async cleanupOrphanedCookies(): Promise<number> {
    try {
      const result = await this.pool.query(
        `DELETE FROM cookie_tracking ct
         WHERE ct.user_id IS NOT NULL
         AND NOT EXISTS (
           SELECT 1 FROM users u WHERE u.id = ct.user_id
         )`
      );

      const deletedCount = result.rowCount || 0;

      AppLogger.info('Orphaned cookies cleaned up', {
        deletedCount,
      });

      return deletedCount;
    } catch (error) {
      AppLogger.error('Failed to cleanup orphaned cookies', error as Error);
      return 0;
    }
  }

  /**
   * Clean up suspicious cookies (unusual patterns)
   */
  async cleanupSuspiciousCookies(): Promise<number> {
    try {
      // Remove cookies with excessive access count (potential replay attacks)
      const excessiveAccessResult = await this.pool.query(
        `DELETE FROM cookie_tracking
         WHERE access_count > 10000
         AND created_at > NOW() - INTERVAL '1 hour'`
      );

      const excessiveAccessCount = excessiveAccessResult.rowCount || 0;

      // Remove cookies from suspicious IPs (multiple users from same IP)
      const suspiciousIpResult = await this.pool.query(
        `DELETE FROM cookie_tracking ct
         WHERE ct.ip_address IN (
           SELECT ip_address
           FROM cookie_tracking
           WHERE ip_address IS NOT NULL
           GROUP BY ip_address
           HAVING COUNT(DISTINCT user_id) > 50
         )`
      );

      const suspiciousIpCount = suspiciousIpResult.rowCount || 0;

      // Remove non-secure cookies in production
      let nonSecureCount = 0;
      if (process.env.NODE_ENV === 'production') {
        const nonSecureResult = await this.pool.query(
          `DELETE FROM cookie_tracking
           WHERE is_secure = FALSE
           AND cookie_name NOT IN ('cookie_consent', 'preferences')`
        );
        nonSecureCount = nonSecureResult.rowCount || 0;
      }

      const totalDeleted = excessiveAccessCount + suspiciousIpCount + nonSecureCount;

      AppLogger.info('Suspicious cookies cleaned up', {
        excessiveAccessCount,
        suspiciousIpCount,
        nonSecureCount,
        totalDeleted,
      });

      if (totalDeleted > 0) {
        AppLogger.logSecurityEvent('cookie.suspicious_cleanup', 'medium', {
          totalDeleted,
          excessiveAccessCount,
          suspiciousIpCount,
        });
      }

      return totalDeleted;
    } catch (error) {
      AppLogger.error('Failed to cleanup suspicious cookies', error as Error);
      return 0;
    }
  }

  /**
   * Clean up old tracking entries
   */
  async cleanupOldTrackingEntries(retentionDays: number = 30): Promise<number> {
    try {
      const result = await this.pool.query(
        `DELETE FROM cookie_tracking
         WHERE created_at < NOW() - INTERVAL '${retentionDays} days'`
      );

      const deletedCount = result.rowCount || 0;

      AppLogger.info('Old cookie tracking entries cleaned up', {
        retentionDays,
        deletedCount,
      });

      return deletedCount;
    } catch (error) {
      AppLogger.error('Failed to cleanup old tracking entries', error as Error);
      return 0;
    }
  }

  /**
   * Get cookie tracking statistics
   */
  async getCookieStats(): Promise<{
    totalCookies: number;
    secureCookies: number;
    nonSecureCookies: number;
    httpOnlyCookies: number;
    byName: Record<string, number>;
    bySameSite: Record<string, number>;
  }> {
    try {
      const totalResult = await this.pool.query(
        'SELECT COUNT(*) as count FROM cookie_tracking'
      );

      const secureResult = await this.pool.query(
        'SELECT COUNT(*) as count FROM cookie_tracking WHERE is_secure = TRUE'
      );

      const httpOnlyResult = await this.pool.query(
        'SELECT COUNT(*) as count FROM cookie_tracking WHERE is_http_only = TRUE'
      );

      const byNameResult = await this.pool.query(
        `SELECT cookie_name, COUNT(*) as count
         FROM cookie_tracking
         GROUP BY cookie_name
         ORDER BY count DESC
         LIMIT 10`
      );

      const bySameSiteResult = await this.pool.query(
        `SELECT same_site, COUNT(*) as count
         FROM cookie_tracking
         WHERE same_site IS NOT NULL
         GROUP BY same_site`
      );

      const totalCookies = parseInt(totalResult.rows[0].count);
      const secureCookies = parseInt(secureResult.rows[0].count);
      const httpOnlyCookies = parseInt(httpOnlyResult.rows[0].count);

      const byName: Record<string, number> = {};
      for (const row of byNameResult.rows) {
        byName[row.cookie_name] = parseInt(row.count);
      }

      const bySameSite: Record<string, number> = {};
      for (const row of bySameSiteResult.rows) {
        bySameSite[row.same_site] = parseInt(row.count);
      }

      return {
        totalCookies,
        secureCookies,
        nonSecureCookies: totalCookies - secureCookies,
        httpOnlyCookies,
        byName,
        bySameSite,
      };
    } catch (error) {
      AppLogger.error('Failed to get cookie stats', error as Error);
      return {
        totalCookies: 0,
        secureCookies: 0,
        nonSecureCookies: 0,
        httpOnlyCookies: 0,
        byName: {},
        bySameSite: {},
      };
    }
  }

  /**
   * Get cookies by user
   */
  async getCookiesByUser(userId: string): Promise<CookieTrackingEntry[]> {
    try {
      const result = await this.pool.query(
        `SELECT * FROM cookie_tracking
         WHERE user_id = $1
         ORDER BY last_accessed DESC`,
        [userId]
      );

      return result.rows as CookieTrackingEntry[];
    } catch (error) {
      AppLogger.error('Failed to get cookies by user', error as Error, { userId });
      return [];
    }
  }

  /**
   * Delete all cookies for a user
   */
  async deleteUserCookies(userId: string): Promise<number> {
    try {
      const result = await this.pool.query(
        'DELETE FROM cookie_tracking WHERE user_id = $1',
        [userId]
      );

      const deletedCount = result.rowCount || 0;

      AppLogger.info('User cookies deleted', {
        userId,
        deletedCount,
      });

      return deletedCount;
    } catch (error) {
      AppLogger.error('Failed to delete user cookies', error as Error, { userId });
      return 0;
    }
  }

  /**
   * Find suspicious cookie patterns
   */
  async findSuspiciousPatterns(): Promise<{
    highAccessCookies: any[];
    multiUserIPs: any[];
    nonSecureInProduction: any[];
  }> {
    try {
      // Cookies with abnormally high access count
      const highAccessResult = await this.pool.query(
        `SELECT cookie_name, access_count, created_at, last_accessed
         FROM cookie_tracking
         WHERE access_count > 1000
         ORDER BY access_count DESC
         LIMIT 20`
      );

      // IPs with multiple users
      const multiUserIPResult = await this.pool.query(
        `SELECT ip_address, COUNT(DISTINCT user_id) as user_count, COUNT(*) as cookie_count
         FROM cookie_tracking
         WHERE ip_address IS NOT NULL
         GROUP BY ip_address
         HAVING COUNT(DISTINCT user_id) > 10
         ORDER BY user_count DESC
         LIMIT 20`
      );

      // Non-secure cookies in production
      let nonSecureInProduction: any[] = [];
      if (process.env.NODE_ENV === 'production') {
        const nonSecureResult = await this.pool.query(
          `SELECT cookie_name, COUNT(*) as count
           FROM cookie_tracking
           WHERE is_secure = FALSE
           GROUP BY cookie_name
           ORDER BY count DESC`
        );
        nonSecureInProduction = nonSecureResult.rows;
      }

      return {
        highAccessCookies: highAccessResult.rows,
        multiUserIPs: multiUserIPResult.rows,
        nonSecureInProduction,
      };
    } catch (error) {
      AppLogger.error('Failed to find suspicious patterns', error as Error);
      return {
        highAccessCookies: [],
        multiUserIPs: [],
        nonSecureInProduction: [],
      };
    }
  }

  /**
   * Generate cleanup report
   */
  async generateCleanupReport(): Promise<CookieCleanupStats> {
    try {
      const expiredCount = await this.cleanupExpiredCookies();
      const orphanedCount = await this.cleanupOrphanedCookies();
      const suspiciousCount = await this.cleanupSuspiciousCookies();

      const stats = await this.getCookieStats();

      const report: CookieCleanupStats = {
        expiredCookiesRemoved: expiredCount,
        orphanedCookiesRemoved: orphanedCount,
        suspiciousCookiesRemoved: suspiciousCount,
        totalCookiesTracked: stats.totalCookies,
      };

      AppLogger.info('Cookie cleanup report generated', report);

      return report;
    } catch (error) {
      AppLogger.error('Failed to generate cleanup report', error as Error);
      return {
        expiredCookiesRemoved: 0,
        orphanedCookiesRemoved: 0,
        suspiciousCookiesRemoved: 0,
        totalCookiesTracked: 0,
      };
    }
  }

  /**
   * Validate cookie security compliance
   */
  async validateSecurityCompliance(): Promise<{
    compliant: boolean;
    issues: string[];
    stats: any;
  }> {
    const issues: string[] = [];
    const stats = await this.getCookieStats();

    // Check if all cookies are secure in production
    if (process.env.NODE_ENV === 'production' && stats.nonSecureCookies > 0) {
      issues.push(`${stats.nonSecureCookies} non-secure cookies found in production`);
    }

    // Check HttpOnly usage
    const httpOnlyPercentage = (stats.httpOnlyCookies / stats.totalCookies) * 100;
    if (httpOnlyPercentage < 80) {
      issues.push(
        `Only ${httpOnlyPercentage.toFixed(1)}% of cookies have HttpOnly flag`
      );
    }

    // Check SameSite usage
    const sameSiteTotal = Object.values(stats.bySameSite).reduce(
      (sum, count) => sum + count,
      0
    );
    const sameSitePercentage = (sameSiteTotal / stats.totalCookies) * 100;
    if (sameSitePercentage < 90) {
      issues.push(
        `Only ${sameSitePercentage.toFixed(1)}% of cookies have SameSite attribute`
      );
    }

    return {
      compliant: issues.length === 0,
      issues,
      stats,
    };
  }

  /**
   * Shutdown cleanup service
   */
  shutdown(): void {
    this.stopAutomatedCleanup();
    AppLogger.info('Cookie cleanup service shut down');
  }
}

/**
 * Singleton instance
 */
let cookieCleanupService: CookieCleanupService | null = null;

export function initializeCookieCleanup(pool: Pool): CookieCleanupService {
  cookieCleanupService = new CookieCleanupService(pool);
  cookieCleanupService.startAutomatedCleanup();
  return cookieCleanupService;
}

export function getCookieCleanup(): CookieCleanupService {
  if (!cookieCleanupService) {
    throw new Error(
      'CookieCleanupService not initialized. Call initializeCookieCleanup first.'
    );
  }
  return cookieCleanupService;
}
