# Multiple Sitemaps Handling Guide

## Overview

Many websites have **multiple sitemaps** to organize their content. For example:
- `sitemap-blog.xml` - Blog posts
- `sitemap-products.xml` - Product pages
- `sitemap-pages.xml` - Static pages
- `sitemap-index.xml` - Index linking to all other sitemaps

Website Cloner Pro provides comprehensive support for detecting, parsing, and crawling from multiple sitemaps.

## Why Multiple Sitemaps?

Websites use multiple sitemaps for several reasons:
1. **Organization** - Separate content types (blog, products, pages)
2. **Size limits** - XML sitemaps limited to 50,000 URLs or 50MB
3. **Update frequency** - Different sections update at different rates
4. **Multi-language** - Separate sitemaps per language
5. **Subdomains** - Each subdomain may have its own sitemap

## Detection Methods

### 1. List All Available Sitemaps

Use this endpoint to discover all sitemaps without parsing them:

```bash
POST /api/multi-page-crawler/list-sitemaps
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
  "sitemaps": [
    {
      "url": "https://example.com/sitemap-index.xml",
      "type": "sitemap_index",
      "estimatedUrls": 5000
    },
    {
      "url": "https://example.com/sitemap-blog.xml",
      "type": "sitemap",
      "estimatedUrls": 234
    },
    {
      "url": "https://example.com/sitemap-products.xml",
      "type": "sitemap",
      "estimatedUrls": 1456
    }
  ],
  "totalSitemaps": 3,
  "totalEstimatedUrls": 6690
}
```

### 2. Auto-Detect and Parse First Sitemap

By default, auto-detection parses only the first sitemap found:

```bash
POST /api/multi-page-crawler/detect-sitemap
Content-Type: application/json

{
  "url": "https://example.com",
  "parseAll": false  // Default
}
```

### 3. Auto-Detect and Parse ALL Sitemaps

Set `parseAll: true` to merge all detected sitemaps:

```bash
POST /api/multi-page-crawler/detect-sitemap
Content-Type: application/json

{
  "url": "https://example.com",
  "parseAll": true  // Parse and merge all sitemaps
}
```

**Response:**
```json
{
  "success": true,
  "found": true,
  "sitemapUrl": "https://example.com/sitemap.xml",
  "totalUrls": 1690,
  "totalSitemaps": 3,
  "allSitemaps": [
    "https://example.com/sitemap.xml",
    "https://example.com/sitemap-blog.xml",
    "https://example.com/sitemap-products.xml"
  ],
  "parseTime": 2345,
  "parsedAll": true,
  "urls": ["... first 10 URLs ..."]
}
```

## Crawling Strategies

### Strategy 1: Auto-Detect (Single Sitemap)

Let the system automatically detect and use the first sitemap:

```bash
POST /api/multi-page-crawler/start
Content-Type: application/json

{
  "url": "https://example.com",
  "useSitemap": true,  // Auto-detect first sitemap
  "maxPages": 100
}
```

**Use when:**
- You want the fastest, simplest approach
- The first sitemap contains all needed URLs
- You don't care about specific sections

### Strategy 2: Use Specific Single Sitemap

Choose one specific sitemap to crawl:

```bash
POST /api/multi-page-crawler/start
Content-Type: application/json

{
  "url": "https://example.com",
  "sitemapUrl": "https://example.com/sitemap-blog.xml",  // Only blog pages
  "maxPages": 50
}
```

**Use when:**
- You only need a specific section (e.g., blog only)
- You want to test with a smaller sitemap first
- You know exactly which sitemap you need

### Strategy 3: Use Multiple Specific Sitemaps

Parse and merge multiple sitemaps:

```bash
POST /api/multi-page-crawler/start
Content-Type: application/json

{
  "url": "https://example.com",
  "sitemapUrls": [
    "https://example.com/sitemap-blog.xml",
    "https://example.com/sitemap-products.xml",
    "https://example.com/sitemap-pages.xml"
  ],
  "maxPages": 200,
  "concurrency": 10
}
```

**Use when:**
- You need specific sections but not all
- You want to exclude certain sitemaps (e.g., skip archives)
- You need precise control over what's crawled

