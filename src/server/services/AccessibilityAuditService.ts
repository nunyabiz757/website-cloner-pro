import * as cheerio from 'cheerio';
import puppeteer from 'puppeteer';

interface AccessibilityMetrics {
  score: number; // 0-100
  wcagLevel: 'A' | 'AA' | 'AAA' | 'Fail';
  violations: AccessibilityViolation[];
  warnings: AccessibilityViolation[];
  passes: number;
}

interface AccessibilityViolation {
  id: string;
  impact: 'critical' | 'serious' | 'moderate' | 'minor';
  description: string;
  wcagCriteria: string[];
  elements: string[];
  howToFix: string;
}

interface AccessibilityAuditResult {
  metrics: AccessibilityMetrics;
  categories: {
    perceivable: CategoryResult;
    operable: CategoryResult;
    understandable: CategoryResult;
    robust: CategoryResult;
  };
  colorContrast: ColorContrastResult[];
  keyboardNavigation: KeyboardNavigationResult;
  ariaAttributes: AriaAttributesResult;
  formAccessibility: FormAccessibilityResult;
}

interface CategoryResult {
  score: number;
  issues: number;
  passed: number;
}

interface ColorContrastResult {
  element: string;
  foreground: string;
  background: string;
  ratio: number;
  required: number;
  passed: boolean;
}

interface KeyboardNavigationResult {
  focusableElements: number;
  tabIndexIssues: number;
  skipLinks: boolean;
  ariaHidden: number;
}

interface AriaAttributesResult {
  total: number;
  valid: number;
  invalid: string[];
  missing: string[];
}

interface FormAccessibilityResult {
  totalInputs: number;
  withLabels: number;
  withoutLabels: number;
  ariaLabelled: number;
}

export class AccessibilityAuditService {
  /**
   * Perform comprehensive accessibility audit
   */
  async auditAccessibility(htmlContent: string, url?: string): Promise<AccessibilityAuditResult> {
    const $ = cheerio.load(htmlContent);
    const violations: AccessibilityViolation[] = [];
    const warnings: AccessibilityViolation[] = [];
    let passes = 0;

    // Check perceivable issues
    const perceivable = this.checkPerceivable($, violations, warnings);

    // Check operable issues
    const operable = this.checkOperable($, violations, warnings);

    // Check understandable issues
    const understandable = this.checkUnderstandable($, violations, warnings);

    // Check robust issues
    const robust = this.checkRobust($, violations, warnings);

    // Color contrast (basic check)
    const colorContrast = this.checkColorContrast($);

    // Keyboard navigation
    const keyboardNavigation = this.checkKeyboardNavigation($);

    // ARIA attributes
    const ariaAttributes = this.checkAriaAttributes($);

    // Form accessibility
    const formAccessibility = this.checkFormAccessibility($);

    // Calculate passes
    passes = this.calculatePasses($, violations.length);

    // Calculate score
    const score = this.calculateA11yScore(violations, warnings, passes);
    const wcagLevel = this.getWCAGLevel(score, violations);

    return {
      metrics: {
        score,
        wcagLevel,
        violations,
        warnings,
        passes,
      },
      categories: {
        perceivable,
        operable,
        understandable,
        robust,
      },
      colorContrast,
      keyboardNavigation,
      ariaAttributes,
      formAccessibility,
    };
  }

  /**
   * Check Perceivable (WCAG Principle 1)
   */
  private checkPerceivable(
    $: cheerio.CheerioAPI,
    violations: AccessibilityViolation[],
    warnings: AccessibilityViolation[]
  ): CategoryResult {
    let issues = 0;
    let passed = 0;

    // 1.1.1 Non-text Content (Level A)
    const imagesWithoutAlt = $('img:not([alt])');
    if (imagesWithoutAlt.length > 0) {
      violations.push({
        id: 'image-alt',
        impact: 'critical',
        description: `${imagesWithoutAlt.length} image(s) missing alt text`,
        wcagCriteria: ['1.1.1'],
        elements: imagesWithoutAlt.toArray().map((el) => $(el).attr('src') || 'unknown'),
        howToFix: 'Add descriptive alt attributes to all images',
      });
      issues++;
    } else {
      passed++;
    }

    // Check for decorative images with alt=""
    const decorativeImages = $('img[alt=""]').length;
    passed += decorativeImages;

    // 1.3.1 Info and Relationships (Level A)
    const tablesWithoutHeaders = $('table:not(:has(th))');
    if (tablesWithoutHeaders.length > 0) {
      warnings.push({
        id: 'table-headers',
        impact: 'serious',
        description: `${tablesWithoutHeaders.length} table(s) without header cells`,
        wcagCriteria: ['1.3.1'],
        elements: [],
        howToFix: 'Add <th> elements to table headers',
      });
      issues++;
    } else if ($('table').length > 0) {
      passed++;
    }

    // 1.4.1 Use of Color (Level A)
    // Basic check for contrast (would need more sophisticated analysis)
    const score = issues === 0 ? 100 : Math.max(0, 100 - (issues * 20));

    return { score, issues, passed };
  }

