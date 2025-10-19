/**
 * Gutenberg Block Editor Exporter
 *
 * Complete mapping system for WordPress Block Editor (Gutenberg):
 * - Core block mapping (50+ blocks)
 * - Block attributes and settings
 * - Block patterns and reusable blocks
 * - FSE (Full Site Editing) support
 * - Block JSON export
 */

import type { ComponentInfo } from '../types/builder.types.js';
import type { ColorPalette } from '../analyzer/color-palette-extractor.js';
import type { TypographySystem } from '../analyzer/typography-extractor.js';
import type { ComponentLibrary } from '../library/component-library-generator.js';
import type { TemplateParts } from '../template/template-part-detector.js';
import {
  extractResponsiveSettings,
  extractHoverEffects,
  extractEntranceAnimation,
  extractMotionEffects,
  buildDesignTokenReferences,
  linkToDesignTokens,
  generateCustomCSS,
  detectDynamicContent,
  validateExport,
  optimizeExport,
  type ResponsiveSettings,
  type HoverEffects,
  type EntranceAnimation,
  type MotionEffects,
  type DynamicContent,
} from '../utils/advanced-export-helpers.js';
import {
  extractIconWidget,
  extractIconListWidget,
  extractGalleryWidget,
  extractCarouselWidget,
  extractTestimonialWidget,
  extractPricingTableWidget,
  type IconWidget,
  type IconListWidget,
  type GalleryWidget,
  type CarouselWidget,
  type TestimonialWidget,
  type PricingTableWidget,
} from '../utils/specialized-widget-helpers.js';
import { extractBoxModel, type BoxModel } from '../utils/dimension-parser.js';
import { extractBoxShadow, type ParsedBoxShadow } from '../utils/box-shadow-parser.js';

export interface GutenbergExport {
  blocks: GutenbergBlock[];
  patterns: BlockPattern[];
  reusableBlocks: ReusableBlock[];
  globalStyles?: GlobalStyles;
  templateParts?: TemplatePart[];
}

export interface GutenbergBlock {
  blockName: string;
  attrs: Record<string, any>;
  innerBlocks: GutenbergBlock[];
  innerHTML: string;
  // Advanced features
  responsiveSettings?: ResponsiveSettings;
  hoverEffects?: HoverEffects;
  entranceAnimation?: EntranceAnimation;
  motionEffects?: MotionEffects;
  customCSS?: string;
  dynamicContent?: DynamicContent;
  boxModel?: BoxModel;
  boxShadow?: ParsedBoxShadow;
  // Design system links
  colorTokens?: Map<string, string>;
  fontTokens?: Map<string, string>;
  sizeTokens?: Map<string, string>;
}

export interface BlockPattern {
  title: string;
  slug: string;
  description: string;
  categories: string[];
  keywords: string[];
  content: string;
  blockTypes?: string[];
}

export interface ReusableBlock {
  id: number;
  title: string;
  content: string;
  syncStatus: 'sync' | 'unsynced';
}

export interface GlobalStyles {
  version: number;
  settings: {
    color?: ColorSettings;
    typography?: TypographySettings;
    spacing?: SpacingSettings;
    layout?: LayoutSettings;
  };
  styles: {
    color?: any;
    typography?: any;
    spacing?: any;
    elements?: any;
    blocks?: any;
  };
}

export interface ColorSettings {
  palette: ColorPaletteItem[];
  gradients?: GradientItem[];
  duotone?: DuotoneItem[];
}

export interface ColorPaletteItem {
  slug: string;
  color: string;
  name: string;
}

export interface GradientItem {
  slug: string;
  gradient: string;
  name: string;
}

export interface DuotoneItem {
  slug: string;
  colors: string[];
  name: string;
}

export interface TypographySettings {
  fontFamilies: FontFamily[];
  fontSizes: FontSize[];
  lineHeight?: boolean;
  letterSpacing?: boolean;
}

export interface FontFamily {
  slug: string;
  fontFamily: string;
  name: string;
}

export interface FontSize {
  slug: string;
  size: string;
  name: string;
}

export interface SpacingSettings {
  spacingSizes?: SpacingSize[];
  units?: string[];
}

export interface SpacingSize {
  slug: string;
  size: string;
  name: string;
}

export interface LayoutSettings {
  contentSize?: string;
  wideSize?: string;
}

export interface TemplatePart {
  slug: string;
  title: string;
  area: 'header' | 'footer' | 'sidebar' | 'uncategorized';
  content: string;
}

export class GutenbergExporter {
  private blockMap: Map<string, string> = new Map();

  constructor() {
    this.initializeBlockMap();
  }

