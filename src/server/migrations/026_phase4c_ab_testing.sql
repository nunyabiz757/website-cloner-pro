-- =====================================================================================
-- Phase 4C: A/B Testing System
-- =====================================================================================
-- This migration creates infrastructure for:
-- 1. A/B Test Experiments - Create and manage multi-variant tests
-- 2. Variant Management - Template variants for testing
-- 3. Result Tracking - Event and conversion tracking
-- 4. Statistical Analysis - Calculate significance and determine winners
-- =====================================================================================

-- =====================================================================================
-- TABLE 1: ab_test_experiments
-- A/B test experiments
-- =====================================================================================
CREATE TABLE IF NOT EXISTS ab_test_experiments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    -- Experiment Details
    name VARCHAR(200) NOT NULL,
    description TEXT,
    template_id UUID REFERENCES templates(id) ON DELETE SET NULL, -- Base template

    -- Status
    status VARCHAR(50) DEFAULT 'draft', -- 'draft', 'running', 'paused', 'completed', 'archived'

    -- Schedule
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    actual_start_date TIMESTAMPTZ,
    actual_end_date TIMESTAMPTZ,

    -- Goal Configuration
    goal_metric VARCHAR(50) NOT NULL, -- 'downloads', 'uses', 'rating', 'conversion', 'engagement'
    goal_target DECIMAL(10,2),

    -- Statistical Configuration
    confidence_level DECIMAL(5,2) DEFAULT 95.00, -- 95% confidence
    min_sample_size INTEGER DEFAULT 100,

    -- Traffic Configuration
    traffic_split JSONB DEFAULT '{}'::jsonb, -- {"A": 50, "B": 50}
    total_traffic INTEGER DEFAULT 0,

    -- Winner Determination
    winner_variant_id UUID REFERENCES ab_test_variants(id),
    winner_determined_at TIMESTAMPTZ,
    auto_apply_winner BOOLEAN DEFAULT false,

    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT valid_status CHECK (status IN ('draft', 'running', 'paused', 'completed', 'archived')),
    CONSTRAINT valid_goal_metric CHECK (goal_metric IN ('downloads', 'uses', 'rating', 'conversion', 'engagement')),
    CONSTRAINT valid_confidence_level CHECK (confidence_level >= 50.00 AND confidence_level <= 99.99)
);

CREATE INDEX idx_ab_test_experiments_user ON ab_test_experiments(user_id);
CREATE INDEX idx_ab_test_experiments_status ON ab_test_experiments(status);
CREATE INDEX idx_ab_test_experiments_template ON ab_test_experiments(template_id);
CREATE INDEX idx_ab_test_experiments_dates ON ab_test_experiments(start_date, end_date);
CREATE INDEX idx_ab_test_experiments_created ON ab_test_experiments(created_at DESC);

-- =====================================================================================
-- TABLE 2: ab_test_variants
-- Variants for A/B tests
-- =====================================================================================
CREATE TABLE IF NOT EXISTS ab_test_variants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    experiment_id UUID NOT NULL REFERENCES ab_test_experiments(id) ON DELETE CASCADE,

    -- Variant Details
    variant_name VARCHAR(50) NOT NULL, -- 'A', 'B', 'C', etc.
    template_id UUID NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
    is_control BOOLEAN DEFAULT false,
    description TEXT,

    -- Traffic Allocation
    traffic_percentage DECIMAL(5,2) DEFAULT 50.00,
    current_traffic INTEGER DEFAULT 0,

    -- Configuration
    variant_config JSONB DEFAULT '{}'::jsonb, -- Variant-specific settings

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(experiment_id, variant_name),
    CONSTRAINT valid_traffic_percentage CHECK (traffic_percentage >= 0 AND traffic_percentage <= 100)
);

CREATE INDEX idx_ab_test_variants_experiment ON ab_test_variants(experiment_id);
CREATE INDEX idx_ab_test_variants_template ON ab_test_variants(template_id);
CREATE INDEX idx_ab_test_variants_control ON ab_test_variants(is_control) WHERE is_control = true;

