/**
 * Advanced Element Analyzer
 *
 * Uses Puppeteer for accurate browser rendering and comprehensive element analysis:
 * - Computed styles with browser rendering
 * - Responsive breakpoint detection
 * - Interactive states (hover, focus, active)
 * - Pseudo-element extraction
 * - Behavioral analysis (event listeners, animations)
 * - Media query analysis
 * - Shadow DOM support
 */

import puppeteer, { Browser, Page, ElementHandle } from 'puppeteer';
import type {
  ExtractedStyles,
  ResponsiveStyles,
  StylesWithStates,
  BehavioralAnalysis,
  MediaQueryAnalysis,
  AdvancedElementAnalysis,
  CSSVariables,
  SVGStyles
} from '../types/component.types.js';

// Browser instance management (singleton)
let browserInstance: Browser | null = null;

/**
 * Helper: Delay function
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Get or create browser instance
 */
async function getBrowser(): Promise<Browser> {
  if (!browserInstance || !browserInstance.isConnected()) {
    browserInstance = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu'
      ]
    });
  }
  return browserInstance;
}

/**
 * Close browser instance
 */
export async function closeBrowser(): Promise<void> {
  if (browserInstance) {
    await browserInstance.close();
    browserInstance = null;
  }
}

/**
 * Viewport configurations for responsive testing
 */
const VIEWPORTS = {
  mobile: { width: 375, height: 667, deviceScaleFactor: 2, isMobile: true },
  tablet: { width: 768, height: 1024, deviceScaleFactor: 2, isMobile: true },
  desktop: { width: 1920, height: 1080, deviceScaleFactor: 1, isMobile: false },
  laptop: { width: 1366, height: 768, deviceScaleFactor: 1, isMobile: false },
};

/**
 * Main function: Analyze element with full browser rendering
 */
export async function analyzeElementAdvanced(
  html: string,
  selector?: string,
  options: {
    extractResponsive?: boolean;
    extractInteractive?: boolean;
    extractPseudoElements?: boolean;
    extractBehavior?: boolean;
    extractMediaQueries?: boolean;
    extractShadowDOM?: boolean;
  } = {}
): Promise<AdvancedElementAnalysis> {
  const {
    extractResponsive = true,
    extractInteractive = true,
    extractPseudoElements = true,
    extractBehavior = true,
    extractMediaQueries = true,
    extractShadowDOM = true,
  } = options;

  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    // Load HTML content
    await page.setContent(html, { waitUntil: 'networkidle0' });

    // Wait for any dynamic content
    await delay(500);

    // Get target element
    const element = selector
      ? await page.$(selector)
      : await page.$('body > *:first-child');

    if (!element) {
      throw new Error(`Element not found: ${selector || 'body > *:first-child'}`);
    }

    // Extract base styles (desktop)
    const baseStyles = await extractComputedStyles(page, element);

    // Extract responsive styles
    let responsiveStyles: ResponsiveStyles | undefined;
    if (extractResponsive) {
      responsiveStyles = await extractResponsiveStyles(page, html, selector);
    }

    // Extract interactive states
    let interactiveStates: StylesWithStates | undefined;
    if (extractInteractive) {
      interactiveStates = await extractInteractiveStates(page, element);
    }

    // Extract pseudo-elements
    let pseudoElements: { before?: ExtractedStyles; after?: ExtractedStyles } | undefined;
    if (extractPseudoElements) {
      pseudoElements = await extractPseudoElementStyles(page, element);
    }

    // Extract behavioral analysis
    let behavior: BehavioralAnalysis | undefined;
    if (extractBehavior) {
      behavior = await analyzeBehavior(page, element);
    }

    // Extract media queries
    let mediaQueries: MediaQueryAnalysis | undefined;
    if (extractMediaQueries) {
      mediaQueries = await analyzeMediaQueries(page);
    }

    // Extract from Shadow DOM
    let shadowDOMElements: AdvancedElementAnalysis[] | undefined;
    if (extractShadowDOM) {
      shadowDOMElements = await extractShadowDOMElements(page, element);
    }

    // Extract CSS variables
    const cssVariables = await extractCSSVariables(page, element);

    // Extract SVG styles (if applicable)
    let svgStyles: SVGStyles | undefined;
    const isSVG = await page.evaluate((el) => {
      return el.tagName.toLowerCase() === 'svg' ||
             el.closest('svg') !== null ||
             el.tagName.toLowerCase().includes('svg');
    }, element);

    if (isSVG) {
      svgStyles = await extractSVGStyles(page, element);
    }

    return {
      baseStyles,
      responsiveStyles,
      interactiveStates,
      pseudoElements,
      behavior,
      mediaQueries,
      shadowDOMElements,
      cssVariables,
      svgStyles,
    };
  } finally {
    await page.close();
  }
}

