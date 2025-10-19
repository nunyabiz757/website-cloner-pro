# Error Monitoring with Sentry

Complete Sentry integration for error tracking and performance monitoring.

## ✅ What's Implemented

### **1. Sentry SDK Initialization** ✅
- Location: [sentry.util.ts](src/server/utils/sentry.util.ts)
- Complete SDK configuration
- Environment-based enablement
- Data sanitization
- Performance monitoring

### **2. Error Tracking in Error Middleware** ✅
- File: [error.middleware.ts](src/server/middleware/error.middleware.ts)
- **3 locations integrated**:
  - Line 175-198: Normal error handling
  - Line 268-291: Unhandled promise rejections
  - Line 297-327: Uncaught exceptions

### **3. Performance Monitoring** ✅
- File: [sentry.middleware.ts](src/server/middleware/sentry.middleware.ts)
- Request tracking
- Route performance monitoring
- Database query tracking
- External API call tracking

### **4. Features**
- ✅ Automatic error capture
- ✅ Performance monitoring (10% sample rate)
- ✅ Request context tracking
- ✅ User identification
- ✅ Breadcrumb tracking
- ✅ Error grouping/fingerprinting
- ✅ Sensitive data sanitization
- ✅ Production-only activation

## Quick Start

### 1. Set Up Sentry Account

