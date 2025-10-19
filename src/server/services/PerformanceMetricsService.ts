import puppeteer, { Browser, Page, CDPSession } from 'puppeteer';
import lighthouse from 'lighthouse';
import * as chromeLauncher from 'chrome-launcher';

export interface PerformanceMetrics {
  tbt: TBTMetric;
  speedIndex: SpeedIndexMetric;
  tti: TTIMetric;
  resourceTimings: ResourceTiming[];
  longTasks: LongTask[];
  networkRequests: NetworkRequest[];
  totalPageSize: number;
  totalRequests: number;
  timestamp: string;
}

export interface TBTMetric {
  value: number; // milliseconds
  rating: 'good' | 'needs-improvement' | 'poor';
  longTasks: number;
  blockingTime: number;
  threshold: {
    good: number;
    poor: number;
  };
}

export interface SpeedIndexMetric {
  value: number; // milliseconds
  rating: 'good' | 'needs-improvement' | 'poor';
  visualProgress: Array<{
    timestamp: number;
    progress: number;
  }>;
  threshold: {
    good: number;
    poor: number;
  };
}

export interface TTIMetric {
  value: number; // milliseconds
  rating: 'good' | 'needs-improvement' | 'poor';
  firstCPUIdle: number;
  networkIdleTime: number;
  threshold: {
    good: number;
    poor: number;
  };
}

export interface ResourceTiming {
  name: string;
  type: string;
  startTime: number;
  duration: number;
  transferSize: number;
  decodedBodySize: number;
  initiatorType: string;
  renderBlocking: boolean;
}

export interface LongTask {
  duration: number;
  startTime: number;
  attributionName: string;
  attributionType: string;
}

export interface NetworkRequest {
  url: string;
  method: string;
  statusCode: number;
  resourceType: string;
  mimeType: string;
  requestTime: number;
  responseTime: number;
  transferSize: number;
  cached: boolean;
  blocking: boolean;
}

export class PerformanceMetricsService {
  /**
   * Measure all performance metrics using Lighthouse
   */
  async measureWithLighthouse(url: string): Promise<any> {
    const chrome = await chromeLauncher.launch({ chromeFlags: ['--headless'] });

    try {
      const options = {
        logLevel: 'info' as const,
        output: 'json' as const,
        onlyCategories: ['performance'],
        port: chrome.port,
      };

      const runnerResult = await lighthouse(url, options);

      if (!runnerResult) {
        throw new Error('Lighthouse failed to return results');
      }

      const { lhr } = runnerResult;

      // Extract metrics
      const metrics = lhr.audits['metrics']?.details as any;
      const speedIndex = lhr.audits['speed-index'];
      const tbt = lhr.audits['total-blocking-time'];
      const tti = lhr.audits['interactive'];

      return {
        speedIndex: speedIndex?.numericValue || 0,
        totalBlockingTime: tbt?.numericValue || 0,
        timeToInteractive: tti?.numericValue || 0,
        firstContentfulPaint: metrics?.items?.[0]?.firstContentfulPaint || 0,
        largestContentfulPaint: metrics?.items?.[0]?.largestContentfulPaint || 0,
        cumulativeLayoutShift: metrics?.items?.[0]?.cumulativeLayoutShift || 0,
        performanceScore: lhr.categories.performance.score * 100,
        opportunities: lhr.audits,
      };
    } finally {
      await chrome.kill();
    }
  }

