/**
 * Confidence Booster System
 *
 * Enhances recognition confidence through multiple validation layers
 */

import {
  RecognitionResult,
  ComponentType,
  ExtractedStyles,
  ElementContext,
  AnalyzedElement,
} from '../types/component.types.js';
import { parsePixels } from '../analyzer/style-extractor.js';

/**
 * Boost confidence score using multiple signals
 */
export function boostConfidence(
  initialResult: RecognitionResult,
  element: Element | AnalyzedElement,
  styles: ExtractedStyles,
  context: ElementContext
): RecognitionResult {
  let boostedConfidence = initialResult.confidence;
  const boostReasons: string[] = [];

  // Apply component-specific boosting
  switch (initialResult.componentType) {
    case 'button':
      boostedConfidence = boostButtonConfidence(element, styles, context, boostedConfidence, boostReasons);
      break;
    case 'heading':
      boostedConfidence = boostHeadingConfidence(element, styles, context, boostedConfidence, boostReasons);
      break;
    case 'image':
      boostedConfidence = boostImageConfidence(element, styles, context, boostedConfidence, boostReasons);
      break;
    case 'text':
    case 'paragraph':
      boostedConfidence = boostTextConfidence(element, styles, context, boostedConfidence, boostReasons);
      break;
    case 'section':
      boostedConfidence = boostSectionConfidence(element, styles, context, boostedConfidence, boostReasons);
      break;
  }

  // Apply universal boosters
  boostedConfidence = applyUniversalBoosters(element, styles, context, boostedConfidence, boostReasons);

  // Cap at 99% (never 100% to indicate analysis was performed)
  boostedConfidence = Math.min(99, boostedConfidence);

  return {
    ...initialResult,
    confidence: Math.round(boostedConfidence),
    reason: `${initialResult.reason} ${boostReasons.length > 0 ? '+ Boosted: ' + boostReasons.join(', ') : ''}`,
  };
}

/**
 * Boost button confidence
 */
function boostButtonConfidence(
  element: any,
  styles: ExtractedStyles,
  context: ElementContext,
  currentConfidence: number,
  reasons: string[]
): number {
  let boost = 0;

  // Strong semantic signals
  const tagName = element.tagName?.toLowerCase() || element.element?.tagName?.toLowerCase() || '';
  const textContent = element.textContent?.trim() || element.element?.textContent?.trim() || '';
  const classes = Array.from((element.classList || element.element?.classList || [])).join(' ').toLowerCase();

  // 1. Perfect semantic HTML
  if (tagName === 'button') {
    boost += 5;
    reasons.push('semantic <button> tag');
  }

  // 2. Has explicit button role
  const role = element.getAttribute?.('role') || element.element?.attributes?.role;
  if (role === 'button') {
    boost += 5;
    reasons.push('ARIA role="button"');
  }

  // 3. Visual characteristics (multiple checks)
  let visualScore = 0;

  if (styles.backgroundColor && styles.backgroundColor !== 'transparent') {
    visualScore += 2;
  }

  if (styles.padding) {
    const paddingTop = parsePixels(styles.padding.top);
    const paddingLeft = parsePixels(styles.padding.left);
    if (paddingTop >= 8 && paddingLeft >= 15) {
      visualScore += 2;
    }
  }

  if (styles.borderRadius) {
    const radius = parsePixels(styles.borderRadius.topLeft);
    if (radius > 0) {
      visualScore += 2;
    }
  }

  if (styles.cursor === 'pointer') {
    visualScore += 2;
  }

  if (styles.display === 'inline-block' || styles.display === 'inline-flex' || styles.display === 'flex') {
    visualScore += 1;
  }

  if (styles.textAlign === 'center') {
    visualScore += 1;
  }

  boost += visualScore;
  if (visualScore >= 6) {
    reasons.push('strong visual button characteristics');
  }

  // 4. Common button class patterns (weighted)
  const buttonClassPatterns = [
    { pattern: /\bbtn\b/, weight: 3, name: 'btn class' },
    { pattern: /\bbutton\b/, weight: 3, name: 'button class' },
    { pattern: /\bcta\b/, weight: 2, name: 'cta class' },
    { pattern: /\bprimary\b/, weight: 1, name: 'primary variant' },
    { pattern: /\bsecondary\b/, weight: 1, name: 'secondary variant' },
    { pattern: /\b(submit|send|contact|signup|subscribe)\b/, weight: 2, name: 'action class' },
  ];

  for (const { pattern, weight, name } of buttonClassPatterns) {
    if (pattern.test(classes)) {
      boost += weight;
      reasons.push(name);
    }
  }

  // 5. Action-oriented text content
  const actionWords = /^(click|buy|download|submit|send|get started|learn more|sign up|subscribe|purchase|add to cart|checkout|register|join|contact|book|shop now|view|read|try|start|demo|order|apply|donate|continue|next|back|cancel|close|save|edit|delete|update|confirm|yes|no|ok)$/i;

  if (actionWords.test(textContent)) {
    boost += 3;
    reasons.push('action-oriented text');
  }

  // 6. Context boosters
  if (context.insideForm && tagName === 'button') {
    boost += 3;
    reasons.push('button in form context');
  }

  if (context.insideHero || context.insideCard) {
    boost += 2;
    reasons.push('in prominent context (hero/card)');
  }

  // 7. Has click/submit event attributes
  const hasOnClick = element.hasAttribute?.('onclick') || element.element?.attributes?.onclick;
  const type = element.getAttribute?.('type') || element.element?.attributes?.type;

  if (hasOnClick) {
    boost += 2;
    reasons.push('has onclick handler');
  }

  if (type === 'submit' || type === 'button') {
    boost += 3;
    reasons.push(`type="${type}"`);
  }

  // 8. Has href (link acting as button)
  const href = element.getAttribute?.('href') || element.element?.attributes?.href;
  if (href && tagName === 'a') {
    boost += 1;
    reasons.push('interactive link');
  }

  return currentConfidence + boost;
}

