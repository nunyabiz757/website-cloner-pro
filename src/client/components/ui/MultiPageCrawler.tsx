import React, { useState, useEffect } from 'react';
import {
  Globe,
  Play,
  CheckCircle,
  AlertCircle,
  Loader,
  Download,
} from 'lucide-react';

interface CrawlOptions {
  maxPages: number;
  maxDepth: number;
  sameDomainOnly: boolean;
  includeSubdomains: boolean;
  excludePatterns: string;
  includeAssets: boolean;
}

interface CrawlStatus {
  status: 'idle' | 'running' | 'completed' | 'failed';
  crawlId?: string;
  url?: string;
  pagesVisited?: number;
  pagesCrawled?: number;
  elapsedTime?: number;
  totalPages?: number;
  totalAssets?: number;
  error?: string;
}

export const MultiPageCrawler: React.FC = () => {
  const [url, setUrl] = useState('');
  const [options, setOptions] = useState<CrawlOptions>({
    maxPages: 50,
    maxDepth: 3,
    sameDomainOnly: true,
    includeSubdomains: false,
    excludePatterns: '',
    includeAssets: true,
  });

  const [crawlStatus, setCrawlStatus] = useState<CrawlStatus>({ status: 'idle' });
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [pollingInterval]);

  const startCrawl = async () => {
    if (!url) {
      setCrawlStatus({ status: 'failed', error: 'Please enter a URL' });
      return;
    }

    try {
      const excludePatternsArray = options.excludePatterns
        .split(',')
        .map(p => p.trim())
        .filter(p => p.length > 0);

      const response = await fetch('/api/multi-page-crawler/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          ...options,
          excludePatterns: excludePatternsArray,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to start crawl');
      }

      setCrawlStatus({
        status: 'running',
        crawlId: data.crawlId,
        url,
        pagesVisited: 0,
        pagesCrawled: 0,
      });

      // Start polling for status
      const interval = setInterval(() => {
        pollCrawlStatus(data.crawlId);
      }, 2000);
      setPollingInterval(interval);
    } catch (error) {
      setCrawlStatus({
        status: 'failed',
        error: error instanceof Error ? error.message : 'Failed to start crawl',
      });
    }
  };

  const pollCrawlStatus = async (crawlId: string) => {
    try {
      const response = await fetch(`/api/multi-page-crawler/status/${crawlId}`);
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to get status');
      }

      setCrawlStatus({
        status: data.status,
        crawlId: data.crawlId,
        url: data.url,
        pagesVisited: data.pagesVisited,
        pagesCrawled: data.pagesCrawled,
        elapsedTime: data.elapsedTime,
        totalPages: data.result?.totalPages,
        totalAssets: data.result?.totalAssets,
        error: data.error,
      });

      // Stop polling if completed or failed
      if (data.status === 'completed' || data.status === 'failed') {
        if (pollingInterval) {
          clearInterval(pollingInterval);
          setPollingInterval(null);
        }
      }
    } catch (error) {
      console.error('Failed to poll status:', error);
    }
  };

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const getStatusColor = () => {
    switch (crawlStatus.status) {
      case 'running':
        return 'blue';
      case 'completed':
        return 'green';
      case 'failed':
        return 'red';
      default:
        return 'gray';
    }
  };

  const getStatusIcon = () => {
    switch (crawlStatus.status) {
      case 'running':
        return <Loader className="w-5 h-5 text-blue-600 animate-spin" />;
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'failed':
        return <AlertCircle className="w-5 h-5 text-red-600" />;
      default:
        return <Globe className="w-5 h-5 text-gray-600" />;
    }
  };

  return (
    <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-lg p-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-purple-100 rounded-lg">
          <Globe className="w-6 h-6 text-purple-600" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Multi-Page Crawler</h2>
          <p className="text-gray-600">Crawl entire websites with multiple pages</p>
        </div>
      </div>

      {/* URL Input */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Website URL
        </label>
        <div className="flex gap-2">
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
            disabled={crawlStatus.status === 'running'}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:bg-gray-100"
          />
          <button
            onClick={startCrawl}
            disabled={crawlStatus.status === 'running' || !url}
            className="flex items-center gap-2 px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Play className="w-5 h-5" />
            Start Crawl
          </button>
        </div>
      </div>

      {/* Crawl Options */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Max Pages: {options.maxPages}
          </label>
          <input
            type="range"
            min="1"
            max="100"
            value={options.maxPages}
            onChange={(e) => setOptions({ ...options, maxPages: parseInt(e.target.value) })}
            disabled={crawlStatus.status === 'running'}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-600 disabled:opacity-50"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Max Depth: {options.maxDepth}
          </label>
          <input
            type="range"
            min="1"
            max="5"
            value={options.maxDepth}
            onChange={(e) => setOptions({ ...options, maxDepth: parseInt(e.target.value) })}
            disabled={crawlStatus.status === 'running'}
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-600 disabled:opacity-50"
          />
        </div>

        <div className="md:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Exclude Patterns (comma-separated)
          </label>
          <input
            type="text"
            value={options.excludePatterns}
            onChange={(e) => setOptions({ ...options, excludePatterns: e.target.value })}
            placeholder="/blog, /admin, /login"
            disabled={crawlStatus.status === 'running'}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent disabled:bg-gray-100"
          />
        </div>

        <div className="space-y-3 md:col-span-2">
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={options.sameDomainOnly}
              onChange={(e) => setOptions({ ...options, sameDomainOnly: e.target.checked })}
              disabled={crawlStatus.status === 'running'}
              className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500 disabled:opacity-50"
            />
            <span className="text-gray-700">Same domain only</span>
          </label>

          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={options.includeSubdomains}
              onChange={(e) => setOptions({ ...options, includeSubdomains: e.target.checked })}
              disabled={crawlStatus.status === 'running' || !options.sameDomainOnly}
              className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500 disabled:opacity-50"
            />
            <span className={options.sameDomainOnly ? 'text-gray-700' : 'text-gray-400'}>
              Include subdomains
            </span>
          </label>

          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={options.includeAssets}
              onChange={(e) => setOptions({ ...options, includeAssets: e.target.checked })}
              disabled={crawlStatus.status === 'running'}
              className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500 disabled:opacity-50"
            />
            <span className="text-gray-700">Download assets (images, CSS, JS, fonts)</span>
          </label>
        </div>
      </div>

      {/* Crawl Status */}
      {crawlStatus.status !== 'idle' && (
        <div className={`bg-${getStatusColor()}-50 border border-${getStatusColor()}-200 rounded-lg p-6`}>
          <div className="flex items-center gap-2 mb-4">
            {getStatusIcon()}
            <h3 className={`font-semibold text-${getStatusColor()}-900 capitalize`}>
              {crawlStatus.status}
            </h3>
          </div>

          {crawlStatus.status === 'running' && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-purple-600">Pages Visited</p>
                  <p className="text-2xl font-bold text-purple-700">
                    {crawlStatus.pagesVisited || 0}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-purple-600">Pages Crawled</p>
                  <p className="text-2xl font-bold text-purple-700">
                    {crawlStatus.pagesCrawled || 0}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-purple-600">Elapsed Time</p>
                  <p className="text-2xl font-bold text-purple-700">
                    {crawlStatus.elapsedTime ? formatTime(crawlStatus.elapsedTime) : '0:00'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-purple-600">Target URL</p>
                  <p className="text-xs font-medium text-purple-700 truncate">
                    {crawlStatus.url}
                  </p>
                </div>
              </div>

              <div className="w-full bg-purple-200 rounded-full h-2">
                <div
                  className="bg-purple-600 h-2 rounded-full transition-all animate-pulse"
                  style={{
                    width: `${Math.min(
                      ((crawlStatus.pagesCrawled || 0) / options.maxPages) * 100,
                      100
                    )}%`,
                  }}
                ></div>
              </div>
            </div>
          )}

          {crawlStatus.status === 'completed' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-green-600">Total Pages</p>
                  <p className="text-2xl font-bold text-green-700">
                    {crawlStatus.totalPages || 0}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-green-600">Total Assets</p>
                  <p className="text-2xl font-bold text-green-700">
                    {crawlStatus.totalAssets || 0}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-green-600">Total Time</p>
                  <p className="text-2xl font-bold text-green-700">
                    {crawlStatus.elapsedTime ? formatTime(crawlStatus.elapsedTime) : '0:00'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-green-600">Crawl ID</p>
                  <p className="text-xs font-mono text-green-700 break-all">
                    {crawlStatus.crawlId?.split('_').pop()}
                  </p>
                </div>
              </div>

              <button
                onClick={() => {
                  // In production, this would download the crawled site
                  alert(`Download crawled site: ${crawlStatus.crawlId}`);
                }}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
              >
                <Download className="w-5 h-5" />
                Download Crawled Site
              </button>
            </div>
          )}

          {crawlStatus.status === 'failed' && crawlStatus.error && (
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-800">{crawlStatus.error}</p>
            </div>
          )}
        </div>
      )}

      {/* Info Box */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="text-sm font-medium text-blue-900 mb-2">How it works</h4>
        <ul className="text-xs text-blue-800 space-y-1 list-disc list-inside">
          <li>Enter a website URL and configure crawl options</li>
          <li>The crawler will visit pages up to the specified depth</li>
          <li>All HTML, CSS, JS, and assets will be downloaded</li>
          <li>Progress is tracked in real-time during the crawl</li>
          <li>Download the complete site when finished</li>
        </ul>
      </div>
    </div>
  );
};
