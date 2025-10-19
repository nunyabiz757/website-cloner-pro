import { Pool } from 'pg';
import { Request } from 'express';
import { createObjectCsvStringifier } from 'csv-writer';
import { Parser } from 'json2csv';

/**
 * Enhanced Security Audit Service
 * Extends base audit service with advanced search, filtering, and export capabilities
 */

export interface AdvancedAuditFilters {
  searchQuery?: string;
  userId?: string;
  action?: string;
  resourceType?: string;
  resourceId?: string;
  status?: string;
  ipAddress?: string;
  startDate?: Date;
  endDate?: Date;
  detailsFilter?: Record<string, any>;
  limit?: number;
  offset?: number;
  orderBy?: 'timestamp' | 'action' | 'status' | 'user_id';
  orderDirection?: 'ASC' | 'DESC';
}

export interface AuditLogExport {
  id: string;
  exportName: string;
  exportFormat: 'csv' | 'json' | 'pdf';
  filters: AdvancedAuditFilters;
  totalRecords: number;
  filePath?: string;
  fileSize?: number;
  createdBy: string;
  createdAt: Date;
  expiresAt?: Date;
  downloadCount: number;
}

export interface SavedSearch {
  id: string;
  searchName: string;
  searchFilters: AdvancedAuditFilters;
  isPublic: boolean;
  createdBy: string;
  createdAt: Date;
  lastUsedAt?: Date;
  useCount: number;
}

export interface AuditBookmark {
  id: string;
  auditLogId: string;
  userId: string;
  notes?: string;
  createdAt: Date;
}

export interface AuditLogWithUser {
  id: string;
  userId?: string;
  username?: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  status?: string;
  ipAddress?: string;
  userAgent?: string;
  details?: Record<string, any>;
  metadata?: Record<string, any>;
  timestamp: Date;
  relevanceScore?: number;
}

export interface AuditStatistics {
  totalLogs: number;
  uniqueUsers: number;
  uniqueActions: number;
  successCount: number;
  failureCount: number;
  warningCount: number;
  mostCommonAction?: string;
  mostActiveUser?: string;
  mostActiveIp?: string;
  logsByHour: Record<string, number>;
  logsByDay: Record<string, number>;
  logsByAction: Record<string, number>;
  logsByStatus: Record<string, number>;
}

export interface SuspiciousActivity {
  patternType: string;
  userId?: string;
  username?: string;
  ipAddress?: string;
  activityCount: number;
  firstSeen: Date;
  lastSeen: Date;
  sampleActions: string[];
}

