import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import cookieParser from 'cookie-parser';

/**
 * CSRF Protection Middleware
 * Implements double-submit cookie pattern (since csurf is deprecated)
 */

const CSRF_TOKEN_LENGTH = 32;
const CSRF_COOKIE_NAME = '_csrf';
const CSRF_HEADER_NAME = 'x-csrf-token';

/**
 * Generate CSRF token
 */
const generateToken = (): string => {
  return crypto.randomBytes(CSRF_TOKEN_LENGTH).toString('hex');
};

/**
 * Verify CSRF token using constant-time comparison
 */
const verifyToken = (token1: string, token2: string): boolean => {
  if (!token1 || !token2 || token1.length !== token2.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(token1), Buffer.from(token2));
};

/**
 * Generate and set CSRF token
 * Creates a token and stores it in a cookie
 */
export const generateCSRFToken = (req: Request, res: Response, next: NextFunction): void => {
  // Check if token already exists
  if (!req.cookies[CSRF_COOKIE_NAME]) {
    const token = generateToken();
    res.cookie(CSRF_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 86400000, // 24 hours
    });
    res.locals.csrfToken = token;
  } else {
    res.locals.csrfToken = req.cookies[CSRF_COOKIE_NAME];
  }
  next();
};

/**
 * Verify CSRF token
 * Compares token from cookie with token from header/body
 */
export const verifyCSRFToken = (req: Request, res: Response, next: NextFunction): void => {
  // Skip CSRF verification for safe methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  const cookieToken = req.cookies[CSRF_COOKIE_NAME];
  const headerToken = req.headers[CSRF_HEADER_NAME] as string;
  const bodyToken = req.body?._csrf;

  const submittedToken = headerToken || bodyToken;

  if (!cookieToken) {
    return res.status(403).json({
      success: false,
      error: 'CSRF token missing',
      code: 'CSRF_TOKEN_MISSING',
    });
  }

  if (!submittedToken) {
    return res.status(403).json({
      success: false,
      error: 'CSRF token not provided',
      code: 'CSRF_TOKEN_NOT_PROVIDED',
    });
  }

  if (!verifyToken(cookieToken, submittedToken)) {
    return res.status(403).json({
      success: false,
      error: 'Invalid CSRF token',
      code: 'CSRF_TOKEN_INVALID',
    });
  }

  next();
};

/**
 * Get CSRF token endpoint
 * Returns the current CSRF token to the client
 */
export const getCSRFToken = (req: Request, res: Response): void => {
  res.json({
    success: true,
    csrfToken: res.locals.csrfToken || req.cookies[CSRF_COOKIE_NAME],
  });
};

/**
 * CSRF protection middleware bundle
 * Apply this to routes that need CSRF protection
 */
export const csrfProtection = [generateCSRFToken, verifyCSRFToken];

/**
 * Optional CSRF verification
 * Only verifies if token is present, doesn't fail if missing
 */
export const optionalCSRFVerification = (req: Request, res: Response, next: NextFunction): void => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  const cookieToken = req.cookies[CSRF_COOKIE_NAME];
  const headerToken = req.headers[CSRF_HEADER_NAME] as string;
  const bodyToken = req.body?._csrf;
  const submittedToken = headerToken || bodyToken;

  // If both tokens exist, verify them
  if (cookieToken && submittedToken) {
    if (!verifyToken(cookieToken, submittedToken)) {
      return res.status(403).json({
        success: false,
        error: 'Invalid CSRF token',
        code: 'CSRF_TOKEN_INVALID',
      });
    }
  }

  next();
};

/**
 * CSRF configuration
 */
export const csrfConfig = {
  cookieName: CSRF_COOKIE_NAME,
  headerName: CSRF_HEADER_NAME,
  tokenLength: CSRF_TOKEN_LENGTH,
  cookieOptions: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    maxAge: 86400000,
  },
};
