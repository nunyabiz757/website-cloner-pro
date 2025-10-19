import { Pool } from 'pg';
import crypto from 'crypto';
import { PasswordUtil } from '../utils/password.util.js';

/**
 * API Key Management Service
 */

export interface APIKey {
  id: string;
  user_id: string;
  name: string;
  key_hash: string;
  key_prefix: string;
  scopes: string[];
  rate_limit: number;
  last_used_at?: Date;
  expires_at?: Date;
  revoked: boolean;
  revoked_at?: Date;
  revoked_by?: string;
  revoked_reason?: string;
  created_at: Date;
  updated_at: Date;
}

export interface IPWhitelistEntry {
  id: string;
  api_key_id: string;
  ip_address: string;
  cidr_range?: string;
  description?: string;
  is_active: boolean;
  created_at: Date;
  created_by?: string;
  updated_at: Date;
  last_used_at?: Date;
  use_count: number;
}

export interface IPBlacklistEntry {
  id: string;
  ip_address: string;
  cidr_range?: string;
  reason: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  is_active: boolean;
  expires_at?: Date;
  created_at: Date;
  created_by?: string;
  updated_at: Date;
  blocked_attempts: number;
}

export interface IPAccessLog {
  id: string;
  api_key_id: string;
  ip_address: string;
  access_granted: boolean;
  denial_reason?: string;
  endpoint?: string;
  method?: string;
  user_agent?: string;
  request_timestamp: Date;
  response_status?: number;
}

export interface APIKeyWithPlaintext extends Omit<APIKey, 'key_hash'> {
  key: string;
}

export class APIKeyService {
  private pool: Pool;
  private readonly KEY_PREFIX = 'wcp'; // Website Cloner Pro
  private readonly KEY_LENGTH = 32;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Generate API key
   * Format: wcp_<random_32_chars>
   * @returns Plain text API key
   */
  private generateAPIKey(): { key: string; prefix: string; hash: string } {
    const randomPart = crypto.randomBytes(this.KEY_LENGTH).toString('hex');
    const key = `${this.KEY_PREFIX}_${randomPart}`;
    const prefix = key.substring(0, 11); // wcp_<first4chars>
    const hash = PasswordUtil.hashToken(key);

    return { key, prefix, hash };
  }

  /**
   * Create new API key
   * @param userId User ID
   * @param name Key name/description
   * @param scopes Array of scopes/permissions
   * @param rateLimit Requests per hour
   * @param expiresAt Optional expiration date
   * @returns API key with plaintext key (only time it's visible)
   */
  async createAPIKey(
    userId: string,
    name: string,
    scopes: string[] = [],
    rateLimit: number = 1000,
    expiresAt?: Date
  ): Promise<APIKeyWithPlaintext> {
    const { key, prefix, hash } = this.generateAPIKey();

    const result = await this.pool.query(
      `INSERT INTO api_keys (user_id, name, key_hash, key_prefix, scopes, rate_limit, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [userId, name, hash, prefix, scopes, rateLimit, expiresAt]
    );

    const apiKey = result.rows[0];

    return {
      ...apiKey,
      key, // Plain text key - only returned on creation
    };
  }

  /**
   * Verify API key and get associated data
   * @param key Plain text API key
   * @returns API key data or null
   */
  async verifyAPIKey(key: string): Promise<APIKey | null> {
    const hash = PasswordUtil.hashToken(key);

    const result = await this.pool.query(
      `SELECT * FROM api_keys
       WHERE key_hash = $1
       AND revoked = FALSE
       AND (expires_at IS NULL OR expires_at > NOW())`,
      [hash]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const apiKey = result.rows[0];

    // Update last used timestamp
    await this.pool.query(
      'UPDATE api_keys SET last_used_at = NOW() WHERE id = $1',
      [apiKey.id]
    );

    return apiKey;
  }

  /**
   * Get all API keys for user
   * @param userId User ID
   * @returns Array of API keys (without hashes)
   */
  async getUserAPIKeys(userId: string): Promise<Omit<APIKey, 'key_hash'>[]> {
    const result = await this.pool.query(
      `SELECT id, user_id, name, key_prefix, scopes, rate_limit, last_used_at,
              expires_at, revoked, revoked_at, revoked_by, revoked_reason,
              created_at, updated_at
       FROM api_keys
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );

    return result.rows;
  }

