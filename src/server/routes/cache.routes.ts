import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getRedisCacheService } from '../services/redis-cache.service.js';
import {
  getEnhancedPwnedService,
  initializeEnhancedPwnedService,
} from '../services/pwned-enhanced.service.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { requireRole } from '../middleware/rbac.middleware.js';
import { AppLogger } from '../utils/logger.util.js';

/**
 * Cache Management Routes
 *
 * Provides REST API for:
 * - Cache statistics and monitoring
 * - Cache invalidation
 * - Password breach cache management
 * - Cache warming
 * - Health checks
 *
 * Security:
 * - All routes require authentication
 * - Admin routes require 'admin' role
 * - Password operations require 'user' role
 */

const router = Router();
const logger = AppLogger.getInstance();

// Validation schemas
const warmUpCacheSchema = z.object({
  passwords: z.array(z.string().min(1)).min(1).max(100),
});

const invalidatePasswordSchema = z.object({
  password: z.string().min(1),
});

const checkPasswordSchema = z.object({
  password: z.string().min(1),
  comprehensive: z.boolean().optional().default(false),
});

const batchCheckSchema = z.object({
  passwords: z.array(z.string().min(1)).min(1).max(50),
});

const generatePasswordSchema = z.object({
  length: z.number().int().min(8).max(128).optional().default(16),
  includeLowercase: z.boolean().optional().default(true),
  includeUppercase: z.boolean().optional().default(true),
  includeNumbers: z.boolean().optional().default(true),
  includeSpecial: z.boolean().optional().default(true),
  excludeSimilar: z.boolean().optional().default(false),
});

const setCacheSchema = z.object({
  key: z.string().min(1),
  value: z.any(),
  ttl: z.number().int().min(1).optional(),
  namespace: z.string().optional(),
});

const getCacheSchema = z.object({
  key: z.string().min(1),
  namespace: z.string().optional(),
});

const deleteCacheSchema = z.object({
  key: z.string().min(1),
  namespace: z.string().optional(),
});

const invalidatePatternSchema = z.object({
  pattern: z.string().min(1),
  namespace: z.string().optional(),
});

const clearNamespaceSchema = z.object({
  namespace: z.string().min(1),
});

/**
 * GET /api/cache/stats
 * Get cache statistics
 * Requires: Authentication
 */