/**
 * Extract computed styles from element
 */
async function extractComputedStyles(
  page: Page,
  element: ElementHandle
): Promise<ExtractedStyles> {
  return await page.evaluate((el) => {
    const computed = window.getComputedStyle(el);

    // Helper: Parse box spacing
    const parseBoxSpacing = (prop: string) => {
      const top = computed.getPropertyValue(`${prop}-top`);
      const right = computed.getPropertyValue(`${prop}-right`);
      const bottom = computed.getPropertyValue(`${prop}-bottom`);
      const left = computed.getPropertyValue(`${prop}-left`);
      return { top, right, bottom, left };
    };

    // Helper: Parse border radius
    const parseBorderRadius = () => {
      return {
        topLeft: computed.borderTopLeftRadius,
        topRight: computed.borderTopRightRadius,
        bottomRight: computed.borderBottomRightRadius,
        bottomLeft: computed.borderBottomLeftRadius,
      };
    };

    // Helper: Normalize color to hex
    const normalizeColor = (color: string): string | undefined => {
      if (!color || color === 'rgba(0, 0, 0, 0)' || color === 'transparent') {
        return undefined;
      }

      // Convert rgb/rgba to hex
      const rgbMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
      if (rgbMatch) {
        const r = parseInt(rgbMatch[1]);
        const g = parseInt(rgbMatch[2]);
        const b = parseInt(rgbMatch[3]);
        const a = rgbMatch[4] ? parseFloat(rgbMatch[4]) : 1;

        if (a < 1) {
          return `rgba(${r}, ${g}, ${b}, ${a})`;
        }

        return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
      }

      return color;
    };

    return {
      // Layout
      display: computed.display,
      position: computed.position,
      flexDirection: computed.flexDirection !== 'row' ? computed.flexDirection : undefined,
      justifyContent: computed.justifyContent !== 'normal' ? computed.justifyContent : undefined,
      alignItems: computed.alignItems !== 'normal' ? computed.alignItems : undefined,
      gridTemplateColumns: computed.gridTemplateColumns !== 'none' ? computed.gridTemplateColumns : undefined,
      gridTemplateRows: computed.gridTemplateRows !== 'none' ? computed.gridTemplateRows : undefined,
      gap: computed.gap !== 'normal' && computed.gap !== '0px' ? computed.gap : undefined,

      // Box Model
      width: computed.width,
      height: computed.height,
      minWidth: computed.minWidth !== '0px' ? computed.minWidth : undefined,
      maxWidth: computed.maxWidth !== 'none' ? computed.maxWidth : undefined,
      minHeight: computed.minHeight !== '0px' ? computed.minHeight : undefined,
      maxHeight: computed.maxHeight !== 'none' ? computed.maxHeight : undefined,
      margin: parseBoxSpacing('margin'),
      padding: parseBoxSpacing('padding'),

      // Border
      border: {
        width: computed.borderWidth,
        style: computed.borderStyle,
        color: normalizeColor(computed.borderColor) || '',
        radius: parseBorderRadius(),
      },

      // Colors
      backgroundColor: normalizeColor(computed.backgroundColor),
      color: normalizeColor(computed.color),
      borderColor: normalizeColor(computed.borderColor),

      // Typography
      fontFamily: computed.fontFamily,
      fontSize: computed.fontSize,
      fontWeight: computed.fontWeight,
      fontStyle: computed.fontStyle !== 'normal' ? computed.fontStyle : undefined,
      lineHeight: computed.lineHeight,
      letterSpacing: computed.letterSpacing !== 'normal' ? computed.letterSpacing : undefined,
      textAlign: computed.textAlign !== 'start' ? computed.textAlign : undefined,
      textDecoration: computed.textDecoration !== 'none solid rgb(0, 0, 0)' ? computed.textDecoration : undefined,
      textTransform: computed.textTransform !== 'none' ? computed.textTransform : undefined,

      // Effects
      boxShadow: computed.boxShadow !== 'none' ? computed.boxShadow : undefined,
      textShadow: computed.textShadow !== 'none' ? computed.textShadow : undefined,
      opacity: computed.opacity !== '1' ? computed.opacity : undefined,
      transition: computed.transition !== 'all 0s ease 0s' ? computed.transition : undefined,
      transform: computed.transform !== 'none' ? computed.transform : undefined,
      filter: computed.filter !== 'none' ? computed.filter : undefined,

      // Background
      backgroundImage: computed.backgroundImage !== 'none' ? computed.backgroundImage : undefined,
      backgroundSize: computed.backgroundSize !== 'auto' ? computed.backgroundSize : undefined,
      backgroundPosition: computed.backgroundPosition !== '0% 0%' ? computed.backgroundPosition : undefined,
      backgroundRepeat: computed.backgroundRepeat !== 'repeat' ? computed.backgroundRepeat : undefined,

      // Advanced
      zIndex: computed.zIndex !== 'auto' ? computed.zIndex : undefined,
      overflow: computed.overflow !== 'visible' ? computed.overflow : undefined,
      cursor: computed.cursor !== 'auto' ? computed.cursor : undefined,
      pointerEvents: computed.pointerEvents !== 'auto' ? computed.pointerEvents : undefined,
    } as ExtractedStyles;
  }, element);
}

