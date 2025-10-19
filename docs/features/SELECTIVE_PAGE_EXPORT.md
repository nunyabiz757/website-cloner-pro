# Selective Page Export Guide

## Overview

The **Selective Page Export** feature allows experienced web designers to crawl an entire website, preview all pages, and then export only the specific pages they need (e.g., homepage, contact page, a few service pages).

This is perfect for:
- **Experienced designers** who want a starting template
- **Prototype development** - grab key pages and expand on them
- **Partial site cloning** - only need specific sections
- **Credit savings** - crawl once, export multiple times with different selections

## How It Works

### Two-Step Workflow

**Step 1: Crawl the entire site** (or use sitemap for speed)
```bash
POST /api/multi-page-crawler/start
{
  "url": "https://example.com",
  "useSitemap": true,
  "maxPages": 100
}

# Response: { "crawlId": "crawl_123456789_abc" }
```

**Step 2: Preview and select pages**
```bash
GET /api/multi-page-crawler/pages/crawl_123456789_abc

# Response shows all pages with titles and URLs
```

**Step 3: Export only selected pages**
```bash
POST /api/multi-page-crawler/export-selected
{
  "crawlId": "crawl_123456789_abc",
  "pageIndices": [0, 5, 12, 18],  # Homepage, contact, 2 service pages
  "includeAssets": true
}

# Response: { "exportId": "export_987654321_xyz" }
```

## Complete API Reference

### 1. Crawl Website (Full Discovery)

**POST** `/api/multi-page-crawler/start`

Crawl the entire website to discover all available pages.

**Request:**
```json
{
  "url": "https://example.com",
  "useSitemap": true,      // Fast sitemap-based crawling
  "maxPages": 100,         // Crawl up to 100 pages
  "includeAssets": true    // Download all assets
}
```

**Response:**
```json
{
  "success": true,
  "crawlId": "crawl_1234567890_abc123",
  "message": "Crawl started successfully",
  "status": "running"
}
```

**Save the `crawlId`** - you'll need it for selecting pages later!

### 2. Check Crawl Status

**GET** `/api/multi-page-crawler/status/:crawlId`

Monitor crawl progress.

**Response:**
```json
{
  "success": true,
  "crawlId": "crawl_1234567890_abc123",
  "status": "completed",
  "pagesVisited": 87,
  "pagesCrawled": 87,
  "result": {
    "totalPages": 87,
    "totalAssets": 1245,
    "crawlMethod": "sitemap"
  }
}
```

Wait for `status: "completed"` before proceeding.

### 3. List All Pages

**GET** `/api/multi-page-crawler/pages/:crawlId`

Get a list of all crawled pages with their titles, URLs, and indices.

**Response:**
```json
{
  "success": true,
  "crawlId": "crawl_1234567890_abc123",
  "totalPages": 87,
  "pages": [
    {
      "url": "https://example.com/",
      "title": "Home - Example Company",
      "depth": 0,
      "linksCount": 45,
      "assetsCount": 23,
      "metadata": {
        "description": "Welcome to Example Company",
        "ogImage": "https://example.com/og-image.jpg"
      }
    },
    {
      "url": "https://example.com/about",
      "title": "About Us - Example Company",
      "depth": 1,
      "linksCount": 12,
      "assetsCount": 8,
      "metadata": { ... }
    },
    {
      "url": "https://example.com/services",
      "title": "Our Services - Example Company",
      "depth": 1,
      "linksCount": 18,
      "assetsCount": 15,
      "metadata": { ... }
    },
    {
      "url": "https://example.com/contact",
      "title": "Contact Us - Example Company",
      "depth": 1,
      "linksCount": 8,
      "assetsCount": 3,
      "metadata": { ... }
    }
    // ... 83 more pages
  ]
}
```

**Page Index:** The array index is the `pageIndex` you'll use to select pages (0-based).

### 4. Export Selected Pages

**POST** `/api/multi-page-crawler/export-selected`

Export only the pages you want from the completed crawl.

**Request:**
```json
{
  "crawlId": "crawl_1234567890_abc123",
  "pageIndices": [0, 3, 5, 12],    // Array of page indices to export
  "includeAssets": true             // Include CSS, JS, images, fonts
}
```

**Parameters:**
- `crawlId` (required) - The ID from the original crawl
- `pageIndices` (required) - Array of 0-based page indices to export
- `includeAssets` (optional, default: true) - Whether to include assets

