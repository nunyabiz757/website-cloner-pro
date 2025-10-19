import React, { useState } from 'react';
import {
  Layers,
  Smartphone,
  Zap,
  Shield,
  AlertCircle,
  CheckCircle,
  Info,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface AnalysisResultsProps {
  cloneId: string;
  url: string;
}

interface AnalysisData {
  responsive?: any;
  animations?: any;
  frameworks?: any;
  thirdParty?: any;
}

export const AnalysisResults: React.FC<AnalysisResultsProps> = ({ cloneId, url }) => {
  const [analysisData, setAnalysisData] = useState<AnalysisData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['summary']));

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  };

  const runAnalysis = async () => {
    setLoading(true);
    setError(null);

    try {
      // Fetch HTML/CSS/JS content from clone
      const response = await fetch(`/api/clone/${cloneId}`);
      const cloneData = await response.json();

      if (!response.ok || !cloneData.success) {
        throw new Error(cloneData.error || 'Failed to fetch clone data');
      }

      // Run comprehensive analysis
      const analysisResponse = await fetch('/api/analysis/comprehensive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          htmlContent: cloneData.html,
          cssContent: cloneData.css,
          jsContent: cloneData.js,
        }),
      });

      const analysisResult = await analysisResponse.json();

      if (!analysisResponse.ok || !analysisResult.success) {
        throw new Error(analysisResult.error || 'Analysis failed');
      }

      setAnalysisData(analysisResult.analysis);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setLoading(false);
    }
  };

  const renderSection = (
    title: string,
    icon: React.ReactNode,
    sectionKey: string,
    content: React.ReactNode
  ) => {
    const isExpanded = expandedSections.has(sectionKey);

    return (
      <div className="bg-white border border-gray-200 rounded-lg mb-4 overflow-hidden">
        <button
          onClick={() => toggleSection(sectionKey)}
          className="w-full flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 rounded-lg">{icon}</div>
            <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          </div>
          {isExpanded ? (
            <ChevronUp className="w-5 h-5 text-gray-500" />
          ) : (
            <ChevronDown className="w-5 h-5 text-gray-500" />
          )}
        </button>

        {isExpanded && <div className="p-4 border-t border-gray-200">{content}</div>}
      </div>
    );
  };

  const renderResponsiveAnalysis = () => {
    if (!analysisData?.responsive) return null;
    const data = analysisData.responsive;

    if (data.error) {
      return <div className="text-red-600">Error: {data.error}</div>;
    }

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-blue-50 p-4 rounded-lg">
            <div className="text-sm text-blue-600 mb-1">Breakpoints</div>
            <div className="text-2xl font-bold text-blue-900">{data.breakpoints?.length || 0}</div>
          </div>
          <div className="bg-green-50 p-4 rounded-lg">
            <div className="text-sm text-green-600 mb-1">Design Type</div>
            <div className="text-lg font-bold text-green-900">
              {data.mobileFirst ? 'Mobile-First' : 'Desktop-First'}
            </div>
          </div>
          <div className="bg-purple-50 p-4 rounded-lg">
            <div className="text-sm text-purple-600 mb-1">Layout</div>
            <div className="text-lg font-bold text-purple-900">
              {data.fluidDesign ? 'Fluid' : 'Fixed'}
            </div>
          </div>
        </div>

        {data.breakpoints && data.breakpoints.length > 0 && (
          <div>
            <h4 className="font-semibold mb-2">Detected Breakpoints</h4>
            <div className="space-y-2">
              {data.breakpoints.map((bp: any, idx: number) => (
                <div key={idx} className="bg-gray-50 p-3 rounded border border-gray-200">
                  <div className="font-mono text-sm text-gray-700">{bp.mediaQuery}</div>
                  <div className="text-xs text-gray-500 mt-1">
                    {bp.affectedElements} affected elements
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {data.recommendations && data.recommendations.length > 0 && (
          <div>
            <h4 className="font-semibold mb-2">Recommendations</h4>
            <ul className="space-y-2">
              {data.recommendations.map((rec: string, idx: number) => (
                <li key={idx} className="flex items-start gap-2 text-sm">
                  <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                  <span>{rec}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  };

  const renderAnimationAnalysis = () => {
    if (!analysisData?.animations) return null;
    const data = analysisData.animations;

    if (data.error) {
      return <div className="text-red-600">Error: {data.error}</div>;
    }

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-purple-50 p-4 rounded-lg">
            <div className="text-sm text-purple-600 mb-1">CSS Animations</div>
            <div className="text-2xl font-bold text-purple-900">
              {data.cssAnimations?.length || 0}
            </div>
          </div>
          <div className="bg-pink-50 p-4 rounded-lg">
            <div className="text-sm text-pink-600 mb-1">CSS Transitions</div>
            <div className="text-2xl font-bold text-pink-900">
              {data.cssTransitions?.size || 0}
            </div>
          </div>
          <div className="bg-orange-50 p-4 rounded-lg">
            <div className="text-sm text-orange-600 mb-1">Interactions</div>
            <div className="text-2xl font-bold text-orange-900">
              {data.interactions?.length || 0}
            </div>
          </div>
          <div className="bg-teal-50 p-4 rounded-lg">
            <div className="text-sm text-teal-600 mb-1">Scroll Animations</div>
            <div className="text-2xl font-bold text-teal-900">
              {data.scrollAnimations?.length || 0}
            </div>
          </div>
        </div>

        {data.animationLibraries && data.animationLibraries.length > 0 && (
          <div>
            <h4 className="font-semibold mb-2">Animation Libraries Detected</h4>
            <div className="flex flex-wrap gap-2">
              {data.animationLibraries.map((lib: string) => (
                <span
                  key={lib}
                  className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-sm"
                >
                  {lib}
                </span>
              ))}
            </div>
          </div>
        )}

        {data.cssAnimations && data.cssAnimations.length > 0 && (
          <div>
            <h4 className="font-semibold mb-2">CSS Animations</h4>
            <div className="space-y-2">
              {data.cssAnimations.slice(0, 5).map((anim: any, idx: number) => (
                <div key={idx} className="bg-gray-50 p-3 rounded border border-gray-200">
                  <div className="font-mono text-sm font-semibold text-gray-900">{anim.name}</div>
                  <div className="text-xs text-gray-600 mt-1">
                    Duration: {anim.duration} | Timing: {anim.timingFunction} | Iterations:{' '}
                    {anim.iterationCount}
                  </div>
                </div>
              ))}
              {data.cssAnimations.length > 5 && (
                <div className="text-sm text-gray-500">
                  ... and {data.cssAnimations.length - 5} more
                </div>
              )}
            </div>
          </div>
        )}

        {data.recommendations && data.recommendations.length > 0 && (
          <div>
            <h4 className="font-semibold mb-2">Recommendations</h4>
            <ul className="space-y-2">
              {data.recommendations.map((rec: string, idx: number) => (
                <li key={idx} className="flex items-start gap-2 text-sm">
                  <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                  <span>{rec}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  };

  const renderFrameworkAnalysis = () => {
    if (!analysisData?.frameworks) return null;
    const data = analysisData.frameworks;

    if (data.error) {
      return <div className="text-red-600">Error: {data.error}</div>;
    }

    return (
      <div className="space-y-4">
        {data.frameworks && data.frameworks.length > 0 && (
          <div>
            <h4 className="font-semibold mb-3">JavaScript Frameworks</h4>
            <div className="space-y-3">
              {data.frameworks.map((fw: any, idx: number) => (
                <div
                  key={idx}
                  className="bg-gradient-to-r from-blue-50 to-indigo-50 p-4 rounded-lg border border-blue-200"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-lg text-gray-900">{fw.name}</div>
                      {fw.version && (
                        <div className="text-sm text-gray-600">Version: {fw.version}</div>
                      )}
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-indigo-600">{fw.confidence}%</div>
                      <div className="text-xs text-gray-500">Confidence</div>
                    </div>
                  </div>
                  {fw.indicators && fw.indicators.length > 0 && (
                    <div className="mt-2">
                      <div className="text-xs text-gray-500 mb-1">Indicators:</div>
                      <div className="flex flex-wrap gap-1">
                        {fw.indicators.slice(0, 3).map((ind: string, i: number) => (
                          <span
                            key={i}
                            className="text-xs bg-white px-2 py-1 rounded border border-blue-200"
                          >
                            {ind}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {data.cssFrameworks && data.cssFrameworks.length > 0 && (
          <div>
            <h4 className="font-semibold mb-2">CSS Frameworks</h4>
            <div className="flex flex-wrap gap-2">
              {data.cssFrameworks.map((fw: string) => (
                <span key={fw} className="px-3 py-1 bg-green-100 text-green-700 rounded-full">
                  {fw}
                </span>
              ))}
            </div>
          </div>
        )}

        {data.buildTools && data.buildTools.length > 0 && (
          <div>
            <h4 className="font-semibold mb-2">Build Tools</h4>
            <div className="flex flex-wrap gap-2">
              {data.buildTools.map((tool: any) => (
                <span key={tool.name} className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full">
                  {tool.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {data.stateManagement && data.stateManagement.length > 0 && (
          <div>
            <h4 className="font-semibold mb-2">State Management</h4>
            <div className="flex flex-wrap gap-2">
              {data.stateManagement.map((lib: string) => (
                <span key={lib} className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full">
                  {lib}
                </span>
              ))}
            </div>
          </div>
        )}

        {data.recommendations && data.recommendations.length > 0 && (
          <div>
            <h4 className="font-semibold mb-2">Recommendations</h4>
            <ul className="space-y-2">
              {data.recommendations.map((rec: string, idx: number) => (
                <li key={idx} className="flex items-start gap-2 text-sm">
                  <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                  <span>{rec}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  };

  const renderThirdPartyAnalysis = () => {
    if (!analysisData?.thirdParty) return null;
    const data = analysisData.thirdParty;

    if (data.error) {
      return <div className="text-red-600">Error: {data.error}</div>;
    }

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-orange-50 p-4 rounded-lg">
            <div className="text-sm text-orange-600 mb-1">Integrations</div>
            <div className="text-2xl font-bold text-orange-900">
              {data.integrations?.length || 0}
            </div>
          </div>
          <div className="bg-red-50 p-4 rounded-lg">
            <div className="text-sm text-red-600 mb-1">Third-Party Domains</div>
            <div className="text-2xl font-bold text-red-900">
              {data.thirdPartyDomains?.length || 0}
            </div>
          </div>
          <div className={`${data.gdprCompliant ? 'bg-green-50' : 'bg-red-50'} p-4 rounded-lg`}>
            <div className={`text-sm ${data.gdprCompliant ? 'text-green-600' : 'text-red-600'} mb-1`}>
              GDPR Compliance
            </div>
            <div className="flex items-center gap-2">
              {data.gdprCompliant ? (
                <CheckCircle className="w-6 h-6 text-green-600" />
              ) : (
                <AlertCircle className="w-6 h-6 text-red-600" />
              )}
              <span className={`text-lg font-bold ${data.gdprCompliant ? 'text-green-900' : 'text-red-900'}`}>
                {data.gdprCompliant ? 'Compliant' : 'Non-Compliant'}
              </span>
            </div>
          </div>
        </div>

        {data.integrations && data.integrations.length > 0 && (
          <div>
            <h4 className="font-semibold mb-3">Detected Integrations</h4>
            <div className="space-y-2">
              {data.integrations.map((integration: any, idx: number) => (
                <div
                  key={idx}
                  className={`p-3 rounded-lg border-l-4 ${
                    integration.privacyImpact === 'high'
                      ? 'bg-red-50 border-red-500'
                      : integration.privacyImpact === 'medium'
                      ? 'bg-yellow-50 border-yellow-500'
                      : 'bg-green-50 border-green-500'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-semibold text-gray-900">{integration.name}</div>
                      <div className="text-xs text-gray-600 mt-1">
                        Category: {integration.category} | Privacy Impact:{' '}
                        {integration.privacyImpact}
                      </div>
                    </div>
                  </div>
                  <div className="text-sm text-gray-700 mt-2">{integration.recommendation}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {data.recommendations && data.recommendations.length > 0 && (
          <div>
            <h4 className="font-semibold mb-2">Recommendations</h4>
            <ul className="space-y-2">
              {data.recommendations.map((rec: string, idx: number) => (
                <li
                  key={idx}
                  className={`flex items-start gap-2 text-sm ${
                    rec.startsWith('CRITICAL') ? 'text-red-700' : ''
                  }`}
                >
                  {rec.startsWith('CRITICAL') ? (
                    <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                  ) : rec.startsWith('WARNING') ? (
                    <AlertCircle className="w-4 h-4 text-orange-500 mt-0.5 flex-shrink-0" />
                  ) : (
                    <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                  )}
                  <span>{rec}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-6xl mx-auto bg-white rounded-lg shadow-lg p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Analysis Results</h2>
          <p className="text-gray-600">Comprehensive analysis of cloned website</p>
        </div>
        <button
          onClick={runAnalysis}
          disabled={loading}
          className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Zap className="w-5 h-5" />
          {loading ? 'Analyzing...' : 'Run Analysis'}
        </button>
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

      {loading && (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-4"></div>
          <p className="text-gray-600">Running comprehensive analysis...</p>
        </div>
      )}

      {!loading && analysisData && (
        <div className="space-y-4">
          {renderSection(
            'Responsive Design',
            <Smartphone className="w-5 h-5 text-indigo-600" />,
            'responsive',
            renderResponsiveAnalysis()
          )}

          {renderSection(
            'Animations & Interactions',
            <Zap className="w-5 h-5 text-indigo-600" />,
            'animations',
            renderAnimationAnalysis()
          )}

          {renderSection(
            'Frameworks & Libraries',
            <Layers className="w-5 h-5 text-indigo-600" />,
            'frameworks',
            renderFrameworkAnalysis()
          )}

          {renderSection(
            'Third-Party Integrations',
            <Shield className="w-5 h-5 text-indigo-600" />,
            'thirdParty',
            renderThirdPartyAnalysis()
          )}
        </div>
      )}
    </div>
  );
};
