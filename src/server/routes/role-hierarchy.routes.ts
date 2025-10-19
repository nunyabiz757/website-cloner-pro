import express, { Request, Response, Router } from 'express';
import { z } from 'zod';
import { Pool } from 'pg';
import { RBACService } from '../services/rbac.service.js';
import { authenticateJWT } from '../middleware/auth.middleware.js';
import { AppLogger } from '../services/logger.service.js';

/**
 * Role Hierarchy Routes
 * Manage role hierarchy and permission inheritance
 */

const router: Router = express.Router();
let rbacService: RBACService;

// Validation schemas
const setParentSchema = z.object({
  parentRoleId: z.string().uuid().nullable(),
});

const setInheritanceSchema = z.object({
  inheritPermissions: z.boolean(),
});

const createRoleWithParentSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500),
  parentRoleId: z.string().uuid().optional(),
  inheritPermissions: z.boolean().default(true),
});

const validateHierarchySchema = z.object({
  parentRoleId: z.string().uuid(),
});

/**
 * Initialize role hierarchy routes with database pool
 */
export function initializeRoleHierarchyRoutes(pool: Pool): void {
  rbacService = new RBACService(pool);
}

/**
 * GET /api/roles/hierarchy
 * Get complete role hierarchy tree
 */
router.get('/hierarchy', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const hierarchy = await rbacService.getRoleHierarchyTree();

    res.json({
      success: true,
      data: hierarchy,
    });
  } catch (error) {
    AppLogger.error('Error fetching role hierarchy', error as Error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch role hierarchy',
    });
  }
});

/**
 * GET /api/roles/hierarchy/view
 * Get role hierarchy with denormalized information
 */
router.get('/hierarchy/view', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const hierarchy = await rbacService.getRoleHierarchyView();

    res.json({
      success: true,
      data: hierarchy,
    });
  } catch (error) {
    AppLogger.error('Error fetching role hierarchy view', error as Error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch role hierarchy view',
    });
  }
});

/**
 * GET /api/roles/hierarchy/:roleId
 * Get specific role with hierarchy information
 */
router.get('/hierarchy/:roleId', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const { roleId } = req.params;

    const role = await rbacService.getRoleWithHierarchy(roleId);

    if (!role) {
      return res.status(404).json({
        success: false,
        error: 'Role not found',
      });
    }

    res.json({
      success: true,
      data: role,
    });
  } catch (error) {
    AppLogger.error('Error fetching role hierarchy', error as Error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch role hierarchy',
    });
  }
});

/**
 * GET /api/roles/:roleId/ancestors
 * Get ancestor roles for a given role
 */
router.get('/:roleId/ancestors', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const { roleId } = req.params;

    const ancestors = await rbacService.getRoleAncestors(roleId);

    res.json({
      success: true,
      data: ancestors,
      count: ancestors.length,
    });
  } catch (error) {
    AppLogger.error('Error fetching role ancestors', error as Error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch role ancestors',
    });
  }
});

/**
 * GET /api/roles/:roleId/descendants
 * Get descendant roles for a given role
 */
router.get('/:roleId/descendants', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const { roleId } = req.params;

    const descendants = await rbacService.getRoleDescendants(roleId);

    res.json({
      success: true,
      data: descendants,
      count: descendants.length,
    });
  } catch (error) {
    AppLogger.error('Error fetching role descendants', error as Error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch role descendants',
    });
  }
});

/**
 * GET /api/roles/:roleId/children
 * Get direct child roles
 */
router.get('/:roleId/children', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const { roleId } = req.params;

    const children = await rbacService.getChildRoles(roleId);

    res.json({
      success: true,
      data: children,
      count: children.length,
    });
  } catch (error) {
    AppLogger.error('Error fetching child roles', error as Error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch child roles',
    });
  }
});

/**
 * GET /api/roles/root
 * Get root roles (no parent)
 */
router.get('/root', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const rootRoles = await rbacService.getRootRoles();

    res.json({
      success: true,
      data: rootRoles,
      count: rootRoles.length,
    });
  } catch (error) {
    AppLogger.error('Error fetching root roles', error as Error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch root roles',
    });
  }
});

/**
 * GET /api/roles/level/:level
 * Get roles at specific hierarchy level
 */
router.get('/level/:level', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const level = parseInt(req.params.level);

    if (isNaN(level) || level < 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid hierarchy level',
      });
    }

    const roles = await rbacService.getRolesByLevel(level);

    res.json({
      success: true,
      data: roles,
      count: roles.length,
      level,
    });
  } catch (error) {
    AppLogger.error('Error fetching roles by level', error as Error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch roles by level',
    });
  }
});

/**
 * POST /api/roles/with-parent
 * Create new role with parent
 */
router.post('/with-parent', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const validatedData = createRoleWithParentSchema.parse(req.body);

    const role = await rbacService.createRoleWithParent(
      validatedData.name,
      validatedData.description,
      validatedData.parentRoleId,
      validatedData.inheritPermissions
    );

    AppLogger.info('Role created with parent', {
      roleId: role.id,
      name: role.name,
      parentRoleId: validatedData.parentRoleId,
    });

    res.status(201).json({
      success: true,
      data: role,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.errors,
      });
    }

    if (error instanceof Error && error.message.includes('not found')) {
      return res.status(404).json({
        success: false,
        error: error.message,
      });
    }

    AppLogger.error('Error creating role with parent', error as Error);
    res.status(500).json({
      success: false,
      error: 'Failed to create role',
    });
  }
});

/**
 * PUT /api/roles/:roleId/parent
 * Set or change parent role
 */
