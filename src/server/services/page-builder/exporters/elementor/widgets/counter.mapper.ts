/**
 * Counter Widget Mapper
 *
 * Maps recognized counter/animated number components to Elementor counter widget
 * Supports: CountUp.js, Odometer, vanilla counters
 */

import type { RecognizedComponent } from '../../../types/component.types.js';
import type { ElementorWidget } from '../../../types/builder.types.js';

export class CounterMapper {
  static mapToElementor(component: RecognizedComponent): ElementorWidget {
    const element = component.element;
    const content = component.content || {};

    const startingNumber = content.startingNumber || this.extractStartingNumber(element);
    const endingNumber = content.endingNumber || this.extractEndingNumber(element);
    const title = content.title || this.extractTitle(element);
    const prefix = content.prefix || this.extractPrefix(element);
    const suffix = content.suffix || this.extractSuffix(element);

    return {
      id: this.generateUniqueId(),
      elType: 'widget',
      widgetType: 'counter',
      settings: {
        starting_number: startingNumber,
        ending_number: endingNumber,
        duration: 2000, // 2 seconds animation
        thousand_separator: ',',
        thousand_separator_char: ',',
        prefix: prefix || '',
        suffix: suffix || '',
        title: title || '',
        number_color: '#333333',
        title_color: '#666666',
        number_size: {
          size: 48,
          unit: 'px'
        },
        title_size: {
          size: 16,
          unit: 'px'
        }
      }
    };
  }

  private static extractEndingNumber(element: Element): number {
    // Check data attributes
    const dataValue = element.getAttribute('data-value') ||
                     element.getAttribute('data-to') ||
                     element.getAttribute('data-count');
    if (dataValue) return parseInt(dataValue.replace(/[^\d.-]/g, ''));

    // Extract from text content
    const text = element.textContent?.trim() || '';
    const numbers = text.match(/[\d,]+/);
    if (numbers) {
      return parseInt(numbers[0].replace(/,/g, ''));
    }

    return 1000;
  }

  private static extractStartingNumber(element: Element): number {
    const dataFrom = element.getAttribute('data-from');
    return dataFrom ? parseInt(dataFrom) : 0;
  }

  private static extractTitle(element: Element): string {
    const titleEl = element.querySelector('.counter-title, .title, label');
    return titleEl?.textContent?.trim() || '';
  }

  private static extractPrefix(element: Element): string {
    const text = element.textContent || '';
    if (text.startsWith('$')) return '$';
    if (text.startsWith('€')) return '€';
    if (text.startsWith('£')) return '£';
    return '';
  }

  private static extractSuffix(element: Element): string {
    const text = element.textContent || '';
    if (text.includes('+') && !text.startsWith('+')) return '+';
    if (text.includes('%')) return '%';
    if (text.includes('K')) return 'K';
    if (text.includes('M')) return 'M';
    return '';
  }

  private static generateUniqueId(): string {
    return Math.random().toString(36).substring(2, 11);
  }
}

export default CounterMapper;
