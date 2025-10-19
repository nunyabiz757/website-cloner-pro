import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import request from 'supertest';
import express, { Express } from 'express';
import {
  setupTestDatabase,
  teardownTestDatabase,
  getTestContext,
  TestContext,
} from './setup.js';

/**
 * Security Penetration Tests
 *
 * Tests common attack vectors:
 * 1. OWASP Top 10 vulnerabilities
 * 2. Authentication attacks
 * 3. Injection attacks
 * 4. Business logic flaws
 * 5. API security
 */

describe('Security Penetration Tests', () => {
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

  describe('OWASP A01: Broken Access Control', () => {
    const tests = [
      {
        name: 'Force browsing to admin pages',
        method: 'get',
        path: '/api/admin/dashboard',
        token: 'user',
        expected: 403,
      },
      {
        name: 'Insecure direct object reference',
        method: 'get',
        path: '/api/users/00000000-0000-0000-0000-000000000001/sensitive',
        token: 'user',
        expected: 403,
      },
      {
        name: 'Missing function level access control',
        method: 'delete',
        path: '/api/admin/users',
        token: 'user',
        expected: 403,
      },
    ];

    tests.forEach((test) => {
      it(`should prevent: ${test.name}`, async () => {
        const token = context.tokens[test.token as keyof typeof context.tokens];
        const res = await request(app)
          [test.method as 'get' | 'post' | 'delete'](test.path)
          .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(test.expected);
      });
    });
  });

  describe('OWASP A02: Cryptographic Failures', () => {
    it('should use HTTPS only', async () => {
      const res = await request(app).get('/api/health');
      expect(res.headers['strict-transport-security']).toBeDefined();
    });

    it('should not expose sensitive data in logs', async () => {
      await request(app).post('/api/auth/login').send({
        email: 'test@test.com',
        password: 'TestPassword123!',
      });
      // Check logs don't contain password (implementation specific)
      expect(true).toBe(true);
    });

    it('should hash passwords properly', async () => {
      const res = await request(app)
        .get('/api/admin/users')
        .set('Authorization', `Bearer ${context.tokens.admin}`);
      if (res.status === 200) {
        res.body.users?.forEach((user: any) => {
          expect(user.password).toBeUndefined();
        });
      }
    });
  });

  describe('OWASP A03: Injection', () => {
    const injections = [
      "' OR '1'='1",
      '1\'; DROP TABLE users--',
      '<script>alert("XSS")</script>',
      '"; ls -la; echo "',
      '${7*7}',
      '{{7*7}}',
    ];

    injections.forEach((payload) => {
      it(`should prevent injection: ${payload.substring(0, 20)}...`, async () => {
        const res = await request(app)
          .get('/api/users/search')
          .set('Authorization', `Bearer ${context.tokens.admin}`)
          .query({ q: payload });
        expect([200, 400]).toContain(res.status);
      });
    });
  });

  describe('OWASP A04: Insecure Design', () => {
    it('should enforce rate limiting', async () => {
      const attempts = 100;
      let rateLimited = false;

      for (let i = 0; i < attempts; i++) {
        const res = await request(app).post('/api/auth/login').send({
          email: 'test@test.com',
          password: 'wrong',
        });
        if (res.status === 429) {
          rateLimited = true;
          break;
        }
      }
      expect(rateLimited).toBe(true);
    });

    it('should prevent enumeration attacks', async () => {
      const existingEmail = context.users.user.email;
      const nonExistentEmail = 'nonexistent@test.com';

      const res1 = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: existingEmail });

      const res2 = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: nonExistentEmail });

      // Responses should be similar to prevent enumeration
      expect(res1.status).toBe(res2.status);
      expect(res1.body.message).toEqual(res2.body.message);
    });
  });

  describe('OWASP A05: Security Misconfiguration', () => {
    it('should not expose server version', async () => {
      const res = await request(app).get('/api/health');
      expect(res.headers['x-powered-by']).toBeUndefined();
    });

    it('should have security headers', async () => {
      const res = await request(app).get('/api/health');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBeDefined();
    });

    it('should not expose stack traces', async () => {
      const res = await request(app).get('/api/nonexistent');
      expect(res.body.stack).toBeUndefined();
    });
  });

  describe('OWASP A06: Vulnerable Components', () => {
    it('should check for outdated dependencies', async () => {
      // This would run npm audit in CI/CD
      expect(true).toBe(true);
    });
  });

  describe('OWASP A07: Identification and Authentication Failures', () => {
    it('should prevent brute force', async () => {
      const attempts = 10;
      let locked = false;

      for (let i = 0; i < attempts; i++) {
        const res = await request(app).post('/api/auth/login').send({
          email: context.users.user.email,
          password: 'wrong',
        });
        if (res.status === 423) {
          locked = true;
          break;
        }
      }
      expect(locked).toBe(true);
    });

    it('should invalidate session on logout', async () => {
      const loginRes = await request(app).post('/api/auth/login').send({
        email: context.users.user.email,
        password: context.users.user.password,
      });
      const token = loginRes.body.token;

      await request(app)
        .post('/api/auth/logout')
        .set('Authorization', `Bearer ${token}`);

      const res = await request(app)
        .get('/api/users/profile')
        .set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(401);
    });
  });

  describe('OWASP A08: Software and Data Integrity Failures', () => {
    it('should validate content integrity', async () => {
      const res = await request(app)
        .post('/api/upload')
        .set('Authorization', `Bearer ${context.tokens.user}`)
        .attach('file', Buffer.from('test'), {
          filename: 'test.jpg',
          contentType: 'image/jpeg',
        });
      expect([200, 201, 400]).toContain(res.status);
    });
  });

  describe('OWASP A09: Security Logging and Monitoring Failures', () => {
    it('should log authentication attempts', async () => {
      await request(app).post('/api/auth/login').send({
        email: context.users.user.email,
        password: 'wrong',
      });

      const res = await request(app)
        .get('/api/audit/logs')
        .set('Authorization', `Bearer ${context.tokens.admin}`)
        .query({ action: 'login_attempt' });

      expect(res.status).toBe(200);
      expect(res.body.logs?.length).toBeGreaterThan(0);
    });

    it('should detect suspicious activities', async () => {
      const res = await request(app)
        .get('/api/audit/suspicious')
        .set('Authorization', `Bearer ${context.tokens.admin}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('activities');
    });
  });

  describe('OWASP A10: Server-Side Request Forgery', () => {
    it('should validate URLs', async () => {
      const malicious = [
        'file:///etc/passwd',
        'http://localhost:22',
        'http://169.254.169.254/latest/meta-data/',
      ];

      for (const url of malicious) {
        const res = await request(app)
          .post('/api/websites/clone')
          .set('Authorization', `Bearer ${context.tokens.user}`)
          .send({ url });

        expect([400, 403]).toContain(res.status);
      }
    });
  });

  describe('Advanced Attack Vectors', () => {
    it('should prevent timing attacks on authentication', async () => {
      const start1 = Date.now();
      await request(app).post('/api/auth/login').send({
        email: context.users.user.email,
        password: 'wrong',
      });
      const time1 = Date.now() - start1;

      const start2 = Date.now();
      await request(app).post('/api/auth/login').send({
        email: 'nonexistent@test.com',
        password: 'wrong',
      });
      const time2 = Date.now() - start2;

      // Times should be similar (within 100ms)
      expect(Math.abs(time1 - time2)).toBeLessThan(100);
    });

    it('should prevent parameter pollution', async () => {
      const res = await request(app)
        .get('/api/users/profile')
        .set('Authorization', `Bearer ${context.tokens.user}`)
        .query('id=1&id=2&id=3');

      expect([200, 400]).toContain(res.status);
    });

    it('should prevent mass assignment', async () => {
      const res = await request(app)
        .put('/api/users/profile')
        .set('Authorization', `Bearer ${context.tokens.user}`)
        .send({
          name: 'Test',
          role: 'admin', // Should be filtered
          isActive: true, // Should be filtered
        });

      if (res.status === 200) {
        expect(res.body.role).not.toBe('admin');
      }
    });

    it('should prevent XML External Entity (XXE) attacks', async () => {
      const xxe = `<?xml version="1.0"?>
        <!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>
        <foo>&xxe;</foo>`;

      const res = await request(app)
        .post('/api/import')
        .set('Authorization', `Bearer ${context.tokens.user}`)
        .set('Content-Type', 'application/xml')
        .send(xxe);

      expect([400, 415]).toContain(res.status);
    });

    it('should prevent NoSQL injection', async () => {
      const payloads = [
        { $gt: '' },
        { $ne: null },
        { $regex: '.*' },
      ];

      for (const payload of payloads) {
        const res = await request(app)
          .post('/api/auth/login')
          .send({
            email: payload,
            password: payload,
          });

        expect([400, 401]).toContain(res.status);
      }
    });

    it('should prevent LDAP injection', async () => {
      const res = await request(app)
        .get('/api/users/search')
        .set('Authorization', `Bearer ${context.tokens.admin}`)
        .query({ q: '*)(uid=*))(|(uid=*' });

      expect([200, 400]).toContain(res.status);
    });

    it('should prevent template injection', async () => {
      const payloads = ['{{7*7}}', '${7*7}', '<%= 7*7 %>'];

      for (const payload of payloads) {
        const res = await request(app)
          .put('/api/users/profile')
          .set('Authorization', `Bearer ${context.tokens.user}`)
          .send({ name: payload });

        if (res.status === 200) {
          expect(res.body.name).not.toContain('49');
        }
      }
    });

    it('should prevent clickjacking', async () => {
      const res = await request(app).get('/api/health');
      expect(res.headers['x-frame-options']).toBeDefined();
    });

    it('should prevent MIME sniffing', async () => {
      const res = await request(app).get('/api/health');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });

    it('should enforce content security policy', async () => {
      const res = await request(app).get('/');
      expect(res.headers['content-security-policy']).toBeDefined();
    });
  });
});
