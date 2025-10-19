import * as cheerio from 'cheerio';

type Platform = 'wordpress' | 'shopify' | 'wix' | 'squarespace' | 'webflow' | 'generic-html';

interface PlatformTransferOptions {
  sourcePlatform?: Platform;
  targetPlatform: Platform;
  preserveStructure?: boolean;
  includeComments?: boolean;
  convertShortcodes?: boolean;
  generateMigrationGuide?: boolean;
}

interface PlatformTransferResult {
  convertedContent: string;
  platform: Platform;
  changes: PlatformChange[];
  migrationGuide?: string;
  warnings: string[];
  statistics: {
    elementsConverted: number;
    shortcodesConverted: number;
    platformSpecificRemoved: number;
  };
}

interface PlatformChange {
  type: 'conversion' | 'removal' | 'addition';
  description: string;
  before?: string;
  after?: string;
  location?: string;
}

interface PlatformDetectionResult {
  platform: Platform;
  confidence: number;
  indicators: string[];
  version?: string;
}

export class PlatformTransferService {
  /**
   * Detect source platform
   */
  async detectPlatform(htmlContent: string): Promise<PlatformDetectionResult> {
    const $ = cheerio.load(htmlContent);
    const indicators: string[] = [];
    let platform: Platform = 'generic-html';
    let confidence = 0;

    // WordPress detection
    if (
      htmlContent.includes('wp-content') ||
      htmlContent.includes('wordpress') ||
      $('link[href*="wp-includes"]').length > 0 ||
      $('meta[name="generator"][content*="WordPress"]').length > 0
    ) {
      platform = 'wordpress';
      confidence = 95;
      indicators.push('wp-content directory', 'WordPress generator meta tag');
    }

    // Shopify detection
    if (
      htmlContent.includes('cdn.shopify.com') ||
      htmlContent.includes('myshopify.com') ||
      $('meta[name="shopify-checkout-api-token"]').length > 0 ||
      htmlContent.includes('Shopify.shop')
    ) {
      platform = 'shopify';
      confidence = 95;
      indicators.push('Shopify CDN', 'Shopify API tokens');
    }

    // Wix detection
    if (
      htmlContent.includes('wixstatic.com') ||
      htmlContent.includes('wix.com') ||
      $('meta[name="generator"][content*="Wix"]').length > 0
    ) {
      platform = 'wix';
      confidence = 95;
      indicators.push('Wix static assets', 'Wix generator tag');
    }

    // Squarespace detection
    if (
      htmlContent.includes('squarespace') ||
      htmlContent.includes('sqsp.com') ||
      $('meta[name="generator"][content*="Squarespace"]').length > 0
    ) {
      platform = 'squarespace';
      confidence = 95;
      indicators.push('Squarespace assets', 'Squarespace generator');
    }

    // Webflow detection
    if (
      htmlContent.includes('webflow') ||
      $('meta[name="generator"][content*="Webflow"]').length > 0 ||
      $('[class*="w-"]').length > 10
    ) {
      platform = 'webflow';
      confidence = 90;
      indicators.push('Webflow classes', 'Webflow generator');
    }

    // Extract version if available
    const generatorMeta = $('meta[name="generator"]').attr('content');
    const version = generatorMeta?.match(/[\d.]+/)?.[0];

    return {
      platform,
      confidence,
      indicators,
      version,
    };
  }

  /**
   * Transfer between platforms
   */
  async transferPlatform(
    htmlContent: string,
    options: PlatformTransferOptions
  ): Promise<PlatformTransferResult> {
    const $ = cheerio.load(htmlContent);
    const changes: PlatformChange[] = [];
    const warnings: string[] = [];
    let elementsConverted = 0;
    let shortcodesConverted = 0;
    let platformSpecificRemoved = 0;

    // Detect source platform if not provided
    const sourcePlatform = options.sourcePlatform || (await this.detectPlatform(htmlContent)).platform;

    // Remove platform-specific elements
    this.removePlatformSpecific($, sourcePlatform, changes, warnings);
    platformSpecificRemoved = changes.length;

    // Convert to target platform
    switch (options.targetPlatform) {
      case 'wordpress':
        elementsConverted += this.convertToWordPress($, changes, options);
        break;
      case 'shopify':
        elementsConverted += this.convertToShopify($, changes, options);
        break;
      case 'webflow':
        elementsConverted += this.convertToWebflow($, changes, options);
        break;
      case 'generic-html':
        elementsConverted += this.convertToGenericHTML($, changes, options);
        break;
      default:
        warnings.push(`Target platform ${options.targetPlatform} conversion not fully implemented`);
    }

    // Convert shortcodes if requested
    if (options.convertShortcodes) {
      shortcodesConverted = this.convertShortcodes($, sourcePlatform, options.targetPlatform, changes);
    }

    // Generate migration guide
    const migrationGuide = options.generateMigrationGuide
      ? this.generateMigrationGuide(sourcePlatform, options.targetPlatform, changes)
      : undefined;

    return {
      convertedContent: $.html(),
      platform: options.targetPlatform,
      changes,
      migrationGuide,
      warnings,
      statistics: {
        elementsConverted,
        shortcodesConverted,
        platformSpecificRemoved,
      },
    };
  }

