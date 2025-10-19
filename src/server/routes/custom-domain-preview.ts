import express from 'express';
import CustomDomainPreviewService from '../services/CustomDomainPreviewService.js';

const router = express.Router();

/**
 * Create Temporary Subdomain
 * POST /api/custom-domain-preview/create-subdomain
 */
router.post('/create-subdomain', async (req, res) => {
  try {
    const { projectId, userId, preferredSubdomain, expirationDays, settings } = req.body;

    if (!projectId) {
      return res.status(400).json({
        success: false,
        error: 'Project ID is required',
      });
    }

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required',
      });
    }

    const domain = await CustomDomainPreviewService.createSubdomain({
      projectId,
      userId,
      preferredSubdomain,
      expirationDays,
      settings,
    });

    res.json({
      success: true,
      domain,
      previewUrl: `https://${domain.fullDomain}`,
    });
  } catch (error) {
    console.error('Failed to create subdomain:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create subdomain',
    });
  }
});

/**
 * Add Custom Domain
 * POST /api/custom-domain-preview/add-custom-domain
 */
router.post('/add-custom-domain', async (req, res) => {
  try {
    const { previewDomainId, customDomain, sslProvider } = req.body;

    if (!previewDomainId) {
      return res.status(400).json({
        success: false,
        error: 'Preview domain ID is required',
      });
    }

    if (!customDomain) {
      return res.status(400).json({
        success: false,
        error: 'Custom domain is required',
      });
    }

    const domain = await CustomDomainPreviewService.addCustomDomain({
      previewDomainId,
      customDomain,
      sslProvider,
    });

    res.json({
      success: true,
      domain,
      previewUrl: `https://${domain.customDomain}`,
    });
  } catch (error) {
    console.error('Failed to add custom domain:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to add custom domain',
    });
  }
});

/**
 * Verify DNS Configuration
 * POST /api/custom-domain-preview/verify-dns
 */
router.post('/verify-dns', async (req, res) => {
  try {
    const { domain } = req.body;

    if (!domain) {
      return res.status(400).json({
        success: false,
        error: 'Domain is required',
      });
    }

    const verification = await CustomDomainPreviewService.verifyDNS(domain);

    res.json({
      success: true,
      verification,
    });
  } catch (error) {
    console.error('Failed to verify DNS:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to verify DNS',
    });
  }
});

/**
 * Get SSL Setup Instructions
 * POST /api/custom-domain-preview/ssl-setup
 */
router.post('/ssl-setup', async (req, res) => {
  try {
    const { domain, provider = 'letsencrypt' } = req.body;

    if (!domain) {
      return res.status(400).json({
        success: false,
        error: 'Domain is required',
      });
    }

    const sslSetup = await CustomDomainPreviewService.setupSSL(domain, provider);

    res.json({
      success: true,
      sslSetup,
    });
  } catch (error) {
    console.error('Failed to get SSL setup:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get SSL setup',
    });
  }
});

/**
 * Get Domain Configuration
 * GET /api/custom-domain-preview/:domainId/configuration
 */
router.get('/:domainId/configuration', async (req, res) => {
  try {
    const { domainId } = req.params;

    const configuration = await CustomDomainPreviewService.getDomainConfiguration(domainId);

    res.json({
      success: true,
      configuration,
    });
  } catch (error) {
    console.error('Failed to get domain configuration:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get configuration',
    });
  }
});

/**
 * Update Domain Settings
 * PATCH /api/custom-domain-preview/:domainId/settings
 */
router.patch('/:domainId/settings', async (req, res) => {
  try {
    const { domainId } = req.params;
    const settings = req.body;

    const domain = await CustomDomainPreviewService.updateSettings(domainId, settings);

    res.json({
      success: true,
      domain,
    });
  } catch (error) {
    console.error('Failed to update settings:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update settings',
    });
  }
});

/**
 * Get Domain Details
 * GET /api/custom-domain-preview/:domainId
 */
router.get('/:domainId', async (req, res) => {
  try {
    const { domainId } = req.params;

    const domain = await CustomDomainPreviewService.getDomain(domainId);

    if (!domain) {
      return res.status(404).json({
        success: false,
        error: 'Domain not found',
      });
    }

    res.json({
      success: true,
      domain,
    });
  } catch (error) {
    console.error('Failed to get domain:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get domain',
    });
  }
});

/**
 * List User Domains
 * GET /api/custom-domain-preview/user/:userId
 */
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const domains = await CustomDomainPreviewService.listDomains(userId);

    res.json({
      success: true,
      domains,
      totalDomains: domains.length,
    });
  } catch (error) {
    console.error('Failed to list domains:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to list domains',
    });
  }
});

/**
 * Extend Domain Expiration
 * POST /api/custom-domain-preview/:domainId/extend
 */
router.post('/:domainId/extend', async (req, res) => {
  try {
    const { domainId } = req.params;
    const { days = 30 } = req.body;

    const domain = await CustomDomainPreviewService.extendExpiration(domainId, days);

    res.json({
      success: true,
      domain,
      newExpirationDate: domain.expiresAt,
    });
  } catch (error) {
    console.error('Failed to extend expiration:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to extend expiration',
    });
  }
});

