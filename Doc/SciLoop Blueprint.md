# SciLoop — Scalable Autonomous Scientific Discovery Platform

## 1. Project definition
SciLoop is an open-source autonomous scientific research platform that uses foundation models, scientific tools, simulation, search, distributed compute, evidence tracking, and iterative critique to investigate biological questions.

The first domain is computational drug discovery. The system should not claim to discover clinically validated drugs. Its output is a ranked set of computationally supported hypotheses/candidates with explicit uncertainty, provenance, reproducibility information, and a path to experimental validation.

## 2. Source-derived design principles
The reviewed podcast repeatedly frames AI as a tool for scientific discovery, describes AlphaFold as a root-node scientific breakthrough, describes drug discovery as a chain involving target biology, chemistry, binding, off-target effects and toxicity, and describes an in-silico self-modification loop followed by wet-lab validation. It also discusses AlphaGo/AlphaZero-style search, simulation as a way to study systems where physical experiments are expensive or difficult, and the need for guardrails as systems become more capable.

These ideas lead to six design principles:
1. Scientific search over fixed workflows.
2. Closed-loop hypothesis → experiment → observation → critique → re-plan.
3. Biology-first reasoning before molecule optimization.
4. Simulation/prediction as first-class scientific instruments.
5. Evidence, uncertainty, provenance and reproducibility as first-class state.
6. Scientific objective constraints plus infrastructure security.

## 3. Core problem
Current computational drug-discovery pipelines often separate literature search, target analysis, molecule generation, docking, ADMET and reporting. SciLoop aims to connect these into a system that can decide what scientific question to investigate next, choose an appropriate computational experiment, execute it at scale, evaluate the result, challenge the hypothesis, and continue until the evidence budget or stopping criteria are reached.

## 4. Core research loop
Research question
→ biological hypothesis generation
→ evidence retrieval
→ target/mechanism assessment
→ experiment selection
→ candidate/search generation
→ simulation/prediction
→ observation
→ falsification/critique
→ evidence update
→ next experiment selection
→ repeat
→ candidate/report
→ human/experimental validation
→ optional feedback into next campaign

## 5. System architecture

### Control plane
- API Gateway / FastAPI
- Research Campaign Service
- Planner / Hypothesis Engine
- Scientific Policy Engine
- Experiment Scheduler
- Agent Runtime
- Evaluation Service

### Scientific plane
- Literature service
- Target biology service
- Molecular generation service
- Molecular filtering service
- Protein structure service
- Docking service
- Off-target/selectivity service
- ADMET service
- Simulation service
- ML scoring service

### Data plane
- PostgreSQL: campaigns, hypotheses, experiments, metadata, provenance
- Object storage (MinIO/S3): structures, molecules, trajectories, logs, reports
- Vector database (Qdrant): semantic retrieval of literature/evidence
- Redis: queues, caching, short-lived state
- Optional graph database later: evidence/causal graph

### Execution plane
- Kubernetes
- Argo Workflows
- Kubernetes Jobs
- CPU node pool
- GPU node pool
- isolated scientific containers

### Observability
- Prometheus
- Grafana
- OpenTelemetry
- centralized logs
- Langfuse or equivalent for agent traces

## 6. Core agents/services

### A. Research Planner
Input: research question.
Output: explicit hypotheses, evidence requirements, experiment candidates, budget and stopping criteria.

### B. Biology/Target Investigator
Investigates:
- disease mechanism
- causal biology
- target validity
- pathway context
- genetic evidence
- tissue/cell context
- known perturbations
- resistance/compensation hypotheses
- protein/domain information

### C. Literature/Evidence Agent
Uses approved sources such as PubMed, Europe PMC, Crossref and Semantic Scholar.
Extracts claims and supporting evidence while retaining provenance.

### D. Structure Agent
Uses PDB/AlphaFold DB and structure-prediction tools when appropriate.
Produces structure artifacts and confidence metadata.

### E. Molecule Search/Generation Agent
Retrieves or generates candidates using sources/models appropriate to the campaign.

### F. Molecular Evaluation Service
RDKit-based validity, descriptors, fingerprints, structural filters and chemistry constraints.

### G. Docking Service
Runs reproducible docking jobs such as AutoDock Vina and potentially other approved methods.

### H. Selectivity/Off-target Service
Explicitly tests whether promising candidates may interact with unrelated proteins. This is a first-class objective, not merely a final report field.

### I. ADMET Service
Computational estimates for properties such as solubility, absorption, metabolism and toxicity. Every result is labeled as a prediction rather than clinical evidence.

### J. Simulation Service
Long-term extension for molecular dynamics and other scientifically justified simulation environments. Simulation is treated as an instrument that can discriminate hypotheses, not merely as a visualization step.

### K. Scientific Critic/Falsifier
For every important hypothesis:
- evidence supporting it
- evidence against it
- uncertainty
- assumptions
- possible confounders
- falsification test
- recommended next experiment

