#!/usr/bin/env node

/**
 * Initialize GHL Alert Configurations
 *
 * This script sets up all GHL-specific alert configurations in the database.
 * Run this script after setting up the database to enable GHL monitoring.
 *
 * Usage:
 *   npm run init-ghl-alerts
 *   or
 *   ts-node src/server/cli/init-ghl-alerts.ts
 */

import { Pool } from 'pg';
import dotenv from 'dotenv';
import { initializeAlertingService } from '../services/alerting.service.js';
import { initializeGHLAlertsService } from '../services/ghl-alerts.service.js';
import { AppLogger } from '../services/logger.service.js';

dotenv.config();

async function main() {
  console.log('🚀 Initializing GHL Alert Configurations...\n');

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    // Initialize services
    const alertingService = initializeAlertingService(pool);
    const ghlAlertsService = initializeGHLAlertsService(pool, alertingService);

    // Initialize GHL alerts
    await ghlAlertsService.initializeGHLAlerts('system');

    console.log('\n✅ GHL Alert Configurations Initialized Successfully!\n');
    console.log('Alert Configurations Created:');
    console.log('  1. GHL High Credit Consumption');
    console.log('  2. GHL Failed Clone Attempts');
    console.log('  3. GHL Payment Failure');
    console.log('  4. GHL Low Credit Balance');
    console.log('  5. GHL Suspicious Cloning Pattern');
    console.log('  6. GHL Template Excessive Usage');
    console.log('  7. GHL High Session Expiration Rate');
    console.log('  8. GHL Asset Download Failures');

    console.log('\n📧 Email Configuration:');
    console.log(`  Recipients: ${process.env.ALERT_EMAIL_RECIPIENTS || 'Not configured'}`);

    console.log('\n💬 Slack Configuration:');
    console.log(`  Webhook: ${process.env.SLACK_WEBHOOK_URL ? 'Configured' : 'Not configured'}`);
    console.log(`  Channel: ${process.env.SLACK_ALERT_CHANNEL || '#ghl-alerts'}`);

    console.log('\n⚙️  Configuration Notes:');
    console.log('  - Email alerts: Enabled for all high/urgent priority alerts');
    console.log('  - Slack alerts: Enabled for high/urgent priority alerts');
    console.log('  - All alerts use cooldown periods to prevent spam');
    console.log('  - Alert thresholds can be adjusted in the database\n');

    console.log('📝 Next Steps:');
    console.log('  1. Configure SMTP settings in .env file (if not already done)');
    console.log('  2. Configure Slack webhook URL in .env file (optional)');
    console.log('  3. Adjust alert thresholds via the alert management API');
    console.log('  4. Test alerts with monitored activities\n');

  } catch (error) {
    console.error('❌ Error initializing GHL alerts:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
