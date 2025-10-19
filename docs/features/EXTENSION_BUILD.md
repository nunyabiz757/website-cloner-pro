# Browser Extension Build Guide

**Status**: ✅ Complete
**Section**: 12 - Production URL Configuration

## Overview

The Website Cloner Pro browser extension now supports environment-based configuration, allowing you to build separate development and production versions with different API URLs.

## Problem Solved

**Before**:
```javascript
// extension/background.js
const API_BASE_URL = 'http://localhost:3000/api'; // TODO: Update for production
```

**After**:
```javascript
// extension/background.js
import { config } from './config.js';
const API_BASE_URL = config.apiBaseUrl; // Automatically configured based on environment
```

## Files Created

### 1. [extension/config.js](extension/config.js)
Environment-aware configuration module that:
- Detects development vs production builds
- Provides API base URL from environment variables
- Includes feature flags (logging, debugging, etc.)
- Freezes configuration to prevent runtime modifications

### 2. [scripts/build-extension.js](scripts/build-extension.js)
Build script that:
- Copies extension files to `dist-extension/`
- Replaces environment placeholders in config.js
- Updates manifest.json with production host_permissions
- Creates distributable ZIP file
- Validates production builds (requires VITE_API_URL, no localhost)

## Files Modified

### [extension/background.js](extension/background.js)
- **Line 13**: Added `import { config } from './config.js';`
- **Line 15**: Changed to `const API_BASE_URL = config.apiBaseUrl;`
- **Lines 18-24**: Added debug logging for configuration

### [package.json](package.json)
- **Line 12**: Added `"build:extension": "NODE_ENV=development node scripts/build-extension.js"`
- **Line 13**: Added `"build:extension:prod": "NODE_ENV=production node scripts/build-extension.js"`

## Usage

### Development Build

For local development with localhost API:

```bash
npm run build:extension
```

**Output**:
- `dist-extension/` - Development extension files
- `extension-development-{timestamp}.zip` - Packaged extension
- API URL: `http://localhost:3000/api`

**Loading in Chrome**:
1. Open `chrome://extensions/`
2. Enable "Developer mode" (toggle in top-right)
3. Click "Load unpacked"
4. Select `dist-extension/` directory

### Production Build

For production deployment with custom API URL:

```bash
VITE_API_URL=https://api.yoursite.com npm run build:extension:prod
```

**Output**:
- `dist-extension/` - Production extension files
- `extension-production-{timestamp}.zip` - Packaged extension
- API URL: `https://api.yoursite.com` (from environment variable)

**Validation**:
- ✅ Requires `VITE_API_URL` environment variable
- ✅ Rejects localhost URLs in production builds
- ✅ Updates manifest.json host_permissions automatically

### Custom Version Override

```bash
VITE_API_URL=https://api.yoursite.com EXTENSION_VERSION=1.1.0 npm run build:extension:prod
```

## Configuration Reference

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `NODE_ENV` | No | `development` | Build environment (development/production) |
| `VITE_API_URL` | **Yes** (prod) | `http://localhost:3000/api` | Production API base URL |
| `EXTENSION_VERSION` | No | From manifest.json | Override extension version |

### config.js Structure

The generated config.js exports a frozen configuration object:

```javascript
export const config = {
  environment: 'production',
  apiBaseUrl: 'https://api.yoursite.com',
  debug: false,
  version: '1.0.0',
  features: {
    logging: false,
    verboseErrors: false,
    performanceMonitoring: true,
  },
};
```

**In Development**:
- `environment`: `'development'`
- `apiBaseUrl`: `'http://localhost:3000/api'`
- `debug`: `true`
- `features.logging`: `true`
- `features.verboseErrors`: `true`
- `features.performanceMonitoring`: `false`

**In Production**:
- `environment`: `'production'`
- `apiBaseUrl`: `process.env.VITE_API_URL`
- `debug`: `false`
- `features.logging`: `false`
- `features.verboseErrors`: `false`
- `features.performanceMonitoring`: `true`

### Build Process Details

The build script performs these steps:

1. **Validate Environment**
   - Check NODE_ENV
   - For production: require VITE_API_URL
   - Reject localhost in production

2. **Create Distribution Directory**
   - Remove old `dist-extension/`
   - Create fresh directory

3. **Copy Extension Files**
   - background.js
   - content.js
   - popup.html, popup.css, popup.js
   - manifest.json
   - icons/ directory

4. **Process config.js**
   - Replace `__ENV__` with actual environment
   - Replace `__API_BASE_URL__` with actual URL
   - Write to dist-extension/config.js

