import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import { Pool } from 'pg';
import { createServer, Server as HTTPServer } from 'http';
import { sign } from 'jsonwebtoken';
import WebSocket from 'ws';
import {
  SecurityWebSocketService,
  initializeSecurityWebSocketService,
} from '../services/security-websocket.service.js';

/**
 * Security WebSocket Tests
 * Tests for real-time security event streaming
 */

describe('Security WebSocket Service', () => {
  let pool: Pool;
  let httpServer: HTTPServer;
  let service: SecurityWebSocketService;
  let testUserId: string;
  let authToken: string;
  const port = 3001;

  beforeAll(async () => {
    // Initialize test database connection
    pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'website_cloner_test',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
    });

    // Create test user
    const userResult = await pool.query(
      `INSERT INTO users (username, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id`,
      ['wstest', 'wstest@example.com', 'hashedpassword']
    );
    testUserId = userResult.rows[0].id;

    // Generate auth token
    const secret = process.env.JWT_SECRET || 'test-secret';
    authToken = sign({ userId: testUserId, username: 'wstest' }, secret, {
      expiresIn: '1h',
    });

    // Create HTTP server
    httpServer = createServer();

    // Initialize WebSocket service
    service = initializeSecurityWebSocketService(pool, httpServer);

    // Start server
    await new Promise<void>((resolve) => {
      httpServer.listen(port, () => {
        resolve();
      });
    });
  });

  afterAll(async () => {
    // Cleanup
    service.shutdown();
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
    await pool.query('DELETE FROM users WHERE id = $1', [testUserId]);
    await pool.end();
  });

  beforeEach(async () => {
    // Clean up security events
    await pool.query('DELETE FROM security_events');
  });

  describe('Connection Management', () => {
    it('should accept authenticated connections', async () => {
      const ws = new WebSocket(
        `ws://localhost:${port}/api/security/ws?token=${authToken}`
      );

      await new Promise<void>((resolve, reject) => {
        ws.on('open', () => {
          expect(ws.readyState).toBe(WebSocket.OPEN);
          resolve();
        });
        ws.on('error', reject);
      });

      ws.close();
    });

    it('should reject connections without token', async () => {
      const ws = new WebSocket(`ws://localhost:${port}/api/security/ws`);

      await new Promise<void>((resolve) => {
        ws.on('error', (error) => {
          expect(error).toBeDefined();
          resolve();
        });
        ws.on('open', () => {
          ws.close();
        });
      });
    });

    it('should reject connections with invalid token', async () => {
      const ws = new WebSocket(
        `ws://localhost:${port}/api/security/ws?token=invalid`
      );

      await new Promise<void>((resolve) => {
        ws.on('error', (error) => {
          expect(error).toBeDefined();
          resolve();
        });
        ws.on('open', () => {
          ws.close();
        });
      });
    });

    it('should send welcome message on connection', async () => {
      const ws = new WebSocket(
        `ws://localhost:${port}/api/security/ws?token=${authToken}`
      );

      const welcomeMessage = await new Promise<any>((resolve, reject) => {
        ws.on('message', (data) => {
          const message = JSON.parse(data.toString());
          resolve(message);
        });
        ws.on('error', reject);
      });

      expect(welcomeMessage.type).toBe('connected');
      expect(welcomeMessage.message).toBe('Connected to security event stream');
      expect(welcomeMessage.clientId).toBeDefined();

      ws.close();
    });

    it('should track connected clients', async () => {
      const initialCount = service.getConnectedClientsCount();

      const ws = new WebSocket(
        `ws://localhost:${port}/api/security/ws?token=${authToken}`
      );

      await new Promise<void>((resolve) => {
        ws.on('open', () => resolve());
      });

      expect(service.getConnectedClientsCount()).toBe(initialCount + 1);

      ws.close();

      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(service.getConnectedClientsCount()).toBe(initialCount);
    });
  });

  describe('Message Handling', () => {
    let ws: WebSocket;

    beforeEach(async () => {
      ws = new WebSocket(
        `ws://localhost:${port}/api/security/ws?token=${authToken}`
      );

      // Wait for connection
      await new Promise<void>((resolve) => {
        ws.on('open', () => resolve());
      });

      // Clear welcome message
      await new Promise<void>((resolve) => {
        ws.on('message', () => resolve());
      });
    });

    afterEach(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    });

    it('should respond to ping messages', async () => {
      ws.send(JSON.stringify({ type: 'ping' }));

      const response = await new Promise<any>((resolve) => {
        ws.on('message', (data) => {
          const message = JSON.parse(data.toString());
          resolve(message);
        });
      });

      expect(response.type).toBe('pong');
      expect(response.timestamp).toBeDefined();
    });

    it('should handle filter updates', async () => {
      const filters = {
        severity: ['critical', 'high'],
        eventTypes: ['login_failed', 'brute_force'],
      };

      ws.send(
        JSON.stringify({
          type: 'setFilters',
          filters,
        })
      );

      const response = await new Promise<any>((resolve) => {
        ws.on('message', (data) => {
          const message = JSON.parse(data.toString());
          resolve(message);
        });
      });

      expect(response.type).toBe('filtersUpdated');
      expect(response.filters).toEqual(filters);
    });

    it('should handle subscription', async () => {
      const eventTypes = ['login_failed', 'api_key_denied'];

      ws.send(
        JSON.stringify({
          type: 'subscribe',
          eventTypes,
        })
      );

      const response = await new Promise<any>((resolve) => {
        ws.on('message', (data) => {
          const message = JSON.parse(data.toString());
          resolve(message);
        });
      });

      expect(response.type).toBe('subscribed');
      expect(response.eventTypes).toEqual(eventTypes);
    });

    it('should handle unsubscription', async () => {
      ws.send(JSON.stringify({ type: 'unsubscribe' }));

      const response = await new Promise<any>((resolve) => {
        ws.on('message', (data) => {
          const message = JSON.parse(data.toString());
          resolve(message);
        });
      });

      expect(response.type).toBe('unsubscribed');
    });
  });

  describe('Event Broadcasting', () => {
    let ws: WebSocket;

    beforeEach(async () => {
      ws = new WebSocket(
        `ws://localhost:${port}/api/security/ws?token=${authToken}`
      );

      await new Promise<void>((resolve) => {
        ws.on('open', () => resolve());
      });

      // Clear welcome message
      await new Promise<void>((resolve) => {
        ws.on('message', () => resolve());
      });
    });

    afterEach(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    });

    it('should broadcast security events to all clients', async () => {
      const testEvent = {
        id: '123',
        eventType: 'login_failed',
        severity: 'high' as const,
        message: 'Failed login attempt',
        ipAddress: '192.168.1.1',
        timestamp: new Date(),
      };

      const messagePromise = new Promise<any>((resolve) => {
        ws.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'securityEvent') {
            resolve(message);
          }
        });
      });

      service.broadcastSecurityEvent(testEvent);

      const message = await messagePromise;

      expect(message.type).toBe('securityEvent');
      expect(message.event.eventType).toBe('login_failed');
      expect(message.event.severity).toBe('high');
      expect(message.event.message).toBe('Failed login attempt');
    });

    it('should respect severity filters', async () => {
      // Set filter to only receive critical events
      ws.send(
        JSON.stringify({
          type: 'setFilters',
          filters: { severity: ['critical'] },
        })
      );

      // Wait for filter confirmation
      await new Promise<void>((resolve) => {
        ws.on('message', () => resolve());
      });

      const receivedEvents: any[] = [];

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'securityEvent') {
          receivedEvents.push(message.event);
        }
      });

      // Broadcast events with different severities
      service.broadcastSecurityEvent({
        id: '1',
        eventType: 'test',
        severity: 'critical',
        message: 'Critical event',
        timestamp: new Date(),
      });

      service.broadcastSecurityEvent({
        id: '2',
        eventType: 'test',
        severity: 'low',
        message: 'Low event',
        timestamp: new Date(),
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(receivedEvents.length).toBe(1);
      expect(receivedEvents[0].severity).toBe('critical');
    });

    it('should respect event type filters', async () => {
      // Set filter to only receive login events
      ws.send(
        JSON.stringify({
          type: 'setFilters',
          filters: { eventTypes: ['login_failed'] },
        })
      );

      // Wait for filter confirmation
      await new Promise<void>((resolve) => {
        ws.on('message', () => resolve());
      });

      const receivedEvents: any[] = [];

      ws.on('message', (data) => {
        const message = JSON.parse(data.toString());
        if (message.type === 'securityEvent') {
          receivedEvents.push(message.event);
        }
      });

      // Broadcast events with different types
      service.broadcastSecurityEvent({
        id: '1',
        eventType: 'login_failed',
        severity: 'high',
        message: 'Login failed',
        timestamp: new Date(),
      });

      service.broadcastSecurityEvent({
        id: '2',
        eventType: 'api_key_denied',
        severity: 'high',
        message: 'API key denied',
        timestamp: new Date(),
      });

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(receivedEvents.length).toBe(1);
      expect(receivedEvents[0].eventType).toBe('login_failed');
    });
  });

  describe('User-specific Communication', () => {
    let ws: WebSocket;

    beforeEach(async () => {
      ws = new WebSocket(
        `ws://localhost:${port}/api/security/ws?token=${authToken}`
      );

      await new Promise<void>((resolve) => {
        ws.on('open', () => resolve());
      });

      // Clear welcome message
      await new Promise<void>((resolve) => {
        ws.on('message', () => resolve());
      });
    });

    afterEach(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    });

    it('should send messages to specific user', async () => {
      const testMessage = {
        type: 'notification',
        message: 'Test notification',
      };

      const messagePromise = new Promise<any>((resolve) => {
        ws.on('message', (data) => {
          const message = JSON.parse(data.toString());
          if (message.type === 'notification') {
            resolve(message);
          }
        });
      });

      service.sendToUser(testUserId, testMessage);

      const received = await messagePromise;
      expect(received.message).toBe('Test notification');
    });

    it('should disconnect specific user', async () => {
      const closePromise = new Promise<void>((resolve) => {
        ws.on('close', () => resolve());
      });

      service.disconnectUser(testUserId);

      await closePromise;
      expect(ws.readyState).toBe(WebSocket.CLOSED);
    });
  });

  describe('Health Monitoring', () => {
    it('should provide connected clients information', async () => {
      const ws = new WebSocket(
        `ws://localhost:${port}/api/security/ws?token=${authToken}`
      );

      await new Promise<void>((resolve) => {
        ws.on('open', () => resolve());
      });

      const clients = service.getConnectedClients();
      expect(clients.length).toBeGreaterThan(0);

      const client = clients.find((c) => c.userId === testUserId);
      expect(client).toBeDefined();
      expect(client?.username).toBe('wstest');

      ws.close();
    });

    it('should handle ping/pong for connection health', async () => {
      const ws = new WebSocket(
        `ws://localhost:${port}/api/security/ws?token=${authToken}`
      );

      await new Promise<void>((resolve) => {
        ws.on('open', () => resolve());
      });

      const pongReceived = new Promise<void>((resolve) => {
        ws.on('pong', () => resolve());
      });

      await pongReceived;

      ws.close();
    });
  });

  describe('Recent Events Retrieval', () => {
    beforeEach(async () => {
      // Insert test events
      await pool.query(
        `INSERT INTO security_events (event_type, severity, message, ip_address)
         VALUES
         ('login_failed', 'high', 'Failed login 1', '192.168.1.1'),
         ('login_failed', 'medium', 'Failed login 2', '192.168.1.2'),
         ('api_key_denied', 'critical', 'API key denied', '192.168.1.3'),
         ('brute_force', 'critical', 'Brute force', '192.168.1.4')`
      );
    });

    it('should retrieve recent security events', async () => {
      const events = await service.getRecentSecurityEvents(10);

      expect(events.length).toBe(4);
      expect(events[0]).toHaveProperty('id');
      expect(events[0]).toHaveProperty('eventType');
      expect(events[0]).toHaveProperty('severity');
      expect(events[0]).toHaveProperty('message');
    });

    it('should filter events by severity', async () => {
      const events = await service.getRecentSecurityEvents(10, {
        severity: ['critical'],
      });

      expect(events.length).toBe(2);
      expect(events.every((e) => e.severity === 'critical')).toBe(true);
    });

    it('should filter events by type', async () => {
      const events = await service.getRecentSecurityEvents(10, {
        eventTypes: ['login_failed'],
      });

      expect(events.length).toBe(2);
      expect(events.every((e) => e.eventType === 'login_failed')).toBe(true);
    });

    it('should respect limit parameter', async () => {
      const events = await service.getRecentSecurityEvents(2);

      expect(events.length).toBe(2);
    });

    it('should combine filters', async () => {
      const events = await service.getRecentSecurityEvents(10, {
        severity: ['high', 'medium'],
        eventTypes: ['login_failed'],
      });

      expect(events.length).toBe(2);
      expect(events.every((e) => e.eventType === 'login_failed')).toBe(true);
      expect(
        events.every((e) => e.severity === 'high' || e.severity === 'medium')
      ).toBe(true);
    });
  });

  describe('Broadcasting', () => {
    it('should broadcast to all clients', async () => {
      const ws1 = new WebSocket(
        `ws://localhost:${port}/api/security/ws?token=${authToken}`
      );
      const ws2 = new WebSocket(
        `ws://localhost:${port}/api/security/ws?token=${authToken}`
      );

      await Promise.all([
        new Promise<void>((resolve) => ws1.on('open', () => resolve())),
        new Promise<void>((resolve) => ws2.on('open', () => resolve())),
      ]);

      // Clear welcome messages
      await Promise.all([
        new Promise<void>((resolve) => ws1.on('message', () => resolve())),
        new Promise<void>((resolve) => ws2.on('message', () => resolve())),
      ]);

      const received1: any[] = [];
      const received2: any[] = [];

      ws1.on('message', (data) => {
        received1.push(JSON.parse(data.toString()));
      });

      ws2.on('message', (data) => {
        received2.push(JSON.parse(data.toString()));
      });

      const testMessage = { type: 'test', data: 'broadcast test' };
      service.broadcast(testMessage);

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(received1.length).toBeGreaterThan(0);
      expect(received2.length).toBeGreaterThan(0);
      expect(received1[0].type).toBe('test');
      expect(received2[0].type).toBe('test');

      ws1.close();
      ws2.close();
    });
  });

  describe('Cleanup and Shutdown', () => {
    it('should disconnect all clients on shutdown', async () => {
      const ws = new WebSocket(
        `ws://localhost:${port}/api/security/ws?token=${authToken}`
      );

      await new Promise<void>((resolve) => {
        ws.on('open', () => resolve());
      });

      const closePromise = new Promise<void>((resolve) => {
        ws.on('close', () => resolve());
      });

      service.disconnectAll();

      await closePromise;
      expect(ws.readyState).toBe(WebSocket.CLOSED);
      expect(service.getConnectedClientsCount()).toBe(0);
    });
  });
});
