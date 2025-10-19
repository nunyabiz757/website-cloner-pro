import { Pool } from 'pg';
import { createClient, RedisClientType } from 'redis';
import crypto from 'crypto';
import { Request } from 'express';
import UAParser from 'ua-parser-js';
import { PasswordUtil } from '../utils/password.util.js';

/**
 * Session Service
 * Handles session management, tracking, and concurrent session limits
 */

export interface SessionData {
  id: string;
  user_id: string;
  session_id: string;
  fingerprint: string;
  ip_address?: string;
  user_agent?: string;
  device_info: DeviceInfo;
  last_activity: Date;
  expires_at: Date;
  is_active: boolean;
  created_at: Date;
}

export interface DeviceInfo {
  browser: string;
  browserVersion: string;
  os: string;
  osVersion: string;
  device: string;
  deviceType: string;
}

export interface RememberMeToken {
  id: string;
  user_id: string;
  token_hash: string;
  series: string;
  fingerprint: string;
  ip_address?: string;
  user_agent?: string;
  expires_at: Date;
  last_used?: Date;
  created_at: Date;
}

export class SessionService {
  private pool: Pool;
  private redisClient: RedisClientType;
  private maxSessionsPerUser: number;
  private sessionTimeout: number; // milliseconds
  private rememberMeDuration: number; // milliseconds

  constructor(pool: Pool) {
    this.pool = pool;
    this.maxSessionsPerUser = parseInt(process.env.MAX_SESSIONS_PER_USER || '3');
    this.sessionTimeout = parseInt(process.env.SESSION_MAX_AGE || '1800000'); // 30 minutes
    this.rememberMeDuration = parseInt(process.env.REMEMBER_ME_DURATION || '2592000000'); // 30 days

    // Initialize Redis client
    this.redisClient = createClient({
      url: `redis://:${process.env.REDIS_PASSWORD}@${process.env.REDIS_HOST}:${process.env.REDIS_PORT}/${process.env.REDIS_DB}`,
    }) as RedisClientType;

    this.redisClient.on('error', (err) => console.error('Redis Session Client Error:', err));
    this.redisClient.connect().catch(console.error);
  }

  /**
   * Generate session fingerprint
   * Combines IP address and User-Agent hash for session binding
   */
  generateFingerprint(req: Request): string {
    const ip = req.ip || req.socket.remoteAddress || '';
    const userAgent = req.headers['user-agent'] || '';
    const combined = `${ip}:${userAgent}`;
    return crypto.createHash('sha256').update(combined).digest('hex');
  }

  /**
   * Parse device information from User-Agent
   */
  parseDeviceInfo(userAgent: string): DeviceInfo {
    const parser = new UAParser(userAgent);
    const result = parser.getResult();

    return {
      browser: result.browser.name || 'Unknown',
      browserVersion: result.browser.version || '',
      os: result.os.name || 'Unknown',
      osVersion: result.os.version || '',
      device: result.device.model || 'Unknown',
      deviceType: result.device.type || 'desktop',
    };
  }

  /**
   * Create new session
   */
  async createSession(
    userId: string,
    sessionId: string,
    req: Request
  ): Promise<SessionData> {
    const fingerprint = this.generateFingerprint(req);
    const deviceInfo = this.parseDeviceInfo(req.headers['user-agent'] || '');
    const expiresAt = new Date(Date.now() + this.sessionTimeout);

    // Check concurrent session limit
    await this.enforceConcurrentSessionLimit(userId);

    // Store session in database
    const result = await this.pool.query(
      `INSERT INTO user_sessions (
        user_id, session_id, fingerprint, ip_address, user_agent,
        device_info, last_activity, expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7)
      RETURNING *`,
      [
        userId,
        sessionId,
        fingerprint,
        req.ip,
        req.headers['user-agent'],
        JSON.stringify(deviceInfo),
        expiresAt,
      ]
    );

    const session = result.rows[0];

    // Store session metadata in Redis for quick access
    await this.storeSessionInRedis(sessionId, {
      userId,
      fingerprint,
      lastActivity: Date.now(),
      expiresAt: expiresAt.getTime(),
    });

    return session;
  }

