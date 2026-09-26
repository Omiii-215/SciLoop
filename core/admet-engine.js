/**
 * SciLoop — ADMET Engine
 * Phase 4: Search & Self-Improvement
 *
 * Predicts Absorption, Distribution, Metabolism, Excretion, and Toxicity
 * properties for candidate molecules with uncertainty and traffic-light flags.
 *
 * Labels all outputs as "computational_prediction" — never clinical facts.
 */

import { randomUUID } from "node:crypto";

export class AdmetEngine {
  constructor() {}

  /**
   * Predict comprehensive ADMET profile for a candidate molecule.
   *
   * @param {object} candidate
   * @returns {object} ADMETProfile conforming to schema
   */
  predictProfile(candidate) {
    const smiles = candidate.smiles || "";
    const mw = candidate.molecular_weight || candidate.mw || 350;
    const logp = candidate.logp ?? 2.5;
    const tpsa = candidate.tpsa ?? 70;
    const rotb = candidate.rotatable_bonds ?? 4;
    const hbd = candidate.hbd ?? 2;
    const hba = candidate.hba ?? 4;

    // Estimate QED and SA Score
    const qed = this._estimateQed(mw, logp, tpsa, rotb);
    const saScore = this._estimateSaScore(smiles, mw, rotb);

    // Excretion: ESOL LogS
    const logs = Number((0.16 - 0.63 * logp - 0.0062 * mw + 0.066 * rotb - 0.74 * 0.4).toFixed(2));
    let solClass = "moderately_soluble";
    if (logs > -1) solClass = "highly_soluble";
    else if (logs > -3) solClass = "soluble";
    else if (logs < -6) solClass = "poorly_soluble";
    else if (logs < -8) solClass = "insoluble";

    // Absorption
    let caco2 = "moderate";
    let hia = 0.75;
    if (tpsa < 80 && logp >= 1.0 && logp <= 3.5) {
      caco2 = "high";
      hia = 0.92;
    } else if (tpsa > 130 || logp < 0 || logp > 5.0) {
      caco2 = "low";
      hia = 0.45;
    }
    const oralBioav = rotb <= 10 && tpsa <= 140 && mw <= 500 ? 0.85 : 0.4;

    // Distribution
    const bbbPermeant = logp >= 1.5 && logp <= 4.0 && mw <= 400 && tpsa < 75;
    const ppb = Number(Math.min(99.5, Math.max(40, 50 + 10 * logp)).toFixed(1));

    // Metabolism (CYP inhibition)
    const cyp1a2 = smiles.includes("c1ccncc1") && logp > 2.0;
    const cyp2c9 = hbd >= 1 && logp > 3.0 && smiles.includes("c1ccccc1");
    const cyp2c19 = logp > 3.2;
    const cyp2d6 = /N[1-9]|N\(C\)/.test(smiles) && logp > 2.5;
    const cyp3a4 = mw > 400 && logp > 3.0;

    const cypInhibitionCount = [cyp1a2, cyp2c9, cyp2c19, cyp2d6, cyp3a4].filter(Boolean).length;
    const metabStability = cypInhibitionCount <= 1 ? "high" : cypInhibitionCount <= 3 ? "medium" : "low";

    // Toxicity
    const structuralAlerts = [];
    if (/N(=O)=O|\[N\+\]\(=\[O\-\]\)=O|\[N\+\]\(=O\)\[O\-\]|\[N\+\].*\[O\-\]/.test(smiles)) {
      structuralAlerts.push("Ames_mutagenic_nitro_alert");
    }
    if (/C(=O)Cl|C(=O)Br/.test(smiles)) structuralAlerts.push("Reactive_electrophile_acyl_halide");

    const hasBasicAmine = /N[1-9]|N\(C\)|N1CCN/.test(smiles);
    let hergLiability = "low_risk";
    if (hasBasicAmine && logp > 3.5) {
      hergLiability = "high_risk";
      structuralAlerts.push("hERG_cardiac_channel_inhibition_risk");
    } else if (hasBasicAmine || logp > 3.0) {
      hergLiability = "medium_risk";
    }

    const amesMutagenic = structuralAlerts.includes("Ames_mutagenic_nitro_alert");

    // Traffic light assignment
    let trafficLight = "GREEN";
    if (amesMutagenic || hergLiability === "high_risk" || solClass === "insoluble" || cypInhibitionCount >= 4) {
      trafficLight = "RED";
    } else if (hergLiability === "medium_risk" || solClass === "poorly_soluble" || cypInhibitionCount >= 2) {
      trafficLight = "AMBER";
    }

    return {
      id: randomUUID(),
      candidate_id: candidate.id || randomUUID(),
      smiles,
      physicochemical: {
        mw: Number(mw.toFixed(2)),
        logp: Number(logp.toFixed(2)),
        tpsa: Number(tpsa.toFixed(2)),
        rotatable_bonds: rotb,
        hbd,
        hba,
        qed,
        sa_score: saScore,
      },
      absorption: {
        caco2_permeability: caco2,
        human_intestinal_absorption: hia,
        oral_bioavailability_proxy: oralBioav,
      },
      distribution: {
        bbb_permeant: bbbPermeant,
        bbb_confidence: bbbPermeant ? 0.8 : 0.7,
        plasma_protein_binding_pct: ppb,
      },
      metabolism: {
        cyp_inhibition_profile: {
          cyp1a2,
          cyp2c9,
          cyp2c19,
          cyp2d6,
          cyp3a4,
        },
        metabolic_stability: metabStability,
      },
      excretion: {
        aqueous_solubility_logs: logs,
        solubility_class: solClass,
      },
      toxicity: {
        herg_liability: hergLiability,
        ames_mutagenicity: amesMutagenic,
        structural_alerts: structuralAlerts,
      },
      admet_traffic_light: trafficLight,
      evidence_type: "computational_prediction",
      disclaimer: "All ADMET metrics are computational predictions and do not substitute for preclinical assays",
      created_at: new Date().toISOString(),
    };
  }

  /**
   * Batch predict ADMET profiles.
   *
   * @param {Array<object>} candidates
   * @returns {Array<object>}
   */
  predictBatch(candidates) {
    return candidates.map((c) => this.predictProfile(c));
  }

  _estimateQed(mw, logp, tpsa, rotb) {
    let qed = 0.8;
    if (mw > 450) qed -= 0.15;
    if (logp > 4.0 || logp < 0.5) qed -= 0.15;
    if (tpsa > 120) qed -= 0.1;
    if (rotb > 8) qed -= 0.1;
    return Number(Math.max(0.1, Math.min(0.95, qed)).toFixed(3));
  }

  _estimateSaScore(smiles, mw, rotb) {
    let sa = 2.0;
    if (mw > 400) sa += ((mw - 400) / 100) * 0.8;
    if (rotb > 8) sa += (rotb - 8) * 0.2;
    if (smiles.includes("@")) sa += 0.5;
    return Number(Math.max(1.0, Math.min(10.0, sa)).toFixed(2));
  }
}
