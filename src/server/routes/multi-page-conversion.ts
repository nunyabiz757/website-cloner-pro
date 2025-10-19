/**
 * Multi-Page Conversion API Routes
 *
 * REST API for multi-page website crawling and page builder conversion.
 *
 * Endpoints:
 * - POST /api/multi-page-conversion/start - Start crawl + conversion
 * - GET /api/multi-page-conversion/status/:sessionId - Get status
 * - POST /api/multi-page-conversion/pause/:sessionId - Pause crawl
 * - POST /api/multi-page-conversion/resume/:sessionId - Resume crawl
 * - GET /api/multi-page-conversion/pages/:sessionId - Get paginated pages
 * - GET /api/multi-page-conversion/conversions/:sessionId - Get conversions
 * - POST /api/multi-page-conversion/convert/:sessionId - Convert crawled pages
 * - DELETE /api/multi-page-conversion/:sessionId - Delete crawl
 * - GET /api/multi-page-conversion/progress/:sessionId/stream - SSE progress
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { AppLogger } from '../services/logger.service.js';
import LargeSiteCrawlManager from '../services/LargeSiteCrawlManager.js';
import CrawlToBuilderConverter from '../services/CrawlToBuilderConverter.js';
import CrawlPersistenceService from '../services/CrawlPersistenceService.js';

const router = Router();

// ============================================================================
// Validation Schemas
// ============================================================================

const startCrawlSchema = z.object({
  url: z.string().url('Invalid URL'),
  options: z.object({
    maxPages: z.number().int().min(1).max(10000).optional().default(100),
    maxDepth: z.number().int().min(0).max(10).optional().default(3),
    sameDomainOnly: z.boolean().optional().default(true),
    includeSubdomains: z.boolean().optional().default(false),
    excludePatterns: z.array(z.string()).optional().default([]),
    includePatterns: z.array(z.string()).optional().default([]),
    includeAssets: z.boolean().optional().default(true),
    useSitemap: z.boolean().optional().default(true),
    sitemapUrl: z.string().url().optional(),
    sitemapUrls: z.array(z.string().url()).optional(),
    batchSize: z.number().int().min(10).max(500).optional().default(100),
    throttleMs: z.number().int().min(0).max(10000).optional().default(1000),
    memoryLimit: z.number().int().min(128).max(2048).optional().default(512),
    autoSave: z.boolean().optional().default(true),
    autoResume: z.boolean().optional().default(false),
  }).optional().default({}),
  projectId: z.string().uuid().optional(),
});

const convertSchema = z.object({
  builderType: z.enum(['elementor', 'gutenberg', 'divi', 'beaver-builder']),
  options: z.object({
    batchSize: z.number().int().min(10).max(500).optional().default(100),
    useGlobals: z.boolean().optional().default(true),
    customCSS: z.boolean().optional().default(false),
    optimizeOutput: z.boolean().optional().default(true),
  }).optional().default({}),
});

const paginationSchema = z.object({
  page: z.number().int().min(1).optional().default(1),
  limit: z.number().int().min(1).max(200).optional().default(50),
  converted: z.boolean().optional(),
  conversionStatus: z.enum(['pending', 'converting', 'completed', 'failed']).optional(),
});

// ============================================================================
// Middleware
// ============================================================================

/**
 * Authentication middleware (placeholder - implement based on your auth system)
 */
const authenticate = (req: Request, res: Response, next: Function) => {
  // TODO: Implement authentication
  // For now, we'll extract user ID from headers (replace with your auth logic)
  const userId = req.headers['x-user-id'] as string;
  if (!userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  (req as any).userId = userId;
  next();
};

/**
 * Validation middleware
 */
const validate = (schema: z.ZodSchema) => {
  return (req: Request, res: Response, next: Function) => {
    try {
      const validated = schema.parse(req.body);
      req.body = validated;
      next();
    } catch (error: any) {
      AppLogger.warn('Validation failed', { error: error.errors });
      return res.status(400).json({
        error: 'Validation failed',
        details: error.errors,
      });
    }
  };
};

/**
 * Error handler middleware
 */
const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: Function) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// ============================================================================
// Routes
// ============================================================================

/**
 * POST /api/multi-page-conversion/start
 * Start a new multi-page crawl
 */
router.post(
  '/start',
  authenticate,
  validate(startCrawlSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { url, options, projectId } = req.body;
    const userId = (req as any).userId;

    AppLogger.info('Starting multi-page crawl', { url, userId, projectId });

    try {
      const sessionId = await LargeSiteCrawlManager.startLargeCrawl(
        url,
        options,
        userId,
        projectId
      );

      res.status(202).json({
        success: true,
        sessionId,
        message: 'Crawl started successfully',
        statusUrl: `/api/multi-page-conversion/status/${sessionId}`,
        progressStreamUrl: `/api/multi-page-conversion/progress/${sessionId}/stream`,
      });

    } catch (error: any) {
      AppLogger.error('Failed to start crawl', error, { url, userId });
      res.status(500).json({
        error: 'Failed to start crawl',
        message: error.message,
      });
    }
  })
);

