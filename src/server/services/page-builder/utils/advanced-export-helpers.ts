/**
 * Advanced Export Helpers
 *
 * Shared utilities for advanced page builder features:
 * - Responsive settings extraction
 * - Hover effects detection
 * - Entrance animations mapping
 * - Motion effects & scroll animations
 * - Global design system linking
 * - Custom CSS per element
 * - Dynamic content support
 * - Export validation & optimization
 */

import type { ComponentInfo } from '../types/builder.types.js';
import type {
  ResponsiveStyles,
  StylesWithStates,
  BehavioralAnalysis,
  ExtractedStyles,
} from '../types/component.types.js';
import type { ColorPalette } from '../analyzer/color-palette-extractor.js';
import type { TypographySystem } from '../analyzer/typography-extractor.js';
import { extractBoxModel, type BoxModel, formatDimension } from './dimension-parser.js';
import { extractBoxShadow, type ParsedBoxShadow } from './box-shadow-parser.js';

/**
 * Responsive settings for all breakpoints
 */
export interface ResponsiveSettings {
  mobile?: Record<string, any>;
  tablet?: Record<string, any>;
  desktop?: Record<string, any>;
  laptop?: Record<string, any>;
}

/**
 * Hover effects extracted from component
 */
export interface HoverEffects {
  transform?: string;
  backgroundColor?: string;
  color?: string;
  borderColor?: string;
  boxShadow?: ParsedBoxShadow;
  opacity?: string;
  transition?: TransitionEffect;
}

/**
 * Transition effect details
 */
export interface TransitionEffect {
  property: string;
  duration: string;
  timingFunction: string;
  delay: string;
}

/**
 * Entrance animation configuration
 */
export interface EntranceAnimation {
  type: string; // fadeIn, slideInUp, zoomIn, etc.
  duration: number; // in ms
  delay: number; // in ms
  easing: string; // ease, ease-in-out, etc.
}

/**
 * Motion effects (scroll-based animations)
 */
export interface MotionEffects {
  scrollEffects?: ScrollEffect[];
  mouseEffects?: MouseEffect[];
  stickyEffects?: StickyEffect;
}

/**
 * Scroll-based animation effect
 */
export interface ScrollEffect {
  type: 'parallax' | 'fadeIn' | 'fadeOut' | 'scaleUp' | 'scaleDown' | 'rotateIn' | 'slideIn';
  direction?: 'up' | 'down' | 'left' | 'right';
  speed?: number; // 0-10
  viewport?: {
    start: number; // percentage
    end: number; // percentage
  };
}

/**
 * Mouse movement effect
 */
export interface MouseEffect {
  type: 'tilt' | 'parallax' | 'magnetism';
  strength: number; // 0-10
}

/**
 * Sticky positioning effect
 */
export interface StickyEffect {
  enabled: boolean;
  top?: string;
  bottom?: string;
  parent?: string;
  offset?: number;
}

/**
 * Global design token reference
 */
export interface DesignTokenReference {
  colors: Map<string, string>; // Maps actual color values to palette variable names
  fonts: Map<string, string>; // Maps actual fonts to typography system variable names
  sizes: Map<string, string>; // Maps actual sizes to size variable names
}

/**
 * Dynamic content configuration
 */
export interface DynamicContent {
  type: 'post_title' | 'post_content' | 'post_excerpt' | 'post_thumbnail' | 'custom_field' | 'user_data' | 'date' | 'taxonomy';
  source?: string; // Field name or source ID
  fallback?: string; // Fallback content
  format?: string; // Formatting options
}

/**
 * Extract responsive settings from component
 */
export function extractResponsiveSettings(component: ComponentInfo): ResponsiveSettings {
  const responsive: ResponsiveSettings = {};

  if (!component.advancedAnalysis?.responsiveStyles) {
    return responsive;
  }

  const { mobile, tablet, desktop, laptop } = component.advancedAnalysis.responsiveStyles;

  if (mobile) {
    responsive.mobile = extractBreakpointSettings(mobile);
  }

  if (tablet) {
    responsive.tablet = extractBreakpointSettings(tablet);
  }

  if (desktop) {
    responsive.desktop = extractBreakpointSettings(desktop);
  }

  if (laptop) {
    responsive.laptop = extractBreakpointSettings(laptop);
  }

  return responsive;
}

