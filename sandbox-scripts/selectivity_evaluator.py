"""Selectivity and off-target screening evaluator.

SciLoop Phase 4 — Search & Self-Improvement
Evaluates candidate molecules against primary target vs antitargets:
  - Cardiac safety: hERG (KCNH2)
  - Metabolic enzymes: CYP3A4, CYP2D6, CYP2C9
  - Kinase homologs: ErbB2 (HER2), ErbB4, KDR (VEGFR2)

Usage:
    echo '{"candidates": [{"smiles": "c1ccccc1"}], "primary_target": "EGFR"}' | python selectivity_evaluator.py
"""

import json
import math
import re
import sys

# Try importing RDKit if available
try:
    from rdkit import Chem
    from rdkit.Chem import Descriptors, Lipinski
    HAS_RDKIT = True
except ImportError:
    HAS_RDKIT = False


# Known structural alert motifs for hERG pharmacophore:
# Basic tertiary/secondary nitrogen + aromatic hydrophobic groups (LogP > 3.0)
HERG_PATTERNS = [
    r"N1CCN(CC1)",               # Piperazine ring
    r"N1CCCCC1",                 # Piperidine ring
    r"c1ccccc1.*c2ccccc2",       # Multiple aromatics
    r"N\(C\)C",                  # Tertiary amine
]

# CYP3A4 inhibitors often have bulky lipophilic cores with imidazole / pyridine / thiazole
CYP3A4_PATTERNS = [
    r"c1cncn1",                  # Imidazole
    r"c1nccs1",                  # Thiazole
    r"c1ccncc1",                 # Pyridine
]


def evaluate_selectivity(candidates, primary_target="EGFR", antitargets=None):
    """Evaluate candidate molecules for primary target activity vs off-target antitargets.

    Args:
        candidates: List of candidate dicts with 'smiles' and optional properties.
        primary_target: Target gene symbol (default: 'EGFR').
        antitargets: Optional list of antitarget gene symbols.

    Returns:
        List of selectivity profile dictionaries.
    """
    if antitargets is None:
        antitargets = [
            {"gene_name": "KCNH2", "common_name": "hERG", "category": "cardiac_safety"},
            {"gene_name": "CYP3A4", "common_name": "CYP3A4", "category": "metabolic_enzyme"},
            {"gene_name": "CYP2D6", "common_name": "CYP2D6", "category": "metabolic_enzyme"},
            {"gene_name": "ERBB2", "common_name": "HER2", "category": "homolog_kinase"},
            {"gene_name": "KDR", "common_name": "VEGFR2", "category": "homolog_kinase"}
        ]

    results = []

    for c in candidates:
        smi = c.get("smiles", "")
        cand_id = c.get("id", None)

        # Estimate physicochemical properties (from RDKit or heuristic)
        mw = c.get("mw", 350.0)
        logp = c.get("logp", 2.5)

        if HAS_RDKIT and smi:
            try:
                mol = Chem.MolFromSmiles(smi)
                if mol:
                    mw = Descriptors.MolWt(mol)
                    logp = Descriptors.MolLogP(mol)
            except Exception:
                pass

        # Primary target affinity proxy (normalized 0 to 1)
        # Higher for moderate MW (350-480) and LogP (2.0-4.0) with kinase pharmacophore
        primary_score = _estimate_target_affinity(smi, primary_target, mw, logp)

        antitarget_profiles = []
        liability_flags = []

        # Evaluate each antitarget
        for at in antitargets:
            gene = at["gene_name"]
            cat = at["category"]
            c_name = at.get("common_name", gene)

            at_score, risk, alerts = _evaluate_single_antitarget(smi, gene, cat, mw, logp)

            # Selectivity ratio = Primary Affinity / Antitarget Affinity
            # Prevent divide by zero with epsilon
            sel_ratio = round((primary_score + 1e-4) / (at_score + 1e-4), 2)

            if risk in ("high", "critical"):
                liability_flags.append(f"{c_name}_{risk}_risk")

            antitarget_profiles.append({
                "gene_name": gene,
                "common_name": c_name,
                "category": cat,
                "activity_score": round(at_score, 3),
                "selectivity_ratio": sel_ratio,
                "risk_level": risk,
                "alerts": alerts
            })

        # Overall selectivity score: penalizes high antitarget activities
        # 1.0 = perfect selectivity (primary high, all antitargets very low)
        max_at_risk_score = max([p["activity_score"] for p in antitarget_profiles], default=0.5)
        overall_sel = round(max(0.0, min(1.0, primary_score * (1.0 - 0.7 * max_at_risk_score))), 3)

        results.append({
            "candidate_id": cand_id,
            "smiles": smi,
            "primary_target": {
                "gene_name": primary_target,
                "target_id": f"CHEMBL_{primary_target}",
                "activity_score": round(primary_score, 3),
                "metric_type": "heuristic_activity"
            },
            "antitarget_profiles": antitarget_profiles,
            "overall_selectivity_score": overall_sel,
            "liability_flags": liability_flags,
            "evidence_type": "computational_prediction",
            "note": "In silico selectivity prediction against antitarget panel — NOT experimentally validated"
        })

    return results


