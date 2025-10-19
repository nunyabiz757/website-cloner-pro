#!/usr/bin/env node

/**
 * Database Migration CLI Tool
 *
 * Commands:
 * - migrate up: Run all pending migrations
 * - migrate down [steps]: Rollback migrations
 * - migrate status: Show migration status
 * - migrate create <name>: Create new migration
 * - migrate reset: Rollback all migrations
 * - migrate seed [name]: Run data seeds
 */

import { getMigrationManager } from '../utils/migration.util.js';
import { closePool } from '../config/database.config.js';

const COLORS = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
};

function log(message: string, color: keyof typeof COLORS = 'reset') {
  console.log(`${COLORS[color]}${message}${COLORS.reset}`);
}

function printHeader(title: string) {
  console.log('');
  log('='.repeat(60), 'cyan');
  log(`  ${title}`, 'bright');
  log('='.repeat(60), 'cyan');
  console.log('');
}

function printSuccess(message: string) {
  log(`✓ ${message}`, 'green');
}

function printError(message: string) {
  log(`✗ ${message}`, 'red');
}

function printWarning(message: string) {
  log(`⚠ ${message}`, 'yellow');
}

function printInfo(message: string) {
  log(`ℹ ${message}`, 'blue');
}

async function showStatus() {
  printHeader('Migration Status');

  const manager = getMigrationManager();
  const status = await manager.getStatus();

  if (status.applied.length > 0) {
    log('Applied Migrations:', 'bright');
    status.applied.forEach((migration) => {
      log(`  ✓ ${migration.filename} (${migration.executedAt?.toLocaleString()})`, 'green');
    });
    console.log('');
  }

  if (status.pending.length > 0) {
    log('Pending Migrations:', 'bright');
    status.pending.forEach((migration) => {
      log(`  • ${migration.filename}`, 'yellow');
    });
    console.log('');
  } else {
    printSuccess('No pending migrations');
  }

  console.log('');
  printInfo(`Total: ${status.total} | Applied: ${status.applied.length} | Pending: ${status.pending.length}`);

  if (status.lastApplied) {
    printInfo(`Last applied: ${status.lastApplied.name} at ${status.lastApplied.executedAt?.toLocaleString()}`);
  }

  console.log('');
}

async function runMigrations() {
  printHeader('Running Migrations');

  const manager = getMigrationManager();
  const results = await manager.migrate();

  if (results.length === 0) {
    printInfo('No pending migrations to run');
    console.log('');
    return;
  }

  console.log('');
  results.forEach((result) => {
    if (result.success) {
      printSuccess(result.message);
    } else {
      printError(`${result.message}: ${result.error}`);
    }
  });

  console.log('');
  const successCount = results.filter((r) => r.success).length;
  const failCount = results.length - successCount;

  if (failCount === 0) {
    printSuccess(`All ${successCount} migration(s) completed successfully!`);
  } else {
    printError(`${failCount} migration(s) failed, ${successCount} succeeded`);
  }

  console.log('');
}

async function rollbackMigrations(steps: number = 1) {
  printHeader(`Rolling Back ${steps} Migration(s)`);

  const manager = getMigrationManager();

  printWarning(`This will rollback the last ${steps} migration(s)`);
  printInfo('Proceeding with rollback...');
  console.log('');

  const results = await manager.rollback(steps);

  if (results.length === 0) {
    printInfo('No migrations to rollback');
    console.log('');
    return;
  }

  console.log('');
  results.forEach((result) => {
    if (result.success) {
      printSuccess(result.message);
    } else {
      printError(`${result.message}: ${result.error}`);
    }
  });

  console.log('');
  const successCount = results.filter((r) => r.success).length;
  const failCount = results.length - successCount;

  if (failCount === 0) {
    printSuccess(`All ${successCount} rollback(s) completed successfully!`);
  } else {
    printError(`${failCount} rollback(s) failed, ${successCount} succeeded`);
  }

  console.log('');
}