/**
 * GET /api/multi-page-conversion/status/:sessionId
 * Get crawl status
 */
router.get(
  '/status/:sessionId',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const { sessionId } = req.params;

    try {
      const session = await CrawlPersistenceService.getCrawlSession(sessionId);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      const progress = await LargeSiteCrawlManager.getCrawlProgress(sessionId);
      const stats = await CrawlPersistenceService.getSessionStatistics(sessionId);

      res.json({
        success: true,
        session,
        progress,
        statistics: stats,
      });

    } catch (error: any) {
      AppLogger.error('Failed to get status', error, { sessionId });
      res.status(500).json({
        error: 'Failed to get status',
        message: error.message,
      });
    }
  })
);

/**
 * POST /api/multi-page-conversion/pause/:sessionId
 * Pause active crawl
 */
router.post(
  '/pause/:sessionId',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const { sessionId } = req.params;

    try {
      await LargeSiteCrawlManager.pauseCrawl(sessionId);

      res.json({
        success: true,
        message: 'Crawl paused successfully',
      });

    } catch (error: any) {
      AppLogger.error('Failed to pause crawl', error, { sessionId });
      res.status(500).json({
        error: 'Failed to pause crawl',
        message: error.message,
      });
    }
  })
);

/**
 * POST /api/multi-page-conversion/resume/:sessionId
 * Resume paused crawl
 */
router.post(
  '/resume/:sessionId',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const { sessionId } = req.params;

    try {
      await LargeSiteCrawlManager.resumeCrawl(sessionId);

      res.json({
        success: true,
        message: 'Crawl resumed successfully',
      });

    } catch (error: any) {
      AppLogger.error('Failed to resume crawl', error, { sessionId });
      res.status(500).json({
        error: 'Failed to resume crawl',
        message: error.message,
      });
    }
  })
);

/**
 * DELETE /api/multi-page-conversion/:sessionId
 * Cancel and delete crawl
 */
router.delete(
  '/:sessionId',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const { sessionId } = req.params;

    try {
      // Cancel if active
      if (LargeSiteCrawlManager.isCrawlActive(sessionId)) {
        await LargeSiteCrawlManager.cancelCrawl(sessionId);
      }

      // Delete session
      await CrawlPersistenceService.deleteCrawlSession(sessionId);

      res.json({
        success: true,
        message: 'Crawl deleted successfully',
      });

    } catch (error: any) {
      AppLogger.error('Failed to delete crawl', error, { sessionId });
      res.status(500).json({
        error: 'Failed to delete crawl',
        message: error.message,
      });
    }
  })
);

/**
 * GET /api/multi-page-conversion/pages/:sessionId
 * Get paginated crawled pages
 */
router.get(
  '/pages/:sessionId',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const { sessionId } = req.params;

    try {
      // Validate query params
      const params = paginationSchema.parse({
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
        converted: req.query.converted === 'true' ? true : req.query.converted === 'false' ? false : undefined,
        conversionStatus: req.query.conversionStatus as any,
      });

      const offset = (params.page - 1) * params.limit;

      const result = await CrawlPersistenceService.getPaginatedPages(
        sessionId,
        params.limit,
        offset,
        {
          converted: params.converted,
          conversionStatus: params.conversionStatus,
        }
      );

      res.json({
        success: true,
        ...result,
      });

    } catch (error: any) {
      AppLogger.error('Failed to get pages', error, { sessionId });
      res.status(500).json({
        error: 'Failed to get pages',
        message: error.message,
      });
    }
  })
);

/**
 * GET /api/multi-page-conversion/conversions/:sessionId
 * Get conversion results
 */
router.get(
  '/conversions/:sessionId',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const { sessionId } = req.params;

    try {
      const params = paginationSchema.parse({
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
      });

      const offset = (params.page - 1) * params.limit;

      // Get converted pages
      const result = await CrawlPersistenceService.getPaginatedPages(
        sessionId,
        params.limit,
        offset,
        { converted: true }
      );

      res.json({
        success: true,
        ...result,
      });

    } catch (error: any) {
      AppLogger.error('Failed to get conversions', error, { sessionId });
      res.status(500).json({
        error: 'Failed to get conversions',
        message: error.message,
      });
    }
  })
);

/**
 * POST /api/multi-page-conversion/convert/:sessionId
 * Convert crawled pages to page builder format
 */