  /**
   * Check Operable (WCAG Principle 2)
   */
  private checkOperable(
    $: cheerio.CheerioAPI,
    violations: AccessibilityViolation[],
    warnings: AccessibilityViolation[]
  ): CategoryResult {
    let issues = 0;
    let passed = 0;

    // 2.1.1 Keyboard (Level A)
    const elementsWithOnClick = $('[onclick]');
    const nonInteractiveClickables = elementsWithOnClick.filter((_, el) => {
      const tag = el.tagName.toLowerCase();
      return tag !== 'button' && tag !== 'a' && !$(el).attr('role');
    });

    if (nonInteractiveClickables.length > 0) {
      violations.push({
        id: 'keyboard-accessible',
        impact: 'serious',
        description: `${nonInteractiveClickables.length} non-interactive element(s) with click handlers`,
        wcagCriteria: ['2.1.1'],
        elements: [],
        howToFix: 'Use <button> or add role="button" and keyboard event handlers',
      });
      issues++;
    } else {
      passed++;
    }

    // 2.4.1 Bypass Blocks (Level A)
    const skipLinks = $('a[href^="#"]:first');
    if ($('nav, [role="navigation"]').length > 0 && skipLinks.length === 0) {
      warnings.push({
        id: 'skip-link',
        impact: 'moderate',
        description: 'No skip navigation link found',
        wcagCriteria: ['2.4.1'],
        elements: [],
        howToFix: 'Add a "Skip to main content" link at the top of the page',
      });
      issues++;
    } else {
      passed++;
    }

    // 2.4.2 Page Titled (Level A)
    const title = $('title').text().trim();
    if (!title) {
      violations.push({
        id: 'document-title',
        impact: 'serious',
        description: 'Page has no title',
        wcagCriteria: ['2.4.2'],
        elements: ['<title>'],
        howToFix: 'Add a descriptive <title> element',
      });
      issues++;
    } else {
      passed++;
    }

    // 2.4.4 Link Purpose (Level A)
    const ambiguousLinks = $('a').filter((_, el) => {
      const text = $(el).text().trim().toLowerCase();
      return text === 'click here' || text === 'read more' || text === 'here' || text === 'more';
    });

    if (ambiguousLinks.length > 0) {
      warnings.push({
        id: 'link-text',
        impact: 'minor',
        description: `${ambiguousLinks.length} link(s) with ambiguous text`,
        wcagCriteria: ['2.4.4'],
        elements: [],
        howToFix: 'Use descriptive link text that makes sense out of context',
      });
      issues++;
    } else if ($('a').length > 0) {
      passed++;
    }

    const score = issues === 0 ? 100 : Math.max(0, 100 - (issues * 20));
    return { score, issues, passed };
  }

