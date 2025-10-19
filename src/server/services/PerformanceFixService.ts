/**
 * Performance Fix Application Service
 *
 * Provides an interactive system for applying performance optimizations with:
 * - Granular control over individual fixes
 * - Dependency management (fixes that require others first)
 * - Safe/Aggressive/Custom modes
 * - Rollback capability
 * - Test Mode (preview only)
 */

export interface PerformanceFix {
  id: string;
  name: string;
  description: string;
  category: 'images' | 'css' | 'js' | 'html' | 'fonts' | 'caching' | 'network';
  impact: 'low' | 'medium' | 'high' | 'critical';
  risk: 'safe' | 'moderate' | 'aggressive';
  estimatedImprovement: string; // e.g., "20% faster load time"
  dependencies: string[]; // IDs of fixes that must be applied first
  conflicts: string[]; // IDs of fixes that cannot be applied together
  enabled: boolean;
  applied: boolean;
  canRollback: boolean;
}

export interface FixApplicationMode {
  type: 'safe' | 'aggressive' | 'custom';
  description: string;
  includedFixes: string[];
}

export interface FixApplicationResult {
  fixId: string;
  success: boolean;
  applied: boolean;
  beforeState: any;
  afterState: any;
  improvements: {
    metric: string;
    before: number;
    after: number;
    improvement: string;
  }[];
  warnings: string[];
  errors: string[];
  rollbackData?: any;
}

export interface FixSession {
  sessionId: string;
  mode: 'live' | 'test';
  appliedFixes: FixApplicationResult[];
  availableFixes: PerformanceFix[];
  currentState: any;
  originalState: any;
  createdAt: Date;
  updatedAt: Date;
}

export class PerformanceFixService {
  private sessions: Map<string, FixSession> = new Map();
  private availableFixes: PerformanceFix[];

  constructor() {
    this.availableFixes = this.initializeAvailableFixes();
  }

