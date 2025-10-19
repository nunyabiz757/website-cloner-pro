/**
 * Oxygen Builder Exporter
 *
 * Complete mapping system for Oxygen Builder:
 * - Component mapping (40+ components)
 * - Structure tree export
 * - Advanced styling system
 * - Conditions and dynamic data
 * - Template and reusable parts export
 */

import type { ComponentInfo } from '../types/builder.types.js';
import type { ColorPalette } from '../analyzer/color-palette-extractor.js';
import type { TypographySystem } from '../analyzer/typography-extractor.js';
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
import {
  extractBoxShadow,
  toOxygenBoxShadow,
  type ParsedBoxShadow,
} from '../utils/box-shadow-parser.js';

export interface OxygenExport {
  tree: OxygenComponent[];
  classes: OxygenClass[];
  stylesheets: OxygenStylesheet[];
  reusableBlocks: OxygenReusableBlock[];
  templates: OxygenTemplate[];
  colorClasses?: OxygenColorClass[];
  typography?: OxygenTypography;
}

export interface OxygenComponent {
  id: number;
  name: string;
  options: Record<string, any>;
  children?: OxygenComponent[];
  classes?: string[];
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

export interface OxygenClass {
  key: string;
  original: Record<string, any>;
  media?: Record<string, Record<string, any>>;
}

export interface OxygenStylesheet {
  id: string;
  name: string;
  parent: string;
  styles: Record<string, any>;
}

export interface OxygenReusableBlock {
  id: number;
  name: string;
  type: string;
  content: OxygenComponent[];
}

export interface OxygenTemplate {
  id: number;
  name: string;
  type: 'single' | 'archive' | 'page' | 'header' | 'footer';
  content: OxygenComponent[];
  conditions?: any[];
}

export interface OxygenColorClass {
  className: string;
  color: string;
  name: string;
}

export interface OxygenTypography {
  global_settings: {
    base_font_family: string;
    base_font_size: string;
    base_line_height: string;
    base_color: string;
    heading_font_family: string;
    heading_font_weight: string;
    heading_color?: string;
  };
  selectors: {
    h1: OxygenTypographyRule;
    h2: OxygenTypographyRule;
    h3: OxygenTypographyRule;
    h4: OxygenTypographyRule;
    h5: OxygenTypographyRule;
    h6: OxygenTypographyRule;
    p: OxygenTypographyRule;
    a: OxygenTypographyRule;
  };
}

export interface OxygenTypographyRule {
  'font-family'?: string;
  'font-size': string;
  'font-weight': string;
  'line-height': string;
  'letter-spacing'?: string;
  color?: string;
}

export class OxygenExporter {
  private componentMap: Map<string, string> = new Map();
  private idCounter: number = 0;
  private classes: Map<string, OxygenClass> = new Map();

  constructor() {
    this.initializeComponentMap();
  }

  /**
   * Export to Oxygen format
   */
  export(
    components: ComponentInfo[],
    options?: {
      colorPalette?: ColorPalette;
      typographySystem?: TypographySystem;
      validateExport?: boolean;
      optimizeExport?: boolean;
    }
  ): OxygenExport {
    this.idCounter = 0;
    this.classes.clear();

    const tree = this.convertToTree(components, options);
    const classes = Array.from(this.classes.values());
    const stylesheets = this.generateStylesheets(components);
    const reusableBlocks = this.extractReusableBlocks(components);
    const templates = this.createTemplates(tree);
    const colorClasses = options?.colorPalette
      ? this.convertColorPaletteToOxygen(options.colorPalette)
      : undefined;
    const typography = options?.typographySystem
      ? this.convertTypographyToOxygen(options.typographySystem)
      : undefined;

    let result: OxygenExport = {
      tree,
      classes,
      stylesheets,
      reusableBlocks,
      templates,
      colorClasses,
      typography,
    };

    // Validate export
    if (options?.validateExport !== false) {
      const validation = validateExport(result);
      if (!validation.isValid) {
        console.warn('Oxygen export validation failed:', validation.errors);
      }
      if (validation.warnings.length > 0) {
        console.warn('Oxygen export warnings:', validation.warnings);
      }
    }

    // Optimize export
    if (options?.optimizeExport !== false) {
      result = optimizeExport(result);
    }

    return result;
  }

