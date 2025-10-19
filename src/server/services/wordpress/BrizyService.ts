import * as cheerio from 'cheerio';

export interface BrizyComponent {
  type: string;
  value: Record<string, any>;
  _id: string;
}

export interface BrizySection {
  type: 'Section';
  value: {
    _id: string;
    items: BrizyComponent[];
    _styles: string[];
  };
}

export interface BrizyPage {
  data: {
    items: BrizySection[];
  };
  dataVersion: number;
  compiled: string;
  settings: BrizySettings;
}

export interface BrizySettings {
  title: string;
  description: string;
  customCSS: string;
  customJS: string;
  fonts: BrizyFont[];
  colors: BrizyColor[];
}

export interface BrizyFont {
  id: string;
  type: 'google' | 'upload' | 'system';
  family: string;
  weights: number[];
}

export interface BrizyColor {
  id: string;
  hex: string;
  title: string;
}

export interface BrizyExportResult {
  page: BrizyPage;
  json: string;
  html: string;
  css: string;
  js: string;
  cloudData: {
    blocks: any[];
    globalBlocks: any[];
    savedBlocks: any[];
  };
}

/**
 * Brizy Builder Export Service
 * Converts HTML to Brizy visual builder format
 */
export class BrizyService {
  private brizyVersion: number = 2;
  private idCounter: number = 0;

  /**
   * Convert HTML to Brizy format
   */
  async convertToBrizy(html: string, css?: string, js?: string): Promise<BrizyExportResult> {
    const $ = cheerio.load(html);

    // Extract sections
    const sections = this.extractSections($);

    // Build page structure
    const page: BrizyPage = {
      data: {
        items: sections,
      },
      dataVersion: this.brizyVersion,
      compiled: html,
      settings: this.extractSettings($, css, js),
    };

    // Generate exports
    const json = JSON.stringify(page, null, 2);
    const htmlOutput = this.generateHTML(page);
    const cssOutput = css || '';
    const jsOutput = js || '';

    return {
      page,
      json,
      html: htmlOutput,
      css: cssOutput,
      js: jsOutput,
      cloudData: {
        blocks: this.extractSavedBlocks(sections),
        globalBlocks: this.extractGlobalBlocks(sections),
        savedBlocks: [],
      },
    };
  }

  /**
   * Extract sections from HTML
   */
  private extractSections($: cheerio.CheerioAPI): BrizySection[] {
    const sections: BrizySection[] = [];

    // Try to find semantic sections
    const $sections = $('section, [class*="section"], .container-fluid, main').length > 0
      ? $('section, [class*="section"], .container-fluid, main')
      : $('body > *');

    $sections.each((_, section) => {
      const $section = $(section);
      const brizySection = this.convertToBrizySection($, $section);
      if (brizySection) {
        sections.push(brizySection);
      }
    });

    return sections;
  }

  /**
   * Convert HTML element to Brizy section
   */
  private convertToBrizySection(
    $: cheerio.CheerioAPI,
    $section: cheerio.Cheerio<any>
  ): BrizySection {
    const items: BrizyComponent[] = [];

    // Create container row
    const row = this.createRow($, $section);
    if (row) {
      items.push(row);
    }

    return {
      type: 'Section',
      value: {
        _id: this.generateID(),
        items,
        _styles: this.extractStyles($section),
      },
    };
  }

  /**
   * Create Brizy row component
   */
  private createRow($: cheerio.CheerioAPI, $element: cheerio.Cheerio<any>): BrizyComponent {
    const columns = this.extractColumns($, $element);

    return {
      type: 'Row',
      value: {
        _id: this.generateID(),
        items: columns,
      },
      _id: this.generateID(),
    };
  }

