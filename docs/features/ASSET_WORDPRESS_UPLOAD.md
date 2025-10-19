# WordPress Asset Upload Implementation

Complete implementation of WordPress media library uploads via REST API with media ID tracking and audit logging.

## ✅ What's Implemented

### **1. WordPress REST API Integration** ✅
- Actual media uploads to WordPress
- Media ID storage and tracking
- Multipart/form-data handling
- Connection testing before upload

### **2. Features**
- ✅ Base64 asset decoding
- ✅ Temp file handling
- ✅ Batch upload support
- ✅ Media ID mapping (path → media ID)
- ✅ Error handling per asset
- ✅ Audit logging
- ✅ Automatic cleanup
- ✅ Connection validation

## Quick Start

### 1. Setup WordPress Application Password

See [WORDPRESS_INTEGRATION.md](WORDPRESS_INTEGRATION.md#1-setup-wordpress-application-password)

### 2. Configure Environment Variables

```bash
# .env (optional - can be passed in request)
WP_SITE_URL=https://your-wordpress-site.com
WP_USERNAME=your_username
WP_APP_PASSWORD=xxxx xxxx xxxx xxxx xxxx xxxx
```

### 3. Upload Assets

```http
POST /api/asset-embedding/wordpress-upload
Content-Type: application/json

{
  "assets": {
    "images/logo.png": "iVBORw0KGgoAAAANSU...", // base64
    "images/hero.jpg": "/9j/4AAQSkZJRgAB..."   // base64
  },
  "wordPressConfig": {
    "siteUrl": "https://your-site.com",
    "username": "admin",
    "applicationPassword": "xxxx xxxx xxxx xxxx"
  }
}
```

### 4. Response

```json
{
  "success": true,
  "uploads": [
    {
      "path": "images/logo.png",
      "success": true,
      "wordPressUrl": "https://your-site.com/wp-content/uploads/2025/10/logo.png",
      "mediaId": 123,
      "size": 45678,
      "mimeType": "image/png",
      "title": "logo.png"
    },
    {
      "path": "images/hero.jpg",
      "success": true,
      "wordPressUrl": "https://your-site.com/wp-content/uploads/2025/10/hero.jpg",
      "mediaId": 124,
      "size": 123456,
      "mimeType": "image/jpeg",
      "title": "hero.jpg"
    }
  ],
  "mediaIds": {
    "images/logo.png": 123,
    "images/hero.jpg": 124
  },
  "summary": {
    "total": 2,
    "successful": 2,
    "failed": 0,
    "durationMs": 3456
  }
}
```

## API Reference

### Endpoint

```
POST /api/asset-embedding/wordpress-upload
```

### Request Body

```typescript
{
  assets: Record<string, string>;  // path → base64 content
  wordPressConfig: {
    siteUrl: string;                    // Required
    username?: string;                  // Optional if in env
    applicationPassword?: string;       // Optional if in env
  };
}
```

### Response

```typescript
{
  success: boolean;
  uploads: Array<{
    path: string;
    success: boolean;
    wordPressUrl?: string;      // URL in WordPress
    mediaId?: number;           // WordPress media ID
    size?: number;              // File size in bytes
    mimeType?: string;          // MIME type
    title?: string;             // Media title
    error?: string;             // Error message if failed
  }>;
  mediaIds: Record<string, number>;  // Map of path → media ID
  summary: {
    total: number;
    successful: number;
    failed: number;
    durationMs: number;
  };
  error?: string;  // Only if entire request fails
}
```

## Implementation Details

### Upload Flow

```
1. Validate request (assets, config) ✅
2. Create WordPress API client ✅
3. Test connection to WordPress ✅
4. Create temp directory ✅
5. For each asset:
   a. Decode base64 → Buffer ✅
   b. Write to temp file ✅
   c. Upload via WordPress REST API ✅
   d. Store media ID ✅
   e. Clean up temp file ✅
6. Clean up temp directory ✅
7. Log to audit system ✅
8. Return results + media IDs ✅
```

### WordPress REST API Call

```http
POST https://your-site.com/wp-json/wp/v2/media
Authorization: Basic {base64(username:appPassword)}
Content-Type: multipart/form-data

--boundary
Content-Disposition: form-data; name="file"; filename="logo.png"
Content-Type: image/png

{binary data}
--boundary--
```

### Media ID Storage

The endpoint returns a `mediaIds` object that maps original paths to WordPress media IDs:

```json
{
  "mediaIds": {
    "images/logo.png": 123,
    "images/hero.jpg": 124,
    "assets/icon.svg": 125
  }
}
```

**Use cases:**
- Update post content with WordPress URLs
- Reference uploaded media in page builders
- Track which assets have been uploaded
- Avoid duplicate uploads

## Usage Examples

### Example 1: Upload Single Image

```typescript
const response = await fetch('/api/asset-embedding/wordpress-upload', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    assets: {
      'logo.png': 'iVBORw0KGgoAAAANSU...' // base64
    },
    wordPressConfig: {
      siteUrl: 'https://my-site.com',
      username: 'admin',
      applicationPassword: 'xxxx xxxx'
    }
  })
});

const result = await response.json();

if (result.success) {
  console.log(`Uploaded to: ${result.uploads[0].wordPressUrl}`);
  console.log(`Media ID: ${result.uploads[0].mediaId}`);
}
```

### Example 2: Batch Upload

```typescript
// Prepare assets
const assets = {};
for (const file of imageFiles) {
  const base64 = await fileToBase64(file);
  assets[file.name] = base64;
}

// Upload all at once
const result = await uploadToWordPress(assets, wpConfig);

console.log(`Uploaded ${result.summary.successful}/${result.summary.total} files`);

// Map old paths to new WordPress URLs
const urlMap = {};
for (const upload of result.uploads) {
  if (upload.success) {
    urlMap[upload.path] = upload.wordPressUrl;
  }
}
```

### Example 3: With Environment Variables

```typescript
// WordPress config from .env
const result = await fetch('/api/asset-embedding/wordpress-upload', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    assets: {
      'image.jpg': base64Data
    },
    wordPressConfig: {
      siteUrl: 'https://my-site.com'
      // username and applicationPassword from env vars
    }
  })
});
```

### Example 4: Error Handling

```typescript
const result = await uploadToWordPress(assets, wpConfig);

// Check overall success
if (!result.success) {
  console.error(`Upload failed: ${result.error}`);
  return;
}

// Check individual uploads
for (const upload of result.uploads) {
  if (upload.success) {
    console.log(`✅ ${upload.path} → ${upload.wordPressUrl}`);
  } else {
    console.error(`❌ ${upload.path}: ${upload.error}`);
  }
}

// Check summary
if (result.summary.failed > 0) {
  console.warn(`${result.summary.failed} uploads failed`);
}
```

## Integration with Page Builders

### Use Media IDs in Elementor

```typescript
// Upload images
const result = await uploadToWordPress(assets, wpConfig);

// Use media IDs in Elementor data
const elementorData = {
  elements: [{
    elType: 'widget',
    widgetType: 'image',
    settings: {
      image: {
        id: result.mediaIds['images/hero.jpg'], // ← WordPress media ID
        url: result.uploads[0].wordPressUrl
      }
    }
  }]
};
```

### Use in Divi

```typescript
// Upload and get URLs
const result = await uploadToWordPress(assets, wpConfig);

// Replace in Divi shortcode
let diviShortcode = '[et_pb_image src="images/logo.png"]';

for (const upload of result.uploads) {
  if (upload.success) {
    diviShortcode = diviShortcode.replace(
      upload.path,
      upload.wordPressUrl
    );
  }
}
// Result: [et_pb_image src="https://site.com/wp-content/uploads/logo.png"]
```

### Use in Gutenberg

```typescript
// Upload images
const result = await uploadToWordPress(assets, wpConfig);

// Create Gutenberg image block
const imageBlock = `
<!-- wp:image {"id":${result.mediaIds['hero.jpg']}} -->
<figure class="wp-block-image">
  <img src="${result.uploads[0].wordPressUrl}" alt="" class="wp-image-${result.mediaIds['hero.jpg']}"/>
</figure>
<!-- /wp:image -->
`;
```

## Error Handling

### Connection Errors

```json
{
  "success": false,
  "error": "WordPress connection failed: Failed to connect to https://site.com"
}
```

**Status Code:** 502 Bad Gateway

### Authentication Errors

```json
{
  "success": false,
  "error": "WordPress username and application password are required"
}
```

**Status Code:** 400 Bad Request

### Individual Upload Failures

```json
{
  "success": true,
  "uploads": [
    {
      "path": "image1.jpg",
      "success": true,
      "wordPressUrl": "..."
    },
    {
      "path": "image2.jpg",
      "success": false,
      "error": "File too large (max 8MB)"
    }
  ],
  "summary": {
    "successful": 1,
    "failed": 1
  }
}
```

**Status Code:** 200 OK (partial success)

## Audit Logging

All uploads are logged to the audit system:

### Success Log

```typescript
{
  action: 'wordpress.media.upload',
  resourceType: 'wordpress_media',
  resourceId: 'https://site.com',
  details: {
    totalAssets: 5,
    successful: 5,
    failed: 0,
    mediaIds: [123, 124, 125, 126, 127]
  },
  category: 'export',
  severity: 'info'
}
```

### Failure Log

```typescript
{
  action: 'wordpress.media.upload.failed',
  resourceType: 'wordpress_media',
  resourceId: 'unknown',
  errorMessage: 'WordPress connection failed',
  category: 'export',
  severity: 'error'
}
```

## Security

- ✅ Application Passwords (not regular passwords)
- ✅ HTTPS recommended
- ✅ Temp files cleaned up automatically
- ✅ File size limits enforced by WordPress
- ✅ MIME type validation by WordPress
- ✅ Audit logging of all uploads
- ✅ No credentials stored on server

## Performance

- **Connection test:** ~200ms
- **Single image upload:** ~500ms - 2s (depends on size)
- **Batch upload (10 images):** ~5-15s
- **Temp file creation:** ~10ms per file
- **Cleanup:** ~50ms

**Optimization tips:**
- Upload in batches (10-20 at a time)
- Use smaller image sizes when possible
- Consider compressing before upload
- Monitor WordPress upload limits

## Limitations

### WordPress Limits
- **Max file size:** Typically 8-64MB (WordPress config)
- **Max execution time:** 30-60s (PHP config)
- **Allowed file types:** WordPress whitelist (images, docs, etc.)

### Current Implementation
- **No retry logic** - Failed uploads must be retried manually
- **Sequential uploads** - One at a time (could be parallelized)
- **No duplicate detection** - Uploads even if file exists

## Troubleshooting

### "WordPress connection failed"
**Cause:** Site URL incorrect or unreachable
**Solution:** Verify `siteUrl` and check site is online

### "401 Unauthorized"
**Cause:** Invalid credentials
**Solution:** Regenerate Application Password

### "413 Payload Too Large"
**Cause:** File exceeds WordPress upload limit
**Solution:** Increase `upload_max_filesize` in PHP config

### "File type not allowed"
**Cause:** MIME type not in WordPress whitelist
**Solution:** Add to `upload_mimes` filter in WordPress

### "Upload failed: timeout"
**Cause:** Large file or slow connection
**Solution:** Increase timeout or reduce file size

## Testing

### Manual Test

```bash
# 1. Convert image to base64
base64 logo.png > logo.base64

# 2. Upload via API
curl -X POST http://localhost:3000/api/asset-embedding/wordpress-upload \
  -H "Content-Type: application/json" \
  -d '{
    "assets": {
      "logo.png": "'$(cat logo.base64)'"
    },
    "wordPressConfig": {
      "siteUrl": "https://your-site.com",
      "username": "admin",
      "applicationPassword": "xxxx xxxx"
    }
  }'

# 3. Check WordPress media library (should see logo.png)
```

### Integration Test

```typescript
import { describe, it, expect } from 'vitest';

describe('WordPress Asset Upload', () => {
  it('should upload single image', async () => {
    const base64 = 'iVBORw0KGgoAAAANSU...';

    const response = await fetch('/api/asset-embedding/wordpress-upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        assets: { 'test.png': base64 },
        wordPressConfig: testConfig
      })
    });

    const result = await response.json();

    expect(result.success).toBe(true);
    expect(result.summary.successful).toBe(1);
    expect(result.mediaIds['test.png']).toBeGreaterThan(0);
  });
});
```

## Future Enhancements

- [ ] Parallel uploads (5-10 at a time)
- [ ] Retry logic with exponential backoff
- [ ] Duplicate detection (check if file exists)
- [ ] Progress callbacks for large uploads
- [ ] Image optimization before upload
- [ ] Chunked upload for very large files
- [ ] Media metadata (caption, description)
- [ ] Organize into WordPress folders
- [ ] Featured image assignment

## Related Documentation

- [WordPress Integration](WORDPRESS_INTEGRATION.md) - Main WordPress integration guide
- [Audit Logging](AUDIT_LOGGING.md) - Audit system documentation
- [WordPress REST API](https://developer.wordpress.org/rest-api/reference/media/) - Official docs

## Support

For issues:
1. Check WordPress REST API is enabled
2. Verify Application Password permissions
3. Check WordPress upload limits (`php.ini`)
4. Review audit logs for error details
5. Test connection with curl first
