import express, { Request, Response } from 'express';
import { z } from 'zod';
import { authenticateJWT } from '../middleware/auth.middleware.js';
import { requirePermission } from '../middleware/rbac.middleware.js';
import { getKeyRotationJobService } from '../jobs/key-rotation.job.js';
import { AppLogger } from '../utils/logger.util.js';
import { Pool } from 'pg';

const router = express.Router();
const logger = AppLogger.getInstance();

/**
 * Key Rotation Management Routes
 *
 * Provides API endpoints for:
 * - Manual key rotation initiation
 * - Rotation schedule management
 * - Rotation history and progress
 * - Key version management
 * - Usage metrics
 */

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const initiateRotationSchema = z.object({
  rotationType: z.enum(['manual', 'emergency']),
  reason: z.string().min(1).max(500).optional(),
});

const createScheduleSchema = z.object({
  scheduleName: z.string().min(1).max(100),
  rotationIntervalDays: z.number().int().min(1).max(3650), // Max 10 years
  autoRotate: z.boolean().default(false),
  notifyBeforeDays: z.number().int().min(0).max(90).default(7),
  notificationEmails: z.array(z.string().email()).optional(),
});

const updateScheduleSchema = z.object({
  rotationIntervalDays: z.number().int().min(1).max(3650).optional(),
  enabled: z.boolean().optional(),
  autoRotate: z.boolean().optional(),
  notifyBeforeDays: z.number().int().min(0).max(90).optional(),
  notificationEmails: z.array(z.string().email()).optional(),
});

const activateKeySchema = z.object({
  keyVersion: z.number().int().min(1),
  reason: z.string().min(1).max(500),
});

// ============================================================================
// MIDDLEWARE
// ============================================================================

// All routes require authentication and admin/security permissions
router.use(authenticateJWT);
router.use(requirePermission('key_rotation', 'manage'));

// ============================================================================
// ROTATION MANAGEMENT ROUTES
// ============================================================================

/**
 * POST /api/key-rotation/initiate
 * Initiate a manual or emergency key rotation
 */
router.post('/initiate', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const validatedData = initiateRotationSchema.parse(req.body);

    const rotationService = getKeyRotationJobService();

    // Check if rotation already in progress
    if (rotationService.isRotationInProgress()) {
      return res.status(409).json({
        success: false,
        error: 'A key rotation is already in progress',
      });
    }

    // Initiate rotation
    const rotationId = await rotationService.initiateRotation(
      validatedData.rotationType,
      userId
    );

    await logger.info('Key rotation initiated via API', {
      component: 'KeyRotationRoutes',
      rotationId,
      rotationType: validatedData.rotationType,
      userId,
    });

    res.status(202).json({
      success: true,
      rotationId,
      message: `${validatedData.rotationType} key rotation initiated successfully`,
    });
  } catch (error) {
    await logger.error('Failed to initiate key rotation', {
      component: 'KeyRotationRoutes',
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
      error: error instanceof Error ? error.message : 'Failed to initiate key rotation',
    });
  }
});

/**
 * GET /api/key-rotation/current
 * Get current rotation status
 */
router.get('/current', async (req: Request, res: Response) => {
  try {
    const rotationService = getKeyRotationJobService();
    const currentRotationId = rotationService.getCurrentRotation();

    if (!currentRotationId) {
      return res.json({
        success: true,
        inProgress: false,
        rotation: null,
      });
    }

    const progress = await rotationService.getRotationProgress(currentRotationId);

    res.json({
      success: true,
      inProgress: true,
      rotation: {
        rotationId: currentRotationId,
        ...progress,
      },
    });
  } catch (error) {
    await logger.error('Failed to get current rotation', {
      component: 'KeyRotationRoutes',
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      success: false,
      error: 'Failed to get current rotation status',
    });
  }
});

/**
 * GET /api/key-rotation/progress/:rotationId
 * Get progress for a specific rotation
 */
