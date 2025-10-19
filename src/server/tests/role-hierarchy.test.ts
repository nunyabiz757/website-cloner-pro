import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { Pool } from 'pg';
import express, { Express } from 'express';
import request from 'supertest';
import { sign } from 'jsonwebtoken';
import { RBACService } from '../services/rbac.service.js';
import roleHierarchyRoutes, { initializeRoleHierarchyRoutes } from '../routes/role-hierarchy.routes.js';

/**
 * Role Hierarchy and Permission Inheritance Tests
 * Tests for role hierarchy management and permission inheritance logic
 */

describe('Role Hierarchy and Permission Inheritance', () => {
  let pool: Pool;
  let app: Express;
  let rbacService: RBACService;
  let authToken: string;
  let testUserId: string;

  // Test role IDs
  let adminRoleId: string;
  let managerRoleId: string;
  let developerRoleId: string;
  let juniorDevRoleId: string;

  // Test permission IDs
  let readPermissionId: string;
  let writePermissionId: string;
  let deletePermissionId: string;

  beforeAll(async () => {
    // Initialize test database connection
    pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'website_cloner_test',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
    });

    // Initialize Express app
    app = express();
    app.use(express.json());

    // Initialize services
    rbacService = new RBACService(pool);
    initializeRoleHierarchyRoutes(pool);
    app.use('/api/roles', roleHierarchyRoutes);

    // Create test user
    const userResult = await pool.query(
      `INSERT INTO users (username, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id`,
      ['hierarchytest', 'hierarchy@example.com', 'hashedpassword']
    );
    testUserId = userResult.rows[0].id;

    // Generate auth token
    const secret = process.env.JWT_SECRET || 'test-secret';
    authToken = sign({ userId: testUserId, username: 'hierarchytest' }, secret, {
      expiresIn: '1h',
    });
  });

  afterAll(async () => {
    // Cleanup
    await pool.query('DELETE FROM users WHERE id = $1', [testUserId]);
    await pool.end();
  });

  beforeEach(async () => {
    // Clean up roles and permissions
    await pool.query('DELETE FROM role_permissions');
    await pool.query('DELETE FROM user_roles');
    await pool.query('DELETE FROM permissions WHERE resource = $1', ['test_resource']);
    await pool.query('DELETE FROM roles WHERE name LIKE $1', ['test_%']);

    // Create test permissions
    const readPerm = await pool.query(
      `INSERT INTO permissions (resource, action, description)
       VALUES ($1, $2, $3) RETURNING id`,
      ['test_resource', 'read', 'Read test resource']
    );
    readPermissionId = readPerm.rows[0].id;

    const writePerm = await pool.query(
      `INSERT INTO permissions (resource, action, description)
       VALUES ($1, $2, $3) RETURNING id`,
      ['test_resource', 'write', 'Write test resource']
    );
    writePermissionId = writePerm.rows[0].id;

    const deletePerm = await pool.query(
      `INSERT INTO permissions (resource, action, description)
       VALUES ($1, $2, $3) RETURNING id`,
      ['test_resource', 'delete', 'Delete test resource']
    );
    deletePermissionId = deletePerm.rows[0].id;

    // Create test role hierarchy
    // Admin (root)
    const adminRole = await pool.query(
      `INSERT INTO roles (name, description, hierarchy_level, inherit_permissions)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      ['test_admin', 'Test admin role', 0, true]
    );
    adminRoleId = adminRole.rows[0].id;

    // Manager (child of Admin)
    const managerRole = await pool.query(
      `INSERT INTO roles (name, description, parent_role_id, hierarchy_level, inherit_permissions)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      ['test_manager', 'Test manager role', adminRoleId, 1, true]
    );
    managerRoleId = managerRole.rows[0].id;

    // Developer (child of Manager)
    const developerRole = await pool.query(
      `INSERT INTO roles (name, description, parent_role_id, hierarchy_level, inherit_permissions)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      ['test_developer', 'Test developer role', managerRoleId, 2, true]
    );
    developerRoleId = developerRole.rows[0].id;

    // Junior Developer (child of Developer)
    const juniorRole = await pool.query(
      `INSERT INTO roles (name, description, parent_role_id, hierarchy_level, inherit_permissions)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      ['test_junior', 'Test junior developer role', developerRoleId, 3, true]
    );
    juniorDevRoleId = juniorRole.rows[0].id;

    // Assign permissions to roles
    // Admin has all permissions
    await pool.query('INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2)', [adminRoleId, readPermissionId]);
    await pool.query('INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2)', [adminRoleId, writePermissionId]);
    await pool.query('INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2)', [adminRoleId, deletePermissionId]);

    // Manager has write permission
    await pool.query('INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2)', [managerRoleId, writePermissionId]);

    // Developer has read permission
    await pool.query('INSERT INTO role_permissions (role_id, permission_id) VALUES ($1, $2)', [developerRoleId, readPermissionId]);

    // Rebuild hierarchy
    await rbacService.rebuildRoleHierarchy();
  });

  describe('Role Hierarchy Structure', () => {
    it('should get complete role hierarchy tree', async () => {
      const response = await request(app)
        .get('/api/roles/hierarchy')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
    });

    it('should get role hierarchy view', async () => {
      const response = await request(app)
        .get('/api/roles/hierarchy/view')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });

    it('should get specific role with hierarchy information', async () => {
      const response = await request(app)
        .get(`/api/roles/hierarchy/${managerRoleId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.role_id).toBe(managerRoleId);
      expect(response.body.data.hierarchy_level).toBe(1);
    });

    it('should get role ancestors', async () => {
      const response = await request(app)
        .get(`/api/roles/${developerRoleId}/ancestors`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.count).toBe(2); // Manager and Admin
      expect(response.body.data.some((a: any) => a.role_id === managerRoleId)).toBe(true);
      expect(response.body.data.some((a: any) => a.role_id === adminRoleId)).toBe(true);
    });

    it('should get role descendants', async () => {
      const response = await request(app)
        .get(`/api/roles/${managerRoleId}/descendants`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.count).toBe(2); // Developer and Junior
      expect(response.body.data.some((d: any) => d.role_id === developerRoleId)).toBe(true);
      expect(response.body.data.some((d: any) => d.role_id === juniorDevRoleId)).toBe(true);
    });

    it('should get child roles', async () => {
      const response = await request(app)
        .get(`/api/roles/${managerRoleId}/children`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.count).toBe(1); // Only Developer is direct child
    });

    it('should get root roles', async () => {
      const response = await request(app)
        .get('/api/roles/root')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.some((r: any) => r.id === adminRoleId)).toBe(true);
    });

    it('should get roles by hierarchy level', async () => {
      const response = await request(app)
        .get('/api/roles/level/1')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.level).toBe(1);
      expect(response.body.data.some((r: any) => r.id === managerRoleId)).toBe(true);
    });
  });

  describe('Permission Inheritance', () => {
    it('should inherit permissions from parent roles', async () => {
      const permissions = await rbacService.getRoleInheritedPermissions(juniorDevRoleId);

      // Junior should have read (from Developer), write (from Manager), and all from Admin
      expect(permissions.length).toBeGreaterThan(3);
      expect(permissions.some(p => p.resource === 'test_resource' && p.action === 'read')).toBe(true);
      expect(permissions.some(p => p.resource === 'test_resource' && p.action === 'write')).toBe(true);
      expect(permissions.some(p => p.resource === 'test_resource' && p.action === 'delete')).toBe(true);
    });

    it('should get inherited permissions via API', async () => {
      const response = await request(app)
        .get(`/api/roles/${developerRoleId}/permissions/inherited`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.all.length).toBeGreaterThan(1);
      expect(response.body.data.inherited.length).toBeGreaterThan(0);
    });

    it('should distinguish between direct and inherited permissions', async () => {
      const permissions = await rbacService.getRoleInheritedPermissions(developerRoleId);

      const directPermissions = permissions.filter(p => p.source_type === 'direct');
      const inheritedPermissions = permissions.filter(p => p.source_type === 'inherited');

      expect(directPermissions.length).toBeGreaterThan(0);
      expect(inheritedPermissions.length).toBeGreaterThan(0);
    });

    it('should check permission inheritance chain', async () => {
      const response = await request(app)
        .get(`/api/roles/${juniorDevRoleId}/permissions/inheritance-chain?resource=test_resource&action=delete`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.hasPermission).toBe(true);
      expect(response.body.data.length).toBeGreaterThan(0);
    });

    it('should check if user has inherited permission', async () => {
      // Assign junior role to user
      await pool.query(
        'INSERT INTO user_roles (user_id, role_id, assigned_by) VALUES ($1, $2, $3)',
        [testUserId, juniorDevRoleId, testUserId]
      );

      const hasPermission = await rbacService.hasPermission(testUserId, 'test_resource', 'delete');
      expect(hasPermission).toBe(true);
    });

    it('should get user effective permissions', async () => {
      // Assign developer role to user
      await pool.query(
        'INSERT INTO user_roles (user_id, role_id, assigned_by) VALUES ($1, $2, $3)',
        [testUserId, developerRoleId, testUserId]
      );

      const response = await request(app)
        .get(`/api/roles/users/${testUserId}/permissions/effective`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.counts.total).toBeGreaterThan(0);
      expect(response.body.counts.inherited).toBeGreaterThan(0);
    });

    it('should not inherit when inherit_permissions is false', async () => {
      // Disable inheritance for developer role
      await pool.query(
        'UPDATE roles SET inherit_permissions = FALSE WHERE id = $1',
        [developerRoleId]
      );

      const permissions = await rbacService.getRoleInheritedPermissions(developerRoleId);

      // Should only have direct permissions, not inherited
      const inheritedPerms = permissions.filter(p => p.source_type === 'inherited');
      expect(inheritedPerms.length).toBe(0);
    });
  });

  describe('Role Parent Management', () => {
    it('should create role with parent', async () => {
      const response = await request(app)
        .post('/api/roles/with-parent')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          name: 'test_new_role',
          description: 'Test new role with parent',
          parentRoleId: managerRoleId,
          inheritPermissions: true,
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.parent_role_id).toBe(managerRoleId);
      expect(response.body.data.inherit_permissions).toBe(true);
    });

    it('should set role parent', async () => {
      // Create a role without parent
      const newRole = await rbacService.createRole('test_orphan', 'Test orphan role');

      const response = await request(app)
        .put(`/api/roles/${newRole.id}/parent`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ parentRoleId: developerRoleId })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should remove role parent', async () => {
      const response = await request(app)
        .delete(`/api/roles/${managerRoleId}/parent`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should prevent circular hierarchy', async () => {
      const response = await request(app)
        .put(`/api/roles/${adminRoleId}/parent`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ parentRoleId: juniorDevRoleId })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toContain('cycle');
    });

    it('should validate hierarchy before setting parent', async () => {
      const response = await request(app)
        .post(`/api/roles/${adminRoleId}/validate-parent`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ parentRoleId: developerRoleId })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.valid).toBe(false); // Would create cycle
    });

    it('should validate valid parent assignment', async () => {
      const newRole = await rbacService.createRole('test_new', 'Test new role');

      const response = await request(app)
        .post(`/api/roles/${newRole.id}/validate-parent`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ parentRoleId: managerRoleId })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.valid).toBe(true);
    });
  });

  describe('Inheritance Behavior', () => {
    it('should set role inheritance behavior', async () => {
      const response = await request(app)
        .put(`/api/roles/${developerRoleId}/inheritance`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ inheritPermissions: false })
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify inheritance is disabled
      const role = await pool.query('SELECT inherit_permissions FROM roles WHERE id = $1', [developerRoleId]);
      expect(role.rows[0].inherit_permissions).toBe(false);
    });

    it('should rebuild hierarchy table', async () => {
      const response = await request(app)
        .post('/api/roles/hierarchy/rebuild')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.entriesCreated).toBeGreaterThan(0);
    });
  });

  describe('Service-level Permission Checks', () => {
    it('should check if role has permission (including inherited)', async () => {
      const hasPermission = await rbacService.roleHasPermission('test_junior', 'test_resource', 'delete');
      expect(hasPermission).toBe(true); // Inherited from Admin
    });

    it('should get effective permissions for role', async () => {
      const permissions = await rbacService.getRoleEffectivePermissions('test_developer');

      expect(permissions.length).toBeGreaterThan(1);
      expect(permissions.some(p => p.source_type === 'direct')).toBe(true);
      expect(permissions.some(p => p.source_type === 'inherited')).toBe(true);
    });

    it('should get permission inheritance chain', async () => {
      const chain = await rbacService.getPermissionInheritanceChain(
        juniorDevRoleId,
        'test_resource',
        'write'
      );

      expect(chain.length).toBeGreaterThan(0);
      expect(chain.some(c => c.has_permission)).toBe(true);
      expect(chain[0].depth).toBe(0); // Role itself
    });
  });

  describe('Edge Cases', () => {
    it('should handle role with no parent', async () => {
      const ancestors = await rbacService.getRoleAncestors(adminRoleId);
      expect(ancestors.length).toBe(0);
    });

    it('should handle role with no children', async () => {
      const children = await rbacService.getChildRoles(juniorDevRoleId);
      expect(children.length).toBe(0);
    });

    it('should handle maximum depth validation', async () => {
      // Try to create a very deep hierarchy
      let currentParent = juniorDevRoleId;
      const roles = [];

      // Create 6 more levels (total would be 10)
      for (let i = 0; i < 6; i++) {
        const role = await rbacService.createRoleWithParent(
          `test_deep_${i}`,
          `Deep level ${i}`,
          currentParent
        );
        roles.push(role.id);
        currentParent = role.id;
      }

      // Try to add one more level (would exceed max depth of 10)
      try {
        await rbacService.setRoleParent(currentParent, juniorDevRoleId);
        fail('Should have thrown error for exceeding max depth');
      } catch (error) {
        expect((error as Error).message).toContain('depth');
      }
    });

    it('should handle role not found', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const response = await request(app)
        .get(`/api/roles/hierarchy/${fakeId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });
});
