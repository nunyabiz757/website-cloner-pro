import axios from 'axios';
import { parseStringPromise } from 'xml2js';
import { URL } from 'url';

/**
 * Sitemap Parser Service
 *
 * Parses XML sitemaps and sitemap indexes to extract all URLs.
 * Supports:
 * - Regular sitemaps (sitemap.xml)
 * - Sitemap indexes (multiple sitemaps)
 * - Nested sitemaps
 * - Gzipped sitemaps (.xml.gz)
 */

export interface SitemapUrl {
  loc: string;
  lastmod?: string;
  changefreq?: string;
  priority?: string;
}

export interface SitemapParseResult {
  urls: string[];
  totalUrls: number;
  sitemaps: string[];
  parseTime: number;
}

export class SitemapParserService {
  private timeout: number = 30000; // 30 seconds
  private maxSitemaps: number = 50; // Max number of sitemaps to parse
  private userAgent: string = 'Website-Cloner-Pro/1.0 (Sitemap Parser)';

  /**
   * Auto-detect and parse sitemap from a domain
   */
  async autoDetectAndParse(baseUrl: string, parseAllSitemaps: boolean = false): Promise<SitemapParseResult | null> {
    const startTime = Date.now();

    try {
      // Try common sitemap locations
      const sitemapUrls = await this.detectSitemapUrls(baseUrl);

      if (sitemapUrls.length === 0) {
        console.log('No sitemap found for', baseUrl);
        return null;
      }

      if (parseAllSitemaps && sitemapUrls.length > 1) {
        // Parse ALL detected sitemaps and merge results
        console.log(`Found ${sitemapUrls.length} sitemap(s), parsing all...`);
        const result = await this.parseMultipleSitemaps(sitemapUrls);
        result.parseTime = Date.now() - startTime;
        return result;
      } else {
        // Parse the first sitemap found (default behavior)
        console.log(`Found ${sitemapUrls.length} sitemap(s), parsing first one:`, sitemapUrls[0]);
        const result = await this.parseSitemap(sitemapUrls[0]);
        result.parseTime = Date.now() - startTime;
        return result;
      }
    } catch (error) {
      console.error('Auto-detect sitemap failed:', error);
      return null;
    }
  }

  /**
   * List all available sitemaps with metadata (without fully parsing them)
   */
  async listAvailableSitemaps(baseUrl: string): Promise<Array<{
    url: string;
    type: 'sitemap' | 'sitemap_index';
    estimatedUrls?: number;
  }>> {
    const sitemapUrls = await this.detectSitemapUrls(baseUrl);
    const sitemapList: Array<{
      url: string;
      type: 'sitemap' | 'sitemap_index';
      estimatedUrls?: number;
    }> = [];

    // Check each sitemap to determine if it's an index or regular sitemap
    for (const url of sitemapUrls) {
      try {
        const xml = await this.fetchSitemap(url);
        const parsed = await parseStringPromise(xml);

        if (parsed.sitemapindex) {
          // It's a sitemap index
          const subSitemaps = this.parseSitemapIndex(parsed.sitemapindex);
          sitemapList.push({
            url,
            type: 'sitemap_index',
            estimatedUrls: subSitemaps.length * 1000, // Rough estimate
          });
        } else {
          // Regular sitemap - count URLs
          const urls = this.extractUrlsFromSitemap(parsed);
          sitemapList.push({
            url,
            type: 'sitemap',
            estimatedUrls: urls.length,
          });
        }
      } catch (error) {
        console.error(`Failed to check sitemap ${url}:`, error);
        // Add it anyway with unknown type
        sitemapList.push({
          url,
          type: 'sitemap',
        });
      }
    }

    return sitemapList;
  }

  /**
   * Detect sitemap URLs from a domain
   */
  async detectSitemapUrls(baseUrl: string): Promise<string[]> {
    const parsedUrl = new URL(baseUrl);
    const origin = `${parsedUrl.protocol}//${parsedUrl.host}`;
    const sitemapUrls: string[] = [];

    // Common sitemap locations
    const commonLocations = [
      '/sitemap.xml',
      '/sitemap_index.xml',
      '/sitemap-index.xml',
      '/sitemap1.xml',
      '/sitemap.xml.gz',
      '/wp-sitemap.xml', // WordPress
      '/sitemaps/sitemap.xml',
      '/sitemap/sitemap.xml',
    ];

    // Try each common location
    for (const location of commonLocations) {
      const url = `${origin}${location}`;
      try {
        const response = await axios.head(url, {
          timeout: 5000,
          validateStatus: (status) => status === 200,
        });

        if (response.status === 200) {
          sitemapUrls.push(url);
          console.log('Found sitemap at:', url);
        }
      } catch (error) {
        // URL doesn't exist, continue
      }
    }

    // Try robots.txt
    try {
      const robotsUrl = `${origin}/robots.txt`;
      const robotsResponse = await axios.get(robotsUrl, {
        timeout: 5000,
        headers: { 'User-Agent': this.userAgent },
      });

      if (robotsResponse.status === 200) {
        const robotsTxt = robotsResponse.data;
        const sitemapMatches = robotsTxt.match(/Sitemap:\s*(.+)/gi);

        if (sitemapMatches) {
          sitemapMatches.forEach((match: string) => {
            const url = match.replace(/Sitemap:\s*/i, '').trim();
            if (url && !sitemapUrls.includes(url)) {
              sitemapUrls.push(url);
              console.log('Found sitemap in robots.txt:', url);
            }
          });
        }
      }
    } catch (error) {
      // robots.txt doesn't exist or error, continue
    }

    return sitemapUrls;
  }

