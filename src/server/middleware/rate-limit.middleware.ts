import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { createClient } from 'redis';
import { Request, Response } from 'express';

// Create Redis client
const redisClient = createClient({
  url: `redis://:${process.env.REDIS_PASSWORD}@${process.env.REDIS_HOST}:${process.env.REDIS_PORT}/${process.env.REDIS_DB}`,
});

redisClient.on('error', (err) => console.error('Redis rate limit client error:', err));
redisClient.connect().catch(console.error);

/**
 * General rate limiter for all requests
 */
export const generalLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    // @ts-ignore - Redis client type mismatch
    client: redisClient,
    prefix: 'rl:general:',
  }),
  message: {
    success: false,
    error: 'Too many requests, please try again later.',
    code: 'RATE_LIMIT_EXCEEDED',
    retryAfter: null as number | null,
  },
  handler: (req: Request, res: Response) => {
    const retryAfter = Math.ceil(
      parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000') / 1000
    );
    res.status(429).json({
      success: false,
      error: 'Too many requests from this IP, please try again later.',
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfter,
    });
  },
  skip: (req: Request) => {
    // Skip rate limiting for health check endpoints
    return req.path === '/health' || req.path === '/api/health';
  },
  keyGenerator: (req: Request) => {
    // Use IP address or user ID if authenticated
    if (req.user && 'userId' in req.user) {
      return `user:${req.user.userId}`;
    }
    return req.ip || 'unknown';
  },
});

/**
 * Strict rate limiter for authentication endpoints
 */
export const authLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_AUTH_WINDOW || '900000'), // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_AUTH_MAX || '5'),
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    // @ts-ignore
    client: redisClient,
    prefix: 'rl:auth:',
  }),
  message: {
    success: false,
    error: 'Too many authentication attempts, please try again later.',
    code: 'AUTH_RATE_LIMIT_EXCEEDED',
    retryAfter: null as number | null,
  },
  handler: (req: Request, res: Response) => {
    const retryAfter = Math.ceil(
      parseInt(process.env.RATE_LIMIT_AUTH_WINDOW || '900000') / 1000
    );
    res.status(429).json({
      success: false,
      error: 'Too many login attempts from this IP, please try again later.',
      code: 'AUTH_RATE_LIMIT_EXCEEDED',
      retryAfter,
    });
  },
  skipSuccessfulRequests: true, // Don't count successful requests
});

/**
 * Rate limiter for API endpoints (more restrictive)
 */
export const apiLimiter = rateLimit({
  windowMs: 60000, // 1 minute
  max: 60, // 60 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    // @ts-ignore
    client: redisClient,
    prefix: 'rl:api:',
  }),
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      error: 'API rate limit exceeded',
      code: 'API_RATE_LIMIT_EXCEEDED',
      retryAfter: 60,
    });
  },
  keyGenerator: (req: Request) => {
    if (req.user && 'userId' in req.user) {
      return `user:${req.user.userId}`;
    }
    return req.ip || 'unknown';
  },
});

/**
 * Rate limiter for file uploads (very restrictive)
 */
export const uploadLimiter = rateLimit({
  windowMs: 3600000, // 1 hour
  max: 10, // 10 uploads per hour
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    // @ts-ignore
    client: redisClient,
    prefix: 'rl:upload:',
  }),
  handler: (req: Request, res: Response) => {
    res.status(429).json({
      success: false,
      error: 'Upload limit exceeded, please try again later',
      code: 'UPLOAD_RATE_LIMIT_EXCEEDED',
      retryAfter: 3600,
    });
  },
  keyGenerator: (req: Request) => {
    if (req.user && 'userId' in req.user) {
      return `user:${req.user.userId}`;
    }
    return req.ip || 'unknown';
  },
});

/**
 * Progressive delay rate limiter
 * Adds increasing delays for repeat offenders
 */
export const progressiveLimiter = rateLimit({
  windowMs: 900000, // 15 minutes
  max: 50,
  standardHeaders: true,
  legacyHeaders: false,
  store: new RedisStore({
    // @ts-ignore
    client: redisClient,
    prefix: 'rl:progressive:',
  }),
  handler: (req: Request, res: Response, options) => {
    // Add progressive delay based on number of violations
    const violationCount = parseInt(req.headers['ratelimit-remaining'] as string) || 0;
    const delay = Math.min(violationCount * 1000, 10000); // Max 10 second delay

    setTimeout(() => {
      res.status(429).json({
        success: false,
        error: 'Rate limit exceeded',
        code: 'PROGRESSIVE_RATE_LIMIT',
        retryAfter: 900,
        delay,
      });
    }, delay);
  },
});

/**
 * Create custom rate limiter
 * @param windowMs Time window in milliseconds
 * @param max Maximum requests in window
 * @param prefix Redis key prefix
 * @returns Rate limiter middleware
 */
export const createRateLimiter = (
  windowMs: number,
  max: number,
  prefix: string
) => {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    store: new RedisStore({
      // @ts-ignore
      client: redisClient,
      prefix: `rl:${prefix}:`,
    }),
    handler: (req: Request, res: Response) => {
      res.status(429).json({
        success: false,
        error: 'Rate limit exceeded',
        code: 'RATE_LIMIT_EXCEEDED',
        retryAfter: Math.ceil(windowMs / 1000),
      });
    },
  });
};
