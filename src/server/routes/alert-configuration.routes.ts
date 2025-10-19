import express, { Request, Response, Router } from 'express';
import { z } from 'zod';
import { Pool } from 'pg';
import { AlertingService, initializeAlertingService } from '../services/alerting.service.js';
import { authenticateJWT } from '../middleware/auth.middleware.js';
import { AppLogger } from '../services/logger.service.js';

/**
 * Alert Configuration Routes
 * Manage security alert configurations
 */

const router: Router = express.Router();
let alertingService: AlertingService;

// Validation schemas
const createAlertSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  enabled: z.boolean().default(true),
  eventTypes: z.array(z.string()).min(1),
  severityLevels: z.array(z.enum(['low', 'medium', 'high', 'critical'])).min(1),
  thresholdCount: z.number().int().min(1),
  thresholdWindowMinutes: z.number().int().min(1),
  emailEnabled: z.boolean().default(false),
  emailRecipients: z.array(z.string().email()).optional(),
  slackEnabled: z.boolean().default(false),
  slackWebhookUrl: z.string().url().optional(),
  slackChannel: z.string().optional(),
  cooldownMinutes: z.number().int().min(0),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  includeDetails: z.boolean().default(true),
  aggregateSimilar: z.boolean().default(true),
});

const updateAlertSchema = createAlertSchema.partial();

const alertHistoryFilterSchema = z.object({
  alertConfigId: z.string().uuid().optional(),
  severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
});

const testAlertSchema = z.object({
  alertConfigId: z.string().uuid(),
  testMessage: z.string().optional(),
});

/**
 * Initialize alert routes with database pool
 */
export function initializeAlertRoutes(pool: Pool): void {
  alertingService = initializeAlertingService(pool);
}

/**
 * GET /api/alerts/configurations
 * Get all alert configurations
 */
router.get('/configurations', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const configurations = await alertingService.getAllAlertConfigurations();

    res.json({
      success: true,
      data: configurations,
      count: configurations.length,
    });
  } catch (error) {
    AppLogger.error('Error fetching alert configurations', error as Error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch alert configurations',
    });
  }
});

/**
 * GET /api/alerts/configurations/:id
 * Get specific alert configuration
 */
router.get('/configurations/:id', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const configuration = await alertingService.getAlertConfiguration(id);

    if (!configuration) {
      return res.status(404).json({
        success: false,
        error: 'Alert configuration not found',
      });
    }

    res.json({
      success: true,
      data: configuration,
    });
  } catch (error) {
    AppLogger.error('Error fetching alert configuration', error as Error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch alert configuration',
    });
  }
});

/**
 * POST /api/alerts/configurations
 * Create new alert configuration
 */
router.post('/configurations', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const validatedData = createAlertSchema.parse(req.body);
    const userId = (req as any).user?.userId;

    // Validate that at least one channel is enabled
    if (!validatedData.emailEnabled && !validatedData.slackEnabled) {
      return res.status(400).json({
        success: false,
        error: 'At least one alert channel (email or Slack) must be enabled',
      });
    }

    // Validate email recipients if email is enabled
    if (validatedData.emailEnabled && (!validatedData.emailRecipients || validatedData.emailRecipients.length === 0)) {
      return res.status(400).json({
        success: false,
        error: 'Email recipients are required when email alerts are enabled',
      });
    }

    // Validate Slack webhook if Slack is enabled
    if (validatedData.slackEnabled && !validatedData.slackWebhookUrl) {
      return res.status(400).json({
        success: false,
        error: 'Slack webhook URL is required when Slack alerts are enabled',
      });
    }

    const configuration = await alertingService.createAlertConfiguration({
      ...validatedData,
      createdBy: userId,
    });

    AppLogger.info('Alert configuration created', {
      configId: configuration.id,
      name: configuration.name,
      createdBy: userId,
    });

    res.status(201).json({
      success: true,
      data: configuration,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.errors,
      });
    }

    AppLogger.error('Error creating alert configuration', error as Error);
    res.status(500).json({
      success: false,
      error: 'Failed to create alert configuration',
    });
  }
});

/**
 * PUT /api/alerts/configurations/:id
 * Update alert configuration
 */