  /**
   * Initialize all available performance fixes
   */
  private initializeAvailableFixes(): PerformanceFix[] {
    return [
      // ========== IMAGE OPTIMIZATIONS ==========
      {
        id: 'img-lazy-loading',
        name: 'Enable Lazy Loading for Images',
        description: 'Add loading="lazy" attribute to images below the fold',
        category: 'images',
        impact: 'high',
        risk: 'safe',
        estimatedImprovement: '30-50% faster initial page load',
        dependencies: [],
        conflicts: [],
        enabled: true,
        applied: false,
        canRollback: true,
      },
      {
        id: 'img-webp-conversion',
        name: 'Convert Images to WebP',
        description: 'Convert JPEG/PNG images to modern WebP format',
        category: 'images',
        impact: 'critical',
        risk: 'safe',
        estimatedImprovement: '25-35% reduction in image file sizes',
        dependencies: [],
        conflicts: [],
        enabled: true,
        applied: false,
        canRollback: true,
      },
      {
        id: 'img-responsive',
        name: 'Add Responsive Images',
        description: 'Add srcset and sizes attributes for responsive images',
        category: 'images',
        impact: 'high',
        risk: 'safe',
        estimatedImprovement: '40-60% bandwidth savings on mobile',
        dependencies: [],
        conflicts: [],
        enabled: true,
        applied: false,
        canRollback: true,
      },
      {
        id: 'img-dimensions',
        name: 'Add Image Dimensions',
        description: 'Add width and height attributes to prevent layout shift',
        category: 'images',
        impact: 'medium',
        risk: 'safe',
        estimatedImprovement: 'Eliminates Cumulative Layout Shift (CLS)',
        dependencies: [],
        conflicts: [],
        enabled: true,
        applied: false,
        canRollback: true,
      },
      {
        id: 'img-preload-critical',
        name: 'Preload Critical Images',
        description: 'Add preload hints for above-the-fold images',
        category: 'images',
        impact: 'medium',
        risk: 'moderate',
        estimatedImprovement: '10-20% faster LCP (Largest Contentful Paint)',
        dependencies: ['img-dimensions'],
        conflicts: [],
        enabled: true,
        applied: false,
        canRollback: true,
      },

      // ========== CSS OPTIMIZATIONS ==========
      {
        id: 'css-minify',
        name: 'Minify CSS',
        description: 'Remove whitespace, comments, and optimize CSS',
        category: 'css',
        impact: 'medium',
        risk: 'safe',
        estimatedImprovement: '20-40% reduction in CSS file size',
        dependencies: [],
        conflicts: [],
        enabled: true,
        applied: false,
        canRollback: true,
      },
      {
        id: 'css-critical-inline',
        name: 'Inline Critical CSS',
        description: 'Extract and inline above-the-fold CSS',
        category: 'css',
        impact: 'high',
        risk: 'moderate',
        estimatedImprovement: '50-70% faster First Contentful Paint (FCP)',
        dependencies: ['css-minify'],
        conflicts: [],
        enabled: true,
        applied: false,
        canRollback: true,
      },
      {
        id: 'css-defer-non-critical',
        name: 'Defer Non-Critical CSS',
        description: 'Load below-the-fold CSS asynchronously',
        category: 'css',
        impact: 'high',
        risk: 'moderate',
        estimatedImprovement: '30-50% faster Time to Interactive (TTI)',
        dependencies: ['css-critical-inline'],
        conflicts: [],
        enabled: true,
        applied: false,
        canRollback: true,
      },
      {
        id: 'css-remove-unused',
        name: 'Remove Unused CSS',
        description: 'Purge CSS rules not used on the page',
        category: 'css',
        impact: 'critical',
        risk: 'aggressive',
        estimatedImprovement: '60-80% reduction in CSS file size',
        dependencies: ['css-minify'],
        conflicts: [],
        enabled: true,
        applied: false,
        canRollback: true,
      },
      {
        id: 'css-combine-files',
        name: 'Combine CSS Files',
        description: 'Merge multiple CSS files into one',
        category: 'css',
        impact: 'medium',
        risk: 'safe',
        estimatedImprovement: 'Reduces HTTP requests by 50-80%',
        dependencies: [],
        conflicts: ['css-critical-inline'],
        enabled: true,
        applied: false,
        canRollback: true,
      },

      // ========== JAVASCRIPT OPTIMIZATIONS ==========
      {
        id: 'js-minify',
        name: 'Minify JavaScript',
        description: 'Remove whitespace, comments, and optimize JS',
        category: 'js',
        impact: 'medium',
        risk: 'safe',
        estimatedImprovement: '30-50% reduction in JS file size',
        dependencies: [],
        conflicts: [],
        enabled: true,
        applied: false,
        canRollback: true,
      },
      {
        id: 'js-defer',
        name: 'Defer JavaScript',
        description: 'Add defer attribute to script tags',
        category: 'js',
        impact: 'high',
        risk: 'moderate',
        estimatedImprovement: '40-60% faster page rendering',
        dependencies: [],
        conflicts: ['js-async'],
        enabled: true,
        applied: false,
        canRollback: true,
      },
      {
        id: 'js-async',
        name: 'Async JavaScript',
        description: 'Add async attribute to non-critical scripts',
        category: 'js',
        impact: 'high',
        risk: 'moderate',
        estimatedImprovement: '30-50% faster Time to Interactive',
        dependencies: [],
        conflicts: ['js-defer'],
        enabled: true,
        applied: false,
        canRollback: true,
      },
      {
        id: 'js-remove-unused',
        name: 'Remove Unused JavaScript',
        description: 'Tree-shake and remove dead code',
        category: 'js',
        impact: 'critical',
        risk: 'aggressive',
        estimatedImprovement: '50-70% reduction in JS bundle size',
        dependencies: ['js-minify'],
        conflicts: [],
        enabled: true,
        applied: false,
        canRollback: true,
      },
      {
        id: 'js-code-splitting',
        name: 'Code Splitting',
        description: 'Split JS into smaller chunks loaded on demand',
        category: 'js',
        impact: 'critical',
        risk: 'aggressive',
        estimatedImprovement: '60-80% faster initial load',
        dependencies: ['js-minify'],
        conflicts: [],
        enabled: true,
        applied: false,
        canRollback: true,
      },

      // ========== HTML OPTIMIZATIONS ==========
      {
        id: 'html-minify',
        name: 'Minify HTML',
        description: 'Remove whitespace and comments from HTML',
        category: 'html',
        impact: 'low',
        risk: 'safe',
        estimatedImprovement: '5-15% reduction in HTML size',
        dependencies: [],
        conflicts: [],
        enabled: true,
        applied: false,
        canRollback: true,
      },
      {
        id: 'html-preconnect',
        name: 'Add Preconnect Hints',
        description: 'Preconnect to external domains',
        category: 'html',
        impact: 'medium',
        risk: 'safe',
        estimatedImprovement: '100-300ms faster external resource loading',
        dependencies: [],
        conflicts: [],
        enabled: true,
        applied: false,
        canRollback: true,
      },
      {
        id: 'html-dns-prefetch',
        name: 'Add DNS Prefetch',
        description: 'Prefetch DNS for external resources',
        category: 'html',
        impact: 'low',
        risk: 'safe',
        estimatedImprovement: '20-120ms faster DNS resolution',
        dependencies: [],
        conflicts: [],
        enabled: true,
        applied: false,
        canRollback: true,
      },
      {
        id: 'html-resource-hints',
        name: 'Add Resource Hints',
        description: 'Add prefetch/preload for key resources',
        category: 'html',
        impact: 'medium',
        risk: 'moderate',
        estimatedImprovement: '200-500ms faster resource loading',
        dependencies: [],
        conflicts: [],
        enabled: true,
        applied: false,
        canRollback: true,
      },

      // ========== FONT OPTIMIZATIONS ==========
      {
        id: 'font-display-swap',
        name: 'Font Display Swap',
        description: 'Add font-display: swap to prevent invisible text',
        category: 'fonts',
        impact: 'high',
        risk: 'safe',
        estimatedImprovement: 'Eliminates Flash of Invisible Text (FOIT)',
        dependencies: [],
        conflicts: [],
        enabled: true,
        applied: false,
        canRollback: true,
      },
      {
        id: 'font-preload',
        name: 'Preload Fonts',
        description: 'Preload critical web fonts',
        category: 'fonts',
        impact: 'medium',
        risk: 'safe',
        estimatedImprovement: '100-300ms faster font loading',
        dependencies: [],
        conflicts: [],
        enabled: true,
        applied: false,
        canRollback: true,
      },
      {
        id: 'font-subset',
        name: 'Subset Fonts',
        description: 'Include only used glyphs in font files',
        category: 'fonts',
        impact: 'high',
        risk: 'moderate',
        estimatedImprovement: '50-70% reduction in font file size',
        dependencies: [],
        conflicts: [],
        enabled: true,
        applied: false,
        canRollback: true,
      },
      {
        id: 'font-woff2',
        name: 'Convert to WOFF2',
        description: 'Convert fonts to modern WOFF2 format',
        category: 'fonts',
        impact: 'medium',
        risk: 'safe',
        estimatedImprovement: '30% smaller than WOFF',
        dependencies: [],
        conflicts: [],
        enabled: true,
        applied: false,
        canRollback: true,
      },

      // ========== CACHING OPTIMIZATIONS ==========
      {
        id: 'cache-headers',
        name: 'Add Cache Headers',
        description: 'Add proper cache-control headers',
        category: 'caching',
        impact: 'critical',
        risk: 'safe',
        estimatedImprovement: '90% faster repeat visits',
        dependencies: [],
        conflicts: [],
        enabled: true,
        applied: false,
        canRollback: true,
      },
      {
        id: 'cache-versioning',
        name: 'Asset Versioning',
        description: 'Add version hashes to asset URLs for cache busting',
        category: 'caching',
        impact: 'medium',
        risk: 'safe',
        estimatedImprovement: 'Prevents stale cache issues',
        dependencies: ['cache-headers'],
        conflicts: [],
        enabled: true,
        applied: false,
        canRollback: true,
      },

      // ========== NETWORK OPTIMIZATIONS ==========
      {
        id: 'network-http2',
        name: 'HTTP/2 Optimization',
        description: 'Optimize for HTTP/2 multiplexing',
        category: 'network',
        impact: 'high',
        risk: 'safe',
        estimatedImprovement: '30-50% faster with multiple requests',
        dependencies: [],
        conflicts: ['css-combine-files'],
        enabled: true,
        applied: false,
        canRollback: true,
      },
      {
        id: 'network-compression',
        name: 'Enable Compression',
        description: 'Add gzip/brotli compression hints',
        category: 'network',
        impact: 'critical',
        risk: 'safe',
        estimatedImprovement: '70-90% reduction in transfer size',
        dependencies: [],
        conflicts: [],
        enabled: true,
        applied: false,
        canRollback: true,
      },
    ];
  }

