-- =============================================================================
-- SciLoop — PostgreSQL Schema for Provenance & Evidence Tracking
-- Phase 0: Core data model for research campaigns
-- =============================================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- CAMPAIGNS — Top-level research investigations
-- =============================================================================
CREATE TABLE campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    research_question TEXT NOT NULL,
    target_gene TEXT,
    target_disease TEXT,
    status TEXT DEFAULT 'active'
        CHECK (status IN ('active', 'paused', 'completed', 'failed')),
    config JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_campaigns_status ON campaigns(status);

-- =============================================================================
-- HYPOTHESES — Testable scientific claims
-- =============================================================================
CREATE TABLE hypotheses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    statement TEXT NOT NULL,
    evidence_type TEXT NOT NULL
        CHECK (evidence_type IN ('model_hypothesis', 'literature', 'computational_prediction')),
    confidence FLOAT CHECK (confidence >= 0 AND confidence <= 1),
    status TEXT DEFAULT 'proposed'
        CHECK (status IN ('proposed', 'under_investigation', 'supported', 'refuted', 'inconclusive')),
    parent_hypothesis_id UUID REFERENCES hypotheses(id),
    evidence_for JSONB DEFAULT '[]',
    evidence_against JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_hypotheses_campaign ON hypotheses(campaign_id);
CREATE INDEX idx_hypotheses_status ON hypotheses(status);

-- =============================================================================
-- EVIDENCE — Source-typed, provenance-tracked scientific evidence
-- =============================================================================
CREATE TABLE evidence (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    source_type TEXT NOT NULL
        CHECK (source_type IN ('literature', 'computational_prediction', 'model_hypothesis')),
    claim TEXT NOT NULL,
    citation TEXT,
    pmid TEXT,
    doi TEXT,
    database_id TEXT,
    database_name TEXT
        CHECK (database_name IN ('PubMed', 'PDB', 'AlphaFold', 'ChEMBL', 'UniProt')),
    confidence FLOAT CHECK (confidence >= 0 AND confidence <= 1),
    uncertainty_notes TEXT,
    provenance JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_evidence_campaign ON evidence(campaign_id);
CREATE INDEX idx_evidence_source ON evidence(source_type);
CREATE INDEX idx_evidence_pmid ON evidence(pmid) WHERE pmid IS NOT NULL;

-- =============================================================================
-- EXPERIMENTS — Computational experiment runs with execution metadata
-- =============================================================================
CREATE TABLE experiments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    hypothesis_id UUID REFERENCES hypotheses(id),
    experiment_type TEXT NOT NULL
        CHECK (experiment_type IN (
            'literature_search', 'target_assessment', 'structure_retrieval',
            'compound_search', 'molecular_filtering', 'molecular_scoring',
            'scientific_critique'
        )),
    description TEXT,
    inputs JSONB DEFAULT '{}',
    outputs JSONB DEFAULT '{}',
    execution JSONB DEFAULT '{}',
    status TEXT DEFAULT 'planned'
        CHECK (status IN ('planned', 'running', 'completed', 'failed', 'cancelled')),
    requires_approval BOOLEAN DEFAULT false,
    approval JSONB,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_experiments_campaign ON experiments(campaign_id);
CREATE INDEX idx_experiments_status ON experiments(status);

-- =============================================================================
-- CANDIDATES — Molecule candidates with properties, filters, and scores
-- =============================================================================
CREATE TABLE candidates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    smiles TEXT NOT NULL,
    inchi_key TEXT,
    source TEXT NOT NULL,
    source_database TEXT
        CHECK (source_database IN ('ChEMBL', 'PubChem', 'ZINC', 'de_novo')),
    source_id TEXT,
    properties JSONB DEFAULT '{}',
    filters JSONB DEFAULT '{}',
    score_vector JSONB DEFAULT '{}',
    composite_note TEXT DEFAULT 'This is a weighted heuristic, NOT a validated metric',
    known_activity JSONB,
    rank INTEGER,
    status TEXT DEFAULT 'identified'
        CHECK (status IN ('identified', 'filtered', 'scored', 'approved', 'rejected')),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_candidates_campaign ON candidates(campaign_id);
CREATE INDEX idx_candidates_rank ON candidates(rank) WHERE rank IS NOT NULL;
CREATE INDEX idx_candidates_smiles ON candidates(smiles);

-- =============================================================================
-- APPROVAL_LOG — Audit trail for human-in-the-loop decisions
-- =============================================================================
CREATE TABLE approval_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    gate_name TEXT NOT NULL
        CHECK (gate_name IN ('research_plan', 'candidate_ranking', 'final_report')),
    approved BOOLEAN NOT NULL,
    approved_by TEXT DEFAULT 'human_reviewer',
    notes TEXT,
    context JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_approval_campaign ON approval_log(campaign_id);

-- =============================================================================
-- Helper: auto-update updated_at timestamps
-- =============================================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_campaigns_updated
    BEFORE UPDATE ON campaigns
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_hypotheses_updated
    BEFORE UPDATE ON hypotheses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_candidates_updated
    BEFORE UPDATE ON candidates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
