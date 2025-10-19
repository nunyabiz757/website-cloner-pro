/**
 * Live Performance Monitoring Service
 * Real-time Core Web Vitals and user interaction tracking
 */

/**
 * Core Web Vitals Metrics
 */
export interface CoreWebVitals {
  // Largest Contentful Paint (LCP) - Loading performance
  lcp: number;          // Target: < 2.5s (good), < 4s (needs improvement), >= 4s (poor)

  // First Input Delay (FID) - Interactivity
  fid: number;          // Target: < 100ms (good), < 300ms (needs improvement), >= 300ms (poor)

  // Cumulative Layout Shift (CLS) - Visual stability
  cls: number;          // Target: < 0.1 (good), < 0.25 (needs improvement), >= 0.25 (poor)

  // First Contentful Paint (FCP)
  fcp: number;          // Target: < 1.8s (good), < 3s (needs improvement), >= 3s (poor)

  // Time to First Byte (TTFB)
  ttfb: number;         // Target: < 800ms (good), < 1800ms (needs improvement), >= 1800ms (poor)

  // Interaction to Next Paint (INP) - Responsiveness
  inp?: number;         // Target: < 200ms (good), < 500ms (needs improvement), >= 500ms (poor)
}

/**
 * Performance Metrics
 */
export interface PerformanceMetrics extends CoreWebVitals {
  // Navigation timing
  domContentLoaded: number;
  loadComplete: number;
  domInteractive: number;

  // Resource timing
  totalResources: number;
  totalResourceSize: number;
  totalResourceTime: number;

  // JavaScript metrics
  jsHeapSize?: number;
  jsHeapLimit?: number;

  // Connection info
  effectiveConnectionType?: string;  // '4g', '3g', '2g', 'slow-2g'
  downlink?: number;                 // Mbps
  rtt?: number;                      // Round-trip time in ms

  // Device info
  deviceMemory?: number;             // GB
  hardwareConcurrency?: number;      // CPU cores

  timestamp: number;
  url: string;
  userAgent: string;
}

/**
 * User Interaction Event
 */
export interface UserInteraction {
  type: 'click' | 'scroll' | 'input' | 'hover' | 'resize' | 'navigation';
  target: string;           // CSS selector or element description
  timestamp: number;
  duration?: number;        // For scroll, hover events
  value?: any;              // Additional data
  x?: number;               // Mouse position
  y?: number;
  viewport: {
    width: number;
    height: number;
  };
}

/**
 * Session Data
 */
export interface MonitoringSession {
  sessionId: string;
  previewId: string;
  startTime: number;
  lastActivity: number;
  metrics: PerformanceMetrics[];
  interactions: UserInteraction[];
  errors: ErrorEvent[];
  url: string;
  userAgent: string;
  active: boolean;
}

/**
 * Error Event
 */
export interface ErrorEvent {
  type: 'javascript' | 'resource' | 'network';
  message: string;
  stack?: string;
  filename?: string;
  line?: number;
  column?: number;
  timestamp: number;
}

/**
 * Dashboard Data
 */
export interface PerformanceDashboard {
  sessionId: string;
  previewId: string;
  currentMetrics: PerformanceMetrics;
  averageMetrics: CoreWebVitals;
  scores: {
    lcp: 'good' | 'needs-improvement' | 'poor';
    fid: 'good' | 'needs-improvement' | 'poor';
    cls: 'good' | 'needs-improvement' | 'poor';
    fcp: 'good' | 'needs-improvement' | 'poor';
    ttfb: 'good' | 'needs-improvement' | 'poor';
    overall: number;      // 0-100
  };
  interactionSummary: {
    totalClicks: number;
    totalScrolls: number;
    totalInputs: number;
    averageScrollDepth: number;
    mostClickedElements: Array<{ selector: string; count: number }>;
  };
  errorSummary: {
    totalErrors: number;
    javascriptErrors: number;
    resourceErrors: number;
    networkErrors: number;
    recentErrors: ErrorEvent[];
  };
  timeline: Array<{
    timestamp: number;
    event: string;
    metric?: string;
    value?: number;
  }>;
  recommendations: string[];
}