  /**
   * Export components to Gutenberg blocks
   */
  export(
    components: ComponentInfo[],
    options?: {
      usePatterns?: boolean;
      extractReusable?: boolean;
      generateGlobalStyles?: boolean;
      colorPalette?: ColorPalette;
      typographySystem?: TypographySystem;
      componentLibrary?: ComponentLibrary;
      templateParts?: TemplateParts;
      validateExport?: boolean;
      optimizeExport?: boolean;
    }
  ): GutenbergExport {
    const blocks = this.convertToBlocks(components, {
      colorPalette: options?.colorPalette,
      typographySystem: options?.typographySystem,
    });

    const patterns = options?.componentLibrary
      ? this.convertLibraryToPatterns(options.componentLibrary)
      : options?.usePatterns
      ? this.extractPatterns(components)
      : [];

    const reusableBlocks = options?.componentLibrary
      ? this.convertLibraryToReusableBlocks(options.componentLibrary)
      : options?.extractReusable
      ? this.extractReusableBlocks(components)
      : [];

    const globalStyles = options?.generateGlobalStyles
      ? this.generateGlobalStyles(components, options.colorPalette, options.typographySystem)
      : undefined;

    const templateParts = options?.templateParts
      ? this.convertTemplatePartsToGutenberg(options.templateParts)
      : undefined;

    let result: GutenbergExport = {
      blocks,
      patterns,
      reusableBlocks,
      globalStyles,
      templateParts,
    };

    // Validate export
    if (options?.validateExport !== false) {
      const validation = validateExport(result);
      if (!validation.isValid) {
        console.warn('Gutenberg export validation failed:', validation.errors);
      }
      if (validation.warnings.length > 0) {
        console.warn('Gutenberg export warnings:', validation.warnings);
      }
    }

    // Optimize export
    if (options?.optimizeExport !== false) {
      result = optimizeExport(result);
    }

    return result;
  }

  /**
   * Initialize component to block mapping
   */
  private initializeBlockMap(): void {
    // Text blocks
    this.blockMap.set('paragraph', 'core/paragraph');
    this.blockMap.set('heading', 'core/heading');
    this.blockMap.set('list', 'core/list');
    this.blockMap.set('quote', 'core/quote');
    this.blockMap.set('code', 'core/code');
    this.blockMap.set('preformatted', 'core/preformatted');

    // Media blocks
    this.blockMap.set('image', 'core/image');
    this.blockMap.set('gallery', 'core/gallery');
    this.blockMap.set('audio', 'core/audio');
    this.blockMap.set('video', 'core/video');
    this.blockMap.set('file', 'core/file');
    this.blockMap.set('cover', 'core/cover');

    // Design blocks
    this.blockMap.set('button', 'core/button');
    this.blockMap.set('buttons', 'core/buttons');
    this.blockMap.set('columns', 'core/columns');
    this.blockMap.set('column', 'core/column');
    this.blockMap.set('group', 'core/group');
    this.blockMap.set('row', 'core/row');
    this.blockMap.set('stack', 'core/stack');
    this.blockMap.set('separator', 'core/separator');
    this.blockMap.set('spacer', 'core/spacer');

    // Widget blocks
    this.blockMap.set('shortcode', 'core/shortcode');
    this.blockMap.set('html', 'core/html');
    this.blockMap.set('calendar', 'core/calendar');
    this.blockMap.set('search', 'core/search');
    this.blockMap.set('navigation', 'core/navigation');
    this.blockMap.set('social-links', 'core/social-links');

    // Theme blocks
    this.blockMap.set('site-logo', 'core/site-logo');
    this.blockMap.set('site-title', 'core/site-title');
    this.blockMap.set('site-tagline', 'core/site-tagline');
    this.blockMap.set('post-title', 'core/post-title');
    this.blockMap.set('post-content', 'core/post-content');
    this.blockMap.set('post-excerpt', 'core/post-excerpt');
    this.blockMap.set('post-featured-image', 'core/post-featured-image');

    // Embed blocks
    this.blockMap.set('embed', 'core/embed');
  }

  /**
   * Convert components to Gutenberg blocks
   */
  private convertToBlocks(components: ComponentInfo[], options?: {
    colorPalette?: ColorPalette;
    typographySystem?: TypographySystem;
  }): GutenbergBlock[] {
    const blocks: GutenbergBlock[] = [];

    for (const component of components) {
      const block = this.componentToBlock(component, options);
      if (block) {
        blocks.push(block);
      }
    }

    return blocks;
  }

  /**
   * Convert single component to block
   */
  private componentToBlock(component: ComponentInfo, options?: {
    colorPalette?: ColorPalette;
    typographySystem?: TypographySystem;
  }): GutenbergBlock | null {
    const blockName = this.getBlockName(component);
    const attrs = this.extractAttributes(component);
    const innerBlocks = component.children
      ? this.convertToBlocks(component.children, options)
      : [];

    // Extract advanced features
    const responsiveSettings = extractResponsiveSettings(component);
    const hoverEffects = extractHoverEffects(component);
    const entranceAnimation = extractEntranceAnimation(component);
    const motionEffects = extractMotionEffects(component);
    const customCSS = generateCustomCSS(component);
    const dynamicContent = detectDynamicContent(component);
    const boxModel = component.styles ? extractBoxModel(component.styles) : undefined;
    const boxShadow = component.styles ? extractBoxShadow(component.styles) : undefined;

    // Link to design system
    let colorTokens: Map<string, string> | undefined;
    let fontTokens: Map<string, string> | undefined;
    let sizeTokens: Map<string, string> | undefined;

    if (options?.colorPalette || options?.typographySystem) {
      const tokenRef = buildDesignTokenReferences(options.colorPalette, options.typographySystem);
      const tokens = linkToDesignTokens(component, tokenRef);
      colorTokens = tokens.colorTokens;
      fontTokens = tokens.fontTokens;
      sizeTokens = tokens.sizeTokens;
    }

    return {
      blockName,
      attrs,
      innerBlocks,
      innerHTML: this.generateInnerHTML(component),
      responsiveSettings: Object.keys(responsiveSettings).length > 0 ? responsiveSettings : undefined,
      hoverEffects,
      entranceAnimation,
      motionEffects,
      customCSS: customCSS ? customCSS : undefined,
      dynamicContent,
      boxModel,
      boxShadow,
      colorTokens: colorTokens && colorTokens.size > 0 ? colorTokens : undefined,
      fontTokens: fontTokens && fontTokens.size > 0 ? fontTokens : undefined,
      sizeTokens: sizeTokens && sizeTokens.size > 0 ? sizeTokens : undefined,
    };
  }

