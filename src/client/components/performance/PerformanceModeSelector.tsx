/**
 * Performance Mode Selector Component
 *
 * Allows users to select optimization modes:
 * - Safe: Only guaranteed safe optimizations
 * - Balanced: Best balance (recommended)
 * - Aggressive: Maximum optimization
 * - Custom: Manual selection
 */

import React, { useState } from 'react';
import { Info, Shield, Zap, Sliders, AlertCircle, ChevronDown, ChevronUp } from 'lucide-react';

export type OptimizationMode = 'safe' | 'balanced' | 'aggressive' | 'custom';

export interface PerformanceModeProps {
  mode: OptimizationMode;
  onModeChange: (mode: OptimizationMode) => void;
  selectedFixes?: string[];
  onFixesChange?: (fixes: string[]) => void;
}

interface ModeData {
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  title: string;
  description: string;
  fixes: string[];
  warning: string | null;
}

const OPTIMIZATION_MODES: Record<OptimizationMode, ModeData> = {
  safe: {
    icon: Shield,
    color: 'text-green-600 bg-green-50 border-green-200',
    title: 'Safe Mode',
    description: 'Only guaranteed safe optimizations. No visual changes.',
    fixes: [
      'HTML minification',
      'Add image dimensions (CLS fix)',
      'Lazy loading for below-fold images',
      'Add loading="lazy" to iframes',
      'Defer non-critical JavaScript',
      'Preconnect to external domains',
      'Basic CSS minification'
    ],
    warning: null
  },
  balanced: {
    icon: Info,
    color: 'text-blue-600 bg-blue-50 border-blue-200',
    title: 'Balanced Mode',
    description: 'Best balance of optimization and safety. Recommended for most sites.',
    fixes: [
      'All Safe Mode fixes',
      'Convert images to WebP (with fallbacks)',
      'Generate responsive srcset',
      'Extract and inline critical CSS',
      'Remove unused CSS',
      'Font optimization (font-display: swap)',
      'Self-host Google Fonts',
      'JavaScript tree shaking',
      'Compress images (80% quality)'
    ],
    warning: 'Test on staging environment first'
  },
  aggressive: {
    icon: Zap,
    color: 'text-orange-600 bg-orange-50 border-orange-200',
    title: 'Aggressive Mode',
    description: 'Maximum optimization. May require manual testing.',
    fixes: [
      'All Balanced Mode fixes',
      'Aggressive image compression (70% quality)',
      'Convert images to AVIF (with WebP fallback)',
      'Remove ALL unused CSS (may affect dynamic content)',
      'Inline all critical resources',
      'Aggressive JavaScript minification',
      'Combine multiple CSS/JS files',
      'Font subsetting (may break special characters)',
      'Remove comments and whitespace',
      'Optimize SVG paths'
    ],
    warning: '⚠️ CAUTION: May affect site functionality. Always test thoroughly.'
  },
  custom: {
    icon: Sliders,
    color: 'text-purple-600 bg-purple-50 border-purple-200',
    title: 'Custom Mode',
    description: 'Choose specific optimizations manually.',
    fixes: [],
    warning: 'Select optimizations below'
  }
};