  /**
   * Validate session
   * Checks fingerprint and activity timeout
   */
  async validateSession(sessionId: string, req: Request): Promise<boolean> {
    try {
      // Check Redis first (faster)
      const sessionData = await this.getSessionFromRedis(sessionId);
      if (!sessionData) {
        return false;
      }

      // Validate fingerprint
      const currentFingerprint = this.generateFingerprint(req);
      if (sessionData.fingerprint !== currentFingerprint) {
        console.warn('Session fingerprint mismatch - possible session hijacking', {
          sessionId,
          expected: sessionData.fingerprint,
          actual: currentFingerprint,
        });
        return false;
      }

      // Check if expired
      if (sessionData.expiresAt < Date.now()) {
        await this.destroySession(sessionId);
        return false;
      }

      // Check inactivity timeout
      const inactivityTimeout = Date.now() - sessionData.lastActivity;
      if (inactivityTimeout > this.sessionTimeout) {
        await this.destroySession(sessionId);
        return false;
      }

      // Update last activity
      await this.updateSessionActivity(sessionId);

      return true;
    } catch (error) {
      console.error('Session validation error:', error);
      return false;
    }
  }

  /**
   * Update session activity timestamp
   */
  async updateSessionActivity(sessionId: string): Promise<void> {
    // Update in database
    await this.pool.query(
      'UPDATE user_sessions SET last_activity = NOW() WHERE session_id = $1 AND is_active = TRUE',
      [sessionId]
    );

    // Update in Redis
    const sessionData = await this.getSessionFromRedis(sessionId);
    if (sessionData) {
      sessionData.lastActivity = Date.now();
      await this.storeSessionInRedis(sessionId, sessionData);
    }
  }

  /**
   * Get active sessions for user
   */
  async getUserSessions(userId: string): Promise<SessionData[]> {
    const result = await this.pool.query(
      `SELECT * FROM user_sessions
       WHERE user_id = $1 AND is_active = TRUE
       ORDER BY last_activity DESC`,
      [userId]
    );

    return result.rows;
  }

  /**
   * Enforce concurrent session limit
   * Removes oldest sessions if limit exceeded
   */
  async enforceConcurrentSessionLimit(userId: string): Promise<void> {
    const sessions = await this.getUserSessions(userId);

    if (sessions.length >= this.maxSessionsPerUser) {
      // Sort by last activity and remove oldest
      const sessionsToRemove = sessions
        .sort((a, b) => new Date(a.last_activity).getTime() - new Date(b.last_activity).getTime())
        .slice(0, sessions.length - this.maxSessionsPerUser + 1);

      for (const session of sessionsToRemove) {
        await this.destroySession(session.session_id);
      }
    }
  }

  /**
   * Destroy single session
   */
  async destroySession(sessionId: string): Promise<void> {
    // Mark as inactive in database
    await this.pool.query(
      'UPDATE user_sessions SET is_active = FALSE, ended_at = NOW() WHERE session_id = $1',
      [sessionId]
    );

    // Remove from Redis
    await this.redisClient.del(`session:${sessionId}`);
  }

  /**
   * Logout from all devices
   * Destroys all sessions for a user
   */
  async destroyAllUserSessions(userId: string, exceptSessionId?: string): Promise<number> {
    // Get all active sessions
    const sessions = await this.getUserSessions(userId);

    let count = 0;
    for (const session of sessions) {
      if (session.session_id !== exceptSessionId) {
        await this.destroySession(session.session_id);
        count++;
      }
    }

    return count;
  }

  /**
   * Get session by ID
   */
  async getSession(sessionId: string): Promise<SessionData | null> {
    const result = await this.pool.query(
      'SELECT * FROM user_sessions WHERE session_id = $1 AND is_active = TRUE',
      [sessionId]
    );

    return result.rows[0] || null;
  }

  /**
   * Store session metadata in Redis
   */
  private async storeSessionInRedis(sessionId: string, data: any): Promise<void> {
    const key = `session:${sessionId}`;
    const ttl = Math.floor(this.sessionTimeout / 1000); // Convert to seconds
    await this.redisClient.setEx(key, ttl, JSON.stringify(data));
  }

  /**
   * Get session metadata from Redis
   */
  private async getSessionFromRedis(sessionId: string): Promise<any> {
    const key = `session:${sessionId}`;
    const data = await this.redisClient.get(key);
    return data ? JSON.parse(data) : null;
  }