router.put('/:roleId/parent', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const { roleId } = req.params;
    const { parentRoleId } = setParentSchema.parse(req.body);

    // Validate hierarchy before setting
    if (parentRoleId) {
      const isValid = await rbacService.validateRoleHierarchy(roleId, parentRoleId);
      if (!isValid) {
        return res.status(400).json({
          success: false,
          error: 'Invalid hierarchy: would create cycle or exceed maximum depth',
        });
      }
    }

    const success = await rbacService.setRoleParent(roleId, parentRoleId);

    if (!success) {
      return res.status(400).json({
        success: false,
        error: 'Failed to set role parent',
      });
    }

    AppLogger.info('Role parent updated', { roleId, parentRoleId });

    res.json({
      success: true,
      message: 'Role parent updated successfully',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.errors,
      });
    }

    if (error instanceof Error && error.message.includes('cycle')) {
      return res.status(400).json({
        success: false,
        error: error.message,
      });
    }

    AppLogger.error('Error setting role parent', error as Error);
    res.status(500).json({
      success: false,
      error: 'Failed to set role parent',
    });
  }
});

/**
 * DELETE /api/roles/:roleId/parent
 * Remove parent role (make it a root role)
 */
router.delete('/:roleId/parent', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const { roleId } = req.params;

    const success = await rbacService.setRoleParent(roleId, null);

    if (!success) {
      return res.status(400).json({
        success: false,
        error: 'Failed to remove role parent',
      });
    }

    AppLogger.info('Role parent removed', { roleId });

    res.json({
      success: true,
      message: 'Role parent removed successfully',
    });
  } catch (error) {
    AppLogger.error('Error removing role parent', error as Error);
    res.status(500).json({
      success: false,
      error: 'Failed to remove role parent',
    });
  }
});

/**
 * PUT /api/roles/:roleId/inheritance
 * Set role inheritance behavior
 */
router.put('/:roleId/inheritance', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const { roleId } = req.params;
    const { inheritPermissions } = setInheritanceSchema.parse(req.body);

    await rbacService.setRoleInheritance(roleId, inheritPermissions);

    AppLogger.info('Role inheritance updated', { roleId, inheritPermissions });

    res.json({
      success: true,
      message: 'Role inheritance updated successfully',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.errors,
      });
    }

    AppLogger.error('Error setting role inheritance', error as Error);
    res.status(500).json({
      success: false,
      error: 'Failed to set role inheritance',
    });
  }
});

/**
 * POST /api/roles/:roleId/validate-parent
 * Validate if a parent can be set
 */
router.post('/:roleId/validate-parent', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const { roleId } = req.params;
    const { parentRoleId } = validateHierarchySchema.parse(req.body);

    const isValid = await rbacService.validateRoleHierarchy(roleId, parentRoleId);

    res.json({
      success: true,
      valid: isValid,
      message: isValid ? 'Hierarchy is valid' : 'Invalid hierarchy: would create cycle or exceed maximum depth',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.errors,
      });
    }

    AppLogger.error('Error validating hierarchy', error as Error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate hierarchy',
    });
  }
});

/**
 * GET /api/roles/:roleId/permissions/inherited
 * Get inherited permissions for a role
 */
router.get('/:roleId/permissions/inherited', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const { roleId } = req.params;

    const permissions = await rbacService.getRoleInheritedPermissions(roleId);

    // Separate direct and inherited
    const direct = permissions.filter(p => p.source_type === 'direct');
    const inherited = permissions.filter(p => p.source_type === 'inherited');

    res.json({
      success: true,
      data: {
        all: permissions,
        direct,
        inherited,
      },
      counts: {
        total: permissions.length,
        direct: direct.length,
        inherited: inherited.length,
      },
    });
  } catch (error) {
    AppLogger.error('Error fetching inherited permissions', error as Error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch inherited permissions',
    });
  }
});

/**
 * GET /api/roles/:roleId/permissions/inheritance-chain
 * Get inheritance chain for a specific permission
 */
router.get('/:roleId/permissions/inheritance-chain', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const { roleId } = req.params;
    const { resource, action } = req.query;

    if (!resource || !action) {
      return res.status(400).json({
        success: false,
        error: 'Resource and action query parameters are required',
      });
    }

    const chain = await rbacService.getPermissionInheritanceChain(
      roleId,
      resource as string,
      action as string
    );

    res.json({
      success: true,
      data: chain,
      hasPermission: chain.some(c => c.has_permission),
    });
  } catch (error) {
    AppLogger.error('Error fetching permission inheritance chain', error as Error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch permission inheritance chain',
    });
  }
});

/**
 * POST /api/roles/hierarchy/rebuild
 * Rebuild role hierarchy table
 */
router.post('/hierarchy/rebuild', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const count = await rbacService.rebuildRoleHierarchy();

    AppLogger.info('Role hierarchy rebuilt', { entriesCreated: count });

    res.json({
      success: true,
      message: 'Role hierarchy rebuilt successfully',
      entriesCreated: count,
    });
  } catch (error) {
    AppLogger.error('Error rebuilding role hierarchy', error as Error);
    res.status(500).json({
      success: false,
      error: 'Failed to rebuild role hierarchy',
    });
  }
});

/**
 * GET /api/users/:userId/permissions/effective
 * Get effective permissions for a user (including inherited)
 */
router.get('/users/:userId/permissions/effective', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const permissions = await rbacService.getUserEffectivePermissions(userId);

    // Group by source type
    const direct = permissions.filter(p => p.source_type === 'direct');
    const inherited = permissions.filter(p => p.source_type === 'inherited');

    res.json({
      success: true,
      data: {
        all: permissions,
        direct,
        inherited,
      },
      counts: {
        total: permissions.length,
        direct: direct.length,
        inherited: inherited.length,
      },
    });
  } catch (error) {
    AppLogger.error('Error fetching user effective permissions', error as Error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch user effective permissions',
    });
  }
});

export default router;
