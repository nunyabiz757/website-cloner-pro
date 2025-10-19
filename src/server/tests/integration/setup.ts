import { Express } from 'express';
import { Pool } from 'pg';
import { Server } from 'http';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { getPool, closePool } from '../../config/database.config.js';
import { getMigrationManager } from '../../utils/migration.util.js';

/**
 * Integration Test Setup and Utilities
 *
 * Provides:
 * - Test database setup and teardown
 * - Test user creation
 * - JWT token generation
 * - API request helpers
 * - Database cleanup utilities
 */

export interface TestUser {
  userId: string;
  email: string;
  password: string;
  role: string;
  token?: string;
}

export interface TestContext {
  pool: Pool;
  users: {
    admin: TestUser;
    editor: TestUser;
    viewer: TestUser;
    user: TestUser;
  };
  tokens: {
    admin: string;
    editor: string;
    viewer: string;
    user: string;
  };
}

let testContext: TestContext | null = null;

/**
 * Setup test database and create test users
 */
export async function setupTestDatabase(): Promise<TestContext> {
  if (testContext) {
    return testContext;
  }

  const pool = getPool();

  try {
    // Run migrations
    const migrationManager = getMigrationManager();
    await migrationManager.initialize();

    const status = await migrationManager.getStatus();
    if (status.pending.length > 0) {
      console.log('Running pending migrations...');
      await migrationManager.migrate();
    }

    // Create test users
    const testUsers = {
      admin: {
        userId: '00000000-0000-0000-0000-000000000001',
        email: 'admin@test.com',
        password: 'AdminP@ssw0rd123!',
        role: 'admin',
      },
      editor: {
        userId: '00000000-0000-0000-0000-000000000002',
        email: 'editor@test.com',
        password: 'EditorP@ssw0rd123!',
        role: 'editor',
      },
      viewer: {
        userId: '00000000-0000-0000-0000-000000000003',
        email: 'viewer@test.com',
        password: 'ViewerP@ssw0rd123!',
        role: 'viewer',
      },
      user: {
        userId: '00000000-0000-0000-0000-000000000004',
        email: 'user@test.com',
        password: 'UserP@ssw0rd123!',
        role: 'user',
      },
    };

    // Insert test users
    for (const [key, user] of Object.entries(testUsers)) {
      const hashedPassword = await bcrypt.hash(user.password, 10);

      await pool.query(
        `INSERT INTO users (id, email, password, role, email_verified, is_active)
         VALUES ($1, $2, $3, $4, true, true)
         ON CONFLICT (email) DO UPDATE
         SET password = EXCLUDED.password, role = EXCLUDED.role`,
        [user.userId, user.email, hashedPassword, user.role]
      );
    }

    // Generate JWT tokens
    const secret = process.env.JWT_SECRET || 'test-secret-key';
    const tokens = {
      admin: jwt.sign(
        { userId: testUsers.admin.userId, email: testUsers.admin.email, role: testUsers.admin.role },
        secret,
        { expiresIn: '24h' }
      ),
      editor: jwt.sign(
        { userId: testUsers.editor.userId, email: testUsers.editor.email, role: testUsers.editor.role },
        secret,
        { expiresIn: '24h' }
      ),
      viewer: jwt.sign(
        { userId: testUsers.viewer.userId, email: testUsers.viewer.email, role: testUsers.viewer.role },
        secret,
        { expiresIn: '24h' }
      ),
      user: jwt.sign(
        { userId: testUsers.user.userId, email: testUsers.user.email, role: testUsers.user.role },
        secret,
        { expiresIn: '24h' }
      ),
    };

    testContext = {
      pool,
      users: testUsers,
      tokens,
    };

    return testContext;
  } catch (error) {
    console.error('Failed to setup test database:', error);
    throw error;
  }
}

/**
 * Cleanup test database
 */
export async function cleanupTestDatabase(): Promise<void> {
  if (!testContext) {
    return;
  }

  try {
    const pool = testContext.pool;

    // Clean up test data (but keep migrations)
    await pool.query('DELETE FROM audit_log');
    await pool.query('DELETE FROM sessions WHERE user_id IN ($1, $2, $3, $4)', [
      testContext.users.admin.userId,
      testContext.users.editor.userId,
      testContext.users.viewer.userId,
      testContext.users.user.userId,
    ]);
    await pool.query('DELETE FROM users WHERE id IN ($1, $2, $3, $4)', [
      testContext.users.admin.userId,
      testContext.users.editor.userId,
      testContext.users.viewer.userId,
      testContext.users.user.userId,
    ]);

    testContext = null;
  } catch (error) {
    console.error('Failed to cleanup test database:', error);
    throw error;
  }
}

