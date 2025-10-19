/**
 * Approval Workflows Service
 *
 * Manages template review and approval processes with multi-step workflows.
 * Features:
 * - Create and manage approval workflows
 * - Submit templates for approval
 * - Review and approve/reject submissions
 * - Multi-step approval processes
 * - Notification system for reviewers
 * - Workflow statistics and analytics
 */

import { Pool } from 'pg';
import { getPool } from '../config/database.js';
import { RedisCacheService } from './redis-cache.service.js';
import { logAuditEvent } from '../utils/audit-logger.js';
import { RBACService } from './rbac.service.js';

// ============================================================================
// INTERFACES
// ============================================================================

export interface WorkflowStep {
    step: number;
    name: string;
    reviewers: string[]; // User IDs
    approvals_required: number;
    auto_approve?: boolean;
}

export interface ApprovalWorkflow {
    id: string;
    name: string;
    description?: string;
    team_id?: string;
    steps: WorkflowStep[];
    require_all_steps: boolean;
    allow_skip_steps: boolean;
    auto_publish_on_approval: boolean;
    is_active: boolean;
    is_default: boolean;
    created_by: string;
    created_at: Date;
    updated_at: Date;
}

export interface ApprovalRequest {
    id: string;
    workflow_id: string;
    template_id: string;
    requested_by: string;
    title: string;
    description?: string;
    current_step: number;
    total_steps: number;
    status: 'pending' | 'in_review' | 'approved' | 'rejected' | 'cancelled';
    notes?: string;
    rejection_reason?: string;
    metadata: Record<string, any>;
    submitted_at: Date;
    completed_at?: Date;
    created_at: Date;
    updated_at: Date;
}

export interface ApprovalReview {
    id: string;
    request_id: string;
    step_number: number;
    step_name?: string;
    reviewer_id: string;
    status: 'pending' | 'approved' | 'rejected' | 'skipped';
    decision?: 'approve' | 'reject' | 'request_changes';
    comments?: string;
    attachments?: string[];
    assigned_at: Date;
    reviewed_at?: Date;
    created_at: Date;
}

export interface ApprovalNotification {
    id: string;
    request_id: string;
    user_id: string;
    notification_type: 'review_required' | 'approved' | 'rejected' | 'request_changes' | 'completed';
    title: string;
    message?: string;
    action_url?: string;
    read_at?: Date;
    dismissed_at?: Date;
    created_at: Date;
}

export interface PendingReview {
    request_id: string;
    template_id: string;
    template_name: string;
    step_number: number;
    assigned_at: Date;
}

export interface WorkflowStatistics {
    total_requests: number;
    pending_requests: number;
    approved_requests: number;
    rejected_requests: number;
    avg_approval_time_hours: number;
}

// ============================================================================
// REQUEST/RESPONSE INTERFACES
// ============================================================================

export interface CreateWorkflowParams {
    name: string;
    description?: string;
    team_id?: string;
    steps: WorkflowStep[];
    require_all_steps?: boolean;
    allow_skip_steps?: boolean;
    auto_publish_on_approval?: boolean;
    is_active?: boolean;
    is_default?: boolean;
    created_by: string;
}

export interface UpdateWorkflowParams {
    workflow_id: string;
    user_id: string;
    name?: string;
    description?: string;
    steps?: WorkflowStep[];
    require_all_steps?: boolean;
    allow_skip_steps?: boolean;
    auto_publish_on_approval?: boolean;
    is_active?: boolean;
    is_default?: boolean;
}

export interface SubmitApprovalParams {
    workflow_id: string;
    template_id: string;
    requested_by: string;
    title: string;
    description?: string;
    metadata?: Record<string, any>;
}

export interface SubmitReviewParams {
    review_id: string;
    reviewer_id: string;
    decision: 'approve' | 'reject' | 'request_changes';
    comments?: string;
    attachments?: string[];
}

// ============================================================================
// SERVICE CLASS
// ============================================================================

