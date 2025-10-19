import * as cheerio from 'cheerio';

/**
 * Legal Compliance Service
 *
 * Detects and preserves legal compliance elements including:
 * - GDPR compliance features
 * - Cookie consent mechanisms
 * - Privacy policy links
 * - Terms of service links
 */

// Types
export interface GDPRComplianceResult {
  isCompliant: boolean;
  score: number; // 0-100
  features: GDPRFeature[];
  cookieConsent: CookieConsentDetection;
  dataProcessing: DataProcessingInfo;
  userRights: UserRightsInfo;
  recommendations: string[];
  missingFeatures: string[];
}

export interface GDPRFeature {
  feature: string;
  present: boolean;
  implementation: string;
  confidence: number;
  location?: string;
}

export interface CookieConsentDetection {
  hasConsent: boolean;
  mechanism: 'banner' | 'modal' | 'popup' | 'inline' | 'none';
  provider: string; // e.g., 'OneTrust', 'Cookiebot', 'custom'
  features: CookieConsentFeature[];
  categories: CookieCategory[];
  scripts: string[];
  confidence: number;
}

export interface CookieConsentFeature {
  name: string;
  present: boolean;
  description: string;
}

export interface CookieCategory {
  name: string;
  description: string;
  required: boolean;
}

export interface DataProcessingInfo {
  hasDataCollection: boolean;
  collectionMethods: string[];
  hasEncryption: boolean;
  hasSecureTransmission: boolean;
  thirdPartyServices: string[];
}

export interface UserRightsInfo {
  hasAccessRight: boolean; // Right to access data
  hasRectificationRight: boolean; // Right to correct data
  hasErasureRight: boolean; // Right to deletion ("right to be forgotten")
  hasPortabilityRight: boolean; // Right to data portability
  hasObjectionRight: boolean; // Right to object to processing
  implementationNotes: string[];
}

export interface PrivacyPolicyDetection {
  hasPrivacyPolicy: boolean;
  links: PolicyLink[];
  content?: string;
  lastUpdated?: string;
  sections: PolicySection[];
  gdprCompliant: boolean;
  recommendations: string[];
}

export interface PolicyLink {
  text: string;
  href: string;
  location: 'header' | 'footer' | 'content' | 'other';
  confidence: number;
}

export interface PolicySection {
  title: string;
  present: boolean;
  importance: 'required' | 'recommended' | 'optional';
}

export interface TermsOfServiceDetection {
  hasTerms: boolean;
  links: PolicyLink[];
  content?: string;
  lastUpdated?: string;
  sections: TermsSection[];
  recommendations: string[];
}

export interface TermsSection {
  title: string;
  present: boolean;
  importance: 'required' | 'recommended' | 'optional';
}

export interface LegalLinksReport {
  privacyPolicy: PrivacyPolicyDetection;
  termsOfService: TermsOfServiceDetection;
  otherLegalLinks: PolicyLink[];
  allLinks: PolicyLink[];
}

export interface CompliancePreservationPlan {
  gdprFeatures: PreservationItem[];
  cookieConsent: PreservationItem[];
  privacyPolicy: PreservationItem[];
  termsOfService: PreservationItem[];
  recommendations: string[];
  wordPressPlugins: WordPressCompliancePlugin[];
}

export interface PreservationItem {
  feature: string;
  action: 'preserve' | 'recreate' | 'manual';
  implementation: string;
  priority: 'high' | 'medium' | 'low';
  notes: string;
}

export interface WordPressCompliancePlugin {
  name: string;
  purpose: string;
  features: string[];
  free: boolean;
  recommended: boolean;
  wpOrgUrl?: string;
}

class LegalComplianceService {
  /**
   * Check GDPR compliance
   */
  async checkGDPRCompliance(html: string, url: string): Promise<GDPRComplianceResult> {
    const $ = cheerio.load(html);

    // Detect GDPR features
    const features = this.detectGDPRFeatures($, html);

    // Detect cookie consent
    const cookieConsent = this.detectCookieConsent($, html);

    // Detect data processing
    const dataProcessing = this.detectDataProcessing($, html);

    // Detect user rights implementation
    const userRights = this.detectUserRights($, html);

    // Calculate compliance score
    const score = this.calculateGDPRScore(features, cookieConsent, dataProcessing, userRights);

    // Generate recommendations
    const recommendations = this.generateGDPRRecommendations(features, cookieConsent, dataProcessing, userRights);

    // Find missing features
    const missingFeatures = features.filter(f => !f.present).map(f => f.feature);

    return {
      isCompliant: score >= 70, // 70% threshold for basic compliance
      score,
      features,
      cookieConsent,
      dataProcessing,
      userRights,
      recommendations,
      missingFeatures,
    };
  }

