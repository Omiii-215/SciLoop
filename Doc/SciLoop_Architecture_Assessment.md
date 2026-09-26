# SciLoop Research AI Platform: Architecture and Implementation Assessment

## 1. Executive Summary

This assessment presents an exhaustive audit of the existing SciLoop codebase and defines the production refactoring architecture. The objective is to transform the existing dashboard on localhost into an enterprise-grade scientific research assistant platform comparable in interaction fluidity to ChatGPT, but specialized for researchers, clinicians, oncologists, physicists, and engineers.

The current system exhibits fundamental architectural shortcomings:
1. Hardcoded initial templates (such as EGFR Kinase T790M resistance) remain visible during query execution, leading to user confusion when searching disparate domains (for example, small cell lung cancer biomarkers).
2. Obsolete simulation modules (Three.js 3D molecular viewer, relativistic orbit canvas, quantum wave tunneling solver, PINN loss landscape canvas, and static PDB datasets) consume memory, bloat bundle size, and produce unresponsive canvases.
3. Absence of user authentication and isolation: conversations are stored globally or in browser localStorage without multi-user isolation or persistent backend user records.
4. Single-turn query model without multi-turn conversation memory, chat session branching, renaming, or deletion.
5. Limited literature index: only Crossref and arXiv are queried with small row limits, lacking access to the 40+ million biomedical papers in Europe PMC / PubMed.
6. Absence of response streaming, resulting in perception of latency during long LLM completions.
7. Lack of dynamic diagram and visual graph extraction (such as Mermaid signaling cascades or Kaplan-Meier survival curves).

This document establishes the audit findings and the phase-by-phase refactoring roadmap.

---

## 2. Comprehensive Codebase Audit

### 2.1. File Inventory and Component Status

| File Path | Type | Current Size | Role and Audit Finding | Action Required |
|---|---|---|---|---|
| `server.js` | Backend | 18.0 KB | Node.js HTTP server. Handles `/api/config`, `/api/search`, `/api/research`, `/api/chat`. Lacks auth, session management, user isolation, streaming, and database persistence. Contains dead references to simulation types (`3d_bio`, `physics`, `wave`, `ml_loss`). | Major refactor: add Google Auth, user workspace isolation, SQLite/JSON persistence, streaming, Europe PMC API, and diagram extraction. |
| `simulation-3d/index.html` | Frontend | 30.5 KB | Main UI template. Contains hardcoded EGFR content in `#dossierTitle`, `#dossierSummary`, `#simViewportFrame`. Contains dead simulation canvas containers (`#webglCanvas`, `#simBoxPhysics`, `#simBoxWave`, `#simBoxLoss`). | Redesign into clean ChatGPT-style research workspace with sidebar, user profile, chat stream, and artifact cards. Remove all simulation DOM elements. |
| `simulation-3d/app.js` | Frontend Logic | 44.3 KB | Over 400 lines dedicated to Three.js setup, trajectory frame scrubbing, and 2D canvas loops. Contains fallback mock templates that bleed into real user queries. | Strip all simulation loops and mock fallbacks. Implement streaming markdown renderer, Google Auth flow, chat session manager, and Mermaid/Chart visual extractors. |
| `simulation-3d/style.css` | Stylesheet | 34.2 KB | Contains extensive CSS for 3D HUD pills, simulation sliders, canvas overlays, and theme colors. Contains emojis in button labels and pseudo-elements. | Clean CSS: remove simulation styles, enforce strict typography (no emojis, no em dashes), style ChatGPT message bubbles, citation cards, and visual graphs. |
| `simulation-3d/simulation_data.json` | Static Asset | 502.1 KB | Static PDB 1M17 atomic coordinates and 60 MD trajectory frames. Completely unused in a general research platform. | Delete permanently. |
| `skills/` (20 subdirectories) | Prompts | 704 B | Legacy agent skill markdown files from previous biotech scaffold. Unreferenced by active server or client. | Archive or remove obsolete skills; keep only core research prompts. |
| `.env` | Environment | 227 B | Stores `OPENAI_API_KEY`, `PORT=8085`, `MODEL=gpt-4o`. Correctly ignored by git. | Retain and extend with `GOOGLE_CLIENT_ID` and `SESSION_SECRET`. |
| `package.json` | Manifest | 317 B | Contains only `"type": "module"` and `"start": "node server.js"`. Lacks production scripts or test runners. | Add dependencies if needed or maintain zero-dependency core with clean test harness. |

### 2.2. Dead Code and Technical Debt Inventory

1. **Dead Simulation Modules**:
   - `simulation_data.json` (502 KB): Hardcoded atomic coordinates for EGFR kinase.
   - Three.js WebGL Renderer: Scene, camera, directional lights, residue groups, OrbitControls, and 60-frame playback loop.
   - 2D Gravitational Orbit Canvas: Kerr black hole metric simulation loop and particle trails.
   - 2D Quantum Wave Tunneling Canvas: Finite difference wave packet simulation loop.
   - 2D PINN Loss Landscape Canvas: Optimization descent trajectory ellipse rendering loop.
