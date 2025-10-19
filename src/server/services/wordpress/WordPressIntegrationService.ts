/**
 * WordPress Integration Service
 *
 * Integrates all page builder exporters with WordPress REST API
 * Handles end-to-end flow: verify plugins → create posts → upload media
 */

import type { ClonedWebsite } from '../../../shared/types/index.js';
import { WordPressAPIClient, type WordPressConfig, type WordPressPost } from './WordPressAPIClient.js';
import { ElementorService } from './ElementorService.js';
import { DiviService } from './DiviService.js';
import { BeaverBuilderService } from './BeaverBuilderService.js';
import { BricksService } from './BricksService.js';
import { OxygenService } from './OxygenService.js';
import { GutenbergService } from './GutenbergService.js';
import { logAuditEvent } from '../../utils/audit-logger.js';

export type PageBuilder = 'elementor' | 'divi' | 'beaver-builder' | 'bricks' | 'oxygen' | 'gutenberg';

export interface WordPressExportOptions {
  builder: PageBuilder;
  postType?: 'post' | 'page';
  postStatus?: 'publish' | 'draft' | 'pending';
  title?: string;
  verifyPlugin?: boolean;
  uploadMedia?: boolean;
  userId?: string;
}

export interface WordPressExportResult {
  success: boolean;
  post?: WordPressPost;
  pluginVerification?: {
    installed: boolean;
    active: boolean;
    message: string;
  };
  mediaUploaded?: number;
  error?: string;
  warnings?: string[];
}

export class WordPressIntegrationService {
  private apiClient: WordPressAPIClient;
  private elementorService: ElementorService;
  private diviService: DiviService;
  private beaverBuilderService: BeaverBuilderService;
  private bricksService: BricksService;
  private oxygenService: OxygenService;
  private gutenbergService: GutenbergService;

  constructor(config: WordPressConfig) {
    this.apiClient = new WordPressAPIClient(config);
    this.elementorService = new ElementorService();
    this.diviService = new DiviService();
    this.beaverBuilderService = new BeaverBuilderService();
    this.bricksService = new BricksService();
    this.oxygenService = new OxygenService();
    this.gutenbergService = new GutenbergService();
  }