  /**
   * Initialize component mapping
   */
  private initializeComponentMap(): void {
    // Structure
    this.componentMap.set('section', 'ct_section');
    this.componentMap.set('div', 'ct_div_block');
    this.componentMap.set('link-wrapper', 'ct_link');

    // Text
    this.componentMap.set('heading', 'ct_headline');
    this.componentMap.set('text', 'ct_text_block');
    this.componentMap.set('rich-text', 'ct_rich_text');

    // Media
    this.componentMap.set('image', 'ct_image');
    this.componentMap.set('video', 'ct_video');
    this.componentMap.set('icon', 'ct_fancy_icon');
    this.componentMap.set('svg', 'ct_svg');

    // Interactive
    this.componentMap.set('button', 'oxy_button');
    this.componentMap.set('link', 'ct_link_text');

    // Code
    this.componentMap.set('code-block', 'ct_code_block');
    this.componentMap.set('shortcode', 'ct_shortcode');

    // WordPress
    this.componentMap.set('post-title', 'oxy-post-title');
    this.componentMap.set('post-content', 'oxy-post-content');
    this.componentMap.set('post-meta', 'oxy-post-meta-data');
    this.componentMap.set('post-featured-image', 'oxy-featured-image');
    this.componentMap.set('comments', 'oxy-comments');

    // Navigation
    this.componentMap.set('menu', 'oxy-nav-menu');

    // Layout
    this.componentMap.set('slider', 'oxy-easy-posts');
    this.componentMap.set('tabs', 'oxy-tabs');
    this.componentMap.set('accordion', 'oxy-accordion');
    this.componentMap.set('modal', 'oxy-modal');

    // Advanced
    this.componentMap.set('repeater', 'oxy-posts-grid');
    this.componentMap.set('gallery', 'oxy-gallery');
    this.componentMap.set('map', 'oxy-map');
    this.componentMap.set('progress-bar', 'oxy-progress-bar');
    this.componentMap.set('counter', 'oxy-counter');
    this.componentMap.set('slider-builder', 'oxy-slider-builder');

    // Pro
    this.componentMap.set('header-builder', 'oxy-header-builder');
    this.componentMap.set('content-timeline', 'oxy-content-timeline');
    this.componentMap.set('pricing-box', 'oxy-pricing-box');
    this.componentMap.set('login-form', 'oxy-login-form');
    this.componentMap.set('search-form', 'oxy-search-form');
  }

  /**
   * Convert to Oxygen tree
   */
  private convertToTree(components: ComponentInfo[], options?: {
    colorPalette?: ColorPalette;
    typographySystem?: TypographySystem;
  }): OxygenComponent[] {
    return components.map(comp => this.componentToOxygen(comp, options));
  }

