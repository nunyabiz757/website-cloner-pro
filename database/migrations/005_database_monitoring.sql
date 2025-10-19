-- Database Monitoring and Audit Tables Migration
-- Creates tables for database audit logs and slow query logs

-- Database Audit Logs Table
CREATE TABLE IF NOT EXISTS database_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    audit_id VARCHAR(255) UNIQUE NOT NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    operation VARCHAR(50) NOT NULL, -- SELECT, INSERT, UPDATE, DELETE, etc.
    table_name VARCHAR(255),
    record_id VARCHAR(255),
    query TEXT NOT NULL,
    parameters JSONB,
    row_count INTEGER DEFAULT 0,
    duration INTEGER NOT NULL, -- Duration in milliseconds
    success BOOLEAN NOT NULL,
    error TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_audit_logs_user_id (user_id),
    INDEX idx_audit_logs_operation (operation),
    INDEX idx_audit_logs_table_name (table_name),
    INDEX idx_audit_logs_created_at (created_at),
    INDEX idx_audit_logs_success (success)
);

-- Slow Query Logs Table
CREATE TABLE IF NOT EXISTS slow_query_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    query_id VARCHAR(255) UNIQUE NOT NULL,
    query TEXT NOT NULL,
    parameters JSONB,
    duration INTEGER NOT NULL, -- Duration in milliseconds
    threshold INTEGER NOT NULL, -- Slow query threshold that triggered this log
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    operation VARCHAR(50),
    table_name VARCHAR(255),
    row_count INTEGER,
    execution_plan JSONB, -- EXPLAIN output
    stack_trace TEXT,
    context JSONB, -- Additional context
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_slow_queries_duration (duration),
    INDEX idx_slow_queries_operation (operation),
    INDEX idx_slow_queries_table_name (table_name),
    INDEX idx_slow_queries_created_at (created_at),
    INDEX idx_slow_queries_user_id (user_id)
);

