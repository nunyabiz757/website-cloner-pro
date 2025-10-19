import * as cheerio from 'cheerio';

export interface OptimizePressElement {
  type: string;
  id: string;
  config: Record<string, any>;
  children?: OptimizePressElement[];
  content?: string;
}

export interface OptimizePressPage {
  pageType: 'landing' | 'sales' | 'webinar' | 'membership' | 'thank-you';
  template: string;
  elements: OptimizePressElement[];
  sections: OptimizePressSection[];
  settings: OptimizePressSettings;
}

export interface OptimizePressSection {
  id: string;
  type: 'hero' | 'features' | 'testimonials' | 'pricing' | 'cta' | 'footer' | 'content';
  background: {
    type: 'color' | 'image' | 'video' | 'gradient';
    value: string;
  };
  elements: OptimizePressElement[];
  padding: { top: number; bottom: number; left: number; right: number };
}

export interface OptimizePressSettings {
  seo: {
    title: string;
    description: string;
    keywords: string;
  };
  integrations: {
    email?: string;
    analytics?: string;
    facebook?: string;
  };
  typography: {
    headingFont: string;
    bodyFont: string;
  };
  colors: {
    primary: string;
    secondary: string;
    accent: string;
  };
}

export interface OptimizePressExportResult {
  page: OptimizePressPage;
  json: string;
  shortcodes: string;
  phpTemplate: string;
  customCSS: string;
  customJS: string;
}

/**
 * OptimizePress Export Service
 * Converts HTML to OptimizePress page format with marketing focus
 */
export class OptimizePressService {
  private optimizePressVersion: string = '3.7';

  /**
   * Convert HTML to OptimizePress format
   */
  async convertToOptimizePress(
    html: string,
    css?: string,
    js?: string
  ): Promise<OptimizePressExportResult> {
    const $ = cheerio.load(html);

    // Detect page type
    const pageType = this.detectPageType($);

    // Extract sections
    const sections = this.extractSections($);

    // Extract elements
    const elements = this.extractElements($);

    // Extract settings
    const settings = this.extractSettings($);

    const page: OptimizePressPage = {
      pageType,
      template: this.selectTemplate(pageType),
      elements,
      sections,
      settings,
    };

    // Generate various export formats
    const json = JSON.stringify(page, null, 2);
    const shortcodes = this.generateShortcodes(page);
    const phpTemplate = this.generatePHPTemplate(page);
    const customCSS = css || '';
    const customJS = js || '';

    return {
      page,
      json,
      shortcodes,
      phpTemplate,
      customCSS,
      customJS,
    };
  }

  /**
   * Detect OptimizePress page type
   */
  private detectPageType($: cheerio.CheerioAPI): OptimizePressPage['pageType'] {
    const bodyClasses = $('body').attr('class') || '';
    const content = $('body').text().toLowerCase();

    // Check for specific page indicators
    if (
      content.includes('register') ||
      content.includes('webinar') ||
      content.includes('join now')
    ) {
      return 'webinar';
    }

    if (
      content.includes('thank you') ||
      content.includes('success') ||
      content.includes('confirmation')
    ) {
      return 'thank-you';
    }

    if (
      $('form').length > 0 &&
      ($('[type="email"]').length > 0 || $('[type="submit"]').length > 0)
    ) {
      return 'landing';
    }

    if (
      $('[class*="price"], [class*="pricing"]').length > 2 ||
      content.includes('buy now') ||
      content.includes('order now')
    ) {
      return 'sales';
    }

    if (
      content.includes('login') ||
      content.includes('member') ||
      bodyClasses.includes('membership')
    ) {
      return 'membership';
    }

    return 'landing';
  }

  /**
   * Extract sections from HTML
   */
  private extractSections($: cheerio.CheerioAPI): OptimizePressSection[] {
    const sections: OptimizePressSection[] = [];

    $('section, .section, [class*="section"]').each((_, section) => {
      const $section = $(section);
      const sectionType = this.detectSectionType($, $section);

      sections.push({
        id: this.generateID('section'),
        type: sectionType,
        background: this.extractBackground($, $section),
        elements: this.extractSectionElements($, $section),
        padding: this.extractPadding($section),
      });
    });

    // If no sections found, create from body children
    if (sections.length === 0) {
      $('body').children().each((i, el) => {
        const $el = $(el);
        sections.push({
          id: this.generateID('section'),
          type: i === 0 ? 'hero' : 'content',
          background: this.extractBackground($, $el),
          elements: this.extractSectionElements($, $el),
          padding: this.extractPadding($el),
        });
      });
    }

    return sections;
  }

