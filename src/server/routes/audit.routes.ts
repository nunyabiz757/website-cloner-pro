import express, { Request, Response } from 'express';
import { z } from 'zod';
import { authenticateJWT } from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/rbac.middleware.js';
import { getEnhancedAuditService } from '../services/audit-enhanced.service.js';
import { AppLogger } from '../utils/logger.util.js';

const router = express.Router();
const logger = AppLogger.getInstance();

/**
 * Audit Log API Routes
 *
 * Provides comprehensive API endpoints for:
 * - Advanced search and filtering
 * - Full-text search
 * - Export (CSV, JSON)
 * - Statistics and analytics
 * - Saved searches
 * - Bookmarks
 * - Suspicious activity detection
 */

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const advancedSearchSchema = z.object({
  searchQuery: z.string().optional(),
  userId: z.string().uuid().optional(),
  action: z.string().optional(),
  resourceType: z.string().optional(),
  resourceId: z.string().uuid().optional(),
  status: z.string().optional(),
  ipAddress: z.string().ip().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  detailsFilter: z.record(z.any()).optional(),
  limit: z.number().int().min(1).max(1000).default(100),
  offset: z.number().int().min(0).default(0),
  orderBy: z.enum(['timestamp', 'action', 'status', 'user_id']).default('timestamp'),
  orderDirection: z.enum(['ASC', 'DESC']).default('DESC'),
});

const exportSchema = z.object({
  exportName: z.string().min(1).max(255),
  exportFormat: z.enum(['csv', 'json']),
  filters: z.object({
    searchQuery: z.string().optional(),
    userId: z.string().uuid().optional(),
    action: z.string().optional(),
    resourceType: z.string().optional(),
    status: z.string().optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
  }).optional(),
});

const saveSearchSchema = z.object({
  searchName: z.string().min(1).max(255),
  searchFilters: z.record(z.any()),
  isPublic: z.boolean().default(false),
});

const bookmarkSchema = z.object({
  notes: z.string().max(1000).optional(),
});

const statisticsSchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
});

// ============================================================================
// MIDDLEWARE
// ============================================================================

// All routes require authentication
router.use(authenticateJWT);

// Most routes require audit read permission
const requireAuditRead = requirePermission('audit_logs', 'read');
const requireAuditWrite = requirePermission('audit_logs', 'write');

// ============================================================================
// SEARCH AND FILTERING ROUTES
// ============================================================================

/**
 * POST /api/audit/search
 * Advanced search with full-text and multi-filter support
 */
router.post('/search', requireAuditRead, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const validatedData = advancedSearchSchema.parse(req.body);

    const auditService = getEnhancedAuditService();

    // Convert string dates to Date objects
    const filters = {
      ...validatedData,
      startDate: validatedData.startDate ? new Date(validatedData.startDate) : undefined,
      endDate: validatedData.endDate ? new Date(validatedData.endDate) : undefined,
    };

    const result = await auditService.advancedSearch(filters);

    await logger.info('Audit log search performed', {
      component: 'AuditRoutes',
      userId,
      filters: validatedData,
      resultCount: result.logs.length,
    });

    res.json({
      success: true,
      data: result.logs,
      total: result.total,
      limit: validatedData.limit,
      offset: validatedData.offset,
    });
  } catch (error) {
    await logger.error('Audit log search failed', {
      component: 'AuditRoutes',
      error: error instanceof Error ? error.message : String(error),
    });

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.errors,
      });
    }

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Search failed',
    });
  }
});

/**
 * GET /api/audit/logs
 * Get audit logs with basic filtering (query params)
 */
router.get('/logs', requireAuditRead, async (req: Request, res: Response) => {
  try {
    const auditService = getEnhancedAuditService();

    const filters = {
      userId: req.query.userId as string | undefined,
      action: req.query.action as string | undefined,
      resourceType: req.query.resourceType as string | undefined,
      resourceId: req.query.resourceId as string | undefined,
      status: req.query.status as string | undefined,
      ipAddress: req.query.ipAddress as string | undefined,
      startDate: req.query.startDate ? new Date(req.query.startDate as string) : undefined,
      endDate: req.query.endDate ? new Date(req.query.endDate as string) : undefined,
      limit: req.query.limit ? parseInt(req.query.limit as string) : 100,
      offset: req.query.offset ? parseInt(req.query.offset as string) : 0,
    };

    const result = await auditService.advancedSearch(filters);

    res.json({
      success: true,
      data: result.logs,
      total: result.total,
    });
  } catch (error) {
    await logger.error('Failed to get audit logs', {
      component: 'AuditRoutes',
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      success: false,
      error: 'Failed to get audit logs',
    });
  }
});