export class ApprovalWorkflowsService {
    private pool: Pool;
    private cache: RedisCacheService;
    private rbacService: RBACService;

    constructor() {
        this.pool = getPool();
        this.cache = RedisCacheService.getInstance();
        this.rbacService = new RBACService(this.pool);
    }

    // ========================================================================
    // WORKFLOW MANAGEMENT
    // ========================================================================

    /**
     * Create a new approval workflow
     */
    async createWorkflow(params: CreateWorkflowParams): Promise<ApprovalWorkflow> {
        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            // Validate steps
            if (!params.steps || params.steps.length === 0) {
                throw new Error('Workflow must have at least one step');
            }

            // Ensure steps are numbered sequentially
            params.steps.forEach((step, index) => {
                if (step.step !== index + 1) {
                    throw new Error(`Steps must be numbered sequentially starting from 1`);
                }
                if (!step.reviewers || step.reviewers.length === 0) {
                    throw new Error(`Step ${step.step} must have at least one reviewer`);
                }
                if (step.approvals_required < 1 || step.approvals_required > step.reviewers.length) {
                    throw new Error(`Step ${step.step} approvals_required must be between 1 and number of reviewers`);
                }
            });

            // If setting as default, unset other defaults for this team
            if (params.is_default) {
                const teamCondition = params.team_id ? 'team_id = $1' : 'team_id IS NULL';
                await client.query(
                    `UPDATE approval_workflows SET is_default = false WHERE ${teamCondition}`,
                    params.team_id ? [params.team_id] : []
                );
            }

            const result = await client.query<ApprovalWorkflow>(
                `INSERT INTO approval_workflows (
                    name, description, team_id, steps,
                    require_all_steps, allow_skip_steps, auto_publish_on_approval,
                    is_active, is_default, created_by
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                RETURNING *`,
                [
                    params.name,
                    params.description || null,
                    params.team_id || null,
                    JSON.stringify(params.steps),
                    params.require_all_steps !== false,
                    params.allow_skip_steps || false,
                    params.auto_publish_on_approval || false,
                    params.is_active !== false,
                    params.is_default || false,
                    params.created_by
                ]
            );

            await client.query('COMMIT');

            const workflow = this.mapWorkflowRow(result.rows[0]);

            // Log audit event
            await logAuditEvent({
                userId: params.created_by,
                action: 'approval_workflow.created',
                resourceType: 'approval_workflow',
                resourceId: workflow.id,
                details: {
                    workflow_name: workflow.name,
                    team_id: workflow.team_id,
                    steps_count: workflow.steps.length
                }
            });

            // Invalidate cache
            await this.invalidateWorkflowCache(workflow.team_id);

            return workflow;

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Get workflow by ID
     */
    async getWorkflow(workflowId: string, userId: string): Promise<ApprovalWorkflow | null> {
        const cacheKey = `workflow:${workflowId}`;
        const cached = await this.cache.get<ApprovalWorkflow>(cacheKey);
        if (cached) return cached;

        const result = await this.pool.query<ApprovalWorkflow>(
            'SELECT * FROM approval_workflows WHERE id = $1',
            [workflowId]
        );

        if (result.rows.length === 0) {
            return null;
        }

        const workflow = this.mapWorkflowRow(result.rows[0]);

        // Cache for 5 minutes
        await this.cache.set(cacheKey, workflow, 300);

        return workflow;
    }

    /**
     * Get workflows for a team (or global workflows)
     */
    async getWorkflows(teamId?: string, activeOnly: boolean = true): Promise<ApprovalWorkflow[]> {
        const cacheKey = `workflows:team:${teamId || 'global'}:active:${activeOnly}`;
        const cached = await this.cache.get<ApprovalWorkflow[]>(cacheKey);
        if (cached) return cached;

        let query = 'SELECT * FROM approval_workflows WHERE ';
        const params: any[] = [];

        if (teamId) {
            query += 'team_id = $1';
            params.push(teamId);
        } else {
            query += 'team_id IS NULL';
        }

        if (activeOnly) {
            query += ` AND is_active = true`;
        }

        query += ' ORDER BY is_default DESC, name ASC';

        const result = await this.pool.query<ApprovalWorkflow>(query, params);

        const workflows = result.rows.map(row => this.mapWorkflowRow(row));

        // Cache for 5 minutes
        await this.cache.set(cacheKey, workflows, 300);

        return workflows;
    }

    /**
     * Get default workflow for a team
     */
    async getDefaultWorkflow(teamId?: string): Promise<ApprovalWorkflow | null> {
        const cacheKey = `workflow:default:team:${teamId || 'global'}`;
        const cached = await this.cache.get<ApprovalWorkflow>(cacheKey);
        if (cached) return cached;

        let query = 'SELECT * FROM approval_workflows WHERE is_default = true AND is_active = true AND ';
        const params: any[] = [];

        if (teamId) {
            query += 'team_id = $1';
            params.push(teamId);
        } else {
            query += 'team_id IS NULL';
        }

        query += ' LIMIT 1';

        const result = await this.pool.query<ApprovalWorkflow>(query, params);

        if (result.rows.length === 0) {
            return null;
        }

        const workflow = this.mapWorkflowRow(result.rows[0]);

        // Cache for 10 minutes
        await this.cache.set(cacheKey, workflow, 600);

        return workflow;
    }

    /**
     * Update a workflow
     */
    async updateWorkflow(params: UpdateWorkflowParams): Promise<ApprovalWorkflow> {
        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            // Get existing workflow
            const existing = await client.query<ApprovalWorkflow>(
                'SELECT * FROM approval_workflows WHERE id = $1',
                [params.workflow_id]
            );

            if (existing.rows.length === 0) {
                throw new Error('Workflow not found');
            }

            const workflow = existing.rows[0];

            // Check authorization (must be creator or admin)
            if (workflow.created_by !== params.user_id) {
                // Check if user is admin
                const isAdmin = await this.rbacService.hasRole(params.user_id, 'admin');
                if (!isAdmin) {
                    throw new Error('Not authorized to update this workflow');
                }
            }

            // Validate steps if provided
            if (params.steps) {
                if (params.steps.length === 0) {
                    throw new Error('Workflow must have at least one step');
                }

                params.steps.forEach((step, index) => {
                    if (step.step !== index + 1) {
                        throw new Error(`Steps must be numbered sequentially starting from 1`);
                    }
                    if (!step.reviewers || step.reviewers.length === 0) {
                        throw new Error(`Step ${step.step} must have at least one reviewer`);
                    }
                    if (step.approvals_required < 1 || step.approvals_required > step.reviewers.length) {
                        throw new Error(`Step ${step.step} approvals_required must be between 1 and number of reviewers`);
                    }
                });
            }

            // If setting as default, unset other defaults
            if (params.is_default) {
                const teamCondition = workflow.team_id ? 'team_id = $1' : 'team_id IS NULL';
                await client.query(
                    `UPDATE approval_workflows SET is_default = false WHERE ${teamCondition} AND id != $2`,
                    workflow.team_id ? [workflow.team_id, params.workflow_id] : [params.workflow_id]
                );
            }

            // Build update query
            const updates: string[] = [];
            const values: any[] = [];
            let paramCount = 1;

            if (params.name !== undefined) {
                updates.push(`name = $${paramCount++}`);
                values.push(params.name);
            }
            if (params.description !== undefined) {
                updates.push(`description = $${paramCount++}`);
                values.push(params.description);
            }
            if (params.steps !== undefined) {
                updates.push(`steps = $${paramCount++}`);
                values.push(JSON.stringify(params.steps));
            }
            if (params.require_all_steps !== undefined) {
                updates.push(`require_all_steps = $${paramCount++}`);
                values.push(params.require_all_steps);
            }
            if (params.allow_skip_steps !== undefined) {
                updates.push(`allow_skip_steps = $${paramCount++}`);
                values.push(params.allow_skip_steps);
            }
            if (params.auto_publish_on_approval !== undefined) {
                updates.push(`auto_publish_on_approval = $${paramCount++}`);
                values.push(params.auto_publish_on_approval);
            }
            if (params.is_active !== undefined) {
                updates.push(`is_active = $${paramCount++}`);
                values.push(params.is_active);
            }
            if (params.is_default !== undefined) {
                updates.push(`is_default = $${paramCount++}`);
                values.push(params.is_default);
            }

            if (updates.length === 0) {
                throw new Error('No updates provided');
            }

            values.push(params.workflow_id);

            const result = await client.query<ApprovalWorkflow>(
                `UPDATE approval_workflows
                SET ${updates.join(', ')}
                WHERE id = $${paramCount}
                RETURNING *`,
                values
            );

            await client.query('COMMIT');

            const updatedWorkflow = this.mapWorkflowRow(result.rows[0]);

            // Log audit event
            await logAuditEvent({
                userId: params.user_id,
                action: 'approval_workflow.updated',
                resourceType: 'approval_workflow',
                resourceId: updatedWorkflow.id,
                details: {
                    workflow_name: updatedWorkflow.name,
                    updates: Object.keys(params).filter(k => k !== 'workflow_id' && k !== 'user_id')
                }
            });

            // Invalidate cache
            await this.invalidateWorkflowCache(updatedWorkflow.team_id);
            await this.cache.del(`workflow:${params.workflow_id}`);

            return updatedWorkflow;

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Delete a workflow
     */
    async deleteWorkflow(workflowId: string, userId: string): Promise<void> {
        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            // Get workflow
            const workflow = await client.query<ApprovalWorkflow>(
                'SELECT * FROM approval_workflows WHERE id = $1',
                [workflowId]
            );

            if (workflow.rows.length === 0) {
                throw new Error('Workflow not found');
            }

            // Check authorization (must be creator or admin)
            if (workflow.rows[0].created_by !== userId) {
                // Check if user is admin
                const isAdmin = await this.rbacService.hasRole(userId, 'admin');
                if (!isAdmin) {
                    throw new Error('Not authorized to delete this workflow');
                }
            }

            // Check if workflow has active requests
            const activeRequests = await client.query(
                `SELECT COUNT(*) FROM approval_requests
                WHERE workflow_id = $1 AND status IN ('pending', 'in_review')`,
                [workflowId]
            );

            if (parseInt(activeRequests.rows[0].count) > 0) {
                throw new Error('Cannot delete workflow with active approval requests');
            }

            // Delete workflow
            await client.query('DELETE FROM approval_workflows WHERE id = $1', [workflowId]);

            await client.query('COMMIT');

            // Log audit event
            await logAuditEvent({
                userId,
                action: 'approval_workflow.deleted',
                resourceType: 'approval_workflow',
                resourceId: workflowId,
                details: {
                    workflow_name: workflow.rows[0].name
                }
            });

            // Invalidate cache
            await this.invalidateWorkflowCache(workflow.rows[0].team_id);
            await this.cache.del(`workflow:${workflowId}`);

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    // ========================================================================
    // APPROVAL REQUEST MANAGEMENT
    // ========================================================================

    /**
     * Submit a template for approval
     */
    async submitForApproval(params: SubmitApprovalParams): Promise<ApprovalRequest> {
        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            // Get workflow
            const workflowResult = await client.query<ApprovalWorkflow>(
                'SELECT * FROM approval_workflows WHERE id = $1 AND is_active = true',
                [params.workflow_id]
            );

            if (workflowResult.rows.length === 0) {
                throw new Error('Workflow not found or inactive');
            }

            const workflow = this.mapWorkflowRow(workflowResult.rows[0]);

            // Check if template exists
            const templateResult = await client.query(
                'SELECT id, name FROM ghl_clone_templates WHERE id = $1',
                [params.template_id]
            );

            if (templateResult.rows.length === 0) {
                throw new Error('Template not found');
            }

            // Check if there's already an active approval request for this template
            const existingRequest = await client.query(
                `SELECT id FROM approval_requests
                WHERE template_id = $1 AND status IN ('pending', 'in_review')`,
                [params.template_id]
            );

            if (existingRequest.rows.length > 0) {
                throw new Error('Template already has an active approval request');
            }

            // Create approval request
            const requestResult = await client.query<ApprovalRequest>(
                `INSERT INTO approval_requests (
                    workflow_id, template_id, requested_by, title, description,
                    current_step, total_steps, status, metadata
                ) VALUES ($1, $2, $3, $4, $5, 1, $6, 'pending', $7)
                RETURNING *`,
                [
                    params.workflow_id,
                    params.template_id,
                    params.requested_by,
                    params.title,
                    params.description || null,
                    workflow.steps.length,
                    JSON.stringify(params.metadata || {})
                ]
            );

            const request = this.mapRequestRow(requestResult.rows[0]);

            // Create review entries for first step
            const firstStep = workflow.steps[0];
            for (const reviewerId of firstStep.reviewers) {
                await client.query(
                    `INSERT INTO approval_reviews (
                        request_id, step_number, step_name, reviewer_id, status
                    ) VALUES ($1, $2, $3, $4, 'pending')`,
                    [request.id, 1, firstStep.name, reviewerId]
                );
            }

            // Update request status to in_review
            await client.query(
                'UPDATE approval_requests SET status = $1 WHERE id = $2',
                ['in_review', request.id]
            );

            await client.query('COMMIT');

            request.status = 'in_review';

            // Log audit event
            await logAuditEvent({
                userId: params.requested_by,
                action: 'approval_request.submitted',
                resourceType: 'approval_request',
                resourceId: request.id,
                details: {
                    template_id: params.template_id,
                    workflow_id: params.workflow_id,
                    title: params.title
                }
            });

            return request;

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Get approval request by ID
     */
    async getApprovalRequest(requestId: string, userId: string): Promise<ApprovalRequest | null> {
        const result = await this.pool.query<ApprovalRequest>(
            'SELECT * FROM approval_requests WHERE id = $1',
            [requestId]
        );

        if (result.rows.length === 0) {
            return null;
        }

        return this.mapRequestRow(result.rows[0]);
    }

    /**
     * Get approval requests (with filters)
     */
    async getApprovalRequests(filters: {
        user_id?: string;
        template_id?: string;
        workflow_id?: string;
        status?: string;
        limit?: number;
        offset?: number;
    }): Promise<{ requests: ApprovalRequest[], total: number }> {
        const conditions: string[] = [];
        const params: any[] = [];
        let paramCount = 1;

        if (filters.user_id) {
            conditions.push(`requested_by = $${paramCount++}`);
            params.push(filters.user_id);
        }

        if (filters.template_id) {
            conditions.push(`template_id = $${paramCount++}`);
            params.push(filters.template_id);
        }

        if (filters.workflow_id) {
            conditions.push(`workflow_id = $${paramCount++}`);
            params.push(filters.workflow_id);
        }

        if (filters.status) {
            conditions.push(`status = $${paramCount++}`);
            params.push(filters.status);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        // Get total count
        const countResult = await this.pool.query(
            `SELECT COUNT(*) FROM approval_requests ${whereClause}`,
            params
        );

        const total = parseInt(countResult.rows[0].count);

        // Get requests
        const limit = filters.limit || 50;
        const offset = filters.offset || 0;

        params.push(limit, offset);

        const result = await this.pool.query<ApprovalRequest>(
            `SELECT * FROM approval_requests ${whereClause}
            ORDER BY created_at DESC
            LIMIT $${paramCount++} OFFSET $${paramCount++}`,
            params
        );

        const requests = result.rows.map(row => this.mapRequestRow(row));

        return { requests, total };
    }

    /**
     * Cancel an approval request
     */
    async cancelApprovalRequest(requestId: string, userId: string): Promise<void> {
        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            // Get request
            const request = await client.query<ApprovalRequest>(
                'SELECT * FROM approval_requests WHERE id = $1',
                [requestId]
            );

            if (request.rows.length === 0) {
                throw new Error('Approval request not found');
            }

            // Check authorization (must be requester or admin)
            if (request.rows[0].requested_by !== userId) {
                // Check if user is admin
                const isAdmin = await this.rbacService.hasRole(userId, 'admin');
                if (!isAdmin) {
                    throw new Error('Not authorized to cancel this request');
                }
            }

            // Check if request can be cancelled
            if (!['pending', 'in_review'].includes(request.rows[0].status)) {
                throw new Error('Cannot cancel a request that is already completed');
            }

            // Update request status
            await client.query(
                'UPDATE approval_requests SET status = $1, completed_at = CURRENT_TIMESTAMP WHERE id = $2',
                ['cancelled', requestId]
            );

            await client.query('COMMIT');

            // Log audit event
            await logAuditEvent({
                userId,
                action: 'approval_request.cancelled',
                resourceType: 'approval_request',
                resourceId: requestId,
                details: {
                    template_id: request.rows[0].template_id
                }
            });

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    // ========================================================================
    // REVIEW MANAGEMENT
    // ========================================================================

    /**
     * Submit a review decision
     */
    async submitReview(params: SubmitReviewParams): Promise<void> {
        const client = await this.pool.connect();

        try {
            await client.query('BEGIN');

            // Get review
            const reviewResult = await client.query<ApprovalReview>(
                'SELECT * FROM approval_reviews WHERE id = $1',
                [params.review_id]
            );

            if (reviewResult.rows.length === 0) {
                throw new Error('Review not found');
            }

            const review = reviewResult.rows[0];

            // Check authorization
            if (review.reviewer_id !== params.reviewer_id) {
                throw new Error('Not authorized to submit this review');
            }

            // Check if already reviewed
            if (review.status !== 'pending') {
                throw new Error('Review has already been submitted');
            }

            // Process the review decision using the database function
            await client.query(
                'SELECT process_review_decision($1, $2, $3)',
                [params.review_id, params.decision, params.comments || null]
            );

            // Update attachments if provided
            if (params.attachments && params.attachments.length > 0) {
                await client.query(
                    'UPDATE approval_reviews SET attachments = $1 WHERE id = $2',
                    [JSON.stringify(params.attachments), params.review_id]
                );
            }

            await client.query('COMMIT');

            // Log audit event
            await logAuditEvent({
                userId: params.reviewer_id,
                action: `approval_review.${params.decision}`,
                resourceType: 'approval_review',
                resourceId: params.review_id,
                details: {
                    request_id: review.request_id,
                    decision: params.decision,
                    step_number: review.step_number
                }
            });

        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Get pending reviews for a user
     */
    async getPendingReviews(userId: string, limit: number = 50): Promise<PendingReview[]> {
        const cacheKey = `pending_reviews:${userId}`;
        const cached = await this.cache.get<PendingReview[]>(cacheKey);
        if (cached) return cached;

        const result = await this.pool.query<PendingReview>(
            'SELECT * FROM get_pending_reviews_for_user($1) LIMIT $2',
            [userId, limit]
        );

        const reviews = result.rows;

        // Cache for 2 minutes
        await this.cache.set(cacheKey, reviews, 120);

        return reviews;
    }

    /**
     * Get reviews for an approval request
     */
    async getReviewsForRequest(requestId: string): Promise<ApprovalReview[]> {
        const result = await this.pool.query<ApprovalReview>(
            `SELECT * FROM approval_reviews
            WHERE request_id = $1
            ORDER BY step_number ASC, created_at ASC`,
            [requestId]
        );

        return result.rows.map(row => this.mapReviewRow(row));
    }

    // ========================================================================
    // NOTIFICATIONS
    // ========================================================================

    /**
     * Get notifications for a user
     */
    async getNotifications(userId: string, unreadOnly: boolean = false, limit: number = 50): Promise<ApprovalNotification[]> {
        let query = 'SELECT * FROM approval_notifications WHERE user_id = $1';

        if (unreadOnly) {
            query += ' AND read_at IS NULL';
        }

        query += ' ORDER BY created_at DESC LIMIT $2';

        const result = await this.pool.query<ApprovalNotification>(query, [userId, limit]);

        return result.rows.map(row => this.mapNotificationRow(row));
    }

    /**
     * Mark notification as read
     */
    async markNotificationRead(notificationId: string, userId: string): Promise<void> {
        await this.pool.query(
            'UPDATE approval_notifications SET read_at = CURRENT_TIMESTAMP WHERE id = $1 AND user_id = $2',
            [notificationId, userId]
        );
    }

    /**
     * Mark all notifications as read
     */
    async markAllNotificationsRead(userId: string): Promise<void> {
        await this.pool.query(
            'UPDATE approval_notifications SET read_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND read_at IS NULL',
            [userId]
        );
    }

    // ========================================================================
    // STATISTICS
    // ========================================================================

    /**
     * Get workflow statistics
     */
    async getWorkflowStatistics(workflowId: string): Promise<WorkflowStatistics> {
        const cacheKey = `workflow_stats:${workflowId}`;
        const cached = await this.cache.get<WorkflowStatistics>(cacheKey);
        if (cached) return cached;

        const result = await this.pool.query<WorkflowStatistics>(
            'SELECT * FROM get_workflow_statistics($1)',
            [workflowId]
        );

        if (result.rows.length === 0) {
            return {
                total_requests: 0,
                pending_requests: 0,
                approved_requests: 0,
                rejected_requests: 0,
                avg_approval_time_hours: 0
            };
        }

        const stats = result.rows[0];

        // Cache for 10 minutes
        await this.cache.set(cacheKey, stats, 600);

        return stats;
    }

    // ========================================================================
    // HELPER METHODS
    // ========================================================================

    /**
     * Map database row to ApprovalWorkflow
     */
    private mapWorkflowRow(row: any): ApprovalWorkflow {
        return {
            ...row,
            steps: typeof row.steps === 'string' ? JSON.parse(row.steps) : row.steps,
            created_at: new Date(row.created_at),
            updated_at: new Date(row.updated_at)
        };
    }

    /**
     * Map database row to ApprovalRequest
     */
    private mapRequestRow(row: any): ApprovalRequest {
        return {
            ...row,
            metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
            submitted_at: new Date(row.submitted_at),
            completed_at: row.completed_at ? new Date(row.completed_at) : undefined,
            created_at: new Date(row.created_at),
            updated_at: new Date(row.updated_at)
        };
    }

    /**
     * Map database row to ApprovalReview
     */
    private mapReviewRow(row: any): ApprovalReview {
        return {
            ...row,
            attachments: row.attachments ? (typeof row.attachments === 'string' ? JSON.parse(row.attachments) : row.attachments) : undefined,
            assigned_at: new Date(row.assigned_at),
            reviewed_at: row.reviewed_at ? new Date(row.reviewed_at) : undefined,
            created_at: new Date(row.created_at)
        };
    }

    /**
     * Map database row to ApprovalNotification
     */
    private mapNotificationRow(row: any): ApprovalNotification {
        return {
            ...row,
            read_at: row.read_at ? new Date(row.read_at) : undefined,
            dismissed_at: row.dismissed_at ? new Date(row.dismissed_at) : undefined,
            created_at: new Date(row.created_at)
        };
    }

    /**
     * Invalidate workflow cache
     */
    private async invalidateWorkflowCache(teamId?: string): Promise<void> {
        const patterns = [
            `workflows:team:${teamId || 'global'}:*`,
            `workflow:default:team:${teamId || 'global'}`
        ];

        for (const pattern of patterns) {
            await this.cache.del(pattern);
        }
    }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

let instance: ApprovalWorkflowsService | null = null;

export function getApprovalWorkflowsService(): ApprovalWorkflowsService {
    if (!instance) {
        instance = new ApprovalWorkflowsService();
    }
    return instance;
}
