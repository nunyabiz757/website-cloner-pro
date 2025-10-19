/**
 * Audit Logger Utility
 *
 * Comprehensive audit logging for tracking important system events with:
 * - Database persistence
 * - Error handling and retry logic
 * - Fallback to console logging
 * - Performance tracking
 */

import { getPool } from '../config/database.config.js';
import type { Pool } from 'pg';

export interface AuditLogParams {
    userId: string;
    action: string;
    resourceType: string;
    resourceId: string;
    details?: Record<string, any>;
    ipAddress?: string;
    userAgent?: string;
    requestMethod?: string;
    requestPath?: string;
    statusCode?: number;
    errorMessage?: string;
    durationMs?: number;
    severity?: 'debug' | 'info' | 'warning' | 'error' | 'critical';
    category?: 'general' | 'authentication' | 'authorization' | 'data_access' |
               'data_modification' | 'configuration' | 'deployment' | 'export' |
               'payment' | 'security' | 'compliance';
}

export interface AuditLogOptions {
    retryAttempts?: number;
    retryDelayMs?: number;
    fallbackToConsole?: boolean;
    skipDatabase?: boolean;
}

// Default options
const DEFAULT_OPTIONS: Required<AuditLogOptions> = {
    retryAttempts: 3,
    retryDelayMs: 1000,
    fallbackToConsole: true,
    skipDatabase: false,
};

// In-memory queue for failed logs (will retry on next successful connection)
const failedLogsQueue: AuditLogParams[] = [];
const MAX_QUEUE_SIZE = 1000;

/**
 * Log an audit event with database persistence
 */
export async function logAuditEvent(
    params: AuditLogParams,
    options: AuditLogOptions = {}
): Promise<void> {
    const opts = { ...DEFAULT_OPTIONS, ...options };
    const timestamp = new Date().toISOString();

    // Always log to console first for immediate visibility
    if (opts.fallbackToConsole) {
        console.log('[AUDIT]', {
            timestamp,
            ...params
        });
    }

    // Skip database if requested (useful for testing or when DB is down)
    if (opts.skipDatabase) {
        return;
    }

    // Try to log to database with retry logic
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= opts.retryAttempts; attempt++) {
        try {
            await logToDatabase(params);

            // Success! Try to flush any queued logs
            if (failedLogsQueue.length > 0) {
                await flushFailedLogsQueue();
            }

            return;
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));

            // If this is not the last attempt, wait before retrying
            if (attempt < opts.retryAttempts) {
                await sleep(opts.retryDelayMs * (attempt + 1)); // Exponential backoff
            }
        }
    }

    // All retries failed - add to queue for later retry
    if (failedLogsQueue.length < MAX_QUEUE_SIZE) {
        failedLogsQueue.push(params);
        console.warn(
            `[AUDIT] Failed to log to database after ${opts.retryAttempts + 1} attempts. ` +
            `Queued for later retry. Queue size: ${failedLogsQueue.length}`,
            lastError
        );
    } else {
        console.error(
            `[AUDIT] Failed logs queue is full (${MAX_QUEUE_SIZE}). ` +
            `Dropping audit log:`,
            params,
            lastError
        );
    }
}

/**
 * Log to database
 */