  /**
   * Extract columns from element
   */
  private extractColumns($: cheerio.CheerioAPI, $element: cheerio.Cheerio<any>): BrizyComponent[] {
    const columns: BrizyComponent[] = [];

    // Check for explicit column elements
    const $cols = $element.find('[class*="col-"], [class*="column"]').length > 0
      ? $element.find('[class*="col-"], [class*="column"]')
      : $element.children();

    if ($cols.length === 0) {
      // Single column with all content
      columns.push(this.createColumn($, $element, 100));
    } else {
      const width = Math.floor(100 / $cols.length);
      $cols.each((_, col) => {
        columns.push(this.createColumn($, $(col), width));
      });
    }

    return columns;
  }

  /**
   * Create Brizy column component
   */
  private createColumn(
    $: cheerio.CheerioAPI,
    $element: cheerio.Cheerio<any>,
    width: number
  ): BrizyComponent {
    const items = this.extractColumnItems($, $element);

    return {
      type: 'Column',
      value: {
        _id: this.generateID(),
        width,
        items,
        paddingType: 'ungrouped',
        padding: 15,
        _styles: this.extractStyles($element),
      },
      _id: this.generateID(),
    };
  }

  /**
   * Extract items within a column
   */
  private extractColumnItems($: cheerio.CheerioAPI, $element: cheerio.Cheerio<any>): BrizyComponent[] {
    const items: BrizyComponent[] = [];

    $element.children().each((_, child) => {
      const $child = $(child);
      const component = this.convertToComponent($, $child);
      if (component) {
        items.push(component);
      }
    });

    return items;
  }

  /**
   * Convert HTML element to Brizy component
   */
  private convertToComponent(
    $: cheerio.CheerioAPI,
    $element: cheerio.Cheerio<any>
  ): BrizyComponent | null {
    const tagName = $element.prop('tagName')?.toLowerCase();
    if (!tagName) return null;

    const type = this.detectBrizyComponentType($, $element, tagName);

    switch (type) {
      case 'RichText':
        return this.createRichText($, $element);
      case 'Button':
        return this.createButton($, $element);
      case 'Image':
        return this.createImage($, $element);
      case 'Video':
        return this.createVideo($, $element);
      case 'Icon':
        return this.createIcon($, $element);
      case 'Spacer':
        return this.createSpacer($, $element);
      case 'Map':
        return this.createMap($, $element);
      case 'Form2':
        return this.createForm($, $element);
      case 'IconText':
        return this.createIconText($, $element);
      case 'Counter':
        return this.createCounter($, $element);
      case 'Countdown2':
        return this.createCountdown($, $element);
      case 'ProgressBar':
        return this.createProgressBar($, $element);
      case 'Tabs':
        return this.createTabs($, $element);
      case 'Accordion':
        return this.createAccordion($, $element);
      default:
        return this.createWrapper($, $element);
    }
  }

  /**
   * Detect Brizy component type
   */
  private detectBrizyComponentType(
    $: cheerio.CheerioAPI,
    $element: cheerio.Cheerio<any>,
    tagName: string
  ): string {
    const classes = $element.attr('class') || '';

    // Text elements
    if (tagName.match(/^(h[1-6]|p|span)$/)) return 'RichText';

    // Button
    if (tagName === 'a' && (classes.includes('btn') || classes.includes('button'))) {
      return 'Button';
    }

    // Image
    if (tagName === 'img' || (tagName === 'figure' && $element.find('img').length > 0)) {
      return 'Image';
    }

    // Video
    if (tagName === 'video' || (tagName === 'iframe' && $element.attr('src')?.includes('youtube'))) {
      return 'Video';
    }

    // Icon
    if ((tagName === 'i' || tagName === 'svg') && classes.includes('icon')) {
      return 'Icon';
    }

    // Spacer/Divider
    if (tagName === 'hr' || classes.includes('spacer')) {
      return 'Spacer';
    }

    // Map
    if (classes.includes('map') || $element.find('iframe[src*="google.com/maps"]').length > 0) {
      return 'Map';
    }

    // Form
    if (tagName === 'form') {
      return 'Form2';
    }

    // Icon with text
    if (classes.includes('feature') && $element.find('i, svg').length > 0) {
      return 'IconText';
    }

    // Counter
    if (classes.includes('counter') || classes.includes('number')) {
      return 'Counter';
    }

    // Countdown
    if (classes.includes('countdown') || classes.includes('timer')) {
      return 'Countdown2';
    }

    // Progress bar
    if (classes.includes('progress') || classes.includes('skill')) {
      return 'ProgressBar';
    }

    // Tabs
    if (classes.includes('tabs') || $element.find('[role="tab"]').length > 0) {
      return 'Tabs';
    }

    // Accordion
    if (classes.includes('accordion') || classes.includes('collapse')) {
      return 'Accordion';
    }

    return 'Wrapper';
  }

