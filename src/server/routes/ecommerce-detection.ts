import express from 'express';
import EcommerceDetectionService from '../services/EcommerceDetectionService.js';

const router = express.Router();

/**
 * Detect E-commerce Platform and Products
 * POST /api/ecommerce-detection/detect
 */
router.post('/detect', async (req, res) => {
  try {
    const { html, url } = req.body;

    if (!html) {
      return res.status(400).json({
        success: false,
        error: 'HTML content is required',
      });
    }

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL is required',
      });
    }

    const result = await EcommerceDetectionService.detectEcommerce(html, url);

    res.json({
      success: true,
      detection: result,
    });
  } catch (error) {
    console.error('Failed to detect e-commerce:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to detect e-commerce',
    });
  }
});

/**
 * Get E-commerce Platform Information
 * GET /api/ecommerce-detection/platforms
 */
router.get('/platforms', (req, res) => {
  try {
    const platforms = [
      {
        id: 'shopify',
        name: 'Shopify',
        description: 'Hosted e-commerce platform',
        indicators: ['cdn.shopify.com', 'Shopify.shop', 'shopify-buy'],
        migrationDifficulty: 'hard',
        reason: 'Hosted platform, requires API access for data export',
      },
      {
        id: 'woocommerce',
        name: 'WooCommerce',
        description: 'WordPress e-commerce plugin',
        indicators: ['woocommerce', 'product_type-', 'wc-'],
        migrationDifficulty: 'easy',
        reason: 'WordPress plugin, direct database access available',
      },
      {
        id: 'magento',
        name: 'Magento',
        description: 'Open-source e-commerce platform',
        indicators: ['Magento', 'mage-', 'catalog-product'],
        migrationDifficulty: 'medium',
        reason: 'Complex database structure, API available',
      },
      {
        id: 'bigcommerce',
        name: 'BigCommerce',
        description: 'Hosted e-commerce platform',
        indicators: ['bigcommerce', 'bc-sf-', 'product-grid'],
        migrationDifficulty: 'hard',
        reason: 'Hosted platform, API required for data export',
      },
      {
        id: 'custom',
        name: 'Custom E-commerce',
        description: 'Custom-built shopping cart',
        indicators: ['add-to-cart', 'shopping-cart', 'product-price'],
        migrationDifficulty: 'variable',
        reason: 'Depends on implementation complexity',
      },
    ];

    res.json({
      success: true,
      platforms,
      totalPlatforms: platforms.length,
    });
  } catch (error) {
    console.error('Failed to get platform information:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get platforms',
    });
  }
});

/**
 * Get Payment Gateway Information
 * GET /api/ecommerce-detection/payment-gateways
 */
router.get('/payment-gateways', (req, res) => {
  try {
    const gateways = [
      {
        id: 'stripe',
        name: 'Stripe',
        description: 'Online payment processing',
        indicators: ['stripe.com', 'stripe.js', 'Stripe('],
        supportsWooCommerce: true,
        integrationDifficulty: 'easy',
      },
      {
        id: 'paypal',
        name: 'PayPal',
        description: 'PayPal payment processing',
        indicators: ['paypal.com', 'paypal-button', 'PayPal.Checkout'],
        supportsWooCommerce: true,
        integrationDifficulty: 'easy',
      },
      {
        id: 'square',
        name: 'Square',
        description: 'Square payment processing',
        indicators: ['squareup.com', 'square.js', 'sq-payment'],
        supportsWooCommerce: true,
        integrationDifficulty: 'easy',
      },
      {
        id: 'authorize',
        name: 'Authorize.Net',
        description: 'Payment gateway',
        indicators: ['authorize.net', 'authnet', 'accept.js'],
        supportsWooCommerce: true,
        integrationDifficulty: 'medium',
      },
      {
        id: 'braintree',
        name: 'Braintree',
        description: 'PayPal-owned payment gateway',
        indicators: ['braintree', 'braintree-web', 'bt-dropin'],
        supportsWooCommerce: true,
        integrationDifficulty: 'medium',
      },
      {
        id: 'shopify-payments',
        name: 'Shopify Payments',
        description: 'Shopify native payment processing',
        indicators: ['Shopify.checkout', 'shopify-payment'],
        supportsWooCommerce: false,
        integrationDifficulty: 'hard',
      },
    ];

    res.json({
      success: true,
      gateways,
      totalGateways: gateways.length,
    });
  } catch (error) {
    console.error('Failed to get payment gateway information:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get payment gateways',
    });
  }
});

