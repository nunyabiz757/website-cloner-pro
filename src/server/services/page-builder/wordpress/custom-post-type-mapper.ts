/**
 * Custom Post Type Mapping
 *
 * Maps content to WordPress custom post types:
 * - Content type detection
 * - Post type inference
 * - Taxonomy mapping
 * - Meta field extraction
 * - CPT registration code generation
 */

export interface CustomPostTypeMapping {
  postTypes: CustomPostType[];
  taxonomies: Taxonomy[];
  relationships: PostTypeRelationship[];
  registrationCode: string;
}

export interface CustomPostType {
  slug: string;
  singularName: string;
  pluralName: string;
  description: string;
  icon: string;
  supports: string[]; // 'title', 'editor', 'thumbnail', etc.
  hierarchical: boolean;
  hasArchive: boolean;
  rewrite: RewriteConfig;
  public: boolean;
  showInRest: boolean; // For Gutenberg/Elementor
  menuPosition: number;
  taxonomies: string[];
  metaFields: MetaField[];
  detectedFrom: string[]; // Page IDs where this type was detected
  confidence: number;
}

export interface Taxonomy {
  slug: string;
  singularName: string;
  pluralName: string;
  hierarchical: boolean; // true = category-like, false = tag-like
  postTypes: string[]; // Which post types use this taxonomy
  rewrite: RewriteConfig;
  showInRest: boolean;
  detectedFrom: string[];
  terms: TaxonomyTerm[];
}

export interface TaxonomyTerm {
  name: string;
  slug: string;
  count: number; // How many posts have this term
}

export interface RewriteConfig {
  slug: string;
  withFront: boolean;
  hierarchical?: boolean;
}

export interface MetaField {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'email' | 'url' | 'date' | 'select' | 'checkbox' | 'image' | 'file';
  defaultValue?: any;
  required: boolean;
  detectedFrom: string[];
}

export interface PostTypeRelationship {
  fromPostType: string;
  toPostType: string;
  relationship: 'one-to-one' | 'one-to-many' | 'many-to-many';
  description: string;
}

export class CustomPostTypeMapper {
  private postTypes: Map<string, CustomPostType> = new Map();
  private taxonomies: Map<string, Taxonomy> = new Map();
  private metaFields: Map<string, Map<string, MetaField>> = new Map();

  /**
   * Map content to custom post types
   */
  map(pageData: PageContentData[]): CustomPostTypeMapping {
    // Analyze content to detect post types
    this.detectPostTypes(pageData);

    // Detect taxonomies
    this.detectTaxonomies(pageData);

    // Detect meta fields
    this.detectMetaFields(pageData);

    // Detect relationships
    const relationships = this.detectRelationships();

    // Generate registration code
    const registrationCode = this.generateRegistrationCode();

    return {
      postTypes: Array.from(this.postTypes.values()),
      taxonomies: Array.from(this.taxonomies.values()),
      relationships,
      registrationCode,
    };
  }

  /**
   * Detect custom post types from content
   */
  private detectPostTypes(pageData: PageContentData[]): void {
    for (const page of pageData) {
      const contentType = this.inferContentType(page);

      if (contentType && contentType !== 'page' && contentType !== 'post') {
        if (!this.postTypes.has(contentType)) {
          this.postTypes.set(contentType, this.createPostType(contentType, page));
        }

        const postType = this.postTypes.get(contentType)!;
        if (!postType.detectedFrom.includes(page.id)) {
          postType.detectedFrom.push(page.id);
          postType.confidence = this.calculateConfidence(postType);
        }
      }
    }
  }

  /**
   * Infer content type from page data
   */
  private inferContentType(page: PageContentData): string | null {
    const url = page.url.toLowerCase();
    const title = page.title?.toLowerCase() || '';
    const classes = page.bodyClasses?.join(' ').toLowerCase() || '';

    // Check URL patterns
    if (url.includes('/portfolio/')) return 'portfolio';
    if (url.includes('/project/')) return 'project';
    if (url.includes('/product/')) return 'product';
    if (url.includes('/service/')) return 'service';
    if (url.includes('/team/') || url.includes('/staff/')) return 'team_member';
    if (url.includes('/testimonial/') || url.includes('/review/')) return 'testimonial';
    if (url.includes('/event/')) return 'event';
    if (url.includes('/case-study/') || url.includes('/case-studies/')) return 'case_study';
    if (url.includes('/faq/')) return 'faq';

    // Check body classes
    if (classes.includes('single-portfolio')) return 'portfolio';
    if (classes.includes('single-product')) return 'product';
    if (classes.includes('single-service')) return 'service';
    if (classes.includes('single-team')) return 'team_member';

    // Check for repeated structure (indicates archive/listing)
    if (this.hasRepeatedStructure(page)) {
      return this.inferFromStructure(page);
    }

    return null;
  }

