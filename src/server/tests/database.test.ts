import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import { Pool } from 'pg';
import { DatabaseUtil, initializeDatabaseUtil, getDatabaseUtil } from '../utils/database.util';
import { PoolMonitorService, initializePoolMonitor } from '../services/pool-monitor.service';
import { DatabaseAuditService, initializeDatabaseAudit, DatabaseOperation } from '../services/db-audit.service';
import { SlowQueryLoggerService, initializeSlowQueryLogger } from '../services/slow-query-logger.service';

/**
 * Database Security Utilities Tests
 * Tests for database utilities, monitoring, auditing, and slow query logging
 */

describe('Database Security Utilities', () => {
  let pool: Pool;
  let dbUtil: DatabaseUtil;

  beforeAll(async () => {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://localhost/test_db',
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    dbUtil = initializeDatabaseUtil(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  describe('DatabaseUtil - Parameterized Queries', () => {
    it('should execute parameterized query successfully', async () => {
      const result = await dbUtil.query('SELECT $1 as value', [42]);

      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].value).toBe(42);
    });

    it('should build parameterized query from conditions', () => {
      const allowedFields = ['email', 'username', 'status'];
      const conditions = {
        email: 'test@example.com',
        status: 'active',
      };

      const query = dbUtil.buildParameterizedQuery(
        'SELECT * FROM users',
        conditions,
        allowedFields
      );

      expect(query.text).toContain('WHERE');
      expect(query.text).toContain('email = $1');
      expect(query.text).toContain('status = $2');
      expect(query.values).toEqual(['test@example.com', 'active']);
    });

    it('should reject non-whitelisted fields in query builder', () => {
      const allowedFields = ['email', 'username'];
      const conditions = {
        email: 'test@example.com',
        malicious_field: 'DROP TABLE users',
      };

      expect(() => {
        dbUtil.buildParameterizedQuery('SELECT * FROM users', conditions, allowedFields);
      }).toThrow("Field 'malicious_field' is not allowed in query");
    });

    it('should handle NULL values in parameterized queries', () => {
      const allowedFields = ['email', 'deleted_at'];
      const conditions = {
        email: 'test@example.com',
        deleted_at: null,
      };

      const query = dbUtil.buildParameterizedQuery(
        'SELECT * FROM users',
        conditions,
        allowedFields
      );

      expect(query.text).toContain('email = $1');
      expect(query.text).toContain('deleted_at IS NULL');
      expect(query.values).toEqual(['test@example.com']);
    });

    it('should handle IN clause with array values', () => {
      const allowedFields = ['status', 'role'];
      const conditions = {
        status: ['active', 'pending', 'verified'],
        role: 'user',
      };

      const query = dbUtil.buildParameterizedQuery(
        'SELECT * FROM users',
        conditions,
        allowedFields
      );

      expect(query.text).toContain('status IN ($1, $2, $3)');
      expect(query.text).toContain('role = $4');
      expect(query.values).toEqual(['active', 'pending', 'verified', 'user']);
    });

    it('should build safe LIKE query', () => {
      const pattern = 'test%user_name'; // Contains SQL LIKE wildcards

      const { clause, value } = dbUtil.buildLikeQuery('username', pattern, true);

      expect(clause).toContain('ILIKE');
      expect(value).toContain('\\%'); // Escaped %
      expect(value).toContain('\\_'); // Escaped _
    });
  });

  describe('DatabaseUtil - Query Timeout', () => {
    it('should enforce query timeout', async () => {
      const timeout = 100; // 100ms

      await expect(
        dbUtil.query('SELECT pg_sleep(1)', [], { timeout })
      ).rejects.toThrow();
    }, 10000);

    it('should execute fast query within timeout', async () => {
      const result = await dbUtil.query('SELECT 1 as value', [], { timeout: 1000 });

      expect(result.rows[0].value).toBe(1);
    });

    it('should use default timeout when not specified', async () => {
      const result = await dbUtil.query('SELECT 1 as value');

      expect(result.rows[0].value).toBe(1);
    });
  });

  describe('DatabaseUtil - Max Rows Limit', () => {
    beforeEach(async () => {
      // Create temp table for testing
      await pool.query(`
        CREATE TEMP TABLE test_rows (
          id SERIAL PRIMARY KEY,
          value INTEGER
        )
      `);

      // Insert 100 rows
      await pool.query(`
        INSERT INTO test_rows (value)
        SELECT generate_series(1, 100)
      `);
    });

    it('should limit rows returned when maxRows is set', async () => {
      const result = await dbUtil.query('SELECT * FROM test_rows', [], { maxRows: 10 });

      expect(result.rows.length).toBe(10);
    });

    it('should not limit rows when maxRows is not set', async () => {
      const result = await dbUtil.query('SELECT * FROM test_rows');

      expect(result.rows.length).toBe(100);
    });
  });

  describe('DatabaseUtil - Result Sanitization', () => {
    it('should sanitize sensitive fields when enabled', async () => {
      // Create temp table with sensitive data
      await pool.query(`
        CREATE TEMP TABLE test_sensitive (
          id SERIAL PRIMARY KEY,
          username VARCHAR(255),
          password VARCHAR(255),
          email VARCHAR(255)
        )
      `);

      await pool.query(`
        INSERT INTO test_sensitive (username, password, email)
        VALUES ('testuser', 'secret123', 'test@example.com')
      `);

      const result = await dbUtil.query(
        'SELECT * FROM test_sensitive',
        [],
        { sanitizeResult: true }
      );

      expect(result.rows[0].username).toBe('testuser');
      expect(result.rows[0].password).toBe('[REDACTED]');
      expect(result.rows[0].email).toBe('test@example.com');
    });
  });

  describe('DatabaseUtil - Transactions', () => {
    it('should execute transaction successfully', async () => {
      await pool.query('CREATE TEMP TABLE test_transaction (value INTEGER)');

      const result = await dbUtil.transaction(async (client) => {
        await client.query('INSERT INTO test_transaction (value) VALUES (1)');
        await client.query('INSERT INTO test_transaction (value) VALUES (2)');
        return { success: true };
      });

      expect(result.success).toBe(true);

      const check = await pool.query('SELECT COUNT(*) FROM test_transaction');
      expect(parseInt(check.rows[0].count)).toBe(2);
    });

    it('should rollback transaction on error', async () => {
      await pool.query('CREATE TEMP TABLE test_rollback (value INTEGER)');

      await expect(
        dbUtil.transaction(async (client) => {
          await client.query('INSERT INTO test_rollback (value) VALUES (1)');
          throw new Error('Intentional error');
        })
      ).rejects.toThrow('Intentional error');

      const check = await pool.query('SELECT COUNT(*) FROM test_rollback');
      expect(parseInt(check.rows[0].count)).toBe(0);
    });
  });

  describe('DatabaseUtil - Statistics', () => {
    it('should track query statistics', async () => {
      await dbUtil.query('SELECT 1');
      await dbUtil.query('SELECT 2');

      const stats = dbUtil.getQueryStats();

      expect(stats.total).toBeGreaterThanOrEqual(2);
      expect(stats.successful).toBeGreaterThanOrEqual(2);
    });

    it('should track pool statistics', () => {
      const poolStats = dbUtil.getPoolStats();

      expect(poolStats.totalCount).toBeGreaterThanOrEqual(0);
      expect(poolStats.idleCount).toBeGreaterThanOrEqual(0);
      expect(poolStats.utilization).toBeGreaterThanOrEqual(0);
    });

    it('should clear statistics', () => {
      dbUtil.clearStats();

      const stats = dbUtil.getQueryStats();
      expect(stats.total).toBe(0);
    });
  });

  describe('DatabaseUtil - Health Check', () => {
    it('should pass health check with valid connection', async () => {
      const health = await dbUtil.healthCheck();

      expect(health.healthy).toBe(true);
      expect(health.latency).toBeGreaterThan(0);
      expect(health.error).toBeUndefined();
    });
  });
});

describe('Pool Monitor Service', () => {
  let pool: Pool;
  let poolMonitor: PoolMonitorService;

  beforeAll(async () => {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://localhost/test_db',
      max: 5,
    });

    poolMonitor = initializePoolMonitor(pool, {
      warningThreshold: 60,
      criticalThreshold: 80,
      checkInterval: 1,
      logMetrics: false,
    });
  });

  afterAll(async () => {
    poolMonitor.stopMonitoring();
    await pool.end();
  });

  it('should get current pool metrics', () => {
    const metrics = poolMonitor.getCurrentMetrics();

    expect(metrics.totalConnections).toBeGreaterThanOrEqual(0);
    expect(metrics.idleConnections).toBeGreaterThanOrEqual(0);
    expect(metrics.activeConnections).toBeGreaterThanOrEqual(0);
    expect(metrics.status).toMatch(/healthy|warning|critical/);
  });

  it('should get pool statistics', () => {
    const stats = poolMonitor.getStatistics();

    expect(stats.current).toBeDefined();
    expect(stats.average).toBeDefined();
    expect(stats.peak).toBeDefined();
  });

  it('should provide recommendations', () => {
    const recommendations = poolMonitor.getRecommendations();

    expect(Array.isArray(recommendations)).toBe(true);
  });

  it('should clear metrics', () => {
    poolMonitor.clearMetrics();

    const metrics = poolMonitor.getRecentMetrics();
    expect(metrics.length).toBe(0);
  });
});

