import { Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import { CreditService } from '../services/credit.service.js';
import { RedisCacheService } from '../services/redis-cache.service.js';
import { SecurityLogger } from '../services/logger.service.js';
import { getPool } from '../config/database.config.js';
import { getRedisCacheService } from '../services/redis-cache.service.js';

/**
 * Credit Validation Middleware
 *
 * Provides middleware functions for:
 * - Credit balance checks before operations
 * - Credit consumption enforcement
 * - Credit information attachment to requests
 * - Payment required (402) responses
 *
 * Features:
 * - Redis caching for performance
 * - Configurable credit requirements
 * - Graceful error handling
 * - Audit logging integration
 */

// Singleton credit service instance
let creditServiceInstance: CreditService | null = null;

function getCreditService(): CreditService {
  if (!creditServiceInstance) {
    const pool = getPool();
    const cache = getRedisCacheService();
    creditServiceInstance = new CreditService(pool, cache);
  }
  return creditServiceInstance;
}

/**
 * Attach credit balance to request
 * Optional middleware that adds credit info without blocking
 */
export const attachCreditInfo = () => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user || !('userId' in req.user)) {
        (req as any).credits = null;
        return next();
      }

      const creditService = getCreditService();
      const balance = await creditService.getBalance(req.user.userId);

      (req as any).credits = balance;

      next();
    } catch (error) {
      console.error('Failed to attach credit info:', error);
      (req as any).credits = null;
      next();
    }
  };
};

/**
 * Require sufficient credits
 * Blocks request if user doesn't have enough credits
 * @param requiredCredits Number of credits required (can be a number or function)
 * @param operation Optional operation name for logging
 */
export const requireCredits = (
  requiredCredits: number | ((req: Request) => number),
  operation?: string
) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user || !('userId' in req.user)) {
        SecurityLogger.logAuthorization(false, 'credits', 'check', {
          reason: 'not_authenticated',
          path: req.path,
          method: req.method,
          ip: req.ip,
        });

        res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'AUTH_REQUIRED',
        });
        return;
      }

      // Calculate required credits
      const credits =
        typeof requiredCredits === 'function' ? requiredCredits(req) : requiredCredits;

      if (credits <= 0) {
        // No credits required, proceed
        return next();
      }

      const creditService = getCreditService();
      const balance = await creditService.getBalance(req.user.userId);

      if (!balance) {
        // User has no credit record - initialize with 0 credits
        await creditService.initializeUserCredits(req.user.userId, 0);

        SecurityLogger.logAuthorization(false, 'credits', 'check', {
          userId: req.user.userId,
          reason: 'insufficient_credits',
          required: credits,
          available: 0,
          operation,
          path: req.path,
          method: req.method,
          ip: req.ip,
        });

        res.status(402).json({
          success: false,
          error: 'Insufficient credits',
          code: 'INSUFFICIENT_CREDITS',
          required: credits,
          available: 0,
          message: `This operation requires ${credits} credit${credits > 1 ? 's' : ''}. Please purchase credits to continue.`,
        });
        return;
      }

      if (balance.creditsAvailable < credits) {
        SecurityLogger.logAuthorization(false, 'credits', 'check', {
          userId: req.user.userId,
          reason: 'insufficient_credits',
          required: credits,
          available: balance.creditsAvailable,
          operation,
          path: req.path,
          method: req.method,
          ip: req.ip,
        });

        res.status(402).json({
          success: false,
          error: 'Insufficient credits',
          code: 'INSUFFICIENT_CREDITS',
          required: credits,
          available: balance.creditsAvailable,
          shortfall: credits - balance.creditsAvailable,
          message: `This operation requires ${credits} credit${credits > 1 ? 's' : ''}, but you only have ${balance.creditsAvailable}. Please purchase ${credits - balance.creditsAvailable} more credit${credits - balance.creditsAvailable > 1 ? 's' : ''}.`,
        });
        return;
      }

      // User has sufficient credits
      SecurityLogger.logAuthorization(true, 'credits', 'check', {
        userId: req.user.userId,
        required: credits,
        available: balance.creditsAvailable,
        operation,
        path: req.path,
        method: req.method,
      });

      // Attach credit info to request
      (req as any).credits = balance;
      (req as any).requiredCredits = credits;

      next();
    } catch (error) {
      console.error('Credit check error:', error);
      res.status(500).json({
        success: false,
        error: 'Credit validation failed',
        code: 'CREDIT_CHECK_ERROR',
      });
    }
  };
};

