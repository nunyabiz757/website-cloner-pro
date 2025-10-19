/**
 * Cross-Component Validation System
 *
 * Validates components based on their relationships with siblings, parents, and children.
 * This provides an additional layer of confidence boosting beyond individual component analysis.
 *
 * Expected improvement: +3-5% average confidence
 * Expected fallback reduction: 6% → 3-4%
 */

import { JSDOM } from 'jsdom';
import type { RecognitionResult, ComponentType, ExtractedStyles, ElementContext } from '../types/component.types.js';

export interface ValidationContext {
  element: Element;
  styles: ExtractedStyles;
  context: ElementContext;
  siblings: Element[];
  parent: Element | null;
  children: Element[];
}

export interface ValidationResult {
  isValid: boolean;
  confidenceAdjustment: number;
  reasons: string[];
  suggestedType?: ComponentType;
}

/**
 * Validates a component recognition result using cross-component analysis
 */
export function validateWithContext(
  recognition: RecognitionResult,
  validationContext: ValidationContext
): RecognitionResult {
  let totalAdjustment = 0;
  const validationReasons: string[] = [];

  // Run component-specific validation
  switch (recognition.componentType) {
    case 'button':
      totalAdjustment += validateButton(validationContext, validationReasons);
      break;
    case 'heading':
      totalAdjustment += validateHeading(validationContext, validationReasons);
      break;
    case 'image':
      totalAdjustment += validateImage(validationContext, validationReasons);
      break;
    case 'text':
    case 'paragraph':
      totalAdjustment += validateText(validationContext, validationReasons);
      break;
    case 'section':
    case 'container':
      totalAdjustment += validateSection(validationContext, validationReasons);
      break;
  }

  // Run universal pattern validation
  totalAdjustment += validateCommonPatterns(recognition.componentType, validationContext, validationReasons);

  // Apply adjustment
  const adjustedConfidence = Math.min(99, Math.max(0, recognition.confidence + totalAdjustment));

  return {
    ...recognition,
    confidence: Math.round(adjustedConfidence),
    reason: validationReasons.length > 0
      ? `${recognition.reason} + Cross-validated: ${validationReasons.join(', ')}`
      : recognition.reason,
  };
}

/**
 * Button-specific validation
 */
function validateButton(context: ValidationContext, reasons: string[]): number {
  let adjustment = 0;
  const { element, parent, siblings } = context;

  // Inside form context
  if (parent && parent.tagName.toLowerCase() === 'form') {
    const buttonType = element.getAttribute('type');
    if (buttonType === 'submit') {
      adjustment += 5;
      reasons.push('submit button in form');
    } else if (buttonType === 'reset') {
      adjustment += 3;
      reasons.push('reset button in form');
    } else {
      adjustment += 2;
      reasons.push('button in form');
    }
  }

  // CTA pattern: Button with heading/text siblings
  const hasHeadingSibling = siblings.some(sib => /^h[1-6]$/i.test(sib.tagName));
  const hasTextSibling = siblings.some(sib => {
    const tag = sib.tagName.toLowerCase();
    return tag === 'p' || tag === 'div' && (sib.textContent?.length || 0) > 20;
  });

  if (hasHeadingSibling && hasTextSibling) {
    adjustment += 4;
    reasons.push('CTA pattern (heading + text + button)');
  } else if (hasHeadingSibling || hasTextSibling) {
    adjustment += 2;
    reasons.push('button with contextual content');
  }

  // Hero section button
  if (parent && hasClass(parent, ['hero', 'banner', 'jumbotron'])) {
    adjustment += 3;
    reasons.push('hero section CTA button');
  }

  // Card footer button
  if (parent && hasClass(parent, ['card-footer', 'footer', 'actions'])) {
    adjustment += 2;
    reasons.push('card action button');
  }

  // Navigation button (should NOT be a button)
  if (parent && parent.tagName.toLowerCase() === 'nav') {
    const isLink = element.tagName.toLowerCase() === 'a';
    if (isLink) {
      adjustment -= 3; // Penalize - this is probably a nav link, not a button
      reasons.push('likely nav link, not button');
    }
  }

  // Grouped buttons
  const buttonSiblings = siblings.filter(sib =>
    hasClass(sib, ['btn', 'button']) || sib.tagName.toLowerCase() === 'button'
  );
  if (buttonSiblings.length > 0) {
    adjustment += 2;
    reasons.push('button group pattern');
  }

  return adjustment;
}

/**
 * Heading-specific validation
 */