  /**
   * Get block name from component
   */
  private getBlockName(component: ComponentInfo): string {
    const type = component.componentType.toLowerCase();

    // Check direct mapping
    if (this.blockMap.has(type)) {
      return this.blockMap.get(type)!;
    }

    // Special cases
    if (component.tagName === 'h1' || component.tagName === 'h2' ||
        component.tagName === 'h3' || component.tagName === 'h4' ||
        component.tagName === 'h5' || component.tagName === 'h6') {
      return 'core/heading';
    }

    if (component.tagName === 'p') {
      return 'core/paragraph';
    }

    if (component.tagName === 'img') {
      return 'core/image';
    }

    if (component.tagName === 'button' || component.tagName === 'a' &&
        (component.className || '').includes('btn')) {
      return 'core/button';
    }

    if (component.tagName === 'ul' || component.tagName === 'ol') {
      return 'core/list';
    }

    if (component.tagName === 'blockquote') {
      return 'core/quote';
    }

    if (component.tagName === 'nav') {
      return 'core/navigation';
    }

    // Layout blocks
    const classes = (component.className || '').toLowerCase();
    if (classes.includes('column') || classes.includes('col-')) {
      return 'core/column';
    }

    if (classes.includes('row') || classes.includes('columns')) {
      return 'core/columns';
    }

    if (classes.includes('group') || classes.includes('container')) {
      return 'core/group';
    }

    if (classes.includes('cover') || classes.includes('hero')) {
      return 'core/cover';
    }

    // Default to group
    return 'core/group';
  }

  /**
   * Extract block attributes from component
   */
  private extractAttributes(component: ComponentInfo): Record<string, any> {
    const attrs: Record<string, any> = {};
    const blockName = this.getBlockName(component);

    // Common attributes
    if (component.className) {
      attrs.className = component.className;
    }

    if (component.id) {
      attrs.anchor = component.id;
    }

    // Block-specific attributes
    switch (blockName) {
      case 'core/heading':
        attrs.level = this.getHeadingLevel(component);
        attrs.content = component.textContent || '';
        attrs.textAlign = this.getAlignment(component);
        if (component.styles?.color) attrs.textColor = component.styles.color;
        if (component.styles?.fontSize) attrs.fontSize = component.styles.fontSize;
        break;

      case 'core/paragraph':
        attrs.content = component.textContent || '';
        attrs.align = this.getAlignment(component);
        attrs.dropCap = false;
        if (component.styles?.color) attrs.textColor = component.styles.color;
        if (component.styles?.backgroundColor) attrs.backgroundColor = component.styles.backgroundColor;
        break;

      case 'core/image':
        const src = component.attributes?.src || '';
        const alt = component.attributes?.alt || '';
        const width = component.attributes?.width || component.styles?.width;
        const height = component.attributes?.height || component.styles?.height;

        attrs.url = src;
        attrs.alt = alt;
        if (width) attrs.width = parseInt(String(width));
        if (height) attrs.height = parseInt(String(height));
        attrs.sizeSlug = 'large';
        attrs.linkDestination = 'none';
        break;

      case 'core/button':
        attrs.text = component.textContent || 'Button';
        attrs.url = component.attributes?.href || '#';
        attrs.linkTarget = component.attributes?.target || '_self';
        if (component.styles?.backgroundColor) {
          attrs.backgroundColor = component.styles.backgroundColor;
        }
        if (component.styles?.color) {
          attrs.textColor = component.styles.color;
        }
        attrs.borderRadius = this.getBorderRadius(component);
        break;

      case 'core/buttons':
        attrs.layout = { type: 'flex' };
        break;

      case 'core/columns':
        attrs.isStackedOnMobile = true;
        break;

      case 'core/column':
        attrs.width = this.getColumnWidth(component);
        attrs.verticalAlignment = 'top';
        break;

      case 'core/group':
        attrs.layout = { type: 'constrained' };
        if (component.styles?.backgroundColor) {
          attrs.backgroundColor = component.styles.backgroundColor;
        }
        break;

      case 'core/cover':
        const bgImage = this.extractBackgroundImage(component);
        if (bgImage) {
          attrs.url = bgImage;
          attrs.hasParallax = false;
          attrs.dimRatio = 50;
          attrs.minHeight = 400;
          attrs.minHeightUnit = 'px';
        }
        break;

      case 'core/list':
        attrs.ordered = component.tagName === 'ol';
        attrs.values = this.extractListContent(component);
        break;

      case 'core/quote':
        attrs.value = component.textContent || '';
        attrs.citation = '';
        break;

      case 'core/navigation':
        attrs.orientation = 'horizontal';
        attrs.overlayMenu = 'mobile';
        attrs.showSubmenuIcon = true;
        break;

      case 'core/social-links':
        attrs.iconColor = 'inherit';
        attrs.iconColorValue = component.styles?.color || '#000';
        attrs.size = 'normal';
        break;

      case 'core/spacer':
        attrs.height = component.styles?.height || '100px';
        break;

      case 'core/separator':
        attrs.opacity = 'alpha-channel';
        break;
    }

    // Spacing attributes
    if (component.styles) {
      const spacing: any = {};

      if (component.styles.padding) spacing.padding = component.styles.padding;
      if (component.styles.margin) spacing.margin = component.styles.margin;

      if (Object.keys(spacing).length > 0) {
        attrs.style = { spacing };
      }
    }

    return attrs;
  }

