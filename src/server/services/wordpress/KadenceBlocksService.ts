import * as cheerio from 'cheerio';

export interface KadenceBlock {
  blockName: string;
  attributes: Record<string, any>;
  innerBlocks: KadenceBlock[];
  innerHTML: string;
}

export interface KadenceExportResult {
  blocks: KadenceBlock[];
  blockContent: string;
  customCSS: string;
  globalStyles: Record<string, any>;
  metadata: {
    kadenceVersion: string;
    blockCount: number;
    hasAdvancedFeatures: boolean;
  };
}

/**
 * Kadence Blocks Pro Export Service
 * Converts HTML to Kadence Blocks format with advanced features
 */
export class KadenceBlocksService {
  private kadenceVersion: string = '3.2.0';

  /**
   * Convert HTML to Kadence Blocks format
   */
  async convertToKadence(html: string, css?: string): Promise<KadenceExportResult> {
    const $ = cheerio.load(html);
    const blocks: KadenceBlock[] = [];
    const customCSS: string[] = [];
    const globalStyles: Record<string, any> = {
      colors: [],
      fonts: [],
      spacing: {},
    };

    // Process main content
    $('body').children().each((_, element) => {
      const block = this.convertElementToKadenceBlock($, $(element));
      if (block) {
        blocks.push(block);
      }
    });

    // Extract custom CSS
    if (css) {
      customCSS.push(css);
    }
    $('style').each((_, style) => {
      customCSS.push($(style).html() || '');
    });

    // Generate global styles
    this.extractGlobalStyles($, globalStyles);

    // Generate block content
    const blockContent = this.generateKadenceBlockContent(blocks);

    return {
      blocks,
      blockContent,
      customCSS: customCSS.join('\n'),
      globalStyles,
      metadata: {
        kadenceVersion: this.kadenceVersion,
        blockCount: blocks.length,
        hasAdvancedFeatures: this.detectAdvancedFeatures(blocks),
      },
    };
  }

  /**
   * Convert HTML element to Kadence block
   */
  private convertElementToKadenceBlock(
    $: cheerio.CheerioAPI,
    $element: cheerio.Cheerio<any>
  ): KadenceBlock | null {
    const tagName = $element.prop('tagName')?.toLowerCase();
    if (!tagName) return null;

    // Detect block type based on element
    const blockType = this.detectKadenceBlockType($, $element, tagName);
    const attributes = this.extractKadenceAttributes($, $element, blockType);
    const innerBlocks: KadenceBlock[] = [];

    // Process children for container blocks
    if (this.isContainerBlock(blockType)) {
      $element.children().each((_, child) => {
        const childBlock = this.convertElementToKadenceBlock($, $(child));
        if (childBlock) {
          innerBlocks.push(childBlock);
        }
      });
    }

    return {
      blockName: blockType,
      attributes,
      innerBlocks,
      innerHTML: $.html($element),
    };
  }

