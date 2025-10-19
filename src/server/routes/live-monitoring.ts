import express from 'express';
import LivePerformanceMonitoringService from '../services/LivePerformanceMonitoringService.js';

const router = express.Router();

/**
 * Create new monitoring session
 * POST /api/live-monitoring/session
 */
router.post('/session', (req, res) => {
  try {
    const { previewId, url, userAgent } = req.body;

    if (!previewId || !url) {
      return res.status(400).json({
        success: false,
        error: 'previewId and url are required',
      });
    }

    const sessionId = LivePerformanceMonitoringService.createSession(
      previewId,
      url,
      userAgent || req.headers['user-agent'] || 'Unknown'
    );

    res.json({
      success: true,
      sessionId,
    });
  } catch (error) {
    console.error('Failed to create session:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create session',
    });
  }
});

/**
 * Record performance metrics
 * POST /api/live-monitoring/metrics
 */
router.post('/metrics', (req, res) => {
  try {
    const { sessionId, metrics } = req.body;

    if (!sessionId || !metrics) {
      return res.status(400).json({
        success: false,
        error: 'sessionId and metrics are required',
      });
    }

    LivePerformanceMonitoringService.recordMetrics(sessionId, metrics);

    res.json({
      success: true,
    });
  } catch (error) {
    console.error('Failed to record metrics:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to record metrics',
    });
  }
});

/**
 * Record user interaction
 * POST /api/live-monitoring/interaction
 */
router.post('/interaction', (req, res) => {
  try {
    const { sessionId, interaction } = req.body;

    if (!sessionId || !interaction) {
      return res.status(400).json({
        success: false,
        error: 'sessionId and interaction are required',
      });
    }

    LivePerformanceMonitoringService.recordInteraction(sessionId, interaction);

    res.json({
      success: true,
    });
  } catch (error) {
    console.error('Failed to record interaction:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to record interaction',
    });
  }
});

/**
 * Record error
 * POST /api/live-monitoring/error
 */
router.post('/error', (req, res) => {
  try {
    const { sessionId, error } = req.body;

    if (!sessionId || !error) {
      return res.status(400).json({
        success: false,
        error: 'sessionId and error are required',
      });
    }

    LivePerformanceMonitoringService.recordError(sessionId, error);

    res.json({
      success: true,
    });
  } catch (error) {
    console.error('Failed to record error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to record error',
    });
  }
});

/**
 * Get dashboard data
 * GET /api/live-monitoring/dashboard/:sessionId
 */
router.get('/dashboard/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;

    const dashboard = LivePerformanceMonitoringService.getDashboard(sessionId);

    res.json({
      success: true,
      dashboard,
    });
  } catch (error) {
    console.error('Failed to get dashboard:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get dashboard',
    });
  }
});

/**
 * Get session data
 * GET /api/live-monitoring/session/:sessionId
 */
router.get('/session/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;

    const session = LivePerformanceMonitoringService.getSession(sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found',
      });
    }

    res.json({
      success: true,
      session,
    });
  } catch (error) {
    console.error('Failed to get session:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get session',
    });
  }
});

/**
 * Get all sessions for preview
 * GET /api/live-monitoring/preview/:previewId/sessions
 */
router.get('/preview/:previewId/sessions', (req, res) => {
  try {
    const { previewId } = req.params;

    const sessions = LivePerformanceMonitoringService.getPreviewSessions(previewId);

    res.json({
      success: true,
      sessions,
      count: sessions.length,
    });
  } catch (error) {
    console.error('Failed to get preview sessions:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get preview sessions',
    });
  }
});

/**
 * End session
 * POST /api/live-monitoring/session/:sessionId/end
 */
router.post('/session/:sessionId/end', (req, res) => {
  try {
    const { sessionId } = req.params;

    LivePerformanceMonitoringService.endSession(sessionId);

    res.json({
      success: true,
      message: 'Session ended successfully',
    });
  } catch (error) {
    console.error('Failed to end session:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to end session',
    });
  }
});

/**
 * Get monitoring script for injection
 * GET /api/live-monitoring/script/:sessionId
 */
router.get('/script/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const apiEndpoint = `${req.protocol}://${req.get('host')}/api/live-monitoring`;

    const script = LivePerformanceMonitoringService.generateMonitoringScript(
      sessionId,
      apiEndpoint
    );

    res.setHeader('Content-Type', 'text/javascript');
    res.send(script);
  } catch (error) {
    console.error('Failed to generate script:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate script',
    });
  }
});

/**
 * SSE endpoint for realtime updates
 * GET /api/live-monitoring/stream/:sessionId
 */
router.get('/stream/:sessionId', (req, res) => {
  const { sessionId } = req.params;

  // Set headers for SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable buffering in nginx

  // Send initial connection message
  res.write(`data: ${JSON.stringify({ type: 'connected', sessionId })}\n\n`);

  // Subscribe to updates
  const unsubscribe = LivePerformanceMonitoringService.subscribe(sessionId, (update) => {
    res.write(`data: ${JSON.stringify(update)}\n\n`);
  });

  // Clean up on client disconnect
  req.on('close', () => {
    unsubscribe();
  });
});

