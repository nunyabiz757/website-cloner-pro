import express, { Request, Response } from 'express';
import { Pool } from 'pg';
import { GHLDetectionService } from '../services/ghl-detection.service.js';
import { GHLPasteService } from '../services/ghl-paste.service.js';
import { CreditService } from '../services/credit.service.js';
import { RedisCacheService } from '../services/redis-cache.service.js';
import { authenticate } from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/rbac.middleware.js';
import { requireCredits } from '../middleware/credit.middleware.js';
import { getPool } from '../config/database.config.js';
import GHLAssetDownloadService from '../services/ghl-asset-download.service.js';

const router = express.Router();

// Initialize services
const pool = getPool();
const cache = new RedisCacheService();
let cacheInitialized = false;
const ensureCacheInitialized = async () => {
  if (!cacheInitialized) {
    await cache.initialize();
    cacheInitialized = true;
  }
};

const ghlDetectionService = new GHLDetectionService(pool, cache);
const ghlPasteService = new GHLPasteService(pool);
const creditService = new CreditService(pool, cache);
const ghlAssetDownloadService = new GHLAssetDownloadService(pool);

/**
 * Validate/Detect if URL is a GoHighLevel site
 * POST /api/ghl/validate
 */
router.post('/validate', authenticate, requirePermission('ghl', 'detect'), async (req: Request, res: Response) => {
  try {
    await ensureCacheInitialized();

    const { url } = req.body;

    if (!url) {
      return res.status(400).json({
        success: false,
        error: 'URL is required',
        code: 'VALIDATION_ERROR',
      });
    }

    const detection = await ghlDetectionService.detectGHLSite(url);

    res.json({
      success: true,
      detection,
    });
  } catch (error) {
    console.error('GHL validation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to validate GHL site',
      code: 'VALIDATION_ERROR',
    });
  }
});

/**
 * Copy GHL page (extract all data)
 * POST /api/ghl/copy
 */
router.post('/copy',
  authenticate,
  requirePermission('clone', 'ghl:copy'),
  requireCredits(1, 'ghl_copy'),
  async (req: Request, res: Response) => {
    try {
      await ensureCacheInitialized();

      if (!req.user || !('userId' in req.user)) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'AUTH_REQUIRED',
        });
      }

      const { url } = req.body;

      if (!url) {
        return res.status(400).json({
          success: false,
          error: 'URL is required',
          code: 'VALIDATION_ERROR',
        });
      }

      // Detect if it's a GHL site
      const detection = await ghlDetectionService.detectGHLSite(url);

      if (!detection.isGhlSite) {
        return res.status(400).json({
          success: false,
          error: 'URL does not appear to be a GoHighLevel site',
          code: 'NOT_GHL_SITE',
          detection,
        });
      }

      // Extract page data
      const pageData = await ghlDetectionService.extractPageData(url);

      // Consume credits
      const consumeResult = await creditService.consumeCredits(req.user.userId, 1, {
        operation: 'ghl_copy',
        resourceType: 'ghl_page',
        resourceId: detection.pageId || url,
        description: `Copied GHL page: ${url}`,
        confidence: detection.confidence,
        funnelId: detection.funnelId,
        pageId: detection.pageId,
      });

      if (!consumeResult.success) {
        return res.status(402).json({
          success: false,
          error: 'Insufficient credits',
          code: 'INSUFFICIENT_CREDITS',
        });
      }

      // Store cloned page in database
      const result = await pool.query(
        `INSERT INTO ghl_cloned_pages (
          user_id,
          source_url,
          source_domain,
          source_title,
          clone_status,
          credits_consumed,
          html_content,
          custom_css,
          custom_js,
          tracking_codes,
          forms,
          assets,
          ghl_data,
          elements_count,
          images_count,
          has_custom_css,
          created_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id, created_at, expires_at`,
        [
          req.user.userId,
          pageData.url,
          ghlDetectionService['extractDomain'](pageData.url),
          pageData.title,
          'copied',
          1,
          '', // HTML will be assembled on paste
          JSON.stringify(pageData.customCss),
          JSON.stringify(pageData.customJs),
          JSON.stringify(pageData.trackingCodes),
          JSON.stringify(pageData.forms),
          JSON.stringify(pageData.assets),
          JSON.stringify(pageData.ghlData),
          0, // Will be calculated on paste
          pageData.assets.images.length,
          pageData.customCss.length > 0,
        ]
      );

      const clonedPage = result.rows[0];

      res.json({
        success: true,
        message: 'GHL page copied successfully',
        clonedPageId: clonedPage.id,
        creditsConsumed: 1,
        creditsRemaining: consumeResult.creditsAfter,
        detection,
        pageData,
        expiresAt: clonedPage.expires_at,
      });
    } catch (error) {
      console.error('GHL copy error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to copy GHL page',
        code: 'COPY_ERROR',
      });
    }
  }
);

