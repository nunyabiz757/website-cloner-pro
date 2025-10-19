import { Pool } from 'pg';
import { AlertingService, SecurityEventForAlert } from './alerting.service.js';
import { AppLogger } from './logger.service.js';

/**
 * GHL-Specific Alerts Service
 *
 * Manages alerts specific to GoHighLevel cloning operations:
 * - High credit consumption
 * - Failed clone attempts
 * - Payment failures
 * - Low credit balance
 * - Suspicious cloning patterns
 */

export interface GHLAlertConfig {
  name: string;
  description: string;
  eventTypes: string[];
  severityLevels: string[];
  thresholdCount: number;
  thresholdWindowMinutes: number;
  cooldownMinutes: number;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  emailEnabled: boolean;
  slackEnabled: boolean;
}

export class GHLAlertsService {
  private pool: Pool;
  private alertingService: AlertingService;

  constructor(pool: Pool, alertingService: AlertingService) {
    this.pool = pool;
    this.alertingService = alertingService;
  }

  /**
   * Initialize all GHL alert configurations
   */
  async initializeGHLAlerts(createdBy?: string): Promise<void> {
    try {
      AppLogger.info('Initializing GHL-specific alert configurations');

      const configs = this.getGHLAlertConfigurations();

      for (const config of configs) {
        await this.createOrUpdateAlert(config, createdBy);
      }

      AppLogger.info('GHL alert configurations initialized', {
        count: configs.length,
      });
    } catch (error) {
      AppLogger.error('Failed to initialize GHL alerts', error as Error);
      throw error;
    }
  }

  /**
   * Get GHL alert configurations
   */
  private getGHLAlertConfigurations(): GHLAlertConfig[] {
    return [
      // Alert 1: High Credit Consumption
      {
        name: 'GHL High Credit Consumption',
        description: 'Alert when a user consumes an unusually high amount of credits in a short period',
        eventTypes: ['ghl_clone_created', 'ghl_template_used'],
        severityLevels: ['medium', 'high'],
        thresholdCount: 50, // 50 clones in window
        thresholdWindowMinutes: 60, // Within 1 hour
        cooldownMinutes: 120, // 2 hour cooldown
        priority: 'high',
        emailEnabled: true,
        slackEnabled: true,
      },

      // Alert 2: Failed Clone Attempts
      {
        name: 'GHL Failed Clone Attempts',
        description: 'Alert when multiple clone attempts fail consecutively',
        eventTypes: ['ghl_clone_failed'],
        severityLevels: ['medium', 'high', 'critical'],
        thresholdCount: 5, // 5 failures
        thresholdWindowMinutes: 30, // Within 30 minutes
        cooldownMinutes: 60, // 1 hour cooldown
        priority: 'medium',
        emailEnabled: true,
        slackEnabled: true,
      },

      // Alert 3: Payment Failure
      {
        name: 'GHL Payment Failure',
        description: 'Alert on payment failures for GHL-related purchases',
        eventTypes: ['payment_failed', 'subscription_payment_failed'],
        severityLevels: ['high', 'critical'],
        thresholdCount: 1, // Immediate alert
        thresholdWindowMinutes: 1,
        cooldownMinutes: 360, // 6 hour cooldown
        priority: 'urgent',
        emailEnabled: true,
        slackEnabled: true,
      },

      // Alert 4: Low Credit Balance
      {
        name: 'GHL Low Credit Balance',
        description: 'Alert when user credit balance falls below threshold',
        eventTypes: ['low_credit_balance'],
        severityLevels: ['low', 'medium'],
        thresholdCount: 1,
        thresholdWindowMinutes: 1,
        cooldownMinutes: 1440, // 24 hour cooldown (daily max)
        priority: 'low',
        emailEnabled: true,
        slackEnabled: false,
      },

      // Alert 5: Suspicious Cloning Pattern
      {
        name: 'GHL Suspicious Cloning Pattern',
        description: 'Alert on potential abuse or bot activity (rapid clones from single IP)',
        eventTypes: ['ghl_clone_created'],
        severityLevels: ['medium', 'high'],
        thresholdCount: 20, // 20 clones
        thresholdWindowMinutes: 10, // Within 10 minutes
        cooldownMinutes: 30, // 30 minute cooldown
        priority: 'high',
        emailEnabled: true,
        slackEnabled: true,
      },

      // Alert 6: Template Abuse
      {
        name: 'GHL Template Excessive Usage',
        description: 'Alert when a single template is used excessively (potential reselling)',
        eventTypes: ['ghl_template_used'],
        severityLevels: ['medium'],
        thresholdCount: 30, // 30 uses
        thresholdWindowMinutes: 60, // Within 1 hour
        cooldownMinutes: 120, // 2 hour cooldown
        priority: 'medium',
        emailEnabled: true,
        slackEnabled: true,
      },

      // Alert 7: Clone Session Expiration (High Volume)
      {
        name: 'GHL High Session Expiration Rate',
        description: 'Alert when many clone sessions expire without completion',
        eventTypes: ['ghl_session_expired'],
        severityLevels: ['low', 'medium'],
        thresholdCount: 10,
        thresholdWindowMinutes: 60,
        cooldownMinutes: 180, // 3 hour cooldown
        priority: 'low',
        emailEnabled: true,
        slackEnabled: false,
      },

      // Alert 8: Asset Download Failures
      {
        name: 'GHL Asset Download Failures',
        description: 'Alert when asset downloads fail repeatedly',
        eventTypes: ['ghl_asset_download_failed'],
        severityLevels: ['medium', 'high'],
        thresholdCount: 10,
        thresholdWindowMinutes: 30,
        cooldownMinutes: 60,
        priority: 'medium',
        emailEnabled: true,
        slackEnabled: true,
      },
    ];
  }

