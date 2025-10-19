/**
 * WordPress REST API Client
 *
 * Provides comprehensive integration with WordPress REST API for:
 * - Posts and Pages management
 * - Media uploads
 * - Template imports
 * - Plugin API interactions
 * - Authentication (Basic Auth, Application Passwords, JWT)
 */

import axios, { AxiosInstance, AxiosError } from 'axios';
import FormData from 'form-data';
import { AppLogger } from '../../utils/logger.js';

export interface WordPressCredentials {
  siteUrl: string;
  authType: 'basic' | 'application-password' | 'jwt';
  username?: string;
  password?: string;
  applicationPassword?: string;
  jwtToken?: string;
}

export interface WordPressPost {
  id?: number;
  title: string;
  content: string;
  status: 'publish' | 'draft' | 'pending' | 'private';
  type?: 'post' | 'page';
  meta?: Record<string, any>;
  featured_media?: number;
  categories?: number[];
  tags?: number[];
  template?: string;
}

export interface WordPressMedia {
  id: number;
  source_url: string;
  title: string;
  alt_text: string;
  media_type: string;
  mime_type: string;
}

export interface WordPressTemplate {
  id?: number;
  title: string;
  type: 'wp_template' | 'wp_template_part' | 'elementor_library';
  content: string;
  meta?: Record<string, any>;
  status?: 'publish' | 'draft';
}

/**
 * WordPress REST API Client
 */
export class WordPressAPIClient {
  private client: AxiosInstance;
  private credentials: WordPressCredentials;
  private baseUrl: string;