  /**
   * Remove platform-specific elements
   */
  private removePlatformSpecific(
    $: cheerio.CheerioAPI,
    platform: Platform,
    changes: PlatformChange[],
    warnings: string[]
  ): void {
    switch (platform) {
      case 'wordpress':
        // Remove WordPress-specific classes
        $('[class*="wp-"]').each((_, el) => {
          const $el = $(el);
          const classes = $el.attr('class') || '';
          const wpClasses = classes.split(' ').filter((c) => c.startsWith('wp-'));

          wpClasses.forEach((cls) => {
            $el.removeClass(cls);
            changes.push({
              type: 'removal',
              description: `Removed WordPress class: ${cls}`,
            });
          });
        });

        // Remove WordPress admin bar
        $('#wpadminbar').remove();
        changes.push({
          type: 'removal',
          description: 'Removed WordPress admin bar',
        });
        break;

      case 'shopify':
        // Remove Shopify-specific elements
        $('[data-shopify], [shopify-section]').remove();
        changes.push({
          type: 'removal',
          description: 'Removed Shopify-specific attributes',
        });
        break;

      case 'wix':
        // Remove Wix-specific elements
        $('[class*="wix"], [data-wix]').each((_, el) => {
          $(el).removeAttr('data-wix');
          changes.push({
            type: 'removal',
            description: 'Removed Wix-specific attributes',
          });
        });
        break;

      case 'webflow':
        // Convert Webflow classes to standard
        $('[class*="w-"]').each((_, el) => {
          const $el = $(el);
          const classes = $el.attr('class') || '';
          const webflowClasses = classes.split(' ').filter((c) => c.startsWith('w-'));

          webflowClasses.forEach((cls) => {
            $el.removeClass(cls);
          });

          if (webflowClasses.length > 0) {
            changes.push({
              type: 'removal',
              description: `Removed ${webflowClasses.length} Webflow classes`,
            });
          }
        });
        break;
    }

    // Remove generator meta tags
    $('meta[name="generator"]').remove();
    changes.push({
      type: 'removal',
      description: 'Removed generator meta tag',
    });
  }

  /**
   * Convert to WordPress
   */
  private convertToWordPress(
    $: cheerio.CheerioAPI,
    changes: PlatformChange[],
    options: PlatformTransferOptions
  ): number {
    let converted = 0;

    // Add WordPress meta tags
    $('head').prepend('<meta name="generator" content="WordPress 6.4">');
    changes.push({
      type: 'addition',
      description: 'Added WordPress generator meta tag',
    });

    // Convert common elements to WordPress classes
    $('nav, .nav, .navigation').each((_, el) => {
      $(el).addClass('wp-nav-menu');
      converted++;
    });

    $('.content, .main-content').each((_, el) => {
      $(el).addClass('entry-content');
      converted++;
    });

    $('.post, article').each((_, el) => {
      $(el).addClass('wp-post');
      converted++;
    });

    if (converted > 0) {
      changes.push({
        type: 'conversion',
        description: `Converted ${converted} elements to WordPress structure`,
      });
    }

    // Add WordPress hooks comments
    if (options.includeComments) {
      $('body').prepend('<!-- wp:template-part {"slug":"header"} /-->');
      $('body').append('<!-- wp:template-part {"slug":"footer"} /-->');
      changes.push({
        type: 'addition',
        description: 'Added WordPress block template comments',
      });
    }

    return converted;
  }

