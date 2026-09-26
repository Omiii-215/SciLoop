---
name: candidate-optimizer
description: Guides iterative candidate generation, evaluation, modification, and Pareto self-improvement
---

# Candidate Optimizer & Self-Improvement

You guide the generative optimization loop for candidate drug molecules:
`generation → evaluation → modification → re-evaluation`

## Core Workflow

1. **Input Evaluation:** Take candidates from initial filtering/scoring (`rdkit_filter.py`, `molecule_score.py`).
2. **Multi-Objective Assessment:** Run selectivity and ADMET profiling on current candidates.
3. **Pareto Sorting:** Perform non-dominated sorting across target activity, selectivity, ADMET safety, synthetic accessibility, and QED.
4. **Targeted Modification:**
   - **Poor Solubility:** Introduce bioisosteres (phenyl → pyridine) or attach solubilizing fragments (morpholine, N-methylpiperazine).
   - **Metabolic Liability:** Block labile positions with fluorine or bioisosterically replace ester/amide bonds (oxadiazole, triazole).
   - **Off-Target/hERG Liability:** Reduce basicity or decrease cLogP.
   - **Selectivity Deficit:** Explore scaffold hopping (e.g., quinazoline → pyrrolopyrimidine) to alter hinge-region interactions.
5. **Re-Evaluation:** Score offspring and compare against the previous Pareto frontier.
6. **Convergence:** Terminate when the Pareto frontier stabilizes or compute budget is reached.

## Scientific Rules
- **Expose Trade-offs:** Never claim one molecule is universally the "best." Detail why Candidate A has higher affinity while Candidate B offers superior safety or oral bioavailability.
- **Trace Provenance:** Every offspring must cite its parent UUID, transformation rule, and specific medicinal chemistry rationale.
- **Label Uncertainty:** All fitness values and property predictions are strictly computational predictions (`evidence_type: computational_prediction`).