/**
 * Get Core Web Vitals summary
 * GET /api/live-monitoring/vitals/:sessionId
 */
router.get('/vitals/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;

    const session = LivePerformanceMonitoringService.getSession(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found',
      });
    }

    const latestMetrics = session.metrics[session.metrics.length - 1];

    if (!latestMetrics) {
      return res.json({
        success: true,
        vitals: null,
        message: 'No metrics recorded yet',
      });
    }

    const vitals = {
      lcp: {
        value: latestMetrics.lcp,
        rating: latestMetrics.lcp < 2500 ? 'good' : latestMetrics.lcp < 4000 ? 'needs-improvement' : 'poor',
        threshold: { good: 2500, poor: 4000 },
      },
      fid: {
        value: latestMetrics.fid,
        rating: latestMetrics.fid < 100 ? 'good' : latestMetrics.fid < 300 ? 'needs-improvement' : 'poor',
        threshold: { good: 100, poor: 300 },
      },
      cls: {
        value: latestMetrics.cls,
        rating: latestMetrics.cls < 0.1 ? 'good' : latestMetrics.cls < 0.25 ? 'needs-improvement' : 'poor',
        threshold: { good: 0.1, poor: 0.25 },
      },
      fcp: {
        value: latestMetrics.fcp,
        rating: latestMetrics.fcp < 1800 ? 'good' : latestMetrics.fcp < 3000 ? 'needs-improvement' : 'poor',
        threshold: { good: 1800, poor: 3000 },
      },
      ttfb: {
        value: latestMetrics.ttfb,
        rating: latestMetrics.ttfb < 800 ? 'good' : latestMetrics.ttfb < 1800 ? 'needs-improvement' : 'poor',
        threshold: { good: 800, poor: 1800 },
      },
    };

    res.json({
      success: true,
      vitals,
    });
  } catch (error) {
    console.error('Failed to get vitals:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get vitals',
    });
  }
});

/**
 * Get interaction heatmap data
 * GET /api/live-monitoring/heatmap/:sessionId
 */
router.get('/heatmap/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;

    const session = LivePerformanceMonitoringService.getSession(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found',
      });
    }

    // Generate heatmap data from interactions
    const clicks = session.interactions
      .filter(i => i.type === 'click' && i.x !== undefined && i.y !== undefined)
      .map(i => ({ x: i.x!, y: i.y!, timestamp: i.timestamp }));

    const scrollDepths = session.interactions
      .filter(i => i.type === 'scroll' && i.value)
      .map(i => ({
        depth: i.value.scrollPercentage,
        timestamp: i.timestamp,
      }));

    res.json({
      success: true,
      heatmap: {
        clicks,
        scrollDepths,
      },
    });
  } catch (error) {
    console.error('Failed to get heatmap:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get heatmap',
    });
  }
});

/**
 * Get performance timeline
 * GET /api/live-monitoring/timeline/:sessionId
 */
router.get('/timeline/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;

    const dashboard = LivePerformanceMonitoringService.getDashboard(sessionId);

    res.json({
      success: true,
      timeline: dashboard.timeline,
    });
  } catch (error) {
    console.error('Failed to get timeline:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get timeline',
    });
  }
});

/**
 * Export session data
 * GET /api/live-monitoring/export/:sessionId
 */
router.get('/export/:sessionId', (req, res) => {
  try {
    const { sessionId } = req.params;
    const { format = 'json' } = req.query;

    const session = LivePerformanceMonitoringService.getSession(sessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found',
      });
    }

    const dashboard = LivePerformanceMonitoringService.getDashboard(sessionId);

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="monitoring-${sessionId}.json"`);
      res.json({
        session,
        dashboard,
      });
    } else if (format === 'csv') {
      // Generate CSV
      const csv = generateCSV(session, dashboard);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="monitoring-${sessionId}.csv"`);
      res.send(csv);
    } else {
      res.status(400).json({
        success: false,
        error: 'Invalid format. Use "json" or "csv"',
      });
    }
  } catch (error) {
    console.error('Failed to export session:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to export session',
    });
  }
});

/**
 * Generate CSV from session data
 */
function generateCSV(session: any, dashboard: any): string {
  const lines: string[] = [];

  // Header
  lines.push('Timestamp,Event Type,Metric,Value,Details');

  // Add metrics
  session.metrics.forEach((metric: any) => {
    lines.push(`${new Date(metric.timestamp).toISOString()},Metric,LCP,${metric.lcp},`);
    lines.push(`${new Date(metric.timestamp).toISOString()},Metric,FID,${metric.fid},`);
    lines.push(`${new Date(metric.timestamp).toISOString()},Metric,CLS,${metric.cls},`);
  });

  // Add interactions
  session.interactions.forEach((interaction: any) => {
    lines.push(`${new Date(interaction.timestamp).toISOString()},Interaction,${interaction.type},,${interaction.target}`);
  });

  // Add errors
  session.errors.forEach((error: any) => {
    lines.push(`${new Date(error.timestamp).toISOString()},Error,${error.type},,${error.message}`);
  });

  return lines.join('\n');
}

export default router;
