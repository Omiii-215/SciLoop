/**
 * SciLoop — Selectivity Engine
 * Phase 4: Search & Self-Improvement
 *
 * Evaluates candidate molecules against a panel of off-targets and anti-targets:
 *   - Cardiac safety: hERG channel (KCNH2)
 *   - Metabolic enzymes: CYP3A4, CYP2D6, CYP2C9
 *   - Homolog kinases: ErbB2, ErbB4, KDR (VEGFR2)
 *
 * Ensures selectivity is a first-class objective rather than a footnote.
 */

import { randomUUID } from "node:crypto";

export class SelectivityEngine {
  /**
   * @param {object} [config]
   * @param {string} [config.primaryTarget]
   * @param {Array<object>} [config.antitargets]
   */
  constructor(config = {}) {
    this.primaryTarget = config.primaryTarget || "EGFR";
    this.antitargets = config.antitargets || [
      { gene_name: "KCNH2", common_name: "hERG", category: "cardiac_safety" },
      { gene_name: "CYP3A4", common_name: "CYP3A4", category: "metabolic_enzyme" },
      { gene_name: "CYP2D6", common_name: "CYP2D6", category: "metabolic_enzyme" },
      { gene_name: "ERBB2", common_name: "HER2", category: "homolog_kinase" },
      { gene_name: "KDR", common_name: "VEGFR2", category: "homolog_kinase" },
    ];
  }

  /**
   * Evaluate a single candidate for target selectivity and off-target liabilities.
   *
   * @param {object} candidate
   * @returns {object} SelectivityProfile conforming to schema
   */
  evaluateCandidate(candidate) {
    const smiles = candidate.smiles || "";
    const mw = candidate.molecular_weight || candidate.mw || 350;
    const logp = candidate.logp ?? 2.5;

    // Estimate primary target activity score (0..1)
    const primaryScore = this._estimateTargetAffinity(smiles, this.primaryTarget, mw, logp);

    const antitargetProfiles = [];
    const liabilityFlags = [];

    for (const at of this.antitargets) {
      const evaluation = this._evaluateAntitarget(smiles, at.gene_name, at.category, mw, logp);
      const ratio = Number(((primaryScore + 1e-4) / (evaluation.activity_score + 1e-4)).toFixed(2));

      if (evaluation.risk_level === "high" || evaluation.risk_level === "critical") {
        liabilityFlags.push(`${at.common_name}_${evaluation.risk_level}_risk`);
      }

      antitargetProfiles.push({
        gene_name: at.gene_name,
        common_name: at.common_name,
        category: at.category,
        activity_score: evaluation.activity_score,
        selectivity_ratio: ratio,
        risk_level: evaluation.risk_level,
        alerts: evaluation.alerts,
      });
    }

    const maxRiskScore = Math.max(...antitargetProfiles.map((p) => p.activity_score), 0.2);
    const overallSelectivity = Number(Math.max(0, Math.min(1, primaryScore * (1 - 0.7 * maxRiskScore))).toFixed(3));

    return {
      id: randomUUID(),
      candidate_id: candidate.id || randomUUID(),
      smiles,
      primary_target: {
        gene_name: this.primaryTarget,
        target_id: `CHEMBL_${this.primaryTarget}`,
        activity_score: Number(primaryScore.toFixed(3)),
        affinity_estimate_nm: Number((Math.pow(10, (1 - primaryScore) * 3) * 10).toFixed(1)),
        metric_type: "heuristic_activity",
      },
      antitarget_profiles: antitargetProfiles,
      overall_selectivity_score: overallSelectivity,
      selectivity_index: Number(((primaryScore + 1e-4) / (maxRiskScore + 1e-4)).toFixed(2)),
      liability_flags: liabilityFlags,
      evidence_type: "computational_prediction",
      note: "In silico selectivity prediction against antitarget panel — NOT experimentally validated",
      created_at: new Date().toISOString(),
    };
  }

  /**
   * Batch evaluate multiple candidates.
   *
   * @param {Array<object>} candidates
   * @returns {Array<object>}
   */
  evaluateBatch(candidates) {
    return candidates.map((c) => this.evaluateCandidate(c));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Internal scoring heuristics
  // ─────────────────────────────────────────────────────────────────────────

  _estimateTargetAffinity(smiles, target, mw, logp) {
    let score = 0.5;
    if (mw >= 300 && mw <= 500) score += 0.2;
    if (logp >= 1.5 && logp <= 3.8) score += 0.15;

    // Kinase pharmacophore motifs
    if (/c1nc2ccccc2nc1|n1cncc1|c1ncnc2[nH]ccc12/.test(smiles)) {
      score += 0.15;
    }
    return Math.min(0.95, Math.max(0.1, score));
  }

  _evaluateAntitarget(smiles, gene, category, mw, logp) {
    const alerts = [];
    let score = 0.15;
    let risk = "low";

    if (gene === "KCNH2") {
      // hERG: basic amine + lipophilic aromatic
      const hasBasicAmine = /N[1-9]|N\(C\)|N1CCN/.test(smiles);
      if (hasBasicAmine && logp > 3.3) {
        score = 0.75;
        risk = "high";
        alerts.push("hERG cardiotoxicity pharmacophore match (basic amine + high cLogP)");
      } else if (hasBasicAmine || logp > 3.5) {
        score = 0.45;
        risk = "moderate";
        alerts.push("Moderate hERG binding liability risk");
      }
    } else if (gene.startsWith("CYP")) {
      const hasHeterocycle = /c1cncn1|c1nccs1|c1ccncc1/.test(smiles);
      if (hasHeterocycle && logp > 3.0) {
        score = 0.65;
        risk = "high";
        alerts.push(`${gene} metabolic inhibition liability`);
      } else if (hasHeterocycle) {
        score = 0.4;
        risk = "moderate";
      }
    } else if (gene === "ERBB2" || gene === "KDR") {
      if (/c1nc2ccccc2nc1/.test(smiles)) {
        score = 0.55;
        risk = "moderate";
        alerts.push(`Homolog kinase cross-reactivity alert for ${gene}`);
      }
    }

    return {
      activity_score: Number(score.toFixed(3)),
      risk_level: risk,
      alerts,
    };
  }
}
