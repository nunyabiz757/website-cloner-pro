import * as cheerio from 'cheerio';
import crypto from 'crypto';
import type { ClonedWebsite } from '../../../shared/types/index.js';

/**
 * Bricks Builder uses a modern element-based structure
 * Each element is a JSON object with settings and can contain children
 */

interface BricksElement {
  id: string;
  name: string; // Element type: 'section', 'container', 'div', 'heading', 'text', 'image', etc.
  label?: string;
  parent?: string;
  children?: string[];
  settings?: any;
}

export class BricksService {
  private elements: Map<string, BricksElement> = new Map();
  private elementOrder: string[] = [];

  /**
   * Convert cloned website to Bricks Builder format
   */
  convertToBricks(website: ClonedWebsite): any {
    this.elements.clear();
    this.elementOrder = [];

    const $ = cheerio.load(website.html);
    const $body = $('body');

    // Parse body content as top-level sections
    $body.children().each((index, element) => {
      this.parseElement($, element, null);
    });

    // Convert Map to array of elements
    const elementsArray = Array.from(this.elements.values());

    return {
      version: '1.9',
      elements: elementsArray,
    };
  }

  /**
   * Parse HTML element to Bricks element
   */
  private parseElement(
    $: cheerio.CheerioAPI,
    element: cheerio.Element,
    parentId: string | null
  ): string | null {
    const $element = $(element);
    const tagName = element.tagName?.toLowerCase();

    // Skip script and style tags
    if (['script', 'style', 'noscript'].includes(tagName || '')) {
      return null;
    }

    const elementId = this.generateId();
    let bricksElement: BricksElement | null = null;

    // Determine element type and create appropriate Bricks element
    if (this.isSection($element)) {
      bricksElement = this.createSection($, $element, elementId, parentId);
    } else if (this.isContainer($element)) {
      bricksElement = this.createContainer($, $element, elementId, parentId);
    } else {
      bricksElement = this.createElementByTag($, $element, elementId, parentId);
    }

    if (bricksElement) {
      this.elements.set(elementId, bricksElement);

      if (!parentId) {
        this.elementOrder.push(elementId);
      }

      return elementId;
    }

    return null;
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
   * Check if element is a container
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
   * Create section element
   */
  private createSection(
    $: cheerio.CheerioAPI,
    $element: cheerio.Cheerio<cheerio.Element>,
    elementId: string,
    parentId: string | null
  ): BricksElement {
    const children: string[] = [];

    // Parse children
    $element.children().each((index, child) => {
      const childId = this.parseElement($, child, elementId);
      if (childId) {
        children.push(childId);
      }
    });

    return {
      id: elementId,
      name: 'section',
      label: 'Section',
      parent: parentId || '0',
      children: children,
      settings: {
        ...this.extractBackgroundSettings($element),
        ...this.extractSpacingSettings($element),
        _width: '100%',
      },
    };
  }

  /**
   * Create container/div element
   */
  private createContainer(
    $: cheerio.CheerioAPI,
    $element: cheerio.Cheerio<cheerio.Element>,
    elementId: string,
    parentId: string | null
  ): BricksElement {
    const children: string[] = [];

    // Parse children
    $element.children().each((index, child) => {
      const childId = this.parseElement($, child, elementId);
      if (childId) {
        children.push(childId);
      }
    });

    return {
      id: elementId,
      name: 'container',
      label: 'Container',
      parent: parentId || '0',
      children: children,
      settings: {
        ...this.extractBackgroundSettings($element),
        ...this.extractSpacingSettings($element),
        ...this.extractLayoutSettings($element),
      },
    };
  }

  /**
   * Create element based on HTML tag
   */
  private createElementByTag(
    $: cheerio.CheerioAPI,
    $element: cheerio.Cheerio<cheerio.Element>,
    elementId: string,
    parentId: string | null
  ): BricksElement | null {
    const tagName = $element.prop('tagName')?.toLowerCase();

    switch (tagName) {
      case 'h1':
      case 'h2':
      case 'h3':
      case 'h4':
      case 'h5':
      case 'h6':
        return this.createHeadingElement($element, elementId, parentId);

      case 'p':
        return this.createTextElement($element, elementId, parentId);

      case 'img':
        return this.createImageElement($element, elementId, parentId);

      case 'a':
        if ($element.find('img').length > 0) {
          return this.createImageElement($element.find('img'), elementId, parentId);
        }
        return this.createButtonElement($element, elementId, parentId);

      case 'button':
        return this.createButtonElement($element, elementId, parentId);

      case 'ul':
      case 'ol':
        return this.createListElement($element, elementId, parentId);

      case 'video':
        return this.createVideoElement($element, elementId, parentId);

      case 'iframe':
        return this.createHtmlElement($element, elementId, parentId);

      case 'form':
        return this.createFormElement($element, elementId, parentId);

      case 'div':
        // Recursively parse div content
        return this.createContainer($, $element, elementId, parentId);

      default:
        // If it has text content, create a text element
        if ($element.text().trim()) {
          return this.createTextElement($element, elementId, parentId);
        }

        // If it has children, create a container
        if ($element.children().length > 0) {
          return this.createContainer($, $element, elementId, parentId);
        }

        return null;
    }
  }

  /**
   * Create heading element
   */
  private createHeadingElement(
    $element: cheerio.Cheerio<cheerio.Element>,
    elementId: string,
    parentId: string | null
  ): BricksElement {
    const tag = $element.prop('tagName')?.toLowerCase() || 'h2';
    const text = $element.html() || '';

    return {
      id: elementId,
      name: 'heading',
      label: 'Heading',
      parent: parentId || '0',
      settings: {
        text: text,
        tag: tag,
        ...this.extractTypographySettings($element),
        ...this.extractSpacingSettings($element),
      },
    };
  }

  /**
   * Create text/rich text element
   */
  private createTextElement(
    $element: cheerio.Cheerio<cheerio.Element>,
    elementId: string,
    parentId: string | null
  ): BricksElement {
    const html = $element.html() || '';

    return {
      id: elementId,
      name: 'text-basic',
      label: 'Text',
      parent: parentId || '0',
      settings: {
        text: html,
        ...this.extractTypographySettings($element),
        ...this.extractSpacingSettings($element),
      },
    };
  }

  /**
   * Create image element
   */
  private createImageElement(
    $element: cheerio.Cheerio<cheerio.Element>,
    elementId: string,
    parentId: string | null
  ): BricksElement {
    const src = $element.attr('src') || '';
    const alt = $element.attr('alt') || '';
    const width = $element.attr('width');
    const height = $element.attr('height');

    return {
      id: elementId,
      name: 'image',
      label: 'Image',
      parent: parentId || '0',
      settings: {
        image: {
          url: src,
          alt: alt,
        },
        objectFit: 'cover',
        ...(width && { _width: width + 'px' }),
        ...(height && { _height: height + 'px' }),
        ...this.extractSpacingSettings($element),
      },
    };
  }

  /**
   * Create button element
   */
  private createButtonElement(
    $element: cheerio.Cheerio<cheerio.Element>,
    elementId: string,
    parentId: string | null
  ): BricksElement {
    const text = $element.text();
    const href = $element.attr('href') || '#';

    return {
      id: elementId,
      name: 'button',
      label: 'Button',
      parent: parentId || '0',
      settings: {
        text: text,
        link: {
          type: 'external',
          url: href,
          newTab: href.startsWith('http'),
        },
        ...this.extractButtonSettings($element),
        ...this.extractSpacingSettings($element),
      },
    };
  }

  /**
   * Create list element (using text-basic with HTML)
   */
  private createListElement(
    $element: cheerio.Cheerio<cheerio.Element>,
    elementId: string,
    parentId: string | null
  ): BricksElement {
    const html = cheerio.load($element).html() || '';

    return {
      id: elementId,
      name: 'text-basic',
      label: 'List',
      parent: parentId || '0',
      settings: {
        text: html,
        ...this.extractTypographySettings($element),
      },
    };
  }

  /**
   * Create video element
   */
  private createVideoElement(
    $element: cheerio.Cheerio<cheerio.Element>,
    elementId: string,
    parentId: string | null
  ): BricksElement {
    const src = $element.attr('src') || '';

    return {
      id: elementId,
      name: 'video',
      label: 'Video',
      parent: parentId || '0',
      settings: {
        videoType: 'media',
        videoUrl: src,
        controls: true,
      },
    };
  }

  /**
   * Create HTML/code element
   */
  private createHtmlElement(
    $element: cheerio.Cheerio<cheerio.Element>,
    elementId: string,
    parentId: string | null
  ): BricksElement {
    const html = cheerio.load($element).html() || '';

    return {
      id: elementId,
      name: 'code',
      label: 'HTML',
      parent: parentId || '0',
      settings: {
        code: html,
        executeCode: true,
      },
    };
  }

  /**
   * Create form element
   */
  private createFormElement(
    $element: cheerio.Cheerio<cheerio.Element>,
    elementId: string,
    parentId: string | null
  ): BricksElement {
    const html = cheerio.load($element).html() || '';

    return {
      id: elementId,
      name: 'code',
      label: 'Form',
      parent: parentId || '0',
      settings: {
        code: html,
        executeCode: true,
      },
    };
  }

  /**
   * Extract background settings
   */
  private extractBackgroundSettings($element: cheerio.Cheerio<cheerio.Element>): any {
    const style = $element.attr('style') || '';
    const settings: any = {};

    const bgColor = style.match(/background-color:\s*([^;]+)/);
    if (bgColor) {
      settings.background = {
        color: bgColor[1].trim(),
      };
    }

    const bgImage = style.match(/background-image:\s*url\(["']?([^"')]+)["']?\)/);
    if (bgImage) {
      settings.background = {
        ...settings.background,
        image: {
          url: bgImage[1],
        },
        size: 'cover',
        position: 'center center',
      };
    }

    return settings;
  }

  /**
   * Extract spacing settings (padding/margin)
   */
  private extractSpacingSettings($element: cheerio.Cheerio<cheerio.Element>): any {
    const style = $element.attr('style') || '';
    const settings: any = {};

    const padding = style.match(/padding:\s*([^;]+)/);
    if (padding) {
      settings._padding = this.parseSpacing(padding[1].trim());
    }

    const margin = style.match(/margin:\s*([^;]+)/);
    if (margin) {
      settings._margin = this.parseSpacing(margin[1].trim());
    }

    return settings;
  }

  /**
   * Extract typography settings
   */
  private extractTypographySettings($element: cheerio.Cheerio<cheerio.Element>): any {
    const style = $element.attr('style') || '';
    const settings: any = {};

    const color = style.match(/color:\s*([^;]+)/);
    if (color) {
      settings.color = color[1].trim();
    }

    const fontSize = style.match(/font-size:\s*([^;]+)/);
    if (fontSize) {
      settings.typography = {
        ...settings.typography,
        fontSize: fontSize[1].trim(),
      };
    }

    const fontWeight = style.match(/font-weight:\s*([^;]+)/);
    if (fontWeight) {
      settings.typography = {
        ...settings.typography,
        fontWeight: fontWeight[1].trim(),
      };
    }

    const textAlign = style.match(/text-align:\s*([^;]+)/);
    if (textAlign) {
      settings._textAlign = textAlign[1].trim();
    }

    return settings;
  }

  /**
   * Extract button-specific settings
   */
  private extractButtonSettings($element: cheerio.Cheerio<cheerio.Element>): any {
    const style = $element.attr('style') || '';
    const settings: any = {};

    const bgColor = style.match(/background-color:\s*([^;]+)/);
    if (bgColor) {
      settings.background = {
        color: bgColor[1].trim(),
      };
    }

    const textColor = style.match(/color:\s*([^;]+)/);
    if (textColor) {
      settings.color = textColor[1].trim();
    }

    const borderRadius = style.match(/border-radius:\s*([^;]+)/);
    if (borderRadius) {
      settings._border = {
        radius: borderRadius[1].trim(),
      };
    }

    return settings;
  }

  /**
   * Extract layout settings (flexbox/grid)
   */
  private extractLayoutSettings($element: cheerio.Cheerio<cheerio.Element>): any {
    const style = $element.attr('style') || '';
    const settings: any = {};

    const display = style.match(/display:\s*([^;]+)/);
    if (display) {
      const displayValue = display[1].trim();
      if (displayValue === 'flex' || displayValue === 'inline-flex') {
        settings._display = 'flex';

        const flexDirection = style.match(/flex-direction:\s*([^;]+)/);
        if (flexDirection) {
          settings._flexDirection = flexDirection[1].trim();
        }

        const justifyContent = style.match(/justify-content:\s*([^;]+)/);
        if (justifyContent) {
          settings._justifyContent = justifyContent[1].trim();
        }

        const alignItems = style.match(/align-items:\s*([^;]+)/);
        if (alignItems) {
          settings._alignItems = alignItems[1].trim();
        }
      }
    }

    return settings;
  }

  /**
   * Parse spacing value
   */
  private parseSpacing(value: string): any {
    const parts = value.split(' ').map((v) => v.trim());

    if (parts.length === 1) {
      return {
        top: parts[0],
        right: parts[0],
        bottom: parts[0],
        left: parts[0],
      };
    } else if (parts.length === 2) {
      return {
        top: parts[0],
        right: parts[1],
        bottom: parts[0],
        left: parts[1],
      };
    } else if (parts.length === 3) {
      return {
        top: parts[0],
        right: parts[1],
        bottom: parts[2],
        left: parts[1],
      };
    } else if (parts.length === 4) {
      return {
        top: parts[0],
        right: parts[1],
        bottom: parts[2],
        left: parts[3],
      };
    }

    return value;
  }

  /**
   * Generate unique element ID
   */
  private generateId(): string {
    return crypto.randomUUID().replace(/-/g, '').substring(0, 6);
  }

  /**
   * Generate Bricks export package
   */
  generateExportPackage(bricksData: any, website: ClonedWebsite): any {
    return {
      version: '1.9',
      title: website.metadata?.title || 'Imported Website',
      content: {
        elements: bricksData.elements,
      },
      settings: {
        template: 'bricks-blank',
      },
    };
  }
}
