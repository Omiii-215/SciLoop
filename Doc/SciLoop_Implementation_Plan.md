# SciLoop Research Platform: Full Architecture and Implementation Plan

## 1. Executive Summary
This document establishes the architecture and execution blueprint to refactor SciLoop into an enterprise-grade scientific conversational research platform modeled after ChatGPT and Scite, customized specifically for researchers, clinicians, oncologists, physicists, and bio-engineers.

All legacy simulation code (Three.js 3D viewer, 2D relativistic orbit canvas, quantum wave solver, and PINN loss canvas) and static mock datasets will be completely removed. The updated architecture provides:
1. Google Authentication and isolated chat spaces with distinct session histories per user.
2. High-speed literature retrieval indexing millions of papers across PubMed/Europe PMC, Crossref, and arXiv.
3. Fast, accurate, fully dynamic OpenAI GPT-4o reasoning with zero hardcoded templates.
4. Embedded diagrams (Mermaid.js for biological mechanisms and workflows) and interactive data charts (Kaplan-Meier survival curves, biomarker expressions, ROC curves).
5. Deep document extraction for uploaded PDF and Markdown manuscripts.
6. Publication-grade PDF exports and LaTeX mathematical typesetting via KaTeX.
7. Strict stylistic compliance: zero emojis and zero em dashes throughout all code, templates, and outputs.

---

## 2. System Architecture

```
                                  [ User Browser ]
                                         |
               +-------------------------+-------------------------+
               |                                                   |
      [ Google OAuth / Auth ]                             [ Document Upload ]
      (Identity, User Token)                              (PDF.js / Markdown Parser)
               |                                                   |
               +-------------------------+-------------------------+
                                         |
                               [ SciLoop Web UI ]
               (Chat Sidebar, Per-User History, Message Stream, KaTeX,
                   Mermaid Diagrams, Data Charts, Export Engine)
                                         |
                                  HTTP / JSON APIs
                                         |
                               [ SciLoop Node Server ]
                             (server.js - Port 8085)
                                         |
               +-------------------------+-------------------------+
               |                         |                         |
      [ User & Chat Store ]    [ Literature Aggregator ]   [ LLM Reasoning Proxy ]
      (Isolated per-user        - Europe PMC (40M+ papers)  - OpenAI GPT-4o
       conversations & state)   - Crossref (150M+ records)  - Dynamic Prompt Engine
                                - arXiv (2.4M+ preprints)   - JSON & Markdown Stream
```

---

## 3. Directory Layout and Dead Code Elimination

### 3.1. Dead Code to Remove
The following files and components are obsolete and will be permanently removed:
- `simulation-3d/simulation_data.json` (500KB static PDB coordinate file)
- All Three.js WebGL setup, OrbitControls, atom spheres, residue bonds, and trajectory playback
- All 2D Canvas simulations (Relativistic orbit loop, quantum wave tunneling solver, PINN loss landscape canvas)
- All simulation tabs, HUD overlays, playback buttons, and slider elements

### 3.2. Refactored Codebase Structure
```
SciLoop/
├── server.js                 # Unified Node.js backend server (port 8085)
│                             # - Multi-user session management
│                             # - High-speed parallel literature search (Europe PMC, Crossref, arXiv)
│                             # - OpenAI GPT-4o research completion & streaming proxy
│                             # - Google Identity verification and user profile handler
├── package.json              # Dependencies and start scripts
├── .env                      # OPENAI_API_KEY, PORT=8085, MODEL=gpt-4o
├── .env.example              # Environment variables template
├── client/                   # Clean web application frontend
│   ├── index.html            # ChatGPT-style scientific interface
│   ├── app.js                # State machine, auth handler, chat controller, chart generator
│   └── style.css             # Minimalist typography, zero emojis, clean theme
├── data/                     # Persistent storage for user profiles and chat histories
│   └── user_chats.json       # Partitioned user chat sessions
├── Doc/
│   └── SciLoop Blueprint.md  # Formal system documentation
└── README.md                 # Updated documentation and setup guide
```

---

## 4. Subsystem Specifications

### 4.1. Authentication and Per-User Chat Spaces
1. **User Identity Model**:
   - Google Sign-In integration via Google Identity Services and client authentication.
   - User object schema: `{ userId, name, email, avatarUrl, lastActive }`.
   - Support for multiple researcher profiles and fast profile switching for local evaluation.
