import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { AppLogger } from '../services/logger.service.js';
import crypto from 'crypto';

/**
 * Database Security Utilities
 * Provides secure database operations with built-in protections
 */

export interface QueryOptions {
  timeout?: number; // Query timeout in milliseconds
  logSlowQuery?: boolean; // Log if query is slow
  slowQueryThreshold?: number; // Threshold in ms to consider query slow
  audit?: boolean; // Enable audit logging for this query
  auditUserId?: string; // User ID for audit trail
  auditAction?: string; // Action description for audit
  maxRows?: number; // Maximum rows to return (prevent data exfiltration)
  sanitizeResult?: boolean; // Sanitize sensitive data from results
}

export interface ParameterizedQuery {
  text: string;
  values: any[];
  name?: string; // Named prepared statement for caching
}

export interface QueryStats {
  queryId: string;
  query: string;
  duration: number;
  rowCount: number;
  timestamp: Date;
  userId?: string;
  success: boolean;
  error?: string;
}

export interface SlowQueryLog {
  queryId: string;
  query: string;
  duration: number;
  threshold: number;
  parameters: any[];
  timestamp: Date;
  stackTrace?: string;
}

/**
 * Database Utility Class
 * Provides secure, monitored database operations
 */
export class DatabaseUtil {
  private pool: Pool;
  private defaultTimeout: number = 30000; // 30 seconds
  private slowQueryThreshold: number = 1000; // 1 second
  private queryStats: Map<string, QueryStats> = new Map();
  private slowQueries: SlowQueryLog[] = [];
  private maxSlowQueryLog: number = 100;

  constructor(pool: Pool) {
    this.pool = pool;
    this.setupPoolMonitoring();
  }

  /**
   * Setup connection pool monitoring
   */
  private setupPoolMonitoring(): void {
    // Monitor pool events
    this.pool.on('connect', () => {
      AppLogger.debug('Database connection established', {
        totalCount: this.pool.totalCount,
        idleCount: this.pool.idleCount,
        waitingCount: this.pool.waitingCount,
      });
    });

    this.pool.on('acquire', () => {
      AppLogger.debug('Database connection acquired from pool', {
        totalCount: this.pool.totalCount,
        idleCount: this.pool.idleCount,
      });
    });

    this.pool.on('remove', () => {
      AppLogger.warn('Database connection removed from pool', {
        totalCount: this.pool.totalCount,
        idleCount: this.pool.idleCount,
      });
    });

    this.pool.on('error', (err, client) => {
      AppLogger.error('Unexpected database pool error', err, {
        totalCount: this.pool.totalCount,
        idleCount: this.pool.idleCount,
      });
    });
  }

