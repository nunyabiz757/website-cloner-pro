import { Request, Response, NextFunction } from 'express';
import { getDatabaseUtil, QueryOptions } from '../utils/database.util.js';
import { AppLogger } from '../services/logger.service.js';

/**
 * Query Timeout Middleware
 * Wraps database operations with timeout controls and monitoring
 */

export interface QueryTimeoutOptions {
  timeout?: number; // Query timeout in milliseconds
  slowQueryThreshold?: number; // Log queries slower than this
  auditQueries?: boolean; // Enable audit logging
  maxRows?: number; // Maximum rows to prevent data exfiltration
}

/**
 * Configure default query options for the request
 */
export const configureQueryTimeout = (options: QueryTimeoutOptions = {}) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Attach query options to request for use in controllers
    (req as any).queryOptions = {
      timeout: options.timeout || 30000,
      slowQueryThreshold: options.slowQueryThreshold || 1000,
      auditQueries: options.auditQueries || false,
      maxRows: options.maxRows,
    };

    next();
  };
};

/**
 * Get query options from request with user context
 */
export function getQueryOptions(req: Request, customOptions: Partial<QueryOptions> = {}): QueryOptions {
  const baseOptions = (req as any).queryOptions || {};
  const userId = req.user && 'userId' in req.user ? req.user.userId : undefined;

  return {
    timeout: customOptions.timeout || baseOptions.timeout || 30000,
    logSlowQuery: customOptions.logSlowQuery !== false,
    slowQueryThreshold: customOptions.slowQueryThreshold || baseOptions.slowQueryThreshold || 1000,
    audit: customOptions.audit || baseOptions.auditQueries || false,
    auditUserId: customOptions.auditUserId || userId,
    auditAction: customOptions.auditAction,
    maxRows: customOptions.maxRows || baseOptions.maxRows,
    sanitizeResult: customOptions.sanitizeResult || false,
  };
}

/**
 * Execute query with timeout and monitoring
 * Use this helper in controllers for consistent query execution
 */
export async function executeQuery<T = any>(
  req: Request,
  query: string | { text: string; values: any[]; name?: string },
  values?: any[],
  customOptions: Partial<QueryOptions> = {}
): Promise<T> {
  const dbUtil = getDatabaseUtil();
  const options = getQueryOptions(req, customOptions);

  try {
    const result = await dbUtil.query(query, values, options);
    return result.rows as T;
  } catch (error) {
    AppLogger.error('Query execution failed in middleware wrapper', error as Error, {
      userId: options.auditUserId,
    });
    throw error;
  }
}

/**
 * Execute transaction with timeout and monitoring
 */
export async function executeTransaction<T>(
  req: Request,
  callback: (client: any) => Promise<T>,
  customOptions: Partial<QueryOptions> = {}
): Promise<T> {
  const dbUtil = getDatabaseUtil();
  const options = getQueryOptions(req, customOptions);

  try {
    return await dbUtil.transaction(callback, options);
  } catch (error) {
    AppLogger.error('Transaction execution failed in middleware wrapper', error as Error, {
      userId: options.auditUserId,
    });
    throw error;
  }
}

/**
 * Middleware to enforce strict query timeout for sensitive operations
 */
export const strictQueryTimeout = (timeoutMs: number = 10000) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const existingOptions = (req as any).queryOptions || {};

    (req as any).queryOptions = {
      ...existingOptions,
      timeout: timeoutMs,
      auditQueries: true, // Always audit strict timeout queries
    };

    next();
  };
};

/**
 * Middleware to limit maximum rows returned (prevent data exfiltration)
 */
export const limitQueryResults = (maxRows: number = 1000) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const existingOptions = (req as any).queryOptions || {};

    (req as any).queryOptions = {
      ...existingOptions,
      maxRows,
    };

    next();
  };
};

/**
 * Middleware to enable query auditing for sensitive routes
 */
export const auditQueries = (action?: string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const existingOptions = (req as any).queryOptions || {};

    (req as any).queryOptions = {
      ...existingOptions,
      auditQueries: true,
      auditAction: action || `${req.method} ${req.path}`,
    };

    next();
  };
};

/**
 * Middleware to sanitize query results (remove sensitive fields)
 */
export const sanitizeQueryResults = (req: Request, res: Response, next: NextFunction): void => {
  const existingOptions = (req as any).queryOptions || {};

  (req as any).queryOptions = {
    ...existingOptions,
    sanitizeResult: true,
  };

  next();
};

/**
 * Middleware to monitor slow queries on specific routes
 */