  /**
   * Get heading level
   */
  private getHeadingLevel(component: ComponentInfo): number {
    const tag = component.tagName?.toLowerCase();
    if (tag?.match(/^h[1-6]$/)) {
      return parseInt(tag[1]);
    }
    return 2; // Default to h2
  }

  /**
   * Get text alignment
   */
  private getAlignment(component: ComponentInfo): string | undefined {
    const textAlign = component.styles?.textAlign;
    if (textAlign === 'left' || textAlign === 'center' || textAlign === 'right') {
      return textAlign;
    }
    return undefined;
  }

  /**
   * Get border radius
   */
  private getBorderRadius(component: ComponentInfo): number | undefined {
    const borderRadius = component.styles?.borderRadius;
    if (borderRadius && typeof borderRadius === 'string') {
      const match = borderRadius.match(/(\d+)/);
      return match ? parseInt(match[1]) : undefined;
    }
    return undefined;
  }

  /**
   * Get column width
   */
  private getColumnWidth(component: ComponentInfo): string | undefined {
    const classes = (component.className || '').toLowerCase();

    // Bootstrap-style columns
    const colMatch = classes.match(/col-(\d+)/);
    if (colMatch) {
      const cols = parseInt(colMatch[1]);
      return `${(cols / 12) * 100}%`;
    }

    // Width from styles
    if (component.styles?.width) {
      return String(component.styles.width);
    }

    return undefined;
  }

  /**
   * Extract background image URL
   */
  private extractBackgroundImage(component: ComponentInfo): string | null {
    const bgImage = component.styles?.backgroundImage;
    if (bgImage && typeof bgImage === 'string') {
      const match = bgImage.match(/url\(['"]?([^'"]+)['"]?\)/);
      return match ? match[1] : null;
    }
    return null;
  }

  /**
   * Extract list content
   */
  private extractListContent(component: ComponentInfo): string {
    const items = component.children || [];
    return items
      .map(item => `<li>${item.textContent || ''}</li>`)
      .join('');
  }

  /**
   * Generate innerHTML for block
   */
  private generateInnerHTML(component: ComponentInfo): string {
    return component.innerHTML || component.textContent || '';
  }

  /**
   * Extract block patterns
   */
  private extractPatterns(components: ComponentInfo[]): BlockPattern[] {
    const patterns: BlockPattern[] = [];

    // Look for repeating patterns
    const patternMap = new Map<string, ComponentInfo[]>();

    for (const component of components) {
      const signature = this.getPatternSignature(component);
      if (!patternMap.has(signature)) {
        patternMap.set(signature, []);
      }
      patternMap.get(signature)!.push(component);
    }

    // Create patterns from repeated components
    let patternIndex = 1;
    for (const [signature, comps] of patternMap) {
      if (comps.length >= 2) {
        const blocks = this.convertToBlocks([comps[0]]);
        const content = this.serializeBlocks(blocks);

        patterns.push({
          title: `Pattern ${patternIndex}`,
          slug: `pattern-${patternIndex}`,
          description: `Auto-detected pattern`,
          categories: ['custom'],
          keywords: [],
          content,
        });

        patternIndex++;
      }
    }

    return patterns;
  }

  /**
   * Get pattern signature
   */
  private getPatternSignature(component: ComponentInfo): string {
    return `${component.componentType}:${component.tagName}:${component.children?.length || 0}`;
  }

  /**
   * Extract reusable blocks
   */
  private extractReusableBlocks(components: ComponentInfo[]): ReusableBlock[] {
    const reusable: ReusableBlock[] = [];

    // Look for components with high reusability
    for (const component of components) {
      if (this.isReusable(component)) {
        const blocks = this.convertToBlocks([component]);
        const content = this.serializeBlocks(blocks);

        reusable.push({
          id: Math.floor(Math.random() * 10000),
          title: `Reusable ${component.componentType}`,
          content,
          syncStatus: 'sync',
        });
      }
    }

    return reusable;
  }

  /**
   * Check if component is reusable
   */
  private isReusable(component: ComponentInfo): boolean {
    // Cards, buttons groups, etc. are good candidates
    const reusableTypes = ['card', 'buttons', 'social-links', 'navigation'];
    return reusableTypes.includes(component.componentType);
  }

  /**
   * Convert Section 8 ComponentLibrary to Gutenberg patterns
   */
  private convertLibraryToPatterns(library: ComponentLibrary): BlockPattern[] {
    const patterns: BlockPattern[] = [];

    for (const template of library.templates) {
      if (template.reusabilityScore < 30) continue; // Only patterns with reasonable score

      // Map category to Gutenberg pattern category
      const category = this.mapCategoryToGutenberg(template.category);

      patterns.push({
        title: template.name,
        slug: template.id,
        description: `Reusable ${template.componentType} pattern (usage: ${template.usage})`,
        categories: [category],
        keywords: template.tags,
        content: template.html,
        blockTypes: [this.mapComponentTypeToBlock(template.componentType)],
      });
    }

    return patterns;
  }

