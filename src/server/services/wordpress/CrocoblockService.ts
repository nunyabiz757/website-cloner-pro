import * as cheerio from 'cheerio';

/**
 * Crocoblock Service
 * Converts HTML to Crocoblock/JetEngine dynamic content format
 *
 * Crocoblock is a suite of WordPress plugins including:
 * - JetEngine (custom post types, dynamic content)
 * - JetElements (Elementor widgets)
 * - JetSmartFilters (AJAX filtering)
 * - JetFormBuilder (advanced forms)
 * - JetSearch (smart search)
 * - JetWooBuilder (WooCommerce)
 */

export interface JetEngineWidget {
  widgetType: string;
  settings: Record<string, any>;
  elements?: JetEngineWidget[];
}

export interface JetEngineListing {
  listingId: string;
  listingSource: 'posts' | 'terms' | 'users' | 'repeater' | 'options';
  listingPost_type?: string;
  listingTax?: string;
  listingQuery?: JetEngineQuery;
  listingLayout: 'grid' | 'list' | 'masonry' | 'slider';
  columns?: number;
  columnsTablet?: number;
  columnsMobile?: number;
  items: JetEngineListingItem[];
}

export interface JetEngineQuery {
  post_type?: string[];
  posts_per_page?: number;
  orderby?: string;
  order?: 'ASC' | 'DESC';
  tax_query?: Array<{
    taxonomy: string;
    field: 'term_id' | 'slug';
    terms: string[];
  }>;
  meta_query?: Array<{
    key: string;
    value: any;
    compare?: string;
  }>;
}

export interface JetEngineListingItem {
  _id: string;
  elements: JetEngineDynamicField[];
}

export interface JetEngineDynamicField {
  fieldType: 'text' | 'image' | 'date' | 'number' | 'wysiwyg' | 'select' | 'checkbox' | 'media' | 'gallery' | 'repeater';
  fieldName: string;
  fieldLabel?: string;
  fieldValue?: any;
  fieldSource: 'object' | 'meta' | 'option' | 'repeater';
  dynamicTag?: string;
  fallback?: string;
}

export interface JetSmartFilter {
  filterId: string;
  filterType: 'checkboxes' | 'select' | 'range' | 'radio' | 'date-range' | 'search' | 'rating' | 'alphabetical';
  filterLabel?: string;
  filterSource: 'taxonomy' | 'meta' | 'custom';
  filterBy?: string;
  queryId?: string;
  applyType: 'ajax' | 'reload' | 'mixed';
  showCounter?: boolean;
  showLabel?: boolean;
}

export interface JetFormBuilder {
  formId: string;
  formName: string;
  fields: JetFormField[];
  submit: {
    label: string;
    type: 'reload' | 'ajax';
    redirect?: string;
  };
  notifications: Array<{
    type: 'email' | 'webhook' | 'mailchimp' | 'activecampaign';
    to?: string;
    subject?: string;
    message?: string;
  }>;
  actions: Array<{
    type: 'insert_post' | 'update_user' | 'update_option' | 'register_user' | 'webhook';
    settings: Record<string, any>;
  }>;
}

export interface JetFormField {
  fieldId: string;
  fieldType: 'text' | 'email' | 'textarea' | 'number' | 'select' | 'radio' | 'checkbox' | 'date' | 'time' | 'wysiwyg' | 'media' | 'repeater' | 'calculated';
  fieldLabel: string;
  fieldName: string;
  fieldDesc?: string;
  fieldPlaceholder?: string;
  fieldRequired?: boolean;
  fieldWidth?: number;
  fieldDefault?: any;
  fieldOptions?: Array<{ value: string; label: string }>;
  fieldCalculation?: string;
  fieldValidation?: Array<{
    type: 'regexp' | 'email' | 'url' | 'number' | 'min' | 'max';
    value?: any;
    message?: string;
  }>;
}

