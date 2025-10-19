import express from 'express';
import { ResponsiveBreakpointService } from '../services/ResponsiveBreakpointService.js';
import { AnimationPreservationService } from '../services/AnimationPreservationService.js';
import { FrameworkDetectionService } from '../services/FrameworkDetectionService.js';
import { DependencyInliningService } from '../services/DependencyInliningService.js';
import { ThirdPartyIntegrationService } from '../services/ThirdPartyIntegrationService.js';
import { ParserService } from '../services/ParserService.js';

const router = express.Router();

const responsiveService = new ResponsiveBreakpointService();
const animationService = new AnimationPreservationService();
const frameworkService = new FrameworkDetectionService();
const dependencyService = new DependencyInliningService();
const thirdPartyService = new ThirdPartyIntegrationService();
const parserService = new ParserService();

/**
 * Analyze responsive breakpoints
 * POST /api/analysis/responsive
 */
router.post('/responsive', async (req, res) => {
  try {
    const { url, cssContent } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL is required',
      });
    }

    const analysis = await responsiveService.analyzeResponsiveDesign(url, cssContent);

    res.json({
      success: true,
      analysis,
    });
  } catch (error) {
    console.error('Responsive analysis failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Responsive analysis failed',
    });
  }
});

/**
 * Analyze animations
 * POST /api/analysis/animations
 */
router.post('/animations', async (req, res) => {
  try {
    const { url, htmlContent, cssContent } = req.body;

    if (!url || !htmlContent) {
      return res.status(400).json({
        success: false,
        error: 'URL and HTML content are required',
      });
    }

    const analysis = await animationService.analyzeAnimations(url, htmlContent, cssContent);

    res.json({
      success: true,
      analysis,
    });
  } catch (error) {
    console.error('Animation analysis failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Animation analysis failed',
    });
  }
});

/**
 * Generate animation CSS
 * POST /api/analysis/animations/generate-css
 */
router.post('/animations/generate-css', async (req, res) => {
  try {
    const { url, htmlContent, cssContent } = req.body;

    if (!url || !htmlContent) {
      return res.status(400).json({
        success: false,
        error: 'URL and HTML content are required',
      });
    }

    const analysis = await animationService.analyzeAnimations(url, htmlContent, cssContent);
    const generatedCSS = animationService.generateAnimationCSS(analysis);

    res.json({
      success: true,
      css: generatedCSS,
      analysis,
    });
  } catch (error) {
    console.error('Animation CSS generation failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Animation CSS generation failed',
    });
  }
});

/**
 * Detect frameworks and libraries
 * POST /api/analysis/frameworks
 */
router.post('/frameworks', async (req, res) => {
  try {
    const { htmlContent, jsContent, cssContent } = req.body;

    if (!htmlContent) {
      return res.status(400).json({
        success: false,
        error: 'HTML content is required',
      });
    }

    const analysis = await frameworkService.detectFrameworks(
      htmlContent,
      jsContent,
      cssContent
    );

    res.json({
      success: true,
      analysis,
    });
  } catch (error) {
    console.error('Framework detection failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Framework detection failed',
    });
  }
});

/**
 * Analyze JavaScript dependencies
 * POST /api/analysis/js-dependencies
 */
router.post('/js-dependencies', async (req, res) => {
  try {
    const { jsContent } = req.body;

    if (!jsContent) {
      return res.status(400).json({
        success: false,
        error: 'JavaScript content is required',
      });
    }

    const analysis = await frameworkService.analyzeJSDependencies(jsContent);

    res.json({
      success: true,
      analysis,
    });
  } catch (error) {
    console.error('JS dependency analysis failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'JS dependency analysis failed',
    });
  }
});

/**
 * Inline dependencies
 * POST /api/analysis/inline-dependencies
 */
router.post('/inline-dependencies', async (req, res) => {
  try {
    const { htmlContent, baseUrl, options } = req.body;

    if (!htmlContent || !baseUrl) {
      return res.status(400).json({
        success: false,
        error: 'HTML content and base URL are required',
      });
    }

    const result = await dependencyService.inlineDependencies(htmlContent, baseUrl, options);

    res.json({
      success: true,
      result,
    });
  } catch (error) {
    console.error('Dependency inlining failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Dependency inlining failed',
    });
  }
});

/**
 * Bundle scripts
 * POST /api/analysis/bundle-scripts
 */
router.post('/bundle-scripts', async (req, res) => {
  try {
    const { scriptContents } = req.body;

    if (!scriptContents || !Array.isArray(scriptContents)) {
      return res.status(400).json({
        success: false,
        error: 'Script contents array is required',
      });
    }

    const bundled = await dependencyService.bundleScripts(scriptContents);

    res.json({
      success: true,
      bundled,
    });
  } catch (error) {
    console.error('Script bundling failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Script bundling failed',
    });
  }
});

/**
 * Bundle styles
 * POST /api/analysis/bundle-styles
 */