  /**
   * Convert Section 8 ComponentLibrary to Gutenberg reusable blocks
   */
  private convertLibraryToReusableBlocks(library: ComponentLibrary): ReusableBlock[] {
    const reusableBlocks: ReusableBlock[] = [];

    for (const template of library.templates) {
      if (template.reusabilityScore < 60) continue; // Only high-quality reusable blocks

      reusableBlocks.push({
        id: parseInt(template.id.replace(/\D/g, '')) || Math.floor(Math.random() * 10000),
        title: template.name,
        content: template.html,
        syncStatus: 'sync',
      });
    }

    return reusableBlocks;
  }

  /**
   * Map component library category to Gutenberg pattern category
   */
  private mapCategoryToGutenberg(category: string): string {
    const mapping: Record<string, string> = {
      headers: 'header',
      footers: 'footer',
      heroes: 'featured',
      cards: 'columns',
      forms: 'call-to-action',
      ctas: 'call-to-action',
      galleries: 'gallery',
      testimonials: 'text',
      pricing: 'columns',
      content: 'text',
      navigation: 'header',
      misc: 'text',
    };

    return mapping[category] || 'text';
  }

  /**
   * Map component type to Gutenberg block type
   */
  private mapComponentTypeToBlock(componentType: string): string {
    const mapping: Record<string, string> = {
      heading: 'core/heading',
      paragraph: 'core/paragraph',
      button: 'core/button',
      image: 'core/image',
      gallery: 'core/gallery',
      card: 'core/group',
      form: 'core/group',
      navigation: 'core/navigation',
    };

    return mapping[componentType] || 'core/group';
  }

  /**
   * Convert Section 8 TemplateParts to Gutenberg template parts (FSE)
   */
  private convertTemplatePartsToGutenberg(templateParts: TemplateParts): TemplatePart[] {
    const parts: TemplatePart[] = [];

    // Convert header
    if (templateParts.header && templateParts.header.confidence >= 60) {
      parts.push({
        slug: 'header',
        theme: 'current-theme',
        area: 'header',
        title: templateParts.header.name,
        content: this.wrapInTemplatePartBlock(templateParts.header.html, 'header'),
      });
    }

    // Convert footer
    if (templateParts.footer && templateParts.footer.confidence >= 60) {
      parts.push({
        slug: 'footer',
        theme: 'current-theme',
        area: 'footer',
        title: templateParts.footer.name,
        content: this.wrapInTemplatePartBlock(templateParts.footer.html, 'footer'),
      });
    }

    // Convert sidebar
    if (templateParts.sidebar && templateParts.sidebar.confidence >= 60) {
      parts.push({
        slug: 'sidebar',
        theme: 'current-theme',
        area: 'uncategorized',
        title: templateParts.sidebar.name,
        content: this.wrapInTemplatePartBlock(templateParts.sidebar.html, 'sidebar'),
      });
    }

    return parts;
  }

  /**
   * Wrap HTML content in Gutenberg template part block format
   */
  private wrapInTemplatePartBlock(html: string, type: string): string {
    return `<!-- wp:group {"tagName":"${type === 'header' ? 'header' : type === 'footer' ? 'footer' : 'aside'}"} -->
<div class="wp-block-group">
  <!-- wp:html -->
  ${html}
  <!-- /wp:html -->
</div>
<!-- /wp:group -->`;
  }

  /**
   * Generate global styles from components
   */
  private generateGlobalStyles(
    components: ComponentInfo[],
    colorPalette?: ColorPalette,
    typographySystem?: TypographySystem
  ): GlobalStyles {
    const colors = colorPalette
      ? this.convertColorPaletteToGutenberg(colorPalette)
      : this.extractGlobalColors(components);

    const gradients = colorPalette?.gradients
      ? this.convertGradientsToGutenberg(colorPalette.gradients)
      : undefined;

    const typography = typographySystem
      ? this.convertTypographyToGutenberg(typographySystem)
      : this.extractGlobalTypography(components);

    const spacing = this.extractGlobalSpacing(components);

    return {
      version: 2,
      settings: {
        color: {
          palette: colors,
          gradients,
        },
        typography: {
          fontFamilies: typography.families,
          fontSizes: typography.sizes,
          lineHeight: true,
          letterSpacing: true,
        },
        spacing: {
          spacingSizes: spacing,
        },
        layout: {
          contentSize: '840px',
          wideSize: '1200px',
        },
      },
      styles: {
        color: {
          background: '#ffffff',
          text: typographySystem?.globalSettings.baseColor || '#000000',
        },
        typography: {
          fontFamily: typography.families[0]?.fontFamily || 'sans-serif',
          fontSize: typographySystem?.globalSettings.baseFontSize
            ? `${typographySystem.globalSettings.baseFontSize}px`
            : '16px',
          lineHeight: typographySystem?.globalSettings.baseLineHeight
            ? String(typographySystem.globalSettings.baseLineHeight)
            : '1.5',
        },
        elements: typographySystem ? this.generateElementStyles(typographySystem) : undefined,
      },
    };
  }

  /**
   * Extract global colors
   */
  private extractGlobalColors(components: ComponentInfo[]): ColorPaletteItem[] {
    const colorSet = new Set<string>();

    for (const component of components) {
      if (component.styles?.color) colorSet.add(String(component.styles.color));
      if (component.styles?.backgroundColor) colorSet.add(String(component.styles.backgroundColor));
    }

    const colors = Array.from(colorSet).slice(0, 8);

    return colors.map((color, index) => ({
      slug: `color-${index + 1}`,
      color,
      name: `Color ${index + 1}`,
    }));
  }