  /**
   * Check if page has repeated structure (list/archive page)
   */
  private hasRepeatedStructure(page: PageContentData): boolean {
    // Look for repeated components with same structure
    const components = page.components || [];
    const signatures = new Map<string, number>();

    for (const component of components) {
      const sig = `${component.componentType}:${component.tagName}:${component.className}`;
      signatures.set(sig, (signatures.get(sig) || 0) + 1);
    }

    // If any signature appears 3+ times, likely a listing
    return Array.from(signatures.values()).some(count => count >= 3);
  }

  /**
   * Infer post type from structure
   */
  private inferFromStructure(page: PageContentData): string | null {
    const components = page.components || [];

    // Look for cards/items
    const cardCount = components.filter(c =>
      c.componentType === 'card' || (c.className || '').includes('card')
    ).length;

    if (cardCount >= 3) {
      // Try to infer from card content
      const cardComponent = components.find(c => c.componentType === 'card');
      if (cardComponent) {
        const text = cardComponent.textContent?.toLowerCase() || '';
        if (text.includes('project') || text.includes('portfolio')) return 'portfolio';
        if (text.includes('product')) return 'product';
        if (text.includes('service')) return 'service';
      }
    }

    return null;
  }

  /**
   * Create post type definition
   */
  private createPostType(slug: string, page: PageContentData): CustomPostType {
    const singularName = this.slugToTitle(slug);
    const pluralName = this.pluralize(singularName);

    return {
      slug,
      singularName,
      pluralName,
      description: `Custom post type for ${pluralName.toLowerCase()}`,
      icon: this.getIconForPostType(slug),
      supports: ['title', 'editor', 'thumbnail', 'excerpt', 'custom-fields'],
      hierarchical: false,
      hasArchive: true,
      rewrite: {
        slug,
        withFront: false,
      },
      public: true,
      showInRest: true,
      menuPosition: 20,
      taxonomies: [],
      metaFields: [],
      detectedFrom: [],
      confidence: 50,
    };
  }

