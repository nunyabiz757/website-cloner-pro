-- =====================================================================================
-- Phase 4B: Bulk Operations, Export/Import, and Scheduling
-- =====================================================================================
-- This migration creates infrastructure for:
-- 1. Bulk Operations - Process multiple items at once with job queue
-- 2. Template Export/Import - Package templates with assets
-- 3. Clone Scheduling - Schedule operations with recurring support
-- =====================================================================================

-- =====================================================================================
-- TABLE 1: bulk_operations
-- Job queue for bulk operations
-- =====================================================================================
CREATE TABLE IF NOT EXISTS bulk_operations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Operation Details
    operation_type VARCHAR(50) NOT NULL, -- 'clone', 'export', 'delete', 'update', 'import'
    resource_type VARCHAR(50) NOT NULL, -- 'templates', 'clones', 'pages'

    -- Status Tracking
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed', 'cancelled'

    -- Progress Metrics
    total_items INTEGER NOT NULL,
    processed_items INTEGER DEFAULT 0,
    successful_items INTEGER DEFAULT 0,
    failed_items INTEGER DEFAULT 0,

    -- Data
    items JSONB NOT NULL, -- Array of IDs to process
    options JSONB DEFAULT '{}'::jsonb, -- Operation-specific options
    results JSONB DEFAULT '{}'::jsonb, -- Results per item

    -- Error Handling
    error_log TEXT,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,

    -- Timestamps
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT valid_operation_type CHECK (operation_type IN ('clone', 'export', 'delete', 'update', 'import')),
    CONSTRAINT valid_resource_type CHECK (resource_type IN ('templates', 'clones', 'pages')),
    CONSTRAINT valid_status CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled'))
);

CREATE INDEX idx_bulk_operations_user ON bulk_operations(user_id);
CREATE INDEX idx_bulk_operations_status ON bulk_operations(status);
CREATE INDEX idx_bulk_operations_type ON bulk_operations(operation_type, resource_type);
CREATE INDEX idx_bulk_operations_created ON bulk_operations(created_at DESC);

-- =====================================================================================
-- TABLE 2: bulk_operation_items
-- Track individual item progress within bulk operation
-- =====================================================================================
CREATE TABLE IF NOT EXISTS bulk_operation_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bulk_operation_id UUID NOT NULL REFERENCES bulk_operations(id) ON DELETE CASCADE,

    -- Item Details
    item_id UUID NOT NULL, -- ID of template/clone being processed
    item_type VARCHAR(50) NOT NULL,

    -- Status
    status VARCHAR(50) DEFAULT 'pending',

    -- Results
    result JSONB DEFAULT '{}'::jsonb,
    error_message TEXT,

    -- Timestamps
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT valid_item_status CHECK (status IN ('pending', 'processing', 'success', 'failed', 'skipped'))
);

CREATE INDEX idx_bulk_operation_items_operation ON bulk_operation_items(bulk_operation_id);
CREATE INDEX idx_bulk_operation_items_status ON bulk_operation_items(status);
CREATE INDEX idx_bulk_operation_items_item ON bulk_operation_items(item_id);

-- =====================================================================================
-- TABLE 3: template_export_packages
-- Track template export packages
-- =====================================================================================
CREATE TABLE IF NOT EXISTS template_export_packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Package Details
    package_name VARCHAR(200) NOT NULL,
    package_format VARCHAR(20) DEFAULT 'json', -- 'json', 'zip'

    -- Content Configuration
    template_ids UUID[] NOT NULL, -- Templates included
    include_versions BOOLEAN DEFAULT false,
    include_reviews BOOLEAN DEFAULT false,
    include_assets BOOLEAN DEFAULT true,
    include_analytics BOOLEAN DEFAULT false,

    -- Package Info
    package_size BIGINT, -- Size in bytes
    file_path TEXT, -- Server path to package file
    download_url TEXT, -- Temporary download URL
    download_count INTEGER DEFAULT 0,
    last_downloaded_at TIMESTAMPTZ,

    -- Status
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'processing', 'completed', 'failed'
    error_message TEXT,

    -- Expiry
    expires_at TIMESTAMPTZ, -- Auto-delete after expiry

    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT valid_package_format CHECK (package_format IN ('json', 'zip')),
    CONSTRAINT valid_export_status CHECK (status IN ('pending', 'processing', 'completed', 'failed'))
);

