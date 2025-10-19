import cron from 'node-cron';
import { AppLogger } from '../services/logger.service.js';
import { initializeSessionCleanupJobs } from './session-cleanup.job.js';
import { initializeGHLCleanupJobs } from './ghl-cleanup.job.js';
import { SubscriptionRefreshJob } from './subscription-refresh.job.js';

/**
 * Job Scheduler
 *
 * Central scheduler for all background jobs and cron tasks
 * Initializes and manages all scheduled jobs for the application
 */

let isInitialized = false;

/**
 * Initialize subscription refresh job
 * Runs daily at 00:01 AM to refresh credits for active subscriptions
 */
function initializeSubscriptionRefreshJob(): void {
  const job = new SubscriptionRefreshJob();

  // Run daily at 00:01 AM (1 minute after midnight)
  cron.schedule('1 0 * * *', async () => {
    AppLogger.info('Running daily subscription refresh job');
    try {
      await job.execute();
      AppLogger.info('Subscription refresh job completed successfully');
    } catch (error) {
      AppLogger.error('Subscription refresh job failed', error as Error, {
        job: 'subscription-refresh',
      });
    }
  });

  AppLogger.info('Subscription refresh job initialized', {
    schedule: '1 0 * * * (Daily at 00:01 AM)',
  });
}

/**
 * Initialize file access cleanup job
 * Runs periodically to clean up expired file access entries
 */
async function initializeFileAccessCleanupJob(): Promise<void> {
  try {
    // Dynamically import to avoid circular dependencies
    const { initializeFileAccessCleanupJobs } = await import(
      './file-access-cleanup.job.js'
    );
    initializeFileAccessCleanupJobs();
  } catch (error) {
    AppLogger.warn('File access cleanup job not available', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Initialize API key expiry check job
 * Runs periodically to check and handle expired API keys
 */
async function initializeApiKeyExpiryJob(): Promise<void> {
  try {
    // Dynamically import to avoid circular dependencies
    const { initializeApiKeyExpiryJobs } = await import(
      './api-key-expiry-check.job.js'
    );
    initializeApiKeyExpiryJobs();
  } catch (error) {
    AppLogger.warn('API key expiry job not available', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Initialize key rotation job
 * Runs periodically to rotate encryption keys and secrets
 */
async function initializeKeyRotationJob(): Promise<void> {
  try {
    // Dynamically import to avoid circular dependencies
    const { initializeKeyRotationJobs } = await import('./key-rotation.job.js');
    initializeKeyRotationJobs();
  } catch (error) {
    AppLogger.warn('Key rotation job not available', {
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Initialize all scheduled jobs
 * Called once during application startup
 */
export async function initializeScheduler(): Promise<void> {
  if (isInitialized) {
    AppLogger.warn('Job scheduler already initialized, skipping');
    return;
  }

  try {
    AppLogger.info('Initializing job scheduler...');

    // Initialize core jobs
    initializeSessionCleanupJobs(); // Session & token cleanup
    initializeGHLCleanupJobs(); // GHL clone & session cleanup
    initializeSubscriptionRefreshJob(); // Daily credit refresh

    // Initialize optional jobs (with graceful fallback)
    await initializeFileAccessCleanupJob();
    await initializeApiKeyExpiryJob();
    await initializeKeyRotationJob();

    isInitialized = true;

    AppLogger.info('Job scheduler initialized successfully', {
      status: 'active',
      jobs: [
        'Session Cleanup (hourly)',
        'GHL Cleanup (hourly/daily)',
        'Subscription Refresh (daily 00:01)',
        'File Access Cleanup (optional)',
        'API Key Expiry Check (optional)',
        'Key Rotation (optional)',
      ],
    });
  } catch (error) {
    AppLogger.error('Failed to initialize job scheduler', error as Error);
    throw error;
  }
}

/**
 * Shutdown scheduler and cleanup resources
 * Called during graceful application shutdown
 */
export async function shutdownScheduler(): Promise<void> {
  if (!isInitialized) {
    AppLogger.warn('Job scheduler not initialized, nothing to shutdown');
    return;
  }

  try {
    AppLogger.info('Shutting down job scheduler...');

    // Stop all cron jobs
    cron.getTasks().forEach((task) => {
      task.stop();
    });

    isInitialized = false;

    AppLogger.info('Job scheduler shutdown complete');
  } catch (error) {
    AppLogger.error('Error during scheduler shutdown', error as Error);
  }
}

/**
 * Get scheduler status
 */
export function getSchedulerStatus(): {
  initialized: boolean;
  activeJobs: number;
} {
  return {
    initialized: isInitialized,
    activeJobs: cron.getTasks().size,
  };
}

/**
 * Run all cleanup jobs manually (for testing)
 */
export async function runManualCleanup(): Promise<void> {
  AppLogger.info('Running manual cleanup of all jobs...');

  try {
    // Import and run cleanup functions
    const { runManualCleanup: sessionCleanup } = await import(
      './session-cleanup.job.js'
    );
    const { runManualGHLCleanup } = await import('./ghl-cleanup.job.js');
    const subscriptionJob = new SubscriptionRefreshJob();

    // Run session cleanup
    const sessionResult = await sessionCleanup();
    AppLogger.info('Session cleanup completed', sessionResult);

    // Run GHL cleanup
    const ghlResult = await runManualGHLCleanup();
    AppLogger.info('GHL cleanup completed', ghlResult);

    // Run subscription refresh
    await subscriptionJob.executeWithCleanup();
    AppLogger.info('Subscription refresh completed');

    AppLogger.info('Manual cleanup completed successfully');
  } catch (error) {
    AppLogger.error('Manual cleanup failed', error as Error);
    throw error;
  }
}

export default {
  initializeScheduler,
  shutdownScheduler,
  getSchedulerStatus,
  runManualCleanup,
};
