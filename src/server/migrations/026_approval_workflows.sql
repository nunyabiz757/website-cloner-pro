-- Migration: Approval Workflows System
-- This adds template review and approval process functionality

-- ============================================================================
-- APPROVAL WORKFLOWS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS approval_workflows (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    team_id UUID REFERENCES teams(id) ON DELETE CASCADE,

    -- Workflow steps configuration
    steps JSONB NOT NULL, -- Array of step definitions with reviewers
    /*
    Example steps structure:
    [
        {
            "step": 1,
            "name": "Initial Review",
            "reviewers": ["user_id_1", "user_id_2"],
            "approvals_required": 1,
            "auto_approve": false
        },
        {
            "step": 2,
            "name": "Final Approval",
            "reviewers": ["user_id_3"],
            "approvals_required": 1,
            "auto_approve": false
        }
    ]
    */

    -- Workflow settings
    require_all_steps BOOLEAN DEFAULT true,
    allow_skip_steps BOOLEAN DEFAULT false,
    auto_publish_on_approval BOOLEAN DEFAULT false,

    -- Status
    is_active BOOLEAN DEFAULT true,
    is_default BOOLEAN DEFAULT false,

    -- Metadata
    created_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- APPROVAL REQUESTS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS approval_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id UUID NOT NULL REFERENCES approval_workflows(id) ON DELETE RESTRICT,
    template_id UUID NOT NULL REFERENCES ghl_clone_templates(id) ON DELETE CASCADE,

    -- Request details
    requested_by UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,

    -- Progress tracking
    current_step INTEGER DEFAULT 1,
    total_steps INTEGER NOT NULL,

    -- Status
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'in_review', 'approved', 'rejected', 'cancelled'

    -- Notes and feedback
    notes TEXT,
    rejection_reason TEXT,

    -- Metadata
    metadata JSONB DEFAULT '{}'::JSONB,

    -- Timestamps
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- APPROVAL REVIEWS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS approval_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL REFERENCES approval_requests(id) ON DELETE CASCADE,

    -- Step information
    step_number INTEGER NOT NULL,
    step_name VARCHAR(200),

    -- Reviewer
    reviewer_id UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,

    -- Decision
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'approved', 'rejected', 'skipped'
    decision VARCHAR(50), -- 'approve', 'reject', 'request_changes'

    -- Feedback
    comments TEXT,
    attachments JSONB, -- Array of file URLs

    -- Timestamps
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE(request_id, step_number, reviewer_id)
);

-- ============================================================================
-- APPROVAL NOTIFICATIONS TABLE
-- ============================================================================

