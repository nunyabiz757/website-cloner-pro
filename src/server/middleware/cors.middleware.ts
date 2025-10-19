import cors from 'cors';
import { Request } from 'express';

/**
 * CORS configuration for production
 * Implements whitelist-based origin validation
 */

// Parse allowed origins from environment variable
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
  : ['http://localhost:3000', 'http://localhost:5000'];

/**
 * Check if origin is allowed
 * @param origin Origin to check
 * @returns True if allowed
 */
const isOriginAllowed = (origin: string | undefined): boolean => {
  if (!origin) return false;

  // Check exact match
  if (allowedOrigins.includes(origin)) {
    return true;
  }

  // Check wildcard patterns (e.g., *.example.com)
  for (const allowed of allowedOrigins) {
    if (allowed.includes('*')) {
      const regex = new RegExp('^' + allowed.replace(/\*/g, '.*') + '$');
      if (regex.test(origin)) {
        return true;
      }
    }
  }

  return false;
};

/**
 * CORS options with dynamic origin validation
 */
export const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) {
      return callback(null, true);
    }

    if (isOriginAllowed(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true, // Allow cookies and authentication headers
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'X-CSRF-Token',
    'Accept',
    'Accept-Language',
    'Content-Language',
  ],
  exposedHeaders: [
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset',
    'X-Request-ID',
  ],
  maxAge: 86400, // 24 hours - how long browsers can cache preflight results
  preflightContinue: false,
  optionsSuccessStatus: 204,
};

/**
 * Development CORS options (more permissive)
 */
export const corsOptionsDevelopment: cors.CorsOptions = {
  origin: true, // Allow all origins in development
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'X-CSRF-Token'],
  exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
  maxAge: 86400,
  preflightContinue: false,
  optionsSuccessStatus: 204,
};

/**
 * CORS middleware
 * Uses strict validation in production, permissive in development
 */
export const corsMiddleware = cors(
  process.env.NODE_ENV === 'production' ? corsOptions : corsOptionsDevelopment
);

/**
 * API-specific CORS middleware
 * More restrictive for API endpoints
 */
export const apiCorsMiddleware = cors({
  origin: (origin, callback) => {
    if (!origin || isOriginAllowed(origin)) {
      callback(null, true);
    } else {
      callback(new Error('API access not allowed from this origin'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining'],
  maxAge: 3600, // 1 hour
});

/**
 * Public CORS middleware
 * Very permissive for public endpoints
 */
export const publicCorsMiddleware = cors({
  origin: '*',
  methods: ['GET', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
  maxAge: 86400,
});

/**
 * Webhook CORS middleware
 * For webhook endpoints that need to accept requests from external services
 */
export const webhookCorsMiddleware = cors({
  origin: (origin, callback) => {
    // Allow webhooks from known services
    const webhookOrigins = [
      'https://hooks.stripe.com',
      'https://api.github.com',
      // Add other webhook providers
    ];

    if (!origin || webhookOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Webhook not allowed from this origin'));
    }
  },
  methods: ['POST'],
  allowedHeaders: ['Content-Type', 'X-Webhook-Signature', 'X-Hub-Signature'],
});
