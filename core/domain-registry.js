/**
 * SciLoop — General Scientific Engine: Domain Registry
 * Phase 7: General Scientific Engine
 *
 * Provides a modular plugin architecture that abstracts SciLoop from a
 * drug-discovery-specific system into a general closed-loop scientific discovery engine.
 *
 * Any scientific domain (e.g., small molecule discovery, materials science,
 * synthetic biology, catalyst optimization) can register:
 *   - Hypothesis types and generation schemas
 *   - Domain candidate representations (SMILES, crystal structures, genetic sequences)
 *   - Domain simulation and evaluation tools
 *   - Evidence hierarchy and calibration weights
 *   - Lifecycle hooks (init, validate, transform, score)
 */

import { randomUUID } from "node:crypto";

// ─────────────────────────────────────────────────────────────────────────────
// Default built-in domains
// ─────────────────────────────────────────────────────────────────────────────
export const BUILTIN_DOMAINS = {
  small_molecule_drug_discovery: {
    id: "small_molecule_drug_discovery",
    name: "Small Molecule Drug Discovery",
    version: "1.0.0",
    description: "Hit identification, lead optimization, docking, and ADMET for small molecules",
    candidate_type: "chemical_structure",
    candidate_representation: "SMILES",
    hypothesis_types: [
      "binding_mechanism",
      "scaffold_optimization",
      "selectivity_rationale",
      "resistance_mutation",
      "property_improvement",
    ],
    evidence_hierarchy: [
      { type: "model_hypothesis", trust_rank: 1, base_weight: 0.15 },
      { type: "literature", trust_rank: 2, base_weight: 0.35 },
      { type: "computational_prediction", trust_rank: 3, base_weight: 0.45 },
      { type: "computational_experiment", trust_rank: 4, base_weight: 0.70 },
      { type: "experimentally_validated", trust_rank: 5, base_weight: 0.95 },
    ],
    primary_metrics: ["binding_affinity_kcal_mol", "ligand_efficiency", "selectivity_ratio", "admet_score"],
    tools: [
      { name: "vina_docking", type: "simulator", description: "Receptor-ligand molecular docking" },
      { name: "openmm_md", type: "simulator", description: "Molecular dynamics simulation" },
      { name: "rdkit_descriptors", type: "evaluator", description: "Physicochemical and Lipinski filters" },
      { name: "admet_predictor", type: "evaluator", description: "ADMET and toxicity profile evaluation" },
    ],
  },

  materials_discovery: {
    id: "materials_discovery",
    name: "Inorganic & Solid-State Materials Discovery",
    version: "1.0.0",
    description: "Crystal structure prediction, DFT bandgap optimization, and phase stability",
    candidate_type: "crystal_structure",
    candidate_representation: "CIF/POSCAR",
    hypothesis_types: [
      "phase_stability",
      "ionic_conductivity",
      "bandgap_tuning",
      "catalytic_activity",
      "defect_tolerance",
    ],
    evidence_hierarchy: [
      { type: "model_hypothesis", trust_rank: 1, base_weight: 0.15 },
      { type: "literature_db", trust_rank: 2, base_weight: 0.40 },
      { type: "machine_learning_potential", trust_rank: 3, base_weight: 0.50 },
      { type: "density_functional_theory", trust_rank: 4, base_weight: 0.80 },
      { type: "synchrotron_experimental", trust_rank: 5, base_weight: 0.95 },
    ],
    primary_metrics: ["energy_above_hull_eV_atom", "band_gap_eV", "bulk_modulus_GPa", "formation_energy"],
    tools: [
      { name: "vasp_dft", type: "simulator", description: "Plane-wave density functional theory" },
      { name: "m3gnet_potentials", type: "simulator", description: "Universal graph neural network potentials" },
      { name: "pymatgen_analyzer", type: "evaluator", description: "Symmetry and phase stability analysis" },
    ],
  },

  synthetic_biology: {
    id: "synthetic_biology",
    name: "Synthetic Biology & Metabolic Engineering",
    version: "1.0.0",
    description: "Gene regulatory circuit design, promoter tuning, and metabolic flux optimization",
    candidate_type: "nucleic_acid_sequence",
    candidate_representation: "FASTA/GenBank",
    hypothesis_types: [
      "expression_strength",
      "metabolic_flux_balance",
      "chassis_toxicity",
      "terminator_efficiency",
      "ribosome_binding_rate",
    ],
    evidence_hierarchy: [
      { type: "model_hypothesis", trust_rank: 1, base_weight: 0.15 },
      { type: "published_characterization", trust_rank: 2, base_weight: 0.35 },
      { type: "rbs_calculator_prediction", trust_rank: 3, base_weight: 0.50 },
      { type: "flux_balance_analysis", trust_rank: 4, base_weight: 0.75 },
      { type: "flow_cytometry_validated", trust_rank: 5, base_weight: 0.95 },
    ],
    primary_metrics: ["target_titer_g_L", "growth_rate_hr", "promoter_transcription_rate", "metabolic_burden"],
    tools: [
      { name: "cobra_fba", type: "simulator", description: "Genome-scale flux balance analysis" },
      { name: "vienna_rna", type: "evaluator", description: "RNA secondary structure and free energy folding" },
      { name: "codon_optimizer", type: "evaluator", description: "Host chassis codon adaptation index" },
    ],
  },
};

