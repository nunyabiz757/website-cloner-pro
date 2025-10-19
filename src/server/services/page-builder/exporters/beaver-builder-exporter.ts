/**
 * Beaver Builder Exporter
 *
 * Complete mapping system for Beaver Builder:
 * - Module mapping (30+ modules)
 * - Row and column structure
 * - Module settings and design
 * - Responsive settings
 * - Saved modules and templates
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
import { extractBoxModel, type BoxModel, formatDimensionSet } from '../utils/dimension-parser.js';
import {
  extractBoxShadow,
  toBeaverBuilderBoxShadow,
  type ParsedBoxShadow,
} from '../utils/box-shadow-parser.js';

export interface BeaverBuilderExport {
  rows: BBRow[];
  modules: BBModule[];
  savedModules: BBSavedModule[];
  templates: BBTemplate[];
  colorScheme?: BBColorScheme;
  typography?: BBTypography;
  header?: BBTemplate;
  footer?: BBTemplate;
}

export interface BBRow {
  node: string;
  type: 'row';
  settings: BBRowSettings;
  columns: BBColumn[];
}

export interface BBRowSettings {
  width?: 'fixed' | 'full';
  content_width?: string;
  bg_color?: string;
  bg_image?: string;
  bg_parallax?: 'scroll' | 'fixed';
  padding_top?: string;
  padding_bottom?: string;
  padding_left?: string;
  padding_right?: string;
  margin_top?: string;
  margin_bottom?: string;
  responsive_display?: 'show' | 'hide';
}

export interface BBColumn {
  node: string;
  type: 'column';
  parent: string;
  size?: number;
  settings: BBColumnSettings;
  modules: BBModule[];
}

export interface BBColumnSettings {
  size?: number;
  bg_color?: string;
  padding_top?: string;
  padding_bottom?: string;
  padding_left?: string;
  padding_right?: string;
  responsive_display?: 'show' | 'hide';
}

export interface BBModule {
  node: string;
  type: string;
  parent: string;
  position: number;
  settings: Record<string, any>;
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

export interface BBSavedModule {
  id: number;
  name: string;
  type: string;
  settings: Record<string, any>;
  global?: boolean;
}

export interface BBTemplate {
  id: number;
  name: string;
  content: string;
  category?: string;
}

export interface BBColorScheme {
  primary: string[];
  secondary: string[];
  accent: string[];
  neutral: string[];
  semantic: {
    success?: string;
    warning?: string;
    error?: string;
    info?: string;
  };
}

export interface BBTypography {
  body_font_family: string;
  body_font_weight: string;
  body_font_size: string;
  body_line_height: string;
  heading_font_family: string;
  heading_font_weight: string;
  h1_font_size: string;
  h1_line_height: string;
  h2_font_size: string;
  h2_line_height: string;
  h3_font_size: string;
  h3_line_height: string;
  h4_font_size: string;
  h4_line_height: string;
  h5_font_size: string;
  h5_line_height: string;
  h6_font_size: string;
  h6_line_height: string;
}

export class BeaverBuilderExporter {
  private moduleMap: Map<string, string> = new Map();
  private nodeCounter: number = 0;

  constructor() {
    this.initializeModuleMap();
  }

  /**
   * Export components to Beaver Builder structure
   */
  export(
    components: ComponentInfo[],
    options?: {
      colorPalette?: ColorPalette;
      typographySystem?: TypographySystem;
      componentLibrary?: ComponentLibrary;
      templateParts?: TemplateParts;
      validateExport?: boolean;
      optimizeExport?: boolean;
    }
  ): BeaverBuilderExport {
    this.nodeCounter = 0;
    const rows = this.convertToRows(components, options);
    const modules = this.extractAllModules(rows);
    const savedModules = options?.componentLibrary
      ? this.convertLibraryToSavedModules(options.componentLibrary)
      : this.createSavedModules(modules);
    const templates = options?.componentLibrary
      ? this.convertLibraryToTemplates(options.componentLibrary)
      : this.createTemplates(rows);
    const colorScheme = options?.colorPalette
      ? this.convertColorPaletteToBB(options.colorPalette)
      : undefined;
    const typography = options?.typographySystem
      ? this.convertTypographyToBB(options.typographySystem)
      : undefined;

    const templatePartsExport = options?.templateParts
      ? this.convertTemplatePartsToBB(options.templateParts)
      : { header: undefined, footer: undefined };

    let result: BeaverBuilderExport = {
      rows,
      modules,
      savedModules,
      templates,
      colorScheme,
      typography,
      header: templatePartsExport.header,
      footer: templatePartsExport.footer,
    };

    // Validate export
    if (options?.validateExport !== false) {
      const validation = validateExport(result);
      if (!validation.isValid) {
        console.warn('Beaver Builder export validation failed:', validation.errors);
      }
      if (validation.warnings.length > 0) {
        console.warn('Beaver Builder export warnings:', validation.warnings);
      }
    }

    // Optimize export
    if (options?.optimizeExport !== false) {
      result = optimizeExport(result);
    }

    return result;
  }

  /**
   * Initialize module mapping
   */
  private initializeModuleMap(): void {
    // Basic modules
    this.moduleMap.set('heading', 'heading');
    this.moduleMap.set('paragraph', 'rich-text');
    this.moduleMap.set('html', 'html');

    // Media modules
    this.moduleMap.set('image', 'photo');
    this.moduleMap.set('gallery', 'gallery');
    this.moduleMap.set('video', 'video');
    this.moduleMap.set('slider', 'slideshow');

    // Interactive
    this.moduleMap.set('button', 'button');
    this.moduleMap.set('cta', 'callout');
    this.moduleMap.set('form', 'contact-form');
    this.moduleMap.set('subscribe', 'subscribe-form');
    this.moduleMap.set('accordion', 'accordion');
    this.moduleMap.set('tabs', 'tabs');

    // Content
    this.moduleMap.set('post-grid', 'post-grid');
    this.moduleMap.set('post-slider', 'post-slider');
    this.moduleMap.set('post-carousel', 'post-carousel');
    this.moduleMap.set('testimonials', 'testimonials');

    // Social
    this.moduleMap.set('social-buttons', 'social-buttons');

    // Widgets
    this.moduleMap.set('sidebar', 'sidebar');
    this.moduleMap.set('menu', 'menu');
    this.moduleMap.set('search', 'search');
    this.moduleMap.set('separator', 'separator');
    this.moduleMap.set('spacer', 'spacer');

    // Advanced
    this.moduleMap.set('countdown', 'countdown');
    this.moduleMap.set('map', 'map');
    this.moduleMap.set('icon', 'icon');
    this.moduleMap.set('icon-group', 'icon-group');
    this.moduleMap.set('pricing-table', 'pricing-table');
    this.moduleMap.set('content-slider', 'content-slider');
  }

  /**
   * Convert components to rows
   */
  private convertToRows(components: ComponentInfo[], options?: {
    colorPalette?: ColorPalette;
    typographySystem?: TypographySystem;
  }): BBRow[] {
    const rows: BBRow[] = [];
    let currentRow: BBRow | null = null;

    for (const component of components) {
      if (this.isRowComponent(component)) {
        if (currentRow) rows.push(currentRow);
        currentRow = this.createRow(component, options);
      } else if (currentRow) {
        this.addToRow(currentRow, component, options);
      } else {
        currentRow = this.createDefaultRow();
        this.addToRow(currentRow, component, options);
      }
    }

    if (currentRow) rows.push(currentRow);
    return rows;
  }

  /**
   * Check if component is a row
   */
  private isRowComponent(component: ComponentInfo): boolean {
    const classes = (component.className || '').toLowerCase();
    return classes.includes('row') || component.tagName === 'section';
  }

  /**
   * Map entrance animation to BB animation type
   */
  private mapEntranceAnimationToBB(type: string): string {
    const mapping: Record<string, string> = {
      fadeIn: 'fade-in',
      slideInUp: 'slide-up',
      slideInDown: 'slide-down',
      slideInLeft: 'slide-left',
      slideInRight: 'slide-right',
      zoomIn: 'zoom-in',
      bounceIn: 'bounce-in',
      rotateIn: 'rotate-in',
      flipIn: 'flip-in',
    };

    return mapping[type] || 'fade-in';
  }

  /**
   * Create row from component
   */
  private createRow(component: ComponentInfo): BBRow {
    const node = this.generateNode();
    const columns = this.detectColumns(component);

    return {
      node,
      type: 'row',
      settings: this.extractRowSettings(component),
      columns: columns.length > 0
        ? columns.map(col => this.createColumn(col, node))
        : [this.createDefaultColumn(node)],
    };
  }

  /**
   * Create default row
   */
  private createDefaultRow(): BBRow {
    const node = this.generateNode();
    return {
      node,
      type: 'row',
      settings: { width: 'fixed' },
      columns: [this.createDefaultColumn(node)],
    };
  }

  /**
   * Extract row settings
   */
  private extractRowSettings(component: ComponentInfo): BBRowSettings {
    const settings: BBRowSettings = {
      width: 'fixed',
    };

    if (component.styles?.backgroundColor) {
      settings.bg_color = String(component.styles.backgroundColor);
    }

    const bgImage = this.extractBackgroundImage(component);
    if (bgImage) {
      settings.bg_image = bgImage;
      settings.bg_parallax = 'scroll';
    }

    if (component.styles?.paddingTop) settings.padding_top = String(component.styles.paddingTop);
    if (component.styles?.paddingBottom) settings.padding_bottom = String(component.styles.paddingBottom);
    if (component.styles?.paddingLeft) settings.padding_left = String(component.styles.paddingLeft);
    if (component.styles?.paddingRight) settings.padding_right = String(component.styles.paddingRight);

    return settings;
  }

  /**
   * Detect columns
   */
  private detectColumns(component: ComponentInfo): ComponentInfo[] {
    if (!component.children) return [];
    return component.children.filter(child => {
      const classes = (child.className || '').toLowerCase();
      return classes.includes('col') || classes.includes('column');
    });
  }

  /**
   * Create column
   */
  private createColumn(component: ComponentInfo, parentNode: string): BBColumn {
    const node = this.generateNode();
    const size = this.getColumnSize(component);

    const modules = component.children
      ? component.children.map((child, index) =>
          this.componentToModule(child, node, index)
        )
      : [];

    return {
      node,
      type: 'column',
      parent: parentNode,
      size,
      settings: this.extractColumnSettings(component, size),
      modules,
    };
  }

  /**
   * Create default column
   */
  private createDefaultColumn(parentNode: string): BBColumn {
    return {
      node: this.generateNode(),
      type: 'column',
      parent: parentNode,
      size: 100,
      settings: { size: 100 },
      modules: [],
    };
  }

  /**
   * Extract column settings
   */
  private extractColumnSettings(component: ComponentInfo, size: number): BBColumnSettings {
    const settings: BBColumnSettings = { size };

    if (component.styles?.backgroundColor) {
      settings.bg_color = String(component.styles.backgroundColor);
    }

    if (component.styles?.paddingTop) settings.padding_top = String(component.styles.paddingTop);
    if (component.styles?.paddingBottom) settings.padding_bottom = String(component.styles.paddingBottom);

    return settings;
  }

  /**
   * Get column size percentage
   */
  private getColumnSize(component: ComponentInfo): number {
    const classes = (component.className || '').toLowerCase();

    if (classes.includes('col-12')) return 100;
    if (classes.includes('col-6')) return 50;
    if (classes.includes('col-4')) return 33.33;
    if (classes.includes('col-3')) return 25;
    if (classes.includes('col-8')) return 66.66;
    if (classes.includes('col-9')) return 75;

    return 100;
  }

  /**
   * Add component to row
   */
  private addToRow(row: BBRow, component: ComponentInfo): void {
    if (row.columns.length === 0) {
      row.columns.push(this.createDefaultColumn(row.node));
    }

    const module = this.componentToModule(component, row.columns[0].node, row.columns[0].modules.length);
    row.columns[0].modules.push(module);
  }

  /**
   * Convert component to module
   */
  private componentToModule(component: ComponentInfo, parentNode: string, position: number, options?: {
    colorPalette?: ColorPalette;
    typographySystem?: TypographySystem;
  }): BBModule {
    const type = this.getModuleType(component);
    const settings = this.extractModuleSettings(component, type, options);

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
      node: this.generateNode(),
      type,
      parent: parentNode,
      position,
      settings,
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
   * Get module type
   */
  private getModuleType(component: ComponentInfo): string {
    const type = component.componentType.toLowerCase();

    if (this.moduleMap.has(type)) {
      return this.moduleMap.get(type)!;
    }

    const tag = component.tagName?.toLowerCase();
    if (tag?.match(/^h[1-6]$/)) return 'heading';
    if (tag === 'p') return 'rich-text';
    if (tag === 'img') return 'photo';
    if (tag === 'button') return 'button';
    if (tag === 'form') return 'contact-form';

    return 'rich-text';
  }

  /**
   * Extract module settings
   */
  private extractModuleSettings(component: ComponentInfo, moduleType: string, options?: {
    colorPalette?: ColorPalette;
    typographySystem?: TypographySystem;
  }): Record<string, any> {
    const settings: Record<string, any> = {};

    // Advanced features integration into BB settings
    const responsiveSettings = extractResponsiveSettings(component);
    const hoverEffects = extractHoverEffects(component);
    const entranceAnimation = extractEntranceAnimation(component);
    const boxShadow = component.styles ? extractBoxShadow(component.styles) : undefined;
    const boxModel = component.styles ? extractBoxModel(component.styles) : undefined;

    // Responsive settings (BB format: property_responsive with mobile/medium/responsive values)
    if (responsiveSettings.mobile || responsiveSettings.tablet) {
      settings.responsive_display = 'show';

      if (responsiveSettings.mobile?.fontSize) {
        settings.font_size_unit_responsive = responsiveSettings.mobile.fontSize;
      }
      if (responsiveSettings.mobile?.padding) {
        settings.padding_responsive = responsiveSettings.mobile.padding;
      }
      if (responsiveSettings.mobile?.margin) {
        settings.margin_responsive = responsiveSettings.mobile.margin;
      }
    }

    // Hover effects
    if (hoverEffects) {
      if (hoverEffects.backgroundColor) {
        settings.bg_hover_color = hoverEffects.backgroundColor;
      }
      if (hoverEffects.color) {
        settings.text_hover_color = hoverEffects.color;
      }
      if (hoverEffects.transform) {
        settings.transform_hover = hoverEffects.transform;
      }
      if (hoverEffects.transition) {
        settings.transition = `${hoverEffects.transition.duration} ${hoverEffects.transition.timingFunction}`;
      }
    }

    // Entrance animation
    if (entranceAnimation) {
      settings.animation = this.mapEntranceAnimationToBB(entranceAnimation.type);
      settings.animation_delay = entranceAnimation.delay / 1000; // Convert to seconds
      settings.animation_duration = entranceAnimation.duration / 1000;
    }

    // Box shadow
    if (boxShadow) {
      const shadowData = toBeaverBuilderBoxShadow(boxShadow);
      if (shadowData) {
        settings.box_shadow = shadowData;
      }
    }

    // Box model
    if (boxModel) {
      if (boxModel.padding) {
        settings.padding_top = boxModel.padding.top ? `${boxModel.padding.top.value}${boxModel.padding.top.unit}` : undefined;
        settings.padding_bottom = boxModel.padding.bottom ? `${boxModel.padding.bottom.value}${boxModel.padding.bottom.unit}` : undefined;
        settings.padding_left = boxModel.padding.left ? `${boxModel.padding.left.value}${boxModel.padding.left.unit}` : undefined;
        settings.padding_right = boxModel.padding.right ? `${boxModel.padding.right.value}${boxModel.padding.right.unit}` : undefined;
      }
      if (boxModel.margin) {
        settings.margin_top = boxModel.margin.top ? `${boxModel.margin.top.value}${boxModel.margin.top.unit}` : undefined;
        settings.margin_bottom = boxModel.margin.bottom ? `${boxModel.margin.bottom.value}${boxModel.margin.bottom.unit}` : undefined;
      }
    }

    // Link colors to color scheme
    if (options?.colorPalette) {
      const tokenRef = buildDesignTokenReferences(options.colorPalette, options.typographySystem);
      const tokens = linkToDesignTokens(component, tokenRef);

      if (tokens.colorTokens.has('color')) {
        settings.color_preset = tokens.colorTokens.get('color');
      }
      if (tokens.colorTokens.has('backgroundColor')) {
        settings.bg_color_preset = tokens.colorTokens.get('backgroundColor');
      }
    }

    switch (moduleType) {
      case 'heading':
        settings.heading = component.textContent || '';
        settings.tag = component.tagName || 'h2';
        if (component.styles?.color) settings.color = component.styles.color;
        if (component.styles?.fontSize) settings.font_size = component.styles.fontSize;
        settings.alignment = component.styles?.textAlign || 'left';
        break;

      case 'rich-text':
        settings.text = component.innerHTML || component.textContent || '';
        if (component.styles?.color) settings.color = component.styles.color;
        break;

      case 'photo':
        settings.photo_src = component.attributes?.src || '';
        settings.photo = { url: component.attributes?.src || '' };
        settings.alt = component.attributes?.alt || '';
        settings.caption = component.attributes?.title || '';
        settings.link_type = 'none';
        settings.alignment = 'center';
        break;

      case 'button':
        settings.text = component.textContent || 'Click Here';
        settings.link = component.attributes?.href || '#';
        settings.link_target = component.attributes?.target || '_self';
        if (component.styles?.backgroundColor) {
          settings.bg_color = component.styles.backgroundColor;
        }
        if (component.styles?.color) {
          settings.text_color = component.styles.color;
        }
        settings.style = 'flat';
        settings.width = 'auto';
        settings.align = 'center';
        break;

      case 'callout':
        settings.heading = this.extractCTAHeading(component);
        settings.text = this.extractCTAText(component);
        settings.btn_text = 'Click Here';
        settings.btn_link = '#';
        settings.btn_style = 'flat';
        settings.align = 'center';
        break;

      case 'gallery':
        settings.photos = [];
        settings.layout = 'grid';
        settings.columns = 3;
        settings.spacing = 20;
        settings.show_captions = 'hover';
        break;

      case 'slideshow':
        settings.photos = [];
        settings.transition = 'fade';
        settings.speed = 3;
        settings.auto_play = true;
        settings.show_thumbs = true;
        settings.show_arrows = true;
        settings.show_dots = true;
        break;

      case 'accordion':
        settings.items = [];
        settings.border_color = '#cccccc';
        settings.open_first = true;
        settings.collapse = true;
        break;

      case 'tabs':
        settings.items = [];
        settings.layout = 'horizontal';
        settings.style = 'default';
        break;

      case 'contact-form':
        settings.name_toggle = 'show';
        settings.subject_toggle = 'show';
        settings.email_toggle = 'show';
        settings.phone_toggle = 'hide';
        settings.message_toggle = 'show';
        settings.btn_text = 'Send';
        settings.success_message = 'Thanks for your message!';
        break;

      case 'map':
        settings.address = '';
        settings.height = 400;
        settings.zoom = 14;
        break;

      case 'icon':
        settings.icon = 'fa-star';
        settings.size = 50;
        if (component.styles?.color) settings.color = component.styles.color;
        settings.align = 'center';
        break;

      case 'separator':
        settings.color = '#cccccc';
        settings.height = 1;
        settings.width = 100;
        settings.style = 'solid';
        settings.align = 'center';
        break;

      case 'spacer':
        settings.size = component.styles?.height || '50';
        break;
    }

    return settings;
  }

  /**
   * Extract CTA heading
   */
  private extractCTAHeading(component: ComponentInfo): string {
    const heading = component.children?.find(c => c.tagName?.match(/^h[1-6]$/));
    return heading?.textContent || '';
  }

  /**
   * Extract CTA text
   */
  private extractCTAText(component: ComponentInfo): string {
    const p = component.children?.find(c => c.tagName === 'p');
    return p?.textContent || '';
  }

  /**
   * Extract background image
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
   * Generate unique node ID
   */
  private generateNode(): string {
    return `node_${++this.nodeCounter}`;
  }

  /**
   * Extract all modules from rows
   */
  private extractAllModules(rows: BBRow[]): BBModule[] {
    const modules: BBModule[] = [];
    for (const row of rows) {
      for (const column of row.columns) {
        modules.push(...column.modules);
      }
    }
    return modules;
  }

  /**
   * Convert Section 8 ComponentLibrary to BB saved modules
   */
  private convertLibraryToSavedModules(library: ComponentLibrary): BBSavedModule[] {
    const savedModules: BBSavedModule[] = [];
    let moduleId = 1;

    for (const template of library.templates) {
      if (template.reusabilityScore < 60) continue;

      savedModules.push({
        id: moduleId++,
        name: template.name,
        type: this.mapComponentTypeToModule(template.componentType),
        settings: template.styles,
        global: template.reusabilityScore >= 80,
      });
    }

    return savedModules;
  }

  /**
   * Convert Section 8 ComponentLibrary to BB templates
   */
  private convertLibraryToTemplates(library: ComponentLibrary): BBTemplate[] {
    const templates: BBTemplate[] = [];
    let templateId = 1;

    for (const template of library.templates) {
      if (template.reusabilityScore < 50) continue;

      templates.push({
        id: templateId++,
        name: template.name,
        content: template.html,
        category: template.category.charAt(0).toUpperCase() + template.category.slice(1),
      });
    }

    return templates;
  }

  /**
   * Map component type to BB module type
   */
  private mapComponentTypeToModule(componentType: string): string {
    const mapping: Record<string, string> = {
      heading: 'heading',
      paragraph: 'rich-text',
      button: 'button',
      image: 'photo',
      gallery: 'gallery',
      card: 'callout',
      form: 'contact-form',
      navigation: 'menu',
    };

    return mapping[componentType] || 'html';
  }

  /**
   * Convert Section 8 TemplateParts to BB header/footer templates
   */
  private convertTemplatePartsToBB(templateParts: TemplateParts): {
    header?: BBTemplate;
    footer?: BBTemplate;
  } {
    const result: { header?: BBTemplate; footer?: BBTemplate } = {};

    if (templateParts.header && templateParts.header.confidence >= 60) {
      result.header = {
        id: 9999,
        name: templateParts.header.name,
        content: templateParts.header.html,
        category: 'Header',
      };
    }

    if (templateParts.footer && templateParts.footer.confidence >= 60) {
      result.footer = {
        id: 9998,
        name: templateParts.footer.name,
        content: templateParts.footer.html,
        category: 'Footer',
      };
    }

    return result;
  }

  /**
   * Create saved modules
   */
  private createSavedModules(modules: BBModule[]): BBSavedModule[] {
    const savedModules: BBSavedModule[] = [];
    const moduleTypes = new Map<string, BBModule[]>();

    for (const module of modules) {
      if (!moduleTypes.has(module.type)) {
        moduleTypes.set(module.type, []);
      }
      moduleTypes.get(module.type)!.push(module);
    }

    let id = 1;
    for (const [type, mods] of moduleTypes) {
      if (mods.length >= 2) {
        savedModules.push({
          id: id++,
          name: `Saved ${type}`,
          type,
          settings: mods[0].settings,
          global: false,
        });
      }
    }

    return savedModules;
  }

  /**
   * Create templates
   */
  private createTemplates(rows: BBRow[]): BBTemplate[] {
    return [{
      id: 1,
      name: 'Converted Template',
      content: JSON.stringify(rows),
      category: 'Converted',
    }];
  }

  /**
   * Convert Section 8 ColorPalette to Beaver Builder color scheme
   */
  private convertColorPaletteToBB(palette: ColorPalette): BBColorScheme {
    return {
      primary: palette.primary.map(c => c.hex),
      secondary: palette.secondary.map(c => c.hex),
      accent: palette.accent.map(c => c.hex),
      neutral: palette.neutral.map(c => c.hex),
      semantic: {
        success: palette.semantic.success?.hex,
        warning: palette.semantic.warning?.hex,
        error: palette.semantic.error?.hex,
        info: palette.semantic.info?.hex,
      },
    };
  }

  /**
   * Convert Section 8 TypographySystem to Beaver Builder typography
   */
  private convertTypographyToBB(typography: TypographySystem): BBTypography {
    const bodyFont = typography.fontFamilies.find(f =>
      f.contexts.some(c => c.type === 'body')
    ) || typography.fontFamilies[0];

    const headingFont = typography.fontFamilies.find(f =>
      f.contexts.some(c => c.type === 'heading')
    ) || bodyFont;

    return {
      body_font_family: bodyFont?.name || typography.globalSettings.baseFontFamily,
      body_font_weight: '400',
      body_font_size: `${typography.globalSettings.baseFontSize}px`,
      body_line_height: String(typography.globalSettings.baseLineHeight),
      heading_font_family: headingFont?.name || typography.globalSettings.headingFontFamily || bodyFont?.name || 'sans-serif',
      heading_font_weight: String(typography.globalSettings.headingFontWeight || 700),
      h1_font_size: typography.textStyles.h1.fontSize,
      h1_line_height: String(typography.textStyles.h1.lineHeight),
      h2_font_size: typography.textStyles.h2.fontSize,
      h2_line_height: String(typography.textStyles.h2.lineHeight),
      h3_font_size: typography.textStyles.h3.fontSize,
      h3_line_height: String(typography.textStyles.h3.lineHeight),
      h4_font_size: typography.textStyles.h4.fontSize,
      h4_line_height: String(typography.textStyles.h4.lineHeight),
      h5_font_size: typography.textStyles.h5.fontSize,
      h5_line_height: String(typography.textStyles.h5.lineHeight),
      h6_font_size: typography.textStyles.h6.fontSize,
      h6_line_height: String(typography.textStyles.h6.lineHeight),
    };
  }

  /**
   * Export to JSON
   */
  exportToJSON(components: ComponentInfo[]): string {
    const bbExport = this.export(components);
    return JSON.stringify(bbExport, null, 2);
  }

  /**
   * Export to Beaver Builder format
   */
  exportToBuilderFormat(components: ComponentInfo[]): string {
    const rows = this.convertToRows(components);
    return JSON.stringify(rows, null, 2);
  }

  /**
   * Create specialized icon module from icon widget
   */
  createIconModule(iconWidget: IconWidget, parentNode: string, position: number): BBModule {
    return {
      node: this.generateNode(),
      type: 'icon',
      parent: parentNode,
      position,
      settings: {
        icon: iconWidget.icon,
        size: iconWidget.size,
        color: iconWidget.color,
        hover_color: iconWidget.hoverColor,
        align: iconWidget.alignment || 'center',
        link: iconWidget.link,
        link_target: iconWidget.linkTarget || '_self',
      },
    };
  }

  /**
   * Create specialized gallery module from gallery widget
   */
  createGalleryModule(galleryWidget: GalleryWidget, parentNode: string, position: number): BBModule {
    return {
      node: this.generateNode(),
      type: 'gallery',
      parent: parentNode,
      position,
      settings: {
        photos: galleryWidget.images.map(img => ({
          url: img.url,
          alt: img.alt,
          caption: img.caption,
          title: img.title,
        })),
        layout: galleryWidget.layout === 'masonry' ? 'masonry' : 'grid',
        columns: typeof galleryWidget.columns === 'number' ? galleryWidget.columns : galleryWidget.columns.desktop,
        spacing: galleryWidget.gap,
        show_captions: galleryWidget.captions ? 'hover' : 'never',
        click_action: galleryWidget.lightbox ? 'lightbox' : 'none',
      },
    };
  }

  /**
   * Create specialized slideshow module from carousel widget
   */
  createSlideshowModule(carouselWidget: CarouselWidget, parentNode: string, position: number): BBModule {
    return {
      node: this.generateNode(),
      type: 'slideshow',
      parent: parentNode,
      position,
      settings: {
        photos: carouselWidget.slides.map(slide => ({
          url: slide.image || '',
          title: slide.title,
          caption: slide.content,
        })),
        transition: carouselWidget.effect === 'fade' ? 'fade' : 'slide',
        speed: (carouselWidget.autoplaySpeed || 3000) / 1000,
        auto_play: carouselWidget.autoplay,
        show_arrows: carouselWidget.arrows,
        show_dots: carouselWidget.dots,
      },
    };
  }

  /**
   * Create specialized testimonials module from testimonial widget
   */
  createTestimonialsModule(testimonialWidget: TestimonialWidget, parentNode: string, position: number): BBModule {
    return {
      node: this.generateNode(),
      type: 'testimonials',
      parent: parentNode,
      position,
      settings: {
        testimonials: testimonialWidget.testimonials.map(t => ({
          content: t.content,
          name: t.authorName,
          title: t.authorTitle || '',
          photo: t.authorImage,
        })),
        layout: testimonialWidget.layout === 'carousel' ? 'slider' : 'grid',
        columns: 1,
        auto_play: testimonialWidget.layout === 'carousel',
      },
    };
  }

  /**
   * Create specialized pricing table module from pricing table widget
   */
  createPricingTableModule(pricingTableWidget: PricingTableWidget, parentNode: string, position: number): BBModule {
    return {
      node: this.generateNode(),
      type: 'pricing-table',
      parent: parentNode,
      position,
      settings: {
        columns: pricingTableWidget.plans.length,
        pricing_columns: pricingTableWidget.plans.map(plan => ({
          title: plan.title,
          price: `${pricingTableWidget.currency}${plan.price}`,
          duration: plan.period || pricingTableWidget.period,
          features: plan.features.map(f => f.text).join('\n'),
          button_text: plan.buttonText,
          button_url: plan.buttonLink,
          featured: plan.highlighted,
        })),
      },
    };
  }

  /**
   * Auto-detect and create specialized widgets from component
   */
  createSpecializedWidget(component: ComponentInfo, parentNode: string, position: number): BBModule | null {
    // Try icon widget
    const iconWidget = extractIconWidget(component);
    if (iconWidget) {
      return this.createIconModule(iconWidget, parentNode, position);
    }

    // Try gallery widget
    const galleryWidget = extractGalleryWidget(component);
    if (galleryWidget) {
      return this.createGalleryModule(galleryWidget, parentNode, position);
    }

    // Try carousel widget
    const carouselWidget = extractCarouselWidget(component);
    if (carouselWidget) {
      return this.createSlideshowModule(carouselWidget, parentNode, position);
    }

    // Try testimonial widget
    const testimonialWidget = extractTestimonialWidget(component);
    if (testimonialWidget) {
      return this.createTestimonialsModule(testimonialWidget, parentNode, position);
    }

    // Try pricing table widget
    const pricingTableWidget = extractPricingTableWidget(component);
    if (pricingTableWidget) {
      return this.createPricingTableModule(pricingTableWidget, parentNode, position);
    }

    return null;
  }
}

/**
 * Helper function
 */
export function exportToBeaverBuilder(components: ComponentInfo[]): BeaverBuilderExport {
  const exporter = new BeaverBuilderExporter();
  return exporter.export(components);
}
