import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Globe, Server, Clock, Download } from 'lucide-react';

interface ResourceTiming {
  name: string;
  type: 'html' | 'css' | 'javascript' | 'image' | 'font' | 'other';
  startTime: number; // ms
  duration: number; // ms
  size: number; // bytes
  dns?: number;
  tcp?: number;
  request?: number;
  response?: number;
}

interface NetworkWaterfallProps {
  resources: ResourceTiming[];
  title?: string;
}

export const NetworkWaterfall: React.FC<NetworkWaterfallProps> = ({
  resources,
  title = 'Network Waterfall'
}) => {
  // Sort resources by start time
  const sortedResources = [...resources].sort((a, b) => a.startTime - b.startTime);

  // Calculate total load time
  const totalLoadTime = Math.max(...sortedResources.map((r) => r.startTime + r.duration));

  // Prepare waterfall data
  const waterfallData = sortedResources.map((resource) => ({
    name: resource.name.length > 30 ? resource.name.substring(0, 27) + '...' : resource.name,
    fullName: resource.name,
    type: resource.type,
    start: resource.startTime,
    duration: resource.duration,
    size: resource.size,
    dns: resource.dns || 0,
    tcp: resource.tcp || 0,
    request: resource.request || 0,
    response: resource.response || 0,
  }));

  const COLORS = {
    html: '#3b82f6', // blue
    css: '#8b5cf6', // purple
    javascript: '#f59e0b', // amber
    image: '#10b981', // green
    font: '#ec4899', // pink
    other: '#6b7280', // gray
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  const formatTime = (ms: number): string => {
    if (ms < 1000) return `${ms.toFixed(0)}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  // Group resources by type
  const resourcesByType = sortedResources.reduce((acc, resource) => {
    if (!acc[resource.type]) {
      acc[resource.type] = { count: 0, totalSize: 0, totalDuration: 0 };
    }
    acc[resource.type].count++;
    acc[resource.type].totalSize += resource.size;
    acc[resource.type].totalDuration += resource.duration;
    return acc;
  }, {} as Record<string, { count: number; totalSize: number; totalDuration: number }>);

  // Custom tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-4 rounded-lg shadow-lg border">
          <p className="font-semibold text-gray-900 mb-2">{data.fullName}</p>
          <div className="space-y-1 text-sm">
            <p className="text-gray-600">
              Type: <span className="font-medium capitalize">{data.type}</span>
            </p>
            <p className="text-gray-600">
              Start: <span className="font-medium">{formatTime(data.start)}</span>
            </p>
            <p className="text-gray-600">
              Duration: <span className="font-medium">{formatTime(data.duration)}</span>
            </p>
            <p className="text-gray-600">
              Size: <span className="font-medium">{formatBytes(data.size)}</span>
            </p>
            {data.dns > 0 && (
              <p className="text-gray-600">
                DNS: <span className="font-medium">{formatTime(data.dns)}</span>
              </p>
            )}
            {data.tcp > 0 && (
              <p className="text-gray-600">
                TCP: <span className="font-medium">{formatTime(data.tcp)}</span>
              </p>
            )}
            {data.request > 0 && (
              <p className="text-gray-600">
                Request: <span className="font-medium">{formatTime(data.request)}</span>
              </p>
            )}
            {data.response > 0 && (
              <p className="text-gray-600">
                Response: <span className="font-medium">{formatTime(data.response)}</span>
              </p>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      <div className="card">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">{title}</h2>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="p-4 bg-blue-50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-5 h-5 text-blue-600" />
              <div className="text-sm text-gray-600">Total Load Time</div>
            </div>
            <div className="text-2xl font-bold text-blue-600">{formatTime(totalLoadTime)}</div>
          </div>
          <div className="p-4 bg-green-50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Download className="w-5 h-5 text-green-600" />
              <div className="text-sm text-gray-600">Total Resources</div>
            </div>
            <div className="text-2xl font-bold text-green-600">{resources.length}</div>
          </div>
          <div className="p-4 bg-purple-50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Server className="w-5 h-5 text-purple-600" />
              <div className="text-sm text-gray-600">Total Size</div>
            </div>
            <div className="text-2xl font-bold text-purple-600">
              {formatBytes(resources.reduce((sum, r) => sum + r.size, 0))}
            </div>
          </div>
          <div className="p-4 bg-orange-50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Globe className="w-5 h-5 text-orange-600" />
              <div className="text-sm text-gray-600">Avg Duration</div>
            </div>
            <div className="text-2xl font-bold text-orange-600">
              {formatTime(resources.reduce((sum, r) => sum + r.duration, 0) / resources.length)}
            </div>
          </div>
        </div>

        {/* Resource Type Breakdown */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-3">Resources by Type</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {Object.entries(resourcesByType).map(([type, data]) => (
              <div key={type} className="p-3 bg-gray-50 rounded-lg">
                <div
                  className="w-full h-1 rounded mb-2"
                  style={{ backgroundColor: COLORS[type as keyof typeof COLORS] || COLORS.other }}
                />
                <div className="text-xs text-gray-600 capitalize mb-1">{type}</div>
                <div className="text-lg font-bold text-gray-900">{data.count}</div>
                <div className="text-xs text-gray-500">{formatBytes(data.totalSize)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Waterfall Chart */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-3">Request Timeline</h3>
          <ResponsiveContainer width="100%" height={Math.max(400, waterfallData.length * 30)}>
            <BarChart
              data={waterfallData}
              layout="vertical"
              margin={{ top: 5, right: 30, left: 150, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" domain={[0, totalLoadTime]} tickFormatter={(value) => formatTime(value)} />
              <YAxis type="category" dataKey="name" width={140} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="duration" stackId="a">
                {waterfallData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[entry.type as keyof typeof COLORS] || COLORS.other} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Detailed Timeline Breakdown */}
        {resources.some((r) => r.dns || r.tcp || r.request || r.response) && (
          <div>
            <h3 className="text-lg font-semibold text-gray-800 mb-3">Timing Breakdown</h3>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">Resource</th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-700">DNS</th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-700">TCP</th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-700">Request</th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-700">Response</th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-700">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedResources.slice(0, 15).map((resource, index) => (
                    <tr key={index} className="border-b hover:bg-gray-50">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: COLORS[resource.type as keyof typeof COLORS] || COLORS.other }}
                          />
                          <span className="text-sm truncate max-w-xs" title={resource.name}>
                            {resource.name.length > 40 ? resource.name.substring(0, 37) + '...' : resource.name}
                          </span>
                        </div>
                      </td>
                      <td className="text-right py-3 px-4 text-sm text-gray-600">
                        {resource.dns ? formatTime(resource.dns) : '-'}
                      </td>
                      <td className="text-right py-3 px-4 text-sm text-gray-600">
                        {resource.tcp ? formatTime(resource.tcp) : '-'}
                      </td>
                      <td className="text-right py-3 px-4 text-sm text-gray-600">
                        {resource.request ? formatTime(resource.request) : '-'}
                      </td>
                      <td className="text-right py-3 px-4 text-sm text-gray-600">
                        {resource.response ? formatTime(resource.response) : '-'}
                      </td>
                      <td className="text-right py-3 px-4 text-sm font-medium text-gray-900">
                        {formatTime(resource.duration)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {resources.length > 15 && (
              <p className="text-sm text-gray-500 mt-4 text-center">Showing first 15 resources</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export { type ResourceTiming };