router.get('/stats', authenticate, async (req: Request, res: Response) => {
  try {
    const cacheService = getRedisCacheService();
    const pwnedService = getEnhancedPwnedService();

    const [cacheStats, pwnedStats] = await Promise.all([
      cacheService.getStats(),
      pwnedService.getCacheStats(),
    ]);

    await logger.info('Cache statistics retrieved', {
      component: 'CacheRoutes',
      userId: (req.user as any)?.userId,
    });

    res.json({
      cache: cacheStats,
      passwordBreach: pwnedStats,
    });
  } catch (error) {
    await logger.error('Failed to get cache statistics', {
      component: 'CacheRoutes',
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      error: 'Failed to get cache statistics',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/cache/health
 * Check cache health
 * Requires: Authentication
 */
router.get('/health', authenticate, async (req: Request, res: Response) => {
  try {
    const cacheService = getRedisCacheService();
    const isHealthy = await cacheService.healthCheck();

    await logger.info('Cache health check performed', {
      component: 'CacheRoutes',
      userId: (req.user as any)?.userId,
      healthy: isHealthy,
    });

    res.json({
      healthy: isHealthy,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    await logger.error('Cache health check failed', {
      component: 'CacheRoutes',
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      healthy: false,
      error: 'Health check failed',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/cache/password-breach/check
 * Check if password has been breached
 * Requires: Authentication
 */
router.post(
  '/password-breach/check',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const validation = checkPasswordSchema.safeParse(req.body);

      if (!validation.success) {
        return res.status(400).json({
          error: 'Validation failed',
          details: validation.error.errors,
        });
      }

      const { password, comprehensive } = validation.data;
      const pwnedService = getEnhancedPwnedService();

      let result;
      if (comprehensive) {
        result = await pwnedService.checkPasswordComprehensive(password);
      } else {
        result = await pwnedService.checkPassword(password);
      }

      await logger.info('Password breach check performed', {
        component: 'CacheRoutes',
        userId: (req.user as any)?.userId,
        isPwned: result.isPwned,
        cached: result.cached,
      });

      res.json(result);
    } catch (error) {
      await logger.error('Password breach check failed', {
        component: 'CacheRoutes',
        error: error instanceof Error ? error.message : String(error),
      });

      res.status(500).json({
        error: 'Password breach check failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

/**
 * POST /api/cache/password-breach/check-batch
 * Check multiple passwords for breaches
 * Requires: Authentication
 */
router.post(
  '/password-breach/check-batch',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const validation = batchCheckSchema.safeParse(req.body);

      if (!validation.success) {
        return res.status(400).json({
          error: 'Validation failed',
          details: validation.error.errors,
        });
      }

      const { passwords } = validation.data;
      const pwnedService = getEnhancedPwnedService();

      const results = await pwnedService.checkPasswordsBatch(passwords);

      await logger.info('Batch password breach check performed', {
        component: 'CacheRoutes',
        userId: (req.user as any)?.userId,
        count: passwords.length,
        pwnedCount: results.filter((r) => r.isPwned).length,
      });

      res.json({ results });
    } catch (error) {
      await logger.error('Batch password breach check failed', {
        component: 'CacheRoutes',
        error: error instanceof Error ? error.message : String(error),
      });

      res.status(500).json({
        error: 'Batch password breach check failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

/**
 * POST /api/cache/password-breach/generate
 * Generate strong password
 * Requires: Authentication
 */
router.post(
  '/password-breach/generate',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const validation = generatePasswordSchema.safeParse(req.body);

      if (!validation.success) {
        return res.status(400).json({
          error: 'Validation failed',
          details: validation.error.errors,
        });
      }

      const { length, ...options } = validation.data;
      const pwnedService = getEnhancedPwnedService();

      const password = pwnedService.generateStrongPassword(length, options);

      // Optionally check the generated password
      const strength = pwnedService.getPasswordStrength(password);

      await logger.info('Password generated', {
        component: 'CacheRoutes',
        userId: (req.user as any)?.userId,
        length,
        score: strength.score,
      });

      res.json({
        password,
        strength,
      });
    } catch (error) {
      await logger.error('Password generation failed', {
        component: 'CacheRoutes',
        error: error instanceof Error ? error.message : String(error),
      });

      res.status(500).json({
        error: 'Password generation failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

/**
 * POST /api/cache/password-breach/warm-up
 * Warm up cache with common passwords
 * Requires: Admin role
 */
router.post(
  '/password-breach/warm-up',
  authenticate,
  requireRole(['admin']),
  async (req: Request, res: Response) => {
    try {
      const validation = warmUpCacheSchema.safeParse(req.body);

      if (!validation.success) {
        return res.status(400).json({
          error: 'Validation failed',
          details: validation.error.errors,
        });
      }

      const { passwords } = validation.data;
      const pwnedService = getEnhancedPwnedService();

      const cached = await pwnedService.warmUpCache(passwords);

      await logger.info('Cache warmed up', {
        component: 'CacheRoutes',
        userId: (req.user as any)?.userId,
        requested: passwords.length,
        cached,
      });

      res.json({
        message: 'Cache warmed up successfully',
        requested: passwords.length,
        cached,
      });
    } catch (error) {
      await logger.error('Cache warm-up failed', {
        component: 'CacheRoutes',
        error: error instanceof Error ? error.message : String(error),
      });

      res.status(500).json({
        error: 'Cache warm-up failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

/**
 * POST /api/cache/password-breach/invalidate
 * Invalidate password breach cache
 * Requires: Admin role
 */
router.post(
  '/password-breach/invalidate',
  authenticate,
  requireRole(['admin']),
  async (req: Request, res: Response) => {
    try {
      const pwnedService = getEnhancedPwnedService();
      const count = await pwnedService.invalidateCache();

      await logger.info('Password breach cache invalidated', {
        component: 'CacheRoutes',
        userId: (req.user as any)?.userId,
        count,
      });

      res.json({
        message: 'Password breach cache invalidated successfully',
        count,
      });
    } catch (error) {
      await logger.error('Cache invalidation failed', {
        component: 'CacheRoutes',
        error: error instanceof Error ? error.message : String(error),
      });

      res.status(500).json({
        error: 'Cache invalidation failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

/**
 * POST /api/cache/password-breach/invalidate-password
 * Invalidate specific password from cache
 * Requires: Admin role
 */
router.post(
  '/password-breach/invalidate-password',
  authenticate,
  requireRole(['admin']),
  async (req: Request, res: Response) => {
    try {
      const validation = invalidatePasswordSchema.safeParse(req.body);

      if (!validation.success) {
        return res.status(400).json({
          error: 'Validation failed',
          details: validation.error.errors,
        });
      }

      const { password } = validation.data;
      const cacheService = getRedisCacheService();

      // Hash password and delete from cache
      const crypto = await import('crypto');
      const hash = crypto.createHash('sha1').update(password).digest('hex').toUpperCase();

      const deleted = await cacheService.delete(`pwned:${hash}`, { namespace: 'security' });

      await logger.info('Password invalidated from cache', {
        component: 'CacheRoutes',
        userId: (req.user as any)?.userId,
        deleted,
      });

      res.json({
        message: deleted
          ? 'Password invalidated from cache successfully'
          : 'Password not found in cache',
        deleted,
      });
    } catch (error) {
      await logger.error('Password invalidation failed', {
        component: 'CacheRoutes',
        error: error instanceof Error ? error.message : String(error),
      });

      res.status(500).json({
        error: 'Password invalidation failed',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

/**
 * POST /api/cache/set
 * Set cache value
 * Requires: Admin role
 */
router.post('/set', authenticate, requireRole(['admin']), async (req: Request, res: Response) => {
  try {
    const validation = setCacheSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validation.error.errors,
      });
    }

    const { key, value, ttl, namespace } = validation.data;
    const cacheService = getRedisCacheService();

    const success = await cacheService.set(key, value, { ttl, namespace });

    await logger.info('Cache value set', {
      component: 'CacheRoutes',
      userId: (req.user as any)?.userId,
      key,
      namespace,
      success,
    });

    res.json({
      message: success ? 'Cache value set successfully' : 'Failed to set cache value',
      success,
    });
  } catch (error) {
    await logger.error('Failed to set cache value', {
      component: 'CacheRoutes',
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      error: 'Failed to set cache value',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/cache/get
 * Get cache value
 * Requires: Admin role
 */
router.post('/get', authenticate, requireRole(['admin']), async (req: Request, res: Response) => {
  try {
    const validation = getCacheSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        error: 'Validation failed',
        details: validation.error.errors,
      });
    }

    const { key, namespace } = validation.data;
    const cacheService = getRedisCacheService();

    const value = await cacheService.get(key, { namespace });
    const ttl = await cacheService.getTTL(key, { namespace });

    await logger.info('Cache value retrieved', {
      component: 'CacheRoutes',
      userId: (req.user as any)?.userId,
      key,
      namespace,
      found: value !== null,
    });

    res.json({
      key,
      value,
      ttl: ttl > 0 ? ttl : null,
      found: value !== null,
    });
  } catch (error) {
    await logger.error('Failed to get cache value', {
      component: 'CacheRoutes',
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      error: 'Failed to get cache value',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * POST /api/cache/delete
 * Delete cache value
 * Requires: Admin role
 */
router.post(
  '/delete',
  authenticate,
  requireRole(['admin']),
  async (req: Request, res: Response) => {
    try {
      const validation = deleteCacheSchema.safeParse(req.body);

      if (!validation.success) {
        return res.status(400).json({
          error: 'Validation failed',
          details: validation.error.errors,
        });
      }

      const { key, namespace } = validation.data;
      const cacheService = getRedisCacheService();

      const deleted = await cacheService.delete(key, { namespace });

      await logger.info('Cache value deleted', {
        component: 'CacheRoutes',
        userId: (req.user as any)?.userId,
        key,
        namespace,
        deleted,
      });

      res.json({
        message: deleted
          ? 'Cache value deleted successfully'
          : 'Cache value not found or failed to delete',
        deleted,
      });
    } catch (error) {
      await logger.error('Failed to delete cache value', {
        component: 'CacheRoutes',
        error: error instanceof Error ? error.message : String(error),
      });

      res.status(500).json({
        error: 'Failed to delete cache value',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

/**
 * POST /api/cache/invalidate-pattern
 * Invalidate cache by pattern
 * Requires: Admin role
 */
router.post(
  '/invalidate-pattern',
  authenticate,
  requireRole(['admin']),
  async (req: Request, res: Response) => {
    try {
      const validation = invalidatePatternSchema.safeParse(req.body);

      if (!validation.success) {
        return res.status(400).json({
          error: 'Validation failed',
          details: validation.error.errors,
        });
      }

      const { pattern, namespace } = validation.data;
      const cacheService = getRedisCacheService();

      const count = await cacheService.invalidatePattern(pattern, { namespace });

      await logger.info('Cache pattern invalidated', {
        component: 'CacheRoutes',
        userId: (req.user as any)?.userId,
        pattern,
        namespace,
        count,
      });

      res.json({
        message: 'Cache pattern invalidated successfully',
        pattern,
        count,
      });
    } catch (error) {
      await logger.error('Failed to invalidate cache pattern', {
        component: 'CacheRoutes',
        error: error instanceof Error ? error.message : String(error),
      });

      res.status(500).json({
        error: 'Failed to invalidate cache pattern',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

/**
 * POST /api/cache/clear-namespace
 * Clear entire cache namespace
 * Requires: Admin role
 */
router.post(
  '/clear-namespace',
  authenticate,
  requireRole(['admin']),
  async (req: Request, res: Response) => {
    try {
      const validation = clearNamespaceSchema.safeParse(req.body);

      if (!validation.success) {
        return res.status(400).json({
          error: 'Validation failed',
          details: validation.error.errors,
        });
      }

      const { namespace } = validation.data;
      const cacheService = getRedisCacheService();

      const count = await cacheService.clearNamespace(namespace);

      await logger.info('Cache namespace cleared', {
        component: 'CacheRoutes',
        userId: (req.user as any)?.userId,
        namespace,
        count,
      });

      res.json({
        message: 'Cache namespace cleared successfully',
        namespace,
        count,
      });
    } catch (error) {
      await logger.error('Failed to clear cache namespace', {
        component: 'CacheRoutes',
        error: error instanceof Error ? error.message : String(error),
      });

      res.status(500).json({
        error: 'Failed to clear cache namespace',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

/**
 * POST /api/cache/clear-all
 * Clear entire cache (DANGEROUS)
 * Requires: Admin role
 */
router.post(
  '/clear-all',
  authenticate,
  requireRole(['admin']),
  async (req: Request, res: Response) => {
    try {
      const cacheService = getRedisCacheService();

      await cacheService.clearAll();

      await logger.warn('Entire cache cleared', {
        component: 'CacheRoutes',
        userId: (req.user as any)?.userId,
      });

      res.json({
        message: 'Entire cache cleared successfully',
        warning: 'All cache data has been deleted',
      });
    } catch (error) {
      await logger.error('Failed to clear entire cache', {
        component: 'CacheRoutes',
        error: error instanceof Error ? error.message : String(error),
      });

      res.status(500).json({
        error: 'Failed to clear entire cache',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

/**
 * POST /api/cache/reset-stats
 * Reset cache statistics
 * Requires: Admin role
 */
router.post(
  '/reset-stats',
  authenticate,
  requireRole(['admin']),
  async (req: Request, res: Response) => {
    try {
      const cacheService = getRedisCacheService();

      cacheService.resetStats();

      await logger.info('Cache statistics reset', {
        component: 'CacheRoutes',
        userId: (req.user as any)?.userId,
      });

      res.json({
        message: 'Cache statistics reset successfully',
      });
    } catch (error) {
      await logger.error('Failed to reset cache statistics', {
        component: 'CacheRoutes',
        error: error instanceof Error ? error.message : String(error),
      });

      res.status(500).json({
        error: 'Failed to reset cache statistics',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
);

export default router;
