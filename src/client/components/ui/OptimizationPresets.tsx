import React, { useState } from 'react';
import { Gauge, Zap, Shield, Target, CheckCircle2, Circle } from 'lucide-react';

interface Preset {
  id: 'conservative' | 'balanced' | 'aggressive';
  name: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  settings: {
    imageQuality: number;
    imageFormat: string;
    cssMinify: boolean;
    jsMinify: boolean;
    removeComments: boolean;
    removeConsole: boolean;
    lazyLoad: boolean;
    preload: boolean;
    stripMetadata: boolean;
    compressAssets: boolean;
  };
  expectedResults: {
    sizeReduction: string;
    performanceGain: string;
    compatibility: string;
    risk: string;
  };
}

export const OptimizationPresets: React.FC = () => {
  const presets: Preset[] = [
    {
      id: 'conservative',
      name: 'Conservative',
      description: 'Safe optimizations with maximum compatibility',
      icon: <Shield className="w-8 h-8" />,
      color: 'green',
      settings: {
        imageQuality: 90,
        imageFormat: 'original',
        cssMinify: true,
        jsMinify: false,
        removeComments: true,
        removeConsole: false,
        lazyLoad: false,
        preload: false,
        stripMetadata: true,
        compressAssets: true,
      },
      expectedResults: {
        sizeReduction: '15-25%',
        performanceGain: '10-20%',
        compatibility: '100%',
        risk: 'Very Low',
      },
    },
    {
      id: 'balanced',
      name: 'Balanced',
      description: 'Optimal balance between performance and safety',
      icon: <Target className="w-8 h-8" />,
      color: 'blue',
      settings: {
        imageQuality: 80,
        imageFormat: 'webp',
        cssMinify: true,
        jsMinify: true,
        removeComments: true,
        removeConsole: true,
        lazyLoad: true,
        preload: true,
        stripMetadata: true,
        compressAssets: true,
      },
      expectedResults: {
        sizeReduction: '40-60%',
        performanceGain: '35-50%',
        compatibility: '95%',
        risk: 'Low',
      },
    },
    {
      id: 'aggressive',
      name: 'Aggressive',
      description: 'Maximum optimization for best performance',
      icon: <Zap className="w-8 h-8" />,
      color: 'orange',
      settings: {
        imageQuality: 70,
        imageFormat: 'avif',
        cssMinify: true,
        jsMinify: true,
        removeComments: true,
        removeConsole: true,
        lazyLoad: true,
        preload: true,
        stripMetadata: true,
        compressAssets: true,
      },
      expectedResults: {
        sizeReduction: '60-80%',
        performanceGain: '50-70%',
        compatibility: '85%',
        risk: 'Medium',
      },
    },
  ];

  const [selectedPreset, setSelectedPreset] = useState<Preset['id']>('balanced');
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);

  const handleApplyPreset = async () => {
    setApplying(true);
    // Simulate applying preset
    setTimeout(() => {
      setApplied(true);
      setApplying(false);
      setTimeout(() => setApplied(false), 3000);
    }, 1500);
  };

  const getColorClasses = (color: string) => {
    const colors = {
      green: {
        bg: 'bg-green-50',
        border: 'border-green-200',
        text: 'text-green-700',
        hover: 'hover:border-green-400',
        icon: 'text-green-600',
        button: 'bg-green-600 hover:bg-green-700',
      },
      blue: {
        bg: 'bg-blue-50',
        border: 'border-blue-200',
        text: 'text-blue-700',
        hover: 'hover:border-blue-400',
        icon: 'text-blue-600',
        button: 'bg-blue-600 hover:bg-blue-700',
      },
      orange: {
        bg: 'bg-orange-50',
        border: 'border-orange-200',
        text: 'text-orange-700',
        hover: 'hover:border-orange-400',
        icon: 'text-orange-600',
        button: 'bg-orange-600 hover:bg-orange-700',
      },
    };
    return colors[color as keyof typeof colors];
  };

  return (
    <div className="max-w-6xl mx-auto bg-white rounded-lg shadow-lg p-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-purple-100 rounded-lg">
          <Gauge className="w-6 h-6 text-purple-600" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Optimization Presets</h2>
          <p className="text-gray-600">Choose a preset or customize your optimization strategy</p>
        </div>
      </div>

      {/* Preset Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {presets.map((preset) => {
          const colors = getColorClasses(preset.color);
          const isSelected = selectedPreset === preset.id;

          return (
            <div
              key={preset.id}
              onClick={() => setSelectedPreset(preset.id)}
              className={`relative cursor-pointer border-2 rounded-lg p-6 transition-all ${
                isSelected
                  ? `${colors.border} ${colors.bg} shadow-lg scale-105`
                  : `border-gray-200 hover:border-gray-300 hover:shadow-md`
              }`}
            >
              {isSelected && (
                <div className="absolute -top-3 -right-3 p-1.5 bg-white rounded-full shadow-md">
                  <CheckCircle2 className={`w-6 h-6 ${colors.icon}`} />
                </div>
              )}

              <div className={`inline-flex p-3 rounded-lg mb-4 ${colors.bg}`}>
                <div className={colors.icon}>{preset.icon}</div>
              </div>

              <h3 className="text-xl font-bold text-gray-900 mb-2">{preset.name}</h3>
              <p className="text-sm text-gray-600 mb-4">{preset.description}</p>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Size Reduction:</span>
                  <span className="font-medium text-gray-900">
                    {preset.expectedResults.sizeReduction}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Performance:</span>
                  <span className="font-medium text-gray-900">
                    {preset.expectedResults.performanceGain}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Compatibility:</span>
                  <span className="font-medium text-gray-900">
                    {preset.expectedResults.compatibility}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Risk Level:</span>
                  <span className={`font-medium ${
                    preset.expectedResults.risk === 'Very Low' ? 'text-green-600' :
                    preset.expectedResults.risk === 'Low' ? 'text-blue-600' :
                    'text-orange-600'
                  }`}>
                    {preset.expectedResults.risk}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Selected Preset Details */}
      {selectedPreset && (
        <div className="mb-8">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">
            Configuration Details: {presets.find(p => p.id === selectedPreset)?.name}
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Image Optimization */}
            <div className="bg-gray-50 rounded-lg p-6">
              <h4 className="font-medium text-gray-900 mb-3">Image Optimization</h4>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Quality</span>
                  <span className="font-medium">
                    {presets.find(p => p.id === selectedPreset)?.settings.imageQuality}%
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Format</span>
                  <span className="font-medium uppercase">
                    {presets.find(p => p.id === selectedPreset)?.settings.imageFormat}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Strip Metadata</span>
                  {presets.find(p => p.id === selectedPreset)?.settings.stripMetadata ? (
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                  ) : (
                    <Circle className="w-5 h-5 text-gray-300" />
                  )}
                </div>
              </div>
            </div>

            {/* Code Optimization */}
            <div className="bg-gray-50 rounded-lg p-6">
              <h4 className="font-medium text-gray-900 mb-3">Code Optimization</h4>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">CSS Minification</span>
                  {presets.find(p => p.id === selectedPreset)?.settings.cssMinify ? (
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                  ) : (
                    <Circle className="w-5 h-5 text-gray-300" />
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">JS Minification</span>
                  {presets.find(p => p.id === selectedPreset)?.settings.jsMinify ? (
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                  ) : (
                    <Circle className="w-5 h-5 text-gray-300" />
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Remove Comments</span>
                  {presets.find(p => p.id === selectedPreset)?.settings.removeComments ? (
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                  ) : (
                    <Circle className="w-5 h-5 text-gray-300" />
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Remove Console</span>
                  {presets.find(p => p.id === selectedPreset)?.settings.removeConsole ? (
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                  ) : (
                    <Circle className="w-5 h-5 text-gray-300" />
                  )}
                </div>
              </div>
            </div>

            {/* Loading Strategy */}
            <div className="bg-gray-50 rounded-lg p-6">
              <h4 className="font-medium text-gray-900 mb-3">Loading Strategy</h4>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Lazy Loading</span>
                  {presets.find(p => p.id === selectedPreset)?.settings.lazyLoad ? (
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                  ) : (
                    <Circle className="w-5 h-5 text-gray-300" />
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Resource Preloading</span>
                  {presets.find(p => p.id === selectedPreset)?.settings.preload ? (
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                  ) : (
                    <Circle className="w-5 h-5 text-gray-300" />
                  )}
                </div>
              </div>
            </div>

            {/* Compression */}
            <div className="bg-gray-50 rounded-lg p-6">
              <h4 className="font-medium text-gray-900 mb-3">Compression</h4>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Asset Compression</span>
                  {presets.find(p => p.id === selectedPreset)?.settings.compressAssets ? (
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                  ) : (
                    <Circle className="w-5 h-5 text-gray-300" />
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Comparison Chart */}
      <div className="mb-8 bg-gray-50 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Preset Comparison</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 font-medium text-gray-900">Feature</th>
                <th className="text-center py-3 px-4 font-medium text-green-700">Conservative</th>
                <th className="text-center py-3 px-4 font-medium text-blue-700">Balanced</th>
                <th className="text-center py-3 px-4 font-medium text-orange-700">Aggressive</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              <tr>
                <td className="py-3 px-4 text-gray-600">Image Quality</td>
                <td className="py-3 px-4 text-center">90%</td>
                <td className="py-3 px-4 text-center">80%</td>
                <td className="py-3 px-4 text-center">70%</td>
              </tr>
              <tr>
                <td className="py-3 px-4 text-gray-600">Modern Formats</td>
                <td className="py-3 px-4 text-center">❌</td>
                <td className="py-3 px-4 text-center">✅ WebP</td>
                <td className="py-3 px-4 text-center">✅ AVIF</td>
              </tr>
              <tr>
                <td className="py-3 px-4 text-gray-600">JS Minification</td>
                <td className="py-3 px-4 text-center">❌</td>
                <td className="py-3 px-4 text-center">✅</td>
                <td className="py-3 px-4 text-center">✅</td>
              </tr>
              <tr>
                <td className="py-3 px-4 text-gray-600">Lazy Loading</td>
                <td className="py-3 px-4 text-center">❌</td>
                <td className="py-3 px-4 text-center">✅</td>
                <td className="py-3 px-4 text-center">✅</td>
              </tr>
              <tr>
                <td className="py-3 px-4 text-gray-600">Browser Support</td>
                <td className="py-3 px-4 text-center font-medium">100%</td>
                <td className="py-3 px-4 text-center font-medium">95%</td>
                <td className="py-3 px-4 text-center font-medium">85%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Apply Button */}
      <button
        onClick={handleApplyPreset}
        disabled={applying}
        className={`w-full flex items-center justify-center gap-2 px-6 py-3 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${
          getColorClasses(presets.find(p => p.id === selectedPreset)?.color || 'blue').button
        }`}
      >
        {applying ? (
          <>
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
            Applying Preset...
          </>
        ) : applied ? (
          <>
            <CheckCircle2 className="w-5 h-5" />
            Preset Applied!
          </>
        ) : (
          <>
            <Gauge className="w-5 h-5" />
            Apply {presets.find(p => p.id === selectedPreset)?.name} Preset
          </>
        )}
      </button>

      {applied && (
        <div className="mt-6 bg-green-50 border border-green-200 rounded-lg p-4 text-center">
          <p className="text-sm text-green-800">
            ✨ <strong>{presets.find(p => p.id === selectedPreset)?.name}</strong> preset has been applied successfully!
            Your website should see {presets.find(p => p.id === selectedPreset)?.expectedResults.performanceGain} performance improvement.
          </p>
        </div>
      )}
    </div>
  );
};
