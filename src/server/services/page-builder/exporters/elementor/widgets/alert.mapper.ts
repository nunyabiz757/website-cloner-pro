/**
 * Alert Widget Mapper
 *
 * Maps alert/notification boxes to Elementor alert widget
 * Supports: success, info, warning, error/danger alerts
 */

import { RecognizedComponent } from '../../../types/component.types.js';
import { ElementorWidget } from '../../../types/elementor.types.js';

type AlertType = 'info' | 'success' | 'warning' | 'danger';

interface AlertMapping {
  title: string;
  description: string;
  type: AlertType;
  showDismiss: boolean;
  icon?: string;
}

export class AlertMapper {
  /**
   * Maps a recognized alert component to Elementor alert widget
   */
  static mapToElementor(component: RecognizedComponent): ElementorWidget {
    const mapping = this.extractMapping(component);

    return {
      id: this.generateUniqueId(),
      elType: 'widget',
      widgetType: 'alert',
      settings: {
        // Content
        alert_type: mapping.type,
        alert_title: mapping.title,
        alert_description: mapping.description,

        // Icon
        show_dismiss: mapping.showDismiss ? 'yes' : 'no',
        selected_icon: mapping.icon ? {
          value: mapping.icon,
          library: 'fa-solid'
        } : this.getDefaultIcon(mapping.type),

        // Style based on type
        ...this.getTypeStyles(mapping.type),

        // Typography
        title_typography_typography: 'custom',
        title_typography_font_size: {
          size: 16,
          unit: 'px'
        },
        title_typography_font_weight: '600',

        description_typography_typography: 'custom',
        description_typography_font_size: {
          size: 14,
          unit: 'px'
        },

        // Spacing
        content_padding: {
          top: 15,
          right: 20,
          bottom: 15,
          left: 20,
          unit: 'px'
        }
      }
    };
  }

  /**
   * Extract alert mapping from component
   */
  private static extractMapping(component: RecognizedComponent): AlertMapping {
    const element = component.element;

    return {
      title: this.extractTitle(element),
      description: this.extractDescription(element),
      type: this.detectAlertType(element),
      showDismiss: this.hasDismissButton(element),
      icon: this.extractIcon(element)
    };
  }

  /**
   * Extract alert title
   */
  private static extractTitle(element: Element): string {
    // Try strong/b tags first
    const strong = element.querySelector('strong, b, [class*="title"], [class*="heading"]');
    if (strong) {
      return strong.textContent?.trim() || '';
    }

    // Try heading tags
    const heading = element.querySelector('h1, h2, h3, h4, h5, h6');
    if (heading) {
      return heading.textContent?.trim() || '';
    }

    // Try data attribute
    const dataTitle = element.getAttribute('data-title');
    if (dataTitle) return dataTitle;

    return '';
  }

  /**
   * Extract alert description
   */
  private static extractDescription(element: Element): string {
    // Get all text content
    let text = element.textContent?.trim() || '';

    // Remove title text if found
    const title = this.extractTitle(element);
    if (title) {
      text = text.replace(title, '').trim();
    }

    // Remove dismiss button text
    const dismissBtn = element.querySelector('[class*="close"], [class*="dismiss"]');
    if (dismissBtn) {
      const dismissText = dismissBtn.textContent?.trim() || '';
      text = text.replace(dismissText, '').trim();
    }

    return text;
  }

  /**
   * Detect alert type from classes and attributes
   */
  private static detectAlertType(element: Element): AlertType {
    const classList = element.className.toLowerCase();
    const role = element.getAttribute('role')?.toLowerCase();

    // Check for explicit type classes
    if (classList.includes('success') || classList.includes('check')) return 'success';
    if (classList.includes('warning') || classList.includes('warn')) return 'warning';
    if (classList.includes('danger') || classList.includes('error') || classList.includes('fail')) return 'danger';
    if (classList.includes('info') || classList.includes('notice')) return 'info';

    // Check role attribute
    if (role === 'alert') {
      // Try to determine from content
      const text = element.textContent?.toLowerCase() || '';
      if (text.includes('success') || text.includes('complete')) return 'success';
      if (text.includes('warning') || text.includes('caution')) return 'warning';
      if (text.includes('error') || text.includes('failed')) return 'danger';
    }

    // Check for color-based detection (Bootstrap classes)
    if (classList.includes('alert-success') || classList.includes('bg-success')) return 'success';
    if (classList.includes('alert-warning') || classList.includes('bg-warning')) return 'warning';
    if (classList.includes('alert-danger') || classList.includes('bg-danger')) return 'danger';
    if (classList.includes('alert-info') || classList.includes('bg-info')) return 'info';

    // Default to info
    return 'info';
  }

  /**
   * Check if alert has dismiss button
   */
  private static hasDismissButton(element: Element): boolean {
    const dismissBtn = element.querySelector(
      '[class*="close"], [class*="dismiss"], [data-dismiss], button[aria-label*="close" i]'
    );
    return !!dismissBtn;
  }

  /**
   * Extract icon from alert
   */
  private static extractIcon(element: Element): string | undefined {
    // Check for Font Awesome icon
    const iconEl = element.querySelector('i[class*="fa-"]');
    if (iconEl) {
      const classes = iconEl.className.split(' ');
      const iconClass = classes.find(c =>
        c.startsWith('fa-') &&
        !c.match(/^fa-(solid|regular|brands|light|duotone)$/)
      );
      if (iconClass) return iconClass;
    }

    // Check for SVG
    const svg = element.querySelector('svg');
    if (svg) {
      // Try to match common alert icons
      const svgClass = svg.className.baseVal?.toLowerCase() || '';
      if (svgClass.includes('check')) return 'fas fa-check-circle';
      if (svgClass.includes('exclamation')) return 'fas fa-exclamation-triangle';
      if (svgClass.includes('info')) return 'fas fa-info-circle';
      if (svgClass.includes('times')) return 'fas fa-times-circle';
    }

    return undefined;
  }

  /**
   * Get default icon for alert type
   */
  private static getDefaultIcon(type: AlertType): { value: string; library: string } {
    const icons = {
      info: 'fas fa-info-circle',
      success: 'fas fa-check-circle',
      warning: 'fas fa-exclamation-triangle',
      danger: 'fas fa-times-circle'
    };

    return {
      value: icons[type],
      library: 'fa-solid'
    };
  }

  /**
   * Get color styles for alert type
   */
  private static getTypeStyles(type: AlertType): Record<string, string> {
    const styles = {
      info: {
        background_color: '#d1ecf1',
        border_color: '#bee5eb',
        title_color: '#0c5460',
        description_color: '#0c5460'
      },
      success: {
        background_color: '#d4edda',
        border_color: '#c3e6cb',
        title_color: '#155724',
        description_color: '#155724'
      },
      warning: {
        background_color: '#fff3cd',
        border_color: '#ffeaa7',
        title_color: '#856404',
        description_color: '#856404'
      },
      danger: {
        background_color: '#f8d7da',
        border_color: '#f5c6cb',
        title_color: '#721c24',
        description_color: '#721c24'
      }
    };

    return styles[type];
  }

  /**
   * Generate unique Elementor widget ID
   */
  private static generateUniqueId(): string {
    return Math.random().toString(36).substring(2, 11);
  }
}

export default AlertMapper;