/**
 * Real-time Update
 */
export interface RealtimeUpdate {
  type: 'metric' | 'interaction' | 'error' | 'vitals';
  sessionId: string;
  timestamp: number;
  data: any;
}

/**
 * Live Performance Monitoring Service
 */
export class LivePerformanceMonitoringService {
  private sessions: Map<string, MonitoringSession> = new Map();
  private realtimeCallbacks: Map<string, Array<(update: RealtimeUpdate) => void>> = new Map();

  /**
   * Create new monitoring session
   */
  createSession(previewId: string, url: string, userAgent: string): string {
    const sessionId = this.generateSessionId();

    const session: MonitoringSession = {
      sessionId,
      previewId,
      startTime: Date.now(),
      lastActivity: Date.now(),
      metrics: [],
      interactions: [],
      errors: [],
      url,
      userAgent,
      active: true,
    };

    this.sessions.set(sessionId, session);

    // Auto-cleanup after 1 hour of inactivity
    setTimeout(() => {
      this.checkSessionActivity(sessionId);
    }, 3600000);

    return sessionId;
  }

  /**
   * Record performance metrics
   */
  recordMetrics(sessionId: string, metrics: PerformanceMetrics): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    session.metrics.push(metrics);
    session.lastActivity = Date.now();

    // Emit realtime update
    this.emitUpdate({
      type: 'metric',
      sessionId,
      timestamp: Date.now(),
      data: metrics,
    });