/**
 * Boost heading confidence
 */
function boostHeadingConfidence(
  element: any,
  styles: ExtractedStyles,
  context: ElementContext,
  currentConfidence: number,
  reasons: string[]
): number {
  let boost = 0;

  const tagName = element.tagName?.toLowerCase() || element.element?.tagName?.toLowerCase() || '';
  const classes = Array.from((element.classList || element.element?.classList || [])).join(' ').toLowerCase();
  const textContent = element.textContent?.trim() || element.element?.textContent?.trim() || '';

  // 1. Perfect semantic HTML
  if (/^h[1-6]$/.test(tagName)) {
    boost += 5;
    reasons.push(`semantic ${tagName} tag`);

    // Extra boost for proper hierarchy
    if (tagName === 'h1' && context.depth === 0) {
      boost += 2;
      reasons.push('proper H1 hierarchy');
    }
  }

  // 2. Has heading ARIA role
  const role = element.getAttribute?.('role') || element.element?.attributes?.role;
  if (role === 'heading') {
    boost += 4;
    reasons.push('ARIA role="heading"');
  }

  // 3. Typography characteristics
  let typographyScore = 0;

  const fontSize = parsePixels(styles.fontSize || '16px');
  if (fontSize > 24) typographyScore += 3;
  else if (fontSize > 20) typographyScore += 2;
  else if (fontSize > 18) typographyScore += 1;

  const fontWeight = parseInt(styles.fontWeight || '400');
  if (fontWeight >= 700) typographyScore += 2;
  else if (fontWeight >= 600) typographyScore += 1;

  if (styles.lineHeight) {
    const lineHeight = parseFloat(styles.lineHeight);
    if (lineHeight >= 1 && lineHeight <= 1.5) {
      typographyScore += 1;
    }
  }

  if (styles.display === 'block') {
    typographyScore += 1;
  }

  boost += typographyScore;
  if (typographyScore >= 4) {
    reasons.push('strong heading typography');
  }

  // 4. Class patterns
  const headingClassPatterns = [
    { pattern: /\b(title|heading|headline|header)\b/, weight: 3, name: 'heading class' },
    { pattern: /\bh[1-6]\b/, weight: 2, name: 'h-tag class' },
    { pattern: /\b(hero|banner|featured)-?(title|heading)?\b/, weight: 2, name: 'prominent heading' },
  ];

  for (const { pattern, weight, name } of headingClassPatterns) {
    if (pattern.test(classes)) {
      boost += weight;
      reasons.push(name);
    }
  }

  // 5. Content characteristics
  const wordCount = textContent.split(/\s+/).length;
  if (wordCount >= 1 && wordCount <= 10) {
    boost += 2;
    reasons.push('concise heading length');
  }

  // First letter capitalized (title case)
  if (/^[A-Z]/.test(textContent)) {
    boost += 1;
    reasons.push('title case');
  }

  // 6. Position context
  if (context.depth <= 2) {
    boost += 1;
    reasons.push('top-level element');
  }

  return currentConfidence + boost;
}

