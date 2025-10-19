# Slow Query Notifications - Complete Implementation

**Status**: ✅ Complete
**Section**: 14 - Slow Query Notifications

## Overview

Comprehensive notification system for critical slow database queries with multi-channel alerts (email, Slack, Discord), rate limiting, and detailed query diagnostics.

## Problem Solved

**Before** (TODO):
```typescript
// slow-query-logger.service.ts:227
// TODO: Send email/Slack notification
// This would integrate with your notification service
```

**After** (Complete):
```typescript
// Full notification integration with rate limiting
await this.notificationService.sendAll(
  { subject, message, details },
  { priority: 'high', deduplicationKey: `slow-query-${entry.queryId}` }
);
```

## Files Modified

### [slow-query-logger.service.ts](src/server/services/slow-query-logger.service.ts)

**Changes Made**:

1. **Line 3**: Added NotificationService import
   ```typescript
   import { NotificationService } from './notification.service.js';
   ```

2. **Lines 52-53**: Added notification service and cooldown tracking
   ```typescript
   private notificationService: NotificationService;
   private notificationCooldown: Map<string, number> = new Map();
   ```

3. **Line 67**: Initialize notification service in constructor
   ```typescript
   this.notificationService = new NotificationService();
   ```

4. **Lines 154-158**: Fire-and-forget async notification call
   ```typescript
   this.alertCriticalSlowQuery(entry).catch(error => {
     AppLogger.error('Failed to alert critical slow query', error as Error);
   });
   ```

5. **Lines 221-289**: Complete notification implementation (replaced TODO)
   - Rate limiting (15-minute cooldown per query signature)
   - Detailed alert content with query diagnostics
   - Multi-channel notification (email, Slack, Discord)
   - Execution plan summary
   - Context information
   - Error handling

## Key Features

### 1. Multi-Channel Notifications

Notifications are sent simultaneously to all configured channels:

- ✅ **Email** (SMTP/nodemailer)
- ✅ **Slack** (webhook integration)
- ✅ **Discord** (webhook integration)

**Configuration**:
```bash
# Email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=alerts@yourcompany.com
SMTP_PASS=your_password
NOTIFICATION_EMAIL=devops@yourcompany.com

# Slack
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL

# Discord
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/YOUR/WEBHOOK
```

### 2. Rate Limiting

Prevents notification spam for the same slow query:

**Implementation**:
```typescript
const cooldownPeriod = 15 * 60 * 1000; // 15 minutes
const signature = this.getQuerySignature(entry.query);
const lastNotification = this.notificationCooldown.get(signature) || 0;

if (Date.now() - lastNotification < cooldownPeriod) {
  return; // Skip notification
}

this.notificationCooldown.set(signature, Date.now());
```

**Benefits**:
- Same slow query signature → only 1 notification per 15 minutes
- Different queries → separate notifications
- Cooldown tracked in memory (reset on restart)

### 3. Query Signature Matching

Groups similar queries together using signature normalization:

**Example**:
```sql
-- Original queries
SELECT * FROM users WHERE id = 123
SELECT * FROM users WHERE id = 456
SELECT * FROM users WHERE id = $1

-- Normalized signature
SELECT * FROM users WHERE id = N
```

**Normalization Rules**:
- `$1, $2, $3` → `$N` (parameter placeholders)
- `123, 456, 789` → `N` (numeric literals)
- `'John', 'Jane'` → `'S'` (string literals)
- Multiple spaces → single space
- Trim whitespace

### 4. Detailed Alert Content

Each notification includes comprehensive diagnostics:

**Alert Details**:
```
Subject: ⚠️ Critical Slow Query Alert - 8534ms

Message: A critical slow database query was detected on 2025-01-15T10:30:00.000Z

Details:
  Query ID: slow_1736935800000_a1b2c3d4
  Duration: 8534ms
  Threshold: 5000ms
  Slowdown: 170% over threshold
  Operation: SELECT
  Table: users
  User ID: user_123abc
  Row Count: 1500
  Query: SELECT * FROM users WHERE created_at >= $1 AND status = $2 ORDER BY...
  Timestamp: 2025-01-15T10:30:00.000Z
  Execution Cost: 12543.25
  Execution Time: 8532ms
```

**With Context** (if provided):
```
  Context: endpoint: /api/users/search
  Context: requestId: req_789xyz
  Context: clientIP: 203.0.113.1
```

### 5. Execution Plan Summary

If `captureExecutionPlan: true`, alerts include query plan metrics:

**Execution Plan Details**:
- Total Cost (query planner cost estimate)
- Execution Time (actual runtime from EXPLAIN ANALYZE)
- Available for SELECT queries only (to avoid side effects)

