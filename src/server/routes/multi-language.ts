import express from 'express';
import MultiLanguageService from '../services/MultiLanguageService.js';

const router = express.Router();

/**
 * Detect languages from HTML content
 * POST /api/multi-language/detect
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

    const detection = await MultiLanguageService.detectLanguages(
      html,
      url || 'https://example.com'
    );

    res.json({
      success: true,
      detection,
    });
  } catch (error) {
    console.error('Failed to detect languages:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to detect languages',
    });
  }
});

/**
 * Detect WordPress translation plugins
 * POST /api/multi-language/detect-plugins
 */
router.post('/detect-plugins', (req, res) => {
  try {
    const { html } = req.body;

    if (!html) {
      return res.status(400).json({
        success: false,
        error: 'HTML content is required',
      });
    }

    const pluginDetection = MultiLanguageService.detectWordPressPlugins(html);

    res.json({
      success: true,
      pluginDetection,
    });
  } catch (error) {
    console.error('Failed to detect plugins:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to detect plugins',
    });
  }
});

/**
 * Analyze hreflang tags
 * POST /api/multi-language/analyze-hreflang
 */
router.post('/analyze-hreflang', (req, res) => {
  try {
    const { html, url } = req.body;

    if (!html || !url) {
      return res.status(400).json({
        success: false,
        error: 'HTML content and URL are required',
      });
    }

    const analysis = MultiLanguageService.analyzeHreflangTags(html, url);

    res.json({
      success: true,
      analysis,
    });
  } catch (error) {
    console.error('Failed to analyze hreflang tags:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to analyze hreflang',
    });
  }
});

/**
 * Extract language-specific assets
 * POST /api/multi-language/extract-assets
 */
router.post('/extract-assets', (req, res) => {
  try {
    const { html, language } = req.body;

    if (!html || !language) {
      return res.status(400).json({
        success: false,
        error: 'HTML content and language are required',
      });
    }

    const assets = MultiLanguageService.extractLanguageAssets(html, language);

    res.json({
      success: true,
      assets,
    });
  } catch (error) {
    console.error('Failed to extract assets:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to extract assets',
    });
  }
});

/**
 * Create translation mapping
 * POST /api/multi-language/create-mapping
 */
router.post('/create-mapping', (req, res) => {
  try {
    const { html, sourceUrl, sourceLanguage } = req.body;

    if (!html || !sourceUrl || !sourceLanguage) {
      return res.status(400).json({
        success: false,
        error: 'HTML content, source URL, and source language are required',
      });
    }

    const mapping = MultiLanguageService.createTranslationMapping(
      html,
      sourceUrl,
      sourceLanguage
    );

    res.json({
      success: true,
      mapping,
    });
  } catch (error) {
    console.error('Failed to create mapping:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create mapping',
    });
  }
});

/**
 * Generate language switcher HTML
 * POST /api/multi-language/generate-switcher
 */
router.post('/generate-switcher', (req, res) => {
  try {
    const { languages, currentLanguage, translationMapping } = req.body;

    if (!languages || !currentLanguage || !translationMapping) {
      return res.status(400).json({
        success: false,
        error: 'Languages, current language, and translation mapping are required',
      });
    }

    const switcherHTML = MultiLanguageService.generateLanguageSwitcher(
      languages,
      currentLanguage,
      translationMapping
    );

    res.json({
      success: true,
      switcherHTML,
    });
  } catch (error) {
    console.error('Failed to generate switcher:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate switcher',
    });
  }
});

/**
 * Preserve hreflang tags in HTML
 * POST /api/multi-language/preserve-hreflang
 */
router.post('/preserve-hreflang', (req, res) => {
  try {
    const { html, translationMappings } = req.body;

    if (!html || !translationMappings) {
      return res.status(400).json({
        success: false,
        error: 'HTML content and translation mappings are required',
      });
    }

    const updatedHTML = MultiLanguageService.preserveHreflangTags(
      html,
      translationMappings
    );

    res.json({
      success: true,
      html: updatedHTML,
    });
  } catch (error) {
    console.error('Failed to preserve hreflang tags:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to preserve hreflang',
    });
  }
});

/**
 * Export multi-language website
 * POST /api/multi-language/export
 */
router.post('/export', async (req, res) => {
  try {
    const { pages, config } = req.body;

    if (!pages || !Array.isArray(pages)) {
      return res.status(400).json({
        success: false,
        error: 'Pages array is required',
      });
    }

    if (!config) {
      return res.status(400).json({
        success: false,
        error: 'Export configuration is required',
      });
    }

    const exportResult = await MultiLanguageService.exportMultiLanguage(pages, config);

    res.json({
      success: true,
      export: exportResult,
    });
  } catch (error) {
    console.error('Failed to export multi-language website:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to export',
    });
  }
});