export const PerformanceModeSelector: React.FC<PerformanceModeProps> = ({
  mode,
  onModeChange,
  selectedFixes = [],
  onFixesChange
}) => {
  const [showFixDetails, setShowFixDetails] = useState(false);

  const currentMode = OPTIMIZATION_MODES[mode];
  const ModeIcon = currentMode.icon;

  return (
    <div className="space-y-6">
      {/* Mode Selection Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {(Object.entries(OPTIMIZATION_MODES) as [OptimizationMode, ModeData][]).map(([key, modeData]) => {
          const Icon = modeData.icon;
          const isSelected = mode === key;

          return (
            <button
              key={key}
              onClick={() => onModeChange(key)}
              className={`
                p-6 rounded-lg border-2 transition-all text-left
                hover:shadow-md focus:outline-none focus:ring-2 focus:ring-offset-2
                ${isSelected
                  ? `${modeData.color} border-current shadow-md`
                  : 'border-gray-200 hover:border-gray-300 bg-white'
                }
              `}
            >
              <Icon className={`h-8 w-8 mb-3 ${isSelected ? 'text-current' : 'text-gray-400'}`} />
              <h3 className="font-semibold mb-2 text-gray-900">{modeData.title}</h3>
              <p className="text-sm text-gray-600">{modeData.description}</p>

              {isSelected && (
                <div className="mt-3 flex items-center text-sm font-medium">
                  <span className="inline-block w-2 h-2 rounded-full bg-current mr-2"></span>
                  Selected
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Current Mode Details */}
      <div className={`p-6 rounded-lg border-2 ${currentMode.color}`}>
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <ModeIcon className="h-6 w-6" />
            <h3 className="text-lg font-semibold">{currentMode.title}</h3>
          </div>

          {currentMode.warning && (
            <div className="flex items-center gap-2 text-sm bg-white bg-opacity-50 px-3 py-1 rounded">
              <AlertCircle className="h-4 w-4" />
              <span>{currentMode.warning}</span>
            </div>
          )}
        </div>

        {mode !== 'custom' && (
          <>
            <p className="text-sm mb-4">{currentMode.description}</p>

            <div className="space-y-2">
              <button
                onClick={() => setShowFixDetails(!showFixDetails)}
                className="flex items-center gap-2 text-sm font-medium hover:underline focus:outline-none"
              >
                {showFixDetails ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
                {showFixDetails ? 'Hide' : 'Show'} optimizations included ({currentMode.fixes.length})
              </button>

              {showFixDetails && (
                <ul className="space-y-1 mt-3 bg-white bg-opacity-50 p-4 rounded">
                  {currentMode.fixes.map((fix, index) => (
                    <li key={index} className="flex items-center gap-2 text-sm">
                      <span className="h-1.5 w-1.5 rounded-full bg-current flex-shrink-0" />
                      {fix}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}

        {mode === 'custom' && onFixesChange && (
          <CustomFixSelector
            selectedFixes={selectedFixes}
            onFixesChange={onFixesChange}
          />
        )}
      </div>

      {/* Performance Impact Estimate */}
      <PerformanceImpactEstimate mode={mode} selectedFixes={selectedFixes} />
    </div>
  );
};

// Custom Fix Selector Component
interface CustomFixSelectorProps {
  selectedFixes: string[];
  onFixesChange: (fixes: string[]) => void;
}

const ALL_AVAILABLE_FIXES = [
  {
    category: 'Images',
    fixes: [
      { id: 'webp-conversion', name: 'Convert to WebP', impact: 'high' as const, risk: 'low' as const },
      { id: 'avif-conversion', name: 'Convert to AVIF', impact: 'high' as const, risk: 'medium' as const },
      { id: 'responsive-srcset', name: 'Generate responsive srcset', impact: 'high' as const, risk: 'low' as const },
      { id: 'lazy-loading', name: 'Lazy loading', impact: 'medium' as const, risk: 'low' as const },
      { id: 'image-dimensions', name: 'Add dimensions (CLS fix)', impact: 'high' as const, risk: 'low' as const },
      { id: 'compress-images-80', name: 'Compress (80% quality)', impact: 'medium' as const, risk: 'low' as const },
      { id: 'compress-images-70', name: 'Compress (70% quality)', impact: 'high' as const, risk: 'medium' as const },
      { id: 'blur-placeholder', name: 'Blur placeholders', impact: 'low' as const, risk: 'low' as const },
    ]
  },
  {
    category: 'CSS',
    fixes: [
      { id: 'critical-css', name: 'Extract critical CSS', impact: 'high' as const, risk: 'low' as const },
      { id: 'remove-unused-css', name: 'Remove unused CSS', impact: 'high' as const, risk: 'medium' as const },
      { id: 'minify-css', name: 'Minify CSS', impact: 'medium' as const, risk: 'low' as const },
      { id: 'defer-css', name: 'Defer non-critical CSS', impact: 'medium' as const, risk: 'low' as const },
      { id: 'combine-css', name: 'Combine CSS files', impact: 'low' as const, risk: 'medium' as const },
    ]
  },
  {
    category: 'JavaScript',
    fixes: [
      { id: 'defer-js', name: 'Defer JavaScript', impact: 'high' as const, risk: 'low' as const },
      { id: 'minify-js', name: 'Minify JavaScript', impact: 'medium' as const, risk: 'low' as const },
      { id: 'tree-shaking', name: 'Tree shaking', impact: 'medium' as const, risk: 'low' as const },
      { id: 'remove-unused-js', name: 'Remove unused JS', impact: 'high' as const, risk: 'high' as const },
      { id: 'combine-js', name: 'Combine JS files', impact: 'low' as const, risk: 'medium' as const },
    ]
  },
  {
    category: 'Fonts',
    fixes: [
      { id: 'font-display-swap', name: 'font-display: swap', impact: 'high' as const, risk: 'low' as const },
      { id: 'self-host-fonts', name: 'Self-host Google Fonts', impact: 'medium' as const, risk: 'low' as const },
      { id: 'font-subsetting', name: 'Font subsetting', impact: 'medium' as const, risk: 'medium' as const },
      { id: 'preload-fonts', name: 'Preload critical fonts', impact: 'low' as const, risk: 'low' as const },
    ]
  },
  {
    category: 'HTML',
    fixes: [
      { id: 'minify-html', name: 'Minify HTML', impact: 'low' as const, risk: 'low' as const },
      { id: 'resource-hints', name: 'Add resource hints', impact: 'medium' as const, risk: 'low' as const },
      { id: 'lazy-iframes', name: 'Lazy load iframes', impact: 'medium' as const, risk: 'low' as const },
    ]
  }
];

const CustomFixSelector: React.FC<CustomFixSelectorProps> = ({ selectedFixes, onFixesChange }) => {
  const toggleFix = (fixId: string) => {
    if (selectedFixes.includes(fixId)) {
      onFixesChange(selectedFixes.filter(id => id !== fixId));
    } else {
      onFixesChange([...selectedFixes, fixId]);
    }
  };

  return (
    <div className="space-y-6 mt-4">
      {ALL_AVAILABLE_FIXES.map(category => (
        <div key={category.category}>
          <h4 className="font-semibold mb-3 text-gray-900">{category.category}</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {category.fixes.map(fix => (
              <label
                key={fix.id}
                className="flex items-start gap-3 p-3 bg-white rounded border border-gray-200 hover:border-gray-300 cursor-pointer transition-colors"
              >
                <input
                  type="checkbox"
                  checked={selectedFixes.includes(fix.id)}
                  onChange={() => toggleFix(fix.id)}
                  className="mt-1 h-4 w-4 text-purple-600 border-gray-300 rounded focus:ring-purple-500"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-sm font-medium text-gray-900">{fix.name}</span>
                    <FixImpactBadge impact={fix.impact} />
                    <FixRiskBadge risk={fix.risk} />
                  </div>
                </div>
              </label>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

// Helper Components
const FixImpactBadge: React.FC<{ impact: 'low' | 'medium' | 'high' }> = ({ impact }) => {
  const colors = {
    low: 'bg-gray-100 text-gray-600',
    medium: 'bg-blue-100 text-blue-600',
    high: 'bg-green-100 text-green-600'
  };

  return (
    <span className={`text-xs px-2 py-0.5 rounded font-medium ${colors[impact]}`}>
      {impact} impact
    </span>
  );
};

const FixRiskBadge: React.FC<{ risk: 'low' | 'medium' | 'high' }> = ({ risk }) => {
  const colors = {
    low: 'bg-green-100 text-green-600',
    medium: 'bg-yellow-100 text-yellow-600',
    high: 'bg-red-100 text-red-600'
  };

  return (
    <span className={`text-xs px-2 py-0.5 rounded font-medium ${colors[risk]}`}>
      {risk} risk
    </span>
  );
};

const PerformanceImpactEstimate: React.FC<{
  mode: OptimizationMode;
  selectedFixes?: string[];
}> = ({ mode, selectedFixes = [] }) => {
  const estimates = {
    safe: { score: '+10-15', size: '-20-30%', time: '-15-25%' },
    balanced: { score: '+30-40', size: '-40-50%', time: '-35-45%' },
    aggressive: { score: '+50-60', size: '-60-70%', time: '-50-60%' },
    custom: calculateCustomEstimate(selectedFixes)
  };

  const estimate = estimates[mode];

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h3 className="text-lg font-semibold mb-4 text-gray-900">Expected Impact</h3>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 bg-gradient-to-br from-green-50 to-green-100 rounded-lg border border-green-200">
          <div className="text-sm text-green-700 mb-1 font-medium">Lighthouse Score</div>
          <div className="text-3xl font-bold text-green-600">{estimate.score}</div>
          <div className="text-xs text-green-600 mt-1">points increase</div>
        </div>

        <div className="p-4 bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg border border-blue-200">
          <div className="text-sm text-blue-700 mb-1 font-medium">File Size</div>
          <div className="text-3xl font-bold text-blue-600">{estimate.size}</div>
          <div className="text-xs text-blue-600 mt-1">reduction</div>
        </div>

        <div className="p-4 bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg border border-purple-200">
          <div className="text-sm text-purple-700 mb-1 font-medium">Load Time</div>
          <div className="text-3xl font-bold text-purple-600">{estimate.time}</div>
          <div className="text-xs text-purple-600 mt-1">faster</div>
        </div>
      </div>
    </div>
  );
};

// Calculate impact for custom mode based on selected fixes
function calculateCustomEstimate(selectedFixes: string[]): { score: string; size: string; time: string } {
  if (selectedFixes.length === 0) {
    return { score: '+0', size: '0%', time: '0%' };
  }

  // Rough impact calculation based on fix types
  const impactWeights: Record<string, { score: number; size: number; time: number }> = {
    'webp-conversion': { score: 5, size: 15, time: 10 },
    'avif-conversion': { score: 7, size: 20, time: 15 },
    'responsive-srcset': { score: 3, size: 5, time: 5 },
    'lazy-loading': { score: 5, size: 0, time: 10 },
    'image-dimensions': { score: 5, size: 0, time: 5 },
    'compress-images-80': { score: 3, size: 10, time: 8 },
    'compress-images-70': { score: 5, size: 15, time: 12 },
    'critical-css': { score: 8, size: 5, time: 15 },
    'remove-unused-css': { score: 5, size: 20, time: 10 },
    'minify-css': { score: 2, size: 10, time: 5 },
    'defer-js': { score: 8, size: 0, time: 15 },
    'minify-js': { score: 2, size: 15, time: 5 },
    'tree-shaking': { score: 3, size: 10, time: 5 },
    'font-display-swap': { score: 5, size: 0, time: 8 },
    'self-host-fonts': { score: 3, size: 2, time: 5 },
    'minify-html': { score: 1, size: 5, time: 2 },
    'resource-hints': { score: 3, size: 0, time: 5 }
  };

  let totalScore = 0;
  let totalSize = 0;
  let totalTime = 0;

  selectedFixes.forEach(fix => {
    const weight = impactWeights[fix];
    if (weight) {
      totalScore += weight.score;
      totalSize += weight.size;
      totalTime += weight.time;
    }
  });

  return {
    score: `+${Math.round(totalScore)}`,
    size: `-${Math.round(totalSize)}%`,
    time: `-${Math.round(totalTime)}%`
  };
}

export default PerformanceModeSelector;