router.post(
  '/convert/:sessionId',
  authenticate,
  validate(convertSchema),
  asyncHandler(async (req: Request, res: Response) => {
    const { sessionId } = req.params;
    const { builderType, options } = req.body;

    try {
      // Check if session exists
      const session = await CrawlPersistenceService.getCrawlSession(sessionId);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      if (session.status !== 'completed') {
        return res.status(400).json({
          error: 'Crawl must be completed before conversion',
          status: session.status,
        });
      }

      AppLogger.info('Starting page conversion', { sessionId, builderType });

      // Start conversion (async)
      CrawlToBuilderConverter.convertCrawledPages(sessionId, {
        builderType,
        ...options,
      }).catch(error => {
        AppLogger.error('Conversion failed', error, { sessionId });
      });

      res.status(202).json({
        success: true,
        message: 'Conversion started',
        progressUrl: `/api/multi-page-conversion/conversion-progress/${sessionId}`,
      });

    } catch (error: any) {
      AppLogger.error('Failed to start conversion', error, { sessionId });
      res.status(500).json({
        error: 'Failed to start conversion',
        message: error.message,
      });
    }
  })
);

/**
 * GET /api/multi-page-conversion/conversion-progress/:sessionId
 * Get conversion progress
 */
router.get(
  '/conversion-progress/:sessionId',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const { sessionId } = req.params;

    try {
      const progress = await CrawlToBuilderConverter.getConversionProgress(sessionId);

      res.json({
        success: true,
        progress,
      });

    } catch (error: any) {
      AppLogger.error('Failed to get conversion progress', error, { sessionId });
      res.status(500).json({
        error: 'Failed to get conversion progress',
        message: error.message,
      });
    }
  })
);

/**
 * GET /api/multi-page-conversion/progress/:sessionId/stream
 * Server-Sent Events (SSE) for real-time progress
 */
router.get(
  '/progress/:sessionId/stream',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const { sessionId } = req.params;

    try {
      // Set SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      // Send initial progress
      const initialProgress = await LargeSiteCrawlManager.getCrawlProgress(sessionId);
      res.write(`data: ${JSON.stringify(initialProgress)}\n\n`);

      // Set up progress listener
      const progressHandler = (progress: any) => {
        if (progress.sessionId === sessionId) {
          res.write(`data: ${JSON.stringify(progress)}\n\n`);
        }
      };

      LargeSiteCrawlManager.on('progress', progressHandler);

      // Set up completion listener
      const completedHandler = (data: any) => {
        if (data.sessionId === sessionId) {
          res.write(`data: ${JSON.stringify({ status: 'completed', ...data })}\n\n`);
          res.end();
        }
      };

      LargeSiteCrawlManager.on('completed', completedHandler);

      // Set up error listener
      const errorHandler = (data: any) => {
        if (data.sessionId === sessionId) {
          res.write(`data: ${JSON.stringify({ status: 'error', ...data })}\n\n`);
          res.end();
        }
      };

      LargeSiteCrawlManager.on('error', errorHandler);

      // Clean up on client disconnect
      req.on('close', () => {
        LargeSiteCrawlManager.removeListener('progress', progressHandler);
        LargeSiteCrawlManager.removeListener('completed', completedHandler);
        LargeSiteCrawlManager.removeListener('error', errorHandler);
      });

    } catch (error: any) {
      AppLogger.error('SSE stream error', error, { sessionId });
      res.status(500).json({
        error: 'Failed to stream progress',
        message: error.message,
      });
    }
  })
);

/**
 * GET /api/multi-page-conversion/sessions
 * List all sessions for user
 */
router.get(
  '/sessions',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = (req as any).userId;

    try {
      const params = paginationSchema.parse({
        page: req.query.page ? parseInt(req.query.page as string) : 1,
        limit: req.query.limit ? parseInt(req.query.limit as string) : 50,
      });

      const offset = (params.page - 1) * params.limit;

      const result = await CrawlPersistenceService.listCrawlSessions(
        { userId },
        params.limit,
        offset
      );

      res.json({
        success: true,
        ...result,
      });

    } catch (error: any) {
      AppLogger.error('Failed to list sessions', error, { userId });
      res.status(500).json({
        error: 'Failed to list sessions',
        message: error.message,
      });
    }
  })
);

/**
 * GET /api/multi-page-conversion/statistics/:sessionId
 * Get detailed statistics
 */
router.get(
  '/statistics/:sessionId',
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const { sessionId } = req.params;

    try {
      const stats = await LargeSiteCrawlManager.getCrawlStatistics(sessionId);

      res.json({
        success: true,
        statistics: stats,
      });

    } catch (error: any) {
      AppLogger.error('Failed to get statistics', error, { sessionId });
      res.status(500).json({
        error: 'Failed to get statistics',
        message: error.message,
      });
    }
  })
);

// ============================================================================
// Error Handler
// ============================================================================

router.use((error: any, req: Request, res: Response, next: Function) => {
  AppLogger.error('Multi-page conversion API error', error, {
    path: req.path,
    method: req.method,
  });

  res.status(error.status || 500).json({
    error: error.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
  });
});

export default router;
