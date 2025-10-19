import * as cheerio from 'cheerio';

/**
 * EcommerceDetectionService
 *
 * Comprehensive e-commerce detection and handling:
 * - Shopping cart detection and functionality analysis
 * - Product page identification and data extraction
 * - WooCommerce export support with full product data
 * - Payment gateway preservation and migration notes
 * - Product catalog migration planning
 */

// E-commerce detection result
export interface EcommerceDetectionResult {
  isEcommerce: boolean;
  confidence: number;
  platform?: EcommercePlatform;
  products: DetectedProduct[];
  shoppingCart: ShoppingCartDetection;
  paymentGateways: PaymentGateway[];
  migrationPlan: EcommerceMigrationPlan;
  estimatedProducts: number;
}

export type EcommercePlatform =
  | 'shopify'
  | 'woocommerce'
  | 'magento'
  | 'bigcommerce'
  | 'custom'
  | 'unknown';

// Product detection
export interface DetectedProduct {
  id: string;
  name: string;
  price?: number;
  currency?: string;
  description?: string;
  shortDescription?: string;
  images: string[];
  sku?: string;
  categories: string[];
  tags: string[];
  attributes: ProductAttribute[];
  variations: ProductVariation[];
  inStock: boolean;
  stockQuantity?: number;
  url: string;
  metadata: Record<string, any>;
}

export interface ProductAttribute {
  name: string;
  value: string | string[];
  visible: boolean;
}

export interface ProductVariation {
  id: string;
  attributes: Record<string, string>;
  price: number;
  sku?: string;
  inStock: boolean;
  stockQuantity?: number;
}

// Shopping cart detection
export interface ShoppingCartDetection {
  detected: boolean;
  cartType: 'client-side' | 'server-side' | 'hybrid' | 'unknown';
  addToCartButtons: number;
  cartPageUrl?: string;
  checkoutPageUrl?: string;
  features: CartFeature[];
  cartAPI?: string;
}

export interface CartFeature {
  feature: string;
  detected: boolean;
  description: string;
}

// Payment gateway detection
export interface PaymentGateway {
  name: string;
  detected: boolean;
  confidence: number;
  apiEndpoint?: string;
  preservationNotes: string[];
  woocommerceSupport: boolean;
  alternativeGateway?: string;
}

// Migration plan
export interface EcommerceMigrationPlan {
  recommendedPlatform: 'woocommerce' | 'shopify' | 'custom';
  complexity: 'simple' | 'moderate' | 'complex' | 'very-complex';
  estimatedTime: string;
  steps: MigrationStep[];
  dataPreservation: DataPreservationNote[];
  risks: string[];
  requirements: string[];
}

export interface MigrationStep {
  order: number;
  title: string;
  description: string;
  estimatedTime: string;
  automated: boolean;
  tools: string[];
}

export interface DataPreservationNote {
  dataType: string;
  canPreserve: boolean;
  method: string;
  notes: string[];
}

// WooCommerce export
export interface WooCommerceProduct {
  name: string;
  type: 'simple' | 'variable' | 'grouped' | 'external';
  regular_price: string;
  description: string;
  short_description: string;
  sku: string;
  manage_stock: boolean;
  stock_quantity: number;
  stock_status: 'instock' | 'outofstock';
  images: Array<{ src: string; name: string }>;
  categories: Array<{ name: string }>;
  tags: Array<{ name: string }>;
  attributes: Array<{
    name: string;
    visible: boolean;
    options: string[];
  }>;
  variations?: WooCommerceVariation[];
}

export interface WooCommerceVariation {
  regular_price: string;
  sku: string;
  stock_quantity: number;
  attributes: Array<{ name: string; option: string }>;
}

