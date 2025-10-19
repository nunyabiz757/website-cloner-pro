import React, { useState } from 'react';
import {
  Activity,
  Download,
  TrendingUp,
  Gauge,
  AlertTriangle,
  CheckCircle,
  Loader,
} from 'lucide-react';

interface PerformanceAuditReportProps {
  url: string;
}

interface AuditResult {
  summary: {
    overallScore: number;
    performanceScore: number;
    optimizationScore: number;
    securityScore: number;
    totalIssues: number;
    criticalIssues: number;
  };
  webVitals?: any;
  performanceMetrics?: any;
  assetOptimization?: any;
  criticalCSS?: any;
  recommendations: Array<{
    priority: 'critical' | 'high' | 'medium' | 'low';
    category: string;
    title: string;
    description: string;
    impact: string;
    effort: 'easy' | 'medium' | 'hard';
  }>;
  executionTime: number;
}

export const PerformanceAuditReport: React.FC<PerformanceAuditReportProps> = ({ url }) => {
  const [auditId, setAuditId] = useState<string | null>(null);
  const [auditResult, setAuditResult] = useState<AuditResult | null>(null);
  const [status, setStatus] = useState<'idle' | 'running' | 'completed' | 'failed'>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const startAudit = async () => {
    setStatus('running');
    setError(null);
    setProgress(0);

    try {
      const response = await fetch('/api/performance-audit/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to start audit');
      }

      setAuditId(data.auditId);
      pollAuditStatus(data.auditId);
    } catch (err) {
      setStatus('failed');
      setError(err instanceof Error ? err.message : 'Failed to start audit');
    }
  };

  const pollAuditStatus = async (id: string) => {
    const interval = setInterval(async () => {
      try {
        const response = await fetch(`/api/performance-audit/status/${id}`);
        const data = await response.json();

        if (data.success) {
          setProgress(data.progress);

          if (data.status === 'completed') {
            clearInterval(interval);
            setStatus('completed');
            fetchAuditResult(id);
          } else if (data.status === 'failed') {
            clearInterval(interval);
            setStatus('failed');
            setError(data.error || 'Audit failed');
          }
        }
      } catch (err) {
        console.error('Failed to poll audit status:', err);
      }
    }, 2000);
  };

  const fetchAuditResult = async (id: string) => {
    try {
      const response = await fetch(`/api/performance-audit/result/${id}`);
      const data = await response.json();

      if (data.success) {
        setAuditResult(data.result);
      }
    } catch (err) {
      console.error('Failed to fetch audit result:', err);
    }
  };

  const downloadReport = async () => {
    if (!auditId) return;

    try {
      const response = await fetch(`/api/performance-audit/report/${auditId}`);
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `performance-audit-${auditId}.html`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(downloadUrl);
      document.body.removeChild(a);
    } catch (err) {
      alert('Failed to download report');
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 90) return 'text-green-600';
    if (score >= 70) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getScoreBgColor = (score: number) => {
    if (score >= 90) return 'bg-green-50 border-green-200';
    if (score >= 70) return 'bg-yellow-50 border-yellow-200';
    return 'bg-red-50 border-red-200';
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'critical':
        return 'bg-red-100 text-red-800 border-red-300';
      case 'high':
        return 'bg-orange-100 text-orange-800 border-orange-300';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'low':
        return 'bg-green-100 text-green-800 border-green-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const renderScoreCard = (title: string, score: number, icon: React.ReactNode) => (
    <div className={`p-6 rounded-lg border-2 ${getScoreBgColor(score)}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium text-gray-600">{title}</div>
        {icon}
      </div>
      <div className={`text-4xl font-bold ${getScoreColor(score)}`}>{score}</div>
      <div className="text-xs text-gray-500 mt-1">out of 100</div>
    </div>
  );

  const renderWebVitals = () => {
    if (!auditResult?.webVitals) return null;

    const vitals = [
      { name: 'LCP', data: auditResult.webVitals.lcp, unit: 'ms', threshold: 2500 },
      { name: 'FID', data: auditResult.webVitals.fid, unit: 'ms', threshold: 100 },
      { name: 'CLS', data: auditResult.webVitals.cls, unit: '', threshold: 0.1 },
      { name: 'FCP', data: auditResult.webVitals.fcp, unit: 'ms', threshold: 1800 },
      { name: 'TTFB', data: auditResult.webVitals.ttfb, unit: 'ms', threshold: 600 },
    ];

    return (
      <div className="mt-8">
        <h3 className="text-xl font-bold text-gray-900 mb-4">Core Web Vitals</h3>
        <div className="grid grid-cols-5 gap-4">
          {vitals.map((vital) => {
            if (!vital.data) return null;
            const rating = vital.data.rating;
            const ratingColor =
              rating === 'good'
                ? 'bg-green-50 border-green-300 text-green-800'
                : rating === 'needs-improvement'
                ? 'bg-yellow-50 border-yellow-300 text-yellow-800'
                : 'bg-red-50 border-red-300 text-red-800';

            return (
              <div key={vital.name} className={`p-4 rounded-lg border-2 ${ratingColor}`}>
                <div className="text-xs font-semibold mb-1">{vital.name}</div>
                <div className="text-2xl font-bold">
                  {typeof vital.data.value === 'number' ? vital.data.value.toFixed(0) : 'N/A'}
                  <span className="text-sm ml-1">{vital.unit}</span>
                </div>
                <div className="text-xs mt-1 capitalize">{rating?.replace('-', ' ')}</div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderAssetOptimization = () => {
    if (!auditResult?.assetOptimization) return null;
    const data = auditResult.assetOptimization;

    return (
      <div className="mt-8">
        <h3 className="text-xl font-bold text-gray-900 mb-4">Asset Optimization</h3>
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="bg-blue-50 p-4 rounded-lg">
            <div className="text-sm text-blue-600 mb-1">Total Assets</div>
            <div className="text-2xl font-bold text-blue-900">{data.assets?.length || 0}</div>
          </div>
          <div className="bg-purple-50 p-4 rounded-lg">
            <div className="text-sm text-purple-600 mb-1">Total Size</div>
            <div className="text-2xl font-bold text-purple-900">
              {((data.totalSize || 0) / 1024 / 1024).toFixed(2)} MB
            </div>
          </div>
          <div className="bg-green-50 p-4 rounded-lg">
            <div className="text-sm text-green-600 mb-1">Potential Savings</div>
            <div className="text-2xl font-bold text-green-900">
              {((data.potentialSavings || 0) / 1024 / 1024).toFixed(2)} MB
            </div>
          </div>
        </div>

        {data.images && data.images.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-lg p-4">
            <h4 className="font-semibold mb-3">Image Optimization Opportunities</h4>
            <div className="space-y-2">
              {data.images.slice(0, 5).map((img: any, idx: number) => (
                <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                  <div className="flex-1 truncate text-sm">{new URL(img.url).pathname}</div>
                  <div className="flex items-center gap-2 ml-4">
                    <span className="text-xs bg-orange-100 text-orange-700 px-2 py-1 rounded">
                      {img.currentFormat} → {img.recommendedFormat}
                    </span>
                    <span className="text-xs font-semibold text-green-600">
                      -{img.savingsPercent}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderRecommendations = () => {
    if (!auditResult?.recommendations) return null;

    const groupedRecs = {
      critical: auditResult.recommendations.filter((r) => r.priority === 'critical'),
      high: auditResult.recommendations.filter((r) => r.priority === 'high'),
      medium: auditResult.recommendations.filter((r) => r.priority === 'medium'),
      low: auditResult.recommendations.filter((r) => r.priority === 'low'),
    };

    return (
      <div className="mt-8">
        <h3 className="text-xl font-bold text-gray-900 mb-4">Recommendations</h3>
        <div className="space-y-3">
          {Object.entries(groupedRecs).map(([priority, recs]) =>
            recs.map((rec, idx) => (
              <div
                key={`${priority}-${idx}`}
                className={`p-4 rounded-lg border-l-4 ${getPriorityColor(priority)}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold uppercase">{rec.priority}</span>
                      <span className="text-xs text-gray-500">•</span>
                      <span className="text-xs text-gray-600">{rec.category}</span>
                    </div>
                    <h4 className="font-semibold text-gray-900 mb-1">{rec.title}</h4>
                    <p className="text-sm text-gray-700 mb-2">{rec.description}</p>
                    <div className="flex items-center gap-4 text-xs text-gray-600">
                      <span>
                        <strong>Impact:</strong> {rec.impact}
                      </span>
                      <span>
                        <strong>Effort:</strong> {rec.effort}
                      </span>
                    </div>
                  </div>
                  {rec.priority === 'critical' && <AlertTriangle className="w-5 h-5 text-red-600" />}
                  {rec.priority === 'low' && <CheckCircle className="w-5 h-5 text-green-600" />}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto bg-white rounded-lg shadow-lg p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Performance Audit Report</h2>
          <p className="text-gray-600">Comprehensive performance analysis</p>
        </div>
        <div className="flex gap-3">
          {status === 'completed' && (
            <button
              onClick={downloadReport}
              className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              <Download className="w-4 h-4" />
              Download Report
            </button>
          )}
          <button
            onClick={startAudit}
            disabled={status === 'running'}
            className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {status === 'running' ? (
              <>
                <Loader className="w-5 h-5 animate-spin" />
                Running Audit...
              </>
            ) : (
              <>
                <Activity className="w-5 h-5" />
                {status === 'completed' ? 'Run Again' : 'Start Audit'}
              </>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-2 text-red-800">
            <AlertTriangle className="w-5 h-5" />
            <span className="font-semibold">Error</span>
          </div>
          <p className="text-red-700 mt-1">{error}</p>
        </div>
      )}

      {status === 'running' && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <div className="flex items-center gap-3 mb-3">
            <Loader className="w-6 h-6 text-blue-600 animate-spin" />
            <span className="font-semibold text-blue-900">Running performance audit...</span>
          </div>
          <div className="w-full bg-blue-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
          <p className="text-sm text-blue-700 mt-2">
            This may take 30-60 seconds to complete. Please wait...
          </p>
        </div>
      )}

      {status === 'completed' && auditResult && (
        <div>
          {/* Summary Scores */}
          <div className="grid grid-cols-4 gap-4 mb-8">
            {renderScoreCard('Overall Score', auditResult.summary.overallScore, <Gauge className="w-5 h-5" />)}
            {renderScoreCard('Performance', auditResult.summary.performanceScore, <TrendingUp className="w-5 h-5" />)}
            {renderScoreCard('Optimization', auditResult.summary.optimizationScore, <Activity className="w-5 h-5" />)}
            {renderScoreCard('Security', auditResult.summary.securityScore, <CheckCircle className="w-5 h-5" />)}
          </div>

          {/* Issues Summary */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 mb-8">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-gray-700 font-medium">Total Issues:</span>{' '}
                <span className="font-bold text-gray-900">{auditResult.summary.totalIssues}</span>
              </div>
              <div>
                <span className="text-gray-700 font-medium">Critical Issues:</span>{' '}
                <span className="font-bold text-red-600">{auditResult.summary.criticalIssues}</span>
              </div>
              <div>
                <span className="text-gray-700 font-medium">Execution Time:</span>{' '}
                <span className="font-bold text-gray-900">
                  {(auditResult.executionTime / 1000).toFixed(1)}s
                </span>
              </div>
            </div>
          </div>

          {/* Detailed Results */}
          {renderWebVitals()}
          {renderAssetOptimization()}
          {renderRecommendations()}
        </div>
      )}
    </div>
  );
};
