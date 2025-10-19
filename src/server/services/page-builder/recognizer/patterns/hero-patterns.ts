/**
 * Hero Section Recognition Patterns
 *
 * Detects hero sections: Large image/video + text overlay + CTA
 */

import type { RecognitionPattern } from '../../types/component.types.js';

/**
 * Helper: Analyze hero structure
 */
function hasHeroStructure(element: Element, styles: any): {
  hasLargeBackground: boolean;
  hasHeading: boolean;
  hasText: boolean;
  hasButton: boolean;
  isFullWidth: boolean;
  isTall: boolean;
  score: number;
} {
  const children = Array.from(element.querySelectorAll('*'));

  // Check for large background image/video
  const bgImage = styles.backgroundImage;
  const hasBackgroundImage = bgImage && bgImage !== 'none';
  const hasVideo = children.some(
    child => child.tagName.toLowerCase() === 'video'
  );
  const hasLargeBackground = hasBackgroundImage || hasVideo;

  // Check for heading (usually H1)
  const hasHeading = children.some(child => {
    const tag = child.tagName.toLowerCase();
    return tag === 'h1' || tag === 'h2';
  });

  // Check for descriptive text
  const hasText = children.some(child => {
    const tag = child.tagName.toLowerCase();
    return tag === 'p' && (child.textContent?.trim().length || 0) > 20;
  });

  // Check for CTA button
  const hasButton = children.some(child => {
    const tag = child.tagName.toLowerCase();
    const classes = Array.from(child.classList).join(' ');
    return tag === 'button' || (tag === 'a' && /btn|button|cta/i.test(classes));
  });

  // Check if full-width
  const rect = element.getBoundingClientRect();
  const viewportWidth = window.innerWidth;
  const isFullWidth = rect.width >= viewportWidth * 0.9;

  // Check if tall enough to be a hero
  const viewportHeight = window.innerHeight;
  const isTall = rect.height >= viewportHeight * 0.4; // At least 40% of viewport

  // Calculate score
  let score = 0;
  if (hasLargeBackground) score += 30;
  if (hasHeading) score += 25;
  if (hasText) score += 15;
  if (hasButton) score += 15;
  if (isFullWidth) score += 10;
  if (isTall) score += 5;

  return {
    hasLargeBackground,
    hasHeading,
    hasText,
    hasButton,
    isFullWidth,
    isTall,
    score,
  };
}

export const heroPatterns: RecognitionPattern[] = [
  // Pattern 1: Semantic hero tag with background + content
  {
    componentType: 'hero',
    patterns: {
      tagNames: ['header', 'section'],
      classKeywords: ['hero', 'banner', 'jumbotron', 'masthead'],
      cssProperties: (styles, element) => {
        if (!element) return false;
        const structure = hasHeroStructure(element, styles);
        return structure.hasLargeBackground && structure.hasHeading;
      },
    },
    confidence: 95,
    priority: 100,
  },

  // Pattern 2: Complete hero (background + heading + text + button)
  {
    componentType: 'hero',
    patterns: {
      cssProperties: (styles, element) => {
        if (!element) return false;
        const structure = hasHeroStructure(element, styles);
        return (
          structure.hasLargeBackground &&
          structure.hasHeading &&
          structure.hasText &&
          structure.hasButton
        );
      },
    },
    confidence: 95,
    priority: 100,
  },

  // Pattern 3: Hero class names
  {
    componentType: 'hero',
    patterns: {
      classKeywords: ['hero', 'banner', 'jumbotron', 'masthead', 'splash'],
    },
    confidence: 90,
    priority: 90,
  },

  // Pattern 4: Full-width section with background image + large heading
  {
    componentType: 'hero',
    patterns: {
      cssProperties: (styles, element) => {
        if (!element) return false;

        const structure = hasHeroStructure(element, styles);
        return (
          structure.hasLargeBackground &&
          structure.isFullWidth &&
          structure.hasHeading
        );
      },
    },
    confidence: 85,
    priority: 85,
  },

  // Pattern 5: Video background hero
  {
    componentType: 'hero',
    patterns: {
      cssProperties: (styles, element) => {
        if (!element) return false;

        const hasVideo = Array.from(element.querySelectorAll('video')).length > 0;
        const structure = hasHeroStructure(element, styles);

        return hasVideo && structure.hasHeading;
      },
    },
    confidence: 90,
    priority: 90,
  },

  // Pattern 6: First large section on page
  {
    componentType: 'hero',
    patterns: {
      cssProperties: (styles, element) => {
        if (!element) return false;

        // Check if this is the first major section
        const allSections = Array.from(
          document.querySelectorAll('section, div[class*="section"]')
        );
        const isFirstSection = allSections[0] === element;

        const structure = hasHeroStructure(element, styles);

        return (
          isFirstSection &&
          structure.isTall &&
          structure.isFullWidth &&
          structure.score >= 60
        );
      },
    },
    confidence: 80,
    priority: 80,
  },

  // Pattern 7: Bootstrap jumbotron
  {
    componentType: 'hero',
    patterns: {
      classKeywords: ['jumbotron', 'jumbotron-fluid'],
    },
    confidence: 95,
    priority: 95,
  },

  // Pattern 8: Tailwind hero pattern
  {
    componentType: 'hero',
    patterns: {
      classKeywords: ['bg-cover', 'bg-center', 'h-screen', 'min-h-screen'],
      cssProperties: (styles, element) => {
        if (!element) return false;
        const structure = hasHeroStructure(element, styles);
        return structure.hasHeading;
      },
    },
    confidence: 85,
    priority: 85,
  },
];

/**
 * Analyze hero section in detail
 */
export function analyzeHeroStructure(element: Element, styles: any): {
  hasLargeBackground: boolean;
  hasHeading: boolean;
  hasText: boolean;
  hasButton: boolean;
  hasVideo: boolean;
  isFullWidth: boolean;
  isTall: boolean;
  height: number;
  overlayType: 'dark' | 'light' | 'gradient' | 'none';
  textAlignment: 'left' | 'center' | 'right';
  score: number;
} {
  const structure = hasHeroStructure(element, styles);
  const children = Array.from(element.querySelectorAll('*'));

  // Check for video
  const hasVideo = children.some(child => child.tagName.toLowerCase() === 'video');

  // Detect overlay type
  let overlayType: 'dark' | 'light' | 'gradient' | 'none' = 'none';
  const overlay = element.querySelector('[class*="overlay"], [class*="mask"]');
  if (overlay) {
    const overlayStyles = window.getComputedStyle(overlay);
    const bgColor = overlayStyles.backgroundColor;
    if (bgColor && bgColor !== 'transparent') {
      // Dark overlay
      if (bgColor.includes('0, 0, 0') || bgColor.includes('rgba(0')) {
        overlayType = 'dark';
      }
      // Light overlay
      else if (bgColor.includes('255, 255, 255') || bgColor.includes('rgba(255')) {
        overlayType = 'light';
      }
      // Gradient
      else if (overlayStyles.backgroundImage?.includes('gradient')) {
        overlayType = 'gradient';
      }
    }
  }

  // Detect text alignment
  let textAlignment: 'left' | 'center' | 'right' = 'left';
  const heading = element.querySelector('h1, h2');
  if (heading) {
    const headingStyles = window.getComputedStyle(heading);
    const align = headingStyles.textAlign;
    if (align === 'center') textAlignment = 'center';
    else if (align === 'right') textAlignment = 'right';
  }

  // Get height
  const rect = element.getBoundingClientRect();
  const height = rect.height;

  return {
    ...structure,
    hasVideo,
    height,
    overlayType,
    textAlignment,
  };
}
