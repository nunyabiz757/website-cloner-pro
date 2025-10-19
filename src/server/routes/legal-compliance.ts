import express from 'express';
import LegalComplianceService from '../services/LegalComplianceService.js';

const router = express.Router();

/**
 * Check GDPR Compliance
 * POST /api/legal-compliance/gdpr-check
 */
router.post('/gdpr-check', async (req, res) => {
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

    const result = await LegalComplianceService.checkGDPRCompliance(html, url);

    res.json({
      success: true,
      compliance: result,
    });
  } catch (error) {
    console.error('Failed to check GDPR compliance:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to check GDPR compliance',
    });
  }
});

/**
 * Detect Cookie Consent Mechanism
 * POST /api/legal-compliance/cookie-consent
 */
router.post('/cookie-consent', async (req, res) => {
  try {
    const { html, url } = req.body;

    if (!html) {
      return res.status(400).json({
        success: false,
        error: 'HTML content is required',
      });
    }

    const compliance = await LegalComplianceService.checkGDPRCompliance(html, url || '');

    res.json({
      success: true,
      cookieConsent: compliance.cookieConsent,
    });
  } catch (error) {
    console.error('Failed to detect cookie consent:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to detect cookie consent',
    });
  }
});

/**
 * Detect Privacy Policy
 * POST /api/legal-compliance/privacy-policy
 */
router.post('/privacy-policy', async (req, res) => {
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

    const result = await LegalComplianceService.detectPrivacyPolicy(html, url);

    res.json({
      success: true,
      privacyPolicy: result,
    });
  } catch (error) {
    console.error('Failed to detect privacy policy:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to detect privacy policy',
    });
  }
});

/**
 * Detect Terms of Service
 * POST /api/legal-compliance/terms-of-service
 */
router.post('/terms-of-service', async (req, res) => {
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

    const result = await LegalComplianceService.detectTermsOfService(html, url);

    res.json({
      success: true,
      termsOfService: result,
    });
  } catch (error) {
    console.error('Failed to detect terms of service:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to detect terms of service',
    });
  }
});

/**
 * Detect All Legal Links
 * POST /api/legal-compliance/detect-all-links
 */
router.post('/detect-all-links', async (req, res) => {
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

    const result = await LegalComplianceService.detectAllLegalLinks(html, url);

    res.json({
      success: true,
      legalLinks: result,
    });
  } catch (error) {
    console.error('Failed to detect legal links:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to detect legal links',
    });
  }
});

/**
 * Create Preservation Plan
 * POST /api/legal-compliance/preservation-plan
 */
router.post('/preservation-plan', async (req, res) => {
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

    // Get GDPR compliance
    const gdprCompliance = await LegalComplianceService.checkGDPRCompliance(html, url);

    // Get legal links
    const legalLinks = await LegalComplianceService.detectAllLegalLinks(html, url);

    // Create preservation plan
    const plan = await LegalComplianceService.createPreservationPlan(gdprCompliance, legalLinks);

    res.json({
      success: true,
      plan,
      gdprCompliance,
      legalLinks,
    });
  } catch (error) {
    console.error('Failed to create preservation plan:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create preservation plan',
    });
  }
});

/**
 * Get WordPress Compliance Plugins
 * GET /api/legal-compliance/wordpress-plugins
 */
router.get('/wordpress-plugins', (req, res) => {
  try {
    const plugins = [
      {
        name: 'Cookie Notice for GDPR & CCPA',
        purpose: 'Cookie consent management',
        features: [
          'Cookie consent banner',
          'Customizable design',
          'GDPR/CCPA compliance',
          'Google Consent Mode v2',
        ],
        free: true,
        recommended: true,
        wpOrgUrl: 'https://wordpress.org/plugins/cookie-notice/',
        description: 'Easy-to-use cookie consent plugin with customizable banner',
      },
      {
        name: 'GDPR Cookie Compliance',
        purpose: 'Advanced cookie consent',
        features: [
          'Cookie categorization',
          'Consent logging',
          'Script blocking',
          'Multilingual support',
        ],
        free: true,
        recommended: true,
        wpOrgUrl: 'https://wordpress.org/plugins/gdpr-cookie-compliance/',
        description: 'Advanced cookie consent with granular control',
      },
      {
        name: 'WP GDPR Compliance',
        purpose: 'Complete GDPR compliance',
        features: [
          'Data access requests',
          'Data deletion requests',
          'Consent management',
          'Privacy policy integration',
        ],
        free: true,
        recommended: true,
        wpOrgUrl: 'https://wordpress.org/plugins/wp-gdpr-compliance/',
        description: 'Comprehensive GDPR compliance toolkit',
      },
      {
        name: 'Complianz',
        purpose: 'Privacy compliance suite',
        features: [
          'Cookie consent',
          'Privacy policy generator',
          'Wizard setup',
          'Multi-region support',
        ],
        free: true,
        recommended: true,
        wpOrgUrl: 'https://wordpress.org/plugins/complianz-gdpr/',
        description: 'All-in-one compliance solution with wizard',
      },
      {
        name: 'Cookiebot',
        purpose: 'Professional cookie consent',
        features: [
          'Automatic cookie scanning',
          'Prior consent',
          'Cookie declaration',
          'Compliance reporting',
        ],
        free: false,
        recommended: false,
        wpOrgUrl: 'https://wordpress.org/plugins/cookiebot/',
        description: 'Enterprise-grade cookie consent solution (paid)',
      },
      {
        name: 'iubenda',
        purpose: 'Legal compliance platform',
        features: [
          'Privacy policy generator',
          'Cookie solution',
          'Consent database',
          'Terms generator',
        ],
        free: false,
        recommended: false,
        description: 'Professional legal compliance platform (paid)',
      },
    ];

    res.json({
      success: true,
      plugins,
      totalPlugins: plugins.length,
      freePlugins: plugins.filter(p => p.free).length,
      recommendedPlugins: plugins.filter(p => p.recommended).length,
    });
  } catch (error) {
    console.error('Failed to get WordPress plugins:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get plugins',
    });
  }
});