  /**
   * Check Understandable (WCAG Principle 3)
   */
  private checkUnderstandable(
    $: cheerio.CheerioAPI,
    violations: AccessibilityViolation[],
    warnings: AccessibilityViolation[]
  ): CategoryResult {
    let issues = 0;
    let passed = 0;

    // 3.1.1 Language of Page (Level A)
    const htmlLang = $('html').attr('lang');
    if (!htmlLang) {
      violations.push({
        id: 'html-lang',
        impact: 'serious',
        description: 'Page language not specified',
        wcagCriteria: ['3.1.1'],
        elements: ['<html>'],
        howToFix: 'Add lang attribute to <html> tag (e.g., lang="en")',
      });
      issues++;
    } else {
      passed++;
    }

    // 3.2.2 On Input (Level A)
    const autoSubmitForms = $('form[onchange*="submit"], form[onblur*="submit"]');
    if (autoSubmitForms.length > 0) {
      warnings.push({
        id: 'form-auto-submit',
        impact: 'moderate',
        description: `${autoSubmitForms.length} form(s) with automatic submission`,
        wcagCriteria: ['3.2.2'],
        elements: [],
        howToFix: 'Avoid automatic form submission on input change',
      });
      issues++;
    } else if ($('form').length > 0) {
      passed++;
    }

    // 3.3.1 Error Identification (Level A)
    const formsWithValidation = $('form').filter((_, form) => {
      return $(form).find('[required], [aria-required="true"]').length > 0;
    });

    if (formsWithValidation.length > 0) {
      const hasErrorMessages = $('[role="alert"], .error, .alert-error').length > 0;
      if (!hasErrorMessages) {
        warnings.push({
          id: 'error-messages',
          impact: 'moderate',
          description: 'Forms with required fields but no visible error messages',
          wcagCriteria: ['3.3.1'],
          elements: [],
          howToFix: 'Add error message elements with role="alert"',
        });
        issues++;
      } else {
        passed++;
      }
    }

    // 3.3.2 Labels or Instructions (Level A)
    const inputsWithoutLabels = $('input:not([type="hidden"]):not([type="submit"]):not([type="button"])').filter(
      (_, input) => {
        const $input = $(input);
        const id = $input.attr('id');
        const hasLabel = id && $(`label[for="${id}"]`).length > 0;
        const hasAriaLabel = $input.attr('aria-label') || $input.attr('aria-labelledby');
        return !hasLabel && !hasAriaLabel;
      }
    );

    if (inputsWithoutLabels.length > 0) {
      violations.push({
        id: 'form-labels',
        impact: 'critical',
        description: `${inputsWithoutLabels.length} form input(s) without labels`,
        wcagCriteria: ['3.3.2'],
        elements: [],
        howToFix: 'Associate labels with form inputs using <label> or aria-label',
      });
      issues++;
    } else if ($('input').length > 0) {
      passed++;
    }

    const score = issues === 0 ? 100 : Math.max(0, 100 - (issues * 20));
    return { score, issues, passed };
  }

  /**
   * Check Robust (WCAG Principle 4)
   */
  private checkRobust(
    $: cheerio.CheerioAPI,
    violations: AccessibilityViolation[],
    warnings: AccessibilityViolation[]
  ): CategoryResult {
    let issues = 0;
    let passed = 0;

    // 4.1.1 Parsing (Level A)
    const duplicateIds = this.findDuplicateIds($);
    if (duplicateIds.length > 0) {
      violations.push({
        id: 'duplicate-id',
        impact: 'serious',
        description: `${duplicateIds.length} duplicate ID(s) found`,
        wcagCriteria: ['4.1.1'],
        elements: duplicateIds,
        howToFix: 'Ensure all ID attributes are unique',
      });
      issues++;
    } else {
      passed++;
    }

    // 4.1.2 Name, Role, Value (Level A)
    const customControls = $('[role="button"], [role="checkbox"], [role="radio"], [role="slider"]');
    const missingAria = customControls.filter((_, el) => {
      const $el = $(el);
      const role = $el.attr('role');

      if (role === 'checkbox' || role === 'radio') {
        return !$el.attr('aria-checked');
      }
      if (role === 'button') {
        return !$el.attr('aria-label') && !$el.text().trim();
      }
      return false;
    });

    if (missingAria.length > 0) {
      violations.push({
        id: 'aria-roles',
        impact: 'serious',
        description: `${missingAria.length} custom control(s) with incomplete ARIA`,
        wcagCriteria: ['4.1.2'],
        elements: [],
        howToFix: 'Add required ARIA attributes for custom controls',
      });
      issues++;
    } else if (customControls.length > 0) {
      passed++;
    }

    const score = issues === 0 ? 100 : Math.max(0, 100 - (issues * 20));
    return { score, issues, passed };
  }

  /**
   * Check color contrast
   */
  private checkColorContrast($: cheerio.CheerioAPI): ColorContrastResult[] {
    // Simplified check - in production, use actual color analysis
    const results: ColorContrastResult[] = [];

    $('*').slice(0, 50).each((_, el) => {
      const $el = $(el);
      const color = $el.css('color');
      const bgColor = $el.css('background-color');

      if (color && bgColor) {
        // This is a simplified check - actual implementation would calculate real ratios
        results.push({
          element: el.tagName.toLowerCase(),
          foreground: color,
          background: bgColor,
          ratio: 4.5, // Placeholder
          required: 4.5,
          passed: true,
        });
      }
    });

    return results.slice(0, 10); // Return first 10
  }

