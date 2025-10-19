import { Pool } from 'pg';
import { getPool } from '../config/database.js';
import { getRedisCacheService } from './redis-cache.service.js';
import type { RedisCacheService } from './redis-cache.service.js';
import * as crypto from 'crypto';
import { logAuditEvent } from '../utils/audit-logger.js';
import axios from 'axios';

// =====================================================================================
// Types and Interfaces
// =====================================================================================

export interface Webhook {
    id: string;
    user_id: string;
    webhook_name: string;
    url: string;
    secret: string;
    status: 'active' | 'disabled' | 'failed';
    events: string[];
    max_retries: number;
    retry_delay_seconds: number;
    timeout_seconds: number;
    headers: Record<string, string>;
    http_method: 'POST' | 'PUT' | 'PATCH';
    filters: Record<string, any>;
    total_deliveries: number;
    successful_deliveries: number;
    failed_deliveries: number;
    last_delivery_at?: Date;
    last_success_at?: Date;
    last_failure_at?: Date;
    consecutive_failures: number;
    disabled_at?: Date;
    disabled_reason?: string;
    description?: string;
    metadata: Record<string, any>;
    created_at: Date;
    updated_at: Date;
}

export interface CreateWebhookParams {
    user_id: string;
    webhook_name: string;
    url: string;
    events: string[];
    max_retries?: number;
    retry_delay_seconds?: number;
    timeout_seconds?: number;
    headers?: Record<string, string>;
    http_method?: 'POST' | 'PUT' | 'PATCH';
    filters?: Record<string, any>;
    description?: string;
    metadata?: Record<string, any>;
}

export interface UpdateWebhookParams {
    webhook_name?: string;
    url?: string;
    events?: string[];
    max_retries?: number;
    retry_delay_seconds?: number;
    timeout_seconds?: number;
    headers?: Record<string, string>;
    http_method?: 'POST' | 'PUT' | 'PATCH';
    filters?: Record<string, any>;
    description?: string;
    metadata?: Record<string, any>;
}

export interface WebhookDelivery {
    id: string;
    webhook_id: string;
    event_type: string;
    event_id?: string;
    payload: Record<string, any>;
    attempt_number: number;
    status: 'pending' | 'success' | 'failed' | 'retrying';
    request_url: string;
    request_headers?: Record<string, any>;
    request_body?: Record<string, any>;
    response_status_code?: number;
    response_headers?: Record<string, any>;
    response_body?: string;
    response_time_ms?: number;
    error_message?: string;
    error_code?: string;
    next_retry_at?: Date;
    retry_count: number;
    max_retries: number;
    created_at: Date;
    sent_at?: Date;
    completed_at?: Date;
}

export interface WebhookEvent {
    id: string;
    user_id?: string;
    event_type: string;
    resource_type: string;
    resource_id?: string;
    payload: Record<string, any>;
    processed: boolean;
    processed_at?: Date;
    webhook_count: number;
    metadata: Record<string, any>;
    created_at: Date;
}

export interface TriggerWebhookParams {
    user_id?: string;
    event_type: string;
    resource_type: string;
    resource_id?: string;
    payload: Record<string, any>;
    metadata?: Record<string, any>;
}

// =====================================================================================
// Webhook Service
// =====================================================================================

export class WebhookService {
    private pool: Pool;
    private cache: RedisCacheService;
    private processingQueue: Set<string> = new Set();

    constructor() {
        this.pool = getPool();
        this.cache = getRedisCacheService();
    }

    // =====================================================================================
    // Webhook Management
    // =====================================================================================