-- =====================================================================================
-- TABLE 3: ab_test_results
-- Event tracking for A/B tests
-- =====================================================================================
CREATE TABLE IF NOT EXISTS ab_test_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    experiment_id UUID NOT NULL REFERENCES ab_test_experiments(id) ON DELETE CASCADE,
    variant_id UUID NOT NULL REFERENCES ab_test_variants(id) ON DELETE CASCADE,

    -- User/Session Tracking
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    session_id VARCHAR(255) NOT NULL,

    -- Event Details
    event_type VARCHAR(50) NOT NULL, -- 'view', 'download', 'use', 'rate', 'conversion', 'click'
    event_value DECIMAL(10,2), -- For ratings, conversion values, etc.

    -- Additional Data
    metadata JSONB DEFAULT '{}'::jsonb,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT valid_event_type CHECK (event_type IN ('view', 'download', 'use', 'rate', 'conversion', 'click', 'engagement'))
);

CREATE INDEX idx_ab_test_results_experiment ON ab_test_results(experiment_id);
CREATE INDEX idx_ab_test_results_variant ON ab_test_results(variant_id);
CREATE INDEX idx_ab_test_results_user ON ab_test_results(user_id);
CREATE INDEX idx_ab_test_results_session ON ab_test_results(session_id);
CREATE INDEX idx_ab_test_results_event ON ab_test_results(event_type);
CREATE INDEX idx_ab_test_results_created ON ab_test_results(created_at DESC);

-- =====================================================================================
-- TABLE 4: ab_test_statistics
-- Computed statistics for A/B tests
-- =====================================================================================
CREATE TABLE IF NOT EXISTS ab_test_statistics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    experiment_id UUID NOT NULL REFERENCES ab_test_experiments(id) ON DELETE CASCADE,
    variant_id UUID NOT NULL REFERENCES ab_test_variants(id) ON DELETE CASCADE,

    -- Date
    date DATE NOT NULL,

    -- Metrics
    total_views INTEGER DEFAULT 0,
    total_conversions INTEGER DEFAULT 0,
    total_engagements INTEGER DEFAULT 0,
    conversion_rate DECIMAL(5,2) DEFAULT 0.00,
    avg_rating DECIMAL(3,2),

    -- Statistical Analysis
    sample_size INTEGER DEFAULT 0,
    standard_error DECIMAL(10,6),
    z_score DECIMAL(10,6),
    p_value DECIMAL(10,8),
    statistical_significance DECIMAL(5,2), -- Percentage
    is_significant BOOLEAN DEFAULT false,

    -- Winner Determination
    is_winner BOOLEAN DEFAULT false,
    performance_lift DECIMAL(10,2), -- % improvement over control

    -- Computed
    computed_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(experiment_id, variant_id, date)
);

CREATE INDEX idx_ab_test_statistics_experiment ON ab_test_statistics(experiment_id);
CREATE INDEX idx_ab_test_statistics_variant ON ab_test_statistics(variant_id);
CREATE INDEX idx_ab_test_statistics_date ON ab_test_statistics(date DESC);
CREATE INDEX idx_ab_test_statistics_winner ON ab_test_statistics(is_winner) WHERE is_winner = true;

-- =====================================================================================
-- TABLE 5: ab_test_user_assignments
-- Track which variant each user/session sees
-- =====================================================================================
CREATE TABLE IF NOT EXISTS ab_test_user_assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    experiment_id UUID NOT NULL REFERENCES ab_test_experiments(id) ON DELETE CASCADE,
    variant_id UUID NOT NULL REFERENCES ab_test_variants(id) ON DELETE CASCADE,

    -- User/Session
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    session_id VARCHAR(255) NOT NULL,

    -- Assignment
    assigned_at TIMESTAMPTZ DEFAULT NOW(),
    sticky BOOLEAN DEFAULT true, -- Keep same variant for duration

    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,

    UNIQUE(experiment_id, session_id)
);

CREATE INDEX idx_ab_test_assignments_experiment ON ab_test_user_assignments(experiment_id);
CREATE INDEX idx_ab_test_assignments_variant ON ab_test_user_assignments(variant_id);
CREATE INDEX idx_ab_test_assignments_user ON ab_test_user_assignments(user_id);
CREATE INDEX idx_ab_test_assignments_session ON ab_test_user_assignments(session_id);

-- =====================================================================================
-- FUNCTIONS
-- =====================================================================================