5. **Update manifest.json**
   - For production: add API domain to host_permissions
   - For production: remove localhost from host_permissions
   - Set version if EXTENSION_VERSION provided

6. **Create ZIP Package**
   - Archive entire dist-extension/
   - Name: `extension-{env}-{timestamp}.zip`
   - Compression level: 9 (maximum)

## manifest.json Host Permissions

### Development

```json
{
  "host_permissions": [
    "https://*.gohighlevel.com/*",
    "https://*.highlevelsite.com/*",
    "https://*.leadconnectorhq.com/*",
    "https://*.msgsndr.com/*",
    "http://localhost:*/*",
    "https://*/api/ghl/*"
  ]
}
```

### Production

Automatically updated based on VITE_API_URL:

```json
{
  "host_permissions": [
    "https://*.gohighlevel.com/*",
    "https://*.highlevelsite.com/*",
    "https://*.leadconnectorhq.com/*",
    "https://*.msgsndr.com/*",
    "https://api.yoursite.com/*"
  ]
}
```

**Note**: `localhost` is removed in production builds.

## Distribution

### Chrome Web Store

1. **Build Production Extension**:
   ```bash
   VITE_API_URL=https://api.yoursite.com npm run build:extension:prod
   ```

2. **Test Locally**:
   - Load from `dist-extension/` in Chrome
   - Verify API URL points to production
   - Test all functionality

3. **Upload to Chrome Web Store**:
   - Go to [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole)
   - Click "New item"
   - Upload `extension-production-{timestamp}.zip`
   - Fill in store listing details
   - Submit for review

### Manual Distribution

For enterprise or private distribution:

1. **Build and Package**:
   ```bash
   VITE_API_URL=https://api.yourcompany.com npm run build:extension:prod
   ```

2. **Distribute ZIP File**:
   - Share `extension-production-{timestamp}.zip`
   - Users extract and load unpacked

3. **Chrome Enterprise Policy**:
   - Use Chrome's [ExtensionInstallForcelist](https://chromeenterprise.google/policies/#ExtensionInstallForcelist) policy
   - Host .crx file on internal server
   - Auto-install for all users

## Examples

### Example 1: Development Build

```bash
# Build for local development
npm run build:extension

# Output:
# ✅ Created dist-extension/ with localhost API
# ✅ Created extension-development-1234567890.zip
```

### Example 2: Production Build

```bash
# Build for production
VITE_API_URL=https://api.websiteclonerpro.com npm run build:extension:prod

# Output:
# ✅ Validated production URL (no localhost)
# ✅ Updated manifest.json host_permissions
# ✅ Created dist-extension/ with production API
# ✅ Created extension-production-1234567890.zip
```

### Example 3: Staging Build

```bash
# Build for staging environment
VITE_API_URL=https://staging-api.websiteclonerpro.com NODE_ENV=production npm run build:extension:prod

# Output:
# ✅ Created dist-extension/ with staging API
# ✅ Created extension-production-1234567890.zip
```

### Example 4: Version Override

```bash
# Build production with custom version
VITE_API_URL=https://api.websiteclonerpro.com EXTENSION_VERSION=2.0.0 npm run build:extension:prod

# manifest.json will show:
# "version": "2.0.0"
```

## Error Handling

### Error: VITE_API_URL required

```
❌ Error: VITE_API_URL environment variable is required for production builds

Example:
  VITE_API_URL=https://api.yoursite.com npm run build:extension:prod
```

**Solution**: Set VITE_API_URL environment variable.

### Error: Production build cannot use localhost

```
❌ Error: Production build cannot use localhost URL
  Current URL: http://localhost:3000/api
```

**Solution**: Use a production domain in VITE_API_URL.

### Error: Extension not loading

**Symptoms**: Extension loads but can't connect to API

**Solutions**:
1. Check browser console for CORS errors
2. Verify API domain in manifest.json host_permissions
3. Ensure API server is running and accessible
4. Check API server CORS configuration allows extension

## Testing

### Test Development Build

```bash
# Build
npm run build:extension

# Load in Chrome
# 1. chrome://extensions/
# 2. Load unpacked → select dist-extension/

# Test
# 1. Open popup → should connect to localhost:3000
# 2. Check console for debug logs
# 3. Verify badge shows ✓ when connected
```

### Test Production Build

