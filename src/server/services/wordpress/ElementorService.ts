import * as cheerio from 'cheerio';
import crypto from 'crypto';
import type { ClonedWebsite } from '../../../shared/types/index.js';

interface ElementorElement {
  id: string;
  elType: string;
  settings: any;
  elements?: ElementorElement[];
}

interface ElementorSection extends ElementorElement {
  elType: 'section';
}

interface ElementorColumn extends ElementorElement {
  elType: 'column';
}

interface ElementorWidget extends ElementorElement {
  elType: 'widget';
  widgetType: string;
}

export class ElementorService {
  /**
   * Convert cloned website to Elementor JSON format
   */
  convertToElementor(website: ClonedWebsite): any {
    const $ = cheerio.load(website.html);
    const elements: ElementorElement[] = [];

    // Parse main content sections
    const $body = $('body');

    // Find major sections
    $body.children().each((index, element) => {
      const section = this.parseElement($, element);
      if (section) {
        elements.push(section);
      }
    });

    // Build Elementor structure
    const elementorData = {
      version: '3.0.0',
      title: website.metadata?.title || 'Imported Website',
      type: 'page',
      content: elements,
    };

    return elementorData;
  }

  /**
   * Parse HTML element to Elementor structure
   */
  private parseElement($: cheerio.CheerioAPI, element: cheerio.Element): ElementorElement | null {
    const $element = $(element);
    const tagName = element.tagName?.toLowerCase();

    // Skip script and style tags
    if (['script', 'style', 'noscript'].includes(tagName)) {
      return null;
    }

    // Determine element type
    if (this.isSection($element)) {
      return this.createSection($, $element);
    } else if (this.isContainer($element)) {
      return this.createColumn($, $element);
    } else {
      return this.createWidget($, $element);
    }
  }

  /**
   * Check if element should be a section
   */
  private isSection($element: cheerio.Cheerio<cheerio.Element>): boolean {
    const classes = $element.attr('class') || '';
    const tagName = $element.prop('tagName')?.toLowerCase();

    return (
      tagName === 'section' ||
      classes.includes('section') ||
      classes.includes('container') ||
      classes.includes('row')
    );
  }

  /**
   * Check if element is a container/column
   */
  private isContainer($element: cheerio.Cheerio<cheerio.Element>): boolean {
    const classes = $element.attr('class') || '';
    const tagName = $element.prop('tagName')?.toLowerCase();

    return (
      tagName === 'div' &&
      (classes.includes('col') ||
        classes.includes('column') ||
        classes.includes('grid'))
    );
  }

  /**
   * Create Elementor section
   */
  private createSection($: cheerio.CheerioAPI, $element: cheerio.Cheerio<cheerio.Element>): ElementorSection {
    const columns: ElementorColumn[] = [];

    // Find columns within section
    $element.children().each((index, child) => {
      const column = this.createColumn($, $(child));
      if (column) {
        columns.push(column);
      }
    });

    // If no columns found, create a single column with all content
    if (columns.length === 0) {
      columns.push(this.createDefaultColumn($, $element));
    }

    return {
      id: crypto.randomUUID(),
      elType: 'section',
      settings: {
        ...this.extractStyles($element),
        layout: 'boxed',
      },
      elements: columns,
    };
  }

  /**
   * Create Elementor column
   */
  private createColumn($: cheerio.CheerioAPI, $element: cheerio.Cheerio<cheerio.Element>): ElementorColumn | null {
    const widgets: ElementorWidget[] = [];

    // Parse children as widgets
    $element.children().each((index, child) => {
      const widget = this.createWidget($, $(child));
      if (widget) {
        widgets.push(widget as ElementorWidget);
      }
    });

    if (widgets.length === 0 && $element.text().trim()) {
      // If no widgets but has text, create a text widget
      widgets.push(this.createTextWidget($element));
    }

    return {
      id: crypto.randomUUID(),
      elType: 'column',
      settings: {
        _column_size: 100, // Full width
        _inline_size: null,
        ...this.extractStyles($element),
      },
      elements: widgets,
    };
  }

  /**
   * Create default column with all content
   */
  private createDefaultColumn($: cheerio.CheerioAPI, $element: cheerio.Cheerio<cheerio.Element>): ElementorColumn {
    return {
      id: crypto.randomUUID(),
      elType: 'column',
      settings: {
        _column_size: 100,
      },
      elements: [this.createHtmlWidget($element)],
    };
  }

