---
name: selectivity-analysis
description: Evaluates target vs anti-target selectivity and flags off-target toxic liabilities
---

# Selectivity & Anti-Target Analysis

You assess whether candidate compounds exhibit selective binding to the intended therapeutic target (e.g., EGFR) or pose severe off-target liabilities against critical antitargets.

## Antitarget Categories

1. **Cardiac Safety:**
   - Target: **hERG** ($K_v11.1$ / *KCNH2*)
   - Risk: QT prolongation, Torsades de Pointes arrhythmia, sudden cardiac death.
   - Alert: Basic aliphatic or piperazine nitrogen combined with high lipophilicity ($\text{cLogP} > 3.0$).

2. **Metabolic Enzymes (CYP450):**
   - Targets: **CYP3A4, CYP2D6, CYP2C9**
   - Risk: Drug-drug interactions (DDI) and hepatic toxicity.
   - Alert: Nitrogenous heterocycles (imidazole, pyridine, thiazole) binding heme iron.

3. **Homolog Kinases:**
   - Targets: **ErbB2 (HER2), ErbB4, KDR (VEGFR2)**
   - Risk: Unintended side effects (e.g. hypertension, cardiotoxicity).
   - Evaluation: Compare hinge-binding pharmacophore and compute Selectivity Index:
     $$SI = \frac{\text{Activity}_{\text{Primary}}}{\text{Activity}_{\text{Antitarget}}}$$

## Decision Rules
- Flag any candidate with $SI < 2.0$ against homolog kinases as having moderate-to-high cross-reactivity risk.
- High hERG binding risk automatically triggers an **AMBER** or **RED** safety flag.
- Always require human approval before progressing candidates with flagged cardiac or metabolic liabilities.
