import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Globe, Upload, MousePointer, Zap, BarChart3, Eye, Download } from 'lucide-react';
import axios from 'axios';

export default function HomePage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'url' | 'upload'>('url');
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCloneFromUrl = async () => {
    if (!url) return;

    setLoading(true);
    try {
      const response = await axios.post('/api/clone/url', {
        url,
        options: {
          includeAssets: true,
          preserveJavaScript: true,
        },
      });

      if (response.data.success) {
        const websiteId = response.data.data.id;
        navigate(`/dashboard/${websiteId}`);
      }
    } catch (error) {
      console.error('Clone failed:', error);
      alert('Failed to clone website. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setLoading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('options', JSON.stringify({ includeAssets: true }));

    try {
      const response = await axios.post('/api/clone/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (response.data.success) {
        const websiteId = response.data.data.id;
        navigate(`/dashboard/${websiteId}`);
      }
    } catch (error) {
      console.error('Upload failed:', error);
      alert('Failed to process upload. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto">
      {/* Hero Section */}
      <div className="text-center py-12">
        <h1 className="text-5xl font-bold text-gray-900 mb-4">
          Clone, Optimize & Convert
          <span className="block text-primary-600 mt-2">Any Website to WordPress</span>
        </h1>
        <p className="text-xl text-gray-600 max-w-3xl mx-auto">
          Professional website cloning with built-in performance analysis, automated optimization,
          and seamless WordPress page builder conversion - all plugin-free.
        </p>
      </div>

      {/* Main Clone Interface */}
      <div className="card max-w-3xl mx-auto mb-12">
        <div className="flex space-x-4 mb-6">
          <button
            onClick={() => setActiveTab('url')}
            className={`flex-1 flex items-center justify-center space-x-2 py-3 rounded-lg transition-all ${
              activeTab === 'url'
                ? 'bg-primary-50 text-primary-700 border-2 border-primary-500'
                : 'bg-gray-50 text-gray-600 border-2 border-transparent hover:bg-gray-100'
            }`}
          >
            <Globe className="w-5 h-5" />
            <span className="font-medium">Clone from URL</span>
          </button>
          <button
            onClick={() => setActiveTab('upload')}
            className={`flex-1 flex items-center justify-center space-x-2 py-3 rounded-lg transition-all ${
              activeTab === 'upload'
                ? 'bg-primary-50 text-primary-700 border-2 border-primary-500'
                : 'bg-gray-50 text-gray-600 border-2 border-transparent hover:bg-gray-100'
            }`}
          >
            <Upload className="w-5 h-5" />
            <span className="font-medium">Upload Files</span>
          </button>
        </div>

        {activeTab === 'url' ? (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Enter Website URL
            </label>
            <div className="flex space-x-2">
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com"
                className="input flex-1"
                disabled={loading}
              />
              <button
                onClick={handleCloneFromUrl}
                disabled={!url || loading}
                className="btn-primary px-8 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Cloning...' : 'Clone'}
              </button>
            </div>
            <p className="text-sm text-gray-500 mt-2">
              We'll extract all HTML, CSS, JavaScript, and assets from the website
            </p>
          </div>
        ) : (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Upload HTML File or ZIP
            </label>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-primary-500 transition-colors">
              <Upload className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <input
                type="file"
                accept=".html,.htm,.zip"
                onChange={handleFileUpload}
                className="hidden"
                id="file-upload"
                disabled={loading}
              />
              <label
                htmlFor="file-upload"
                className="cursor-pointer text-primary-600 hover:text-primary-700 font-medium"
              >
                {loading ? 'Uploading...' : 'Click to upload'}
              </label>
              <p className="text-sm text-gray-500 mt-2">
                HTML, HTM, or ZIP files up to 50MB
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Features Grid */}
      <div className="grid md:grid-cols-3 gap-6 mb-12">
        <FeatureCard
          icon={BarChart3}
          title="Performance Analysis"
          description="Comprehensive Core Web Vitals analysis with Lighthouse integration. Identify every optimization opportunity."
        />
        <FeatureCard
          icon={Zap}
          title="Auto-Optimization"
          description="50+ automated fixes for images, CSS, JS, fonts. Achieve 30%+ performance improvement guaranteed."
        />
        <FeatureCard
          icon={Eye}
          title="Live Preview"
          description="Deploy to Vercel/Netlify instantly. Test both original and optimized versions side-by-side."
        />
        <FeatureCard
          icon={Download}
          title="WordPress Export"
          description="Convert to Elementor, Gutenberg, Divi, or any builder. 100% plugin-free, performance-optimized."
        />
        <FeatureCard
          icon={MousePointer}
          title="Element Selector"
          description="Clone specific sections or components. Perfect for landing pages and individual elements."
        />
        <FeatureCard
          icon={Globe}
          title="Multi-Page Crawling"
          description="Clone entire websites with multiple pages. Automatic asset extraction and optimization."
        />
      </div>

      {/* Process Steps */}
      <div className="card mb-12">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">How It Works</h2>
        <div className="grid md:grid-cols-5 gap-4">
          <ProcessStep number={1} title="Clone" description="Input URL or upload files" />
          <ProcessStep number={2} title="Analyze" description="Performance audit & metrics" />
          <ProcessStep number={3} title="Optimize" description="Apply automated fixes" />
          <ProcessStep number={4} title="Preview" description="Test on live hosting" />
          <ProcessStep number={5} title="Export" description="Download builder package" />
        </div>
      </div>
    </div>
  );
}

interface FeatureCardProps {
  icon: React.FC<{ className?: string }>;
  title: string;
  description: string;
}

function FeatureCard({ icon: Icon, title, description }: FeatureCardProps) {
  return (
    <div className="card hover:shadow-md transition-shadow">
      <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center mb-4">
        <Icon className="w-6 h-6 text-primary-600" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-gray-600 text-sm">{description}</p>
    </div>
  );
}

interface ProcessStepProps {
  number: number;
  title: string;
  description: string;
}

function ProcessStep({ number, title, description }: ProcessStepProps) {
  return (
    <div className="text-center">
      <div className="w-12 h-12 bg-primary-600 text-white rounded-full flex items-center justify-center font-bold text-lg mx-auto mb-3">
        {number}
      </div>
      <h4 className="font-semibold text-gray-900 mb-1">{title}</h4>
      <p className="text-sm text-gray-600">{description}</p>
    </div>
  );
}
