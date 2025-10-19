import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Bot, Sparkles, MessageSquare, Code, TrendingUp } from 'lucide-react';
import { AIChat, AIInsights } from '../components/ui/index.js';

export const AIAssistantPage: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'insights' | 'chat' | 'code-analysis'>('insights');
  const [chatMinimized, setChatMinimized] = useState(false);
  const [codeToAnalyze, setCodeToAnalyze] = useState('');
  const [codeType, setCodeType] = useState<'html' | 'css' | 'javascript'>('javascript');
  const [codeAnalysisResult, setCodeAnalysisResult] = useState<any>(null);
  const [analyzingCode, setAnalyzingCode] = useState(false);

  const handleAnalyzeCode = async () => {
    if (!codeToAnalyze.trim()) return;

    setAnalyzingCode(true);
    setCodeAnalysisResult(null);

    try {
      const response = await fetch('/api/ai/analyze-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: codeToAnalyze,
          fileType: codeType,
          context: `Code analysis for project ${projectId}`,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setCodeAnalysisResult(data.data);
      } else {
        setCodeAnalysisResult({
          issues: [`Error: ${data.error}`],
          suggestions: [],
        });
      }
    } catch (error) {
      setCodeAnalysisResult({
        issues: ['Failed to analyze code. Please try again.'],
        suggestions: [],
      });
    } finally {
      setAnalyzingCode(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="card mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button onClick={() => navigate(-1)} className="p-2 hover:bg-gray-100 rounded-lg">
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
                <Bot className="w-8 h-8 text-blue-600" />
                AI Assistant
              </h1>
              <p className="text-gray-600 mt-1">Intelligent optimization powered by Claude AI</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 bg-blue-100 text-blue-800 text-sm font-medium rounded-full flex items-center gap-2">
              <Sparkles className="w-4 h-4" />
              Powered by Claude
            </span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="card mb-6">
        <div className="flex gap-2 border-b">
          <button
            onClick={() => setActiveTab('insights')}
            className={`px-6 py-3 font-medium transition-colors flex items-center gap-2 ${
              activeTab === 'insights'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            AI Insights
          </button>
          <button
            onClick={() => setActiveTab('chat')}
            className={`px-6 py-3 font-medium transition-colors flex items-center gap-2 ${
              activeTab === 'chat'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            Chat Assistant
          </button>
          <button
            onClick={() => setActiveTab('code-analysis')}
            className={`px-6 py-3 font-medium transition-colors flex items-center gap-2 ${
              activeTab === 'code-analysis'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <Code className="w-4 h-4" />
            Code Analysis
          </button>
        </div>
      </div>

      {/* Content */}
      {activeTab === 'insights' && projectId && (
        <AIInsights websiteId={projectId} context="Full website optimization analysis" />
      )}

      {activeTab === 'chat' && (
        <div className="card">
          <div className="text-center py-12">
            <Bot className="w-16 h-16 text-blue-600 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">Chat with AI Assistant</h2>
            <p className="text-gray-600 mb-6">
              The chat assistant is available in the bottom right corner of your screen.
            </p>
            <button
              onClick={() => setChatMinimized(false)}
              className="btn-primary flex items-center gap-2 mx-auto"
            >
              <MessageSquare className="w-5 h-5" />
              Open Chat
            </button>
          </div>
        </div>
      )}

      {activeTab === 'code-analysis' && (
        <div className="card">
          <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
            <Code className="w-6 h-6 text-blue-600" />
            Code Analysis
          </h2>

          <div className="space-y-4">
            {/* Code Type Selector */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Code Type</label>
              <select
                value={codeType}
                onChange={(e) => setCodeType(e.target.value as any)}
                className="input max-w-xs"
              >
                <option value="html">HTML</option>
                <option value="css">CSS</option>
                <option value="javascript">JavaScript</option>
              </select>
            </div>

            {/* Code Input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Paste your code here
              </label>
              <textarea
                value={codeToAnalyze}
                onChange={(e) => setCodeToAnalyze(e.target.value)}
                placeholder={`Paste your ${codeType.toUpperCase()} code here...`}
                className="input font-mono text-sm"
                rows={15}
              />
            </div>

            {/* Analyze Button */}
            <button
              onClick={handleAnalyzeCode}
              disabled={!codeToAnalyze.trim() || analyzingCode}
              className="btn-primary flex items-center gap-2"
            >
              {analyzingCode ? (
                <>
                  <TrendingUp className="w-5 h-5 animate-pulse" />
                  Analyzing...
                </>
              ) : (
                <>
                  <TrendingUp className="w-5 h-5" />
                  Analyze Code
                </>
              )}
            </button>

            {/* Analysis Results */}
            {codeAnalysisResult && (
              <div className="mt-6 space-y-4">
                {/* Issues */}
                {codeAnalysisResult.issues && codeAnalysisResult.issues.length > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <h3 className="font-semibold text-red-900 mb-3">Issues Found</h3>
                    <ul className="space-y-2">
                      {codeAnalysisResult.issues.map((issue: string, idx: number) => (
                        <li key={idx} className="text-sm text-red-700 flex items-start gap-2">
                          <span className="text-red-500 font-bold">•</span>
                          {issue}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Suggestions */}
                {codeAnalysisResult.suggestions && codeAnalysisResult.suggestions.length > 0 && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h3 className="font-semibold text-blue-900 mb-3">Optimization Suggestions</h3>
                    <ul className="space-y-2">
                      {codeAnalysisResult.suggestions.map((suggestion: string, idx: number) => (
                        <li key={idx} className="text-sm text-blue-700 flex items-start gap-2">
                          <span className="text-blue-500 font-bold">•</span>
                          {suggestion}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Optimized Code */}
                {codeAnalysisResult.optimizedCode && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <h3 className="font-semibold text-green-900 mb-3">Optimized Code</h3>
                    <pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-x-auto text-sm">
                      {codeAnalysisResult.optimizedCode}
                    </pre>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Floating AI Chat */}
      {projectId && (
        <AIChat
          sessionId={`project-${projectId}`}
          systemPrompt="You are a helpful web optimization assistant. Help the user optimize their website for performance, accessibility, and SEO."
          minimized={chatMinimized}
          onToggleMinimize={() => setChatMinimized(!chatMinimized)}
        />
      )}
    </div>
  );
};
