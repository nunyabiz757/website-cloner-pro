import { Router } from 'express';
import { ClaudeAIService, type AIChatMessage } from '../services/ClaudeAIService.js';
import type { ClonedWebsite, PerformanceAnalysis } from '../../shared/types/index.js';

const router = Router();
const aiService = new ClaudeAIService();

// In-memory storage (replace with database in production)
const websites = new Map<string, ClonedWebsite>();
const performanceAnalyses = new Map<string, PerformanceAnalysis>();
const chatHistories = new Map<string, AIChatMessage[]>();

/**
 * Generate AI insights for a website
 * POST /api/ai/insights/:websiteId
 */
router.post('/insights/:websiteId', async (req, res) => {
  try {
    const { websiteId } = req.params;
    const { context } = req.body;

    const website = websites.get(websiteId);
    if (!website) {
      return res.status(404).json({
        success: false,
        error: 'Website not found',
      });
    }

    const performanceAnalysis = performanceAnalyses.get(websiteId);

    const insights = await aiService.generateInsights({
      website,
      performanceAnalysis,
      context,
    });

    res.json({
      success: true,
      data: insights,
    });
  } catch (error) {
    console.error('Error generating insights:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate insights',
    });
  }
});

/**
 * Analyze performance issues with AI
 * POST /api/ai/analyze-performance/:websiteId
 */
router.post('/analyze-performance/:websiteId', async (req, res) => {
  try {
    const { websiteId } = req.params;

    const performanceAnalysis = performanceAnalyses.get(websiteId);
    if (!performanceAnalysis) {
      return res.status(404).json({
        success: false,
        error: 'Performance analysis not found',
      });
    }

    const website = websites.get(websiteId);
    const websiteContext = website ? `${website.name} (${website.url})` : 'Website';

    const analysis = await aiService.analyzePerformanceIssues(
      performanceAnalysis.issues,
      performanceAnalysis.metrics,
      websiteContext
    );

    res.json({
      success: true,
      data: analysis,
    });
  } catch (error) {
    console.error('Error analyzing performance:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to analyze performance',
    });
  }
});

/**
 * Analyze code with AI
 * POST /api/ai/analyze-code
 */
router.post('/analyze-code', async (req, res) => {
  try {
    const { code, fileType, context } = req.body;

    if (!code || !fileType) {
      return res.status(400).json({
        success: false,
        error: 'Code and fileType are required',
      });
    }

    const analysis = await aiService.analyzeCode(code, fileType, context);

    res.json({
      success: true,
      data: analysis,
    });
  } catch (error) {
    console.error('Error analyzing code:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to analyze code',
    });
  }
});

/**
 * Chat with AI assistant
 * POST /api/ai/chat/:sessionId
 */
router.post('/chat/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { message, systemPrompt } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        error: 'Message is required',
      });
    }

    // Get or create chat history
    let chatHistory = chatHistories.get(sessionId) || [];

    // Add user message
    const userMessage: AIChatMessage = {
      role: 'user',
      content: message,
      timestamp: new Date().toISOString(),
    };
    chatHistory.push(userMessage);

    // Get AI response
    const response = await aiService.chat(chatHistory, systemPrompt);

    // Add assistant message
    const assistantMessage: AIChatMessage = {
      role: 'assistant',
      content: response,
      timestamp: new Date().toISOString(),
    };
    chatHistory.push(assistantMessage);

    // Store updated history
    chatHistories.set(sessionId, chatHistory);

    res.json({
      success: true,
      data: {
        message: assistantMessage,
        history: chatHistory,
      },
    });
  } catch (error) {
    console.error('Error in AI chat:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to process chat',
    });
  }
});

/**
 * Get chat history
 * GET /api/ai/chat/:sessionId/history
 */
router.get('/chat/:sessionId/history', (req, res) => {
  try {
    const { sessionId } = req.params;
    const history = chatHistories.get(sessionId) || [];

    res.json({
      success: true,
      data: history,
    });
  } catch (error) {
    console.error('Error getting chat history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get chat history',
    });
  }
});

/**
 * Clear chat history
 * DELETE /api/ai/chat/:sessionId/history
 */
router.delete('/chat/:sessionId/history', (req, res) => {
  try {
    const { sessionId } = req.params;
    chatHistories.delete(sessionId);

    res.json({
      success: true,
      message: 'Chat history cleared',
    });
  } catch (error) {
    console.error('Error clearing chat history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clear chat history',
    });
  }
});

/**
 * Generate performance summary
 * POST /api/ai/performance-summary
 */
router.post('/performance-summary', async (req, res) => {
  try {
    const { originalMetrics, optimizedMetrics } = req.body;

    if (!originalMetrics || !optimizedMetrics) {
      return res.status(400).json({
        success: false,
        error: 'Both originalMetrics and optimizedMetrics are required',
      });
    }

    const summary = await aiService.generatePerformanceSummary(originalMetrics, optimizedMetrics);

    res.json({
      success: true,
      data: { summary },
    });
  } catch (error) {
    console.error('Error generating performance summary:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate summary',
    });
  }
});

// Helper function to register data (called from other routes)
export function registerWebsite(websiteId: string, website: ClonedWebsite) {
  websites.set(websiteId, website);
}

export function registerPerformanceAnalysis(websiteId: string, analysis: PerformanceAnalysis) {
  performanceAnalyses.set(websiteId, analysis);
}

export default router;
