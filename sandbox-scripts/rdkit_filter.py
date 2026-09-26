"""Filter molecules using RDKit: Lipinski Rule of Five + PAINS + validity checks.

SciLoop Phase 0 — Sandbox script for molecular filtering.
Runs inside the Daytona sandbox. Reads SMILES from stdin JSON, writes results to stdout.

Usage:
    echo '{"smiles": ["CCO", "c1ccccc1"]}' | python rdkit_filter.py
"""
from rdkit import Chem
from rdkit.Chem import Descriptors, FilterCatalog
import json
import sys


def filter_molecules(smiles_list):
    """Filter a list of SMILES strings through Lipinski + PAINS checks.

    Args:
        smiles_list: List of SMILES strings to evaluate.

    Returns:
        List of dicts with molecular properties and filter results.
        Every result is labeled as a computational prediction.
    """
    results = []

    # Initialize PAINS filter catalog
    params = FilterCatalog.FilterCatalogParams()
    params.AddCatalog(FilterCatalog.FilterCatalogParams.FilterCatalogs.PAINS)
    catalog = FilterCatalog.FilterCatalog(params)

    for smi in smiles_list:
        mol = Chem.MolFromSmiles(smi)
        if mol is None:
            results.append({
                "smiles": smi,
                "valid": False,
                "evidence_type": "computational_prediction",
                "note": "Could not parse SMILES — invalid structure"
            })
            continue

        # Compute molecular descriptors
        mw = Descriptors.MolWt(mol)
        logp = Descriptors.MolLogP(mol)
        hbd = Descriptors.NumHDonors(mol)
        hba = Descriptors.NumHAcceptors(mol)
        tpsa = Descriptors.TPSA(mol)
        rotatable = Descriptors.NumRotatableBonds(mol)

        # Lipinski Rule of Five
        lipinski = (mw <= 500 and logp <= 5 and hbd <= 5 and hba <= 10)

        # PAINS filter
        pains_pass = not catalog.HasMatch(mol)

        # Get PAINS alert names if any
        pains_alerts = []
        if not pains_pass:
            matches = catalog.GetMatches(mol)
            for match in matches:
                pains_alerts.append(match.GetDescription())

        results.append({
            "smiles": smi,
            "valid": True,
            "molecular_weight": round(mw, 2),
            "logp": round(logp, 2),
            "hbd": hbd,
            "hba": hba,
            "tpsa": round(tpsa, 2),
            "rotatable_bonds": rotatable,
            "lipinski_pass": lipinski,
            "pains_pass": pains_pass,
            "pains_alerts": pains_alerts,
            "pass_all": lipinski and pains_pass,
            "evidence_type": "computational_prediction",
            "note": "RDKit descriptor calculation — NOT experimentally validated"
        })

    return results


if __name__ == "__main__":
    data = json.load(sys.stdin)
    results = filter_molecules(data["smiles"])
    print(json.dumps(results, indent=2))