export interface CrocoblockExportResult {
  success: boolean;
  data: {
    listings: JetEngineListing[];
    filters: JetSmartFilter[];
    forms: JetFormBuilder[];
    widgets: JetEngineWidget[];
    metaFields: JetEngineDynamicField[];
    shortcodes: string;
    elementorData?: any; // For JetElements integration
  };
  metadata: {
    listingCount: number;
    filterCount: number;
    formCount: number;
    widgetCount: number;
    hasDynamicContent: boolean;
  };
}

export class CrocoblockService {
  private idCounter = 0;

  /**
   * Convert HTML to Crocoblock/JetEngine format
   */
  async convertToCrocoblock(
    html: string,
    css?: string,
    options?: {
      postType?: string;
      taxonomy?: string;
      enableFilters?: boolean;
      enableDynamicContent?: boolean;
    }
  ): Promise<CrocoblockExportResult> {
    try {
      const $ = cheerio.load(html);

      const listings = this.extractListings($, options);
      const filters = options?.enableFilters ? this.extractFilters($) : [];
      const forms = this.extractForms($);
      const widgets = this.extractWidgets($);
      const metaFields = this.extractMetaFields($);

      // Generate shortcodes
      const shortcodes = this.generateShortcodes(listings, filters, forms);

      return {
        success: true,
        data: {
          listings,
          filters,
          forms,
          widgets,
          metaFields,
          shortcodes,
        },
        metadata: {
          listingCount: listings.length,
          filterCount: filters.length,
          formCount: forms.length,
          widgetCount: widgets.length,
          hasDynamicContent: metaFields.length > 0,
        },
      };
    } catch (error) {
      console.error('Crocoblock conversion error:', error);
      throw new Error(`Failed to convert to Crocoblock: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract JetEngine listings from HTML
   */
  private extractListings($: cheerio.CheerioAPI, options?: any): JetEngineListing[] {
    const listings: JetEngineListing[] = [];

    // Look for repeating content patterns (blog posts, products, team members, etc.)
    const potentialListings = this.findRepeatingPatterns($);

    for (const pattern of potentialListings) {
      const listing = this.createListing($, pattern, options);
      if (listing) {
        listings.push(listing);
      }
    }

    return listings;
  }

  /**
   * Find repeating content patterns (e.g., blog posts, product cards)
   */
  private findRepeatingPatterns($: cheerio.CheerioAPI): cheerio.Cheerio<any>[] {
    const patterns: cheerio.Cheerio<any>[] = [];

    // Common repeating element selectors
    const selectors = [
      '.post',
      '.product',
      '.card',
      '.item',
      '.entry',
      '.team-member',
      '.testimonial',
      '[class*="grid"] > div',
      '[class*="row"] > div',
    ];

    for (const selector of selectors) {
      const elements = $(selector);
      if (elements.length >= 2) {
        // Found repeating pattern
        patterns.push(elements);
        break; // Use first pattern found
      }
    }

    return patterns;
  }

  /**
   * Create JetEngine listing from repeating pattern
   */
  private createListing(
    $: cheerio.CheerioAPI,
    $elements: cheerio.Cheerio<any>,
    options?: any
  ): JetEngineListing | null {
    if ($elements.length === 0) return null;

    const items: JetEngineListingItem[] = [];

    $elements.each((index, element) => {
      const $element = $(element);
      const elements = this.extractDynamicFields($, $element);

      items.push({
        _id: this.generateId(),
        elements,
      });
    });

    // Detect layout
    const parent = $elements.parent();
    const parentClasses = parent.attr('class') || '';
    let layout: JetEngineListing['listingLayout'] = 'grid';
    if (parentClasses.includes('slider') || parentClasses.includes('carousel')) {
      layout = 'slider';
    } else if (parentClasses.includes('masonry')) {
      layout = 'masonry';
    } else if (parentClasses.includes('list')) {
      layout = 'list';
    }

    // Detect columns
    let columns = 3;
    if (parentClasses.includes('col-2')) columns = 2;
    if (parentClasses.includes('col-3')) columns = 3;
    if (parentClasses.includes('col-4')) columns = 4;

    return {
      listingId: this.generateId(),
      listingSource: options?.postType ? 'posts' : 'posts',
      listingPost_type: options?.postType || 'post',
      listingLayout: layout,
      columns,
      columnsTablet: Math.min(columns, 2),
      columnsMobile: 1,
      items,
    };
  }

  /**
   * Extract dynamic fields from listing item
   */
  private extractDynamicFields($: cheerio.CheerioAPI, $element: cheerio.Cheerio<any>): JetEngineDynamicField[] {
    const fields: JetEngineDynamicField[] = [];

    // Title
    const $title = $element.find('h1, h2, h3, h4, .title, .heading').first();
    if ($title.length > 0) {
      fields.push({
        fieldType: 'text',
        fieldName: 'post_title',
        fieldSource: 'object',
        dynamicTag: '%post_title%',
        fallback: $title.text(),
      });
    }

    // Image
    const $image = $element.find('img').first();
    if ($image.length > 0) {
      fields.push({
        fieldType: 'image',
        fieldName: '_thumbnail_id',
        fieldSource: 'meta',
        dynamicTag: '%post_thumbnail%',
        fallback: $image.attr('src'),
      });
    }

    // Date
    const $date = $element.find('.date, time, [datetime]').first();
    if ($date.length > 0) {
      fields.push({
        fieldType: 'date',
        fieldName: 'post_date',
        fieldSource: 'object',
        dynamicTag: '%post_date%',
        fallback: $date.text(),
      });
    }

    // Excerpt/Content
    const $excerpt = $element.find('.excerpt, .description, p').first();
    if ($excerpt.length > 0) {
      fields.push({
        fieldType: 'wysiwyg',
        fieldName: 'post_excerpt',
        fieldSource: 'object',
        dynamicTag: '%post_excerpt%',
        fallback: $excerpt.text(),
      });
    }

    // Link
    const $link = $element.find('a[href]').first();
    if ($link.length > 0) {
      fields.push({
        fieldType: 'text',
        fieldName: 'post_link',
        fieldSource: 'object',
        dynamicTag: '%post_permalink%',
        fallback: $link.attr('href'),
      });
    }

    return fields;
  }

  /**
   * Extract JetSmartFilters from HTML
   */
  private extractFilters($: cheerio.CheerioAPI): JetSmartFilter[] {
    const filters: JetSmartFilter[] = [];

    // Look for filter-like elements
    $('select, [role="listbox"], .filter').each((_, element) => {
      const $element = $(element);
      const filter = this.createFilter($, $element);
      if (filter) {
        filters.push(filter);
      }
    });

    return filters;
  }

  /**
   * Create JetSmartFilter from element
   */
  private createFilter($: cheerio.CheerioAPI, $element: cheerio.Cheerio<any>): JetSmartFilter | null {
    const tagName = $element.prop('tagName')?.toLowerCase();
    const type = $element.attr('type');

    let filterType: JetSmartFilter['filterType'] = 'select';

    if (tagName === 'select') {
      filterType = 'select';
    } else if (type === 'checkbox') {
      filterType = 'checkboxes';
    } else if (type === 'radio') {
      filterType = 'radio';
    } else if (type === 'range') {
      filterType = 'range';
    } else if (type === 'search' || tagName === 'input') {
      filterType = 'search';
    }

    const label = $element.closest('label').text() || $element.attr('placeholder') || $element.attr('name');

    return {
      filterId: this.generateId(),
      filterType,
      filterLabel: label,
      filterSource: 'taxonomy',
      applyType: 'ajax',
      showCounter: true,
      showLabel: true,
    };
  }

  /**
   * Extract forms from HTML
   */
  private extractForms($: cheerio.CheerioAPI): JetFormBuilder[] {
    const forms: JetFormBuilder[] = [];

    $('form').each((_, element) => {
      const $form = $(element);
      const form = this.createForm($, $form);
      if (form) {
        forms.push(form);
      }
    });

    return forms;
  }

  /**
   * Create JetFormBuilder from form element
   */
  private createForm($: cheerio.CheerioAPI, $form: cheerio.Cheerio<any>): JetFormBuilder | null {
    const fields: JetFormField[] = [];

    // Extract form fields
    $form.find('input, textarea, select').each((_, element) => {
      const $field = $(element);
      const field = this.createFormField($, $field);
      if (field) {
        fields.push(field);
      }
    });

    if (fields.length === 0) return null;

    // Find submit button
    const $submit = $form.find('[type="submit"], button[type="submit"], .submit').first();
    const submitLabel = $submit.text() || $submit.attr('value') || 'Submit';

    // Detect if has email field (likely contact form)
    const hasEmail = fields.some(f => f.fieldType === 'email');

    return {
      formId: this.generateId(),
      formName: $form.attr('name') || $form.attr('id') || 'Contact Form',
      fields,
      submit: {
        label: submitLabel,
        type: 'ajax',
      },
      notifications: hasEmail ? [{
        type: 'email',
        to: 'admin@example.com',
        subject: 'New form submission',
        message: 'You have received a new form submission.',
      }] : [],
      actions: [],
    };
  }

  /**
   * Create form field from input element
   */
  private createFormField($: cheerio.CheerioAPI, $field: cheerio.Cheerio<any>): JetFormField | null {
    const tagName = $field.prop('tagName')?.toLowerCase();
    const type = $field.attr('type') || 'text';
    const name = $field.attr('name');
    if (!name) return null;

    // Find label
    const fieldId = $field.attr('id');
    let label = '';
    if (fieldId) {
      label = $(`label[for="${fieldId}"]`).text();
    }
    if (!label) {
      label = $field.closest('label').text();
    }
    if (!label) {
      label = $field.attr('placeholder') || name;
    }

    let fieldType: JetFormField['fieldType'] = 'text';
    if (tagName === 'textarea') {
      fieldType = 'textarea';
    } else if (tagName === 'select') {
      fieldType = 'select';
    } else if (type === 'email') {
      fieldType = 'email';
    } else if (type === 'number') {
      fieldType = 'number';
    } else if (type === 'date') {
      fieldType = 'date';
    } else if (type === 'time') {
      fieldType = 'time';
    } else if (type === 'checkbox') {
      fieldType = 'checkbox';
    } else if (type === 'radio') {
      fieldType = 'radio';
    }

    // Extract options for select/radio/checkbox
    let options: JetFormField['fieldOptions'];
    if (tagName === 'select') {
      options = [];
      $field.find('option').each((_, opt) => {
        const $opt = $(opt);
        options!.push({
          value: $opt.attr('value') || $opt.text(),
          label: $opt.text(),
        });
      });
    }

    return {
      fieldId: this.generateId(),
      fieldType,
      fieldLabel: label,
      fieldName: name,
      fieldPlaceholder: $field.attr('placeholder'),
      fieldRequired: $field.attr('required') !== undefined,
      fieldWidth: 100,
      fieldOptions: options,
    };
  }

  /**
   * Extract widgets (JetElements)
   */
  private extractWidgets($: cheerio.CheerioAPI): JetEngineWidget[] {
    const widgets: JetEngineWidget[] = [];

    // Detect common widget patterns
    const widgetPatterns = [
      { selector: '.testimonial, .review', type: 'jet-testimonials' },
      { selector: '.team-member, .staff', type: 'jet-team-member' },
      { selector: '.pricing, .price-table', type: 'jet-pricing-table' },
      { selector: '.progress, .skill-bar', type: 'jet-progress-bar' },
      { selector: '.timeline', type: 'jet-timeline' },
      { selector: '.tabs', type: 'jet-tabs' },
      { selector: '.accordion, .faq', type: 'jet-accordion' },
      { selector: '.counter, .stats', type: 'jet-counter' },
    ];

    for (const pattern of widgetPatterns) {
      $(pattern.selector).each((_, element) => {
        const $element = $(element);
        const widget = this.createWidget($, $element, pattern.type);
        if (widget) {
          widgets.push(widget);
        }
      });
    }

    return widgets;
  }

  /**
   * Create widget from element
   */
  private createWidget($: cheerio.CheerioAPI, $element: cheerio.Cheerio<any>, widgetType: string): JetEngineWidget | null {
    const settings: Record<string, any> = {};

    // Extract common settings based on widget type
    switch (widgetType) {
      case 'jet-testimonials':
        settings.name = $element.find('.name, .author').text();
        settings.position = $element.find('.position, .role').text();
        settings.content = $element.find('.content, .text, p').text();
        settings.image = $element.find('img').attr('src');
        settings.rating = $element.find('[class*="star"]').length;
        break;

      case 'jet-team-member':
        settings.name = $element.find('.name, h3, h4').text();
        settings.position = $element.find('.position, .role').text();
        settings.description = $element.find('.description, p').text();
        settings.image = $element.find('img').attr('src');
        settings.social = this.extractSocialLinks($, $element);
        break;

      case 'jet-pricing-table':
        settings.title = $element.find('.title, h3').text();
        settings.price = $element.find('.price, [class*="price"]').text();
        settings.features = [];
        $element.find('li, .feature').each((_, feat) => {
          settings.features.push($(feat).text());
        });
        settings.button_text = $element.find('a, button').text();
        settings.button_url = $element.find('a').attr('href');
        break;

      case 'jet-progress-bar':
        settings.label = $element.find('.label, .title').text();
        settings.percent = parseInt($element.attr('data-percent') || '75');
        break;

      case 'jet-counter':
        settings.starting_number = 0;
        settings.ending_number = parseInt($element.find('[class*="number"]').text().replace(/\D/g, '')) || 100;
        settings.prefix = '';
        settings.suffix = '';
        break;
    }

    return {
      widgetType,
      settings,
    };
  }

  /**
   * Extract social links from element
   */
  private extractSocialLinks($: cheerio.CheerioAPI, $element: cheerio.Cheerio<any>): Array<{ type: string; url: string }> {
    const social: Array<{ type: string; url: string }> = [];

    $element.find('a[href*="facebook.com"], a[href*="twitter.com"], a[href*="linkedin.com"], a[href*="instagram.com"]').each((_, link) => {
      const $link = $(link);
      const href = $link.attr('href') || '';

      let type = 'other';
      if (href.includes('facebook')) type = 'facebook';
      if (href.includes('twitter')) type = 'twitter';
      if (href.includes('linkedin')) type = 'linkedin';
      if (href.includes('instagram')) type = 'instagram';

      social.push({ type, url: href });
    });

    return social;
  }

  /**
   * Extract custom meta fields
   */
  private extractMetaFields($: cheerio.CheerioAPI): JetEngineDynamicField[] {
    const fields: JetEngineDynamicField[] = [];

    // Look for data attributes that might be custom fields
    $('[data-field], [data-meta]').each((_, element) => {
      const $element = $(element);
      const fieldName = $element.attr('data-field') || $element.attr('data-meta') || '';

      if (fieldName) {
        fields.push({
          fieldType: 'text',
          fieldName,
          fieldSource: 'meta',
          dynamicTag: `%${fieldName}%`,
          fallback: $element.text(),
        });
      }
    });

    return fields;
  }

  /**
   * Generate shortcodes for Crocoblock elements
   */
  private generateShortcodes(
    listings: JetEngineListing[],
    filters: JetSmartFilter[],
    forms: JetFormBuilder[]
  ): string {
    let shortcodes = '';

    // Listing shortcodes
    for (const listing of listings) {
      shortcodes += `[jet-engine-listing id="${listing.listingId}" layout="${listing.listingLayout}" columns="${listing.columns}"]\n\n`;
    }

    // Filter shortcodes
    for (const filter of filters) {
      shortcodes += `[jet-smart-filters id="${filter.filterId}" type="${filter.filterType}"]\n\n`;
    }

    // Form shortcodes
    for (const form of forms) {
      shortcodes += `[jet-form id="${form.formId}"]\n\n`;
    }

    return shortcodes.trim();
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    this.idCounter++;
    return `jet-${Date.now()}-${this.idCounter}`;
  }
}

export default CrocoblockService;