  /**
   * Create or update alert configuration
   */
  private async createOrUpdateAlert(
    config: GHLAlertConfig,
    createdBy?: string
  ): Promise<void> {
    try {
      // Check if alert already exists
      const existing = await this.pool.query(
        'SELECT id, enabled FROM alert_configurations WHERE name = $1',
        [config.name]
      );

      if (existing.rows.length > 0) {
        // Update existing alert
        await this.alertingService.updateAlertConfiguration(existing.rows[0].id, {
          description: config.description,
          eventTypes: config.eventTypes,
          severityLevels: config.severityLevels,
          thresholdCount: config.thresholdCount,
          thresholdWindowMinutes: config.thresholdWindowMinutes,
          cooldownMinutes: config.cooldownMinutes,
          priority: config.priority,
          emailEnabled: config.emailEnabled,
          slackEnabled: config.slackEnabled,
        });

        AppLogger.info('Updated existing GHL alert', { name: config.name });
      } else {
        // Create new alert
        await this.alertingService.createAlertConfiguration({
          name: config.name,
          description: config.description,
          enabled: true,
          eventTypes: config.eventTypes,
          severityLevels: config.severityLevels,
          thresholdCount: config.thresholdCount,
          thresholdWindowMinutes: config.thresholdWindowMinutes,
          emailEnabled: config.emailEnabled,
          emailRecipients: process.env.ALERT_EMAIL_RECIPIENTS?.split(',') || [],
          slackEnabled: config.slackEnabled,
          slackWebhookUrl: process.env.SLACK_WEBHOOK_URL,
          slackChannel: process.env.SLACK_ALERT_CHANNEL || '#ghl-alerts',
          cooldownMinutes: config.cooldownMinutes,
          priority: config.priority,
          includeDetails: true,
          aggregateSimilar: true,
          createdBy,
        });

        AppLogger.info('Created new GHL alert', { name: config.name });
      }
    } catch (error) {
      AppLogger.error('Failed to create/update GHL alert', error as Error, {
        alertName: config.name,
      });
    }
  }

  /**
   * Trigger high credit consumption alert
   */
  async alertHighCreditConsumption(
    userId: string,
    creditsConsumed: number,
    timeWindowMinutes: number
  ): Promise<void> {
    const event: SecurityEventForAlert = {
      id: `ghl_high_credit_${userId}_${Date.now()}`,
      eventType: 'ghl_clone_created',
      severity: creditsConsumed > 100 ? 'high' : 'medium',
      message: `User consumed ${creditsConsumed} credits in ${timeWindowMinutes} minutes`,
      details: {
        userId,
        creditsConsumed,
        timeWindowMinutes,
        ratePerHour: Math.round((creditsConsumed / timeWindowMinutes) * 60),
      },
      userId,
      timestamp: new Date(),
    };

    await this.alertingService.processSecurityEvent(event);
  }

  /**
   * Trigger failed clone attempt alert
   */
  async alertFailedCloneAttempts(
    userId: string,
    failureCount: number,
    errors: string[]
  ): Promise<void> {
    const event: SecurityEventForAlert = {
      id: `ghl_clone_failed_${userId}_${Date.now()}`,
      eventType: 'ghl_clone_failed',
      severity: failureCount > 10 ? 'high' : 'medium',
      message: `${failureCount} clone attempts failed for user`,
      details: {
        userId,
        failureCount,
        errors: errors.slice(0, 5), // Include first 5 errors
        timestamp: new Date().toISOString(),
      },
      userId,
      timestamp: new Date(),
    };

    await this.alertingService.processSecurityEvent(event);
  }