  /**
   * Detect Kadence block type from element
   */
  private detectKadenceBlockType(
    $: cheerio.CheerioAPI,
    $element: cheerio.Cheerio<any>,
    tagName: string
  ): string {
    const classes = $element.attr('class') || '';
    const id = $element.attr('id') || '';

    // Advanced Heading
    if (tagName.match(/^h[1-6]$/)) {
      return 'kadence/advancedheading';
    }

    // Row Layout (Container)
    if (
      tagName === 'section' ||
      tagName === 'div' &&
        (classes.includes('container') ||
          classes.includes('row') ||
          classes.includes('wp-block-kadence-rowlayout'))
    ) {
      return 'kadence/rowlayout';
    }

    // Column
    if (
      tagName === 'div' &&
      (classes.includes('col') || classes.includes('wp-block-kadence-column'))
    ) {
      return 'kadence/column';
    }

    // Advanced Button
    if (
      tagName === 'a' &&
      (classes.includes('btn') || classes.includes('button') || $element.closest('.wp-block-button').length > 0)
    ) {
      return 'kadence/advancedbtn';
    }

    // Icon
    if (
      (tagName === 'i' || tagName === 'svg') &&
      (classes.includes('icon') || classes.includes('fa-'))
    ) {
      return 'kadence/icon';
    }

    // Info Box
    if (
      tagName === 'div' &&
      (classes.includes('info-box') ||
        classes.includes('feature-box') ||
        classes.includes('wp-block-kadence-infobox'))
    ) {
      return 'kadence/infobox';
    }

    // Tabs
    if (
      tagName === 'div' &&
      (classes.includes('tabs') || classes.includes('wp-block-kadence-tabs'))
    ) {
      return 'kadence/tabs';
    }

    // Accordion
    if (
      tagName === 'div' &&
      (classes.includes('accordion') || classes.includes('wp-block-kadence-accordion'))
    ) {
      return 'kadence/accordion';
    }

    // Testimonial
    if (
      tagName === 'div' &&
      (classes.includes('testimonial') || classes.includes('review'))
    ) {
      return 'kadence/testimonials';
    }

    // Image
    if (tagName === 'img' || (tagName === 'figure' && $element.find('img').length > 0)) {
      return 'kadence/image';
    }

    // Advanced Gallery
    if (
      tagName === 'div' &&
      (classes.includes('gallery') || $element.find('img').length > 1)
    ) {
      return 'kadence/advancedgallery';
    }

    // Spacer/Divider
    if (tagName === 'hr' || classes.includes('spacer') || classes.includes('divider')) {
      return 'kadence/spacer';
    }

    // Icon List
    if (
      (tagName === 'ul' || tagName === 'ol') &&
      $element.find('i, svg').length > 0
    ) {
      return 'kadence/iconlist';
    }

    // Counter/Number
    if (
      tagName === 'div' &&
      (classes.includes('counter') || classes.includes('number'))
    ) {
      return 'kadence/counters';
    }

    // Progress Bar
    if (
      tagName === 'div' &&
      (classes.includes('progress') || classes.includes('skill-bar'))
    ) {
      return 'kadence/progressbar';
    }

    // Default blocks
    if (tagName === 'p') return 'core/paragraph';
    if (tagName === 'ul' || tagName === 'ol') return 'core/list';
    if (tagName === 'blockquote') return 'core/quote';

    // Generic container
    return 'kadence/rowlayout';
  }

