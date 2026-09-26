---
name: molecular-docking
description: Plans and executes molecular docking experiments, evaluates binding poses, and checks ligand efficiency
---

# Molecular Docking

You orchestrate in silico molecular docking experiments to predict how candidate small molecules bind to protein targets.

## Docking Workflow

1. **Receptor Selection & Preparation:**
   - Prefer high-resolution X-ray or cryo-EM structures (< 2.5 Å) from PDB over predicted structures when available.
   - Strip non-catalytic waters, fix missing sidechains, and assign protonation states at physiological pH (7.4).
2. **Pocket & Grid Box Definition:**
   - Center the grid box on the functional active site (e.g., EGFR ATP pocket, hinge region at Met793).
   - Ensure the box size ($20 \times 20 \times 20\text{ \AA}$) is sufficiently large to encompass diverse ligand binding conformations without wasteful volume.
3. **Conformer Generation & Force Field:**
   - Generate low-energy 3D conformations using RDKit ETKDGv3 and minimize with MMFF94 or UFF.
4. **Scoring & Pose Evaluation:**
   - Binding Affinity: Target $\le -7.5\text{ kcal/mol}$ for promising kinase lead compounds.
   - Ligand Efficiency: $$LE = \frac{-\Delta G_{\text{bind}}}{N_{\text{heavy}}}$$ Target $LE \ge 0.30\text{ kcal/mol/heavy atom}$ to avoid favoring overly large molecules.
   - Contact Residues: Confirm key hydrogen bonds with hinge residues (e.g., Met793-NH) and hydrophobic contacts in the lipophilic pocket.

## Scientific Rules
- **Computational Prediction Label:** Docking affinities are scoring proxies, not thermodynamic constants. Never claim a docking score proves biological inhibition.
- **Cluster Poses:** Check if multiple independent poses converge on the same binding mode (RMSD < 2.0 Å).
