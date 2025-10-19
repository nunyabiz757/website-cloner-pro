import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { URL } from 'url';
import crypto from 'crypto';

export interface DownloadOptions {
  baseUrl: string;
  outputDir: string;
  timeout?: number;
  maxRetries?: number;
  userAgent?: string;
}

export interface DownloadResult {
  success: boolean;
  url: string;
  localPath: string;
  size: number;
  contentType: string;
  error?: string;
}

export interface DownloadProgress {
  total: number;
  completed: number;
  failed: number;
  inProgress: number;
  percentage: number;
  currentFile?: string;
}

export class AssetDownloaderService {
  private downloadQueue: Map<string, Promise<DownloadResult>> = new Map();
  private progressCallbacks: Array<(progress: DownloadProgress) => void> = [];
  private stats = {
    total: 0,
    completed: 0,
    failed: 0,
    inProgress: 0,
  };

  /**
   * Download a single asset
   */
  async downloadAsset(
    url: string,
    options: DownloadOptions
  ): Promise<DownloadResult> {
    const {
      baseUrl,
      outputDir,
      timeout = 30000,
      maxRetries = 3,
      userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    } = options;

    // Resolve URL
    const absoluteUrl = this.resolveUrl(url, baseUrl);

    // Check if already downloading
    if (this.downloadQueue.has(absoluteUrl)) {
      return this.downloadQueue.get(absoluteUrl)!;
    }

    // Create download promise
    const downloadPromise = this.executeDownload(
      absoluteUrl,
      outputDir,
      timeout,
      maxRetries,
      userAgent
    );

    this.downloadQueue.set(absoluteUrl, downloadPromise);

    return downloadPromise;
  }

  /**
   * Execute download with retries
   */
  private async executeDownload(
    url: string,
    outputDir: string,
    timeout: number,
    maxRetries: number,
    userAgent: string
  ): Promise<DownloadResult> {
    this.stats.inProgress++;
    this.emitProgress();

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const result = await this.downloadFile(url, outputDir, timeout, userAgent);
        this.stats.completed++;
        this.stats.inProgress--;
        this.downloadQueue.delete(url);
        this.emitProgress();
        return result;
      } catch (error) {
        lastError = error as Error;
        if (attempt < maxRetries - 1) {
          // Wait before retry (exponential backoff)
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      }
    }

    // All retries failed
    this.stats.failed++;
    this.stats.inProgress--;
    this.downloadQueue.delete(url);
    this.emitProgress();

