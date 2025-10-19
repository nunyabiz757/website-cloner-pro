import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import {
  setupTestDatabase,
  teardownTestDatabase,
  cleanupAllTestData,
  getTestContext,
  randomEmail,
  TestContext,
} from './setup.js';

/**
 * API Integration Tests
 *
 * Tests:
 * 1. User registration and authentication
 * 2. Role-based access control
 * 3. Resource ownership
 * 4. Audit logging
 * 5. Cache management
 * 6. Key rotation
 * 7. Alert configuration
 * 8. Session management
 */

describe('API Integration Tests', () => {
  let app: Express;
  let context: TestContext;

  beforeAll(async () => {
    // Setup test database
    context = await setupTestDatabase();

    // Create Express app with routes
    app = express();
    app.use(express.json());

    // Import and setup routes
    // Note: In real implementation, import actual route files
    // For now, we'll create mock routes for testing
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await cleanupAllTestData();
  });

  describe('User Registration and Authentication', () => {
    it('should register a new user', async () => {
      const email = randomEmail();
      const password = 'SecureP@ssw0rd123!';

      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email,
          password,
          name: 'Test User',
        });

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('userId');
      expect(response.body).toHaveProperty('email', email);
      expect(response.body).not.toHaveProperty('password');
    });

    it('should reject weak passwords', async () => {
      const email = randomEmail();

      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email,
          password: 'weak',
          name: 'Test User',
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should reject duplicate email registration', async () => {
      const email = randomEmail();
      const password = 'SecureP@ssw0rd123!';

      // First registration
      await request(app).post('/api/auth/register').send({
        email,
        password,
        name: 'Test User',
      });

      // Second registration with same email
      const response = await request(app).post('/api/auth/register').send({
        email,
        password,
        name: 'Test User 2',
      });

      expect(response.status).toBe(409);
      expect(response.body).toHaveProperty('error');
    });

    it('should login with valid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: context.users.user.email,
          password: context.users.user.password,
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('token');
      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe(context.users.user.email);
    });

    it('should reject invalid credentials', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: context.users.user.email,
          password: 'WrongPassword123!',
        });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
    });

    it('should logout successfully', async () => {
      const response = await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${context.tokens.user}`);

      expect(response.status).toBe(200);
    });

    it('should reject requests without authentication', async () => {
      const response = await request(app).get('/api/users/profile');

      expect(response.status).toBe(401);
    });

    it('should reject requests with invalid token', async () => {
      const response = await request(app)
        .get('/api/users/profile')
        .set('Authorization', 'Bearer invalid-token');

      expect(response.status).toBe(401);
    });
  });

  describe('Role-Based Access Control', () => {
    it('should allow admin to access admin routes', async () => {
      const response = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${context.tokens.admin}`);

      expect(response.status).toBe(200);
    });

    it('should deny non-admin access to admin routes', async () => {
      const response = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${context.tokens.user}`);

      expect(response.status).toBe(403);
    });

    it('should allow editor to create content', async () => {
      const response = await request(app)
        .post('/api/websites')
        .set('Authorization', `Bearer ${context.tokens.editor}`)
        .send({
          name: 'Test Website',
          url: 'https://example.com',
        });

      expect([200, 201]).toContain(response.status);
    });

    it('should deny viewer from creating content', async () => {
      const response = await request(app)
        .post('/api/websites')
        .set('Authorization', `Bearer ${context.tokens.viewer}`)
        .send({
          name: 'Test Website',
          url: 'https://example.com',
        });

      expect(response.status).toBe(403);
    });

    it('should allow viewer to read content', async () => {
      const response = await request(app)
        .get('/api/websites')
        .set('Authorization', `Bearer ${context.tokens.viewer}`);

      expect(response.status).toBe(200);
    });
  });

  describe('Resource Ownership', () => {
    it('should allow owner to update their resource', async () => {
      // Create resource as user
      const createResponse = await request(app)
        .post('/api/websites')
        .set('Authorization', `Bearer ${context.tokens.user}`)
        .send({
          name: 'My Website',
          url: 'https://mysite.com',
        });

      const resourceId = createResponse.body.id;

      // Update as owner
      const updateResponse = await request(app)
        .put(`/api/websites/${resourceId}`)
        .set('Authorization', `Bearer ${context.tokens.user}`)
        .send({
          name: 'Updated Website',
        });

      expect(updateResponse.status).toBe(200);
    });

    it('should deny non-owner from updating resource', async () => {
      // Create resource as user1
      const createResponse = await request(app)
        .post('/api/websites')
        .set('Authorization', `Bearer ${context.tokens.user}`)
        .send({
          name: 'User1 Website',
          url: 'https://user1site.com',
        });

      const resourceId = createResponse.body.id;

      // Try to update as editor (non-owner)
      const updateResponse = await request(app)
        .put(`/api/websites/${resourceId}`)
        .set('Authorization', `Bearer ${context.tokens.editor}`)
        .send({
          name: 'Hacked Website',
        });

      expect(updateResponse.status).toBe(403);
    });

    it('should allow resource transfer', async () => {
      // Create resource
      const createResponse = await request(app)
        .post('/api/websites')
        .set('Authorization', `Bearer ${context.tokens.user}`)
        .send({
          name: 'Transferable Website',
          url: 'https://transfer.com',
        });

      const resourceId = createResponse.body.id;

      // Transfer to editor
      const transferResponse = await request(app)
        .post(`/api/ownership/website/${resourceId}/transfer`)
        .set('Authorization', `Bearer ${context.tokens.user}`)
        .send({
          newOwnerId: context.users.editor.userId,
        });

      expect(transferResponse.status).toBe(200);

      // Verify editor can now update
      const updateResponse = await request(app)
        .put(`/api/websites/${resourceId}`)
        .set('Authorization', `Bearer ${context.tokens.editor}`)
        .send({
          name: 'Transferred Website',
        });

      expect(updateResponse.status).toBe(200);
    });

    it('should track ownership history', async () => {
      const createResponse = await request(app)
        .post('/api/websites')
        .set('Authorization', `Bearer ${context.tokens.user}`)
        .send({
          name: 'History Website',
          url: 'https://history.com',
        });

      const resourceId = createResponse.body.id;

      // Transfer
      await request(app)
        .post(`/api/ownership/website/${resourceId}/transfer`)
        .set('Authorization', `Bearer ${context.tokens.user}`)
        .send({
          newOwnerId: context.users.editor.userId,
        });

      // Get history
      const historyResponse = await request(app)
        .get(`/api/ownership/website/${resourceId}/history`)
        .set('Authorization', `Bearer ${context.tokens.admin}`);

      expect(historyResponse.status).toBe(200);
      expect(historyResponse.body.history.length).toBeGreaterThan(0);
    });
  });

  describe('Audit Logging', () => {
    it('should log user actions', async () => {
      // Perform action
      await request(app)
        .post('/api/websites')
        .set('Authorization', `Bearer ${context.tokens.user}`)
        .send({
          name: 'Logged Website',
          url: 'https://logged.com',
        });

      // Check audit log
      const auditResponse = await request(app)
        .get('/api/audit/logs')
        .set('Authorization', `Bearer ${context.tokens.admin}`)
        .query({
          userId: context.users.user.userId,
          action: 'create_website',
        });

      expect(auditResponse.status).toBe(200);
      expect(auditResponse.body.logs.length).toBeGreaterThan(0);
    });

    it('should allow audit log search', async () => {
      const searchResponse = await request(app)
        .post('/api/audit/search')
        .set('Authorization', `Bearer ${context.tokens.admin}`)
        .send({
          searchQuery: 'login',
          startDate: new Date(Date.now() - 86400000).toISOString(),
          endDate: new Date().toISOString(),
        });

      expect(searchResponse.status).toBe(200);
      expect(searchResponse.body).toHaveProperty('logs');
    });

    it('should export audit logs', async () => {
      const exportResponse = await request(app)
        .post('/api/audit/export')
        .set('Authorization', `Bearer ${context.tokens.admin}`)
        .send({
          format: 'json',
          filters: {
            action: 'login',
          },
        });

      expect(exportResponse.status).toBe(200);
      expect(exportResponse.body).toHaveProperty('exportId');
    });

    it('should detect suspicious activities', async () => {
      const suspiciousResponse = await request(app)
        .get('/api/audit/suspicious')
        .set('Authorization', `Bearer ${context.tokens.admin}`)
        .query({
          lookbackHours: 24,
        });

      expect(suspiciousResponse.status).toBe(200);
      expect(suspiciousResponse.body).toHaveProperty('activities');
    });
  });

  describe('Cache Management', () => {
    it('should check cache health', async () => {
      const response = await request(app)
        .get('/api/cache/health')
        .set('Authorization', `Bearer ${context.tokens.user}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('healthy');
    });

    it('should get cache statistics', async () => {
      const response = await request(app)
        .get('/api/cache/stats')
        .set('Authorization', `Bearer ${context.tokens.user}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('cache');
    });

    it('should check password breach', async () => {
      const response = await request(app)
        .post('/api/cache/password-breach/check')
        .set('Authorization', `Bearer ${context.tokens.user}`)
        .send({
          password: 'TestPassword123!',
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('isPwned');
      expect(response.body).toHaveProperty('cached');
    });

    it('should generate strong password', async () => {
      const response = await request(app)
        .post('/api/cache/password-breach/generate')
        .set('Authorization', `Bearer ${context.tokens.user}`)
        .send({
          length: 16,
        });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('password');
      expect(response.body.password.length).toBe(16);
    });

    it('should allow admin to invalidate cache', async () => {
      const response = await request(app)
        .post('/api/cache/password-breach/invalidate')
        .set('Authorization', `Bearer ${context.tokens.admin}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('count');
    });

    it('should deny non-admin from invalidating cache', async () => {
      const response = await request(app)
        .post('/api/cache/password-breach/invalidate')
        .set('Authorization', `Bearer ${context.tokens.user}`);

      expect(response.status).toBe(403);
    });
  });

  describe('Key Rotation', () => {
    it('should get current rotation status', async () => {
      const response = await request(app)
        .get('/api/key-rotation/current')
        .set('Authorization', `Bearer ${context.tokens.admin}`);

      expect(response.status).toBe(200);
    });

    it('should initiate key rotation', async () => {
      const response = await request(app)
        .post('/api/key-rotation/initiate')
        .set('Authorization', `Bearer ${context.tokens.admin}`)
        .send({
          rotationType: 'manual',
          reason: 'Security audit',
        });

      expect([200, 201]).toContain(response.status);
      expect(response.body).toHaveProperty('rotationId');
    });

    it('should get rotation progress', async () => {
      // Initiate rotation
      const initiateResponse = await request(app)
        .post('/api/key-rotation/initiate')
        .set('Authorization', `Bearer ${context.tokens.admin}`)
        .send({
          rotationType: 'manual',
        });

      const rotationId = initiateResponse.body.rotationId;

      // Get progress
      const progressResponse = await request(app)
        .get(`/api/key-rotation/progress/${rotationId}`)
        .set('Authorization', `Bearer ${context.tokens.admin}`);

      expect(progressResponse.status).toBe(200);
      expect(progressResponse.body).toHaveProperty('progress');
    });

    it('should deny non-admin from key rotation', async () => {
      const response = await request(app)
        .post('/api/key-rotation/initiate')
        .set('Authorization', `Bearer ${context.tokens.user}`)
        .send({
          rotationType: 'manual',
        });

      expect(response.status).toBe(403);
    });
  });

  describe('Alert Configuration', () => {
    it('should create alert rule', async () => {
      const response = await request(app)
        .post('/api/alerts/rules')
        .set('Authorization', `Bearer ${context.tokens.admin}`)
        .send({
          name: 'Test Alert',
          description: 'Test alert rule',
          condition: {
            type: 'threshold',
            metric: 'test_metric',
            threshold: 100,
          },
          severity: 'medium',
        });

      expect([200, 201]).toContain(response.status);
      expect(response.body).toHaveProperty('ruleId');
    });

    it('should get active alerts', async () => {
      const response = await request(app)
        .get('/api/alerts/active')
        .set('Authorization', `Bearer ${context.tokens.admin}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('alerts');
    });

    it('should acknowledge alert', async () => {
      // Create and trigger alert first
      const createResponse = await request(app)
        .post('/api/alerts/rules')
        .set('Authorization', `Bearer ${context.tokens.admin}`)
        .send({
          name: 'Ack Test Alert',
          condition: { type: 'test' },
          severity: 'low',
        });

      const ruleId = createResponse.body.ruleId;

      // Trigger alert
      const triggerResponse = await request(app)
        .post(`/api/alerts/rules/${ruleId}/trigger`)
        .set('Authorization', `Bearer ${context.tokens.admin}`)
        .send({
          context: { test: true },
        });

      const alertId = triggerResponse.body.alertId;

      // Acknowledge
      const ackResponse = await request(app)
        .post(`/api/alerts/${alertId}/acknowledge`)
        .set('Authorization', `Bearer ${context.tokens.admin}`)
        .send({
          notes: 'Test acknowledgment',
        });

      expect(ackResponse.status).toBe(200);
    });

    it('should get alert statistics', async () => {
      const response = await request(app)
        .get('/api/alerts/statistics')
        .set('Authorization', `Bearer ${context.tokens.admin}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('statistics');
    });
  });

  describe('Session Management', () => {
    it('should create session on login', async () => {
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: context.users.user.email,
          password: context.users.user.password,
        });

      expect(loginResponse.status).toBe(200);
      expect(loginResponse.body).toHaveProperty('sessionId');
    });

    it('should list user sessions', async () => {
      const response = await request(app)
        .get('/api/sessions')
        .set('Authorization', `Bearer ${context.tokens.user}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('sessions');
    });

    it('should revoke session', async () => {
      // Login to create session
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: context.users.user.email,
          password: context.users.user.password,
        });

      const sessionId = loginResponse.body.sessionId;

      // Revoke
      const revokeResponse = await request(app)
        .delete(`/api/sessions/${sessionId}`)
        .set('Authorization', `Bearer ${context.tokens.user}`);

      expect(revokeResponse.status).toBe(200);
    });

    it('should revoke all sessions', async () => {
      const response = await request(app)
        .delete('/api/sessions/all')
        .set('Authorization', `Bearer ${context.tokens.user}`);

      expect(response.status).toBe(200);
    });
  });

  describe('Error Handling', () => {
    it('should handle malformed JSON', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .set('Content-Type', 'application/json')
        .send('{ invalid json }');

      expect(response.status).toBe(400);
    });

    it('should handle missing required fields', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: randomEmail(),
          // Missing password
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
    });

    it('should handle invalid UUIDs', async () => {
      const response = await request(app)
        .get('/api/users/invalid-uuid')
        .set('Authorization', `Bearer ${context.tokens.admin}`);

      expect(response.status).toBe(400);
    });

    it('should handle not found resources', async () => {
      const response = await request(app)
        .get('/api/websites/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${context.tokens.user}`);

      expect(response.status).toBe(404);
    });

    it('should handle rate limiting', async () => {
      // Make many rapid requests
      const requests = Array(100)
        .fill(null)
        .map(() =>
          request(app)
            .post('/api/auth/login')
            .send({
              email: context.users.user.email,
              password: 'wrong',
            })
        );

      const responses = await Promise.all(requests);

      // At least some should be rate limited
      const rateLimited = responses.some((r) => r.status === 429);
      expect(rateLimited).toBe(true);
    });
  });
});
