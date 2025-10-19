import { Pool } from 'pg';
import { AppLogger } from './logger.service.js';
import { NotificationService } from './notification.service.js';
import cron from 'node-cron';
import crypto from 'crypto';

/**
 * Slow Query Logger Service
 * Monitors and logs slow database queries for optimization
 */

export interface SlowQueryEntry {
  queryId: string;
  query: string;
  parameters?: any[];
  duration: number;
  threshold: number;
  timestamp: Date;
  userId?: string;
  operation: string;
  tableName?: string;
  rowCount?: number;
  executionPlan?: any;
  stackTrace?: string;
  context?: Record<string, any>;
}

export interface SlowQueryStats {
  totalSlowQueries: number;
  slowestQuery: SlowQueryEntry | null;
  averageDuration: number;
  byOperation: Record<string, number>;
  byTable: Record<string, number>;
  topSlowQueries: SlowQueryEntry[];
}

export interface SlowQueryConfig {
  threshold: number; // Threshold in ms to consider query slow
  captureStackTrace: boolean; // Capture stack trace for debugging
  captureExecutionPlan: boolean; // Capture EXPLAIN output
  maxLogSize: number; // Maximum number of slow queries to keep in memory
  persistToDisk: boolean; // Whether to persist to database
  alertOnSlowQuery: boolean; // Send alerts for slow queries
  criticalThreshold: number; // Threshold for critical slow queries
}

export class SlowQueryLoggerService {
  private pool: Pool;
  private config: SlowQueryConfig;
  private slowQueries: SlowQueryEntry[] = [];
  private queryStats: Map<string, number> = new Map(); // Query signature -> count
  private notificationService: NotificationService;
  private notificationCooldown: Map<string, number> = new Map(); // Query signature -> last notification time

  constructor(pool: Pool, config: Partial<SlowQueryConfig> = {}) {
    this.pool = pool;
    this.config = {
      threshold: config.threshold || 1000, // 1 second
      captureStackTrace: config.captureStackTrace !== false,
      captureExecutionPlan: config.captureExecutionPlan || false,
      maxLogSize: config.maxLogSize || 500,
      persistToDisk: config.persistToDisk !== false,
      alertOnSlowQuery: config.alertOnSlowQuery !== false,
      criticalThreshold: config.criticalThreshold || 5000, // 5 seconds
    };

    this.notificationService = new NotificationService();
    this.setupPeriodicReporting();
  }

  /**
   * Setup periodic reporting and cleanup
   */
  private setupPeriodicReporting(): void {
    // Report slow query statistics every hour
    cron.schedule('0 * * * *', () => {
      this.reportSlowQueryStats();
    });

    // Clean up old slow queries every 6 hours
    cron.schedule('0 */6 * * *', () => {
      this.cleanupOldSlowQueries();
    });

    // Daily slow query summary
    cron.schedule('0 0 * * *', () => {
      this.generateDailyReport();
    });
  }

  /**
   * Log slow query
   */
  async logSlowQuery(
    query: string,
    parameters: any[] | undefined,
    duration: number,
    options: {
      userId?: string;
      operation?: string;
      tableName?: string;
      rowCount?: number;
      context?: Record<string, any>;
    } = {}
  ): Promise<void> {
    const queryId = this.generateQueryId();

    // Create slow query entry
    const entry: SlowQueryEntry = {
      queryId,
      query: this.sanitizeQuery(query),
      parameters: parameters ? this.sanitizeParameters(parameters) : undefined,
      duration,
      threshold: this.config.threshold,
      timestamp: new Date(),
      userId: options.userId,
      operation: options.operation || this.detectOperation(query),
      tableName: options.tableName || this.extractTableName(query),
      rowCount: options.rowCount,
      context: options.context,
    };

    // Capture stack trace if enabled
    if (this.config.captureStackTrace) {
      entry.stackTrace = new Error().stack;
    }

    // Capture execution plan if enabled
    if (this.config.captureExecutionPlan) {
      entry.executionPlan = await this.captureExecutionPlan(query, parameters);
    }

    // Add to in-memory log
    this.slowQueries.push(entry);

    // Limit memory usage
    if (this.slowQueries.length > this.config.maxLogSize) {
      this.slowQueries.shift();
    }

    // Update query stats
    const signature = this.getQuerySignature(query);
    this.queryStats.set(signature, (this.queryStats.get(signature) || 0) + 1);

    // Log to application logger
    this.logToApplicationLogger(entry);

    // Persist to database if enabled
    if (this.config.persistToDisk) {
      await this.persistSlowQuery(entry);
    }

    // Alert if critical (fire and forget - don't block)
    if (this.config.alertOnSlowQuery && duration >= this.config.criticalThreshold) {
      this.alertCriticalSlowQuery(entry).catch(error => {
        AppLogger.error('Failed to alert critical slow query', error as Error);
      });
    }
  }

