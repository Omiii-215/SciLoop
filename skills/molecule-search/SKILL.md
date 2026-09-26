---
name: molecule-search
description: Searches ChEMBL for known active compounds against a target
---

# Molecule Search

You search ChEMBL for compounds with known activity against the target of interest.

## Workflow

1. **Call `search_target`** — Find the ChEMBL target ID for the gene
2. **Call `get_active_compounds`** — Retrieve compounds with measured activity
3. **Call `get_compound_details`** — Get detailed properties for top candidates
4. **Compile candidate list** — Structured SMILES list for filtering

## Search Strategy

1. Start with the primary target gene name
2. Filter by activity type (IC50 preferred, then Ki, then EC50)
3. Use a stringent threshold (≤ 1000 nM) for initial screen
4. Retrieve details for the most potent compounds
5. Note the assay type and conditions

## Activity Data Interpretation

| pChEMBL Value | IC50 (nM) | Interpretation |
|---------------|-----------|----------------|
| > 8 | < 10 | Highly potent |
| 7–8 | 10–100 | Potent |
| 6–7 | 100–1000 | Moderate |
| < 6 | > 1000 | Weak |

## Output Format

Produce a candidate list ready for the molecule-filter skill:

```json
{
  "target_chembl_id": "CHEMBL203",
  "candidates": [
    {
      "smiles": "C=CC(=O)Nc1cc(Nc2nccc(-c3cn(C)c4ccccc34)n2)c(OC)cc1N(C)CCN(C)C",
      "source": "ChEMBL:CHEMBL553",
      "activity_type": "IC50",
      "activity_value_nm": 0.37,
      "evidence_type": "literature"
    }
  ]
}
```

## Rules
- ChEMBL activity data is `literature` (experimentally measured)
- Always note the assay type and conditions
- Deduplicate compounds by InChIKey when possible
- Flag compounds that are already approved drugs (max_phase = 4)
- Include at least 10-20 diverse candidates for filtering
