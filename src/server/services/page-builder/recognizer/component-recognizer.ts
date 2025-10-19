/**
 * Component Recognizer
 *
 * Analyzes HTML elements and recognizes their component type using pattern matching
 */

import { JSDOM } from 'jsdom';
import {
  RecognitionPattern,
  RecognitionResult,
  ComponentType,
  ExtractedStyles,
  ElementContext,
  AnalyzedElement,
} from '../types/component.types.js';
import { extractStyles } from '../analyzer/style-extractor.js';
import { buttonPatterns } from './patterns/button-patterns.js';
import { headingPatterns } from './patterns/heading-patterns.js';
import { imagePatterns } from './patterns/image-patterns.js';
import { textPatterns } from './patterns/text-patterns.js';
import { containerPatterns } from './patterns/container-patterns.js';
import { gridPatterns } from './patterns/grid-patterns.js';
import { rowPatterns } from './patterns/row-patterns.js';
import { cardPatterns } from './patterns/card-patterns.js';
import { heroPatterns } from './patterns/hero-patterns.js';
import { sidebarPatterns } from './patterns/sidebar-patterns.js';
import { headerPatterns, navigationPatterns } from './patterns/header-patterns.js';
import { footerPatterns } from './patterns/footer-patterns.js';
import { iconBoxPatterns } from './patterns/icon-box-patterns.js';
import { starRatingPatterns } from './patterns/star-rating-patterns.js';
import { socialIconsPatterns } from './patterns/social-icons-patterns.js';
import { counterPatterns } from './patterns/counter-patterns.js';
import { postsGridPatterns } from './patterns/posts-grid-patterns.js';
import { ctaPatterns } from './patterns/cta-patterns.js';
import { priceListPatterns } from './patterns/price-list-patterns.js';
import { alertPatterns } from './patterns/alert-patterns.js';
import { tabsPatterns } from './patterns/tabs-patterns.js';
import { togglePatterns } from './patterns/toggle-patterns.js';
import { flipBoxPatterns } from './patterns/flip-box-patterns.js';
import { priceTablePatterns } from './patterns/price-table-patterns.js';
import { imageGalleryPatterns } from './patterns/image-gallery-patterns.js';
import { videoPlaylistPatterns } from './patterns/video-playlist-patterns.js';
import {
  inputPatterns,
  textareaPatterns,
  selectPatterns,
  checkboxPatterns,
  radioPatterns,
  fileUploadPatterns,
  formContainerPatterns,
  multiStepFormPatterns,
} from './patterns/form-patterns.js';
import {
  accordionPatterns,
  tabsPatterns,
  modalPatterns,
  carouselPatterns,
  galleryPatterns,
  testimonialPatterns,
  pricingTablePatterns,
  progressBarPatterns,
  countdownPatterns,
  socialSharePatterns,
  breadcrumbsPatterns,
  paginationPatterns,
  tablePatterns,
  listPatterns,
  blockquotePatterns,
  codeBlockPatterns,
  ctaPatterns,
  featureBoxPatterns,
  teamMemberPatterns,
  blogCardPatterns,
  productCardPatterns,
  searchBarPatterns,
  videoEmbedPatterns,
  mapsPatterns,
  socialFeedPatterns,
  iconPatterns,
  spacerPatterns,
  dividerPatterns,
} from './patterns/advanced-patterns.js';
import { boostConfidence } from './confidence-booster.js';
import { validateWithContext, buildValidationContext } from './cross-validator.js';

