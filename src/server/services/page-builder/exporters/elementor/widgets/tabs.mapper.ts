/**
 * Tabs Widget Mapper
 *
 * Maps tabbed content interfaces to Elementor tabs widget
 */

import { RecognizedComponent } from '../../../types/component.types.js';
import { ElementorWidget } from '../../../types/elementor.types.js';

interface TabItem {
  title: string;
  content: string;
  icon?: string;
}

export class TabsMapper {
  /**
   * Maps a recognized tabs component to Elementor tabs widget
   */
  static mapToElementor(component: RecognizedComponent): ElementorWidget {
    const tabs = this.extractTabs(component.element);

    return {
      id: this.generateUniqueId(),
      elType: 'widget',
      widgetType: 'tabs',
      settings: {
        // Tabs data
        tabs: tabs.map((tab, index) => ({
          _id: this.generateUniqueId(),
          tab_title: tab.title,
          tab_content: tab.content,
          tab_icon: tab.icon ? {
            value: tab.icon,
            library: 'fa-solid'
          } : undefined
        })),

        // Layout
        type: this.detectTabsType(component.element), // 'horizontal' | 'vertical'

        // Style - Navigation
        navigation_width: {
          size: 25,
          unit: '%'
        },
        border_width: {
          size: 1,
          unit: 'px'
        },
        border_color: '#d4d4d4',

        // Style - Title
        title_background_color: '#ffffff',
        title_text_color: '#555555',
        title_active_color: '#000000',
        title_typography_typography: 'custom',
        title_typography_font_size: {
          size: 16,
          unit: 'px'
        },
        title_typography_font_weight: '600',

        // Style - Content
        content_background_color: '#ffffff',
        content_text_color: '#333333',
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
          top: 20,
          right: 20,
          bottom: 20,
          left: 20,
          unit: 'px'
        }
      }
    };
  }

  /**
   * Extract tabs from element
   */
  private static extractTabs(element: Element): TabItem[] {
    const tabs: TabItem[] = [];

    // Method 1: Bootstrap-style tabs (tab list + tab content)
    const tabList = element.querySelector('[role="tablist"], .nav-tabs, [class*="tab-list"]');
    const tabContent = element.querySelector('.tab-content, [class*="tab-content"]');

    if (tabList && tabContent) {
      const tabButtons = tabList.querySelectorAll('[role="tab"], .nav-link, [class*="tab"]');
      const tabPanels = tabContent.querySelectorAll('[role="tabpanel"], .tab-pane, [class*="tab-pane"]');

      tabButtons.forEach((button, index) => {
        const panel = tabPanels[index];
        if (button && panel) {
          tabs.push({
            title: this.extractTabTitle(button),
            content: this.extractTabContent(panel),
            icon: this.extractTabIcon(button)
          });
        }
      });

      return tabs;
    }

    // Method 2: Generic tab structure
    const tabHeaders = element.querySelectorAll('[class*="tab-header"], [class*="tab-title"], [data-tab]');
    const tabBodies = element.querySelectorAll('[class*="tab-body"], [class*="tab-panel"], [class*="tab-content"]');

    if (tabHeaders.length > 0 && tabBodies.length > 0) {
      tabHeaders.forEach((header, index) => {
        const body = tabBodies[index];
        if (header && body) {
          tabs.push({
            title: this.extractTabTitle(header),
            content: this.extractTabContent(body),
            icon: this.extractTabIcon(header)
          });
        }
      });

      return tabs;
    }

    // Method 3: Details/summary elements (native HTML tabs)
    const details = element.querySelectorAll('details');
    if (details.length > 0) {
      details.forEach(detail => {
        const summary = detail.querySelector('summary');
        if (summary) {
          tabs.push({
            title: summary.textContent?.trim() || 'Tab',
            content: this.extractTabContent(detail),
            icon: this.extractTabIcon(summary)
          });
        }
      });
    }

    return tabs;
  }

  /**
   * Extract tab title
   */
  private static extractTabTitle(element: Element): string {
    // Remove icon elements from text
    const clone = element.cloneNode(true) as Element;
    clone.querySelectorAll('i, svg, img').forEach(icon => icon.remove());

    const text = clone.textContent?.trim() || '';
    return text || 'Tab';
  }

  /**
   * Extract tab content
   */
  private static extractTabContent(element: Element): string {
    // For tabpanel, get inner HTML
    let content = element.innerHTML || '';

    // For details, exclude summary
    if (element.tagName.toLowerCase() === 'details') {
      const clone = element.cloneNode(true) as Element;
      const summary = clone.querySelector('summary');
      if (summary) {
        summary.remove();
      }
      content = clone.innerHTML || '';
    }

    return content.trim();
  }

  /**
   * Extract tab icon
   */
  private static extractTabIcon(element: Element): string | undefined {
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

    return undefined;
  }

  /**
   * Detect tabs orientation (horizontal or vertical)
   */
  private static detectTabsType(element: Element): 'horizontal' | 'vertical' {
    const classList = element.className.toLowerCase();

    // Check for explicit vertical classes
    if (classList.includes('vertical') || classList.includes('tabs-vertical')) {
      return 'vertical';
    }

    // Check for horizontal classes
    if (classList.includes('horizontal') || classList.includes('tabs-horizontal')) {
      return 'horizontal';
    }

    // Check flex direction
    if (element instanceof HTMLElement) {
      const computedStyle = getComputedStyle(element);
      if (computedStyle.flexDirection === 'column') {
        return 'vertical';
      }
    }

    // Default to horizontal
    return 'horizontal';
  }

  /**
   * Generate unique Elementor widget ID
   */
  private static generateUniqueId(): string {
    return Math.random().toString(36).substring(2, 11);
  }
}

export default TabsMapper;
