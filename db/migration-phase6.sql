-- =============================================================================
-- SciLoop — Phase 6: Experimental Feedback Migration
-- Adds: experimental_results, prediction_mappings, calibration_records,
--        feedback_summaries, feedback_transfers
-- Run AFTER init.sql, migration-phase2.sql, migration-phase4.sql,
--        migration-phase5.sql
-- =============================================================================

-- =============================================================================
-- EXPERIMENTAL_RESULTS — Validated wet-lab / experimental observations
-- The highest-trust evidence type in the SciLoop evidence hierarchy
-- =============================================================================
CREATE TABLE IF NOT EXISTS experimental_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    assay_type TEXT NOT NULL CHECK (assay_type IN (
        'binding_affinity', 'enzymatic_inhibition', 'cell_viability',
        'selectivity_panel', 'admet_experimental', 'in_vivo_efficacy'
    )),
    assay_description TEXT,
    measurements JSONB NOT NULL DEFAULT '{}',
    activity_classification JSONB NOT NULL DEFAULT '{"label": "unknown"}',
    conditions JSONB DEFAULT '{}',
    lab_notebook_ref TEXT NOT NULL,
    performed_by TEXT NOT NULL,
    protocol_reference TEXT,
    replicate_count INTEGER DEFAULT 1 CHECK (replicate_count >= 1),
    quality_metrics JSONB DEFAULT '{}',
    validation_status JSONB DEFAULT '{"status": "acceptable"}',
    evidence_type TEXT DEFAULT 'experimentally_validated',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exp_results_campaign ON experimental_results(campaign_id);
CREATE INDEX IF NOT EXISTS idx_exp_results_candidate ON experimental_results(candidate_id);
CREATE INDEX IF NOT EXISTS idx_exp_results_assay ON experimental_results(assay_type);
CREATE INDEX IF NOT EXISTS idx_exp_results_activity
    ON experimental_results((activity_classification->>'label'));

-- =============================================================================
-- PREDICTION_MAPPINGS — Links computational predictions to experimental results
-- Enables calibration: prediction vs observed, error metrics
-- =============================================================================
CREATE TABLE IF NOT EXISTS prediction_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    result_id UUID NOT NULL REFERENCES experimental_results(id) ON DELETE CASCADE,
    candidate_id UUID NOT NULL REFERENCES candidates(id) ON DELETE CASCADE,
    prediction_type TEXT NOT NULL,
    predicted_value FLOAT NOT NULL,
    observed_value FLOAT NOT NULL,
    prediction_source TEXT NOT NULL,
    prediction_metadata JSONB DEFAULT '{}',
    error_metrics JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pred_map_campaign ON prediction_mappings(campaign_id);
CREATE INDEX IF NOT EXISTS idx_pred_map_result ON prediction_mappings(result_id);
CREATE INDEX IF NOT EXISTS idx_pred_map_source ON prediction_mappings(prediction_source);

-- =============================================================================
-- CALIBRATION_RECORDS — Calibration state for each prediction source
-- Tracks how well each prediction tool matches reality over time
-- =============================================================================
CREATE TABLE IF NOT EXISTS calibration_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source TEXT NOT NULL,
    target_class TEXT DEFAULT 'all',
    data_points INTEGER NOT NULL CHECK (data_points >= 0),
    status TEXT NOT NULL CHECK (status IN ('calibrated', 'insufficient_data')),
    regression_metrics JSONB NOT NULL DEFAULT '{}',
    binary_metrics JSONB,
    adjusted_confidence_weight FLOAT NOT NULL CHECK (
        adjusted_confidence_weight >= 0 AND adjusted_confidence_weight <= 1
    ),
    previous_confidence_weight FLOAT CHECK (
        previous_confidence_weight >= 0 AND previous_confidence_weight <= 1
    ),
    calibration_interval JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calib_source ON calibration_records(source);
CREATE INDEX IF NOT EXISTS idx_calib_class ON calibration_records(target_class);

-- =============================================================================
-- FEEDBACK_SUMMARIES — Aggregate campaign feedback with hit rates and lessons
-- =============================================================================
CREATE TABLE IF NOT EXISTS feedback_summaries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    total_results INTEGER DEFAULT 0,
    total_mappings INTEGER DEFAULT 0,
    hit_rate JSONB NOT NULL DEFAULT '{}',
    prediction_accuracy JSONB NOT NULL DEFAULT '{}',
    assay_breakdown JSONB DEFAULT '{}',
    lessons JSONB DEFAULT '[]',
    evidence_type TEXT DEFAULT 'experimentally_validated',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_feedback_summary_campaign
    ON feedback_summaries(campaign_id);

-- =============================================================================
-- FEEDBACK_TRANSFERS — Cross-campaign knowledge transfer records
-- Carries lessons and calibration corrections from one campaign to the next
-- =============================================================================
CREATE TABLE IF NOT EXISTS feedback_transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    target_campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    hit_rate_from_source FLOAT,
    confidence_weight_adjustments JSONB DEFAULT '{}',
    scoring_bias_corrections JSONB DEFAULT '{}',
    lessons JSONB DEFAULT '[]',
    recommended_assay_order JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fb_transfer_source ON feedback_transfers(source_campaign_id);
CREATE INDEX IF NOT EXISTS idx_fb_transfer_target ON feedback_transfers(target_campaign_id);
