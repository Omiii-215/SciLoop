/**
 * SciLoop — Experimental Feedback Engine
 * Phase 6: Experimental Feedback
 *
 * Closes the loop between computation and reality by ingesting validated
 * wet-lab / experimental observations and feeding them back into the
 * research system.
 *
 * Responsibilities:
 *   - Ingest structured experimental results (IC50, Ki, binding assays, etc.)
 *   - Validate incoming data against the evidence type taxonomy
 *   - Map experimental results back to the computational predictions they test
 *   - Compute prediction accuracy metrics (hit rate, RMSE, rank correlation)
 *   - Generate cross-campaign feedback records that inform future planning
 *   - Maintain a full audit trail with provenance for every feedback event
 *
 * Every result ingested is tagged as "experimentally_validated" — the
 * highest-trust evidence type in SciLoop's evidence hierarchy.
 */

import { randomUUID } from "node:crypto";

// ─────────────────────────────────────────────────────────────────────────────
// Evidence type hierarchy (ordered by trust)
// ─────────────────────────────────────────────────────────────────────────────
const EVIDENCE_HIERARCHY = [
  "model_hypothesis",           // 1 — Lowest: LLM-generated reasoning
  "literature",                 // 2 — Published scientific claims
  "computational_prediction",   // 3 — In silico scoring (RDKit, docking)
  "computational_experiment",   // 4 — Physics-based simulation (MD)
  "experimentally_validated",   // 5 — Highest: actual wet-lab data
];

