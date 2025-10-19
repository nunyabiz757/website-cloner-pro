import { Pool } from 'pg';
import crypto from 'crypto';
import { AppLogger } from './logger.service.js';

/**
 * File Access Service
 * Manages file access tokens and logs file access attempts
 */

export interface FileAccessToken {
  id: string;
  tokenHash: string;
  filePath: string;
  userId?: string;
  allowedIpAddress?: string;
  maxDownloads?: number;
  downloadCount: number;
  expiresAt: Date;
  contentType?: string;
  contentDisposition?: string;
  customFilename?: string;
  isRevoked: boolean;
  createdAt: Date;
  lastAccessed?: Date;
}

export interface CreateTokenData {
  token: string;
  filePath: string;
  userId?: string;
  expiresAt: Date;
  maxDownloads?: number;
  allowedIpAddress?: string;
  contentType?: string;
  contentDisposition?: string;
  customFilename?: string;
}

export interface LogAccessData {
  filePath: string;
  fileSize?: number;
  contentType?: string;
  tokenId?: string;
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
  method: string;
  statusCode: number;
  bytesSent?: number;
  durationMs: number;
  accessGranted: boolean;
  denialReason?: string;
}

export interface FileAccessLog {
  id: string;
  filePath: string;
  fileSize?: number;
  contentType?: string;
  userId?: string;
  ipAddress?: string;
  userAgent?: string;
  method: string;
  statusCode: number;
  bytesSent?: number;
  durationMs: number;
  accessGranted: boolean;
  denialReason?: string;
  accessedAt: Date;
}

export interface FileAccessStats {
  totalAccesses: number;
  uniqueFiles: number;
  uniqueUsers: number;
  uniqueIps: number;
  deniedAccesses: number;
  totalBytesSent: number;
  averageDuration: number;
  accessesByStatus: Record<number, number>;
  topFiles: Array<{ filePath: string; accessCount: number }>;
}

export class FileAccessService {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Create a new file access token
   */
  async createToken(data: CreateTokenData): Promise<string> {
    try {
      const tokenHash = this.hashToken(data.token);

      const result = await this.pool.query(
        `INSERT INTO file_access_tokens (
          token_hash, file_path, user_id, expires_at,
          max_downloads, allowed_ip_address,
          content_type, content_disposition, custom_filename,
          created_by
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id`,
        [
          tokenHash,
          data.filePath,
          data.userId || null,
          data.expiresAt,
          data.maxDownloads || null,
          data.allowedIpAddress || null,
          data.contentType || null,
          data.contentDisposition || null,
          data.customFilename || null,
          data.userId || null,
        ]
      );

      const tokenId = result.rows[0].id;

      AppLogger.info('File access token created', {
        tokenId,
        filePath: data.filePath,
        userId: data.userId,
        expiresAt: data.expiresAt,
        maxDownloads: data.maxDownloads,
      });

      return tokenId;
    } catch (error) {
      AppLogger.error('Failed to create file access token', error as Error, {
        filePath: data.filePath,
      });
      throw error;
    }
  }

