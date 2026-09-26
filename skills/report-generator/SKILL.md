---
name: report-generator
description: Generates the final research report with full provenance and evidence tracking
---

# Report Generator

You produce the final research report for a campaign. This is the primary deliverable presented to the human reviewer for approval.

## Workflow

1. **Gather all data** — Hypotheses, evidence, candidates, criticism
2. **Structure the report** — Follow the template below
3. **Verify provenance** — Every claim must have a source
4. **Present for approval** — This is the THIRD and final approval gate

## Report Template

```markdown
# SciLoop Research Report

## Campaign: [Research Question]
**Date**: [ISO date]
**Status**: Pending human approval

---

## Executive Summary
[2-3 paragraph summary of findings, key candidates, and confidence level]

## 1. Research Question & Hypotheses

### Original Question
[The research question as stated]

### Hypotheses Investigated
| # | Hypothesis | Status | Confidence | Key Evidence |
|---|-----------|--------|------------|--------------|
| H1 | [Statement] | [supported/refuted/inconclusive] | [0-1] | [PMIDs] |

## 2. Target Assessment
- **Target**: [Gene/Protein]
- **UniProt**: [Accession]
- **Druggability**: [Assessment]
- **Known drugs**: [List]
- **Risks**: [Resistance, toxicity, etc.]

## 3. Structural Data
| Source | ID | Resolution/pLDDT | Suitability |
|--------|-----|------------------|-------------|
| PDB | [ID] | [Å] | [Assessment] |
| AlphaFold | [ID] | [Score] | [Assessment] |

## 4. Candidate Molecules

### Top Candidates (Ranked)
| Rank | SMILES | Source | Drug-likeness | Score | Key Trade-offs |
|------|--------|-------|---------------|-------|----------------|

> ⚠️ All scores are **computational predictions** based on heuristic scoring.
> They are NOT experimentally validated metrics.

## 5. Scientific Criticism
[Include full criticism report]

## 6. Evidence Inventory
[List all evidence with source types, PMIDs, confidence scores]

## 7. Limitations & Uncertainties
- [List all known limitations]
- [List computational vs experimental gaps]

## 8. Recommended Next Steps
- [Experimental validation suggestions]
- [Additional computational studies]

## Provenance
- **Tools used**: [MCP servers, sandbox scripts]
- **Databases queried**: [PubMed, PDB, AlphaFold, ChEMBL, UniProt]
- **Total evidence records**: [N]
- **Campaign duration**: [time]
```

## Rules
- EVERY claim must cite a source (PMID, database ID, or mark as model_hypothesis)
- Include the disclaimer about computational predictions prominently
- The criticism section is MANDATORY — never omit it
- Present the report to the user and wait for approval before finalizing
- If the user rejects the report, revise based on their feedback
