import React, { useState, useRef } from 'react';
import { Crosshair, Copy, CheckCircle, Search, Loader2, Eye, Code, MapPin } from 'lucide-react';

interface ElementInfo {
  tagName: string;
  id?: string;
  classes: string[];
  attributes: Record<string, string>;
  text: string;
  innerHTML: string;
  cssSelector: string;
  xpathSelector: string;
  position: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  computedStyles?: Record<string, string>;
  parent?: {
    tagName: string;
    id?: string;
    classes: string[];
  };
  children: Array<{
    tagName: string;
    id?: string;
    classes: string[];
  }>;
}

interface SelectorSuggestions {
  byId?: string;
  byClass?: string;
  byTagAndClass?: string;
  byAttribute?: string;
  byText?: string;
  byNthChild?: string;
  uniqueSelector: string;
  xpath: string;
  dataTestId?: string;
}

interface ElementPickerProps {
  url: string;
  onElementSelected?: (element: ElementInfo, selector: string) => void;
}

export const ElementPicker: React.FC<ElementPickerProps> = ({ url, onElementSelected }) => {
  const [elementInfo, setElementInfo] = useState<ElementInfo | null>(null);
  const [suggestions, setSuggestions] = useState<SelectorSuggestions | null>(null);
  const [loading, setLoading] = useState(false);
  const [copiedSelector, setCopiedSelector] = useState<string | null>(null);
  const [validationResult, setValidationResult] = useState<{
    valid: boolean;
    count: number;
    error?: string;
  } | null>(null);
  const [customSelector, setCustomSelector] = useState('');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const handleIframeClick = async (event: React.MouseEvent<HTMLIFrameElement>) => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const rect = iframe.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    setLoading(true);
    setElementInfo(null);
    setSuggestions(null);

    try {
      // Get element at position
      const response = await fetch('/api/element-selector/at-position', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, x, y }),
      });

      const data = await response.json();

      if (data.success) {
        const element = data.data;
        setElementInfo(element);

        // Get suggestions
        const suggestionsResponse = await fetch('/api/element-selector/suggestions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url, selector: element.cssSelector }),
        });

        const suggestionsData = await suggestionsResponse.json();
        if (suggestionsData.success) {
          setSuggestions(suggestionsData.data);
        }

        if (onElementSelected) {
          onElementSelected(element, element.cssSelector);
        }
      }
    } catch (error) {
      console.error('Error getting element:', error);
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedSelector(text);
      setTimeout(() => setCopiedSelector(null), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const validateCustomSelector = async () => {
    if (!customSelector.trim()) return;

    setLoading(true);
    try {
      const response = await fetch('/api/element-selector/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, selector: customSelector }),
      });

      const data = await response.json();
      if (data.success) {
        setValidationResult(data.data);
      }
    } catch (error) {
      console.error('Error validating selector:', error);
    } finally {
      setLoading(false);
    }
  };

  const SelectorButton: React.FC<{ label: string; selector?: string; description?: string }> = ({
    label,
    selector,
    description,
  }) => {
    if (!selector) return null;

    return (
      <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
        <div className="flex-1">
          <div className="text-sm font-medium text-gray-900">{label}</div>
          <code className="text-xs text-gray-600 break-all">{selector}</code>
          {description && <div className="text-xs text-gray-500 mt-1">{description}</div>}
        </div>
        <button
          onClick={() => {
            copyToClipboard(selector);
          }}
          className="p-2 hover:bg-gray-200 rounded transition-colors"
          title="Copy selector"
        >
          {copiedSelector === selector ? (
            <CheckCircle className="w-4 h-4 text-green-600" />
          ) : (
            <Copy className="w-4 h-4 text-gray-600" />
          )}
        </button>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="card">
        <div className="flex items-center gap-3 mb-4">
          <Crosshair className="w-6 h-6 text-blue-600" />
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Element Picker</h2>
            <p className="text-gray-600">Click any element on the page to inspect and generate selectors</p>
          </div>
        </div>

        {loading && (
          <div className="flex items-center gap-2 text-blue-600">
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Analyzing element...</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Preview iframe */}
        <div className="card">
          <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Eye className="w-5 h-5 text-blue-600" />
            Preview
          </h3>
          <div className="border-2 border-blue-300 rounded-lg overflow-hidden" style={{ height: '600px' }}>
            <iframe
              ref={iframeRef}
              src={url}
              className="w-full h-full cursor-crosshair"
              onClick={handleIframeClick}
              title="Element Picker Preview"
            />
          </div>
          <p className="text-sm text-gray-600 mt-2">Click on any element to inspect it</p>
        </div>

        {/* Element Information */}
        <div className="space-y-4">
          {elementInfo ? (
            <>
              {/* Basic Info */}
              <div className="card">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Code className="w-5 h-5 text-blue-600" />
                  Element Information
                </h3>
                <div className="space-y-3">
                  <div>
                    <span className="text-sm font-medium text-gray-600">Tag:</span>
                    <code className="ml-2 px-2 py-1 bg-gray-100 rounded text-sm">{elementInfo.tagName}</code>
                  </div>
                  {elementInfo.id && (
                    <div>
                      <span className="text-sm font-medium text-gray-600">ID:</span>
                      <code className="ml-2 px-2 py-1 bg-gray-100 rounded text-sm">{elementInfo.id}</code>
                    </div>
                  )}
                  {elementInfo.classes.length > 0 && (
                    <div>
                      <span className="text-sm font-medium text-gray-600">Classes:</span>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {elementInfo.classes.map((cls, idx) => (
                          <code key={idx} className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs">
                            {cls}
                          </code>
                        ))}
                      </div>
                    </div>
                  )}
                  {elementInfo.text && (
                    <div>
                      <span className="text-sm font-medium text-gray-600">Text:</span>
                      <p className="mt-1 text-sm text-gray-700 bg-gray-50 p-2 rounded max-h-20 overflow-auto">
                        {elementInfo.text}
                      </p>
                    </div>
                  )}
                  <div>
                    <span className="text-sm font-medium text-gray-600">Position:</span>
                    <div className="mt-1 grid grid-cols-2 gap-2 text-xs">
                      <div className="bg-gray-50 p-2 rounded">
                        X: {Math.round(elementInfo.position.x)}px
                      </div>
                      <div className="bg-gray-50 p-2 rounded">
                        Y: {Math.round(elementInfo.position.y)}px
                      </div>
                      <div className="bg-gray-50 p-2 rounded">
                        W: {Math.round(elementInfo.position.width)}px
                      </div>
                      <div className="bg-gray-50 p-2 rounded">
                        H: {Math.round(elementInfo.position.height)}px
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Selector Suggestions */}
              {suggestions && (
                <div className="card">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                    <MapPin className="w-5 h-5 text-blue-600" />
                    Selector Suggestions
                  </h3>
                  <div className="space-y-2">
                    <SelectorButton
                      label="Unique Selector (Recommended)"
                      selector={suggestions.uniqueSelector}
                      description="Most reliable and specific selector"
                    />
                    {suggestions.byId && (
                      <SelectorButton label="By ID" selector={suggestions.byId} description="Best performance" />
                    )}
                    {suggestions.byClass && (
                      <SelectorButton label="By Class" selector={suggestions.byClass} />
                    )}
                    {suggestions.byTagAndClass && (
                      <SelectorButton label="By Tag + Class" selector={suggestions.byTagAndClass} />
                    )}
                    {suggestions.dataTestId && (
                      <SelectorButton
                        label="By Test ID"
                        selector={suggestions.dataTestId}
                        description="For testing automation"
                      />
                    )}
                    {suggestions.byAttribute && (
                      <SelectorButton label="By Data Attribute" selector={suggestions.byAttribute} />
                    )}
                    {suggestions.byNthChild && (
                      <SelectorButton label="By nth-child" selector={suggestions.byNthChild} />
                    )}
                    <SelectorButton
                      label="XPath"
                      selector={suggestions.xpath}
                      description="For XML/XHTML documents"
                    />
                  </div>
                </div>
              )}

              {/* Custom Selector Tester */}
              <div className="card">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                  <Search className="w-5 h-5 text-blue-600" />
                  Test Custom Selector
                </h3>
                <div className="space-y-3">
                  <input
                    type="text"
                    value={customSelector}
                    onChange={(e) => setCustomSelector(e.target.value)}
                    placeholder="Enter CSS selector (e.g., .my-class)"
                    className="input"
                    onKeyPress={(e) => e.key === 'Enter' && validateCustomSelector()}
                  />
                  <button onClick={validateCustomSelector} disabled={loading} className="btn-primary w-full">
                    Validate Selector
                  </button>
                  {validationResult && (
                    <div
                      className={`p-3 rounded-lg ${
                        validationResult.valid
                          ? 'bg-green-50 border border-green-200'
                          : 'bg-red-50 border border-red-200'
                      }`}
                    >
                      {validationResult.valid ? (
                        <div className="text-green-800">
                          <div className="font-semibold">✓ Valid Selector</div>
                          <div className="text-sm">Matches {validationResult.count} element(s)</div>
                        </div>
                      ) : (
                        <div className="text-red-800">
                          <div className="font-semibold">✗ Invalid Selector</div>
                          {validationResult.error && <div className="text-sm">{validationResult.error}</div>}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="card">
              <div className="text-center py-12 text-gray-500">
                <Crosshair className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                <p className="text-lg font-medium mb-2">No Element Selected</p>
                <p className="text-sm">Click on any element in the preview to inspect it</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
