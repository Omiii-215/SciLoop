/**
 * SciLoop — Candidate Optimizer & Self-Improvement Engine
 * Phase 4: Search & Self-Improvement
 *
 * Drives the closed-loop generative optimization cycle:
 *   Generation → Multi-Objective Evaluation → Modification (Mutations/Hops) → Re-Evaluation
 *
 * Capabilities:
 *   - Multi-generational evolutionary optimization
 *   - Pareto frontier tracking across generations
 *   - Selectivity screening against antitarget panels
 *   - Comprehensive ADMET profiling
 *   - Convergence monitoring and stopping criteria
 *   - Full candidate lineage and provenance tracking
 */

import { randomUUID } from "node:crypto";
import { ParetoFrontier } from "./pareto-frontier.js";
import { SelectivityEngine } from "./selectivity-engine.js";
import { AdmetEngine } from "./admet-engine.js";

export class CandidateOptimizer {
  /**
   * @param {object} [options]
   * @param {string} [options.primaryTarget]
   * @param {number} [options.maxGenerations]
   * @param {number} [options.populationSize]
   * @param {number} [options.convergenceTolerance]
   */
  constructor(options = {}) {
    this.primaryTarget = options.primaryTarget || "EGFR";
    this.maxGenerations = options.maxGenerations || 4;
    this.populationSize = options.populationSize || 20;
    this.convergenceTolerance = options.convergenceTolerance || 0.02;

    this.paretoEngine = new ParetoFrontier();
    this.selectivityEngine = new SelectivityEngine({ primaryTarget: this.primaryTarget });
    this.admetEngine = new AdmetEngine();

    /** @type {Map<string, object>} Candidate lineage (id -> candidate) */
    this.lineage = new Map();
    /** @type {Array<object>} History of optimization generations */
    this.generationHistory = [];
  }