-- Function to assign variant to user/session
CREATE OR REPLACE FUNCTION assign_ab_test_variant(
    p_experiment_id UUID,
    p_user_id UUID,
    p_session_id VARCHAR
) RETURNS UUID AS $$
DECLARE
    v_variant_id UUID;
    v_existing_assignment UUID;
    v_random_num DECIMAL;
    v_cumulative_percentage DECIMAL := 0;
    v_variant RECORD;
BEGIN
    -- Check if user/session already assigned (sticky assignment)
    SELECT variant_id INTO v_existing_assignment
    FROM ab_test_user_assignments
    WHERE experiment_id = p_experiment_id
    AND session_id = p_session_id;

    IF v_existing_assignment IS NOT NULL THEN
        RETURN v_existing_assignment;
    END IF;

    -- Get random number for traffic split
    v_random_num := RANDOM() * 100;

    -- Assign variant based on traffic split
    FOR v_variant IN
        SELECT id, traffic_percentage
        FROM ab_test_variants
        WHERE experiment_id = p_experiment_id
        ORDER BY created_at
    LOOP
        v_cumulative_percentage := v_cumulative_percentage + v_variant.traffic_percentage;

        IF v_random_num <= v_cumulative_percentage THEN
            v_variant_id := v_variant.id;
            EXIT;
        END IF;
    END LOOP;

    -- Create assignment
    INSERT INTO ab_test_user_assignments (
        experiment_id, variant_id, user_id, session_id
    ) VALUES (
        p_experiment_id, v_variant_id, p_user_id, p_session_id
    ) ON CONFLICT (experiment_id, session_id) DO NOTHING;

    -- Update traffic count
    UPDATE ab_test_variants
    SET current_traffic = current_traffic + 1
    WHERE id = v_variant_id;

    UPDATE ab_test_experiments
    SET total_traffic = total_traffic + 1
    WHERE id = p_experiment_id;

    RETURN v_variant_id;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate statistics
CREATE OR REPLACE FUNCTION calculate_ab_test_statistics(
    p_experiment_id UUID,
    p_date DATE
) RETURNS VOID AS $$
DECLARE
    v_variant RECORD;
    v_control_conversion_rate DECIMAL;
BEGIN
    -- Get control variant conversion rate
    SELECT
        CASE
            WHEN total_views > 0 THEN (total_conversions::DECIMAL / total_views) * 100
            ELSE 0
        END INTO v_control_conversion_rate
    FROM ab_test_statistics
    WHERE experiment_id = p_experiment_id
    AND date = p_date
    AND variant_id IN (
        SELECT id FROM ab_test_variants
        WHERE experiment_id = p_experiment_id
        AND is_control = true
    );

    -- Calculate stats for each variant
    FOR v_variant IN
        SELECT v.id as variant_id
        FROM ab_test_variants v
        WHERE v.experiment_id = p_experiment_id
    LOOP
        INSERT INTO ab_test_statistics (
            experiment_id, variant_id, date,
            total_views, total_conversions, conversion_rate,
            sample_size, performance_lift
        )
        SELECT
            p_experiment_id,
            v_variant.variant_id,
            p_date,
            COUNT(*) FILTER (WHERE event_type = 'view'),
            COUNT(*) FILTER (WHERE event_type = 'conversion'),
            CASE
                WHEN COUNT(*) FILTER (WHERE event_type = 'view') > 0
                THEN (COUNT(*) FILTER (WHERE event_type = 'conversion')::DECIMAL / COUNT(*) FILTER (WHERE event_type = 'view')) * 100
                ELSE 0
            END,
            COUNT(*),
            CASE
                WHEN v_control_conversion_rate > 0
                THEN ((CASE
                    WHEN COUNT(*) FILTER (WHERE event_type = 'view') > 0
                    THEN (COUNT(*) FILTER (WHERE event_type = 'conversion')::DECIMAL / COUNT(*) FILTER (WHERE event_type = 'view')) * 100
                    ELSE 0
                END - v_control_conversion_rate) / v_control_conversion_rate) * 100
                ELSE 0
            END
        FROM ab_test_results
        WHERE experiment_id = p_experiment_id
        AND variant_id = v_variant.variant_id
        AND created_at::DATE = p_date
        ON CONFLICT (experiment_id, variant_id, date)
        DO UPDATE SET
            total_views = EXCLUDED.total_views,
            total_conversions = EXCLUDED.total_conversions,
            conversion_rate = EXCLUDED.conversion_rate,
            sample_size = EXCLUDED.sample_size,
            performance_lift = EXCLUDED.performance_lift,
            computed_at = NOW();
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Function to determine winner
CREATE OR REPLACE FUNCTION determine_ab_test_winner(
    p_experiment_id UUID
) RETURNS UUID AS $$
DECLARE
    v_winner_variant_id UUID;
    v_confidence_level DECIMAL;
    v_min_sample_size INTEGER;
