import { Request, Response, NextFunction } from 'express';
import {
  getCookieUtil,
  CookieOptions,
  validateCookieSecurity,
  getCookiePrefix,
} from '../utils/cookie.util.js';
import { AppLogger } from '../services/logger.service.js';

/**
 * Cookie Security Middleware
 * Provides comprehensive cookie handling with security features
 */

/**
 * Extended Request interface with secure cookie helpers
 */
declare global {
  namespace Express {
    interface Response {
      setSecureCookie(name: string, value: string, options?: CookieOptions): void;
      setEncryptedCookie(name: string, value: string, options?: CookieOptions): void;
      setSignedCookie(name: string, value: string, options?: CookieOptions): void;
      setJsonCookie(name: string, data: any, options?: CookieOptions): void;
      getSecureCookie(name: string, options?: { signed?: boolean; encrypted?: boolean }): string | null;
      getJsonCookie<T = any>(name: string, options?: { signed?: boolean; encrypted?: boolean }): T | null;
      deleteSecureCookie(name: string, options?: Partial<CookieOptions>): void;
    }
  }
}

/**
 * Initialize secure cookie helpers on Express Response
 */
export const cookieSecurityMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const cookieUtil = getCookieUtil();

  /**
   * Set a secure cookie with automatic security settings
   */
  res.setSecureCookie = function (
    name: string,
    value: string,
    options: CookieOptions = {}
  ): void {
    // Validate cookie name
    if (!cookieUtil.isValidCookieName(name)) {
      AppLogger.warn('Invalid cookie name attempted', { name });
      throw new Error('Invalid cookie name');
    }

    // Sanitize value
    const sanitizedValue = cookieUtil.sanitizeCookieValue(value);

    // Validate value
    if (!cookieUtil.isValidCookieValue(sanitizedValue)) {
      AppLogger.warn('Invalid cookie value attempted', { name });
      throw new Error('Invalid cookie value');
    }

    const { name: finalName, value: processedValue, options: finalOptions } =
      cookieUtil.setSecureCookie(name, sanitizedValue, options);

    // Validate cookie size
    if (!cookieUtil.validateCookieSize(finalName, processedValue)) {
      throw new Error('Cookie size exceeds limit');
    }

    // Set cookie using Express
    this.cookie(finalName, processedValue, finalOptions as any);

    AppLogger.debug('Secure cookie set', {
      name: finalName,
      secure: finalOptions.secure,
      httpOnly: finalOptions.httpOnly,
      sameSite: finalOptions.sameSite,
    });
  };

  /**
   * Set an encrypted cookie
   */
  res.setEncryptedCookie = function (
    name: string,
    value: string,
    options: CookieOptions = {}
  ): void {
    this.setSecureCookie(name, value, { ...options, encrypted: true });
  };

  /**
   * Set a signed cookie
   */
  res.setSignedCookie = function (
    name: string,
    value: string,
    options: CookieOptions = {}
  ): void {
    this.setSecureCookie(name, value, { ...options, signed: true });
  };

  /**
   * Set a JSON cookie with automatic serialization
   */
  res.setJsonCookie = function (
    name: string,
    data: any,
    options: CookieOptions = {}
  ): void {
    const { name: finalName, value: processedValue, options: finalOptions } =
      cookieUtil.serializeJson(name, data, options);

    this.cookie(finalName, processedValue, finalOptions as any);

    AppLogger.debug('JSON cookie set', { name: finalName });
  };

  /**
   * Get a secure cookie with automatic decryption/verification
   */
  res.getSecureCookie = function (
    name: string,
    options: { signed?: boolean; encrypted?: boolean } = {}
  ): string | null {
    const cookieValue = req.cookies?.[name] || req.signedCookies?.[name];
    return cookieUtil.getSecureCookie(cookieValue, options);
  };

  /**
   * Get a JSON cookie with automatic deserialization
   */
  res.getJsonCookie = function <T = any>(
    name: string,
    options: { signed?: boolean; encrypted?: boolean } = {}
  ): T | null {
    const cookieValue = req.cookies?.[name] || req.signedCookies?.[name];
    return cookieUtil.deserializeJson<T>(cookieValue, options);
  };

  /**
   * Delete a secure cookie
   */
  res.deleteSecureCookie = function (
    name: string,
    options: Partial<CookieOptions> = {}
  ): void {
    this.clearCookie(name, options as any);

    AppLogger.debug('Cookie deleted', { name });
  };

  next();
};

/**
 * Enforce secure cookie settings globally
 */
