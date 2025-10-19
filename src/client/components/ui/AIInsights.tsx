import React, { useState, useEffect } from 'react';
import { Sparkles, TrendingUp, AlertTriangle, Lightbulb, Shield, Loader2, RefreshCw } from 'lucide-react';

interface AIInsight {
  id: string;
  type: 'suggestion' | 'warning' | 'opportunity' | 'best-practice';
  category: 'performance' | 'accessibility' | 'seo' | 'security' | 'code-quality';
  title: string;
  description: string;
  reasoning: string;
  impact: 'high' | 'medium' | 'low';
  effort: 'easy' | 'medium' | 'hard';
  priority: number;
  suggestedFix?: string;
  codeExample?: string;
  resources?: string[];
}

interface AIInsightsProps {
  websiteId: string;
  context?: string;
}

export const AIInsights: React.FC<AIInsightsProps> = ({ websiteId, context }) => {
  const [insights, setInsights] = useState<AIInsight[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedInsight, setExpandedInsight] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterImpact, setFilterImpact] = useState<string>('all');

  useEffect(() => {
    generateInsights();
  }, [websiteId]);

  const generateInsights = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/ai/insights/${websiteId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context }),
      });

      const data = await response.json();

      if (data.success) {
        // Sort by priority (highest first)
        const sortedInsights = data.data.sort((a: AIInsight, b: AIInsight) => b.priority - a.priority);
        setInsights(sortedInsights);
      } else {
        setError(data.error || 'Failed to generate insights');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate insights');
    } finally {
      setLoading(false);
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'suggestion':
        return <Lightbulb className="w-5 h-5" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5" />;
      case 'opportunity':
        return <TrendingUp className="w-5 h-5" />;
      case 'best-practice':
        return <Shield className="w-5 h-5" />;
      default:
        return <Sparkles className="w-5 h-5" />;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'suggestion':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'warning':
        return 'bg-yellow-50 text-yellow-700 border-yellow-200';
      case 'opportunity':
        return 'bg-green-50 text-green-700 border-green-200';
      case 'best-practice':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      default:
        return 'bg-gray-50 text-gray-700 border-gray-200';
    }
  };

  const getImpactBadge = (impact: string) => {
    const colors = {
      high: 'bg-red-100 text-red-800',
      medium: 'bg-yellow-100 text-yellow-800',
      low: 'bg-green-100 text-green-800',
    };
    return colors[impact as keyof typeof colors] || colors.low;
  };

  const getEffortBadge = (effort: string) => {
    const colors = {
      easy: 'bg-green-100 text-green-800',
      medium: 'bg-yellow-100 text-yellow-800',
      hard: 'bg-red-100 text-red-800',
    };
    return colors[effort as keyof typeof colors] || colors.medium;
  };

  const filteredInsights = insights.filter((insight) => {
    if (filterCategory !== 'all' && insight.category !== filterCategory) return false;
    if (filterImpact !== 'all' && insight.impact !== filterImpact) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="card">
        <div className="flex flex-col items-center justify-center py-12">
          <Loader2 className="w-12 h-12 animate-spin text-blue-600 mb-4" />
          <p className="text-gray-600">Generating AI insights...</p>
          <p className="text-sm text-gray-500 mt-2">This may take a few moments</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <h3 className="font-semibold text-red-900">Error generating insights</h3>
              <p className="text-sm text-red-700 mt-1">{error}</p>
              <button
                onClick={generateInsights}
                className="mt-3 btn-secondary text-sm flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Try Again
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Sparkles className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-gray-900">AI-Powered Insights</h2>
              <p className="text-gray-600">Intelligent recommendations powered by Claude AI</p>
            </div>
          </div>
          <button
            onClick={generateInsights}
            disabled={loading}
            className="btn-secondary flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Regenerate
          </button>
        </div>

        {/* Filters */}
        <div className="flex gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Category</label>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="input"
            >
              <option value="all">All Categories</option>
              <option value="performance">Performance</option>
              <option value="accessibility">Accessibility</option>
              <option value="seo">SEO</option>
              <option value="security">Security</option>
              <option value="code-quality">Code Quality</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Impact</label>
            <select
              value={filterImpact}
              onChange={(e) => setFilterImpact(e.target.value)}
              className="input"
            >
              <option value="all">All Impacts</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="p-4 bg-blue-50 rounded-lg">
            <div className="text-sm text-gray-600">Total Insights</div>
            <div className="text-2xl font-bold text-blue-600">{insights.length}</div>
          </div>
          <div className="p-4 bg-red-50 rounded-lg">
            <div className="text-sm text-gray-600">High Priority</div>
            <div className="text-2xl font-bold text-red-600">
              {insights.filter((i) => i.priority >= 8).length}
            </div>
          </div>
          <div className="p-4 bg-green-50 rounded-lg">
            <div className="text-sm text-gray-600">Quick Wins</div>
            <div className="text-2xl font-bold text-green-600">
              {insights.filter((i) => i.effort === 'easy' && i.impact === 'high').length}
            </div>
          </div>
          <div className="p-4 bg-purple-50 rounded-lg">
            <div className="text-sm text-gray-600">Filtered Results</div>
            <div className="text-2xl font-bold text-purple-600">{filteredInsights.length}</div>
          </div>
        </div>
      </div>

      {/* Insights List */}
      <div className="space-y-4">
        {filteredInsights.length === 0 ? (
          <div className="card text-center py-8 text-gray-500">
            No insights match the selected filters
          </div>
        ) : (
          filteredInsights.map((insight) => (
            <div
              key={insight.id}
              className={`card border-l-4 ${getTypeColor(insight.type)} cursor-pointer transition-all hover:shadow-lg`}
              onClick={() => setExpandedInsight(expandedInsight === insight.id ? null : insight.id)}
            >
              <div className="flex items-start gap-4">
                <div className={`p-3 rounded-lg ${getTypeColor(insight.type)}`}>
                  {getTypeIcon(insight.type)}
                </div>
                <div className="flex-1">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">{insight.title}</h3>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700 capitalize">
                          {insight.category}
                        </span>
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${getImpactBadge(insight.impact)}`}>
                          {insight.impact} impact
                        </span>
                        <span className={`text-xs px-2 py-1 rounded-full font-medium ${getEffortBadge(insight.effort)}`}>
                          {insight.effort} effort
                        </span>
                        <span className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-800 font-bold">
                          Priority: {insight.priority}/10
                        </span>
                      </div>
                    </div>
                  </div>
                  <p className="text-gray-700 mb-3">{insight.description}</p>

                  {expandedInsight === insight.id && (
                    <div className="mt-4 space-y-4 border-t pt-4">
                      <div>
                        <h4 className="font-semibold text-gray-900 mb-2">Why this matters:</h4>
                        <p className="text-gray-700">{insight.reasoning}</p>
                      </div>

                      {insight.suggestedFix && (
                        <div>
                          <h4 className="font-semibold text-gray-900 mb-2">Suggested Fix:</h4>
                          <p className="text-gray-700">{insight.suggestedFix}</p>
                        </div>
                      )}

                      {insight.codeExample && (
                        <div>
                          <h4 className="font-semibold text-gray-900 mb-2">Code Example:</h4>
                          <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto text-sm">
                            {insight.codeExample}
                          </pre>
                        </div>
                      )}

                      {insight.resources && insight.resources.length > 0 && (
                        <div>
                          <h4 className="font-semibold text-gray-900 mb-2">Learn More:</h4>
                          <ul className="list-disc list-inside space-y-1">
                            {insight.resources.map((resource, idx) => (
                              <li key={idx}>
                                <a
                                  href={resource}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-600 hover:underline"
                                >
                                  {resource}
                                </a>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  <p className="text-xs text-gray-500 mt-2">Click to {expandedInsight === insight.id ? 'collapse' : 'expand'} details</p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
