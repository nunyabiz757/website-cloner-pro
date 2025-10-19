import * as cheerio from 'cheerio';

/**
 * MultiLanguageService
 *
 * Comprehensive multi-language support for website exports:
 * - Detect and preserve multi-language content
 * - WPML/Polylang integration for WordPress
 * - hreflang tag preservation and validation
 * - Language-specific asset handling
 * - Translation mapping and relationships
 */

// Language detection result
export interface LanguageDetectionResult {
  detectedLanguages: DetectedLanguage[];
  primaryLanguage: string;
  hasMultiLanguage: boolean;
  detectionMethod: 'html-lang' | 'hreflang' | 'content-analysis' | 'plugin-detection' | 'manual';
  confidence: number; // 0-1
  languageCount: number;
}

export interface DetectedLanguage {
  code: string; // e.g., 'en', 'es', 'fr'
  name: string; // e.g., 'English', 'Spanish', 'French'
  region?: string; // e.g., 'US', 'GB', 'MX'
  fullCode: string; // e.g., 'en-US', 'es-MX'
  confidence: number;
  detectedIn: string[]; // ['html-lang', 'hreflang', 'content']
  pageCount?: number;
  assetCount?: number;
}

// WPML/Polylang plugin detection
export interface WordPressPluginDetection {
  hasWPML: boolean;
  hasPolylang: boolean;
  hasTranslatePress: boolean;
  hasqTranslate: boolean;
  hasWeglot: boolean;
  detectedPlugin: string | null;
  pluginVersion?: string;
  configuration?: WPMLConfiguration | PolylangConfiguration;
}

export interface WPMLConfiguration {
  defaultLanguage: string;
  activeLanguages: string[];
  languageSwitcher: boolean;
  translationManagement: boolean;
  stringTranslation: boolean;
  mediaTranslation: boolean;
}

export interface PolylangConfiguration {
  defaultLanguage: string;
  languages: Array<{
    code: string;
    name: string;
    locale: string;
    flag: string;
    slug: string;
  }>;
  syncOptions: {
    taxonomies: boolean;
    postMeta: boolean;
    customFields: boolean;
  };
}

// hreflang tags
export interface HreflangTag {
  lang: string;
  href: string;
  isValid: boolean;
  validationErrors: string[];
}

export interface HreflangAnalysis {
  tags: HreflangTag[];
  hasHreflang: boolean;
  isValid: boolean;
  totalTags: number;
  errors: string[];
  warnings: string[];
  recommendations: string[];
}

// Language-specific assets
export interface LanguageAssetMap {
  language: string;
  assets: {
    css: string[];
    js: string[];
    images: string[];
    fonts: string[];
    videos: string[];
    documents: string[];
  };
  totalSize: number;
}

// Translation mapping
export interface TranslationMapping {
  sourceLanguage: string;
  translations: Array<{
    language: string;
    url: string;
    pageId?: string;
    postId?: string;
    status: 'published' | 'draft' | 'missing';
  }>;
  pageType: 'page' | 'post' | 'product' | 'custom';
  relationshipType: 'wpml' | 'polylang' | 'manual' | 'hreflang';
}

// Multi-language export configuration
export interface MultiLanguageExportConfig {
  preserveLanguages: boolean;
  includeAllLanguages: boolean;
  selectedLanguages?: string[];
  preserveHreflang: boolean;
  preserveLanguageSwitcher: boolean;
  includeTranslationData: boolean;
  languageAssetStrategy: 'separate' | 'shared' | 'optimized';
  pluginCompatibility: 'wpml' | 'polylang' | 'translatepress' | 'weglot' | 'none';
}

// Multi-language export result
export interface MultiLanguageExportResult {
  languages: LanguageExport[];
  sharedAssets: string[];
  translationMappings: TranslationMapping[];
  hreflangData: HreflangAnalysis;
  exportConfig: MultiLanguageExportConfig;
  statistics: {
    totalLanguages: number;
    totalPages: number;
    totalAssets: number;
    totalSize: number;
  };
}

export interface LanguageExport {
  language: string;
  languageName: string;
  pages: Array<{
    url: string;
    title: string;
    content: string;
    translationId?: string;
  }>;
  assets: LanguageAssetMap;
  metadata: Record<string, any>;
}

