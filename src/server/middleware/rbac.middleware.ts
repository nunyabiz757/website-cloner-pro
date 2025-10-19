import { Request, Response, NextFunction } from 'express';
import { Pool } from 'pg';
import { RBACService } from '../services/rbac.service.js';
import { ResourceOwnershipService } from '../services/resource-ownership.service.js';
import { SecurityLogger } from '../services/logger.service.js';

// Initialize database pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const rbacService = new RBACService(pool);
const ownershipService = new ResourceOwnershipService(pool);

/**
 * Require permission middleware
 * @param resource Resource name
 * @param action Action name
 * @returns Express middleware
 */
export const requirePermission = (resource: string, action: string) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user || !('userId' in req.user)) {
        SecurityLogger.logAuthorization(false, resource, action, {
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

      const hasPermission = await rbacService.hasPermission(req.user.userId, resource, action);

      if (!hasPermission) {
        SecurityLogger.logAuthorization(false, resource, action, {
          userId: req.user.userId,
          path: req.path,
          method: req.method,
          ip: req.ip,
        });

        res.status(403).json({
          success: false,
          error: 'Insufficient permissions',
          code: 'FORBIDDEN',
          required: { resource, action },
        });
        return;
      }

      SecurityLogger.logAuthorization(true, resource, action, {
        userId: req.user.userId,
        path: req.path,
        method: req.method,
      });

      next();
    } catch (error) {
      console.error('Permission check error:', error);
      res.status(500).json({
        success: false,
        error: 'Authorization check failed',
        code: 'AUTHORIZATION_ERROR',
      });
    }
  };
};

/**
 * Require any of the specified permissions
 * @param permissions Array of [resource, action] tuples
 * @returns Express middleware
 */
export const requireAnyPermission = (permissions: [string, string][]) => {
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

      const hasPermission = await rbacService.hasAnyPermission(req.user.userId, permissions);

      if (!hasPermission) {
        SecurityLogger.logAuthorization(false, 'multiple', 'any', {
          userId: req.user.userId,
          requiredPermissions: permissions,
          path: req.path,
          method: req.method,
          ip: req.ip,
        });

        res.status(403).json({
          success: false,
          error: 'Insufficient permissions',
          code: 'FORBIDDEN',
          required: { anyOf: permissions },
        });
        return;
      }

      next();
    } catch (error) {
      console.error('Permission check error:', error);
      res.status(500).json({
        success: false,
        error: 'Authorization check failed',
        code: 'AUTHORIZATION_ERROR',
      });
    }
  };
};

/**
 * Require all of the specified permissions
 * @param permissions Array of [resource, action] tuples
 * @returns Express middleware
 */
export const requireAllPermissions = (permissions: [string, string][]) => {
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

      const hasPermissions = await rbacService.hasAllPermissions(req.user.userId, permissions);

      if (!hasPermissions) {
        SecurityLogger.logAuthorization(false, 'multiple', 'all', {
          userId: req.user.userId,
          requiredPermissions: permissions,
          path: req.path,
          method: req.method,
          ip: req.ip,
        });

        res.status(403).json({
          success: false,
          error: 'Insufficient permissions',
          code: 'FORBIDDEN',
          required: { allOf: permissions },
        });
        return;
      }

      next();
    } catch (error) {
      console.error('Permission check error:', error);
      res.status(500).json({
        success: false,
        error: 'Authorization check failed',
        code: 'AUTHORIZATION_ERROR',
      });
    }
  };
};

/**
 * Require role middleware
 * @param roleName Role name
 * @returns Express middleware
 */
export const requireRole = (roleName: string) => {
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

      const hasRole = await rbacService.hasRole(req.user.userId, roleName);

      if (!hasRole) {
        SecurityLogger.logAuthorization(false, 'role', roleName, {
          userId: req.user.userId,
          path: req.path,
          method: req.method,
          ip: req.ip,
        });

        res.status(403).json({
          success: false,
          error: 'Insufficient permissions',
          code: 'FORBIDDEN',
          required: { role: roleName },
        });
        return;
      }

      next();
    } catch (error) {
      console.error('Role check error:', error);
      res.status(500).json({
        success: false,
        error: 'Authorization check failed',
        code: 'AUTHORIZATION_ERROR',
      });
    }
  };
};

/**
 * Require any of the specified roles
 * @param roleNames Array of role names
 * @returns Express middleware
 */
export const requireAnyRole = (roleNames: string[]) => {
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

      for (const roleName of roleNames) {
        const hasRole = await rbacService.hasRole(req.user.userId, roleName);
        if (hasRole) {
          return next();
        }
      }

      SecurityLogger.logAuthorization(false, 'roles', 'any', {
        userId: req.user.userId,
        requiredRoles: roleNames,
        path: req.path,
        method: req.method,
        ip: req.ip,
      });

      res.status(403).json({
        success: false,
        error: 'Insufficient permissions',
        code: 'FORBIDDEN',
        required: { anyRole: roleNames },
      });
    } catch (error) {
      console.error('Role check error:', error);
      res.status(500).json({
        success: false,
        error: 'Authorization check failed',
        code: 'AUTHORIZATION_ERROR',
      });
    }
  };
};

