import { Request, Response, NextFunction } from 'express';
import { JWTUtil, JWTPayload } from '../utils/jwt.util.js';

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload;
    }
  }
}

/**
 * Authentication middleware
 * Verifies JWT token and attaches user to request
 */
export const authenticate = (req: Request, res: Response, next: NextFunction): void => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        error: 'No token provided',
        code: 'NO_TOKEN',
      });
      return;
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    // Verify token
    const payload = JWTUtil.verifyAccessToken(token);
    if (!payload) {
      res.status(401).json({
        success: false,
        error: 'Invalid or expired token',
        code: 'INVALID_TOKEN',
      });
      return;
    }

    // Attach user to request
    req.user = payload;
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(401).json({
      success: false,
      error: 'Authentication failed',
      code: 'AUTH_FAILED',
    });
  }
};

/**
 * Optional authentication middleware
 * Attaches user to request if token is valid, but doesn't fail if missing
 */
export const optionalAuthenticate = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      next();
      return;
    }

    const token = authHeader.substring(7);
    const payload = JWTUtil.verifyAccessToken(token);
    if (payload) {
      req.user = payload;
    }

    next();
  } catch (error) {
    console.error('Optional authentication error:', error);
    next();
  }
};

/**
 * Require email verification middleware
 * Must be used after authenticate middleware
 */
export const requireEmailVerified = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: 'Authentication required',
        code: 'AUTH_REQUIRED',
      });
      return;
    }

    // In a real implementation, you would check the database
    // For now, we'll assume email is verified if token is valid
    next();
  } catch (error) {
    console.error('Email verification check error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    });
  }
};