class EcommerceDetectionService {
  /**
   * Detect e-commerce functionality
   */
  async detectEcommerce(html: string, url: string): Promise<EcommerceDetectionResult> {
    const $ = cheerio.load(html);

    // Detect platform
    const platform = this.detectPlatform(html, $);

    // Detect products
    const products = this.detectProducts(html, $, url);

    // Detect shopping cart
    const shoppingCart = this.detectShoppingCart(html, $);

    // Detect payment gateways
    const paymentGateways = this.detectPaymentGateways(html);

    // Calculate confidence
    const confidence = this.calculateEcommerceConfidence(
      platform,
      products,
      shoppingCart,
      paymentGateways
    );

    const isEcommerce = confidence > 0.5;

    // Estimate total products
    const estimatedProducts = this.estimateProductCount(products, $);

    // Generate migration plan
    const migrationPlan = this.generateMigrationPlan(
      platform,
      products,
      shoppingCart,
      paymentGateways
    );

    return {
      isEcommerce,
      confidence,
      platform: isEcommerce ? platform : undefined,
      products,
      shoppingCart,
      paymentGateways,
      migrationPlan,
      estimatedProducts,
    };
  }

  /**
   * Detect e-commerce platform
   */
  private detectPlatform(html: string, $: cheerio.CheerioAPI): EcommercePlatform {
    // Shopify detection
    if (
      html.includes('cdn.shopify.com') ||
      html.includes('Shopify.') ||
      html.includes('shopify-analytics') ||
      $('meta[name="shopify"]').length > 0
    ) {
      return 'shopify';
    }

    // WooCommerce detection
    if (
      html.includes('woocommerce') ||
      html.includes('wc-') ||
      $('.woocommerce').length > 0 ||
      $('.product_type_').length > 0
    ) {
      return 'woocommerce';
    }

    // Magento detection
    if (
      html.includes('Magento') ||
      html.includes('magento') ||
      $('body').hasClass('magento')
    ) {
      return 'magento';
    }

    // BigCommerce detection
    if (
      html.includes('bigcommerce') ||
      html.includes('cdn.bcapp.dev')
    ) {
      return 'bigcommerce';
    }

    // Check for custom e-commerce indicators
    const ecommerceIndicators = [
      'add-to-cart',
      'shopping-cart',
      'product-price',
      'buy-now',
      'checkout',
      'cart-item',
    ];

    let indicatorCount = 0;
    ecommerceIndicators.forEach(indicator => {
      if (html.toLowerCase().includes(indicator)) {
        indicatorCount++;
      }
    });

    if (indicatorCount >= 3) {
      return 'custom';
    }

    return 'unknown';
  }

  /**
   * Detect products on page
   */
  private detectProducts(html: string, $: cheerio.CheerioAPI, baseUrl: string): DetectedProduct[] {
    const products: DetectedProduct[] = [];

    // Common product selectors
    const productSelectors = [
      '.product',
      '[itemtype*="schema.org/Product"]',
      '[data-product]',
      '.product-item',
      '.product-card',
      'article.product',
    ];

    productSelectors.forEach(selector => {
      $(selector).each((index, elem) => {
        const $product = $(elem);
        const product = this.extractProductData($product, $, baseUrl, `product-${index}`);
        if (product) {
          products.push(product);
        }
      });
    });

    // Remove duplicates
    return this.deduplicateProducts(products);
  }

