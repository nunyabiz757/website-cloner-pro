import helmet from 'helmet';
import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

/**
 * Generate nonce for CSP
 */
export const generateNonce = (req: Request, res: Response, next: NextFunction): void => {
  res.locals.cspNonce = crypto.randomBytes(16).toString('base64');
  next();
};

/**
 * Comprehensive security headers middleware using Helmet
 */
export const securityHeaders = helmet({
  // Content Security Policy
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        (req: Request, res: Response) => `'nonce-${res.locals.cspNonce}'`,
        "'strict-dynamic'",
      ],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https:', 'blob:'],
      connectSrc: ["'self'"],
      frameSrc: ["'none'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      manifestSrc: ["'self'"],
      workerSrc: ["'self'", 'blob:'],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
    },
  },

  // HTTP Strict Transport Security (HSTS)
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },

  // X-Frame-Options
  frameguard: {
    action: 'deny',
  },

  // X-Content-Type-Options
  noSniff: true,

  // X-DNS-Prefetch-Control
  dnsPrefetchControl: {
    allow: false,
  },

  // X-Download-Options
  ieNoOpen: true,

  // X-Permitted-Cross-Domain-Policies
  permittedCrossDomainPolicies: {
    permittedPolicies: 'none',
  },

  // Referrer-Policy
  referrerPolicy: {
    policy: 'strict-origin-when-cross-origin',
  },

  // X-XSS-Protection (deprecated but still used by older browsers)
  xssFilter: true,

  // Hide X-Powered-By header
  hidePoweredBy: true,

  // Cross-Origin-Embedder-Policy
  crossOriginEmbedderPolicy: true,

  // Cross-Origin-Opener-Policy
  crossOriginOpenerPolicy: {
    policy: 'same-origin',
  },

  // Cross-Origin-Resource-Policy
  crossOriginResourcePolicy: {
    policy: 'same-origin',
  },

  // Origin-Agent-Cluster
  originAgentCluster: true,
});

/**
 * Custom security headers middleware
 * Adds additional security-related headers
 */
export const additionalSecurityHeaders = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Prevent MIME sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // Disable client-side caching for sensitive endpoints
  if (req.path.includes('/api/auth') || req.path.includes('/api/user')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
  }

  // Add custom headers
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('X-Application-Name', 'Website Cloner Pro');
  res.setHeader('X-Application-Version', process.env.npm_package_version || '1.0.0');

  // Security contact information
  res.setHeader('Security-Contact', 'security@websitecloner.pro');

  // Permissions Policy (formerly Feature Policy)
  res.setHeader(
    'Permissions-Policy',
    [
      'geolocation=()',
      'microphone=()',
      'camera=()',
      'payment=()',
      'usb=()',
      'magnetometer=()',
      'gyroscope=()',
      'accelerometer=()',
      'interest-cohort=()', // Disable FLoC
    ].join(', ')
  );

  next();
};

/**
 * HSTS preload helper
 * Forces HTTPS and adds to HSTS preload list
 */
export const forceHTTPS = (req: Request, res: Response, next: NextFunction): void => {
  if (process.env.NODE_ENV === 'production' && !req.secure && req.get('X-Forwarded-Proto') !== 'https') {
    return res.redirect(301, `https://${req.hostname}${req.url}`);
  }
  next();
};

/**
 * Remove sensitive headers
 * Removes headers that might leak sensitive information
 */
export const removeSensitiveHeaders = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Remove headers that might leak information
  res.removeHeader('X-Powered-By');
  res.removeHeader('Server');
  next();
};

/**
 * Apply all security headers
 */
export const applySecurityHeaders = [
  generateNonce,
  securityHeaders,
  additionalSecurityHeaders,
  removeSensitiveHeaders,
];
