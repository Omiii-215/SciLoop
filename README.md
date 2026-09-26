# 🔬 SciLoop — Autonomous Scientific Research Companion

**SciLoop** is a full-stack, autonomous scientific research companion and discovery platform inspired by **Scite.ai Assistant**. Engineered for researchers across Theoretical Physics, Oncology, Molecular Biology, Chemistry, Scientific Machine Learning, and Applied Mathematics, SciLoop synthesizes peer-reviewed literature, derives governing mathematical equations, tabulates physical parameters, generates custom computational models, and runs live interactive 2D/3D simulations.

---

## 🌟 Key Features

### 1. 🤖 Literature-Grounded LLM Intelligence (OpenAI GPT-4o)
- **Arbitrary Scientific Inquiries**: Accepts high-level research questions, hypotheses, or specialized domain queries.
- **Full Manuscript Ingestion**: Drag-and-drop or upload PDF research papers, Markdown (`.md`), or plain text files. Extracted in-browser using `pdf.js` and ingested directly into the reasoning context.
- **Scite-Style Smart Citations**: Automatically tallies and categorizes peer-reviewed literature into:
  - 🟢 **Supporting Citations**: Confirms or provides empirical evidence for the hypothesis.
  - 🔵 **Mentioning Citations**: Provides contextual background, methodologies, or related experiments.
  - 🔴 **Contrasting / Disputing Citations**: Identifies contradictory evidence, differing mechanisms, or falsification arguments.

### 2. 📚 Live Scientific Search Engine Aggregator
- Live integration with **Crossref** (peer-reviewed journals from Nature, Science, Cell, IEEE, APS, Elsevier, Springer) and **arXiv** (preprints in Physics, Mathematics, CS, Quantitative Biology).
- Retrieves real DOIs, authors, publication years, and abstracts in parallel to ground every synthesis.

### 3. 📐 Rigorous Mathematical & Parameter Formulations
- **KaTeX Equations**: Derives governing differential equations, thermodynamic relations, and field tensors with LaTeX typography.
- **Parameter Breakdown**: Tabulates physical attributes, symbols, calculated estimates, SI/cgs units, and physical significance.

### 4. 🎮 Multi-Modal Interactive Simulation Engine
SciLoop automatically matches your research topic to the appropriate real-time simulation:
- **🧬 3D Molecular Dynamics (Three.js)**: 60-frame trajectory playback of the EGFR kinase domain (PDB: 1M17) with alpha-helices, beta-sheets, kinase inhibitor ligand conformers, hydrogen bonding, steric clashes, orbital controls, and frame scrubbing.
- **🌌 Relativistic Orbit Simulator**: Simulates relativistic geodesics and perihelion precession in Schwarzschild and Kerr spacetime geometries.
- **🌊 Quantum Wave Packet Tunneling**: Solves the 1D time-dependent Schrödinger equation across finite potential barriers, computing transmission coefficients ($T$) and reflection probabilities.
- **📊 PINN Loss Landscape Tracker**: Visualizes Physics-Informed Neural Network convergence, plotting PDE residual loss and boundary conditions over training epochs.

### 5. 💻 Custom Scientific ML & PyTorch Architecture
- Generates complete, syntactically valid PyTorch or NumPy numerical solver code tailored to the inquiry.
- One-click code copying for immediate execution in Jupyter or Google Colab.

### 6. ⚔️ Adversarial Scientific Critique & Falsification
- Formulates the rigorous **Null Hypothesis ($H_0$)**.
- Exposes hidden confounders, experimental artifacts, and observational limitations.
- Defines explicit, quantitative **Falsification Thresholds** under which the model is refuted.

### 7. 💬 Interactive Follow-Up Dialogue & Publication PDF Export
- **Conversational Threading**: Ask follow-up questions to probe deeper into specific terms, equations, or boundary conditions with real-time KaTeX rendering.
- **Publication PDF Export**: One-click export via `html2pdf.js`, generating academic-grade dossiers ready for distribution.

---

## 🏗️ System Architecture

```
SciLoop/
├── server.js               # High-performance zero-dependency Node.js server
│                           # - Serves Scite-style frontend at http://localhost:8085/
│                           # - Aggregates Crossref & arXiv APIs in parallel
│                           # - Proxies OpenAI GPT-4o completions (/api/research, /api/chat)
├── package.json            # Node.js project manifest ("npm start")
├── .env                    # Environment configuration (OPENAI_API_KEY, PORT, MODEL)
├── simulation-3d/          # Production Research Companion Frontend
│   ├── index.html          # Scite.ai layout, search hero card, simulation frames
│   ├── style.css           # Premium Scite design system, KaTeX styling, print rules
│   ├── app.js              # State machine, PDF.js parser, Three.js 3D viewer, 2D canvases
│   └── simulation_data.json# 60-frame EGFR kinase MD coordinates & conformations
└── Doc/
    └── SciLoop Blueprint.md# In-depth system design & mathematical specifications
```

---

## 🚀 Quickstart & Local Setup

### Prerequisites
- Node.js (v18 or higher recommended)

### 1. Start the Server
```bash
npm start
```
*The server will start on [http://localhost:8085/](http://localhost:8085/)*.

### 2. Configure OpenAI API Key
The repository is pre-configured with the OpenAI API key in `.env`. You can also configure or update your key anytime in the UI:
1. Click the **⚙️ Settings** icon in the sidebar or search card.
2. Enter your OpenAI API key (`sk-proj-...`).
3. Select your model (`gpt-4o`, `gpt-4o-mini`, `o1-preview`).
4. Click **Save Settings**.

---

## 📡 API Reference

### `GET /api/config`
Returns API key connection status and active model.

### `GET /api/search?q={query}`
Searches real peer-reviewed scientific literature across Crossref and arXiv.

### `POST /api/research`
Autonomous research synthesis endpoint.
```json
{
  "query": "Kerr Spacetime Geodesics and Ergosphere Frame Dragging",
  "documentContext": "Optional text extracted from uploaded PDF/MD paper",
  "model": "gpt-4o"
}
```

### `POST /api/chat`
Conversational follow-up endpoint with active dossier grounding.
```json
{
  "message": "What happens if the black hole spin parameter a approaches 1?",
  "context": "Active dossier title, equations, and attributes",
  "model": "gpt-4o"
}
```

---

## 📄 License
MIT License. Built for scientists, researchers, and engineers worldwide.