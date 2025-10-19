import React, { useState } from 'react';
import {
  GitCompare,
  Loader,
  AlertCircle,
  CheckCircle,
  TrendingUp,
  TrendingDown,
  Minus,
  Download,
  Eye,
  Layers,
} from 'lucide-react';

interface BeforeAfterComparisonProps {
  originalUrl: string;
  clonedUrl: string;
}

interface ComparisonResult {
  similarity: number;
  differenceCount: number;
  totalPixels: number;
  diffImageBase64?: string;
  sideBySideBase64?: string;
  metrics: {
    original: PageMetrics;
    cloned: PageMetrics;
  };
  visualDifferences: VisualDifference[];
}

interface PageMetrics {
  loadTime: number;
  domContentLoaded: number;
  resourceCount: number;
  totalSize: number;
  screenshotBase64: string;
}

interface VisualDifference {
  type: 'color' | 'layout' | 'missing' | 'added';
  description: string;
  severity: 'high' | 'medium' | 'low';
}

export const BeforeAfterComparison: React.FC<BeforeAfterComparisonProps> = ({
  originalUrl,
  clonedUrl,
}) => {
  const [comparisonResult, setComparisonResult] = useState<ComparisonResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'side-by-side' | 'diff' | 'slider'>('side-by-side');
  const [sliderPosition, setSliderPosition] = useState(50);

  const runComparison = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/preview/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originalUrl,
          clonedUrl,
          options: {
            fullPage: false,
            threshold: 0.1,
            includeMetrics: true,
            includeVisualAnalysis: true,
          },
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Comparison failed');
      }

      setComparisonResult(data.result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Comparison failed');
    } finally {
      setLoading(false);
    }
  };

  const getSimilarityGrade = (similarity: number) => {
    if (similarity >= 95) return { grade: 'Excellent', color: 'green' };
    if (similarity >= 85) return { grade: 'Good', color: 'blue' };
    if (similarity >= 70) return { grade: 'Fair', color: 'yellow' };
    return { grade: 'Poor', color: 'red' };
  };

  const getMetricDiff = (original: number, cloned: number) => {
    const diff = cloned - original;
    const percentDiff = ((diff / original) * 100).toFixed(1);
    return { diff, percentDiff };
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high':
        return 'bg-red-100 text-red-800 border-red-300';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'low':
        return 'bg-green-100 text-green-800 border-green-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const downloadImage = (base64: string, filename: string) => {
    const link = document.createElement('a');
    link.href = base64;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="max-w-7xl mx-auto bg-white rounded-lg shadow-lg p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Before/After Comparison</h2>
          <p className="text-gray-600">Compare original site with cloned version</p>
        </div>

        <button
          onClick={runComparison}
          disabled={loading}
          className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <Loader className="w-5 h-5 animate-spin" />
              Comparing...
            </>
          ) : (
            <>
              <GitCompare className="w-5 h-5" />
              Run Comparison
            </>
          )}
        </button>
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

      {comparisonResult && (
        <div className="space-y-6">
          {/* Similarity Score */}
          <div className={`bg-gradient-to-r from-${getSimilarityGrade(comparisonResult.similarity).color}-50 to-${getSimilarityGrade(comparisonResult.similarity).color}-100 border border-${getSimilarityGrade(comparisonResult.similarity).color}-200 rounded-lg p-6`}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Visual Similarity</h3>
                <div className="flex items-baseline gap-2">
                  <span className="text-5xl font-bold text-gray-900">
                    {comparisonResult.similarity.toFixed(2)}%
                  </span>
                  <span className={`text-lg font-semibold text-${getSimilarityGrade(comparisonResult.similarity).color}-700`}>
                    {getSimilarityGrade(comparisonResult.similarity).grade}
                  </span>
                </div>
                <p className="text-sm text-gray-600 mt-2">
                  {comparisonResult.differenceCount.toLocaleString()} different pixels out of{' '}
                  {comparisonResult.totalPixels.toLocaleString()}
                </p>
              </div>
              <div className="text-right">
                <CheckCircle className={`w-16 h-16 text-${getSimilarityGrade(comparisonResult.similarity).color}-600`} />
              </div>
            </div>
          </div>

          {/* Performance Comparison */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Performance Metrics</h3>
            <div className="grid grid-cols-3 gap-6">
              {/* Load Time */}
              <div>
                <div className="text-sm text-gray-600 mb-2">Load Time</div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">Original:</span>
                    <span className="font-semibold">{comparisonResult.metrics.original.loadTime}ms</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">Cloned:</span>
                    <span className="font-semibold">{comparisonResult.metrics.cloned.loadTime}ms</span>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t">
                    <span className="text-xs text-gray-500">Difference:</span>
                    <div className="flex items-center gap-1">
                      {comparisonResult.metrics.cloned.loadTime < comparisonResult.metrics.original.loadTime ? (
                        <TrendingDown className="w-4 h-4 text-green-600" />
                      ) : (
                        <TrendingUp className="w-4 h-4 text-red-600" />
                      )}
                      <span className={`text-sm font-bold ${comparisonResult.metrics.cloned.loadTime < comparisonResult.metrics.original.loadTime ? 'text-green-600' : 'text-red-600'}`}>
                        {getMetricDiff(comparisonResult.metrics.original.loadTime, comparisonResult.metrics.cloned.loadTime).percentDiff}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Resource Count */}
              <div>
                <div className="text-sm text-gray-600 mb-2">Resources</div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">Original:</span>
                    <span className="font-semibold">{comparisonResult.metrics.original.resourceCount}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">Cloned:</span>
                    <span className="font-semibold">{comparisonResult.metrics.cloned.resourceCount}</span>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t">
                    <span className="text-xs text-gray-500">Difference:</span>
                    <span className="text-sm font-bold text-gray-900">
                      {comparisonResult.metrics.cloned.resourceCount - comparisonResult.metrics.original.resourceCount}
                    </span>
                  </div>
                </div>
              </div>

              {/* Total Size */}
              <div>
                <div className="text-sm text-gray-600 mb-2">Total Size</div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">Original:</span>
                    <span className="font-semibold">{formatBytes(comparisonResult.metrics.original.totalSize)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-500">Cloned:</span>
                    <span className="font-semibold">{formatBytes(comparisonResult.metrics.cloned.totalSize)}</span>
                  </div>
                  <div className="flex items-center justify-between pt-2 border-t">
                    <span className="text-xs text-gray-500">Difference:</span>
                    <div className="flex items-center gap-1">
                      {comparisonResult.metrics.cloned.totalSize < comparisonResult.metrics.original.totalSize ? (
                        <TrendingDown className="w-4 h-4 text-green-600" />
                      ) : (
                        <TrendingUp className="w-4 h-4 text-red-600" />
                      )}
                      <span className={`text-sm font-bold ${comparisonResult.metrics.cloned.totalSize < comparisonResult.metrics.original.totalSize ? 'text-green-600' : 'text-red-600'}`}>
                        {getMetricDiff(comparisonResult.metrics.original.totalSize, comparisonResult.metrics.cloned.totalSize).percentDiff}%
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* View Mode Selector */}
          <div className="flex items-center gap-2 bg-gray-100 p-2 rounded-lg">
            <button
              onClick={() => setViewMode('side-by-side')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                viewMode === 'side-by-side' ? 'bg-white text-indigo-600 shadow' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Layers className="w-4 h-4" />
              Side by Side
            </button>
            <button
              onClick={() => setViewMode('diff')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                viewMode === 'diff' ? 'bg-white text-indigo-600 shadow' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <GitCompare className="w-4 h-4" />
              Difference
            </button>
            <button
              onClick={() => setViewMode('slider')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                viewMode === 'slider' ? 'bg-white text-indigo-600 shadow' : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Eye className="w-4 h-4" />
              Slider
            </button>

            <div className="ml-auto flex gap-2">
              {comparisonResult.sideBySideBase64 && (
                <button
                  onClick={() => downloadImage(comparisonResult.sideBySideBase64!, 'comparison-side-by-side.png')}
                  className="flex items-center gap-2 px-3 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors text-sm"
                >
                  <Download className="w-4 h-4" />
                  Download
                </button>
              )}
            </div>
          </div>

          {/* Visual Comparison */}
          <div className="border-4 border-gray-200 rounded-lg overflow-hidden shadow-xl">
            {viewMode === 'side-by-side' && comparisonResult.sideBySideBase64 && (
              <img
                src={comparisonResult.sideBySideBase64}
                alt="Side by side comparison"
                className="w-full h-auto"
              />
            )}

            {viewMode === 'diff' && comparisonResult.diffImageBase64 && (
              <div>
                <div className="bg-gray-800 text-white text-center py-2 text-sm font-medium">
                  Visual Differences (Red areas show differences)
                </div>
                <img
                  src={comparisonResult.diffImageBase64}
                  alt="Difference map"
                  className="w-full h-auto"
                />
              </div>
            )}

            {viewMode === 'slider' && (
              <div className="relative">
                <div className="relative overflow-hidden" style={{ height: '600px' }}>
                  <img
                    src={comparisonResult.metrics.original.screenshotBase64.startsWith('data:')
                      ? comparisonResult.metrics.original.screenshotBase64
                      : `data:image/png;base64,${comparisonResult.metrics.original.screenshotBase64}`}
                    alt="Original"
                    className="absolute top-0 left-0 w-full h-full object-cover"
                  />
                  <div
                    className="absolute top-0 left-0 h-full overflow-hidden"
                    style={{ width: `${sliderPosition}%` }}
                  >
                    <img
                      src={comparisonResult.metrics.cloned.screenshotBase64.startsWith('data:')
                        ? comparisonResult.metrics.cloned.screenshotBase64
                        : `data:image/png;base64,${comparisonResult.metrics.cloned.screenshotBase64}`}
                      alt="Cloned"
                      className="w-full h-full object-cover"
                      style={{ width: `${(100 / sliderPosition) * 100}%` }}
                    />
                  </div>
                  <div
                    className="absolute top-0 bottom-0 w-1 bg-white shadow-lg cursor-ew-resize"
                    style={{ left: `${sliderPosition}%` }}
                  >
                    <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-white rounded-full p-2 shadow-lg">
                      <Minus className="w-4 h-4 text-gray-700 rotate-90" />
                    </div>
                  </div>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={sliderPosition}
                  onChange={(e) => setSliderPosition(Number(e.target.value))}
                  className="w-full mt-4"
                />
                <div className="flex justify-between text-sm text-gray-600 mt-2">
                  <span>Original</span>
                  <span>Cloned</span>
                </div>
              </div>
            )}
          </div>

          {/* Visual Differences */}
          {comparisonResult.visualDifferences && comparisonResult.visualDifferences.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Visual Differences ({comparisonResult.visualDifferences.length})
              </h3>
              <div className="space-y-2">
                {comparisonResult.visualDifferences.map((diff, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-lg border-l-4 ${getSeverityColor(diff.severity)}`}
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="text-xs font-bold uppercase">{diff.severity}</span>
                        <span className="text-xs text-gray-500 ml-2">• {diff.type}</span>
                      </div>
                    </div>
                    <p className="text-sm text-gray-700 mt-1">{diff.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {comparisonResult.visualDifferences && comparisonResult.visualDifferences.length === 0 && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-6">
              <div className="flex items-center gap-2 text-green-800">
                <CheckCircle className="w-5 h-5" />
                <span className="font-semibold">Perfect Clone!</span>
              </div>
              <p className="text-green-700 mt-1 text-sm">
                No significant visual differences detected between original and cloned version.
              </p>
            </div>
          )}
        </div>
      )}

      {!comparisonResult && !loading && (
        <div className="text-center py-20 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <GitCompare className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Comparison Yet</h3>
          <p className="text-gray-600 mb-6">
            Click "Run Comparison" to compare the original and cloned versions
          </p>
        </div>
      )}
    </div>
  );
};