  /**
   * Convert component to Oxygen format
   */
  private componentToOxygen(component: ComponentInfo, options?: {
    colorPalette?: ColorPalette;
    typographySystem?: TypographySystem;
  }): OxygenComponent {
    const id = ++this.idCounter;
    const name = this.getComponentName(component);
    const componentOptions = this.extractOptions(component, name, options);
    const classes = this.extractClasses(component);

    const children = component.children
      ? this.convertToTree(component.children, options)
      : undefined;

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
      id,
      name,
      options: componentOptions,
      classes: classes.length > 0 ? classes : undefined,
      children,
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
   * Get component name
   */
  private getComponentName(component: ComponentInfo): string {
    const type = component.componentType.toLowerCase();

    if (this.componentMap.has(type)) {
      return this.componentMap.get(type)!;
    }

    const tag = component.tagName?.toLowerCase();
    const classes = (component.className || '').toLowerCase();

    // Structure
    if (tag === 'section') return 'ct_section';
    if (tag === 'div') return 'ct_div_block';

    // Text
    if (tag?.match(/^h[1-6]$/)) return 'ct_headline';
    if (tag === 'p') return 'ct_text_block';

    // Media
    if (tag === 'img') return 'ct_image';
    if (tag === 'video') return 'ct_video';

    // Interactive
    if (tag === 'button') return 'oxy_button';
    if (tag === 'a') return 'ct_link_text';

    // Navigation
    if (tag === 'nav') return 'oxy-nav-menu';

    return 'ct_div_block';
  }

  /**
   * Map entrance animation to Oxygen animation type
   */
  private mapEntranceAnimationToOxygen(type: string): string {
    const mapping: Record<string, string> = {
      fadeIn: 'fade-in',
      slideInUp: 'slide-in-up',
      slideInDown: 'slide-in-down',
      slideInLeft: 'slide-in-left',
      slideInRight: 'slide-in-right',
      zoomIn: 'zoom-in',
      bounceIn: 'bounce-in',
      rotateIn: 'rotate-in',
      flipIn: 'flip-in',
    };

    return mapping[type] || 'fade-in';
  }

  /**
   * Extract options
   */
  private extractOptions(component: ComponentInfo, componentName: string, optionsParam?: {
    colorPalette?: ColorPalette;
    typographySystem?: TypographySystem;
  }): Record<string, any> {
    const options: Record<string, any> = {};

    // Common options
    if (component.id) {
      options.selector = component.id;
    }

    // Advanced features integration into Oxygen options
    const responsiveSettings = extractResponsiveSettings(component);
    const hoverEffects = extractHoverEffects(component);
    const entranceAnimation = extractEntranceAnimation(component);
    const motionEffects = extractMotionEffects(component);
    const boxShadow = component.styles ? extractBoxShadow(component.styles) : undefined;
    const boxModel = component.styles ? extractBoxModel(component.styles) : undefined;

    // Responsive settings (Oxygen format: property-breakpoint)
    if (responsiveSettings.mobile || responsiveSettings.tablet) {
      if (responsiveSettings.mobile) {
        if (responsiveSettings.mobile.fontSize) {
          options['font-size-mobile'] = responsiveSettings.mobile.fontSize;
        }
        if (responsiveSettings.mobile.padding) {
          options['padding-mobile'] = responsiveSettings.mobile.padding;
        }
        if (responsiveSettings.mobile.margin) {
          options['margin-mobile'] = responsiveSettings.mobile.margin;
        }
        if (responsiveSettings.mobile.display === 'none') {
          options['hide-mobile'] = 'true';
        }
      }

      if (responsiveSettings.tablet) {
        if (responsiveSettings.tablet.fontSize) {
          options['font-size-tablet'] = responsiveSettings.tablet.fontSize;
        }
        if (responsiveSettings.tablet.padding) {
          options['padding-tablet'] = responsiveSettings.tablet.padding;
        }
        if (responsiveSettings.tablet.margin) {
          options['margin-tablet'] = responsiveSettings.tablet.margin;
        }
        if (responsiveSettings.tablet.display === 'none') {
          options['hide-tablet'] = 'true';
        }
      }
    }

    // Hover effects (Oxygen format: property-hover)
    if (hoverEffects) {
      if (hoverEffects.backgroundColor) {
        options['background-color-hover'] = hoverEffects.backgroundColor;
      }
      if (hoverEffects.color) {
        options['color-hover'] = hoverEffects.color;
      }
      if (hoverEffects.transform) {
        options['transform-hover'] = hoverEffects.transform;
      }
      if (hoverEffects.boxShadow) {
        const shadowData = toOxygenBoxShadow(hoverEffects.boxShadow);
        if (shadowData) {
          Object.keys(shadowData).forEach(key => {
            options[`${key}-hover`] = shadowData[key];
          });
        }
      }
      if (hoverEffects.transition) {
        options.transition = `${hoverEffects.transition.property} ${hoverEffects.transition.duration} ${hoverEffects.transition.timingFunction}`;
      }
    }

    // Entrance animation (Oxygen format: animation-name, animation-duration, etc.)
    if (entranceAnimation) {
      options['animation-name'] = this.mapEntranceAnimationToOxygen(entranceAnimation.type);
      options['animation-duration'] = `${entranceAnimation.duration}ms`;
      options['animation-delay'] = `${entranceAnimation.delay}ms`;
      options['animation-timing-function'] = entranceAnimation.easing;
    }

    // Motion effects (scroll effects in Oxygen)
    if (motionEffects?.scrollEffects && motionEffects.scrollEffects.length > 0) {
      const scrollEffect = motionEffects.scrollEffects[0];
      options['scroll-effect-type'] = scrollEffect.type;
      options['scroll-effect-direction'] = scrollEffect.direction;
      options['scroll-effect-speed'] = scrollEffect.speed;
    }

    // Sticky positioning
    if (motionEffects?.stickyEffects?.enabled) {
      options.position = 'sticky';
      options.top = motionEffects.stickyEffects.top;
      options.bottom = motionEffects.stickyEffects.bottom;
    }

    // Box shadow
    if (boxShadow) {
      const shadowData = toOxygenBoxShadow(boxShadow);
      if (shadowData) {
        Object.assign(options, shadowData);
      }
    }

    // Box model
    if (boxModel) {
      if (boxModel.padding) {
        options['padding-top'] = boxModel.padding.top ? `${boxModel.padding.top.value}${boxModel.padding.top.unit}` : undefined;
        options['padding-bottom'] = boxModel.padding.bottom ? `${boxModel.padding.bottom.value}${boxModel.padding.bottom.unit}` : undefined;
        options['padding-left'] = boxModel.padding.left ? `${boxModel.padding.left.value}${boxModel.padding.left.unit}` : undefined;
        options['padding-right'] = boxModel.padding.right ? `${boxModel.padding.right.value}${boxModel.padding.right.unit}` : undefined;
      }
      if (boxModel.margin) {
        options['margin-top'] = boxModel.margin.top ? `${boxModel.margin.top.value}${boxModel.margin.top.unit}` : undefined;
        options['margin-bottom'] = boxModel.margin.bottom ? `${boxModel.margin.bottom.value}${boxModel.margin.bottom.unit}` : undefined;
      }
    }

    // Link colors to color classes
    if (optionsParam?.colorPalette) {
      const tokenRef = buildDesignTokenReferences(optionsParam.colorPalette, optionsParam.typographySystem);
      const tokens = linkToDesignTokens(component, tokenRef);

      if (tokens.colorTokens.has('color')) {
        options['color-class'] = tokens.colorTokens.get('color');
      }
      if (tokens.colorTokens.has('backgroundColor')) {
        options['background-color-class'] = tokens.colorTokens.get('backgroundColor');
      }
    }

    // Component-specific options
    switch (componentName) {
      case 'ct_headline':
        options.tag = component.tagName || 'h2';
        options.ct_content = component.textContent || '';
        break;

      case 'ct_text_block':
        options.ct_content = component.textContent || '';
        break;

      case 'ct_rich_text':
        options.ct_content = component.innerHTML || '';
        break;

      case 'ct_image':
        options.attachment_url = component.attributes?.src || '';
        options.attachment_id = '';
        options.alt = component.attributes?.alt || '';
        options.caption = '';
        options.src = component.attributes?.src || '';
        break;

      case 'oxy_button':
        options.button_text = component.textContent || 'Button';
        options.button_link = component.attributes?.href || '#';
        options.button_size = 'medium';
        options.button_style = 'primary';
        options.button_target = component.attributes?.target || '_self';
        break;

      case 'ct_link_text':
      case 'ct_link':
        options.url = component.attributes?.href || '#';
        options.target = component.attributes?.target || '_self';
        options.text = component.textContent || 'Link';
        break;

      case 'oxy-nav-menu':
        options.menu = '';
        options.direction = 'horizontal';
        options.dropdown_arrow = 'true';
        options.mobile_icon = 'true';
        break;

      case 'ct_section':
        options.section_width = 'page-width';
        break;

      case 'oxy-post-title':
        options.tag = 'h1';
        break;

      case 'oxy-featured-image':
        options.size = 'large';
        break;

      case 'oxy-posts-grid':
        options.post_type = 'post';
        options.count = 10;
        options.columns = 3;
        options.pagination = 'off';
        break;

      case 'oxy-easy-posts':
        options.post_type = 'post';
        options.count = 5;
        options.slideshow_type = 'carousel';
        options.transition = 'fade';
        break;

      case 'oxy-tabs':
        options.active_tab = 1;
        options.horizontal_vertical = 'horizontal';
        break;

      case 'oxy-accordion':
        options.initial_open = 1;
        options.toggle_all = 'off';
        break;

      case 'oxy-modal':
        options.trigger_type = 'click';
        options.close_button = 'true';
        break;

      case 'oxy-map':
        options.address = '';
        options.zoom = 14;
        options.height = 400;
        break;

      case 'oxy-progress-bar':
        options.percent = 75;
        options.show_percent = 'true';
        break;

      case 'oxy-counter':
        options.start_number = 0;
        options.end_number = 100;
        options.duration = 2000;
        break;

      case 'oxy-pricing-box':
        options.title = 'Pricing Plan';
        options.price = '$99';
        options.period = 'month';
        options.button_text = 'Buy Now';
        break;

      case 'oxy-search-form':
        options.placeholder = 'Search...';
        options.button_text = 'Search';
        break;

      case 'ct_code_block':
        options.code = component.innerHTML || '';
        break;

      case 'ct_shortcode':
        options.shortcode = '';
        break;
    }

    // Extract styling options
    if (component.styles) {
      // Background
      if (component.styles.backgroundColor) {
        options['background-color'] = component.styles.backgroundColor;
      }

      const bgImage = this.extractBackgroundImage(component);
      if (bgImage) {
        options['background-image'] = bgImage;
      }

      // Typography
      if (component.styles.color) {
        options.color = component.styles.color;
      }
      if (component.styles.fontSize) {
        options['font-size'] = component.styles.fontSize;
      }
      if (component.styles.fontFamily) {
        options['font-family'] = component.styles.fontFamily;
      }
      if (component.styles.fontWeight) {
        options['font-weight'] = component.styles.fontWeight;
      }
      if (component.styles.textAlign) {
        options['text-align'] = component.styles.textAlign;
      }

      // Spacing
      if (component.styles.padding) {
        options.padding = component.styles.padding;
      }
      if (component.styles.margin) {
        options.margin = component.styles.margin;
      }

      // Dimensions
      if (component.styles.width) {
        options.width = component.styles.width;
      }
      if (component.styles.height) {
        options.height = component.styles.height;
      }

      // Flexbox
      if (component.styles.display === 'flex') {
        options.display = 'flex';
        if (component.styles.flexDirection) {
          options['flex-direction'] = component.styles.flexDirection;
        }
        if (component.styles.justifyContent) {
          options['justify-content'] = component.styles.justifyContent;
        }
        if (component.styles.alignItems) {
          options['align-items'] = component.styles.alignItems;
        }
      }

      // Grid
      if (component.styles.display === 'grid') {
        options.display = 'grid';
        if (component.styles.gridTemplateColumns) {
          options['grid-template-columns'] = component.styles.gridTemplateColumns;
        }
        if (component.styles.gap) {
          options.gap = component.styles.gap;
        }
      }

      // Border
      if (component.styles.borderRadius) {
        options['border-radius'] = component.styles.borderRadius;
      }
      if (component.styles.border) {
        options.border = component.styles.border;
      }
    }

    return options;
  }

  /**
   * Extract classes
   */
  private extractClasses(component: ComponentInfo): string[] {
    if (!component.className) return [];

    const classes = component.className.split(' ').filter(c => c.trim());

    // Create class definitions
    for (const className of classes) {
      if (!this.classes.has(className) && component.styles) {
        this.classes.set(className, {
          key: className,
          original: component.styles,
          media: {},
        });
      }
    }

    return classes;
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
   * Generate stylesheets
   */
  private generateStylesheets(components: ComponentInfo[]): OxygenStylesheet[] {
    const stylesheets: OxygenStylesheet[] = [];

    // Create main stylesheet
    stylesheets.push({
      id: 'main',
      name: 'Main Stylesheet',
      parent: '',
      styles: this.extractAllStyles(components),
    });

    return stylesheets;
  }

  /**
   * Extract all styles
   */
  private extractAllStyles(components: ComponentInfo[]): Record<string, any> {
    const allStyles: Record<string, any> = {};

    for (const component of components) {
      if (component.styles) {
        Object.assign(allStyles, component.styles);
      }

      if (component.children) {
        Object.assign(allStyles, this.extractAllStyles(component.children));
      }
    }

    return allStyles;
  }

  /**
   * Extract reusable blocks
   */
  private extractReusableBlocks(components: ComponentInfo[]): OxygenReusableBlock[] {
    const reusableBlocks: OxygenReusableBlock[] = [];

    // Find components that appear multiple times
    const componentMap = new Map<string, ComponentInfo[]>();

    for (const component of components) {
      const signature = `${component.componentType}:${component.tagName}`;
      if (!componentMap.has(signature)) {
        componentMap.set(signature, []);
      }
      componentMap.get(signature)!.push(component);
    }

    let id = 1;
    for (const [signature, comps] of componentMap) {
      if (comps.length >= 2) {
        reusableBlocks.push({
          id: id++,
          name: `Reusable ${signature}`,
          type: signature,
          content: [this.componentToOxygen(comps[0])],
        });
      }
    }

    return reusableBlocks;
  }

  /**
   * Create templates
   */
  private createTemplates(tree: OxygenComponent[]): OxygenTemplate[] {
    return [{
      id: 1,
      name: 'Converted Template',
      type: 'page',
      content: tree,
      conditions: [],
    }];
  }

  /**
   * Convert Section 8 TypographySystem to Oxygen typography
   */
  private convertTypographyToOxygen(typography: TypographySystem): OxygenTypography {
    const bodyFont = typography.fontFamilies.find(f =>
      f.contexts.some(c => c.type === 'body')
    ) || typography.fontFamilies[0];

    const headingFont = typography.fontFamilies.find(f =>
      f.contexts.some(c => c.type === 'heading')
    ) || bodyFont;

    const createTypographyRule = (textStyle: any): OxygenTypographyRule => ({
      'font-family': textStyle.fontFamily !== 'inherit' ? textStyle.fontFamily : undefined,
      'font-size': textStyle.fontSize,
      'font-weight': String(textStyle.fontWeight),
      'line-height': String(textStyle.lineHeight),
      'letter-spacing': textStyle.letterSpacing,
      color: textStyle.color,
    });

    return {
      global_settings: {
        base_font_family: bodyFont?.name || typography.globalSettings.baseFontFamily,
        base_font_size: `${typography.globalSettings.baseFontSize}px`,
        base_line_height: String(typography.globalSettings.baseLineHeight),
        base_color: typography.globalSettings.baseColor,
        heading_font_family: headingFont?.name || typography.globalSettings.headingFontFamily || bodyFont?.name || 'sans-serif',
        heading_font_weight: String(typography.globalSettings.headingFontWeight || 700),
        heading_color: typography.globalSettings.headingColor,
      },
      selectors: {
        h1: createTypographyRule(typography.textStyles.h1),
        h2: createTypographyRule(typography.textStyles.h2),
        h3: createTypographyRule(typography.textStyles.h3),
        h4: createTypographyRule(typography.textStyles.h4),
        h5: createTypographyRule(typography.textStyles.h5),
        h6: createTypographyRule(typography.textStyles.h6),
        p: createTypographyRule(typography.textStyles.body),
        a: createTypographyRule(typography.textStyles.link),
      },
    };
  }

  /**
   * Convert Section 8 ColorPalette to Oxygen color classes
   */
  private convertColorPaletteToOxygen(palette: ColorPalette): OxygenColorClass[] {
    const colorClasses: OxygenColorClass[] = [];

    // Add primary colors
    palette.primary.forEach((color, i) => {
      colorClasses.push({
        className: `color-primary-${i + 1}`,
        color: color.hex,
        name: `Primary ${i + 1}`,
      });
    });

    // Add secondary colors
    palette.secondary.forEach((color, i) => {
      colorClasses.push({
        className: `color-secondary-${i + 1}`,
        color: color.hex,
        name: `Secondary ${i + 1}`,
      });
    });

    // Add accent colors
    palette.accent.forEach((color, i) => {
      colorClasses.push({
        className: `color-accent-${i + 1}`,
        color: color.hex,
        name: `Accent ${i + 1}`,
      });
    });

    // Add neutral colors
    palette.neutral.forEach((color, i) => {
      colorClasses.push({
        className: `color-neutral-${i + 1}`,
        color: color.hex,
        name: `Neutral ${i + 1}`,
      });
    });

    // Add semantic colors
    if (palette.semantic.success) {
      colorClasses.push({
        className: 'color-success',
        color: palette.semantic.success.hex,
        name: 'Success',
      });
    }

    if (palette.semantic.warning) {
      colorClasses.push({
        className: 'color-warning',
        color: palette.semantic.warning.hex,
        name: 'Warning',
      });
    }

    if (palette.semantic.error) {
      colorClasses.push({
        className: 'color-error',
        color: palette.semantic.error.hex,
        name: 'Error',
      });
    }

    if (palette.semantic.info) {
      colorClasses.push({
        className: 'color-info',
        color: palette.semantic.info.hex,
        name: 'Info',
      });
    }

    return colorClasses;
  }

  /**
   * Export to JSON
   */
  exportToJSON(components: ComponentInfo[]): string {
    const oxygenExport = this.export(components);
    return JSON.stringify(oxygenExport, null, 2);
  }

  /**
   * Export tree only
   */
  exportTree(components: ComponentInfo[]): OxygenComponent[] {
    return this.convertToTree(components);
  }

  /**
   * Export with shortcodes (for post content)
   */
  exportToShortcodes(components: ComponentInfo[]): string {
    const tree = this.convertToTree(components);
    return this.treeToShortcodes(tree);
  }

  /**
   * Convert tree to shortcodes
   */
  private treeToShortcodes(tree: OxygenComponent[]): string {
    return tree.map(comp => this.componentToShortcode(comp)).join('\n');
  }

  /**
   * Convert component to shortcode
   */
  private componentToShortcode(component: OxygenComponent): string {
    const attrs = Object.entries(component.options)
      .map(([key, value]) => `${key}="${value}"`)
      .join(' ');

    const classes = component.classes ? `class="${component.classes.join(' ')}"` : '';

    if (component.children && component.children.length > 0) {
      const children = this.treeToShortcodes(component.children);
      return `[oxygen component="${component.name}" id="${component.id}" ${attrs} ${classes}]${children}[/oxygen]`;
    } else {
      return `[oxygen component="${component.name}" id="${component.id}" ${attrs} ${classes}]`;
    }
  }

  /**
   * Create specialized icon component from icon widget
   */
  createIconComponent(iconWidget: IconWidget): OxygenComponent {
    const id = ++this.idCounter;

    return {
      id,
      name: 'ct_fancy_icon',
      options: {
        icon_set: iconWidget.iconLibrary,
        icon_name: iconWidget.icon,
        icon_size: iconWidget.size,
        icon_color: iconWidget.color,
        'icon_color-hover': iconWidget.hoverColor,
        icon_link: iconWidget.link,
        icon_link_target: iconWidget.linkTarget || '_self',
        alignment: iconWidget.alignment || 'center',
        transform: iconWidget.rotation ? `rotate(${iconWidget.rotation}deg)` : undefined,
      },
    };
  }

  /**
   * Create specialized gallery component from gallery widget
   */
  createGalleryComponent(galleryWidget: GalleryWidget): OxygenComponent {
    const id = ++this.idCounter;

    return {
      id,
      name: 'oxy-gallery',
      options: {
        images: JSON.stringify(galleryWidget.images.map(img => ({
          url: img.url,
          alt: img.alt,
          title: img.title,
          caption: img.caption,
        }))),
        layout: galleryWidget.layout,
        columns: typeof galleryWidget.columns === 'number' ? galleryWidget.columns : galleryWidget.columns.desktop,
        gap: galleryWidget.gap,
        lightbox: galleryWidget.lightbox ? 'true' : 'false',
        show_captions: galleryWidget.captions ? 'true' : 'false',
        hover_effect: galleryWidget.hoverEffect || 'none',
        lazy_load: galleryWidget.lazyLoad ? 'true' : 'false',
      },
    };
  }

  /**
   * Create specialized slider component from carousel widget
   */
  createSliderComponent(carouselWidget: CarouselWidget): OxygenComponent {
    const id = ++this.idCounter;

    return {
      id,
      name: 'oxy-easy-posts',
      options: {
        slideshow_type: 'carousel',
        slides: JSON.stringify(carouselWidget.slides),
        autoplay: carouselWidget.autoplay ? 'true' : 'false',
        autoplay_speed: carouselWidget.autoplaySpeed || 3000,
        navigation: carouselWidget.arrows ? 'true' : 'false',
        pagination: carouselWidget.dots ? 'true' : 'false',
        transition: carouselWidget.effect || 'slide',
        speed: carouselWidget.speed || 300,
        loop: carouselWidget.infinite ? 'true' : 'false',
      },
    };
  }

  /**
   * Create specialized pricing box component from pricing table widget
   */
  createPricingBoxComponent(pricingTableWidget: PricingTableWidget): OxygenComponent {
    const id = ++this.idCounter;
    const plan = pricingTableWidget.plans[0]; // Use first plan

    return {
      id,
      name: 'oxy-pricing-box',
      options: {
        title: plan?.title || 'Plan',
        price: `${pricingTableWidget.currency}${plan?.price || 0}`,
        period: plan?.period || pricingTableWidget.period,
        features: plan?.features.map(f => f.text).join('\n') || '',
        button_text: plan?.buttonText || 'Buy Now',
        button_url: plan?.buttonLink || '#',
        highlighted: plan?.highlighted ? 'true' : 'false',
        ribbon_text: plan?.ribbon,
      },
    };
  }

  /**
   * Auto-detect and create specialized widgets from component
   */
  createSpecializedWidget(component: ComponentInfo): OxygenComponent | null {
    // Try icon widget
    const iconWidget = extractIconWidget(component);
    if (iconWidget) {
      return this.createIconComponent(iconWidget);
    }

    // Try gallery widget
    const galleryWidget = extractGalleryWidget(component);
    if (galleryWidget) {
      return this.createGalleryComponent(galleryWidget);
    }

    // Try carousel widget
    const carouselWidget = extractCarouselWidget(component);
    if (carouselWidget) {
      return this.createSliderComponent(carouselWidget);
    }

    // Try pricing table widget
    const pricingTableWidget = extractPricingTableWidget(component);
    if (pricingTableWidget) {
      return this.createPricingBoxComponent(pricingTableWidget);
    }

    return null;
  }
}

/**
 * Helper function
 */
export function exportToOxygen(components: ComponentInfo[]): OxygenExport {
  const exporter = new OxygenExporter();
  return exporter.export(components);
}
