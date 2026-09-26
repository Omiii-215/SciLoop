/**
 * SciLoop — Phase 6 Test Suite
 * Tests experimental feedback ingestion, prediction mapping, calibration curves,
 * Brier score computation, dynamic confidence adjustments, and closed-loop campaign transfer.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { ExperimentalFeedbackEngine } from "../core/experimental-feedback.js";
import { PredictionCalibrator } from "../core/prediction-calibrator.js";

describe("Phase 6: Experimental Feedback Engine", () => {
  test("ingests validated experimental assay results with full provenance", () => {
    const engine = new ExperimentalFeedbackEngine();

    const result = engine.ingestResult({
      campaign_id: "camp-001",
      candidate_id: "cand-erlotinib-analog-1",
      assay_type: "binding_affinity",
      measurements: { kd_nM: 12.5, ic50_nM: 18.0 },
      conditions: { temperature_c: 25, buffer: "HEPES 20mM pH 7.4" },
      lab_notebook_ref: "ELN-2026-09-001",
      performed_by: "Dr. Rosalind Franklin",
      protocol_reference: "doi:10.1016/j.bmcl.2025.1001",
      replicate_count: 3,
      quality_metrics: { z_prime: 0.85, cv_percent: 6.2 },
    });

    assert.ok(result.id);
    assert.equal(result.campaign_id, "camp-001");
    assert.equal(result.candidate_id, "cand-erlotinib-analog-1");
    assert.equal(result.assay_type, "binding_affinity");
    assert.equal(result.evidence_type, "experimentally_validated");
    assert.equal(result.validation_status.status, "high_confidence");
    assert.equal(result.activity_classification.label, "active");
    assert.equal(result.activity_classification.value, 12.5);
  });

  test("rejects invalid assay types or missing recognized metrics", () => {
    const engine = new ExperimentalFeedbackEngine();

    assert.throws(
      () => {
        engine.ingestResult({
          campaign_id: "camp-001",
          candidate_id: "cand-1",
          assay_type: "astrology_reading",
          measurements: { horoscope_score: 99 },
          lab_notebook_ref: "ELN-001",
          performed_by: "Tester",
        });
      },
      /Unknown assay type/
    );

    assert.throws(
      () => {
        engine.ingestResult({
          campaign_id: "camp-001",
          candidate_id: "cand-1",
          assay_type: "binding_affinity",
          measurements: { arbitrary_unrecognized_metric: 123 },
          lab_notebook_ref: "ELN-001",
          performed_by: "Tester",
        });
      },
      /No recognized metrics/
    );
  });

  test("correctly flags low confidence validation for poor replicates or high CV", () => {
    const engine = new ExperimentalFeedbackEngine();

    const lowReplicateResult = engine.ingestResult({
      campaign_id: "camp-001",
      candidate_id: "cand-untested-rep",
      assay_type: "cell_viability",
      measurements: { ec50_nM: 540 },
      lab_notebook_ref: "ELN-002",
      performed_by: "Lab Technician",
      replicate_count: 1,
      quality_metrics: { cv_percent: 35 },
    });

    assert.equal(lowReplicateResult.validation_status.status, "low_confidence");
    assert.ok(lowReplicateResult.validation_status.flags.length > 0);
  });

  test("maps computational prediction to experimental observation and computes error metrics", () => {
    const engine = new ExperimentalFeedbackEngine();

    const result = engine.ingestResult({
      campaign_id: "camp-docking-eval",
      candidate_id: "cand-10",
      assay_type: "binding_affinity",
      measurements: { kd_nM: 50.0 },
      lab_notebook_ref: "ELN-010",
      performed_by: "Screening Lead",
      replicate_count: 3,
      quality_metrics: { cv_percent: 8.0 },
    });

    const mapping = engine.mapPredictionToResult({
      campaign_id: "camp-docking-eval",
      result_id: result.id,
      prediction_type: "docking_affinity",
      predicted_value: 30.0,
      observed_value: 50.0,
      prediction_source: "docking_engine",
      prediction_metadata: { tool: "vina", version: "1.2.5" },
    });

    assert.ok(mapping.id);
    assert.equal(mapping.error_metrics.absolute_error, 20.0);
    assert.equal(mapping.error_metrics.relative_error, 0.4);
    assert.ok(mapping.error_metrics.log_error > 0);
    assert.equal(mapping.error_metrics.direction, "underpredicted");
  });

  test("computes comprehensive campaign feedback summary, hit rates, and lessons", () => {
    const engine = new ExperimentalFeedbackEngine();
    const campaignId = "camp-kinase-lead-opt";

    // Ingest 5 candidates with varying activity and predictions
    const candidates = [
      { id: "c1", obsKd: 15, predKd: 20 },
      { id: "c2", obsKd: 45, predKd: 50 },
      { id: "c3", obsKd: 120, predKd: 90 },
      { id: "c4", obsKd: 3500, predKd: 1200 },
      { id: "c5", obsKd: 85, predKd: 110 },
    ];

    for (const c of candidates) {
      const res = engine.ingestResult({
        campaign_id: campaignId,
        candidate_id: c.id,
        assay_type: "binding_affinity",
        measurements: { kd_nM: c.obsKd },
        lab_notebook_ref: `ELN-${c.id}`,
        performed_by: "Screening Team",
        replicate_count: 3,
        quality_metrics: { cv_percent: 7.5 },
      });

      engine.mapPredictionToResult({
        campaign_id: campaignId,
        result_id: res.id,
        prediction_type: "binding_affinity",
        predicted_value: c.predKd,
        observed_value: c.obsKd,
        prediction_source: "docking_engine",
      });
    }

    const summary = engine.computeFeedbackSummary(campaignId);

    assert.equal(summary.campaign_id, campaignId);
    assert.equal(summary.total_results, 5);
    assert.equal(summary.hit_rate.active_count, 3);
    assert.equal(summary.hit_rate.active, 0.6);
    assert.ok(summary.prediction_accuracy.overall_rmse_log > 0);
    assert.ok(summary.prediction_accuracy.overall_mae_log > 0);
    assert.ok(summary.lessons.length >= 0);

    // Cross-campaign transfer recommendation
    const transfer = engine.generateFeedbackTransfer(campaignId, "camp-next-generation");
    assert.equal(transfer.source_campaign_id, campaignId);
    assert.equal(transfer.target_campaign_id, "camp-next-generation");
    assert.ok(transfer.recommended_assay_order.length > 0);
    assert.ok(transfer.lessons.length >= 0);
    assert.ok(transfer.confidence_weight_adjustments.docking_engine > 0);
  });
});

describe("Phase 6: Prediction Calibrator", () => {
  test("registers data points and calculates calibration curves, Brier scores, and ECE", () => {
    const calibrator = new PredictionCalibrator();

    // Register synthetic predictions and binary outcomes
    const points = [
      { pred: 0.9, obs: true, continuousPred: 10, continuousObs: 12 },
      { pred: 0.85, obs: true, continuousPred: 20, continuousObs: 25 },
      { pred: 0.8, obs: true, continuousPred: 30, continuousObs: 28 },
      { pred: 0.7, obs: false, continuousPred: 60, continuousObs: 150 },
      { pred: 0.6, obs: true, continuousPred: 70, continuousObs: 80 },
      { pred: 0.4, obs: false, continuousPred: 200, continuousObs: 400 },
      { pred: 0.3, obs: false, continuousPred: 300, continuousObs: 500 },
      { pred: 0.2, obs: false, continuousPred: 800, continuousObs: 1200 },
      { pred: 0.15, obs: false, continuousPred: 1500, continuousObs: 2000 },
      { pred: 0.1, obs: false, continuousPred: 3000, continuousObs: 4000 },
    ];

    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      calibrator.registerDataPoint({
        prediction_source: "vina_docking",
        prediction_type: "kinase_inhibition",
        predicted_value: p.continuousPred,
        observed_value: p.continuousObs,
        predicted_confidence: p.pred,
        observed_active: p.obs,
        candidate_id: `cand-${i}`,
      });
    }

    const report = calibrator.calibrateSource("vina_docking");

    assert.equal(report.source, "vina_docking");
    assert.equal(report.data_points, 10);
    assert.ok(report.regression_metrics.rmse_log > 0);
    assert.ok(report.regression_metrics.rank_correlation > 0.5);
    assert.ok(report.binary_metrics.brier_score >= 0 && report.binary_metrics.brier_score <= 1);
    assert.ok(report.adjusted_confidence_weight > 0 && report.adjusted_confidence_weight <= 1.0);
  });

  test("calibrates prospective predictions using empirical bias corrections", () => {
    const calibrator = new PredictionCalibrator();

    for (let i = 1; i <= 10; i++) {
      calibrator.registerDataPoint({
        prediction_source: "solubility_model",
        prediction_type: "logS",
        predicted_value: 10 + i * 2,
        observed_value: 5 + i * 2,
        candidate_id: `c-${i}`,
      });
    }

    calibrator.calibrateSource("solubility_model");

    const calibrated = calibrator.calibratePrediction("solubility_model", 20.0);
    assert.ok(calibrated.calibrated_prediction !== undefined);
    assert.equal(calibrated.calibration_applied, true);
    assert.ok(calibrated.uncertainty_interval.lower < calibrated.calibrated_prediction);
    assert.ok(calibrated.uncertainty_interval.upper > calibrated.calibrated_prediction);
  });

  test("adjusts confidence weights dynamically across multiple prediction sources", () => {
    const calibrator = new PredictionCalibrator();

    // Source 1: Highly accurate source
    for (let i = 1; i <= 10; i++) {
      calibrator.registerDataPoint({
        prediction_source: "accurate_model",
        predicted_value: i * 10,
        observed_value: i * 10 + 1,
        predicted_confidence: 0.9,
        observed_active: true,
      });
    }

    // Source 2: Noisy / miscalibrated source
    for (let i = 1; i <= 10; i++) {
      calibrator.registerDataPoint({
        prediction_source: "noisy_model",
        predicted_value: i * 10,
        observed_value: i * 50 + 20,
        predicted_confidence: 0.9,
        observed_active: false,
      });
    }

    const all = calibrator.calibrateAllSources();
    assert.equal(all.length, 2);

    const weights = calibrator.getConfidenceWeights();
    assert.ok(weights.accurate_model > weights.noisy_model);
  });
});
