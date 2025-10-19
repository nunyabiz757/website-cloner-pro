import * as cheerio from 'cheerio';
import crypto from 'crypto';
import type { ClonedWebsite } from '../../../shared/types/index.js';

/**
 * Oxygen Builder uses a tree structure with components
 * Each component has an id, name, options, and children
 */

interface OxygenComponent {
  id: number;
  name: string;
  depth: number;
  options?: any;
  children?: OxygenComponent[];
}

interface OxygenTree {
  id: number;
  name: string;
  depth: number;
  options: any;
  children: OxygenComponent[];
}

export class OxygenService {
  private componentId: number = 1;

  /**
   * Convert cloned website to Oxygen Builder format
   */
  convertToOxygen(website: ClonedWebsite): any {
    this.componentId = 1;

    const $ = cheerio.load(website.html);
    const $body = $('body');

    // Create root section component
    const rootSection: OxygenTree = {
      id: this.getNextId(),
      name: 'ct_section',
      depth: 0,
      options: {
        ct_id: this.getNextId(),
        ct_parent: 0,
        selector: 'section-' + this.getNextId(),
        original: {
          section_width: 'full-width',
          container_padding_top: '40',
          container_padding_bottom: '40',
        },
      },
      children: [],
    };

    // Parse body children as components
    $body.children().each((index, element) => {
      const component = this.parseElement($, element, 1);
      if (component) {
        rootSection.children.push(component);
      }
    });

    return {
      version: '4.0',
      tree: [rootSection],
    };
  }

  /**
   * Parse HTML element to Oxygen component
   */
  private parseElement(
    $: cheerio.CheerioAPI,
    element: cheerio.Element,
    depth: number
  ): OxygenComponent | null {
    const $element = $(element);
    const tagName = element.tagName?.toLowerCase();

    // Skip script and style tags
    if (['script', 'style', 'noscript'].includes(tagName || '')) {
      return null;
    }

    let component: OxygenComponent | null = null;

    // Determine component type based on HTML structure
    if (this.isSection($element)) {
      component = this.createSectionComponent($, $element, depth);
    } else if (this.isContainer($element)) {
      component = this.createDivBlockComponent($, $element, depth);
    } else {
      component = this.createComponentByTag($, $element, depth);
    }

    return component;
  }

  /**
   * Check if element should be a section
   */
  private isSection($element: cheerio.Cheerio<cheerio.Element>): boolean {
    const tagName = $element.prop('tagName')?.toLowerCase();
    const classes = $element.attr('class') || '';

    return (
      tagName === 'section' ||
      classes.includes('section') ||
      classes.includes('hero')
    );
  }

  /**
   * Check if element is a container/div
   */
  private isContainer($element: cheerio.Cheerio<cheerio.Element>): boolean {
    const tagName = $element.prop('tagName')?.toLowerCase();
    const classes = $element.attr('class') || '';

    return (
      tagName === 'div' &&
      (classes.includes('container') ||
        classes.includes('wrapper') ||
        classes.includes('row') ||
        classes.includes('col'))
    );
  }

  /**
   * Create section component
   */
  private createSectionComponent(
    $: cheerio.CheerioAPI,
    $element: cheerio.Cheerio<cheerio.Element>,
    depth: number
  ): OxygenComponent {
    const id = this.getNextId();
    const children: OxygenComponent[] = [];

    // Parse children
    $element.children().each((index, child) => {
      const childComponent = this.parseElement($, child, depth + 1);
      if (childComponent) {
        children.push(childComponent);
      }
    });

    return {
      id: id,
      name: 'ct_section',
      depth: depth,
      options: {
        ct_id: id,
        ct_parent: 0,
        selector: 'section-' + id,
        original: {
          section_width: 'full-width',
          ...this.extractBackgroundOptions($element),
          ...this.extractSpacingOptions($element),
        },
      },
      children: children,
    };
  }

