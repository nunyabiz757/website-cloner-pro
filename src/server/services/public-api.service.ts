import { Pool } from 'pg';
import { getPool } from '../config/database.js';
import { getRedisCacheService } from './redis-cache.service.js';
import type { RedisCacheService } from './redis-cache.service.js';
import * as crypto from 'crypto';
import { nanoid } from 'nanoid';
import { logAuditEvent } from '../utils/audit-logger.js';

// =====================================================================================
// Types and Interfaces
// =====================================================================================

export interface ApiKey {
    id: string;
    user_id: string;
    key_name: string;
    api_key: string;
    key_prefix: string;
    key_type: 'standard' | 'restricted' | 'admin';
    api_version: string;
    status: 'active' | 'revoked' | 'expired' | 'suspended';
    rate_limit_per_minute: number;
    rate_limit_per_hour: number;
    rate_limit_per_day: number;
    scopes: string[];
    allowed_ips: string[];
    allowed_origins: string[];
    total_requests: number;
    last_used_at?: Date;
    last_used_ip?: string;
    expires_at?: Date;
    description?: string;
    metadata: Record<string, any>;
    created_at: Date;
    updated_at: Date;
    revoked_at?: Date;
    revoked_reason?: string;
}

export interface CreateApiKeyParams {
    user_id: string;
    key_name: string;
    key_type?: 'standard' | 'restricted' | 'admin';
    api_version?: string;
    rate_limit_per_minute?: number;
    rate_limit_per_hour?: number;
    rate_limit_per_day?: number;
    scopes?: string[];
    allowed_ips?: string[];
    allowed_origins?: string[];
    expires_at?: Date;
    description?: string;
    metadata?: Record<string, any>;
}

export interface UpdateApiKeyParams {
    key_name?: string;
    rate_limit_per_minute?: number;
    rate_limit_per_hour?: number;
    rate_limit_per_day?: number;
    scopes?: string[];
    allowed_ips?: string[];
    allowed_origins?: string[];
    expires_at?: Date;
    description?: string;
    metadata?: Record<string, any>;
}

export interface RateLimitResult {
    is_limited: boolean;
    remaining: number;
    reset_at: Date;
}

export interface ApiKeyStatistics {
    total_requests: number;
    successful_requests: number;
    failed_requests: number;
    avg_response_time_ms: number;
    rate_limit_hits: number;
    unique_endpoints: number;
    bandwidth_bytes: number;
}

export interface LogApiRequestParams {
    api_key_id: string;
    user_id: string;
    method: string;
    endpoint: string;
    api_version?: string;
    request_headers?: Record<string, any>;
    request_body?: Record<string, any>;
    query_params?: Record<string, any>;
    status_code: number;
    response_time_ms?: number;
    response_size_bytes?: number;
    ip_address?: string;
    user_agent?: string;
    referer?: string;
    rate_limit_hit?: boolean;
    rate_limit_remaining?: number;
    error_message?: string;
    error_code?: string;
}

// =====================================================================================
// Public API Service
// =====================================================================================

export class PublicApiService {
    private pool: Pool;
    private cache: RedisCacheService;

    constructor() {
        this.pool = getPool();
        this.cache = getRedisCacheService();
    }

    // =====================================================================================
    // API Key Management
    // =====================================================================================

