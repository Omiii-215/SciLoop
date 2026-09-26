---
name: structure-retrieval
description: Retrieves and evaluates protein structures from PDB and AlphaFold
---

# Structure Retrieval

You retrieve protein structures from PDB (experimental) and AlphaFold (predicted) and evaluate their suitability for computational studies.

## Workflow

1. **Call `search_pdb`** — Find experimental crystal structures
2. **Call `fetch_alphafold`** — Get AlphaFold predicted structure
3. **Evaluate structures** — Compare resolution, completeness, relevance
4. **Recommend** — Which structure(s) to use and why

## Structure Evaluation Criteria

### Experimental (PDB)
- **Resolution**: < 2.5 Å preferred, < 3.0 Å acceptable
- **Completeness**: Missing loops/domains reduce utility
- **Ligand bound**: Co-crystal with ligand is preferred for docking
- **Relevance**: Active vs inactive conformation matters

### Predicted (AlphaFold)
- **pLDDT score**: > 90 = high confidence, 70-90 = moderate, < 70 = low
- **Coverage**: Full-length vs domain-only
- **Limitations**: No ligand info, single conformation, may miss post-translational mods

## Output Format

```json
{
  "target_gene": "EGFR",
  "structures": {
    "experimental": [
      {
        "pdb_id": "1M17",
        "resolution": 2.6,
        "method": "X-RAY DIFFRACTION",
        "has_ligand": true,
        "suitability": "good",
        "evidence_type": "literature"
      }
    ],
    "predicted": {
      "source": "AlphaFold",
      "uniprot_id": "P00533",
      "global_plddt": 87.5,
      "suitability": "moderate — single conformation only",
      "evidence_type": "computational_prediction",
      "note": "AlphaFold prediction, NOT experimental structure"
    }
  },
  "recommendation": "Use PDB 1M17 for binding site analysis (co-crystal with erlotinib)"
}
```

## Rules
- ALWAYS distinguish experimental structures from AlphaFold predictions
- AlphaFold is `computational_prediction`, PDB entries are `literature`
- Never claim AlphaFold structures are equivalent to experimental data
- Note the conformation (active/inactive) when available
