import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Feature flags and minimal services
import { logFeatureStatus, features } from '../config/features.js';
import { getStore, shutdownStore } from './services/InMemoryStore.js';

// Routes
import cloneRoutes from './routes/clone.js';
import performanceRoutes from './routes/performance.js';
import optimizationRoutes from './routes/optimization.js';
import deploymentRoutes from './routes/deployment.js';
import exportRoutes from './routes/export.js';
import aiRoutes from './routes/ai.js';
import visualRegressionRoutes from './routes/visual-regression.js';
import elementSelectorRoutes from './routes/element-selector.js';
import authRoutes from './routes/auth.js';
import projectRoutes from './routes/projects.js';
import fileUploadRoutes from './routes/file-upload.js';
import multiPageCrawlerRoutes from './routes/multi-page-crawler.js';
import wordpressExportRoutes from './routes/wordpress-export.js';
import analysisRoutes from './routes/analysis.js';
import performanceAuditRoutes from './routes/performance-audit.js';
import previewRoutes, { previewRouter } from './routes/preview.js';
import conversionRoutes from './routes/conversion.js';
import collaborationRoutes from './routes/collaboration.js';
import pluginVerificationRoutes from './routes/plugin-verification.js';
import performanceFixRoutes from './routes/performance-fix.js';
import criticalCSSRoutes from './routes/critical-css.js';
import assetEmbeddingRoutes from './routes/asset-embedding.js';
import assetsRoutes from './routes/assets.js';
import performanceBudgetRoutes from './routes/performance-budget.js';
import importHelperRoutes from './routes/import-helper.js';
import liveMonitoringRoutes from './routes/live-monitoring.js';
import exportPackageRoutes from './routes/export-package.js';
import multiLanguageRoutes from './routes/multi-language.js';
import dynamicContentRoutes from './routes/dynamic-content.js';
import wordpressPluginGeneratorRoutes from './routes/wordpress-plugin-generator.js';
import cachingStrategyRoutes from './routes/caching-strategy.js';
import formHandlingRoutes from './routes/form-handling.js';
import ecommerceDetectionRoutes from './routes/ecommerce-detection.js';
import legalComplianceRoutes from './routes/legal-compliance.js';
import animationHandlingRoutes from './routes/animation-handling.js';
import customDomainPreviewRoutes from './routes/custom-domain-preview.js';
import themeJsonGenerationRoutes from './routes/theme-json-generation.js';
import creditsRoutes from './routes/credits.routes.js';
import ghlRoutes from './routes/ghl.routes.js';
import templatesRoutes from './routes/templates.routes.js';
import templateVersioningRoutes from './routes/template-versioning.routes.js';
import analyticsRoutes from './routes/analytics.routes.js';
import approvalWorkflowsRoutes from './routes/approval-workflows.routes.js';
import advancedAnalyticsRoutes from './routes/advanced-analytics.routes.js';
import marketplaceRoutes from './routes/marketplace.routes.js';
import publicApiRoutes from './routes/public-api.routes.js';
import billingRoutes from './routes/billing.routes.js';
import templateMonetizationRoutes from './routes/template-monetization.routes.js';
import phase4bRoutes from './routes/phase4b.routes.js';
import abTestingRoutes from './routes/ab-testing.routes.js';
import pageBuilderRoutes from './routes/page-builder.js';
import wordpressIntegrationRoutes from './routes/wordpress-integration.js';
import optimizationPipelineRoutes from './routes/optimization-pipeline.js';
import ghlPasteRoutes from './routes/ghl-paste.js';

