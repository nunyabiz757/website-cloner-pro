import * as cheerio from 'cheerio';

/**
 * DynamicContentService
 *
 * Comprehensive dynamic content handling:
 * - Detect and preserve dynamic content areas
 * - API-driven content detection and mapping
 * - Database-driven content identification
 * - CMS content migration planning
 * - React/Vue/Angular component detection
 * - GraphQL and REST API endpoint discovery
 */

// Dynamic content detection result
export interface DynamicContentDetection {
  hasDynamicContent: boolean;
  confidence: number; // 0-1
  dynamicAreas: DynamicArea[];
  apiEndpoints: APIEndpoint[];
  databaseContent: DatabaseContent[];
  cmsDetection: CMSDetection;
  frameworkDetection: FrameworkDetection;
  totalDynamicElements: number;
}

export interface DynamicArea {
  id: string;
  type: 'api-driven' | 'database' | 'cms' | 'ajax' | 'websocket' | 'ssr' | 'client-rendered';
  selector: string;
  description: string;
  endpoint?: string;
  dataSource?: string;
  updateFrequency?: 'realtime' | 'polling' | 'static';
  preservationStrategy: 'snapshot' | 'api-migration' | 'manual' | 'script-replay';
  confidence: number;
  detectedBy: string[];
  sampleData?: any;
}

// API endpoint detection
export interface APIEndpoint {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  type: 'rest' | 'graphql' | 'soap' | 'websocket' | 'unknown';
  authentication?: 'none' | 'api-key' | 'bearer' | 'oauth' | 'basic' | 'custom';
  headers?: Record<string, string>;
  parameters?: Record<string, any>;
  responseFormat?: 'json' | 'xml' | 'html' | 'text';
  usedBy: string[]; // Selectors that use this endpoint
  frequency: number; // How many times it's called
  critical: boolean; // Is it critical for page functionality?
}

// Database-driven content
export interface DatabaseContent {
  area: string;
  contentType: 'posts' | 'products' | 'users' | 'comments' | 'media' | 'custom' | 'taxonomy';
  databaseTable?: string;
  fields: DatabaseField[];
  relationships: DatabaseRelationship[];
  estimatedRecords?: number;
  migrationPriority: 'critical' | 'high' | 'medium' | 'low';
  preservationMethod: 'export' | 'api' | 'scrape' | 'manual';
}

export interface DatabaseField {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'json' | 'binary' | 'reference';
  nullable: boolean;
  indexed: boolean;
  description?: string;
}

export interface DatabaseRelationship {
  type: 'one-to-one' | 'one-to-many' | 'many-to-many';
  targetTable: string;
  foreignKey: string;
  description?: string;
}

// CMS detection
export interface CMSDetection {
  detected: boolean;
  cms: 'wordpress' | 'drupal' | 'joomla' | 'shopify' | 'magento' | 'wix' | 'squarespace' | 'contentful' | 'strapi' | 'none';
  version?: string;
  confidence: number;
  apiAvailable: boolean;
  apiEndpoints: string[];
  contentTypes: string[];
  customPostTypes?: string[];
  taxonomies?: string[];
  plugins?: string[];
}

// Framework detection
export interface FrameworkDetection {
  detected: boolean;
  framework: 'react' | 'vue' | 'angular' | 'svelte' | 'nextjs' | 'nuxtjs' | 'gatsby' | 'none';
  version?: string;
  rendering: 'csr' | 'ssr' | 'ssg' | 'hybrid';
  hydration: boolean;
  components: ComponentDetection[];
  stateManagement?: 'redux' | 'vuex' | 'mobx' | 'context' | 'pinia' | 'none';
}

export interface ComponentDetection {
  name: string;
  type: string;
  selector: string;
  props?: Record<string, any>;
  isDynamic: boolean;
  dataSource?: string;
}

// Content migration plan
export interface ContentMigrationPlan {
  strategy: 'full-export' | 'api-migration' | 'hybrid' | 'manual';
  estimatedTime: string;
  estimatedComplexity: 'low' | 'medium' | 'high' | 'very-high';
  steps: MigrationStep[];
  prerequisites: string[];
  risks: string[];
  recommendations: string[];
  automationLevel: number; // 0-100%
}

export interface MigrationStep {
  id: string;
  order: number;
  title: string;
  description: string;
  type: 'automated' | 'manual' | 'semi-automated';
  estimatedTime: string;
  dependencies: string[];
  tools: string[];
  commands?: string[];
  notes?: string[];
}

