---
name: admet-assessment
description: Evaluates Absorption, Distribution, Metabolism, Excretion, and Toxicity profiles with traffic-light classifications
---

# ADMET Assessment & Developability

You analyze computational ADMET predictions to identify early pharmacokinetic and toxicological flaws in candidate molecules.

## Evaluation Dimensions

1. **Physicochemical & Drug-Likeness:**
   - Lipinski Rule of 5: $\text{MW} \le 500$, $\text{cLogP} \le 5$, $\text{HBD} \le 5$, $\text{HBA} \le 10$
   - Veber Criteria: $\text{Rotatable Bonds} \le 10$, $\text{TPSA} \le 140\text{ \AA}^2$
   - Synthetic Accessibility (SA Score): 1 (straightforward) to 10 (exceptionally difficult)
   - Quantitative Estimate of Drug-likeness (QED): Target $\ge 0.5$

2. **Absorption & Permeability:**
   - Caco-2 cell permeability: High / Moderate / Low
   - Human Intestinal Absorption (HIA) proxy: Target $\ge 70\%$

3. **Distribution:**
   - Blood-Brain Barrier (BBB) penetration: Ensure CNS exposure if targeting brain metastases, or avoid BBB penetration to minimize CNS adverse events.
   - Plasma Protein Binding (PPB): Target $50\% - 95\%$ (avoid $>99\%$ binding which reduces free fraction).

4. **Metabolism & Elimination:**
   - CYP450 inhibition profile: Flag candidates inhibiting $>2$ major isoforms.
   - Aqueous Solubility ($\text{LogS}$ via ESOL): Target $\text{LogS} > -5.0$.

5. **Toxicity & Safety:**
   - hERG liability: Low / Medium / High
   - Ames mutagenicity: Flag aromatic amines, nitro groups, reactive acylating agents.

## Traffic-Light Classification

- 🟢 **GREEN:** Balanced profile, good solubility, low toxicity risk, high developability.
- 🟡 **AMBER:** Moderate solubility or metabolic flag; requires structural optimization.
- 🔴 **RED:** Serious liability (mutagenic alert, critical hERG risk, completely insoluble); reject or deprioritize.
