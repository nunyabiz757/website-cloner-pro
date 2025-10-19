/**
 * Style Extraction Engine
 *
 * Extracts computed CSS styles from HTML elements and converts them to a normalized format
 *
 * MODES:
 * - Basic (jsdom): Fast, server-side only - good for simple pages
 * - Advanced (Puppeteer): Accurate browser rendering - supports responsive, interactive states, pseudo-elements
 */

import { JSDOM } from 'jsdom';
import { ExtractedStyles, BoxSpacing, BorderStyle, BorderRadius, AdvancedElementAnalysis } from '../types/component.types.js';
import { analyzeElementAdvanced } from './advanced-element-analyzer.js';

/**
 * Extract all relevant styles from an HTML element
 */
export function extractStyles(html: string, selector?: string): ExtractedStyles {
  const dom = new JSDOM(html);
  const document = dom.window.document;
  const element = selector ? document.querySelector(selector) : document.body.firstElementChild;

  if (!element) {
    return {};
  }

  const computedStyle = dom.window.getComputedStyle(element as Element);

  return {
    // Layout
    display: computedStyle.display || undefined,
    position: computedStyle.position || undefined,
    flexDirection: computedStyle.flexDirection || undefined,
    justifyContent: computedStyle.justifyContent || undefined,
    alignItems: computedStyle.alignItems || undefined,
    gridTemplateColumns: computedStyle.gridTemplateColumns || undefined,
    gridTemplateRows: computedStyle.gridTemplateRows || undefined,
    gap: computedStyle.gap || undefined,

    // Box Model
    width: computedStyle.width || undefined,
    height: computedStyle.height || undefined,
    minWidth: computedStyle.minWidth || undefined,
    maxWidth: computedStyle.maxWidth || undefined,
    minHeight: computedStyle.minHeight || undefined,
    maxHeight: computedStyle.maxHeight || undefined,
    margin: extractBoxSpacing(computedStyle, 'margin'),
    padding: extractBoxSpacing(computedStyle, 'padding'),

    // Border
    border: extractBorderStyle(computedStyle),
    borderRadius: extractBorderRadius(computedStyle),

    // Colors
    backgroundColor: normalizeColor(computedStyle.backgroundColor),
    color: normalizeColor(computedStyle.color),
    borderColor: normalizeColor(computedStyle.borderColor),

    // Typography
    fontFamily: computedStyle.fontFamily || undefined,
    fontSize: computedStyle.fontSize || undefined,
    fontWeight: normalizeFontWeight(computedStyle.fontWeight),
    fontStyle: computedStyle.fontStyle || undefined,
    lineHeight: computedStyle.lineHeight || undefined,
    letterSpacing: computedStyle.letterSpacing || undefined,
    textAlign: computedStyle.textAlign || undefined,
    textDecoration: computedStyle.textDecoration || undefined,
    textTransform: computedStyle.textTransform || undefined,

    // Effects
    boxShadow: computedStyle.boxShadow !== 'none' ? computedStyle.boxShadow : undefined,
    textShadow: computedStyle.textShadow !== 'none' ? computedStyle.textShadow : undefined,
    opacity: computedStyle.opacity !== '1' ? computedStyle.opacity : undefined,
    transition: computedStyle.transition !== 'none 0s ease 0s' ? computedStyle.transition : undefined,
    transform: computedStyle.transform !== 'none' ? computedStyle.transform : undefined,
    filter: computedStyle.filter !== 'none' ? computedStyle.filter : undefined,

    // Background
    backgroundImage: extractBackgroundImage(computedStyle.backgroundImage),
    backgroundSize: computedStyle.backgroundSize || undefined,
    backgroundPosition: computedStyle.backgroundPosition || undefined,
    backgroundRepeat: computedStyle.backgroundRepeat || undefined,

    // Advanced
    zIndex: computedStyle.zIndex !== 'auto' ? computedStyle.zIndex : undefined,
    overflow: computedStyle.overflow !== 'visible' ? computedStyle.overflow : undefined,
    cursor: computedStyle.cursor || undefined,
    pointerEvents: computedStyle.pointerEvents || undefined,
    objectFit: computedStyle.objectFit || undefined,
  };
}

/**
 * Extract box spacing (margin or padding)
 */