/**
 * Extract responsive styles at different breakpoints
 */
async function extractResponsiveStyles(
  page: Page,
  html: string,
  selector?: string
): Promise<ResponsiveStyles> {
  const responsiveStyles: ResponsiveStyles = {
    mobile: {} as ExtractedStyles,
    tablet: {} as ExtractedStyles,
    desktop: {} as ExtractedStyles,
    laptop: {} as ExtractedStyles,
  };

  for (const [breakpoint, viewport] of Object.entries(VIEWPORTS)) {
    await page.setViewport(viewport);
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await delay(300); // Wait for CSS transitions

    const element = selector
      ? await page.$(selector)
      : await page.$('body > *:first-child');

    if (element) {
      const styles = await extractComputedStyles(page, element);
      if (breakpoint === 'mobile' || breakpoint === 'tablet' || breakpoint === 'desktop' || breakpoint === 'laptop') {
        responsiveStyles[breakpoint] = styles;
      }
    }
  }

  // Reset to desktop
  await page.setViewport(VIEWPORTS.desktop);

  return responsiveStyles;
}

/**
 * Extract interactive states (hover, focus, active)
 */
async function extractInteractiveStates(
  page: Page,
  element: ElementHandle
): Promise<StylesWithStates> {
  const normalStyles = await extractComputedStyles(page, element);

  // Extract hover state
  let hoverStyles: ExtractedStyles | undefined;
  try {
    await element.hover();
    await delay(100); // Wait for hover transition
    hoverStyles = await extractComputedStyles(page, element);
  } catch (error) {
    // Element might not be hoverable
    hoverStyles = undefined;
  }

  // Extract focus state (if focusable)
  let focusStyles: ExtractedStyles | undefined;
  try {
    await element.focus();
    await delay(100);
    focusStyles = await extractComputedStyles(page, element);
  } catch (error) {
    // Element might not be focusable
    focusStyles = undefined;
  }

  // Extract active state (simulate click hold)
  let activeStyles: ExtractedStyles | undefined;
  try {
    const box = await element.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await delay(100);
      activeStyles = await extractComputedStyles(page, element);
      await page.mouse.up();
    }
  } catch (error) {
    activeStyles = undefined;
  }

  return {
    normal: normalStyles,
    hover: hoverStyles,
    focus: focusStyles,
    active: activeStyles,
  };
}

