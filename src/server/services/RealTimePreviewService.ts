import { WebSocket, WebSocketServer } from 'ws';
import { EventEmitter } from 'events';
import path from 'path';
import fs from 'fs/promises';
import chokidar from 'chokidar';

interface PreviewSession {
  id: string;
  cloneId: string;
  clients: Set<WebSocket>;
  watcher?: chokidar.FSWatcher;
  lastUpdate: string;
  filePath: string;
}

interface PreviewUpdate {
  type: 'html' | 'css' | 'js' | 'asset' | 'full-reload';
  path?: string;
  content?: string;
  timestamp: number;
}

export class RealTimePreviewService extends EventEmitter {
  private sessions = new Map<string, PreviewSession>();
  private wss?: WebSocketServer;

  constructor() {
    super();
  }

  /**
   * Initialize WebSocket server
   */
  initializeWebSocketServer(wss: WebSocketServer): void {
    this.wss = wss;

    wss.on('connection', (ws: WebSocket, req) => {
      const url = new URL(req.url || '', 'http://localhost');
      const sessionId = url.searchParams.get('session');

      if (sessionId) {
        this.handleClientConnection(sessionId, ws);
      }
    });
  }

  /**
   * Create a new preview session
   */
  async createSession(cloneId: string, filePath: string): Promise<string> {
    const sessionId = `preview_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    const session: PreviewSession = {
      id: sessionId,
      cloneId,
      clients: new Set(),
      filePath,
      lastUpdate: new Date().toISOString(),
    };

    // Set up file watcher for hot reload
    session.watcher = chokidar.watch(filePath, {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 100,
        pollInterval: 50,
      },
    });

    // Watch for file changes
    session.watcher.on('change', async (changedPath) => {
      await this.handleFileChange(sessionId, changedPath);
    });

    session.watcher.on('add', async (addedPath) => {
      await this.handleFileAdd(sessionId, addedPath);
    });

    session.watcher.on('unlink', async (removedPath) => {
      await this.handleFileRemove(sessionId, removedPath);
    });

    this.sessions.set(sessionId, session);

    return sessionId;
  }

  /**
   * Handle client WebSocket connection
   */
  private handleClientConnection(sessionId: string, ws: WebSocket): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      ws.close(1008, 'Session not found');
      return;
    }

    session.clients.add(ws);

    // Send initial connection message
    this.sendToClient(ws, {
      type: 'connected',
      sessionId,
      timestamp: Date.now(),
    });

    // Handle client messages
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        this.handleClientMessage(sessionId, ws, data);
      } catch (error) {
        console.error('Failed to parse client message:', error);
      }
    });

    // Handle client disconnect
    ws.on('close', () => {
      session.clients.delete(ws);

      // Clean up session if no clients
      if (session.clients.size === 0) {
        this.cleanupSession(sessionId);
      }
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      session.clients.delete(ws);
    });
  }

  /**
   * Handle client messages
   */
  private handleClientMessage(sessionId: string, ws: WebSocket, message: any): void {
    switch (message.type) {
      case 'ping':
        this.sendToClient(ws, { type: 'pong', timestamp: Date.now() });
        break;

      case 'request-update':
        this.sendFullUpdate(sessionId, ws);
        break;

      case 'scroll-sync':
        this.broadcastToSession(sessionId, {
          type: 'scroll-position',
          x: message.x,
          y: message.y,
        });
        break;

      case 'interaction':
        this.broadcastToSession(sessionId, {
          type: 'interaction',
          eventType: message.eventType,
          selector: message.selector,
        });
        break;

      default:
        console.log('Unknown message type:', message.type);
    }
  }

  /**
   * Handle file change
   */
  private async handleFileChange(sessionId: string, changedPath: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    try {
      const content = await fs.readFile(changedPath, 'utf-8');
      const ext = path.extname(changedPath).toLowerCase();

      let update: PreviewUpdate;

      if (ext === '.html' || ext === '.htm') {
        update = {
          type: 'html',
          content,
          timestamp: Date.now(),
        };
      } else if (ext === '.css') {
        update = {
          type: 'css',
          path: path.relative(session.filePath, changedPath),
          content,
          timestamp: Date.now(),
        };
      } else if (ext === '.js') {
        update = {
          type: 'js',
          path: path.relative(session.filePath, changedPath),
          content,
          timestamp: Date.now(),
        };
      } else {
        // For other files, trigger full reload
        update = {
          type: 'full-reload',
          timestamp: Date.now(),
        };
      }

      session.lastUpdate = new Date().toISOString();
      this.broadcastToSession(sessionId, update);
    } catch (error) {
      console.error('Failed to handle file change:', error);
    }
  }

  /**
   * Handle file addition
   */
  private async handleFileAdd(sessionId: string, addedPath: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Trigger full reload for new files
    session.lastUpdate = new Date().toISOString();
    this.broadcastToSession(sessionId, {
      type: 'full-reload',
      timestamp: Date.now(),
    });
  }

  /**
   * Handle file removal
   */
  private async handleFileRemove(sessionId: string, removedPath: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Trigger full reload for removed files
    session.lastUpdate = new Date().toISOString();
    this.broadcastToSession(sessionId, {
      type: 'full-reload',
      timestamp: Date.now(),
    });
  }

  /**
   * Send full update to client
   */
  private async sendFullUpdate(sessionId: string, ws: WebSocket): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    try {
      const indexPath = path.join(session.filePath, 'index.html');
      const content = await fs.readFile(indexPath, 'utf-8');

      this.sendToClient(ws, {
        type: 'html',
        content,
        timestamp: Date.now(),
      });
    } catch (error) {
      console.error('Failed to send full update:', error);
    }
  }

  /**
   * Send message to specific client
   */
  private sendToClient(ws: WebSocket, message: any): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * Broadcast message to all clients in session
   */
  private broadcastToSession(sessionId: string, message: any): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const messageStr = JSON.stringify(message);

    session.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(messageStr);
      }
    });
  }

  /**
   * Update preview content manually
   */
  async updatePreview(
    sessionId: string,
    content: string,
    type: 'html' | 'css' | 'js' = 'html'
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');

    const update: PreviewUpdate = {
      type,
      content,
      timestamp: Date.now(),
    };

    session.lastUpdate = new Date().toISOString();
    this.broadcastToSession(sessionId, update);
  }

  /**
   * Inject live reload script into HTML
   */
  injectLiveReloadScript(html: string, sessionId: string): string {
    const protocol = 'ws'; // or 'wss' for secure
    const host = 'localhost:5000'; // Should be configurable

    const script = `
<script>
  (function() {
    const ws = new WebSocket('${protocol}://${host}/ws?session=${sessionId}');

    ws.onopen = function() {
      console.log('[Live Reload] Connected');
    };

    ws.onmessage = function(event) {
      const data = JSON.parse(event.data);

      switch(data.type) {
        case 'connected':
          console.log('[Live Reload] Session established');
          break;

        case 'html':
          console.log('[Live Reload] Reloading page...');
          location.reload();
          break;

        case 'css':
          console.log('[Live Reload] Updating CSS...');
          updateCSS(data.path, data.content);
          break;

        case 'js':
          console.log('[Live Reload] JavaScript changed - reloading...');
          location.reload();
          break;

        case 'full-reload':
          console.log('[Live Reload] Full reload triggered');
          location.reload();
          break;

        case 'scroll-position':
          window.scrollTo(data.x, data.y);
          break;

        case 'interaction':
          // Replay interaction
          const element = document.querySelector(data.selector);
          if (element) {
            element.dispatchEvent(new Event(data.eventType));
          }
          break;
      }
    };

    ws.onclose = function() {
      console.log('[Live Reload] Disconnected - attempting to reconnect...');
      setTimeout(() => location.reload(), 1000);
    };

    ws.onerror = function(error) {
      console.error('[Live Reload] Error:', error);
    };

    function updateCSS(path, content) {
      const link = document.querySelector('link[href*="' + path + '"]');
      if (link) {
        // Update existing link
        const newLink = link.cloneNode();
        newLink.href = link.href.split('?')[0] + '?' + Date.now();
        link.parentNode.replaceChild(newLink, link);
      } else {
        // Create new style tag
        const style = document.createElement('style');
        style.textContent = content;
        document.head.appendChild(style);
      }
    }

    // Send scroll position updates
    let scrollTimeout;
    window.addEventListener('scroll', function() {
      clearTimeout(scrollTimeout);
      scrollTimeout = setTimeout(function() {
        ws.send(JSON.stringify({
          type: 'scroll-sync',
          x: window.scrollX,
          y: window.scrollY
        }));
      }, 100);
    });

    // Keep connection alive
    setInterval(function() {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000);
  })();
</script>
</body>`;

    return html.replace('</body>', script);
  }

  /**
   * Get session information
   */
  getSession(sessionId: string): PreviewSession | null {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * List all active sessions
   */
  listSessions(): Array<{
    id: string;
    cloneId: string;
    clientCount: number;
    lastUpdate: string;
  }> {
    return Array.from(this.sessions.values()).map((session) => ({
      id: session.id,
      cloneId: session.cloneId,
      clientCount: session.clients.size,
      lastUpdate: session.lastUpdate,
    }));
  }

  /**
   * Close a preview session
   */
  async closeSession(sessionId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    // Notify all clients
    this.broadcastToSession(sessionId, {
      type: 'session-closed',
      timestamp: Date.now(),
    });

    await this.cleanupSession(sessionId);
    return true;
  }

  /**
   * Cleanup session resources
   */
  private async cleanupSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Close all client connections
    session.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.close();
      }
    });

    // Stop file watcher
    if (session.watcher) {
      await session.watcher.close();
    }

    this.sessions.delete(sessionId);
  }

  /**
   * Cleanup all sessions
   */
  async cleanup(): Promise<void> {
    const sessionIds = Array.from(this.sessions.keys());

    for (const sessionId of sessionIds) {
      await this.cleanupSession(sessionId);
    }
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalSessions: number;
    totalClients: number;
    sessions: Array<{ id: string; clients: number }>;
  } {
    let totalClients = 0;
    const sessions = Array.from(this.sessions.values()).map((session) => {
      totalClients += session.clients.size;
      return {
        id: session.id,
        clients: session.clients.size,
      };
    });

    return {
      totalSessions: this.sessions.size,
      totalClients,
      sessions,
    };
  }
}