2. **Isolated Chat Storage**:
   - Chat threads are strictly isolated by `userId`.
   - Each user maintains an independent list of sessions:
     `{ id, userId, title, createdAt, updatedAt, messages: [ { role, content, attachments, literature, diagrams, timestamp } ] }`.
   - Users can create new chats, switch between conversations, rename topics, and delete threads.

### 4.2. High-Speed Literature Retrieval Engine (Millions of Papers)
The server executes parallel asynchronous searches across three major scholarly indices:
1. **Europe PMC / PubMed REST API**:
   - Covers over 40 million abstracts, preprints, and PubMed Central full texts.
   - Endpoint: `https://www.ebi.ac.uk/europepmc/webservices/rest/search`
   - Yields: PMID, PMCID, DOI, Title, Authors, Journal, Year, Abstract snippet.
2. **Crossref API**:
   - Covers over 150 million registered DOI publications from Elsevier, Springer, Wiley, Nature, Science, IEEE, Cell.
   - Endpoint: `https://api.crossref.org/works`
3. **arXiv API**:
   - Covers over 2.4 million preprints in physics, mathematics, computer science, and quantitative biology.
   - Endpoint: `https://export.arxiv.org/api/query`
4. **Latency Target**: Less than 1.5 seconds through parallel promise execution, abort controllers, and in-memory query caching.

### 4.3. Dynamic Scientific Reasoning and Context Ingestion
1. **Manuscript Parsing**:
   - In-browser extraction of `.pdf`, `.md`, and `.txt` files via PDF.js.
   - Text chunks injected directly into LLM prompt with token budgets.
2. **OpenAI GPT-4o Integration**:
   - Strict instructions: Zero hardcoded responses. Every answer dynamically addresses the user's specific query.
   - Real citations tagged as Supporting, Mentioning, or Contrasting with active links (DOI / PMID / arXiv).
   - LaTeX mathematical typesetting rendered via KaTeX.
   - Adversarial critique: Null hypothesis, confounders, and falsification criteria.

### 4.4. Diagram and Graph Generation Subsystem
1. **Mechanism and Pathway Diagrams**:
   - Automatic generation of Mermaid.js syntax for biological pathways, signaling cascades, molecular interactions, and experimental workflows.
   - Client-side rendering into crisp vector SVG diagrams.
2. **Interactive Quantitative Charts**:
   - Automatic generation of structured chart specifications for quantitative inquiries (e.g. Kaplan-Meier overall survival curves for biomarkers, ROC curves for diagnostic sensitivity, box plots for gene expression).
   - Client-side rendering via clean Canvas/SVG chart components.

### 4.5. Stylistic and Typography Constraints
1. **No Emojis**: All emojis are prohibited. Theme-consistent text tags or SVG icons will be used (e.g. `[Supporting]`, `[Ref]`, `[+]`, `[->]`, `(i)`).
2. **No Em Dashes**: The em dash character is prohibited. Standard hyphens `-` or colons `:` will be used.

---

## 5. Step-by-Step Execution Plan

| Phase | Milestone | Actions |
|---|---|---|
| **Phase 1** | Dead Code & Simulation Removal | Delete `simulation_data.json`, purge Three.js and 2D canvas loops from `app.js`, remove simulation DOM elements from `index.html`, clean `style.css`. |
| **Phase 2** | Multi-User Auth & Storage Engine | Implement Google Sign-In and user state management in `server.js` and frontend. Create persistent chat storage partitioned by `userId`. |
| **Phase 3** | High-Speed Multi-Index Literature Search | Build parallel aggregator in `server.js` querying Europe PMC (40M+ papers), Crossref, and arXiv with sub-second caching. |
| **Phase 4** | ChatGPT-Style Conversational Interface | Build responsive chat layout with sidebar, thread list, multi-turn message stream, PDF/MD attachment handling, and follow-up prompt bar. |
| **Phase 5** | Dynamic Diagrams & Chart Engine | Integrate Mermaid.js vector diagram rendering and interactive quantitative charts (Kaplan-Meier survival curves, biomarker distributions). |
| **Phase 6** | End-to-End Testing & Verification | Verify Google login, user switching, isolated chat histories, small cell lung cancer biomarker query, diagram rendering, and PDF report export. |
