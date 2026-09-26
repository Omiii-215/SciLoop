-- =============================================================================
-- SciLoop — Phase 5: Simulation & Rich Computational Experiments Migration
-- Adds: docking_runs, simulation_runs, trajectory_analyses, hypothesis_discriminations
-- Run AFTER init.sql, migration-phase2.sql, and migration-phase4.sql
-- =============================================================================

-- =============================================================================
-- DOCKING_RUNS — Molecular docking experiments & binding poses
-- =============================================================================
CREATE TABLE IF NOT EXISTS docking_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    experiment_id UUID REFERENCES experiments(id) ON DELETE SET NULL,
    receptor JSONB NOT NULL,
    ligand JSONB NOT NULL,
    grid_box JSONB NOT NULL,
    binding_affinity_kcal_mol FLOAT NOT NULL,
    ligand_efficiency FLOAT NOT NULL,
    poses JSONB NOT NULL DEFAULT '[]',
    docking_software TEXT DEFAULT 'AutoDock Vina 1.2 / smina',
    evidence_type TEXT DEFAULT 'computational_prediction',
    disclaimer TEXT DEFAULT 'Docking scores are computational predictions and do not substitute for biophysical binding assays',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_docking_campaign ON docking_runs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_docking_affinity ON docking_runs(binding_affinity_kcal_mol);

-- =============================================================================
-- SIMULATION_RUNS — Molecular dynamics setups and execution states
-- =============================================================================
CREATE TABLE IF NOT EXISTS simulation_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    experiment_id UUID REFERENCES experiments(id) ON DELETE SET NULL,
    system_name TEXT NOT NULL,
    receptor_pdb_id TEXT NOT NULL,
    mutation_state TEXT DEFAULT 'wild_type',
    ligand_id UUID,
    ligand_smiles TEXT,
    force_field JSONB NOT NULL,
    solvent_model TEXT NOT NULL,
    ensemble TEXT NOT NULL,
    temperature_kelvin FLOAT DEFAULT 300.0,
    pressure_bar FLOAT DEFAULT 1.01325,
    duration_ns FLOAT NOT NULL,
    timestep_fs FLOAT DEFAULT 2.0,
    trajectory_frame_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'pending' CHECK (status IN (
        'pending', 'minimizing', 'equilibrating', 'running_production', 'completed', 'failed'
    )),
    evidence_type TEXT DEFAULT 'computational_experiment',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_simulation_campaign ON simulation_runs(campaign_id);
CREATE INDEX IF NOT EXISTS idx_simulation_status ON simulation_runs(status);

-- =============================================================================
-- TRAJECTORY_ANALYSES — Trajectory metrics, RMSD/RMSF, H-bonds, MM-GBSA
-- =============================================================================
CREATE TABLE IF NOT EXISTS trajectory_analyses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    simulation_id UUID NOT NULL REFERENCES simulation_runs(id) ON DELETE CASCADE,
    protein_rmsd_mean_angstrom FLOAT NOT NULL,
    protein_rmsd_std_angstrom FLOAT,
    ligand_rmsd_mean_angstrom FLOAT NOT NULL,
    ligand_rmsd_std_angstrom FLOAT,
    radius_of_gyration_mean_angstrom FLOAT,
    rmsf_key_residues JSONB DEFAULT '[]',
    key_hbond_persistence JSONB DEFAULT '[]',
    mmgbsa_dG_bind_kcal_mol FLOAT,
    binding_stability_classification TEXT NOT NULL CHECK (binding_stability_classification IN (
        'HIGHLY_STABLE', 'METASTABLE', 'UNSTABLE', 'UNBOUND'
    )),
    evidence_type TEXT DEFAULT 'computational_experiment',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_traj_analysis_sim ON trajectory_analyses(simulation_id);
CREATE INDEX IF NOT EXISTS idx_traj_stability ON trajectory_analyses(binding_stability_classification);

-- =============================================================================
-- HYPOTHESIS_DISCRIMINATIONS — Adversarial hypothesis testing via simulation
-- Records which hypothesis was supported/falsified by simulation evidence
-- =============================================================================
CREATE TABLE IF NOT EXISTS hypothesis_discriminations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    hypothesis_a_id UUID NOT NULL REFERENCES hypotheses(id) ON DELETE CASCADE,
    hypothesis_b_id UUID NOT NULL REFERENCES hypotheses(id) ON DELETE CASCADE,
    discriminating_experiment_type TEXT NOT NULL,
    discriminating_metric TEXT NOT NULL,
    observed_value_a FLOAT NOT NULL,
    observed_value_b FLOAT NOT NULL,
    effect_size FLOAT NOT NULL,
    confidence FLOAT NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    verdict TEXT NOT NULL CHECK (verdict IN (
        'FAVORS_HYPOTHESIS_A', 'FAVORS_HYPOTHESIS_B', 'INCONCLUSIVE', 'BOTH_REFUTED'
    )),
    supported_hypothesis_id UUID REFERENCES hypotheses(id),
    refuted_hypothesis_id UUID REFERENCES hypotheses(id),
    falsification_rationale TEXT NOT NULL,
    evidence_type TEXT DEFAULT 'computational_experiment',
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hypo_discrim_campaign ON hypothesis_discriminations(campaign_id);
CREATE INDEX IF NOT EXISTS idx_hypo_discrim_a ON hypothesis_discriminations(hypothesis_a_id);
CREATE INDEX IF NOT EXISTS idx_hypo_discrim_b ON hypothesis_discriminations(hypothesis_b_id);
