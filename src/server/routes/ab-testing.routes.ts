import express, { Request, Response } from 'express';
import { body, param, query, validationResult } from 'express-validator';
import { getABTestingService } from '../services/ab-testing.service.js';

const abTestingService = getABTestingService();

const router = express.Router();

// =====================================================================================
// VALIDATION HELPERS
// =====================================================================================

const handleValidationErrors = (req: Request, res: Response): boolean => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    res.status(400).json({ errors: errors.array() });
    return true;
  }
  return false;
};

// =====================================================================================
// EXPERIMENT ROUTES
// =====================================================================================

/**
 * POST /api/ab-tests
 * Create A/B test experiment
 */
router.post(
  '/',
  [
    body('name').trim().isLength({ min: 1, max: 200 }).withMessage('Name must be 1-200 characters'),
    body('description').optional().trim().isLength({ max: 1000 }),
    body('template_id').optional().isUUID().withMessage('Invalid template ID'),
    body('goal_metric')
      .isIn(['downloads', 'uses', 'rating', 'conversion', 'engagement'])
      .withMessage('Invalid goal metric'),
    body('goal_target').optional().isFloat({ min: 0 }),
    body('confidence_level').optional().isFloat({ min: 50, max: 99.99 }),
    body('min_sample_size').optional().isInt({ min: 1 }),
    body('metadata').optional().isObject()
  ],
  async (req: Request, res: Response) => {
    if (handleValidationErrors(req, res)) return;

    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const experiment = await abTestingService.createExperiment({
        user_id: userId,
        name: req.body.name,
        description: req.body.description,
        template_id: req.body.template_id,
        goal_metric: req.body.goal_metric,
        goal_target: req.body.goal_target,
        confidence_level: req.body.confidence_level,
        min_sample_size: req.body.min_sample_size,
        metadata: req.body.metadata
      });

      res.status(201).json(experiment);
    } catch (error: any) {
      console.error('Error creating experiment:', error);
      res.status(500).json({ error: error.message || 'Failed to create experiment' });
    }
  }
);

/**
 * GET /api/ab-tests
 * Get user's experiments
 */
router.get(
  '/',
  [
    query('status')
      .optional()
      .isIn(['draft', 'running', 'paused', 'completed', 'archived'])
      .withMessage('Invalid status'),
    query('limit').optional().isInt({ min: 1, max: 100 }).toInt(),
    query('offset').optional().isInt({ min: 0 }).toInt()
  ],
  async (req: Request, res: Response) => {
    if (handleValidationErrors(req, res)) return;

    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const experiments = await abTestingService.getUserExperiments(
        userId,
        req.query.status as string,
        parseInt(req.query.limit as string) || 50,
        parseInt(req.query.offset as string) || 0
      );

      res.json(experiments);
    } catch (error: any) {
      console.error('Error fetching experiments:', error);
      res.status(500).json({ error: error.message || 'Failed to fetch experiments' });
    }
  }
);

/**
 * GET /api/ab-tests/:id
 * Get experiment by ID
 */
router.get(
  '/:id',
  [param('id').isUUID().withMessage('Invalid experiment ID')],
  async (req: Request, res: Response) => {
    if (handleValidationErrors(req, res)) return;

    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const experiment = await abTestingService.getExperimentById(req.params.id, userId);

      if (!experiment) {
        res.status(404).json({ error: 'Experiment not found' });
        return;
      }

      res.json(experiment);
    } catch (error: any) {
      console.error('Error fetching experiment:', error);
      res.status(500).json({ error: error.message || 'Failed to fetch experiment' });
    }
  }
);

/**
 * PUT /api/ab-tests/:id
 * Update experiment
 */