**Response:**
```json
{
  "success": true,
  "exportId": "export_9876543210_xyz789",
  "outputPath": "/path/to/crawled-sites/export_9876543210_xyz789",
  "exportedPages": 4,
  "exportedAssets": 156
}
```

The exported pages are saved in a new directory with:
- `/pages/index.html` - First selected page
- `/pages/page-1.html` - Second selected page
- `/pages/page-2.html` - Third selected page
- `/pages/page-3.html` - Fourth selected page
- `/assets/*` - All associated assets
- `/metadata.json` - Export metadata

## Usage Examples

### Example 1: Simple Template Grab

**Goal:** Get homepage and contact page only

```bash
# Step 1: Crawl site
POST /api/multi-page-crawler/start
{
  "url": "https://example.com",
  "useSitemap": true,
  "maxPages": 50
}
# Returns: { "crawlId": "crawl_abc123" }

# Step 2: Wait for completion
GET /api/multi-page-crawler/status/crawl_abc123
# Wait until status: "completed"

# Step 3: List pages
GET /api/multi-page-crawler/pages/crawl_abc123
# Review the list, note indices:
# [0] Home
# [15] Contact

# Step 4: Export only those 2 pages
POST /api/multi-page-crawler/export-selected
{
  "crawlId": "crawl_abc123",
  "pageIndices": [0, 15],
  "includeAssets": true
}
# Returns: { "exportId": "export_xyz789" }
```

### Example 2: Service Page Collection

**Goal:** Get homepage + all service pages

```bash
# Step 1: Crawl site
POST /api/multi-page-crawler/start
{
  "url": "https://agency.com",
  "useSitemap": true,
  "maxPages": 100
}
# Returns: { "crawlId": "crawl_def456" }

# Step 2: Wait for completion
GET /api/multi-page-crawler/status/crawl_def456

# Step 3: List pages and identify service pages
GET /api/multi-page-crawler/pages/crawl_def456
# Find pages with "/services/" in URL:
# [0] Home
# [12] /services/web-design
# [13] /services/branding
# [14] /services/seo
# [15] /services/marketing

# Step 4: Export homepage + service pages
POST /api/multi-page-crawler/export-selected
{
  "crawlId": "crawl_def456",
  "pageIndices": [0, 12, 13, 14, 15],
  "includeAssets": true
}
```

### Example 3: Multi-Language Site (One Language)

**Goal:** Clone only English pages

```bash
# Step 1: Crawl entire multi-language site
POST /api/multi-page-crawler/start
{
  "url": "https://global-company.com",
  "sitemapUrl": "https://global-company.com/sitemap-en.xml",  # English only
  "maxPages": 100
}
# Returns: { "crawlId": "crawl_ghi789" }

# Step 2: List pages
GET /api/multi-page-crawler/pages/crawl_ghi789
# All pages are English (since we used English sitemap)

# Step 3: Select key English pages
# [0] Home (EN)
# [3] About (EN)
# [8] Products (EN)
# [25] Contact (EN)

POST /api/multi-page-crawler/export-selected
{
  "crawlId": "crawl_ghi789",
  "pageIndices": [0, 3, 8, 25]
}
```

### Example 4: Multiple Exports from Same Crawl

**Goal:** Create different page sets from one crawl

```bash
# Step 1: Crawl once
POST /api/multi-page-crawler/start
{
  "url": "https://example.com",
  "maxPages": 100
}
# Returns: { "crawlId": "crawl_jkl012" }

# Step 2: Export set A (Basic template)
POST /api/multi-page-crawler/export-selected
{
  "crawlId": "crawl_jkl012",
  "pageIndices": [0, 5, 10]  // Home, About, Contact
}
# Returns: { "exportId": "export_aaa111" }

# Step 3: Export set B (Extended template)
POST /api/multi-page-crawler/export-selected
{
  "crawlId": "crawl_jkl012",
  "pageIndices": [0, 5, 10, 12, 15, 18, 22]  // More pages
}
# Returns: { "exportId": "export_bbb222" }

# Step 4: Export set C (Services only)
POST /api/multi-page-crawler/export-selected
{
  "crawlId": "crawl_jkl012",
  "pageIndices": [12, 13, 14, 15, 16]  // Just service pages
}
# Returns: { "exportId": "export_ccc333" }
```

**Benefit:** Crawl once (uses 1 credit), export multiple times (no additional cost)!

## Common Workflows

### Workflow 1: Designer Template Grab

Perfect for experienced designers who want a quick starting point:

