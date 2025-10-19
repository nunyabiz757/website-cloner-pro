import React, { useState } from 'react';
import { Eye, Loader2, CheckCircle, XCircle, Play, RefreshCw } from 'lucide-react';

interface ComparisonResult {
  id: string;
  originalUrl: string;
  optimizedUrl: string;
  originalScreenshot: string;
  optimizedScreenshot: string;
  diffScreenshot: string;
  diffPercentage: number;
  pixelsDifferent: number;
  totalPixels: number;
  viewport: { width: number; height: number };
  timestamp: string;
  passed: boolean;
  threshold: number;
}

interface VisualComparisonProps {
  originalUrl: string;
  optimizedUrl: string;
  testName?: string;
}

export const VisualComparison: React.FC<VisualComparisonProps> = ({
  originalUrl,
  optimizedUrl,
  testName,
}) => {
  const [results, setResults] = useState<ComparisonResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<'pending' | 'running' | 'completed' | 'failed'>('pending');
  const [selectedView, setSelectedView] = useState<'side-by-side' | 'overlay' | 'diff'>('side-by-side');
  const [selectedResult, setSelectedResult] = useState<number>(0);

  const startTest = async () => {
    setLoading(true);
    setError(null);
    setStatus('running');

    try {
      const response = await fetch('/api/visual-regression/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          originalUrl,
          optimizedUrl,
          testName: testName || 'Visual Regression Test',
          viewports: [
            { width: 1920, height: 1080, name: 'Desktop' },
            { width: 768, height: 1024, name: 'Tablet' },
            { width: 375, height: 667, name: 'Mobile' },
          ],
          threshold: 5,
        }),
      });

      const data = await response.json();

      if (data.success) {
        pollTestStatus(data.data.testId);
      } else {
        setError(data.error || 'Failed to start test');
        setStatus('failed');
        setLoading(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start test');
      setStatus('failed');
      setLoading(false);
    }
  };

  const pollTestStatus = async (id: string) => {
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/visual-regression/test/${id}`);
        const data = await response.json();

        if (data.success) {
          const test = data.data;
          setStatus(test.status);

          if (test.status === 'completed') {
            setResults(test.results);
            setLoading(false);
            clearInterval(interval);
          } else if (test.status === 'failed') {
            setError('Test failed to complete');
            setLoading(false);
            clearInterval(interval);
          }
        }
      } catch (err) {
        console.error('Error polling test status:', err);
      }
    }, 2000);

    // Clear interval after 5 minutes
    setTimeout(() => clearInterval(interval), 300000);
  };

  const getScreenshotUrl = (filename: string) => {
    return `/api/visual-regression/screenshot/${filename.split('/').pop()}`;
  };

  const passedTests = results.filter((r) => r.passed).length;
  const failedTests = results.length - passedTests;

  if (loading || status === 'running') {
    return (
      <div className="card">
        <div className="flex flex-col items-center justify-center py-12">
          <Loader2 className="w-16 h-16 animate-spin text-blue-600 mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">Running Visual Regression Test</h3>
          <p className="text-gray-600">Capturing and comparing screenshots across multiple viewports...</p>
          <div className="mt-4 text-sm text-gray-500">
            This may take a few minutes depending on page complexity
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <div className="flex items-start gap-3">
            <XCircle className="w-6 h-6 text-red-600 flex-shrink-0" />
            <div className="flex-1">
              <h3 className="font-semibold text-red-900 mb-2">Test Failed</h3>
              <p className="text-red-700">{error}</p>
              <button onClick={startTest} className="mt-4 btn-secondary flex items-center gap-2">
                <RefreshCw className="w-4 h-4" />
                Try Again
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Eye className="w-6 h-6 text-blue-600" />
              Visual Regression Testing
            </h2>
            <p className="text-gray-600 mt-1">Compare original and optimized versions pixel-by-pixel</p>
          </div>
          {results.length === 0 && (
            <button onClick={startTest} disabled={loading} className="btn-primary flex items-center gap-2">
              <Play className="w-5 h-5" />
              Start Visual Test
            </button>
          )}
        </div>

        {/* Summary Stats */}
        {results.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="p-4 bg-blue-50 rounded-lg">
              <div className="text-sm text-gray-600 mb-1">Total Tests</div>
              <div className="text-3xl font-bold text-blue-600">{results.length}</div>
            </div>
            <div className="p-4 bg-green-50 rounded-lg">
              <div className="text-sm text-gray-600 mb-1">Passed</div>
              <div className="text-3xl font-bold text-green-600 flex items-center gap-2">
                {passedTests}
                <CheckCircle className="w-6 h-6" />
              </div>
            </div>
            <div className="p-4 bg-red-50 rounded-lg">
              <div className="text-sm text-gray-600 mb-1">Failed</div>
              <div className="text-3xl font-bold text-red-600 flex items-center gap-2">
                {failedTests}
                <XCircle className="w-6 h-6" />
              </div>
            </div>
            <div className="p-4 bg-purple-50 rounded-lg">
              <div className="text-sm text-gray-600 mb-1">Avg Difference</div>
              <div className="text-3xl font-bold text-purple-600">
                {(results.reduce((sum, r) => sum + r.diffPercentage, 0) / results.length).toFixed(2)}%
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Results */}
      {results.length > 0 && (
        <>
          {/* Viewport Selector */}
          <div className="card">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-sm font-medium text-gray-700">Select Viewport:</span>
              {results.map((result, idx) => (
                <button
                  key={idx}
                  onClick={() => setSelectedResult(idx)}
                  className={`px-4 py-2 rounded-lg border transition-colors ${
                    selectedResult === idx
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
                  }`}
                >
                  {result.viewport.width}x{result.viewport.height}
                </button>
              ))}
            </div>

            {/* View Mode Selector */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-gray-700">View Mode:</span>
              <button
                onClick={() => setSelectedView('side-by-side')}
                className={`px-4 py-2 rounded-lg border transition-colors ${
                  selectedView === 'side-by-side'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
                }`}
              >
                Side by Side
              </button>
              <button
                onClick={() => setSelectedView('diff')}
                className={`px-4 py-2 rounded-lg border transition-colors ${
                  selectedView === 'diff'
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
                }`}
              >
                Difference Only
              </button>
            </div>
          </div>

          {/* Current Result Details */}
          {results[selectedResult] && (
            <div className="card">
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-lg font-semibold text-gray-900">
                    {results[selectedResult].viewport.width}x{results[selectedResult].viewport.height} Viewport
                  </h3>
                  <span
                    className={`px-3 py-1 rounded-full text-sm font-medium ${
                      results[selectedResult].passed
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {results[selectedResult].passed ? '✓ PASSED' : '✗ FAILED'}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600">Difference: </span>
                    <span className="font-bold text-gray-900">
                      {results[selectedResult].diffPercentage.toFixed(2)}%
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">Pixels Different: </span>
                    <span className="font-bold text-gray-900">
                      {results[selectedResult].pixelsDifferent.toLocaleString()}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-600">Threshold: </span>
                    <span className="font-bold text-gray-900">{results[selectedResult].threshold}%</span>
                  </div>
                </div>
              </div>

              {/* Image Comparison */}
              {selectedView === 'side-by-side' ? (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="bg-red-100 text-red-800 text-center py-2 rounded-t-lg font-medium">
                      Original
                    </div>
                    <img
                      src={getScreenshotUrl(results[selectedResult].originalScreenshot)}
                      alt="Original"
                      className="w-full border border-gray-300 rounded-b-lg"
                    />
                  </div>
                  <div>
                    <div className="bg-green-100 text-green-800 text-center py-2 rounded-t-lg font-medium">
                      Optimized
                    </div>
                    <img
                      src={getScreenshotUrl(results[selectedResult].optimizedScreenshot)}
                      alt="Optimized"
                      className="w-full border border-gray-300 rounded-b-lg"
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <div className="bg-yellow-100 text-yellow-800 text-center py-2 rounded-t-lg font-medium">
                    Difference Highlighted
                  </div>
                  <img
                    src={getScreenshotUrl(results[selectedResult].diffScreenshot)}
                    alt="Difference"
                    className="w-full border border-gray-300 rounded-b-lg"
                  />
                  <p className="text-sm text-gray-600 mt-2 text-center">
                    Red pixels indicate visual differences between versions
                  </p>
                </div>
              )}
            </div>
          )}

          {/* All Results Summary */}
          <div className="card">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">All Test Results</h3>
            <div className="space-y-3">
              {results.map((result, idx) => (
                <div
                  key={idx}
                  onClick={() => setSelectedResult(idx)}
                  className={`p-4 rounded-lg border cursor-pointer transition-all ${
                    selectedResult === idx
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-blue-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {result.passed ? (
                        <CheckCircle className="w-5 h-5 text-green-600" />
                      ) : (
                        <XCircle className="w-5 h-5 text-red-600" />
                      )}
                      <div>
                        <div className="font-medium text-gray-900">
                          {result.viewport.width}x{result.viewport.height}
                        </div>
                        <div className="text-sm text-gray-600">
                          {result.diffPercentage.toFixed(2)}% difference
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div
                        className={`text-sm font-medium ${result.passed ? 'text-green-600' : 'text-red-600'}`}
                      >
                        {result.passed ? 'Passed' : 'Failed'}
                      </div>
                      <div className="text-xs text-gray-500">
                        {result.pixelsDifferent.toLocaleString()} px diff
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