function validateHeading(context: ValidationContext, reasons: string[]): number {
  let adjustment = 0;
  const { element, parent, siblings, children } = context;
  const tagName = element.tagName.toLowerCase();
  const level = parseInt(tagName.replace('h', ''));

  // Validate heading hierarchy
  const precedingSiblings = getPrecedingSiblings(element);
  const previousHeading = precedingSiblings.reverse().find(sib => /^h[1-6]$/i.test(sib.tagName));

  if (previousHeading) {
    const prevLevel = parseInt(previousHeading.tagName.toLowerCase().replace('h', ''));

    // Correct hierarchy (H1 → H2, H2 → H3, etc.)
    if (level === prevLevel + 1 || level === prevLevel) {
      adjustment += 3;
      reasons.push('correct heading hierarchy');
    }
    // Skip level (H1 → H3) - warning
    else if (level > prevLevel + 1) {
      adjustment -= 1;
      reasons.push('skipped heading level (suspicious)');
    }
  }

  // First H1 on page
  if (level === 1 && context.context.depth <= 2) {
    const allElements = Array.from(element.ownerDocument?.querySelectorAll('h1') || []);
    if (allElements.length === 1 || allElements[0] === element) {
      adjustment += 4;
      reasons.push('primary page heading');
    }
  }

  // Section heading pattern
  const followingContent = getFollowingSiblings(element);
  const hasFollowingText = followingContent.some(sib => {
    const tag = sib.tagName.toLowerCase();
    return tag === 'p' || tag === 'div' && (sib.textContent?.length || 0) > 30;
  });

  if (hasFollowingText) {
    adjustment += 3;
    reasons.push('heading with following content');
  }

  // Hero/Banner heading
  if (parent && hasClass(parent, ['hero', 'banner', 'jumbotron', 'masthead'])) {
    adjustment += 3;
    reasons.push('hero section heading');
  }

  // Card/Block heading
  if (parent && hasClass(parent, ['card', 'block', 'box', 'panel'])) {
    adjustment += 2;
    reasons.push('card heading');
  }

  // Section heading
  if (parent && parent.tagName.toLowerCase() === 'section') {
    const sectionChildren = Array.from(parent.children);
    if (sectionChildren[0] === element) {
      adjustment += 3;
      reasons.push('section title (first child)');
    }
  }

  // Heading should not have button/link children (usually a mistake)
  if (children.some(child => {
    const tag = child.tagName.toLowerCase();
    return tag === 'button' || tag === 'a';
  })) {
    adjustment -= 2;
    reasons.push('contains interactive elements (suspicious)');
  }

  return adjustment;
}

/**
 * Image-specific validation
 */
function validateImage(context: ValidationContext, reasons: string[]): number {
  let adjustment = 0;
  const { element, parent, siblings } = context;

  // Figure pattern (semantic)
  if (parent && parent.tagName.toLowerCase() === 'figure') {
    adjustment += 4;
    reasons.push('semantic figure/image pattern');

    // With figcaption
    const hasFigcaption = Array.from(parent.children).some(
      child => child.tagName.toLowerCase() === 'figcaption'
    );
    if (hasFigcaption) {
      adjustment += 2;
      reasons.push('has figcaption');
    }
  }

  // Gallery pattern
  const imageSiblings = siblings.filter(sib => {
    const tag = sib.tagName.toLowerCase();
    return tag === 'img' || tag === 'picture' || hasClass(sib, ['image', 'img', 'photo']);
  });

  if (imageSiblings.length >= 2) {
    adjustment += 3;
    reasons.push('gallery pattern');
  }

  // Hero/Banner image
  if (parent && hasClass(parent, ['hero', 'banner', 'jumbotron'])) {
    adjustment += 3;
    reasons.push('hero background/image');
  }

  // Logo pattern
  const alt = element.getAttribute('alt')?.toLowerCase() || '';
  const src = element.getAttribute('src')?.toLowerCase() || '';

  if (alt.includes('logo') || src.includes('logo')) {
    if (parent && parent.tagName.toLowerCase() === 'header') {
      adjustment += 4;
      reasons.push('header logo');
    } else {
      adjustment += 2;
      reasons.push('logo image');
    }
  }

  // Avatar pattern
  if (alt.includes('avatar') || alt.includes('profile') || src.includes('avatar')) {
    adjustment += 2;
    reasons.push('avatar/profile image');
  }

  // Card image
  if (parent && hasClass(parent, ['card', 'card-image', 'card-img'])) {
    adjustment += 3;
    reasons.push('card image');
  }

  // Icon pattern (small images might not be "images")
  const width = parseInt(element.getAttribute('width') || '0');
  const height = parseInt(element.getAttribute('height') || '0');

  if ((width > 0 && width < 50) || (height > 0 && height < 50)) {
    if (alt.includes('icon') || src.includes('icon')) {
      adjustment -= 2;
      reasons.push('likely icon, not image');
    }
  }

  return adjustment;
}

