"""SciLoop — Scientific Domain Plugin Validator
Phase 7: General Scientific Engine

Validates domain descriptor configurations for compatibility with the
SciLoop closed-loop research engine. Checks:
  - Required schema fields and structure
  - Candidate representation integrity
  - Evidence hierarchy validity and monotonicity
  - Tool and evaluator contract conformance
  - Primary metric specifications

Usage:
    echo '{"id": "materials_discovery", ...}' | python domain_validator.py
    python domain_validator.py --file domain_config.json
"""

import json
import sys


def validate_domain_descriptor(descriptor):
    """Validate a scientific domain descriptor.

    Args:
        descriptor (dict): Domain configuration dictionary.

    Returns:
        dict: Validation report with status, errors, warnings, and capability summary.
    """
    errors = []
    warnings = []

    if not isinstance(descriptor, dict):
        return {
            "valid": False,
            "status": "invalid_format",
            "errors": ["Domain descriptor must be a JSON object."],
            "warnings": [],
        }

    # Required core identity fields
    for field in ["id", "name", "version", "candidate_type", "candidate_representation"]:
        if not descriptor.get(field):
            errors.append(f"Missing required field: '{field}'")
        elif not isinstance(descriptor[field], str):
            errors.append(f"Field '{field}' must be a string")

    # Hypothesis types
    hyp_types = descriptor.get("hypothesis_types")
    if not isinstance(hyp_types, list) or len(hyp_types) == 0:
        errors.append("Field 'hypothesis_types' must be a non-empty list of strings")
    else:
        for idx, ht in enumerate(hyp_types):
            if not isinstance(ht, str):
                errors.append(f"Hypothesis type at index {idx} must be a string")

    # Evidence hierarchy
    ev_hier = descriptor.get("evidence_hierarchy")
    if not isinstance(ev_hier, list) or len(ev_hier) == 0:
        errors.append("Field 'evidence_hierarchy' must be a non-empty list of evidence levels")
    else:
        ranks = []
        for idx, item in enumerate(ev_hier):
            if not isinstance(item, dict):
                errors.append(f"Evidence hierarchy item at index {idx} must be an object")
                continue
            if "type" not in item or not isinstance(item["type"], str):
                errors.append(f"Evidence item {idx} missing 'type' string")
            rank = item.get("trust_rank")
            weight = item.get("base_weight")
            if rank is None or not isinstance(rank, int) or rank < 1:
                errors.append(f"Evidence item {idx} must have positive integer 'trust_rank'")
            else:
                ranks.append(rank)
            if weight is None or not (0.0 <= weight <= 1.0):
                errors.append(f"Evidence item {idx} 'base_weight' must be a float between 0.0 and 1.0")

        # Check rank ordering
        if ranks and ranks != sorted(ranks):
            warnings.append("Evidence hierarchy trust_ranks are not strictly monotonically ascending")

    # Primary metrics
    metrics = descriptor.get("primary_metrics", [])
    if not isinstance(metrics, list) or len(metrics) == 0:
        warnings.append("No 'primary_metrics' defined; default evaluators may have reduced efficacy")

    # Tool definitions
    tools = descriptor.get("tools", [])
    tool_summary = []
    if isinstance(tools, list):
        for idx, t in enumerate(tools):
            if isinstance(t, dict):
                name = t.get("name", f"tool_{idx}")
                ttype = t.get("type", "unknown")
                tool_summary.append({"name": name, "type": ttype})
                if ttype not in ["simulator", "evaluator", "generator", "filter"]:
                    warnings.append(f"Tool '{name}' has non-standard type '{ttype}'")

    valid = len(errors) == 0
    return {
        "valid": valid,
        "status": "valid" if valid else "invalid",
        "domain_id": descriptor.get("id"),
        "domain_name": descriptor.get("name"),
        "candidate_modality": f"{descriptor.get('candidate_type')} ({descriptor.get('candidate_representation')})",
        "hypothesis_types_count": len(hyp_types) if isinstance(hyp_types, list) else 0,
        "evidence_levels_count": len(ev_hier) if isinstance(ev_hier, list) else 0,
        "tools_registered": tool_summary,
        "errors": errors,
        "warnings": warnings,
    }


def main():
    if len(sys.argv) > 2 and sys.argv[1] == "--file":
        with open(sys.argv[2], "r") as f:
            data = json.load(f)
    else:
        try:
            data = json.load(sys.stdin)
        except Exception as e:
            print(json.dumps({"valid": False, "error": f"Failed to parse stdin JSON: {str(e)}"}, indent=2))
            sys.exit(1)

    result = validate_domain_descriptor(data)
    print(json.dumps(result, indent=2))
    if not result["valid"]:
        sys.exit(1)


if __name__ == "__main__":
    main()
