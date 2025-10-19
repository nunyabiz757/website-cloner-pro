import express from 'express';
import multiPageCrawlerService from '../services/MultiPageCrawlerService.js';

const router = express.Router();

// Store active crawls
const activeCrawls = new Map<string, any>();

/**
 * POST /api/multi-page-crawler/start
 * Start multi-page crawl
 */
router.post('/start', async (req, res) => {
  try {
    const {
      url,
      maxPages = 50,
      maxDepth = 3,
      sameDomainOnly = true,
      includeSubdomains = false,
      excludePatterns = [],
      includePatterns = [],
      includeAssets = true,
      followExternalLinks = false,
      useSitemap = true,
      sitemapUrl,
      sitemapUrls,
      concurrency = 5
    } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL is required'
      });
    }

    // Validate URL
    try {
      new URL(url);
    } catch {
      return res.status(400).json({
        success: false,
        error: 'Invalid URL format'
      });
    }

    // Validate sitemap URL if provided
    if (sitemapUrl) {
      try {
        new URL(sitemapUrl);
      } catch {
        return res.status(400).json({
          success: false,
          error: 'Invalid sitemap URL format'
        });
      }
    }

    // Validate multiple sitemap URLs if provided
    if (sitemapUrls && Array.isArray(sitemapUrls)) {
      for (const url of sitemapUrls) {
        try {
          new URL(url);
        } catch {
          return res.status(400).json({
            success: false,
            error: `Invalid sitemap URL format: ${url}`
          });
        }
      }
    }

    // Validate concurrency
    if (concurrency < 1 || concurrency > 20) {
      return res.status(400).json({
        success: false,
        error: 'Concurrency must be between 1 and 20'
      });
    }

    // Start crawl in background
    const crawlPromise = multiPageCrawlerService.crawlWebsite(url, {
      maxPages,
      maxDepth,
      sameDomainOnly,
      includeSubdomains,
      excludePatterns,
      includePatterns,
      includeAssets,
      followExternalLinks,
      useSitemap,
      sitemapUrl,
      sitemapUrls,
      concurrency
    });

    // Generate temporary ID for tracking
    const crawlId = `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    activeCrawls.set(crawlId, {
      promise: crawlPromise,
      startTime: Date.now(),
      url,
      status: 'running'
    });

    // Handle crawl completion
    crawlPromise.then(result => {
      const crawl = activeCrawls.get(crawlId);
      if (crawl) {
        crawl.status = 'completed';
        crawl.result = result;
      }
    }).catch(error => {
      const crawl = activeCrawls.get(crawlId);
      if (crawl) {
        crawl.status = 'failed';
        crawl.error = error.message;
      }
    });

    res.json({
      success: true,
      crawlId,
      message: 'Crawl started successfully',
      status: 'running'
    });
  } catch (error) {
    console.error('Start crawl error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to start crawl'
    });
  }
});

/**
 * GET /api/multi-page-crawler/status/:crawlId
 * Get crawl status
 */
router.get('/status/:crawlId', async (req, res) => {
  try {
    const { crawlId } = req.params;

    const crawl = activeCrawls.get(crawlId);

    if (!crawl) {
      return res.status(404).json({
        success: false,
        error: 'Crawl not found'
      });
    }

    // Get current status from service
    const currentStatus = multiPageCrawlerService.getCrawlStatus();

    res.json({
      success: true,
      crawlId,
      status: crawl.status,
      url: crawl.url,
      startTime: crawl.startTime,
      elapsedTime: Date.now() - crawl.startTime,
      pagesVisited: currentStatus.pagesVisited,
      pagesCrawled: currentStatus.pagesCrawled,
      ...(crawl.status === 'completed' && crawl.result ? {
        result: {
          totalPages: crawl.result.totalPages,
          totalAssets: crawl.result.totalAssets,
          outputPath: crawl.result.outputPath,
          crawlMethod: crawl.result.crawlMethod,
          sitemapUsed: crawl.result.sitemapUsed
        }
      } : {}),
      ...(crawl.status === 'failed' && crawl.error ? {
        error: crawl.error
      } : {})
    });
  } catch (error) {
    console.error('Get crawl status error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get crawl status'
    });
  }
});

/**
 * GET /api/multi-page-crawler/result/:crawlId
 * Get crawl result
 */
router.get('/result/:crawlId', async (req, res) => {
  try {
    const { crawlId } = req.params;

    const crawl = activeCrawls.get(crawlId);

    if (!crawl) {
      return res.status(404).json({
        success: false,
        error: 'Crawl not found'
      });
    }

    if (crawl.status !== 'completed') {
      return res.status(400).json({
        success: false,
        error: `Crawl is ${crawl.status}`,
        status: crawl.status
      });
    }

    res.json({
      success: true,
      ...crawl.result
    });
  } catch (error) {
    console.error('Get crawl result error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get crawl result'
    });
  }
});

/**
 * GET /api/multi-page-crawler/sitemap/:crawlId
 * Get sitemap for crawled site
 */
router.get('/sitemap/:crawlId', async (req, res) => {
  try {
    const { crawlId } = req.params;

    const crawl = activeCrawls.get(crawlId);

    if (!crawl) {
      return res.status(404).json({
        success: false,
        error: 'Crawl not found'
      });
    }

    if (crawl.status !== 'completed') {
      return res.status(400).json({
        success: false,
        error: `Crawl is ${crawl.status}`
      });
    }

    res.json({
      success: true,
      crawlId,
      startUrl: crawl.result.startUrl,
      sitemap: crawl.result.sitemap
    });
  } catch (error) {
    console.error('Get sitemap error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get sitemap'
    });
  }
});

/**
 * GET /api/multi-page-crawler/pages/:crawlId
 * Get all pages from crawl
 */
router.get('/pages/:crawlId', async (req, res) => {
  try {
    const { crawlId } = req.params;

    const crawl = activeCrawls.get(crawlId);

    if (!crawl) {
      return res.status(404).json({
        success: false,
        error: 'Crawl not found'
      });
    }

    if (crawl.status !== 'completed') {
      return res.status(400).json({
        success: false,
        error: `Crawl is ${crawl.status}`
      });
    }

    res.json({
      success: true,
      crawlId,
      totalPages: crawl.result.totalPages,
      pages: crawl.result.pages.map((page: any) => ({
        url: page.url,
        title: page.title,
        depth: page.depth,
        linksCount: page.links.length,
        assetsCount: page.assets.images.length + page.assets.css.length + page.assets.js.length + page.assets.fonts.length,
        metadata: page.metadata
      }))
    });
  } catch (error) {
    console.error('Get pages error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get pages'
    });
  }
});

/**
 * GET /api/multi-page-crawler/page/:crawlId/:pageIndex
 * Get specific page content
 */
router.get('/page/:crawlId/:pageIndex', async (req, res) => {
  try {
    const { crawlId, pageIndex } = req.params;

    const crawl = activeCrawls.get(crawlId);

    if (!crawl) {
      return res.status(404).json({
        success: false,
        error: 'Crawl not found'
      });
    }

    if (crawl.status !== 'completed') {
      return res.status(400).json({
        success: false,
        error: `Crawl is ${crawl.status}`
      });
    }

    const index = parseInt(pageIndex);
    if (isNaN(index) || index < 0 || index >= crawl.result.pages.length) {
      return res.status(400).json({
        success: false,
        error: 'Invalid page index'
      });
    }

    const page = crawl.result.pages[index];

    res.json({
      success: true,
      page
    });
  } catch (error) {
    console.error('Get page error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get page'
    });
  }
});

/**
 * DELETE /api/multi-page-crawler/cancel/:crawlId
 * Cancel active crawl
 */
router.delete('/cancel/:crawlId', async (req, res) => {
  try {
    const { crawlId } = req.params;

    const crawl = activeCrawls.get(crawlId);

    if (!crawl) {
      return res.status(404).json({
        success: false,
        error: 'Crawl not found'
      });
    }

    if (crawl.status !== 'running') {
      return res.status(400).json({
        success: false,
        error: `Cannot cancel crawl with status: ${crawl.status}`
      });
    }

    // Mark as cancelled
    crawl.status = 'cancelled';
    activeCrawls.delete(crawlId);

    res.json({
      success: true,
      message: 'Crawl cancelled successfully'
    });
  } catch (error) {
    console.error('Cancel crawl error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to cancel crawl'
    });
  }
});

/**
 * GET /api/multi-page-crawler/active
 * Get all active crawls
 */
router.get('/active', async (req, res) => {
  try {
    const active = Array.from(activeCrawls.entries()).map(([id, crawl]) => ({
      crawlId: id,
      url: crawl.url,
      status: crawl.status,
      startTime: crawl.startTime,
      elapsedTime: Date.now() - crawl.startTime
    }));

    res.json({
      success: true,
      activeCrawls: active,
      count: active.length
    });
  } catch (error) {
    console.error('Get active crawls error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get active crawls'
    });
  }
});

/**
 * POST /api/multi-page-crawler/list-sitemaps
 * List all available sitemaps for a URL (without parsing them)
 */
router.post('/list-sitemaps', async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL is required'
      });
    }

    // Validate URL
    try {
      new URL(url);
    } catch {
      return res.status(400).json({
        success: false,
        error: 'Invalid URL format'
      });
    }

    // Import sitemap parser service
    const { getSitemapParserService } = await import('../services/SitemapParserService.js');
    const sitemapParser = getSitemapParserService();

    // List all available sitemaps
    const sitemaps = await sitemapParser.listAvailableSitemaps(url);

    if (sitemaps.length === 0) {
      return res.json({
        success: true,
        found: false,
        sitemaps: [],
        message: 'No sitemaps found for this URL'
      });
    }

    res.json({
      success: true,
      found: true,
      sitemaps,
      totalSitemaps: sitemaps.length,
      totalEstimatedUrls: sitemaps.reduce((sum, s) => sum + (s.estimatedUrls || 0), 0)
    });
  } catch (error) {
    console.error('List sitemaps error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list sitemaps'
    });
  }
});

/**
 * POST /api/multi-page-crawler/detect-sitemap
 * Detect and parse sitemap for a URL
 */
router.post('/detect-sitemap', async (req, res) => {
  try {
    const { url, parseAll = false } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL is required'
      });
    }

    // Validate URL
    try {
      new URL(url);
    } catch {
      return res.status(400).json({
        success: false,
        error: 'Invalid URL format'
      });
    }

    // Import sitemap parser service
    const { getSitemapParserService } = await import('../services/SitemapParserService.js');
    const sitemapParser = getSitemapParserService();

    // Auto-detect sitemap (with option to parse all)
    const result = await sitemapParser.autoDetectAndParse(url, parseAll);

    if (!result) {
      return res.json({
        success: true,
        found: false,
        message: 'No sitemap found for this URL'
      });
    }

    res.json({
      success: true,
      found: true,
      sitemapUrl: result.sitemaps[0],
      totalUrls: result.totalUrls,
      totalSitemaps: result.sitemaps.length,
      allSitemaps: result.sitemaps,
      parseTime: result.parseTime,
      parsedAll: parseAll,
      urls: result.urls.slice(0, 10) // Return first 10 URLs as preview
    });
  } catch (error) {
    console.error('Detect sitemap error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to detect sitemap'
    });
  }
});

/**
 * POST /api/multi-page-crawler/export-selected
 * Export selected pages from a completed crawl
 */
router.post('/export-selected', async (req, res) => {
  try {
    const { crawlId, pageIndices, includeAssets = true } = req.body;

    if (!crawlId) {
      return res.status(400).json({
        success: false,
        error: 'Crawl ID is required'
      });
    }

    if (!pageIndices || !Array.isArray(pageIndices) || pageIndices.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Page indices array is required and must not be empty'
      });
    }

    // Validate all indices are numbers
    const invalidIndices = pageIndices.filter(idx => typeof idx !== 'number');
    if (invalidIndices.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'All page indices must be numbers'
      });
    }

    // Export selected pages
    const result = await multiPageCrawlerService.exportSelectedPages(
      crawlId,
      pageIndices,
      includeAssets
    );

    res.json({
      success: true,
      ...result
    });
  } catch (error) {
    console.error('Export selected pages error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to export selected pages'
    });
  }
});

/**
 * POST /api/multi-page-crawler/parse-sitemap
 * Parse a specific sitemap URL (or multiple sitemap URLs)
 */
router.post('/parse-sitemap', async (req, res) => {
  try {
    const { sitemapUrl, sitemapUrls, includePatterns, excludePatterns } = req.body;

    // Support both single URL and array of URLs
    let urlsToParse: string[] = [];

    if (sitemapUrls && Array.isArray(sitemapUrls)) {
      urlsToParse = sitemapUrls;
    } else if (sitemapUrl) {
      urlsToParse = [sitemapUrl];
    } else {
      return res.status(400).json({
        success: false,
        error: 'Sitemap URL or URLs are required (use sitemapUrl for single, sitemapUrls for multiple)'
      });
    }

    // Validate all sitemap URLs
    for (const url of urlsToParse) {
      try {
        new URL(url);
      } catch {
        return res.status(400).json({
          success: false,
          error: `Invalid sitemap URL format: ${url}`
        });
      }
    }

    // Import sitemap parser service
    const { getSitemapParserService } = await import('../services/SitemapParserService.js');
    const sitemapParser = getSitemapParserService();

    // Parse sitemap(s)
    let result;
    if (urlsToParse.length === 1) {
      result = await sitemapParser.parseSitemap(urlsToParse[0]);
    } else {
      result = await sitemapParser.parseMultipleSitemaps(urlsToParse);
    }

    // Apply filters if provided
    let filteredUrls = result.urls;
    if (includePatterns || excludePatterns) {
      filteredUrls = sitemapParser.filterUrls(result.urls, includePatterns, excludePatterns);
    }

    res.json({
      success: true,
      sitemapUrl: urlsToParse.length === 1 ? urlsToParse[0] : undefined,
      sitemapUrls: urlsToParse.length > 1 ? urlsToParse : undefined,
      totalUrls: result.totalUrls,
      filteredUrls: filteredUrls.length,
      totalSitemaps: result.sitemaps.length,
      parseTime: result.parseTime,
      urls: filteredUrls.slice(0, 20), // Return first 20 URLs as preview
      allSitemaps: result.sitemaps
    });
  } catch (error) {
    console.error('Parse sitemap error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to parse sitemap'
    });
  }
});

export default router;