  /**
   * Detect section type
   */
  private detectSectionType(
    $: cheerio.CheerioAPI,
    $section: cheerio.Cheerio<any>
  ): OptimizePressSection['type'] {
    const classes = $section.attr('class') || '';
    const id = $section.attr('id') || '';
    const text = $section.text().toLowerCase();

    if (classes.includes('hero') || id.includes('hero') || $section.find('h1').length > 0) {
      return 'hero';
    }

    if (
      classes.includes('feature') ||
      id.includes('feature') ||
      $section.find('[class*="feature"]').length > 2
    ) {
      return 'features';
    }

    if (
      classes.includes('testimonial') ||
      classes.includes('review') ||
      $section.find('[class*="testimonial"]').length > 0
    ) {
      return 'testimonials';
    }

    if (
      classes.includes('pricing') ||
      classes.includes('price') ||
      $section.find('[class*="price"]').length > 1
    ) {
      return 'pricing';
    }

    if (
      classes.includes('cta') ||
      text.includes('get started') ||
      text.includes('sign up')
    ) {
      return 'cta';
    }

    if (classes.includes('footer') || id.includes('footer') || $section.is('footer')) {
      return 'footer';
    }

    return 'content';
  }

  /**
   * Extract elements from HTML
   */
  private extractElements($: cheerio.CheerioAPI): OptimizePressElement[] {
    const elements: OptimizePressElement[] = [];

    // This would extract all elements, but for sections we use extractSectionElements
    return elements;
  }

  /**
   * Extract elements within a section
   */
  private extractSectionElements(
    $: cheerio.CheerioAPI,
    $section: cheerio.Cheerio<any>
  ): OptimizePressElement[] {
    const elements: OptimizePressElement[] = [];

    $section.children().each((_, child) => {
      const $child = $(child);
      const element = this.convertToOptimizePressElement($, $child);
      if (element) {
        elements.push(element);
      }
    });

    return elements;
  }

  /**
   * Convert HTML element to OptimizePress element
   */
  private convertToOptimizePressElement(
    $: cheerio.CheerioAPI,
    $element: cheerio.Cheerio<any>
  ): OptimizePressElement | null {
    const tagName = $element.prop('tagName')?.toLowerCase();
    if (!tagName) return null;

    const type = this.mapToOptimizePressElement(tagName, $element);
    const config = this.extractElementConfig($, $element, type);

    const element: OptimizePressElement = {
      type,
      id: this.generateID(type),
      config,
    };

    // Check if element has children
    if (this.isContainerElement(type)) {
      element.children = [];
      $element.children().each((_, child) => {
        const childElement = this.convertToOptimizePressElement($, $(child));
        if (childElement) {
          element.children!.push(childElement);
        }
      });
    } else {
      element.content = $.html($element);
    }

    return element;
  }

  /**
   * Map HTML tag to OptimizePress element type
   */
  private mapToOptimizePressElement(
    tagName: string,
    $element: cheerio.Cheerio<any>
  ): string {
    const classes = $element.attr('class') || '';

    // Headlines
    if (tagName.match(/^h[1-6]$/)) return 'headline';

    // Buttons
    if (
      tagName === 'a' &&
      (classes.includes('btn') || classes.includes('button'))
    ) {
      return 'button';
    }

    // Images
    if (tagName === 'img') return 'image';

    // Videos
    if (tagName === 'video' || tagName === 'iframe' && $element.attr('src')?.includes('youtube')) {
      return 'video';
    }

    // Forms
    if (tagName === 'form') return 'optin-form';

    // Lists
    if (tagName === 'ul' || tagName === 'ol') return 'bullet-list';

    // Countdown
    if (classes.includes('countdown') || classes.includes('timer')) {
      return 'countdown-timer';
    }

    // Feature boxes
    if (classes.includes('feature') || classes.includes('service')) {
      return 'feature-box';
    }

    // Pricing tables
    if (classes.includes('price') || classes.includes('pricing')) {
      return 'pricing-table';
    }

    // Testimonials
    if (classes.includes('testimonial') || classes.includes('review')) {
      return 'testimonial';
    }

    // Progress bars
    if (classes.includes('progress') || classes.includes('skill')) {
      return 'progress-bar';
    }

    // Social sharing
    if (classes.includes('social') || classes.includes('share')) {
      return 'social-share';
    }

    // Containers
    if (tagName === 'div') return 'container';

    // Text content
    if (tagName === 'p') return 'text';

    return 'custom-html';
  }

