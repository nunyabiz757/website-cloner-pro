/**
 * WordPress REST API Client
 *
 * Complete WordPress REST API integration for:
 * - Plugin verification
 * - Post/Page creation
 * - Media uploads
 * - Authentication
 */

import FormData from 'form-data';
import fs from 'fs/promises';
import { logAuditEvent } from '../../utils/audit-logger.js';

export interface WordPressConfig {
  siteUrl: string;
  username: string;
  applicationPassword: string; // WordPress Application Password
}

export interface WordPressPlugin {
  plugin: string;
  status: 'active' | 'inactive';
  name: string;
  version: string;
}

export interface WordPressPost {
  id: number;
  title: { rendered: string };
  content: { rendered: string };
  status: 'publish' | 'draft' | 'pending';
  link: string;
  meta?: Record<string, any>;
}

export interface WordPressMedia {
  id: number;
  source_url: string;
  mime_type: string;
  title: { rendered: string };
}

export interface CreatePostParams {
  title: string;
  content: string;
  status?: 'publish' | 'draft' | 'pending';
  meta?: Record<string, any>;
  template?: string;
}

export interface UploadMediaParams {
  filePath: string;
  fileName?: string;
  title?: string;
  alt?: string;
}

export class WordPressAPIClient {
  private config: WordPressConfig;
  private baseUrl: string;
  private authHeader: string;

  constructor(config: WordPressConfig) {
    this.config = config;
    // Normalize site URL
    this.baseUrl = config.siteUrl.replace(/\/$/, '') + '/wp-json/wp/v2';
    // Create Basic Auth header
    this.authHeader = 'Basic ' + Buffer.from(
      `${config.username}:${config.applicationPassword}`
    ).toString('base64');
  }