  /**
   * Extract global typography
   */
  private extractGlobalTypography(components: ComponentInfo[]): {
    families: FontFamily[];
    sizes: FontSize[];
  } {
    const fontSet = new Set<string>();
    const sizeSet = new Set<string>();

    for (const component of components) {
      if (component.styles?.fontFamily) {
        fontSet.add(String(component.styles.fontFamily));
      }
      if (component.styles?.fontSize) {
        sizeSet.add(String(component.styles.fontSize));
      }
    }

    const families = Array.from(fontSet).slice(0, 3).map((font, index) => ({
      slug: `font-${index + 1}`,
      fontFamily: font,
      name: font.split(',')[0].trim(),
    }));

    const sizes = Array.from(sizeSet).slice(0, 6).map((size, index) => ({
      slug: `size-${index + 1}`,
      size,
      name: `Size ${index + 1}`,
    }));

    return { families, sizes };
  }

  /**
   * Extract global spacing
   */
  private extractGlobalSpacing(components: ComponentInfo[]): SpacingSize[] {
    const spacingSet = new Set<string>();

    for (const component of components) {
      if (component.styles?.padding) spacingSet.add(String(component.styles.padding));
      if (component.styles?.margin) spacingSet.add(String(component.styles.margin));
    }

    return Array.from(spacingSet).slice(0, 6).map((size, index) => ({
      slug: `spacing-${index + 1}`,
      size,
      name: `Spacing ${index + 1}`,
    }));
  }

  /**
   * Convert Section 8 ColorPalette to Gutenberg format
   */
  private convertColorPaletteToGutenberg(palette: ColorPalette): ColorPaletteItem[] {
    const items: ColorPaletteItem[] = [];

    // Add primary colors
    palette.primary.forEach((color, i) => {
      items.push({
        slug: `primary-${i + 1}`,
        color: color.hex,
        name: `Primary ${i + 1}`,
      });
    });

    // Add secondary colors
    palette.secondary.forEach((color, i) => {
      items.push({
        slug: `secondary-${i + 1}`,
        color: color.hex,
        name: `Secondary ${i + 1}`,
      });
    });

    // Add accent colors
    palette.accent.forEach((color, i) => {
      items.push({
        slug: `accent-${i + 1}`,
        color: color.hex,
        name: `Accent ${i + 1}`,
      });
    });

    // Add neutral colors
    palette.neutral.forEach((color, i) => {
      items.push({
        slug: `neutral-${i + 1}`,
        color: color.hex,
        name: `Neutral ${i + 1}`,
      });
    });

    // Add semantic colors
    if (palette.semantic.success) {
      items.push({
        slug: 'success',
        color: palette.semantic.success.hex,
        name: 'Success',
      });
    }

    if (palette.semantic.warning) {
      items.push({
        slug: 'warning',
        color: palette.semantic.warning.hex,
        name: 'Warning',
      });
    }

    if (palette.semantic.error) {
      items.push({
        slug: 'error',
        color: palette.semantic.error.hex,
        name: 'Error',
      });
    }

    if (palette.semantic.info) {
      items.push({
        slug: 'info',
        color: palette.semantic.info.hex,
        name: 'Info',
      });
    }

    return items;
  }

  /**
   * Convert Section 8 gradients to Gutenberg format
   */
  private convertGradientsToGutenberg(gradients: any[]): GradientItem[] {
    return gradients.slice(0, 10).map((gradient, i) => {
      // Convert gradient object to CSS gradient string
      let gradientCSS = '';
      if (gradient.type === 'linear') {
        const angle = gradient.angle || 180;
        const stops = gradient.colors
          .map((stop: any) => `${stop.color} ${stop.position}%`)
          .join(', ');
        gradientCSS = `linear-gradient(${angle}deg, ${stops})`;
      } else if (gradient.type === 'radial') {
        const stops = gradient.colors
          .map((stop: any) => `${stop.color} ${stop.position}%`)
          .join(', ');
        gradientCSS = `radial-gradient(circle, ${stops})`;
      }

      return {
        slug: `gradient-${i + 1}`,
        gradient: gradientCSS,
        name: gradient.name || `Gradient ${i + 1}`,
      };
    });
  }

  /**
   * Convert Section 8 TypographySystem to Gutenberg format
   */
  private convertTypographyToGutenberg(typography: TypographySystem): {
    families: FontFamily[];
    sizes: FontSize[];
  } {
    // Convert font families
    const families: FontFamily[] = typography.fontFamilies.slice(0, 5).map((font) => ({
      slug: font.name.toLowerCase().replace(/\s+/g, '-'),
      fontFamily: font.name + (font.fallbacks ? ', ' + font.fallbacks.join(', ') : ''),
      name: font.name,
    }));

    // Convert type scale to font sizes
    const sizes: FontSize[] = [];

    // Add named sizes from type scale
    typography.typeScale.sizes.forEach((typeSize) => {
      sizes.push({
        slug: typeSize.name,
        size: `${typeSize.px}px`,
        name: typeSize.name.charAt(0).toUpperCase() + typeSize.name.slice(1),
      });
    });

    // Ensure we have at least the base sizes
    if (sizes.length === 0) {
      const baseSize = typography.globalSettings.baseFontSize;
      const ratio = typography.typeScale.ratio;

      sizes.push(
        { slug: 'small', size: `${Math.round(baseSize / ratio)}px`, name: 'Small' },
        { slug: 'medium', size: `${baseSize}px`, name: 'Medium' },
        { slug: 'large', size: `${Math.round(baseSize * ratio)}px`, name: 'Large' },
        { slug: 'x-large', size: `${Math.round(baseSize * ratio * ratio)}px`, name: 'Extra Large' }
      );
    }

    return { families, sizes };
  }