// Dynamic content preservation
export interface DynamicContentPreservation {
  originalContent: string;
  preservedContent: string;
  dynamicAreas: PreservedDynamicArea[];
  apiData: Record<string, any>;
  preservationMethod: 'snapshot' | 'api-export' | 'hybrid';
  preservationDate: string;
  metadata: Record<string, any>;
}

export interface PreservedDynamicArea {
  selector: string;
  originalHTML: string;
  staticHTML: string;
  dataSnapshot: any;
  apiEndpoint?: string;
  preservationNotes: string[];
}

class DynamicContentService {
  /**
   * Detect dynamic content in HTML
   */
  async detectDynamicContent(html: string, url: string): Promise<DynamicContentDetection> {
    const $ = cheerio.load(html);
    const dynamicAreas: DynamicArea[] = [];
    const apiEndpoints: APIEndpoint[] = [];
    const databaseContent: DatabaseContent[] = [];

    // Detect CMS
    const cmsDetection = this.detectCMS(html);

    // Detect JavaScript framework
    const frameworkDetection = this.detectFramework(html);

    // Method 1: Detect API calls in scripts
    const scriptAPIs = this.detectAPICallsInScripts(html);
    apiEndpoints.push(...scriptAPIs);

    // Method 2: Detect data attributes indicating dynamic content
    const dataAttributeAreas = this.detectDataAttributes($);
    dynamicAreas.push(...dataAttributeAreas);

    // Method 3: Detect AJAX containers
    const ajaxAreas = this.detectAjaxContainers($);
    dynamicAreas.push(...ajaxAreas);

    // Method 4: Detect React/Vue roots
    if (frameworkDetection.detected) {
      const frameworkAreas = this.detectFrameworkRoots($, frameworkDetection.framework);
      dynamicAreas.push(...frameworkAreas);
    }

    // Method 5: Detect WordPress/CMS dynamic areas
    if (cmsDetection.detected) {
      const cmsAreas = this.detectCMSDynamicAreas($, cmsDetection.cms);
      dynamicAreas.push(...cmsAreas);

      const cmsDBContent = this.detectCMSDatabaseContent($, cmsDetection.cms);
      databaseContent.push(...cmsDBContent);
    }

    // Method 6: Detect infinite scroll / lazy loading
    const lazyLoadAreas = this.detectLazyLoadAreas($);
    dynamicAreas.push(...lazyLoadAreas);

    // Method 7: Detect WebSocket connections
    const websocketAreas = this.detectWebSocketContent(html);
    dynamicAreas.push(...websocketAreas);

    // Calculate confidence
    const hasDynamicContent = dynamicAreas.length > 0 || apiEndpoints.length > 0;
    const confidence = this.calculateDynamicConfidence(
      dynamicAreas,
      apiEndpoints,
      cmsDetection,
      frameworkDetection
    );

    return {
      hasDynamicContent,
      confidence,
      dynamicAreas,
      apiEndpoints,
      databaseContent,
      cmsDetection,
      frameworkDetection,
      totalDynamicElements: dynamicAreas.length + apiEndpoints.length + databaseContent.length,
    };
  }

