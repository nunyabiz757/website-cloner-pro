/**
 * Reusable Component Library Generation
 *
 * Identifies and extracts reusable components across pages:
 * - Pattern detection and clustering
 * - Component categorization
 * - Template generation
 * - Elementor template library export
 */

import type { ComponentInfo, ElementorWidget } from '../types/builder.types.js';

export interface ComponentLibrary {
  categories: ComponentCategory[];
  templates: ComponentTemplate[];
  patterns: ComponentPattern[];
  statistics: LibraryStatistics;
  elementorTemplates: ElementorTemplate[];
}

export interface ComponentCategory {
  id: string;
  name: string;
  description: string;
  components: ComponentTemplate[];
  count: number;
}

export interface ComponentTemplate {
  id: string;
  name: string;
  category: string;
  componentType: string;
  html: string;
  styles: Record<string, any>;
  thumbnail?: string;
  usage: number; // How many times it appears
  variations: TemplateVariation[];
  tags: string[];
  reusabilityScore: number; // 0-100
}

export interface TemplateVariation {
  id: string;
  name: string;
  html: string;
  styles: Record<string, any>;
  differences: string[]; // What's different from base
}

export interface ComponentPattern {
  pattern: string;
  signature: string; // Unique identifier
  occurrences: number;
  pageIds: string[];
  examples: ComponentInfo[];
  reusable: boolean;
}

export interface LibraryStatistics {
  totalComponents: number;
  uniquePatterns: number;
  reusableComponents: number;
  reusabilityRate: number; // Percentage
  topPatterns: Array<{ pattern: string; count: number }>;
  categoryCounts: Record<string, number>;
}

export interface ElementorTemplate {
  template_id: string;
  title: string;
  type: 'section' | 'page' | 'widget';
  content: any;
  thumbnail?: string;
  tags: string[];
}

export class ComponentLibraryGenerator {
  private patterns: Map<string, ComponentPattern> = new Map();
  private templates: Map<string, ComponentTemplate> = new Map();
  private categories: Map<string, ComponentCategory> = new Map();

  constructor() {
    this.initializeCategories();
  }

  /**
   * Generate component library from page components
   */
  generate(pageComponents: Map<string, ComponentInfo[]>): ComponentLibrary {
    // Detect patterns
    this.detectPatterns(pageComponents);

    // Cluster similar components
    this.clusterComponents();

    // Generate templates
    this.generateTemplates();

    // Categorize components
    this.categorizeComponents();

    // Calculate statistics
    const statistics = this.calculateStatistics();

    // Export to Elementor templates
    const elementorTemplates = this.generateElementorTemplates();

    return {
      categories: Array.from(this.categories.values()),
      templates: Array.from(this.templates.values()),
      patterns: Array.from(this.patterns.values()),
      statistics,
      elementorTemplates,
    };
  }

  /**
   * Initialize component categories
   */
  private initializeCategories(): void {
    const categoryDefinitions = [
      { id: 'headers', name: 'Headers', description: 'Navigation bars and page headers' },
      { id: 'heroes', name: 'Hero Sections', description: 'Large banner sections with CTAs' },
      { id: 'cards', name: 'Cards', description: 'Card components and layouts' },
      { id: 'forms', name: 'Forms', description: 'Input forms and contact sections' },
      { id: 'ctas', name: 'Call to Actions', description: 'CTA buttons and sections' },
      { id: 'galleries', name: 'Galleries', description: 'Image galleries and grids' },
      { id: 'testimonials', name: 'Testimonials', description: 'Customer reviews and quotes' },
      { id: 'pricing', name: 'Pricing Tables', description: 'Pricing plans and tables' },
      { id: 'footers', name: 'Footers', description: 'Page footers and site info' },
      { id: 'content', name: 'Content Blocks', description: 'Text and media content blocks' },
      { id: 'navigation', name: 'Navigation', description: 'Menus and navigation elements' },
      { id: 'misc', name: 'Miscellaneous', description: 'Other reusable components' },
    ];

    for (const def of categoryDefinitions) {
      this.categories.set(def.id, {
        ...def,
        components: [],
        count: 0,
      });
    }
  }

  /**
   * Detect component patterns across pages
   */
  private detectPatterns(pageComponents: Map<string, ComponentInfo[]>): void {
    for (const [pageId, components] of pageComponents) {
      for (const component of components) {
        const signature = this.generateSignature(component);

        if (!this.patterns.has(signature)) {
          this.patterns.set(signature, {
            pattern: this.describePattern(component),
            signature,
            occurrences: 0,
            pageIds: [],
            examples: [],
            reusable: false,
          });
        }

        const pattern = this.patterns.get(signature)!;
        pattern.occurrences++;

        if (!pattern.pageIds.includes(pageId)) {
          pattern.pageIds.push(pageId);
        }

        if (pattern.examples.length < 3) {
          pattern.examples.push(component);
        }
      }
    }

    // Mark patterns as reusable if they appear multiple times
    for (const pattern of this.patterns.values()) {
      pattern.reusable = pattern.occurrences >= 3 || pattern.pageIds.length >= 2;
    }
  }