BEGIN
    -- Get experiment configuration
    SELECT confidence_level, min_sample_size
    INTO v_confidence_level, v_min_sample_size
    FROM ab_test_experiments
    WHERE id = p_experiment_id;

    -- Find variant with highest conversion rate and sufficient sample size
    SELECT variant_id INTO v_winner_variant_id
    FROM ab_test_statistics
    WHERE experiment_id = p_experiment_id
    AND sample_size >= v_min_sample_size
    AND statistical_significance >= v_confidence_level
    ORDER BY conversion_rate DESC, performance_lift DESC
    LIMIT 1;

    -- Update experiment with winner
    IF v_winner_variant_id IS NOT NULL THEN
        UPDATE ab_test_experiments
        SET winner_variant_id = v_winner_variant_id,
            winner_determined_at = NOW(),
            status = 'completed'
        WHERE id = p_experiment_id;

        -- Mark winner in statistics
        UPDATE ab_test_statistics
        SET is_winner = true
        WHERE experiment_id = p_experiment_id
        AND variant_id = v_winner_variant_id;
    END IF;

    RETURN v_winner_variant_id;
END;
$$ LANGUAGE plpgsql;

-- Function to get experiment summary
CREATE OR REPLACE FUNCTION get_ab_test_summary(
    p_experiment_id UUID
) RETURNS TABLE(
    variant_name VARCHAR,
    total_views BIGINT,
    total_conversions BIGINT,
    conversion_rate DECIMAL,
    performance_lift DECIMAL,
    is_winner BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        v.variant_name,
        SUM(s.total_views)::BIGINT,
        SUM(s.total_conversions)::BIGINT,
        AVG(s.conversion_rate)::DECIMAL,
        AVG(s.performance_lift)::DECIMAL,
        MAX(s.is_winner)::BOOLEAN
    FROM ab_test_variants v
    JOIN ab_test_statistics s ON s.variant_id = v.id
    WHERE v.experiment_id = p_experiment_id
    GROUP BY v.id, v.variant_name
    ORDER BY AVG(s.conversion_rate) DESC;
END;
$$ LANGUAGE plpgsql;

-- =====================================================================================
-- TRIGGERS
-- =====================================================================================

-- Auto-update timestamps
CREATE OR REPLACE FUNCTION update_phase4c_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_ab_test_experiments_timestamp
    BEFORE UPDATE ON ab_test_experiments
    FOR EACH ROW
    EXECUTE FUNCTION update_phase4c_timestamp();

CREATE TRIGGER trigger_ab_test_variants_timestamp
    BEFORE UPDATE ON ab_test_variants
    FOR EACH ROW
    EXECUTE FUNCTION update_phase4c_timestamp();

-- =====================================================================================
-- COMMENTS
-- =====================================================================================

COMMENT ON TABLE ab_test_experiments IS 'A/B test experiments for multi-variant testing';
COMMENT ON TABLE ab_test_variants IS 'Template variants for A/B testing';
COMMENT ON TABLE ab_test_results IS 'Event tracking for A/B test results';
COMMENT ON TABLE ab_test_statistics IS 'Computed statistics and statistical analysis';
COMMENT ON TABLE ab_test_user_assignments IS 'User/session variant assignments with sticky sessions';

COMMENT ON FUNCTION assign_ab_test_variant(UUID, UUID, VARCHAR) IS 'Assigns variant to user/session based on traffic split';
COMMENT ON FUNCTION calculate_ab_test_statistics(UUID, DATE) IS 'Calculates daily statistics for experiment variants';
COMMENT ON FUNCTION determine_ab_test_winner(UUID) IS 'Determines winning variant based on statistical significance';
COMMENT ON FUNCTION get_ab_test_summary(UUID) IS 'Returns summary statistics for experiment';
