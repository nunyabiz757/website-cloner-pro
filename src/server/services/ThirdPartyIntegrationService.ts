import * as cheerio from 'cheerio';

interface Integration {
  name: string;
  category:
    | 'analytics'
    | 'advertising'
    | 'social'
    | 'cdn'
    | 'payment'
    | 'chat'
    | 'email'
    | 'maps'
    | 'video'
    | 'auth'
    | 'cms'
    | 'other';
  scripts: string[];
  apiKeys: string[];
  configFound: boolean;
  privacyImpact: 'high' | 'medium' | 'low';
  recommendation: string;
}

interface IntegrationAnalysis {
  integrations: Integration[];
  totalScripts: number;
  thirdPartyDomains: string[];
  cookiesUsed: string[];
  trackingFound: boolean;
  gdprCompliant: boolean;
  recommendations: string[];
}

export class ThirdPartyIntegrationService {
  private readonly integrationPatterns: Record<
    string,
    {
      category: Integration['category'];
      patterns: string[];
      privacyImpact: Integration['privacyImpact'];
      recommendation: string;
    }
  > = {
    'Google Analytics': {
      category: 'analytics',
      patterns: [
        'google-analytics.com',
        'googletagmanager.com',
        'gtag',
        'ga(',
        'analytics.js',
        'gtm.js',
      ],
      privacyImpact: 'high',
      recommendation: 'Ensure proper cookie consent banner and privacy policy.',
    },
    'Google Tag Manager': {
      category: 'analytics',
      patterns: ['googletagmanager.com', 'gtm.js', 'GTM-'],
      privacyImpact: 'high',
      recommendation: 'Review all tags for compliance and implement consent mode.',
    },
    'Facebook Pixel': {
      category: 'advertising',
      patterns: ['facebook.net', 'fbevents.js', 'fbq(', 'facebook-jssdk'],
      privacyImpact: 'high',
      recommendation: 'Implement Facebook pixel with proper user consent.',
    },
    'Google Ads': {
      category: 'advertising',
      patterns: ['googleadservices.com', 'googlesyndication.com', 'adsbygoogle'],
      privacyImpact: 'high',
      recommendation: 'Ensure ads comply with privacy regulations.',
    },
    Hotjar: {
      category: 'analytics',
      patterns: ['hotjar.com', 'hj(', '_hjSettings'],
      privacyImpact: 'high',
      recommendation: 'Configure Hotjar to respect DNT and implement opt-out.',
    },
    Mixpanel: {
      category: 'analytics',
      patterns: ['mixpanel.com', 'mixpanel.'],
      privacyImpact: 'high',
      recommendation: 'Enable GDPR-compliant data collection in Mixpanel.',
    },
    'Segment.io': {
      category: 'analytics',
      patterns: ['segment.com', 'segment.io', 'analytics.load'],
      privacyImpact: 'high',
      recommendation: 'Configure Segment consent management.',
    },
    Stripe: {
      category: 'payment',
      patterns: ['stripe.com', 'Stripe(', 'stripe.js'],
      privacyImpact: 'medium',
      recommendation: 'Stripe is PCI-compliant. Ensure proper SSL configuration.',
    },
    PayPal: {
      category: 'payment',
      patterns: ['paypal.com', 'paypalobjects.com', 'paypal-sdk'],
      privacyImpact: 'medium',
      recommendation: 'PayPal handles payment data securely.',
    },
    Intercom: {
      category: 'chat',
      patterns: ['intercom.io', 'intercom.com', 'Intercom('],
      privacyImpact: 'medium',
      recommendation: 'Configure Intercom for GDPR compliance.',
    },
    Zendesk: {
      category: 'chat',
      patterns: ['zendesk.com', 'zdassets.com', 'zE('],
      privacyImpact: 'medium',
      recommendation: 'Enable Zendesk privacy settings.',
    },
    'Drift Chat': {
      category: 'chat',
      patterns: ['drift.com', 'drift.js', 'driftt.com'],
      privacyImpact: 'medium',
      recommendation: 'Configure Drift for privacy compliance.',
    },
    Mailchimp: {
      category: 'email',
      patterns: ['mailchimp.com', 'list-manage.com', 'mc.js'],
      privacyImpact: 'medium',
      recommendation: 'Ensure email signup has proper consent checkbox.',
    },
    'Google Maps': {
      category: 'maps',
      patterns: ['maps.googleapis.com', 'maps.google.com', 'google.maps'],
      privacyImpact: 'low',
      recommendation: 'Google Maps API key should be restricted to your domain.',
    },
    'Mapbox': {
      category: 'maps',
      patterns: ['mapbox.com', 'mapbox-gl.js'],
      privacyImpact: 'low',
      recommendation: 'Mapbox respects user privacy. No action needed.',
    },
    YouTube: {
      category: 'video',
      patterns: ['youtube.com', 'ytimg.com', 'youtube-nocookie.com'],
      privacyImpact: 'medium',
      recommendation: 'Use youtube-nocookie.com for privacy-enhanced mode.',
    },
    Vimeo: {
      category: 'video',
      patterns: ['vimeo.com', 'vimeocdn.com', 'player.vimeo'],
      privacyImpact: 'low',
      recommendation: 'Vimeo is privacy-friendly. No action needed.',
    },
    'Auth0': {
      category: 'auth',
      patterns: ['auth0.com', 'auth0-cdn', 'webAuth'],
      privacyImpact: 'medium',
      recommendation: 'Auth0 is SOC 2 certified. Ensure proper configuration.',
    },
    Firebase: {
      category: 'auth',
      patterns: ['firebase', 'firebaseio.com', 'firestore'],
      privacyImpact: 'medium',
      recommendation: 'Configure Firebase security rules properly.',
    },
    WordPress: {
      category: 'cms',
      patterns: ['wp-content', 'wp-includes', 'wp-json'],
      privacyImpact: 'low',
      recommendation: 'Keep WordPress and plugins updated for security.',
    },
    Cloudflare: {
      category: 'cdn',
      patterns: ['cloudflare.com', 'cdnjs.cloudflare.com'],
      privacyImpact: 'low',
      recommendation: 'Cloudflare CDN is privacy-friendly.',
    },
    'jsDelivr': {
      category: 'cdn',
      patterns: ['jsdelivr.net', 'cdn.jsdelivr'],
      privacyImpact: 'low',
      recommendation: 'jsDelivr does not track users.',
    },
    unpkg: {
      category: 'cdn',
      patterns: ['unpkg.com'],
      privacyImpact: 'low',
      recommendation: 'unpkg is a privacy-friendly CDN.',
    },
    'Twitter Widgets': {
      category: 'social',
      patterns: ['twitter.com/widgets', 'platform.twitter.com'],
      privacyImpact: 'high',
      recommendation: 'Twitter widgets set tracking cookies. Implement consent.',
    },
    'LinkedIn Insights': {
      category: 'advertising',
      patterns: ['linkedin.com', 'platform.linkedin.com', 'licdn.com'],
      privacyImpact: 'high',
      recommendation: 'LinkedIn tracking requires user consent.',
    },
    Disqus: {
      category: 'social',
      patterns: ['disqus.com', 'disquscdn.com'],
      privacyImpact: 'high',
      recommendation: 'Disqus is ad-supported. Consider privacy-friendly alternatives.',
    },
  };

