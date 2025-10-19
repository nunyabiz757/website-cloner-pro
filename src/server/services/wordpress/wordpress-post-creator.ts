/**
 * WordPress Post Creator
 *
 * Creates WordPress posts/pages from exported page builder JSON
 * Handles:
 * - Elementor template import
 * - Gutenberg block import
 * - Media assets upload
 * - Post meta configuration
 * - Template verification
 */

import { WordPressAPIClient, WordPressCredentials } from './wordpress-api-client.js';
import { ElementorExport } from '../page-builder/types/builder.types.js';
import { AppLogger } from '../../utils/logger.js';
import axios from 'axios';

export interface PostCreationOptions {
  title: string;
  status: 'publish' | 'draft' | 'pending' | 'private';
  type: 'post' | 'page';
  uploadMedia?: boolean;
  mediaMapping?: Record<string, string>; // Original URL -> WordPress URL
}

export interface ElementorImportOptions extends PostCreationOptions {
  templateType?: 'page' | 'section' | 'widget';
  createAsTemplate?: boolean; // Create as Elementor Library item
}

export interface GutenbergImportOptions extends PostCreationOptions {
  createAsTemplate?: boolean;
  templateSlug?: string;
}

export interface PostCreationResult {
  success: boolean;
  postId?: number;
  postLink?: string;
  editLink?: string;
  mediaUploaded?: number;
  errors?: string[];
  warnings?: string[];
}

/**
 * WordPress Post Creator Service
 */
export class WordPressPostCreator {
  private client: WordPressAPIClient;
  private mediaCache: Map<string, number> = new Map();

  constructor(credentials: WordPressCredentials) {
    this.client = new WordPressAPIClient(credentials);
  }

  /**
   * Create WordPress post from Elementor JSON export
   */
  async createFromElementorExport(
    exportData: ElementorExport,
    options: ElementorImportOptions
  ): Promise<PostCreationResult> {
    const result: PostCreationResult = {
      success: false,
      errors: [],
      warnings: [],
      mediaUploaded: 0,
    };

    try {
      // Validate export data
      const validation = this.validateElementorExport(exportData);
      if (!validation.isValid) {
        result.errors = validation.errors;
        return result;
      }

      // Check if Elementor is active
      const isElementorActive = await this.client.isElementorActive();
      if (!isElementorActive) {
        result.warnings?.push('Elementor plugin may not be active on target site');
      }

      // Process media assets if requested
      if (options.uploadMedia) {
        const mediaResult = await this.processMediaAssets(exportData);
        result.mediaUploaded = mediaResult.uploadedCount;
        if (mediaResult.errors.length > 0) {
          result.warnings?.push(...mediaResult.errors);
        }
      }

      // Serialize Elementor data to JSON string
      const elementorData = JSON.stringify(exportData.content);

      if (options.createAsTemplate) {
        // Create as Elementor Library template
        const templateResult = await this.client.createElementorTemplate(
          options.title,
          elementorData,
          options.templateType || 'page',
          {
            _elementor_page_settings: exportData.page_settings || {},
            _elementor_version: exportData.version || '3.16.0',
          }
        );

        result.success = true;
        result.postId = templateResult.id;
        result.editLink = templateResult.editLink;
      } else {
        // Create as regular post/page with Elementor data
        const postResult = await this.client.createPost({
          title: options.title,
          content: '', // Elementor doesn't use post_content
          status: options.status,
          type: options.type,
          meta: {
            _elementor_edit_mode: 'builder',
            _elementor_template_type: 'page',
            _elementor_version: exportData.version || '3.16.0',
            _elementor_data: elementorData,
            _elementor_page_settings: JSON.stringify(exportData.page_settings || {}),
          },
        });

        result.success = true;
        result.postId = postResult.id;
        result.postLink = postResult.link;
        result.editLink = postResult.link.replace(
          /\/$/,
          `/wp-admin/post.php?post=${postResult.id}&action=elementor`
        );
      }

      AppLogger.info('Elementor post created successfully', {
        postId: result.postId,
        title: options.title,
        type: options.type,
        mediaUploaded: result.mediaUploaded,
      });
    } catch (error) {
      AppLogger.error('Failed to create Elementor post', error as Error);
      result.errors?.push(error instanceof Error ? error.message : 'Unknown error');
    }

    return result;
  }

