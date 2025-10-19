import cron from 'node-cron';
import { Pool } from 'pg';
import APIKeyService from '../services/api-key.service.js';
import { AppLogger } from '../services/logger.service.js';

/**
 * API Key Expiry Check Job
 * Monitors API key expiration and sends notifications
 */

export interface ExpiryNotification {
  apiKeyId: string;
  apiKeyName: string;
  userId: string;
  userEmail: string;
  expiresAt: Date;
  daysUntilExpiry: number;
  keyPrefix: string;
}

export interface ExpiryCheckConfig {
  warningDays: number[]; // Days before expiry to send warnings (e.g., [30, 7, 1])
  checkSchedule: string; // Cron schedule (default: daily at 9 AM)
  autoRevoke: boolean; // Automatically revoke expired keys
  enabled: boolean;
}

export class APIKeyExpiryCheckJob {
  private pool: Pool;
  private apiKeyService: APIKeyService;
  private config: Required<ExpiryCheckConfig>;
  private cronTask: cron.ScheduledTask | null = null;

  constructor(
    pool: Pool,
    config?: Partial<ExpiryCheckConfig>
  ) {
    this.pool = pool;
    this.apiKeyService = new APIKeyService(pool);

    this.config = {
      warningDays: config?.warningDays || [30, 7, 3, 1],
      checkSchedule: config?.checkSchedule || '0 9 * * *', // Daily at 9 AM
      autoRevoke: config?.autoRevoke ?? true,
      enabled: config?.enabled ?? true,
    };
  }

  /**
   * Start the expiry check job
   */
  start(): void {
    if (!this.config.enabled) {
      AppLogger.info('API key expiry check job is disabled');
      return;
    }

    try {
      this.cronTask = cron.schedule(
        this.config.checkSchedule,
        async () => {
          await this.runExpiryCheck();
        },
        {
          scheduled: true,
          timezone: 'UTC',
        }
      );

      AppLogger.info('API key expiry check job started', {
        schedule: this.config.checkSchedule,
        warningDays: this.config.warningDays,
        autoRevoke: this.config.autoRevoke,
      });
    } catch (error) {
      AppLogger.error('Failed to start API key expiry check job', error as Error);
      throw error;
    }
  }

  /**
   * Stop the expiry check job
   */
  stop(): void {
    if (this.cronTask) {
      this.cronTask.stop();
      this.cronTask = null;
      AppLogger.info('API key expiry check job stopped');
    }
  }

  /**
   * Run expiry check manually
   */
  async runExpiryCheck(): Promise<{
    expiredKeys: number;
    warningsSent: number;
    revoked: number;
  }> {
    const startTime = Date.now();

    try {
      AppLogger.info('Running API key expiry check');

      let expiredKeys = 0;
      let warningsSent = 0;
      let revoked = 0;

      // Check for expired keys
      const expired = await this.getExpiredKeys();
      expiredKeys = expired.length;

      if (expired.length > 0) {
        AppLogger.info(`Found ${expired.length} expired API keys`);

        for (const key of expired) {
          // Send expiration notification
          await this.sendExpiryNotification(key);

          // Auto-revoke if enabled
          if (this.config.autoRevoke && !key.revoked) {
            try {
              await this.apiKeyService.revokeAPIKey(
                key.id,
                key.userId,
                'system',
                'Automatically revoked due to expiration'
              );
              revoked++;

              AppLogger.info('API key auto-revoked', {
                apiKeyId: key.id,
                apiKeyName: key.name,
                userId: key.userId,
              });
            } catch (error) {
              AppLogger.error('Failed to auto-revoke API key', error as Error, {
                apiKeyId: key.id,
              });
            }
          }
        }
      }

      // Check for keys expiring soon
      for (const days of this.config.warningDays) {
        const expiringKeys = await this.getKeysExpiringIn(days);

        if (expiringKeys.length > 0) {
          AppLogger.info(`Found ${expiringKeys.length} keys expiring in ${days} days`);

          for (const key of expiringKeys) {
            // Check if we already sent a notification for this warning period
            const alreadySent = await this.hasWarningBeenSent(key.apiKeyId, days);

            if (!alreadySent) {
              await this.sendWarningNotification(key);
              await this.markWarningAsSent(key.apiKeyId, days);
              warningsSent++;
            }
          }
        }
      }

      const duration = Date.now() - startTime;

      AppLogger.info('API key expiry check completed', {
        expiredKeys,
        warningsSent,
        revoked,
        durationMs: duration,
      });

      return { expiredKeys, warningsSent, revoked };
    } catch (error) {
      AppLogger.error('API key expiry check failed', error as Error);
      throw error;
    }
  }