  /**
   * Get API key by ID
   * @param keyId API key ID
   * @param userId User ID (for ownership check)
   * @returns API key or null
   */
  async getAPIKey(keyId: string, userId: string): Promise<Omit<APIKey, 'key_hash'> | null> {
    const result = await this.pool.query(
      `SELECT id, user_id, name, key_prefix, scopes, rate_limit, last_used_at,
              expires_at, revoked, revoked_at, revoked_by, revoked_reason,
              created_at, updated_at
       FROM api_keys
       WHERE id = $1 AND user_id = $2`,
      [keyId, userId]
    );

    return result.rows[0] || null;
  }

  /**
   * Revoke API key
   * @param keyId API key ID
   * @param userId User ID (for ownership check)
   * @param revokedBy User ID of revoker
   * @param reason Revocation reason
   */
  async revokeAPIKey(
    keyId: string,
    userId: string,
    revokedBy: string,
    reason?: string
  ): Promise<void> {
    const result = await this.pool.query(
      `UPDATE api_keys
       SET revoked = TRUE, revoked_at = NOW(), revoked_by = $1, revoked_reason = $2
       WHERE id = $3 AND user_id = $4`,
      [revokedBy, reason, keyId, userId]
    );

    if (result.rowCount === 0) {
      throw new Error('API key not found or unauthorized');
    }
  }

  /**
   * Update API key
   * @param keyId API key ID
   * @param userId User ID (for ownership check)
   * @param updates Updates to apply
   */
  async updateAPIKey(
    keyId: string,
    userId: string,
    updates: Partial<Pick<APIKey, 'name' | 'scopes' | 'rate_limit' | 'expires_at'>>
  ): Promise<Omit<APIKey, 'key_hash'>> {
    const allowedFields = ['name', 'scopes', 'rate_limit', 'expires_at'];
    const updateFields: string[] = [];
    const values: any[] = [];
    let paramCount = 1;

    for (const [key, value] of Object.entries(updates)) {
      if (allowedFields.includes(key)) {
        updateFields.push(`${key} = $${paramCount}`);
        values.push(value);
        paramCount++;
      }
    }

    if (updateFields.length === 0) {
      throw new Error('No valid fields to update');
    }

    values.push(keyId, userId);

    const result = await this.pool.query(
      `UPDATE api_keys
       SET ${updateFields.join(', ')}, updated_at = NOW()
       WHERE id = $${paramCount} AND user_id = $${paramCount + 1}
       RETURNING id, user_id, name, key_prefix, scopes, rate_limit, last_used_at,
                 expires_at, revoked, revoked_at, revoked_by, revoked_reason,
                 created_at, updated_at`,
      values
    );

    if (result.rows.length === 0) {
      throw new Error('API key not found or unauthorized');
    }

    return result.rows[0];
  }

  /**
   * Delete API key permanently
   * @param keyId API key ID
   * @param userId User ID (for ownership check)
   */
  async deleteAPIKey(keyId: string, userId: string): Promise<void> {
    const result = await this.pool.query(
      'DELETE FROM api_keys WHERE id = $1 AND user_id = $2',
      [keyId, userId]
    );

    if (result.rowCount === 0) {
      throw new Error('API key not found or unauthorized');
    }
  }

  /**
   * Check if API key has scope
   * @param apiKey API key
   * @param requiredScope Required scope
   * @returns True if has scope
   */
  hasScope(apiKey: APIKey, requiredScope: string): boolean {
    return apiKey.scopes.includes(requiredScope) || apiKey.scopes.includes('*');
  }