2. **Hardcoded Initial HTML Strings**:
   - `index.html` lines 301-305: Hardcoded title "Targeted EGFR Kinase Inhibition vs. Chemotherapy in Advanced NSCLC...". When any new query is dispatched, these strings remain visible while the LLM processes, creating the visual bug observed in user testing.
3. **Mock Data Fallbacks**:
   - `app.js` lines 583-596: Injected fallback dossier with fake EGFR and Kerr spacetime parameters when network errors occur, instead of displaying accurate error boundaries.
4. **Emoji and Em Dash Usage**:
   - UI elements contain emojis (such as test tubes, crystals, atom symbols, and rockets).
   - Em dashes (`—`) are present in headers and server logs. Both violate the user style constraints.

### 2.3. Request and Data Flow Analysis

#### Current Request Flow (Deficient)
```
User Query -> [Hero Textarea] -> executeInquiry() 
  -> Show #conversationView (Hardcoded EGFR HTML initially visible!)
  -> POST /api/research -> Crossref & arXiv search (Limited to 5 rows)
  -> OpenAI GPT-4o Non-Streaming JSON Completion
  -> renderDossier() -> switchSim() -> Black / Unresponsive 3D Canvas
  -> Citations rendered without active PMID links
```

#### Target Production Request Flow
```
User Query + Uploaded Docs (PDF/MD)
  |
  v
[Client Chat Interface] (Per-User Authenticated Workspace)
  |
  v
POST /api/chat/stream (SSE or Chunked HTTP)
  |
  +---> [Server Query Classifier & Planner]
  |       |
  |       +---> [Document Context Engine] (Extracts & Reranks uploaded PDF/MD chunks)
  |       |
  |       +---> [Scholarly Literature Retrieval] (Parallel: Europe PMC, Crossref, arXiv)
  |               - Covers 40M+ PubMed records, 150M+ Crossref papers, 2.4M+ arXiv preprints
  |               - In-memory semantic and keyword deduplication and reranking
  |
  +---> [LLM Orchestration Gateway] (OpenAI GPT-4o)
  |       - Strict prompt enforcing grounded synthesis from retrieved sources
  |       - Zero hardcoded responses; dynamic reasoning only
  |       - Generation of Mermaid diagrams for mechanisms / pathways
  |       - Generation of structured Chart datasets (Kaplan-Meier, biomarker distributions)
  |       - Generation of KaTeX mathematical expressions ($...$, $$...$$)
  |       - Strict citation attribution with verified PMIDs, DOIs, arXiv URLs
  |
  +---> [Real-Time Streaming Response]
          - Token-by-token stream into chat message bubble
          - Dynamic rendering of KaTeX math, Mermaid vector graphics, and data charts
          - Citation hover cards and direct links to full-text repositories
          - Chat persisted to user's isolated session history
```

---

## 3. Production Architecture Redesign

### 3.1. Frontend Architecture (Client Workspace)

The frontend is refactored into a high-density, minimalist research environment inspired by ChatGPT and Scite:

1. **Authentication Layer**:
   - Google Sign-In button and Google Identity Services SDK integration.
   - User profile badge in sidebar with user name, email, avatar, and logout action.
   - Switch-user capabilities for local evaluation.
2. **ChatGPT-Style Sidebar**:
   - `+ New Chat` action.
   - Search filter for past research conversations.
   - Categorized conversation history (Today, Previous 7 Days, Previous 30 Days) isolated to the signed-in user.
   - Inline conversation actions: Rename thread, Delete thread, Export conversation.
3. **Main Research Canvas**:
   - Multi-turn conversation view with distinct user message bubbles and assistant response cards.
   - File attachment chip displaying parsed document name, page count, and byte size.
   - Live research status bar: displays query planning, paper retrieval counts across Europe PMC, Crossref, and arXiv.
   - Dynamic Markdown renderer supporting:
     - KaTeX equations ($...$ inline, $$...$$ block).
     - Mermaid.js diagrams for biochemical pathways, molecular mechanisms, and analytical workflows.
     - Interactive SVG/Canvas charts for quantitative data (survival curves, expression comparisons, ROC curves).
     - Code blocks with syntax highlighting and single-click clipboard copying.
     - Verified citation cards with publication year, journal, author list, DOI, PMID, and direct external links.
     - Adversarial critique box (Null Hypothesis H0, Confounders, Falsification Criteria).
4. **Persistent Bottom Prompt Bar**:
   - Auto-expanding textarea supporting Enter to send and Shift+Enter for newline.
   - File upload button supporting `.pdf`, `.md`, `.txt`, `.json` with client-side parsing via PDF.js.
   - Real-time character and token counter.

### 3.2. Backend Architecture (Server Engine)

The backend (`server.js`) is restructured into a clean modular architecture:

1. **Auth & Session Engine**:
   - Google OAuth token verification and session management.
   - Middleware enforcing per-user data isolation: `req.userId`.
   - Dedicated endpoints: `POST /api/auth/google`, `GET /api/auth/me`, `POST /api/auth/logout`.
