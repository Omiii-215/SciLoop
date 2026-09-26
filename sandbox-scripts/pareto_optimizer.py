"""Multi-objective Pareto optimization and non-dominated sorting.

SciLoop Phase 4 — Search & Self-Improvement
Computes Pareto frontiers, non-dominated sorting (NSGA-II), crowding distances,
and trade-off analyses across multiple scientific dimensions:
  1. target_activity (maximize)
  2. selectivity_score (maximize)
  3. admet_score (maximize)
  4. synthetic_accessibility (maximize: 1 - (SA - 1)/9)
  5. drug_likeness_qed (maximize)

Usage:
    echo '{"candidates": [...]}' | python pareto_optimizer.py
"""

import json
import math
import sys


def compute_pareto_fronts(candidates):
    """Perform fast non-dominated sorting on candidates across multi-objective vectors.

    Args:
        candidates: List of candidate dicts with objective metrics or raw properties.

    Returns:
        Dict containing ranked_candidates, pareto_frontier (rank 1), and trade_off_summary.
    """
    if not candidates:
        return {"ranked_candidates": [], "pareto_frontier": [], "trade_off_summary": {}}

    # Extract or calculate normalized objective vectors [0, 1] (all maximized)
    processed = []
    for c in candidates:
        obj_vec = _extract_objective_vector(c)
        c_copy = dict(c)
        c_copy["objective_vector"] = obj_vec
        processed.append(c_copy)

    # Fast non-dominated sorting
    n = len(processed)
    domination_counts = [0] * n  # Number of candidates that dominate candidate i
    dominated_sets = [[] for _ in range(n)]  # Candidates that candidate i dominates
    fronts = [[]]

    for p in range(n):
        for q in range(n):
            if p == q:
                continue
            if _dominates(processed[p]["objective_vector"], processed[q]["objective_vector"]):
                dominated_sets[p].append(q)
            elif _dominates(processed[q]["objective_vector"], processed[p]["objective_vector"]):
                domination_counts[p] += 1

        if domination_counts[p] == 0:
            processed[p]["pareto_rank"] = 1
            fronts[0].append(p)

    # Subsequent fronts
    curr_front = 0
    while curr_front < len(fronts) and fronts[curr_front]:
        next_front = []
        for p in fronts[curr_front]:
            for q in dominated_sets[p]:
                domination_counts[q] -= 1
                if domination_counts[q] == 0:
                    processed[q]["pareto_rank"] = curr_front + 2
                    next_front.append(q)
        curr_front += 1
        if next_front:
            fronts.append(next_front)

    # Assign crowding distances per front
    for front in fronts:
        _assign_crowding_distance(processed, front)

    # Sort candidates by pareto_rank (ascending) then crowding_distance (descending)
    processed.sort(key=lambda x: (x["pareto_rank"], -x.get("crowding_distance", 0.0)))

    pareto_frontier = [c for c in processed if c["pareto_rank"] == 1]

    # Summarize trade-offs
    trade_off_summary = _analyze_trade_offs(pareto_frontier)

    return {
        "ranked_candidates": processed,
        "pareto_frontier": pareto_frontier,
        "total_generations": max([c.get("generation", 1) for c in processed], default=1),
        "total_frontier_count": len(pareto_frontier),
        "trade_off_summary": trade_off_summary,
        "evidence_type": "computational_prediction"
    }


