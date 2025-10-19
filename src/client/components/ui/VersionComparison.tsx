import React, { useState, useEffect } from 'react';
import {
  GitCompare,
  ArrowRight,
  Plus,
  Minus,
  AlertCircle,
  FileText,
  Code,
  Image as ImageIcon,
  Loader,
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
} from 'lucide-react';

interface ComparisonResult {
  versionA: {
    id: string;
    name: string;
    createdAt: string;
  };
  versionB: {
    id: string;
    name: string;
    createdAt: string;
  };
  summary: {
    totalChanges: number;
    htmlChanges: number;
    cssChanges: number;
    jsChanges: number;
    assetChanges: number;
    similarity: number;
  };
  htmlDiff: FileDiff;
  cssDiff: FileDiff;
  jsDiff: FileDiff;
  assetDiffs: AssetDiff[];
  structuralChanges: StructuralChange[];
  visualChanges: VisualChange[];
}

interface FileDiff {
  hasChanges: boolean;
  additions: number;
  deletions: number;
  modifications: number;
  hunks: DiffHunk[];
  unifiedDiff: string;
}

interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  changes: DiffChange[];
}

interface DiffChange {
  type: 'add' | 'remove' | 'normal';
  lineNumber: number;
  content: string;
}

interface AssetDiff {
  path: string;
  type: 'added' | 'removed' | 'modified' | 'unchanged';
  oldSize?: number;
  newSize?: number;
  sizeChange?: number;
  percentChange?: number;
}

interface StructuralChange {
  type: 'element_added' | 'element_removed' | 'element_modified' | 'attribute_changed';
  selector: string;
  description: string;
  oldValue?: string;
  newValue?: string;
  impact: 'low' | 'medium' | 'high';
}

interface VisualChange {
  type: 'layout' | 'styling' | 'content' | 'media';
  selector: string;
  property: string;
  oldValue: string;
  newValue: string;
  description: string;
}

interface VersionComparisonProps {
  projectId: string;
  versionIdA: string;
  versionIdB: string;
  onClose?: () => void;
}