export const monitorSlowQueries = (thresholdMs: number = 500) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const existingOptions = (req as any).queryOptions || {};

    (req as any).queryOptions = {
      ...existingOptions,
      slowQueryThreshold: thresholdMs,
      logSlowQuery: true,
    };

    next();
  };
};

/**
 * Middleware combo for high-security routes
 * Combines timeout, auditing, and result limiting
 */
export const highSecurityQuery = (options: {
  timeout?: number;
  maxRows?: number;
  action?: string;
} = {}) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    (req as any).queryOptions = {
      timeout: options.timeout || 10000,
      maxRows: options.maxRows || 100,
      auditQueries: true,
      auditAction: options.action || `HIGH_SECURITY_${req.method}_${req.path}`,
      sanitizeResult: true,
      logSlowQuery: true,
      slowQueryThreshold: 500,
    };

    next();
  };
};

/**
 * Query timeout error handler middleware
 * Place after routes to catch timeout errors
 */
export const handleQueryTimeout = (
  error: any,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Check if error is a query timeout error
  if (error.message && error.message.includes('statement timeout')) {
    AppLogger.logSecurityEvent('database.query_timeout', 'medium', {
      path: req.path,
      method: req.method,
      userId: req.user && 'userId' in req.user ? req.user.userId : undefined,
      timeout: (req as any).queryOptions?.timeout,
    });

    res.status(408).json({
      success: false,
      error: 'Query timeout - operation took too long',
      code: 'QUERY_TIMEOUT',
    });
    return;
  }

  // Check if error is a connection timeout
  if (error.code === 'ETIMEDOUT' || error.code === 'ECONNRESET') {
    AppLogger.error('Database connection timeout', error, {
      path: req.path,
      method: req.method,
    });

    res.status(503).json({
      success: false,
      error: 'Database connection timeout',
      code: 'DB_CONNECTION_TIMEOUT',
    });
    return;
  }

  // Pass to next error handler if not a timeout error
  next(error);
};

/**
 * Database health check middleware
 * Use on health check endpoints
 */
export const databaseHealthCheck = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const dbUtil = getDatabaseUtil();
    const health = await dbUtil.healthCheck();

    if (!health.healthy) {
      res.status(503).json({
        success: false,
        error: 'Database unhealthy',
        code: 'DB_UNHEALTHY',
        details: {
          latency: health.latency,
          error: health.error,
        },
      });
      return;
    }

    // Attach health info to request
    (req as any).dbHealth = health;
    next();
  } catch (error) {
    AppLogger.error('Database health check failed', error as Error);

    res.status(503).json({
      success: false,
      error: 'Database health check failed',
      code: 'DB_HEALTH_CHECK_FAILED',
    });
  }
};

/**
 * Get database and query statistics
 * Use for monitoring endpoints
 */
export const getDatabaseStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const dbUtil = getDatabaseUtil();

    const poolStats = dbUtil.getPoolStats();
    const queryStats = dbUtil.getQueryStats();
    const slowQueries = dbUtil.getSlowQueries(10);
    const recentQueries = dbUtil.getRecentQueries(20);

    res.json({
      success: true,
      data: {
        pool: poolStats,
        queries: queryStats,
        slowQueries: slowQueries.map((q) => ({
          queryId: q.queryId,
          query: q.query.substring(0, 100), // Truncate for security
          duration: q.duration,
          threshold: q.threshold,
          timestamp: q.timestamp,
        })),
        recentQueries: recentQueries.map((q) => ({
          queryId: q.queryId,
          query: q.query.substring(0, 100), // Truncate for security
          duration: q.duration,
          rowCount: q.rowCount,
          success: q.success,
          timestamp: q.timestamp,
        })),
      },
    });
  } catch (error) {
    AppLogger.error('Failed to get database stats', error as Error);

    res.status(500).json({
      success: false,
      error: 'Failed to retrieve database statistics',
      code: 'DB_STATS_ERROR',
    });
  }
};

/**
 * Clear database statistics
 * Admin utility
 */
export const clearDatabaseStats = async (req: Request, res: Response): Promise<void> => {
  try {
    const dbUtil = getDatabaseUtil();
    dbUtil.clearStats();

    AppLogger.info('Database statistics cleared', {
      userId: req.user && 'userId' in req.user ? req.user.userId : undefined,
    });

    res.json({
      success: true,
      message: 'Database statistics cleared successfully',
    });
  } catch (error) {
    AppLogger.error('Failed to clear database stats', error as Error);

    res.status(500).json({
      success: false,
      error: 'Failed to clear database statistics',
      code: 'DB_STATS_CLEAR_ERROR',
    });
  }
};