  /**
   * Parse multiple sitemaps and merge results
   */
  async parseMultipleSitemaps(sitemapUrls: string[]): Promise<SitemapParseResult> {
    const startTime = Date.now();
    const allUrls = new Set<string>();
    const allSitemaps: string[] = [];

    console.log(`Parsing ${sitemapUrls.length} sitemaps in parallel...`);

    // Parse all sitemaps in parallel
    const results = await Promise.allSettled(
      sitemapUrls.map(url => this.parseSitemap(url))
    );

    // Merge results from all sitemaps
    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        const sitemapResult = result.value;

        // Add all URLs from this sitemap
        sitemapResult.urls.forEach(url => allUrls.add(url));

        // Add all sitemap URLs (including sub-sitemaps from indexes)
        sitemapResult.sitemaps.forEach(sitemap => {
          if (!allSitemaps.includes(sitemap)) {
            allSitemaps.push(sitemap);
          }
        });

        console.log(`✓ Parsed sitemap ${index + 1}/${sitemapUrls.length}: ${sitemapResult.totalUrls} URLs`);
      } else {
        console.error(`✗ Failed to parse sitemap ${index + 1}/${sitemapUrls.length}:`, result.reason);
      }
    });

    console.log(`Merged results: ${allUrls.size} unique URLs from ${allSitemaps.length} sitemaps`);

    return {
      urls: Array.from(allUrls),
      totalUrls: allUrls.size,
      sitemaps: allSitemaps,
      parseTime: Date.now() - startTime,
    };
  }

  /**
   * Parse a sitemap URL (handles both sitemap and sitemap index)
   */
  async parseSitemap(sitemapUrl: string): Promise<SitemapParseResult> {
    const startTime = Date.now();
    const allUrls = new Set<string>();
    const allSitemaps: string[] = [sitemapUrl];

    try {
      // Fetch sitemap
      const xml = await this.fetchSitemap(sitemapUrl);

      // Parse XML
      const parsed = await parseStringPromise(xml);

      // Check if it's a sitemap index or regular sitemap
      if (parsed.sitemapindex) {
        // Sitemap index - contains links to other sitemaps
        console.log('Detected sitemap index, parsing sub-sitemaps...');
        const subSitemaps = await this.parseSitemapIndex(parsed.sitemapindex);

        // Parse each sub-sitemap
        for (const subSitemapUrl of subSitemaps) {
          if (allSitemaps.length >= this.maxSitemaps) {
            console.log(`Reached max sitemaps limit (${this.maxSitemaps}), stopping`);
            break;
          }

          allSitemaps.push(subSitemapUrl);

          try {
            const subXml = await this.fetchSitemap(subSitemapUrl);
            const subParsed = await parseStringPromise(subXml);
            const urls = this.extractUrlsFromSitemap(subParsed);
            urls.forEach(url => allUrls.add(url));
          } catch (error) {
            console.error(`Failed to parse sub-sitemap ${subSitemapUrl}:`, error);
          }
        }
      } else {
        // Regular sitemap
        const urls = this.extractUrlsFromSitemap(parsed);
        urls.forEach(url => allUrls.add(url));
      }

      return {
        urls: Array.from(allUrls),
        totalUrls: allUrls.size,
        sitemaps: allSitemaps,
        parseTime: Date.now() - startTime,
      };
    } catch (error) {
      console.error('Failed to parse sitemap:', error);
      throw new Error(`Failed to parse sitemap: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Fetch sitemap XML content
   */
  private async fetchSitemap(url: string): Promise<string> {
    try {
      const response = await axios.get(url, {
        timeout: this.timeout,
        headers: {
          'User-Agent': this.userAgent,
          'Accept': 'application/xml, text/xml, */*',
        },
        responseType: url.endsWith('.gz') ? 'arraybuffer' : 'text',
      });

      // Handle gzipped sitemaps
      if (url.endsWith('.gz')) {
        const zlib = await import('zlib');
        const gunzipped = zlib.gunzipSync(response.data);
        return gunzipped.toString('utf-8');
      }

      return response.data;
    } catch (error) {
      throw new Error(`Failed to fetch sitemap from ${url}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Parse sitemap index and extract sub-sitemap URLs
   */
  private parseSitemapIndex(sitemapIndex: any): string[] {
    const sitemaps: string[] = [];

    if (sitemapIndex.sitemap) {
      const sitemapEntries = Array.isArray(sitemapIndex.sitemap)
        ? sitemapIndex.sitemap
        : [sitemapIndex.sitemap];

      sitemapEntries.forEach((entry: any) => {
        if (entry.loc && entry.loc[0]) {
          sitemaps.push(entry.loc[0]);
        }
      });
    }

    return sitemaps;
  }

  /**
   * Extract URLs from parsed sitemap XML
   */
  private extractUrlsFromSitemap(parsed: any): string[] {
    const urls: string[] = [];

    // Handle standard sitemap format
    if (parsed.urlset && parsed.urlset.url) {
      const urlEntries = Array.isArray(parsed.urlset.url)
        ? parsed.urlset.url
        : [parsed.urlset.url];

      urlEntries.forEach((entry: any) => {
        if (entry.loc && entry.loc[0]) {
          urls.push(entry.loc[0]);
        }
      });
    }

    return urls;
  }

  /**
   * Parse sitemap and return detailed URL information
   */
  async parseSitemapDetailed(sitemapUrl: string): Promise<SitemapUrl[]> {
    try {
      const xml = await this.fetchSitemap(sitemapUrl);
      const parsed = await parseStringPromise(xml);
      const detailedUrls: SitemapUrl[] = [];

      if (parsed.urlset && parsed.urlset.url) {
        const urlEntries = Array.isArray(parsed.urlset.url)
          ? parsed.urlset.url
          : [parsed.urlset.url];

        urlEntries.forEach((entry: any) => {
          if (entry.loc && entry.loc[0]) {
            detailedUrls.push({
              loc: entry.loc[0],
              lastmod: entry.lastmod ? entry.lastmod[0] : undefined,
              changefreq: entry.changefreq ? entry.changefreq[0] : undefined,
              priority: entry.priority ? entry.priority[0] : undefined,
            });
          }
        });
      }

      return detailedUrls;
    } catch (error) {
      throw new Error(`Failed to parse sitemap: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate sitemap URL format
   */
  isValidSitemapUrl(url: string): boolean {
    try {
      const parsedUrl = new URL(url);
      const pathname = parsedUrl.pathname.toLowerCase();

      return (
        pathname.endsWith('.xml') ||
        pathname.endsWith('.xml.gz') ||
        pathname.includes('sitemap')
      );
    } catch {
      return false;
    }
  }

  /**
   * Filter URLs by pattern
   */
  filterUrls(urls: string[], includePatterns?: string[], excludePatterns?: string[]): string[] {
    let filtered = [...urls];

    // Apply include patterns
    if (includePatterns && includePatterns.length > 0) {
      filtered = filtered.filter(url =>
        includePatterns.some(pattern => {
          const regex = new RegExp(pattern.replace(/\*/g, '.*'));
          return regex.test(url);
        })
      );
    }

    // Apply exclude patterns
    if (excludePatterns && excludePatterns.length > 0) {
      filtered = filtered.filter(url =>
        !excludePatterns.some(pattern => {
          const regex = new RegExp(pattern.replace(/\*/g, '.*'));
          return regex.test(url);
        })
      );
    }

    return filtered;
  }

  /**
   * Sort URLs by priority (if available)
   */
  sortByPriority(urls: SitemapUrl[]): SitemapUrl[] {
    return urls.sort((a, b) => {
      const priorityA = parseFloat(a.priority || '0.5');
      const priorityB = parseFloat(b.priority || '0.5');
      return priorityB - priorityA; // Higher priority first
    });
  }

  /**
   * Group URLs by domain/subdomain
   */
  groupByDomain(urls: string[]): Record<string, string[]> {
    const grouped: Record<string, string[]> = {};

    urls.forEach(url => {
      try {
        const parsedUrl = new URL(url);
        const domain = parsedUrl.hostname;

        if (!grouped[domain]) {
          grouped[domain] = [];
        }

        grouped[domain].push(url);
      } catch {
        // Invalid URL, skip
      }
    });

    return grouped;
  }

  /**
   * Get sitemap statistics
   */
  async getSitemapStats(sitemapUrl: string): Promise<{
    totalUrls: number;
    domains: number;
    fileSize: number;
    parseTime: number;
  }> {
    const startTime = Date.now();

    const result = await this.parseSitemap(sitemapUrl);
    const grouped = this.groupByDomain(result.urls);

    // Estimate file size (approximate)
    const fileSize = result.sitemaps.length * 50000; // Rough estimate

    return {
      totalUrls: result.totalUrls,
      domains: Object.keys(grouped).length,
      fileSize,
      parseTime: Date.now() - startTime,
    };
  }
}

// Singleton instance
let sitemapParserService: SitemapParserService | null = null;

export function getSitemapParserService(): SitemapParserService {
  if (!sitemapParserService) {
    sitemapParserService = new SitemapParserService();
  }
  return sitemapParserService;
}

export default SitemapParserService;