  /**
   * Create div_block component (container)
   */
  private createDivBlockComponent(
    $: cheerio.CheerioAPI,
    $element: cheerio.Cheerio<cheerio.Element>,
    depth: number
  ): OxygenComponent {
    const id = this.getNextId();
    const children: OxygenComponent[] = [];

    // Parse children
    $element.children().each((index, child) => {
      const childComponent = this.parseElement($, child, depth + 1);
      if (childComponent) {
        children.push(childComponent);
      }
    });

    return {
      id: id,
      name: 'ct_div_block',
      depth: depth,
      options: {
        ct_id: id,
        ct_parent: 0,
        selector: 'div_block-' + id,
        original: {
          ...this.extractBackgroundOptions($element),
          ...this.extractSpacingOptions($element),
          ...this.extractLayoutOptions($element),
        },
      },
      children: children,
    };
  }

  /**
   * Create component based on HTML tag
   */
  private createComponentByTag(
    $: cheerio.CheerioAPI,
    $element: cheerio.Cheerio<cheerio.Element>,
    depth: number
  ): OxygenComponent | null {
    const tagName = $element.prop('tagName')?.toLowerCase();

    switch (tagName) {
      case 'h1':
      case 'h2':
      case 'h3':
      case 'h4':
      case 'h5':
      case 'h6':
        return this.createHeadingComponent($element, depth);

      case 'p':
        return this.createTextComponent($element, depth);

      case 'img':
        return this.createImageComponent($element, depth);

      case 'a':
        if ($element.find('img').length > 0) {
          return this.createImageComponent($element.find('img'), depth);
        }
        return this.createLinkComponent($element, depth);

      case 'button':
        return this.createButtonComponent($element, depth);

      case 'ul':
      case 'ol':
        return this.createListComponent($element, depth);

      case 'video':
        return this.createVideoComponent($element, depth);

      case 'iframe':
        return this.createCodeBlockComponent($element, depth);

      case 'form':
        return this.createCodeBlockComponent($element, depth);

      case 'div':
        return this.createDivBlockComponent($, $element, depth);

      default:
        // If it has text content, create a text component
        if ($element.text().trim()) {
          return this.createTextComponent($element, depth);
        }

        // If it has children, create a div block
        if ($element.children().length > 0) {
          return this.createDivBlockComponent($, $element, depth);
        }

        return null;
    }
  }

  /**
   * Create heading component
   */
  private createHeadingComponent(
    $element: cheerio.Cheerio<cheerio.Element>,
    depth: number
  ): OxygenComponent {
    const id = this.getNextId();
    const tag = $element.prop('tagName')?.toLowerCase() || 'h2';
    const text = $element.html() || '';

    return {
      id: id,
      name: 'ct_headline',
      depth: depth,
      options: {
        ct_id: id,
        ct_parent: 0,
        selector: 'headline-' + id,
        original: {
          tag: tag,
          headline_text: text,
          ...this.extractTextOptions($element),
          ...this.extractSpacingOptions($element),
        },
      },
    };
  }

  /**
   * Create text block component
   */
  private createTextComponent(
    $element: cheerio.Cheerio<cheerio.Element>,
    depth: number
  ): OxygenComponent {
    const id = this.getNextId();
    const html = $element.html() || '';

    return {
      id: id,
      name: 'ct_text_block',
      depth: depth,
      options: {
        ct_id: id,
        ct_parent: 0,
        selector: 'text_block-' + id,
        original: {
          ct_content: html,
          ...this.extractTextOptions($element),
          ...this.extractSpacingOptions($element),
        },
      },
    };
  }

  /**
   * Create image component
   */
  private createImageComponent(
    $element: cheerio.Cheerio<cheerio.Element>,
    depth: number
  ): OxygenComponent {
    const id = this.getNextId();
    const src = $element.attr('src') || '';
    const alt = $element.attr('alt') || '';
    const width = $element.attr('width');
    const height = $element.attr('height');

    return {
      id: id,
      name: 'ct_image',
      depth: depth,
      options: {
        ct_id: id,
        ct_parent: 0,
        selector: 'image-' + id,
        original: {
          src: src,
          alt: alt,
          ...(width && { width: width }),
          ...(height && { height: height }),
          ...this.extractSpacingOptions($element),
        },
      },
    };
  }