router.get('/progress/:rotationId', async (req: Request, res: Response) => {
  try {
    const { rotationId } = req.params;
    const rotationService = getKeyRotationJobService();

    const progress = await rotationService.getRotationProgress(rotationId);

    if (!progress) {
      return res.status(404).json({
        success: false,
        error: 'Rotation not found',
      });
    }

    res.json({
      success: true,
      data: progress,
    });
  } catch (error) {
    await logger.error('Failed to get rotation progress', {
      component: 'KeyRotationRoutes',
      rotationId: req.params.rotationId,
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      success: false,
      error: 'Failed to get rotation progress',
    });
  }
});

/**
 * GET /api/key-rotation/history
 * Get rotation history
 */
router.get('/history', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const rotationService = getKeyRotationJobService();

    const history = await rotationService.getRotationHistory(limit);

    res.json({
      success: true,
      data: history,
      count: history.length,
    });
  } catch (error) {
    await logger.error('Failed to get rotation history', {
      component: 'KeyRotationRoutes',
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      success: false,
      error: 'Failed to get rotation history',
    });
  }
});

// ============================================================================
// SCHEDULE MANAGEMENT ROUTES
// ============================================================================

/**
 * GET /api/key-rotation/schedules
 * Get all rotation schedules
 */
router.get('/schedules', async (req: Request, res: Response) => {
  try {
    const pool: Pool = (req as any).pool;

    const result = await pool.query(`
      SELECT
        id,
        schedule_name,
        rotation_interval_days,
        enabled,
        last_rotation_at,
        next_rotation_at,
        auto_rotate,
        notify_before_days,
        notification_emails,
        created_at,
        updated_at
      FROM key_rotation_schedule
      ORDER BY schedule_name ASC
    `);

    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    await logger.error('Failed to get rotation schedules', {
      component: 'KeyRotationRoutes',
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      success: false,
      error: 'Failed to get rotation schedules',
    });
  }
});

/**
 * POST /api/key-rotation/schedules
 * Create a new rotation schedule
 */
router.post('/schedules', async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.userId;
    const pool: Pool = (req as any).pool;
    const validatedData = createScheduleSchema.parse(req.body);

    // Calculate next rotation date
    const nextRotationAt = new Date();
    nextRotationAt.setDate(nextRotationAt.getDate() + validatedData.rotationIntervalDays);

    const result = await pool.query(
      `INSERT INTO key_rotation_schedule (
        schedule_name,
        rotation_interval_days,
        auto_rotate,
        notify_before_days,
        notification_emails,
        next_rotation_at,
        created_by,
        updated_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *`,
      [
        validatedData.scheduleName,
        validatedData.rotationIntervalDays,
        validatedData.autoRotate,
        validatedData.notifyBeforeDays,
        validatedData.notificationEmails || [],
        nextRotationAt,
        userId,
        userId,
      ]
    );

    await logger.info('Rotation schedule created', {
      component: 'KeyRotationRoutes',
      scheduleId: result.rows[0].id,
      scheduleName: validatedData.scheduleName,
      userId,
    });

    res.status(201).json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    await logger.error('Failed to create rotation schedule', {
      component: 'KeyRotationRoutes',
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
      error: error instanceof Error ? error.message : 'Failed to create rotation schedule',
    });
  }
});

/**
 * GET /api/key-rotation/schedules/:id
 * Get a specific rotation schedule
 */
router.get('/schedules/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const pool: Pool = (req as any).pool;

    const result = await pool.query(
      'SELECT * FROM key_rotation_schedule WHERE id = $1',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Schedule not found',
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    await logger.error('Failed to get rotation schedule', {
      component: 'KeyRotationRoutes',
      scheduleId: req.params.id,
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      success: false,
      error: 'Failed to get rotation schedule',
    });
  }
});

/**
 * PUT /api/key-rotation/schedules/:id
 * Update a rotation schedule
 */
