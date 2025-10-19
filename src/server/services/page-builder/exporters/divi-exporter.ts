/**
 * Divi Builder Exporter
 *
 * Complete mapping system for Elegant Themes Divi Builder:
 * - Module mapping (40+ modules)
 * - Section and row structure
 * - Design settings and customization
 * - Responsive settings
 * - Divi Library export
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
  toDiviBoxShadow,
  type ParsedBoxShadow,
} from '../utils/box-shadow-parser.js';

export interface DiviExport {
  sections: DiviSection[];
  modules: DiviModule[];
  layouts: DiviLayout[];
  globalPresets?: GlobalPreset[];
  globalColors?: DiviGlobalColor[];
  fontSettings?: DiviFontSettings;
  header?: DiviLayout;
  footer?: DiviLayout;
}

export interface DiviSection {
  type: 'section';
  attrs: {
    module_id?: string;
    module_class?: string;
    background_color?: string;
    background_image?: string;
    parallax?: 'on' | 'off';
    parallax_method?: 'on' | 'off';
    custom_padding?: string;
    custom_margin?: string;
    fullwidth?: 'on' | 'off';
    specialty?: 'on' | 'off';
  };
  content: DiviRow[];
}

export interface DiviRow {
  type: 'row';
  attrs: {
    module_id?: string;
    module_class?: string;
    background_color?: string;
    custom_padding?: string;
    custom_margin?: string;
    column_structure?: string; // e.g., "1_2,1_2" or "1_3,1_3,1_3"
    use_custom_gutter?: 'on' | 'off';
    gutter_width?: string;
  };
  content: DiviColumn[];
}

export interface DiviColumn {
  type: 'column';
  attrs: {
    type?: string; // "1_2", "1_3", "1_4", "2_3", "3_4"
    specialty_columns?: number;
  };
  content: DiviModule[];
}

export interface DiviModule {
  type: string; // et_pb_text, et_pb_image, etc.
  attrs: Record<string, any>;
  content?: string;
  innerContent?: DiviModule[];
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

export interface DiviLayout {
  id: number;
  title: string;
  content: string;
  categories: string[];
  global?: boolean;
}

export interface GlobalPreset {
  id: string;
  title: string;
  module_type: string;
  settings: Record<string, any>;
}

export interface DiviGlobalColor {
  id: string;
  name: string;
  color: string;
  slug: string;
}

export interface DiviFontSettings {
  body_font: DiviFont;
  heading_font: DiviFont;
  body_font_size: string;
  body_line_height: string;
  h1_font: DiviFont;
  h2_font: DiviFont;
  h3_font: DiviFont;
  h4_font: DiviFont;
  h5_font: DiviFont;
  h6_font: DiviFont;
}

export interface DiviFont {
  font: string;
  weight: string;
  style: string;
  size?: string;
  line_height?: string;
  letter_spacing?: string;
}

export class DiviExporter {
  private moduleMap: Map<string, string> = new Map();

  constructor() {
    this.initializeModuleMap();
  }

  /**
   * Export components to Divi structure
   */
  export(
    components: ComponentInfo[],
    options?: {
      exportLayouts?: boolean;
      createGlobalPresets?: boolean;
      colorPalette?: ColorPalette;
      typographySystem?: TypographySystem;
      componentLibrary?: ComponentLibrary;
      templateParts?: TemplateParts;
      validateExport?: boolean;
      optimizeExport?: boolean;
    }
  ): DiviExport {
    const sections = this.convertToSections(components, options);
    const modules = this.extractAllModules(sections);
    const layouts = options?.componentLibrary
      ? this.convertLibraryToLayouts(options.componentLibrary)
      : options?.exportLayouts
      ? this.createLayouts(sections)
      : [];
    const globalPresets = options?.createGlobalPresets
      ? this.createGlobalPresets(modules)
      : undefined;
    const globalColors = options?.colorPalette
      ? this.convertColorPaletteToDivi(options.colorPalette)
      : undefined;
    const fontSettings = options?.typographySystem
      ? this.convertTypographyToDivi(options.typographySystem)
      : undefined;

    const templatePartsExport = options?.templateParts
      ? this.convertTemplatePartsToDivi(options.templateParts)
      : { header: undefined, footer: undefined };

    let result: DiviExport = {
      sections,
      modules,
      layouts,
      globalPresets,
      globalColors,
      fontSettings,
      header: templatePartsExport.header,
      footer: templatePartsExport.footer,
    };

    // Validate export
    if (options?.validateExport !== false) {
      const validation = validateExport(result);
      if (!validation.isValid) {
        console.warn('Divi export validation failed:', validation.errors);
      }
      if (validation.warnings.length > 0) {
        console.warn('Divi export warnings:', validation.warnings);
      }
    }

    // Optimize export
    if (options?.optimizeExport !== false) {
      result = optimizeExport(result);
    }

    return result;
  }

  /**
   * Initialize component to Divi module mapping
   */
  private initializeModuleMap(): void {
    // Text modules
    this.moduleMap.set('paragraph', 'et_pb_text');
    this.moduleMap.set('heading', 'et_pb_text');

    // Media modules
    this.moduleMap.set('image', 'et_pb_image');
    this.moduleMap.set('video', 'et_pb_video');
    this.moduleMap.set('gallery', 'et_pb_gallery');
    this.moduleMap.set('slider', 'et_pb_slider');
    this.moduleMap.set('audio', 'et_pb_audio');

    // Interactive modules
    this.moduleMap.set('button', 'et_pb_button');
    this.moduleMap.set('contact-form', 'et_pb_contact_form');
    this.moduleMap.set('search', 'et_pb_search');
    this.moduleMap.set('accordion', 'et_pb_accordion');
    this.moduleMap.set('tabs', 'et_pb_tabs');
    this.moduleMap.set('toggle', 'et_pb_toggle');

    // Layout modules
    this.moduleMap.set('sidebar', 'et_pb_sidebar');
    this.moduleMap.set('divider', 'et_pb_divider');
    this.moduleMap.set('code', 'et_pb_code');

    // Social modules
    this.moduleMap.set('social-media-follow', 'et_pb_social_media_follow');

    // Commerce modules
    this.moduleMap.set('pricing-table', 'et_pb_pricing_tables');
    this.moduleMap.set('testimonial', 'et_pb_testimonial');
    this.moduleMap.set('portfolio', 'et_pb_portfolio');
    this.moduleMap.set('filterable-portfolio', 'et_pb_filterable_portfolio');

    // WordPress modules
    this.moduleMap.set('blog', 'et_pb_blog');
    this.moduleMap.set('post-title', 'et_pb_post_title');
    this.moduleMap.set('comments', 'et_pb_comments');

    // Miscellaneous
    this.moduleMap.set('counter', 'et_pb_counter');
    this.moduleMap.set('number-counter', 'et_pb_number_counter');
    this.moduleMap.set('circle-counter', 'et_pb_circle_counter');
    this.moduleMap.set('countdown-timer', 'et_pb_countdown_timer');
    this.moduleMap.set('map', 'et_pb_map');
    this.moduleMap.set('blurb', 'et_pb_blurb');
    this.moduleMap.set('call-to-action', 'et_pb_cta');
  }

  /**
   * Convert components to Divi sections
   */
  private convertToSections(components: ComponentInfo[], options?: {
    colorPalette?: ColorPalette;
    typographySystem?: TypographySystem;
  }): DiviSection[] {
    const sections: DiviSection[] = [];
    let currentSection: DiviSection | null = null;

    for (const component of components) {
      if (this.isSectionComponent(component)) {
        if (currentSection) {
          sections.push(currentSection);
        }
        currentSection = this.createSection(component, options);
      } else if (currentSection) {
        this.addToSection(currentSection, component, options);
      } else {
        // Create implicit section
        currentSection = this.createDefaultSection();
        this.addToSection(currentSection, component, options);
      }
    }

    if (currentSection) {
      sections.push(currentSection);
    }

    return sections;
  }

  /**
   * Check if component should be a section
   */
  private isSectionComponent(component: ComponentInfo): boolean {
    const classes = (component.className || '').toLowerCase();
    const tag = component.tagName?.toLowerCase();

    return tag === 'section' ||
           classes.includes('section') ||
           classes.includes('hero') ||
           classes.includes('banner');
  }

  /**
   * Map entrance animation to Divi animation type
   */
  private mapEntranceAnimationToDivi(type: string): string {
    const mapping: Record<string, string> = {
      fadeIn: 'fade',
      slideInUp: 'slide',
      slideInDown: 'slide',
      slideInLeft: 'left',
      slideInRight: 'right',
      zoomIn: 'zoom',
      bounceIn: 'bounce',
      rotateIn: 'rotate',
      flipIn: 'flip',
    };

    return mapping[type] || 'fade';
  }

  /**
   * Create Divi section from component
   */
  private createSection(component: ComponentInfo, options?: {
    colorPalette?: ColorPalette;
    typographySystem?: TypographySystem;
  }): DiviSection {
    const attrs: DiviSection['attrs'] = {
      fullwidth: 'off',
      specialty: 'off',
    };

    if (component.id) {
      attrs.module_id = component.id;
    }

    if (component.className) {
      attrs.module_class = component.className;
    }

    if (component.styles?.backgroundColor) {
      attrs.background_color = String(component.styles.backgroundColor);
    }

    const bgImage = this.extractBackgroundImage(component);
    if (bgImage) {
      attrs.background_image = bgImage;
      attrs.parallax = 'off';
    }

    if (component.styles?.padding) {
      attrs.custom_padding = String(component.styles.padding);
    }

    if (component.styles?.margin) {
      attrs.custom_margin = String(component.styles.margin);
    }

    // Check if fullwidth
    const classes = (component.className || '').toLowerCase();
    if (classes.includes('fullwidth') || classes.includes('full-width')) {
      attrs.fullwidth = 'on';
    }

    return {
      type: 'section',
      attrs,
      content: component.children ? this.convertToRows(component.children) : [],
    };
  }

  /**
   * Create default section
   */
  private createDefaultSection(): DiviSection {
    return {
      type: 'section',
      attrs: {
        fullwidth: 'off',
        specialty: 'off',
      },
      content: [],
    };
  }

  /**
   * Add component to section
   */
  private addToSection(section: DiviSection, component: ComponentInfo): void {
    const row = this.createRow(component);
    section.content.push(row);
  }

  /**
   * Convert components to rows
   */
  private convertToRows(components: ComponentInfo[]): DiviRow[] {
    const rows: DiviRow[] = [];

    for (const component of components) {
      if (this.isRowComponent(component)) {
        rows.push(this.createRow(component));
      } else {
        // Wrap in default row
        const row = this.createDefaultRow();
        const column = this.createDefaultColumn();
        column.content.push(this.componentToModule(component));
        row.content.push(column);
        rows.push(row);
      }
    }

    return rows;
  }

  /**
   * Check if component is a row
   */
  private isRowComponent(component: ComponentInfo): boolean {
    const classes = (component.className || '').toLowerCase();
    return classes.includes('row') || classes.includes('container');
  }

  /**
   * Create row from component
   */
  private createRow(component: ComponentInfo): DiviRow {
    const columns = this.detectColumns(component);
    const structure = this.getColumnStructure(columns.length);

    const attrs: DiviRow['attrs'] = {
      column_structure: structure,
      use_custom_gutter: 'off',
    };

    if (component.id) {
      attrs.module_id = component.id;
    }

    if (component.className) {
      attrs.module_class = component.className;
    }

    if (component.styles?.backgroundColor) {
      attrs.background_color = String(component.styles.backgroundColor);
    }

    if (component.styles?.padding) {
      attrs.custom_padding = String(component.styles.padding);
    }

    const rowContent = columns.length > 0
      ? columns.map(col => this.createColumn(col))
      : [this.createDefaultColumn()];

    return {
      type: 'row',
      attrs,
      content: rowContent,
    };
  }

  /**
   * Create default row
   */
  private createDefaultRow(): DiviRow {
    return {
      type: 'row',
      attrs: {
        column_structure: '4_4',
      },
      content: [],
    };
  }

  /**
   * Detect columns in component
   */
  private detectColumns(component: ComponentInfo): ComponentInfo[] {
    if (!component.children) return [];

    const columns = component.children.filter(child => {
      const classes = (child.className || '').toLowerCase();
      return classes.includes('col') || classes.includes('column');
    });

    return columns.length > 0 ? columns : [];
  }

  /**
   * Get column structure notation
   */
  private getColumnStructure(columnCount: number): string {
    switch (columnCount) {
      case 1: return '4_4';
      case 2: return '1_2,1_2';
      case 3: return '1_3,1_3,1_3';
      case 4: return '1_4,1_4,1_4,1_4';
      default: return '4_4';
    }
  }

  /**
   * Create column from component
   */
  private createColumn(component: ComponentInfo): DiviColumn {
    const type = this.getColumnType(component);

    const modules = component.children
      ? component.children.map(child => this.componentToModule(child))
      : [];

    return {
      type: 'column',
      attrs: { type },
      content: modules,
    };
  }

  /**
   * Create default column
   */
  private createDefaultColumn(): DiviColumn {
    return {
      type: 'column',
      attrs: { type: '4_4' },
      content: [],
    };
  }

  /**
   * Get column type from component
   */
  private getColumnType(component: ComponentInfo): string {
    const classes = (component.className || '').toLowerCase();

    // Bootstrap-style columns
    if (classes.includes('col-6')) return '1_2';
    if (classes.includes('col-4')) return '1_3';
    if (classes.includes('col-3')) return '1_4';
    if (classes.includes('col-8')) return '2_3';
    if (classes.includes('col-9')) return '3_4';

    return '4_4'; // Full width
  }

  /**
   * Convert component to Divi module
   */
  private componentToModule(component: ComponentInfo, options?: {
    colorPalette?: ColorPalette;
    typographySystem?: TypographySystem;
  }): DiviModule {
    const moduleType = this.getModuleType(component);
    const attrs = this.extractModuleAttributes(component, moduleType, options);
    const content = this.getModuleContent(component, moduleType);

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
      type: moduleType,
      attrs,
      content,
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
   * Get Divi module type
   */
  private getModuleType(component: ComponentInfo): string {
    const type = component.componentType.toLowerCase();

    if (this.moduleMap.has(type)) {
      return this.moduleMap.get(type)!;
    }

    // Tag-based detection
    const tag = component.tagName?.toLowerCase();

    if (tag === 'img') return 'et_pb_image';
    if (tag === 'video') return 'et_pb_video';
    if (tag === 'button' || tag === 'a') return 'et_pb_button';
    if (tag === 'form') return 'et_pb_contact_form';
    if (tag?.match(/^h[1-6]$/)) return 'et_pb_text';
    if (tag === 'p') return 'et_pb_text';

    // Class-based detection
    const classes = (component.className || '').toLowerCase();
    if (classes.includes('blurb')) return 'et_pb_blurb';
    if (classes.includes('testimonial')) return 'et_pb_testimonial';
    if (classes.includes('pricing')) return 'et_pb_pricing_tables';
    if (classes.includes('cta')) return 'et_pb_cta';

    return 'et_pb_text'; // Default
  }

  /**
   * Extract module attributes
   */
  private extractModuleAttributes(component: ComponentInfo, moduleType: string, options?: {
    colorPalette?: ColorPalette;
    typographySystem?: TypographySystem;
  }): Record<string, any> {
    const attrs: Record<string, any> = {};

    // Common attributes
    if (component.id) attrs.module_id = component.id;
    if (component.className) attrs.module_class = component.className;

    // Advanced features integration into Divi attributes
    const responsiveSettings = extractResponsiveSettings(component);
    const hoverEffects = extractHoverEffects(component);
    const entranceAnimation = extractEntranceAnimation(component);
    const boxShadow = component.styles ? extractBoxShadow(component.styles) : undefined;
    const boxModel = component.styles ? extractBoxModel(component.styles) : undefined;

    // Responsive settings (Divi format: property_phone, property_tablet, property_last_edited)
    if (responsiveSettings.mobile) {
      if (responsiveSettings.mobile.fontSize) {
        attrs.font_size_phone = responsiveSettings.mobile.fontSize;
      }
      if (responsiveSettings.mobile.padding) {
        attrs.custom_padding_phone = responsiveSettings.mobile.padding;
      }
      if (responsiveSettings.mobile.margin) {
        attrs.custom_margin_phone = responsiveSettings.mobile.margin;
      }
    }

    if (responsiveSettings.tablet) {
      if (responsiveSettings.tablet.fontSize) {
        attrs.font_size_tablet = responsiveSettings.tablet.fontSize;
      }
      if (responsiveSettings.tablet.padding) {
        attrs.custom_padding_tablet = responsiveSettings.tablet.padding;
      }
      if (responsiveSettings.tablet.margin) {
        attrs.custom_margin_tablet = responsiveSettings.tablet.margin;
      }
    }

    // Mark as responsive if any responsive settings exist
    if (Object.keys(responsiveSettings).length > 0) {
      attrs.custom_padding_last_edited = 'on|desktop';
      attrs.custom_margin_last_edited = 'on|desktop';
    }

    // Hover effects
    if (hoverEffects) {
      if (hoverEffects.backgroundColor) {
        attrs.background_color_hover = hoverEffects.backgroundColor;
      }
      if (hoverEffects.transform) {
        attrs.transform_hover = hoverEffects.transform;
      }
      if (hoverEffects.boxShadow) {
        const shadowData = toDiviBoxShadow(hoverEffects.boxShadow);
        attrs.box_shadow_hover = shadowData;
      }
    }

    // Entrance animation (Divi calls this "animation")
    if (entranceAnimation) {
      attrs.animation = this.mapEntranceAnimationToDivi(entranceAnimation.type);
      attrs.animation_duration = `${entranceAnimation.duration}ms`;
      attrs.animation_delay = `${entranceAnimation.delay}ms`;
      attrs.animation_timing_function = entranceAnimation.easing;
    }

    // Box shadow
    if (boxShadow) {
      const shadowData = toDiviBoxShadow(boxShadow);
      if (shadowData) {
        attrs.box_shadow_style = shadowData.style;
        attrs.box_shadow_horizontal = shadowData.horizontal_offset;
        attrs.box_shadow_vertical = shadowData.vertical_offset;
        attrs.box_shadow_blur = shadowData.blur_strength;
        attrs.box_shadow_spread = shadowData.spread_strength;
        attrs.box_shadow_color = shadowData.color;
      }
    }

    // Box model
    if (boxModel) {
      if (boxModel.padding) {
        attrs.custom_padding = formatDimensionSet(boxModel.padding);
      }
      if (boxModel.margin) {
        attrs.custom_margin = formatDimensionSet(boxModel.margin);
      }
    }

    // Link colors to global colors
    if (options?.colorPalette) {
      const tokenRef = buildDesignTokenReferences(options.colorPalette, options.typographySystem);
      const tokens = linkToDesignTokens(component, tokenRef);

      // If color is linked to global color, reference it
      if (tokens.colorTokens.has('color')) {
        attrs.text_color_global = tokens.colorTokens.get('color');
      }
      if (tokens.colorTokens.has('backgroundColor')) {
        attrs.background_color_global = tokens.colorTokens.get('backgroundColor');
      }
    }

    // Module-specific attributes
    switch (moduleType) {
      case 'et_pb_text':
        if (component.styles?.color) attrs.text_color = component.styles.color;
        if (component.styles?.fontSize) attrs.text_font_size = component.styles.fontSize;
        if (component.styles?.textAlign) attrs.text_orientation = component.styles.textAlign;
        attrs.background_layout = 'light';
        break;

      case 'et_pb_image':
        attrs.src = component.attributes?.src || '';
        attrs.alt = component.attributes?.alt || '';
        attrs.title_text = component.attributes?.title || '';
        attrs.show_in_lightbox = 'off';
        attrs.url_new_window = 'off';
        attrs.use_overlay = 'off';
        attrs.align = 'center';
        attrs.force_fullwidth = 'off';
        attrs.always_center_on_mobile = 'on';
        break;

      case 'et_pb_button':
        attrs.button_text = component.textContent || 'Click Here';
        attrs.button_url = component.attributes?.href || '#';
        attrs.url_new_window = component.attributes?.target === '_blank' ? 'on' : 'off';
        attrs.button_alignment = 'center';
        if (component.styles?.backgroundColor) {
          attrs.button_bg_color = component.styles.backgroundColor;
        }
        if (component.styles?.color) {
          attrs.button_text_color = component.styles.color;
        }
        attrs.custom_button = 'off';
        break;

      case 'et_pb_blurb':
        attrs.title = this.extractBlurbTitle(component);
        attrs.url_new_window = 'off';
        attrs.use_icon = 'on';
        attrs.icon_placement = 'top';
        attrs.use_circle = 'off';
        attrs.use_circle_border = 'off';
        attrs.text_orientation = 'center';
        attrs.animation = 'top';
        attrs.background_layout = 'light';
        break;

      case 'et_pb_testimonial':
        attrs.author = this.extractTestimonialAuthor(component);
        attrs.job_title = '';
        attrs.company_name = '';
        attrs.url_new_window = 'off';
        attrs.portrait_url = '';
        attrs.quote_icon = 'on';
        attrs.use_background_color = 'on';
        attrs.background_layout = 'light';
        break;

      case 'et_pb_cta':
        attrs.title = this.extractCTATitle(component);
        attrs.button_text = 'Click Here';
        attrs.button_url = '#';
        attrs.url_new_window = 'off';
        attrs.use_background_color = 'on';
        attrs.background_layout = 'light';
        attrs.text_orientation = 'center';
        break;

      case 'et_pb_gallery':
        attrs.gallery_ids = '';
        attrs.posts_number = 10;
        attrs.show_title_and_caption = 'on';
        attrs.show_pagination = 'on';
        attrs.orientation = 'landscape';
        attrs.zoom_icon_color = '#ffffff';
        attrs.hover_overlay_color = 'rgba(255,255,255,0.9)';
        attrs.fullwidth = 'off';
        break;

      case 'et_pb_slider':
        attrs.show_arrows = 'on';
        attrs.show_pagination = 'on';
        attrs.auto = 'off';
        attrs.auto_speed = '7000';
        attrs.auto_ignore_hover = 'off';
        attrs.parallax = 'off';
        attrs.parallax_method = 'off';
        attrs.remove_inner_shadow = 'off';
        attrs.background_position = 'default';
        attrs.background_size = 'default';
        attrs.hide_content_on_mobile = 'off';
        attrs.hide_cta_on_mobile = 'off';
        attrs.show_image_video_mobile = 'off';
        break;

      case 'et_pb_accordion':
        attrs.open_toggle_text_color = '';
        attrs.open_toggle_background_color = '';
        attrs.closed_toggle_text_color = '';
        attrs.closed_toggle_background_color = '';
        attrs.icon_color = '';
        break;

      case 'et_pb_tabs':
        attrs.active_tab_background_color = '';
        attrs.inactive_tab_background_color = '';
        break;

      case 'et_pb_contact_form':
        attrs.captcha = 'on';
        attrs.email = '';
        attrs.title = 'Contact Us';
        attrs.success_message = 'Thanks for contacting us!';
        attrs.submit_button_text = 'Submit';
        attrs.use_redirect = 'off';
        break;
    }

    // Common design settings
    if (component.styles) {
      if (component.styles.backgroundColor) {
        attrs.background_color = component.styles.backgroundColor;
      }
      if (component.styles.padding) {
        attrs.custom_padding = component.styles.padding;
      }
      if (component.styles.margin) {
        attrs.custom_margin = component.styles.margin;
      }
    }

    return attrs;
  }

  /**
   * Get module content
   */
  private getModuleContent(component: ComponentInfo, moduleType: string): string {
    if (moduleType === 'et_pb_text') {
      return component.innerHTML || component.textContent || '';
    }

    if (moduleType === 'et_pb_blurb') {
      return this.extractBlurbContent(component);
    }

    if (moduleType === 'et_pb_testimonial') {
      return component.textContent || '';
    }

    if (moduleType === 'et_pb_cta') {
      return this.extractCTAContent(component);
    }

    return '';
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
   * Extract blurb title
   */
  private extractBlurbTitle(component: ComponentInfo): string {
    const heading = component.children?.find(c => c.tagName?.match(/^h[1-6]$/));
    return heading?.textContent || 'Title';
  }

  /**
   * Extract blurb content
   */
  private extractBlurbContent(component: ComponentInfo): string {
    const paragraph = component.children?.find(c => c.tagName === 'p');
    return paragraph?.textContent || '';
  }

  /**
   * Extract testimonial author
   */
  private extractTestimonialAuthor(component: ComponentInfo): string {
    const cite = component.children?.find(c => c.tagName === 'cite');
    return cite?.textContent || 'Author';
  }

  /**
   * Extract CTA title
   */
  private extractCTATitle(component: ComponentInfo): string {
    const heading = component.children?.find(c => c.tagName?.match(/^h[1-6]$/));
    return heading?.textContent || 'Call To Action';
  }

  /**
   * Extract CTA content
   */
  private extractCTAContent(component: ComponentInfo): string {
    const paragraph = component.children?.find(c => c.tagName === 'p');
    return paragraph?.innerHTML || '';
  }

  /**
   * Extract all modules from sections
   */
  private extractAllModules(sections: DiviSection[]): DiviModule[] {
    const modules: DiviModule[] = [];

    for (const section of sections) {
      for (const row of section.content) {
        for (const column of row.content) {
          modules.push(...column.content);
        }
      }
    }

    return modules;
  }

  /**
   * Convert Section 8 ComponentLibrary to Divi layouts
   */
  private convertLibraryToLayouts(library: ComponentLibrary): DiviLayout[] {
    const layouts: DiviLayout[] = [];
    let layoutId = 1;

    for (const template of library.templates) {
      if (template.reusabilityScore < 50) continue; // Only high-quality templates

      layouts.push({
        id: layoutId++,
        title: template.name,
        content: template.html,
        categories: [this.mapCategoryToDivi(template.category)],
        global: template.reusabilityScore >= 80, // Very high score = global
      });
    }

    return layouts;
  }

  /**
   * Map component library category to Divi category
   */
  private mapCategoryToDivi(category: string): string {
    const mapping: Record<string, string> = {
      headers: 'Header',
      footers: 'Footer',
      heroes: 'Hero',
      cards: 'Content',
      forms: 'Forms',
      ctas: 'CTA',
      galleries: 'Gallery',
      testimonials: 'Testimonials',
      pricing: 'Pricing',
      content: 'Content',
      navigation: 'Navigation',
      misc: 'Miscellaneous',
    };

    return mapping[category] || 'Content';
  }

  /**
   * Convert Section 8 TemplateParts to Divi header/footer layouts
   */
  private convertTemplatePartsToDivi(templateParts: TemplateParts): {
    header?: DiviLayout;
    footer?: DiviLayout;
  } {
    const result: { header?: DiviLayout; footer?: DiviLayout } = {};

    if (templateParts.header && templateParts.header.confidence >= 60) {
      result.header = {
        id: 9999,
        title: templateParts.header.name,
        content: templateParts.header.html,
        categories: ['Header'],
        global: true,
      };
    }

    if (templateParts.footer && templateParts.footer.confidence >= 60) {
      result.footer = {
        id: 9998,
        title: templateParts.footer.name,
        content: templateParts.footer.html,
        categories: ['Footer'],
        global: true,
      };
    }

    return result;
  }

  /**
   * Create Divi layouts
   */
  private createLayouts(sections: DiviSection[]): DiviLayout[] {
    const layouts: DiviLayout[] = [];

    // Create a layout from all sections
    layouts.push({
      id: 1,
      title: 'Converted Layout',
      content: this.serializeSections(sections),
      categories: ['Converted'],
      global: false,
    });

    return layouts;
  }

  /**
   * Create global presets
   */
  private createGlobalPresets(modules: DiviModule[]): GlobalPreset[] {
    const presets: GlobalPreset[] = [];
    const presetMap = new Map<string, DiviModule[]>();

    // Group modules by type
    for (const module of modules) {
      if (!presetMap.has(module.type)) {
        presetMap.set(module.type, []);
      }
      presetMap.get(module.type)!.push(module);
    }

    // Create preset for each module type with common settings
    let presetId = 1;
    for (const [type, moduleGroup] of presetMap) {
      if (moduleGroup.length >= 2) {
        const commonSettings = this.extractCommonSettings(moduleGroup);

        presets.push({
          id: `preset_${presetId}`,
          title: `${type} Preset`,
          module_type: type,
          settings: commonSettings,
        });

        presetId++;
      }
    }

    return presets;
  }

  /**
   * Extract common settings from modules
   */
  private extractCommonSettings(modules: DiviModule[]): Record<string, any> {
    if (modules.length === 0) return {};

    const first = modules[0].attrs;
    const common: Record<string, any> = {};

    for (const key in first) {
      const value = first[key];
      const allMatch = modules.every(m => m.attrs[key] === value);

      if (allMatch) {
        common[key] = value;
      }
    }

    return common;
  }

  /**
   * Convert Section 8 TypographySystem to Divi font settings
   */
  private convertTypographyToDivi(typography: TypographySystem): DiviFontSettings {
    // Get primary font (body)
    const bodyFontFamily = typography.fontFamilies.find(f =>
      f.contexts.some(c => c.type === 'body')
    ) || typography.fontFamilies[0];

    // Get heading font
    const headingFontFamily = typography.fontFamilies.find(f =>
      f.contexts.some(c => c.type === 'heading')
    ) || bodyFontFamily;

    // Create body font
    const bodyFont: DiviFont = {
      font: bodyFontFamily?.name || typography.globalSettings.baseFontFamily,
      weight: '400',
      style: 'normal',
    };

    // Create heading font
    const headingFont: DiviFont = {
      font: headingFontFamily?.name || typography.globalSettings.headingFontFamily || bodyFont.font,
      weight: String(typography.globalSettings.headingFontWeight || 700),
      style: 'normal',
    };

    // Helper function to create DiviFont from TextStyle
    const createDiviFont = (textStyle: any, defaultWeight: string = '400'): DiviFont => ({
      font: textStyle.fontFamily === 'inherit' ? bodyFont.font : textStyle.fontFamily,
      weight: String(textStyle.fontWeight || defaultWeight),
      style: 'normal',
      size: textStyle.fontSize,
      line_height: String(textStyle.lineHeight),
      letter_spacing: textStyle.letterSpacing,
    });

    return {
      body_font: bodyFont,
      heading_font: headingFont,
      body_font_size: `${typography.globalSettings.baseFontSize}px`,
      body_line_height: String(typography.globalSettings.baseLineHeight),
      h1_font: createDiviFont(typography.textStyles.h1, '700'),
      h2_font: createDiviFont(typography.textStyles.h2, '700'),
      h3_font: createDiviFont(typography.textStyles.h3, '600'),
      h4_font: createDiviFont(typography.textStyles.h4, '600'),
      h5_font: createDiviFont(typography.textStyles.h5, '500'),
      h6_font: createDiviFont(typography.textStyles.h6, '500'),
    };
  }

  /**
   * Convert Section 8 ColorPalette to Divi global colors
   */
  private convertColorPaletteToDivi(palette: ColorPalette): DiviGlobalColor[] {
    const colors: DiviGlobalColor[] = [];
    let colorId = 1;

    // Add primary colors
    palette.primary.forEach((color, i) => {
      colors.push({
        id: `gcid-${colorId++}`,
        name: `Primary ${i + 1}`,
        color: color.hex,
        slug: `primary-${i + 1}`,
      });
    });

    // Add secondary colors
    palette.secondary.forEach((color, i) => {
      colors.push({
        id: `gcid-${colorId++}`,
        name: `Secondary ${i + 1}`,
        color: color.hex,
        slug: `secondary-${i + 1}`,
      });
    });

    // Add accent colors
    palette.accent.forEach((color, i) => {
      colors.push({
        id: `gcid-${colorId++}`,
        name: `Accent ${i + 1}`,
        color: color.hex,
        slug: `accent-${i + 1}`,
      });
    });

    // Add neutral colors
    palette.neutral.forEach((color, i) => {
      colors.push({
        id: `gcid-${colorId++}`,
        name: `Neutral ${i + 1}`,
        color: color.hex,
        slug: `neutral-${i + 1}`,
      });
    });

    // Add semantic colors
    if (palette.semantic.success) {
      colors.push({
        id: `gcid-${colorId++}`,
        name: 'Success',
        color: palette.semantic.success.hex,
        slug: 'success',
      });
    }

    if (palette.semantic.warning) {
      colors.push({
        id: `gcid-${colorId++}`,
        name: 'Warning',
        color: palette.semantic.warning.hex,
        slug: 'warning',
      });
    }

    if (palette.semantic.error) {
      colors.push({
        id: `gcid-${colorId++}`,
        name: 'Error',
        color: palette.semantic.error.hex,
        slug: 'error',
      });
    }

    if (palette.semantic.info) {
      colors.push({
        id: `gcid-${colorId++}`,
        name: 'Info',
        color: palette.semantic.info.hex,
        slug: 'info',
      });
    }

    return colors;
  }

  /**
   * Serialize sections to shortcode format
   */
  private serializeSections(sections: DiviSection[]): string {
    return sections.map(section => this.serializeSection(section)).join('\n');
  }

  /**
   * Serialize single section
   */
  private serializeSection(section: DiviSection): string {
    const attrs = this.serializeAttributes(section.attrs);
    const rows = section.content.map(row => this.serializeRow(row)).join('\n');

    return `[et_pb_section${attrs}]\n${rows}\n[/et_pb_section]`;
  }

  /**
   * Serialize row
   */
  private serializeRow(row: DiviRow): string {
    const attrs = this.serializeAttributes(row.attrs);
    const columns = row.content.map(col => this.serializeColumn(col)).join('\n');

    return `[et_pb_row${attrs}]\n${columns}\n[/et_pb_row]`;
  }

  /**
   * Serialize column
   */
  private serializeColumn(column: DiviColumn): string {
    const attrs = this.serializeAttributes(column.attrs);
    const modules = column.content.map(mod => this.serializeModule(mod)).join('\n');

    return `[et_pb_column${attrs}]\n${modules}\n[/et_pb_column]`;
  }

  /**
   * Serialize module
   */
  private serializeModule(module: DiviModule): string {
    const attrs = this.serializeAttributes(module.attrs);
    const content = module.content || '';

    if (content) {
      return `[${module.type}${attrs}]${content}[/${module.type}]`;
    } else {
      return `[${module.type}${attrs}][/${module.type}]`;
    }
  }

  /**
   * Serialize attributes to shortcode format
   */
  private serializeAttributes(attrs: Record<string, any>): string {
    const parts: string[] = [];

    for (const [key, value] of Object.entries(attrs)) {
      if (value !== undefined && value !== null && value !== '') {
        parts.push(`${key}="${value}"`);
      }
    }

    return parts.length > 0 ? ' ' + parts.join(' ') : '';
  }

  /**
   * Export to Divi Library JSON
   */
  exportToJSON(components: ComponentInfo[]): string {
    const diviExport = this.export(components, {
      exportLayouts: true,
      createGlobalPresets: true,
    });

    return JSON.stringify(diviExport, null, 2);
  }

  /**
   * Export to post content (shortcodes)
   */
  exportToPostContent(components: ComponentInfo[]): string {
    const sections = this.convertToSections(components);
    return this.serializeSections(sections);
  }

  /**
   * Create specialized icon module from icon widget
   */
  createIconModule(iconWidget: IconWidget): DiviModule {
    return {
      type: 'et_pb_blurb',
      attrs: {
        use_icon: 'on',
        icon_placement: 'top',
        font_icon: iconWidget.icon,
        icon_color: iconWidget.color,
        custom_margin: `${iconWidget.spacing?.top || 0}px|${iconWidget.spacing?.right || 0}px|${iconWidget.spacing?.bottom || 0}px|${iconWidget.spacing?.left || 0}px`,
        url: iconWidget.link || '',
        url_new_window: iconWidget.linkTarget === '_blank' ? 'on' : 'off',
      },
      content: '',
    };
  }

  /**
   * Create specialized gallery module from gallery widget
   */
  createGalleryModule(galleryWidget: GalleryWidget): DiviModule {
    const galleryIds = galleryWidget.images.map((img, i) => i + 1).join(',');

    return {
      type: 'et_pb_gallery',
      attrs: {
        gallery_ids: galleryIds,
        posts_number: galleryWidget.images.length,
        show_title_and_caption: galleryWidget.captions ? 'on' : 'off',
        show_pagination: 'on',
        orientation: galleryWidget.aspectRatio === '1:1' ? 'square' : 'landscape',
        zoom_icon_color: '#ffffff',
        hover_overlay_color: 'rgba(255,255,255,0.9)',
        fullwidth: 'off',
        columns: typeof galleryWidget.columns === 'number' ? galleryWidget.columns : galleryWidget.columns.desktop,
      },
      content: '',
    };
  }

  /**
   * Create specialized slider module from carousel widget
   */
  createSliderModule(carouselWidget: CarouselWidget): DiviModule {
    return {
      type: 'et_pb_slider',
      attrs: {
        show_arrows: carouselWidget.arrows ? 'on' : 'off',
        show_pagination: carouselWidget.dots ? 'on' : 'off',
        auto: carouselWidget.autoplay ? 'on' : 'off',
        auto_speed: `${carouselWidget.autoplaySpeed || 7000}`,
        auto_ignore_hover: carouselWidget.pauseOnHover ? 'off' : 'on',
        parallax: 'off',
        parallax_method: 'off',
      },
      content: '',
    };
  }

  /**
   * Create specialized testimonial module from testimonial widget
   */
  createTestimonialModule(testimonialWidget: TestimonialWidget): DiviModule {
    const testimonial = testimonialWidget.testimonials[0]; // Use first testimonial

    return {
      type: 'et_pb_testimonial',
      attrs: {
        author: testimonial?.authorName || 'Author',
        job_title: testimonial?.authorTitle || '',
        company_name: '',
        portrait_url: testimonial?.authorImage || '',
        quote_icon: 'on',
        use_background_color: 'on',
        background_layout: 'light',
      },
      content: testimonial?.content || '',
    };
  }

  /**
   * Create specialized pricing table module from pricing table widget
   */
  createPricingTableModule(pricingTableWidget: PricingTableWidget): DiviModule {
    return {
      type: 'et_pb_pricing_tables',
      attrs: {
        show_bullet: 'on',
        center_list_items: 'off',
        use_background_color: 'on',
        background_layout: 'light',
        header_background_color: '#ffffff',
        header_text_color: '#000000',
      },
      content: '',
    };
  }

  /**
   * Auto-detect and create specialized widgets from component
   */
  createSpecializedWidget(component: ComponentInfo): DiviModule | null {
    // Try icon widget
    const iconWidget = extractIconWidget(component);
    if (iconWidget) {
      return this.createIconModule(iconWidget);
    }

    // Try gallery widget
    const galleryWidget = extractGalleryWidget(component);
    if (galleryWidget) {
      return this.createGalleryModule(galleryWidget);
    }

    // Try carousel widget
    const carouselWidget = extractCarouselWidget(component);
    if (carouselWidget) {
      return this.createSliderModule(carouselWidget);
    }

    // Try testimonial widget
    const testimonialWidget = extractTestimonialWidget(component);
    if (testimonialWidget) {
      return this.createTestimonialModule(testimonialWidget);
    }

    // Try pricing table widget
    const pricingTableWidget = extractPricingTableWidget(component);
    if (pricingTableWidget) {
      return this.createPricingTableModule(pricingTableWidget);
    }

    return null;
  }
}

/**
 * Helper function for quick export
 */
export function exportToDivi(
  components: ComponentInfo[],
  options?: {
    exportLayouts?: boolean;
    createGlobalPresets?: boolean;
  }
): DiviExport {
  const exporter = new DiviExporter();
  return exporter.export(components, options);
}