### L. Experiment Selector
Chooses the next computational experiment based on expected scientific value, uncertainty reduction, cost, safety constraints and available compute.

## 7. Scientific state model
Each campaign maintains:

ResearchQuestion
→ Hypothesis
→ EvidenceSet
→ CandidateExperiment
→ ExperimentRun
→ Observation
→ Critique
→ BeliefUpdate
→ NextAction

Each artifact has:
- immutable ID
- source/provenance
- timestamp
- software/container version
- input hashes
- configuration
- result artifacts
- confidence/uncertainty
- parent experiment/hypothesis

## 8. Evidence model
Distinguish explicitly between:
1. model-generated hypothesis
2. literature-supported fact
3. computational prediction
4. computational experiment
5. experimentally validated result

The system must not convert a prediction into a fact simply because an LLM generated a confident explanation.

## 9. Scientific objective/policy layer
Every campaign has:
- research objective
- hard scientific constraints
- safety constraints
- evidence requirements
- compute/time budget
- allowed tools
- forbidden actions
- stopping criteria
- human approval gates

The planner cannot silently rewrite the objective or disable constraints.

## 10. Infrastructure security
LLMs must never receive arbitrary host shell access.

Use:
- approved tool registry
- isolated containers
- non-root execution
- restricted Kubernetes service accounts
- resource quotas
- CPU/GPU limits
- network policies
- execution timeouts
- input/output validation
- artifact scanning
- audit logs

## 11. Kubernetes execution model
Example: 5,000 candidate molecules.

1. Molecular service creates candidate set.
2. Scheduler creates experiment tasks.
3. Redis/queue holds tasks.
4. Worker submits Kubernetes Jobs.
5. Each Job runs a pinned scientific container.
6. Results are written to MinIO/PostgreSQL.
7. Metrics/traces are emitted.
8. Aggregator builds the experiment result set.
9. Critic evaluates results.
10. Planner decides whether another search iteration is justified.

Never run a large scientific search as one sequential Python process.

## 12. Container layout
Suggested images:
- sciloop/planner
- sciloop/literature
- sciloop/biology
- sciloop/structure
- sciloop/molecule
- sciloop/docking
- sciloop/selectivity
- sciloop/admet
- sciloop/simulation
- sciloop/evaluator

Each scientific image should pin dependencies and expose a narrow, versioned command/API contract.

## 13. Initial repository structure

sciloop/
├── apps/
│   ├── api/
│   ├── web/
│   └── worker/
├── agents/
│   ├── planner/
│   ├── biology/
│   ├── literature/
│   ├── molecule/
│   └── critic/
├── scientific/
│   ├── structure/
│   ├── docking/
│   ├── selectivity/
│   ├── admet/
│   └── simulation/
├── core/
│   ├── schemas/
│   ├── policy/
│   ├── provenance/
│   ├── experiments/
│   └── evidence/
├── workers/
│   ├── cpu/
│   └── gpu/
├── infra/
│   ├── docker/
│   ├── helm/
│   ├── k8s/
│   └── argo/
├── evaluation/
├── benchmarks/
├── datasets/
├── docs/
└── tests/

## 14. Technology stack
Backend: Python, FastAPI, Pydantic.
Agent orchestration: LangGraph and/or Pydantic AI.
Scientific: RDKit, Biopython, NumPy, SciPy, PyTorch.
Data: PostgreSQL, Qdrant, MinIO/S3, Redis.
Frontend: Next.js, TypeScript, Tailwind, shadcn/ui.
Execution: Docker, Kubernetes, Argo Workflows, Helm.
Observability: Prometheus, Grafana, OpenTelemetry, Langfuse.

## 15. MVP
The MVP should NOT attempt full autonomous drug discovery.

MVP research question example:
“Investigate a documented biological target and identify computationally interesting candidate molecules, with evidence and reproducibility.”

MVP capabilities:
1. Literature retrieval and evidence extraction.
2. Target/mechanism investigation.
3. Structure retrieval.
4. Candidate retrieval.
5. RDKit filtering.
6. Small-scale docking.
7. Basic selectivity checks where data is available.
8. Evidence-backed report.
9. Complete experiment provenance.
10. Reproduce Experiment button.

Run locally first with Docker Compose.

## 16. Scale-up phases

### Phase 0 — Scientific contracts
Define schemas, provenance, experiment interface, tool registry and policy engine.

### Phase 1 — Single-node research system
Literature + biology + structure + molecules + RDKit + docking + report.

### Phase 2 — Closed-loop agent
Planner + hypothesis engine + critic + experiment selector + re-planning.

### Phase 3 — Distributed execution
Redis + Kubernetes Jobs + Argo + MinIO + PostgreSQL + CPU/GPU pools.

### Phase 4 — Search/self-improvement
Candidate generation → evaluation → modification → re-evaluation.
Add selectivity and multi-objective optimization.

### Phase 5 — Simulation
Add scientifically justified molecular simulation and richer computational experiments.

### Phase 6 — Experimental feedback
Design an interface for human/lab results to enter as validated observations. Use those results to update subsequent computational campaigns.

