import React, { useState } from 'react';
import { Code, FileCode, Minimize2, BarChart3, CheckCircle } from 'lucide-react';

interface MinificationSettings {
  css: {
    enabled: boolean;
    removeComments: boolean;
    removeWhitespace: boolean;
    optimizeColors: boolean;
    mergeDuplicates: boolean;
    removeUnused: boolean;
  };
  js: {
    enabled: boolean;
    removeComments: boolean;
    removeWhitespace: boolean;
    mangleVariables: boolean;
    removeConsole: boolean;
    removeDebugger: boolean;
    es6ToEs5: boolean;
  };
}

export const CodeMinifier: React.FC = () => {
  const [settings, setSettings] = useState<MinificationSettings>({
    css: {
      enabled: true,
      removeComments: true,
      removeWhitespace: true,
      optimizeColors: true,
      mergeDuplicates: true,
      removeUnused: false,
    },
    js: {
      enabled: true,
      removeComments: true,
      removeWhitespace: true,
      mangleVariables: true,
      removeConsole: true,
      removeDebugger: true,
      es6ToEs5: false,
    },
  });

  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState<{
    cssFiles: number;
    jsFiles: number;
    cssOriginal: number;
    cssMinified: number;
    jsOriginal: number;
    jsMinified: number;
  } | null>(null);

  const handleMinify = async () => {
    setProcessing(true);
    // Simulated minification
    setTimeout(() => {
      setResults({
        cssFiles: 8,
        jsFiles: 12,
        cssOriginal: 524288, // 512KB
        cssMinified: 157286, // 153KB
        jsOriginal: 1048576, // 1MB
        jsMinified: 419430, // 410KB
      });
      setProcessing(false);
    }, 2000);
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const calculateSavings = (original: number, minified: number) => {
    return Math.round(((original - minified) / original) * 100);
  };

  return (
    <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-lg p-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-blue-100 rounded-lg">
          <Code className="w-6 h-6 text-blue-600" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Code Minification</h2>
          <p className="text-gray-600">Configure CSS and JavaScript minification settings</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* CSS Minification */}
        <div className="border border-gray-200 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <FileCode className="w-5 h-5 text-blue-600" />
              <h3 className="font-semibold text-gray-900">CSS Minification</h3>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.css.enabled}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    css: { ...settings.css, enabled: e.target.checked },
                  })
                }
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          <div className="space-y-3">
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={settings.css.removeComments}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    css: { ...settings.css, removeComments: e.target.checked },
                  })
                }
                disabled={!settings.css.enabled}
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 disabled:opacity-50"
              />
              <span className={!settings.css.enabled ? 'text-gray-400' : 'text-gray-700'}>
                Remove Comments
              </span>
            </label>

            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={settings.css.removeWhitespace}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    css: { ...settings.css, removeWhitespace: e.target.checked },
                  })
                }
                disabled={!settings.css.enabled}
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 disabled:opacity-50"
              />
              <span className={!settings.css.enabled ? 'text-gray-400' : 'text-gray-700'}>
                Remove Whitespace
              </span>
            </label>

            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={settings.css.optimizeColors}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    css: { ...settings.css, optimizeColors: e.target.checked },
                  })
                }
                disabled={!settings.css.enabled}
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 disabled:opacity-50"
              />
              <span className={!settings.css.enabled ? 'text-gray-400' : 'text-gray-700'}>
                Optimize Colors (#ffffff → #fff)
              </span>
            </label>

            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={settings.css.mergeDuplicates}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    css: { ...settings.css, mergeDuplicates: e.target.checked },
                  })
                }
                disabled={!settings.css.enabled}
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 disabled:opacity-50"
              />
              <span className={!settings.css.enabled ? 'text-gray-400' : 'text-gray-700'}>
                Merge Duplicate Rules
              </span>
            </label>

            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={settings.css.removeUnused}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    css: { ...settings.css, removeUnused: e.target.checked },
                  })
                }
                disabled={!settings.css.enabled}
                className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 disabled:opacity-50"
              />
              <span className={!settings.css.enabled ? 'text-gray-400' : 'text-gray-700'}>
                Remove Unused CSS
              </span>
            </label>
          </div>
        </div>

        {/* JavaScript Minification */}
        <div className="border border-gray-200 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Code className="w-5 h-5 text-yellow-600" />
              <h3 className="font-semibold text-gray-900">JS Minification</h3>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.js.enabled}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    js: { ...settings.js, enabled: e.target.checked },
                  })
                }
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-yellow-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-yellow-600"></div>
            </label>
          </div>

          <div className="space-y-3">
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={settings.js.removeComments}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    js: { ...settings.js, removeComments: e.target.checked },
                  })
                }
                disabled={!settings.js.enabled}
                className="w-4 h-4 text-yellow-600 rounded focus:ring-yellow-500 disabled:opacity-50"
              />
              <span className={!settings.js.enabled ? 'text-gray-400' : 'text-gray-700'}>
                Remove Comments
              </span>
            </label>

            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={settings.js.removeWhitespace}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    js: { ...settings.js, removeWhitespace: e.target.checked },
                  })
                }
                disabled={!settings.js.enabled}
                className="w-4 h-4 text-yellow-600 rounded focus:ring-yellow-500 disabled:opacity-50"
              />
              <span className={!settings.js.enabled ? 'text-gray-400' : 'text-gray-700'}>
                Remove Whitespace
              </span>
            </label>

            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={settings.js.mangleVariables}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    js: { ...settings.js, mangleVariables: e.target.checked },
                  })
                }
                disabled={!settings.js.enabled}
                className="w-4 h-4 text-yellow-600 rounded focus:ring-yellow-500 disabled:opacity-50"
              />
              <span className={!settings.js.enabled ? 'text-gray-400' : 'text-gray-700'}>
                Mangle Variable Names
              </span>
            </label>

            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={settings.js.removeConsole}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    js: { ...settings.js, removeConsole: e.target.checked },
                  })
                }
                disabled={!settings.js.enabled}
                className="w-4 h-4 text-yellow-600 rounded focus:ring-yellow-500 disabled:opacity-50"
              />
              <span className={!settings.js.enabled ? 'text-gray-400' : 'text-gray-700'}>
                Remove console.* Calls
              </span>
            </label>

            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={settings.js.removeDebugger}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    js: { ...settings.js, removeDebugger: e.target.checked },
                  })
                }
                disabled={!settings.js.enabled}
                className="w-4 h-4 text-yellow-600 rounded focus:ring-yellow-500 disabled:opacity-50"
              />
              <span className={!settings.js.enabled ? 'text-gray-400' : 'text-gray-700'}>
                Remove Debugger Statements
              </span>
            </label>

            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={settings.js.es6ToEs5}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    js: { ...settings.js, es6ToEs5: e.target.checked },
                  })
                }
                disabled={!settings.js.enabled}
                className="w-4 h-4 text-yellow-600 rounded focus:ring-yellow-500 disabled:opacity-50"
              />
              <span className={!settings.js.enabled ? 'text-gray-400' : 'text-gray-700'}>
                Transpile ES6+ to ES5
              </span>
            </label>
          </div>
        </div>
      </div>

      {/* Minify Button */}
      <button
        onClick={handleMinify}
        disabled={processing || (!settings.css.enabled && !settings.js.enabled)}
        className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {processing ? (
          <>
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
            Minifying Code...
          </>
        ) : (
          <>
            <Minimize2 className="w-5 h-5" />
            Minify Code
          </>
        )}
      </button>

      {/* Results */}
      {results && (
        <div className="mt-6 space-y-4">
          {settings.css.enabled && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
              <div className="flex items-center gap-2 mb-4">
                <CheckCircle className="w-5 h-5 text-blue-600" />
                <h3 className="font-semibold text-blue-900">CSS Minification Results</h3>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-blue-600">Files Processed</p>
                  <p className="text-2xl font-bold text-blue-700">{results.cssFiles}</p>
                </div>
                <div>
                  <p className="text-sm text-blue-600">Original Size</p>
                  <p className="text-2xl font-bold text-blue-700">{formatBytes(results.cssOriginal)}</p>
                </div>
                <div>
                  <p className="text-sm text-blue-600">Minified Size</p>
                  <p className="text-2xl font-bold text-blue-700">{formatBytes(results.cssMinified)}</p>
                </div>
                <div>
                  <p className="text-sm text-blue-600">Reduction</p>
                  <p className="text-2xl font-bold text-blue-700">
                    {calculateSavings(results.cssOriginal, results.cssMinified)}%
                  </p>
                </div>
              </div>
            </div>
          )}

          {settings.js.enabled && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
              <div className="flex items-center gap-2 mb-4">
                <CheckCircle className="w-5 h-5 text-yellow-600" />
                <h3 className="font-semibold text-yellow-900">JavaScript Minification Results</h3>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-yellow-600">Files Processed</p>
                  <p className="text-2xl font-bold text-yellow-700">{results.jsFiles}</p>
                </div>
                <div>
                  <p className="text-sm text-yellow-600">Original Size</p>
                  <p className="text-2xl font-bold text-yellow-700">{formatBytes(results.jsOriginal)}</p>
                </div>
                <div>
                  <p className="text-sm text-yellow-600">Minified Size</p>
                  <p className="text-2xl font-bold text-yellow-700">{formatBytes(results.jsMinified)}</p>
                </div>
                <div>
                  <p className="text-sm text-yellow-600">Reduction</p>
                  <p className="text-2xl font-bold text-yellow-700">
                    {calculateSavings(results.jsOriginal, results.jsMinified)}%
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
            <BarChart3 className="w-5 h-5 text-green-600" />
            <div>
              <p className="text-sm font-medium text-green-900">Total Savings</p>
              <p className="text-xs text-green-600">
                {formatBytes((results.cssOriginal + results.jsOriginal) - (results.cssMinified + results.jsMinified))} saved
                ({calculateSavings(results.cssOriginal + results.jsOriginal, results.cssMinified + results.jsMinified)}% reduction)
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