router.put('/schedules/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userId = (req as any).user?.userId;
    const pool: Pool = (req as any).pool;
    const validatedData = updateScheduleSchema.parse(req.body);

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    if (validatedData.rotationIntervalDays !== undefined) {
      updates.push(`rotation_interval_days = $${paramIndex++}`);
      values.push(validatedData.rotationIntervalDays);
    }

    if (validatedData.enabled !== undefined) {
      updates.push(`enabled = $${paramIndex++}`);
      values.push(validatedData.enabled);
    }

    if (validatedData.autoRotate !== undefined) {
      updates.push(`auto_rotate = $${paramIndex++}`);
      values.push(validatedData.autoRotate);
    }

    if (validatedData.notifyBeforeDays !== undefined) {
      updates.push(`notify_before_days = $${paramIndex++}`);
      values.push(validatedData.notifyBeforeDays);
    }

    if (validatedData.notificationEmails !== undefined) {
      updates.push(`notification_emails = $${paramIndex++}`);
      values.push(validatedData.notificationEmails);
    }

    updates.push(`updated_by = $${paramIndex++}`);
    values.push(userId);

    values.push(id);

    const result = await pool.query(
      `UPDATE key_rotation_schedule
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING *`,
      values
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Schedule not found',
      });
    }

    // Recalculate next rotation date if interval changed
    if (validatedData.rotationIntervalDays !== undefined) {
      await pool.query('SELECT update_next_rotation_date($1)', [id]);
    }

    await logger.info('Rotation schedule updated', {
      component: 'KeyRotationRoutes',
      scheduleId: id,
      userId,
    });

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    await logger.error('Failed to update rotation schedule', {
      component: 'KeyRotationRoutes',
      scheduleId: req.params.id,
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
      error: 'Failed to update rotation schedule',
    });
  }
});

/**
 * DELETE /api/key-rotation/schedules/:id
 * Delete a rotation schedule
 */
router.delete('/schedules/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const pool: Pool = (req as any).pool;

    const result = await pool.query(
      'DELETE FROM key_rotation_schedule WHERE id = $1 RETURNING *',
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Schedule not found',
      });
    }

    await logger.info('Rotation schedule deleted', {
      component: 'KeyRotationRoutes',
      scheduleId: id,
    });

    res.json({
      success: true,
      message: 'Schedule deleted successfully',
    });
  } catch (error) {
    await logger.error('Failed to delete rotation schedule', {
      component: 'KeyRotationRoutes',
      scheduleId: req.params.id,
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      success: false,
      error: 'Failed to delete rotation schedule',
    });
  }
});

/**
 * GET /api/key-rotation/schedules/due
 * Get schedules that are due for rotation
 */
router.get('/schedules/due/list', async (req: Request, res: Response) => {
  try {
    const pool: Pool = (req as any).pool;

    const result = await pool.query('SELECT * FROM get_due_rotations()');

    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    await logger.error('Failed to get due rotations', {
      component: 'KeyRotationRoutes',
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      success: false,
      error: 'Failed to get due rotations',
    });
  }
});

/**
 * GET /api/key-rotation/schedules/upcoming
 * Get upcoming rotations
 */
router.get('/schedules/upcoming/list', async (req: Request, res: Response) => {
  try {
    const daysAhead = parseInt(req.query.days as string) || 30;
    const pool: Pool = (req as any).pool;

    const result = await pool.query('SELECT * FROM get_upcoming_rotations($1)', [daysAhead]);

    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    await logger.error('Failed to get upcoming rotations', {
      component: 'KeyRotationRoutes',
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      success: false,
      error: 'Failed to get upcoming rotations',
    });
  }
});

// ============================================================================
// KEY MANAGEMENT ROUTES
// ============================================================================

/**
 * GET /api/key-rotation/keys
 * Get all encryption keys
 */
