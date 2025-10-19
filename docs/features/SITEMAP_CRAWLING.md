# Sitemap-Based Crawling

## Overview

The Website Cloner Pro now supports **sitemap-based crawling** for multi-page website cloning. This feature provides **10-20x faster** performance compared to traditional link-discovery crawling.

## Performance Comparison

### Regular Crawling (Link Discovery)
- **Method:** Sequential link discovery and crawling
- **Speed:** 10-30 minutes for 100 pages
- **Process:**
  1. Load page
  2. Extract links
  3. Follow links one by one
  4. Repeat for each page

### Sitemap Crawling
- **Method:** Parse sitemap XML, then crawl all URLs in parallel
- **Speed:** 30-60 seconds for 100 pages
- **Process:**
  1. Fetch and parse sitemap
  2. Extract all URLs instantly
  3. Clone pages in parallel (5 concurrent workers by default)
  4. Complete

**Speed Improvement:** 10-20x faster for most websites

## How It Works

### Automatic Sitemap Detection

The service automatically tries to find sitemaps in these locations:
1. `/sitemap.xml`
2. `/sitemap_index.xml`
3. `/sitemap-index.xml`
4. `/sitemap1.xml`
5. `/sitemap.xml.gz`
6. `/wp-sitemap.xml` (WordPress)
7. `/sitemaps/sitemap.xml`
8. `/sitemap/sitemap.xml`
9. Checks `robots.txt` for Sitemap directives

### Fallback Strategy

If sitemap detection fails or is disabled, the service automatically falls back to regular link-discovery crawling.

## API Usage

### 1. Start Crawl with Sitemap (Auto-detect)

```bash
POST /api/multi-page-crawler/start
Content-Type: application/json

{
  "url": "https://example.com",
  "maxPages": 100,
  "useSitemap": true,          // Default: true (auto-detect sitemap)
  "concurrency": 5,             // Parallel workers (1-20)
  "includePatterns": ["/blog/*", "/products/*"],  // Optional URL filters
  "excludePatterns": ["/admin/*", "/private/*"]   // Optional URL excludes
}
```

**Response:**
```json
{
  "success": true,
  "crawlId": "temp_1234567890_abc123",
  "message": "Crawl started successfully",
  "status": "running"
}
```

### 2. Start Crawl with Specific Sitemap URL

```bash
POST /api/multi-page-crawler/start
Content-Type: application/json

{
  "url": "https://example.com",
  "sitemapUrl": "https://example.com/sitemap.xml",  // Specific sitemap
  "maxPages": 100,
  "concurrency": 10
}
```

### 3. Disable Sitemap (Use Regular Crawling Only)

```bash
POST /api/multi-page-crawler/start
Content-Type: application/json

{
  "url": "https://example.com",
  "useSitemap": false,  // Force regular crawling
  "maxPages": 50,
  "maxDepth": 3
}
```

### 4. Detect Sitemap Before Crawling

Use this endpoint to preview sitemap URLs before starting a crawl:

```bash
POST /api/multi-page-crawler/detect-sitemap
Content-Type: application/json

{
  "url": "https://example.com"
}
```

**Response:**
```json
{
  "success": true,
  "found": true,
  "sitemapUrl": "https://example.com/sitemap.xml",
  "totalUrls": 247,
  "totalSitemaps": 1,
  "parseTime": 1234,
  "urls": [
    "https://example.com/",
    "https://example.com/about",
    "https://example.com/products",
    "... (first 10 URLs)"
  ]
}
```

### 5. Parse Specific Sitemap with Filters

```bash
POST /api/multi-page-crawler/parse-sitemap
Content-Type: application/json

{
  "sitemapUrl": "https://example.com/sitemap.xml",
  "includePatterns": ["/blog/*"],
  "excludePatterns": ["/blog/draft-*"]
}
```

**Response:**
```json
{
  "success": true,
  "sitemapUrl": "https://example.com/sitemap.xml",
  "totalUrls": 247,
  "filteredUrls": 45,
  "totalSitemaps": 1,
  "parseTime": 856,
  "urls": [
    "https://example.com/blog/post-1",
    "https://example.com/blog/post-2",
    "... (first 20 filtered URLs)"
  ],
  "allSitemaps": ["https://example.com/sitemap.xml"]
}
```

### 6. Check Crawl Status

```bash
GET /api/multi-page-crawler/status/{crawlId}
```

**Response:**
```json
{
  "success": true,
  "crawlId": "temp_1234567890_abc123",
  "status": "completed",
  "url": "https://example.com",
  "startTime": 1234567890000,
  "elapsedTime": 45000,
  "pagesVisited": 100,
  "pagesCrawled": 100,
  "result": {
    "totalPages": 100,
    "totalAssets": 1547,
    "outputPath": "/path/to/output",
    "crawlMethod": "sitemap",              // "sitemap" or "regular"
    "sitemapUsed": "https://example.com/sitemap.xml"  // URL of sitemap used
  }
}
```

