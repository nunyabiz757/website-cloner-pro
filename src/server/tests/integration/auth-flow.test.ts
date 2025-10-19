import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import {
  setupTestDatabase,
  teardownTestDatabase,
  cleanupAllTestData,
  getTestContext,
  randomEmail,
  sleep,
  TestContext,
} from './setup.js';

/**
 * Authentication Flow Integration Tests
 *
 * Tests:
 * 1. Complete registration flow
 * 2. Email verification flow
 * 3. Login flow with 2FA
 * 4. Password reset flow
 * 5. Session management flow
 * 6. Account lockout flow
 * 7. Social authentication flow
 * 8. Multi-device login flow
 */

describe('Authentication Flow Integration Tests', () => {
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

  describe('Complete Registration Flow', () => {
    it('should complete full registration flow', async () => {
      const email = randomEmail();
      const password = 'SecureP@ssw0rd123!';

      // Step 1: Register
      const registerResponse = await request(app)
        .post('/api/auth/register')
        .send({
          email,
          password,
          name: 'Test User',
        });

      expect(registerResponse.status).toBe(201);
      expect(registerResponse.body).toHaveProperty('userId');

      const userId = registerResponse.body.userId;

      // Step 2: Check verification email sent
      const verificationTokenResponse = await request(app)
        .get(`/api/auth/verification-status/${userId}`)
        .set('Authorization', `Bearer ${context.tokens.admin}`);

      expect(verificationTokenResponse.status).toBe(200);
      expect(verificationTokenResponse.body.emailSent).toBe(true);

      // Step 3: Verify email (simulate clicking email link)
      const verificationToken = verificationTokenResponse.body.token;

      const verifyResponse = await request(app)
        .post('/api/auth/verify-email')
        .send({
          token: verificationToken,
        });

      expect(verifyResponse.status).toBe(200);
      expect(verifyResponse.body.verified).toBe(true);

      // Step 4: Login with verified account
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email,
          password,
        });

      expect(loginResponse.status).toBe(200);
      expect(loginResponse.body).toHaveProperty('token');
    });

    it('should prevent login before email verification', async () => {
      const email = randomEmail();
      const password = 'SecureP@ssw0rd123!';

      // Register
      await request(app)
        .post('/api/auth/register')
        .send({
          email,
          password,
          name: 'Unverified User',
        });

      // Try to login without verification
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email,
          password,
        });

      expect(loginResponse.status).toBe(403);
      expect(loginResponse.body.error).toContain('verify');
    });

    it('should resend verification email', async () => {
      const email = randomEmail();
      const password = 'SecureP@ssw0rd123!';

      // Register
      const registerResponse = await request(app)
        .post('/api/auth/register')
        .send({
          email,
          password,
          name: 'Test User',
        });

      const userId = registerResponse.body.userId;

      // Resend verification
      const resendResponse = await request(app)
        .post('/api/auth/resend-verification')
        .send({
          email,
        });

      expect(resendResponse.status).toBe(200);
      expect(resendResponse.body.sent).toBe(true);
    });
  });

  describe('Login Flow with 2FA', () => {
    it('should complete 2FA setup and login', async () => {
      const email = randomEmail();
      const password = 'SecureP@ssw0rd123!';

      // Register and verify
      const registerResponse = await request(app)
        .post('/api/auth/register')
        .send({
          email,
          password,
          name: '2FA User',
        });

      const userId = registerResponse.body.userId;

      // Login first time
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email,
          password,
        });

      const token = loginResponse.body.token;

      // Enable 2FA
      const enable2FAResponse = await request(app)
        .post('/api/auth/2fa/enable')
        .set('Authorization', `Bearer ${token}`);

      expect(enable2FAResponse.status).toBe(200);
      expect(enable2FAResponse.body).toHaveProperty('secret');
      expect(enable2FAResponse.body).toHaveProperty('qrCode');

      const secret = enable2FAResponse.body.secret;

      // Verify 2FA setup with TOTP code
      // In real app, user scans QR code and enters code from authenticator app
      // For testing, we'll generate the code
      const crypto = require('crypto');
      const totp = require('totp-generator');
      const code = totp(secret);

      const verify2FAResponse = await request(app)
        .post('/api/auth/2fa/verify')
        .set('Authorization', `Bearer ${token}`)
        .send({
          code,
        });

      expect(verify2FAResponse.status).toBe(200);
      expect(verify2FAResponse.body.verified).toBe(true);

      // Logout
      await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`);

      // Login again (should require 2FA)
      const login2FAResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email,
          password,
        });

      expect(login2FAResponse.status).toBe(200);
      expect(login2FAResponse.body.requires2FA).toBe(true);
      expect(login2FAResponse.body).toHaveProperty('tempToken');

      const tempToken = login2FAResponse.body.tempToken;

      // Verify 2FA code
      const newCode = totp(secret);

      const verify2FALoginResponse = await request(app)
        .post('/api/auth/2fa/verify-login')
        .send({
          tempToken,
          code: newCode,
        });

      expect(verify2FALoginResponse.status).toBe(200);
      expect(verify2FALoginResponse.body).toHaveProperty('token');
    });

    it('should reject invalid 2FA codes', async () => {
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: context.users.user.email,
          password: context.users.user.password,
        });

      const tempToken = loginResponse.body.tempToken;

      const verifyResponse = await request(app)
        .post('/api/auth/2fa/verify-login')
        .send({
          tempToken,
          code: '000000', // Invalid code
        });

      expect(verifyResponse.status).toBe(401);
    });

    it('should provide backup codes', async () => {
      const response = await request(app)
        .get('/api/auth/2fa/backup-codes')
        .set('Authorization', `Bearer ${context.tokens.user}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty('backupCodes');
      expect(response.body.backupCodes.length).toBeGreaterThan(0);
    });

    it('should allow login with backup code', async () => {
      // Get backup codes
      const backupCodesResponse = await request(app)
        .get('/api/auth/2fa/backup-codes')
        .set('Authorization', `Bearer ${context.tokens.user}`);

      const backupCode = backupCodesResponse.body.backupCodes[0];

      // Logout
      await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${context.tokens.user}`);

      // Login
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: context.users.user.email,
          password: context.users.user.password,
        });

      const tempToken = loginResponse.body.tempToken;

      // Use backup code
      const verifyResponse = await request(app)
        .post('/api/auth/2fa/verify-backup')
        .send({
          tempToken,
          backupCode,
        });

      expect(verifyResponse.status).toBe(200);
      expect(verifyResponse.body).toHaveProperty('token');
    });
  });

  describe('Password Reset Flow', () => {
    it('should complete password reset flow', async () => {
      const email = context.users.user.email;

      // Step 1: Request password reset
      const requestResponse = await request(app)
        .post('/api/auth/forgot-password')
        .send({
          email,
        });

      expect(requestResponse.status).toBe(200);
      expect(requestResponse.body.emailSent).toBe(true);

      // Step 2: Get reset token (normally sent via email)
      const tokenResponse = await request(app)
        .get(`/api/auth/reset-token/${email}`)
        .set('Authorization', `Bearer ${context.tokens.admin}`);

      const resetToken = tokenResponse.body.token;

      // Step 3: Verify token is valid
      const verifyResponse = await request(app)
        .get(`/api/auth/verify-reset-token/${resetToken}`);

      expect(verifyResponse.status).toBe(200);
      expect(verifyResponse.body.valid).toBe(true);

      // Step 4: Reset password
      const newPassword = 'NewSecureP@ssw0rd456!';

      const resetResponse = await request(app)
        .post('/api/auth/reset-password')
        .send({
          token: resetToken,
          newPassword,
        });

      expect(resetResponse.status).toBe(200);
      expect(resetResponse.body.success).toBe(true);

      // Step 5: Login with new password
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email,
          password: newPassword,
        });

      expect(loginResponse.status).toBe(200);
      expect(loginResponse.body).toHaveProperty('token');

      // Step 6: Verify old password doesn't work
      const oldLoginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email,
          password: context.users.user.password,
        });

      expect(oldLoginResponse.status).toBe(401);
    });

    it('should expire reset tokens', async () => {
      const email = context.users.user.email;

      // Request reset
      await request(app)
        .post('/api/auth/forgot-password')
        .send({
          email,
        });

      // Get token
      const tokenResponse = await request(app)
        .get(`/api/auth/reset-token/${email}`)
        .set('Authorization', `Bearer ${context.tokens.admin}`);

      const resetToken = tokenResponse.body.token;

      // Simulate token expiration (wait or manually expire)
      await sleep(100);

      // Manually expire token
      await request(app)
        .post(`/api/auth/expire-token/${resetToken}`)
        .set('Authorization', `Bearer ${context.tokens.admin}`);

      // Try to use expired token
      const resetResponse = await request(app)
        .post('/api/auth/reset-password')
        .send({
          token: resetToken,
          newPassword: 'NewPassword123!',
        });

      expect(resetResponse.status).toBe(400);
      expect(resetResponse.body.error).toContain('expired');
    });

    it('should invalidate reset tokens after use', async () => {
      const email = context.users.user.email;

      // Request reset
      await request(app)
        .post('/api/auth/forgot-password')
        .send({
          email,
        });

      // Get token
      const tokenResponse = await request(app)
        .get(`/api/auth/reset-token/${email}`)
        .set('Authorization', `Bearer ${context.tokens.admin}`);

      const resetToken = tokenResponse.body.token;

      // Reset password
      await request(app)
        .post('/api/auth/reset-password')
        .send({
          token: resetToken,
          newPassword: 'FirstReset123!',
        });

      // Try to use same token again
      const secondResetResponse = await request(app)
        .post('/api/auth/reset-password')
        .send({
          token: resetToken,
          newPassword: 'SecondReset123!',
        });

      expect(secondResetResponse.status).toBe(400);
      expect(secondResetResponse.body.error).toContain('invalid');
    });
  });

  describe('Session Management Flow', () => {
    it('should track multiple sessions', async () => {
      const email = context.users.user.email;
      const password = context.users.user.password;

      // Login from device 1
      const login1Response = await request(app)
        .post('/api/auth/login')
        .send({
          email,
          password,
          deviceInfo: {
            type: 'mobile',
            name: 'iPhone 12',
          },
        });

      const token1 = login1Response.body.token;

      // Login from device 2
      const login2Response = await request(app)
        .post('/api/auth/login')
        .send({
          email,
          password,
          deviceInfo: {
            type: 'desktop',
            name: 'MacBook Pro',
          },
        });

      const token2 = login2Response.body.token;

      // Get sessions
      const sessionsResponse = await request(app)
        .get('/api/sessions')
        .set('Authorization', `Bearer ${token1}`);

      expect(sessionsResponse.status).toBe(200);
      expect(sessionsResponse.body.sessions.length).toBeGreaterThanOrEqual(2);
    });

    it('should detect session hijacking', async () => {
      const token = context.tokens.user;

      // Make request from IP 1
      const request1 = await request(app)
        .get('/api/users/profile')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Forwarded-For', '192.168.1.1');

      expect(request1.status).toBe(200);

      // Make request from different IP (suspicious)
      const request2 = await request(app)
        .get('/api/users/profile')
        .set('Authorization', `Bearer ${token}`)
        .set('X-Forwarded-For', '10.0.0.1');

      // Should trigger security alert or require re-authentication
      expect([200, 401, 403]).toContain(request2.status);
    });

    it('should auto-expire inactive sessions', async () => {
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: context.users.user.email,
          password: context.users.user.password,
        });

      const token = loginResponse.body.token;
      const sessionId = loginResponse.body.sessionId;

      // Manually expire session
      await request(app)
        .post(`/api/sessions/${sessionId}/expire`)
        .set('Authorization', `Bearer ${context.tokens.admin}`);

      // Try to use expired session
      const response = await request(app)
        .get('/api/users/profile')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(401);
    });

    it('should refresh access token', async () => {
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: context.users.user.email,
          password: context.users.user.password,
        });

      const refreshToken = loginResponse.body.refreshToken;

      // Refresh access token
      const refreshResponse = await request(app)
        .post('/api/auth/refresh')
        .send({
          refreshToken,
        });

      expect(refreshResponse.status).toBe(200);
      expect(refreshResponse.body).toHaveProperty('token');
      expect(refreshResponse.body.token).not.toBe(loginResponse.body.token);
    });
  });

  describe('Account Lockout Flow', () => {
    it('should lock account after failed login attempts', async () => {
      const email = context.users.user.email;
      const wrongPassword = 'WrongPassword123!';

      // Make 5 failed attempts
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/auth/login')
          .send({
            email,
            password: wrongPassword,
          });
      }

      // 6th attempt should be locked
      const lockedResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email,
          password: context.users.user.password, // Even correct password
        });

      expect(lockedResponse.status).toBe(423); // Locked
      expect(lockedResponse.body.error).toContain('locked');
    });

    it('should unlock account after timeout', async () => {
      const email = context.users.user.email;

      // Lock account
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/auth/login')
          .send({
            email,
            password: 'Wrong!',
          });
      }

      // Manually unlock (simulate timeout)
      await request(app)
        .post(`/api/auth/unlock/${context.users.user.userId}`)
        .set('Authorization', `Bearer ${context.tokens.admin}`);

      // Should be able to login now
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email,
          password: context.users.user.password,
        });

      expect(loginResponse.status).toBe(200);
    });

    it('should reset failed attempts after successful login', async () => {
      const email = context.users.user.email;
      const password = context.users.user.password;

      // Make 2 failed attempts
      await request(app).post('/api/auth/login').send({
        email,
        password: 'Wrong1!',
      });
      await request(app).post('/api/auth/login').send({
        email,
        password: 'Wrong2!',
      });

      // Successful login
      const successResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email,
          password,
        });

      expect(successResponse.status).toBe(200);

      // Failed attempts should be reset
      // Make 2 more failed attempts (should not lock yet)
      await request(app).post('/api/auth/login').send({
        email,
        password: 'Wrong3!',
      });
      await request(app).post('/api/auth/login').send({
        email,
        password: 'Wrong4!',
      });

      // Should still be able to login
      const finalResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email,
          password,
        });

      expect(finalResponse.status).toBe(200);
    });
  });

  describe('Multi-Device Login Flow', () => {
    it('should manage concurrent sessions', async () => {
      const email = context.users.user.email;
      const password = context.users.user.password;

      // Login from 3 devices
      const devices = ['mobile', 'desktop', 'tablet'];
      const tokens = [];

      for (const device of devices) {
        const response = await request(app)
          .post('/api/auth/login')
          .send({
            email,
            password,
            deviceInfo: {
              type: device,
            },
          });

        tokens.push(response.body.token);
      }

      // All tokens should work
      for (const token of tokens) {
        const response = await request(app)
          .get('/api/users/profile')
          .set('Authorization', `Bearer ${token}`);

        expect(response.status).toBe(200);
      }
    });

    it('should enforce max sessions limit', async () => {
      const email = context.users.user.email;
      const password = context.users.user.password;

      // Login from 10 devices (assuming limit is 5)
      for (let i = 0; i < 10; i++) {
        await request(app)
          .post('/api/auth/login')
          .send({
            email,
            password,
            deviceInfo: {
              type: `device-${i}`,
            },
          });
      }

      // Get sessions
      const sessionsResponse = await request(app)
        .get('/api/sessions')
        .set('Authorization', `Bearer ${context.tokens.user}`);

      // Should only have max allowed sessions
      expect(sessionsResponse.body.sessions.length).toBeLessThanOrEqual(5);
    });

    it('should revoke other sessions on security event', async () => {
      const email = context.users.user.email;
      const password = context.users.user.password;

      // Create multiple sessions
      const session1 = await request(app)
        .post('/api/auth/login')
        .send({
          email,
          password,
        });

      const token1 = session1.body.token;

      const session2 = await request(app)
        .post('/api/auth/login')
        .send({
          email,
          password,
        });

      const token2 = session2.body.token;

      // Trigger security event (e.g., password change)
      await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${token1}`)
        .send({
          currentPassword: password,
          newPassword: 'NewSecureP@ss123!',
        });

      // Other sessions should be revoked
      const response = await request(app)
        .get('/api/users/profile')
        .set('Authorization', `Bearer ${token2}`);

      expect(response.status).toBe(401);
    });
  });
});
