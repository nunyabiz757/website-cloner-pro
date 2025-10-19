/**
 * Alert Recognition Patterns
 *
 * Detects alert/notification boxes (info, success, warning, error)
 */

import type { RecognitionPattern } from '../../types/component.types.js';

export const alertPatterns: RecognitionPattern[] = [
  {
    componentType: 'alert',
    patterns: {
      // High confidence: Has alert role or classes
      classKeywords: [
        'alert',
        'notification',
        'message',
        'notice',
        'alert-box'
      ],
      attributes: {
        'role': /alert|status|notification/i
      }
    },
    confidence: 90,
    priority: 8,
    reason: 'Alert with ARIA role or specific classes'
  },
  {
    componentType: 'alert',
    patterns: {
      // Medium-high confidence: Bootstrap alert classes
      classKeywords: [
        'alert-success',
        'alert-warning',
        'alert-danger',
        'alert-info',
        'alert-primary'
      ]
    },
    confidence: 95,
    priority: 9,
    reason: 'Bootstrap alert classes detected'
  },
  {
    componentType: 'alert',
    patterns: {
      // Medium confidence: Type-specific classes
      classKeywords: [
        'success',
        'error',
        'warning',
        'info',
        'danger'
      ],
      childPattern: '[class*="close"], [class*="dismiss"], [class*="icon"]'
    },
    confidence: 75,
    priority: 7,
    reason: 'Alert-like styling with close button or icon'
  }
];