  /**
   * Run an optimization cycle on an initial candidate pool.
   *
   * @param {string} campaignId
   * @param {Array<object>} seedCandidates
   * @param {object} [options]
   * @returns {object} Optimization outcome with Pareto frontier, lineage, and generation history
   */
  async optimize(campaignId, seedCandidates, options = {}) {
    const maxGen = options.maxGenerations || this.maxGenerations;
    let currentPopulation = this._prepareInitialPopulation(seedCandidates);

    // Initial evaluation of generation 1
    currentPopulation = this._evaluatePopulation(currentPopulation);
    let paretoResult = this.paretoEngine.computeFronts(currentPopulation);

    this.generationHistory.push({
      generation: 1,
      population_size: currentPopulation.length,
      frontier_size: paretoResult.paretoFrontier.length,
      top_candidate: paretoResult.paretoFrontier[0],
      trade_offs: paretoResult.tradeOffSummary,
    });

    let previousBestFitness = this._computeMeanFrontierFitness(paretoResult.paretoFrontier);

    for (let gen = 2; gen <= maxGen; gen++) {
      // 1. Select progenitors from Pareto front + top diverse candidates
      const progenitors = this._selectProgenitors(currentPopulation, paretoResult.paretoFrontier);

      // 2. Generate mutated/improved offspring
      const offspring = this._generateOffspring(progenitors, gen);

      // 3. Evaluate offspring (selectivity + ADMET + activity)
      const evaluatedOffspring = this._evaluatePopulation(offspring);

      // 4. Combine parents and offspring (elitism) and select next generation
      const combinedPool = [...currentPopulation, ...evaluatedOffspring];
      paretoResult = this.paretoEngine.computeFronts(combinedPool);

      // Keep top candidates up to populationSize
      currentPopulation = paretoResult.rankedCandidates.slice(0, this.populationSize);

      const currentFitness = this._computeMeanFrontierFitness(paretoResult.paretoFrontier);
      const fitnessDelta = currentFitness - previousBestFitness;

      this.generationHistory.push({
        generation: gen,
        population_size: currentPopulation.length,
        frontier_size: paretoResult.paretoFrontier.length,
        top_candidate: paretoResult.paretoFrontier[0],
        fitness_delta: Number(fitnessDelta.toFixed(4)),
        trade_offs: paretoResult.tradeOffSummary,
      });

      // Convergence check
      if (Math.abs(fitnessDelta) < this.convergenceTolerance && gen >= 3) {
        break;
      }
      previousBestFitness = currentFitness;
    }

    const finalFront = paretoResult.paretoFrontier;

    return {
      campaign_id: campaignId,
      total_generations: this.generationHistory.length,
      final_population_size: currentPopulation.length,
      pareto_frontier_count: finalFront.length,
      pareto_frontier: finalFront,
      all_ranked_candidates: currentPopulation,
      generation_history: this.generationHistory,
      trade_off_analysis: paretoResult.tradeOffSummary,
      evidence_type: "computational_prediction",
      created_at: new Date().toISOString(),
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Internal optimization routines
  // ─────────────────────────────────────────────────────────────────────────

  _prepareInitialPopulation(seedCandidates) {
    return seedCandidates.map((c) => {
      const id = c.id || randomUUID();
      const cand = {
        ...c,
        id,
        generation: 1,
        smiles: c.smiles,
      };
      this.lineage.set(id, cand);
      return cand;
    });
  }

  _evaluatePopulation(population) {
    return population.map((cand) => {
      const sel = this.selectivityEngine.evaluateCandidate(cand);
      const admet = this.admetEngine.predictProfile(cand);

      const evaluated = {
        ...cand,
        selectivity: sel,
        overall_selectivity_score: sel.overall_selectivity_score,
        admet: admet,
        admet_traffic_light: admet.admet_traffic_light,
        activity_score: sel.primary_target.activity_score,
      };

      evaluated.objective_vector = this.paretoEngine.extractObjectiveVector(evaluated);
      this.lineage.set(evaluated.id, evaluated);
      return evaluated;
    });
  }

  _selectProgenitors(population, frontier) {
    // Progenitors include all Rank 1 frontier candidates plus diverse members
    const set = new Set(frontier);
    for (const c of population) {
      if (set.size >= Math.min(10, population.length)) break;
      set.add(c);
    }
    return Array.from(set);
  }

  _generateOffspring(progenitors, generation) {
    const offspring = [];
    const targetProps = ["solubility", "selectivity", "metabolic_stability", "permeability"];

    for (const parent of progenitors) {
      const targetProp = targetProps[Math.floor(Math.random() * targetProps.length)];
      const mutation = this._applyMutation(parent.smiles, targetProp);
      const offspringId = randomUUID();

      const child = {
        id: offspringId,
        parent_candidate_id: parent.id,
        parent_smiles: parent.smiles,
        generation,
        smiles: mutation.mutated_smiles,
        molecular_weight: parent.molecular_weight || parent.mw || 350,
        logp: mutation.target_property === "solubility" ? (parent.logp || 2.5) - 0.4 : (parent.logp || 2.5),
        modification_type: mutation.modification_type,
        transformation_rule: mutation.transformation_rule,
        rationale: mutation.rationale,
        target_property: mutation.target_property,
        evidence_type: "computational_prediction",
      };

      this.lineage.set(offspringId, child);
      offspring.push(child);
    }

    return offspring;
  }

  _applyMutation(smiles, targetProp) {
    // Deterministic bioisostere and functional group mutations
    if (targetProp === "solubility" && smiles.includes("c1ccccc1")) {
      return {
        mutated_smiles: smiles.replace("c1ccccc1", "c1ccncc1"),
        modification_type: "bioisosteric_replacement",
        transformation_rule: "phenyl_to_pyridine",
        target_property: "solubility",
        rationale: "Pyridine substitution lowers LogP and adds a hydrogen-bond acceptor for improved aqueous solubility.",
      };
    }

    if (targetProp === "solubility") {
      return {
        mutated_smiles: `${smiles}(N1CCOCC1)`,
        modification_type: "solubilizing_group_addition",
        transformation_rule: "morpholine_tail",
        target_property: "solubility",
        rationale: "Attaches a morpholine solubilizing moiety to improve solubility and bioavailability.",
      };
    }

    if (targetProp === "metabolic_stability" && smiles.includes("C(=O)O")) {
      return {
        mutated_smiles: smiles.replace("C(=O)O", "c1nnnn1"),
        modification_type: "bioisosteric_replacement",
        transformation_rule: "carboxylic_acid_to_tetrazole",
        target_property: "metabolic_stability",
        rationale: "Tetrazole isostere improves metabolic stability and passive membrane permeability.",
      };
    }

    // Default: Fluorine insertion for metabolic blocking and selectivity tuning
    const mutated = smiles.endsWith("F") ? smiles.slice(0, -1) + "Cl" : smiles + "F";
    return {
      mutated_smiles: mutated,
      modification_type: "functional_group_addition",
      transformation_rule: "fluorine_insertion",
      target_property: "metabolic_stability",
      rationale: "Fluorine insertion blocks metabolic oxidation hotspots with minimal steric penalty.",
    };
  }

  _computeMeanFrontierFitness(frontier) {
    if (!frontier || frontier.length === 0) return 0;
    const sum = frontier.reduce((acc, c) => {
      const vec = c.objective_vector || {};
      const score = (vec.target_activity || 0) + (vec.selectivity || 0) + (vec.admet_safety || 0);
      return acc + score / 3;
    }, 0);
    return sum / frontier.length;
  }
}