// Combine all patterns (layout patterns first for better hierarchy detection)
const ALL_PATTERNS: RecognitionPattern[] = [
  // Layout components (highest priority - checked first)
  ...headerPatterns,
  ...footerPatterns,
  ...heroPatterns,
  ...navigationPatterns,
  ...sidebarPatterns,
  ...cardPatterns,
  ...gridPatterns,
  ...rowPatterns,
  ...containerPatterns,

  // Form components (checked before basic components to properly detect form elements)
  ...formContainerPatterns,
  ...multiStepFormPatterns,
  ...fileUploadPatterns,
  ...textareaPatterns,
  ...selectPatterns,
  ...checkboxPatterns,
  ...radioPatterns,
  ...inputPatterns,

  // Advanced interactive components (high priority)
  ...modalPatterns,
  ...accordionPatterns,
  ...tabsPatterns,
  ...togglePatterns,
  ...carouselPatterns,
  ...galleryPatterns,
  ...imageGalleryPatterns,
  ...videoPlaylistPatterns,
  ...alertPatterns,
  ...flipBoxPatterns,

  // Content components
  ...iconBoxPatterns,
  ...starRatingPatterns,
  ...pricingTablePatterns,
  ...priceTablePatterns,
  ...priceListPatterns,
  ...testimonialPatterns,
  ...ctaPatterns,
  ...featureBoxPatterns,
  ...teamMemberPatterns,
  ...blogCardPatterns,
  ...productCardPatterns,
  ...postsGridPatterns,

  // Media and embeds
  ...videoEmbedPatterns,
  ...mapsPatterns,
  ...socialFeedPatterns,

  // Navigation components
  ...breadcrumbsPatterns,
  ...paginationPatterns,
  ...searchBarPatterns,

  // Data display components
  ...tablePatterns,
  ...listPatterns,
  ...progressBarPatterns,
  ...counterPatterns,
  ...countdownPatterns,

  // Text formatting components
  ...blockquotePatterns,
  ...codeBlockPatterns,

  // Social components
  ...socialIconsPatterns,
  ...socialSharePatterns,

  // Basic components (checked after specialized components)
  ...buttonPatterns,
  ...headingPatterns,
  ...imagePatterns,
  ...iconPatterns,
  ...dividerPatterns,
  ...spacerPatterns,
  ...textPatterns,
];

// Sort by priority (highest first)
ALL_PATTERNS.sort((a, b) => b.priority - a.priority);

/**
 * Recognize component type from HTML element
 */
export function recognizeComponent(
  element: Element,
  styles: ExtractedStyles,
  context: ElementContext
): RecognitionResult {
  const tagName = element.tagName.toLowerCase();
  const classes = Array.from(element.classList);
  const textContent = element.textContent?.trim() || '';
  const ariaRole = element.getAttribute('role') || undefined;

  let bestMatch: RecognitionResult | null = null;
  let highestConfidence = 0;

  // Try each pattern
  for (const pattern of ALL_PATTERNS) {
    const confidence = matchPattern(pattern, {
      tagName,
      classes,
      styles,
      textContent,
      ariaRole,
      context,
      element,
    });

    if (confidence > highestConfidence) {
      highestConfidence = confidence;
      bestMatch = {
        componentType: pattern.componentType,
        confidence,
        matchedPatterns: [pattern.componentType],
        manualReviewNeeded: confidence < 70,
        reason: `Matched ${pattern.componentType} pattern with ${confidence}% confidence`,
      };
    }
  }

  // Return best match or unknown
  if (bestMatch) {
    // Apply confidence boosting for more accurate scoring
    const boostedResult = boostConfidence(bestMatch, element, styles, context);

    // Apply cross-component validation for additional accuracy
    const validationContext = buildValidationContext(element, styles, context);
    const validatedResult = validateWithContext(boostedResult, validationContext);

    return validatedResult;
  }

  return {
    componentType: 'unknown',
    confidence: 0,
    matchedPatterns: [],
    manualReviewNeeded: true,
    reason: 'No matching pattern found',
  };
}

/**
 * Match a single pattern against element data
 */
