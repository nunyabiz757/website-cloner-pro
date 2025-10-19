/**
 * Unused Assets Panel Component
 *
 * Displays unused assets with options to review and remove them
 * Shows potential savings and allows bulk selection
 */

import React, { useState } from 'react';
import {
  AlertTriangle,
  Trash2,
  Eye,
  Download,
  CheckCircle,
  Image as ImageIcon,
  FileCode,
  FileText,
  Type,
  Film,
  Music
} from 'lucide-react';

export interface Asset {
  url: string;
  type: 'image' | 'css' | 'javascript' | 'font' | 'video' | 'audio' | 'other';
  size: number;
  path: string;
  filename: string;
}

export interface AssetUsage {
  asset: Asset;
  isUsed: boolean;
  referencedIn: string[];
  usageCount: number;
  confidence: 'high' | 'medium' | 'low';
}

export interface UnusedAssetsReport {
  totalAssets: number;
  usedAssets: number;
  unusedAssets: number;
  unusedList: AssetUsage[];
  potentialSavings: number;
  potentialSavingsFormatted: string;
  breakdown: {
    images: { total: number; unused: number; savings: number };
    css: { total: number; unused: number; savings: number };
    javascript: { total: number; unused: number; savings: number };
    fonts: { total: number; unused: number; savings: number };
    other: { total: number; unused: number; savings: number };
  };
  scanDate: string;
  confidence: 'high' | 'medium' | 'low';
}

interface UnusedAssetsPanelProps {
  report: UnusedAssetsReport;
  onRemoveAssets: (assetUrls: string[]) => Promise<void>;
  onRefresh?: () => void;
}

type RemovalAction = 'remove' | 'flag' | 'keep';

