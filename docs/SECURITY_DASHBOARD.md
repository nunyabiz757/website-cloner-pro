# Security Dashboard Documentation

## Overview

The Security Dashboard provides comprehensive real-time monitoring and analytics for security events across the Website Cloner Pro application. It combines REST API endpoints for historical data with WebSocket streaming for real-time updates.

## Architecture

### Components

1. **Security Metrics Service** (`security-metrics.service.ts`)
   - Aggregates security metrics from database
   - Provides historical analysis and trends
   - Calculates threat levels and risk scores

2. **Security Dashboard Routes** (`security-dashboard.routes.ts`)
   - REST API endpoints for dashboard data
   - JWT authentication required
   - Pagination and filtering support

3. **Security WebSocket Service** (`security-websocket.service.ts`)
   - Real-time event streaming
   - Client filtering and subscriptions
   - Connection health monitoring

## REST API Endpoints

### Get Complete Dashboard Data

```http
GET /api/security/dashboard?range=24h
Authorization: Bearer <JWT_TOKEN>
```

**Query Parameters:**
- `range` (optional): Time range - `24h`, `7d`, or `30d` (default: `24h`)

**Response:**
```json
{
  "success": true,
  "data": {
    "overview": { ... },
    "loginMetrics": { ... },
    "apiKeyMetrics": { ... },
    "sessionMetrics": { ... },
    "cspMetrics": { ... },
    "threatSummary": { ... },
    "timeline": [ ... ],
    "topThreats": [ ... ]
  },
  "timestamp": "2025-01-15T10:30:00Z"
}
```

### Get Security Overview

```http
GET /api/security/overview?range=24h
Authorization: Bearer <JWT_TOKEN>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "totalEvents": 1234,
    "criticalEvents": 5,
    "highSeverityEvents": 23,
    "mediumSeverityEvents": 156,
    "lowSeverityEvents": 1050,
    "uniqueIPs": 89,
    "threatLevel": "medium"
  }
}
```

**Threat Levels:**
- `critical`: 10+ critical events OR 20+ blocked IPs
- `high`: 5-9 critical events OR 10-19 blocked IPs
- `medium`: 2-4 critical events OR 5-9 blocked IPs
- `low`: < 2 critical events AND < 5 blocked IPs

### Get Login Metrics

```http
GET /api/security/login-metrics?range=7d
Authorization: Bearer <JWT_TOKEN>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "totalAttempts": 5678,
    "successfulLogins": 4890,
    "failedLogins": 788,
    "successRate": 86.12,
    "uniqueUsers": 234,
    "suspiciousAttempts": 45
  }
}
```

### Get API Key Metrics

```http
GET /api/security/api-key-metrics
Authorization: Bearer <JWT_TOKEN>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "totalKeys": 156,
    "activeKeys": 142,
    "expiredKeys": 8,
    "revokedKeys": 6,
    "expiringIn7Days": 12,
    "expiringIn30Days": 34,
    "totalUsageToday": 45678
  }
}
```

### Get Session Metrics

```http
GET /api/security/session-metrics
Authorization: Bearer <JWT_TOKEN>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "totalSessions": 345,
    "activeSessions": 289,
    "expiredSessions": 56,
    "averageSessionDuration": 3600,
    "uniqueIPs": 234
  }
}
```

### Get CSP Violation Metrics

```http
GET /api/security/csp-metrics?range=24h
Authorization: Bearer <JWT_TOKEN>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "totalViolations": 234,
    "uniqueDirectives": 5,
    "topViolations": [
      {
        "directive": "script-src",
        "count": 123,
        "percentage": 52.56
      }
    ]
  }
}
```

### Get Threat Summary

```http
GET /api/security/threat-summary
Authorization: Bearer <JWT_TOKEN>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "activeThreats": 12,
    "blockedIPs": 45,
    "criticalIncidents": 3,
    "threatLevel": "medium",
    "lastIncidentTime": "2025-01-15T09:45:00Z"
  }
}
```

### Get Security Timeline

```http
GET /api/security/timeline?range=24h
Authorization: Bearer <JWT_TOKEN>
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "timestamp": "2025-01-15T10:00:00Z",
      "critical": 2,
      "high": 5,
      "medium": 23,
      "low": 156
    }
  ]
}
```

### Get Top Threat Actors

```http
GET /api/security/top-threats?limit=10
Authorization: Bearer <JWT_TOKEN>
```