/**
 * Require active subscription
 * Blocks request if user doesn't have an active subscription
 * @param subscriptionTypes Optional array of required subscription types
 */
export const requireSubscription = (subscriptionTypes?: string[]) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user || !('userId' in req.user)) {
        res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'AUTH_REQUIRED',
        });
        return;
      }

      const creditService = getCreditService();
      const balance = await creditService.getBalance(req.user.userId);

      if (!balance) {
        res.status(402).json({
          success: false,
          error: 'No active subscription',
          code: 'NO_SUBSCRIPTION',
          message: 'This feature requires an active subscription. Please subscribe to continue.',
        });
        return;
      }

      // Check if subscription is active
      if (balance.subscriptionStatus !== 'active') {
        SecurityLogger.logAuthorization(false, 'subscription', 'check', {
          userId: req.user.userId,
          reason: 'subscription_not_active',
          status: balance.subscriptionStatus,
          path: req.path,
          method: req.method,
          ip: req.ip,
        });

        res.status(402).json({
          success: false,
          error: 'No active subscription',
          code: 'SUBSCRIPTION_INACTIVE',
          currentStatus: balance.subscriptionStatus,
          message: `Your subscription status is ${balance.subscriptionStatus}. Please activate a subscription to continue.`,
        });
        return;
      }

      // Check subscription type if specified
      if (subscriptionTypes && subscriptionTypes.length > 0) {
        if (!subscriptionTypes.includes(balance.subscriptionType)) {
          SecurityLogger.logAuthorization(false, 'subscription', 'check', {
            userId: req.user.userId,
            reason: 'subscription_type_mismatch',
            required: subscriptionTypes,
            current: balance.subscriptionType,
            path: req.path,
            method: req.method,
            ip: req.ip,
          });

          res.status(403).json({
            success: false,
            error: 'Insufficient subscription level',
            code: 'SUBSCRIPTION_INSUFFICIENT',
            required: subscriptionTypes,
            current: balance.subscriptionType,
            message: `This feature requires one of these subscription types: ${subscriptionTypes.join(', ')}`,
          });
          return;
        }
      }

      SecurityLogger.logAuthorization(true, 'subscription', 'check', {
        userId: req.user.userId,
        subscriptionType: balance.subscriptionType,
        path: req.path,
        method: req.method,
      });

      // Attach subscription info to request
      (req as any).subscription = {
        type: balance.subscriptionType,
        status: balance.subscriptionStatus,
        creditsPerMonth: balance.subscriptionCreditsPerMonth,
      };

      next();
    } catch (error) {
      console.error('Subscription check error:', error);
      res.status(500).json({
        success: false,
        error: 'Subscription validation failed',
        code: 'SUBSCRIPTION_CHECK_ERROR',
      });
    }
  };
};

/**
 * Consume credits middleware
 * Automatically consumes credits after successful request
 * IMPORTANT: This should be used AFTER the main route handler
 * Use with caution - ensure credits are only consumed on successful operations
 *
 * @param creditsToConsume Number of credits to consume (can be a number or function)
 * @param operation Operation name for transaction logging
 * @param metadata Additional metadata function
 */