1. Go to [sentry.io](https://sentry.io)
2. Create account / Sign in
3. Create new project (Node.js)
4. Copy the DSN (Data Source Name)

### 2. Configure Environment Variables

Add to your `.env` file:

```bash
# Sentry Configuration
SENTRY_DSN=https://your-key@o123456.ingest.sentry.io/7654321

# Optional: Adjust sample rates (default: 0.1 = 10%)
SENTRY_TRACES_SAMPLE_RATE=0.1        # 10% of transactions
SENTRY_PROFILES_SAMPLE_RATE=0.1      # 10% of transactions

# Environment
NODE_ENV=production
```

### 3. Initialize Sentry at Application Startup

Add to your `src/server/index.ts` (or main entry point):

```typescript
import { initializeSentry } from './utils/sentry.util.js';
import {
  sentryRequestHandler,
  sentryTracingHandler,
  sentryErrorHandler
} from './middleware/sentry.middleware.js';
import {
  handleUncaughtException,
  handleUnhandledRejection
} from './middleware/error.middleware.js';

// 1. Initialize Sentry FIRST (before any other code)
initializeSentry();

// 2. Set up global error handlers
handleUncaughtException();
handleUnhandledRejection();

// 3. Create Express app
const app = express();

// 4. Add Sentry middleware BEFORE routes
app.use(sentryRequestHandler());
app.use(sentryTracingHandler());

// 5. Add your routes
app.use('/api', apiRoutes);

// 6. Add Sentry error handler BEFORE other error handlers
app.use(sentryErrorHandler());

// 7. Add your custom error handler AFTER Sentry
app.use(errorHandler);

// 8. Start server
app.listen(3000);
```

**IMPORTANT ORDER:**
1. Initialize Sentry
2. Global error handlers
3. Express app creation
4. Sentry request/tracing middleware
5. Your routes
6. Sentry error handler
7. Custom error handler

## Error Tracking

### Automatic Error Capture

All errors are automatically captured in the error middleware:

```typescript
// This is already implemented in error.middleware.ts
// No additional code needed!

// Example error that will be captured:
app.get('/test-error', (req, res) => {
  throw new Error('Test error'); // Automatically captured
});
```

### Manual Error Capture

```typescript
import { captureException } from './utils/sentry.util.js';

try {
  // Some code that might fail
  await riskyOperation();
} catch (error) {
  // Manually capture with context
  captureException(error, {
    user: { id: userId },
    tags: {
      operation: 'risky_operation',
      severity: 'high',
    },
    extra: {
      attemptCount: 3,
      configuration: config,
    },
    level: 'error',
  });

  // Handle error
  res.status(500).json({ error: 'Operation failed' });
}
```

### Error Context

Errors automatically include:

**Tags:**
- HTTP method
- Route path
- Status code
- Error code

**Extra Data:**
- IP address
- User agent
- Referer
- Query parameters
- Route parameters
- Error log details

**User:**
- User ID (if authenticated)

## Performance Monitoring

### Request Performance

Automatically tracked for all requests:

```typescript
// Already set up via middleware
// Tracks:
// - Request duration
// - Response status
// - Route path
// - HTTP method
```

### Database Query Tracking

```typescript
import { trackDatabaseQuery } from './middleware/sentry.middleware.js';

// Wrap database queries
const users = await trackDatabaseQuery('SELECT users', async () => {
  return db.query('SELECT * FROM users WHERE active = true');
});

// Sentry will track:
// - Query duration
// - Success/failure
// - Query name
```

### External API Call Tracking

```typescript
import { trackExternalCall } from './middleware/sentry.middleware.js';

// Wrap external API calls
const data = await trackExternalCall('OpenAI', 'POST /v1/chat/completions', async () => {
  return fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model: 'gpt-4', messages }),
  });
});

// Sentry will track:
// - API call duration
// - Success/failure
// - Service name
```

### Route-Specific Performance

```typescript
import { trackRoutePerformance } from './middleware/sentry.middleware.js';

// Track specific route performance
app.get(
  '/api/expensive-operation',
  trackRoutePerformance('/api/expensive-operation'),
  async (req, res) => {
    // Your handler
  }
);
```

## User Tracking

### Automatic User Tracking

Users are automatically tracked when authenticated:

```typescript
// After authentication middleware sets req.user
// Sentry automatically captures user context
app.use(sentryUserContext); // In your middleware chain
```

### Manual User Tracking

```typescript
import { setUser, clearUser } from './utils/sentry.util.js';

// Set user context
setUser({
  id: user.id,
  email: user.email,
  username: user.username,
});

// Clear user context (e.g., on logout)
clearUser();
```

## Breadcrumbs

Track user actions for debugging:

```typescript
import { addBreadcrumb } from './utils/sentry.util.js';

// Add custom breadcrumb
addBreadcrumb({
  message: 'User clicked export button',
  category: 'ui.interaction',
  level: 'info',
  data: {
    websiteId: 'abc123',
    format: 'html',
  },
});

// Breadcrumbs appear in Sentry when error occurs
```

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `SENTRY_DSN` | Yes | - | Sentry project DSN |
| `SENTRY_TRACES_SAMPLE_RATE` | No | 0.1 | % of transactions to track (0.0-1.0) |
| `SENTRY_PROFILES_SAMPLE_RATE` | No | 0.1 | % of transactions to profile (0.0-1.0) |
| `NODE_ENV` | Yes | - | Must be 'production' to enable Sentry |

### Sample Rates Explained

**Traces Sample Rate** (0.1 = 10%):
- 100%: Track all requests (expensive, use in low-traffic)
- 10%: Track 1 in 10 requests (recommended)
- 1%: Track 1 in 100 requests (high-traffic apps)

**Profiles Sample Rate** (0.1 = 10%):
- Detailed CPU profiling
- Same guidelines as traces

**Recommendation:** Start with 10%, adjust based on traffic and Sentry quota.

### Ignored Errors

The following errors are NOT sent to Sentry:

- Network errors
- Client-side errors (ResizeObserver, etc.)
- Rate limit errors (4xx already handled)
- Validation errors (expected user input errors)
- Operational errors with status < 500

### Data Sanitization

Automatically sanitized:

**Headers:**
- Authorization
- Cookie
- X-API-Key

**Query Parameters:**
- password
- token
- api_key

**Breadcrumbs:**
- password fields
- token fields
- apiKey fields

## Integration Examples

### Example 1: Complete Server Setup

```typescript
// src/server/index.ts
import express from 'express';
import { initializeSentry } from './utils/sentry.util.js';
import {
  sentryRequestHandler,
  sentryTracingHandler,
  sentryErrorHandler,
  sentryUserContext,
  sentryPerformanceMiddleware
} from './middleware/sentry.middleware.js';
import {
  errorHandler,
  handleUncaughtException,
  handleUnhandledRejection
} from './middleware/error.middleware.js';
import { authenticate } from './middleware/auth.middleware.js';

// Initialize Sentry FIRST
initializeSentry();

// Global error handlers
handleUncaughtException();
handleUnhandledRejection();

const app = express();

// Sentry request tracking (BEFORE routes)
app.use(sentryRequestHandler());
app.use(sentryTracingHandler());

// Standard middleware
app.use(express.json());

// Authentication
app.use(authenticate);

// Sentry user context (AFTER auth)
app.use(sentryUserContext);

// Performance tracking
app.use(sentryPerformanceMiddleware);

// Routes
app.use('/api', apiRoutes);

// Sentry error handler (BEFORE custom error handler)
app.use(sentryErrorHandler());

// Custom error handler (AFTER Sentry)
app.use(errorHandler);

// Start server
app.listen(3000);
```

### Example 2: Service with Error Tracking

```typescript
// src/server/services/website-cloner.service.ts
import { captureException } from '../utils/sentry.util.js';
import { trackDatabaseQuery, trackExternalCall } from '../middleware/sentry.middleware.js';

export class WebsiteCloner {
  async cloneWebsite(url: string, userId: string) {
    try {
      // Track external API call
      const html = await trackExternalCall('Target Website', `GET ${url}`, async () => {
        return fetch(url).then(r => r.text());
      });

      // Process HTML...
      const processed = await this.processHTML(html);

      // Track database operation
      const website = await trackDatabaseQuery('INSERT website', async () => {
        return this.db.query(
          'INSERT INTO websites (url, html, user_id) VALUES ($1, $2, $3) RETURNING *',
          [url, processed, userId]
        );
      });

      return website;
    } catch (error) {
      // Capture error with context
      captureException(error, {
        user: { id: userId },
        tags: {
          operation: 'clone_website',
          url_domain: new URL(url).hostname,
        },
        extra: {
          url,
          htmlLength: html?.length,
        },
        level: 'error',
      });

      throw error;
    }
  }
}
```

### Example 3: Route with Performance Tracking

```typescript
// src/server/routes/websites.routes.ts
import { trackRoutePerformance } from '../middleware/sentry.middleware.js';
import { addBreadcrumb } from '../utils/sentry.util.js';

router.post(
  '/clone',
  authenticate,
  trackRoutePerformance('/api/websites/clone'),
  async (req, res) => {
    const { url } = req.body;

    // Add breadcrumb
    addBreadcrumb({
      message: 'Website clone initiated',
      category: 'clone',
      level: 'info',
      data: { url },
    });

    const website = await websiteCloner.cloneWebsite(url, req.user.userId);

    res.json({ success: true, website });
  }
);
```

## Viewing Errors in Sentry

### Sentry Dashboard

1. Log in to [sentry.io](https://sentry.io)
2. Select your project
3. View **Issues** tab for errors
4. View **Performance** tab for transactions

### Error Details

Each error includes:
- **Message**: Error message
- **Stack Trace**: Full stack trace
- **Breadcrumbs**: User actions leading to error
- **Tags**: Route, method, status code, etc.
- **Context**: User, request details, extra data
- **Fingerprint**: Groups similar errors

### Performance Details

Each transaction includes:
- **Duration**: Total request time
- **Spans**: Breakdown by operation (DB, API, etc.)
- **Tags**: Route, user, status code
- **Breadcrumbs**: Actions during request

## Testing

### Test Error Capture

```typescript
// Add test route (ONLY in development)
if (process.env.NODE_ENV !== 'production') {
  app.get('/test-sentry-error', (req, res) => {
    throw new Error('Test Sentry error capture');
  });

  app.get('/test-sentry-message', (req, res) => {
    captureMessage('Test Sentry message', 'info');
    res.json({ message: 'Message sent to Sentry' });
  });
}
```

### Test Performance Monitoring

```typescript
// Test database tracking
app.get('/test-db-tracking', async (req, res) => {
  const users = await trackDatabaseQuery('Test query', async () => {
    return new Promise(resolve =>
      setTimeout(() => resolve([{ id: 1, name: 'Test' }]), 100)
    );
  });

  res.json(users);
});
```

## Troubleshooting

### Sentry Not Capturing Errors

**Check:**
1. `NODE_ENV` is set to `production`
2. `SENTRY_DSN` is correctly set
3. Sentry initialized BEFORE error occurs
4. Error is not in `ignoreErrors` list
5. Check console for `[SENTRY]` logs

### Performance Data Not Showing

**Check:**
1. `SENTRY_TRACES_SAMPLE_RATE` > 0
2. Middleware order is correct
3. Transaction sample rate is appropriate for traffic
4. Sentry Performance is enabled in project settings

### User Data Not Showing

**Check:**
1. `sentryUserContext` middleware is used
2. Middleware is AFTER authentication
3. `req.user` is set correctly
4. User has `userId` or `id` field

### Too Many Events / Quota Exceeded

**Solutions:**
1. Reduce `SENTRY_TRACES_SAMPLE_RATE` (e.g., 0.01 = 1%)
2. Add more errors to `ignoreErrors`
3. Increase Sentry quota in project settings
4. Use `beforeSend` to filter more aggressively

## Best Practices

### 1. Initialize Early

```typescript
// ✅ Good - Initialize first
initializeSentry();
const app = express();

// ❌ Bad - Initialize after routes
const app = express();
app.use('/api', routes);
initializeSentry(); // Too late!
```

### 2. Don't Send Operational Errors

```typescript
// ✅ Good - Only send 5xx errors
if (error.statusCode >= 500) {
  captureException(error);
}

// ❌ Bad - Send validation errors
captureException(new ValidationError('Invalid email')); // Don't!
```

### 3. Add Context to Errors

```typescript
// ✅ Good - Rich context
captureException(error, {
  user: { id: userId },
  tags: { operation: 'clone', domain: 'example.com' },
  extra: { attemptCount: 3, config },
});

// ❌ Bad - No context
captureException(error);
```

### 4. Use Fingerprints for Grouping

```typescript
// ✅ Good - Group similar errors
captureException(error, {
  fingerprint: ['database-timeout', dbName],
});

// ❌ Bad - Default grouping (may be too granular)
```

### 5. Sanitize Sensitive Data

```typescript
// ✅ Good - Remove sensitive data
const sanitized = { ...data };
delete sanitized.password;
delete sanitized.creditCard;
captureException(error, { extra: { data: sanitized } });

// ❌ Bad - Send sensitive data
captureException(error, { extra: { data } }); // May contain secrets!
```

## Cost Optimization

### Reduce Events

1. **Lower sample rates:**
   ```bash
   SENTRY_TRACES_SAMPLE_RATE=0.01  # 1% instead of 10%
   ```

2. **Filter errors:**
   ```typescript
   ignoreErrors: [
     'NetworkError',
     'ValidationError',
     // Add more patterns
   ]
   ```

3. **Use `beforeSend`:**
   ```typescript
   beforeSend(event) {
     // Don't send in development
     if (event.environment === 'development') return null;

     // Filter by user tier
     if (event.user?.tier === 'free') return null;

     return event;
   }
   ```

### Monitor Quota

1. Check Sentry dashboard → Settings → Quota
2. Set up alerts for quota warnings
3. Review most frequent errors (fix instead of capturing)

## Security

### Sensitive Data Protection

Automatically sanitized:
- Authorization headers
- Cookies
- API keys
- Passwords in query params
- Tokens

### Manual Sanitization

```typescript
// Sanitize before sending
const sanitizeUser = (user: any) => ({
  id: user.id,
  email: user.email?.replace(/@.*/, '@***'),
  // Omit sensitive fields
});

captureException(error, {
  extra: {
    user: sanitizeUser(user),
  },
});
```

## Related Documentation

- [Error Middleware](src/server/middleware/error.middleware.ts) - Error handling
- [Audit Logging](AUDIT_LOGGING.md) - Audit event logging
- [Sentry Official Docs](https://docs.sentry.io/platforms/node/) - Sentry Node.js docs

## Summary

### Files Created

1. **[sentry.util.ts](src/server/utils/sentry.util.ts)** (470 lines)
   - Sentry SDK initialization
   - Error capture helpers
   - Context management
   - Transaction helpers

2. **[sentry.middleware.ts](src/server/middleware/sentry.middleware.ts)** (270 lines)
   - Express middleware integration
   - Performance monitoring
   - Request tracking
   - Database/API call tracking

### Files Modified

3. **[error.middleware.ts](src/server/middleware/error.middleware.ts)**
   - Line 3: Added Sentry imports
   - Line 175-198: Integrated error capture
   - Line 268-291: Unhandled rejection tracking
   - Line 297-327: Uncaught exception tracking

### Environment Variables Required

```bash
SENTRY_DSN=https://your-key@o123456.ingest.sentry.io/7654321
NODE_ENV=production
```

### TypeScript Verification

✅ **Zero TypeScript errors**

**Section 9: Error Monitoring - COMPLETE** ✅
