/**
 * Bricks Builder Exporter
 *
 * Complete mapping system for Bricks Builder:
 * - Element mapping (50+ elements)
 * - Container and section structure
 * - Advanced styling and interactions
 * - Dynamic data support
 * - Template export
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
  toBricksBoxShadow,
  type ParsedBoxShadow,
} from '../utils/box-shadow-parser.js';

export interface BricksExport {
  elements: BricksElement[];
  templates: BricksTemplate[];
  globalClasses?: BricksGlobalClass[];
  globalColors?: BricksGlobalColor[];
  typography?: BricksTypography;
}

export interface BricksElement {
  id: string;
  name: string;
  parent?: string;
  label?: string;
  settings?: Record<string, any>;
  children?: string[];
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

export interface BricksTemplate {
  id: number;
  name: string;
  type: 'header' | 'footer' | 'section' | 'page';
  content: BricksElement[];
  conditions?: any[];
}

export interface BricksGlobalClass {
  id: string;
  name: string;
  settings: Record<string, any>;
}

export interface BricksGlobalColor {
  id: string;
  name: string;
  value: string;
}

export interface BricksTypography {
  base_font_family: string;
  base_font_size: string;
  base_line_height: string;
  heading_font_family: string;
  heading_font_weight: string;
  h1: BricksHeadingStyle;
  h2: BricksHeadingStyle;
  h3: BricksHeadingStyle;
  h4: BricksHeadingStyle;
  h5: BricksHeadingStyle;
  h6: BricksHeadingStyle;
}

export interface BricksHeadingStyle {
  font_size: string;
  font_weight: string;
  line_height: string;
  letter_spacing?: string;
}

export class BricksExporter {
  private elementMap: Map<string, string> = new Map();
  private idCounter: number = 0;
  private elements: Map<string, BricksElement> = new Map();

  constructor() {
    this.initializeElementMap();
  }

  /**
   * Export to Bricks format
   */
  export(
    components: ComponentInfo[],
    options?: {
      colorPalette?: ColorPalette;
      typographySystem?: TypographySystem;
      validateExport?: boolean;
      optimizeExport?: boolean;
    }
  ): BricksExport {
    this.idCounter = 0;
    this.elements.clear();

    const elements = this.convertToElements(components, undefined, options);
    const templates = this.createTemplates(elements);
    const globalClasses = this.extractGlobalClasses(components);
    const globalColors = options?.colorPalette
      ? this.convertColorPaletteToBricks(options.colorPalette)
      : undefined;
    const typography = options?.typographySystem
      ? this.convertTypographyToBricks(options.typographySystem)
      : undefined;

    let result: BricksExport = {
      elements: Array.from(this.elements.values()),
      templates,
      globalClasses,
      globalColors,
      typography,
    };

    // Validate export
    if (options?.validateExport !== false) {
      const validation = validateExport(result);
      if (!validation.isValid) {
        console.warn('Bricks export validation failed:', validation.errors);
      }
      if (validation.warnings.length > 0) {
        console.warn('Bricks export warnings:', validation.warnings);
      }
    }

    // Optimize export
    if (options?.optimizeExport !== false) {
      result = optimizeExport(result);
    }

    return result;
  }

  /**
   * Initialize element mapping
   */
  private initializeElementMap(): void {
    // Basic elements
    this.elementMap.set('div', 'div');
    this.elementMap.set('container', 'container');
    this.elementMap.set('section', 'section');
    this.elementMap.set('block', 'block');

    // Text elements
    this.elementMap.set('heading', 'heading');
    this.elementMap.set('text', 'text');
    this.elementMap.set('text-basic', 'text-basic');
    this.elementMap.set('rich-text', 'rich-text');

    // Media
    this.elementMap.set('image', 'image');
    this.elementMap.set('video', 'video');
    this.elementMap.set('svg', 'svg');
    this.elementMap.set('icon', 'icon');

    // Interactive
    this.elementMap.set('button', 'button');
    this.elementMap.set('form', 'form');
    this.elementMap.set('input', 'form-field');
    this.elementMap.set('search', 'search');

    // Layout
    this.elementMap.set('accordion', 'accordion');
    this.elementMap.set('tabs', 'tabs');
    this.elementMap.set('slider', 'slider-nested');
    this.elementMap.set('carousel', 'carousel');

    // WordPress
    this.elementMap.set('posts', 'posts');
    this.elementMap.set('post-title', 'post-title');
    this.elementMap.set('post-content', 'post-content');
    this.elementMap.set('post-meta', 'post-meta');
    this.elementMap.set('nav-menu', 'nav-menu');

    // WooCommerce
    this.elementMap.set('products', 'products');
    this.elementMap.set('add-to-cart', 'woo-add-to-cart');

    // Advanced
    this.elementMap.set('code', 'code');
    this.elementMap.set('map', 'map');
    this.elementMap.set('counter', 'counter');
    this.elementMap.set('countdown', 'countdown');
    this.elementMap.set('progress-bar', 'progress-bar');
    this.elementMap.set('social-icons', 'social-icons');
    this.elementMap.set('testimonial', 'testimonial');
    this.elementMap.set('pricing-table', 'pricing-table');
  }

  /**
   * Convert components to Bricks elements
   */
  private convertToElements(
    components: ComponentInfo[],
    parentId?: string,
    options?: {
      colorPalette?: ColorPalette;
      typographySystem?: TypographySystem;
    }
  ): string[] {
    const elementIds: string[] = [];

    for (const component of components) {
      const elementId = this.componentToElement(component, parentId, options);
      if (elementId) {
        elementIds.push(elementId);
      }
    }

    return elementIds;
  }

  /**
   * Convert component to Bricks element
   */
  private componentToElement(component: ComponentInfo, parentId?: string, options?: {
    colorPalette?: ColorPalette;
    typographySystem?: TypographySystem;
  }): string {
    const id = this.generateId();
    const name = this.getElementName(component);
    const settings = this.extractSettings(component, name, options);

    const childIds = component.children
      ? this.convertToElements(component.children, id, options)
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

    const element: BricksElement = {
      id,
      name,
      parent: parentId,
      label: this.getLabel(component),
      settings,
      children: childIds.length > 0 ? childIds : undefined,
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

    this.elements.set(id, element);

    return id;
  }

  /**
   * Get element name
   */
  private getElementName(component: ComponentInfo): string {
    const type = component.componentType.toLowerCase();

    if (this.elementMap.has(type)) {
      return this.elementMap.get(type)!;
    }

    const tag = component.tagName?.toLowerCase();

    // Container detection
    const classes = (component.className || '').toLowerCase();
    if (classes.includes('container')) return 'container';
    if (tag === 'section') return 'section';
    if (tag === 'div' && component.children && component.children.length > 0) return 'div';

    // Text elements
    if (tag?.match(/^h[1-6]$/)) return 'heading';
    if (tag === 'p') return 'text-basic';

    // Media
    if (tag === 'img') return 'image';
    if (tag === 'video') return 'video';

    // Interactive
    if (tag === 'button' || tag === 'a' && classes.includes('btn')) return 'button';
    if (tag === 'form') return 'form';
    if (tag === 'input') return 'form-field';

    // Navigation
    if (tag === 'nav') return 'nav-menu';

    return 'div';
  }

  /**
   * Get element label
   */
  private getLabel(component: ComponentInfo): string {
    if (component.id) return component.id;
    if (component.className) {
      const classes = component.className.split(' ');
      return classes[0];
    }
    return component.componentType || component.tagName || 'Element';
  }

  /**
   * Map entrance animation to Bricks animation type
   */
  private mapEntranceAnimationToBricks(type: string): string {
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
   * Extract element settings
   */
  private extractSettings(component: ComponentInfo, elementName: string, options?: {
    colorPalette?: ColorPalette;
    typographySystem?: TypographySystem;
  }): Record<string, any> {
    const settings: Record<string, any> = {};

    // Common settings
    if (component.id) {
      settings._cssId = component.id;
    }

    if (component.className) {
      settings._cssClasses = component.className.split(' ');
    }

    // Advanced features integration into Bricks settings
    const responsiveSettings = extractResponsiveSettings(component);
    const hoverEffects = extractHoverEffects(component);
    const entranceAnimation = extractEntranceAnimation(component);
    const motionEffects = extractMotionEffects(component);
    const boxShadow = component.styles ? extractBoxShadow(component.styles) : undefined;
    const boxModel = component.styles ? extractBoxModel(component.styles) : undefined;

    // Responsive settings (Bricks format: breakpoint-specific properties)
    if (responsiveSettings.mobile || responsiveSettings.tablet) {
      // Bricks uses _hidden array to hide elements at specific breakpoints
      settings._display = settings._display || {};

      if (responsiveSettings.mobile) {
        if (responsiveSettings.mobile.display === 'none') {
          settings._hidden = settings._hidden || [];
          settings._hidden.push('mobile_portrait');
        }
        if (responsiveSettings.mobile.fontSize) {
          settings._typography = settings._typography || {};
          settings._typography.mobile_portrait = {
            ...settings._typography.mobile_portrait,
            fontSize: responsiveSettings.mobile.fontSize,
          };
        }
      }

      if (responsiveSettings.tablet) {
        if (responsiveSettings.tablet.display === 'none') {
          settings._hidden = settings._hidden || [];
          settings._hidden.push('tablet_portrait');
        }
        if (responsiveSettings.tablet.fontSize) {
          settings._typography = settings._typography || {};
          settings._typography.tablet_portrait = {
            ...settings._typography.tablet_portrait,
            fontSize: responsiveSettings.tablet.fontSize,
          };
        }
      }
    }

    // Hover effects (Bricks format: _hover object)
    if (hoverEffects) {
      settings._hover = {};

      if (hoverEffects.backgroundColor) {
        settings._hover.background = { color: { hex: hoverEffects.backgroundColor } };
      }
      if (hoverEffects.color) {
        settings._hover.color = { hex: hoverEffects.color };
      }
      if (hoverEffects.transform) {
        settings._hover.transform = hoverEffects.transform;
      }
      if (hoverEffects.boxShadow) {
        settings._hover.boxShadow = toBricksBoxShadow(hoverEffects.boxShadow);
      }
      if (hoverEffects.transition) {
        settings._transition = {
          duration: hoverEffects.transition.duration,
          timingFunction: hoverEffects.transition.timingFunction,
        };
      }
    }

    // Entrance animation (Bricks format: _animation object)
    if (entranceAnimation) {
      settings._animation = {
        name: this.mapEntranceAnimationToBricks(entranceAnimation.type),
        duration: entranceAnimation.duration,
        delay: entranceAnimation.delay,
        easing: entranceAnimation.easing,
      };
    }

    // Motion effects (scroll effects in Bricks)
    if (motionEffects?.scrollEffects && motionEffects.scrollEffects.length > 0) {
      const scrollEffect = motionEffects.scrollEffects[0];
      settings._scrollEffects = {
        type: scrollEffect.type,
        direction: scrollEffect.direction,
        speed: scrollEffect.speed,
        viewport: scrollEffect.viewport,
      };
    }

    // Sticky positioning
    if (motionEffects?.stickyEffects?.enabled) {
      settings._position = 'sticky';
      settings._top = motionEffects.stickyEffects.top;
      settings._bottom = motionEffects.stickyEffects.bottom;
    }

    // Box shadow
    if (boxShadow) {
      settings._boxShadow = toBricksBoxShadow(boxShadow);
    }

    // Box model
    if (boxModel) {
      if (boxModel.padding) {
        settings._padding = {
          top: boxModel.padding.top ? `${boxModel.padding.top.value}${boxModel.padding.top.unit}` : undefined,
          right: boxModel.padding.right ? `${boxModel.padding.right.value}${boxModel.padding.right.unit}` : undefined,
          bottom: boxModel.padding.bottom ? `${boxModel.padding.bottom.value}${boxModel.padding.bottom.unit}` : undefined,
          left: boxModel.padding.left ? `${boxModel.padding.left.value}${boxModel.padding.left.unit}` : undefined,
        };
      }
      if (boxModel.margin) {
        settings._margin = {
          top: boxModel.margin.top ? `${boxModel.margin.top.value}${boxModel.margin.top.unit}` : undefined,
          right: boxModel.margin.right ? `${boxModel.margin.right.value}${boxModel.margin.right.unit}` : undefined,
          bottom: boxModel.margin.bottom ? `${boxModel.margin.bottom.value}${boxModel.margin.bottom.unit}` : undefined,
          left: boxModel.margin.left ? `${boxModel.margin.left.value}${boxModel.margin.left.unit}` : undefined,
        };
      }
    }

    // Link colors to global colors
    if (options?.colorPalette) {
      const tokenRef = buildDesignTokenReferences(options.colorPalette, options.typographySystem);
      const tokens = linkToDesignTokens(component, tokenRef);

      if (tokens.colorTokens.has('color')) {
        settings._globalColorId = tokens.colorTokens.get('color');
      }
      if (tokens.colorTokens.has('backgroundColor')) {
        settings._globalBackgroundColorId = tokens.colorTokens.get('backgroundColor');
      }
    }

    // Element-specific settings
    switch (elementName) {
      case 'heading':
        settings.tag = component.tagName || 'h2';
        settings.text = component.textContent || '';
        if (component.styles?.color) settings.color = { hex: component.styles.color };
        if (component.styles?.fontSize) settings.typography = { fontSize: component.styles.fontSize };
        break;

      case 'text-basic':
      case 'text':
        settings.text = component.textContent || '';
        if (component.styles?.color) settings.color = { hex: component.styles.color };
        break;

      case 'rich-text':
        settings.content = component.innerHTML || '';
        break;

      case 'image':
        settings.image = {
          url: component.attributes?.src || '',
          alt: component.attributes?.alt || '',
        };
        if (component.attributes?.width) settings.width = component.attributes.width;
        if (component.attributes?.height) settings.height = component.attributes.height;
        settings.objectFit = 'cover';
        break;

      case 'button':
        settings.text = component.textContent || 'Button';
        settings.link = {
          type: 'external',
          url: component.attributes?.href || '#',
          newTab: component.attributes?.target === '_blank',
        };
        settings.style = 'primary';
        settings.size = 'md';
        if (component.styles?.backgroundColor) {
          settings.background = { color: { hex: component.styles.backgroundColor } };
        }
        break;

      case 'container':
      case 'section':
      case 'block':
      case 'div':
        settings.tag = component.tagName || 'div';
        break;

      case 'form':
        settings.fields = [];
        settings.submitButtonText = 'Submit';
        settings.actions = [{ type: 'email' }];
        break;

      case 'form-field':
        settings.type = component.attributes?.type || 'text';
        settings.label = component.attributes?.placeholder || 'Field';
        settings.required = component.attributes?.required === 'true';
        break;

      case 'nav-menu':
        settings.menu = '';
        settings.menuOrientation = 'horizontal';
        settings.mobileBreakpoint = 991;
        break;

      case 'icon':
        settings.icon = { library: 'fontawesome', icon: 'fas fa-star' };
        settings.size = 24;
        break;

      case 'video':
        settings.videoType = 'media';
        settings.video = { url: component.attributes?.src || '' };
        settings.controls = true;
        break;

      case 'map':
        settings.address = '';
        settings.zoom = 14;
        settings.height = 400;
        break;

      case 'slider-nested':
      case 'carousel':
        settings.slides = [];
        settings.autoplay = true;
        settings.autoplaySpeed = 3000;
        settings.navigation = true;
        settings.pagination = true;
        break;

      case 'accordion':
        settings.items = [];
        settings.openFirst = true;
        settings.toggleMultiple = false;
        break;

      case 'tabs':
        settings.items = [];
        settings.orientation = 'horizontal';
        break;

      case 'posts':
        settings.postType = 'post';
        settings.postsPerPage = 10;
        settings.columns = 3;
        settings.queryType = 'custom';
        break;

      case 'social-icons':
        settings.items = [
          { platform: 'facebook', url: '#' },
          { platform: 'twitter', url: '#' },
          { platform: 'instagram', url: '#' },
        ];
        settings.style = 'default';
        break;

      case 'testimonial':
        settings.content = component.textContent || '';
        settings.author = '';
        settings.role = '';
        settings.image = {};
        break;

      case 'counter':
      case 'countdown':
        settings.number = 100;
        settings.duration = 2000;
        settings.prefix = '';
        settings.suffix = '';
        break;

      case 'progress-bar':
        settings.percentage = 75;
        settings.showPercentage = true;
        settings.height = 20;
        break;
    }

    // Extract styles
    if (component.styles) {
      // Background
      if (component.styles.backgroundColor) {
        settings._background = {
          color: { hex: component.styles.backgroundColor },
        };
      }

      const bgImage = this.extractBackgroundImage(component);
      if (bgImage) {
        settings._background = {
          ...settings._background,
          image: { url: bgImage },
        };
      }

      // Spacing
      if (component.styles.padding) {
        settings._padding = this.parseSpacing(component.styles.padding);
      }
      if (component.styles.margin) {
        settings._margin = this.parseSpacing(component.styles.margin);
      }

      // Border
      if (component.styles.borderRadius) {
        settings._border = {
          radius: this.parseSpacing(component.styles.borderRadius),
        };
      }

      // Dimensions
      if (component.styles.width) {
        settings._width = component.styles.width;
      }
      if (component.styles.height) {
        settings._height = component.styles.height;
      }

      // Display
      if (component.styles.display) {
        settings._display = component.styles.display;
      }

      // Flexbox/Grid
      if (component.styles.display === 'flex') {
        settings._flexbox = {
          justifyContent: component.styles.justifyContent,
          alignItems: component.styles.alignItems,
          flexDirection: component.styles.flexDirection,
          gap: component.styles.gap,
        };
      }

      if (component.styles.display === 'grid') {
        settings._grid = {
          gridTemplateColumns: component.styles.gridTemplateColumns,
          gridTemplateRows: component.styles.gridTemplateRows,
          gap: component.styles.gap,
        };
      }
    }

    return settings;
  }

  /**
   * Parse spacing value
   */
  private parseSpacing(value: any): any {
    if (typeof value === 'string') {
      const parts = value.split(' ');
      if (parts.length === 1) {
        return { top: value, right: value, bottom: value, left: value };
      } else if (parts.length === 2) {
        return { top: parts[0], right: parts[1], bottom: parts[0], left: parts[1] };
      } else if (parts.length === 4) {
        return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[3] };
      }
    }
    return value;
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
   * Generate unique ID
   */
  private generateId(): string {
    return `${++this.idCounter}`.padStart(6, '0');
  }

  /**
   * Create templates
   */
  private createTemplates(elementIds: string[]): BricksTemplate[] {
    const elements = elementIds.map(id => this.elements.get(id)!);

    return [{
      id: 1,
      name: 'Converted Template',
      type: 'section',
      content: elements,
      conditions: [],
    }];
  }

  /**
   * Extract global classes
   */
  private extractGlobalClasses(components: ComponentInfo[]): BricksGlobalClass[] {
    const classMap = new Map<string, ComponentInfo[]>();

    for (const component of components) {
      if (component.className) {
        const classes = component.className.split(' ');
        for (const cls of classes) {
          if (!classMap.has(cls)) {
            classMap.set(cls, []);
          }
          classMap.get(cls)!.push(component);
        }
      }
    }

    const globalClasses: BricksGlobalClass[] = [];
    let id = 1;

    for (const [className, comps] of classMap) {
      if (comps.length >= 2) {
        const commonStyles = this.extractCommonStyles(comps);
        if (Object.keys(commonStyles).length > 0) {
          globalClasses.push({
            id: `global_${id++}`,
            name: className,
            settings: commonStyles,
          });
        }
      }
    }

    return globalClasses;
  }

  /**
   * Extract common styles
   */
  private extractCommonStyles(components: ComponentInfo[]): Record<string, any> {
    if (components.length === 0) return {};

    const firstStyles = components[0].styles || {};
    const common: Record<string, any> = {};

    for (const key in firstStyles) {
      const value = firstStyles[key];
      const allMatch = components.every(c => c.styles?.[key] === value);

      if (allMatch) {
        common[key] = value;
      }
    }

    return common;
  }

  /**
   * Convert Section 8 TypographySystem to Bricks typography
   */
  private convertTypographyToBricks(typography: TypographySystem): BricksTypography {
    const bodyFont = typography.fontFamilies.find(f =>
      f.contexts.some(c => c.type === 'body')
    ) || typography.fontFamilies[0];

    const headingFont = typography.fontFamilies.find(f =>
      f.contexts.some(c => c.type === 'heading')
    ) || bodyFont;

    const createHeadingStyle = (textStyle: any): BricksHeadingStyle => ({
      font_size: textStyle.fontSize,
      font_weight: String(textStyle.fontWeight),
      line_height: String(textStyle.lineHeight),
      letter_spacing: textStyle.letterSpacing,
    });

    return {
      base_font_family: bodyFont?.name || typography.globalSettings.baseFontFamily,
      base_font_size: `${typography.globalSettings.baseFontSize}px`,
      base_line_height: String(typography.globalSettings.baseLineHeight),
      heading_font_family: headingFont?.name || typography.globalSettings.headingFontFamily || bodyFont?.name || 'sans-serif',
      heading_font_weight: String(typography.globalSettings.headingFontWeight || 700),
      h1: createHeadingStyle(typography.textStyles.h1),
      h2: createHeadingStyle(typography.textStyles.h2),
      h3: createHeadingStyle(typography.textStyles.h3),
      h4: createHeadingStyle(typography.textStyles.h4),
      h5: createHeadingStyle(typography.textStyles.h5),
      h6: createHeadingStyle(typography.textStyles.h6),
    };
  }

  /**
   * Convert Section 8 ColorPalette to Bricks global colors
   */
  private convertColorPaletteToBricks(palette: ColorPalette): BricksGlobalColor[] {
    const colors: BricksGlobalColor[] = [];

    // Add primary colors
    palette.primary.forEach((color, i) => {
      colors.push({
        id: `primary-${i + 1}`,
        name: `Primary ${i + 1}`,
        value: color.hex,
      });
    });

    // Add secondary colors
    palette.secondary.forEach((color, i) => {
      colors.push({
        id: `secondary-${i + 1}`,
        name: `Secondary ${i + 1}`,
        value: color.hex,
      });
    });

    // Add accent colors
    palette.accent.forEach((color, i) => {
      colors.push({
        id: `accent-${i + 1}`,
        name: `Accent ${i + 1}`,
        value: color.hex,
      });
    });

    // Add neutral colors
    palette.neutral.forEach((color, i) => {
      colors.push({
        id: `neutral-${i + 1}`,
        name: `Neutral ${i + 1}`,
        value: color.hex,
      });
    });

    // Add semantic colors
    if (palette.semantic.success) {
      colors.push({
        id: 'success',
        name: 'Success',
        value: palette.semantic.success.hex,
      });
    }

    if (palette.semantic.warning) {
      colors.push({
        id: 'warning',
        name: 'Warning',
        value: palette.semantic.warning.hex,
      });
    }

    if (palette.semantic.error) {
      colors.push({
        id: 'error',
        name: 'Error',
        value: palette.semantic.error.hex,
      });
    }

    if (palette.semantic.info) {
      colors.push({
        id: 'info',
        name: 'Info',
        value: palette.semantic.info.hex,
      });
    }

    return colors;
  }

  /**
   * Export to JSON
   */
  exportToJSON(components: ComponentInfo[]): string {
    const bricksExport = this.export(components);
    return JSON.stringify(bricksExport, null, 2);
  }

  /**
   * Export elements only
   */
  exportElements(components: ComponentInfo[]): BricksElement[] {
    this.convertToElements(components);
    return Array.from(this.elements.values());
  }

  /**
   * Create specialized icon element from icon widget
   */
  createIconElement(iconWidget: IconWidget, parentId?: string): BricksElement {
    const id = this.generateId();

    return {
      id,
      name: 'icon',
      parent: parentId,
      label: 'Icon',
      settings: {
        icon: {
          library: iconWidget.iconLibrary,
          icon: iconWidget.icon,
        },
        size: iconWidget.size,
        color: { hex: iconWidget.color },
        _hover: iconWidget.hoverColor ? {
          color: { hex: iconWidget.hoverColor },
        } : undefined,
        link: iconWidget.link ? {
          type: 'external',
          url: iconWidget.link,
          newTab: iconWidget.linkTarget === '_blank',
        } : undefined,
        _alignment: iconWidget.alignment || 'center',
      },
    };
  }

  /**
   * Create specialized carousel element from carousel widget
   */
  createCarouselElement(carouselWidget: CarouselWidget, parentId?: string): BricksElement {
    const id = this.generateId();

    return {
      id,
      name: 'carousel',
      parent: parentId,
      label: 'Carousel',
      settings: {
        slides: carouselWidget.slides.map(slide => ({
          image: slide.image ? { url: slide.image } : undefined,
          title: slide.title,
          content: slide.content,
          link: slide.link,
        })),
        autoplay: carouselWidget.autoplay,
        autoplaySpeed: carouselWidget.autoplaySpeed,
        navigation: carouselWidget.arrows,
        pagination: carouselWidget.dots,
        effect: carouselWidget.effect || 'slide',
        speed: carouselWidget.speed || 300,
        loop: carouselWidget.infinite,
      },
    };
  }

  /**
   * Create specialized testimonial element from testimonial widget
   */
  createTestimonialElement(testimonialWidget: TestimonialWidget, parentId?: string): BricksElement {
    const id = this.generateId();
    const testimonial = testimonialWidget.testimonials[0]; // Use first testimonial

    return {
      id,
      name: 'testimonial',
      parent: parentId,
      label: 'Testimonial',
      settings: {
        content: testimonial?.content || '',
        author: testimonial?.authorName || '',
        role: testimonial?.authorTitle || '',
        image: testimonial?.authorImage ? { url: testimonial.authorImage } : undefined,
        rating: testimonial?.rating,
        layout: testimonialWidget.layout || 'single',
        alignment: testimonialWidget.alignment || 'center',
        imageShape: testimonialWidget.imageShape || 'circle',
      },
    };
  }

  /**
   * Create specialized pricing table element from pricing table widget
   */
  createPricingTableElement(pricingTableWidget: PricingTableWidget, parentId?: string): BricksElement {
    const id = this.generateId();

    return {
      id,
      name: 'pricing-table',
      parent: parentId,
      label: 'Pricing Table',
      settings: {
        plans: pricingTableWidget.plans.map(plan => ({
          title: plan.title,
          price: plan.price,
          currency: pricingTableWidget.currency,
          period: plan.period || pricingTableWidget.period,
          features: plan.features.map(f => ({
            text: f.text,
            included: f.included,
            tooltip: f.tooltip,
          })),
          buttonText: plan.buttonText,
          buttonLink: plan.buttonLink,
          highlighted: plan.highlighted,
          ribbon: plan.ribbon,
        })),
        layout: pricingTableWidget.layout || 'columns',
      },
    };
  }

  /**
   * Auto-detect and create specialized widgets from component
   */
  createSpecializedWidget(component: ComponentInfo, parentId?: string): BricksElement | null {
    // Try icon widget
    const iconWidget = extractIconWidget(component);
    if (iconWidget) {
      return this.createIconElement(iconWidget, parentId);
    }

    // Try carousel widget
    const carouselWidget = extractCarouselWidget(component);
    if (carouselWidget) {
      return this.createCarouselElement(carouselWidget, parentId);
    }

    // Try testimonial widget
    const testimonialWidget = extractTestimonialWidget(component);
    if (testimonialWidget) {
      return this.createTestimonialElement(testimonialWidget, parentId);
    }

    // Try pricing table widget
    const pricingTableWidget = extractPricingTableWidget(component);
    if (pricingTableWidget) {
      return this.createPricingTableElement(pricingTableWidget, parentId);
    }

    return null;
  }
}

/**
 * Helper function
 */
export function exportToBricks(components: ComponentInfo[]): BricksExport {
  const exporter = new BricksExporter();
  return exporter.export(components);
}

// Component Library integration methods added at end of file
