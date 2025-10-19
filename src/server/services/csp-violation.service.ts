import { Pool } from 'pg';
import { AppLogger } from './logger.service.js';
import crypto from 'crypto';

/**
 * CSP Violation Logging Service
 * Handles Content Security Policy violation reporting and analysis
 */

export interface CSPViolationReport {
  // CSP Report Fields (from browser)
  'document-uri': string;
  'violated-directive': string;
  'effective-directive'?: string;
  'original-policy'?: string;
  'blocked-uri'?: string;
  'status-code'?: number;
  'source-file'?: string;
  'line-number'?: number;
  'column-number'?: number;
  referrer?: string;
  disposition?: 'enforce' | 'report';
  'script-sample'?: string;
}

export interface CSPViolationEntry {
  id: string;
  documentUri: string;
  violatedDirective: string;
  effectiveDirective?: string;
  originalPolicy?: string;
  blockedUri?: string;
  statusCode?: number;
  sourceFile?: string;
  lineNumber?: number;
  columnNumber?: number;
  referrer?: string;
  userAgent?: string;
  ipAddress?: string;
  userId?: string;
  disposition?: string;
  scriptSample?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  isReviewed: boolean;
  isFalsePositive: boolean;
  notes?: string;
  createdAt: Date;
}

export interface CSPViolationPattern {
  id: string;
  patternHash: string;
  violatedDirective: string;
  blockedUri?: string;
  documentUri?: string;
  occurrenceCount: number;
  firstSeen: Date;
  lastSeen: Date;
  isWhitelisted: boolean;
  isCritical: boolean;
  actionTaken?: string;
  notes?: string;
}

export interface CSPViolationStats {
  totalViolations: number;
  uniquePatterns: number;
  criticalViolations: number;
  unreviewedViolations: number;
  topDirective?: string;
  topBlockedUri?: string;
  violationsByDirective: Record<string, number>;
  violationsBySeverity: Record<string, number>;
}

export class CSPViolationService {
  private pool: Pool;
  private severityThresholds = {
    criticalDirectives: ['script-src', 'default-src', 'object-src'],
    highRiskUris: ['eval', 'inline', 'data:', 'unsafe-'],
  };

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Log CSP violation from browser report
   */
  async logViolation(
    report: CSPViolationReport,
    context: {
      userAgent?: string;
      ipAddress?: string;
      userId?: string;
    }
  ): Promise<string> {
    try {
      // Determine severity
      const severity = this.calculateSeverity(report);

      // Insert violation
      const result = await this.pool.query(
        `INSERT INTO csp_violations (
          document_uri, violated_directive, effective_directive,
          original_policy, blocked_uri, status_code,
          source_file, line_number, column_number,
          referrer, user_agent, ip_address, user_id,
          disposition, script_sample, severity
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        RETURNING id`,
        [
          report['document-uri'],
          report['violated-directive'],
          report['effective-directive'] || null,
          report['original-policy'] || null,
          report['blocked-uri'] || null,
          report['status-code'] || null,
          report['source-file'] || null,
          report['line-number'] || null,
          report['column-number'] || null,
          report.referrer || null,
          context.userAgent || null,
          context.ipAddress || null,
          context.userId || null,
          report.disposition || 'enforce',
          report['script-sample'] || null,
          severity,
        ]
      );

      const violationId = result.rows[0].id;

      // Log to application logger
      AppLogger.warn('CSP violation detected', {
        violationId,
        directive: report['violated-directive'],
        blockedUri: report['blocked-uri'],
        documentUri: report['document-uri'],
        severity,
        disposition: report.disposition,
      });

      // Log security event
      AppLogger.logSecurityEvent('csp.violation', severity, {
        violationId,
        directive: report['violated-directive'],
        blockedUri: report['blocked-uri'],
        userId: context.userId,
        ipAddress: context.ipAddress,
      });

      return violationId;
    } catch (error) {
      AppLogger.error('Failed to log CSP violation', error as Error, {
        directive: report['violated-directive'],
      });
      throw error;
    }
  }

  /**
   * Calculate severity based on violation details
   */
  private calculateSeverity(
    report: CSPViolationReport
  ): 'low' | 'medium' | 'high' | 'critical' {
    const directive = report['violated-directive'];
    const blockedUri = report['blocked-uri'] || '';

    // Critical: script-src, default-src, object-src violations
    if (this.severityThresholds.criticalDirectives.some((d) => directive.includes(d))) {
      return 'critical';
    }

    // High: unsafe-inline, unsafe-eval, data: URIs
    if (this.severityThresholds.highRiskUris.some((uri) => blockedUri.includes(uri))) {
      return 'high';
    }

    // High: Script samples (inline script blocked)
    if (report['script-sample']) {
      return 'high';
    }

    // Medium: Other directive violations
    if (directive.includes('style-src') || directive.includes('img-src')) {
      return 'medium';
    }

    // Low: Everything else
    return 'low';
  }