class MultiLanguageService {
  // Language name mapping
  private languageNames: Record<string, string> = {
    'en': 'English',
    'es': 'Spanish',
    'fr': 'French',
    'de': 'German',
    'it': 'Italian',
    'pt': 'Portuguese',
    'ru': 'Russian',
    'ja': 'Japanese',
    'zh': 'Chinese',
    'ko': 'Korean',
    'ar': 'Arabic',
    'hi': 'Hindi',
    'nl': 'Dutch',
    'pl': 'Polish',
    'tr': 'Turkish',
    'sv': 'Swedish',
    'da': 'Danish',
    'no': 'Norwegian',
    'fi': 'Finnish',
    'el': 'Greek',
    'cs': 'Czech',
    'hu': 'Hungarian',
    'ro': 'Romanian',
    'th': 'Thai',
    'id': 'Indonesian',
    'vi': 'Vietnamese',
    'uk': 'Ukrainian',
    'he': 'Hebrew',
    'ms': 'Malay',
    'fa': 'Persian',
  };

  /**
   * Detect languages from HTML content
   */
  async detectLanguages(html: string, url: string): Promise<LanguageDetectionResult> {
    const $ = cheerio.load(html);
    const detectedLanguages = new Map<string, DetectedLanguage>();

    // Method 1: HTML lang attribute
    const htmlLang = $('html').attr('lang');
    if (htmlLang) {
      this.addDetectedLanguage(detectedLanguages, htmlLang, 'html-lang', 0.9);
    }

    // Method 2: hreflang tags
    const hreflangTags = $('link[rel="alternate"][hreflang]');
    hreflangTags.each((_, elem) => {
      const lang = $(elem).attr('hreflang');
      if (lang && lang !== 'x-default') {
        this.addDetectedLanguage(detectedLanguages, lang, 'hreflang', 0.85);
      }
    });

    // Method 3: Content-Language meta tag
    const contentLang = $('meta[http-equiv="content-language"]').attr('content');
    if (contentLang) {
      this.addDetectedLanguage(detectedLanguages, contentLang, 'content-analysis', 0.8);
    }

    // Method 4: WordPress plugin detection
    const pluginDetection = this.detectWordPressPlugins(html);
    if (pluginDetection.detectedPlugin) {
      // Check for language indicators in body classes
      const bodyClasses = $('body').attr('class') || '';
      const langMatches = bodyClasses.match(/\blang-(\w+)/g);
      if (langMatches) {
        langMatches.forEach(match => {
          const lang = match.replace('lang-', '');
          this.addDetectedLanguage(detectedLanguages, lang, 'plugin-detection', 0.95);
        });
      }
    }

    // Method 5: URL path analysis
    const urlLang = this.extractLanguageFromURL(url);
    if (urlLang) {
      this.addDetectedLanguage(detectedLanguages, urlLang, 'content-analysis', 0.75);
    }

    // Method 6: Language switcher detection
    const switchers = $('a[hreflang], a[lang], .language-switcher a, .lang-switcher a');
    switchers.each((_, elem) => {
      const lang = $(elem).attr('hreflang') || $(elem).attr('lang');
      if (lang) {
        this.addDetectedLanguage(detectedLanguages, lang, 'content-analysis', 0.7);
      }
    });

    const languagesArray = Array.from(detectedLanguages.values());

    // Determine primary language (highest confidence)
    const primaryLanguage = languagesArray.length > 0
      ? languagesArray.reduce((prev, current) =>
          current.confidence > prev.confidence ? current : prev
        ).fullCode
      : 'en-US';

    // Calculate overall confidence
    const avgConfidence = languagesArray.length > 0
      ? languagesArray.reduce((sum, lang) => sum + lang.confidence, 0) / languagesArray.length
      : 0;

    return {
      detectedLanguages: languagesArray,
      primaryLanguage,
      hasMultiLanguage: languagesArray.length > 1,
      detectionMethod: this.getPrimaryDetectionMethod(languagesArray),
      confidence: avgConfidence,
      languageCount: languagesArray.length,
    };
  }