/**
 * Extract pseudo-element styles (::before, ::after)
 */
async function extractPseudoElementStyles(
  page: Page,
  element: ElementHandle
): Promise<{ before?: ExtractedStyles; after?: ExtractedStyles }> {
  return await page.evaluate((el) => {
    const result: { before?: ExtractedStyles; after?: ExtractedStyles } = {};

    // Extract ::before
    const beforeStyles = window.getComputedStyle(el, '::before');
    if (beforeStyles.content && beforeStyles.content !== 'none' && beforeStyles.content !== '""') {
      result.before = {
        content: beforeStyles.content,
        display: beforeStyles.display,
        position: beforeStyles.position,
        width: beforeStyles.width,
        height: beforeStyles.height,
        backgroundColor: beforeStyles.backgroundColor,
        color: beforeStyles.color,
        fontSize: beforeStyles.fontSize,
        fontWeight: beforeStyles.fontWeight,
      } as ExtractedStyles;
    }

    // Extract ::after
    const afterStyles = window.getComputedStyle(el, '::after');
    if (afterStyles.content && afterStyles.content !== 'none' && afterStyles.content !== '""') {
      result.after = {
        content: afterStyles.content,
        display: afterStyles.display,
        position: afterStyles.position,
        width: afterStyles.width,
        height: afterStyles.height,
        backgroundColor: afterStyles.backgroundColor,
        color: afterStyles.color,
        fontSize: afterStyles.fontSize,
        fontWeight: afterStyles.fontWeight,
      } as ExtractedStyles;
    }

    return result;
  }, element);
}

/**
 * Analyze element behavior (event listeners, animations)
 */
async function analyzeBehavior(
  page: Page,
  element: ElementHandle
): Promise<BehavioralAnalysis> {
  return await page.evaluate((el) => {
    const analysis: BehavioralAnalysis = {
      hasEventListeners: false,
      eventTypes: [],
      hasAnimations: false,
      animations: [],
      hasTransitions: false,
      transitions: [],
      isInteractive: false,
    };

    // Check for event listeners (this is limited - can't access all listeners)
    const interactiveTags = ['button', 'a', 'input', 'select', 'textarea'];
    const isInteractiveTag = interactiveTags.includes(el.tagName.toLowerCase());
    const hasOnClickAttr = el.hasAttribute('onclick');
    const hasCursorPointer = window.getComputedStyle(el).cursor === 'pointer';

    analysis.isInteractive = isInteractiveTag || hasOnClickAttr || hasCursorPointer;

    // Check for onclick, onsubmit, etc.
    const eventAttrs = ['onclick', 'onmouseover', 'onmouseout', 'onsubmit', 'onchange', 'onkeyup', 'onkeydown'];
    for (const attr of eventAttrs) {
      if (el.hasAttribute(attr)) {
        analysis.hasEventListeners = true;
        analysis.eventTypes.push(attr.replace('on', ''));
      }
    }

    // Check for CSS animations
    const computed = window.getComputedStyle(el);
    const animationName = computed.animationName;
    if (animationName && animationName !== 'none') {
      analysis.hasAnimations = true;
      analysis.animations.push({
        name: animationName,
        duration: computed.animationDuration,
        timingFunction: computed.animationTimingFunction,
        delay: computed.animationDelay,
        iterationCount: computed.animationIterationCount,
        direction: computed.animationDirection,
        fillMode: computed.animationFillMode,
      });
    }

    // Check for CSS transitions
    const transition = computed.transition;
    if (transition && transition !== 'all 0s ease 0s') {
      analysis.hasTransitions = true;
      analysis.transitions.push({
        property: computed.transitionProperty,
        duration: computed.transitionDuration,
        timingFunction: computed.transitionTimingFunction,
        delay: computed.transitionDelay,
      });
    }

    return analysis;
  }, element);
}

