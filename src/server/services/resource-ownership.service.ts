import { Pool } from 'pg';
import { AppLogger } from './logger.service.js';

/**
 * Resource Ownership Service
 * Manages resource ownership, transfers, and shared access
 */

export interface ResourceOwnership {
  id: string;
  resourceType: string;
  resourceId: string;
  ownerId: string;
  createdBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface OwnershipTransfer {
  id: string;
  resourceType: string;
  resourceId: string;
  fromOwnerId: string;
  toOwnerId: string;
  transferredBy: string;
  reason?: string;
  metadata?: Record<string, any>;
  transferredAt: Date;
}

export interface SharedResourceAccess {
  id: string;
  resourceType: string;
  resourceId: string;
  ownerId: string;
  sharedWithUserId?: string;
  sharedWithRoleId?: string;
  permissionLevel: 'read' | 'write' | 'admin';
  sharedBy: string;
  expiresAt?: Date;
  createdAt: Date;
}

export interface ResourceOwner {
  ownerId: string;
  ownerUsername: string;
  ownerEmail: string;
  ownedSince: Date;
}

export interface OwnedResource {
  resourceType: string;
  resourceId: string;
  createdAt: Date;
  shareCount: number;
}

export interface SharedResource {
  resourceType: string;
  resourceId: string;
  ownerId: string;
  ownerUsername: string;
  permissionLevel: 'read' | 'write' | 'admin';
  sharedAt: Date;
  expiresAt?: Date;
}

export class ResourceOwnershipService {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Check if user owns a resource
   */
  async userOwnsResource(
    userId: string,
    resourceType: string,
    resourceId: string
  ): Promise<boolean> {
    const result = await this.pool.query(
      'SELECT user_owns_resource($1, $2, $3) as owns',
      [userId, resourceType, resourceId]
    );
    return result.rows[0]?.owns || false;
  }

  /**
   * Check if user has access to a resource (owner or shared)
   */
  async userHasResourceAccess(
    userId: string,
    resourceType: string,
    resourceId: string,
    permissionLevel: 'read' | 'write' | 'admin' = 'read'
  ): Promise<boolean> {
    const result = await this.pool.query(
      'SELECT user_has_resource_access($1, $2, $3, $4) as has_access',
      [userId, resourceType, resourceId, permissionLevel]
    );
    return result.rows[0]?.has_access || false;
  }

  /**
   * Register resource ownership
   */
  async registerOwnership(
    resourceType: string,
    resourceId: string,
    ownerId: string,
    createdBy?: string
  ): Promise<string> {
    try {
      const result = await this.pool.query(
        'SELECT register_resource_ownership($1, $2, $3, $4) as ownership_id',
        [resourceType, resourceId, ownerId, createdBy]
      );

      const ownershipId = result.rows[0].ownership_id;

      AppLogger.info('Resource ownership registered', {
        resourceType,
        resourceId,
        ownerId,
        ownershipId,
      });

      return ownershipId;
    } catch (error) {
      AppLogger.error('Error registering resource ownership', error as Error, {
        resourceType,
        resourceId,
        ownerId,
      });
      throw error;
    }
  }

  /**
   * Transfer resource ownership
   */
  async transferOwnership(
    resourceType: string,
    resourceId: string,
    fromOwnerId: string,
    toOwnerId: string,
    transferredBy: string,
    reason?: string,
    metadata?: Record<string, any>
  ): Promise<string> {
    try {
      const result = await this.pool.query(
        'SELECT transfer_resource_ownership($1, $2, $3, $4, $5, $6, $7) as transfer_id',
        [
          resourceType,
          resourceId,
          fromOwnerId,
          toOwnerId,
          transferredBy,
          reason,
          metadata ? JSON.stringify(metadata) : null,
        ]
      );

      const transferId = result.rows[0].transfer_id;

      AppLogger.info('Resource ownership transferred', {
        resourceType,
        resourceId,
        fromOwnerId,
        toOwnerId,
        transferredBy,
        transferId,
      });

      return transferId;
    } catch (error) {
      AppLogger.error('Error transferring resource ownership', error as Error, {
        resourceType,
        resourceId,
        fromOwnerId,
        toOwnerId,
      });
      throw error;
    }
  }

  /**
   * Share resource with user
   */
  async shareWithUser(
    resourceType: string,
    resourceId: string,
    ownerId: string,
    sharedWithUserId: string,
    permissionLevel: 'read' | 'write' | 'admin',
    sharedBy: string,
    expiresAt?: Date
  ): Promise<string> {
    try {
      const result = await this.pool.query(
        'SELECT share_resource_with_user($1, $2, $3, $4, $5, $6, $7) as share_id',
        [
          resourceType,
          resourceId,
          ownerId,
          sharedWithUserId,
          permissionLevel,
          sharedBy,
          expiresAt,
        ]
      );

      const shareId = result.rows[0].share_id;

      AppLogger.info('Resource shared with user', {
        resourceType,
        resourceId,
        ownerId,
        sharedWithUserId,
        permissionLevel,
        shareId,
      });

      return shareId;
    } catch (error) {
      AppLogger.error('Error sharing resource with user', error as Error, {
        resourceType,
        resourceId,
        sharedWithUserId,
      });
      throw error;
    }
  }