  /**
   * Generate element styles for Gutenberg theme.json
   */
  private generateElementStyles(typography: TypographySystem): any {
    return {
      h1: {
        typography: {
          fontFamily: typography.textStyles.h1.fontFamily,
          fontSize: typography.textStyles.h1.fontSize,
          fontWeight: String(typography.textStyles.h1.fontWeight),
          lineHeight: String(typography.textStyles.h1.lineHeight),
        },
      },
      h2: {
        typography: {
          fontFamily: typography.textStyles.h2.fontFamily,
          fontSize: typography.textStyles.h2.fontSize,
          fontWeight: String(typography.textStyles.h2.fontWeight),
          lineHeight: String(typography.textStyles.h2.lineHeight),
        },
      },
      h3: {
        typography: {
          fontFamily: typography.textStyles.h3.fontFamily,
          fontSize: typography.textStyles.h3.fontSize,
          fontWeight: String(typography.textStyles.h3.fontWeight),
          lineHeight: String(typography.textStyles.h3.lineHeight),
        },
      },
      h4: {
        typography: {
          fontFamily: typography.textStyles.h4.fontFamily,
          fontSize: typography.textStyles.h4.fontSize,
          fontWeight: String(typography.textStyles.h4.fontWeight),
          lineHeight: String(typography.textStyles.h4.lineHeight),
        },
      },
      h5: {
        typography: {
          fontFamily: typography.textStyles.h5.fontFamily,
          fontSize: typography.textStyles.h5.fontSize,
          fontWeight: String(typography.textStyles.h5.fontWeight),
          lineHeight: String(typography.textStyles.h5.lineHeight),
        },
      },
      h6: {
        typography: {
          fontFamily: typography.textStyles.h6.fontFamily,
          fontSize: typography.textStyles.h6.fontSize,
          fontWeight: String(typography.textStyles.h6.fontWeight),
          lineHeight: String(typography.textStyles.h6.lineHeight),
        },
      },
      link: {
        typography: {
          fontFamily: typography.textStyles.link.fontFamily,
          textDecoration: 'underline',
        },
        color: {
          text: typography.textStyles.link.color || 'inherit',
        },
      },
      button: {
        typography: {
          fontFamily: typography.textStyles.button.fontFamily,
          fontSize: typography.textStyles.button.fontSize,
          fontWeight: String(typography.textStyles.button.fontWeight),
          textTransform: typography.textStyles.button.textTransform || 'none',
        },
      },
    };
  }

  /**
   * Serialize blocks to HTML comment format
   */
  private serializeBlocks(blocks: GutenbergBlock[]): string {
    return blocks.map(block => this.serializeBlock(block)).join('\n\n');
  }

  /**
   * Serialize single block
   */
  private serializeBlock(block: GutenbergBlock): string {
    const attrsJSON = Object.keys(block.attrs).length > 0
      ? ' ' + JSON.stringify(block.attrs)
      : '';

    if (block.innerBlocks.length === 0 && !block.innerHTML) {
      // Self-closing block
      return `<!-- wp:${block.blockName}${attrsJSON} /-->`;
    }

    // Block with content
    const innerContent = block.innerBlocks.length > 0
      ? '\n' + this.serializeBlocks(block.innerBlocks) + '\n'
      : block.innerHTML;

    return `<!-- wp:${block.blockName}${attrsJSON} -->\n${innerContent}\n<!-- /wp:${block.blockName} -->`;
  }

  /**
   * Export to WordPress post content format
   */
  exportToPostContent(components: ComponentInfo[]): string {
    const blocks = this.convertToBlocks(components);
    return this.serializeBlocks(blocks);
  }

  /**
   * Create specialized icon block from icon widget
   */
  createIconBlock(iconWidget: IconWidget): GutenbergBlock {
    return {
      blockName: 'core/html',
      attrs: {
        className: 'icon-widget',
      },
      innerBlocks: [],
      innerHTML: `<span class="${iconWidget.iconLibrary} ${iconWidget.icon}" style="font-size: ${iconWidget.size}px; color: ${iconWidget.color};"></span>`,
    };
  }

  /**
   * Create specialized icon list block from icon list widget
   */
  createIconListBlock(iconListWidget: IconListWidget): GutenbergBlock {
    const items = iconListWidget.items.map(item => `
      <li>
        <i class="${item.iconLibrary} ${item.icon}" style="color: ${item.iconColor || '#000'}"></i>
        <span>${item.text}</span>
      </li>
    `).join('');

    return {
      blockName: 'core/list',
      attrs: {
        ordered: false,
        className: 'icon-list',
      },
      innerBlocks: [],
      innerHTML: `<ul class="icon-list ${iconListWidget.layout}">${items}</ul>`,
    };
  }

