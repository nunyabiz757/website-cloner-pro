/**
 * Custom Code Detection
 *
 * Detects and analyzes custom JavaScript and CSS that may not be convertible:
 * - JavaScript libraries and frameworks
 * - Custom animations and transitions
 * - Complex interactive behaviors
 * - Unsupported CSS features
 * - Page builder incompatibilities
 */

import { JSDOM } from 'jsdom';
import type {
  CustomCodeDetection,
  ConversionWarning,
  DetectedFeature,
  Incompatibility,
} from '../types/component.types.js';

/**
 * Main function: Detect custom code in HTML
 */
export function detectCustomCode(html: string): CustomCodeDetection {
  const dom = new JSDOM(html);
  const document = dom.window.document;

  // Detect custom JavaScript
  const { hasCustomJS, jsWarnings, jsFeatures, jsIncompatibilities } = analyzeJavaScript(document);

  // Detect custom CSS
  const { hasCustomCSS, cssWarnings, cssFeatures, cssIncompatibilities } = analyzeCSS(document);

  // Combine all warnings and features
  const conversionWarnings = [...jsWarnings, ...cssWarnings];
  const detectedFeatures = [...jsFeatures, ...cssFeatures];
  const incompatibilities = [...jsIncompatibilities, ...cssIncompatibilities];

  // Calculate conversion score
  const conversionScore = calculateConversionScore(
    hasCustomJS,
    hasCustomCSS,
    incompatibilities,
    detectedFeatures
  );

  // Determine if can be converted
  const canBeConverted = conversionScore >= 50 && incompatibilities.filter(i => i.impact === 'blocking').length === 0;

  return {
    hasCustomJS,
    hasCustomCSS,
    canBeConverted,
    conversionWarnings,
    detectedFeatures,
    incompatibilities,
    conversionScore,
  };
}

/**
 * Analyze JavaScript code
 */
function analyzeJavaScript(document: Document): {
  hasCustomJS: boolean;
  jsWarnings: ConversionWarning[];
  jsFeatures: DetectedFeature[];
  jsIncompatibilities: Incompatibility[];
} {
  const jsWarnings: ConversionWarning[] = [];
  const jsFeatures: DetectedFeature[] = [];
  const jsIncompatibilities: Incompatibility[] = [];

  // Get all script tags
  const scripts = Array.from(document.querySelectorAll('script'));
  const inlineScripts = scripts.filter(s => !s.src);
  const externalScripts = scripts.filter(s => s.src);

  const hasCustomJS = inlineScripts.length > 0 || externalScripts.length > 0;

  // Analyze inline scripts
  for (const script of inlineScripts) {
    const code = script.textContent || '';

    // Detect libraries
    detectJavaScriptLibraries(code, jsFeatures, jsIncompatibilities);

    // Detect DOM manipulation
    detectDOMManipulation(code, jsWarnings, jsFeatures);

    // Detect event listeners
    detectEventListeners(code, jsWarnings, jsFeatures);

    // Detect AJAX/Fetch
    detectAsyncOperations(code, jsWarnings, jsFeatures);

    // Detect animations
    detectJSAnimations(code, jsWarnings, jsFeatures);

    // Detect form handling
    detectFormHandling(code, jsWarnings, jsFeatures);

    // Detect complex features
    detectComplexFeatures(code, jsWarnings, jsIncompatibilities);
  }

  // Analyze external scripts
  for (const script of externalScripts) {
    const src = script.src;

    // Detect known libraries from URLs
    detectLibraryFromURL(src, jsFeatures, jsIncompatibilities);
  }

  return { hasCustomJS, jsWarnings, jsFeatures, jsIncompatibilities };
}

/**
 * Detect JavaScript libraries
 */