export const enforceSecureCookies = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Override res.cookie to enforce security settings
  const originalCookie = res.cookie.bind(res);

  res.cookie = function (name: string, value: string, options: any = {}): Response {
    const secureOptions = {
      httpOnly: options.httpOnly !== false, // Default to true
      secure: process.env.NODE_ENV === 'production' || options.secure === true,
      sameSite: options.sameSite || 'strict',
      ...options,
    };

    // Validate security settings
    const validation = validateCookieSecurity(name, secureOptions);
    if (!validation.valid) {
      AppLogger.warn('Cookie security validation failed', {
        name,
        errors: validation.errors,
      });

      // In production, enforce strict validation
      if (process.env.NODE_ENV === 'production') {
        throw new Error(`Cookie security validation failed: ${validation.errors.join(', ')}`);
      }
    }

    return originalCookie(name, value, secureOptions);
  };

  next();
};

/**
 * Cookie validation middleware - validate all incoming cookies
 */
export const validateCookies = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const cookieUtil = getCookieUtil();

  // Check for suspicious cookie patterns
  const cookieNames = Object.keys(req.cookies || {});

  for (const name of cookieNames) {
    // Validate cookie name
    if (!cookieUtil.isValidCookieName(name)) {
      AppLogger.logSecurityEvent('cookie.invalid_name', 'medium', {
        name,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      });

      // Remove invalid cookie
      delete req.cookies[name];
      continue;
    }

    // Validate cookie value
    const value = req.cookies[name];
    if (typeof value === 'string' && !cookieUtil.isValidCookieValue(value)) {
      AppLogger.logSecurityEvent('cookie.invalid_value', 'medium', {
        name,
        ip: req.ip,
      });

      // Remove invalid cookie
      delete req.cookies[name];
    }
  }

  next();
};

/**
 * Limit number of cookies to prevent abuse
 */
export const limitCookieCount = (maxCookies: number = 50) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const cookieCount = Object.keys(req.cookies || {}).length;

    if (cookieCount > maxCookies) {
      AppLogger.logSecurityEvent('cookie.count_exceeded', 'high', {
        count: cookieCount,
        maxCookies,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      });

      res.status(400).json({
        success: false,
        error: 'Too many cookies',
        code: 'COOKIE_LIMIT_EXCEEDED',
      });
      return;
    }

    next();
  };
};

/**
 * Limit total cookie size to prevent abuse
 */
export const limitCookieSize = (maxSize: number = 4096) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const cookieHeader = req.headers.cookie || '';
    const totalSize = cookieHeader.length;

    if (totalSize > maxSize) {
      AppLogger.logSecurityEvent('cookie.size_exceeded', 'high', {
        size: totalSize,
        maxSize,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      });

      res.status(400).json({
        success: false,
        error: 'Cookie size limit exceeded',
        code: 'COOKIE_SIZE_EXCEEDED',
      });
      return;
    }

    next();
  };
};

/**
 * Auto-cleanup expired cookies
 */
export const cleanupExpiredCookies = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // This middleware checks for cookies with timestamp metadata
  // and removes them if expired

  const cookieNames = Object.keys(req.cookies || {});

  for (const name of cookieNames) {
    // Check if cookie has expiry metadata (format: value|timestamp|maxAge)
    const cookieValue = req.cookies[name];

    if (typeof cookieValue === 'string' && cookieValue.includes('|')) {
      const parts = cookieValue.split('|');

      if (parts.length === 3) {
        const timestamp = parseInt(parts[1]);
        const maxAge = parseInt(parts[2]);

        const cookieUtil = getCookieUtil();

        if (cookieUtil.isExpired(maxAge, timestamp)) {
          // Delete expired cookie
          res.clearCookie(name);
          delete req.cookies[name];

          AppLogger.debug('Expired cookie removed', {
            name,
            age: Date.now() - timestamp,
          });
        }
      }
    }
  }

  next();
};

/**
 * Cookie consent enforcement middleware
 */
export const enforceCookieConsent = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Check if user has given cookie consent
  const hasConsent = req.cookies?.cookie_consent === 'true';

  // List of essential cookies that don't require consent
  const essentialCookies = [
    'session',
    'csrf_token',
    'cookie_consent',
    '__Host-session',
    '__Secure-session',
  ];

  if (!hasConsent) {
    // Override res.cookie to prevent setting non-essential cookies
    const originalCookie = res.cookie.bind(res);

    res.cookie = function (name: string, value: string, options: any = {}): Response {
      if (!essentialCookies.includes(name)) {
        AppLogger.debug('Cookie blocked - no consent', { name });
        return this; // Don't set the cookie
      }

      return originalCookie(name, value, options);
    };
  }

  next();
};

