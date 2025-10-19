import { Pool } from 'pg';
import { getPool } from '../config/database.js';
import { getRedisCacheService } from './redis-cache.service.js';
import type { RedisCacheService } from './redis-cache.service.js';
import { logAuditEvent } from '../utils/audit-logger.js';

// =====================================================================================
// TYPES
// =====================================================================================

export interface ABTestExperiment {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  template_id?: string;
  status: 'draft' | 'running' | 'paused' | 'completed' | 'archived';
  start_date?: Date;
  end_date?: Date;
  actual_start_date?: Date;
  actual_end_date?: Date;
  goal_metric: 'downloads' | 'uses' | 'rating' | 'conversion' | 'engagement';
  goal_target?: number;
  confidence_level: number;
  min_sample_size: number;
  traffic_split: Record<string, number>;
  total_traffic: number;
  winner_variant_id?: string;
  winner_determined_at?: Date;
  auto_apply_winner: boolean;
  metadata: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

export interface ABTestVariant {
  id: string;
  experiment_id: string;
  variant_name: string;
  template_id: string;
  is_control: boolean;
  description?: string;
  traffic_percentage: number;
  current_traffic: number;
  variant_config: Record<string, any>;
  created_at: Date;
  updated_at: Date;
}

export interface ABTestResult {
  id: string;
  experiment_id: string;
  variant_id: string;
  user_id?: string;
  session_id: string;
  event_type: 'view' | 'download' | 'use' | 'rate' | 'conversion' | 'click' | 'engagement';
  event_value?: number;
  metadata: Record<string, any>;
  created_at: Date;
}

export interface ABTestStatistics {
  id: string;
  experiment_id: string;
  variant_id: string;
  date: Date;
  total_views: number;
  total_conversions: number;
  total_engagements: number;
  conversion_rate: number;
  avg_rating?: number;
  sample_size: number;
  standard_error?: number;
  z_score?: number;
  p_value?: number;
  statistical_significance?: number;
  is_significant: boolean;
  is_winner: boolean;
  performance_lift?: number;
  computed_at: Date;
}

export interface ABTestUserAssignment {
  id: string;
  experiment_id: string;
  variant_id: string;
  user_id?: string;
  session_id: string;
  assigned_at: Date;
  sticky: boolean;
  metadata: Record<string, any>;
}

export interface CreateExperimentParams {
  user_id: string;
  name: string;
  description?: string;
  template_id?: string;
  goal_metric: 'downloads' | 'uses' | 'rating' | 'conversion' | 'engagement';
  goal_target?: number;
  confidence_level?: number;
  min_sample_size?: number;
  metadata?: Record<string, any>;
}

export interface AddVariantParams {
  experiment_id: string;
  user_id: string;
  variant_name: string;
  template_id: string;
  is_control: boolean;
  description?: string;
  traffic_percentage: number;
  variant_config?: Record<string, any>;
}

export interface RecordEventParams {
  experiment_id: string;
  variant_id: string;
  user_id?: string;
  session_id: string;
  event_type: 'view' | 'download' | 'use' | 'rate' | 'conversion' | 'click' | 'engagement';
  event_value?: number;
  metadata?: Record<string, any>;
}

export interface ExperimentSummary {
  variant_name: string;
  total_views: number;
  total_conversions: number;
  conversion_rate: number;
  performance_lift: number;
  is_winner: boolean;
}

// =====================================================================================
// SERVICE
// =====================================================================================

class ABTestingService {
  private pool: Pool;
  private cache: RedisCacheService;

  constructor() {
    this.pool = getPool();
    this.cache = getRedisCacheService();
  }

  // =====================================================================================
  // EXPERIMENT MANAGEMENT
  // =====================================================================================

  /**
   * Create A/B test experiment
   */
  async createExperiment(params: CreateExperimentParams): Promise<ABTestExperiment> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query<ABTestExperiment>(
        `INSERT INTO ab_test_experiments (
          user_id, name, description, template_id, goal_metric, goal_target,
          confidence_level, min_sample_size, metadata
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *`,
        [
          params.user_id,
          params.name,
          params.description || null,
          params.template_id || null,
          params.goal_metric,
          params.goal_target || null,
          params.confidence_level || 95.00,
          params.min_sample_size || 100,
          JSON.stringify(params.metadata || {})
        ]
      );

