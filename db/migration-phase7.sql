-- =============================================================================
-- SciLoop — Phase 7: General Scientific Engine Migration
-- Adds: scientific_domains, domain_tools, domain_evaluators,
--        reproducibility_records, run_replays
-- Run AFTER init.sql, migration-phase2.sql, migration-phase4.sql,
--        migration-phase5.sql, migration-phase6.sql
-- =============================================================================

-- =============================================================================
-- SCIENTIFIC_DOMAINS — Registered scientific domains and plugins
-- =============================================================================
CREATE TABLE IF NOT EXISTS scientific_domains (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    version TEXT NOT NULL,
    description TEXT,
    candidate_type TEXT NOT NULL,
    candidate_representation TEXT NOT NULL,
    hypothesis_types JSONB NOT NULL DEFAULT '[]',
    evidence_hierarchy JSONB NOT NULL DEFAULT '[]',
    primary_metrics JSONB NOT NULL DEFAULT '[]',
    configuration JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Seed built-in domains
INSERT INTO scientific_domains (id, name, version, description, candidate_type, candidate_representation, hypothesis_types, evidence_hierarchy, primary_metrics)
VALUES 
(
    'small_molecule_drug_discovery',
    'Small Molecule Drug Discovery',
    '1.0.0',
    'Hit identification, lead optimization, docking, and ADMET for small molecules',
    'chemical_structure',
    'SMILES',
    '["binding_mechanism", "scaffold_optimization", "selectivity_rationale", "resistance_mutation", "property_improvement"]'::jsonb,
    '[{"type": "model_hypothesis", "trust_rank": 1, "base_weight": 0.15}, {"type": "literature", "trust_rank": 2, "base_weight": 0.35}, {"type": "computational_prediction", "trust_rank": 3, "base_weight": 0.45}, {"type": "computational_experiment", "trust_rank": 4, "base_weight": 0.70}, {"type": "experimentally_validated", "trust_rank": 5, "base_weight": 0.95}]'::jsonb,
    '["binding_affinity_kcal_mol", "ligand_efficiency", "selectivity_ratio", "admet_score"]'::jsonb
),
(
    'materials_discovery',
    'Inorganic & Solid-State Materials Discovery',
    '1.0.0',
    'Crystal structure prediction, DFT bandgap optimization, and phase stability',
    'crystal_structure',
    'CIF/POSCAR',
    '["phase_stability", "ionic_conductivity", "bandgap_tuning", "catalytic_activity", "defect_tolerance"]'::jsonb,
    '[{"type": "model_hypothesis", "trust_rank": 1, "base_weight": 0.15}, {"type": "literature_db", "trust_rank": 2, "base_weight": 0.40}, {"type": "machine_learning_potential", "trust_rank": 3, "base_weight": 0.50}, {"type": "density_functional_theory", "trust_rank": 4, "base_weight": 0.80}, {"type": "synchrotron_experimental", "trust_rank": 5, "base_weight": 0.95}]'::jsonb,
    '["energy_above_hull_eV_atom", "band_gap_eV", "bulk_modulus_GPa", "formation_energy"]'::jsonb
),
(
    'synthetic_biology',
    'Synthetic Biology & Metabolic Engineering',
    '1.0.0',
    'Gene regulatory circuit design, promoter tuning, and metabolic flux optimization',
    'nucleic_acid_sequence',
    'FASTA/GenBank',
    '["expression_strength", "metabolic_flux_balance", "chassis_toxicity", "terminator_efficiency", "ribosome_binding_rate"]'::jsonb,
    '[{"type": "model_hypothesis", "trust_rank": 1, "base_weight": 0.15}, {"type": "published_characterization", "trust_rank": 2, "base_weight": 0.35}, {"type": "rbs_calculator_prediction", "trust_rank": 3, "base_weight": 0.50}, {"type": "flux_balance_analysis", "trust_rank": 4, "base_weight": 0.75}, {"type": "flow_cytometry_validated", "trust_rank": 5, "base_weight": 0.95}]'::jsonb,
    '["target_titer_g_L", "growth_rate_hr", "promoter_transcription_rate", "metabolic_burden"]'::jsonb
)
ON CONFLICT (id) DO UPDATE SET updated_at = now();

-- =============================================================================
-- REPRODUCIBILITY_RECORDS — Provenance tracking & cryptographic fingerprints
-- =============================================================================
CREATE TABLE IF NOT EXISTS reproducibility_records (
    run_id UUID PRIMARY KEY,
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    experiment_id UUID,
    experiment_type TEXT NOT NULL,
    random_seed INTEGER NOT NULL,
    container_image TEXT NOT NULL,
    git_commit TEXT NOT NULL,
    input_hash CHAR(64) NOT NULL,
    parameter_hash CHAR(64) NOT NULL,
    output_hash CHAR(64),
    execution_fingerprint CHAR(64) NOT NULL,
    provenance JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_repro_campaign ON reproducibility_records(campaign_id);
CREATE INDEX IF NOT EXISTS idx_repro_fingerprint ON reproducibility_records(execution_fingerprint);
CREATE INDEX IF NOT EXISTS idx_repro_input_hash ON reproducibility_records(input_hash);

-- =============================================================================
-- RUN_REPLAYS — Verification logs comparing replication runs
-- =============================================================================
CREATE TABLE IF NOT EXISTS run_replays (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    original_run_id UUID NOT NULL REFERENCES reproducibility_records(run_id) ON DELETE CASCADE,
    replication_run_id UUID NOT NULL REFERENCES reproducibility_records(run_id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('bit_exact', 'statistically_reproduced', 'divergent', 'configuration_mismatch')),
    is_reproduced BOOLEAN NOT NULL,
    metric_comparisons JSONB NOT NULL DEFAULT '{}',
    tolerance_used FLOAT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_run_replays_orig ON run_replays(original_run_id);
CREATE INDEX IF NOT EXISTS idx_run_replays_repl ON run_replays(replication_run_id);
