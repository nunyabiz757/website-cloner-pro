import cron from 'node-cron';
import { Pool } from 'pg';
import { getFileAccessService } from '../services/file-access.service.js';
import { AppLogger } from '../services/logger.service.js';

/**
 * File Access Cleanup Job
 * Cleans up expired tokens and old access logs
 */

export class FileAccessCleanupJob {
  private pool: Pool;
  private tokenCleanupSchedule: string = '0 2 * * *'; // Daily at 2 AM
  private logCleanupSchedule: string = '0 3 * * 0'; // Weekly on Sunday at 3 AM
  private tokenRetentionDays: number = 30;
  private logRetentionDays: number = 90;
  private tokenCleanupTask: cron.ScheduledTask | null = null;
  private logCleanupTask: cron.ScheduledTask | null = null;

  constructor(
    pool: Pool,
    options?: {
      tokenCleanupSchedule?: string;
      logCleanupSchedule?: string;
      tokenRetentionDays?: number;
      logRetentionDays?: number;
    }
  ) {
    this.pool = pool;

    if (options?.tokenCleanupSchedule) {
      this.tokenCleanupSchedule = options.tokenCleanupSchedule;
    }
    if (options?.logCleanupSchedule) {
      this.logCleanupSchedule = options.logCleanupSchedule;
    }
    if (options?.tokenRetentionDays) {
      this.tokenRetentionDays = options.tokenRetentionDays;
    }
    if (options?.logRetentionDays) {
      this.logRetentionDays = options.logRetentionDays;
    }
  }

  /**
   * Start cleanup jobs
   */
  start(): void {
    try {
      // Schedule token cleanup
      this.tokenCleanupTask = cron.schedule(
        this.tokenCleanupSchedule,
        async () => {
          await this.cleanupExpiredTokens();
        },
        {
          scheduled: true,
          timezone: 'UTC',
        }
      );

      // Schedule log cleanup
      this.logCleanupTask = cron.schedule(
        this.logCleanupSchedule,
        async () => {
          await this.cleanupOldLogs();
        },
        {
          scheduled: true,
          timezone: 'UTC',
        }
      );

      AppLogger.info('File access cleanup jobs started', {
        tokenCleanupSchedule: this.tokenCleanupSchedule,
        logCleanupSchedule: this.logCleanupSchedule,
        tokenRetentionDays: this.tokenRetentionDays,
        logRetentionDays: this.logRetentionDays,
      });
    } catch (error) {
      AppLogger.error('Failed to start file access cleanup jobs', error as Error);
      throw error;
    }
  }

  /**
   * Stop cleanup jobs
   */
  stop(): void {
    try {
      if (this.tokenCleanupTask) {
        this.tokenCleanupTask.stop();
        this.tokenCleanupTask = null;
      }

      if (this.logCleanupTask) {
        this.logCleanupTask.stop();
        this.logCleanupTask = null;
      }

      AppLogger.info('File access cleanup jobs stopped');
    } catch (error) {
      AppLogger.error('Failed to stop file access cleanup jobs', error as Error);
    }
  }

  /**
   * Manually trigger token cleanup
   */
  async cleanupExpiredTokens(): Promise<void> {
    const startTime = Date.now();

    try {
      AppLogger.info('Starting expired token cleanup', {
        retentionDays: this.tokenRetentionDays,
      });

      const fileAccessService = getFileAccessService();
      const deletedCount = await fileAccessService.cleanupExpiredTokens(
        this.tokenRetentionDays
      );

      const duration = Date.now() - startTime;

      AppLogger.info('Expired token cleanup completed', {
        deletedCount,
        durationMs: duration,
        retentionDays: this.tokenRetentionDays,
      });

      // Log metrics
      await this.logCleanupMetrics('tokens', deletedCount, duration);
    } catch (error) {
      AppLogger.error('Failed to cleanup expired tokens', error as Error);
      throw error;
    }
  }

  /**
   * Manually trigger log cleanup
   */
  async cleanupOldLogs(): Promise<void> {
    const startTime = Date.now();

    try {
      AppLogger.info('Starting old log cleanup', {
        retentionDays: this.logRetentionDays,
      });

      const fileAccessService = getFileAccessService();
      const deletedCount = await fileAccessService.cleanupOldLogs(
        this.logRetentionDays
      );

      const duration = Date.now() - startTime;

      AppLogger.info('Old log cleanup completed', {
        deletedCount,
        durationMs: duration,
        retentionDays: this.logRetentionDays,
      });

      // Log metrics
      await this.logCleanupMetrics('logs', deletedCount, duration);
    } catch (error) {
      AppLogger.error('Failed to cleanup old logs', error as Error);
      throw error;
    }
  }

  /**
   * Get cleanup statistics
   */
  async getCleanupStats(): Promise<{
    totalExpiredTokens: number;
    totalOldLogs: number;
    activeTokens: number;
    recentLogs: number;
  }> {
    try {
      const result = await this.pool.query(`
        SELECT
          (SELECT COUNT(*) FROM file_access_tokens
           WHERE expires_at < NOW() - INTERVAL '${this.tokenRetentionDays} days') as expired_tokens,
          (SELECT COUNT(*) FROM file_access_logs
           WHERE accessed_at < NOW() - INTERVAL '${this.logRetentionDays} days') as old_logs,
          (SELECT COUNT(*) FROM file_access_tokens
           WHERE expires_at > NOW() AND is_revoked = FALSE) as active_tokens,
          (SELECT COUNT(*) FROM file_access_logs
           WHERE accessed_at >= NOW() - INTERVAL '7 days') as recent_logs
      `);

      return {
        totalExpiredTokens: parseInt(result.rows[0].expired_tokens),
        totalOldLogs: parseInt(result.rows[0].old_logs),
        activeTokens: parseInt(result.rows[0].active_tokens),
        recentLogs: parseInt(result.rows[0].recent_logs),
      };
    } catch (error) {
      AppLogger.error('Failed to get cleanup stats', error as Error);
      throw error;
    }
  }

