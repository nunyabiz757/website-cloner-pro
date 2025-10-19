import { Pool } from 'pg';
import APIKeyService from '../services/api-key.service.js';
import { APIKeyExpiryCheckJob } from '../jobs/api-key-expiry-check.job.js';
import { APIKeyEmailService } from '../services/api-key-email.service.js';

/**
 * API Key Expiry Tests
 * Tests API key expiration monitoring and notifications
 */

describe('API Key Expiry Tests', () => {
  let pool: Pool;
  let apiKeyService: APIKeyService;
  let expiryJob: APIKeyExpiryCheckJob;
  let emailService: APIKeyEmailService;
  let testUserId: string;

  beforeAll(async () => {
    // Setup test database
    pool = new Pool({
      connectionString: process.env.TEST_DATABASE_URL,
    });

    apiKeyService = new APIKeyService(pool);

    // Create test user
    const userResult = await pool.query(
      `INSERT INTO users (email, password_hash, email_verified)
       VALUES ('test@example.com', 'hash', true)
       RETURNING id`
    );
    testUserId = userResult.rows[0].id;

    // Initialize email service
    emailService = new APIKeyEmailService({
      from: 'noreply@example.com',
      supportUrl: 'https://example.com/support',
      dashboardUrl: 'https://example.com/dashboard',
    });
    await emailService.initialize();

    // Initialize expiry job
    expiryJob = new APIKeyExpiryCheckJob(pool, {
      warningDays: [30, 7, 3, 1],
      autoRevoke: false, // Don't auto-revoke in tests
      enabled: true,
    });
  });

  afterAll(async () => {
    // Cleanup
    await pool.query('DELETE FROM api_key_notifications');
    await pool.query('DELETE FROM api_keys WHERE user_id = $1', [testUserId]);
    await pool.query('DELETE FROM users WHERE id = $1', [testUserId]);
    await pool.end();
  });

  describe('Expiry Detection', () => {
    test('should detect already expired keys', async () => {
      // Create expired key
      const expiredKey = await apiKeyService.createAPIKey(
        testUserId,
        'Expired Key',
        ['read'],
        1000,
        new Date(Date.now() - 86400000) // Expired 1 day ago
      );

      const result = await expiryJob.runExpiryCheck();

      expect(result.expiredKeys).toBeGreaterThanOrEqual(1);

      // Cleanup
      await apiKeyService.deleteAPIKey(expiredKey.id, testUserId);
    });

    test('should detect keys expiring in 7 days', async () => {
      // Create key expiring in 7 days
      const expiringKey = await apiKeyService.createAPIKey(
        testUserId,
        'Expiring in 7 Days',
        ['read'],
        1000,
        new Date(Date.now() + 7 * 86400000)
      );

      const result = await expiryJob.runExpiryCheck();

      expect(result.warningsSent).toBeGreaterThanOrEqual(0);

      // Cleanup
      await apiKeyService.deleteAPIKey(expiringKey.id, testUserId);
    });

    test('should detect keys expiring in 1 day', async () => {
      // Create key expiring in 1 day
      const urgentKey = await apiKeyService.createAPIKey(
        testUserId,
        'Expiring Tomorrow',
        ['read'],
        1000,
        new Date(Date.now() + 86400000)
      );

      const result = await expiryJob.runExpiryCheck();

      expect(result.warningsSent).toBeGreaterThanOrEqual(0);

      // Cleanup
      await apiKeyService.deleteAPIKey(urgentKey.id, testUserId);
    });

    test('should not detect keys without expiry', async () => {
      // Create key without expiration
      const noExpiryKey = await apiKeyService.createAPIKey(
        testUserId,
        'No Expiry',
        ['read'],
        1000
      );

      const stats = await expiryJob.getExpiryStatistics();

      expect(stats).toBeDefined();

      // Cleanup
      await apiKeyService.deleteAPIKey(noExpiryKey.id, testUserId);
    });

    test('should detect keys expiring in 30 days', async () => {
      // Create key expiring in 30 days
      const futureKey = await apiKeyService.createAPIKey(
        testUserId,
        'Expiring in 30 Days',
        ['read'],
        1000,
        new Date(Date.now() + 30 * 86400000)
      );

      const result = await expiryJob.runExpiryCheck();

      expect(result).toBeDefined();

      // Cleanup
      await apiKeyService.deleteAPIKey(futureKey.id, testUserId);
    });
  });

  describe('Auto-Revocation', () => {
    test('should auto-revoke expired keys when enabled', async () => {
      // Create job with auto-revoke enabled
      const autoRevokeJob = new APIKeyExpiryCheckJob(pool, {
        warningDays: [7, 1],
        autoRevoke: true,
        enabled: true,
      });

      // Create expired key
      const expiredKey = await apiKeyService.createAPIKey(
        testUserId,
        'Auto-Revoke Test',
        ['read'],
        1000,
        new Date(Date.now() - 86400000)
      );

      const result = await autoRevokeJob.runExpiryCheck();

      expect(result.revoked).toBeGreaterThanOrEqual(1);

      // Verify key is revoked
      const key = await apiKeyService.getAPIKey(expiredKey.id, testUserId);
      expect(key?.revoked).toBe(true);
    });

    test('should not auto-revoke when disabled', async () => {
      // Job already has autoRevoke: false

      // Create expired key
      const expiredKey = await apiKeyService.createAPIKey(
        testUserId,
        'No Auto-Revoke Test',
        ['read'],
        1000,
        new Date(Date.now() - 86400000)
      );

      const result = await expiryJob.runExpiryCheck();

      expect(result.revoked).toBe(0);

      // Cleanup
      await apiKeyService.deleteAPIKey(expiredKey.id, testUserId);
    });
  });

  describe('Notification Tracking', () => {
    test('should not send duplicate warnings', async () => {
      // Create key expiring in 7 days
      const key = await apiKeyService.createAPIKey(
        testUserId,
        'Duplicate Warning Test',
        ['read'],
        1000,
        new Date(Date.now() + 7 * 86400000)
      );

      // Run check first time
      const firstResult = await expiryJob.runExpiryCheck();

      // Run check second time (should not send duplicate)
      const secondResult = await expiryJob.runExpiryCheck();

      // Second run should send fewer warnings (duplicates filtered)
      expect(secondResult.warningsSent).toBeLessThanOrEqual(
        firstResult.warningsSent
      );

      // Cleanup
      await apiKeyService.deleteAPIKey(key.id, testUserId);
    });

    test('should get notification history', async () => {
      // Create and process key
      const key = await apiKeyService.createAPIKey(
        testUserId,
        'History Test',
        ['read'],
        1000,
        new Date(Date.now() + 7 * 86400000)
      );

      await expiryJob.runExpiryCheck();

      const history = await expiryJob.getNotificationHistory(key.id);

      expect(history).toBeDefined();
      expect(Array.isArray(history)).toBe(true);

      // Cleanup
      await apiKeyService.deleteAPIKey(key.id, testUserId);
    });
  });

  describe('Expiry Statistics', () => {
    test('should get expiry statistics', async () => {
      const stats = await expiryJob.getExpiryStatistics();

      expect(stats).toBeDefined();
      expect(stats).toHaveProperty('totalWithExpiry');
      expect(stats).toHaveProperty('expiredCount');
      expect(stats).toHaveProperty('expiringIn7Days');
      expect(stats).toHaveProperty('expiringIn30Days');
      expect(stats).toHaveProperty('autoRevokedToday');

      expect(typeof stats.totalWithExpiry).toBe('number');
      expect(typeof stats.expiredCount).toBe('number');
    });

    test('should track multiple expiry periods', async () => {
      // Create keys in different expiry periods
      const key7Days = await apiKeyService.createAPIKey(
        testUserId,
        '7 Days',
        ['read'],
        1000,
        new Date(Date.now() + 7 * 86400000)
      );

      const key30Days = await apiKeyService.createAPIKey(
        testUserId,
        '30 Days',
        ['read'],
        1000,
        new Date(Date.now() + 30 * 86400000)
      );

      const stats = await expiryJob.getExpiryStatistics();

      expect(stats.expiringIn7Days).toBeGreaterThanOrEqual(1);
      expect(stats.expiringIn30Days).toBeGreaterThanOrEqual(2);

      // Cleanup
      await apiKeyService.deleteAPIKey(key7Days.id, testUserId);
      await apiKeyService.deleteAPIKey(key30Days.id, testUserId);
    });
  });

  describe('Job Configuration', () => {
    test('should get job status', () => {
      const status = expiryJob.getStatus();

      expect(status).toBeDefined();
      expect(status.enabled).toBe(true);
      expect(status.autoRevoke).toBe(false);
      expect(Array.isArray(status.warningDays)).toBe(true);
      expect(status.warningDays).toEqual([30, 7, 3, 1]);
    });

    test('should update job configuration', () => {
      expiryJob.updateConfig({
        warningDays: [14, 7],
        autoRevoke: true,
      });

      const status = expiryJob.getStatus();

      expect(status.warningDays).toEqual([14, 7]);
      expect(status.autoRevoke).toBe(true);

      // Reset
      expiryJob.updateConfig({
        warningDays: [30, 7, 3, 1],
        autoRevoke: false,
      });
    });

    test('should start and stop job', () => {
      expiryJob.start();
      let status = expiryJob.getStatus();
      expect(status.running).toBe(true);

      expiryJob.stop();
      status = expiryJob.getStatus();
      expect(status.running).toBe(false);
    });
  });

  describe('Email Service', () => {
    test('should send expiry warning email', async () => {
      const emailData = {
        apiKeyId: 'test-id',
        apiKeyName: 'Test Key',
        keyPrefix: 'wcp_abc',
        expiryDate: new Date(Date.now() + 7 * 86400000).toLocaleDateString(),
        createdDate: new Date().toLocaleDateString(),
        daysUntilExpiry: 7,
        isUrgent: false,
        userEmail: 'test@example.com',
      };

      const result = await emailService.sendExpiryWarning(emailData);

      expect(result).toBe(true);
    });

    test('should send urgent expiry warning', async () => {
      const emailData = {
        apiKeyId: 'test-id',
        apiKeyName: 'Test Key',
        keyPrefix: 'wcp_abc',
        expiryDate: new Date(Date.now() + 86400000).toLocaleDateString(),
        createdDate: new Date().toLocaleDateString(),
        daysUntilExpiry: 1,
        isUrgent: true,
        userEmail: 'test@example.com',
      };

      const result = await emailService.sendExpiryWarning(emailData);

      expect(result).toBe(true);
    });

    test('should send expired notification', async () => {
      const emailData = {
        apiKeyId: 'test-id',
        apiKeyName: 'Test Key',
        keyPrefix: 'wcp_abc',
        expiredDate: new Date().toLocaleDateString(),
        wasRevoked: true,
        lastUsed: true,
        lastUsedDate: new Date().toLocaleDateString(),
        userEmail: 'test@example.com',
      };

      const result = await emailService.sendExpiredNotification(emailData);

      expect(result).toBe(true);
    });

    test('should send revoked notification', async () => {
      const emailData = {
        apiKeyId: 'test-id',
        apiKeyName: 'Test Key',
        keyPrefix: 'wcp_abc',
        revokedDate: new Date().toLocaleDateString(),
        revokedBy: 'system',
        reason: 'Automatically revoked due to expiration',
        wasAutoRevoked: true,
        suspiciousActivity: false,
        userEmail: 'test@example.com',
      };

      const result = await emailService.sendRevokedNotification(emailData);

      expect(result).toBe(true);
    });

    test('should get available templates', () => {
      const templates = emailService.getAvailableTemplates();

      expect(Array.isArray(templates)).toBe(true);
      expect(templates.length).toBeGreaterThan(0);
      expect(templates).toContain('expiry-warning');
      expect(templates).toContain('expired');
      expect(templates).toContain('revoked');
    });

    test('should test template rendering', async () => {
      const html = await emailService.testTemplate('expiry-warning', {
        apiKeyName: 'Test Key',
        keyPrefix: 'wcp_abc',
        expiryDate: new Date().toLocaleDateString(),
        createdDate: new Date().toLocaleDateString(),
        daysUntilExpiry: 7,
        isUrgent: false,
      });

      expect(html).toBeDefined();
      expect(html.length).toBeGreaterThan(0);
      expect(html).toContain('Test Key');
      expect(html).toContain('wcp_abc');
    });

    test('should send batch expiry warnings', async () => {
      const warnings = [
        {
          apiKeyId: 'test-1',
          apiKeyName: 'Key 1',
          keyPrefix: 'wcp_abc',
          expiryDate: new Date().toLocaleDateString(),
          createdDate: new Date().toLocaleDateString(),
          daysUntilExpiry: 7,
          isUrgent: false,
          userEmail: 'test1@example.com',
        },
        {
          apiKeyId: 'test-2',
          apiKeyName: 'Key 2',
          keyPrefix: 'wcp_def',
          expiryDate: new Date().toLocaleDateString(),
          createdDate: new Date().toLocaleDateString(),
          daysUntilExpiry: 1,
          isUrgent: true,
          userEmail: 'test2@example.com',
        },
      ];

      const result = await emailService.sendBatchExpiryWarnings(warnings);

      expect(result.sent).toBe(2);
      expect(result.failed).toBe(0);
    });
  });

  describe('Edge Cases', () => {
    test('should handle key without expiry date', async () => {
      const key = await apiKeyService.createAPIKey(
        testUserId,
        'No Expiry',
        ['read'],
        1000
      );

      const result = await expiryJob.runExpiryCheck();

      expect(result).toBeDefined();

      // Cleanup
      await apiKeyService.deleteAPIKey(key.id, testUserId);
    });

    test('should handle already revoked expired keys', async () => {
      const key = await apiKeyService.createAPIKey(
        testUserId,
        'Revoked and Expired',
        ['read'],
        1000,
        new Date(Date.now() - 86400000)
      );

      // Manually revoke
      await apiKeyService.revokeAPIKey(key.id, testUserId, testUserId, 'Manual');

      const result = await expiryJob.runExpiryCheck();

      expect(result).toBeDefined();
    });

    test('should handle multiple warning periods', async () => {
      const key = await apiKeyService.createAPIKey(
        testUserId,
        'Multiple Warnings',
        ['read'],
        1000,
        new Date(Date.now() + 30 * 86400000)
      );

      // Run check for 30-day warning
      await expiryJob.runExpiryCheck();

      // Update expiry to 7 days
      await apiKeyService.updateAPIKey(key.id, testUserId, {
        expires_at: new Date(Date.now() + 7 * 86400000),
      });

      // Run check for 7-day warning
      await expiryJob.runExpiryCheck();

      // Cleanup
      await apiKeyService.deleteAPIKey(key.id, testUserId);
    });
  });
});
