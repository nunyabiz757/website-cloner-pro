import puppeteer, { Browser, Page } from 'puppeteer';

export interface CoreWebVitals {
  lcp: LCPMetric;
  fid: FIDMetric;
  inp: INPMetric;
  cls: CLSMetric;
  fcp: FCPMetric;
  ttfb: TTFBMetric;
  timestamp: string;
  url: string;
  deviceType: 'mobile' | 'desktop';
}

export interface LCPMetric {
  value: number; // milliseconds
  rating: 'good' | 'needs-improvement' | 'poor';
  element?: string;
  elementSelector?: string;
  renderTime: number;
  loadTime: number;
  size: number;
  threshold: {
    good: number;
    poor: number;
  };
}

export interface FIDMetric {
  value: number; // milliseconds
  rating: 'good' | 'needs-improvement' | 'poor';
  eventType?: string;
  processingTime: number;
  threshold: {
    good: number;
    poor: number;
  };
}

export interface INPMetric {
  value: number; // milliseconds
  rating: 'good' | 'needs-improvement' | 'poor';
  interactions: number;
  worstInteraction?: {
    eventType: string;
    duration: number;
    target: string;
  };
  threshold: {
    good: number;
    poor: number;
  };
}

export interface CLSMetric {
  value: number; // score
  rating: 'good' | 'needs-improvement' | 'poor';
  shifts: LayoutShift[];
  affectedElements: string[];
  threshold: {
    good: number;
    poor: number;
  };
}

export interface LayoutShift {
  value: number;
  time: number;
  elements: Array<{
    selector: string;
    previousRect: { x: number; y: number; width: number; height: number };
    currentRect: { x: number; y: number; width: number; height: number };
  }>;
}

export interface FCPMetric {
  value: number; // milliseconds
  rating: 'good' | 'needs-improvement' | 'poor';
  threshold: {
    good: number;
    poor: number;
  };
}

export interface TTFBMetric {
  value: number; // milliseconds
  rating: 'good' | 'needs-improvement' | 'poor';
  navigationStart: number;
  responseStart: number;
  threshold: {
    good: number;
    poor: number;
  };
}

export class CoreWebVitalsService {
  private browser: Browser | null = null;