  /**
   * Convert to Shopify
   */
  private convertToShopify(
    $: cheerio.CheerioAPI,
    changes: PlatformChange[],
    options: PlatformTransferOptions
  ): number {
    let converted = 0;

    // Add Shopify meta tags
    $('head').prepend('<meta name="shopify-theme" content="custom">');
    changes.push({
      type: 'addition',
      description: 'Added Shopify theme meta tag',
    });

    // Convert product elements
    $('.product, .product-card').each((_, el) => {
      const $el = $(el);
      $el.attr('data-product-id', 'PRODUCT_ID');
      $el.addClass('shopify-product');
      converted++;
    });

    // Convert cart elements
    $('.cart, .shopping-cart').each((_, el) => {
      $(el).attr('data-cart', 'true');
      converted++;
    });

    if (converted > 0) {
      changes.push({
        type: 'conversion',
        description: `Converted ${converted} elements to Shopify structure`,
      });
    }

    // Add Liquid template comments
    if (options.includeComments) {
      $('body').prepend('{% comment %} Shopify Theme {% endcomment %}');
      changes.push({
        type: 'addition',
        description: 'Added Liquid template comments',
      });
    }

    return converted;
  }

  /**
   * Convert to Webflow
   */
  private convertToWebflow(
    $: cheerio.CheerioAPI,
    changes: PlatformChange[],
    options: PlatformTransferOptions
  ): number {
    let converted = 0;

    // Add Webflow meta tags
    $('head').prepend('<meta name="generator" content="Webflow">');
    changes.push({
      type: 'addition',
      description: 'Added Webflow generator meta tag',
    });

    // Convert common elements to Webflow classes
    $('.container').each((_, el) => {
      $(el).addClass('w-container');
      converted++;
    });

    $('.row').each((_, el) => {
      $(el).addClass('w-row');
      converted++;
    });

    $('.column, .col').each((_, el) => {
      $(el).addClass('w-col');
      converted++;
    });

    $('button').each((_, el) => {
      $(el).addClass('w-button');
      converted++;
    });

    if (converted > 0) {
      changes.push({
        type: 'conversion',
        description: `Converted ${converted} elements to Webflow classes`,
      });
    }

    return converted;
  }

  /**
   * Convert to generic HTML
   */
  private convertToGenericHTML(
    $: cheerio.CheerioAPI,
    changes: PlatformChange[],
    options: PlatformTransferOptions
  ): number {
    let converted = 0;

    // Remove all platform-specific attributes
    $('[class*="-"]').each((_, el) => {
      const $el = $(el);
      const classes = $el.attr('class') || '';
      const platformClasses = classes.split(' ').filter((c) =>
        c.includes('wp-') || c.includes('shopify-') || c.includes('w-') || c.includes('wix-')
      );

      platformClasses.forEach((cls) => {
        $el.removeClass(cls);
        converted++;
      });
    });

    // Remove data attributes
    $('[data-shopify], [data-wix], [data-webflow]').each((_, el) => {
      const $el = $(el);
      Object.keys(el.attribs || {}).forEach((attr) => {
        if (attr.startsWith('data-shopify') || attr.startsWith('data-wix') || attr.startsWith('data-webflow')) {
          $el.removeAttr(attr);
          converted++;
        }
      });
    });

    if (converted > 0) {
      changes.push({
        type: 'conversion',
        description: `Cleaned ${converted} platform-specific elements`,
      });
    }

    return converted;
  }

  /**
   * Convert shortcodes between platforms
   */
  private convertShortcodes(
    $: cheerio.CheerioAPI,
    sourcePlatform: Platform,
    targetPlatform: Platform,
    changes: PlatformChange[]
  ): number {
    let converted = 0;

    if (sourcePlatform === 'wordpress') {
      // Convert WordPress shortcodes to HTML
      const body = $('body').html() || '';
      let newBody = body;

      // [gallery] shortcode
      newBody = newBody.replace(/\[gallery([^\]]*)\]/g, (match) => {
        converted++;
        return '<div class="gallery"><!-- Gallery shortcode converted --></div>';
      });

      // [embed] shortcode
      newBody = newBody.replace(/\[embed\]([^\[]+)\[\/embed\]/g, (match, url) => {
        converted++;
        return `<iframe src="${url}" class="embed"></iframe>`;
      });

      // [caption] shortcode
      newBody = newBody.replace(/\[caption([^\]]*)\]([^\[]+)\[\/caption\]/g, (match, attrs, content) => {
        converted++;
        return `<figure><figcaption>${content}</figcaption></figure>`;
      });

      $('body').html(newBody);

      if (converted > 0) {
        changes.push({
          type: 'conversion',
          description: `Converted ${converted} WordPress shortcodes`,
        });
      }
    }

    return converted;
  }