CREATE INDEX idx_template_export_user ON template_export_packages(user_id);
CREATE INDEX idx_template_export_status ON template_export_packages(status);
CREATE INDEX idx_template_export_expires ON template_export_packages(expires_at) WHERE expires_at IS NOT NULL;
CREATE INDEX idx_template_export_created ON template_export_packages(created_at DESC);

-- =====================================================================================
-- TABLE 4: template_import_jobs
-- Track template import jobs
-- =====================================================================================
CREATE TABLE IF NOT EXISTS template_import_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Source Details
    package_source VARCHAR(20) NOT NULL, -- 'file', 'url', 'export_package'
    package_format VARCHAR(20) NOT NULL,
    source_reference TEXT, -- File path, URL, or export package ID

    -- Status
    status VARCHAR(50) DEFAULT 'pending',

    -- Progress
    total_templates INTEGER DEFAULT 0,
    imported_templates INTEGER DEFAULT 0,
    failed_templates INTEGER DEFAULT 0,
    skipped_templates INTEGER DEFAULT 0,

    -- Import Configuration
    import_options JSONB DEFAULT '{}'::jsonb, -- overwrite, merge, skip, rename options
    conflict_resolution VARCHAR(50) DEFAULT 'skip', -- 'skip', 'overwrite', 'rename', 'merge'

    -- Results
    template_mappings JSONB DEFAULT '{}'::jsonb, -- Old ID -> New ID mapping
    error_log TEXT,
    warnings JSONB DEFAULT '[]'::jsonb,

    -- Timestamps
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT valid_package_source CHECK (package_source IN ('file', 'url', 'export_package')),
    CONSTRAINT valid_import_format CHECK (package_format IN ('json', 'zip')),
    CONSTRAINT valid_import_status CHECK (status IN ('pending', 'validating', 'processing', 'completed', 'failed', 'cancelled')),
    CONSTRAINT valid_conflict_resolution CHECK (conflict_resolution IN ('skip', 'overwrite', 'rename', 'merge'))
);

CREATE INDEX idx_template_import_user ON template_import_jobs(user_id);
CREATE INDEX idx_template_import_status ON template_import_jobs(status);
CREATE INDEX idx_template_import_created ON template_import_jobs(created_at DESC);

-- =====================================================================================
-- TABLE 5: scheduled_operations
-- Schedule operations for future execution
-- =====================================================================================
CREATE TABLE IF NOT EXISTS scheduled_operations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Operation Details
    operation_type VARCHAR(50) NOT NULL, -- 'clone', 'paste', 'export', 'bulk_operation', 'import'
    resource_id UUID, -- Template ID, Clone ID, Bulk Operation ID, etc.
    resource_type VARCHAR(50), -- 'template', 'clone', 'bulk_operation'

    -- Scheduling
    scheduled_for TIMESTAMPTZ NOT NULL,
    timezone VARCHAR(50) DEFAULT 'UTC',

    -- Recurrence
    repeat_interval VARCHAR(50) DEFAULT 'once', -- 'once', 'daily', 'weekly', 'monthly', 'custom'
    repeat_config JSONB DEFAULT '{}'::jsonb, -- Day of week, day of month, custom cron, etc.
    repeat_until TIMESTAMPTZ, -- End date for recurring schedules
    max_occurrences INTEGER, -- Alternative to repeat_until

    -- Status
    status VARCHAR(50) DEFAULT 'scheduled', -- 'scheduled', 'running', 'completed', 'failed', 'cancelled', 'paused'

    -- Configuration
    operation_config JSONB NOT NULL, -- Operation-specific parameters

    -- Execution Tracking
    last_run_at TIMESTAMPTZ,
    next_run_at TIMESTAMPTZ,
    run_count INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    failure_count INTEGER DEFAULT 0,

    -- Notifications
    notify_on_completion BOOLEAN DEFAULT false,
    notify_on_failure BOOLEAN DEFAULT true,
    notification_channels JSONB DEFAULT '["email"]'::jsonb, -- email, webhook, etc.

    -- Retry Logic
    retry_on_failure BOOLEAN DEFAULT true,
    max_retries INTEGER DEFAULT 3,
    retry_delay_minutes INTEGER DEFAULT 5,

    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT valid_operation_type_sched CHECK (operation_type IN ('clone', 'paste', 'export', 'bulk_operation', 'import')),
    CONSTRAINT valid_repeat_interval CHECK (repeat_interval IN ('once', 'daily', 'weekly', 'monthly', 'custom')),
    CONSTRAINT valid_sched_status CHECK (status IN ('scheduled', 'running', 'completed', 'failed', 'cancelled', 'paused'))
);

