import { WebSocketServer, WebSocket } from 'ws';
import { Server as HTTPServer } from 'http';
import { verify } from 'jsonwebtoken';
import { Pool } from 'pg';
import { AppLogger } from './logger.service.js';

/**
 * Security WebSocket Service
 * Provides real-time security event streaming to connected clients
 */

interface SecurityEvent {
  id: string;
  eventType: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  details?: Record<string, any>;
  ipAddress?: string;
  userId?: string;
  timestamp: Date;
}

interface AuthenticatedClient {
  ws: WebSocket;
  userId: string;
  username: string;
  filters?: {
    severity?: string[];
    eventTypes?: string[];
  };
  lastPing?: Date;
}

interface SecurityEventFilter {
  severity?: string[];
  eventTypes?: string[];
  userId?: string;
}

export class SecurityWebSocketService {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, AuthenticatedClient> = new Map();
  private pool: Pool;
  private pingInterval: NodeJS.Timeout | null = null;
  private readonly PING_INTERVAL = 30000; // 30 seconds
  private readonly PING_TIMEOUT = 10000; // 10 seconds

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Initialize WebSocket server
   */
  initialize(server: HTTPServer): void {
    this.wss = new WebSocketServer({
      server,
      path: '/api/security/ws',
      verifyClient: this.verifyClient.bind(this),
    });

    this.wss.on('connection', this.handleConnection.bind(this));
    this.startPingInterval();

    AppLogger.info('Security WebSocket service initialized', {
      path: '/api/security/ws',
    });
  }

  /**
   * Verify client connection
   */
  private verifyClient(
    info: { origin: string; secure: boolean; req: any },
    callback: (result: boolean, code?: number, message?: string) => void
  ): void {
    try {
      const url = new URL(info.req.url, `http://${info.req.headers.host}`);
      const token = url.searchParams.get('token');

      if (!token) {
        callback(false, 401, 'Authentication token required');
        return;
      }

      // Verify JWT token
      const secret = process.env.JWT_SECRET || 'your-secret-key';
      const decoded = verify(token, secret) as { userId: string; username: string };

      if (!decoded.userId) {
        callback(false, 401, 'Invalid token');
        return;
      }

      // Store decoded token for later use
      (info.req as any).user = decoded;
      callback(true);
    } catch (error) {
      AppLogger.error('WebSocket authentication failed', error as Error);
      callback(false, 401, 'Authentication failed');
    }
  }

  /**
   * Handle new WebSocket connection
   */
  private handleConnection(ws: WebSocket, req: any): void {
    const user = req.user as { userId: string; username: string };
    const clientId = this.generateClientId();

    const client: AuthenticatedClient = {
      ws,
      userId: user.userId,
      username: user.username,
      lastPing: new Date(),
    };

    this.clients.set(clientId, client);

    AppLogger.info('Security WebSocket client connected', {
      clientId,
      userId: user.userId,
      username: user.username,
      totalClients: this.clients.size,
    });

    // Send welcome message
    this.sendToClient(clientId, {
      type: 'connected',
      message: 'Connected to security event stream',
      clientId,
      timestamp: new Date(),
    });

    // Handle messages from client
    ws.on('message', (data: Buffer) => {
      this.handleClientMessage(clientId, data);
    });

    // Handle client disconnect
    ws.on('close', () => {
      this.handleClientDisconnect(clientId);
    });

    // Handle errors
    ws.on('error', (error: Error) => {
      AppLogger.error('WebSocket error', error, { clientId });
    });

    // Handle pong responses
    ws.on('pong', () => {
      const client = this.clients.get(clientId);
      if (client) {
        client.lastPing = new Date();
      }
    });
  }