  /**
   * Create WordPress post from Gutenberg blocks JSON
   */
  async createFromGutenbergBlocks(
    blocksHTML: string,
    options: GutenbergImportOptions
  ): Promise<PostCreationResult> {
    const result: PostCreationResult = {
      success: false,
      errors: [],
      warnings: [],
      mediaUploaded: 0,
    };

    try {
      // Check if Gutenberg is available
      const isGutenbergAvailable = await this.client.isGutenbergAvailable();
      if (!isGutenbergAvailable) {
        result.warnings?.push('Gutenberg (Block Editor) may not be available on target site');
      }

      // Process media assets if requested
      if (options.uploadMedia) {
        const mediaResult = await this.processMediaAssetsFromHTML(blocksHTML);
        result.mediaUploaded = mediaResult.uploadedCount;
        if (mediaResult.errors.length > 0) {
          result.warnings?.push(...mediaResult.errors);
        }
        // Replace media URLs in blocks HTML
        blocksHTML = this.replaceMediaUrls(blocksHTML, mediaResult.mapping);
      }

      if (options.createAsTemplate) {
        // Create as WordPress template
        const templateResult = await this.client.createGutenbergTemplate(
          options.title,
          blocksHTML,
          'wp_template',
          options.templateSlug
        );

        result.success = true;
        result.postId = templateResult.id;
      } else {
        // Create as regular post/page with Gutenberg blocks
        const postResult = await this.client.createPost({
          title: options.title,
          content: blocksHTML,
          status: options.status,
          type: options.type,
        });

        result.success = true;
        result.postId = postResult.id;
        result.postLink = postResult.link;
        result.editLink = postResult.link.replace(/\/$/, `/wp-admin/post.php?post=${postResult.id}&action=edit`);
      }

      AppLogger.info('Gutenberg post created successfully', {
        postId: result.postId,
        title: options.title,
        type: options.type,
        mediaUploaded: result.mediaUploaded,
      });
    } catch (error) {
      AppLogger.error('Failed to create Gutenberg post', error as Error);
      result.errors?.push(error instanceof Error ? error.message : 'Unknown error');
    }

    return result;
  }

  /**
   * Validate Elementor export data
   */
  private validateElementorExport(exportData: ElementorExport): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (!exportData.version) {
      errors.push('Missing Elementor version');
    }

    if (!exportData.content || exportData.content.length === 0) {
      errors.push('No content sections found');
    }

