/**
 * Database re-export
 *
 * This file re-exports database functions from database.config.ts
 * for backwards compatibility with services that import from './config/database.js'
 */

export { getPool, closePool, getDatabaseConfig } from './database.config.js';
export type { DatabaseConfig } from './database.config.js';