export const consumeCredits = (
  creditsToConsume: number | ((req: Request, res: Response) => number),
  operation: string,
  metadata?: (req: Request, res: Response) => Record<string, any>
) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user || !('userId' in req.user)) {
        // Should not reach here if requireCredits is used
        return next();
      }

      // Store original send function
      const originalSend = res.send;
      const originalJson = res.json;

      // Track if credits were consumed
      let creditsConsumed = false;

      // Wrapper function to consume credits on successful response
      const consumeOnSuccess = async (body: any) => {
        // Only consume credits on successful response (2xx status)
        if (res.statusCode >= 200 && res.statusCode < 300 && !creditsConsumed) {
          creditsConsumed = true;

          try {
            const credits =
              typeof creditsToConsume === 'function'
                ? creditsToConsume(req, res)
                : creditsToConsume;

            if (credits > 0) {
              const creditService = getCreditService();

              const meta = metadata ? metadata(req, res) : {};
              const consumeMetadata = {
                operation,
                resourceType: (req as any).resourceType || undefined,
                resourceId: (req as any).resourceId || undefined,
                path: req.path,
                method: req.method,
                ...meta,
              };

              const result = await creditService.consumeCredits(
                req.user.userId,
                credits,
                consumeMetadata
              );

              if (result.success) {
                SecurityLogger.logAuthorization(true, 'credits', 'consume', {
                  userId: req.user.userId,
                  credits,
                  operation,
                  transactionId: result.transactionId,
                  creditsBefore: result.creditsBefore,
                  creditsAfter: result.creditsAfter,
                  path: req.path,
                  method: req.method,
                });
              } else {
                // This shouldn't happen if requireCredits was used
                console.warn('Failed to consume credits after operation', {
                  userId: req.user.userId,
                  credits,
                  operation,
                });
              }
            }
          } catch (error) {
            console.error('Error consuming credits:', error);
            // Don't fail the response if credit consumption fails
            // This is logged and can be handled separately
          }
        }

        return body;
      };

      // Override res.send
      res.send = function (body: any) {
        consumeOnSuccess(body).then(() => {
          originalSend.call(this, body);
        });
        return this;
      };

      // Override res.json
      res.json = function (body: any) {
        consumeOnSuccess(body).then(() => {
          originalJson.call(this, body);
        });
        return this;
      };

      next();
    } catch (error) {
      console.error('Credit consumption middleware error:', error);
      next();
    }
  };
};

/**
 * Check minimum credit balance
 * Warns if user's balance is below threshold but doesn't block
 * Adds warning to response
 *
 * @param threshold Minimum balance threshold (default: 5)
 */
export const checkMinimumBalance = (threshold: number = 5) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user || !('userId' in req.user)) {
        return next();
      }

      const creditService = getCreditService();
      const balance = await creditService.getBalance(req.user.userId);

      if (balance && balance.creditsAvailable < threshold) {
        // Store original json function
        const originalJson = res.json;

        // Override res.json to add warning
        res.json = function (body: any) {
          if (typeof body === 'object' && body !== null) {
            body.creditWarning = {
              message: `Your credit balance is low (${balance.creditsAvailable} remaining). Consider purchasing more credits.`,
              currentBalance: balance.creditsAvailable,
              threshold,
            };
          }
          return originalJson.call(this, body);
        };
      }

      next();
    } catch (error) {
      console.error('Minimum balance check error:', error);
      next();
    }
  };
};

/**
 * Admin only - bypass credit checks
 * Allows admins to perform operations without credit consumption
 */
export const adminBypassCredits = () => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user || !('userId' in req.user)) {
        return next();
      }

      // Check if user has admin role
      // This requires the RBAC service
      const pool = getPool();
      const result = await pool.query(
        `SELECT EXISTS (
          SELECT 1 FROM user_roles ur
          JOIN roles r ON ur.role_id = r.id
          WHERE ur.user_id = $1 AND r.name = 'admin'
        ) as is_admin`,
        [req.user.userId]
      );

      if (result.rows[0]?.is_admin) {
        (req as any).adminBypass = true;
        (req as any).skipCreditCheck = true;

        SecurityLogger.logAuthorization(true, 'credits', 'admin_bypass', {
          userId: req.user.userId,
          path: req.path,
          method: req.method,
        });
      }

      next();
    } catch (error) {
      console.error('Admin bypass check error:', error);
      next();
    }
  };
};

/**
 * Get credit service instance
 * For use in route handlers
 */
export { getCreditService };

export default {
  attachCreditInfo,
  requireCredits,
  requireSubscription,
  consumeCredits,
  checkMinimumBalance,
  adminBypassCredits,
  getCreditService,
};
