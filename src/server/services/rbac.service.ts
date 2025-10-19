import { Pool } from 'pg';

/**
 * Role-Based Access Control (RBAC) Service
 */

export interface Role {
  id: string;
  name: string;
  description: string;
  is_system: boolean;
  parent_role_id?: string;
  hierarchy_level: number;
  inherit_permissions: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface RoleHierarchy {
  role_id: string;
  role_name: string;
  role_description: string;
  parent_id?: string;
  parent_role_name?: string;
  hierarchy_level: number;
  inherit_permissions: boolean;
  direct_permission_count: number;
  inherited_permission_count: number;
  child_count: number;
  children?: Array<{ id: string; name: string }>;
}

export interface InheritedPermission extends Permission {
  source_role_id: string;
  source_role_name: string;
  inheritance_depth: number;
  source_type: 'direct' | 'inherited';
}

export interface Permission {
  id: string;
  resource: string;
  action: string;
  description: string;
  created_at: Date;
}

export interface UserRole {
  id: string;
  user_id: string;
  role_id: string;
  assigned_by: string;
  assigned_at: Date;
  expires_at?: Date;
}

export class RBACService {
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Check if user has permission (including inherited permissions)
   * @param userId User ID
   * @param resource Resource name
   * @param action Action name
   * @returns True if user has permission
   */
  async hasPermission(userId: string, resource: string, action: string): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT user_has_inherited_permission($1, $2, $3) as has_permission`,
      [userId, resource, action]
    );

    return result.rows[0]?.has_permission || false;
  }

  /**
   * Check if user has any of the specified permissions
   * @param userId User ID
   * @param permissions Array of [resource, action] tuples
   * @returns True if user has at least one permission
   */
  async hasAnyPermission(userId: string, permissions: [string, string][]): Promise<boolean> {
    for (const [resource, action] of permissions) {
      if (await this.hasPermission(userId, resource, action)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if user has all specified permissions
   * @param userId User ID
   * @param permissions Array of [resource, action] tuples
   * @returns True if user has all permissions
   */
  async hasAllPermissions(userId: string, permissions: [string, string][]): Promise<boolean> {
    for (const [resource, action] of permissions) {
      if (!(await this.hasPermission(userId, resource, action))) {
        return false;
      }
    }
    return true;
  }

  /**
   * Get all permissions for user (direct only, no inheritance)
   * @param userId User ID
   * @returns Array of permissions
   */
  async getUserPermissions(userId: string): Promise<Permission[]> {
    const result = await this.pool.query(
      `SELECT DISTINCT p.*
       FROM user_roles ur
       JOIN role_permissions rp ON ur.role_id = rp.role_id
       JOIN permissions p ON rp.permission_id = p.id
       WHERE ur.user_id = $1
       AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
       ORDER BY p.resource, p.action`,
      [userId]
    );

    return result.rows;
  }

  /**
   * Get all effective permissions for user (including inherited)
   * @param userId User ID
   * @returns Array of permissions with inheritance information
   */
  async getUserEffectivePermissions(userId: string): Promise<InheritedPermission[]> {
    const result = await this.pool.query(
      `SELECT * FROM get_user_effective_permissions($1)`,
      [userId]
    );

    return result.rows.map(row => ({
      id: row.permission_id,
      resource: row.resource,
      action: row.action,
      description: row.permission_name,
      source_role_id: row.source_role_id,
      source_role_name: row.source_role_name,
      source_type: row.source_type,
      inheritance_depth: row.source_type === 'inherited' ? 1 : 0,
      created_at: new Date(),
    }));
  }

  /**
   * Get all roles for user
   * @param userId User ID
   * @returns Array of roles
   */
  async getUserRoles(userId: string): Promise<Role[]> {
    const result = await this.pool.query(
      `SELECT r.*
       FROM user_roles ur
       JOIN roles r ON ur.role_id = r.id
       WHERE ur.user_id = $1
       AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
       ORDER BY r.name`,
      [userId]
    );

    return result.rows;
  }

  /**
   * Check if user has role
   * @param userId User ID
   * @param roleName Role name
   * @returns True if user has role
   */
  async hasRole(userId: string, roleName: string): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT EXISTS (
        SELECT 1
        FROM user_roles ur
        JOIN roles r ON ur.role_id = r.id
        WHERE ur.user_id = $1
        AND r.name = $2
        AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
      ) as has_role`,
      [userId, roleName]
    );

