/**
 * Template Part Detection (Header, Footer, Sidebars, etc.)
 *
 * Identifies and extracts WordPress template parts:
 * - Header detection
 * - Footer detection
 * - Sidebar detection
 * - Template part extraction
 * - Elementor Theme Builder export
 */

import type { ComponentInfo } from '../types/builder.types.js';

export interface TemplateParts {
  header?: TemplatePart;
  footer?: TemplatePart;
  sidebar?: TemplatePart;
  other: TemplatePart[];
  statistics: TemplatePartStatistics;
}

export interface TemplatePart {
  type: 'header' | 'footer' | 'sidebar' | 'other';
  name: string;
  html: string;
  components: ComponentInfo[];
  confidence: number; // 0-100
  position: TemplatePosition;
  recurring: boolean; // Appears on multiple pages
  pageIds: string[];
  elementorExport?: any;
}

export interface TemplatePosition {
  top?: boolean;
  bottom?: boolean;
  left?: boolean;
  right?: boolean;
  sticky?: boolean;
}

export interface TemplatePartStatistics {
  hasHeader: boolean;
  hasFooter: boolean;
  hasSidebar: boolean;
  headerPages: number;
  footerPages: number;
  sidebarPages: number;
  consistency: number; // 0-100, how consistent template parts are across pages
}

export class TemplatePartDetector {
  private headerCandidates: Map<string, TemplatePart> = new Map();
  private footerCandidates: Map<string, TemplatePart> = new Map();
  private sidebarCandidates: Map<string, TemplatePart> = new Map();

  /**
   * Detect template parts from page components
   */
  detect(pageComponents: Map<string, ComponentInfo[]>): TemplateParts {
    // Detect headers
    const header = this.detectHeader(pageComponents);

    // Detect footers
    const footer = this.detectFooter(pageComponents);

    // Detect sidebars
    const sidebar = this.detectSidebar(pageComponents);

    // Detect other template parts
    const other = this.detectOtherParts(pageComponents);

    // Calculate statistics
    const statistics = this.calculateStatistics(pageComponents, header, footer, sidebar);

    return {
      header,
      footer,
      sidebar,
      other,
      statistics,
    };
  }

  /**
   * Detect header across pages
   */
  private detectHeader(pageComponents: Map<string, ComponentInfo[]>): TemplatePart | undefined {
    for (const [pageId, components] of pageComponents) {
      // Look for header indicators
      for (const component of components) {
        if (this.isHeaderComponent(component)) {
          const signature = this.generatePartSignature(component);

          if (!this.headerCandidates.has(signature)) {
            this.headerCandidates.set(signature, {
              type: 'header',
              name: 'Site Header',
              html: component.innerHTML || '',
              components: [component],
              confidence: this.calculateHeaderConfidence(component),
              position: this.detectPosition(component),
              recurring: false,
              pageIds: [],
            });
          }

          const candidate = this.headerCandidates.get(signature)!;
          if (!candidate.pageIds.includes(pageId)) {
            candidate.pageIds.push(pageId);
          }
        }
      }
    }

    // Select the best header candidate
    return this.selectBestCandidate(this.headerCandidates, pageComponents.size);
  }

  /**
   * Check if component is a header
   */
  private isHeaderComponent(component: ComponentInfo): boolean {
    const tag = component.tagName?.toLowerCase();
    const classes = (component.className || '').toLowerCase();
    const id = (component.id || '').toLowerCase();
    const type = component.componentType.toLowerCase();

    // Strong indicators
    if (tag === 'header') return true;
    if (id.includes('header') || id.includes('masthead')) return true;
    if (classes.includes('site-header') || classes.includes('main-header')) return true;
    if (type === 'header' || type === 'navigation') return true;

    // Contextual indicators
    const depth = component.context.depth;
    const hasNav = component.children?.some(c => c.tagName === 'nav');

    return depth <= 2 && hasNav;
  }

  /**
   * Calculate header confidence score
   */
  private calculateHeaderConfidence(component: ComponentInfo): number {
    let confidence = 0;

    const tag = component.tagName?.toLowerCase();
    const classes = (component.className || '').toLowerCase();
    const id = (component.id || '').toLowerCase();

    // Strong indicators (+40 points)
    if (tag === 'header') confidence += 40;
    if (id.includes('header')) confidence += 40;
    if (classes.includes('header')) confidence += 30;

    // Has navigation (+20 points)
    const hasNav = component.children?.some(c => c.tagName === 'nav');
    if (hasNav) confidence += 20;

    // Position indicators (+10 points)
    const styles = component.styles || {};
    if (styles.position === 'fixed' || styles.position === 'sticky') confidence += 10;

    // Top-level element (+10 points)
    if (component.context.depth <= 1) confidence += 10;

    return Math.min(confidence, 100);
  }