function extractBoxSpacing(style: CSSStyleDeclaration, property: 'margin' | 'padding'): BoxSpacing {
  return {
    top: style[`${property}Top` as any] || '0',
    right: style[`${property}Right` as any] || '0',
    bottom: style[`${property}Bottom` as any] || '0',
    left: style[`${property}Left` as any] || '0',
  };
}

/**
 * Extract border style
 */
function extractBorderStyle(style: CSSStyleDeclaration): BorderStyle | undefined {
  const width = style.borderWidth;
  const borderStyle = style.borderStyle;
  const color = style.borderColor;

  if (!width || width === '0px' || borderStyle === 'none') {
    return undefined;
  }

  return {
    width,
    style: borderStyle,
    color: normalizeColor(color) || 'transparent',
  };
}

/**
 * Extract border radius
 */
function extractBorderRadius(style: CSSStyleDeclaration): BorderRadius | undefined {
  const topLeft = style.borderTopLeftRadius;
  const topRight = style.borderTopRightRadius;
  const bottomRight = style.borderBottomRightRadius;
  const bottomLeft = style.borderBottomLeftRadius;

  if (topLeft === '0px' && topRight === '0px' && bottomRight === '0px' && bottomLeft === '0px') {
    return undefined;
  }

  return {
    topLeft: topLeft || '0',
    topRight: topRight || '0',
    bottomRight: bottomRight || '0',
    bottomLeft: bottomLeft || '0',
  };
}

/**
 * Normalize color to hex format
 */
function normalizeColor(color: string): string | undefined {
  if (!color || color === 'transparent' || color === 'rgba(0, 0, 0, 0)') {
    return undefined;
  }

  // If already hex, return as-is
  if (color.startsWith('#')) {
    return color;
  }

  // Convert rgb/rgba to hex
  const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)/);
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1]);
    const g = parseInt(rgbMatch[2]);
    const b = parseInt(rgbMatch[3]);
    return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
  }

  return color;
}

/**
 * Normalize font weight
 */
function normalizeFontWeight(weight: string): string {
  const weightMap: Record<string, string> = {
    'normal': '400',
    'bold': '700',
    'bolder': '700',
    'lighter': '300',
  };

  return weightMap[weight] || weight;
}

/**
 * Extract background image URL
 */
function extractBackgroundImage(bgImage: string): string | undefined {
  if (!bgImage || bgImage === 'none') {
    return undefined;
  }

  // Extract URL from url("...") or url('...')
  const match = bgImage.match(/url\(['"]?([^'"]+)['"]?\)/);
  return match ? match[1] : undefined;
}

/**
 * Parse pixel value to number
 */
export function parsePixels(value: string): number {
  const match = value.match(/^([\d.]+)px$/);
  return match ? parseFloat(match[1]) : 0;
}

/**
 * Check if element has specific style property
 */
export function hasStyle(styles: ExtractedStyles, property: keyof ExtractedStyles): boolean {
  return styles[property] !== undefined && styles[property] !== '' && styles[property] !== 'none';
}

/**
 * Check if element looks like a button (based on styles)
 */
export function looksLikeButton(styles: ExtractedStyles): boolean {
  const hasBackgroundColor = hasStyle(styles, 'backgroundColor');
  const hasPadding = styles.padding && (
    parsePixels(styles.padding.top) > 5 ||
    parsePixels(styles.padding.left) > 10
  );
  const hasBorderRadius = styles.borderRadius && (
    parsePixels(styles.borderRadius.topLeft) > 0
  );
  const hasPointerCursor = styles.cursor === 'pointer';
  const isInlineOrFlex = styles.display === 'inline-block' ||
                         styles.display === 'inline-flex' ||
                         styles.display === 'flex';

  // Button-like if it has 3+ button characteristics
  let score = 0;
  if (hasBackgroundColor) score++;
  if (hasPadding) score++;
  if (hasBorderRadius) score++;
  if (hasPointerCursor) score++;
  if (isInlineOrFlex) score++;

  return score >= 3;
}

/**
 * Check if element looks like a heading (based on styles)
 */
export function looksLikeHeading(styles: ExtractedStyles): boolean {
  const fontSizeNum = parsePixels(styles.fontSize || '16px');
  const fontWeightNum = parseInt(styles.fontWeight || '400');

  return fontSizeNum > 20 && fontWeightNum >= 600;
}

/**
 * Extract inline styles from style attribute
 */
