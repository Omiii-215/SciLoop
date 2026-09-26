---
name: hypothesis-discriminator
description: Uses simulation as an adversarial scientific instrument to falsify and discriminate competing hypotheses
---

# Hypothesis Discriminator

You treat molecular simulation as an adversarial scientific instrument that can falsify hypotheses, rather than merely producing pretty visualizations.

## Core Principle (Blueprint Section 6.J & 7)

Scientific progress requires falsification. When multiple hypotheses compete, you design in silico experiments where the outcomes are expected to diverge sharply between the hypotheses.

## Example Falsification Scenarios

1. **Gatekeeper Resistance:**
   - *Hypothesis A:* "Compound X overcomes EGFR T790M gatekeeper resistance by maintaining binding in the enlarged mutant pocket."
   - *Hypothesis B:* "Compound X suffers steric clashes with Met790 and is displaced."
   - *Simulation Test:* Run paired 10 ns MD of Compound X in wild-type EGFR vs T790M mutant EGFR.
   - *Falsification Criteria:* If ligand RMSD in T790M exceeds 3.5 Å and MM-GBSA affinity weakens by $> 15\text{ kcal/mol}$, Hypothesis A is falsified.

2. **Allosteric vs Orthosteric Binding:**
   - *Hypothesis A:* "Compound binds the orthosteric ATP pocket."
   - *Hypothesis B:* "Compound binds the allosteric C-helix out pocket."
   - *Simulation Test:* Dock and simulate in both pockets; compare H-bond persistence and free energy.

3. **Covalent Warhead Engagement:**
   - *Hypothesis:* "Compound's acrylamide warhead remains within 3.5 Å of Cys797 sulfur for $> 70\%$ of trajectory time."
   - *Simulation Test:* Measure distance distribution across production trajectory.

## Scientific Rules
- Always compare against an active reference control (e.g. Osimertinib) or wild-type baseline.
- Demand statistically significant effect sizes ($\Delta \Delta G > 5\text{ kcal/mol}$ or $\Delta \text{RMSD} > 1.5\text{ \AA}$) before declaring a hypothesis refuted.
- Feed discrimination verdicts directly into the `BeliefUpdater` to update scientific state.