  /**
   * Detect CMS
   */
  private detectCMS(html: string): CMSDetection {
    const $ = cheerio.load(html);
    let cms: CMSDetection['cms'] = 'none';
    let confidence = 0;
    const apiEndpoints: string[] = [];
    const contentTypes: string[] = [];
    const customPostTypes: string[] = [];
    const taxonomies: string[] = [];
    const plugins: string[] = [];

    // WordPress detection
    if (
      html.includes('wp-content') ||
      html.includes('wp-includes') ||
      html.includes('wordpress') ||
      $('meta[name="generator"]').attr('content')?.includes('WordPress')
    ) {
      cms = 'wordpress';
      confidence = 0.95;
      apiEndpoints.push('/wp-json/wp/v2/');
      contentTypes.push('posts', 'pages', 'media', 'comments');

      // Detect custom post types
      const bodyClasses = $('body').attr('class') || '';
      const postTypeMatch = bodyClasses.match(/post-type-(\w+)/);
      if (postTypeMatch) {
        customPostTypes.push(postTypeMatch[1]);
      }

      // Detect taxonomies
      const taxonomyMatch = bodyClasses.match(/taxonomy-(\w+)/);
      if (taxonomyMatch) {
        taxonomies.push(taxonomyMatch[1]);
      }

      // Detect common plugins
      if (html.includes('woocommerce')) plugins.push('WooCommerce');
      if (html.includes('elementor')) plugins.push('Elementor');
      if (html.includes('yoast')) plugins.push('Yoast SEO');
    }

    // Drupal detection
    else if (
      html.includes('drupal') ||
      $('meta[name="Generator"]').attr('content')?.includes('Drupal')
    ) {
      cms = 'drupal';
      confidence = 0.9;
      apiEndpoints.push('/jsonapi/');
      contentTypes.push('node', 'taxonomy_term', 'user', 'file');
    }

    // Shopify detection
    else if (
      html.includes('cdn.shopify.com') ||
      html.includes('Shopify.') ||
      $('meta[name="shopify"]').length > 0
    ) {
      cms = 'shopify';
      confidence = 0.95;
      apiEndpoints.push('/admin/api/2024-01/');
      contentTypes.push('products', 'collections', 'orders', 'customers');
    }

    // Contentful detection
    else if (
      html.includes('contentful') ||
      html.includes('cdn.contentful.com')
    ) {
      cms = 'contentful';
      confidence = 0.85;
      apiEndpoints.push('/spaces/');
      contentTypes.push('entries', 'assets');
    }

    // Strapi detection
    else if (html.includes('strapi') || html.includes('/api/')) {
      cms = 'strapi';
      confidence = 0.75;
      apiEndpoints.push('/api/');
      contentTypes.push('dynamic');
    }

    return {
      detected: cms !== 'none',
      cms,
      version: this.detectCMSVersion(html, cms),
      confidence,
      apiAvailable: apiEndpoints.length > 0,
      apiEndpoints,
      contentTypes,
      customPostTypes,
      taxonomies,
      plugins,
    };
  }

  /**
   * Detect CMS version
   */
  private detectCMSVersion(html: string, cms: string): string | undefined {
    const $ = cheerio.load(html);

    if (cms === 'wordpress') {
      const generator = $('meta[name="generator"]').attr('content');
      const match = generator?.match(/WordPress (\d+\.\d+(?:\.\d+)?)/);
      return match ? match[1] : undefined;
    }

    // Add more CMS version detection as needed
    return undefined;
  }

  /**
   * Detect JavaScript framework
   */
  private detectFramework(html: string): FrameworkDetection {
    const $ = cheerio.load(html);
    let framework: FrameworkDetection['framework'] = 'none';
    let rendering: FrameworkDetection['rendering'] = 'csr';
    let hydration = false;
    const components: ComponentDetection[] = [];
    let stateManagement: FrameworkDetection['stateManagement'] = 'none';

    // React detection
    if (
      html.includes('react') ||
      html.includes('_reactRoot') ||
      $('[data-reactroot]').length > 0 ||
      $('#root').length > 0 ||
      $('#__next').length > 0
    ) {
      framework = 'react';

      // Next.js detection
      if (html.includes('__NEXT_DATA__') || $('#__next').length > 0) {
        framework = 'nextjs';
        rendering = 'hybrid';
        hydration = true;
      }

      // Gatsby detection
      if (html.includes('gatsby')) {
        framework = 'gatsby';
        rendering = 'ssg';
      }

      // Redux detection
      if (html.includes('redux') || html.includes('__REDUX_DEVTOOLS_EXTENSION__')) {
        stateManagement = 'redux';
      }
    }

    // Vue detection
    else if (
      html.includes('vue') ||
      $('[data-v-]').length > 0 ||
      $('[v-cloak]').length > 0 ||
      html.includes('_createVNode')
    ) {
      framework = 'vue';

      // Nuxt.js detection
      if (html.includes('__NUXT__')) {
        framework = 'nuxtjs';
        rendering = 'hybrid';
        hydration = true;
      }

      // Vuex detection
      if (html.includes('vuex') || html.includes('$store')) {
        stateManagement = 'vuex';
      }

      // Pinia detection
      if (html.includes('pinia')) {
        stateManagement = 'pinia';
      }
    }

    // Angular detection
    else if (
      html.includes('ng-version') ||
      $('[ng-version]').length > 0 ||
      html.includes('angular')
    ) {
      framework = 'angular';
      rendering = 'csr';
    }

    // Svelte detection
    else if (html.includes('svelte') || $('[class^="svelte-"]').length > 0) {
      framework = 'svelte';
      rendering = 'csr';
    }

    // Detect components
    if (framework !== 'none') {
      components.push(...this.detectComponents($, framework));
    }

    return {
      detected: framework !== 'none',
      framework,
      version: this.detectFrameworkVersion(html, framework),
      rendering,
      hydration,
      components,
      stateManagement,
    };
  }

