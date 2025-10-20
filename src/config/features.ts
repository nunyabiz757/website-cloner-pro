/**
 * Feature Flag System for Website Cloner Pro
 *
 * Minimal Mode: Only features with lightweight dependencies
 * Full Mode: All features including heavy packages (puppeteer, sharp, lighthouse, etc.)
 *
 * To enable full mode: npm run install:full
 */

export interface FeatureFlags {
  // Core Features (Always Available)
  basicClone: boolean;           // Static HTML cloning via Axios + Cheerio
  cssOptimization: boolean;      // CSS minification, PurgeCSS
  jsOptimization: boolean;       // JS minification via Terser
  htmlOptimization: boolean;     // HTML minification
  wordpressExport: boolean;      // Export to WordPress page builders
  livePreview: boolean;          // Preview cloned sites

  // Advanced Features (Require Heavy Packages)
  advancedClone: boolean;        // Browser automation with Puppeteer
  imageOptimization: boolean;    // Image conversion (WebP/AVIF) with Sharp
  lighthouseAudit: boolean;      // Full Lighthouse performance audits
  database: boolean;             // Persistent storage with Prisma/Mongoose
  payments: boolean;             // Stripe payment processing
  aiSuggestions: boolean;        // Claude AI optimization suggestions
  visualRegression: boolean;     // Visual diff testing with Pixelmatch

  // Optional Integrations
  netlifyDeploy: boolean;        // Deploy to Netlify
  vercelDeploy: boolean;         // Deploy to Vercel
  gohighlevel: boolean;          // GoHighLevel funnel cloning
}

/**
 * Detect available features based on installed packages
 */
function detectAvailableFeatures(): FeatureFlags {
  const features: FeatureFlags = {
    // Core features (lightweight packages)
    basicClone: true,
    cssOptimization: true,
    jsOptimization: true,
    htmlOptimization: true,
    wordpressExport: true,
    livePreview: true,

    // Advanced features (check for heavy packages)
    advancedClone: false,
    imageOptimization: false,
    lighthouseAudit: false,
    database: false,
    payments: false,
    aiSuggestions: false,
    visualRegression: false,

    // Optional integrations
    netlifyDeploy: false,
    vercelDeploy: false,
    gohighlevel: false,
  };

  // Check for heavy packages
  try {
    require.resolve('puppeteer');
    features.advancedClone = true;
  } catch {}

  try {
    require.resolve('sharp');
    features.imageOptimization = true;
  } catch {}

  try {
    require.resolve('lighthouse');
    features.lighthouseAudit = true;
  } catch {}

  try {
    require.resolve('@prisma/client');
    features.database = true;
  } catch {}

  try {
    require.resolve('stripe');
    features.payments = true;
  } catch {}

  try {
    require.resolve('@anthropic-ai/sdk');
    features.aiSuggestions = true;
  } catch {}

  try {
    require.resolve('pixelmatch');
    features.visualRegression = true;
  } catch {}

  try {
    require.resolve('netlify');
    features.netlifyDeploy = true;
  } catch {}

  try {
    require.resolve('@vercel/node');
    features.vercelDeploy = true;
  } catch {}

  return features;
}

/**
 * Global feature flags instance
 */
export const features = detectAvailableFeatures();

/**
 * Check if a feature is enabled
 */
export function isFeatureEnabled(feature: keyof FeatureFlags): boolean {
  return features[feature];
}

/**
 * Get user-friendly feature status
 */
export function getFeatureStatus() {
  const enabledCount = Object.values(features).filter(Boolean).length;
  const totalCount = Object.keys(features).length;
  const mode = features.advancedClone ? 'FULL' : 'MINIMAL';

  return {
    mode,
    enabled: enabledCount,
    total: totalCount,
    percentage: Math.round((enabledCount / totalCount) * 100),
    features,
  };
}

/**
 * Middleware to check feature availability
 */
export function requireFeature(feature: keyof FeatureFlags) {
  return (req: any, res: any, next: any) => {
    if (!features[feature]) {
      return res.status(503).json({
        error: 'Feature not available',
        feature,
        message: `The "${feature}" feature is not available in minimal mode. Please upgrade to full mode by running: npm run install:full`,
        mode: features.advancedClone ? 'full' : 'minimal',
      });
    }
    next();
  };
}

/**
 * Log feature status on startup
 */
export function logFeatureStatus() {
  const status = getFeatureStatus();
  console.log('\n🚀 Website Cloner Pro - Feature Status');
  console.log(`Mode: ${status.mode}`);
  console.log(`Features: ${status.enabled}/${status.total} enabled (${status.percentage}%)\n`);

  console.log('✅ Core Features:');
  if (features.basicClone) console.log('  - Static Website Cloning');
  if (features.cssOptimization) console.log('  - CSS Optimization');
  if (features.jsOptimization) console.log('  - JavaScript Optimization');
  if (features.htmlOptimization) console.log('  - HTML Optimization');
  if (features.wordpressExport) console.log('  - WordPress Export (11 builders)');
  if (features.livePreview) console.log('  - Live Preview');

  if (features.advancedClone || features.imageOptimization || features.lighthouseAudit) {
    console.log('\n⚡ Advanced Features:');
    if (features.advancedClone) console.log('  - JavaScript-Heavy Site Cloning');
    if (features.imageOptimization) console.log('  - Image Format Conversion (WebP/AVIF)');
    if (features.lighthouseAudit) console.log('  - Lighthouse Performance Audits');
    if (features.visualRegression) console.log('  - Visual Regression Testing');
  }

  if (features.database || features.payments || features.aiSuggestions) {
    console.log('\n💼 Enterprise Features:');
    if (features.database) console.log('  - Database Persistence');
    if (features.payments) console.log('  - Payment Processing');
    if (features.aiSuggestions) console.log('  - AI-Powered Suggestions');
  }

  if (!features.advancedClone) {
    console.log('\n⚠️  Running in MINIMAL mode');
    console.log('   To enable all features: npm run install:full\n');
  }
}