    // Check for Core Web Vitals updates
    this.emitUpdate({
      type: 'vitals',
      sessionId,
      timestamp: Date.now(),
      data: {
        lcp: metrics.lcp,
        fid: metrics.fid,
        cls: metrics.cls,
        fcp: metrics.fcp,
        ttfb: metrics.ttfb,
      },
    });
  }

  /**
   * Record user interaction
   */
  recordInteraction(sessionId: string, interaction: UserInteraction): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    session.interactions.push(interaction);
    session.lastActivity = Date.now();

    // Emit realtime update
    this.emitUpdate({
      type: 'interaction',
      sessionId,
      timestamp: Date.now(),
      data: interaction,
    });
  }

  /**
   * Record error
   */
  recordError(sessionId: string, error: ErrorEvent): void {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    session.errors.push(error);
    session.lastActivity = Date.now();

    // Emit realtime update
    this.emitUpdate({
      type: 'error',
      sessionId,
      timestamp: Date.now(),
      data: error,
    });
  }

  /**
   * Get dashboard data
   */
  getDashboard(sessionId: string): PerformanceDashboard {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    const currentMetrics = session.metrics[session.metrics.length - 1];
    const averageMetrics = this.calculateAverageMetrics(session.metrics);
    const scores = this.calculateScores(averageMetrics);
    const interactionSummary = this.summarizeInteractions(session.interactions);
    const errorSummary = this.summarizeErrors(session.errors);
    const timeline = this.buildTimeline(session);
    const recommendations = this.generateRecommendations(averageMetrics, session);

    return {
      sessionId,
      previewId: session.previewId,
      currentMetrics,
      averageMetrics,
      scores,
      interactionSummary,
      errorSummary,
      timeline,
      recommendations,
    };
  }

  /**
   * Get session
   */
  getSession(sessionId: string): MonitoringSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get all sessions for preview
   */
  getPreviewSessions(previewId: string): MonitoringSession[] {
    return Array.from(this.sessions.values()).filter(
      session => session.previewId === previewId && session.active
    );
  }

  /**
   * End session
   */
  endSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.active = false;
    }
  }

  /**
   * Subscribe to realtime updates
   */
  subscribe(sessionId: string, callback: (update: RealtimeUpdate) => void): () => void {
    if (!this.realtimeCallbacks.has(sessionId)) {
      this.realtimeCallbacks.set(sessionId, []);
    }

    this.realtimeCallbacks.get(sessionId)!.push(callback);

    // Return unsubscribe function
    return () => {
      const callbacks = this.realtimeCallbacks.get(sessionId);
      if (callbacks) {
        const index = callbacks.indexOf(callback);
        if (index > -1) {
          callbacks.splice(index, 1);
        }
      }
    };
  }

  /**
   * Calculate average metrics
   */
  private calculateAverageMetrics(metrics: PerformanceMetrics[]): CoreWebVitals {
    if (metrics.length === 0) {
      return {
        lcp: 0,
        fid: 0,
        cls: 0,
        fcp: 0,
        ttfb: 0,
      };
    }

    const sum = metrics.reduce(
      (acc, m) => ({
        lcp: acc.lcp + m.lcp,
        fid: acc.fid + m.fid,
        cls: acc.cls + m.cls,
        fcp: acc.fcp + m.fcp,
        ttfb: acc.ttfb + m.ttfb,
      }),
      { lcp: 0, fid: 0, cls: 0, fcp: 0, ttfb: 0 }
    );

    return {
      lcp: sum.lcp / metrics.length,
      fid: sum.fid / metrics.length,
      cls: sum.cls / metrics.length,
      fcp: sum.fcp / metrics.length,
      ttfb: sum.ttfb / metrics.length,
    };
  }

  /**
   * Calculate scores based on Core Web Vitals thresholds
   */
  private calculateScores(metrics: CoreWebVitals): PerformanceDashboard['scores'] {
    const lcpScore = metrics.lcp < 2500 ? 'good' : metrics.lcp < 4000 ? 'needs-improvement' : 'poor';
    const fidScore = metrics.fid < 100 ? 'good' : metrics.fid < 300 ? 'needs-improvement' : 'poor';
    const clsScore = metrics.cls < 0.1 ? 'good' : metrics.cls < 0.25 ? 'needs-improvement' : 'poor';
    const fcpScore = metrics.fcp < 1800 ? 'good' : metrics.fcp < 3000 ? 'needs-improvement' : 'poor';
    const ttfbScore = metrics.ttfb < 800 ? 'good' : metrics.ttfb < 1800 ? 'needs-improvement' : 'poor';

    // Calculate overall score (0-100)
    const scores = {
      lcp: lcpScore === 'good' ? 100 : lcpScore === 'needs-improvement' ? 50 : 0,
      fid: fidScore === 'good' ? 100 : fidScore === 'needs-improvement' ? 50 : 0,
      cls: clsScore === 'good' ? 100 : clsScore === 'needs-improvement' ? 50 : 0,
      fcp: fcpScore === 'good' ? 100 : fcpScore === 'needs-improvement' ? 50 : 0,
      ttfb: ttfbScore === 'good' ? 100 : ttfbScore === 'needs-improvement' ? 50 : 0,
    };

    const overall = (scores.lcp + scores.fid + scores.cls + scores.fcp + scores.ttfb) / 5;

    return {
      lcp: lcpScore,
      fid: fidScore,
      cls: clsScore,
      fcp: fcpScore,
      ttfb: ttfbScore,
      overall,
    };
  }

  /**
   * Summarize user interactions
   */
  private summarizeInteractions(interactions: UserInteraction[]): PerformanceDashboard['interactionSummary'] {
    const clicks = interactions.filter(i => i.type === 'click');
    const scrolls = interactions.filter(i => i.type === 'scroll');
    const inputs = interactions.filter(i => i.type === 'input');

    // Calculate average scroll depth
    const scrollDepths = scrolls.map(s => s.value?.scrollPercentage || 0);
    const averageScrollDepth = scrollDepths.length > 0
      ? scrollDepths.reduce((a, b) => a + b, 0) / scrollDepths.length
      : 0;

    // Find most clicked elements
    const clickCounts = new Map<string, number>();
    clicks.forEach(click => {
      const count = clickCounts.get(click.target) || 0;
      clickCounts.set(click.target, count + 1);
    });

    const mostClickedElements = Array.from(clickCounts.entries())
      .map(([selector, count]) => ({ selector, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      totalClicks: clicks.length,
      totalScrolls: scrolls.length,
      totalInputs: inputs.length,
      averageScrollDepth,
      mostClickedElements,
    };
  }

  /**
   * Summarize errors
   */
  private summarizeErrors(errors: ErrorEvent[]): PerformanceDashboard['errorSummary'] {
    const javascriptErrors = errors.filter(e => e.type === 'javascript').length;
    const resourceErrors = errors.filter(e => e.type === 'resource').length;
    const networkErrors = errors.filter(e => e.type === 'network').length;
    const recentErrors = errors.slice(-10);

    return {
      totalErrors: errors.length,
      javascriptErrors,
      resourceErrors,
      networkErrors,
      recentErrors,
    };
  }

  /**
   * Build timeline of events
   */
  private buildTimeline(session: MonitoringSession): PerformanceDashboard['timeline'] {
    const timeline: PerformanceDashboard['timeline'] = [];

    // Add metrics to timeline
    session.metrics.forEach(metric => {
      timeline.push({
        timestamp: metric.timestamp,
        event: 'Performance Measurement',
        metric: 'LCP',
        value: metric.lcp,
      });
    });

    // Add interactions to timeline
    session.interactions.forEach(interaction => {
      timeline.push({
        timestamp: interaction.timestamp,
        event: `User ${interaction.type}`,
      });
    });

    // Add errors to timeline
    session.errors.forEach(error => {
      timeline.push({
        timestamp: error.timestamp,
        event: `${error.type} error`,
      });
    });

    // Sort by timestamp
    return timeline.sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Generate recommendations
   */
  private generateRecommendations(metrics: CoreWebVitals, session: MonitoringSession): string[] {
    const recommendations: string[] = [];

    // LCP recommendations
    if (metrics.lcp >= 4000) {
      recommendations.push('Critical: Reduce Largest Contentful Paint (LCP). Consider optimizing images, implementing lazy loading, or reducing server response time.');
    } else if (metrics.lcp >= 2500) {
      recommendations.push('Improve Largest Contentful Paint (LCP). Optimize resource loading priority and consider using a CDN.');
    }

    // FID recommendations
    if (metrics.fid >= 300) {
      recommendations.push('Critical: Reduce First Input Delay (FID). Break up long JavaScript tasks and minimize main thread work.');
    } else if (metrics.fid >= 100) {
      recommendations.push('Improve First Input Delay (FID). Consider code splitting and deferring non-critical JavaScript.');
    }

    // CLS recommendations
    if (metrics.cls >= 0.25) {
      recommendations.push('Critical: Reduce Cumulative Layout Shift (CLS). Add size attributes to images and reserve space for dynamic content.');
    } else if (metrics.cls >= 0.1) {
      recommendations.push('Improve Cumulative Layout Shift (CLS). Ensure fonts load properly and avoid inserting content above existing content.');
    }

    // FCP recommendations
    if (metrics.fcp >= 3000) {
      recommendations.push('Improve First Contentful Paint (FCP). Reduce server response time and eliminate render-blocking resources.');
    }

    // TTFB recommendations
    if (metrics.ttfb >= 1800) {
      recommendations.push('Improve Time to First Byte (TTFB). Optimize server configuration, use caching, or upgrade hosting.');
    }

    // Error-based recommendations
    if (session.errors.length > 0) {
      const jsErrors = session.errors.filter(e => e.type === 'javascript').length;
      if (jsErrors > 5) {
        recommendations.push(`Fix JavaScript errors (${jsErrors} detected). Check browser console for details.`);
      }

      const resourceErrors = session.errors.filter(e => e.type === 'resource').length;
      if (resourceErrors > 0) {
        recommendations.push(`Fix missing resources (${resourceErrors} 404 errors). Verify all asset paths are correct.`);
      }
    }

    // Interaction-based recommendations
    const scrollEvents = session.interactions.filter(i => i.type === 'scroll');
    if (scrollEvents.length > 20) {
      recommendations.push('High scroll activity detected. Consider implementing infinite scroll or pagination for better performance.');
    }

    if (recommendations.length === 0) {
      recommendations.push('All Core Web Vitals are within good thresholds. Great job!');
    }

    return recommendations;
  }

  /**
   * Emit realtime update to subscribers
   */
  private emitUpdate(update: RealtimeUpdate): void {
    const callbacks = this.realtimeCallbacks.get(update.sessionId);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(update);
        } catch (error) {
          console.error('Error in realtime callback:', error);
        }
      });
    }
  }

  /**
   * Generate session ID
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Check session activity and cleanup if inactive
   */
  private checkSessionActivity(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const inactiveTime = Date.now() - session.lastActivity;
    const oneHour = 3600000;

    if (inactiveTime > oneHour) {
      session.active = false;
      // Keep for historical data, don't delete
      console.log(`Session ${sessionId} marked as inactive`);
    }
  }

  /**
   * Generate monitoring script for client-side injection
   */
  generateMonitoringScript(sessionId: string, apiEndpoint: string): string {
    return `
<!-- Live Performance Monitoring Script -->
<script>
(function() {
  const SESSION_ID = '${sessionId}';
  const API_ENDPOINT = '${apiEndpoint}';

  // Core Web Vitals tracking
  let lcpValue = 0;
  let fidValue = 0;
  let clsValue = 0;
  let fcpValue = 0;
  let ttfbValue = 0;

  // Web Vitals library (inline version)
  const webVitals = {
    onLCP: function(callback) {
      if ('PerformanceObserver' in window) {
        const observer = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const lastEntry = entries[entries.length - 1];
          callback({ value: lastEntry.renderTime || lastEntry.loadTime });
        });
        observer.observe({ type: 'largest-contentful-paint', buffered: true });
      }
    },
    onFID: function(callback) {
      if ('PerformanceObserver' in window) {
        const observer = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          entries.forEach((entry) => {
            callback({ value: entry.processingStart - entry.startTime });
          });
        });
        observer.observe({ type: 'first-input', buffered: true });
      }
    },
    onCLS: function(callback) {
      if ('PerformanceObserver' in window) {
        let clsValue = 0;
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (!entry.hadRecentInput) {
              clsValue += entry.value;
              callback({ value: clsValue });
            }
          }
        });
        observer.observe({ type: 'layout-shift', buffered: true });
      }
    },
    onFCP: function(callback) {
      if ('PerformanceObserver' in window) {
        const observer = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          entries.forEach((entry) => {
            if (entry.name === 'first-contentful-paint') {
              callback({ value: entry.startTime });
            }
          });
        });
        observer.observe({ type: 'paint', buffered: true });
      }
    },
    onTTFB: function(callback) {
      const navigationEntry = performance.getEntriesByType('navigation')[0];
      if (navigationEntry) {
        callback({ value: navigationEntry.responseStart - navigationEntry.requestStart });
      }
    }
  };

  // Track Core Web Vitals
  webVitals.onLCP((metric) => {
    lcpValue = metric.value;
    sendMetrics();
  });

  webVitals.onFID((metric) => {
    fidValue = metric.value;
    sendMetrics();
  });

  webVitals.onCLS((metric) => {
    clsValue = metric.value;
    sendMetrics();
  });

  webVitals.onFCP((metric) => {
    fcpValue = metric.value;
    sendMetrics();
  });

  webVitals.onTTFB((metric) => {
    ttfbValue = metric.value;
    sendMetrics();
  });

  // Send metrics to server
  function sendMetrics() {
    const metrics = {
      lcp: lcpValue,
      fid: fidValue,
      cls: clsValue,
      fcp: fcpValue,
      ttfb: ttfbValue,
      domContentLoaded: performance.timing.domContentLoadedEventEnd - performance.timing.navigationStart,
      loadComplete: performance.timing.loadEventEnd - performance.timing.navigationStart,
      domInteractive: performance.timing.domInteractive - performance.timing.navigationStart,
      totalResources: performance.getEntriesByType('resource').length,
      totalResourceSize: calculateResourceSize(),
      totalResourceTime: calculateResourceTime(),
      jsHeapSize: performance.memory ? performance.memory.usedJSHeapSize : undefined,
      jsHeapLimit: performance.memory ? performance.memory.jsHeapSizeLimit : undefined,
      effectiveConnectionType: navigator.connection ? navigator.connection.effectiveType : undefined,
      downlink: navigator.connection ? navigator.connection.downlink : undefined,
      rtt: navigator.connection ? navigator.connection.rtt : undefined,
      deviceMemory: navigator.deviceMemory,
      hardwareConcurrency: navigator.hardwareConcurrency,
      timestamp: Date.now(),
      url: window.location.href,
      userAgent: navigator.userAgent
    };

    fetch(API_ENDPOINT + '/metrics', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: SESSION_ID, metrics }),
      keepalive: true
    }).catch(err => console.error('Failed to send metrics:', err));
  }

  // Calculate total resource size
  function calculateResourceSize() {
    const resources = performance.getEntriesByType('resource');
    return resources.reduce((total, resource) => total + (resource.transferSize || 0), 0);
  }

  // Calculate total resource time
  function calculateResourceTime() {
    const resources = performance.getEntriesByType('resource');
    return resources.reduce((total, resource) => total + resource.duration, 0);
  }

  // Track user interactions
  function trackInteraction(type, event) {
    const interaction = {
      type: type,
      target: getElementSelector(event.target),
      timestamp: Date.now(),
      x: event.clientX,
      y: event.clientY,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      }
    };

    if (type === 'scroll') {
      interaction.value = {
        scrollTop: window.pageYOffset,
        scrollPercentage: (window.pageYOffset / (document.documentElement.scrollHeight - window.innerHeight)) * 100
      };
    }

    fetch(API_ENDPOINT + '/interaction', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: SESSION_ID, interaction }),
      keepalive: true
    }).catch(err => console.error('Failed to send interaction:', err));
  }

  // Get CSS selector for element
  function getElementSelector(element) {
    if (!element) return 'unknown';
    if (element.id) return '#' + element.id;
    if (element.className) {
      const classes = element.className.split(' ').filter(c => c).join('.');
      return element.tagName.toLowerCase() + '.' + classes;
    }
    return element.tagName.toLowerCase();
  }

  // Track clicks
  document.addEventListener('click', (e) => trackInteraction('click', e), true);

  // Track scrolls (throttled)
  let scrollTimeout;
  window.addEventListener('scroll', (e) => {
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => trackInteraction('scroll', e), 200);
  });

  // Track inputs
  document.addEventListener('input', (e) => trackInteraction('input', e), true);

  // Track errors
  window.addEventListener('error', (event) => {
    const error = {
      type: event.target.tagName ? 'resource' : 'javascript',
      message: event.message || 'Resource failed to load',
      filename: event.filename,
      line: event.lineno,
      column: event.colno,
      stack: event.error ? event.error.stack : undefined,
      timestamp: Date.now()
    };

    fetch(API_ENDPOINT + '/error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: SESSION_ID, error }),
      keepalive: true
    }).catch(err => console.error('Failed to send error:', err));
  }, true);

  // Send initial metrics after page load
  window.addEventListener('load', () => {
    setTimeout(sendMetrics, 1000);
  });

  // Send metrics before page unload
  window.addEventListener('beforeunload', () => {
    sendMetrics();
  });

  console.log('🔍 Live Performance Monitoring Active - Session:', SESSION_ID);
})();
</script>
`;
  }
}

// Export singleton instance
export default new LivePerformanceMonitoringService();
