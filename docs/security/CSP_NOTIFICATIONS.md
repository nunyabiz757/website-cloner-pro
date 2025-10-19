# CSP Violation Notifications

Complete notification system for CSP (Content Security Policy) violations with email, Slack, and Discord integration.

## ✅ What's Implemented

### **1. Notification Service** ✅
- Location: [notification.service.ts](src/server/services/notification.service.ts)
- Email notifications (SMTP)
- Slack webhook integration
- Discord webhook integration
- Rate limiting (prevent spam)
- Deduplication (prevent duplicates)
- Multi-channel broadcasting

### **2. CSP Alert Integration** ✅
- File: [csp-alert.service.ts](src/server/services/csp-alert.service.ts)
- Line 275-374: Implemented notification logic
- Automatic alert notifications
- Severity-based prioritization
- Context-rich notifications

### **3. Features**
- ✅ Multi-channel notifications (email, Slack, Discord)
- ✅ Intelligent rate limiting by severity
- ✅ Deduplication (1-hour window)
- ✅ Priority-based formatting
- ✅ Detailed context in notifications
- ✅ Automatic retry/fallback
- ✅ HTML email formatting
- ✅ Slack blocks/attachments
- ✅ Discord embeds

## Quick Start

### 1. Configure Email Notifications (Optional)

Add to your `.env` file:

```bash
# Email Notifications (SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM=noreply@yourapp.com
NOTIFICATION_EMAIL=security@yourcompany.com
```

**For Gmail:**
1. Enable 2FA on your Google account
2. Generate an App Password
3. Use the App Password as `SMTP_PASSWORD`

### 2. Configure Slack Notifications (Optional)

```bash
# Slack Webhook
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
```

**Get Slack Webhook:**
1. Go to https://api.slack.com/apps
2. Create New App → From scratch
3. Add "Incoming Webhooks" feature
4. Activate and create webhook for channel
5. Copy webhook URL

### 3. Configure Discord Notifications (Optional)

```bash
# Discord Webhook
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/YOUR_WEBHOOK_URL
```

**Get Discord Webhook:**
1. Open Discord Server Settings
2. Go to Integrations → Webhooks
3. Create New Webhook
4. Copy webhook URL

### 4. Test Notifications

```typescript
import { getNotificationService } from './services/notification.service.js';

const notificationService = getNotificationService();

// Test all configured channels
const results = await notificationService.testNotifications();
console.log('Test results:', results);
// { email: true, slack: true, discord: false }
```

## Notification Types

### Automatic CSP Alert Notifications

The following CSP events trigger automatic notifications:

**1. Critical Violations**
- Severity: Critical
- Rate Limit: 10 per hour
- Sent when: Single critical CSP violation detected
- Example: `script-src` violation blocking malicious script

**2. New Patterns**
- Severity: Medium
- Rate Limit: 50 per hour
- Sent when: First occurrence of a new violation pattern
- Example: New blocked resource type detected

**3. Threshold Exceeded**
- Severity: High/Medium
- Rate Limit: 20 per hour
- Sent when: Violation count exceeds threshold
- Example: 100+ violations in last hour

**4. Daily Summary**
- Severity: Medium/High
- Rate Limit: 1 per day
- Sent when: >100 violations or >10 critical violations in a day
- Example: Daily security report

## Notification Channels

### Email Notifications

**Format:**
- Professional HTML email
- Subject: `[CSP Alert] CRITICAL - script-src violation...`
- Body: Formatted with details table
- Footer: Automated message notice

**Example:**
```
Subject: [CSP Alert] CRITICAL - script-src violation detected

Critical CSP violation detected: script-src blocked https://evil.com/malicious.js

Details:
----------------
Alert ID:       abc123
Severity:       critical
Alert Type:     critical_violation
Violation ID:   v-456
Time:           2025-01-15 14:30:00
```

**Configuration:**
```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false                    # true for port 465, false for 587
SMTP_USER=alerts@yourcompany.com
SMTP_PASSWORD=your-app-password
SMTP_FROM=noreply@yourcompany.com
NOTIFICATION_EMAIL=security@yourcompany.com
```

---

### Slack Notifications

**Format:**
- Header block with alert title
- Message section with violation details
- Fields with metadata
- Color-coded attachments (red for critical, etc.)
- Footer with priority and timestamp