    /**
     * Create a new API key
     */
    async createApiKey(params: CreateApiKeyParams): Promise<{ apiKey: ApiKey; plainKey: string }> {
        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            // Generate API key
            const plainKey = this.generateApiKey();
            const hashedKey = this.hashApiKey(plainKey);
            const keyPrefix = this.extractKeyPrefix(plainKey);

            // Set defaults
            const scopes = params.scopes || ['templates:read', 'users:read'];
            const keyType = params.key_type || 'standard';
            const apiVersion = params.api_version || 'v1';
            const rateLimitPerMinute = params.rate_limit_per_minute || 60;
            const rateLimitPerHour = params.rate_limit_per_hour || 1000;
            const rateLimitPerDay = params.rate_limit_per_day || 10000;

            // Insert API key
            const result = await client.query<ApiKey>(
                `INSERT INTO api_keys (
                    user_id, key_name, api_key, key_prefix, key_type, api_version,
                    rate_limit_per_minute, rate_limit_per_hour, rate_limit_per_day,
                    scopes, allowed_ips, allowed_origins, expires_at, description, metadata
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
                RETURNING *`,
                [
                    params.user_id,
                    params.key_name,
                    hashedKey,
                    keyPrefix,
                    keyType,
                    apiVersion,
                    rateLimitPerMinute,
                    rateLimitPerHour,
                    rateLimitPerDay,
                    JSON.stringify(scopes),
                    JSON.stringify(params.allowed_ips || []),
                    JSON.stringify(params.allowed_origins || []),
                    params.expires_at,
                    params.description,
                    JSON.stringify(params.metadata || {})
                ]
            );

            await client.query('COMMIT');

            const apiKey = this.formatApiKey(result.rows[0]);

            // Audit log
            await logAuditEvent({
                userId: params.user_id,
                action: 'api_key.created',
                resourceType: 'api_key',
                resourceId: apiKey.id,
                details: { key_name: params.key_name, key_type: keyType }
            });

            return { apiKey, plainKey };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Get API key by ID
     */
    async getApiKeyById(id: string, userId: string): Promise<ApiKey | null> {
        const cacheKey = `api_key:${id}`;
        const cached = await this.cache.get<ApiKey>(cacheKey);

        if (cached) {
            return cached;
        }

        const result = await this.pool.query<ApiKey>(
            'SELECT * FROM api_keys WHERE id = $1 AND user_id = $2',
            [id, userId]
        );

        if (result.rows.length === 0) {
            return null;
        }

        const apiKey = this.formatApiKey(result.rows[0]);
        await this.cache.set(cacheKey, apiKey, { ttl: 300 });

        return apiKey;
    }

    /**
     * Validate and get API key by plain key
     */
    async validateApiKey(plainKey: string, ipAddress?: string): Promise<ApiKey | null> {
        const hashedKey = this.hashApiKey(plainKey);
        const keyPrefix = this.extractKeyPrefix(plainKey);

        // Try cache first
        const cacheKey = `api_key:hash:${hashedKey}`;
        const cached = await this.cache.get<ApiKey>(cacheKey);

        if (cached) {
            if (cached.status !== 'active') {
                return null;
            }
            if (cached.expires_at && new Date(cached.expires_at) < new Date()) {
                return null;
            }

            // Check IP restrictions
            if (!this.validateIpAddress(cached, ipAddress)) {
                return null;
            }

            return cached;
        }

        // Query database
        const result = await this.pool.query<ApiKey>(
            `SELECT * FROM api_keys
             WHERE api_key = $1 AND key_prefix = $2 AND status = 'active'`,
            [hashedKey, keyPrefix]
        );

        if (result.rows.length === 0) {
            return null;
        }

        const apiKey = this.formatApiKey(result.rows[0]);

        // Check expiration
        if (apiKey.expires_at && new Date(apiKey.expires_at) < new Date()) {
            await this.updateApiKeyStatus(apiKey.id, 'expired');
            return null;
        }

        // Check IP restrictions
        if (!this.validateIpAddress(apiKey, ipAddress)) {
            return null;
        }

        // Cache the key
        await this.cache.set(cacheKey, apiKey, { ttl: 300 });

        return apiKey;
    }

    /**
     * Get all API keys for a user
     */
    async getUserApiKeys(userId: string): Promise<ApiKey[]> {
        const result = await this.pool.query<ApiKey>(
            `SELECT * FROM api_keys
             WHERE user_id = $1
             ORDER BY created_at DESC`,
            [userId]
        );

        return result.rows.map(row => this.formatApiKey(row));
    }

    /**
     * Update API key
     */
    async updateApiKey(id: string, userId: string, params: UpdateApiKeyParams): Promise<ApiKey> {
        const updates: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        if (params.key_name !== undefined) {
            updates.push(`key_name = $${paramIndex++}`);
            values.push(params.key_name);
        }

        if (params.rate_limit_per_minute !== undefined) {
            updates.push(`rate_limit_per_minute = $${paramIndex++}`);
            values.push(params.rate_limit_per_minute);
        }

        if (params.rate_limit_per_hour !== undefined) {
            updates.push(`rate_limit_per_hour = $${paramIndex++}`);
            values.push(params.rate_limit_per_hour);
        }

        if (params.rate_limit_per_day !== undefined) {
            updates.push(`rate_limit_per_day = $${paramIndex++}`);
            values.push(params.rate_limit_per_day);
        }

        if (params.scopes !== undefined) {
            updates.push(`scopes = $${paramIndex++}`);
            values.push(JSON.stringify(params.scopes));
        }

        if (params.allowed_ips !== undefined) {
            updates.push(`allowed_ips = $${paramIndex++}`);
            values.push(JSON.stringify(params.allowed_ips));
        }

        if (params.allowed_origins !== undefined) {
            updates.push(`allowed_origins = $${paramIndex++}`);
            values.push(JSON.stringify(params.allowed_origins));
        }

        if (params.expires_at !== undefined) {
            updates.push(`expires_at = $${paramIndex++}`);
            values.push(params.expires_at);
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

        const result = await this.pool.query<ApiKey>(
            `UPDATE api_keys
             SET ${updates.join(', ')}
             WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}
             RETURNING *`,
            values
        );

        if (result.rows.length === 0) {
            throw new Error('API key not found');
        }

        const apiKey = this.formatApiKey(result.rows[0]);

        // Clear cache
        await this.cache.delete(`api_key:${id}`);

        // Audit log
        await logAuditEvent({
            userId,
            action: 'api_key.updated',
            resourceType: 'api_key',
            resourceId: id,
            details: params
        });

        return apiKey;
    }

    /**
     * Revoke API key
     */
    async revokeApiKey(id: string, userId: string, reason?: string): Promise<void> {
        const result = await this.pool.query(
            `UPDATE api_keys
             SET status = 'revoked',
                 revoked_at = NOW(),
                 revoked_reason = $3,
                 updated_at = NOW()
             WHERE id = $1 AND user_id = $2`,
            [id, userId, reason]
        );

        if (result.rowCount === 0) {
            throw new Error('API key not found');
        }

        // Clear cache
        await this.cache.delete(`api_key:${id}`);

        // Audit log
        await logAuditEvent({
            userId,
            action: 'api_key.revoked',
            resourceType: 'api_key',
            resourceId: id,
            details: { reason }
        });
    }

    /**
     * Update API key status
     */
    private async updateApiKeyStatus(id: string, status: string): Promise<void> {
        await this.pool.query(
            'UPDATE api_keys SET status = $2, updated_at = NOW() WHERE id = $1',
            [id, status]
        );

        await this.cache.delete(`api_key:${id}`);
    }

    // =====================================================================================
    // Rate Limiting
    // =====================================================================================

    /**
     * Check rate limit for API key
     */
    async checkRateLimit(apiKeyId: string, windowType: 'minute' | 'hour' | 'day'): Promise<RateLimitResult> {
        const result = await this.pool.query<RateLimitResult>(
            'SELECT * FROM check_rate_limit($1, $2)',
            [apiKeyId, windowType]
        );

        return result.rows[0];
    }

    /**
     * Update API key usage
     */
    async updateApiKeyUsage(apiKeyId: string, ipAddress: string): Promise<void> {
        await this.pool.query(
            'SELECT update_api_key_usage($1, $2)',
            [apiKeyId, ipAddress]
        );

        // Clear cache
        await this.cache.delete(`api_key:${apiKeyId}`);
    }

    // =====================================================================================
    // Usage Logging and Analytics
    // =====================================================================================

    /**
     * Log API request
     */
    async logApiRequest(params: LogApiRequestParams): Promise<string> {
        const result = await this.pool.query<{ id: string }>(
            `INSERT INTO api_usage_logs (
                api_key_id, user_id, method, endpoint, api_version,
                request_headers, request_body, query_params,
                status_code, response_time_ms, response_size_bytes,
                ip_address, user_agent, referer,
                rate_limit_hit, rate_limit_remaining,
                error_message, error_code
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
            RETURNING id`,
            [
                params.api_key_id,
                params.user_id,
                params.method,
                params.endpoint,
                params.api_version,
                params.request_headers ? JSON.stringify(params.request_headers) : null,
                params.request_body ? JSON.stringify(params.request_body) : null,
                params.query_params ? JSON.stringify(params.query_params) : null,
                params.status_code,
                params.response_time_ms,
                params.response_size_bytes,
                params.ip_address,
                params.user_agent,
                params.referer,
                params.rate_limit_hit || false,
                params.rate_limit_remaining,
                params.error_message,
                params.error_code
            ]
        );

        // Update quota usage
        await this.pool.query(
            'SELECT update_quota_usage($1, $2, $3, $4, $5)',
            [params.user_id, params.api_key_id, 'daily', 1, params.response_size_bytes || 0]
        );

        await this.pool.query(
            'SELECT update_quota_usage($1, $2, $3, $4, $5)',
            [params.user_id, params.api_key_id, 'monthly', 1, params.response_size_bytes || 0]
        );

        return result.rows[0].id;
    }

    /**
     * Get API key statistics
     */
    async getApiKeyStatistics(
        apiKeyId: string,
        startDate?: Date,
        endDate?: Date
    ): Promise<ApiKeyStatistics> {
        const result = await this.pool.query<ApiKeyStatistics>(
            'SELECT * FROM get_api_key_statistics($1, $2, $3)',
            [apiKeyId, startDate, endDate]
        );

        return result.rows[0];
    }

    /**
     * Get usage logs for an API key
     */
    async getUsageLogs(
        apiKeyId: string,
        limit: number = 100,
        offset: number = 0
    ): Promise<any[]> {
        const result = await this.pool.query(
            `SELECT * FROM api_usage_logs
             WHERE api_key_id = $1
             ORDER BY created_at DESC
             LIMIT $2 OFFSET $3`,
            [apiKeyId, limit, offset]
        );

        return result.rows;
    }

    // =====================================================================================
    // Helper Methods
    // =====================================================================================

    /**
     * Generate a secure API key
     */
    private generateApiKey(): string {
        const randomPart = nanoid(32);
        return `pk_live_${randomPart}`;
    }

    /**
     * Hash API key for storage
     */
    private hashApiKey(plainKey: string): string {
        return crypto.createHash('sha256').update(plainKey).digest('hex');
    }

    /**
     * Extract key prefix for indexing
     */
    private extractKeyPrefix(plainKey: string): string {
        return plainKey.substring(0, 15);
    }

    /**
     * Validate IP address against allowed IPs
     */
    private validateIpAddress(apiKey: ApiKey, ipAddress?: string): boolean {
        if (!ipAddress || apiKey.allowed_ips.length === 0) {
            return true;
        }

        return apiKey.allowed_ips.includes(ipAddress);
    }

    /**
     * Format API key from database
     */
    private formatApiKey(row: any): ApiKey {
        return {
            ...row,
            scopes: Array.isArray(row.scopes) ? row.scopes : JSON.parse(row.scopes || '[]'),
            allowed_ips: Array.isArray(row.allowed_ips) ? row.allowed_ips : JSON.parse(row.allowed_ips || '[]'),
            allowed_origins: Array.isArray(row.allowed_origins) ? row.allowed_origins : JSON.parse(row.allowed_origins || '[]'),
            metadata: typeof row.metadata === 'object' ? row.metadata : JSON.parse(row.metadata || '{}')
        };
    }
}

// Singleton instance
let publicApiServiceInstance: PublicApiService | null = null;

export function getPublicApiService(): PublicApiService {
    if (!publicApiServiceInstance) {
        publicApiServiceInstance = new PublicApiService();
    }
    return publicApiServiceInstance;
}