export const UnusedAssetsPanel: React.FC<UnusedAssetsPanelProps> = ({
  report,
  onRemoveAssets,
  onRefresh
}) => {
  const [selectedAssets, setSelectedAssets] = useState<string[]>([]);
  const [showDetails, setShowDetails] = useState(false);
  const [action, setAction] = useState<RemovalAction>('remove');
  const [filter, setFilter] = useState<'all' | 'images' | 'css' | 'javascript' | 'fonts'>('all');
  const [removing, setRemoving] = useState(false);

  const handleSelectAll = () => {
    if (selectedAssets.length === filteredAssets.length) {
      setSelectedAssets([]);
    } else {
      setSelectedAssets(filteredAssets.map(a => a.asset.url));
    }
  };

  const handleToggleAsset = (url: string) => {
    if (selectedAssets.includes(url)) {
      setSelectedAssets(selectedAssets.filter(u => u !== url));
    } else {
      setSelectedAssets([...selectedAssets, url]);
    }
  };

  const handleRemove = async () => {
    if (selectedAssets.length === 0) return;

    setRemoving(true);
    try {
      await onRemoveAssets(selectedAssets);
      setSelectedAssets([]);
      if (onRefresh) {
        onRefresh();
      }
    } catch (error) {
      console.error('Failed to remove assets:', error);
      alert('Failed to remove assets. Please try again.');
    } finally {
      setRemoving(false);
    }
  };

  const selectedSavings = report.unusedList
    .filter(a => selectedAssets.includes(a.asset.url))
    .reduce((sum, a) => sum + a.asset.size, 0);

  const filteredAssets = filter === 'all'
    ? report.unusedList
    : report.unusedList.filter(a => {
        if (filter === 'images') return a.asset.type === 'image';
        if (filter === 'css') return a.asset.type === 'css';
        if (filter === 'javascript') return a.asset.type === 'javascript';
        if (filter === 'fonts') return a.asset.type === 'font';
        return true;
      });

  if (report.unusedAssets === 0) {
    return (
      <div className="p-6 bg-green-50 border border-green-200 rounded-lg">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 bg-green-100 rounded-full flex items-center justify-center">
            <CheckCircle className="h-6 w-6 text-green-600" />
          </div>
          <div>
            <h3 className="font-semibold text-green-900">All Assets Used</h3>
            <p className="text-sm text-green-700">
              No unused assets detected. Your site is optimized!
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Card */}
      <div className="p-6 bg-orange-50 border border-orange-200 rounded-lg">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 bg-orange-100 rounded-full flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-orange-600" />
            </div>
            <div>
              <h3 className="font-semibold text-orange-900">
                {report.unusedAssets} Unused Asset{report.unusedAssets !== 1 ? 's' : ''} Found
              </h3>
              <p className="text-sm text-orange-700">
                Potential savings: <strong>{report.potentialSavingsFormatted}</strong>
              </p>
              <p className="text-xs text-orange-600 mt-1">
                Scan confidence: <strong className="capitalize">{report.confidence}</strong>
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowDetails(!showDetails)}
            className="text-sm text-orange-600 underline hover:text-orange-700"
          >
            {showDetails ? 'Hide' : 'Show'} details
          </button>
        </div>

        {/* Breakdown */}
        {showDetails && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-4">
            {Object.entries(report.breakdown).map(([type, data]) => (
              <div key={type} className="bg-white p-3 rounded border border-orange-200">
                <div className="text-xs text-orange-700 capitalize mb-1 font-medium">{type}</div>
                <div className="text-lg font-semibold text-orange-600">
                  {data.unused}/{data.total}
                </div>
                <div className="text-xs text-orange-600 mt-1">
                  {formatBytes(data.savings)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Filter Buttons */}
      <div className="flex gap-2 flex-wrap">
        <FilterButton active={filter === 'all'} onClick={() => setFilter('all')} label="All" count={report.unusedAssets} />
        <FilterButton active={filter === 'images'} onClick={() => setFilter('images')} label="Images" count={report.breakdown.images.unused} />
        <FilterButton active={filter === 'css'} onClick={() => setFilter('css')} label="CSS" count={report.breakdown.css.unused} />
        <FilterButton active={filter === 'javascript'} onClick={() => setFilter('javascript')} label="JavaScript" count={report.breakdown.javascript.unused} />
        <FilterButton active={filter === 'fonts'} onClick={() => setFilter('fonts')} label="Fonts" count={report.breakdown.fonts.unused} />
      </div>

      {/* Action Options */}
      <div className="p-6 bg-white border border-gray-200 rounded-lg">
        <h3 className="font-semibold mb-4 text-gray-900">What would you like to do?</h3>

        <div className="space-y-3">
          <label className="flex items-start gap-3 p-4 border border-gray-200 rounded hover:bg-gray-50 cursor-pointer">
            <input
              type="radio"
              name="action"
              value="remove"
              checked={action === 'remove'}
              onChange={(e) => setAction(e.target.value as RemovalAction)}
              className="mt-1"
            />
            <div>
              <div className="font-medium mb-1">
                Remove from export (Recommended)
              </div>
              <div className="text-sm text-gray-600">
                Exclude unused assets to reduce export size by {report.potentialSavingsFormatted}
              </div>
            </div>
          </label>

          <label className="flex items-start gap-3 p-4 border border-gray-200 rounded hover:bg-gray-50 cursor-pointer">
            <input
              type="radio"
              name="action"
              value="flag"
              checked={action === 'flag'}
              onChange={(e) => setAction(e.target.value as RemovalAction)}
              className="mt-1"
            />
            <div>
              <div className="font-medium mb-1">
                Keep but flag for review
              </div>
              <div className="text-sm text-gray-600">
                Include all assets but mark unused ones in export report
              </div>
            </div>
          </label>

          <label className="flex items-start gap-3 p-4 border border-gray-200 rounded hover:bg-gray-50 cursor-pointer">
            <input
              type="radio"
              name="action"
              value="keep"
              checked={action === 'keep'}
              onChange={(e) => setAction(e.target.value as RemovalAction)}
              className="mt-1"
            />
            <div>
              <div className="font-medium mb-1">
                Include all assets
              </div>
              <div className="text-sm text-gray-600">
                Keep all assets in export (may be used by JavaScript)
              </div>
            </div>
          </label>
        </div>
      </div>

      {/* Unused Assets List */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="p-4 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={selectedAssets.length === filteredAssets.length && filteredAssets.length > 0}
              onChange={handleSelectAll}
              className="h-4 w-4"
            />
            <span className="text-sm font-medium text-gray-900">
              Select All ({selectedAssets.length} selected)
            </span>
            {selectedAssets.length > 0 && (
              <span className="text-sm text-gray-600">
                • {formatBytes(selectedSavings)} savings
              </span>
            )}
          </div>

          {selectedAssets.length > 0 && action === 'remove' && (
            <button
              onClick={handleRemove}
              disabled={removing}
              className="text-sm text-red-600 hover:text-red-700 flex items-center gap-2 disabled:opacity-50"
            >
              {removing ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600"></div>
                  Removing...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4" />
                  Remove Selected
                </>
              )}
            </button>
          )}
        </div>

        <div className="divide-y divide-gray-200 max-h-96 overflow-y-auto">
          {filteredAssets.length === 0 ? (
            <div className="p-8 text-center text-gray-500">
              No unused {filter !== 'all' ? filter : 'assets'} found
            </div>
          ) : (
            filteredAssets.map(assetUsage => (
              <AssetRow
                key={assetUsage.asset.url}
                assetUsage={assetUsage}
                isSelected={selectedAssets.includes(assetUsage.asset.url)}
                onToggle={() => handleToggleAsset(assetUsage.asset.url)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
};

// Asset Row Component
const AssetRow: React.FC<{
  assetUsage: AssetUsage;
  isSelected: boolean;
  onToggle: () => void;
}> = ({ assetUsage, isSelected, onToggle }) => {
  const { asset, confidence } = assetUsage;

  const getIconForType = (type: Asset['type']) => {
    switch (type) {
      case 'image': return ImageIcon;
      case 'css': return FileCode;
      case 'javascript': return FileCode;
      case 'font': return Type;
      case 'video': return Film;
      case 'audio': return Music;
      default: return FileText;
    }
  };

  const Icon = getIconForType(asset.type);

  return (
    <div className="p-4 hover:bg-gray-50 flex items-center gap-3">
      <input
        type="checkbox"
        checked={isSelected}
        onChange={onToggle}
        className="h-4 w-4"
      />

      {/* Asset Preview/Icon */}
      <div className="h-12 w-12 bg-gray-100 rounded flex items-center justify-center overflow-hidden flex-shrink-0">
        {asset.type === 'image' ? (
          <img
            src={asset.url}
            alt={asset.filename}
            className="h-full w-full object-cover"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              e.currentTarget.nextElementSibling?.classList.remove('hidden');
            }}
          />
        ) : null}
        <Icon className={`h-5 w-5 text-gray-400 ${asset.type === 'image' ? 'hidden' : ''}`} />
      </div>

      {/* Asset Details */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <div className="text-sm font-medium text-gray-900 truncate">
            {asset.filename}
          </div>
          <ConfidenceBadge confidence={confidence} />
        </div>
        <div className="text-xs text-gray-500 truncate">
          {asset.url}
        </div>
      </div>

      {/* Size */}
      <div className="text-sm text-gray-600 flex-shrink-0">
        {formatBytes(asset.size)}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={() => window.open(asset.url, '_blank')}
          className="p-2 hover:bg-gray-100 rounded"
          title="View asset"
        >
          <Eye className="h-4 w-4 text-gray-400" />
        </button>
        <a
          href={asset.url}
          download
          className="p-2 hover:bg-gray-100 rounded"
          title="Download asset"
        >
          <Download className="h-4 w-4 text-gray-400" />
        </a>
      </div>
    </div>
  );
};

// Helper Components
const FilterButton: React.FC<{
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}> = ({ active, onClick, label, count }) => (
  <button
    onClick={onClick}
    className={`
      px-4 py-2 rounded-lg border-2 text-sm font-medium transition-colors
      ${active
        ? 'bg-blue-50 border-blue-500 text-blue-700'
        : 'bg-white border-gray-200 text-gray-700 hover:border-gray-300'
      }
    `}
  >
    {label} {count > 0 && `(${count})`}
  </button>
);

const ConfidenceBadge: React.FC<{ confidence: 'high' | 'medium' | 'low' }> = ({ confidence }) => {
  const colors = {
    high: 'bg-green-100 text-green-700',
    medium: 'bg-yellow-100 text-yellow-700',
    low: 'bg-red-100 text-red-700'
  };

  return (
    <span className={`text-xs px-2 py-0.5 rounded font-medium ${colors[confidence]}`}>
      {confidence} confidence
    </span>
  );
};

// Utility function
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

export default UnusedAssetsPanel;