    /**
     * Create a new webhook
     */
    async createWebhook(params: CreateWebhookParams): Promise<Webhook> {
        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            // Generate webhook secret
            const secret = this.generateSecret();

            // Set defaults
            const maxRetries = params.max_retries || 3;
            const retryDelaySeconds = params.retry_delay_seconds || 60;
            const timeoutSeconds = params.timeout_seconds || 30;
            const httpMethod = params.http_method || 'POST';

            // Insert webhook
            const result = await client.query<Webhook>(
                `INSERT INTO webhooks (
                    user_id, webhook_name, url, secret, events,
                    max_retries, retry_delay_seconds, timeout_seconds,
                    headers, http_method, filters, description, metadata
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
                RETURNING *`,
                [
                    params.user_id,
                    params.webhook_name,
                    params.url,
                    secret,
                    JSON.stringify(params.events),
                    maxRetries,
                    retryDelaySeconds,
                    timeoutSeconds,
                    JSON.stringify(params.headers || {}),
                    httpMethod,
                    JSON.stringify(params.filters || {}),
                    params.description,
                    JSON.stringify(params.metadata || {})
                ]
            );

            await client.query('COMMIT');

            const webhook = this.formatWebhook(result.rows[0]);

            // Audit log
            await logAuditEvent({
                userId: params.user_id,
                action: 'webhook.created',
                resourceType: 'webhook',
                resourceId: webhook.id,
                details: { webhook_name: params.webhook_name, url: params.url, events: params.events }
            });

            return webhook;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Get webhook by ID
     */
    async getWebhookById(id: string, userId: string): Promise<Webhook | null> {
        const cacheKey = `webhook:${id}`;
        const cached = await this.cache.get<Webhook>(cacheKey);

        if (cached) {
            return cached;
        }

        const result = await this.pool.query<Webhook>(
            'SELECT * FROM webhooks WHERE id = $1 AND user_id = $2',
            [id, userId]
        );

        if (result.rows.length === 0) {
            return null;
        }

        const webhook = this.formatWebhook(result.rows[0]);
        await this.cache.set(cacheKey, webhook, { ttl: 300 });

        return webhook;
    }

    /**
     * Get all webhooks for a user
     */
    async getUserWebhooks(userId: string): Promise<Webhook[]> {
        const result = await this.pool.query<Webhook>(
            `SELECT * FROM webhooks
             WHERE user_id = $1
             ORDER BY created_at DESC`,
            [userId]
        );

        return result.rows.map(row => this.formatWebhook(row));
    }

    /**
     * Update webhook
     */
    async updateWebhook(id: string, userId: string, params: UpdateWebhookParams): Promise<Webhook> {
        const updates: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        if (params.webhook_name !== undefined) {
            updates.push(`webhook_name = $${paramIndex++}`);
            values.push(params.webhook_name);
        }

        if (params.url !== undefined) {
            updates.push(`url = $${paramIndex++}`);
            values.push(params.url);
        }

        if (params.events !== undefined) {
            updates.push(`events = $${paramIndex++}`);
            values.push(JSON.stringify(params.events));
        }

        if (params.max_retries !== undefined) {
            updates.push(`max_retries = $${paramIndex++}`);
            values.push(params.max_retries);
        }

        if (params.retry_delay_seconds !== undefined) {
            updates.push(`retry_delay_seconds = $${paramIndex++}`);
            values.push(params.retry_delay_seconds);
        }

        if (params.timeout_seconds !== undefined) {
            updates.push(`timeout_seconds = $${paramIndex++}`);
            values.push(params.timeout_seconds);
        }

        if (params.headers !== undefined) {
            updates.push(`headers = $${paramIndex++}`);
            values.push(JSON.stringify(params.headers));
        }

        if (params.http_method !== undefined) {
            updates.push(`http_method = $${paramIndex++}`);
            values.push(params.http_method);
        }

        if (params.filters !== undefined) {
            updates.push(`filters = $${paramIndex++}`);
            values.push(JSON.stringify(params.filters));
        }

        if (params.description !== undefined) {
            updates.push(`description = $${paramIndex++}`);
            values.push(params.description);
        }

        if (params.metadata !== undefined) {
            updates.push(`metadata = $${paramIndex++}`);
            values.push(JSON.stringify(params.metadata));
        }

        if (updates.length === 0) {
            throw new Error('No updates provided');
        }

        updates.push(`updated_at = NOW()`);
        values.push(id, userId);

        const result = await this.pool.query<Webhook>(
            `UPDATE webhooks
             SET ${updates.join(', ')}
             WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}
             RETURNING *`,
            values
        );

        if (result.rows.length === 0) {
            throw new Error('Webhook not found');
        }

        const webhook = this.formatWebhook(result.rows[0]);

        // Clear cache
        await this.cache.delete(`webhook:${id}`);

        // Audit log
        await logAuditEvent({
            userId,
            action: 'webhook.updated',
            resourceType: 'webhook',
            resourceId: id,
            details: params
        });

        return webhook;
    }

    /**
     * Delete webhook
     */
    async deleteWebhook(id: string, userId: string): Promise<void> {
        const result = await this.pool.query(
            'DELETE FROM webhooks WHERE id = $1 AND user_id = $2',
            [id, userId]
        );

        if (result.rowCount === 0) {
            throw new Error('Webhook not found');
        }

        // Clear cache
        await this.cache.delete(`webhook:${id}`);

        // Audit log
        await logAuditEvent({
            userId,
            action: 'webhook.deleted',
            resourceType: 'webhook',
            resourceId: id,
            details: {}
        });
    }

    /**
     * Enable/disable webhook
     */
    async setWebhookStatus(id: string, userId: string, status: 'active' | 'disabled'): Promise<void> {
        const result = await this.pool.query(
            `UPDATE webhooks
             SET status = $3,
                 disabled_at = CASE WHEN $3 = 'disabled' THEN NOW() ELSE NULL END,
                 updated_at = NOW()
             WHERE id = $1 AND user_id = $2`,
            [id, userId, status]
        );

        if (result.rowCount === 0) {
            throw new Error('Webhook not found');
        }

        // Clear cache
        await this.cache.delete(`webhook:${id}`);

        // Audit log
        await logAuditEvent({
            userId,
            action: `webhook.${status}`,
            resourceType: 'webhook',
            resourceId: id,
            details: { status }
        });
    }

    // =====================================================================================
    // Event Triggering and Delivery
    // =====================================================================================

    /**
     * Trigger webhook event
     */
    async triggerEvent(params: TriggerWebhookParams): Promise<string> {
        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            // Create event record
            const eventResult = await client.query<WebhookEvent>(
                `INSERT INTO webhook_events (
                    user_id, event_type, resource_type, resource_id, payload, metadata
                ) VALUES ($1, $2, $3, $4, $5, $6)
                RETURNING *`,
                [
                    params.user_id,
                    params.event_type,
                    params.resource_type,
                    params.resource_id,
                    JSON.stringify(params.payload),
                    JSON.stringify(params.metadata || {})
                ]
            );

            const event = eventResult.rows[0];

            // Find matching webhooks
            const webhooksResult = await client.query<Webhook>(
                `SELECT * FROM webhooks
                 WHERE user_id = $1
                 AND status = 'active'
                 AND events @> $2::jsonb`,
                [params.user_id, JSON.stringify([params.event_type])]
            );

            // Create deliveries for each matching webhook
            for (const webhookRow of webhooksResult.rows) {
                await client.query(
                    'SELECT create_webhook_delivery($1, $2, $3, $4)',
                    [webhookRow.id, params.event_type, event.id, JSON.stringify(params.payload)]
                );
            }

            // Update event as processed
            await client.query(
                `UPDATE webhook_events
                 SET processed = true,
                     processed_at = NOW(),
                     webhook_count = $2
                 WHERE id = $1`,
                [event.id, webhooksResult.rows.length]
            );

            await client.query('COMMIT');

            // Trigger background processing
            this.processDeliveries().catch(err => {
                console.error('Error processing webhook deliveries:', err);
            });

            return event.id;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Process pending webhook deliveries
     */
    async processDeliveries(): Promise<void> {
        // Prevent concurrent processing
        if (this.processingQueue.size > 0) {
            return;
        }

        const result = await this.pool.query(
            'SELECT * FROM get_pending_webhook_deliveries($1)',
            [50] // Batch size
        );

        for (const delivery of result.rows) {
            // Add to processing queue
            this.processingQueue.add(delivery.delivery_id);

            // Process asynchronously
            this.deliverWebhook(delivery)
                .then(() => {
                    this.processingQueue.delete(delivery.delivery_id);
                })
                .catch(err => {
                    console.error(`Error delivering webhook ${delivery.delivery_id}:`, err);
                    this.processingQueue.delete(delivery.delivery_id);
                });
        }
    }

    /**
     * Deliver a single webhook
     */
    private async deliverWebhook(delivery: any): Promise<void> {
        const startTime = Date.now();
        let success = false;
        let statusCode: number | undefined;
        let responseBody: string | undefined;
        let errorMessage: string | undefined;

        try {
            // Update delivery status to sending
            await this.pool.query(
                `UPDATE webhook_deliveries
                 SET sent_at = NOW(), attempt_number = attempt_number + 1
                 WHERE id = $1`,
                [delivery.delivery_id]
            );

            // Generate signature
            const signature = this.generateSignature(
                JSON.stringify(delivery.payload),
                delivery.webhook_secret
            );

            // Prepare headers
            const headers = {
                ...delivery.headers,
                'Content-Type': 'application/json',
                'User-Agent': 'Website-Cloner-Pro-Webhooks/1.0',
                'X-Webhook-Signature': signature,
                'X-Webhook-Event': delivery.event_type,
                'X-Webhook-Delivery-ID': delivery.delivery_id,
                'X-Webhook-Timestamp': new Date().toISOString()
            };

            // Send webhook
            const response = await axios({
                method: 'POST',
                url: delivery.webhook_url,
                data: delivery.payload,
                headers,
                timeout: 30000,
                validateStatus: () => true // Don't throw on any status
            });

            statusCode = response.status;
            responseBody = JSON.stringify(response.data).substring(0, 5000); // Limit size
            success = statusCode >= 200 && statusCode < 300;

        } catch (error: any) {
            errorMessage = error.message;
            success = false;
        }

        const responseTime = Date.now() - startTime;

        // Update delivery record
        if (success) {
            await this.pool.query(
                `UPDATE webhook_deliveries
                 SET status = 'success',
                     response_status_code = $2,
                     response_body = $3,
                     response_time_ms = $4,
                     completed_at = NOW()
                 WHERE id = $1`,
                [delivery.delivery_id, statusCode, responseBody, responseTime]
            );

            // Update webhook stats
            await this.pool.query(
                'SELECT update_webhook_stats($1, $2)',
                [delivery.webhook_id, true]
            );
        } else {
            // Determine if should retry
            const shouldRetry = delivery.retry_count < delivery.max_retries;
            const nextRetryAt = shouldRetry
                ? new Date(Date.now() + delivery.retry_delay_seconds * 1000 * Math.pow(2, delivery.retry_count))
                : null;

            await this.pool.query(
                `UPDATE webhook_deliveries
                 SET status = CASE WHEN $2 THEN 'retrying' ELSE 'failed' END,
                     response_status_code = $3,
                     response_body = $4,
                     response_time_ms = $5,
                     error_message = $6,
                     retry_count = retry_count + 1,
                     next_retry_at = $7,
                     completed_at = CASE WHEN $2 THEN NULL ELSE NOW() END
                 WHERE id = $1`,
                [delivery.delivery_id, shouldRetry, statusCode, responseBody, responseTime, errorMessage, nextRetryAt]
            );

            // Update webhook stats
            await this.pool.query(
                'SELECT update_webhook_stats($1, $2)',
                [delivery.webhook_id, false]
            );
        }
    }

    /**
     * Get webhook deliveries
     */
    async getWebhookDeliveries(
        webhookId: string,
        userId: string,
        limit: number = 50,
        offset: number = 0
    ): Promise<WebhookDelivery[]> {
        // Verify ownership
        const webhook = await this.getWebhookById(webhookId, userId);
        if (!webhook) {
            throw new Error('Webhook not found');
        }

        const result = await this.pool.query<WebhookDelivery>(
            `SELECT * FROM webhook_deliveries
             WHERE webhook_id = $1
             ORDER BY created_at DESC
             LIMIT $2 OFFSET $3`,
            [webhookId, limit, offset]
        );

        return result.rows;
    }

    /**
     * Retry failed webhook delivery
     */
    async retryDelivery(deliveryId: string, webhookId: string, userId: string): Promise<void> {
        // Verify ownership
        const webhook = await this.getWebhookById(webhookId, userId);
        if (!webhook) {
            throw new Error('Webhook not found');
        }

        await this.pool.query(
            `UPDATE webhook_deliveries
             SET status = 'pending',
                 retry_count = 0,
                 next_retry_at = NOW()
             WHERE id = $1 AND webhook_id = $2`,
            [deliveryId, webhookId]
        );

        // Trigger processing
        this.processDeliveries().catch(err => {
            console.error('Error processing deliveries:', err);
        });
    }

    // =====================================================================================
    // Helper Methods
    // =====================================================================================

    /**
     * Generate webhook secret
     */
    private generateSecret(): string {
        return crypto.randomBytes(32).toString('hex');
    }

    /**
     * Generate HMAC signature for webhook payload
     */
    private generateSignature(payload: string, secret: string): string {
        return crypto
            .createHmac('sha256', secret)
            .update(payload)
            .digest('hex');
    }

    /**
     * Verify webhook signature
     */
    verifySignature(payload: string, signature: string, secret: string): boolean {
        const expectedSignature = this.generateSignature(payload, secret);
        return crypto.timingSafeEqual(
            Buffer.from(signature),
            Buffer.from(expectedSignature)
        );
    }

    /**
     * Format webhook from database
     */
    private formatWebhook(row: any): Webhook {
        return {
            ...row,
            events: Array.isArray(row.events) ? row.events : JSON.parse(row.events || '[]'),
            headers: typeof row.headers === 'object' ? row.headers : JSON.parse(row.headers || '{}'),
            filters: typeof row.filters === 'object' ? row.filters : JSON.parse(row.filters || '{}'),
            metadata: typeof row.metadata === 'object' ? row.metadata : JSON.parse(row.metadata || '{}')
        };
    }
}

// Singleton instance
let webhookServiceInstance: WebhookService | null = null;

export function getWebhookService(): WebhookService {
    if (!webhookServiceInstance) {
        webhookServiceInstance = new WebhookService();
    }
    return webhookServiceInstance;
}
