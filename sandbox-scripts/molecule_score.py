"""Multi-objective scoring — exposes trade-offs, no single opaque score.

SciLoop Phase 0 — Sandbox script for candidate molecule scoring.
Runs inside the Daytona sandbox. Reads filtered candidates from stdin, writes scored + ranked output.

Usage:
    echo '{"candidates": [...]}' | python molecule_score.py
"""
import json
import sys


def score_candidates(candidates):
    """Score and rank candidate molecules using a multi-objective approach.

    IMPORTANT: This produces a heuristic score vector, NOT a validated metric.
    Each dimension captures one aspect of drug-likeness. Trade-offs are
    explicitly exposed — there is no single "best" score.

    Args:
        candidates: List of filtered candidate dicts (from rdkit_filter.py).

    Returns:
        Scored and ranked list of candidates that passed all filters.
    """
    scored = []

    for c in candidates:
        # Only score candidates that passed all filters
        if not c.get("pass_all"):
            continue

        # Multi-objective score vector
        # Each dimension is 0-1, higher is better
        score_vector = {
            "drug_likeness": 1.0 if c.get("lipinski_pass") else 0.0,
            "pains_clean": 1.0 if c.get("pains_pass") else 0.0,
            "mw_optimal": max(0, 1 - abs(c.get("molecular_weight", c.get("mw", 350)) - 350) / 150),
            "logp_optimal": max(0, 1 - abs(c.get("logp", 2.5) - 2.5) / 2.5),
            "tpsa_range": _tpsa_score(c.get("tpsa", 75)),
            "flexibility": _flexibility_score(c.get("rotatable_bonds", 5)),
        }

        c["score_vector"] = score_vector
        c["composite_score"] = round(sum(score_vector.values()) / len(score_vector), 4)
        c["composite_note"] = "This is a weighted heuristic, NOT a validated metric"
        c["evidence_type"] = "computational_prediction"
        scored.append(c)

    # Sort by composite score (descending) — but expose the full vector
    scored.sort(key=lambda x: x["composite_score"], reverse=True)
    for i, c in enumerate(scored):
        c["rank"] = i + 1

    return scored


def _tpsa_score(tpsa):
    """Score TPSA — optimal range 20-140 Å² for oral bioavailability."""
    if 20 <= tpsa <= 140:
        return 1.0
    elif tpsa < 20:
        return max(0, tpsa / 20)
    else:
        return max(0, 1 - (tpsa - 140) / 60)


def _flexibility_score(rotatable_bonds):
    """Score rotatable bonds — fewer is generally better for binding, optimal < 10."""
    if rotatable_bonds <= 5:
        return 1.0
    elif rotatable_bonds <= 10:
        return 0.5 + 0.5 * (10 - rotatable_bonds) / 5
    else:
        return max(0, 0.5 * (15 - rotatable_bonds) / 5)


if __name__ == "__main__":
    data = json.load(sys.stdin)
    results = score_candidates(data["candidates"])
    print(json.dumps(results, indent=2))
