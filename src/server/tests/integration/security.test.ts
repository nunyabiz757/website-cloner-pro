import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import {
  setupTestDatabase,
  teardownTestDatabase,
  cleanupAllTestData,
  getTestContext,
  randomEmail,
  randomString,
  TestContext,
} from './setup.js';

/**
 * Security Integration Tests
 *
 * Tests:
 * 1. SQL Injection prevention
 * 2. XSS prevention
 * 3. CSRF protection
 * 4. Rate limiting
 * 5. Input validation
 * 6. Authentication bypass attempts
 * 7. Authorization bypass attempts
 * 8. Session security
 * 9. Password security
 * 10. File upload security
 */

describe('Security Integration Tests', () => {
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

  describe('SQL Injection Prevention', () => {
    it('should prevent SQL injection in login', async () => {
      const sqlInjections = [
        "' OR '1'='1",
        "admin'--",
        "' OR 1=1--",
        "1' UNION SELECT NULL--",
        "'; DROP TABLE users--",
      ];

      for (const injection of sqlInjections) {
        const response = await request(app)
          .post('/api/auth/login')
          .send({
            email: injection,
            password: injection,
          });

        // Should not succeed or cause error
        expect([400, 401, 403]).toContain(response.status);
        expect(response.body).not.toHaveProperty('token');
      }
    });

    it('should prevent SQL injection in search', async () => {
      const response = await request(app)
        .get('/api/users/search')
        .set('Authorization', `Bearer ${context.tokens.admin}`)
        .query({
          q: "'; DROP TABLE users; --",
        });

      // Should handle safely
      expect([200, 400]).toContain(response.status);

      // Verify users table still exists
      const usersResponse = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${context.tokens.admin}`);

      expect(usersResponse.status).toBe(200);
    });

    it('should prevent SQL injection in URL parameters', async () => {
      const response = await request(app)
        .get("/api/users/1' OR '1'='1")
        .set('Authorization', `Bearer ${context.tokens.admin}`);

      expect([400, 404]).toContain(response.status);
    });
  });

  describe('XSS Prevention', () => {
    it('should sanitize XSS in user input', async () => {
      const xssPayloads = [
        '<script>alert("XSS")</script>',
        '<img src=x onerror=alert("XSS")>',
        'javascript:alert("XSS")',
        '<svg onload=alert("XSS")>',
        '"><script>alert(String.fromCharCode(88,83,83))</script>',
      ];

      for (const payload of xssPayloads) {
        const response = await request(app)
          .put('/api/users/profile')
          .set('Authorization', `Bearer ${context.tokens.user}`)
          .send({
            name: payload,
            bio: payload,
          });

        if (response.status === 200) {
          // If accepted, should be sanitized
          expect(response.body.name).not.toContain('<script>');
          expect(response.body.bio).not.toContain('<script>');
        }
      }
    });

    it('should prevent XSS in search results', async () => {
      // Create user with XSS attempt in name
      const xssName = '<script>alert("XSS")</script>';

      await request(app)
        .put('/api/users/profile')
        .set('Authorization', `Bearer ${context.tokens.user}`)
        .send({
          name: xssName,
        });

      // Search for user
      const searchResponse = await request(app)
        .get('/api/users/search')
        .set('Authorization', `Bearer ${context.tokens.admin}`)
        .query({
          q: 'test',
        });

      if (searchResponse.status === 200) {
        // Results should be sanitized
        const results = JSON.stringify(searchResponse.body);
        expect(results).not.toContain('<script>');
      }
    });

    it('should set secure HTTP headers', async () => {
      const response = await request(app).get('/api/health');

      // Should have security headers
      expect(response.headers).toHaveProperty('x-content-type-options', 'nosniff');
      expect(response.headers).toHaveProperty('x-frame-options');
      expect(response.headers).toHaveProperty('x-xss-protection');
      expect(response.headers).toHaveProperty('strict-transport-security');
    });
  });

  describe('CSRF Protection', () => {
    it('should require CSRF token for state-changing operations', async () => {
      const response = await request(app)
        .post('/api/users/profile/delete')
        .set('Authorization', `Bearer ${context.tokens.user}`)
        // Missing CSRF token
        .send({});

      expect([403, 400]).toContain(response.status);
    });

    it('should validate CSRF token', async () => {
      // Get CSRF token
      const tokenResponse = await request(app)
        .get('/api/csrf-token')
        .set('Authorization', `Bearer ${context.tokens.user}`);

      const csrfToken = tokenResponse.body.token;

      // Use valid token
      const validResponse = await request(app)
        .post('/api/users/profile/delete')
        .set('Authorization', `Bearer ${context.tokens.user}`)
        .set('X-CSRF-Token', csrfToken)
        .send({});

      expect(validResponse.status).not.toBe(403);

      // Use invalid token
      const invalidResponse = await request(app)
        .post('/api/users/profile/delete')
        .set('Authorization', `Bearer ${context.tokens.user}`)
        .set('X-CSRF-Token', 'invalid-token')
        .send({});

      expect(invalidResponse.status).toBe(403);
    });
  });

  describe('Rate Limiting', () => {
    it('should rate limit login attempts', async () => {
      const email = context.users.user.email;

      // Make many rapid login attempts
      const attempts = 20;
      const responses = [];

      for (let i = 0; i < attempts; i++) {
        const response = await request(app)
          .post('/api/auth/login')
          .send({
            email,
            password: 'wrong',
          });

        responses.push(response);
      }

      // Should have rate limited some requests
      const rateLimited = responses.filter((r) => r.status === 429);
      expect(rateLimited.length).toBeGreaterThan(0);
    });

    it('should rate limit API endpoints', async () => {
      const attempts = 50;
      const responses = [];

      for (let i = 0; i < attempts; i++) {
        const response = await request(app)
          .get('/api/users/profile')
          .set('Authorization', `Bearer ${context.tokens.user}`);

        responses.push(response);
      }

      // Should have rate limited some requests
      const rateLimited = responses.filter((r) => r.status === 429);
      expect(rateLimited.length).toBeGreaterThan(0);
    });

    it('should have different limits for different endpoints', async () => {
      // Login endpoint (strict limit)
      const loginAttempts = 10;
      let loginRateLimited = 0;

      for (let i = 0; i < loginAttempts; i++) {
        const response = await request(app)
          .post('/api/auth/login')
          .send({
            email: randomEmail(),
            password: 'test',
          });

        if (response.status === 429) loginRateLimited++;
      }

      // Profile endpoint (lenient limit)
      const profileAttempts = 10;
      let profileRateLimited = 0;

      for (let i = 0; i < profileAttempts; i++) {
        const response = await request(app)
          .get('/api/users/profile')
          .set('Authorization', `Bearer ${context.tokens.user}`);

        if (response.status === 429) profileRateLimited++;
      }

      // Login should be rate limited more aggressively
      expect(loginRateLimited).toBeGreaterThan(profileRateLimited);
    });
  });

  describe('Input Validation', () => {
    it('should validate email format', async () => {
      const invalidEmails = [
        'notanemail',
        '@test.com',
        'test@',
        'test@.com',
        'test..test@test.com',
      ];

      for (const email of invalidEmails) {
        const response = await request(app)
          .post('/api/auth/register')
          .send({
            email,
            password: 'ValidP@ssw0rd123!',
            name: 'Test',
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toBeTruthy();
      }
    });

    it('should validate password strength', async () => {
      const weakPasswords = [
        'short',
        'alllowercase',
        'ALLUPPERCASE',
        '12345678',
        'NoSpecialChar1',
        'NoNumber!',
      ];

      for (const password of weakPasswords) {
        const response = await request(app)
          .post('/api/auth/register')
          .send({
            email: randomEmail(),
            password,
            name: 'Test',
          });

        expect(response.status).toBe(400);
        expect(response.body.error).toContain('password');
      }
    });

    it('should validate UUID format', async () => {
      const invalidUUIDs = [
        'not-a-uuid',
        '12345',
        'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
      ];

      for (const uuid of invalidUUIDs) {
        const response = await request(app)
          .get(`/api/users/${uuid}`)
          .set('Authorization', `Bearer ${context.tokens.admin}`);

        expect(response.status).toBe(400);
      }
    });

    it('should reject excessively long input', async () => {
      const longString = 'a'.repeat(10000);

      const response = await request(app)
        .put('/api/users/profile')
        .set('Authorization', `Bearer ${context.tokens.user}`)
        .send({
          name: longString,
          bio: longString,
        });

      expect(response.status).toBe(400);
    });

    it('should validate JSON structure', async () => {
      const invalidJSON = [
        { nested: { too: { deep: { structure: { here: { value: 1 } } } } } },
        { array: new Array(1000).fill('item') },
      ];

      for (const data of invalidJSON) {
        const response = await request(app)
          .post('/api/settings')
          .set('Authorization', `Bearer ${context.tokens.user}`)
          .send(data);

        expect([400, 413]).toContain(response.status);
      }
    });
  });

  describe('Authentication Bypass Attempts', () => {
    it('should prevent JWT token forgery', async () => {
      const forgedToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiIxMjM0NSIsImVtYWlsIjoiYWRtaW5AdGVzdC5jb20iLCJyb2xlIjoiYWRtaW4ifQ.forgedsignature';

      const response = await request(app)
        .get('/api/users/profile')
        .set('Authorization', `Bearer ${forgedToken}`);

      expect(response.status).toBe(401);
    });

    it('should prevent token replay attacks', async () => {
      // Login and get token
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: context.users.user.email,
          password: context.users.user.password,
        });

      const token = loginResponse.body.token;

      // Logout (invalidate token)
      await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`);

      // Try to use invalidated token
      const replayResponse = await request(app)
        .get('/api/users/profile')
        .set('Authorization', `Bearer ${token}`);

      expect(replayResponse.status).toBe(401);
    });

    it('should prevent parameter tampering', async () => {
      // Try to change userId in request
      const response = await request(app)
        .get('/api/users/profile')
        .set('Authorization', `Bearer ${context.tokens.user}`)
        .query({
          userId: context.users.admin.userId, // Try to access admin profile
        });

      // Should return user's own profile, not admin's
      if (response.status === 200) {
        expect(response.body.userId).toBe(context.users.user.userId);
      }
    });

    it('should validate token expiration', async () => {
      // Create expired token
      const jwt = require('jsonwebtoken');
      const secret = process.env.JWT_SECRET || 'test-secret-key';

      const expiredToken = jwt.sign(
        {
          userId: context.users.user.userId,
          email: context.users.user.email,
          role: context.users.user.role,
        },
        secret,
        { expiresIn: '-1h' } // Already expired
      );

      const response = await request(app)
        .get('/api/users/profile')
        .set('Authorization', `Bearer ${expiredToken}`);

      expect(response.status).toBe(401);
    });
  });

  describe('Authorization Bypass Attempts', () => {
    it('should prevent horizontal privilege escalation', async () => {
      // User tries to access another user's data
      const response = await request(app)
        .get(`/api/users/${context.users.admin.userId}/private-data`)
        .set('Authorization', `Bearer ${context.tokens.user}`);

      expect(response.status).toBe(403);
    });

    it('should prevent vertical privilege escalation', async () => {
      // User tries to perform admin action
      const response = await request(app)
        .post('/api/admin/users/delete')
        .set('Authorization', `Bearer ${context.tokens.user}`)
        .send({
          userId: context.users.viewer.userId,
        });

      expect(response.status).toBe(403);
    });

    it('should prevent role manipulation', async () => {
      // Try to change own role to admin
      const response = await request(app)
        .put('/api/users/profile')
        .set('Authorization', `Bearer ${context.tokens.user}`)
        .send({
          role: 'admin',
        });

      // Should reject or ignore role change
      if (response.status === 200) {
        expect(response.body.role).not.toBe('admin');
      } else {
        expect([400, 403]).toContain(response.status);
      }
    });

    it('should validate resource ownership', async () => {
      // Create resource as user1
      const createResponse = await request(app)
        .post('/api/websites')
        .set('Authorization', `Bearer ${context.tokens.user}`)
        .send({
          name: 'Private Website',
          url: 'https://private.com',
        });

      const resourceId = createResponse.body.id;

      // Try to delete as different user
      const deleteResponse = await request(app)
        .delete(`/api/websites/${resourceId}`)
        .set('Authorization', `Bearer ${context.tokens.editor}`);

      expect(deleteResponse.status).toBe(403);
    });
  });

  describe('Session Security', () => {
    it('should use secure session cookies', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          email: context.users.user.email,
          password: context.users.user.password,
        });

      const cookies = response.headers['set-cookie'];

      if (cookies) {
        const sessionCookie = cookies.find((c: string) => c.includes('session'));
        if (sessionCookie) {
          expect(sessionCookie).toContain('HttpOnly');
          expect(sessionCookie).toContain('Secure');
          expect(sessionCookie).toContain('SameSite');
        }
      }
    });

    it('should regenerate session ID on privilege change', async () => {
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          email: context.users.user.email,
          password: context.users.user.password,
        });

      const sessionId1 = loginResponse.body.sessionId;

      // Perform privileged action (e.g., enable 2FA)
      await request(app)
        .post('/api/auth/2fa/enable')
        .set('Authorization', `Bearer ${loginResponse.body.token}`);

      // Get new session ID
      const profileResponse = await request(app)
        .get('/api/users/profile')
        .set('Authorization', `Bearer ${loginResponse.body.token}`);

      const sessionId2 = profileResponse.body.sessionId;

      // Session ID should have changed
      expect(sessionId2).not.toBe(sessionId1);
    });

    it('should prevent session fixation', async () => {
      // Get initial session
      const initialResponse = await request(app).get('/api/csrf-token');

      const initialSessionCookie = initialResponse.headers['set-cookie'];

      // Login
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .set('Cookie', initialSessionCookie)
        .send({
          email: context.users.user.email,
          password: context.users.user.password,
        });

      const loginSessionCookie = loginResponse.headers['set-cookie'];

      // Session should have changed after login
      expect(loginSessionCookie).not.toEqual(initialSessionCookie);
    });
  });

  describe('Password Security', () => {
    it('should enforce password complexity', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          email: randomEmail(),
          password: 'simple',
          name: 'Test',
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('password');
    });

    it('should check for breached passwords', async () => {
      const commonPasswords = ['password123', 'qwerty123', 'admin123'];

      for (const password of commonPasswords) {
        const response = await request(app)
          .post('/api/auth/register')
          .send({
            email: randomEmail(),
            password,
            name: 'Test',
          });

        // Should reject or warn about breached password
        if (response.status === 201) {
          expect(response.body).toHaveProperty('warning');
        } else {
          expect(response.status).toBe(400);
        }
      }
    });

    it('should prevent password reuse', async () => {
      const oldPassword = context.users.user.password;
      const newPassword = 'NewSecureP@ss123!';

      // Change password
      await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${context.tokens.user}`)
        .send({
          currentPassword: oldPassword,
          newPassword,
        });

      // Try to change back to old password
      const reuseResponse = await request(app)
        .post('/api/auth/change-password')
        .set('Authorization', `Bearer ${context.tokens.user}`)
        .send({
          currentPassword: newPassword,
          newPassword: oldPassword,
        });

      expect(reuseResponse.status).toBe(400);
      expect(reuseResponse.body.error).toContain('reuse');
    });

    it('should hash passwords securely', async () => {
      const email = randomEmail();
      const password = 'SecureP@ssw0rd123!';

      // Register user
      await request(app)
        .post('/api/auth/register')
        .send({
          email,
          password,
          name: 'Test',
        });

      // Check database (admin access)
      const dbResponse = await request(app)
        .get(`/api/admin/users/by-email/${email}`)
        .set('Authorization', `Bearer ${context.tokens.admin}`);

      // Password should be hashed, not plaintext
      expect(dbResponse.body.password).not.toBe(password);
      expect(dbResponse.body.password).toMatch(/^\$2[aby]\$/); // Bcrypt format
    });
  });

  describe('File Upload Security', () => {
    it('should validate file types', async () => {
      const invalidFiles = [
        { name: 'malware.exe', mimetype: 'application/x-msdownload' },
        { name: 'script.php', mimetype: 'application/x-httpd-php' },
        { name: 'bad.sh', mimetype: 'application/x-sh' },
      ];

      for (const file of invalidFiles) {
        const response = await request(app)
          .post('/api/upload')
          .set('Authorization', `Bearer ${context.tokens.user}`)
          .attach('file', Buffer.from('fake file'), {
            filename: file.name,
            contentType: file.mimetype,
          });

        expect([400, 415]).toContain(response.status);
      }
    });

    it('should enforce file size limits', async () => {
      // Create large file (10MB)
      const largeFile = Buffer.alloc(10 * 1024 * 1024);

      const response = await request(app)
        .post('/api/upload')
        .set('Authorization', `Bearer ${context.tokens.user}`)
        .attach('file', largeFile, {
          filename: 'large.jpg',
          contentType: 'image/jpeg',
        });

      expect([413, 400]).toContain(response.status);
    });

    it('should scan files for malware', async () => {
      // Upload suspicious file
      const response = await request(app)
        .post('/api/upload')
        .set('Authorization', `Bearer ${context.tokens.user}`)
        .attach('file', Buffer.from('X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'), {
          filename: 'eicar.txt',
          contentType: 'text/plain',
        });

      // Should be rejected by malware scanner
      expect([400, 403]).toContain(response.status);
      if (response.status === 400 || response.status === 403) {
        expect(response.body.error).toContain('malware');
      }
    });

    it('should prevent path traversal in uploads', async () => {
      const maliciousNames = [
        '../../../etc/passwd',
        '..\\..\\..\\windows\\system32\\config\\sam',
        'normal.jpg/../../../etc/passwd',
      ];

      for (const filename of maliciousNames) {
        const response = await request(app)
          .post('/api/upload')
          .set('Authorization', `Bearer ${context.tokens.user}`)
          .attach('file', Buffer.from('test'), {
            filename,
            contentType: 'image/jpeg',
          });

        expect([400, 403]).toContain(response.status);
      }
    });
  });
});