  /**
   * Detect framework version
   */
  private detectFrameworkVersion(html: string, framework: string): string | undefined {
    // Extract version from script sources or window variables
    const versionPatterns: Record<string, RegExp> = {
      react: /react@([\d.]+)/,
      vue: /vue@([\d.]+)/,
      angular: /ng-version="([\d.]+)"/,
    };

    const pattern = versionPatterns[framework];
    if (pattern) {
      const match = html.match(pattern);
      return match ? match[1] : undefined;
    }

    return undefined;
  }

  /**
   * Detect components
   */
  private detectComponents($: cheerio.CheerioAPI, framework: string): ComponentDetection[] {
    const components: ComponentDetection[] = [];

    if (framework === 'react' || framework === 'nextjs') {
      // React components often have data-reactroot or specific IDs
      $('[data-reactroot], #root > *, [data-component]').each((_, elem) => {
        const $elem = $(elem);
        components.push({
          name: $elem.attr('data-component') || 'ReactComponent',
          type: 'react',
          selector: this.getSelector($elem),
          isDynamic: this.hasDataAttributes($elem),
          dataSource: $elem.attr('data-source'),
        });
      });
    }

    return components;
  }

  /**
   * Detect API calls in scripts
   */
  private detectAPICallsInScripts(html: string): APIEndpoint[] {
    const endpoints: APIEndpoint[] = [];
    const apiPatterns = [
      /fetch\(['"`]([^'"`]+)['"`]/g,
      /axios\.(get|post|put|delete|patch)\(['"`]([^'"`]+)['"`]/g,
      /\$\.(ajax|get|post)\(\s*['"`]([^'"`]+)['"`]/g,
      /XMLHttpRequest.*?open\(['"`](GET|POST|PUT|DELETE)['"`],\s*['"`]([^'"`]+)['"`]/g,
    ];

    apiPatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(html)) !== null) {
        const url = match[match.length - 1] || match[2];
        if (url && !url.startsWith('data:') && !url.startsWith('blob:')) {
          endpoints.push({
            url,
            method: this.inferHTTPMethod(match[0]),
            type: this.detectAPIType(url),
            usedBy: ['script'],
            frequency: 1,
            critical: true,
          });
        }
      }
    });

    // Detect GraphQL
    if (html.includes('graphql') || html.includes('__APOLLO_STATE__')) {
      const graphqlMatch = html.match(/['"`]([^'"`]*graphql[^'"`]*)['"`]/);
      if (graphqlMatch) {
        endpoints.push({
          url: graphqlMatch[1],
          method: 'POST',
          type: 'graphql',
          usedBy: ['graphql-client'],
          frequency: 1,
          critical: true,
        });
      }
    }

    return endpoints;
  }

  /**
   * Infer HTTP method
   */
  private inferHTTPMethod(apiCall: string): APIEndpoint['method'] {
    if (/post/i.test(apiCall)) return 'POST';
    if (/put/i.test(apiCall)) return 'PUT';
    if (/delete/i.test(apiCall)) return 'DELETE';
    if (/patch/i.test(apiCall)) return 'PATCH';
    return 'GET';
  }

  /**
   * Detect API type
   */
  private detectAPIType(url: string): APIEndpoint['type'] {
    if (url.includes('graphql')) return 'graphql';
    if (url.includes('ws://') || url.includes('wss://')) return 'websocket';
    if (url.includes('xml') || url.includes('soap')) return 'soap';
    if (url.includes('api') || url.includes('/v1/') || url.includes('/v2/')) return 'rest';
    return 'unknown';
  }

  /**
   * Detect data attributes
   */
  private detectDataAttributes($: cheerio.CheerioAPI): DynamicArea[] {
    const areas: DynamicArea[] = [];

    $('[data-api], [data-endpoint], [data-source], [data-fetch]').each((_, elem) => {
      const $elem = $(elem);
      areas.push({
        id: `data-attr-${areas.length}`,
        type: 'api-driven',
        selector: this.getSelector($elem),
        description: 'Element with data API attributes',
        endpoint: $elem.attr('data-api') || $elem.attr('data-endpoint'),
        dataSource: $elem.attr('data-source'),
        preservationStrategy: 'api-migration',
        confidence: 0.9,
        detectedBy: ['data-attributes'],
      });
    });

    return areas;
  }