  /**
   * Check if API key has any of the scopes
   * @param apiKey API key
   * @param requiredScopes Required scopes
   * @returns True if has any scope
   */
  hasAnyScope(apiKey: APIKey, requiredScopes: string[]): boolean {
    if (apiKey.scopes.includes('*')) {
      return true;
    }

    for (const scope of requiredScopes) {
      if (apiKey.scopes.includes(scope)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Log API key usage
   * @param apiKeyId API key ID
   * @param endpoint Endpoint accessed
   * @param method HTTP method
   * @param statusCode Response status code
   * @param ipAddress IP address
   * @param userAgent User agent
   */
  async logUsage(
    apiKeyId: string,
    endpoint: string,
    method: string,
    statusCode: number,
    ipAddress?: string,
    userAgent?: string
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO api_key_usage (api_key_id, endpoint, method, status_code, ip_address, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [apiKeyId, endpoint, method, statusCode, ipAddress, userAgent]
    );
  }

  /**
   * Get API key usage statistics
   * @param apiKeyId API key ID
   * @param startDate Start date
   * @param endDate End date
   * @returns Usage statistics
   */
  async getUsageStatistics(
    apiKeyId: string,
    startDate: Date,
    endDate: Date
  ): Promise<Record<string, any>> {
    const result = await this.pool.query(
      `SELECT
        COUNT(*) as total_requests,
        COUNT(DISTINCT endpoint) as unique_endpoints,
        COUNT(CASE WHEN status_code >= 400 THEN 1 END) as errors,
        COUNT(CASE WHEN status_code = 429 THEN 1 END) as rate_limited,
        json_object_agg(endpoint, endpoint_count) as by_endpoint
       FROM (
         SELECT
           endpoint,
           COUNT(*) as endpoint_count,
           status_code
         FROM api_key_usage
         WHERE api_key_id = $1
         AND created_at BETWEEN $2 AND $3
         GROUP BY endpoint, status_code
       ) subquery`,
      [apiKeyId, startDate, endDate]
    );

    return result.rows[0];
  }

  /**
   * Rotate API key (create new, revoke old)
   * @param oldKeyId Old API key ID
   * @param userId User ID
   * @param revokedBy User ID of revoker
   * @returns New API key
   */
  async rotateAPIKey(
    oldKeyId: string,
    userId: string,
    revokedBy: string
  ): Promise<APIKeyWithPlaintext> {
    // Get old key details
    const oldKey = await this.getAPIKey(oldKeyId, userId);
    if (!oldKey) {
      throw new Error('API key not found');
    }

    // Create new key with same settings
    const newKey = await this.createAPIKey(
      userId,
      oldKey.name,
      oldKey.scopes,
      oldKey.rate_limit,
      oldKey.expires_at || undefined
    );

    // Revoke old key
    await this.revokeAPIKey(oldKeyId, userId, revokedBy, 'Rotated');

    return newKey;
  }

  /**
   * Clean up expired API keys
   * @returns Number of keys deleted
   */
  async cleanupExpiredKeys(): Promise<number> {
    const result = await this.pool.query(
      'DELETE FROM api_keys WHERE expires_at < NOW() AND revoked = FALSE'
    );

    return result.rowCount || 0;
  }

  // ==================== IP Whitelist Methods ====================

  /**
   * Add IP to whitelist for API key
   * @param apiKeyId API key ID
   * @param ipAddress IP address (can be single IP or CIDR range)
   * @param description Optional description
   * @param createdBy User ID
   * @returns Whitelist entry
   */
  async addIPToWhitelist(
    apiKeyId: string,
    ipAddress: string,
    description?: string,
    createdBy?: string
  ): Promise<IPWhitelistEntry> {
    // Detect if CIDR range
    const isCIDR = ipAddress.includes('/');
    const cidrRange = isCIDR ? ipAddress : null;
    const singleIP = isCIDR ? null : ipAddress;

    const result = await this.pool.query(
      `INSERT INTO api_key_ip_whitelist (api_key_id, ip_address, cidr_range, description, created_by)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (api_key_id, ip_address) DO UPDATE
       SET is_active = TRUE, updated_at = NOW()
       RETURNING *`,
      [apiKeyId, singleIP || cidrRange, cidrRange, description, createdBy]
    );

    return result.rows[0];
  }

  /**
   * Remove IP from whitelist
   * @param whitelistId Whitelist entry ID
   * @param apiKeyId API key ID (for ownership check)
   */
  async removeIPFromWhitelist(whitelistId: string, apiKeyId: string): Promise<void> {
    const result = await this.pool.query(
      'DELETE FROM api_key_ip_whitelist WHERE id = $1 AND api_key_id = $2',
      [whitelistId, apiKeyId]
    );

    if (result.rowCount === 0) {
      throw new Error('Whitelist entry not found or unauthorized');
    }
  }

  /**
   * Get IP whitelist for API key
   * @param apiKeyId API key ID
   * @returns Array of whitelist entries
   */
  async getIPWhitelist(apiKeyId: string): Promise<IPWhitelistEntry[]> {
    const result = await this.pool.query(
      `SELECT * FROM api_key_ip_whitelist
       WHERE api_key_id = $1 AND is_active = TRUE
       ORDER BY created_at DESC`,
      [apiKeyId]
    );

    return result.rows;
  }

  /**
   * Check if IP is whitelisted for API key
   * @param apiKeyId API key ID
   * @param ipAddress IP address
   * @returns True if whitelisted
   */
  async isIPWhitelisted(apiKeyId: string, ipAddress: string): Promise<boolean> {
    const result = await this.pool.query(
      'SELECT is_ip_whitelisted($1, $2) as is_whitelisted',
      [apiKeyId, ipAddress]
    );

    return result.rows[0].is_whitelisted;
  }

  /**
   * Check if IP is blacklisted globally
   * @param ipAddress IP address
   * @returns Blacklist info or null
   */
  async isIPBlacklisted(ipAddress: string): Promise<{
    isBlacklisted: boolean;
    reason?: string;
    severity?: string;
  }> {
    const result = await this.pool.query(
      'SELECT * FROM is_ip_blacklisted($1)',
      [ipAddress]
    );

    const row = result.rows[0];
    return {
      isBlacklisted: row.is_blacklisted,
      reason: row.reason,
      severity: row.severity,
    };
  }

  /**
   * Add IP to blacklist
   * @param ipAddress IP address or CIDR range
   * @param reason Reason for blacklisting
   * @param severity Severity level
   * @param expiresAt Optional expiration date
   * @param createdBy User ID
   * @returns Blacklist entry ID
   */
  async addIPToBlacklist(
    ipAddress: string,
    reason: string,
    severity: 'low' | 'medium' | 'high' | 'critical' = 'medium',
    expiresAt?: Date,
    createdBy?: string
  ): Promise<string> {
    const result = await this.pool.query(
      'SELECT add_ip_to_blacklist($1, $2, $3, $4, $5) as id',
      [ipAddress, reason, severity, expiresAt, createdBy]
    );

    return result.rows[0].id;
  }

  /**
   * Remove IP from blacklist
   * @param blacklistId Blacklist entry ID
   */
  async removeIPFromBlacklist(blacklistId: string): Promise<void> {
    await this.pool.query(
      'UPDATE api_key_ip_blacklist SET is_active = FALSE WHERE id = $1',
      [blacklistId]
    );
  }

  /**
   * Get IP blacklist
   * @returns Array of blacklist entries
   */
  async getIPBlacklist(): Promise<IPBlacklistEntry[]> {
    const result = await this.pool.query(
      `SELECT * FROM api_key_ip_blacklist
       WHERE is_active = TRUE
       AND (expires_at IS NULL OR expires_at > NOW())
       ORDER BY created_at DESC`
    );

    return result.rows;
  }

  /**
   * Log IP access attempt
   * @param apiKeyId API key ID
   * @param ipAddress IP address
   * @param accessGranted Whether access was granted
   * @param denialReason Reason for denial (if denied)
   * @param endpoint Endpoint accessed
   * @param method HTTP method
   * @param userAgent User agent
   * @param responseStatus Response status code
   * @returns Log ID
   */
  async logIPAccess(
    apiKeyId: string,
    ipAddress: string,
    accessGranted: boolean,
    denialReason?: string,
    endpoint?: string,
    method?: string,
    userAgent?: string,
    responseStatus?: number
  ): Promise<string> {
    const result = await this.pool.query(
      'SELECT log_ip_access($1, $2, $3, $4, $5, $6, $7, $8) as id',
      [apiKeyId, ipAddress, accessGranted, denialReason, endpoint, method, userAgent, responseStatus]
    );

    return result.rows[0].id;
  }

  /**
   * Get IP access logs for API key
   * @param apiKeyId API key ID
   * @param limit Number of logs to retrieve
   * @returns Array of access logs
   */
  async getIPAccessLogs(apiKeyId: string, limit: number = 100): Promise<IPAccessLog[]> {
    const result = await this.pool.query(
      `SELECT * FROM api_key_ip_access_logs
       WHERE api_key_id = $1
       ORDER BY request_timestamp DESC
       LIMIT $2`,
      [apiKeyId, limit]
    );

    return result.rows;
  }

  /**
   * Get suspicious IP access patterns
   * @returns Array of suspicious IPs
   */
  async getSuspiciousIPAccess(): Promise<Array<{
    ipAddress: string;
    totalAttempts: number;
    deniedAttempts: number;
    grantedAttempts: number;
    lastAttempt: Date;
    denialReasons: string[];
    apiKeysAttempted: number;
  }>> {
    const result = await this.pool.query(
      'SELECT * FROM suspicious_ip_access'
    );

    return result.rows.map((row) => ({
      ipAddress: row.ip_address,
      totalAttempts: row.total_attempts,
      deniedAttempts: row.denied_attempts,
      grantedAttempts: row.granted_attempts,
      lastAttempt: row.last_attempt,
      denialReasons: row.denial_reasons || [],
      apiKeysAttempted: row.api_keys_attempted,
    }));
  }

  /**
   * Update whitelist IP usage
   * @param apiKeyId API key ID
   * @param ipAddress IP address
   */
  async updateWhitelistIPUsage(apiKeyId: string, ipAddress: string): Promise<void> {
    await this.pool.query(
      'SELECT update_whitelist_ip_usage($1, $2)',
      [apiKeyId, ipAddress]
    );
  }

  /**
   * Get whitelist statistics
   * @param apiKeyId API key ID
   * @returns Whitelist statistics
   */
  async getWhitelistStatistics(apiKeyId: string): Promise<Array<{
    id: string;
    ipAddress: string;
    cidrRange?: string;
    description?: string;
    useCount: number;
    lastUsedAt?: Date;
    successfulAccesses: number;
    deniedAccesses: number;
  }>> {
    const result = await this.pool.query(
      `SELECT * FROM ip_whitelist_statistics
       WHERE api_key_id = $1`,
      [apiKeyId]
    );

    return result.rows.map((row) => ({
      id: row.id,
      ipAddress: row.ip_address,
      cidrRange: row.cidr_range,
      description: row.description,
      useCount: row.use_count,
      lastUsedAt: row.last_used_at,
      successfulAccesses: row.successful_accesses,
      deniedAccesses: row.denied_accesses,
    }));
  }

  /**
   * Verify API key with IP validation
   * @param key Plain text API key
   * @param ipAddress IP address of requester
   * @returns API key data or null with denial reason
   */
  async verifyAPIKeyWithIP(
    key: string,
    ipAddress: string
  ): Promise<{ apiKey: APIKey | null; denied: boolean; reason?: string }> {
    // First verify the API key itself
    const apiKey = await this.verifyAPIKey(key);

    if (!apiKey) {
      return { apiKey: null, denied: true, reason: 'Invalid API key' };
    }

    // Check if IP is blacklisted
    const blacklistCheck = await this.isIPBlacklisted(ipAddress);

    if (blacklistCheck.isBlacklisted) {
      await this.logIPAccess(
        apiKey.id,
        ipAddress,
        false,
        `IP blacklisted: ${blacklistCheck.reason}`
      );

      return {
        apiKey: null,
        denied: true,
        reason: `IP address is blacklisted: ${blacklistCheck.reason}`,
      };
    }

    // Check if IP is whitelisted (if whitelist exists)
    const isWhitelisted = await this.isIPWhitelisted(apiKey.id, ipAddress);

    if (!isWhitelisted) {
      await this.logIPAccess(
        apiKey.id,
        ipAddress,
        false,
        'IP not whitelisted'
      );

      return {
        apiKey: null,
        denied: true,
        reason: 'IP address is not whitelisted for this API key',
      };
    }

    // Update whitelist usage
    await this.updateWhitelistIPUsage(apiKey.id, ipAddress);

    // Log successful access
    await this.logIPAccess(apiKey.id, ipAddress, true);

    return { apiKey, denied: false };
  }

  /**
   * Cleanup expired blacklist entries
   * @returns Number of entries removed
   */
  async cleanupExpiredBlacklist(): Promise<number> {
    const result = await this.pool.query(
      'SELECT cleanup_expired_blacklist() as count'
    );

    return result.rows[0].count;
  }

  /**
   * Bulk add IPs to whitelist
   * @param apiKeyId API key ID
   * @param ipAddresses Array of IP addresses
   * @param createdBy User ID
   * @returns Array of created entries
   */
  async bulkAddIPsToWhitelist(
    apiKeyId: string,
    ipAddresses: string[],
    createdBy?: string
  ): Promise<IPWhitelistEntry[]> {
    const entries: IPWhitelistEntry[] = [];

    for (const ip of ipAddresses) {
      try {
        const entry = await this.addIPToWhitelist(apiKeyId, ip, undefined, createdBy);
        entries.push(entry);
      } catch (error) {
        // Continue on error, log it
        console.error(`Failed to add IP ${ip} to whitelist:`, error);
      }
    }

    return entries;
  }

  /**
   * Toggle whitelist entry active status
   * @param whitelistId Whitelist entry ID
   * @param isActive Active status
   */
  async toggleWhitelistEntry(whitelistId: string, isActive: boolean): Promise<void> {
    await this.pool.query(
      'UPDATE api_key_ip_whitelist SET is_active = $1, updated_at = NOW() WHERE id = $2',
      [isActive, whitelistId]
    );
  }
}

export default APIKeyService;
