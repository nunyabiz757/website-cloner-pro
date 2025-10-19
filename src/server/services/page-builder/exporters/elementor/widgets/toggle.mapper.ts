/**
 * Toggle Widget Mapper
 *
 * Maps accordion/toggle components to Elementor toggle widget
 * Similar to accordion but typically used for single collapsible items
 */

import { RecognizedComponent } from '../../../types/component.types.js';
import { ElementorWidget } from '../../../types/elementor.types.js';

interface ToggleItem {
  title: string;
  content: string;
  icon?: string;
  isOpen?: boolean;
}

export class ToggleMapper {
  /**
   * Maps a recognized toggle/accordion to Elementor toggle widget
   */
  static mapToElementor(component: RecognizedComponent): ElementorWidget {
    const items = this.extractItems(component.element);

    return {
      id: this.generateUniqueId(),
      elType: 'widget',
      widgetType: 'toggle',
      settings: {
        // Toggle items
        tabs: items.map((item, index) => ({
          _id: this.generateUniqueId(),
          tab_title: item.title,
          tab_content: item.content,
          tab_icon: item.icon ? {
            value: item.icon,
            library: 'fa-solid'
          } : {
            value: 'fas fa-caret-right',
            library: 'fa-solid'
          }
        })),

        // Icon settings
        icon: {
          value: 'fas fa-caret-right',
          library: 'fa-solid'
        },
        icon_active: {
          value: 'fas fa-caret-down',
          library: 'fa-solid'
        },
        icon_align: 'left',

        // Style - Title
        title_background: '#ffffff',
        title_color: '#333333',
        tab_active_color: '#000000',
        title_typography_typography: 'custom',
        title_typography_font_size: {
          size: 16,
          unit: 'px'
        },
        title_typography_font_weight: '600',

        // Style - Content
        content_background_color: '#f7f7f7',
        content_color: '#666666',
        content_typography_typography: 'custom',
        content_typography_font_size: {
          size: 14,
          unit: 'px'
        },

        // Spacing
        title_padding: {
          top: 15,
          right: 20,
          bottom: 15,
          left: 20,
          unit: 'px'
        },
        content_padding: {
          top: 15,
          right: 20,
          bottom: 15,
          left: 20,
          unit: 'px'
        },

        // Borders
        border_width: {
          size: 1,
          unit: 'px'
        },
        border_color: '#e0e0e0'
      }
    };
  }

  /**
   * Extract toggle items from element
   */
  private static extractItems(element: Element): ToggleItem[] {
    const items: ToggleItem[] = [];

    // Method 1: Bootstrap accordion structure
    const accordionItems = element.querySelectorAll('.accordion-item, [class*="accordion-item"]');
    if (accordionItems.length > 0) {
      accordionItems.forEach(item => {
        const extracted = this.extractFromAccordionItem(item);
        if (extracted) {
          items.push(extracted);
        }
      });
      return items;
    }

    // Method 2: Details/summary elements (native HTML)
    const details = element.querySelectorAll('details');
    if (details.length > 0) {
      details.forEach(detail => {
        const summary = detail.querySelector('summary');
        if (summary) {
          const clone = detail.cloneNode(true) as Element;
          clone.querySelector('summary')?.remove();

          items.push({
            title: summary.textContent?.trim() || 'Item',
            content: clone.innerHTML?.trim() || '',
            icon: this.extractIcon(summary),
            isOpen: detail.hasAttribute('open')
          });
        }
      });
      return items;
    }

    // Method 3: Generic collapsible items
    const collapsibles = element.querySelectorAll(
      '[class*="collapse"], [class*="toggle"], [class*="expandable"]'
    );
    if (collapsibles.length > 0) {
      collapsibles.forEach(item => {
        const extracted = this.extractFromGenericItem(item);
        if (extracted) {
          items.push(extracted);
        }
      });
      return items;
    }

    // Method 4: ARIA-based detection
    const ariaButtons = element.querySelectorAll('[aria-expanded]');
    if (ariaButtons.length > 0) {
      ariaButtons.forEach(button => {
        const targetId = button.getAttribute('aria-controls');
        const target = targetId ? document.getElementById(targetId) : null;

        if (target) {
          items.push({
            title: button.textContent?.trim() || 'Item',
            content: target.innerHTML || '',
            icon: this.extractIcon(button),
            isOpen: button.getAttribute('aria-expanded') === 'true'
          });
        }
      });
      return items;
    }

    return items;
  }

  /**
   * Extract from Bootstrap accordion item
   */
  private static extractFromAccordionItem(item: Element): ToggleItem | null {
    const header = item.querySelector('.accordion-header, [class*="header"]');
    const body = item.querySelector('.accordion-body, .accordion-collapse, [class*="body"]');

    if (!header || !body) return null;

    return {
      title: header.textContent?.trim() || 'Item',
      content: body.innerHTML || '',
      icon: this.extractIcon(header),
      isOpen: body.classList.contains('show')
    };
  }

  /**
   * Extract from generic collapsible item
   */
  private static extractFromGenericItem(item: Element): ToggleItem | null {
    // Look for header/title element
    const header = item.querySelector(
      '[class*="header"], [class*="title"], [class*="trigger"], [class*="toggle"]'
    );

    // Look for content/body element
    const body = item.querySelector(
      '[class*="content"], [class*="body"], [class*="panel"]'
    );

    if (!header) return null;

    return {
      title: header.textContent?.trim() || 'Item',
      content: body?.innerHTML || item.innerHTML.replace(header.outerHTML, '').trim(),
      icon: this.extractIcon(header),
      isOpen: item.classList.contains('active') || item.classList.contains('open')
    };
  }

  /**
   * Extract icon from element
   */
  private static extractIcon(element: Element): string | undefined {
    const iconEl = element.querySelector('i[class*="fa-"]');
    if (iconEl) {
      const classes = iconEl.className.split(' ');
      const iconClass = classes.find(c =>
        c.startsWith('fa-') &&
        !c.match(/^fa-(solid|regular|brands|light|duotone)$/)
      );
      if (iconClass) return iconClass;
    }

    return undefined;
  }

  /**
   * Generate unique Elementor widget ID
   */
  private static generateUniqueId(): string {
    return Math.random().toString(36).substring(2, 11);
  }
}

export default ToggleMapper;
