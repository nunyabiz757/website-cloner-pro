import { Pool } from 'pg';
import { AppLogger } from './logger.service.js';
import crypto from 'crypto';

/**
 * Database Audit Logging Service
 * Specialized service for auditing database operations
 */

export interface DatabaseAuditEntry {
  auditId: string;
  userId?: string;
  operation: DatabaseOperation;
  tableName?: string;
  recordId?: string;
  query: string;
  parameters?: any[];
  rowCount: number;
  duration: number;
  success: boolean;
  error?: string;
  ipAddress?: string;
  userAgent?: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export enum DatabaseOperation {
  SELECT = 'SELECT',
  INSERT = 'INSERT',
  UPDATE = 'UPDATE',
  DELETE = 'DELETE',
  TRANSACTION = 'TRANSACTION',
  DDL = 'DDL', // CREATE, ALTER, DROP
  GRANT = 'GRANT',
  REVOKE = 'REVOKE',
  OTHER = 'OTHER',
}

export interface AuditQueryOptions {
  userId?: string;
  operation?: DatabaseOperation;
  tableName?: string;
  ipAddress?: string;
  userAgent?: string;
  metadata?: Record<string, any>;
}

export interface AuditReport {
  totalQueries: number;
  successfulQueries: number;
  failedQueries: number;
  byOperation: Record<DatabaseOperation, number>;
  byTable: Record<string, number>;
  byUser: Record<string, number>;
  averageDuration: number;
  slowestQueries: DatabaseAuditEntry[];
  recentFailures: DatabaseAuditEntry[];
}

export class DatabaseAuditService {
  private pool: Pool;
  private auditBuffer: DatabaseAuditEntry[] = [];
  private maxBufferSize: number = 100;
  private flushInterval: NodeJS.Timeout | null = null;
  private enabled: boolean = true;

  constructor(pool: Pool, options: { enabled?: boolean; bufferSize?: number } = {}) {
    this.pool = pool;
    this.enabled = options.enabled !== false;
    this.maxBufferSize = options.bufferSize || 100;

    if (this.enabled) {
      this.startAutoFlush();
    }
  }

  /**
   * Start auto-flush of audit buffer
   */
  private startAutoFlush(): void {
    // Flush buffer every 30 seconds
    this.flushInterval = setInterval(() => {
      this.flushAuditBuffer().catch((err) => {
        AppLogger.error('Failed to flush audit buffer', err);
      });
    }, 30000);
  }

  /**
   * Stop auto-flush
   */
  stopAutoFlush(): void {
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }
  }

  /**
   * Log database operation
   */
  async logDatabaseOperation(
    query: string,
    parameters: any[] | undefined,
    rowCount: number,
    duration: number,
    success: boolean,
    options: AuditQueryOptions = {}
  ): Promise<void> {
    if (!this.enabled) return;

    const operation = options.operation || this.detectOperation(query);
    const tableName = options.tableName || this.extractTableName(query, operation);

    const auditEntry: DatabaseAuditEntry = {
      auditId: this.generateAuditId(),
      userId: options.userId,
      operation,
      tableName,
      query: this.sanitizeQueryForAudit(query),
      parameters: parameters ? this.sanitizeParameters(parameters) : undefined,
      rowCount,
      duration,
      success,
      ipAddress: options.ipAddress,
      userAgent: options.userAgent,
      timestamp: new Date(),
      metadata: options.metadata,
    };

    // Add to buffer
    this.auditBuffer.push(auditEntry);

    // Flush if buffer is full
    if (this.auditBuffer.length >= this.maxBufferSize) {
      await this.flushAuditBuffer();
    }

    // Log security events for sensitive operations
    if (this.isSensitiveOperation(operation, query)) {
      AppLogger.logSecurityEvent(`database.${operation.toLowerCase()}`, 'medium', {
        auditId: auditEntry.auditId,
        tableName,
        userId: options.userId,
        success,
      });
    }
  }