/**
 * Get cloned page data
 * GET /api/ghl/cloned/:id
 */
router.get('/cloned/:id',
  authenticate,
  requirePermission('clone', 'ghl:view'),
  async (req: Request, res: Response) => {
    try {
      if (!req.user || !('userId' in req.user)) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'AUTH_REQUIRED',
        });
      }

      const { id } = req.params;

      const result = await pool.query(
        `SELECT * FROM ghl_cloned_pages WHERE id = $1 AND user_id = $2`,
        [id, req.user.userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Cloned page not found',
          code: 'NOT_FOUND',
        });
      }

      const clonedPage = result.rows[0];

      res.json({
        success: true,
        clonedPage,
      });
    } catch (error) {
      console.error('Get cloned page error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get cloned page',
        code: 'GET_ERROR',
      });
    }
  }
);

/**
 * List user's cloned pages
 * GET /api/ghl/cloned
 */
router.get('/cloned',
  authenticate,
  requirePermission('clone', 'ghl:view'),
  async (req: Request, res: Response) => {
    try {
      if (!req.user || !('userId' in req.user)) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'AUTH_REQUIRED',
        });
      }

      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      const status = req.query.status as string;

      let query = `
        SELECT
          id, source_url, source_domain, source_title, clone_status,
          credits_consumed, created_at, updated_at, expires_at,
          elements_count, images_count, has_custom_css
        FROM ghl_cloned_pages
        WHERE user_id = $1
      `;
      const params: any[] = [req.user.userId];

      if (status) {
        query += ` AND clone_status = $${params.length + 1}`;
        params.push(status);
      }

      query += ` ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);

      const result = await pool.query(query, params);

      // Get total count
      let countQuery = `SELECT COUNT(*) as total FROM ghl_cloned_pages WHERE user_id = $1`;
      const countParams: any[] = [req.user.userId];
      if (status) {
        countQuery += ` AND clone_status = $2`;
        countParams.push(status);
      }
      const countResult = await pool.query(countQuery, countParams);
      const total = parseInt(countResult.rows[0].total);

      res.json({
        success: true,
        clonedPages: result.rows,
        total,
        limit,
        offset,
      });
    } catch (error) {
      console.error('List cloned pages error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to list cloned pages',
        code: 'LIST_ERROR',
      });
    }
  }
);

/**
 * Delete cloned page
 * DELETE /api/ghl/cloned/:id
 */
router.delete('/cloned/:id',
  authenticate,
  requirePermission('clone', 'ghl:delete'),
  async (req: Request, res: Response) => {
    try {
      if (!req.user || !('userId' in req.user)) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'AUTH_REQUIRED',
        });
      }

      const { id } = req.params;

      const result = await pool.query(
        `DELETE FROM ghl_cloned_pages WHERE id = $1 AND user_id = $2 RETURNING id`,
        [id, req.user.userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Cloned page not found',
          code: 'NOT_FOUND',
        });
      }

      res.json({
        success: true,
        message: 'Cloned page deleted successfully',
      });
    } catch (error) {
      console.error('Delete cloned page error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to delete cloned page',
        code: 'DELETE_ERROR',
      });
    }
  }
);

/**
 * Get user's clone statistics
 * GET /api/ghl/statistics
 */
router.get('/statistics',
  authenticate,
  requirePermission('clone', 'ghl:view'),
  async (req: Request, res: Response) => {
    try {
      if (!req.user || !('userId' in req.user)) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'AUTH_REQUIRED',
        });
      }

      const result = await pool.query(
        `SELECT * FROM get_user_clone_stats($1)`,
        [req.user.userId]
      );

      const stats = result.rows[0];

      res.json({
        success: true,
        statistics: stats,
      });
    } catch (error) {
      console.error('Get clone statistics error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get clone statistics',
        code: 'STATS_ERROR',
      });
    }
  }
);

/**
 * Search cloned pages
 * GET /api/ghl/search
 */
router.get('/search',
  authenticate,
  requirePermission('clone', 'ghl:view'),
  async (req: Request, res: Response) => {
    try {
      if (!req.user || !('userId' in req.user)) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'AUTH_REQUIRED',
        });
      }

      const { query, limit = 50 } = req.query;

      if (!query) {
        return res.status(400).json({
          success: false,
          error: 'Search query is required',
          code: 'VALIDATION_ERROR',
        });
      }

      const result = await pool.query(
        `SELECT * FROM search_cloned_pages($1, $2, $3)`,
        [req.user.userId, query, parseInt(limit as string)]
      );

      res.json({
        success: true,
        results: result.rows,
      });
    } catch (error) {
      console.error('Search cloned pages error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to search cloned pages',
        code: 'SEARCH_ERROR',
      });
    }
  }
);

/**
 * Get GHL detection statistics (admin only)
 * GET /api/ghl/admin/detection-stats
 */
router.get('/admin/detection-stats',
  authenticate,
  requirePermission('ghl', 'admin'),
  async (req: Request, res: Response) => {
    try {
      const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
      const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;

      const stats = await ghlDetectionService.getDetectionStats(startDate, endDate);

      res.json({
        success: true,
        statistics: stats,
      });
    } catch (error) {
      console.error('Get detection stats error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get detection statistics',
        code: 'STATS_ERROR',
      });
    }
  }
);

/**
 * Invalidate detection cache for URL (admin only)
 * POST /api/ghl/admin/invalidate-cache
 */
router.post('/admin/invalidate-cache',
  authenticate,
  requirePermission('ghl', 'admin'),
  async (req: Request, res: Response) => {
    try {
      await ensureCacheInitialized();

      const { url } = req.body;

      if (!url) {
        return res.status(400).json({
          success: false,
          error: 'URL is required',
          code: 'VALIDATION_ERROR',
        });
      }

      await ghlDetectionService.invalidateCache(url);

      res.json({
        success: true,
        message: 'Detection cache invalidated successfully',
      });
    } catch (error) {
      console.error('Invalidate cache error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to invalidate cache',
        code: 'CACHE_ERROR',
      });
    }
  }
);

// ============================================================================
// PASTE ENDPOINTS (For Browser Extension)
// ============================================================================

/**
 * Create paste session for browser extension
 * POST /api/ghl/paste/session
 */
router.post('/paste/session',
  authenticate,
  requirePermission('clone', 'ghl:paste'),
  async (req: Request, res: Response) => {
    try {
      if (!req.user || !('userId' in req.user)) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'AUTH_REQUIRED',
        });
      }

      const { clonedPageId, browserInfo, extensionVersion } = req.body;

      if (!clonedPageId) {
        return res.status(400).json({
          success: false,
          error: 'Cloned page ID is required',
          code: 'VALIDATION_ERROR',
        });
      }

      const session = await ghlPasteService.createSession({
        userId: req.user.userId,
        clonedPageId,
        browserInfo,
        extensionVersion,
      });

      res.json({
        success: true,
        session: {
          sessionToken: session.sessionToken,
          expiresAt: session.expiresAt,
          clonedPageId: session.clonedPageId,
        },
      });
    } catch (error) {
      console.error('Create paste session error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Session creation failed';

      if (errorMessage.includes('not found') || errorMessage.includes('does not belong')) {
        return res.status(404).json({
          success: false,
          error: errorMessage,
          code: 'PAGE_NOT_FOUND',
        });
      }

      if (errorMessage.includes('already been pasted')) {
        return res.status(400).json({
          success: false,
          error: errorMessage,
          code: 'ALREADY_PASTED',
        });
      }

      res.status(500).json({
        success: false,
        error: 'Failed to create paste session',
        code: 'SESSION_ERROR',
      });
    }
  }
);

/**
 * Get paste data for session (extension uses this)
 * GET /api/ghl/paste/data/:sessionToken
 */
router.get('/paste/data/:sessionToken', async (req: Request, res: Response) => {
  try {
    const { sessionToken } = req.params;

    if (!sessionToken) {
      return res.status(400).json({
        success: false,
        error: 'Session token is required',
        code: 'VALIDATION_ERROR',
      });
    }

    const pasteData = await ghlPasteService.getPasteData(sessionToken);

    if (!pasteData) {
      return res.status(404).json({
        success: false,
        error: 'Invalid or expired session',
        code: 'INVALID_SESSION',
      });
    }

    res.json({
      success: true,
      data: pasteData,
    });
  } catch (error) {
    console.error('Get paste data error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get paste data',
      code: 'DATA_ERROR',
    });
  }
});

/**
 * Complete paste operation (extension calls this after pasting)
 * POST /api/ghl/paste/complete
 */
router.post('/paste/complete', async (req: Request, res: Response) => {
  try {
    const {
      sessionToken,
      destinationUrl,
      destinationAccountId,
      destinationFunnelId,
      destinationPageId,
      status,
      errors,
      warnings,
      elementsCount,
    } = req.body;

    if (!sessionToken || !destinationUrl || !status) {
      return res.status(400).json({
        success: false,
        error: 'Session token, destination URL, and status are required',
        code: 'VALIDATION_ERROR',
      });
    }

    await ghlPasteService.completePaste({
      sessionToken,
      destinationUrl,
      destinationAccountId,
      destinationFunnelId,
      destinationPageId,
      status,
      errors,
      warnings,
      elementsCount,
    });

    res.json({
      success: true,
      message: 'Paste operation completed successfully',
    });
  } catch (error) {
    console.error('Complete paste error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Completion failed';

    if (errorMessage.includes('Invalid or expired')) {
      return res.status(404).json({
        success: false,
        error: errorMessage,
        code: 'INVALID_SESSION',
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to complete paste operation',
      code: 'COMPLETE_ERROR',
    });
  }
});

/**
 * Cancel paste session
 * DELETE /api/ghl/paste/session/:sessionToken
 */
router.delete('/paste/session/:sessionToken',
  authenticate,
  async (req: Request, res: Response) => {
    try {
      const { sessionToken } = req.params;

      await ghlPasteService.cancelSession(sessionToken);

      res.json({
        success: true,
        message: 'Session canceled successfully',
      });
    } catch (error) {
      console.error('Cancel session error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to cancel session',
        code: 'CANCEL_ERROR',
      });
    }
  }
);

/**
 * Get user's paste sessions
 * GET /api/ghl/paste/sessions
 */
router.get('/paste/sessions',
  authenticate,
  requirePermission('clone', 'ghl:view'),
  async (req: Request, res: Response) => {
    try {
      if (!req.user || !('userId' in req.user)) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'AUTH_REQUIRED',
        });
      }

      const includeExpired = req.query.includeExpired === 'true';
      const sessions = await ghlPasteService.getUserSessions(req.user.userId, includeExpired);

      res.json({
        success: true,
        sessions,
      });
    } catch (error) {
      console.error('Get sessions error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get sessions',
        code: 'SESSIONS_ERROR',
      });
    }
  }
);

// ============================================================================
// ASSET DOWNLOAD ENDPOINTS
// ============================================================================

/**
 * Download assets for a cloned page
 * POST /api/ghl/cloned/:id/download-assets
 */
router.post('/cloned/:id/download-assets',
  authenticate,
  requirePermission('clone', 'ghl:copy'),
  async (req: Request, res: Response) => {
    try {
      if (!req.user || !('userId' in req.user)) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'AUTH_REQUIRED',
        });
      }

      const { id } = req.params;

      // Verify ownership
      const ownershipCheck = await pool.query(
        'SELECT id, source_url FROM ghl_cloned_pages WHERE id = $1 AND user_id = $2',
        [id, req.user.userId]
      );

      if (ownershipCheck.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Cloned page not found or access denied',
          code: 'NOT_FOUND',
        });
      }

      const page = ownershipCheck.rows[0];

      // Start asset download
      const result = await ghlAssetDownloadService.downloadPageAssets(id, {
        baseUrl: page.source_url,
      });

      res.json({
        success: true,
        message: 'Asset download completed',
        result,
      });
    } catch (error) {
      console.error('Download assets error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to download assets',
        code: 'DOWNLOAD_ERROR',
      });
    }
  }
);

/**
 * Get asset download status for a cloned page
 * GET /api/ghl/cloned/:id/assets/status
 */
router.get('/cloned/:id/assets/status',
  authenticate,
  requirePermission('clone', 'ghl:view'),
  async (req: Request, res: Response) => {
    try {
      if (!req.user || !('userId' in req.user)) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'AUTH_REQUIRED',
        });
      }

      const { id } = req.params;

      // Verify ownership
      const ownershipCheck = await pool.query(
        'SELECT id FROM ghl_cloned_pages WHERE id = $1 AND user_id = $2',
        [id, req.user.userId]
      );

      if (ownershipCheck.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Cloned page not found or access denied',
          code: 'NOT_FOUND',
        });
      }

      const status = await ghlAssetDownloadService.getAssetStatus(id);

      res.json({
        success: true,
        status,
      });
    } catch (error) {
      console.error('Get asset status error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get asset status',
        code: 'STATUS_ERROR',
      });
    }
  }
);

/**
 * Retry failed asset downloads
 * POST /api/ghl/cloned/:id/assets/retry
 */
router.post('/cloned/:id/assets/retry',
  authenticate,
  requirePermission('clone', 'ghl:copy'),
  async (req: Request, res: Response) => {
    try {
      if (!req.user || !('userId' in req.user)) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'AUTH_REQUIRED',
        });
      }

      const { id } = req.params;

      // Verify ownership and get source URL
      const ownershipCheck = await pool.query(
        'SELECT id, source_url FROM ghl_cloned_pages WHERE id = $1 AND user_id = $2',
        [id, req.user.userId]
      );

      if (ownershipCheck.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Cloned page not found or access denied',
          code: 'NOT_FOUND',
        });
      }

      const page = ownershipCheck.rows[0];

      const result = await ghlAssetDownloadService.retryFailedAssets(id, page.source_url);

      res.json({
        success: true,
        message: 'Asset retry completed',
        result,
      });
    } catch (error) {
      console.error('Retry assets error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to retry asset downloads',
        code: 'RETRY_ERROR',
      });
    }
  }
);

/**
 * Get list of assets for a cloned page
 * GET /api/ghl/cloned/:id/assets
 */
router.get('/cloned/:id/assets',
  authenticate,
  requirePermission('clone', 'ghl:view'),
  async (req: Request, res: Response) => {
    try {
      if (!req.user || !('userId' in req.user)) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'AUTH_REQUIRED',
        });
      }

      const { id } = req.params;

      // Verify ownership
      const ownershipCheck = await pool.query(
        'SELECT id FROM ghl_cloned_pages WHERE id = $1 AND user_id = $2',
        [id, req.user.userId]
      );

      if (ownershipCheck.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Cloned page not found or access denied',
          code: 'NOT_FOUND',
        });
      }

      const result = await pool.query(
        `SELECT
          id,
          asset_type,
          original_url,
          downloaded_url,
          file_size_bytes,
          mime_type,
          download_status,
          error_message,
          created_at,
          updated_at
         FROM ghl_page_assets
         WHERE cloned_page_id = $1
         ORDER BY asset_type, created_at`,
        [id]
      );

      res.json({
        success: true,
        assets: result.rows,
        total: result.rows.length,
      });
    } catch (error) {
      console.error('Get assets error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get assets',
        code: 'GET_ERROR',
      });
    }
  }
);

// ============================================================================
// TEMPLATE ENDPOINTS
// ============================================================================

/**
 * Create template from cloned page
 * POST /api/ghl/templates
 */
router.post('/templates',
  authenticate,
  requirePermission('clone', 'ghl:template:create'),
  async (req: Request, res: Response) => {
    try {
      if (!req.user || !('userId' in req.user)) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'AUTH_REQUIRED',
        });
      }

      const {
        clonedPageId,
        name,
        description,
        category,
        tags,
        isPublic,
        thumbnailUrl,
        previewUrl,
      } = req.body;

      // Validation
      if (!clonedPageId || !name) {
        return res.status(400).json({
          success: false,
          error: 'Cloned page ID and name are required',
          code: 'VALIDATION_ERROR',
        });
      }

      // Verify cloned page exists and belongs to user
      const cloneCheck = await pool.query(
        'SELECT id FROM ghl_cloned_pages WHERE id = $1 AND user_id = $2',
        [clonedPageId, req.user.userId]
      );

      if (cloneCheck.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Cloned page not found or does not belong to you',
          code: 'PAGE_NOT_FOUND',
        });
      }

      // Check if template already exists for this cloned page
      const existingTemplate = await pool.query(
        'SELECT id FROM ghl_clone_templates WHERE cloned_page_id = $1 AND user_id = $2',
        [clonedPageId, req.user.userId]
      );

      if (existingTemplate.rows.length > 0) {
        return res.status(400).json({
          success: false,
          error: 'Template already exists for this cloned page',
          code: 'TEMPLATE_EXISTS',
        });
      }

      // Create template
      const result = await pool.query(
        `INSERT INTO ghl_clone_templates (
          user_id,
          cloned_page_id,
          name,
          description,
          category,
          tags,
          is_public,
          thumbnail_url,
          preview_url
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *`,
        [
          req.user.userId,
          clonedPageId,
          name,
          description || null,
          category || null,
          tags || [],
          isPublic || false,
          thumbnailUrl || null,
          previewUrl || null,
        ]
      );

      const template = result.rows[0];

      res.status(201).json({
        success: true,
        message: 'Template created successfully',
        template,
      });
    } catch (error) {
      console.error('Create template error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to create template',
        code: 'CREATE_ERROR',
      });
    }
  }
);

/**
 * List templates (user's own + public templates)
 * GET /api/ghl/templates
 */
router.get('/templates',
  authenticate,
  requirePermission('clone', 'ghl:view'),
  async (req: Request, res: Response) => {
    try {
      if (!req.user || !('userId' in req.user)) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'AUTH_REQUIRED',
        });
      }

      const limit = parseInt(req.query.limit as string) || 50;
      const offset = parseInt(req.query.offset as string) || 0;
      const category = req.query.category as string;
      const search = req.query.search as string;
      const publicOnly = req.query.publicOnly === 'true';
      const myTemplatesOnly = req.query.myTemplatesOnly === 'true';

      let query = `
        SELECT
          t.id,
          t.user_id,
          t.name,
          t.description,
          t.category,
          t.tags,
          t.is_public,
          t.use_count,
          t.thumbnail_url,
          t.preview_url,
          t.rating,
          t.rating_count,
          t.created_at,
          t.updated_at,
          cp.source_url,
          cp.source_title,
          cp.has_custom_css,
          cp.has_custom_js,
          cp.images_count,
          u.email as creator_email
        FROM ghl_clone_templates t
        JOIN ghl_cloned_pages cp ON t.cloned_page_id = cp.id
        JOIN users u ON t.user_id = u.id
        WHERE 1=1
      `;
      const params: any[] = [];

      // Filter logic
      if (myTemplatesOnly) {
        query += ` AND t.user_id = $${params.length + 1}`;
        params.push(req.user.userId);
      } else if (publicOnly) {
        query += ` AND t.is_public = true`;
      } else {
        // Show user's own templates + public templates
        query += ` AND (t.user_id = $${params.length + 1} OR t.is_public = true)`;
        params.push(req.user.userId);
      }

      if (category) {
        query += ` AND t.category = $${params.length + 1}`;
        params.push(category);
      }

      if (search) {
        query += ` AND (
          t.name ILIKE $${params.length + 1} OR
          t.description ILIKE $${params.length + 1} OR
          $${params.length + 1} = ANY(t.tags)
        )`;
        params.push(`%${search}%`);
      }

      query += ` ORDER BY t.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(limit, offset);

      const result = await pool.query(query, params);

      // Get total count
      let countQuery = `
        SELECT COUNT(*) as total
        FROM ghl_clone_templates t
        WHERE 1=1
      `;
      const countParams: any[] = [];

      if (myTemplatesOnly) {
        countQuery += ` AND t.user_id = $${countParams.length + 1}`;
        countParams.push(req.user.userId);
      } else if (publicOnly) {
        countQuery += ` AND t.is_public = true`;
      } else {
        countQuery += ` AND (t.user_id = $${countParams.length + 1} OR t.is_public = true)`;
        countParams.push(req.user.userId);
      }

      if (category) {
        countQuery += ` AND t.category = $${countParams.length + 1}`;
        countParams.push(category);
      }

      if (search) {
        countQuery += ` AND (
          t.name ILIKE $${countParams.length + 1} OR
          t.description ILIKE $${countParams.length + 1} OR
          $${countParams.length + 1} = ANY(t.tags)
        )`;
        countParams.push(`%${search}%`);
      }

      const countResult = await pool.query(countQuery, countParams);
      const total = parseInt(countResult.rows[0].total);

      res.json({
        success: true,
        templates: result.rows,
        total,
        limit,
        offset,
      });
    } catch (error) {
      console.error('List templates error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to list templates',
        code: 'LIST_ERROR',
      });
    }
  }
);