/**
 * Get GDPR Requirements
 * GET /api/legal-compliance/gdpr-requirements
 */
router.get('/gdpr-requirements', (req, res) => {
  try {
    const requirements = {
      essential: [
        {
          requirement: 'Cookie Consent Banner',
          description: 'Users must consent to non-essential cookies before they are set',
          implementation: 'Use cookie consent plugin with accept/reject options',
          penalty: 'Up to €20 million or 4% of annual global turnover',
        },
        {
          requirement: 'Privacy Policy',
          description: 'Clear privacy policy explaining data collection and usage',
          implementation: 'Create comprehensive privacy policy page',
          penalty: 'Up to €20 million or 4% of annual global turnover',
        },
        {
          requirement: 'User Consent',
          description: 'Explicit consent required for data collection',
          implementation: 'Add consent checkboxes to forms, require opt-in',
          penalty: 'Up to €20 million or 4% of annual global turnover',
        },
        {
          requirement: 'Right to Access',
          description: 'Users can request their personal data',
          implementation: 'Provide data access request mechanism',
          penalty: 'Up to €20 million or 4% of annual global turnover',
        },
        {
          requirement: 'Right to Erasure',
          description: 'Users can request deletion of their data',
          implementation: 'Provide data deletion mechanism',
          penalty: 'Up to €20 million or 4% of annual global turnover',
        },
      ],
      recommended: [
        {
          requirement: 'Data Encryption',
          description: 'Encrypt data in transit and at rest',
          implementation: 'Use HTTPS/SSL, encrypt database fields',
        },
        {
          requirement: 'Data Breach Notification',
          description: 'Notify authorities within 72 hours of breach',
          implementation: 'Have incident response plan',
        },
        {
          requirement: 'Data Protection Officer',
          description: 'Appoint DPO if processing large amounts of data',
          implementation: 'Designate responsible person',
        },
        {
          requirement: 'Privacy by Design',
          description: 'Build privacy into systems from the start',
          implementation: 'Follow privacy-first development practices',
        },
      ],
      regions: [
        {
          region: 'EU/EEA',
          regulation: 'GDPR',
          applies: 'EU citizens, regardless of business location',
        },
        {
          region: 'California',
          regulation: 'CCPA/CPRA',
          applies: 'California residents',
        },
        {
          region: 'UK',
          regulation: 'UK GDPR',
          applies: 'UK residents',
        },
        {
          region: 'Brazil',
          regulation: 'LGPD',
          applies: 'Brazilian citizens',
        },
      ],
    };

    res.json({
      success: true,
      requirements,
    });
  } catch (error) {
    console.error('Failed to get GDPR requirements:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get requirements',
    });
  }
});

/**
 * Get Cookie Categories
 * GET /api/legal-compliance/cookie-categories
 */
router.get('/cookie-categories', (req, res) => {
  try {
    const categories = [
      {
        name: 'Necessary',
        description: 'Essential cookies required for site functionality',
        required: true,
        needsConsent: false,
        examples: [
          'Session cookies',
          'Authentication cookies',
          'Load balancing cookies',
          'Shopping cart cookies',
        ],
      },
      {
        name: 'Functional',
        description: 'Cookies that enhance site functionality and personalization',
        required: false,
        needsConsent: true,
        examples: [
          'Language preference',
          'Region selection',
          'User interface customization',
          'Video player preferences',
        ],
      },
      {
        name: 'Analytics',
        description: 'Cookies for tracking site usage and performance',
        required: false,
        needsConsent: true,
        examples: [
          'Google Analytics',
          'Page view tracking',
          'User behavior analytics',
          'A/B testing cookies',
        ],
      },
      {
        name: 'Marketing',
        description: 'Cookies for advertising and marketing purposes',
        required: false,
        needsConsent: true,
        examples: [
          'Facebook Pixel',
          'Google Ads',
          'Retargeting cookies',
          'Affiliate tracking',
        ],
      },
    ];

    res.json({
      success: true,
      categories,
      totalCategories: categories.length,
    });
  } catch (error) {
    console.error('Failed to get cookie categories:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get categories',
    });
  }
});