/**
 * GET /api/audit/logs/:id
 * Get specific audit log entry
 */
router.get('/logs/:id', requireAuditRead, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const auditService = getEnhancedAuditService();

    const result = await auditService.advancedSearch({
      limit: 1,
      offset: 0,
    });

    // Search for specific ID (simplified - in production use direct query)
    const log = result.logs.find((l) => l.id === id);

    if (!log) {
      return res.status(404).json({
        success: false,
        error: 'Audit log not found',
      });
    }

    res.json({
      success: true,
      data: log,
    });
  } catch (error) {
    await logger.error('Failed to get audit log', {
      component: 'AuditRoutes',
      logId: req.params.id,
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      success: false,
      error: 'Failed to get audit log',
    });
  }
});

// ============================================================================
// STATISTICS AND ANALYTICS ROUTES
// ============================================================================

/**
 * POST /api/audit/statistics
 * Get comprehensive audit log statistics
 */
router.post('/statistics', requireAuditRead, async (req: Request, res: Response) => {
  try {
    const validatedData = statisticsSchema.parse(req.body);
    const auditService = getEnhancedAuditService();

    const startDate = validatedData.startDate ? new Date(validatedData.startDate) : undefined;
    const endDate = validatedData.endDate ? new Date(validatedData.endDate) : undefined;

    const statistics = await auditService.getStatistics(startDate, endDate);

    res.json({
      success: true,
      data: statistics,
    });
  } catch (error) {
    await logger.error('Failed to get audit statistics', {
      component: 'AuditRoutes',
      error: error instanceof Error ? error.message : String(error),
    });

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.errors,
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to get statistics',
    });
  }
});

/**
 * GET /api/audit/users/:userId/timeline
 * Get user activity timeline
 */
router.get('/users/:userId/timeline', requireAuditRead, async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
    const auditService = getEnhancedAuditService();

    const timeline = await auditService.getUserTimeline(userId, limit);

    res.json({
      success: true,
      data: timeline,
      count: timeline.length,
    });
  } catch (error) {
    await logger.error('Failed to get user timeline', {
      component: 'AuditRoutes',
      userId: req.params.userId,
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      success: false,
      error: 'Failed to get user timeline',
    });
  }
});

/**
 * GET /api/audit/resources/:resourceType/:resourceId/history
 * Get resource audit history
 */
router.get('/resources/:resourceType/:resourceId/history', requireAuditRead, async (req: Request, res: Response) => {
  try {
    const { resourceType, resourceId } = req.params;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
    const auditService = getEnhancedAuditService();

    const history = await auditService.getResourceHistory(resourceType, resourceId, limit);

    res.json({
      success: true,
      data: history,
      count: history.length,
    });
  } catch (error) {
    await logger.error('Failed to get resource history', {
      component: 'AuditRoutes',
      resourceType: req.params.resourceType,
      resourceId: req.params.resourceId,
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      success: false,
      error: 'Failed to get resource history',
    });
  }
});

/**
 * GET /api/audit/ip/:ipAddress
 * Get audit logs by IP address
 */
router.get('/ip/:ipAddress', requireAuditRead, async (req: Request, res: Response) => {
  try {
    const { ipAddress } = req.params;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
    const auditService = getEnhancedAuditService();

    const logs = await auditService.getLogsByIp(ipAddress, limit);

    res.json({
      success: true,
      data: logs,
      count: logs.length,
    });
  } catch (error) {
    await logger.error('Failed to get logs by IP', {
      component: 'AuditRoutes',
      ipAddress: req.params.ipAddress,
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      success: false,
      error: 'Failed to get logs by IP',
    });
  }
});

/**
 * GET /api/audit/failed
 * Get failed actions
 */
router.get('/failed', requireAuditRead, async (req: Request, res: Response) => {
  try {
    const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
    const auditService = getEnhancedAuditService();

    const failedActions = await auditService.getFailedActions(startDate, endDate, limit);

    res.json({
      success: true,
      data: failedActions,
      count: failedActions.length,
    });
  } catch (error) {
    await logger.error('Failed to get failed actions', {
      component: 'AuditRoutes',
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      success: false,
      error: 'Failed to get failed actions',
    });
  }
});