  /**
   * Measure performance metrics using Puppeteer
   */
  async measurePerformance(url: string): Promise<PerformanceMetrics> {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await this.browser.newPage();

      // Enable CDP for detailed metrics
      const client = await page.target().createCDPSession();
      await client.send('Performance.enable');
      await client.send('Network.enable');

      // Track network requests
      const networkRequests: NetworkRequest[] = [];
      let totalPageSize = 0;

      client.on('Network.responseReceived', (params) => {
        const response = params.response;
        networkRequests.push({
          url: response.url,
          method: params.type,
          statusCode: response.status,
          resourceType: params.type,
          mimeType: response.mimeType,
          requestTime: params.timestamp * 1000,
          responseTime: params.timestamp * 1000,
          transferSize: response.encodedDataLength || 0,
          cached: response.fromDiskCache || response.fromServiceWorker,
          blocking: this.isRenderBlocking(response.url, params.type),
        });
        totalPageSize += response.encodedDataLength || 0;
      });

      // Navigate and wait
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

      // Get resource timings
      const resourceTimings = await this.getResourceTimings(page);

      // Get long tasks
      const longTasks = await this.getLongTasks(page);

      // Calculate TBT
      const tbt = this.calculateTBT(longTasks);

      // Calculate TTI
      const tti = await this.calculateTTI(page, longTasks);

      // Get Speed Index from Lighthouse (more accurate)
      let speedIndex: SpeedIndexMetric;
      try {
        const lighthouseData = await this.measureWithLighthouse(url);
        speedIndex = this.processSpeedIndex(lighthouseData.speedIndex);
      } catch {
        // Fallback if Lighthouse fails
        speedIndex = {
          value: 0,
          rating: 'poor',
          visualProgress: [],
          threshold: { good: 3400, poor: 5800 },
        };
      }

      await page.close();

      return {
        tbt,
        speedIndex,
        tti,
        resourceTimings,
        longTasks,
        networkRequests,
        totalPageSize,
        totalRequests: networkRequests.length,
        timestamp: new Date().toISOString(),
      };
    } finally {
      await browser.close();
    }
  }

  /**
   * Get resource timings from page
   */
  private async getResourceTimings(page: Page): Promise<ResourceTiming[]> {
    return await page.evaluate(() => {
      const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
      return resources.map(resource => ({
        name: resource.name,
        type: resource.initiatorType,
        startTime: resource.startTime,
        duration: resource.duration,
        transferSize: resource.transferSize,
        decodedBodySize: resource.decodedBodySize,
        initiatorType: resource.initiatorType,
        renderBlocking: (resource as any).renderBlocking === 'blocking',
      }));
    });
  }

  /**
   * Get long tasks from page
   */
  private async getLongTasks(page: Page): Promise<LongTask[]> {
    return await page.evaluate(() => {
      const longTasks: LongTask[] = [];

      try {
        const observer = new PerformanceObserver((list) => {
          const entries = list.getEntries();
          entries.forEach((entry: any) => {
            if (entry.duration > 50) {
              longTasks.push({
                duration: entry.duration,
                startTime: entry.startTime,
                attributionName: entry.attribution?.[0]?.name || 'unknown',
                attributionType: entry.attribution?.[0]?.entryType || 'unknown',
              });
            }
          });
        });

        observer.observe({ type: 'longtask', buffered: true });
      } catch (error) {
        // PerformanceObserver might not be supported
      }

      return longTasks;
    });
  }

  /**
   * Calculate Total Blocking Time
   */
  private calculateTBT(longTasks: LongTask[]): TBTMetric {
    let totalBlockingTime = 0;
    let longTaskCount = 0;

    longTasks.forEach(task => {
      if (task.duration > 50) {
        totalBlockingTime += task.duration - 50;
        longTaskCount++;
      }
    });

    return {
      value: totalBlockingTime,
      rating: totalBlockingTime <= 200 ? 'good' : totalBlockingTime <= 600 ? 'needs-improvement' : 'poor',
      longTasks: longTaskCount,
      blockingTime: totalBlockingTime,
      threshold: {
        good: 200,
        poor: 600,
      },
    };
  }

  /**
   * Calculate Time to Interactive
   */
  private async calculateTTI(page: Page, longTasks: LongTask[]): Promise<TTIMetric> {
    const timing = await page.evaluate(() => {
      const perf = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      return {
        domContentLoaded: perf.domContentLoadedEventEnd - perf.fetchStart,
        loadComplete: perf.loadEventEnd - perf.fetchStart,
        domInteractive: perf.domInteractive - perf.fetchStart,
      };
    });

    // TTI is approximated as the time when:
    // 1. Page is visually ready (domContentLoaded)
    // 2. No long tasks for 5 seconds
    // 3. Network is mostly idle

    let tti = timing.domContentLoaded;

    // Find last long task
    if (longTasks.length > 0) {
      const lastTask = longTasks[longTasks.length - 1];
      tti = Math.max(tti, lastTask.startTime + lastTask.duration + 5000);
    }

    // Cap at load complete
    tti = Math.min(tti, timing.loadComplete);

    return {
      value: tti,
      rating: tti <= 3800 ? 'good' : tti <= 7300 ? 'needs-improvement' : 'poor',
      firstCPUIdle: timing.domContentLoaded,
      networkIdleTime: timing.loadComplete,
      threshold: {
        good: 3800,
        poor: 7300,
      },
    };
  }

  /**
   * Process Speed Index metric
   */
  private processSpeedIndex(value: number): SpeedIndexMetric {
    return {
      value,
      rating: value <= 3400 ? 'good' : value <= 5800 ? 'needs-improvement' : 'poor',
      visualProgress: [],
      threshold: {
        good: 3400,
        poor: 5800,
      },
    };
  }

  /**
   * Check if resource is render-blocking
   */
  private isRenderBlocking(url: string, type: string): boolean {
    // CSS is render-blocking by default
    if (type === 'Stylesheet') return true;

    // JS without async/defer is render-blocking
    if (type === 'Script') {
      // Would need to check the actual script tag attributes
      // For now, assume scripts in <head> are blocking
      return true;
    }

    return false;
  }
}

export default new PerformanceMetricsService();