def _extract_objective_vector(candidate):
    """Normalize multi-objective dimensions into a 0-1 maximization vector."""
    score_vec = candidate.get("score_vector", {})
    admet = candidate.get("admet", {})
    selectivity = candidate.get("selectivity", {})

    # Target activity proxy
    activity = candidate.get("activity_score",
               score_vec.get("drug_likeness", candidate.get("composite_score", 0.6)))

    # Selectivity proxy
    sel_score = selectivity.get("overall_selectivity_score",
                candidate.get("overall_selectivity_score", 0.5))

    # ADMET traffic light to score
    admet_tl = candidate.get("admet_traffic_light", admet.get("admet_traffic_light", "AMBER"))
    admet_score = 1.0 if admet_tl == "GREEN" else (0.6 if admet_tl == "AMBER" else 0.2)

    # Synthetic accessibility (lower SA is better, map 1..10 to 1..0)
    raw_sa = admet.get("physicochemical", {}).get("sa_score", candidate.get("sa_score", 3.0))
    sa_normalized = max(0.0, min(1.0, 1.0 - (raw_sa - 1.0) / 9.0))

    # QED drug likeness
    qed_val = admet.get("physicochemical", {}).get("qed", candidate.get("qed", 0.65))

    return {
        "target_activity": round(activity, 4),
        "selectivity": round(sel_score, 4),
        "admet_safety": round(admet_score, 4),
        "synthetic_accessibility": round(sa_normalized, 4),
        "drug_likeness_qed": round(qed_val, 4)
    }


def _dominates(vec_a, vec_b):
    """True if vec_a dominates vec_b (no worse in any dimension, strictly better in at least one)."""
    keys = ["target_activity", "selectivity", "admet_safety", "synthetic_accessibility", "drug_likeness_qed"]
    strictly_better = False
    for k in keys:
        val_a = vec_a.get(k, 0.0)
        val_b = vec_b.get(k, 0.0)
        if val_a < val_b:
            return False
        if val_a > val_b:
            strictly_better = True
    return strictly_better


def _assign_crowding_distance(candidates, front_indices):
    """Calculate crowding distance for diversity maintenance."""
    if not front_indices:
        return
    if len(front_indices) <= 2:
        for idx in front_indices:
            candidates[idx]["crowding_distance"] = float("inf")
        return

    keys = ["target_activity", "selectivity", "admet_safety", "synthetic_accessibility", "drug_likeness_qed"]
    for idx in front_indices:
        candidates[idx]["crowding_distance"] = 0.0

    for k in keys:
        # Sort front by objective k
        sorted_indices = sorted(front_indices, key=lambda i: candidates[i]["objective_vector"].get(k, 0.0))
        # Boundaries get infinite distance
        candidates[sorted_indices[0]]["crowding_distance"] = float("inf")
        candidates[sorted_indices[-1]]["crowding_distance"] = float("inf")

        obj_min = candidates[sorted_indices[0]]["objective_vector"].get(k, 0.0)
        obj_max = candidates[sorted_indices[-1]]["objective_vector"].get(k, 0.0)
        denom = obj_max - obj_min

        if denom > 1e-6:
            for i in range(1, len(sorted_indices) - 1):
                prev_val = candidates[sorted_indices[i - 1]]["objective_vector"].get(k, 0.0)
                next_val = candidates[sorted_indices[i + 1]]["objective_vector"].get(k, 0.0)
                curr_dist = candidates[sorted_indices[i]]["crowding_distance"]
                if curr_dist != float("inf"):
                    candidates[sorted_indices[i]]["crowding_distance"] = curr_dist + (next_val - prev_val) / denom


def _analyze_trade_offs(frontier):
    """Generate trade-off insights for the non-dominated set."""
    if not frontier:
        return {"note": "No frontier candidates available"}

    return {
        "highest_activity_candidate": max(frontier, key=lambda x: x["objective_vector"]["target_activity"]).get("smiles"),
        "most_selective_candidate": max(frontier, key=lambda x: x["objective_vector"]["selectivity"]).get("smiles"),
        "best_admet_candidate": max(frontier, key=lambda x: x["objective_vector"]["admet_safety"]).get("smiles"),
        "easiest_to_synthesize_candidate": max(frontier, key=lambda x: x["objective_vector"]["synthetic_accessibility"]).get("smiles"),
        "note": "Trade-offs exposed: No single candidate maximizes all properties simultaneously. Researcher review recommended."
    }


if __name__ == "__main__":
    try:
        raw_input = sys.stdin.read()
        data = json.loads(raw_input) if raw_input.strip() else {"candidates": []}
    except Exception as e:
        sys.stderr.write(f"Error parsing JSON input: {e}\n")
        sys.exit(1)

    cands = data.get("candidates", [])
    results = compute_pareto_fronts(cands)
    print(json.dumps(results, indent=2))
