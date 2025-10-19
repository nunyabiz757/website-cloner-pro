import { Pool } from 'pg';
import path from 'path';
import fs from 'fs';
import { AppLogger } from './logger.service.js';
import { AssetDownloaderService, DownloadResult } from './AssetDownloaderService.js';

/**
 * GHL Asset Download Service
 *
 * Downloads and stores assets for GHL cloned pages
 * Updates database with download status and local URLs
 */

export interface GHLAssetDownloadOptions {
  clonedPageId: string;
  baseUrl: string;
  outputDir?: string;
  concurrency?: number;
  skipOnError?: boolean;
}

export interface GHLAssetDownloadResult {
  total: number;
  downloaded: number;
  failed: number;
  skipped: number;
  errors: Array<{
    url: string;
    error: string;
  }>;
  downloadedAssets: Array<{
    originalUrl: string;
    localUrl: string;
    assetType: string;
    fileSize: number;
  }>;
}

export class GHLAssetDownloadService {
  private pool: Pool;
  private assetDownloader: AssetDownloaderService;
  private defaultOutputDir: string;

  constructor(pool: Pool) {
    this.pool = pool;
    this.assetDownloader = new AssetDownloaderService();

    // Default output directory: ./uploads/ghl-assets/
    this.defaultOutputDir = path.join(process.cwd(), 'uploads', 'ghl-assets');

    // Ensure directory exists
    this.ensureDirectoryExists(this.defaultOutputDir);
  }

  /**
   * Download all assets for a cloned page
   */
  async downloadPageAssets(
    clonedPageId: string,
    options: Omit<GHLAssetDownloadOptions, 'clonedPageId'> = {}
  ): Promise<GHLAssetDownloadResult> {
    const {
      baseUrl,
      outputDir = this.defaultOutputDir,
      concurrency = 5,
      skipOnError = true,
    } = options;

    AppLogger.info('Starting asset download for GHL cloned page', {
      component: 'GHLAssetDownloadService',
      clonedPageId,
      baseUrl,
    });

    const result: GHLAssetDownloadResult = {
      total: 0,
      downloaded: 0,
      failed: 0,
      skipped: 0,
      errors: [],
      downloadedAssets: [],
    };

    try {
      // Get cloned page data
      const pageQuery = await this.pool.query(
        'SELECT source_url, assets FROM ghl_cloned_pages WHERE id = $1',
        [clonedPageId]
      );

      if (pageQuery.rows.length === 0) {
        throw new Error(`Cloned page ${clonedPageId} not found`);
      }

      const page = pageQuery.rows[0];
      const assets = page.assets || {};

      // Extract all asset URLs
      const assetUrls = this.extractAssetUrls(assets);
      result.total = assetUrls.length;

      if (assetUrls.length === 0) {
        AppLogger.info('No assets to download', {
          component: 'GHLAssetDownloadService',
          clonedPageId,
        });
        return result;
      }

      // Create subdirectory for this clone
      const cloneOutputDir = path.join(outputDir, clonedPageId);
      this.ensureDirectoryExists(cloneOutputDir);

      // Download assets using AssetDownloaderService
      const downloadResults = await this.assetDownloader.downloadMultiple(
        assetUrls,
        {
          baseUrl: baseUrl || page.source_url,
          outputDir: cloneOutputDir,
        },
        concurrency
      );

      // Process results and update database
      for (const downloadResult of downloadResults) {
        if (downloadResult.success) {
          result.downloaded++;

          // Generate relative URL for serving
          const relativeUrl = this.generateRelativeUrl(downloadResult.localPath, clonedPageId);

          result.downloadedAssets.push({
            originalUrl: downloadResult.url,
            localUrl: relativeUrl,
            assetType: this.detectAssetType(downloadResult.contentType),
            fileSize: downloadResult.size,
          });

          // Insert into ghl_page_assets table
          await this.insertAssetRecord(clonedPageId, {
            originalUrl: downloadResult.url,
            downloadedUrl: relativeUrl,
            assetType: this.detectAssetType(downloadResult.contentType),
            fileSize: downloadResult.size,
            mimeType: downloadResult.contentType,
            downloadStatus: 'downloaded',
          });
        } else {
          result.failed++;
          result.errors.push({
            url: downloadResult.url,
            error: downloadResult.error || 'Unknown error',
          });

          if (!skipOnError) {
            // Insert failed record
            await this.insertAssetRecord(clonedPageId, {
              originalUrl: downloadResult.url,
              downloadedUrl: null,
              assetType: 'other',
              fileSize: 0,
              mimeType: '',
              downloadStatus: 'failed',
              errorMessage: downloadResult.error,
            });
          }
        }
      }

      AppLogger.info('Asset download completed', {
        component: 'GHLAssetDownloadService',
        clonedPageId,
        total: result.total,
        downloaded: result.downloaded,
        failed: result.failed,
      });

      return result;
    } catch (error) {
      AppLogger.error('Asset download failed', error as Error, {
        component: 'GHLAssetDownloadService',
        clonedPageId,
      });
      throw error;
    }
  }

