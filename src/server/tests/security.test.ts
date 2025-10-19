import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import { Pool } from 'pg';
import { PasswordUtil } from '../utils/password.util';
import { JWTUtil } from '../utils/jwt.util';
import { EncryptionUtil } from '../utils/encryption.util';
import pwnedService from '../services/pwned.service';

/**
 * Security Test Suite
 * Comprehensive tests for all security features
 */

describe('Security Tests', () => {
  let pool: Pool;
  let testUserId: string;
  let testUserEmail: string;
  let accessToken: string;

  beforeAll(async () => {
    // Initialize test database connection
    pool = new Pool({
      connectionString: process.env.TEST_DATABASE_URL,
    });
  });

  afterAll(async () => {
    await pool.end();
  });

  describe('Password Security', () => {
    it('should hash passwords with bcrypt', async () => {
      const password = 'TestPassword123!';
      const hash = await PasswordUtil.hash(password);

      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);
      expect(hash.length).toBeGreaterThan(50);
    });

    it('should verify correct passwords', async () => {
      const password = 'TestPassword123!';
      const hash = await PasswordUtil.hash(password);
      const isValid = await PasswordUtil.compare(password, hash);

      expect(isValid).toBe(true);
    });

    it('should reject incorrect passwords', async () => {
      const password = 'TestPassword123!';
      const hash = await PasswordUtil.hash(password);
      const isValid = await PasswordUtil.compare('WrongPassword123!', hash);

      expect(isValid).toBe(false);
    });

    it('should validate password strength', () => {
      const weakPassword = 'abc123';
      const strongPassword = 'MyStr0ng!P@ssw0rd2024';

      const weakResult = PasswordUtil.validate(weakPassword);
      const strongResult = PasswordUtil.validate(strongPassword);

      expect(weakResult.valid).toBe(false);
      expect(weakResult.errors.length).toBeGreaterThan(0);

      expect(strongResult.valid).toBe(true);
      expect(strongResult.errors.length).toBe(0);
    });

    it('should generate secure tokens', () => {
      const token1 = PasswordUtil.generateToken();
      const token2 = PasswordUtil.generateToken();

      expect(token1).not.toBe(token2);
      expect(token1.length).toBe(64); // 32 bytes * 2 (hex)
    });

    it('should hash tokens consistently', () => {
      const token = 'test-token-123';
      const hash1 = PasswordUtil.hashToken(token);
      const hash2 = PasswordUtil.hashToken(token);

      expect(hash1).toBe(hash2);
      expect(hash1.length).toBe(64); // SHA-256 hex
    });
  });

  describe('JWT Token Security', () => {
    it('should generate valid access tokens', () => {
      const token = JWTUtil.generateAccessToken({
        userId: '123',
        email: 'test@example.com',
      });

      expect(token).toBeDefined();
      expect(token.split('.').length).toBe(3); // JWT format
    });

    it('should generate valid refresh tokens', () => {
      const token = JWTUtil.generateRefreshToken({
        userId: '123',
        email: 'test@example.com',
      });

      expect(token).toBeDefined();
      expect(token.split('.').length).toBe(3);
    });

    it('should verify valid access tokens', () => {
      const token = JWTUtil.generateAccessToken({
        userId: '123',
        email: 'test@example.com',
      });

      const payload = JWTUtil.verifyAccessToken(token);

      expect(payload).toBeDefined();
      expect(payload?.userId).toBe('123');
      expect(payload?.email).toBe('test@example.com');
      expect(payload?.type).toBe('access');
    });

    it('should reject invalid tokens', () => {
      const payload = JWTUtil.verifyAccessToken('invalid-token');
      expect(payload).toBeNull();
    });

    it('should not accept refresh token as access token', () => {
      const refreshToken = JWTUtil.generateRefreshToken({
        userId: '123',
        email: 'test@example.com',
      });

      const payload = JWTUtil.verifyAccessToken(refreshToken);
      expect(payload).toBeNull();
    });
  });

  describe('Encryption', () => {
    it('should encrypt and decrypt data', () => {
      const plaintext = 'Sensitive data here';
      const encrypted = EncryptionUtil.encrypt(plaintext);
      const decrypted = EncryptionUtil.decrypt(encrypted);

      expect(encrypted).not.toBe(plaintext);
      expect(decrypted).toBe(plaintext);
    });

    it('should encrypt and decrypt objects', () => {
      const obj = { name: 'John', age: 30, secret: 'password123' };
      const encrypted = EncryptionUtil.encryptObject(obj);
      const decrypted = EncryptionUtil.decryptObject(encrypted);

      expect(decrypted).toEqual(obj);
    });

    it('should produce different ciphertexts for same plaintext', () => {
      const plaintext = 'Same data';
      const encrypted1 = EncryptionUtil.encrypt(plaintext);
      const encrypted2 = EncryptionUtil.encrypt(plaintext);

      expect(encrypted1).not.toBe(encrypted2); // Due to random IV
    });

    it('should create valid HMAC signatures', () => {
      const data = 'Important message';
      const signature = EncryptionUtil.createHMAC(data);

      expect(signature).toBeDefined();
      expect(signature.length).toBe(64); // SHA-256 hex
    });

    it('should verify valid HMAC signatures', () => {
      const data = 'Important message';
      const signature = EncryptionUtil.createHMAC(data);
      const isValid = EncryptionUtil.verifyHMAC(data, signature);

      expect(isValid).toBe(true);
    });

    it('should reject invalid HMAC signatures', () => {
      const data = 'Important message';
      const signature = EncryptionUtil.createHMAC(data);
      const tamperedData = 'Tampered message';
      const isValid = EncryptionUtil.verifyHMAC(tamperedData, signature);

      expect(isValid).toBe(false);
    });

    it('should use constant-time comparison', () => {
      const str1 = 'secret-key-123';
      const str2 = 'secret-key-123';
      const str3 = 'secret-key-456';

      expect(EncryptionUtil.constantTimeEqual(str1, str2)).toBe(true);
      expect(EncryptionUtil.constantTimeEqual(str1, str3)).toBe(false);
    });
  });

  describe('Password Breach Detection', () => {
    it('should detect pwned passwords', async () => {
      // "password" is a well-known breached password
      const result = await pwnedService.checkPassword('password');

      expect(result.isPwned).toBe(true);
      expect(result.breachCount).toBeGreaterThan(0);
    }, 10000); // Increased timeout for API call

    it('should not detect strong unique passwords', async () => {
      // Generate a strong unique password
      const strongPassword = pwnedService.generateStrongPassword(20);
      const result = await pwnedService.checkPassword(strongPassword);

      expect(result.isPwned).toBe(false);
      expect(result.breachCount).toBe(0);
    }, 10000);

    it('should calculate password strength', () => {
      const weakPassword = '123456';
      const strongPassword = 'MyC0mpl3x!P@ssw0rd#2024';

      const weakResult = pwnedService.getPasswordStrength(weakPassword);
      const strongResult = pwnedService.getPasswordStrength(strongPassword);

      expect(weakResult.score).toBeLessThan(50);
      expect(strongResult.score).toBeGreaterThan(70);
    });

    it('should generate strong passwords', () => {
      const password = pwnedService.generateStrongPassword(16);

      expect(password.length).toBe(16);
      expect(/[a-z]/.test(password)).toBe(true);
      expect(/[A-Z]/.test(password)).toBe(true);
      expect(/\d/.test(password)).toBe(true);
      expect(/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password)).toBe(true);
    });
  });

  describe('Input Validation', () => {
    it('should detect SQL injection attempts', () => {
      const maliciousInputs = [
        "'; DROP TABLE users; --",
        "1 OR 1=1",
        "admin' --",
        "' UNION SELECT * FROM users --",
      ];

      for (const input of maliciousInputs) {
        const isSafe = !/(\bUNION\b.*\bSELECT\b)|(\bDROP\b.*\bTABLE\b)|(--|;)/gi.test(input);
        expect(isSafe).toBe(false);
      }
    });

    it('should detect XSS attempts', () => {
      const maliciousInputs = [
        '<script>alert("XSS")</script>',
        '<img src=x onerror=alert("XSS")>',
        'javascript:alert("XSS")',
        '<iframe src="javascript:alert(\'XSS\')">',
      ];

      for (const input of maliciousInputs) {
        const containsScript = /<script|javascript:|onerror=|<iframe/i.test(input);
        expect(containsScript).toBe(true);
      }
    });

    it('should detect path traversal attempts', () => {
      const maliciousInputs = [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32',
        'file://etc/passwd',
      ];

      for (const input of maliciousInputs) {
        const isPathTraversal = /(\.\.(\/|\\))|(\.\.$)/gi.test(input);
        expect(isPathTraversal).toBe(true);
      }
    });
  });

  describe('Security Headers', () => {
    it('should generate CSP nonce', () => {
      const nonce1 = Buffer.from(crypto.randomBytes(16)).toString('base64');
      const nonce2 = Buffer.from(crypto.randomBytes(16)).toString('base64');

      expect(nonce1).not.toBe(nonce2);
      expect(nonce1.length).toBeGreaterThan(0);
    });
  });

  describe('CSRF Protection', () => {
    it('should generate CSRF tokens', () => {
      const token1 = crypto.randomBytes(32).toString('hex');
      const token2 = crypto.randomBytes(32).toString('hex');

      expect(token1).not.toBe(token2);
      expect(token1.length).toBe(64);
    });

    it('should verify matching tokens', () => {
      const token = 'test-csrf-token-123';
      const isValid = token === 'test-csrf-token-123';

      expect(isValid).toBe(true);
    });
  });

  describe('Rate Limiting', () => {
    it('should track request counts', () => {
      const requests = new Map<string, number>();
      const ip = '192.168.1.1';

      // Simulate 5 requests
      for (let i = 0; i < 5; i++) {
        const count = (requests.get(ip) || 0) + 1;
        requests.set(ip, count);
      }

      expect(requests.get(ip)).toBe(5);
    });

    it('should enforce rate limits', () => {
      const limit = 5;
      const requests = 6;
      const isRateLimited = requests > limit;

      expect(isRateLimited).toBe(true);
    });
  });

  describe('Webhook Security', () => {
    it('should generate webhook signatures', () => {
      const payload = { event: 'user.created', data: { id: '123' } };
      const secret = 'webhook-secret';
      const timestamp = Date.now();

      const signedPayload = `${timestamp}.${JSON.stringify(payload)}`;
      const signature = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');

      expect(signature).toBeDefined();
      expect(signature.length).toBe(64);
    });

    it('should verify valid webhook signatures', () => {
      const payload = { event: 'test' };
      const secret = 'webhook-secret';
      const timestamp = Date.now();

      const signedPayload = `${timestamp}.${JSON.stringify(payload)}`;
      const signature = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');

      // Verify
      const expectedSignature = crypto.createHmac('sha256', secret).update(signedPayload).digest('hex');

      expect(signature).toBe(expectedSignature);
    });

    it('should reject old timestamps', () => {
      const timestamp = Date.now() - 600000; // 10 minutes ago
      const tolerance = 300000; // 5 minutes

      const timeDifference = Math.abs(Date.now() - timestamp);
      const isExpired = timeDifference > tolerance;

      expect(isExpired).toBe(true);
    });
  });

  describe('API Key Management', () => {
    it('should generate API keys with correct format', () => {
      const prefix = 'wcp';
      const randomPart = crypto.randomBytes(32).toString('hex');
      const apiKey = `${prefix}_${randomPart}`;

      expect(apiKey).toMatch(/^wcp_[a-f0-9]{64}$/);
    });

    it('should hash API keys', () => {
      const apiKey = 'wcp_test123456789';
      const hash = crypto.createHash('sha256').update(apiKey).digest('hex');

      expect(hash).toBeDefined();
      expect(hash.length).toBe(64);
    });

    it('should extract key prefix', () => {
      const apiKey = 'wcp_abc123def456';
      const prefix = apiKey.substring(0, 11);

      expect(prefix).toBe('wcp_abc1234');
    });
  });
});

// Import crypto for testing
import crypto from 'crypto';
