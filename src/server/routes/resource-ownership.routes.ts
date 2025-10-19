import express, { Request, Response, Router } from 'express';
import { z } from 'zod';
import { Pool } from 'pg';
import { ResourceOwnershipService, initializeResourceOwnershipService } from '../services/resource-ownership.service.js';
import { authenticateJWT } from '../middleware/auth.middleware.js';
import { requireResourceOwnership, requireAdmin, rbacService } from '../middleware/rbac.middleware.js';
import { AppLogger } from '../services/logger.service.js';

/**
 * Resource Ownership Routes
 * Manage resource ownership, transfers, and shared access
 */

const router: Router = express.Router();
let ownershipService: ResourceOwnershipService;

// Validation schemas
const registerOwnershipSchema = z.object({
  resourceType: z.string().min(1).max(100),
  resourceId: z.string().uuid(),
  ownerId: z.string().uuid(),
});

const transferOwnershipSchema = z.object({
  toUserId: z.string().uuid(),
  reason: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

const shareWithUserSchema = z.object({
  userId: z.string().uuid(),
  permissionLevel: z.enum(['read', 'write', 'admin']),
  expiresAt: z.string().datetime().optional(),
});

const shareWithRoleSchema = z.object({
  roleId: z.string().uuid(),
  permissionLevel: z.enum(['read', 'write', 'admin']),
  expiresAt: z.string().datetime().optional(),
});

const updatePermissionSchema = z.object({
  permissionLevel: z.enum(['read', 'write', 'admin']),
});

/**
 * Initialize ownership routes with database pool
 */
export function initializeOwnershipRoutes(pool: Pool): void {
  ownershipService = initializeResourceOwnershipService(pool);
}

/**
 * POST /api/ownership/register
 * Register resource ownership (admin only or system)
 */
router.post('/register', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const validatedData = registerOwnershipSchema.parse(req.body);

    const ownershipId = await ownershipService.registerOwnership(
      validatedData.resourceType,
      validatedData.resourceId,
      validatedData.ownerId,
      (req as any).user?.userId
    );

    res.status(201).json({
      success: true,
      ownershipId,
      message: 'Resource ownership registered',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.errors,
      });
    }

    AppLogger.error('Error registering ownership', error as Error);
    res.status(500).json({
      success: false,
      error: 'Failed to register ownership',
    });
  }
});

/**
 * GET /api/ownership/:resourceType/:resourceId/owner
 * Get resource owner information
 */
router.get('/:resourceType/:resourceId/owner', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const { resourceType, resourceId } = req.params;

    const owner = await ownershipService.getResourceOwner(resourceType, resourceId);

    if (!owner) {
      return res.status(404).json({
        success: false,
        error: 'Resource ownership not found',
      });
    }

    res.json({
      success: true,
      data: owner,
    });
  } catch (error) {
    AppLogger.error('Error fetching resource owner', error as Error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch resource owner',
    });
  }
});

/**
 * POST /api/ownership/:resourceType/:resourceId/transfer
 * Transfer resource ownership
 */
router.post(
  '/:resourceType/:resourceId/transfer',
  authenticateJWT,
  async (req: Request, res: Response) => {
    try {
      const { resourceType, resourceId } = req.params;
      const validatedData = transferOwnershipSchema.parse(req.body);
      const userId = (req as any).user?.userId;

      // Verify current ownership
      const owner = await ownershipService.getResourceOwner(resourceType, resourceId);
      if (!owner) {
        return res.status(404).json({
          success: false,
          error: 'Resource not found',
        });
      }

      // Only owner can transfer
      if (owner.ownerId !== userId) {
        return res.status(403).json({
          success: false,
          error: 'Only the resource owner can transfer ownership',
        });
      }

      // Validate transfer
      const validation = await ownershipService.validateTransfer(
        resourceType,
        resourceId,
        owner.ownerId,
        validatedData.toUserId
      );

      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          error: validation.reason,
        });
      }

      // Perform transfer
      const transferId = await ownershipService.transferOwnership(
        resourceType,
        resourceId,
        owner.ownerId,
        validatedData.toUserId,
        userId,
        validatedData.reason,
        validatedData.metadata
      );

      res.json({
        success: true,
        transferId,
        message: 'Ownership transferred successfully',
        fromOwner: owner.ownerId,
        toOwner: validatedData.toUserId,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Validation error',
          details: error.errors,
        });
      }

      AppLogger.error('Error transferring ownership', error as Error);
      res.status(500).json({
        success: false,
        error: 'Failed to transfer ownership',
      });
    }
  }
);

/**
 * GET /api/ownership/:resourceType/:resourceId/transfers
 * Get transfer history for a resource
 */
router.get('/:resourceType/:resourceId/transfers', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const { resourceType, resourceId } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;

    const transfers = await ownershipService.getResourceTransferHistory(
      resourceType,
      resourceId,
      limit
    );

    res.json({
      success: true,
      data: transfers,
      count: transfers.length,
    });
  } catch (error) {
    AppLogger.error('Error fetching transfer history', error as Error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch transfer history',
    });
  }
});

