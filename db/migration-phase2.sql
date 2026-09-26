-- =============================================================================
-- SciLoop — Phase 2: Closed-Loop Agent Database Migration
-- Adds: belief_updates, campaign_state, experiment_dependencies
-- Run AFTER init.sql
-- =============================================================================

-- =============================================================================
-- BELIEF_UPDATES — Tracks every confidence change for reproducibility
-- Every time a hypothesis confidence changes, a record is logged here.
-- This creates an audit trail showing how the agent's understanding evolved.
-- =============================================================================
CREATE TABLE belief_updates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    hypothesis_id UUID NOT NULL REFERENCES hypotheses(id) ON DELETE CASCADE,
    experiment_id UUID REFERENCES experiments(id),

    -- Confidence transition
    previous_confidence FLOAT CHECK (previous_confidence >= 0 AND previous_confidence <= 1),
    new_confidence FLOAT NOT NULL CHECK (new_confidence >= 0 AND new_confidence <= 1),
    delta FLOAT GENERATED ALWAYS AS (new_confidence - COALESCE(previous_confidence, 0)) STORED,

    -- Status transition
    previous_status TEXT,
    new_status TEXT CHECK (new_status IN (
        'proposed', 'under_investigation', 'supported', 'refuted', 'inconclusive'
    )),

    -- What caused this update
    trigger_type TEXT NOT NULL CHECK (trigger_type IN (
        'evidence_added',        -- New evidence was found
        'evidence_contradicted', -- Contradictory evidence was found
        'experiment_completed',  -- An experiment produced results
        'critic_review',         -- The scientific critic reviewed findings
        'human_feedback',        -- A human reviewer provided input
        're_evaluation'          -- Periodic re-evaluation during re-planning
    )),

    -- The evidence that triggered the update (if applicable)
    triggering_evidence_ids UUID[] DEFAULT '{}',

    -- Agent's reasoning for the update
    reasoning TEXT NOT NULL,

    -- Provenance metadata
    provenance JSONB DEFAULT '{}',

    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_belief_updates_campaign ON belief_updates(campaign_id);
CREATE INDEX idx_belief_updates_hypothesis ON belief_updates(hypothesis_id);
CREATE INDEX idx_belief_updates_experiment ON belief_updates(experiment_id);
CREATE INDEX idx_belief_updates_time ON belief_updates(created_at);

-- =============================================================================
-- CAMPAIGN_STATE — Snapshots of the running campaign state
-- Each snapshot captures the full state of a campaign at a point in time,
-- enabling replay and comparison of how the campaign evolved.
-- =============================================================================
CREATE TABLE campaign_state (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,

    -- Loop iteration tracking
    iteration INTEGER NOT NULL DEFAULT 1,
    phase TEXT NOT NULL CHECK (phase IN (
        'planning',              -- Initial research plan creation
        'evidence_gathering',    -- Searching literature and databases
        'target_assessment',     -- Evaluating target biology
        'structure_analysis',    -- Retrieving and evaluating structures
        'candidate_search',      -- Finding candidate molecules
        'candidate_filtering',   -- Running sandbox filters
        'candidate_scoring',     -- Scoring and ranking
        'criticism',             -- Scientific critique
        'awaiting_approval',     -- Paused at a human gate
        're_planning',           -- Re-evaluating the plan based on results
        'report_generation',     -- Generating the final report
        'completed',             -- Campaign finished
        'failed'                 -- Campaign failed
    )),

    -- Aggregate state
    total_hypotheses INTEGER DEFAULT 0,
    supported_hypotheses INTEGER DEFAULT 0,
    refuted_hypotheses INTEGER DEFAULT 0,
    total_evidence INTEGER DEFAULT 0,
    total_experiments_run INTEGER DEFAULT 0,
    total_candidates INTEGER DEFAULT 0,
    candidates_passing_filters INTEGER DEFAULT 0,

    -- Budget tracking
    budget_used JSONB DEFAULT '{
        "literature_queries": 0,
        "database_queries": 0,
        "sandbox_executions": 0,
        "total_api_calls": 0,
        "elapsed_seconds": 0
    }',
    budget_remaining JSONB DEFAULT '{}',

    -- Active hypotheses with their current confidences
    hypothesis_snapshot JSONB DEFAULT '[]',

    -- What the agent decided to do next (null if completed)
    next_action JSONB,

    -- Stopping criteria evaluation
    stopping_criteria_met BOOLEAN DEFAULT false,
    stopping_reason TEXT,

    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_campaign_state_campaign ON campaign_state(campaign_id);