CREATE INDEX idx_scheduled_operations_user ON scheduled_operations(user_id);
CREATE INDEX idx_scheduled_operations_status ON scheduled_operations(status);
CREATE INDEX idx_scheduled_operations_next_run ON scheduled_operations(next_run_at) WHERE status IN ('scheduled', 'paused');
CREATE INDEX idx_scheduled_operations_type ON scheduled_operations(operation_type);
CREATE INDEX idx_scheduled_operations_created ON scheduled_operations(created_at DESC);

-- =====================================================================================
-- TABLE 6: scheduled_operation_runs
-- Execution history for scheduled operations
-- =====================================================================================
CREATE TABLE IF NOT EXISTS scheduled_operation_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scheduled_operation_id UUID NOT NULL REFERENCES scheduled_operations(id) ON DELETE CASCADE,

    -- Run Details
    run_number INTEGER NOT NULL,
    status VARCHAR(50) NOT NULL,

    -- Timing
    started_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    duration_ms INTEGER,

    -- Results
    result JSONB DEFAULT '{}'::jsonb,
    error_message TEXT,

    -- Retry Info
    is_retry BOOLEAN DEFAULT false,
    retry_attempt INTEGER DEFAULT 0,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT valid_run_status CHECK (status IN ('running', 'success', 'failed', 'cancelled'))
);

CREATE INDEX idx_scheduled_operation_runs_operation ON scheduled_operation_runs(scheduled_operation_id);
CREATE INDEX idx_scheduled_operation_runs_status ON scheduled_operation_runs(status);
CREATE INDEX idx_scheduled_operation_runs_started ON scheduled_operation_runs(started_at DESC);

-- =====================================================================================
-- FUNCTIONS
-- =====================================================================================

-- Function to update bulk operation progress
CREATE OR REPLACE FUNCTION update_bulk_operation_progress()
RETURNS TRIGGER AS $$
BEGIN
    -- Update the parent bulk operation when an item is processed
    UPDATE bulk_operations
    SET
        processed_items = (
            SELECT COUNT(*)
            FROM bulk_operation_items
            WHERE bulk_operation_id = NEW.bulk_operation_id
            AND status IN ('success', 'failed', 'skipped')
        ),
        successful_items = (
            SELECT COUNT(*)
            FROM bulk_operation_items
            WHERE bulk_operation_id = NEW.bulk_operation_id
            AND status = 'success'
        ),
        failed_items = (
            SELECT COUNT(*)
            FROM bulk_operation_items
            WHERE bulk_operation_id = NEW.bulk_operation_id
            AND status = 'failed'
        ),
        updated_at = NOW()
    WHERE id = NEW.bulk_operation_id;

    -- Auto-complete if all items processed
    UPDATE bulk_operations
    SET
        status = 'completed',
        completed_at = NOW()
    WHERE id = NEW.bulk_operation_id
    AND processed_items >= total_items
    AND status = 'processing';

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_bulk_operation_progress
    AFTER INSERT OR UPDATE ON bulk_operation_items
    FOR EACH ROW
    WHEN (NEW.status IN ('success', 'failed', 'skipped'))
    EXECUTE FUNCTION update_bulk_operation_progress();

-- Function to calculate next run time for scheduled operations
CREATE OR REPLACE FUNCTION calculate_next_run_time(
    p_scheduled_operation_id UUID,
    p_current_run_time TIMESTAMPTZ
) RETURNS TIMESTAMPTZ AS $$
DECLARE
    v_repeat_interval VARCHAR(50);
    v_repeat_config JSONB;
    v_timezone VARCHAR(50);
    v_next_run TIMESTAMPTZ;
BEGIN
    SELECT repeat_interval, repeat_config, timezone
    INTO v_repeat_interval, v_repeat_config, v_timezone
    FROM scheduled_operations
    WHERE id = p_scheduled_operation_id;

    CASE v_repeat_interval
        WHEN 'once' THEN
            RETURN NULL;
        WHEN 'daily' THEN
            RETURN p_current_run_time + INTERVAL '1 day';
        WHEN 'weekly' THEN
            RETURN p_current_run_time + INTERVAL '7 days';
        WHEN 'monthly' THEN
            RETURN p_current_run_time + INTERVAL '1 month';
        ELSE
            RETURN NULL;
    END CASE;
