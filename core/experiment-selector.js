/**
 * SciLoop — Experiment Selector
 * Phase 2: Closed-Loop Agent
 *
 * Chooses the next-best experiment based on expected scientific value,
 * uncertainty reduction, cost, and policy constraints.
 *
 * The selector does NOT blindly follow a fixed pipeline — it evaluates
 * the current state of the campaign and picks the experiment that would
 * most reduce uncertainty or most advance the hypotheses.
 */

import { randomUUID } from "node:crypto";

// ─────────────────────────────────────────────────────────────────────────────
// Experiment type definitions with metadata
// ─────────────────────────────────────────────────────────────────────────────
const EXPERIMENT_REGISTRY = {
  literature_search: {
    description: "Search PubMed for relevant scientific literature",
    cost: 1,           // Relative cost (API calls)
    tools_required: ["search_pubmed", "fetch_abstract"],
    produces: ["evidence"],
    uncertainty_reduction: 0.3,
    requires_sandbox: false,
    prerequisite_types: [],
  },
  target_assessment: {
    description: "Assess target validity using UniProt and biological reasoning",
    cost: 2,
    tools_required: ["get_uniprot_info"],
    produces: ["evidence"],
    uncertainty_reduction: 0.25,
    requires_sandbox: false,
    prerequisite_types: [],
  },
  structure_retrieval: {
    description: "Retrieve protein structures from PDB and AlphaFold",
    cost: 2,
    tools_required: ["search_pdb", "fetch_alphafold"],
    produces: ["evidence"],
    uncertainty_reduction: 0.15,
    requires_sandbox: false,
    prerequisite_types: ["target_assessment"],
  },
  compound_search: {
    description: "Search ChEMBL for known active compounds against the target",
    cost: 3,
    tools_required: ["search_target", "get_active_compounds", "get_compound_details"],
    produces: ["candidates"],
    uncertainty_reduction: 0.2,
    requires_sandbox: false,
    prerequisite_types: ["target_assessment"],
  },
  molecular_filtering: {
    description: "Run RDKit filters (Lipinski, PAINS) on candidates in sandbox",
    cost: 5,
    tools_required: ["sandbox_execute"],
    produces: ["candidates"],
    uncertainty_reduction: 0.15,
    requires_sandbox: true,
    prerequisite_types: ["compound_search"],
  },
  molecular_scoring: {
    description: "Score and rank candidates using multi-objective scoring in sandbox",
    cost: 5,
    tools_required: ["sandbox_execute"],
    produces: ["candidates"],
    uncertainty_reduction: 0.1,
    requires_sandbox: true,
    prerequisite_types: ["molecular_filtering"],
  },
  scientific_critique: {
    description: "Search for contradictory evidence and critically evaluate findings",
    cost: 3,
    tools_required: ["search_pubmed"],
    produces: ["evidence"],
    uncertainty_reduction: 0.2,
    requires_sandbox: false,
    prerequisite_types: ["literature_search"],
  },
  contradiction_search: {
    description: "Specifically search for evidence contradicting current hypotheses",
    cost: 2,
    tools_required: ["search_pubmed"],
    produces: ["evidence"],
    uncertainty_reduction: 0.25,
    requires_sandbox: false,
    prerequisite_types: ["literature_search"],
  },
  hypothesis_generation: {
    description: "Generate or refine hypotheses based on current evidence",
    cost: 1,
    tools_required: [],
    produces: ["hypothesis"],
    uncertainty_reduction: 0.1,
    requires_sandbox: false,
    prerequisite_types: [],
  },
  re_planning: {
    description: "Re-evaluate the research plan based on results so far",
    cost: 1,
    tools_required: [],
    produces: ["plan"],
    uncertainty_reduction: 0.05,
    requires_sandbox: false,
    prerequisite_types: [],
  },
  selectivity_screening: {
    description: "Screen candidate molecules against antitargets (hERG, CYPs, homolog kinases)",
    cost: 4,
    tools_required: ["sandbox_execute"],
    produces: ["selectivity_profiles"],
    uncertainty_reduction: 0.2,
    requires_sandbox: true,
    prerequisite_types: ["molecular_scoring"],
  },
  admet_profiling: {
    description: "Compute multi-parameter ADMET profiles and traffic-light safety rating",
    cost: 4,
    tools_required: ["sandbox_execute"],
    produces: ["admet_profiles"],
    uncertainty_reduction: 0.2,
    requires_sandbox: true,
    prerequisite_types: ["molecular_scoring"],
  },
  candidate_optimization: {
    description: "Perform generative self-improvement mutations and scaffold hops on candidates",
    cost: 6,
    tools_required: ["sandbox_execute"],
    produces: ["candidates", "optimizations"],
    uncertainty_reduction: 0.25,
    requires_sandbox: true,
    prerequisite_types: ["selectivity_screening", "admet_profiling"],
  },
  pareto_ranking: {
    description: "Compute multi-objective Pareto frontier and non-dominated sorting",
    cost: 3,
    tools_required: [],
    produces: ["pareto_frontiers"],
    uncertainty_reduction: 0.15,
    requires_sandbox: false,
    prerequisite_types: ["molecular_scoring"],
  },
  molecular_docking: {
    description: "Dock candidate molecules into target protein binding pocket",
    cost: 5,
    tools_required: ["sandbox_execute"],
    produces: ["docking_runs"],
    uncertainty_reduction: 0.25,
    requires_sandbox: true,
    prerequisite_types: ["structure_retrieval", "molecular_scoring"],
  },
  md_simulation: {
    description: "Run physics-based molecular dynamics to evaluate complex stability and free energy",
    cost: 8,
    tools_required: ["sandbox_execute"],
    produces: ["simulation_runs", "trajectory_analyses"],
    uncertainty_reduction: 0.35,
    requires_sandbox: true,
    prerequisite_types: ["molecular_docking"],
  },
  hypothesis_discrimination: {
    description: "Use comparative simulation metrics to empirically falsify competing hypotheses",
    cost: 4,
    tools_required: ["sandbox_execute"],
    produces: ["hypothesis_discriminations", "belief_updates"],
    uncertainty_reduction: 0.4,
    requires_sandbox: false,
    prerequisite_types: ["md_simulation"],
  },
};

