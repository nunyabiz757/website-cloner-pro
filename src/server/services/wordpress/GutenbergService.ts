import * as cheerio from 'cheerio';
import type { ClonedWebsite } from '../../../shared/types/index.js';

interface GutenbergBlock {
  blockName: string;
  attrs: any;
  innerBlocks?: GutenbergBlock[];
  innerHTML: string;
}

export class GutenbergService {
  /**
   * Convert cloned website to Gutenberg blocks
   */
  convertToGutenberg(website: ClonedWebsite): string {
    const $ = cheerio.load(website.html);
    const blocks: GutenbergBlock[] = [];

    // Parse body content
    const $body = $('body');

    $body.children().each((index, element) => {
      const block = this.parseElement($, element);
      if (block) {
        blocks.push(block);
      }
    });

    // Convert blocks to Gutenberg format
    return this.blocksToHTML(blocks);
  }

  /**
   * Parse HTML element to Gutenberg block
   */
  private parseElement($: cheerio.CheerioAPI, element: cheerio.Element): GutenbergBlock | null {
    const $element = $(element);
    const tagName = element.tagName?.toLowerCase();

    // Skip script and style tags
    if (['script', 'style', 'noscript'].includes(tagName)) {
      return null;
    }

    switch (tagName) {
      case 'h1':
      case 'h2':
      case 'h3':
      case 'h4':
      case 'h5':
      case 'h6':
        return this.createHeadingBlock($element);

      case 'p':
        return this.createParagraphBlock($element);

      case 'img':
        return this.createImageBlock($element);

      case 'ul':
      case 'ol':
        return this.createListBlock($, $element);

      case 'blockquote':
        return this.createQuoteBlock($element);

      case 'pre':
      case 'code':
        return this.createCodeBlock($element);

      case 'video':
        return this.createVideoBlock($element);

      case 'iframe':
        return this.createEmbedBlock($element);

      case 'section':
      case 'div':
        if ($element.children().length > 0) {
          return this.createGroupBlock($, $element);
        }
        return this.createHTMLBlock($element);

      case 'table':
        return this.createTableBlock($, $element);

      case 'a':
        if ($element.find('img').length > 0) {
          return this.createImageBlock($element.find('img'));
        }
        return this.createButtonBlock($element);

      case 'button':
        return this.createButtonBlock($element);

      case 'hr':
        return this.createSeparatorBlock();

      default:
        // If it has children, try to parse them
        if ($element.children().length > 0) {
          return this.createGroupBlock($, $element);
        }

        // If it has text, create paragraph
        if ($element.text().trim()) {
          return this.createParagraphBlock($element);
        }

        return null;
    }
  }

  /**
   * Create heading block
   */
  private createHeadingBlock($element: cheerio.Cheerio<cheerio.Element>): GutenbergBlock {
    const level = parseInt($element.prop('tagName').slice(1)) || 2;
    const content = $element.html() || '';
    const textAlign = this.getTextAlign($element);

    return {
      blockName: 'core/heading',
      attrs: {
        level,
        textAlign: textAlign !== 'left' ? textAlign : undefined,
      },
      innerHTML: content,
    };
  }

  /**
   * Create paragraph block
   */
  private createParagraphBlock($element: cheerio.Cheerio<cheerio.Element>): GutenbergBlock {
    const content = $element.html() || '';
    const textAlign = this.getTextAlign($element);

    return {
      blockName: 'core/paragraph',
      attrs: {
        textAlign: textAlign !== 'left' ? textAlign : undefined,
      },
      innerHTML: content,
    };
  }

  /**
   * Create image block
   */
  private createImageBlock($element: cheerio.Cheerio<cheerio.Element>): GutenbergBlock {
    const src = $element.attr('src') || '';
    const alt = $element.attr('alt') || '';
    const width = $element.attr('width');
    const height = $element.attr('height');

    return {
      blockName: 'core/image',
      attrs: {
        url: src,
        alt,
        width: width ? parseInt(width) : undefined,
        height: height ? parseInt(height) : undefined,
      },
      innerHTML: `<img src="${src}" alt="${alt}" ${width ? `width="${width}"` : ''} ${height ? `height="${height}"` : ''} />`,
    };
  }

  /**
   * Create list block
   */
  private createListBlock($: cheerio.CheerioAPI, $element: cheerio.Cheerio<cheerio.Element>): GutenbergBlock {
    const isOrdered = $element.prop('tagName')?.toLowerCase() === 'ol';
    const items: string[] = [];

    $element.find('li').each((index, li) => {
      items.push($(li).html() || '');
    });

    const innerHTML = items.map((item) => `<li>${item}</li>`).join('');

    return {
      blockName: 'core/list',
      attrs: {
        ordered: isOrdered,
      },
      innerHTML: `<${isOrdered ? 'ol' : 'ul'}>${innerHTML}</${isOrdered ? 'ol' : 'ul'}>`,
    };
  }

  /**
   * Create quote block
   */
  private createQuoteBlock($element: cheerio.Cheerio<cheerio.Element>): GutenbergBlock {
    const content = $element.html() || '';

    return {
      blockName: 'core/quote',
      attrs: {},
      innerHTML: `<blockquote><p>${content}</p></blockquote>`,
    };
  }

  /**
   * Create code block
   */
  private createCodeBlock($element: cheerio.Cheerio<cheerio.Element>): GutenbergBlock {
    const content = $element.text() || '';

    return {
      blockName: 'core/code',
      attrs: {},
      innerHTML: `<code>${content}</code>`,
    };
  }

  /**
   * Create video block
   */
  private createVideoBlock($element: cheerio.Cheerio<cheerio.Element>): GutenbergBlock {
    const src = $element.attr('src') || '';

    return {
      blockName: 'core/video',
      attrs: {
        src,
      },
      innerHTML: `<video src="${src}" controls></video>`,
    };
  }

