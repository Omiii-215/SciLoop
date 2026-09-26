"""Comprehensive ADMET prediction service for candidate molecules.

SciLoop Phase 4 — Search & Self-Improvement
Computes multi-parameter ADMET profiles:
  - Physicochemical (MW, LogP, TPSA, RotB, HBD, HBA, QED, Synthetic Accessibility)
  - Absorption (Caco-2 permeability, Human Intestinal Absorption, Bioavailability)
  - Distribution (Blood-Brain Barrier permeability, Plasma Protein Binding)
  - Metabolism (CYP1A2, CYP2C9, CYP2C19, CYP2D6, CYP3A4 inhibition)
  - Excretion (Aqueous solubility via ESOL model)
  - Toxicity (hERG cardiotoxicity, Ames mutagenicity, structural alerts)
  - Composite Traffic-Light rating: GREEN / AMBER / RED

Usage:
    echo '{"candidates": [{"smiles": "CCO"}]}' | python admet_predictor.py
"""

import json
import math
import re
import sys

# Try importing RDKit if available
try:
    from rdkit import Chem
    from rdkit.Chem import Descriptors, Lipinski, QED
    HAS_RDKIT = True
except ImportError:
    HAS_RDKIT = False


def calculate_esol_solubility(mw, logp, rotb, aromatic_proportion=0.4):
    """Estimate aqueous solubility LogS using Delaney's ESOL equation:
    Log(S) = 0.16 - 0.63 * cLogP - 0.0062 * MW + 0.066 * RB - 0.74 * AP
    """
    logs = 0.16 - (0.63 * logp) - (0.0062 * mw) + (0.066 * rotb) - (0.74 * aromatic_proportion)
    return round(logs, 2)


def estimate_sa_score(smiles, mw, rotb, ring_count):
    """Synthetic Accessibility (SA) Score heuristic (1 = very easy to synthesize, 10 = very hard).
    Penalizes large MW, high ring count, complex macrocycles, and excessive stereocenters.
    """
    score = 2.0
    if mw > 400:
        score += (mw - 400) / 100.0 * 0.8
    if rotb > 8:
        score += (rotb - 8) * 0.2
    if ring_count > 4:
        score += (ring_count - 4) * 0.5
    if "@" in smiles:  # chiral centers
        score += smiles.count("@") * 0.3
    if "#" in smiles:  # alkynes / nitriles
        score += 0.2
    return round(min(10.0, max(1.0, score)), 2)


