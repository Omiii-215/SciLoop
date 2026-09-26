/**
 * SciLoop — Phase 7 Test Suite
 * Tests DomainRegistry plugin architecture, DomainAdapter abstraction,
 * and ReproducibilityEngine provenance and hash verification.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { DomainRegistry, BUILTIN_DOMAINS } from "../core/domain-registry.js";
import { DomainAdapter } from "../core/domain-adapter.js";
import { ReproducibilityEngine } from "../core/reproducibility-engine.js";

describe("Phase 7: Domain Registry Plugin Architecture", () => {
  test("initializes with built-in scientific domains", () => {
    const registry = new DomainRegistry();
    const domains = registry.listDomains();

    assert.ok(domains.length >= 3);
    const domainIds = domains.map((d) => d.id);
    assert.ok(domainIds.includes("small_molecule_drug_discovery"));
    assert.ok(domainIds.includes("materials_discovery"));
    assert.ok(domainIds.includes("synthetic_biology"));

    const materials = registry.getDomain("materials_discovery");
    assert.equal(materials.candidate_representation, "CIF/POSCAR");
    assert.ok(materials.primary_metrics.includes("band_gap_eV"));
  });

  test("registers, validates, and manages custom scientific domains", () => {
    const registry = new DomainRegistry();

    const customDomain = {
      id: "quantum_dot_catalysis",
      name: "Quantum Dot Photocatalysis",
      version: "1.0.0",
      description: "Nanocrystal surface engineering and exciton lifetime optimization",
      candidate_type: "nanoparticle_crystal",
      candidate_representation: "XYZ/PDB",
      hypothesis_types: ["exciton_lifetime", "surface_trap_reduction", "charge_transfer_rate"],
      evidence_hierarchy: [
        { type: "model_hypothesis", trust_rank: 1, base_weight: 0.2 },
        { type: "time_resolved_pl", trust_rank: 2, base_weight: 0.8 },
      ],
      primary_metrics: ["photoluminescence_yield", "exciton_lifetime_ns"],
      tools: [
        { name: "time_dependent_dft", type: "simulator", description: "TD-DFT for excited states" },
      ],
    };

    const registered = registry.registerDomain(customDomain);
    assert.equal(registered.id, "quantum_dot_catalysis");
    assert.ok(registry.getDomain("quantum_dot_catalysis"));

    const tools = registry.getTools("quantum_dot_catalysis");
    assert.equal(tools.length, 1);
    assert.equal(tools[0].name, "time_dependent_dft");

    // Successfully unregisters
    assert.equal(registry.unregisterDomain("quantum_dot_catalysis"), true);
    assert.equal(registry.getDomain("quantum_dot_catalysis"), null);
  });

  test("rejects malformed domain descriptors with descriptive errors", () => {
    const registry = new DomainRegistry();

    assert.throws(
      () => {
        registry.registerDomain({
          id: "incomplete_domain",
          // missing name, candidate_type, representation, etc.
        });
      },
      /must have a string 'name'/
    );

    assert.throws(
      () => {
        registry.registerDomain({
          id: "missing_hierarchy",
          name: "Test Domain",
          candidate_type: "test",
          candidate_representation: "test",
          hypothesis_types: ["test_hyp"],
          evidence_hierarchy: [], // empty hierarchy
        });
      },
      /must define an evidence hierarchy/
    );
  });

  test("executes lifecycle hooks for custom domain logic", () => {
    const registry = new DomainRegistry();

    // Register a hook on materials_discovery
    registry.registerHook("materials_discovery", "validate_candidate", ({ candidate, errors }) => {
      if (candidate.composition === "unstable_alloy") {
        errors.push("Composition known to undergo phase decomposition");
      }
      return { errors };
    });

    const context = {
      candidate: { composition: "unstable_alloy" },
      errors: [],
    };

    const result = registry.executeHook("materials_discovery", "validate_candidate", context);
    assert.equal(result.errors.length, 1);
    assert.ok(result.errors[0].includes("phase decomposition"));
  });
});

describe("Phase 7: Domain Adapter Abstraction", () => {
  test("generates domain-specific hypothesis proposals", () => {
    const registry = new DomainRegistry();
    const adapter = DomainAdapter.forDomain("materials_discovery", registry);

    const proposals = adapter.generateHypothesisProposals(
      "Optimize solid-state lithium-ion battery solid electrolyte conductivity",
      { target_entity: "Li10GeP2S12" }
    );

    assert.ok(proposals.length > 0);
    assert.equal(proposals[0].domain_id, "materials_discovery");
    assert.ok(proposals[0].hypothesis_type);
    assert.equal(proposals[0].target_entity, "Li10GeP2S12");
  });

  test("validates candidates according to domain representation formats", () => {
    const chemAdapter = DomainAdapter.forDomain("small_molecule_drug_discovery");
    const matAdapter = DomainAdapter.forDomain("materials_discovery");
    const bioAdapter = DomainAdapter.forDomain("synthetic_biology");

    // Chem candidate requires SMILES
    const chemValid = chemAdapter.validateCandidate({ id: "mol-1", smiles: "CC(=O)Oc1ccccc1C(=O)O" });
    assert.equal(chemValid.valid, true);

    const chemInvalid = chemAdapter.validateCandidate({ id: "mol-2" }); // missing smiles
    assert.equal(chemValid.errors.length, 0);
    assert.equal(chemInvalid.valid, false);

    // Materials candidate requires structure/composition/cif
    const matValid = matAdapter.validateCandidate({ id: "crys-1", composition: "CsPbI3", cif: "data_perovskite..." });
    assert.equal(matValid.valid, true);

    // Biology candidate requires sequence
    const bioValid = bioAdapter.validateCandidate({ id: "seq-1", sequence: "ATGCGATCGATCGATC" });
    assert.equal(bioValid.valid, true);
  });

  test("evaluates candidates across domain primary metrics", () => {
    const adapter = DomainAdapter.forDomain("materials_discovery");

    const candidate = {
      id: "mat-pv-01",
      composition: "Cs2AgBiBr6",
      cif: "perovskite_cif_data",
      band_gap_eV: 1.95,
    };

    const evaluation = adapter.evaluateCandidate(candidate, {
      energy_above_hull_eV_atom: 0.012,
    });

    assert.equal(evaluation.candidate_id, "mat-pv-01");
    assert.equal(evaluation.domain_id, "materials_discovery");
    assert.equal(evaluation.metric_scores.band_gap_eV, 1.95);
    assert.equal(evaluation.metric_scores.energy_above_hull_eV_atom, 0.012);
  });

  test("resolves domain-specific evidence weights", () => {
    const adapter = DomainAdapter.forDomain("synthetic_biology");
    const fbaEvidence = adapter.getEvidenceInfo("flux_balance_analysis");

    assert.equal(fbaEvidence.trust_rank, 4);
    assert.equal(fbaEvidence.base_weight, 0.75);
  });
});

describe("Phase 7: Experiment Reproducibility Engine", () => {
  test("computes deterministic canonical hashes regardless of key order", () => {
    const objA = { z: 1, a: "test", nested: { b: 2, a: 1 } };
    const objB = { a: "test", nested: { a: 1, b: 2 }, z: 1 };

    const hashA = ReproducibilityEngine.computeCanonicalHash(objA);
    const hashB = ReproducibilityEngine.computeCanonicalHash(objB);

    assert.equal(hashA, hashB);
    assert.equal(typeof hashA, "string");
    assert.equal(hashA.length, 64);
  });

  test("registers experiment run with complete cryptographic provenance", () => {
    const engine = new ReproducibilityEngine();

    const record = engine.registerRun({
      campaign_id: "camp-perovskite-01",
      experiment_id: "exp-dft-01",
      experiment_type: "materials_dft_simulation",
      input_data: { composition: "CsPbI3", kpoints: [4, 4, 4] },
      parameters: { ecut: 520, xc: "PBE", smearing: "gaussian" },
      random_seed: 1337,
      container_image: "sciloop/vasp:6.3.0@sha256:abc123def456",
      git_commit: "9a8b7c6d5e",
      output_data: { band_gap_eV: 1.73, total_energy_eV: -34.821 },
    });

    assert.ok(record.run_id);
    assert.equal(record.random_seed, 1337);
    assert.ok(record.hashes.input_hash);
    assert.ok(record.hashes.parameter_hash);
    assert.ok(record.hashes.output_hash);
    assert.ok(record.hashes.execution_fingerprint);
  });

  test("detects bit-exact and statistically reproduced replications", () => {
    const engine = new ReproducibilityEngine();

    // Original run
    const orig = engine.registerRun({
      campaign_id: "camp-01",
      experiment_id: "exp-01",
      experiment_type: "docking",
      input_data: { smiles: "c1ccccc1" },
      parameters: { exhaustiveness: 8 },
      random_seed: 42,
      output_data: { affinity_kcal_mol: -8.40, ligand_efficiency: 0.38 },
    });

    // Bit-exact replication
    const exactRepl = engine.registerRun({
      campaign_id: "camp-01",
      experiment_id: "exp-02",
      experiment_type: "docking",
      input_data: { smiles: "c1ccccc1" },
      parameters: { exhaustiveness: 8 },
      random_seed: 42,
      output_data: { affinity_kcal_mol: -8.40, ligand_efficiency: 0.38 },
    });

    const exactComparison = engine.compareRuns(orig.run_id, exactRepl.run_id);
    assert.equal(exactComparison.status, "bit_exact");
    assert.equal(exactComparison.is_reproduced, true);

    // Statistically reproduced replication (slight numerical float drift within tolerance 1%)
    const statRepl = engine.registerRun({
      campaign_id: "camp-01",
      experiment_id: "exp-03",
      experiment_type: "docking",
      input_data: { smiles: "c1ccccc1" },
      parameters: { exhaustiveness: 8 },
      random_seed: 42,
      output_data: { affinity_kcal_mol: -8.405, ligand_efficiency: 0.3802 },
    });

    const statComparison = engine.compareRuns(orig.run_id, statRepl.run_id, {
      numerical_tolerance: 0.01,
    });
    assert.equal(statComparison.status, "statistically_reproduced");
    assert.equal(statComparison.is_reproduced, true);

    // Divergent run (exceeding tolerance)
    const divergentRepl = engine.registerRun({
      campaign_id: "camp-01",
      experiment_id: "exp-04",
      experiment_type: "docking",
      input_data: { smiles: "c1ccccc1" },
      parameters: { exhaustiveness: 8 },
      random_seed: 42,
      output_data: { affinity_kcal_mol: -6.10, ligand_efficiency: 0.25 },
    });

    const divComparison = engine.compareRuns(orig.run_id, divergentRepl.run_id, {
      numerical_tolerance: 0.01,
    });
    assert.equal(divComparison.status, "divergent");
    assert.equal(divComparison.is_reproduced, false);
  });

  test("generates standalone container replay bundle", () => {
    const engine = new ReproducibilityEngine();

    const run = engine.registerRun({
      campaign_id: "camp-01",
      experiment_id: "exp-01",
      experiment_type: "molecular_docking",
      input_data: { smiles: "CC(=O)N" },
      parameters: { box_size: [20, 20, 20] },
      random_seed: 999,
      container_image: "sciloop-docking:v5.0.0",
    });

    const bundle = engine.generateReplayBundle(run.run_id);
    assert.equal(bundle.run_id, run.run_id);
    assert.equal(bundle.random_seed, 999);
    assert.ok(bundle.docker_command.includes("docker run"));
    assert.ok(bundle.docker_command.includes("SCILOOP_SEED=999"));
    assert.ok(bundle.docker_command.includes("sciloop-docking:v5.0.0"));
  });
});
