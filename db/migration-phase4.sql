-- =============================================================================
-- SciLoop — Phase 4: Search & Self-Improvement Database Migration
-- Adds: candidate_optimizations, selectivity_profiles, admet_profiles, pareto_frontiers
-- Run AFTER init.sql and migration-phase2.sql
-- =============================================================================

-- =============================================================================
-- CANDIDATE_OPTIMIZATIONS — Tracks generative modification cycles
-- Records parent -> offspring candidate modifications, mutation types,
-- hypotheses/rationales, and generational tracking.
-- =============================================================================
CREATE TABLE IF NOT EXISTS candidate_optimizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    generation INTEGER NOT NULL DEFAULT 1,
    parent_candidate_id UUID REFERENCES candidates(id) ON DELETE SET NULL,
    parent_smiles TEXT,
    modification_type TEXT NOT NULL CHECK (modification_type IN (
        'bioisosteric_replacement',
        'scaffold_hopping',
        'functional_group_addition',
        'functional_group_deletion',
        'ring_modification',
        'fragment_crossover',
        'solubilizing_group_addition'
    )),
    transformation_rule TEXT,
    mutated_smiles TEXT NOT NULL,
    rationale TEXT NOT NULL,
    target_property TEXT CHECK (target_property IN (
        'activity', 'selectivity', 'solubility', 'metabolic_stability',
        'permeability', 'toxicity_reduction', 'synthetic_accessibility'
    )),
    fitness_delta FLOAT,
    pareto_rank INTEGER DEFAULT 1,
    evidence_type TEXT DEFAULT 'computational_prediction',
    provenance JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cand_opt_campaign ON candidate_optimizations(campaign_id);
CREATE INDEX IF NOT EXISTS idx_cand_opt_generation ON candidate_optimizations(campaign_id, generation);
CREATE INDEX IF NOT EXISTS idx_cand_opt_parent ON candidate_optimizations(parent_candidate_id);

-- =============================================================================
-- SELECTIVITY_PROFILES — Tracks target vs anti-target selectivity
-- First-class evaluation to ensure candidates do not bind off-targets (hERG, CYP, kinases)
-- =============================================================================
CREATE TABLE IF NOT EXISTS selectivity_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    candidate_id UUID REFERENCES candidates(id) ON DELETE CASCADE,
    smiles TEXT NOT NULL,
    primary_target JSONB NOT NULL,
    antitarget_profiles JSONB NOT NULL DEFAULT '[]',
    overall_selectivity_score FLOAT CHECK (overall_selectivity_score >= 0 AND overall_selectivity_score <= 1),
    liability_flags TEXT[] DEFAULT '{}',
    evidence_type TEXT DEFAULT 'computational_prediction',
    note TEXT DEFAULT 'In silico selectivity prediction — NOT experimentally validated',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_selectivity_campaign ON selectivity_profiles(campaign_id);
CREATE INDEX IF NOT EXISTS idx_selectivity_candidate ON selectivity_profiles(candidate_id);

-- =============================================================================
-- ADMET_PROFILES — Multi-parameter ADMET predictions
-- Absorption, Distribution, Metabolism, Excretion, Toxicity with uncertainty
-- =============================================================================
CREATE TABLE IF NOT EXISTS admet_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    candidate_id UUID REFERENCES candidates(id) ON DELETE CASCADE,
    smiles TEXT NOT NULL,
    physicochemical JSONB NOT NULL,
    absorption JSONB NOT NULL,
    distribution JSONB NOT NULL,
    metabolism JSONB NOT NULL,
    excretion JSONB NOT NULL,
    toxicity JSONB NOT NULL,
    admet_traffic_light TEXT CHECK (admet_traffic_light IN ('GREEN', 'AMBER', 'RED')),
    evidence_type TEXT DEFAULT 'computational_prediction',
    disclaimer TEXT DEFAULT 'All ADMET metrics are computational predictions and do not substitute for preclinical assays',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admet_campaign ON admet_profiles(campaign_id);
CREATE INDEX IF NOT EXISTS idx_admet_candidate ON admet_profiles(candidate_id);
CREATE INDEX IF NOT EXISTS idx_admet_traffic_light ON admet_profiles(admet_traffic_light);

-- =============================================================================
-- PARETO_FRONTIERS — Non-dominated trade-off tracking
-- Stores multi-objective Pareto front membership and trade-off vectors
-- =============================================================================
CREATE TABLE IF NOT EXISTS pareto_frontiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    generation INTEGER NOT NULL DEFAULT 1,
    candidate_id UUID REFERENCES candidates(id) ON DELETE CASCADE,
    smiles TEXT NOT NULL,
    pareto_rank INTEGER NOT NULL DEFAULT 1,
    crowding_distance FLOAT DEFAULT 0.0,
    objective_vector JSONB NOT NULL,
    is_non_dominated BOOLEAN GENERATED ALWAYS AS (pareto_rank = 1) STORED,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pareto_campaign_gen ON pareto_frontiers(campaign_id, generation);
CREATE INDEX IF NOT EXISTS idx_pareto_rank ON pareto_frontiers(pareto_rank);