  /**
   * Download assets for multiple cloned pages
   */
  async downloadMultiplePagesAssets(
    clonedPageIds: string[],
    baseUrlMap: Record<string, string>
  ): Promise<Record<string, GHLAssetDownloadResult>> {
    const results: Record<string, GHLAssetDownloadResult> = {};

    for (const pageId of clonedPageIds) {
      try {
        results[pageId] = await this.downloadPageAssets(pageId, {
          baseUrl: baseUrlMap[pageId],
        });
      } catch (error) {
        AppLogger.error('Failed to download assets for page', error as Error, {
          component: 'GHLAssetDownloadService',
          pageId,
        });

        results[pageId] = {
          total: 0,
          downloaded: 0,
          failed: 0,
          skipped: 0,
          errors: [{ url: '', error: (error as Error).message }],
          downloadedAssets: [],
        };
      }
    }

    return results;
  }

  /**
   * Redownload failed assets
   */
  async retryFailedAssets(clonedPageId: string, baseUrl: string): Promise<GHLAssetDownloadResult> {
    AppLogger.info('Retrying failed assets', {
      component: 'GHLAssetDownloadService',
      clonedPageId,
    });

    const result: GHLAssetDownloadResult = {
      total: 0,
      downloaded: 0,
      failed: 0,
      skipped: 0,
      errors: [],
      downloadedAssets: [],
    };

    try {
      // Get failed assets from database
      const failedQuery = await this.pool.query(
        `SELECT id, original_url, asset_type, error_message
         FROM ghl_page_assets
         WHERE cloned_page_id = $1 AND download_status = 'failed'`,
        [clonedPageId]
      );

      const failedAssets = failedQuery.rows;
      result.total = failedAssets.length;

      if (failedAssets.length === 0) {
        AppLogger.info('No failed assets to retry', {
          component: 'GHLAssetDownloadService',
          clonedPageId,
        });
        return result;
      }

      const cloneOutputDir = path.join(this.defaultOutputDir, clonedPageId);
      this.ensureDirectoryExists(cloneOutputDir);

      // Retry each failed asset
      for (const asset of failedAssets) {
        try {
          const downloadResult = await this.assetDownloader.downloadAsset(
            asset.original_url,
            {
              baseUrl,
              outputDir: cloneOutputDir,
            }
          );

          if (downloadResult.success) {
            result.downloaded++;

            const relativeUrl = this.generateRelativeUrl(downloadResult.localPath, clonedPageId);

            // Update database record
            await this.pool.query(
              `UPDATE ghl_page_assets
               SET downloaded_url = $1,
                   file_size_bytes = $2,
                   mime_type = $3,
                   download_status = 'downloaded',
                   error_message = NULL,
                   updated_at = CURRENT_TIMESTAMP
               WHERE id = $4`,
              [relativeUrl, downloadResult.size, downloadResult.contentType, asset.id]
            );

            result.downloadedAssets.push({
              originalUrl: asset.original_url,
              localUrl: relativeUrl,
              assetType: asset.asset_type,
              fileSize: downloadResult.size,
            });
          } else {
            result.failed++;
            result.errors.push({
              url: asset.original_url,
              error: downloadResult.error || 'Unknown error',
            });

            // Update error message
            await this.pool.query(
              `UPDATE ghl_page_assets
               SET error_message = $1,
                   updated_at = CURRENT_TIMESTAMP
               WHERE id = $2`,
              [downloadResult.error, asset.id]
            );
          }
        } catch (error) {
          result.failed++;
          result.errors.push({
            url: asset.original_url,
            error: (error as Error).message,
          });
        }
      }

      AppLogger.info('Asset retry completed', {
        component: 'GHLAssetDownloadService',
        clonedPageId,
        total: result.total,
        downloaded: result.downloaded,
        failed: result.failed,
      });

      return result;
    } catch (error) {
      AppLogger.error('Asset retry failed', error as Error, {
        component: 'GHLAssetDownloadService',
        clonedPageId,
      });
      throw error;
    }
  }