  /**
   * Detect AJAX containers
   */
  private detectAjaxContainers($: cheerio.CheerioAPI): DynamicArea[] {
    const areas: DynamicArea[] = [];

    // Common AJAX container patterns
    const ajaxSelectors = [
      '.ajax-container',
      '.dynamic-content',
      '[data-ajax]',
      '.load-more',
      '.infinite-scroll',
      '#ajax-content',
    ];

    ajaxSelectors.forEach(selector => {
      $(selector).each((_, elem) => {
        const $elem = $(elem);
        areas.push({
          id: `ajax-${areas.length}`,
          type: 'ajax',
          selector: this.getSelector($elem),
          description: `AJAX container: ${selector}`,
          updateFrequency: 'polling',
          preservationStrategy: 'snapshot',
          confidence: 0.75,
          detectedBy: ['ajax-patterns'],
        });
      });
    });

    return areas;
  }

  /**
   * Detect framework roots
   */
  private detectFrameworkRoots($: cheerio.CheerioAPI, framework: string): DynamicArea[] {
    const areas: DynamicArea[] = [];

    const rootSelectors: Record<string, string[]> = {
      react: ['#root', '#__next', '[data-reactroot]'],
      vue: ['#app', '[data-v-app]'],
      angular: ['[ng-version]', 'app-root'],
      svelte: ['[class^="svelte-"]'],
    };

    const selectors = rootSelectors[framework] || [];
    selectors.forEach(selector => {
      $(selector).each((_, elem) => {
        const $elem = $(elem);
        areas.push({
          id: `framework-${areas.length}`,
          type: 'client-rendered',
          selector: this.getSelector($elem),
          description: `${framework} application root`,
          preservationStrategy: 'script-replay',
          confidence: 0.95,
          detectedBy: ['framework-detection'],
        });
      });
    });

    return areas;
  }

  /**
   * Detect CMS dynamic areas
   */
  private detectCMSDynamicAreas($: cheerio.CheerioAPI, cms: string): DynamicArea[] {
    const areas: DynamicArea[] = [];

    if (cms === 'wordpress') {
      // WordPress dynamic areas
      $('.wp-block, [class*="wp-"], .post, .page, .widget').each((_, elem) => {
        const $elem = $(elem);
        areas.push({
          id: `wp-${areas.length}`,
          type: 'cms',
          selector: this.getSelector($elem),
          description: 'WordPress dynamic content area',
          dataSource: 'WordPress Database',
          preservationStrategy: 'api-migration',
          confidence: 0.85,
          detectedBy: ['cms-patterns'],
        });
      });
    }

    return areas;
  }

  /**
   * Detect CMS database content
   */
  private detectCMSDatabaseContent($: cheerio.CheerioAPI, cms: string): DatabaseContent[] {
    const content: DatabaseContent[] = [];

    if (cms === 'wordpress') {
      // Posts
      if ($('.post, article').length > 0) {
        content.push({
          area: 'posts',
          contentType: 'posts',
          databaseTable: 'wp_posts',
          fields: [
            { name: 'ID', type: 'number', nullable: false, indexed: true },
            { name: 'post_title', type: 'string', nullable: false, indexed: true },
            { name: 'post_content', type: 'string', nullable: false, indexed: false },
            { name: 'post_date', type: 'date', nullable: false, indexed: true },
            { name: 'post_author', type: 'reference', nullable: false, indexed: true },
          ],
          relationships: [
            { type: 'one-to-many', targetTable: 'wp_postmeta', foreignKey: 'post_id', description: 'Post metadata' },
            { type: 'many-to-many', targetTable: 'wp_terms', foreignKey: 'object_id', description: 'Taxonomy terms' },
          ],
          migrationPriority: 'critical',
          preservationMethod: 'api',
        });
      }

      // Media
      if ($('img, video').length > 0) {
        content.push({
          area: 'media',
          contentType: 'media',
          databaseTable: 'wp_posts (post_type=attachment)',
          fields: [
            { name: 'ID', type: 'number', nullable: false, indexed: true },
            { name: 'guid', type: 'string', nullable: false, indexed: false },
            { name: 'post_mime_type', type: 'string', nullable: false, indexed: true },
          ],
          relationships: [
            { type: 'one-to-many', targetTable: 'wp_postmeta', foreignKey: 'post_id', description: 'Attachment metadata' },
          ],
          migrationPriority: 'high',
          preservationMethod: 'export',
        });
      }
    }

    return content;
  }

