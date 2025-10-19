import cron from 'node-cron';
import { Pool } from 'pg';
import { AppLogger } from '../services/logger.service.js';

/**
 * GHL Cleanup Cron Job
 *
 * Runs periodically to clean up expired GHL clone sessions and cloned pages
 * Uses database functions: cleanup_expired_clone_sessions() and cleanup_expired_cloned_pages()
 */

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

/**
 * Cleanup expired GHL clone sessions
 * Removes sessions that have passed their expiration date
 */
async function cleanupExpiredSessions(): Promise<number> {
  try {
    AppLogger.info('Starting GHL clone session cleanup');

    const result = await pool.query(
      'SELECT cleanup_expired_clone_sessions() as deleted_count'
    );

    const deletedCount = result.rows[0]?.deleted_count || 0;

    if (deletedCount > 0) {
      AppLogger.info('GHL clone session cleanup completed', {
        sessionsDeleted: deletedCount,
        timestamp: new Date().toISOString(),
      });
    } else {
      AppLogger.debug('No expired GHL clone sessions to clean up');
    }

    return deletedCount;
  } catch (error) {
    AppLogger.error('GHL clone session cleanup failed', error as Error, {
      job: 'ghl-cleanup-sessions',
    });
    throw error;
  }
}

/**
 * Cleanup expired GHL cloned pages
 * Removes cloned pages that have passed their expiration date
 */
async function cleanupExpiredClones(): Promise<number> {
  try {
    AppLogger.info('Starting GHL cloned pages cleanup');

    const result = await pool.query(
      'SELECT cleanup_expired_cloned_pages() as deleted_count'
    );

    const deletedCount = result.rows[0]?.deleted_count || 0;

    if (deletedCount > 0) {
      AppLogger.info('GHL cloned pages cleanup completed', {
        clonesDeleted: deletedCount,
        timestamp: new Date().toISOString(),
      });
    } else {
      AppLogger.debug('No expired GHL cloned pages to clean up');
    }

    return deletedCount;
  } catch (error) {
    AppLogger.error('GHL cloned pages cleanup failed', error as Error, {
      job: 'ghl-cleanup-clones',
    });
    throw error;
  }
}

/**
 * Log GHL system statistics
 * Provides insights into GHL clone usage and health
 */