/**
 * Extract settings for a specific breakpoint
 */
function extractBreakpointSettings(styles: ExtractedStyles): Record<string, any> {
  const settings: Record<string, any> = {};

  // Layout
  if (styles.display) settings.display = styles.display;
  if (styles.flexDirection) settings.flexDirection = styles.flexDirection;
  if (styles.justifyContent) settings.justifyContent = styles.justifyContent;
  if (styles.alignItems) settings.alignItems = styles.alignItems;

  // Dimensions
  if (styles.width) settings.width = styles.width;
  if (styles.height) settings.height = styles.height;
  if (styles.minWidth) settings.minWidth = styles.minWidth;
  if (styles.maxWidth) settings.maxWidth = styles.maxWidth;

  // Spacing
  if (styles.margin) settings.margin = styles.margin;
  if (styles.padding) settings.padding = styles.padding;

  // Typography
  if (styles.fontSize) settings.fontSize = styles.fontSize;
  if (styles.lineHeight) settings.lineHeight = styles.lineHeight;
  if (styles.textAlign) settings.textAlign = styles.textAlign;

  return settings;
}

/**
 * Extract hover effects from component
 */
export function extractHoverEffects(component: ComponentInfo): HoverEffects | undefined {
  if (!component.advancedAnalysis?.interactiveStates?.hover) {
    return undefined;
  }

  const normal = component.advancedAnalysis.interactiveStates.normal;
  const hover = component.advancedAnalysis.interactiveStates.hover;

  const effects: HoverEffects = {};

  // Compare styles to find differences
  if (hover.transform !== normal.transform) {
    effects.transform = hover.transform;
  }

  if (hover.backgroundColor !== normal.backgroundColor) {
    effects.backgroundColor = hover.backgroundColor;
  }

  if (hover.color !== normal.color) {
    effects.color = hover.color;
  }

  if (hover.borderColor !== normal.borderColor) {
    effects.borderColor = hover.borderColor;
  }

  if (hover.boxShadow !== normal.boxShadow) {
    effects.boxShadow = extractBoxShadow({ boxShadow: hover.boxShadow });
  }

  if (hover.opacity !== normal.opacity) {
    effects.opacity = hover.opacity;
  }

  // Extract transition
  if (hover.transition) {
    effects.transition = parseTransition(hover.transition);
  }

  return Object.keys(effects).length > 0 ? effects : undefined;
}

/**
 * Parse CSS transition string
 */
function parseTransition(transition: string): TransitionEffect {
  const parts = transition.split(' ');
  return {
    property: parts[0] || 'all',
    duration: parts[1] || '0.3s',
    timingFunction: parts[2] || 'ease',
    delay: parts[3] || '0s',
  };
}

/**
 * Map CSS animations to entrance animation types
 */
export function extractEntranceAnimation(component: ComponentInfo): EntranceAnimation | undefined {
  const behavior = component.advancedAnalysis?.behavior;

  if (!behavior?.hasAnimations || !behavior.animations || behavior.animations.length === 0) {
    return undefined;
  }

  const animation = behavior.animations[0];
  const type = mapAnimationNameToType(animation.name);

  if (!type) return undefined;

  return {
    type,
    duration: parseDuration(animation.duration),
    delay: parseDuration(animation.delay),
    easing: animation.timingFunction,
  };
}

/**
 * Map animation name to entrance animation type
 */
function mapAnimationNameToType(name: string): string | null {
  const nameLC = name.toLowerCase();

  if (nameLC.includes('fadein')) return 'fadeIn';
  if (nameLC.includes('fadeout')) return 'fadeOut';
  if (nameLC.includes('slideinup')) return 'slideInUp';
  if (nameLC.includes('slideindown')) return 'slideInDown';
  if (nameLC.includes('slideinleft')) return 'slideInLeft';
  if (nameLC.includes('slideinright')) return 'slideInRight';
  if (nameLC.includes('zoomin')) return 'zoomIn';
  if (nameLC.includes('zoomout')) return 'zoomOut';
  if (nameLC.includes('rotatein')) return 'rotateIn';
  if (nameLC.includes('flipin')) return 'flipIn';
  if (nameLC.includes('bouncein')) return 'bounceIn';

  return null;
}