export class ExperimentSelector {
  /**
   * @param {import('./policy-engine.js').PolicyEngine} policyEngine
   */
  constructor(policyEngine) {
    this.policyEngine = policyEngine;

    /** @type {Array<object>} History of completed experiments */
    this.experimentHistory = [];

    /** @type {Set<string>} Experiment types already run in this iteration */
    this.currentIterationExperiments = new Set();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Core selection logic
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Select the next best experiment to run.
   *
   * The selection algorithm:
   * 1. Generate all candidate experiments (not yet run, prerequisites met)
   * 2. Score each candidate by expected value (uncertainty reduction × relevance)
   * 3. Filter by policy constraints (budget, tool permissions)
   * 4. Return the highest-scoring candidate
   *
   * @param {object} campaignState — Current campaign state snapshot
   * @returns {object | null} The selected experiment, or null if none available
   */
  selectNextExperiment(campaignState) {
    const candidates = this._generateCandidateExperiments(campaignState);

    if (candidates.length === 0) {
      return null;
    }

    // Score each candidate
    const scored = candidates.map((candidate) => ({
      ...candidate,
      score: this._scoreExperiment(candidate, campaignState),
    }));

    // Sort by score descending
    scored.sort((a, b) => b.score.total - a.score.total);

    // Return the best candidate
    const selected = scored[0];
    return {
      experiment_type: selected.experiment_type,
      description: selected.description,
      tools_required: selected.tools_required,
      requires_sandbox: selected.requires_sandbox,
      score: selected.score,
      reasoning: this._generateSelectionReasoning(selected, scored, campaignState),
      alternatives: scored.slice(1, 4).map((s) => ({
        experiment_type: s.experiment_type,
        score: s.score.total,
        description: s.description,
      })),
    };
  }

  /**
   * Get all available experiment types with their metadata.
   * @returns {object}
   */
  getExperimentRegistry() {
    return { ...EXPERIMENT_REGISTRY };
  }

  /**
   * Get all registered experiment type names.
   * @returns {string[]}
   */
  getAvailableExperimentTypes() {
    return Object.keys(EXPERIMENT_REGISTRY);
  }

  /**
   * Get metadata definition for a specific experiment type.
   * @param {string} type
   * @returns {object|null}
   */
  getExperimentDefinition(type) {
    return EXPERIMENT_REGISTRY[type] ? { ...EXPERIMENT_REGISTRY[type] } : null;
  }

  /**
   * Record that an experiment was completed.
   * @param {object} experiment — The completed experiment record
   */
  recordCompletedExperiment(experiment) {
    this.experimentHistory.push({
      ...experiment,
      completed_at: new Date().toISOString(),
    });
    this.currentIterationExperiments.add(experiment.experiment_type);
  }

  /**
   * Reset the iteration tracker (called when a new loop iteration starts).
   */
  startNewIteration() {
    this.currentIterationExperiments.clear();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Candidate generation
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Generate all experiments that could potentially run next.
   */
  _generateCandidateExperiments(campaignState) {
    const candidates = [];

    for (const [type, meta] of Object.entries(EXPERIMENT_REGISTRY)) {
      // Skip if already run in this iteration
      if (this.currentIterationExperiments.has(type)) {
        continue;
      }

      // Check prerequisites
      if (!this._prerequisitesMet(type, campaignState)) {
        continue;
      }

      // Check tool permissions
      const toolsAllowed = meta.tools_required.every((tool) => {
        const check = this.policyEngine.checkToolPermission(tool);
        return check.allowed;
      });
      if (!toolsAllowed) {
        continue;
      }

      // Check budget
      const budgetCategory = this._getBudgetCategory(type);
      if (budgetCategory) {
        const usage = campaignState.budget_used?.[budgetCategory] || 0;
        const budgetCheck = this.policyEngine.checkBudget(budgetCategory, usage);
        if (!budgetCheck.allowed) {
          continue;
        }
      }

      candidates.push({
        experiment_type: type,
        ...meta,
      });
    }

    return candidates;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Scoring
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Score a candidate experiment based on expected scientific value.
   *
   * Score dimensions:
   * - uncertainty_reduction: How much this experiment reduces unknowns
   * - relevance: How relevant this is to unresolved hypotheses
   * - novelty: Whether this brings new types of evidence
   * - cost_efficiency: Information gain per unit cost
   */
  _scoreExperiment(candidate, campaignState) {
    // Base uncertainty reduction
    let uncertaintyScore = candidate.uncertainty_reduction;

    // Boost if there are unresolved hypotheses that this experiment could help
    const unresolvedCount = (campaignState.hypothesis_snapshot || []).filter(
      (h) => !["supported", "refuted", "inconclusive"].includes(h.status)
    ).length;
    const relevanceScore = unresolvedCount > 0 ? Math.min(1, unresolvedCount / 3) : 0.1;

    // Boost novelty — experiments not yet tried get a bonus
    const timesRun = this.experimentHistory.filter(
      (e) => e.experiment_type === candidate.experiment_type
    ).length;
    const noveltyScore = timesRun === 0 ? 1.0 : Math.max(0.1, 1.0 - timesRun * 0.3);

    // Cost efficiency
    const costEfficiency = uncertaintyScore / Math.max(candidate.cost, 1);

    // Contextual boosts
    let contextBoost = 0;

    // If we have no literature evidence yet, boost literature search
    const totalEvidence = campaignState.total_evidence || 0;
    if (totalEvidence === 0 && candidate.experiment_type === "literature_search") {
      contextBoost += 0.5;
    }

    // If we have candidates but no criticism, boost critique
    const totalCandidates = campaignState.total_candidates || 0;
    if (totalCandidates > 0 && candidate.experiment_type === "scientific_critique") {
      const critiqueRun = this.experimentHistory.some(
        (e) => e.experiment_type === "scientific_critique"
      );
      if (!critiqueRun) {
        contextBoost += 0.4;
      }
    }

    // If hypothesis confidence is middling (0.4-0.6), boost contradiction search
    const avgConfidence = (campaignState.hypothesis_snapshot || []).reduce(
      (sum, h) => sum + (h.confidence || 0.5), 0
    ) / Math.max((campaignState.hypothesis_snapshot || []).length, 1);

    if (avgConfidence >= 0.4 && avgConfidence <= 0.6 && candidate.experiment_type === "contradiction_search") {
      contextBoost += 0.3;
    }

    const total = (
      uncertaintyScore * 0.3 +
      relevanceScore * 0.25 +
      noveltyScore * 0.2 +
      costEfficiency * 0.15 +
      contextBoost * 0.1
    );

    return {
      total: Math.round(total * 1000) / 1000,
      uncertainty_reduction: uncertaintyScore,
      relevance: relevanceScore,
      novelty: noveltyScore,
      cost_efficiency: costEfficiency,
      context_boost: contextBoost,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Check if prerequisites for an experiment type are met.
   */
  _prerequisitesMet(experimentType, campaignState) {
    const meta = EXPERIMENT_REGISTRY[experimentType];
    if (!meta || meta.prerequisite_types.length === 0) {
      return true;
    }

    return meta.prerequisite_types.every((prereq) =>
      this.experimentHistory.some((e) => e.experiment_type === prereq && e.status === "completed")
    );
  }

  /**
   * Map experiment types to budget categories.
   */
  _getBudgetCategory(experimentType) {
    const mapping = {
      literature_search: "literature_queries",
      scientific_critique: "literature_queries",
      contradiction_search: "literature_queries",
      target_assessment: "database_queries",
      structure_retrieval: "database_queries",
      compound_search: "database_queries",
      molecular_filtering: "sandbox_executions",
      molecular_scoring: "sandbox_executions",
    };
    return mapping[experimentType] || null;
  }

  /**
   * Generate human-readable reasoning for why an experiment was selected.
   */
  _generateSelectionReasoning(selected, allScored, campaignState) {
    const parts = [
      `Selected '${selected.experiment_type}' (score: ${selected.score.total.toFixed(3)}).`,
    ];

    if (selected.score.context_boost > 0) {
      parts.push(`Contextual boost applied based on current campaign state.`);
    }

    if (selected.score.novelty === 1.0) {
      parts.push(`First time running this experiment type — novelty bonus applied.`);
    }

    if (allScored.length > 1) {
      parts.push(
        `Considered ${allScored.length} candidates. ` +
        `Runner-up: '${allScored[1].experiment_type}' (score: ${allScored[1].score.total.toFixed(3)}).`
      );
    }

    return parts.join(" ");
  }
}

export default ExperimentSelector;
