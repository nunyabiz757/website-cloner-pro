import React, { useState } from 'react';
import {
  RefreshCw,
  ArrowRight,
  CheckCircle,
  AlertCircle,
  Loader,
  Info,
  Settings,
  FileCode,
  Globe,
  ShoppingCart,
  Layout,
  Sparkles,
} from 'lucide-react';

type Platform = 'wordpress' | 'shopify' | 'wix' | 'squarespace' | 'webflow' | 'generic-html';

interface PlatformDetectionResult {
  platform: Platform;
  confidence: number;
  indicators: string[];
}

interface PlatformTransferResult {
  success: boolean;
  sourcePlatform: Platform;
  targetPlatform: Platform;
  convertedHtml: string;
  changes: Array<{
    type: string;
    description: string;
    count: number;
  }>;
  migrationGuide?: string;
}

interface PlatformTransferProps {
  htmlContent: string;
  onTransferComplete?: (result: PlatformTransferResult) => void;
}

export const PlatformTransfer: React.FC<PlatformTransferProps> = ({
  htmlContent,
  onTransferComplete,
}) => {
  const [detectedPlatform, setDetectedPlatform] = useState<PlatformDetectionResult | null>(null);
  const [targetPlatform, setTargetPlatform] = useState<Platform>('generic-html');
  const [transferResult, setTransferResult] = useState<PlatformTransferResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [options, setOptions] = useState({
    removeComments: true,
    removeShortcodes: true,
    preserveCustomCode: true,
    generateMigrationGuide: true,
  });

  const platforms = [
    {
      id: 'wordpress' as const,
      name: 'WordPress',
      description: 'WordPress CMS with plugins',
      icon: <Globe className="w-5 h-5" />,
      color: 'blue',
    },
    {
      id: 'shopify' as const,
      name: 'Shopify',
      description: 'E-commerce platform',
      icon: <ShoppingCart className="w-5 h-5" />,
      color: 'green',
    },
    {
      id: 'wix' as const,
      name: 'Wix',
      description: 'Website builder',
      icon: <Layout className="w-5 h-5" />,
      color: 'purple',
    },
    {
      id: 'squarespace' as const,
      name: 'Squarespace',
      description: 'All-in-one website platform',
      icon: <Sparkles className="w-5 h-5" />,
      color: 'orange',
    },
    {
      id: 'webflow' as const,
      name: 'Webflow',
      description: 'Visual web development',
      icon: <Layout className="w-5 h-5" />,
      color: 'indigo',
    },
    {
      id: 'generic-html' as const,
      name: 'Generic HTML',
      description: 'Clean HTML/CSS/JS',
      icon: <FileCode className="w-5 h-5" />,
      color: 'gray',
    },
  ];

  const detectPlatform = async () => {
    if (!htmlContent) {
      setError('HTML content is required for detection');
      return;
    }

    setDetecting(true);
    setError(null);

    try {
      const response = await fetch('/api/conversion/platform/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ htmlContent }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to detect platform');
      }

      setDetectedPlatform(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Platform detection failed');
    } finally {
      setDetecting(false);
    }
  };

  const transferPlatform = async () => {
    if (!htmlContent) {
      setError('HTML content is required for transfer');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/conversion/platform/transfer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          htmlContent,
          sourcePlatform: detectedPlatform?.platform,
          targetPlatform,
          options,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to transfer platform');
      }

      setTransferResult(data.data);
      onTransferComplete?.(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Platform transfer failed');
    } finally {
      setLoading(false);
    }
  };

  const getColorClasses = (color: string) => {
    const colors: Record<string, any> = {
      blue: {
        border: 'border-blue-200',
        bg: 'bg-blue-50',
        hover: 'hover:border-blue-400',
        selected: 'border-blue-500 bg-blue-100',
        text: 'text-blue-700',
      },
      green: {
        border: 'border-green-200',
        bg: 'bg-green-50',
        hover: 'hover:border-green-400',
        selected: 'border-green-500 bg-green-100',
        text: 'text-green-700',
      },
      purple: {
        border: 'border-purple-200',
        bg: 'bg-purple-50',
        hover: 'hover:border-purple-400',
        selected: 'border-purple-500 bg-purple-100',
        text: 'text-purple-700',
      },
      orange: {
        border: 'border-orange-200',
        bg: 'bg-orange-50',
        hover: 'hover:border-orange-400',
        selected: 'border-orange-500 bg-orange-100',
        text: 'text-orange-700',
      },
      indigo: {
        border: 'border-indigo-200',
        bg: 'bg-indigo-50',
        hover: 'hover:border-indigo-400',
        selected: 'border-indigo-500 bg-indigo-100',
        text: 'text-indigo-700',
      },
      gray: {
        border: 'border-gray-200',
        bg: 'bg-gray-50',
        hover: 'hover:border-gray-400',
        selected: 'border-gray-500 bg-gray-100',
        text: 'text-gray-700',
      },
    };
    return colors[color];
  };

  const getPlatformInfo = (platformId: Platform) => {
    return platforms.find((p) => p.id === platformId);
  };

  return (
    <div className="max-w-6xl mx-auto bg-white rounded-lg shadow-lg p-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-indigo-100 rounded-lg">
          <RefreshCw className="w-6 h-6 text-indigo-600" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Platform Transfer</h2>
          <p className="text-gray-600">Migrate your website between different platforms</p>
        </div>
      </div>

      {/* Platform Detection */}
      <div className="mb-8 bg-gray-50 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Step 1: Detect Source Platform</h3>

        {!detectedPlatform ? (
          <button
            onClick={detectPlatform}
            disabled={detecting}
            className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {detecting ? (
              <>
                <Loader className="w-5 h-5 animate-spin" />
                Detecting Platform...
              </>
            ) : (
              <>
                <RefreshCw className="w-5 h-5" />
                Detect Platform
              </>
            )}
          </button>
        ) : (
          <div className="flex items-start gap-4">
            <div className={`p-4 rounded-lg ${getColorClasses(getPlatformInfo(detectedPlatform.platform)?.color || 'gray').bg} flex-1`}>
              <div className="flex items-center gap-3 mb-3">
                <CheckCircle className="w-6 h-6 text-green-600" />
                <div>
                  <h4 className="font-semibold text-gray-900">
                    Detected: {getPlatformInfo(detectedPlatform.platform)?.name}
                  </h4>
                  <p className="text-sm text-gray-600">
                    Confidence: {detectedPlatform.confidence}%
                  </p>
                </div>
              </div>

              {detectedPlatform.indicators.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-medium text-gray-700 mb-2">Detection Indicators:</p>
                  <ul className="text-xs text-gray-600 space-y-1">
                    {detectedPlatform.indicators.slice(0, 5).map((indicator, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <span className="w-1 h-1 bg-gray-400 rounded-full"></span>
                        {indicator}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <button
              onClick={() => setDetectedPlatform(null)}
              className="text-sm text-gray-600 hover:text-gray-900 underline"
            >
              Re-detect
            </button>
          </div>
        )}
      </div>

      {/* Target Platform Selection */}
      {detectedPlatform && (
        <div className="mb-8">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Step 2: Select Target Platform
          </h3>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {platforms.map((platform) => {
              const colors = getColorClasses(platform.color);
              const isSelected = targetPlatform === platform.id;
              const isSameAsSour = platform.id === detectedPlatform.platform;

              return (
                <button
                  key={platform.id}
                  onClick={() => setTargetPlatform(platform.id)}
                  disabled={isSameAsSour || loading}
                  className={`p-4 border-2 rounded-lg text-left transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                    isSelected
                      ? `${colors.selected} shadow-md`
                      : `${colors.border} ${colors.hover}`
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`p-2 rounded ${colors.bg}`}>{platform.icon}</div>
                    <div className="flex-1">
                      <h4 className="font-semibold text-gray-900 text-sm">{platform.name}</h4>
                      <p className="text-xs text-gray-600 mt-1">{platform.description}</p>
                      {isSameAsSour && (
                        <p className="text-xs text-orange-600 mt-1">(Current)</p>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Transfer Options */}
      {detectedPlatform && (
        <div className="mb-8">
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors mb-3"
          >
            <Settings className="w-4 h-4" />
            Transfer Options
            <span className="text-xs text-gray-500">
              {showAdvanced ? '(hide)' : '(show)'}
            </span>
          </button>

          {showAdvanced && (
            <div className="space-y-3 p-4 bg-gray-50 rounded-lg">
              <label className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={options.removeComments}
                  onChange={(e) => setOptions({ ...options, removeComments: e.target.checked })}
                  disabled={loading}
                  className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 disabled:opacity-50"
                />
                <span className="text-gray-700">Remove platform-specific comments</span>
              </label>

              <label className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={options.removeShortcodes}
                  onChange={(e) => setOptions({ ...options, removeShortcodes: e.target.checked })}
                  disabled={loading}
                  className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 disabled:opacity-50"
                />
                <span className="text-gray-700">Remove shortcodes and platform tags</span>
              </label>

              <label className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={options.preserveCustomCode}
                  onChange={(e) => setOptions({ ...options, preserveCustomCode: e.target.checked })}
                  disabled={loading}
                  className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 disabled:opacity-50"
                />
                <span className="text-gray-700">Preserve custom code and scripts</span>
              </label>

              <label className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={options.generateMigrationGuide}
                  onChange={(e) =>
                    setOptions({ ...options, generateMigrationGuide: e.target.checked })
                  }
                  disabled={loading}
                  className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 disabled:opacity-50"
                />
                <span className="text-gray-700">Generate migration guide</span>
              </label>
            </div>
          )}
        </div>
      )}

      {/* Transfer Button */}
      {detectedPlatform && !transferResult && (
        <div className="flex items-center justify-center gap-4 mb-8">
          <div className={`px-4 py-2 rounded-lg ${getColorClasses(getPlatformInfo(detectedPlatform.platform)?.color || 'gray').bg}`}>
            <span className="font-semibold">{getPlatformInfo(detectedPlatform.platform)?.name}</span>
          </div>

          <ArrowRight className="w-6 h-6 text-gray-400" />

          <div className={`px-4 py-2 rounded-lg ${getColorClasses(getPlatformInfo(targetPlatform)?.color || 'gray').bg}`}>
            <span className="font-semibold">{getPlatformInfo(targetPlatform)?.name}</span>
          </div>
        </div>
      )}

      {detectedPlatform && !transferResult && (
        <button
          onClick={transferPlatform}
          disabled={loading || targetPlatform === detectedPlatform.platform}
          className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <Loader className="w-5 h-5 animate-spin" />
              Transferring Platform...
            </>
          ) : (
            <>
              <RefreshCw className="w-5 h-5" />
              Start Platform Transfer
            </>
          )}
        </button>
      )}

      {/* Error Display */}
      {error && (
        <div className="mt-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-semibold text-red-900 mb-1">Error</h4>
              <p className="text-sm text-red-800">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Transfer Results */}
      {transferResult && (
        <div className="mt-6 bg-green-50 border border-green-200 rounded-lg p-6">
          <div className="flex items-center gap-2 mb-4">
            <CheckCircle className="w-6 h-6 text-green-600" />
            <h3 className="font-semibold text-green-900 text-lg">Transfer Successful!</h3>
          </div>

          <div className="space-y-4">
            {/* Changes Summary */}
            <div>
              <h4 className="font-medium text-gray-900 mb-2">Changes Applied:</h4>
              <div className="space-y-2">
                {transferResult.changes.map((change, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm">
                    <CheckCircle className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <span className="font-medium">{change.type}:</span>{' '}
                      <span className="text-gray-700">{change.description}</span>
                      {change.count > 0 && (
                        <span className="ml-2 px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">
                          {change.count} changes
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Migration Guide */}
            {transferResult.migrationGuide && (
              <div className="bg-white border border-green-200 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
                  <Info className="w-4 h-4" />
                  Migration Guide
                </h4>
                <div className="text-xs text-gray-700 whitespace-pre-wrap max-h-64 overflow-y-auto">
                  {transferResult.migrationGuide}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => {
                  const blob = new Blob([transferResult.convertedHtml], { type: 'text/html' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `${transferResult.targetPlatform}-converted.html`;
                  document.body.appendChild(a);
                  a.click();
                  URL.revokeObjectURL(url);
                  document.body.removeChild(a);
                }}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
              >
                <FileCode className="w-4 h-4" />
                Download Converted HTML
              </button>

              <button
                onClick={() => {
                  setTransferResult(null);
                  setDetectedPlatform(null);
                  setError(null);
                }}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
              >
                Start New Transfer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Info Box */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="text-sm font-medium text-blue-900 mb-2 flex items-center gap-2">
          <Info className="w-4 h-4" />
          About Platform Transfer
        </h4>
        <ul className="text-xs text-blue-800 space-y-1 list-disc list-inside">
          <li>Automatically detects source platform with high accuracy</li>
          <li>Removes platform-specific code and dependencies</li>
          <li>Converts HTML structure to target platform conventions</li>
          <li>Provides detailed migration guide with manual steps</li>
          <li>Preserves custom code and styling where possible</li>
        </ul>
      </div>
    </div>
  );
};