**Query Parameters:**
- `limit` (optional): Number of results (1-100, default: 10)

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "ipAddress": "192.168.1.100",
      "eventCount": 45,
      "maxSeverity": "critical",
      "eventTypes": ["brute_force", "sql_injection"],
      "firstSeen": "2025-01-15T08:00:00Z",
      "lastSeen": "2025-01-15T10:30:00Z"
    }
  ]
}
```

### Get Geographic Threat Distribution

```http
GET /api/security/geographic-threats
Authorization: Bearer <JWT_TOKEN>
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "country": "United States",
      "countryCode": "US",
      "eventCount": 234,
      "severity": "medium"
    }
  ]
}
```

### Get Security Events (Paginated)

```http
GET /api/security/events?limit=50&offset=0&severity=critical&type=brute_force
Authorization: Bearer <JWT_TOKEN>
```

**Query Parameters:**
- `limit` (optional): Results per page (default: 50)
- `offset` (optional): Page offset (default: 0)
- `severity` (optional): Filter by severity
- `type` (optional): Filter by event type

**Response:**
```json
{
  "success": true,
  "data": {
    "events": [ ... ],
    "total": 234,
    "limit": 50,
    "offset": 0
  }
}
```

### Get Specific Security Event

```http
GET /api/security/events/:id
Authorization: Bearer <JWT_TOKEN>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "event_type": "brute_force",
    "severity": "critical",
    "message": "Brute force attack detected",
    "details": { ... },
    "ip_address": "192.168.1.100",
    "user_id": "user-uuid",
    "created_at": "2025-01-15T10:30:00Z"
  }
}
```

### Get Quick Statistics

```http
GET /api/security/stats
Authorization: Bearer <JWT_TOKEN>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "events_24h": 1234,
    "critical_24h": 5,
    "blocked_ips": 45,
    "active_sessions": 289,
    "active_api_keys": 142
  }
}
```

## WebSocket Real-time Events

### Connection

Connect to the WebSocket endpoint with JWT authentication:

```javascript
const token = 'your-jwt-token';
const ws = new WebSocket(`wss://your-domain.com/api/security/ws?token=${token}`);

ws.onopen = () => {
  console.log('Connected to security event stream');
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  handleMessage(message);
};

ws.onerror = (error) => {
  console.error('WebSocket error:', error);
};

ws.onclose = () => {
  console.log('Disconnected from security event stream');
};
```

### Message Types

#### Welcome Message (Server → Client)

```json
{
  "type": "connected",
  "message": "Connected to security event stream",
  "clientId": "client_1234567890_abc123",
  "timestamp": "2025-01-15T10:30:00Z"
}
```

#### Security Event (Server → Client)

```json
{
  "type": "securityEvent",
  "event": {
    "id": "event-uuid",
    "eventType": "login_failed",
    "severity": "high",
    "message": "Failed login attempt",
    "details": {
      "username": "admin",
      "reason": "invalid_password"
    },
    "ipAddress": "192.168.1.100",
    "userId": "user-uuid",
    "timestamp": "2025-01-15T10:30:00Z"
  },
  "timestamp": "2025-01-15T10:30:00Z"
}
```

#### Ping/Pong (Client ↔ Server)

```javascript
// Send ping
ws.send(JSON.stringify({ type: 'ping' }));

// Receive pong
{
  "type": "pong",
  "timestamp": "2025-01-15T10:30:00Z"
}
```

#### Set Filters (Client → Server)

```javascript
ws.send(JSON.stringify({
  type: 'setFilters',
  filters: {
    severity: ['critical', 'high'],
    eventTypes: ['login_failed', 'brute_force']
  }
}));

// Response
{
  "type": "filtersUpdated",
  "filters": {
    "severity": ["critical", "high"],
    "eventTypes": ["login_failed", "brute_force"]
  },
  "timestamp": "2025-01-15T10:30:00Z"
}
```

#### Subscribe to Event Types (Client → Server)

```javascript
ws.send(JSON.stringify({
  type: 'subscribe',
  eventTypes: ['login_failed', 'api_key_denied']
}));

// Response
{
  "type": "subscribed",
  "eventTypes": ["login_failed", "api_key_denied"],
  "timestamp": "2025-01-15T10:30:00Z"
}
```

#### Unsubscribe (Client → Server)

```javascript
ws.send(JSON.stringify({ type: 'unsubscribe' }));

// Response
{
  "type": "unsubscribed",
  "timestamp": "2025-01-15T10:30:00Z"
}
```

## Event Types

### Authentication Events
- `login_success` - Successful login
- `login_failed` - Failed login attempt
- `logout` - User logout
- `session_expired` - Session expiration
- `session_hijack` - Session hijacking attempt

### API Key Events
- `api_key_created` - New API key created
- `api_key_used` - API key used successfully
- `api_key_denied` - API key authentication failed
- `api_key_expired` - API key expired
- `api_key_revoked` - API key revoked

### Security Events
- `brute_force` - Brute force attack detected
- `sql_injection` - SQL injection attempt
- `xss_attempt` - XSS attack attempt
- `csrf_token_invalid` - Invalid CSRF token
- `rate_limit_exceeded` - Rate limit exceeded
- `ip_blacklisted` - IP address blacklisted

### Content Security
- `csp_violation` - Content Security Policy violation
- `archive_bomb` - Archive decompression bomb detected
- `malicious_file` - Malicious file upload detected
- `exif_strip` - EXIF data stripped from image

## Severity Levels

- `critical` - Immediate action required (e.g., active attack)
- `high` - Important security event (e.g., failed authentication)
- `medium` - Notable security event (e.g., CSP violation)
- `low` - Informational (e.g., successful login)

## Integration Example

### React Dashboard Component

```typescript
import { useEffect, useState } from 'react';