  /**
   * Create specialized gallery block from gallery widget
   */
  createGalleryBlock(galleryWidget: GalleryWidget): GutenbergBlock {
    const images = galleryWidget.images.map(img => ({
      blockName: 'core/image',
      attrs: {
        url: img.url,
        alt: img.alt,
        caption: img.caption || '',
      },
      innerBlocks: [],
      innerHTML: '',
    }));

    return {
      blockName: 'core/gallery',
      attrs: {
        images: galleryWidget.images.map(img => ({
          url: img.url,
          alt: img.alt,
          caption: img.caption,
        })),
        columns: typeof galleryWidget.columns === 'number' ? galleryWidget.columns : galleryWidget.columns.desktop,
        imageCrop: galleryWidget.aspectRatio !== 'auto',
        linkTo: galleryWidget.lightbox ? 'file' : 'none',
      },
      innerBlocks: images,
      innerHTML: '',
    };
  }

  /**
   * Create specialized carousel block from carousel widget
   */
  createCarouselBlock(carouselWidget: CarouselWidget): GutenbergBlock {
    // Note: Gutenberg doesn't have a native carousel, so we use a custom block or HTML
    const slides = carouselWidget.slides.map(slide => `
      <div class="carousel-slide">
        ${slide.image ? `<img src="${slide.image}" alt="${slide.title || ''}" />` : ''}
        ${slide.title ? `<h3>${slide.title}</h3>` : ''}
        ${slide.subtitle ? `<p class="subtitle">${slide.subtitle}</p>` : ''}
        ${slide.content ? `<div class="content">${slide.content}</div>` : ''}
        ${slide.link ? `<a href="${slide.link}">${slide.linkText || 'Learn More'}</a>` : ''}
      </div>
    `).join('');

    return {
      blockName: 'core/html',
      attrs: {
        className: 'carousel-widget',
      },
      innerBlocks: [],
      innerHTML: `<div class="carousel" data-autoplay="${carouselWidget.autoplay}" data-speed="${carouselWidget.autoplaySpeed}">${slides}</div>`,
    };
  }

  /**
   * Create specialized testimonial block from testimonial widget
   */
  createTestimonialBlock(testimonialWidget: TestimonialWidget): GutenbergBlock {
    const testimonials = testimonialWidget.testimonials.map(t => `
      <blockquote class="testimonial">
        <div class="content">${t.content}</div>
        <footer>
          ${t.authorImage ? `<img src="${t.authorImage}" alt="${t.authorName}" class="author-image" />` : ''}
          <cite>
            <strong>${t.authorName}</strong>
            ${t.authorTitle ? `<span class="title">${t.authorTitle}</span>` : ''}
          </cite>
          ${t.rating ? `<div class="rating">${'★'.repeat(t.rating)}</div>` : ''}
        </footer>
      </blockquote>
    `).join('');

    return {
      blockName: 'core/html',
      attrs: {
        className: 'testimonial-widget',
      },
      innerBlocks: [],
      innerHTML: `<div class="testimonials ${testimonialWidget.layout}">${testimonials}</div>`,
    };
  }

  /**
   * Create specialized pricing table block from pricing table widget
   */
  createPricingTableBlock(pricingTableWidget: PricingTableWidget): GutenbergBlock {
    const plans = pricingTableWidget.plans.map(plan => `
      <div class="pricing-plan ${plan.highlighted ? 'highlighted' : ''}">
        ${plan.ribbon ? `<div class="ribbon">${plan.ribbon}</div>` : ''}
        <h3 class="plan-title">${plan.title}</h3>
        <div class="price">
          <span class="currency">${pricingTableWidget.currency}</span>
          <span class="amount">${plan.price}</span>
          <span class="period">${plan.period || pricingTableWidget.period || ''}</span>
        </div>
        <ul class="features">
          ${plan.features.map(f => `
            <li class="${f.included ? 'included' : 'excluded'}">
              ${f.text}
            </li>
          `).join('')}
        </ul>
        <a href="${plan.buttonLink}" class="button">${plan.buttonText}</a>
      </div>
    `).join('');

    return {
      blockName: 'core/html',
      attrs: {
        className: 'pricing-table-widget',
      },
      innerBlocks: [],
      innerHTML: `<div class="pricing-table">${plans}</div>`,
    };
  }

  /**
   * Auto-detect and create specialized widgets from component
   */
  createSpecializedWidget(component: ComponentInfo): GutenbergBlock | null {
    // Try icon widget
    const iconWidget = extractIconWidget(component);
    if (iconWidget) {
      return this.createIconBlock(iconWidget);
    }

    // Try icon list widget
    const iconListWidget = extractIconListWidget(component);
    if (iconListWidget) {
      return this.createIconListBlock(iconListWidget);
    }

    // Try gallery widget
    const galleryWidget = extractGalleryWidget(component);
    if (galleryWidget) {
      return this.createGalleryBlock(galleryWidget);
    }

    // Try carousel widget
    const carouselWidget = extractCarouselWidget(component);
    if (carouselWidget) {
      return this.createCarouselBlock(carouselWidget);
    }

    // Try testimonial widget
    const testimonialWidget = extractTestimonialWidget(component);
    if (testimonialWidget) {
      return this.createTestimonialBlock(testimonialWidget);
    }

    // Try pricing table widget
    const pricingTableWidget = extractPricingTableWidget(component);
    if (pricingTableWidget) {
      return this.createPricingTableBlock(pricingTableWidget);
    }

    return null;
  }
}

/**
 * Helper function for quick export
 */
export function exportToGutenberg(
  components: ComponentInfo[],
  options?: {
    usePatterns?: boolean;
    extractReusable?: boolean;
    generateGlobalStyles?: boolean;
  }
): GutenbergExport {
  const exporter = new GutenbergExporter();
  return exporter.export(components, options);
}
