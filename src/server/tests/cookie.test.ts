import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import {
  CookieUtil,
  initializeCookieUtil,
  getCookieUtil,
  validateCookieSecurity,
  getCookiePrefix,
  isSessionCookie,
  isPersistentCookie,
} from '../utils/cookie.util';
import { CookieCleanupService, initializeCookieCleanup } from '../services/cookie-cleanup.service';
import { Pool } from 'pg';
import crypto from 'crypto';

/**
 * Cookie Security Tests
 * Tests for cookie encryption, security, and cleanup utilities
 */

describe('Cookie Utility', () => {
  let cookieUtil: CookieUtil;
  let encryptionKey: string;
  let signingSecret: string;

  beforeAll(() => {
    encryptionKey = crypto.randomBytes(32).toString('hex');
    signingSecret = crypto.randomBytes(32).toString('hex');

    cookieUtil = initializeCookieUtil({
      encryptionKey,
      signingSecret,
      defaultOptions: {
        httpOnly: true,
        secure: false, // For testing
        sameSite: 'strict',
      },
    });
  });

  describe('Cookie Encryption', () => {
    it('should encrypt and decrypt cookie value successfully', () => {
      const originalValue = 'sensitive-data-123';

      const encrypted = cookieUtil.encrypt(originalValue);
      const decrypted = cookieUtil.decrypt(encrypted);

      expect(decrypted).toBe(originalValue);
      expect(encrypted).not.toBe(originalValue);
    });

    it('should produce different encrypted values for same input', () => {
      const value = 'test-value';

      const encrypted1 = cookieUtil.encrypt(value);
      const encrypted2 = cookieUtil.encrypt(value);

      // Should be different due to random IV
      expect(encrypted1).not.toBe(encrypted2);

      // But both should decrypt to same value
      expect(cookieUtil.decrypt(encrypted1)).toBe(value);
      expect(cookieUtil.decrypt(encrypted2)).toBe(value);
    });

    it('should return null for invalid encrypted value', () => {
      const invalidEncrypted = 'invalid-encrypted-data';

      const decrypted = cookieUtil.decrypt(invalidEncrypted);

      expect(decrypted).toBeNull();
    });

    it('should return null for tampered encrypted value', () => {
      const originalValue = 'test-value';
      const encrypted = cookieUtil.encrypt(originalValue);

      // Tamper with encrypted value
      const tampered = encrypted.substring(0, encrypted.length - 10) + 'tampered!!';

      const decrypted = cookieUtil.decrypt(tampered);

      expect(decrypted).toBeNull();
    });
  });

  describe('Cookie Signing', () => {
    it('should sign and verify cookie value successfully', () => {
      const originalValue = 'user-session-id';

      const signed = cookieUtil.sign(originalValue);
      const verified = cookieUtil.verify(signed);

      expect(verified).toBe(originalValue);
      expect(signed).toContain('.');
      expect(signed).toContain(originalValue);
    });

    it('should return null for invalid signature', () => {
      const value = 'test-value';
      const signed = cookieUtil.sign(value);

      // Tamper with signature
      const [val, sig] = signed.split('.');
      const tamperedSigned = `${val}.${sig.substring(0, sig.length - 5)}aaaaa`;

      const verified = cookieUtil.verify(tamperedSigned);

      expect(verified).toBeNull();
    });

    it('should return null for unsigned value', () => {
      const unsigned = 'plain-value-without-signature';

      const verified = cookieUtil.verify(unsigned);

      expect(verified).toBeNull();
    });

    it('should handle values with dots correctly', () => {
      const value = 'value.with.dots.inside';

      const signed = cookieUtil.sign(value);
      const verified = cookieUtil.verify(signed);

      expect(verified).toBe(value);
    });
  });

  describe('Secure Cookie Operations', () => {
    it('should set secure cookie with encryption', () => {
      const name = 'test_cookie';
      const value = 'secret-value';

      const { name: finalName, value: processedValue, options } =
        cookieUtil.setSecureCookie(name, value, { encrypted: true });

      expect(finalName).toBe(name);
      expect(processedValue).not.toBe(value);
      expect(options.httpOnly).toBe(true);

      // Verify we can decrypt it
      const decrypted = cookieUtil.decrypt(processedValue);
      expect(decrypted).toBe(value);
    });

    it('should set secure cookie with signing', () => {
      const name = 'test_cookie';
      const value = 'session-id';

      const { name: finalName, value: processedValue } = cookieUtil.setSecureCookie(
        name,
        value,
        { signed: true }
      );

      expect(finalName).toBe(name);
      expect(processedValue).toContain('.');

      // Verify signature
      const verified = cookieUtil.verify(processedValue);
      expect(verified).toBe(value);
    });

    it('should set secure cookie with both encryption and signing', () => {
      const name = 'test_cookie';
      const value = 'sensitive-data';

      const { value: processedValue } = cookieUtil.setSecureCookie(name, value, {
        encrypted: true,
        signed: true,
      });

      // First verify signature
      const verified = cookieUtil.verify(processedValue);
      expect(verified).not.toBeNull();

      // Then decrypt
      const decrypted = cookieUtil.decrypt(verified!);
      expect(decrypted).toBe(value);
    });

    it('should get secure cookie with automatic decryption and verification', () => {
      const value = 'test-data';

      // Encrypt and sign
      const encrypted = cookieUtil.encrypt(value);
      const signed = cookieUtil.sign(encrypted);

      // Get secure cookie
      const retrieved = cookieUtil.getSecureCookie(signed, {
        signed: true,
        encrypted: true,
      });

      expect(retrieved).toBe(value);
    });
  });

  describe('JSON Cookie Serialization', () => {
    it('should serialize and deserialize JSON cookie', () => {
      const name = 'user_preferences';
      const data = {
        theme: 'dark',
        language: 'en',
        notifications: true,
      };

      const { value: serialized } = cookieUtil.serializeJson(name, data);
      const deserialized = cookieUtil.deserializeJson(serialized);

      expect(deserialized).toEqual(data);
    });

    it('should serialize and deserialize JSON with encryption', () => {
      const name = 'user_data';
      const data = {
        userId: '123',
        email: 'test@example.com',
      };

      const { value: serialized } = cookieUtil.serializeJson(name, data, {
        encrypted: true,
      });

      const deserialized = cookieUtil.deserializeJson(serialized, {
        encrypted: true,
      });

      expect(deserialized).toEqual(data);
    });

    it('should return null for invalid JSON', () => {
      const invalidJson = 'not-valid-json{]';

      const deserialized = cookieUtil.deserializeJson(invalidJson);

      expect(deserialized).toBeNull();
    });
  });

  describe('Cookie Validation', () => {
    it('should validate valid cookie name', () => {
      const validNames = ['session', 'user_token', 'csrf-token', 'preference123'];

      for (const name of validNames) {
        expect(cookieUtil.isValidCookieName(name)).toBe(true);
      }
    });

    it('should reject invalid cookie names', () => {
      const invalidNames = [
        'cookie with spaces',
        'cookie;injection',
        'cookie=value',
        'cookie,comma',
        '',
      ];

      for (const name of invalidNames) {
        expect(cookieUtil.isValidCookieName(name)).toBe(false);
      }
    });

    it('should validate valid cookie value', () => {
      const validValues = [
        'simple-value',
        'base64EncodedValue==',
        'hex1234567890abcdef',
      ];

      for (const value of validValues) {
        expect(cookieUtil.isValidCookieValue(value)).toBe(true);
      }
    });

    it('should reject invalid cookie values', () => {
      const invalidValues = [
        'value with spaces',
        'value;semicolon',
        'value,comma',
        'value\x00null',
      ];

      for (const value of invalidValues) {
        expect(cookieUtil.isValidCookieValue(value)).toBe(false);
      }
    });

    it('should sanitize cookie value', () => {
      const dirtyValue = '\x00\x01test\x02value\x03   ';
      const sanitized = cookieUtil.sanitizeCookieValue(dirtyValue);

      expect(sanitized).toBe('testvalue');
    });
  });

  describe('Cookie Size Validation', () => {
    it('should validate cookie within size limit', () => {
      const name = 'test';
      const value = 'a'.repeat(1000);

      const isValid = cookieUtil.validateCookieSize(name, value);

      expect(isValid).toBe(true);
    });

    it('should reject cookie exceeding size limit', () => {
      const name = 'test';
      const value = 'a'.repeat(5000); // Exceeds 4KB

      const isValid = cookieUtil.validateCookieSize(name, value);

      expect(isValid).toBe(false);
    });
  });

  describe('Cookie Expiration', () => {
    it('should check if cookie is expired', () => {
      const maxAge = 1000; // 1 second
      const setTime = Date.now() - 2000; // 2 seconds ago

      const isExpired = cookieUtil.isExpired(maxAge, setTime);

      expect(isExpired).toBe(true);
    });

    it('should check if cookie is not expired', () => {
      const maxAge = 10000; // 10 seconds
      const setTime = Date.now() - 5000; // 5 seconds ago

      const isExpired = cookieUtil.isExpired(maxAge, setTime);

      expect(isExpired).toBe(false);
    });

    it('should create expiry date', () => {
      const maxAge = 60000; // 1 minute
      const expiryDate = cookieUtil.createExpiryDate(maxAge);
      const expectedTime = Date.now() + maxAge;

      // Allow 100ms tolerance
      expect(Math.abs(expiryDate.getTime() - expectedTime)).toBeLessThan(100);
    });
  });

  describe('Cookie Parsing', () => {
    it('should parse cookie string into object', () => {
      const cookieString = 'session=abc123; user=john; theme=dark';

      const cookies = cookieUtil.parseCookieString(cookieString);

      expect(cookies).toEqual({
        session: 'abc123',
        user: 'john',
        theme: 'dark',
      });
    });

    it('should handle empty cookie string', () => {
      const cookies = cookieUtil.parseCookieString('');

      expect(cookies).toEqual({});
    });

    it('should handle cookies with = in value', () => {
      const cookieString = 'data=key=value=encoded';

      const cookies = cookieUtil.parseCookieString(cookieString);

      expect(cookies.data).toBe('key=value=encoded');
    });
  });

  describe('Cookie Header Serialization', () => {
    it('should serialize cookie header with all options', () => {
      const header = cookieUtil.serializeCookieHeader('session', 'abc123', {
        maxAge: 3600000,
        domain: 'example.com',
        path: '/',
        secure: true,
        httpOnly: true,
        sameSite: 'strict',
      });

      expect(header).toContain('session=abc123');
      expect(header).toContain('Max-Age=3600');
      expect(header).toContain('Domain=example.com');
      expect(header).toContain('Path=/');
      expect(header).toContain('Secure');
      expect(header).toContain('HttpOnly');
      expect(header).toContain('SameSite=Strict');
    });

    it('should create delete cookie header', () => {
      const header = cookieUtil.createDeleteCookieHeader('session');

      expect(header).toContain('Max-Age=0');
    });
  });

  describe('Cookie Security Score', () => {
    it('should calculate perfect security score', () => {
      const { score, recommendations } = cookieUtil.getCookieSecurityScore({
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        signed: true,
        encrypted: true,
      });

      expect(score).toBe(100);
      expect(recommendations).toHaveLength(0);
    });

    it('should provide recommendations for insecure cookies', () => {
      const { score, recommendations } = cookieUtil.getCookieSecurityScore({
        httpOnly: false,
        secure: false,
      });

      expect(score).toBeLessThan(50);
      expect(recommendations.length).toBeGreaterThan(0);
      expect(recommendations).toContain('Enable HttpOnly flag to prevent XSS attacks');
      expect(recommendations).toContain('Enable Secure flag to enforce HTTPS');
    });
  });

  describe('Cookie Security Validation', () => {
    it('should validate secure cookie configuration', () => {
      const { valid, errors } = validateCookieSecurity('test_cookie', {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
      });

      expect(valid).toBe(true);
      expect(errors).toHaveLength(0);
    });

    it('should detect __Secure- prefix violations', () => {
      const { valid, errors } = validateCookieSecurity('__Secure-test', {
        httpOnly: true,
        secure: false, // Violation
        sameSite: 'strict',
      });

      expect(valid).toBe(false);
      expect(errors).toContain('__Secure- prefix requires Secure flag');
    });

    it('should detect __Host- prefix violations', () => {
      const { valid, errors } = validateCookieSecurity('__Host-test', {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        domain: 'example.com', // Violation
        path: '/app', // Violation
      });

      expect(valid).toBe(false);
      expect(errors).toContain('__Host- prefix cannot have Domain attribute');
      expect(errors).toContain('__Host- prefix requires Path=/');
    });
  });

  describe('Cookie Type Helpers', () => {
    it('should identify session cookie', () => {
      const options = { httpOnly: true, secure: true };

      expect(isSessionCookie(options)).toBe(true);
    });

    it('should identify persistent cookie', () => {
      const options = { httpOnly: true, secure: true, maxAge: 86400000 };

      expect(isPersistentCookie(options)).toBe(true);
    });
  });

  describe('Cookie Prefix Generation', () => {
    it('should generate __Secure- prefix', () => {
      const prefix = getCookiePrefix({
        secure: true,
        path: '/app',
      });

      expect(prefix).toBe('__Secure-');
    });

    it('should generate __Host- prefix', () => {
      const prefix = getCookiePrefix({
        secure: true,
        path: '/',
      });

      expect(prefix).toBe('__Host-');
    });

    it('should not generate prefix for non-secure cookie', () => {
      const prefix = getCookiePrefix({
        secure: false,
        path: '/',
      });

      expect(prefix).toBe('');
    });
  });
});

