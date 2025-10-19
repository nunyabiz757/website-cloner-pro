import * as cheerio from 'cheerio';
import crypto from 'crypto';
import type { ClonedWebsite } from '../../../shared/types/index.js';

/**
 * Beaver Builder uses a nested row -> column -> module structure
 * Each element is a JSON object with settings
 */

interface BBNode {
  node: string; // UUID
  type: string; // 'row' | 'column' | 'module'
  settings: any;
  parent?: string;
}

interface BBRow extends BBNode {
  type: 'row';
  settings: {
    width: 'full' | 'fixed';
    content_width: number;
    bg_color?: string;
    bg_image?: string;
    spacing?: any;
  };
}

interface BBColumn extends BBNode {
  type: 'column';
  settings: {
    size: number; // Percentage
    responsive_size?: number;
    spacing?: any;
  };
}

interface BBModule extends BBNode {
  type: 'module';
  settings: {
    type: string; // 'heading' | 'text' | 'photo' | 'button' | 'html' etc.
    [key: string]: any;
  };
}

export class BeaverBuilderService {
  /**
   * Convert cloned website to Beaver Builder format
   */
  convertToBeaverBuilder(website: ClonedWebsite): any {
    const $ = cheerio.load(website.html);
    const nodes: BBNode[] = [];
    const nodeOrder: Record<string, string[]> = {};

    // Parse main content
    const $body = $('body');

    // Create root order
    nodeOrder['root'] = [];

    // Parse each top-level section as a row
    $body.children().each((index, element) => {
      const rowData = this.parseRow($, element, nodes, nodeOrder);
      if (rowData) {
        nodeOrder['root'].push(rowData.node);
      }
    });

    // Build Beaver Builder data structure
    const bbData: Record<string, any> = {};

    // Convert nodes array to object keyed by node ID
    nodes.forEach((node) => {
      bbData[node.node] = {
        ...node,
      };
    });

    return {
      version: '2.7',
      layout: bbData,
      nodeOrder: nodeOrder,
    };
  }

  /**
   * Parse a row (top-level section)
   */
  private parseRow(
    $: cheerio.CheerioAPI,
    element: cheerio.Element,
    nodes: BBNode[],
    nodeOrder: Record<string, string[]>
  ): BBRow | null {
    const $element = $(element);
    const tagName = element.tagName?.toLowerCase();

    // Skip script and style tags
    if (['script', 'style', 'noscript'].includes(tagName)) {
      return null;
    }

    const rowNode = crypto.randomUUID();
    nodeOrder[rowNode] = [];

    // Extract row settings
    const rowSettings: any = {
      width: 'full',
      content_width: 1200,
      ...this.extractBackgroundStyles($element),
      ...this.extractSpacing($element),
    };

    const row: BBRow = {
      node: rowNode,
      type: 'row',
      settings: rowSettings,
    };

    nodes.push(row);

    // Parse columns within the row
    const columns = this.findColumns($element);

    if (columns.length > 0) {
      // Multiple columns detected
      columns.forEach(($col) => {
        const colData = this.parseColumn($, $col, rowNode, nodes, nodeOrder);
        if (colData) {
          nodeOrder[rowNode].push(colData.node);
        }
      });
    } else {
      // Single column with all content
      const colData = this.createSingleColumn($, $element, rowNode, nodes, nodeOrder);
      nodeOrder[rowNode].push(colData.node);
    }

    return row;
  }

  /**
   * Find column elements within a container
   */
  private findColumns($element: cheerio.Cheerio<cheerio.Element>): cheerio.Cheerio<cheerio.Element>[] {
    const columns: cheerio.Cheerio<cheerio.Element>[] = [];
    const $ = cheerio.load($element.html() || '');

    // Look for common column class patterns
    $('[class*="col"]').each((index, elem) => {
      columns.push($(elem));
    });

    // If no columns found by class, check for direct children divs
    if (columns.length === 0) {
      $element.children('div').each((index, elem) => {
        columns.push($(elem));
      });
    }

    return columns;
  }

  /**
   * Parse a column
   */
  private parseColumn(
    $: cheerio.CheerioAPI,
    $element: cheerio.Cheerio<cheerio.Element>,
    parentNode: string,
    nodes: BBNode[],
    nodeOrder: Record<string, string[]>
  ): BBColumn | null {
    const colNode = crypto.randomUUID();
    nodeOrder[colNode] = [];

    // Determine column size from classes
    const classes = $element.attr('class') || '';
    const size = this.extractColumnSize(classes);

    const column: BBColumn = {
      node: colNode,
      type: 'column',
      parent: parentNode,
      settings: {
        size: size,
        ...this.extractSpacing($element),
      },
    };

    nodes.push(column);

    // Parse modules within the column
    $element.children().each((index, child) => {
      const moduleData = this.parseModule($, $(child), colNode, nodes);
      if (moduleData) {
        nodeOrder[colNode].push(moduleData.node);
      }
    });

    return column;
  }