  /**
   * Check if immediate cleanup is needed
   */
  async checkCleanupNeeded(): Promise<{
    tokensNeedCleanup: boolean;
    logsNeedCleanup: boolean;
    stats: Awaited<ReturnType<typeof this.getCleanupStats>>;
  }> {
    try {
      const stats = await this.getCleanupStats();

      const tokenThreshold = 1000; // Cleanup if > 1000 expired tokens
      const logThreshold = 10000; // Cleanup if > 10000 old logs

      return {
        tokensNeedCleanup: stats.totalExpiredTokens > tokenThreshold,
        logsNeedCleanup: stats.totalOldLogs > logThreshold,
        stats,
      };
    } catch (error) {
      AppLogger.error('Failed to check cleanup needs', error as Error);
      throw error;
    }
  }

  /**
   * Run full cleanup (tokens and logs)
   */
  async runFullCleanup(): Promise<{
    tokensDeleted: number;
    logsDeleted: number;
    duration: number;
  }> {
    const startTime = Date.now();

    try {
      AppLogger.info('Starting full file access cleanup');

      // Cleanup tokens
      const fileAccessService = getFileAccessService();
      const tokensDeleted = await fileAccessService.cleanupExpiredTokens(
        this.tokenRetentionDays
      );

      // Cleanup logs
      const logsDeleted = await fileAccessService.cleanupOldLogs(
        this.logRetentionDays
      );

      const duration = Date.now() - startTime;

      AppLogger.info('Full cleanup completed', {
        tokensDeleted,
        logsDeleted,
        durationMs: duration,
      });

      return {
        tokensDeleted,
        logsDeleted,
        duration,
      };
    } catch (error) {
      AppLogger.error('Failed to run full cleanup', error as Error);
      throw error;
    }
  }

  /**
   * Refresh file access analytics materialized view
   */
  async refreshAnalytics(): Promise<void> {
    try {
      AppLogger.info('Refreshing file access analytics');

      await this.pool.query('SELECT refresh_file_access_analytics()');

      AppLogger.info('File access analytics refreshed');
    } catch (error) {
      AppLogger.error('Failed to refresh file access analytics', error as Error);
      throw error;
    }
  }

  /**
   * Log cleanup metrics to database
   */
  private async logCleanupMetrics(
    type: 'tokens' | 'logs',
    deletedCount: number,
    durationMs: number
  ): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO system_metrics (
          metric_name, metric_value, metric_type, metadata, created_at
        ) VALUES ($1, $2, $3, $4, NOW())`,
        [
          `file_access_cleanup_${type}`,
          deletedCount,
          'cleanup',
          JSON.stringify({
            durationMs,
            retentionDays:
              type === 'tokens' ? this.tokenRetentionDays : this.logRetentionDays,
          }),
        ]
      );
    } catch (error) {
      // Don't throw - metrics logging is not critical
      AppLogger.debug('Failed to log cleanup metrics', {
        error: (error as Error).message,
      });
    }
  }

  /**
   * Get job status
   */
  getStatus(): {
    tokenCleanupActive: boolean;
    logCleanupActive: boolean;
    tokenCleanupSchedule: string;
    logCleanupSchedule: string;
    tokenRetentionDays: number;
    logRetentionDays: number;
  } {
    return {
      tokenCleanupActive: this.tokenCleanupTask !== null,
      logCleanupActive: this.logCleanupTask !== null,
      tokenCleanupSchedule: this.tokenCleanupSchedule,
      logCleanupSchedule: this.logCleanupSchedule,
      tokenRetentionDays: this.tokenRetentionDays,
      logRetentionDays: this.logRetentionDays,
    };
  }
}

/**
 * Singleton instance
 */
let fileAccessCleanupJob: FileAccessCleanupJob | null = null;

export function initializeFileAccessCleanupJob(
  pool: Pool,
  options?: {
    tokenCleanupSchedule?: string;
    logCleanupSchedule?: string;
    tokenRetentionDays?: number;
    logRetentionDays?: number;
  }
): FileAccessCleanupJob {
  fileAccessCleanupJob = new FileAccessCleanupJob(pool, options);
  return fileAccessCleanupJob;
}

export function getFileAccessCleanupJob(): FileAccessCleanupJob {
  if (!fileAccessCleanupJob) {
    throw new Error(
      'FileAccessCleanupJob not initialized. Call initializeFileAccessCleanupJob first.'
    );
  }
  return fileAccessCleanupJob;
}

export function startFileAccessCleanupJob(
  pool: Pool,
  options?: {
    tokenCleanupSchedule?: string;
    logCleanupSchedule?: string;
    tokenRetentionDays?: number;
    logRetentionDays?: number;
  }
): FileAccessCleanupJob {
  const job = initializeFileAccessCleanupJob(pool, options);
  job.start();
  return job;
}
