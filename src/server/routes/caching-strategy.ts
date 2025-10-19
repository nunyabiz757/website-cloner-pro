import express from 'express';
import CachingStrategyService from '../services/CachingStrategyService.js';

const router = express.Router();

/**
 * Generate Service Worker
 * POST /api/caching-strategy/service-worker
 */
router.post('/service-worker', (req, res) => {
  try {
    const config = req.body;

    if (!config.cacheName || !config.version) {
      return res.status(400).json({
        success: false,
        error: 'Cache name and version are required',
      });
    }

    const result = CachingStrategyService.generateServiceWorker(config);

    res.json({
      success: true,
      serviceWorker: result,
    });
  } catch (error) {
    console.error('Failed to generate service worker:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate service worker',
    });
  }
});

/**
 * Generate PWA Manifest
 * POST /api/caching-strategy/pwa-manifest
 */
router.post('/pwa-manifest', (req, res) => {
  try {
    const config = req.body;

    if (!config.name || !config.shortName) {
      return res.status(400).json({
        success: false,
        error: 'Name and short name are required',
      });
    }

    const manifest = CachingStrategyService.generatePWAManifest(config);

    res.json({
      success: true,
      manifest: JSON.parse(manifest),
      manifestString: manifest,
    });
  } catch (error) {
    console.error('Failed to generate PWA manifest:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate manifest',
    });
  }
});

/**
 * Generate CDN Configuration
 * POST /api/caching-strategy/cdn-config
 */
router.post('/cdn-config', (req, res) => {
  try {
    const config = req.body;

    if (!config.provider || !config.cacheRules) {
      return res.status(400).json({
        success: false,
        error: 'Provider and cache rules are required',
      });
    }

    const cdnConfig = CachingStrategyService.generateCDNConfig(config);

    res.json({
      success: true,
      cdnConfig,
    });
  } catch (error) {
    console.error('Failed to generate CDN config:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate CDN config',
    });
  }
});

/**
 * Get caching strategy recommendations
 * POST /api/caching-strategy/recommendations
 */
router.post('/recommendations', (req, res) => {
  try {
    const { assetTypes, targetAudience, performanceGoal } = req.body;

    const recommendations = {
      serviceWorker: {
        recommended: true,
        strategy: 'stale-while-revalidate',
        reason: 'Provides good balance between freshness and performance',
      },
      assetStrategies: [
        {
          type: 'html',
          strategy: 'network-first',
          cacheTTL: 3600,
          reason: 'HTML should be fresh, but cached as fallback',
        },
        {
          type: 'css',
          strategy: 'cache-first',
          cacheTTL: 604800,
          reason: 'CSS changes infrequently, can be cached aggressively',
        },
        {
          type: 'js',
          strategy: 'cache-first',
          cacheTTL: 604800,
          reason: 'JavaScript changes infrequently',
        },
        {
          type: 'images',
          strategy: 'cache-first',
          cacheTTL: 2592000,
          reason: 'Images rarely change, long cache is safe',
        },
        {
          type: 'fonts',
          strategy: 'cache-first',
          cacheTTL: 31536000,
          reason: 'Fonts almost never change, cache for 1 year',
        },
      ],
      cdn: {
        recommended: performanceGoal === 'maximum',
        provider: 'cloudflare',
        reason: 'Free tier available with good global coverage',
      },
      pwa: {
        recommended: targetAudience === 'mobile',
        features: ['offline-support', 'install-prompt', 'push-notifications'],
      },
    };

    res.json({
      success: true,
      recommendations,
    });
  } catch (error) {
    console.error('Failed to get recommendations:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get recommendations',
    });
  }
});

/**
 * Generate complete caching solution
 * POST /api/caching-strategy/complete-solution
 */
router.post('/complete-solution', (req, res) => {
  try {
    const { siteName, assets, offlinePages, cdnProvider } = req.body;

    if (!siteName) {
      return res.status(400).json({
        success: false,
        error: 'Site name is required',
      });
    }

    // Generate Service Worker
    const swConfig = {
      cacheName: siteName.toLowerCase().replace(/\s+/g, '-'),
      version: '1.0.0',
      cacheStrategy: 'stale-while-revalidate' as const,
      assets: assets || [
        { pattern: '/', strategy: 'network-first' as const },
        { pattern: '/css/', strategy: 'cache-first' as const, maxAgeSeconds: 604800 },
        { pattern: '/js/', strategy: 'cache-first' as const, maxAgeSeconds: 604800 },
        { pattern: '/images/', strategy: 'cache-first' as const, maxAgeSeconds: 2592000 },
      ],
      runtimeCaching: [],
      offlinePages: offlinePages || ['/offline.html'],
      skipWaiting: true,
      clientsClaim: true,
    };

    const serviceWorker = CachingStrategyService.generateServiceWorker(swConfig);

    // Generate PWA Manifest
    const pwaConfig = {
      name: siteName,
      shortName: siteName,
      description: `${siteName} - Progressive Web App`,
      themeColor: '#ffffff',
      backgroundColor: '#ffffff',
      display: 'standalone' as const,
      orientation: 'any' as const,
      startUrl: '/',
      scope: '/',
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
    };

    const manifest = CachingStrategyService.generatePWAManifest(pwaConfig);

    // Generate CDN Config (if requested)
    let cdnConfig = null;
    if (cdnProvider) {
      const cdnConfigInput = {
        provider: cdnProvider,
        cacheRules: [
          { urlPattern: '/*.html', cacheTTL: 3600 },
          { urlPattern: '/*.css', cacheTTL: 604800 },
          { urlPattern: '/*.js', cacheTTL: 604800 },
          { urlPattern: '/*.jpg', cacheTTL: 2592000 },
          { urlPattern: '/*.png', cacheTTL: 2592000 },
        ],
        compression: true,
        ssl: true,
      };
      cdnConfig = CachingStrategyService.generateCDNConfig(cdnConfigInput);
    }

    res.json({
      success: true,
      solution: {
        serviceWorker,
        manifest: JSON.parse(manifest),
        cdnConfig,
        implementation: {
          steps: [
            '1. Add service-worker.js to your root directory',
            '2. Add manifest.json to your root directory',
            '3. Add registration code to your HTML',
            '4. Add manifest link to HTML: <link rel="manifest" href="/manifest.json">',
            cdnProvider ? '5. Configure CDN using provided files' : '',
          ].filter(Boolean),
        },
      },
    });
  } catch (error) {
    console.error('Failed to generate complete solution:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate solution',
    });
  }
});

export default router;
