import { Pool } from 'pg';
import { AppLogger } from '../utils/logger.util.js';
import { nanoid } from 'nanoid';

/**
 * GHL Paste Service
 *
 * Manages the paste workflow for inserting copied GHL pages into GHL builder:
 * - Creates browser extension sessions with tokens
 * - Validates session tokens
 * - Prepares page data for insertion
 * - Tracks paste operations and status
 * - Updates clone status (copied → pasted)
 *
 * Features:
 * - Session-based security with expiring tokens
 * - Browser fingerprinting for validation
 * - Paste status tracking
 * - Error logging and recovery
 * - Automatic session cleanup
 */

export interface CreateSessionParams {
  userId: string;
  clonedPageId: string;
  browserInfo?: {
    userAgent?: string;
    platform?: string;
    language?: string;
  };
  extensionVersion?: string;
}

export interface PasteSession {
  id: string;
  userId: string;
  sessionToken: string;
  clonedPageId: string;
  status: 'active' | 'completed' | 'expired' | 'failed';
  expiresAt: Date;
  browserInfo?: any;
  extensionVersion?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PasteData {
  clonedPageId: string;
  sourceUrl: string;
  sourceTitle?: string;
  customCss: string[];
  customJs: string[];
  trackingCodes: string[];
  forms: any[];
  assets: {
    images: string[];
    videos: string[];
    fonts: string[];
    stylesheets: string[];
    scripts: string[];
  };
  ghlData: {
    pageId?: string;
    funnelId?: string;
    accountId?: string;
    version?: string;
    [key: string]: any;
  };
  metadata: {
    elementsCount: number;
    imagesCount: number;
    hasCustomCss: boolean;
    copiedAt: Date;
  };
}

export interface CompletePasteParams {
  sessionToken: string;
  destinationUrl: string;
  destinationAccountId?: string;
  destinationFunnelId?: string;
  destinationPageId?: string;
  status: 'success' | 'partial' | 'failed';
  errors?: any[];
  warnings?: any[];
  elementsCount?: number;
}

export class GHLPasteService {
  private pool: Pool;
  private logger: AppLogger;
  private readonly SESSION_EXPIRY_HOURS = 2; // 2 hours to complete paste

  constructor(pool: Pool) {
    this.pool = pool;
    this.logger = AppLogger.getInstance();
  }

