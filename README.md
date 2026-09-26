# 🧬 SciLoop

**Autonomous Scientific Research Campaign Agent** — built with [TrueForge](https://github.com/truefoundry/trueforge)

SciLoop is an AI agent that connects to real scientific databases (PubMed, PDB, AlphaFold, ChEMBL, UniProt), generates and executes computational biology experiments inside a sandbox, and stops before irreversible actions to wait for human approval.

## What It Does

Given a research question like *"Investigate EGFR as a therapeutic target for NSCLC"*, SciLoop autonomously:

1. **Searches literature** — queries PubMed for evidence, extracts claims with citations
2. **Assesses the target** — retrieves protein data from UniProt, structures from PDB/AlphaFold
3. **🛑 Presents research plan** — waits for human approval before proceeding
4. **Finds candidate molecules** — searches ChEMBL for known active compounds
5. **Filters in sandbox** — runs RDKit (Lipinski, PAINS) inside Daytona sandbox
6. **Scores & ranks** — multi-objective scoring with exposed trade-offs
7. **🛑 Presents candidates** — waits for human approval of ranked list
8. **Generates report** — full provenance, citations, uncertainty labels
9. **🛑 Awaits final approval** — before "publishing" results

## Key Design Principles

- **Evidence typing** — every claim classified as `literature`, `computational_prediction`, or `model_hypothesis`
- **Provenance** — full chain from API query → raw response → claim → hypothesis
- **No false certainty** — computational predictions explicitly labeled, never presented as validated results
- **Multi-objective scoring** — no opaque "best molecule" score; trade-offs are exposed
- **Human-in-the-loop** — 3 approval gates at scientifically meaningful decision points

## Project Structure

```
SciLoop/
├── mcp-servers/           # MCP tool servers for external APIs
│   ├── pubmed-server/     # PubMed E-utilities wrapper
│   ├── protein-db-server/ # PDB + AlphaFold DB
│   └── chembl-server/     # ChEMBL REST API
├── skills/                # TrueForge SKILL.md files
│   ├── research-planner/
│   ├── literature-search/
│   ├── target-biology/
│   ├── structure-retrieval/
│   ├── molecule-search/
│   ├── molecule-filter/
│   ├── scientific-critic/
│   └── report-generator/
├── sandbox-scripts/       # Python scripts for Daytona sandbox
│   ├── rdkit_filter.py
│   ├── molecule_score.py
│   └── requirements.txt
├── schemas/               # JSON schemas for data contracts
│   ├── hypothesis.json
│   ├── evidence.json
│   ├── experiment.json
│   └── candidate.json
├── db/
│   └── init.sql           # PostgreSQL provenance schema
└── Doc/
    └── SciLoop Blueprint.md
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Agent Harness | TrueForge |
| Sandbox | Daytona |
| MCP Servers | Node.js / TypeScript |
| Sandbox Scripts | Python 3.11 + RDKit + Biopython |
| Database | PostgreSQL |
| External APIs | PubMed, PDB, AlphaFold DB, ChEMBL, UniProt |

## Getting Started

```bash
# 1. Start TrueForge
npx -y @truefoundry/trueforge

# 2. Initialize the database
psql -f db/init.sql

# 3. Install sandbox dependencies (inside Daytona)
pip install -r sandbox-scripts/requirements.txt

# 4. Start MCP servers
cd mcp-servers/pubmed-server && npm start
cd mcp-servers/protein-db-server && npm start
cd mcp-servers/chembl-server && npm start
```

## License

MIT