/**
 * Boost image confidence
 */
function boostImageConfidence(
  element: any,
  styles: ExtractedStyles,
  context: ElementContext,
  currentConfidence: number,
  reasons: string[]
): number {
  let boost = 0;

  const tagName = element.tagName?.toLowerCase() || element.element?.tagName?.toLowerCase() || '';
  const src = element.getAttribute?.('src') || element.element?.attributes?.src;
  const alt = element.getAttribute?.('alt') || element.element?.attributes?.alt;

  // 1. Perfect semantic HTML
  if (tagName === 'img') {
    boost += 5;
    reasons.push('semantic <img> tag');

    // Has alt text (accessibility best practice)
    if (alt) {
      boost += 2;
      reasons.push('has alt text');
    }

    // Has descriptive alt text (not just filename)
    if (alt && alt.length > 5 && !alt.includes('.')) {
      boost += 1;
      reasons.push('descriptive alt text');
    }
  }

  // 2. Picture element (responsive images)
  if (tagName === 'picture') {
    boost += 5;
    reasons.push('semantic <picture> tag');
  }

  // 3. SVG images
  if (tagName === 'svg') {
    boost += 4;
    reasons.push('SVG image');
  }

  // 4. Has valid image source
  if (src) {
    const imageExtensions = /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)(\?.*)?$/i;
    if (imageExtensions.test(src)) {
      boost += 3;
      reasons.push('valid image extension');
    }

    // Data URI or base64 image
    if (src.startsWith('data:image/')) {
      boost += 2;
      reasons.push('inline base64 image');
    }
  }

  // 5. Background image
  if (styles.backgroundImage && styles.backgroundImage.length > 0) {
    boost += 2;
    reasons.push('has background image');

    // Has specific background properties (properly styled)
    if (styles.backgroundSize || styles.backgroundPosition) {
      boost += 1;
      reasons.push('styled background');
    }
  }

  // 6. ARIA role
  const role = element.getAttribute?.('role') || element.element?.attributes?.role;
  if (role === 'img') {
    boost += 3;
    reasons.push('ARIA role="img"');
  }

  // 7. Has dimensions
  if (styles.width && styles.height) {
    boost += 1;
    reasons.push('explicit dimensions');
  }

  // 8. Object-fit (modern responsive image property)
  if (styles.objectFit) {
    boost += 1;
    reasons.push('uses object-fit');
  }

  return currentConfidence + boost;
}

/**
 * Boost text/paragraph confidence
 */
function boostTextConfidence(
  element: any,
  styles: ExtractedStyles,
  context: ElementContext,
  currentConfidence: number,
  reasons: string[]
): number {
  let boost = 0;

  const tagName = element.tagName?.toLowerCase() || element.element?.tagName?.toLowerCase() || '';
  const textContent = element.textContent?.trim() || element.element?.textContent?.trim() || '';

  // 1. Semantic HTML
  if (tagName === 'p') {
    boost += 5;
    reasons.push('semantic <p> tag');
  }

  // 2. Block quote
  if (tagName === 'blockquote') {
    boost += 5;
    reasons.push('semantic <blockquote>');
  }

  // 3. Text length (paragraphs are typically longer)
  const wordCount = textContent.split(/\s+/).length;
  if (wordCount > 10) {
    boost += 3;
    reasons.push('paragraph-length text');
  } else if (wordCount > 5) {
    boost += 1;
  }

  // 4. Display block
  if (styles.display === 'block') {
    boost += 1;
  }

  // 5. Readable line height
  if (styles.lineHeight) {
    const lineHeight = parseFloat(styles.lineHeight);
    if (lineHeight >= 1.4 && lineHeight <= 2) {
      boost += 2;
      reasons.push('readable line height');
    }
  }

  // 6. Paragraph-like font size (not too large, not too small)
  const fontSize = parsePixels(styles.fontSize || '16px');
  if (fontSize >= 14 && fontSize <= 20) {
    boost += 1;
    reasons.push('body text size');
  }

  return currentConfidence + boost;
}