  /**
   * Get violation by ID
   */
  async getViolation(violationId: string): Promise<CSPViolationEntry | null> {
    try {
      const result = await this.pool.query(
        'SELECT * FROM csp_violations WHERE id = $1',
        [violationId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapToEntry(result.rows[0]);
    } catch (error) {
      AppLogger.error('Failed to get CSP violation', error as Error, { violationId });
      throw error;
    }
  }

  /**
   * Get recent violations
   */
  async getRecentViolations(limit: number = 100): Promise<CSPViolationEntry[]> {
    try {
      const result = await this.pool.query(
        `SELECT * FROM csp_violations
         ORDER BY created_at DESC
         LIMIT $1`,
        [limit]
      );

      return result.rows.map((row) => this.mapToEntry(row));
    } catch (error) {
      AppLogger.error('Failed to get recent CSP violations', error as Error);
      throw error;
    }
  }

  /**
   * Get critical violations
   */
  async getCriticalViolations(): Promise<CSPViolationEntry[]> {
    try {
      const result = await this.pool.query(
        `SELECT * FROM critical_csp_violations`
      );

      return result.rows.map((row) => this.mapToEntry(row));
    } catch (error) {
      AppLogger.error('Failed to get critical CSP violations', error as Error);
      throw error;
    }
  }

  /**
   * Get violation patterns
   */
  async getViolationPatterns(minOccurrences: number = 5): Promise<CSPViolationPattern[]> {
    try {
      const result = await this.pool.query(
        `SELECT * FROM csp_violation_patterns
         WHERE occurrence_count >= $1
         ORDER BY occurrence_count DESC, last_seen DESC
         LIMIT 50`,
        [minOccurrences]
      );

      return result.rows.map((row) => this.mapToPattern(row));
    } catch (error) {
      AppLogger.error('Failed to get CSP violation patterns', error as Error);
      throw error;
    }
  }

  /**
   * Get violation statistics
   */
  async getViolationStats(days: number = 7): Promise<CSPViolationStats> {
    try {
      // Get overall stats
      const statsResult = await this.pool.query(
        'SELECT * FROM get_csp_violation_stats($1)',
        [days]
      );

      const stats = statsResult.rows[0];

      // Get violations by directive
      const directiveResult = await this.pool.query(
        `SELECT violated_directive, COUNT(*) as count
         FROM csp_violations
         WHERE created_at >= NOW() - INTERVAL '${days} days'
         GROUP BY violated_directive
         ORDER BY count DESC`,
        []
      );

      const violationsByDirective: Record<string, number> = {};
      for (const row of directiveResult.rows) {
        violationsByDirective[row.violated_directive] = parseInt(row.count);
      }

      // Get violations by severity
      const severityResult = await this.pool.query(
        `SELECT severity, COUNT(*) as count
         FROM csp_violations
         WHERE created_at >= NOW() - INTERVAL '${days} days'
         GROUP BY severity`,
        []
      );

      const violationsBySeverity: Record<string, number> = {};
      for (const row of severityResult.rows) {
        violationsBySeverity[row.severity] = parseInt(row.count);
      }

      return {
        totalViolations: parseInt(stats.total_violations || '0'),
        uniquePatterns: parseInt(stats.unique_patterns || '0'),
        criticalViolations: parseInt(stats.critical_violations || '0'),
        unreviewedViolations: parseInt(stats.unreviewed_violations || '0'),
        topDirective: stats.top_directive,
        topBlockedUri: stats.top_blocked_uri,
        violationsByDirective,
        violationsBySeverity,
      };
    } catch (error) {
      AppLogger.error('Failed to get CSP violation stats', error as Error);
      throw error;
    }
  }

  /**
   * Mark violation as reviewed
   */
  async markAsReviewed(
    violationId: string,
    reviewedBy: string,
    isFalsePositive: boolean = false,
    notes?: string
  ): Promise<void> {
    try {
      await this.pool.query(
        `UPDATE csp_violations
         SET is_reviewed = TRUE,
             reviewed_at = NOW(),
             reviewed_by = $2,
             is_false_positive = $3,
             notes = $4
         WHERE id = $1`,
        [violationId, reviewedBy, isFalsePositive, notes || null]
      );

      AppLogger.info('CSP violation marked as reviewed', {
        violationId,
        reviewedBy,
        isFalsePositive,
      });
    } catch (error) {
      AppLogger.error('Failed to mark CSP violation as reviewed', error as Error, {
        violationId,
      });
      throw error;
    }
  }

  /**
   * Whitelist a violation pattern
   */
  async whitelistPattern(patternId: string, notes?: string): Promise<void> {
    try {
      await this.pool.query(
        `UPDATE csp_violation_patterns
         SET is_whitelisted = TRUE,
             action_taken = 'whitelisted',
             notes = $2,
             updated_at = NOW()
         WHERE id = $1`,
        [patternId, notes || null]
      );

      AppLogger.info('CSP violation pattern whitelisted', { patternId });
    } catch (error) {
      AppLogger.error('Failed to whitelist CSP violation pattern', error as Error, {
        patternId,
      });
      throw error;
    }
  }

  /**
   * Mark pattern as critical
   */
  async markPatternAsCritical(patternId: string): Promise<void> {
    try {
      await this.pool.query(
        `UPDATE csp_violation_patterns
         SET is_critical = TRUE,
             updated_at = NOW()
         WHERE id = $1`,
        [patternId]
      );

      AppLogger.warn('CSP violation pattern marked as critical', { patternId });
    } catch (error) {
      AppLogger.error('Failed to mark pattern as critical', error as Error, { patternId });
      throw error;
    }
  }

  /**
   * Cleanup old violations
   */
  async cleanupOldViolations(retentionDays: number = 90): Promise<number> {
    try {
      const result = await this.pool.query(
        'SELECT cleanup_old_csp_violations($1)',
        [retentionDays]
      );

      const deletedCount = result.rows[0].cleanup_old_csp_violations;

      AppLogger.info('Old CSP violations cleaned up', {
        deletedCount,
        retentionDays,
      });

      return deletedCount;
    } catch (error) {
      AppLogger.error('Failed to cleanup old CSP violations', error as Error);
      throw error;
    }
  }

  /**
   * Generate violation hash for pattern matching
   */
  private generatePatternHash(
    violatedDirective: string,
    blockedUri?: string,
    documentUri?: string
  ): string {
    const combined =
      (violatedDirective || '') + '||' +
      (blockedUri || '') + '||' +
      (documentUri || '');

    return crypto.createHash('sha256').update(combined).digest('hex');
  }

  /**
   * Map database row to violation entry
   */
  private mapToEntry(row: any): CSPViolationEntry {
    return {
      id: row.id,
      documentUri: row.document_uri,
      violatedDirective: row.violated_directive,
      effectiveDirective: row.effective_directive,
      originalPolicy: row.original_policy,
      blockedUri: row.blocked_uri,
      statusCode: row.status_code,
      sourceFile: row.source_file,
      lineNumber: row.line_number,
      columnNumber: row.column_number,
      referrer: row.referrer,
      userAgent: row.user_agent,
      ipAddress: row.ip_address,
      userId: row.user_id,
      disposition: row.disposition,
      scriptSample: row.script_sample,
      severity: row.severity,
      isReviewed: row.is_reviewed,
      isFalsePositive: row.is_false_positive,
      notes: row.notes,
      createdAt: row.created_at,
    };
  }

  /**
   * Map database row to violation pattern
   */
  private mapToPattern(row: any): CSPViolationPattern {
    return {
      id: row.id,
      patternHash: row.pattern_hash,
      violatedDirective: row.violated_directive,
      blockedUri: row.blocked_uri,
      documentUri: row.document_uri,
      occurrenceCount: row.occurrence_count,
      firstSeen: row.first_seen,
      lastSeen: row.last_seen,
      isWhitelisted: row.is_whitelisted,
      isCritical: row.is_critical,
      actionTaken: row.action_taken,
      notes: row.notes,
    };
  }
}

/**
 * Singleton instance
 */
let cspViolationService: CSPViolationService | null = null;

export function initializeCSPViolationService(pool: Pool): CSPViolationService {
  cspViolationService = new CSPViolationService(pool);
  return cspViolationService;
}

export function getCSPViolationService(): CSPViolationService {
  if (!cspViolationService) {
    throw new Error(
      'CSPViolationService not initialized. Call initializeCSPViolationService first.'
    );
  }
  return cspViolationService;
}
