import puppeteer, { Browser, Page } from 'puppeteer';
import { URL } from 'url';
import fs from 'fs';
import path from 'path';
import axios from 'axios';
import { getSitemapParserService } from './SitemapParserService.js';

export interface CrawlOptions {
  maxPages?: number;
  maxDepth?: number;
  sameDomainOnly?: boolean;
  includeSubdomains?: boolean;
  excludePatterns?: string[];
  includePatterns?: string[];
  includeAssets?: boolean;
  followExternalLinks?: boolean;
  useSitemap?: boolean; // Auto-detect and use sitemap if available
  sitemapUrl?: string; // Specific sitemap URL to use (single)
  sitemapUrls?: string[]; // Multiple sitemap URLs to use
  concurrency?: number; // Parallel page cloning (for sitemap mode)
}

export interface CrawledPage {
  url: string;
  title: string;
  html: string;
  depth: number;
  links: string[];
  assets: {
    images: string[];
    css: string[];
    js: string[];
    fonts: string[];
  };
  metadata: {
    description?: string;
    keywords?: string;
    ogImage?: string;
  };
}

export interface CrawlResult {
  success: boolean;
  crawlId: string;
  startUrl: string;
  pages: CrawledPage[];
  totalPages: number;
  totalAssets: number;
  sitemap: SiteMapNode[];
  outputPath: string;
  crawlMethod: 'sitemap' | 'regular'; // How the site was crawled
  sitemapUsed?: string; // Sitemap URL if used
}

export interface SiteMapNode {
  url: string;
  title: string;
  depth: number;
  children: SiteMapNode[];
}

export class MultiPageCrawlerService {
  private browser: Browser | null = null;
  private visitedUrls: Set<string> = new Set();
  private crawledPages: CrawledPage[] = [];
  private baseUrl: string = '';
  private baseDomain: string = '';
  private outputDir: string;

  constructor() {
    this.outputDir = path.join(process.cwd(), 'crawled-sites');
    this.ensureOutputDirectory();
  }

  /**
   * Ensure output directory exists
   */
  private async ensureOutputDirectory() {
    try {
      await fs.promises.mkdir(this.outputDir, { recursive: true });
    } catch (error) {
      console.error('Failed to create output directory:', error);
    }
  }

  /**
   * Generate unique crawl ID
   */
  private generateCrawlId(): string {
    return `crawl_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Start multi-page crawl (with automatic sitemap detection)
   */
  async crawlWebsite(startUrl: string, options: CrawlOptions = {}): Promise<CrawlResult> {
    const {
      maxPages = 50,
      maxDepth = 3,
      sameDomainOnly = true,
      includeSubdomains = false,
      excludePatterns = [],
      includePatterns = [],
      includeAssets = true,
      useSitemap = true, // Default: try sitemap first
      sitemapUrl,
      sitemapUrls,
      concurrency = 5,
    } = options;

    // Reset state
    this.visitedUrls.clear();
    this.crawledPages = [];

    // Parse base URL
    const parsedUrl = new URL(startUrl);
    this.baseUrl = `${parsedUrl.protocol}//${parsedUrl.host}`;
    this.baseDomain = parsedUrl.hostname;

    // Generate crawl ID and output path
    const crawlId = this.generateCrawlId();
    const outputPath = path.join(this.outputDir, crawlId);
    await fs.promises.mkdir(outputPath, { recursive: true });

    let crawlMethod: 'sitemap' | 'regular' = 'regular';
    let sitemapUsedUrl: string | undefined;

    // Try sitemap-based crawling first (if enabled)
    if (useSitemap || sitemapUrl || sitemapUrls) {
      try {
        console.log('🗺️  Attempting sitemap-based crawling...');
        const sitemapParser = getSitemapParserService();

        // Get sitemap URLs
        let urls: string[] = [];

        if (sitemapUrls && sitemapUrls.length > 0) {
          // Use specified multiple sitemap URLs
          console.log(`Using ${sitemapUrls.length} specified sitemaps:`, sitemapUrls);
          const result = await sitemapParser.parseMultipleSitemaps(sitemapUrls);
          urls = result.urls;
          sitemapUsedUrl = sitemapUrls.join(', ');
        } else if (sitemapUrl) {
          // Use specified single sitemap URL
          console.log('Using specified sitemap:', sitemapUrl);
          const result = await sitemapParser.parseSitemap(sitemapUrl);
          urls = result.urls;
          sitemapUsedUrl = sitemapUrl;
        } else {
          // Auto-detect sitemap
          console.log('Auto-detecting sitemap for:', this.baseUrl);
          const result = await sitemapParser.autoDetectAndParse(this.baseUrl);

          if (result && result.urls.length > 0) {
            urls = result.urls;
            sitemapUsedUrl = result.sitemaps[0];
            console.log(`✅ Found sitemap with ${urls.length} URLs`);
          }
        }

        // Filter URLs by patterns
        if (urls.length > 0) {
          urls = sitemapParser.filterUrls(urls, includePatterns, excludePatterns);

          // Limit to maxPages
          if (urls.length > maxPages) {
            console.log(`Limiting URLs from ${urls.length} to ${maxPages}`);
            urls = urls.slice(0, maxPages);
          }

          // Use sitemap-based crawling
          console.log(`🚀 Using SITEMAP crawling for ${urls.length} pages`);
          await this.crawlFromSitemap(urls, concurrency);
          crawlMethod = 'sitemap';
        }
      } catch (error) {
        console.log('⚠️  Sitemap crawling failed, falling back to regular crawling');
        console.error('Sitemap error:', error);
      }
    }

    // Fallback to regular crawling if sitemap failed or disabled
    if (this.crawledPages.length === 0) {
      console.log('🔄 Using REGULAR crawling (link discovery)');

      // Start browser for regular crawling
      this.browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });

      try {
        await this.crawlPage(startUrl, 0, maxDepth, maxPages, sameDomainOnly, includeSubdomains, excludePatterns);
      } finally {
        if (this.browser) {
          await this.browser.close();
          this.browser = null;
        }
      }

      crawlMethod = 'regular';
    }

    // Download assets if requested
    if (includeAssets) {
      await this.downloadAssets(outputPath);
    }

    // Save pages to files
    await this.savePages(outputPath);

    // Build sitemap
    const sitemap = this.buildSitemap();

    // Count total assets
    const totalAssets = this.crawledPages.reduce((acc, page) => {
      return acc +
        page.assets.images.length +
        page.assets.css.length +
        page.assets.js.length +
        page.assets.fonts.length;
    }, 0);

    console.log(`✅ Crawl complete: ${this.crawledPages.length} pages, method: ${crawlMethod}`);

    return {
      success: true,
      crawlId,
      startUrl,
      pages: this.crawledPages,
      totalPages: this.crawledPages.length,
      totalAssets,
      sitemap,
      outputPath,
      crawlMethod,
      sitemapUsed: sitemapUsedUrl,
    };
  }

  /**
   * Crawl pages from sitemap (parallel execution for speed)
   */
  private async crawlFromSitemap(urls: string[], concurrency: number = 5): Promise<void> {
    console.log(`Crawling ${urls.length} pages from sitemap with concurrency ${concurrency}...`);

    // Start browser
    this.browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      // Process URLs in batches for parallel execution
      for (let i = 0; i < urls.length; i += concurrency) {
        const batch = urls.slice(i, i + concurrency);
        const batchNum = Math.floor(i / concurrency) + 1;
        const totalBatches = Math.ceil(urls.length / concurrency);

        console.log(`Processing batch ${batchNum}/${totalBatches} (${batch.length} pages)...`);

        // Clone all pages in batch in parallel
        await Promise.all(
          batch.map(async (url) => {
            try {
              await this.cloneSinglePage(url, 0); // Depth 0 for sitemap pages
            } catch (error) {
              console.error(`Failed to clone ${url}:`, error);
            }
          })
        );

        console.log(`Completed batch ${batchNum}/${totalBatches} (total: ${this.crawledPages.length} pages)`);
      }

      console.log(`✅ Sitemap crawling complete: ${this.crawledPages.length} pages cloned`);
    } finally {
      // Close browser
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }
    }
  }

  /**
   * Clone a single page (used by sitemap crawling)
   */
  private async cloneSinglePage(url: string, depth: number): Promise<void> {
    // Skip if already visited
    if (this.visitedUrls.has(url)) {
      return;
    }

    this.visitedUrls.add(url);

    try {
      if (!this.browser) {
        throw new Error('Browser not initialized');
      }

      const page = await this.browser.newPage();

      // Set viewport
      await page.setViewport({ width: 1920, height: 1080 });

      // Navigate to page
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

      // Extract page data
      const pageData = await page.evaluate(() => {
        const title = document.title;
        const html = document.documentElement.outerHTML;
        const links = Array.from(document.querySelectorAll('a[href]')).map(
          (a) => (a as HTMLAnchorElement).href
        );

        const images = Array.from(document.querySelectorAll('img[src]')).map(
          (img) => (img as HTMLImageElement).src
        );

        const cssLinks = Array.from(
          document.querySelectorAll('link[rel="stylesheet"]')
        ).map((link) => (link as HTMLLinkElement).href);

        const jsLinks = Array.from(document.querySelectorAll('script[src]')).map(
          (script) => (script as HTMLScriptElement).src
        );

        const fonts: string[] = [];
        Array.from(document.styleSheets).forEach((sheet) => {
          try {
            Array.from(sheet.cssRules || []).forEach((rule) => {
              if (rule instanceof CSSFontFaceRule) {
                const src = rule.style.getPropertyValue('src');
                const urlMatch = src.match(/url\(['"]?([^'"]+)['"]?\)/);
                if (urlMatch) {
                  fonts.push(urlMatch[1]);
                }
              }
            });
          } catch (e) {
            // Cross-origin stylesheet
          }
        });

        const getMetaContent = (name: string) => {
          const meta = document.querySelector(`meta[name="${name}"]`);
          return meta?.getAttribute('content') || undefined;
        };

        const getOgContent = (property: string) => {
          const meta = document.querySelector(`meta[property="${property}"]`);
          return meta?.getAttribute('content') || undefined;
        };

        return {
          title,
          html,
          links,
          images,
          cssLinks,
          jsLinks,
          fonts,
          metadata: {
            description: getMetaContent('description'),
            keywords: getMetaContent('keywords'),
            ogImage: getOgContent('og:image'),
          },
        };
      });

      // Store crawled page
      const crawledPage: CrawledPage = {
        url,
        title: pageData.title,
        html: pageData.html,
        depth,
        links: pageData.links,
        assets: {
          images: pageData.images,
          css: pageData.cssLinks,
          js: pageData.jsLinks,
          fonts: pageData.fonts,
        },
        metadata: pageData.metadata,
      };

      this.crawledPages.push(crawledPage);

      await page.close();
    } catch (error) {
      console.error(`Failed to clone ${url}:`, error);
      throw error;
    }
  }

  /**
   * Crawl individual page
   */
  private async crawlPage(
    url: string,
    depth: number,
    maxDepth: number,
    maxPages: number,
    sameDomainOnly: boolean,
    includeSubdomains: boolean,
    excludePatterns: string[]
  ): Promise<void> {
    // Check if already visited or max pages reached
    if (this.visitedUrls.has(url) || this.crawledPages.length >= maxPages || depth > maxDepth) {
      return;
    }

    // Check if URL matches exclude patterns
    if (excludePatterns.some(pattern => url.includes(pattern))) {
      return;
    }

    // Check domain restrictions
    const urlObj = new URL(url);
    if (sameDomainOnly) {
      if (includeSubdomains) {
        if (!urlObj.hostname.endsWith(this.baseDomain)) {
          return;
        }
      } else {
        if (urlObj.hostname !== this.baseDomain) {
          return;
        }
      }
    }

    // Mark as visited
    this.visitedUrls.add(url);

    try {
      if (!this.browser) return;

      const page = await this.browser.newPage();

      // Set viewport
      await page.setViewport({ width: 1920, height: 1080 });

      // Navigate to page
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

      // Extract page data
      const pageData = await page.evaluate(() => {
        // Get title
        const title = document.title;

        // Get HTML
        const html = document.documentElement.outerHTML;

        // Get all links
        const links = Array.from(document.querySelectorAll('a[href]')).map(
          (a) => (a as HTMLAnchorElement).href
        );

        // Get assets
        const images = Array.from(document.querySelectorAll('img[src]')).map(
          (img) => (img as HTMLImageElement).src
        );

        const cssLinks = Array.from(
          document.querySelectorAll('link[rel="stylesheet"]')
        ).map((link) => (link as HTMLLinkElement).href);

        const jsLinks = Array.from(document.querySelectorAll('script[src]')).map(
          (script) => (script as HTMLScriptElement).src
        );

        // Get fonts (from CSS @font-face rules)
        const fonts: string[] = [];
        Array.from(document.styleSheets).forEach((sheet) => {
          try {
            Array.from(sheet.cssRules || []).forEach((rule) => {
              if (rule instanceof CSSFontFaceRule) {
                const src = rule.style.getPropertyValue('src');
                const urlMatch = src.match(/url\(['"]?([^'"]+)['"]?\)/);
                if (urlMatch) {
                  fonts.push(urlMatch[1]);
                }
              }
            });
          } catch (e) {
            // Cross-origin stylesheet
          }
        });

        // Get metadata
        const getMetaContent = (name: string) => {
          const meta = document.querySelector(`meta[name="${name}"]`);
          return meta?.getAttribute('content') || undefined;
        };

        const getOgContent = (property: string) => {
          const meta = document.querySelector(`meta[property="${property}"]`);
          return meta?.getAttribute('content') || undefined;
        };

        return {
          title,
          html,
          links,
          images,
          cssLinks,
          jsLinks,
          fonts,
          metadata: {
            description: getMetaContent('description'),
            keywords: getMetaContent('keywords'),
            ogImage: getOgContent('og:image'),
          },
        };
      });

      // Store crawled page
      const crawledPage: CrawledPage = {
        url,
        title: pageData.title,
        html: pageData.html,
        depth,
        links: pageData.links,
        assets: {
          images: pageData.images,
          css: pageData.cssLinks,
          js: pageData.jsLinks,
          fonts: pageData.fonts,
        },
        metadata: pageData.metadata,
      };

      this.crawledPages.push(crawledPage);

      await page.close();

      // Crawl linked pages (if within depth limit)
      if (depth < maxDepth) {
        const internalLinks = pageData.links.filter((link) => {
          try {
            const linkUrl = new URL(link);
            // Filter internal links only
            if (sameDomainOnly) {
              if (includeSubdomains) {
                return linkUrl.hostname.endsWith(this.baseDomain);
              } else {
                return linkUrl.hostname === this.baseDomain;
              }
            }
            return true;
          } catch {
            return false;
          }
        });

        // Crawl internal links
        for (const link of internalLinks) {
          if (this.crawledPages.length >= maxPages) break;
          await this.crawlPage(
            link,
            depth + 1,
            maxDepth,
            maxPages,
            sameDomainOnly,
            includeSubdomains,
            excludePatterns
          );
        }
      }
    } catch (error) {
      console.error(`Failed to crawl ${url}:`, error);
    }
  }

  /**
   * Download assets to local files
   */
  private async downloadAssets(outputPath: string) {
    const assetsDir = path.join(outputPath, 'assets');
    await fs.promises.mkdir(assetsDir, { recursive: true });

    // Create subdirectories
    await fs.promises.mkdir(path.join(assetsDir, 'images'), { recursive: true });
    await fs.promises.mkdir(path.join(assetsDir, 'css'), { recursive: true });
    await fs.promises.mkdir(path.join(assetsDir, 'js'), { recursive: true });
    await fs.promises.mkdir(path.join(assetsDir, 'fonts'), { recursive: true });

    const downloadedAssets = new Set<string>();

    for (const page of this.crawledPages) {
      // Download images
      for (const imageUrl of page.assets.images) {
        if (!downloadedAssets.has(imageUrl)) {
          await this.downloadAsset(imageUrl, path.join(assetsDir, 'images'));
          downloadedAssets.add(imageUrl);
        }
      }

      // Download CSS
      for (const cssUrl of page.assets.css) {
        if (!downloadedAssets.has(cssUrl)) {
          await this.downloadAsset(cssUrl, path.join(assetsDir, 'css'));
          downloadedAssets.add(cssUrl);
        }
      }

      // Download JS
      for (const jsUrl of page.assets.js) {
        if (!downloadedAssets.has(jsUrl)) {
          await this.downloadAsset(jsUrl, path.join(assetsDir, 'js'));
          downloadedAssets.add(jsUrl);
        }
      }

      // Download fonts
      for (const fontUrl of page.assets.fonts) {
        if (!downloadedAssets.has(fontUrl)) {
          await this.downloadAsset(fontUrl, path.join(assetsDir, 'fonts'));
          downloadedAssets.add(fontUrl);
        }
      }
    }
  }

  /**
   * Download individual asset
   */
  private async downloadAsset(url: string, destDir: string) {
    try {
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 10000,
      });

      const urlObj = new URL(url);
      const filename = path.basename(urlObj.pathname) || 'index';
      const filepath = path.join(destDir, filename);

      await fs.promises.writeFile(filepath, response.data);
    } catch (error) {
      console.error(`Failed to download asset ${url}:`, error);
    }
  }

  /**
   * Save pages to HTML files
   */
  private async savePages(outputPath: string) {
    const pagesDir = path.join(outputPath, 'pages');
    await fs.promises.mkdir(pagesDir, { recursive: true });

    for (let i = 0; i < this.crawledPages.length; i++) {
      const page = this.crawledPages[i];
      const filename = i === 0 ? 'index.html' : `page-${i}.html`;
      const filepath = path.join(pagesDir, filename);

      await fs.promises.writeFile(filepath, page.html, 'utf-8');
    }

    // Save metadata
    const metadata = {
      startUrl: this.baseUrl,
      totalPages: this.crawledPages.length,
      crawledAt: new Date().toISOString(),
      pages: this.crawledPages.map((page, index) => ({
        index,
        url: page.url,
        title: page.title,
        depth: page.depth,
        filename: index === 0 ? 'index.html' : `page-${index}.html`,
      })),
    };

    await fs.promises.writeFile(
      path.join(outputPath, 'metadata.json'),
      JSON.stringify(metadata, null, 2),
      'utf-8'
    );
  }

  /**
   * Build sitemap from crawled pages
   */
  private buildSitemap(): SiteMapNode[] {
    const rootPages = this.crawledPages.filter((page) => page.depth === 0);
    const sitemap: SiteMapNode[] = [];

    for (const page of rootPages) {
      sitemap.push(this.buildSitemapNode(page));
    }

    return sitemap;
  }

  /**
   * Build sitemap node recursively
   */
  private buildSitemapNode(page: CrawledPage): SiteMapNode {
    const children = this.crawledPages
      .filter((p) => p.depth === page.depth + 1 && page.links.includes(p.url))
      .map((p) => this.buildSitemapNode(p));

    return {
      url: page.url,
      title: page.title,
      depth: page.depth,
      children,
    };
  }

  /**
   * Get crawl status
   */
  getCrawlStatus() {
    return {
      pagesVisited: this.visitedUrls.size,
      pagesCrawled: this.crawledPages.length,
    };
  }

  /**
   * Export selected pages from a completed crawl
   * @param crawlId - The ID of the completed crawl
   * @param pageIndices - Array of page indices to export (0-based)
   * @param includeAssets - Whether to include assets for selected pages
   */
  async exportSelectedPages(
    crawlId: string,
    pageIndices: number[],
    includeAssets: boolean = true
  ): Promise<{
    success: boolean;
    exportId: string;
    outputPath: string;
    exportedPages: number;
    exportedAssets: number;
  }> {
    // Load the original crawl data
    const originalCrawlPath = path.join(this.outputDir, crawlId);
    const metadataPath = path.join(originalCrawlPath, 'metadata.json');

    // Check if crawl exists
    if (!fs.existsSync(metadataPath)) {
      throw new Error(`Crawl ${crawlId} not found`);
    }

    // Read metadata
    const metadataContent = await fs.promises.readFile(metadataPath, 'utf-8');
    const metadata = JSON.parse(metadataContent);

    // Validate page indices
    const maxIndex = metadata.pages.length - 1;
    const invalidIndices = pageIndices.filter(idx => idx < 0 || idx > maxIndex);
    if (invalidIndices.length > 0) {
      throw new Error(`Invalid page indices: ${invalidIndices.join(', ')}. Valid range: 0-${maxIndex}`);
    }

    // Create export directory
    const exportId = `export_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const exportPath = path.join(this.outputDir, exportId);
    await fs.promises.mkdir(exportPath, { recursive: true });

    // Create subdirectories
    const pagesDir = path.join(exportPath, 'pages');
    await fs.promises.mkdir(pagesDir, { recursive: true });

    // Copy selected pages
    const exportedPages: any[] = [];
    const selectedAssets = new Set<string>();

    for (let i = 0; i < pageIndices.length; i++) {
      const pageIndex = pageIndices[i];
      const pageInfo = metadata.pages[pageIndex];

      // Copy HTML file
      const sourceFile = path.join(originalCrawlPath, 'pages', pageInfo.filename);
      const destFilename = i === 0 ? 'index.html' : `page-${i}.html`;
      const destFile = path.join(pagesDir, destFilename);

      await fs.promises.copyFile(sourceFile, destFile);

      // Read page HTML to extract assets if needed
      if (includeAssets) {
        const htmlContent = await fs.promises.readFile(sourceFile, 'utf-8');

        // Extract asset URLs from HTML
        const imgMatches = htmlContent.matchAll(/src=["']([^"']+)["']/g);
        for (const match of imgMatches) {
          selectedAssets.add(match[1]);
        }

        const cssMatches = htmlContent.matchAll(/href=["']([^"']+\.css)["']/g);
        for (const match of cssMatches) {
          selectedAssets.add(match[1]);
        }

        const jsMatches = htmlContent.matchAll(/src=["']([^"']+\.js)["']/g);
        for (const match of jsMatches) {
          selectedAssets.add(match[1]);
        }
      }

      exportedPages.push({
        index: i,
        originalIndex: pageIndex,
        url: pageInfo.url,
        title: pageInfo.title,
        filename: destFilename,
      });
    }

    // Copy assets if requested
    let exportedAssets = 0;
    if (includeAssets) {
      const assetsDir = path.join(exportPath, 'assets');
      const sourceAssetsDir = path.join(originalCrawlPath, 'assets');

      if (fs.existsSync(sourceAssetsDir)) {
        await fs.promises.mkdir(assetsDir, { recursive: true });
        await fs.promises.mkdir(path.join(assetsDir, 'images'), { recursive: true });
        await fs.promises.mkdir(path.join(assetsDir, 'css'), { recursive: true });
        await fs.promises.mkdir(path.join(assetsDir, 'js'), { recursive: true });
        await fs.promises.mkdir(path.join(assetsDir, 'fonts'), { recursive: true });

        // Copy all assets from original crawl
        // (We copy all assets since extracting specific ones from HTML is complex)
        const assetTypes = ['images', 'css', 'js', 'fonts'];

        for (const assetType of assetTypes) {
          const sourceDir = path.join(sourceAssetsDir, assetType);
          const destDir = path.join(assetsDir, assetType);

          if (fs.existsSync(sourceDir)) {
            const files = await fs.promises.readdir(sourceDir);
            for (const file of files) {
              const sourceFile = path.join(sourceDir, file);
              const destFile = path.join(destDir, file);
              await fs.promises.copyFile(sourceFile, destFile);
              exportedAssets++;
            }
          }
        }
      }
    }

    // Save export metadata
    const exportMetadata = {
      exportId,
      originalCrawlId: crawlId,
      exportedAt: new Date().toISOString(),
      totalPages: exportedPages.length,
      includeAssets,
      pages: exportedPages,
    };

    await fs.promises.writeFile(
      path.join(exportPath, 'metadata.json'),
      JSON.stringify(exportMetadata, null, 2),
      'utf-8'
    );

    console.log(`✅ Exported ${exportedPages.length} pages to ${exportPath}`);

    return {
      success: true,
      exportId,
      outputPath: exportPath,
      exportedPages: exportedPages.length,
      exportedAssets,
    };
  }
}

export default new MultiPageCrawlerService();