  /**
   * Create RichText component
   */
  private createRichText($: cheerio.CheerioAPI, $element: cheerio.Cheerio<any>): BrizyComponent {
    const tagName = $element.prop('tagName')?.toLowerCase() || 'p';
    const text = $.html($element);

    return {
      type: 'RichText',
      value: {
        _id: this.generateID(),
        text,
        _styles: this.extractStyles($element),
      },
      _id: this.generateID(),
    };
  }

  /**
   * Create Button component
   */
  private createButton($: cheerio.CheerioAPI, $element: cheerio.Cheerio<any>): BrizyComponent {
    return {
      type: 'Button',
      value: {
        _id: this.generateID(),
        text: $element.text(),
        linkType: 'external',
        linkExternal: $element.attr('href') || '#',
        linkExternalBlank: $element.attr('target') === '_blank' ? 'on' : 'off',
        _styles: this.extractStyles($element),
      },
      _id: this.generateID(),
    };
  }

  /**
   * Create Image component
   */
  private createImage($: cheerio.CheerioAPI, $element: cheerio.Cheerio<any>): BrizyComponent {
    const $img = $element.is('img') ? $element : $element.find('img').first();

    return {
      type: 'Image',
      value: {
        _id: this.generateID(),
        imageSrc: $img.attr('src') || '',
        imageAlt: $img.attr('alt') || '',
        imageWidth: parseInt($img.attr('width') || '100'),
        imageHeight: parseInt($img.attr('height') || 'auto'),
        _styles: this.extractStyles($element),
      },
      _id: this.generateID(),
    };
  }

  /**
   * Create Video component
   */
  private createVideo($: cheerio.CheerioAPI, $element: cheerio.Cheerio<any>): BrizyComponent {
    const src = $element.attr('src') || $element.find('source').attr('src') || '';
    const isYouTube = src.includes('youtube');

    return {
      type: 'Video',
      value: {
        _id: this.generateID(),
        video: {
          type: isYouTube ? 'youtube' : 'url',
          url: src,
        },
        coverImageSrc: '',
        _styles: this.extractStyles($element),
      },
      _id: this.generateID(),
    };
  }

  /**
   * Create Icon component
   */
  private createIcon($: cheerio.CheerioAPI, $element: cheerio.Cheerio<any>): BrizyComponent {
    const classes = $element.attr('class') || '';
    const iconMatch = classes.match(/fa-([a-z-]+)/);
    const iconName = iconMatch ? iconMatch[1] : 'star';

    return {
      type: 'Icon',
      value: {
        _id: this.generateID(),
        name: iconName,
        type: 'glyph',
        _styles: this.extractStyles($element),
      },
      _id: this.generateID(),
    };
  }

  /**
   * Create Spacer component
   */
  private createSpacer($: cheerio.CheerioAPI, $element: cheerio.Cheerio<any>): BrizyComponent {
    const styles = this.parseInlineStyles($element.attr('style') || '');
    const height = parseInt(styles.height || '20');

    return {
      type: 'Spacer',
      value: {
        _id: this.generateID(),
        height,
        _styles: this.extractStyles($element),
      },
      _id: this.generateID(),
    };
  }