  /**
   * Create link wrapper component
   */
  private createLinkComponent(
    $element: cheerio.Cheerio<cheerio.Element>,
    depth: number
  ): OxygenComponent {
    const id = this.getNextId();
    const href = $element.attr('href') || '#';
    const text = $element.text();

    return {
      id: id,
      name: 'ct_link',
      depth: depth,
      options: {
        ct_id: id,
        ct_parent: 0,
        selector: 'link-' + id,
        original: {
          url: href,
          target: href.startsWith('http') ? '_blank' : '_self',
          link_text: text,
          ...this.extractTextOptions($element),
        },
      },
    };
  }

  /**
   * Create button component
   */
  private createButtonComponent(
    $element: cheerio.Cheerio<cheerio.Element>,
    depth: number
  ): OxygenComponent {
    const id = this.getNextId();
    const text = $element.text();
    const href = $element.attr('href') || '#';

    return {
      id: id,
      name: 'oxy_button',
      depth: depth,
      options: {
        ct_id: id,
        ct_parent: 0,
        selector: 'button-' + id,
        original: {
          button_text: text,
          button_link: href,
          button_link_target: href.startsWith('http') ? '_blank' : '_self',
          ...this.extractButtonOptions($element),
          ...this.extractSpacingOptions($element),
        },
      },
    };
  }

  /**
   * Create list component (using rich text)
   */
  private createListComponent(
    $element: cheerio.Cheerio<cheerio.Element>,
    depth: number
  ): OxygenComponent {
    const id = this.getNextId();
    const html = cheerio.load($element).html() || '';

    return {
      id: id,
      name: 'ct_text_block',
      depth: depth,
      options: {
        ct_id: id,
        ct_parent: 0,
        selector: 'text_block-' + id,
        original: {
          ct_content: html,
        },
      },
    };
  }

  /**
   * Create video component
   */
  private createVideoComponent(
    $element: cheerio.Cheerio<cheerio.Element>,
    depth: number
  ): OxygenComponent {
    const id = this.getNextId();
    const src = $element.attr('src') || '';

    return {
      id: id,
      name: 'oxy_video',
      depth: depth,
      options: {
        ct_id: id,
        ct_parent: 0,
        selector: 'video-' + id,
        original: {
          video_type: 'media_library',
          url: src,
        },
      },
    };
  }

  /**
   * Create code block component (for iframes, forms, etc.)
   */
  private createCodeBlockComponent(
    $element: cheerio.Cheerio<cheerio.Element>,
    depth: number
  ): OxygenComponent {
    const id = this.getNextId();
    const html = cheerio.load($element).html() || '';

    return {
      id: id,
      name: 'ct_code_block',
      depth: depth,
      options: {
        ct_id: id,
        ct_parent: 0,
        selector: 'code_block-' + id,
        original: {
          code: html,
        },
      },
    };
  }

  /**
   * Extract background options
   */
  private extractBackgroundOptions($element: cheerio.Cheerio<cheerio.Element>): any {
    const style = $element.attr('style') || '';
    const options: any = {};

    const bgColor = style.match(/background-color:\s*([^;]+)/);
    if (bgColor) {
      options.background_color = bgColor[1].trim();
    }

    const bgImage = style.match(/background-image:\s*url\(["']?([^"')]+)["']?\)/);
    if (bgImage) {
      options.background_image = bgImage[1];
      options.background_size = 'cover';
      options.background_position = 'center center';
    }

    return options;
  }

