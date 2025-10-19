import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type {
  ClonedWebsite,
  PerformanceAnalysis,
  OptimizationResult,
  Deployment,
  ApiResponse,
} from '../../shared/types/index.js';

interface ProjectStats {
  totalSize: number;
  optimizedSize: number;
  assetCount: number;
  issuesFound: number;
  issuesFixed: number;
  performanceScore: number;
  optimizedScore: number;
}

export default function DashboardPage() {
  const { projectId } = useParams();
  const navigate = useNavigate();

  const [website, setWebsite] = useState<ClonedWebsite | null>(null);
  const [analysis, setAnalysis] = useState<PerformanceAnalysis | null>(null);
  const [optimizations, setOptimizations] = useState<OptimizationResult[]>([]);
  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const [stats, setStats] = useState<ProjectStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadProjectData();
  }, [projectId]);

  const loadProjectData = async () => {
    try {
      setLoading(true);

      // Load website data
      const websiteRes = await fetch(`/api/clone/${projectId}`);
      if (!websiteRes.ok) {
        throw new Error('Failed to load project');
      }
      const websiteData: ApiResponse<ClonedWebsite> = await websiteRes.json();

      if (websiteData.success && websiteData.data) {
        setWebsite(websiteData.data);

        // Load performance analysis if available
        try {
          const analysisRes = await fetch(`/api/analysis/${projectId}`);
          if (analysisRes.ok) {
            const analysisData: ApiResponse<PerformanceAnalysis> = await analysisRes.json();
            if (analysisData.success && analysisData.data) {
              setAnalysis(analysisData.data);
            }
          }
        } catch (err) {
          console.log('No analysis data available yet');
        }

        // Load optimizations if available
        try {
          const optimizationsRes = await fetch(`/api/optimization/${projectId}`);
          if (optimizationsRes.ok) {
            const optimizationsData: ApiResponse<OptimizationResult[]> = await optimizationsRes.json();
            if (optimizationsData.success && optimizationsData.data) {
              setOptimizations(optimizationsData.data);
            }
          }
        } catch (err) {
          console.log('No optimization data available yet');
        }

        // Load deployment if available
        try {
          const deploymentRes = await fetch(`/api/deployment/website/${projectId}`);
          if (deploymentRes.ok) {
            const deploymentData: ApiResponse<Deployment[]> = await deploymentRes.json();
            if (deploymentData.success && deploymentData.data && deploymentData.data.length > 0) {
              setDeployment(deploymentData.data[0]);
            }
          }
        } catch (err) {
          console.log('No deployment data available yet');
        }

        // Calculate stats
        calculateStats(websiteData.data, analysis || undefined, optimizations);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load project');
    } finally {
      setLoading(false);
    }
  };

  const calculateStats = (
    site: ClonedWebsite,
    perf?: PerformanceAnalysis,
    opts: OptimizationResult[] = []
  ) => {
    const totalSize = site.metadata.totalSize;
    const optimizedSize = site.assets.reduce(
      (sum, asset) => sum + (asset.optimizedSize || asset.size),
      0
    );

    const issuesFound = perf?.issues.length || 0;
    const issuesFixed = opts.filter(opt => opt.success).length;

    const performanceScore = perf?.metrics.performanceScore || 0;
    const optimizedScore = deployment?.optimizedMetrics?.performanceScore || performanceScore;

    setStats({
      totalSize,
      optimizedSize,
      assetCount: site.metadata.assetCount,
      issuesFound,
      issuesFixed,
      performanceScore,
      optimizedScore,
    });
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const getScoreColor = (score: number): string => {
    if (score >= 90) return 'text-green-600';
    if (score >= 50) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getStatusBadge = (status: string): JSX.Element => {
    const colors: Record<string, string> = {
      cloning: 'bg-blue-100 text-blue-800',
      analyzing: 'bg-purple-100 text-purple-800',
      optimizing: 'bg-yellow-100 text-yellow-800',
      ready: 'bg-green-100 text-green-800',
      error: 'bg-red-100 text-red-800',
    };

    return (
      <span className={`px-3 py-1 rounded-full text-sm font-medium ${colors[status] || 'bg-gray-100 text-gray-800'}`}>
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="animate-pulse">
          <div className="h-8 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            {[1, 2, 3].map((i) => (
              <div key={i} className="card h-32 bg-gray-100"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error || !website) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="card bg-red-50 border-red-200">
          <h2 className="text-xl font-bold text-red-800 mb-2">Error Loading Project</h2>
          <p className="text-red-600">{error || 'Project not found'}</p>
          <button
            onClick={() => navigate('/')}
            className="mt-4 btn-secondary"
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">{website.name}</h1>
            <p className="text-gray-600">
              {website.sourceUrl && (
                <a
                  href={website.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  {website.sourceUrl}
                </a>
              )}
            </p>
          </div>
          {getStatusBadge(website.status)}
        </div>

        <div className="flex flex-wrap gap-2 text-sm text-gray-600">
          <span>Created: {new Date(website.createdAt).toLocaleDateString()}</span>
          <span>•</span>
          <span>{website.metadata.pageCount} {website.metadata.pageCount === 1 ? 'page' : 'pages'}</span>
          <span>•</span>
          <span>{website.metadata.assetCount} assets</span>
          {website.metadata.framework && (
            <>
              <span>•</span>
              <span>Framework: {website.metadata.framework}</span>
            </>
          )}
        </div>
      </div>

      {/* Statistics Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* Performance Score */}
          <div className="card">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-600">Performance Score</h3>
              <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
            <div className="flex items-baseline justify-between">
              <div>
                <p className={`text-3xl font-bold ${getScoreColor(stats.performanceScore)}`}>
                  {Math.round(stats.performanceScore)}
                </p>
                {stats.optimizedScore > stats.performanceScore && (
                  <p className="text-sm text-green-600 mt-1">
                    → {Math.round(stats.optimizedScore)} (+{Math.round(stats.optimizedScore - stats.performanceScore)})
                  </p>
                )}
              </div>
              <span className="text-gray-400 text-sm">/ 100</span>
            </div>
          </div>

          {/* File Size */}
          <div className="card">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-600">Total Size</h3>
              <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div className="flex items-baseline justify-between">
              <div>
                <p className="text-3xl font-bold text-gray-900">{formatBytes(stats.totalSize)}</p>
                {stats.optimizedSize < stats.totalSize && (
                  <p className="text-sm text-green-600 mt-1">
                    → {formatBytes(stats.optimizedSize)} (-{Math.round((1 - stats.optimizedSize / stats.totalSize) * 100)}%)
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Issues */}
          <div className="card">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium text-gray-600">Issues</h3>
              <svg className="w-5 h-5 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="flex items-baseline justify-between">
              <div>
                <p className="text-3xl font-bold text-gray-900">{stats.issuesFound}</p>
                {stats.issuesFixed > 0 && (
                  <p className="text-sm text-green-600 mt-1">
                    {stats.issuesFixed} fixed ({Math.round((stats.issuesFixed / stats.issuesFound) * 100)}%)
                  </p>
                )}
              </div>
              <span className="text-gray-400 text-sm">found</span>
            </div>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div className="card mb-8">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <button
            onClick={() => navigate(`/analysis/${projectId}`)}
            className={`p-4 border-2 rounded-lg text-left hover:border-blue-500 hover:bg-blue-50 transition-colors ${
              analysis ? 'border-green-200 bg-green-50' : 'border-gray-200'
            }`}
          >
            <div className="flex items-center mb-2">
              <svg className="w-6 h-6 text-blue-600 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <h3 className="font-semibold text-gray-900">Analyze</h3>
            </div>
            <p className="text-sm text-gray-600">
              {analysis ? 'View performance analysis' : 'Run performance analysis'}
            </p>
            {analysis && (
              <span className="inline-block mt-2 text-xs text-green-600 font-medium">✓ Completed</span>
            )}
          </button>

          <button
            onClick={() => navigate(`/optimization/${projectId}`)}
            className={`p-4 border-2 rounded-lg text-left hover:border-blue-500 hover:bg-blue-50 transition-colors ${
              optimizations.length > 0 ? 'border-green-200 bg-green-50' : 'border-gray-200'
            }`}
            disabled={!analysis}
          >
            <div className="flex items-center mb-2">
              <svg className="w-6 h-6 text-yellow-600 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <h3 className="font-semibold text-gray-900">Optimize</h3>
            </div>
            <p className="text-sm text-gray-600">
              {optimizations.length > 0 ? `${optimizations.length} optimizations applied` : 'Apply performance optimizations'}
            </p>
            {optimizations.length > 0 && (
              <span className="inline-block mt-2 text-xs text-green-600 font-medium">✓ {optimizations.filter(o => o.success).length} successful</span>
            )}
          </button>

          <button
            onClick={() => navigate(`/preview/${projectId}`)}
            className={`p-4 border-2 rounded-lg text-left hover:border-blue-500 hover:bg-blue-50 transition-colors ${
              deployment ? 'border-green-200 bg-green-50' : 'border-gray-200'
            }`}
            disabled={!website}
          >
            <div className="flex items-center mb-2">
              <svg className="w-6 h-6 text-purple-600 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              <h3 className="font-semibold text-gray-900">Preview</h3>
            </div>
            <p className="text-sm text-gray-600">
              {deployment ? 'View live preview' : 'Deploy live preview'}
            </p>
            {deployment && (
              <span className="inline-block mt-2 text-xs text-green-600 font-medium">✓ Deployed</span>
            )}
          </button>

          <button
            onClick={() => navigate(`/export/${projectId}`)}
            className="p-4 border-2 border-gray-200 rounded-lg text-left hover:border-blue-500 hover:bg-blue-50 transition-colors"
            disabled={!analysis}
          >
            <div className="flex items-center mb-2">
              <svg className="w-6 h-6 text-green-600 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              <h3 className="font-semibold text-gray-900">Export</h3>
            </div>
            <p className="text-sm text-gray-600">Export to WordPress builder</p>
          </button>
        </div>
      </div>

      {/* Performance Issues Summary */}
      {analysis && analysis.issues.length > 0 && (
        <div className="card mb-8">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Performance Issues</h2>
          <div className="space-y-3">
            {analysis.issues.slice(0, 5).map((issue) => (
              <div
                key={issue.id}
                className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium ${
                        issue.severity === 'critical'
                          ? 'bg-red-100 text-red-800'
                          : issue.severity === 'high'
                          ? 'bg-orange-100 text-orange-800'
                          : issue.severity === 'medium'
                          ? 'bg-yellow-100 text-yellow-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}
                    >
                      {issue.severity}
                    </span>
                    <h3 className="font-medium text-gray-900">{issue.title}</h3>
                  </div>
                  <p className="text-sm text-gray-600">{issue.description}</p>
                </div>
                <div className="text-right ml-4">
                  <p className="text-sm font-medium text-gray-900">
                    Impact: {issue.impact}%
                  </p>
                  {issue.estimatedSavings.bytes && (
                    <p className="text-xs text-gray-500">
                      Save: {formatBytes(issue.estimatedSavings.bytes)}
                    </p>
                  )}
                </div>
              </div>
            ))}
            {analysis.issues.length > 5 && (
              <button
                onClick={() => navigate(`/analysis/${projectId}`)}
                className="text-blue-600 hover:underline text-sm font-medium"
              >
                View all {analysis.issues.length} issues →
              </button>
            )}
          </div>
        </div>
      )}

      {/* Deployment Info */}
      {deployment && (
        <div className="card">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Live Preview</h2>
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-600">Provider:</span>
              <span className="text-sm text-gray-900 capitalize">{deployment.provider}</span>
            </div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-600">Status:</span>
              {getStatusBadge(deployment.status)}
            </div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-600">URL:</span>
              <a
                href={deployment.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:underline"
              >
                View Live →
              </a>
            </div>
            {deployment.expiresAt && (
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-600">Expires:</span>
                <span className="text-sm text-gray-900">
                  {new Date(deployment.expiresAt).toLocaleDateString()}
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