/**
 * Convert Products to WooCommerce Format
 * POST /api/ecommerce-detection/convert-to-woocommerce
 */
router.post('/convert-to-woocommerce', async (req, res) => {
  try {
    const { html, url } = req.body;

    if (!html) {
      return res.status(400).json({
        success: false,
        error: 'HTML content is required',
      });
    }

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL is required',
      });
    }

    // Detect products first
    const detection = await EcommerceDetectionService.detectEcommerce(html, url);

    if (!detection.isEcommerce) {
      return res.status(400).json({
        success: false,
        error: 'No e-commerce functionality detected',
      });
    }

    // Convert to WooCommerce
    const wooProducts = detection.products.map(product =>
      EcommerceDetectionService.convertToWooCommerce(product)
    );

    res.json({
      success: true,
      products: wooProducts,
      totalProducts: wooProducts.length,
      platform: detection.platform,
    });
  } catch (error) {
    console.error('Failed to convert to WooCommerce:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to convert products',
    });
  }
});

/**
 * Generate WooCommerce CSV Import File
 * POST /api/ecommerce-detection/generate-csv
 */
router.post('/generate-csv', async (req, res) => {
  try {
    const { html, url } = req.body;

    if (!html) {
      return res.status(400).json({
        success: false,
        error: 'HTML content is required',
      });
    }

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL is required',
      });
    }

    // Detect products
    const detection = await EcommerceDetectionService.detectEcommerce(html, url);

    if (!detection.isEcommerce || detection.products.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'No products detected',
      });
    }

    // Generate CSV
    const csv = EcommerceDetectionService.generateWooCommerceCSV(detection.products);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=woocommerce-products.csv');
    res.send(csv);
  } catch (error) {
    console.error('Failed to generate CSV:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate CSV',
    });
  }
});

/**
 * Analyze Shopping Cart Implementation
 * POST /api/ecommerce-detection/analyze-cart
 */
router.post('/analyze-cart', async (req, res) => {
  try {
    const { html, url } = req.body;

    if (!html) {
      return res.status(400).json({
        success: false,
        error: 'HTML content is required',
      });
    }

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL is required',
      });
    }

    const detection = await EcommerceDetectionService.detectEcommerce(html, url);

    if (!detection.isEcommerce) {
      return res.status(400).json({
        success: false,
        error: 'No e-commerce functionality detected',
      });
    }

    res.json({
      success: true,
      cart: detection.shoppingCart,
      recommendations: {
        wooCommerce: {
          cartType: detection.shoppingCart.type,
          needsCustomization: detection.shoppingCart.type === 'custom',
          migrationNotes: detection.shoppingCart.type === 'server-side'
            ? 'Server-side cart detected. WooCommerce uses server-side cart by default.'
            : detection.shoppingCart.type === 'client-side'
            ? 'Client-side cart detected. Consider using WooCommerce REST API for headless setup.'
            : 'Hybrid cart detected. Evaluate which approach to use in WooCommerce.',
        },
      },
    });
  } catch (error) {
    console.error('Failed to analyze cart:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to analyze cart',
    });
  }
});

/**
 * Get Migration Recommendations
 * POST /api/ecommerce-detection/migration-recommendations
 */