/**
 * Text/Paragraph-specific validation
 */
function validateText(context: ValidationContext, reasons: string[]): number {
  let adjustment = 0;
  const { element, parent, siblings } = context;
  const textLength = element.textContent?.trim().length || 0;

  // Article/Blog content pattern
  const textSiblings = siblings.filter(sib => {
    const tag = sib.tagName.toLowerCase();
    const length = sib.textContent?.trim().length || 0;
    return (tag === 'p' || tag === 'div') && length > 50;
  });

  if (textSiblings.length >= 2) {
    adjustment += 4;
    reasons.push('article/blog content pattern');
  }

  // Following a heading
  const precedingSiblings = getPrecedingSiblings(element);
  const hasHeadingBefore = precedingSiblings.reverse().slice(0, 3).some(
    sib => /^h[1-6]$/i.test(sib.tagName)
  );

  if (hasHeadingBefore && textLength > 50) {
    adjustment += 3;
    reasons.push('content following heading');
  }

  // Card description
  if (parent && hasClass(parent, ['card', 'card-body', 'card-content'])) {
    adjustment += 2;
    reasons.push('card description');
  }

  // Blockquote pattern
  if (parent && parent.tagName.toLowerCase() === 'blockquote') {
    adjustment += 4;
    reasons.push('semantic blockquote');
  }

  // List item text
  if (parent && parent.tagName.toLowerCase() === 'li') {
    adjustment += 2;
    reasons.push('list item text');
  }

  // Very short text might not be a paragraph
  if (textLength < 20 && element.tagName.toLowerCase() === 'div') {
    adjustment -= 2;
    reasons.push('very short text (might be label)');
  }

  return adjustment;
}

/**
 * Section/Container-specific validation
 */
function validateSection(context: ValidationContext, reasons: string[]): number {
  let adjustment = 0;
  const { element, children, siblings } = context;
  const tagName = element.tagName.toLowerCase();

  // Semantic HTML5 sections
  const semanticSections = ['header', 'footer', 'main', 'article', 'aside', 'nav'];
  if (semanticSections.includes(tagName)) {
    adjustment += 5;
    reasons.push(`semantic ${tagName} element`);
  }

  // Contains typical section content
  const hasHeading = children.some(child => /^h[1-6]$/i.test(child.tagName));
  const hasText = children.some(child => {
    const tag = child.tagName.toLowerCase();
    return (tag === 'p' || tag === 'div') && (child.textContent?.length || 0) > 30;
  });
  const hasButton = children.some(child => {
    const tag = child.tagName.toLowerCase();
    return tag === 'button' || hasClass(child, ['btn', 'button']);
  });

  // Section pattern: Heading + Content + CTA
  if (hasHeading && hasText && hasButton) {
    adjustment += 5;
    reasons.push('complete section pattern (heading + content + CTA)');
  } else if (hasHeading && hasText) {
    adjustment += 3;
    reasons.push('section pattern (heading + content)');
  } else if (hasHeading || hasText) {
    adjustment += 1;
    reasons.push('partial section content');
  }

  // Multiple child sections (indicates container)
  const sectionChildren = children.filter(child => {
    const tag = child.tagName.toLowerCase();
    return tag === 'section' || hasClass(child, ['section', 'block', 'panel']);
  });

  if (sectionChildren.length >= 2) {
    adjustment += 3;
    reasons.push('contains multiple sections (container)');
  }

  // Grid/Flex layout (indicates container)
  if (context.styles.display === 'flex' || context.styles.display === 'grid') {
    adjustment += 3;
    reasons.push('layout container (flex/grid)');
  }

  // Full-width sections
  const width = context.styles.width;
  if (width === '100%' || width === '100vw') {
    adjustment += 2;
    reasons.push('full-width section');
  }

  return adjustment;
}

/**
 * Common pattern validation (applies to all component types)
 */
function validateCommonPatterns(
  componentType: ComponentType,
  context: ValidationContext,
  reasons: string[]
): number {
  let adjustment = 0;
  const { element, parent, siblings } = context;

  // Card pattern: Image + Heading + Text + Button
  const cardPatterns = detectCardPattern(element, siblings, parent);
  if (cardPatterns.isCard) {
    adjustment += cardPatterns.boost;
    reasons.push(...cardPatterns.reasons);
  }

  // Form pattern validation
  const formPatterns = detectFormPattern(element, parent, componentType);
  if (formPatterns.boost !== 0) {
    adjustment += formPatterns.boost;
    reasons.push(...formPatterns.reasons);
  }

  // Navigation pattern
  const navPatterns = detectNavigationPattern(element, parent, componentType);
  if (navPatterns.boost !== 0) {
    adjustment += navPatterns.boost;
    reasons.push(...navPatterns.reasons);
  }

  return adjustment;
}