async function logToDatabase(params: AuditLogParams): Promise<void> {
    const pool = getPool();

    await pool.query(
        `INSERT INTO audit_logs (
            user_id, action, resource_type, resource_id, details,
            ip_address, user_agent, request_method, request_path,
            status_code, error_message, duration_ms, severity, category
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
            params.userId || null,
            params.action,
            params.resourceType,
            params.resourceId,
            JSON.stringify(params.details || {}),
            params.ipAddress || null,
            params.userAgent || null,
            params.requestMethod || null,
            params.requestPath || null,
            params.statusCode || null,
            params.errorMessage || null,
            params.durationMs || null,
            params.severity || 'info',
            params.category || 'general'
        ]
    );
}

/**
 * Flush failed logs queue
 */
async function flushFailedLogsQueue(): Promise<void> {
    if (failedLogsQueue.length === 0) {
        return;
    }

    console.log(`[AUDIT] Attempting to flush ${failedLogsQueue.length} queued logs...`);

    const logsToRetry = failedLogsQueue.splice(0, 100); // Process in batches of 100
    let successCount = 0;
    let failCount = 0;

    for (const log of logsToRetry) {
        try {
            await logToDatabase(log);
            successCount++;
        } catch (error) {
            failCount++;
            // Re-queue failed logs (up to queue size limit)
            if (failedLogsQueue.length < MAX_QUEUE_SIZE) {
                failedLogsQueue.push(log);
            }
        }
    }

    console.log(
        `[AUDIT] Flushed queue: ${successCount} succeeded, ${failCount} failed. ` +
        `Remaining queue size: ${failedLogsQueue.length}`
    );
}

/**
 * Sleep utility for retry delays
 */
function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Batch log multiple audit events (more efficient for bulk operations)
 */
export async function logAuditEventBatch(
    events: AuditLogParams[],
    options: AuditLogOptions = {}
): Promise<void> {
    if (events.length === 0) {
        return;
    }

    const opts = { ...DEFAULT_OPTIONS, ...options };

    // Log to console if enabled
    if (opts.fallbackToConsole) {
        console.log(`[AUDIT] Batch logging ${events.length} events`);
    }

    // Skip database if requested
    if (opts.skipDatabase) {
        return;
    }

    try {
        const pool = getPool();

        // Use transaction for batch insert
        const client = await pool.connect();

        try {
            await client.query('BEGIN');

            for (const params of events) {
                await client.query(
                    `INSERT INTO audit_logs (
                        user_id, action, resource_type, resource_id, details,
                        ip_address, user_agent, request_method, request_path,
                        status_code, error_message, duration_ms, severity, category
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
                    [
                        params.userId || null,
                        params.action,
                        params.resourceType,
                        params.resourceId,
                        JSON.stringify(params.details || {}),
                        params.ipAddress || null,
                        params.userAgent || null,
                        params.requestMethod || null,
                        params.requestPath || null,
                        params.statusCode || null,
                        params.errorMessage || null,
                        params.durationMs || null,
                        params.severity || 'info',
                        params.category || 'general'
                    ]
                );
            }

            await client.query('COMMIT');

            if (opts.fallbackToConsole) {
                console.log(`[AUDIT] Successfully batch logged ${events.length} events`);
            }
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error(`[AUDIT] Batch logging failed:`, error);

        // Fall back to individual logging
        for (const event of events) {
            await logAuditEvent(event, { ...options, retryAttempts: 0 });
        }
    }
}

/**
 * Query audit logs with filters
 */
export async function queryAuditLogs(filters: {
    userId?: string;
    action?: string;
    resourceType?: string;
    resourceId?: string;
    severity?: string;
    category?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
}): Promise<any[]> {
    const pool = getPool();

    let query = 'SELECT * FROM audit_logs WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (filters.userId) {
        query += ` AND user_id = $${paramIndex++}`;
        params.push(filters.userId);
    }

    if (filters.action) {
        query += ` AND action = $${paramIndex++}`;
        params.push(filters.action);
    }

    if (filters.resourceType) {
        query += ` AND resource_type = $${paramIndex++}`;
        params.push(filters.resourceType);
    }

    if (filters.resourceId) {
        query += ` AND resource_id = $${paramIndex++}`;
        params.push(filters.resourceId);
    }

    if (filters.severity) {
        query += ` AND severity = $${paramIndex++}`;
        params.push(filters.severity);
    }

    if (filters.category) {
        query += ` AND category = $${paramIndex++}`;
        params.push(filters.category);
    }

    if (filters.startDate) {
        query += ` AND created_at >= $${paramIndex++}`;
        params.push(filters.startDate);
    }

    if (filters.endDate) {
        query += ` AND created_at <= $${paramIndex++}`;
        params.push(filters.endDate);
    }

    query += ' ORDER BY created_at DESC';

    if (filters.limit) {
        query += ` LIMIT $${paramIndex++}`;
        params.push(filters.limit);
    }

    if (filters.offset) {
        query += ` OFFSET $${paramIndex++}`;
        params.push(filters.offset);
    }

    const result = await pool.query(query, params);
    return result.rows;
}

/**
 * Get audit statistics
 */
export async function getAuditStatistics(filters: {
    userId?: string;
    startDate?: Date;
    endDate?: Date;
}): Promise<any> {
    const pool = getPool();

    let query = 'SELECT * FROM audit_statistics WHERE 1=1';
    const params: any[] = [];
    let paramIndex = 1;

    if (filters.userId) {
        query += ` AND user_id = $${paramIndex++}`;
        params.push(filters.userId);
    }

    if (filters.startDate) {
        query += ` AND stat_date >= $${paramIndex++}`;
        params.push(filters.startDate);
    }

    if (filters.endDate) {
        query += ` AND stat_date <= $${paramIndex++}`;
        params.push(filters.endDate);
    }

    query += ' ORDER BY stat_date DESC';

    const result = await pool.query(query, params);
    return result.rows;
}

/**
 * Get failed logs queue size (for monitoring)
 */
export function getFailedLogsQueueSize(): number {
    return failedLogsQueue.length;
}

/**
 * Manually trigger queue flush (useful for shutdown or testing)
 */
export async function flushQueue(): Promise<void> {
    await flushFailedLogsQueue();
}
