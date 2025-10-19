import { Pool } from 'pg';
import { getPool } from '../config/database.js';
import { getRedisCacheService } from './redis-cache.service.js';
import type { RedisCacheService } from './redis-cache.service.js';
import { logAuditEvent } from '../utils/audit-logger.js';

// =====================================================================================
// Types and Interfaces
// =====================================================================================

export interface ScheduledOperation {
    id: string;
    user_id: string;
    operation_type: 'clone' | 'paste' | 'export' | 'bulk_operation' | 'import';
    resource_id?: string;
    resource_type?: string;
    scheduled_for: Date;
    timezone: string;
    repeat_interval: 'once' | 'daily' | 'weekly' | 'monthly' | 'custom';
    repeat_config: Record<string, any>;
    repeat_until?: Date;
    max_occurrences?: number;
    status: 'scheduled' | 'running' | 'completed' | 'failed' | 'cancelled' | 'paused';
    operation_config: Record<string, any>;
    last_run_at?: Date;
    next_run_at?: Date;
    run_count: number;
    success_count: number;
    failure_count: number;
    notify_on_completion: boolean;
    notify_on_failure: boolean;
    notification_channels: string[];
    retry_on_failure: boolean;
    max_retries: number;
    retry_delay_minutes: number;
    metadata: Record<string, any>;
    created_at: Date;
    updated_at: Date;
}

export interface ScheduledOperationRun {
    id: string;
    scheduled_operation_id: string;
    run_number: number;
    status: 'running' | 'success' | 'failed' | 'cancelled';
    started_at: Date;
    completed_at?: Date;
    duration_ms?: number;
    result: Record<string, any>;
    error_message?: string;
    is_retry: boolean;
    retry_attempt: number;
    created_at: Date;
}

export interface CreateScheduledOperationParams {
    user_id: string;
    operation_type: 'clone' | 'paste' | 'export' | 'bulk_operation' | 'import';
    resource_id?: string;
    resource_type?: string;
    scheduled_for: Date;
    timezone?: string;
    repeat_interval?: 'once' | 'daily' | 'weekly' | 'monthly' | 'custom';
    repeat_config?: Record<string, any>;
    repeat_until?: Date;
    max_occurrences?: number;
    operation_config: Record<string, any>;
    notify_on_completion?: boolean;
    notify_on_failure?: boolean;
    notification_channels?: string[];
    retry_on_failure?: boolean;
    max_retries?: number;
    retry_delay_minutes?: number;
}

export interface UpdateScheduledOperationParams {
    scheduled_for?: Date;
    repeat_until?: Date;
    status?: 'scheduled' | 'paused' | 'cancelled';
    notify_on_completion?: boolean;
    notify_on_failure?: boolean;
}

// =====================================================================================
// Scheduling Service
// =====================================================================================

export class SchedulingService {
    private pool: Pool;
    private cache: RedisCacheService;

    constructor() {
        this.pool = getPool();
        this.cache = getRedisCacheService();
    }

    // =====================================================================================
    // Scheduled Operation Management
    // =====================================================================================

    /**
     * Create scheduled operation
     */
    async createScheduledOperation(params: CreateScheduledOperationParams): Promise<ScheduledOperation> {
        const result = await this.pool.query<ScheduledOperation>(
            `INSERT INTO scheduled_operations (
                user_id, operation_type, resource_id, resource_type,
                scheduled_for, timezone, repeat_interval, repeat_config,
                repeat_until, max_occurrences, operation_config,
                next_run_at, notify_on_completion, notify_on_failure,
                notification_channels, retry_on_failure, max_retries, retry_delay_minutes
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
            RETURNING *`,
            [
                params.user_id,
                params.operation_type,
                params.resource_id,
                params.resource_type,
                params.scheduled_for,
                params.timezone || 'UTC',
                params.repeat_interval || 'once',
                JSON.stringify(params.repeat_config || {}),
                params.repeat_until,
                params.max_occurrences,
                JSON.stringify(params.operation_config),
                params.scheduled_for, // Initial next_run_at
                params.notify_on_completion !== undefined ? params.notify_on_completion : false,
                params.notify_on_failure !== undefined ? params.notify_on_failure : true,
                JSON.stringify(params.notification_channels || ['email']),
                params.retry_on_failure !== undefined ? params.retry_on_failure : true,
                params.max_retries || 3,
                params.retry_delay_minutes || 5
            ]
        );

        const operation = result.rows[0];

        // Audit log
        await logAuditEvent({
            userId: params.user_id,
            action: 'scheduled_operation.created',
            resourceType: 'scheduled_operation',
            resourceId: operation.id,
            details: {
                operation_type: params.operation_type,
                scheduled_for: params.scheduled_for,
                repeat_interval: params.repeat_interval
            }
        });

        return this.formatOperation(operation);
    }