  /**
   * Get all available fixes
   */
  getAvailableFixes(filterBy?: {
    category?: string;
    risk?: string;
    impact?: string;
  }): PerformanceFix[] {
    let fixes = [...this.availableFixes];

    if (filterBy) {
      if (filterBy.category) {
        fixes = fixes.filter(f => f.category === filterBy.category);
      }
      if (filterBy.risk) {
        fixes = fixes.filter(f => f.risk === filterBy.risk);
      }
      if (filterBy.impact) {
        fixes = fixes.filter(f => f.impact === filterBy.impact);
      }
    }

    return fixes;
  }

  /**
   * Get predefined fix modes
   */
  getFixModes(): FixApplicationMode[] {
    return [
      {
        type: 'safe',
        description: 'Only safe, low-risk optimizations. Recommended for production sites.',
        includedFixes: this.availableFixes
          .filter(f => f.risk === 'safe')
          .map(f => f.id),
      },
      {
        type: 'aggressive',
        description: 'All optimizations including aggressive fixes. Maximum performance.',
        includedFixes: this.availableFixes.map(f => f.id),
      },
      {
        type: 'custom',
        description: 'Manually select individual fixes to apply.',
        includedFixes: [],
      },
    ];
  }

  /**
   * Create a new fix application session
   */
  async createSession(
    content: any,
    mode: 'live' | 'test' = 'test'
  ): Promise<FixSession> {
    const sessionId = `fix_${Date.now()}_${Math.random().toString(36).substring(7)}`;

    const session: FixSession = {
      sessionId,
      mode,
      appliedFixes: [],
      availableFixes: [...this.availableFixes],
      currentState: JSON.parse(JSON.stringify(content)),
      originalState: JSON.parse(JSON.stringify(content)),
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    this.sessions.set(sessionId, session);

    return session;
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): FixSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Check if a fix can be applied (dependencies met, no conflicts)
   */
  canApplyFix(sessionId: string, fixId: string): {
    canApply: boolean;
    reasons: string[];
  } {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { canApply: false, reasons: ['Session not found'] };
    }

    const fix = this.availableFixes.find(f => f.id === fixId);
    if (!fix) {
      return { canApply: false, reasons: ['Fix not found'] };
    }

    if (fix.applied) {
      return { canApply: false, reasons: ['Fix already applied'] };
    }

    const reasons: string[] = [];

    // Check dependencies
    for (const depId of fix.dependencies) {
      const depFix = session.availableFixes.find(f => f.id === depId);
      if (!depFix || !depFix.applied) {
        reasons.push(`Dependency not met: ${depFix?.name || depId}`);
      }
    }

    // Check conflicts
    for (const conflictId of fix.conflicts) {
      const conflictFix = session.availableFixes.find(f => f.id === conflictId);
      if (conflictFix && conflictFix.applied) {
        reasons.push(`Conflicts with: ${conflictFix.name}`);
      }
    }

    return {
      canApply: reasons.length === 0,
      reasons,
    };
  }