  /**
   * Handle messages from client
   */
  private handleClientMessage(clientId: string, data: Buffer): void {
    try {
      const message = JSON.parse(data.toString());
      const client = this.clients.get(clientId);

      if (!client) {
        return;
      }

      switch (message.type) {
        case 'ping':
          this.sendToClient(clientId, { type: 'pong', timestamp: new Date() });
          break;

        case 'setFilters':
          client.filters = message.filters;
          this.sendToClient(clientId, {
            type: 'filtersUpdated',
            filters: client.filters,
            timestamp: new Date(),
          });
          AppLogger.info('Client filters updated', {
            clientId,
            filters: client.filters,
          });
          break;

        case 'subscribe':
          // Handle subscription to specific event types
          if (!client.filters) {
            client.filters = {};
          }
          client.filters.eventTypes = message.eventTypes || [];
          this.sendToClient(clientId, {
            type: 'subscribed',
            eventTypes: client.filters.eventTypes,
            timestamp: new Date(),
          });
          break;

        case 'unsubscribe':
          client.filters = undefined;
          this.sendToClient(clientId, {
            type: 'unsubscribed',
            timestamp: new Date(),
          });
          break;

        default:
          AppLogger.warn('Unknown WebSocket message type', {
            clientId,
            messageType: message.type,
          });
      }
    } catch (error) {
      AppLogger.error('Error handling client message', error as Error, {
        clientId,
      });
    }
  }

  /**
   * Handle client disconnect
   */
  private handleClientDisconnect(clientId: string): void {
    const client = this.clients.get(clientId);
    if (client) {
      AppLogger.info('Security WebSocket client disconnected', {
        clientId,
        userId: client.userId,
        username: client.username,
        totalClients: this.clients.size - 1,
      });
      this.clients.delete(clientId);
    }
  }

  /**
   * Broadcast security event to all connected clients
   */
  broadcastSecurityEvent(event: SecurityEvent): void {
    const message = {
      type: 'securityEvent',
      event,
      timestamp: new Date(),
    };

    let sentCount = 0;
    this.clients.forEach((client, clientId) => {
      if (this.shouldSendToClient(client, event)) {
        this.sendToClient(clientId, message);
        sentCount++;
      }
    });

    if (sentCount > 0) {
      AppLogger.debug('Security event broadcasted', {
        eventType: event.eventType,
        severity: event.severity,
        clientsNotified: sentCount,
      });
    }
  }

  /**
   * Check if event should be sent to client based on filters
   */
  private shouldSendToClient(
    client: AuthenticatedClient,
    event: SecurityEvent
  ): boolean {
    if (!client.filters) {
      return true; // No filters, send all events
    }

    // Check severity filter
    if (
      client.filters.severity &&
      client.filters.severity.length > 0 &&
      !client.filters.severity.includes(event.severity)
    ) {
      return false;
    }

    // Check event type filter
    if (
      client.filters.eventTypes &&
      client.filters.eventTypes.length > 0 &&
      !client.filters.eventTypes.includes(event.eventType)
    ) {
      return false;
    }

    return true;
  }

  /**
   * Send message to specific client
   */
  private sendToClient(clientId: string, message: any): void {
    const client = this.clients.get(clientId);
    if (client && client.ws.readyState === WebSocket.OPEN) {
      try {
        client.ws.send(JSON.stringify(message));
      } catch (error) {
        AppLogger.error('Error sending message to client', error as Error, {
          clientId,
        });
      }
    }
  }

  /**
   * Send message to specific user (all their connections)
   */
  sendToUser(userId: string, message: any): void {
    let sentCount = 0;
    this.clients.forEach((client, clientId) => {
      if (client.userId === userId) {
        this.sendToClient(clientId, message);
        sentCount++;
      }
    });

    if (sentCount > 0) {
      AppLogger.debug('Message sent to user', { userId, connections: sentCount });
    }
  }

  /**
   * Broadcast message to all connected clients
   */
  broadcast(message: any): void {
    this.clients.forEach((client, clientId) => {
      this.sendToClient(clientId, message);
    });
  }

  /**
   * Start ping interval to check client health
   */
  private startPingInterval(): void {
    this.pingInterval = setInterval(() => {
      const now = new Date();
      this.clients.forEach((client, clientId) => {
        if (client.ws.readyState === WebSocket.OPEN) {
          // Check if client is still alive
          if (
            client.lastPing &&
            now.getTime() - client.lastPing.getTime() > this.PING_TIMEOUT
          ) {
            AppLogger.warn('Client ping timeout, terminating connection', {
              clientId,
            });
            client.ws.terminate();
            this.clients.delete(clientId);
          } else {
            // Send ping
            client.ws.ping();
          }
        } else {
          // Remove dead connections
          this.clients.delete(clientId);
        }
      });
    }, this.PING_INTERVAL);
  }