export class DomainRegistry {
  constructor() {
    /** @type {Map<string, object>} Domain ID → validated domain descriptor */
    this.domains = new Map();

    /** @type {Map<string, Map<string, Function>>} Domain ID → Hook name → Callback */
    this.hooks = new Map();

    /** @type {Map<string, object>} Domain ID → registered tool catalogue */
    this.toolCatalogue = new Map();

    // Load built-in domains by default
    for (const domain of Object.values(BUILTIN_DOMAINS)) {
      this.registerDomain(domain);
    }
  }

  /**
   * Register a new scientific domain into the engine.
   *
   * @param {object} descriptor Domain specification
   * @returns {object} Registered domain descriptor
   */
  registerDomain(descriptor) {
    this.validateDomain(descriptor);

    const domainRecord = {
      ...descriptor,
      registered_at: new Date().toISOString(),
    };

    this.domains.set(descriptor.id, domainRecord);

    // Initialize hook registry for this domain
    if (!this.hooks.has(descriptor.id)) {
      this.hooks.set(descriptor.id, new Map());
    }

    // Initialize tools
    const tools = new Map();
    if (descriptor.tools && Array.isArray(descriptor.tools)) {
      for (const t of descriptor.tools) {
        tools.set(t.name, t);
      }
    }
    this.toolCatalogue.set(descriptor.id, tools);

    return domainRecord;
  }

  /**
   * Retrieve a domain by ID.
   * @param {string} domainId
   * @returns {object|null}
   */
  getDomain(domainId) {
    return this.domains.get(domainId) || null;
  }

  /**
   * List all registered domains.
   * @returns {object[]}
   */
  listDomains() {
    return Array.from(this.domains.values());
  }

  /**
   * Unregister a domain.
   * @param {string} domainId
   * @returns {boolean}
   */
  unregisterDomain(domainId) {
    if (this.domains.has(domainId)) {
      this.domains.delete(domainId);
      this.hooks.delete(domainId);
      this.toolCatalogue.delete(domainId);
      return true;
    }
    return false;
  }

  /**
   * Validate a domain descriptor against schema requirements.
   * Throws Error if invalid.
   */
  validateDomain(descriptor) {
    if (!descriptor || typeof descriptor !== "object") {
      throw new Error("Domain descriptor must be an object.");
    }
    if (!descriptor.id || typeof descriptor.id !== "string") {
      throw new Error("Domain descriptor must have a string 'id'.");
    }
    if (!descriptor.name || typeof descriptor.name !== "string") {
      throw new Error(`Domain "${descriptor.id}" must have a string 'name'.`);
    }
    if (!descriptor.candidate_type || typeof descriptor.candidate_type !== "string") {
      throw new Error(`Domain "${descriptor.id}" must specify 'candidate_type'.`);
    }
    if (!descriptor.candidate_representation || typeof descriptor.candidate_representation !== "string") {
      throw new Error(`Domain "${descriptor.id}" must specify 'candidate_representation'.`);
    }
    if (!Array.isArray(descriptor.hypothesis_types) || descriptor.hypothesis_types.length === 0) {
      throw new Error(`Domain "${descriptor.id}" must define at least one hypothesis type.`);
    }
    if (!Array.isArray(descriptor.evidence_hierarchy) || descriptor.evidence_hierarchy.length === 0) {
      throw new Error(`Domain "${descriptor.id}" must define an evidence hierarchy.`);
    }

    // Verify evidence hierarchy contains valid weights and trust ranks
    for (const ev of descriptor.evidence_hierarchy) {
      if (!ev.type || typeof ev.trust_rank !== "number" || typeof ev.base_weight !== "number") {
        throw new Error(
          `Domain "${descriptor.id}" evidence hierarchy entries must have type, trust_rank, and base_weight.`
        );
      }
    }

    return true;
  }

  /**
   * Register a custom lifecycle hook for a domain.
   *
   * @param {string} domainId
   * @param {string} hookName (e.g., 'before_evaluate', 'after_evaluate', 'validate_candidate')
   * @param {Function} callback
   */
  registerHook(domainId, hookName, callback) {
    if (!this.domains.has(domainId)) {
      throw new Error(`Cannot register hook for unknown domain: ${domainId}`);
    }
    if (typeof callback !== "function") {
      throw new Error(`Hook callback must be a function.`);
    }

    const domainHooks = this.hooks.get(domainId);
    domainHooks.set(hookName, callback);
  }

  /**
   * Execute a lifecycle hook for a domain if defined.
   *
   * @param {string} domainId
   * @param {string} hookName
   * @param {any} context
   * @returns {any} Hook return value or context
   */
  executeHook(domainId, hookName, context) {
    const domainHooks = this.hooks.get(domainId);
    if (!domainHooks || !domainHooks.has(hookName)) {
      return context;
    }
    const hook = domainHooks.get(hookName);
    return hook(context);
  }

  /**
   * Register an additional tool for an existing domain.
   */
  registerTool(domainId, toolDef) {
    if (!this.domains.has(domainId)) {
      throw new Error(`Domain not found: ${domainId}`);
    }
    if (!toolDef || !toolDef.name || !toolDef.type) {
      throw new Error("Tool definition must include 'name' and 'type'.");
    }
    const tools = this.toolCatalogue.get(domainId);
    tools.set(toolDef.name, toolDef);
    return toolDef;
  }

  /**
   * Get all tools available for a domain.
   */
  getTools(domainId) {
    const tools = this.toolCatalogue.get(domainId);
    return tools ? Array.from(tools.values()) : [];
  }
}

export default DomainRegistry;
