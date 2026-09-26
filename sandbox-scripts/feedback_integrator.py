"""
SciLoop — Feedback Integrator
Phase 6: Experimental Feedback

Statistically integrates experimental feedback to update campaign parameters.
Computes posterior hit rates using Bayesian updating, adjusts scoring weights
based on empirical calibration, and generates transfer records for subsequent
campaigns.

Input (JSON via stdin):
  {
    "results": [
      {
        "candidate_id": "...",
        "assay_type": "binding_affinity",
        "measurements": {"ic50_nM": 85.0},
        "activity_label": "active",
        "predicted_rank": 3
      },
      ...
    ],
    "prediction_mappings": [
      {
        "prediction_source": "docking_engine",
        "predicted_value": 150.0,
        "observed_value": 85.0
      },
      ...
    ],
    "prior_hit_rate": 0.15
  }

Output (JSON to stdout):
  {
    "posterior_hit_rate": { ... },
    "rank_enrichment": { ... },
    "weight_adjustments": { ... },
    "transfer_recommendations": [ ... ]
  }
"""

import json
import sys
import math
from collections import defaultdict


def bayesian_hit_rate_update(prior, successes, total, pseudo_count=2):
    """
    Bayesian update for hit rate using Beta-Binomial model.

    Args:
        prior: Prior hit rate estimate (0-1)
        successes: Number of active compounds
        total: Total compounds tested
        pseudo_count: Strength of the prior (higher = more weight on prior)

    Returns:
        Posterior hit rate and credible interval.
    """
    alpha_prior = prior * pseudo_count
    beta_prior = (1 - prior) * pseudo_count

    alpha_post = alpha_prior + successes
    beta_post = beta_prior + (total - successes)

    posterior_mean = alpha_post / (alpha_post + beta_post)

    # Approximate 95% credible interval using normal approximation
    var = (alpha_post * beta_post) / (
        (alpha_post + beta_post) ** 2 * (alpha_post + beta_post + 1)
    )
    std = math.sqrt(var)

    return {
        "prior_hit_rate": round(prior, 4),
        "observed_hit_rate": round(successes / total, 4) if total > 0 else 0,
        "posterior_hit_rate": round(posterior_mean, 4),
        "credible_interval_95": {
            "lower": round(max(0, posterior_mean - 1.96 * std), 4),
            "upper": round(min(1, posterior_mean + 1.96 * std), 4),
        },
        "alpha": round(alpha_post, 2),
        "beta": round(beta_post, 2),
        "total_tested": total,
        "total_active": successes,
    }


def compute_rank_enrichment(results, top_fractions=None):
    """
    Compute enrichment factors: are actives enriched at the top of the ranked list?

    An enrichment factor > 1.0 means the ranking is better than random.
    """
    if top_fractions is None:
        top_fractions = [0.01, 0.05, 0.10, 0.20]

    # Sort by predicted rank
    sorted_results = sorted(results, key=lambda r: r.get("predicted_rank", 9999))
    n = len(sorted_results)
    total_active = sum(1 for r in sorted_results if r.get("activity_label") == "active")

    if n == 0 or total_active == 0:
        return {"status": "insufficient_data", "enrichment_factors": {}}

    overall_hit_rate = total_active / n
    enrichment = {}

    for frac in top_fractions:
        top_n = max(1, int(n * frac))
        top_slice = sorted_results[:top_n]
        actives_in_top = sum(1 for r in top_slice if r.get("activity_label") == "active")
        top_hit_rate = actives_in_top / top_n

        ef = top_hit_rate / overall_hit_rate if overall_hit_rate > 0 else 0
        enrichment[f"EF_{int(frac * 100)}%"] = {
            "enrichment_factor": round(ef, 3),
            "actives_found": actives_in_top,
            "compounds_screened": top_n,
            "hit_rate_in_top": round(top_hit_rate, 4),
        }

    return {
        "status": "computed",
        "overall_hit_rate": round(overall_hit_rate, 4),
        "total_compounds": n,
        "total_actives": total_active,
        "enrichment_factors": enrichment,
    }