  /**
   * Generate a signature for a component
   */
  private generateSignature(component: ComponentInfo): string {
    const parts = [
      component.componentType,
      component.tagName || '',
      component.className || '',
      this.getStructureSignature(component),
    ];

    return parts.join('::');
  }

  /**
   * Get structure signature (child count and types)
   */
  private getStructureSignature(component: ComponentInfo): string {
    if (!component.children || component.children.length === 0) {
      return 'leaf';
    }

    const childTypes = component.children
      .map(c => c.componentType)
      .sort()
      .join(',');

    return `children[${childTypes}]`;
  }

  /**
   * Describe pattern in human-readable format
   */
  private describePattern(component: ComponentInfo): string {
    const type = component.componentType;
    const children = component.children?.length || 0;

    if (children === 0) {
      return `Simple ${type}`;
    }

    const childTypes = component.children?.map(c => c.componentType) || [];
    return `${type} with ${childTypes.join(', ')}`;
  }

  /**
   * Cluster similar components
   */
  private clusterComponents(): void {
    // Group patterns by similarity
    const clusters = new Map<string, ComponentPattern[]>();

    for (const pattern of this.patterns.values()) {
      if (!pattern.reusable) continue;

      const clusterKey = this.getClusterKey(pattern);

      if (!clusters.has(clusterKey)) {
        clusters.set(clusterKey, []);
      }

      clusters.get(clusterKey)!.push(pattern);
    }

    // Merge similar patterns in each cluster
    for (const [key, patterns] of clusters) {
      if (patterns.length > 1) {
        this.mergePatterns(patterns);
      }
    }
  }

  /**
   * Get cluster key for grouping similar patterns
   */
  private getClusterKey(pattern: ComponentPattern): string {
    const parts = pattern.signature.split('::');
    return parts.slice(0, 2).join('::'); // Group by type and tag
  }

  /**
   * Merge similar patterns
   */
  private mergePatterns(patterns: ComponentPattern[]): void {
    // For now, keep them separate but mark as variations
    // In a more advanced implementation, we would create a base pattern
    // with variations
  }

  /**
   * Generate component templates
   */
  private generateTemplates(): void {
    for (const pattern of this.patterns.values()) {
      if (!pattern.reusable || pattern.examples.length === 0) continue;

      const baseExample = pattern.examples[0];
      const templateId = this.generateTemplateId(pattern);

      const template: ComponentTemplate = {
        id: templateId,
        name: this.generateTemplateName(pattern),
        category: this.inferCategory(baseExample),
        componentType: baseExample.componentType,
        html: baseExample.innerHTML || '',
        styles: baseExample.styles || {},
        usage: pattern.occurrences,
        variations: this.extractVariations(pattern),
        tags: this.generateTags(baseExample),
        reusabilityScore: this.calculateReusabilityScore(pattern),
      };

      this.templates.set(templateId, template);
    }
  }

  /**
   * Generate template ID
   */
  private generateTemplateId(pattern: ComponentPattern): string {
    return `template_${pattern.signature.replace(/::/g, '_').toLowerCase()}`;
  }

  /**
   * Generate template name
   */
  private generateTemplateName(pattern: ComponentPattern): string {
    const type = pattern.signature.split('::')[0];
    return `${type.charAt(0).toUpperCase() + type.slice(1)} Template`;
  }

  /**
   * Infer category from component
   */
  private inferCategory(component: ComponentInfo): string {
    const type = component.componentType.toLowerCase();
    const classes = (component.className || '').toLowerCase();
    const tag = (component.tagName || '').toLowerCase();

    if (tag === 'nav' || classes.includes('nav') || type === 'navigation') return 'navigation';
    if (tag === 'header' || classes.includes('header')) return 'headers';
    if (tag === 'footer' || classes.includes('footer')) return 'footers';
    if (classes.includes('hero')) return 'heroes';
    if (type === 'card' || classes.includes('card')) return 'cards';
    if (type === 'form' || tag === 'form') return 'forms';
    if (type === 'button' || classes.includes('cta')) return 'ctas';
    if (type === 'gallery' || classes.includes('gallery')) return 'galleries';
    if (classes.includes('testimonial') || classes.includes('review')) return 'testimonials';
    if (classes.includes('pricing')) return 'pricing';

    return 'misc';
  }

  /**
   * Extract variations of a pattern
   */
  private extractVariations(pattern: ComponentPattern): TemplateVariation[] {
    const variations: TemplateVariation[] = [];

    for (let i = 1; i < pattern.examples.length; i++) {
      const example = pattern.examples[i];
      const differences = this.findDifferences(pattern.examples[0], example);

      variations.push({
        id: `variation_${i}`,
        name: `Variation ${i}`,
        html: example.innerHTML || '',
        styles: example.styles || {},
        differences,
      });
    }

    return variations;
  }