router.put('/configurations/:id', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const validatedData = updateAlertSchema.parse(req.body);

    // Validate channel requirements if being updated
    if (validatedData.emailEnabled !== undefined || validatedData.slackEnabled !== undefined) {
      const existing = await alertingService.getAlertConfiguration(id);
      if (!existing) {
        return res.status(404).json({
          success: false,
          error: 'Alert configuration not found',
        });
      }

      const emailEnabled = validatedData.emailEnabled ?? existing.emailEnabled;
      const slackEnabled = validatedData.slackEnabled ?? existing.slackEnabled;

      if (!emailEnabled && !slackEnabled) {
        return res.status(400).json({
          success: false,
          error: 'At least one alert channel must be enabled',
        });
      }
    }

    const configuration = await alertingService.updateAlertConfiguration(id, validatedData);

    if (!configuration) {
      return res.status(404).json({
        success: false,
        error: 'Alert configuration not found',
      });
    }

    AppLogger.info('Alert configuration updated', {
      configId: configuration.id,
      name: configuration.name,
    });

    res.json({
      success: true,
      data: configuration,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.errors,
      });
    }

    AppLogger.error('Error updating alert configuration', error as Error);
    res.status(500).json({
      success: false,
      error: 'Failed to update alert configuration',
    });
  }
});

/**
 * DELETE /api/alerts/configurations/:id
 * Delete alert configuration
 */
router.delete('/configurations/:id', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const deleted = await alertingService.deleteAlertConfiguration(id);

    if (!deleted) {
      return res.status(404).json({
        success: false,
        error: 'Alert configuration not found',
      });
    }

    AppLogger.info('Alert configuration deleted', { configId: id });

    res.json({
      success: true,
      message: 'Alert configuration deleted successfully',
    });
  } catch (error) {
    AppLogger.error('Error deleting alert configuration', error as Error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete alert configuration',
    });
  }
});

/**
 * POST /api/alerts/configurations/:id/toggle
 * Toggle alert configuration enabled/disabled
 */
router.post('/configurations/:id/toggle', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const existing = await alertingService.getAlertConfiguration(id);
    if (!existing) {
      return res.status(404).json({
        success: false,
        error: 'Alert configuration not found',
      });
    }

    const configuration = await alertingService.updateAlertConfiguration(id, {
      enabled: !existing.enabled,
    });

    AppLogger.info('Alert configuration toggled', {
      configId: id,
      enabled: configuration?.enabled,
    });

    res.json({
      success: true,
      data: configuration,
    });
  } catch (error) {
    AppLogger.error('Error toggling alert configuration', error as Error);
    res.status(500).json({
      success: false,
      error: 'Failed to toggle alert configuration',
    });
  }
});

/**
 * GET /api/alerts/history
 * Get alert history with filters
 */
router.get('/history', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const filters = alertHistoryFilterSchema.parse(req.query);

    const { history, total } = await alertingService.getAlertHistory(
      filters.limit,
      filters.offset,
      {
        alertConfigId: filters.alertConfigId,
        severity: filters.severity,
        startDate: filters.startDate ? new Date(filters.startDate) : undefined,
        endDate: filters.endDate ? new Date(filters.endDate) : undefined,
      }
    );

    res.json({
      success: true,
      data: history,
      pagination: {
        total,
        limit: filters.limit,
        offset: filters.offset,
        pages: Math.ceil(total / filters.limit),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.errors,
      });
    }

    AppLogger.error('Error fetching alert history', error as Error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch alert history',
    });
  }
});

/**
 * GET /api/alerts/history/:id
 * Get specific alert history entry
 */
router.get('/history/:id', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { history } = await alertingService.getAlertHistory(1, 0);
    const entry = history.find((h) => h.id === id);

    if (!entry) {
      return res.status(404).json({
        success: false,
        error: 'Alert history entry not found',
      });
    }

    res.json({
      success: true,
      data: entry,
    });
  } catch (error) {
    AppLogger.error('Error fetching alert history entry', error as Error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch alert history entry',
    });
  }
});

/**
 * GET /api/alerts/statistics
 * Get alert statistics
 */