**Example**:
```json
{
  "Plan": {
    "Node Type": "Seq Scan",
    "Total Cost": 12543.25,
    "Execution Time": 8532
  }
}
```

### 6. Configurable Thresholds

Two threshold levels for different severity:

**Configuration**:
```typescript
const config = {
  threshold: 1000,          // Log all queries > 1000ms (1 second)
  criticalThreshold: 5000,  // Alert on queries > 5000ms (5 seconds)
  alertOnSlowQuery: true,   // Enable/disable alerts
};

initializeSlowQueryLogger(pool, config);
```

**Behavior**:
- Queries > `threshold` → Logged to database/memory
- Queries > `criticalThreshold` → Logged + Notification sent
- `alertOnSlowQuery: false` → No notifications (logging only)

## Usage Examples

### Example 1: Basic Setup

```typescript
import { Pool } from 'pg';
import { initializeSlowQueryLogger } from './slow-query-logger.service.js';

const pool = new Pool({ /* config */ });

// Initialize with default config
const slowQueryLogger = initializeSlowQueryLogger(pool, {
  threshold: 1000,          // Log slow queries > 1s
  criticalThreshold: 5000,  // Alert on queries > 5s
  alertOnSlowQuery: true,   // Enable notifications
  captureExecutionPlan: true, // Include EXPLAIN output
});

// Now slow queries will be automatically logged and alerted
```

### Example 2: Custom Thresholds

```typescript
// Stricter thresholds for production
const slowQueryLogger = initializeSlowQueryLogger(pool, {
  threshold: 500,           // Log queries > 500ms
  criticalThreshold: 2000,  // Alert on queries > 2s
  alertOnSlowQuery: true,
  captureExecutionPlan: false, // Disable for performance
  captureStackTrace: true,  // Enable stack traces
});
```

### Example 3: Manual Logging with Context

```typescript
import { getSlowQueryLogger } from './slow-query-logger.service.js';

// In your database query wrapper
async function executeQuery(query: string, params: any[]) {
  const start = Date.now();

  try {
    const result = await pool.query(query, params);
    const duration = Date.now() - start;

    // Log if slow (automatic threshold check)
    if (duration > 1000) {
      const logger = getSlowQueryLogger();
      await logger.logSlowQuery(query, params, duration, {
        userId: req.user?.id,
        operation: 'SELECT',
        tableName: 'users',
        rowCount: result.rowCount,
        context: {
          endpoint: req.path,
          requestId: req.id,
          clientIP: req.ip,
        },
      });
    }

    return result;
  } catch (error) {
    throw error;
  }
}
```

### Example 4: Disable Alerts Temporarily

```typescript
// For maintenance windows or known slow operations
const slowQueryLogger = initializeSlowQueryLogger(pool, {
  threshold: 1000,
  criticalThreshold: 5000,
  alertOnSlowQuery: false, // Disable notifications
  persistToDisk: true,     // Still log to database
});

// Later, re-enable
// (Note: would need to add a setter method or reinitialize)
```

## Notification Examples

### Email Notification

**Subject**: ⚠️ Critical Slow Query Alert - 8534ms

**Body** (HTML formatted):
```
Critical Slow Query Alert

A critical slow database query was detected on 2025-01-15T10:30:00.000Z

Query Details:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
• Query ID: slow_1736935800000_a1b2c3d4
• Duration: 8534ms
• Threshold: 5000ms
• Slowdown: 170% over threshold
• Operation: SELECT
• Table: users
• User ID: user_123abc
• Row Count: 1500

Query:
SELECT * FROM users WHERE created_at >= $1 AND status = $2 ORDER BY...

Timestamp: 2025-01-15T10:30:00.000Z
```

### Slack Notification

```json
{
  "text": "⚠️ Critical Slow Query Alert - 8534ms",
  "blocks": [
    {
      "type": "header",
      "text": {
        "type": "plain_text",
        "text": "⚠️ Critical Slow Query Alert - 8534ms"
      }
    },
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "A critical slow database query was detected..."
      }
    },
    {
      "type": "section",
      "fields": [
        { "type": "mrkdwn", "text": "*Query ID:*\nslow_1736935800000_a1b2c3d4" },
        { "type": "mrkdwn", "text": "*Duration:*\n8534ms" },
        { "type": "mrkdwn", "text": "*Threshold:*\n5000ms" },
        { "type": "mrkdwn", "text": "*Slowdown:*\n170% over threshold" }
      ]
    }
  ]
}
```

### Discord Notification