    return {
      success: false,
      url,
      localPath: '',
      size: 0,
      contentType: '',
      error: lastError?.message || 'Download failed',
    };
  }

  /**
   * Download file
   */
  private async downloadFile(
    url: string,
    outputDir: string,
    timeout: number,
    userAgent: string
  ): Promise<DownloadResult> {
    const response = await axios.get(url, {
      responseType: 'arraybuffer',
      timeout,
      headers: {
        'User-Agent': userAgent,
      },
      maxRedirects: 5,
    });

    // Generate local filename
    const localPath = await this.generateLocalPath(url, outputDir, response.headers['content-type']);

    // Ensure directory exists
    await fs.promises.mkdir(path.dirname(localPath), { recursive: true });

    // Write file
    await fs.promises.writeFile(localPath, response.data);

    return {
      success: true,
      url,
      localPath,
      size: response.data.length,
      contentType: response.headers['content-type'] || 'application/octet-stream',
    };
  }

  /**
   * Generate local path for asset
   */
  private async generateLocalPath(url: string, outputDir: string, contentType?: string): Promise<string> {
    try {
      const parsedUrl = new URL(url);
      let pathname = parsedUrl.pathname;

      // Remove leading slash
      if (pathname.startsWith('/')) {
        pathname = pathname.substring(1);
      }

      // If no extension, add one based on content type
      if (!path.extname(pathname) && contentType) {
        const ext = this.getExtensionFromContentType(contentType);
        if (ext) {
          pathname += ext;
        }
      }

      // Create subdirectory based on asset type
      const ext = path.extname(pathname).toLowerCase();
      let subdir = 'assets';

      if (['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.avif', '.ico'].includes(ext)) {
        subdir = 'images';
      } else if (['.css'].includes(ext)) {
        subdir = 'css';
      } else if (['.js', '.mjs'].includes(ext)) {
        subdir = 'js';
      } else if (['.woff', '.woff2', '.ttf', '.otf', '.eot'].includes(ext)) {
        subdir = 'fonts';
      } else if (['.mp4', '.webm', '.ogg', '.mov'].includes(ext)) {
        subdir = 'videos';
      }

      const localPath = path.join(outputDir, subdir, pathname);

      // Check if file exists, if so, add hash to make unique
      try {
        await fs.promises.access(localPath);
        const hash = crypto.createHash('md5').update(url).digest('hex').substring(0, 8);
        const dir = path.dirname(localPath);
        const ext = path.extname(localPath);
        const base = path.basename(localPath, ext);
        return path.join(dir, `${base}-${hash}${ext}`);
      } catch {
        return localPath;
      }
    } catch {
      // If URL parsing fails, use hash
      const hash = crypto.createHash('md5').update(url).digest('hex');
      const ext = this.getExtensionFromContentType(contentType);
      return path.join(outputDir, 'assets', `${hash}${ext}`);
    }
  }

  /**
   * Get file extension from content type
   */
  private getExtensionFromContentType(contentType?: string): string {
    if (!contentType) return '';

    const mimeMap: Record<string, string> = {
      'text/html': '.html',
      'text/css': '.css',
      'text/javascript': '.js',
      'application/javascript': '.js',
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/svg+xml': '.svg',
      'image/webp': '.webp',
      'image/avif': '.avif',
      'font/woff': '.woff',
      'font/woff2': '.woff2',
      'font/ttf': '.ttf',
      'font/otf': '.otf',
      'application/font-woff': '.woff',
      'application/font-woff2': '.woff2',
      'video/mp4': '.mp4',
      'video/webm': '.webm',
    };

    const mime = contentType.split(';')[0].trim().toLowerCase();
    return mimeMap[mime] || '';
  }

  /**
   * Resolve relative URL to absolute
   */
  private resolveUrl(url: string, baseUrl: string): string {
    try {
      // Already absolute
      if (url.startsWith('http://') || url.startsWith('https://')) {
        return url;
      }

      // Protocol-relative
      if (url.startsWith('//')) {
        const base = new URL(baseUrl);
        return `${base.protocol}${url}`;
      }

      // Relative URL
      return new URL(url, baseUrl).href;
    } catch {
      return url;
    }
  }

  /**
   * Download multiple assets in parallel
   */
  async downloadMultiple(
    urls: string[],
    options: DownloadOptions,
    concurrency: number = 5
  ): Promise<DownloadResult[]> {
    this.stats.total = urls.length;
    this.stats.completed = 0;
    this.stats.failed = 0;
    this.stats.inProgress = 0;

    const results: DownloadResult[] = [];
    const chunks: string[][] = [];

    // Split URLs into chunks for concurrent downloads
    for (let i = 0; i < urls.length; i += concurrency) {
      chunks.push(urls.slice(i, i + concurrency));
    }

    // Download chunks sequentially, but items within chunk in parallel
    for (const chunk of chunks) {
      const chunkResults = await Promise.all(
        chunk.map(url => this.downloadAsset(url, options))
      );
      results.push(...chunkResults);
    }

    return results;
  }

  /**
   * Register progress callback
   */
  onProgress(callback: (progress: DownloadProgress) => void) {
    this.progressCallbacks.push(callback);
  }

  /**
   * Emit progress to all callbacks
   */
  private emitProgress() {
    const progress: DownloadProgress = {
      total: this.stats.total,
      completed: this.stats.completed,
      failed: this.stats.failed,
      inProgress: this.stats.inProgress,
      percentage: this.stats.total > 0 ? (this.stats.completed / this.stats.total) * 100 : 0,
    };

    this.progressCallbacks.forEach(callback => callback(progress));
  }

  /**
   * Get current progress
   */
  getProgress(): DownloadProgress {
    return {
      total: this.stats.total,
      completed: this.stats.completed,
      failed: this.stats.failed,
      inProgress: this.stats.inProgress,
      percentage: this.stats.total > 0 ? (this.stats.completed / this.stats.total) * 100 : 0,
    };
  }

  /**
   * Reset download statistics
   */
  reset() {
    this.stats = {
      total: 0,
      completed: 0,
      failed: 0,
      inProgress: 0,
    };
    this.downloadQueue.clear();
    this.progressCallbacks = [];
  }

  /**
   * Download all assets from parsed HTML and CSS
   */
  async downloadAllAssets(
    html: string,
    css: string[],
    baseUrl: string,
    outputDir: string
  ): Promise<{
    images: DownloadResult[];
    stylesheets: DownloadResult[];
    scripts: DownloadResult[];
    fonts: DownloadResult[];
    videos: DownloadResult[];
    other: DownloadResult[];
  }> {
    const parserService = (await import('./ParserService.js')).default;
    const parsedHTML = parserService.parseHTML(html, baseUrl);

    const allUrls = new Set<string>();
    const categorizedUrls = {
      images: new Set<string>(),
      stylesheets: new Set<string>(),
      scripts: new Set<string>(),
      fonts: new Set<string>(),
      videos: new Set<string>(),
      other: new Set<string>(),
    };

    // Collect image URLs
    parsedHTML.links.images.forEach(url => {
      allUrls.add(url);
      categorizedUrls.images.add(url);
    });

    // Collect stylesheet URLs
    parsedHTML.links.stylesheets.forEach(url => {
      allUrls.add(url);
      categorizedUrls.stylesheets.add(url);
    });

    // Collect script URLs
    parsedHTML.links.scripts.forEach(url => {
      allUrls.add(url);
      categorizedUrls.scripts.add(url);
    });

    // Collect video URLs
    parsedHTML.links.videos.forEach(url => {
      allUrls.add(url);
      categorizedUrls.videos.add(url);
    });

    // Parse CSS for font and image URLs
    for (const cssContent of css) {
      const parsedCSS = parserService.parseCSS(cssContent);

      parsedCSS.fontFaces.forEach(font => {
        font.src.forEach(url => {
          allUrls.add(url);
          categorizedUrls.fonts.add(url);
        });
      });

      parsedCSS.urls.forEach(url => {
        if (!allUrls.has(url)) {
          allUrls.add(url);
          categorizedUrls.other.add(url);
        }
      });
    }

    // Download all assets
    const options: DownloadOptions = {
      baseUrl,
      outputDir,
    };

    const results = await this.downloadMultiple(Array.from(allUrls), options);

    // Categorize results
    const categorized = {
      images: [] as DownloadResult[],
      stylesheets: [] as DownloadResult[],
      scripts: [] as DownloadResult[],
      fonts: [] as DownloadResult[],
      videos: [] as DownloadResult[],
      other: [] as DownloadResult[],
    };

    results.forEach(result => {
      if (categorizedUrls.images.has(result.url)) {
        categorized.images.push(result);
      } else if (categorizedUrls.stylesheets.has(result.url)) {
        categorized.stylesheets.push(result);
      } else if (categorizedUrls.scripts.has(result.url)) {
        categorized.scripts.push(result);
      } else if (categorizedUrls.fonts.has(result.url)) {
        categorized.fonts.push(result);
      } else if (categorizedUrls.videos.has(result.url)) {
        categorized.videos.push(result);
      } else {
        categorized.other.push(result);
      }
    });

    return categorized;
  }
}

export default new AssetDownloaderService();