CREATE INDEX idx_campaign_state_iteration ON campaign_state(campaign_id, iteration);
CREATE INDEX idx_campaign_state_phase ON campaign_state(phase);

-- =============================================================================
-- EXPERIMENT_DEPENDENCIES — Tracks what feeds into what
-- Models the DAG of experiments: which experiments depend on the outputs
-- of which other experiments. Used by the experiment selector to determine
-- what can run next and to trace provenance chains.
-- =============================================================================
CREATE TABLE experiment_dependencies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,

    -- The experiment that produces output
    upstream_experiment_id UUID NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,

    -- The experiment that consumes the output
    downstream_experiment_id UUID NOT NULL REFERENCES experiments(id) ON DELETE CASCADE,

    -- What data flows between them
    dependency_type TEXT NOT NULL CHECK (dependency_type IN (
        'evidence',     -- Upstream produces evidence consumed downstream
        'candidates',   -- Upstream produces candidates consumed downstream
        'structure',    -- Upstream produces structure data consumed downstream
        'hypothesis',   -- Upstream refines hypothesis tested downstream
        'policy'        -- Upstream policy decision gates downstream
    )),

    -- Whether this dependency is satisfied
    satisfied BOOLEAN DEFAULT false,
    satisfied_at TIMESTAMPTZ,

    created_at TIMESTAMPTZ DEFAULT now(),

    -- Prevent duplicate edges
    UNIQUE (upstream_experiment_id, downstream_experiment_id, dependency_type)
);

CREATE INDEX idx_exp_deps_campaign ON experiment_dependencies(campaign_id);
CREATE INDEX idx_exp_deps_upstream ON experiment_dependencies(upstream_experiment_id);
CREATE INDEX idx_exp_deps_downstream ON experiment_dependencies(downstream_experiment_id);

-- =============================================================================
-- CAMPAIGN_POLICIES — Stores per-campaign policy constraints
-- =============================================================================
CREATE TABLE campaign_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,

    -- Budget limits
    max_literature_queries INTEGER DEFAULT 50,
    max_database_queries INTEGER DEFAULT 100,
    max_sandbox_executions INTEGER DEFAULT 20,
    max_iterations INTEGER DEFAULT 5,
    max_duration_seconds INTEGER DEFAULT 3600,

    -- Evidence requirements
    min_evidence_for_support INTEGER DEFAULT 3,
    min_confidence_for_support FLOAT DEFAULT 0.7,
    require_contradiction_search BOOLEAN DEFAULT true,

    -- Allowed tools (null = all allowed)
    allowed_tools TEXT[],
    forbidden_tools TEXT[],

    -- Stopping criteria
    stop_on_confidence_threshold FLOAT DEFAULT 0.9,
    stop_on_all_hypotheses_resolved BOOLEAN DEFAULT true,
    stop_on_budget_exhausted BOOLEAN DEFAULT true,

    -- Approval gates
    require_plan_approval BOOLEAN DEFAULT true,
    require_candidate_approval BOOLEAN DEFAULT true,
    require_report_approval BOOLEAN DEFAULT true,

    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_campaign_policies_campaign ON campaign_policies(campaign_id);

-- Add trigger for updated_at
CREATE TRIGGER trg_campaign_policies_updated
    BEFORE UPDATE ON campaign_policies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- Add new experiment types for Phase 2
-- =============================================================================
ALTER TABLE experiments
    DROP CONSTRAINT IF EXISTS experiments_experiment_type_check;

ALTER TABLE experiments
    ADD CONSTRAINT experiments_experiment_type_check
    CHECK (experiment_type IN (
        'literature_search', 'target_assessment', 'structure_retrieval',
        'compound_search', 'molecular_filtering', 'molecular_scoring',
        'scientific_critique',
        -- Phase 2 additions
        'hypothesis_generation', 'belief_update', 're_planning',
        'contradiction_search', 'selectivity_check'
    ));

-- =============================================================================
-- Add iteration tracking to campaigns
-- =============================================================================
ALTER TABLE campaigns
    ADD COLUMN IF NOT EXISTS current_iteration INTEGER DEFAULT 1,
    ADD COLUMN IF NOT EXISTS max_iterations INTEGER DEFAULT 5,
    ADD COLUMN IF NOT EXISTS current_phase TEXT DEFAULT 'planning';