/**
 * Parse CSS duration string to milliseconds
 */
function parseDuration(duration: string): number {
  if (duration.endsWith('ms')) {
    return parseFloat(duration);
  }
  if (duration.endsWith('s')) {
    return parseFloat(duration) * 1000;
  }
  return 0;
}

/**
 * Detect motion effects from component
 */
export function extractMotionEffects(component: ComponentInfo): MotionEffects | undefined {
  const effects: MotionEffects = {};

  // Check for parallax (background-attachment: fixed)
  if (component.styles?.backgroundAttachment === 'fixed') {
    effects.scrollEffects = [{
      type: 'parallax',
      speed: 5,
      viewport: { start: 0, end: 100 },
    }];
  }

  // Check for sticky positioning
  if (component.styles?.position === 'sticky' || component.styles?.position === 'fixed') {
    effects.stickyEffects = {
      enabled: true,
      top: component.styles.top as string,
      bottom: component.styles.bottom as string,
      offset: 0,
    };
  }

  // Check for transform on scroll (data attributes or classes)
  const classes = (component.className || '').toLowerCase();
  if (classes.includes('aos-') || classes.includes('scroll-')) {
    // Animate on Scroll library detected
    effects.scrollEffects = effects.scrollEffects || [];
    effects.scrollEffects.push({
      type: 'fadeIn',
      speed: 5,
      viewport: { start: 0, end: 80 },
    });
  }

  return Object.keys(effects).length > 0 ? effects : undefined;
}

/**
 * Build design token references from color palette and typography system
 */
export function buildDesignTokenReferences(
  colorPalette?: ColorPalette,
  typographySystem?: TypographySystem
): DesignTokenReference {
  const ref: DesignTokenReference = {
    colors: new Map(),
    fonts: new Map(),
    sizes: new Map(),
  };

  // Build color map
  if (colorPalette) {
    colorPalette.primary.forEach((color, i) => {
      ref.colors.set(color.hex.toLowerCase(), `primary-${i + 1}`);
    });
    colorPalette.secondary.forEach((color, i) => {
      ref.colors.set(color.hex.toLowerCase(), `secondary-${i + 1}`);
    });
    colorPalette.accent.forEach((color, i) => {
      ref.colors.set(color.hex.toLowerCase(), `accent-${i + 1}`);
    });
    colorPalette.neutral.forEach((color, i) => {
      ref.colors.set(color.hex.toLowerCase(), `neutral-${i + 1}`);
    });

    if (colorPalette.semantic.success) {
      ref.colors.set(colorPalette.semantic.success.hex.toLowerCase(), 'success');
    }
    if (colorPalette.semantic.error) {
      ref.colors.set(colorPalette.semantic.error.hex.toLowerCase(), 'error');
    }
    if (colorPalette.semantic.warning) {
      ref.colors.set(colorPalette.semantic.warning.hex.toLowerCase(), 'warning');
    }
    if (colorPalette.semantic.info) {
      ref.colors.set(colorPalette.semantic.info.hex.toLowerCase(), 'info');
    }
  }

  // Build font map
  if (typographySystem) {
    typographySystem.fontFamilies.forEach((font) => {
      const fontName = font.name.toLowerCase();
      ref.fonts.set(fontName, font.name);
    });
  }

  // Build size map from typography system
  if (typographySystem) {
    typographySystem.typeScale.sizes.forEach((size) => {
      ref.sizes.set(`${size.px}px`, size.name);
    });
  }

  return ref;
}

/**
 * Link component styles to global design tokens
 */