/**
 * Analyze media queries in the page
 */
async function analyzeMediaQueries(page: Page): Promise<MediaQueryAnalysis> {
  return await page.evaluate(() => {
    const mediaQueries: MediaQueryAnalysis = {
      queries: [],
      breakpoints: [],
    };

    // Get all stylesheets
    const styleSheets = Array.from(document.styleSheets);

    for (const sheet of styleSheets) {
      try {
        const rules = Array.from(sheet.cssRules || []);

        for (const rule of rules) {
          if (rule instanceof CSSMediaRule) {
            const query = rule.conditionText || rule.media.mediaText;

            // Parse breakpoint from query
            const widthMatch = query.match(/(?:min-width|max-width):\s*(\d+)px/);
            if (widthMatch) {
              const breakpoint = parseInt(widthMatch[1]);

              if (!mediaQueries.breakpoints.includes(breakpoint)) {
                mediaQueries.breakpoints.push(breakpoint);
              }

              mediaQueries.queries.push({
                query,
                breakpoint,
                rules: Array.from(rule.cssRules).map(r => r.cssText),
              });
            }
          }
        }
      } catch (error) {
        // CORS or other errors accessing stylesheet
        continue;
      }
    }

    // Sort breakpoints
    mediaQueries.breakpoints.sort((a, b) => a - b);

    return mediaQueries;
  });
}

/**
 * Extract elements from Shadow DOM
 */
async function extractShadowDOMElements(
  page: Page,
  element: ElementHandle
): Promise<AdvancedElementAnalysis[]> {
  const shadowElements: AdvancedElementAnalysis[] = [];

  const hasShadowRoot = await page.evaluate((el) => {
    return !!el.shadowRoot;
  }, element);

  if (!hasShadowRoot) {
    return shadowElements;
  }

  // Get shadow root elements
  const shadowChildren = await page.evaluateHandle((el) => {
    return Array.from(el.shadowRoot?.children || []);
  }, element);

  const childrenArray = await shadowChildren.getProperties();

  // Convert Map to array for iteration
  const childrenEntries = Array.from(childrenArray.values());

  for (const childHandle of childrenEntries) {
    const childElement = childHandle.asElement();
    if (childElement) {
      // Cast to Element type for Puppeteer compatibility
      const elementHandle = childElement as ElementHandle<Element>;
      const baseStyles = await extractComputedStyles(page, elementHandle);
      const behavior = await analyzeBehavior(page, elementHandle);

      shadowElements.push({
        baseStyles,
        behavior,
        isShadowDOMElement: true,
      });
    }
  }

  return shadowElements;
}

/**
 * Extract CSS Custom Properties (CSS Variables)
 */