  /**
   * Get asset download status for a cloned page
   */
  async getAssetStatus(clonedPageId: string): Promise<{
    total: number;
    downloaded: number;
    failed: number;
    pending: number;
    percentComplete: number;
  }> {
    const result = await this.pool.query(
      `SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE download_status = 'downloaded') as downloaded,
        COUNT(*) FILTER (WHERE download_status = 'failed') as failed,
        COUNT(*) FILTER (WHERE download_status = 'pending') as pending
       FROM ghl_page_assets
       WHERE cloned_page_id = $1`,
      [clonedPageId]
    );

    const stats = result.rows[0];
    const total = parseInt(stats.total) || 0;
    const downloaded = parseInt(stats.downloaded) || 0;

    return {
      total,
      downloaded,
      failed: parseInt(stats.failed) || 0,
      pending: parseInt(stats.pending) || 0,
      percentComplete: total > 0 ? Math.round((downloaded / total) * 100) : 0,
    };
  }

  /**
   * Delete downloaded assets for a cloned page
   */
  async deletePageAssets(clonedPageId: string): Promise<number> {
    try {
      const assetDir = path.join(this.defaultOutputDir, clonedPageId);

      if (fs.existsSync(assetDir)) {
        await fs.promises.rm(assetDir, { recursive: true, force: true });

        AppLogger.info('Deleted asset directory', {
          component: 'GHLAssetDownloadService',
          clonedPageId,
          directory: assetDir,
        });
      }

      // Delete database records
      const result = await this.pool.query(
        'DELETE FROM ghl_page_assets WHERE cloned_page_id = $1 RETURNING id',
        [clonedPageId]
      );

      return result.rows.length;
    } catch (error) {
      AppLogger.error('Failed to delete assets', error as Error, {
        component: 'GHLAssetDownloadService',
        clonedPageId,
      });
      throw error;
    }
  }

  /**
   * Extract all asset URLs from page assets object
   */
  private extractAssetUrls(assets: any): string[] {
    const urls = new Set<string>();

    if (assets.images && Array.isArray(assets.images)) {
      assets.images.forEach((url: string) => urls.add(url));
    }

    if (assets.videos && Array.isArray(assets.videos)) {
      assets.videos.forEach((url: string) => urls.add(url));
    }

    if (assets.stylesheets && Array.isArray(assets.stylesheets)) {
      assets.stylesheets.forEach((url: string) => urls.add(url));
    }

    if (assets.scripts && Array.isArray(assets.scripts)) {
      assets.scripts.forEach((url: string) => urls.add(url));
    }

    return Array.from(urls).filter(url => url && url.startsWith('http'));
  }

  /**
   * Detect asset type from MIME type
   */
  private detectAssetType(contentType: string): string {
    if (contentType.startsWith('image/')) return 'image';
    if (contentType.startsWith('video/')) return 'video';
    if (contentType.includes('css')) return 'css';
    if (contentType.includes('javascript')) return 'js';
    if (contentType.includes('font')) return 'font';
    return 'other';
  }

  /**
   * Generate relative URL for serving assets
   */
  private generateRelativeUrl(localPath: string, clonedPageId: string): string {
    // Convert absolute path to URL path
    // Example: /path/to/uploads/ghl-assets/uuid/images/logo.png -> /uploads/ghl-assets/uuid/images/logo.png
    const relativePath = localPath.split('uploads' + path.sep).pop() || '';
    return '/' + relativePath.replace(/\\/g, '/');
  }

  /**
   * Insert asset record into database
   */
  private async insertAssetRecord(
    clonedPageId: string,
    data: {
      originalUrl: string;
      downloadedUrl: string | null;
      assetType: string;
      fileSize: number;
      mimeType: string;
      downloadStatus: string;
      errorMessage?: string;
    }
  ): Promise<void> {
    // Check if asset already exists
    const existingAsset = await this.pool.query(
      'SELECT id FROM ghl_page_assets WHERE cloned_page_id = $1 AND original_url = $2',
      [clonedPageId, data.originalUrl]
    );

    if (existingAsset.rows.length > 0) {
      // Update existing record
      await this.pool.query(
        `UPDATE ghl_page_assets
         SET downloaded_url = $1,
             file_size_bytes = $2,
             mime_type = $3,
             download_status = $4,
             error_message = $5,
             updated_at = CURRENT_TIMESTAMP
         WHERE cloned_page_id = $6 AND original_url = $7`,
        [
          data.downloadedUrl,
          data.fileSize,
          data.mimeType,
          data.downloadStatus,
          data.errorMessage || null,
          clonedPageId,
          data.originalUrl,
        ]
      );
    } else {
      // Insert new record
      await this.pool.query(
        `INSERT INTO ghl_page_assets (
          cloned_page_id, asset_type, original_url, downloaded_url,
          file_size_bytes, mime_type, download_status, error_message
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          clonedPageId,
          data.assetType,
          data.originalUrl,
          data.downloadedUrl,
          data.fileSize,
          data.mimeType,
          data.downloadStatus,
          data.errorMessage || null,
        ]
      );
    }
  }

  /**
   * Ensure directory exists
   */
  private ensureDirectoryExists(dir: string): void {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

export default GHLAssetDownloadService;