export function linkToDesignTokens(
  component: ComponentInfo,
  tokenRef: DesignTokenReference
): {
  colorTokens: Map<string, string>; // CSS property -> token name
  fontTokens: Map<string, string>; // CSS property -> token name
  sizeTokens: Map<string, string>; // CSS property -> token name
} {
  const colorTokens = new Map<string, string>();
  const fontTokens = new Map<string, string>();
  const sizeTokens = new Map<string, string>();

  if (!component.styles) {
    return { colorTokens, fontTokens, sizeTokens };
  }

  // Link colors
  if (component.styles.color) {
    const colorHex = normalizeColorToHex(component.styles.color);
    const token = tokenRef.colors.get(colorHex);
    if (token) colorTokens.set('color', token);
  }

  if (component.styles.backgroundColor) {
    const colorHex = normalizeColorToHex(component.styles.backgroundColor);
    const token = tokenRef.colors.get(colorHex);
    if (token) colorTokens.set('backgroundColor', token);
  }

  if (component.styles.borderColor) {
    const colorHex = normalizeColorToHex(component.styles.borderColor);
    const token = tokenRef.colors.get(colorHex);
    if (token) colorTokens.set('borderColor', token);
  }

  // Link fonts
  if (component.styles.fontFamily) {
    const fontName = component.styles.fontFamily.toString().split(',')[0].trim().toLowerCase();
    const token = tokenRef.fonts.get(fontName.replace(/['"]/g, ''));
    if (token) fontTokens.set('fontFamily', token);
  }

  // Link sizes
  if (component.styles.fontSize) {
    const token = tokenRef.sizes.get(component.styles.fontSize.toString());
    if (token) sizeTokens.set('fontSize', token);
  }

  return { colorTokens, fontTokens, sizeTokens };
}

/**
 * Normalize color to hex for comparison
 */
function normalizeColorToHex(color: any): string {
  if (!color) return '';

  const colorStr = color.toString().toLowerCase();

  // Already hex
  if (colorStr.startsWith('#')) {
    return colorStr;
  }

  // RGB/RGBA
  const rgbMatch = colorStr.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1]);
    const g = parseInt(rgbMatch[2]);
    const b = parseInt(rgbMatch[3]);
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
  }

  return colorStr;
}

/**
 * Generate custom CSS for component
 */
export function generateCustomCSS(component: ComponentInfo): string {
  const cssRules: string[] = [];

  // Generate selector
  const selector = component.id ? `#${component.id}` : `.${component.className?.split(' ')[0] || 'element'}`;

  // Base styles
  const baseStyles: string[] = [];
  if (component.styles) {
    for (const [prop, value] of Object.entries(component.styles)) {
      if (value !== undefined && value !== null && value !== '') {
        const cssProp = camelToKebab(prop);
        baseStyles.push(`  ${cssProp}: ${value};`);
      }
    }
  }

  if (baseStyles.length > 0) {
    cssRules.push(`${selector} {\n${baseStyles.join('\n')}\n}`);
  }

  // Hover styles
  if (component.advancedAnalysis?.interactiveStates?.hover) {
    const hoverStyles: string[] = [];
    const hover = component.advancedAnalysis.interactiveStates.hover;

    for (const [prop, value] of Object.entries(hover)) {
      if (value !== undefined && value !== null && value !== '') {
        const cssProp = camelToKebab(prop);
        hoverStyles.push(`  ${cssProp}: ${value};`);
      }
    }

    if (hoverStyles.length > 0) {
      cssRules.push(`${selector}:hover {\n${hoverStyles.join('\n')}\n}`);
    }
  }

  // Pseudo-elements
  if (component.advancedAnalysis?.pseudoElements?.before) {
    const beforeStyles: string[] = [];
    for (const [prop, value] of Object.entries(component.advancedAnalysis.pseudoElements.before)) {
      if (value !== undefined && value !== null && value !== '') {
        const cssProp = camelToKebab(prop);
        beforeStyles.push(`  ${cssProp}: ${value};`);
      }
    }

    if (beforeStyles.length > 0) {
      cssRules.push(`${selector}::before {\n${beforeStyles.join('\n')}\n}`);
    }
  }

  if (component.advancedAnalysis?.pseudoElements?.after) {
    const afterStyles: string[] = [];
    for (const [prop, value] of Object.entries(component.advancedAnalysis.pseudoElements.after)) {
      if (value !== undefined && value !== null && value !== '') {
        const cssProp = camelToKebab(prop);
        afterStyles.push(`  ${cssProp}: ${value};`);
      }
    }

    if (afterStyles.length > 0) {
      cssRules.push(`${selector}::after {\n${afterStyles.join('\n')}\n}`);
    }
  }

  // Media queries for responsive
  if (component.advancedAnalysis?.responsiveStyles) {
    const { mobile, tablet } = component.advancedAnalysis.responsiveStyles;

    if (mobile) {
      const mobileStyles: string[] = [];
      for (const [prop, value] of Object.entries(mobile)) {
        if (value !== undefined && value !== null && value !== '') {
          const cssProp = camelToKebab(prop);
          mobileStyles.push(`    ${cssProp}: ${value};`);
        }
      }

      if (mobileStyles.length > 0) {
        cssRules.push(`@media (max-width: 767px) {\n  ${selector} {\n${mobileStyles.join('\n')}\n  }\n}`);
      }
    }

    if (tablet) {
      const tabletStyles: string[] = [];
      for (const [prop, value] of Object.entries(tablet)) {
        if (value !== undefined && value !== null && value !== '') {
          const cssProp = camelToKebab(prop);
          tabletStyles.push(`    ${cssProp}: ${value};`);
        }
      }

      if (tabletStyles.length > 0) {
        cssRules.push(`@media (min-width: 768px) and (max-width: 1023px) {\n  ${selector} {\n${tabletStyles.join('\n')}\n  }\n}`);
      }
    }
  }

  return cssRules.join('\n\n');
}

