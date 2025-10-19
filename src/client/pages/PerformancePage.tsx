import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Activity,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Clock,
  Zap,
  Image,
  FileCode,
  Type,
  Layout,
  Package,
} from 'lucide-react';
import axios from 'axios';
import type { PerformanceAnalysis, PerformanceIssue } from '../../shared/types';
import PerformanceModeSelector, { type OptimizationMode } from '../components/performance/PerformanceModeSelector';
import UnusedAssetsPanel, { type UnusedAssetsReport } from '../components/assets/UnusedAssetsPanel';

export default function PerformancePage() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [analysis, setAnalysis] = useState<PerformanceAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'issues' | 'opportunities' | 'optimize' | 'assets'>('overview');

  // Optimization mode state
  const [optimizationMode, setOptimizationMode] = useState<OptimizationMode>('balanced');
  const [customFixes, setCustomFixes] = useState<string[]>([]);
  const [optimizing, setOptimizing] = useState(false);

  // Unused assets state
  const [assetsReport, setAssetsReport] = useState<UnusedAssetsReport | null>(null);
  const [loadingAssets, setLoadingAssets] = useState(false);

  useEffect(() => {
    loadPerformanceData();
  }, [projectId]);

  const loadPerformanceData = async () => {
    try {
      const response = await axios.get(`/api/performance/${projectId}`);
      if (response.data.success) {
        setAnalysis(response.data.data);
      }
    } catch (error) {
      console.error('Failed to load performance data:', error);
    } finally {
      setLoading(false);
    }
  };

  const runAnalysis = async () => {
    setLoading(true);
    try {
      const response = await axios.post('/api/performance/analyze', {
        websiteId: projectId,
      });
      if (response.data.success) {
        setAnalysis(response.data.data);
      }
    } catch (error) {
      console.error('Performance analysis failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOptimize = async () => {
    setOptimizing(true);
    try {
      const response = await axios.post('/api/performance/optimize', {
        projectId,
        mode: optimizationMode,
        customFixes: optimizationMode === 'custom' ? customFixes : undefined,
      });

      if (response.data.success) {
        // Show success message
        alert(`Optimization applied successfully! ${response.data.fixesApplied || 0} fixes applied.`);
        // Re-run analysis to see improvements
        await runAnalysis();
      }
    } catch (error) {
      console.error('Optimization failed:', error);
      alert('Failed to apply optimizations. Please try again.');
    } finally {
      setOptimizing(false);
    }
  };

  const loadUnusedAssets = async () => {
    setLoadingAssets(true);
    try {
      const response = await axios.get(`/api/assets/unused/${projectId}`);
      if (response.data.success) {
        setAssetsReport(response.data.data);
      }
    } catch (error) {
      console.error('Failed to load unused assets:', error);
    } finally {
      setLoadingAssets(false);
    }
  };

  const handleRemoveAssets = async (assetUrls: string[]) => {
    try {
      const response = await axios.post(`/api/assets/remove/${projectId}`, {
        assets: assetUrls
      });

      if (response.data.success) {
        alert(`${assetUrls.length} asset(s) removed successfully!`);
        // Reload assets report
        await loadUnusedAssets();
      }
    } catch (error) {
      console.error('Failed to remove assets:', error);
      throw error;
    }
  };

  // Load unused assets when switching to assets tab
  useEffect(() => {
    if (activeTab === 'assets' && !assetsReport && !loadingAssets) {
      loadUnusedAssets();
    }
  }, [activeTab]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Analyzing performance...</p>
        </div>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="card text-center max-w-2xl mx-auto">
        <Activity className="w-16 h-16 text-gray-400 mx-auto mb-4" />
        <h2 className="text-2xl font-bold text-gray-900 mb-2">No Performance Analysis Yet</h2>
        <p className="text-gray-600 mb-6">
          Run a comprehensive performance analysis to identify optimization opportunities.
        </p>
        <button onClick={runAnalysis} className="btn-primary">
          Run Performance Analysis
        </button>
      </div>
    );
  }

  const { metrics, issues, opportunities, lighthouse } = analysis;

  return (
    <div className="max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Performance Dashboard</h1>
          <p className="text-gray-600">
            Analyzed on {new Date(analysis.analyzedAt).toLocaleString()}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(`/performance/${projectId}/report`)}
            className="btn-secondary flex items-center gap-2"
          >
            <TrendingUp className="w-4 h-4" />
            View Detailed Report
          </button>
          <button onClick={runAnalysis} className="btn-secondary">
            Re-analyze
          </button>
        </div>
      </div>

      {/* Overview Score Cards */}
      <div className="grid md:grid-cols-5 gap-4 mb-8">
        <ScoreCard
          title="Performance"
          score={lighthouse.performanceScore}
          icon={Zap}
          color="primary"
        />
        <ScoreCard
          title="Accessibility"
          score={lighthouse.accessibilityScore}
          icon={Activity}
          color="success"
        />
        <ScoreCard
          title="Best Practices"
          score={lighthouse.bestPracticesScore}
          icon={CheckCircle}
          color="primary"
        />
        <ScoreCard
          title="SEO"
          score={lighthouse.seoScore}
          icon={TrendingUp}
          color="success"
        />
        <ScoreCard
          title="Issues Found"
          score={issues.length + opportunities.length}
          icon={AlertTriangle}
          color="warning"
          isCount
        />
      </div>

      {/* Core Web Vitals */}
      <div className="card mb-8">
        <h2 className="text-xl font-bold text-gray-900 mb-6 flex items-center">
          <Activity className="w-5 h-5 mr-2" />
          Core Web Vitals
        </h2>
        <div className="grid md:grid-cols-5 gap-6">
          <MetricCard metric={metrics.lcp} name="LCP" description="Largest Contentful Paint" />
          <MetricCard metric={metrics.fid} name="FID" description="First Input Delay" />
          <MetricCard metric={metrics.inp} name="INP" description="Interaction to Next Paint" />
          <MetricCard metric={metrics.cls} name="CLS" description="Cumulative Layout Shift" />
          <MetricCard metric={metrics.fcp} name="FCP" description="First Contentful Paint" />
        </div>
      </div>

      {/* Additional Metrics */}
      <div className="card mb-8">
        <h2 className="text-xl font-bold text-gray-900 mb-6">Additional Metrics</h2>
        <div className="grid md:grid-cols-4 gap-6">
          <MetricCard metric={metrics.tbt} name="TBT" description="Total Blocking Time" />
          <MetricCard metric={metrics.speedIndex} name="Speed Index" description="Speed Index" />
          <MetricCard metric={metrics.tti} name="TTI" description="Time to Interactive" />
          <MetricCard metric={metrics.ttfb} name="TTFB" description="Time to First Byte" />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex space-x-2 mb-6 border-b border-gray-200">
        <TabButton
          active={activeTab === 'overview'}
          onClick={() => setActiveTab('overview')}
          label="Overview"
          count={issues.length + opportunities.length}
        />
        <TabButton
          active={activeTab === 'issues'}
          onClick={() => setActiveTab('issues')}
          label="Critical Issues"
          count={issues.length}
        />
        <TabButton
          active={activeTab === 'opportunities'}
          onClick={() => setActiveTab('opportunities')}
          label="Opportunities"
          count={opportunities.length}
        />
        <TabButton
          active={activeTab === 'optimize'}
          onClick={() => setActiveTab('optimize')}
          label="Optimize"
        />
        <TabButton
          active={activeTab === 'assets'}
          onClick={() => setActiveTab('assets')}
          label="Unused Assets"
        />
      </div>

      {/* Issues List */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {issues.length > 0 && (
            <div className="card">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Critical & High Priority Issues
              </h3>
              <div className="space-y-3">
                {issues.slice(0, 5).map((issue) => (
                  <IssueCard key={issue.id} issue={issue} />
                ))}
              </div>
            </div>
          )}

          {opportunities.length > 0 && (
            <div className="card">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Top Optimization Opportunities
              </h3>
              <div className="space-y-3">
                {opportunities.slice(0, 5).map((issue) => (
                  <IssueCard key={issue.id} issue={issue} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'issues' && (
        <div className="card">
          <div className="space-y-3">
            {issues.map((issue) => (
              <IssueCard key={issue.id} issue={issue} detailed />
            ))}
          </div>
        </div>
      )}

      {activeTab === 'opportunities' && (
        <div className="card">
          <div className="space-y-3">
            {opportunities.map((issue) => (
              <IssueCard key={issue.id} issue={issue} detailed />
            ))}
          </div>
        </div>
      )}

      {activeTab === 'optimize' && (
        <div className="space-y-6">
          <PerformanceModeSelector
            mode={optimizationMode}
            onModeChange={setOptimizationMode}
            selectedFixes={customFixes}
            onFixesChange={setCustomFixes}
          />

          <div className="flex items-center justify-between p-6 bg-white border border-gray-200 rounded-lg">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">Ready to Optimize?</h3>
              <p className="text-sm text-gray-600">
                {optimizationMode === 'custom'
                  ? `${customFixes.length} optimization${customFixes.length !== 1 ? 's' : ''} selected`
                  : `Apply ${optimizationMode} mode optimizations to improve performance`}
              </p>
            </div>
            <button
              onClick={handleOptimize}
              disabled={optimizing || (optimizationMode === 'custom' && customFixes.length === 0)}
              className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {optimizing ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  Optimizing...
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  Apply Optimizations
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {activeTab === 'assets' && (
        <div>
          {loadingAssets ? (
            <div className="flex items-center justify-center min-h-96">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
                <p className="text-gray-600">Scanning for unused assets...</p>
              </div>
            </div>
          ) : assetsReport ? (
            <UnusedAssetsPanel
              report={assetsReport}
              onRemoveAssets={handleRemoveAssets}
              onRefresh={loadUnusedAssets}
            />
          ) : (
            <div className="card text-center">
              <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Scan for Unused Assets</h2>
              <p className="text-gray-600 mb-6">
                Identify images, CSS, JavaScript, and fonts that are not being used.
              </p>
              <button onClick={loadUnusedAssets} className="btn-primary">
                Scan Assets
              </button>
            </div>
          )}
        </div>
      )}

      {/* Action Button */}
      <div className="mt-8 flex justify-center">
        <button
          onClick={() => navigate(`/optimization/${projectId}`)}
          className="btn-primary text-lg px-8 py-3"
        >
          <Zap className="w-5 h-5 inline mr-2" />
          Start Optimization
        </button>
      </div>
    </div>
  );
}

interface ScoreCardProps {
  title: string;
  score: number;
  icon: React.FC<{ className?: string }>;
  color: string;
  isCount?: boolean;
}

function ScoreCard({ title, score, icon: Icon, color, isCount }: ScoreCardProps) {
  const getScoreColor = () => {
    if (isCount) return 'text-warning-600';
    if (score >= 90) return 'text-success-600';
    if (score >= 50) return 'text-warning-600';
    return 'text-danger-600';
  };

  return (
    <div className="card text-center">
      <Icon className={`w-8 h-8 text-${color}-600 mx-auto mb-2`} />
      <div className={`text-3xl font-bold ${getScoreColor()}`}>
        {isCount ? score : score}
      </div>
      <div className="text-sm text-gray-600 mt-1">{title}</div>
    </div>
  );
}

interface MetricCardProps {
  metric: any;
  name: string;
  description: string;
}

function MetricCard({ metric, name, description }: MetricCardProps) {
  const getRatingClass = () => {
    switch (metric.rating) {
      case 'good':
        return 'metric-good';
      case 'needs-improvement':
        return 'metric-needs-improvement';
      case 'poor':
        return 'metric-poor';
      default:
        return 'bg-gray-50 text-gray-600';
    }
  };

  return (
    <div className={`p-4 rounded-lg ${getRatingClass()}`}>
      <div className="text-2xl font-bold mb-1">
        {metric.value.toFixed(metric.unit === '' ? 2 : 0)}
        <span className="text-sm font-normal ml-1">{metric.unit}</span>
      </div>
      <div className="font-semibold text-sm mb-1">{name}</div>
      <div className="text-xs opacity-75">{description}</div>
      <div className="text-xs mt-2 opacity-75">
        Target: {metric.target}{metric.unit}
      </div>
    </div>
  );
}

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
}

function TabButton({ active, onClick, label, count }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 font-medium text-sm border-b-2 transition-colors ${
        active
          ? 'border-primary-600 text-primary-600'
          : 'border-transparent text-gray-600 hover:text-gray-900'
      }`}
    >
      {label}
      {count !== undefined && (
        <span className="ml-2 px-2 py-0.5 bg-gray-200 rounded-full text-xs">
          {count}
        </span>
      )}
    </button>
  );
}

interface IssueCardProps {
  issue: PerformanceIssue;
  detailed?: boolean;
}

function IssueCard({ issue, detailed }: IssueCardProps) {
  const [expanded, setExpanded] = useState(false);

  const getCategoryIcon = () => {
    switch (issue.category) {
      case 'images':
        return Image;
      case 'css':
      case 'javascript':
        return FileCode;
      case 'fonts':
        return Type;
      case 'layout-stability':
        return Layout;
      default:
        return Activity;
    }
  };

  const Icon = getCategoryIcon();

  return (
    <div className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex items-start space-x-3 flex-1">
          <Icon className="w-5 h-5 text-gray-400 mt-0.5" />
          <div className="flex-1">
            <div className="flex items-center space-x-2 mb-1">
              <h4 className="font-semibold text-gray-900">{issue.title}</h4>
              <span className={`badge-${issue.severity}`}>{issue.severity}</span>
              {issue.autoFixable && (
                <span className="badge bg-success-100 text-success-700">Auto-fixable</span>
              )}
            </div>
            <p className="text-sm text-gray-600 mb-2">{issue.description}</p>

            {issue.estimatedSavings && (
              <div className="flex items-center space-x-4 text-xs text-gray-500">
                {issue.estimatedSavings.ms && (
                  <span>
                    <Clock className="w-3 h-3 inline mr-1" />
                    Save {issue.estimatedSavings.ms}ms
                  </span>
                )}
                {issue.estimatedSavings.bytes && (
                  <span>
                    Save {(issue.estimatedSavings.bytes / 1024).toFixed(1)}KB
                  </span>
                )}
              </div>
            )}

            {detailed && expanded && issue.afterCode && (
              <div className="mt-3 p-3 bg-gray-50 rounded text-xs font-mono">
                <div className="text-gray-700 font-semibold mb-1">Suggested Fix:</div>
                <pre className="text-gray-800 overflow-x-auto">{issue.afterCode}</pre>
              </div>
            )}
          </div>
        </div>

        <div className="text-right ml-4">
          <div className="text-2xl font-bold text-primary-600">{issue.impact}</div>
          <div className="text-xs text-gray-500">Impact</div>
        </div>
      </div>

      {detailed && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-primary-600 hover:text-primary-700 mt-2"
        >
          {expanded ? 'Show less' : 'Show suggested fix'}
        </button>
      )}
    </div>
  );
}