  /**
   * Analyze third-party integrations in website
   */
  async analyzeIntegrations(htmlContent: string, jsContent?: string[]): Promise<IntegrationAnalysis> {
    const $ = cheerio.load(htmlContent);
    const integrations: Integration[] = [];
    const thirdPartyDomains = new Set<string>();
    const allContent = [htmlContent, ...(jsContent || [])].join(' ');

    // Detect integrations
    for (const [name, config] of Object.entries(this.integrationPatterns)) {
      const scripts: string[] = [];
      const apiKeys: string[] = [];
      let configFound = false;

      // Check for patterns
      for (const pattern of config.patterns) {
        if (allContent.includes(pattern)) {
          configFound = true;

          // Find script URLs
          $('script[src]').each((_, el) => {
            const src = $(el).attr('src');
            if (src && src.includes(pattern)) {
              scripts.push(src);
              this.extractDomain(src, thirdPartyDomains);
            }
          });

          // Look for API keys
          const apiKeyMatches = allContent.match(
            new RegExp(`(${pattern}[^'"\\s]{10,})`, 'g')
          );
          if (apiKeyMatches) {
            apiKeys.push(...apiKeyMatches);
          }
        }
      }

      if (configFound) {
        integrations.push({
          name,
          category: config.category,
          scripts,
          apiKeys: [...new Set(apiKeys)],
          configFound,
          privacyImpact: config.privacyImpact,
          recommendation: config.recommendation,
        });
      }
    }

    // Detect all third-party scripts
    $('script[src]').each((_, el) => {
      const src = $(el).attr('src');
      if (src) {
        this.extractDomain(src, thirdPartyDomains);
      }
    });

    // Detect cookies
    const cookiesUsed = this.detectCookies(allContent);

    // Check for tracking
    const trackingFound = this.detectTracking(allContent);

    // Check GDPR compliance indicators
    const gdprCompliant = this.checkGDPRCompliance(htmlContent);

    // Generate recommendations
    const recommendations = this.generateRecommendations(
      integrations,
      trackingFound,
      gdprCompliant
    );

    return {
      integrations,
      totalScripts: $('script').length,
      thirdPartyDomains: Array.from(thirdPartyDomains),
      cookiesUsed,
      trackingFound,
      gdprCompliant,
      recommendations,
    };
  }