END;
$$ LANGUAGE plpgsql;

-- Function to get pending bulk operations
CREATE OR REPLACE FUNCTION get_pending_bulk_operations()
RETURNS TABLE(
    operation_id UUID,
    operation_type VARCHAR,
    user_id UUID,
    total_items INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT id, bulk_operations.operation_type, bulk_operations.user_id, bulk_operations.total_items
    FROM bulk_operations
    WHERE status = 'pending'
    ORDER BY created_at ASC
    LIMIT 10;
END;
$$ LANGUAGE plpgsql;

-- Function to get scheduled operations due for execution
CREATE OR REPLACE FUNCTION get_due_scheduled_operations()
RETURNS TABLE(
    operation_id UUID,
    user_id UUID,
    operation_type VARCHAR,
    operation_config JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT id, scheduled_operations.user_id, scheduled_operations.operation_type, scheduled_operations.operation_config
    FROM scheduled_operations
    WHERE status = 'scheduled'
    AND next_run_at <= NOW()
    ORDER BY next_run_at ASC
    LIMIT 10;
END;
$$ LANGUAGE plpgsql;

-- Function to cleanup expired exports
CREATE OR REPLACE FUNCTION cleanup_expired_exports()
RETURNS INTEGER AS $$
DECLARE
    v_deleted_count INTEGER;
BEGIN
    DELETE FROM template_export_packages
    WHERE expires_at IS NOT NULL
    AND expires_at < NOW()
    AND status = 'completed';

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RETURN v_deleted_count;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================================
-- TRIGGERS
-- =====================================================================================

-- Auto-update timestamps
CREATE OR REPLACE FUNCTION update_phase4b_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_bulk_operations_timestamp
    BEFORE UPDATE ON bulk_operations
    FOR EACH ROW
    EXECUTE FUNCTION update_phase4b_timestamp();

CREATE TRIGGER trigger_template_export_timestamp
    BEFORE UPDATE ON template_export_packages
    FOR EACH ROW
    EXECUTE FUNCTION update_phase4b_timestamp();

CREATE TRIGGER trigger_template_import_timestamp
    BEFORE UPDATE ON template_import_jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_phase4b_timestamp();

CREATE TRIGGER trigger_scheduled_operations_timestamp
    BEFORE UPDATE ON scheduled_operations
    FOR EACH ROW
    EXECUTE FUNCTION update_phase4b_timestamp();

-- =====================================================================================
-- INDEXES FOR PERFORMANCE
-- =====================================================================================

-- Additional composite indexes for common queries
CREATE INDEX idx_bulk_operations_user_status ON bulk_operations(user_id, status);
CREATE INDEX idx_scheduled_operations_user_status ON scheduled_operations(user_id, status);
CREATE INDEX idx_template_export_user_status ON template_export_packages(user_id, status);
CREATE INDEX idx_template_import_user_status ON template_import_jobs(user_id, status);

-- GIN indexes for JSONB columns
CREATE INDEX idx_bulk_operations_items_gin ON bulk_operations USING GIN (items);
CREATE INDEX idx_scheduled_operations_config_gin ON scheduled_operations USING GIN (operation_config);

-- =====================================================================================
-- COMMENTS
-- =====================================================================================

COMMENT ON TABLE bulk_operations IS 'Job queue for processing multiple items in bulk operations';
COMMENT ON TABLE bulk_operation_items IS 'Individual item tracking within bulk operations';
COMMENT ON TABLE template_export_packages IS 'Template export packages with configurable content';
COMMENT ON TABLE template_import_jobs IS 'Template import jobs with conflict resolution';
COMMENT ON TABLE scheduled_operations IS 'Scheduled operations with recurring support';
COMMENT ON TABLE scheduled_operation_runs IS 'Execution history for scheduled operations';

COMMENT ON FUNCTION update_bulk_operation_progress() IS 'Auto-updates bulk operation progress when items are processed';
COMMENT ON FUNCTION calculate_next_run_time(UUID, TIMESTAMPTZ) IS 'Calculates next execution time for recurring schedules';
COMMENT ON FUNCTION get_pending_bulk_operations() IS 'Returns pending bulk operations ready for processing';
COMMENT ON FUNCTION get_due_scheduled_operations() IS 'Returns scheduled operations due for execution';
COMMENT ON FUNCTION cleanup_expired_exports() IS 'Removes expired export packages';
