import express from 'express';
import FormHandlingService from '../services/FormHandlingService.js';

const router = express.Router();

/**
 * Detect forms in HTML
 * POST /api/form-handling/detect
 */
router.post('/detect', async (req, res) => {
  try {
    const { html } = req.body;

    if (!html) {
      return res.status(400).json({
        success: false,
        error: 'HTML content is required',
      });
    }

    const result = await FormHandlingService.detectForms(html);

    res.json({
      success: true,
      result,
    });
  } catch (error) {
    console.error('Failed to detect forms:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to detect forms',
    });
  }
});

/**
 * Convert form to Contact Form 7
 * POST /api/form-handling/convert/contact-form-7
 */
router.post('/convert/contact-form-7', async (req, res) => {
  try {
    const { html, formIndex, recipientEmail } = req.body;

    if (!html) {
      return res.status(400).json({
        success: false,
        error: 'HTML content is required',
      });
    }

    const detection = await FormHandlingService.detectForms(html);

    if (detection.forms.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No forms found in HTML',
      });
    }

    const formIdx = formIndex || 0;
    const form = detection.forms[formIdx];

    const cf7Config = FormHandlingService.convertToContactForm7(
      form,
      recipientEmail || 'admin@example.com'
    );

    res.json({
      success: true,
      config: cf7Config,
      implementation: {
        steps: [
          '1. Install Contact Form 7 plugin',
          '2. Go to Contact > Add New',
          '3. Paste the form code into the Form tab',
          '4. Configure Mail settings',
          '5. Save and use shortcode in your page',
        ],
        shortcode: `[contact-form-7 id="1" title="${cf7Config.title}"]`,
      },
    });
  } catch (error) {
    console.error('Failed to convert to CF7:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to convert',
    });
  }
});

/**
 * Convert form to Gravity Forms
 * POST /api/form-handling/convert/gravity-forms
 */
router.post('/convert/gravity-forms', async (req, res) => {
  try {
    const { html, formIndex } = req.body;

    if (!html) {
      return res.status(400).json({
        success: false,
        error: 'HTML content is required',
      });
    }

    const detection = await FormHandlingService.detectForms(html);

    if (detection.forms.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No forms found in HTML',
      });
    }

    const formIdx = formIndex || 0;
    const form = detection.forms[formIdx];

    const gfConfig = FormHandlingService.convertToGravityForms(form);

    res.json({
      success: true,
      config: gfConfig,
      implementation: {
        steps: [
          '1. Install Gravity Forms plugin',
          '2. Go to Forms > New Form',
          '3. Import the JSON configuration',
          '4. Adjust field settings as needed',
          '5. Use shortcode or block in your page',
        ],
        shortcode: `[gravityform id="1" title="false" description="false"]`,
      },
    });
  } catch (error) {
    console.error('Failed to convert to Gravity Forms:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to convert',
    });
  }
});

/**
 * Convert form to WPForms
 * POST /api/form-handling/convert/wpforms
 */
router.post('/convert/wpforms', async (req, res) => {
  try {
    const { html, formIndex } = req.body;

    if (!html) {
      return res.status(400).json({
        success: false,
        error: 'HTML content is required',
      });
    }

    const detection = await FormHandlingService.detectForms(html);

    if (detection.forms.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No forms found in HTML',
      });
    }

    const formIdx = formIndex || 0;
    const form = detection.forms[formIdx];

    const wpfConfig = FormHandlingService.convertToWPForms(form);

    res.json({
      success: true,
      config: wpfConfig,
      implementation: {
        steps: [
          '1. Install WPForms plugin',
          '2. Go to WPForms > Add New',
          '3. Import the JSON configuration',
          '4. Customize fields as needed',
          '5. Embed in page using shortcode or block',
        ],
        shortcode: `[wpforms id="1"]`,
      },
    });
  } catch (error) {
    console.error('Failed to convert to WPForms:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to convert',
    });
  }
});

/**
 * Convert form to Gutenberg block
 * POST /api/form-handling/convert/gutenberg
 */
router.post('/convert/gutenberg', async (req, res) => {
  try {
    const { html, formIndex, plugin } = req.body;

    if (!html || !plugin) {
      return res.status(400).json({
        success: false,
        error: 'HTML content and plugin are required',
      });
    }

    const detection = await FormHandlingService.detectForms(html);

    if (detection.forms.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No forms found in HTML',
      });
    }

    const formIdx = formIndex || 0;
    const form = detection.forms[formIdx];

    const block = FormHandlingService.convertToGutenbergBlock(form, plugin);

    res.json({
      success: true,
      block,
      implementation: {
        steps: [
          `1. Install ${plugin} plugin`,
          '2. Create the form using the plugin',
          '3. Add block to your page in Gutenberg editor',
          '4. Select the form from the dropdown',
          '5. Publish the page',
        ],
      },
    });
  } catch (error) {
    console.error('Failed to convert to Gutenberg:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to convert',
    });
  }
});

/**
 * Get form plugin recommendation
 * POST /api/form-handling/recommend-plugin
 */
router.post('/recommend-plugin', async (req, res) => {
  try {
    const { html } = req.body;

    if (!html) {
      return res.status(400).json({
        success: false,
        error: 'HTML content is required',
      });
    }

    const detection = await FormHandlingService.detectForms(html);

    res.json({
      success: true,
      recommendation: detection.formPluginRecommendation,
      formsAnalyzed: detection.totalForms,
      migrationComplexity: detection.migrationComplexity,
    });
  } catch (error) {
    console.error('Failed to get recommendation:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get recommendation',
    });
  }
});

/**
 * Convert all forms in HTML
 * POST /api/form-handling/convert-all
 */
router.post('/convert-all', async (req, res) => {
  try {
    const { html, targetPlugin, recipientEmail } = req.body;

    if (!html || !targetPlugin) {
      return res.status(400).json({
        success: false,
        error: 'HTML content and target plugin are required',
      });
    }

    const detection = await FormHandlingService.detectForms(html);

    if (detection.forms.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No forms found in HTML',
      });
    }

    const conversions = detection.forms.map((form, index) => {
      let config;

      switch (targetPlugin) {
        case 'contact-form-7':
          config = FormHandlingService.convertToContactForm7(form, recipientEmail);
          break;
        case 'gravity-forms':
          config = FormHandlingService.convertToGravityForms(form);
          break;
        case 'wpforms':
          config = FormHandlingService.convertToWPForms(form);
          break;
        default:
          throw new Error(`Unsupported plugin: ${targetPlugin}`);
      }

      return {
        formIndex: index,
        formName: form.name,
        complexity: form.complexity,
        fields: form.fields.length,
        config,
      };
    });

    res.json({
      success: true,
      conversions,
      totalForms: detection.totalForms,
      plugin: targetPlugin,
      recommendation: detection.formPluginRecommendation,
    });
  } catch (error) {
    console.error('Failed to convert all forms:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to convert all forms',
    });
  }
});

export default router;