router.post('/migration-recommendations', async (req, res) => {
  try {
    const { html, url, targetPlatform = 'woocommerce' } = req.body;

    if (!html) {
      return res.status(400).json({
        success: false,
        error: 'HTML content is required',
      });
    }

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL is required',
      });
    }

    const detection = await EcommerceDetectionService.detectEcommerce(html, url);

    if (!detection.isEcommerce) {
      return res.status(400).json({
        success: false,
        error: 'No e-commerce functionality detected',
      });
    }

    const recommendations = {
      sourcePlatform: detection.platform,
      targetPlatform,
      products: {
        total: detection.products.length,
        canAutoMigrate: detection.products.length > 0,
        migrationMethod: detection.products.length > 0 ? 'csv-import' : 'manual',
        notes: detection.products.length === 0
          ? 'No products detected on this page. Navigate to product pages for detection.'
          : `${detection.products.length} products detected and ready for CSV export.`,
      },
      cart: {
        type: detection.shoppingCart.type,
        complexity: detection.shoppingCart.type === 'custom' ? 'high' : 'low',
        recommendation: detection.shoppingCart.type === 'server-side'
          ? 'Use WooCommerce default cart (server-side)'
          : detection.shoppingCart.type === 'client-side'
          ? 'Consider WooCommerce REST API for headless cart'
          : 'Evaluate cart requirements for WooCommerce setup',
      },
      paymentGateways: {
        detected: detection.paymentGateways.map(g => g.name),
        supported: detection.paymentGateways
          .filter(g => ['stripe', 'paypal', 'square', 'authorize', 'braintree'].includes(g.id))
          .map(g => ({
            name: g.name,
            wooCommercePlugin: `WooCommerce ${g.name}`,
            difficulty: 'easy',
          })),
        manual: detection.paymentGateways
          .filter(g => !['stripe', 'paypal', 'square', 'authorize', 'braintree'].includes(g.id))
          .map(g => ({
            name: g.name,
            note: 'May require custom integration or third-party plugin',
            difficulty: 'medium-hard',
          })),
      },
      steps: [
        {
          step: 1,
          title: 'Export Products',
          action: 'Use /generate-csv endpoint to create WooCommerce CSV',
          status: detection.products.length > 0 ? 'ready' : 'blocked',
        },
        {
          step: 2,
          title: 'Setup WooCommerce',
          action: 'Install WordPress and WooCommerce plugin',
          status: 'manual',
        },
        {
          step: 3,
          title: 'Import Products',
          action: 'Use WooCommerce > Products > Import to upload CSV',
          status: 'ready',
        },
        {
          step: 4,
          title: 'Configure Payment Gateways',
          action: detection.paymentGateways.length > 0
            ? `Install plugins for: ${detection.paymentGateways.map(g => g.name).join(', ')}`
            : 'Configure WooCommerce payment gateways',
          status: detection.paymentGateways.length > 0 ? 'ready' : 'manual',
        },
        {
          step: 5,
          title: 'Test Shopping Cart',
          action: 'Test add-to-cart, checkout, and payment flow',
          status: 'manual',
        },
      ],
      estimatedTime: detection.products.length < 10
        ? '2-4 hours'
        : detection.products.length < 50
        ? '4-8 hours'
        : '1-2 days',
      complexity: detection.platform === 'shopify' || detection.platform === 'bigcommerce'
        ? 'high'
        : detection.platform === 'woocommerce'
        ? 'low'
        : 'medium',
    };

    res.json({
      success: true,
      recommendations,
    });
  } catch (error) {
    console.error('Failed to get migration recommendations:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get recommendations',
    });
  }
});

/**
 * Get Product Schema Information
 * GET /api/ecommerce-detection/product-schema
 */
router.get('/product-schema', (req, res) => {
  try {
    const schema = {
      detectedProduct: {
        id: 'Unique product identifier',
        name: 'Product name',
        price: 'Price as number',
        currency: 'Currency code (USD, EUR, etc.)',
        description: 'Product description',
        images: 'Array of image URLs',
        sku: 'Stock Keeping Unit',
        categories: 'Array of category names',
        attributes: 'Key-value pairs of product attributes',
        variations: 'Array of product variations',
        inStock: 'Boolean stock status',
        url: 'Product page URL',
      },
      wooCommerceProduct: {
        Type: 'simple or variable',
        SKU: 'Stock Keeping Unit',
        Name: 'Product name',
        Published: '1 for published',
        'Short description': 'Brief description',
        Description: 'Full product description',
        'Regular price': 'Product price',
        Categories: 'Comma-separated categories',
        Images: 'Comma-separated image URLs',
        'In stock?': '1 for in stock, 0 for out of stock',
      },
      supportedCurrencies: ['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CNY'],
      productTypes: {
        simple: 'Single product without variations',
        variable: 'Product with variations (size, color, etc.)',
      },
    };

    res.json({
      success: true,
      schema,
    });
  } catch (error) {
    console.error('Failed to get product schema:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get schema',
    });
  }
});

/**
 * Health Check
 * GET /api/ecommerce-detection/health
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'E-commerce Detection Service',
    status: 'operational',
    features: [
      'Platform detection (Shopify, WooCommerce, Magento, BigCommerce)',
      'Product extraction with full details',
      'Shopping cart analysis',
      'Payment gateway detection',
      'WooCommerce conversion',
      'CSV export generation',
      'Migration recommendations',
    ],
    version: '1.0.0',
  });
});

export default router;