/**
 * GET /api/ownership/users/:userId/owned
 * Get resources owned by user
 */
router.get('/users/:userId/owned', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const resourceType = req.query.type as string | undefined;
    const currentUserId = (req as any).user?.userId;

    // Users can only view their own resources (unless admin)
    if (userId !== currentUserId) {
      // Check if user is admin
      const isAdmin = await rbacService.hasRole(currentUserId, 'admin');
      if (!isAdmin) {
        return res.status(403).json({
          success: false,
          error: 'You can only view your own resources',
        });
      }
    }

    const resources = await ownershipService.getUserOwnedResources(userId, resourceType);

    res.json({
      success: true,
      data: resources,
      count: resources.length,
    });
  } catch (error) {
    AppLogger.error('Error fetching owned resources', error as Error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch owned resources',
    });
  }
});

/**
 * GET /api/ownership/users/:userId/shared
 * Get resources shared with user
 */
router.get('/users/:userId/shared', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const resourceType = req.query.type as string | undefined;

    // Users can only view their own shared resources
    if (userId !== (req as any).user?.userId) {
      return res.status(403).json({
        success: false,
        error: 'You can only view your own shared resources',
      });
    }

    const resources = await ownershipService.getSharedWithUser(userId, resourceType);

    res.json({
      success: true,
      data: resources,
      count: resources.length,
    });
  } catch (error) {
    AppLogger.error('Error fetching shared resources', error as Error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch shared resources',
    });
  }
});

/**
 * GET /api/ownership/users/:userId/transfers
 * Get user's transfer history
 */
router.get('/users/:userId/transfers', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const limit = parseInt(req.query.limit as string) || 50;

    // Users can only view their own transfers
    if (userId !== (req as any).user?.userId) {
      return res.status(403).json({
        success: false,
        error: 'You can only view your own transfer history',
      });
    }

    const transfers = await ownershipService.getUserTransferHistory(userId, limit);

    res.json({
      success: true,
      data: transfers,
      count: transfers.length,
    });
  } catch (error) {
    AppLogger.error('Error fetching user transfer history', error as Error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch transfer history',
    });
  }
});

/**
 * POST /api/ownership/:resourceType/:resourceId/share/user
 * Share resource with a user
 */
router.post(
  '/:resourceType/:resourceId/share/user',
  authenticateJWT,
  async (req: Request, res: Response) => {
    try {
      const { resourceType, resourceId } = req.params;
      const validatedData = shareWithUserSchema.parse(req.body);
      const userId = (req as any).user?.userId;

      // Verify ownership
      const isOwner = await ownershipService.userOwnsResource(userId, resourceType, resourceId);
      if (!isOwner) {
        return res.status(403).json({
          success: false,
          error: 'Only the resource owner can share access',
        });
      }

      const shareId = await ownershipService.shareWithUser(
        resourceType,
        resourceId,
        userId,
        validatedData.userId,
        validatedData.permissionLevel,
        userId,
        validatedData.expiresAt ? new Date(validatedData.expiresAt) : undefined
      );

      res.status(201).json({
        success: true,
        shareId,
        message: 'Resource shared with user successfully',
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Validation error',
          details: error.errors,
        });
      }

      AppLogger.error('Error sharing resource with user', error as Error);
      res.status(500).json({
        success: false,
        error: 'Failed to share resource',
      });
    }
  }
);

/**
 * POST /api/ownership/:resourceType/:resourceId/share/role
 * Share resource with a role
 */
router.post(
  '/:resourceType/:resourceId/share/role',
  authenticateJWT,
  async (req: Request, res: Response) => {
    try {
      const { resourceType, resourceId } = req.params;
      const validatedData = shareWithRoleSchema.parse(req.body);
      const userId = (req as any).user?.userId;

      // Verify ownership
      const isOwner = await ownershipService.userOwnsResource(userId, resourceType, resourceId);
      if (!isOwner) {
        return res.status(403).json({
          success: false,
          error: 'Only the resource owner can share access',
        });
      }

      const shareId = await ownershipService.shareWithRole(
        resourceType,
        resourceId,
        userId,
        validatedData.roleId,
        validatedData.permissionLevel,
        userId,
        validatedData.expiresAt ? new Date(validatedData.expiresAt) : undefined
      );

      res.status(201).json({
        success: true,
        shareId,
        message: 'Resource shared with role successfully',
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Validation error',
          details: error.errors,
        });
      }

      AppLogger.error('Error sharing resource with role', error as Error);
      res.status(500).json({
        success: false,
        error: 'Failed to share resource',
      });
    }
  }
);

/**
 * GET /api/ownership/:resourceType/:resourceId/shares
 * Get shared access list for a resource
 */
