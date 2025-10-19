/**
 * Testimonial Widget Mapper
 * Maps testimonial/review components to Elementor testimonial widget
 */

import type { RecognizedComponent } from '../../../types/component.types.js';
import type { ElementorWidget } from '../../../types/builder.types.js';

export class TestimonialMapper {
  static mapToElementor(component: RecognizedComponent): ElementorWidget {
    const element = component.element;

    return {
      id: this.generateUniqueId(),
      elType: 'widget',
      widgetType: 'testimonial',
      settings: {
        testimonial_content: this.extractContent(element),
        testimonial_name: this.extractName(element),
        testimonial_job: this.extractJob(element),
        testimonial_image: {
          url: this.extractImage(element)
        },
        testimonial_alignment: 'center',
        testimonial_image_position: 'aside',
        show_image: this.hasImage(element) ? 'yes' : 'no'
      }
    };
  }

  private static extractContent(element: Element): string {
    const contentEl = element.querySelector('.testimonial-content, .review-text, blockquote, p');
    return contentEl?.textContent?.trim() || '';
  }

  private static extractName(element: Element): string {
    const nameEl = element.querySelector('.testimonial-name, .author-name, .name, cite, strong');
    return nameEl?.textContent?.trim() || '';
  }

  private static extractJob(element: Element): string {
    const jobEl = element.querySelector('.testimonial-job, .author-title, .title, .position');
    return jobEl?.textContent?.trim() || '';
  }

  private static extractImage(element: Element): string {
    const imgEl = element.querySelector('img');
    return imgEl?.getAttribute('src') || '';
  }

  private static hasImage(element: Element): boolean {
    return !!element.querySelector('img');
  }

  private static generateUniqueId(): string {
    return Math.random().toString(36).substring(2, 11);
  }
}

export default TestimonialMapper;
