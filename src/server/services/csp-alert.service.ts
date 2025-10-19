import { Pool } from 'pg';
import { AppLogger } from './logger.service.js';
import { getCSPViolationService } from './csp-violation.service.js';
import { getNotificationService } from './notification.service.js';
import cron from 'node-cron';

/**
 * CSP Violation Alert Service
 * Generates and manages alerts for CSP violations
 */

export interface CSPAlert {
  id: string;
  alertType: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  violationId?: string;
  patternId?: string;
  isAcknowledged: boolean;
  acknowledgedAt?: Date;
  acknowledgedBy?: string;
  notificationSent: boolean;
  notificationSentAt?: Date;
  notificationMethod?: string;
  createdAt: Date;
}

export interface AlertThresholds {
  criticalViolationCount: number; // Alert if critical violations exceed this in 1 hour
  patternOccurrenceCount: number; // Alert if same pattern occurs this many times
  uniqueViolationsPerHour: number; // Alert if too many unique violations
  totalViolationsPerHour: number; // Alert if total violations exceed this
}

export class CSPAlertService {
  private pool: Pool;
  private thresholds: AlertThresholds;
  private notificationEnabled: boolean;

  constructor(pool: Pool, options: {
    thresholds?: Partial<AlertThresholds>;
    notificationEnabled?: boolean;
  } = {}) {
    this.pool = pool;
    this.notificationEnabled = options.notificationEnabled !== false;

    this.thresholds = {
      criticalViolationCount: 10,
      patternOccurrenceCount: 50,
      uniqueViolationsPerHour: 20,
      totalViolationsPerHour: 100,
      ...options.thresholds,
    };

    this.setupAutomatedAlertChecks();
  }

  /**
   * Setup automated alert checking cron jobs
   */
  private setupAutomatedAlertChecks(): void {
    // Check for threshold violations every 15 minutes
    cron.schedule('*/15 * * * *', async () => {
      await this.checkThresholds();
    });

    // Daily summary report
    cron.schedule('0 9 * * *', async () => {
      await this.generateDailySummary();
    });
  }

  /**
   * Check and create alerts for a new violation
   */
  async checkAndCreateAlerts(violationId: string): Promise<void> {
    try {
      const cspService = getCSPViolationService();
      const violation = await cspService.getViolation(violationId);

      if (!violation) {
        return;
      }

      // Check if violation is critical
      if (violation.severity === 'critical') {
        await this.createAlert({
          alertType: 'critical_violation',
          severity: 'critical',
          message: `Critical CSP violation detected: ${violation.violatedDirective} blocked ${violation.blockedUri || 'resource'}`,
          violationId,
        });
      }

      // Check if this creates a new pattern
      await this.checkNewPattern(violation);
    } catch (error) {
      AppLogger.error('Failed to check and create alerts', error as Error, { violationId });
    }
  }

  /**
   * Check for new violation patterns
   */
  private async checkNewPattern(violation: any): Promise<void> {
    try {
      const result = await this.pool.query(
        `SELECT * FROM csp_violation_patterns
         WHERE violated_directive = $1
         AND blocked_uri = $2
         AND document_uri = $3`,
        [violation.violatedDirective, violation.blockedUri, violation.documentUri]
      );

      // If pattern is new (first occurrence)
      if (result.rows.length > 0 && result.rows[0].occurrence_count === 1) {
        await this.createAlert({
          alertType: 'new_pattern',
          severity: 'medium',
          message: `New CSP violation pattern detected: ${violation.violatedDirective}`,
          violationId: violation.id,
          patternId: result.rows[0].id,
        });
      }
    } catch (error) {
      AppLogger.error('Failed to check new pattern', error as Error);
    }
  }