  /**
   * Log to application logger
   */
  private logToApplicationLogger(entry: SlowQueryEntry): void {
    const isCritical = entry.duration >= this.config.criticalThreshold;

    const logData = {
      queryId: entry.queryId,
      query: entry.query.substring(0, 200), // Truncate for logging
      duration: entry.duration,
      threshold: entry.threshold,
      operation: entry.operation,
      tableName: entry.tableName,
      rowCount: entry.rowCount,
      userId: entry.userId,
    };

    if (isCritical) {
      AppLogger.warn('CRITICAL slow query detected', logData);
    } else {
      AppLogger.warn('Slow query detected', logData);
    }
  }

  /**
   * Persist slow query to database
   */
  private async persistSlowQuery(entry: SlowQueryEntry): Promise<void> {
    try {
      await this.pool.query(
        `INSERT INTO slow_query_logs (
          query_id, query, parameters, duration, threshold,
          user_id, operation, table_name, row_count,
          execution_plan, stack_trace, context, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          entry.queryId,
          entry.query,
          entry.parameters ? JSON.stringify(entry.parameters) : null,
          entry.duration,
          entry.threshold,
          entry.userId || null,
          entry.operation,
          entry.tableName || null,
          entry.rowCount || null,
          entry.executionPlan ? JSON.stringify(entry.executionPlan) : null,
          entry.stackTrace || null,
          entry.context ? JSON.stringify(entry.context) : null,
          entry.timestamp,
        ]
      );
    } catch (error) {
      // Don't fail the application if logging fails
      AppLogger.error('Failed to persist slow query to database', error as Error, {
        queryId: entry.queryId,
      });
    }
  }

  /**
   * Alert on critical slow query
   */
  private async alertCriticalSlowQuery(entry: SlowQueryEntry): Promise<void> {
    AppLogger.logSecurityEvent('database.critical_slow_query', 'high', {
      queryId: entry.queryId,
      duration: entry.duration,
      threshold: this.config.criticalThreshold,
      operation: entry.operation,
      tableName: entry.tableName,
      userId: entry.userId,
    });

    // Check rate limiting - avoid spamming notifications for the same query
    const signature = this.getQuerySignature(entry.query);
    const lastNotification = this.notificationCooldown.get(signature) || 0;
    const cooldownPeriod = 15 * 60 * 1000; // 15 minutes

    if (Date.now() - lastNotification < cooldownPeriod) {
      AppLogger.debug('Skipping notification due to cooldown', {
        queryId: entry.queryId,
        signature: signature.substring(0, 50),
      });
      return;
    }

    // Update cooldown
    this.notificationCooldown.set(signature, Date.now());

    // Prepare notification content
    const subject = `⚠️ Critical Slow Query Alert - ${entry.duration}ms`;
    const message = `A critical slow database query was detected on ${new Date().toISOString()}`;

    const details = {
      'Query ID': entry.queryId,
      'Duration': `${entry.duration}ms`,
      'Threshold': `${this.config.criticalThreshold}ms`,
      'Slowdown': `${Math.round((entry.duration / this.config.criticalThreshold) * 100)}% over threshold`,
      'Operation': entry.operation,
      'Table': entry.tableName || 'Unknown',
      'User ID': entry.userId || 'System',
      'Row Count': entry.rowCount !== undefined ? entry.rowCount.toString() : 'N/A',
      'Query': entry.query.substring(0, 200) + (entry.query.length > 200 ? '...' : ''),
      'Timestamp': entry.timestamp.toISOString(),
    };

    // Add execution plan summary if available
    if (entry.executionPlan) {
      const plan = Array.isArray(entry.executionPlan) ? entry.executionPlan[0] : entry.executionPlan;
      if (plan?.Plan) {
        details['Execution Cost'] = plan.Plan['Total Cost']?.toString() || 'N/A';
        details['Execution Time'] = plan['Execution Time']?.toString() + 'ms' || 'N/A';
      }
    }

    // Add context if available
    if (entry.context) {
      Object.entries(entry.context).forEach(([key, value]) => {
        details[`Context: ${key}`] = String(value);
      });
    }

    // Send notification (fire and forget - don't block)
    this.notificationService.sendAll(
      { subject, message, details },
      { priority: 'high', deduplicationKey: `slow-query-${entry.queryId}` }
    ).catch(error => {
      AppLogger.error('Failed to send slow query notification', error as Error, {
        queryId: entry.queryId,
      });
    });
  }

  /**
   * Capture query execution plan
   */
  private async captureExecutionPlan(
    query: string,
    parameters?: any[]
  ): Promise<any | null> {
    try {
      // Only capture for SELECT queries to avoid side effects
      if (!query.trim().toUpperCase().startsWith('SELECT')) {
        return null;
      }

      const explainQuery = `EXPLAIN (FORMAT JSON, ANALYZE) ${query}`;
      const result = await this.pool.query(explainQuery, parameters);

      return result.rows[0]?.['QUERY PLAN'];
    } catch (error) {
      AppLogger.error('Failed to capture execution plan', error as Error);
      return null;
    }
  }

  /**
   * Get query signature for grouping similar queries
   */
  private getQuerySignature(query: string): string {
    // Replace parameter placeholders and values with generic placeholder
    let signature = query
      .replace(/\$\d+/g, '$N') // Replace $1, $2, etc. with $N
      .replace(/\b\d+\b/g, 'N') // Replace numeric literals
      .replace(/'[^']*'/g, "'S'") // Replace string literals
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();

    return signature;
  }

  /**
   * Detect operation type
   */
  private detectOperation(query: string): string {
    const normalized = query.trim().toUpperCase();
    const firstWord = normalized.split(/\s+/)[0];
    return firstWord || 'UNKNOWN';
  }

  /**
   * Extract table name from query
   */
  private extractTableName(query: string): string | undefined {
    const normalized = query.trim().toLowerCase();

    const patterns = [
      /from\s+([a-z_][a-z0-9_]*)/i,
      /insert\s+into\s+([a-z_][a-z0-9_]*)/i,
      /update\s+([a-z_][a-z0-9_]*)/i,
      /delete\s+from\s+([a-z_][a-z0-9_]*)/i,
    ];

    for (const pattern of patterns) {
      const match = normalized.match(pattern);
      if (match) return match[1];
    }

    return undefined;
  }

  /**
   * Sanitize query for logging
   */
  private sanitizeQuery(query: string): string {
    let sanitized = query.replace(/password\s*=\s*'[^']*'/gi, "password = '[REDACTED]'");
    sanitized = sanitized.replace(/password_hash\s*=\s*'[^']*'/gi, "password_hash = '[REDACTED]'");
    sanitized = sanitized.replace(/token\s*=\s*'[^']*'/gi, "token = '[REDACTED]'");

    // Limit length
    if (sanitized.length > 2000) {
      sanitized = sanitized.substring(0, 2000) + '... [TRUNCATED]';
    }

    return sanitized;
  }

  /**
   * Sanitize parameters for logging
   */
  private sanitizeParameters(parameters: any[]): any[] {
    return parameters.map((param) => {
      if (typeof param === 'string' && param.length > 100) {
        return param.substring(0, 100) + '... [TRUNCATED]';
      }
      return param;
    });
  }

  /**
   * Generate unique query ID
   */
  private generateQueryId(): string {
    return `slow_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  }

  /**
   * Report slow query statistics
   */
  private reportSlowQueryStats(): void {
    const stats = this.getStatistics();

    AppLogger.info('Slow query statistics', {
      totalSlowQueries: stats.totalSlowQueries,
      averageDuration: stats.averageDuration.toFixed(2),
      slowestDuration: stats.slowestQuery?.duration,
      byOperation: stats.byOperation,
      topTables: Object.entries(stats.byTable)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .reduce((obj, [k, v]) => ({ ...obj, [k]: v }), {}),
    });
  }

  /**
   * Generate daily report
   */
  private async generateDailyReport(): Promise<void> {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    yesterday.setHours(0, 0, 0, 0);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    try {
      const result = await this.pool.query(
        `SELECT
          COUNT(*) as total,
          AVG(duration) as avg_duration,
          MAX(duration) as max_duration,
          operation,
          table_name
        FROM slow_query_logs
        WHERE created_at >= $1 AND created_at < $2
        GROUP BY operation, table_name
        ORDER BY avg_duration DESC
        LIMIT 10`,
        [yesterday, today]
      );

      AppLogger.info('Daily slow query report', {
        date: yesterday.toISOString().split('T')[0],
        summary: result.rows,
      });
    } catch (error) {
      AppLogger.error('Failed to generate daily slow query report', error as Error);
    }
  }

  /**
   * Clean up old slow queries from memory
   */
  private cleanupOldSlowQueries(): void {
    const cutoffTime = Date.now() - 24 * 60 * 60 * 1000; // 24 hours ago

    const before = this.slowQueries.length;
    this.slowQueries = this.slowQueries.filter((q) => q.timestamp.getTime() > cutoffTime);
    const after = this.slowQueries.length;

    AppLogger.debug('Cleaned up old slow queries from memory', {
      removed: before - after,
      remaining: after,
    });
  }

  /**
   * Get slow query statistics
   */
  getStatistics(): SlowQueryStats {
    if (this.slowQueries.length === 0) {
      return {
        totalSlowQueries: 0,
        slowestQuery: null,
        averageDuration: 0,
        byOperation: {},
        byTable: {},
        topSlowQueries: [],
      };
    }

    const totalDuration = this.slowQueries.reduce((sum, q) => sum + q.duration, 0);
    const slowestQuery = this.slowQueries.reduce((slowest, q) =>
      q.duration > slowest.duration ? q : slowest
    );

    const byOperation: Record<string, number> = {};
    const byTable: Record<string, number> = {};

    for (const query of this.slowQueries) {
      byOperation[query.operation] = (byOperation[query.operation] || 0) + 1;
      if (query.tableName) {
        byTable[query.tableName] = (byTable[query.tableName] || 0) + 1;
      }
    }

    const topSlowQueries = [...this.slowQueries]
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 10);

    return {
      totalSlowQueries: this.slowQueries.length,
      slowestQuery,
      averageDuration: totalDuration / this.slowQueries.length,
      byOperation,
      byTable,
      topSlowQueries,
    };
  }

  /**
   * Get slow queries
   */
  getSlowQueries(limit: number = 20): SlowQueryEntry[] {
    return this.slowQueries.slice(-limit).reverse();
  }

  /**
   * Get queries by table
   */
  getQueriesByTable(tableName: string, limit: number = 10): SlowQueryEntry[] {
    return this.slowQueries
      .filter((q) => q.tableName === tableName)
      .slice(-limit)
      .reverse();
  }

  /**
   * Get queries by operation
   */
  getQueriesByOperation(operation: string, limit: number = 10): SlowQueryEntry[] {
    return this.slowQueries
      .filter((q) => q.operation.toUpperCase() === operation.toUpperCase())
      .slice(-limit)
      .reverse();
  }

  /**
   * Get most frequent slow queries
   */
  getMostFrequentSlowQueries(limit: number = 10): Array<{ signature: string; count: number }> {
    return Array.from(this.queryStats.entries())
      .map(([signature, count]) => ({ signature, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  /**
   * Clean up old database records
   */
  async cleanupOldDatabaseRecords(retentionDays: number = 30): Promise<number> {
    try {
      const result = await this.pool.query(
        `DELETE FROM slow_query_logs
         WHERE created_at < NOW() - INTERVAL '${retentionDays} days'`
      );

      const deletedCount = result.rowCount || 0;

      AppLogger.info('Cleaned up old slow query logs from database', {
        retentionDays,
        deletedCount,
      });

      return deletedCount;
    } catch (error) {
      AppLogger.error('Failed to cleanup old slow query logs', error as Error);
      return 0;
    }
  }

  /**
   * Clear in-memory statistics
   */
  clearStats(): void {
    this.slowQueries = [];
    this.queryStats.clear();
    AppLogger.info('Slow query statistics cleared');
  }
}

/**
 * Singleton instance
 */
let slowQueryLogger: SlowQueryLoggerService | null = null;

export function initializeSlowQueryLogger(
  pool: Pool,
  config?: Partial<SlowQueryConfig>
): SlowQueryLoggerService {
  slowQueryLogger = new SlowQueryLoggerService(pool, config);
  return slowQueryLogger;
}

export function getSlowQueryLogger(): SlowQueryLoggerService {
  if (!slowQueryLogger) {
    throw new Error('SlowQueryLoggerService not initialized. Call initializeSlowQueryLogger first.');
  }
  return slowQueryLogger;
}