async function resetDatabase() {
  printHeader('Resetting Database');

  printWarning('This will rollback ALL migrations!');
  printWarning('All data will be lost!');
  console.log('');

  const manager = getMigrationManager();
  const results = await manager.reset();

  console.log('');
  results.forEach((result) => {
    if (result.success) {
      printSuccess(result.message);
    } else {
      printError(`${result.message}: ${result.error}`);
    }
  });

  console.log('');
  const successCount = results.filter((r) => r.success).length;
  const failCount = results.length - successCount;

  if (failCount === 0) {
    printSuccess('Database reset completed successfully!');
  } else {
    printError(`Reset partially failed: ${failCount} rollback(s) failed, ${successCount} succeeded`);
  }

  console.log('');
}

async function createMigration(name: string) {
  printHeader('Creating New Migration');

  if (!name) {
    printError('Migration name is required');
    printInfo('Usage: migrate create <name>');
    console.log('');
    process.exit(1);
  }

  // Sanitize name (remove spaces, special chars)
  const sanitizedName = name.toLowerCase().replace(/[^a-z0-9_]/g, '_');

  const manager = getMigrationManager();
  const filename = await manager.createMigration(sanitizedName);

  console.log('');
  printSuccess(`Migration created: ${filename}`);
  printInfo(`Up migration: src/server/migrations/${filename}`);
  printInfo(`Down migration: src/server/migrations/${filename.replace('.sql', '.down.sql')}`);
  console.log('');
}

async function runSeeds(seedName?: string) {
  printHeader('Running Data Seeds');

  const manager = getMigrationManager();
  const results = await manager.seed(seedName);

  if (results.length === 0) {
    printInfo(seedName ? `No seed found matching: ${seedName}` : 'No seed files found');
    console.log('');
    return;
  }

  console.log('');
  results.forEach((result) => {
    if (result.success) {
      printSuccess(result.message);
    } else {
      printError(`${result.message}: ${result.error}`);
    }
  });

  console.log('');
  const successCount = results.filter((r) => r.success).length;
  const failCount = results.length - successCount;

  if (failCount === 0) {
    printSuccess(`All ${successCount} seed(s) completed successfully!`);
  } else {
    printError(`${failCount} seed(s) failed, ${successCount} succeeded`);
  }

  console.log('');
}

function showHelp() {
  printHeader('Database Migration CLI');

  log('Commands:', 'bright');
  console.log('');

  log('  migrate up', 'cyan');
  log('    Run all pending migrations', 'dim');
  console.log('');

  log('  migrate down [steps]', 'cyan');
  log('    Rollback migrations (default: 1 step)', 'dim');
  console.log('');

  log('  migrate status', 'cyan');
  log('    Show migration status', 'dim');
  console.log('');

  log('  migrate create <name>', 'cyan');
  log('    Create new migration file', 'dim');
  console.log('');

  log('  migrate reset', 'cyan');
  log('    Rollback all migrations (DESTRUCTIVE)', 'dim');
  console.log('');

  log('  migrate seed [name]', 'cyan');
  log('    Run data seeds (optional: specific seed name)', 'dim');
  console.log('');

  log('  migrate help', 'cyan');
  log('    Show this help message', 'dim');
  console.log('');

  log('Examples:', 'bright');
  console.log('');
  log('  npm run migrate up', 'dim');
  log('  npm run migrate down 2', 'dim');
  log('  npm run migrate create add_user_preferences', 'dim');
  log('  npm run migrate seed default_roles', 'dim');
  console.log('');
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  try {
    switch (command) {
      case 'up':
        await runMigrations();
        break;

      case 'down':
        const steps = parseInt(args[1] || '1', 10);
        await rollbackMigrations(steps);
        break;

      case 'status':
        await showStatus();
        break;

      case 'create':
        await createMigration(args[1]);
        break;

      case 'reset':
        await resetDatabase();
        break;

      case 'seed':
        await runSeeds(args[1]);
        break;

      case 'help':
      case '--help':
      case '-h':
        showHelp();
        break;

      default:
        printError(`Unknown command: ${command}`);
        showHelp();
        process.exit(1);
    }
  } catch (error) {
    console.log('');
    printError('Migration failed!');
    if (error instanceof Error) {
      console.error(error.message);
      if (process.env.DEBUG) {
        console.error(error.stack);
      }
    } else {
      console.error(error);
    }
    console.log('');
    process.exit(1);
  } finally {
    await closePool();
  }
}

main();