def predict_admet(candidates):
    """Generate detailed ADMET profile for a list of candidate molecules."""
    results = []

    for c in candidates:
        smi = c.get("smiles", "")
        cand_id = c.get("id", None)

        mw = c.get("molecular_weight", c.get("mw", 350.0))
        logp = c.get("logp", 2.5)
        hbd = c.get("hbd", 2)
        hba = c.get("hba", 4)
        tpsa = c.get("tpsa", 70.0)
        rotb = c.get("rotatable_bonds", 4)
        qed_val = 0.65
        ring_count = 2

        if HAS_RDKIT and smi:
            try:
                mol = Chem.MolFromSmiles(smi)
                if mol:
                    mw = round(Descriptors.MolWt(mol), 2)
                    logp = round(Descriptors.MolLogP(mol), 2)
                    hbd = Lipinski.NumHDonors(mol)
                    hba = Lipinski.NumHAcceptors(mol)
                    tpsa = round(Descriptors.TPSA(mol), 2)
                    rotb = Descriptors.NumRotatableBonds(mol)
                    qed_val = round(QED.qed(mol), 3)
                    ring_count = Lipinski.RingCount(mol)
            except Exception:
                pass

        # Heuristic SA score
        sa_score = estimate_sa_score(smi, mw, rotb, ring_count)

        # ESOL aqueous solubility
        logs = calculate_esol_solubility(mw, logp, rotb)
        if logs > -1:
            sol_class = "highly_soluble"
        elif logs > -3:
            sol_class = "soluble"
        elif logs > -5:
            sol_class = "moderately_soluble"
        elif logs > -7:
            sol_class = "poorly_soluble"
        else:
            sol_class = "insoluble"

        # Absorption proxies
        # Caco-2 permeability correlates with LogP (moderate) and low TPSA (<100)
        if tpsa < 80 and 1.0 <= logp <= 3.5:
            caco2 = "high"
            hia = 0.92
        elif tpsa < 120 and 0.0 <= logp <= 5.0:
            caco2 = "moderate"
            hia = 0.75
        else:
            caco2 = "low"
            hia = 0.45

        # Bioavailability rule of thumb (Veber rules: rotb <= 10, TPSA <= 140)
        oral_bioav = 0.85 if rotb <= 10 and tpsa <= 140 and mw <= 500 else 0.40

        # Distribution
        # BBB permeant: LogP between 1.5 and 4.0, MW < 400, TPSA < 90
        bbb_permeant = bool(1.5 <= logp <= 4.0 and mw <= 400 and tpsa < 75)
        bbb_conf = 0.80 if bbb_permeant else 0.70
        # Plasma protein binding increases with LogP
        ppb_pct = round(min(99.5, max(40.0, 50.0 + 10.0 * logp)), 1)

        # Metabolism (CYP inhibition)
        cyp1a2 = bool("c1ccncc1" in smi and logp > 2.0)
        cyp2c9 = bool(hbd >= 1 and logp > 3.0 and "c1ccccc1" in smi)
        cyp2c19 = bool(logp > 3.2)
        cyp2d6 = bool(re.search(r"N[1-9]|N\(C\)", smi) and logp > 2.5)  # basic amine
        cyp3a4 = bool(mw > 400 and logp > 3.0)

        cyp_inhibition_count = sum([cyp1a2, cyp2c9, cyp2c19, cyp2d6, cyp3a4])
        metab_stability = "high" if cyp_inhibition_count <= 1 else ("medium" if cyp_inhibition_count <= 3 else "low")

        # Toxicity
        structural_alerts = []
        if re.search(r"N(=O)=O|\[N\+\]\(=O\)\[O\-\]|\[N\+\].*\[O\-\]", smi):  # Nitro group
            structural_alerts.append("Ames_mutagenic_nitro_alert")
        if re.search(r"C(=O)Cl|C(=O)Br", smi):  # Acyl halide
            structural_alerts.append("Reactive_electrophile_acyl_halide")
        if re.search(r"c1cc\(Cl\)c\(Cl\)cc1", smi):  # Polyhalogenated aromatic
            structural_alerts.append("Persistent_halogenated_aromatic")

        has_basic_n = bool(re.search(r"N[1-9]|N\(C\)|N1CCN", smi))
        if has_basic_n and logp > 3.5:
            herg_liability = "high_risk"
            structural_alerts.append("hERG_cardiac_channel_inhibition_risk")
        elif has_basic_n or logp > 3.0:
            herg_liability = "medium_risk"
        else:
            herg_liability = "low_risk"

        ames_mutagenic = bool("Ames_mutagenic_nitro_alert" in structural_alerts)

        # Traffic light assignment
        # RED if: Ames mutagenic, high hERG risk, insoluble, or >3 CYP inhibitions
        if ames_mutagenic or herg_liability == "high_risk" or sol_class == "insoluble" or cyp_inhibition_count >= 4:
            traffic_light = "RED"
        # AMBER if: medium hERG risk, poorly soluble, or moderate CYP inhibition
        elif herg_liability == "medium_risk" or sol_class == "poorly_soluble" or cyp_inhibition_count >= 2:
            traffic_light = "AMBER"
        else:
            traffic_light = "GREEN"

        results.append({
            "candidate_id": cand_id,
            "smiles": smi,
            "physicochemical": {
                "mw": mw,
                "logp": logp,
                "tpsa": tpsa,
                "rotatable_bonds": rotb,
                "hbd": hbd,
                "hba": hba,
                "qed": qed_val,
                "sa_score": sa_score
            },
            "absorption": {
                "caco2_permeability": caco2,
                "human_intestinal_absorption": hia,
                "oral_bioavailability_proxy": oral_bioav
            },
            "distribution": {
                "bbb_permeant": bbb_permeant,
                "bbb_confidence": bbb_conf,
                "plasma_protein_binding_pct": ppb_pct
            },
            "metabolism": {
                "cyp_inhibition_profile": {
                    "cyp1a2": cyp1a2,
                    "cyp2c9": cyp2c9,
                    "cyp2c19": cyp2c19,
                    "cyp2d6": cyp2d6,
                    "cyp3a4": cyp3a4
                },
                "metabolic_stability": metab_stability
            },
            "excretion": {
                "aqueous_solubility_logs": logs,
                "solubility_class": sol_class
            },
            "toxicity": {
                "herg_liability": herg_liability,
                "ames_mutagenicity": ames_mutagenic,
                "structural_alerts": structural_alerts
            },
            "admet_traffic_light": traffic_light,
            "evidence_type": "computational_prediction",
            "disclaimer": "All ADMET metrics are computational predictions and do not substitute for preclinical assays"
        })

    return results


if __name__ == "__main__":
    try:
        raw_input = sys.stdin.read()
        data = json.loads(raw_input) if raw_input.strip() else {"candidates": []}
    except Exception as e:
        sys.stderr.write(f"Error parsing JSON input: {e}\n")
        sys.exit(1)

    cands = data.get("candidates", [])
    profiles = predict_admet(cands)
    print(json.dumps(profiles, indent=2))
