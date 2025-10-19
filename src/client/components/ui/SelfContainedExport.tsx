import React, { useState } from 'react';
import {
  Package,
  Download,
  FileArchive,
  FileCode,
  CheckCircle,
  AlertCircle,
  Loader,
  Image,
  Type,
  Code,
  FileText,
  Zap,
} from 'lucide-react';

interface SelfContainedExportProps {
  htmlContent: string;
  baseUrl: string;
}

interface ExportOptions {
  inlineImages: boolean;
  inlineFonts: boolean;
  inlineScripts: boolean;
  inlineStyles: boolean;
  singleFile: boolean;
  maxImageSize: number;
}

interface ExportResult {
  format: 'single-file' | 'zip';
  content?: string;
  zipPath?: string;
  size: number;
  files: number;
  inlinedResources: {
    images: number;
    fonts: number;
    scripts: number;
    styles: number;
  };
}

export const SelfContainedExport: React.FC<SelfContainedExportProps> = ({
  htmlContent,
  baseUrl,
}) => {
  const [options, setOptions] = useState<ExportOptions>({
    inlineImages: true,
    inlineFonts: true,
    inlineScripts: true,
    inlineStyles: true,
    singleFile: true,
    maxImageSize: 500 * 1024, // 500KB
  });

  const [result, setResult] = useState<ExportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloading, setDownloading] = useState(false);

  const createExport = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/export/self-contained', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          htmlContent,
          baseUrl,
          options,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to create export');
      }

      setResult(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create export');
    } finally {
      setLoading(false);
    }
  };

  const downloadExport = async () => {
    setDownloading(true);

    try {
      const response = await fetch('/api/export/self-contained/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          htmlContent,
          baseUrl,
          options,
          filename: options.singleFile ? 'export.html' : 'export.zip',
        }),
      });

      if (!response.ok) {
        throw new Error('Download failed');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = options.singleFile ? 'export.html' : 'export.zip';
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

  const formatMaxSize = (bytes: number) => {
    return (bytes / 1024).toFixed(0) + ' KB';
  };

  return (
    <div className="max-w-7xl mx-auto bg-white rounded-lg shadow-lg p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Package className="w-7 h-7" />
            Self-Contained Export
          </h2>
          <p className="text-gray-600">
            Create a standalone package with all dependencies embedded
          </p>
        </div>

        <button
          onClick={createExport}
          disabled={loading}
          className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <Loader className="w-5 h-5 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <Package className="w-5 h-5" />
              Create Export
            </>
          )}
        </button>
      </div>

      {/* Options */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Export Options</h3>

        <div className="space-y-4">
          {/* Inline Resources */}
          <div className="grid grid-cols-2 gap-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={options.inlineStyles}
                onChange={(e) =>
                  setOptions({ ...options, inlineStyles: e.target.checked })
                }
                className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
              />
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-gray-600" />
                <span className="text-sm font-medium text-gray-900">Inline Stylesheets</span>
              </div>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={options.inlineScripts}
                onChange={(e) =>
                  setOptions({ ...options, inlineScripts: e.target.checked })
                }
                className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
              />
              <div className="flex items-center gap-2">
                <Code className="w-4 h-4 text-gray-600" />
                <span className="text-sm font-medium text-gray-900">Inline Scripts</span>
              </div>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={options.inlineImages}
                onChange={(e) =>
                  setOptions({ ...options, inlineImages: e.target.checked })
                }
                className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
              />
              <div className="flex items-center gap-2">
                <Image className="w-4 h-4 text-gray-600" />
                <span className="text-sm font-medium text-gray-900">Inline Images (Base64)</span>
              </div>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={options.inlineFonts}
                onChange={(e) =>
                  setOptions({ ...options, inlineFonts: e.target.checked })
                }
                className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
              />
              <div className="flex items-center gap-2">
                <Type className="w-4 h-4 text-gray-600" />
                <span className="text-sm font-medium text-gray-900">Inline Fonts</span>
              </div>
            </label>
          </div>

          {/* Format */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Export Format
            </label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={options.singleFile}
                  onChange={() => setOptions({ ...options, singleFile: true })}
                  className="w-4 h-4 text-indigo-600 focus:ring-indigo-500"
                />
                <div className="flex items-center gap-2">
                  <FileCode className="w-4 h-4 text-gray-600" />
                  <span className="text-sm font-medium text-gray-900">Single HTML File</span>
                </div>
              </label>

              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={!options.singleFile}
                  onChange={() => setOptions({ ...options, singleFile: false })}
                  className="w-4 h-4 text-indigo-600 focus:ring-indigo-500"
                />
                <div className="flex items-center gap-2">
                  <FileArchive className="w-4 h-4 text-gray-600" />
                  <span className="text-sm font-medium text-gray-900">ZIP Archive</span>
                </div>
              </label>
            </div>
          </div>

          {/* Max Image Size */}
          {options.inlineImages && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Max Image Size for Base64 Encoding: {formatMaxSize(options.maxImageSize)}
              </label>
              <input
                type="range"
                min="102400"
                max="2097152"
                step="102400"
                value={options.maxImageSize}
                onChange={(e) =>
                  setOptions({ ...options, maxImageSize: parseInt(e.target.value) })
                }
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>100 KB</span>
                <span>2 MB</span>
              </div>
            </div>
          )}
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
                    Export Created Successfully!
                  </h3>
                  <p className="text-sm text-green-700">
                    All dependencies have been embedded into the export
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

          {/* Export Stats */}
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Export Statistics</h3>
            <div className="grid grid-cols-3 gap-6">
              <div>
                <div className="text-xs text-blue-600 font-semibold mb-1">Format</div>
                <div className="text-2xl font-bold text-gray-900 capitalize">
                  {result.format.replace('-', ' ')}
                </div>
              </div>

              <div>
                <div className="text-xs text-blue-600 font-semibold mb-1">Total Size</div>
                <div className="text-2xl font-bold text-gray-900">
                  {formatBytes(result.size)}
                </div>
              </div>

              <div>
                <div className="text-xs text-blue-600 font-semibold mb-1">Files</div>
                <div className="text-2xl font-bold text-gray-900">{result.files}</div>
              </div>
            </div>
          </div>

          {/* Inlined Resources */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Embedded Resources</h3>
            <div className="grid grid-cols-4 gap-4">
              <div className="flex items-center gap-3 p-4 bg-purple-50 rounded-lg">
                <FileText className="w-8 h-8 text-purple-600" />
                <div>
                  <div className="text-2xl font-bold text-purple-900">
                    {result.inlinedResources.styles}
                  </div>
                  <div className="text-xs text-purple-700">Stylesheets</div>
                </div>
              </div>

              <div className="flex items-center gap-3 p-4 bg-yellow-50 rounded-lg">
                <Code className="w-8 h-8 text-yellow-600" />
                <div>
                  <div className="text-2xl font-bold text-yellow-900">
                    {result.inlinedResources.scripts}
                  </div>
                  <div className="text-xs text-yellow-700">Scripts</div>
                </div>
              </div>

              <div className="flex items-center gap-3 p-4 bg-green-50 rounded-lg">
                <Image className="w-8 h-8 text-green-600" />
                <div>
                  <div className="text-2xl font-bold text-green-900">
                    {result.inlinedResources.images}
                  </div>
                  <div className="text-xs text-green-700">Images</div>
                </div>
              </div>

              <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-lg">
                <Type className="w-8 h-8 text-blue-600" />
                <div>
                  <div className="text-2xl font-bold text-blue-900">
                    {result.inlinedResources.fonts}
                  </div>
                  <div className="text-xs text-blue-700">Fonts</div>
                </div>
              </div>
            </div>
          </div>

          {/* Features */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Zap className="w-5 h-5 text-yellow-500" />
              Package Features
            </h3>
            <ul className="space-y-2">
              <li className="flex items-start gap-2 text-sm text-gray-700">
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <span>
                  <strong>Fully Offline:</strong> Works without internet connection
                </span>
              </li>
              <li className="flex items-start gap-2 text-sm text-gray-700">
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <span>
                  <strong>No External Dependencies:</strong> All resources embedded
                </span>
              </li>
              <li className="flex items-start gap-2 text-sm text-gray-700">
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <span>
                  <strong>Portable:</strong> Single file or organized ZIP structure
                </span>
              </li>
              <li className="flex items-start gap-2 text-sm text-gray-700">
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <span>
                  <strong>Browser Compatible:</strong> Opens directly in any web browser
                </span>
              </li>
            </ul>
          </div>
        </div>
      )}

      {!result && !loading && (
        <div className="text-center py-20 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">
            Ready to Create Export
          </h3>
          <p className="text-gray-600 mb-6">
            Configure your options and click "Create Export" to generate a self-contained
            package
          </p>
        </div>
      )}
    </div>
  );
};
