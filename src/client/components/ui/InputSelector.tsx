import React, { useState } from 'react';
import { Globe, Upload, MousePointer, Layers } from 'lucide-react';
import { FileUploader } from './FileUploader.js';
import { MultiPageCrawler } from './MultiPageCrawler.js';
import { ElementPicker } from './ElementPicker.js';

type InputMethod = 'url' | 'upload' | 'element' | 'multi-page';

export const InputSelector: React.FC = () => {
  const [selectedMethod, setSelectedMethod] = useState<InputMethod>('url');
  const [url, setUrl] = useState('');

  const methods = [
    {
      id: 'url' as InputMethod,
      name: 'URL Import',
      description: 'Clone a website by entering its URL',
      icon: <Globe className="w-6 h-6" />,
      color: 'blue',
    },
    {
      id: 'upload' as InputMethod,
      name: 'File Upload',
      description: 'Upload HTML, CSS, JS files or ZIP archives',
      icon: <Upload className="w-6 h-6" />,
      color: 'green',
    },
    {
      id: 'element' as InputMethod,
      name: 'Element Selector',
      description: 'Select specific elements from a live website',
      icon: <MousePointer className="w-6 h-6" />,
      color: 'purple',
    },
    {
      id: 'multi-page' as InputMethod,
      name: 'Multi-Page Crawl',
      description: 'Crawl entire websites with multiple pages',
      icon: <Layers className="w-6 h-6" />,
      color: 'orange',
    },
  ];

  const getColorClasses = (color: string) => {
    const colors = {
      blue: {
        bg: 'bg-blue-50',
        border: 'border-blue-200',
        text: 'text-blue-700',
        icon: 'text-blue-600',
        hover: 'hover:border-blue-400',
        selected: 'border-blue-500 bg-blue-100',
      },
      green: {
        bg: 'bg-green-50',
        border: 'border-green-200',
        text: 'text-green-700',
        icon: 'text-green-600',
        hover: 'hover:border-green-400',
        selected: 'border-green-500 bg-green-100',
      },
      purple: {
        bg: 'bg-purple-50',
        border: 'border-purple-200',
        text: 'text-purple-700',
        icon: 'text-purple-600',
        hover: 'hover:border-purple-400',
        selected: 'border-purple-500 bg-purple-100',
      },
      orange: {
        bg: 'bg-orange-50',
        border: 'border-orange-200',
        text: 'text-orange-700',
        icon: 'text-orange-600',
        hover: 'hover:border-orange-400',
        selected: 'border-orange-500 bg-orange-100',
      },
    };
    return colors[color as keyof typeof colors];
  };

  const handleUrlClone = async () => {
    if (!url) {
      alert('Please enter a URL');
      return;
    }

    try {
      // Call existing clone API
      const response = await fetch('/api/clone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Clone failed');
      }

      alert(`Clone successful! ID: ${data.cloneId}`);
    } catch (error) {
      alert(error instanceof Error ? error.message : 'Clone failed');
    }
  };

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Website Cloner Pro
        </h1>
        <p className="text-gray-600">
          Choose your input method to start cloning websites
        </p>
      </div>

      {/* Method Selection */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {methods.map((method) => {
          const colors = getColorClasses(method.color);
          const isSelected = selectedMethod === method.id;

          return (
            <button
              key={method.id}
              onClick={() => setSelectedMethod(method.id)}
              className={`p-6 border-2 rounded-lg text-left transition-all ${
                isSelected
                  ? `${colors.selected} shadow-lg`
                  : `${colors.border} ${colors.hover} hover:shadow-md`
              }`}
            >
              <div className={`inline-flex p-3 rounded-lg mb-4 ${colors.bg}`}>
                <div className={colors.icon}>{method.icon}</div>
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {method.name}
              </h3>
              <p className="text-sm text-gray-600">{method.description}</p>
            </button>
          );
        })}
      </div>

      {/* Content Area */}
      <div>
        {selectedMethod === 'url' && (
          <div className="bg-white rounded-lg shadow-lg p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-blue-100 rounded-lg">
                <Globe className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-gray-900">URL Import</h2>
                <p className="text-gray-600">Clone a website by entering its URL</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Website URL
                </label>
                <input
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com"
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
                />
              </div>

              <button
                onClick={handleUrlClone}
                disabled={!url}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Globe className="w-5 h-5" />
                Clone Website
              </button>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="text-sm font-medium text-blue-900 mb-2">Features</h4>
                <ul className="text-xs text-blue-800 space-y-1 list-disc list-inside">
                  <li>Downloads complete HTML, CSS, and JavaScript</li>
                  <li>Preserves all images, fonts, and assets</li>
                  <li>Maintains responsive design and animations</li>
                  <li>Creates self-contained, optimized package</li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {selectedMethod === 'upload' && <FileUploader />}

        {selectedMethod === 'element' && (
          <div>
            <div className="bg-white rounded-lg shadow-lg p-8 mb-6">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-purple-100 rounded-lg">
                  <MousePointer className="w-6 h-6 text-purple-600" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-gray-900">Element Selector</h2>
                  <p className="text-gray-600">
                    Select specific elements from a live website
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Website URL
                  </label>
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://example.com"
                    className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-lg"
                  />
                </div>
              </div>
            </div>

            {url && <ElementPicker url={url} />}
          </div>
        )}

        {selectedMethod === 'multi-page' && <MultiPageCrawler />}
      </div>
    </div>
  );
};