  /**
   * Detect lazy load areas
   */
  private detectLazyLoadAreas($: cheerio.CheerioAPI): DynamicArea[] {
    const areas: DynamicArea[] = [];

    $('[data-lazy], [loading="lazy"], .lazy-load, .lazyload').each((_, elem) => {
      const $elem = $(elem);
      areas.push({
        id: `lazy-${areas.length}`,
        type: 'ajax',
        selector: this.getSelector($elem),
        description: 'Lazy loaded content',
        updateFrequency: 'static',
        preservationStrategy: 'snapshot',
        confidence: 0.8,
        detectedBy: ['lazy-load-patterns'],
      });
    });

    return areas;
  }

  /**
   * Detect WebSocket content
   */
  private detectWebSocketContent(html: string): DynamicArea[] {
    const areas: DynamicArea[] = [];

    if (html.includes('WebSocket') || html.includes('ws://') || html.includes('wss://')) {
      areas.push({
        id: 'websocket-0',
        type: 'websocket',
        selector: 'body',
        description: 'WebSocket-driven real-time content',
        updateFrequency: 'realtime',
        preservationStrategy: 'manual',
        confidence: 0.9,
        detectedBy: ['websocket-detection'],
      });
    }

    return areas;
  }

  /**
   * Calculate dynamic content confidence
   */
  private calculateDynamicConfidence(
    dynamicAreas: DynamicArea[],
    apiEndpoints: APIEndpoint[],
    cmsDetection: CMSDetection,
    frameworkDetection: FrameworkDetection
  ): number {
    let score = 0;

    if (dynamicAreas.length > 0) score += 0.3;
    if (apiEndpoints.length > 0) score += 0.3;
    if (cmsDetection.detected) score += 0.2;
    if (frameworkDetection.detected) score += 0.2;

    return Math.min(score, 1);
  }

  /**
   * Create content migration plan
   */
  createMigrationPlan(detection: DynamicContentDetection): ContentMigrationPlan {
    const steps: MigrationStep[] = [];
    const prerequisites: string[] = [];
    const risks: string[] = [];
    const recommendations: string[] = [];

    let complexity: ContentMigrationPlan['estimatedComplexity'] = 'low';
    let strategy: ContentMigrationPlan['strategy'] = 'full-export';
    let automationLevel = 90;

    // Determine strategy based on detection
    if (detection.cmsDetection.detected && detection.cmsDetection.apiAvailable) {
      strategy = 'api-migration';
      automationLevel = 85;

      steps.push({
        id: 'step-1',
        order: 1,
        title: 'Export CMS Content via API',
        description: `Use ${detection.cmsDetection.cms} API to export all content`,
        type: 'automated',
        estimatedTime: '2-4 hours',
        dependencies: [],
        tools: ['WP-CLI', 'REST API', 'Custom Scripts'],
        commands: this.generateCMSExportCommands(detection.cmsDetection.cms),
      });

      prerequisites.push(`${detection.cmsDetection.cms} API access`);
      prerequisites.push('API authentication credentials');
    }

    if (detection.frameworkDetection.detected) {
      complexity = 'high';
      automationLevel = 60;

      steps.push({
        id: 'step-framework',
        order: 2,
        title: `Handle ${detection.frameworkDetection.framework} Dynamic Content`,
        description: 'Preserve client-side rendered content',
        type: 'semi-automated',
        estimatedTime: '4-8 hours',
        dependencies: ['step-1'],
        tools: ['Puppeteer', 'Headless Browser'],
        notes: [
          'Client-side rendering requires JavaScript execution',
          'Consider server-side rendering alternatives',
        ],
      });

      risks.push('Client-side rendered content may not be fully preserved');
      recommendations.push('Use headless browser for complete page rendering');
    }

    if (detection.apiEndpoints.length > 0) {
      steps.push({
        id: 'step-api',
        order: 3,
        title: 'Map API Endpoints',
        description: 'Document and test all API endpoints',
        type: 'manual',
        estimatedTime: '2-6 hours',
        dependencies: [],
        tools: ['Postman', 'Insomnia', 'curl'],
      });

      recommendations.push('Create API documentation for future reference');
    }

    if (detection.databaseContent.length > 0) {
      steps.push({
        id: 'step-db',
        order: 4,
        title: 'Export Database Content',
        description: 'Export all database-driven content',
        type: 'automated',
        estimatedTime: '1-3 hours',
        dependencies: ['step-1'],
        tools: ['mysqldump', 'wp db export'],
        commands: ['wp db export database.sql', 'mysqldump -u user -p database > backup.sql'],
      });

      prerequisites.push('Database access credentials');
    }

    // Final step
    steps.push({
      id: 'step-final',
      order: steps.length + 1,
      title: 'Validate Migrated Content',
      description: 'Verify all content was successfully migrated',
      type: 'manual',
      estimatedTime: '1-2 hours',
      dependencies: steps.map(s => s.id),
      tools: ['Browser', 'Comparison Tools'],
    });

    // Calculate total time
    const totalHours = steps.reduce((sum, step) => {
      const match = step.estimatedTime.match(/(\d+)-?(\d+)?/);
      return sum + (match ? parseInt(match[1]) : 0);
    }, 0);

    const estimatedTime = `${totalHours}-${totalHours * 2} hours`;

    return {
      strategy,
      estimatedTime,
      estimatedComplexity: complexity,
      steps,
      prerequisites,
      risks,
      recommendations,
      automationLevel,
    };
  }