/**
 * Teardown test database completely
 */
export async function teardownTestDatabase(): Promise<void> {
  await cleanupTestDatabase();
  await closePool();
}

/**
 * Get test context
 */
export function getTestContext(): TestContext {
  if (!testContext) {
    throw new Error('Test context not initialized. Call setupTestDatabase() first.');
  }
  return testContext;
}

/**
 * Create a temporary test user
 */
export async function createTestUser(
  email: string,
  password: string,
  role: string = 'user'
): Promise<TestUser> {
  const pool = getPool();
  const userId = `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const hashedPassword = await bcrypt.hash(password, 10);

  await pool.query(
    `INSERT INTO users (id, email, password, role, email_verified, is_active)
     VALUES ($1, $2, $3, $4, true, true)`,
    [userId, email, hashedPassword, role]
  );

  const secret = process.env.JWT_SECRET || 'test-secret-key';
  const token = jwt.sign({ userId, email, role }, secret, { expiresIn: '24h' });

  return { userId, email, password, role, token };
}

/**
 * Delete temporary test user
 */
export async function deleteTestUser(userId: string): Promise<void> {
  const pool = getPool();
  await pool.query('DELETE FROM sessions WHERE user_id = $1', [userId]);
  await pool.query('DELETE FROM users WHERE id = $1', [userId]);
}

/**
 * Generate JWT token for user
 */
export function generateToken(user: { userId: string; email: string; role: string }): string {
  const secret = process.env.JWT_SECRET || 'test-secret-key';
  return jwt.sign(user, secret, { expiresIn: '24h' });
}

/**
 * Clean up specific tables
 */
export async function cleanupTable(tableName: string): Promise<void> {
  const pool = getPool();
  await pool.query(`TRUNCATE TABLE ${tableName} CASCADE`);
}

/**
 * Clean up all test data
 */
export async function cleanupAllTestData(): Promise<void> {
  const pool = getPool();

  const tables = [
    'alert_history',
    'audit_log_bookmarks',
    'audit_log_saved_searches',
    'audit_log_exports',
    'resource_ownership_history',
    'resource_shares',
    'resource_ownership',
    'key_usage_metrics',
    're_encryption_queue',
    'key_rotation_history',
    'sessions',
    'two_factor_auth',
  ];

  for (const table of tables) {
    try {
      await pool.query(`DELETE FROM ${table}`);
    } catch (error) {
      // Table might not exist, ignore
    }
  }
}

/**
 * Wait for condition to be true
 */
export async function waitFor(
  condition: () => Promise<boolean>,
  timeout: number = 5000,
  interval: number = 100
): Promise<void> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error('Timeout waiting for condition');
}

/**
 * Sleep for specified milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generate random email
 */
export function randomEmail(): string {
  return `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}@test.com`;
}

/**
 * Generate random string
 */
export function randomString(length: number = 10): string {
  return Math.random().toString(36).substring(2, length + 2);
}

/**
 * Assert response success
 */
export function assertSuccess(response: any, expectedStatus: number = 200): void {
  if (response.status !== expectedStatus) {
    throw new Error(
      `Expected status ${expectedStatus}, got ${response.status}: ${JSON.stringify(response.body)}`
    );
  }
}

/**
 * Assert response error
 */
export function assertError(response: any, expectedStatus: number): void {
  if (response.status !== expectedStatus) {
    throw new Error(
      `Expected error status ${expectedStatus}, got ${response.status}: ${JSON.stringify(response.body)}`
    );
  }
}

/**
 * Create test server instance
 */
export interface TestServer {
  app: Express;
  server: Server;
  port: number;
  baseUrl: string;
}

/**
 * Start test server
 */
export async function startTestServer(app: Express): Promise<TestServer> {
  return new Promise((resolve, reject) => {
    const port = 3000 + Math.floor(Math.random() * 1000); // Random port
    const server = app.listen(port, () => {
      resolve({
        app,
        server,
        port,
        baseUrl: `http://localhost:${port}`,
      });
    });

    server.on('error', reject);
  });
}

/**
 * Stop test server
 */
export async function stopTestServer(testServer: TestServer): Promise<void> {
  return new Promise((resolve, reject) => {
    testServer.server.close((err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

export default {
  setupTestDatabase,
  cleanupTestDatabase,
  teardownTestDatabase,
  getTestContext,
  createTestUser,
  deleteTestUser,
  generateToken,
  cleanupTable,
  cleanupAllTestData,
  waitFor,
  sleep,
  randomEmail,
  randomString,
  assertSuccess,
  assertError,
  startTestServer,
  stopTestServer,
};