  /**
   * Get expired API keys
   */
  private async getExpiredKeys(): Promise<
    Array<{
      id: string;
      name: string;
      userId: string;
      userEmail: string;
      expiresAt: Date;
      keyPrefix: string;
      revoked: boolean;
    }>
  > {
    try {
      const result = await this.pool.query(
        `SELECT
          ak.id,
          ak.name,
          ak.user_id,
          u.email as user_email,
          ak.expires_at,
          ak.key_prefix,
          ak.revoked
         FROM api_keys ak
         JOIN users u ON ak.user_id = u.id
         WHERE ak.expires_at < NOW()
         AND ak.expires_at IS NOT NULL
         ORDER BY ak.expires_at DESC`
      );

      return result.rows.map((row) => ({
        id: row.id,
        name: row.name,
        userId: row.user_id,
        userEmail: row.user_email,
        expiresAt: row.expires_at,
        keyPrefix: row.key_prefix,
        revoked: row.revoked,
      }));
    } catch (error) {
      AppLogger.error('Failed to get expired keys', error as Error);
      throw error;
    }
  }

  /**
   * Get keys expiring in N days
   */
  private async getKeysExpiringIn(days: number): Promise<ExpiryNotification[]> {
    try {
      const result = await this.pool.query(
        `SELECT
          ak.id as api_key_id,
          ak.name as api_key_name,
          ak.user_id,
          u.email as user_email,
          ak.expires_at,
          ak.key_prefix,
          EXTRACT(DAY FROM ak.expires_at - NOW())::INTEGER as days_until_expiry
         FROM api_keys ak
         JOIN users u ON ak.user_id = u.id
         WHERE ak.expires_at > NOW()
         AND ak.expires_at < NOW() + INTERVAL '${days} days'
         AND ak.expires_at >= NOW() + INTERVAL '${days - 1} days'
         AND ak.revoked = FALSE
         AND ak.expires_at IS NOT NULL
         ORDER BY ak.expires_at ASC`
      );

      return result.rows.map((row) => ({
        apiKeyId: row.api_key_id,
        apiKeyName: row.api_key_name,
        userId: row.user_id,
        userEmail: row.user_email,
        expiresAt: row.expires_at,
        daysUntilExpiry: days,
        keyPrefix: row.key_prefix,
      }));
    } catch (error) {
      AppLogger.error('Failed to get keys expiring soon', error as Error, { days });
      throw error;
    }
  }

  /**
   * Send expiry notification
   */
  private async sendExpiryNotification(key: {
    id: string;
    name: string;
    userId: string;
    userEmail: string;
    expiresAt: Date;
    keyPrefix: string;
  }): Promise<void> {
    try {
      // TODO: Integrate with email service
      AppLogger.info('API key expired notification', {
        apiKeyId: key.id,
        apiKeyName: key.name,
        userId: key.userId,
        userEmail: key.userEmail,
        expiresAt: key.expiresAt,
      });

      // Log to database
      await this.logNotification(key.id, 'expired', key.userId);
    } catch (error) {
      AppLogger.error('Failed to send expiry notification', error as Error, {
        apiKeyId: key.id,
      });
    }
  }

  /**
   * Send warning notification
   */
  private async sendWarningNotification(
    notification: ExpiryNotification
  ): Promise<void> {
    try {
      // TODO: Integrate with email service
      AppLogger.info('API key expiry warning sent', {
        apiKeyId: notification.apiKeyId,
        apiKeyName: notification.apiKeyName,
        userId: notification.userId,
        userEmail: notification.userEmail,
        daysUntilExpiry: notification.daysUntilExpiry,
      });

      // Log to database
      await this.logNotification(
        notification.apiKeyId,
        'warning',
        notification.userId,
        notification.daysUntilExpiry
      );
    } catch (error) {
      AppLogger.error('Failed to send warning notification', error as Error, {
        apiKeyId: notification.apiKeyId,
      });
    }
  }

  /**
   * Check if warning has been sent for this period
   */
  private async hasWarningBeenSent(
    apiKeyId: string,
    days: number
  ): Promise<boolean> {
    try {
      const result = await this.pool.query(
        `SELECT COUNT(*) as count
         FROM api_key_notifications
         WHERE api_key_id = $1
         AND notification_type = 'warning'
         AND warning_days = $2
         AND sent_at >= NOW() - INTERVAL '24 hours'`,
        [apiKeyId, days]
      );

      return result.rows[0].count > 0;
    } catch (error) {
      // If table doesn't exist, create it
      if ((error as any).code === '42P01') {
        await this.createNotificationTable();
        return false;
      }

      AppLogger.error('Failed to check warning status', error as Error);
      return false;
    }
  }