/**
 * Generate WPML import configuration
 * POST /api/multi-language/wpml-config
 */
router.post('/wpml-config', (req, res) => {
  try {
    const { exportResult } = req.body;

    if (!exportResult) {
      return res.status(400).json({
        success: false,
        error: 'Export result is required',
      });
    }

    const config = MultiLanguageService.generateWPMLImportConfig(exportResult);

    res.json({
      success: true,
      config: JSON.parse(config),
      configString: config,
    });
  } catch (error) {
    console.error('Failed to generate WPML config:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate WPML config',
    });
  }
});

/**
 * Generate Polylang import configuration
 * POST /api/multi-language/polylang-config
 */
router.post('/polylang-config', (req, res) => {
  try {
    const { exportResult } = req.body;

    if (!exportResult) {
      return res.status(400).json({
        success: false,
        error: 'Export result is required',
      });
    }

    const config = MultiLanguageService.generatePolylangImportConfig(exportResult);

    res.json({
      success: true,
      config: JSON.parse(config),
      configString: config,
    });
  } catch (error) {
    console.error('Failed to generate Polylang config:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate Polylang config',
    });
  }
});

/**
 * Comprehensive multi-language analysis
 * POST /api/multi-language/analyze
 */
router.post('/analyze', async (req, res) => {
  try {
    const { html, url } = req.body;

    if (!html) {
      return res.status(400).json({
        success: false,
        error: 'HTML content is required',
      });
    }

    const currentUrl = url || 'https://example.com';

    // Perform comprehensive analysis
    const languageDetection = await MultiLanguageService.detectLanguages(html, currentUrl);
    const pluginDetection = MultiLanguageService.detectWordPressPlugins(html);
    const hreflangAnalysis = MultiLanguageService.analyzeHreflangTags(html, currentUrl);

    // Extract assets for each detected language
    const languageAssets = languageDetection.detectedLanguages.map(lang =>
      MultiLanguageService.extractLanguageAssets(html, lang.fullCode)
    );

    // Create translation mappings if hreflang exists
    const translationMapping = hreflangAnalysis.hasHreflang
      ? MultiLanguageService.createTranslationMapping(
          html,
          currentUrl,
          languageDetection.primaryLanguage
        )
      : null;

    res.json({
      success: true,
      analysis: {
        languageDetection,
        pluginDetection,
        hreflangAnalysis,
        languageAssets,
        translationMapping,
        recommendations: generateRecommendations(
          languageDetection,
          pluginDetection,
          hreflangAnalysis
        ),
      },
    });
  } catch (error) {
    console.error('Failed to analyze multi-language content:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to analyze',
    });
  }
});

/**
 * Validate multi-language configuration
 * POST /api/multi-language/validate
 */
router.post('/validate', async (req, res) => {
  try {
    const { pages } = req.body;

    if (!pages || !Array.isArray(pages)) {
      return res.status(400).json({
        success: false,
        error: 'Pages array is required',
      });
    }

    const validationResults = {
      isValid: true,
      errors: [] as string[],
      warnings: [] as string[],
      recommendations: [] as string[],
      pageValidations: [] as any[],
    };

    // Validate each page
    for (const page of pages) {
      const detection = await MultiLanguageService.detectLanguages(page.html, page.url);
      const hreflangAnalysis = MultiLanguageService.analyzeHreflangTags(page.html, page.url);

      const pageValidation = {
        url: page.url,
        language: detection.primaryLanguage,
        hasMultiLanguage: detection.hasMultiLanguage,
        hreflangValid: hreflangAnalysis.isValid,
        errors: hreflangAnalysis.errors,
        warnings: hreflangAnalysis.warnings,
      };

      validationResults.pageValidations.push(pageValidation);

      // Aggregate errors
      if (hreflangAnalysis.errors.length > 0) {
        validationResults.isValid = false;
        validationResults.errors.push(...hreflangAnalysis.errors.map(e => `${page.url}: ${e}`));
      }

      // Aggregate warnings
      if (hreflangAnalysis.warnings.length > 0) {
        validationResults.warnings.push(...hreflangAnalysis.warnings.map(w => `${page.url}: ${w}`));
      }
    }

    // Cross-page validation: Check reciprocal links
    const hreflangLinks = new Map<string, Set<string>>();
    for (const page of pages) {
      const analysis = MultiLanguageService.analyzeHreflangTags(page.html, page.url);
      analysis.tags.forEach(tag => {
        if (!hreflangLinks.has(tag.lang)) {
          hreflangLinks.set(tag.lang, new Set());
        }
        hreflangLinks.get(tag.lang)!.add(page.url);
      });
    }

    // Check if all hreflang links are reciprocal
    hreflangLinks.forEach((urls, lang) => {
      if (urls.size < pages.length && pages.length > 1) {
        validationResults.warnings.push(
          `Language "${lang}" is not referenced from all pages (found in ${urls.size}/${pages.length} pages)`
        );
      }
    });

    res.json({
      success: true,
      validation: validationResults,
    });
  } catch (error) {
    console.error('Failed to validate multi-language configuration:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to validate',
    });
  }
});

