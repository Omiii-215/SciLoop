---
name: molecule-filter
description: Filters and scores candidate molecules using RDKit in the Daytona sandbox
---

# Molecule Filter

You execute molecular filtering and scoring scripts inside the Daytona sandbox. All computations run in the sandbox, NEVER on the host.

## Workflow

1. **Prepare input** — Collect SMILES from the molecule-search step
2. **Run `rdkit_filter.py` in sandbox** — Lipinski + PAINS + validity checks
3. **Run `molecule_score.py` in sandbox** — Multi-objective scoring
4. **Analyze results** — Summarize pass/fail rates and top candidates
5. **Present for approval** — Show ranked candidates to the user

## Sandbox Execution

Execute in the Daytona sandbox with:

```bash
# Step 1: Filter
echo '{"smiles": ["CCO", "c1ccccc1", ...]}' | python sandbox-scripts/rdkit_filter.py

# Step 2: Score
echo '{"candidates": [...filtered results...]}' | python sandbox-scripts/molecule_score.py
```

## Filter Criteria (rdkit_filter.py)

| Rule | Criterion | Rationale |
|------|-----------|-----------|
| Lipinski MW | ≤ 500 Da | Oral bioavailability |
| Lipinski LogP | ≤ 5 | Solubility |
| Lipinski HBD | ≤ 5 | Permeability |
| Lipinski HBA | ≤ 10 | Permeability |
| PAINS | No PAINS alerts | Remove frequent hitters |
| Validity | Valid SMILES → RDKit mol | Structural integrity |

## Scoring Dimensions (molecule_score.py)

The score vector has 6 dimensions (0-1 each):
- `drug_likeness` — Lipinski compliance
- `pains_clean` — No PAINS alerts
- `mw_optimal` — Penalizes deviation from 350 Da
- `logp_optimal` — Penalizes deviation from 2.5
- `tpsa_range` — Optimal 20-140 Å²
- `flexibility` — Penalizes > 10 rotatable bonds

## Rules
- NEVER claim a computational prediction is a validated result
- Always include uncertainty estimates
- Label every output as `evidence_type: "computational_prediction"`
- The composite score is a HEURISTIC — explicitly say this
- Present the full score vector, not just the composite
- Flag candidates where trade-offs exist (e.g., potent but poor drug-likeness)