      const experiment = result.rows[0];

      // Audit log
      await logAuditEvent({
        userId: params.user_id,
        action: 'ab_test.experiment.create',
        resourceType: 'ab_test_experiment',
        resourceId: experiment.id,
        details: { name: params.name, goal_metric: params.goal_metric }
      });

      await client.query('COMMIT');

      // Invalidate cache
      await this.cache.delete(`experiments:user:${params.user_id}`);

      return this.formatExperiment(experiment);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get experiment by ID
   */
  async getExperimentById(experimentId: string, userId: string): Promise<ABTestExperiment | null> {
    const cacheKey = `experiment:${experimentId}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    const result = await this.pool.query<ABTestExperiment>(
      'SELECT * FROM ab_test_experiments WHERE id = $1 AND user_id = $2',
      [experimentId, userId]
    );

    if (result.rows.length === 0) return null;

    const experiment = this.formatExperiment(result.rows[0]);
    await this.cache.set(cacheKey, experiment, { ttl: 300 });
    return experiment;
  }

  /**
   * Get user's experiments
   */
  async getUserExperiments(
    userId: string,
    status?: string,
    limit = 50,
    offset = 0
  ): Promise<ABTestExperiment[]> {
    const cacheKey = `experiments:user:${userId}:${status || 'all'}:${limit}:${offset}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    let query = 'SELECT * FROM ab_test_experiments WHERE user_id = $1';
    const params: any[] = [userId];

    if (status) {
      query += ' AND status = $2';
      params.push(status);
    }

    query += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
    params.push(limit, offset);

    const result = await this.pool.query<ABTestExperiment>(query, params);
    const experiments = result.rows.map(row => this.formatExperiment(row));

    await this.cache.set(cacheKey, experiments, { ttl: 300 });
    return experiments;
  }

  /**
   * Update experiment
   */
  async updateExperiment(
    experimentId: string,
    userId: string,
    updates: Partial<CreateExperimentParams>
  ): Promise<ABTestExperiment> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Build update query
      const fields: string[] = [];
      const values: any[] = [];
      let paramCount = 1;

      if (updates.name !== undefined) {
        fields.push(`name = $${paramCount++}`);
        values.push(updates.name);
      }
      if (updates.description !== undefined) {
        fields.push(`description = $${paramCount++}`);
        values.push(updates.description);
      }
      if (updates.goal_metric !== undefined) {
        fields.push(`goal_metric = $${paramCount++}`);
        values.push(updates.goal_metric);
      }
      if (updates.goal_target !== undefined) {
        fields.push(`goal_target = $${paramCount++}`);
        values.push(updates.goal_target);
      }
      if (updates.confidence_level !== undefined) {
        fields.push(`confidence_level = $${paramCount++}`);
        values.push(updates.confidence_level);
      }
      if (updates.min_sample_size !== undefined) {
        fields.push(`min_sample_size = $${paramCount++}`);
        values.push(updates.min_sample_size);
      }

      if (fields.length === 0) {
        throw new Error('No fields to update');
      }

      values.push(experimentId, userId);

      const result = await client.query<ABTestExperiment>(
        `UPDATE ab_test_experiments
         SET ${fields.join(', ')}, updated_at = NOW()
         WHERE id = $${paramCount++} AND user_id = $${paramCount++}
         RETURNING *`,
        values
      );

      if (result.rows.length === 0) {
        throw new Error('Experiment not found or unauthorized');
      }

      const experiment = result.rows[0];

      // Audit log
      await logAuditEvent({
        userId: userId,
        action: 'ab_test.experiment.update',
        resourceType: 'ab_test_experiment',
        resourceId: experimentId,
        details: updates
      });

      await client.query('COMMIT');

      // Invalidate cache
      await this.cache.delete(`experiment:${experimentId}`);
      await this.cache.delete(`experiments:user:${userId}`);

      return this.formatExperiment(experiment);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Start experiment
   */
  async startExperiment(experimentId: string, userId: string): Promise<ABTestExperiment> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Check if experiment has at least 2 variants
      const variantCount = await client.query(
        'SELECT COUNT(*) as count FROM ab_test_variants WHERE experiment_id = $1',
        [experimentId]
      );