export const VersionComparison: React.FC<VersionComparisonProps> = ({
  projectId,
  versionIdA,
  versionIdB,
  onClose,
}) => {
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'summary' | 'html' | 'css' | 'js' | 'assets' | 'structural'>('summary');
  const [expandedHunks, setExpandedHunks] = useState<Set<string>>(new Set());
  const [showUnchanged, setShowUnchanged] = useState(false);

  useEffect(() => {
    loadComparison();
  }, [projectId, versionIdA, versionIdB]);

  const loadComparison = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/collaboration/versions/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, versionIdA, versionIdB }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to compare versions');
      }

      setComparison(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Comparison failed');
    } finally {
      setLoading(false);
    }
  };

  const toggleHunk = (hunkId: string) => {
    setExpandedHunks((prev) => {
      const next = new Set(prev);
      if (next.has(hunkId)) {
        next.delete(hunkId);
      } else {
        next.add(hunkId);
      }
      return next;
    });
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleString();
  };

  const getImpactColor = (impact: 'low' | 'medium' | 'high') => {
    switch (impact) {
      case 'high':
        return 'bg-red-100 text-red-700 border-red-200';
      case 'medium':
        return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'low':
        return 'bg-green-100 text-green-700 border-green-200';
    }
  };

  const renderDiffLine = (change: DiffChange) => {
    const bgColor =
      change.type === 'add'
        ? 'bg-green-50'
        : change.type === 'remove'
        ? 'bg-red-50'
        : 'bg-white';

    const textColor =
      change.type === 'add'
        ? 'text-green-700'
        : change.type === 'remove'
        ? 'text-red-700'
        : 'text-gray-700';

    const marker =
      change.type === 'add' ? '+' : change.type === 'remove' ? '-' : ' ';

    return (
      <div key={`${change.lineNumber}-${change.type}`} className={`flex font-mono text-xs ${bgColor}`}>
        <span className={`w-12 flex-shrink-0 text-right pr-4 text-gray-400 select-none`}>
          {change.lineNumber}
        </span>
        <span className={`w-6 flex-shrink-0 ${textColor} font-bold`}>{marker}</span>
        <span className={`flex-1 ${textColor}`}>{change.content}</span>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  if (error || !comparison) {
    return (
      <div className="max-w-6xl mx-auto bg-white rounded-lg shadow-lg p-8">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-semibold text-red-900 mb-1">Error</h4>
              <p className="text-sm text-red-800">{error || 'Failed to load comparison'}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto bg-white rounded-lg shadow-lg p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-purple-100 rounded-lg">
            <GitCompare className="w-6 h-6 text-purple-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Version Comparison</h2>
            <div className="flex items-center gap-2 text-sm text-gray-600 mt-1">
              <span className="font-medium">{comparison.versionA.name}</span>
              <ArrowRight className="w-4 h-4" />
              <span className="font-medium">{comparison.versionB.name}</span>
            </div>
          </div>
        </div>

        {onClose && (
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:text-gray-900 transition-colors"
          >
            Close
          </button>
        )}
      </div>

      {/* Similarity Score */}
      <div className="mb-6 p-4 bg-gradient-to-r from-purple-50 to-indigo-50 rounded-lg border border-purple-200">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Similarity Score</h3>
            <p className="text-sm text-gray-600">
              {comparison.summary.totalChanges} total changes detected
            </p>
          </div>
          <div className="text-right">
            <div className="text-4xl font-bold text-purple-600">
              {comparison.summary.similarity}%
            </div>
            <p className="text-sm text-gray-600">similar</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 mb-6">
        <div className="flex gap-2 overflow-x-auto">
          {[
            { id: 'summary', label: 'Summary', count: comparison.summary.totalChanges },
            { id: 'html', label: 'HTML', count: comparison.summary.htmlChanges },
            { id: 'css', label: 'CSS', count: comparison.summary.cssChanges },
            { id: 'js', label: 'JavaScript', count: comparison.summary.jsChanges },
            { id: 'assets', label: 'Assets', count: comparison.summary.assetChanges },
            { id: 'structural', label: 'Structure', count: comparison.structuralChanges.length },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'text-purple-700 border-b-2 border-purple-700'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab.label}
              {tab.count > 0 && (
                <span className="ml-2 px-2 py-0.5 bg-gray-200 rounded-full text-xs">
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Tab */}
      {activeTab === 'summary' && (
        <div className="space-y-6">
          {/* Change Statistics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Plus className="w-5 h-5 text-green-600" />
                <span className="text-sm font-medium text-green-900">Additions</span>
              </div>
              <div className="text-3xl font-bold text-green-700">
                {comparison.htmlDiff.additions +
                  comparison.cssDiff.additions +
                  comparison.jsDiff.additions}
              </div>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Minus className="w-5 h-5 text-red-600" />
                <span className="text-sm font-medium text-red-900">Deletions</span>
              </div>
              <div className="text-3xl font-bold text-red-700">
                {comparison.htmlDiff.deletions +
                  comparison.cssDiff.deletions +
                  comparison.jsDiff.deletions}
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="w-5 h-5 text-blue-600" />
                <span className="text-sm font-medium text-blue-900">Files Changed</span>
              </div>
              <div className="text-3xl font-bold text-blue-700">
                {[comparison.htmlDiff, comparison.cssDiff, comparison.jsDiff].filter((d) => d.hasChanges).length}
              </div>
            </div>

            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <ImageIcon className="w-5 h-5 text-purple-600" />
                <span className="text-sm font-medium text-purple-900">Assets</span>
              </div>
              <div className="text-3xl font-bold text-purple-700">
                {comparison.assetDiffs.filter((a) => a.type !== 'unchanged').length}
              </div>
            </div>
          </div>

          {/* File Changes Summary */}
          <div className="space-y-3">
            <h3 className="font-semibold text-gray-900">Files Changed</h3>
            {comparison.htmlDiff.hasChanges && (
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <FileText className="w-5 h-5 text-gray-600" />
                  <span className="font-medium">index.html</span>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-green-600">+{comparison.htmlDiff.additions}</span>
                  <span className="text-red-600">-{comparison.htmlDiff.deletions}</span>
                </div>
              </div>
            )}
            {comparison.cssDiff.hasChanges && (
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <Code className="w-5 h-5 text-gray-600" />
                  <span className="font-medium">styles.css</span>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-green-600">+{comparison.cssDiff.additions}</span>
                  <span className="text-red-600">-{comparison.cssDiff.deletions}</span>
                </div>
              </div>
            )}
            {comparison.jsDiff.hasChanges && (
              <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center gap-3">
                  <Code className="w-5 h-5 text-gray-600" />
                  <span className="font-medium">script.js</span>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="text-green-600">+{comparison.jsDiff.additions}</span>
                  <span className="text-red-600">-{comparison.jsDiff.deletions}</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* HTML Diff Tab */}
      {activeTab === 'html' && (
        <div>
          {comparison.htmlDiff.hasChanges ? (
            <div className="space-y-4">
              {comparison.htmlDiff.hunks.map((hunk, index) => {
                const hunkId = `html-${index}`;
                const isExpanded = expandedHunks.has(hunkId);

                return (
                  <div key={hunkId} className="border border-gray-200 rounded-lg overflow-hidden">
                    <button
                      onClick={() => toggleHunk(hunkId)}
                      className="w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                        <span className="text-sm font-medium">
                          Lines {hunk.newStart} - {hunk.newStart + hunk.newLines}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-xs">
                        <span className="text-green-600">
                          +{hunk.changes.filter((c) => c.type === 'add').length}
                        </span>
                        <span className="text-red-600">
                          -{hunk.changes.filter((c) => c.type === 'remove').length}
                        </span>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-gray-200">
                        {hunk.changes
                          .filter((c) => showUnchanged || c.type !== 'normal')
                          .map((change) => renderDiffLine(change))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-600">No HTML changes detected</div>
          )}
        </div>
      )}

      {/* CSS Diff Tab */}
      {activeTab === 'css' && (
        <div>
          {comparison.cssDiff.hasChanges ? (
            <div className="space-y-4">
              {comparison.cssDiff.hunks.map((hunk, index) => {
                const hunkId = `css-${index}`;
                const isExpanded = expandedHunks.has(hunkId);

                return (
                  <div key={hunkId} className="border border-gray-200 rounded-lg overflow-hidden">
                    <button
                      onClick={() => toggleHunk(hunkId)}
                      className="w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                        <span className="text-sm font-medium">
                          Lines {hunk.newStart} - {hunk.newStart + hunk.newLines}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-xs">
                        <span className="text-green-600">
                          +{hunk.changes.filter((c) => c.type === 'add').length}
                        </span>
                        <span className="text-red-600">
                          -{hunk.changes.filter((c) => c.type === 'remove').length}
                        </span>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-gray-200">
                        {hunk.changes
                          .filter((c) => showUnchanged || c.type !== 'normal')
                          .map((change) => renderDiffLine(change))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-600">No CSS changes detected</div>
          )}
        </div>
      )}

      {/* JavaScript Diff Tab */}
      {activeTab === 'js' && (
        <div>
          {comparison.jsDiff.hasChanges ? (
            <div className="space-y-4">
              {comparison.jsDiff.hunks.map((hunk, index) => {
                const hunkId = `js-${index}`;
                const isExpanded = expandedHunks.has(hunkId);

                return (
                  <div key={hunkId} className="border border-gray-200 rounded-lg overflow-hidden">
                    <button
                      onClick={() => toggleHunk(hunkId)}
                      className="w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                        <span className="text-sm font-medium">
                          Lines {hunk.newStart} - {hunk.newStart + hunk.newLines}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-xs">
                        <span className="text-green-600">
                          +{hunk.changes.filter((c) => c.type === 'add').length}
                        </span>
                        <span className="text-red-600">
                          -{hunk.changes.filter((c) => c.type === 'remove').length}
                        </span>
                      </div>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-gray-200">
                        {hunk.changes
                          .filter((c) => showUnchanged || c.type !== 'normal')
                          .map((change) => renderDiffLine(change))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-600">No JavaScript changes detected</div>
          )}
        </div>
      )}

      {/* Assets Tab */}
      {activeTab === 'assets' && (
        <div className="space-y-3">
          {comparison.assetDiffs.length > 0 ? (
            comparison.assetDiffs
              .filter((asset) => showUnchanged || asset.type !== 'unchanged')
              .map((asset) => (
                <div
                  key={asset.path}
                  className={`flex items-center justify-between p-3 rounded-lg border ${
                    asset.type === 'added'
                      ? 'bg-green-50 border-green-200'
                      : asset.type === 'removed'
                      ? 'bg-red-50 border-red-200'
                      : asset.type === 'modified'
                      ? 'bg-yellow-50 border-yellow-200'
                      : 'bg-gray-50 border-gray-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <ImageIcon className="w-5 h-5 text-gray-600" />
                    <span className="font-medium text-sm">{asset.path}</span>
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium ${
                        asset.type === 'added'
                          ? 'bg-green-200 text-green-800'
                          : asset.type === 'removed'
                          ? 'bg-red-200 text-red-800'
                          : asset.type === 'modified'
                          ? 'bg-yellow-200 text-yellow-800'
                          : 'bg-gray-200 text-gray-800'
                      }`}
                    >
                      {asset.type}
                    </span>
                  </div>
                  {asset.sizeChange !== undefined && asset.sizeChange !== 0 && (
                    <span
                      className={`text-sm ${
                        asset.sizeChange > 0 ? 'text-red-600' : 'text-green-600'
                      }`}
                    >
                      {asset.sizeChange > 0 ? '+' : ''}
                      {asset.percentChange?.toFixed(1)}%
                    </span>
                  )}
                </div>
              ))
          ) : (
            <div className="text-center py-8 text-gray-600">No asset changes detected</div>
          )}
        </div>
      )}

      {/* Structural Changes Tab */}
      {activeTab === 'structural' && (
        <div className="space-y-3">
          {comparison.structuralChanges.length > 0 ? (
            comparison.structuralChanges.map((change, index) => (
              <div
                key={index}
                className={`p-4 rounded-lg border ${getImpactColor(change.impact)}`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h4 className="font-semibold text-sm">{change.description}</h4>
                    <p className="text-xs text-gray-600 mt-1">Selector: {change.selector}</p>
                  </div>
                  <span className="px-2 py-1 bg-white rounded text-xs font-medium capitalize">
                    {change.impact} Impact
                  </span>
                </div>

                {(change.oldValue || change.newValue) && (
                  <div className="mt-3 space-y-2 text-xs">
                    {change.oldValue && (
                      <div className="bg-red-50 border border-red-200 rounded p-2">
                        <span className="font-medium text-red-900">Old: </span>
                        <span className="text-red-700">{change.oldValue}</span>
                      </div>
                    )}
                    {change.newValue && (
                      <div className="bg-green-50 border border-green-200 rounded p-2">
                        <span className="font-medium text-green-900">New: </span>
                        <span className="text-green-700">{change.newValue}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          ) : (
            <div className="text-center py-8 text-gray-600">
              No structural changes detected
            </div>
          )}
        </div>
      )}

      {/* Controls */}
      <div className="mt-6 flex items-center justify-between p-4 bg-gray-50 rounded-lg">
        <button
          onClick={() => setShowUnchanged(!showUnchanged)}
          className="flex items-center gap-2 text-sm text-gray-700 hover:text-gray-900"
        >
          {showUnchanged ? (
            <EyeOff className="w-4 h-4" />
          ) : (
            <Eye className="w-4 h-4" />
          )}
          {showUnchanged ? 'Hide' : 'Show'} unchanged lines
        </button>

        <div className="text-sm text-gray-600">
          Comparing {formatDate(comparison.versionA.createdAt)} →{' '}
          {formatDate(comparison.versionB.createdAt)}
        </div>
      </div>
    </div>
  );
};
