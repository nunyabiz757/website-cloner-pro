import express, { Request, Response } from 'express';
import { Pool } from 'pg';
import { z } from 'zod';
import APIKeyService from '../services/api-key.service.js';
import { authenticateJWT } from '../middleware/auth.middleware.js';
import { requireAdmin } from '../middleware/rbac.middleware.js';
import { validateIPFormat, getClientIP } from '../middleware/ip-whitelist.middleware.js';
import { AppLogger } from '../services/logger.service.js';

/**
 * IP Whitelist Management Routes
 * Manage IP whitelists and blacklists for API keys
 */

const router = express.Router();
let apiKeyService: APIKeyService;

export function initializeIPWhitelistRoutes(pool: Pool) {
  apiKeyService = new APIKeyService(pool);
}

// Validation schemas
const addIPSchema = z.object({
  ipAddress: z.string().min(7).max(45),
  description: z.string().optional(),
});

const bulkAddIPSchema = z.object({
  ipAddresses: z.array(z.string().min(7).max(45)).min(1).max(100),
});

const blacklistIPSchema = z.object({
  ipAddress: z.string().min(7).max(45),
  reason: z.string().min(1).max(500),
  severity: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  expiresIn: z.number().optional(), // Hours until expiration
});

/**
 * GET /api/ip-whitelist/:apiKeyId
 * Get IP whitelist for API key
 */
router.get(
  '/:apiKeyId',
  authenticateJWT,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { apiKeyId } = req.params;
      const userId = req.user?.userId;

      // Verify API key ownership
      const apiKey = await apiKeyService.getAPIKey(apiKeyId, userId!);

      if (!apiKey) {
        res.status(404).json({
          success: false,
          error: 'API key not found',
        });
        return;
      }

      const whitelist = await apiKeyService.getIPWhitelist(apiKeyId);

      res.json({
        success: true,
        whitelist,
      });
    } catch (error) {
      AppLogger.error('Failed to get IP whitelist', error as Error, {
        userId: req.user?.userId,
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get IP whitelist',
      });
    }
  }
);

/**
 * POST /api/ip-whitelist/:apiKeyId
 * Add IP to whitelist
 */
router.post(
  '/:apiKeyId',
  authenticateJWT,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { apiKeyId } = req.params;
      const userId = req.user?.userId;

      // Validate request body
      const { ipAddress, description } = addIPSchema.parse(req.body);

      // Validate IP format
      if (!validateIPFormat(ipAddress)) {
        res.status(400).json({
          success: false,
          error: 'Invalid IP address format',
        });
        return;
      }

      // Verify API key ownership
      const apiKey = await apiKeyService.getAPIKey(apiKeyId, userId!);

      if (!apiKey) {
        res.status(404).json({
          success: false,
          error: 'API key not found',
        });
        return;
      }

      const entry = await apiKeyService.addIPToWhitelist(
        apiKeyId,
        ipAddress,
        description,
        userId
      );

      AppLogger.info('IP added to whitelist', {
        userId,
        apiKeyId,
        ipAddress,
      });

      res.json({
        success: true,
        entry,
      });
    } catch (error) {
      AppLogger.error('Failed to add IP to whitelist', error as Error, {
        userId: req.user?.userId,
      });

      res.status(500).json({
        success: false,
        error: 'Failed to add IP to whitelist',
      });
    }
  }
);

/**
 * POST /api/ip-whitelist/:apiKeyId/bulk
 * Bulk add IPs to whitelist
 */
router.post(
  '/:apiKeyId/bulk',
  authenticateJWT,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { apiKeyId } = req.params;
      const userId = req.user?.userId;

      // Validate request body
      const { ipAddresses } = bulkAddIPSchema.parse(req.body);

      // Validate all IP formats
      const invalidIPs = ipAddresses.filter((ip) => !validateIPFormat(ip));

      if (invalidIPs.length > 0) {
        res.status(400).json({
          success: false,
          error: 'Invalid IP address format',
          invalidIPs,
        });
        return;
      }

      // Verify API key ownership
      const apiKey = await apiKeyService.getAPIKey(apiKeyId, userId!);

      if (!apiKey) {
        res.status(404).json({
          success: false,
          error: 'API key not found',
        });
        return;
      }

      const entries = await apiKeyService.bulkAddIPsToWhitelist(
        apiKeyId,
        ipAddresses,
        userId
      );

      AppLogger.info('Bulk IPs added to whitelist', {
        userId,
        apiKeyId,
        count: entries.length,
      });

      res.json({
        success: true,
        entries,
        count: entries.length,
      });
    } catch (error) {
      AppLogger.error('Failed to bulk add IPs to whitelist', error as Error, {
        userId: req.user?.userId,
      });

      res.status(500).json({
        success: false,
        error: 'Failed to bulk add IPs to whitelist',
      });
    }
  }
);