  /**
   * Create a single column with all content
   */
  private createSingleColumn(
    $: cheerio.CheerioAPI,
    $element: cheerio.Cheerio<cheerio.Element>,
    parentNode: string,
    nodes: BBNode[],
    nodeOrder: Record<string, string[]>
  ): BBColumn {
    const colNode = crypto.randomUUID();
    nodeOrder[colNode] = [];

    const column: BBColumn = {
      node: colNode,
      type: 'column',
      parent: parentNode,
      settings: {
        size: 100,
      },
    };

    nodes.push(column);

    // Parse all children as modules
    $element.children().each((index, child) => {
      const moduleData = this.parseModule($, $(child), colNode, nodes);
      if (moduleData) {
        nodeOrder[colNode].push(moduleData.node);
      }
    });

    return column;
  }

  /**
   * Parse a module based on element type
   */
  private parseModule(
    $: cheerio.CheerioAPI,
    $element: cheerio.Cheerio<cheerio.Element>,
    parentNode: string,
    nodes: BBNode[]
  ): BBModule | null {
    const tagName = $element.prop('tagName')?.toLowerCase();

    // Skip script and style tags
    if (['script', 'style', 'noscript'].includes(tagName || '')) {
      return null;
    }

    let module: BBModule | null = null;

    switch (tagName) {
      case 'h1':
      case 'h2':
      case 'h3':
      case 'h4':
      case 'h5':
      case 'h6':
        module = this.createHeadingModule($element, parentNode);
        break;

      case 'p':
        module = this.createTextModule($element, parentNode);
        break;

      case 'img':
        module = this.createPhotoModule($element, parentNode);
        break;

      case 'a':
        if ($element.find('img').length > 0) {
          module = this.createPhotoModule($element.find('img'), parentNode);
        } else {
          module = this.createButtonModule($element, parentNode);
        }
        break;

      case 'button':
        module = this.createButtonModule($element, parentNode);
        break;

      case 'ul':
      case 'ol':
        module = this.createListModule($element, parentNode);
        break;

      case 'video':
        module = this.createVideoModule($element, parentNode);
        break;

      case 'iframe':
        module = this.createHtmlModule($element, parentNode);
        break;

      case 'form':
        module = this.createHtmlModule($element, parentNode);
        break;

      default:
        // Check if it has meaningful text or HTML content
        if ($element.text().trim() || $element.children().length > 0) {
          module = this.createHtmlModule($element, parentNode);
        }
        break;
    }

    if (module) {
      nodes.push(module);
    }

    return module;
  }

  /**
   * Create heading module
   */
  private createHeadingModule(
    $element: cheerio.Cheerio<cheerio.Element>,
    parentNode: string
  ): BBModule {
    const tag = $element.prop('tagName')?.toLowerCase() || 'h2';
    const text = $element.html() || '';

    return {
      node: crypto.randomUUID(),
      type: 'module',
      parent: parentNode,
      settings: {
        type: 'heading',
        heading: text,
        tag: tag,
        align: this.getTextAlign($element),
        color: this.extractColor($element),
        font_size: this.extractFontSize($element),
      },
    };
  }

  /**
   * Create text/rich text module
   */
  private createTextModule(
    $element: cheerio.Cheerio<cheerio.Element>,
    parentNode: string
  ): BBModule {
    const html = $element.html() || '';

    return {
      node: crypto.randomUUID(),
      type: 'module',
      parent: parentNode,
      settings: {
        type: 'rich-text',
        text: html,
        ...this.extractTextStyles($element),
      },
    };
  }

  /**
   * Create photo module
   */
  private createPhotoModule(
    $element: cheerio.Cheerio<cheerio.Element>,
    parentNode: string
  ): BBModule {
    const src = $element.attr('src') || '';
    const alt = $element.attr('alt') || '';
    const link = $element.parent('a').attr('href') || '';

    return {
      node: crypto.randomUUID(),
      type: 'module',
      parent: parentNode,
      settings: {
        type: 'photo',
        photo_src: src,
        alt: alt,
        link: link,
        link_target: link.startsWith('http') ? '_blank' : '_self',
        align: this.getAlign($element),
      },
    };
  }

  /**
   * Create button module
   */
  private createButtonModule(
    $element: cheerio.Cheerio<cheerio.Element>,
    parentNode: string
  ): BBModule {
    const text = $element.text();
    const link = $element.attr('href') || '#';

    return {
      node: crypto.randomUUID(),
      type: 'module',
      parent: parentNode,
      settings: {
        type: 'button',
        text: text,
        link: link,
        link_target: link.startsWith('http') ? '_blank' : '_self',
        align: this.getAlign($element),
        bg_color: this.extractBackgroundColor($element),
        text_color: this.extractColor($element),
        border_radius: this.extractBorderRadius($element),
      },
    };
  }