  /**
   * Add detected language to map
   */
  private addDetectedLanguage(
    map: Map<string, DetectedLanguage>,
    langCode: string,
    method: string,
    confidence: number
  ): void {
    const normalized = this.normalizeLanguageCode(langCode);
    const existing = map.get(normalized.fullCode);

    if (existing) {
      // Update existing
      if (!existing.detectedIn.includes(method)) {
        existing.detectedIn.push(method);
      }
      // Increase confidence if detected by multiple methods
      existing.confidence = Math.min(1, existing.confidence + 0.05);
    } else {
      // Add new
      map.set(normalized.fullCode, {
        code: normalized.code,
        name: this.languageNames[normalized.code] || normalized.code.toUpperCase(),
        region: normalized.region,
        fullCode: normalized.fullCode,
        confidence,
        detectedIn: [method],
      });
    }
  }

  /**
   * Normalize language code (e.g., 'en-us' -> { code: 'en', region: 'US', fullCode: 'en-US' })
   */
  private normalizeLanguageCode(langCode: string): { code: string; region?: string; fullCode: string } {
    const cleaned = langCode.toLowerCase().trim();
    const parts = cleaned.split('-');

    const code = parts[0];
    const region = parts[1] ? parts[1].toUpperCase() : undefined;
    const fullCode = region ? `${code}-${region}` : code;

    return { code, region, fullCode };
  }

  /**
   * Extract language from URL path
   */
  private extractLanguageFromURL(url: string): string | null {
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/').filter(p => p);

      // Check first path segment for language code
      if (pathParts.length > 0) {
        const firstSegment = pathParts[0].toLowerCase();

        // Check if it's a valid language code (2 or 5 characters like 'en' or 'en-us')
        if (/^[a-z]{2}(-[a-z]{2})?$/.test(firstSegment)) {
          return firstSegment;
        }
      }

      // Check subdomain (e.g., en.example.com)
      const subdomain = urlObj.hostname.split('.')[0];
      if (subdomain && /^[a-z]{2}$/.test(subdomain)) {
        return subdomain;
      }
    } catch (error) {
      // Invalid URL
    }