  /**
   * Apply a single fix
   */
  async applyFix(
    sessionId: string,
    fixId: string,
    content: any
  ): Promise<FixApplicationResult> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const canApply = this.canApplyFix(sessionId, fixId);
    if (!canApply.canApply) {
      return {
        fixId,
        success: false,
        applied: false,
        beforeState: null,
        afterState: null,
        improvements: [],
        warnings: [],
        errors: canApply.reasons,
      };
    }

    const fix = this.availableFixes.find(f => f.id === fixId);
    if (!fix) {
      throw new Error('Fix not found');
    }

    // Store before state
    const beforeState = JSON.parse(JSON.stringify(content));

    // Apply the fix (implementation depends on fix type)
    const result = await this.executeFix(fix, content);

    // Store after state
    const afterState = result.content;

    // Mark as applied in session
    const sessionFix = session.availableFixes.find(f => f.id === fixId);
    if (sessionFix) {
      sessionFix.applied = true;
    }

    // Create result
    const applicationResult: FixApplicationResult = {
      fixId,
      success: result.success,
      applied: true,
      beforeState,
      afterState,
      improvements: result.improvements,
      warnings: result.warnings,
      errors: result.errors,
      rollbackData: { beforeState, fixId },
    };

    // Add to session history
    session.appliedFixes.push(applicationResult);
    session.currentState = afterState;
    session.updatedAt = new Date();