/**
 * Get supported languages list
 * GET /api/multi-language/languages
 */
router.get('/languages', (req, res) => {
  try {
    const languages = [
      { code: 'en', name: 'English', regions: ['US', 'GB', 'AU', 'CA'] },
      { code: 'es', name: 'Spanish', regions: ['ES', 'MX', 'AR', 'CO'] },
      { code: 'fr', name: 'French', regions: ['FR', 'CA', 'BE', 'CH'] },
      { code: 'de', name: 'German', regions: ['DE', 'AT', 'CH'] },
      { code: 'it', name: 'Italian', regions: ['IT', 'CH'] },
      { code: 'pt', name: 'Portuguese', regions: ['PT', 'BR'] },
      { code: 'ru', name: 'Russian', regions: ['RU'] },
      { code: 'ja', name: 'Japanese', regions: ['JP'] },
      { code: 'zh', name: 'Chinese', regions: ['CN', 'TW', 'HK'] },
      { code: 'ko', name: 'Korean', regions: ['KR'] },
      { code: 'ar', name: 'Arabic', regions: ['SA', 'AE', 'EG'] },
      { code: 'hi', name: 'Hindi', regions: ['IN'] },
      { code: 'nl', name: 'Dutch', regions: ['NL', 'BE'] },
      { code: 'pl', name: 'Polish', regions: ['PL'] },
      { code: 'tr', name: 'Turkish', regions: ['TR'] },
      { code: 'sv', name: 'Swedish', regions: ['SE'] },
      { code: 'da', name: 'Danish', regions: ['DK'] },
      { code: 'no', name: 'Norwegian', regions: ['NO'] },
      { code: 'fi', name: 'Finnish', regions: ['FI'] },
      { code: 'el', name: 'Greek', regions: ['GR'] },
      { code: 'cs', name: 'Czech', regions: ['CZ'] },
      { code: 'hu', name: 'Hungarian', regions: ['HU'] },
      { code: 'ro', name: 'Romanian', regions: ['RO'] },
      { code: 'th', name: 'Thai', regions: ['TH'] },
      { code: 'id', name: 'Indonesian', regions: ['ID'] },
      { code: 'vi', name: 'Vietnamese', regions: ['VN'] },
      { code: 'uk', name: 'Ukrainian', regions: ['UA'] },
      { code: 'he', name: 'Hebrew', regions: ['IL'] },
      { code: 'ms', name: 'Malay', regions: ['MY'] },
      { code: 'fa', name: 'Persian', regions: ['IR'] },
    ];

    res.json({
      success: true,
      languages,
      total: languages.length,
    });
  } catch (error) {
    console.error('Failed to get languages list:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get languages',
    });
  }
});

/**
 * Generate recommendations based on analysis
 */
function generateRecommendations(
  languageDetection: any,
  pluginDetection: any,
  hreflangAnalysis: any
): string[] {
  const recommendations: string[] = [];

  // Language detection recommendations
  if (languageDetection.hasMultiLanguage && languageDetection.confidence < 0.8) {
    recommendations.push(
      'Low confidence in language detection. Consider adding explicit lang attributes to HTML elements.'
    );
  }

  if (languageDetection.languageCount > 1 && !hreflangAnalysis.hasHreflang) {
    recommendations.push(
      'Multiple languages detected but no hreflang tags found. Add hreflang tags for better SEO.'
    );
  }

  // Plugin recommendations
  if (pluginDetection.detectedPlugin) {
    recommendations.push(
      `${pluginDetection.detectedPlugin} detected. Ensure export includes plugin-specific configuration for easy re-import.`
    );
  }

  if (!pluginDetection.detectedPlugin && languageDetection.hasMultiLanguage) {
    recommendations.push(
      'Multi-language content detected without translation plugin. Consider implementing WPML or Polylang for better management.'
    );
  }

  // hreflang recommendations
  if (hreflangAnalysis.hasHreflang && !hreflangAnalysis.isValid) {
    recommendations.push(
      'Invalid hreflang configuration detected. Fix errors to ensure proper search engine indexing.'
    );
  }

  hreflangAnalysis.recommendations.forEach((rec: string) => {
    recommendations.push(rec);
  });

  return recommendations;
}

export default router;