/**
 * Cookie security headers middleware
 */
export const setCookieSecurityHeaders = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Set headers to enhance cookie security
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // In production, set HSTS to ensure HTTPS
  if (process.env.NODE_ENV === 'production') {
    res.setHeader(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload'
    );
  }

  next();
};

/**
 * Log cookie operations for audit
 */
export const auditCookieOperations = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Intercept cookie setting for audit
  const originalCookie = res.cookie.bind(res);

  res.cookie = function (name: string, value: string, options: any = {}): Response {
    AppLogger.info('Cookie set', {
      name,
      httpOnly: options.httpOnly,
      secure: options.secure,
      sameSite: options.sameSite,
      userId: req.user && 'userId' in req.user ? req.user.userId : undefined,
      ip: req.ip,
    });

    return originalCookie(name, value, options);
  };

  // Intercept cookie clearing for audit
  const originalClearCookie = res.clearCookie.bind(res);

  res.clearCookie = function (name: string, options?: any): Response {
    AppLogger.info('Cookie cleared', {
      name,
      userId: req.user && 'userId' in req.user ? req.user.userId : undefined,
      ip: req.ip,
    });

    return originalClearCookie(name, options);
  };

  next();
};

/**
 * Prevent cookie bomb attacks
 */
export const preventCookieBomb = (
  maxCookies: number = 50,
  maxSize: number = 4096
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const cookieCount = Object.keys(req.cookies || {}).length;
    const cookieHeader = req.headers.cookie || '';

    // Check count
    if (cookieCount > maxCookies) {
      AppLogger.logSecurityEvent('cookie.bomb_detected', 'critical', {
        count: cookieCount,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      });

      // Clear all cookies and reject
      res.clearCookie('*');

      res.status(400).json({
        success: false,
        error: 'Cookie bomb attack detected',
        code: 'COOKIE_BOMB',
      });
      return;
    }

    // Check size
    if (cookieHeader.length > maxSize) {
      AppLogger.logSecurityEvent('cookie.bomb_detected', 'critical', {
        size: cookieHeader.length,
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      });

      res.status(400).json({
        success: false,
        error: 'Cookie bomb attack detected',
        code: 'COOKIE_BOMB',
      });
      return;
    }

    next();
  };
};

/**
 * Cookie prefix enforcement middleware
 */
export const enforceCookiePrefix = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const originalCookie = res.cookie.bind(res);

  res.cookie = function (name: string, value: string, options: any = {}): Response {
    // Auto-add security prefixes
    const prefix = getCookiePrefix(options);
    const finalName = prefix ? `${prefix}${name}` : name;

    AppLogger.debug('Cookie prefix applied', {
      originalName: name,
      finalName,
      prefix,
    });

    return originalCookie(finalName, value, options);
  };

  next();
};

/**
 * Cookie rotation helper - rotate cookie value periodically
 */
export const rotateCookie = async (
  res: Response,
  name: string,
  newValue: string,
  options: CookieOptions = {}
): Promise<void> => {
  const cookieUtil = getCookieUtil();

  // Generate new encrypted value
  const { value: processedValue, options: finalOptions } =
    cookieUtil.setSecureCookie(name, newValue, { ...options, encrypted: true });

  res.cookie(name, processedValue, finalOptions as any);

  AppLogger.info('Cookie rotated', { name });
};

/**
 * Bulk cookie cleanup utility
 */
export const clearAllCookies = (res: Response, except: string[] = []): void => {
  // Note: This only clears cookies by setting Max-Age=0
  // Actual removal happens on client side

  const cookiesToClear = ['session', 'remember_me_token', 'remember_me_series'];

  for (const name of cookiesToClear) {
    if (!except.includes(name)) {
      res.clearCookie(name);
    }
  }

  AppLogger.debug('Bulk cookie cleanup performed', {
    except,
  });
};

/**
 * Get cookie info for debugging/monitoring
 */
export const getCookieInfo = (req: Request): {
  count: number;
  size: number;
  names: string[];
  secure: boolean;
} => {
  const names = Object.keys(req.cookies || {});
  const cookieHeader = req.headers.cookie || '';

  return {
    count: names.length,
    size: cookieHeader.length,
    names,
    secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
  };
};

/**
 * Middleware to log cookie info for monitoring
 */
export const logCookieInfo = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const info = getCookieInfo(req);

  if (info.count > 20 || info.size > 2048) {
    AppLogger.warn('High cookie usage detected', {
      ...info,
      ip: req.ip,
      path: req.path,
    });
  }

  next();
};