/**
 * Delete Domain
 * DELETE /api/custom-domain-preview/:domainId
 */
router.delete('/:domainId', async (req, res) => {
  try {
    const { domainId } = req.params;

    await CustomDomainPreviewService.deleteDomain(domainId);

    res.json({
      success: true,
      message: 'Domain deleted successfully',
    });
  } catch (error) {
    console.error('Failed to delete domain:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete domain',
    });
  }
});

/**
 * Get SSL Providers Information
 * GET /api/custom-domain-preview/ssl-providers
 */
router.get('/info/ssl-providers', (req, res) => {
  try {
    const providers = [
      {
        id: 'letsencrypt',
        name: "Let's Encrypt",
        description: 'Free, automated SSL certificates',
        pros: [
          'Completely free',
          'Automated renewal',
          'Trusted by all browsers',
          'Easy setup with Certbot',
        ],
        cons: [
          '90-day certificate validity',
          'Requires server access',
          'Rate limits apply',
        ],
        cost: 'Free',
        renewal: 'Automatic (every 90 days)',
        recommended: true,
        setupDifficulty: 'Easy',
      },
      {
        id: 'cloudflare',
        name: 'Cloudflare SSL',
        description: 'Free SSL with Cloudflare service',
        pros: [
          'Free with Cloudflare',
          'Automatic management',
          'DDoS protection included',
          'CDN included',
        ],
        cons: [
          'Requires using Cloudflare nameservers',
          'Some features require paid plan',
          'Additional layer of complexity',
        ],
        cost: 'Free',
        renewal: 'Automatic',
        recommended: true,
        setupDifficulty: 'Medium',
      },
      {
        id: 'manual',
        name: 'Manual/Commercial SSL',
        description: 'Purchased SSL certificate from any provider',
        pros: [
          'Longer validity (1-2 years)',
          'Extended validation available',
          'Full control',
          'Organization validation',
        ],
        cons: [
          'Cost ($50-$300/year)',
          'Manual renewal required',
          'More complex setup',
          'CSR generation needed',
        ],
        cost: '$50-$300/year',
        renewal: 'Manual (annually)',
        recommended: false,
        setupDifficulty: 'Hard',
      },
    ];

    res.json({
      success: true,
      providers,
      recommendation: 'letsencrypt',
    });
  } catch (error) {
    console.error('Failed to get SSL providers:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get providers',
    });
  }
});

/**
 * Get DNS Provider Instructions
 * GET /api/custom-domain-preview/dns-instructions
 */
router.get('/info/dns-instructions', (req, res) => {
  try {
    const providers = {
      cloudflare: {
        name: 'Cloudflare',
        steps: [
          'Log in to Cloudflare dashboard',
          'Select your domain',
          'Go to DNS settings',
          'Click "Add record"',
          'Select record type (A or CNAME)',
          'Enter name and target value',
          'Click "Save"',
          'Wait for DNS propagation (usually 5-10 minutes)',
        ],
        url: 'https://dash.cloudflare.com/',
      },
      godaddy: {
        name: 'GoDaddy',
        steps: [
          'Log in to GoDaddy account',
          'Go to "My Products"',
          'Click "DNS" next to your domain',
          'Click "Add" to add a new record',
          'Select record type',
          'Enter name and value',
          'Click "Save"',
          'Wait for propagation (can take up to 48 hours)',
        ],
        url: 'https://dcc.godaddy.com/',
      },
      namecheap: {
        name: 'Namecheap',
        steps: [
          'Log in to Namecheap',
          'Go to Domain List',
          'Click "Manage" next to your domain',
          'Go to "Advanced DNS" tab',
          'Click "Add New Record"',
          'Select record type and enter values',
          'Click the checkmark to save',
          'Wait for propagation (30 minutes to 48 hours)',
        ],
        url: 'https://www.namecheap.com/myaccount/login/',
      },
      route53: {
        name: 'AWS Route 53',
        steps: [
          'Log in to AWS Console',
          'Go to Route 53 service',
          'Select your hosted zone',
          'Click "Create record"',
          'Enter record name and value',
          'Select record type',
          'Click "Create records"',
          'Propagation is usually very fast (minutes)',
        ],
        url: 'https://console.aws.amazon.com/route53/',
      },
      other: {
        name: 'Other DNS Provider',
        steps: [
          'Log in to your DNS provider',
          'Find DNS management or DNS settings',
          'Look for "Add Record" or "Add DNS Record"',
          'Add an A record pointing to the server IP',
          'Add a CNAME record for www subdomain',
          'Save changes',
          'Wait for DNS propagation',
        ],
      },
    };

    res.json({
      success: true,
      providers,
    });
  } catch (error) {
    console.error('Failed to get DNS instructions:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get instructions',
    });
  }
});

/**
 * Health Check
 * GET /api/custom-domain-preview/health
 */
router.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'Custom Domain Preview Service',
    status: 'operational',
    features: [
      'Temporary subdomain assignment',
      'Custom domain configuration',
      'DNS verification',
      'SSL certificate handling',
      'Nginx/Apache configuration generation',
      'Domain settings management',
    ],
    sslProviders: ['letsencrypt', 'cloudflare', 'manual'],
    version: '1.0.0',
  });
});

export default router;
