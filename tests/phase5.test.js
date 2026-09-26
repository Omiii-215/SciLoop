/**
 * SciLoop — Phase 5 Test Suite
 * Tests molecular docking, molecular dynamics simulation, trajectory analysis,
 * and adversarial hypothesis discrimination using simulation.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { DockingEngine } from "../core/docking-engine.js";
import { SimulationEngine } from "../core/simulation-engine.js";
import { HypothesisDiscriminator } from "../core/hypothesis-discriminator.js";
import { HypothesisEngine } from "../core/hypothesis-engine.js";
import { BeliefUpdater } from "../core/belief-updater.js";
import { ExperimentSelector } from "../core/experiment-selector.js";
import { PolicyEngine } from "../core/policy-engine.js";
import { CampaignManager } from "../core/campaign-manager.js";

describe("Phase 5: Molecular Docking Engine", () => {
  test("docks candidate molecule and computes affinity, ligand efficiency, and contact residues", () => {
    const engine = new DockingEngine(
      { pdb_id: "1M17", gene_name: "EGFR", structure_source: "pdb_xray" },
      { center_x: 22.0, center_y: 0.5, center_z: 52.8, size_x: 20.0, size_y: 20.0, size_z: 20.0 }
    );

    const candidate = {
      id: "dock-cand-1",
      smiles: "c1nc2ccccc2nc1Nc1ccc(F)cc1",
      molecular_weight: 239.2,
      heavy_atoms: 18,
      rotatable_bonds: 2,
    };

    const docking = engine.dockCandidate("camp-dock-1", candidate);

    assert.equal(docking.receptor.pdb_id, "1M17");
    assert.equal(docking.receptor.gene_name, "EGFR");
    assert.ok(docking.binding_affinity_kcal_mol <= -7.5);
    assert.ok(docking.ligand_efficiency >= 0.35);

    // Verify poses
    assert.equal(docking.poses.length, 3);
    assert.equal(docking.poses[0].pose_rank, 1);
    assert.equal(docking.poses[0].rmsd_to_best_angstrom, 0.0);

    // Check hinge contact
    const contacts = docking.poses[0].contact_residues;
    const hingeHbond = contacts.find((c) => c.residue_name === "Met" && c.residue_number === 793);
    assert.ok(hingeHbond);
    assert.equal(hingeHbond.interaction_type, "hydrogen_bond");

    // Scientific provenance & disclaimer
    assert.equal(docking.evidence_type, "computational_prediction");
    assert.ok(docking.disclaimer.includes("computational predictions"));
  });

  test("dockBatch evaluates multiple candidate ligands", () => {
    const engine = new DockingEngine();
    const batch = [
      { id: "b1", smiles: "c1nc2ccccc2nc1", heavy_atoms: 11 },
      { id: "b2", smiles: "c1ccncc1", heavy_atoms: 6 },
    ];

    const results = engine.dockBatch("camp-batch", batch);
    assert.equal(results.length, 2);
    assert.ok(results[0].binding_affinity_kcal_mol < 0);
    assert.ok(results[1].binding_affinity_kcal_mol < 0);
  });
});

describe("Phase 5: Molecular Dynamics Simulation Engine", () => {
  test("runs MD protocol and outputs trajectory stability metrics", () => {
    const engine = new SimulationEngine({ duration_ns: 5.0, temperature_kelvin: 300.0 });

    const system = {
      receptor_pdb_id: "1M17",
      ligand_smiles: "c1nc2ccccc2nc1Nc1ccc(F)cc1",
      mutation_state: "wild_type",
    };

    const outcome = engine.runSimulation("camp-sim-1", system, { duration_ns: 5.0 });

    const sim = outcome.simulation_run;
    const traj = outcome.trajectory_analysis;

    // Simulation run record
    assert.equal(sim.receptor_pdb_id, "1M17");
    assert.equal(sim.ensemble, "NPT");
    assert.equal(sim.temperature_kelvin, 300.0);
    assert.equal(sim.duration_ns, 5.0);
    assert.equal(sim.status, "completed");
    assert.equal(sim.evidence_type, "computational_experiment");

    // Trajectory analysis
    assert.ok(traj.protein_rmsd_mean_angstrom < 2.5);
    assert.ok(traj.ligand_rmsd_mean_angstrom < 2.0); // tightly bound in wildtype
    assert.equal(traj.binding_stability_classification, "HIGHLY_STABLE");
    assert.ok(traj.mmgbsa_dG_bind_kcal_mol <= -40.0);

    // Hinge H-bond persistence
    const hingeBond = traj.key_hbond_persistence.find((h) => h.donor_residue.includes("Met793"));
    assert.ok(hingeBond);
    assert.ok(hingeBond.persistence_percentage >= 70.0);
  });

  test("correctly flags destabilization and UNSTABLE binding for gatekeeper clash", () => {
    const engine = new SimulationEngine();

    const mutantSystem = {
      receptor_pdb_id: "1M17",
      ligand_smiles: "c1nc2ccccc2nc1Nc1ccc(Cl)cc1",
      mutation_state: "T790M", // Gatekeeper clash with bulky ligand
    };

    const outcome = engine.runSimulation("camp-mutant", mutantSystem);
    const traj = outcome.trajectory_analysis;

    assert.equal(traj.binding_stability_classification, "UNSTABLE");
    assert.ok(traj.ligand_rmsd_mean_angstrom > 3.5);
    assert.ok(traj.mmgbsa_dG_bind_kcal_mol > -30.0);
  });
});

describe("Phase 5: Hypothesis Discrimination via Simulation", () => {
  test("discriminates between competing hypotheses using comparative simulation metrics", () => {
    const discriminator = new HypothesisDiscriminator({ significanceThresholdKcal: 5.0 });

    const hypA = {
      id: "hyp-wt-active",
      statement: "Candidate molecule stably inhibits wild-type EGFR with high persistence",
    };

    const hypB = {
      id: "hyp-t790m-active",
      statement: "Candidate molecule overcomes T790M gatekeeper resistance with equivalent stability",
    };

    const simResultA = {
      trajectory_analysis: {
        mmgbsa_dG_bind_kcal_mol: -48.5,
        binding_stability_classification: "HIGHLY_STABLE",
        key_hbond_persistence: [{ persistence_percentage: 92.0 }],
      },
    };

    const simResultB = {
      trajectory_analysis: {
        mmgbsa_dG_bind_kcal_mol: -21.0,
        binding_stability_classification: "UNSTABLE",
        key_hbond_persistence: [{ persistence_percentage: 22.0 }],
      },
    };

    const discrimination = discriminator.discriminate(
      "camp-discrim",
      hypA,
      hypB,
      simResultA,
      simResultB,
      "mmgbsa_dG_bind_kcal_mol"
    );

    assert.equal(discrimination.verdict, "FAVORS_HYPOTHESIS_A");
    assert.equal(discrimination.supported_hypothesis_id, "hyp-wt-active");
    assert.equal(discrimination.refuted_hypothesis_id, "hyp-t790m-active");
    assert.ok(discrimination.effect_size >= 25.0);
    assert.ok(discrimination.confidence >= 0.85);
    assert.ok(discrimination.falsification_rationale.includes("decisively supports Hypothesis A"));
    assert.equal(discrimination.evidence_type, "computational_experiment");
  });

  test("applies discrimination outcome to update HypothesisEngine and BeliefUpdater", () => {
    const discriminator = new HypothesisDiscriminator();
    const hypEngine = new HypothesisEngine();
    const beliefUpdater = new BeliefUpdater();

    const campaignId = "camp-apply-1";

    const hypA = hypEngine.createHypothesis(campaignId, {
      statement: "Hypothesis A: Active in WT",
      evidence_type: "model_hypothesis",
      confidence: 0.5,
    });

    const hypB = hypEngine.createHypothesis(campaignId, {
      statement: "Hypothesis B: Active in Mutant",
      evidence_type: "model_hypothesis",
      confidence: 0.5,
    });

    const simResultA = {
      trajectory_analysis: {
        mmgbsa_dG_bind_kcal_mol: -45.0,
        binding_stability_classification: "HIGHLY_STABLE",
      },
    };

    const simResultB = {
      trajectory_analysis: {
        mmgbsa_dG_bind_kcal_mol: -22.0,
        binding_stability_classification: "UNSTABLE",
      },
    };

    const discrimination = discriminator.discriminate(campaignId, hypA, hypB, simResultA, simResultB);
    const applyResult = discriminator.applyToBeliefSystem(discrimination, hypEngine, beliefUpdater, campaignId);

    assert.equal(applyResult.verdict, "FAVORS_HYPOTHESIS_A");
    assert.equal(applyResult.updates_applied, 2);

    // Verify updated hypotheses
    const updatedA = hypEngine.getHypothesis(hypA.id);
    const updatedB = hypEngine.getHypothesis(hypB.id);

    // Confidence of supported A should increase
    assert.ok(updatedA.confidence > 0.5);
    // Confidence of refuted B should decrease
    assert.ok(updatedB.confidence < 0.5);
  });
});

describe("Phase 5: Campaign Integration & Experiment Registry", () => {
  test("ExperimentSelector registers and provides definitions for Phase 5 experiment types", () => {
    const policy = new PolicyEngine();
    const selector = new ExperimentSelector(policy);

    const available = selector.getAvailableExperimentTypes();
    assert.ok(available.includes("molecular_docking"));
    assert.ok(available.includes("md_simulation"));
    assert.ok(available.includes("hypothesis_discrimination"));

    const dockDef = selector.getExperimentDefinition("molecular_docking");
    assert.equal(dockDef.requires_sandbox, true);
    assert.ok(dockDef.prerequisite_types.includes("structure_retrieval"));

    const mdDef = selector.getExperimentDefinition("md_simulation");
    assert.equal(mdDef.requires_sandbox, true);
    assert.ok(mdDef.prerequisite_types.includes("molecular_docking"));

    const discrimDef = selector.getExperimentDefinition("hypothesis_discrimination");
    assert.ok(discrimDef.prerequisite_types.includes("md_simulation"));
  });

  test("CampaignManager maps Phase 5 experiment types to campaign phases", () => {
    const manager = new CampaignManager();
    assert.equal(manager._experimentTypeToPhase("molecular_docking"), "molecular_docking");
    assert.equal(manager._experimentTypeToPhase("md_simulation"), "molecular_simulation");
    assert.equal(manager._experimentTypeToPhase("hypothesis_discrimination"), "hypothesis_discrimination");
  });
});