  /**
   * Generate migration guide
   */
  private generateMigrationGuide(
    sourcePlatform: Platform,
    targetPlatform: Platform,
    changes: PlatformChange[]
  ): string {
    const guide: string[] = [];

    guide.push(`# Migration Guide: ${sourcePlatform} → ${targetPlatform}`);
    guide.push('');
    guide.push('## Overview');
    guide.push(`This guide will help you migrate from ${sourcePlatform} to ${targetPlatform}.`);
    guide.push('');

    guide.push('## Changes Made');
    guide.push(`- Elements converted: ${changes.filter((c) => c.type === 'conversion').length}`);
    guide.push(`- Elements removed: ${changes.filter((c) => c.type === 'removal').length}`);
    guide.push(`- Elements added: ${changes.filter((c) => c.type === 'addition').length}`);
    guide.push('');

    guide.push('## Detailed Changes');
    changes.slice(0, 20).forEach((change, index) => {
      guide.push(`${index + 1}. **${change.type.toUpperCase()}**: ${change.description}`);
    });
    guide.push('');

    // Platform-specific instructions
    guide.push('## Next Steps');

    if (targetPlatform === 'wordpress') {
      guide.push('1. Install WordPress and choose a theme');
      guide.push('2. Import the converted HTML into a custom template');
      guide.push('3. Convert styles to theme stylesheet');
      guide.push('4. Set up WordPress menus and widgets');
      guide.push('5. Configure permalinks and SEO settings');
    } else if (targetPlatform === 'shopify') {
      guide.push('1. Create a Shopify store');
      guide.push('2. Upload the converted theme files');
      guide.push('3. Configure product templates');
      guide.push('4. Set up collections and navigation');
      guide.push('5. Configure payment and shipping settings');
    } else if (targetPlatform === 'webflow') {
      guide.push('1. Create a Webflow project');
      guide.push('2. Import HTML structure');
      guide.push('3. Style elements in Webflow Designer');
      guide.push('4. Set up CMS collections if needed');
      guide.push('5. Publish to custom domain');
    }

    guide.push('');
    guide.push('## Important Notes');
    guide.push('- Review all converted elements manually');
    guide.push('- Test functionality thoroughly');
    guide.push('- Update internal links and paths');
    guide.push('- Verify all forms and interactive elements');
    guide.push('- Set up redirects from old URLs');

    return guide.join('\n');
  }

  /**
   * Get platform-specific export format
   */
  async exportForPlatform(
    htmlContent: string,
    platform: Platform
  ): Promise<{
    files: Array<{ path: string; content: string }>;
    instructions: string;
  }> {
    const $ = cheerio.load(htmlContent);
    const files: Array<{ path: string; content: string }> = [];

    switch (platform) {
      case 'wordpress':
        // Create WordPress theme structure
        files.push({
          path: 'index.php',
          content: this.generateWordPressTheme($),
        });
        files.push({
          path: 'style.css',
          content: this.extractStyles($),
        });
        files.push({
          path: 'functions.php',
          content: '<?php\n// Theme functions\n',
        });
        break;

      case 'shopify':
        // Create Shopify theme structure
        files.push({
          path: 'layout/theme.liquid',
          content: this.generateShopifyTheme($),
        });
        files.push({
          path: 'assets/theme.css',
          content: this.extractStyles($),
        });
        break;

      default:
        files.push({
          path: 'index.html',
          content: $.html(),
        });
    }

    return {
      files,
      instructions: this.generateExportInstructions(platform),
    };
  }

  private generateWordPressTheme($: cheerio.CheerioAPI): string {
    return `<?php
/**
 * Theme Name: Converted Theme
 * Description: Converted from Website Cloner Pro
 */
get_header();
?>

${$('body').html()}

<?php get_footer(); ?>
`;
  }

  private generateShopifyTheme($: cheerio.CheerioAPI): string {
    return `<!DOCTYPE html>
<html>
<head>
  <title>{{ page_title }}</title>
  {{ content_for_header }}
  {{ 'theme.css' | asset_url | stylesheet_tag }}
</head>
<body>
  ${$('body').html()}
</body>
</html>`;
  }

  private extractStyles($: cheerio.CheerioAPI): string {
    let styles = '';
    $('style').each((_, el) => {
      styles += $(el).html() + '\n\n';
    });
    return styles;
  }

  private generateExportInstructions(platform: Platform): string {
    const instructions: { [key in Platform]: string } = {
      wordpress: 'Upload files to wp-content/themes/your-theme/ directory',
      shopify: 'Upload files via Shopify Admin > Online Store > Themes > Upload theme',
      wix: 'Use Wix Velo to integrate custom code',
      squarespace: 'Use Code Injection or Developer Mode',
      webflow: 'Import HTML via Webflow Designer',
      'generic-html': 'Upload to web server or hosting provider',
    };

    return instructions[platform];
  }
}
