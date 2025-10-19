import React, { useState, useEffect } from 'react';
import {
  Clock,
  Tag,
  User,
  Download,
  RotateCcw,
  Trash2,
  GitBranch,
  AlertCircle,
  Loader,
  FileText,
  Image as ImageIcon,
  Code,
  Search,
} from 'lucide-react';

interface Version {
  id: string;
  projectId: string;
  versionNumber: number;
  name: string;
  description?: string;
  createdBy: string;
  createdAt: string;
  fileHash: string;
  fileSize: number;
  metadata: {
    htmlSize: number;
    cssSize: number;
    jsSize: number;
    imageCount: number;
    totalAssets: number;
  };
  tags: string[];
  isLatest: boolean;
}

interface VersionHistoryProps {
  projectId: string;
  onVersionRestore?: (versionId: string) => void;
  onVersionCompare?: (versionIdA: string, versionIdB: string) => void;
}

export const VersionHistory: React.FC<VersionHistoryProps> = ({
  projectId,
  onVersionRestore,
  onVersionCompare,
}) => {
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedVersions, setSelectedVersions] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTag, setFilterTag] = useState<string>('');
  const [allTags, setAllTags] = useState<string[]>([]);

  useEffect(() => {
    loadVersionHistory();
  }, [projectId]);

  const loadVersionHistory = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/collaboration/versions/history/${projectId}`);
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to load version history');
      }

      setVersions(data.data.versions);

      // Extract all unique tags
      const tags = new Set<string>();
      data.data.versions.forEach((v: Version) => {
        v.tags.forEach((tag: string) => tags.add(tag));
      });
      setAllTags(Array.from(tags));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load version history');
    } finally {
      setLoading(false);
    }
  };

  const restoreVersion = async (versionId: string) => {
    if (!confirm('Are you sure you want to restore this version? This will create a backup of the current version.')) {
      return;
    }

    try {
      const response = await fetch('/api/collaboration/versions/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          versionId,
          projectId,
          createBackup: true,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to restore version');
      }

      onVersionRestore?.(versionId);
      await loadVersionHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to restore version');
    }
  };

  const deleteVersion = async (versionId: string) => {
    if (!confirm('Are you sure you want to delete this version? This action cannot be undone.')) {
      return;
    }

    try {
      const response = await fetch(`/api/collaboration/versions/${projectId}/${versionId}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to delete version');
      }

      await loadVersionHistory();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete version');
    }
  };

  const toggleVersionSelection = (versionId: string) => {
    setSelectedVersions((prev) => {
      if (prev.includes(versionId)) {
        return prev.filter((id) => id !== versionId);
      } else if (prev.length < 2) {
        return [...prev, versionId];
      } else {
        // Replace oldest selection
        return [prev[1], versionId];
      }
    });
  };

  const compareVersions = () => {
    if (selectedVersions.length === 2) {
      onVersionCompare?.(selectedVersions[0], selectedVersions[1]);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const filteredVersions = versions.filter((version) => {
    const matchesSearch =
      !searchQuery ||
      version.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      version.description?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesTag = !filterTag || version.tags.includes(filterTag);

    return matchesSearch && matchesTag;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto bg-white rounded-lg shadow-lg p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-indigo-100 rounded-lg">
            <GitBranch className="w-6 h-6 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Version History</h2>
            <p className="text-gray-600">Manage and restore previous versions</p>
          </div>
        </div>

        {selectedVersions.length === 2 && (
          <button
            onClick={compareVersions}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors"
          >
            <GitBranch className="w-4 h-4" />
            Compare Selected
          </button>
        )}
      </div>

      {/* Search and Filters */}
      <div className="flex gap-3 mb-6">
        <div className="flex-1 relative">
          <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search versions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
        </div>

        {allTags.length > 0 && (
          <select
            value={filterTag}
            onChange={(e) => setFilterTag(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          >
            <option value="">All Tags</option>
            {allTags.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Error Display */}
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-semibold text-red-900 mb-1">Error</h4>
              <p className="text-sm text-red-800">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Version List */}
      {filteredVersions.length === 0 ? (
        <div className="text-center py-12">
          <GitBranch className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-600">No versions found</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredVersions.map((version) => (
            <div
              key={version.id}
              className={`border rounded-lg p-4 transition-all ${
                selectedVersions.includes(version.id)
                  ? 'border-indigo-500 bg-indigo-50 shadow-md'
                  : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4 flex-1">
                  {/* Selection Checkbox */}
                  <input
                    type="checkbox"
                    checked={selectedVersions.includes(version.id)}
                    onChange={() => toggleVersionSelection(version.id)}
                    className="mt-1 w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                  />

                  {/* Version Info */}
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900">
                        v{version.versionNumber}: {version.name}
                      </h3>
                      {version.isLatest && (
                        <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded">
                          Latest
                        </span>
                      )}
                    </div>

                    {version.description && (
                      <p className="text-sm text-gray-600 mb-3">{version.description}</p>
                    )}

                    {/* Metadata */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-3">
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <FileText className="w-4 h-4" />
                        <span>{formatFileSize(version.metadata.htmlSize)}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Code className="w-4 h-4" />
                        <span>{formatFileSize(version.metadata.cssSize + version.metadata.jsSize)}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <ImageIcon className="w-4 h-4" />
                        <span>{version.metadata.imageCount} images</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <User className="w-4 h-4" />
                        <span>{version.createdBy}</span>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-gray-600">
                        <Clock className="w-4 h-4" />
                        <span>{formatDate(version.createdAt)}</span>
                      </div>
                    </div>

                    {/* Tags */}
                    {version.tags.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-3">
                        {version.tags.map((tag) => (
                          <span
                            key={tag}
                            className="flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded"
                          >
                            <Tag className="w-3 h-3" />
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  {!version.isLatest && (
                    <button
                      onClick={() => restoreVersion(version.id)}
                      className="p-2 text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                      title="Restore version"
                    >
                      <RotateCcw className="w-5 h-5" />
                    </button>
                  )}

                  <button
                    className="p-2 text-gray-600 hover:bg-gray-50 rounded transition-colors"
                    title="Download version"
                  >
                    <Download className="w-5 h-5" />
                  </button>

                  {!version.isLatest && (
                    <button
                      onClick={() => deleteVersion(version.id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded transition-colors"
                      title="Delete version"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Info */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="text-sm font-medium text-blue-900 mb-2 flex items-center gap-2">
          <AlertCircle className="w-4 h-4" />
          Version Control Tips
        </h4>
        <ul className="text-xs text-blue-800 space-y-1 list-disc list-inside">
          <li>Select two versions to compare changes</li>
          <li>Restoring a version creates an automatic backup</li>
          <li>Latest version cannot be deleted</li>
          <li>Version snapshots include all assets and code</li>
        </ul>
      </div>
    </div>
  );
};