  /**
   * Create Map component
   */
  private createMap($: cheerio.CheerioAPI, $element: cheerio.Cheerio<any>): BrizyComponent {
    return {
      type: 'Map',
      value: {
        _id: this.generateID(),
        address: 'New York, NY, USA',
        zoom: 12,
        _styles: this.extractStyles($element),
      },
      _id: this.generateID(),
    };
  }

  /**
   * Create Form component
   */
  private createForm($: cheerio.CheerioAPI, $element: cheerio.Cheerio<any>): BrizyComponent {
    const fields: any[] = [];

    $element.find('input, textarea, select').each((i, field) => {
      const $field = $(field);
      const type = $field.attr('type') || 'text';
      const label = $field.attr('placeholder') || $field.attr('name') || `Field ${i + 1}`;

      fields.push({
        type,
        label,
        required: $field.attr('required') !== undefined,
        width: 100,
      });
    });

    return {
      type: 'Form2',
      value: {
        _id: this.generateID(),
        fields,
        submitText: $element.find('[type="submit"]').val() || 'Submit',
        _styles: this.extractStyles($element),
      },
      _id: this.generateID(),
    };
  }

  /**
   * Create IconText component
   */
  private createIconText($: cheerio.CheerioAPI, $element: cheerio.Cheerio<any>): BrizyComponent {
    return {
      type: 'IconText',
      value: {
        _id: this.generateID(),
        items: [
          this.createIcon($, $element.find('i, svg').first()),
          this.createRichText($, $element.find('h1, h2, h3, h4, p').first()),
        ],
        _styles: this.extractStyles($element),
      },
      _id: this.generateID(),
    };
  }

  /**
   * Create Counter component
   */
  private createCounter($: cheerio.CheerioAPI, $element: cheerio.Cheerio<any>): BrizyComponent {
    const text = $element.text();
    const numberMatch = text.match(/\d+/);
    const end = numberMatch ? parseInt(numberMatch[0]) : 100;

    return {
      type: 'Counter',
      value: {
        _id: this.generateID(),
        end,
        duration: 1,
        _styles: this.extractStyles($element),
      },
      _id: this.generateID(),
    };
  }

  /**
   * Create Countdown component
   */
  private createCountdown($: cheerio.CheerioAPI, $element: cheerio.Cheerio<any>): BrizyComponent {
    return {
      type: 'Countdown2',
      value: {
        _id: this.generateID(),
        date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        _styles: this.extractStyles($element),
      },
      _id: this.generateID(),
    };
  }

  /**
   * Create ProgressBar component
   */
  private createProgressBar($: cheerio.CheerioAPI, $element: cheerio.Cheerio<any>): BrizyComponent {
    const progressBar = $element.find('[class*="progress-bar"]').first();
    const percentage = parseInt(progressBar.attr('style')?.match(/width:\s*(\d+)%/)?.[1] || '50');

    return {
      type: 'ProgressBar',
      value: {
        _id: this.generateID(),
        percentage,
        showPercentage: true,
        _styles: this.extractStyles($element),
      },
      _id: this.generateID(),
    };
  }

  /**
   * Create Tabs component
   */
  private createTabs($: cheerio.CheerioAPI, $element: cheerio.Cheerio<any>): BrizyComponent {
    const tabs: any[] = [];

    $element.find('[role="tab"], .tab-title').each((i, tab) => {
      tabs.push({
        labelText: $(tab).text(),
        items: [],
      });
    });

    return {
      type: 'Tabs',
      value: {
        _id: this.generateID(),
        items: tabs,
        _styles: this.extractStyles($element),
      },
      _id: this.generateID(),
    };
  }

  /**
   * Create Accordion component
   */
  private createAccordion($: cheerio.CheerioAPI, $element: cheerio.Cheerio<any>): BrizyComponent {
    const items: any[] = [];

    $element.find('.accordion-item, .panel').each((i, item) => {
      const $item = $(item);
      items.push({
        labelText: $item.find('.accordion-title, .panel-title, h3, h4').first().text(),
        items: [],
      });
    });

    return {
      type: 'Accordion',
      value: {
        _id: this.generateID(),
        items,
        _styles: this.extractStyles($element),
      },
      _id: this.generateID(),
    };
  }

