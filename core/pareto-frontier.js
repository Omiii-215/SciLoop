/**
 * SciLoop — Pareto Frontier & Multi-Objective Optimizer
 * Phase 4: Search & Self-Improvement
 *
 * Implements Fast Non-Dominated Sorting (Deb et al., NSGA-II) and
 * crowding distance assignment to optimize candidate molecules across
 * competing scientific objectives:
 *   - Target activity proxy
 *   - Selectivity index
 *   - ADMET safety / traffic light
 *   - Synthetic accessibility (SA score)
 *   - Drug-likeness (QED)
 *
 * Exposes explicit trade-offs instead of hiding them in an opaque single score.
 */

import { randomUUID } from "node:crypto";

export class ParetoFrontier {
  /**
   * @param {object} [options]
   * @param {string[]} [options.objectives] Names of objectives to maximize
   */
  constructor(options = {}) {
    this.objectives = options.objectives || [
      "target_activity",
      "selectivity",
      "admet_safety",
      "synthetic_accessibility",
      "drug_likeness_qed",
    ];
  }

  /**
   * Extract or normalize candidate properties into a standardized 0..1 maximization vector.
   *
   * @param {object} candidate
   * @returns {Record<string, number>}
   */
  extractObjectiveVector(candidate) {
    const scoreVec = candidate.score_vector || {};
    const admet = candidate.admet || {};
    const sel = candidate.selectivity || {};

    const targetActivity = candidate.activity_score ??
      scoreVec.drug_likeness ??
      candidate.composite_score ??
      0.5;

    const selectivity = sel.overall_selectivity_score ??
      candidate.overall_selectivity_score ??
      0.5;

    let admetScore = 0.5;
    const tl = candidate.admet_traffic_light || admet.admet_traffic_light;
    if (tl === "GREEN") admetScore = 1.0;
    else if (tl === "AMBER") admetScore = 0.6;
    else if (tl === "RED") admetScore = 0.2;

    const rawSa = admet.physicochemical?.sa_score ?? candidate.sa_score ?? 3.0;
    const saNormalized = Math.max(0, Math.min(1, 1 - (rawSa - 1) / 9));

    const qed = admet.physicochemical?.qed ?? candidate.qed ?? 0.65;

    return {
      target_activity: Number(targetActivity.toFixed(4)),
      selectivity: Number(selectivity.toFixed(4)),
      admet_safety: Number(admetScore.toFixed(4)),
      synthetic_accessibility: Number(saNormalized.toFixed(4)),
      drug_likeness_qed: Number(qed.toFixed(4)),
    };
  }

  /**
   * Determine whether vector A dominates vector B:
   * A dominates B iff A is not worse than B in all objectives, and strictly better in at least one.
   *
   * @param {Record<string, number>} vecA
   * @param {Record<string, number>} vecB
   * @returns {boolean}
   */
  dominates(vecA, vecB) {
    let strictlyBetter = false;
    for (const obj of this.objectives) {
      const valA = vecA[obj] ?? 0;
      const valB = vecB[obj] ?? 0;
      if (valA < valB) {
        return false;
      }
      if (valA > valB) {
        strictlyBetter = true;
      }
    }
    return strictlyBetter;
  }

