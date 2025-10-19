import { Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import { APIKeyService } from '../services/api-key.service.js';
import { SecurityLogger } from '../services/logger.service.js';

// Initialize database pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const apiKeyService = new APIKeyService(pool);

// Extend Express Request to include API key
declare global {
  namespace Express {
    interface Request {
      apiKey?: any;
    }
  }
}

/**
 * Authenticate using API key
 * Checks X-API-Key header
 */
export const authenticateAPIKey = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const apiKey = req.headers['x-api-key'] as string;

    if (!apiKey) {
      SecurityLogger.logSecurityEvent('api_key.missing', 'low', {
        path: req.path,
        ip: req.ip,
      });

      res.status(401).json({
        success: false,
        error: 'API key required',
        code: 'API_KEY_REQUIRED',
      });
      return;
    }

    const keyData = await apiKeyService.verifyAPIKey(apiKey);

    if (!keyData) {
      SecurityLogger.logSecurityEvent('api_key.invalid', 'medium', {
        path: req.path,
        ip: req.ip,
        keyPrefix: apiKey.substring(0, 11),
      });

      res.status(401).json({
        success: false,
        error: 'Invalid API key',
        code: 'INVALID_API_KEY',
      });
      return;
    }

    // Attach API key data to request
    req.apiKey = keyData;

    // Log usage
    await apiKeyService.logUsage(
      keyData.id,
      req.path,
      req.method,
      200,
      req.ip,
      req.headers['user-agent']
    );

    next();
  } catch (error) {
    console.error('API key authentication error:', error);
    res.status(500).json({
      success: false,
      error: 'Authentication failed',
      code: 'AUTH_ERROR',
    });
  }
};

/**
 * Require specific scope for API key
 * @param requiredScope Required scope
 * @returns Express middleware
 */
export const requireAPIScope = (requiredScope: string) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.apiKey) {
      res.status(401).json({
        success: false,
        error: 'API key required',
        code: 'API_KEY_REQUIRED',
      });
      return;
    }

    if (!apiKeyService.hasScope(req.apiKey, requiredScope)) {
      SecurityLogger.logSecurityEvent('api_key.insufficient_scope', 'medium', {
        userId: req.apiKey.user_id,
        requiredScope,
        availableScopes: req.apiKey.scopes,
        path: req.path,
      });

      res.status(403).json({
        success: false,
        error: 'Insufficient API key permissions',
        code: 'INSUFFICIENT_SCOPE',
        required: requiredScope,
      });
      return;
    }

    next();
  };
};

/**
 * Require any of the specified scopes
 * @param requiredScopes Required scopes
 * @returns Express middleware
 */
export const requireAnyAPIScope = (requiredScopes: string[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.apiKey) {
      res.status(401).json({
        success: false,
        error: 'API key required',
        code: 'API_KEY_REQUIRED',
      });
      return;
    }

    if (!apiKeyService.hasAnyScope(req.apiKey, requiredScopes)) {
      res.status(403).json({
        success: false,
        error: 'Insufficient API key permissions',
        code: 'INSUFFICIENT_SCOPE',
        requiredAny: requiredScopes,
      });
      return;
    }

    next();
  };
};