  constructor(credentials: WordPressCredentials) {
    this.credentials = credentials;
    this.baseUrl = this.normalizeUrl(credentials.siteUrl);

    // Create axios instance with authentication
    this.client = axios.create({
      baseURL: `${this.baseUrl}/wp-json/wp/v2`,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.setupAuthentication();
    this.setupInterceptors();
  }

  /**
   * Normalize WordPress site URL
   */
  private normalizeUrl(url: string): string {
    // Remove trailing slash
    url = url.replace(/\/$/, '');

    // Ensure https:// or http://
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = `https://${url}`;
    }

    return url;
  }

  /**
   * Setup authentication based on auth type
   */
  private setupAuthentication(): void {
    switch (this.credentials.authType) {
      case 'basic':
        if (this.credentials.username && this.credentials.password) {
          this.client.defaults.auth = {
            username: this.credentials.username,
            password: this.credentials.password,
          };
        }
        break;

      case 'application-password':
        if (this.credentials.username && this.credentials.applicationPassword) {
          this.client.defaults.auth = {
            username: this.credentials.username,
            password: this.credentials.applicationPassword,
          };
        }
        break;

      case 'jwt':
        if (this.credentials.jwtToken) {
          this.client.defaults.headers.common['Authorization'] =
            `Bearer ${this.credentials.jwtToken}`;
        }
        break;
    }
  }

  /**
   * Setup request/response interceptors
   */
  private setupInterceptors(): void {
    // Request interceptor
    this.client.interceptors.request.use(
      (config) => {
        AppLogger.debug('WordPress API Request', {
          method: config.method,
          url: config.url,
          headers: config.headers,
        });
        return config;
      },
      (error) => {
        AppLogger.error('WordPress API Request Error', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response) => {
        AppLogger.debug('WordPress API Response', {
          status: response.status,
          url: response.config.url,
        });
        return response;
      },
      (error: AxiosError) => {
        this.handleApiError(error);
        return Promise.reject(error);
      }
    );
  }

  /**
   * Handle API errors
   */
  private handleApiError(error: AxiosError): void {
    if (error.response) {
      AppLogger.error('WordPress API Error Response', {
        status: error.response.status,
        data: error.response.data,
        url: error.config?.url,
      });
    } else if (error.request) {
      AppLogger.error('WordPress API No Response', {
        url: error.config?.url,
        message: error.message,
      });
    } else {
      AppLogger.error('WordPress API Request Setup Error', error);
    }
  }

  /**
   * Test connection to WordPress site
   */
  async testConnection(): Promise<{ success: boolean; message: string; version?: string }> {
    try {
      const response = await axios.get(`${this.baseUrl}/wp-json`);

      return {
        success: true,
        message: 'Successfully connected to WordPress site',
        version: response.data.description || response.data.name,
      };
    } catch (error) {
      AppLogger.error('WordPress connection test failed', error as Error);
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Connection failed',
      };
    }
  }

  /**
   * Create a post or page
   */
  async createPost(post: WordPressPost): Promise<{ id: number; link: string }> {
    try {
      const response = await this.client.post(
        post.type === 'page' ? '/pages' : '/posts',
        {
          title: post.title,
          content: post.content,
          status: post.status,
          meta: post.meta || {},
          featured_media: post.featured_media,
          categories: post.categories,
          tags: post.tags,
          template: post.template,
        }
      );

      AppLogger.info('WordPress post created', {
        id: response.data.id,
        title: post.title,
        type: post.type,
      });

      return {
        id: response.data.id,
        link: response.data.link,
      };
    } catch (error) {
      AppLogger.error('Failed to create WordPress post', error as Error);
      throw new Error(`Failed to create post: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update an existing post
   */
  async updatePost(id: number, post: Partial<WordPressPost>): Promise<void> {
    try {
      await this.client.post(`/posts/${id}`, post);

      AppLogger.info('WordPress post updated', { id, title: post.title });
    } catch (error) {
      AppLogger.error('Failed to update WordPress post', error as Error);
      throw new Error(`Failed to update post: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Upload media file
   */
  async uploadMedia(
    fileBuffer: Buffer,
    filename: string,
    mimeType: string,
    altText?: string
  ): Promise<WordPressMedia> {
    try {
      const formData = new FormData();
      formData.append('file', fileBuffer, {
        filename,
        contentType: mimeType,
      });

      if (altText) {
        formData.append('alt_text', altText);
      }

      const response = await this.client.post('/media', formData, {
        headers: {
          ...formData.getHeaders(),
        },
      });

      AppLogger.info('WordPress media uploaded', {
        id: response.data.id,
        filename,
      });

      return {
        id: response.data.id,
        source_url: response.data.source_url,
        title: response.data.title?.rendered || filename,
        alt_text: response.data.alt_text || '',
        media_type: response.data.media_type,
        mime_type: response.data.mime_type,
      };
    } catch (error) {
      AppLogger.error('Failed to upload WordPress media', error as Error);
      throw new Error(`Failed to upload media: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create Elementor template
   */
  async createElementorTemplate(
    title: string,
    content: string,
    type: 'page' | 'section' | 'widget' = 'page',
    meta?: Record<string, any>
  ): Promise<{ id: number; editLink: string }> {
    try {
      // Elementor templates are custom post types
      const response = await this.client.post('/elementor_library', {
        title,
        content,
        status: 'publish',
        type: 'elementor_library',
        meta: {
          _elementor_edit_mode: 'builder',
          _elementor_template_type: type,
          _elementor_data: content,
          ...meta,
        },
      });

      const editLink = `${this.baseUrl}/wp-admin/post.php?post=${response.data.id}&action=elementor`;

      AppLogger.info('Elementor template created', {
        id: response.data.id,
        title,
        type,
      });

      return {
        id: response.data.id,
        editLink,
      };
    } catch (error) {
      AppLogger.error('Failed to create Elementor template', error as Error);
      throw new Error(`Failed to create template: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create Gutenberg template
   */
  async createGutenbergTemplate(
    title: string,
    content: string,
    type: 'wp_template' | 'wp_template_part' = 'wp_template',
    slug?: string
  ): Promise<{ id: number }> {
    try {
      const response = await this.client.post('/templates', {
        title,
        content,
        type,
        slug: slug || title.toLowerCase().replace(/\s+/g, '-'),
        status: 'publish',
      });

      AppLogger.info('Gutenberg template created', {
        id: response.data.id,
        title,
        type,
      });

      return {
        id: response.data.id,
      };
    } catch (error) {
      AppLogger.error('Failed to create Gutenberg template', error as Error);
      throw new Error(`Failed to create template: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Execute custom plugin API endpoint
   */
  async executePluginAPI(
    namespace: string,
    route: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    data?: any
  ): Promise<any> {
    try {
      const url = `${this.baseUrl}/wp-json/${namespace}${route}`;

      let response;
      switch (method) {
        case 'GET':
          response = await this.client.get(url);
          break;
        case 'POST':
          response = await this.client.post(url, data);
          break;
        case 'PUT':
          response = await this.client.put(url, data);
          break;
        case 'DELETE':
          response = await this.client.delete(url);
          break;
      }

      return response.data;
    } catch (error) {
      AppLogger.error('Plugin API call failed', error as Error);
      throw new Error(`Plugin API error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get post by ID
   */
  async getPost(id: number, type: 'post' | 'page' = 'post'): Promise<any> {
    try {
      const endpoint = type === 'page' ? '/pages' : '/posts';
      const response = await this.client.get(`${endpoint}/${id}`);
      return response.data;
    } catch (error) {
      AppLogger.error('Failed to get WordPress post', error as Error);
      throw new Error(`Failed to get post: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete post by ID
   */
  async deletePost(id: number, type: 'post' | 'page' = 'post', force: boolean = false): Promise<void> {
    try {
      const endpoint = type === 'page' ? '/pages' : '/posts';
      await this.client.delete(`${endpoint}/${id}`, {
        params: { force },
      });

      AppLogger.info('WordPress post deleted', { id, type, force });
    } catch (error) {
      AppLogger.error('Failed to delete WordPress post', error as Error);
      throw new Error(`Failed to delete post: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if Elementor is installed and active
   */
  async isElementorActive(): Promise<boolean> {
    try {
      const response = await axios.get(`${this.baseUrl}/wp-json/elementor/v1/system-info`);
      return response.status === 200;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if Gutenberg (Block Editor) is available
   */
  async isGutenbergAvailable(): Promise<boolean> {
    try {
      const response = await this.client.get('/block-renderer');
      return response.status === 200;
    } catch (error) {
      // Try alternative check
      try {
        const siteResponse = await axios.get(`${this.baseUrl}/wp-json`);
        const wpVersion = siteResponse.data.version || '';
        // Gutenberg is available in WP 5.0+
        return parseFloat(wpVersion) >= 5.0;
      } catch {
        return false;
      }
    }
  }

  /**
   * Get site information
   */
  async getSiteInfo(): Promise<{
    name: string;
    description: string;
    url: string;
    wpVersion: string;
    plugins: { elementor: boolean; gutenberg: boolean };
  }> {
    try {
      const response = await axios.get(`${this.baseUrl}/wp-json`);
      const [elementorActive, gutenbergActive] = await Promise.all([
        this.isElementorActive(),
        this.isGutenbergAvailable(),
      ]);

      return {
        name: response.data.name || '',
        description: response.data.description || '',
        url: response.data.url || this.baseUrl,
        wpVersion: response.data.version || 'unknown',
        plugins: {
          elementor: elementorActive,
          gutenberg: gutenbergActive,
        },
      };
    } catch (error) {
      AppLogger.error('Failed to get WordPress site info', error as Error);
      throw new Error(`Failed to get site info: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

/**
 * Create WordPress API client with credentials
 */
export function createWordPressClient(credentials: WordPressCredentials): WordPressAPIClient {
  return new WordPressAPIClient(credentials);
}
