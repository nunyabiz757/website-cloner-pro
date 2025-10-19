import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import { Pool } from 'pg';
import express, { Express } from 'express';
import request from 'supertest';
import { sign } from 'jsonwebtoken';
import {
  AlertingService,
  initializeAlertingService,
  SecurityEventForAlert,
} from '../services/alerting.service.js';
import alertConfigRoutes, { initializeAlertRoutes } from '../routes/alert-configuration.routes.js';
import axios from 'axios';

/**
 * Security Alerting Tests
 * Tests for alert configuration and delivery
 */

// Mock axios for Slack tests
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('Security Alerting Service', () => {
  let pool: Pool;
  let app: Express;
  let alertingService: AlertingService;
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

    // Initialize services
    alertingService = initializeAlertingService(pool);
    initializeAlertRoutes(pool);
    app.use('/api/alerts', alertConfigRoutes);

    // Create test user
    const userResult = await pool.query(
      `INSERT INTO users (username, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id`,
      ['alerttest', 'alerttest@example.com', 'hashedpassword']
    );
    testUserId = userResult.rows[0].id;

    // Generate auth token
    const secret = process.env.JWT_SECRET || 'test-secret';
    authToken = sign({ userId: testUserId, username: 'alerttest' }, secret, {
      expiresIn: '1h',
    });

    // Run migrations
    await pool.query(`
      CREATE TABLE IF NOT EXISTS security_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        event_type VARCHAR(255) NOT NULL,
        severity VARCHAR(50) NOT NULL,
        message TEXT NOT NULL,
        details JSONB,
        ip_address VARCHAR(45),
        user_id UUID REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  });

  afterAll(async () => {
    // Cleanup
    await pool.query('DELETE FROM alert_configurations');
    await pool.query('DELETE FROM security_events');
    await pool.query('DELETE FROM users WHERE id = $1', [testUserId]);
    await pool.end();
  });

  beforeEach(async () => {
    // Clean up before each test
    await pool.query('DELETE FROM alert_configurations');
    await pool.query('DELETE FROM alert_history');
    await pool.query('DELETE FROM alert_suppressions');
    await pool.query('DELETE FROM security_events');

    // Reset axios mock
    mockedAxios.post.mockReset();
  });

  describe('Alert Configuration CRUD', () => {
    it('should create new alert configuration', async () => {
      const alertData = {
        name: 'Test Alert',
        description: 'Test alert configuration',
        enabled: true,
        eventTypes: ['login_failed', 'brute_force'],
        severityLevels: ['critical', 'high'],
        thresholdCount: 3,
        thresholdWindowMinutes: 10,
        emailEnabled: true,
        emailRecipients: ['admin@test.com'],
        slackEnabled: false,
        cooldownMinutes: 60,
        priority: 'high',
        includeDetails: true,
        aggregateSimilar: true,
      };

      const response = await request(app)
        .post('/api/alerts/configurations')
        .set('Authorization', `Bearer ${authToken}`)
        .send(alertData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('id');
      expect(response.body.data.name).toBe('Test Alert');
      expect(response.body.data.eventTypes).toEqual(['login_failed', 'brute_force']);
    });

    it('should require at least one alert channel', async () => {
      const alertData = {
        name: 'Invalid Alert',
        eventTypes: ['login_failed'],
        severityLevels: ['high'],
        thresholdCount: 1,
        thresholdWindowMinutes: 5,
        emailEnabled: false,
        slackEnabled: false,
        cooldownMinutes: 30,
        priority: 'medium',
        includeDetails: true,
        aggregateSimilar: true,
      };

      const response = await request(app)
        .post('/api/alerts/configurations')
        .set('Authorization', `Bearer ${authToken}`)
        .send(alertData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('at least one alert channel');
    });

    it('should require email recipients when email is enabled', async () => {
      const alertData = {
        name: 'Invalid Email Alert',
        eventTypes: ['login_failed'],
        severityLevels: ['high'],
        thresholdCount: 1,
        thresholdWindowMinutes: 5,
        emailEnabled: true,
        slackEnabled: false,
        cooldownMinutes: 30,
        priority: 'medium',
        includeDetails: true,
        aggregateSimilar: true,
      };

      const response = await request(app)
        .post('/api/alerts/configurations')
        .set('Authorization', `Bearer ${authToken}`)
        .send(alertData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('Email recipients are required');
    });

    it('should get all alert configurations', async () => {
      // Create test configurations
      await alertingService.createAlertConfiguration({
        name: 'Alert 1',
        enabled: true,
        eventTypes: ['login_failed'],
        severityLevels: ['high'],
        thresholdCount: 1,
        thresholdWindowMinutes: 5,
        emailEnabled: true,
        emailRecipients: ['test@test.com'],
        slackEnabled: false,
        cooldownMinutes: 30,
        priority: 'medium',
        includeDetails: true,
        aggregateSimilar: true,
      });

      const response = await request(app)
        .get('/api/alerts/configurations')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
      expect(response.body.count).toBeGreaterThan(0);
    });

    it('should get specific alert configuration', async () => {
      const config = await alertingService.createAlertConfiguration({
        name: 'Specific Alert',
        enabled: true,
        eventTypes: ['api_key_denied'],
        severityLevels: ['critical'],
        thresholdCount: 1,
        thresholdWindowMinutes: 5,
        emailEnabled: true,
        emailRecipients: ['test@test.com'],
        slackEnabled: false,
        cooldownMinutes: 30,
        priority: 'urgent',
        includeDetails: true,
        aggregateSimilar: true,
      });

      const response = await request(app)
        .get(`/api/alerts/configurations/${config.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(config.id);
      expect(response.body.data.name).toBe('Specific Alert');
    });

    it('should update alert configuration', async () => {
      const config = await alertingService.createAlertConfiguration({
        name: 'Update Test',
        enabled: true,
        eventTypes: ['login_failed'],
        severityLevels: ['high'],
        thresholdCount: 1,
        thresholdWindowMinutes: 5,
        emailEnabled: true,
        emailRecipients: ['test@test.com'],
        slackEnabled: false,
        cooldownMinutes: 30,
        priority: 'medium',
        includeDetails: true,
        aggregateSimilar: true,
      });

      const response = await request(app)
        .put(`/api/alerts/configurations/${config.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ name: 'Updated Alert', thresholdCount: 5 })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('Updated Alert');
      expect(response.body.data.thresholdCount).toBe(5);
    });

    it('should delete alert configuration', async () => {
      const config = await alertingService.createAlertConfiguration({
        name: 'Delete Test',
        enabled: true,
        eventTypes: ['login_failed'],
        severityLevels: ['high'],
        thresholdCount: 1,
        thresholdWindowMinutes: 5,
        emailEnabled: true,
        emailRecipients: ['test@test.com'],
        slackEnabled: false,
        cooldownMinutes: 30,
        priority: 'medium',
        includeDetails: true,
        aggregateSimilar: true,
      });

      await request(app)
        .delete(`/api/alerts/configurations/${config.id}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      const deleted = await alertingService.getAlertConfiguration(config.id);
      expect(deleted).toBeNull();
    });

    it('should toggle alert configuration', async () => {
      const config = await alertingService.createAlertConfiguration({
        name: 'Toggle Test',
        enabled: true,
        eventTypes: ['login_failed'],
        severityLevels: ['high'],
        thresholdCount: 1,
        thresholdWindowMinutes: 5,
        emailEnabled: true,
        emailRecipients: ['test@test.com'],
        slackEnabled: false,
        cooldownMinutes: 30,
        priority: 'medium',
        includeDetails: true,
        aggregateSimilar: true,
      });

      const response = await request(app)
        .post(`/api/alerts/configurations/${config.id}/toggle`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.enabled).toBe(false);
    });
  });

  describe('Alert Triggering', () => {
    it('should trigger alert when threshold is met', async () => {
      const config = await alertingService.createAlertConfiguration({
        name: 'Threshold Alert',
        enabled: true,
        eventTypes: ['login_failed'],
        severityLevels: ['high'],
        thresholdCount: 3,
        thresholdWindowMinutes: 10,
        emailEnabled: false,
        slackEnabled: true,
        slackWebhookUrl: 'https://hooks.slack.com/test',
        cooldownMinutes: 30,
        priority: 'high',
        includeDetails: true,
        aggregateSimilar: true,
      });

      mockedAxios.post.mockResolvedValue({ status: 200, data: 'ok' });

      // Create events that meet threshold
      for (let i = 0; i < 3; i++) {
        await pool.query(
          `INSERT INTO security_events (event_type, severity, message, ip_address)
           VALUES ($1, $2, $3, $4)`,
          ['login_failed', 'high', `Failed login attempt ${i}`, '192.168.1.100']
        );
      }

      const testEvent: SecurityEventForAlert = {
        id: 'test-event-id',
        eventType: 'login_failed',
        severity: 'high',
        message: 'Failed login attempt',
        ipAddress: '192.168.1.100',
        timestamp: new Date(),
      };

      await alertingService.processSecurityEvent(testEvent);

      // Verify alert was triggered
      const { history } = await alertingService.getAlertHistory(10, 0, {
        alertConfigId: config.id,
      });

      expect(history.length).toBeGreaterThan(0);
      expect(history[0].alertConfigurationId).toBe(config.id);
    });

    it('should not trigger disabled alerts', async () => {
      const config = await alertingService.createAlertConfiguration({
        name: 'Disabled Alert',
        enabled: false,
        eventTypes: ['brute_force'],
        severityLevels: ['critical'],
        thresholdCount: 1,
        thresholdWindowMinutes: 5,
        emailEnabled: true,
        emailRecipients: ['test@test.com'],
        slackEnabled: false,
        cooldownMinutes: 30,
        priority: 'urgent',
        includeDetails: true,
        aggregateSimilar: true,
      });

      const testEvent: SecurityEventForAlert = {
        id: 'test-event-id',
        eventType: 'brute_force',
        severity: 'critical',
        message: 'Brute force attack detected',
        timestamp: new Date(),
      };

      await alertingService.processSecurityEvent(testEvent);

      const { history } = await alertingService.getAlertHistory(10, 0, {
        alertConfigId: config.id,
      });

      expect(history.length).toBe(0);
    });

    it('should respect cooldown period', async () => {
      const config = await alertingService.createAlertConfiguration({
        name: 'Cooldown Alert',
        enabled: true,
        eventTypes: ['api_key_denied'],
        severityLevels: ['critical'],
        thresholdCount: 1,
        thresholdWindowMinutes: 5,
        emailEnabled: false,
        slackEnabled: true,
        slackWebhookUrl: 'https://hooks.slack.com/test',
        cooldownMinutes: 30,
        priority: 'urgent',
        includeDetails: true,
        aggregateSimilar: true,
      });

      mockedAxios.post.mockResolvedValue({ status: 200, data: 'ok' });

      const testEvent: SecurityEventForAlert = {
        id: 'test-event-1',
        eventType: 'api_key_denied',
        severity: 'critical',
        message: 'API key denied',
        timestamp: new Date(),
      };

      // Trigger first alert
      await alertingService.triggerAlert(config, [testEvent]);

      // Try to trigger again immediately
      await alertingService.processSecurityEvent(testEvent);

      const { history } = await alertingService.getAlertHistory(10, 0, {
        alertConfigId: config.id,
      });

      // Should only have one alert due to cooldown
      expect(history.length).toBe(1);
    });
  });

  describe('Slack Integration', () => {
    it('should send Slack alert successfully', async () => {
      mockedAxios.post.mockResolvedValue({ status: 200, data: 'ok' });

      const config = await alertingService.createAlertConfiguration({
        name: 'Slack Test',
        enabled: true,
        eventTypes: ['test_event'],
        severityLevels: ['high'],
        thresholdCount: 1,
        thresholdWindowMinutes: 5,
        emailEnabled: false,
        slackEnabled: true,
        slackWebhookUrl: 'https://hooks.slack.com/services/test',
        slackChannel: '#security',
        cooldownMinutes: 30,
        priority: 'high',
        includeDetails: true,
        aggregateSimilar: true,
      });

      const events: SecurityEventForAlert[] = [{
        id: 'test-1',
        eventType: 'test_event',
        severity: 'high',
        message: 'Test security event',
        ipAddress: '192.168.1.1',
        timestamp: new Date(),
      }];

      const historyId = await alertingService.triggerAlert(config, events);

      expect(historyId).toBeDefined();
      expect(mockedAxios.post).toHaveBeenCalled();

      const callArgs = mockedAxios.post.mock.calls[0];
      expect(callArgs[0]).toBe(config.slackWebhookUrl);
      expect(callArgs[1]).toHaveProperty('attachments');
    });

    it('should handle Slack errors gracefully', async () => {
      mockedAxios.post.mockRejectedValue(new Error('Slack API error'));

      const config = await alertingService.createAlertConfiguration({
        name: 'Slack Error Test',
        enabled: true,
        eventTypes: ['test_event'],
        severityLevels: ['high'],
        thresholdCount: 1,
        thresholdWindowMinutes: 5,
        emailEnabled: false,
        slackEnabled: true,
        slackWebhookUrl: 'https://hooks.slack.com/services/test',
        cooldownMinutes: 30,
        priority: 'high',
        includeDetails: true,
        aggregateSimilar: true,
      });

      const events: SecurityEventForAlert[] = [{
        id: 'test-1',
        eventType: 'test_event',
        severity: 'high',
        message: 'Test event',
        timestamp: new Date(),
      }];

      const historyId = await alertingService.triggerAlert(config, events);

      // Should still create history entry even if Slack fails
      expect(historyId).toBeDefined();

      const { history } = await alertingService.getAlertHistory(1, 0);
      expect(history[0].slackError).toBeDefined();
    });
  });

  describe('Alert History', () => {
    it('should retrieve alert history with pagination', async () => {
      const config = await alertingService.createAlertConfiguration({
        name: 'History Test',
        enabled: true,
        eventTypes: ['test_event'],
        severityLevels: ['medium'],
        thresholdCount: 1,
        thresholdWindowMinutes: 5,
        emailEnabled: false,
        slackEnabled: true,
        slackWebhookUrl: 'https://hooks.slack.com/test',
        cooldownMinutes: 0,
        priority: 'medium',
        includeDetails: true,
        aggregateSimilar: true,
      });

      mockedAxios.post.mockResolvedValue({ status: 200, data: 'ok' });

      // Create multiple alerts
      for (let i = 0; i < 5; i++) {
        await pool.query('DELETE FROM alert_suppressions WHERE alert_configuration_id = $1', [config.id]);

        const event: SecurityEventForAlert = {
          id: `test-${i}`,
          eventType: 'test_event',
          severity: 'medium',
          message: `Test event ${i}`,
          timestamp: new Date(),
        };
        await alertingService.triggerAlert(config, [event]);
      }

      const response = await request(app)
        .get('/api/alerts/history?limit=2&offset=0')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.length).toBe(2);
      expect(response.body.pagination.total).toBe(5);
      expect(response.body.pagination.pages).toBe(3);
    });

    it('should filter alert history by severity', async () => {
      const config = await alertingService.createAlertConfiguration({
        name: 'Filter Test',
        enabled: true,
        eventTypes: ['test_event'],
        severityLevels: ['critical', 'high'],
        thresholdCount: 1,
        thresholdWindowMinutes: 5,
        emailEnabled: false,
        slackEnabled: true,
        slackWebhookUrl: 'https://hooks.slack.com/test',
        cooldownMinutes: 0,
        priority: 'high',
        includeDetails: true,
        aggregateSimilar: true,
      });

      mockedAxios.post.mockResolvedValue({ status: 200, data: 'ok' });

      // Create alerts with different severities
      await pool.query('DELETE FROM alert_suppressions');

      await alertingService.triggerAlert(config, [{
        id: 'test-1',
        eventType: 'test_event',
        severity: 'critical',
        message: 'Critical event',
        timestamp: new Date(),
      }]);

      const response = await request(app)
        .get('/api/alerts/history?severity=critical')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.every((h: any) => h.severity === 'critical')).toBe(true);
    });
  });

  describe('Alert Statistics', () => {
    it('should retrieve alert statistics', async () => {
      const response = await request(app)
        .get('/api/alerts/statistics?days=30')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('total_alerts');
      expect(response.body.data).toHaveProperty('critical_alerts');
      expect(response.body.period).toBe('30 days');
    });

    it('should validate days parameter', async () => {
      await request(app)
        .get('/api/alerts/statistics?days=400')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);
    });
  });

  describe('Test Alerts', () => {
    it('should send test alert', async () => {
      mockedAxios.post.mockResolvedValue({ status: 200, data: 'ok' });

      const config = await alertingService.createAlertConfiguration({
        name: 'Test Alert Config',
        enabled: true,
        eventTypes: ['test_alert'],
        severityLevels: ['medium'],
        thresholdCount: 1,
        thresholdWindowMinutes: 5,
        emailEnabled: false,
        slackEnabled: true,
        slackWebhookUrl: 'https://hooks.slack.com/test',
        cooldownMinutes: 0,
        priority: 'medium',
        includeDetails: true,
        aggregateSimilar: true,
      });

      const response = await request(app)
        .post('/api/alerts/test')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          alertConfigId: config.id,
          testMessage: 'This is a test alert',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('Test alert sent');
      expect(response.body.historyId).toBeDefined();
    });
  });

  describe('Event Types', () => {
    it('should retrieve available event types', async () => {
      const response = await request(app)
        .get('/api/alerts/event-types')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
      expect(response.body.data[0]).toHaveProperty('type');
      expect(response.body.data[0]).toHaveProperty('category');
      expect(response.body.data[0]).toHaveProperty('description');
    });
  });

  describe('Cleanup', () => {
    it('should cleanup expired suppressions', async () => {
      const response = await request(app)
        .post('/api/alerts/cleanup')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body).toHaveProperty('deletedCount');
    });
  });
});
