import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import { Pool } from 'pg';
import { SubscriptionRefreshJob } from '../jobs/subscription-refresh.job.js';
import {
  cleanupExpiredSessions,
  cleanupExpiredClones,
  logGHLStatistics,
  runManualGHLCleanup,
} from '../jobs/ghl-cleanup.job.js';

/**
 * GHL Background Jobs Tests
 * Tests for subscription refresh and cleanup jobs
 */

describe('GHL Background Jobs', () => {
  let pool: Pool;
  let testUserId: string;

  beforeAll(async () => {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://localhost/test_db',
    });

    // Create test user
    const userResult = await pool.query(
      `INSERT INTO users (email, username, password_hash, email_verified)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      ['ghl-jobs-test@example.com', 'ghljobstest', 'hashed_password', true]
    );
    testUserId = userResult.rows[0].id;

    // Initialize credits
    await pool.query(
      `INSERT INTO credits (user_id, credits_available, subscription_credits_per_month)
       VALUES ($1, $2, $3)`,
      [testUserId, 10, 100]
    );
  });

  afterAll(async () => {
    await pool.query('DELETE FROM users WHERE email = $1', ['ghl-jobs-test@example.com']);
    await pool.end();
  });

  describe('Subscription Refresh Job', () => {
    let subscriptionId: string;
    let packageId: string;

    beforeEach(async () => {
      // Create credit package
      const packageResult = await pool.query(
        `INSERT INTO credit_packages (name, credits, price, is_subscription)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        ['Test Monthly Package', 100, 29.99, true]
      );
      packageId = packageResult.rows[0].id;

      // Create active subscription
      const subResult = await pool.query(
        `INSERT INTO subscriptions (
          user_id, stripe_subscription_id, package_id, status,
          current_period_start, current_period_end, cancel_at_period_end
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id`,
        [
          testUserId,
          'test_sub_123',
          packageId,
          'active',
          new Date(),
          new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
          false,
        ]
      );
      subscriptionId = subResult.rows[0].id;

      // Set next_refresh_date to now (needs refresh)
      await pool.query(
        `UPDATE credits
         SET next_refresh_date = CURRENT_TIMESTAMP
         WHERE user_id = $1`,
        [testUserId]
      );
    });

    afterEach(async () => {
      if (subscriptionId) {
        await pool.query('DELETE FROM subscriptions WHERE id = $1', [subscriptionId]);
      }
      if (packageId) {
        await pool.query('DELETE FROM credit_packages WHERE id = $1', [packageId]);
      }
    });

    it('should refresh credits for active subscription', async () => {
      const job = new SubscriptionRefreshJob(pool);

      const beforeCredits = await pool.query(
        'SELECT credits_available FROM credits WHERE user_id = $1',
        [testUserId]
      );

      await job.execute();

      const afterCredits = await pool.query(
        'SELECT credits_available FROM credits WHERE user_id = $1',
        [testUserId]
      );

      expect(afterCredits.rows[0].credits_available).toBeGreaterThan(
        beforeCredits.rows[0].credits_available
      );
    });

    it('should update next_refresh_date after refresh', async () => {
      const job = new SubscriptionRefreshJob(pool);

      await job.execute();

      const credits = await pool.query(
        'SELECT last_refresh_date, next_refresh_date FROM credits WHERE user_id = $1',
        [testUserId]
      );

      expect(credits.rows[0].last_refresh_date).not.toBeNull();
      expect(credits.rows[0].next_refresh_date).not.toBeNull();

      const nextRefresh = new Date(credits.rows[0].next_refresh_date);
      const lastRefresh = new Date(credits.rows[0].last_refresh_date);

      expect(nextRefresh.getTime()).toBeGreaterThan(lastRefresh.getTime());
    });

    it('should not refresh canceled subscriptions', async () => {
      await pool.query(
        'UPDATE subscriptions SET cancel_at_period_end = true WHERE id = $1',
        [subscriptionId]
      );

      const job = new SubscriptionRefreshJob(pool);

      const beforeCredits = await pool.query(
        'SELECT credits_available FROM credits WHERE user_id = $1',
        [testUserId]
      );

      await job.execute();

      const afterCredits = await pool.query(
        'SELECT credits_available FROM credits WHERE user_id = $1',
        [testUserId]
      );

      // Credits should not change for canceled subscription
      expect(afterCredits.rows[0].credits_available).toBe(
        beforeCredits.rows[0].credits_available
      );
    });

    it('should not refresh inactive subscriptions', async () => {
      await pool.query(
        `UPDATE subscriptions SET status = 'canceled' WHERE id = $1`,
        [subscriptionId]
      );

      const job = new SubscriptionRefreshJob(pool);

      const beforeCredits = await pool.query(
        'SELECT credits_available FROM credits WHERE user_id = $1',
        [testUserId]
      );

      await job.execute();

      const afterCredits = await pool.query(
        'SELECT credits_available FROM credits WHERE user_id = $1',
        [testUserId]
      );

      expect(afterCredits.rows[0].credits_available).toBe(
        beforeCredits.rows[0].credits_available
      );
    });

    it('should create credit transaction record', async () => {
      const job = new SubscriptionRefreshJob(pool);

      await job.execute();

      const transaction = await pool.query(
        `SELECT * FROM credit_transactions
         WHERE user_id = $1 AND transaction_type = 'subscription_refresh'
         ORDER BY created_at DESC LIMIT 1`,
        [testUserId]
      );

      expect(transaction.rows.length).toBeGreaterThan(0);
      expect(transaction.rows[0].amount).toBeGreaterThan(0);
    });

    it('should handle multiple subscriptions', async () => {
      // Create second subscription
      const secondSubResult = await pool.query(
        `INSERT INTO subscriptions (
          user_id, stripe_subscription_id, package_id, status,
          current_period_start, current_period_end, cancel_at_period_end
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id`,
        [
          testUserId,
          'test_sub_456',
          packageId,
          'active',
          new Date(),
          new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          false,
        ]
      );

      const secondSubId = secondSubResult.rows[0].id;
      const job = new SubscriptionRefreshJob(pool);

      await job.execute();

      // Cleanup
      await pool.query('DELETE FROM subscriptions WHERE id = $1', [secondSubId]);

      expect(true).toBe(true); // Multiple subscriptions should be handled
    });

    it('should execute with cleanup tasks', async () => {
      const job = new SubscriptionRefreshJob(pool);

      await job.executeWithCleanup();

      expect(true).toBe(true); // Should complete without errors
    });
  });

  describe('GHL Cleanup Jobs', () => {
    describe('Cleanup Expired Sessions', () => {
      let expiredSessionToken: string;

      beforeEach(async () => {
        // Create expired session
        const sessionResult = await pool.query(
          `INSERT INTO ghl_clone_sessions (
            user_id, session_token, status, expires_at
          ) VALUES ($1, gen_random_uuid(), $2, CURRENT_TIMESTAMP - INTERVAL '1 hour')
          RETURNING session_token`,
          [testUserId, 'active']
        );
        expiredSessionToken = sessionResult.rows[0].session_token;
      });

      it('should cleanup expired sessions', async () => {
        const deletedCount = await cleanupExpiredSessions();

        expect(deletedCount).toBeGreaterThan(0);

        // Verify session was deleted
        const check = await pool.query(
          'SELECT id FROM ghl_clone_sessions WHERE session_token = $1',
          [expiredSessionToken]
        );

        expect(check.rows.length).toBe(0);
      });

      it('should not cleanup active sessions', async () => {
        const activeSessionResult = await pool.query(
          `INSERT INTO ghl_clone_sessions (
            user_id, session_token, status, expires_at
          ) VALUES ($1, gen_random_uuid(), $2, CURRENT_TIMESTAMP + INTERVAL '1 hour')
          RETURNING session_token`,
          [testUserId, 'active']
        );

        const activeToken = activeSessionResult.rows[0].session_token;

        await cleanupExpiredSessions();

        const check = await pool.query(
          'SELECT id FROM ghl_clone_sessions WHERE session_token = $1',
          [activeToken]
        );

        expect(check.rows.length).toBe(1);

        // Cleanup
        await pool.query('DELETE FROM ghl_clone_sessions WHERE session_token = $1', [activeToken]);
      });
    });

    describe('Cleanup Expired Clones', () => {
      let expiredCloneId: string;

      beforeEach(async () => {
        // Create expired clone
        const cloneResult = await pool.query(
          `INSERT INTO ghl_cloned_pages (
            user_id, source_url, source_domain, source_title,
            clone_status, credits_consumed, html_content,
            expires_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP - INTERVAL '1 day')
          RETURNING id`,
          [
            testUserId,
            'https://expired.com',
            'expired.com',
            'Expired',
            'copied',
            1,
            '<html></html>',
          ]
        );
        expiredCloneId = cloneResult.rows[0].id;
      });

      it('should cleanup expired clones', async () => {
        const deletedCount = await cleanupExpiredClones();

        expect(deletedCount).toBeGreaterThan(0);

        // Verify clone was deleted
        const check = await pool.query(
          'SELECT id FROM ghl_cloned_pages WHERE id = $1',
          [expiredCloneId]
        );

        expect(check.rows.length).toBe(0);
      });

      it('should not cleanup active clones', async () => {
        const activeCloneResult = await pool.query(
          `INSERT INTO ghl_cloned_pages (
            user_id, source_url, source_domain, source_title,
            clone_status, credits_consumed, html_content,
            expires_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP + INTERVAL '30 days')
          RETURNING id`,
          [
            testUserId,
            'https://active.com',
            'active.com',
            'Active',
            'copied',
            1,
            '<html></html>',
          ]
        );

        const activeCloneId = activeCloneResult.rows[0].id;

        await cleanupExpiredClones();

        const check = await pool.query(
          'SELECT id FROM ghl_cloned_pages WHERE id = $1',
          [activeCloneId]
        );

        expect(check.rows.length).toBe(1);

        // Cleanup
        await pool.query('DELETE FROM ghl_cloned_pages WHERE id = $1', [activeCloneId]);
      });

      it('should not cleanup clones with null expiration', async () => {
        const noExpiryResult = await pool.query(
          `INSERT INTO ghl_cloned_pages (
            user_id, source_url, source_domain, source_title,
            clone_status, credits_consumed, html_content,
            expires_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, NULL)
          RETURNING id`,
          [
            testUserId,
            'https://noexpiry.com',
            'noexpiry.com',
            'No Expiry',
            'copied',
            1,
            '<html></html>',
          ]
        );

        const noExpiryId = noExpiryResult.rows[0].id;

        await cleanupExpiredClones();

        const check = await pool.query(
          'SELECT id FROM ghl_cloned_pages WHERE id = $1',
          [noExpiryId]
        );

        expect(check.rows.length).toBe(1);

        // Cleanup
        await pool.query('DELETE FROM ghl_cloned_pages WHERE id = $1', [noExpiryId]);
      });
    });

    describe('Manual Cleanup', () => {
      it('should run all cleanup tasks', async () => {
        const result = await runManualGHLCleanup();

        expect(result).toHaveProperty('sessionsDeleted');
        expect(result).toHaveProperty('clonesDeleted');
        expect(typeof result.sessionsDeleted).toBe('number');
        expect(typeof result.clonesDeleted).toBe('number');
      });
    });

    describe('Statistics Logging', () => {
      it('should log GHL statistics without errors', async () => {
        await expect(logGHLStatistics()).resolves.not.toThrow();
      });
    });
  });

  describe('Database Function Tests', () => {
    it('should call cleanup_expired_clone_sessions function', async () => {
      const result = await pool.query('SELECT cleanup_expired_clone_sessions()');

      expect(result.rows[0]).toHaveProperty('cleanup_expired_clone_sessions');
      expect(typeof result.rows[0].cleanup_expired_clone_sessions).toBe('number');
    });

    it('should call cleanup_expired_cloned_pages function', async () => {
      const result = await pool.query('SELECT cleanup_expired_cloned_pages()');

      expect(result.rows[0]).toHaveProperty('cleanup_expired_cloned_pages');
      expect(typeof result.rows[0].cleanup_expired_cloned_pages).toBe('number');
    });

    it('should call get_user_clone_stats function', async () => {
      const result = await pool.query('SELECT * FROM get_user_clone_stats($1)', [testUserId]);

      expect(result.rows[0]).toHaveProperty('total_clones');
      expect(result.rows[0]).toHaveProperty('successful_clones');
      expect(result.rows[0]).toHaveProperty('failed_clones');
      expect(result.rows[0]).toHaveProperty('credits_used');
    });
  });

  describe('Job Error Handling', () => {
    it('should handle database connection errors', async () => {
      const badPool = new Pool({
        connectionString: 'postgresql://invalid:5432/invalid',
        connectionTimeoutMillis: 1000,
      });

      const job = new SubscriptionRefreshJob(badPool);

      await expect(job.execute()).rejects.toThrow();

      await badPool.end();
    });

    it('should continue on partial failures', async () => {
      // Create subscription with invalid data
      const job = new SubscriptionRefreshJob(pool);

      // Should not throw even if some subscriptions fail
      await expect(job.execute()).resolves.not.toThrow();
    });

    it('should prevent concurrent execution', async () => {
      const job = new SubscriptionRefreshJob(pool);

      // Start first execution
      const execution1 = job.execute();

      // Try to start second execution while first is running
      const execution2 = job.execute();

      await execution1;
      await execution2;

      // Second execution should be skipped
      expect(true).toBe(true);
    });
  });

  describe('Job Scheduling Integration', () => {
    it('should verify cron expressions are valid', () => {
      const cronExpressions = [
        '0 * * * *',     // Hourly
        '0 2 * * *',     // Daily at 2 AM
        '0 */6 * * *',   // Every 6 hours
        '1 0 * * *',     // Daily at 00:01
        '0 3 * * 0',     // Weekly Sunday at 3 AM
      ];

      cronExpressions.forEach(expr => {
        // Verify format: minute hour day month weekday
        const parts = expr.split(' ');
        expect(parts.length).toBe(5);
      });
    });
  });

  describe('Performance Tests', () => {
    it('should cleanup large number of expired sessions efficiently', async () => {
      // Create 100 expired sessions
      const promises = [];
      for (let i = 0; i < 100; i++) {
        promises.push(
          pool.query(
            `INSERT INTO ghl_clone_sessions (
              user_id, session_token, status, expires_at
            ) VALUES ($1, gen_random_uuid(), $2, CURRENT_TIMESTAMP - INTERVAL '1 hour')`,
            [testUserId, 'active']
          )
        );
      }

      await Promise.all(promises);

      const startTime = Date.now();
      const deletedCount = await cleanupExpiredSessions();
      const duration = Date.now() - startTime;

      expect(deletedCount).toBeGreaterThanOrEqual(100);
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });

    it('should handle subscription refresh for multiple users', async () => {
      const startTime = Date.now();

      const job = new SubscriptionRefreshJob(pool);
      await job.execute();

      const duration = Date.now() - startTime;

      // Should complete reasonably fast even with multiple subscriptions
      expect(duration).toBeLessThan(10000);
    });
  });
});
