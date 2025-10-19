import * as cheerio from 'cheerio';
import crypto from 'crypto';
import type { ClonedWebsite } from '../../../shared/types/index.js';

interface DiviModule {
  type: string;
  attrs: any;
  content?: string;
  children?: DiviModule[];
}

export class DiviService {
  /**
   * Convert cloned website to Divi JSON format
   */
  convertToDivi(website: ClonedWebsite): string {
    const $ = cheerio.load(website.html);
    const modules: DiviModule[] = [];

    // Parse body content
    const $body = $('body');

    $body.children().each((index, element) => {
      const module = this.parseElement($, element);
      if (module) {
        modules.push(module);
      }
    });

    // Convert modules to Divi shortcode format
    return this.modulesToShortcode(modules);
  }

  /**
   * Parse HTML element to Divi module
   */
  private parseElement($: cheerio.CheerioAPI, element: cheerio.Element): DiviModule | null {
    const $element = $(element);
    const tagName = element.tagName?.toLowerCase();

    // Skip script and style tags
    if (['script', 'style', 'noscript'].includes(tagName)) {
      return null;
    }

    // Determine if it's a section
    if (this.isSection($element)) {
      return this.createSection($, $element);
    }

    // Create appropriate module
    switch (tagName) {
      case 'h1':
      case 'h2':
      case 'h3':
      case 'h4':
      case 'h5':
      case 'h6':
        return this.createTextModule($element, 'heading');

      case 'p':
        return this.createTextModule($element, 'text');

      case 'img':
        return this.createImageModule($element);

      case 'a':
        if ($element.find('img').length > 0) {
          return this.createImageModule($element.find('img'));
        }
        return this.createButtonModule($element);

      case 'button':
        return this.createButtonModule($element);

      case 'video':
        return this.createVideoModule($element);

      case 'iframe':
        return this.createCodeModule($element);

      case 'ul':
      case 'ol':
        return this.createTextModule($element, 'text');

      default:
        if ($element.children().length > 0) {
          return this.createSection($, $element);
        }

        if ($element.text().trim()) {
          return this.createTextModule($element, 'text');
        }

        return null;
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
      classes.includes('container')
    );
  }

  /**
   * Create Divi section
   */
  private createSection($: cheerio.CheerioAPI, $element: cheerio.Cheerio<cheerio.Element>): DiviModule {
    const rows: DiviModule[] = [];

    // Create rows from children
    const children: DiviModule[] = [];

    $element.children().each((index, child) => {
      const module = this.parseElement($, child);
      if (module) {
        children.push(module);
      }
    });

    // Group modules into rows
    if (children.length > 0) {
      rows.push({
        type: 'et_pb_row',
        attrs: this.extractRowAttrs($element),
        children: [
          {
            type: 'et_pb_column',
            attrs: {
              type: '4_4', // Full width
            },
            children,
          },
        ],
      });
    }

    return {
      type: 'et_pb_section',
      attrs: this.extractSectionAttrs($element),
      children: rows,
    };
  }

  /**
   * Create text module (for headings and paragraphs)
   */
  private createTextModule($element: cheerio.Cheerio<cheerio.Element>, type: 'heading' | 'text'): DiviModule {
    const content = $element.html() || '';

    if (type === 'heading') {
      const level = $element.prop('tagName')?.slice(1) || '2';

      return {
        type: 'et_pb_text',
        attrs: {
          ...this.extractTextAttrs($element),
          header_level: `h${level}`,
        },
        content: `<${$element.prop('tagName')}>${content}</${$element.prop('tagName')}>`,
      };
    }

    return {
      type: 'et_pb_text',
      attrs: this.extractTextAttrs($element),
      content,
    };
  }

  /**
   * Create image module
   */
  private createImageModule($element: cheerio.Cheerio<cheerio.Element>): DiviModule {
    const src = $element.attr('src') || '';
    const alt = $element.attr('alt') || '';

    return {
      type: 'et_pb_image',
      attrs: {
        src,
        alt,
        ...this.extractImageAttrs($element),
      },
    };
  }

  /**
   * Create button module
   */
  private createButtonModule($element: cheerio.Cheerio<cheerio.Element>): DiviModule {
    const text = $element.text() || '';
    const url = $element.attr('href') || '#';

    return {
      type: 'et_pb_button',
      attrs: {
        button_url: url,
        button_text: text,
        ...this.extractButtonAttrs($element),
      },
    };
  }

  /**
   * Create video module
   */
  private createVideoModule($element: cheerio.Cheerio<cheerio.Element>): DiviModule {
    const src = $element.attr('src') || '';

    return {
      type: 'et_pb_video',
      attrs: {
        src,
      },
    };
  }