  /**
   * Generate CMS export commands
   */
  private generateCMSExportCommands(cms: string): string[] {
    const commands: Record<string, string[]> = {
      wordpress: [
        'wp export --dir=./export',
        'wp db export database.sql',
        'wp media regenerate --yes',
        'wp plugin list --format=json > plugins.json',
        'wp theme list --format=json > themes.json',
      ],
      drupal: [
        'drush sql-dump > database.sql',
        'drush config-export',
        'drush archive-dump',
      ],
      shopify: [
        'shopify theme download',
        'shopify export products',
        'shopify export customers',
      ],
    };

    return commands[cms] || [];
  }

  /**
   * Preserve dynamic content
   */
  async preserveDynamicContent(
    html: string,
    detection: DynamicContentDetection,
    apiData?: Record<string, any>
  ): Promise<DynamicContentPreservation> {
    const $ = cheerio.load(html);
    const preservedAreas: PreservedDynamicArea[] = [];

    // Preserve each dynamic area
    for (const area of detection.dynamicAreas) {
      try {
        const $elem = $(area.selector);
        if ($elem.length > 0) {
          preservedAreas.push({
            selector: area.selector,
            originalHTML: $elem.html() || '',
            staticHTML: $elem.html() || '', // Could be replaced with static version
            dataSnapshot: apiData?.[area.id],
            apiEndpoint: area.endpoint,
            preservationNotes: [
              `Type: ${area.type}`,
              `Strategy: ${area.preservationStrategy}`,
              `Confidence: ${(area.confidence * 100).toFixed(0)}%`,
            ],
          });
        }
      } catch (error) {
        console.error(`Failed to preserve area ${area.id}:`, error);
      }
    }

    return {
      originalContent: html,
      preservedContent: $.html(),
      dynamicAreas: preservedAreas,
      apiData: apiData || {},
      preservationMethod: 'snapshot',
      preservationDate: new Date().toISOString(),
      metadata: {
        totalDynamicAreas: detection.dynamicAreas.length,
        totalAPIEndpoints: detection.apiEndpoints.length,
        cms: detection.cmsDetection.cms,
        framework: detection.frameworkDetection.framework,
      },
    };
  }

  /**
   * Get CSS selector for element
   */
  private getSelector($elem: cheerio.Cheerio<any>): string {
    const id = $elem.attr('id');
    if (id) return `#${id}`;

    const classes = $elem.attr('class');
    if (classes) {
      const classList = classes.split(' ').filter(c => c.trim());
      if (classList.length > 0) return `.${classList[0]}`;
    }

    return $elem.prop('tagName')?.toLowerCase() || 'unknown';
  }

  /**
   * Check if element has data attributes
   */
  private hasDataAttributes($elem: cheerio.Cheerio<any>): boolean {
    const attrs = $elem.attr();
    if (!attrs) return false;
    return Object.keys(attrs).some(key => key.startsWith('data-'));
  }
}

// Export singleton instance
export default new DynamicContentService();
