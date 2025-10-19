import { Pool } from 'pg';
import { getPool } from '../config/database.js';
import { getRedisCacheService } from './redis-cache.service.js';
import type { RedisCacheService } from './redis-cache.service.js';
import { logAuditEvent } from '../utils/audit-logger.js';

// =====================================================================================
// Types and Interfaces
// =====================================================================================

export interface BulkOperation {
    id: string;
    user_id: string;
    operation_type: 'clone' | 'export' | 'delete' | 'update' | 'import';
    resource_type: 'templates' | 'clones' | 'pages';
    status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
    total_items: number;
    processed_items: number;
    successful_items: number;
    failed_items: number;
    items: any[];
    options: Record<string, any>;
    results: Record<string, any>;
    error_log?: string;
    retry_count: number;
    max_retries: number;
    started_at?: Date;
    completed_at?: Date;
    cancelled_at?: Date;
    created_at: Date;
    updated_at: Date;
}

export interface BulkOperationItem {
    id: string;
    bulk_operation_id: string;
    item_id: string;
    item_type: string;
    status: 'pending' | 'processing' | 'success' | 'failed' | 'skipped';
    result: Record<string, any>;
    error_message?: string;
    processed_at?: Date;
    created_at: Date;
}

export interface CreateBulkOperationParams {
    user_id: string;
    operation_type: 'clone' | 'export' | 'delete' | 'update' | 'import';
    resource_type: 'templates' | 'clones' | 'pages';
    items: string[]; // Array of IDs
    options?: Record<string, any>;
}

export interface BulkOperationProgress {
    id: string;
    status: string;
    total_items: number;
    processed_items: number;
    successful_items: number;
    failed_items: number;
    progress_percentage: number;
    estimated_time_remaining?: number;
}

// =====================================================================================
// Bulk Operations Service
// =====================================================================================

export class BulkOperationsService {
    private pool: Pool;
    private cache: RedisCacheService;

    constructor() {
        this.pool = getPool();
        this.cache = getRedisCacheService();
    }

    // =====================================================================================
    // Bulk Operation Management
    // =====================================================================================