  /**
   * Extract Kadence-specific attributes
   */
  private extractKadenceAttributes(
    $: cheerio.CheerioAPI,
    $element: cheerio.Cheerio<any>,
    blockType: string
  ): Record<string, any> {
    const attributes: Record<string, any> = {};
    const classes = $element.attr('class') || '';
    const styles = $element.attr('style') || '';

    // Common attributes
    attributes.uniqueID = this.generateUniqueID();
    attributes.className = classes;

    // Parse inline styles
    const styleObj = this.parseInlineStyles(styles);

    // Block-specific attributes
    switch (blockType) {
      case 'kadence/advancedheading':
        attributes.content = $element.text();
        attributes.level = parseInt($element.prop('tagName')?.replace('H', '') || '2');
        attributes.color = styleObj.color || '';
        attributes.size = this.parseSizeValue(styleObj.fontSize);
        attributes.textAlign = styleObj.textAlign || 'left';
        attributes.fontFamily = styleObj.fontFamily || '';
        attributes.fontWeight = styleObj.fontWeight || '';
        break;

      case 'kadence/rowlayout':
        attributes.columns = $element.children().length || 1;
        attributes.colLayout = this.detectColumnLayout($element);
        attributes.bgColor = styleObj.backgroundColor || '';
        attributes.padding = this.parsePadding(styleObj);
        attributes.margin = this.parseMargin(styleObj);
        attributes.maxWidth = styleObj.maxWidth || '';
        attributes.containerWidth = 'normal';
        break;

      case 'kadence/column':
        attributes.width = this.calculateColumnWidth($, $element);
        attributes.padding = this.parsePadding(styleObj);
        attributes.bgColor = styleObj.backgroundColor || '';
        attributes.borderWidth = styleObj.borderWidth || '';
        attributes.borderColor = styleObj.borderColor || '';
        break;

      case 'kadence/advancedbtn':
        attributes.text = $element.text();
        attributes.link = $element.attr('href') || '';
        attributes.target = $element.attr('target') === '_blank';
        attributes.color = styleObj.color || '';
        attributes.background = styleObj.backgroundColor || '';
        attributes.borderRadius = this.parseSizeValue(styleObj.borderRadius);
        attributes.padding = this.parsePadding(styleObj);
        attributes.sizeType = 'custom';
        break;

      case 'kadence/icon':
        attributes.icon = this.extractIconName($element);
        attributes.size = this.parseSizeValue(styleObj.fontSize || styleObj.width);
        attributes.color = styleObj.color || '';
        attributes.hoverColor = '';
        break;

      case 'kadence/infobox':
        attributes.title = $element.find('h1, h2, h3, h4, h5, h6').first().text();
        attributes.mediaType = $element.find('img').length > 0 ? 'image' : 'icon';
        attributes.mediaImage = this.extractImageData($, $element);
        attributes.containerBackground = styleObj.backgroundColor || '';
        attributes.containerPadding = this.parsePadding(styleObj);
        break;

      case 'kadence/image':
        const $img = $element.is('img') ? $element : $element.find('img').first();
        attributes.url = $img.attr('src') || '';
        attributes.alt = $img.attr('alt') || '';
        attributes.width = $img.attr('width') || '';
        attributes.height = $img.attr('height') || '';
        attributes.align = styleObj.float || 'center';
        break;

      case 'kadence/spacer':
        attributes.spacerHeight = this.parseSizeValue(styleObj.height) || 40;
        attributes.dividerHeight = styleObj.borderWidth || '';
        attributes.dividerColor = styleObj.borderColor || '';
        break;

      case 'kadence/tabs':
        attributes.tabCount = $element.find('[role="tab"], .tab-title').length;
        attributes.titles = this.extractTabTitles($element);
        attributes.startTab = 1;
        attributes.layout = 'tabs';
        break;

      case 'kadence/accordion':
        attributes.paneCount = $element.find('.accordion-item, .panel').length;
        attributes.titles = this.extractAccordionTitles($element);
        attributes.openPane = 1;
        break;

      case 'kadence/testimonials':
        attributes.content = $element.find('p, .testimonial-text').first().text();
        attributes.title = $element.find('.testimonial-author, .author-name').first().text();
        attributes.occupation = $element.find('.testimonial-role, .author-role').first().text();
        attributes.rating = this.extractRating($element);
        break;
    }

    return attributes;
  }

  /**
   * Generate Kadence block content (WordPress block format)
   */
  private generateKadenceBlockContent(blocks: KadenceBlock[]): string {
    let content = '';

    for (const block of blocks) {
      content += this.blockToContent(block);
    }

    return content;
  }

  /**
   * Convert block object to WordPress block comment format
   */
  private blockToContent(block: KadenceBlock, indent: string = ''): string {
    const attributesJSON = JSON.stringify(block.attributes);
    let content = `${indent}<!-- wp:${block.blockName} ${attributesJSON} -->\n`;

    if (block.innerBlocks.length > 0) {
      for (const innerBlock of block.innerBlocks) {
        content += this.blockToContent(innerBlock, indent + '  ');
      }
    } else if (block.innerHTML) {
      content += `${indent}${block.innerHTML}\n`;
    }

    content += `${indent}<!-- /wp:${block.blockName} -->\n`;

    return content;
  }

  /**
   * Check if block is a container type
   */
  private isContainerBlock(blockType: string): boolean {
    return [
      'kadence/rowlayout',
      'kadence/column',
      'kadence/tabs',
      'kadence/accordion',
      'kadence/infobox',
    ].includes(blockType);
  }

