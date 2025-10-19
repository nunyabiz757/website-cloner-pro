import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { captureException, extractRequestContext, isSentryEnabled } from '../utils/sentry.util.js';

// Error types
export class AppError extends Error {
  statusCode: number;
  isOperational: boolean;
  code?: string;

  constructor(message: string, statusCode: number = 500, code?: string) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = true;
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  details?: any[];

  constructor(message: string, details?: any[]) {
    super(message, 400, 'VALIDATION_ERROR');
    this.details = details;
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(message, 401, 'AUTH_REQUIRED');
  }
}

export class AuthorizationError extends AppError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, 403, 'FORBIDDEN');
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found') {
    super(message, 404, 'NOT_FOUND');
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, 'CONFLICT');
  }
}

export class RateLimitError extends AppError {
  retryAfter?: number;

  constructor(message: string = 'Too many requests', retryAfter?: number) {
    super(message, 429, 'RATE_LIMIT_EXCEEDED');
    this.retryAfter = retryAfter;
  }
}

export class InternalServerError extends AppError {
  constructor(message: string = 'Internal server error') {
    super(message, 500, 'INTERNAL_ERROR');
  }
}

/**
 * Sanitize error for production
 * Removes stack traces and sensitive information
 */
const sanitizeError = (error: any, isDevelopment: boolean) => {
  const sanitized: any = {
    success: false,
    error: error.message || 'An error occurred',
    code: error.code || 'UNKNOWN_ERROR',
  };

  // Add status code if available
  if (error.statusCode) {
    sanitized.statusCode = error.statusCode;
  }

  // Add validation details if available
  if (error.details) {
    sanitized.details = error.details;
  }

  // Add retry after for rate limit errors
  if (error.retryAfter) {
    sanitized.retryAfter = error.retryAfter;
  }

  // Only include stack trace in development
  if (isDevelopment && error.stack) {
    sanitized.stack = error.stack;
  }

  // Add request ID if available
  if (error.requestId) {
    sanitized.requestId = error.requestId;
  }

  return sanitized;
};

/**
 * Handle Zod validation errors
 */
const handleZodError = (error: ZodError) => {
  const details = error.errors.map((err) => ({
    field: err.path.join('.'),
    message: err.message,
    code: err.code,
  }));

  return new ValidationError('Validation failed', details);
};

/**
 * Handle database errors
 */
const handleDatabaseError = (error: any) => {
  // PostgreSQL unique constraint violation
  if (error.code === '23505') {
    return new ConflictError('Resource already exists');
  }

  // PostgreSQL foreign key violation
  if (error.code === '23503') {
    return new ValidationError('Referenced resource does not exist');
  }

  // PostgreSQL not null violation
  if (error.code === '23502') {
    return new ValidationError('Required field is missing');
  }

  return new InternalServerError('Database error occurred');
};

/**
 * Handle JWT errors
 */
const handleJWTError = (error: any) => {
  if (error.name === 'JsonWebTokenError') {
    return new AuthenticationError('Invalid token');
  }

  if (error.name === 'TokenExpiredError') {
    return new AuthenticationError('Token expired');
  }

  return new AuthenticationError('Authentication failed');
};

/**
 * Log error to monitoring service
 */
const logError = (error: any, req: Request) => {
  const errorLog = {
    message: error.message,
    stack: error.stack,
    statusCode: error.statusCode,
    code: error.code,
    timestamp: new Date().toISOString(),
    path: req.path,
    method: req.method,
    ip: req.ip,
    userId: req.user ? (req.user as any).userId : 'anonymous',
    userAgent: req.headers['user-agent'],
  };

  // In production, send to monitoring service (Sentry, DataDog, etc.)
  if (process.env.NODE_ENV === 'production') {
    // Send to Sentry
    if (isSentryEnabled()) {
      const context = extractRequestContext(req);

      captureException(error, {
        user: context.user,
        tags: {
          ...context.tags,
          statusCode: String(error.statusCode || 500),
          errorCode: error.code || 'UNKNOWN_ERROR',
        },
        extra: {
          ...context.extra,
          errorLog,
        },
        level: error.statusCode >= 500 ? 'error' : 'warning',
        fingerprint: [
          error.code || 'unknown',
          req.path,
          String(error.statusCode || 500),
        ],
      });
    }

    console.error('Error:', JSON.stringify(errorLog));
  } else {
    console.error('Error:', errorLog);
  }
};

/**
 * Global error handler middleware
 * Catches all errors and sends appropriate responses
 */
export const errorHandler = (
  error: any,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const isDevelopment = process.env.NODE_ENV !== 'production';

  // Log error
  logError(error, req);

  // Handle specific error types
  let processedError = error;

  if (error instanceof ZodError) {
    processedError = handleZodError(error);
  } else if (error.code && error.code.startsWith('23')) {
    processedError = handleDatabaseError(error);
  } else if (error.name && (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError')) {
    processedError = handleJWTError(error);
  } else if (!(error instanceof AppError)) {
    // Convert unknown errors to InternalServerError
    processedError = new InternalServerError(
      isDevelopment ? error.message : 'An unexpected error occurred'
    );
  }

  // Sanitize error for response
  const sanitized = sanitizeError(processedError, isDevelopment);

  // Send response
  const statusCode = processedError.statusCode || 500;
  res.status(statusCode).json(sanitized);
};

/**
 * 404 Not Found handler
 * Handles requests to non-existent routes
 */
export const notFoundHandler = (req: Request, res: Response, next: NextFunction): void => {
  const error = new NotFoundError(`Route ${req.method} ${req.path} not found`);
  next(error);
};

/**
 * Async error wrapper
 * Wraps async route handlers to catch errors
 */
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Unhandled rejection handler
 * Catches unhandled promise rejections
 */
export const handleUnhandledRejection = () => {
  process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);

    // Send alert to monitoring service
    if (isSentryEnabled()) {
      captureException(reason instanceof Error ? reason : new Error(String(reason)), {
        tags: {
          type: 'unhandled_rejection',
        },
        extra: {
          promise: String(promise),
        },
        level: 'error',
        fingerprint: ['unhandled-rejection', String(reason)],
      });
    }

    // In production, you might want to restart the process or alert
    if (process.env.NODE_ENV === 'production') {
      // process.exit(1); // Optionally exit and let process manager restart
    }
  });
};

/**
 * Uncaught exception handler
 * Catches uncaught exceptions
 */
export const handleUncaughtException = () => {
  process.on('uncaughtException', (error: Error) => {
    console.error('Uncaught Exception:', error);

    // Send alert to monitoring service
    if (isSentryEnabled()) {
      captureException(error, {
        tags: {
          type: 'uncaught_exception',
          fatal: 'true',
        },
        level: 'fatal',
        fingerprint: ['uncaught-exception', error.message],
      });

      // Flush Sentry events before exiting
      import('../utils/sentry.util.js').then(({ flush }) => {
        flush(2000).finally(() => {
          if (process.env.NODE_ENV === 'production') {
            process.exit(1);
          }
        });
      });
    } else {
      // In production, exit immediately as the application state is uncertain
      if (process.env.NODE_ENV === 'production') {
        process.exit(1);
      }
    }
  });
};
