/**
 * SciLoop — Prediction Calibrator
 * Phase 6: Experimental Feedback
 *
 * Compares computational predictions against experimental ground truth
 * to compute calibration curves, Brier scores, and adjusted confidence
 * weights for different prediction sources.
 *
 * Over time, this engine learns which prediction methods are most
 * trustworthy for which target classes, and produces calibrated
 * uncertainty estimates for future predictions.
 *
 * Responsibilities:
 *   - Track (prediction, observation) pairs over time
 *   - Compute calibration curves (predicted vs observed quantiles)
 *   - Compute Brier scores for binary classification predictions
 *   - Adjust confidence weights per evidence source
 *   - Provide calibrated uncertainty intervals for future predictions
 *   - Support cross-campaign calibration aggregation
 */

import { randomUUID } from "node:crypto";

// ─────────────────────────────────────────────────────────────────────────────
// Default calibration bins for calibration curve computation
// ─────────────────────────────────────────────────────────────────────────────
const DEFAULT_BINS = [0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];

// ─────────────────────────────────────────────────────────────────────────────
// Default confidence weight priors (before any calibration data)
// ─────────────────────────────────────────────────────────────────────────────
const DEFAULT_WEIGHTS = {
  model_hypothesis:         0.1,
  literature:               0.4,
  computational_prediction: 0.3,
  computational_experiment: 0.5,
  experimentally_validated: 1.0,
};