  /**
   * Create remember me token
   */
  async createRememberMeToken(
    userId: string,
    req: Request
  ): Promise<{ token: string; series: string }> {
    const token = crypto.randomBytes(32).toString('hex');
    const series = crypto.randomBytes(16).toString('hex');
    const tokenHash = PasswordUtil.hashToken(token);
    const fingerprint = this.generateFingerprint(req);
    const expiresAt = new Date(Date.now() + this.rememberMeDuration);

    await this.pool.query(
      `INSERT INTO remember_me_tokens (
        user_id, token_hash, series, fingerprint, ip_address, user_agent, expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, tokenHash, series, fingerprint, req.ip, req.headers['user-agent'], expiresAt]
    );

    return { token, series };
  }

  /**
   * Validate remember me token
   */
  async validateRememberMeToken(
    token: string,
    series: string,
    req: Request
  ): Promise<string | null> {
    const tokenHash = PasswordUtil.hashToken(token);

    const result = await this.pool.query(
      `SELECT * FROM remember_me_tokens
       WHERE token_hash = $1 AND series = $2 AND expires_at > NOW()`,
      [tokenHash, series]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const rememberToken = result.rows[0];

    // Validate fingerprint
    const currentFingerprint = this.generateFingerprint(req);
    if (rememberToken.fingerprint !== currentFingerprint) {
      console.warn('Remember me token fingerprint mismatch', {
        series,
        expected: rememberToken.fingerprint,
        actual: currentFingerprint,
      });
      // Delete all remember me tokens for this user (security measure)
      await this.pool.query('DELETE FROM remember_me_tokens WHERE user_id = $1', [
        rememberToken.user_id,
      ]);
      return null;
    }

    // Update last used
    await this.pool.query(
      'UPDATE remember_me_tokens SET last_used = NOW() WHERE id = $1',
      [rememberToken.id]
    );

    // Rotate token (generate new token, delete old)
    await this.rotateRememberMeToken(rememberToken.id, rememberToken.user_id, req);

    return rememberToken.user_id;
  }

  /**
   * Rotate remember me token
   * Creates new token and deletes old one
   */
  private async rotateRememberMeToken(
    oldTokenId: string,
    userId: string,
    req: Request
  ): Promise<void> {
    // Delete old token
    await this.pool.query('DELETE FROM remember_me_tokens WHERE id = $1', [oldTokenId]);

    // Create new token
    await this.createRememberMeToken(userId, req);
  }

  /**
   * Delete remember me token
   */
  async deleteRememberMeToken(token: string, series: string): Promise<void> {
    const tokenHash = PasswordUtil.hashToken(token);
    await this.pool.query(
      'DELETE FROM remember_me_tokens WHERE token_hash = $1 AND series = $2',
      [tokenHash, series]
    );
  }

  /**
   * Delete all remember me tokens for user
   */
  async deleteAllRememberMeTokens(userId: string): Promise<void> {
    await this.pool.query('DELETE FROM remember_me_tokens WHERE user_id = $1', [userId]);
  }

  /**
   * Cleanup expired sessions
   * Should be called by cron job
   */
  async cleanupExpiredSessions(): Promise<{ sessions: number; tokens: number }> {
    const result = await this.pool.query('SELECT cleanup_expired_sessions()');
    const sessionsCount = result.rows[0].cleanup_expired_sessions;

    // Cleanup expired remember me tokens
    const tokensResult = await this.pool.query(
      'DELETE FROM remember_me_tokens WHERE expires_at < NOW()'
    );

    return {
      sessions: sessionsCount,
      tokens: tokensResult.rowCount || 0,
    };
  }

  /**
   * Get session statistics
   */
  async getSessionStatistics(userId: string): Promise<{
    active: number;
    total: number;
    devices: number;
    oldestSession: Date | null;
    newestSession: Date | null;
  }> {
    const result = await this.pool.query(
      `SELECT
        COUNT(*) FILTER (WHERE is_active = TRUE) as active_sessions,
        COUNT(*) as total_sessions,
        COUNT(DISTINCT device_info->>'device') as unique_devices,
        MIN(created_at) FILTER (WHERE is_active = TRUE) as oldest_session,
        MAX(created_at) FILTER (WHERE is_active = TRUE) as newest_session
       FROM user_sessions
       WHERE user_id = $1`,
      [userId]
    );

    const stats = result.rows[0];

    return {
      active: parseInt(stats.active_sessions || '0'),
      total: parseInt(stats.total_sessions || '0'),
      devices: parseInt(stats.unique_devices || '0'),
      oldestSession: stats.oldest_session,
      newestSession: stats.newest_session,
    };
  }

  /**
   * Close Redis connection (for graceful shutdown)
   */
  async close(): Promise<void> {
    await this.redisClient.quit();
  }
}

export default SessionService;