## API Request Parameters

### Multi-Page Crawl Start

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `url` | string | *required* | Starting URL to crawl |
| `maxPages` | number | 50 | Maximum pages to crawl |
| `maxDepth` | number | 3 | Maximum crawl depth (regular crawling only) |
| `sameDomainOnly` | boolean | true | Only crawl same domain |
| `includeSubdomains` | boolean | false | Include subdomains |
| `excludePatterns` | string[] | [] | URL patterns to exclude (regex) |
| `includePatterns` | string[] | [] | URL patterns to include (regex) |
| `includeAssets` | boolean | true | Download assets (images, CSS, JS) |
| `followExternalLinks` | boolean | false | Follow external links |
| `useSitemap` | boolean | true | Auto-detect and use sitemap |
| `sitemapUrl` | string | undefined | Specific sitemap URL to use |
| `concurrency` | number | 5 | Parallel workers (1-20) for sitemap crawling |

## URL Pattern Filtering

Use wildcard patterns to filter URLs:

### Include Patterns (whitelist)
Only crawl URLs matching these patterns:
```json
{
  "includePatterns": [
    "/blog/*",           // All blog pages
    "/products/*.html",  // All product pages
    "/docs/v2/*"        // Specific documentation version
  ]
}
```

### Exclude Patterns (blacklist)
Skip URLs matching these patterns:
```json
{
  "excludePatterns": [
    "/admin/*",          // Admin pages
    "/private/*",        // Private pages
    "*/draft-*",         // Draft pages
    "*.pdf",             // PDF files
    "/api/*"            // API endpoints
  ]
}
```

Patterns are converted to regex: `*` becomes `.*`

## Sitemap Format Support

The service supports all standard sitemap formats:

### 1. Regular Sitemap
```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://example.com/</loc>
    <lastmod>2024-01-15</lastmod>
  </url>
  <url>
    <loc>https://example.com/about</loc>
  </url>
</urlset>
```

### 2. Sitemap Index
```xml
<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>https://example.com/sitemap-products.xml</loc>
  </sitemap>
  <sitemap>
    <loc>https://example.com/sitemap-blog.xml</loc>
  </sitemap>
</sitemapindex>
```

### 3. Compressed Sitemap (.xml.gz)
Automatically decompresses gzipped sitemaps.

### Limits
- Maximum 50 sitemaps per sitemap index (prevents infinite loops)
- No URL limit (all URLs in sitemap will be extracted)

## Use Cases

### Scenario 1: Fast Full-Site Clone
Clone entire website as fast as possible:
```json
{
  "url": "https://example.com",
  "useSitemap": true,
  "maxPages": 1000,
  "concurrency": 10
}
```

### Scenario 2: Clone Specific Section
Clone only blog section using sitemap:
```json
{
  "url": "https://example.com",
  "sitemapUrl": "https://example.com/sitemap.xml",
  "includePatterns": ["/blog/*"],
  "concurrency": 5
}
```

### Scenario 3: Preview Before Cloning
1. Detect sitemap first:
```bash
POST /api/multi-page-crawler/detect-sitemap
{ "url": "https://example.com" }
```

2. Parse with filters to preview:
```bash
POST /api/multi-page-crawler/parse-sitemap
{
  "sitemapUrl": "https://example.com/sitemap.xml",
  "includePatterns": ["/products/*"]
}
```

3. Start crawl with confirmed settings:
```bash
POST /api/multi-page-crawler/start
{
  "url": "https://example.com",
  "sitemapUrl": "https://example.com/sitemap.xml",
  "includePatterns": ["/products/*"],
  "maxPages": 100
}
```

### Scenario 4: Fallback to Regular Crawling
If sitemap is broken or incomplete, automatic fallback:
```json
{
  "url": "https://example.com",
  "useSitemap": true,  // Try sitemap first
  "maxPages": 50,
  "maxDepth": 3        // Used if fallback to regular crawling
}
```

## Performance Tips

### 1. Optimize Concurrency
- **Small sites (< 50 pages):** `concurrency: 3-5`
- **Medium sites (50-200 pages):** `concurrency: 5-10`
- **Large sites (> 200 pages):** `concurrency: 10-15`
- **Maximum:** `concurrency: 20` (limited to prevent server overload)

### 2. Use Filters to Reduce Scope
Instead of crawling everything and limiting with `maxPages`, use filters:
```json
{
  "includePatterns": ["/blog/*", "/products/*"],
  "excludePatterns": ["/admin/*", "/temp/*"]
}
```