function matchPattern(
  pattern: RecognitionPattern,
  data: {
    tagName: string;
    classes: string[];
    styles: ExtractedStyles;
    textContent: string;
    ariaRole?: string;
    context: ElementContext;
    element: Element;
  }
): number {
  let confidence = 0;
  let matchCount = 0;
  let totalChecks = 0;

  // Check tag name
  if (pattern.patterns.tagNames) {
    totalChecks++;
    if (pattern.patterns.tagNames.includes(data.tagName)) {
      matchCount++;
    } else {
      // If tag doesn't match and it's required, return 0
      return 0;
    }
  }

  // Check class keywords
  if (pattern.patterns.classKeywords) {
    totalChecks++;
    const hasMatchingClass = pattern.patterns.classKeywords.some(keyword =>
      data.classes.some(cls => cls.toLowerCase().includes(keyword.toLowerCase()))
    );
    if (hasMatchingClass) {
      matchCount++;
    }
  }

  // Check CSS properties
  if (pattern.patterns.cssProperties) {
    totalChecks++;
    let cssMatch = false;

    if (typeof pattern.patterns.cssProperties === 'function') {
      cssMatch = pattern.patterns.cssProperties(data.styles, data.element);
    } else {
      // Object-based CSS matching (simple version for MVP)
      cssMatch = Object.entries(pattern.patterns.cssProperties).every(([key, value]) => {
        const styleValue = data.styles[key as keyof ExtractedStyles];
        if (Array.isArray(value)) {
          return value.includes(styleValue as any);
        }
        return styleValue === value;
      });
    }

    if (cssMatch) {
      matchCount++;
    }
  }

  // Check content pattern
  if (pattern.patterns.contentPattern) {
    totalChecks++;
    if (pattern.patterns.contentPattern.test(data.textContent)) {
      matchCount++;
    }
  }

  // Check ARIA role
  if (pattern.patterns.ariaRole) {
    totalChecks++;
    if (data.ariaRole === pattern.patterns.ariaRole) {
      matchCount++;
    }
  }

  // Check context requirements
  if (pattern.patterns.contextRequired) {
    totalChecks++;
    const contextMatch = Object.entries(pattern.patterns.contextRequired).every(
      ([key, value]) => data.context[key as keyof ElementContext] === value
    );
    if (contextMatch) {
      matchCount++;
    }
  }

  // Calculate confidence
  if (totalChecks === 0) {
    return 0;
  }

  const matchRatio = matchCount / totalChecks;
  confidence = Math.round(pattern.confidence * matchRatio);

  return confidence;
}

/**
 * Analyze HTML element and extract all relevant information
 */
export function analyzeElement(element: Element, parentContext?: ElementContext): AnalyzedElement {
  const tagName = element.tagName.toLowerCase();
  const id = element.id || undefined;
  const classes = Array.from(element.classList);
  const textContent = element.textContent?.trim() || '';
  const innerHTML = element.innerHTML;

  // Extract attributes
  const attributes: Record<string, string> = {};
  for (const attr of Array.from(element.attributes)) {
    attributes[attr.name] = attr.value;
  }

  // Extract styles
  const styles = extractStyles(element.outerHTML);

  // Determine context
  const context = determineContext(element, parentContext);

  // Get element position
  const rect = element.getBoundingClientRect ? element.getBoundingClientRect() : { x: 0, y: 0, width: 0, height: 0 };

  // Analyze children
  const children: AnalyzedElement[] = [];
  for (const child of Array.from(element.children)) {
    children.push(analyzeElement(child, context));
  }

  return {
    element: element.outerHTML,
    tagName,
    id,
    classes,
    attributes,
    textContent,
    innerHTML,
    styles,
    context,
    children,
    position: {
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    },
  };
}

/**
 * Determine element context
 */
function determineContext(element: Element, parentContext?: ElementContext): ElementContext {
  const depth = parentContext ? parentContext.depth + 1 : 0;

  // Check ancestors for context
  let current: Element | null = element;
  const context: ElementContext = {
    insideHero: false,
    insideForm: false,
    insideCard: false,
    insideNav: false,
    insideHeader: false,
    insideFooter: false,
    insideSection: false,
    depth,
    siblingTypes: [],
  };

  while (current) {
    const tag = current.tagName.toLowerCase();
    const classes = Array.from(current.classList).map(c => c.toLowerCase());

    if (tag === 'form') context.insideForm = true;
    if (tag === 'nav') context.insideNav = true;
    if (tag === 'header') context.insideHeader = true;
    if (tag === 'footer') context.insideFooter = true;
    if (tag === 'section') context.insideSection = true;

    if (classes.some(c => c.includes('hero') || c.includes('banner'))) {
      context.insideHero = true;
    }
    if (classes.some(c => c.includes('card') || c.includes('box'))) {
      context.insideCard = true;
    }

    current = current.parentElement;
  }

  return context;
}

/**
 * Batch recognize components from HTML string
 */
export function recognizeComponents(html: string): AnalyzedElement[] {
  const dom = new JSDOM(html);
  const document = dom.window.document;
  const elements: AnalyzedElement[] = [];

  // Get all elements
  const allElements = document.body.querySelectorAll('*');

  for (const element of Array.from(allElements)) {
    const analyzed = analyzeElement(element);
    elements.push(analyzed);
  }

  return elements;
}
