/**
 * CrawlPersistenceService
 *
 * Handles database persistence for multi-page crawl results
 * with optimized batch operations for large datasets (1000+ pages).
 *
 * Features:
 * - Efficient batch insert operations
 * - Paginated query support
 * - Progress tracking
 * - Session management
 * - Conversion status tracking
 * - Cleanup utilities
 */

import { Pool, PoolClient } from 'pg';
import { getPool } from '../config/database.js';
import { AppLogger } from './logger.service.js';
import type { CrawledPage } from './MultiPageCrawlerService.js';

// ============================================================================
// Type Definitions
// ============================================================================

export interface CrawlSession {
  id: string;
  projectId?: string;
  userId?: string;
  startUrl: string;
  status: 'pending' | 'crawling' | 'converting' | 'completed' | 'failed' | 'paused';
  totalPages: number;
  crawledPages: number;
  convertedPages: number;
  failedPages: number;
  options: CrawlOptions;
  crawlMethod?: string;
  sitemapUsed?: string;
  startedAt?: Date;
  completedAt?: Date;
  lastActivityAt: Date;
  error?: string;
  errorCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CrawlOptions {
  maxPages?: number;
  maxDepth?: number;
  sameDomainOnly?: boolean;
  includeSubdomains?: boolean;
  excludePatterns?: string[];
  includePatterns?: string[];
  includeAssets?: boolean;
  builderType?: string;
  [key: string]: any;
}

export interface StoredCrawledPage {
  id: string;
  sessionId: string;
  url: string;
  title: string;
  html: string;
  depth: number;
  metadata: any;
  assets: {
    images: string[];
    css: string[];
    js: string[];
    fonts: string[];
  };
  links: string[];
  converted: boolean;
  conversionStatus: 'pending' | 'converting' | 'completed' | 'failed';
  conversionError?: string;
  crawledAt: Date;
  convertedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasMore: boolean;
  };
}

export interface ConversionProgress {
  sessionId: string;
  totalPages: number;
  convertedPages: number;
  pendingPages: number;
  failedPages: number;
  progressPercentage: number;
  estimatedTimeRemaining?: number;
}

// ============================================================================
// CrawlPersistenceService
// ============================================================================

export class CrawlPersistenceService {
  private pool: Pool;
  private readonly DEFAULT_BATCH_SIZE = 100;

  constructor() {
    this.pool = getPool();
  }

  // ============================================================================
  // Session Management
  // ============================================================================

