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
 * End-to-End Workflow Integration Tests
 *
 * Tests complete user workflows:
 * 1. New user onboarding
 * 2. Website cloning workflow
 * 3. Security incident response
 * 4. Account management workflow
 * 5. Admin management workflow
 */

describe('E2E Workflow Integration Tests', () => {
  let app: Express;
  let context: TestContext;

  beforeAll(async () => {
    context = await setupTestDatabase();
    app = express();
    app.use(express.json());
  });

  afterAll(async () => {
    await teardownTestDatabase();
  });

  beforeEach(async () => {
    await cleanupAllTestData();
  });

  describe('New User Onboarding Workflow', () => {
    it('should complete full onboarding flow', async () => {
      const email = randomEmail();
      const password = 'SecureP@ssw0rd123!';

      // 1. Register
      const registerRes = await request(app).post('/api/auth/register').send({
        email,
        password,
        name: 'New User',
      });
      expect(registerRes.status).toBe(201);
      const { userId, token } = registerRes.body;

      // 2. Verify email
      const verifyRes = await request(app).post('/api/auth/verify-email').send({
        userId,
        token: 'verification-token',
      });
      expect(verifyRes.status).toBe(200);

      // 3. Login
      const loginRes = await request(app).post('/api/auth/login').send({
        email,
        password,
      });
      expect(loginRes.status).toBe(200);
      const userToken = loginRes.body.token;

      // 4. Complete profile
      const profileRes = await request(app)
        .put('/api/users/profile')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          name: 'Updated Name',
          company: 'Test Company',
        });
      expect(profileRes.status).toBe(200);

      // 5. Setup 2FA
      const enable2FARes = await request(app)
        .post('/api/auth/2fa/enable')
        .set('Authorization', `Bearer ${userToken}`);
      expect(enable2FARes.status).toBe(200);

      // 6. Create first resource
      const createRes = await request(app)
        .post('/api/websites')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          name: 'First Website',
          url: 'https://example.com',
        });
      expect([200, 201]).toContain(createRes.status);
    });
  });

  describe('Website Cloning Workflow', () => {
    it('should complete website cloning workflow', async () => {
      const token = context.tokens.user;

      // 1. Create clone job
      const createRes = await request(app)
        .post('/api/websites/clone')
        .set('Authorization', `Bearer ${token}`)
        .send({
          url: 'https://example.com',
          name: 'Example Clone',
        });
      expect([200, 201]).toContain(createRes.status);
      const { jobId } = createRes.body;

      // 2. Check job status
      const statusRes = await request(app)
        .get(`/api/websites/clone/${jobId}/status`)
        .set('Authorization', `Bearer ${token}`);
      expect(statusRes.status).toBe(200);

      // 3. Download cloned website
      const downloadRes = await request(app)
        .get(`/api/websites/clone/${jobId}/download`)
        .set('Authorization', `Bearer ${token}`);
      expect([200, 202]).toContain(downloadRes.status);

      // 4. Publish to deployment
      const publishRes = await request(app)
        .post(`/api/websites/clone/${jobId}/publish`)
        .set('Authorization', `Bearer ${token}`)
        .send({
          platform: 'netlify',
        });
      expect([200, 201]).toContain(publishRes.status);
    });
  });

  describe('Security Incident Response Workflow', () => {
    it('should handle security incident workflow', async () => {
      const adminToken = context.tokens.admin;

      // 1. Detect suspicious activity
      const suspiciousRes = await request(app)
        .get('/api/audit/suspicious')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(suspiciousRes.status).toBe(200);

      // 2. Create alert
      const alertRes = await request(app)
        .post('/api/alerts/rules')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Security Incident',
          severity: 'critical',
          condition: { type: 'manual' },
        });
      expect([200, 201]).toContain(alertRes.status);

      // 3. Lock compromised account
      const lockRes = await request(app)
        .post(`/api/users/${context.users.user.userId}/lock`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(lockRes.status).toBe(200);

      // 4. Revoke all sessions
      const revokeRes = await request(app)
        .delete(`/api/users/${context.users.user.userId}/sessions`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(revokeRes.status).toBe(200);

      // 5. Rotate encryption keys
      const rotateRes = await request(app)
        .post('/api/key-rotation/initiate')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          rotationType: 'emergency',
          reason: 'Security incident',
        });
      expect([200, 201]).toContain(rotateRes.status);

      // 6. Audit affected resources
      const auditRes = await request(app)
        .post('/api/audit/search')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          userId: context.users.user.userId,
          startDate: new Date(Date.now() - 86400000).toISOString(),
        });
      expect(auditRes.status).toBe(200);
    });
  });

  describe('Account Management Workflow', () => {
    it('should complete account management workflow', async () => {
      const token = context.tokens.user;

      // 1. View profile
      const profileRes = await request(app)
        .get('/api/users/profile')
        .set('Authorization', `Bearer ${token}`);
      expect(profileRes.status).toBe(200);

      // 2. Update preferences
      const prefsRes = await request(app)
        .put('/api/users/preferences')
        .set('Authorization', `Bearer ${token}`)
        .send({
          notifications: true,
          theme: 'dark',
        });
      expect(prefsRes.status).toBe(200);

      // 3. Change password
      const passwordRes = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${token}`)
        .send({
          currentPassword: context.users.user.password,
          newPassword: 'NewP@ssw0rd456!',
        });
      expect(passwordRes.status).toBe(200);

      // 4. View activity history
      const historyRes = await request(app)
        .get('/api/users/activity')
        .set('Authorization', `Bearer ${token}`);
      expect(historyRes.status).toBe(200);

      // 5. Manage sessions
      const sessionsRes = await request(app)
        .get('/api/sessions')
        .set('Authorization', `Bearer ${token}`);
      expect(sessionsRes.status).toBe(200);

      // 6. Export data
      const exportRes = await request(app)
        .post('/api/users/export')
        .set('Authorization', `Bearer ${token}`)
        .send({
          format: 'json',
        });
      expect([200, 202]).toContain(exportRes.status);
    });
  });

  describe('Admin Management Workflow', () => {
    it('should complete admin management workflow', async () => {
      const adminToken = context.tokens.admin;

      // 1. View all users
      const usersRes = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(usersRes.status).toBe(200);

      // 2. Create new user
      const createRes = await request(app)
        .post('/api/admin/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: randomEmail(),
          password: 'AdminP@ss123!',
          role: 'editor',
        });
      expect([200, 201]).toContain(createRes.status);

      // 3. Update user role
      const roleRes = await request(app)
        .put(`/api/admin/users/${createRes.body.userId}/role`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          role: 'moderator',
        });
      expect(roleRes.status).toBe(200);

      // 4. View system statistics
      const statsRes = await request(app)
        .get('/api/admin/statistics')
        .set('Authorization', `Bearer ${adminToken}`);
      expect(statsRes.status).toBe(200);

      // 5. Configure alert rules
      const alertRes = await request(app)
        .post('/api/alerts/rules')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Admin Alert',
          severity: 'medium',
          condition: { type: 'test' },
        });
      expect([200, 201]).toContain(alertRes.status);

      // 6. Export audit logs
      const exportRes = await request(app)
        .post('/api/audit/export')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          format: 'csv',
        });
      expect(exportRes.status).toBe(200);
    });
  });
});