  /**
   * Log failed database operation
   */
  async logFailedOperation(
    query: string,
    parameters: any[] | undefined,
    error: Error,
    duration: number,
    options: AuditQueryOptions = {}
  ): Promise<void> {
    if (!this.enabled) return;

    const operation = options.operation || this.detectOperation(query);
    const tableName = options.tableName || this.extractTableName(query, operation);

    const auditEntry: DatabaseAuditEntry = {
      auditId: this.generateAuditId(),
      userId: options.userId,
      operation,
      tableName,
      query: this.sanitizeQueryForAudit(query),
      parameters: parameters ? this.sanitizeParameters(parameters) : undefined,
      rowCount: 0,
      duration,
      success: false,
      error: error.message,
      ipAddress: options.ipAddress,
      userAgent: options.userAgent,
      timestamp: new Date(),
      metadata: options.metadata,
    };

    this.auditBuffer.push(auditEntry);

    // Log security event for failed operations
    AppLogger.logSecurityEvent('database.operation_failed', 'medium', {
      auditId: auditEntry.auditId,
      operation,
      tableName,
      userId: options.userId,
      error: error.message,
    });

    // Immediate flush for failures
    if (this.auditBuffer.length >= this.maxBufferSize) {
      await this.flushAuditBuffer();
    }
  }

  /**
   * Flush audit buffer to database
   */
  private async flushAuditBuffer(): Promise<void> {
    if (this.auditBuffer.length === 0) return;

    const entries = [...this.auditBuffer];
    this.auditBuffer = [];

    try {
      // Batch insert audit entries
      const values: any[] = [];
      const placeholders: string[] = [];
      let paramIndex = 1;

      for (const entry of entries) {
        placeholders.push(
          `($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++})`
        );

        values.push(
          entry.auditId,
          entry.userId || null,
          entry.operation,
          entry.tableName || null,
          entry.recordId || null,
          entry.query,
          entry.parameters ? JSON.stringify(entry.parameters) : null,
          entry.rowCount,
          entry.duration,
          entry.success,
          entry.error || null,
          entry.timestamp
        );
      }

      const query = `
        INSERT INTO database_audit_logs (
          audit_id, user_id, operation, table_name, record_id,
          query, parameters, row_count, duration, success, error, created_at
        ) VALUES ${placeholders.join(', ')}
      `;

      await this.pool.query(query, values);

      AppLogger.debug('Flushed database audit buffer', {
        entriesCount: entries.length,
      });
    } catch (error) {
      // Put entries back in buffer if flush fails
      this.auditBuffer.unshift(...entries);

      AppLogger.error('Failed to flush database audit buffer', error as Error, {
        entriesCount: entries.length,
        bufferSize: this.auditBuffer.length,
      });
    }
  }

  /**
   * Detect operation type from query
   */
  private detectOperation(query: string): DatabaseOperation {
    const normalizedQuery = query.trim().toUpperCase();

    if (normalizedQuery.startsWith('SELECT')) return DatabaseOperation.SELECT;
    if (normalizedQuery.startsWith('INSERT')) return DatabaseOperation.INSERT;
    if (normalizedQuery.startsWith('UPDATE')) return DatabaseOperation.UPDATE;
    if (normalizedQuery.startsWith('DELETE')) return DatabaseOperation.DELETE;
    if (normalizedQuery.startsWith('BEGIN') || normalizedQuery.startsWith('COMMIT')) {
      return DatabaseOperation.TRANSACTION;
    }
    if (
      normalizedQuery.startsWith('CREATE') ||
      normalizedQuery.startsWith('ALTER') ||
      normalizedQuery.startsWith('DROP')
    ) {
      return DatabaseOperation.DDL;
    }
    if (normalizedQuery.startsWith('GRANT')) return DatabaseOperation.GRANT;
    if (normalizedQuery.startsWith('REVOKE')) return DatabaseOperation.REVOKE;

    return DatabaseOperation.OTHER;
  }

