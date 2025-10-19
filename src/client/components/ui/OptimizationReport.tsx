import React, { useState } from 'react';
import {
  FileText,
  Download,
  TrendingUp,
  TrendingDown,
  CheckCircle,
  AlertTriangle,
  BarChart3,
  Clock,
  FileImage,
  Code,
  Zap,
  Globe,
} from 'lucide-react';

interface ReportData {
  summary: {
    totalSavings: number;
    originalSize: number;
    optimizedSize: number;
    performanceScore: number;
    loadTime: {
      before: number;
      after: number;
    };
  };
  optimizations: {
    category: string;
    items: {
      name: string;
      status: 'success' | 'warning' | 'info';
      savings?: string;
      description: string;
    }[];
  }[];
  metrics: {
    name: string;
    before: number;
    after: number;
    unit: string;
    improvement: number;
  }[];
}

export const OptimizationReport: React.FC = () => {
  const [reportData] = useState<ReportData>({
    summary: {
      totalSavings: 68,
      originalSize: 5242880, // 5MB
      optimizedSize: 1677721, // 1.6MB
      performanceScore: 92,
      loadTime: {
        before: 3.4,
        after: 1.2,
      },
    },
    optimizations: [
      {
        category: 'Images',
        items: [
          {
            name: 'Image Format Conversion',
            status: 'success',
            savings: '2.1 MB',
            description: 'Converted 24 images to WebP format',
          },
          {
            name: 'Image Compression',
            status: 'success',
            savings: '890 KB',
            description: 'Compressed images to 80% quality',
          },
          {
            name: 'Lazy Loading',
            status: 'success',
            description: 'Enabled lazy loading for 18 below-fold images',
          },
        ],
      },
      {
        category: 'Code',
        items: [
          {
            name: 'CSS Minification',
            status: 'success',
            savings: '156 KB',
            description: 'Minified 8 CSS files',
          },
          {
            name: 'JavaScript Minification',
            status: 'success',
            savings: '420 KB',
            description: 'Minified 12 JavaScript files',
          },
          {
            name: 'Remove Unused CSS',
            status: 'warning',
            savings: '89 KB',
            description: 'Removed 42% of unused CSS rules',
          },
        ],
      },
      {
        category: 'Fonts',
        items: [
          {
            name: 'Font Subsetting',
            status: 'success',
            savings: '245 KB',
            description: 'Subsetted 3 font files to Latin characters only',
          },
          {
            name: 'WOFF2 Conversion',
            status: 'success',
            savings: '112 KB',
            description: 'Converted fonts to WOFF2 format',
          },
        ],
      },
      {
        category: 'Loading',
        items: [
          {
            name: 'Resource Hints',
            status: 'success',
            description: 'Added preconnect for 3 origins',
          },
          {
            name: 'Critical CSS',
            status: 'info',
            description: 'Inlined critical CSS for above-fold content',
          },
        ],
      },
    ],
    metrics: [
      { name: 'First Contentful Paint', before: 2.1, after: 0.8, unit: 's', improvement: 62 },
      { name: 'Largest Contentful Paint', before: 3.4, after: 1.2, unit: 's', improvement: 65 },
      { name: 'Time to Interactive', before: 4.2, after: 1.8, unit: 's', improvement: 57 },
      { name: 'Total Blocking Time', before: 580, after: 120, unit: 'ms', improvement: 79 },
      { name: 'Cumulative Layout Shift', before: 0.18, after: 0.02, unit: '', improvement: 89 },
    ],
  });

  const [exportFormat, setExportFormat] = useState<'pdf' | 'html' | 'json'>('pdf');

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const handleExport = () => {
    // Simulated export - in production, this would generate actual files
    const filename = `optimization-report-${new Date().toISOString().split('T')[0]}.${exportFormat}`;
    alert(`Exporting report as ${filename}`);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-yellow-600" />;
      default:
        return <Zap className="w-5 h-5 text-blue-600" />;
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'Images':
        return <FileImage className="w-5 h-5 text-purple-600" />;
      case 'Code':
        return <Code className="w-5 h-5 text-blue-600" />;
      case 'Fonts':
        return <FileText className="w-5 h-5 text-indigo-600" />;
      case 'Loading':
        return <Globe className="w-5 h-5 text-green-600" />;
      default:
        return <Zap className="w-5 h-5 text-gray-600" />;
    }
  };

  return (
    <div className="max-w-6xl mx-auto bg-white rounded-lg shadow-lg p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-green-100 rounded-lg">
            <FileText className="w-6 h-6 text-green-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Optimization Report</h2>
            <p className="text-gray-600">
              Generated on {new Date().toLocaleDateString()} at {new Date().toLocaleTimeString()}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={exportFormat}
            onChange={(e) => setExportFormat(e.target.value as typeof exportFormat)}
            className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
          >
            <option value="pdf">PDF</option>
            <option value="html">HTML</option>
            <option value="json">JSON</option>
          </select>
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
        <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-6 border border-green-200">
          <div className="flex items-center justify-between mb-2">
            <TrendingUp className="w-8 h-8 text-green-600" />
            <span className="text-3xl font-bold text-green-700">
              {reportData.summary.totalSavings}%
            </span>
          </div>
          <p className="text-sm text-green-800 font-medium">Total Savings</p>
          <p className="text-xs text-green-600 mt-1">
            {formatBytes(reportData.summary.originalSize - reportData.summary.optimizedSize)} saved
          </p>
        </div>

        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-6 border border-blue-200">
          <div className="flex items-center justify-between mb-2">
            <BarChart3 className="w-8 h-8 text-blue-600" />
            <span className="text-3xl font-bold text-blue-700">
              {reportData.summary.performanceScore}
            </span>
          </div>
          <p className="text-sm text-blue-800 font-medium">Performance Score</p>
          <p className="text-xs text-blue-600 mt-1">Lighthouse metric</p>
        </div>

        <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-6 border border-purple-200">
          <div className="flex items-center justify-between mb-2">
            <Clock className="w-8 h-8 text-purple-600" />
            <span className="text-3xl font-bold text-purple-700">
              {reportData.summary.loadTime.after}s
            </span>
          </div>
          <p className="text-sm text-purple-800 font-medium">Load Time</p>
          <p className="text-xs text-purple-600 mt-1">
            {((1 - reportData.summary.loadTime.after / reportData.summary.loadTime.before) * 100).toFixed(0)}% faster
          </p>
        </div>

        <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg p-6 border border-orange-200">
          <div className="flex items-center justify-between mb-2">
            <TrendingDown className="w-8 h-8 text-orange-600" />
            <span className="text-3xl font-bold text-orange-700">
              {formatBytes(reportData.summary.optimizedSize)}
            </span>
          </div>
          <p className="text-sm text-orange-800 font-medium">Final Size</p>
          <p className="text-xs text-orange-600 mt-1">
            from {formatBytes(reportData.summary.originalSize)}
          </p>
        </div>
      </div>

      {/* Performance Metrics */}
      <div className="mb-8">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Performance Metrics</h3>
        <div className="space-y-3">
          {reportData.metrics.map((metric, index) => (
            <div key={index} className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-gray-900">{metric.name}</span>
                <span className="text-sm font-semibold text-green-600">
                  {metric.improvement}% improvement
                </span>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600">
                      Before: {metric.before}{metric.unit}
                    </span>
                    <span className="text-green-600">
                      After: {metric.after}{metric.unit}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className="bg-green-600 h-2 rounded-full transition-all"
                      style={{ width: `${metric.improvement}%` }}
                    ></div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Optimizations by Category */}
      <div className="mb-8">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Applied Optimizations</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {reportData.optimizations.map((category, categoryIndex) => (
            <div key={categoryIndex} className="border border-gray-200 rounded-lg p-6">
              <div className="flex items-center gap-2 mb-4">
                {getCategoryIcon(category.category)}
                <h4 className="font-semibold text-gray-900">{category.category}</h4>
              </div>
              <div className="space-y-3">
                {category.items.map((item, itemIndex) => (
                  <div key={itemIndex} className="flex items-start gap-3">
                    {getStatusIcon(item.status)}
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-gray-900">{item.name}</p>
                        {item.savings && (
                          <span className="text-xs font-semibold text-green-600">
                            {item.savings}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-600 mt-0.5">{item.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Recommendations */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-blue-900 mb-4">
          Recommendations for Further Improvement
        </h3>
        <ul className="space-y-2 text-sm text-blue-800">
          <li className="flex items-start gap-2">
            <span className="text-blue-600 mt-1">•</span>
            <span>
              Consider implementing a Content Delivery Network (CDN) to reduce latency for global users
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-600 mt-1">•</span>
            <span>
              Enable HTTP/2 server push for critical resources to reduce round-trip times
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-600 mt-1">•</span>
            <span>
              Implement service workers for offline functionality and faster repeat visits
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-blue-600 mt-1">•</span>
            <span>
              Monitor Core Web Vitals regularly to maintain optimal performance
            </span>
          </li>
        </ul>
      </div>

      {/* Footer */}
      <div className="mt-8 pt-6 border-t border-gray-200 text-center text-sm text-gray-500">
        <p>
          Generated by Website Cloner Pro • Report ID: {Math.random().toString(36).substr(2, 9).toUpperCase()}
        </p>
      </div>
    </div>
  );
};
