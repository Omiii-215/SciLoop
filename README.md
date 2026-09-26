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
9. **Re-plans if needed** — updates hypotheses and experiments based on results
10. **Generates report** — full provenance, citations, uncertainty labels
11. **🛑 Awaits final approval** — before "publishing" results

## Key Design Principles

- **Evidence typing** — every claim classified as `literature`, `computational_prediction`, or `model_hypothesis`
- **Provenance** — full chain from API query → raw response → claim → hypothesis
- **No false certainty** — computational predictions explicitly labeled, never presented as validated results
- **Multi-objective scoring** — no opaque "best molecule" score; trade-offs are exposed
- **Human-in-the-loop** — 3 approval gates at scientifically meaningful decision points
- **Closed-loop iteration** — hypotheses are updated based on evidence, not just generated once
- **Distributed execution** — containerized services with parallel batch processing

## Project Structure

```
SciLoop/
├── core/                      # Closed-loop agent engines
│   ├── campaign-manager.js        # Orchestrates the full research loop
│   ├── hypothesis-engine.js       # Hypothesis lifecycle management
│   ├── belief-updater.js          # Updates confidence from observations
│   ├── experiment-selector.js     # Picks the next best experiment
│   ├── policy-engine.js           # Enforces budgets and constraints
│   └── artifact-store.js          # Object storage for scientific artifacts
├── mcp-servers/               # MCP tool servers for external APIs
│   ├── pubmed-server/             # PubMed E-utilities wrapper
│   ├── protein-db-server/         # PDB + AlphaFold DB
│   └── chembl-server/             # ChEMBL REST API
├── workers/                   # Distributed task processing
│   └── task-queue.js              # Redis-backed task queue with retries
├── skills/                    # TrueForge SKILL.md files
│   ├── research-planner/          # Plans campaigns + re-planning
│   ├── literature-search/
│   ├── target-biology/
│   ├── structure-retrieval/
│   ├── molecule-search/
│   ├── molecule-filter/
│   ├── scientific-critic/
│   ├── report-generator/
│   ├── experiment-selector/       # Experiment selection guidance
│   └── hypothesis-manager/        # Hypothesis lifecycle guidance
├── sandbox-scripts/           # Python scripts for Daytona sandbox
│   ├── rdkit_filter.py
│   ├── molecule_score.py
│   └── requirements.txt
├── schemas/                   # JSON schemas for data contracts
│   ├── hypothesis.json
│   ├── evidence.json
│   ├── experiment.json
│   ├── candidate.json
│   ├── belief-update.json
│   ├── campaign-state.json
│   └── policy.json
├── db/
│   ├── init.sql                   # PostgreSQL provenance schema
│   └── migration-phase2.sql       # Closed-loop tables
├── docker/                    # Container definitions
│   ├── Dockerfile.mcp-pubmed
│   ├── Dockerfile.mcp-protein
│   ├── Dockerfile.mcp-chembl
│   ├── Dockerfile.sandbox
│   ├── Dockerfile.core
│   └── docker-compose.yml         # Local multi-container orchestration
├── infra/                     # Infrastructure as Code
│   ├── k8s/                       # Kubernetes manifests
│   │   ├── namespace.yaml
│   │   ├── deployments.yaml
│   │   └── jobs.yaml              # Batch jobs, RBAC, NetworkPolicy
│   ├── argo/                      # Argo Workflow templates
│   │   ├── research-campaign-workflow.yaml
│   │   └── batch-workflows.yaml
│   ├── helm/sciloop/              # Helm chart
│   │   ├── Chart.yaml
│   │   ├── values.yaml
│   │   └── templates/
│   └── observability/             # Monitoring
│       ├── prometheus-config.yaml
│       └── grafana-dashboard.json
└── Doc/
    └── SciLoop Blueprint.md
```

## Architecture

### Phase 2: Closed-Loop Agent

```
Research Question
  → Hypotheses (HypothesisEngine)
    → Evidence Gathering (ExperimentSelector picks best next step)
      → Observation (MCP tools + sandbox)
        → Belief Update (BeliefUpdater adjusts confidence)
          → Critique (Scientific Critic)
            → Re-Plan? (if improvement possible)
              → Next Iteration OR Report
```

### Phase 3: Distributed Execution