  /**
   * Extract spacing options (padding/margin)
   */
  private extractSpacingOptions($element: cheerio.Cheerio<cheerio.Element>): any {
    const style = $element.attr('style') || '';
    const options: any = {};

    // Padding
    const paddingMatch = style.match(/padding:\s*([^;]+)/);
    if (paddingMatch) {
      const padding = this.parseSpacing(paddingMatch[1].trim());
      options.padding_top = padding.top;
      options.padding_right = padding.right;
      options.padding_bottom = padding.bottom;
      options.padding_left = padding.left;
    }

    // Margin
    const marginMatch = style.match(/margin:\s*([^;]+)/);
    if (marginMatch) {
      const margin = this.parseSpacing(marginMatch[1].trim());
      options.margin_top = margin.top;
      options.margin_right = margin.right;
      options.margin_bottom = margin.bottom;
      options.margin_left = margin.left;
    }

    return options;
  }

  /**
   * Extract text/typography options
   */
  private extractTextOptions($element: cheerio.Cheerio<cheerio.Element>): any {
    const style = $element.attr('style') || '';
    const options: any = {};

    const color = style.match(/color:\s*([^;]+)/);
    if (color) {
      options.color = color[1].trim();
    }

    const fontSize = style.match(/font-size:\s*([^;]+)/);
    if (fontSize) {
      options.font_size = fontSize[1].trim();
    }

    const fontWeight = style.match(/font-weight:\s*([^;]+)/);
    if (fontWeight) {
      options.font_weight = fontWeight[1].trim();
    }

    const textAlign = style.match(/text-align:\s*([^;]+)/);
    if (textAlign) {
      options.text_align = textAlign[1].trim();
    }

    return options;
  }

  /**
   * Extract button-specific options
   */
  private extractButtonOptions($element: cheerio.Cheerio<cheerio.Element>): any {
    const style = $element.attr('style') || '';
    const options: any = {};

    const bgColor = style.match(/background-color:\s*([^;]+)/);
    if (bgColor) {
      options.button_color = bgColor[1].trim();
    }

    const textColor = style.match(/color:\s*([^;]+)/);
    if (textColor) {
      options.button_text_color = textColor[1].trim();
    }

    const borderRadius = style.match(/border-radius:\s*([^;]+)/);
    if (borderRadius) {
      options.border_radius = borderRadius[1].trim();
    }

    return options;
  }

  /**
   * Extract layout options (flexbox)
   */
  private extractLayoutOptions($element: cheerio.Cheerio<cheerio.Element>): any {
    const style = $element.attr('style') || '';
    const options: any = {};

    const display = style.match(/display:\s*([^;]+)/);
    if (display && display[1].trim() === 'flex') {
      options.display = 'flex';

      const flexDirection = style.match(/flex-direction:\s*([^;]+)/);
      if (flexDirection) {
        options.flex_direction = flexDirection[1].trim();
      }

      const justifyContent = style.match(/justify-content:\s*([^;]+)/);
      if (justifyContent) {
        options.justify_content = justifyContent[1].trim();
      }

      const alignItems = style.match(/align-items:\s*([^;]+)/);
      if (alignItems) {
        options.align_items = alignItems[1].trim();
      }
    }

    return options;
  }

  /**
   * Parse spacing value (padding/margin)
   */
  private parseSpacing(value: string): { top: string; right: string; bottom: string; left: string } {
    const parts = value.split(' ').map((v) => v.trim());

    if (parts.length === 1) {
      return { top: parts[0], right: parts[0], bottom: parts[0], left: parts[0] };
    } else if (parts.length === 2) {
      return { top: parts[0], right: parts[1], bottom: parts[0], left: parts[1] };
    } else if (parts.length === 3) {
      return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[1] };
    } else {
      return { top: parts[0], right: parts[1], bottom: parts[2], left: parts[3] };
    }
  }

  /**
   * Get next component ID
   */
  private getNextId(): number {
    return this.componentId++;
  }

  /**
   * Generate Oxygen export package
   */
  generateExportPackage(oxygenData: any, website: ClonedWebsite): any {
    return {
      version: '4.0',
      title: website.metadata?.title || 'Imported Website',
      tree: oxygenData.tree,
      settings: {
        page_template: 'page-blank.php',
      },
    };
  }
}
