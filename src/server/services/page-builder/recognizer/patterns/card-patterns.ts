/**
 * Card Component Recognition Patterns
 *
 * Detects card patterns: image + heading + text + button
 */

import type { RecognitionPattern } from '../../types/component.types.js';

/**
 * Helper: Analyze card structure
 */
function hasCardStructure(element: Element): {
  hasImage: boolean;
  hasHeading: boolean;
  hasText: boolean;
  hasButton: boolean;
  score: number;
} {
  const children = Array.from(element.querySelectorAll('*'));

  const hasImage = children.some(
    child =>
      child.tagName.toLowerCase() === 'img' ||
      child.tagName.toLowerCase() === 'picture' ||
      (child as HTMLElement).style.backgroundImage
  );

  const hasHeading = children.some(child =>
    /^h[1-6]$/i.test(child.tagName)
  );

  const hasText = children.some(child => {
    const tag = child.tagName.toLowerCase();
    return (
      tag === 'p' &&
      (child.textContent?.trim().length || 0) > 20
    );
  });

  const hasButton = children.some(child => {
    const tag = child.tagName.toLowerCase();
    const classes = Array.from(child.classList).join(' ');
    return (
      tag === 'button' ||
      tag === 'a' && /btn|button/i.test(classes)
    );
  });

  // Calculate score
  let score = 0;
  if (hasImage) score += 25;
  if (hasHeading) score += 30;
  if (hasText) score += 25;
  if (hasButton) score += 20;

  return { hasImage, hasHeading, hasText, hasButton, score };
}

export const cardPatterns: RecognitionPattern[] = [
  // Pattern 1: Complete card (image + heading + text + button)
  {
    componentType: 'card',
    patterns: {
      cssProperties: (styles, element) => {
        if (!element) return false;

        const structure = hasCardStructure(element);
        return (
          structure.hasImage &&
          structure.hasHeading &&
          structure.hasText &&
          structure.hasButton
        );
      },
    },
    confidence: 95,
    priority: 100,
  },

  // Pattern 2: Card with image + heading + text
  {
    componentType: 'card',
    patterns: {
      cssProperties: (styles, element) => {
        if (!element) return false;

        const structure = hasCardStructure(element);
        return (
          structure.hasImage &&
          structure.hasHeading &&
          structure.hasText
        );
      },
    },
    confidence: 90,
    priority: 95,
  },

  // Pattern 3: Card class names + visual styling
  {
    componentType: 'card',
    patterns: {
      classKeywords: ['card', 'tile', 'box', 'item', 'panel'],
      cssProperties: (styles) => {
        // Cards typically have borders, shadows, or background
        return !!(
          styles.border ||
          styles.boxShadow ||
          styles.backgroundColor
        );
      },
    },
    confidence: 85,
    priority: 85,
  },

  // Pattern 4: Card with border/shadow styling
  {
    componentType: 'card',
    patterns: {
      cssProperties: (styles, element) => {
        if (!element) return false;

        const structure = hasCardStructure(element);
        const hasCardStyling = !!(
          styles.border ||
          styles.boxShadow ||
          styles.borderRadius
        );

        // At least heading + text with card styling
        return (
          structure.score >= 55 &&
          hasCardStyling
        );
      },
    },
    confidence: 80,
    priority: 80,
  },

  // Pattern 5: Product card pattern
  {
    componentType: 'card',
    patterns: {
      classKeywords: ['product', 'item', 'listing', 'card'],
      cssProperties: (styles, element) => {
        if (!element) return false;

        const structure = hasCardStructure(element);
        return structure.hasImage && (structure.hasHeading || structure.hasText);
      },
    },
    confidence: 85,
    priority: 85,
  },

  // Pattern 6: Blog post card
  {
    componentType: 'card',
    patterns: {
      classKeywords: ['post', 'article', 'blog', 'entry'],
      cssProperties: (styles, element) => {
        if (!element) return false;

        const structure = hasCardStructure(element);
        return (
          (structure.hasImage || structure.hasHeading) &&
          structure.hasText
        );
      },
    },
    confidence: 85,
    priority: 85,
  },

  // Pattern 7: Material UI / Bootstrap card
  {
    componentType: 'card',
    patterns: {
      classKeywords: [
        'card',
        'card-body',
        'card-img',
        'card-title',
        'card-text',
        'MuiCard',
      ],
    },
    confidence: 90,
    priority: 90,
  },

  // Pattern 8: Minimal card (heading + text, no image)
  {
    componentType: 'card',
    patterns: {
      classKeywords: ['card', 'box', 'panel'],
      cssProperties: (styles, element) => {
        if (!element) return false;

        const structure = hasCardStructure(element);
        return (
          structure.hasHeading &&
          structure.hasText &&
          !!(styles.border || styles.boxShadow || styles.backgroundColor)
        );
      },
    },
    confidence: 75,
    priority: 75,
  },
];

/**
 * Analyze card structure in detail
 */
export function analyzeCardStructure(element: Element): {
  hasImage: boolean;
  hasHeading: boolean;
  hasText: boolean;
  hasButton: boolean;
  imagePosition: 'top' | 'left' | 'right' | 'background' | 'none';
  cardType: 'product' | 'blog' | 'team' | 'testimonial' | 'feature' | 'generic';
  score: number;
} {
  const structure = hasCardStructure(element);
  const classes = Array.from(element.classList).join(' ').toLowerCase();

  // Detect image position
  let imagePosition: 'top' | 'left' | 'right' | 'background' | 'none' = 'none';
  if (structure.hasImage) {
    const img = element.querySelector('img, picture');
    if (img) {
      const imgRect = img.getBoundingClientRect();
      const cardRect = element.getBoundingClientRect();

      // Image at top
      if (imgRect.top <= cardRect.top + 50) {
        imagePosition = 'top';
      }
      // Image on left
      else if (imgRect.left <= cardRect.left + 50) {
        imagePosition = 'left';
      }
      // Image on right
      else if (imgRect.right >= cardRect.right - 50) {
        imagePosition = 'right';
      } else {
        imagePosition = 'top'; // Default
      }
    } else {
      // Check for background image
      const bgImage = (element as HTMLElement).style.backgroundImage;
      if (bgImage && bgImage !== 'none') {
        imagePosition = 'background';
      }
    }
  }

  // Detect card type
  let cardType: 'product' | 'blog' | 'team' | 'testimonial' | 'feature' | 'generic' = 'generic';

  if (/product|item|shop|price/.test(classes)) {
    cardType = 'product';
  } else if (/post|article|blog|entry/.test(classes)) {
    cardType = 'blog';
  } else if (/team|member|staff|author/.test(classes)) {
    cardType = 'team';
  } else if (/testimonial|review|quote/.test(classes)) {
    cardType = 'testimonial';
  } else if (/feature|service|icon/.test(classes)) {
    cardType = 'feature';
  }

  return {
    ...structure,
    imagePosition,
    cardType,
  };
}