  /**
   * Extract table name from query
   */
  private extractTableName(query: string, operation: DatabaseOperation): string | undefined {
    const normalizedQuery = query.trim().toLowerCase();

    try {
      switch (operation) {
        case DatabaseOperation.SELECT: {
          const fromMatch = normalizedQuery.match(/from\s+([a-z_][a-z0-9_]*)/i);
          return fromMatch ? fromMatch[1] : undefined;
        }
        case DatabaseOperation.INSERT: {
          const intoMatch = normalizedQuery.match(/insert\s+into\s+([a-z_][a-z0-9_]*)/i);
          return intoMatch ? intoMatch[1] : undefined;
        }
        case DatabaseOperation.UPDATE: {
          const updateMatch = normalizedQuery.match(/update\s+([a-z_][a-z0-9_]*)/i);
          return updateMatch ? updateMatch[1] : undefined;
        }
        case DatabaseOperation.DELETE: {
          const deleteMatch = normalizedQuery.match(/delete\s+from\s+([a-z_][a-z0-9_]*)/i);
          return deleteMatch ? deleteMatch[1] : undefined;
        }
        case DatabaseOperation.DDL: {
          const ddlMatch = normalizedQuery.match(
            /(?:create|alter|drop)\s+table\s+([a-z_][a-z0-9_]*)/i
          );
          return ddlMatch ? ddlMatch[1] : undefined;
        }
        default:
          return undefined;
      }
    } catch (error) {
      return undefined;
    }
  }

  /**
   * Check if operation is sensitive
   */
  private isSensitiveOperation(operation: DatabaseOperation, query: string): boolean {
    // All DML operations on sensitive tables
    const sensitiveTables = ['users', 'api_keys', 'audit_logs', 'remember_me_tokens'];
    const normalizedQuery = query.toLowerCase();

    const isSensitiveTable = sensitiveTables.some((table) => normalizedQuery.includes(table));

    return (
      operation === DatabaseOperation.DELETE ||
      operation === DatabaseOperation.UPDATE ||
      operation === DatabaseOperation.DDL ||
      operation === DatabaseOperation.GRANT ||
      operation === DatabaseOperation.REVOKE ||
      isSensitiveTable
    );
  }

  /**
   * Sanitize query for audit logging
   */
  private sanitizeQueryForAudit(query: string): string {
    // Remove sensitive data from queries
    let sanitized = query.replace(/password\s*=\s*'[^']*'/gi, "password = '[REDACTED]'");
    sanitized = sanitized.replace(/password_hash\s*=\s*'[^']*'/gi, "password_hash = '[REDACTED]'");
    sanitized = sanitized.replace(/token\s*=\s*'[^']*'/gi, "token = '[REDACTED]'");
    sanitized = sanitized.replace(/api_key\s*=\s*'[^']*'/gi, "api_key = '[REDACTED]'");

    // Limit query length
    if (sanitized.length > 1000) {
      sanitized = sanitized.substring(0, 1000) + '... [TRUNCATED]';
    }

    return sanitized;
  }

  /**
   * Sanitize parameters for audit logging
   */
  private sanitizeParameters(parameters: any[]): any[] {
    return parameters.map((param, index) => {
      // Sanitize potential sensitive values
      if (typeof param === 'string') {
        // If it looks like a hash or token, redact it
        if (param.length > 30 && /^[a-f0-9]+$/i.test(param)) {
          return '[REDACTED_HASH]';
        }
        // Limit string length
        if (param.length > 100) {
          return param.substring(0, 100) + '... [TRUNCATED]';
        }
      }

      return param;
    });
  }