/**
 * Resource ownership check
 * Checks if user owns the resource specified in route params
 * @param resourceIdParam Parameter name in req.params (e.g., 'projectId')
 * @param resourceTable Database table name
 * @param ownerColumn Column name for owner ID (default: 'user_id')
 * @returns Express middleware
 */
export const requireOwnership = (
  resourceIdParam: string,
  resourceTable: string,
  ownerColumn: string = 'user_id'
) => {
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

      const resourceId = req.params[resourceIdParam];
      if (!resourceId) {
        res.status(400).json({
          success: false,
          error: 'Resource ID not provided',
          code: 'VALIDATION_ERROR',
        });
        return;
      }

      // Check ownership
      const result = await pool.query(
        `SELECT EXISTS (
          SELECT 1 FROM ${resourceTable}
          WHERE id = $1 AND ${ownerColumn} = $2
        ) as is_owner`,
        [resourceId, req.user.userId]
      );

      if (!result.rows[0]?.is_owner) {
        SecurityLogger.logAuthorization(false, resourceTable, 'access', {
          userId: req.user.userId,
          resourceId,
          reason: 'not_owner',
          path: req.path,
          method: req.method,
          ip: req.ip,
        });

        res.status(403).json({
          success: false,
          error: 'You do not have access to this resource',
          code: 'FORBIDDEN',
        });
        return;
      }

      next();
    } catch (error) {
      console.error('Ownership check error:', error);
      res.status(500).json({
        success: false,
        error: 'Authorization check failed',
        code: 'AUTHORIZATION_ERROR',
      });
    }
  };
};

/**
 * Admin only middleware
 * Shortcut for requiring admin role
 */
export const requireAdmin = requireRole('admin');

/**
 * Optional permission check
 * Adds permission info to request but doesn't block
 */
export const checkPermission = (resource: string, action: string) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (req.user && 'userId' in req.user) {
        const hasPermission = await rbacService.hasPermission(req.user.userId, resource, action);
        (req as any).hasPermission = hasPermission;
      } else {
        (req as any).hasPermission = false;
      }
      next();
    } catch (error) {
      console.error('Permission check error:', error);
      (req as any).hasPermission = false;
      next();
    }
  };
};

/**
 * Comprehensive resource ownership check
 * Uses the resource_ownership service for centralized ownership tracking
 * @param resourceType Type of resource (e.g., 'project', 'document')
 * @param resourceIdParam Parameter name in req.params
 * @returns Express middleware
 */
export const requireResourceOwnership = (
  resourceType: string,
  resourceIdParam: string = 'id'
) => {
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

      const resourceId = req.params[resourceIdParam];
      if (!resourceId) {
        res.status(400).json({
          success: false,
          error: 'Resource ID not provided',
          code: 'VALIDATION_ERROR',
        });
        return;
      }

      const isOwner = await ownershipService.userOwnsResource(
        req.user.userId,
        resourceType,
        resourceId
      );

      if (!isOwner) {
        SecurityLogger.logAuthorization(false, resourceType, 'owner_access', {
          userId: req.user.userId,
          resourceId,
          resourceType,
          reason: 'not_owner',
          path: req.path,
          method: req.method,
          ip: req.ip,
        });

        res.status(403).json({
          success: false,
          error: 'You do not own this resource',
          code: 'NOT_OWNER',
          resourceType,
        });
        return;
      }

      // Add owner info to request
      (req as any).isResourceOwner = true;
      next();
    } catch (error) {
      console.error('Resource ownership check error:', error);
      res.status(500).json({
        success: false,
        error: 'Authorization check failed',
        code: 'AUTHORIZATION_ERROR',
      });
    }
  };
};

/**
 * Check resource access (owner or shared)
 * Allows access if user owns or has shared access to the resource
 * @param resourceType Type of resource
 * @param resourceIdParam Parameter name in req.params
 * @param requiredPermission Permission level required ('read', 'write', 'admin')
 * @returns Express middleware
 */
export const requireResourceAccess = (
  resourceType: string,
  resourceIdParam: string = 'id',
  requiredPermission: 'read' | 'write' | 'admin' = 'read'
) => {
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

      const resourceId = req.params[resourceIdParam];
      if (!resourceId) {
        res.status(400).json({
          success: false,
          error: 'Resource ID not provided',
          code: 'VALIDATION_ERROR',
        });
        return;
      }

      const hasAccess = await ownershipService.userHasResourceAccess(
        req.user.userId,
        resourceType,
        resourceId,
        requiredPermission
      );

      if (!hasAccess) {
        SecurityLogger.logAuthorization(false, resourceType, 'resource_access', {
          userId: req.user.userId,
          resourceId,
          resourceType,
          requiredPermission,
          reason: 'access_denied',
          path: req.path,
          method: req.method,
          ip: req.ip,
        });

        res.status(403).json({
          success: false,
          error: 'You do not have access to this resource',
          code: 'ACCESS_DENIED',
          resourceType,
          requiredPermission,
        });
        return;
      }

      // Check if user is owner
      const isOwner = await ownershipService.userOwnsResource(
        req.user.userId,
        resourceType,
        resourceId
      );

      // Add access info to request
      (req as any).isResourceOwner = isOwner;
      (req as any).hasResourceAccess = true;
      (req as any).resourceAccessLevel = requiredPermission;

      next();
    } catch (error) {
      console.error('Resource access check error:', error);
      res.status(500).json({
        success: false,
        error: 'Authorization check failed',
        code: 'AUTHORIZATION_ERROR',
      });
    }
  };
};