  /**
   * Execute parameterized query with security controls
   */
  async query<T extends QueryResultRow = any>(
    query: string | ParameterizedQuery,
    values?: any[],
    options: QueryOptions = {}
  ): Promise<QueryResult<T>> {
    const queryId = this.generateQueryId();
    const startTime = Date.now();

    const {
      timeout = this.defaultTimeout,
      logSlowQuery = true,
      slowQueryThreshold = this.slowQueryThreshold,
      audit = false,
      auditUserId,
      auditAction,
      maxRows,
      sanitizeResult = false,
    } = options;

    let client: PoolClient | null = null;
    let result: QueryResult<T>;

    try {
      // Get client from pool
      client = await this.pool.connect();

      // Set statement timeout
      await client.query(`SET statement_timeout = ${timeout}`);

      // Execute query
      const queryText = typeof query === 'string' ? query : query.text;
      const queryValues = typeof query === 'string' ? values : query.values;
      const queryName = typeof query === 'object' ? query.name : undefined;

      // Log query execution (sanitized)
      AppLogger.debug('Executing database query', {
        queryId,
        query: this.sanitizeQueryForLogging(queryText),
        timeout,
        hasValues: !!queryValues && queryValues.length > 0,
      });

      // Execute with or without prepared statement name
      if (queryName) {
        result = await client.query<T>({
          name: queryName,
          text: queryText,
          values: queryValues,
        });
      } else {
        result = await client.query<T>(queryText, queryValues);
      }

      // Enforce max rows limit
      if (maxRows && result.rows.length > maxRows) {
        AppLogger.logSecurityEvent('database.max_rows_exceeded', 'medium', {
          queryId,
          maxRows,
          actualRows: result.rows.length,
          userId: auditUserId,
        });

        result.rows = result.rows.slice(0, maxRows);
      }

      // Sanitize sensitive data if requested
      if (sanitizeResult) {
        result.rows = this.sanitizeResults(result.rows);
      }

      const duration = Date.now() - startTime;

      // Log slow queries
      if (logSlowQuery && duration > slowQueryThreshold) {
        this.logSlowQuery({
          queryId,
          query: queryText,
          duration,
          threshold: slowQueryThreshold,
          parameters: queryValues || [],
          timestamp: new Date(),
          stackTrace: new Error().stack,
        });
      }

      // Record query stats
      this.recordQueryStats({
        queryId,
        query: this.sanitizeQueryForLogging(queryText),
        duration,
        rowCount: result.rowCount || 0,
        timestamp: new Date(),
        userId: auditUserId,
        success: true,
      });

      // Audit logging if enabled
      if (audit) {
        await this.auditDatabaseQuery({
          queryId,
          query: this.sanitizeQueryForLogging(queryText),
          userId: auditUserId,
          action: auditAction || 'QUERY_EXECUTED',
          rowCount: result.rowCount || 0,
          duration,
          success: true,
        });
      }

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      // Log error
      AppLogger.error('Database query failed', error as Error, {
        queryId,
        duration,
        userId: auditUserId,
      });

      // Record failed query stats
      this.recordQueryStats({
        queryId,
        query: typeof query === 'string' ? this.sanitizeQueryForLogging(query) : this.sanitizeQueryForLogging(query.text),
        duration,
        rowCount: 0,
        timestamp: new Date(),
        userId: auditUserId,
        success: false,
        error: (error as Error).message,
      });

      // Audit failed query
      if (audit) {
        await this.auditDatabaseQuery({
          queryId,
          query: typeof query === 'string' ? this.sanitizeQueryForLogging(query) : this.sanitizeQueryForLogging(query.text),
          userId: auditUserId,
          action: auditAction || 'QUERY_FAILED',
          rowCount: 0,
          duration,
          success: false,
          error: (error as Error).message,
        });
      }

      throw error;
    } finally {
      // Reset statement timeout and release client
      if (client) {
        try {
          await client.query('SET statement_timeout = 0');
        } catch (err) {
          AppLogger.error('Failed to reset statement timeout', err as Error);
        }
        client.release();
      }
    }
  }

  /**
   * Execute multiple queries in a transaction
   */
  async transaction<T>(
    callback: (client: PoolClient) => Promise<T>,
    options: QueryOptions = {}
  ): Promise<T> {
    const queryId = this.generateQueryId();
    const startTime = Date.now();
    let client: PoolClient | null = null;

    try {
      client = await this.pool.connect();

      // Set timeout
      const timeout = options.timeout || this.defaultTimeout;
      await client.query(`SET statement_timeout = ${timeout}`);

      // Begin transaction
      await client.query('BEGIN');

      AppLogger.debug('Database transaction started', { queryId });

      // Execute callback
      const result = await callback(client);

      // Commit transaction
      await client.query('COMMIT');

      const duration = Date.now() - startTime;

      AppLogger.info('Database transaction committed', {
        queryId,
        duration,
        userId: options.auditUserId,
      });

      // Audit transaction if enabled
      if (options.audit) {
        await this.auditDatabaseQuery({
          queryId,
          query: 'TRANSACTION',
          userId: options.auditUserId,
          action: options.auditAction || 'TRANSACTION_COMMITTED',
          rowCount: 0,
          duration,
          success: true,
        });
      }

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      // Rollback on error
      if (client) {
        try {
          await client.query('ROLLBACK');
          AppLogger.warn('Database transaction rolled back', {
            queryId,
            duration,
            error: (error as Error).message,
          });
        } catch (rollbackError) {
          AppLogger.error('Failed to rollback transaction', rollbackError as Error, {
            queryId,
          });
        }
      }

      // Audit failed transaction
      if (options.audit && client) {
        await this.auditDatabaseQuery({
          queryId,
          query: 'TRANSACTION',
          userId: options.auditUserId,
          action: options.auditAction || 'TRANSACTION_FAILED',
          rowCount: 0,
          duration,
          success: false,
          error: (error as Error).message,
        });
      }

      throw error;
    } finally {
      if (client) {
        try {
          await client.query('SET statement_timeout = 0');
        } catch (err) {
          AppLogger.error('Failed to reset statement timeout', err as Error);
        }
        client.release();
      }
    }
  }

