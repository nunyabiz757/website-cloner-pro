import { Pool } from 'pg';
import request from 'supertest';
import express from 'express';
import APIKeyService from '../services/api-key.service.js';
import ipWhitelistRouter, { initializeIPWhitelistRoutes } from '../routes/ip-whitelist.routes.js';
import { validateIPFormat, getClientIP } from '../middleware/ip-whitelist.middleware.js';

/**
 * IP Whitelist Tests
 * Tests IP whitelist and blacklist functionality for API keys
 */

describe('IP Whitelist Tests', () => {
  let pool: Pool;
  let apiKeyService: APIKeyService;
  let app: express.Application;
  let testUserId: string;
  let testAPIKey: string;
  let testAPIKeyId: string;

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

    // Create test API key
    const apiKey = await apiKeyService.createAPIKey(
      testUserId,
      'Test API Key',
      ['read', 'write'],
      1000
    );
    testAPIKey = apiKey.key;
    testAPIKeyId = apiKey.id;

    // Setup Express app
    app = express();
    app.use(express.json());
    initializeIPWhitelistRoutes(pool);
    app.use('/api/ip-whitelist', ipWhitelistRouter);
  });

  afterAll(async () => {
    // Cleanup
    await pool.query('DELETE FROM api_key_ip_access_logs');
    await pool.query('DELETE FROM api_key_ip_whitelist');
    await pool.query('DELETE FROM api_key_ip_blacklist');
    await pool.query('DELETE FROM api_keys WHERE id = $1', [testAPIKeyId]);
    await pool.query('DELETE FROM users WHERE id = $1', [testUserId]);
    await pool.end();
  });

  describe('IP Format Validation', () => {
    test('should validate IPv4 address', () => {
      expect(validateIPFormat('192.168.1.1')).toBe(true);
      expect(validateIPFormat('10.0.0.1')).toBe(true);
      expect(validateIPFormat('172.16.0.1')).toBe(true);
    });

    test('should reject invalid IPv4 address', () => {
      expect(validateIPFormat('256.1.1.1')).toBe(false);
      expect(validateIPFormat('192.168.1')).toBe(false);
      expect(validateIPFormat('192.168.1.1.1')).toBe(false);
      expect(validateIPFormat('abc.def.ghi.jkl')).toBe(false);
    });

    test('should validate CIDR notation', () => {
      expect(validateIPFormat('192.168.1.0/24')).toBe(true);
      expect(validateIPFormat('10.0.0.0/8')).toBe(true);
      expect(validateIPFormat('172.16.0.0/12')).toBe(true);
    });

    test('should reject invalid CIDR notation', () => {
      expect(validateIPFormat('192.168.1.0/33')).toBe(false);
      expect(validateIPFormat('192.168.1.0/-1')).toBe(false);
      expect(validateIPFormat('256.1.1.0/24')).toBe(false);
    });

    test('should validate IPv6 address', () => {
      expect(validateIPFormat('2001:0db8:85a3:0000:0000:8a2e:0370:7334')).toBe(
        true
      );
    });
  });

  describe('IP Whitelist Management', () => {
    test('should add IP to whitelist', async () => {
      const entry = await apiKeyService.addIPToWhitelist(
        testAPIKeyId,
        '192.168.1.100',
        'Test IP',
        testUserId
      );

      expect(entry).toBeDefined();
      expect(entry.ip_address).toBe('192.168.1.100');
      expect(entry.description).toBe('Test IP');
      expect(entry.is_active).toBe(true);
    });

    test('should add CIDR range to whitelist', async () => {
      const entry = await apiKeyService.addIPToWhitelist(
        testAPIKeyId,
        '10.0.0.0/24',
        'Office network',
        testUserId
      );

      expect(entry).toBeDefined();
      expect(entry.cidr_range).toBe('10.0.0.0/24');
    });

    test('should get IP whitelist', async () => {
      const whitelist = await apiKeyService.getIPWhitelist(testAPIKeyId);

      expect(whitelist.length).toBeGreaterThan(0);
      expect(whitelist.some((e) => e.ip_address === '192.168.1.100')).toBe(true);
    });

    test('should check if IP is whitelisted', async () => {
      const isWhitelisted = await apiKeyService.isIPWhitelisted(
        testAPIKeyId,
        '192.168.1.100'
      );

      expect(isWhitelisted).toBe(true);
    });

    test('should check if IP in CIDR range is whitelisted', async () => {
      const isWhitelisted = await apiKeyService.isIPWhitelisted(
        testAPIKeyId,
        '10.0.0.50'
      );

      expect(isWhitelisted).toBe(true);
    });

    test('should reject IP not in whitelist', async () => {
      const isWhitelisted = await apiKeyService.isIPWhitelisted(
        testAPIKeyId,
        '8.8.8.8'
      );

      expect(isWhitelisted).toBe(false);
    });

    test('should remove IP from whitelist', async () => {
      const entry = await apiKeyService.addIPToWhitelist(
        testAPIKeyId,
        '192.168.1.200',
        'Temporary IP',
        testUserId
      );

      await apiKeyService.removeIPFromWhitelist(entry.id, testAPIKeyId);

      const whitelist = await apiKeyService.getIPWhitelist(testAPIKeyId);
      expect(whitelist.some((e) => e.ip_address === '192.168.1.200')).toBe(false);
    });

    test('should toggle whitelist entry active status', async () => {
      const entry = await apiKeyService.addIPToWhitelist(
        testAPIKeyId,
        '192.168.1.150',
        'Toggle test',
        testUserId
      );

      await apiKeyService.toggleWhitelistEntry(entry.id, false);

      const whitelist = await apiKeyService.getIPWhitelist(testAPIKeyId);
      expect(whitelist.some((e) => e.ip_address === '192.168.1.150')).toBe(false);
    });

    test('should bulk add IPs to whitelist', async () => {
      const ips = ['192.168.2.1', '192.168.2.2', '192.168.2.3'];

      const entries = await apiKeyService.bulkAddIPsToWhitelist(
        testAPIKeyId,
        ips,
        testUserId
      );

      expect(entries.length).toBe(3);
      expect(entries.every((e) => e.api_key_id === testAPIKeyId)).toBe(true);
    });
  });

  describe('IP Blacklist Management', () => {
    test('should add IP to blacklist', async () => {
      const blacklistId = await apiKeyService.addIPToBlacklist(
        '203.0.113.1',
        'Malicious activity',
        'high',
        undefined,
        testUserId
      );

      expect(blacklistId).toBeDefined();
    });

    test('should check if IP is blacklisted', async () => {
      const blacklistCheck = await apiKeyService.isIPBlacklisted('203.0.113.1');

      expect(blacklistCheck.isBlacklisted).toBe(true);
      expect(blacklistCheck.reason).toBe('Malicious activity');
      expect(blacklistCheck.severity).toBe('high');
    });

    test('should check if non-blacklisted IP is safe', async () => {
      const blacklistCheck = await apiKeyService.isIPBlacklisted('1.2.3.4');

      expect(blacklistCheck.isBlacklisted).toBe(false);
    });

    test('should get IP blacklist', async () => {
      const blacklist = await apiKeyService.getIPBlacklist();

      expect(blacklist.length).toBeGreaterThan(0);
      expect(blacklist.some((e) => e.ip_address === '203.0.113.1')).toBe(true);
    });

    test('should remove IP from blacklist', async () => {
      const blacklistId = await apiKeyService.addIPToBlacklist(
        '203.0.113.2',
        'Test',
        'low',
        undefined,
        testUserId
      );

      await apiKeyService.removeIPFromBlacklist(blacklistId);

      const blacklistCheck = await apiKeyService.isIPBlacklisted('203.0.113.2');
      expect(blacklistCheck.isBlacklisted).toBe(false);
    });

    test('should add temporary blacklist entry', async () => {
      const expiresAt = new Date(Date.now() + 1000); // 1 second

      await apiKeyService.addIPToBlacklist(
        '203.0.113.3',
        'Temporary ban',
        'medium',
        expiresAt,
        testUserId
      );

      let blacklistCheck = await apiKeyService.isIPBlacklisted('203.0.113.3');
      expect(blacklistCheck.isBlacklisted).toBe(true);

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Cleanup expired entries
      await apiKeyService.cleanupExpiredBlacklist();

      blacklistCheck = await apiKeyService.isIPBlacklisted('203.0.113.3');
      expect(blacklistCheck.isBlacklisted).toBe(false);
    });
  });

  describe('API Key Verification with IP', () => {
    test('should verify API key with whitelisted IP', async () => {
      await apiKeyService.addIPToWhitelist(
        testAPIKeyId,
        '192.168.100.1',
        'Test IP',
        testUserId
      );

      const verification = await apiKeyService.verifyAPIKeyWithIP(
        testAPIKey,
        '192.168.100.1'
      );

      expect(verification.apiKey).toBeDefined();
      expect(verification.denied).toBe(false);
    });

    test('should deny API key with non-whitelisted IP', async () => {
      const verification = await apiKeyService.verifyAPIKeyWithIP(
        testAPIKey,
        '8.8.8.8'
      );

      expect(verification.apiKey).toBeNull();
      expect(verification.denied).toBe(true);
      expect(verification.reason).toContain('not whitelisted');
    });

    test('should deny API key with blacklisted IP', async () => {
      await apiKeyService.addIPToBlacklist(
        '203.0.113.10',
        'Test blacklist',
        'high',
        undefined,
        testUserId
      );

      const verification = await apiKeyService.verifyAPIKeyWithIP(
        testAPIKey,
        '203.0.113.10'
      );

      expect(verification.apiKey).toBeNull();
      expect(verification.denied).toBe(true);
      expect(verification.reason).toContain('blacklisted');
    });

    test('should deny invalid API key', async () => {
      const verification = await apiKeyService.verifyAPIKeyWithIP(
        'invalid_key',
        '192.168.1.1'
      );

      expect(verification.apiKey).toBeNull();
      expect(verification.denied).toBe(true);
      expect(verification.reason).toBe('Invalid API key');
    });
  });

  describe('IP Access Logging', () => {
    test('should log IP access', async () => {
      const logId = await apiKeyService.logIPAccess(
        testAPIKeyId,
        '192.168.1.1',
        true,
        undefined,
        '/api/test',
        'GET',
        'Test Agent',
        200
      );

      expect(logId).toBeDefined();
    });

    test('should log denied access', async () => {
      const logId = await apiKeyService.logIPAccess(
        testAPIKeyId,
        '8.8.8.8',
        false,
        'IP not whitelisted',
        '/api/test',
        'GET',
        'Test Agent',
        403
      );

      expect(logId).toBeDefined();
    });

    test('should get IP access logs', async () => {
      const logs = await apiKeyService.getIPAccessLogs(testAPIKeyId, 10);

      expect(logs.length).toBeGreaterThan(0);
      expect(logs.every((log) => log.api_key_id === testAPIKeyId)).toBe(true);
    });

    test('should get suspicious IP access patterns', async () => {
      // Create multiple denied attempts from same IP
      const suspiciousIP = '203.0.113.50';

      for (let i = 0; i < 6; i++) {
        await apiKeyService.logIPAccess(
          testAPIKeyId,
          suspiciousIP,
          false,
          'IP not whitelisted'
        );
      }

      const suspicious = await apiKeyService.getSuspiciousIPAccess();

      expect(suspicious.length).toBeGreaterThan(0);

      const suspiciousEntry = suspicious.find((s) => s.ipAddress === suspiciousIP);
      expect(suspiciousEntry).toBeDefined();
      expect(suspiciousEntry?.deniedAttempts).toBeGreaterThanOrEqual(5);
    });
  });

  describe('Whitelist Statistics', () => {
    test('should get whitelist statistics', async () => {
      const stats = await apiKeyService.getWhitelistStatistics(testAPIKeyId);

      expect(stats.length).toBeGreaterThan(0);
      expect(stats[0]).toHaveProperty('ipAddress');
      expect(stats[0]).toHaveProperty('useCount');
      expect(stats[0]).toHaveProperty('successfulAccesses');
    });

    test('should update whitelist IP usage', async () => {
      await apiKeyService.updateWhitelistIPUsage(testAPIKeyId, '192.168.1.100');

      const stats = await apiKeyService.getWhitelistStatistics(testAPIKeyId);
      const ipStat = stats.find((s) => s.ipAddress === '192.168.1.100');

      expect(ipStat).toBeDefined();
      expect(ipStat?.useCount).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    test('should allow all IPs when no whitelist exists', async () => {
      // Create new API key without whitelist
      const newAPIKey = await apiKeyService.createAPIKey(
        testUserId,
        'No Whitelist Key',
        ['read'],
        1000
      );

      const isWhitelisted = await apiKeyService.isIPWhitelisted(
        newAPIKey.id,
        '1.2.3.4'
      );

      expect(isWhitelisted).toBe(true);

      // Cleanup
      await apiKeyService.deleteAPIKey(newAPIKey.id, testUserId);
    });

    test('should handle duplicate IP addition', async () => {
      // Adding same IP twice should update, not duplicate
      await apiKeyService.addIPToWhitelist(
        testAPIKeyId,
        '192.168.1.250',
        'First',
        testUserId
      );

      await apiKeyService.addIPToWhitelist(
        testAPIKeyId,
        '192.168.1.250',
        'Second',
        testUserId
      );

      const whitelist = await apiKeyService.getIPWhitelist(testAPIKeyId);
      const entries = whitelist.filter((e) => e.ip_address === '192.168.1.250');

      expect(entries.length).toBe(1);
    });

    test('should reject unauthorized whitelist removal', async () => {
      const entry = await apiKeyService.addIPToWhitelist(
        testAPIKeyId,
        '192.168.1.240',
        'Test',
        testUserId
      );

      // Try to remove with wrong API key ID
      await expect(
        apiKeyService.removeIPFromWhitelist(entry.id, 'wrong-api-key-id')
      ).rejects.toThrow();
    });

    test('should handle IPv6 addresses', async () => {
      const ipv6 = '2001:0db8:85a3:0000:0000:8a2e:0370:7334';

      const entry = await apiKeyService.addIPToWhitelist(
        testAPIKeyId,
        ipv6,
        'IPv6 test',
        testUserId
      );

      expect(entry.ip_address).toBe(ipv6);

      const isWhitelisted = await apiKeyService.isIPWhitelisted(
        testAPIKeyId,
        ipv6
      );

      expect(isWhitelisted).toBe(true);
    });
  });

  describe('Client IP Extraction', () => {
    test('should extract IP from X-Forwarded-For', () => {
      const req = {
        headers: {
          'x-forwarded-for': '203.0.113.1, 192.168.1.1',
        },
      } as any;

      const ip = getClientIP(req);
      expect(ip).toBe('203.0.113.1');
    });

    test('should extract IP from X-Real-IP', () => {
      const req = {
        headers: {
          'x-real-ip': '203.0.113.2',
        },
      } as any;

      const ip = getClientIP(req);
      expect(ip).toBe('203.0.113.2');
    });

    test('should extract IP from socket', () => {
      const req = {
        socket: {
          remoteAddress: '::ffff:192.168.1.1',
        },
        headers: {},
      } as any;

      const ip = getClientIP(req);
      expect(ip).toBe('192.168.1.1');
    });

    test('should return null when no IP available', () => {
      const req = {
        headers: {},
      } as any;

      const ip = getClientIP(req);
      expect(ip).toBeNull();
    });
  });

  describe('Security Scenarios', () => {
    test('should prevent IP spoofing via multiple headers', async () => {
      // Ensure X-Forwarded-For takes precedence (first IP)
      const req = {
        headers: {
          'x-forwarded-for': '203.0.113.1, 192.168.1.1',
          'x-real-ip': '10.0.0.1',
        },
        socket: {
          remoteAddress: '172.16.0.1',
        },
      } as any;

      const ip = getClientIP(req);
      expect(ip).toBe('203.0.113.1');
    });

    test('should handle CIDR range matching', async () => {
      await apiKeyService.addIPToWhitelist(
        testAPIKeyId,
        '172.16.0.0/16',
        'Corporate network',
        testUserId
      );

      // Test IPs within range
      expect(
        await apiKeyService.isIPWhitelisted(testAPIKeyId, '172.16.0.1')
      ).toBe(true);
      expect(
        await apiKeyService.isIPWhitelisted(testAPIKeyId, '172.16.255.254')
      ).toBe(true);

      // Test IP outside range
      expect(
        await apiKeyService.isIPWhitelisted(testAPIKeyId, '172.17.0.1')
      ).toBe(false);
    });

    test('should log multiple access attempts', async () => {
      const testIP = '192.168.99.1';

      for (let i = 0; i < 5; i++) {
        await apiKeyService.logIPAccess(
          testAPIKeyId,
          testIP,
          i % 2 === 0,
          i % 2 === 1 ? 'Test denial' : undefined
        );
      }

      const logs = await apiKeyService.getIPAccessLogs(testAPIKeyId, 100);
      const testIPLogs = logs.filter((log) => log.ip_address === testIP);

      expect(testIPLogs.length).toBe(5);
      expect(testIPLogs.filter((log) => log.access_granted).length).toBe(3);
      expect(testIPLogs.filter((log) => !log.access_granted).length).toBe(2);
    });
  });
});