  /**
   * Detect footer across pages
   */
  private detectFooter(pageComponents: Map<string, ComponentInfo[]>): TemplatePart | undefined {
    for (const [pageId, components] of pageComponents) {
      // Look for footer indicators
      for (const component of components) {
        if (this.isFooterComponent(component)) {
          const signature = this.generatePartSignature(component);

          if (!this.footerCandidates.has(signature)) {
            this.footerCandidates.set(signature, {
              type: 'footer',
              name: 'Site Footer',
              html: component.innerHTML || '',
              components: [component],
              confidence: this.calculateFooterConfidence(component),
              position: this.detectPosition(component),
              recurring: false,
              pageIds: [],
            });
          }

          const candidate = this.footerCandidates.get(signature)!;
          if (!candidate.pageIds.includes(pageId)) {
            candidate.pageIds.push(pageId);
          }
        }
      }
    }

    // Select the best footer candidate
    return this.selectBestCandidate(this.footerCandidates, pageComponents.size);
  }

  /**
   * Check if component is a footer
   */
  private isFooterComponent(component: ComponentInfo): boolean {
    const tag = component.tagName?.toLowerCase();
    const classes = (component.className || '').toLowerCase();
    const id = (component.id || '').toLowerCase();
    const type = component.componentType.toLowerCase();

    // Strong indicators
    if (tag === 'footer') return true;
    if (id.includes('footer') || id.includes('colophon')) return true;
    if (classes.includes('site-footer') || classes.includes('main-footer')) return true;
    if (type === 'footer') return true;

    // Contextual indicators
    const hasCommonFooterContent = component.children?.some(c => {
      const childText = c.textContent?.toLowerCase() || '';
      return childText.includes('©') ||
             childText.includes('copyright') ||
             childText.includes('all rights reserved');
    });

    return hasCommonFooterContent || false;
  }

  /**
   * Calculate footer confidence score
   */
  private calculateFooterConfidence(component: ComponentInfo): number {
    let confidence = 0;

    const tag = component.tagName?.toLowerCase();
    const classes = (component.className || '').toLowerCase();
    const id = (component.id || '').toLowerCase();

    // Strong indicators (+40 points)
    if (tag === 'footer') confidence += 40;
    if (id.includes('footer')) confidence += 40;
    if (classes.includes('footer')) confidence += 30;

    // Copyright/social links (+20 points)
    const text = component.textContent?.toLowerCase() || '';
    if (text.includes('©') || text.includes('copyright')) confidence += 20;

    const hasSocialLinks = component.children?.some(c =>
      (c.className || '').includes('social')
    );
    if (hasSocialLinks) confidence += 10;

    // Bottom position (+10 points)
    if (component.context.depth <= 2) confidence += 10;

    return Math.min(confidence, 100);
  }

  /**
   * Detect sidebar across pages
   */
  private detectSidebar(pageComponents: Map<string, ComponentInfo[]>): TemplatePart | undefined {
    for (const [pageId, components] of pageComponents) {
      for (const component of components) {
        if (this.isSidebarComponent(component)) {
          const signature = this.generatePartSignature(component);

          if (!this.sidebarCandidates.has(signature)) {
            this.sidebarCandidates.set(signature, {
              type: 'sidebar',
              name: 'Sidebar',
              html: component.innerHTML || '',
              components: [component],
              confidence: this.calculateSidebarConfidence(component),
              position: this.detectPosition(component),
              recurring: false,
              pageIds: [],
            });
          }

          const candidate = this.sidebarCandidates.get(signature)!;
          if (!candidate.pageIds.includes(pageId)) {
            candidate.pageIds.push(pageId);
          }
        }
      }
    }

    return this.selectBestCandidate(this.sidebarCandidates, pageComponents.size);
  }

  /**
   * Check if component is a sidebar
   */
  private isSidebarComponent(component: ComponentInfo): boolean {
    const tag = component.tagName?.toLowerCase();
    const classes = (component.className || '').toLowerCase();
    const id = (component.id || '').toLowerCase();

    // Strong indicators
    if (tag === 'aside') return true;
    if (id.includes('sidebar') || id.includes('aside')) return true;
    if (classes.includes('sidebar') || classes.includes('aside')) return true;

    // Layout indicators
    const styles = component.styles || {};
    const hasWidgetLike = component.children?.some(c =>
      (c.className || '').includes('widget')
    );

    return hasWidgetLike || false;
  }

  /**
   * Calculate sidebar confidence score
   */
  private calculateSidebarConfidence(component: ComponentInfo): number {
    let confidence = 0;

    const tag = component.tagName?.toLowerCase();
    const classes = (component.className || '').toLowerCase();
    const id = (component.id || '').toLowerCase();

    if (tag === 'aside') confidence += 40;
    if (id.includes('sidebar')) confidence += 40;
    if (classes.includes('sidebar')) confidence += 30;

    const hasWidgets = component.children?.some(c =>
      (c.className || '').includes('widget')
    );
    if (hasWidgets) confidence += 20;

    return Math.min(confidence, 100);
  }