interface SecurityDashboard {
  overview: any;
  loginMetrics: any;
  apiKeyMetrics: any;
  // ... other metrics
}

export function SecurityDashboard() {
  const [data, setData] = useState<SecurityDashboard | null>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [ws, setWs] = useState<WebSocket | null>(null);

  // Fetch initial dashboard data
  useEffect(() => {
    async function fetchDashboard() {
      const response = await fetch('/api/security/dashboard?range=24h', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const result = await response.json();
      setData(result.data);
    }
    fetchDashboard();
  }, []);

  // Connect to WebSocket for real-time updates
  useEffect(() => {
    const websocket = new WebSocket(
      `wss://your-domain.com/api/security/ws?token=${token}`
    );

    websocket.onmessage = (event) => {
      const message = JSON.parse(event.data);

      if (message.type === 'securityEvent') {
        setEvents(prev => [message.event, ...prev.slice(0, 99)]);
      }
    };

    setWs(websocket);

    return () => {
      websocket.close();
    };
  }, []);

  // Filter events by severity
  const filterBySeverity = (severity: string[]) => {
    ws?.send(JSON.stringify({
      type: 'setFilters',
      filters: { severity }
    }));
  };

  return (
    <div>
      <h1>Security Dashboard</h1>

      {/* Overview metrics */}
      <div className="metrics">
        <div>Total Events: {data?.overview.totalEvents}</div>
        <div>Critical: {data?.overview.criticalEvents}</div>
        <div>Threat Level: {data?.overview.threatLevel}</div>
      </div>

      {/* Real-time events */}
      <div className="live-events">
        <h2>Live Security Events</h2>
        {events.map(event => (
          <div key={event.id} className={`event ${event.severity}`}>
            <span>{event.eventType}</span>
            <span>{event.message}</span>
            <span>{event.ipAddress}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

## Performance Considerations

### REST API
- Dashboard data is cached for 30 seconds
- Heavy queries use database indexes
- Pagination limits large result sets
- Time range filters reduce query scope

### WebSocket
- Ping/pong every 30 seconds for health monitoring
- Automatic reconnection on disconnect
- Client-side filtering reduces bandwidth
- Maximum 1000 clients per instance

## Security Considerations

### Authentication
- JWT tokens required for all endpoints
- WebSocket connections verify token on connect
- Tokens expire after configured duration
- Invalid tokens result in immediate disconnect

### Authorization
- Users can only view their own security data
- Admin role required for global dashboard
- API keys require specific permissions
- Rate limiting on all endpoints

### Data Privacy
- Sensitive data is redacted in logs
- IP addresses can be anonymized
- User details require additional permissions
- PII is not stored in security events

## Monitoring and Alerts

### Health Checks
- WebSocket connection count
- Event processing rate
- Database query performance
- Memory usage

### Automated Alerts
- Critical events trigger immediate notifications
- Threat level changes send alerts
- Unusual patterns detected automatically
- Failed authentication patterns tracked

## Troubleshooting

### WebSocket Connection Issues

**Problem**: Cannot connect to WebSocket
**Solution**:
- Verify JWT token is valid
- Check server supports WebSocket upgrade
- Ensure `/api/security/ws` path is correct
- Check firewall/proxy settings

**Problem**: Connection drops frequently
**Solution**:
- Increase ping/pong timeout
- Check network stability
- Verify server resources
- Review client error logs

### API Response Issues

**Problem**: Slow dashboard loading
**Solution**:
- Use appropriate time range
- Enable database query caching
- Add database indexes
- Reduce data granularity

**Problem**: Missing events
**Solution**:
- Check database constraints
- Verify event logging is enabled
- Review filter settings
- Check time zone configuration

## Best Practices

1. **Use appropriate time ranges**: Start with 24h, expand only when needed
2. **Implement client-side caching**: Reduce API calls for static data
3. **Filter WebSocket events**: Only subscribe to relevant event types
4. **Handle disconnections**: Implement automatic reconnection logic
5. **Rate limit requests**: Respect API rate limits
6. **Monitor performance**: Track dashboard load times
7. **Secure credentials**: Never expose JWT tokens in logs
8. **Implement pagination**: Always paginate large result sets

## Future Enhancements

- Machine learning for anomaly detection
- Geolocation mapping for threats
- Customizable alert rules
- Export capabilities (CSV, PDF)
- Historical trend analysis
- Correlation engine for related events
- Automated response actions
- Integration with SIEM systems