1. **Crawl competitor or inspiration site** (fast sitemap mode)
2. **Review all pages** - see titles and URLs
3. **Select key pages:**
   - [0] Homepage
   - [X] Contact page
   - [Y] 1-2 service/product pages
   - [Z] About page (optional)
4. **Export selection** with assets
5. **Customize in your editor** - expand on the template

### Workflow 2: Client Audit → Rebuild

Audit existing client site, then rebuild specific sections:

1. **Crawl client's current site** (100+ pages)
2. **Identify outdated pages** that need rebuilding
3. **Export only those pages** as reference
4. **Use as blueprint** for rebuilding with modern tech

### Workflow 3: Landing Page Collection

Build a library of landing page designs:

1. **Crawl multiple competitor sites**
2. **Export only homepage** from each (pageIndex: [0])
3. **Build swipe file** of landing page designs
4. **Mix and match** elements for your own designs

### Workflow 4: Documentation/Help Section

Clone just the help/docs section:

1. **Crawl entire site**
2. **Filter pages** in /docs/ or /help/ URLs
3. **Export filtered selection**
4. **Adapt documentation** for your product

## Page Selection Strategies

### By Page Type

**Homepage only:**
```json
{ "pageIndices": [0] }
```

**Core pages (Home, About, Contact):**
```json
{ "pageIndices": [0, 3, 15] }  // Adjust indices based on your site
```

**Service/Product pages:**
Look for pages with `/services/` or `/products/` in URL, then:
```json
{ "pageIndices": [12, 13, 14, 15, 16] }
```

### By URL Pattern

After reviewing the page list, select pages matching patterns:

**Blog posts from 2024:**
```javascript
// Filter pages where URL includes "/blog/2024/"
// Example: [45, 48, 52, 55, 60, ...]
```

**Specific category:**
```javascript
// Filter pages where URL includes "/category/electronics/"
// Example: [22, 24, 28, 31, ...]
```

### By Title

Select pages based on their titles:

**Tutorial pages:**
```javascript
// Filter pages where title includes "Tutorial" or "Guide"
// Example: [10, 15, 23, 34, ...]
```

## File Structure

### Original Crawl Directory
```
crawled-sites/
  crawl_1234567890_abc123/
    pages/
      index.html           # Page 0
      page-1.html          # Page 1
      page-2.html          # Page 2
      ...
      page-86.html         # Page 86
    assets/
      images/
      css/
      js/
      fonts/
    metadata.json          # All page info
```

### Exported Selection Directory
```
crawled-sites/
  export_9876543210_xyz789/
    pages/
      index.html           # Originally page 0
      page-1.html          # Originally page 5
      page-2.html          # Originally page 12
      page-3.html          # Originally page 18
    assets/
      images/              # All images (from original crawl)
      css/                 # All CSS
      js/                  # All JS
      fonts/               # All fonts
    metadata.json          # Export info + original indices
```

**Note:** The first selected page becomes `index.html` in the export.

### Export Metadata Format

```json
{
  "exportId": "export_9876543210_xyz789",
  "originalCrawlId": "crawl_1234567890_abc123",
  "exportedAt": "2024-01-15T10:30:00.000Z",
  "totalPages": 4,
  "includeAssets": true,
  "pages": [
    {
      "index": 0,
      "originalIndex": 0,
      "url": "https://example.com/",
      "title": "Home - Example Company",
      "filename": "index.html"
    },
    {
      "index": 1,
      "originalIndex": 5,
      "url": "https://example.com/contact",
      "title": "Contact Us - Example Company",
      "filename": "page-1.html"
    },
    {
      "index": 2,
      "originalIndex": 12,
      "url": "https://example.com/services/web-design",
      "title": "Web Design Services",
      "filename": "page-2.html"
    },
    {
      "index": 3,
      "originalIndex": 18,
      "url": "https://example.com/about",
      "title": "About Us - Example Company",
      "filename": "page-3.html"
    }
  ]
}
```

## Asset Handling

### Current Behavior

**All assets are copied** from the original crawl, not just assets from selected pages.

**Why?**
- HTML pages often reference shared assets (global CSS, common images)
- Extracting only used assets is complex and error-prone
- Disk space is cheap; missing assets break designs

**Future Enhancement:**
We may add an option for "smart asset extraction" that only copies assets referenced by selected pages.

### Asset Types Included

When `includeAssets: true`:
- **Images:** All images from `assets/images/`
- **CSS:** All stylesheets from `assets/css/`
- **JavaScript:** All scripts from `assets/js/`
- **Fonts:** All fonts from `assets/fonts/`

