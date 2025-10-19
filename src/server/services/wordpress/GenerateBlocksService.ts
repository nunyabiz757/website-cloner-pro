import * as cheerio from 'cheerio';

/**
 * GenerateBlocks Service
 * Converts HTML to GenerateBlocks format - a lightweight, performance-focused block system
 *
 * GenerateBlocks philosophy:
 * - Minimal markup
 * - Performance-first
 * - Pure CSS (no JavaScript unless necessary)
 * - Semantic HTML
 * - Container, Button, Headline, Grid blocks
 */

export interface GenerateBlock {
  blockName: string;
  attrs: Record<string, any>;
  innerBlocks: GenerateBlock[];
  innerHTML: string;
  innerContent: (string | null)[];
}

export interface GenerateBlocksContainer {
  uniqueId: string;
  element: 'div' | 'section' | 'article' | 'header' | 'footer' | 'aside';
  tagName?: string;
  className?: string;
  backgroundColor?: string;
  textColor?: string;
  linkColor?: string;
  paddingTop?: string;
  paddingRight?: string;
  paddingBottom?: string;
  paddingLeft?: string;
  marginTop?: string;
  marginRight?: string;
  marginBottom?: string;
  marginLeft?: string;
  borderRadius?: string;
  minHeight?: string;
  maxWidth?: string;
  width?: string;
  flexWrap?: 'wrap' | 'nowrap';
  flexDirection?: 'row' | 'column';
  alignItems?: 'flex-start' | 'center' | 'flex-end' | 'stretch';
  justifyContent?: 'flex-start' | 'center' | 'flex-end' | 'space-between' | 'space-around';
  innerContainer?: 'contained' | 'full';
  anchor?: string;
}

export interface GenerateBlocksButton {
  uniqueId: string;
  text: string;
  url?: string;
  target?: '_blank' | '_self';
  rel?: string;
  backgroundColor?: string;
  textColor?: string;
  backgroundColorHover?: string;
  textColorHover?: string;
  paddingTop?: string;
  paddingRight?: string;
  paddingBottom?: string;
  paddingLeft?: string;
  borderRadius?: string;
  fontSize?: string;
  fontWeight?: string;
  letterSpacing?: string;
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
  width?: string;
  alignment?: 'left' | 'center' | 'right';
}

export interface GenerateBlocksHeadline {
  uniqueId: string;
  element: 'h1' | 'h2' | 'h3' | 'h4' | 'h5' | 'h6' | 'p' | 'div';
  content: string;
  textColor?: string;
  fontSize?: string;
  fontSizeTablet?: string;
  fontSizeMobile?: string;
  fontWeight?: string;
  textTransform?: 'none' | 'uppercase' | 'lowercase' | 'capitalize';
  letterSpacing?: string;
  lineHeight?: string;
  marginTop?: string;
  marginBottom?: string;
  alignment?: 'left' | 'center' | 'right';
  icon?: string;
  iconLocation?: 'before' | 'after';
}

export interface GenerateBlocksGrid {
  uniqueId: string;
  columns?: number;
  columnsTablet?: number;
  columnsMobile?: number;
  horizontalGap?: number;
  verticalGap?: number;
  alignItems?: 'flex-start' | 'center' | 'flex-end' | 'stretch';
  justifyContent?: 'flex-start' | 'center' | 'flex-end' | 'space-between' | 'space-around';
}

export interface GenerateBlocksExportResult {
  success: boolean;
  data: {
    blocks: GenerateBlock[];
    content: string; // WordPress block content format
    css: string; // Custom CSS
    settings: {
      globalColors: Array<{ name: string; slug: string; color: string }>;
      containerWidth: string;
      spacing: {
        top: string;
        right: string;
        bottom: string;
        left: string;
      };
    };
  };
  metadata: {
    totalBlocks: number;
    blockTypes: Record<string, number>;
    customCSS: boolean;
  };
}

export class GenerateBlocksService {
  private idCounter = 0;