  /**
   * Check all thresholds and create alerts if exceeded
   */
  async checkThresholds(): Promise<void> {
    try {
      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      // Check critical violation count
      const criticalResult = await this.pool.query(
        `SELECT COUNT(*) as count FROM csp_violations
         WHERE severity = 'critical'
         AND created_at >= $1`,
        [oneHourAgo]
      );

      const criticalCount = parseInt(criticalResult.rows[0].count);
      if (criticalCount >= this.thresholds.criticalViolationCount) {
        await this.createAlert({
          alertType: 'threshold_exceeded',
          severity: 'high',
          message: `Critical violation threshold exceeded: ${criticalCount} critical violations in the last hour (threshold: ${this.thresholds.criticalViolationCount})`,
        });
      }

      // Check total violations
      const totalResult = await this.pool.query(
        `SELECT COUNT(*) as count FROM csp_violations
         WHERE created_at >= $1`,
        [oneHourAgo]
      );

      const totalCount = parseInt(totalResult.rows[0].count);
      if (totalCount >= this.thresholds.totalViolationsPerHour) {
        await this.createAlert({
          alertType: 'threshold_exceeded',
          severity: 'medium',
          message: `Total violation threshold exceeded: ${totalCount} violations in the last hour (threshold: ${this.thresholds.totalViolationsPerHour})`,
        });
      }

      // Check pattern occurrence count
      const patternResult = await this.pool.query(
        `SELECT * FROM csp_violation_patterns
         WHERE occurrence_count >= $1
         AND is_whitelisted = FALSE
         AND last_seen >= $2`,
        [this.thresholds.patternOccurrenceCount, oneHourAgo]
      );

      for (const pattern of patternResult.rows) {
        await this.createAlert({
          alertType: 'pattern_threshold_exceeded',
          severity: 'high',
          message: `Violation pattern exceeded threshold: ${pattern.violated_directive} occurred ${pattern.occurrence_count} times (threshold: ${this.thresholds.patternOccurrenceCount})`,
          patternId: pattern.id,
        });
      }

      AppLogger.debug('CSP threshold check completed', {
        criticalCount,
        totalCount,
        patternsExceeded: patternResult.rows.length,
      });
    } catch (error) {
      AppLogger.error('Failed to check CSP thresholds', error as Error);
    }
  }

  /**
   * Create a new alert
   */
  async createAlert(alert: {
    alertType: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    message: string;
    violationId?: string;
    patternId?: string;
  }): Promise<string> {
    try {
      // Check if similar alert already exists recently (prevent spam)
      const recentResult = await this.pool.query(
        `SELECT * FROM csp_violation_alerts
         WHERE alert_type = $1
         AND message = $2
         AND created_at >= NOW() - INTERVAL '1 hour'
         LIMIT 1`,
        [alert.alertType, alert.message]
      );

      if (recentResult.rows.length > 0) {
        AppLogger.debug('Duplicate alert suppressed', {
          alertType: alert.alertType,
        });
        return recentResult.rows[0].id;
      }

      // Create new alert
      const result = await this.pool.query(
        `INSERT INTO csp_violation_alerts (
          alert_type, severity, message, violation_id, pattern_id
        ) VALUES ($1, $2, $3, $4, $5)
        RETURNING id`,
        [
          alert.alertType,
          alert.severity,
          alert.message,
          alert.violationId || null,
          alert.patternId || null,
        ]
      );

      const alertId = result.rows[0].id;

      AppLogger.warn('CSP alert created', {
        alertId,
        alertType: alert.alertType,
        severity: alert.severity,
      });

      // Log security event
      AppLogger.logSecurityEvent(`csp.alert.${alert.alertType}`, alert.severity, {
        alertId,
        message: alert.message,
        violationId: alert.violationId,
        patternId: alert.patternId,
      });

      // Send notification if enabled
      if (this.notificationEnabled) {
        await this.sendNotification(alertId, {
          ...alert,
          violationId: alert.violationId,
          patternId: alert.patternId,
          alertType: alert.alertType,
        });
      }

      return alertId;
    } catch (error) {
      AppLogger.error('Failed to create CSP alert', error as Error, {
        alertType: alert.alertType,
      });
      throw error;
    }
  }

  /**
   * Send notification for alert
   */
  private async sendNotification(
    alertId: string,
    alert: {
      severity: string;
      message: string;
      alertType?: string;
      violationId?: string;
      patternId?: string;
    }
  ): Promise<void> {
    try {
      const notificationService = getNotificationService();
      const priority = this.mapSeverityToPriority(alert.severity);

      // Get additional context
      let details: Record<string, any> = {
        'Alert ID': alertId,
        'Severity': alert.severity,
        'Alert Type': alert.alertType || 'Unknown',
        'Time': new Date().toLocaleString(),
      };

      if (alert.violationId) {
        details['Violation ID'] = alert.violationId;
      }

      if (alert.patternId) {
        details['Pattern ID'] = alert.patternId;
      }

      // Send to all configured channels
      const results = await notificationService.sendAll(
        {
          subject: `[CSP Alert] ${alert.severity.toUpperCase()} - ${alert.message.substring(0, 50)}`,
          message: alert.message,
          details,
        },
        {
          priority,
          deduplicationKey: `csp-alert-${alertId}`,
          rateLimitKey: `csp-${alert.severity}`,
        }
      );

      // Determine which methods succeeded
      const methods: string[] = [];
      if (results.email) methods.push('email');
      if (results.slack) methods.push('slack');
      if (results.discord) methods.push('discord');

      const notificationMethod = methods.length > 0 ? methods.join(',') : 'none';

      AppLogger.info('CSP alert notification sent', {
        alertId,
        severity: alert.severity,
        methods: notificationMethod,
        email: results.email,
        slack: results.slack,
        discord: results.discord,
      });

      // Mark notification as sent
      await this.pool.query(
        `UPDATE csp_violation_alerts
         SET notification_sent = TRUE,
             notification_sent_at = NOW(),
             notification_method = $2
         WHERE id = $1`,
        [alertId, notificationMethod]
      );
    } catch (error) {
      AppLogger.error('Failed to send CSP alert notification', error as Error, { alertId });

      // Still mark as attempted
      await this.pool.query(
        `UPDATE csp_violation_alerts
         SET notification_sent = FALSE,
             notification_method = 'failed'
         WHERE id = $1`,
        [alertId]
      ).catch(() => {});
    }
  }