  /**
   * Create list module (using HTML module with list markup)
   */
  private createListModule(
    $element: cheerio.Cheerio<cheerio.Element>,
    parentNode: string
  ): BBModule {
    const html = cheerio.load($element).html() || '';

    return {
      node: crypto.randomUUID(),
      type: 'module',
      parent: parentNode,
      settings: {
        type: 'rich-text',
        text: html,
      },
    };
  }

  /**
   * Create video module
   */
  private createVideoModule(
    $element: cheerio.Cheerio<cheerio.Element>,
    parentNode: string
  ): BBModule {
    const src = $element.attr('src') || '';

    return {
      node: crypto.randomUUID(),
      type: 'module',
      parent: parentNode,
      settings: {
        type: 'video',
        video_type: 'media_library',
        video: src,
      },
    };
  }

  /**
   * Create HTML module for complex/custom content
   */
  private createHtmlModule(
    $element: cheerio.Cheerio<cheerio.Element>,
    parentNode: string
  ): BBModule {
    const html = cheerio.load($element).html() || '';

    return {
      node: crypto.randomUUID(),
      type: 'module',
      parent: parentNode,
      settings: {
        type: 'html',
        html: html,
      },
    };
  }

  /**
   * Extract column size from class names
   */
  private extractColumnSize(classes: string): number {
    // Common patterns: col-6, col-md-4, col-lg-3, etc.
    const colMatch = classes.match(/col-(?:xs-|sm-|md-|lg-|xl-)?(\d+)/);

    if (colMatch) {
      const cols = parseInt(colMatch[1]);
      // Assuming 12-column grid
      return (cols / 12) * 100;
    }

    // Default to full width
    return 100;
  }

  /**
   * Extract background styles
   */
  private extractBackgroundStyles($element: cheerio.Cheerio<cheerio.Element>): any {
    const style = $element.attr('style') || '';
    const result: any = {};

    const bgColor = style.match(/background-color:\s*([^;]+)/);
    if (bgColor) {
      result.bg_color = bgColor[1].trim();
    }

    const bgImage = style.match(/background-image:\s*url\(["']?([^"')]+)["']?\)/);
    if (bgImage) {
      result.bg_image = bgImage[1];
      result.bg_size = 'cover';
      result.bg_repeat = 'no-repeat';
    }

    return result;
  }

  /**
   * Extract spacing (padding/margin)
   */
  private extractSpacing($element: cheerio.Cheerio<cheerio.Element>): any {
    const style = $element.attr('style') || '';
    const result: any = {};

    const padding = style.match(/padding:\s*([^;]+)/);
    if (padding) {
      result.padding = padding[1].trim();
    }

    const margin = style.match(/margin:\s*([^;]+)/);
    if (margin) {
      result.margin = margin[1].trim();
    }

    return result;
  }

  /**
   * Extract text styles
   */
  private extractTextStyles($element: cheerio.Cheerio<cheerio.Element>): any {
    const result: any = {};

    const color = this.extractColor($element);
    if (color) {
      result.color = color;
    }

    const fontSize = this.extractFontSize($element);
    if (fontSize) {
      result.font_size = fontSize;
    }

    const align = this.getTextAlign($element);
    if (align) {
      result.align = align;
    }

    return result;
  }

  /**
   * Extract color from element
   */
  private extractColor($element: cheerio.Cheerio<cheerio.Element>): string | null {
    const style = $element.attr('style') || '';
    const match = style.match(/color:\s*([^;]+)/);
    return match ? match[1].trim() : null;
  }

  /**
   * Extract background color
   */
  private extractBackgroundColor($element: cheerio.Cheerio<cheerio.Element>): string | null {
    const style = $element.attr('style') || '';
    const match = style.match(/background-color:\s*([^;]+)/);
    return match ? match[1].trim() : null;
  }

  /**
   * Extract font size
   */
  private extractFontSize($element: cheerio.Cheerio<cheerio.Element>): string | null {
    const style = $element.attr('style') || '';
    const match = style.match(/font-size:\s*([^;]+)/);
    return match ? match[1].trim() : null;
  }

  /**
   * Extract border radius
   */
  private extractBorderRadius($element: cheerio.Cheerio<cheerio.Element>): string | null {
    const style = $element.attr('style') || '';
    const match = style.match(/border-radius:\s*([^;]+)/);
    return match ? match[1].trim() : null;
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
   * Get general alignment from classes
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
   * Generate Beaver Builder export package
   */
  generateExportPackage(bbData: any, website: ClonedWebsite): any {
    return {
      version: '2.7',
      title: website.metadata?.title || 'Imported Website',
      layout: bbData.layout,
      nodeOrder: bbData.nodeOrder,
      settings: {
        template: 'fl-builder-blank',
        enabled: 'true',
      },
    };
  }
}
