import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  Settings,
  Image,
  FileCode,
  Code,
  Type,
  FileText,
  Layout,
  Zap,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type {
  PerformanceIssue,
  OptimizationSettings,
  OptimizationResult,
} from '../../shared/types';

interface IssueWithSelection extends PerformanceIssue {
  selected: boolean;
  expanded: boolean;
}

export default function OptimizationPage() {
  const { projectId } = useParams();

  const [issues, setIssues] = useState<IssueWithSelection[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [results, setResults] = useState<OptimizationResult[]>([]);
  const [activeTab, setActiveTab] = useState<'all' | 'critical' | 'high' | 'medium' | 'low'>('all');
  const [showSettings, setShowSettings] = useState(false);

  // Optimization Settings
  const [settings, setSettings] = useState<OptimizationSettings>({
    images: {
      format: 'auto',
      quality: 85,
      responsive: true,
      lazyLoad: true,
      generateResponsive: true,
      breakpoints: [400, 800, 1200, 1600],
      lazyLoading: true,
      compressionType: 'lossy',
      generateSrcset: true,
    },
    css: {
      minify: true,
      extractCritical: true,
      removeUnused: true,
      inlineCritical: true,
      deferNonCritical: true,
      inline: false,
      inlineThreshold: 14000,
    },
    javascript: {
      minify: true,
      removeConsole: true,
      removeDebugger: true,
      defer: true,
      async: false,
      removeUnused: false,
      splitBundles: false,
    },
    fonts: {
      fontDisplay: 'swap',
      subset: true,
      preload: true,
      selfHost: true,
      format: 'woff2',
      unicodeRange: 'latin',
      subsetCharacters: '',
      preloadStrategy: 'critical',
    },
    html: {
      minify: true,
      removeComments: true,
      addResourceHints: true,
      lazyLoadIframes: true,
      addDimensions: true,
    },
  });

  useEffect(() => {
    fetchIssues();
  }, [projectId]);

  const fetchIssues = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/performance/${projectId}`);
      if (!response.ok) throw new Error('Failed to fetch performance data');

      const data = await response.json();
      const allIssues = [...data.issues, ...data.opportunities];
      setIssues(
        allIssues.map((issue: PerformanceIssue) => ({
          ...issue,
          selected: issue.autoFixable && issue.severity === 'critical',
          expanded: false,
        }))
      );
    } catch (error) {
      console.error('Error fetching issues:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleIssue = (issueId: string) => {
    setIssues((prev) =>
      prev.map((issue) =>
        issue.id === issueId ? { ...issue, selected: !issue.selected } : issue
      )
    );
  };

  const toggleExpand = (issueId: string) => {
    setIssues((prev) =>
      prev.map((issue) =>
        issue.id === issueId ? { ...issue, expanded: !issue.expanded } : issue
      )
    );
  };

  const selectAll = (severity?: string) => {
    setIssues((prev) =>
      prev.map((issue) => ({
        ...issue,
        selected: severity ? issue.severity === severity && issue.autoFixable : issue.autoFixable,
      }))
    );
  };

  const deselectAll = () => {
    setIssues((prev) => prev.map((issue) => ({ ...issue, selected: false })));
  };

  const applyOptimizations = async () => {
    const selectedIssues = issues.filter((issue) => issue.selected);
    if (selectedIssues.length === 0) {
      alert('Please select at least one issue to fix');
      return;
    }

    try {
      setApplying(true);
      const response = await fetch('/api/optimization/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          issues: selectedIssues,
          settings,
        }),
      });

      if (!response.ok) throw new Error('Failed to apply optimizations');

      const optimizationResults = await response.json();
      setResults(optimizationResults);

      // Refresh issues after optimization
      await fetchIssues();

      alert(
        `Successfully applied ${optimizationResults.filter((r: OptimizationResult) => r.success).length} optimizations!`
      );
    } catch (error) {
      console.error('Error applying optimizations:', error);
      alert('Failed to apply optimizations. Please try again.');
    } finally {
      setApplying(false);
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'images':
        return <Image className="w-5 h-5" />;
      case 'css':
        return <FileCode className="w-5 h-5" />;
      case 'javascript':
        return <Code className="w-5 h-5" />;
      case 'fonts':
        return <Type className="w-5 h-5" />;
      case 'html':
        return <FileText className="w-5 h-5" />;
      case 'layout-stability':
        return <Layout className="w-5 h-5" />;
      default:
        return <Zap className="w-5 h-5" />;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical':
        return 'bg-red-100 text-red-800 border-red-300';
      case 'high':
        return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'low':
        return 'bg-gray-100 text-gray-800 border-gray-300';
      default:
        return 'bg-blue-100 text-blue-800 border-blue-300';
    }
  };

  const filteredIssues = issues.filter(
    (issue) => activeTab === 'all' || issue.severity === activeTab
  );

  const selectedCount = issues.filter((i) => i.selected).length;
  const estimatedSavings = issues
    .filter((i) => i.selected)
    .reduce((sum, issue) => sum + ((issue.estimatedSavings?.bytes || 0)), 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Optimization Center</h1>
            <p className="text-gray-600 mt-2">
              Select and apply performance optimizations to your website
            </p>
          </div>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="btn btn-secondary"
          >
            <Settings className="w-5 h-5 mr-2" />
            Settings
          </button>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="p-4 bg-blue-50 rounded-lg">
            <div className="text-2xl font-bold text-blue-600">{issues.length}</div>
            <div className="text-sm text-gray-600">Total Issues</div>
          </div>
          <div className="p-4 bg-green-50 rounded-lg">
            <div className="text-2xl font-bold text-green-600">{selectedCount}</div>
            <div className="text-sm text-gray-600">Selected</div>
          </div>
          <div className="p-4 bg-purple-50 rounded-lg">
            <div className="text-2xl font-bold text-purple-600">
              {issues.filter((i) => i.autoFixable).length}
            </div>
            <div className="text-sm text-gray-600">Auto-Fixable</div>
          </div>
          <div className="p-4 bg-orange-50 rounded-lg">
            <div className="text-2xl font-bold text-orange-600">
              {(estimatedSavings / 1024).toFixed(0)} KB
            </div>
            <div className="text-sm text-gray-600">Est. Savings</div>
          </div>
        </div>

        {/* Bulk Actions */}
        <div className="flex flex-wrap gap-2 mt-6">
          <button onClick={() => selectAll()} className="btn btn-sm btn-secondary">
            Select All Auto-Fixable
          </button>
          <button onClick={() => selectAll('critical')} className="btn btn-sm btn-secondary">
            Select Critical
          </button>
          <button onClick={() => selectAll('high')} className="btn btn-sm btn-secondary">
            Select High Priority
          </button>
          <button onClick={deselectAll} className="btn btn-sm btn-secondary">
            Deselect All
          </button>
          <button
            onClick={applyOptimizations}
            disabled={applying || selectedCount === 0}
            className="btn btn-primary ml-auto"
          >
            {applying ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Applying...
              </>
            ) : (
              <>
                <Zap className="w-5 h-5 mr-2" />
                Apply {selectedCount} Fix{selectedCount !== 1 ? 'es' : ''}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="card">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Optimization Settings</h2>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Image Settings */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                <Image className="w-5 h-5" />
                Image Optimization
              </h3>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Format
                </label>
                <select
                  value={settings.images.format}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      images: { ...prev.images, format: e.target.value as any },
                    }))
                  }
                  className="input"
                >
                  <option value="auto">Auto (AVIF + WebP + fallback)</option>
                  <option value="avif">AVIF only (best compression)</option>
                  <option value="webp">WebP only (good compression)</option>
                  <option value="jpeg">JPEG (original format)</option>
                  <option value="png">PNG (original format)</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  {settings.images.format === 'auto' && 'Generates both AVIF and WebP for maximum compression and browser compatibility'}
                  {settings.images.format === 'avif' && 'AVIF offers best compression but limited browser support (~85%)'}
                  {settings.images.format === 'webp' && 'WebP offers excellent compression with wide browser support (~95%)'}
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Quality Preset
                </label>
                <div className="grid grid-cols-3 gap-2 mb-4">
                  <button
                    onClick={() =>
                      setSettings((prev) => ({
                        ...prev,
                        images: { ...prev.images, quality: 90 },
                      }))
                    }
                    className={`px-3 py-2 text-sm rounded border ${
                      settings.images.quality === 90
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
                    }`}
                  >
                    High (90%)
                  </button>
                  <button
                    onClick={() =>
                      setSettings((prev) => ({
                        ...prev,
                        images: { ...prev.images, quality: 80 },
                      }))
                    }
                    className={`px-3 py-2 text-sm rounded border ${
                      settings.images.quality === 80
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
                    }`}
                  >
                    Medium (80%)
                  </button>
                  <button
                    onClick={() =>
                      setSettings((prev) => ({
                        ...prev,
                        images: { ...prev.images, quality: 60 },
                      }))
                    }
                    className={`px-3 py-2 text-sm rounded border ${
                      settings.images.quality === 60
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
                    }`}
                  >
                    Low (60%)
                  </button>
                </div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Custom Quality: {settings.images.quality}%
                </label>
                <input
                  type="range"
                  min="1"
                  max="100"
                  value={settings.images.quality}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      images: { ...prev.images, quality: parseInt(e.target.value) },
                    }))
                  }
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  <span>Min (1%)</span>
                  <span>Balanced (80%)</span>
                  <span>Max (100%)</span>
                </div>
              </div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.images.generateResponsive}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      images: { ...prev.images, generateResponsive: e.target.checked },
                    }))
                  }
                  className="checkbox"
                />
                <span className="text-sm text-gray-700">Generate responsive sizes (400w, 800w, 1200w, 1600w)</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.images.lazyLoading}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      images: { ...prev.images, lazyLoading: e.target.checked },
                    }))
                  }
                  className="checkbox"
                />
                <span className="text-sm text-gray-700">Enable lazy loading (native browser loading)</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.images.generateBlurPlaceholder}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      images: { ...prev.images, generateBlurPlaceholder: e.target.checked },
                    }))
                  }
                  className="checkbox"
                />
                <span className="text-sm text-gray-700">
                  Generate blur-up placeholders (tiny preview while loading)
                </span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.images.progressive !== false}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      images: { ...prev.images, progressive: e.target.checked },
                    }))
                  }
                  className="checkbox"
                />
                <span className="text-sm text-gray-700">
                  Progressive JPEG (loads top-to-bottom for better UX)
                </span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.images.optimizeSVG !== false}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      images: { ...prev.images, optimizeSVG: e.target.checked },
                    }))
                  }
                  className="checkbox"
                />
                <span className="text-sm text-gray-700">
                  Optimize SVG images (remove metadata, minify paths)
                </span>
              </label>
            </div>

            {/* CSS Settings */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                <FileCode className="w-5 h-5" />
                CSS Optimization
              </h3>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.css.minify}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      css: { ...prev.css, minify: e.target.checked },
                    }))
                  }
                  className="checkbox"
                />
                <span className="text-sm text-gray-700">Minify CSS</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.css.extractCritical}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      css: { ...prev.css, extractCritical: e.target.checked },
                    }))
                  }
                  className="checkbox"
                />
                <span className="text-sm text-gray-700">Extract critical CSS</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.css.removeUnused}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      css: { ...prev.css, removeUnused: e.target.checked },
                    }))
                  }
                  className="checkbox"
                />
                <span className="text-sm text-gray-700">Remove unused CSS (PurgeCSS)</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.css.deferNonCritical}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      css: { ...prev.css, deferNonCritical: e.target.checked },
                    }))
                  }
                  className="checkbox"
                />
                <span className="text-sm text-gray-700">Defer non-critical CSS</span>
              </label>
            </div>

            {/* JavaScript Settings */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                <Code className="w-5 h-5" />
                JavaScript Optimization
              </h3>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.javascript.minify}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      javascript: { ...prev.javascript, minify: e.target.checked },
                    }))
                  }
                  className="checkbox"
                />
                <span className="text-sm text-gray-700">Minify JavaScript</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.javascript.removeConsole}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      javascript: { ...prev.javascript, removeConsole: e.target.checked },
                    }))
                  }
                  className="checkbox"
                />
                <span className="text-sm text-gray-700">Remove console statements</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.javascript.defer}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      javascript: { ...prev.javascript, defer: e.target.checked },
                    }))
                  }
                  className="checkbox"
                />
                <span className="text-sm text-gray-700">Defer JavaScript loading</span>
              </label>
            </div>

            {/* Font Settings */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
                <Type className="w-5 h-5" />
                Font Optimization
              </h3>

              {/* Font Display */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Font Display Strategy
                </label>
                <select
                  value={settings.fonts.fontDisplay}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      fonts: { ...prev.fonts, fontDisplay: e.target.value as any },
                    }))
                  }
                  className="input"
                >
                  <option value="swap">Swap (recommended - shows fallback instantly)</option>
                  <option value="optional">Optional (skip if font takes too long)</option>
                  <option value="fallback">Fallback (short block, then swap)</option>
                  <option value="block">Block (wait for font to load)</option>
                  <option value="auto">Auto (browser decides)</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  Controls how text is displayed while custom fonts are loading
                </p>
              </div>

              {/* Font Format */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Font Format
                </label>
                <select
                  value={settings.fonts.format}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      fonts: { ...prev.fonts, format: e.target.value as any },
                    }))
                  }
                  className="input"
                >
                  <option value="woff2">WOFF2 (best compression, recommended)</option>
                  <option value="woff">WOFF (good browser support)</option>
                  <option value="ttf">TTF (original format)</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">
                  WOFF2 offers ~30% better compression than WOFF with 95%+ browser support
                </p>
              </div>

              {/* Subsetting */}
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.fonts.subset}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      fonts: { ...prev.fonts, subset: e.target.checked },
                    }))
                  }
                  className="checkbox"
                />
                <span className="text-sm text-gray-700">
                  Enable font subsetting (include only used characters)
                </span>
              </label>

              {/* Unicode Range - Only show if subsetting is enabled */}
              {settings.fonts.subset && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Unicode Range
                  </label>
                  <select
                    value={settings.fonts.unicodeRange || 'latin'}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        fonts: { ...prev.fonts, unicodeRange: e.target.value },
                      }))
                    }
                    className="input"
                  >
                    <option value="latin">Latin (A-Z, 0-9, basic punctuation)</option>
                    <option value="latin-ext">Latin Extended (includes accents)</option>
                    <option value="cyrillic">Cyrillic (Russian, Ukrainian, etc.)</option>
                    <option value="cyrillic-ext">Cyrillic Extended</option>
                    <option value="greek">Greek</option>
                    <option value="greek-ext">Greek Extended</option>
                    <option value="vietnamese">Vietnamese</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    Reduces font file size by including only characters for selected languages
                  </p>
                </div>
              )}

              {/* Custom Subset Characters - Only show if subsetting is enabled */}
              {settings.fonts.subset && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Custom Characters (optional)
                  </label>
                  <input
                    type="text"
                    value={settings.fonts.subsetCharacters || ''}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        fonts: { ...prev.fonts, subsetCharacters: e.target.value },
                      }))
                    }
                    placeholder="e.g., ABCabc123!@#"
                    className="input"
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Specify exact characters to include in the font subset
                  </p>
                </div>
              )}

              {/* Preloading */}
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.fonts.preload}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      fonts: { ...prev.fonts, preload: e.target.checked },
                    }))
                  }
                  className="checkbox"
                />
                <span className="text-sm text-gray-700">Enable font preloading</span>
              </label>

              {/* Preload Strategy - Only show if preloading is enabled */}
              {settings.fonts.preload && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Preload Strategy
                  </label>
                  <select
                    value={settings.fonts.preloadStrategy || 'critical'}
                    onChange={(e) =>
                      setSettings((prev) => ({
                        ...prev,
                        fonts: { ...prev.fonts, preloadStrategy: e.target.value as any },
                      }))
                    }
                    className="input"
                  >
                    <option value="critical">Critical Only (1-2 fonts, recommended)</option>
                    <option value="all">All Fonts (not recommended)</option>
                    <option value="none">None (disable preloading)</option>
                  </select>
                  <p className="text-xs text-gray-500 mt-1">
                    Critical: Preloads only body and heading fonts for best performance
                  </p>
                </div>
              )}

              {/* Self-hosting */}
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={settings.fonts.selfHost}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      fonts: { ...prev.fonts, selfHost: e.target.checked },
                    }))
                  }
                  className="checkbox"
                />
                <span className="text-sm text-gray-700">
                  Self-host Google Fonts (remove external requests)
                </span>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Issue Tabs */}
      <div className="card">
        <div className="flex gap-2 mb-6 border-b">
          {(['all', 'critical', 'high', 'medium', 'low'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 font-medium capitalize transition-colors ${
                activeTab === tab
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab} ({issues.filter((i) => tab === 'all' || i.severity === tab).length})
            </button>
          ))}
        </div>

        {/* Issues List */}
        <div className="space-y-4">
          {filteredIssues.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-4" />
              <p className="text-gray-600">No {activeTab !== 'all' ? activeTab : ''} issues found!</p>
            </div>
          ) : (
            filteredIssues.map((issue) => (
              <div
                key={issue.id}
                className={`border rounded-lg p-4 transition-all ${
                  issue.selected ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                }`}
              >
                <div className="flex items-start gap-4">
                  <input
                    type="checkbox"
                    checked={issue.selected}
                    onChange={() => toggleIssue(issue.id)}
                    disabled={!issue.autoFixable}
                    className="checkbox mt-1"
                  />

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <div className="text-gray-600">{getCategoryIcon(issue.category)}</div>
                      <h3 className="font-semibold text-gray-900">{issue.title}</h3>
                      <span
                        className={`px-2 py-1 text-xs font-medium rounded-full ${getSeverityColor(
                          issue.severity
                        )}`}
                      >
                        {issue.severity}
                      </span>
                      {issue.autoFixable && (
                        <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">
                          Auto-fixable
                        </span>
                      )}
                    </div>

                    <p className="text-gray-600 text-sm mb-2">{issue.description}</p>

                    <div className="flex items-center gap-4 text-sm">
                      {issue.impact && (
                        <span className="text-gray-500">Impact: {issue.impact}/10</span>
                      )}
                      {issue.estimatedSavings?.bytes && (
                        <span className="text-green-600 font-medium">
                          ~{(issue.estimatedSavings.bytes / 1024).toFixed(0)} KB savings
                        </span>
                      )}
                    </div>

                    {issue.suggestedFix && (
                      <button
                        onClick={() => toggleExpand(issue.id)}
                        className="mt-2 text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                      >
                        {issue.expanded ? (
                          <>
                            <ChevronUp className="w-4 h-4" />
                            Hide Details
                          </>
                        ) : (
                          <>
                            <ChevronDown className="w-4 h-4" />
                            Show Suggested Fix
                          </>
                        )}
                      </button>
                    )}

                    {issue.expanded && issue.suggestedFix && (
                      <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                        <h4 className="font-medium text-gray-900 mb-2">Suggested Fix:</h4>
                        <pre className="text-sm text-gray-700 whitespace-pre-wrap bg-white p-3 rounded border">
                          {issue.suggestedFix}
                        </pre>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Results Panel */}
      {results.length > 0 && (
        <div className="card">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">Optimization Results</h2>
          <div className="space-y-4">
            {results.map((result, idx) => (
              <div
                key={idx}
                className={`p-4 rounded-lg border ${
                  result.success
                    ? 'bg-green-50 border-green-300'
                    : 'bg-red-50 border-red-300'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  {result.success ? (
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                  ) : (
                    <AlertCircle className="w-5 h-5 text-red-600" />
                  )}
                  <span className="font-medium">
                    {result.success ? 'Success' : 'Failed'}
                  </span>
                </div>
                {result.error && <p className="text-sm text-red-700">{result.error}</p>}
                {result.changes && result.changes.length > 0 && (
                  <div className="mt-2">
                    <p className="text-sm font-medium mb-1">Changes:</p>
                    <ul className="list-disc list-inside text-sm text-gray-700">
                      {result.changes.map((change, cIdx) => (
                        <li key={cIdx}>{change.description}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
