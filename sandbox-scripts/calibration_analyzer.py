"""
SciLoop — Calibration Analyzer
Phase 6: Experimental Feedback

Analyzes prediction accuracy by comparing computational predictions against
experimental ground truth. Computes calibration metrics, generates diagnostic
plots data, and identifies systematic biases.

Input (JSON via stdin):
  {
    "mappings": [
      {
        "prediction_source": "docking_engine",
        "predicted_value": 150.0,
        "observed_value": 85.0,
        "predicted_confidence": 0.7,
        "observed_active": true
      },
      ...
    ]
  }

Output (JSON to stdout):
  {
    "per_source": { ... },
    "overall": { ... },
    "calibration_curves": { ... },
    "recommendations": [ ... ]
  }
"""

import json
import sys
import math
from collections import defaultdict


def compute_log_metrics(predicted, observed):
    """Compute log-scale error metrics for a (predicted, observed) pair."""
    log_p = math.log10(predicted) if predicted > 0 else 0
    log_o = math.log10(observed) if observed > 0 else 0
    signed_error = log_p - log_o
    abs_error = abs(signed_error)
    return {
        "log_predicted": round(log_p, 4),
        "log_observed": round(log_o, 4),
        "signed_log_error": round(signed_error, 4),
        "abs_log_error": round(abs_error, 4),
        "within_one_log": abs_error <= 1.0,
        "within_half_log": abs_error <= 0.5,
    }


def pearson_correlation(xs, ys):
    """Compute Pearson correlation coefficient."""
    n = len(xs)
    if n < 2:
        return 0.0
    mean_x = sum(xs) / n
    mean_y = sum(ys) / n
    num = sum((x - mean_x) * (y - mean_y) for x, y in zip(xs, ys))
    denom_x = math.sqrt(sum((x - mean_x) ** 2 for x in xs))
    denom_y = math.sqrt(sum((y - mean_y) ** 2 for y in ys))
    denom = denom_x * denom_y
    return num / denom if denom > 0 else 0.0


def compute_brier_score(binary_points):
    """Brier score for probabilistic binary predictions."""
    n = len(binary_points)
    if n == 0:
        return None
    sum_sq = sum(
        (p["predicted_confidence"] - (1.0 if p["observed_active"] else 0.0)) ** 2
        for p in binary_points
    )
    return round(sum_sq / n, 4)


def compute_calibration_curve(binary_points, bins=10):
    """Compute calibration curve: predicted confidence vs observed frequency."""
    curve = []
    for i in range(bins):
        lo = i / bins
        hi = (i + 1) / bins
        in_bin = [p for p in binary_points if lo <= p["predicted_confidence"] < hi]
        if not in_bin:
            continue
        mean_pred = sum(p["predicted_confidence"] for p in in_bin) / len(in_bin)
        frac_active = sum(1 for p in in_bin if p["observed_active"]) / len(in_bin)
        curve.append({
            "bin_lower": round(lo, 2),
            "bin_upper": round(hi, 2),
            "count": len(in_bin),
            "mean_predicted": round(mean_pred, 4),
            "fraction_active": round(frac_active, 4),
            "gap": round(abs(mean_pred - frac_active), 4),
        })
    return curve