  /**
   * Extract element configuration
   */
  private extractElementConfig(
    $: cheerio.CheerioAPI,
    $element: cheerio.Cheerio<any>,
    type: string
  ): Record<string, any> {
    const config: Record<string, any> = {};
    const styles = $element.attr('style') || '';
    const styleObj = this.parseInlineStyles(styles);

    switch (type) {
      case 'headline':
        config.text = $element.text();
        config.tag = $element.prop('tagName')?.toLowerCase();
        config.fontSize = styleObj.fontSize || 'default';
        config.color = styleObj.color || '';
        config.align = styleObj.textAlign || 'left';
        config.fontFamily = styleObj.fontFamily || '';
        break;

      case 'button':
        config.text = $element.text();
        config.url = $element.attr('href') || '';
        config.target = $element.attr('target') === '_blank' ? 'new' : 'same';
        config.style = 'filled';
        config.size = 'medium';
        config.color = styleObj.backgroundColor || '';
        config.textColor = styleObj.color || '';
        config.borderRadius = styleObj.borderRadius || '';
        break;

      case 'image':
        config.url = $element.attr('src') || '';
        config.alt = $element.attr('alt') || '';
        config.align = styleObj.float || 'center';
        config.width = $element.attr('width') || 'auto';
        config.lightbox = false;
        break;

      case 'video':
        config.source = $element.attr('src') || $element.find('source').attr('src') || '';
        config.provider = config.source.includes('youtube') ? 'youtube' : 'custom';
        config.autoplay = $element.attr('autoplay') !== undefined;
        config.controls = $element.attr('controls') !== undefined;
        break;

      case 'optin-form':
        config.formType = 'email';
        config.fields = this.extractFormFields($element);
        config.buttonText = $element.find('[type="submit"]').val() || 'Submit';
        config.successMessage = 'Thank you for subscribing!';
        break;

      case 'countdown-timer':
        config.endDate = '';
        config.timezone = 'America/New_York';
        config.style = 'default';
        config.labels = { days: 'Days', hours: 'Hours', minutes: 'Minutes', seconds: 'Seconds' };
        break;

      case 'feature-box':
        config.icon = this.extractIcon($element);
        config.title = $element.find('h1, h2, h3, h4').first().text();
        config.description = $element.find('p').first().text();
        config.iconColor = '';
        config.iconSize = 'medium';
        break;

      case 'pricing-table':
        config.title = $element.find('h1, h2, h3, h4').first().text();
        config.price = this.extractPrice($element);
        config.features = this.extractFeatures($element);
        config.buttonText = $element.find('a, button').first().text();
        config.buttonUrl = $element.find('a').first().attr('href') || '';
        config.featured = false;
        break;

      case 'testimonial':
        config.content = $element.find('p, .testimonial-text').first().text();
        config.author = $element.find('.author, .name').first().text();
        config.position = $element.find('.position, .title').first().text();
        config.image = $element.find('img').attr('src') || '';
        config.rating = 5;
        break;
    }

    return config;
  }

  /**
   * Extract page settings
   */
  private extractSettings($: cheerio.CheerioAPI): OptimizePressSettings {
    return {
      seo: {
        title: $('title').text() || '',
        description: $('meta[name="description"]').attr('content') || '',
        keywords: $('meta[name="keywords"]').attr('content') || '',
      },
      integrations: {
        email: '',
        analytics: this.extractGoogleAnalytics($),
        facebook: this.extractFacebookPixel($),
      },
      typography: {
        headingFont: this.extractPrimaryFont($, 'h1, h2, h3'),
        bodyFont: this.extractPrimaryFont($, 'body, p'),
      },
      colors: {
        primary: this.extractPrimaryColor($),
        secondary: '',
        accent: '',
      },
    };
  }

  /**
   * Generate OptimizePress shortcodes
   */
  private generateShortcodes(page: OptimizePressPage): string {
    let shortcodes = '';

    for (const section of page.sections) {
      shortcodes += `[op_section type="${section.type}" id="${section.id}"]\n`;

      for (const element of section.elements) {
        shortcodes += this.elementToShortcode(element);
      }

      shortcodes += `[/op_section]\n\n`;
    }

    return shortcodes;
  }

  /**
   * Convert element to shortcode
   */
  private elementToShortcode(element: OptimizePressElement, depth: number = 1): string {
    const indent = '  '.repeat(depth);
    const attrs = Object.entries(element.config)
      .map(([key, value]) => `${key}="${value}"`)
      .join(' ');

    let shortcode = `${indent}[op_${element.type} ${attrs}`;

    if (element.children && element.children.length > 0) {
      shortcode += ']\n';
      for (const child of element.children) {
        shortcode += this.elementToShortcode(child, depth + 1);
      }
      shortcode += `${indent}[/op_${element.type}]\n`;
    } else if (element.content) {
      shortcode += `]${element.content}[/op_${element.type}]\n`;
    } else {
      shortcode += ' /]\n';
    }

    return shortcode;
  }