  /**
   * Create Elementor widget based on element type
   */
  private createWidget($: cheerio.CheerioAPI, $element: cheerio.Cheerio<cheerio.Element>): ElementorWidget | null {
    const tagName = $element.prop('tagName')?.toLowerCase();

    switch (tagName) {
      case 'h1':
      case 'h2':
      case 'h3':
      case 'h4':
      case 'h5':
      case 'h6':
        return this.createHeadingWidget($element);

      case 'p':
        return this.createTextWidget($element);

      case 'img':
        return this.createImageWidget($element);

      case 'a':
        if ($element.find('img').length > 0) {
          return this.createImageWidget($element.find('img'));
        }
        return this.createButtonWidget($element);

      case 'button':
        return this.createButtonWidget($element);

      case 'ul':
      case 'ol':
        return this.createListWidget($element);

      case 'video':
        return this.createVideoWidget($element);

      case 'iframe':
        return this.createIframeWidget($element);

      case 'form':
        return this.createHtmlWidget($element);

      default:
        // Check if it has children that should be parsed
        if ($element.children().length > 0) {
          return this.createHtmlWidget($element);
        }

        // If it has text content, create text widget
        if ($element.text().trim()) {
          return this.createTextWidget($element);
        }

        return null;
    }
  }

  /**
   * Create heading widget
   */
  private createHeadingWidget($element: cheerio.Cheerio<cheerio.Element>): ElementorWidget {
    const tag = $element.prop('tagName')?.toLowerCase() || 'h2';
    const text = $element.html() || '';

    return {
      id: crypto.randomUUID(),
      elType: 'widget',
      widgetType: 'heading',
      settings: {
        title: text,
        header_size: tag,
        align: this.getTextAlign($element),
        ...this.extractTextStyles($element),
      },
    };
  }

  /**
   * Create text widget
   */
  private createTextWidget($element: cheerio.Cheerio<cheerio.Element>): ElementorWidget {
    const html = $element.html() || '';

    return {
      id: crypto.randomUUID(),
      elType: 'widget',
      widgetType: 'text-editor',
      settings: {
        editor: html,
        ...this.extractTextStyles($element),
      },
    };
  }

  /**
   * Create image widget
   */
  private createImageWidget($element: cheerio.Cheerio<cheerio.Element>): ElementorWidget {
    const src = $element.attr('src') || '';
    const alt = $element.attr('alt') || '';
    const width = $element.attr('width');
    const height = $element.attr('height');

    return {
      id: crypto.randomUUID(),
      elType: 'widget',
      widgetType: 'image',
      settings: {
        image: {
          url: src,
          alt: alt,
        },
        width: width ? { size: parseInt(width), unit: 'px' } : null,
        height: height ? { size: parseInt(height), unit: 'px' } : null,
        align: this.getAlign($element),
        ...this.extractStyles($element),
      },
    };
  }

  /**
   * Create button widget
   */
  private createButtonWidget($element: cheerio.Cheerio<cheerio.Element>): ElementorWidget {
    const text = $element.text();
    const link = $element.attr('href') || '#';

    return {
      id: crypto.randomUUID(),
      elType: 'widget',
      widgetType: 'button',
      settings: {
        text: text,
        link: {
          url: link,
          is_external: link.startsWith('http'),
          nofollow: false,
        },
        align: this.getAlign($element),
        ...this.extractButtonStyles($element),
      },
    };
  }

  /**
   * Create list widget (icon-list)
   */
  private createListWidget($element: cheerio.Cheerio<cheerio.Element>): ElementorWidget {
    const items: any[] = [];

    $element.find('li').each((index, li) => {
      items.push({
        text: cheerio.load(li).text(),
        _id: crypto.randomUUID(),
      });
    });

    return {
      id: crypto.randomUUID(),
      elType: 'widget',
      widgetType: 'icon-list',
      settings: {
        icon_list: items,
        view: 'traditional',
      },
    };
  }

  /**
   * Create video widget
   */
  private createVideoWidget($element: cheerio.Cheerio<cheerio.Element>): ElementorWidget {
    const src = $element.attr('src') || '';

    return {
      id: crypto.randomUUID(),
      elType: 'widget',
      widgetType: 'video',
      settings: {
        video_type: 'hosted',
        hosted_url: { url: src },
      },
    };
  }

  /**
   * Create iframe/embed widget
   */
  private createIframeWidget($element: cheerio.Cheerio<cheerio.Element>): ElementorWidget {
    const src = $element.attr('src') || '';

    // Check if it's a YouTube or Vimeo embed
    if (src.includes('youtube.com') || src.includes('youtu.be')) {
      return {
        id: crypto.randomUUID(),
        elType: 'widget',
        widgetType: 'video',
        settings: {
          video_type: 'youtube',
          youtube_url: src,
        },
      };
    }

    return this.createHtmlWidget($element);
  }