/**
 * Generate Privacy Policy Template
 * POST /api/legal-compliance/privacy-policy-template
 */
router.post('/privacy-policy-template', (req, res) => {
  try {
    const { siteName, siteUrl, contactEmail, dataCollected } = req.body;

    const template = `# Privacy Policy for ${siteName || '[Your Site Name]'}

**Effective Date:** ${new Date().toLocaleDateString()}
**Last Updated:** ${new Date().toLocaleDateString()}

## 1. Introduction

${siteName || '[Your Site Name]'} ("we," "our," or "us") respects your privacy and is committed to protecting your personal data. This privacy policy explains how we collect, use, and safeguard your information when you visit our website ${siteUrl || '[your-website.com]'}.

## 2. Information We Collect

We may collect and process the following data about you:

### 2.1 Information You Provide
- Name and contact information
- Email address
- Phone number
- ${dataCollected?.join('\n- ') || 'Other information you provide through forms'}

### 2.2 Information We Collect Automatically
- IP address
- Browser type and version
- Operating system
- Pages visited and time spent
- Referring website
- Cookies and similar technologies

## 3. How We Use Your Data

We use your personal data for the following purposes:

- To provide and maintain our services
- To notify you about changes to our services
- To provide customer support
- To gather analysis or valuable information to improve our services
- To detect, prevent and address technical issues
- To provide you with news and information about our services (with your consent)

## 4. Legal Basis for Processing (GDPR)

We process your personal data under the following legal bases:

- **Consent:** You have given clear consent for us to process your personal data for a specific purpose
- **Contract:** Processing is necessary for a contract we have with you
- **Legal obligation:** Processing is necessary for us to comply with the law
- **Legitimate interests:** Processing is necessary for our legitimate interests

## 5. Data Sharing

We do not sell, trade, or rent your personal information to third parties. We may share your data with:

- Service providers who assist us in operating our website
- Legal authorities when required by law
- Business partners with your explicit consent

## 6. Your Rights Under GDPR

You have the following rights:

- **Right to Access:** Request copies of your personal data
- **Right to Rectification:** Request correction of inaccurate data
- **Right to Erasure:** Request deletion of your personal data
- **Right to Restrict Processing:** Request restriction of processing your data
- **Right to Data Portability:** Request transfer of your data
- **Right to Object:** Object to our processing of your personal data
- **Rights Related to Automated Decision-Making:** Protection from automated decisions

To exercise any of these rights, please contact us at ${contactEmail || '[contact@your-site.com]'}.

## 7. Data Retention

We will retain your personal data only for as long as necessary for the purposes set out in this privacy policy. We will retain and use your data to comply with our legal obligations, resolve disputes, and enforce our policies.

## 8. Data Security

We implement appropriate technical and organizational measures to protect your personal data against unauthorized or unlawful processing, accidental loss, destruction, or damage.

## 9. Cookies

Our website uses cookies to improve your experience. You can control cookie settings through your browser. For more information, please see our Cookie Policy.

## 10. Third-Party Links

Our website may contain links to third-party websites. We are not responsible for the privacy practices of these websites. We encourage you to read their privacy policies.

## 11. Children's Privacy

Our services are not intended for children under 16. We do not knowingly collect personal data from children under 16.

## 12. International Data Transfers

Your data may be transferred to and processed in countries outside the European Economic Area (EEA). We ensure appropriate safeguards are in place for such transfers.

## 13. Changes to This Privacy Policy

We may update this privacy policy from time to time. We will notify you of any changes by posting the new privacy policy on this page and updating the "Last Updated" date.

## 14. Contact Us

If you have any questions about this privacy policy or our data practices, please contact us:

- **Email:** ${contactEmail || '[contact@your-site.com]'}
- **Website:** ${siteUrl || '[your-website.com]'}

---

*This privacy policy was generated on ${new Date().toLocaleDateString()} and is compliant with GDPR requirements.*
`;

    res.json({
      success: true,
      template,
      sections: [
        'Introduction',
        'Information We Collect',
        'How We Use Your Data',
        'Legal Basis for Processing',
        'Data Sharing',
        'Your Rights Under GDPR',
        'Data Retention',
        'Data Security',
        'Cookies',
        'Third-Party Links',
        "Children's Privacy",
        'International Data Transfers',
        'Changes to Privacy Policy',
        'Contact Information',
      ],
    });
  } catch (error) {
    console.error('Failed to generate privacy policy template:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate template',
    });
  }
});

/**
 * Health Check
 * GET /api/legal-compliance/health
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'Legal Compliance Service',
    status: 'operational',
    features: [
      'GDPR compliance checking',
      'Cookie consent detection',
      'Privacy policy detection',
      'Terms of service detection',
      'Legal links discovery',
      'Preservation planning',
      'WordPress plugin recommendations',
    ],
    version: '1.0.0',
  });
});

export default router;
