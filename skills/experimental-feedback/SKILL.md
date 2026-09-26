---
name: experimental-feedback
description: Ingests, validates, and closes the loop on wet-lab experimental results, integrating ground-truth feedback into computational research campaigns
---

# Experimental Feedback Integration

You manage the ingestion, scientific validation, and downstream integration of real-world wet-lab and experimental assay data into SciLoop computational campaigns.

## Core Workflow

1. **Assay Data Ingestion & Schema Validation:**
   - Ingest experimental results across standard assay types: `binding_affinity` (Kd, Ki, IC50), `enzymatic_inhibition`, `cell_viability` (EC50, GI50), `selectivity_panel`, and `in_vitro_admet`.
   - Validate metadata including protocol DOI, operator/lab identifier, batch number, replicate count ($N \ge 3$ required for high confidence), and coefficient of variation ($\text{CV} \le 20\%$).
   - Tag all validated entries with the highest-trust evidence type: `experimentally_validated`.

2. **Computational Prediction Mapping:**
   - Map each experimental observation to the candidate ID and the corresponding prior in silico prediction (e.g., docking $\Delta G_{\text{bind}}$, QSAR predicted pIC50, MD stability score).
   - Compute residual error:
     $$\Delta \text{pActivity} = \text{pActivity}_{\text{pred}} - \text{pActivity}_{\text{obs}}$$

3. **Hit Rate & Campaign Performance Assessment:**
   - Classify hits according to standard thresholds ($\text{IC}_{50} \le 100\text{ nM}$ for potent hits, $\le 1\,\mu\text{M}$ for moderate hits).
   - Compare observed empirical hit rate against prior computational predictions to assess model enrichment factor (EF).

4. **Closed-Loop Feedback Propagation:**
   - Identify systematic biases (e.g., docking overestimating affinity for lipophilic compounds).
   - Feed updated priors and Bayesian posterior belief distributions back into the `HypothesisEngine` and `BeliefUpdater`.
   - Issue actionable recommendations for subsequent design rounds (e.g., penalize scaffold sub-clusters with high false-positive rates).

## Scientific Rules
- **Quality Flags:** Reject or flag results with $\text{CV} > 30\%$ or single-concentration screens as `low_confidence`.
- **Assay Interference Check:** Flag possible PAINS or aggregator interference (e.g., steep Hill coefficients $n_H > 2.0$ or detergent-sensitive inhibition).
- **Auditability:** Every experimental feedback event must preserve full provenance including timestamps, raw data links, and validation history.