export class EnhancedAuditService {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Advanced search with full-text and multi-filter support
   */
  async advancedSearch(filters: AdvancedAuditFilters): Promise<{
    logs: AuditLogWithUser[];
    total: number;
  }> {
    try {
      const limit = filters.limit || 100;
      const offset = filters.offset || 0;
      const orderBy = filters.orderBy || 'timestamp';
      const orderDirection = filters.orderDirection || 'DESC';

      // Use the search_audit_logs function
      const result = await this.pool.query<AuditLogWithUser>(
        `SELECT * FROM search_audit_logs($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          filters.searchQuery || null,
          filters.userId || null,
          filters.action || null,
          filters.resourceType || null,
          filters.resourceId || null,
          filters.status || null,
          filters.ipAddress || null,
          filters.startDate || null,
          filters.endDate || null,
          filters.detailsFilter ? JSON.stringify(filters.detailsFilter) : null,
          limit,
          offset,
          orderBy,
          orderDirection,
        ]
      );

      // Get total count
      const countResult = await this.pool.query<{ count: number }>(
        `SELECT COUNT(*) as count FROM audit_logs al
         WHERE ($1::text IS NULL OR (
           al.action ILIKE '%' || $1 || '%' OR
           al.details::text ILIKE '%' || $1 || '%'
         ))
         AND ($2::uuid IS NULL OR al.user_id = $2)
         AND ($3::text IS NULL OR al.action = $3)
         AND ($4::text IS NULL OR al.resource_type = $4)
         AND ($5::uuid IS NULL OR al.resource_id = $5)
         AND ($6::text IS NULL OR al.status = $6)
         AND ($7::varchar IS NULL OR al.ip_address = $7)
         AND ($8::timestamp IS NULL OR al.timestamp >= $8)
         AND ($9::timestamp IS NULL OR al.timestamp <= $9)`,
        [
          filters.searchQuery || null,
          filters.userId || null,
          filters.action || null,
          filters.resourceType || null,
          filters.resourceId || null,
          filters.status || null,
          filters.ipAddress || null,
          filters.startDate || null,
          filters.endDate || null,
        ]
      );

      return {
        logs: result.rows,
        total: parseInt(String(countResult.rows[0].count)),
      };
    } catch (error) {
      throw new Error(`Advanced search failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get comprehensive audit log statistics
   */
  async getStatistics(startDate?: Date, endDate?: Date): Promise<AuditStatistics> {
    try {
      const result = await this.pool.query(
        'SELECT * FROM get_audit_log_statistics($1, $2)',
        [startDate || null, endDate || null]
      );

      if (result.rows.length === 0) {
        throw new Error('No statistics available');
      }

      const row = result.rows[0];
      return {
        totalLogs: parseInt(row.total_logs),
        uniqueUsers: parseInt(row.unique_users),
        uniqueActions: parseInt(row.unique_actions),
        successCount: parseInt(row.success_count),
        failureCount: parseInt(row.failure_count),
        warningCount: parseInt(row.warning_count),
        mostCommonAction: row.most_common_action,
        mostActiveUser: row.most_active_user,
        mostActiveIp: row.most_active_ip,
        logsByHour: row.logs_by_hour || {},
        logsByDay: row.logs_by_day || {},
        logsByAction: row.logs_by_action || {},
        logsByStatus: row.logs_by_status || {},
      };
    } catch (error) {
      throw new Error(`Failed to get statistics: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get user activity timeline
   */
  async getUserTimeline(userId: string, limit: number = 100): Promise<any[]> {
    try {
      const result = await this.pool.query(
        'SELECT * FROM get_user_audit_timeline($1, $2)',
        [userId, limit]
      );

      return result.rows;
    } catch (error) {
      throw new Error(`Failed to get user timeline: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get resource audit history
   */
  async getResourceHistory(
    resourceType: string,
    resourceId: string,
    limit: number = 100
  ): Promise<any[]> {
    try {
      const result = await this.pool.query(
        'SELECT * FROM get_resource_audit_history($1, $2, $3)',
        [resourceType, resourceId, limit]
      );

      return result.rows;
    } catch (error) {
      throw new Error(`Failed to get resource history: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get audit logs by IP address
   */
  async getLogsByIp(ipAddress: string, limit: number = 100): Promise<any[]> {
    try {
      const result = await this.pool.query(
        'SELECT * FROM get_audit_logs_by_ip($1, $2)',
        [ipAddress, limit]
      );

      return result.rows;
    } catch (error) {
      throw new Error(`Failed to get logs by IP: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get failed actions
   */
  async getFailedActions(
    startDate?: Date,
    endDate?: Date,
    limit: number = 100
  ): Promise<any[]> {
    try {
      const result = await this.pool.query(
        'SELECT * FROM get_failed_actions($1, $2, $3)',
        [startDate || null, endDate || null, limit]
      );

      return result.rows;
    } catch (error) {
      throw new Error(`Failed to get failed actions: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Detect suspicious activities
   */
  async getSuspiciousActivities(
    lookbackHours: number = 24,
    limit: number = 100
  ): Promise<SuspiciousActivity[]> {
    try {
      const result = await this.pool.query<{
        pattern_type: string;
        user_id?: string;
        username?: string;
        ip_address?: string;
        activity_count: number;
        first_seen: Date;
        last_seen: Date;
        sample_actions: string[];
      }>('SELECT * FROM get_suspicious_activities($1, $2)', [lookbackHours, limit]);

      return result.rows.map((row) => ({
        patternType: row.pattern_type,
        userId: row.user_id,
        username: row.username,
        ipAddress: row.ip_address,
        activityCount: parseInt(String(row.activity_count)),
        firstSeen: row.first_seen,
        lastSeen: row.last_seen,
        sampleActions: row.sample_actions,
      }));
    } catch (error) {
      throw new Error(`Failed to get suspicious activities: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Export audit logs to CSV format
   */
  async exportToCSV(filters: AdvancedAuditFilters): Promise<string> {
    try {
      const { logs } = await this.advancedSearch({ ...filters, limit: 10000 });

      // Transform logs for CSV export
      const records = logs.map((log) => ({
        timestamp: log.timestamp,
        username: log.username || 'N/A',
        action: log.action,
        resource_type: log.resourceType || '',
        resource_id: log.resourceId || '',
        status: log.status || '',
        ip_address: log.ipAddress || '',
        details: JSON.stringify(log.details || {}),
      }));

      // Create CSV
      const parser = new Parser({
        fields: [
          'timestamp',
          'username',
          'action',
          'resource_type',
          'resource_id',
          'status',
          'ip_address',
          'details',
        ],
      });

      return parser.parse(records);
    } catch (error) {
      throw new Error(`CSV export failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Export audit logs to JSON format
   */
  async exportToJSON(filters: AdvancedAuditFilters): Promise<string> {
    try {
      const { logs } = await this.advancedSearch({ ...filters, limit: 10000 });

      return JSON.stringify(
        {
          exportDate: new Date(),
          filters,
          totalRecords: logs.length,
          logs,
        },
        null,
        2
      );
    } catch (error) {
      throw new Error(`JSON export failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Create export record
   */
  async createExport(
    exportName: string,
    exportFormat: 'csv' | 'json' | 'pdf',
    filters: AdvancedAuditFilters,
    createdBy: string,
    filePath?: string,
    fileSize?: number
  ): Promise<AuditLogExport> {
    try {
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 7); // Expire in 7 days

      const { total } = await this.advancedSearch({ ...filters, limit: 1 });

      const result = await this.pool.query<{
        id: string;
        export_name: string;
        export_format: string;
        filters: any;
        total_records: number;
        file_path?: string;
        file_size?: number;
        created_by: string;
        created_at: Date;
        expires_at: Date;
        download_count: number;
      }>(
        `INSERT INTO audit_log_exports (
          export_name, export_format, filters, total_records,
          file_path, file_size, created_by, expires_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING *`,
        [
          exportName,
          exportFormat,
          JSON.stringify(filters),
          total,
          filePath,
          fileSize,
          createdBy,
          expiresAt,
        ]
      );

      const row = result.rows[0];
      return {
        id: row.id,
        exportName: row.export_name,
        exportFormat: row.export_format as 'csv' | 'json' | 'pdf',
        filters: row.filters,
        totalRecords: row.total_records,
        filePath: row.file_path,
        fileSize: row.file_size,
        createdBy: row.created_by,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
        downloadCount: row.download_count,
      };
    } catch (error) {
      throw new Error(`Failed to create export: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get export by ID
   */
  async getExport(exportId: string): Promise<AuditLogExport | null> {
    try {
      const result = await this.pool.query(
        'SELECT * FROM audit_log_exports WHERE id = $1',
        [exportId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      return {
        id: row.id,
        exportName: row.export_name,
        exportFormat: row.export_format,
        filters: row.filters,
        totalRecords: row.total_records,
        filePath: row.file_path,
        fileSize: row.file_size,
        createdBy: row.created_by,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
        downloadCount: row.download_count,
      };
    } catch (error) {
      throw new Error(`Failed to get export: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Record export download
   */
  async recordExportDownload(exportId: string): Promise<void> {
    try {
      await this.pool.query(
        `UPDATE audit_log_exports
         SET download_count = download_count + 1,
             last_downloaded_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [exportId]
      );
    } catch (error) {
      throw new Error(`Failed to record download: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Cleanup old exports
   */
  async cleanupOldExports(): Promise<number> {
    try {
      const result = await this.pool.query<{ cleanup_old_exports: number }>(
        'SELECT cleanup_old_exports() as cleanup_old_exports'
      );

      return result.rows[0].cleanup_old_exports;
    } catch (error) {
      throw new Error(`Failed to cleanup exports: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Save search
   */
  async saveSearch(
    searchName: string,
    searchFilters: AdvancedAuditFilters,
    createdBy: string,
    isPublic: boolean = false
  ): Promise<SavedSearch> {
    try {
      const result = await this.pool.query<{
        id: string;
        search_name: string;
        search_filters: any;
        is_public: boolean;
        created_by: string;
        created_at: Date;
        use_count: number;
      }>(
        `INSERT INTO audit_log_saved_searches (
          search_name, search_filters, created_by, is_public
        ) VALUES ($1, $2, $3, $4)
        ON CONFLICT (created_by, search_name)
        DO UPDATE SET search_filters = $2, updated_at = CURRENT_TIMESTAMP
        RETURNING *`,
        [searchName, JSON.stringify(searchFilters), createdBy, isPublic]
      );

      const row = result.rows[0];
      return {
        id: row.id,
        searchName: row.search_name,
        searchFilters: row.search_filters,
        isPublic: row.is_public,
        createdBy: row.created_by,
        createdAt: row.created_at,
        useCount: row.use_count,
      };
    } catch (error) {
      throw new Error(`Failed to save search: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get saved searches
   */
  async getSavedSearches(userId: string, includePublic: boolean = true): Promise<SavedSearch[]> {
    try {
      const result = await this.pool.query<{
        id: string;
        search_name: string;
        search_filters: any;
        is_public: boolean;
        created_by: string;
        created_at: Date;
        last_used_at?: Date;
        use_count: number;
      }>(
        `SELECT * FROM audit_log_saved_searches
         WHERE created_by = $1 OR (is_public = TRUE AND $2 = TRUE)
         ORDER BY last_used_at DESC NULLS LAST, created_at DESC`,
        [userId, includePublic]
      );

      return result.rows.map((row) => ({
        id: row.id,
        searchName: row.search_name,
        searchFilters: row.search_filters,
        isPublic: row.is_public,
        createdBy: row.created_by,
        createdAt: row.created_at,
        lastUsedAt: row.last_used_at,
        useCount: row.use_count,
      }));
    } catch (error) {
      throw new Error(`Failed to get saved searches: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Use saved search
   */
  async useSavedSearch(searchId: string): Promise<SavedSearch> {
    try {
      const result = await this.pool.query<{
        id: string;
        search_name: string;
        search_filters: any;
        is_public: boolean;
        created_by: string;
        created_at: Date;
        last_used_at: Date;
        use_count: number;
      }>(
        `UPDATE audit_log_saved_searches
         SET last_used_at = CURRENT_TIMESTAMP,
             use_count = use_count + 1
         WHERE id = $1
         RETURNING *`,
        [searchId]
      );

      if (result.rows.length === 0) {
        throw new Error('Saved search not found');
      }

      const row = result.rows[0];
      return {
        id: row.id,
        searchName: row.search_name,
        searchFilters: row.search_filters,
        isPublic: row.is_public,
        createdBy: row.created_by,
        createdAt: row.created_at,
        lastUsedAt: row.last_used_at,
        useCount: row.use_count,
      };
    } catch (error) {
      throw new Error(`Failed to use saved search: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Delete saved search
   */
  async deleteSavedSearch(searchId: string, userId: string): Promise<void> {
    try {
      const result = await this.pool.query(
        'DELETE FROM audit_log_saved_searches WHERE id = $1 AND created_by = $2',
        [searchId, userId]
      );

      if (result.rowCount === 0) {
        throw new Error('Saved search not found or unauthorized');
      }
    } catch (error) {
      throw new Error(`Failed to delete saved search: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Add bookmark
   */
  async addBookmark(auditLogId: string, userId: string, notes?: string): Promise<AuditBookmark> {
    try {
      const result = await this.pool.query<{
        id: string;
        audit_log_id: string;
        user_id: string;
        notes?: string;
        created_at: Date;
      }>(
        `INSERT INTO audit_log_bookmarks (audit_log_id, user_id, notes)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, audit_log_id) DO UPDATE SET notes = $3
         RETURNING *`,
        [auditLogId, userId, notes]
      );

      const row = result.rows[0];
      return {
        id: row.id,
        auditLogId: row.audit_log_id,
        userId: row.user_id,
        notes: row.notes,
        createdAt: row.created_at,
      };
    } catch (error) {
      throw new Error(`Failed to add bookmark: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get user bookmarks
   */
  async getBookmarks(userId: string): Promise<any[]> {
    try {
      const result = await this.pool.query(
        `SELECT
          b.id,
          b.audit_log_id,
          b.notes,
          b.created_at,
          al.action,
          al.resource_type,
          al.timestamp,
          u.username
        FROM audit_log_bookmarks b
        JOIN audit_logs al ON al.id = b.audit_log_id
        LEFT JOIN users u ON u.id = al.user_id
        WHERE b.user_id = $1
        ORDER BY b.created_at DESC`,
        [userId]
      );

      return result.rows;
    } catch (error) {
      throw new Error(`Failed to get bookmarks: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Remove bookmark
   */
  async removeBookmark(bookmarkId: string, userId: string): Promise<void> {
    try {
      const result = await this.pool.query(
        'DELETE FROM audit_log_bookmarks WHERE id = $1 AND user_id = $2',
        [bookmarkId, userId]
      );

      if (result.rowCount === 0) {
        throw new Error('Bookmark not found or unauthorized');
      }
    } catch (error) {
      throw new Error(`Failed to remove bookmark: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

// Singleton instance
let enhancedAuditServiceInstance: EnhancedAuditService | null = null;

export function initializeEnhancedAuditService(pool: Pool): EnhancedAuditService {
  if (!enhancedAuditServiceInstance) {
    enhancedAuditServiceInstance = new EnhancedAuditService(pool);
  }
  return enhancedAuditServiceInstance;
}

export function getEnhancedAuditService(): EnhancedAuditService {
  if (!enhancedAuditServiceInstance) {
    throw new Error('EnhancedAuditService not initialized. Call initializeEnhancedAuditService first.');
  }
  return enhancedAuditServiceInstance;
}

export default EnhancedAuditService;