  /**
   * Detect other template parts
   */
  private detectOtherParts(pageComponents: Map<string, ComponentInfo[]>): TemplatePart[] {
    const otherParts: TemplatePart[] = [];

    // Detect call-to-action sections
    // Detect newsletter signup sections
    // Detect announcement bars
    // etc.

    return otherParts;
  }

  /**
   * Generate signature for template part
   */
  private generatePartSignature(component: ComponentInfo): string {
    const parts = [
      component.tagName || '',
      component.id || '',
      component.className || '',
      (component.children?.length || 0).toString(),
    ];

    return parts.join('::');
  }

  /**
   * Detect position of template part
   */
  private detectPosition(component: ComponentInfo): TemplatePosition {
    const styles = component.styles || {};
    const position: TemplatePosition = {};

    // Check CSS position
    if (styles.position === 'fixed' || styles.position === 'sticky') {
      position.sticky = true;

      const top = styles.top;
      const bottom = styles.bottom;

      if (top === '0' || top === 0 || top === '0px') {
        position.top = true;
      }
      if (bottom === '0' || bottom === 0 || bottom === '0px') {
        position.bottom = true;
      }
    }

    // Check DOM position
    const depth = component.context.depth;
    if (depth <= 1) {
      // Likely at top or bottom of page
      const tag = component.tagName?.toLowerCase();
      if (tag === 'header') position.top = true;
      if (tag === 'footer') position.bottom = true;
    }

    return position;
  }

  /**
   * Select best candidate from multiple options
   */
  private selectBestCandidate(
    candidates: Map<string, TemplatePart>,
    totalPages: number
  ): TemplatePart | undefined {
    if (candidates.size === 0) return undefined;

    // Sort candidates by:
    // 1. Number of pages they appear on
    // 2. Confidence score
    const sorted = Array.from(candidates.values()).sort((a, b) => {
      const aScore = a.pageIds.length * 10 + a.confidence;
      const bScore = b.pageIds.length * 10 + b.confidence;
      return bScore - aScore;
    });

    const best = sorted[0];

    // Mark as recurring if appears on 50%+ of pages
    best.recurring = best.pageIds.length >= totalPages * 0.5;

    // Generate Elementor export
    best.elementorExport = this.generateElementorExport(best);

    return best;
  }

  /**
   * Generate Elementor Theme Builder export
   */
  private generateElementorExport(part: TemplatePart): any {
    return {
      type: part.type,
      title: part.name,
      content: {
        id: `template_${part.type}`,
        elType: 'section',
        settings: {
          layout: part.type === 'header' ? 'full_width' : 'boxed',
        },
        elements: [
          {
            id: `${part.type}_column`,
            elType: 'column',
            settings: {},
            elements: part.components.map(c => ({
              id: c.id || `widget_${Math.random().toString(36).substr(2, 9)}`,
              elType: 'widget',
              widgetType: 'html',
              settings: {
                html: c.innerHTML || '',
              },
            })),
          },
        ],
      },
      conditions: this.generateConditions(part.type),
    };
  }

  /**
   * Generate display conditions for template part
   */
  private generateConditions(type: string): any[] {
    if (type === 'header') {
      return [
        {
          type: 'include',
          name: 'general',
          sub_name: 'entire_site',
        },
      ];
    }

    if (type === 'footer') {
      return [
        {
          type: 'include',
          name: 'general',
          sub_name: 'entire_site',
        },
      ];
    }

    return [];
  }

  /**
   * Calculate statistics
   */
  private calculateStatistics(
    pageComponents: Map<string, ComponentInfo[]>,
    header?: TemplatePart,
    footer?: TemplatePart,
    sidebar?: TemplatePart
  ): TemplatePartStatistics {
    const totalPages = pageComponents.size;

    const hasHeader = !!header && header.confidence >= 60;
    const hasFooter = !!footer && footer.confidence >= 60;
    const hasSidebar = !!sidebar && sidebar.confidence >= 60;

    const headerPages = header?.pageIds.length || 0;
    const footerPages = footer?.pageIds.length || 0;
    const sidebarPages = sidebar?.pageIds.length || 0;

    // Calculate consistency (how many pages have the same template parts)
    let consistencyScore = 0;
    if (hasHeader) {
      consistencyScore += (headerPages / totalPages) * 33.33;
    }
    if (hasFooter) {
      consistencyScore += (footerPages / totalPages) * 33.33;
    }
    if (hasSidebar) {
      consistencyScore += (sidebarPages / totalPages) * 33.33;
    }

    return {
      hasHeader,
      hasFooter,
      hasSidebar,
      headerPages,
      footerPages,
      sidebarPages,
      consistency: Math.round(consistencyScore),
    };
  }
}

/**
 * Helper function for quick detection
 */
export function detectTemplateParts(
  pageComponents: Map<string, ComponentInfo[]>
): TemplateParts {
  const detector = new TemplatePartDetector();
  return detector.detect(pageComponents);
}