/**
 * Get single template details
 * GET /api/ghl/templates/:id
 */
router.get('/templates/:id',
  authenticate,
  requirePermission('clone', 'ghl:view'),
  async (req: Request, res: Response) => {
    try {
      if (!req.user || !('userId' in req.user)) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'AUTH_REQUIRED',
        });
      }

      const { id } = req.params;

      const result = await pool.query(
        `SELECT
          t.*,
          cp.source_url,
          cp.source_title,
          cp.source_domain,
          cp.clone_status,
          cp.html_content,
          cp.custom_css,
          cp.custom_js,
          cp.tracking_codes,
          cp.forms,
          cp.assets,
          cp.ghl_data,
          cp.has_custom_css,
          cp.has_custom_js,
          cp.images_count,
          cp.elements_count,
          u.email as creator_email
        FROM ghl_clone_templates t
        JOIN ghl_cloned_pages cp ON t.cloned_page_id = cp.id
        JOIN users u ON t.user_id = u.id
        WHERE t.id = $1 AND (t.user_id = $2 OR t.is_public = true)`,
        [id, req.user.userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Template not found or not accessible',
          code: 'NOT_FOUND',
        });
      }

      const template = result.rows[0];

      res.json({
        success: true,
        template,
      });
    } catch (error) {
      console.error('Get template error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get template',
        code: 'GET_ERROR',
      });
    }
  }
);