  /**
   * Trigger payment failure alert
   */
  async alertPaymentFailure(
    userId: string,
    amount: number,
    reason: string,
    paymentIntentId?: string
  ): Promise<void> {
    const event: SecurityEventForAlert = {
      id: `payment_failed_${userId}_${Date.now()}`,
      eventType: 'payment_failed',
      severity: 'high',
      message: `Payment of $${amount} failed: ${reason}`,
      details: {
        userId,
        amount,
        reason,
        paymentIntentId,
        timestamp: new Date().toISOString(),
      },
      userId,
      timestamp: new Date(),
    };

    await this.alertingService.processSecurityEvent(event);
  }

  /**
   * Trigger low credit balance alert
   */
  async alertLowCreditBalance(
    userId: string,
    currentBalance: number,
    threshold: number
  ): Promise<void> {
    const event: SecurityEventForAlert = {
      id: `low_credit_${userId}_${Date.now()}`,
      eventType: 'low_credit_balance',
      severity: currentBalance === 0 ? 'medium' : 'low',
      message: `Credit balance (${currentBalance}) below threshold (${threshold})`,
      details: {
        userId,
        currentBalance,
        threshold,
        percentRemaining: Math.round((currentBalance / threshold) * 100),
      },
      userId,
      timestamp: new Date(),
    };

    await this.alertingService.processSecurityEvent(event);
  }

  /**
   * Trigger suspicious cloning pattern alert
   */
  async alertSuspiciousCloning(
    userId: string,
    ipAddress: string,
    cloneCount: number,
    timeWindowMinutes: number
  ): Promise<void> {
    const event: SecurityEventForAlert = {
      id: `suspicious_cloning_${userId}_${Date.now()}`,
      eventType: 'ghl_clone_created',
      severity: 'high',
      message: `Suspicious cloning pattern detected: ${cloneCount} clones in ${timeWindowMinutes} minutes from single IP`,
      details: {
        userId,
        ipAddress,
        cloneCount,
        timeWindowMinutes,
        clonesPerMinute: Math.round(cloneCount / timeWindowMinutes),
      },
      userId,
      ipAddress,
      timestamp: new Date(),
    };

    await this.alertingService.processSecurityEvent(event);
  }

  /**
   * Trigger template excessive usage alert
   */
  async alertTemplateAbuse(
    userId: string,
    templateId: string,
    templateName: string,
    useCount: number
  ): Promise<void> {
    const event: SecurityEventForAlert = {
      id: `template_abuse_${templateId}_${Date.now()}`,
      eventType: 'ghl_template_used',
      severity: 'medium',
      message: `Template "${templateName}" used ${useCount} times in short period`,
      details: {
        userId,
        templateId,
        templateName,
        useCount,
        possibleReselling: useCount > 50,
      },
      userId,
      timestamp: new Date(),
    };

    await this.alertingService.processSecurityEvent(event);
  }

  /**
   * Trigger session expiration alert
   */
  async alertHighSessionExpiration(
    expiredCount: number,
    timeWindowMinutes: number
  ): Promise<void> {
    const event: SecurityEventForAlert = {
      id: `session_expiration_${Date.now()}`,
      eventType: 'ghl_session_expired',
      severity: expiredCount > 20 ? 'medium' : 'low',
      message: `${expiredCount} clone sessions expired without completion`,
      details: {
        expiredCount,
        timeWindowMinutes,
        expirationRate: Math.round(expiredCount / timeWindowMinutes),
      },
      timestamp: new Date(),
    };

    await this.alertingService.processSecurityEvent(event);
  }

  /**
   * Trigger asset download failure alert
   */
  async alertAssetDownloadFailures(
    userId: string,
    clonedPageId: string,
    failedCount: number,
    errors: Array<{ url: string; error: string }>
  ): Promise<void> {
    const event: SecurityEventForAlert = {
      id: `asset_download_failed_${clonedPageId}_${Date.now()}`,
      eventType: 'ghl_asset_download_failed',
      severity: failedCount > 20 ? 'high' : 'medium',
      message: `${failedCount} asset downloads failed for cloned page`,
      details: {
        userId,
        clonedPageId,
        failedCount,
        errors: errors.slice(0, 10), // First 10 errors
      },
      userId,
      timestamp: new Date(),
    };

    await this.alertingService.processSecurityEvent(event);
  }

