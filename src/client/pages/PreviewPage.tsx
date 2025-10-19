import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  Monitor,
  Tablet,
  Smartphone,
  ExternalLink,
  Share2,
  QrCode,
  Zap,
  TrendingUp,
  TrendingDown,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Copy,
} from 'lucide-react';
import QRCodeReact from 'qrcode.react';

interface PerformanceMetric {
  name: string;
  before: number;
  after: number;
  unit: string;
  targetGood: number;
  targetPoor: number;
}

export default function PreviewPage() {
  const { projectId } = useParams();

  const [loading, setLoading] = useState(true);
  const [deploying, setDeploying] = useState(false);
  const [deployments, setDeployments] = useState<any[]>([]);
  const [selectedDeployment, setSelectedDeployment] = useState<any>(null);
  const [deviceMode, setDeviceMode] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [showQR, setShowQR] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [copySuccess, setCopySuccess] = useState(false);
  const [viewMode, setViewMode] = useState<'single' | 'side-by-side'>('single');
  const [originalUrl, setOriginalUrl] = useState('');
  const [optimizedUrl, setOptimizedUrl] = useState('');

  // Mock performance data (will come from API)
  const [performanceMetrics] = useState<PerformanceMetric[]>([
    {
      name: 'LCP',
      before: 3.2,
      after: 1.8,
      unit: 's',
      targetGood: 2.5,
      targetPoor: 4.0,
    },
    {
      name: 'FID',
      before: 150,
      after: 45,
      unit: 'ms',
      targetGood: 100,
      targetPoor: 300,
    },
    {
      name: 'CLS',
      before: 0.25,
      after: 0.05,
      unit: '',
      targetGood: 0.1,
      targetPoor: 0.25,
    },
    {
      name: 'FCP',
      before: 2.5,
      after: 1.2,
      unit: 's',
      targetGood: 1.8,
      targetPoor: 3.0,
    },
  ]);

  useEffect(() => {
    fetchDeployments();
  }, [projectId]);

  const fetchDeployments = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/deployment/website/${projectId}`);
      if (!response.ok) throw new Error('Failed to fetch deployments');

      const data = await response.json();
      setDeployments(data.data || []);
      if (data.data?.length > 0) {
        setSelectedDeployment(data.data[0]);
        setShareUrl(data.data[0].previewUrl);
      }
    } catch (error) {
      console.error('Error fetching deployments:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeploy = async (platform: 'vercel' | 'netlify') => {
    try {
      setDeploying(true);
      const projectName = `website-clone-${projectId}`;

      const response = await fetch('/api/deployment/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          websiteId: projectId,
          platform,
          projectName,
        }),
      });

      if (!response.ok) throw new Error('Deployment failed');

      // Refresh deployments
      await fetchDeployments();

      alert(`Successfully deployed to ${platform}!`);
    } catch (error) {
      console.error('Deployment error:', error);
      alert(`Failed to deploy: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setDeploying(false);
    }
  };

  const handleDeployBothVersions = async (platform: 'vercel' | 'netlify') => {
    try {
      setDeploying(true);
      const projectName = `website-clone-${projectId}`;

      const response = await fetch('/api/deployment/deploy-both', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          websiteId: projectId,
          platform,
          projectName,
        }),
      });

      if (!response.ok) throw new Error('Deployment failed');

      const data = await response.json();

      if (data.data) {
        setOriginalUrl(data.data.original.previewUrl);
        setOptimizedUrl(data.data.optimized.previewUrl);
        setViewMode('side-by-side');
      }

      // Refresh deployments
      await fetchDeployments();

      alert(`Successfully deployed both versions to ${platform}!`);
    } catch (error) {
      console.error('Deployment error:', error);
      alert(`Failed to deploy: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setDeploying(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  const getDeviceWidth = () => {
    switch (deviceMode) {
      case 'mobile':
        return '375px';
      case 'tablet':
        return '768px';
      default:
        return '100%';
    }
  };

  const getMetricStatus = (metric: PerformanceMetric, value: number) => {
    if (value <= metric.targetGood) return 'good';
    if (value <= metric.targetPoor) return 'needs-improvement';
    return 'poor';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'good':
        return 'text-green-600 bg-green-50 border-green-300';
      case 'needs-improvement':
        return 'text-orange-600 bg-orange-50 border-orange-300';
      case 'poor':
        return 'text-red-600 bg-red-50 border-red-300';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-300';
    }
  };

  const calculateImprovement = (before: number, after: number) => {
    return ((before - after) / before) * 100;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Live Preview</h1>
            <p className="text-gray-600 mt-2">
              Deploy and preview your optimized website
            </p>
          </div>
        </div>

        {/* Deployment Actions */}
        <div className="flex flex-wrap gap-4 mb-6">
          <button
            onClick={() => handleDeploy('vercel')}
            disabled={deploying}
            className="btn btn-primary"
          >
            {deploying ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Deploying...
              </>
            ) : (
              <>
                <Zap className="w-5 h-5 mr-2" />
                Deploy to Vercel
              </>
            )}
          </button>

          <button
            onClick={() => handleDeploy('netlify')}
            disabled={deploying}
            className="btn btn-secondary"
          >
            {deploying ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Deploying...
              </>
            ) : (
              <>
                <Zap className="w-5 h-5 mr-2" />
                Deploy to Netlify
              </>
            )}
          </button>

          <div className="w-px bg-gray-300" />

          <button
            onClick={() => handleDeployBothVersions('vercel')}
            disabled={deploying}
            className="btn btn-primary bg-purple-600 hover:bg-purple-700"
          >
            {deploying ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Deploying Both...
              </>
            ) : (
              <>
                <Share2 className="w-5 h-5 mr-2" />
                Compare Versions (Vercel)
              </>
            )}
          </button>

          <button
            onClick={() => handleDeployBothVersions('netlify')}
            disabled={deploying}
            className="btn btn-secondary"
          >
            {deploying ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Deploying Both...
              </>
            ) : (
              <>
                <Share2 className="w-5 h-5 mr-2" />
                Compare Versions (Netlify)
              </>
            )}
          </button>

          {selectedDeployment && (
            <>
              <button
                onClick={() => setShowQR(!showQR)}
                className="btn btn-secondary"
              >
                <QrCode className="w-5 h-5 mr-2" />
                {showQR ? 'Hide' : 'Show'} QR Code
              </button>

              <button
                onClick={() => copyToClipboard(shareUrl)}
                className="btn btn-secondary"
              >
                {copySuccess ? (
                  <>
                    <CheckCircle2 className="w-5 h-5 mr-2 text-green-600" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-5 h-5 mr-2" />
                    Copy Link
                  </>
                )}
              </button>

              <a
                href={selectedDeployment.previewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-secondary"
              >
                <ExternalLink className="w-5 h-5 mr-2" />
                Open in New Tab
              </a>
            </>
          )}
        </div>

        {/* QR Code Display */}
        {showQR && selectedDeployment && (
          <div className="p-6 bg-gray-50 rounded-lg border border-gray-200 mb-6">
            <div className="text-center">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Scan with Mobile Device
              </h3>
              <div className="inline-block p-4 bg-white rounded-lg shadow">
                <QRCodeReact value={selectedDeployment.previewUrl} size={200} />
              </div>
              <p className="text-sm text-gray-600 mt-4">{selectedDeployment.previewUrl}</p>
            </div>
          </div>
        )}

        {/* Deployment Status */}
        {deployments.length > 0 && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="w-5 h-5 text-blue-600" />
              <h3 className="font-semibold text-blue-900">Active Deployments</h3>
            </div>
            <div className="space-y-2">
              {deployments.map((deployment) => (
                <div
                  key={deployment.id}
                  className="flex items-center justify-between bg-white p-3 rounded border border-blue-200"
                >
                  <div>
                    <div className="font-medium text-gray-900 capitalize">
                      {deployment.platform}
                    </div>
                    <div className="text-sm text-gray-600">{deployment.previewUrl}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-2 py-1 text-xs font-medium rounded-full ${
                        deployment.status === 'success'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}
                    >
                      {deployment.status}
                    </span>
                    <button
                      onClick={() => {
                        setSelectedDeployment(deployment);
                        setShareUrl(deployment.previewUrl);
                      }}
                      className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                    >
                      Select
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Performance Comparison */}
      <div className="card">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Performance Comparison</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {performanceMetrics.map((metric) => {
            const improvement = calculateImprovement(metric.before, metric.after);
            const beforeStatus = getMetricStatus(metric, metric.before);
            const afterStatus = getMetricStatus(metric, metric.after);

            return (
              <div key={metric.name} className="border rounded-lg p-4">
                <div className="text-center mb-3">
                  <h3 className="text-lg font-semibold text-gray-900">{metric.name}</h3>
                </div>

                <div className="space-y-3">
                  {/* Before */}
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Before</div>
                    <div
                      className={`px-3 py-2 rounded border text-center font-semibold ${getStatusColor(
                        beforeStatus
                      )}`}
                    >
                      {metric.before}
                      {metric.unit}
                    </div>
                  </div>

                  {/* After */}
                  <div>
                    <div className="text-xs text-gray-500 mb-1">After</div>
                    <div
                      className={`px-3 py-2 rounded border text-center font-semibold ${getStatusColor(
                        afterStatus
                      )}`}
                    >
                      {metric.after}
                      {metric.unit}
                    </div>
                  </div>

                  {/* Improvement */}
                  <div className="flex items-center justify-center gap-2 pt-2 border-t">
                    {improvement > 0 ? (
                      <>
                        <TrendingDown className="w-4 h-4 text-green-600" />
                        <span className="text-green-600 font-semibold">
                          {improvement.toFixed(0)}% faster
                        </span>
                      </>
                    ) : (
                      <>
                        <TrendingUp className="w-4 h-4 text-red-600" />
                        <span className="text-red-600 font-semibold">
                          {Math.abs(improvement).toFixed(0)}% slower
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Device Preview Controls */}
      {(selectedDeployment || (originalUrl && optimizedUrl)) && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-gray-900">Live Preview</h2>

            <div className="flex gap-4">
              {/* View Mode Toggle */}
              {originalUrl && optimizedUrl && (
                <div className="flex gap-2 mr-4">
                  <button
                    onClick={() => setViewMode('single')}
                    className={`px-3 py-2 rounded text-sm font-medium ${
                      viewMode === 'single'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    Single View
                  </button>
                  <button
                    onClick={() => setViewMode('side-by-side')}
                    className={`px-3 py-2 rounded text-sm font-medium ${
                      viewMode === 'side-by-side'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    Side-by-Side
                  </button>
                </div>
              )}

              {/* Device Mode */}
              <div className="flex gap-2">
                <button
                  onClick={() => setDeviceMode('desktop')}
                  className={`p-2 rounded ${
                    deviceMode === 'desktop'
                      ? 'bg-blue-100 text-blue-600'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                  title="Desktop"
                >
                  <Monitor className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setDeviceMode('tablet')}
                  className={`p-2 rounded ${
                    deviceMode === 'tablet'
                      ? 'bg-blue-100 text-blue-600'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                  title="Tablet"
                >
                  <Tablet className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setDeviceMode('mobile')}
                  className={`p-2 rounded ${
                    deviceMode === 'mobile'
                      ? 'bg-blue-100 text-blue-600'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                  title="Mobile"
                >
                  <Smartphone className="w-5 h-5" />
                </button>
              </div>
            </div>
          </div>

          {/* Preview Frame */}
          {viewMode === 'single' ? (
            <div className="bg-gray-100 p-4 rounded-lg border border-gray-300">
              <div
                className="mx-auto bg-white rounded-lg shadow-lg overflow-hidden"
                style={{
                  width: getDeviceWidth(),
                  height: '600px',
                  transition: 'width 0.3s ease',
                }}
              >
                <iframe
                  src={selectedDeployment?.previewUrl || optimizedUrl}
                  className="w-full h-full"
                  title="Website Preview"
                  sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
                />
              </div>
            </div>
          ) : (
            /* Side-by-Side Comparison */
            <div className="bg-gray-100 p-4 rounded-lg border border-gray-300">
              <div className="grid grid-cols-2 gap-4">
                {/* Original Version */}
                <div>
                  <div className="bg-red-100 text-red-800 text-sm font-medium py-2 px-4 rounded-t-lg text-center">
                    Original (Before Optimization)
                  </div>
                  <div
                    className="bg-white rounded-b-lg shadow-lg overflow-hidden"
                    style={{
                      width: '100%',
                      height: '600px',
                    }}
                  >
                    <iframe
                      src={originalUrl}
                      className="w-full h-full"
                      title="Original Website"
                      sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
                    />
                  </div>
                </div>

                {/* Optimized Version */}
                <div>
                  <div className="bg-green-100 text-green-800 text-sm font-medium py-2 px-4 rounded-t-lg text-center">
                    Optimized (After Optimization)
                  </div>
                  <div
                    className="bg-white rounded-b-lg shadow-lg overflow-hidden"
                    style={{
                      width: '100%',
                      height: '600px',
                    }}
                  >
                    <iframe
                      src={optimizedUrl}
                      className="w-full h-full"
                      title="Optimized Website"
                      sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="mt-4 text-center text-sm text-gray-600">
            Currently viewing: <span className="font-medium">{viewMode}</span> mode |{' '}
            <span className="font-medium">{deviceMode}</span> ({getDeviceWidth()})
          </div>
        </div>
      )}

      {/* No Deployments State */}
      {deployments.length === 0 && (
        <div className="card text-center py-12">
          <AlertCircle className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-semibold text-gray-900 mb-2">No Deployments Yet</h3>
          <p className="text-gray-600 mb-6">
            Deploy your website to Vercel or Netlify to preview it live
          </p>
          <div className="flex gap-4 justify-center">
            <button
              onClick={() => handleDeploy('vercel')}
              disabled={deploying}
              className="btn btn-primary"
            >
              <Zap className="w-5 h-5 mr-2" />
              Deploy to Vercel
            </button>
            <button
              onClick={() => handleDeploy('netlify')}
              disabled={deploying}
              className="btn btn-secondary"
            >
              <Zap className="w-5 h-5 mr-2" />
              Deploy to Netlify
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