    if (exportData.content) {
      for (const section of exportData.content) {
        if (section.elType !== 'section') {
          errors.push(`Invalid section type: ${section.elType}`);
        }

        if (!section.elements || section.elements.length === 0) {
          errors.push(`Section ${section.id} has no columns`);
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Process media assets from Elementor export
   */
  private async processMediaAssets(exportData: ElementorExport): Promise<{
    uploadedCount: number;
    mapping: Record<string, string>;
    errors: string[];
  }> {
    const result = {
      uploadedCount: 0,
      mapping: {} as Record<string, string>,
      errors: [] as string[],
    };

    const imageUrls = this.extractImageUrls(exportData);

    for (const url of imageUrls) {
      try {
        // Skip if already uploaded
        if (this.mediaCache.has(url)) {
          const wpMediaId = this.mediaCache.get(url)!;
          result.mapping[url] = `wp-media-${wpMediaId}`;
          continue;
        }

        // Download image
        const imageBuffer = await this.downloadImage(url);
        if (!imageBuffer) {
          result.errors.push(`Failed to download image: ${url}`);
          continue;
        }

        // Upload to WordPress
        const filename = url.split('/').pop() || 'image.jpg';
        const mimeType = this.getMimeType(filename);

        const media = await this.client.uploadMedia(imageBuffer, filename, mimeType);

        // Cache and map
        this.mediaCache.set(url, media.id);
        result.mapping[url] = media.source_url;
        result.uploadedCount++;

        AppLogger.debug('Media uploaded', { url, mediaId: media.id });
      } catch (error) {
        AppLogger.error('Failed to upload media', error as Error);
        result.errors.push(`Failed to upload ${url}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return result;
  }

  /**
   * Process media assets from HTML content
   */
  private async processMediaAssetsFromHTML(html: string): Promise<{
    uploadedCount: number;
    mapping: Record<string, string>;
    errors: string[];
  }> {
    const result = {
      uploadedCount: 0,
      mapping: {} as Record<string, string>,
      errors: [] as string[],
    };

    // Extract image URLs from HTML
    const imageUrls = this.extractImageUrlsFromHTML(html);

    for (const url of imageUrls) {
      try {
        // Skip data URLs
        if (url.startsWith('data:')) {
          continue;
        }

        // Skip if already uploaded
        if (this.mediaCache.has(url)) {
          const wpMediaId = this.mediaCache.get(url)!;
          result.mapping[url] = `wp-media-${wpMediaId}`;
          continue;
        }

        // Download and upload
        const imageBuffer = await this.downloadImage(url);
        if (!imageBuffer) {
          result.errors.push(`Failed to download image: ${url}`);
          continue;
        }

        const filename = url.split('/').pop() || 'image.jpg';
        const mimeType = this.getMimeType(filename);

        const media = await this.client.uploadMedia(imageBuffer, filename, mimeType);

        this.mediaCache.set(url, media.id);
        result.mapping[url] = media.source_url;
        result.uploadedCount++;
      } catch (error) {
        result.errors.push(`Failed to upload ${url}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return result;
  }

  /**
   * Extract image URLs from Elementor export
   */
  private extractImageUrls(exportData: ElementorExport): string[] {
    const urls = new Set<string>();

    const traverse = (obj: any): void => {
      if (typeof obj !== 'object' || obj === null) {
        return;
      }

      // Check for image URL in common Elementor fields
      if (obj.image && typeof obj.image === 'object' && obj.image.url) {
        urls.add(obj.image.url);
      }

      if (obj.background_image && typeof obj.background_image === 'object' && obj.background_image.url) {
        urls.add(obj.background_image.url);
      }

      // Check for gallery images
      if (Array.isArray(obj.gallery)) {
        for (const item of obj.gallery) {
          if (item.url) {
            urls.add(item.url);
          }
        }
      }

      // Recursively traverse
      for (const key in obj) {
        traverse(obj[key]);
      }
    };

    traverse(exportData.content);

    return Array.from(urls);
  }

  /**
   * Extract image URLs from HTML
   */
  private extractImageUrlsFromHTML(html: string): string[] {
    const urls = new Set<string>();
    const imgRegex = /<img[^>]+src=["']([^"']+)["']/gi;
    const bgRegex = /background-image:\s*url\(["']?([^"')]+)["']?\)/gi;

    let match;

    // Extract from <img> tags
    while ((match = imgRegex.exec(html)) !== null) {
      urls.add(match[1]);
    }

    // Extract from background-image CSS
    while ((match = bgRegex.exec(html)) !== null) {
      urls.add(match[1]);
    }

    return Array.from(urls);
  }

  /**
   * Download image from URL
   */
  private async downloadImage(url: string): Promise<Buffer | null> {
    try {
      const response = await axios.get(url, {
        responseType: 'arraybuffer',
        timeout: 10000,
      });

      return Buffer.from(response.data);
    } catch (error) {
      AppLogger.error('Failed to download image', { url, error });
      return null;
    }
  }

  /**
   * Get MIME type from filename
   */
  private getMimeType(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase() || '';

    const mimeTypes: Record<string, string> = {
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      svg: 'image/svg+xml',
    };

    return mimeTypes[ext] || 'image/jpeg';
  }

  /**
   * Replace media URLs in HTML
   */
  private replaceMediaUrls(html: string, mapping: Record<string, string>): string {
    let result = html;

    for (const [oldUrl, newUrl] of Object.entries(mapping)) {
      result = result.replace(new RegExp(oldUrl, 'g'), newUrl);
    }

    return result;
  }

  /**
   * Test connection to WordPress
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    return this.client.testConnection();
  }

  /**
   * Get site information
   */
  async getSiteInfo() {
    return this.client.getSiteInfo();
  }
}

/**
 * Create WordPress post creator instance
 */
export function createWordPressPostCreator(credentials: WordPressCredentials): WordPressPostCreator {
  return new WordPressPostCreator(credentials);
}
