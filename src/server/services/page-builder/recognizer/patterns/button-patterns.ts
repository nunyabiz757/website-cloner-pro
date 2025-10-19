/**
 * Button Recognition Patterns
 */

import { RecognitionPattern } from '../../types/component.types.js';
import { looksLikeButton } from '../../analyzer/style-extractor.js';

export const buttonPatterns: RecognitionPattern[] = [
  {
    componentType: 'button',
    patterns: {
      tagNames: ['button'],
    },
    confidence: 95,
    priority: 100,
  },
  {
    componentType: 'button',
    patterns: {
      tagNames: ['a', 'div', 'span'],
      ariaRole: 'button',
    },
    confidence: 90,
    priority: 90,
  },
  {
    componentType: 'button',
    patterns: {
      tagNames: ['a', 'div', 'span'],
      classKeywords: ['btn', 'button', 'cta', 'call-to-action', 'primary', 'secondary'],
    },
    confidence: 85,
    priority: 80,
  },
  {
    componentType: 'button',
    patterns: {
      tagNames: ['a', 'div', 'span'],
      cssProperties: (styles) => looksLikeButton(styles),
    },
    confidence: 75,
    priority: 70,
  },
  {
    componentType: 'button',
    patterns: {
      tagNames: ['a'],
      contentPattern: /^(click|buy|download|submit|send|get started|learn more|sign up|subscribe|purchase|add to cart|checkout|register|join|contact|book|shop now|view more|read more|try free|start free|demo|order|apply|donate)$/i,
    },
    confidence: 60,
    priority: 50,
  },
  {
    componentType: 'submit-button',
    patterns: {
      tagNames: ['button', 'input'],
      contextRequired: {
        insideForm: true,
      },
    },
    confidence: 90,
    priority: 95,
  },
];