2. **Chat & Workspace Persistence Engine**:
   - High-performance JSON/SQLite data layer stored in `data/user_chats.json`.
   - Partitioned by `userId` to guarantee zero cross-user data leakage.
   - Dedicated endpoints:
     - `GET /api/chats`: List conversations for authenticated user.
     - `POST /api/chats`: Create new conversation.
     - `GET /api/chats/:id`: Retrieve message history and artifacts for conversation.
     - `PATCH /api/chats/:id`: Rename conversation.
     - `DELETE /api/chats/:id`: Delete conversation.
     - `POST /api/chats/:id/messages`: Append user message and stream assistant response.
3. **Scholarly Literature Retrieval Engine (Millions of Papers)**:
   - **Europe PMC / PubMed**: Queries over 40 million abstracts, preprints, and clinical trial reports.
   - **Crossref Works API**: Queries over 150 million publisher records from Nature, Science, Cell, IEEE, Elsevier, Springer.
   - **arXiv API**: Queries over 2.4 million quantitative science preprints.
   - Parallel execution with 4-second timeout, deduplication by DOI/title, and query cache.
4. **Research Context & Document Engine**:
   - Ingests uploaded PDF and Markdown text, breaks into semantic sections (Abstract, Methods, Results, Discussion).
   - Injects document context into GPT-4o system prompt without context window overflow.
5. **LLM Orchestration & Streaming Gateway**:
   - Uses OpenAI `gpt-4o` with fallback to `gpt-4o-mini`.
   - Streaming HTTP chunks (SSE / chunked transfer) to provide immediate interactivity.
   - Dynamic generation of Mermaid diagram code and Chart datasets when query warrants visual explanation.
   - Zero hardcoded responses.
6. **Stylistic and Typography Enforcement**:
   - Complete prohibition of emojis across backend logs, API responses, and client templates.
   - Complete prohibition of em dashes; replacement with hyphens or colons.

---

## 4. Phase-by-Phase Implementation Roadmap

```
Phase 1: Codebase Audit & Assessment (Completed in this document)
   |
Phase 2: Purge Dead Code & Simulation Modules
   |   - Delete simulation_data.json
   |   - Remove Three.js, OrbitControls, and 2D canvas loops from app.js
   |   - Remove simulation DOM and hardcoded EGFR strings from index.html
   |   - Clean simulation CSS from style.css
   |
Phase 3: Multi-User Google Auth & Isolated Workspace Engine
   |   - Implement Google Sign-In SDK and backend session validation
   |   - Build user session store partitioned by userId
   |   - Create user profile switching for verification
   |
Phase 4: ChatGPT-Style Conversational Interface & History
   |   - Build responsive sidebar with chat thread management (create, rename, delete)
   |   - Implement multi-turn message stream with auto-scrolling
   |   - Support PDF and Markdown manuscript upload and in-browser parsing
   |
Phase 5: High-Speed Multi-Index Literature Engine (Millions of Papers)
   |   - Integrate Europe PMC (40M+ papers), Crossref (150M+ records), and arXiv
   |   - Implement parallel search, deduplication, and sub-second caching
   |
Phase 6: Dynamic Diagrams, Data Charts, and KaTeX Mathematical Formulations
   |   - Integrate Mermaid.js for biological pathways, mechanisms, and workflows
   |   - Implement interactive SVG/Canvas charts (Kaplan-Meier survival curves, biomarker plots)
   |   - Render KaTeX mathematical formulas
   |
Phase 7: Streaming LLM Research Gateway (OpenAI GPT-4o)
   |   - Implement chunked streaming for real-time responsiveness
   |   - Enforce grounded citation validation and adversarial critique
   |
Phase 8: End-to-End Verification and Quality Assurance
   |   - Test Google Auth and user isolation
   |   - Test Small Cell Lung Cancer biomarker query (ensure zero EGFR contamination)
   |   - Verify Mermaid diagram and survival chart generation
   |   - Validate PDF export and zero emoji / zero em dash compliance
```

---

## 5. Risk Assessment and Mitigation

| Risk | Impact | Mitigation Strategy |
|---|---|---|
| External search latency (Crossref/Europe PMC) | Degraded user response speed | Parallel queries with strict 4s timeouts; in-memory query cache; asynchronous literature injection. |
| Hardcoded content regression | User confusion with inaccurate answers | Purge all static default HTML strings; initialize DOM with empty states and clean skeletons only. |
| Token context overflow with large PDFs | LLM API rejection or truncated output | In-browser text segmentation; extract executive summary and key sections up to 24,000 characters. |
| Cross-user chat data leakage | Security and privacy violation | Strict backend authorization middleware validating `req.userId` against session tokens on all `/api/chats` routes. |
| Unintended emojis or em dashes | Style constraint violation | Automated grep check across all HTML, JS, CSS, and Markdown files before delivery. |

---

## 6. Conclusion

This assessment provides the technical basis to execute the refactor. By eliminating all dead simulation logic, introducing Google authentication, implementing isolated per-user chat workspaces, connecting to Europe PMC, Crossref, and arXiv, and streaming dynamic GPT-4o responses with diagrams and survival charts, SciLoop will deliver an enterprise-grade scientific research platform.
