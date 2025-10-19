/**
 * Sentry Error Monitoring Integration
 *
 * Provides centralized error tracking and performance monitoring using Sentry.
 * This utility initializes Sentry SDK and provides helper functions for
 * capturing errors, setting context, and tracking performance.
 */

import * as Sentry from '@sentry/node';
import { Request } from 'express';

// Optional profiling integration (requires @sentry/profiling-node package)
let ProfilingIntegration: any = null;

/**
 * Check if Sentry is enabled
 */
export const isSentryEnabled = (): boolean => {
  return !!(
    process.env.SENTRY_DSN &&
    process.env.NODE_ENV === 'production'
  );
};

/**
 * Initialize Sentry SDK
 * Should be called once at application startup
 */
export const initializeSentry = async (): Promise<void> => {
  // Only initialize in production with valid DSN
  if (!isSentryEnabled()) {
    console.log('[SENTRY] Disabled - Not in production or SENTRY_DSN not set');
    return;
  }

  // Try to load profiling integration
  try {
    const profilingModule = await import('@sentry/profiling-node');
    ProfilingIntegration = profilingModule.ProfilingIntegration;
  } catch {
    console.log('[SENTRY] Profiling not available (install @sentry/profiling-node for profiling)');
  }

  try {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || 'production',
      release: process.env.npm_package_version || '1.0.0',

      // Performance Monitoring
      tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1'), // 10% of transactions
      profilesSampleRate: parseFloat(process.env.SENTRY_PROFILES_SAMPLE_RATE || '0.1'), // 10% of transactions

      // Integrations
      integrations: [
        // Profiling integration for performance insights (if available)
        ...(ProfilingIntegration ? [new ProfilingIntegration()] : []),

        // HTTP integration for request tracking
        new Sentry.Integrations.Http({ tracing: true }),

        // Express integration (will be set up in middleware)
        new Sentry.Integrations.Express({ app: undefined as any }),

        // Node context integration
        new Sentry.Integrations.OnUncaughtException(),
        new Sentry.Integrations.OnUnhandledRejection(),
      ],

      // Filtering
      ignoreErrors: [
        // Network errors
        'NetworkError',
        'Network request failed',

        // Common client-side errors
        'ResizeObserver loop limit exceeded',
        'Non-Error promise rejection captured',

        // Rate limiting (already handled)
        'RATE_LIMIT_EXCEEDED',

        // Validation errors (not critical)
        'VALIDATION_ERROR',
      ],

      // Before send hook - filter/modify events
      beforeSend(event, hint) {
        const error = hint.originalException;

        // Don't send operational errors (e.g., 404s, validation errors)
        if (error && typeof error === 'object' && 'isOperational' in error) {
          if ((error as any).isOperational && (error as any).statusCode < 500) {
            return null; // Don't send to Sentry
          }
        }

        // Sanitize sensitive data
        if (event.request) {
          // Remove sensitive headers
          if (event.request.headers) {
            delete event.request.headers['authorization'];
            delete event.request.headers['cookie'];
            delete event.request.headers['x-api-key'];
          }

          // Remove sensitive query params
          if (event.request.query_string) {
            event.request.query_string = event.request.query_string
              .replace(/password=[^&]*/gi, 'password=[REDACTED]')
              .replace(/token=[^&]*/gi, 'token=[REDACTED]')
              .replace(/api_key=[^&]*/gi, 'api_key=[REDACTED]');
          }
        }

        // Sanitize breadcrumbs
        if (event.breadcrumbs) {
          event.breadcrumbs = event.breadcrumbs.map(breadcrumb => {
            if (breadcrumb.data) {
              // Remove sensitive data from breadcrumbs
              const sanitized = { ...breadcrumb.data };
              delete sanitized.password;
              delete sanitized.token;
              delete sanitized.apiKey;
              return { ...breadcrumb, data: sanitized };
            }
            return breadcrumb;
          });
        }

        return event;
      },

      // Before breadcrumb hook
      beforeBreadcrumb(breadcrumb, hint) {
        // Don't track health check requests
        if (breadcrumb.category === 'http' && breadcrumb.data?.url?.includes('/health')) {
          return null;
        }
        return breadcrumb;
      },
    });

    console.log('[SENTRY] Initialized successfully');
  } catch (error) {
    console.error('[SENTRY] Initialization failed:', error);
  }
};

/**
 * Capture exception and send to Sentry
 * @param error Error to capture
 * @param context Additional context
 */
export const captureException = (
  error: Error | any,
  context?: {
    user?: { id: string; email?: string; username?: string };
    tags?: Record<string, string>;
    extra?: Record<string, any>;
    level?: Sentry.SeverityLevel;
    fingerprint?: string[];
  }
): string | undefined => {
  if (!isSentryEnabled()) {
    return undefined;
  }

  try {
    // Set user context if provided
    if (context?.user) {
      Sentry.setUser({
        id: context.user.id,
        email: context.user.email,
        username: context.user.username,
      });
    }

    // Set tags if provided
    if (context?.tags) {
      Sentry.setTags(context.tags);
    }

    // Set extra context if provided
    if (context?.extra) {
      Sentry.setExtras(context.extra);
    }

    // Set fingerprint for grouping similar errors
    if (context?.fingerprint) {
      Sentry.configureScope(scope => {
        scope.setFingerprint(context.fingerprint!);
      });
    }

    // Capture the exception
    const eventId = Sentry.captureException(error, {
      level: context?.level || 'error',
    });

    console.log(`[SENTRY] Exception captured: ${eventId}`);
    return eventId;
  } catch (err) {
    console.error('[SENTRY] Failed to capture exception:', err);
    return undefined;
  }
};