  /**
   * Generate PHP template
   */
  private generatePHPTemplate(page: OptimizePressPage): string {
    return `<?php
/**
 * OptimizePress Template - ${page.pageType}
 * Generated by Website Cloner Pro
 */

get_header();
?>

<div class="op-page op-page-${page.pageType}">
  <?php
  // OptimizePress content rendering
  echo do_shortcode('[op_page_content]');
  ?>
</div>

<?php
get_footer();
?>
`;
  }

  /**
   * Select template based on page type
   */
  private selectTemplate(pageType: OptimizePressPage['pageType']): string {
    const templates: Record<string, string> = {
      landing: 'op-landing-template',
      sales: 'op-sales-template',
      webinar: 'op-webinar-template',
      membership: 'op-membership-template',
      'thank-you': 'op-thankyou-template',
    };

    return templates[pageType] || 'op-default-template';
  }

  // Helper methods

  private generateID(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private isContainerElement(type: string): boolean {
    return ['container', 'feature-box', 'pricing-table'].includes(type);
  }

  private extractBackground(
    $: cheerio.CheerioAPI,
    $element: cheerio.Cheerio<any>
  ): OptimizePressSection['background'] {
    const styles = $element.attr('style') || '';
    const styleObj = this.parseInlineStyles(styles);

    if (styleObj.backgroundImage) {
      const urlMatch = styleObj.backgroundImage.match(/url\(['"]?([^'"]+)['"]?\)/);
      return {
        type: 'image',
        value: urlMatch ? urlMatch[1] : '',
      };
    }

    if (styleObj.backgroundColor) {
      return {
        type: 'color',
        value: styleObj.backgroundColor,
      };
    }

    return {
      type: 'color',
      value: 'transparent',
    };
  }

  private extractPadding($element: cheerio.Cheerio<any>): OptimizePressSection['padding'] {
    const styles = $element.attr('style') || '';
    const styleObj = this.parseInlineStyles(styles);
    const padding = styleObj.padding || '0';
    const parts = padding.split(' ').map((p) => parseInt(p) || 0);

    return {
      top: parts[0] || 0,
      right: parts[1] || parts[0] || 0,
      bottom: parts[2] || parts[0] || 0,
      left: parts[3] || parts[1] || parts[0] || 0,
    };
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

  private extractFormFields($form: cheerio.Cheerio<any>): string[] {
    const fields: string[] = [];
    $form.find('input, textarea, select').each((_, field) => {
      const $field = cheerio.load(field);
      const type = $field('input').attr('type') || 'text';
      const name = $field('[name]').attr('name') || '';
      if (name) fields.push(`${type}:${name}`);
    });
    return fields;
  }

  private extractIcon($element: cheerio.Cheerio<any>): string {
    const $icon = $element.find('i, svg').first();
    if ($icon.is('i')) {
      const classes = $icon.attr('class') || '';
      const match = classes.match(/fa-([a-z-]+)/);
      return match ? match[1] : 'star';
    }
    return 'default';
  }

  private extractPrice($element: cheerio.Cheerio<any>): string {
    const priceText = $element.find('[class*="price"]').first().text();
    const match = priceText.match(/\$?\d+(\.\d{2})?/);
    return match ? match[0] : '0';
  }

  private extractFeatures($element: cheerio.Cheerio<any>): string[] {
    const features: string[] = [];
    $element.find('li, [class*="feature"]').each((_, feat) => {
      features.push(cheerio.load(feat).text().trim());
    });
    return features;
  }

  private extractGoogleAnalytics($: cheerio.CheerioAPI): string {
    const gaScript = $('script').filter((_, el) => {
      const src = $(el).attr('src') || '';
      return src.includes('google-analytics') || src.includes('gtag');
    });
    return gaScript.length > 0 ? 'detected' : '';
  }

  private extractFacebookPixel($: cheerio.CheerioAPI): string {
    const fbScript = $('script').filter((_, el) => {
      const content = $(el).html() || '';
      return content.includes('fbq') || content.includes('facebook');
    });
    return fbScript.length > 0 ? 'detected' : '';
  }

  private extractPrimaryFont($: cheerio.CheerioAPI, selector: string): string {
    const $element = $(selector).first();
    const styles = $element.attr('style') || '';
    const styleObj = this.parseInlineStyles(styles);
    return styleObj.fontFamily?.replace(/['"]/g, '') || 'Arial';
  }

  private extractPrimaryColor($: cheerio.CheerioAPI): string {
    const colors = new Set<string>();
    $('[style*="color"], [style*="background"]').each((_, el) => {
      const style = $(el).attr('style') || '';
      const colorMatches = style.match(/#[0-9A-Fa-f]{6}/g);
      if (colorMatches) colorMatches.forEach((c) => colors.add(c));
    });
    return Array.from(colors)[0] || '#000000';
  }
}