  /**
   * Convert slug to title case
   */
  private slugToTitle(slug: string): string {
    return slug
      .split(/[-_]/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Simple pluralization
   */
  private pluralize(word: string): string {
    if (word.endsWith('y')) {
      return word.slice(0, -1) + 'ies';
    }
    if (word.endsWith('s') || word.endsWith('sh') || word.endsWith('ch')) {
      return word + 'es';
    }
    return word + 's';
  }

  /**
   * Get Dashicon for post type
   */
  private getIconForPostType(slug: string): string {
    const icons: Record<string, string> = {
      portfolio: 'dashicons-portfolio',
      project: 'dashicons-hammer',
      product: 'dashicons-products',
      service: 'dashicons-admin-tools',
      team_member: 'dashicons-groups',
      testimonial: 'dashicons-testimonial',
      event: 'dashicons-calendar-alt',
      case_study: 'dashicons-media-document',
      faq: 'dashicons-editor-help',
    };

    return icons[slug] || 'dashicons-admin-post';
  }

  /**
   * Detect taxonomies
   */
  private detectTaxonomies(pageData: PageContentData[]): void {
    for (const page of pageData) {
      const contentType = this.inferContentType(page);
      if (!contentType) continue;

      // Look for category/tag patterns
      const categories = this.extractCategories(page);
      const tags = this.extractTags(page);

      // Create taxonomies
      if (categories.length > 0) {
        const taxonomySlug = `${contentType}_category`;
        if (!this.taxonomies.has(taxonomySlug)) {
          this.taxonomies.set(taxonomySlug, this.createTaxonomy(
            taxonomySlug,
            `${this.slugToTitle(contentType)} Category`,
            true,
            [contentType]
          ));
        }

        const taxonomy = this.taxonomies.get(taxonomySlug)!;
        for (const cat of categories) {
          this.addTaxonomyTerm(taxonomy, cat);
        }
      }

      if (tags.length > 0) {
        const taxonomySlug = `${contentType}_tag`;
        if (!this.taxonomies.has(taxonomySlug)) {
          this.taxonomies.set(taxonomySlug, this.createTaxonomy(
            taxonomySlug,
            `${this.slugToTitle(contentType)} Tag`,
            false,
            [contentType]
          ));
        }

        const taxonomy = this.taxonomies.get(taxonomySlug)!;
        for (const tag of tags) {
          this.addTaxonomyTerm(taxonomy, tag);
        }
      }
    }
  }

  /**
   * Extract categories from page
   */
  private extractCategories(page: PageContentData): string[] {
    const categories: string[] = [];
    const url = page.url.toLowerCase();
    const components = page.components || [];

    // Look for category in URL
    const categoryMatch = url.match(/\/category\/([^\/]+)/);
    if (categoryMatch) {
      categories.push(this.slugToTitle(categoryMatch[1]));
    }

    // Look for category components
    for (const component of components) {
      const classes = (component.className || '').toLowerCase();
      if (classes.includes('category') || classes.includes('cat-')) {
        const text = component.textContent?.trim();
        if (text && text.length < 30) {
          categories.push(text);
        }
      }
    }

    return [...new Set(categories)];
  }

  /**
   * Extract tags from page
   */
  private extractTags(page: PageContentData): string[] {
    const tags: string[] = [];
    const components = page.components || [];

    for (const component of components) {
      const classes = (component.className || '').toLowerCase();
      if (classes.includes('tag') || classes.includes('label')) {
        const text = component.textContent?.trim();
        if (text && text.length < 20) {
          tags.push(text);
        }
      }
    }

    return [...new Set(tags)];
  }

  /**
   * Create taxonomy definition
   */
  private createTaxonomy(
    slug: string,
    name: string,
    hierarchical: boolean,
    postTypes: string[]
  ): Taxonomy {
    return {
      slug,
      singularName: name,
      pluralName: this.pluralize(name),
      hierarchical,
      postTypes,
      rewrite: {
        slug,
        withFront: false,
        hierarchical,
      },
      showInRest: true,
      detectedFrom: [],
      terms: [],
    };
  }

  /**
   * Add term to taxonomy
   */
  private addTaxonomyTerm(taxonomy: Taxonomy, termName: string): void {
    const existingTerm = taxonomy.terms.find(t => t.name === termName);
    if (existingTerm) {
      existingTerm.count++;
    } else {
      taxonomy.terms.push({
        name: termName,
        slug: termName.toLowerCase().replace(/\s+/g, '-'),
        count: 1,
      });
    }
  }

  /**
   * Detect meta fields
   */
  private detectMetaFields(pageData: PageContentData[]): void {
    for (const page of pageData) {
      const contentType = this.inferContentType(page);
      if (!contentType) continue;

      if (!this.metaFields.has(contentType)) {
        this.metaFields.set(contentType, new Map());
      }

      const fields = this.metaFields.get(contentType)!;

      // Extract potential meta fields
      const detected = this.extractMetaFields(page);

      for (const field of detected) {
        if (!fields.has(field.key)) {
          fields.set(field.key, field);
        } else {
          const existing = fields.get(field.key)!;
          if (!existing.detectedFrom.includes(page.id)) {
            existing.detectedFrom.push(page.id);
          }
        }
      }
    }

    // Assign meta fields to post types
    for (const [postTypeSlug, fields] of this.metaFields) {
      const postType = this.postTypes.get(postTypeSlug);
      if (postType) {
        postType.metaFields = Array.from(fields.values());
      }
    }
  }

  /**
   * Extract meta fields from page
   */
  private extractMetaFields(page: PageContentData): MetaField[] {
    const fields: MetaField[] = [];
    const components = page.components || [];

    // Common meta field patterns
    for (const component of components) {
      const text = component.textContent?.toLowerCase() || '';
      const classes = (component.className || '').toLowerCase();

      // Location
      if (text.includes('location:') || classes.includes('location')) {
        fields.push({
          key: 'location',
          label: 'Location',
          type: 'text',
          required: false,
          detectedFrom: [page.id],
        });
      }

      // Date
      if (text.match(/\d{4}-\d{2}-\d{2}/) || classes.includes('date')) {
        fields.push({
          key: 'event_date',
          label: 'Event Date',
          type: 'date',
          required: false,
          detectedFrom: [page.id],
        });
      }

      // Price
      if (text.match(/\$\d+/) || classes.includes('price')) {
        fields.push({
          key: 'price',
          label: 'Price',
          type: 'number',
          required: false,
          detectedFrom: [page.id],
        });
      }

      // URL/Link
      if (component.tagName === 'a' && component.attributes?.href) {
        const href = component.attributes.href;
        if (href.startsWith('http') && !href.includes(page.url)) {
          fields.push({
            key: 'external_url',
            label: 'External URL',
            type: 'url',
            required: false,
            detectedFrom: [page.id],
          });
        }
      }
    }

    return fields;
  }

  /**
   * Detect relationships between post types
   */
  private detectRelationships(): PostTypeRelationship[] {
    const relationships: PostTypeRelationship[] = [];

    // Example: Projects might relate to Team Members
    const hasProjects = this.postTypes.has('project') || this.postTypes.has('portfolio');
    const hasTeam = this.postTypes.has('team_member');

    if (hasProjects && hasTeam) {
      relationships.push({
        fromPostType: 'project',
        toPostType: 'team_member',
        relationship: 'many-to-many',
        description: 'Projects can be assigned to multiple team members',
      });
    }

    return relationships;
  }

  /**
   * Calculate confidence score for post type detection
   */
  private calculateConfidence(postType: CustomPostType): number {
    let confidence = 50;

    // More detections = higher confidence
    confidence += Math.min(postType.detectedFrom.length * 10, 30);

    // Has meta fields = higher confidence
    if (postType.metaFields.length > 0) {
      confidence += 10;
    }

    // Has taxonomies = higher confidence
    if (postType.taxonomies.length > 0) {
      confidence += 10;
    }

    return Math.min(confidence, 100);
  }

  /**
   * Generate WordPress registration code
   */
  private generateRegistrationCode(): string {
    let code = "<?php\n";
    code += "/**\n";
    code += " * Register Custom Post Types and Taxonomies\n";
    code += " * Generated by Website Cloner Pro\n";
    code += " */\n\n";

    code += "function register_custom_post_types() {\n";

    // Register each post type
    for (const postType of this.postTypes.values()) {
      code += this.generatePostTypeCode(postType);
    }

    code += "}\n";
    code += "add_action('init', 'register_custom_post_types');\n\n";

    // Register taxonomies
    code += "function register_custom_taxonomies() {\n";

    for (const taxonomy of this.taxonomies.values()) {
      code += this.generateTaxonomyCode(taxonomy);
    }

    code += "}\n";
    code += "add_action('init', 'register_custom_taxonomies');\n";

    return code;
  }

  /**
   * Generate code for single post type
   */
  private generatePostTypeCode(postType: CustomPostType): string {
    return `
  // Register ${postType.singularName}
  register_post_type('${postType.slug}', array(
    'labels' => array(
      'name' => '${postType.pluralName}',
      'singular_name' => '${postType.singularName}',
    ),
    'public' => ${postType.public ? 'true' : 'false'},
    'has_archive' => ${postType.hasArchive ? 'true' : 'false'},
    'show_in_rest' => ${postType.showInRest ? 'true' : 'false'},
    'supports' => array(${postType.supports.map(s => `'${s}'`).join(', ')}),
    'menu_icon' => '${postType.icon}',
    'menu_position' => ${postType.menuPosition},
    'rewrite' => array('slug' => '${postType.rewrite.slug}'),
  ));
`;
  }

  /**
   * Generate code for single taxonomy
   */
  private generateTaxonomyCode(taxonomy: Taxonomy): string {
    return `
  // Register ${taxonomy.singularName}
  register_taxonomy('${taxonomy.slug}', array(${taxonomy.postTypes.map(pt => `'${pt}'`).join(', ')}), array(
    'labels' => array(
      'name' => '${taxonomy.pluralName}',
      'singular_name' => '${taxonomy.singularName}',
    ),
    'hierarchical' => ${taxonomy.hierarchical ? 'true' : 'false'},
    'show_in_rest' => ${taxonomy.showInRest ? 'true' : 'false'},
    'rewrite' => array('slug' => '${taxonomy.rewrite.slug}'),
  ));
`;
  }
}

export interface PageContentData {
  id: string;
  url: string;
  title?: string;
  bodyClasses?: string[];
  components?: Array<{
    componentType: string;
    tagName?: string;
    className?: string;
    textContent?: string;
    attributes?: Record<string, string>;
  }>;
}

/**
 * Helper function for quick mapping
 */
export function mapCustomPostTypes(pageData: PageContentData[]): CustomPostTypeMapping {
  const mapper = new CustomPostTypeMapper();
  return mapper.map(pageData);
}