  /**
   * Measure Core Web Vitals for a URL
   */
  async measureWebVitals(
    url: string,
    options: {
      deviceType?: 'mobile' | 'desktop';
      timeout?: number;
    } = {}
  ): Promise<CoreWebVitals> {
    const { deviceType = 'desktop', timeout = 60000 } = options;

    this.browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await this.browser.newPage();

      // Set viewport based on device type
      if (deviceType === 'mobile') {
        await page.setViewport({ width: 375, height: 667, isMobile: true });
      } else {
        await page.setViewport({ width: 1920, height: 1080 });
      }

      // Enable performance monitoring
      await page.evaluateOnNewDocument(() => {
        (window as any).__webVitalsData = {
          lcp: null,
          fid: null,
          inp: null,
          cls: [],
          fcp: null,
          layoutShifts: [],
        };
      });

      // Inject Web Vitals measurement script
      await page.evaluateOnNewDocument(() => {
        // LCP Observer
        const lcpObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          const lastEntry = entries[entries.length - 1] as any;
          (window as any).__webVitalsData.lcp = {
            value: lastEntry.renderTime || lastEntry.loadTime,
            renderTime: lastEntry.renderTime,
            loadTime: lastEntry.loadTime,
            size: lastEntry.size,
            element: lastEntry.element?.tagName || '',
            selector: lastEntry.element ? getSelector(lastEntry.element) : '',
          };
        });
        lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });

        // FID Observer
        const fidObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          entries.forEach((entry: any) => {
            if (!entry.processingStart) return;
            const fid = entry.processingStart - entry.startTime;
            (window as any).__webVitalsData.fid = {
              value: fid,
              eventType: entry.name,
              processingTime: entry.processingEnd - entry.processingStart,
            };
          });
        });
        fidObserver.observe({ type: 'first-input', buffered: true });

        // INP Observer (Interaction to Next Paint)
        let interactions: any[] = [];
        const inpObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          entries.forEach((entry: any) => {
            interactions.push({
              eventType: entry.name,
              duration: entry.duration,
              target: entry.target ? getSelector(entry.target) : 'unknown',
              startTime: entry.startTime,
            });
          });

          // Calculate INP (p98 of all interactions)
          if (interactions.length > 0) {
            const sorted = [...interactions].sort((a, b) => b.duration - a.duration);
            const p98Index = Math.floor(sorted.length * 0.02);
            const worstInteraction = sorted[p98Index] || sorted[0];
            (window as any).__webVitalsData.inp = {
              value: worstInteraction.duration,
              interactions: interactions.length,
              worstInteraction,
            };
          }
        });
        inpObserver.observe({ type: 'event', buffered: true, durationThreshold: 16 });

        // CLS Observer
        let clsValue = 0;
        const clsObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          entries.forEach((entry: any) => {
            if (!entry.hadRecentInput) {
              clsValue += entry.value;
              (window as any).__webVitalsData.layoutShifts.push({
                value: entry.value,
                time: entry.startTime,
                elements: entry.sources?.map((source: any) => ({
                  selector: getSelector(source.node),
                  previousRect: source.previousRect,
                  currentRect: source.currentRect,
                })) || [],
              });
            }
          });
          (window as any).__webVitalsData.cls = clsValue;
        });
        clsObserver.observe({ type: 'layout-shift', buffered: true });

        // FCP Observer
        const fcpObserver = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          entries.forEach((entry: any) => {
            (window as any).__webVitalsData.fcp = entry.startTime;
          });
        });
        fcpObserver.observe({ type: 'paint', buffered: true });

        // Helper function to generate CSS selector
        function getSelector(element: Element): string {
          if (element.id) return `#${element.id}`;
          if (element.className) {
            const classes = Array.from(element.classList).join('.');
            return `${element.tagName.toLowerCase()}.${classes}`;
          }
          return element.tagName.toLowerCase();
        }
      });

      // Navigate to URL
      const response = await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout,
      });

      // Get TTFB
      const ttfb = await this.measureTTFB(page, response);

      // Wait for metrics to be collected
      await page.waitForTimeout(3000);

      // Simulate user interactions for INP
      await this.simulateInteractions(page);

      // Wait a bit more for INP to be captured
      await page.waitForTimeout(2000);

      // Extract collected metrics
      const vitalsData = await page.evaluate(() => (window as any).__webVitalsData);

      await page.close();

      // Process and return metrics
      return {
        lcp: this.processLCP(vitalsData.lcp),
        fid: this.processFID(vitalsData.fid),
        inp: this.processINP(vitalsData.inp),
        cls: this.processCLS(vitalsData.cls, vitalsData.layoutShifts),
        fcp: this.processFCP(vitalsData.fcp),
        ttfb,
        timestamp: new Date().toISOString(),
        url,
        deviceType,
      };
    } finally {
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }
    }
  }

  /**
   * Measure Time to First Byte
   */
  private async measureTTFB(page: Page, response: any): Promise<TTFBMetric> {
    const timing = await page.evaluate(() => {
      const perf = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      return {
        navigationStart: perf.fetchStart,
        responseStart: perf.responseStart,
        ttfb: perf.responseStart - perf.fetchStart,
      };
    });

    const value = timing.ttfb;
    return {
      value,
      rating: value <= 800 ? 'good' : value <= 1800 ? 'needs-improvement' : 'poor',
      navigationStart: timing.navigationStart,
      responseStart: timing.responseStart,
      threshold: {
        good: 800,
        poor: 1800,
      },
    };
  }

  /**
   * Simulate user interactions for INP measurement
   */
  private async simulateInteractions(page: Page) {
    try {
      // Click on interactive elements
      const buttons = await page.$$('button, a, [role="button"]');
      for (let i = 0; i < Math.min(3, buttons.length); i++) {
        try {
          await buttons[i].click();
          await page.waitForTimeout(100);
        } catch {}
      }

      // Scroll
      await page.evaluate(() => {
        window.scrollBy(0, window.innerHeight);
      });
      await page.waitForTimeout(100);

      // Input interaction
      const inputs = await page.$$('input[type="text"], textarea');
      if (inputs.length > 0) {
        try {
          await inputs[0].type('test', { delay: 50 });
        } catch {}
      }
    } catch (error) {
      console.error('Error simulating interactions:', error);
    }
  }

  /**
   * Process LCP metric
   */
  private processLCP(data: any): LCPMetric {
    const value = data?.value || 0;
    return {
      value,
      rating: value <= 2500 ? 'good' : value <= 4000 ? 'needs-improvement' : 'poor',
      element: data?.element,
      elementSelector: data?.selector,
      renderTime: data?.renderTime || 0,
      loadTime: data?.loadTime || 0,
      size: data?.size || 0,
      threshold: {
        good: 2500,
        poor: 4000,
      },
    };
  }

  /**
   * Process FID metric
   */
  private processFID(data: any): FIDMetric {
    const value = data?.value || 0;
    return {
      value,
      rating: value <= 100 ? 'good' : value <= 300 ? 'needs-improvement' : 'poor',
      eventType: data?.eventType,
      processingTime: data?.processingTime || 0,
      threshold: {
        good: 100,
        poor: 300,
      },
    };
  }

  /**
   * Process INP metric
   */
  private processINP(data: any): INPMetric {
    const value = data?.value || 0;
    return {
      value,
      rating: value <= 200 ? 'good' : value <= 500 ? 'needs-improvement' : 'poor',
      interactions: data?.interactions || 0,
      worstInteraction: data?.worstInteraction,
      threshold: {
        good: 200,
        poor: 500,
      },
    };
  }

  /**
   * Process CLS metric
   */
  private processCLS(value: number, shifts: LayoutShift[]): CLSMetric {
    const affectedElements = new Set<string>();
    shifts.forEach(shift => {
      shift.elements?.forEach(el => affectedElements.add(el.selector));
    });

    return {
      value: value || 0,
      rating: value <= 0.1 ? 'good' : value <= 0.25 ? 'needs-improvement' : 'poor',
      shifts: shifts || [],
      affectedElements: Array.from(affectedElements),
      threshold: {
        good: 0.1,
        poor: 0.25,
      },
    };
  }

  /**
   * Process FCP metric
   */
  private processFCP(value: number): FCPMetric {
    return {
      value: value || 0,
      rating: value <= 1800 ? 'good' : value <= 3000 ? 'needs-improvement' : 'poor',
      threshold: {
        good: 1800,
        poor: 3000,
      },
    };
  }
}

export default new CoreWebVitalsService();