  /**
   * Extract product data from element
   */
  private extractProductData(
    $product: cheerio.Cheerio<any>,
    $: cheerio.CheerioAPI,
    baseUrl: string,
    fallbackId: string
  ): DetectedProduct | null {
    // Extract name
    const name =
      $product.find('[itemprop="name"]').first().text().trim() ||
      $product.find('.product-name, .product-title, h1, h2, h3').first().text().trim() ||
      '';

    if (!name) return null;

    // Extract ID
    const id =
      $product.attr('data-product-id') ||
      $product.attr('data-id') ||
      $product.attr('id') ||
      fallbackId;

    // Extract price
    const priceText =
      $product.find('[itemprop="price"]').first().attr('content') ||
      $product.find('.price, .product-price').first().text().trim() ||
      '';

    const { price, currency } = this.parsePrice(priceText);

    // Extract description
    const description =
      $product.find('[itemprop="description"]').first().text().trim() ||
      $product.find('.product-description, .description').first().text().trim() ||
      '';

    // Extract images
    const images: string[] = [];
    $product.find('img[itemprop="image"], .product-image img, img').each((_, img) => {
      const src = $(img).attr('src') || $(img).attr('data-src');
      if (src) {
        images.push(this.resolveUrl(src, baseUrl));
      }
    });

    // Extract SKU
    const sku =
      $product.find('[itemprop="sku"]').first().text().trim() ||
      $product.attr('data-sku') ||
      '';

    // Extract categories
    const categories: string[] = [];
    $product.find('.category, .product-category, [rel="tag"]').each((_, cat) => {
      const text = $(cat).text().trim();
      if (text) categories.push(text);
    });

    // Extract stock status
    const stockText = $product.find('.stock-status, [itemprop="availability"]').text().toLowerCase();
    const inStock =
      stockText.includes('in stock') ||
      stockText.includes('available') ||
      !stockText.includes('out of stock');

    // Extract URL
    const url =
      $product.find('a').first().attr('href') ||
      $product.closest('a').attr('href') ||
      baseUrl;

    return {
      id,
      name,
      price,
      currency,
      description,
      shortDescription: description.substring(0, 200),
      images,
      sku,
      categories,
      tags: [],
      attributes: [],
      variations: [],
      inStock,
      url: this.resolveUrl(url, baseUrl),
      metadata: {},
    };
  }

  /**
   * Parse price from text
   */
  private parsePrice(priceText: string): { price?: number; currency?: string } {
    if (!priceText) return {};

    // Extract currency symbol
    const currencySymbols: Record<string, string> = {
      '$': 'USD',
      '€': 'EUR',
      '£': 'GBP',
      '¥': 'JPY',
      '₹': 'INR',
    };

    let currency: string | undefined;
    for (const [symbol, code] of Object.entries(currencySymbols)) {
      if (priceText.includes(symbol)) {
        currency = code;
        break;
      }
    }

    // Extract price number
    const priceMatch = priceText.match(/[\d,]+\.?\d*/);
    if (priceMatch) {
      const price = parseFloat(priceMatch[0].replace(/,/g, ''));
      return { price, currency };
    }

    return { currency };
  }

  /**
   * Resolve relative URL to absolute
   */
  private resolveUrl(url: string, baseUrl: string): string {
    if (!url) return baseUrl;
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    if (url.startsWith('//')) return 'https:' + url;

    try {
      const base = new URL(baseUrl);
      return new URL(url, base.origin).href;
    } catch {
      return url;
    }
  }