  /**
   * Test connection to WordPress site
   */
  async testConnection(): Promise<{ success: boolean; version?: string; error?: string }> {
    try {
      const response = await fetch(this.baseUrl.replace('/wp/v2', ''), {
        method: 'GET',
        headers: {
          'Authorization': this.authHeader,
        },
      });

      if (!response.ok) {
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
        };
      }

      const data = await response.json() as any;

      return {
        success: true,
        version: data.name || 'Unknown',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Connection failed',
      };
    }
  }

  /**
   * Get list of installed plugins
   */
  async getPlugins(): Promise<WordPressPlugin[]> {
    try {
      const response = await fetch(`${this.config.siteUrl}/wp-json/wp/v2/plugins`, {
        method: 'GET',
        headers: {
          'Authorization': this.authHeader,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to get plugins: ${response.status} ${response.statusText}`);
      }

      const plugins = await response.json() as WordPressPlugin[];
      return plugins;
    } catch (error) {
      console.error('[WP-API] Failed to get plugins:', error);
      throw error;
    }
  }

  /**
   * Check if specific plugin is installed and active
   */
  async isPluginActive(pluginSlug: string): Promise<boolean> {
    try {
      const plugins = await this.getPlugins();
      const plugin = plugins.find(p => p.plugin.includes(pluginSlug));
      return plugin?.status === 'active';
    } catch (error) {
      console.error(`[WP-API] Failed to check plugin ${pluginSlug}:`, error);
      return false;
    }
  }

  /**
   * Verify required plugins for a page builder
   */
  async verifyPageBuilderPlugins(builder: 'elementor' | 'divi' | 'beaver-builder' | 'bricks' | 'oxygen' | 'gutenberg'): Promise<{
    installed: boolean;
    active: boolean;
    pluginName: string;
    message: string;
  }> {
    const pluginMap: Record<string, { slug: string; name: string; optional?: boolean }> = {
      'elementor': { slug: 'elementor', name: 'Elementor' },
      'divi': { slug: 'divi-builder', name: 'Divi Builder' },
      'beaver-builder': { slug: 'beaver-builder', name: 'Beaver Builder' },
      'bricks': { slug: 'bricks', name: 'Bricks' },
      'oxygen': { slug: 'oxygen', name: 'Oxygen' },
      'gutenberg': { slug: 'gutenberg', name: 'Gutenberg', optional: true }, // Built-in to WordPress
    };

    const pluginInfo = pluginMap[builder];

    if (!pluginInfo) {
      return {
        installed: false,
        active: false,
        pluginName: builder,
        message: `Unknown page builder: ${builder}`,
      };
    }

    // Gutenberg is built-in, always available
    if (pluginInfo.optional) {
      return {
        installed: true,
        active: true,
        pluginName: pluginInfo.name,
        message: `${pluginInfo.name} is built-in to WordPress`,
      };
    }

    try {
      const plugins = await this.getPlugins();
      const plugin = plugins.find(p => p.plugin.toLowerCase().includes(pluginInfo.slug));

      if (!plugin) {
        return {
          installed: false,
          active: false,
          pluginName: pluginInfo.name,
          message: `${pluginInfo.name} is not installed`,
        };
      }

      if (plugin.status !== 'active') {
        return {
          installed: true,
          active: false,
          pluginName: pluginInfo.name,
          message: `${pluginInfo.name} is installed but not active`,
        };
      }

      return {
        installed: true,
        active: true,
        pluginName: pluginInfo.name,
        message: `${pluginInfo.name} is active`,
      };
    } catch (error) {
      return {
        installed: false,
        active: false,
        pluginName: pluginInfo.name,
        message: `Failed to verify plugin: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Create a new post/page
   */
  async createPost(params: CreatePostParams): Promise<WordPressPost> {
    try {
      const response = await fetch(`${this.baseUrl}/posts`, {
        method: 'POST',
        headers: {
          'Authorization': this.authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: params.title,
          content: params.content,
          status: params.status || 'draft',
          meta: params.meta || {},
          template: params.template || '',
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to create post: ${response.status} - ${errorText}`);
      }

      const post = await response.json() as WordPressPost;

      console.log(`[WP-API] Created post: ${post.id} - ${post.title.rendered}`);

      return post;
    } catch (error) {
      console.error('[WP-API] Failed to create post:', error);
      throw error;
    }
  }

  /**
   * Create a new page
   */
  async createPage(params: CreatePostParams): Promise<WordPressPost> {
    try {
      const response = await fetch(`${this.baseUrl}/pages`, {
        method: 'POST',
        headers: {
          'Authorization': this.authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: params.title,
          content: params.content,
          status: params.status || 'draft',
          meta: params.meta || {},
          template: params.template || '',
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to create page: ${response.status} - ${errorText}`);
      }

      const page = await response.json() as WordPressPost;

      console.log(`[WP-API] Created page: ${page.id} - ${page.title.rendered}`);

      return page;
    } catch (error) {
      console.error('[WP-API] Failed to create page:', error);
      throw error;
    }
  }

  /**
   * Upload media file
   */
  async uploadMedia(params: UploadMediaParams): Promise<WordPressMedia> {
    try {
      // Read file
      const fileBuffer = await fs.readFile(params.filePath);
      const fileName = params.fileName || params.filePath.split('/').pop() || 'upload';

      // Create form data
      const formData = new FormData();
      formData.append('file', fileBuffer, fileName);

      if (params.title) {
        formData.append('title', params.title);
      }

      if (params.alt) {
        formData.append('alt_text', params.alt);
      }

      const response = await fetch(`${this.baseUrl}/media`, {
        method: 'POST',
        headers: {
          'Authorization': this.authHeader,
          ...formData.getHeaders(),
        },
        body: formData as any,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to upload media: ${response.status} - ${errorText}`);
      }

      const media = await response.json() as WordPressMedia;

      console.log(`[WP-API] Uploaded media: ${media.id} - ${media.source_url}`);

      return media;
    } catch (error) {
      console.error('[WP-API] Failed to upload media:', error);
      throw error;
    }
  }

  /**
   * Update post meta (for Elementor, Divi, etc.)
   */
  async updatePostMeta(postId: number, meta: Record<string, any>): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}/posts/${postId}`, {
        method: 'POST',
        headers: {
          'Authorization': this.authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          meta,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to update post meta: ${response.status} - ${errorText}`);
      }

      console.log(`[WP-API] Updated post meta for post ${postId}`);
    } catch (error) {
      console.error(`[WP-API] Failed to update post meta for post ${postId}:`, error);
      throw error;
    }
  }

  /**
   * Get post by ID
   */
  async getPost(postId: number): Promise<WordPressPost> {
    try {
      const response = await fetch(`${this.baseUrl}/posts/${postId}`, {
        method: 'GET',
        headers: {
          'Authorization': this.authHeader,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to get post: ${response.status} ${response.statusText}`);
      }

      return await response.json() as WordPressPost;
    } catch (error) {
      console.error(`[WP-API] Failed to get post ${postId}:`, error);
      throw error;
    }
  }

  /**
   * Delete post
   */
  async deletePost(postId: number, force: boolean = false): Promise<void> {
    try {
      const url = force
        ? `${this.baseUrl}/posts/${postId}?force=true`
        : `${this.baseUrl}/posts/${postId}`;

      const response = await fetch(url, {
        method: 'DELETE',
        headers: {
          'Authorization': this.authHeader,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to delete post: ${response.status} ${response.statusText}`);
      }

      console.log(`[WP-API] Deleted post ${postId}`);
    } catch (error) {
      console.error(`[WP-API] Failed to delete post ${postId}:`, error);
      throw error;
    }
  }

  /**
   * Get site information
   */
  async getSiteInfo(): Promise<{
    name: string;
    description: string;
    url: string;
    home: string;
    gmt_offset: number;
    timezone_string: string;
  }> {
    try {
      const response = await fetch(this.baseUrl.replace('/wp/v2', ''), {
        method: 'GET',
        headers: {
          'Authorization': this.authHeader,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to get site info: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('[WP-API] Failed to get site info:', error);
      throw error;
    }
  }
}

/**
 * Create WordPress API client from environment variables
 */
export function createWordPressClient(
  siteUrl?: string,
  username?: string,
  password?: string
): WordPressAPIClient {
  const config: WordPressConfig = {
    siteUrl: siteUrl || process.env.WP_SITE_URL || '',
    username: username || process.env.WP_USERNAME || '',
    applicationPassword: password || process.env.WP_APP_PASSWORD || '',
  };

  if (!config.siteUrl) {
    throw new Error('WordPress site URL is required (WP_SITE_URL)');
  }

  if (!config.username) {
    throw new Error('WordPress username is required (WP_USERNAME)');
  }

  if (!config.applicationPassword) {
    throw new Error('WordPress application password is required (WP_APP_PASSWORD)');
  }

  return new WordPressAPIClient(config);
}