  /**
   * Create a new crawl session
   */
  async createCrawlSession(
    startUrl: string,
    options: CrawlOptions,
    userId?: string,
    projectId?: string
  ): Promise<string> {
    const client = await this.pool.connect();

    try {
      AppLogger.info('Creating crawl session', { startUrl, userId, projectId });

      const result = await client.query(
        `INSERT INTO crawl_sessions (
          user_id, project_id, start_url, status, options, total_pages
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id`,
        [
          userId || null,
          projectId || null,
          startUrl,
          'pending',
          JSON.stringify(options),
          options.maxPages || 0,
        ]
      );

      const sessionId = result.rows[0].id;
      AppLogger.info('Crawl session created', { sessionId, startUrl });

      return sessionId;

    } catch (error: any) {
      AppLogger.error('Failed to create crawl session', error, { startUrl });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get crawl session by ID
   */
  async getCrawlSession(sessionId: string): Promise<CrawlSession | null> {
    const client = await this.pool.connect();

    try {
      const result = await client.query(
        `SELECT
          id, project_id, user_id, start_url, status,
          total_pages, crawled_pages, converted_pages, failed_pages,
          options, crawl_method, sitemap_used,
          started_at, completed_at, last_activity_at,
          error, error_count, created_at, updated_at
        FROM crawl_sessions
        WHERE id = $1`,
        [sessionId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapSessionRow(result.rows[0]);

    } finally {
      client.release();
    }
  }

  /**
   * Update crawl session
   */
  async updateCrawlSession(
    sessionId: string,
    updates: Partial<CrawlSession>
  ): Promise<void> {
    const client = await this.pool.connect();

    try {
      const fields: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      // Build dynamic UPDATE query
      Object.entries(updates).forEach(([key, value]) => {
        const snakeKey = this.camelToSnake(key);
        fields.push(`${snakeKey} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      });

      if (fields.length === 0) {
        return;
      }

      // Always update last_activity_at
      fields.push(`last_activity_at = NOW()`);

      values.push(sessionId);
      const query = `
        UPDATE crawl_sessions
        SET ${fields.join(', ')}
        WHERE id = $${paramIndex}
      `;

      await client.query(query, values);
      AppLogger.debug('Crawl session updated', { sessionId, updates });

    } catch (error: any) {
      AppLogger.error('Failed to update crawl session', error, { sessionId });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Delete crawl session and all related data
   */
  async deleteCrawlSession(sessionId: string): Promise<void> {
    const client = await this.pool.connect();

    try {
      AppLogger.info('Deleting crawl session', { sessionId });

      // Cascading delete will remove all related data
      await client.query('DELETE FROM crawl_sessions WHERE id = $1', [sessionId]);

      AppLogger.info('Crawl session deleted', { sessionId });

    } catch (error: any) {
      AppLogger.error('Failed to delete crawl session', error, { sessionId });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * List crawl sessions with filters
   */
  async listCrawlSessions(
    filters: {
      userId?: string;
      projectId?: string;
      status?: string;
    } = {},
    limit: number = 50,
    offset: number = 0
  ): Promise<PaginatedResult<CrawlSession>> {
    const client = await this.pool.connect();

    try {
      const conditions: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (filters.userId) {
        conditions.push(`user_id = $${paramIndex}`);
        values.push(filters.userId);
        paramIndex++;
      }

      if (filters.projectId) {
        conditions.push(`project_id = $${paramIndex}`);
        values.push(filters.projectId);
        paramIndex++;
      }

      if (filters.status) {
        conditions.push(`status = $${paramIndex}`);
        values.push(filters.status);
        paramIndex++;
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      // Get total count
      const countResult = await client.query(
        `SELECT COUNT(*) as total FROM crawl_sessions ${whereClause}`,
        values
      );
      const total = parseInt(countResult.rows[0].total);

      // Get paginated results
      const dataResult = await client.query(
        `SELECT * FROM crawl_sessions ${whereClause}
        ORDER BY created_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...values, limit, offset]
      );

      const data = dataResult.rows.map(row => this.mapSessionRow(row));

      return {
        data,
        pagination: {
          page: Math.floor(offset / limit) + 1,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasMore: offset + limit < total,
        },
      };

    } finally {
      client.release();
    }
  }

  // ============================================================================
  // Page Storage (Batch Optimized)
  // ============================================================================

  /**
   * Store crawled pages in batches
   */
  async storeCrawledPages(
    sessionId: string,
    pages: CrawledPage[],
    batchSize: number = this.DEFAULT_BATCH_SIZE
  ): Promise<void> {
    if (pages.length === 0) {
      return;
    }

    AppLogger.info('Storing crawled pages', {
      sessionId,
      totalPages: pages.length,
      batchSize,
    });

    const startTime = Date.now();

    // Process in batches
    for (let i = 0; i < pages.length; i += batchSize) {
      const batch = pages.slice(i, i + batchSize);
      await this.insertPageBatch(sessionId, batch);

      AppLogger.debug(`Batch ${Math.floor(i / batchSize) + 1} stored`, {
        sessionId,
        pagesStored: Math.min(i + batchSize, pages.length),
        totalPages: pages.length,
      });
    }

    const duration = Date.now() - startTime;
    AppLogger.info('All pages stored', {
      sessionId,
      totalPages: pages.length,
      duration,
      avgTimePerPage: duration / pages.length,
    });
  }

  /**
   * Insert a batch of pages (optimized)
   */
  private async insertPageBatch(
    sessionId: string,
    pages: CrawledPage[]
  ): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Build bulk insert query
      const values: any[] = [];
      const placeholders: string[] = [];
      let paramIndex = 1;

      pages.forEach((page, index) => {
        const placeholder = `($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5}, $${paramIndex + 6}, $${paramIndex + 7})`;
        placeholders.push(placeholder);

        values.push(
          sessionId,
          page.url,
          page.title || '',
          page.html || '',
          page.depth || 0,
          JSON.stringify(page.metadata || {}),
          JSON.stringify(page.assets || { images: [], css: [], js: [], fonts: [] }),
          JSON.stringify(page.links || [])
        );

        paramIndex += 8;
      });

      const query = `
        INSERT INTO crawled_pages (
          session_id, url, title, html, depth, metadata, assets, links
        ) VALUES ${placeholders.join(', ')}
        ON CONFLICT (session_id, url) DO UPDATE SET
          title = EXCLUDED.title,
          html = EXCLUDED.html,
          depth = EXCLUDED.depth,
          metadata = EXCLUDED.metadata,
          assets = EXCLUDED.assets,
          links = EXCLUDED.links,
          updated_at = NOW()
      `;

      await client.query(query, values);
      await client.query('COMMIT');

    } catch (error: any) {
      await client.query('ROLLBACK');
      AppLogger.error('Failed to insert page batch', error, { sessionId, batchSize: pages.length });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get paginated crawled pages
   */
  async getPaginatedPages(
    sessionId: string,
    limit: number = 50,
    offset: number = 0,
    filters: {
      converted?: boolean;
      conversionStatus?: string;
    } = {}
  ): Promise<PaginatedResult<StoredCrawledPage>> {
    const client = await this.pool.connect();

    try {
      const conditions = ['session_id = $1'];
      const values: any[] = [sessionId];
      let paramIndex = 2;

      if (filters.converted !== undefined) {
        conditions.push(`converted = $${paramIndex}`);
        values.push(filters.converted);
        paramIndex++;
      }

      if (filters.conversionStatus) {
        conditions.push(`conversion_status = $${paramIndex}`);
        values.push(filters.conversionStatus);
        paramIndex++;
      }

      const whereClause = `WHERE ${conditions.join(' AND ')}`;

      // Get total count
      const countResult = await client.query(
        `SELECT COUNT(*) as total FROM crawled_pages ${whereClause}`,
        values
      );
      const total = parseInt(countResult.rows[0].total);

      // Get paginated data
      const dataResult = await client.query(
        `SELECT
          id, session_id, url, title, html, depth, metadata, assets, links,
          converted, conversion_status, conversion_error,
          crawled_at, converted_at, created_at, updated_at
        FROM crawled_pages
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...values, limit, offset]
      );

      const data = dataResult.rows.map(row => this.mapPageRow(row));

      return {
        data,
        pagination: {
          page: Math.floor(offset / limit) + 1,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasMore: offset + limit < total,
        },
      };

    } finally {
      client.release();
    }
  }

  /**
   * Get page by ID
   */
  async getPageById(pageId: string): Promise<StoredCrawledPage | null> {
    const client = await this.pool.connect();

    try {
      const result = await client.query(
        `SELECT
          id, session_id, url, title, html, depth, metadata, assets, links,
          converted, conversion_status, conversion_error,
          crawled_at, converted_at, created_at, updated_at
        FROM crawled_pages
        WHERE id = $1`,
        [pageId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapPageRow(result.rows[0]);

    } finally {
      client.release();
    }
  }

  /**
   * Update conversion status for a page
   */
  async updateConversionStatus(
    pageId: string,
    status: 'pending' | 'converting' | 'completed' | 'failed',
    data?: {
      error?: string;
      convertedAt?: Date;
    }
  ): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query(
        `UPDATE crawled_pages
        SET conversion_status = $1,
            converted = $2,
            conversion_error = $3,
            converted_at = $4,
            updated_at = NOW()
        WHERE id = $5`,
        [
          status,
          status === 'completed',
          data?.error || null,
          data?.convertedAt || (status === 'completed' ? new Date() : null),
          pageId,
        ]
      );

      AppLogger.debug('Page conversion status updated', { pageId, status });

    } catch (error: any) {
      AppLogger.error('Failed to update conversion status', error, { pageId });
      throw error;
    } finally {
      client.release();
    }
  }

  // ============================================================================
  // Progress Tracking
  // ============================================================================

  /**
   * Get conversion progress for a session
   */
  async getConversionProgress(sessionId: string): Promise<ConversionProgress> {
    const client = await this.pool.connect();

    try {
      const result = await client.query(
        `SELECT
          COUNT(*) as total_pages,
          COUNT(*) FILTER (WHERE converted = TRUE) as converted_pages,
          COUNT(*) FILTER (WHERE conversion_status = 'pending') as pending_pages,
          COUNT(*) FILTER (WHERE conversion_status = 'failed') as failed_pages
        FROM crawled_pages
        WHERE session_id = $1`,
        [sessionId]
      );

      const row = result.rows[0];
      const totalPages = parseInt(row.total_pages);
      const convertedPages = parseInt(row.converted_pages);
      const pendingPages = parseInt(row.pending_pages);
      const failedPages = parseInt(row.failed_pages);
      const progressPercentage = totalPages > 0 ? (convertedPages / totalPages) * 100 : 0;

      return {
        sessionId,
        totalPages,
        convertedPages,
        pendingPages,
        failedPages,
        progressPercentage,
      };

    } finally {
      client.release();
    }
  }

  /**
   * Get session statistics
   */
  async getSessionStatistics(sessionId: string): Promise<any> {
    const client = await this.pool.connect();

    try {
      const result = await client.query(
        `SELECT
          COUNT(*) as total_pages,
          AVG(LENGTH(html)) as avg_html_size,
          AVG(JSONB_ARRAY_LENGTH(assets->'images')) as avg_images,
          AVG(JSONB_ARRAY_LENGTH(links)) as avg_links,
          MAX(depth) as max_depth,
          COUNT(*) FILTER (WHERE converted = TRUE) as converted_count,
          COUNT(*) FILTER (WHERE conversion_status = 'failed') as failed_count
        FROM crawled_pages
        WHERE session_id = $1`,
        [sessionId]
      );

      const row = result.rows[0];

      return {
        totalPages: parseInt(row.total_pages),
        avgHtmlSize: Math.round(parseFloat(row.avg_html_size) || 0),
        avgImages: Math.round(parseFloat(row.avg_images) || 0),
        avgLinks: Math.round(parseFloat(row.avg_links) || 0),
        maxDepth: parseInt(row.max_depth) || 0,
        convertedCount: parseInt(row.converted_count),
        failedCount: parseInt(row.failed_count),
      };

    } finally {
      client.release();
    }
  }

  // ============================================================================
  // Cleanup and Maintenance
  // ============================================================================

  /**
   * Clean up old crawl sessions
   */
  async cleanupOldCrawls(daysOld: number = 30): Promise<number> {
    const client = await this.pool.connect();

    try {
      AppLogger.info('Cleaning up old crawl sessions', { daysOld });

      const result = await client.query(
        `DELETE FROM crawl_sessions
        WHERE created_at < NOW() - $1::INTERVAL
        AND status IN ('completed', 'failed')
        RETURNING id`,
        [`${daysOld} days`]
      );

      const deletedCount = result.rows.length;
      AppLogger.info('Old crawl sessions cleaned up', { deletedCount, daysOld });

      return deletedCount;

    } catch (error: any) {
      AppLogger.error('Failed to clean up old crawls', error, { daysOld });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Archive completed sessions
   */
  async archiveCompletedSessions(daysOld: number = 90): Promise<number> {
    const client = await this.pool.connect();

    try {
      AppLogger.info('Archiving completed sessions', { daysOld });

      // Use database function for archiving
      const result = await client.query(
        'SELECT archive_completed_crawl_sessions($1)',
        [daysOld]
      );

      const archivedCount = result.rows[0].archive_completed_crawl_sessions;
      AppLogger.info('Sessions archived', { archivedCount, daysOld });

      return archivedCount;

    } catch (error: any) {
      AppLogger.error('Failed to archive sessions', error, { daysOld });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get database statistics
   */
  async getDatabaseStats(): Promise<any> {
    const client = await this.pool.connect();

    try {
      const result = await client.query(`
        SELECT
          (SELECT COUNT(*) FROM crawl_sessions) as total_sessions,
          (SELECT COUNT(*) FROM crawl_sessions WHERE status = 'completed') as completed_sessions,
          (SELECT COUNT(*) FROM crawl_sessions WHERE status = 'failed') as failed_sessions,
          (SELECT COUNT(*) FROM crawled_pages) as total_pages,
          (SELECT COUNT(*) FROM page_builder_conversions) as total_conversions,
          (SELECT pg_size_pretty(pg_database_size(current_database()))) as database_size
      `);

      return result.rows[0];

    } finally {
      client.release();
    }
  }

  // ============================================================================
  // Batch Operations
  // ============================================================================

  /**
   * Batch update conversion status
   */
  async batchUpdateConversionStatus(
    pageIds: string[],
    status: 'pending' | 'converting' | 'completed' | 'failed'
  ): Promise<void> {
    if (pageIds.length === 0) {
      return;
    }

    const client = await this.pool.connect();

    try {
      await client.query(
        `UPDATE crawled_pages
        SET conversion_status = $1,
            converted = $2,
            updated_at = NOW()
        WHERE id = ANY($3)`,
        [status, status === 'completed', pageIds]
      );

      AppLogger.debug('Batch conversion status updated', {
        count: pageIds.length,
        status,
      });

    } catch (error: any) {
      AppLogger.error('Failed to batch update conversion status', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Batch delete pages
   */
  async batchDeletePages(pageIds: string[]): Promise<number> {
    if (pageIds.length === 0) {
      return 0;
    }

    const client = await this.pool.connect();

    try {
      const result = await client.query(
        'DELETE FROM crawled_pages WHERE id = ANY($1) RETURNING id',
        [pageIds]
      );

      const deletedCount = result.rows.length;
      AppLogger.info('Pages deleted in batch', { deletedCount });

      return deletedCount;

    } catch (error: any) {
      AppLogger.error('Failed to batch delete pages', error);
      throw error;
    } finally {
      client.release();
    }
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Map database row to CrawlSession
   */
  private mapSessionRow(row: any): CrawlSession {
    return {
      id: row.id,
      projectId: row.project_id,
      userId: row.user_id,
      startUrl: row.start_url,
      status: row.status,
      totalPages: row.total_pages || 0,
      crawledPages: row.crawled_pages || 0,
      convertedPages: row.converted_pages || 0,
      failedPages: row.failed_pages || 0,
      options: row.options || {},
      crawlMethod: row.crawl_method,
      sitemapUsed: row.sitemap_used,
      startedAt: row.started_at ? new Date(row.started_at) : undefined,
      completedAt: row.completed_at ? new Date(row.completed_at) : undefined,
      lastActivityAt: new Date(row.last_activity_at),
      error: row.error,
      errorCount: row.error_count || 0,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  /**
   * Map database row to StoredCrawledPage
   */
  private mapPageRow(row: any): StoredCrawledPage {
    return {
      id: row.id,
      sessionId: row.session_id,
      url: row.url,
      title: row.title || '',
      html: row.html || '',
      depth: row.depth || 0,
      metadata: row.metadata || {},
      assets: row.assets || { images: [], css: [], js: [], fonts: [] },
      links: row.links || [],
      converted: row.converted || false,
      conversionStatus: row.conversion_status || 'pending',
      conversionError: row.conversion_error,
      crawledAt: new Date(row.crawled_at),
      convertedAt: row.converted_at ? new Date(row.converted_at) : undefined,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  /**
   * Convert camelCase to snake_case
   */
  private camelToSnake(str: string): string {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
  }
}

// Export singleton instance
export default new CrawlPersistenceService();
