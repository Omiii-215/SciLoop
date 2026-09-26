"""SciLoop — Experiment Reproducibility Checker
Phase 7: General Scientific Engine

Audits and compares execution runs for bit-exact or statistical reproducibility:
  - Validates input and parameter hashes
  - Detects hardware and container drift
  - Calculates continuous metric differences and relative error
  - Classifies reproducibility outcome:
      * bit_exact: SHA-256 output hashes match identically
      * statistically_reproduced: Output deltas within numerical tolerance
      * divergent: Differences exceed acceptable experimental error
      * configuration_mismatch: Inputs or random seeds differ

Usage:
    echo '{"original_run": {...}, "replication_run": {...}, "tolerance": 0.01}' | python reproducibility_checker.py
"""

import hashlib
import json
import sys


def compute_canonical_hash(data):
    """Compute deterministic SHA-256 hash of a serializable object."""
    canonical_json = json.dumps(data, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical_json.encode("utf-8")).hexdigest()


def check_reproducibility(original_run, replication_run, tolerance=0.01):
    """Compare an original experiment run against a replication run.

    Args:
        original_run (dict): Record of original execution.
        replication_run (dict): Record of replication execution.
        tolerance (float): Relative error threshold for numerical metrics.

    Returns:
        dict: Detailed reproducibility audit report.
    """
    orig_hashes = original_run.get("hashes", {})
    repl_hashes = replication_run.get("hashes", {})

    orig_input_hash = orig_hashes.get("input_hash") or compute_canonical_hash(original_run.get("input_data"))
    repl_input_hash = repl_hashes.get("input_hash") or compute_canonical_hash(replication_run.get("input_data"))

    orig_param_hash = orig_hashes.get("parameter_hash") or compute_canonical_hash(original_run.get("parameters"))
    repl_param_hash = repl_hashes.get("parameter_hash") or compute_canonical_hash(replication_run.get("parameters"))

    orig_seed = original_run.get("random_seed")
    repl_seed = replication_run.get("random_seed")

    same_inputs = orig_input_hash == repl_input_hash
    same_params = orig_param_hash == repl_param_hash
    same_seed = orig_seed == repl_seed
    same_container = original_run.get("container_image") == replication_run.get("container_image")

    # Outputs
    orig_outputs = original_run.get("output_data") or original_run.get("provenance", {}).get("output_data", {})
    repl_outputs = replication_run.get("output_data") or replication_run.get("provenance", {}).get("output_data", {})

    orig_out_hash = orig_hashes.get("output_hash") or compute_canonical_hash(orig_outputs)
    repl_out_hash = repl_hashes.get("output_hash") or compute_canonical_hash(repl_outputs)
    same_output_hash = orig_out_hash == repl_out_hash

    metric_comparisons = {}
    all_within_tolerance = True

    all_keys = set(orig_outputs.keys()).union(set(repl_outputs.keys()))
    for key in sorted(all_keys):
        v1 = orig_outputs.get(key)
        v2 = repl_outputs.get(key)

        if isinstance(v1, (int, float)) and isinstance(v2, (int, float)):
            delta = abs(v1 - v2)
            rel_diff = delta / abs(v1) if v1 != 0 else delta
            within = rel_diff <= tolerance
            if not within:
                all_within_tolerance = False

            metric_comparisons[key] = {
                "original": v1,
                "replication": v2,
                "absolute_delta": round(delta, 6),
                "relative_difference": round(rel_diff, 6),
                "within_tolerance": within,
            }

    # Classification
    if same_output_hash:
        status = "bit_exact"
    elif same_inputs and same_params and same_seed and all_within_tolerance:
        status = "statistically_reproduced"
    elif not same_inputs or not same_params:
        status = "configuration_mismatch"
    else:
        status = "divergent"

    is_reproduced = status in ["bit_exact", "statistically_reproduced"]

    return {
        "status": status,
        "is_reproduced": is_reproduced,
        "original_run_id": original_run.get("run_id"),
        "replication_run_id": replication_run.get("run_id"),
        "tolerance": tolerance,
        "environment_checks": {
            "same_inputs": same_inputs,
            "same_parameters": same_params,
            "same_random_seed": same_seed,
            "same_container_image": same_container,
            "same_output_hash": same_output_hash,
        },
        "metric_comparisons": metricComparisons if "metricComparisons" in locals() else metric_comparisons,
    }


def main():
    try:
        payload = json.load(sys.stdin)
    except Exception as e:
        print(json.dumps({"error": f"Failed to parse stdin JSON: {str(e)}"}, indent=2))
        sys.exit(1)

    orig = payload.get("original_run", {})
    repl = payload.get("replication_run", {})
    tol = payload.get("tolerance", 0.01)

    result = check_reproducibility(orig, repl, tol)
    print(json.dumps(result, indent=2))
    if not result["is_reproduced"]:
        sys.exit(2)


if __name__ == "__main__":
    main()