  /**
   * Extract global styles from document
   */
  private extractGlobalStyles(
    $: cheerio.CheerioAPI,
    globalStyles: Record<string, any>
  ): void {
    // Extract color palette
    const colors = new Set<string>();
    $('[style*="color"], [style*="background"]').each((_, el) => {
      const style = $(el).attr('style') || '';
      const colorMatches = style.match(/#[0-9A-Fa-f]{6}|rgb\([^)]+\)/g);
      if (colorMatches) {
        colorMatches.forEach((color) => colors.add(color));
      }
    });
    globalStyles.colors = Array.from(colors);

    // Extract fonts
    const fonts = new Set<string>();
    $('[style*="font-family"]').each((_, el) => {
      const style = $(el).attr('style') || '';
      const fontMatch = style.match(/font-family:\s*([^;]+)/);
      if (fontMatch) {
        fonts.add(fontMatch[1].replace(/['"]/g, ''));
      }
    });
    globalStyles.fonts = Array.from(fonts);
  }

  /**
   * Detect advanced features usage
   */
  private detectAdvancedFeatures(blocks: KadenceBlock[]): boolean {
    const advancedBlockTypes = [
      'kadence/tabs',
      'kadence/accordion',
      'kadence/advancedgallery',
      'kadence/counters',
      'kadence/progressbar',
      'kadence/testimonials',
    ];

    return blocks.some(
      (block) =>
        advancedBlockTypes.includes(block.blockName) ||
        block.innerBlocks.some((inner) => advancedBlockTypes.includes(inner.blockName))
    );
  }

  // Helper methods

  private generateUniqueID(): string {
    return `_${Math.random().toString(36).substr(2, 9)}`;
  }

  private parseInlineStyles(styleString: string): Record<string, string> {
    const styles: Record<string, string> = {};
    if (!styleString) return styles;

    styleString.split(';').forEach((style) => {
      const [key, value] = style.split(':').map((s) => s.trim());
      if (key && value) {
        const camelKey = key.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
        styles[camelKey] = value;
      }
    });

    return styles;
  }

  private parseSizeValue(value?: string): number {
    if (!value) return 0;
    return parseInt(value.replace(/[^\d]/g, '')) || 0;
  }

  private parsePadding(styles: Record<string, string>): number[] {
    const padding = styles.padding || '0';
    const parts = padding.split(' ').map((p) => this.parseSizeValue(p));

    if (parts.length === 1) return [parts[0], parts[0], parts[0], parts[0]];
    if (parts.length === 2) return [parts[0], parts[1], parts[0], parts[1]];
    if (parts.length === 3) return [parts[0], parts[1], parts[2], parts[1]];
    return parts.slice(0, 4);
  }

  private parseMargin(styles: Record<string, string>): number[] {
    const margin = styles.margin || '0';
    return this.parsePadding({ padding: margin });
  }

  private detectColumnLayout($element: cheerio.Cheerio<any>): string {
    const childCount = $element.children().length;
    if (childCount === 1) return 'equal';
    if (childCount === 2) return 'two-grid';
    if (childCount === 3) return 'three-grid';
    if (childCount === 4) return 'four-grid';
    return 'row';
  }

  private calculateColumnWidth(
    $: cheerio.CheerioAPI,
    $element: cheerio.Cheerio<any>
  ): number {
    const parent = $element.parent();
    const siblings = parent.children().length;
    return siblings > 0 ? Math.round(100 / siblings) : 100;
  }

  private extractIconName($element: cheerio.Cheerio<any>): string {
    const classes = $element.attr('class') || '';
    const iconMatch = classes.match(/fa-([a-z-]+)/);
    return iconMatch ? iconMatch[1] : 'star';
  }

  private extractImageData($: cheerio.CheerioAPI, $element: cheerio.Cheerio<any>): any[] {
    const $img = $element.find('img').first();
    if (!$img.length) return [];

    return [
      {
        url: $img.attr('src') || '',
        alt: $img.attr('alt') || '',
        id: '',
      },
    ];
  }

  private extractTabTitles($element: cheerio.Cheerio<any>): string[] {
    const titles: string[] = [];
    $element.find('[role="tab"], .tab-title').each((_, el) => {
      titles.push(cheerio.load(el).text().trim());
    });
    return titles;
  }

  private extractAccordionTitles($element: cheerio.Cheerio<any>): string[] {
    const titles: string[] = [];
    $element.find('.accordion-title, .panel-title, h3, h4').each((_, el) => {
      titles.push(cheerio.load(el).text().trim());
    });
    return titles;
  }

  private extractRating($element: cheerio.Cheerio<any>): number {
    const stars = $element.find('.star, .fa-star').not('.fa-star-o, .empty').length;
    return stars || 5;
  }
}