  /**
   * Detect GDPR features
   */
  private detectGDPRFeatures($: cheerio.CheerioAPI, html: string): GDPRFeature[] {
    const features: GDPRFeature[] = [];

    // Cookie consent banner/modal
    const hasCookieBanner = this.hasCookieConsentBanner($, html);
    features.push({
      feature: 'Cookie Consent Banner',
      present: hasCookieBanner,
      implementation: hasCookieBanner ? 'Detected cookie consent mechanism' : 'Not detected',
      confidence: hasCookieBanner ? 0.9 : 0.1,
    });

    // Privacy policy link
    const hasPrivacyLink = this.hasPrivacyPolicyLink($);
    features.push({
      feature: 'Privacy Policy',
      present: hasPrivacyLink,
      implementation: hasPrivacyLink ? 'Privacy policy link found' : 'Not found',
      confidence: hasPrivacyLink ? 0.95 : 0.1,
    });

    // Data processing transparency
    const hasDataProcessingInfo = this.hasDataProcessingInfo(html);
    features.push({
      feature: 'Data Processing Transparency',
      present: hasDataProcessingInfo,
      implementation: hasDataProcessingInfo ? 'Data processing information provided' : 'Not found',
      confidence: hasDataProcessingInfo ? 0.7 : 0.1,
    });

    // User consent for data collection
    const hasConsentMechanism = this.hasConsentMechanism($, html);
    features.push({
      feature: 'User Consent Mechanism',
      present: hasConsentMechanism,
      implementation: hasConsentMechanism ? 'Consent mechanism detected' : 'Not detected',
      confidence: hasConsentMechanism ? 0.85 : 0.1,
    });

    // Right to access data
    const hasDataAccessRight = html.toLowerCase().includes('right to access') ||
                               html.toLowerCase().includes('access your data');
    features.push({
      feature: 'Right to Access Data',
      present: hasDataAccessRight,
      implementation: hasDataAccessRight ? 'Mentioned in content' : 'Not mentioned',
      confidence: hasDataAccessRight ? 0.6 : 0.1,
    });

    // Right to deletion (right to be forgotten)
    const hasRightToErasure = html.toLowerCase().includes('right to be forgotten') ||
                              html.toLowerCase().includes('right to deletion') ||
                              html.toLowerCase().includes('delete your data');
    features.push({
      feature: 'Right to Erasure/Deletion',
      present: hasRightToErasure,
      implementation: hasRightToErasure ? 'Mentioned in content' : 'Not mentioned',
      confidence: hasRightToErasure ? 0.6 : 0.1,
    });

    // Data portability
    const hasDataPortability = html.toLowerCase().includes('data portability') ||
                               html.toLowerCase().includes('export your data');
    features.push({
      feature: 'Data Portability',
      present: hasDataPortability,
      implementation: hasDataPortability ? 'Mentioned in content' : 'Not mentioned',
      confidence: hasDataPortability ? 0.6 : 0.1,
    });

    // SSL/HTTPS encryption
    const hasSSL = html.includes('https://') || $('link[href^="https://"]').length > 0;
    features.push({
      feature: 'SSL/HTTPS Encryption',
      present: hasSSL,
      implementation: hasSSL ? 'HTTPS links detected' : 'No HTTPS detected',
      confidence: hasSSL ? 0.8 : 0.5,
    });

    return features;
  }