// Job Scheduler
import { initializeScheduler, shutdownScheduler } from './jobs/scheduler.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static files for uploads and temp directories
app.use('/uploads', express.static(path.join(__dirname, '../../uploads')));
app.use('/temp', express.static(path.join(__dirname, '../../temp')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/clone', cloneRoutes);
app.use('/api/performance', performanceRoutes);
app.use('/api/optimization', optimizationRoutes);
app.use('/api/deployment', deploymentRoutes);
app.use('/api/export', exportRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/visual-regression', visualRegressionRoutes);
app.use('/api/element-selector', elementSelectorRoutes);
app.use('/api/file-upload', fileUploadRoutes);
app.use('/api/multi-page-crawler', multiPageCrawlerRoutes);
app.use('/api/wordpress-export', wordpressExportRoutes);
app.use('/api/analysis', analysisRoutes);
app.use('/api/performance-audit', performanceAuditRoutes);
app.use('/api/preview', previewRoutes);
app.use('/preview', previewRouter);
app.use('/api/conversion', conversionRoutes);
app.use('/api/collaboration', collaborationRoutes);
app.use('/api/plugin-verification', pluginVerificationRoutes);
app.use('/api/performance-fix', performanceFixRoutes);
app.use('/api/critical-css', criticalCSSRoutes);
app.use('/api/asset-embedding', assetEmbeddingRoutes);
app.use('/api/assets', assetsRoutes);
app.use('/api/performance-budget', performanceBudgetRoutes);
app.use('/api/import-helper', importHelperRoutes);
app.use('/api/live-monitoring', liveMonitoringRoutes);
app.use('/api/export-package', exportPackageRoutes);
app.use('/api/multi-language', multiLanguageRoutes);
app.use('/api/dynamic-content', dynamicContentRoutes);
app.use('/api/wordpress-plugin-generator', wordpressPluginGeneratorRoutes);
app.use('/api/caching-strategy', cachingStrategyRoutes);
app.use('/api/form-handling', formHandlingRoutes);
app.use('/api/ecommerce-detection', ecommerceDetectionRoutes);
app.use('/api/legal-compliance', legalComplianceRoutes);
app.use('/api/animation-handling', animationHandlingRoutes);
app.use('/api/custom-domain-preview', customDomainPreviewRoutes);
app.use('/api/theme-json-generation', themeJsonGenerationRoutes);
app.use('/api/credits', creditsRoutes);
app.use('/api/ghl', ghlRoutes);
app.use('/api/templates', templatesRoutes);
app.use('/api/templates', templateVersioningRoutes); // Version routes nested under /api/templates/:id/versions
app.use('/api/analytics', analyticsRoutes);
app.use('/api/workflows', approvalWorkflowsRoutes); // Approval workflows system
app.use('/api/advanced-analytics', advancedAnalyticsRoutes); // Advanced analytics and reporting
app.use('/api/marketplace', marketplaceRoutes); // White-label marketplace
app.use('/api/public-api', publicApiRoutes); // Public API & Webhooks
app.use('/api/billing', billingRoutes); // Monetization & Subscriptions
app.use('/api/template-monetization', templateMonetizationRoutes); // Template Monetization & Affiliates
app.use('/api/phase4b', phase4bRoutes); // Bulk Operations, Export/Import, Scheduling
app.use('/api/ab-tests', abTestingRoutes); // A/B Testing System (Phase 4C)
app.use('/api/page-builder', pageBuilderRoutes); // Page Builder Conversion (Elementor, Gutenberg, etc.)
app.use('/api/wordpress', wordpressIntegrationRoutes); // WordPress Integration & Template Import
app.use('/api/optimization-pipeline', optimizationPipelineRoutes); // Performance Optimization Export Pipeline
app.use('/api/ghl-paste', ghlPasteRoutes); // GHL Paste Web App

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({
    success: false,
    error: err.message || 'Internal server error',
  });
});

app.listen(PORT, async () => {
  console.log(`\n🚀 Server running on http://localhost:${PORT}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);

  // Log feature status
  logFeatureStatus();

  // Initialize in-memory store (minimal mode)
  if (!features.database) {
    const store = getStore();
    console.log('💾 In-memory store initialized (minimal mode)');
    console.log('   Data will be persisted to ./data directory');
  }

  // Initialize background job scheduler
  try {
    await initializeScheduler();
    console.log('⏰ Background job scheduler initialized');
  } catch (error) {
    console.error('❌ Failed to initialize job scheduler:', error);
  }

  console.log(`\n✅ Ready! Open http://localhost:${PORT} in your browser\n`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down server...');
  await shutdownScheduler();
  await shutdownStore();
  console.log('✅ Shutdown complete');
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Shutting down server...');
  await shutdownScheduler();
  await shutdownStore();
  console.log('✅ Shutdown complete');
  process.exit(0);
});

export default app;