  /**
   * Create embed block (for iframes)
   */
  private createEmbedBlock($element: cheerio.Cheerio<cheerio.Element>): GutenbergBlock {
    const src = $element.attr('src') || '';

    // Detect embed type
    if (src.includes('youtube.com') || src.includes('youtu.be')) {
      return {
        blockName: 'core/embed',
        attrs: {
          providerNameSlug: 'youtube',
          url: src,
          type: 'video',
        },
        innerHTML: `<figure class="wp-block-embed is-type-video is-provider-youtube"><div class="wp-block-embed__wrapper">${src}</div></figure>`,
      };
    }

    if (src.includes('vimeo.com')) {
      return {
        blockName: 'core/embed',
        attrs: {
          providerNameSlug: 'vimeo',
          url: src,
          type: 'video',
        },
        innerHTML: `<figure class="wp-block-embed is-type-video is-provider-vimeo"><div class="wp-block-embed__wrapper">${src}</div></figure>`,
      };
    }

    // Default HTML block for unknown iframes
    return this.createHTMLBlock($element);
  }

  /**
   * Create button block
   */
  private createButtonBlock($element: cheerio.Cheerio<cheerio.Element>): GutenbergBlock {
    const text = $element.text() || 'Click here';
    const url = $element.attr('href') || '#';

    return {
      blockName: 'core/button',
      attrs: {},
      innerHTML: `<div class="wp-block-button"><a class="wp-block-button__link" href="${url}">${text}</a></div>`,
    };
  }

  /**
   * Create group block (container)
   */
  private createGroupBlock($: cheerio.CheerioAPI, $element: cheerio.Cheerio<cheerio.Element>): GutenbergBlock {
    const innerBlocks: GutenbergBlock[] = [];

    $element.children().each((index, child) => {
      const block = this.parseElement($, child);
      if (block) {
        innerBlocks.push(block);
      }
    });

    return {
      blockName: 'core/group',
      attrs: {},
      innerBlocks,
      innerHTML: '',
    };
  }

  /**
   * Create columns block
   */
  private createColumnsBlock($: cheerio.CheerioAPI, $element: cheerio.Cheerio<cheerio.Element>): GutenbergBlock {
    const columns: GutenbergBlock[] = [];

    $element.children().each((index, child) => {
      const columnBlocks: GutenbergBlock[] = [];

      $(child)
        .children()
        .each((i, el) => {
          const block = this.parseElement($, el);
          if (block) {
            columnBlocks.push(block);
          }
        });

      columns.push({
        blockName: 'core/column',
        attrs: {},
        innerBlocks: columnBlocks,
        innerHTML: '',
      });
    });

    return {
      blockName: 'core/columns',
      attrs: {},
      innerBlocks: columns,
      innerHTML: '',
    };
  }

  /**
   * Create table block
   */
  private createTableBlock($: cheerio.CheerioAPI, $element: cheerio.Cheerio<cheerio.Element>): GutenbergBlock {
    const $table = $element;
    const hasHeader = $table.find('thead').length > 0;
    const html = $.html($table);

    return {
      blockName: 'core/table',
      attrs: {
        hasFixedLayout: false,
        head: hasHeader ? [] : undefined,
      },
      innerHTML: html,
    };
  }

  /**
   * Create separator block
   */
  private createSeparatorBlock(): GutenbergBlock {
    return {
      blockName: 'core/separator',
      attrs: {},
      innerHTML: '<hr class="wp-block-separator"/>',
    };
  }

  /**
   * Create HTML block for complex/custom content
   */
  private createHTMLBlock($element: cheerio.Cheerio<cheerio.Element>): GutenbergBlock {
    const html = cheerio.load($element).html() || '';

    return {
      blockName: 'core/html',
      attrs: {},
      innerHTML: html,
    };
  }

  /**
   * Get text alignment from element
   */
  private getTextAlign($element: cheerio.Cheerio<cheerio.Element>): string {
    const style = $element.attr('style') || '';
    const classes = $element.attr('class') || '';

    // Check inline style
    const match = style.match(/text-align:\s*([^;]+)/);
    if (match) {
      return match[1].trim();
    }

    // Check classes
    if (classes.includes('text-center')) return 'center';
    if (classes.includes('text-right')) return 'right';
    if (classes.includes('text-justify')) return 'justify';

    return 'left';
  }

  /**
   * Convert blocks array to Gutenberg HTML format
   */
  private blocksToHTML(blocks: GutenbergBlock[]): string {
    return blocks.map((block) => this.blockToHTML(block)).join('\n\n');
  }

  /**
   * Convert single block to Gutenberg HTML format
   */
  private blockToHTML(block: GutenbergBlock): string {
    const attrs = Object.keys(block.attrs).length > 0 ? ` ${JSON.stringify(block.attrs)}` : '';

    if (block.innerBlocks && block.innerBlocks.length > 0) {
      const innerContent = block.innerBlocks.map((b) => this.blockToHTML(b)).join('\n');

      return `<!-- wp:${block.blockName}${attrs} -->
<div class="wp-block-${block.blockName.replace('/', '-')}">
${innerContent}
</div>
<!-- /wp:${block.blockName} -->`;
    }

    return `<!-- wp:${block.blockName}${attrs} -->
${block.innerHTML}
<!-- /wp:${block.blockName} -->`;
  }

  /**
   * Generate Gutenberg export package
   */
  generateExportPackage(gutenbergHTML: string, website: ClonedWebsite): any {
    return {
      title: website.metadata?.title || 'Imported Website',
      content: gutenbergHTML,
      status: 'publish',
      type: 'page',
      meta: {
        _wp_page_template: 'default',
      },
    };
  }
}
