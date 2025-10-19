# Custom Domain Preview

Comprehensive guide to custom domain preview functionality including subdomain assignment, DNS configuration, and SSL certificate handling.

## Table of Contents
- [Overview](#overview)
- [Features](#features)
- [Subdomain Assignment](#subdomain-assignment)
- [Custom Domains](#custom-domains)
- [DNS Configuration](#dns-configuration)
- [SSL Certificates](#ssl-certificates)
- [Web Server Configuration](#web-server-configuration)
- [API Reference](#api-reference)
- [Usage Examples](#usage-examples)
- [Best Practices](#best-practices)

---

## Overview

Website Cloner Pro's **Custom Domain Preview** service allows users to preview cloned websites on temporary subdomains or custom domains with automatic SSL certificate handling.

### Key Features

✅ **Temporary Subdomain Assignment**
- Random subdomain generation
- Custom subdomain selection
- Automatic SSL (Let's Encrypt)
- Configurable expiration (default 30 days)

✅ **Custom Domain Support**
- DNS verification
- Multiple SSL providers
- Automatic configuration generation
- WWW subdomain support

✅ **SSL Certificate Handling**
- Let's Encrypt (free, automatic)
- Cloudflare SSL
- Manual certificate support
- Auto-renewal

✅ **Domain Management**
- Password protection
- IP whitelisting
- Custom headers
- Cache control
- Compression

---

## Features

### 1. Subdomain Structure

**Base Domain:** `preview.websitecloner.pro`

**Generated Subdomains:**
- Pattern: `adjective-noun-number`
- Examples: `quick-fox-1234.preview.websitecloner.pro`
- Automatic SSL via Let's Encrypt
- Expires after 30 days (configurable)

**Custom Subdomains:**
- User-selected names
- Sanitized automatically
- Availability check
- Example: `myproject.preview.websitecloner.pro`

### 2. Domain Status

**Status Types:**
- `pending` - Setup in progress
- `active` - Ready and accessible
- `expired` - Past expiration date
- `error` - Configuration error

**SSL Status:**
- `pending` - Certificate being issued
- `issued` - SSL active
- `error` - Certificate error

### 3. Domain Settings

```typescript
{
  passwordProtected: boolean,    // Require password
  password: string,               // Access password
  allowedIPs: string[],          // IP whitelist
  customHeaders: object,          // Custom HTTP headers
  redirects: array,              // URL redirects
  cacheEnabled: boolean,         // Enable caching
  compressionEnabled: boolean    // Enable gzip
}
```

---

## Subdomain Assignment

### Creating a Subdomain

**Request:**
```typescript
{
  projectId: 'proj_123',
  userId: 'user_456',
  preferredSubdomain: 'myproject',  // Optional
  expirationDays: 30,               // Optional
  settings: {
    passwordProtected: false,
    cacheEnabled: true,
    compressionEnabled: true
  }
}
```

**Response:**
```typescript
{
  id: 'domain_789',
  subdomain: 'myproject',
  fullDomain: 'myproject.preview.websitecloner.pro',
  status: 'pending',
  sslStatus: 'pending',
  createdAt: '2024-01-15T10:00:00Z',
  expiresAt: '2024-02-14T10:00:00Z',
  settings: {...}
}
```

### Subdomain Naming Rules

**Allowed Characters:**
- Lowercase letters (a-z)
- Numbers (0-9)
- Hyphens (-)

**Restrictions:**
- Max length: 63 characters
- Cannot start/end with hyphen
- Cannot have consecutive hyphens
- Must be unique

**Auto-Sanitization:**
```
Input:  My_Project#123
Output: my-project-123

Input:  Amazing--Site!!!
Output: amazing-site

Input:  Test___Website
Output: test-website
```

### Subdomain Expiration

**Default:** 30 days

**Extension:**
- Extend by 7, 14, 30, or 60 days
- Max total: 90 days
- Notification before expiration

**After Expiration:**
- Status changes to `expired`
- Preview becomes inaccessible
- Data retained for 7 days
- Can be extended if within grace period

---

## Custom Domains

### Adding a Custom Domain

**Prerequisites:**
1. Own a domain
2. Access to DNS settings
3. Existing preview subdomain

**Process:**
1. Create preview subdomain first
2. Configure DNS records
3. Verify DNS configuration
4. Add custom domain
5. SSL certificate issued automatically

### DNS Requirements

**Required Records:**

**A Record:**
```
Type: A
Name: @ (or yourdomain.com)
Value: SERVER_IP
TTL: 3600
```

**CNAME Record (Optional):**
```
Type: CNAME
Name: www
Value: yourdomain.com
TTL: 3600
```

### DNS Verification

**Verification Checks:**
- A record points to correct IP
- DNS propagation complete
- Domain resolves correctly
- No conflicting records

**Propagation Time:**
- Minimum: 5-10 minutes
- Typical: 1-2 hours
- Maximum: 48 hours

**Verification Status:**
```typescript
{
  domain: 'example.com',
  verified: true,
  records: [
    {
      type: 'A',
      name: 'example.com',
      value: '1.2.3.4'
    }
  ],
  requiredRecords: [...],
  missingRecords: [],
  issues: []
}
```

---

## DNS Configuration

### Popular DNS Providers

**Cloudflare:**
1. Log in to Cloudflare dashboard
2. Select domain
3. DNS settings
4. Add A record: `@` → `SERVER_IP`
5. Add CNAME: `www` → `example.com`
6. Orange cloud OFF (DNS only)

**GoDaddy:**
1. GoDaddy.com → My Products
2. Click DNS next to domain
3. Add A record
4. Type: A, Name: @, Value: SERVER_IP
5. Add CNAME for www
6. Save

**Namecheap:**
1. Domain List → Manage
2. Advanced DNS tab
3. Add New Record
4. Type: A Record
5. Host: @, Value: SERVER_IP
6. Save

**AWS Route 53:**
1. Route 53 → Hosted Zones
2. Select domain
3. Create Record
4. Record type: A
5. Value: SERVER_IP
6. Create

### DNS Troubleshooting

**Issue: DNS not propagating**
- **Solution:** Wait 2-4 hours, check with `dig` command
- **Command:** `dig example.com +short`

**Issue: Wrong IP address**
- **Solution:** Update A record, clear DNS cache
- **Cache:** `ipconfig /flushdns` (Windows) or `sudo dscacheutil -flushcache` (Mac)

**Issue: Certificate error**
- **Solution:** Ensure DNS points correctly before requesting SSL
- **Check:** Visit domain in browser, verify SSL status

---

## SSL Certificates

### SSL Providers

**1. Let's Encrypt (Recommended)**

**Pros:**
- ✅ Completely free
- ✅ Automatic renewal
- ✅ Trusted by browsers
- ✅ Easy setup

**Cons:**
- ❌ 90-day validity
- ❌ Requires server access
- ❌ Rate limits (50 certs/week)

**Setup:**
```bash
# Install Certbot
sudo apt-get install certbot python3-certbot-nginx

# Request certificate
sudo certbot --nginx -d example.com -d www.example.com

# Test auto-renewal
sudo certbot renew --dry-run
```

---

**2. Cloudflare SSL**

**Pros:**
- ✅ Free with Cloudflare
- ✅ Automatic management
- ✅ DDoS protection
- ✅ CDN included

**Cons:**
- ❌ Requires Cloudflare nameservers
- ❌ Additional complexity
- ❌ Some features paid

**Setup:**
1. Add domain to Cloudflare
2. Update nameservers
3. Enable SSL (Full mode)
4. Install origin certificate on server

---

**3. Manual/Commercial SSL**

**Pros:**
- ✅ 1-2 year validity
- ✅ Extended validation
- ✅ Organization validation
- ✅ Full control

**Cons:**
- ❌ Cost ($50-$300/year)
- ❌ Manual renewal
- ❌ Complex setup
- ❌ CSR generation

**Setup:**
```bash
# Generate CSR
openssl req -new -newkey rsa:2048 -nodes \
  -keyout example.com.key \
  -out example.com.csr

# Submit CSR to SSL provider
# Receive certificate files
# Install on server
```

### SSL Setup Process

**Let's Encrypt Steps:**

**Step 1:** Install Certbot
```bash
sudo apt-get install certbot python3-certbot-nginx
```

**Step 2:** Request Certificate
```bash
sudo certbot --nginx -d example.com -d www.example.com
```

**Step 3:** Verify Installation
```bash
curl -I https://example.com
```

**Step 4:** Auto-Renewal
```bash
# Test renewal
sudo certbot renew --dry-run

# Cron job (automatic)
0 0,12 * * * root python -c 'import random; import time; time.sleep(random.random() * 3600)' && certbot renew -q
```

### SSL Certificate Renewal

**Let's Encrypt:**
- Validity: 90 days
- Auto-renewal: 30 days before expiration
- Cron job runs twice daily
- Email notifications

**Cloudflare:**
- Automatic renewal
- No action required
- Origin certificate: 15 years

**Manual:**
- Manual renewal required
- Set calendar reminder
- Renewal 30 days before expiration

---

## Web Server Configuration

### Nginx Configuration

**Generated Config:**
```nginx
# HTTP to HTTPS redirect
server {
    listen 80;
    server_name example.com www.example.com;
    return 301 https://$host$request_uri;
}

# HTTPS server
server {
    listen 443 ssl http2;
    server_name example.com www.example.com;

    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    # Root directory
    root /var/www/previews/proj_123;
    index index.html;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Gzip compression
    gzip on;
    gzip_types text/plain text/css application/json application/javascript;

    # Cache static assets
    location ~* \.(jpg|jpeg|png|gif|css|js|svg|woff|woff2)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Main location
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

### Apache Configuration

**Generated Config:**
```apache
# HTTP VirtualHost
<VirtualHost *:80>
    ServerName example.com
    ServerAlias www.example.com

    RewriteEngine On
    RewriteCond %{HTTPS} off
    RewriteRule ^(.*)$ https://%{HTTP_HOST}$1 [R=301,L]
</VirtualHost>

# HTTPS VirtualHost
<VirtualHost *:443>
    ServerName example.com
    ServerAlias www.example.com
    DocumentRoot /var/www/previews/proj_123

    # SSL Configuration
    SSLEngine on
    SSLCertificateFile /etc/letsencrypt/live/example.com/fullchain.pem
    SSLCertificateKeyFile /etc/letsencrypt/live/example.com/privkey.pem
    SSLProtocol all -SSLv3 -TLSv1 -TLSv1.1

    # Security Headers
    Header always set X-Frame-Options "SAMEORIGIN"
    Header always set X-Content-Type-Options "nosniff"

    # Compression
    <IfModule mod_deflate.c>
        AddOutputFilterByType DEFLATE text/html text/plain text/css application/javascript
    </IfModule>

    # Cache Control
    <IfModule mod_expires.c>
        ExpiresActive On
        ExpiresByType image/* "access plus 1 year"
        ExpiresByType text/css "access plus 1 month"
    </IfModule>

    # Directory settings
    <Directory /var/www/previews/proj_123>
        Options -Indexes +FollowSymLinks
        AllowOverride All
        Require all granted
    </Directory>
</VirtualHost>
```

### Password Protection

**Nginx:**
```nginx
# In server block
auth_basic "Preview Access";
auth_basic_user_file /etc/nginx/.htpasswd_domain_123;
```

**Create password file:**
```bash
htpasswd -c /etc/nginx/.htpasswd_domain_123 username
```

**Apache:**
```apache
<Directory /var/www/previews/proj_123>
    AuthType Basic
    AuthName "Preview Access"
    AuthUserFile /etc/apache2/.htpasswd_domain_123
    Require valid-user
</Directory>
```

---

## API Reference

### 1. Create Subdomain

**Endpoint:** `POST /api/custom-domain-preview/create-subdomain`

**Request:**
```json
{
  "projectId": "proj_123",
  "userId": "user_456",
  "preferredSubdomain": "myproject",
  "expirationDays": 30,
  "settings": {
    "passwordProtected": false,
    "cacheEnabled": true,
    "compressionEnabled": true
  }
}
```

**Response:**
```json
{
  "success": true,
  "domain": {
    "id": "domain_789",
    "subdomain": "myproject",
    "fullDomain": "myproject.preview.websitecloner.pro",
    "status": "pending",
    "sslStatus": "pending",
    "createdAt": "2024-01-15T10:00:00Z",
    "expiresAt": "2024-02-14T10:00:00Z"
  },
  "previewUrl": "https://myproject.preview.websitecloner.pro"
}
```

---

### 2. Add Custom Domain

**Endpoint:** `POST /api/custom-domain-preview/add-custom-domain`

**Request:**
```json
{
  "previewDomainId": "domain_789",
  "customDomain": "example.com",
  "sslProvider": "letsencrypt"
}
```

**Response:**
```json
{
  "success": true,
  "domain": {
    "id": "domain_789",
    "customDomain": "example.com",
    "status": "active",
    "sslStatus": "issued"
  },
  "previewUrl": "https://example.com"
}
```

---

### 3. Verify DNS

**Endpoint:** `POST /api/custom-domain-preview/verify-dns`

**Request:**
```json
{
  "domain": "example.com"
}
```

**Response:**
```json
{
  "success": true,
  "verification": {
    "domain": "example.com",
    "verified": true,
    "records": [
      {
        "type": "A",
        "name": "example.com",
        "value": "1.2.3.4"
      }
    ],
    "requiredRecords": [...],
    "missingRecords": [],
    "issues": []
  }
}
```

---

### 4. Get SSL Setup

**Endpoint:** `POST /api/custom-domain-preview/ssl-setup`

**Request:**
```json
{
  "domain": "example.com",
  "provider": "letsencrypt"
}
```

**Response:**
```json
{
  "success": true,
  "sslSetup": {
    "domain": "example.com",
    "provider": "letsencrypt",
    "status": "pending",
    "steps": [
      {
        "step": 1,
        "title": "Install Certbot",
        "description": "Install Certbot for certificate management",
        "status": "pending",
        "command": "sudo apt-get install certbot"
      }
    ],
    "instructions": [
      "Ensure port 80 and 443 are open",
      "Domain must be publicly accessible"
    ]
  }
}
```

---

### 5. Get Domain Configuration

**Endpoint:** `GET /api/custom-domain-preview/:domainId/configuration`

**Response:**
```json
{
  "success": true,
  "configuration": {
    "domain": {...},
    "dnsConfiguration": {
      "provider": "cloudflare",
      "records": [...],
      "instructions": [...],
      "verificationStatus": "pending"
    },
    "sslConfiguration": {...},
    "nginxConfiguration": "server { ... }",
    "apacheConfiguration": "<VirtualHost> ... </VirtualHost>"
  }
}
```

---

## Usage Examples

### Example 1: Create Preview Subdomain

```javascript
const response = await fetch('/api/custom-domain-preview/create-subdomain', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    projectId: 'proj_123',
    userId: 'user_456',
    preferredSubdomain: 'my-awesome-project',
    expirationDays: 30
  })
});

const { domain, previewUrl } = await response.json();

console.log('✅ Preview Created!');
console.log(`Subdomain: ${domain.subdomain}`);
console.log(`Full Domain: ${domain.fullDomain}`);
console.log(`Preview URL: ${previewUrl}`);
console.log(`Expires: ${new Date(domain.expiresAt).toLocaleDateString()}`);
console.log(`SSL Status: ${domain.sslStatus}`);

// Wait for SSL to be issued
if (domain.sslStatus === 'pending') {
  console.log('⏳ SSL certificate being issued...');
  // Poll for status updates
}
```

---

### Example 2: Add Custom Domain

```javascript
// Step 1: Verify DNS first
const dnsCheck = await fetch('/api/custom-domain-preview/verify-dns', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    domain: 'example.com'
  })
});

const { verification } = await dnsCheck.json();

if (!verification.verified) {
  console.error('❌ DNS not configured correctly');
  console.log('Missing records:');
  verification.missingRecords.forEach(record => {
    console.log(`  ${record.type}: ${record.name} → ${record.value}`);
  });
  console.log('\nIssues:');
  verification.issues.forEach(issue => {
    console.log(`  - ${issue}`);
  });
  return;
}

// Step 2: Add custom domain
const response = await fetch('/api/custom-domain-preview/add-custom-domain', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    previewDomainId: 'domain_789',
    customDomain: 'example.com',
    sslProvider: 'letsencrypt'
  })
});

const { domain } = await response.json();

console.log('✅ Custom domain added!');
console.log(`Domain: ${domain.customDomain}`);
console.log(`Status: ${domain.status}`);
console.log(`SSL: ${domain.sslStatus}`);
```

---

## Best Practices

### 1. DNS Configuration

✅ **DO:**
- Set TTL to 3600 (1 hour) for A records
- Add both @ and www records
- Wait for propagation before adding domain
- Use DNS verification before SSL request
- Keep DNS provider credentials secure

❌ **DON'T:**
- Use very high TTL (makes changes slow)
- Forget www subdomain
- Request SSL before DNS propagates
- Share DNS credentials

---

### 2. SSL Certificates

✅ **DO:**
- Use Let's Encrypt for free SSL
- Enable auto-renewal
- Test renewal process
- Monitor expiration dates
- Use strong cipher suites

❌ **DON'T:**
- Use self-signed certificates in production
- Forget to renew certificates
- Use outdated SSL protocols (SSLv3, TLS 1.0)
- Expose private keys

---

### 3. Preview Security

✅ **DO:**
- Use password protection for sensitive previews
- Enable HTTPS always
- Set proper security headers
- Implement IP whitelisting if needed
- Regular security audits

❌ **DON'T:**
- Leave sensitive data in previews
- Use weak passwords
- Expose admin panels
- Skip security headers

---

### 4. Domain Management

✅ **DO:**
- Set appropriate expiration times
- Clean up expired domains
- Monitor domain usage
- Document custom domain setup
- Keep contact information updated

❌ **DON'T:**
- Let domains expire unexpectedly
- Create too many unused domains
- Forget to extend important previews
- Ignore expiration notifications

---

## Troubleshooting

### Issue: Subdomain already taken

**Solution:** Try different name or use auto-generated
```javascript
// Let system generate random subdomain
{
  projectId: 'proj_123',
  userId: 'user_456'
  // No preferredSubdomain
}
```

---

### Issue: DNS verification fails

**Causes:**
- DNS not propagated yet
- Wrong IP address
- Missing records

**Solutions:**
```bash
# Check DNS propagation
dig example.com +short
nslookup example.com

# Wait and retry
# Propagation can take 1-48 hours
```

---

### Issue: SSL certificate error

**Causes:**
- DNS not pointing correctly
- Port 80/443 blocked
- Rate limit exceeded

**Solutions:**
1. Verify DNS is correct
2. Check firewall rules
3. Wait if rate limited (1 week)
4. Use staging environment for testing

---

## Conclusion

Website Cloner Pro's **Custom Domain Preview** provides comprehensive domain management:

- ✅ **Temporary subdomains** with auto-SSL
- ✅ **Custom domain support** with DNS verification
- ✅ **3 SSL providers** (Let's Encrypt, Cloudflare, Manual)
- ✅ **Web server configs** (Nginx & Apache)
- ✅ **Domain settings** (password, cache, compression)
- ✅ **12 API endpoints** for complete domain management

Perfect for client previews, staging environments, and temporary deployments.

---

*Generated by Website Cloner Pro - Custom Domain Preview*
