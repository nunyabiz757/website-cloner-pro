import React, { useState, useEffect, useRef } from 'react';
import {
  Eye,
  ExternalLink,
  Clock,
  Share2,
  Download,
  Trash2,
  Copy,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  Zap,
} from 'lucide-react';

interface LivePreviewProps {
  cloneId: string;
  htmlContent: string;
  assets?: Array<{ path: string; content: string }>;
}

interface HostedSite {
  id: string;
  previewUrl: string;
  name: string;
  createdAt: string;
  expiresAt: string;
  size: number;
  fileCount: number;
}

export const LivePreview: React.FC<LivePreviewProps> = ({ cloneId, htmlContent, assets = [] }) => {
  const [hostedSite, setHostedSite] = useState<HostedSite | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [realtimeEnabled, setRealtimeEnabled] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    return () => {
      // Cleanup WebSocket on unmount
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const hostSite = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/preview/host', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cloneId,
          htmlContent,
          assets,
          options: {
            name: `Preview ${cloneId}`,
            ttlHours: 24,
            allowIndexing: false,
          },
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to host site');
      }

      setHostedSite(data.site);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to host site');
    } finally {
      setLoading(false);
    }
  };

  const deleteSite = async () => {
    if (!hostedSite) return;

    try {
      const response = await fetch(`/api/preview/hosted/${hostedSite.id}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setHostedSite(null);
        setRealtimeEnabled(false);
        if (wsRef.current) {
          wsRef.current.close();
          wsRef.current = null;
        }
      }
    } catch (err) {
      console.error('Failed to delete site:', err);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const downloadSite = async () => {
    if (!hostedSite) return;

    try {
      const response = await fetch(`/api/preview/hosted/${hostedSite.id}/download`);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `preview-${hostedSite.id}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      console.error('Failed to download:', err);
    }
  };

  const enableRealtimePreview = async () => {
    if (!hostedSite) return;

    try {
      // Create real-time session
      const response = await fetch('/api/preview/realtime/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cloneId,
        }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setRealtimeEnabled(true);

        // Connect WebSocket
        const ws = new WebSocket(`ws://localhost:5000${data.wsUrl}`);

        ws.onopen = () => {
          console.log('WebSocket connected');
        };

        ws.onmessage = (event) => {
          const message = JSON.parse(event.data);
          handleWebSocketMessage(message);
        };

        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          setRealtimeEnabled(false);
        };

        ws.onclose = () => {
          console.log('WebSocket closed');
          setRealtimeEnabled(false);
        };

        wsRef.current = ws;
      }
    } catch (err) {
      console.error('Failed to enable real-time preview:', err);
    }
  };

  const handleWebSocketMessage = (message: any) => {
    switch (message.type) {
      case 'connected':
        console.log('Real-time preview connected');
        break;

      case 'html':
      case 'full-reload':
        // Reload iframe
        if (iframeRef.current) {
          iframeRef.current.src = iframeRef.current.src;
        }
        break;

      case 'css':
        console.log('CSS updated');
        // In a real implementation, inject CSS without reload
        break;

      default:
        console.log('Unknown message:', message);
    }
  };

  const refreshPreview = () => {
    if (iframeRef.current) {
      iframeRef.current.src = iframeRef.current.src;
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const getTimeRemaining = () => {
    if (!hostedSite) return '';
    const now = new Date();
    const expires = new Date(hostedSite.expiresAt);
    const diff = expires.getTime() - now.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    return `${hours}h remaining`;
  };

  const getFullPreviewUrl = () => {
    if (!hostedSite) return '';
    return `${window.location.origin}${hostedSite.previewUrl}`;
  };

  return (
    <div className="max-w-7xl mx-auto bg-white rounded-lg shadow-lg p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Live Preview</h2>
          <p className="text-gray-600">Preview your cloned site with temporary hosting</p>
        </div>

        {!hostedSite ? (
          <button
            onClick={hostSite}
            disabled={loading}
            className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Eye className="w-5 h-5" />
            {loading ? 'Hosting...' : 'Host Site'}
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={refreshPreview}
              className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
              title="Refresh preview"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            <button
              onClick={enableRealtimePreview}
              disabled={realtimeEnabled}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                realtimeEnabled
                  ? 'bg-green-100 text-green-700'
                  : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
              }`}
              title="Enable live reload"
            >
              <Zap className="w-4 h-4" />
              {realtimeEnabled ? 'Live' : 'Enable Live'}
            </button>
            <button
              onClick={() => window.open(getFullPreviewUrl(), '_blank')}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 transition-colors"
              title="Open in new tab"
            >
              <ExternalLink className="w-4 h-4" />
            </button>
            <button
              onClick={downloadSite}
              className="flex items-center gap-2 px-4 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors"
              title="Download as ZIP"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              onClick={deleteSite}
              className="flex items-center gap-2 px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
              title="Delete hosted site"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-2 text-red-800">
            <AlertCircle className="w-5 h-5" />
            <span className="font-semibold">Error</span>
          </div>
          <p className="text-red-700 mt-1">{error}</p>
        </div>
      )}

      {hostedSite && (
        <>
          {/* Preview Info Bar */}
          <div className="bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-200 rounded-lg p-4 mb-6">
            <div className="grid grid-cols-4 gap-4">
              <div>
                <div className="text-xs text-indigo-600 font-semibold mb-1">Preview URL</div>
                <div className="flex items-center gap-2">
                  <code className="text-sm text-indigo-900 truncate">{hostedSite.previewUrl}</code>
                  <button
                    onClick={() => copyToClipboard(getFullPreviewUrl())}
                    className="p-1 hover:bg-indigo-100 rounded transition-colors"
                  >
                    {copied ? (
                      <CheckCircle className="w-4 h-4 text-green-600" />
                    ) : (
                      <Copy className="w-4 h-4 text-indigo-600" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <div className="text-xs text-indigo-600 font-semibold mb-1">Size</div>
                <div className="text-sm font-medium text-indigo-900">
                  {formatBytes(hostedSite.size)} ({hostedSite.fileCount} files)
                </div>
              </div>

              <div>
                <div className="text-xs text-indigo-600 font-semibold mb-1">Expires In</div>
                <div className="flex items-center gap-2 text-sm font-medium text-indigo-900">
                  <Clock className="w-4 h-4" />
                  {getTimeRemaining()}
                </div>
              </div>

              <div>
                <div className="text-xs text-indigo-600 font-semibold mb-1">Status</div>
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${realtimeEnabled ? 'bg-green-500 animate-pulse' : 'bg-blue-500'}`}></div>
                  <span className="text-sm font-medium text-indigo-900">
                    {realtimeEnabled ? 'Live' : 'Active'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Preview Frame */}
          <div className="border-4 border-gray-200 rounded-lg overflow-hidden shadow-xl" style={{ height: '800px' }}>
            <iframe
              ref={iframeRef}
              src={getFullPreviewUrl()}
              className="w-full h-full bg-white"
              title="Live Preview"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            />
          </div>

          {/* Share Section */}
          <div className="mt-6 bg-gray-50 border border-gray-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Share2 className="w-5 h-5 text-gray-600" />
                <span className="font-semibold text-gray-900">Share Preview</span>
              </div>
              <button
                onClick={() => copyToClipboard(getFullPreviewUrl())}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors text-sm"
              >
                {copied ? (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    Copy Link
                  </>
                )}
              </button>
            </div>
            <p className="text-xs text-gray-600 mt-2">
              Share this link to let others preview your cloned site. The preview will expire in {getTimeRemaining()}.
            </p>
          </div>
        </>
      )}

      {!hostedSite && !loading && (
        <div className="text-center py-20 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <Eye className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Preview Active</h3>
          <p className="text-gray-600 mb-6">Host your cloned site to generate a live preview URL</p>
          <button
            onClick={hostSite}
            className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors"
          >
            <Eye className="w-5 h-5" />
            Start Hosting
          </button>
        </div>
      )}
    </div>
  );
};