**Example:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[CSP Alert] CRITICAL - script-src violation

Critical CSP violation detected: script-src blocked https://evil.com/malicious.js

Alert ID: abc123        Severity: critical
Alert Type: critical_violation    Time: 2025-01-15 14:30:00

Priority: critical | Jan 15, 2025 at 2:30 PM
Website Cloner Pro
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**Configuration:**
```bash
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXX
```

**Color Coding:**
- Critical: Red
- High: Yellow/Orange
- Medium: Blue
- Low: Green

---

### Discord Notifications

**Format:**
- Embed with title and description
- Color-coded embed border
- Inline fields for metadata
- Footer with priority
- Timestamp

**Example:**
```
┏━ [CSP Alert] CRITICAL - script-src violation ━
┃
┃ Critical CSP violation detected: script-src blocked https://evil.com/malicious.js
┃
┃ Alert ID: abc123              Severity: critical
┃ Alert Type: critical_violation   Time: 2025-01-15 14:30:00
┃
┗━ Priority: critical | Website Cloner Pro | Jan 15, 2025 2:30 PM
```

**Configuration:**
```bash
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/123456789/abcdefghijklmnop
```

**Color Coding:**
- Critical: #e74c3c (Red)
- High: #f39c12 (Orange)
- Medium: #3498db (Blue)
- Low: #2ecc71 (Green)

## Rate Limiting

Prevents notification spam by limiting messages per hour:

| Priority | Max Per Hour | Use Case |
|----------|--------------|----------|
| Low | 100 | General info, low-priority alerts |
| Medium | 50 | Standard violations, new patterns |
| High | 20 | Threshold breaches, important alerts |
| Critical | 10 | Critical violations, security issues |

**How it works:**
```typescript
// First 10 critical alerts in an hour: Sent
// 11th critical alert: Rate limited (not sent)
// After 1 hour: Counter resets
```

**Rate limit keys:**
```typescript
// CSP-specific rate limits
rateLimitKey: 'csp-critical'  // Separate limit for critical CSP alerts
rateLimitKey: 'csp-high'      // Separate limit for high CSP alerts
rateLimitKey: 'csp-medium'    // Separate limit for medium CSP alerts
```

## Deduplication

Prevents sending duplicate notifications within 1 hour:

```typescript
// First alert with key 'csp-alert-abc123': Sent
// Second alert with key 'csp-alert-abc123' (within 1 hour): Deduplicated (not sent)
// After 1 hour: Can send again
```

**Deduplication keys:**
```typescript
deduplicationKey: `csp-alert-${alertId}`
```

## Usage Examples

### Example 1: Manual Notification

```typescript
import { getNotificationService } from './services/notification.service.js';

const notificationService = getNotificationService();

// Send to all channels
await notificationService.sendAll(
  {
    subject: 'Security Alert',
    message: 'Unusual activity detected in your application',
    details: {
      'Event Type': 'Suspicious Login',
      'IP Address': '192.168.1.1',
      'User': 'admin',
      'Time': new Date().toISOString(),
    },
  },
  {
    priority: 'high',
    deduplicationKey: 'security-suspicious-login-192.168.1.1',
    rateLimitKey: 'security-alerts',
  }
);
```

### Example 2: Email Only

```typescript
await notificationService.sendEmail(
  {
    to: 'security@company.com',
    subject: 'Daily Security Report',
    text: 'Daily security summary for January 15, 2025',
    html: '<h1>Daily Report</h1><p>All systems normal</p>',
  },
  {
    priority: 'low',
  }
);
```

### Example 3: Slack Only

```typescript
await notificationService.sendSlack(
  {
    text: 'Deployment completed successfully',
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Deployment Status:* Success ✅',
        },
      },
    ],
  },
  {
    priority: 'medium',
  }
);
```

### Example 4: Custom CSP Alert

```typescript
import { getCSPAlertService } from './services/csp-alert.service.js';

const cspAlertService = getCSPAlertService();

// Create custom alert (will automatically notify)
await cspAlertService.createAlert({
  alertType: 'custom_security_check',
  severity: 'high',
  message: 'Multiple failed authentication attempts detected',
  // violationId: 'optional',
  // patternId: 'optional',
});
```

## Notification Context