  /**
   * Mark warning as sent
   */
  private async markWarningAsSent(apiKeyId: string, days: number): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO api_key_notifications (api_key_id, notification_type, warning_days)
         VALUES ($1, 'warning', $2)`,
        [apiKeyId, days]
      );
    } catch (error) {
      AppLogger.error('Failed to mark warning as sent', error as Error);
    }
  }

  /**
   * Log notification to database
   */
  private async logNotification(
    apiKeyId: string,
    notificationType: 'warning' | 'expired' | 'revoked',
    userId: string,
    warningDays?: number
  ): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO api_key_notifications (
          api_key_id, notification_type, warning_days, user_id
        ) VALUES ($1, $2, $3, $4)`,
        [apiKeyId, notificationType, warningDays || null, userId]
      );
    } catch (error) {
      // If table doesn't exist, create it
      if ((error as any).code === '42P01') {
        await this.createNotificationTable();
        await this.logNotification(apiKeyId, notificationType, userId, warningDays);
      } else {
        AppLogger.error('Failed to log notification', error as Error);
      }
    }
  }

  /**
   * Create notification tracking table
   */
  private async createNotificationTable(): Promise<void> {
    try {
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS api_key_notifications (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          api_key_id UUID NOT NULL REFERENCES api_keys(id) ON DELETE CASCADE,
          notification_type VARCHAR(20) NOT NULL, -- 'warning', 'expired', 'revoked'
          warning_days INTEGER, -- Days before expiry (for warnings)
          user_id UUID REFERENCES users(id),
          sent_at TIMESTAMP DEFAULT NOW(),
          INDEX idx_api_key_notifications_api_key (api_key_id),
          INDEX idx_api_key_notifications_sent_at (sent_at)
        )
      `);

      AppLogger.info('API key notifications table created');
    } catch (error) {
      AppLogger.error('Failed to create notifications table', error as Error);
    }
  }

  /**
   * Get notification history for API key
   */
  async getNotificationHistory(apiKeyId: string): Promise<
    Array<{
      id: string;
      notificationType: string;
      warningDays?: number;
      sentAt: Date;
    }>
  > {
    try {
      const result = await this.pool.query(
        `SELECT id, notification_type, warning_days, sent_at
         FROM api_key_notifications
         WHERE api_key_id = $1
         ORDER BY sent_at DESC`,
        [apiKeyId]
      );

      return result.rows.map((row) => ({
        id: row.id,
        notificationType: row.notification_type,
        warningDays: row.warning_days,
        sentAt: row.sent_at,
      }));
    } catch (error) {
      AppLogger.error('Failed to get notification history', error as Error);
      return [];
    }
  }

  /**
   * Get expiry statistics
   */
  async getExpiryStatistics(): Promise<{
    totalWithExpiry: number;
    expiredCount: number;
    expiringIn7Days: number;
    expiringIn30Days: number;
    autoRevokedToday: number;
  }> {
    try {
      const result = await this.pool.query(`
        SELECT
          COUNT(*) FILTER (WHERE expires_at IS NOT NULL)::INTEGER as total_with_expiry,
          COUNT(*) FILTER (WHERE expires_at < NOW())::INTEGER as expired_count,
          COUNT(*) FILTER (WHERE expires_at > NOW() AND expires_at < NOW() + INTERVAL '7 days')::INTEGER as expiring_in_7_days,
          COUNT(*) FILTER (WHERE expires_at > NOW() AND expires_at < NOW() + INTERVAL '30 days')::INTEGER as expiring_in_30_days,
          COUNT(*) FILTER (WHERE revoked = TRUE AND revoked_reason LIKE '%Automatically revoked%' AND revoked_at >= NOW() - INTERVAL '24 hours')::INTEGER as auto_revoked_today
        FROM api_keys
      `);

      return {
        totalWithExpiry: result.rows[0].total_with_expiry || 0,
        expiredCount: result.rows[0].expired_count || 0,
        expiringIn7Days: result.rows[0].expiring_in_7_days || 0,
        expiringIn30Days: result.rows[0].expiring_in_30_days || 0,
        autoRevokedToday: result.rows[0].auto_revoked_today || 0,
      };
    } catch (error) {
      AppLogger.error('Failed to get expiry statistics', error as Error);
      throw error;
    }
  }

  /**
   * Get job status
   */
  getStatus(): {
    enabled: boolean;
    running: boolean;
    schedule: string;
    warningDays: number[];
    autoRevoke: boolean;
  } {
    return {
      enabled: this.config.enabled,
      running: this.cronTask !== null,
      schedule: this.config.checkSchedule,
      warningDays: this.config.warningDays,
      autoRevoke: this.config.autoRevoke,
    };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ExpiryCheckConfig>): void {
    const wasRunning = this.cronTask !== null;

    // Stop current job
    if (wasRunning) {
      this.stop();
    }

    // Update config
    this.config = {
      ...this.config,
      ...config,
    };

    // Restart if it was running
    if (wasRunning && this.config.enabled) {
      this.start();
    }

    AppLogger.info('API key expiry check config updated', this.config);
  }
}

/**
 * Singleton instance
 */
let apiKeyExpiryJob: APIKeyExpiryCheckJob | null = null;

export function initializeAPIKeyExpiryJob(
  pool: Pool,
  config?: Partial<ExpiryCheckConfig>
): APIKeyExpiryCheckJob {
  apiKeyExpiryJob = new APIKeyExpiryCheckJob(pool, config);
  return apiKeyExpiryJob;
}

export function getAPIKeyExpiryJob(): APIKeyExpiryCheckJob {
  if (!apiKeyExpiryJob) {
    throw new Error(
      'APIKeyExpiryCheckJob not initialized. Call initializeAPIKeyExpiryJob first.'
    );
  }
  return apiKeyExpiryJob;
}

export function startAPIKeyExpiryJob(
  pool: Pool,
  config?: Partial<ExpiryCheckConfig>
): APIKeyExpiryCheckJob {
  const job = initializeAPIKeyExpiryJob(pool, config);
  job.start();
  return job;
}