```json
{
  "embeds": [
    {
      "title": "⚠️ Critical Slow Query Alert - 8534ms",
      "description": "A critical slow database query was detected...",
      "color": 16744448,
      "fields": [
        { "name": "Query ID", "value": "slow_1736935800000_a1b2c3d4", "inline": true },
        { "name": "Duration", "value": "8534ms", "inline": true },
        { "name": "Threshold", "value": "5000ms", "inline": true },
        { "name": "Slowdown", "value": "170% over threshold", "inline": true },
        { "name": "Operation", "value": "SELECT", "inline": true },
        { "name": "Table", "value": "users", "inline": true }
      ],
      "timestamp": "2025-01-15T10:30:00.000Z"
    }
  ]
}
```

## Rate Limiting Behavior

### Scenario 1: Same Query, Multiple Executions

```
10:00:00 - Query A (8s) → Notification sent ✅
10:05:00 - Query A (9s) → Notification skipped ⏭️ (cooldown)
10:10:00 - Query A (7s) → Notification skipped ⏭️ (cooldown)
10:15:01 - Query A (8s) → Notification sent ✅ (15min elapsed)
```

### Scenario 2: Different Queries

```
10:00:00 - SELECT FROM users → Notification sent ✅
10:05:00 - SELECT FROM orders → Notification sent ✅ (different query)
10:10:00 - UPDATE users → Notification sent ✅ (different query)
```

### Scenario 3: Similar but Different Queries

```
10:00:00 - SELECT * FROM users WHERE id = 123 → Notification sent ✅
10:05:00 - SELECT * FROM users WHERE id = 456 → Skipped ⏭️ (same signature)
10:05:00 - SELECT * FROM users WHERE name = 'John' → Skipped ⏭️ (same signature)
```

## Query Statistics & Reporting

The slow query logger also provides statistical reporting:

### Hourly Statistics Report

Automatically logged every hour:

```json
{
  "totalSlowQueries": 47,
  "averageDuration": "2345.12ms",
  "slowestDuration": "8534ms",
  "byOperation": {
    "SELECT": 32,
    "UPDATE": 10,
    "INSERT": 5
  },
  "topTables": {
    "users": 25,
    "orders": 12,
    "products": 8,
    "sessions": 2
  }
}
```

### Daily Summary Report

Automatically generated at midnight:

```
Daily slow query report for 2025-01-14:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total: 234 slow queries
Average duration: 1834ms
Max duration: 12543ms

Top 10 by average duration:
1. SELECT users - 4532ms avg (15 occurrences)
2. UPDATE orders - 3210ms avg (8 occurrences)
3. INSERT products - 2890ms avg (12 occurrences)
...
```

## Database Schema

The slow query logger requires a database table (if `persistToDisk: true`):

```sql
CREATE TABLE IF NOT EXISTS slow_query_logs (
  id SERIAL PRIMARY KEY,
  query_id VARCHAR(100) NOT NULL UNIQUE,
  query TEXT NOT NULL,
  parameters JSONB,
  duration INTEGER NOT NULL,
  threshold INTEGER NOT NULL,
  user_id VARCHAR(50),
  operation VARCHAR(20),
  table_name VARCHAR(100),
  row_count INTEGER,
  execution_plan JSONB,
  stack_trace TEXT,
  context JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_slow_query_logs_created_at ON slow_query_logs(created_at);
CREATE INDEX idx_slow_query_logs_duration ON slow_query_logs(duration DESC);
CREATE INDEX idx_slow_query_logs_table_name ON slow_query_logs(table_name);
CREATE INDEX idx_slow_query_logs_operation ON slow_query_logs(operation);
```

## Advanced Configuration

### Full Configuration Options

```typescript
interface SlowQueryConfig {
  threshold: number;              // Default: 1000ms
  criticalThreshold: number;      // Default: 5000ms
  captureStackTrace: boolean;     // Default: true
  captureExecutionPlan: boolean;  // Default: false (expensive)
  maxLogSize: number;             // Default: 500 (in-memory limit)
  persistToDisk: boolean;         // Default: true
  alertOnSlowQuery: boolean;      // Default: true
}
```

### Performance Considerations

**Execution Plan Capture** (`captureExecutionPlan: true`):
- ✅ Provides detailed query diagnostics
- ❌ Runs EXPLAIN ANALYZE (executes query twice)
- ❌ Adds significant overhead (~2x execution time)
- ⚠️ Only use in development or for troubleshooting

**Recommendations**:
- Production: `captureExecutionPlan: false`
- Development: `captureExecutionPlan: true`
- Critical debugging: Enable temporarily

## Troubleshooting

### Issue: No notifications received