// ─────────────────────────────────────────────────────────────────────────────
// Supported assay types
// ─────────────────────────────────────────────────────────────────────────────
const ASSAY_TYPES = {
  binding_affinity: {
    description: "Direct binding measurement (SPR, ITC, FP)",
    metrics: ["kd_nM", "ki_nM", "ic50_nM"],
    unit: "nM",
  },
  enzymatic_inhibition: {
    description: "Enzyme activity assay (fluorescence, luminescence)",
    metrics: ["ic50_nM", "percent_inhibition_at_concentration"],
    unit: "nM",
  },
  cell_viability: {
    description: "Cell-based viability/proliferation assay",
    metrics: ["ec50_nM", "gi50_nM", "percent_growth_inhibition"],
    unit: "nM",
  },
  selectivity_panel: {
    description: "Kinome selectivity screening panel",
    metrics: ["selectivity_score", "gini_coefficient", "off_target_hits"],
    unit: "ratio",
  },
  admet_experimental: {
    description: "In vitro ADMET measurement",
    metrics: [
      "microsomal_stability_t_half_min",
      "caco2_papp_cm_s",
      "plasma_protein_binding_percent",
      "herg_ic50_uM",
      "cyp_inhibition_percent",
    ],
    unit: "mixed",
  },
  in_vivo_efficacy: {
    description: "In vivo animal model efficacy",
    metrics: ["tumor_growth_inhibition_percent", "dose_mg_kg", "pk_auc"],
    unit: "mixed",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Active threshold classification (for hit rate computation)
// ─────────────────────────────────────────────────────────────────────────────
const ACTIVITY_THRESHOLDS = {
  kd_nM:                   { active: 100,  moderate: 1000 },
  ki_nM:                   { active: 100,  moderate: 1000 },
  ic50_nM:                 { active: 1000, moderate: 10000 },
  ec50_nM:                 { active: 1000, moderate: 10000 },
  percent_inhibition_at_concentration: { active: 50, moderate: 30 },
};

export class ExperimentalFeedbackEngine {
  constructor() {
    /** @type {Map<string, object>} Result ID → experimental result */
    this.results = new Map();

    /** @type {Map<string, object>} Mapping ID → prediction-to-result mapping */
    this.mappings = new Map();

    /** @type {Array<object>} Audit trail of all feedback events */
    this.auditLog = [];

    /** @type {Map<string, object>} Campaign ID → accumulated feedback summary */
    this.feedbackSummaries = new Map();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Ingestion
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Ingest a validated experimental result.
   *
   * @param {object} params
   * @param {string} params.campaign_id — The campaign this result relates to
   * @param {string} params.candidate_id — The candidate molecule tested
   * @param {string} params.assay_type — One of ASSAY_TYPES keys
   * @param {object} params.measurements — Key-value of metric → measured value
   * @param {object} params.conditions — Experimental conditions (concentration, cell line, etc.)
   * @param {string} params.lab_notebook_ref — Lab notebook / ELN reference
   * @param {string} params.performed_by — Researcher name or lab identifier
   * @param {string} [params.protocol_reference] — Protocol DOI or SOP reference
   * @param {number} [params.replicate_count=1] — Number of biological replicates
   * @param {object} [params.quality_metrics] — Quality indicators (Z-prime, CV%, etc.)
   * @returns {object} The ingested experimental result with ID and validation status
   */
  ingestResult({
    campaign_id,
    candidate_id,
    assay_type,
    measurements,
    conditions = {},
    lab_notebook_ref,
    performed_by,
    protocol_reference = null,
    replicate_count = 1,
    quality_metrics = {},
  }) {
    // Validate assay type
    if (!ASSAY_TYPES[assay_type]) {
      throw new Error(
        `Unknown assay type: "${assay_type}". ` +
        `Supported types: ${Object.keys(ASSAY_TYPES).join(", ")}`
      );
    }

    // Validate that measurements contain at least one recognized metric
    const assayDef = ASSAY_TYPES[assay_type];
    const validMetrics = Object.keys(measurements).filter(
      (m) => assayDef.metrics.includes(m)
    );
    if (validMetrics.length === 0) {
      throw new Error(
        `No recognized metrics for assay type "${assay_type}". ` +
        `Expected one of: ${assayDef.metrics.join(", ")}`
      );
    }

    // Classify activity from measurements
    const activityClassification = this._classifyActivity(assay_type, measurements);

    const resultId = randomUUID();
    const result = {
      id: resultId,
      campaign_id,
      candidate_id,
      assay_type,
      assay_description: assayDef.description,
      measurements,
      activity_classification: activityClassification,
      conditions,
      lab_notebook_ref,
      performed_by,
      protocol_reference,
      replicate_count,
      quality_metrics,
      evidence_type: "experimentally_validated",
      validation_status: this._assessQuality(quality_metrics, replicate_count),
      created_at: new Date().toISOString(),
    };

    this.results.set(resultId, result);

    this._logAudit("result_ingested", {
      result_id: resultId,
      campaign_id,
      candidate_id,
      assay_type,
      activity: activityClassification.label,
    });

    return result;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Prediction-to-Result Mapping
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Map a computational prediction to an experimental result for calibration.
   *
   * @param {object} params
   * @param {string} params.campaign_id
   * @param {string} params.result_id — ID of the ingested experimental result
   * @param {string} params.prediction_type — What was predicted (e.g., 'docking_affinity', 'admet_solubility')
   * @param {number} params.predicted_value — The computational prediction value
   * @param {number} params.observed_value — The experimental observation value
   * @param {string} params.prediction_source — Which engine/tool produced the prediction
   * @param {object} [params.prediction_metadata] — Config, version, parameters of the prediction
   * @returns {object} The mapping record with computed error metrics
   */
  mapPredictionToResult({
    campaign_id,
    result_id,
    prediction_type,
    predicted_value,
    observed_value,
    prediction_source,
    prediction_metadata = {},
  }) {
    const result = this.results.get(result_id);
    if (!result) {
      throw new Error(`Experimental result not found: ${result_id}`);
    }

    const absoluteError = Math.abs(predicted_value - observed_value);
    const relativeError = observed_value !== 0
      ? absoluteError / Math.abs(observed_value)
      : Infinity;

    // Log-scale error (useful for IC50/Kd comparisons spanning orders of magnitude)
    const logPredicted = predicted_value > 0 ? Math.log10(predicted_value) : 0;
    const logObserved = observed_value > 0 ? Math.log10(observed_value) : 0;
    const logError = Math.abs(logPredicted - logObserved);

    // Within-order-of-magnitude check
    const withinOneLog = logError <= 1.0;
    const withinHalfLog = logError <= 0.5;

    const mappingId = randomUUID();
    const mapping = {
      id: mappingId,
      campaign_id,
      result_id,
      candidate_id: result.candidate_id,
      prediction_type,
      predicted_value,
      observed_value,
      prediction_source,
      prediction_metadata,
      error_metrics: {
        absolute_error: Math.round(absoluteError * 1000) / 1000,
        relative_error: Math.round(relativeError * 1000) / 1000,
        log_error: Math.round(logError * 1000) / 1000,
        within_one_log: withinOneLog,
        within_half_log: withinHalfLog,
        direction: predicted_value > observed_value ? "overpredicted" : "underpredicted",
      },
      created_at: new Date().toISOString(),
    };

    this.mappings.set(mappingId, mapping);

    this._logAudit("prediction_mapped", {
      mapping_id: mappingId,
      campaign_id,
      prediction_type,
      log_error: mapping.error_metrics.log_error,
      within_one_log: withinOneLog,
    });

    return mapping;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Campaign Feedback Summary
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Compute an aggregate feedback summary for a campaign.
   * This is the primary output that feeds into subsequent campaigns.
   *
   * @param {string} campaignId
   * @returns {object} Comprehensive feedback summary with accuracy metrics
   */
  computeFeedbackSummary(campaignId) {
    const results = this._getCampaignResults(campaignId);
    const mappings = this._getCampaignMappings(campaignId);

    if (results.length === 0) {
      return {
        campaign_id: campaignId,
        status: "no_experimental_data",
        message: "No experimental results have been ingested for this campaign.",
        created_at: new Date().toISOString(),
      };
    }

    // Hit rate computation
    const activeCount = results.filter(
      (r) => r.activity_classification.label === "active"
    ).length;
    const moderateCount = results.filter(
      (r) => r.activity_classification.label === "moderate"
    ).length;
    const inactiveCount = results.filter(
      (r) => r.activity_classification.label === "inactive"
    ).length;

    const hitRate = results.length > 0 ? activeCount / results.length : 0;
    const moderateHitRate = results.length > 0
      ? (activeCount + moderateCount) / results.length
      : 0;

    // Prediction accuracy aggregation
    const predictionAccuracy = this._computePredictionAccuracy(mappings);

    // Assay-type breakdown
    const assayBreakdown = this._computeAssayBreakdown(results);

    // Lessons for future campaigns
    const lessons = this._generateLessons(results, mappings, predictionAccuracy);

    const summary = {
      id: randomUUID(),
      campaign_id: campaignId,
      total_results: results.length,
      total_mappings: mappings.length,

      hit_rate: {
        active: Math.round(hitRate * 1000) / 1000,
        moderate_or_better: Math.round(moderateHitRate * 1000) / 1000,
        active_count: activeCount,
        moderate_count: moderateCount,
        inactive_count: inactiveCount,
      },

      prediction_accuracy: predictionAccuracy,
      assay_breakdown: assayBreakdown,
      lessons,

      evidence_type: "experimentally_validated",
      created_at: new Date().toISOString(),
    };

    this.feedbackSummaries.set(campaignId, summary);

    this._logAudit("feedback_summary_computed", {
      campaign_id: campaignId,
      hit_rate: summary.hit_rate.active,
      total_results: results.length,
    });

    return summary;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Cross-Campaign Feedback Transfer
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Generate a feedback transfer record that a new campaign can consume.
   * Distills lessons from a completed campaign into actionable adjustments.
   *
   * @param {string} sourceCampaignId — The campaign that produced the feedback
   * @param {string} targetCampaignId — The new campaign that will consume it
   * @returns {object} Transfer record with adjusted parameters
   */
  generateFeedbackTransfer(sourceCampaignId, targetCampaignId) {
    const summary = this.feedbackSummaries.get(sourceCampaignId);
    if (!summary) {
      throw new Error(
        `No feedback summary for campaign ${sourceCampaignId}. ` +
        `Call computeFeedbackSummary() first.`
      );
    }

    // Compute confidence weight adjustments based on prediction accuracy
    const weightAdjustments = {};
    if (summary.prediction_accuracy.by_source) {
      for (const [source, metrics] of Object.entries(summary.prediction_accuracy.by_source)) {
        const rmse = metrics.rmse_log || 1.0;
        // Better predictions → higher confidence weight (inversely proportional to RMSE)
        weightAdjustments[source] = Math.round(Math.max(0.1, 1.0 / (1.0 + rmse)) * 1000) / 1000;
      }
    }

    // Compute scoring biases based on systematic over/underprediction
    const scoringBiases = {};
    if (summary.prediction_accuracy.by_source) {
      for (const [source, metrics] of Object.entries(summary.prediction_accuracy.by_source)) {
        if (metrics.mean_signed_log_error !== undefined) {
          scoringBiases[source] = {
            correction: -metrics.mean_signed_log_error,
            direction: metrics.mean_signed_log_error > 0 ? "reduce_scores" : "increase_scores",
          };
        }
      }
    }

    const transfer = {
      id: randomUUID(),
      source_campaign_id: sourceCampaignId,
      target_campaign_id: targetCampaignId,
      hit_rate_from_source: summary.hit_rate.active,
      confidence_weight_adjustments: weightAdjustments,
      scoring_bias_corrections: scoringBiases,
      lessons: summary.lessons,
      recommended_assay_order: this._recommendAssayOrder(summary),
      created_at: new Date().toISOString(),
    };

    this._logAudit("feedback_transferred", {
      source_campaign_id: sourceCampaignId,
      target_campaign_id: targetCampaignId,
    });

    return transfer;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Queries
  // ─────────────────────────────────────────────────────────────────────────

  /** Get a result by ID */
  getResult(resultId) {
    const r = this.results.get(resultId);
    if (!r) throw new Error(`Result not found: ${resultId}`);
    return { ...r };
  }

  /** Get all results for a campaign */
  getCampaignResults(campaignId) {
    return this._getCampaignResults(campaignId);
  }

  /** Get all prediction-to-result mappings for a campaign */
  getCampaignMappings(campaignId) {
    return this._getCampaignMappings(campaignId);
  }

  /** Get feedback summary for a campaign (if computed) */
  getFeedbackSummary(campaignId) {
    return this.feedbackSummaries.get(campaignId) || null;
  }

  /** Get supported assay types */
  getSupportedAssayTypes() {
    return { ...ASSAY_TYPES };
  }

  /** Get the evidence hierarchy */
  getEvidenceHierarchy() {
    return [...EVIDENCE_HIERARCHY];
  }

  /** Get audit log */
  getAuditLog() {
    return [...this.auditLog];
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Internal helpers
  // ─────────────────────────────────────────────────────────────────────────

  _getCampaignResults(campaignId) {
    return [...this.results.values()].filter((r) => r.campaign_id === campaignId);
  }

  _getCampaignMappings(campaignId) {
    return [...this.mappings.values()].filter((m) => m.campaign_id === campaignId);
  }

  /**
   * Classify a compound's activity based on assay measurements.
   */
  _classifyActivity(assayType, measurements) {
    for (const [metric, value] of Object.entries(measurements)) {
      const thresholds = ACTIVITY_THRESHOLDS[metric];
      if (thresholds) {
        if (value <= thresholds.active) {
          return { label: "active", metric, value, threshold: thresholds.active };
        }
        if (value <= thresholds.moderate) {
          return { label: "moderate", metric, value, threshold: thresholds.moderate };
        }
        return { label: "inactive", metric, value, threshold: thresholds.moderate };
      }
    }
    // If no threshold-based metric found, default to unknown
    return { label: "unknown", metric: null, value: null, threshold: null };
  }

  /**
   * Assess the quality/reliability of an experimental result.
   */
  _assessQuality(qualityMetrics, replicateCount) {
    let score = 0;
    const flags = [];

    if (replicateCount >= 3) {
      score += 2;
    } else if (replicateCount >= 2) {
      score += 1;
    } else {
      flags.push("single_replicate");
    }

    if (qualityMetrics.z_prime !== undefined) {
      if (qualityMetrics.z_prime >= 0.5) {
        score += 2;
      } else if (qualityMetrics.z_prime >= 0.0) {
        score += 1;
        flags.push("marginal_z_prime");
      } else {
        flags.push("poor_z_prime");
      }
    }

    if (qualityMetrics.cv_percent !== undefined) {
      if (qualityMetrics.cv_percent <= 15) {
        score += 1;
      } else if (qualityMetrics.cv_percent > 30) {
        flags.push("high_variability");
      }
    }

    const status = score >= 4
      ? "high_confidence"
      : score >= 2
        ? "acceptable"
        : "low_confidence";

    return { status, score, flags };
  }

  /**
   * Aggregate prediction accuracy across all mappings.
   */
  _computePredictionAccuracy(mappings) {
    if (mappings.length === 0) {
      return { status: "no_mappings", by_source: {} };
    }

    // Group by prediction source
    const bySource = {};
    for (const m of mappings) {
      const key = m.prediction_source;
      if (!bySource[key]) {
        bySource[key] = [];
      }
      bySource[key].push(m);
    }

    const sourceMetrics = {};
    for (const [source, group] of Object.entries(bySource)) {
      const logErrors = group.map((m) => m.error_metrics.log_error);
      const signedLogErrors = group.map((m) => {
        const logP = m.predicted_value > 0 ? Math.log10(m.predicted_value) : 0;
        const logO = m.observed_value > 0 ? Math.log10(m.observed_value) : 0;
        return logP - logO;
      });

      const n = logErrors.length;
      const sumLog = logErrors.reduce((a, b) => a + b, 0);
      const sumLogSq = logErrors.reduce((a, b) => a + b * b, 0);
      const sumSigned = signedLogErrors.reduce((a, b) => a + b, 0);

      const withinOneLog = group.filter((m) => m.error_metrics.within_one_log).length;
      const withinHalfLog = group.filter((m) => m.error_metrics.within_half_log).length;

      sourceMetrics[source] = {
        count: n,
        mae_log: Math.round((sumLog / n) * 1000) / 1000,
        rmse_log: Math.round(Math.sqrt(sumLogSq / n) * 1000) / 1000,
        mean_signed_log_error: Math.round((sumSigned / n) * 1000) / 1000,
        within_one_log_fraction: Math.round((withinOneLog / n) * 1000) / 1000,
        within_half_log_fraction: Math.round((withinHalfLog / n) * 1000) / 1000,
      };
    }

    // Overall metrics
    const allLogErrors = mappings.map((m) => m.error_metrics.log_error);
    const totalN = allLogErrors.length;
    const overallMAE = Math.round(
      (allLogErrors.reduce((a, b) => a + b, 0) / totalN) * 1000
    ) / 1000;
    const overallRMSE = Math.round(
      Math.sqrt(allLogErrors.reduce((a, b) => a + b * b, 0) / totalN) * 1000
    ) / 1000;

    return {
      status: "computed",
      total_mappings: totalN,
      overall_mae_log: overallMAE,
      overall_rmse_log: overallRMSE,
      by_source: sourceMetrics,
    };
  }

  /**
   * Break down results by assay type.
   */
  _computeAssayBreakdown(results) {
    const breakdown = {};
    for (const r of results) {
      if (!breakdown[r.assay_type]) {
        breakdown[r.assay_type] = { total: 0, active: 0, moderate: 0, inactive: 0, unknown: 0 };
      }
      breakdown[r.assay_type].total += 1;
      const label = r.activity_classification.label;
      if (breakdown[r.assay_type][label] !== undefined) {
        breakdown[r.assay_type][label] += 1;
      }
    }
    return breakdown;
  }

  /**
   * Generate actionable lessons from experimental feedback.
   */
  _generateLessons(results, mappings, predictionAccuracy) {
    const lessons = [];

    // Lesson 1: Hit rate assessment
    const activeCount = results.filter(
      (r) => r.activity_classification.label === "active"
    ).length;
    const hitRate = results.length > 0 ? activeCount / results.length : 0;

    if (hitRate >= 0.3) {
      lessons.push({
        category: "hit_rate",
        severity: "positive",
        message: `High computational hit rate (${Math.round(hitRate * 100)}%). ` +
                 `Computational pipeline is well-calibrated for this target class.`,
      });
    } else if (hitRate >= 0.1) {
      lessons.push({
        category: "hit_rate",
        severity: "neutral",
        message: `Moderate hit rate (${Math.round(hitRate * 100)}%). ` +
                 `Consider tightening scoring thresholds in future campaigns.`,
      });
    } else {
      lessons.push({
        category: "hit_rate",
        severity: "warning",
        message: `Low hit rate (${Math.round(hitRate * 100)}%). ` +
                 `Computational scoring may need recalibration for this target class.`,
      });
    }

    // Lesson 2: Prediction bias detection
    if (predictionAccuracy.by_source) {
      for (const [source, metrics] of Object.entries(predictionAccuracy.by_source)) {
        if (Math.abs(metrics.mean_signed_log_error) > 0.5) {
          const direction = metrics.mean_signed_log_error > 0
            ? "overestimates"
            : "underestimates";
          lessons.push({
            category: "prediction_bias",
            severity: "warning",
            message: `${source} systematically ${direction} activity by ` +
                     `${Math.abs(metrics.mean_signed_log_error).toFixed(2)} log units. ` +
                     `Apply correction in future campaigns.`,
            correction: -metrics.mean_signed_log_error,
          });
        }
      }
    }

    // Lesson 3: Quality assessment
    const lowConfResults = results.filter(
      (r) => r.validation_status.status === "low_confidence"
    );
    if (lowConfResults.length > results.length * 0.3) {
      lessons.push({
        category: "data_quality",
        severity: "warning",
        message: `${lowConfResults.length}/${results.length} results have low-confidence ` +
                 `validation. Recommend increasing biological replicates.`,
      });
    }

    return lessons;
  }

  /**
   * Recommend an assay testing order based on past campaign data.
   */
  _recommendAssayOrder(summary) {
    const assayHitRates = {};
    if (summary.assay_breakdown) {
      for (const [assayType, counts] of Object.entries(summary.assay_breakdown)) {
        if (counts.total > 0) {
          assayHitRates[assayType] = counts.active / counts.total;
        }
      }
    }

    // Sort by hit rate descending — do the most informative assays first
    return Object.entries(assayHitRates)
      .sort(([, a], [, b]) => b - a)
      .map(([assayType, rate]) => ({
        assay_type: assayType,
        historical_hit_rate: Math.round(rate * 1000) / 1000,
      }));
  }

  _logAudit(event, details) {
    this.auditLog.push({
      id: randomUUID(),
      event,
      details,
      timestamp: new Date().toISOString(),
    });
  }
}

export default ExperimentalFeedbackEngine;
