import React from 'react';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
} from 'recharts';
import { ArrowUp, ArrowDown, Zap, TrendingUp } from 'lucide-react';
import type { PerformanceMetrics, PerformanceImprovement } from '../../../shared/types/index.js';

interface PerformanceComparisonProps {
  originalMetrics: PerformanceMetrics;
  optimizedMetrics: PerformanceMetrics;
  improvements?: PerformanceImprovement[];
}

export const PerformanceComparison: React.FC<PerformanceComparisonProps> = ({
  originalMetrics,
  optimizedMetrics,
  improvements,
}) => {
  // Calculate improvements if not provided
  const calculatedImprovements: PerformanceImprovement[] = improvements || [
    {
      metric: 'LCP',
      before: originalMetrics.lcp.value,
      after: optimizedMetrics.lcp.value,
      improvement: ((originalMetrics.lcp.value - optimizedMetrics.lcp.value) / originalMetrics.lcp.value) * 100,
      unit: originalMetrics.lcp.unit,
    },
    {
      metric: 'FID',
      before: originalMetrics.fid.value,
      after: optimizedMetrics.fid.value,
      improvement: ((originalMetrics.fid.value - optimizedMetrics.fid.value) / originalMetrics.fid.value) * 100,
      unit: originalMetrics.fid.unit,
    },
    {
      metric: 'CLS',
      before: originalMetrics.cls.value,
      after: optimizedMetrics.cls.value,
      improvement: ((originalMetrics.cls.value - optimizedMetrics.cls.value) / originalMetrics.cls.value) * 100,
      unit: originalMetrics.cls.unit,
    },
    {
      metric: 'FCP',
      before: originalMetrics.fcp.value,
      after: optimizedMetrics.fcp.value,
      improvement: ((originalMetrics.fcp.value - optimizedMetrics.fcp.value) / originalMetrics.fcp.value) * 100,
      unit: originalMetrics.fcp.unit,
    },
    {
      metric: 'TTI',
      before: originalMetrics.tti.value,
      after: optimizedMetrics.tti.value,
      improvement: ((originalMetrics.tti.value - optimizedMetrics.tti.value) / originalMetrics.tti.value) * 100,
      unit: originalMetrics.tti.unit,
    },
  ];

  // Prepare data for bar chart comparison
  const comparisonData = [
    {
      name: 'LCP',
      Before: originalMetrics.lcp.value,
      After: optimizedMetrics.lcp.value,
      target: originalMetrics.lcp.target,
    },
    {
      name: 'FID',
      Before: originalMetrics.fid.value,
      After: optimizedMetrics.fid.value,
      target: originalMetrics.fid.target,
    },
    {
      name: 'CLS',
      Before: originalMetrics.cls.value * 1000, // Scale up for visibility
      After: optimizedMetrics.cls.value * 1000,
      target: originalMetrics.cls.target * 1000,
    },
    {
      name: 'FCP',
      Before: originalMetrics.fcp.value,
      After: optimizedMetrics.fcp.value,
      target: originalMetrics.fcp.target,
    },
    {
      name: 'TTI',
      Before: originalMetrics.tti.value,
      After: optimizedMetrics.tti.value,
      target: originalMetrics.tti.target,
    },
  ];

  // Prepare data for radar chart
  const radarData = [
    {
      metric: 'LCP',
      Before: Math.max(0, 100 - (originalMetrics.lcp.value / originalMetrics.lcp.target) * 100),
      After: Math.max(0, 100 - (optimizedMetrics.lcp.value / optimizedMetrics.lcp.target) * 100),
    },
    {
      metric: 'FID',
      Before: Math.max(0, 100 - (originalMetrics.fid.value / originalMetrics.fid.target) * 100),
      After: Math.max(0, 100 - (optimizedMetrics.fid.value / optimizedMetrics.fid.target) * 100),
    },
    {
      metric: 'CLS',
      Before: Math.max(0, 100 - (originalMetrics.cls.value / originalMetrics.cls.target) * 100),
      After: Math.max(0, 100 - (optimizedMetrics.cls.value / optimizedMetrics.cls.target) * 100),
    },
    {
      metric: 'FCP',
      Before: Math.max(0, 100 - (originalMetrics.fcp.value / originalMetrics.fcp.target) * 100),
      After: Math.max(0, 100 - (optimizedMetrics.fcp.value / optimizedMetrics.fcp.target) * 100),
    },
    {
      metric: 'TTI',
      Before: Math.max(0, 100 - (originalMetrics.tti.value / originalMetrics.tti.target) * 100),
      After: Math.max(0, 100 - (optimizedMetrics.tti.value / optimizedMetrics.tti.target) * 100),
    },
  ];

  // Prepare data for performance score pie chart
  const scoreData = [
    { name: 'Performance Score', value: optimizedMetrics.performanceScore },
    { name: 'Remaining', value: 100 - optimizedMetrics.performanceScore },
  ];

  const COLORS = {
    before: '#ef4444', // red
    after: '#22c55e', // green
    target: '#fbbf24', // yellow
    good: '#22c55e',
    needsImprovement: '#fb923c',
    poor: '#ef4444',
  };

  return (
    <div className="space-y-8">
      {/* Overall Performance Score */}
      <div className="card">
        <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
          <Zap className="w-6 h-6 text-yellow-500" />
          Overall Performance Score
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <p className="text-sm text-gray-600">Before Optimization</p>
                <p className="text-4xl font-bold text-red-600">{originalMetrics.performanceScore}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">After Optimization</p>
                <p className="text-4xl font-bold text-green-600">{optimizedMetrics.performanceScore}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Improvement</p>
                <p className="text-4xl font-bold text-blue-600 flex items-center gap-1">
                  +{(optimizedMetrics.performanceScore - originalMetrics.performanceScore).toFixed(0)}
                  <TrendingUp className="w-8 h-8" />
                </p>
              </div>
            </div>
            <div className="h-4 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-red-500 via-yellow-500 to-green-500"
                style={{ width: `${optimizedMetrics.performanceScore}%` }}
              />
            </div>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={scoreData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={80}
                fill="#8884d8"
                paddingAngle={5}
                dataKey="value"
              >
                <Cell fill={COLORS.good} />
                <Cell fill="#e5e7eb" />
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Core Web Vitals Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { key: 'lcp', label: 'LCP', description: 'Largest Contentful Paint' },
          { key: 'fid', label: 'FID', description: 'First Input Delay' },
          { key: 'cls', label: 'CLS', description: 'Cumulative Layout Shift' },
        ].map(({ key, label, description }) => {
          const metric = optimizedMetrics[key as keyof typeof optimizedMetrics] as any;
          const originalValue = originalMetrics[key as keyof typeof originalMetrics] as any;
          const improvement = ((originalValue.value - metric.value) / originalValue.value) * 100;

          return (
            <div key={key} className="card">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-lg font-semibold text-gray-800">{label}</h3>
                <span
                  className={`px-2 py-1 text-xs font-medium rounded-full ${
                    metric.rating === 'good'
                      ? 'bg-green-100 text-green-800'
                      : metric.rating === 'needs-improvement'
                      ? 'bg-yellow-100 text-yellow-800'
                      : 'bg-red-100 text-red-800'
                  }`}
                >
                  {metric.rating}
                </span>
              </div>
              <p className="text-xs text-gray-500 mb-4">{description}</p>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Before:</span>
                  <span className="text-lg font-bold text-red-600">
                    {originalValue.value.toFixed(key === 'cls' ? 3 : 0)}
                    {metric.unit}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">After:</span>
                  <span className="text-lg font-bold text-green-600">
                    {metric.value.toFixed(key === 'cls' ? 3 : 0)}
                    {metric.unit}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-2 border-t">
                  <span className="text-sm font-medium text-gray-700">Improvement:</span>
                  <span className="text-lg font-bold text-blue-600 flex items-center gap-1">
                    {improvement > 0 ? <ArrowDown className="w-4 h-4" /> : <ArrowUp className="w-4 h-4" />}
                    {Math.abs(improvement).toFixed(1)}%
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bar Chart Comparison */}
      <div className="card">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Metrics Comparison</h2>
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={comparisonData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="Before" fill={COLORS.before} name="Before Optimization" />
            <Bar dataKey="After" fill={COLORS.after} name="After Optimization" />
            <Bar dataKey="target" fill={COLORS.target} name="Target" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Radar Chart */}
      <div className="card">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Performance Profile</h2>
        <ResponsiveContainer width="100%" height={400}>
          <RadarChart data={radarData}>
            <PolarGrid />
            <PolarAngleAxis dataKey="metric" />
            <PolarRadiusAxis angle={90} domain={[0, 100]} />
            <Radar name="Before" dataKey="Before" stroke={COLORS.before} fill={COLORS.before} fillOpacity={0.5} />
            <Radar name="After" dataKey="After" stroke={COLORS.after} fill={COLORS.after} fillOpacity={0.5} />
            <Legend />
            <Tooltip />
          </RadarChart>
        </ResponsiveContainer>
      </div>

      {/* Improvements Table */}
      <div className="card">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Detailed Improvements</h2>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b">
                <th className="text-left py-3 px-4 font-semibold text-gray-700">Metric</th>
                <th className="text-right py-3 px-4 font-semibold text-gray-700">Before</th>
                <th className="text-right py-3 px-4 font-semibold text-gray-700">After</th>
                <th className="text-right py-3 px-4 font-semibold text-gray-700">Improvement</th>
                <th className="text-center py-3 px-4 font-semibold text-gray-700">Status</th>
              </tr>
            </thead>
            <tbody>
              {calculatedImprovements.map((improvement) => (
                <tr key={improvement.metric} className="border-b hover:bg-gray-50">
                  <td className="py-3 px-4 font-medium">{improvement.metric}</td>
                  <td className="text-right py-3 px-4 text-red-600">
                    {improvement.before.toFixed(improvement.metric === 'CLS' ? 3 : 0)}
                    {improvement.unit}
                  </td>
                  <td className="text-right py-3 px-4 text-green-600">
                    {improvement.after.toFixed(improvement.metric === 'CLS' ? 3 : 0)}
                    {improvement.unit}
                  </td>
                  <td className="text-right py-3 px-4">
                    <span className="font-bold text-blue-600 flex items-center justify-end gap-1">
                      {improvement.improvement > 0 ? (
                        <ArrowDown className="w-4 h-4 text-green-600" />
                      ) : (
                        <ArrowUp className="w-4 h-4 text-red-600" />
                      )}
                      {Math.abs(improvement.improvement).toFixed(1)}%
                    </span>
                  </td>
                  <td className="text-center py-3 px-4">
                    {improvement.improvement > 0 ? (
                      <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
                        Improved
                      </span>
                    ) : (
                      <span className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-sm font-medium">
                        Regressed
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
