import cron from 'node-cron';
import { Pool } from 'pg';
import { SessionService } from '../services/session.service.js';
import { AppLogger } from '../services/logger.service.js';

/**
 * Session Cleanup Cron Job
 * Runs periodically to clean up expired sessions and tokens
 */

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const sessionService = new SessionService(pool);

/**
 * Cleanup expired sessions and remember me tokens
 */
async function cleanupSessions(): Promise<void> {
  try {
    AppLogger.info('Starting session cleanup job');

    const result = await sessionService.cleanupExpiredSessions();

    AppLogger.info('Session cleanup completed', {
      sessionsRemoved: result.sessions,
      tokensRemoved: result.tokens,
    });

    // Log to metrics if available
    if (result.sessions > 0 || result.tokens > 0) {
      AppLogger.info('Cleaned up expired sessions and tokens', {
        sessions: result.sessions,
        tokens: result.tokens,
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    AppLogger.error('Session cleanup job failed', error as Error, {
      job: 'session-cleanup',
    });
  }
}

/**
 * Cleanup inactive sessions
 * Sessions that haven't been active for more than session timeout
 */
async function cleanupInactiveSessions(): Promise<void> {
  try {
    const sessionTimeout = parseInt(process.env.SESSION_MAX_AGE || '1800000');
    const inactiveThreshold = new Date(Date.now() - sessionTimeout);

    const result = await pool.query(
      `UPDATE user_sessions
       SET is_active = FALSE, ended_at = NOW()
       WHERE is_active = TRUE
       AND last_activity < $1
       RETURNING id`,
      [inactiveThreshold]
    );

    if (result.rowCount && result.rowCount > 0) {
      AppLogger.info('Cleaned up inactive sessions', {
        count: result.rowCount,
        threshold: inactiveThreshold,
      });
    }
  } catch (error) {
    AppLogger.error('Inactive session cleanup failed', error as Error);
  }
}

/**
 * Session statistics logging
 * Logs session usage statistics for monitoring
 */
async function logSessionStatistics(): Promise<void> {
  try {
    const stats = await pool.query(
      `SELECT
        COUNT(*) FILTER (WHERE is_active = TRUE) as active_sessions,
        COUNT(*) FILTER (WHERE is_active = FALSE) as inactive_sessions,
        COUNT(DISTINCT user_id) FILTER (WHERE is_active = TRUE) as active_users,
        AVG(EXTRACT(EPOCH FROM (last_activity - created_at))) FILTER (WHERE is_active = TRUE) as avg_session_duration,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as sessions_last_24h
       FROM user_sessions`
    );

    const rememberMeStats = await pool.query(
      `SELECT
        COUNT(*) as total_tokens,
        COUNT(*) FILTER (WHERE last_used > NOW() - INTERVAL '7 days') as active_tokens,
        COUNT(*) FILTER (WHERE expires_at < NOW()) as expired_tokens
       FROM remember_me_tokens`
    );

    AppLogger.info('Session statistics', {
      sessions: stats.rows[0],
      rememberMe: rememberMeStats.rows[0],
    });
  } catch (error) {
    AppLogger.error('Session statistics logging failed', error as Error);
  }
}

/**
 * Initialize session cleanup cron jobs
 */
export function initializeSessionCleanupJobs(): void {
  // Cleanup expired sessions every hour
  cron.schedule('0 * * * *', async () => {
    AppLogger.debug('Running hourly session cleanup');
    await cleanupSessions();
  });

  // Cleanup inactive sessions every 15 minutes
  cron.schedule('*/15 * * * *', async () => {
    AppLogger.debug('Running inactive session cleanup');
    await cleanupInactiveSessions();
  });

  // Log session statistics every 6 hours
  cron.schedule('0 */6 * * *', async () => {
    AppLogger.debug('Logging session statistics');
    await logSessionStatistics();
  });

  // Weekly deep cleanup (remove old inactive sessions)
  cron.schedule('0 2 * * 0', async () => {
    AppLogger.info('Running weekly deep session cleanup');
    try {
      const result = await pool.query(
        `DELETE FROM user_sessions
         WHERE is_active = FALSE
         AND ended_at < NOW() - INTERVAL '90 days'`
      );

      AppLogger.info('Weekly deep cleanup completed', {
        sessionsRemoved: result.rowCount || 0,
      });
    } catch (error) {
      AppLogger.error('Weekly deep cleanup failed', error as Error);
    }
  });

  AppLogger.info('Session cleanup cron jobs initialized', {
    jobs: [
      'Hourly session cleanup',
      '15-minute inactive cleanup',
      '6-hour statistics logging',
      'Weekly deep cleanup',
    ],
  });
}

/**
 * Manual cleanup trigger (for testing or manual operations)
 */
export async function runManualCleanup(): Promise<{
  sessions: number;
  tokens: number;
  inactive: number;
}> {
  const result = await sessionService.cleanupExpiredSessions();

  const inactiveResult = await pool.query(
    `UPDATE user_sessions
     SET is_active = FALSE, ended_at = NOW()
     WHERE is_active = TRUE
     AND last_activity < NOW() - INTERVAL '30 minutes'
     RETURNING id`
  );

  return {
    sessions: result.sessions,
    tokens: result.tokens,
    inactive: inactiveResult.rowCount || 0,
  };
}

export default {
  initializeSessionCleanupJobs,
  runManualCleanup,
  cleanupSessions,
  cleanupInactiveSessions,
  logSessionStatistics,
};
