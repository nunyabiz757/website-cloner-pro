import React from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { FileImage, FileCode, Type, Film, FileText } from 'lucide-react';
import type { Asset } from '../../../shared/types/index.js';

interface FileSizeBreakdownProps {
  assets: Asset[];
  title?: string;
}

export const FileSizeBreakdown: React.FC<FileSizeBreakdownProps> = ({ assets, title = 'File Size Breakdown' }) => {
  // Group assets by type and calculate total sizes
  const breakdown = assets.reduce((acc, asset) => {
    const size = asset.optimizedSize || asset.size;
    const type = asset.type;

    if (!acc[type]) {
      acc[type] = { total: 0, count: 0, savings: 0 };
    }

    acc[type].total += size;
    acc[type].count += 1;

    if (asset.optimizedSize) {
      acc[type].savings += asset.size - asset.optimizedSize;
    }

    return acc;
  }, {} as Record<string, { total: number; count: number; savings: number }>);

  // Prepare data for pie chart
  const pieData = Object.entries(breakdown).map(([type, data]) => ({
    name: type.charAt(0).toUpperCase() + type.slice(1),
    value: data.total,
    count: data.count,
  }));

  // Prepare data for bar chart (before/after comparison)
  const barData = Object.entries(breakdown).map(([type, data]) => {
    const originalTotal = assets
      .filter((a) => a.type === type)
      .reduce((sum, a) => sum + a.size, 0);

    return {
      name: type.charAt(0).toUpperCase() + type.slice(1),
      Before: originalTotal,
      After: data.total,
      Savings: data.savings,
    };
  });

  const COLORS = {
    image: '#3b82f6', // blue
    font: '#8b5cf6', // purple
    video: '#ec4899', // pink
    icon: '#f59e0b', // amber
    other: '#6b7280', // gray
  };

  const getIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case 'image':
        return <FileImage className="w-5 h-5" />;
      case 'font':
        return <Type className="w-5 h-5" />;
      case 'video':
        return <Film className="w-5 h-5" />;
      case 'icon':
        return <FileText className="w-5 h-5" />;
      default:
        return <FileCode className="w-5 h-5" />;
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  const totalSize = pieData.reduce((sum, item) => sum + item.value, 0);
  const totalOriginalSize = barData.reduce((sum, item) => sum + item.Before, 0);
  const totalSavings = totalOriginalSize - totalSize;
  const savingsPercentage = ((totalSavings / totalOriginalSize) * 100).toFixed(1);

  return (
    <div className="space-y-6">
      <div className="card">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">{title}</h2>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="p-4 bg-blue-50 rounded-lg">
            <div className="text-sm text-gray-600 mb-1">Total Size</div>
            <div className="text-2xl font-bold text-blue-600">{formatBytes(totalSize)}</div>
          </div>
          <div className="p-4 bg-red-50 rounded-lg">
            <div className="text-sm text-gray-600 mb-1">Original Size</div>
            <div className="text-2xl font-bold text-red-600">{formatBytes(totalOriginalSize)}</div>
          </div>
          <div className="p-4 bg-green-50 rounded-lg">
            <div className="text-sm text-gray-600 mb-1">Savings</div>
            <div className="text-2xl font-bold text-green-600">{formatBytes(totalSavings)}</div>
          </div>
          <div className="p-4 bg-purple-50 rounded-lg">
            <div className="text-sm text-gray-600 mb-1">Reduction</div>
            <div className="text-2xl font-bold text-purple-600">{savingsPercentage}%</div>
          </div>
        </div>

        {/* Pie Chart */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Distribution by Type</h3>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                  outerRadius={100}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[entry.name.toLowerCase() as keyof typeof COLORS] || COLORS.other} />
                  ))}
                </Pie>
                <Tooltip formatter={(value: number) => formatBytes(value)} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Stats List */}
          <div>
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Breakdown by Type</h3>
            <div className="space-y-3">
              {Object.entries(breakdown).map(([type, data]) => {
                const percentage = ((data.total / totalSize) * 100).toFixed(1);
                const savingsPerc = data.savings > 0 ? ((data.savings / (data.total + data.savings)) * 100).toFixed(1) : '0';

                return (
                  <div key={type} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                    <div
                      className="p-2 rounded"
                      style={{
                        backgroundColor: `${COLORS[type as keyof typeof COLORS] || COLORS.other}20`,
                        color: COLORS[type as keyof typeof COLORS] || COLORS.other,
                      }}
                    >
                      {getIcon(type)}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-gray-800 capitalize">{type}</span>
                        <span className="text-sm text-gray-600">{data.count} files</span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">{formatBytes(data.total)}</span>
                        <span className="text-gray-500">{percentage}% of total</span>
                      </div>
                      {data.savings > 0 && (
                        <div className="text-xs text-green-600 mt-1">
                          Saved {formatBytes(data.savings)} ({savingsPerc}% reduction)
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Before/After Bar Chart */}
      <div className="card">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Before vs After Comparison</h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={barData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis tickFormatter={(value) => formatBytes(value)} />
            <Tooltip formatter={(value: number) => formatBytes(value)} />
            <Legend />
            <Bar dataKey="Before" fill="#ef4444" name="Original Size" />
            <Bar dataKey="After" fill="#22c55e" name="Optimized Size" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Individual Assets Table */}
      <div className="card">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Individual Assets</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Asset</th>
                <th className="text-center py-3 px-4 font-semibold text-gray-700">Type</th>
                <th className="text-right py-3 px-4 font-semibold text-gray-700">Original</th>
                <th className="text-right py-3 px-4 font-semibold text-gray-700">Optimized</th>
                <th className="text-right py-3 px-4 font-semibold text-gray-700">Savings</th>
              </tr>
            </thead>
            <tbody>
              {assets
                .sort((a, b) => {
                  const aSavings = a.optimizedSize ? a.size - a.optimizedSize : 0;
                  const bSavings = b.optimizedSize ? b.size - b.optimizedSize : 0;
                  return bSavings - aSavings;
                })
                .slice(0, 20) // Show top 20 assets
                .map((asset) => {
                  const savings = asset.optimizedSize ? asset.size - asset.optimizedSize : 0;
                  const savingsPerc = savings > 0 ? ((savings / asset.size) * 100).toFixed(1) : '0';

                  return (
                    <tr key={asset.id} className="border-b hover:bg-gray-50">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          {getIcon(asset.type)}
                          <span className="text-sm truncate max-w-xs" title={asset.localPath}>
                            {asset.localPath.split('/').pop()}
                          </span>
                        </div>
                      </td>
                      <td className="text-center py-3 px-4">
                        <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-700 capitalize">
                          {asset.type}
                        </span>
                      </td>
                      <td className="text-right py-3 px-4 text-gray-600">{formatBytes(asset.size)}</td>
                      <td className="text-right py-3 px-4 text-gray-600">
                        {asset.optimizedSize ? formatBytes(asset.optimizedSize) : '-'}
                      </td>
                      <td className="text-right py-3 px-4">
                        {savings > 0 ? (
                          <span className="text-green-600 font-medium">
                            {formatBytes(savings)} ({savingsPerc}%)
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
        {assets.length > 20 && (
          <p className="text-sm text-gray-500 mt-4 text-center">Showing top 20 assets by savings</p>
        )}
      </div>
    </div>
  );
};