      if (parseInt(variantCount.rows[0].count) < 2) {
        throw new Error('Experiment must have at least 2 variants');
      }

      const result = await client.query<ABTestExperiment>(
        `UPDATE ab_test_experiments
         SET status = 'running', actual_start_date = NOW(), updated_at = NOW()
         WHERE id = $1 AND user_id = $2 AND status = 'draft'
         RETURNING *`,
        [experimentId, userId]
      );

      if (result.rows.length === 0) {
        throw new Error('Experiment not found, unauthorized, or already started');
      }

      const experiment = result.rows[0];

      // Audit log
      await logAuditEvent({
        userId: userId,
        action: 'ab_test.experiment.start',
        resourceType: 'ab_test_experiment',
        resourceId: experimentId,
        details: { status: 'running' }
      });

      await client.query('COMMIT');

      // Invalidate cache
      await this.cache.delete(`experiment:${experimentId}`);
      await this.cache.delete(`experiments:user:${userId}`);

      return this.formatExperiment(experiment);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Pause experiment
   */
  async pauseExperiment(experimentId: string, userId: string): Promise<ABTestExperiment> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query<ABTestExperiment>(
        `UPDATE ab_test_experiments
         SET status = 'paused', updated_at = NOW()
         WHERE id = $1 AND user_id = $2 AND status = 'running'
         RETURNING *`,
        [experimentId, userId]
      );

      if (result.rows.length === 0) {
        throw new Error('Experiment not found, unauthorized, or not running');
      }

      const experiment = result.rows[0];

      // Audit log
      await logAuditEvent({
        userId: userId,
        action: 'ab_test.experiment.pause',
        resourceType: 'ab_test_experiment',
        resourceId: experimentId,
        details: { status: 'paused' }
      });

      await client.query('COMMIT');

      // Invalidate cache
      await this.cache.delete(`experiment:${experimentId}`);
      await this.cache.delete(`experiments:user:${userId}`);

      return this.formatExperiment(experiment);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Complete experiment
   */
  async completeExperiment(experimentId: string, userId: string): Promise<ABTestExperiment> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query<ABTestExperiment>(
        `UPDATE ab_test_experiments
         SET status = 'completed', actual_end_date = NOW(), updated_at = NOW()
         WHERE id = $1 AND user_id = $2 AND status IN ('running', 'paused')
         RETURNING *`,
        [experimentId, userId]
      );

      if (result.rows.length === 0) {
        throw new Error('Experiment not found, unauthorized, or not active');
      }

      const experiment = result.rows[0];

      // Audit log
      await logAuditEvent({
        userId: userId,
        action: 'ab_test.experiment.complete',
        resourceType: 'ab_test_experiment',
        resourceId: experimentId,
        details: { status: 'completed' }
      });

      await client.query('COMMIT');

      // Invalidate cache
      await this.cache.delete(`experiment:${experimentId}`);
      await this.cache.delete(`experiments:user:${userId}`);

