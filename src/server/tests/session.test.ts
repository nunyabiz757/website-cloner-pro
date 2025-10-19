import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import { SessionService, SessionData, DeviceInfo } from '../services/session.service';
import { Pool } from 'pg';
import { createClient, RedisClientType } from 'redis';
import crypto from 'crypto';
import type { Request } from 'express';

/**
 * Session Management Tests
 * Tests for session service, fingerprinting, and security features
 */

describe('SessionService', () => {
  let sessionService: SessionService;
  let pool: Pool;
  let redisClient: RedisClientType;
  let testUserId: string;
  let testSessionId: string;

  // Mock request object
  const createMockRequest = (
    ip: string = '127.0.0.1',
    userAgent: string = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  ): Partial<Request> => ({
    ip,
    socket: { remoteAddress: ip } as any,
    headers: {
      'user-agent': userAgent,
    },
  });

  beforeAll(async () => {
    // Initialize database pool
    pool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://localhost/test_db',
    });

    // Initialize Redis client
    redisClient = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379',
    }) as RedisClientType;

    await redisClient.connect();

    // Initialize session service
    sessionService = new SessionService(pool);

    // Create test user
    const userResult = await pool.query(
      `INSERT INTO users (email, username, password_hash, email_verified)
       VALUES ($1, $2, $3, TRUE)
       RETURNING id`,
      ['session-test@example.com', 'sessiontestuser', 'hashedpassword123']
    );

    testUserId = userResult.rows[0].id;
  });

  afterAll(async () => {
    // Clean up test data
    if (testUserId) {
      await pool.query('DELETE FROM user_sessions WHERE user_id = $1', [testUserId]);
      await pool.query('DELETE FROM remember_me_tokens WHERE user_id = $1', [testUserId]);
      await pool.query('DELETE FROM users WHERE id = $1', [testUserId]);
    }

    await pool.end();
    await redisClient.quit();
    await sessionService.close();
  });

  beforeEach(async () => {
    // Clean sessions before each test
    await pool.query('DELETE FROM user_sessions WHERE user_id = $1', [testUserId]);
    await pool.query('DELETE FROM remember_me_tokens WHERE user_id = $1', [testUserId]);
  });

  describe('Session Fingerprinting', () => {
    it('should generate consistent fingerprint for same IP and User-Agent', () => {
      const req1 = createMockRequest('192.168.1.1', 'Mozilla/5.0');
      const req2 = createMockRequest('192.168.1.1', 'Mozilla/5.0');

      const fingerprint1 = sessionService.generateFingerprint(req1 as Request);
      const fingerprint2 = sessionService.generateFingerprint(req2 as Request);

      expect(fingerprint1).toBe(fingerprint2);
      expect(fingerprint1).toHaveLength(64); // SHA-256 hex length
    });

    it('should generate different fingerprints for different IPs', () => {
      const req1 = createMockRequest('192.168.1.1', 'Mozilla/5.0');
      const req2 = createMockRequest('192.168.1.2', 'Mozilla/5.0');

      const fingerprint1 = sessionService.generateFingerprint(req1 as Request);
      const fingerprint2 = sessionService.generateFingerprint(req2 as Request);

      expect(fingerprint1).not.toBe(fingerprint2);
    });

    it('should generate different fingerprints for different User-Agents', () => {
      const req1 = createMockRequest('192.168.1.1', 'Mozilla/5.0 Chrome');
      const req2 = createMockRequest('192.168.1.1', 'Mozilla/5.0 Firefox');

      const fingerprint1 = sessionService.generateFingerprint(req1 as Request);
      const fingerprint2 = sessionService.generateFingerprint(req2 as Request);

      expect(fingerprint1).not.toBe(fingerprint2);
    });
  });

  describe('Device Information Parsing', () => {
    it('should parse Chrome browser information correctly', () => {
      const userAgent =
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

      const deviceInfo = sessionService.parseDeviceInfo(userAgent);

      expect(deviceInfo.browser).toBe('Chrome');
      expect(deviceInfo.os).toBe('Windows');
      expect(deviceInfo.osVersion).toBe('10');
      expect(deviceInfo.deviceType).toBe('desktop');
    });

    it('should parse mobile device information correctly', () => {
      const userAgent =
        'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1';

      const deviceInfo = sessionService.parseDeviceInfo(userAgent);

      expect(deviceInfo.browser).toBe('Mobile Safari');
      expect(deviceInfo.os).toBe('iOS');
      expect(deviceInfo.deviceType).toBe('mobile');
    });

    it('should handle unknown user agents gracefully', () => {
      const userAgent = 'CustomBot/1.0';

      const deviceInfo = sessionService.parseDeviceInfo(userAgent);

      expect(deviceInfo.browser).toBeDefined();
      expect(deviceInfo.os).toBeDefined();
      expect(deviceInfo.deviceType).toBeDefined();
    });
  });

  describe('Session Creation', () => {
    it('should create a new session successfully', async () => {
      const req = createMockRequest();
      testSessionId = crypto.randomBytes(16).toString('hex');

      const session = await sessionService.createSession(testUserId, testSessionId, req as Request);

      expect(session).toBeDefined();
      expect(session.user_id).toBe(testUserId);
      expect(session.session_id).toBe(testSessionId);
      expect(session.fingerprint).toBeDefined();
      expect(session.is_active).toBe(true);
      expect(session.device_info).toBeDefined();
    });

    it('should store session in database and Redis', async () => {
      const req = createMockRequest();
      testSessionId = crypto.randomBytes(16).toString('hex');

      await sessionService.createSession(testUserId, testSessionId, req as Request);

      // Check database
      const dbResult = await pool.query(
        'SELECT * FROM user_sessions WHERE session_id = $1',
        [testSessionId]
      );
      expect(dbResult.rows).toHaveLength(1);

      // Check Redis
      const redisData = await redisClient.get(`session:${testSessionId}`);
      expect(redisData).toBeDefined();
      expect(redisData).not.toBeNull();
    });

    it('should set correct expiration time', async () => {
      const req = createMockRequest();
      testSessionId = crypto.randomBytes(16).toString('hex');

      const session = await sessionService.createSession(testUserId, testSessionId, req as Request);

      const expiresAt = new Date(session.expires_at);
      const now = new Date();
      const expectedExpiry = new Date(now.getTime() + 30 * 60 * 1000); // 30 minutes

      // Allow 5 second tolerance
      const timeDiff = Math.abs(expiresAt.getTime() - expectedExpiry.getTime());
      expect(timeDiff).toBeLessThan(5000);
    });
  });

  describe('Session Validation', () => {
    beforeEach(async () => {
      const req = createMockRequest();
      testSessionId = crypto.randomBytes(16).toString('hex');
      await sessionService.createSession(testUserId, testSessionId, req as Request);
    });

    it('should validate session with correct fingerprint', async () => {
      const req = createMockRequest();

      const isValid = await sessionService.validateSession(testSessionId, req as Request);

      expect(isValid).toBe(true);
    });

    it('should reject session with incorrect fingerprint (possible hijacking)', async () => {
      const req = createMockRequest('10.0.0.1', 'DifferentUserAgent/1.0'); // Different IP and UA

      const isValid = await sessionService.validateSession(testSessionId, req as Request);

      expect(isValid).toBe(false);
    });

    it('should reject expired session', async () => {
      // Manually expire the session
      await pool.query(
        'UPDATE user_sessions SET expires_at = NOW() - INTERVAL \'1 hour\' WHERE session_id = $1',
        [testSessionId]
      );

      const req = createMockRequest();
      const isValid = await sessionService.validateSession(testSessionId, req as Request);

      expect(isValid).toBe(false);
    });

    it('should reject inactive session', async () => {
      // Manually set last activity to 2 hours ago
      await pool.query(
        'UPDATE user_sessions SET last_activity = NOW() - INTERVAL \'2 hours\' WHERE session_id = $1',
        [testSessionId]
      );

      // Update Redis as well
      const redisData = await redisClient.get(`session:${testSessionId}`);
      if (redisData) {
        const data = JSON.parse(redisData);
        data.lastActivity = Date.now() - 2 * 60 * 60 * 1000; // 2 hours ago
        await redisClient.setEx(`session:${testSessionId}`, 1800, JSON.stringify(data));
      }

      const req = createMockRequest();
      const isValid = await sessionService.validateSession(testSessionId, req as Request);

      expect(isValid).toBe(false);
    });

    it('should reject non-existent session', async () => {
      const req = createMockRequest();
      const fakeSessionId = 'nonexistent-session-id';

      const isValid = await sessionService.validateSession(fakeSessionId, req as Request);

      expect(isValid).toBe(false);
    });
  });

  describe('Session Activity Updates', () => {
    beforeEach(async () => {
      const req = createMockRequest();
      testSessionId = crypto.randomBytes(16).toString('hex');
      await sessionService.createSession(testUserId, testSessionId, req as Request);
    });

    it('should update last activity timestamp', async () => {
      // Get initial activity time
      const initialResult = await pool.query(
        'SELECT last_activity FROM user_sessions WHERE session_id = $1',
        [testSessionId]
      );
      const initialActivity = new Date(initialResult.rows[0].last_activity);

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Update activity
      await sessionService.updateSessionActivity(testSessionId);

      // Get updated activity time
      const updatedResult = await pool.query(
        'SELECT last_activity FROM user_sessions WHERE session_id = $1',
        [testSessionId]
      );
      const updatedActivity = new Date(updatedResult.rows[0].last_activity);

      expect(updatedActivity.getTime()).toBeGreaterThan(initialActivity.getTime());
    });

    it('should update Redis cache on activity update', async () => {
      const initialRedisData = await redisClient.get(`session:${testSessionId}`);
      const initialData = initialRedisData ? JSON.parse(initialRedisData) : null;
      const initialActivity = initialData?.lastActivity;

      await new Promise((resolve) => setTimeout(resolve, 100));

      await sessionService.updateSessionActivity(testSessionId);

      const updatedRedisData = await redisClient.get(`session:${testSessionId}`);
      const updatedData = updatedRedisData ? JSON.parse(updatedRedisData) : null;
      const updatedActivity = updatedData?.lastActivity;

      expect(updatedActivity).toBeGreaterThan(initialActivity);
    });
  });

  describe('Concurrent Session Limits', () => {
    it('should allow up to max concurrent sessions', async () => {
      const maxSessions = parseInt(process.env.MAX_SESSIONS_PER_USER || '3');
      const req = createMockRequest();

      // Create max sessions
      for (let i = 0; i < maxSessions; i++) {
        const sessionId = `session-${i}-${Date.now()}`;
        await sessionService.createSession(testUserId, sessionId, req as Request);
      }

      const sessions = await sessionService.getUserSessions(testUserId);
      expect(sessions.length).toBe(maxSessions);
    });

    it('should enforce concurrent session limit by removing oldest', async () => {
      const maxSessions = parseInt(process.env.MAX_SESSIONS_PER_USER || '3');
      const req = createMockRequest();

      // Create max + 1 sessions
      const sessionIds: string[] = [];
      for (let i = 0; i < maxSessions + 1; i++) {
        const sessionId = `session-${i}-${Date.now()}`;
        sessionIds.push(sessionId);
        await sessionService.createSession(testUserId, sessionId, req as Request);
        await new Promise((resolve) => setTimeout(resolve, 50)); // Ensure different timestamps
      }

      const sessions = await sessionService.getUserSessions(testUserId);
      expect(sessions.length).toBe(maxSessions);

      // First session should be removed
      const firstSessionExists = sessions.some((s) => s.session_id === sessionIds[0]);
      expect(firstSessionExists).toBe(false);

      // Last session should exist
      const lastSessionExists = sessions.some(
        (s) => s.session_id === sessionIds[sessionIds.length - 1]
      );
      expect(lastSessionExists).toBe(true);
    });
  });

  describe('Session Destruction', () => {
    beforeEach(async () => {
      const req = createMockRequest();
      testSessionId = crypto.randomBytes(16).toString('hex');
      await sessionService.createSession(testUserId, testSessionId, req as Request);
    });

    it('should destroy single session', async () => {
      await sessionService.destroySession(testSessionId);

      const result = await pool.query(
        'SELECT * FROM user_sessions WHERE session_id = $1 AND is_active = TRUE',
        [testSessionId]
      );

      expect(result.rows).toHaveLength(0);
    });

    it('should remove session from Redis on destroy', async () => {
      await sessionService.destroySession(testSessionId);

      const redisData = await redisClient.get(`session:${testSessionId}`);
      expect(redisData).toBeNull();
    });

    it('should mark session as inactive in database', async () => {
      await sessionService.destroySession(testSessionId);

      const result = await pool.query(
        'SELECT is_active, ended_at FROM user_sessions WHERE session_id = $1',
        [testSessionId]
      );

      expect(result.rows[0].is_active).toBe(false);
      expect(result.rows[0].ended_at).not.toBeNull();
    });
  });

  describe('Logout from All Devices', () => {
    let session1Id: string;
    let session2Id: string;
    let session3Id: string;

    beforeEach(async () => {
      const req = createMockRequest();

      session1Id = `session-1-${Date.now()}`;
      session2Id = `session-2-${Date.now()}`;
      session3Id = `session-3-${Date.now()}`;

      await sessionService.createSession(testUserId, session1Id, req as Request);
      await sessionService.createSession(testUserId, session2Id, req as Request);
      await sessionService.createSession(testUserId, session3Id, req as Request);
    });

    it('should destroy all user sessions', async () => {
      const destroyedCount = await sessionService.destroyAllUserSessions(testUserId);

      expect(destroyedCount).toBe(3);

      const sessions = await sessionService.getUserSessions(testUserId);
      expect(sessions).toHaveLength(0);
    });

    it('should keep current session when specified', async () => {
      const destroyedCount = await sessionService.destroyAllUserSessions(testUserId, session2Id);

      expect(destroyedCount).toBe(2);

      const sessions = await sessionService.getUserSessions(testUserId);
      expect(sessions).toHaveLength(1);
      expect(sessions[0].session_id).toBe(session2Id);
    });
  });

  describe('Remember Me Tokens', () => {
    it('should create remember me token', async () => {
      const req = createMockRequest();

      const { token, series } = await sessionService.createRememberMeToken(
        testUserId,
        req as Request
      );

      expect(token).toBeDefined();
      expect(token).toHaveLength(64); // 32 bytes hex
      expect(series).toBeDefined();
      expect(series).toHaveLength(32); // 16 bytes hex

      // Verify in database
      const result = await pool.query(
        'SELECT * FROM remember_me_tokens WHERE user_id = $1 AND series = $2',
        [testUserId, series]
      );

      expect(result.rows).toHaveLength(1);
    });

    it('should validate correct remember me token', async () => {
      const req = createMockRequest();

      const { token, series } = await sessionService.createRememberMeToken(
        testUserId,
        req as Request
      );

      const userId = await sessionService.validateRememberMeToken(token, series, req as Request);

      expect(userId).toBe(testUserId);
    });

    it('should reject invalid remember me token', async () => {
      const req = createMockRequest();

      const userId = await sessionService.validateRememberMeToken(
        'invalid-token',
        'invalid-series',
        req as Request
      );

      expect(userId).toBeNull();
    });

    it('should rotate remember me token after validation', async () => {
      const req = createMockRequest();

      const { token, series } = await sessionService.createRememberMeToken(
        testUserId,
        req as Request
      );

      // First validation should succeed and rotate
      const userId = await sessionService.validateRememberMeToken(token, series, req as Request);
      expect(userId).toBe(testUserId);

      // Old token should no longer work
      const userId2 = await sessionService.validateRememberMeToken(token, series, req as Request);
      expect(userId2).toBeNull();
    });

    it('should delete all tokens on fingerprint mismatch (security measure)', async () => {
      const req = createMockRequest();

      const { token, series } = await sessionService.createRememberMeToken(
        testUserId,
        req as Request
      );

      // Try to validate with different fingerprint
      const differentReq = createMockRequest('10.0.0.1', 'DifferentBrowser/1.0');
      const userId = await sessionService.validateRememberMeToken(
        token,
        series,
        differentReq as Request
      );

      expect(userId).toBeNull();

      // All tokens should be deleted
      const result = await pool.query('SELECT * FROM remember_me_tokens WHERE user_id = $1', [
        testUserId,
      ]);
      expect(result.rows).toHaveLength(0);
    });

    it('should not validate expired token', async () => {
      const req = createMockRequest();

      const { token, series } = await sessionService.createRememberMeToken(
        testUserId,
        req as Request
      );

      // Manually expire the token
      await pool.query(
        'UPDATE remember_me_tokens SET expires_at = NOW() - INTERVAL \'1 day\' WHERE series = $1',
        [series]
      );

      const userId = await sessionService.validateRememberMeToken(token, series, req as Request);

      expect(userId).toBeNull();
    });
  });

  describe('Session Cleanup', () => {
    it('should cleanup expired sessions', async () => {
      const req = createMockRequest();

      // Create active session
      const activeSessionId = `active-${Date.now()}`;
      await sessionService.createSession(testUserId, activeSessionId, req as Request);

      // Create expired session
      const expiredSessionId = `expired-${Date.now()}`;
      await sessionService.createSession(testUserId, expiredSessionId, req as Request);
      await pool.query(
        'UPDATE user_sessions SET expires_at = NOW() - INTERVAL \'1 hour\' WHERE session_id = $1',
        [expiredSessionId]
      );

      // Run cleanup
      const result = await sessionService.cleanupExpiredSessions();

      expect(result.sessions).toBeGreaterThanOrEqual(1);

      // Expired session should be inactive
      const expiredResult = await pool.query(
        'SELECT is_active FROM user_sessions WHERE session_id = $1',
        [expiredSessionId]
      );
      expect(expiredResult.rows[0].is_active).toBe(false);

      // Active session should still be active
      const activeResult = await pool.query(
        'SELECT is_active FROM user_sessions WHERE session_id = $1',
        [activeSessionId]
      );
      expect(activeResult.rows[0].is_active).toBe(true);
    });

    it('should cleanup expired remember me tokens', async () => {
      const req = createMockRequest();

      // Create valid token
      const validToken = await sessionService.createRememberMeToken(testUserId, req as Request);

      // Create expired token
      const expiredToken = await sessionService.createRememberMeToken(testUserId, req as Request);
      await pool.query(
        'UPDATE remember_me_tokens SET expires_at = NOW() - INTERVAL \'1 day\' WHERE series = $1',
        [expiredToken.series]
      );

      // Run cleanup
      const result = await sessionService.cleanupExpiredSessions();

      expect(result.tokens).toBeGreaterThanOrEqual(1);

      // Expired token should be deleted
      const expiredResult = await pool.query(
        'SELECT * FROM remember_me_tokens WHERE series = $1',
        [expiredToken.series]
      );
      expect(expiredResult.rows).toHaveLength(0);

      // Valid token should still exist
      const validResult = await pool.query(
        'SELECT * FROM remember_me_tokens WHERE series = $1',
        [validToken.series]
      );
      expect(validResult.rows).toHaveLength(1);
    });
  });

  describe('Session Statistics', () => {
    it('should return correct session statistics', async () => {
      const req = createMockRequest();

      // Create multiple sessions
      for (let i = 0; i < 2; i++) {
        const sessionId = `stats-session-${i}-${Date.now()}`;
        await sessionService.createSession(testUserId, sessionId, req as Request);
      }

      const statistics = await sessionService.getSessionStatistics(testUserId);

      expect(statistics.active).toBe(2);
      expect(statistics.total).toBeGreaterThanOrEqual(2);
      expect(statistics.devices).toBeGreaterThanOrEqual(1);
      expect(statistics.oldestSession).toBeDefined();
      expect(statistics.newestSession).toBeDefined();
    });

    it('should return zero statistics for user with no sessions', async () => {
      // Create a new user with no sessions
      const newUserResult = await pool.query(
        `INSERT INTO users (email, username, password_hash, email_verified)
         VALUES ($1, $2, $3, TRUE)
         RETURNING id`,
        ['nosessions@example.com', 'nosessionsuser', 'hashedpassword123']
      );

      const newUserId = newUserResult.rows[0].id;

      const statistics = await sessionService.getSessionStatistics(newUserId);

      expect(statistics.active).toBe(0);
      expect(statistics.total).toBe(0);
      expect(statistics.devices).toBe(0);

      // Clean up
      await pool.query('DELETE FROM users WHERE id = $1', [newUserId]);
    });
  });
});