  /**
   * Build parameterized query safely
   */
  buildParameterizedQuery(
    baseQuery: string,
    conditions: Record<string, any>,
    allowedFields: string[]
  ): ParameterizedQuery {
    const values: any[] = [];
    const whereClauses: string[] = [];
    let paramIndex = 1;

    for (const [field, value] of Object.entries(conditions)) {
      // Only allow whitelisted fields to prevent SQL injection
      if (!allowedFields.includes(field)) {
        throw new Error(`Field '${field}' is not allowed in query`);
      }

      // Handle null values
      if (value === null) {
        whereClauses.push(`${field} IS NULL`);
      } else if (Array.isArray(value)) {
        // Handle IN clause
        const placeholders = value.map(() => `$${paramIndex++}`).join(', ');
        whereClauses.push(`${field} IN (${placeholders})`);
        values.push(...value);
      } else {
        whereClauses.push(`${field} = $${paramIndex++}`);
        values.push(value);
      }
    }

    const whereClause = whereClauses.length > 0 ? `WHERE ${whereClauses.join(' AND ')}` : '';
    const text = `${baseQuery} ${whereClause}`.trim();

    return { text, values };
  }

  /**
   * Safe LIKE query builder (prevents SQL injection in LIKE patterns)
   */
  buildLikeQuery(field: string, pattern: string, caseInsensitive: boolean = true): { clause: string; value: string } {
    // Escape special LIKE characters
    const escapedPattern = pattern.replace(/[%_\\]/g, '\\$&');

    const clause = caseInsensitive ? `${field} ILIKE $` : `${field} LIKE $`;
    const value = `%${escapedPattern}%`;

    return { clause, value };
  }

  /**
   * Generate unique query ID
   */
  private generateQueryId(): string {
    return crypto.randomBytes(8).toString('hex');
  }