/**
 * DELETE /api/ip-whitelist/:apiKeyId/:whitelistId
 * Remove IP from whitelist
 */
router.delete(
  '/:apiKeyId/:whitelistId',
  authenticateJWT,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { apiKeyId, whitelistId } = req.params;
      const userId = req.user?.userId;

      // Verify API key ownership
      const apiKey = await apiKeyService.getAPIKey(apiKeyId, userId!);

      if (!apiKey) {
        res.status(404).json({
          success: false,
          error: 'API key not found',
        });
        return;
      }

      await apiKeyService.removeIPFromWhitelist(whitelistId, apiKeyId);

      AppLogger.info('IP removed from whitelist', {
        userId,
        apiKeyId,
        whitelistId,
      });

      res.json({
        success: true,
        message: 'IP removed from whitelist',
      });
    } catch (error) {
      AppLogger.error('Failed to remove IP from whitelist', error as Error, {
        userId: req.user?.userId,
      });

      res.status(500).json({
        success: false,
        error: 'Failed to remove IP from whitelist',
      });
    }
  }
);

/**
 * PATCH /api/ip-whitelist/:apiKeyId/:whitelistId/toggle
 * Toggle whitelist entry active status
 */
router.patch(
  '/:apiKeyId/:whitelistId/toggle',
  authenticateJWT,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { apiKeyId, whitelistId } = req.params;
      const { isActive } = req.body;
      const userId = req.user?.userId;

      // Verify API key ownership
      const apiKey = await apiKeyService.getAPIKey(apiKeyId, userId!);

      if (!apiKey) {
        res.status(404).json({
          success: false,
          error: 'API key not found',
        });
        return;
      }

      await apiKeyService.toggleWhitelistEntry(whitelistId, isActive);

      AppLogger.info('Whitelist entry toggled', {
        userId,
        apiKeyId,
        whitelistId,
        isActive,
      });

      res.json({
        success: true,
        message: `Whitelist entry ${isActive ? 'activated' : 'deactivated'}`,
      });
    } catch (error) {
      AppLogger.error('Failed to toggle whitelist entry', error as Error, {
        userId: req.user?.userId,
      });

      res.status(500).json({
        success: false,
        error: 'Failed to toggle whitelist entry',
      });
    }
  }
);

/**
 * GET /api/ip-whitelist/:apiKeyId/statistics
 * Get whitelist statistics
 */
router.get(
  '/:apiKeyId/statistics',
  authenticateJWT,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { apiKeyId } = req.params;
      const userId = req.user?.userId;

      // Verify API key ownership
      const apiKey = await apiKeyService.getAPIKey(apiKeyId, userId!);

      if (!apiKey) {
        res.status(404).json({
          success: false,
          error: 'API key not found',
        });
        return;
      }

      const statistics = await apiKeyService.getWhitelistStatistics(apiKeyId);

      res.json({
        success: true,
        statistics,
      });
    } catch (error) {
      AppLogger.error('Failed to get whitelist statistics', error as Error, {
        userId: req.user?.userId,
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get whitelist statistics',
      });
    }
  }
);

/**
 * GET /api/ip-whitelist/:apiKeyId/access-logs
 * Get IP access logs for API key
 */
router.get(
  '/:apiKeyId/access-logs',
  authenticateJWT,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { apiKeyId } = req.params;
      const { limit = 100 } = req.query;
      const userId = req.user?.userId;

      // Verify API key ownership
      const apiKey = await apiKeyService.getAPIKey(apiKeyId, userId!);

      if (!apiKey) {
        res.status(404).json({
          success: false,
          error: 'API key not found',
        });
        return;
      }

      const logs = await apiKeyService.getIPAccessLogs(apiKeyId, Number(limit));

      res.json({
        success: true,
        logs,
      });
    } catch (error) {
      AppLogger.error('Failed to get IP access logs', error as Error, {
        userId: req.user?.userId,
      });

      res.status(500).json({
        success: false,
        error: 'Failed to get IP access logs',
      });
    }
  }
);