router.put(
  '/:id',
  [
    param('id').isUUID().withMessage('Invalid experiment ID'),
    body('name').optional().trim().isLength({ min: 1, max: 200 }),
    body('description').optional().trim().isLength({ max: 1000 }),
    body('goal_metric')
      .optional()
      .isIn(['downloads', 'uses', 'rating', 'conversion', 'engagement']),
    body('goal_target').optional().isFloat({ min: 0 }),
    body('confidence_level').optional().isFloat({ min: 50, max: 99.99 }),
    body('min_sample_size').optional().isInt({ min: 1 })
  ],
  async (req: Request, res: Response) => {
    if (handleValidationErrors(req, res)) return;

    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const experiment = await abTestingService.updateExperiment(
        req.params.id,
        userId,
        req.body
      );

      res.json(experiment);
    } catch (error: any) {
      console.error('Error updating experiment:', error);
      res.status(500).json({ error: error.message || 'Failed to update experiment' });
    }
  }
);

/**
 * POST /api/ab-tests/:id/start
 * Start experiment
 */
router.post(
  '/:id/start',
  [param('id').isUUID().withMessage('Invalid experiment ID')],
  async (req: Request, res: Response) => {
    if (handleValidationErrors(req, res)) return;

    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const experiment = await abTestingService.startExperiment(req.params.id, userId);
      res.json(experiment);
    } catch (error: any) {
      console.error('Error starting experiment:', error);
      res.status(500).json({ error: error.message || 'Failed to start experiment' });
    }
  }
);

/**
 * POST /api/ab-tests/:id/pause
 * Pause experiment
 */
router.post(
  '/:id/pause',
  [param('id').isUUID().withMessage('Invalid experiment ID')],
  async (req: Request, res: Response) => {
    if (handleValidationErrors(req, res)) return;

    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const experiment = await abTestingService.pauseExperiment(req.params.id, userId);
      res.json(experiment);
    } catch (error: any) {
      console.error('Error pausing experiment:', error);
      res.status(500).json({ error: error.message || 'Failed to pause experiment' });
    }
  }
);

/**
 * POST /api/ab-tests/:id/complete
 * Complete experiment
 */
router.post(
  '/:id/complete',
  [param('id').isUUID().withMessage('Invalid experiment ID')],
  async (req: Request, res: Response) => {
    if (handleValidationErrors(req, res)) return;

    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const experiment = await abTestingService.completeExperiment(req.params.id, userId);
      res.json(experiment);
    } catch (error: any) {
      console.error('Error completing experiment:', error);
      res.status(500).json({ error: error.message || 'Failed to complete experiment' });
    }
  }
);

/**
 * DELETE /api/ab-tests/:id
 * Delete experiment
 */
router.delete(
  '/:id',
  [param('id').isUUID().withMessage('Invalid experiment ID')],
  async (req: Request, res: Response) => {
    if (handleValidationErrors(req, res)) return;

    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      await abTestingService.deleteExperiment(req.params.id, userId);
      res.status(204).send();
    } catch (error: any) {
      console.error('Error deleting experiment:', error);
      res.status(500).json({ error: error.message || 'Failed to delete experiment' });
    }
  }
);

// =====================================================================================
// VARIANT ROUTES
// =====================================================================================

/**
 * POST /api/ab-tests/:id/variants
 * Add variant to experiment
 */
router.post(
  '/:id/variants',
  [
    param('id').isUUID().withMessage('Invalid experiment ID'),
    body('variant_name').trim().isLength({ min: 1, max: 50 }).withMessage('Variant name required'),
    body('template_id').isUUID().withMessage('Invalid template ID'),
    body('is_control').isBoolean().withMessage('is_control must be boolean'),
    body('description').optional().trim().isLength({ max: 1000 }),
    body('traffic_percentage').isFloat({ min: 0, max: 100 }).withMessage('Traffic percentage must be 0-100'),
    body('variant_config').optional().isObject()
  ],
  async (req: Request, res: Response) => {
    if (handleValidationErrors(req, res)) return;

    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const variant = await abTestingService.addVariant({
        experiment_id: req.params.id,
        user_id: userId,
        variant_name: req.body.variant_name,
        template_id: req.body.template_id,
        is_control: req.body.is_control,
        description: req.body.description,
        traffic_percentage: req.body.traffic_percentage,
        variant_config: req.body.variant_config
      });

      res.status(201).json(variant);
    } catch (error: any) {
      console.error('Error adding variant:', error);
      res.status(500).json({ error: error.message || 'Failed to add variant' });
    }
  }
);

