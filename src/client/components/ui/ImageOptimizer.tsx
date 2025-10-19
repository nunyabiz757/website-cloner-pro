import React, { useState } from 'react';
import { Image, Settings, Zap, FileImage, Download, Info } from 'lucide-react';

interface ImageOptimizationSettings {
  quality: number;
  format: 'original' | 'webp' | 'avif' | 'jpeg' | 'png';
  resize: boolean;
  maxWidth: number;
  maxHeight: number;
  progressive: boolean;
  stripMetadata: boolean;
  lazyLoad: boolean;
}

export const ImageOptimizer: React.FC = () => {
  const [settings, setSettings] = useState<ImageOptimizationSettings>({
    quality: 80,
    format: 'webp',
    resize: false,
    maxWidth: 1920,
    maxHeight: 1080,
    progressive: true,
    stripMetadata: true,
    lazyLoad: true,
  });

  const [optimizing, setOptimizing] = useState(false);
  const [results, setResults] = useState<{
    originalSize: number;
    optimizedSize: number;
    savings: number;
    imagesProcessed: number;
  } | null>(null);

  const handleOptimize = async () => {
    setOptimizing(true);
    // Simulated optimization - in production, this would call the API
    setTimeout(() => {
      setResults({
        originalSize: 5242880, // 5MB
        optimizedSize: 1572864, // 1.5MB
        savings: 70,
        imagesProcessed: 24,
      });
      setOptimizing(false);
    }, 2000);
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-lg p-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-purple-100 rounded-lg">
          <Image className="w-6 h-6 text-purple-600" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Image Optimization</h2>
          <p className="text-gray-600">Configure advanced image optimization settings</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Format Selection */}
        <div className="bg-gray-50 rounded-lg p-6">
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3">
            <FileImage className="w-4 h-4" />
            Output Format
          </label>
          <select
            value={settings.format}
            onChange={(e) =>
              setSettings({
                ...settings,
                format: e.target.value as ImageOptimizationSettings['format'],
              })
            }
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
          >
            <option value="original">Keep Original</option>
            <option value="webp">WebP (Recommended)</option>
            <option value="avif">AVIF (Best Compression)</option>
            <option value="jpeg">JPEG</option>
            <option value="png">PNG</option>
          </select>
          <p className="text-xs text-gray-500 mt-2">
            {settings.format === 'webp' && 'WebP provides excellent compression with wide browser support'}
            {settings.format === 'avif' && 'AVIF offers superior compression but limited browser support'}
            {settings.format === 'original' && 'Keep images in their original format'}
            {settings.format === 'jpeg' && 'Best for photos and complex images'}
            {settings.format === 'png' && 'Best for graphics with transparency'}
          </p>
        </div>

        {/* Quality Slider */}
        <div className="bg-gray-50 rounded-lg p-6">
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3">
            <Settings className="w-4 h-4" />
            Quality: {settings.quality}%
          </label>
          <input
            type="range"
            min="1"
            max="100"
            value={settings.quality}
            onChange={(e) =>
              setSettings({ ...settings, quality: parseInt(e.target.value) })
            }
            className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-purple-600"
          />
          <div className="flex justify-between text-xs text-gray-500 mt-2">
            <span>Lower size</span>
            <span>Higher quality</span>
          </div>
          <p className="text-xs text-gray-500 mt-2">
            {settings.quality < 50 && 'Low quality - Maximum compression'}
            {settings.quality >= 50 && settings.quality < 80 && 'Good balance of quality and size'}
            {settings.quality >= 80 && 'High quality - Minimal compression'}
          </p>
        </div>

        {/* Resize Settings */}
        <div className="bg-gray-50 rounded-lg p-6">
          <label className="flex items-center gap-3 mb-3">
            <input
              type="checkbox"
              checked={settings.resize}
              onChange={(e) =>
                setSettings({ ...settings, resize: e.target.checked })
              }
              className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
            />
            <span className="text-sm font-medium text-gray-700">
              Resize Large Images
            </span>
          </label>

          {settings.resize && (
            <div className="space-y-3 mt-4 pl-7">
              <div>
                <label className="block text-xs text-gray-600 mb-1">
                  Max Width (px)
                </label>
                <input
                  type="number"
                  value={settings.maxWidth}
                  onChange={(e) =>
                    setSettings({ ...settings, maxWidth: parseInt(e.target.value) })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  min="100"
                  max="4000"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">
                  Max Height (px)
                </label>
                <input
                  type="number"
                  value={settings.maxHeight}
                  onChange={(e) =>
                    setSettings({ ...settings, maxHeight: parseInt(e.target.value) })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
                  min="100"
                  max="4000"
                />
              </div>
            </div>
          )}
        </div>

        {/* Additional Options */}
        <div className="bg-gray-50 rounded-lg p-6">
          <label className="text-sm font-medium text-gray-700 mb-3 block">
            Additional Options
          </label>
          <div className="space-y-3">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={settings.progressive}
                onChange={(e) =>
                  setSettings({ ...settings, progressive: e.target.checked })
                }
                className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
              />
              <span className="text-sm text-gray-700">
                Progressive Loading
              </span>
            </label>

            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={settings.stripMetadata}
                onChange={(e) =>
                  setSettings({ ...settings, stripMetadata: e.target.checked })
                }
                className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
              />
              <span className="text-sm text-gray-700">
                Strip Metadata (EXIF, GPS)
              </span>
            </label>

            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={settings.lazyLoad}
                onChange={(e) =>
                  setSettings({ ...settings, lazyLoad: e.target.checked })
                }
                className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
              />
              <span className="text-sm text-gray-700">
                Enable Lazy Loading
              </span>
            </label>
          </div>
        </div>
      </div>

      {/* Info Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 flex items-start gap-3">
        <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-800">
          <p className="font-medium mb-1">Optimization Tips</p>
          <ul className="list-disc list-inside space-y-1 text-xs">
            <li>WebP format provides the best balance of quality and compression</li>
            <li>Quality of 75-85% is optimal for most images</li>
            <li>Lazy loading improves initial page load performance</li>
            <li>Stripping metadata reduces file size by 5-15%</li>
          </ul>
        </div>
      </div>

      {/* Optimize Button */}
      <button
        onClick={handleOptimize}
        disabled={optimizing}
        className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {optimizing ? (
          <>
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
            Optimizing Images...
          </>
        ) : (
          <>
            <Zap className="w-5 h-5" />
            Optimize Images
          </>
        )}
      </button>

      {/* Results */}
      {results && (
        <div className="mt-6 bg-green-50 border border-green-200 rounded-lg p-6">
          <div className="flex items-center gap-2 mb-4">
            <Download className="w-5 h-5 text-green-600" />
            <h3 className="font-semibold text-green-900">Optimization Complete!</h3>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center">
              <p className="text-2xl font-bold text-green-700">{results.imagesProcessed}</p>
              <p className="text-xs text-green-600 mt-1">Images Processed</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-green-700">{formatBytes(results.originalSize)}</p>
              <p className="text-xs text-green-600 mt-1">Original Size</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-green-700">{formatBytes(results.optimizedSize)}</p>
              <p className="text-xs text-green-600 mt-1">Optimized Size</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-green-700">{results.savings}%</p>
              <p className="text-xs text-green-600 mt-1">Size Reduction</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