  /**
   * Share resource with role
   */
  async shareWithRole(
    resourceType: string,
    resourceId: string,
    ownerId: string,
    sharedWithRoleId: string,
    permissionLevel: 'read' | 'write' | 'admin',
    sharedBy: string,
    expiresAt?: Date
  ): Promise<string> {
    try {
      const result = await this.pool.query(
        'SELECT share_resource_with_role($1, $2, $3, $4, $5, $6, $7) as share_id',
        [
          resourceType,
          resourceId,
          ownerId,
          sharedWithRoleId,
          permissionLevel,
          sharedBy,
          expiresAt,
        ]
      );

      const shareId = result.rows[0].share_id;

      AppLogger.info('Resource shared with role', {
        resourceType,
        resourceId,
        ownerId,
        sharedWithRoleId,
        permissionLevel,
        shareId,
      });

      return shareId;
    } catch (error) {
      AppLogger.error('Error sharing resource with role', error as Error, {
        resourceType,
        resourceId,
        sharedWithRoleId,
      });
      throw error;
    }
  }

  /**
   * Revoke resource access
   */
  async revokeAccess(
    resourceType: string,
    resourceId: string,
    ownerId: string,
    userId?: string,
    roleId?: string
  ): Promise<number> {
    try {
      const result = await this.pool.query(
        'SELECT revoke_resource_access($1, $2, $3, $4, $5) as deleted_count',
        [resourceType, resourceId, ownerId, userId, roleId]
      );

      const deletedCount = result.rows[0].deleted_count;

      AppLogger.info('Resource access revoked', {
        resourceType,
        resourceId,
        ownerId,
        userId,
        roleId,
        deletedCount,
      });

      return deletedCount;
    } catch (error) {
      AppLogger.error('Error revoking resource access', error as Error, {
        resourceType,
        resourceId,
        userId,
        roleId,
      });
      throw error;
    }
  }