/**
 * GET /api/ab-tests/:id/variants
 * Get experiment variants
 */
router.get(
  '/:id/variants',
  [param('id').isUUID().withMessage('Invalid experiment ID')],
  async (req: Request, res: Response) => {
    if (handleValidationErrors(req, res)) return;

    try {
      const variants = await abTestingService.getExperimentVariants(req.params.id);
      res.json(variants);
    } catch (error: any) {
      console.error('Error fetching variants:', error);
      res.status(500).json({ error: error.message || 'Failed to fetch variants' });
    }
  }
);

/**
 * PUT /api/ab-tests/:experimentId/variants/:variantId
 * Update variant traffic percentage
 */
router.put(
  '/:experimentId/variants/:variantId',
  [
    param('experimentId').isUUID().withMessage('Invalid experiment ID'),
    param('variantId').isUUID().withMessage('Invalid variant ID'),
    body('traffic_percentage').isFloat({ min: 0, max: 100 }).withMessage('Traffic percentage must be 0-100')
  ],
  async (req: Request, res: Response) => {
    if (handleValidationErrors(req, res)) return;

    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const variant = await abTestingService.updateVariantTraffic(
        req.params.variantId,
        userId,
        req.body.traffic_percentage
      );

      res.json(variant);
    } catch (error: any) {
      console.error('Error updating variant:', error);
      res.status(500).json({ error: error.message || 'Failed to update variant' });
    }
  }
);

/**
 * DELETE /api/ab-tests/:experimentId/variants/:variantId
 * Delete variant
 */
router.delete(
  '/:experimentId/variants/:variantId',
  [
    param('experimentId').isUUID().withMessage('Invalid experiment ID'),
    param('variantId').isUUID().withMessage('Invalid variant ID')
  ],
  async (req: Request, res: Response) => {
    if (handleValidationErrors(req, res)) return;

    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      await abTestingService.deleteVariant(req.params.variantId, userId);
      res.status(204).send();
    } catch (error: any) {
      console.error('Error deleting variant:', error);
      res.status(500).json({ error: error.message || 'Failed to delete variant' });
    }
  }
);

// =====================================================================================
// VARIANT ASSIGNMENT & TRACKING
// =====================================================================================

/**
 * POST /api/ab-tests/:id/assign
 * Assign variant to user/session
 */
router.post(
  '/:id/assign',
  [
    param('id').isUUID().withMessage('Invalid experiment ID'),
    body('session_id').trim().isLength({ min: 1, max: 255 }).withMessage('Session ID required')
  ],
  async (req: Request, res: Response) => {
    if (handleValidationErrors(req, res)) return;

    try {
      const userId = (req as any).user?.id || null;

      const variantId = await abTestingService.assignVariant(
        req.params.id,
        userId,
        req.body.session_id
      );

      res.json({ variant_id: variantId });
    } catch (error: any) {
      console.error('Error assigning variant:', error);
      res.status(500).json({ error: error.message || 'Failed to assign variant' });
    }
  }
);

/**
 * GET /api/ab-tests/:id/assignment
 * Get user's variant assignment
 */
router.get(
  '/:id/assignment',
  [
    param('id').isUUID().withMessage('Invalid experiment ID'),
    query('session_id').trim().isLength({ min: 1, max: 255 }).withMessage('Session ID required')
  ],
  async (req: Request, res: Response) => {
    if (handleValidationErrors(req, res)) return;

    try {
      const assignment = await abTestingService.getUserAssignment(
        req.params.id,
        req.query.session_id as string
      );

      if (!assignment) {
        res.status(404).json({ error: 'No assignment found' });
        return;
      }

      res.json(assignment);
    } catch (error: any) {
      console.error('Error fetching assignment:', error);
      res.status(500).json({ error: error.message || 'Failed to fetch assignment' });
    }
  }
);

/**
 * POST /api/ab-tests/:id/events
 * Record event
 */