### Strategy 4: Selective Crawling with Filters

Combine multiple sitemaps with URL filters:

```bash
POST /api/multi-page-crawler/start
Content-Type: application/json

{
  "url": "https://example.com",
  "sitemapUrls": [
    "https://example.com/sitemap-blog.xml",
    "https://example.com/sitemap-products.xml"
  ],
  "includePatterns": ["/blog/2024/*", "/products/featured/*"],
  "excludePatterns": ["/blog/draft-*", "/products/old-*"],
  "maxPages": 100
}
```

**Use when:**
- You need fine-grained control
- You want specific pages from multiple sections
- You need to exclude certain URL patterns

## Recommended Workflows

### Workflow 1: Discovery → Selection → Crawl

**Step 1: List available sitemaps**
```bash
POST /api/multi-page-crawler/list-sitemaps
{ "url": "https://example.com" }
```

**Step 2: Parse specific sitemaps to preview**
```bash
POST /api/multi-page-crawler/parse-sitemap
{
  "sitemapUrls": [
    "https://example.com/sitemap-blog.xml",
    "https://example.com/sitemap-products.xml"
  ],
  "includePatterns": ["/blog/2024/*"]
}
```

**Step 3: Start crawl with confirmed settings**
```bash
POST /api/multi-page-crawler/start
{
  "url": "https://example.com",
  "sitemapUrls": [
    "https://example.com/sitemap-blog.xml",
    "https://example.com/sitemap-products.xml"
  ],
  "includePatterns": ["/blog/2024/*"],
  "maxPages": 50
}
```

### Workflow 2: Quick Full-Site Clone

**Use sitemap index to get everything:**
```bash
POST /api/multi-page-crawler/start
{
  "url": "https://example.com",
  "sitemapUrl": "https://example.com/sitemap-index.xml",  // Index includes all sitemaps
  "maxPages": 1000,
  "concurrency": 15
}
```

Sitemap indexes automatically parse all linked sitemaps.

### Workflow 3: Section-by-Section Crawling

Clone different sections separately for better organization:

**Clone blog:**
```bash
POST /api/multi-page-crawler/start
{
  "url": "https://example.com",
  "sitemapUrl": "https://example.com/sitemap-blog.xml",
  "maxPages": 100
}
```

**Clone products:**
```bash
POST /api/multi-page-crawler/start
{
  "url": "https://example.com",
  "sitemapUrl": "https://example.com/sitemap-products.xml",
  "maxPages": 200
}
```

Each crawl creates separate output folders.

## Common Scenarios

### Scenario 1: E-commerce Site with Product Sitemaps

**Typical structure:**
- `/sitemap-index.xml` - Main index
- `/sitemap-products-1.xml` - Products page 1
- `/sitemap-products-2.xml` - Products page 2
- `/sitemap-categories.xml` - Category pages
- `/sitemap-pages.xml` - Static pages

**Approach A: Clone products only**
```json
{
  "sitemapUrls": [
    "https://shop.example.com/sitemap-products-1.xml",
    "https://shop.example.com/sitemap-products-2.xml"
  ]
}
```

**Approach B: Clone everything**
```json
{
  "sitemapUrl": "https://shop.example.com/sitemap-index.xml"
}
```

### Scenario 2: Multi-Language Website

**Typical structure:**
- `/sitemap-en.xml` - English pages
- `/sitemap-es.xml` - Spanish pages
- `/sitemap-fr.xml` - French pages

**Clone single language:**
```json
{
  "sitemapUrl": "https://example.com/sitemap-en.xml"
}
```

**Clone multiple languages:**
```json
{
  "sitemapUrls": [
    "https://example.com/sitemap-en.xml",
    "https://example.com/sitemap-es.xml"
  ]
}
```

### Scenario 3: Blog with Time-Based Sitemaps

**Typical structure:**
- `/sitemap-posts-2024.xml`
- `/sitemap-posts-2023.xml`
- `/sitemap-posts-2022.xml`

**Clone recent posts only:**
```json
{
  "sitemapUrls": [
    "https://blog.example.com/sitemap-posts-2024.xml",
    "https://blog.example.com/sitemap-posts-2023.xml"
  ]
}
```

