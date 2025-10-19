import puppeteer, { Browser, Page } from 'puppeteer';
import * as cheerio from 'cheerio';
import path from 'path';
import fs from 'fs/promises';
import { createWriteStream } from 'fs';
import https from 'https';
import http from 'http';
import crypto from 'crypto';
import type {
  CloneRequest,
  ClonedWebsite,
  Asset,
  WebsiteMetadata,
} from '../../shared/types/index.js';

export class CloneService {
  private browser: Browser | null = null;

  async initialize() {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
    }
  }

  async shutdown() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * Main entry point for cloning a website
   */
  async cloneWebsite(request: CloneRequest): Promise<ClonedWebsite> {
    await this.initialize();

    const id = crypto.randomUUID();
    const projectDir = path.join(process.cwd(), 'uploads', id);
    await fs.mkdir(projectDir, { recursive: true });

    if (request.type === 'url') {
      return await this.cloneFromUrl(id, request.source, request.options, projectDir);
    } else if (request.type === 'upload') {
      return await this.cloneFromUpload(id, request.source, request.options, projectDir);
    } else {
      throw new Error('Unsupported clone type');
    }
  }

  /**
   * Clone website from URL
   */
  private async cloneFromUrl(
    id: string,
    url: string,
    options: any,
    projectDir: string
  ): Promise<ClonedWebsite> {
    const page = await this.browser!.newPage();

    try {
      // Navigate to the page
      await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: 30000,
      });

      // Get the full HTML
      const html = await page.content();

      // Extract all CSS
      const cssUrls = await page.$$eval('link[rel="stylesheet"]', (links) =>
        links.map((link) => (link as HTMLLinkElement).href)
      );

      // Extract all JavaScript
      const jsUrls = await page.$$eval('script[src]', (scripts) =>
        scripts.map((script) => (script as HTMLScriptElement).src)
      );

      // Extract inline styles and scripts
      const inlineCSS = await page.$$eval('style', (styles) =>
        styles.map((style) => style.textContent || '')
      );

      const inlineJS = await page.$$eval('script:not([src])', (scripts) =>
        scripts.map((script) => script.textContent || '')
      );

      // Get all assets (images, fonts, etc.)
      const assets = await this.extractAssets(page, url);

      // Download all resources
      const css = await this.downloadResources(cssUrls, projectDir, 'css');
      const javascript = await this.downloadResources(jsUrls, projectDir, 'js');
      const downloadedAssets = await this.downloadAssets(assets, projectDir);

      // Parse HTML with Cheerio for additional processing
      const $ = cheerio.load(html);

      // Extract metadata
      const metadata: WebsiteMetadata = {
        title: $('title').text() || 'Untitled',
        description: $('meta[name="description"]').attr('content'),
        favicon: $('link[rel="icon"]').attr('href') || $('link[rel="shortcut icon"]').attr('href'),
        framework: this.detectFramework($),
        responsive: this.checkResponsive($),
        totalSize: 0,
        assetCount: downloadedAssets.length,
        pageCount: 1,
      };

      // Combine CSS (external + inline)
      const allCSS = [...css, ...inlineCSS];

      // Combine JS (external + inline)
      const allJS = [...javascript, ...inlineJS];

      // Calculate total size
      metadata.totalSize = await this.calculateTotalSize(downloadedAssets);

      // Save HTML
      const htmlPath = path.join(projectDir, 'index.html');
      await fs.writeFile(htmlPath, html, 'utf-8');

      const clonedWebsite: ClonedWebsite = {
        id,
        name: metadata.title,
        sourceUrl: url,
        html,
        css: allCSS,
        javascript: allJS,
        assets: downloadedAssets,
        metadata,
        createdAt: new Date().toISOString(),
        status: 'ready',
      };

      return clonedWebsite;

    } finally {
      await page.close();
    }
  }

  /**
   * Clone website from uploaded files
   */
  private async cloneFromUpload(
    id: string,
    sourcePath: string,
    options: any,
    projectDir: string
  ): Promise<ClonedWebsite> {
    // Read the uploaded HTML file
    const html = await fs.readFile(sourcePath, 'utf-8');
    const $ = cheerio.load(html);

    // Extract metadata
    const metadata: WebsiteMetadata = {
      title: $('title').text() || 'Untitled',
      description: $('meta[name="description"]').attr('content'),
      favicon: $('link[rel="icon"]').attr('href'),
      framework: this.detectFramework($),
      responsive: this.checkResponsive($),
      totalSize: 0,
      assetCount: 0,
      pageCount: 1,
    };

    // Extract inline CSS and JS
    const css = $('style')
      .map((_, el) => $(el).html() || '')
      .get();

    const javascript = $('script:not([src])')
      .map((_, el) => $(el).html() || '')
      .get();

    const clonedWebsite: ClonedWebsite = {
      id,
      name: metadata.title,
      html,
      css,
      javascript,
      assets: [],
      metadata,
      createdAt: new Date().toISOString(),
      status: 'ready',
    };

    return clonedWebsite;
  }

  /**
   * Extract all assets from the page
   */
  private async extractAssets(page: Page, baseUrl: string): Promise<Asset[]> {
    const assets: Asset[] = [];

    // Images
    const images = await page.$$eval('img', (imgs) =>
      imgs.map((img) => ({
        url: img.src,
        alt: img.alt,
        width: img.naturalWidth,
        height: img.naturalHeight,
      }))
    );

    for (const img of images) {
      if (img.url) {
        assets.push({
          id: crypto.randomUUID(),
          type: 'image',
          originalUrl: img.url,
          localPath: '',
          size: 0,
          format: this.getFileExtension(img.url),
          dimensions: img.width && img.height ? { width: img.width, height: img.height } : undefined,
        });
      }
    }

    // Fonts
    const fonts = await page.$$eval('link[rel="preload"][as="font"]', (links) =>
      links.map((link) => (link as HTMLLinkElement).href)
    );

    for (const fontUrl of fonts) {
      assets.push({
        id: crypto.randomUUID(),
        type: 'font',
        originalUrl: fontUrl,
        localPath: '',
        size: 0,
        format: this.getFileExtension(fontUrl),
      });
    }

    // Videos
    const videos = await page.$$eval('video source', (sources) =>
      sources.map((source) => (source as HTMLSourceElement).src)
    );

    for (const videoUrl of videos) {
      assets.push({
        id: crypto.randomUUID(),
        type: 'video',
        originalUrl: videoUrl,
        localPath: '',
        size: 0,
        format: this.getFileExtension(videoUrl),
      });
    }

    return assets;
  }

  /**
   * Download resources (CSS, JS)
   */
  private async downloadResources(
    urls: string[],
    projectDir: string,
    type: 'css' | 'js'
  ): Promise<string[]> {
    const contents: string[] = [];
    const dir = path.join(projectDir, type);
    await fs.mkdir(dir, { recursive: true });

    for (const url of urls) {
      try {
        const response = await fetch(url);
        const content = await response.text();
        contents.push(content);

        // Save to file
        const filename = path.basename(new URL(url).pathname) || `${type}-${Date.now()}.${type}`;
        await fs.writeFile(path.join(dir, filename), content, 'utf-8');
      } catch (error) {
        console.error(`Failed to download ${url}:`, error);
      }
    }

    return contents;
  }

  /**
   * Download assets (images, fonts, etc.)
   */
  private async downloadAssets(assets: Asset[], projectDir: string): Promise<Asset[]> {
    const downloadedAssets: Asset[] = [];

    for (const asset of assets) {
      try {
        const assetDir = path.join(projectDir, 'assets', asset.type);
        await fs.mkdir(assetDir, { recursive: true });

        const filename = path.basename(new URL(asset.originalUrl).pathname) || `${asset.type}-${asset.id}`;
        const localPath = path.join(assetDir, filename);

        await this.downloadFile(asset.originalUrl, localPath);

        const stats = await fs.stat(localPath);

        downloadedAssets.push({
          ...asset,
          localPath: path.relative(projectDir, localPath),
          size: stats.size,
        });
      } catch (error) {
        console.error(`Failed to download asset ${asset.originalUrl}:`, error);
      }
    }

    return downloadedAssets;
  }

  /**
   * Download a single file
   */
  private downloadFile(url: string, destination: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const protocol = url.startsWith('https') ? https : http;
      const file = createWriteStream(destination);

      protocol
        .get(url, (response) => {
          response.pipe(file);
          file.on('finish', () => {
            file.close();
            resolve();
          });
        })
        .on('error', (err) => {
          fs.unlink(destination).catch(() => {});
          reject(err);
        });
    });
  }

  /**
   * Detect framework used
   */
  private detectFramework($: cheerio.CheerioAPI): string {
    const html = $.html();

    if (html.includes('react') || html.includes('_next')) return 'React/Next.js';
    if (html.includes('vue') || html.includes('nuxt')) return 'Vue/Nuxt';
    if (html.includes('ng-') || html.includes('angular')) return 'Angular';
    if ($('script[src*="jquery"]').length > 0) return 'jQuery';

    return 'Vanilla';
  }

  /**
   * Check if website is responsive
   */
  private checkResponsive($: cheerio.CheerioAPI): boolean {
    const viewport = $('meta[name="viewport"]').attr('content');
    const hasMediaQueries = $('style, link[rel="stylesheet"]')
      .map((_, el) => $(el).html() || '')
      .get()
      .some((css) => css.includes('@media'));

    return !!viewport || hasMediaQueries;
  }

  /**
   * Calculate total size of all assets
   */
  private async calculateTotalSize(assets: Asset[]): Promise<number> {
    return assets.reduce((total, asset) => total + asset.size, 0);
  }

  /**
   * Get file extension from URL
   */
  private getFileExtension(url: string): string {
    try {
      const pathname = new URL(url).pathname;
      const ext = path.extname(pathname);
      return ext.slice(1).toLowerCase();
    } catch {
      return '';
    }
  }
}

export default new CloneService();
