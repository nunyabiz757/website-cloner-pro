import { Request, Response, NextFunction } from 'express';
import session from 'express-session';
import RedisStore from 'connect-redis';
import { createClient } from 'redis';
import { Pool } from 'pg';
import { SessionService } from '../services/session.service.js';
import { securityConfig } from '../config/security.config.js';

/**
 * Session Middleware
 * Implements Redis-backed sessions with fingerprinting and security features
 */

// Initialize Redis client for session store
const redisClient = createClient({
  url: `redis://:${process.env.REDIS_PASSWORD}@${process.env.REDIS_HOST}:${process.env.REDIS_PORT}/${process.env.REDIS_DB}`,
  legacyMode: true, // Required for connect-redis compatibility
});

redisClient.on('error', (err) => console.error('Redis Session Store Error:', err));
redisClient.connect().catch(console.error);

// Create Redis store
const redisStore = new RedisStore({
  client: redisClient as any,
  prefix: 'sess:',
});

// Initialize session service
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
const sessionService = new SessionService(pool);

/**
 * Express session middleware configuration
 */
export const sessionMiddleware = session({
  store: redisStore,
  secret: securityConfig.session.secret,
  name: securityConfig.session.name,
  resave: false,
  saveUninitialized: false,
  rolling: true, // Reset expiration on every request
  cookie: {
    secure: process.env.NODE_ENV === 'production', // HTTPS only in production
    httpOnly: true, // Prevent JavaScript access
    sameSite: 'strict', // CSRF protection
    maxAge: securityConfig.session.maxAge,
    path: '/',
  },
});

/**
 * Session fingerprinting middleware
 * Validates session fingerprint to prevent session hijacking
 */
export const validateSessionFingerprint = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.session || !req.session.id) {
      return next();
    }

    const sessionId = req.session.id;
    const isValid = await sessionService.validateSession(sessionId, req);

    if (!isValid) {
      // Session is invalid - destroy it
      req.session.destroy((err) => {
        if (err) {
          console.error('Error destroying invalid session:', err);
        }
      });

      res.status(401).json({
        success: false,
        error: 'Session invalid or expired',
        code: 'SESSION_INVALID',
      });
      return;
    }

    next();
  } catch (error) {
    console.error('Session fingerprint validation error:', error);
    next(error);
  }
};

/**
 * Track session creation
 * Creates session record in database when user logs in
 */
export const trackSessionCreation = async (
  req: Request,
  userId: string
): Promise<void> => {
  if (req.session && req.session.id) {
    await sessionService.createSession(userId, req.session.id, req);
  }
};

/**
 * Enforce concurrent session limits
 * Middleware to check if user has exceeded max concurrent sessions
 */
export const enforceConcurrentSessionLimit = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user || !('userId' in req.user)) {
      return next();
    }

    const userId = req.user.userId;
    const activeSessions = await sessionService.getUserSessions(userId);

    if (activeSessions.length >= securityConfig.session.maxSessions) {
      res.status(429).json({
        success: false,
        error: `Maximum ${securityConfig.session.maxSessions} concurrent sessions allowed`,
        code: 'MAX_SESSIONS_EXCEEDED',
        activeSessions: activeSessions.length,
      });
      return;
    }

    next();
  } catch (error) {
    console.error('Concurrent session limit enforcement error:', error);
    next(error);
  }
};

/**
 * Update session activity
 * Updates last activity timestamp on each request
 */
export const updateSessionActivity = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (req.session && req.session.id && req.user) {
      await sessionService.updateSessionActivity(req.session.id);
    }
    next();
  } catch (error) {
    console.error('Session activity update error:', error);
    next(); // Don't fail request if activity update fails
  }
};

/**
 * Remember me middleware
 * Checks for remember me cookie and auto-authenticates user
 */
export const checkRememberMe = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // Skip if already authenticated
    if (req.user) {
      return next();
    }

    // Check for remember me cookie
    const rememberToken = req.cookies?.remember_me_token;
    const rememberSeries = req.cookies?.remember_me_series;

    if (!rememberToken || !rememberSeries) {
      return next();
    }

    // Validate remember me token
    const userId = await sessionService.validateRememberMeToken(
      rememberToken,
      rememberSeries,
      req
    );

    if (userId) {
      // Auto-authenticate user
      req.user = { userId } as any;

      // Create new session
      if (req.session) {
        (req.session as any).userId = userId;
        await trackSessionCreation(req, userId);
      }
    } else {
      // Invalid token - clear cookies
      res.clearCookie('remember_me_token');
      res.clearCookie('remember_me_series');
    }

    next();
  } catch (error) {
    console.error('Remember me check error:', error);
    // Clear remember me cookies on error
    res.clearCookie('remember_me_token');
    res.clearCookie('remember_me_series');
    next();
  }
};

/**
 * Set remember me cookie
 * Sets secure remember me cookies after successful login
 */
export const setRememberMe = async (
  req: Request,
  res: Response,
  userId: string
): Promise<void> => {
  const { token, series } = await sessionService.createRememberMeToken(userId, req);

  const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict' as const,
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    path: '/',
  };

  res.cookie('remember_me_token', token, cookieOptions);
  res.cookie('remember_me_series', series, cookieOptions);
};

/**
 * Clear remember me cookies
 */
export const clearRememberMe = async (
  req: Request,
  res: Response,
  userId: string
): Promise<void> => {
  // Delete remember me tokens from database
  await sessionService.deleteAllRememberMeTokens(userId);

  // Clear cookies
  res.clearCookie('remember_me_token');
  res.clearCookie('remember_me_series');
};

/**
 * Session cleanup middleware for logout
 */
export const destroySession = async (
  req: Request,
  res: Response
): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!req.session) {
      return resolve();
    }

    const sessionId = req.session.id;

    req.session.destroy(async (err) => {
      if (err) {
        console.error('Session destroy error:', err);
        return reject(err);
      }

      // Destroy session in database
      if (sessionId) {
        await sessionService.destroySession(sessionId);
      }

      res.clearCookie(securityConfig.session.name);
      resolve();
    });
  });
};

/**
 * Logout from all devices
 */
export const destroyAllSessions = async (
  req: Request,
  res: Response,
  userId: string,
  keepCurrentSession: boolean = false
): Promise<number> => {
  const currentSessionId = keepCurrentSession && req.session ? req.session.id : undefined;
  const count = await sessionService.destroyAllUserSessions(userId, currentSessionId);

  // Clear remember me tokens
  await clearRememberMe(req, res, userId);

  return count;
};

/**
 * Get user's active sessions
 */
export const getUserActiveSessions = async (userId: string) => {
  return await sessionService.getUserSessions(userId);
};

/**
 * Get session statistics
 */
export const getSessionStatistics = async (userId: string) => {
  return await sessionService.getSessionStatistics(userId);
};

// Export session service for direct use
export { sessionService };