export class PredictionCalibrator {
  constructor() {
    /** @type {Array<object>} All calibration data points */
    this.dataPoints = [];

    /** @type {Map<string, object>} Source name → calibration state */
    this.sourceCalibrations = new Map();

    /** @type {Map<string, number>} Source name → adjusted confidence weight */
    this.confidenceWeights = new Map(Object.entries(DEFAULT_WEIGHTS));

    /** @type {Array<object>} History of calibration updates */
    this.calibrationHistory = [];
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Data point registration
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Register a calibration data point: a paired (prediction, observation).
   *
   * @param {object} params
   * @param {string} params.campaign_id
   * @param {string} params.candidate_id
   * @param {string} params.prediction_source — Which engine made the prediction
   * @param {string} params.prediction_type — What was predicted (e.g. 'binding_affinity')
   * @param {number} params.predicted_value — Computational prediction
   * @param {number} params.observed_value — Experimental measurement
   * @param {number} [params.predicted_confidence] — Predicted probability of being "active" (0-1)
   * @param {boolean} [params.observed_active] — Whether the compound was experimentally active
   * @param {string} [params.target_class] — Target class for stratified calibration
   * @returns {object} The registered data point
   */
  registerDataPoint({
    campaign_id,
    candidate_id,
    prediction_source,
    prediction_type,
    predicted_value,
    observed_value,
    predicted_confidence = null,
    observed_active = null,
    target_class = "general",
  }) {
    const logPredicted = predicted_value > 0 ? Math.log10(predicted_value) : 0;
    const logObserved = observed_value > 0 ? Math.log10(observed_value) : 0;
    const logError = logPredicted - logObserved; // signed error
    const absLogError = Math.abs(logError);

    const dp = {
      id: randomUUID(),
      campaign_id,
      candidate_id,
      prediction_source,
      prediction_type,
      target_class,
      predicted_value,
      observed_value,
      log_predicted: Math.round(logPredicted * 1000) / 1000,
      log_observed: Math.round(logObserved * 1000) / 1000,
      signed_log_error: Math.round(logError * 1000) / 1000,
      abs_log_error: Math.round(absLogError * 1000) / 1000,
      predicted_confidence,
      observed_active,
      created_at: new Date().toISOString(),
    };

    this.dataPoints.push(dp);
    return dp;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Calibration computation
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Compute calibration metrics for a specific prediction source.
   *
   * @param {string} source — Prediction source name
   * @param {object} [options]
   * @param {string} [options.target_class] — Filter by target class
   * @returns {object} Calibration record with bias, variance, calibration curve, etc.
   */
  calibrateSource(source, options = {}) {
    let points = this.dataPoints.filter((dp) => dp.prediction_source === source);

    if (options.target_class) {
      points = points.filter((dp) => dp.target_class === options.target_class);
    }

    if (points.length < 3) {
      return {
        source,
        status: "insufficient_data",
        data_points: points.length,
        minimum_required: 3,
        message: `Need at least 3 data points to calibrate. Currently have ${points.length}.`,
      };
    }

    // Compute regression-style metrics
    const n = points.length;
    const signedErrors = points.map((dp) => dp.signed_log_error);
    const absErrors = points.map((dp) => dp.abs_log_error);

    const meanSignedError = signedErrors.reduce((a, b) => a + b, 0) / n;
    const meanAbsError = absErrors.reduce((a, b) => a + b, 0) / n;
    const rmse = Math.sqrt(absErrors.reduce((a, b) => a + b * b, 0) / n);

    // Variance of the signed error (spread around the bias)
    const variance = signedErrors.reduce(
      (acc, e) => acc + (e - meanSignedError) ** 2, 0
    ) / n;
    const stdDev = Math.sqrt(variance);

    // Compute Spearman rank correlation (simplified: using Pearson on log values)
    const logPreds = points.map((dp) => dp.log_predicted);
    const logObs = points.map((dp) => dp.log_observed);
    const rankCorrelation = this._pearsonCorrelation(logPreds, logObs);

    // Brier score (if binary classification data available)
    const binaryPoints = points.filter(
      (dp) => dp.predicted_confidence !== null && dp.observed_active !== null
    );
    let brierScore = null;
    let calibrationCurve = null;

    if (binaryPoints.length >= 5) {
      brierScore = this._computeBrierScore(binaryPoints);
      calibrationCurve = this._computeCalibrationCurve(binaryPoints);
    }

    // Update confidence weight
    const newWeight = this._computeAdjustedWeight(source, rmse, rankCorrelation);

    const calibration = {
      id: randomUUID(),
      source,
      target_class: options.target_class || "all",
      data_points: n,
      status: "calibrated",
      regression_metrics: {
        mean_signed_log_error: Math.round(meanSignedError * 1000) / 1000,
        mean_absolute_log_error: Math.round(meanAbsError * 1000) / 1000,
        rmse_log: Math.round(rmse * 1000) / 1000,
        std_dev_log: Math.round(stdDev * 1000) / 1000,
        rank_correlation: Math.round(rankCorrelation * 1000) / 1000,
        systematic_bias: Math.round(meanSignedError * 1000) / 1000,
        bias_direction: meanSignedError > 0.1
          ? "overpredicts"
          : meanSignedError < -0.1
            ? "underpredicts"
            : "unbiased",
      },
      binary_metrics: brierScore !== null
        ? {
            brier_score: Math.round(brierScore * 1000) / 1000,
            calibration_curve: calibrationCurve,
          }
        : null,
      adjusted_confidence_weight: newWeight,
      previous_confidence_weight: this.confidenceWeights.get(source) || DEFAULT_WEIGHTS[source] || 0.3,
      calibration_interval: {
        lower_bound_log: Math.round((-1.96 * stdDev) * 1000) / 1000,
        upper_bound_log: Math.round((1.96 * stdDev) * 1000) / 1000,
        coverage: 0.95,
        description: "95% prediction interval based on historical calibration data",
      },
      created_at: new Date().toISOString(),
    };

    this.sourceCalibrations.set(source, calibration);
    this.confidenceWeights.set(source, newWeight);
    this.calibrationHistory.push(calibration);

    return calibration;
  }

  /**
   * Calibrate all sources that have data.
   * @returns {object[]} Array of calibration records
   */
  calibrateAllSources() {
    const sources = [...new Set(this.dataPoints.map((dp) => dp.prediction_source))];
    return sources.map((source) => this.calibrateSource(source));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Calibrated prediction
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Apply calibration to a new raw prediction to produce a corrected estimate
   * with uncertainty bounds.
   *
   * @param {string} source — Prediction source
   * @param {number} rawPrediction — Raw predicted value
   * @returns {object} Calibrated prediction with uncertainty interval
   */
  calibratePrediction(source, rawPrediction) {
    const calibration = this.sourceCalibrations.get(source);

    if (!calibration || calibration.status !== "calibrated") {
      return {
        raw_prediction: rawPrediction,
        calibrated_prediction: rawPrediction,
        uncertainty_interval: null,
        calibration_applied: false,
        message: `No calibration data available for source "${source}". Returning raw prediction.`,
      };
    }

    const bias = calibration.regression_metrics.systematic_bias;
    const logRaw = rawPrediction > 0 ? Math.log10(rawPrediction) : 0;

    // Correct for systematic bias
    const logCorrected = logRaw - bias;
    const correctedValue = Math.pow(10, logCorrected);

    // Uncertainty bounds from calibration interval
    const lowerLog = logCorrected + calibration.calibration_interval.lower_bound_log;
    const upperLog = logCorrected + calibration.calibration_interval.upper_bound_log;

    return {
      raw_prediction: rawPrediction,
      calibrated_prediction: Math.round(correctedValue * 100) / 100,
      bias_correction_applied: Math.round(bias * 1000) / 1000,
      uncertainty_interval: {
        lower: Math.round(Math.pow(10, lowerLog) * 100) / 100,
        upper: Math.round(Math.pow(10, upperLog) * 100) / 100,
        coverage: 0.95,
      },
      calibration_applied: true,
      source,
      data_points_used: calibration.data_points,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Queries
  // ─────────────────────────────────────────────────────────────────────────

  /** Get current confidence weights for all sources */
  getConfidenceWeights() {
    return Object.fromEntries(this.confidenceWeights);
  }

  /** Get calibration record for a source */
  getSourceCalibration(source) {
    return this.sourceCalibrations.get(source) || null;
  }

  /** Get all data points */
  getDataPoints() {
    return [...this.dataPoints];
  }

  /** Get calibration history */
  getCalibrationHistory() {
    return [...this.calibrationHistory];
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Internal math helpers
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Pearson correlation coefficient.
   */
  _pearsonCorrelation(xs, ys) {
    const n = xs.length;
    if (n < 2) return 0;

    const meanX = xs.reduce((a, b) => a + b, 0) / n;
    const meanY = ys.reduce((a, b) => a + b, 0) / n;

    let num = 0;
    let denomX = 0;
    let denomY = 0;

    for (let i = 0; i < n; i++) {
      const dx = xs[i] - meanX;
      const dy = ys[i] - meanY;
      num += dx * dy;
      denomX += dx * dx;
      denomY += dy * dy;
    }

    const denom = Math.sqrt(denomX * denomY);
    return denom === 0 ? 0 : num / denom;
  }

  /**
   * Brier score for binary predictions: mean(predicted_prob - observed)^2
   */
  _computeBrierScore(binaryPoints) {
    const n = binaryPoints.length;
    const sumSq = binaryPoints.reduce((acc, dp) => {
      const observed = dp.observed_active ? 1 : 0;
      return acc + (dp.predicted_confidence - observed) ** 2;
    }, 0);
    return sumSq / n;
  }

  /**
   * Compute calibration curve: for each bin of predicted confidence,
   * what fraction was actually observed as active?
   */
  _computeCalibrationCurve(binaryPoints) {
    const bins = [];

    for (let i = 0; i < DEFAULT_BINS.length - 1; i++) {
      const lo = DEFAULT_BINS[i];
      const hi = DEFAULT_BINS[i + 1];
      const inBin = binaryPoints.filter(
        (dp) => dp.predicted_confidence >= lo && dp.predicted_confidence < hi
      );

      if (inBin.length === 0) continue;

      const meanPredicted = inBin.reduce(
        (acc, dp) => acc + dp.predicted_confidence, 0
      ) / inBin.length;
      const fractionActive = inBin.filter(
        (dp) => dp.observed_active
      ).length / inBin.length;

      bins.push({
        bin_lower: lo,
        bin_upper: hi,
        count: inBin.length,
        mean_predicted_confidence: Math.round(meanPredicted * 1000) / 1000,
        observed_fraction_active: Math.round(fractionActive * 1000) / 1000,
        calibration_gap: Math.round(Math.abs(meanPredicted - fractionActive) * 1000) / 1000,
      });
    }

    return bins;
  }

  /**
   * Compute adjusted confidence weight based on calibration quality.
   * Better-calibrated sources get higher weight.
   */
  _computeAdjustedWeight(source, rmse, rankCorrelation) {
    const baseWeight = DEFAULT_WEIGHTS[source] || 0.3;

    // RMSE factor: lower RMSE → higher weight
    const rmseFactor = Math.max(0.1, 1.0 / (1.0 + rmse));

    // Rank correlation factor: higher correlation → higher weight
    const corrFactor = Math.max(0.1, (rankCorrelation + 1.0) / 2.0);

    // Combined weight (geometric mean of factors, scaled by base)
    const combined = baseWeight * Math.sqrt(rmseFactor * corrFactor);

    // Clamp to [0.05, 1.0]
    return Math.round(Math.min(1.0, Math.max(0.05, combined)) * 1000) / 1000;
  }
}

export default PredictionCalibrator;