All CSP alerts include rich context:

```typescript
{
  'Alert ID': 'abc123',           // Unique alert identifier
  'Severity': 'critical',         // critical | high | medium | low
  'Alert Type': 'critical_violation', // Type of alert
  'Time': '1/15/2025, 2:30:00 PM',  // Human-readable timestamp
  'Violation ID': 'v-456',        // (If applicable) Link to violation
  'Pattern ID': 'p-789',          // (If applicable) Link to pattern
}
```

## Testing

### Test All Channels

```bash
# Add to route (development only)
GET /api/test-notifications
```

```typescript
router.get('/test-notifications', async (req, res) => {
  const notificationService = getNotificationService();
  const results = await notificationService.testNotifications();

  res.json({
    success: true,
    channels: results,
    message: 'Check configured channels for test messages',
  });
});
```

### Test Individual Channel

```typescript
// Test email
const emailSent = await notificationService.sendEmail({
  to: 'test@example.com',
  subject: 'Test Email',
  text: 'This is a test',
}, { priority: 'low' });

// Test Slack
const slackSent = await notificationService.sendSlack({
  text: 'Test Slack message',
}, { priority: 'low' });

// Test Discord
const discordSent = await notificationService.sendDiscord({
  content: 'Test Discord message',
  embeds: [],
}, { priority: 'low' });
```

### Check Status

```typescript
const status = notificationService.getStatus();
console.log(status);
// {
//   email: true,
//   slack: true,
//   discord: false
// }
```

## Troubleshooting

### Email Not Sending

**Check:**
1. SMTP credentials are correct
2. App password is used (not regular password for Gmail)
3. Port 587 for STARTTLS or 465 for SSL
4. `SMTP_SECURE` matches port (false for 587, true for 465)
5. Firewall allows outbound SMTP
6. Check logs for errors

**Gmail specific:**
```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-16-char-app-password  # NOT your Google password
```

### Slack Not Sending

**Check:**
1. Webhook URL is correct
2. Webhook is not disabled in Slack
3. Channel still exists
4. App has permission to post
5. Network can reach Slack API

**Test webhook:**
```bash
curl -X POST -H 'Content-Type: application/json' \
  -d '{"text":"Test message"}' \
  YOUR_SLACK_WEBHOOK_URL
```

### Discord Not Sending

**Check:**
1. Webhook URL is correct
2. Webhook is not deleted
3. Channel still exists
4. Network can reach Discord API

**Test webhook:**
```bash
curl -X POST -H 'Content-Type: application/json' \
  -d '{"content":"Test message"}' \
  YOUR_DISCORD_WEBHOOK_URL
```

### Rate Limit Hit

**Symptoms:**
- Logs show "Notification rate limit exceeded"
- Expected notifications not received

**Solutions:**
1. Reduce alert frequency
2. Increase thresholds in CSPAlertService
3. Adjust rate limits in NotificationService
4. Use more specific rate limit keys

### Duplicate Notifications

**Symptoms:**
- Same alert sent multiple times
- Logs show "Notification deduplicated"

**Solutions:**
1. Check deduplication keys are unique per alert
2. Verify deduplication window (1 hour default)
3. Ensure alert IDs are unique

## Configuration Reference

### Complete .env Example

```bash
# Email Notifications
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=alerts@yourcompany.com
SMTP_PASSWORD=your-app-password
SMTP_FROM=noreply@yourcompany.com
NOTIFICATION_EMAIL=security@yourcompany.com,admin@yourcompany.com

# Slack Notifications
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/T00/B00/XXX

# Discord Notifications (optional)
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/123/abc
```

### CSP Alert Thresholds

```typescript
// Customize in CSPAlertService initialization
initializeCSPAlertService(pool, {
  thresholds: {
    criticalViolationCount: 10,     // Alert if 10+ critical violations in 1 hour
    patternOccurrenceCount: 50,     // Alert if pattern occurs 50+ times
    uniqueViolationsPerHour: 20,    // Alert if 20+ unique violations in 1 hour
    totalViolationsPerHour: 100,    // Alert if 100+ total violations in 1 hour
  },
  notificationEnabled: true,         // Enable/disable notifications
});
```

### Rate Limit Customization