### Scenario 4: Large Site with Subdomain Sitemaps

**Typical structure:**
- `https://www.example.com/sitemap.xml` - Main site
- `https://blog.example.com/sitemap.xml` - Blog subdomain
- `https://shop.example.com/sitemap.xml` - Shop subdomain

**Clone main site + blog:**
```json
{
  "sitemapUrls": [
    "https://www.example.com/sitemap.xml",
    "https://blog.example.com/sitemap.xml"
  ]
}
```

## Performance Considerations

### Parallel Sitemap Parsing

Multiple sitemaps are parsed **in parallel** for maximum speed:

```javascript
// These 5 sitemaps are parsed simultaneously:
{
  "sitemapUrls": [
    "https://example.com/sitemap-blog.xml",      // Parsed in parallel
    "https://example.com/sitemap-products.xml",  // Parsed in parallel
    "https://example.com/sitemap-pages.xml",     // Parsed in parallel
    "https://example.com/sitemap-news.xml",      // Parsed in parallel
    "https://example.com/sitemap-videos.xml"     // Parsed in parallel
  ]
}
```

**Result:** 5 sitemaps parsed in ~2-3 seconds (vs 10-15 seconds sequential)

### Optimal Concurrency Settings

When crawling from multiple sitemaps:

| Total URLs | Recommended Concurrency |
|------------|------------------------|
| < 50       | 3-5                    |
| 50-200     | 5-10                   |
| 200-500    | 10-15                  |
| 500+       | 15-20                  |

```json
{
  "sitemapUrls": ["..."],
  "concurrency": 15  // For 300+ total URLs
}
```

### Deduplication

URLs are automatically deduplicated across sitemaps:

```
sitemap-blog.xml:     100 URLs
sitemap-posts.xml:    120 URLs (30 duplicates with blog)
sitemap-featured.xml:  50 URLs (20 duplicates with blog)
-------------------------------------------
Total unique URLs:    200 URLs (not 270)
```

The system uses a `Set` to ensure each URL is only crawled once.

## API Reference

### List Sitemaps Endpoint

**POST** `/api/multi-page-crawler/list-sitemaps`

**Request:**
```json
{
  "url": "https://example.com"
}
```

**Response:**
```json
{
  "success": true,
  "found": true,
  "sitemaps": [
    {
      "url": "string",
      "type": "sitemap" | "sitemap_index",
      "estimatedUrls": number
    }
  ],
  "totalSitemaps": number,
  "totalEstimatedUrls": number
}
```

### Detect Sitemap Endpoint

**POST** `/api/multi-page-crawler/detect-sitemap`

**Request:**
```json
{
  "url": "https://example.com",
  "parseAll": boolean  // Optional, default: false
}
```

**Response:**
```json
{
  "success": true,
  "found": true,
  "sitemapUrl": "string",  // First sitemap
  "totalUrls": number,
  "totalSitemaps": number,
  "allSitemaps": ["string"],
  "parseTime": number,
  "parsedAll": boolean,
  "urls": ["string"]  // First 10 URLs
}
```

### Parse Sitemap Endpoint

**POST** `/api/multi-page-crawler/parse-sitemap`

**Request (single sitemap):**
```json
{
  "sitemapUrl": "https://example.com/sitemap.xml",
  "includePatterns": ["string"],  // Optional
  "excludePatterns": ["string"]   // Optional
}
```

**Request (multiple sitemaps):**
```json
{
  "sitemapUrls": ["https://example.com/sitemap-1.xml", "..."],
  "includePatterns": ["string"],  // Optional
  "excludePatterns": ["string"]   // Optional
}
```

**Response:**
```json
{
  "success": true,
  "sitemapUrl": "string",         // If single
  "sitemapUrls": ["string"],      // If multiple
  "totalUrls": number,
  "filteredUrls": number,
  "totalSitemaps": number,
  "parseTime": number,
  "urls": ["string"],             // First 20 URLs
  "allSitemaps": ["string"]
}
```

### Start Crawl Endpoint

**POST** `/api/multi-page-crawler/start`

**Request (auto-detect):**
```json
{
  "url": "https://example.com",
  "useSitemap": true,
  "maxPages": 100
}
```