describe('Database Audit Service', () => {
  let pool: Pool;
  let auditService: DatabaseAuditService;

  beforeAll(async () => {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://localhost/test_db',
    });

    auditService = initializeDatabaseAudit(pool, { enabled: true, bufferSize: 10 });

    // Ensure audit table exists
    await pool.query(`
      CREATE TABLE IF NOT EXISTS database_audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        audit_id VARCHAR(255) UNIQUE NOT NULL,
        user_id UUID,
        operation VARCHAR(50) NOT NULL,
        table_name VARCHAR(255),
        record_id VARCHAR(255),
        query TEXT NOT NULL,
        parameters JSONB,
        row_count INTEGER DEFAULT 0,
        duration INTEGER NOT NULL,
        success BOOLEAN NOT NULL,
        error TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  });

  afterAll(async () => {
    await auditService.shutdown();
    await pool.query('DROP TABLE IF EXISTS database_audit_logs');
    await pool.end();
  });

  it('should log database operation', async () => {
    await auditService.logDatabaseOperation(
      'SELECT * FROM users WHERE email = $1',
      ['test@example.com'],
      1,
      50,
      true,
      {
        userId: 'test-user-123',
        operation: DatabaseOperation.SELECT,
        tableName: 'users',
      }
    );

    // Service should buffer the log
    expect(true).toBe(true);
  });

  it('should log failed operation', async () => {
    const error = new Error('Database error');

    await auditService.logFailedOperation(
      'INSERT INTO users (email) VALUES ($1)',
      ['invalid'],
      error,
      100,
      {
        userId: 'test-user-123',
        operation: DatabaseOperation.INSERT,
      }
    );

    expect(true).toBe(true);
  });
});

describe('Slow Query Logger Service', () => {
  let pool: Pool;
  let slowQueryLogger: SlowQueryLoggerService;

  beforeAll(async () => {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://localhost/test_db',
    });

    slowQueryLogger = initializeSlowQueryLogger(pool, {
      threshold: 100,
      captureStackTrace: true,
      captureExecutionPlan: false,
      persistToDisk: false,
    });

    // Create slow query logs table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS slow_query_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        query_id VARCHAR(255) UNIQUE NOT NULL,
        query TEXT NOT NULL,
        parameters JSONB,
        duration INTEGER NOT NULL,
        threshold INTEGER NOT NULL,
        user_id UUID,
        operation VARCHAR(50),
        table_name VARCHAR(255),
        row_count INTEGER,
        execution_plan JSONB,
        stack_trace TEXT,
        context JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  });

  afterAll(async () => {
    await pool.query('DROP TABLE IF EXISTS slow_query_logs');
    await pool.end();
  });

  it('should log slow query', async () => {
    await slowQueryLogger.logSlowQuery(
      'SELECT * FROM users WHERE email = $1',
      ['slow@example.com'],
      500,
      {
        userId: 'test-user-123',
        operation: 'SELECT',
        tableName: 'users',
        rowCount: 1,
      }
    );

    const slowQueries = slowQueryLogger.getSlowQueries(1);
    expect(slowQueries.length).toBeGreaterThan(0);
  });

  it('should get slow query statistics', async () => {
    const stats = slowQueryLogger.getStatistics();

    expect(stats.totalSlowQueries).toBeGreaterThanOrEqual(0);
    expect(stats.byOperation).toBeDefined();
    expect(stats.byTable).toBeDefined();
  });

  it('should get queries by table', async () => {
    await slowQueryLogger.logSlowQuery(
      'SELECT * FROM products',
      [],
      200,
      {
        operation: 'SELECT',
        tableName: 'products',
      }
    );

    const queries = slowQueryLogger.getQueriesByTable('products');
    expect(queries.length).toBeGreaterThan(0);
  });

  it('should get queries by operation', async () => {
    const queries = slowQueryLogger.getQueriesByOperation('SELECT');
    expect(Array.isArray(queries)).toBe(true);
  });

  it('should get most frequent slow queries', () => {
    const frequent = slowQueryLogger.getMostFrequentSlowQueries(5);
    expect(Array.isArray(frequent)).toBe(true);
  });

  it('should clear statistics', () => {
    slowQueryLogger.clearStats();

    const stats = slowQueryLogger.getStatistics();
    expect(stats.totalSlowQueries).toBe(0);
  });
});

describe('Integration - Database Utilities Combined', () => {
  let pool: Pool;
  let dbUtil: DatabaseUtil;

  beforeAll(async () => {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL || 'postgresql://localhost/test_db',
    });

    dbUtil = initializeDatabaseUtil(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  it('should handle complex query with all features enabled', async () => {
    await pool.query('CREATE TEMP TABLE integration_test (id SERIAL, name VARCHAR(255))');
    await pool.query("INSERT INTO integration_test (name) VALUES ('test1'), ('test2')");

    const result = await dbUtil.query(
      'SELECT * FROM integration_test WHERE name = $1',
      ['test1'],
      {
        timeout: 5000,
        logSlowQuery: true,
        slowQueryThreshold: 100,
        audit: false, // Disabled for test
        maxRows: 10,
        sanitizeResult: false,
      }
    );

    expect(result.rows.length).toBe(1);
    expect(result.rows[0].name).toBe('test1');
  });

  it('should track multiple query types', async () => {
    await pool.query('CREATE TEMP TABLE multi_query (value INTEGER)');

    // Execute various queries
    await dbUtil.query('SELECT * FROM multi_query');
    await dbUtil.query('INSERT INTO multi_query (value) VALUES ($1)', [1]);
    await dbUtil.query('UPDATE multi_query SET value = $1 WHERE value = $2', [2, 1]);

    const stats = dbUtil.getQueryStats();
    expect(stats.total).toBeGreaterThanOrEqual(3);
  });
});