```
┌─────────────────────────────────────────────────────┐
│                  Argo Workflows                      │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────┐  │
│  │Literature │  │ Target   │  │ Structure        │  │
│  │ Search   │  │Assessment│  │ Retrieval        │  │
│  └─────┬────┘  └────┬─────┘  └────────┬─────────┘  │
│        │            │                  │             │
│        ▼            ▼                  │             │
│  ┌──────────┐  ┌──────────┐           │             │
│  │ Compound │  │ Critique │           │             │
│  │  Search  │  │          │           │             │
│  └─────┬────┘  └──────────┘           │             │
│        │                               │             │
│        ▼                               │             │
│  ┌──────────────────────┐              │             │
│  │ Parallel Filtering   │◄─────────────┘             │
│  │ (5 pods × N batches) │                            │
│  └─────────┬────────────┘                            │
│            ▼                                         │
│  ┌──────────────────────┐                            │
│  │ Parallel Scoring     │                            │
│  │ (3 pods × M batches) │                            │
│  └─────────┬────────────┘                            │
│            ▼                                         │
│  ┌──────────────────────┐                            │
│  │   Report Generation  │                            │
│  └──────────────────────┘                            │
└─────────────────────────────────────────────────────┘
         │              │              │
    ┌────▼────┐   ┌────▼────┐   ┌────▼────┐
    │PostgreSQL│   │  Redis  │   │  MinIO  │
    │Provenance│   │  Queue  │   │Artifacts│
    └─────────┘   └─────────┘   └─────────┘
```

### Core Engines

| Engine | Purpose |
|--------|---------|
| **CampaignManager** | Orchestrates the loop, manages state, enforces gates |
| **HypothesisEngine** | Creates, updates, and resolves hypotheses |
| **BeliefUpdater** | Translates evidence into confidence changes |
| **ExperimentSelector** | Picks the highest-value next experiment |
| **PolicyEngine** | Enforces budgets, permissions, and scientific constraints |
| **ArtifactStore** | Content-addressed storage for scientific artifacts |
| **TaskQueue** | Redis-backed distributed task processing with retries |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Agent Harness | TrueForge |
| Sandbox | Daytona / Docker |
| MCP Servers | Node.js (ESM) |
| Core Engines | Node.js (ESM) |
| Task Queue | Redis |
| Object Storage | MinIO (S3-compatible) |
| Sandbox Scripts | Python 3.11 + RDKit + Biopython |
| Database | PostgreSQL |
| Orchestration | Kubernetes + Argo Workflows |
| Packaging | Helm |
| Observability | Prometheus + Grafana |
| External APIs | PubMed, PDB, AlphaFold DB, ChEMBL, UniProt |

## Getting Started

### Local Development (Docker Compose)

```bash
# Start all services
cd docker && docker compose up -d

# Verify services
docker compose ps

# View logs
docker compose logs -f worker
```

### Manual Setup

```bash
# 1. Start TrueForge
npx -y @truefoundry/trueforge

# 2. Initialize the database
psql -f db/init.sql
psql -f db/migration-phase2.sql

# 3. Install sandbox dependencies (inside Daytona)
pip install -r sandbox-scripts/requirements.txt

# 4. Start MCP servers
cd mcp-servers/pubmed-server && npm start
cd mcp-servers/protein-db-server && npm start
cd mcp-servers/chembl-server && npm start
```

### Kubernetes Deployment

```bash
# Using Helm
helm install sciloop infra/helm/sciloop/ \
  --namespace sciloop \
  --create-namespace \
  -f infra/helm/sciloop/values.yaml

# Or using raw manifests
kubectl apply -f infra/k8s/namespace.yaml
kubectl apply -f infra/k8s/deployments.yaml
kubectl apply -f infra/k8s/jobs.yaml

# Submit an Argo workflow
argo submit infra/argo/research-campaign-workflow.yaml \
  -p campaign-id="$(uuidgen)" \
  -p research-question="Investigate EGFR as a therapeutic target for NSCLC" \
  -p target-gene="EGFR"
```

## Phases

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 0 | Schemas + Provenance | ✅ Complete |
| Phase 1 | Single-node Research | ✅ Complete |
| Phase 2 | Closed-loop Agent | ✅ Complete |
| Phase 3 | Distributed Execution | ✅ Complete |
| Phase 4 | Search + Self-improvement | ⬜ Planned |
| Phase 5 | Simulation | ⬜ Planned |
| Phase 6 | Experimental Feedback | ⬜ Planned |
| Phase 7 | General Scientific Engine | ⬜ Planned |

## License

MIT