    return applicationResult;
  }

  /**
   * Apply multiple fixes in order (respecting dependencies)
   */
  async applyFixes(
    sessionId: string,
    fixIds: string[],
    content: any
  ): Promise<FixApplicationResult[]> {
    const results: FixApplicationResult[] = [];
    let currentContent = content;

    // Sort fixes by dependencies
    const sortedFixIds = this.sortFixesByDependencies(fixIds);

    for (const fixId of sortedFixIds) {
      const result = await this.applyFix(sessionId, fixId, currentContent);
      results.push(result);

      if (result.success && result.afterState) {
        currentContent = result.afterState;
      }
    }

    return results;
  }

  /**
   * Apply fixes by mode (safe/aggressive/custom)
   */
  async applyMode(
    sessionId: string,
    modeType: 'safe' | 'aggressive' | 'custom',
    customFixIds: string[] = [],
    content: any
  ): Promise<FixApplicationResult[]> {
    const modes = this.getFixModes();
    const mode = modes.find(m => m.type === modeType);

    if (!mode) {
      throw new Error('Invalid mode');
    }

    const fixIdsToApply = modeType === 'custom' ? customFixIds : mode.includedFixes;

    return this.applyFixes(sessionId, fixIdsToApply, content);
  }

  /**
   * Rollback a specific fix
   */
  async rollbackFix(
    sessionId: string,
    fixId: string
  ): Promise<{ success: boolean; message: string }> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { success: false, message: 'Session not found' };
    }

    // Find the fix in applied fixes
    const appliedIndex = session.appliedFixes.findIndex(f => f.fixId === fixId);
    if (appliedIndex === -1) {
      return { success: false, message: 'Fix not found in applied fixes' };
    }

    const appliedFix = session.appliedFixes[appliedIndex];
    if (!appliedFix.canRollback) {
      return { success: false, message: 'Fix cannot be rolled back' };
    }

    // Check if other fixes depend on this one
    const dependentFixes = session.appliedFixes.filter(af => {
      const fix = this.availableFixes.find(f => f.id === af.fixId);
      return fix && fix.dependencies.includes(fixId);
    });

    if (dependentFixes.length > 0) {
      const names = dependentFixes.map(df => {
        const fix = this.availableFixes.find(f => f.id === df.fixId);
        return fix?.name || df.fixId;
      });
      return {
        success: false,
        message: `Cannot rollback. These fixes depend on it: ${names.join(', ')}`,
      };
    }

    // Restore before state
    if (appliedFix.rollbackData) {
      session.currentState = appliedFix.rollbackData.beforeState;
    }

    // Remove from applied fixes
    session.appliedFixes.splice(appliedIndex, 1);

    // Mark as not applied
    const sessionFix = session.availableFixes.find(f => f.id === fixId);
    if (sessionFix) {
      sessionFix.applied = false;
    }

    session.updatedAt = new Date();

    return { success: true, message: 'Fix rolled back successfully' };
  }

  /**
   * Commit session to live (apply all fixes permanently)
   */
  async commitSession(sessionId: string): Promise<{
    success: boolean;
    message: string;
    finalState: any;
  }> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { success: false, message: 'Session not found', finalState: null };
    }

    if (session.mode === 'live') {
      return {
        success: false,
        message: 'Session is already in live mode',
        finalState: session.currentState,
      };
    }

    // Convert to live mode
    session.mode = 'live';
    session.updatedAt = new Date();

    return {
      success: true,
      message: `Committed ${session.appliedFixes.length} fixes to live`,
      finalState: session.currentState,
    };
  }

  /**
   * Discard session (rollback all changes)
   */
  async discardSession(sessionId: string): Promise<{ success: boolean; message: string }> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { success: false, message: 'Session not found' };
    }

    this.sessions.delete(sessionId);

    return {
      success: true,
      message: 'Session discarded, all changes reverted',
    };
  }

  /**
   * Get session summary
   */
  getSessionSummary(sessionId: string): {
    sessionId: string;
    mode: string;
    appliedCount: number;
    totalImprovements: string;
    canCommit: boolean;
  } | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const appliedCount = session.appliedFixes.length;
    const successfulFixes = session.appliedFixes.filter(f => f.success);

    return {
      sessionId,
      mode: session.mode,
      appliedCount,
      totalImprovements: `${successfulFixes.length} successful fixes`,
      canCommit: session.mode === 'test' && appliedCount > 0,
    };
  }

  /**
   * Sort fixes by dependencies (topological sort)
   */
  private sortFixesByDependencies(fixIds: string[]): string[] {
    const sorted: string[] = [];
    const visited = new Set<string>();

    const visit = (fixId: string) => {
      if (visited.has(fixId)) return;

      const fix = this.availableFixes.find(f => f.id === fixId);
      if (!fix) return;

      // Visit dependencies first
      for (const depId of fix.dependencies) {
        if (fixIds.includes(depId)) {
          visit(depId);
        }
      }

      visited.add(fixId);
      sorted.push(fixId);
    };

    for (const fixId of fixIds) {
      visit(fixId);
    }

    return sorted;
  }

  /**
   * Execute a specific fix (placeholder - implement per fix type)
   */
  private async executeFix(
    fix: PerformanceFix,
    content: any
  ): Promise<{
    success: boolean;
    content: any;
    improvements: any[];
    warnings: string[];
    errors: string[];
  }> {
    // This is a placeholder - actual implementation would vary per fix
    // For now, return mock success
    return {
      success: true,
      content: { ...content, [`${fix.id}_applied`]: true },
      improvements: [
        {
          metric: fix.category,
          before: 100,
          after: 70,
          improvement: fix.estimatedImprovement,
        },
      ],
      warnings: [],
      errors: [],
    };
  }
}

export default new PerformanceFixService();