  /**
   * Stop ping interval
   */
  private stopPingInterval(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  /**
   * Generate unique client ID
   */
  private generateClientId(): string {
    return `client_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Get connected clients count
   */
  getConnectedClientsCount(): number {
    return this.clients.size;
  }

  /**
   * Get connected clients info
   */
  getConnectedClients(): Array<{
    clientId: string;
    userId: string;
    username: string;
    filters?: SecurityEventFilter;
    lastPing?: Date;
  }> {
    const clients: Array<any> = [];
    this.clients.forEach((client, clientId) => {
      clients.push({
        clientId,
        userId: client.userId,
        username: client.username,
        filters: client.filters,
        lastPing: client.lastPing,
      });
    });
    return clients;
  }

  /**
   * Disconnect all clients
   */
  disconnectAll(): void {
    this.clients.forEach((client) => {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.close(1000, 'Server shutting down');
      }
    });
    this.clients.clear();
  }

  /**
   * Disconnect specific user
   */
  disconnectUser(userId: string): void {
    this.clients.forEach((client, clientId) => {
      if (client.userId === userId) {
        if (client.ws.readyState === WebSocket.OPEN) {
          client.ws.close(1000, 'User disconnected by server');
        }
        this.clients.delete(clientId);
      }
    });
  }

  /**
   * Get recent security events
   */
  async getRecentSecurityEvents(
    limit: number = 50,
    filters?: SecurityEventFilter
  ): Promise<SecurityEvent[]> {
    try {
      let query = `
        SELECT
          id,
          event_type,
          severity,
          message,
          details,
          ip_address,
          user_id,
          created_at as timestamp
        FROM security_events
        WHERE 1=1
      `;
      const params: any[] = [];
      let paramCount = 1;

      if (filters?.severity && filters.severity.length > 0) {
        query += ` AND severity = ANY($${paramCount})`;
        params.push(filters.severity);
        paramCount++;
      }

      if (filters?.eventTypes && filters.eventTypes.length > 0) {
        query += ` AND event_type = ANY($${paramCount})`;
        params.push(filters.eventTypes);
        paramCount++;
      }

      if (filters?.userId) {
        query += ` AND user_id = $${paramCount}`;
        params.push(filters.userId);
        paramCount++;
      }

      query += ` ORDER BY created_at DESC LIMIT $${paramCount}`;
      params.push(limit);

      const result = await this.pool.query(query, params);
      return result.rows.map((row) => ({
        id: row.id,
        eventType: row.event_type,
        severity: row.severity,
        message: row.message,
        details: row.details,
        ipAddress: row.ip_address,
        userId: row.user_id,
        timestamp: row.timestamp,
      }));
    } catch (error) {
      AppLogger.error('Error fetching recent security events', error as Error);
      return [];
    }
  }

  /**
   * Shutdown WebSocket server
   */
  shutdown(): void {
    AppLogger.info('Shutting down Security WebSocket service');
    this.stopPingInterval();
    this.disconnectAll();
    if (this.wss) {
      this.wss.close(() => {
        AppLogger.info('Security WebSocket service shut down');
      });
    }
  }
}

// Singleton instance
let securityWebSocketService: SecurityWebSocketService | null = null;

export function initializeSecurityWebSocketService(
  pool: Pool,
  server: HTTPServer
): SecurityWebSocketService {
  if (!securityWebSocketService) {
    securityWebSocketService = new SecurityWebSocketService(pool);
    securityWebSocketService.initialize(server);
  }
  return securityWebSocketService;
}

export function getSecurityWebSocketService(): SecurityWebSocketService {
  if (!securityWebSocketService) {
    throw new Error('SecurityWebSocketService not initialized');
  }
  return securityWebSocketService;
}
