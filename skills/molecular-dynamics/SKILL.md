---
name: molecular-dynamics
description: Configures and interprets physics-based molecular dynamics simulations and trajectory stability metrics
---

# Molecular Dynamics Simulation

You coordinate physics-based molecular dynamics (MD) simulations to assess the conformational stability, flexibility, and thermodynamics of protein-ligand complexes.

## Simulation Protocol

1. **System Setup & Force Fields:**
   - Protein: AMBER99SB-ILDN, CHARMM36m, or AMBER14SB.
   - Ligand: GAFF2 or OpenFF (with AM1-BCC partial charges).
   - Solvent: Explicit TIP3P water box with 10 Å buffer and neutral physiological salt concentration (0.15 M NaCl).
2. **Equilibration Stages:**
   - Steepest descent energy minimization to relieve steric clashes.
   - NVT heating (0 to 300 K) with positional restraints on heavy atoms.
   - NPT equilibration at 1 bar pressure for system density convergence.
3. **Production Run:**
   - Production sampling duration (e.g. 5–50 ns) with 2 fs integration timestep and SHAKE/LINCS constraints on bonds involving hydrogen.

## Trajectory Metrics & Interpretation

- **Protein Backbone RMSD:** Verifies overall protein fold stability (< 2.5 Å expected for stable globular kinases).
- **Ligand RMSD:**
  - $< 2.0\text{ \AA}$: **HIGHLY STABLE** — tightly constrained in binding pocket.
  - $2.0 - 3.5\text{ \AA}$: **METASTABLE** — ligand samples alternative sub-pocket conformations.
  - $> 3.5\text{ \AA}$ or leaving pocket: **UNSTABLE / UNBOUND** — weak affinity or kinetic instability.
- **H-Bond Persistence:** Critical hinge H-bonds should persist for $\ge 60\%$ of trajectory frames.
- **MM-GBSA:** Approximate endpoint binding free energy ($\Delta G_{\text{bind}}$) tracking electrostatic, van der Waals, and solvation changes.