    /**
     * Create bulk operation
     */
    async createBulkOperation(params: CreateBulkOperationParams): Promise<BulkOperation> {
        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            // Create bulk operation
            const operationResult = await client.query<BulkOperation>(
                `INSERT INTO bulk_operations (
                    user_id, operation_type, resource_type,
                    total_items, items, options
                ) VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING *`,
                [
                    params.user_id,
                    params.operation_type,
                    params.resource_type,
                    params.items.length,
                    JSON.stringify(params.items),
                    JSON.stringify(params.options || {})
                ]
            );

            const operation = operationResult.rows[0];

            // Create individual item records
            for (const itemId of params.items) {
                await client.query(
                    `INSERT INTO bulk_operation_items (
                        bulk_operation_id, item_id, item_type
                    ) VALUES ($1, $2, $3)`,
                    [operation.id, itemId, params.resource_type]
                );
            }

            await client.query('COMMIT');

            // Audit log
            await logAuditEvent({
                userId: params.user_id,
                action: 'bulk_operation.created',
                resourceType: 'bulk_operation',
                resourceId: operation.id,
                details: {
                    operation_type: params.operation_type,
                    resource_type: params.resource_type,
                    total_items: params.items.length
                }
            });

            return this.formatOperation(operation);
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Get bulk operation by ID
     */
    async getBulkOperationById(operationId: string, userId: string): Promise<BulkOperation | null> {
        const result = await this.pool.query<BulkOperation>(
            'SELECT * FROM bulk_operations WHERE id = $1 AND user_id = $2',
            [operationId, userId]
        );

        if (result.rows.length === 0) {
            return null;
        }

        return this.formatOperation(result.rows[0]);
    }

    /**
     * Get user's bulk operations
     */
    async getUserBulkOperations(
        userId: string,
        limit: number = 50,
        offset: number = 0
    ): Promise<BulkOperation[]> {
        const result = await this.pool.query<BulkOperation>(
            `SELECT * FROM bulk_operations
             WHERE user_id = $1
             ORDER BY created_at DESC
             LIMIT $2 OFFSET $3`,
            [userId, limit, offset]
        );

        return result.rows.map(row => this.formatOperation(row));
    }

    /**
     * Get operation progress
     */
    async getOperationProgress(operationId: string, userId: string): Promise<BulkOperationProgress | null> {
        const operation = await this.getBulkOperationById(operationId, userId);

        if (!operation) {
            return null;
        }

        const progressPercentage = operation.total_items > 0
            ? (operation.processed_items / operation.total_items) * 100
            : 0;

        // Estimate time remaining based on processing rate
        let estimatedTimeRemaining: number | undefined;
        if (operation.started_at && operation.processed_items > 0 && operation.status === 'processing') {
            const elapsedMs = Date.now() - new Date(operation.started_at).getTime();
            const itemsRemaining = operation.total_items - operation.processed_items;
            const msPerItem = elapsedMs / operation.processed_items;
            estimatedTimeRemaining = Math.round((itemsRemaining * msPerItem) / 1000); // seconds
        }

        return {
            id: operation.id,
            status: operation.status,
            total_items: operation.total_items,
            processed_items: operation.processed_items,
            successful_items: operation.successful_items,
            failed_items: operation.failed_items,
            progress_percentage: Math.round(progressPercentage * 100) / 100,
            estimated_time_remaining: estimatedTimeRemaining
        };
    }

    /**
     * Get operation items
     */
    async getOperationItems(
        operationId: string,
        userId: string,
        status?: string
    ): Promise<BulkOperationItem[]> {
        // Verify user owns the operation
        const operation = await this.getBulkOperationById(operationId, userId);
        if (!operation) {
            throw new Error('Operation not found or unauthorized');
        }

        let query = 'SELECT * FROM bulk_operation_items WHERE bulk_operation_id = $1';
        const params: any[] = [operationId];

        if (status) {
            query += ' AND status = $2';
            params.push(status);
        }

        query += ' ORDER BY created_at';

        const result = await this.pool.query<BulkOperationItem>(query, params);

        return result.rows.map(row => this.formatItem(row));
    }

    // =====================================================================================
    // Operation Control
    // =====================================================================================

    /**
     * Start processing bulk operation
     */
    async startOperation(operationId: string, userId: string): Promise<BulkOperation> {
        const result = await this.pool.query<BulkOperation>(
            `UPDATE bulk_operations
             SET status = 'processing', started_at = NOW(), updated_at = NOW()
             WHERE id = $1 AND user_id = $2 AND status = 'pending'
             RETURNING *`,
            [operationId, userId]
        );

        if (result.rows.length === 0) {
            throw new Error('Operation not found or not in pending status');
        }

        const operation = result.rows[0];

        // Audit log
        await logAuditEvent({
            userId,
            action: 'bulk_operation.started',
            resourceType: 'bulk_operation',
            resourceId: operationId,
            details: { operation_type: operation.operation_type }
        });

        return this.formatOperation(operation);
    }

    /**
     * Cancel bulk operation
     */
    async cancelOperation(operationId: string, userId: string): Promise<BulkOperation> {
        const result = await this.pool.query<BulkOperation>(
            `UPDATE bulk_operations
             SET status = 'cancelled', cancelled_at = NOW(), updated_at = NOW()
             WHERE id = $1 AND user_id = $2 AND status IN ('pending', 'processing')
             RETURNING *`,
            [operationId, userId]
        );

        if (result.rows.length === 0) {
            throw new Error('Operation not found or cannot be cancelled');
        }

        const operation = result.rows[0];

        // Cancel pending items
        await this.pool.query(
            `UPDATE bulk_operation_items
             SET status = 'skipped'
             WHERE bulk_operation_id = $1 AND status = 'pending'`,
            [operationId]
        );

        // Audit log
        await logAuditEvent({
            userId,
            action: 'bulk_operation.cancelled',
            resourceType: 'bulk_operation',
            resourceId: operationId,
            details: {}
        });

        return this.formatOperation(operation);
    }

    /**
     * Retry failed bulk operation
     */
    async retryOperation(operationId: string, userId: string): Promise<BulkOperation> {
        const operation = await this.getBulkOperationById(operationId, userId);

        if (!operation) {
            throw new Error('Operation not found');
        }

        if (operation.status !== 'failed' && operation.status !== 'completed') {
            throw new Error('Only failed or completed operations can be retried');
        }

        if (operation.retry_count >= operation.max_retries) {
            throw new Error('Maximum retry attempts reached');
        }

        // Reset failed items to pending
        await this.pool.query(
            `UPDATE bulk_operation_items
             SET status = 'pending', error_message = NULL, processed_at = NULL
             WHERE bulk_operation_id = $1 AND status = 'failed'`,
            [operationId]
        );

        // Update operation
        const result = await this.pool.query<BulkOperation>(
            `UPDATE bulk_operations
             SET status = 'pending',
                 retry_count = retry_count + 1,
                 started_at = NULL,
                 completed_at = NULL,
                 updated_at = NOW()
             WHERE id = $1
             RETURNING *`,
            [operationId]
        );

        // Audit log
        await logAuditEvent({
            userId,
            action: 'bulk_operation.retried',
            resourceType: 'bulk_operation',
            resourceId: operationId,
            details: { retry_count: result.rows[0].retry_count }
        });

        return this.formatOperation(result.rows[0]);
    }

    /**
     * Delete bulk operation
     */
    async deleteOperation(operationId: string, userId: string): Promise<void> {
        const operation = await this.getBulkOperationById(operationId, userId);

        if (!operation) {
            throw new Error('Operation not found');
        }

        if (operation.status === 'processing') {
            throw new Error('Cannot delete operation while processing');
        }

        await this.pool.query(
            'DELETE FROM bulk_operations WHERE id = $1',
            [operationId]
        );

        // Audit log
        await logAuditEvent({
            userId,
            action: 'bulk_operation.deleted',
            resourceType: 'bulk_operation',
            resourceId: operationId,
            details: {}
        });
    }

    // =====================================================================================
    // Item Processing (For background workers)
    // =====================================================================================

    /**
     * Update item status
     */
    async updateItemStatus(
        itemId: string,
        status: 'processing' | 'success' | 'failed' | 'skipped',
        result?: Record<string, any>,
        errorMessage?: string
    ): Promise<void> {
        await this.pool.query(
            `UPDATE bulk_operation_items
             SET status = $2,
                 result = $3,
                 error_message = $4,
                 processed_at = NOW()
             WHERE id = $1`,
            [itemId, status, JSON.stringify(result || {}), errorMessage]
        );
    }

    /**
     * Get pending operations (for background worker)
     */
    async getPendingOperations(limit: number = 10): Promise<BulkOperation[]> {
        const result = await this.pool.query<BulkOperation>(
            `SELECT * FROM get_pending_bulk_operations()
             LIMIT $1`,
            [limit]
        );

        return result.rows.map(row => this.formatOperation(row));
    }

    // =====================================================================================
    // Statistics
    // =====================================================================================

    /**
     * Get user operation statistics
     */
    async getUserStatistics(userId: string): Promise<{
        total_operations: number;
        completed_operations: number;
        failed_operations: number;
        cancelled_operations: number;
        total_items_processed: number;
        total_items_successful: number;
        total_items_failed: number;
    }> {
        const result = await this.pool.query(
            `SELECT
                COUNT(*) as total_operations,
                COUNT(*) FILTER (WHERE status = 'completed') as completed_operations,
                COUNT(*) FILTER (WHERE status = 'failed') as failed_operations,
                COUNT(*) FILTER (WHERE status = 'cancelled') as cancelled_operations,
                COALESCE(SUM(processed_items), 0) as total_items_processed,
                COALESCE(SUM(successful_items), 0) as total_items_successful,
                COALESCE(SUM(failed_items), 0) as total_items_failed
             FROM bulk_operations
             WHERE user_id = $1`,
            [userId]
        );

        return result.rows[0];
    }

    // =====================================================================================
    // Helper Methods
    // =====================================================================================

    /**
     * Format operation from database
     */
    private formatOperation(row: any): BulkOperation {
        return {
            ...row,
            items: typeof row.items === 'object' ? row.items : JSON.parse(row.items || '[]'),
            options: typeof row.options === 'object' ? row.options : JSON.parse(row.options || '{}'),
            results: typeof row.results === 'object' ? row.results : JSON.parse(row.results || '{}')
        };
    }

    /**
     * Format item from database
     */
    private formatItem(row: any): BulkOperationItem {
        return {
            ...row,
            result: typeof row.result === 'object' ? row.result : JSON.parse(row.result || '{}')
        };
    }
}

// Singleton instance
let bulkOperationsServiceInstance: BulkOperationsService | null = null;

export function getBulkOperationsService(): BulkOperationsService {
    if (!bulkOperationsServiceInstance) {
        bulkOperationsServiceInstance = new BulkOperationsService();
    }
    return bulkOperationsServiceInstance;
}