  /**
   * Detect cookie consent mechanism
   */
  private detectCookieConsent($: cheerio.CheerioAPI, html: string): CookieConsentDetection {
    let hasConsent = false;
    let mechanism: 'banner' | 'modal' | 'popup' | 'inline' | 'none' = 'none';
    let provider = 'custom';
    const scripts: string[] = [];

    // Check for popular cookie consent providers
    const providers = [
      { name: 'OneTrust', patterns: ['onetrust', 'optanon'] },
      { name: 'Cookiebot', patterns: ['cookiebot'] },
      { name: 'Cookie Consent', patterns: ['cookieconsent'] },
      { name: 'GDPR Cookie Compliance', patterns: ['gdpr-cookie'] },
      { name: 'Osano', patterns: ['osano'] },
      { name: 'TrustArc', patterns: ['trustarc'] },
      { name: 'Termly', patterns: ['termly'] },
    ];

    for (const p of providers) {
      for (const pattern of p.patterns) {
        if (html.toLowerCase().includes(pattern)) {
          hasConsent = true;
          provider = p.name;
          break;
        }
      }
      if (hasConsent) break;
    }

    // Check for cookie consent classes/IDs
    const consentSelectors = [
      '.cookie-consent',
      '.cookie-banner',
      '.cookie-notice',
      '#cookie-consent',
      '#cookie-banner',
      '[class*="cookie"]',
      '[id*="cookie"]',
      '.gdpr-consent',
      '.privacy-notice',
    ];

    for (const selector of consentSelectors) {
      if ($(selector).length > 0) {
        hasConsent = true;
        if (provider === 'custom') {
          provider = 'Custom Implementation';
        }

        // Determine mechanism type
        const element = $(selector).first();
        const classList = element.attr('class') || '';
        const styles = element.attr('style') || '';

        if (classList.includes('modal') || classList.includes('popup')) {
          mechanism = 'modal';
        } else if (classList.includes('banner') || styles.includes('fixed') || styles.includes('bottom')) {
          mechanism = 'banner';
        } else {
          mechanism = 'inline';
        }
        break;
      }
    }

    // Extract cookie consent scripts
    $('script').each((_, script) => {
      const src = $(script).attr('src') || '';
      const content = $(script).html() || '';

      if (src.includes('cookie') || src.includes('consent') ||
          content.includes('cookie') || content.includes('consent')) {
        scripts.push(src || 'inline-script');
      }
    });

    // Detect cookie consent features
    const features: CookieConsentFeature[] = [
      {
        name: 'Accept Button',
        present: this.hasAcceptButton($),
        description: 'Button to accept cookies',
      },
      {
        name: 'Reject Button',
        present: this.hasRejectButton($),
        description: 'Button to reject non-essential cookies',
      },
      {
        name: 'Cookie Settings',
        present: this.hasCookieSettings($, html),
        description: 'Ability to customize cookie preferences',
      },
      {
        name: 'Cookie Policy Link',
        present: this.hasCookiePolicyLink($),
        description: 'Link to detailed cookie policy',
      },
    ];

    // Detect cookie categories
    const categories: CookieCategory[] = this.detectCookieCategories($, html);

    return {
      hasConsent,
      mechanism,
      provider,
      features,
      categories,
      scripts,
      confidence: hasConsent ? 0.9 : 0.2,
    };
  }

