import { createClient, RedisClientType } from 'redis';
import { AppLogger } from '../utils/logger.util.js';

/**
 * Redis Cache Service
 *
 * Provides caching layer for:
 * - Password breach detection results
 * - Session data
 * - Rate limiting
 * - General application caching
 *
 * Features:
 * - Automatic connection management
 * - TTL-based expiration
 * - Cache invalidation strategies
 * - Namespace support
 * - JSON serialization
 * - Error handling with fallback
 */

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  namespace?: string; // Cache namespace/prefix
}

export interface CacheStats {
  connected: boolean;
  memoryUsage?: string;
  keys?: number;
  hits?: number;
  misses?: number;
  hitRate?: number;
}

export class RedisCacheService {
  private client: RedisClientType | null = null;
  private logger: AppLogger;
  private connected: boolean = false;
  private readonly DEFAULT_TTL = 3600; // 1 hour
  private readonly PWNED_CACHE_TTL = 86400 * 30; // 30 days
  private stats = {
    hits: 0,
    misses: 0,
  };

  constructor() {
    this.logger = AppLogger.getInstance();
  }

  /**
   * Initialize Redis connection
   */
  async initialize(url?: string): Promise<void> {
    try {
      const redisUrl = url || process.env.REDIS_URL || 'redis://localhost:6379';

      this.client = createClient({
        url: redisUrl,
        socket: {
          reconnectStrategy: (retries) => {
            if (retries > 10) {
              this.logger.error('Redis max reconnection attempts reached', {
                component: 'RedisCacheService',
              });
              return new Error('Max reconnection attempts reached');
            }
            return Math.min(retries * 100, 3000);
          },
        },
      });

      // Event handlers
      this.client.on('error', (err) => {
        this.logger.error('Redis client error', {
          component: 'RedisCacheService',
          error: err.message,
        });
      });

      this.client.on('connect', () => {
        this.logger.info('Redis client connecting...', {
          component: 'RedisCacheService',
        });
      });

      this.client.on('ready', () => {
        this.connected = true;
        this.logger.info('Redis client ready', {
          component: 'RedisCacheService',
        });
      });

      this.client.on('end', () => {
        this.connected = false;
        this.logger.info('Redis client disconnected', {
          component: 'RedisCacheService',
        });
      });

      await this.client.connect();
    } catch (error) {
      this.logger.error('Failed to initialize Redis', {
        component: 'RedisCacheService',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Check if Redis is connected
   */
  isConnected(): boolean {
    return this.connected && this.client !== null;
  }

  /**
   * Generate cache key with namespace
   */
  private generateKey(key: string, namespace?: string): string {
    const ns = namespace || 'app';
    return `${ns}:${key}`;
  }

  /**
   * Set cache value
   */
  async set(key: string, value: any, options?: CacheOptions): Promise<boolean> {
    if (!this.isConnected()) {
      this.logger.warn('Redis not connected, skipping set', {
        component: 'RedisCacheService',
      });
      return false;
    }

    try {
      const cacheKey = this.generateKey(key, options?.namespace);
      const ttl = options?.ttl || this.DEFAULT_TTL;

      // Serialize value to JSON
      const serialized = JSON.stringify(value);

      await this.client!.setEx(cacheKey, ttl, serialized);

      this.logger.debug('Cache set', {
        component: 'RedisCacheService',
        key: cacheKey,
        ttl,
      });

      return true;
    } catch (error) {
      this.logger.error('Failed to set cache', {
        component: 'RedisCacheService',
        key,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Get cache value
   */
  async get<T = any>(key: string, options?: CacheOptions): Promise<T | null> {
    if (!this.isConnected()) {
      this.logger.warn('Redis not connected, skipping get', {
        component: 'RedisCacheService',
      });
      this.stats.misses++;
      return null;
    }

    try {
      const cacheKey = this.generateKey(key, options?.namespace);
      const value = await this.client!.get(cacheKey);

      if (value === null) {
        this.stats.misses++;
        this.logger.debug('Cache miss', {
          component: 'RedisCacheService',
          key: cacheKey,
        });
        return null;
      }

      this.stats.hits++;
      this.logger.debug('Cache hit', {
        component: 'RedisCacheService',
        key: cacheKey,
      });

      // Deserialize JSON
      return JSON.parse(value) as T;
    } catch (error) {
      this.logger.error('Failed to get cache', {
        component: 'RedisCacheService',
        key,
        error: error instanceof Error ? error.message : String(error),
      });
      this.stats.misses++;
      return null;
    }
  }

  /**
   * Delete cache value
   */
  async delete(key: string, options?: CacheOptions): Promise<boolean> {
    if (!this.isConnected()) {
      return false;
    }

    try {
      const cacheKey = this.generateKey(key, options?.namespace);
      await this.client!.del(cacheKey);

      this.logger.debug('Cache deleted', {
        component: 'RedisCacheService',
        key: cacheKey,
      });

      return true;
    } catch (error) {
      this.logger.error('Failed to delete cache', {
        component: 'RedisCacheService',
        key,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Check if key exists
   */
  async exists(key: string, options?: CacheOptions): Promise<boolean> {
    if (!this.isConnected()) {
      return false;
    }

    try {
      const cacheKey = this.generateKey(key, options?.namespace);
      const result = await this.client!.exists(cacheKey);
      return result === 1;
    } catch (error) {
      this.logger.error('Failed to check cache existence', {
        component: 'RedisCacheService',
        key,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }

  /**
   * Get remaining TTL for a key
   */
  async getTTL(key: string, options?: CacheOptions): Promise<number> {
    if (!this.isConnected()) {
      return -2;
    }

    try {
      const cacheKey = this.generateKey(key, options?.namespace);
      return await this.client!.ttl(cacheKey);
    } catch (error) {
      this.logger.error('Failed to get TTL', {
        component: 'RedisCacheService',
        key,
        error: error instanceof Error ? error.message : String(error),
      });
      return -2;
    }
  }

  /**
   * Invalidate cache by pattern
   */
  async invalidatePattern(pattern: string, options?: CacheOptions): Promise<number> {
    if (!this.isConnected()) {
      return 0;
    }

    try {
      const cachePattern = this.generateKey(pattern, options?.namespace);
      const keys = await this.client!.keys(cachePattern);

      if (keys.length === 0) {
        return 0;
      }

      await this.client!.del(keys);

      this.logger.info('Cache pattern invalidated', {
        component: 'RedisCacheService',
        pattern: cachePattern,
        count: keys.length,
      });

      return keys.length;
    } catch (error) {
      this.logger.error('Failed to invalidate cache pattern', {
        component: 'RedisCacheService',
        pattern,
        error: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }
  }

  /**
   * Clear entire cache namespace
   */
  async clearNamespace(namespace: string): Promise<number> {
    return this.invalidatePattern('*', { namespace });
  }

  /**
   * Clear entire cache (use with caution!)
   */
  async clearAll(): Promise<void> {
    if (!this.isConnected()) {
      return;
    }

    try {
      await this.client!.flushDb();

      this.logger.warn('Entire cache cleared', {
        component: 'RedisCacheService',
      });
    } catch (error) {
      this.logger.error('Failed to clear cache', {
        component: 'RedisCacheService',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<CacheStats> {
    const stats: CacheStats = {
      connected: this.isConnected(),
      hits: this.stats.hits,
      misses: this.stats.misses,
      hitRate:
        this.stats.hits + this.stats.misses > 0
          ? this.stats.hits / (this.stats.hits + this.stats.misses)
          : 0,
    };

    if (this.isConnected()) {
      try {
        const info = await this.client!.info('memory');
        const memoryMatch = info.match(/used_memory_human:(.+)/);
        if (memoryMatch) {
          stats.memoryUsage = memoryMatch[1].trim();
        }

        stats.keys = await this.client!.dbSize();
      } catch (error) {
        this.logger.error('Failed to get cache stats', {
          component: 'RedisCacheService',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return stats;
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = { hits: 0, misses: 0 };
  }

  /**
   * Cache with function
   * Gets from cache if exists, otherwise executes function and caches result
   */
  async getOrSet<T>(
    key: string,
    fn: () => Promise<T>,
    options?: CacheOptions
  ): Promise<T> {
    // Try to get from cache
    const cached = await this.get<T>(key, options);
    if (cached !== null) {
      return cached;
    }

    // Execute function
    const result = await fn();

    // Cache result
    await this.set(key, result, options);

    return result;
  }

  /**
   * Specialized: Cache password breach check result
   */
  async cachePasswordBreachResult(
    passwordHash: string,
    result: { isPwned: boolean; breachCount: number }
  ): Promise<boolean> {
    return this.set(`pwned:${passwordHash}`, result, {
      ttl: this.PWNED_CACHE_TTL,
      namespace: 'security',
    });
  }

  /**
   * Specialized: Get cached password breach result
   */
  async getCachedPasswordBreachResult(
    passwordHash: string
  ): Promise<{ isPwned: boolean; breachCount: number } | null> {
    return this.get<{ isPwned: boolean; breachCount: number }>(`pwned:${passwordHash}`, {
      namespace: 'security',
    });
  }

  /**
   * Specialized: Invalidate all password breach cache
   */
  async invalidatePasswordBreachCache(): Promise<number> {
    return this.invalidatePattern('pwned:*', { namespace: 'security' });
  }

  /**
   * Specialized: Cache session data
   */
  async cacheSession(sessionId: string, data: any, ttl: number = 3600): Promise<boolean> {
    return this.set(sessionId, data, {
      ttl,
      namespace: 'session',
    });
  }

  /**
   * Specialized: Get cached session
   */
  async getCachedSession<T = any>(sessionId: string): Promise<T | null> {
    return this.get<T>(sessionId, { namespace: 'session' });
  }

  /**
   * Specialized: Delete session
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    return this.delete(sessionId, { namespace: 'session' });
  }

  /**
   * Specialized: Rate limiting
   */
  async incrementRateLimit(
    identifier: string,
    windowSeconds: number = 60
  ): Promise<number> {
    if (!this.isConnected()) {
      return 0;
    }

    try {
      const key = this.generateKey(identifier, 'ratelimit');

      // Use Redis INCR for atomic increment
      const count = await this.client!.incr(key);

      // Set expiry on first request
      if (count === 1) {
        await this.client!.expire(key, windowSeconds);
      }

      return count;
    } catch (error) {
      this.logger.error('Failed to increment rate limit', {
        component: 'RedisCacheService',
        identifier,
        error: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }
  }

  /**
   * Specialized: Get rate limit count
   */
  async getRateLimitCount(identifier: string): Promise<number> {
    if (!this.isConnected()) {
      return 0;
    }

    try {
      const key = this.generateKey(identifier, 'ratelimit');
      const value = await this.client!.get(key);
      return value ? parseInt(value, 10) : 0;
    } catch (error) {
      this.logger.error('Failed to get rate limit count', {
        component: 'RedisCacheService',
        identifier,
        error: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }
  }

  /**
   * Specialized: Reset rate limit
   */
  async resetRateLimit(identifier: string): Promise<boolean> {
    return this.delete(identifier, { namespace: 'ratelimit' });
  }

  /**
   * Disconnect Redis client
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      try {
        await this.client.quit();
        this.connected = false;
        this.logger.info('Redis client disconnected gracefully', {
          component: 'RedisCacheService',
        });
      } catch (error) {
        this.logger.error('Error disconnecting Redis', {
          component: 'RedisCacheService',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    if (!this.isConnected()) {
      return false;
    }

    try {
      await this.client!.ping();
      return true;
    } catch (error) {
      this.logger.error('Redis health check failed', {
        component: 'RedisCacheService',
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }
}

// Singleton instance
let redisCacheServiceInstance: RedisCacheService | null = null;

export function initializeRedisCacheService(url?: string): Promise<RedisCacheService> {
  if (!redisCacheServiceInstance) {
    redisCacheServiceInstance = new RedisCacheService();
    return redisCacheServiceInstance.initialize(url).then(() => redisCacheServiceInstance!);
  }
  return Promise.resolve(redisCacheServiceInstance);
}

export function getRedisCacheService(): RedisCacheService {
  if (!redisCacheServiceInstance) {
    throw new Error('RedisCacheService not initialized. Call initializeRedisCacheService first.');
  }
  return redisCacheServiceInstance;
}

export default RedisCacheService;