  /**
   * Convert HTML to GenerateBlocks format
   */
  async convertToGenerateBlocks(
    html: string,
    css?: string,
    options?: {
      containerWidth?: string;
      generateCustomCSS?: boolean;
    }
  ): Promise<GenerateBlocksExportResult> {
    try {
      const $ = cheerio.load(html);
      const blocks: GenerateBlock[] = [];
      const globalColors = this.extractGlobalColors($, css);

      // Process body content
      $('body > *').each((_, element) => {
        const $element = $(element);
        const block = this.convertToBlock($, $element);
        if (block) {
          blocks.push(block);
        }
      });

      // Generate WordPress block content
      const content = this.generateBlockContent(blocks);

      // Generate custom CSS if needed
      let customCSS = '';
      if (options?.generateCustomCSS && css) {
        customCSS = this.generateCustomCSS($, css);
      }

      // Count block types
      const blockTypes: Record<string, number> = {};
      this.countBlockTypes(blocks, blockTypes);

      return {
        success: true,
        data: {
          blocks,
          content,
          css: customCSS,
          settings: {
            globalColors,
            containerWidth: options?.containerWidth || '1200px',
            spacing: {
              top: '40px',
              right: '40px',
              bottom: '40px',
              left: '40px',
            },
          },
        },
        metadata: {
          totalBlocks: blocks.length,
          blockTypes,
          customCSS: customCSS.length > 0,
        },
      };
    } catch (error) {
      console.error('GenerateBlocks conversion error:', error);
      throw new Error(`Failed to convert to GenerateBlocks: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Convert a single element to a GenerateBlock
   */
  private convertToBlock($: cheerio.CheerioAPI, $element: cheerio.Cheerio<any>): GenerateBlock | null {
    const tagName = $element.prop('tagName')?.toLowerCase();
    if (!tagName) return null;

    const blockType = this.detectBlockType($, $element, tagName);

    switch (blockType) {
      case 'generateblocks/container':
        return this.createContainerBlock($, $element);
      case 'generateblocks/button':
        return this.createButtonBlock($, $element);
      case 'generateblocks/headline':
        return this.createHeadlineBlock($, $element);
      case 'generateblocks/grid':
        return this.createGridBlock($, $element);
      default:
        return this.createContainerBlock($, $element);
    }
  }

  /**
   * Detect GenerateBlocks block type from HTML element
   */
  private detectBlockType($: cheerio.CheerioAPI, $element: cheerio.Cheerio<any>, tagName: string): string {
    const classes = $element.attr('class') || '';
    const text = $element.text().toLowerCase();

    // Button
    if (
      tagName === 'a' && (
        classes.includes('btn') ||
        classes.includes('button') ||
        $element.attr('role') === 'button'
      )
    ) {
      return 'generateblocks/button';
    }

    // Headline
    if (tagName.match(/^h[1-6]$/) || tagName === 'p') {
      return 'generateblocks/headline';
    }

    // Grid (multiple columns or grid display)
    if (
      classes.includes('grid') ||
      classes.includes('row') ||
      classes.includes('columns') ||
      $element.children().length > 2
    ) {
      return 'generateblocks/grid';
    }

    // Container (default)
    return 'generateblocks/container';
  }

  /**
   * Create Container block
   */
  private createContainerBlock($: cheerio.CheerioAPI, $element: cheerio.Cheerio<any>): GenerateBlock {
    const tagName = $element.prop('tagName')?.toLowerCase() || 'div';
    const styles = this.parseInlineStyles($element.attr('style') || '');
    const classes = $element.attr('class') || '';

    // Determine semantic element
    let element: GenerateBlocksContainer['element'] = 'div';
    if (['section', 'article', 'header', 'footer', 'aside'].includes(tagName)) {
      element = tagName as GenerateBlocksContainer['element'];
    }

    // Detect flex properties
    const display = styles.display || this.getComputedStyle($element, 'display');
    const isFlex = display === 'flex' || display === 'inline-flex';

    const attrs: GenerateBlocksContainer = {
      uniqueId: this.generateUniqueId(),
      element,
      className: classes,
      backgroundColor: styles.backgroundColor || styles.background,
      textColor: styles.color,
      paddingTop: styles.paddingTop || styles.padding,
      paddingRight: styles.paddingRight || styles.padding,
      paddingBottom: styles.paddingBottom || styles.padding,
      paddingLeft: styles.paddingLeft || styles.padding,
      marginTop: styles.marginTop || styles.margin,
      marginRight: styles.marginRight || styles.margin,
      marginBottom: styles.marginBottom || styles.margin,
      marginLeft: styles.marginLeft || styles.margin,
      borderRadius: styles.borderRadius,
      minHeight: styles.minHeight,
      maxWidth: styles.maxWidth,
      width: styles.width,
      anchor: $element.attr('id'),
    };

    if (isFlex) {
      attrs.flexDirection = styles.flexDirection as any || 'row';
      attrs.flexWrap = styles.flexWrap as any || 'wrap';
      attrs.alignItems = styles.alignItems as any;
      attrs.justifyContent = styles.justifyContent as any;
    }

    // Detect inner container
    if (classes.includes('container') || classes.includes('contained')) {
      attrs.innerContainer = 'contained';
    }

    // Process child blocks
    const innerBlocks: GenerateBlock[] = [];
    $element.children().each((_, child) => {
      const $child = $(child);
      const childBlock = this.convertToBlock($, $child);
      if (childBlock) {
        innerBlocks.push(childBlock);
      }
    });

    return {
      blockName: 'generateblocks/container',
      attrs,
      innerBlocks,
      innerHTML: $element.html() || '',
      innerContent: innerBlocks.length > 0 ? innerBlocks.map(() => null) : [$element.html() || ''],
    };
  }

  /**
   * Create Button block
   */
  private createButtonBlock($: cheerio.CheerioAPI, $element: cheerio.Cheerio<any>): GenerateBlock {
    const styles = this.parseInlineStyles($element.attr('style') || '');
    const text = $element.text().trim();

    const attrs: GenerateBlocksButton = {
      uniqueId: this.generateUniqueId(),
      text,
      url: $element.attr('href') || '#',
      target: $element.attr('target') as any || '_self',
      rel: $element.attr('rel'),
      backgroundColor: styles.backgroundColor || styles.background,
      textColor: styles.color,
      paddingTop: styles.paddingTop || styles.padding || '12px',
      paddingRight: styles.paddingRight || styles.padding || '24px',
      paddingBottom: styles.paddingBottom || styles.padding || '12px',
      paddingLeft: styles.paddingLeft || styles.padding || '24px',
      borderRadius: styles.borderRadius || '4px',
      fontSize: styles.fontSize,
      fontWeight: styles.fontWeight,
      letterSpacing: styles.letterSpacing,
      textTransform: styles.textTransform as any,
      width: styles.width,
    };

    // Detect alignment from parent or classes
    const classes = $element.attr('class') || '';
    if (classes.includes('center') || classes.includes('mx-auto')) {
      attrs.alignment = 'center';
    } else if (classes.includes('right') || classes.includes('ml-auto')) {
      attrs.alignment = 'right';
    }

    return {
      blockName: 'generateblocks/button',
      attrs,
      innerBlocks: [],
      innerHTML: text,
      innerContent: [text],
    };
  }

  /**
   * Create Headline block
   */
  private createHeadlineBlock($: cheerio.CheerioAPI, $element: cheerio.Cheerio<any>): GenerateBlock {
    const tagName = $element.prop('tagName')?.toLowerCase() || 'p';
    const styles = this.parseInlineStyles($element.attr('style') || '');
    const content = $element.html() || '';

    // Check for icon
    const $icon = $element.find('i, svg').first();
    let icon = '';
    let iconLocation: 'before' | 'after' | undefined;
    if ($icon.length > 0) {
      const iconClass = $icon.attr('class') || '';
      icon = iconClass;
      iconLocation = $icon.index() === 0 ? 'before' : 'after';
      $icon.remove(); // Remove from content
    }

    const attrs: GenerateBlocksHeadline = {
      uniqueId: this.generateUniqueId(),
      element: tagName as any,
      content: $element.html() || '',
      textColor: styles.color,
      fontSize: styles.fontSize,
      fontWeight: styles.fontWeight,
      textTransform: styles.textTransform as any,
      letterSpacing: styles.letterSpacing,
      lineHeight: styles.lineHeight,
      marginTop: styles.marginTop || styles.margin,
      marginBottom: styles.marginBottom || styles.margin,
      icon,
      iconLocation,
    };

    // Detect alignment
    const textAlign = styles.textAlign;
    if (textAlign === 'center' || textAlign === 'right') {
      attrs.alignment = textAlign;
    }

    return {
      blockName: 'generateblocks/headline',
      attrs,
      innerBlocks: [],
      innerHTML: content,
      innerContent: [content],
    };
  }

  /**
   * Create Grid block
   */
  private createGridBlock($: cheerio.CheerioAPI, $element: cheerio.Cheerio<any>): GenerateBlock {
    const styles = this.parseInlineStyles($element.attr('style') || '');
    const classes = $element.attr('class') || '';

    // Detect column count
    let columns = 2;
    if (classes.includes('col-3') || classes.includes('grid-cols-3')) {
      columns = 3;
    } else if (classes.includes('col-4') || classes.includes('grid-cols-4')) {
      columns = 4;
    } else if (classes.includes('col-2') || classes.includes('grid-cols-2')) {
      columns = 2;
    }

    const attrs: GenerateBlocksGrid = {
      uniqueId: this.generateUniqueId(),
      columns,
      columnsTablet: Math.min(columns, 2),
      columnsMobile: 1,
      horizontalGap: 20,
      verticalGap: 20,
      alignItems: styles.alignItems as any,
      justifyContent: styles.justifyContent as any,
    };

    // Process grid items
    const innerBlocks: GenerateBlock[] = [];
    $element.children().each((_, child) => {
      const $child = $(child);
      const childBlock = this.convertToBlock($, $child);
      if (childBlock) {
        innerBlocks.push(childBlock);
      }
    });

    return {
      blockName: 'generateblocks/grid',
      attrs,
      innerBlocks,
      innerHTML: '',
      innerContent: innerBlocks.map(() => null),
    };
  }

  /**
   * Generate WordPress block content format
   */
  private generateBlockContent(blocks: GenerateBlock[]): string {
    let content = '';
    for (const block of blocks) {
      content += this.blockToContent(block);
    }
    return content;
  }

  /**
   * Convert block to WordPress block comment format
   */
  private blockToContent(block: GenerateBlock, indent: string = ''): string {
    const attrsJSON = JSON.stringify(block.attrs);
    let content = `${indent}<!-- wp:${block.blockName} ${attrsJSON} -->\n`;

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
   * Extract global colors from HTML and CSS
   */
  private extractGlobalColors($: cheerio.CheerioAPI, css?: string): Array<{ name: string; slug: string; color: string }> {
    const colors = new Map<string, string>();

    // Extract from inline styles
    $('[style*="color"]').each((_, el) => {
      const style = $(el).attr('style') || '';
      const bgMatch = style.match(/background(?:-color)?:\s*([^;]+)/);
      const colorMatch = style.match(/(?:^|;)\s*color:\s*([^;]+)/);

      if (bgMatch) colors.set(bgMatch[1].trim(), bgMatch[1].trim());
      if (colorMatch) colors.set(colorMatch[1].trim(), colorMatch[1].trim());
    });

    // Extract from CSS
    if (css) {
      const colorMatches = css.matchAll(/(?:background-)?color:\s*([^;]+)/g);
      for (const match of colorMatches) {
        colors.set(match[1].trim(), match[1].trim());
      }
    }

    const globalColors: Array<{ name: string; slug: string; color: string }> = [];
    let index = 1;
    colors.forEach((color) => {
      globalColors.push({
        name: `Color ${index}`,
        slug: `color-${index}`,
        color,
      });
      index++;
    });

    return globalColors;
  }

  /**
   * Generate custom CSS for GenerateBlocks
   */
  private generateCustomCSS($: cheerio.CheerioAPI, css: string): string {
    // Extract only custom styles that aren't covered by block attributes
    let customCSS = '';

    // Add responsive utilities
    customCSS += `
/* GenerateBlocks Custom CSS */

/* Container utilities */
.gb-container {
  box-sizing: border-box;
}

/* Responsive breakpoints */
@media (max-width: 1024px) {
  .gb-grid-wrapper > .gb-grid-column {
    flex-basis: 50%;
  }
}

@media (max-width: 768px) {
  .gb-grid-wrapper > .gb-grid-column {
    flex-basis: 100%;
  }
}
`;

    return customCSS.trim();
  }

  /**
   * Count block types recursively
   */
  private countBlockTypes(blocks: GenerateBlock[], counts: Record<string, number>): void {
    for (const block of blocks) {
      counts[block.blockName] = (counts[block.blockName] || 0) + 1;
      if (block.innerBlocks.length > 0) {
        this.countBlockTypes(block.innerBlocks, counts);
      }
    }
  }

  /**
   * Parse inline styles string to object
   */
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

  /**
   * Get computed style (simplified - in real implementation would need more logic)
   */
  private getComputedStyle($element: cheerio.Cheerio<any>, property: string): string | undefined {
    const classes = $element.attr('class') || '';

    // Simple heuristics for flex detection
    if (property === 'display') {
      if (classes.includes('flex') || classes.includes('d-flex')) {
        return 'flex';
      }
      if (classes.includes('grid') || classes.includes('d-grid')) {
        return 'grid';
      }
    }

    return undefined;
  }

  /**
   * Generate unique ID for blocks
   */
  private generateUniqueId(): string {
    this.idCounter++;
    return `gb-${Date.now()}-${this.idCounter}`;
  }
}

export default GenerateBlocksService;