**Request (single sitemap):**
```json
{
  "url": "https://example.com",
  "sitemapUrl": "https://example.com/sitemap.xml",
  "maxPages": 100
}
```

**Request (multiple sitemaps):**
```json
{
  "url": "https://example.com",
  "sitemapUrls": [
    "https://example.com/sitemap-1.xml",
    "https://example.com/sitemap-2.xml"
  ],
  "includePatterns": ["string"],  // Optional
  "excludePatterns": ["string"],  // Optional
  "maxPages": 200,
  "concurrency": 10
}
```

## Troubleshooting

### Issue: No Sitemaps Found

**Possible causes:**
1. Website doesn't have a sitemap
2. Sitemap not in standard location
3. Sitemap blocked by robots.txt or authentication

**Solutions:**
```bash
# 1. Check robots.txt
GET https://example.com/robots.txt

# 2. Try common locations manually
GET https://example.com/sitemap.xml
GET https://example.com/sitemap_index.xml
GET https://example.com/wp-sitemap.xml

# 3. Fall back to regular crawling
POST /api/multi-page-crawler/start
{
  "url": "https://example.com",
  "useSitemap": false,  // Disable sitemap
  "maxPages": 50
}
```

### Issue: Sitemap Index Has Too Many Sitemaps

The system limits to **50 sitemaps** from an index to prevent abuse.

**Solution:** Specify only needed sitemaps:
```json
{
  "sitemapUrls": [
    "https://example.com/sitemap-products.xml",
    "https://example.com/sitemap-blog.xml"
  ]
}
```

### Issue: Duplicate Content from Multiple Sitemaps

URLs are automatically deduplicated, but pages might be crawled if they have slightly different URLs.

**Solution:** Use filters to be more specific:
```json
{
  "sitemapUrls": ["..."],
  "includePatterns": ["/blog/2024/*"],
  "excludePatterns": ["/blog/2024/draft-*"]
}
```

### Issue: Some Sitemaps Fail to Parse

The system uses `Promise.allSettled()` to handle partial failures.

**Logs will show:**
```
✓ Parsed sitemap 1/3: 234 URLs
✗ Failed to parse sitemap 2/3: Network timeout
✓ Parsed sitemap 3/3: 145 URLs
Merged results: 379 unique URLs from 2 sitemaps
```

**Solution:** Check failed sitemap URL manually and retry or exclude it.

## Best Practices

### 1. Always Start with List
```bash
# Step 1: Discover
POST /api/multi-page-crawler/list-sitemaps

# Step 2: Select
POST /api/multi-page-crawler/parse-sitemap

# Step 3: Crawl
POST /api/multi-page-crawler/start
```

### 2. Use Filters for Large Sites
Don't crawl everything if you only need a subset:
```json
{
  "sitemapUrls": ["..."],
  "includePatterns": ["/blog/2024/*", "/products/featured/*"],
  "maxPages": 100
}
```

### 3. Optimize Concurrency
Higher concurrency = faster, but more server load:
- **Testing:** `concurrency: 3-5`
- **Production:** `concurrency: 10-15`
- **Maximum:** `concurrency: 20`

### 4. Monitor Progress
Poll the status endpoint:
```bash
GET /api/multi-page-crawler/status/{crawlId}
```

Check `crawlMethod` to verify sitemap was used:
```json
{
  "crawlMethod": "sitemap",
  "sitemapUsed": "https://example.com/sitemap.xml, ..."
}
```

### 5. Handle Failures Gracefully
Always have a fallback:
```json
{
  "useSitemap": true,  // Try sitemap first
  "maxDepth": 3        // Fall back to regular crawling if sitemap fails
}
```

## Summary

Website Cloner Pro provides comprehensive multiple sitemap support:

✅ **Auto-detect** all available sitemaps
✅ **Parse** single or multiple sitemaps in parallel
✅ **Merge** URLs from multiple sources with deduplication
✅ **Filter** by include/exclude patterns
✅ **Fallback** to regular crawling automatically
✅ **Track** which sitemaps were used

This gives you complete flexibility to clone websites exactly how you need, whether it's a single section, multiple sections, or the entire site.