async function extractCSSVariables(
  page: Page,
  element: ElementHandle
): Promise<CSSVariables> {
  return await page.evaluate((el) => {
    const variables: Record<string, string> = {};
    const resolvedValues: Record<string, string> = {};
    const usedInElement: string[] = [];

    // Get all CSS variables from :root and document
    const rootStyles = window.getComputedStyle(document.documentElement);
    for (let i = 0; i < rootStyles.length; i++) {
      const prop = rootStyles[i];
      if (prop.startsWith('--')) {
        const value = rootStyles.getPropertyValue(prop).trim();
        variables[prop] = value;
      }
    }

    // Get CSS variables from the element itself
    const elementStyles = window.getComputedStyle(el);
    for (let i = 0; i < elementStyles.length; i++) {
      const prop = elementStyles[i];
      if (prop.startsWith('--')) {
        const value = elementStyles.getPropertyValue(prop).trim();
        variables[prop] = value;
      }
    }

    // Detect which CSS variables are used in this element's styles
    const styleProperties = [
      'color', 'backgroundColor', 'borderColor',
      'fontSize', 'fontFamily', 'lineHeight',
      'width', 'height', 'margin', 'padding',
      'boxShadow', 'textShadow', 'transform'
    ];

    for (const prop of styleProperties) {
      const value = elementStyles.getPropertyValue(prop);
      if (value && value.includes('var(--')) {
        const varMatch = value.match(/var\((--[\w-]+)\)/g);
        if (varMatch) {
          for (const match of varMatch) {
            const varName = match.replace(/var\(|\)/g, '');
            if (!usedInElement.includes(varName)) {
              usedInElement.push(varName);
            }

            // Resolve the variable value
            const resolvedValue = elementStyles.getPropertyValue(varName.trim());
            if (resolvedValue) {
              resolvedValues[varName] = resolvedValue.trim();
            }
          }
        }
      }
    }

    return {
      variables,
      resolvedValues,
      usedInElement,
    };
  }, element);
}

/**
 * Extract SVG-specific styles and attributes
 */
async function extractSVGStyles(
  page: Page,
  element: ElementHandle
): Promise<SVGStyles> {
  return await page.evaluate((el) => {
    const tagName = el.tagName.toLowerCase();
    const isSVGElement = tagName === 'svg' || el.closest('svg') !== null;

    if (!isSVGElement) {
      return {
        isSVG: false,
      };
    }

    // Determine SVG type
    let svgType: 'inline' | 'image' | 'background' | 'object' | 'embed' = 'inline';
    if (tagName === 'img' && el.getAttribute('src')?.endsWith('.svg')) {
      svgType = 'image';
    } else if (tagName === 'object' && el.getAttribute('data')?.endsWith('.svg')) {
      svgType = 'object';
    } else if (tagName === 'embed' && el.getAttribute('src')?.endsWith('.svg')) {
      svgType = 'embed';
    }

    // Get SVG element (either current element or closest SVG parent)
    const svgElement = tagName === 'svg' ? el : el.closest('svg');
    if (!svgElement) {
      return {
        isSVG: true,
        svgType,
      };
    }

    // Extract presentation attributes
    const computed = window.getComputedStyle(el);

    // Helper: Get attribute or computed style
    const getAttrOrStyle = (attr: string, styleProp?: string): string | undefined => {
      const attrValue = el.getAttribute(attr);
      if (attrValue) return attrValue;
      if (styleProp) {
        const styleValue = computed.getPropertyValue(styleProp);
        if (styleValue && styleValue !== 'none') return styleValue;
      }
      return undefined;
    };

    // Extract all relevant attributes
    const attributes: Record<string, string> = {};
    const svgAttrs = [
      'id', 'class', 'x', 'y', 'cx', 'cy', 'r', 'rx', 'ry',
      'd', 'points', 'x1', 'y1', 'x2', 'y2',
      'href', 'xlink:href', 'style'
    ];

    for (const attr of svgAttrs) {
      const value = el.getAttribute(attr);
      if (value) {
        attributes[attr] = value;
      }
    }

    return {
      isSVG: true,
      svgType,

      // Presentation attributes
      fill: getAttrOrStyle('fill'),
      stroke: getAttrOrStyle('stroke'),
      strokeWidth: getAttrOrStyle('stroke-width', 'stroke-width'),
      strokeLinecap: getAttrOrStyle('stroke-linecap', 'stroke-linecap'),
      strokeLinejoin: getAttrOrStyle('stroke-linejoin', 'stroke-linejoin'),
      strokeDasharray: getAttrOrStyle('stroke-dasharray', 'stroke-dasharray'),
      strokeDashoffset: getAttrOrStyle('stroke-dashoffset', 'stroke-dashoffset'),
      opacity: getAttrOrStyle('opacity', 'opacity'),
      fillOpacity: getAttrOrStyle('fill-opacity', 'fill-opacity'),
      strokeOpacity: getAttrOrStyle('stroke-opacity', 'stroke-opacity'),

      // SVG structure
      viewBox: svgElement.getAttribute('viewBox') || undefined,
      preserveAspectRatio: svgElement.getAttribute('preserveAspectRatio') || undefined,
      width: getAttrOrStyle('width', 'width'),
      height: getAttrOrStyle('height', 'height'),

      // Transforms
      transform: getAttrOrStyle('transform', 'transform'),

      // Filters and effects
      filter: getAttrOrStyle('filter', 'filter'),
      clipPath: getAttrOrStyle('clip-path', 'clip-path'),
      mask: getAttrOrStyle('mask', 'mask'),

      // Text-specific
      textAnchor: tagName === 'text' ? getAttrOrStyle('text-anchor', 'text-anchor') : undefined,
      dominantBaseline: tagName === 'text' ? getAttrOrStyle('dominant-baseline', 'dominant-baseline') : undefined,

      // Additional attributes
      attributes,
    };
  }, element);
}