  /**
   * Map severity to notification priority
   */
  private mapSeverityToPriority(severity: string): 'low' | 'medium' | 'high' | 'critical' {
    switch (severity.toLowerCase()) {
      case 'critical':
        return 'critical';
      case 'high':
        return 'high';
      case 'medium':
        return 'medium';
      case 'low':
      default:
        return 'low';
    }
  }

  /**
   * Get active alerts
   */
  async getActiveAlerts(): Promise<CSPAlert[]> {
    try {
      const result = await this.pool.query(
        `SELECT * FROM csp_violation_alerts
         WHERE is_acknowledged = FALSE
         ORDER BY created_at DESC
         LIMIT 50`
      );

      return result.rows.map((row) => this.mapToAlert(row));
    } catch (error) {
      AppLogger.error('Failed to get active CSP alerts', error as Error);
      throw error;
    }
  }

  /**
   * Acknowledge alert
   */
  async acknowledgeAlert(alertId: string, acknowledgedBy: string): Promise<void> {
    try {
      await this.pool.query(
        `UPDATE csp_violation_alerts
         SET is_acknowledged = TRUE,
             acknowledged_at = NOW(),
             acknowledged_by = $2
         WHERE id = $1`,
        [alertId, acknowledgedBy]
      );

      AppLogger.info('CSP alert acknowledged', { alertId, acknowledgedBy });
    } catch (error) {
      AppLogger.error('Failed to acknowledge CSP alert', error as Error, { alertId });
      throw error;
    }
  }

  /**
   * Generate daily summary
   */
  async generateDailySummary(): Promise<void> {
    try {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const statsResult = await this.pool.query(
        `SELECT
           COUNT(*) as total_violations,
           COUNT(*) FILTER (WHERE severity = 'critical') as critical_violations,
           COUNT(DISTINCT violated_directive) as unique_directives,
           COUNT(DISTINCT ip_address) as unique_ips
         FROM csp_violations
         WHERE created_at >= $1 AND created_at < $2`,
        [yesterday, today]
      );

      const stats = statsResult.rows[0];

      const summary = {
        date: yesterday.toISOString().split('T')[0],
        totalViolations: parseInt(stats.total_violations),
        criticalViolations: parseInt(stats.critical_violations),
        uniqueDirectives: parseInt(stats.unique_directives),
        uniqueIps: parseInt(stats.unique_ips),
      };

      AppLogger.info('CSP daily summary', summary);

      // Create summary alert if there were significant violations
      if (summary.totalViolations > 100 || summary.criticalViolations > 10) {
        await this.createAlert({
          alertType: 'daily_summary',
          severity: summary.criticalViolations > 10 ? 'high' : 'medium',
          message: `Daily CSP Summary: ${summary.totalViolations} total violations, ${summary.criticalViolations} critical, ${summary.uniqueDirectives} unique directives affected`,
        });
      }
    } catch (error) {
      AppLogger.error('Failed to generate CSP daily summary', error as Error);
    }
  }

  /**
   * Map database row to alert
   */
  private mapToAlert(row: any): CSPAlert {
    return {
      id: row.id,
      alertType: row.alert_type,
      severity: row.severity,
      message: row.message,
      violationId: row.violation_id,
      patternId: row.pattern_id,
      isAcknowledged: row.is_acknowledged,
      acknowledgedAt: row.acknowledged_at,
      acknowledgedBy: row.acknowledged_by,
      notificationSent: row.notification_sent,
      notificationSentAt: row.notification_sent_at,
      notificationMethod: row.notification_method,
      createdAt: row.created_at,
    };
  }
}

/**
 * Singleton instance
 */
let cspAlertService: CSPAlertService | null = null;

export function initializeCSPAlertService(
  pool: Pool,
  options?: {
    thresholds?: Partial<AlertThresholds>;
    notificationEnabled?: boolean;
  }
): CSPAlertService {
  cspAlertService = new CSPAlertService(pool, options);
  return cspAlertService;
}

export function getCSPAlertService(): CSPAlertService {
  if (!cspAlertService) {
    throw new Error('CSPAlertService not initialized. Call initializeCSPAlertService first.');
  }
  return cspAlertService;
}