Set `includeAssets: false` to export HTML only (no assets).

## Advanced Use Cases

### Use Case 1: A/B Testing Templates

Export different page combinations to test:

```bash
# Template A: Minimal
POST /api/multi-page-crawler/export-selected
{ "crawlId": "crawl_xyz", "pageIndices": [0, 5] }

# Template B: Full
POST /api/multi-page-crawler/export-selected
{ "crawlId": "crawl_xyz", "pageIndices": [0, 3, 5, 8, 12] }
```

### Use Case 2: Progressive Enhancement

Start with minimal pages, add more later:

```bash
# Phase 1: MVP (Home + Contact)
POST /api/multi-page-crawler/export-selected
{ "crawlId": "crawl_abc", "pageIndices": [0, 15] }

# Phase 2: Add Services
POST /api/multi-page-crawler/export-selected
{ "crawlId": "crawl_abc", "pageIndices": [0, 15, 12, 13, 14] }

# Phase 3: Add About + Blog
POST /api/multi-page-crawler/export-selected
{ "crawlId": "crawl_abc", "pageIndices": [0, 15, 12, 13, 14, 3, 20] }
```

### Use Case 3: Multi-Client Templates

Clone once, export differently for different clients:

```bash
# Client A: Needs homepage + 3 service pages
POST /api/multi-page-crawler/export-selected
{ "crawlId": "crawl_def", "pageIndices": [0, 5, 6, 7] }

# Client B: Needs homepage + about + contact
POST /api/multi-page-crawler/export-selected
{ "crawlId": "crawl_def", "pageIndices": [0, 2, 15] }
```

## Error Handling

### Invalid Crawl ID
```json
{
  "success": false,
  "error": "Crawl crawl_invalid not found"
}
```

**Solution:** Verify the crawl ID is correct and the crawl completed successfully.

### Invalid Page Indices
```json
{
  "success": false,
  "error": "Invalid page indices: 100, 150. Valid range: 0-86"
}
```

**Solution:** Check the page count from `/pages/:crawlId` endpoint. Indices are 0-based.

### Empty Page Indices
```json
{
  "success": false,
  "error": "Page indices array is required and must not be empty"
}
```

**Solution:** Provide at least one page index in the array.

### Crawl Still Running
```json
{
  "success": false,
  "error": "Crawl is still running"
}
```

**Solution:** Wait for the crawl to complete before exporting. Check status with `/status/:crawlId`.

## Best Practices

### 1. Always Crawl with Sitemap First
Sitemap-based crawling is 10-20x faster and more reliable:
```json
{
  "useSitemap": true,
  "maxPages": 100  // Crawl more pages since it's fast
}
```

### 2. Review Before Selecting
Always call `/pages/:crawlId` to see all available pages before selecting.

### 3. Start Small
For your first export, select just 2-3 pages to verify everything works.

### 4. Use Meaningful Indices
Document which indices correspond to which pages:
```javascript
// My page selections:
// [0]  - Homepage
// [5]  - Contact
// [12] - Services > Web Design
// [18] - About
const pageIndices = [0, 5, 12, 18];
```

### 5. Keep Crawl IDs
Save crawl IDs for future exports - you can export multiple times from the same crawl!

### 6. Include Assets
Unless you specifically don't need them, always set `includeAssets: true`.

## Credit Usage

This feature is **credit-efficient**:

1. **Initial crawl:** 1 credit per page (up to maxPages)
2. **Export selected pages:** NO additional credits!

**Example:**
- Crawl 100 pages = 100 credits
- Export pages [0, 5, 10] = 0 credits
- Export pages [0, 3, 8, 15, 20] = 0 credits (from same crawl)
- Export pages [1, 2, 4, 7] = 0 credits (from same crawl)

**Total: 100 credits** for unlimited exports from that crawl!

## Summary

The Selective Page Export feature gives you:

✅ **Full site discovery** - Crawl entire site to see all pages
✅ **Preview before export** - See titles, URLs, metadata
✅ **Precise selection** - Choose exactly which pages you need
✅ **Multiple exports** - Export different combinations from same crawl
✅ **Credit efficiency** - Crawl once, export many times
✅ **Designer-friendly** - Perfect for experienced developers who know what they need
✅ **Fast workflow** - Sitemap crawling + selective export = ultra-fast

Perfect for experienced web designers who want to grab specific pages as a starting template and expand on them!