/**
 * Batch analyze multiple elements efficiently
 */
export async function analyzeMultipleElements(
  html: string,
  selectors: string[],
  options?: {
    extractResponsive?: boolean;
    extractInteractive?: boolean;
    extractPseudoElements?: boolean;
    extractBehavior?: boolean;
  }
): Promise<Map<string, AdvancedElementAnalysis>> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  const results = new Map<string, AdvancedElementAnalysis>();

  try {
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await delay(500);

    for (const selector of selectors) {
      try {
        const analysis = await analyzeElementAdvanced(html, selector, options);
        results.set(selector, analysis);
      } catch (error) {
        console.warn(`Failed to analyze element: ${selector}`, error);
      }
    }
  } finally {
    await page.close();
  }

  return results;
}

/**
 * Analyze entire page (all elements)
 */
export async function analyzeEntirePage(
  html: string,
  options?: {
    extractResponsive?: boolean;
    extractInteractive?: boolean;
    extractPseudoElements?: boolean;
    extractBehavior?: boolean;
    extractMediaQueries?: boolean;
  }
): Promise<{
  elements: Map<string, AdvancedElementAnalysis>;
  mediaQueries?: MediaQueryAnalysis;
}> {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setContent(html, { waitUntil: 'networkidle0' });
    await delay(500);

    // Get all meaningful elements (skip scripts, styles, etc.)
    const selectors = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('body *'));
      const ignoreTags = ['script', 'style', 'noscript', 'meta', 'link'];

      return elements
        .filter(el => !ignoreTags.includes(el.tagName.toLowerCase()))
        .map((el, index) => {
          // Generate unique selector
          if (el.id) return `#${el.id}`;
          if (el.className && typeof el.className === 'string') {
            const classes = el.className.trim().split(/\s+/).slice(0, 2).join('.');
            return `.${classes}`;
          }
          return `${el.tagName.toLowerCase()}:nth-of-type(${index + 1})`;
        })
        .filter((selector, index, self) => self.indexOf(selector) === index); // Unique only
    });

    // Analyze all elements
    const elements = await analyzeMultipleElements(html, selectors, options);

    // Extract media queries
    let mediaQueries: MediaQueryAnalysis | undefined;
    if (options?.extractMediaQueries !== false) {
      mediaQueries = await analyzeMediaQueries(page);
    }

    return { elements, mediaQueries };
  } finally {
    await page.close();
  }
}
