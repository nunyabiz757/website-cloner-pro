import React, { useState } from 'react';
import { Eye, Image as ImageIcon, Video, FileText, Settings2, Zap } from 'lucide-react';

interface LazyLoadSettings {
  images: boolean;
  iframes: boolean;
  videos: boolean;
  scripts: boolean;
  threshold: number;
  rootMargin: number;
  useNativeLazyLoad: boolean;
  enablePlaceholders: boolean;
  placeholderColor: string;
  fadeInAnimation: boolean;
  priority: {
    aboveFold: number;
    images: number;
    videos: number;
    iframes: number;
  };
}

export const LazyLoadConfig: React.FC = () => {
  const [settings, setSettings] = useState<LazyLoadSettings>({
    images: true,
    iframes: true,
    videos: true,
    scripts: false,
    threshold: 0.1,
    rootMargin: 200,
    useNativeLazyLoad: true,
    enablePlaceholders: true,
    placeholderColor: '#f3f4f6',
    fadeInAnimation: true,
    priority: {
      aboveFold: 0,
      images: 10,
      videos: 5,
      iframes: 3,
    },
  });

  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);

  const handleApply = async () => {
    setApplying(true);
    // Simulate applying settings
    setTimeout(() => {
      setApplied(true);
      setApplying(false);
      setTimeout(() => setApplied(false), 3000);
    }, 1500);
  };

  return (
    <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-lg p-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-green-100 rounded-lg">
          <Eye className="w-6 h-6 text-green-600" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Lazy Loading Configuration</h2>
          <p className="text-gray-600">Configure deferred loading for better performance</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        {/* Resource Types */}
        <div className="bg-gray-50 rounded-lg p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Enable Lazy Loading For</h3>
          <div className="space-y-3">
            <label className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200 cursor-pointer hover:border-green-300 transition-colors">
              <div className="flex items-center gap-3">
                <ImageIcon className="w-5 h-5 text-green-600" />
                <span className="text-sm font-medium text-gray-700">Images</span>
              </div>
              <input
                type="checkbox"
                checked={settings.images}
                onChange={(e) =>
                  setSettings({ ...settings, images: e.target.checked })
                }
                className="w-5 h-5 text-green-600 rounded focus:ring-green-500"
              />
            </label>

            <label className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200 cursor-pointer hover:border-green-300 transition-colors">
              <div className="flex items-center gap-3">
                <Video className="w-5 h-5 text-green-600" />
                <span className="text-sm font-medium text-gray-700">Videos</span>
              </div>
              <input
                type="checkbox"
                checked={settings.videos}
                onChange={(e) =>
                  setSettings({ ...settings, videos: e.target.checked })
                }
                className="w-5 h-5 text-green-600 rounded focus:ring-green-500"
              />
            </label>

            <label className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200 cursor-pointer hover:border-green-300 transition-colors">
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-green-600" />
                <span className="text-sm font-medium text-gray-700">Iframes (Embeds)</span>
              </div>
              <input
                type="checkbox"
                checked={settings.iframes}
                onChange={(e) =>
                  setSettings({ ...settings, iframes: e.target.checked })
                }
                className="w-5 h-5 text-green-600 rounded focus:ring-green-500"
              />
            </label>

            <label className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200 cursor-pointer hover:border-green-300 transition-colors">
              <div className="flex items-center gap-3">
                <Settings2 className="w-5 h-5 text-green-600" />
                <span className="text-sm font-medium text-gray-700">Scripts (Advanced)</span>
              </div>
              <input
                type="checkbox"
                checked={settings.scripts}
                onChange={(e) =>
                  setSettings({ ...settings, scripts: e.target.checked })
                }
                className="w-5 h-5 text-green-600 rounded focus:ring-green-500"
              />
            </label>
          </div>
        </div>

        {/* Loading Behavior */}
        <div className="bg-gray-50 rounded-lg p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Loading Behavior</h3>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Threshold: {settings.threshold}
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={settings.threshold}
                onChange={(e) =>
                  setSettings({ ...settings, threshold: parseFloat(e.target.value) })
                }
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-green-600"
              />
              <p className="text-xs text-gray-500 mt-1">
                How much of the element should be visible before loading (0 = any visible, 1 = fully visible)
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Root Margin: {settings.rootMargin}px
              </label>
              <input
                type="range"
                min="0"
                max="500"
                step="50"
                value={settings.rootMargin}
                onChange={(e) =>
                  setSettings({ ...settings, rootMargin: parseInt(e.target.value) })
                }
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-green-600"
              />
              <p className="text-xs text-gray-500 mt-1">
                Start loading this many pixels before element enters viewport
              </p>
            </div>
          </div>
        </div>

        {/* Advanced Options */}
        <div className="bg-gray-50 rounded-lg p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Advanced Options</h3>

          <div className="space-y-3">
            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={settings.useNativeLazyLoad}
                onChange={(e) =>
                  setSettings({ ...settings, useNativeLazyLoad: e.target.checked })
                }
                className="w-4 h-4 text-green-600 rounded focus:ring-green-500"
              />
              <div>
                <span className="text-gray-700 font-medium">Native Lazy Loading</span>
                <p className="text-xs text-gray-500">Use browser's built-in loading="lazy"</p>
              </div>
            </label>

            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={settings.enablePlaceholders}
                onChange={(e) =>
                  setSettings({ ...settings, enablePlaceholders: e.target.checked })
                }
                className="w-4 h-4 text-green-600 rounded focus:ring-green-500"
              />
              <div>
                <span className="text-gray-700 font-medium">Show Placeholders</span>
                <p className="text-xs text-gray-500">Display placeholder while loading</p>
              </div>
            </label>

            {settings.enablePlaceholders && (
              <div className="ml-7">
                <label className="block text-xs text-gray-600 mb-1">
                  Placeholder Color
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={settings.placeholderColor}
                    onChange={(e) =>
                      setSettings({ ...settings, placeholderColor: e.target.value })
                    }
                    className="w-12 h-8 rounded cursor-pointer"
                  />
                  <input
                    type="text"
                    value={settings.placeholderColor}
                    onChange={(e) =>
                      setSettings({ ...settings, placeholderColor: e.target.value })
                    }
                    className="flex-1 px-3 py-1 border border-gray-300 rounded text-sm"
                  />
                </div>
              </div>
            )}

            <label className="flex items-center gap-3 text-sm">
              <input
                type="checkbox"
                checked={settings.fadeInAnimation}
                onChange={(e) =>
                  setSettings({ ...settings, fadeInAnimation: e.target.checked })
                }
                className="w-4 h-4 text-green-600 rounded focus:ring-green-500"
              />
              <div>
                <span className="text-gray-700 font-medium">Fade-in Animation</span>
                <p className="text-xs text-gray-500">Smoothly fade in loaded content</p>
              </div>
            </label>
          </div>
        </div>

        {/* Priority Settings */}
        <div className="bg-gray-50 rounded-lg p-6">
          <h3 className="font-semibold text-gray-900 mb-4">Loading Priority</h3>
          <p className="text-xs text-gray-500 mb-4">
            Number of items to load eagerly (0 = lazy load all)
          </p>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Above the Fold
              </label>
              <input
                type="number"
                value={settings.priority.aboveFold}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    priority: { ...settings.priority, aboveFold: parseInt(e.target.value) || 0 },
                  })
                }
                min="0"
                max="20"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                First N Images
              </label>
              <input
                type="number"
                value={settings.priority.images}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    priority: { ...settings.priority, images: parseInt(e.target.value) || 0 },
                  })
                }
                min="0"
                max="50"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                First N Videos
              </label>
              <input
                type="number"
                value={settings.priority.videos}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    priority: { ...settings.priority, videos: parseInt(e.target.value) || 0 },
                  })
                }
                min="0"
                max="20"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                First N Iframes
              </label>
              <input
                type="number"
                value={settings.priority.iframes}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    priority: { ...settings.priority, iframes: parseInt(e.target.value) || 0 },
                  })
                }
                min="0"
                max="20"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Info Banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
        <h4 className="text-sm font-medium text-blue-900 mb-2">Performance Impact</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-blue-800">
          <div>
            <span className="font-medium">Initial Load:</span> Up to 50% faster
          </div>
          <div>
            <span className="font-medium">Data Saved:</span> Up to 70% less
          </div>
          <div>
            <span className="font-medium">LCP:</span> Improved by 30-40%
          </div>
        </div>
      </div>

      {/* Apply Button */}
      <button
        onClick={handleApply}
        disabled={applying}
        className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {applying ? (
          <>
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
            Applying Settings...
          </>
        ) : applied ? (
          <>
            <Zap className="w-5 h-5" />
            Settings Applied!
          </>
        ) : (
          <>
            <Zap className="w-5 h-5" />
            Apply Lazy Loading
          </>
        )}
      </button>

      {/* Summary */}
      {applied && (
        <div className="mt-6 bg-green-50 border border-green-200 rounded-lg p-6">
          <h3 className="font-semibold text-green-900 mb-3">Configuration Summary</h3>
          <div className="space-y-2 text-sm text-green-800">
            <div className="flex justify-between">
              <span>Resources with lazy loading:</span>
              <span className="font-medium">
                {[settings.images, settings.videos, settings.iframes, settings.scripts].filter(Boolean).length} types
              </span>
            </div>
            <div className="flex justify-between">
              <span>Load distance:</span>
              <span className="font-medium">{settings.rootMargin}px before viewport</span>
            </div>
            <div className="flex justify-between">
              <span>Eager load count:</span>
              <span className="font-medium">
                {settings.priority.aboveFold + settings.priority.images + settings.priority.videos + settings.priority.iframes} items
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