    /**
     * Get scheduled operation by ID
     */
    async getScheduledOperationById(operationId: string, userId: string): Promise<ScheduledOperation | null> {
        const result = await this.pool.query<ScheduledOperation>(
            'SELECT * FROM scheduled_operations WHERE id = $1 AND user_id = $2',
            [operationId, userId]
        );

        if (result.rows.length === 0) {
            return null;
        }

        return this.formatOperation(result.rows[0]);
    }

    /**
     * Get user's scheduled operations
     */
    async getUserScheduledOperations(
        userId: string,
        status?: string,
        limit: number = 50,
        offset: number = 0
    ): Promise<ScheduledOperation[]> {
        let query = 'SELECT * FROM scheduled_operations WHERE user_id = $1';
        const params: any[] = [userId];
        let paramIndex = 2;

        if (status) {
            query += ` AND status = $${paramIndex}`;
            params.push(status);
            paramIndex++;
        }

        query += ` ORDER BY next_run_at ASC NULLS LAST LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
        params.push(limit, offset);

        const result = await this.pool.query<ScheduledOperation>(query, params);

        return result.rows.map(row => this.formatOperation(row));
    }

    /**
     * Update scheduled operation
     */
    async updateScheduledOperation(
        operationId: string,
        userId: string,
        params: UpdateScheduledOperationParams
    ): Promise<ScheduledOperation> {
        const updates: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        if (params.scheduled_for !== undefined) {
            updates.push(`scheduled_for = $${paramIndex}`);
            updates.push(`next_run_at = $${paramIndex}`);
            values.push(params.scheduled_for);
            paramIndex++;
        }

        if (params.repeat_until !== undefined) {
            updates.push(`repeat_until = $${paramIndex}`);
            values.push(params.repeat_until);
            paramIndex++;
        }

        if (params.status !== undefined) {
            updates.push(`status = $${paramIndex}`);
            values.push(params.status);
            paramIndex++;
        }

        if (params.notify_on_completion !== undefined) {
            updates.push(`notify_on_completion = $${paramIndex}`);
            values.push(params.notify_on_completion);
            paramIndex++;
        }

        if (params.notify_on_failure !== undefined) {
            updates.push(`notify_on_failure = $${paramIndex}`);
            values.push(params.notify_on_failure);
            paramIndex++;
        }

        if (updates.length === 0) {
            throw new Error('No fields to update');
        }

        updates.push('updated_at = NOW()');
        values.push(operationId, userId);

        const result = await this.pool.query<ScheduledOperation>(
            `UPDATE scheduled_operations
             SET ${updates.join(', ')}
             WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}
             RETURNING *`,
            values
        );

        if (result.rows.length === 0) {
            throw new Error('Scheduled operation not found or unauthorized');
        }

        const operation = result.rows[0];

        // Audit log
        await logAuditEvent({
            userId,
            action: 'scheduled_operation.updated',
            resourceType: 'scheduled_operation',
            resourceId: operationId,
            details: { updated_fields: Object.keys(params) }
        });

        return this.formatOperation(operation);
    }

    /**
     * Pause scheduled operation
     */
    async pauseScheduledOperation(operationId: string, userId: string): Promise<ScheduledOperation> {
        return this.updateScheduledOperation(operationId, userId, { status: 'paused' });
    }

    /**
     * Resume scheduled operation
     */
    async resumeScheduledOperation(operationId: string, userId: string): Promise<ScheduledOperation> {
        return this.updateScheduledOperation(operationId, userId, { status: 'scheduled' });
    }

    /**
     * Cancel scheduled operation
     */
    async cancelScheduledOperation(operationId: string, userId: string): Promise<ScheduledOperation> {
        return this.updateScheduledOperation(operationId, userId, { status: 'cancelled' });
    }

    /**
     * Delete scheduled operation
     */
    async deleteScheduledOperation(operationId: string, userId: string): Promise<void> {
        const operation = await this.getScheduledOperationById(operationId, userId);

        if (!operation) {
            throw new Error('Scheduled operation not found');
        }

        if (operation.status === 'running') {
            throw new Error('Cannot delete operation while running');
        }

        await this.pool.query(
            'DELETE FROM scheduled_operations WHERE id = $1',
            [operationId]
        );

        // Audit log
        await logAuditEvent({
            userId,
            action: 'scheduled_operation.deleted',
            resourceType: 'scheduled_operation',
            resourceId: operationId,
            details: {}
        });
    }

    // =====================================================================================
    // Execution Management (For scheduler daemon/worker)
    // =====================================================================================

    /**
     * Get due operations (for scheduler worker)
     */
    async getDueOperations(limit: number = 10): Promise<ScheduledOperation[]> {
        const result = await this.pool.query<ScheduledOperation>(
            `SELECT * FROM get_due_scheduled_operations()
             LIMIT $1`,
            [limit]
        );

        return result.rows.map(row => this.formatOperation(row));
    }

    /**
     * Mark operation as running
     */
    async markOperationRunning(operationId: string): Promise<ScheduledOperationRun> {
        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            // Get current run count
            const opResult = await client.query<ScheduledOperation>(
                'SELECT run_count FROM scheduled_operations WHERE id = $1',
                [operationId]
            );

            const runCount = opResult.rows[0].run_count + 1;

            // Update operation status
            await client.query(
                `UPDATE scheduled_operations
                 SET status = 'running',
                     last_run_at = NOW(),
                     run_count = $2,
                     updated_at = NOW()
                 WHERE id = $1`,
                [operationId, runCount]
            );

            // Create run record
            const runResult = await client.query<ScheduledOperationRun>(
                `INSERT INTO scheduled_operation_runs (
                    scheduled_operation_id, run_number, status, started_at
                ) VALUES ($1, $2, 'running', NOW())
                RETURNING *`,
                [operationId, runCount]
            );

            await client.query('COMMIT');

            return this.formatRun(runResult.rows[0]);
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Mark operation run completed
     */
    async markOperationCompleted(
        runId: string,
        result: Record<string, any>
    ): Promise<void> {
        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            // Update run record
            const runResult = await client.query<ScheduledOperationRun>(
                `UPDATE scheduled_operation_runs
                 SET status = 'success',
                     completed_at = NOW(),
                     duration_ms = EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000,
                     result = $2
                 WHERE id = $1
                 RETURNING *`,
                [runId, JSON.stringify(result)]
            );

            const run = runResult.rows[0];

            // Get operation details
            const opResult = await client.query<ScheduledOperation>(
                'SELECT * FROM scheduled_operations WHERE id = $1',
                [run.scheduled_operation_id]
            );

            const operation = opResult.rows[0];

            // Calculate next run time
            const nextRunAt = await this.calculateNextRunTime(operation);

            // Update operation
            if (nextRunAt) {
                await client.query(
                    `UPDATE scheduled_operations
                     SET status = 'scheduled',
                         success_count = success_count + 1,
                         next_run_at = $2,
                         updated_at = NOW()
                     WHERE id = $1`,
                    [operation.id, nextRunAt]
                );
            } else {
                // No more runs, mark as completed
                await client.query(
                    `UPDATE scheduled_operations
                     SET status = 'completed',
                         success_count = success_count + 1,
                         next_run_at = NULL,
                         updated_at = NOW()
                     WHERE id = $1`,
                    [operation.id]
                );
            }

            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Mark operation run failed
     */
    async markOperationFailed(
        runId: string,
        errorMessage: string
    ): Promise<void> {
        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            // Update run record
            const runResult = await client.query<ScheduledOperationRun>(
                `UPDATE scheduled_operation_runs
                 SET status = 'failed',
                     completed_at = NOW(),
                     duration_ms = EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000,
                     error_message = $2
                 WHERE id = $1
                 RETURNING *`,
                [runId, errorMessage]
            );

            const run = runResult.rows[0];

            // Update operation
            await client.query(
                `UPDATE scheduled_operations
                 SET status = 'failed',
                     failure_count = failure_count + 1,
                     updated_at = NOW()
                 WHERE id = $1`,
                [run.scheduled_operation_id]
            );

            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    // =====================================================================================
    // Operation Runs
    // =====================================================================================

    /**
     * Get operation runs
     */
    async getOperationRuns(
        operationId: string,
        userId: string,
        limit: number = 50,
        offset: number = 0
    ): Promise<ScheduledOperationRun[]> {
        // Verify user owns the operation
        const operation = await this.getScheduledOperationById(operationId, userId);
        if (!operation) {
            throw new Error('Operation not found or unauthorized');
        }

        const result = await this.pool.query<ScheduledOperationRun>(
            `SELECT * FROM scheduled_operation_runs
             WHERE scheduled_operation_id = $1
             ORDER BY started_at DESC
             LIMIT $2 OFFSET $3`,
            [operationId, limit, offset]
        );

        return result.rows.map(row => this.formatRun(row));
    }

    // =====================================================================================
    // Helper Methods
    // =====================================================================================

    /**
     * Calculate next run time
     */
    private async calculateNextRunTime(operation: ScheduledOperation): Promise<Date | null> {
        if (operation.repeat_interval === 'once') {
            return null;
        }

        // Check if max occurrences reached
        if (operation.max_occurrences && operation.run_count >= operation.max_occurrences) {
            return null;
        }

        // Use database function to calculate
        const result = await this.pool.query<{ next_run: Date }>(
            'SELECT calculate_next_run_time($1, NOW()) as next_run',
            [operation.id]
        );

        const nextRun = result.rows[0]?.next_run;

        // Check if next run exceeds repeat_until
        if (nextRun && operation.repeat_until) {
            if (new Date(nextRun) > new Date(operation.repeat_until)) {
                return null;
            }
        }

        return nextRun;
    }

    /**
     * Format operation from database
     */
    private formatOperation(row: any): ScheduledOperation {
        return {
            ...row,
            repeat_config: typeof row.repeat_config === 'object'
                ? row.repeat_config
                : JSON.parse(row.repeat_config || '{}'),
            operation_config: typeof row.operation_config === 'object'
                ? row.operation_config
                : JSON.parse(row.operation_config || '{}'),
            notification_channels: typeof row.notification_channels === 'object'
                ? row.notification_channels
                : JSON.parse(row.notification_channels || '[]'),
            metadata: typeof row.metadata === 'object'
                ? row.metadata
                : JSON.parse(row.metadata || '{}')
        };
    }

    /**
     * Format run from database
     */
    private formatRun(row: any): ScheduledOperationRun {
        return {
            ...row,
            result: typeof row.result === 'object' ? row.result : JSON.parse(row.result || '{}')
        };
    }
}

// Singleton instance
let schedulingServiceInstance: SchedulingService | null = null;

export function getSchedulingService(): SchedulingService {
    if (!schedulingServiceInstance) {
        schedulingServiceInstance = new SchedulingService();
    }
    return schedulingServiceInstance;
}