  /**
   * Create code module (for iframes and custom HTML)
   */
  private createCodeModule($element: cheerio.Cheerio<cheerio.Element>): DiviModule {
    const html = cheerio.load($element).html() || '';

    return {
      type: 'et_pb_code',
      attrs: {},
      content: html,
    };
  }

  /**
   * Extract section attributes
   */
  private extractSectionAttrs($element: cheerio.Cheerio<cheerio.Element>): any {
    const style = $element.attr('style') || '';
    const attrs: any = {
      admin_label: 'Section',
    };

    // Parse background color
    const bgColorMatch = style.match(/background-color:\s*([^;]+)/);
    if (bgColorMatch) {
      attrs.background_color = bgColorMatch[1].trim();
    }

    // Parse padding
    const paddingMatch = style.match(/padding:\s*([^;]+)/);
    if (paddingMatch) {
      const padding = paddingMatch[1].trim().split(' ');
      attrs.padding_top = padding[0];
      attrs.padding_bottom = padding[2] || padding[0];
    }

    return attrs;
  }

  /**
   * Extract row attributes
   */
  private extractRowAttrs($element: cheerio.Cheerio<cheerio.Element>): any {
    return {
      admin_label: 'Row',
    };
  }

  /**
   * Extract text module attributes
   */
  private extractTextAttrs($element: cheerio.Cheerio<cheerio.Element>): any {
    const style = $element.attr('style') || '';
    const attrs: any = {
      admin_label: 'Text',
    };

    // Text color
    const colorMatch = style.match(/color:\s*([^;]+)/);
    if (colorMatch) {
      attrs.text_color = colorMatch[1].trim();
    }

    // Font size
    const fontSizeMatch = style.match(/font-size:\s*([^;]+)/);
    if (fontSizeMatch) {
      attrs.font_size = fontSizeMatch[1].trim();
    }

    // Text align
    const textAlignMatch = style.match(/text-align:\s*([^;]+)/);
    if (textAlignMatch) {
      attrs.text_align = textAlignMatch[1].trim();
    }

    return attrs;
  }

  /**
   * Extract image module attributes
   */
  private extractImageAttrs($element: cheerio.Cheerio<cheerio.Element>): any {
    const attrs: any = {
      admin_label: 'Image',
    };

    // Width and height
    const width = $element.attr('width');
    const height = $element.attr('height');

    if (width) attrs.max_width = `${width}px`;
    if (height) attrs.max_height = `${height}px`;

    // Alignment
    const classes = $element.attr('class') || '';
    if (classes.includes('align-center')) {
      attrs.align = 'center';
    } else if (classes.includes('align-right')) {
      attrs.align = 'right';
    }

    return attrs;
  }

  /**
   * Extract button attributes
   */
  private extractButtonAttrs($element: cheerio.Cheerio<cheerio.Element>): any {
    const style = $element.attr('style') || '';
    const attrs: any = {
      admin_label: 'Button',
    };

    // Button color
    const bgColorMatch = style.match(/background-color:\s*([^;]+)/);
    if (bgColorMatch) {
      attrs.button_bg_color = bgColorMatch[1].trim();
    }

    // Button text color
    const colorMatch = style.match(/color:\s*([^;]+)/);
    if (colorMatch) {
      attrs.button_text_color = colorMatch[1].trim();
    }

    return attrs;
  }

  /**
   * Convert modules to Divi shortcode format
   */
  private modulesToShortcode(modules: DiviModule[]): string {
    return modules.map((module) => this.moduleToShortcode(module)).join('\n\n');
  }

  /**
   * Convert single module to shortcode
   */
  private moduleToShortcode(module: DiviModule): string {
    const attrs = this.attrsToString(module.attrs);

    if (module.children && module.children.length > 0) {
      const childrenShortcode = module.children
        .map((child) => this.moduleToShortcode(child))
        .join('\n');

      return `[${module.type}${attrs}]\n${childrenShortcode}\n[/${module.type}]`;
    }

    if (module.content) {
      return `[${module.type}${attrs}]${module.content}[/${module.type}]`;
    }

    return `[${module.type}${attrs} /]`;
  }

  /**
   * Convert attributes object to shortcode string
   */
  private attrsToString(attrs: any): string {
    if (!attrs || Object.keys(attrs).length === 0) {
      return '';
    }

    return (
      ' ' +
      Object.entries(attrs)
        .map(([key, value]) => `${key}="${value}"`)
        .join(' ')
    );
  }

  /**
   * Generate Divi export package
   */
  generateExportPackage(diviShortcode: string, website: ClonedWebsite): any {
    return {
      title: website.metadata?.title || 'Imported Website',
      content: diviShortcode,
      status: 'publish',
      type: 'page',
      meta: {
        _et_pb_use_builder: 'on',
        _et_pb_page_layout: 'et_full_width_page',
      },
    };
  }
}
