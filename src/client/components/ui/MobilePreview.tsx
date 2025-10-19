import React, { useState, useEffect } from 'react';
import {
  Smartphone,
  Tablet,
  Monitor,
  RotateCw,
  RefreshCw,
  Loader,
  AlertCircle,
  CheckCircle,
  Info,
} from 'lucide-react';

interface MobilePreviewProps {
  url: string;
}

interface Device {
  name: string;
  width: number;
  height: number;
  category: 'mobile' | 'tablet' | 'desktop';
}

interface SimulationResult {
  device: string;
  screenshot: string;
  metrics: {
    loadTime: number;
    domContentLoaded: number;
    firstPaint: number;
    layoutShifts: number;
  };
  issues: string[];
  viewport: {
    width: number;
    height: number;
    deviceScaleFactor: number;
  };
}

export const MobilePreview: React.FC<MobilePreviewProps> = ({ url }) => {
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<'mobile' | 'tablet' | 'desktop'>('mobile');
  const [simulationResult, setSimulationResult] = useState<SimulationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');

  useEffect(() => {
    fetchDevices();
  }, []);

  useEffect(() => {
    fetchDevices(selectedCategory);
  }, [selectedCategory]);

  const fetchDevices = async (category?: string) => {
    try {
      const categoryParam = category ? `?category=${category}` : '';
      const response = await fetch(`/api/preview/devices${categoryParam}`);
      const data = await response.json();

      if (data.success) {
        setDevices(data.devices);
        if (data.devices.length > 0 && !selectedDevice) {
          setSelectedDevice(data.devices[0].name);
        }
      }
    } catch (err) {
      console.error('Failed to fetch devices:', err);
    }
  };

  const simulateDevice = async () => {
    if (!selectedDevice) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/preview/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          deviceName: selectedDevice,
          options: {
            fullPage: false,
            quality: 90,
            type: 'png',
          },
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to simulate device');
      }

      setSimulationResult(data.result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to simulate device');
    } finally {
      setLoading(false);
    }
  };

  const simulateRotation = async () => {
    if (!selectedDevice) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/preview/simulate-rotation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          deviceName: selectedDevice,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to simulate rotation');
      }

      const newOrientation = orientation === 'portrait' ? 'landscape' : 'portrait';
      setOrientation(newOrientation);
      setSimulationResult(
        newOrientation === 'portrait' ? data.result.portrait : data.result.landscape
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to simulate rotation');
    } finally {
      setLoading(false);
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'mobile':
        return <Smartphone className="w-5 h-5" />;
      case 'tablet':
        return <Tablet className="w-5 h-5" />;
      case 'desktop':
        return <Monitor className="w-5 h-5" />;
      default:
        return <Smartphone className="w-5 h-5" />;
    }
  };

  const getIssueIcon = (issue: string) => {
    if (issue.toLowerCase().includes('horizontal')) {
      return <AlertCircle className="w-4 h-4 text-red-500" />;
    }
    if (issue.toLowerCase().includes('small')) {
      return <AlertCircle className="w-4 h-4 text-orange-500" />;
    }
    return <Info className="w-4 h-4 text-yellow-500" />;
  };

  const getMetricColor = (value: number, metric: string) => {
    if (metric === 'loadTime') {
      return value < 3000 ? 'text-green-600' : value < 5000 ? 'text-yellow-600' : 'text-red-600';
    }
    if (metric === 'layoutShifts') {
      return value < 0.1 ? 'text-green-600' : value < 0.25 ? 'text-yellow-600' : 'text-red-600';
    }
    return 'text-gray-900';
  };

  return (
    <div className="max-w-7xl mx-auto bg-white rounded-lg shadow-lg p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Mobile Device Simulation</h2>
          <p className="text-gray-600">Test your site across different devices and viewports</p>
        </div>

        <button
          onClick={simulateDevice}
          disabled={loading || !selectedDevice}
          className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? (
            <>
              <Loader className="w-5 h-5 animate-spin" />
              Simulating...
            </>
          ) : (
            <>
              <Smartphone className="w-5 h-5" />
              Simulate Device
            </>
          )}
        </button>
      </div>

      {/* Category Selector */}
      <div className="flex gap-2 mb-6">
        {['mobile', 'tablet', 'desktop'].map((category) => (
          <button
            key={category}
            onClick={() => setSelectedCategory(category as any)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              selectedCategory === category
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {getCategoryIcon(category)}
            <span className="capitalize">{category}</span>
          </button>
        ))}
      </div>

      {/* Device Selector */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">Select Device</label>
        <select
          value={selectedDevice}
          onChange={(e) => setSelectedDevice(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        >
          {devices.map((device) => (
            <option key={device.name} value={device.name}>
              {device.name} ({device.width}x{device.height})
            </option>
          ))}
        </select>
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

      {simulationResult && (
        <div className="space-y-6">
          {/* Metrics */}
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Performance Metrics</h3>
            <div className="grid grid-cols-4 gap-4">
              <div>
                <div className="text-xs text-blue-600 font-semibold mb-1">Load Time</div>
                <div className={`text-2xl font-bold ${getMetricColor(simulationResult.metrics.loadTime, 'loadTime')}`}>
                  {simulationResult.metrics.loadTime}ms
                </div>
              </div>
              <div>
                <div className="text-xs text-blue-600 font-semibold mb-1">DOM Content Loaded</div>
                <div className="text-2xl font-bold text-gray-900">
                  {simulationResult.metrics.domContentLoaded}ms
                </div>
              </div>
              <div>
                <div className="text-xs text-blue-600 font-semibold mb-1">First Paint</div>
                <div className="text-2xl font-bold text-gray-900">
                  {simulationResult.metrics.firstPaint.toFixed(0)}ms
                </div>
              </div>
              <div>
                <div className="text-xs text-blue-600 font-semibold mb-1">Layout Shifts (CLS)</div>
                <div className={`text-2xl font-bold ${getMetricColor(simulationResult.metrics.layoutShifts, 'layoutShifts')}`}>
                  {simulationResult.metrics.layoutShifts.toFixed(3)}
                </div>
              </div>
            </div>
          </div>

          {/* Viewport Info & Actions */}
          <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg p-4">
            <div className="flex items-center gap-4">
              <div>
                <span className="text-sm font-semibold text-gray-700">Viewport:</span>{' '}
                <span className="text-sm text-gray-900">
                  {simulationResult.viewport.width}x{simulationResult.viewport.height}
                </span>
              </div>
              <div>
                <span className="text-sm font-semibold text-gray-700">Scale:</span>{' '}
                <span className="text-sm text-gray-900">
                  {simulationResult.viewport.deviceScaleFactor}x
                </span>
              </div>
              <div>
                <span className="text-sm font-semibold text-gray-700">Orientation:</span>{' '}
                <span className="text-sm text-gray-900 capitalize">{orientation}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={simulateRotation}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors disabled:opacity-50"
              >
                <RotateCw className="w-4 h-4" />
                Rotate
              </button>
              <button
                onClick={simulateDevice}
                disabled={loading}
                className="flex items-center gap-2 px-4 py-2 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors disabled:opacity-50"
              >
                <RefreshCw className="w-4 h-4" />
                Refresh
              </button>
            </div>
          </div>

          {/* Screenshot */}
          <div className="border-4 border-gray-200 rounded-lg overflow-hidden shadow-xl">
            <div className="bg-gray-800 text-white text-center py-2 text-sm font-medium">
              {simulationResult.device} - {orientation === 'portrait' ? 'Portrait' : 'Landscape'}
            </div>
            <div className="bg-gray-100 p-8 flex items-center justify-center">
              <img
                src={simulationResult.screenshot}
                alt={`${simulationResult.device} screenshot`}
                className="max-w-full h-auto shadow-2xl rounded-lg"
                style={{
                  maxHeight: '800px',
                  transform: orientation === 'landscape' ? 'scale(0.8)' : 'scale(1)',
                }}
              />
            </div>
          </div>

          {/* Issues */}
          {simulationResult.issues && simulationResult.issues.length > 0 && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-yellow-600" />
                Responsive Issues Detected ({simulationResult.issues.length})
              </h3>
              <ul className="space-y-2">
                {simulationResult.issues.map((issue, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm">
                    {getIssueIcon(issue)}
                    <span className="text-gray-700">{issue}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {simulationResult.issues && simulationResult.issues.length === 0 && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-6">
              <div className="flex items-center gap-2 text-green-800">
                <CheckCircle className="w-5 h-5" />
                <span className="font-semibold">No issues detected!</span>
              </div>
              <p className="text-green-700 mt-1 text-sm">
                Your site looks great on this device.
              </p>
            </div>
          )}
        </div>
      )}

      {!simulationResult && !loading && (
        <div className="text-center py-20 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <Smartphone className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Simulation Yet</h3>
          <p className="text-gray-600 mb-6">Select a device and click "Simulate Device" to preview</p>
        </div>
      )}
    </div>
  );
};
