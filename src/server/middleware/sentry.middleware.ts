/**
 * Sentry Express Middleware
 *
 * Provides request tracking and performance monitoring for Express applications.
 * Integrates with Sentry's performance monitoring and error tracking.
 */

import { Request, Response, NextFunction } from 'express';
import * as Sentry from '@sentry/node';
import { isSentryEnabled, setUser, addBreadcrumb } from '../utils/sentry.util.js';

/**
 * Sentry request handler middleware
 * Must be used BEFORE all routes
 * Sets up request context and starts transaction
 */
export const sentryRequestHandler = (): any => {
  if (!isSentryEnabled()) {
    // Return no-op middleware if Sentry is disabled
    return (req: Request, res: Response, next: NextFunction) => next();
  }

  return Sentry.Handlers.requestHandler({
    user: ['id', 'email', 'username'],
    ip: true,
    request: ['method', 'url', 'headers', 'query_string'],
    transaction: 'path', // Group by route path
  });
};

/**
 * Sentry tracing middleware
 * Adds performance monitoring for routes
 * Must be used AFTER sentryRequestHandler
 */
export const sentryTracingHandler = (): any => {
  if (!isSentryEnabled()) {
    return (req: Request, res: Response, next: NextFunction) => next();
  }

  return Sentry.Handlers.tracingHandler();
};

/**
 * Sentry error handler middleware
 * Must be used AFTER all routes but BEFORE other error handlers
 */
export const sentryErrorHandler = (): any => {
  if (!isSentryEnabled()) {
    return (req: Request, res: Response, next: NextFunction) => next();
  }

  return Sentry.Handlers.errorHandler({
    shouldHandleError(error) {
      // Only send errors with status code >= 500 to Sentry
      // Client errors (4xx) are typically not bugs
      if (error.statusCode && error.statusCode < 500) {
        return false;
      }
      return true;
    },
  });
};

/**
 * User context middleware
 * Extracts user from JWT and sets Sentry context
 * Must be used AFTER authentication middleware
 */
export const sentryUserContext = (req: Request, res: Response, next: NextFunction): void => {
  if (!isSentryEnabled()) {
    return next();
  }

  try {
    // Extract user from request (set by auth middleware)
    if (req.user) {
      const user = req.user as any;

      setUser({
        id: user.userId || user.id,
        email: user.email,
        username: user.username,
      });
    }

    next();
  } catch (error) {
    console.error('[SENTRY] Failed to set user context:', error);
    next();
  }
};

/**
 * Breadcrumb middleware
 * Adds request breadcrumbs for debugging
 */
export const sentryBreadcrumbMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  if (!isSentryEnabled()) {
    return next();
  }

  try {
    addBreadcrumb({
      message: `${req.method} ${req.path}`,
      category: 'http',
      level: 'info',
      data: {
        method: req.method,
        url: req.url,
        path: req.path,
        query: req.query,
        ip: req.ip,
      },
    });

    next();
  } catch (error) {
    console.error('[SENTRY] Failed to add breadcrumb:', error);
    next();
  }
};

/**
 * Performance monitoring middleware
 * Tracks custom performance metrics
 */
export const sentryPerformanceMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  if (!isSentryEnabled()) {
    return next();
  }

  try {
    const startTime = Date.now();

    // Add response time tracking
    res.on('finish', () => {
      const duration = Date.now() - startTime;

      // Add custom metric
      Sentry.getCurrentHub().getScope()?.setTag('response_time', String(duration));

      // Add breadcrumb with timing
      addBreadcrumb({
        message: `Response sent (${duration}ms)`,
        category: 'performance',
        level: 'info',
        data: {
          duration_ms: duration,
          status_code: res.statusCode,
          path: req.path,
        },
      });
    });

    next();
  } catch (error) {
    console.error('[SENTRY] Failed to track performance:', error);
    next();
  }
};

/**
 * Route-specific performance tracking
 * Use for specific routes that need detailed monitoring
 */
export const trackRoutePerformance = (routeName: string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!isSentryEnabled()) {
      return next();
    }

    try {
      const transaction = Sentry.getCurrentHub().getScope()?.getTransaction();

      if (transaction) {
        // Set transaction name
        transaction.setName(`${req.method} ${routeName}`);

        // Add route tag
        transaction.setTag('route', routeName);

        // Start span for this route
        const span = transaction.startChild({
          op: 'http.route',
          description: `${req.method} ${routeName}`,
        });

        // Finish span when response completes
        res.on('finish', () => {
          span.setTag('http.status_code', String(res.statusCode));
          span.finish();
        });
      }

      next();
    } catch (error) {
      console.error('[SENTRY] Failed to track route performance:', error);
      next();
    }
  };
};

/**
 * Database query tracking helper
 * Use to wrap database queries for performance monitoring
 */
export const trackDatabaseQuery = async <T>(
  queryName: string,
  queryFn: () => Promise<T>
): Promise<T> => {
  if (!isSentryEnabled()) {
    return queryFn();
  }

  const transaction = Sentry.getCurrentHub().getScope()?.getTransaction();

  if (!transaction) {
    return queryFn();
  }

  const span = transaction.startChild({
    op: 'db.query',
    description: queryName,
  });

  try {
    const result = await queryFn();
    span.setStatus('ok');
    return result;
  } catch (error) {
    span.setStatus('internal_error');
    throw error;
  } finally {
    span.finish();
  }
};

/**
 * External API call tracking helper
 * Use to wrap external API calls for performance monitoring
 */
export const trackExternalCall = async <T>(
  serviceName: string,
  endpoint: string,
  callFn: () => Promise<T>
): Promise<T> => {
  if (!isSentryEnabled()) {
    return callFn();
  }

  const transaction = Sentry.getCurrentHub().getScope()?.getTransaction();

  if (!transaction) {
    return callFn();
  }

  const span = transaction.startChild({
    op: 'http.client',
    description: `${serviceName}: ${endpoint}`,
  });

  span.setTag('service', serviceName);

  try {
    const result = await callFn();
    span.setStatus('ok');
    return result;
  } catch (error) {
    span.setStatus('internal_error');
    throw error;
  } finally {
    span.finish();
  }
};