/**
 * Update template
 * PUT /api/ghl/templates/:id
 */
router.put('/templates/:id',
  authenticate,
  requirePermission('clone', 'ghl:template:create'),
  async (req: Request, res: Response) => {
    try {
      if (!req.user || !('userId' in req.user)) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'AUTH_REQUIRED',
        });
      }

      const { id } = req.params;
      const {
        name,
        description,
        category,
        tags,
        isPublic,
        thumbnailUrl,
        previewUrl,
      } = req.body;

      // Build update query dynamically
      const updates: string[] = [];
      const params: any[] = [];
      let paramCount = 1;

      if (name !== undefined) {
        updates.push(`name = $${paramCount++}`);
        params.push(name);
      }
      if (description !== undefined) {
        updates.push(`description = $${paramCount++}`);
        params.push(description);
      }
      if (category !== undefined) {
        updates.push(`category = $${paramCount++}`);
        params.push(category);
      }
      if (tags !== undefined) {
        updates.push(`tags = $${paramCount++}`);
        params.push(tags);
      }
      if (isPublic !== undefined) {
        updates.push(`is_public = $${paramCount++}`);
        params.push(isPublic);
      }
      if (thumbnailUrl !== undefined) {
        updates.push(`thumbnail_url = $${paramCount++}`);
        params.push(thumbnailUrl);
      }
      if (previewUrl !== undefined) {
        updates.push(`preview_url = $${paramCount++}`);
        params.push(previewUrl);
      }

      if (updates.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No fields to update',
          code: 'VALIDATION_ERROR',
        });
      }

      updates.push(`updated_at = CURRENT_TIMESTAMP`);

      params.push(id, req.user.userId);

      const query = `
        UPDATE ghl_clone_templates
        SET ${updates.join(', ')}
        WHERE id = $${paramCount++} AND user_id = $${paramCount++}
        RETURNING *
      `;

      const result = await pool.query(query, params);

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Template not found or you do not have permission to update it',
          code: 'NOT_FOUND',
        });
      }

      const template = result.rows[0];

      res.json({
        success: true,
        message: 'Template updated successfully',
        template,
      });
    } catch (error) {
      console.error('Update template error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to update template',
        code: 'UPDATE_ERROR',
      });
    }
  }
);

