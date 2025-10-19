import React, { useState, useEffect } from 'react';
import {
  FileCode,
  Download,
  CheckCircle,
  AlertCircle,
  Loader,
  Info,
  Settings,
  Package,
} from 'lucide-react';

interface ExportOptions {
  cloneId: string;
  targetBuilder: 'plugin-free' | 'elementor' | 'divi' | 'beaver-builder';
  themeName: string;
  themeAuthor: string;
  themeDescription: string;
  preserveStructure: boolean;
  generateShortcodes: boolean;
}

interface ExportStatus {
  status: 'idle' | 'generating' | 'completed' | 'failed';
  exportId?: string;
  progress?: number;
  result?: {
    builderType: string;
    exportPath: string;
    zipPath: string;
    fileCount: number;
    totalSize: number;
    instructions: string;
    createdAt: string;
  };
  error?: string;
}

interface WordPressExporterProps {
  cloneId: string;
}

export const WordPressExporter: React.FC<WordPressExporterProps> = ({ cloneId }) => {
  const [options, setOptions] = useState<ExportOptions>({
    cloneId,
    targetBuilder: 'plugin-free',
    themeName: 'Custom Cloned Theme',
    themeAuthor: 'Website Cloner Pro',
    themeDescription: 'Generated from cloned website',
    preserveStructure: true,
    generateShortcodes: true,
  });

  const [exportStatus, setExportStatus] = useState<ExportStatus>({ status: 'idle' });
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [pollingInterval]);

  const builders = [
    {
      id: 'plugin-free' as const,
      name: 'Plugin-Free Theme',
      description: 'Standalone WordPress theme with no dependencies',
      icon: <FileCode className="w-5 h-5" />,
      color: 'blue',
    },
    {
      id: 'elementor' as const,
      name: 'Elementor',
      description: 'Export as Elementor page builder template',
      icon: <Package className="w-5 h-5" />,
      color: 'purple',
    },
    {
      id: 'divi' as const,
      name: 'Divi Builder',
      description: 'Export as Divi layout with shortcodes',
      icon: <Package className="w-5 h-5" />,
      color: 'green',
    },
    {
      id: 'beaver-builder' as const,
      name: 'Beaver Builder',
      description: 'Export as Beaver Builder custom module',
      icon: <Package className="w-5 h-5" />,
      color: 'orange',
    },
  ];

  const startExport = async () => {
    try {
      const response = await fetch('/api/wordpress-export/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to start export');
      }

      setExportStatus({
        status: 'generating',
        exportId: data.exportId,
        progress: 0,
      });

      // Start polling for status
      const interval = setInterval(() => {
        pollExportStatus(data.exportId);
      }, 2000);
      setPollingInterval(interval);
    } catch (error) {
      setExportStatus({
        status: 'failed',
        error: error instanceof Error ? error.message : 'Failed to start export',
      });
    }
  };

  const pollExportStatus = async (exportId: string) => {
    try {
      const response = await fetch(`/api/wordpress-export/status/${exportId}`);
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to get status');
      }

      setExportStatus({
        status: data.status,
        exportId: data.exportId,
        progress: data.progress,
        result: data.result,
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

  const downloadExport = async () => {
    if (!exportStatus.exportId) return;

    try {
      const response = await fetch(`/api/wordpress-export/download/${exportStatus.exportId}`);

      if (!response.ok) {
        throw new Error('Failed to download export');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `wordpress-export-${exportStatus.exportId}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Failed to download export');
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const getStatusColor = () => {
    switch (exportStatus.status) {
      case 'generating':
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
    switch (exportStatus.status) {
      case 'generating':
        return <Loader className="w-5 h-5 text-blue-600 animate-spin" />;
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'failed':
        return <AlertCircle className="w-5 h-5 text-red-600" />;
      default:
        return <FileCode className="w-5 h-5 text-gray-600" />;
    }
  };

  const getColorClasses = (color: string) => {
    const colors = {
      blue: {
        border: 'border-blue-200',
        bg: 'bg-blue-50',
        hover: 'hover:border-blue-400',
        selected: 'border-blue-500 bg-blue-100',
      },
      purple: {
        border: 'border-purple-200',
        bg: 'bg-purple-50',
        hover: 'hover:border-purple-400',
        selected: 'border-purple-500 bg-purple-100',
      },
      green: {
        border: 'border-green-200',
        bg: 'bg-green-50',
        hover: 'hover:border-green-400',
        selected: 'border-green-500 bg-green-100',
      },
      orange: {
        border: 'border-orange-200',
        bg: 'bg-orange-50',
        hover: 'hover:border-orange-400',
        selected: 'border-orange-500 bg-orange-100',
      },
    };
    return colors[color as keyof typeof colors];
  };

  return (
    <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-lg p-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-indigo-100 rounded-lg">
          <FileCode className="w-6 h-6 text-indigo-600" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">WordPress Exporter</h2>
          <p className="text-gray-600">Export your cloned site to WordPress format</p>
        </div>
      </div>

      {/* Builder Selection */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-3">
          Target Builder
        </label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {builders.map((builder) => {
            const colors = getColorClasses(builder.color);
            const isSelected = options.targetBuilder === builder.id;

            return (
              <button
                key={builder.id}
                onClick={() => setOptions({ ...options, targetBuilder: builder.id })}
                disabled={exportStatus.status === 'generating'}
                className={`p-4 border-2 rounded-lg text-left transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                  isSelected
                    ? `${colors.selected} shadow-md`
                    : `${colors.border} ${colors.hover}`
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded ${colors.bg}`}>{builder.icon}</div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 mb-1">{builder.name}</h3>
                    <p className="text-xs text-gray-600">{builder.description}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Theme Information */}
      <div className="mb-6 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Theme Name
          </label>
          <input
            type="text"
            value={options.themeName}
            onChange={(e) => setOptions({ ...options, themeName: e.target.value })}
            disabled={exportStatus.status === 'generating'}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-gray-100"
            placeholder="My Custom Theme"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Theme Author
            </label>
            <input
              type="text"
              value={options.themeAuthor}
              onChange={(e) => setOptions({ ...options, themeAuthor: e.target.value })}
              disabled={exportStatus.status === 'generating'}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-gray-100"
              placeholder="Your Name"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Theme Description
            </label>
            <input
              type="text"
              value={options.themeDescription}
              onChange={(e) =>
                setOptions({ ...options, themeDescription: e.target.value })
              }
              disabled={exportStatus.status === 'generating'}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-gray-100"
              placeholder="Theme description"
            />
          </div>
        </div>
      </div>

      {/* Advanced Options */}
      <div className="mb-6">
        <button
          onClick={() => setShowAdvanced(!showAdvanced)}
          className="flex items-center gap-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
        >
          <Settings className="w-4 h-4" />
          Advanced Options
          <span className="text-xs text-gray-500">
            {showAdvanced ? '(hide)' : '(show)'}
          </span>
        </button>

        {showAdvanced && (
          <div className="mt-3 space-y-3 p-4 bg-gray-50 rounded-lg">
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={options.preserveStructure}
                onChange={(e) =>
                  setOptions({ ...options, preserveStructure: e.target.checked })
                }
                disabled={exportStatus.status === 'generating'}
                className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 disabled:opacity-50"
              />
              <span className="text-gray-700">Preserve HTML structure</span>
            </label>

            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={options.generateShortcodes}
                onChange={(e) =>
                  setOptions({ ...options, generateShortcodes: e.target.checked })
                }
                disabled={exportStatus.status === 'generating'}
                className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 disabled:opacity-50"
              />
              <span className="text-gray-700">Generate WordPress shortcodes</span>
            </label>
          </div>
        )}
      </div>

      {/* Generate Button */}
      {exportStatus.status === 'idle' && (
        <button
          onClick={startExport}
          className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors"
        >
          <FileCode className="w-5 h-5" />
          Generate WordPress Export
        </button>
      )}

      {/* Export Status */}
      {exportStatus.status !== 'idle' && (
        <div
          className={`bg-${getStatusColor()}-50 border border-${getStatusColor()}-200 rounded-lg p-6`}
        >
          <div className="flex items-center gap-2 mb-4">
            {getStatusIcon()}
            <h3 className={`font-semibold text-${getStatusColor()}-900 capitalize`}>
              {exportStatus.status === 'generating' ? 'Generating Export' : exportStatus.status}
            </h3>
          </div>

          {exportStatus.status === 'generating' && (
            <div className="space-y-3">
              <div className="w-full bg-blue-200 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all animate-pulse"
                  style={{ width: `${exportStatus.progress || 0}%` }}
                ></div>
              </div>
              <p className="text-sm text-blue-800">
                Generating WordPress export... Please wait.
              </p>
            </div>
          )}

          {exportStatus.status === 'completed' && exportStatus.result && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-green-600">Builder Type</p>
                  <p className="text-lg font-bold text-green-700 capitalize">
                    {exportStatus.result.builderType.replace('-', ' ')}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-green-600">Total Files</p>
                  <p className="text-lg font-bold text-green-700">
                    {exportStatus.result.fileCount}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-green-600">Total Size</p>
                  <p className="text-lg font-bold text-green-700">
                    {formatBytes(exportStatus.result.totalSize)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-green-600">Created</p>
                  <p className="text-xs font-medium text-green-700">
                    {new Date(exportStatus.result.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>

              <button
                onClick={downloadExport}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors"
              >
                <Download className="w-5 h-5" />
                Download WordPress Export
              </button>

              {/* Installation Instructions */}
              {exportStatus.result.instructions && (
                <div className="bg-white border border-green-200 rounded-lg p-4">
                  <h4 className="text-sm font-semibold text-gray-900 mb-2 flex items-center gap-2">
                    <Info className="w-4 h-4" />
                    Installation Instructions
                  </h4>
                  <div className="text-xs text-gray-700 whitespace-pre-wrap">
                    {exportStatus.result.instructions}
                  </div>
                </div>
              )}
            </div>
          )}

          {exportStatus.status === 'failed' && exportStatus.error && (
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-red-800 mb-3">{exportStatus.error}</p>
                <button
                  onClick={() => setExportStatus({ status: 'idle' })}
                  className="text-sm text-red-700 hover:text-red-900 underline"
                >
                  Try Again
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Info Box */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="text-sm font-medium text-blue-900 mb-2 flex items-center gap-2">
          <Info className="w-4 h-4" />
          About WordPress Export
        </h4>
        <ul className="text-xs text-blue-800 space-y-1 list-disc list-inside">
          <li>
            <strong>Plugin-Free:</strong> Creates a standalone theme with all assets embedded
          </li>
          <li>
            <strong>Elementor:</strong> Generates JSON template compatible with Elementor
          </li>
          <li>
            <strong>Divi:</strong> Creates layout JSON with Divi shortcodes
          </li>
          <li>
            <strong>Beaver Builder:</strong> Generates custom module for Beaver Builder
          </li>
        </ul>
      </div>
    </div>
  );
};