-- Function to cleanup old audit logs
CREATE OR REPLACE FUNCTION cleanup_old_audit_logs(retention_days INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM database_audit_logs
    WHERE created_at < NOW() - (retention_days || ' days')::INTERVAL;

    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to cleanup old slow query logs
CREATE OR REPLACE FUNCTION cleanup_old_slow_queries(retention_days INTEGER DEFAULT 30)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM slow_query_logs
    WHERE created_at < NOW() - (retention_days || ' days')::INTERVAL;

    GET DIAGNOSTICS deleted_count = ROW_COUNT;

    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Function to get slow query statistics
CREATE OR REPLACE FUNCTION get_slow_query_stats(days INTEGER DEFAULT 7)
RETURNS TABLE (
    operation VARCHAR,
    table_name VARCHAR,
    query_count BIGINT,
    avg_duration NUMERIC,
    max_duration INTEGER,
    min_duration INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        sq.operation,
        sq.table_name,
        COUNT(*)::BIGINT as query_count,
        ROUND(AVG(sq.duration)::NUMERIC, 2) as avg_duration,
        MAX(sq.duration) as max_duration,
        MIN(sq.duration) as min_duration
    FROM slow_query_logs sq
    WHERE sq.created_at >= NOW() - (days || ' days')::INTERVAL
    GROUP BY sq.operation, sq.table_name
    ORDER BY avg_duration DESC;
END;
$$ LANGUAGE plpgsql;

-- Function to get database audit statistics
CREATE OR REPLACE FUNCTION get_audit_stats(days INTEGER DEFAULT 7)
RETURNS TABLE (
    operation VARCHAR,
    table_name VARCHAR,
    total_queries BIGINT,
    successful_queries BIGINT,
    failed_queries BIGINT,
    avg_duration NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        dal.operation,
        dal.table_name,
        COUNT(*)::BIGINT as total_queries,
        COUNT(*) FILTER (WHERE dal.success = TRUE)::BIGINT as successful_queries,
        COUNT(*) FILTER (WHERE dal.success = FALSE)::BIGINT as failed_queries,
        ROUND(AVG(dal.duration)::NUMERIC, 2) as avg_duration
    FROM database_audit_logs dal
    WHERE dal.created_at >= NOW() - (days || ' days')::INTERVAL
    GROUP BY dal.operation, dal.table_name
    ORDER BY total_queries DESC;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically partition audit logs by month (optional for large datasets)
-- This is commented out but can be enabled for high-volume systems

-- CREATE OR REPLACE FUNCTION create_audit_log_partition()
-- RETURNS TRIGGER AS $$
-- DECLARE
--     partition_date TEXT;
--     partition_name TEXT;
-- BEGIN
--     partition_date := TO_CHAR(NEW.created_at, 'YYYY_MM');
--     partition_name := 'database_audit_logs_' || partition_date;
--
--     IF NOT EXISTS (
--         SELECT 1 FROM pg_tables
--         WHERE tablename = partition_name
--     ) THEN
--         EXECUTE FORMAT(
--             'CREATE TABLE %I PARTITION OF database_audit_logs
--              FOR VALUES FROM (%L) TO (%L)',
--             partition_name,
--             DATE_TRUNC('month', NEW.created_at),
--             DATE_TRUNC('month', NEW.created_at) + INTERVAL '1 month'
--         );
--     END IF;
--
--     RETURN NEW;
-- END;
-- $$ LANGUAGE plpgsql;

-- Grant necessary permissions
GRANT SELECT, INSERT ON database_audit_logs TO PUBLIC;
GRANT SELECT, INSERT ON slow_query_logs TO PUBLIC;

-- Add comments for documentation
COMMENT ON TABLE database_audit_logs IS 'Audit log for all database operations';
COMMENT ON TABLE slow_query_logs IS 'Log of slow queries exceeding threshold';
COMMENT ON COLUMN database_audit_logs.audit_id IS 'Unique identifier for audit entry';
COMMENT ON COLUMN database_audit_logs.operation IS 'Database operation type (SELECT, INSERT, UPDATE, DELETE, etc.)';
COMMENT ON COLUMN database_audit_logs.duration IS 'Query execution duration in milliseconds';
COMMENT ON COLUMN slow_query_logs.execution_plan IS 'PostgreSQL EXPLAIN output for query optimization';
COMMENT ON COLUMN slow_query_logs.threshold IS 'Threshold in milliseconds that triggered this slow query log';

-- Create view for recent audit activity
CREATE OR REPLACE VIEW recent_audit_activity AS
SELECT
    dal.audit_id,
    dal.operation,
    dal.table_name,
    dal.duration,
    dal.success,
    dal.created_at,
    u.email as user_email
FROM database_audit_logs dal
LEFT JOIN users u ON dal.user_id = u.id
WHERE dal.created_at >= NOW() - INTERVAL '24 hours'
ORDER BY dal.created_at DESC
LIMIT 100;

-- Create view for critical slow queries
CREATE OR REPLACE VIEW critical_slow_queries AS
SELECT
    sq.query_id,
    sq.query,
    sq.duration,
    sq.operation,
    sq.table_name,
    sq.created_at,
    u.email as user_email
FROM slow_query_logs sq
LEFT JOIN users u ON sq.user_id = u.id
WHERE sq.duration >= 5000 -- 5 seconds or more
ORDER BY sq.duration DESC
LIMIT 50;

-- Create materialized view for query performance dashboard (refresh hourly)
CREATE MATERIALIZED VIEW IF NOT EXISTS query_performance_summary AS
SELECT
    DATE_TRUNC('hour', created_at) as hour,
    operation,
    table_name,
    COUNT(*) as query_count,
    ROUND(AVG(duration)::NUMERIC, 2) as avg_duration,
    MAX(duration) as max_duration,
    MIN(duration) as min_duration,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY duration) as p95_duration,
    PERCENTILE_CONT(0.99) WITHIN GROUP (ORDER BY duration) as p99_duration
FROM slow_query_logs
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE_TRUNC('hour', created_at), operation, table_name;

-- Create unique index on materialized view for concurrent refresh
CREATE UNIQUE INDEX IF NOT EXISTS idx_query_perf_summary_unique
ON query_performance_summary (hour, operation, COALESCE(table_name, ''));

-- Function to refresh materialized view
CREATE OR REPLACE FUNCTION refresh_query_performance_summary()
RETURNS void AS $$
BEGIN
    REFRESH MATERIALIZED VIEW CONCURRENTLY query_performance_summary;
END;
$$ LANGUAGE plpgsql;

COMMENT ON MATERIALIZED VIEW query_performance_summary IS 'Hourly summary of query performance metrics for dashboard';