/**
 * Owner or admin check
 * Allows access if user owns the resource OR has admin role
 * @param resourceType Type of resource
 * @param resourceIdParam Parameter name in req.params
 * @returns Express middleware
 */
export const requireOwnerOrAdmin = (
  resourceType: string,
  resourceIdParam: string = 'id'
) => {
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

      // Check if user is admin
      const isAdmin = await rbacService.hasRole(req.user.userId, 'admin');
      if (isAdmin) {
        (req as any).isResourceOwner = false;
        (req as any).isAdmin = true;
        return next();
      }

      // Check if user is owner
      const resourceId = req.params[resourceIdParam];
      if (!resourceId) {
        res.status(400).json({
          success: false,
          error: 'Resource ID not provided',
          code: 'VALIDATION_ERROR',
        });
        return;
      }

      const isOwner = await ownershipService.userOwnsResource(
        req.user.userId,
        resourceType,
        resourceId
      );

      if (!isOwner) {
        SecurityLogger.logAuthorization(false, resourceType, 'owner_or_admin', {
          userId: req.user.userId,
          resourceId,
          resourceType,
          reason: 'not_owner_or_admin',
          path: req.path,
          method: req.method,
          ip: req.ip,
        });

        res.status(403).json({
          success: false,
          error: 'You must be the owner or an admin to perform this action',
          code: 'OWNER_OR_ADMIN_REQUIRED',
          resourceType,
        });
        return;
      }

      (req as any).isResourceOwner = true;
      (req as any).isAdmin = false;
      next();
    } catch (error) {
      console.error('Owner or admin check error:', error);
      res.status(500).json({
        success: false,
        error: 'Authorization check failed',
        code: 'AUTHORIZATION_ERROR',
      });
    }
  };
};

/**
 * Permission or ownership check
 * Allows access if user has permission OR owns the resource
 * @param resource Resource permission name
 * @param action Action permission name
 * @param resourceType Resource ownership type
 * @param resourceIdParam Parameter name in req.params
 * @returns Express middleware
 */
export const requirePermissionOrOwnership = (
  resource: string,
  action: string,
  resourceType: string,
  resourceIdParam: string = 'id'
) => {
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

      // Check permission first
      const hasPermission = await rbacService.hasPermission(
        req.user.userId,
        resource,
        action
      );

      if (hasPermission) {
        (req as any).accessVia = 'permission';
        return next();
      }

      // Check ownership
      const resourceId = req.params[resourceIdParam];
      if (!resourceId) {
        res.status(400).json({
          success: false,
          error: 'Resource ID not provided',
          code: 'VALIDATION_ERROR',
        });
        return;
      }

      const isOwner = await ownershipService.userOwnsResource(
        req.user.userId,
        resourceType,
        resourceId
      );

      if (!isOwner) {
        SecurityLogger.logAuthorization(false, resource, action, {
          userId: req.user.userId,
          resourceId,
          resourceType,
          reason: 'no_permission_or_ownership',
          path: req.path,
          method: req.method,
          ip: req.ip,
        });

        res.status(403).json({
          success: false,
          error: 'You do not have permission or ownership for this action',
          code: 'PERMISSION_OR_OWNERSHIP_REQUIRED',
          required: { resource, action, resourceType },
        });
        return;
      }

      (req as any).accessVia = 'ownership';
      (req as any).isResourceOwner = true;
      next();
    } catch (error) {
      console.error('Permission or ownership check error:', error);
      res.status(500).json({
        success: false,
        error: 'Authorization check failed',
        code: 'AUTHORIZATION_ERROR',
      });
    }
  };
};

/**
 * Optional ownership check
 * Adds ownership info to request but doesn't block
 * @param resourceType Type of resource
 * @param resourceIdParam Parameter name in req.params
 * @returns Express middleware
 */
export const checkOwnership = (
  resourceType: string,
  resourceIdParam: string = 'id'
) => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      if (req.user && 'userId' in req.user && req.params[resourceIdParam]) {
        const resourceId = req.params[resourceIdParam];
        const isOwner = await ownershipService.userOwnsResource(
          req.user.userId,
          resourceType,
          resourceId
        );
        (req as any).isResourceOwner = isOwner;
      } else {
        (req as any).isResourceOwner = false;
      }
      next();
    } catch (error) {
      console.error('Ownership check error:', error);
      (req as any).isResourceOwner = false;
      next();
    }
  };
};

export { rbacService, ownershipService };