  /**
   * Get token by token string
   */
  async getToken(token: string): Promise<FileAccessToken | null> {
    try {
      const tokenHash = this.hashToken(token);

      const result = await this.pool.query(
        `SELECT * FROM file_access_tokens WHERE token_hash = $1`,
        [tokenHash]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapToToken(result.rows[0]);
    } catch (error) {
      AppLogger.error('Failed to get file access token', error as Error);
      throw error;
    }
  }

  /**
   * Check if token has remaining downloads
   */
  async checkDownloadLimit(token: string): Promise<boolean> {
    try {
      const tokenHash = this.hashToken(token);

      const result = await this.pool.query(
        'SELECT check_token_download_limit($1) as can_download',
        [tokenHash]
      );

      return result.rows[0].can_download;
    } catch (error) {
      AppLogger.error('Failed to check download limit', error as Error);
      return false;
    }
  }

  /**
   * Increment download count for token
   */
  async incrementDownloadCount(token: string): Promise<void> {
    try {
      const tokenHash = this.hashToken(token);

      await this.pool.query(
        'SELECT increment_token_download_count($1)',
        [tokenHash]
      );

      AppLogger.debug('Download count incremented', {
        tokenHash: tokenHash.substring(0, 16) + '...',
      });
    } catch (error) {
      AppLogger.error('Failed to increment download count', error as Error);
      throw error;
    }
  }

  /**
   * Revoke a file access token
   */
  async revokeToken(
    token: string,
    revokedBy: string,
    reason?: string
  ): Promise<void> {
    try {
      const tokenHash = this.hashToken(token);

      await this.pool.query(
        'SELECT revoke_file_token($1, $2, $3)',
        [tokenHash, revokedBy, reason || null]
      );

      AppLogger.info('File access token revoked', {
        revokedBy,
        reason,
      });
    } catch (error) {
      AppLogger.error('Failed to revoke file access token', error as Error);
      throw error;
    }
  }

  /**
   * Log file access attempt
   */
  async logAccess(data: LogAccessData): Promise<string> {
    try {
      // Get token ID if token hash is provided
      let tokenId: string | null = null;

      if (data.tokenId) {
        const tokenResult = await this.pool.query(
          'SELECT id FROM file_access_tokens WHERE token_hash = $1',
          [data.tokenId]
        );

        if (tokenResult.rows.length > 0) {
          tokenId = tokenResult.rows[0].id;
        }
      }

      const result = await this.pool.query(
        `INSERT INTO file_access_logs (
          file_path, file_size, content_type, token_id, user_id,
          ip_address, user_agent, method, status_code,
          bytes_sent, duration_ms, access_granted, denial_reason
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING id`,
        [
          data.filePath,
          data.fileSize || null,
          data.contentType || null,
          tokenId,
          data.userId || null,
          data.ipAddress || null,
          data.userAgent || null,
          data.method,
          data.statusCode,
          data.bytesSent || null,
          data.durationMs,
          data.accessGranted,
          data.denialReason || null,
        ]
      );

      const logId = result.rows[0].id;

      // Log security event if access denied
      if (!data.accessGranted) {
        AppLogger.logSecurityEvent('file_access.denied', 'medium', {
          logId,
          filePath: data.filePath,
          reason: data.denialReason,
          ipAddress: data.ipAddress,
          statusCode: data.statusCode,
        });
      }

      return logId;
    } catch (error) {
      AppLogger.error('Failed to log file access', error as Error, {
        filePath: data.filePath,
      });
      throw error;
    }
  }

  /**
   * Get access logs with optional filtering
   */
  async getAccessLogs(
    limit: number = 100,
    filePath?: string
  ): Promise<FileAccessLog[]> {
    try {
      let query = `
        SELECT * FROM file_access_logs
        ${filePath ? 'WHERE file_path = $1' : ''}
        ORDER BY accessed_at DESC
        LIMIT ${filePath ? '$2' : '$1'}
      `;

      const params = filePath ? [filePath, limit] : [limit];

      const result = await this.pool.query(query, params);

      return result.rows.map((row) => this.mapToLog(row));
    } catch (error) {
      AppLogger.error('Failed to get access logs', error as Error);
      throw error;
    }
  }

  /**
   * Get file access statistics
   */
  async getStatistics(days: number = 7): Promise<FileAccessStats> {
    try {
      // Get overall stats
      const statsResult = await this.pool.query(
        `SELECT
          COUNT(*)::INTEGER as total_accesses,
          COUNT(DISTINCT file_path)::INTEGER as unique_files,
          COUNT(DISTINCT user_id)::INTEGER as unique_users,
          COUNT(DISTINCT ip_address)::INTEGER as unique_ips,
          COUNT(*) FILTER (WHERE access_granted = FALSE)::INTEGER as denied_accesses,
          COALESCE(SUM(bytes_sent), 0)::BIGINT as total_bytes_sent,
          COALESCE(AVG(duration_ms), 0)::INTEGER as average_duration
        FROM file_access_logs
        WHERE accessed_at >= NOW() - INTERVAL '${days} days'`
      );

      const stats = statsResult.rows[0];

      // Get accesses by status code
      const statusResult = await this.pool.query(
        `SELECT status_code, COUNT(*)::INTEGER as count
         FROM file_access_logs
         WHERE accessed_at >= NOW() - INTERVAL '${days} days'
         GROUP BY status_code`
      );

      const accessesByStatus: Record<number, number> = {};
      for (const row of statusResult.rows) {
        accessesByStatus[row.status_code] = row.count;
      }

      // Get top accessed files
      const topFilesResult = await this.pool.query(
        `SELECT file_path, COUNT(*)::INTEGER as access_count
         FROM file_access_logs
         WHERE accessed_at >= NOW() - INTERVAL '${days} days'
         AND access_granted = TRUE
         GROUP BY file_path
         ORDER BY access_count DESC
         LIMIT 10`
      );

      const topFiles = topFilesResult.rows.map((row) => ({
        filePath: row.file_path,
        accessCount: row.access_count,
      }));

      return {
        totalAccesses: stats.total_accesses || 0,
        uniqueFiles: stats.unique_files || 0,
        uniqueUsers: stats.unique_users || 0,
        uniqueIps: stats.unique_ips || 0,
        deniedAccesses: stats.denied_accesses || 0,
        totalBytesSent: parseInt(stats.total_bytes_sent) || 0,
        averageDuration: stats.average_duration || 0,
        accessesByStatus,
        topFiles,
      };
    } catch (error) {
      AppLogger.error('Failed to get file access statistics', error as Error);
      throw error;
    }
  }

  /**
   * Get active tokens for a user
   */
  async getUserTokens(userId: string): Promise<FileAccessToken[]> {
    try {
      const result = await this.pool.query(
        `SELECT * FROM file_access_tokens
         WHERE user_id = $1
         AND is_revoked = FALSE
         AND expires_at > NOW()
         ORDER BY created_at DESC`,
        [userId]
      );

      return result.rows.map((row) => this.mapToToken(row));
    } catch (error) {
      AppLogger.error('Failed to get user tokens', error as Error, { userId });
      throw error;
    }
  }

  /**
   * Get tokens for a specific file
   */
  async getFileTokens(filePath: string): Promise<FileAccessToken[]> {
    try {
      const result = await this.pool.query(
        `SELECT * FROM file_access_tokens
         WHERE file_path = $1
         AND is_revoked = FALSE
         AND expires_at > NOW()
         ORDER BY created_at DESC`,
        [filePath]
      );

      return result.rows.map((row) => this.mapToToken(row));
    } catch (error) {
      AppLogger.error('Failed to get file tokens', error as Error, { filePath });
      throw error;
    }
  }

  /**
   * Cleanup expired tokens
   */
  async cleanupExpiredTokens(retentionDays: number = 30): Promise<number> {
    try {
      const result = await this.pool.query(
        'SELECT cleanup_expired_file_tokens($1)',
        [retentionDays]
      );

      const deletedCount = result.rows[0].cleanup_expired_file_tokens;

      AppLogger.info('Expired file tokens cleaned up', {
        deletedCount,
        retentionDays,
      });

      return deletedCount;
    } catch (error) {
      AppLogger.error('Failed to cleanup expired tokens', error as Error);
      throw error;
    }
  }

  /**
   * Cleanup old access logs
   */
  async cleanupOldLogs(retentionDays: number = 90): Promise<number> {
    try {
      const result = await this.pool.query(
        'SELECT cleanup_old_file_access_logs($1)',
        [retentionDays]
      );

      const deletedCount = result.rows[0].cleanup_old_file_access_logs;

      AppLogger.info('Old file access logs cleaned up', {
        deletedCount,
        retentionDays,
      });

      return deletedCount;
    } catch (error) {
      AppLogger.error('Failed to cleanup old access logs', error as Error);
      throw error;
    }
  }

  /**
   * Get suspicious access patterns
   */
  async getSuspiciousAccess(): Promise<
    Array<{
      filePath: string;
      ipAddress: string;
      accessAttempts: number;
      deniedAttempts: number;
      lastAttempt: Date;
      denialReasons: string[];
    }>
  > {
    try {
      const result = await this.pool.query(
        'SELECT * FROM suspicious_file_access'
      );

      return result.rows.map((row) => ({
        filePath: row.file_path,
        ipAddress: row.ip_address,
        accessAttempts: row.access_attempts,
        deniedAttempts: row.denied_attempts,
        lastAttempt: row.last_attempt,
        denialReasons: row.denial_reasons || [],
      }));
    } catch (error) {
      AppLogger.error('Failed to get suspicious access patterns', error as Error);
      throw error;
    }
  }

  /**
   * Hash token for storage
   */
  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Map database row to FileAccessToken
   */
  private mapToToken(row: any): FileAccessToken {
    return {
      id: row.id,
      tokenHash: row.token_hash,
      filePath: row.file_path,
      userId: row.user_id,
      allowedIpAddress: row.allowed_ip_address,
      maxDownloads: row.max_downloads,
      downloadCount: row.download_count,
      expiresAt: row.expires_at,
      contentType: row.content_type,
      contentDisposition: row.content_disposition,
      customFilename: row.custom_filename,
      isRevoked: row.is_revoked,
      createdAt: row.created_at,
      lastAccessed: row.last_accessed,
    };
  }

  /**
   * Map database row to FileAccessLog
   */
  private mapToLog(row: any): FileAccessLog {
    return {
      id: row.id,
      filePath: row.file_path,
      fileSize: row.file_size,
      contentType: row.content_type,
      userId: row.user_id,
      ipAddress: row.ip_address,
      userAgent: row.user_agent,
      method: row.method,
      statusCode: row.status_code,
      bytesSent: row.bytes_sent,
      durationMs: row.duration_ms,
      accessGranted: row.access_granted,
      denialReason: row.denial_reason,
      accessedAt: row.accessed_at,
    };
  }
}

/**
 * Singleton instance
 */
let fileAccessService: FileAccessService | null = null;

export function initializeFileAccessService(pool: Pool): FileAccessService {
  fileAccessService = new FileAccessService(pool);
  return fileAccessService;
}

export function getFileAccessService(): FileAccessService {
  if (!fileAccessService) {
    throw new Error(
      'FileAccessService not initialized. Call initializeFileAccessService first.'
    );
  }
  return fileAccessService;
}