/**
 * Delete template
 * DELETE /api/ghl/templates/:id
 */
router.delete('/templates/:id',
  authenticate,
  requirePermission('clone', 'ghl:template:create'),
  async (req: Request, res: Response) => {
    try {
      if (!req.user || !('userId' in req.user)) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'AUTH_REQUIRED',
        });
      }

      const { id } = req.params;

      const result = await pool.query(
        'DELETE FROM ghl_clone_templates WHERE id = $1 AND user_id = $2 RETURNING id',
        [id, req.user.userId]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Template not found or you do not have permission to delete it',
          code: 'NOT_FOUND',
        });
      }

      res.json({
        success: true,
        message: 'Template deleted successfully',
      });
    } catch (error) {
      console.error('Delete template error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to delete template',
        code: 'DELETE_ERROR',
      });
    }
  }
);

/**
 * Use template (clone from template)
 * POST /api/ghl/templates/:id/use
 */
router.post('/templates/:id/use',
  authenticate,
  requirePermission('clone', 'ghl:template:use'),
  requireCredits(1, 'template_use'),
  async (req: Request, res: Response) => {
    try {
      if (!req.user || !('userId' in req.user)) {
        return res.status(401).json({
          success: false,
          error: 'Authentication required',
          code: 'AUTH_REQUIRED',
        });
      }

      const { id } = req.params;

      // Get template with cloned page data
      const templateResult = await pool.query(
        `SELECT
          t.*,
          cp.source_url,
          cp.source_domain,
          cp.source_title,
          cp.html_content,
          cp.custom_css,
          cp.custom_js,
          cp.tracking_codes,
          cp.forms,
          cp.assets,
          cp.ghl_data,
          cp.elements_count,
          cp.images_count,
          cp.has_custom_css,
          cp.has_custom_js
        FROM ghl_clone_templates t
        JOIN ghl_cloned_pages cp ON t.cloned_page_id = cp.id
        WHERE t.id = $1 AND (t.user_id = $2 OR t.is_public = true)`,
        [id, req.user.userId]
      );

      if (templateResult.rows.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'Template not found or not accessible',
          code: 'NOT_FOUND',
        });
      }

      const template = templateResult.rows[0];

      // Consume credits
      const consumeResult = await creditService.consumeCredits(req.user.userId, 1, {
        operation: 'template_use',
        resourceType: 'ghl_template',
        resourceId: template.id,
        description: `Used template: ${template.name}`,
        templateId: template.id,
        templateName: template.name,
      });

      if (!consumeResult.success) {
        return res.status(402).json({
          success: false,
          error: 'Insufficient credits',
          code: 'INSUFFICIENT_CREDITS',
        });
      }

      // Create new cloned page from template
      const cloneResult = await pool.query(
        `INSERT INTO ghl_cloned_pages (
          user_id,
          source_url,
          source_domain,
          source_title,
          clone_status,
          credits_consumed,
          html_content,
          custom_css,
          custom_js,
          tracking_codes,
          forms,
          assets,
          ghl_data,
          elements_count,
          images_count,
          has_custom_css,
          has_custom_js,
          created_at,
          updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        RETURNING id, created_at, expires_at`,
        [
          req.user.userId,
          template.source_url,
          template.source_domain,
          `${template.source_title} (from template: ${template.name})`,
          'copied',
          1,
          template.html_content,
          template.custom_css,
          template.custom_js,
          template.tracking_codes,
          template.forms,
          template.assets,
          template.ghl_data,
          template.elements_count,
          template.images_count,
          template.has_custom_css,
          template.has_custom_js,
        ]
      );

      const newClone = cloneResult.rows[0];

      // Increment template use count
      await pool.query(
        'SELECT increment_template_use_count($1)',
        [template.id]
      );

      res.json({
        success: true,
        message: 'Template used successfully',
        clonedPageId: newClone.id,
        templateId: template.id,
        templateName: template.name,
        creditsConsumed: 1,
        creditsRemaining: consumeResult.creditsAfter,
        expiresAt: newClone.expires_at,
      });
    } catch (error) {
      console.error('Use template error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to use template',
        code: 'USE_ERROR',
      });
    }
  }
);

export default router;