    return result.rows[0]?.has_role || false;
  }

  /**
   * Assign role to user
   * @param userId User ID
   * @param roleName Role name
   * @param assignedBy User ID of assigner
   * @param expiresAt Optional expiration date
   * @returns UserRole
   */
  async assignRole(
    userId: string,
    roleName: string,
    assignedBy: string,
    expiresAt?: Date
  ): Promise<UserRole> {
    // Get role ID
    const roleResult = await this.pool.query('SELECT id FROM roles WHERE name = $1', [roleName]);
    if (roleResult.rows.length === 0) {
      throw new Error(`Role not found: ${roleName}`);
    }

    const roleId = roleResult.rows[0].id;

    // Check if assignment already exists
    const existingResult = await this.pool.query(
      'SELECT id FROM user_roles WHERE user_id = $1 AND role_id = $2',
      [userId, roleId]
    );

    if (existingResult.rows.length > 0) {
      throw new Error('User already has this role');
    }

    // Assign role
    const result = await this.pool.query(
      `INSERT INTO user_roles (user_id, role_id, assigned_by, expires_at)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [userId, roleId, assignedBy, expiresAt]
    );

    return result.rows[0];
  }

  /**
   * Remove role from user
   * @param userId User ID
   * @param roleName Role name
   */
  async removeRole(userId: string, roleName: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM user_roles
       WHERE user_id = $1
       AND role_id = (SELECT id FROM roles WHERE name = $2)`,
      [userId, roleName]
    );
  }

  /**
   * Create new role
   * @param name Role name
   * @param description Role description
   * @returns Role
   */
  async createRole(name: string, description: string): Promise<Role> {
    const result = await this.pool.query(
      'INSERT INTO roles (name, description) VALUES ($1, $2) RETURNING *',
      [name, description]
    );
    return result.rows[0];
  }

  /**
   * Delete role
   * @param roleName Role name
   */
  async deleteRole(roleName: string): Promise<void> {
    // Check if it's a system role
    const result = await this.pool.query('SELECT is_system FROM roles WHERE name = $1', [roleName]);
    if (result.rows[0]?.is_system) {
      throw new Error('Cannot delete system role');
    }

    await this.pool.query('DELETE FROM roles WHERE name = $1', [roleName]);
  }

  /**
   * Add permission to role
   * @param roleName Role name
   * @param resource Resource name
   * @param action Action name
   */
  async addPermissionToRole(roleName: string, resource: string, action: string): Promise<void> {
    const result = await this.pool.query(
      `INSERT INTO role_permissions (role_id, permission_id)
       SELECT r.id, p.id
       FROM roles r, permissions p
       WHERE r.name = $1 AND p.resource = $2 AND p.action = $3
       ON CONFLICT DO NOTHING`,
      [roleName, resource, action]
    );

    if (result.rowCount === 0) {
      throw new Error('Role or permission not found');
    }
  }

  /**
   * Remove permission from role
   * @param roleName Role name
   * @param resource Resource name
   * @param action Action name
   */
  async removePermissionFromRole(roleName: string, resource: string, action: string): Promise<void> {
    await this.pool.query(
      `DELETE FROM role_permissions
       WHERE role_id = (SELECT id FROM roles WHERE name = $1)
       AND permission_id = (SELECT id FROM permissions WHERE resource = $2 AND action = $3)`,
      [roleName, resource, action]
    );
  }

  /**
   * Get all permissions for role
   * @param roleName Role name
   * @returns Array of permissions
   */
  async getRolePermissions(roleName: string): Promise<Permission[]> {
    const result = await this.pool.query(
      `SELECT p.*
       FROM role_permissions rp
       JOIN permissions p ON rp.permission_id = p.id
       JOIN roles r ON rp.role_id = r.id
       WHERE r.name = $1
       ORDER BY p.resource, p.action`,
      [roleName]
    );

    return result.rows;
  }

  /**
   * Get all available roles
   * @returns Array of roles
   */
  async getAllRoles(): Promise<Role[]> {
    const result = await this.pool.query('SELECT * FROM roles ORDER BY name');
    return result.rows;
  }

  /**
   * Get all available permissions
   * @returns Array of permissions
   */
  async getAllPermissions(): Promise<Permission[]> {
    const result = await this.pool.query('SELECT * FROM permissions ORDER BY resource, action');
    return result.rows;
  }

  /**
   * Create new permission
   * @param resource Resource name
   * @param action Action name
   * @param description Permission description
   * @returns Permission
   */
  async createPermission(resource: string, action: string, description: string): Promise<Permission> {
    const result = await this.pool.query(
      'INSERT INTO permissions (resource, action, description) VALUES ($1, $2, $3) RETURNING *',
      [resource, action, description]
    );
    return result.rows[0];
  }

  // ==================== Role Hierarchy Methods ====================

  /**
   * Get role hierarchy tree
   * @returns Array of roles with hierarchy information
   */
  async getRoleHierarchyTree(): Promise<RoleHierarchy[]> {
    const result = await this.pool.query('SELECT * FROM get_role_hierarchy_tree()');
    return result.rows;
  }

  /**
   * Get role hierarchy view (denormalized)
   * @returns Array of roles with parent and children information
   */
  async getRoleHierarchyView(): Promise<RoleHierarchy[]> {
    const result = await this.pool.query('SELECT * FROM role_hierarchy_view ORDER BY hierarchy_level, name');
    return result.rows;
  }

  /**
   * Get ancestor roles for a given role
   * @param roleId Role ID
   * @returns Array of ancestor roles
   */
  async getRoleAncestors(roleId: string): Promise<Array<{ role_id: string; role_name: string; depth: number; inherit_permissions: boolean }>> {
    const result = await this.pool.query('SELECT * FROM get_role_ancestors($1)', [roleId]);
    return result.rows;
  }

  /**
   * Get descendant roles for a given role
   * @param roleId Role ID
   * @returns Array of descendant roles
   */
  async getRoleDescendants(roleId: string): Promise<Array<{ role_id: string; role_name: string; depth: number }>> {
    const result = await this.pool.query('SELECT * FROM get_role_descendants($1)', [roleId]);
    return result.rows;
  }

  /**
   * Get inherited permissions for a role
   * @param roleId Role ID
   * @returns Array of inherited permissions with source information
   */
  async getRoleInheritedPermissions(roleId: string): Promise<InheritedPermission[]> {
    const result = await this.pool.query('SELECT * FROM get_inherited_permissions($1)', [roleId]);
    return result.rows.map(row => ({
      id: row.permission_id,
      resource: row.resource,
      action: row.action,
      description: row.permission_name,
      source_role_id: row.source_role_id,
      source_role_name: row.source_role_name,
      inheritance_depth: row.inheritance_depth,
      source_type: row.inheritance_depth === 0 ? 'direct' : 'inherited',
      created_at: new Date(),
    }));
  }

  /**
   * Set parent role for a role (with cycle validation)
   * @param roleId Role ID
   * @param parentRoleId Parent role ID
   * @returns Success boolean
   */
  async setRoleParent(roleId: string, parentRoleId: string | null): Promise<boolean> {
    if (parentRoleId === null) {
      // Remove parent
      await this.pool.query('UPDATE roles SET parent_role_id = NULL WHERE id = $1', [roleId]);
      return true;
    }

    const result = await this.pool.query(
      'SELECT set_role_parent($1, $2) as success',
      [roleId, parentRoleId]
    );
    return result.rows[0]?.success || false;
  }

  /**
   * Validate role hierarchy (check for cycles and max depth)
   * @param roleId Role ID
   * @param parentRoleId Proposed parent role ID
   * @returns True if hierarchy is valid
   */
  async validateRoleHierarchy(roleId: string, parentRoleId: string): Promise<boolean> {
    const result = await this.pool.query(
      'SELECT validate_role_hierarchy($1, $2) as is_valid',
      [roleId, parentRoleId]
    );
    return result.rows[0]?.is_valid || false;
  }

  /**
   * Update role hierarchy levels
   * @param roleId Role ID to start update from
   */
  async updateHierarchyLevels(roleId: string): Promise<void> {
    await this.pool.query('SELECT update_hierarchy_levels($1)', [roleId]);
  }

  /**
   * Rebuild role hierarchy table
   * @returns Number of hierarchy entries created
   */
  async rebuildRoleHierarchy(): Promise<number> {
    const result = await this.pool.query('SELECT rebuild_role_hierarchy() as count');
    return result.rows[0]?.count || 0;
  }

  /**
   * Set role inheritance behavior
   * @param roleId Role ID
   * @param inheritPermissions Whether to inherit permissions from parent
   */
  async setRoleInheritance(roleId: string, inheritPermissions: boolean): Promise<void> {
    await this.pool.query(
      'UPDATE roles SET inherit_permissions = $1 WHERE id = $2',
      [inheritPermissions, roleId]
    );
  }

  /**
   * Get role with hierarchy information
   * @param roleId Role ID
   * @returns Role with hierarchy information
   */
  async getRoleWithHierarchy(roleId: string): Promise<RoleHierarchy | null> {
    const result = await this.pool.query(
      'SELECT * FROM role_hierarchy_view WHERE id = $1',
      [roleId]
    );
    return result.rows[0] || null;
  }

  /**
   * Create role with parent
   * @param name Role name
   * @param description Role description
   * @param parentRoleId Parent role ID (optional)
   * @param inheritPermissions Whether to inherit permissions (default: true)
   * @returns Created role
   */
  async createRoleWithParent(
    name: string,
    description: string,
    parentRoleId?: string,
    inheritPermissions: boolean = true
  ): Promise<Role> {
    // Validate parent if provided
    if (parentRoleId) {
      const parentExists = await this.pool.query('SELECT id FROM roles WHERE id = $1', [parentRoleId]);
      if (parentExists.rows.length === 0) {
        throw new Error('Parent role not found');
      }
    }

    const result = await this.pool.query(
      `INSERT INTO roles (name, description, parent_role_id, inherit_permissions)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [name, description, parentRoleId, inheritPermissions]
    );

    return result.rows[0];
  }

  /**
   * Get all permissions for a role (direct + inherited)
   * @param roleName Role name
   * @returns Array of permissions with source information
   */
  async getRoleEffectivePermissions(roleName: string): Promise<InheritedPermission[]> {
    // Get role ID
    const roleResult = await this.pool.query('SELECT id FROM roles WHERE name = $1', [roleName]);
    if (roleResult.rows.length === 0) {
      throw new Error(`Role not found: ${roleName}`);
    }

    const roleId = roleResult.rows[0].id;
    return this.getRoleInheritedPermissions(roleId);
  }

  /**
   * Check if role has permission (including inherited)
   * @param roleName Role name
   * @param resource Resource name
   * @param action Action name
   * @returns True if role has permission
   */
  async roleHasPermission(roleName: string, resource: string, action: string): Promise<boolean> {
    const permissions = await this.getRoleEffectivePermissions(roleName);
    return permissions.some(p => p.resource === resource && p.action === action);
  }

  /**
   * Get roles at a specific hierarchy level
   * @param level Hierarchy level (0 = root)
   * @returns Array of roles at that level
   */
  async getRolesByLevel(level: number): Promise<Role[]> {
    const result = await this.pool.query(
      'SELECT * FROM roles WHERE hierarchy_level = $1 ORDER BY name',
      [level]
    );
    return result.rows;
  }

  /**
   * Get root roles (no parent)
   * @returns Array of root roles
   */
  async getRootRoles(): Promise<Role[]> {
    const result = await this.pool.query(
      'SELECT * FROM roles WHERE parent_role_id IS NULL ORDER BY name'
    );
    return result.rows;
  }

  /**
   * Get child roles for a parent
   * @param parentRoleId Parent role ID
   * @returns Array of child roles
   */
  async getChildRoles(parentRoleId: string): Promise<Role[]> {
    const result = await this.pool.query(
      'SELECT * FROM roles WHERE parent_role_id = $1 ORDER BY name',
      [parentRoleId]
    );
    return result.rows;
  }

  /**
   * Get permission inheritance chain for a permission
   * @param roleId Role ID
   * @param resource Resource name
   * @param action Action name
   * @returns Array showing inheritance chain for specific permission
   */
  async getPermissionInheritanceChain(
    roleId: string,
    resource: string,
    action: string
  ): Promise<Array<{ role_id: string; role_name: string; depth: number; has_permission: boolean }>> {
    const ancestors = await this.getRoleAncestors(roleId);
    const chain = [];

    // Check the role itself
    const roleResult = await this.pool.query('SELECT name FROM roles WHERE id = $1', [roleId]);
    const hasDirectPermission = await this.pool.query(
      `SELECT EXISTS(
        SELECT 1 FROM role_permissions rp
        JOIN permissions p ON rp.permission_id = p.id
        WHERE rp.role_id = $1 AND p.resource = $2 AND p.action = $3
      ) as has_permission`,
      [roleId, resource, action]
    );

    chain.push({
      role_id: roleId,
      role_name: roleResult.rows[0]?.name || 'Unknown',
      depth: 0,
      has_permission: hasDirectPermission.rows[0]?.has_permission || false,
    });

    // Check ancestors
    for (const ancestor of ancestors) {
      if (!ancestor.inherit_permissions) {
        break; // Stop if inheritance is disabled
      }

      const hasPermission = await this.pool.query(
        `SELECT EXISTS(
          SELECT 1 FROM role_permissions rp
          JOIN permissions p ON rp.permission_id = p.id
          WHERE rp.role_id = $1 AND p.resource = $2 AND p.action = $3
        ) as has_permission`,
        [ancestor.role_id, resource, action]
      );

      chain.push({
        role_id: ancestor.role_id,
        role_name: ancestor.role_name,
        depth: ancestor.depth,
        has_permission: hasPermission.rows[0]?.has_permission || false,
      });
    }

    return chain;
  }
}