describe('Cookie Cleanup Service', () => {
  let pool: Pool;
  let cleanupService: CookieCleanupService;

  beforeAll(async () => {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://localhost/test_db',
    });

    // Create cookie tracking table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS cookie_tracking (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID,
        cookie_name VARCHAR(255) NOT NULL,
        cookie_value_hash VARCHAR(64) NOT NULL,
        ip_address VARCHAR(45),
        user_agent TEXT,
        expires_at TIMESTAMP,
        is_secure BOOLEAN DEFAULT FALSE,
        is_http_only BOOLEAN DEFAULT FALSE,
        same_site VARCHAR(20),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_accessed TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        access_count INTEGER DEFAULT 1,
        UNIQUE(cookie_name, cookie_value_hash)
      )
    `);

    cleanupService = new CookieCleanupService(pool);
  });

  afterAll(async () => {
    await pool.query('DROP TABLE IF EXISTS cookie_tracking');
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query('DELETE FROM cookie_tracking');
  });

  it('should track cookie creation', async () => {
    await cleanupService.trackCookie('session', 'abc123', {
      userId: 'test-user',
      isSecure: true,
      isHttpOnly: true,
      sameSite: 'strict',
    });

    const result = await pool.query(
      'SELECT * FROM cookie_tracking WHERE cookie_name = $1',
      ['session']
    );

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].is_secure).toBe(true);
    expect(result.rows[0].is_http_only).toBe(true);
  });

  it('should get cookie statistics', async () => {
    // Create test cookies
    await cleanupService.trackCookie('cookie1', 'value1', { isSecure: true });
    await cleanupService.trackCookie('cookie2', 'value2', { isSecure: false });

    const stats = await cleanupService.getCookieStats();

    expect(stats.totalCookies).toBe(2);
    expect(stats.secureCookies).toBe(1);
    expect(stats.nonSecureCookies).toBe(1);
  });

  it('should cleanup expired cookies', async () => {
    // Create expired cookie
    const expiredDate = new Date(Date.now() - 86400000); // 1 day ago
    await pool.query(
      `INSERT INTO cookie_tracking (cookie_name, cookie_value_hash, expires_at)
       VALUES ($1, $2, $3)`,
      ['expired', 'hash123', expiredDate]
    );

    const deletedCount = await cleanupService.cleanupExpiredCookies();

    expect(deletedCount).toBe(1);
  });

  it('should find suspicious patterns', async () => {
    // Create cookie with high access count
    await pool.query(
      `INSERT INTO cookie_tracking (cookie_name, cookie_value_hash, access_count)
       VALUES ($1, $2, $3)`,
      ['suspicious', 'hash456', 5000]
    );

    const patterns = await cleanupService.findSuspiciousPatterns();

    expect(patterns.highAccessCookies.length).toBeGreaterThan(0);
  });
});
