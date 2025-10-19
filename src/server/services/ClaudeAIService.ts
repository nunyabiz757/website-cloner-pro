import Anthropic from '@anthropic-ai/sdk';
import type {
  PerformanceAnalysis,
  PerformanceIssue,
  ClonedWebsite,
  OptimizationResult,
  PerformanceMetrics,
} from '../../shared/types/index.js';

export interface AIInsight {
  id: string;
  type: 'suggestion' | 'warning' | 'opportunity' | 'best-practice';
  category: 'performance' | 'accessibility' | 'seo' | 'security' | 'code-quality';
  title: string;
  description: string;
  reasoning: string;
  impact: 'high' | 'medium' | 'low';
  effort: 'easy' | 'medium' | 'hard';
  priority: number; // 1-10
  suggestedFix?: string;
  codeExample?: string;
  resources?: string[];
}

export interface AIChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface AIAnalysisRequest {
  website: ClonedWebsite;
  performanceAnalysis?: PerformanceAnalysis;
  context?: string;
}

export class ClaudeAIService {
  private client: Anthropic;
  private model: string = 'claude-3-5-sonnet-20241022';

  constructor(apiKey?: string) {
    this.client = new Anthropic({
      apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
    });
  }

  /**
   * Generate intelligent insights and recommendations for a website
   */
  async generateInsights(request: AIAnalysisRequest): Promise<AIInsight[]> {
    const { website, performanceAnalysis, context } = request;

    const prompt = this.buildInsightsPrompt(website, performanceAnalysis, context);

    try {
      const message = await this.client.messages.create({
        model: this.model,
        max_tokens: 4096,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const responseText = message.content[0].type === 'text' ? message.content[0].text : '';
      return this.parseInsightsResponse(responseText);
    } catch (error) {
      console.error('Error generating AI insights:', error);
      throw new Error(`Failed to generate AI insights: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Analyze specific performance issues and provide detailed recommendations
   */
  async analyzePerformanceIssues(
    issues: PerformanceIssue[],
    metrics: PerformanceMetrics,
    websiteContext: string
  ): Promise<{ analysis: string; recommendations: string[]; prioritization: string }> {
    const prompt = `You are a web performance optimization expert. Analyze the following performance issues and provide actionable recommendations.

Website Context:
${websiteContext}

Performance Metrics:
- LCP: ${metrics.lcp.value}${metrics.lcp.unit} (${metrics.lcp.rating})
- FID: ${metrics.fid.value}${metrics.fid.unit} (${metrics.fid.rating})
- CLS: ${metrics.cls.value} (${metrics.cls.rating})
- FCP: ${metrics.fcp.value}${metrics.fcp.unit} (${metrics.fcp.rating})
- TTI: ${metrics.tti.value}${metrics.tti.unit} (${metrics.tti.rating})
- Performance Score: ${metrics.performanceScore}/100

Issues Found:
${issues.map((issue, idx) => `${idx + 1}. [${issue.severity}] ${issue.title}\n   Description: ${issue.description}\n   Impact: ${issue.impact}/100\n   Category: ${issue.category}`).join('\n\n')}

Please provide:
1. A comprehensive analysis of the root causes
2. Top 5 prioritized recommendations with reasoning
3. Quick wins vs long-term improvements
4. Expected impact of each recommendation

Format your response as JSON with this structure:
{
  "analysis": "detailed analysis text",
  "recommendations": ["rec1", "rec2", ...],
  "prioritization": "prioritization strategy text"
}`;

    try {
      const message = await this.client.messages.create({
        model: this.model,
        max_tokens: 3072,
        messages: [{ role: 'user', content: prompt }],
      });

      const responseText = message.content[0].type === 'text' ? message.content[0].text : '{}';
      return this.parseJSONResponse(responseText, {
        analysis: 'Unable to generate analysis',
        recommendations: [],
        prioritization: 'Unable to generate prioritization',
      });
    } catch (error) {
      console.error('Error analyzing performance issues:', error);
      throw error;
    }
  }

  /**
   * Generate code optimization suggestions for specific files
   */
  async analyzeCode(
    code: string,
    fileType: 'html' | 'css' | 'javascript',
    context?: string
  ): Promise<{ issues: string[]; suggestions: string[]; optimizedCode?: string }> {
    const prompt = `You are a code optimization expert. Analyze the following ${fileType.toUpperCase()} code and provide optimization suggestions.

${context ? `Context: ${context}\n\n` : ''}File Type: ${fileType}

Code to analyze:
\`\`\`${fileType}
${code.length > 2000 ? code.substring(0, 2000) + '\n... (truncated)' : code}
\`\`\`

Please provide:
1. List of issues or inefficiencies found
2. Specific optimization suggestions with reasoning
3. (Optional) Optimized version of critical sections

Format your response as JSON:
{
  "issues": ["issue1", "issue2", ...],
  "suggestions": ["suggestion1", "suggestion2", ...],
  "optimizedCode": "optional optimized code snippet"
}`;

    try {
      const message = await this.client.messages.create({
        model: this.model,
        max_tokens: 2048,
        messages: [{ role: 'user', content: prompt }],
      });

      const responseText = message.content[0].type === 'text' ? message.content[0].text : '{}';
      return this.parseJSONResponse(responseText, {
        issues: [],
        suggestions: [],
      });
    } catch (error) {
      console.error('Error analyzing code:', error);
      throw error;
    }
  }

  /**
   * Interactive chat for real-time assistance
   */
  async chat(messages: AIChatMessage[], systemPrompt?: string): Promise<string> {
    const defaultSystemPrompt = `You are an expert web development and performance optimization assistant. You help users optimize their websites for performance, accessibility, and SEO. Provide clear, actionable advice with code examples when appropriate.`;

    try {
      const message = await this.client.messages.create({
        model: this.model,
        max_tokens: 2048,
        system: systemPrompt || defaultSystemPrompt,
        messages: messages.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
      });

      return message.content[0].type === 'text' ? message.content[0].text : '';
    } catch (error) {
      console.error('Error in AI chat:', error);
      throw error;
    }
  }

  /**
   * Generate performance insights summary
   */
  async generatePerformanceSummary(
    originalMetrics: PerformanceMetrics,
    optimizedMetrics: PerformanceMetrics
  ): Promise<string> {
    const prompt = `Analyze these website performance improvements and provide a concise, user-friendly summary.

BEFORE OPTIMIZATION:
- Performance Score: ${originalMetrics.performanceScore}/100
- LCP: ${originalMetrics.lcp.value}${originalMetrics.lcp.unit} (${originalMetrics.lcp.rating})
- FID: ${originalMetrics.fid.value}${originalMetrics.fid.unit} (${originalMetrics.fid.rating})
- CLS: ${originalMetrics.cls.value} (${originalMetrics.cls.rating})
- TTI: ${originalMetrics.tti.value}${originalMetrics.tti.unit} (${originalMetrics.tti.rating})

AFTER OPTIMIZATION:
- Performance Score: ${optimizedMetrics.performanceScore}/100
- LCP: ${optimizedMetrics.lcp.value}${optimizedMetrics.lcp.unit} (${optimizedMetrics.lcp.rating})
- FID: ${optimizedMetrics.fid.value}${optimizedMetrics.fid.unit} (${optimizedMetrics.fid.rating})
- CLS: ${optimizedMetrics.cls.value} (${optimizedMetrics.cls.rating})
- TTI: ${optimizedMetrics.tti.value}${optimizedMetrics.tti.unit} (${optimizedMetrics.tti.rating})

Provide a 2-3 paragraph summary highlighting:
1. Key improvements and their real-world impact on user experience
2. Remaining areas for improvement
3. Next recommended steps

Write in a friendly, non-technical tone that business stakeholders can understand.`;

    try {
      const message = await this.client.messages.create({
        model: this.model,
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      });

      return message.content[0].type === 'text' ? message.content[0].text : 'Unable to generate summary';
    } catch (error) {
      console.error('Error generating performance summary:', error);
      throw error;
    }
  }

  /**
   * Build comprehensive insights prompt
   */
  private buildInsightsPrompt(
    website: ClonedWebsite,
    performanceAnalysis?: PerformanceAnalysis,
    context?: string
  ): string {
    let prompt = `You are a web performance and optimization expert. Analyze this website and provide intelligent insights and recommendations.

Website Information:
- URL: ${website.url}
- Name: ${website.name}
- Assets: ${website.assets.length} total (${website.assets.filter((a) => a.type === 'image').length} images, ${website.assets.filter((a) => a.type === 'font').length} fonts)
- HTML Size: ${website.html.length} characters
- CSS Files: ${website.css.length}
- JS Files: ${website.scripts.length}

${context ? `Additional Context:\n${context}\n\n` : ''}`;

    if (performanceAnalysis) {
      prompt += `
Performance Analysis:
- Performance Score: ${performanceAnalysis.metrics.performanceScore}/100
- LCP: ${performanceAnalysis.metrics.lcp.value}${performanceAnalysis.metrics.lcp.unit} (${performanceAnalysis.metrics.lcp.rating})
- FID: ${performanceAnalysis.metrics.fid.value}${performanceAnalysis.metrics.fid.unit} (${performanceAnalysis.metrics.fid.rating})
- CLS: ${performanceAnalysis.metrics.cls.value} (${performanceAnalysis.metrics.cls.rating})
- Issues: ${performanceAnalysis.issues.length} critical/high
- Opportunities: ${performanceAnalysis.opportunities.length}

Top Issues:
${performanceAnalysis.issues.slice(0, 5).map((issue, idx) => `${idx + 1}. ${issue.title} (${issue.severity})`).join('\n')}
`;
    }

    prompt += `
Generate 5-10 actionable insights in JSON format. Each insight should include:
- id: unique identifier
- type: "suggestion" | "warning" | "opportunity" | "best-practice"
- category: "performance" | "accessibility" | "seo" | "security" | "code-quality"
- title: brief title
- description: detailed description
- reasoning: why this matters
- impact: "high" | "medium" | "low"
- effort: "easy" | "medium" | "hard"
- priority: 1-10 (10 = highest priority)
- suggestedFix: specific action to take
- codeExample: (optional) code snippet
- resources: (optional) array of helpful links

Format: Return a JSON array of insights. Only return valid JSON, no markdown or explanations.`;

    return prompt;
  }

  /**
   * Parse insights from AI response
   */
  private parseInsightsResponse(response: string): AIInsight[] {
    try {
      // Try to extract JSON from response
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        console.warn('No JSON array found in response');
        return [];
      }

      const insights = JSON.parse(jsonMatch[0]);
      return Array.isArray(insights) ? insights : [];
    } catch (error) {
      console.error('Error parsing insights response:', error);
      return [];
    }
  }

  /**
   * Parse JSON response with fallback
   */
  private parseJSONResponse<T>(response: string, fallback: T): T {
    try {
      // Try to extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return fallback;
      }

      return JSON.parse(jsonMatch[0]);
    } catch (error) {
      console.error('Error parsing JSON response:', error);
      return fallback;
    }
  }
}