router.get('/statistics', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const days = parseInt(req.query.days as string) || 30;

    if (days < 1 || days > 365) {
      return res.status(400).json({
        success: false,
        error: 'Days must be between 1 and 365',
      });
    }

    const statistics = await alertingService.getAlertStatistics(days);

    res.json({
      success: true,
      data: statistics,
      period: `${days} days`,
    });
  } catch (error) {
    AppLogger.error('Error fetching alert statistics', error as Error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch alert statistics',
    });
  }
});

/**
 * POST /api/alerts/test
 * Test alert configuration by sending a test alert
 */
router.post('/test', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const { alertConfigId, testMessage } = testAlertSchema.parse(req.body);

    const configuration = await alertingService.getAlertConfiguration(alertConfigId);
    if (!configuration) {
      return res.status(404).json({
        success: false,
        error: 'Alert configuration not found',
      });
    }

    // Create a test security event
    const testEvent = {
      id: 'test-' + Date.now(),
      eventType: 'test_alert',
      severity: 'medium' as const,
      message: testMessage || 'This is a test alert from Website Cloner Pro',
      details: { test: true },
      timestamp: new Date(),
    };

    // Trigger the alert
    const historyId = await alertingService.triggerAlert(configuration, [testEvent]);

    AppLogger.info('Test alert triggered', {
      configId: alertConfigId,
      historyId,
    });

    res.json({
      success: true,
      message: 'Test alert sent successfully',
      historyId,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        success: false,
        error: 'Validation error',
        details: error.errors,
      });
    }

    AppLogger.error('Error sending test alert', error as Error);
    res.status(500).json({
      success: false,
      error: 'Failed to send test alert',
    });
  }
});

/**
 * POST /api/alerts/cleanup
 * Cleanup expired alert suppressions
 */
router.post('/cleanup', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const deletedCount = await alertingService.cleanupExpiredSuppressions();

    AppLogger.info('Alert suppressions cleaned up', { deletedCount });

    res.json({
      success: true,
      message: 'Expired suppressions cleaned up',
      deletedCount,
    });
  } catch (error) {
    AppLogger.error('Error cleaning up alert suppressions', error as Error);
    res.status(500).json({
      success: false,
      error: 'Failed to cleanup alert suppressions',
    });
  }
});

/**
 * GET /api/alerts/event-types
 * Get available event types for alert configuration
 */
router.get('/event-types', authenticateJWT, async (req: Request, res: Response) => {
  try {
    const eventTypes = [
      // Authentication
      { type: 'login_success', category: 'authentication', description: 'Successful login' },
      { type: 'login_failed', category: 'authentication', description: 'Failed login attempt' },
      { type: 'logout', category: 'authentication', description: 'User logout' },
      { type: 'session_expired', category: 'authentication', description: 'Session expiration' },
      { type: 'session_hijack', category: 'authentication', description: 'Session hijacking attempt' },

      // API Keys
      { type: 'api_key_created', category: 'api_keys', description: 'New API key created' },
      { type: 'api_key_used', category: 'api_keys', description: 'API key used successfully' },
      { type: 'api_key_denied', category: 'api_keys', description: 'API key authentication failed' },
      { type: 'api_key_expired', category: 'api_keys', description: 'API key expired' },
      { type: 'api_key_revoked', category: 'api_keys', description: 'API key revoked' },

      // Security
      { type: 'brute_force', category: 'security', description: 'Brute force attack detected' },
      { type: 'sql_injection', category: 'security', description: 'SQL injection attempt' },
      { type: 'xss_attempt', category: 'security', description: 'XSS attack attempt' },
      { type: 'csrf_token_invalid', category: 'security', description: 'Invalid CSRF token' },
      { type: 'rate_limit_exceeded', category: 'security', description: 'Rate limit exceeded' },
      { type: 'ip_blacklisted', category: 'security', description: 'IP address blacklisted' },

      // Content Security
      { type: 'csp_violation', category: 'content', description: 'Content Security Policy violation' },
      { type: 'archive_bomb', category: 'content', description: 'Archive decompression bomb detected' },
      { type: 'malicious_file', category: 'content', description: 'Malicious file upload detected' },
      { type: 'exif_strip', category: 'content', description: 'EXIF data stripped from image' },
    ];

    res.json({
      success: true,
      data: eventTypes,
    });
  } catch (error) {
    AppLogger.error('Error fetching event types', error as Error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch event types',
    });
  }
});

export default router;