router.post(
  '/:id/events',
  [
    param('id').isUUID().withMessage('Invalid experiment ID'),
    body('variant_id').isUUID().withMessage('Invalid variant ID'),
    body('session_id').trim().isLength({ min: 1, max: 255 }).withMessage('Session ID required'),
    body('event_type')
      .isIn(['view', 'download', 'use', 'rate', 'conversion', 'click', 'engagement'])
      .withMessage('Invalid event type'),
    body('event_value').optional().isFloat(),
    body('metadata').optional().isObject()
  ],
  async (req: Request, res: Response) => {
    if (handleValidationErrors(req, res)) return;

    try {
      const userId = (req as any).user?.id || null;

      const result = await abTestingService.recordEvent({
        experiment_id: req.params.id,
        variant_id: req.body.variant_id,
        user_id: userId,
        session_id: req.body.session_id,
        event_type: req.body.event_type,
        event_value: req.body.event_value,
        metadata: req.body.metadata
      });

      res.status(201).json(result);
    } catch (error: any) {
      console.error('Error recording event:', error);
      res.status(500).json({ error: error.message || 'Failed to record event' });
    }
  }
);

// =====================================================================================
// STATISTICS & ANALYSIS
// =====================================================================================

/**
 * POST /api/ab-tests/:id/calculate-statistics
 * Calculate statistics for experiment
 */
router.post(
  '/:id/calculate-statistics',
  [
    param('id').isUUID().withMessage('Invalid experiment ID'),
    body('date').optional().isISO8601().withMessage('Invalid date format')
  ],
  async (req: Request, res: Response) => {
    if (handleValidationErrors(req, res)) return;

    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const date = req.body.date ? new Date(req.body.date) : new Date();

      await abTestingService.calculateStatistics(req.params.id, date);

      res.json({ message: 'Statistics calculated successfully' });
    } catch (error: any) {
      console.error('Error calculating statistics:', error);
      res.status(500).json({ error: error.message || 'Failed to calculate statistics' });
    }
  }
);

/**
 * GET /api/ab-tests/:id/statistics
 * Get experiment statistics
 */
router.get(
  '/:id/statistics',
  [param('id').isUUID().withMessage('Invalid experiment ID')],
  async (req: Request, res: Response) => {
    if (handleValidationErrors(req, res)) return;

    try {
      const statistics = await abTestingService.getExperimentStatistics(req.params.id);
      res.json(statistics);
    } catch (error: any) {
      console.error('Error fetching statistics:', error);
      res.status(500).json({ error: error.message || 'Failed to fetch statistics' });
    }
  }
);

/**
 * GET /api/ab-tests/:id/summary
 * Get experiment summary
 */
router.get(
  '/:id/summary',
  [param('id').isUUID().withMessage('Invalid experiment ID')],
  async (req: Request, res: Response) => {
    if (handleValidationErrors(req, res)) return;

    try {
      const summary = await abTestingService.getExperimentSummary(req.params.id);
      res.json(summary);
    } catch (error: any) {
      console.error('Error fetching summary:', error);
      res.status(500).json({ error: error.message || 'Failed to fetch summary' });
    }
  }
);

/**
 * POST /api/ab-tests/:id/determine-winner
 * Determine winner
 */
router.post(
  '/:id/determine-winner',
  [param('id').isUUID().withMessage('Invalid experiment ID')],
  async (req: Request, res: Response) => {
    if (handleValidationErrors(req, res)) return;

    try {
      const userId = (req as any).user?.id;
      if (!userId) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const winnerVariantId = await abTestingService.determineWinner(req.params.id, userId);

      if (!winnerVariantId) {
        res.json({ message: 'No winner determined yet', winner_variant_id: null });
        return;
      }

      res.json({ winner_variant_id: winnerVariantId });
    } catch (error: any) {
      console.error('Error determining winner:', error);
      res.status(500).json({ error: error.message || 'Failed to determine winner' });
    }
  }
);

// =====================================================================================
// EXPORT
// =====================================================================================

export default router;