def analyze_source(source_name, mappings):
    """Compute calibration metrics for a single prediction source."""
    log_metrics = [compute_log_metrics(m["predicted_value"], m["observed_value"]) for m in mappings]

    n = len(mappings)
    signed_errors = [lm["signed_log_error"] for lm in log_metrics]
    abs_errors = [lm["abs_log_error"] for lm in log_metrics]

    mean_signed = sum(signed_errors) / n
    mean_abs = sum(abs_errors) / n
    rmse = math.sqrt(sum(e ** 2 for e in abs_errors) / n)
    variance = sum((e - mean_signed) ** 2 for e in signed_errors) / n
    std_dev = math.sqrt(variance)

    log_preds = [lm["log_predicted"] for lm in log_metrics]
    log_obs = [lm["log_observed"] for lm in log_metrics]
    rank_corr = pearson_correlation(log_preds, log_obs)

    within_one = sum(1 for lm in log_metrics if lm["within_one_log"]) / n
    within_half = sum(1 for lm in log_metrics if lm["within_half_log"]) / n

    # Binary calibration (if data available)
    binary_points = [
        m for m in mappings
        if m.get("predicted_confidence") is not None and m.get("observed_active") is not None
    ]
    brier = compute_brier_score(binary_points) if len(binary_points) >= 5 else None
    cal_curve = compute_calibration_curve(binary_points) if len(binary_points) >= 5 else None

    return {
        "source": source_name,
        "data_points": n,
        "mean_signed_log_error": round(mean_signed, 4),
        "mean_absolute_log_error": round(mean_abs, 4),
        "rmse_log": round(rmse, 4),
        "std_dev_log": round(std_dev, 4),
        "rank_correlation": round(rank_corr, 4),
        "within_one_log_fraction": round(within_one, 4),
        "within_half_log_fraction": round(within_half, 4),
        "bias_direction": "overpredicts" if mean_signed > 0.1 else (
            "underpredicts" if mean_signed < -0.1 else "unbiased"
        ),
        "brier_score": brier,
        "calibration_curve": cal_curve,
    }


def generate_recommendations(per_source):
    """Generate actionable recommendations based on calibration analysis."""
    recs = []
    for source, metrics in per_source.items():
        # Bias correction
        if abs(metrics["mean_signed_log_error"]) > 0.5:
            direction = "overestimates" if metrics["mean_signed_log_error"] > 0 else "underestimates"
            recs.append({
                "source": source,
                "type": "bias_correction",
                "severity": "warning",
                "message": (
                    f"{source} systematically {direction} by "
                    f"{abs(metrics['mean_signed_log_error']):.2f} log units. "
                    f"Apply a correction of {-metrics['mean_signed_log_error']:.2f} log units."
                ),
            })

        # Poor rank correlation
        if metrics["rank_correlation"] < 0.3 and metrics["data_points"] >= 10:
            recs.append({
                "source": source,
                "type": "poor_ranking",
                "severity": "critical",
                "message": (
                    f"{source} has poor rank correlation ({metrics['rank_correlation']:.2f}). "
                    f"Rankings from this source are unreliable for this target class."
                ),
            })

        # High variance
        if metrics["std_dev_log"] > 1.5:
            recs.append({
                "source": source,
                "type": "high_variance",
                "severity": "warning",
                "message": (
                    f"{source} predictions have high variance (σ = {metrics['std_dev_log']:.2f} log). "
                    f"Consider ensemble methods or additional descriptors."
                ),
            })

    return recs


def main():
    data = json.load(sys.stdin)
    mappings = data.get("mappings", [])

    if not mappings:
        print(json.dumps({
            "error": "No mappings provided",
            "note": "Calibration analysis requires prediction-to-observation mappings"
        }, indent=2))
        return

    # Group by source
    by_source = defaultdict(list)
    for m in mappings:
        by_source[m["prediction_source"]].append(m)

    per_source = {}
    for source, source_mappings in by_source.items():
        if len(source_mappings) >= 3:
            per_source[source] = analyze_source(source, source_mappings)

    # Overall metrics
    all_log_errors = []
    for m in mappings:
        lm = compute_log_metrics(m["predicted_value"], m["observed_value"])
        all_log_errors.append(lm["abs_log_error"])

    n_total = len(all_log_errors)
    overall = {
        "total_mappings": n_total,
        "overall_mae_log": round(sum(all_log_errors) / n_total, 4) if n_total > 0 else None,
        "overall_rmse_log": (
            round(math.sqrt(sum(e ** 2 for e in all_log_errors) / n_total), 4)
            if n_total > 0 else None
        ),
    }

    recommendations = generate_recommendations(per_source)

    result = {
        "per_source": per_source,
        "overall": overall,
        "recommendations": recommendations,
        "disclaimer": (
            "Calibration analysis is based on available experimental data. "
            "Results should be interpreted in the context of the target class and assay type."
        ),
    }

    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
