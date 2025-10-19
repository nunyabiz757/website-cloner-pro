/**
 * Page Builder Conversion API Routes
 */

import express from 'express';
import { convertToPageBuilder, convertMultiplePages } from '../services/page-builder/converters/conversion-engine.js';
import fs from 'fs';
import path from 'path';

const router = express.Router();

/**
 * POST /api/page-builder/convert
 * Convert HTML to page builder format
 */
router.post('/convert', async (req, res) => {
  try {
    const {
      html,
      targetBuilder = 'elementor',
      minConfidence = 60,
      fallbackToHTML = true,
    } = req.body;

    if (!html) {
      return res.status(400).json({
        success: false,
        error: 'HTML content is required',
      });
    }

    // Validate builder
    const supportedBuilders = ['elementor', 'gutenberg', 'divi', 'beaver', 'bricks', 'oxygen'];
    if (!supportedBuilders.includes(targetBuilder)) {
      return res.status(400).json({
        success: false,
        error: `Unsupported builder: ${targetBuilder}. Supported: ${supportedBuilders.join(', ')}`,
      });
    }

    // MVP: Only Elementor supported
    if (targetBuilder !== 'elementor') {
      return res.status(400).json({
        success: false,
        error: 'MVP currently supports Elementor only. Other builders coming soon!',
      });
    }

    console.log(`Converting HTML to ${targetBuilder}...`);

    const result = await convertToPageBuilder(html, {
      targetBuilder,
      minConfidence,
      fallbackToHTML,
    });

    res.json({
      success: result.success,
      builder: result.builder,
      exportData: result.exportData,
      stats: result.stats,
      validation: result.validation,
      fallbacks: result.fallbacks,
      componentsSummary: {
        total: result.components.length,
        byType: summarizeByType(result.components),
      },
    });
  } catch (error) {
    console.error('Conversion error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Conversion failed',
    });
  }
});

/**
 * POST /api/page-builder/convert-page
 * Convert a specific page from crawl results
 */
router.post('/convert-page', async (req, res) => {
  try {
    const { crawlId, pageIndex, targetBuilder = 'elementor' } = req.body;

    if (!crawlId) {
      return res.status(400).json({
        success: false,
        error: 'Crawl ID is required',
      });
    }

    if (pageIndex === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Page index is required',
      });
    }

    // Load crawl metadata
    const crawlPath = path.join(process.cwd(), 'crawled-sites', crawlId);
    const metadataPath = path.join(crawlPath, 'metadata.json');

    if (!fs.existsSync(metadataPath)) {
      return res.status(404).json({
        success: false,
        error: `Crawl ${crawlId} not found`,
      });
    }

    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));

    if (pageIndex < 0 || pageIndex >= metadata.pages.length) {
      return res.status(400).json({
        success: false,
        error: `Invalid page index. Valid range: 0-${metadata.pages.length - 1}`,
      });
    }

    // Load page HTML
    const pageInfo = metadata.pages[pageIndex];
    const pagePath = path.join(crawlPath, 'pages', pageInfo.filename);

    if (!fs.existsSync(pagePath)) {
      return res.status(404).json({
        success: false,
        error: `Page file not found: ${pageInfo.filename}`,
      });
    }

    const html = fs.readFileSync(pagePath, 'utf-8');

    console.log(`Converting page ${pageIndex} (${pageInfo.title}) to ${targetBuilder}...`);

    const result = await convertToPageBuilder(html, {
      targetBuilder,
    });

    // Save export alongside page
    const exportFilename = pageInfo.filename.replace('.html', `_${targetBuilder}.json`);
    const exportPath = path.join(crawlPath, 'exports', exportFilename);

    await fs.promises.mkdir(path.join(crawlPath, 'exports'), { recursive: true });
    fs.writeFileSync(exportPath, JSON.stringify(result.exportData, null, 2), 'utf-8');

    res.json({
      success: result.success,
      builder: result.builder,
      exportData: result.exportData,
      exportPath,
      stats: result.stats,
      validation: result.validation,
      pageInfo: {
        index: pageIndex,
        title: pageInfo.title,
        url: pageInfo.url,
      },
    });
  } catch (error) {
    console.error('Page conversion error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Page conversion failed',
    });
  }
});

/**
 * POST /api/page-builder/convert-crawl
 * Convert all pages from a crawl to page builder format
 */