  /**
   * Extract domain from URL
   */
  private extractDomain(url: string, domains: Set<string>): void {
    try {
      const urlObj = new URL(url, 'http://dummy.com');
      if (urlObj.hostname !== 'dummy.com') {
        domains.add(urlObj.hostname);
      }
    } catch {
      // Invalid URL
    }
  }

  /**
   * Detect cookies being set
   */
  private detectCookies(content: string): string[] {
    const cookies: string[] = [];
    const cookiePatterns = [
      /document\.cookie\s*=\s*['"]([^'"]+)['"]/g,
      /setCookie\(['"]([^'"]+)['"]/g,
      /__utm[a-z]/g,
      /_ga/g,
      /_fbp/g,
      /_gcl_/g,
    ];

    for (const pattern of cookiePatterns) {
      const matches = content.matchAll(pattern);
      for (const match of matches) {
        cookies.push(match[1] || match[0]);
      }
    }

    return [...new Set(cookies)];
  }

  /**
   * Detect tracking scripts
   */
  private detectTracking(content: string): boolean {
    const trackingIndicators = [
      'analytics',
      'tracking',
      'pixel',
      'beacon',
      'utm_',
      'fbclid',
      'gclid',
      'msclkid',
      'track(',
      'trackEvent',
      'pageview',
    ];

    return trackingIndicators.some((indicator) =>
      content.toLowerCase().includes(indicator.toLowerCase())
    );
  }

  /**
   * Check for GDPR compliance indicators
   */
  private checkGDPRCompliance(htmlContent: string): boolean {
    const $ = cheerio.load(htmlContent);
    const complianceIndicators = [
      'cookie consent',
      'cookie banner',
      'privacy policy',
      'gdpr',
      'data protection',
      'cookie-consent',
      'cookieconsent',
      'consent-banner',
    ];

    const pageText = $('body').text().toLowerCase();

    return complianceIndicators.some((indicator) => pageText.includes(indicator));
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(
    integrations: Integration[],
    trackingFound: boolean,
    gdprCompliant: boolean
  ): string[] {
    const recommendations: string[] = [];

    // Privacy recommendations
    if (trackingFound && !gdprCompliant) {
      recommendations.push(
        'CRITICAL: Tracking detected without visible cookie consent. Implement GDPR-compliant consent banner.'
      );
    }

    // High-impact integrations
    const highImpactIntegrations = integrations.filter((i) => i.privacyImpact === 'high');
    if (highImpactIntegrations.length > 0) {
      recommendations.push(
        `Found ${highImpactIntegrations.length} high-privacy-impact integrations: ${highImpactIntegrations
          .map((i) => i.name)
          .join(', ')}. Ensure proper consent management.`
      );
    }

    // API key security
    const exposedKeys = integrations.filter((i) => i.apiKeys.length > 0);
    if (exposedKeys.length > 0) {
      recommendations.push(
        'WARNING: API keys detected in client-side code. Consider using environment variables and server-side proxies.'
      );
    }

    // CDN recommendations
    const cdnIntegrations = integrations.filter((i) => i.category === 'cdn');
    if (cdnIntegrations.length === 0) {
      recommendations.push(
        'Consider using a CDN (Cloudflare, jsDelivr) for better performance and reliability.'
      );
    }

    // Analytics recommendations
    const analyticsIntegrations = integrations.filter((i) => i.category === 'analytics');
    if (analyticsIntegrations.length > 2) {
      recommendations.push(
        `Multiple analytics tools detected (${analyticsIntegrations.length}). Consider consolidating to reduce overhead.`
      );
    }

    // Payment security
    const paymentIntegrations = integrations.filter((i) => i.category === 'payment');
    if (paymentIntegrations.length > 0) {
      recommendations.push(
        'Payment integrations detected. Ensure SSL/TLS is properly configured and PCI-DSS compliance is maintained.'
      );
    }

    // Social media tracking
    const socialIntegrations = integrations.filter((i) => i.category === 'social');
    if (socialIntegrations.length > 0) {
      recommendations.push(
        'Social media integrations can impact privacy. Consider lazy-loading or using privacy-friendly alternatives.'
      );
    }

    return recommendations;
  }

  /**
   * Generate integration replacement code
   */
  generateReplacementCode(integration: Integration): {
    original: string;
    privacyFriendly: string;
    explanation: string;
  } {
    const replacements: Record<
      string,
      { original: string; privacyFriendly: string; explanation: string }
    > = {
      'Google Analytics': {
        original: `<!-- Google Analytics -->
<script async src="https://www.googletagmanager.com/gtag/js?id=GA_MEASUREMENT_ID"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'GA_MEASUREMENT_ID');
</script>`,
        privacyFriendly: `<!-- Google Analytics with Consent -->
<script async src="https://www.googletagmanager.com/gtag/js?id=GA_MEASUREMENT_ID"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('consent', 'default', {
    'analytics_storage': 'denied',
    'ad_storage': 'denied'
  });
  gtag('js', new Date());
  gtag('config', 'GA_MEASUREMENT_ID', {
    'anonymize_ip': true
  });

  // Grant consent when user accepts
  function grantAnalyticsConsent() {
    gtag('consent', 'update', {
      'analytics_storage': 'granted'
    });
  }
</script>`,
        explanation:
          'Added Google Consent Mode v2 with denied default state and IP anonymization.',
      },
      YouTube: {
        original: `<iframe src="https://www.youtube.com/embed/VIDEO_ID" frameborder="0" allowfullscreen></iframe>`,
        privacyFriendly: `<iframe src="https://www.youtube-nocookie.com/embed/VIDEO_ID" frameborder="0" allowfullscreen></iframe>`,
        explanation:
          'Switched to youtube-nocookie.com domain which does not set tracking cookies.',
      },
      'Facebook Pixel': {
        original: `<!-- Facebook Pixel Code -->
<script>
  !function(f,b,e,v,n,t,s)
  {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
  n.callMethod.apply(n,arguments):n.queue.push(arguments)};
  if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
  n.queue=[];t=b.createElement(e);t.async=!0;
  t.src=v;s=b.getElementsByTagName(e)[0];
  s.parentNode.insertBefore(t,s)}(window, document,'script',
  'https://connect.facebook.net/en_US/fbevents.js');
  fbq('init', 'YOUR_PIXEL_ID');
  fbq('track', 'PageView');
</script>`,
        privacyFriendly: `<!-- Facebook Pixel with Consent -->
<script>
  // Only load after user consent
  function loadFacebookPixel() {
    !function(f,b,e,v,n,t,s)
    {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};
    if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
    n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t,s)}(window, document,'script',
    'https://connect.facebook.net/en_US/fbevents.js');
    fbq('init', 'YOUR_PIXEL_ID');
    fbq('track', 'PageView');
  }

  // Call loadFacebookPixel() after user grants consent
</script>`,
        explanation:
          'Wrapped Facebook Pixel in a function that only executes after user consent.',
      },
    };

    return (
      replacements[integration.name] || {
        original: 'N/A',
        privacyFriendly: 'No privacy-enhanced alternative available',
        explanation: 'Review privacy policy and implement proper consent management.',
      }
    );
  }

  /**
   * Generate consent banner HTML
   */
  generateConsentBanner(): string {
    return `<!-- GDPR Cookie Consent Banner -->
<style>
  .cookie-consent-banner {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    background: rgba(0, 0, 0, 0.9);
    color: white;
    padding: 20px;
    z-index: 9999;
    display: none;
  }
  .cookie-consent-banner.show {
    display: block;
  }
  .cookie-consent-content {
    max-width: 1200px;
    margin: 0 auto;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
  }
  .cookie-consent-buttons {
    display: flex;
    gap: 10px;
  }
  .cookie-consent-button {
    padding: 10px 20px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-weight: bold;
  }
  .cookie-consent-accept {
    background: #4CAF50;
    color: white;
  }
  .cookie-consent-decline {
    background: #f44336;
    color: white;
  }
</style>

<div id="cookieConsentBanner" class="cookie-consent-banner">
  <div class="cookie-consent-content">
    <p>
      We use cookies to enhance your experience. By continuing to visit this site you agree to our use of cookies.
      <a href="/privacy-policy" style="color: #4CAF50;">Learn more</a>
    </p>
    <div class="cookie-consent-buttons">
      <button class="cookie-consent-button cookie-consent-decline" onclick="declineCookies()">
        Decline
      </button>
      <button class="cookie-consent-button cookie-consent-accept" onclick="acceptCookies()">
        Accept
      </button>
    </div>
  </div>
</div>

<script>
  // Check if user has already made a choice
  function getCookieConsent() {
    return localStorage.getItem('cookieConsent');
  }

  function setCookieConsent(value) {
    localStorage.setItem('cookieConsent', value);
  }

  function showConsentBanner() {
    document.getElementById('cookieConsentBanner').classList.add('show');
  }

  function hideConsentBanner() {
    document.getElementById('cookieConsentBanner').classList.remove('show');
  }

  function acceptCookies() {
    setCookieConsent('accepted');
    hideConsentBanner();
    // Load analytics and tracking scripts here
    loadTrackingScripts();
  }

  function declineCookies() {
    setCookieConsent('declined');
    hideConsentBanner();
    // Do not load tracking scripts
  }

  function loadTrackingScripts() {
    // Load Google Analytics, Facebook Pixel, etc.
    // Only after user accepts cookies
  }

  // Show banner if user hasn't made a choice
  if (!getCookieConsent()) {
    showConsentBanner();
  } else if (getCookieConsent() === 'accepted') {
    loadTrackingScripts();
  }
</script>`;
  }
}