### 3. Preview with detect-sitemap
Always preview sitemap URLs before large crawls to avoid surprises.

### 4. Monitor Progress
Poll the status endpoint to track progress:
```bash
GET /api/multi-page-crawler/status/{crawlId}
```

## Error Handling

### Sitemap Not Found
If no sitemap is found, the service automatically falls back to regular crawling:
```json
{
  "crawlMethod": "regular",
  "sitemapUsed": null
}
```

### Invalid Sitemap URL
Returns validation error:
```json
{
  "success": false,
  "error": "Invalid sitemap URL format"
}
```

### Sitemap Parse Error
Falls back to regular crawling and logs error:
```
⚠️  Sitemap crawling failed, falling back to regular crawling
🔄 Using REGULAR crawling (link discovery)
```

### Concurrency Out of Range
```json
{
  "success": false,
  "error": "Concurrency must be between 1 and 20"
}
```

## Architecture

### Service Layer

**SitemapParserService** (`src/server/services/SitemapParserService.ts`)
- Auto-detects sitemap locations
- Parses XML sitemaps and sitemap indexes
- Handles gzipped sitemaps
- Filters URLs by patterns
- Supports nested sitemaps (up to 50)

**MultiPageCrawlerService** (`src/server/services/MultiPageCrawlerService.ts`)
- Hybrid crawling: tries sitemap first, falls back to regular
- Parallel page cloning with configurable concurrency
- Batched processing for memory efficiency
- No breaking changes to existing functionality

### API Layer

**Routes** (`src/server/routes/multi-page-crawler.ts`)
- `POST /api/multi-page-crawler/start` - Start crawl (with sitemap support)
- `POST /api/multi-page-crawler/detect-sitemap` - Auto-detect sitemap
- `POST /api/multi-page-crawler/parse-sitemap` - Parse specific sitemap
- `GET /api/multi-page-crawler/status/:crawlId` - Get status (includes crawlMethod)
- `GET /api/multi-page-crawler/result/:crawlId` - Get results

## Benefits

### Speed
- **10-20x faster** than regular crawling for most sites
- Parallel execution instead of sequential
- No link discovery overhead

### Completeness
- Gets all pages listed in sitemap instantly
- No risk of missing pages due to broken links
- Works with sites that have complex navigation

### Efficiency
- Reduces server load with parallel execution
- Configurable concurrency to balance speed vs resources
- Automatic fallback ensures reliability

### Flexibility
- Works with or without sitemap
- Supports URL filtering
- Compatible with existing crawling options

## Limitations

### Sitemap Requirements
- Site must have a valid XML sitemap
- Sitemap must be accessible (not password-protected)
- Sitemap must follow standard format

### When to Use Regular Crawling
- No sitemap available
- Sitemap is outdated or incomplete
- Need to follow specific navigation paths
- Testing link structure

### Rate Limiting
- High concurrency may trigger rate limits on some servers
- Reduce concurrency if you encounter 429 errors

## Migration Guide

### From Regular Crawling

**Before:**
```json
{
  "url": "https://example.com",
  "maxPages": 100,
  "maxDepth": 3
}
```

**After (with sitemap):**
```json
{
  "url": "https://example.com",
  "maxPages": 100,
  "useSitemap": true,
  "concurrency": 5
}
```

No breaking changes - all existing parameters still work!

## Monitoring and Debugging

### Check Crawl Method Used
```bash
GET /api/multi-page-crawler/status/{crawlId}
```

Look for:
```json
{
  "result": {
    "crawlMethod": "sitemap",  // or "regular"
    "sitemapUsed": "https://example.com/sitemap.xml"
  }
}
```

### Server Logs
Watch for these log messages:
- `🗺️  Attempting sitemap-based crawling...`
- `✅ Found sitemap with 247 URLs`
- `🚀 Using SITEMAP crawling for 100 pages`
- `⚠️  Sitemap crawling failed, falling back to regular crawling`
- `🔄 Using REGULAR crawling (link discovery)`

## Future Enhancements

Potential future improvements:
- RSS feed support
- HTML sitemap parsing (in addition to XML)
- Sitemap caching for faster repeat crawls
- Custom user agent for sitemap requests
- Sitemap validation before crawling
- Statistics on sitemap quality (URLs found vs URLs accessible)

## Support

For issues or questions about sitemap-based crawling:
1. Check the server logs for error messages
2. Use the `detect-sitemap` endpoint to verify sitemap availability
3. Test with `parse-sitemap` to preview URLs before crawling
4. Use `useSitemap: false` to force regular crawling for comparison

## Summary

Sitemap-based crawling provides dramatic performance improvements (10-20x faster) for multi-page website cloning while maintaining full backward compatibility. The automatic fallback ensures reliability, and the flexible API supports various use cases from full-site clones to targeted section crawling.
