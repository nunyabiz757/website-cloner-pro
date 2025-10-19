import React, { useState } from 'react';
import { Type, Download, Sliders, CheckCircle2, AlertCircle } from 'lucide-react';

interface FontSettings {
  subsetting: boolean;
  charsets: string[];
  formats: string[];
  preload: boolean;
  display: 'auto' | 'block' | 'swap' | 'fallback' | 'optional';
  removeUnusedGlyphs: boolean;
  convertToWoff2: boolean;
}

interface FontInfo {
  name: string;
  format: string;
  size: number;
  optimizedSize?: number;
  status: 'pending' | 'optimized' | 'skipped';
}

export const FontOptimizer: React.FC = () => {
  const [settings, setSettings] = useState<FontSettings>({
    subsetting: true,
    charsets: ['latin', 'latin-ext'],
    formats: ['woff2', 'woff'],
    preload: true,
    display: 'swap',
    removeUnusedGlyphs: true,
    convertToWoff2: true,
  });

  const [optimizing, setOptimizing] = useState(false);
  const [fonts, setFonts] = useState<FontInfo[]>([
    { name: 'Roboto-Regular.ttf', format: 'ttf', size: 168000, status: 'pending' },
    { name: 'OpenSans-Bold.ttf', format: 'ttf', size: 224000, status: 'pending' },
    { name: 'Lato-Light.woff', format: 'woff', size: 145000, status: 'pending' },
  ]);

  const availableCharsets = [
    { value: 'latin', label: 'Latin (A-Z, a-z, 0-9)' },
    { value: 'latin-ext', label: 'Latin Extended' },
    { value: 'cyrillic', label: 'Cyrillic' },
    { value: 'greek', label: 'Greek' },
    { value: 'vietnamese', label: 'Vietnamese' },
    { value: 'arabic', label: 'Arabic' },
    { value: 'chinese', label: 'Chinese' },
  ];

  const handleOptimize = async () => {
    setOptimizing(true);

    // Simulate font optimization
    setTimeout(() => {
      const optimizedFonts = fonts.map(font => ({
        ...font,
        optimizedSize: Math.round(font.size * 0.4), // 60% reduction
        status: 'optimized' as const,
      }));
      setFonts(optimizedFonts);
      setOptimizing(false);
    }, 2000);
  };

  const toggleCharset = (charset: string) => {
    setSettings({
      ...settings,
      charsets: settings.charsets.includes(charset)
        ? settings.charsets.filter(c => c !== charset)
        : [...settings.charsets, charset],
    });
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 10) / 10 + ' ' + sizes[i];
  };

  const getTotalOriginalSize = () => {
    return fonts.reduce((acc, font) => acc + font.size, 0);
  };

  const getTotalOptimizedSize = () => {
    return fonts.reduce((acc, font) => acc + (font.optimizedSize || font.size), 0);
  };

  const getTotalSavings = () => {
    const original = getTotalOriginalSize();
    const optimized = getTotalOptimizedSize();
    return Math.round(((original - optimized) / original) * 100);
  };

  return (
    <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-lg p-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-indigo-100 rounded-lg">
          <Type className="w-6 h-6 text-indigo-600" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Font Optimization</h2>
          <p className="text-gray-600">Optimize web fonts for faster loading</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Character Subsetting */}
        <div className="bg-gray-50 rounded-lg p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-900">Character Subsetting</h3>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={settings.subsetting}
                onChange={(e) =>
                  setSettings({ ...settings, subsetting: e.target.checked })
                }
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
            </label>
          </div>

          {settings.subsetting && (
            <div className="space-y-2">
              {availableCharsets.map((charset) => (
                <label
                  key={charset.value}
                  className="flex items-center gap-3 text-sm cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={settings.charsets.includes(charset.value)}
                    onChange={() => toggleCharset(charset.value)}
                    className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                  />
                  <span className="text-gray-700">{charset.label}</span>
                </label>
              ))}
            </div>
          )}

          <p className="text-xs text-gray-500 mt-4">
            Include only the characters you need to reduce font file size
          </p>
        </div>

        {/* Font Display & Loading */}
        <div className="bg-gray-50 rounded-lg p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Font Display Strategy</h3>

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                font-display
              </label>
              <select
                value={settings.display}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    display: e.target.value as FontSettings['display'],
                  })
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              >
                <option value="auto">auto</option>
                <option value="block">block</option>
                <option value="swap">swap (recommended)</option>
                <option value="fallback">fallback</option>
                <option value="optional">optional</option>
              </select>
              <p className="text-xs text-gray-500 mt-2">
                {settings.display === 'swap' && 'Show fallback font immediately, swap when ready'}
                {settings.display === 'block' && 'Block text rendering until font loads'}
                {settings.display === 'fallback' && 'Brief blocking period, then fallback'}
                {settings.display === 'optional' && 'Use font only if cached'}
                {settings.display === 'auto' && 'Browser decides the strategy'}
              </p>
            </div>

            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={settings.preload}
                onChange={(e) =>
                  setSettings({ ...settings, preload: e.target.checked })
                }
                className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
              />
              <span className="text-gray-700">Preload Critical Fonts</span>
            </label>
          </div>
        </div>

        {/* Optimization Options */}
        <div className="bg-gray-50 rounded-lg p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Optimization Options</h3>

          <div className="space-y-3">
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={settings.convertToWoff2}
                onChange={(e) =>
                  setSettings({ ...settings, convertToWoff2: e.target.checked })
                }
                className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
              />
              <span className="text-gray-700">Convert to WOFF2</span>
            </label>

            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={settings.removeUnusedGlyphs}
                onChange={(e) =>
                  setSettings({ ...settings, removeUnusedGlyphs: e.target.checked })
                }
                className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
              />
              <span className="text-gray-700">Remove Unused Glyphs</span>
            </label>
          </div>

          <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-xs text-blue-800">
              <strong>Tip:</strong> WOFF2 provides 30% better compression than WOFF
            </p>
          </div>
        </div>

        {/* Format Selection */}
        <div className="bg-gray-50 rounded-lg p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Output Formats</h3>

          <div className="space-y-3">
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={settings.formats.includes('woff2')}
                onChange={(e) => {
                  const formats = e.target.checked
                    ? [...settings.formats, 'woff2']
                    : settings.formats.filter(f => f !== 'woff2');
                  setSettings({ ...settings, formats });
                }}
                className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
              />
              <span className="text-gray-700">WOFF2 (Modern browsers)</span>
            </label>

            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={settings.formats.includes('woff')}
                onChange={(e) => {
                  const formats = e.target.checked
                    ? [...settings.formats, 'woff']
                    : settings.formats.filter(f => f !== 'woff');
                  setSettings({ ...settings, formats });
                }}
                className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
              />
              <span className="text-gray-700">WOFF (Legacy support)</span>
            </label>

            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={settings.formats.includes('ttf')}
                onChange={(e) => {
                  const formats = e.target.checked
                    ? [...settings.formats, 'ttf']
                    : settings.formats.filter(f => f !== 'ttf');
                  setSettings({ ...settings, formats });
                }}
                className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
              />
              <span className="text-gray-700">TTF (Maximum compatibility)</span>
            </label>
          </div>
        </div>
      </div>

      {/* Font List */}
      <div className="mb-6">
        <h3 className="font-semibold text-gray-900 mb-4">Detected Fonts</h3>
        <div className="space-y-2">
          {fonts.map((font, index) => (
            <div
              key={index}
              className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
            >
              <div className="flex items-center gap-3">
                <Type className="w-5 h-5 text-gray-400" />
                <div>
                  <p className="font-medium text-gray-900">{font.name}</p>
                  <p className="text-xs text-gray-500">{font.format.toUpperCase()}</p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-sm text-gray-600">
                    {formatBytes(font.size)}
                    {font.optimizedSize && (
                      <>
                        {' → '}
                        <span className="text-green-600 font-medium">
                          {formatBytes(font.optimizedSize)}
                        </span>
                      </>
                    )}
                  </p>
                  {font.optimizedSize && (
                    <p className="text-xs text-green-600">
                      {Math.round(((font.size - font.optimizedSize) / font.size) * 100)}% smaller
                    </p>
                  )}
                </div>
                {font.status === 'optimized' && (
                  <CheckCircle2 className="w-5 h-5 text-green-600" />
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Optimize Button */}
      <button
        onClick={handleOptimize}
        disabled={optimizing || settings.formats.length === 0}
        className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {optimizing ? (
          <>
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
            Optimizing Fonts...
          </>
        ) : (
          <>
            <Sliders className="w-5 h-5" />
            Optimize Fonts
          </>
        )}
      </button>

      {/* Results Summary */}
      {fonts.some(f => f.optimizedSize) && (
        <div className="mt-6 bg-green-50 border border-green-200 rounded-lg p-6">
          <div className="flex items-center gap-2 mb-4">
            <Download className="w-5 h-5 text-green-600" />
            <h3 className="font-semibold text-green-900">Optimization Complete!</h3>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-green-700">{fonts.length}</p>
              <p className="text-xs text-green-600 mt-1">Fonts Optimized</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-green-700">
                {formatBytes(getTotalOriginalSize() - getTotalOptimizedSize())}
              </p>
              <p className="text-xs text-green-600 mt-1">Space Saved</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-green-700">{getTotalSavings()}%</p>
              <p className="text-xs text-green-600 mt-1">Size Reduction</p>
            </div>
          </div>

          {settings.preload && (
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-blue-800">
                Don't forget to add preload links to your HTML for critical fonts
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