router.get('/:resourceType/:resourceId/shares', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const { resourceType, resourceId } = req.params;
    const userId = (req as any).user?.userId;

    // Verify ownership (only owner can see full share list)
    const isOwner = await ownershipService.userOwnsResource(userId, resourceType, resourceId);
    if (!isOwner) {
      return res.status(403).json({
        success: false,
        error: 'Only the resource owner can view shared access list',
      });
    }

    const shares = await ownershipService.getResourceSharedAccess(resourceType, resourceId);

    res.json({
      success: true,
      data: shares,
      count: shares.length,
    });
  } catch (error) {
    AppLogger.error('Error fetching shared access list', error as Error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch shared access list',
    });
  }
});

/**
 * PUT /api/ownership/:resourceType/:resourceId/shares/:shareId
 * Update shared access permission level
 */
router.put(
  '/:resourceType/:resourceId/shares/:shareId',
  authenticateJWT,
  async (req: Request, res: Response) => {
    try {
      const { resourceType, resourceId, shareId } = req.params;
      const validatedData = updatePermissionSchema.parse(req.body);
      const userId = (req as any).user?.userId;

      // Verify ownership
      const isOwner = await ownershipService.userOwnsResource(userId, resourceType, resourceId);
      if (!isOwner) {
        return res.status(403).json({
          success: false,
          error: 'Only the resource owner can update shared access',
        });
      }

      await ownershipService.updateSharedAccessPermission(
        shareId,
        validatedData.permissionLevel
      );

      res.json({
        success: true,
        message: 'Shared access permission updated successfully',
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          success: false,
          error: 'Validation error',
          details: error.errors,
        });
      }

      AppLogger.error('Error updating shared access', error as Error);
      res.status(500).json({
        success: false,
        error: 'Failed to update shared access',
      });
    }
  }
);

/**
 * DELETE /api/ownership/:resourceType/:resourceId/shares/:shareId
 * Revoke shared access
 */
router.delete(
  '/:resourceType/:resourceId/shares/:shareId',
  authenticateJWT,
  async (req: Request, res: Response) => {
    try {
      const { resourceType, resourceId, shareId } = req.params;
      const userId = (req as any).user?.userId;

      // Verify ownership
      const isOwner = await ownershipService.userOwnsResource(userId, resourceType, resourceId);
      if (!isOwner) {
        return res.status(403).json({
          success: false,
          error: 'Only the resource owner can revoke access',
        });
      }

      // Get share details to determine if it's user or role
      const shares = await ownershipService.getResourceSharedAccess(resourceType, resourceId);
      const share = shares.find(s => s.id === shareId);

      if (!share) {
        return res.status(404).json({
          success: false,
          error: 'Shared access not found',
        });
      }

      const deletedCount = await ownershipService.revokeAccess(
        resourceType,
        resourceId,
        userId,
        share.sharedWithUserId,
        share.sharedWithRoleId
      );

      if (deletedCount === 0) {
        return res.status(404).json({
          success: false,
          error: 'Shared access not found or already revoked',
        });
      }

      res.json({
        success: true,
        message: 'Shared access revoked successfully',
      });
    } catch (error) {
      AppLogger.error('Error revoking shared access', error as Error);
      res.status(500).json({
        success: false,
        error: 'Failed to revoke shared access',
      });
    }
  }
);

/**
 * GET /api/ownership/statistics
 * Get ownership statistics
 */
router.get('/statistics', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const statistics = await ownershipService.getOwnershipStatistics();

    res.json({
      success: true,
      data: statistics,
    });
  } catch (error) {
    AppLogger.error('Error fetching ownership statistics', error as Error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch ownership statistics',
    });
  }
});

/**
 * POST /api/ownership/cleanup
 * Cleanup expired shares (admin only)
 */
router.post('/cleanup', authenticateJWT, requireAdmin, async (req: Request, res: Response) => {
  try {
    const deletedCount = await ownershipService.cleanupExpiredShares();

    res.json({
      success: true,
      message: 'Expired shares cleaned up',
      deletedCount,
    });
  } catch (error) {
    AppLogger.error('Error cleaning up expired shares', error as Error);
    res.status(500).json({
      success: false,
      error: 'Failed to cleanup expired shares',
    });
  }
});

/**
 * POST /api/ownership/:resourceType/:resourceId/validate-transfer
 * Validate ownership transfer before executing
 */
router.post(
  '/:resourceType/:resourceId/validate-transfer',
  authenticateJWT,
  async (req: Request, res: Response) => {
    try {
      const { resourceType, resourceId } = req.params;
      const { toUserId } = req.body;
      const userId = (req as any).user?.userId;

      if (!toUserId) {
        return res.status(400).json({
          success: false,
          error: 'toUserId is required',
        });
      }

      // Get current owner
      const owner = await ownershipService.getResourceOwner(resourceType, resourceId);
      if (!owner) {
        return res.status(404).json({
          success: false,
          error: 'Resource not found',
        });
      }

      // Validate
      const validation = await ownershipService.validateTransfer(
        resourceType,
        resourceId,
        owner.ownerId,
        toUserId
      );

      res.json({
        success: true,
        valid: validation.valid,
        reason: validation.reason,
      });
    } catch (error) {
      AppLogger.error('Error validating transfer', error as Error);
      res.status(500).json({
        success: false,
        error: 'Failed to validate transfer',
      });
    }
  }
);

export default router;