// ==================== Blacklist Management ====================

/**
 * GET /api/ip-blacklist
 * Get IP blacklist (admin only)
 */
router.get(
  '/blacklist',
  authenticateJWT,
  requireAdmin,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const blacklist = await apiKeyService.getIPBlacklist();

      res.json({
        success: true,
        blacklist,
      });
    } catch (error) {
      AppLogger.error('Failed to get IP blacklist', error as Error);

      res.status(500).json({
        success: false,
        error: 'Failed to get IP blacklist',
      });
    }
  }
);

/**
 * POST /api/ip-blacklist
 * Add IP to blacklist (admin only)
 */
router.post(
  '/blacklist',
  authenticateJWT,
  requireAdmin,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const userId = req.user?.userId;

      // Validate request body
      const { ipAddress, reason, severity, expiresIn } = blacklistIPSchema.parse(
        req.body
      );

      // Validate IP format
      if (!validateIPFormat(ipAddress)) {
        res.status(400).json({
          success: false,
          error: 'Invalid IP address format',
        });
        return;
      }

      const expiresAt = expiresIn
        ? new Date(Date.now() + expiresIn * 60 * 60 * 1000)
        : undefined;

      const blacklistId = await apiKeyService.addIPToBlacklist(
        ipAddress,
        reason,
        severity,
        expiresAt,
        userId
      );

      AppLogger.logSecurityEvent('ip_blacklist.ip_added', severity, {
        userId,
        ipAddress,
        reason,
        expiresAt,
      });

      res.json({
        success: true,
        blacklistId,
      });
    } catch (error) {
      AppLogger.error('Failed to add IP to blacklist', error as Error, {
        userId: req.user?.userId,
      });

      res.status(500).json({
        success: false,
        error: 'Failed to add IP to blacklist',
      });
    }
  }
);

/**
 * DELETE /api/ip-blacklist/:blacklistId
 * Remove IP from blacklist (admin only)
 */
router.delete(
  '/blacklist/:blacklistId',
  authenticateJWT,
  requireAdmin,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { blacklistId } = req.params;
      const userId = req.user?.userId;

      await apiKeyService.removeIPFromBlacklist(blacklistId);

      AppLogger.info('IP removed from blacklist', {
        userId,
        blacklistId,
      });

      res.json({
        success: true,
        message: 'IP removed from blacklist',
      });
    } catch (error) {
      AppLogger.error('Failed to remove IP from blacklist', error as Error, {
        userId: req.user?.userId,
      });

      res.status(500).json({
        success: false,
        error: 'Failed to remove IP from blacklist',
      });
    }
  }
);

/**
 * GET /api/ip-blacklist/check/:ipAddress
 * Check if IP is blacklisted
 */
router.get(
  '/blacklist/check/:ipAddress',
  authenticateJWT,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { ipAddress } = req.params;

      const blacklistCheck = await apiKeyService.isIPBlacklisted(ipAddress);

      res.json({
        success: true,
        ...blacklistCheck,
      });
    } catch (error) {
      AppLogger.error('Failed to check IP blacklist', error as Error);

      res.status(500).json({
        success: false,
        error: 'Failed to check IP blacklist',
      });
    }
  }
);

// ==================== Suspicious Access ====================

/**
 * GET /api/ip-whitelist/suspicious
 * Get suspicious IP access patterns (admin only)
 */
router.get(
  '/suspicious',
  authenticateJWT,
  requireAdmin,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const suspicious = await apiKeyService.getSuspiciousIPAccess();

      res.json({
        success: true,
        suspicious,
      });
    } catch (error) {
      AppLogger.error('Failed to get suspicious IP access', error as Error);

      res.status(500).json({
        success: false,
        error: 'Failed to get suspicious IP access',
      });
    }
  }
);

// ==================== Current IP ====================

/**
 * GET /api/ip-whitelist/current
 * Get current client IP
 */
router.get(
  '/current',
  authenticateJWT,
  (req: Request, res: Response): void => {
    const clientIP = getClientIP(req);

    res.json({
      success: true,
      ip: clientIP,
    });
  }
);

export default router;
