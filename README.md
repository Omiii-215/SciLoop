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
8. **Critiques findings** — searches for contradictory evidence, evaluates weaknesses
9. **Re-plans if needed** — updates hypotheses and experiments based on results *(Phase 2)*
10. **Generates report** — full provenance, citations, uncertainty labels
11. **🛑 Awaits final approval** — before "publishing" results

## Key Design Principles

- **Evidence typing** — every claim classified as `literature`, `computational_prediction`, or `model_hypothesis`
- **Provenance** — full chain from API query → raw response → claim → hypothesis
- **No false certainty** — computational predictions explicitly labeled, never presented as validated results
- **Multi-objective scoring** — no opaque "best molecule" score; trade-offs are exposed
- **Human-in-the-loop** — 3 approval gates at scientifically meaningful decision points
- **Closed-loop iteration** — hypotheses are updated based on evidence, not just generated once *(Phase 2)*

## Project Structure

```
SciLoop/
├── core/                  # Phase 2: Closed-loop agent engines
│   ├── campaign-manager.js    # Orchestrates the full research loop
│   ├── hypothesis-engine.js   # Hypothesis lifecycle management
│   ├── belief-updater.js      # Updates confidence from observations
│   ├── experiment-selector.js # Picks the next best experiment
│   └── policy-engine.js       # Enforces budgets and constraints
├── mcp-servers/           # MCP tool servers for external APIs
│   ├── pubmed-server/     # PubMed E-utilities wrapper
│   ├── protein-db-server/ # PDB + AlphaFold DB
│   └── chembl-server/     # ChEMBL REST API
├── skills/                # TrueForge SKILL.md files
│   ├── research-planner/      # Plans campaigns + re-planning
│   ├── literature-search/
│   ├── target-biology/
│   ├── structure-retrieval/
│   ├── molecule-search/
│   ├── molecule-filter/
│   ├── scientific-critic/
│   ├── report-generator/
│   ├── experiment-selector/   # Phase 2: Experiment selection
│   └── hypothesis-manager/    # Phase 2: Hypothesis lifecycle
├── sandbox-scripts/       # Python scripts for Daytona sandbox
│   ├── rdkit_filter.py
│   ├── molecule_score.py
│   └── requirements.txt
├── schemas/               # JSON schemas for data contracts
│   ├── hypothesis.json
│   ├── evidence.json
│   ├── experiment.json
│   ├── candidate.json
│   ├── belief-update.json     # Phase 2: Belief change tracking
│   ├── campaign-state.json    # Phase 2: State snapshots
│   └── policy.json            # Phase 2: Campaign policies
├── db/
│   ├── init.sql               # PostgreSQL provenance schema
│   └── migration-phase2.sql   # Phase 2: Closed-loop tables
└── Doc/
    └── SciLoop Blueprint.md
```

## Phase 2: Closed-Loop Agent Architecture

Phase 2 adds the intelligence layer that turns the single-pass pipeline into a true iterative research loop:

```
Research Question
  → Hypotheses (HypothesisEngine)
    → Evidence Gathering (Experiment Selector picks best next step)
      → Observation (MCP tools + sandbox)
        → Belief Update (BeliefUpdater adjusts confidence)
          → Critique (Scientific Critic)
            → Re-Plan? (if improvement possible)
              → Next Iteration OR Report
```

### Core Engines

| Engine | Purpose |
|--------|---------|
| **CampaignManager** | Orchestrates the loop, manages state, enforces gates |
| **HypothesisEngine** | Creates, updates, and resolves hypotheses |
| **BeliefUpdater** | Translates evidence into confidence changes |
| **ExperimentSelector** | Picks the highest-value next experiment |
| **PolicyEngine** | Enforces budgets, permissions, and scientific constraints |

## Tech Stack

| Layer | Technology |
|-------|-----------| 
| Agent Harness | TrueForge |
| Sandbox | Daytona |
| MCP Servers | Node.js / TypeScript |
| Core Engines | Node.js (ESM) |
| Sandbox Scripts | Python 3.11 + RDKit + Biopython |
| Database | PostgreSQL |
| External APIs | PubMed, PDB, AlphaFold DB, ChEMBL, UniProt |

## Getting Started

```bash
# 1. Start TrueForge
npx -y @truefoundry/trueforge

# 2. Initialize the database
psql -f db/init.sql
psql -f db/migration-phase2.sql  # Phase 2 tables

# 3. Install sandbox dependencies (inside Daytona)
pip install -r sandbox-scripts/requirements.txt

# 4. Start MCP servers
cd mcp-servers/pubmed-server && npm start
cd mcp-servers/protein-db-server && npm start
cd mcp-servers/chembl-server && npm start
```

## Phases

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 0 | Schemas + Provenance | ✅ Complete |
| Phase 1 | Single-node Research | ✅ Complete |
| Phase 2 | Closed-loop Agent | ✅ Complete |
| Phase 3 | Distributed Execution | 🔄 In Progress |
| Phase 4 | Search + Self-improvement | ⬜ Planned |
| Phase 5 | Simulation | ⬜ Planned |
| Phase 6 | Experimental Feedback | ⬜ Planned |
| Phase 7 | General Scientific Engine | ⬜ Planned |

## License

MIT