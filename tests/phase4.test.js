/**
 * SciLoop — Phase 4 Test Suite
 * Tests Pareto frontier optimization, selectivity screening,
 * ADMET profiling, and generative candidate self-improvement.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { ParetoFrontier } from "../core/pareto-frontier.js";
import { SelectivityEngine } from "../core/selectivity-engine.js";
import { AdmetEngine } from "../core/admet-engine.js";
import { CandidateOptimizer } from "../core/candidate-optimizer.js";
import { ExperimentSelector } from "../core/experiment-selector.js";
import { PolicyEngine } from "../core/policy-engine.js";
import { CampaignManager } from "../core/campaign-manager.js";

describe("Phase 4: Multi-Objective Pareto Frontier", () => {
  test("correctly evaluates Pareto dominance between objective vectors", () => {
    const pareto = new ParetoFrontier();

    const superior = {
      target_activity: 0.9,
      selectivity: 0.85,
      admet_safety: 0.8,
      synthetic_accessibility: 0.7,
      drug_likeness_qed: 0.75,
    };

    const inferior = {
      target_activity: 0.6,
      selectivity: 0.5,
      admet_safety: 0.6,
      synthetic_accessibility: 0.5,
      drug_likeness_qed: 0.5,
    };

    const incomparable = {
      target_activity: 0.95, // higher activity
      selectivity: 0.4,      // but much lower selectivity
      admet_safety: 0.5,
      synthetic_accessibility: 0.4,
      drug_likeness_qed: 0.4,
    };

    assert.equal(pareto.dominates(superior, inferior), true);
    assert.equal(pareto.dominates(inferior, superior), false);
    assert.equal(pareto.dominates(superior, incomparable), false);
    assert.equal(pareto.dominates(incomparable, superior), false);
  });

  test("performs non-dominated sorting and assigns ranks and crowding distance", () => {
    const pareto = new ParetoFrontier();

    const candidates = [
      { id: "c1", smiles: "c1ccccc1", activity_score: 0.9, overall_selectivity_score: 0.85, admet_traffic_light: "GREEN" },
      { id: "c2", smiles: "c1ccncc1", activity_score: 0.7, overall_selectivity_score: 0.95, admet_traffic_light: "GREEN" },
      { id: "c3", smiles: "c1cc(Cl)ccc1", activity_score: 0.4, overall_selectivity_score: 0.3, admet_traffic_light: "RED" },
      { id: "c4", smiles: "c1cc(F)ccc1", activity_score: 0.5, overall_selectivity_score: 0.4, admet_traffic_light: "AMBER" },
    ];

    const result = pareto.computeFronts(candidates);
    assert.ok(result.rankedCandidates.length === 4);
    assert.ok(result.paretoFrontier.length >= 1);

    // c1 and c2 should be Rank 1 (non-dominated)
    const rank1Ids = result.paretoFrontier.map((c) => c.id);
    assert.ok(rank1Ids.includes("c1"));
    assert.ok(rank1Ids.includes("c2"));

    // c3 should have worse rank than c1
    const c3 = result.rankedCandidates.find((c) => c.id === "c3");
    assert.ok(c3.pareto_rank > 1);

    // Trade-off summary should be generated
    assert.ok(result.tradeOffSummary.exposed_trade_offs.length > 0);
  });
});

describe("Phase 4: Selectivity & Antitarget Engine", () => {
  test("evaluates candidate against primary target and antitarget panel", () => {
    const engine = new SelectivityEngine({ primaryTarget: "EGFR" });

    // Compound with quinazoline hinge binder and basic amine tail
    const candidate = {
      id: "test-cand-1",
      smiles: "c1nc2ccccc2nc1Nc1ccc(F)cc1N1CCN(C)CC1",
      mw: 420.5,
      logp: 3.4,
    };

    const profile = engine.evaluateCandidate(candidate);

    assert.equal(profile.primary_target.gene_name, "EGFR");
    assert.ok(profile.primary_target.activity_score > 0.5);
    assert.ok(profile.antitarget_profiles.length >= 5);

    // Check hERG liability detection
    const herg = profile.antitarget_profiles.find((p) => p.gene_name === "KCNH2");
    assert.ok(herg);
    assert.ok(herg.risk_level === "high" || herg.risk_level === "moderate");
    assert.ok(profile.liability_flags.length > 0);

    // Provenance and disclaimer check
    assert.equal(profile.evidence_type, "computational_prediction");
    assert.ok(profile.note.includes("NOT experimentally validated"));
  });
});

describe("Phase 4: ADMET Prediction Engine", () => {
  test("computes full physicochemical and ADMET profile with traffic light", () => {
    const engine = new AdmetEngine();

    const candidate = {
      id: "admet-cand-1",
      smiles: "c1ccncc1C(=O)Nc1ccc(F)cc1",
      molecular_weight: 230.2,
      logp: 1.8,
      tpsa: 54.0,
      rotatable_bonds: 3,
    };

    const profile = engine.predictProfile(candidate);

    // Physicochemical
    assert.equal(profile.physicochemical.mw, 230.2);
    assert.equal(profile.physicochemical.logp, 1.8);
    assert.ok(profile.physicochemical.qed > 0.5);
    assert.ok(profile.physicochemical.sa_score <= 4.0);

    // Absorption & Distribution
    assert.equal(profile.absorption.caco2_permeability, "high");
    assert.ok(profile.absorption.human_intestinal_absorption > 0.7);
    assert.equal(profile.distribution.bbb_permeant, true);

    // Excretion & Solubility
    assert.ok(profile.excretion.aqueous_solubility_logs > -4.0);
    assert.equal(profile.excretion.solubility_class, "soluble");

    // Toxicity
    assert.equal(profile.toxicity.ames_mutagenicity, false);
    assert.equal(profile.toxicity.herg_liability, "low_risk");

    // Traffic light should be GREEN for this clean molecule
    assert.equal(profile.admet_traffic_light, "GREEN");
    assert.equal(profile.evidence_type, "computational_prediction");
    assert.ok(profile.disclaimer.includes("computational predictions"));
  });

  test("flags toxic alerts and sets RED traffic light for mutagenic nitro compounds", () => {
    const engine = new AdmetEngine();
    const toxicCandidate = {
      id: "toxic-cand",
      smiles: "c1ccc(cc1)[N+](=O)[O-]", // Nitrobenzene
      molecular_weight: 123.1,
      logp: 1.9,
    };

    const profile = engine.predictProfile(toxicCandidate);
    assert.equal(profile.toxicity.ames_mutagenicity, true);
    assert.equal(profile.admet_traffic_light, "RED");
  });
});

describe("Phase 4: Candidate Optimizer & Self-Improvement Loop", () => {
  test("runs multi-generational optimization loop and improves population", async () => {
    const optimizer = new CandidateOptimizer({
      primaryTarget: "EGFR",
      maxGenerations: 3,
      populationSize: 10,
    });

    const seedCandidates = [
      { id: "seed-1", smiles: "c1nc2ccccc2nc1Nc1ccccc1", mw: 221.3, logp: 2.1 },
      { id: "seed-2", smiles: "c1nc2ccccc2nc1C(=O)O", mw: 174.1, logp: 1.2 },
      { id: "seed-3", smiles: "c1ccccc1Nc1nc(Cl)nc(Cl)n1", mw: 240.1, logp: 2.6 },
    ];

    const result = await optimizer.optimize("camp-123", seedCandidates, { maxGenerations: 3 });

    assert.equal(result.campaign_id, "camp-123");
    assert.ok(result.total_generations >= 2);
    assert.ok(result.pareto_frontier.length >= 1);
    assert.ok(result.generation_history.length >= 2);

    // Verify lineage tracking
    const offspringCount = Array.from(optimizer.lineage.values()).filter((c) => c.generation > 1).length;
    assert.ok(offspringCount > 0);

    // Non-dominated frontier members must have pareto_rank = 1
    for (const c of result.pareto_frontier) {
      assert.equal(c.pareto_rank, 1);
    }
  });
});

describe("Phase 4: Campaign Integration & Experiment Registry", () => {
  test("ExperimentSelector registers and evaluates Phase 4 experiment types", () => {
    const policy = new PolicyEngine();
    const selector = new ExperimentSelector(policy);

    const available = selector.getAvailableExperimentTypes();
    assert.ok(available.includes("selectivity_screening"));
    assert.ok(available.includes("admet_profiling"));
    assert.ok(available.includes("candidate_optimization"));
    assert.ok(available.includes("pareto_ranking"));

    const selDef = selector.getExperimentDefinition("selectivity_screening");
    assert.equal(selDef.requires_sandbox, true);
    assert.ok(selDef.prerequisite_types.includes("molecular_scoring"));
  });

  test("CampaignManager maps Phase 4 experiment types to campaign phases", () => {
    const manager = new CampaignManager();
    assert.equal(manager._experimentTypeToPhase("selectivity_screening"), "selectivity_screening");
    assert.equal(manager._experimentTypeToPhase("admet_profiling"), "admet_profiling");
    assert.equal(manager._experimentTypeToPhase("candidate_optimization"), "candidate_optimization");
  });
});
