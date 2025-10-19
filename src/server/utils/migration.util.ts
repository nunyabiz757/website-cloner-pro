import { Pool, PoolClient } from 'pg';
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getDatabaseConfig, getPool } from '../config/database.config.js';
import { AppLogger } from './logger.util.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Database Migration Utility
 *
 * Provides comprehensive migration management:
 * - Run pending migrations
 * - Rollback migrations
 * - Migration status checking
 * - Data seeding
 * - Migration history tracking
 */

const logger = AppLogger.getInstance();

export interface Migration {
  id: number;
  name: string;
  filename: string;
  executedAt: Date | null;
  applied: boolean;
}

export interface MigrationResult {
  success: boolean;
  migration: string;
  message: string;
  error?: string;
}

export interface MigrationStatus {
  pending: Migration[];
  applied: Migration[];
  total: number;
  lastApplied: Migration | null;
}

export class MigrationManager {
  private pool: Pool;
  private config: ReturnType<typeof getDatabaseConfig>;

  constructor() {
    this.pool = getPool();
    this.config = getDatabaseConfig();
  }

  /**
   * Initialize migrations table
   */
  async initialize(): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS ${this.config.migrationsTable} (
          id SERIAL PRIMARY KEY,
          name VARCHAR(255) NOT NULL UNIQUE,
          filename VARCHAR(255) NOT NULL,
          executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          checksum VARCHAR(64),
          execution_time_ms INTEGER,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_migrations_name
          ON ${this.config.migrationsTable}(name);

        CREATE INDEX IF NOT EXISTS idx_migrations_executed_at
          ON ${this.config.migrationsTable}(executed_at DESC);
      `);

      await logger.info('Migration table initialized', {
        component: 'MigrationManager',
        table: this.config.migrationsTable,
      });
    } catch (error) {
      await logger.error('Failed to initialize migration table', {
        component: 'MigrationManager',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get all migration files from directory
   */
  async getMigrationFiles(): Promise<{ id: number; filename: string; name: string }[]> {
    const migrationsDir = path.resolve(process.cwd(), this.config.migrationsDirectory);

    try {
      const files = await fs.readdir(migrationsDir);
      const sqlFiles = files
        .filter((file) => file.endsWith('.sql'))
        .sort(); // Sort alphabetically

      const migrations = sqlFiles.map((filename) => {
        // Extract migration number from filename (e.g., "001_init.sql" -> 1)
        const match = filename.match(/^(\d+)_(.+)\.sql$/);
        if (!match) {
          throw new Error(`Invalid migration filename format: ${filename}`);
        }

        return {
          id: parseInt(match[1], 10),
          filename,
          name: match[2],
        };
      });

      return migrations.sort((a, b) => a.id - b.id);
    } catch (error) {
      await logger.error('Failed to read migration files', {
        component: 'MigrationManager',
        directory: migrationsDir,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get applied migrations from database
   */
  async getAppliedMigrations(): Promise<Migration[]> {
    try {
      const result = await this.pool.query(
        `SELECT id, name, filename, executed_at as "executedAt"
         FROM ${this.config.migrationsTable}
         ORDER BY id ASC`
      );

      return result.rows.map((row) => ({
        ...row,
        applied: true,
      }));
    } catch (error) {
      // Table might not exist yet
      if ((error as any).code === '42P01') {
        return [];
      }
      throw error;
    }
  }

  /**
   * Get migration status
   */
  async getStatus(): Promise<MigrationStatus> {
    await this.initialize();

    const [files, applied] = await Promise.all([
      this.getMigrationFiles(),
      this.getAppliedMigrations(),
    ]);

    const appliedSet = new Set(applied.map((m) => m.name));

    const allMigrations: Migration[] = files.map((file) => {
      const appliedMigration = applied.find((m) => m.name === file.name);

      return {
        id: file.id,
        name: file.name,
        filename: file.filename,
        executedAt: appliedMigration?.executedAt || null,
        applied: appliedSet.has(file.name),
      };
    });

    const pending = allMigrations.filter((m) => !m.applied);
    const appliedMigrations = allMigrations.filter((m) => m.applied);

    return {
      pending,
      applied: appliedMigrations,
      total: allMigrations.length,
      lastApplied: appliedMigrations[appliedMigrations.length - 1] || null,
    };
  }

  /**
   * Read migration file content
   */
  private async readMigrationFile(filename: string): Promise<string> {
    const migrationsDir = path.resolve(process.cwd(), this.config.migrationsDirectory);
    const filePath = path.join(migrationsDir, filename);

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return content;
    } catch (error) {
      await logger.error('Failed to read migration file', {
        component: 'MigrationManager',
        filename,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Calculate checksum for migration content
   */
  private calculateChecksum(content: string): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Execute a single migration
   */
  async executeMigration(
    migration: Migration,
    client: PoolClient
  ): Promise<MigrationResult> {
    const startTime = Date.now();

    try {
      await logger.info('Executing migration', {
        component: 'MigrationManager',
        migration: migration.name,
      });

      // Read migration content
      const content = await this.readMigrationFile(migration.filename);
      const checksum = this.calculateChecksum(content);

      // Split by semicolons to handle multiple statements
      // Note: This is a simple approach; for complex migrations, use transaction blocks
      const statements = content
        .split(';')
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && !s.startsWith('--'));

      // Execute each statement
      for (const statement of statements) {
        await client.query(statement);
      }

      const executionTime = Date.now() - startTime;

      // Record migration
      await client.query(
        `INSERT INTO ${this.config.migrationsTable}
         (name, filename, checksum, execution_time_ms)
         VALUES ($1, $2, $3, $4)`,
        [migration.name, migration.filename, checksum, executionTime]
      );

      await logger.info('Migration executed successfully', {
        component: 'MigrationManager',
        migration: migration.name,
        executionTime: `${executionTime}ms`,
      });

      return {
        success: true,
        migration: migration.name,
        message: `Migration ${migration.name} executed successfully in ${executionTime}ms`,
      };
    } catch (error) {
      await logger.error('Migration execution failed', {
        component: 'MigrationManager',
        migration: migration.name,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        migration: migration.name,
        message: `Migration ${migration.name} failed`,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Run all pending migrations
   */
  async migrate(): Promise<MigrationResult[]> {
    const status = await this.getStatus();

    if (status.pending.length === 0) {
      await logger.info('No pending migrations', {
        component: 'MigrationManager',
      });
      return [];
    }

    await logger.info('Starting migrations', {
      component: 'MigrationManager',
      pendingCount: status.pending.length,
    });

    const results: MigrationResult[] = [];
    const client = await this.pool.connect();

    try {
      for (const migration of status.pending) {
        // Each migration runs in its own transaction
        await client.query('BEGIN');

        try {
          const result = await this.executeMigration(migration, client);
          results.push(result);

          if (!result.success) {
            await client.query('ROLLBACK');
            await logger.error('Migration failed, rolling back', {
              component: 'MigrationManager',
              migration: migration.name,
            });
            break; // Stop on first failure
          }

          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        }
      }
    } finally {
      client.release();
    }

    const successCount = results.filter((r) => r.success).length;
    await logger.info('Migrations completed', {
      component: 'MigrationManager',
      total: results.length,
      successful: successCount,
      failed: results.length - successCount,
    });

    return results;
  }

  /**
   * Rollback last migration
   */
  async rollback(steps: number = 1): Promise<MigrationResult[]> {
    const applied = await this.getAppliedMigrations();

    if (applied.length === 0) {
      await logger.info('No migrations to rollback', {
        component: 'MigrationManager',
      });
      return [];
    }

    const toRollback = applied.slice(-steps).reverse();

    await logger.info('Starting rollback', {
      component: 'MigrationManager',
      steps,
      migrations: toRollback.map((m) => m.name),
    });

    const results: MigrationResult[] = [];
    const client = await this.pool.connect();

    try {
      for (const migration of toRollback) {
        await client.query('BEGIN');

        try {
          const result = await this.executeRollback(migration, client);
          results.push(result);

          if (!result.success) {
            await client.query('ROLLBACK');
            break; // Stop on first failure
          }

          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        }
      }
    } finally {
      client.release();
    }

    const successCount = results.filter((r) => r.success).length;
    await logger.info('Rollback completed', {
      component: 'MigrationManager',
      total: results.length,
      successful: successCount,
      failed: results.length - successCount,
    });

    return results;
  }

  /**
   * Execute rollback for a migration
   */
  private async executeRollback(
    migration: Migration,
    client: PoolClient
  ): Promise<MigrationResult> {
    const startTime = Date.now();

    try {
      await logger.info('Rolling back migration', {
        component: 'MigrationManager',
        migration: migration.name,
      });

      // Look for rollback file (e.g., "001_init.down.sql")
      const rollbackFilename = migration.filename.replace('.sql', '.down.sql');
      const migrationsDir = path.resolve(process.cwd(), this.config.migrationsDirectory);
      const rollbackPath = path.join(migrationsDir, rollbackFilename);

      let content: string;
      try {
        content = await fs.readFile(rollbackPath, 'utf-8');
      } catch (error) {
        // If no rollback file exists, log warning
        await logger.warn('No rollback file found', {
          component: 'MigrationManager',
          migration: migration.name,
          rollbackFile: rollbackFilename,
        });

        return {
          success: false,
          migration: migration.name,
          message: `No rollback file found for ${migration.name}`,
          error: 'Rollback file not found',
        };
      }

      // Execute rollback statements
      const statements = content
        .split(';')
        .map((s) => s.trim())
        .filter((s) => s.length > 0 && !s.startsWith('--'));

      for (const statement of statements) {
        await client.query(statement);
      }

      const executionTime = Date.now() - startTime;

      // Remove migration record
      await client.query(
        `DELETE FROM ${this.config.migrationsTable} WHERE name = $1`,
        [migration.name]
      );

      await logger.info('Migration rolled back successfully', {
        component: 'MigrationManager',
        migration: migration.name,
        executionTime: `${executionTime}ms`,
      });

      return {
        success: true,
        migration: migration.name,
        message: `Migration ${migration.name} rolled back successfully in ${executionTime}ms`,
      };
    } catch (error) {
      await logger.error('Rollback failed', {
        component: 'MigrationManager',
        migration: migration.name,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        migration: migration.name,
        message: `Rollback of ${migration.name} failed`,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Reset database (rollback all migrations)
   */
  async reset(): Promise<MigrationResult[]> {
    const applied = await this.getAppliedMigrations();
    return this.rollback(applied.length);
  }

  /**
   * Run data seeds
   */
  async seed(seedName?: string): Promise<MigrationResult[]> {
    const seedsDir = path.resolve(process.cwd(), this.config.seedsDirectory);

    try {
      await fs.access(seedsDir);
    } catch (error) {
      await logger.warn('Seeds directory not found', {
        component: 'MigrationManager',
        directory: seedsDir,
      });
      return [];
    }

    const files = await fs.readdir(seedsDir);
    let seedFiles = files.filter((file) => file.endsWith('.sql')).sort();

    if (seedName) {
      seedFiles = seedFiles.filter((file) => file.includes(seedName));
    }

    if (seedFiles.length === 0) {
      await logger.info('No seed files found', {
        component: 'MigrationManager',
        seedName,
      });
      return [];
    }

    await logger.info('Running seeds', {
      component: 'MigrationManager',
      count: seedFiles.length,
      files: seedFiles,
    });

    const results: MigrationResult[] = [];
    const client = await this.pool.connect();

    try {
      for (const filename of seedFiles) {
        await client.query('BEGIN');

        try {
          const startTime = Date.now();
          const filePath = path.join(seedsDir, filename);
          const content = await fs.readFile(filePath, 'utf-8');

          const statements = content
            .split(';')
            .map((s) => s.trim())
            .filter((s) => s.length > 0 && !s.startsWith('--'));

          for (const statement of statements) {
            await client.query(statement);
          }

          const executionTime = Date.now() - startTime;

          await client.query('COMMIT');

          await logger.info('Seed executed successfully', {
            component: 'MigrationManager',
            seed: filename,
            executionTime: `${executionTime}ms`,
          });

          results.push({
            success: true,
            migration: filename,
            message: `Seed ${filename} executed successfully in ${executionTime}ms`,
          });
        } catch (error) {
          await client.query('ROLLBACK');

          await logger.error('Seed execution failed', {
            component: 'MigrationManager',
            seed: filename,
            error: error instanceof Error ? error.message : String(error),
          });

          results.push({
            success: false,
            migration: filename,
            message: `Seed ${filename} failed`,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    } finally {
      client.release();
    }

    return results;
  }

  /**
   * Create a new migration file
   */
  async createMigration(name: string): Promise<string> {
    const status = await this.getStatus();
    const nextId = (status.total + 1).toString().padStart(3, '0');
    const filename = `${nextId}_${name}.sql`;

    const migrationsDir = path.resolve(process.cwd(), this.config.migrationsDirectory);
    const filePath = path.join(migrationsDir, filename);
    const rollbackFilePath = path.join(migrationsDir, `${nextId}_${name}.down.sql`);

    const upTemplate = `-- Migration: ${name}
-- Created: ${new Date().toISOString()}
-- Description: TODO

-- Add your migration SQL here



-- Indexes



-- Constraints



-- Data changes


`;

    const downTemplate = `-- Rollback: ${name}
-- Description: Rollback migration ${name}

-- Drop tables/columns added in the up migration



-- Remove data changes


`;

    try {
      await fs.mkdir(migrationsDir, { recursive: true });
      await fs.writeFile(filePath, upTemplate);
      await fs.writeFile(rollbackFilePath, downTemplate);

      await logger.info('Migration files created', {
        component: 'MigrationManager',
        migration: filename,
        upFile: filePath,
        downFile: rollbackFilePath,
      });

      return filename;
    } catch (error) {
      await logger.error('Failed to create migration files', {
        component: 'MigrationManager',
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}

// Singleton instance
let migrationManager: MigrationManager | null = null;

export const getMigrationManager = (): MigrationManager => {
  if (!migrationManager) {
    migrationManager = new MigrationManager();
  }
  return migrationManager;
};

export default {
  MigrationManager,
  getMigrationManager,
};