```typescript
// Edit in NotificationService if needed
private readonly rateLimitMax = {
  low: 100,      // Max 100 low-priority notifications per hour
  medium: 50,    // Max 50 medium-priority notifications per hour
  high: 20,      // Max 20 high-priority notifications per hour
  critical: 10,  // Max 10 critical notifications per hour
};
```

## Security Best Practices

### 1. Protect Webhook URLs

```bash
# ❌ Bad - Exposed in code
const webhook = 'https://hooks.slack.com/services/...';

# ✅ Good - Environment variable
const webhook = process.env.SLACK_WEBHOOK_URL;
```

### 2. Use App Passwords

```bash
# ❌ Bad - Regular password
SMTP_PASSWORD=MyGooglePassword123

# ✅ Good - App-specific password
SMTP_PASSWORD=abcd efgh ijkl mnop
```

### 3. Rotate Webhooks Regularly

- Regenerate Slack webhooks every 3-6 months
- Regenerate Discord webhooks if exposed
- Update email passwords regularly

### 4. Sanitize Notification Content

```typescript
// The service automatically sanitizes HTML
// But be careful with user-generated content
const safeMessage = stripHtml(userInput);
```

### 5. Limit Recipients

```bash
# ❌ Bad - Public email list
NOTIFICATION_EMAIL=everyone@company.com

# ✅ Good - Security team only
NOTIFICATION_EMAIL=security@company.com,ciso@company.com
```

## Advanced Usage

### Custom Notification Service

```typescript
import { NotificationService } from './services/notification.service.js';

class CustomNotificationService extends NotificationService {
  async sendSMS(phoneNumber: string, message: string): Promise<boolean> {
    // Implement SMS via Twilio, etc.
  }

  async sendPagerDuty(incident: any): Promise<boolean> {
    // Implement PagerDuty integration
  }
}
```

### Notification Templates

```typescript
const templates = {
  criticalViolation: (violation: any) => ({
    subject: `🚨 Critical CSP Violation: ${violation.directive}`,
    message: `A critical Content Security Policy violation has been detected.\n\nBlocked Resource: ${violation.blockedUri}\nDirective: ${violation.directive}\nDocument: ${violation.documentUri}`,
    details: {
      'Violation ID': violation.id,
      'Severity': 'CRITICAL',
      'IP Address': violation.ip,
      'User Agent': violation.userAgent,
    },
  }),
};

// Use template
await notificationService.sendAll(
  templates.criticalViolation(violation),
  { priority: 'critical' }
);
```

## Integration with Other Systems

### Sentry Integration

```typescript
import { captureException } from './utils/sentry.util.js';

// Send to both Sentry and notification channels
captureException(error, { level: 'error' });
await notificationService.sendAll({
  subject: 'Application Error',
  message: error.message,
});
```

### Audit Logging

```typescript
import { logAuditEvent } from './utils/audit-logger.js';

// Log + notify for critical events
await logAuditEvent({
  action: 'security.critical_violation',
  severity: 'critical',
  details: { ... },
});

await notificationService.sendAll({
  subject: 'Critical Security Event',
  message: 'Logged to audit trail',
});
```

## Related Documentation

- [CSP Violation Service](src/server/services/csp-violation.service.ts) - CSP violation tracking
- [Error Monitoring](ERROR_MONITORING.md) - Sentry integration
- [Audit Logging](AUDIT_LOGGING.md) - Audit event logging

## Summary

### Files Created

1. **[notification.service.ts](src/server/services/notification.service.ts)** (650+ lines)
   - Email, Slack, Discord support
   - Rate limiting and deduplication
   - Priority-based formatting
   - Rich context formatting

### Files Modified

2. **[csp-alert.service.ts](src/server/services/csp-alert.service.ts)**
   - Line 4: Added notification service import
   - Line 275-374: Implemented sendNotification()
   - Added severity to priority mapping
   - Integrated multi-channel notifications

### Environment Variables

```bash
# Email (Optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=alerts@company.com
SMTP_PASSWORD=app-password
SMTP_FROM=noreply@company.com
NOTIFICATION_EMAIL=security@company.com

# Slack (Optional)
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...

# Discord (Optional)
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
```

### TypeScript Verification

✅ **Zero TypeScript errors**

**Section 10: CSP Violation Notifications - COMPLETE** ✅