**Possible Causes**:
1. Notifications disabled: `alertOnSlowQuery: false`
2. No slow queries: Duration < `criticalThreshold`
3. Notification service not configured
4. Rate limiting (15-minute cooldown)

**Solutions**:
```typescript
// Check config
const logger = getSlowQueryLogger();
console.log(logger.config);

// Test notification manually
const testEntry = {
  queryId: 'test_123',
  query: 'SELECT * FROM test',
  duration: 10000, // 10 seconds
  threshold: 1000,
  timestamp: new Date(),
  operation: 'SELECT',
  tableName: 'test',
};

await logger.alertCriticalSlowQuery(testEntry);
```

### Issue: Too many notifications

**Cause**: Low threshold or frequent slow queries

**Solutions**:
1. Increase `criticalThreshold`:
   ```typescript
   criticalThreshold: 10000 // 10 seconds instead of 5
   ```

2. Disable alerts for known slow operations:
   ```typescript
   if (operation === 'BULK_INSERT') {
     // Skip slow query logging for this operation
     return;
   }
   ```

3. Increase cooldown period (requires code change):
   ```typescript
   const cooldownPeriod = 30 * 60 * 1000; // 30 minutes instead of 15
   ```

### Issue: Missing execution plan

**Cause**: `captureExecutionPlan: false` or non-SELECT query

**Solution**:
```typescript
// Enable execution plan capture
const logger = initializeSlowQueryLogger(pool, {
  captureExecutionPlan: true, // Enable
});

// Ensure query is SELECT (only SELECT queries capture plans)
```

### Issue: Notifications not formatted correctly

**Cause**: Notification service configuration

**Solution**: Check environment variables:
```bash
# Email
SMTP_HOST=smtp.gmail.com # Required
SMTP_PORT=587
SMTP_USER=your@email.com # Required
SMTP_PASS=yourpassword # Required

# Slack
SLACK_WEBHOOK_URL=https://hooks.slack.com/... # Required

# Discord
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/... # Required
```

## Best Practices

### 1. Set Appropriate Thresholds

```typescript
// Too strict - spam notifications
threshold: 100,           // ❌ Too low
criticalThreshold: 500,   // ❌ Too low

// Too lenient - miss issues
threshold: 10000,         // ❌ Too high
criticalThreshold: 30000, // ❌ Too high

// Recommended
threshold: 1000,          // ✅ 1 second
criticalThreshold: 5000,  // ✅ 5 seconds
```

### 2. Use Context for Debugging

```typescript
await logger.logSlowQuery(query, params, duration, {
  context: {
    endpoint: req.path,       // What endpoint triggered this?
    requestId: req.id,        // Which request?
    clientIP: req.ip,         // From which client?
    userAgent: req.headers['user-agent'], // What browser/app?
    cacheHit: false,          // Was cache involved?
  },
});
```

### 3. Regular Cleanup

```typescript
// Clean up old logs monthly
cron.schedule('0 0 1 * *', async () => {
  const logger = getSlowQueryLogger();
  const deleted = await logger.cleanupOldDatabaseRecords(30); // Keep 30 days
  console.log(`Cleaned up ${deleted} old slow query logs`);
});
```

### 4. Monitor Notification Rate

```typescript
// Track notification count
let notificationCount = 0;

// In alertCriticalSlowQuery
notificationCount++;

// Hourly check
cron.schedule('0 * * * *', () => {
  console.log(`Slow query notifications sent this hour: ${notificationCount}`);
  notificationCount = 0;

  if (notificationCount > 50) {
    console.warn('Too many slow query notifications - check database performance!');
  }
});
```

## Completion Checklist

- ✅ Integrated NotificationService for multi-channel alerts
- ✅ Implemented rate limiting (15-minute cooldown per query signature)
- ✅ Added detailed alert content with query diagnostics
- ✅ Included execution plan summary in alerts
- ✅ Added context information to alerts
- ✅ Implemented fire-and-forget async notifications
- ✅ Added error handling for failed notifications
- ✅ Configured priority and deduplication
- ✅ Removed TODO placeholder
- ✅ Created comprehensive documentation

## Summary

**Section 14: Slow Query Notifications - COMPLETE ✅**

The slow query logger now sends comprehensive multi-channel notifications for critical slow database queries with:

- **Multi-Channel**: Email, Slack, Discord
- **Rate Limited**: 15-minute cooldown per query signature
- **Detailed**: Query ID, duration, threshold, operation, table, user, row count, execution plan, context
- **Non-Blocking**: Fire-and-forget async notifications
- **Configurable**: Thresholds, channels, capture settings

Critical slow queries (>5 seconds by default) trigger immediate alerts to help teams quickly identify and resolve database performance issues.
