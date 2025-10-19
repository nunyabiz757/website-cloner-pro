import { Pool } from 'pg';
import { CreditService } from '../services/credit.service.js';
import { RedisCacheService } from '../services/redis-cache.service.js';
import { AppLogger } from '../utils/logger.util.js';
import { getPool } from '../config/database.config.js';

/**
 * Subscription Credit Refresh Job
 *
 * Runs daily to refresh credits for active subscriptions
 * - Checks subscriptions that need credit refresh
 * - Adds monthly credits to user accounts
 * - Updates last_refresh_date and next_refresh_date
 * - Handles subscription period tracking
 *
 * Recommended schedule: Run daily at 00:00 UTC
 */

export class SubscriptionRefreshJob {
  private pool: Pool;
  private creditService: CreditService;
  private logger: AppLogger;
  private isRunning: boolean = false;

  constructor(pool?: Pool, creditService?: CreditService) {
    this.pool = pool || getPool();
    this.logger = AppLogger.getInstance();

    if (creditService) {
      this.creditService = creditService;
    } else {
      const cache = new RedisCacheService();
      this.creditService = new CreditService(this.pool, cache);
    }
  }

  /**
   * Execute the job
   */
  async execute(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Subscription refresh job already running, skipping', {
        component: 'SubscriptionRefreshJob',
      });
      return;
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      this.logger.info('Starting subscription credit refresh job', {
        component: 'SubscriptionRefreshJob',
      });

      // Find subscriptions that need credit refresh
      const subscriptionsToRefresh = await this.findSubscriptionsNeedingRefresh();

      this.logger.info('Found subscriptions to refresh', {
        component: 'SubscriptionRefreshJob',
        count: subscriptionsToRefresh.length,
      });

      let successCount = 0;
      let failureCount = 0;

      // Process each subscription
      for (const subscription of subscriptionsToRefresh) {
        try {
          await this.refreshSubscriptionCredits(subscription);
          successCount++;
        } catch (error) {
          this.logger.error('Failed to refresh subscription credits', {
            component: 'SubscriptionRefreshJob',
            userId: subscription.user_id,
            subscriptionId: subscription.stripe_subscription_id,
            error: error instanceof Error ? error.message : String(error),
          });
          failureCount++;
        }
      }

      const duration = Date.now() - startTime;

      this.logger.info('Subscription credit refresh job completed', {
        component: 'SubscriptionRefreshJob',
        totalSubscriptions: subscriptionsToRefresh.length,
        successCount,
        failureCount,
        durationMs: duration,
      });
    } catch (error) {
      this.logger.error('Subscription refresh job failed', {
        component: 'SubscriptionRefreshJob',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Find subscriptions that need credit refresh
   */
  private async findSubscriptionsNeedingRefresh(): Promise<any[]> {
    const result = await this.pool.query(
      `SELECT
        s.id,
        s.user_id,
        s.stripe_subscription_id,
        s.package_id,
        s.current_period_start,
        s.current_period_end,
        c.credits_available,
        c.subscription_credits_per_month,
        c.last_refresh_date,
        c.next_refresh_date,
        cp.credits,
        cp.name as package_name
      FROM subscriptions s
      JOIN credits c ON s.user_id = c.user_id
      LEFT JOIN credit_packages cp ON s.package_id = cp.id
      WHERE s.status = 'active'
        AND s.cancel_at_period_end = false
        AND (
          c.next_refresh_date IS NULL
          OR c.next_refresh_date <= CURRENT_TIMESTAMP
        )`
    );

    return result.rows;
  }

  /**
   * Refresh credits for a single subscription
   */
  private async refreshSubscriptionCredits(subscription: any): Promise<void> {
    const {
      user_id,
      stripe_subscription_id,
      package_id,
      credits,
      package_name,
      current_period_start,
      current_period_end,
    } = subscription;

    this.logger.info('Refreshing subscription credits', {
      component: 'SubscriptionRefreshJob',
      userId: user_id,
      subscriptionId: stripe_subscription_id,
      credits,
    });

    // Add credits
    await this.creditService.addCredits(
      user_id,
      credits,
      'subscription_refresh',
      undefined, // No amount_usd for refresh
      undefined, // No payment intent
      stripe_subscription_id,
      package_id,
      `Monthly subscription renewal: ${package_name}`,
      {
        subscriptionId: stripe_subscription_id,
        packageId: package_id,
        periodStart: current_period_start,
        periodEnd: current_period_end,
        jobType: 'automatic_refresh',
      }
    );

    // Update refresh dates
    const nextRefreshDate = new Date();
    nextRefreshDate.setMonth(nextRefreshDate.getMonth() + 1);
    nextRefreshDate.setHours(0, 0, 0, 0); // Set to midnight

    await this.pool.query(
      `UPDATE credits
      SET
        last_refresh_date = CURRENT_TIMESTAMP,
        next_refresh_date = $2,
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = $1`,
      [user_id, nextRefreshDate]
    );

    this.logger.info('Subscription credits refreshed successfully', {
      component: 'SubscriptionRefreshJob',
      userId: user_id,
      subscriptionId: stripe_subscription_id,
      creditsAdded: credits,
      nextRefreshDate,
    });
  }

  /**
   * Cleanup expired clone sessions
   * Bonus cleanup task to run alongside subscription refresh
   */
  async cleanupExpiredSessions(): Promise<number> {
    try {
      const result = await this.pool.query(
        `DELETE FROM ghl_clone_sessions
        WHERE expires_at < CURRENT_TIMESTAMP
        RETURNING id`
      );

      const deletedCount = result.rows.length;

      if (deletedCount > 0) {
        this.logger.info('Cleaned up expired clone sessions', {
          component: 'SubscriptionRefreshJob',
          deletedCount,
        });
      }

      return deletedCount;
    } catch (error) {
      this.logger.error('Failed to cleanup expired sessions', {
        component: 'SubscriptionRefreshJob',
        error: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }
  }

  /**
   * Cleanup expired cloned pages
   * Bonus cleanup task to run alongside subscription refresh
   */
  async cleanupExpiredClones(): Promise<number> {
    try {
      const result = await this.pool.query(
        `DELETE FROM ghl_cloned_pages
        WHERE expires_at IS NOT NULL
          AND expires_at < CURRENT_TIMESTAMP
        RETURNING id`
      );

      const deletedCount = result.rows.length;

      if (deletedCount > 0) {
        this.logger.info('Cleaned up expired cloned pages', {
          component: 'SubscriptionRefreshJob',
          deletedCount,
        });
      }

      return deletedCount;
    } catch (error) {
      this.logger.error('Failed to cleanup expired clones', {
        component: 'SubscriptionRefreshJob',
        error: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }
  }

  /**
   * Execute job with cleanup tasks
   */
  async executeWithCleanup(): Promise<void> {
    await this.execute();
    await this.cleanupExpiredSessions();
    await this.cleanupExpiredClones();
  }
}

/**
 * Standalone execution function for cron
 */
export async function runSubscriptionRefreshJob(): Promise<void> {
  const job = new SubscriptionRefreshJob();
  await job.executeWithCleanup();
}

export default SubscriptionRefreshJob;