  /**
   * Create HTML widget for complex/custom content
   */
  private createHtmlWidget($element: cheerio.Cheerio<cheerio.Element>): ElementorWidget {
    const html = cheerio.load($element).html() || '';

    return {
      id: crypto.randomUUID(),
      elType: 'widget',
      widgetType: 'html',
      settings: {
        html: html,
      },
    };
  }

  /**
   * Extract styles from element
   */
  private extractStyles($element: cheerio.Cheerio<cheerio.Element>): any {
    const style = $element.attr('style') || '';
    const styles: any = {};

    // Parse inline styles
    style.split(';').forEach((prop) => {
      const [key, value] = prop.split(':').map((s) => s.trim());
      if (key && value) {
        styles[key] = value;
      }
    });

    // Extract common CSS properties
    const result: any = {};

    if (styles['background-color']) {
      result.background_color = styles['background-color'];
    }

    if (styles['padding']) {
      result.padding = this.parseSpacing(styles['padding']);
    }

    if (styles['margin']) {
      result.margin = this.parseSpacing(styles['margin']);
    }

    if (styles['border']) {
      result.border_border = 'solid';
      result.border_width = this.parseBorder(styles['border']);
    }

    return result;
  }

  /**
   * Extract text-specific styles
   */
  private extractTextStyles($element: cheerio.Cheerio<cheerio.Element>): any {
    const style = $element.attr('style') || '';
    const styles: any = {};

    style.split(';').forEach((prop) => {
      const [key, value] = prop.split(':').map((s) => s.trim());
      if (key && value) {
        styles[key] = value;
      }
    });

    const result: any = {};

    if (styles['color']) {
      result.text_color = styles['color'];
    }

    if (styles['font-size']) {
      result.typography_font_size = { size: parseInt(styles['font-size']), unit: 'px' };
    }

    if (styles['font-weight']) {
      result.typography_font_weight = styles['font-weight'];
    }

    if (styles['text-align']) {
      result.align = styles['text-align'];
    }

    return result;
  }

  /**
   * Extract button-specific styles
   */
  private extractButtonStyles($element: cheerio.Cheerio<cheerio.Element>): any {
    const style = $element.attr('style') || '';
    const styles: any = {};

    style.split(';').forEach((prop) => {
      const [key, value] = prop.split(':').map((s) => s.trim());
      if (key && value) {
        styles[key] = value;
      }
    });

    const result: any = {};

    if (styles['background-color']) {
      result.button_background_color = styles['background-color'];
    }

    if (styles['color']) {
      result.button_text_color = styles['color'];
    }

    if (styles['border-radius']) {
      result.border_radius = { size: parseInt(styles['border-radius']), unit: 'px' };
    }

    return result;
  }

  /**
   * Get text alignment
   */
  private getTextAlign($element: cheerio.Cheerio<cheerio.Element>): string {
    const style = $element.attr('style') || '';
    const match = style.match(/text-align:\s*([^;]+)/);
    return match ? match[1].trim() : 'left';
  }

  /**
   * Get general alignment
   */
  private getAlign($element: cheerio.Cheerio<cheerio.Element>): string {
    const classes = $element.attr('class') || '';

    if (classes.includes('text-center') || classes.includes('align-center')) {
      return 'center';
    }
    if (classes.includes('text-right') || classes.includes('align-right')) {
      return 'right';
    }

    return 'left';
  }

  /**
   * Parse spacing values (padding/margin)
   */
  private parseSpacing(value: string): any {
    const parts = value.split(' ');

    if (parts.length === 1) {
      return { size: parseInt(parts[0]), unit: 'px' };
    }

    return {
      top: parseInt(parts[0]) || 0,
      right: parseInt(parts[1] || parts[0]) || 0,
      bottom: parseInt(parts[2] || parts[0]) || 0,
      left: parseInt(parts[3] || parts[1] || parts[0]) || 0,
      unit: 'px',
    };
  }

  /**
   * Parse border value
   */
  private parseBorder(value: string): any {
    const parts = value.split(' ');
    const width = parseInt(parts[0]) || 1;

    return {
      top: width,
      right: width,
      bottom: width,
      left: width,
      unit: 'px',
    };
  }

  /**
   * Generate Elementor export package
   */
  generateExportPackage(elementorData: any, website: ClonedWebsite): any {
    return {
      version: '3.0.0',
      title: website.metadata?.title || 'Imported Website',
      type: 'page',
      content: JSON.stringify(elementorData.content),
      page_settings: {
        post_status: 'publish',
        template: 'elementor_canvas',
      },
    };
  }
}