/**
 * Convert camelCase to kebab-case
 */
function camelToKebab(str: string): string {
  return str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

/**
 * Detect dynamic content placeholders
 */
export function detectDynamicContent(component: ComponentInfo): DynamicContent | undefined {
  const text = component.textContent || '';

  // Check for common dynamic content patterns
  if (text.includes('{{') || text.includes('{%')) {
    // Liquid/Twig templates
    return {
      type: 'custom_field',
      source: text,
      fallback: text,
    };
  }

  // Check for WordPress shortcodes
  if (text.match(/\[.*?\]/)) {
    return {
      type: 'custom_field',
      source: text,
      fallback: text,
    };
  }

  // Check data attributes
  if (component.attributes) {
    if (component.attributes['data-dynamic-content']) {
      return {
        type: 'custom_field',
        source: component.attributes['data-dynamic-content'],
      };
    }
  }

  return undefined;
}

/**
 * Validate export data
 */
export function validateExport(exportData: any): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check required fields
  if (!exportData) {
    errors.push('Export data is null or undefined');
    return { isValid: false, errors, warnings };
  }

  // Check for common issues
  if (Array.isArray(exportData) && exportData.length === 0) {
    warnings.push('Export contains no elements');
  }

  // Check for duplicate IDs
  const ids = new Set<string>();
  const checkDuplicateIds = (obj: any) => {
    if (obj && typeof obj === 'object') {
      if (obj.id) {
        if (ids.has(obj.id)) {
          errors.push(`Duplicate ID found: ${obj.id}`);
        } else {
          ids.add(obj.id);
        }
      }

      // Recursively check children
      if (Array.isArray(obj)) {
        obj.forEach(checkDuplicateIds);
      } else {
        Object.values(obj).forEach(checkDuplicateIds);
      }
    }
  };

  checkDuplicateIds(exportData);

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Optimize export by removing redundant data
 */
export function optimizeExport(exportData: any): any {
  if (!exportData) return exportData;

  // Remove empty objects and arrays
  const removeEmpty = (obj: any): any => {
    if (Array.isArray(obj)) {
      return obj.map(removeEmpty).filter(item => {
        if (item === null || item === undefined) return false;
        if (typeof item === 'object' && Object.keys(item).length === 0) return false;
        if (Array.isArray(item) && item.length === 0) return false;
        return true;
      });
    }

    if (typeof obj === 'object' && obj !== null) {
      const cleaned: any = {};
      for (const [key, value] of Object.entries(obj)) {
        if (value === null || value === undefined || value === '') continue;
        if (typeof value === 'object' && Object.keys(value).length === 0) continue;
        if (Array.isArray(value) && value.length === 0) continue;

        cleaned[key] = removeEmpty(value);
      }
      return cleaned;
    }

    return obj;
  };

  return removeEmpty(exportData);
}