  /**
   * Find differences between two components
   */
  private findDifferences(base: ComponentInfo, variant: ComponentInfo): string[] {
    const differences: string[] = [];

    // Compare styles
    const baseStyles = base.styles || {};
    const variantStyles = variant.styles || {};

    for (const key of Object.keys(variantStyles)) {
      if (baseStyles[key] !== variantStyles[key]) {
        differences.push(`Different ${key}: ${variantStyles[key]}`);
      }
    }

    // Compare class names
    if (base.className !== variant.className) {
      differences.push(`Different classes: ${variant.className}`);
    }

    // Compare child count
    const baseChildren = base.children?.length || 0;
    const variantChildren = variant.children?.length || 0;

    if (baseChildren !== variantChildren) {
      differences.push(`Different child count: ${variantChildren} vs ${baseChildren}`);
    }

    return differences;
  }

  /**
   * Generate tags for component
   */
  private generateTags(component: ComponentInfo): string[] {
    const tags: string[] = [];

    tags.push(component.componentType);

    if (component.tagName) {
      tags.push(component.tagName);
    }

    if (component.className) {
      const classes = component.className.split(' ');
      tags.push(...classes.slice(0, 3)); // Add first 3 classes
    }

    // Add contextual tags
    if (component.context.responsive) tags.push('responsive');
    if (component.context.insideForm) tags.push('form');
    if (component.context.isInteractive) tags.push('interactive');

    return [...new Set(tags)]; // Remove duplicates
  }

  /**
   * Calculate reusability score
   */
  private calculateReusabilityScore(pattern: ComponentPattern): number {
    let score = 0;

    // Higher score for more occurrences
    score += Math.min(pattern.occurrences * 10, 40);

    // Higher score for appearing on multiple pages
    score += Math.min(pattern.pageIds.length * 15, 30);

    // Bonus for consistent structure
    if (pattern.examples.every(e => e.children?.length === pattern.examples[0].children?.length)) {
      score += 20;
    }

    // Bonus for having clear purpose (based on classes/type)
    const example = pattern.examples[0];
    if (example.className || example.id) {
      score += 10;
    }

    return Math.min(score, 100);
  }

  /**
   * Categorize components into categories
   */
  private categorizeComponents(): void {
    for (const template of this.templates.values()) {
      const category = this.categories.get(template.category);
      if (category) {
        category.components.push(template);
        category.count++;
      }
    }
  }

  /**
   * Calculate library statistics
   */
  private calculateStatistics(): LibraryStatistics {
    const totalComponents = Array.from(this.patterns.values())
      .reduce((sum, p) => sum + p.occurrences, 0);

    const uniquePatterns = this.patterns.size;

    const reusableComponents = Array.from(this.patterns.values())
      .filter(p => p.reusable).length;

    const reusabilityRate = (reusableComponents / uniquePatterns) * 100;

    const topPatterns = Array.from(this.patterns.values())
      .sort((a, b) => b.occurrences - a.occurrences)
      .slice(0, 10)
      .map(p => ({ pattern: p.pattern, count: p.occurrences }));

    const categoryCounts: Record<string, number> = {};
    for (const category of this.categories.values()) {
      categoryCounts[category.name] = category.count;
    }

    return {
      totalComponents,
      uniquePatterns,
      reusableComponents,
      reusabilityRate,
      topPatterns,
      categoryCounts,
    };
  }

  /**
   * Generate Elementor templates
   */
  private generateElementorTemplates(): ElementorTemplate[] {
    const elementorTemplates: ElementorTemplate[] = [];

    for (const template of this.templates.values()) {
      if (template.reusabilityScore < 50) continue; // Only export high-quality templates

      elementorTemplates.push({
        template_id: template.id,
        title: template.name,
        type: this.getElementorTemplateType(template.category),
        content: this.convertToElementorContent(template),
        tags: template.tags,
      });
    }

    return elementorTemplates;
  }

  /**
   * Get Elementor template type
   */
  private getElementorTemplateType(category: string): 'section' | 'page' | 'widget' {
    if (category === 'headers' || category === 'footers' || category === 'heroes') {
      return 'section';
    }
    if (category === 'navigation' || category === 'misc') {
      return 'widget';
    }
    return 'section';
  }

  /**
   * Convert template to Elementor content format
   */
  private convertToElementorContent(template: ComponentTemplate): any {
    return {
      id: template.id,
      elType: 'widget',
      widgetType: this.mapComponentTypeToWidget(template.componentType),
      settings: {
        ...template.styles,
        _element_id: template.id,
      },
    };
  }

  /**
   * Map component type to Elementor widget type
   */
  private mapComponentTypeToWidget(componentType: string): string {
    const mapping: Record<string, string> = {
      heading: 'heading',
      paragraph: 'text-editor',
      button: 'button',
      image: 'image',
      form: 'form',
      card: 'icon-box',
      gallery: 'gallery',
      testimonial: 'testimonial',
    };

    return mapping[componentType] || 'text-editor';
  }
}

/**
 * Helper function for quick generation
 */
export function generateComponentLibrary(
  pageComponents: Map<string, ComponentInfo[]>
): ComponentLibrary {
  const generator = new ComponentLibraryGenerator();
  return generator.generate(pageComponents);
}