/**
 * Detects card component patterns
 */
function detectCardPattern(
  element: Element,
  siblings: Element[],
  parent: Element | null
): { isCard: boolean; boost: number; reasons: string[] } {
  const reasons: string[] = [];
  let boost = 0;

  // Is element or parent a card?
  const isCard = hasClass(element, ['card', 'card-body', 'panel', 'box']) ||
                 (parent && hasClass(parent, ['card', 'panel', 'box']));

  if (!isCard) {
    return { isCard: false, boost: 0, reasons: [] };
  }

  // Analyze card structure
  const allElements = parent ? Array.from(parent.querySelectorAll('*')) : [element, ...siblings];

  const hasImage = allElements.some(el => el.tagName.toLowerCase() === 'img');
  const hasHeading = allElements.some(el => /^h[1-6]$/i.test(el.tagName));
  const hasText = allElements.some(el => {
    const tag = el.tagName.toLowerCase();
    return tag === 'p' && (el.textContent?.length || 0) > 30;
  });
  const hasButton = allElements.some(el => {
    const tag = el.tagName.toLowerCase();
    return tag === 'button' || hasClass(el, ['btn', 'button']);
  });

  // Complete card pattern
  if (hasImage && hasHeading && hasText && hasButton) {
    boost += 5;
    reasons.push('complete card pattern');
  } else if (hasHeading && hasText) {
    boost += 3;
    reasons.push('card with heading and description');
  } else if (hasImage && hasHeading) {
    boost += 2;
    reasons.push('card with image and heading');
  }

  return { isCard: true, boost, reasons };
}

/**
 * Detects form patterns
 */
function detectFormPattern(
  element: Element,
  parent: Element | null,
  componentType: ComponentType
): { boost: number; reasons: string[] } {
  const reasons: string[] = [];
  let boost = 0;

  const insideForm = parent && (
    parent.tagName.toLowerCase() === 'form' ||
    hasClass(parent, ['form', 'form-group', 'form-row'])
  );

  if (!insideForm) return { boost: 0, reasons: [] };

  // Component-specific form validation
  switch (componentType) {
    case 'button':
      boost += 3;
      reasons.push('form button');
      break;

    case 'text':
      // Text in forms might be labels
      const isLabel = element.tagName.toLowerCase() === 'label' ||
                     hasClass(element, ['label', 'form-label']);
      if (isLabel) {
        boost -= 2;
        reasons.push('form label, not text');
      }
      break;
  }

  return { boost, reasons };
}

/**
 * Detects navigation patterns
 */
function detectNavigationPattern(
  element: Element,
  parent: Element | null,
  componentType: ComponentType
): { boost: number; reasons: string[] } {
  const reasons: string[] = [];
  let boost = 0;

  const insideNav = parent && (
    parent.tagName.toLowerCase() === 'nav' ||
    hasClass(parent, ['nav', 'navbar', 'menu', 'navigation'])
  );

  if (!insideNav) return { boost: 0, reasons: [] };

  // Component-specific nav validation
  switch (componentType) {
    case 'button':
      // Buttons in nav are unusual - probably links styled as buttons
      if (element.tagName.toLowerCase() === 'a') {
        boost -= 3;
        reasons.push('nav link, not button');
      }
      break;
  }

  return { boost, reasons };
}

/**
 * Helper: Check if element has any of the specified classes
 */
function hasClass(element: Element, keywords: string[]): boolean {
  const classList = Array.from(element.classList).join(' ').toLowerCase();
  return keywords.some(keyword => classList.includes(keyword.toLowerCase()));
}

/**
 * Helper: Get preceding siblings
 */
function getPrecedingSiblings(element: Element): Element[] {
  const siblings: Element[] = [];
  let prev = element.previousElementSibling;

  while (prev) {
    siblings.push(prev);
    prev = prev.previousElementSibling;
  }

  return siblings;
}

/**
 * Helper: Get following siblings
 */
function getFollowingSiblings(element: Element): Element[] {
  const siblings: Element[] = [];
  let next = element.nextElementSibling;

  while (next) {
    siblings.push(next);
    next = next.nextElementSibling;
  }

  return siblings;
}

/**
 * Build validation context from element
 */
export function buildValidationContext(element: Element, styles: ExtractedStyles, context: ElementContext): ValidationContext {
  return {
    element,
    styles,
    context,
    siblings: getSiblings(element),
    parent: element.parentElement,
    children: Array.from(element.children),
  };
}

/**
 * Helper: Get all siblings
 */
function getSiblings(element: Element): Element[] {
  return Array.from(element.parentElement?.children || []).filter(
    child => child !== element
  );
}
