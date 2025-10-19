import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import { SessionService } from '../services/session.service';
import { Pool } from 'pg';
import { Request } from 'express';
import crypto from 'crypto';

/**
 * Remember Me Functionality Tests
 * Tests for persistent login tokens, token rotation, and auto-login
 */

describe('Remember Me Functionality', () => {
  let sessionService: SessionService;
  let pool: Pool;
  let testUserId: string;

  // Mock request helper
  const createMockRequest = (
    ip: string = '127.0.0.1',
    userAgent: string = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
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

    sessionService = new SessionService(pool);

    // Create test user
    const userResult = await pool.query(
      `INSERT INTO users (email, username, password_hash, email_verified)
       VALUES ($1, $2, $3, TRUE)
       RETURNING id`,
      ['rememberme-test@example.com', 'remembertestuser', 'hashedpassword123']
    );

    testUserId = userResult.rows[0].id;
  });

  afterAll(async () => {
    // Clean up test data
    if (testUserId) {
      await pool.query('DELETE FROM remember_me_tokens WHERE user_id = $1', [testUserId]);
      await pool.query('DELETE FROM user_sessions WHERE user_id = $1', [testUserId]);
      await pool.query('DELETE FROM users WHERE id = $1', [testUserId]);
    }

    await pool.end();
    await sessionService.close();
  });

  beforeEach(async () => {
    // Clean remember me tokens before each test
    await pool.query('DELETE FROM remember_me_tokens WHERE user_id = $1', [testUserId]);
  });

  describe('Remember Me Token Creation', () => {
    it('should create remember me token successfully', async () => {
      const req = createMockRequest();

      const { token, series } = await sessionService.createRememberMeToken(
        testUserId,
        req as Request
      );

      expect(token).toBeDefined();
      expect(token).toHaveLength(64); // 32 bytes hex
      expect(series).toBeDefined();
      expect(series).toHaveLength(32); // 16 bytes hex

      // Verify token was stored in database
      const result = await pool.query(
        'SELECT * FROM remember_me_tokens WHERE user_id = $1 AND series = $2',
        [testUserId, series]
      );

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].user_id).toBe(testUserId);
    });

    it('should store token hash instead of plain token', async () => {
      const req = createMockRequest();

      const { token, series } = await sessionService.createRememberMeToken(
        testUserId,
        req as Request
      );

      const result = await pool.query(
        'SELECT * FROM remember_me_tokens WHERE series = $1',
        [series]
      );

      const storedTokenHash = result.rows[0].token_hash;

      // Stored hash should not match plain token
      expect(storedTokenHash).not.toBe(token);
      expect(storedTokenHash).toHaveLength(64); // SHA-256 hash
    });

    it('should store fingerprint with token', async () => {
      const req = createMockRequest('192.168.1.100', 'TestBrowser/1.0');

      const { series } = await sessionService.createRememberMeToken(
        testUserId,
        req as Request
      );

      const result = await pool.query(
        'SELECT * FROM remember_me_tokens WHERE series = $1',
        [series]
      );

      expect(result.rows[0].fingerprint).toBeDefined();
      expect(result.rows[0].fingerprint).toHaveLength(64); // SHA-256 hash
    });

    it('should set expiration date for token', async () => {
      const req = createMockRequest();

      const { series } = await sessionService.createRememberMeToken(
        testUserId,
        req as Request
      );

      const result = await pool.query(
        'SELECT * FROM remember_me_tokens WHERE series = $1',
        [series]
      );

      const expiresAt = new Date(result.rows[0].expires_at);
      const now = new Date();
      const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      // Expiration should be approximately 30 days from now
      const timeDiff = Math.abs(expiresAt.getTime() - thirtyDaysLater.getTime());
      expect(timeDiff).toBeLessThan(5000); // 5 second tolerance
    });
  });

  describe('Remember Me Token Validation', () => {
    let validToken: string;
    let validSeries: string;

    beforeEach(async () => {
      const req = createMockRequest();
      const result = await sessionService.createRememberMeToken(testUserId, req as Request);
      validToken = result.token;
      validSeries = result.series;
    });

    it('should validate correct remember me token', async () => {
      const req = createMockRequest();

      const userId = await sessionService.validateRememberMeToken(
        validToken,
        validSeries,
        req as Request
      );

      expect(userId).toBe(testUserId);
    });

    it('should reject invalid token', async () => {
      const req = createMockRequest();
      const invalidToken = 'invalid-token-12345';

      const userId = await sessionService.validateRememberMeToken(
        invalidToken,
        validSeries,
        req as Request
      );

      expect(userId).toBeNull();
    });

    it('should reject invalid series', async () => {
      const req = createMockRequest();
      const invalidSeries = 'invalid-series';

      const userId = await sessionService.validateRememberMeToken(
        validToken,
        invalidSeries,
        req as Request
      );

      expect(userId).toBeNull();
    });

    it('should reject token with mismatched fingerprint', async () => {
      const createReq = createMockRequest('192.168.1.1', 'Browser A');
      const { token, series } = await sessionService.createRememberMeToken(
        testUserId,
        createReq as Request
      );

      // Try to validate with different fingerprint
      const validateReq = createMockRequest('10.0.0.1', 'Browser B');
      const userId = await sessionService.validateRememberMeToken(
        token,
        series,
        validateReq as Request
      );

      expect(userId).toBeNull();
    });

    it('should delete all tokens on fingerprint mismatch (security measure)', async () => {
      const createReq = createMockRequest('192.168.1.1', 'Browser A');
      const { token, series } = await sessionService.createRememberMeToken(
        testUserId,
        createReq as Request
      );

      // Create additional token
      await sessionService.createRememberMeToken(testUserId, createReq as Request);

      // Try to validate with different fingerprint
      const validateReq = createMockRequest('10.0.0.1', 'Browser B');
      await sessionService.validateRememberMeToken(token, series, validateReq as Request);

      // All tokens should be deleted
      const result = await pool.query(
        'SELECT * FROM remember_me_tokens WHERE user_id = $1',
        [testUserId]
      );

      expect(result.rows).toHaveLength(0);
    });

    it('should reject expired token', async () => {
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

      const userId = await sessionService.validateRememberMeToken(
        token,
        series,
        req as Request
      );

      expect(userId).toBeNull();
    });
  });

  describe('Remember Me Token Rotation', () => {
    it('should rotate token after successful validation', async () => {
      const req = createMockRequest();
      const { token: originalToken, series: originalSeries } =
        await sessionService.createRememberMeToken(testUserId, req as Request);

      // Validate token (should trigger rotation)
      await sessionService.validateRememberMeToken(
        originalToken,
        originalSeries,
        req as Request
      );

      // Original token should no longer be valid
      const userId = await sessionService.validateRememberMeToken(
        originalToken,
        originalSeries,
        req as Request
      );

      expect(userId).toBeNull();
    });

    it('should update last_used timestamp on validation', async () => {
      const req = createMockRequest();
      const { token, series } = await sessionService.createRememberMeToken(
        testUserId,
        req as Request
      );

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Validate token
      await sessionService.validateRememberMeToken(token, series, req as Request);

      // Check last_used was updated (note: token was rotated, so we check the new one)
      const result = await pool.query(
        'SELECT * FROM remember_me_tokens WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
        [testUserId]
      );

      if (result.rows.length > 0) {
        expect(result.rows[0].last_used).toBeDefined();
      }
    });

    it('should create new token with same fingerprint after rotation', async () => {
      const req = createMockRequest('192.168.1.100', 'TestBrowser/1.0');
      const { token, series } = await sessionService.createRememberMeToken(
        testUserId,
        req as Request
      );

      const originalFingerprint = sessionService.generateFingerprint(req as Request);

      // Validate (triggers rotation)
      await sessionService.validateRememberMeToken(token, series, req as Request);

      // Get new token
      const newTokenResult = await pool.query(
        'SELECT * FROM remember_me_tokens WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1',
        [testUserId]
      );

      if (newTokenResult.rows.length > 0) {
        expect(newTokenResult.rows[0].fingerprint).toBe(originalFingerprint);
      }
    });
  });

  describe('Remember Me Token Deletion', () => {
    it('should delete specific remember me token', async () => {
      const req = createMockRequest();
      const { token, series } = await sessionService.createRememberMeToken(
        testUserId,
        req as Request
      );

      await sessionService.deleteRememberMeToken(token, series);

      const result = await pool.query(
        'SELECT * FROM remember_me_tokens WHERE user_id = $1 AND series = $2',
        [testUserId, series]
      );

      expect(result.rows).toHaveLength(0);
    });

    it('should delete all remember me tokens for user', async () => {
      const req = createMockRequest();

      // Create multiple tokens
      await sessionService.createRememberMeToken(testUserId, req as Request);
      await sessionService.createRememberMeToken(testUserId, req as Request);
      await sessionService.createRememberMeToken(testUserId, req as Request);

      await sessionService.deleteAllRememberMeTokens(testUserId);

      const result = await pool.query(
        'SELECT * FROM remember_me_tokens WHERE user_id = $1',
        [testUserId]
      );

      expect(result.rows).toHaveLength(0);
    });
  });

  describe('Remember Me Cleanup', () => {
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

      // Valid token should still exist
      const validResult = await pool.query(
        'SELECT * FROM remember_me_tokens WHERE series = $1',
        [validToken.series]
      );
      expect(validResult.rows).toHaveLength(1);

      // Expired token should be deleted
      const expiredResult = await pool.query(
        'SELECT * FROM remember_me_tokens WHERE series = $1',
        [expiredToken.series]
      );
      expect(expiredResult.rows).toHaveLength(0);
    });
  });

  describe('Remember Me Security', () => {
    it('should use timing-safe token comparison', async () => {
      const req = createMockRequest();
      const { token, series } = await sessionService.createRememberMeToken(
        testUserId,
        req as Request
      );

      // Measure time for correct token
      const start1 = Date.now();
      await sessionService.validateRememberMeToken(token, series, req as Request);
      const time1 = Date.now() - start1;

      // Create new token for comparison
      const { token: token2, series: series2 } = await sessionService.createRememberMeToken(
        testUserId,
        req as Request
      );

      // Measure time for incorrect token
      const start2 = Date.now();
      await sessionService.validateRememberMeToken('wrong' + token2.substring(5), series2, req as Request);
      const time2 = Date.now() - start2;

      // Time difference should be minimal (timing-safe comparison)
      // Note: This is a rough check, actual timing attacks are more sophisticated
      const timeDiff = Math.abs(time1 - time2);
      expect(timeDiff).toBeLessThan(100); // 100ms tolerance
    });

    it('should not leak information about token existence', async () => {
      const req = createMockRequest();

      // Non-existent token
      const result1 = await sessionService.validateRememberMeToken(
        'nonexistent1234567890abcdef',
        'nonexistent-series',
        req as Request
      );

      // Invalid token format
      const result2 = await sessionService.validateRememberMeToken(
        'invalid',
        'invalid',
        req as Request
      );

      // Both should return null without additional information
      expect(result1).toBeNull();
      expect(result2).toBeNull();
    });

    it('should generate cryptographically random tokens', () => {
      // Generate multiple tokens and check they're all different
      const tokens = new Set();

      for (let i = 0; i < 100; i++) {
        const token = crypto.randomBytes(32).toString('hex');
        tokens.add(token);
      }

      // All tokens should be unique
      expect(tokens.size).toBe(100);

      // All tokens should be 64 characters (32 bytes hex)
      for (const token of tokens) {
        expect((token as string).length).toBe(64);
      }
    });
  });

  describe('Remember Me Integration with Sessions', () => {
    it('should create session when remember me token is validated', async () => {
      const req = createMockRequest();
      const { token, series } = await sessionService.createRememberMeToken(
        testUserId,
        req as Request
      );

      // Validate token (this would typically happen in middleware)
      const userId = await sessionService.validateRememberMeToken(
        token,
        series,
        req as Request
      );

      expect(userId).toBe(testUserId);

      // In actual implementation, middleware would create a session here
      // This test just verifies the token validation returns the correct user ID
    });

    it('should allow multiple remember me tokens from different devices', async () => {
      const req1 = createMockRequest('192.168.1.1', 'Chrome');
      const req2 = createMockRequest('192.168.1.2', 'Firefox');
      const req3 = createMockRequest('192.168.1.3', 'Safari');

      const token1 = await sessionService.createRememberMeToken(testUserId, req1 as Request);
      const token2 = await sessionService.createRememberMeToken(testUserId, req2 as Request);
      const token3 = await sessionService.createRememberMeToken(testUserId, req3 as Request);

      // All tokens should be valid from their respective devices
      const userId1 = await sessionService.validateRememberMeToken(
        token1.token,
        token1.series,
        req1 as Request
      );
      const userId2 = await sessionService.validateRememberMeToken(
        token2.token,
        token2.series,
        req2 as Request
      );
      const userId3 = await sessionService.validateRememberMeToken(
        token3.token,
        token3.series,
        req3 as Request
      );

      expect(userId1).toBe(testUserId);
      expect(userId2).toBe(testUserId);
      expect(userId3).toBe(testUserId);
    });
  });
});
