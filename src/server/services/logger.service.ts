import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import * as Sentry from '@sentry/node';
import path from 'path';

/**
 * Logging and Monitoring Service
 * Implements structured logging with Winston and Sentry integration
 */

// PII patterns to redact from logs
const PII_PATTERNS = [
  { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, replacement: '[EMAIL_REDACTED]' },
  { pattern: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g, replacement: '[PHONE_REDACTED]' },
  { pattern: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: '[SSN_REDACTED]' },
  { pattern: /\b\d{16}\b/g, replacement: '[CC_REDACTED]' },
  { pattern: /"password":\s*"[^"]+"/g, replacement: '"password":"[REDACTED]"' },
  { pattern: /"token":\s*"[^"]+"/g, replacement: '"token":"[REDACTED]"' },
  { pattern: /"secret":\s*"[^"]+"/g, replacement: '"secret":"[REDACTED]"' },
  { pattern: /"apiKey":\s*"[^"]+"/g, replacement: '"apiKey":"[REDACTED]"' },
];

/**
 * Redact PII from log messages
 */
const redactPII = (message: string): string => {
  let redacted = message;
  for (const { pattern, replacement } of PII_PATTERNS) {
    redacted = redacted.replace(pattern, replacement);
  }
  return redacted;
};

/**
 * Custom format for console logs
 */
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, ...metadata }) => {
    let msg = `${timestamp} [${level}]: ${redactPII(message)}`;
    if (Object.keys(metadata).length > 0) {
      msg += `\n${JSON.stringify(metadata, null, 2)}`;
    }
    return msg;
  })
);

/**
 * Custom format for file logs (JSON)
 */
const fileFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format((info) => {
    // Redact PII from all string values
    const redactObject = (obj: any): any => {
      if (typeof obj === 'string') {
        return redactPII(obj);
      }
      if (Array.isArray(obj)) {
        return obj.map(redactObject);
      }
      if (obj && typeof obj === 'object') {
        const redacted: any = {};
        for (const [key, value] of Object.entries(obj)) {
          redacted[key] = redactObject(value);
        }
        return redacted;
      }
      return obj;
    };
    return redactObject(info);
  })()
);

/**
 * Configure transports
 */
const transports: winston.transport[] = [];

// Console transport (development)
if (process.env.NODE_ENV !== 'production') {
  transports.push(
    new winston.transports.Console({
      format: consoleFormat,
      level: 'debug',
    })
  );
}

// File transports with rotation
const logDir = process.env.LOG_DIR || path.join(process.cwd(), 'logs');

// Error logs
transports.push(
  new DailyRotateFile({
    filename: path.join(logDir, 'error-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    level: 'error',
    format: fileFormat,
    maxSize: '20m',
    maxFiles: '14d',
    zippedArchive: true,
  })
);

// Combined logs
transports.push(
  new DailyRotateFile({
    filename: path.join(logDir, 'combined-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    format: fileFormat,
    maxSize: '20m',
    maxFiles: '14d',
    zippedArchive: true,
  })
);

// Security logs (separate for audit trail)
transports.push(
  new DailyRotateFile({
    filename: path.join(logDir, 'security-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    level: 'info',
    format: fileFormat,
    maxSize: '20m',
    maxFiles: '90d', // Keep security logs longer
    zippedArchive: true,
  })
);

/**
 * Create Winston logger
 */
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: fileFormat,
  transports,
  exitOnError: false,
});

/**
 * Initialize Sentry for error tracking
 */
export const initializeSentry = (): void => {
  if (process.env.SENTRY_DSN) {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || 'development',
      tracesSampleRate: parseFloat(process.env.SENTRY_TRACES_SAMPLE_RATE || '0.1'),
      beforeSend(event, hint) {
        // Redact PII from Sentry events
        if (event.message) {
          event.message = redactPII(event.message);
        }
        if (event.exception?.values) {
          event.exception.values = event.exception.values.map(exception => ({
            ...exception,
            value: exception.value ? redactPII(exception.value) : exception.value,
          }));
        }
        return event;
      },
    });
    logger.info('Sentry initialized', { environment: process.env.NODE_ENV });
  }
};

/**
 * Logger interface with typed methods
 */
export interface LogMetadata {
  userId?: string;
  requestId?: string;
  ip?: string;
  userAgent?: string;
  path?: string;
  method?: string;
  statusCode?: number;
  duration?: number;
  [key: string]: any;
}

/**
 * Security logger for audit trail
 */
export class SecurityLogger {
  static logAuthentication(success: boolean, email: string, metadata: LogMetadata = {}): void {
    logger.info('Authentication attempt', {
      event: 'authentication',
      success,
      email: redactPII(email),
      ...metadata,
    });

    if (process.env.SENTRY_DSN && !success) {
      Sentry.captureMessage('Failed authentication attempt', {
        level: 'warning',
        tags: { event: 'authentication' },
        extra: { email: redactPII(email), ...metadata },
      });
    }
  }