def _estimate_target_affinity(smiles, target, mw, logp):
    """Estimate heuristic affinity proxy for target."""
    base = 0.5
    # Favor drug-like kinase size
    if 300 <= mw <= 500:
        base += 0.2
    if 1.5 <= logp <= 4.0:
        base += 0.2
    # Kinase hinge binder motifs (quinazoline, pyrimidine, purine, indazole)
    if any(m in smiles for m in ["c1nc2ccccc2nc1", "n1cncc1", "c1ncnc2[nH]ccc12", "c1c[nH]nc1"]):
        base += 0.15
    return min(0.95, max(0.1, base))


def _evaluate_single_antitarget(smiles, gene, category, mw, logp):
    """Evaluate candidate risk against a specific antitarget."""
    alerts = []
    score = 0.1
    risk = "low"

    if gene == "KCNH2":  # hERG
        # hERG pharmacophore: basic nitrogen + high lipophilicity (LogP > 3.2)
        has_basic_n = bool(re.search(r"N[1-9]|N\(C\)|N1CCN", smiles))
        if has_basic_n and logp > 3.2:
            score = 0.75
            risk = "high"
            alerts.append("hERG_cardiotoxicity_pharmacophore_match (basic N + high LogP)")
        elif has_basic_n or logp > 3.5:
            score = 0.45
            risk = "moderate"
            alerts.append("Moderate hERG liability risk")
        else:
            score = 0.15
            risk = "low"

    elif gene in ("CYP3A4", "CYP2D6", "CYP2C9"):
        has_cyp_motif = any(re.search(pat, smiles) for pat in CYP3A4_PATTERNS)
        if has_cyp_motif and logp > 3.0:
            score = 0.65
            risk = "high"
            alerts.append(f"{gene}_metabolic_inhibition_alert")
        elif has_cyp_motif:
            score = 0.40
            risk = "moderate"
        else:
            score = 0.18
            risk = "low"

    elif gene in ("ERBB2", "KDR"):  # Homolog kinases
        # If it's a general kinase hinge binder, it might cross-react
        if "c1nc2ccccc2nc1" in smiles:  # Quinazoline (common to EGFR and ErbB2)
            score = 0.55
            risk = "moderate"
            alerts.append(f"Homolog kinase cross-reactivity alert for {gene}")
        else:
            score = 0.25
            risk = "low"

    return score, risk, alerts


if __name__ == "__main__":
    try:
        raw_input = sys.stdin.read()
        data = json.loads(raw_input) if raw_input.strip() else {"candidates": []}
    except Exception as e:
        sys.stderr.write(f"Error parsing JSON input: {e}\n")
        sys.exit(1)

    cands = data.get("candidates", [])
    target = data.get("primary_target", "EGFR")
    antitargets = data.get("antitargets", None)

    profiles = evaluate_selectivity(cands, primary_target=target, antitargets=antitargets)
    print(json.dumps(profiles, indent=2))