  /**
   * Generate unique audit ID
   */
  private generateAuditId(): string {
    return `audit_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  }

  /**
   * Get audit report for date range
   */
  async getAuditReport(startDate: Date, endDate: Date): Promise<AuditReport> {
    const query = `
      SELECT
        audit_id, user_id, operation, table_name, row_count,
        duration, success, error, created_at
      FROM database_audit_logs
      WHERE created_at BETWEEN $1 AND $2
      ORDER BY created_at DESC
    `;

    const result = await this.pool.query(query, [startDate, endDate]);
    const entries = result.rows;

    const totalQueries = entries.length;
    const successfulQueries = entries.filter((e: any) => e.success).length;
    const failedQueries = totalQueries - successfulQueries;

    const byOperation: Record<DatabaseOperation, number> = {} as any;
    const byTable: Record<string, number> = {};
    const byUser: Record<string, number> = {};

    let totalDuration = 0;

    for (const entry of entries) {
      // By operation
      byOperation[entry.operation as DatabaseOperation] =
        (byOperation[entry.operation as DatabaseOperation] || 0) + 1;

      // By table
      if (entry.table_name) {
        byTable[entry.table_name] = (byTable[entry.table_name] || 0) + 1;
      }

      // By user
      if (entry.user_id) {
        byUser[entry.user_id] = (byUser[entry.user_id] || 0) + 1;
      }

      totalDuration += entry.duration;
    }

    // Get slowest queries
    const slowestQueries = entries
      .sort((a: any, b: any) => b.duration - a.duration)
      .slice(0, 10)
      .map((e: any) => ({
        auditId: e.audit_id,
        operation: e.operation,
        tableName: e.table_name,
        duration: e.duration,
        rowCount: e.row_count,
        success: e.success,
        timestamp: e.created_at,
      }));

    // Get recent failures
    const recentFailures = entries
      .filter((e: any) => !e.success)
      .slice(0, 10)
      .map((e: any) => ({
        auditId: e.audit_id,
        operation: e.operation,
        tableName: e.table_name,
        error: e.error,
        duration: e.duration,
        timestamp: e.created_at,
      }));

    return {
      totalQueries,
      successfulQueries,
      failedQueries,
      byOperation,
      byTable,
      byUser,
      averageDuration: totalQueries > 0 ? totalDuration / totalQueries : 0,
      slowestQueries: slowestQueries as any,
      recentFailures: recentFailures as any,
    };
  }

  /**
   * Get audit entries by user
   */
  async getAuditEntriesByUser(userId: string, limit: number = 100): Promise<DatabaseAuditEntry[]> {
    const query = `
      SELECT *
      FROM database_audit_logs
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `;

    const result = await this.pool.query(query, [userId, limit]);
    return result.rows as DatabaseAuditEntry[];
  }

  /**
   * Get failed operations
   */
  async getFailedOperations(limit: number = 50): Promise<DatabaseAuditEntry[]> {
    const query = `
      SELECT *
      FROM database_audit_logs
      WHERE success = FALSE
      ORDER BY created_at DESC
      LIMIT $1
    `;

    const result = await this.pool.query(query, [limit]);
    return result.rows as DatabaseAuditEntry[];
  }

  /**
   * Clean up old audit logs
   */
  async cleanupOldAuditLogs(retentionDays: number = 90): Promise<number> {
    const query = `
      DELETE FROM database_audit_logs
      WHERE created_at < NOW() - INTERVAL '${retentionDays} days'
    `;

    const result = await this.pool.query(query);
    const deletedCount = result.rowCount || 0;

    AppLogger.info('Cleaned up old database audit logs', {
      retentionDays,
      deletedCount,
    });

    return deletedCount;
  }

  /**
   * Shutdown - flush remaining buffer
   */
  async shutdown(): Promise<void> {
    this.stopAutoFlush();
    await this.flushAuditBuffer();
    AppLogger.info('Database audit service shut down');
  }
}

/**
 * Singleton instance
 */
let dbAuditService: DatabaseAuditService | null = null;

export function initializeDatabaseAudit(pool: Pool, options?: { enabled?: boolean; bufferSize?: number }): DatabaseAuditService {
  dbAuditService = new DatabaseAuditService(pool, options);
  return dbAuditService;
}

export function getDatabaseAudit(): DatabaseAuditService {
  if (!dbAuditService) {
    throw new Error('DatabaseAuditService not initialized. Call initializeDatabaseAudit first.');
  }
  return dbAuditService;
}