router.post('/convert-crawl', async (req, res) => {
  try {
    const { crawlId, targetBuilder = 'elementor', pageIndices } = req.body;

    if (!crawlId) {
      return res.status(400).json({
        success: false,
        error: 'Crawl ID is required',
      });
    }

    // Load crawl metadata
    const crawlPath = path.join(process.cwd(), 'crawled-sites', crawlId);
    const metadataPath = path.join(crawlPath, 'metadata.json');

    if (!fs.existsSync(metadataPath)) {
      return res.status(404).json({
        success: false,
        error: `Crawl ${crawlId} not found`,
      });
    }

    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));

    // Determine which pages to convert
    const indicesToConvert = pageIndices || metadata.pages.map((_: any, i: number) => i);

    console.log(`Converting ${indicesToConvert.length} pages to ${targetBuilder}...`);

    const pagesToConvert = [];

    for (const index of indicesToConvert) {
      const pageInfo = metadata.pages[index];
      const pagePath = path.join(crawlPath, 'pages', pageInfo.filename);

      if (fs.existsSync(pagePath)) {
        const html = fs.readFileSync(pagePath, 'utf-8');
        pagesToConvert.push({
          html,
          title: pageInfo.title,
        });
      }
    }

    const results = await convertMultiplePages(pagesToConvert, {
      targetBuilder,
    });

    // Save exports
    await fs.promises.mkdir(path.join(crawlPath, 'exports'), { recursive: true });

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const index = indicesToConvert[i];
      const pageInfo = metadata.pages[index];
      const exportFilename = pageInfo.filename.replace('.html', `_${targetBuilder}.json`);
      const exportPath = path.join(crawlPath, 'exports', exportFilename);

      fs.writeFileSync(exportPath, JSON.stringify(result.exportData, null, 2), 'utf-8');
    }

    // Calculate aggregate stats
    const totalStats = results.reduce(
      (acc, r) => ({
        totalElements: acc.totalElements + r.stats.totalElements,
        recognizedComponents: acc.recognizedComponents + r.stats.recognizedComponents,
        nativeWidgets: acc.nativeWidgets + r.stats.nativeWidgets,
        htmlFallbacks: acc.htmlFallbacks + r.stats.htmlFallbacks,
        manualReview: acc.manualReview + r.stats.manualReview,
        conversionTime: acc.conversionTime + r.stats.conversionTime,
        confidenceAverage:
          acc.confidenceAverage + r.stats.confidenceAverage / results.length,
      }),
      {
        totalElements: 0,
        recognizedComponents: 0,
        nativeWidgets: 0,
        htmlFallbacks: 0,
        manualReview: 0,
        conversionTime: 0,
        confidenceAverage: 0,
      }
    );

    res.json({
      success: true,
      builder: targetBuilder,
      pagesConverted: results.length,
      stats: totalStats,
      results: results.map((r, i) => ({
        pageIndex: indicesToConvert[i],
        title: pagesToConvert[i].title,
        success: r.success,
        stats: r.stats,
        validation: r.validation,
      })),
    });
  } catch (error) {
    console.error('Crawl conversion error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Crawl conversion failed',
    });
  }
});

/**
 * GET /api/page-builder/export/:crawlId/:pageIndex
 * Download exported page builder JSON
 */
router.get('/export/:crawlId/:pageIndex/:builder?', async (req, res) => {
  try {
    const { crawlId, pageIndex, builder = 'elementor' } = req.params;

    const crawlPath = path.join(process.cwd(), 'crawled-sites', crawlId);
    const metadataPath = path.join(crawlPath, 'metadata.json');

    if (!fs.existsSync(metadataPath)) {
      return res.status(404).json({
        success: false,
        error: 'Crawl not found',
      });
    }

    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
    const index = parseInt(pageIndex);

    if (isNaN(index) || index < 0 || index >= metadata.pages.length) {
      return res.status(400).json({
        success: false,
        error: 'Invalid page index',
      });
    }

    const pageInfo = metadata.pages[index];
    const exportFilename = pageInfo.filename.replace('.html', `_${builder}.json`);
    const exportPath = path.join(crawlPath, 'exports', exportFilename);

    if (!fs.existsSync(exportPath)) {
      return res.status(404).json({
        success: false,
        error: 'Export not found. Convert the page first.',
      });
    }

    const exportData = fs.readFileSync(exportPath, 'utf-8');

    res.setHeader('Content-Type', 'application/json');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${pageInfo.title.replace(/[^a-z0-9]/gi, '_')}_${builder}.json"`
    );
    res.send(exportData);
  } catch (error) {
    console.error('Export download error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Export download failed',
    });
  }
});

/**
 * Helper: Summarize components by type
 */
function summarizeByType(components: any[]): Record<string, number> {
  const summary: Record<string, number> = {};

  for (const comp of components) {
    const type = comp.componentType;
    summary[type] = (summary[type] || 0) + 1;
  }

  return summary;
}

export default router;