def compute_weight_adjustments(prediction_mappings):
    """
    Compute empirical weight adjustments for each prediction source
    based on how well its predictions match experimental observations.
    """
    by_source = defaultdict(list)
    for m in prediction_mappings:
        by_source[m["prediction_source"]].append(m)

    adjustments = {}
    for source, mappings in by_source.items():
        log_errors = []
        for m in mappings:
            p = m["predicted_value"]
            o = m["observed_value"]
            log_p = math.log10(p) if p > 0 else 0
            log_o = math.log10(o) if o > 0 else 0
            log_errors.append(abs(log_p - log_o))

        n = len(log_errors)
        mae = sum(log_errors) / n
        rmse = math.sqrt(sum(e ** 2 for e in log_errors) / n)

        # Weight inversely proportional to RMSE: lower error → higher weight
        raw_weight = 1.0 / (1.0 + rmse)
        clamped_weight = max(0.05, min(1.0, raw_weight))

        adjustments[source] = {
            "count": n,
            "mae_log": round(mae, 4),
            "rmse_log": round(rmse, 4),
            "recommended_weight": round(clamped_weight, 4),
        }

    return adjustments


def generate_transfer_recommendations(posterior, enrichment, adjustments):
    """Generate actionable transfer recommendations for future campaigns."""
    recs = []

    # Hit rate guidance
    hr = posterior.get("posterior_hit_rate", 0)
    if hr < 0.05:
        recs.append({
            "category": "hit_rate",
            "action": "Posterior hit rate is very low. Consider changing the target "
                      "class or applying stricter pre-filtering.",
        })
    elif hr > 0.3:
        recs.append({
            "category": "hit_rate",
            "action": "Excellent hit rate. Computational pipeline is well-calibrated "
                      "for this target. Expand chemical diversity in next campaign.",
        })

    # Enrichment guidance
    if enrichment.get("status") == "computed":
        ef_data = enrichment.get("enrichment_factors", {})
        ef_1 = ef_data.get("EF_1%", {}).get("enrichment_factor", 0)
        if ef_1 > 10:
            recs.append({
                "category": "ranking",
                "action": f"Strong early enrichment (EF 1% = {ef_1:.1f}x). "
                          "Ranking model is highly effective — trust top-ranked candidates.",
            })
        elif ef_1 < 1.5:
            recs.append({
                "category": "ranking",
                "action": "Poor early enrichment. Ranking is not much better than random. "
                          "Consider alternative scoring functions or consensus scoring.",
            })

    # Source-specific guidance
    for source, adj in adjustments.items():
        if adj["rmse_log"] > 1.5:
            recs.append({
                "category": "source_quality",
                "action": f"Predictions from '{source}' have high error (RMSE = "
                          f"{adj['rmse_log']:.2f} log). De-weight or replace this source.",
            })

    return recs


def main():
    data = json.load(sys.stdin)

    results = data.get("results", [])
    prediction_mappings = data.get("prediction_mappings", [])
    prior_hit_rate = data.get("prior_hit_rate", 0.15)

    if not results:
        print(json.dumps({
            "error": "No experimental results provided",
            "note": "Feedback integration requires experimental result data"
        }, indent=2))
        return

    # 1. Bayesian hit rate update
    total = len(results)
    actives = sum(1 for r in results if r.get("activity_label") == "active")
    posterior = bayesian_hit_rate_update(prior_hit_rate, actives, total)

    # 2. Rank enrichment
    enrichment = compute_rank_enrichment(results)

    # 3. Weight adjustments
    adjustments = compute_weight_adjustments(prediction_mappings) if prediction_mappings else {}

    # 4. Transfer recommendations
    recommendations = generate_transfer_recommendations(posterior, enrichment, adjustments)

    output = {
        "posterior_hit_rate": posterior,
        "rank_enrichment": enrichment,
        "weight_adjustments": adjustments,
        "transfer_recommendations": recommendations,
        "disclaimer": (
            "All metrics are based on available experimental data and "
            "computational predictions. Results should be reviewed by a "
            "qualified scientist before informing campaign decisions."
        ),
    }

    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