  static logAuthorization(success: boolean, resource: string, action: string, metadata: LogMetadata = {}): void {
    logger.info('Authorization check', {
      event: 'authorization',
      success,
      resource,
      action,
      ...metadata,
    });

    if (process.env.SENTRY_DSN && !success) {
      Sentry.captureMessage('Failed authorization attempt', {
        level: 'warning',
        tags: { event: 'authorization' },
        extra: { resource, action, ...metadata },
      });
    }
  }

  static logDataAccess(resource: string, action: 'read' | 'create' | 'update' | 'delete', metadata: LogMetadata = {}): void {
    logger.info('Data access', {
      event: 'data_access',
      resource,
      action,
      ...metadata,
    });
  }

  static logSecurityEvent(event: string, severity: 'low' | 'medium' | 'high' | 'critical', metadata: LogMetadata = {}): void {
    const level = severity === 'critical' || severity === 'high' ? 'error' : 'warn';
    logger.log(level, `Security event: ${event}`, {
      event: 'security',
      severity,
      ...metadata,
    });

    if (process.env.SENTRY_DSN && (severity === 'high' || severity === 'critical')) {
      Sentry.captureMessage(`Security event: ${event}`, {
        level: severity === 'critical' ? 'fatal' : 'error',
        tags: { event: 'security', severity },
        extra: metadata,
      });
    }
  }

  static logPasswordChange(userId: string, metadata: LogMetadata = {}): void {
    logger.info('Password changed', {
      event: 'password_change',
      userId,
      ...metadata,
    });
  }

  static logMFAEvent(event: 'enabled' | 'disabled' | 'verified' | 'failed', userId: string, metadata: LogMetadata = {}): void {
    logger.info(`MFA ${event}`, {
      event: 'mfa',
      mfaEvent: event,
      userId,
      ...metadata,
    });
  }

  static logRateLimitExceeded(identifier: string, endpoint: string, metadata: LogMetadata = {}): void {
    logger.warn('Rate limit exceeded', {
      event: 'rate_limit',
      identifier,
      endpoint,
      ...metadata,
    });
  }

  static logSuspiciousActivity(activity: string, metadata: LogMetadata = {}): void {
    logger.warn(`Suspicious activity: ${activity}`, {
      event: 'suspicious_activity',
      activity,
      ...metadata,
    });

    if (process.env.SENTRY_DSN) {
      Sentry.captureMessage(`Suspicious activity: ${activity}`, {
        level: 'warning',
        tags: { event: 'suspicious_activity' },
        extra: metadata,
      });
    }
  }
}

/**
 * HTTP request logger
 */
export class RequestLogger {
  static logRequest(metadata: LogMetadata): void {
    logger.info('HTTP request', {
      event: 'http_request',
      ...metadata,
    });
  }

  static logResponse(metadata: LogMetadata): void {
    const level = metadata.statusCode && metadata.statusCode >= 400 ? 'warn' : 'info';
    logger.log(level, 'HTTP response', {
      event: 'http_response',
      ...metadata,
    });
  }

  static logError(error: Error, metadata: LogMetadata = {}): void {
    logger.error('Request error', {
      event: 'request_error',
      error: {
        message: error.message,
        stack: error.stack,
        name: error.name,
      },
      ...metadata,
    });

    if (process.env.SENTRY_DSN) {
      Sentry.captureException(error, {
        tags: { event: 'request_error' },
        extra: metadata,
      });
    }
  }
}

/**
 * Application logger
 */
export class AppLogger {
  static info(message: string, metadata?: LogMetadata): void {
    logger.info(message, metadata);
  }

  static warn(message: string, metadata?: LogMetadata): void {
    logger.warn(message, metadata);
  }

  static error(message: string, error?: Error, metadata?: LogMetadata): void {
    logger.error(message, {
      ...(error && {
        error: {
          message: error.message,
          stack: error.stack,
          name: error.name,
        },
      }),
      ...metadata,
    });

    if (process.env.SENTRY_DSN && error) {
      Sentry.captureException(error, {
        tags: { source: 'application' },
        extra: metadata,
      });
    }
  }

  static debug(message: string, metadata?: LogMetadata): void {
    logger.debug(message, metadata);
  }
}

/**
 * Performance logger
 */
export class PerformanceLogger {
  private startTime: number;
  private operation: string;

  constructor(operation: string) {
    this.operation = operation;
    this.startTime = Date.now();
  }

  end(metadata: LogMetadata = {}): void {
    const duration = Date.now() - this.startTime;
    logger.info(`Performance: ${this.operation}`, {
      event: 'performance',
      operation: this.operation,
      duration,
      ...metadata,
    });

    // Alert on slow operations
    if (duration > 5000 && process.env.SENTRY_DSN) {
      Sentry.captureMessage(`Slow operation: ${this.operation}`, {
        level: 'warning',
        tags: { event: 'slow_operation' },
        extra: { duration, ...metadata },
      });
    }
  }
}

// Export default logger
export default logger;