  /**
   * Perform Fast Non-Dominated Sorting on candidates (NSGA-II).
   *
   * @param {Array<object>} candidates
   * @returns {{
   *   rankedCandidates: Array<object>,
   *   paretoFrontier: Array<object>,
   *   fronts: Array<Array<object>>,
   *   tradeOffSummary: object
   * }}
   */
  computeFronts(candidates) {
    if (!candidates || candidates.length === 0) {
      return {
        rankedCandidates: [],
        paretoFrontier: [],
        fronts: [],
        tradeOffSummary: { message: "No candidates provided" },
      };
    }

    // Prepare clones with objective vectors
    const pool = candidates.map((c) => ({
      ...c,
      objective_vector: c.objective_vector || this.extractObjectiveVector(c),
      pareto_rank: 1,
      crowding_distance: 0,
    }));

    const n = pool.length;
    const dominationCounts = new Array(n).fill(0);
    const dominatedSets = Array.from({ length: n }, () => []);
    const fronts = [[]];

    for (let p = 0; p < n; p++) {
      for (let q = 0; q < n; q++) {
        if (p === q) continue;
        if (this.dominates(pool[p].objective_vector, pool[q].objective_vector)) {
          dominatedSets[p].push(q);
        } else if (this.dominates(pool[q].objective_vector, pool[p].objective_vector)) {
          dominationCounts[p]++;
        }
      }

      if (dominationCounts[p] === 0) {
        pool[p].pareto_rank = 1;
        fronts[0].push(p);
      }
    }

    let currFrontIdx = 0;
    while (currFrontIdx < fronts.length && fronts[currFrontIdx].length > 0) {
      const nextFront = [];
      for (const p of fronts[currFrontIdx]) {
        for (const q of dominatedSets[p]) {
          dominationCounts[q]--;
          if (dominationCounts[q] === 0) {
            pool[q].pareto_rank = currFrontIdx + 2;
            nextFront.push(q);
          }
        }
      }
      currFrontIdx++;
      if (nextFront.length > 0) {
        fronts.push(nextFront);
      }
    }

    // Assign crowding distance per front
    for (const frontIndices of fronts) {
      this.assignCrowdingDistance(pool, frontIndices);
    }

    // Sort by rank ascending, then crowding distance descending
    pool.sort((a, b) => {
      if (a.pareto_rank !== b.pareto_rank) {
        return a.pareto_rank - b.pareto_rank;
      }
      return (b.crowding_distance || 0) - (a.crowding_distance || 0);
    });

    const paretoFrontier = pool.filter((c) => c.pareto_rank === 1);
    const tradeOffSummary = this.summarizeTradeOffs(paretoFrontier);

    return {
      rankedCandidates: pool,
      paretoFrontier,
      fronts: fronts.map((f) => f.map((idx) => pool.find((item) => item.id === candidates[idx].id) || pool[idx])),
      tradeOffSummary,
    };
  }

  /**
   * Assign crowding distance to maintain diversity along the front.
   *
   * @param {Array<object>} pool
   * @param {number[]} indices
   */
  assignCrowdingDistance(pool, indices) {
    if (!indices || indices.length === 0) return;
    if (indices.length <= 2) {
      for (const idx of indices) {
        pool[idx].crowding_distance = Infinity;
      }
      return;
    }

    for (const idx of indices) {
      pool[idx].crowding_distance = 0;
    }

    for (const obj of this.objectives) {
      const sorted = [...indices].sort(
        (a, b) => (pool[a].objective_vector[obj] ?? 0) - (pool[b].objective_vector[obj] ?? 0)
      );

      pool[sorted[0]].crowding_distance = Infinity;
      pool[sorted[sorted.length - 1]].crowding_distance = Infinity;

      const minVal = pool[sorted[0]].objective_vector[obj] ?? 0;
      const maxVal = pool[sorted[sorted.length - 1]].objective_vector[obj] ?? 0;
      const denom = maxVal - minVal;

      if (denom > 1e-6) {
        for (let i = 1; i < sorted.length - 1; i++) {
          if (pool[sorted[i]].crowding_distance !== Infinity) {
            const nextVal = pool[sorted[i + 1]].objective_vector[obj] ?? 0;
            const prevVal = pool[sorted[i - 1]].objective_vector[obj] ?? 0;
            pool[sorted[i]].crowding_distance += (nextVal - prevVal) / denom;
          }
        }
      }
    }
  }

  /**
   * Generate explicit trade-off insights for the non-dominated Pareto frontier.
   *
   * @param {Array<object>} frontier
   * @returns {object}
   */
  summarizeTradeOffs(frontier) {
    if (!frontier || frontier.length === 0) {
      return { note: "No frontier candidates available" };
    }

    const leaders = {};
    for (const obj of this.objectives) {
      let bestCand = frontier[0];
      let bestVal = -Infinity;
      for (const c of frontier) {
        const val = c.objective_vector?.[obj] ?? 0;
        if (val > bestVal) {
          bestVal = val;
          bestCand = c;
        }
      }
      leaders[obj] = {
        candidate_id: bestCand.id || null,
        smiles: bestCand.smiles,
        value: bestVal,
      };
    }

    return {
      frontier_size: frontier.length,
      objective_leaders: leaders,
      exposed_trade_offs: [
        "Potency vs Selectivity: Top active molecules often show moderate cross-reactivity with homolog kinases.",
        "Potency vs Permeability: Large hydrophobic molecules increase target affinity at the expense of aqueous solubility (LogS).",
        "Novelty vs Synthetic Accessibility: Radical scaffold hops present higher novelty but higher synthetic accessibility scores.",
      ],
      recommendation: "Human scientific review should select candidates based on therapeutic context rather than a single metric.",
    };
  }
}
