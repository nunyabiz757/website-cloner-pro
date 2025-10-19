import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { Pool } from 'pg';
import express, { Express } from 'express';
import request from 'supertest';
import { sign } from 'jsonwebtoken';
import securityDashboardRoutes, {
  initializeSecurityDashboardRoutes,
} from '../routes/security-dashboard.routes.js';

/**
 * Security Dashboard Tests
 * Tests for security monitoring dashboard endpoints
 */

describe('Security Dashboard', () => {
  let pool: Pool;
  let app: Express;
  let authToken: string;
  let testUserId: string;

  beforeAll(async () => {
    // Initialize test database connection
    pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'website_cloner_test',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
    });

    // Initialize Express app
    app = express();
    app.use(express.json());

    // Initialize routes
    initializeSecurityDashboardRoutes(pool);
    app.use('/api/security', securityDashboardRoutes);

    // Create test user
    const userResult = await pool.query(
      `INSERT INTO users (username, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id`,
      ['testuser', 'test@example.com', 'hashedpassword']
    );
    testUserId = userResult.rows[0].id;

    // Generate auth token
    const secret = process.env.JWT_SECRET || 'test-secret';
    authToken = sign({ userId: testUserId, username: 'testuser' }, secret, {
      expiresIn: '1h',
    });
  });

  afterAll(async () => {
    // Cleanup
    await pool.query('DELETE FROM users WHERE id = $1', [testUserId]);
    await pool.end();
  });

  beforeEach(async () => {
    // Clean up security events before each test
    await pool.query('DELETE FROM security_events');
  });

  describe('GET /api/security/dashboard', () => {
    it('should return comprehensive dashboard data', async () => {
      const response = await request(app)
        .get('/api/security/dashboard?range=24h')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('overview');
      expect(response.body.data).toHaveProperty('loginMetrics');
      expect(response.body.data).toHaveProperty('apiKeyMetrics');
      expect(response.body.data).toHaveProperty('sessionMetrics');
      expect(response.body.data).toHaveProperty('cspMetrics');
      expect(response.body.data).toHaveProperty('threatSummary');
      expect(response.body.data).toHaveProperty('timeline');
      expect(response.body.data).toHaveProperty('topThreats');
    });

    it('should support different time ranges', async () => {
      const ranges = ['24h', '7d', '30d'];

      for (const range of ranges) {
        const response = await request(app)
          .get(`/api/security/dashboard?range=${range}`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(response.body.data).toBeDefined();
      }
    });

    it('should require authentication', async () => {
      await request(app).get('/api/security/dashboard').expect(401);
    });

    it('should default to 24h range if not specified', async () => {
      const response = await request(app)
        .get('/api/security/dashboard')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });
  });

  describe('GET /api/security/overview', () => {
    beforeEach(async () => {
      // Insert test security events
      await pool.query(
        `INSERT INTO security_events (event_type, severity, message, ip_address)
         VALUES
         ('login_attempt', 'high', 'Failed login', '192.168.1.1'),
         ('api_key_denied', 'critical', 'Invalid API key', '192.168.1.2'),
         ('csp_violation', 'medium', 'CSP violation detected', '192.168.1.3'),
         ('session_hijack', 'critical', 'Session hijack attempt', '192.168.1.1')`
      );
    });

    it('should return security overview metrics', async () => {
      const response = await request(app)
        .get('/api/security/overview?range=24h')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('totalEvents');
      expect(response.body.data).toHaveProperty('criticalEvents');
      expect(response.body.data).toHaveProperty('highSeverityEvents');
      expect(response.body.data).toHaveProperty('mediumSeverityEvents');
      expect(response.body.data).toHaveProperty('lowSeverityEvents');
      expect(response.body.data).toHaveProperty('uniqueIPs');
      expect(response.body.data).toHaveProperty('threatLevel');

      expect(response.body.data.totalEvents).toBe(4);
      expect(response.body.data.criticalEvents).toBe(2);
      expect(response.body.data.highSeverityEvents).toBe(1);
      expect(response.body.data.mediumSeverityEvents).toBe(1);
    });

    it('should calculate threat level correctly', async () => {
      const response = await request(app)
        .get('/api/security/overview?range=24h')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.data.threatLevel).toBe('low');
    });
  });

  describe('GET /api/security/login-metrics', () => {
    beforeEach(async () => {
      // Insert login events
      await pool.query(
        `INSERT INTO security_events (event_type, severity, message, details)
         VALUES
         ('login_success', 'low', 'Successful login', '{"userId": "${testUserId}"}'),
         ('login_failed', 'medium', 'Failed login', '{"reason": "invalid_password"}'),
         ('login_failed', 'medium', 'Failed login', '{"reason": "invalid_username"}'),
         ('login_success', 'low', 'Successful login', '{"userId": "${testUserId}"}')`
      );
    });

    it('should return login metrics', async () => {
      const response = await request(app)
        .get('/api/security/login-metrics?range=24h')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('totalAttempts');
      expect(response.body.data).toHaveProperty('successfulLogins');
      expect(response.body.data).toHaveProperty('failedLogins');
      expect(response.body.data).toHaveProperty('successRate');

      expect(response.body.data.totalAttempts).toBe(4);
      expect(response.body.data.successfulLogins).toBe(2);
      expect(response.body.data.failedLogins).toBe(2);
      expect(response.body.data.successRate).toBe(50);
    });
  });

  describe('GET /api/security/api-key-metrics', () => {
    let apiKeyId: string;

    beforeEach(async () => {
      // Create test API key
      const result = await pool.query(
        `INSERT INTO api_keys (user_id, name, key_hash, expires_at)
         VALUES ($1, $2, $3, NOW() + INTERVAL '30 days')
         RETURNING id`,
        [testUserId, 'Test Key', 'hash']
      );
      apiKeyId = result.rows[0].id;

      // Insert API key events
      await pool.query(
        `INSERT INTO security_events (event_type, severity, message, details)
         VALUES
         ('api_key_used', 'low', 'API key used', '{"apiKeyId": "${apiKeyId}"}'),
         ('api_key_denied', 'high', 'API key denied', '{"apiKeyId": "${apiKeyId}"}')`
      );
    });

    afterEach(async () => {
      await pool.query('DELETE FROM api_keys WHERE id = $1', [apiKeyId]);
    });

    it('should return API key metrics', async () => {
      const response = await request(app)
        .get('/api/security/api-key-metrics')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('totalKeys');
      expect(response.body.data).toHaveProperty('activeKeys');
      expect(response.body.data).toHaveProperty('expiredKeys');
      expect(response.body.data).toHaveProperty('revokedKeys');
    });
  });

  describe('GET /api/security/session-metrics', () => {
    it('should return session metrics', async () => {
      // Create test session
      await pool.query(
        `INSERT INTO sessions (user_id, session_token, ip_address, user_agent, expires_at)
         VALUES ($1, $2, $3, $4, NOW() + INTERVAL '1 hour')`,
        [testUserId, 'test-token', '192.168.1.1', 'Test Browser']
      );

      const response = await request(app)
        .get('/api/security/session-metrics')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('totalSessions');
      expect(response.body.data).toHaveProperty('activeSessions');
      expect(response.body.data).toHaveProperty('expiredSessions');
    });
  });

  describe('GET /api/security/csp-metrics', () => {
    beforeEach(async () => {
      // Insert CSP violation events
      await pool.query(
        `INSERT INTO security_events (event_type, severity, message, details)
         VALUES
         ('csp_violation', 'medium', 'CSP violation', '{"directive": "script-src"}'),
         ('csp_violation', 'medium', 'CSP violation', '{"directive": "style-src"}'),
         ('csp_violation', 'medium', 'CSP violation', '{"directive": "script-src"}')`
      );
    });

    it('should return CSP metrics', async () => {
      const response = await request(app)
        .get('/api/security/csp-metrics?range=24h')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('totalViolations');
      expect(response.body.data).toHaveProperty('uniqueDirectives');
      expect(response.body.data).toHaveProperty('topViolations');

      expect(response.body.data.totalViolations).toBe(3);
    });
  });

  describe('GET /api/security/threat-summary', () => {
    beforeEach(async () => {
      // Insert blocked IPs
      await pool.query(
        `INSERT INTO api_key_ip_blacklist (ip_address, reason, severity, expires_at)
         VALUES
         ('192.168.1.100', 'Brute force', 'high', NOW() + INTERVAL '24 hours'),
         ('192.168.1.101', 'SQL injection', 'critical', NOW() + INTERVAL '24 hours')`
      );

      // Insert security events
      await pool.query(
        `INSERT INTO security_events (event_type, severity, message, ip_address)
         VALUES
         ('brute_force', 'critical', 'Brute force detected', '192.168.1.100'),
         ('sql_injection', 'critical', 'SQL injection attempt', '192.168.1.101')`
      );
    });

    afterEach(async () => {
      await pool.query('DELETE FROM api_key_ip_blacklist');
    });

    it('should return threat summary', async () => {
      const response = await request(app)
        .get('/api/security/threat-summary')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('activeThreats');
      expect(response.body.data).toHaveProperty('blockedIPs');
      expect(response.body.data).toHaveProperty('criticalIncidents');
      expect(response.body.data).toHaveProperty('threatLevel');

      expect(response.body.data.blockedIPs).toBe(2);
      expect(response.body.data.criticalIncidents).toBe(2);
    });
  });

  describe('GET /api/security/timeline', () => {
    beforeEach(async () => {
      // Insert events at different times
      await pool.query(
        `INSERT INTO security_events (event_type, severity, message, created_at)
         VALUES
         ('test_event', 'critical', 'Critical event', NOW() - INTERVAL '1 hour'),
         ('test_event', 'high', 'High event', NOW() - INTERVAL '2 hours'),
         ('test_event', 'medium', 'Medium event', NOW() - INTERVAL '3 hours'),
         ('test_event', 'low', 'Low event', NOW() - INTERVAL '4 hours')`
      );
    });

    it('should return security timeline', async () => {
      const response = await request(app)
        .get('/api/security/timeline?range=24h')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);

      const firstEntry = response.body.data[0];
      expect(firstEntry).toHaveProperty('timestamp');
      expect(firstEntry).toHaveProperty('critical');
      expect(firstEntry).toHaveProperty('high');
      expect(firstEntry).toHaveProperty('medium');
      expect(firstEntry).toHaveProperty('low');
    });

    it('should support different time ranges', async () => {
      const ranges = ['24h', '7d', '30d'];

      for (const range of ranges) {
        const response = await request(app)
          .get(`/api/security/timeline?range=${range}`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        expect(response.body.success).toBe(true);
        expect(Array.isArray(response.body.data)).toBe(true);
      }
    });
  });

  describe('GET /api/security/top-threats', () => {
    beforeEach(async () => {
      // Insert events from different IPs
      await pool.query(
        `INSERT INTO security_events (event_type, severity, message, ip_address)
         VALUES
         ('attack', 'critical', 'Attack 1', '192.168.1.100'),
         ('attack', 'critical', 'Attack 2', '192.168.1.100'),
         ('attack', 'critical', 'Attack 3', '192.168.1.100'),
         ('attack', 'high', 'Attack 4', '192.168.1.101'),
         ('attack', 'high', 'Attack 5', '192.168.1.101')`
      );
    });

    it('should return top threat actors', async () => {
      const response = await request(app)
        .get('/api/security/top-threats?limit=10')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);

      const topThreat = response.body.data[0];
      expect(topThreat).toHaveProperty('ipAddress');
      expect(topThreat).toHaveProperty('eventCount');
      expect(topThreat).toHaveProperty('maxSeverity');
      expect(topThreat.ipAddress).toBe('192.168.1.100');
      expect(topThreat.eventCount).toBe(3);
    });

    it('should respect limit parameter', async () => {
      const response = await request(app)
        .get('/api/security/top-threats?limit=1')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.data.length).toBeLessThanOrEqual(1);
    });

    it('should validate limit parameter', async () => {
      await request(app)
        .get('/api/security/top-threats?limit=101')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);
    });
  });

  describe('GET /api/security/geographic-threats', () => {
    it('should return geographic threat distribution', async () => {
      const response = await request(app)
        .get('/api/security/geographic-threats')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });
  });

  describe('GET /api/security/events', () => {
    beforeEach(async () => {
      // Insert various test events
      await pool.query(
        `INSERT INTO security_events (event_type, severity, message, ip_address)
         VALUES
         ('login_failed', 'medium', 'Failed login', '192.168.1.1'),
         ('api_key_denied', 'high', 'API key denied', '192.168.1.2'),
         ('csp_violation', 'low', 'CSP violation', '192.168.1.3'),
         ('brute_force', 'critical', 'Brute force', '192.168.1.4')`
      );
    });

    it('should return security events with pagination', async () => {
      const response = await request(app)
        .get('/api/security/events?limit=2&offset=0')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('events');
      expect(response.body.data).toHaveProperty('total');
      expect(response.body.data).toHaveProperty('limit');
      expect(response.body.data).toHaveProperty('offset');
      expect(response.body.data.events.length).toBeLessThanOrEqual(2);
      expect(response.body.data.total).toBe(4);
    });

    it('should filter by severity', async () => {
      const response = await request(app)
        .get('/api/security/events?severity=critical')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.events.length).toBe(1);
      expect(response.body.data.events[0].severity).toBe('critical');
    });

    it('should filter by event type', async () => {
      const response = await request(app)
        .get('/api/security/events?type=login_failed')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.events.length).toBe(1);
      expect(response.body.data.events[0].event_type).toBe('login_failed');
    });

    it('should combine filters', async () => {
      const response = await request(app)
        .get('/api/security/events?severity=medium&type=login_failed')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.events.length).toBe(1);
    });
  });

  describe('GET /api/security/events/:id', () => {
    let eventId: string;

    beforeEach(async () => {
      const result = await pool.query(
        `INSERT INTO security_events (event_type, severity, message, details)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        ['test_event', 'high', 'Test event', { test: 'data' }]
      );
      eventId = result.rows[0].id;
    });

    it('should return specific security event', async () => {
      const response = await request(app)
        .get(`/api/security/events/${eventId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data).toHaveProperty('event_type');
      expect(response.body.data).toHaveProperty('severity');
      expect(response.body.data.id).toBe(eventId);
    });

    it('should return 404 for non-existent event', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const response = await request(app)
        .get(`/api/security/events/${fakeId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBe('Security event not found');
    });
  });

  describe('GET /api/security/stats', () => {
    beforeEach(async () => {
      // Create test data
      await pool.query(
        `INSERT INTO security_events (event_type, severity, message)
         VALUES
         ('test1', 'critical', 'Critical event'),
         ('test2', 'low', 'Low event')`
      );

      await pool.query(
        `INSERT INTO api_key_ip_blacklist (ip_address, reason, is_active)
         VALUES ('192.168.1.1', 'Test', TRUE)`
      );

      await pool.query(
        `INSERT INTO sessions (user_id, session_token, ip_address, user_agent, expires_at)
         VALUES ($1, 'token', '192.168.1.1', 'browser', NOW() + INTERVAL '1 hour')`,
        [testUserId]
      );
    });

    afterEach(async () => {
      await pool.query('DELETE FROM api_key_ip_blacklist');
      await pool.query('DELETE FROM sessions WHERE user_id = $1', [testUserId]);
    });

    it('should return quick statistics', async () => {
      const response = await request(app)
        .get('/api/security/stats')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('events_24h');
      expect(response.body.data).toHaveProperty('critical_24h');
      expect(response.body.data).toHaveProperty('blocked_ips');
      expect(response.body.data).toHaveProperty('active_sessions');
      expect(response.body.data).toHaveProperty('active_api_keys');

      expect(response.body.data.events_24h).toBe(2);
      expect(response.body.data.critical_24h).toBe(1);
      expect(response.body.data.blocked_ips).toBe(1);
      expect(response.body.data.active_sessions).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid time range', async () => {
      const response = await request(app)
        .get('/api/security/overview?range=invalid')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should handle database errors gracefully', async () => {
      // Close pool to simulate database error
      const originalQuery = pool.query;
      pool.query = jest.fn().mockRejectedValue(new Error('Database error'));

      const response = await request(app)
        .get('/api/security/overview')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toBeDefined();

      // Restore pool
      pool.query = originalQuery;
    });
  });
});
