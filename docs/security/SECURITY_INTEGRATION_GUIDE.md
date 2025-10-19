## Security Integration Guide
# Complete Setup Instructions for Website Cloner Pro Security

This guide provides step-by-step instructions for integrating all 20 security features into your application.

---

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [Environment Setup](#environment-setup)
3. [Database Setup](#database-setup)
4. [Application Integration](#application-integration)
5. [Testing](#testing)
6. [Production Deployment](#production-deployment)
7. [Monitoring Setup](#monitoring-setup)

---

## Prerequisites

### Required Services
- PostgreSQL 13+ or MongoDB 5+
- Redis 6+
- Node.js 18+
- ClamAV (for virus scanning)
- SMTP Server (for email)

### Install Dependencies

```bash
npm install bcrypt jsonwebtoken express express-rate-limit rate-limit-redis redis helmet \
  cors cookie-parser express-session connect-redis multer file-type sharp zod dompurify \
  jsdom speakeasy qrcode nodemailer winston winston-daily-rotate-file morgan pg uuid \
  axios @sentry/node clamscan
```

---

## Environment Setup

### 1. Copy and Configure Environment Variables

```bash
cp .env.example .env
```

### 2. Generate Secure Secrets

```bash
# Generate JWT secrets (32+ characters)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Generate encryption key (exactly 32 characters)
node -e "console.log(require('crypto').randomBytes(16).toString('hex'))"
```

### 3. Configure .env File

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/websitecloner
TEST_DATABASE_URL=postgresql://user:password@localhost:5432/websitecloner_test

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password
REDIS_DB=0

# JWT (use generated secrets from step 2)
JWT_ACCESS_SECRET=your_generated_access_secret_here
JWT_REFRESH_SECRET=your_generated_refresh_secret_here
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

# Encryption (exactly 32 characters!)
ENCRYPTION_KEY=your_generated_32char_key_here!!
ENCRYPTION_ALGORITHM=aes-256-gcm

# Email/SMTP
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_email@example.com
SMTP_PASSWORD=your_app_password
EMAIL_FROM=noreply@websitecloner.pro

# Application
APP_URL=http://localhost:3000
NODE_ENV=development

# Security
PASSWORD_MIN_LENGTH=12
PASSWORD_REQUIRE_UPPERCASE=true
PASSWORD_REQUIRE_LOWERCASE=true
PASSWORD_REQUIRE_NUMBERS=true
PASSWORD_REQUIRE_SPECIAL=true
BCRYPT_ROUNDS=12
MAX_LOGIN_ATTEMPTS=5
LOCKOUT_DURATION=900000

# Session
SESSION_SECRET=your_session_secret_here
SESSION_NAME=wcp_session
SESSION_MAX_AGE=1800000
MAX_SESSIONS_PER_USER=3

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_AUTH_MAX=5
RATE_LIMIT_AUTH_WINDOW=900000

# CORS
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:5000

# File Uploads
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=10485760
MAX_FILES_PER_UPLOAD=10

# ClamAV
CLAMAV_HOST=localhost
CLAMAV_PORT=3310

# API Keys
API_KEY_RATE_LIMIT=1000

# MFA
MFA_ISSUER=Website Cloner Pro
TOTP_WINDOW=1
BACKUP_CODES_COUNT=10

# Logging
LOG_LEVEL=info
LOG_DIR=./logs

# Sentry (optional)
SENTRY_DSN=your_sentry_dsn_here
SENTRY_TRACES_SAMPLE_RATE=0.1

# Webhooks
WEBHOOK_SECRET=your_webhook_secret_here
```

---

## Database Setup

### 1. Run Migrations

```bash
# Install database migrations tool
npm install -g db-migrate db-migrate-pg

# Run migrations
psql -U your_user -d websitecloner -f database/migrations/001_init.sql
psql -U your_user -d websitecloner -f database/migrations/002_add_2fa.sql
psql -U your_user -d websitecloner -f database/migrations/003_rbac_and_audit.sql
```

### 2. Verify Tables Created

```sql
-- Connect to database
psql -U your_user -d websitecloner

-- List all tables
\dt

-- Expected tables:
-- users
-- refresh_tokens
-- mfa_sessions
-- roles
-- permissions
-- role_permissions
-- user_roles
-- audit_logs
-- security_events
-- api_keys
-- api_key_usage
```

### 3. Create Admin User (Optional)

```sql
-- Create admin user with default role
INSERT INTO users (email, password_hash, email_verified, first_name, last_name)
VALUES (
  'admin@example.com',
  '$2b$12$...',  -- Use bcrypt to hash password
  TRUE,
  'Admin',
  'User'
)
RETURNING id;

-- Assign admin role (replace user_id with returned ID)
INSERT INTO user_roles (user_id, role_id, assigned_by)
SELECT 'user_id_here', id, 'user_id_here'
FROM roles
WHERE name = 'admin';
```

---

## Application Integration

### 1. Update Server Entry Point

Create or update `src/server/index.ts`:

```typescript
import express from 'express';
import cookieParser from 'cookie-parser';
import { Pool } from 'pg';

// Import all middleware
import { applySecurityHeaders } from './middleware/security-headers.middleware';
import { corsMiddleware } from './middleware/cors.middleware';
import { generalLimiter, authLimiter } from './middleware/rate-limit.middleware';
import { generateCSRFToken } from './middleware/csrf.middleware';
import { errorHandler, notFoundHandler, handleUncaughtException, handleUnhandledRejection } from './middleware/error.middleware';
import { initializeSentry } from './services/logger.service';

// Import routes
import authRoutes from './routes/auth.routes';
import mfaRoutes from './routes/mfa.routes';

const app = express();
const PORT = process.env.PORT || 5000;

// Initialize error handlers
handleUncaughtException();
handleUnhandledRejection();

// Initialize Sentry
initializeSentry();

// Security headers (apply first)
app.use(applySecurityHeaders);

// CORS
app.use(corsMiddleware);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Cookie parser
app.use(cookieParser());

// CSRF token generation
app.use(generateCSRFToken);

// Rate limiting
app.use(generalLimiter);

// Health check (no auth required)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/mfa', mfaRoutes);

// 404 handler
app.use(notFoundHandler);

// Global error handler (must be last)
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
});

export default app;
```

### 2. Protected Route Example

```typescript
import { Router } from 'express';
import { authenticate } from './middleware/auth.middleware';
import { requirePermission } from './middleware/rbac.middleware';
import { verifyCSRFToken } from './middleware/csrf.middleware';
import { validate } from './middleware/validation.middleware';
import { createProjectSchema } from './schemas/project.schemas';

const router = Router();

// Protected route with RBAC
router.post(
  '/projects',
  authenticate,
  requirePermission('projects', 'create'),
  verifyCSRFToken,
  validate(createProjectSchema),
  async (req, res) => {
    // Your logic here
  }
);

export default router;
```

### 3. API Key Protected Route Example

```typescript
import { Router } from 'express';
import { authenticateAPIKey, requireAPIScope } from './middleware/api-key.middleware';

const router = Router();

router.get(
  '/api/v1/projects',
  authenticateAPIKey,
  requireAPIScope('projects:read'),
  async (req, res) => {
    // Your logic here
  }
);

export default router;
```

---

## Testing

### 1. Run Security Tests

```bash
# Install testing dependencies
npm install --save-dev jest @types/jest supertest ts-jest

# Configure Jest (jest.config.js)
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
  ],
};

# Run tests
npm test

# Run with coverage
npm test -- --coverage
```

### 2. Manual Security Testing

```bash
# Test authentication
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"TestPass123!@#"}'

# Test rate limiting (should block after 5 attempts)
for i in {1..10}; do
  curl -X POST http://localhost:5000/api/auth/login \
    -H "Content-Type: application/json" \
    -d '{"email":"test@example.com","password":"wrong"}'
done

# Test CSRF protection
curl -X POST http://localhost:5000/api/projects \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{"name":"Test"}'
# Should fail without CSRF token
```

### 3. Penetration Testing

```bash
# Install OWASP ZAP or Burp Suite
# Run automated security scan
# Check for:
# - SQL Injection
# - XSS
# - CSRF
# - Broken Authentication
# - Security Misconfiguration
```

---

## Production Deployment

### 1. Pre-deployment Checklist

- [ ] All environment variables configured
- [ ] Database migrations run
- [ ] HTTPS/SSL configured
- [ ] Redis configured and secured
- [ ] ClamAV running
- [ ] Sentry configured
- [ ] Logs directory created
- [ ] File upload directory secured
- [ ] Rate limits configured
- [ ] CORS origins restricted
- [ ] Admin user created
- [ ] Backup strategy in place

### 2. Security Hardening

```bash
# Disable directory listing
# Configure firewall rules
# Enable fail2ban
# Set up automated backups
# Configure log rotation
# Enable intrusion detection
```

### 3. Docker Deployment (Optional)

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy application
COPY . .

# Build TypeScript
RUN npm run build

# Expose port
EXPOSE 5000

# Run application
CMD ["node", "dist/server/index.js"]
```

---

## Monitoring Setup

### 1. Configure Sentry

```typescript
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 0.1,
});
```

### 2. Set Up Log Monitoring

```bash
# Install log aggregation tool (e.g., ELK stack, Datadog)
# Configure Winston to send logs
# Set up alerts for:
# - Failed authentication attempts (>5 in 5 minutes)
# - Rate limit violations
# - Security events (high/critical severity)
# - Error rates
```

### 3. Security Metrics Dashboard

Monitor:
- Authentication success/failure rates
- Rate limit violations
- API key usage
- Security event trends
- Failed authorization attempts
- Audit log volume

---

## Maintenance

### Daily Tasks
- Review security event logs
- Check rate limit violations
- Monitor failed authentication attempts

### Weekly Tasks
- Review audit logs for unusual activity
- Check API key usage statistics
- Update dependencies (`npm audit fix`)

### Monthly Tasks
- Rotate API keys
- Review and update RBAC permissions
- Security audit
- Performance review
- Update documentation

---

## Troubleshooting

### Common Issues

**Issue: JWT token expired**
```
Solution: Implement refresh token flow in frontend
```

**Issue: CSRF token mismatch**
```
Solution: Ensure CSRF token is sent in header or body
```

**Issue: Rate limit exceeded**
```
Solution: Implement exponential backoff in client
```

**Issue: ClamAV not responding**
```bash
# Restart ClamAV
sudo systemctl restart clamav-daemon
```

**Issue: Redis connection failed**
```bash
# Check Redis status
redis-cli ping
```

---

## Support & Resources

- **Documentation**: See individual markdown files for each feature
- **Security Issues**: security@websitecloner.pro
- **OWASP Guidelines**: https://owasp.org/www-project-top-ten/
- **Security Best Practices**: https://cheatsheetseries.owasp.org/

---

## Security Checklist

✅ All dependencies installed
✅ Environment variables configured
✅ Database migrations run
✅ HTTPS enabled
✅ Rate limiting active
✅ CSRF protection enabled
✅ Security headers configured
✅ Input validation implemented
✅ Authentication working
✅ MFA available
✅ RBAC configured
✅ Audit logging active
✅ Error handling configured
✅ File upload security enabled
✅ API keys working
✅ Webhooks secured
✅ Monitoring configured
✅ Tests passing
✅ Backup strategy in place
✅ Security scan completed

---

**Last Updated**: 2025-10-15
**Version**: 1.0.0