async function logGHLStatistics(): Promise<void> {
  try {
    // Get clone session statistics
    const sessionStats = await pool.query(
      `SELECT
        COUNT(*) as total_sessions,
        COUNT(*) FILTER (WHERE expires_at > NOW()) as active_sessions,
        COUNT(*) FILTER (WHERE expires_at <= NOW()) as expired_sessions,
        COUNT(DISTINCT user_id) as unique_users,
        AVG(EXTRACT(EPOCH FROM (expires_at - created_at))) as avg_session_duration
       FROM ghl_clone_sessions`
    );

    // Get cloned pages statistics
    const cloneStats = await pool.query(
      `SELECT
        COUNT(*) as total_clones,
        COUNT(*) FILTER (WHERE clone_status = 'copied') as successful_clones,
        COUNT(*) FILTER (WHERE clone_status = 'pending') as pending_clones,
        COUNT(*) FILTER (WHERE clone_status = 'failed') as failed_clones,
        COUNT(*) FILTER (WHERE expires_at IS NOT NULL AND expires_at > NOW()) as active_clones,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as clones_last_24h,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as clones_last_7d,
        SUM(credits_consumed) as total_credits_consumed,
        AVG(EXTRACT(EPOCH FROM (completed_at - created_at))) FILTER (WHERE completed_at IS NOT NULL) as avg_clone_time
       FROM ghl_cloned_pages`
    );

    // Get template statistics
    const templateStats = await pool.query(
      `SELECT
        COUNT(*) as total_templates,
        COUNT(*) FILTER (WHERE is_public = true) as public_templates,
        COUNT(*) FILTER (WHERE is_public = false) as private_templates,
        SUM(use_count) as total_uses,
        AVG(use_count) as avg_uses_per_template,
        AVG(rating) FILTER (WHERE rating IS NOT NULL) as avg_rating,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as templates_last_7d
       FROM ghl_clone_templates`
    );

    // Get paste session statistics
    const pasteStats = await pool.query(
      `SELECT
        COUNT(*) as total_paste_sessions,
        COUNT(*) FILTER (WHERE step_completed >= 6) as completed_paste_sessions,
        COUNT(DISTINCT user_id) as unique_paste_users,
        AVG(step_completed) as avg_steps_completed
       FROM ghl_paste_sessions`
    );

    AppLogger.info('GHL system statistics', {
      sessions: sessionStats.rows[0],
      clones: cloneStats.rows[0],
      templates: templateStats.rows[0],
      pasteSessions: pasteStats.rows[0],
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    AppLogger.error('GHL statistics logging failed', error as Error, {
      job: 'ghl-statistics',
    });
  }
}

/**
 * Cleanup orphaned GHL assets
 * Removes assets that are no longer referenced by any cloned pages
 */
async function cleanupOrphanedAssets(): Promise<void> {
  try {
    AppLogger.info('Starting GHL orphaned assets cleanup');

    // Mark assets that haven't been accessed in 30 days as candidates for deletion
    const result = await pool.query(
      `SELECT COUNT(*) as count
       FROM ghl_cloned_pages
       WHERE assets IS NOT NULL
         AND jsonb_array_length(COALESCE(assets->'images', '[]'::jsonb)) > 0
         AND updated_at < NOW() - INTERVAL '30 days'`
    );

    const candidateCount = result.rows[0]?.count || 0;

    if (candidateCount > 0) {
      AppLogger.info('Found old cloned pages with assets', {
        count: candidateCount,
        message: 'Consider implementing asset file cleanup',
      });
    }
  } catch (error) {
    AppLogger.error('Orphaned assets cleanup check failed', error as Error, {
      job: 'ghl-cleanup-assets',
    });
  }
}

/**
 * Initialize GHL cleanup cron jobs
 */
export function initializeGHLCleanupJobs(): void {
  // Cleanup expired clone sessions every hour
  cron.schedule('0 * * * *', async () => {
    AppLogger.debug('Running hourly GHL clone session cleanup');
    await cleanupExpiredSessions();
  });

  // Cleanup expired cloned pages daily at 2:00 AM
  cron.schedule('0 2 * * *', async () => {
    AppLogger.debug('Running daily GHL cloned pages cleanup');
    await cleanupExpiredClones();
  });

  // Log GHL statistics every 6 hours
  cron.schedule('0 */6 * * *', async () => {
    AppLogger.debug('Logging GHL system statistics');
    await logGHLStatistics();
  });

  // Check for orphaned assets weekly on Sunday at 3:00 AM
  cron.schedule('0 3 * * 0', async () => {
    AppLogger.debug('Checking for orphaned GHL assets');
    await cleanupOrphanedAssets();
  });

  AppLogger.info('GHL cleanup cron jobs initialized', {
    jobs: [
      'Hourly clone session cleanup (0 * * * *)',
      'Daily cloned pages cleanup (0 2 * * *)',
      '6-hour statistics logging (0 */6 * * *)',
      'Weekly orphaned assets check (0 3 * * 0)',
    ],
  });
}

/**
 * Manual cleanup trigger (for testing or manual operations)
 */
export async function runManualGHLCleanup(): Promise<{
  sessionsDeleted: number;
  clonesDeleted: number;
}> {
  const sessionsDeleted = await cleanupExpiredSessions();
  const clonesDeleted = await cleanupExpiredClones();

  return {
    sessionsDeleted,
    clonesDeleted,
  };
}

/**
 * Execute all cleanup tasks (for testing)
 */
export async function executeAllCleanupTasks(): Promise<void> {
  await cleanupExpiredSessions();
  await cleanupExpiredClones();
  await logGHLStatistics();
  await cleanupOrphanedAssets();
}

export default {
  initializeGHLCleanupJobs,
  runManualGHLCleanup,
  executeAllCleanupTasks,
  cleanupExpiredSessions,
  cleanupExpiredClones,
  logGHLStatistics,
  cleanupOrphanedAssets,
};
