-- Rollback migration for Approval Workflows
-- This will completely remove all approval workflow features

-- Drop triggers first
DROP TRIGGER IF EXISTS review_assigned_notification ON approval_reviews;
DROP TRIGGER IF EXISTS approval_requests_update_timestamp ON approval_requests;
DROP TRIGGER IF EXISTS workflows_update_timestamp ON approval_workflows;

-- Drop trigger functions
DROP FUNCTION IF EXISTS trigger_review_assigned_notification();
DROP FUNCTION IF EXISTS update_approval_request_timestamp();
DROP FUNCTION IF EXISTS update_workflow_timestamp();

-- Drop functions
DROP FUNCTION IF EXISTS get_workflow_statistics(UUID);
DROP FUNCTION IF EXISTS create_approval_notification(UUID, UUID, VARCHAR, VARCHAR, TEXT);
DROP FUNCTION IF EXISTS process_review_decision(UUID, VARCHAR, TEXT);
DROP FUNCTION IF EXISTS advance_to_next_step(UUID);
DROP FUNCTION IF EXISTS check_step_approved(UUID, INTEGER);
DROP FUNCTION IF EXISTS get_pending_reviews_for_user(UUID);

-- Drop tables in reverse dependency order
DROP TABLE IF EXISTS approval_notifications CASCADE;
DROP TABLE IF EXISTS approval_reviews CASCADE;
DROP TABLE IF EXISTS approval_requests CASCADE;
DROP TABLE IF EXISTS approval_workflows CASCADE;

-- Success message
DO $$
BEGIN
    RAISE NOTICE '✅ Rollback of 026_approval_workflows completed';
    RAISE NOTICE '   - All approval workflow tables, functions, and triggers removed';
END $$;
