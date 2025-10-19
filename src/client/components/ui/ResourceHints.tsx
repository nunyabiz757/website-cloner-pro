import React, { useState } from 'react';
import { Link2, Zap, Globe, Upload, Plus, X, ChevronDown, ChevronUp } from 'lucide-react';

interface ResourceHint {
  type: 'preload' | 'prefetch' | 'preconnect' | 'dns-prefetch';
  url: string;
  as?: string;
  crossOrigin?: boolean;
}

export const ResourceHints: React.FC = () => {
  const [hints, setHints] = useState<ResourceHint[]>([
    { type: 'preconnect', url: 'https://fonts.googleapis.com', crossOrigin: true },
    { type: 'preconnect', url: 'https://fonts.gstatic.com', crossOrigin: true },
    { type: 'preload', url: '/fonts/main.woff2', as: 'font', crossOrigin: true },
    { type: 'dns-prefetch', url: 'https://cdn.example.com' },
  ]);

  const [newHint, setNewHint] = useState<ResourceHint>({
    type: 'preload',
    url: '',
    as: 'script',
    crossOrigin: false,
  });

  const [showForm, setShowForm] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['preload', 'preconnect', 'prefetch', 'dns-prefetch'])
  );

  const handleAddHint = () => {
    if (newHint.url) {
      setHints([...hints, { ...newHint }]);
      setNewHint({
        type: 'preload',
        url: '',
        as: 'script',
        crossOrigin: false,
      });
      setShowForm(false);
    }
  };

  const handleRemoveHint = (index: number) => {
    setHints(hints.filter((_, i) => i !== index));
  };

  const toggleSection = (type: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(type)) {
      newExpanded.delete(type);
    } else {
      newExpanded.add(type);
    }
    setExpandedSections(newExpanded);
  };

  const getHintsByType = (type: string) => {
    return hints.filter(hint => hint.type === type);
  };

  const generateHTML = () => {
    return hints.map(hint => {
      let attrs = `rel="${hint.type}" href="${hint.url}"`;
      if (hint.as) attrs += ` as="${hint.as}"`;
      if (hint.crossOrigin) attrs += ' crossorigin';
      return `<link ${attrs}>`;
    }).join('\n');
  };

  const asOptions = [
    'script',
    'style',
    'font',
    'image',
    'fetch',
    'document',
    'video',
    'audio',
  ];

  const hintTypeInfo = {
    preload: {
      icon: <Upload className="w-5 h-5 text-purple-600" />,
      color: 'purple',
      title: 'Preload',
      description: 'High-priority resources needed for current page',
      example: 'Critical fonts, hero images, above-fold CSS',
    },
    preconnect: {
      icon: <Globe className="w-5 h-5 text-blue-600" />,
      color: 'blue',
      title: 'Preconnect',
      description: 'Establish early connections to important origins',
      example: 'Google Fonts, CDNs, API endpoints',
    },
    prefetch: {
      icon: <Zap className="w-5 h-5 text-green-600" />,
      color: 'green',
      title: 'Prefetch',
      description: 'Low-priority resources for future navigation',
      example: 'Next page resources, likely user actions',
    },
    'dns-prefetch': {
      icon: <Link2 className="w-5 h-5 text-yellow-600" />,
      color: 'yellow',
      title: 'DNS Prefetch',
      description: 'Resolve DNS for third-party domains early',
      example: 'Analytics, ads, social media widgets',
    },
  };

  return (
    <div className="max-w-4xl mx-auto bg-white rounded-lg shadow-lg p-8">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 bg-orange-100 rounded-lg">
          <Zap className="w-6 h-6 text-orange-600" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Resource Hints Manager</h2>
          <p className="text-gray-600">Configure resource hints for faster page loads</p>
        </div>
      </div>

      {/* Add New Hint Button */}
      {!showForm && (
        <button
          onClick={() => setShowForm(true)}
          className="w-full mb-6 flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-orange-400 hover:text-orange-600 transition-colors"
        >
          <Plus className="w-5 h-5" />
          Add Resource Hint
        </button>
      )}

      {/* Add Hint Form */}
      {showForm && (
        <div className="mb-6 p-6 bg-gray-50 border border-gray-200 rounded-lg">
          <h3 className="font-semibold text-gray-900 mb-4">Add New Resource Hint</h3>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Hint Type
              </label>
              <select
                value={newHint.type}
                onChange={(e) =>
                  setNewHint({
                    ...newHint,
                    type: e.target.value as ResourceHint['type'],
                  })
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              >
                <option value="preload">Preload</option>
                <option value="prefetch">Prefetch</option>
                <option value="preconnect">Preconnect</option>
                <option value="dns-prefetch">DNS Prefetch</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                URL or Origin
              </label>
              <input
                type="text"
                value={newHint.url}
                onChange={(e) => setNewHint({ ...newHint, url: e.target.value })}
                placeholder="https://example.com/resource.js"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
              />
            </div>

            {newHint.type === 'preload' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Resource Type (as)
                </label>
                <select
                  value={newHint.as}
                  onChange={(e) => setNewHint({ ...newHint, as: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                >
                  {asOptions.map(option => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
            )}

            {(newHint.type === 'preload' || newHint.type === 'preconnect') && (
              <label className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={newHint.crossOrigin}
                  onChange={(e) =>
                    setNewHint({ ...newHint, crossOrigin: e.target.checked })
                  }
                  className="w-4 h-4 text-orange-600 rounded focus:ring-orange-500"
                />
                <span className="text-gray-700">Cross-Origin (CORS)</span>
              </label>
            )}

            <div className="flex gap-2">
              <button
                onClick={handleAddHint}
                disabled={!newHint.url}
                className="flex-1 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add Hint
              </button>
              <button
                onClick={() => {
                  setShowForm(false);
                  setNewHint({
                    type: 'preload',
                    url: '',
                    as: 'script',
                    crossOrigin: false,
                  });
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Grouped Resource Hints */}
      <div className="space-y-4 mb-6">
        {Object.entries(hintTypeInfo).map(([type, info]) => {
          const typeHints = getHintsByType(type);
          const isExpanded = expandedSections.has(type);

          return (
            <div key={type} className="border border-gray-200 rounded-lg overflow-hidden">
              <button
                onClick={() => toggleSection(type)}
                className={`w-full p-4 flex items-center justify-between bg-${info.color}-50 hover:bg-${info.color}-100 transition-colors`}
              >
                <div className="flex items-center gap-3">
                  {info.icon}
                  <div className="text-left">
                    <h3 className="font-semibold text-gray-900">
                      {info.title}
                      <span className="ml-2 text-sm text-gray-500">
                        ({typeHints.length})
                      </span>
                    </h3>
                    <p className="text-xs text-gray-600">{info.description}</p>
                  </div>
                </div>
                {isExpanded ? (
                  <ChevronUp className="w-5 h-5 text-gray-400" />
                ) : (
                  <ChevronDown className="w-5 h-5 text-gray-400" />
                )}
              </button>

              {isExpanded && (
                <div className="p-4 bg-white">
                  {typeHints.length === 0 ? (
                    <p className="text-sm text-gray-500 italic">
                      No {info.title.toLowerCase()} hints configured. Example: {info.example}
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {typeHints.map((hint, index) => {
                        const globalIndex = hints.indexOf(hint);
                        return (
                          <div
                            key={index}
                            className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                          >
                            <div className="flex-1">
                              <p className="text-sm font-medium text-gray-900">{hint.url}</p>
                              <div className="flex gap-2 mt-1">
                                {hint.as && (
                                  <span className="text-xs px-2 py-0.5 bg-gray-200 text-gray-700 rounded">
                                    as: {hint.as}
                                  </span>
                                )}
                                {hint.crossOrigin && (
                                  <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded">
                                    CORS
                                  </span>
                                )}
                              </div>
                            </div>
                            <button
                              onClick={() => handleRemoveHint(globalIndex)}
                              className="ml-3 p-1 text-gray-400 hover:text-red-600 transition-colors"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Generated HTML */}
      {hints.length > 0 && (
        <div className="bg-gray-900 rounded-lg p-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-white">Generated HTML</h3>
            <button
              onClick={() => {
                navigator.clipboard.writeText(generateHTML());
              }}
              className="text-xs px-3 py-1 bg-gray-700 text-white rounded hover:bg-gray-600"
            >
              Copy
            </button>
          </div>
          <pre className="text-xs text-green-400 overflow-x-auto">
            <code>{generateHTML()}</code>
          </pre>
        </div>
      )}

      {/* Performance Info */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <h4 className="text-sm font-medium text-blue-900 mb-2">Best Practices</h4>
          <ul className="text-xs text-blue-800 space-y-1 list-disc list-inside">
            <li>Limit preload to 2-3 critical resources</li>
            <li>Preconnect to no more than 3-4 origins</li>
            <li>Use prefetch for next page navigation</li>
          </ul>
        </div>

        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <h4 className="text-sm font-medium text-green-900 mb-2">Expected Impact</h4>
          <ul className="text-xs text-green-800 space-y-1 list-disc list-inside">
            <li>Reduce connection time by 100-500ms</li>
            <li>Faster font loading (eliminate FOUT)</li>
            <li>Improved perceived performance</li>
          </ul>
        </div>
      </div>
    </div>
  );
};
