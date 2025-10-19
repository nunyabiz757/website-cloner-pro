import React, { useState } from 'react';
import {
  Zap,
  Download,
  TrendingUp,
  Loader,
  CheckCircle,
  AlertCircle,
  FileText,
  Code,
  Image,
  Gauge,
  Lightbulb,
  BarChart3,
  Minimize2,
} from 'lucide-react';

interface PerformanceOptimizedExportProps {
  htmlContent: string;
}

interface OptimizationOptions {
  minifyHtml: boolean;
  minifyCSS: boolean;
  minifyJS: boolean;
  optimizeImages: boolean;
  generateCriticalCSS: boolean;
  inlineCriticalCSS: boolean;
  lazyLoadImages: boolean;
  removeUnusedCSS: boolean;
  prefetchResources: boolean;
  imageQuality: number;
}

interface OptimizationResult {
  originalSize: number;
  optimizedSize: number;
  compressionRatio: number;
  optimizedHtml: string;
  optimizations: {
    html?: { before: number; after: number };
    css?: { before: number; after: number };
    js?: { before: number; after: number };
    images?: { before: number; after: number; count: number };
  };
  criticalCSS?: string;
  recommendations: string[];
}

export const PerformanceOptimizedExport: React.FC<PerformanceOptimizedExportProps> = ({
  htmlContent,
}) => {
  const [options, setOptions] = useState<OptimizationOptions>({
    minifyHtml: true,
    minifyCSS: true,
    minifyJS: true,
    optimizeImages: true,
    generateCriticalCSS: true,
    inlineCriticalCSS: true,
    lazyLoadImages: true,
    removeUnusedCSS: false,
    prefetchResources: true,
    imageQuality: 85,
  });

  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const optimizeExport = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/export/optimized', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          htmlContent,
          options,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to optimize export');
      }

      setResult(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to optimize export');
    } finally {
      setLoading(false);
    }
  };

  const downloadExport = async () => {
    setDownloading(true);

    try {
      const response = await fetch('/api/export/optimized/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          htmlContent,
          options,
          filename: 'optimized-export.html',
        }),
      });

      if (!response.ok) {
        throw new Error('Download failed');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'optimized-export.html';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setDownloading(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const calculateSavings = (before: number, after: number) => {
    const saved = before - after;
    const percent = ((saved / before) * 100).toFixed(1);
    return { saved, percent };
  };

  const getCompressionColor = (ratio: number) => {
    if (ratio >= 30) return 'text-green-600';
    if (ratio >= 15) return 'text-yellow-600';
    return 'text-orange-600';
  };

  return (
    <div className="max-w-7xl mx-auto bg-white rounded-lg shadow-lg p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Zap className="w-7 h-7 text-yellow-500" />
            Performance-Optimized Export
          </h2>
          <p className="text-gray-600">
            Automatically apply performance optimizations to your export
          </p>
        </div>

        <button
          onClick={optimizeExport}
          disabled={loading}
          className="flex items-center gap-2 px-6 py-3 bg-yellow-600 text-white rounded-lg font-medium hover:bg-yellow-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <Loader className="w-5 h-5 animate-spin" />
              Optimizing...
            </>
          ) : (
            <>
              <Zap className="w-5 h-5" />
              Optimize Export
            </>
          )}
        </button>
      </div>

      {/* Options */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Optimization Options</h3>

        <div className="space-y-4">
          {/* Minification */}
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <Minimize2 className="w-4 h-4" />
              Minification
            </h4>
            <div className="grid grid-cols-3 gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={options.minifyHtml}
                  onChange={(e) => setOptions({ ...options, minifyHtml: e.target.checked })}
                  className="w-4 h-4 text-yellow-600 rounded focus:ring-yellow-500"
                />
                <span className="text-sm font-medium text-gray-900">Minify HTML</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={options.minifyCSS}
                  onChange={(e) => setOptions({ ...options, minifyCSS: e.target.checked })}
                  className="w-4 h-4 text-yellow-600 rounded focus:ring-yellow-500"
                />
                <span className="text-sm font-medium text-gray-900">Minify CSS</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={options.minifyJS}
                  onChange={(e) => setOptions({ ...options, minifyJS: e.target.checked })}
                  className="w-4 h-4 text-yellow-600 rounded focus:ring-yellow-500"
                />
                <span className="text-sm font-medium text-gray-900">Minify JavaScript</span>
              </label>
            </div>
          </div>

          {/* Images */}
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <Image className="w-4 h-4" />
              Images
            </h4>
            <div className="space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={options.optimizeImages}
                  onChange={(e) =>
                    setOptions({ ...options, optimizeImages: e.target.checked })
                  }
                  className="w-4 h-4 text-yellow-600 rounded focus:ring-yellow-500"
                />
                <span className="text-sm font-medium text-gray-900">Optimize Images</span>
              </label>

              {options.optimizeImages && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-2">
                    Image Quality: {options.imageQuality}%
                  </label>
                  <input
                    type="range"
                    min="60"
                    max="100"
                    step="5"
                    value={options.imageQuality}
                    onChange={(e) =>
                      setOptions({ ...options, imageQuality: parseInt(e.target.value) })
                    }
                    className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                  />
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>Smaller</span>
                    <span>Higher Quality</span>
                  </div>
                </div>
              )}

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={options.lazyLoadImages}
                  onChange={(e) =>
                    setOptions({ ...options, lazyLoadImages: e.target.checked })
                  }
                  className="w-4 h-4 text-yellow-600 rounded focus:ring-yellow-500"
                />
                <span className="text-sm font-medium text-gray-900">
                  Add Lazy Loading to Images
                </span>
              </label>
            </div>
          </div>

          {/* CSS */}
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <FileText className="w-4 h-4" />
              CSS Optimization
            </h4>
            <div className="space-y-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={options.generateCriticalCSS}
                  onChange={(e) =>
                    setOptions({ ...options, generateCriticalCSS: e.target.checked })
                  }
                  className="w-4 h-4 text-yellow-600 rounded focus:ring-yellow-500"
                />
                <span className="text-sm font-medium text-gray-900">
                  Generate Critical CSS
                </span>
              </label>

              {options.generateCriticalCSS && (
                <label className="flex items-center gap-2 ml-6 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={options.inlineCriticalCSS}
                    onChange={(e) =>
                      setOptions({ ...options, inlineCriticalCSS: e.target.checked })
                    }
                    className="w-4 h-4 text-yellow-600 rounded focus:ring-yellow-500"
                  />
                  <span className="text-sm font-medium text-gray-900">
                    Inline Critical CSS
                  </span>
                </label>
              )}

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={options.removeUnusedCSS}
                  onChange={(e) =>
                    setOptions({ ...options, removeUnusedCSS: e.target.checked })
                  }
                  className="w-4 h-4 text-yellow-600 rounded focus:ring-yellow-500"
                />
                <span className="text-sm font-medium text-gray-900">Remove Unused CSS</span>
              </label>
            </div>
          </div>

          {/* Advanced */}
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <Gauge className="w-4 h-4" />
              Advanced
            </h4>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={options.prefetchResources}
                onChange={(e) =>
                  setOptions({ ...options, prefetchResources: e.target.checked })
                }
                className="w-4 h-4 text-yellow-600 rounded focus:ring-yellow-500"
              />
              <span className="text-sm font-medium text-gray-900">
                Add Resource Hints (DNS Prefetch, Preconnect)
              </span>
            </label>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-2 text-red-800">
            <AlertCircle className="w-5 h-5" />
            <span className="font-semibold">Error</span>
          </div>
          <p className="text-red-700 mt-1">{error}</p>
        </div>
      )}

      {result && (
        <div className="space-y-6">
          {/* Success Banner */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-6 h-6 text-green-600" />
                <div>
                  <h3 className="text-lg font-semibold text-green-900">
                    Export Optimized Successfully!
                  </h3>
                  <p className="text-sm text-green-700">
                    {result.compressionRatio.toFixed(1)}% size reduction achieved
                  </p>
                </div>
              </div>
              <button
                onClick={downloadExport}
                disabled={downloading}
                className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                {downloading ? (
                  <>
                    <Loader className="w-5 h-5 animate-spin" />
                    Downloading...
                  </>
                ) : (
                  <>
                    <Download className="w-5 h-5" />
                    Download
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Size Comparison */}
          <div className="bg-gradient-to-r from-yellow-50 to-orange-50 border border-yellow-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <BarChart3 className="w-5 h-5" />
              Size Comparison
            </h3>
            <div className="grid grid-cols-3 gap-6">
              <div>
                <div className="text-xs text-orange-600 font-semibold mb-1">Original Size</div>
                <div className="text-2xl font-bold text-gray-900">
                  {formatBytes(result.originalSize)}
                </div>
              </div>

              <div>
                <div className="text-xs text-orange-600 font-semibold mb-1">
                  Optimized Size
                </div>
                <div className="text-2xl font-bold text-green-600">
                  {formatBytes(result.optimizedSize)}
                </div>
              </div>

              <div>
                <div className="text-xs text-orange-600 font-semibold mb-1">
                  Compression Ratio
                </div>
                <div
                  className={`text-2xl font-bold ${getCompressionColor(
                    result.compressionRatio
                  )}`}
                >
                  {result.compressionRatio.toFixed(1)}%
                </div>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="mt-4">
              <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-green-500 to-green-600 transition-all duration-500"
                  style={{ width: `${100 - result.compressionRatio}%` }}
                ></div>
              </div>
              <div className="flex justify-between text-xs text-gray-600 mt-1">
                <span>Smaller</span>
                <span>
                  Saved: {formatBytes(result.originalSize - result.optimizedSize)}
                </span>
              </div>
            </div>
          </div>

          {/* Optimization Breakdown */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Optimization Breakdown
            </h3>
            <div className="space-y-4">
              {result.optimizations.html && (
                <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <FileText className="w-6 h-6 text-blue-600" />
                    <div>
                      <div className="font-semibold text-gray-900">HTML Minification</div>
                      <div className="text-sm text-gray-600">
                        {formatBytes(result.optimizations.html.before)} →{' '}
                        {formatBytes(result.optimizations.html.after)}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-blue-600">
                      {
                        calculateSavings(
                          result.optimizations.html.before,
                          result.optimizations.html.after
                        ).percent
                      }
                      %
                    </div>
                    <div className="text-xs text-gray-600">saved</div>
                  </div>
                </div>
              )}

              {result.optimizations.css && (
                <div className="flex items-center justify-between p-4 bg-purple-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <FileText className="w-6 h-6 text-purple-600" />
                    <div>
                      <div className="font-semibold text-gray-900">CSS Minification</div>
                      <div className="text-sm text-gray-600">
                        {formatBytes(result.optimizations.css.before)} →{' '}
                        {formatBytes(result.optimizations.css.after)}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-purple-600">
                      {
                        calculateSavings(
                          result.optimizations.css.before,
                          result.optimizations.css.after
                        ).percent
                      }
                      %
                    </div>
                    <div className="text-xs text-gray-600">saved</div>
                  </div>
                </div>
              )}

              {result.optimizations.js && (
                <div className="flex items-center justify-between p-4 bg-yellow-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Code className="w-6 h-6 text-yellow-600" />
                    <div>
                      <div className="font-semibold text-gray-900">JS Minification</div>
                      <div className="text-sm text-gray-600">
                        {formatBytes(result.optimizations.js.before)} →{' '}
                        {formatBytes(result.optimizations.js.after)}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-yellow-600">
                      {
                        calculateSavings(
                          result.optimizations.js.before,
                          result.optimizations.js.after
                        ).percent
                      }
                      %
                    </div>
                    <div className="text-xs text-gray-600">saved</div>
                  </div>
                </div>
              )}

              {result.optimizations.images && result.optimizations.images.count > 0 && (
                <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Image className="w-6 h-6 text-green-600" />
                    <div>
                      <div className="font-semibold text-gray-900">
                        Image Optimization ({result.optimizations.images.count} images)
                      </div>
                      <div className="text-sm text-gray-600">
                        {formatBytes(result.optimizations.images.before)} →{' '}
                        {formatBytes(result.optimizations.images.after)}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-bold text-green-600">
                      {
                        calculateSavings(
                          result.optimizations.images.before,
                          result.optimizations.images.after
                        ).percent
                      }
                      %
                    </div>
                    <div className="text-xs text-gray-600">saved</div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Recommendations */}
          {result.recommendations.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <Lightbulb className="w-5 h-5 text-blue-600" />
                Performance Recommendations
              </h3>
              <ul className="space-y-2">
                {result.recommendations.map((rec, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-gray-700">
                    <TrendingUp className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {!result && !loading && (
        <div className="text-center py-20 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <Zap className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Ready to Optimize
          </h3>
          <p className="text-gray-600 mb-6">
            Configure optimization options and click "Optimize Export" to improve performance
          </p>
        </div>
      )}
    </div>
  );
};