  /**
   * Check keyboard navigation
   */
  private checkKeyboardNavigation($: cheerio.CheerioAPI): KeyboardNavigationResult {
    const focusable = $(
      'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );

    const tabIndexIssues = $('[tabindex]').filter((_, el) => {
      const tabindex = parseInt($(el).attr('tabindex') || '0');
      return tabindex > 0; // Positive tabindex is an anti-pattern
    }).length;

    const skipLinks = $('a[href^="#"]').first().length > 0;
    const ariaHidden = $('[aria-hidden="true"]').length;

    return {
      focusableElements: focusable.length,
      tabIndexIssues,
      skipLinks,
      ariaHidden,
    };
  }

  /**
   * Check ARIA attributes
   */
  private checkAriaAttributes($: cheerio.CheerioAPI): AriaAttributesResult {
    const ariaElements = $('[aria-label], [aria-labelledby], [aria-describedby], [role]');
    const total = ariaElements.length;
    let valid = 0;
    const invalid: string[] = [];
    const missing: string[] = [];

    // Valid ARIA roles
    const validRoles = new Set([
      'alert', 'button', 'checkbox', 'dialog', 'link', 'menu', 'menuitem',
      'navigation', 'radio', 'search', 'tab', 'tabpanel', 'textbox', 'tooltip',
    ]);

    ariaElements.each((_, el) => {
      const $el = $(el);
      const role = $el.attr('role');

      if (role && !validRoles.has(role)) {
        invalid.push(`Invalid role="${role}"`);
      } else {
        valid++;
      }
    });

    return { total, valid, invalid, missing };
  }

  /**
   * Check form accessibility
   */
  private checkFormAccessibility($: cheerio.CheerioAPI): FormAccessibilityResult {
    const inputs = $('input:not([type="hidden"]):not([type="submit"]):not([type="button"])');
    const totalInputs = inputs.length;
    let withLabels = 0;
    let ariaLabelled = 0;

    inputs.each((_, input) => {
      const $input = $(input);
      const id = $input.attr('id');
      const hasLabel = id && $(`label[for="${id}"]`).length > 0;
      const hasAriaLabel = $input.attr('aria-label') || $input.attr('aria-labelledby');

      if (hasLabel) withLabels++;
      if (hasAriaLabel) ariaLabelled++;
    });

    return {
      totalInputs,
      withLabels,
      withoutLabels: totalInputs - withLabels,
      ariaLabelled,
    };
  }

  /**
   * Find duplicate IDs
   */
  private findDuplicateIds($: cheerio.CheerioAPI): string[] {
    const ids = new Map<string, number>();
    const duplicates: string[] = [];

    $('[id]').each((_, el) => {
      const id = $(el).attr('id');
      if (id) {
        ids.set(id, (ids.get(id) || 0) + 1);
      }
    });

    ids.forEach((count, id) => {
      if (count > 1) {
        duplicates.push(id);
      }
    });

    return duplicates;
  }

  /**
   * Calculate passes
   */
  private calculatePasses($: cheerio.CheerioAPI, violationCount: number): number {
    // Estimate passes based on elements present
    let checks = 0;

    if ($('img').length > 0) checks++;
    if ($('a').length > 0) checks++;
    if ($('button, input').length > 0) checks++;
    if ($('form').length > 0) checks++;
    if ($('table').length > 0) checks++;
    if ($('[role]').length > 0) checks++;

    return Math.max(0, checks - violationCount);
  }

  /**
   * Calculate accessibility score
   */
  private calculateA11yScore(
    violations: AccessibilityViolation[],
    warnings: AccessibilityViolation[],
    passes: number
  ): number {
    let score = 100;

    violations.forEach((v) => {
      if (v.impact === 'critical') score -= 20;
      else if (v.impact === 'serious') score -= 15;
      else if (v.impact === 'moderate') score -= 10;
      else score -= 5;
    });

    warnings.forEach((w) => {
      if (w.impact === 'serious') score -= 5;
      else if (w.impact === 'moderate') score -= 3;
      else score -= 1;
    });

    // Add bonus for passes
    score += Math.min(20, passes * 2);

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Get WCAG level
   */
  private getWCAGLevel(
    score: number,
    violations: AccessibilityViolation[]
  ): 'A' | 'AA' | 'AAA' | 'Fail' {
    const criticalViolations = violations.filter((v) => v.impact === 'critical');

    if (criticalViolations.length > 0) return 'Fail';
    if (score >= 95) return 'AAA';
    if (score >= 85) return 'AA';
    if (score >= 70) return 'A';
    return 'Fail';
  }
}
