import express from 'express';
import PerformanceService from '../services/PerformanceService.js';
import type { ApiResponse, PerformanceAnalysis } from '../../shared/types/index.js';

const router = express.Router();

// Mock storage (in production, use a database)
const projects = new Map<string, any>();

/**
 * POST /api/performance/analyze
 * Run performance analysis on a cloned website
 */
router.post('/analyze', async (req, res) => {
  try {
    const { websiteId, url } = req.body;

    if (!websiteId) {
      return res.status(400).json({
        success: false,
        error: 'Website ID is required',
      } as ApiResponse<never>);
    }

    // Get website from storage
    const website = projects.get(websiteId);
    if (!website) {
      return res.status(404).json({
        success: false,
        error: 'Website not found',
      } as ApiResponse<never>);
    }

    const analysis = await PerformanceService.analyzePerformance(website, url);

    // Store analysis
    projects.set(websiteId, { ...website, performanceAnalysis: analysis });

    res.json({
      success: true,
      data: analysis,
      message: 'Performance analysis completed',
    } as ApiResponse<PerformanceAnalysis>);

  } catch (error) {
    console.error('Performance analysis error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to analyze performance',
    } as ApiResponse<never>);
  }
});

/**
 * GET /api/performance/:websiteId
 * Get performance analysis for a website
 */
router.get('/:websiteId', async (req, res) => {
  try {
    const { websiteId } = req.params;

    const website = projects.get(websiteId);
    if (!website || !website.performanceAnalysis) {
      return res.status(404).json({
        success: false,
        error: 'Performance analysis not found',
      } as ApiResponse<never>);
    }

    res.json({
      success: true,
      data: website.performanceAnalysis,
    } as ApiResponse<PerformanceAnalysis>);

  } catch (error) {
    console.error('Get performance error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get performance data',
    } as ApiResponse<never>);
  }
});

export default router;