  /**
   * Check for cookie consent banner
   */
  private hasCookieConsentBanner($: cheerio.CheerioAPI, html: string): boolean {
    const patterns = [
      'cookie-consent',
      'cookie-banner',
      'cookie-notice',
      'gdpr-consent',
      'privacy-notice',
      'onetrust',
      'cookiebot',
    ];

    for (const pattern of patterns) {
      if (html.toLowerCase().includes(pattern)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check for privacy policy link
   */
  private hasPrivacyPolicyLink($: cheerio.CheerioAPI): boolean {
    const links = $('a');
    let found = false;

    links.each((_, link) => {
      const href = $(link).attr('href') || '';
      const text = $(link).text().toLowerCase();

      if (text.includes('privacy') ||
          href.toLowerCase().includes('privacy') ||
          text.includes('datenschutz')) { // German
        found = true;
        return false; // break
      }
    });

    return found;
  }

  /**
   * Check for data processing information
   */
  private hasDataProcessingInfo(html: string): boolean {
    const keywords = [
      'data processing',
      'process your data',
      'personal data',
      'data controller',
      'data processor',
      'legitimate interest',
    ];

    const lowerHtml = html.toLowerCase();
    return keywords.some(keyword => lowerHtml.includes(keyword));
  }

  /**
   * Check for consent mechanism
   */
  private hasConsentMechanism($: cheerio.CheerioAPI, html: string): boolean {
    // Check for consent checkboxes
    const consentCheckboxes = $('input[type="checkbox"]').filter((_, el) => {
      const label = $(el).closest('label').text().toLowerCase();
      const id = $(el).attr('id') || '';
      const name = $(el).attr('name') || '';

      return label.includes('consent') ||
             label.includes('agree') ||
             id.includes('consent') ||
             name.includes('consent');
    });

    if (consentCheckboxes.length > 0) return true;

    // Check for consent buttons
    const consentButtons = $('button, input[type="submit"]').filter((_, el) => {
      const text = $(el).text().toLowerCase();
      return text.includes('accept') ||
             text.includes('agree') ||
             text.includes('consent');
    });

    if (consentButtons.length > 0) return true;

    // Check for cookie consent mechanism
    return this.hasCookieConsentBanner($, html);
  }

  /**
   * Check for accept button
   */
  private hasAcceptButton($: cheerio.CheerioAPI): boolean {
    const buttons = $('button, a, input[type="button"], input[type="submit"]');
    let found = false;

    buttons.each((_, btn) => {
      const text = $(btn).text().toLowerCase();
      const id = $(btn).attr('id') || '';
      const classList = $(btn).attr('class') || '';

      if (text.includes('accept') ||
          id.includes('accept') ||
          classList.includes('accept')) {
        found = true;
        return false; // break
      }
    });

    return found;
  }

  /**
   * Check for reject button
   */
  private hasRejectButton($: cheerio.CheerioAPI): boolean {
    const buttons = $('button, a, input[type="button"]');
    let found = false;

    buttons.each((_, btn) => {
      const text = $(btn).text().toLowerCase();
      const id = $(btn).attr('id') || '';

      if (text.includes('reject') ||
          text.includes('decline') ||
          id.includes('reject')) {
        found = true;
        return false; // break
      }
    });

    return found;
  }

  /**
   * Check for cookie settings
   */
  private hasCookieSettings($: cheerio.CheerioAPI, html: string): boolean {
    const lowerHtml = html.toLowerCase();
    return lowerHtml.includes('cookie settings') ||
           lowerHtml.includes('cookie preferences') ||
           lowerHtml.includes('manage cookies');
  }

  /**
   * Check for cookie policy link
   */
  private hasCookiePolicyLink($: cheerio.CheerioAPI): boolean {
    const links = $('a');
    let found = false;

    links.each((_, link) => {
      const text = $(link).text().toLowerCase();
      const href = $(link).attr('href') || '';

      if (text.includes('cookie') && (text.includes('policy') || text.includes('notice')) ||
          href.toLowerCase().includes('cookie')) {
        found = true;
        return false; // break
      }
    });

    return found;
  }

  /**
   * Detect cookie categories
   */
  private detectCookieCategories($: cheerio.CheerioAPI, html: string): CookieCategory[] {
    const categories: CookieCategory[] = [];
    const lowerHtml = html.toLowerCase();

    // Necessary/Essential cookies
    if (lowerHtml.includes('necessary') || lowerHtml.includes('essential')) {
      categories.push({
        name: 'Necessary',
        description: 'Essential cookies required for site functionality',
        required: true,
      });
    }

    // Functional cookies
    if (lowerHtml.includes('functional')) {
      categories.push({
        name: 'Functional',
        description: 'Cookies that enhance site functionality',
        required: false,
      });
    }

    // Analytics cookies
    if (lowerHtml.includes('analytics') || lowerHtml.includes('performance')) {
      categories.push({
        name: 'Analytics',
        description: 'Cookies for tracking site usage and performance',
        required: false,
      });
    }

    // Marketing/Advertising cookies
    if (lowerHtml.includes('marketing') || lowerHtml.includes('advertising')) {
      categories.push({
        name: 'Marketing',
        description: 'Cookies for advertising and marketing purposes',
        required: false,
      });
    }

    return categories;
  }

  /**
   * Detect data processing activities
   */
  private detectDataProcessing($: cheerio.CheerioAPI, html: string): DataProcessingInfo {
    const lowerHtml = html.toLowerCase();

    // Forms indicate data collection
    const forms = $('form');
    const hasDataCollection = forms.length > 0 ||
                              lowerHtml.includes('newsletter') ||
                              lowerHtml.includes('contact') ||
                              lowerHtml.includes('submit');

    // Detect collection methods
    const collectionMethods: string[] = [];
    if (forms.length > 0) collectionMethods.push('Forms');
    if (lowerHtml.includes('newsletter')) collectionMethods.push('Newsletter Signup');
    if (lowerHtml.includes('cookie')) collectionMethods.push('Cookies');
    if (lowerHtml.includes('analytics') || lowerHtml.includes('google-analytics')) collectionMethods.push('Analytics');

    // Check for HTTPS (encryption)
    const hasEncryption = $('link[href^="https://"]').length > 0 || html.includes('https://');

    // Check for secure transmission indicators
    const hasSecureTransmission = lowerHtml.includes('ssl') ||
                                  lowerHtml.includes('tls') ||
                                  lowerHtml.includes('encrypted');

    // Detect third-party services
    const thirdPartyServices: string[] = [];
    if (html.includes('google-analytics') || html.includes('googletagmanager')) thirdPartyServices.push('Google Analytics');
    if (html.includes('facebook')) thirdPartyServices.push('Facebook Pixel');
    if (html.includes('stripe')) thirdPartyServices.push('Stripe');
    if (html.includes('paypal')) thirdPartyServices.push('PayPal');
    if (html.includes('mailchimp')) thirdPartyServices.push('Mailchimp');

    return {
      hasDataCollection,
      collectionMethods,
      hasEncryption,
      hasSecureTransmission,
      thirdPartyServices,
    };
  }

  /**
   * Detect user rights implementation
   */
  private detectUserRights($: cheerio.CheerioAPI, html: string): UserRightsInfo {
    const lowerHtml = html.toLowerCase();

    return {
      hasAccessRight: lowerHtml.includes('right to access') ||
                      lowerHtml.includes('access your data') ||
                      lowerHtml.includes('request your data'),
      hasRectificationRight: lowerHtml.includes('right to rectification') ||
                             lowerHtml.includes('correct your data') ||
                             lowerHtml.includes('update your data'),
      hasErasureRight: lowerHtml.includes('right to be forgotten') ||
                       lowerHtml.includes('right to deletion') ||
                       lowerHtml.includes('delete your data'),
      hasPortabilityRight: lowerHtml.includes('data portability') ||
                           lowerHtml.includes('export your data') ||
                           lowerHtml.includes('download your data'),
      hasObjectionRight: lowerHtml.includes('right to object') ||
                         lowerHtml.includes('object to processing') ||
                         lowerHtml.includes('opt out'),
      implementationNotes: [],
    };
  }

  /**
   * Calculate GDPR compliance score
   */
  private calculateGDPRScore(
    features: GDPRFeature[],
    cookieConsent: CookieConsentDetection,
    dataProcessing: DataProcessingInfo,
    userRights: UserRightsInfo
  ): number {
    let score = 0;
    let maxScore = 0;

    // Features score (40 points)
    features.forEach(feature => {
      maxScore += 5;
      if (feature.present) {
        score += 5 * feature.confidence;
      }
    });

    // Cookie consent score (20 points)
    maxScore += 20;
    if (cookieConsent.hasConsent) {
      score += 10;
      score += cookieConsent.features.filter(f => f.present).length * 2.5;
    }

    // Data processing score (20 points)
    maxScore += 20;
    if (dataProcessing.hasDataCollection) {
      if (dataProcessing.hasEncryption) score += 7;
      if (dataProcessing.hasSecureTransmission) score += 7;
      if (dataProcessing.collectionMethods.length > 0) score += 6;
    } else {
      score += 20; // No data collection means no compliance needed
    }

    // User rights score (20 points)
    maxScore += 20;
    const rightsCount = [
      userRights.hasAccessRight,
      userRights.hasRectificationRight,
      userRights.hasErasureRight,
      userRights.hasPortabilityRight,
      userRights.hasObjectionRight,
    ].filter(r => r).length;
    score += (rightsCount / 5) * 20;

    return Math.round((score / maxScore) * 100);
  }

  /**
   * Generate GDPR recommendations
   */
  private generateGDPRRecommendations(
    features: GDPRFeature[],
    cookieConsent: CookieConsentDetection,
    dataProcessing: DataProcessingInfo,
    userRights: UserRightsInfo
  ): string[] {
    const recommendations: string[] = [];

    // Cookie consent recommendations
    if (!cookieConsent.hasConsent) {
      recommendations.push('Implement a cookie consent banner or modal');
      recommendations.push('Consider using a WordPress plugin like "Cookie Notice" or "GDPR Cookie Compliance"');
    } else {
      if (!cookieConsent.features.find(f => f.name === 'Reject Button')?.present) {
        recommendations.push('Add a reject/decline button for non-essential cookies');
      }
      if (!cookieConsent.features.find(f => f.name === 'Cookie Settings')?.present) {
        recommendations.push('Provide granular cookie preferences/settings');
      }
    }

    // Privacy policy recommendations
    const hasPrivacy = features.find(f => f.feature === 'Privacy Policy')?.present;
    if (!hasPrivacy) {
      recommendations.push('Create and link to a comprehensive privacy policy');
      recommendations.push('Privacy policy should be easily accessible from all pages (footer link)');
    }

    // Data processing recommendations
    if (dataProcessing.hasDataCollection) {
      if (!dataProcessing.hasEncryption) {
        recommendations.push('Implement HTTPS/SSL for secure data transmission');
      }
      if (dataProcessing.thirdPartyServices.length > 0) {
        recommendations.push('Disclose all third-party data processors in privacy policy');
      }
    }

    // User rights recommendations
    if (!userRights.hasAccessRight) {
      recommendations.push('Implement user data access request mechanism');
    }
    if (!userRights.hasErasureRight) {
      recommendations.push('Implement data deletion request mechanism (right to be forgotten)');
    }
    if (!userRights.hasPortabilityRight) {
      recommendations.push('Implement data export functionality (data portability)');
    }

    // Consent mechanism
    const hasConsent = features.find(f => f.feature === 'User Consent Mechanism')?.present;
    if (!hasConsent) {
      recommendations.push('Add explicit consent checkboxes for data collection forms');
    }

    return recommendations;
  }

  /**
   * Detect privacy policy
   */
  async detectPrivacyPolicy(html: string, url: string): Promise<PrivacyPolicyDetection> {
    const $ = cheerio.load(html);
    const links = this.findPrivacyPolicyLinks($);

    const hasPrivacyPolicy = links.length > 0;

    // Detect required sections
    const sections: PolicySection[] = [
      {
        title: 'Information We Collect',
        present: html.toLowerCase().includes('information we collect') ||
                 html.toLowerCase().includes('data we collect'),
        importance: 'required',
      },
      {
        title: 'How We Use Your Data',
        present: html.toLowerCase().includes('how we use') ||
                 html.toLowerCase().includes('use of data'),
        importance: 'required',
      },
      {
        title: 'Data Sharing',
        present: html.toLowerCase().includes('data sharing') ||
                 html.toLowerCase().includes('third parties'),
        importance: 'required',
      },
      {
        title: 'Your Rights',
        present: html.toLowerCase().includes('your rights') ||
                 html.toLowerCase().includes('user rights'),
        importance: 'required',
      },
      {
        title: 'Contact Information',
        present: html.toLowerCase().includes('contact us') ||
                 html.toLowerCase().includes('contact information'),
        importance: 'required',
      },
      {
        title: 'Data Retention',
        present: html.toLowerCase().includes('data retention') ||
                 html.toLowerCase().includes('how long we keep'),
        importance: 'recommended',
      },
      {
        title: 'Security Measures',
        present: html.toLowerCase().includes('security') ||
                 html.toLowerCase().includes('protect your data'),
        importance: 'recommended',
      },
      {
        title: 'Cookie Policy',
        present: html.toLowerCase().includes('cookie') ||
                 html.toLowerCase().includes('cookies'),
        importance: 'recommended',
      },
    ];

    // Check GDPR compliance
    const requiredSections = sections.filter(s => s.importance === 'required');
    const presentRequiredSections = requiredSections.filter(s => s.present).length;
    const gdprCompliant = presentRequiredSections >= requiredSections.length * 0.8; // 80% of required sections

    // Generate recommendations
    const recommendations: string[] = [];
    if (!hasPrivacyPolicy) {
      recommendations.push('Create a comprehensive privacy policy');
    }
    sections.filter(s => !s.present && s.importance === 'required').forEach(s => {
      recommendations.push(`Add section: ${s.title}`);
    });

    return {
      hasPrivacyPolicy,
      links,
      sections,
      gdprCompliant,
      recommendations,
    };
  }

  /**
   * Find privacy policy links
   */
  private findPrivacyPolicyLinks($: cheerio.CheerioAPI): PolicyLink[] {
    const links: PolicyLink[] = [];
    const privacyKeywords = ['privacy', 'datenschutz', 'confidentialité', 'privacidad'];

    $('a').each((_, link) => {
      const href = $(link).attr('href') || '';
      const text = $(link).text().trim().toLowerCase();
      const parent = $(link).closest('header, footer, nav').length > 0;

      let location: 'header' | 'footer' | 'content' | 'other' = 'content';
      if ($(link).closest('header').length > 0) location = 'header';
      else if ($(link).closest('footer').length > 0) location = 'footer';
      else if (parent) location = 'other';

      let isPrivacy = false;
      let confidence = 0;

      privacyKeywords.forEach(keyword => {
        if (text.includes(keyword) || href.toLowerCase().includes(keyword)) {
          isPrivacy = true;
          if (text.includes(keyword) && href.toLowerCase().includes(keyword)) {
            confidence = 0.95;
          } else if (text.includes(keyword)) {
            confidence = 0.9;
          } else {
            confidence = 0.75;
          }
        }
      });

      if (isPrivacy) {
        links.push({
          text: $(link).text().trim(),
          href,
          location,
          confidence,
        });
      }
    });

    return links;
  }

  /**
   * Detect terms of service
   */
  async detectTermsOfService(html: string, url: string): Promise<TermsOfServiceDetection> {
    const $ = cheerio.load(html);
    const links = this.findTermsLinks($);

    const hasTerms = links.length > 0;

    // Detect sections
    const sections: TermsSection[] = [
      {
        title: 'Acceptance of Terms',
        present: html.toLowerCase().includes('acceptance of terms') ||
                 html.toLowerCase().includes('by using'),
        importance: 'required',
      },
      {
        title: 'User Obligations',
        present: html.toLowerCase().includes('user obligations') ||
                 html.toLowerCase().includes('you agree to'),
        importance: 'required',
      },
      {
        title: 'Intellectual Property',
        present: html.toLowerCase().includes('intellectual property') ||
                 html.toLowerCase().includes('copyright'),
        importance: 'required',
      },
      {
        title: 'Limitation of Liability',
        present: html.toLowerCase().includes('limitation of liability') ||
                 html.toLowerCase().includes('liability'),
        importance: 'required',
      },
      {
        title: 'Termination',
        present: html.toLowerCase().includes('termination') ||
                 html.toLowerCase().includes('suspend your account'),
        importance: 'required',
      },
      {
        title: 'Governing Law',
        present: html.toLowerCase().includes('governing law') ||
                 html.toLowerCase().includes('jurisdiction'),
        importance: 'recommended',
      },
      {
        title: 'Dispute Resolution',
        present: html.toLowerCase().includes('dispute resolution') ||
                 html.toLowerCase().includes('arbitration'),
        importance: 'recommended',
      },
    ];

    // Generate recommendations
    const recommendations: string[] = [];
    if (!hasTerms) {
      recommendations.push('Create terms of service document');
    }
    sections.filter(s => !s.present && s.importance === 'required').forEach(s => {
      recommendations.push(`Add section: ${s.title}`);
    });

    return {
      hasTerms,
      links,
      sections,
      recommendations,
    };
  }

  /**
   * Find terms of service links
   */
  private findTermsLinks($: cheerio.CheerioAPI): PolicyLink[] {
    const links: PolicyLink[] = [];
    const termsKeywords = ['terms', 'conditions', 'tos', 'service', 'nutzungsbedingungen'];

    $('a').each((_, link) => {
      const href = $(link).attr('href') || '';
      const text = $(link).text().trim().toLowerCase();

      let location: 'header' | 'footer' | 'content' | 'other' = 'content';
      if ($(link).closest('header').length > 0) location = 'header';
      else if ($(link).closest('footer').length > 0) location = 'footer';

      let isTerms = false;
      let confidence = 0;

      // Check for terms patterns
      if ((text.includes('terms') && text.includes('service')) ||
          (text.includes('terms') && text.includes('conditions')) ||
          text.includes('tos') ||
          href.toLowerCase().includes('terms')) {
        isTerms = true;
        confidence = 0.9;
      } else if (text.includes('terms') || text.includes('conditions')) {
        isTerms = true;
        confidence = 0.7;
      }

      if (isTerms) {
        links.push({
          text: $(link).text().trim(),
          href,
          location,
          confidence,
        });
      }
    });

    return links;
  }

  /**
   * Get all legal links
   */
  async detectAllLegalLinks(html: string, url: string): Promise<LegalLinksReport> {
    const privacyPolicy = await this.detectPrivacyPolicy(html, url);
    const termsOfService = await this.detectTermsOfService(html, url);

    const $ = cheerio.load(html);
    const otherLegalLinks: PolicyLink[] = [];

    // Look for other legal links
    const legalKeywords = [
      'cookie',
      'disclaimer',
      'legal',
      'imprint',
      'impressum',
      'accessibility',
    ];

    $('a').each((_, link) => {
      const href = $(link).attr('href') || '';
      const text = $(link).text().trim().toLowerCase();

      let location: 'header' | 'footer' | 'content' | 'other' = 'content';
      if ($(link).closest('header').length > 0) location = 'header';
      else if ($(link).closest('footer').length > 0) location = 'footer';

      legalKeywords.forEach(keyword => {
        if (text.includes(keyword) || href.toLowerCase().includes(keyword)) {
          otherLegalLinks.push({
            text: $(link).text().trim(),
            href,
            location,
            confidence: 0.8,
          });
        }
      });
    });

    const allLinks = [
      ...privacyPolicy.links,
      ...termsOfService.links,
      ...otherLegalLinks,
    ];

    return {
      privacyPolicy,
      termsOfService,
      otherLegalLinks,
      allLinks,
    };
  }

  /**
   * Create preservation plan
   */
  async createPreservationPlan(
    gdprCompliance: GDPRComplianceResult,
    legalLinks: LegalLinksReport
  ): Promise<CompliancePreservationPlan> {
    const gdprFeatures: PreservationItem[] = [];
    const cookieConsent: PreservationItem[] = [];
    const privacyPolicy: PreservationItem[] = [];
    const termsOfService: PreservationItem[] = [];
    const recommendations: string[] = [];

    // GDPR features preservation
    if (gdprCompliance.cookieConsent.hasConsent) {
      cookieConsent.push({
        feature: 'Cookie Consent Banner',
        action: 'recreate',
        implementation: `Use WordPress plugin: ${this.recommendCookiePlugin(gdprCompliance.cookieConsent.provider)}`,
        priority: 'high',
        notes: `Original provider: ${gdprCompliance.cookieConsent.provider}`,
      });
    } else {
      cookieConsent.push({
        feature: 'Cookie Consent Banner',
        action: 'manual',
        implementation: 'Install WordPress cookie consent plugin',
        priority: 'high',
        notes: 'No existing cookie consent detected',
      });
    }

    // Privacy policy preservation
    if (legalLinks.privacyPolicy.hasPrivacyPolicy) {
      privacyPolicy.push({
        feature: 'Privacy Policy Page',
        action: 'preserve',
        implementation: 'Create WordPress page from original content',
        priority: 'high',
        notes: `${legalLinks.privacyPolicy.links.length} privacy link(s) found`,
      });

      privacyPolicy.push({
        feature: 'Privacy Policy Links',
        action: 'recreate',
        implementation: 'Add privacy policy links to WordPress footer/menu',
        priority: 'high',
        notes: 'Preserve link placement from original site',
      });
    } else {
      privacyPolicy.push({
        feature: 'Privacy Policy Page',
        action: 'manual',
        implementation: 'Create new privacy policy using WordPress Privacy Policy generator',
        priority: 'high',
        notes: 'No existing privacy policy detected',
      });
    }

    // Terms of service preservation
    if (legalLinks.termsOfService.hasTerms) {
      termsOfService.push({
        feature: 'Terms of Service Page',
        action: 'preserve',
        implementation: 'Create WordPress page from original content',
        priority: 'medium',
        notes: `${legalLinks.termsOfService.links.length} terms link(s) found`,
      });
    }

    // WordPress plugins recommendations
    const wordPressPlugins = this.getWordPressCompliancePlugins();

    // General recommendations
    if (!gdprCompliance.isCompliant) {
      recommendations.push('Site is not fully GDPR compliant. Review recommendations carefully.');
    }
    recommendations.push('Test all compliance features after WordPress migration');
    recommendations.push('Update privacy policy to reflect WordPress-specific data processing');
    if (gdprCompliance.dataProcessing.thirdPartyServices.length > 0) {
      recommendations.push('Ensure all third-party services are mentioned in privacy policy');
    }

    return {
      gdprFeatures,
      cookieConsent,
      privacyPolicy,
      termsOfService,
      recommendations,
      wordPressPlugins,
    };
  }

  /**
   * Recommend cookie plugin based on original provider
   */
  private recommendCookiePlugin(originalProvider: string): string {
    if (originalProvider.toLowerCase().includes('cookiebot')) {
      return 'Cookiebot (if continuing with same provider)';
    }
    if (originalProvider.toLowerCase().includes('onetrust')) {
      return 'OneTrust (if continuing with same provider)';
    }
    return 'Cookie Notice for GDPR & CCPA (free WordPress plugin)';
  }

  /**
   * Get WordPress compliance plugins
   */
  private getWordPressCompliancePlugins(): WordPressCompliancePlugin[] {
    return [
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
      },
    ];
  }
}

export default new LegalComplianceService();
