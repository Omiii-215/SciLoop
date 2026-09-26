---
name: target-biology
description: Assesses therapeutic target validity using UniProt data and biological reasoning
---

# Target Biology Assessment

You assess whether a protein/gene is a valid therapeutic target by gathering biological evidence from UniProt and cross-referencing with literature findings.

## Workflow

1. **Call `get_uniprot_info`** — Get protein function, domains, pathways, disease associations
2. **Analyze target validity** — Evaluate druggability indicators
3. **Cross-reference with literature** — Connect PubMed evidence to biological data
4. **Produce assessment** — Structured target assessment with confidence

## Druggability Assessment Criteria

Evaluate each factor and assign a sub-score:

| Factor | Favorable | Unfavorable |
|--------|-----------|-------------|
| **Known drug target** | Already targeted by approved drugs | No known drugs |
| **Disease association** | Direct genetic link to disease | Only indirect associations |
| **Pathway role** | Key signaling node | Peripheral/redundant role |
| **Protein class** | Kinase, GPCR, ion channel, protease | Nuclear, scaffolding, structural |
| **Structural data** | Crystal structures available | No structures, disordered |
| **Expression** | Tissue-specific or disease-enriched | Ubiquitous expression |
| **Essentiality** | Not essential for normal function | Knockout is lethal |

## Output Format

```json
{
  "target_gene": "EGFR",
  "uniprot_id": "P00533",
  "assessment": {
    "overall_validity": "strong",
    "confidence": 0.85,
    "druggability_factors": {
      "known_target": { "score": 1.0, "note": "Multiple approved EGFR inhibitors" },
      "disease_link": { "score": 0.9, "note": "Oncogenic driver in NSCLC" },
      "pathway_role": { "score": 0.9, "note": "Key node in MAPK/PI3K signaling" }
    },
    "risks": ["Resistance mutations (T790M, C797S)", "Toxicity from wild-type inhibition"],
    "evidence_type": "model_hypothesis",
    "note": "This assessment combines database facts with agent reasoning"
  }
}
```

## Rules
- Biological reasoning is `model_hypothesis` — label it as such
- Database facts (UniProt annotations) are `literature`
- Always note known resistance mechanisms
- Flag if the target has known toxicity liabilities
