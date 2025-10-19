import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import {
  RedisCacheService,
  initializeRedisCacheService,
  getRedisCacheService,
} from '../services/redis-cache.service.js';
import {
  EnhancedPwnedPasswordService,
  initializeEnhancedPwnedService,
  getEnhancedPwnedService,
} from '../services/pwned-enhanced.service.js';
import cacheRoutes from '../routes/cache.routes.js';

/**
 * Cache Service and Routes Tests
 *
 * Tests:
 * 1. Redis connection and health
 * 2. Basic cache operations (set, get, delete)
 * 3. TTL management
 * 4. Namespace support
 * 5. Pattern invalidation
 * 6. Password breach caching
 * 7. Rate limiting
 * 8. Statistics tracking
 * 9. Cache routes
 * 10. Password generation
 */

describe('Redis Cache Service Tests', () => {
  let cacheService: RedisCacheService;
  let pwnedService: EnhancedPwnedPasswordService;
  let app: Express;
  let adminToken: string;
  let userToken: string;

  // Mock users
  const adminUser = {
    userId: '00000000-0000-0000-0000-000000000001',
    email: 'admin@test.com',
    role: 'admin',
  };

  const regularUser = {
    userId: '00000000-0000-0000-0000-000000000002',
    email: 'user@test.com',
    role: 'user',
  };

  beforeAll(async () => {
    // Initialize services
    try {
      cacheService = await initializeRedisCacheService();
      pwnedService = await initializeEnhancedPwnedService();
    } catch (error) {
      console.warn('Redis not available, tests will be skipped');
    }

    // Generate tokens
    const secret = process.env.JWT_SECRET || 'test-secret';
    adminToken = jwt.sign(adminUser, secret, { expiresIn: '1h' });
    userToken = jwt.sign(regularUser, secret, { expiresIn: '1h' });

    // Setup Express app
    app = express();
    app.use(express.json());

    // Mock auth middleware
    app.use((req, res, next) => {
      const authHeader = req.headers.authorization;
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        try {
          const decoded = jwt.verify(token, secret);
          req.user = decoded;
        } catch (error) {
          // Invalid token
        }
      }
      next();
    });

    app.use('/api/cache', cacheRoutes);
  });

  afterAll(async () => {
    if (cacheService) {
      await cacheService.clearAll();
      await cacheService.disconnect();
    }
  });

  beforeEach(async () => {
    if (cacheService && cacheService.isConnected()) {
      await cacheService.clearAll();
      cacheService.resetStats();
    }
  });

  describe('Connection and Health', () => {
    it('should initialize Redis connection', () => {
      if (!cacheService) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      expect(cacheService).toBeDefined();
      expect(cacheService.isConnected()).toBe(true);
    });

    it('should pass health check', async () => {
      if (!cacheService || !cacheService.isConnected()) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      const healthy = await cacheService.healthCheck();
      expect(healthy).toBe(true);
    });

    it('should get health status via API', async () => {
      if (!cacheService || !cacheService.isConnected()) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      const response = await request(app)
        .get('/api/cache/health')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body.healthy).toBe(true);
      expect(response.body.timestamp).toBeDefined();
    });
  });

  describe('Basic Cache Operations', () => {
    it('should set and get cache value', async () => {
      if (!cacheService || !cacheService.isConnected()) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      const key = 'test-key';
      const value = { message: 'Hello, Redis!' };

      const setResult = await cacheService.set(key, value);
      expect(setResult).toBe(true);

      const getValue = await cacheService.get(key);
      expect(getValue).toEqual(value);
    });

    it('should return null for non-existent key', async () => {
      if (!cacheService || !cacheService.isConnected()) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      const value = await cacheService.get('non-existent-key');
      expect(value).toBeNull();
    });

    it('should delete cache value', async () => {
      if (!cacheService || !cacheService.isConnected()) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      const key = 'delete-test';
      await cacheService.set(key, 'value');

      const deleted = await cacheService.delete(key);
      expect(deleted).toBe(true);

      const value = await cacheService.get(key);
      expect(value).toBeNull();
    });

    it('should check if key exists', async () => {
      if (!cacheService || !cacheService.isConnected()) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      const key = 'exists-test';
      await cacheService.set(key, 'value');

      const exists = await cacheService.exists(key);
      expect(exists).toBe(true);

      const notExists = await cacheService.exists('non-existent');
      expect(notExists).toBe(false);
    });
  });

  describe('TTL Management', () => {
    it('should set cache with TTL', async () => {
      if (!cacheService || !cacheService.isConnected()) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      const key = 'ttl-test';
      const value = 'temporary';
      const ttl = 10; // 10 seconds

      await cacheService.set(key, value, { ttl });

      const retrievedTtl = await cacheService.getTTL(key);
      expect(retrievedTtl).toBeGreaterThan(0);
      expect(retrievedTtl).toBeLessThanOrEqual(ttl);
    });

    it('should expire key after TTL', async () => {
      if (!cacheService || !cacheService.isConnected()) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      const key = 'expire-test';
      const value = 'will-expire';
      const ttl = 1; // 1 second

      await cacheService.set(key, value, { ttl });

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 1500));

      const expired = await cacheService.get(key);
      expect(expired).toBeNull();
    });
  });

  describe('Namespace Support', () => {
    it('should isolate keys by namespace', async () => {
      if (!cacheService || !cacheService.isConnected()) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      const key = 'same-key';
      const value1 = 'namespace1-value';
      const value2 = 'namespace2-value';

      await cacheService.set(key, value1, { namespace: 'ns1' });
      await cacheService.set(key, value2, { namespace: 'ns2' });

      const retrieved1 = await cacheService.get(key, { namespace: 'ns1' });
      const retrieved2 = await cacheService.get(key, { namespace: 'ns2' });

      expect(retrieved1).toBe(value1);
      expect(retrieved2).toBe(value2);
    });

    it('should clear namespace', async () => {
      if (!cacheService || !cacheService.isConnected()) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      const namespace = 'clear-test';
      await cacheService.set('key1', 'value1', { namespace });
      await cacheService.set('key2', 'value2', { namespace });
      await cacheService.set('key3', 'value3', { namespace: 'other' });

      const count = await cacheService.clearNamespace(namespace);
      expect(count).toBe(2);

      const value1 = await cacheService.get('key1', { namespace });
      const value2 = await cacheService.get('key2', { namespace });
      const value3 = await cacheService.get('key3', { namespace: 'other' });

      expect(value1).toBeNull();
      expect(value2).toBeNull();
      expect(value3).toBe('value3');
    });
  });

  describe('Pattern Invalidation', () => {
    it('should invalidate keys by pattern', async () => {
      if (!cacheService || !cacheService.isConnected()) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      await cacheService.set('user:1:profile', { name: 'User 1' });
      await cacheService.set('user:2:profile', { name: 'User 2' });
      await cacheService.set('user:1:settings', { theme: 'dark' });
      await cacheService.set('product:1', { name: 'Product 1' });

      const count = await cacheService.invalidatePattern('user:*');
      expect(count).toBe(3);

      const user1 = await cacheService.get('user:1:profile');
      const product1 = await cacheService.get('product:1');

      expect(user1).toBeNull();
      expect(product1).toEqual({ name: 'Product 1' });
    });
  });

  describe('Get or Set Pattern', () => {
    it('should execute function and cache result on cache miss', async () => {
      if (!cacheService || !cacheService.isConnected()) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      const key = 'expensive-operation';
      let callCount = 0;

      const expensiveFn = async () => {
        callCount++;
        return { result: 'computed', timestamp: Date.now() };
      };

      const result1 = await cacheService.getOrSet(key, expensiveFn);
      expect(callCount).toBe(1);

      const result2 = await cacheService.getOrSet(key, expensiveFn);
      expect(callCount).toBe(1); // Should not call function again
      expect(result2).toEqual(result1);
    });
  });

  describe('Password Breach Caching', () => {
    it('should cache password breach result', async () => {
      if (!cacheService || !cacheService.isConnected()) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      const passwordHash = 'ABC123DEF456';
      const result = { isPwned: true, breachCount: 1000 };

      const cached = await cacheService.cachePasswordBreachResult(passwordHash, result);
      expect(cached).toBe(true);

      const retrieved = await cacheService.getCachedPasswordBreachResult(passwordHash);
      expect(retrieved).toEqual(result);
    });

    it('should check password with caching', async () => {
      if (!pwnedService) {
        console.warn('Skipping test - Pwned service not available');
        return;
      }

      const password = 'TestPassword123!';

      // First check - cache miss
      const result1 = await pwnedService.checkPassword(password);
      expect(result1.cached).toBe(false);

      // Second check - cache hit
      const result2 = await pwnedService.checkPassword(password);
      expect(result2.cached).toBe(true);
      expect(result2.isPwned).toBe(result1.isPwned);
      expect(result2.breachCount).toBe(result1.breachCount);
    });

    it('should perform comprehensive password check', async () => {
      if (!pwnedService) {
        console.warn('Skipping test - Pwned service not available');
        return;
      }

      const password = 'MySecureP@ssw0rd2024!';

      const result = await pwnedService.checkPasswordComprehensive(password);

      expect(result).toHaveProperty('isPwned');
      expect(result).toHaveProperty('breachCount');
      expect(result).toHaveProperty('cached');
      expect(result).toHaveProperty('strength');
      expect(result).toHaveProperty('recommendation');

      expect(result.strength).toHaveProperty('score');
      expect(result.strength).toHaveProperty('feedback');
      expect(Array.isArray(result.strength.feedback)).toBe(true);
    });

    it('should check multiple passwords in batch', async () => {
      if (!pwnedService) {
        console.warn('Skipping test - Pwned service not available');
        return;
      }

      const passwords = ['password123', 'SecureP@ss1', 'AnotherOne!2'];

      const results = await pwnedService.checkPasswordsBatch(passwords);

      expect(results).toHaveLength(3);
      results.forEach((result) => {
        expect(result).toHaveProperty('isPwned');
        expect(result).toHaveProperty('breachCount');
        expect(result).toHaveProperty('cached');
      });
    });

    it('should invalidate password breach cache', async () => {
      if (!pwnedService || !cacheService || !cacheService.isConnected()) {
        console.warn('Skipping test - Services not available');
        return;
      }

      // Add some cached results
      await pwnedService.checkPassword('TestPassword1');
      await pwnedService.checkPassword('TestPassword2');

      const count = await pwnedService.invalidateCache();
      expect(count).toBeGreaterThanOrEqual(0);
    });

    it('should warm up cache with common passwords', async () => {
      if (!pwnedService) {
        console.warn('Skipping test - Pwned service not available');
        return;
      }

      const commonPasswords = ['password', '123456', 'qwerty'];

      const cached = await pwnedService.warmUpCache(commonPasswords);
      expect(cached).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Password Strength and Generation', () => {
    it('should calculate password strength', () => {
      if (!pwnedService) {
        console.warn('Skipping test - Pwned service not available');
        return;
      }

      const weakPassword = 'password';
      const strongPassword = 'MyV3ry$tr0ng&C0mpl3x!P@ssw0rd2024';

      const weakResult = pwnedService.getPasswordStrength(weakPassword);
      const strongResult = pwnedService.getPasswordStrength(strongPassword);

      expect(weakResult.score).toBeLessThan(strongResult.score);
      expect(weakResult.feedback.length).toBeGreaterThan(0);
    });

    it('should generate strong password', () => {
      if (!pwnedService) {
        console.warn('Skipping test - Pwned service not available');
        return;
      }

      const password = pwnedService.generateStrongPassword(16);

      expect(password).toHaveLength(16);
      expect(/[a-z]/.test(password)).toBe(true);
      expect(/[A-Z]/.test(password)).toBe(true);
      expect(/\d/.test(password)).toBe(true);
      expect(/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/.test(password)).toBe(true);
    });

    it('should generate password with custom options', () => {
      if (!pwnedService) {
        console.warn('Skipping test - Pwned service not available');
        return;
      }

      const password = pwnedService.generateStrongPassword(20, {
        includeLowercase: true,
        includeUppercase: true,
        includeNumbers: false,
        includeSpecial: false,
      });

      expect(password).toHaveLength(20);
      expect(/[a-z]/.test(password)).toBe(true);
      expect(/[A-Z]/.test(password)).toBe(true);
      expect(/\d/.test(password)).toBe(false);
    });
  });

  describe('Rate Limiting', () => {
    it('should increment rate limit counter', async () => {
      if (!cacheService || !cacheService.isConnected()) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      const identifier = 'user:123';
      const windowSeconds = 60;

      const count1 = await cacheService.incrementRateLimit(identifier, windowSeconds);
      expect(count1).toBe(1);

      const count2 = await cacheService.incrementRateLimit(identifier, windowSeconds);
      expect(count2).toBe(2);

      const count3 = await cacheService.incrementRateLimit(identifier, windowSeconds);
      expect(count3).toBe(3);
    });

    it('should get rate limit count', async () => {
      if (!cacheService || !cacheService.isConnected()) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      const identifier = 'user:456';

      await cacheService.incrementRateLimit(identifier);
      await cacheService.incrementRateLimit(identifier);

      const count = await cacheService.getRateLimitCount(identifier);
      expect(count).toBe(2);
    });

    it('should reset rate limit', async () => {
      if (!cacheService || !cacheService.isConnected()) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      const identifier = 'user:789';

      await cacheService.incrementRateLimit(identifier);
      await cacheService.resetRateLimit(identifier);

      const count = await cacheService.getRateLimitCount(identifier);
      expect(count).toBe(0);
    });
  });

  describe('Statistics', () => {
    it('should track cache hits and misses', async () => {
      if (!cacheService || !cacheService.isConnected()) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      cacheService.resetStats();

      await cacheService.set('key1', 'value1');
      await cacheService.get('key1'); // Hit
      await cacheService.get('non-existent'); // Miss

      const stats = await cacheService.getStats();

      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBe(0.5);
    });

    it('should get cache statistics via API', async () => {
      if (!cacheService || !cacheService.isConnected()) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      const response = await request(app)
        .get('/api/cache/stats')
        .set('Authorization', `Bearer ${userToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('cache');
      expect(response.body).toHaveProperty('passwordBreach');
    });

    it('should reset statistics', async () => {
      if (!cacheService || !cacheService.isConnected()) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      await cacheService.get('some-key');
      cacheService.resetStats();

      const stats = await cacheService.getStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });
  });

  describe('Cache Routes - Password Operations', () => {
    it('should check password via API', async () => {
      if (!pwnedService) {
        console.warn('Skipping test - Pwned service not available');
        return;
      }

      const response = await request(app)
        .post('/api/cache/password-breach/check')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ password: 'TestPassword123!' });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('isPwned');
      expect(response.body).toHaveProperty('breachCount');
      expect(response.body).toHaveProperty('cached');
    });

    it('should check password comprehensively via API', async () => {
      if (!pwnedService) {
        console.warn('Skipping test - Pwned service not available');
        return;
      }

      const response = await request(app)
        .post('/api/cache/password-breach/check')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ password: 'MySecureP@ssw0rd!', comprehensive: true });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('strength');
      expect(response.body).toHaveProperty('recommendation');
    });

    it('should check multiple passwords via API', async () => {
      if (!pwnedService) {
        console.warn('Skipping test - Pwned service not available');
        return;
      }

      const response = await request(app)
        .post('/api/cache/password-breach/check-batch')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ passwords: ['password1', 'password2'] });

      expect(response.status).toBe(200);
      expect(response.body.results).toHaveLength(2);
    });

    it('should generate password via API', async () => {
      if (!pwnedService) {
        console.warn('Skipping test - Pwned service not available');
        return;
      }

      const response = await request(app)
        .post('/api/cache/password-breach/generate')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ length: 20 });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('password');
      expect(response.body).toHaveProperty('strength');
      expect(response.body.password).toHaveLength(20);
    });

    it('should require authentication for password check', async () => {
      const response = await request(app)
        .post('/api/cache/password-breach/check')
        .send({ password: 'test' });

      expect(response.status).toBe(401);
    });
  });

  describe('Cache Routes - Admin Operations', () => {
    it('should warm up cache (admin only)', async () => {
      if (!pwnedService) {
        console.warn('Skipping test - Pwned service not available');
        return;
      }

      const response = await request(app)
        .post('/api/cache/password-breach/warm-up')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ passwords: ['password', '123456'] });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('cached');
    });

    it('should reject warm-up for non-admin', async () => {
      const response = await request(app)
        .post('/api/cache/password-breach/warm-up')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ passwords: ['password'] });

      expect(response.status).toBe(403);
    });

    it('should invalidate password breach cache (admin only)', async () => {
      if (!pwnedService) {
        console.warn('Skipping test - Pwned service not available');
        return;
      }

      const response = await request(app)
        .post('/api/cache/password-breach/invalidate')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('count');
    });

    it('should set cache value (admin only)', async () => {
      if (!cacheService || !cacheService.isConnected()) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      const response = await request(app)
        .post('/api/cache/set')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ key: 'test-key', value: 'test-value', ttl: 300 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('should get cache value (admin only)', async () => {
      if (!cacheService || !cacheService.isConnected()) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      await cacheService.set('get-test', 'get-value');

      const response = await request(app)
        .post('/api/cache/get')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ key: 'get-test' });

      expect(response.status).toBe(200);
      expect(response.body.value).toBe('get-value');
      expect(response.body.found).toBe(true);
    });

    it('should delete cache value (admin only)', async () => {
      if (!cacheService || !cacheService.isConnected()) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      await cacheService.set('delete-test', 'delete-value');

      const response = await request(app)
        .post('/api/cache/delete')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ key: 'delete-test' });

      expect(response.status).toBe(200);
      expect(response.body.deleted).toBe(true);
    });

    it('should invalidate pattern (admin only)', async () => {
      if (!cacheService || !cacheService.isConnected()) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      await cacheService.set('pattern:1', 'value1');
      await cacheService.set('pattern:2', 'value2');

      const response = await request(app)
        .post('/api/cache/invalidate-pattern')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ pattern: 'pattern:*' });

      expect(response.status).toBe(200);
      expect(response.body.count).toBeGreaterThanOrEqual(2);
    });

    it('should clear namespace (admin only)', async () => {
      if (!cacheService || !cacheService.isConnected()) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      await cacheService.set('key1', 'value1', { namespace: 'test-ns' });
      await cacheService.set('key2', 'value2', { namespace: 'test-ns' });

      const response = await request(app)
        .post('/api/cache/clear-namespace')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ namespace: 'test-ns' });

      expect(response.status).toBe(200);
      expect(response.body.count).toBeGreaterThanOrEqual(2);
    });

    it('should reject admin operations for non-admin', async () => {
      const response = await request(app)
        .post('/api/cache/set')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ key: 'test', value: 'test' });

      expect(response.status).toBe(403);
    });
  });

  describe('Session Caching', () => {
    it('should cache session data', async () => {
      if (!cacheService || !cacheService.isConnected()) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      const sessionId = 'session-123';
      const sessionData = { userId: '456', role: 'user', loginTime: Date.now() };

      const cached = await cacheService.cacheSession(sessionId, sessionData, 3600);
      expect(cached).toBe(true);

      const retrieved = await cacheService.getCachedSession(sessionId);
      expect(retrieved).toEqual(sessionData);
    });

    it('should delete session', async () => {
      if (!cacheService || !cacheService.isConnected()) {
        console.warn('Skipping test - Redis not available');
        return;
      }

      const sessionId = 'session-456';
      await cacheService.cacheSession(sessionId, { userId: '789' });

      const deleted = await cacheService.deleteSession(sessionId);
      expect(deleted).toBe(true);

      const retrieved = await cacheService.getCachedSession(sessionId);
      expect(retrieved).toBeNull();
    });
  });
});