```bash
# Build
VITE_API_URL=https://api.yoursite.com npm run build:extension:prod

# Load in Chrome
# 1. chrome://extensions/
# 2. Load unpacked → select dist-extension/

# Test
# 1. Open popup → should connect to production API
# 2. No debug logs in console (production mode)
# 3. Verify authentication works
# 4. Test clone → paste workflow
```

### Test Checklist

- [ ] Extension loads without errors
- [ ] Badge shows correct status (✓ = connected)
- [ ] Authentication flow works
- [ ] API requests go to correct URL
- [ ] GHL page detection works
- [ ] Clone page functionality works
- [ ] Paste session functionality works
- [ ] No console errors
- [ ] Icons display correctly
- [ ] Context menu appears on GHL sites

## Advanced Configuration

### Multiple Environments

Create environment-specific build scripts:

```json
{
  "scripts": {
    "build:ext:dev": "NODE_ENV=development npm run build:extension",
    "build:ext:staging": "VITE_API_URL=https://staging-api.yoursite.com npm run build:extension:prod",
    "build:ext:prod": "VITE_API_URL=https://api.yoursite.com npm run build:extension:prod"
  }
}
```

### CI/CD Integration

#### GitHub Actions

```yaml
name: Build Extension

on:
  push:
    tags:
      - 'v*'

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'

      - run: npm ci
      - run: npm run build:extension:prod
        env:
          VITE_API_URL: ${{ secrets.PRODUCTION_API_URL }}

      - uses: actions/upload-artifact@v3
        with:
          name: extension
          path: extension-production-*.zip
```

#### GitLab CI

```yaml
build-extension:
  stage: build
  image: node:20
  script:
    - npm ci
    - npm run build:extension:prod
  variables:
    VITE_API_URL: $PRODUCTION_API_URL
  artifacts:
    paths:
      - extension-production-*.zip
  only:
    - tags
```

### Environment File Support

Create `.env.production`:

```bash
VITE_API_URL=https://api.websiteclonerpro.com
EXTENSION_VERSION=1.0.0
```

Load in build script:

```bash
# Load .env.production
source .env.production

# Build
npm run build:extension:prod
```

## Troubleshooting

### Issue: "Module not found: config.js"

**Cause**: Extension loaded before config.js was copied

**Solution**: Rebuild extension:
```bash
npm run build:extension
```

### Issue: API requests failing with CORS error

**Cause**: Production domain not in manifest.json host_permissions

**Solution**: Verify manifest.json in dist-extension/:
```json
{
  "host_permissions": [
    "https://your-production-domain.com/*"
  ]
}
```

### Issue: Extension shows "Update required"

**Cause**: manifest.json version not incremented

**Solution**: Build with version override:
```bash
EXTENSION_VERSION=1.1.0 npm run build:extension:prod
```

## Security Considerations

### API URL Exposure

The API URL is visible in the extension's config.js file. This is expected and not a security risk since:
- Extensions are client-side code
- API URL is necessary for requests
- API should validate all requests server-side

**Best Practices**:
- Always require authentication (JWT tokens)
- Validate all inputs server-side
- Use HTTPS only in production
- Implement rate limiting on API

### Sensitive Data

Never hardcode in config.js:
- ❌ API keys
- ❌ Secret tokens
- ❌ Database credentials
- ❌ Private keys

These should be:
- ✅ Managed server-side only
- ✅ Retrieved via authenticated API calls
- ✅ Stored in chrome.storage.local (encrypted by browser)

## Maintenance

### Update API URL

1. Update production URL:
   ```bash
   VITE_API_URL=https://new-api.yoursite.com npm run build:extension:prod
   ```

2. Test new build locally

3. Publish to Chrome Web Store or distribute new ZIP

### Update Extension Version

In manifest.json:
```json
{
  "version": "1.1.0"
}
```

Or via environment variable:
```bash
EXTENSION_VERSION=1.1.0 npm run build:extension:prod
```

### Migration Path

For existing users:

1. **Backend Support**: Ensure API supports both old and new URLs during migration
2. **Gradual Rollout**: Release new extension version to subset of users
3. **Monitor**: Check error rates and API usage
4. **Complete Migration**: After 30 days, deprecate old API endpoints

## Summary

**Section 12: COMPLETE ✅**

✅ Created environment-based configuration system
✅ Implemented automatic build process
✅ Validated production builds
✅ Updated manifest.json host_permissions
✅ Added npm build scripts
✅ Created comprehensive documentation

The extension now supports seamless development → production deployment with environment-specific API URLs.

**Development**: `npm run build:extension`
**Production**: `VITE_API_URL=https://api.yoursite.com npm run build:extension:prod`