  /**
   * Export website to WordPress
   */
  async exportToWordPress(
    website: ClonedWebsite,
    options: WordPressExportOptions
  ): Promise<WordPressExportResult> {
    const startTime = Date.now();
    const warnings: string[] = [];

    try {
      // 1. Test connection
      console.log('[WP-INTEGRATION] Testing WordPress connection...');
      const connectionTest = await this.apiClient.testConnection();

      if (!connectionTest.success) {
        throw new Error(`WordPress connection failed: ${connectionTest.error}`);
      }

      console.log(`[WP-INTEGRATION] Connected to WordPress ${connectionTest.version}`);

      // 2. Verify plugin (optional)
      let pluginVerification;

      if (options.verifyPlugin !== false) {
        console.log(`[WP-INTEGRATION] Verifying ${options.builder} plugin...`);
        pluginVerification = await this.apiClient.verifyPageBuilderPlugins(options.builder);

        if (!pluginVerification.active) {
          warnings.push(pluginVerification.message);

          // Only throw if plugin is not Gutenberg (which is built-in)
          if (options.builder !== 'gutenberg') {
            throw new Error(pluginVerification.message);
          }
        }

        console.log(`[WP-INTEGRATION] Plugin verification: ${pluginVerification.message}`);
      }

      // 3. Convert to page builder format
      console.log(`[WP-INTEGRATION] Converting to ${options.builder} format...`);
      const builderData = await this.convertToBuilder(website, options.builder);

      // 4. Create post/page
      console.log(`[WP-INTEGRATION] Creating ${options.postType || 'page'} in WordPress...`);
      const post = await this.createWordPressPost(website, builderData, options);

      console.log(`[WP-INTEGRATION] Created post ${post.id}: ${post.link}`);

      // 5. Upload media (optional)
      let mediaUploaded = 0;

      if (options.uploadMedia) {
        console.log('[WP-INTEGRATION] Uploading media assets...');
        mediaUploaded = await this.uploadMediaAssets(website, post.id);
        console.log(`[WP-INTEGRATION] Uploaded ${mediaUploaded} media files`);
      }

      // 6. Log to audit
      await logAuditEvent({
        userId: options.userId || 'system',
        action: 'wordpress.export.success',
        resourceType: 'wordpress_post',
        resourceId: String(post.id),
        details: {
          builder: options.builder,
          postType: options.postType || 'page',
          websiteId: website.id,
          postLink: post.link,
          mediaUploaded,
        },
        durationMs: Date.now() - startTime,
        severity: 'info',
        category: 'export',
      });

      return {
        success: true,
        post,
        pluginVerification,
        mediaUploaded,
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      console.error('[WP-INTEGRATION] Export failed:', errorMessage);

      // Log failure to audit
      await logAuditEvent({
        userId: options.userId || 'system',
        action: 'wordpress.export.failed',
        resourceType: 'wordpress_post',
        resourceId: website.id,
        details: {
          builder: options.builder,
          websiteId: website.id,
        },
        errorMessage,
        durationMs: Date.now() - startTime,
        severity: 'error',
        category: 'export',
      });

      return {
        success: false,
        error: errorMessage,
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    }
  }

  /**
   * Convert website to specific page builder format
   */
  private async convertToBuilder(website: ClonedWebsite, builder: PageBuilder): Promise<any> {
    switch (builder) {
      case 'elementor':
        return this.elementorService.convertToElementor(website);

      case 'divi':
        return this.diviService.convertToDivi(website);

      case 'beaver-builder':
        return this.beaverBuilderService.convertToBeaverBuilder(website);

      case 'bricks':
        return this.bricksService.convertToBricks(website);

      case 'oxygen':
        return this.oxygenService.convertToOxygen(website);

      case 'gutenberg':
        return this.gutenbergService.convertToGutenberg(website);

      default:
        throw new Error(`Unsupported page builder: ${builder}`);
    }
  }

  /**
   * Create WordPress post with builder data
   */
  private async createWordPressPost(
    website: ClonedWebsite,
    builderData: any,
    options: WordPressExportOptions
  ): Promise<WordPressPost> {
    const title = options.title || website.metadata?.title || 'Imported Website';
    const postType = options.postType || 'page';
    const status = options.postStatus || 'draft';

    // Prepare content and meta based on builder
    const { content, meta, template } = this.preparePostData(builderData, options.builder);

    // Create post or page
    const post = postType === 'page'
      ? await this.apiClient.createPage({ title, content, status, meta, template })
      : await this.apiClient.createPost({ title, content, status, meta, template });

    // Update builder-specific meta fields
    await this.updateBuilderMeta(post.id, builderData, options.builder);

    return post;
  }

  /**
   * Prepare post data based on page builder
   */
  private preparePostData(builderData: any, builder: PageBuilder): {
    content: string;
    meta: Record<string, any>;
    template?: string;
  } {
    switch (builder) {
      case 'elementor':
        return {
          content: '', // Elementor uses meta, not content
          meta: {
            _elementor_data: JSON.stringify(builderData.content),
            _elementor_edit_mode: 'builder',
            _elementor_template_type: 'wp-post',
            _elementor_version: '3.0.0',
          },
          template: 'elementor_canvas',
        };

      case 'divi':
        return {
          content: builderData.shortcode || '', // Divi uses shortcodes
          meta: {
            _et_pb_use_builder: 'on',
            _et_pb_old_content: '',
            _et_pb_post_hide_nav: 'default',
          },
        };

      case 'beaver-builder':
        return {
          content: '', // Beaver Builder uses meta
          meta: {
            _fl_builder_enabled: '1',
            _fl_builder_data: JSON.stringify(builderData),
          },
        };

      case 'bricks':
        return {
          content: '', // Bricks uses meta
          meta: {
            _bricks_page_content_2: JSON.stringify(builderData.elements),
            _bricks_page_fonts: JSON.stringify([]),
          },
          template: 'bricks',
        };

      case 'oxygen':
        return {
          content: '', // Oxygen uses meta
          meta: {
            ct_builder_shortcodes: JSON.stringify(builderData),
            ct_builder_json: JSON.stringify(builderData),
          },
        };

      case 'gutenberg':
        return {
          content: builderData.html || '', // Gutenberg uses HTML blocks
          meta: {},
        };

      default:
        return {
          content: builderData.html || '',
          meta: {},
        };
    }
  }

  /**
   * Update builder-specific meta fields
   */
  private async updateBuilderMeta(
    postId: number,
    builderData: any,
    builder: PageBuilder
  ): Promise<void> {
    // Additional meta updates if needed
    switch (builder) {
      case 'elementor':
        // Elementor meta already set in preparePostData
        break;

      case 'divi':
        // Divi meta already set
        break;

      case 'beaver-builder':
        // Beaver Builder meta already set
        break;

      case 'bricks':
        // Bricks meta already set
        break;

      case 'oxygen':
        // Oxygen meta already set
        break;

      case 'gutenberg':
        // Gutenberg doesn't need additional meta
        break;
    }
  }

  /**
   * Upload media assets to WordPress
   */
  private async uploadMediaAssets(website: ClonedWebsite, postId: number): Promise<number> {
    let uploadedCount = 0;

    // Upload images from website.assets
    if (website.assets && website.assets.length > 0) {
      for (const asset of website.assets) {
        if (asset.type === 'image' && asset.localPath) {
          try {
            await this.apiClient.uploadMedia({
              filePath: asset.localPath,
              title: asset.url.split('/').pop(),
              alt: asset.url.split('/').pop(),
            });

            uploadedCount++;
          } catch (error) {
            console.warn(`[WP-INTEGRATION] Failed to upload ${asset.url}:`, error);
            // Continue with other assets
          }
        }
      }
    }

    return uploadedCount;
  }

  /**
   * Verify plugin installation before export
   */
  async verifyPlugin(builder: PageBuilder): Promise<{
    installed: boolean;
    active: boolean;
    message: string;
  }> {
    return await this.apiClient.verifyPageBuilderPlugins(builder);
  }

  /**
   * Test WordPress connection
   */
  async testConnection(): Promise<{ success: boolean; version?: string; error?: string }> {
    return await this.apiClient.testConnection();
  }

  /**
   * Get WordPress site information
   */
  async getSiteInfo() {
    return await this.apiClient.getSiteInfo();
  }
}

/**
 * Create WordPress integration service from environment variables
 */
export function createWordPressIntegration(
  siteUrl?: string,
  username?: string,
  password?: string
): WordPressIntegrationService {
  const config = {
    siteUrl: siteUrl || process.env.WP_SITE_URL || '',
    username: username || process.env.WP_USERNAME || '',
    applicationPassword: password || process.env.WP_APP_PASSWORD || '',
  };

  if (!config.siteUrl || !config.username || !config.applicationPassword) {
    throw new Error('WordPress credentials are required (WP_SITE_URL, WP_USERNAME, WP_APP_PASSWORD)');
  }

  return new WordPressIntegrationService(config);
}