  /**
   * Get resource owner
   */
  async getResourceOwner(
    resourceType: string,
    resourceId: string
  ): Promise<ResourceOwner | null> {
    const result = await this.pool.query(
      'SELECT * FROM get_resource_owner($1, $2)',
      [resourceType, resourceId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      ownerId: row.owner_id,
      ownerUsername: row.owner_username,
      ownerEmail: row.owner_email,
      ownedSince: row.owned_since,
    };
  }

  /**
   * Get user's owned resources
   */
  async getUserOwnedResources(
    userId: string,
    resourceType?: string
  ): Promise<OwnedResource[]> {
    const result = await this.pool.query(
      'SELECT * FROM get_user_owned_resources($1, $2)',
      [userId, resourceType]
    );

    return result.rows.map((row) => ({
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      createdAt: row.created_at,
      shareCount: row.share_count,
    }));
  }

  /**
   * Get resources shared with user
   */
  async getSharedWithUser(
    userId: string,
    resourceType?: string
  ): Promise<SharedResource[]> {
    const result = await this.pool.query(
      'SELECT * FROM get_shared_with_user($1, $2)',
      [userId, resourceType]
    );

    return result.rows.map((row) => ({
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      ownerId: row.owner_id,
      ownerUsername: row.owner_username,
      permissionLevel: row.permission_level,
      sharedAt: row.shared_at,
      expiresAt: row.expires_at,
    }));
  }

  /**
   * Get ownership transfers for a resource
   */
  async getResourceTransferHistory(
    resourceType: string,
    resourceId: string,
    limit: number = 50
  ): Promise<OwnershipTransfer[]> {
    const result = await this.pool.query(
      `SELECT * FROM ownership_transfers
       WHERE resource_type = $1 AND resource_id = $2
       ORDER BY transferred_at DESC
       LIMIT $3`,
      [resourceType, resourceId, limit]
    );

    return result.rows.map((row) => ({
      id: row.id,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      fromOwnerId: row.from_owner_id,
      toOwnerId: row.to_owner_id,
      transferredBy: row.transferred_by,
      reason: row.reason,
      metadata: row.metadata,
      transferredAt: row.transferred_at,
    }));
  }

  /**
   * Get user's transfer history
   */
  async getUserTransferHistory(
    userId: string,
    limit: number = 50
  ): Promise<OwnershipTransfer[]> {
    const result = await this.pool.query(
      `SELECT * FROM ownership_transfers
       WHERE from_owner_id = $1 OR to_owner_id = $1
       ORDER BY transferred_at DESC
       LIMIT $2`,
      [userId, limit]
    );

    return result.rows.map((row) => ({
      id: row.id,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      fromOwnerId: row.from_owner_id,
      toOwnerId: row.to_owner_id,
      transferredBy: row.transferred_by,
      reason: row.reason,
      metadata: row.metadata,
      transferredAt: row.transferred_at,
    }));
  }

  /**
   * Get shared access list for a resource
   */
  async getResourceSharedAccess(
    resourceType: string,
    resourceId: string
  ): Promise<SharedResourceAccess[]> {
    const result = await this.pool.query(
      `SELECT * FROM shared_resource_access
       WHERE resource_type = $1 AND resource_id = $2
       AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP)
       ORDER BY created_at DESC`,
      [resourceType, resourceId]
    );

    return result.rows.map((row) => ({
      id: row.id,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      ownerId: row.owner_id,
      sharedWithUserId: row.shared_with_user_id,
      sharedWithRoleId: row.shared_with_role_id,
      permissionLevel: row.permission_level,
      sharedBy: row.shared_by,
      expiresAt: row.expires_at,
      createdAt: row.created_at,
    }));
  }

  /**
   * Update shared access permission level
   */
  async updateSharedAccessPermission(
    shareId: string,
    permissionLevel: 'read' | 'write' | 'admin'
  ): Promise<void> {
    await this.pool.query(
      'UPDATE shared_resource_access SET permission_level = $1 WHERE id = $2',
      [permissionLevel, shareId]
    );

    AppLogger.info('Shared access permission updated', {
      shareId,
      permissionLevel,
    });
  }

  /**
   * Cleanup expired shares
   */
  async cleanupExpiredShares(): Promise<number> {
    const result = await this.pool.query('SELECT cleanup_expired_shares() as count');
    const deletedCount = result.rows[0].count;

    AppLogger.info('Expired shares cleaned up', { deletedCount });
    return deletedCount;
  }

  /**
   * Get ownership statistics
   */
  async getOwnershipStatistics(): Promise<
    Array<{
      resourceType: string;
      totalResources: number;
      totalOwners: number;
      activeShares: number;
      totalTransfers: number;
    }>
  > {
    const result = await this.pool.query('SELECT * FROM ownership_statistics');

    return result.rows.map((row) => ({
      resourceType: row.resource_type,
      totalResources: row.total_resources,
      totalOwners: row.total_owners,
      activeShares: row.active_shares,
      totalTransfers: row.total_transfers,
    }));
  }

  /**
   * Validate ownership transfer
   */
  async validateTransfer(
    resourceType: string,
    resourceId: string,
    fromOwnerId: string,
    toOwnerId: string
  ): Promise<{ valid: boolean; reason?: string }> {
    // Check if resource exists and owner is correct
    const owner = await this.getResourceOwner(resourceType, resourceId);

    if (!owner) {
      return { valid: false, reason: 'Resource ownership not found' };
    }

    if (owner.ownerId !== fromOwnerId) {
      return { valid: false, reason: 'Current owner mismatch' };
    }

    if (fromOwnerId === toOwnerId) {
      return { valid: false, reason: 'Cannot transfer to same owner' };
    }

    // Check if target user exists
    const userExists = await this.pool.query(
      'SELECT EXISTS(SELECT 1 FROM users WHERE id = $1) as exists',
      [toOwnerId]
    );

    if (!userExists.rows[0].exists) {
      return { valid: false, reason: 'Target user not found' };
    }

    return { valid: true };
  }

  /**
   * Batch register ownership for multiple resources
   */
  async batchRegisterOwnership(
    resources: Array<{
      resourceType: string;
      resourceId: string;
      ownerId: string;
    }>
  ): Promise<string[]> {
    const ownershipIds: string[] = [];

    for (const resource of resources) {
      const id = await this.registerOwnership(
        resource.resourceType,
        resource.resourceId,
        resource.ownerId
      );
      ownershipIds.push(id);
    }

    return ownershipIds;
  }

  /**
   * Delete resource ownership (cleanup when resource is deleted)
   */
  async deleteResourceOwnership(
    resourceType: string,
    resourceId: string
  ): Promise<void> {
    await this.pool.query(
      'DELETE FROM resource_ownership WHERE resource_type = $1 AND resource_id = $2',
      [resourceType, resourceId]
    );

    AppLogger.info('Resource ownership deleted', { resourceType, resourceId });
  }
}

// Singleton instance
let resourceOwnershipService: ResourceOwnershipService | null = null;

export function initializeResourceOwnershipService(
  pool: Pool
): ResourceOwnershipService {
  if (!resourceOwnershipService) {
    resourceOwnershipService = new ResourceOwnershipService(pool);
  }
  return resourceOwnershipService;
}

export function getResourceOwnershipService(): ResourceOwnershipService {
  if (!resourceOwnershipService) {
    throw new Error('ResourceOwnershipService not initialized');
  }
  return resourceOwnershipService;
}