function detectJavaScriptLibraries(
  code: string,
  features: DetectedFeature[],
  incompatibilities: Incompatibility[]
): void {
  const libraries = [
    { name: 'jQuery', pattern: /\$\(|jQuery\(/, supported: true },
    { name: 'React', pattern: /React\.|ReactDOM/, supported: false },
    { name: 'Vue', pattern: /new Vue\(|Vue\./, supported: false },
    { name: 'Angular', pattern: /angular\.|ng-/, supported: false },
    { name: 'GSAP', pattern: /gsap\.|TweenMax|TweenLite/, supported: true },
    { name: 'Three.js', pattern: /THREE\./, supported: false },
    { name: 'D3.js', pattern: /d3\./, supported: false },
  ];

  for (const lib of libraries) {
    if (lib.pattern.test(code)) {
      if (lib.supported) {
        features.push({
          type: 'javascript',
          feature: lib.name,
          description: `${lib.name} library detected`,
          isSupported: true,
          examples: [],
        });
      } else {
        incompatibilities.push({
          type: 'library',
          name: lib.name,
          reason: `${lib.name} requires JavaScript runtime and cannot be converted to page builder widgets`,
          impact: 'blocking',
          workaround: 'Consider using page builder native widgets or custom HTML widget with embedded code',
        });
      }
    }
  }
}

/**
 * Detect library from script URL
 */
function detectLibraryFromURL(
  url: string,
  features: DetectedFeature[],
  incompatibilities: Incompatibility[]
): void {
  const libraries = [
    { name: 'jQuery', pattern: /jquery/i, supported: true },
    { name: 'React', pattern: /react/i, supported: false },
    { name: 'Vue', pattern: /vue/i, supported: false },
    { name: 'Angular', pattern: /angular/i, supported: false },
    { name: 'Bootstrap JS', pattern: /bootstrap.*\.js/i, supported: true },
    { name: 'Swiper', pattern: /swiper/i, supported: true },
    { name: 'Slick', pattern: /slick/i, supported: true },
    { name: 'AOS', pattern: /aos/i, supported: true },
    { name: 'GSAP', pattern: /gsap|tweenmax/i, supported: true },
  ];

  for (const lib of libraries) {
    if (lib.pattern.test(url)) {
      if (lib.supported) {
        features.push({
          type: 'javascript',
          feature: lib.name,
          description: `${lib.name} library loaded via ${url}`,
          isSupported: true,
          examples: [],
        });
      } else {
        incompatibilities.push({
          type: 'library',
          name: lib.name,
          reason: `${lib.name} framework detected, cannot be directly converted`,
          impact: 'blocking',
          workaround: 'Use custom HTML widget to embed the framework code',
        });
      }
    }
  }
}

/**
 * Detect DOM manipulation
 */
function detectDOMManipulation(
  code: string,
  warnings: ConversionWarning[],
  features: DetectedFeature[]
): void {
  const patterns = [
    { pattern: /\.innerHTML|\.outerHTML/, feature: 'innerHTML manipulation' },
    { pattern: /\.appendChild|\.removeChild|\.insertBefore/, feature: 'DOM tree manipulation' },
    { pattern: /\.createElement|\.createTextNode/, feature: 'Dynamic element creation' },
    { pattern: /\.classList\.|\.className/, feature: 'Class manipulation' },
    { pattern: /\.setAttribute|\.removeAttribute/, feature: 'Attribute manipulation' },
  ];

  for (const { pattern, feature } of patterns) {
    if (pattern.test(code)) {
      warnings.push({
        type: 'javascript',
        severity: 'warning',
        message: `${feature} detected - may not work in converted page`,
        location: {},
        suggestion: 'Use page builder native widgets instead of DOM manipulation',
        canAutoFix: false,
      });

      features.push({
        type: 'javascript',
        feature,
        description: `Dynamic ${feature} found in code`,
        isSupported: false,
        alternative: 'Use page builder widgets with dynamic content capabilities',
        examples: [],
      });
    }
  }
}

/**
 * Detect event listeners
 */
function detectEventListeners(
  code: string,
  warnings: ConversionWarning[],
  features: DetectedFeature[]
): void {
  const hasEventListeners = /addEventListener|on\w+\s*=|\.on\(/.test(code);

  if (hasEventListeners) {
    warnings.push({
      type: 'javascript',
      severity: 'warning',
      message: 'Event listeners detected - may need custom HTML widget',
      location: {},
      suggestion: 'Page builders support basic interactions. Complex event handling may require custom code widget.',
      canAutoFix: false,
    });

    features.push({
      type: 'javascript',
      feature: 'Event Listeners',
      description: 'Custom event handling code detected',
      isSupported: false,
      alternative: 'Use page builder interaction features or custom HTML widget',
      examples: [],
    });
  }
}

/**
 * Detect async operations
 */
function detectAsyncOperations(
  code: string,
  warnings: ConversionWarning[],
  features: DetectedFeature[]
): void {
  const hasAjax = /\$\.ajax|\$\.get|\$\.post|fetch\(|axios\./i.test(code);
  const hasAsync = /async\s+function|await\s+/.test(code);

  if (hasAjax || hasAsync) {
    warnings.push({
      type: 'javascript',
      severity: 'critical',
      message: 'Asynchronous data fetching detected',
      location: {},
      suggestion: 'Use page builder dynamic data widgets or custom HTML widget with embedded script',
      canAutoFix: false,
    });

    features.push({
      type: 'javascript',
      feature: 'AJAX/Fetch',
      description: 'Asynchronous data loading detected',
      isSupported: false,
      alternative: 'Use page builder dynamic content features or embed as custom code',
      examples: [],
    });
  }
}

/**
 * Detect JS animations
 */
function detectJSAnimations(
  code: string,
  warnings: ConversionWarning[],
  features: DetectedFeature[]
): void {
  const hasAnimations = /\.animate\(|requestAnimationFrame|setInterval|setTimeout.*animate/.test(code);

  if (hasAnimations) {
    warnings.push({
      type: 'javascript',
      severity: 'warning',
      message: 'JavaScript animations detected',
      location: {},
      suggestion: 'Consider using CSS animations or page builder animation features',
      canAutoFix: false,
    });

    features.push({
      type: 'javascript',
      feature: 'JS Animations',
      description: 'JavaScript-based animations found',
      isSupported: true,
      alternative: 'CSS animations or page builder animation widgets',
      examples: [],
    });
  }
}

/**
 * Detect form handling
 */
function detectFormHandling(
  code: string,
  warnings: ConversionWarning[],
  features: DetectedFeature[]
): void {
  const hasFormHandling = /\.submit\(|\.preventDefault\(\)|FormData|serialize/.test(code);

  if (hasFormHandling) {
    warnings.push({
      type: 'javascript',
      severity: 'warning',
      message: 'Custom form handling detected',
      location: {},
      suggestion: 'Use page builder form widgets with built-in submission handling',
      canAutoFix: false,
    });

    features.push({
      type: 'javascript',
      feature: 'Form Handling',
      description: 'Custom form submission logic',
      isSupported: false,
      alternative: 'Page builder form widgets',
      examples: [],
    });
  }
}

/**
 * Detect complex features
 */
function detectComplexFeatures(
  code: string,
  warnings: ConversionWarning[],
  incompatibilities: Incompatibility[]
): void {
  // WebGL/Canvas
  if (/getContext\(['"]webgl|getContext\(['"]2d/.test(code)) {
    incompatibilities.push({
      type: 'javascript',
      name: 'Canvas/WebGL',
      reason: 'Canvas and WebGL require custom JavaScript runtime',
      impact: 'blocking',
      workaround: 'Embed as custom HTML widget',
    });
  }

  // Web Workers
  if (/new Worker\(/.test(code)) {
    incompatibilities.push({
      type: 'javascript',
      name: 'Web Workers',
      reason: 'Web Workers cannot be converted to page builder widgets',
      impact: 'blocking',
      workaround: 'Use custom HTML widget',
    });
  }

  // WebSockets
  if (/new WebSocket\(/.test(code)) {
    incompatibilities.push({
      type: 'javascript',
      name: 'WebSockets',
      reason: 'WebSocket connections require custom code',
      impact: 'degraded',
      workaround: 'Embed as custom HTML widget with script',
    });
  }

  // LocalStorage/SessionStorage
  if (/localStorage\.|sessionStorage\./.test(code)) {
    warnings.push({
      type: 'javascript',
      severity: 'info',
      message: 'Browser storage usage detected',
      location: {},
      suggestion: 'Ensure storage keys don\'t conflict with page builder',
      canAutoFix: false,
    });
  }
}

/**
 * Analyze CSS code
 */
function analyzeCSS(document: Document): {
  hasCustomCSS: boolean;
  cssWarnings: ConversionWarning[];
  cssFeatures: DetectedFeature[];
  cssIncompatibilities: Incompatibility[];
} {
  const cssWarnings: ConversionWarning[] = [];
  const cssFeatures: DetectedFeature[] = [];
  const cssIncompatibilities: Incompatibility[] = [];

  // Get all stylesheets and style tags
  const styleTags = Array.from(document.querySelectorAll('style'));
  const hasCustomCSS = styleTags.length > 0;

  for (const styleTag of styleTags) {
    const css = styleTag.textContent || '';

    // Detect advanced CSS features
    detectCSSFeatures(css, cssFeatures, cssWarnings);

    // Detect animations
    detectCSSAnimations(css, cssFeatures, cssWarnings);

    // Detect custom properties
    detectCSSVariables(css, cssFeatures);

    // Detect grid/flexbox
    detectModernLayout(css, cssFeatures);

    // Detect unsupported features
    detectUnsupportedCSS(css, cssIncompatibilities, cssWarnings);
  }

  return { hasCustomCSS, cssWarnings, cssFeatures, cssIncompatibilities };
}

/**
 * Detect CSS features
 */
function detectCSSFeatures(
  css: string,
  features: DetectedFeature[],
  warnings: ConversionWarning[]
): void {
  // Responsive design
  if (/@media/.test(css)) {
    features.push({
      type: 'css',
      feature: 'Media Queries',
      description: 'Responsive CSS with media queries',
      isSupported: true,
      examples: [],
    });
  }

  // Pseudo-elements
  if (/::before|::after|::first-line|::first-letter/.test(css)) {
    features.push({
      type: 'css',
      feature: 'Pseudo-elements',
      description: 'CSS pseudo-elements for decorative content',
      isSupported: true,
      examples: [],
    });
  }

  // Transform and transitions
  if (/transform:|transition:/.test(css)) {
    features.push({
      type: 'css',
      feature: 'Transforms & Transitions',
      description: 'CSS transforms and transitions',
      isSupported: true,
      examples: [],
    });
  }

  // Filters
  if (/filter:|backdrop-filter:/.test(css)) {
    features.push({
      type: 'css',
      feature: 'CSS Filters',
      description: 'Visual effects using CSS filters',
      isSupported: true,
      examples: [],
    });
  }
}

/**
 * Detect CSS animations
 */
function detectCSSAnimations(
  css: string,
  features: DetectedFeature[],
  warnings: ConversionWarning[]
): void {
  if (/@keyframes/.test(css)) {
    features.push({
      type: 'css',
      feature: 'CSS Animations',
      description: 'Keyframe-based CSS animations',
      isSupported: true,
      alternative: 'Page builder animation widgets may offer similar effects',
      examples: [],
    });

    warnings.push({
      type: 'css',
      severity: 'info',
      message: 'CSS animations detected - may need manual adjustment in page builder',
      location: {},
      suggestion: 'Use page builder animation features for better control',
      canAutoFix: false,
    });
  }
}

/**
 * Detect CSS variables
 */
function detectCSSVariables(css: string, features: DetectedFeature[]): void {
  if (/--[\w-]+:/.test(css)) {
    features.push({
      type: 'css',
      feature: 'CSS Custom Properties',
      description: 'CSS variables (custom properties)',
      isSupported: true,
      examples: [],
    });
  }
}

/**
 * Detect modern layout
 */
function detectModernLayout(css: string, features: DetectedFeature[]): void {
  if (/display:\s*grid/.test(css)) {
    features.push({
      type: 'css',
      feature: 'CSS Grid',
      description: 'Modern grid layout system',
      isSupported: true,
      examples: [],
    });
  }

  if (/display:\s*flex/.test(css)) {
    features.push({
      type: 'css',
      feature: 'Flexbox',
      description: 'Flexible box layout',
      isSupported: true,
      examples: [],
    });
  }
}

/**
 * Detect unsupported CSS
 */
function detectUnsupportedCSS(
  css: string,
  incompatibilities: Incompatibility[],
  warnings: ConversionWarning[]
): void {
  // Vendor prefixes (may indicate older code)
  if (/-webkit-|-moz-|-ms-|-o-/.test(css)) {
    warnings.push({
      type: 'css',
      severity: 'warning',
      message: 'Vendor prefixes detected - may indicate legacy CSS',
      location: {},
      suggestion: 'Modern page builders handle browser compatibility automatically',
      canAutoFix: true,
    });
  }

  // Complex selectors that may not work
  if (/:has\(|:is\(|:where\(/.test(css)) {
    warnings.push({
      type: 'css',
      severity: 'warning',
      message: 'Advanced CSS selectors detected',
      location: {},
      suggestion: 'Ensure page builder supports these modern selectors',
      canAutoFix: false,
    });
  }
}

/**
 * Calculate conversion score (0-100%)
 */
function calculateConversionScore(
  hasCustomJS: boolean,
  hasCustomCSS: boolean,
  incompatibilities: Incompatibility[],
  features: DetectedFeature[]
): number {
  let score = 100;

  // Deduct for custom code
  if (hasCustomJS) score -= 10;
  if (hasCustomCSS) score -= 5;

  // Deduct for incompatibilities
  for (const incomp of incompatibilities) {
    if (incomp.impact === 'blocking') score -= 30;
    else if (incomp.impact === 'degraded') score -= 15;
    else score -= 5;
  }

  // Deduct for unsupported features
  const unsupportedFeatures = features.filter(f => !f.isSupported);
  score -= unsupportedFeatures.length * 5;

  return Math.max(0, Math.min(100, score));
}

/**
 * Detect custom code in specific element
 */
export function detectCustomCodeInElement(element: Element): {
  hasInlineScript: boolean;
  hasInlineStyle: boolean;
  hasEventHandlers: boolean;
  warnings: string[];
} {
  const warnings: string[] = [];

  // Check for inline script
  const hasInlineScript = element.querySelector('script') !== null;
  if (hasInlineScript) {
    warnings.push('Inline scripts detected in element');
  }

  // Check for inline style
  const hasInlineStyle = element.querySelector('style') !== null || element.hasAttribute('style');
  if (hasInlineStyle) {
    warnings.push('Inline styles detected - may override page builder styles');
  }

  // Check for event handlers
  const hasEventHandlers = Array.from(element.attributes).some(
    attr => attr.name.startsWith('on')
  );
  if (hasEventHandlers) {
    warnings.push('Inline event handlers detected - may not work in page builder');
  }

  return {
    hasInlineScript,
    hasInlineStyle,
    hasEventHandlers,
    warnings,
  };
}
