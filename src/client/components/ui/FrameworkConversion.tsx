import React, { useState } from 'react';
import {
  Code2,
  ArrowRight,
  CheckCircle,
  AlertCircle,
  Loader,
  Info,
  Settings,
  FileCode,
  Download,
  Eye,
} from 'lucide-react';

type Framework = 'react' | 'vue' | 'angular' | 'svelte' | 'vanilla';

interface DetectedFramework {
  framework: Framework;
  confidence: number;
  features: string[];
  version?: string;
}

interface FrameworkConversionResult {
  success: boolean;
  sourceFramework: Framework;
  targetFramework: Framework;
  convertedCode: string;
  convertedHtml?: string;
  configFiles?: Array<{
    filename: string;
    content: string;
  }>;
  statistics: {
    componentsConverted: number;
    hooksConverted: number;
    linesOfCode: number;
  };
  warnings: string[];
}

interface FrameworkConversionProps {
  code: string;
  htmlContent?: string;
  onConversionComplete?: (result: FrameworkConversionResult) => void;
}

export const FrameworkConversion: React.FC<FrameworkConversionProps> = ({
  code,
  htmlContent,
  onConversionComplete,
}) => {
  const [detectedFramework, setDetectedFramework] = useState<DetectedFramework | null>(null);
  const [targetFramework, setTargetFramework] = useState<Framework>('vanilla');
  const [conversionResult, setConversionResult] = useState<FrameworkConversionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<'code' | 'html' | 'config'>('code');

  const [options, setOptions] = useState({
    typescript: false,
    preserveComments: true,
    generateConfigFiles: true,
  });

  const frameworks = [
    {
      id: 'react' as const,
      name: 'React',
      description: 'Component-based UI library',
      icon: '⚛️',
      color: 'blue',
    },
    {
      id: 'vue' as const,
      name: 'Vue',
      description: 'Progressive framework',
      icon: '🖖',
      color: 'green',
    },
    {
      id: 'angular' as const,
      name: 'Angular',
      description: 'Full-featured framework',
      icon: '🅰️',
      color: 'red',
    },
    {
      id: 'svelte' as const,
      name: 'Svelte',
      description: 'Compiler-based framework',
      icon: '🔥',
      color: 'orange',
    },
    {
      id: 'vanilla' as const,
      name: 'Vanilla JS',
      description: 'Pure JavaScript',
      icon: '📜',
      color: 'yellow',
    },
  ];

  const detectFramework = async () => {
    if (!code) {
      setError('Code is required for detection');
      return;
    }

    setDetecting(true);
    setError(null);

    try {
      const response = await fetch('/api/conversion/framework/detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to detect framework');
      }

      setDetectedFramework(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Framework detection failed');
    } finally {
      setDetecting(false);
    }
  };

  const convertFramework = async () => {
    if (!code) {
      setError('Code is required for conversion');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/conversion/framework/convert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          htmlContent,
          sourceFramework: detectedFramework?.framework,
          targetFramework,
          options,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to convert framework');
      }

      setConversionResult(data.data);
      onConversionComplete?.(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Framework conversion failed');
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
      red: {
        border: 'border-red-200',
        bg: 'bg-red-50',
        hover: 'hover:border-red-400',
        selected: 'border-red-500 bg-red-100',
        text: 'text-red-700',
      },
      orange: {
        border: 'border-orange-200',
        bg: 'bg-orange-50',
        hover: 'hover:border-orange-400',
        selected: 'border-orange-500 bg-orange-100',
        text: 'text-orange-700',
      },
      yellow: {
        border: 'border-yellow-200',
        bg: 'bg-yellow-50',
        hover: 'hover:border-yellow-400',
        selected: 'border-yellow-500 bg-yellow-100',
        text: 'text-yellow-700',
      },
    };
    return colors[color] || colors.blue;
  };

  const getFrameworkInfo = (frameworkId: Framework) => {
    return frameworks.find((f) => f.id === frameworkId);
  };

  const downloadFile = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  const downloadAllFiles = () => {
    if (!conversionResult) return;

    // Download main code file
    const ext = options.typescript ? 'ts' : 'js';
    downloadFile(
      conversionResult.convertedCode,
      `converted.${targetFramework}.${ext}`
    );

    // Download HTML if present
    if (conversionResult.convertedHtml) {
      downloadFile(conversionResult.convertedHtml, `converted.html`);
    }

    // Download config files
    if (conversionResult.configFiles) {
      conversionResult.configFiles.forEach((file) => {
        downloadFile(file.content, file.filename);
      });
    }
  };

  return (
    <div className="max-w-6xl mx-auto bg-white rounded-lg shadow-lg p-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-purple-100 rounded-lg">
          <Code2 className="w-6 h-6 text-purple-600" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Framework Conversion</h2>
          <p className="text-gray-600">Convert code between JavaScript frameworks</p>
        </div>
      </div>

      {/* Framework Detection */}
      <div className="mb-8 bg-gray-50 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Step 1: Detect Source Framework
        </h3>

        {!detectedFramework ? (
          <button
            onClick={detectFramework}
            disabled={detecting}
            className="flex items-center gap-2 px-6 py-3 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {detecting ? (
              <>
                <Loader className="w-5 h-5 animate-spin" />
                Detecting Framework...
              </>
            ) : (
              <>
                <Code2 className="w-5 h-5" />
                Detect Framework
              </>
            )}
          </button>
        ) : (
          <div className="flex items-start gap-4">
            <div
              className={`p-4 rounded-lg ${
                getColorClasses(getFrameworkInfo(detectedFramework.framework)?.color || 'blue').bg
              } flex-1`}
            >
              <div className="flex items-center gap-3 mb-3">
                <CheckCircle className="w-6 h-6 text-green-600" />
                <div>
                  <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                    <span className="text-2xl">
                      {getFrameworkInfo(detectedFramework.framework)?.icon}
                    </span>
                    Detected: {getFrameworkInfo(detectedFramework.framework)?.name}
                    {detectedFramework.version && (
                      <span className="text-sm text-gray-600">v{detectedFramework.version}</span>
                    )}
                  </h4>
                  <p className="text-sm text-gray-600">
                    Confidence: {detectedFramework.confidence}%
                  </p>
                </div>
              </div>

              {detectedFramework.features.length > 0 && (
                <div className="mt-3">
                  <p className="text-xs font-medium text-gray-700 mb-2">Detected Features:</p>
                  <div className="flex flex-wrap gap-2">
                    {detectedFramework.features.map((feature, i) => (
                      <span
                        key={i}
                        className="px-2 py-1 bg-white bg-opacity-60 text-gray-700 rounded text-xs"
                      >
                        {feature}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={() => setDetectedFramework(null)}
              className="text-sm text-gray-600 hover:text-gray-900 underline"
            >
              Re-detect
            </button>
          </div>
        )}
      </div>

      {/* Target Framework Selection */}
      {detectedFramework && (
        <div className="mb-8">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Step 2: Select Target Framework
          </h3>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {frameworks.map((framework) => {
              const colors = getColorClasses(framework.color);
              const isSelected = targetFramework === framework.id;
              const isSameAsSource = framework.id === detectedFramework.framework;

              return (
                <button
                  key={framework.id}
                  onClick={() => setTargetFramework(framework.id)}
                  disabled={isSameAsSource || loading}
                  className={`p-4 border-2 rounded-lg text-center transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                    isSelected ? `${colors.selected} shadow-md` : `${colors.border} ${colors.hover}`
                  }`}
                >
                  <div className="text-3xl mb-2">{framework.icon}</div>
                  <h4 className="font-semibold text-gray-900 text-sm">{framework.name}</h4>
                  <p className="text-xs text-gray-600 mt-1">{framework.description}</p>
                  {isSameAsSource && <p className="text-xs text-orange-600 mt-1">(Current)</p>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Conversion Options */}
      {detectedFramework && (
        <div className="mb-8">
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors mb-3"
          >
            <Settings className="w-4 h-4" />
            Conversion Options
            <span className="text-xs text-gray-500">{showAdvanced ? '(hide)' : '(show)'}</span>
          </button>

          {showAdvanced && (
            <div className="space-y-3 p-4 bg-gray-50 rounded-lg">
              <label className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={options.typescript}
                  onChange={(e) => setOptions({ ...options, typescript: e.target.checked })}
                  disabled={loading}
                  className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500 disabled:opacity-50"
                />
                <span className="text-gray-700">Use TypeScript</span>
              </label>

              <label className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={options.preserveComments}
                  onChange={(e) => setOptions({ ...options, preserveComments: e.target.checked })}
                  disabled={loading}
                  className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500 disabled:opacity-50"
                />
                <span className="text-gray-700">Preserve code comments</span>
              </label>

              <label className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={options.generateConfigFiles}
                  onChange={(e) =>
                    setOptions({ ...options, generateConfigFiles: e.target.checked })
                  }
                  disabled={loading}
                  className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500 disabled:opacity-50"
                />
                <span className="text-gray-700">Generate config files (package.json, etc.)</span>
              </label>
            </div>
          )}
        </div>
      )}

      {/* Conversion Flow Visualization */}
      {detectedFramework && !conversionResult && (
        <div className="flex items-center justify-center gap-4 mb-8">
          <div
            className={`px-4 py-2 rounded-lg ${
              getColorClasses(getFrameworkInfo(detectedFramework.framework)?.color || 'blue').bg
            } flex items-center gap-2`}
          >
            <span className="text-2xl">{getFrameworkInfo(detectedFramework.framework)?.icon}</span>
            <span className="font-semibold">{getFrameworkInfo(detectedFramework.framework)?.name}</span>
          </div>

          <ArrowRight className="w-6 h-6 text-gray-400" />

          <div
            className={`px-4 py-2 rounded-lg ${
              getColorClasses(getFrameworkInfo(targetFramework)?.color || 'blue').bg
            } flex items-center gap-2`}
          >
            <span className="text-2xl">{getFrameworkInfo(targetFramework)?.icon}</span>
            <span className="font-semibold">{getFrameworkInfo(targetFramework)?.name}</span>
          </div>
        </div>
      )}

      {/* Convert Button */}
      {detectedFramework && !conversionResult && (
        <button
          onClick={convertFramework}
          disabled={loading || targetFramework === detectedFramework.framework}
          className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <Loader className="w-5 h-5 animate-spin" />
              Converting Framework...
            </>
          ) : (
            <>
              <Code2 className="w-5 h-5" />
              Start Framework Conversion
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

      {/* Conversion Results */}
      {conversionResult && (
        <div className="mt-6 bg-purple-50 border border-purple-200 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-6 h-6 text-green-600" />
              <h3 className="font-semibold text-purple-900 text-lg">Conversion Successful!</h3>
            </div>

            <button
              onClick={downloadAllFiles}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors"
            >
              <Download className="w-4 h-4" />
              Download All Files
            </button>
          </div>

          {/* Statistics */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-white rounded-lg p-4">
              <p className="text-sm text-gray-600">Components</p>
              <p className="text-2xl font-bold text-purple-700">
                {conversionResult.statistics.componentsConverted}
              </p>
            </div>
            <div className="bg-white rounded-lg p-4">
              <p className="text-sm text-gray-600">Hooks/Methods</p>
              <p className="text-2xl font-bold text-purple-700">
                {conversionResult.statistics.hooksConverted}
              </p>
            </div>
            <div className="bg-white rounded-lg p-4">
              <p className="text-sm text-gray-600">Lines of Code</p>
              <p className="text-2xl font-bold text-purple-700">
                {conversionResult.statistics.linesOfCode}
              </p>
            </div>
          </div>

          {/* Warnings */}
          {conversionResult.warnings.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
              <h4 className="text-sm font-semibold text-yellow-900 mb-2 flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                Warnings ({conversionResult.warnings.length})
              </h4>
              <ul className="text-xs text-yellow-800 space-y-1">
                {conversionResult.warnings.map((warning, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="w-1 h-1 bg-yellow-600 rounded-full mt-1.5 flex-shrink-0"></span>
                    {warning}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Preview Tabs */}
          <div className="border-b border-purple-200 mb-4">
            <div className="flex gap-2">
              <button
                onClick={() => setPreviewMode('code')}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  previewMode === 'code'
                    ? 'text-purple-700 border-b-2 border-purple-700'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Eye className="w-4 h-4 inline mr-1" />
                Converted Code
              </button>
              {conversionResult.convertedHtml && (
                <button
                  onClick={() => setPreviewMode('html')}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    previewMode === 'html'
                      ? 'text-purple-700 border-b-2 border-purple-700'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <FileCode className="w-4 h-4 inline mr-1" />
                  HTML Template
                </button>
              )}
              {conversionResult.configFiles && conversionResult.configFiles.length > 0 && (
                <button
                  onClick={() => setPreviewMode('config')}
                  className={`px-4 py-2 text-sm font-medium transition-colors ${
                    previewMode === 'config'
                      ? 'text-purple-700 border-b-2 border-purple-700'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <Settings className="w-4 h-4 inline mr-1" />
                  Config Files ({conversionResult.configFiles.length})
                </button>
              )}
            </div>
          </div>

          {/* Preview Content */}
          <div className="bg-white border border-purple-200 rounded-lg p-4 max-h-96 overflow-auto">
            {previewMode === 'code' && (
              <pre className="text-xs text-gray-800 whitespace-pre-wrap">
                <code>{conversionResult.convertedCode}</code>
              </pre>
            )}
            {previewMode === 'html' && conversionResult.convertedHtml && (
              <pre className="text-xs text-gray-800 whitespace-pre-wrap">
                <code>{conversionResult.convertedHtml}</code>
              </pre>
            )}
            {previewMode === 'config' && conversionResult.configFiles && (
              <div className="space-y-4">
                {conversionResult.configFiles.map((file, i) => (
                  <div key={i}>
                    <div className="flex items-center justify-between mb-2">
                      <h5 className="font-semibold text-sm text-gray-900">{file.filename}</h5>
                      <button
                        onClick={() => downloadFile(file.content, file.filename)}
                        className="text-xs text-purple-600 hover:text-purple-800 underline"
                      >
                        Download
                      </button>
                    </div>
                    <pre className="text-xs text-gray-800 whitespace-pre-wrap bg-gray-50 p-3 rounded">
                      <code>{file.content}</code>
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <button
              onClick={() => {
                setConversionResult(null);
                setDetectedFramework(null);
                setError(null);
              }}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
            >
              Start New Conversion
            </button>
          </div>
        </div>
      )}

      {/* Info Box */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="text-sm font-medium text-blue-900 mb-2 flex items-center gap-2">
          <Info className="w-4 h-4" />
          About Framework Conversion
        </h4>
        <ul className="text-xs text-blue-800 space-y-1 list-disc list-inside">
          <li>Automatically detects source framework from code patterns</li>
          <li>Converts React ↔ Vue, Angular ↔ Vanilla, and more</li>
          <li>Converts hooks, lifecycle methods, and template syntax</li>
          <li>Generates config files (package.json, tsconfig.json, etc.)</li>
          <li>Provides warnings for manual review items</li>
        </ul>
      </div>
    </div>
  );
};