  /**
   * Check credit consumption and alert if needed
   */
  async checkAndAlertCreditConsumption(userId: string): Promise<void> {
    try {
      // Get credit consumption in last hour
      const result = await this.pool.query(
        `SELECT COUNT(*) as count, SUM(ABS(amount)) as total
         FROM credit_transactions
         WHERE user_id = $1
           AND transaction_type = 'debit'
           AND created_at > NOW() - INTERVAL '1 hour'`,
        [userId]
      );

      const { count, total } = result.rows[0];

      if (total && total > 50) {
        await this.alertHighCreditConsumption(userId, parseInt(total), 60);
      }
    } catch (error) {
      AppLogger.error('Failed to check credit consumption', error as Error, {
        userId,
      });
    }
  }

  /**
   * Check and alert on low credit balance
   */
  async checkAndAlertLowBalance(userId: string, threshold: number = 10): Promise<void> {
    try {
      const result = await this.pool.query(
        'SELECT credits_available FROM credits WHERE user_id = $1',
        [userId]
      );

      if (result.rows.length === 0) {
        return;
      }

      const balance = result.rows[0].credits_available;

      if (balance <= threshold) {
        await this.alertLowCreditBalance(userId, balance, threshold);
      }
    } catch (error) {
      AppLogger.error('Failed to check low balance', error as Error, {
        userId,
      });
    }
  }

  /**
   * Monitor and alert on failed clones
   */
  async monitorFailedClones(): Promise<void> {
    try {
      // Get users with multiple failed clones in last 30 minutes
      const result = await this.pool.query(
        `SELECT
          user_id,
          COUNT(*) as failure_count,
          array_agg(DISTINCT error_message) as errors
         FROM ghl_cloned_pages
         WHERE clone_status = 'failed'
           AND created_at > NOW() - INTERVAL '30 minutes'
         GROUP BY user_id
         HAVING COUNT(*) >= 5`
      );

      for (const row of result.rows) {
        await this.alertFailedCloneAttempts(
          row.user_id,
          parseInt(row.failure_count),
          row.errors || []
        );
      }
    } catch (error) {
      AppLogger.error('Failed to monitor failed clones', error as Error);
    }
  }

  /**
   * Monitor and alert on asset download failures
   */
  async monitorAssetDownloadFailures(): Promise<void> {
    try {
      // Get cloned pages with high asset failure rates
      const result = await this.pool.query(
        `SELECT
          cloned_page_id,
          cp.user_id,
          COUNT(*) as failed_count,
          array_agg(json_build_object('url', original_url, 'error', error_message)) as errors
         FROM ghl_page_assets pa
         JOIN ghl_cloned_pages cp ON pa.cloned_page_id = cp.id
         WHERE pa.download_status = 'failed'
           AND pa.updated_at > NOW() - INTERVAL '30 minutes'
         GROUP BY cloned_page_id, cp.user_id
         HAVING COUNT(*) >= 10`
      );

      for (const row of result.rows) {
        await this.alertAssetDownloadFailures(
          row.user_id,
          row.cloned_page_id,
          parseInt(row.failed_count),
          row.errors || []
        );
      }
    } catch (error) {
      AppLogger.error('Failed to monitor asset download failures', error as Error);
    }
  }

  /**
   * Get alert status for user
   */
  async getUserAlertStatus(userId: string): Promise<{
    recentAlerts: number;
    lastAlertAt: Date | null;
    alertTypes: Record<string, number>;
  }> {
    const result = await this.pool.query(
      `SELECT
        COUNT(*) as total,
        MAX(triggered_at) as last_alert,
        json_object_agg(
          COALESCE(message, 'Unknown'),
          count
        ) as alert_types
       FROM alert_history ah
       JOIN alert_configurations ac ON ah.alert_configuration_id = ac.id
       WHERE ah.triggered_at > NOW() - INTERVAL '24 hours'
         AND ac.name LIKE 'GHL%'
       GROUP BY ah.id`,
      [userId]
    );

    if (result.rows.length === 0) {
      return {
        recentAlerts: 0,
        lastAlertAt: null,
        alertTypes: {},
      };
    }

    return {
      recentAlerts: parseInt(result.rows[0].total) || 0,
      lastAlertAt: result.rows[0].last_alert,
      alertTypes: result.rows[0].alert_types || {},
    };
  }
}

// Singleton instance
let ghlAlertsService: GHLAlertsService | null = null;

export function initializeGHLAlertsService(
  pool: Pool,
  alertingService: AlertingService
): GHLAlertsService {
  if (!ghlAlertsService) {
    ghlAlertsService = new GHLAlertsService(pool, alertingService);
  }
  return ghlAlertsService;
}

export function getGHLAlertsService(): GHLAlertsService {
  if (!ghlAlertsService) {
    throw new Error('GHLAlertsService not initialized');
  }
  return ghlAlertsService;
}

export default GHLAlertsService;