  /**
   * Sanitize query for logging (remove sensitive data)
   */
  private sanitizeQueryForLogging(query: string): string {
    // Remove potential password values
    let sanitized = query.replace(
      /password\s*=\s*'[^']*'/gi,
      "password = '[REDACTED]'"
    );
    sanitized = sanitized.replace(
      /password_hash\s*=\s*'[^']*'/gi,
      "password_hash = '[REDACTED]'"
    );
    sanitized = sanitized.replace(
      /token\s*=\s*'[^']*'/gi,
      "token = '[REDACTED]'"
    );
    sanitized = sanitized.replace(
      /secret\s*=\s*'[^']*'/gi,
      "secret = '[REDACTED]'"
    );

    return sanitized;
  }

  /**
   * Sanitize query results (remove sensitive fields)
   */
  private sanitizeResults<T extends QueryResultRow>(rows: T[]): T[] {
    const sensitiveFields = ['password', 'password_hash', 'token', 'secret', 'api_key', 'private_key'];

    return rows.map((row) => {
      const sanitizedRow = { ...row };

      for (const field of sensitiveFields) {
        if (field in sanitizedRow) {
          sanitizedRow[field] = '[REDACTED]' as any;
        }
      }

      return sanitizedRow;
    });
  }

  /**
   * Record query statistics
   */
  private recordQueryStats(stats: QueryStats): void {
    this.queryStats.set(stats.queryId, stats);

    // Keep only last 1000 stats
    if (this.queryStats.size > 1000) {
      const firstKey = this.queryStats.keys().next().value;
      this.queryStats.delete(firstKey);
    }
  }

  /**
   * Log slow query
   */
  private logSlowQuery(log: SlowQueryLog): void {
    AppLogger.warn('Slow query detected', {
      queryId: log.queryId,
      query: log.query,
      duration: log.duration,
      threshold: log.threshold,
      paramCount: log.parameters.length,
    });

    this.slowQueries.push(log);

    // Keep only last N slow queries
    if (this.slowQueries.length > this.maxSlowQueryLog) {
      this.slowQueries.shift();
    }
  }

  /**
   * Audit database query
   */
  private async auditDatabaseQuery(audit: {
    queryId: string;
    query: string;
    userId?: string;
    action: string;
    rowCount: number;
    duration: number;
    success: boolean;
    error?: string;
  }): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO audit_logs (
          user_id, action, resource_type, resource_id,
          details, ip_address, user_agent, status, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
        [
          audit.userId || null,
          audit.action,
          'DATABASE_QUERY',
          audit.queryId,
          JSON.stringify({
            query: audit.query,
            rowCount: audit.rowCount,
            duration: audit.duration,
            error: audit.error,
          }),
          null, // IP not available in this context
          null, // User agent not available
          audit.success ? 'SUCCESS' : 'FAILURE',
        ]
      );
    } catch (error) {
      // Don't throw - audit failure shouldn't break the application
      AppLogger.error('Failed to audit database query', error as Error, {
        queryId: audit.queryId,
      });
    }
  }

  /**
   * Get connection pool statistics
   */
  getPoolStats(): {
    totalCount: number;
    idleCount: number;
    waitingCount: number;
    utilization: number;
  } {
    const totalCount = this.pool.totalCount;
    const idleCount = this.pool.idleCount;
    const waitingCount = this.pool.waitingCount;

    return {
      totalCount,
      idleCount,
      waitingCount,
      utilization: totalCount > 0 ? ((totalCount - idleCount) / totalCount) * 100 : 0,
    };
  }

  /**
   * Get query statistics
   */
  getQueryStats(): {
    total: number;
    successful: number;
    failed: number;
    averageDuration: number;
    slowQueries: number;
  } {
    const stats = Array.from(this.queryStats.values());
    const successful = stats.filter((s) => s.success).length;
    const failed = stats.filter((s) => !s.success).length;
    const totalDuration = stats.reduce((sum, s) => sum + s.duration, 0);

    return {
      total: stats.length,
      successful,
      failed,
      averageDuration: stats.length > 0 ? totalDuration / stats.length : 0,
      slowQueries: this.slowQueries.length,
    };
  }

  /**
   * Get slow queries
   */
  getSlowQueries(limit: number = 10): SlowQueryLog[] {
    return this.slowQueries.slice(-limit).reverse();
  }

  /**
   * Get recent query history
   */
  getRecentQueries(limit: number = 10): QueryStats[] {
    const stats = Array.from(this.queryStats.values());
    return stats.slice(-limit).reverse();
  }

  /**
   * Clear query statistics
   */
  clearStats(): void {
    this.queryStats.clear();
    this.slowQueries = [];
    AppLogger.info('Query statistics cleared');
  }

  /**
   * Health check - test database connection
   */
  async healthCheck(): Promise<{ healthy: boolean; latency: number; error?: string }> {
    const startTime = Date.now();

    try {
      await this.pool.query('SELECT 1');
      const latency = Date.now() - startTime;

      return {
        healthy: true,
        latency,
      };
    } catch (error) {
      const latency = Date.now() - startTime;

      return {
        healthy: false,
        latency,
        error: (error as Error).message,
      };
    }
  }

  /**
   * Close pool gracefully
   */
  async close(): Promise<void> {
    await this.pool.end();
    AppLogger.info('Database connection pool closed');
  }
}

/**
 * Singleton instance
 */
let dbUtil: DatabaseUtil | null = null;

export function initializeDatabaseUtil(pool: Pool): DatabaseUtil {
  dbUtil = new DatabaseUtil(pool);
  return dbUtil;
}

export function getDatabaseUtil(): DatabaseUtil {
  if (!dbUtil) {
    throw new Error('DatabaseUtil not initialized. Call initializeDatabaseUtil first.');
  }
  return dbUtil;
}