export function extractInlineStyles(styleAttr: string): Partial<ExtractedStyles> {
  const styles: Partial<ExtractedStyles> = {};

  if (!styleAttr) return styles;

  const declarations = styleAttr.split(';').filter(d => d.trim());

  for (const declaration of declarations) {
    const [property, value] = declaration.split(':').map(s => s.trim());

    if (!property || !value) continue;

    // Map common CSS properties
    switch (property) {
      case 'background-color':
        styles.backgroundColor = normalizeColor(value);
        break;
      case 'color':
        styles.color = normalizeColor(value);
        break;
      case 'font-size':
        styles.fontSize = value;
        break;
      case 'font-weight':
        styles.fontWeight = normalizeFontWeight(value);
        break;
      case 'font-family':
        styles.fontFamily = value;
        break;
      case 'text-align':
        styles.textAlign = value;
        break;
      case 'padding':
        // Simple padding parsing (would need more complex logic for full support)
        styles.padding = { top: value, right: value, bottom: value, left: value };
        break;
      case 'margin':
        styles.margin = { top: value, right: value, bottom: value, left: value };
        break;
      case 'border-radius':
        styles.borderRadius = { topLeft: value, topRight: value, bottomRight: value, bottomLeft: value };
        break;
      case 'width':
        styles.width = value;
        break;
      case 'height':
        styles.height = value;
        break;
    }
  }

  return styles;
}

/**
 * Extract styles using advanced Puppeteer-based analysis
 *
 * This provides more accurate results than jsdom-based extraction:
 * - Real browser rendering
 * - Responsive breakpoints
 * - Interactive states (hover, focus, active)
 * - Pseudo-elements (::before, ::after)
 * - Behavioral analysis (animations, transitions, event listeners)
 * - Media queries
 * - Shadow DOM support
 */
export async function extractStylesAdvanced(
  html: string,
  selector?: string,
  options?: {
    includeResponsive?: boolean;
    includeInteractive?: boolean;
    includePseudoElements?: boolean;
    includeBehavior?: boolean;
    includeMediaQueries?: boolean;
    includeShadowDOM?: boolean;
  }
): Promise<AdvancedElementAnalysis> {
  return await analyzeElementAdvanced(html, selector, {
    extractResponsive: options?.includeResponsive ?? true,
    extractInteractive: options?.includeInteractive ?? true,
    extractPseudoElements: options?.includePseudoElements ?? true,
    extractBehavior: options?.includeBehavior ?? true,
    extractMediaQueries: options?.includeMediaQueries ?? true,
    extractShadowDOM: options?.includeShadowDOM ?? true,
  });
}

/**
 * Helper: Get best available styles (responsive-aware)
 *
 * Returns desktop styles by default, but can return mobile/tablet based on preference
 */
export function getBestStyles(
  analysis: AdvancedElementAnalysis,
  preferBreakpoint?: 'mobile' | 'tablet' | 'laptop' | 'desktop'
): ExtractedStyles {
  if (!analysis.responsiveStyles || !preferBreakpoint) {
    return analysis.baseStyles;
  }

  return analysis.responsiveStyles[preferBreakpoint] || analysis.baseStyles;
}

/**
 * Helper: Check if element has different styles at different breakpoints
 */
export function isResponsive(analysis: AdvancedElementAnalysis): boolean {
  if (!analysis.responsiveStyles) {
    return false;
  }

  const base = JSON.stringify(analysis.baseStyles);
  const mobile = JSON.stringify(analysis.responsiveStyles.mobile);
  const tablet = JSON.stringify(analysis.responsiveStyles.tablet);

  return base !== mobile || base !== tablet;
}

/**
 * Helper: Check if element has interactive states
 */
export function hasInteractiveStates(analysis: AdvancedElementAnalysis): boolean {
  if (!analysis.interactiveStates) {
    return false;
  }

  return !!(
    analysis.interactiveStates.hover ||
    analysis.interactiveStates.focus ||
    analysis.interactiveStates.active
  );
}

/**
 * Helper: Check if element has pseudo-elements
 */
export function hasPseudoElements(analysis: AdvancedElementAnalysis): boolean {
  if (!analysis.pseudoElements) {
    return false;
  }

  return !!(analysis.pseudoElements.before || analysis.pseudoElements.after);
}

/**
 * Helper: Check if element is animated
 */
export function isAnimated(analysis: AdvancedElementAnalysis): boolean {
  if (!analysis.behavior) {
    return false;
  }

  return analysis.behavior.hasAnimations || analysis.behavior.hasTransitions;
}