  /**
   * Create a new paste session
   * Returns session token for browser extension to use
   */
  async createSession(params: CreateSessionParams): Promise<PasteSession> {
    try {
      const { userId, clonedPageId, browserInfo, extensionVersion } = params;

      // Verify cloned page exists and belongs to user
      const pageResult = await this.pool.query(
        `SELECT id, clone_status FROM ghl_cloned_pages WHERE id = $1 AND user_id = $2`,
        [clonedPageId, userId]
      );

      if (pageResult.rows.length === 0) {
        throw new Error('Cloned page not found or does not belong to user');
      }

      const pageStatus = pageResult.rows[0].clone_status;
      if (pageStatus === 'pasted') {
        throw new Error('This page has already been pasted');
      }

      // Generate session token
      const sessionToken = nanoid(32);

      // Calculate expiry time
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + this.SESSION_EXPIRY_HOURS);

      // Create session
      const result = await this.pool.query(
        `INSERT INTO ghl_clone_sessions (
          user_id,
          session_token,
          cloned_page_id,
          status,
          expires_at,
          browser_info,
          extension_version,
          created_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING *`,
        [
          userId,
          sessionToken,
          clonedPageId,
          'active',
          expiresAt,
          browserInfo ? JSON.stringify(browserInfo) : null,
          extensionVersion,
        ]
      );

      const session = this.mapSessionRow(result.rows[0]);

      this.logger.info('Paste session created', {
        component: 'GHLPasteService',
        userId,
        sessionId: session.id,
        clonedPageId,
        expiresAt,
      });

      return session;
    } catch (error) {
      this.logger.error('Failed to create paste session', {
        component: 'GHLPasteService',
        params,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Validate session token and get session data
   */
  async validateSession(sessionToken: string): Promise<PasteSession | null> {
    try {
      const result = await this.pool.query(
        `SELECT * FROM ghl_clone_sessions WHERE session_token = $1`,
        [sessionToken]
      );

      if (result.rows.length === 0) {
        this.logger.warn('Session token not found', {
          component: 'GHLPasteService',
          sessionToken: sessionToken.substring(0, 8) + '...',
        });
        return null;
      }

      const session = this.mapSessionRow(result.rows[0]);

      // Check if expired
      if (new Date() > session.expiresAt) {
        this.logger.warn('Session expired', {
          component: 'GHLPasteService',
          sessionId: session.id,
          expiresAt: session.expiresAt,
        });

        // Update status to expired
        await this.pool.query(
          `UPDATE ghl_clone_sessions SET status = 'expired', updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
          [session.id]
        );

        return null;
      }

      // Check if already completed or failed
      if (session.status === 'completed' || session.status === 'failed') {
        this.logger.warn('Session already completed or failed', {
          component: 'GHLPasteService',
          sessionId: session.id,
          status: session.status,
        });
        return null;
      }

      return session;
    } catch (error) {
      this.logger.error('Failed to validate session', {
        component: 'GHLPasteService',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get paste data for a session
   * Returns all the data needed to paste into GHL
   */
  async getPasteData(sessionToken: string): Promise<PasteData | null> {
    try {
      const session = await this.validateSession(sessionToken);
      if (!session) {
        return null;
      }

      // Get cloned page data
      const result = await this.pool.query(
        `SELECT
          id,
          source_url,
          source_title,
          custom_css,
          custom_js,
          tracking_codes,
          forms,
          assets,
          ghl_data,
          elements_count,
          images_count,
          has_custom_css,
          created_at
        FROM ghl_cloned_pages
        WHERE id = $1`,
        [session.clonedPageId]
      );

      if (result.rows.length === 0) {
        throw new Error('Cloned page not found');
      }

      const page = result.rows[0];

      const pasteData: PasteData = {
        clonedPageId: page.id,
        sourceUrl: page.source_url,
        sourceTitle: page.source_title,
        customCss: page.custom_css || [],
        customJs: page.custom_js || [],
        trackingCodes: page.tracking_codes || [],
        forms: page.forms || [],
        assets: page.assets || {
          images: [],
          videos: [],
          fonts: [],
          stylesheets: [],
          scripts: [],
        },
        ghlData: page.ghl_data || {},
        metadata: {
          elementsCount: page.elements_count || 0,
          imagesCount: page.images_count || 0,
          hasCustomCss: page.has_custom_css || false,
          copiedAt: page.created_at,
        },
      };

      this.logger.info('Paste data retrieved', {
        component: 'GHLPasteService',
        sessionId: session.id,
        clonedPageId: session.clonedPageId,
      });

      return pasteData;
    } catch (error) {
      this.logger.error('Failed to get paste data', {
        component: 'GHLPasteService',
        sessionToken: sessionToken.substring(0, 8) + '...',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Complete a paste operation
   * Updates session and cloned page status
   */
  async completePaste(params: CompletePasteParams): Promise<void> {
    try {
      const {
        sessionToken,
        destinationUrl,
        destinationAccountId,
        destinationFunnelId,
        destinationPageId,
        status,
        errors,
        warnings,
        elementsCount,
      } = params;

      // Validate session
      const session = await this.validateSession(sessionToken);
      if (!session) {
        throw new Error('Invalid or expired session');
      }

      // Determine clone status based on paste result
      const cloneStatus = status === 'success' ? 'pasted' : status === 'partial' ? 'partial' : 'failed';

      // Update cloned page
      await this.pool.query(
        `UPDATE ghl_cloned_pages
        SET
          destination_url = $2,
          destination_account_id = $3,
          destination_funnel_id = $4,
          clone_status = $5,
          elements_count = COALESCE($6, elements_count),
          errors = $7,
          warnings = $8,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $1`,
        [
          session.clonedPageId,
          destinationUrl,
          destinationAccountId,
          destinationFunnelId,
          cloneStatus,
          elementsCount,
          errors ? JSON.stringify(errors) : null,
          warnings ? JSON.stringify(warnings) : null,
        ]
      );

      // Update session
      const sessionStatus = status === 'failed' ? 'failed' : 'completed';
      await this.pool.query(
        `UPDATE ghl_clone_sessions
        SET
          status = $2,
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $1`,
        [session.id, sessionStatus]
      );

      this.logger.info('Paste operation completed', {
        component: 'GHLPasteService',
        sessionId: session.id,
        clonedPageId: session.clonedPageId,
        status,
        destinationUrl,
      });
    } catch (error) {
      this.logger.error('Failed to complete paste', {
        component: 'GHLPasteService',
        params,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Cancel a paste session
   */
  async cancelSession(sessionToken: string): Promise<void> {
    try {
      const result = await this.pool.query(
        `UPDATE ghl_clone_sessions
        SET status = 'expired', updated_at = CURRENT_TIMESTAMP
        WHERE session_token = $1 AND status = 'active'
        RETURNING id`,
        [sessionToken]
      );

      if (result.rows.length > 0) {
        this.logger.info('Paste session canceled', {
          component: 'GHLPasteService',
          sessionId: result.rows[0].id,
        });
      }
    } catch (error) {
      this.logger.error('Failed to cancel session', {
        component: 'GHLPasteService',
        sessionToken: sessionToken.substring(0, 8) + '...',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get active sessions for user
   */
  async getUserSessions(userId: string, includeExpired: boolean = false): Promise<PasteSession[]> {
    try {
      let query = `
        SELECT * FROM ghl_clone_sessions
        WHERE user_id = $1
      `;

      if (!includeExpired) {
        query += ` AND status = 'active' AND expires_at > CURRENT_TIMESTAMP`;
      }

      query += ` ORDER BY created_at DESC`;

      const result = await this.pool.query(query, [userId]);
      return result.rows.map((row) => this.mapSessionRow(row));
    } catch (error) {
      this.logger.error('Failed to get user sessions', {
        component: 'GHLPasteService',
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Cleanup expired sessions (called by cron job)
   */
  async cleanupExpiredSessions(): Promise<number> {
    try {
      const result = await this.pool.query(
        `UPDATE ghl_clone_sessions
        SET status = 'expired', updated_at = CURRENT_TIMESTAMP
        WHERE status = 'active' AND expires_at < CURRENT_TIMESTAMP
        RETURNING id`
      );

      const count = result.rows.length;

      if (count > 0) {
        this.logger.info('Cleaned up expired sessions', {
          component: 'GHLPasteService',
          count,
        });
      }

      return count;
    } catch (error) {
      this.logger.error('Failed to cleanup expired sessions', {
        component: 'GHLPasteService',
        error: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }
  }

  /**
   * Map database row to PasteSession object
   */
  private mapSessionRow(row: any): PasteSession {
    return {
      id: row.id,
      userId: row.user_id,
      sessionToken: row.session_token,
      clonedPageId: row.cloned_page_id,
      status: row.status,
      expiresAt: new Date(row.expires_at),
      browserInfo: row.browser_info,
      extensionVersion: row.extension_version,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  /**
   * Get session statistics
   */
  async getSessionStats(userId?: string): Promise<any> {
    try {
      let query = `
        SELECT
          COUNT(*) as total_sessions,
          COUNT(*) FILTER (WHERE status = 'active') as active_sessions,
          COUNT(*) FILTER (WHERE status = 'completed') as completed_sessions,
          COUNT(*) FILTER (WHERE status = 'expired') as expired_sessions,
          COUNT(*) FILTER (WHERE status = 'failed') as failed_sessions,
          AVG(EXTRACT(EPOCH FROM (updated_at - created_at))) FILTER (WHERE status = 'completed') as avg_completion_time_seconds
        FROM ghl_clone_sessions
      `;

      const params: any[] = [];
      if (userId) {
        query += ` WHERE user_id = $1`;
        params.push(userId);
      }

      const result = await this.pool.query(query, params);
      return result.rows[0];
    } catch (error) {
      this.logger.error('Failed to get session stats', {
        component: 'GHLPasteService',
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}

export default GHLPasteService;