  /**
   * Create Wrapper component
   */
  private createWrapper($: cheerio.CheerioAPI, $element: cheerio.Cheerio<any>): BrizyComponent {
    const items: BrizyComponent[] = [];

    $element.children().each((_, child) => {
      const component = this.convertToComponent($, $(child));
      if (component) {
        items.push(component);
      }
    });

    return {
      type: 'Wrapper',
      value: {
        _id: this.generateID(),
        items,
        _styles: this.extractStyles($element),
      },
      _id: this.generateID(),
    };
  }

  /**
   * Extract styles from element
   */
  private extractStyles($element: cheerio.Cheerio<any>): string[] {
    const styles: string[] = [];
    const inlineStyle = $element.attr('style') || '';
    const classes = $element.attr('class') || '';

    if (inlineStyle) {
      styles.push(`inline:${inlineStyle}`);
    }

    if (classes) {
      styles.push(`classes:${classes}`);
    }

    return styles;
  }

  /**
   * Extract settings
   */
  private extractSettings(
    $: cheerio.CheerioAPI,
    css?: string,
    js?: string
  ): BrizySettings {
    return {
      title: $('title').text() || '',
      description: $('meta[name="description"]').attr('content') || '',
      customCSS: css || '',
      customJS: js || '',
      fonts: this.extractFonts($),
      colors: this.extractColors($),
    };
  }

  /**
   * Extract fonts
   */
  private extractFonts($: cheerio.CheerioAPI): BrizyFont[] {
    const fonts: BrizyFont[] = [];
    const fontFamilies = new Set<string>();

    $('[style*="font-family"]').each((_, el) => {
      const style = $(el).attr('style') || '';
      const fontMatch = style.match(/font-family:\s*([^;]+)/);
      if (fontMatch) {
        fontFamilies.add(fontMatch[1].replace(/['"]/g, ''));
      }
    });

    fontFamilies.forEach((family) => {
      fonts.push({
        id: this.generateID(),
        type: 'google',
        family,
        weights: [400, 700],
      });
    });

    return fonts;
  }

  /**
   * Extract colors
   */
  private extractColors($: cheerio.CheerioAPI): BrizyColor[] {
    const colors: BrizyColor[] = [];
    const colorSet = new Set<string>();

    $('[style*="color"], [style*="background"]').each((_, el) => {
      const style = $(el).attr('style') || '';
      const colorMatches = style.match(/#[0-9A-Fa-f]{6}/g);
      if (colorMatches) {
        colorMatches.forEach((color) => colorSet.add(color));
      }
    });

    Array.from(colorSet).forEach((hex, i) => {
      colors.push({
        id: this.generateID(),
        hex,
        title: `Color ${i + 1}`,
      });
    });

    return colors;
  }

  /**
   * Extract saved blocks
   */
  private extractSavedBlocks(sections: BrizySection[]): any[] {
    // Can be implemented to detect reusable block patterns
    return [];
  }

  /**
   * Extract global blocks
   */
  private extractGlobalBlocks(sections: BrizySection[]): any[] {
    // Can be implemented to detect header/footer patterns
    return [];
  }

  /**
   * Generate HTML output
   */
  private generateHTML(page: BrizyPage): string {
    return page.compiled;
  }

  // Helper methods

  private generateID(): string {
    this.idCounter++;
    return `brizy_${Date.now()}_${this.idCounter}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private parseInlineStyles(styleString: string): Record<string, string> {
    const styles: Record<string, string> = {};
    if (!styleString) return styles;

    styleString.split(';').forEach((style) => {
      const [key, value] = style.split(':').map((s) => s.trim());
      if (key && value) {
        styles[key] = value;
      }
    });

    return styles;
  }
}