CREATE TABLE IF NOT EXISTS approval_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    request_id UUID NOT NULL REFERENCES approval_requests(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Notification details
    notification_type VARCHAR(50) NOT NULL, -- 'review_required', 'approved', 'rejected', 'request_changes', 'completed'
    title VARCHAR(255) NOT NULL,
    message TEXT,

    -- Link
    action_url TEXT,

    -- Status
    read_at TIMESTAMPTZ,
    dismissed_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Approval workflows indexes
CREATE INDEX IF NOT EXISTS idx_workflows_team_id ON approval_workflows(team_id);
CREATE INDEX IF NOT EXISTS idx_workflows_is_active ON approval_workflows(is_active);
CREATE INDEX IF NOT EXISTS idx_workflows_is_default ON approval_workflows(team_id, is_default) WHERE is_default = true;
CREATE INDEX IF NOT EXISTS idx_workflows_created_by ON approval_workflows(created_by);

-- Approval requests indexes
CREATE INDEX IF NOT EXISTS idx_requests_workflow_id ON approval_requests(workflow_id);
CREATE INDEX IF NOT EXISTS idx_requests_template_id ON approval_requests(template_id);
CREATE INDEX IF NOT EXISTS idx_requests_requested_by ON approval_requests(requested_by);
CREATE INDEX IF NOT EXISTS idx_requests_status ON approval_requests(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_requests_current_step ON approval_requests(current_step);

-- Approval reviews indexes
CREATE INDEX IF NOT EXISTS idx_reviews_request_id ON approval_reviews(request_id);
CREATE INDEX IF NOT EXISTS idx_reviews_reviewer_id ON approval_reviews(reviewer_id, status);
CREATE INDEX IF NOT EXISTS idx_reviews_step_number ON approval_reviews(request_id, step_number);
CREATE INDEX IF NOT EXISTS idx_reviews_status ON approval_reviews(status);

-- Approval notifications indexes
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON approval_notifications(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_request_id ON approval_notifications(request_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON approval_notifications(user_id, read_at) WHERE read_at IS NULL;

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function: Get pending reviews for user
CREATE OR REPLACE FUNCTION get_pending_reviews_for_user(p_user_id UUID)
RETURNS TABLE (
    request_id UUID,
    template_id UUID,
    template_name VARCHAR,
    step_number INTEGER,
    assigned_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ar.id as request_id,
        ar.template_id,
        t.name as template_name,
        rev.step_number,
        rev.assigned_at
    FROM approval_reviews rev
    JOIN approval_requests ar ON rev.request_id = ar.id
    JOIN ghl_clone_templates t ON ar.template_id = t.id
    WHERE rev.reviewer_id = p_user_id
      AND rev.status = 'pending'
      AND ar.status IN ('pending', 'in_review')
    ORDER BY rev.assigned_at ASC;
END;
$$ LANGUAGE plpgsql;

-- Function: Check if all reviews for step are approved
CREATE OR REPLACE FUNCTION check_step_approved(
    p_request_id UUID,
    p_step_number INTEGER
)
RETURNS BOOLEAN AS $$
DECLARE
    v_total_reviews INTEGER;
    v_approved_reviews INTEGER;
    v_required_approvals INTEGER;
BEGIN
    -- Get total reviews for this step
    SELECT COUNT(*) INTO v_total_reviews
    FROM approval_reviews
    WHERE request_id = p_request_id
      AND step_number = p_step_number;

    -- Get approved reviews
    SELECT COUNT(*) INTO v_approved_reviews
    FROM approval_reviews
    WHERE request_id = p_request_id
      AND step_number = p_step_number
      AND decision = 'approve'
      AND status = 'approved';

    -- Get required approvals from workflow
    SELECT
        (steps->p_step_number-1->>'approvals_required')::INTEGER INTO v_required_approvals
    FROM approval_workflows w
    JOIN approval_requests r ON w.id = r.workflow_id
    WHERE r.id = p_request_id;

    -- Check if requirements met
    RETURN v_approved_reviews >= v_required_approvals;
END;
$$ LANGUAGE plpgsql;

-- Function: Advance to next step
CREATE OR REPLACE FUNCTION advance_to_next_step(p_request_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_current_step INTEGER;
    v_total_steps INTEGER;
    v_next_step INTEGER;
    v_workflow_id UUID;
    v_next_step_config JSONB;
    v_reviewer_id UUID;
BEGIN
    -- Get current request details
    SELECT current_step, total_steps, workflow_id
    INTO v_current_step, v_total_steps, v_workflow_id
    FROM approval_requests
    WHERE id = p_request_id;

    -- Check if this is the last step
    IF v_current_step >= v_total_steps THEN
        -- Mark request as approved
        UPDATE approval_requests
        SET status = 'approved',
            completed_at = CURRENT_TIMESTAMP
        WHERE id = p_request_id;

        RETURN true;
    END IF;

    -- Move to next step
    v_next_step := v_current_step + 1;

    UPDATE approval_requests
    SET current_step = v_next_step,
        status = 'in_review'
    WHERE id = p_request_id;

    -- Create reviews for next step reviewers
    SELECT steps->v_next_step-1 INTO v_next_step_config
    FROM approval_workflows
    WHERE id = v_workflow_id;

    -- Insert reviews for each reviewer in next step
    FOR v_reviewer_id IN
        SELECT jsonb_array_elements_text(v_next_step_config->'reviewers')::UUID
    LOOP
        INSERT INTO approval_reviews (
            request_id, step_number, step_name, reviewer_id, status
        ) VALUES (
            p_request_id,
            v_next_step,
            v_next_step_config->>'name',
            v_reviewer_id,
            'pending'
        );
    END LOOP;

    RETURN true;
END;
$$ LANGUAGE plpgsql;

-- Function: Process review decision
CREATE OR REPLACE FUNCTION process_review_decision(
    p_review_id UUID,
    p_decision VARCHAR(50),
    p_comments TEXT
)
RETURNS BOOLEAN AS $$
DECLARE
    v_request_id UUID;
    v_step_number INTEGER;
    v_step_approved BOOLEAN;
BEGIN
    -- Update review
    UPDATE approval_reviews
    SET decision = p_decision,
        status = CASE WHEN p_decision = 'approve' THEN 'approved' ELSE 'rejected' END,
        comments = p_comments,
        reviewed_at = CURRENT_TIMESTAMP
    WHERE id = p_review_id
    RETURNING request_id, step_number INTO v_request_id, v_step_number;

    -- If rejected, mark entire request as rejected
    IF p_decision = 'reject' THEN
        UPDATE approval_requests
        SET status = 'rejected',
            rejection_reason = p_comments,
            completed_at = CURRENT_TIMESTAMP
        WHERE id = v_request_id;

        RETURN false;
    END IF;

    -- If approved, check if step is complete
    IF p_decision = 'approve' THEN
        v_step_approved := check_step_approved(v_request_id, v_step_number);

        IF v_step_approved THEN
            -- Advance to next step or complete
            PERFORM advance_to_next_step(v_request_id);
        END IF;
    END IF;

    RETURN true;
END;
$$ LANGUAGE plpgsql;

-- Function: Create approval notification
CREATE OR REPLACE FUNCTION create_approval_notification(
    p_request_id UUID,
    p_user_id UUID,
    p_notification_type VARCHAR(50),
    p_title VARCHAR(255),
    p_message TEXT
)
RETURNS UUID AS $$
DECLARE
    v_notification_id UUID;
BEGIN
    INSERT INTO approval_notifications (
        request_id, user_id, notification_type, title, message
    ) VALUES (
        p_request_id, p_user_id, p_notification_type, p_title, p_message
    ) RETURNING id INTO v_notification_id;

    RETURN v_notification_id;
END;
$$ LANGUAGE plpgsql;

-- Function: Get workflow statistics
CREATE OR REPLACE FUNCTION get_workflow_statistics(p_workflow_id UUID)
RETURNS TABLE (
    total_requests INTEGER,
    pending_requests INTEGER,
    approved_requests INTEGER,
    rejected_requests INTEGER,
    avg_approval_time_hours DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COUNT(*)::INTEGER as total_requests,
        COUNT(*) FILTER (WHERE status IN ('pending', 'in_review'))::INTEGER as pending_requests,
        COUNT(*) FILTER (WHERE status = 'approved')::INTEGER as approved_requests,
        COUNT(*) FILTER (WHERE status = 'rejected')::INTEGER as rejected_requests,
        AVG(EXTRACT(EPOCH FROM (completed_at - submitted_at)) / 3600)::DECIMAL as avg_approval_time_hours
    FROM approval_requests
    WHERE workflow_id = p_workflow_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TRIGGERS
-- ============================================================================

-- Trigger: Update approval_requests updated_at timestamp
CREATE OR REPLACE FUNCTION update_approval_request_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER approval_requests_update_timestamp
BEFORE UPDATE ON approval_requests
FOR EACH ROW
EXECUTE FUNCTION update_approval_request_timestamp();

-- Trigger: Update approval_workflows updated_at timestamp
CREATE OR REPLACE FUNCTION update_workflow_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER workflows_update_timestamp
BEFORE UPDATE ON approval_workflows
FOR EACH ROW
EXECUTE FUNCTION update_workflow_timestamp();

-- Trigger: Create notifications on review assignment
CREATE OR REPLACE FUNCTION trigger_review_assigned_notification()
RETURNS TRIGGER AS $$
DECLARE
    v_template_name VARCHAR(255);
BEGIN
    -- Get template name
    SELECT t.name INTO v_template_name
    FROM approval_requests ar
    JOIN ghl_clone_templates t ON ar.template_id = t.id
    WHERE ar.id = NEW.request_id;

    -- Create notification
    PERFORM create_approval_notification(
        NEW.request_id,
        NEW.reviewer_id,
        'review_required',
        'Review Required: ' || v_template_name,
        'You have been assigned to review a template in step ' || NEW.step_number
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER review_assigned_notification
AFTER INSERT ON approval_reviews
FOR EACH ROW
WHEN (NEW.status = 'pending')
EXECUTE FUNCTION trigger_review_assigned_notification();

-- ============================================================================
-- DEFAULT DATA
-- ============================================================================

-- Insert analytics metrics
INSERT INTO analytics_daily_stats (date, user_id, metric_type, metric_category, metric_value) VALUES
(CURRENT_DATE, NULL, 'approval_requests_submitted', 'approvals', 0),
(CURRENT_DATE, NULL, 'approval_requests_approved', 'approvals', 0),
(CURRENT_DATE, NULL, 'approval_requests_rejected', 'approvals', 0)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 026_approval_workflows completed successfully';
    RAISE NOTICE '   - 4 tables created (approval_workflows, approval_requests, approval_reviews, approval_notifications)';
    RAISE NOTICE '   - 7 functions created';
    RAISE NOTICE '   - 3 triggers created';
    RAISE NOTICE '   - 15+ indexes created';
    RAISE NOTICE '   - Approval Workflows System ready!';
END $$;