  /**
   * Deduplicate products
   */
  private deduplicateProducts(products: DetectedProduct[]): DetectedProduct[] {
    const seen = new Set<string>();
    return products.filter(product => {
      const key = `${product.name}-${product.sku || product.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /**
   * Detect shopping cart
   */
  private detectShoppingCart(html: string, $: cheerio.CheerioAPI): ShoppingCartDetection {
    const features: CartFeature[] = [];

    // Detect Add to Cart buttons
    const addToCartButtons = $(
      'button:contains("Add to Cart"), ' +
      'button:contains("Add to Bag"), ' +
      '.add-to-cart, ' +
      '[data-action="add-to-cart"]'
    ).length;

    features.push({
      feature: 'Add to Cart',
      detected: addToCartButtons > 0,
      description: `${addToCartButtons} add-to-cart buttons found`,
    });

    // Detect cart page
    const cartPageUrl =
      $('a[href*="/cart"]').first().attr('href') ||
      $('a[href*="/shopping-cart"]').first().attr('href');

    features.push({
      feature: 'Cart Page',
      detected: !!cartPageUrl,
      description: cartPageUrl ? `Cart URL: ${cartPageUrl}` : 'No cart page detected',
    });

    // Detect checkout page
    const checkoutPageUrl =
      $('a[href*="/checkout"]').first().attr('href');

    features.push({
      feature: 'Checkout Page',
      detected: !!checkoutPageUrl,
      description: checkoutPageUrl ? `Checkout URL: ${checkoutPageUrl}` : 'No checkout page detected',
    });

    // Detect cart API
    let cartAPI: string | undefined;
    const apiPatterns = [
      /['"`]([^'"`]*\/api\/cart[^'"`]*)/g,
      /['"`]([^'"`]*\/cart\/add[^'"`]*)/g,
    ];

    apiPatterns.forEach(pattern => {
      const match = html.match(pattern);
      if (match && match[1]) {
        cartAPI = match[1];
      }
    });

    features.push({
      feature: 'Cart API',
      detected: !!cartAPI,
      description: cartAPI ? `API endpoint: ${cartAPI}` : 'No cart API detected',
    });

    // Detect wishlist
    const wishlistButtons = $('button:contains("Wishlist"), .wishlist, [data-wishlist]').length;
    features.push({
      feature: 'Wishlist',
      detected: wishlistButtons > 0,
      description: wishlistButtons > 0 ? 'Wishlist functionality detected' : 'No wishlist',
    });

    // Determine cart type
    let cartType: ShoppingCartDetection['cartType'] = 'unknown';
    if (cartAPI || html.includes('localStorage') && html.includes('cart')) {
      cartType = 'client-side';
    } else if (html.includes('session') && html.includes('cart')) {
      cartType = 'server-side';
    } else if (addToCartButtons > 0) {
      cartType = 'hybrid';
    }

    return {
      detected: addToCartButtons > 0 || !!cartPageUrl,
      cartType,
      addToCartButtons,
      cartPageUrl,
      checkoutPageUrl,
      features,
      cartAPI,
    };
  }

  /**
   * Detect payment gateways
   */
  private detectPaymentGateways(html: string): PaymentGateway[] {
    const gateways: PaymentGateway[] = [];

    const gatewayDetectors = [
      {
        name: 'Stripe',
        patterns: ['stripe', 'js.stripe.com'],
        woocommerceSupport: true,
        alternativeGateway: 'WooCommerce Stripe Gateway',
      },
      {
        name: 'PayPal',
        patterns: ['paypal', 'paypalobjects'],
        woocommerceSupport: true,
        alternativeGateway: 'WooCommerce PayPal Gateway',
      },
      {
        name: 'Square',
        patterns: ['square', 'squareup'],
        woocommerceSupport: true,
        alternativeGateway: 'WooCommerce Square',
      },
      {
        name: 'Authorize.Net',
        patterns: ['authorize.net', 'authorizenet'],
        woocommerceSupport: true,
        alternativeGateway: 'WooCommerce Authorize.Net Gateway',
      },
      {
        name: 'Braintree',
        patterns: ['braintree', 'braintreegateway'],
        woocommerceSupport: true,
        alternativeGateway: 'WooCommerce Braintree',
      },
      {
        name: 'Shopify Payments',
        patterns: ['shopify.checkout', 'shopify-pay'],
        woocommerceSupport: false,
        alternativeGateway: 'Stripe or PayPal recommended',
      },
    ];

    gatewayDetectors.forEach(detector => {
      const detected = detector.patterns.some(pattern =>
        html.toLowerCase().includes(pattern.toLowerCase())
      );

      if (detected) {
        gateways.push({
          name: detector.name,
          detected: true,
          confidence: 0.9,
          preservationNotes: this.getPaymentPreservationNotes(detector.name),
          woocommerceSupport: detector.woocommerceSupport,
          alternativeGateway: detector.alternativeGateway,
        });
      }
    });

    return gateways;
  }

  /**
   * Get payment preservation notes
   */
  private getPaymentPreservationNotes(gateway: string): string[] {
    const notes: Record<string, string[]> = {
      'Stripe': [
        'Stripe API keys must be regenerated in WordPress',
        'Install WooCommerce Stripe Gateway plugin',
        'Test mode recommended for initial setup',
        'Webhook endpoints need to be updated',
      ],
      'PayPal': [
        'PayPal Business account required',
        'Update IPN and webhook URLs in PayPal dashboard',
        'Install WooCommerce PayPal Gateway',
        'Test transactions in sandbox mode first',
      ],
      'Square': [
        'Square account must be linked to WooCommerce',
        'Location settings need reconfiguration',
        'Install WooCommerce Square plugin',
      ],
    };

    return notes[gateway] || ['Manual reconfiguration required', 'Consult gateway documentation'];
  }

  /**
   * Calculate e-commerce confidence
   */
  private calculateEcommerceConfidence(
    platform: EcommercePlatform,
    products: DetectedProduct[],
    cart: ShoppingCartDetection,
    gateways: PaymentGateway[]
  ): number {
    let score = 0;

    if (platform !== 'unknown') score += 0.3;
    if (products.length > 0) score += Math.min(products.length * 0.1, 0.3);
    if (cart.detected) score += 0.3;
    if (gateways.length > 0) score += 0.1;

    return Math.min(score, 1);
  }

  /**
   * Estimate product count
   */
  private estimateProductCount(products: DetectedProduct[], $: cheerio.CheerioAPI): number {
    if (products.length > 0) return products.length;

    // Estimate from pagination
    const paginationText = $('.pagination, .pager').text();
    const pageMatch = paginationText.match(/of (\d+)/);
    if (pageMatch) {
      return parseInt(pageMatch[1]) * 12; // Assume 12 products per page
    }

    return 0;
  }

  /**
   * Generate migration plan
   */
  private generateMigrationPlan(
    platform: EcommercePlatform,
    products: DetectedProduct[],
    cart: ShoppingCartDetection,
    gateways: PaymentGateway[]
  ): EcommerceMigrationPlan {
    const steps: MigrationStep[] = [];
    const dataPreservation: DataPreservationNote[] = [];
    const risks: string[] = [];
    const requirements: string[] = [];

    // Step 1: Install WooCommerce
    steps.push({
      order: 1,
      title: 'Install WooCommerce',
      description: 'Install and configure WooCommerce plugin on WordPress',
      estimatedTime: '30 minutes',
      automated: false,
      tools: ['WordPress Admin', 'WooCommerce Setup Wizard'],
    });

    // Step 2: Export product data
    steps.push({
      order: 2,
      title: 'Export Product Data',
      description: 'Extract product information from source site',
      estimatedTime: `${Math.ceil(products.length / 10)} hours`,
      automated: true,
      tools: ['Website Cloner Pro', 'Product Export Tool'],
    });

    // Step 3: Import products
    steps.push({
      order: 3,
      title: 'Import Products to WooCommerce',
      description: 'Import products using WooCommerce CSV importer',
      estimatedTime: `${Math.ceil(products.length / 20)} hours`,
      automated: true,
      tools: ['WooCommerce Product CSV Importer'],
    });

    // Step 4: Configure payment gateways
    if (gateways.length > 0) {
      steps.push({
        order: 4,
        title: 'Configure Payment Gateways',
        description: `Setup ${gateways.map(g => g.name).join(', ')}`,
        estimatedTime: '1-2 hours',
        automated: false,
        tools: gateways.map(g => g.alternativeGateway || g.name),
      });
    }

    // Data preservation notes
    dataPreservation.push({
      dataType: 'Products',
      canPreserve: true,
      method: 'CSV Export/Import',
      notes: ['Product names, prices, descriptions, images', 'SKU and stock levels', 'Categories and tags'],
    });

    dataPreservation.push({
      dataType: 'Orders',
      canPreserve: platform !== 'custom',
      method: platform === 'shopify' ? 'API Export' : 'Manual Migration',
      notes: ['Historical orders may need manual export', 'Order IDs will change', 'Customer data requires GDPR compliance'],
    });

    dataPreservation.push({
      dataType: 'Customer Accounts',
      canPreserve: false,
      method: 'Manual Re-creation',
      notes: ['Customers need to re-register', 'Passwords cannot be migrated', 'Email notifications recommended'],
    });

    // Risks
    risks.push('Payment gateway reconfiguration required');
    risks.push('Customer accounts cannot be migrated');
    if (platform === 'shopify') {
      risks.push('Shopify-specific features may not transfer');
    }

    // Requirements
    requirements.push('WordPress with WooCommerce installed');
    requirements.push('SSL certificate for secure checkout');
    gateways.forEach(g => {
      requirements.push(`${g.name} account and API credentials`);
    });

    const complexity = this.calculateMigrationComplexity(products.length, gateways.length);
    const estimatedTime = `${steps.reduce((sum, step) => {
      const hours = parseInt(step.estimatedTime);
      return sum + (isNaN(hours) ? 2 : hours);
    }, 0)} hours`;

    return {
      recommendedPlatform: 'woocommerce',
      complexity,
      estimatedTime,
      steps,
      dataPreservation,
      risks,
      requirements,
    };
  }

  /**
   * Calculate migration complexity
   */
  private calculateMigrationComplexity(productCount: number, gatewayCount: number): EcommerceMigrationPlan['complexity'] {
    let score = productCount + (gatewayCount * 10);

    if (score <= 10) return 'simple';
    if (score <= 50) return 'moderate';
    if (score <= 200) return 'complex';
    return 'very-complex';
  }

  /**
   * Convert to WooCommerce product
   */
  convertToWooCommerce(product: DetectedProduct): WooCommerceProduct {
    return {
      name: product.name,
      type: product.variations.length > 0 ? 'variable' : 'simple',
      regular_price: product.price?.toString() || '',
      description: product.description || '',
      short_description: product.shortDescription || '',
      sku: product.sku || '',
      manage_stock: product.stockQuantity !== undefined,
      stock_quantity: product.stockQuantity || 0,
      stock_status: product.inStock ? 'instock' : 'outofstock',
      images: product.images.map((src, index) => ({
        src,
        name: `${product.name}-${index + 1}`,
      })),
      categories: product.categories.map(name => ({ name })),
      tags: product.tags.map(name => ({ name })),
      attributes: product.attributes.map(attr => ({
        name: attr.name,
        visible: attr.visible,
        options: Array.isArray(attr.value) ? attr.value : [attr.value],
      })),
      variations: product.variations.map(v => ({
        regular_price: v.price.toString(),
        sku: v.sku || '',
        stock_quantity: v.stockQuantity || 0,
        attributes: Object.entries(v.attributes).map(([name, option]) => ({
          name,
          option,
        })),
      })),
    };
  }

  /**
   * Generate WooCommerce CSV
   */
  generateWooCommerceCSV(products: DetectedProduct[]): string {
    const headers = [
      'ID', 'Type', 'SKU', 'Name', 'Published', 'Featured', 'Visibility',
      'Short description', 'Description', 'Tax status', 'In stock?', 'Stock',
      'Regular price', 'Categories', 'Tags', 'Images', 'Parent'
    ];

    const rows = products.map(product => {
      const wc = this.convertToWooCommerce(product);
      return [
        product.id,
        wc.type,
        wc.sku,
        wc.name,
        '1',
        '0',
        'visible',
        wc.short_description,
        wc.description,
        'taxable',
        wc.stock_status === 'instock' ? '1' : '0',
        wc.stock_quantity.toString(),
        wc.regular_price,
        wc.categories.map(c => c.name).join('|'),
        wc.tags.map(t => t.name).join('|'),
        wc.images.map(i => i.src).join('|'),
        '',
      ];
    });

    const csvLines = [headers, ...rows].map(row =>
      row.map(cell => `"${cell.toString().replace(/"/g, '""')}"`).join(',')
    );

    return csvLines.join('\n');
  }
}

// Export singleton instance
export default new EcommerceDetectionService();