    return null;
  }

  /**
   * Get primary detection method
   */
  private getPrimaryDetectionMethod(languages: DetectedLanguage[]): LanguageDetectionResult['detectionMethod'] {
    if (languages.length === 0) return 'manual';

    const methods = languages.flatMap(l => l.detectedIn);
    const methodCounts: Record<string, number> = {};

    methods.forEach(method => {
      methodCounts[method] = (methodCounts[method] || 0) + 1;
    });

    const primaryMethod = Object.entries(methodCounts)
      .reduce((max, [method, count]) => count > max[1] ? [method, count] : max, ['manual', 0])[0];

    return primaryMethod as LanguageDetectionResult['detectionMethod'];
  }

  /**
   * Detect WordPress translation plugins
   */
  detectWordPressPlugins(html: string): WordPressPluginDetection {
    const $ = cheerio.load(html);

    const result: WordPressPluginDetection = {
      hasWPML: false,
      hasPolylang: false,
      hasTranslatePress: false,
      hasqTranslate: false,
      hasWeglot: false,
      detectedPlugin: null,
    };

    // Check for WPML
    if (
      html.includes('wpml') ||
      html.includes('sitepress-multilingual') ||
      $('.wpml-ls-statics-shortcode').length > 0 ||
      $('[class*="wpml"]').length > 0
    ) {
      result.hasWPML = true;
      result.detectedPlugin = 'WPML';
    }

    // Check for Polylang
    if (
      html.includes('polylang') ||
      html.includes('pll_') ||
      $('[class*="pll"]').length > 0 ||
      $('.lang-item').length > 0
    ) {
      result.hasPolylang = true;
      result.detectedPlugin = result.detectedPlugin || 'Polylang';
    }

    // Check for TranslatePress
    if (
      html.includes('translatepress') ||
      html.includes('trp-') ||
      $('[class*="trp"]').length > 0
    ) {
      result.hasTranslatePress = true;
      result.detectedPlugin = result.detectedPlugin || 'TranslatePress';
    }

    // Check for qTranslate
    if (
      html.includes('qtranslate') ||
      html.includes('qtrans') ||
      $('[class*="qtranslate"]').length > 0
    ) {
      result.hasqTranslate = true;
      result.detectedPlugin = result.detectedPlugin || 'qTranslate';
    }

    // Check for Weglot
    if (
      html.includes('weglot') ||
      html.includes('wg-') ||
      $('[class*="weglot"]').length > 0
    ) {
      result.hasWeglot = true;
      result.detectedPlugin = result.detectedPlugin || 'Weglot';
    }

    return result;
  }

  /**
   * Extract and validate hreflang tags
   */
  analyzeHreflangTags(html: string, currentUrl: string): HreflangAnalysis {
    const $ = cheerio.load(html);
    const tags: HreflangTag[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];
    const recommendations: string[] = [];

    // Extract hreflang tags
    $('link[rel="alternate"][hreflang]').each((_, elem) => {
      const lang = $(elem).attr('hreflang');
      const href = $(elem).attr('href');

      if (!lang || !href) {
        errors.push('Found hreflang tag with missing lang or href attribute');
        return;
      }

      const validationErrors: string[] = [];

      // Validate language code
      if (lang !== 'x-default' && !this.isValidLanguageCode(lang)) {
        validationErrors.push(`Invalid language code: ${lang}`);
      }

      // Validate URL
      try {
        new URL(href);
      } catch {
        validationErrors.push(`Invalid URL: ${href}`);
      }

      tags.push({
        lang,
        href,
        isValid: validationErrors.length === 0,
        validationErrors,
      });
    });

    // Validation: Check for x-default
    const hasXDefault = tags.some(t => t.lang === 'x-default');
    if (tags.length > 0 && !hasXDefault) {
      warnings.push('Missing x-default hreflang tag (recommended for international sites)');
      recommendations.push('Add <link rel="alternate" hreflang="x-default" href="..."> for default language');
    }

    // Validation: Check for self-referencing
    const hasSelfReference = tags.some(t => t.href === currentUrl);
    if (tags.length > 0 && !hasSelfReference) {
      warnings.push('Missing self-referencing hreflang tag');
      recommendations.push(`Add hreflang tag pointing to current page: ${currentUrl}`);
    }

    // Validation: Check for duplicates
    const langCodes = tags.map(t => t.lang);
    const duplicates = langCodes.filter((lang, index) => langCodes.indexOf(lang) !== index);
    if (duplicates.length > 0) {
      errors.push(`Duplicate hreflang tags found: ${duplicates.join(', ')}`);
    }

    // Validation: Check for reciprocal links (requires multi-page analysis)
    if (tags.length > 0) {
      recommendations.push('Verify reciprocal hreflang links across all language versions');
    }

    return {
      tags,
      hasHreflang: tags.length > 0,
      isValid: errors.length === 0,
      totalTags: tags.length,
      errors,
      warnings,
      recommendations,
    };
  }

  /**
   * Validate language code
   */
  private isValidLanguageCode(code: string): boolean {
    // ISO 639-1 (2 letters) or ISO 639-1 + ISO 3166-1 (en-US format)
    return /^[a-z]{2}(-[A-Z]{2})?$/.test(code);
  }

  /**
   * Extract language-specific assets
   */
  extractLanguageAssets(html: string, language: string): LanguageAssetMap {
    const $ = cheerio.load(html);
    const assets: LanguageAssetMap = {
      language,
      assets: {
        css: [],
        js: [],
        images: [],
        fonts: [],
        videos: [],
        documents: [],
      },
      totalSize: 0,
    };

    // Extract CSS files with language indicators
    $('link[rel="stylesheet"]').each((_, elem) => {
      const href = $(elem).attr('href');
      if (href && this.isLanguageSpecificAsset(href, language)) {
        assets.assets.css.push(href);
      }
    });

    // Extract JS files with language indicators
    $('script[src]').each((_, elem) => {
      const src = $(elem).attr('src');
      if (src && this.isLanguageSpecificAsset(src, language)) {
        assets.assets.js.push(src);
      }
    });

    // Extract images with language indicators
    $('img[src]').each((_, elem) => {
      const src = $(elem).attr('src');
      if (src && this.isLanguageSpecificAsset(src, language)) {
        assets.assets.images.push(src);
      }
    });

    // Extract fonts
    $('link[rel="preload"][as="font"], link[href*=".woff"], link[href*=".ttf"]').each((_, elem) => {
      const href = $(elem).attr('href');
      if (href && this.isLanguageSpecificAsset(href, language)) {
        assets.assets.fonts.push(href);
      }
    });

    // Extract videos
    $('video source, video[src]').each((_, elem) => {
      const src = $(elem).attr('src');
      if (src && this.isLanguageSpecificAsset(src, language)) {
        assets.assets.videos.push(src);
      }
    });

    // Extract documents (PDFs, docs, etc.)
    $('a[href*=".pdf"], a[href*=".doc"]').each((_, elem) => {
      const href = $(elem).attr('href');
      if (href && this.isLanguageSpecificAsset(href, language)) {
        assets.assets.documents.push(href);
      }
    });

    return assets;
  }

  /**
   * Check if asset is language-specific
   */
  private isLanguageSpecificAsset(url: string, language: string): boolean {
    const lowerUrl = url.toLowerCase();
    const langCode = language.split('-')[0]; // Get base language code

    // Check for language code in path
    return (
      lowerUrl.includes(`/${langCode}/`) ||
      lowerUrl.includes(`/${langCode}-`) ||
      lowerUrl.includes(`-${langCode}.`) ||
      lowerUrl.includes(`_${langCode}.`) ||
      lowerUrl.includes(`-${language}.`) ||
      lowerUrl.includes(`_${language}.`)
    );
  }

  /**
   * Create translation mapping from hreflang tags
   */
  createTranslationMapping(
    html: string,
    sourceUrl: string,
    sourceLanguage: string
  ): TranslationMapping {
    const hreflangAnalysis = this.analyzeHreflangTags(html, sourceUrl);

    const translations = hreflangAnalysis.tags
      .filter(tag => tag.lang !== 'x-default' && tag.lang !== sourceLanguage)
      .map(tag => ({
        language: tag.lang,
        url: tag.href,
        status: 'published' as const,
      }));

    return {
      sourceLanguage,
      translations,
      pageType: 'page',
      relationshipType: 'hreflang',
    };
  }

  /**
   * Generate language switcher HTML
   */
  generateLanguageSwitcher(
    languages: DetectedLanguage[],
    currentLanguage: string,
    translationMapping: TranslationMapping
  ): string {
    const languageOptions = languages.map(lang => {
      const translation = translationMapping.translations.find(t => t.language === lang.fullCode);
      const url = translation?.url || '#';
      const isCurrent = lang.fullCode === currentLanguage;

      return `
        <li class="lang-item lang-item-${lang.code} ${isCurrent ? 'current-lang' : ''}">
          <a href="${url}" hreflang="${lang.fullCode}" lang="${lang.code}">
            ${lang.name}
          </a>
        </li>
      `;
    }).join('');

    return `
<!-- Language Switcher -->
<div class="language-switcher">
  <ul class="language-list">
    ${languageOptions}
  </ul>
</div>
    `.trim();
  }

  /**
   * Preserve hreflang tags in export
   */
  preserveHreflangTags(html: string, translationMappings: TranslationMapping[]): string {
    const $ = cheerio.load(html);

    // Remove existing hreflang tags
    $('link[rel="alternate"][hreflang]').remove();

    // Add new hreflang tags
    const headTag = $('head');

    translationMappings.forEach(mapping => {
      // Add tag for source language
      headTag.append(
        `\n  <link rel="alternate" hreflang="${mapping.sourceLanguage}" href="${mapping.translations[0]?.url || ''}" />`
      );

      // Add tags for translations
      mapping.translations.forEach(trans => {
        headTag.append(
          `\n  <link rel="alternate" hreflang="${trans.language}" href="${trans.url}" />`
        );
      });
    });

    return $.html();
  }

  /**
   * Export multi-language website
   */
  async exportMultiLanguage(
    pages: Array<{ url: string; html: string; title: string }>,
    config: MultiLanguageExportConfig
  ): Promise<MultiLanguageExportResult> {
    const languageExports = new Map<string, LanguageExport>();
    const translationMappings: TranslationMapping[] = [];
    const sharedAssets: Set<string> = new Set();
    let totalSize = 0;

    // Process each page
    for (const page of pages) {
      // Detect language
      const detection = await this.detectLanguages(page.html, page.url);
      const pageLanguage = detection.primaryLanguage;

      // Skip if not in selected languages
      if (
        config.selectedLanguages &&
        !config.selectedLanguages.includes(pageLanguage)
      ) {
        continue;
      }

      // Get or create language export
      if (!languageExports.has(pageLanguage)) {
        const langInfo = detection.detectedLanguages.find(l => l.fullCode === pageLanguage);
        languageExports.set(pageLanguage, {
          language: pageLanguage,
          languageName: langInfo?.name || pageLanguage,
          pages: [],
          assets: {
            language: pageLanguage,
            assets: { css: [], js: [], images: [], fonts: [], videos: [], documents: [] },
            totalSize: 0,
          },
          metadata: {},
        });
      }

      const langExport = languageExports.get(pageLanguage)!;

      // Add page
      langExport.pages.push({
        url: page.url,
        title: page.title,
        content: page.html,
      });

      // Extract assets
      const assets = this.extractLanguageAssets(page.html, pageLanguage);

      // Merge assets
      Object.keys(assets.assets).forEach(assetType => {
        const typeKey = assetType as keyof typeof assets.assets;
        langExport.assets.assets[typeKey].push(...assets.assets[typeKey]);
      });

      // Create translation mapping if hreflang exists
      if (config.preserveHreflang) {
        const mapping = this.createTranslationMapping(page.html, page.url, pageLanguage);
        if (mapping.translations.length > 0) {
          translationMappings.push(mapping);
        }
      }

      // Track shared assets
      if (config.languageAssetStrategy === 'shared') {
        // Assets without language indicators are shared
        const $ = cheerio.load(page.html);
        $('link[rel="stylesheet"], script[src], img[src]').each((_, elem) => {
          const url = $(elem).attr('href') || $(elem).attr('src');
          if (url && !this.isLanguageSpecificAsset(url, pageLanguage)) {
            sharedAssets.add(url);
          }
        });
      }
    }

    // Calculate statistics
    const allLanguages = Array.from(languageExports.values());
    const totalPages = allLanguages.reduce((sum, lang) => sum + lang.pages.length, 0);
    const totalAssets = allLanguages.reduce((sum, lang) => {
      return sum + Object.values(lang.assets.assets).reduce((s, arr) => s + arr.length, 0);
    }, 0);

    // Get hreflang analysis from first page
    const firstPage = pages[0];
    const hreflangData = firstPage
      ? this.analyzeHreflangTags(firstPage.html, firstPage.url)
      : {
          tags: [],
          hasHreflang: false,
          isValid: true,
          totalTags: 0,
          errors: [],
          warnings: [],
          recommendations: [],
        };

    return {
      languages: allLanguages,
      sharedAssets: Array.from(sharedAssets),
      translationMappings,
      hreflangData,
      exportConfig: config,
      statistics: {
        totalLanguages: allLanguages.length,
        totalPages,
        totalAssets,
        totalSize,
      },
    };
  }

  /**
   * Generate WPML import configuration
   */
  generateWPMLImportConfig(exportResult: MultiLanguageExportResult): string {
    const config = {
      default_language: exportResult.languages[0]?.language || 'en',
      languages: exportResult.languages.map(lang => ({
        code: lang.language,
        name: lang.languageName,
        page_count: lang.pages.length,
      })),
      translation_mappings: exportResult.translationMappings.map(mapping => ({
        source_language: mapping.sourceLanguage,
        translations: mapping.translations.map(t => ({
          language: t.language,
          url: t.url,
        })),
      })),
      settings: {
        language_switcher: exportResult.exportConfig.preserveLanguageSwitcher,
        hreflang_tags: exportResult.exportConfig.preserveHreflang,
        asset_strategy: exportResult.exportConfig.languageAssetStrategy,
      },
    };

    return JSON.stringify(config, null, 2);
  }

  /**
   * Generate Polylang import configuration
   */
  generatePolylangImportConfig(exportResult: MultiLanguageExportResult): string {
    const config = {
      default_lang: exportResult.languages[0]?.language || 'en',
      languages: exportResult.languages.map(lang => ({
        slug: lang.language.split('-')[0],
        locale: lang.language,
        name: lang.languageName,
        term_group: 0,
      })),
      sync: {
        taxonomies: true,
        post_meta: true,
        comment_status: true,
        ping_status: true,
        sticky_posts: true,
        post_date: true,
        post_format: true,
      },
      translation_links: exportResult.translationMappings.map(mapping => ({
        source: mapping.sourceLanguage,
        targets: mapping.translations.map(t => t.language),
      })),
    };

    return JSON.stringify(config, null, 2);
  }
}

// Export singleton instance
export default new MultiLanguageService();