router.post('/bundle-styles', async (req, res) => {
  try {
    const { styleContents } = req.body;

    if (!styleContents || !Array.isArray(styleContents)) {
      return res.status(400).json({
        success: false,
        error: 'Style contents array is required',
      });
    }

    const bundled = await dependencyService.bundleStyles(styleContents);

    res.json({
      success: true,
      bundled,
    });
  } catch (error) {
    console.error('Style bundling failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Style bundling failed',
    });
  }
});

/**
 * Analyze third-party integrations
 * POST /api/analysis/third-party
 */
router.post('/third-party', async (req, res) => {
  try {
    const { htmlContent, jsContent } = req.body;

    if (!htmlContent) {
      return res.status(400).json({
        success: false,
        error: 'HTML content is required',
      });
    }

    const analysis = await thirdPartyService.analyzeIntegrations(htmlContent, jsContent);

    res.json({
      success: true,
      analysis,
    });
  } catch (error) {
    console.error('Third-party analysis failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Third-party analysis failed',
    });
  }
});

/**
 * Generate privacy-friendly replacement code
 * POST /api/analysis/third-party/replacement
 */
router.post('/third-party/replacement', async (req, res) => {
  try {
    const { integrationName } = req.body;

    if (!integrationName) {
      return res.status(400).json({
        success: false,
        error: 'Integration name is required',
      });
    }

    const replacement = thirdPartyService.generateReplacementCode({
      name: integrationName,
      category: 'other',
      scripts: [],
      apiKeys: [],
      configFound: false,
      privacyImpact: 'medium',
      recommendation: '',
    });

    res.json({
      success: true,
      replacement,
    });
  } catch (error) {
    console.error('Replacement code generation failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Replacement code generation failed',
    });
  }
});

/**
 * Generate GDPR consent banner
 * GET /api/analysis/third-party/consent-banner
 */
router.get('/third-party/consent-banner', async (req, res) => {
  try {
    const banner = thirdPartyService.generateConsentBanner();

    res.json({
      success: true,
      html: banner,
    });
  } catch (error) {
    console.error('Consent banner generation failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Consent banner generation failed',
    });
  }
});

/**
 * Parse HTML content
 * POST /api/analysis/parse-html
 */
router.post('/parse-html', async (req, res) => {
  try {
    const { html, baseUrl } = req.body;

    if (!html) {
      return res.status(400).json({
        success: false,
        error: 'HTML content is required',
      });
    }

    const parsed = parserService.parseHTML(html, baseUrl);

    res.json({
      success: true,
      parsed,
    });
  } catch (error) {
    console.error('HTML parsing failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'HTML parsing failed',
    });
  }
});

/**
 * Parse CSS content
 * POST /api/analysis/parse-css
 */
router.post('/parse-css', async (req, res) => {
  try {
    const { css } = req.body;

    if (!css) {
      return res.status(400).json({
        success: false,
        error: 'CSS content is required',
      });
    }

    const parsed = parserService.parseCSS(css);

    res.json({
      success: true,
      parsed,
    });
  } catch (error) {
    console.error('CSS parsing failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'CSS parsing failed',
    });
  }
});

/**
 * Parse JavaScript content
 * POST /api/analysis/parse-js
 */
router.post('/parse-js', async (req, res) => {
  try {
    const { js } = req.body;

    if (!js) {
      return res.status(400).json({
        success: false,
        error: 'JavaScript content is required',
      });
    }

    const parsed = parserService.parseJS(js);

    res.json({
      success: true,
      parsed,
    });
  } catch (error) {
    console.error('JavaScript parsing failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'JavaScript parsing failed',
    });
  }
});

/**
 * Run comprehensive analysis
 * POST /api/analysis/comprehensive
 */
router.post('/comprehensive', async (req, res) => {
  try {
    const { url, htmlContent, cssContent, jsContent } = req.body;

    if (!url || !htmlContent) {
      return res.status(400).json({
        success: false,
        error: 'URL and HTML content are required',
      });
    }

    // Run all analyses in parallel
    const [responsive, animations, frameworks, thirdParty] = await Promise.all([
      responsiveService.analyzeResponsiveDesign(url, cssContent).catch((e) => ({
        error: e.message,
      })),
      animationService
        .analyzeAnimations(url, htmlContent, cssContent)
        .catch((e) => ({ error: e.message })),
      frameworkService
        .detectFrameworks(htmlContent, jsContent, cssContent)
        .catch((e) => ({ error: e.message })),
      thirdPartyService
        .analyzeIntegrations(htmlContent, jsContent)
        .catch((e) => ({ error: e.message })),
    ]);

    res.json({
      success: true,
      analysis: {
        responsive,
        animations,
        frameworks,
        thirdParty,
      },
    });
  } catch (error) {
    console.error('Comprehensive analysis failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Comprehensive analysis failed',
    });
  }
});

export default router;
