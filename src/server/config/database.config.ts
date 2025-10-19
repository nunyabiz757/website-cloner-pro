import { Pool, PoolConfig } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Database Configuration
 *
 * Provides centralized database configuration for:
 * - Connection pooling
 * - Migration management
 * - Environment-specific settings
 */

export interface DatabaseConfig extends PoolConfig {
  migrationsTable: string;
  migrationsDirectory: string;
  seedsDirectory: string;
}

export const getDatabaseConfig = (): DatabaseConfig => {
  const config: DatabaseConfig = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME || 'website_cloner_pro',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',

    // Connection pool settings
    max: parseInt(process.env.DB_POOL_MAX || '20', 10),
    min: parseInt(process.env.DB_POOL_MIN || '2', 10),
    idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000', 10),
    connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT || '10000', 10),

    // Migration settings
    migrationsTable: process.env.DB_MIGRATIONS_TABLE || 'schema_migrations',
    migrationsDirectory: process.env.DB_MIGRATIONS_DIR || 'src/server/migrations',
    seedsDirectory: process.env.DB_SEEDS_DIR || 'src/server/seeds',

    // SSL configuration (for production)
    ssl: process.env.DB_SSL === 'true' ? {
      rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
    } : false,
  };

  return config;
};

// Database connection pool singleton
let pool: Pool | null = null;

export const getPool = (): Pool => {
  if (!pool) {
    const config = getDatabaseConfig();
    pool = new Pool(config);

    // Error handling
    pool.on('error', (err) => {
      console.error('Unexpected database pool error:', err);
    });

    // Connection event
    pool.on('connect', () => {
      console.log('Database pool connection established');
    });

    // Remove event
    pool.on('remove', () => {
      console.log('Database pool connection removed');
    });
  }

  return pool;
};

export const closePool = async (): Promise<void> => {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('Database pool closed');
  }
};

export default {
  getDatabaseConfig,
  getPool,
  closePool,
};
