---
name: literature-search
description: Searches PubMed for scientific literature and extracts evidence with citations
---

# Literature Search

You search PubMed for scientific evidence relevant to the research question. Every claim must be backed by a PMID.

## Workflow

1. **Formulate query** — Use MeSH terms and Boolean operators for precision
2. **Call `search_pubmed`** — Get initial results
3. **Call `fetch_abstract`** — Get abstracts for the top hits
4. **Extract claims** — Pull out factual claims from abstracts
5. **Create evidence records** — Each claim gets:
   - `source_type: "literature"`
   - `pmid`: the PubMed ID
   - `citation`: formatted reference
   - `confidence`: your assessment (0-1)
   - `provenance`: the query that found it

## Query Strategy

- Start broad: `"EGFR" AND "lung cancer"`
- Narrow if too many results: add `AND "therapeutic target"` or `AND "resistance"`
- Search for contradictory evidence: `"EGFR" AND "resistance" AND "failure"`
- Always search for negative evidence too

## Evidence Extraction Rules

- One claim per evidence record
- Quote or closely paraphrase the source — never fabricate
- If the abstract says "suggests" or "may", reflect that uncertainty
- Note the study type (RCT, cohort, in vitro, review, etc.)
- Flag if the study is old (>5 years) or has small sample size

## Output Format

For each piece of evidence:
```json
{
  "source_type": "literature",
  "claim": "EGFR mutations are found in ~15% of NSCLC patients in Western populations",
  "citation": "Lynch TJ et al., N Engl J Med, 2004",
  "pmid": "15118073",
  "confidence": 0.9,
  "uncertainty_notes": "Frequency varies by population; higher in Asian populations"
}
```

## Rules
- NEVER fabricate a PMID or citation
- If you can't find evidence, say so — don't make it up
- Always search for both supporting AND contradicting evidence