/**
 * Capture message (for non-error events)
 * @param message Message to capture
 * @param level Severity level
 * @param context Additional context
 */
export const captureMessage = (
  message: string,
  level: Sentry.SeverityLevel = 'info',
  context?: {
    user?: { id: string; email?: string };
    tags?: Record<string, string>;
    extra?: Record<string, any>;
  }
): string | undefined => {
  if (!isSentryEnabled()) {
    return undefined;
  }

  try {
    if (context?.user) {
      Sentry.setUser(context.user);
    }

    if (context?.tags) {
      Sentry.setTags(context.tags);
    }

    if (context?.extra) {
      Sentry.setExtras(context.extra);
    }

    return Sentry.captureMessage(message, level);
  } catch (err) {
    console.error('[SENTRY] Failed to capture message:', err);
    return undefined;
  }
};

/**
 * Add breadcrumb for tracking user actions
 * @param breadcrumb Breadcrumb data
 */
export const addBreadcrumb = (breadcrumb: {
  message: string;
  category?: string;
  level?: Sentry.SeverityLevel;
  data?: Record<string, any>;
}): void => {
  if (!isSentryEnabled()) {
    return;
  }

  try {
    Sentry.addBreadcrumb({
      message: breadcrumb.message,
      category: breadcrumb.category || 'custom',
      level: breadcrumb.level || 'info',
      data: breadcrumb.data,
      timestamp: Date.now() / 1000,
    });
  } catch (err) {
    console.error('[SENTRY] Failed to add breadcrumb:', err);
  }
};

/**
 * Set user context
 * @param user User information
 */
export const setUser = (user: {
  id: string;
  email?: string;
  username?: string;
  [key: string]: any;
}): void => {
  if (!isSentryEnabled()) {
    return;
  }

  try {
    Sentry.setUser(user);
  } catch (err) {
    console.error('[SENTRY] Failed to set user:', err);
  }
};

/**
 * Clear user context
 */
export const clearUser = (): void => {
  if (!isSentryEnabled()) {
    return;
  }

  try {
    Sentry.setUser(null);
  } catch (err) {
    console.error('[SENTRY] Failed to clear user:', err);
  }
};

/**
 * Set tags for event categorization
 * @param tags Tags object
 */
export const setTags = (tags: Record<string, string>): void => {
  if (!isSentryEnabled()) {
    return;
  }

  try {
    Sentry.setTags(tags);
  } catch (err) {
    console.error('[SENTRY] Failed to set tags:', err);
  }
};

/**
 * Set extra context data
 * @param extras Extra data object
 */
export const setExtras = (extras: Record<string, any>): void => {
  if (!isSentryEnabled()) {
    return;
  }

  try {
    Sentry.setExtras(extras);
  } catch (err) {
    console.error('[SENTRY] Failed to set extras:', err);
  }
};

/**
 * Extract request context for Sentry
 * @param req Express request
 */
export const extractRequestContext = (req: Request): {
  tags: Record<string, string>;
  extra: Record<string, any>;
  user?: { id: string };
} => {
  const context: any = {
    tags: {
      method: req.method,
      path: req.path,
      route: req.route?.path || req.path,
    },
    extra: {
      ip: req.ip,
      userAgent: req.headers['user-agent'],
      referer: req.headers['referer'],
      query: req.query,
      params: req.params,
    },
  };

  // Add user ID if available
  if (req.user && (req.user as any).userId) {
    context.user = { id: (req.user as any).userId };
  }

  return context;
};

/**
 * Start a transaction for performance monitoring
 * @param name Transaction name
 * @param op Operation type
 */
export const startTransaction = (
  name: string,
  op: string = 'http.server'
): Sentry.Transaction | undefined => {
  if (!isSentryEnabled()) {
    return undefined;
  }

  try {
    return Sentry.startTransaction({
      name,
      op,
    });
  } catch (err) {
    console.error('[SENTRY] Failed to start transaction:', err);
    return undefined;
  }
};

/**
 * Flush Sentry events (useful for graceful shutdown)
 * @param timeout Timeout in milliseconds
 */
export const flush = async (timeout: number = 2000): Promise<boolean> => {
  if (!isSentryEnabled()) {
    return true;
  }

  try {
    return await Sentry.flush(timeout);
  } catch (err) {
    console.error('[SENTRY] Failed to flush:', err);
    return false;
  }
};

/**
 * Close Sentry connection (for graceful shutdown)
 */
export const close = async (): Promise<void> => {
  if (!isSentryEnabled()) {
    return;
  }

  try {
    await Sentry.close(2000);
    console.log('[SENTRY] Closed successfully');
  } catch (err) {
    console.error('[SENTRY] Failed to close:', err);
  }
};

// Export Sentry SDK for advanced usage
export { Sentry };