/**
 * Boost section confidence
 */
function boostSectionConfidence(
  element: any,
  styles: ExtractedStyles,
  context: ElementContext,
  currentConfidence: number,
  reasons: string[]
): number {
  let boost = 0;

  const tagName = element.tagName?.toLowerCase() || element.element?.tagName?.toLowerCase() || '';
  const classes = Array.from((element.classList || element.element?.classList || [])).join(' ').toLowerCase();

  // 1. Semantic HTML5 sections
  if (tagName === 'section') {
    boost += 5;
    reasons.push('semantic <section>');
  }

  if (tagName === 'header') {
    boost += 5;
    reasons.push('semantic <header>');
  }

  if (tagName === 'footer') {
    boost += 5;
    reasons.push('semantic <footer>');
  }

  if (tagName === 'main') {
    boost += 5;
    reasons.push('semantic <main>');
  }

  if (tagName === 'article') {
    boost += 5;
    reasons.push('semantic <article>');
  }

  if (tagName === 'aside') {
    boost += 4;
    reasons.push('semantic <aside>');
  }

  if (tagName === 'nav') {
    boost += 5;
    reasons.push('semantic <nav>');
  }

  // 2. Section-like classes
  const sectionClassPatterns = [
    { pattern: /\bsection\b/, weight: 3 },
    { pattern: /\bcontainer\b/, weight: 2 },
    { pattern: /\bwrapper\b/, weight: 2 },
    { pattern: /\bhero\b/, weight: 3 },
    { pattern: /\bbanner\b/, weight: 2 },
  ];

  for (const { pattern, weight } of sectionClassPatterns) {
    if (pattern.test(classes)) {
      boost += weight;
      reasons.push('section-like class');
      break; // Only boost once for classes
    }
  }

  // 3. Full-width or large container
  if (styles.width === '100%' || styles.width === '100vw') {
    boost += 2;
    reasons.push('full-width section');
  }

  // 4. Has background (sections often have backgrounds)
  if (styles.backgroundColor || styles.backgroundImage) {
    boost += 1;
    reasons.push('has background');
  }

  // 5. Has padding (sections typically have vertical spacing)
  if (styles.padding) {
    const paddingTop = parsePixels(styles.padding.top);
    const paddingBottom = parsePixels(styles.padding.bottom);
    if (paddingTop >= 20 || paddingBottom >= 20) {
      boost += 2;
      reasons.push('section-like padding');
    }
  }

  // 6. Block display
  if (styles.display === 'block') {
    boost += 1;
  }

  return currentConfidence + boost;
}

/**
 * Apply universal confidence boosters (apply to all components)
 */
function applyUniversalBoosters(
  element: any,
  styles: ExtractedStyles,
  context: ElementContext,
  currentConfidence: number,
  reasons: string[]
): number {
  let boost = 0;

  // 1. Has ID (well-structured HTML)
  const id = element.id || element.element?.id;
  if (id && id.length > 0) {
    boost += 1;
  }

  // 2. Has data attributes (modern, well-structured)
  const hasDataAttrs = Object.keys(element.dataset || element.element?.attributes || {}).some(key =>
    key.startsWith('data-')
  );
  if (hasDataAttrs) {
    boost += 1;
  }

  // 3. Not deeply nested (cleaner HTML structure)
  if (context.depth <= 5) {
    boost += 1;
  }

  // 4. Has explicit styles (not just defaults)
  let styleCount = 0;
  if (styles.backgroundColor && styles.backgroundColor !== 'transparent') styleCount++;
  if (styles.color && styles.color !== '#000000') styleCount++;
  if (styles.fontSize) styleCount++;
  if (styles.fontWeight && styles.fontWeight !== '400') styleCount++;
  if (styles.padding) styleCount++;
  if (styles.margin) styleCount++;

  if (styleCount >= 3) {
    boost += 1;
  }

  return currentConfidence + boost;
}