      return this.formatExperiment(experiment);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Delete experiment
   */
  async deleteExperiment(experimentId: string, userId: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      const result = await client.query(
        `DELETE FROM ab_test_experiments
         WHERE id = $1 AND user_id = $2 AND status IN ('draft', 'completed', 'archived')
         RETURNING id`,
        [experimentId, userId]
      );

      if (result.rows.length === 0) {
        throw new Error('Experiment not found, unauthorized, or cannot be deleted');
      }

      // Audit log
      await logAuditEvent({
        userId: userId,
        action: 'ab_test.experiment.delete',
        resourceType: 'ab_test_experiment',
        resourceId: experimentId,
        details: {}
      });

      await client.query('COMMIT');

      // Invalidate cache
      await this.cache.delete(`experiment:${experimentId}`);
      await this.cache.delete(`experiments:user:${userId}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // =====================================================================================
  // VARIANT MANAGEMENT
  // =====================================================================================

  /**
   * Add variant to experiment
   */
  async addVariant(params: AddVariantParams): Promise<ABTestVariant> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Verify experiment ownership and status
      const expResult = await client.query(
        'SELECT status FROM ab_test_experiments WHERE id = $1 AND user_id = $2',
        [params.experiment_id, params.user_id]
      );

      if (expResult.rows.length === 0) {
        throw new Error('Experiment not found or unauthorized');
      }

      if (expResult.rows[0].status !== 'draft') {
        throw new Error('Cannot add variants to active experiment');
      }

      // Insert variant
      const result = await client.query<ABTestVariant>(
        `INSERT INTO ab_test_variants (
          experiment_id, variant_name, template_id, is_control,
          description, traffic_percentage, variant_config
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *`,
        [
          params.experiment_id,
          params.variant_name,
          params.template_id,
          params.is_control,
          params.description || null,
          params.traffic_percentage,
          JSON.stringify(params.variant_config || {})
        ]
      );

      const variant = result.rows[0];

      // Update traffic split in experiment
      const variants = await client.query<ABTestVariant>(
        'SELECT variant_name, traffic_percentage FROM ab_test_variants WHERE experiment_id = $1',
        [params.experiment_id]
      );

      const trafficSplit: Record<string, number> = {};
      variants.rows.forEach(v => {
        trafficSplit[v.variant_name] = parseFloat(v.traffic_percentage.toString());
      });

      await client.query(
        'UPDATE ab_test_experiments SET traffic_split = $1 WHERE id = $2',
        [JSON.stringify(trafficSplit), params.experiment_id]
      );

      // Audit log
      await logAuditEvent({
        userId: params.user_id,
        action: 'ab_test.variant.create',
        resourceType: 'ab_test_variant',
        resourceId: variant.id,
        details: { experiment_id: params.experiment_id, variant_name: params.variant_name }
      });

      await client.query('COMMIT');

      // Invalidate cache
      await this.cache.delete(`experiment:${params.experiment_id}`);
      await this.cache.delete(`variants:experiment:${params.experiment_id}`);

      return this.formatVariant(variant);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get experiment variants
   */
  async getExperimentVariants(experimentId: string): Promise<ABTestVariant[]> {
    const cacheKey = `variants:experiment:${experimentId}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    const result = await this.pool.query<ABTestVariant>(
      'SELECT * FROM ab_test_variants WHERE experiment_id = $1 ORDER BY created_at',
      [experimentId]
    );

    const variants = result.rows.map(row => this.formatVariant(row));
    await this.cache.set(cacheKey, variants, { ttl: 300 });
    return variants;
  }

  /**
   * Update variant traffic percentage
   */
  async updateVariantTraffic(
    variantId: string,
    userId: string,
    trafficPercentage: number
  ): Promise<ABTestVariant> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Get experiment and verify ownership
      const expResult = await client.query(
        `SELECT e.id, e.status FROM ab_test_experiments e
         JOIN ab_test_variants v ON v.experiment_id = e.id
         WHERE v.id = $1 AND e.user_id = $2`,
        [variantId, userId]
      );

      if (expResult.rows.length === 0) {
        throw new Error('Variant not found or unauthorized');
      }

      if (expResult.rows[0].status !== 'draft') {
        throw new Error('Cannot modify variants in active experiment');
      }

      const result = await client.query<ABTestVariant>(
        `UPDATE ab_test_variants
         SET traffic_percentage = $1, updated_at = NOW()
         WHERE id = $2
         RETURNING *`,
        [trafficPercentage, variantId]
      );

      const variant = result.rows[0];

      // Update traffic split in experiment
      const variants = await client.query<ABTestVariant>(
        'SELECT variant_name, traffic_percentage FROM ab_test_variants WHERE experiment_id = $1',
        [variant.experiment_id]
      );

      const trafficSplit: Record<string, number> = {};
      variants.rows.forEach(v => {
        trafficSplit[v.variant_name] = parseFloat(v.traffic_percentage.toString());
      });

      await client.query(
        'UPDATE ab_test_experiments SET traffic_split = $1 WHERE id = $2',
        [JSON.stringify(trafficSplit), variant.experiment_id]
      );

      // Audit log
      await logAuditEvent({
        userId: userId,
        action: 'ab_test.variant.update',
        resourceType: 'ab_test_variant',
        resourceId: variantId,
        details: { traffic_percentage: trafficPercentage }
      });

      await client.query('COMMIT');

      // Invalidate cache
      await this.cache.delete(`experiment:${variant.experiment_id}`);
      await this.cache.delete(`variants:experiment:${variant.experiment_id}`);

      return this.formatVariant(variant);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Delete variant
   */
  async deleteVariant(variantId: string, userId: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Get experiment and verify ownership/status
      const expResult = await client.query(
        `SELECT e.id, e.status FROM ab_test_experiments e
         JOIN ab_test_variants v ON v.experiment_id = e.id
         WHERE v.id = $1 AND e.user_id = $2`,
        [variantId, userId]
      );

      if (expResult.rows.length === 0) {
        throw new Error('Variant not found or unauthorized');
      }

      if (expResult.rows[0].status !== 'draft') {
        throw new Error('Cannot delete variants from active experiment');
      }

      const experimentId = expResult.rows[0].id;

      await client.query('DELETE FROM ab_test_variants WHERE id = $1', [variantId]);

      // Update traffic split
      const variants = await client.query<ABTestVariant>(
        'SELECT variant_name, traffic_percentage FROM ab_test_variants WHERE experiment_id = $1',
        [experimentId]
      );

      const trafficSplit: Record<string, number> = {};
      variants.rows.forEach(v => {
        trafficSplit[v.variant_name] = parseFloat(v.traffic_percentage.toString());
      });

      await client.query(
        'UPDATE ab_test_experiments SET traffic_split = $1 WHERE id = $2',
        [JSON.stringify(trafficSplit), experimentId]
      );

      // Audit log
      await logAuditEvent({
        userId: userId,
        action: 'ab_test.variant.delete',
        resourceType: 'ab_test_variant',
        resourceId: variantId,
        details: { experiment_id: experimentId }
      });

      await client.query('COMMIT');

      // Invalidate cache
      await this.cache.delete(`experiment:${experimentId}`);
      await this.cache.delete(`variants:experiment:${experimentId}`);
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // =====================================================================================
  // VARIANT ASSIGNMENT
  // =====================================================================================

  /**
   * Assign variant to user/session
   */
  async assignVariant(
    experimentId: string,
    userId: string | null,
    sessionId: string
  ): Promise<string> {
    const result = await this.pool.query<{ assign_ab_test_variant: string }>(
      'SELECT assign_ab_test_variant($1, $2, $3) as assign_ab_test_variant',
      [experimentId, userId, sessionId]
    );

    return result.rows[0].assign_ab_test_variant;
  }

  /**
   * Get user's assigned variant
   */
  async getUserAssignment(
    experimentId: string,
    sessionId: string
  ): Promise<ABTestUserAssignment | null> {
    const result = await this.pool.query<ABTestUserAssignment>(
      'SELECT * FROM ab_test_user_assignments WHERE experiment_id = $1 AND session_id = $2',
      [experimentId, sessionId]
    );

    if (result.rows.length === 0) return null;
    return this.formatAssignment(result.rows[0]);
  }

  // =====================================================================================
  // EVENT TRACKING
  // =====================================================================================

  /**
   * Record event
   */
  async recordEvent(params: RecordEventParams): Promise<ABTestResult> {
    const result = await this.pool.query<ABTestResult>(
      `INSERT INTO ab_test_results (
        experiment_id, variant_id, user_id, session_id,
        event_type, event_value, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *`,
      [
        params.experiment_id,
        params.variant_id,
        params.user_id || null,
        params.session_id,
        params.event_type,
        params.event_value || null,
        JSON.stringify(params.metadata || {})
      ]
    );

    return this.formatResult(result.rows[0]);
  }

  // =====================================================================================
  // STATISTICS & ANALYSIS
  // =====================================================================================

  /**
   * Calculate statistics for experiment
   */
  async calculateStatistics(experimentId: string, date: Date): Promise<void> {
    await this.pool.query(
      'SELECT calculate_ab_test_statistics($1, $2)',
      [experimentId, date]
    );

    // Invalidate cache
    await this.cache.delete(`statistics:experiment:${experimentId}`);
    await this.cache.delete(`summary:experiment:${experimentId}`);
  }

  /**
   * Get experiment statistics
   */
  async getExperimentStatistics(experimentId: string): Promise<ABTestStatistics[]> {
    const cacheKey = `statistics:experiment:${experimentId}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    const result = await this.pool.query<ABTestStatistics>(
      `SELECT * FROM ab_test_statistics
       WHERE experiment_id = $1
       ORDER BY date DESC, variant_id`,
      [experimentId]
    );

    const statistics = result.rows.map(row => this.formatStatistics(row));
    await this.cache.set(cacheKey, statistics, { ttl: 300 });
    return statistics;
  }

  /**
   * Get experiment summary
   */
  async getExperimentSummary(experimentId: string): Promise<ExperimentSummary[]> {
    const cacheKey = `summary:experiment:${experimentId}`;
    const cached = await this.cache.get(cacheKey);
    if (cached) return cached;

    const result = await this.pool.query<ExperimentSummary>(
      'SELECT * FROM get_ab_test_summary($1)',
      [experimentId]
    );

    const summary = result.rows;
    await this.cache.set(cacheKey, summary, { ttl: 300 });
    return summary;
  }

  /**
   * Determine winner
   */
  async determineWinner(experimentId: string, userId: string): Promise<string | null> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Verify ownership
      const expResult = await client.query(
        'SELECT id FROM ab_test_experiments WHERE id = $1 AND user_id = $2',
        [experimentId, userId]
      );

      if (expResult.rows.length === 0) {
        throw new Error('Experiment not found or unauthorized');
      }

      const result = await client.query<{ determine_ab_test_winner: string | null }>(
        'SELECT determine_ab_test_winner($1) as determine_ab_test_winner',
        [experimentId]
      );

      const winnerVariantId = result.rows[0].determine_ab_test_winner;

      if (winnerVariantId) {
        // Audit log
        await logAuditEvent({
          userId: userId,
          action: 'ab_test.winner.determine',
          resourceType: 'ab_test_experiment',
          resourceId: experimentId,
          details: { winner_variant_id: winnerVariantId }
        });
      }

      await client.query('COMMIT');

      // Invalidate cache
      await this.cache.delete(`experiment:${experimentId}`);
      await this.cache.delete(`statistics:experiment:${experimentId}`);
      await this.cache.delete(`summary:experiment:${experimentId}`);

      return winnerVariantId;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  // =====================================================================================
  // HELPER METHODS
  // =====================================================================================

  private formatExperiment(row: any): ABTestExperiment {
    return {
      ...row,
      traffic_split: typeof row.traffic_split === 'string'
        ? JSON.parse(row.traffic_split)
        : row.traffic_split,
      metadata: typeof row.metadata === 'string'
        ? JSON.parse(row.metadata)
        : row.metadata,
      confidence_level: parseFloat(row.confidence_level),
      goal_target: row.goal_target ? parseFloat(row.goal_target) : undefined
    };
  }

  private formatVariant(row: any): ABTestVariant {
    return {
      ...row,
      traffic_percentage: parseFloat(row.traffic_percentage),
      variant_config: typeof row.variant_config === 'string'
        ? JSON.parse(row.variant_config)
        : row.variant_config
    };
  }

  private formatResult(row: any): ABTestResult {
    return {
      ...row,
      event_value: row.event_value ? parseFloat(row.event_value) : undefined,
      metadata: typeof row.metadata === 'string'
        ? JSON.parse(row.metadata)
        : row.metadata
    };
  }

  private formatStatistics(row: any): ABTestStatistics {
    return {
      ...row,
      conversion_rate: parseFloat(row.conversion_rate),
      avg_rating: row.avg_rating ? parseFloat(row.avg_rating) : undefined,
      standard_error: row.standard_error ? parseFloat(row.standard_error) : undefined,
      z_score: row.z_score ? parseFloat(row.z_score) : undefined,
      p_value: row.p_value ? parseFloat(row.p_value) : undefined,
      statistical_significance: row.statistical_significance
        ? parseFloat(row.statistical_significance)
        : undefined,
      performance_lift: row.performance_lift ? parseFloat(row.performance_lift) : undefined
    };
  }

  private formatAssignment(row: any): ABTestUserAssignment {
    return {
      ...row,
      metadata: typeof row.metadata === 'string'
        ? JSON.parse(row.metadata)
        : row.metadata
    };
  }
}

// =====================================================================================
// EXPORT (Singleton Pattern)
// =====================================================================================

let abTestingServiceInstance: ABTestingService | null = null;

export function getABTestingService(): ABTestingService {
  if (!abTestingServiceInstance) {
    abTestingServiceInstance = new ABTestingService();
  }
  return abTestingServiceInstance;
}