### Phase 7 — General scientific engine
Abstract the platform so a new scientific domain can plug in its own hypothesis space, simulators, evaluators and evidence sources.

## 17. Multi-objective candidate optimization
Avoid a single “best molecule” score.
Track a vector such as:
- target activity proxy
- selectivity proxy
- ADMET properties
- chemical validity
- novelty/diversity
- uncertainty
- computational cost

The system should expose trade-offs instead of hiding them in one opaque score.

## 18. Evaluation
Evaluate the system at four levels.

### Scientific
- evidence correctness
- citation/provenance accuracy
- hypothesis quality
- prediction calibration
- reproducibility
- experimentally supported hit rate when benchmark data exists

### Agentic
- correct tool selection
- useful experiment selection
- successful re-planning
- ability to reject bad hypotheses
- long-horizon task completion

### Systems
- jobs/hour
- throughput
- GPU utilization
- queue latency
- failure/retry rate
- cost per experiment
- scaling efficiency

### Safety
- policy violations
- unauthorized tool attempts
- constraint bypass attempts
- unsafe artifact execution
- provenance loss
- unsupported scientific claims

## 19. Benchmark concept
Create a benchmark with known historical scientific questions where the system must:
1. retrieve evidence
2. form hypotheses
3. propose experiments
4. execute computational tests
5. update conclusions
6. provide provenance
7. identify uncertainty

Measure against known literature and reproducible computational results rather than judging only the final LLM text.

## 20. Reproducibility
Every experiment should be replayable from:
- container digest
- code commit
- dataset/input hashes
- configuration
- parameters
- random seeds
- model versions
- tool versions
- hardware metadata where relevant

The UI should provide “Reproduce” and “Compare Runs”.

## 21. UI
Main screens:
- Research Campaign
- Research Plan
- Hypothesis Board
- Evidence Graph
- Experiment Queue
- Live Kubernetes Jobs
- Molecule Explorer
- Target/Protein Explorer
- Selectivity/ADMET dashboard
- Experiment Run page
- Critic/Falsification panel
- Provenance
- Reproduce/Compare
- Final Research Report

The product should feel like a scientific workstation, not a chat interface.

## 22. Example end-to-end campaign
Question:
“Investigate whether target X is a computationally promising therapeutic target and identify candidate molecules for further study.”

Step 1: Planner creates competing biological hypotheses.
Step 2: Literature agent gathers evidence.
Step 3: Biology agent assesses target validity.
Step 4: Structure agent retrieves/predicts relevant structures.
Step 5: Molecule service retrieves/generates candidates.
Step 6: RDKit removes invalid/undesirable structures.
Step 7: Docking evaluates candidates.
Step 8: Selectivity service evaluates potential off-targets.
Step 9: ADMET service estimates relevant properties.
Step 10: Critic searches for contradictory evidence and proposes falsification tests.
Step 11: Experiment selector chooses the next high-value computation.
Step 12: Kubernetes executes the experiment batch.
Step 13: Results update the evidence/hypothesis state.
Step 14: Candidate generation modifies promising structures.
Step 15: Loop repeats under budget/stopping constraints.
Step 16: System produces a ranked candidate set with uncertainty, evidence and reproducibility metadata.
Step 17: Human decides whether experimental validation is warranted.

## 23. What makes this project technically interesting
The project combines:
- agentic reasoning
- scientific computing
- molecular biology
- search/optimization
- simulation
- distributed systems
- Kubernetes orchestration
- GPU scheduling
- data provenance
- reproducibility
- safety/policy enforcement
- long-horizon evaluation

The novelty should come from the closed-loop scientific architecture and evaluation, not from claiming that any individual component is new.

## 24. What NOT to build
Do not build:
- a ChatGPT-style literature chatbot
- a fixed multi-agent chain with no experiment selection
- a dashboard that only displays docking scores
- an LLM that executes arbitrary shell commands
- an opaque single molecule score
- a system that calls predictions “validated discoveries”
- Kubernetes complexity before the scientific loop works locally

## 25. Recommended build order
1. Define scientific schemas and provenance.
2. Build one complete research campaign locally.
3. Add real docking and evidence retrieval.
4. Add critic/falsification.
5. Add candidate self-improvement.
6. Add experiment selection.
7. Containerize every scientific tool.
8. Move batch execution to Kubernetes.
9. Add GPU workloads.
10. Add simulation.
11. Add reproducibility/evaluation benchmarks.
12. Add experimental-feedback interfaces.

## 26. North-star architecture
The final system is:

Foundation Model
→ Scientific Planner
→ Hypothesis Space
→ Tool/Experiment Selection
→ Distributed Scientific Execution
→ Observation
→ Evidence Graph
→ Falsification Critic
→ Belief Update
→ Search/Optimization
→ Re-plan
→ Reproduce
→ Human/Experimental Validation
→ New Evidence
→ next research cycle

Drug discovery is the first implementation of this general scientific loop.