router.get('/keys', async (req: Request, res: Response) => {
  try {
    const pool: Pool = (req as any).pool;

    const result = await pool.query(`
      SELECT
        id,
        key_version,
        algorithm,
        key_purpose,
        is_active,
        created_at,
        activated_at,
        deactivated_at
      FROM encryption_keys
      ORDER BY key_version DESC
    `);

    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    await logger.error('Failed to get encryption keys', {
      component: 'KeyRotationRoutes',
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      success: false,
      error: 'Failed to get encryption keys',
    });
  }
});

/**
 * GET /api/key-rotation/keys/active
 * Get the currently active key
 */
router.get('/keys/active', async (req: Request, res: Response) => {
  try {
    const pool: Pool = (req as any).pool;

    const result = await pool.query(`
      SELECT
        id,
        key_version,
        algorithm,
        key_purpose,
        is_active,
        created_at,
        activated_at
      FROM encryption_keys
      WHERE is_active = TRUE
      ORDER BY key_version DESC
      LIMIT 1
    `);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No active key found',
      });
    }

    res.json({
      success: true,
      data: result.rows[0],
    });
  } catch (error) {
    await logger.error('Failed to get active key', {
      component: 'KeyRotationRoutes',
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      success: false,
      error: 'Failed to get active key',
    });
  }
});

/**
 * POST /api/key-rotation/keys/:keyVersion/activate
 * Manually activate a specific key version
 */
router.post('/keys/:keyVersion/activate', async (req: Request, res: Response) => {
  try {
    const keyVersion = parseInt(req.params.keyVersion);
    const userId = (req as any).user?.userId;
    const pool: Pool = (req as any).pool;
    const validatedData = activateKeySchema.parse({ ...req.body, keyVersion });

    // Activate the key
    await pool.query('SELECT activate_key($1)', [keyVersion]);

    await logger.info('Encryption key manually activated', {
      component: 'KeyRotationRoutes',
      keyVersion,
      reason: validatedData.reason,
      userId,
    });

    res.json({
      success: true,
      message: `Key version ${keyVersion} activated successfully`,
      keyVersion,
    });
  } catch (error) {
    await logger.error('Failed to activate key', {
      component: 'KeyRotationRoutes',
      keyVersion: req.params.keyVersion,
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
      error: error instanceof Error ? error.message : 'Failed to activate key',
    });
  }
});

/**
 * GET /api/key-rotation/keys/usage
 * Get key usage metrics
 */
router.get('/keys/usage', async (req: Request, res: Response) => {
  try {
    const daysBack = parseInt(req.query.days as string) || 30;
    const pool: Pool = (req as any).pool;

    const result = await pool.query('SELECT * FROM get_key_usage_summary($1)', [daysBack]);

    res.json({
      success: true,
      data: result.rows,
      count: result.rows.length,
    });
  } catch (error) {
    await logger.error('Failed to get key usage metrics', {
      component: 'KeyRotationRoutes',
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      success: false,
      error: 'Failed to get key usage metrics',
    });
  }
});

// ============================================================================
// STATISTICS ROUTES
// ============================================================================

/**
 * GET /api/key-rotation/statistics
 * Get overall rotation statistics
 */
router.get('/statistics', async (req: Request, res: Response) => {
  try {
    const pool: Pool = (req as any).pool;

    const [rotationStats, keyStats] = await Promise.all([
      pool.query('SELECT * FROM rotation_status_summary'),
      pool.query(`
        SELECT
          COUNT(*) as total_keys,
          COUNT(CASE WHEN is_active THEN 1 END) as active_keys,
          COUNT(CASE WHEN key_purpose = 'archived' THEN 1 END) as archived_keys
        FROM encryption_keys
      `),
    ]);

    res.json({
      success: true,
      data: {
        rotationStatistics: rotationStats.rows,
        keyStatistics: keyStats.rows[0],
      },
    });
  } catch (error) {
    await logger.error('Failed to get rotation statistics', {
      component: 'KeyRotationRoutes',
      error: error instanceof Error ? error.message : String(error),
    });

    res.status(500).json({
      success: false,
      error: 'Failed to get rotation statistics',
    });
  }
});

export default router;