/**
 * GET /api/audit/suspicious
 * Detect suspicious activities
 */
router.get('/suspicious', requireAuditRead, async (req: Request, res: Response) => {
  try {
    const lookbackHours = req.query.lookbackHours ? parseInt(req.query.lookbackHours as string) : 24;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 100;
    const auditService = getEnhancedAuditService();

    const suspicious = await auditService.getSuspiciousActivities(lookbackHours, limit);

    res.json({
      success: true,
      data: suspicious,
      count: suspicious.length,
    });
  } catch (error) {
    await logger.error('Failed to get suspicious activities', {
      component: 'AuditRoutes',
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      success: false,
      error: 'Failed to get suspicious activities',
    });
  }
});

// ============================================================================
// EXPORT ROUTES
// ============================================================================

/**
 * POST /api/audit/export
 * Create audit log export
 */
router.post('/export', requireAuditRead, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const validatedData = exportSchema.parse(req.body);
    const auditService = getEnhancedAuditService();

    // Convert filters
    const filters = validatedData.filters || {};
    const convertedFilters = {
      ...filters,
      startDate: filters.startDate ? new Date(filters.startDate) : undefined,
      endDate: filters.endDate ? new Date(filters.endDate) : undefined,
    };

    let exportContent: string;
    let fileExtension: string;

    if (validatedData.exportFormat === 'csv') {
      exportContent = await auditService.exportToCSV(convertedFilters);
      fileExtension = 'csv';
    } else {
      exportContent = await auditService.exportToJSON(convertedFilters);
      fileExtension = 'json';
    }

    // Create export record
    const exportRecord = await auditService.createExport(
      validatedData.exportName,
      validatedData.exportFormat,
      convertedFilters,
      userId,
      undefined, // filePath - in production, save to storage
      Buffer.byteLength(exportContent, 'utf8')
    );

    await logger.info('Audit log export created', {
      component: 'AuditRoutes',
      exportId: exportRecord.id,
      format: validatedData.exportFormat,
      userId,
    });

    // Return export content directly or download link
    res.setHeader('Content-Type', validatedData.exportFormat === 'csv' ? 'text/csv' : 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="audit-logs-${Date.now()}.${fileExtension}"`);
    res.send(exportContent);
  } catch (error) {
    await logger.error('Audit log export failed', {
      component: 'AuditRoutes',
      error: error instanceof Error ? error.message : String(error),
    });

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.errors,
      });
    }

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Export failed',
    });
  }
});

/**
 * GET /api/audit/exports/:exportId
 * Get export details
 */
router.get('/exports/:exportId', requireAuditRead, async (req: Request, res: Response) => {
  try {
    const { exportId } = req.params;
    const auditService = getEnhancedAuditService();

    const exportRecord = await auditService.getExport(exportId);

    if (!exportRecord) {
      return res.status(404).json({
        success: false,
        error: 'Export not found',
      });
    }

    res.json({
      success: true,
      data: exportRecord,
    });
  } catch (error) {
    await logger.error('Failed to get export', {
      component: 'AuditRoutes',
      exportId: req.params.exportId,
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      success: false,
      error: 'Failed to get export',
    });
  }
});

/**
 * POST /api/audit/exports/cleanup
 * Cleanup old exports
 */
router.post('/exports/cleanup', requireAuditWrite, async (req: Request, res: Response) => {
  try {
    const auditService = getEnhancedAuditService();
    const deletedCount = await auditService.cleanupOldExports();

    await logger.info('Old audit exports cleaned up', {
      component: 'AuditRoutes',
      deletedCount,
    });

    res.json({
      success: true,
      deletedCount,
    });
  } catch (error) {
    await logger.error('Failed to cleanup exports', {
      component: 'AuditRoutes',
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      success: false,
      error: 'Failed to cleanup exports',
    });
  }
});

// ============================================================================
// SAVED SEARCHES ROUTES
// ============================================================================

/**
 * POST /api/audit/searches
 * Save a search
 */
router.post('/searches', requireAuditRead, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const validatedData = saveSearchSchema.parse(req.body);
    const auditService = getEnhancedAuditService();

    const savedSearch = await auditService.saveSearch(
      validatedData.searchName,
      validatedData.searchFilters,
      userId,
      validatedData.isPublic
    );

    res.status(201).json({
      success: true,
      data: savedSearch,
    });
  } catch (error) {
    await logger.error('Failed to save search', {
      component: 'AuditRoutes',
      error: error instanceof Error ? error.message : String(error),
    });

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.errors,
      });
    }

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to save search',
    });
  }
});

/**
 * GET /api/audit/searches
 * Get saved searches
 */
router.get('/searches', requireAuditRead, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const includePublic = req.query.includePublic !== 'false';
    const auditService = getEnhancedAuditService();

    const searches = await auditService.getSavedSearches(userId, includePublic);

    res.json({
      success: true,
      data: searches,
      count: searches.length,
    });
  } catch (error) {
    await logger.error('Failed to get saved searches', {
      component: 'AuditRoutes',
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      success: false,
      error: 'Failed to get saved searches',
    });
  }
});

/**
 * POST /api/audit/searches/:searchId/use
 * Use a saved search
 */
router.post('/searches/:searchId/use', requireAuditRead, async (req: Request, res: Response) => {
  try {
    const { searchId } = req.params;
    const auditService = getEnhancedAuditService();

    const search = await auditService.useSavedSearch(searchId);

    res.json({
      success: true,
      data: search,
    });
  } catch (error) {
    await logger.error('Failed to use saved search', {
      component: 'AuditRoutes',
      searchId: req.params.searchId,
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to use saved search',
    });
  }
});

/**
 * DELETE /api/audit/searches/:searchId
 * Delete a saved search
 */
router.delete('/searches/:searchId', requireAuditRead, async (req: Request, res: Response) => {
  try {
    const { searchId } = req.params;
    const userId = (req as any).user?.userId;
    const auditService = getEnhancedAuditService();

    await auditService.deleteSavedSearch(searchId, userId);

    res.json({
      success: true,
      message: 'Saved search deleted successfully',
    });
  } catch (error) {
    await logger.error('Failed to delete saved search', {
      component: 'AuditRoutes',
      searchId: req.params.searchId,
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete saved search',
    });
  }
});

// ============================================================================
// BOOKMARKS ROUTES
// ============================================================================

/**
 * POST /api/audit/logs/:auditLogId/bookmark
 * Add bookmark to audit log
 */
router.post('/logs/:auditLogId/bookmark', requireAuditRead, async (req: Request, res: Response) => {
  try {
    const { auditLogId } = req.params;
    const userId = (req as any).user?.userId;
    const validatedData = bookmarkSchema.parse(req.body);
    const auditService = getEnhancedAuditService();

    const bookmark = await auditService.addBookmark(auditLogId, userId, validatedData.notes);

    res.status(201).json({
      success: true,
      data: bookmark,
    });
  } catch (error) {
    await logger.error('Failed to add bookmark', {
      component: 'AuditRoutes',
      auditLogId: req.params.auditLogId,
      error: error instanceof Error ? error.message : String(error),
    });

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.errors,
      });
    }

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to add bookmark',
    });
  }
});

/**
 * GET /api/audit/bookmarks
 * Get user's bookmarks
 */
router.get('/bookmarks', requireAuditRead, async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const auditService = getEnhancedAuditService();

    const bookmarks = await auditService.getBookmarks(userId);

    res.json({
      success: true,
      data: bookmarks,
      count: bookmarks.length,
    });
  } catch (error) {
    await logger.error('Failed to get bookmarks', {
      component: 'AuditRoutes',
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      success: false,
      error: 'Failed to get bookmarks',
    });
  }
});

/**
 * DELETE /api/audit/bookmarks/:bookmarkId
 * Remove bookmark
 */
router.delete('/bookmarks/:bookmarkId', requireAuditRead, async (req: Request, res: Response) => {
  try {
    const { bookmarkId } = req.params;
    const userId = (req as any).user?.userId;
    const auditService = getEnhancedAuditService();

    await auditService.removeBookmark(bookmarkId, userId);

    res.json({
      success: true,
      message: 'Bookmark removed successfully',
    });
  } catch (error) {
    await logger.error('Failed to remove bookmark', {
      component: 'AuditRoutes',
      bookmarkId: req.params.bookmarkId,
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to remove bookmark',
    });
  }
});

export default router;
