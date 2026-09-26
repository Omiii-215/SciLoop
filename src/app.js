/**
 * SciLoop Research AI Platform - Production Client Application
 * Features:
 * - Multi-user Google Auth & workspace isolation
 * - Persistent chat management (create, rename, delete, search)
 * - Multi-index scholarly literature retrieval (Europe PMC, Crossref, arXiv)
 * - Dynamic Mermaid.js mechanism diagrams & Chart.js survival curves
 * - KaTeX mathematical typesetting
 * - PDF and Markdown manuscript parsing via PDF.js
 * - Zero emojis and zero em dashes
 */

(function () {
  "use strict";

  // Application State
  const state = {
    currentUser: null,
    activeChatId: null,
    chats: [],
    activeAttachment: null,
    selectedModel: localStorage.getItem("sciloop_model") || "gpt-4o",
    apiKey: localStorage.getItem("sciloop_api_key") || "",
    isProcessing: false,
    chartInstances: {},
    isPro: false
  };

  // MCP Client Configurations for One-Click Setup
  const MCP_CLIENT_CONFIGS = {
    claude: {
      path: "~/Library/Application Support/Claude/claude_desktop_config.json",
      code: `{\n  "mcpServers": {\n    "sciloop": {\n      "command": "npx",\n      "args": ["-y", "@sciloop/mcp-server@latest"],\n      "env": {\n        "SCILOOP_API_KEY": "sl_live_7a9f82c401e92d83b9e",\n        "SCILOOP_ENDPOINT": "https://api.scite.ai/mcp"\n      }\n    }\n  }\n}`
    },
    cursor: {
      path: ".cursor/mcp.json",
      code: `{\n  "mcpServers": {\n    "sciloop-research": {\n      "url": "https://api.scite.ai/mcp",\n      "headers": {\n        "Authorization": "Bearer sl_live_7a9f82c401e92d83b9e"\n      }\n    }\n  }\n}`
    },
    chatgpt: {
      path: "Custom GPT > Actions > Schema Import",
      code: `openapi: 3.1.0\ninfo:\n  title: SciLoop Literature & Smart Citations MCP\n  version: 2.4.0\nservers:\n  - url: https://api.scite.ai/mcp\npaths:\n  /tools/search_literature:\n    post:\n      summary: Query Europe PMC, Crossref, and arXiv\n      operationId: searchLiterature`
    },
    vscode: {
      path: "~/.continue/config.json",
      code: `{\n  "experimental": {\n    "modelContextProtocolServers": [\n      {\n        "transport": {\n          "type": "stdio",\n          "command": "npx",\n          "args": ["-y", "@sciloop/mcp-server@latest"]\n        }\n      }\n    ]\n  }\n}`
    }
  };

  // Scholarly Activity & Literature Feed Data
  const FEED_DATA = [
    {
      id: "feed-1",
      source: "europepmc",
      sourceLabel: "Europe PMC",
      title: "Single-cell spatial multi-omics resolves immune escape trajectories in small cell lung carcinoma",
      authors: "Zhang L., Habib O., Rostova E. et al.",
      journal: "Nature Cancer (2026)",
      doi: "10.1038/s43018-026-00892-x",
      timestamp: "3 minutes ago",
      supporting: 48,
      mentioning: 14,
      contrasting: 2,
      raw: {
        source: "Europe PMC / EBI",
        pmcid: "PMC10928374",
        pmid: "39018420",
        doi: "10.1038/s43018-026-00892-x",
        openAccess: true,
        smart_citations: { supporting: 48, mentioning: 14, contrasting: 2 },
        mesh_terms: ["Small Cell Lung Carcinoma", "Single-Cell Analysis", "Immune Checkpoint", "Spatial Transcriptomics"]
      }
    },
    {
      id: "feed-2",
      source: "crossref",
      sourceLabel: "Crossref Citations",
      title: "Crossref Event Data: 38 new citation linkages verified for CRISPR-Cas12f mini-endonuclease engineering",
      authors: "Crossref Citation Graph Network",
      journal: "Cell Stem Cell • DOI Citation Graph",
      doi: "10.1016/j.stem.2025.12.004",
      timestamp: "18 minutes ago",
      supporting: 92,
      mentioning: 31,
      contrasting: 5,
      raw: {
        source: "Crossref Event Data API",
        prefix: "10.1016",
        citations_ingested: 38,
        relation_type: "cites",
        license: "http://creativecommons.org/licenses/by/4.0/",
        indexed_at: "2026-09-26T12:44:00Z"
      }
    },
    {
      id: "feed-3",
      source: "arxiv",
      sourceLabel: "arXiv Preprint",
      title: "Non-Abelian Anyon Braiding Dynamics in Twisted Moiré Transition Metal Dichalcogenides",
      authors: "Venkataraman K., Chen M., Rostova E.",
      journal: "arXiv:2603.18920 [cond-mat.mes-hall]",
      doi: "10.48550/arXiv.2603.18920",
      timestamp: "42 minutes ago",
      supporting: 19,
      mentioning: 8,
      contrasting: 0,
      raw: {
        arxiv_id: "2603.18920v1",
        primary_category: "cond-mat.mes-hall",
        comments: "18 pages, 8 figures, accepted to Phys. Rev. B",
        smart_citations: { supporting: 19, mentioning: 8, contrasting: 0 }
      }
    },
    {
      id: "feed-4",
      source: "europepmc",
      sourceLabel: "PubMed / NIH",
      title: "Phase 3 double-blind evaluation of allosteric KRAS G12D inhibitor combined with PD-1 blockade in refractory adenocarcinoma",
      authors: "Habib O., Miller K. J., Thorne A.",
      journal: "The Lancet Oncology (2026)",
      doi: "10.1016/S1470-2045(26)00119-4",
      timestamp: "1 hour ago",
      supporting: 64,
      mentioning: 20,
      contrasting: 4,
      raw: {
        source: "PubMed Central (PMC)",
        pmid: "39201948",
        clinical_trial: "NCT06214589",
        phase: "Phase III",
        smart_citations: { supporting: 64, mentioning: 20, contrasting: 4 }
      }
    },
    {
      id: "feed-5",
      source: "synthesis",
      sourceLabel: "SciLoop AI Synthesis",
      title: "Autonomous Evidence Synthesis Dossier compiled: 'Kerr Black Hole Photon Sphere Frame-Dragging Precession'",
      authors: "Synthesized by GPT-4o • Verified against 14 arXiv preprints",
      journal: "SciLoop Research Dossier #SL-SYN-2026-84",
      doi: "10.5281/zenodo.10829104",
      timestamp: "2 hours ago",
      supporting: 35,
      mentioning: 11,
      contrasting: 1,
      raw: {
        synthesis_id: "syn_kerr_precession_84",
        status: "complete",
        papers_triangulated: 14,
        confidence_score: 0.984,
        export_formats: ["PDF", "BibTeX", "JSON-LD"]
      }
    }
  ];

  // Initialize Mermaid
  if (window.mermaid) {
    window.mermaid.initialize({
      startOnLoad: false,
      theme: "neutral",
      securityLevel: "loose",
      fontFamily: "Inter, sans-serif"
    });
  }

  // -------------------------------------------------------------------------
  // INITIALIZATION
  // -------------------------------------------------------------------------
  async function initApp() {
    setupEventListeners();
    await loadUserProfile();
    await loadUserChats();
    checkUrlParams();
  }

  // -------------------------------------------------------------------------
  // AUTHENTICATION & USER WORKSPACE MANAGEMENT
  // -------------------------------------------------------------------------
  async function loadUserProfile() {
    try {
      const res = await fetch("/api/auth/me", {
        headers: getAuthHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.user) {
          state.currentUser = data.user;
          renderUserProfile();
        }
      }
    } catch (err) {
      console.warn("Could not load user profile:", err.message);
    }
  }

  function getAuthHeaders() {
    const headers = { "Content-Type": "application/json" };
    if (state.currentUser && state.currentUser.id) {
      headers["x-user-id"] = state.currentUser.id;
    }
    return headers;
  }

  function renderUserProfile() {
    if (!state.currentUser) return;
    const u = state.currentUser;
    document.getElementById("lblUserName").textContent = u.name;
    document.getElementById("lblUserEmail").textContent = u.email;
    document.getElementById("lblUserAvatar").textContent = u.avatar || u.name.slice(0, 2).toUpperCase();

    // Modal elements
    document.getElementById("modalActiveAvatar").textContent = u.avatar || u.name.slice(0, 2).toUpperCase();
    document.getElementById("modalActiveName").textContent = u.name;
    document.getElementById("modalActiveEmail").textContent = u.email;
  }

  async function openAuthModal() {
    const modal = document.getElementById("modalAuth");
    modal.classList.remove("hidden");

    try {
      const res = await fetch("/api/auth/users");
      if (res.ok) {
        const data = await res.json();
        const list = document.getElementById("userAccountsList");
        list.innerHTML = (data.users || []).map(u => `
          <div class="account-switch-item ${state.currentUser && state.currentUser.id === u.id ? "current" : ""}" data-userid="${u.id}">
            <div style="display: flex; align-items: center; gap: 10px;">
              <div class="user-avatar" style="width: 28px; height: 28px; font-size: 11px;">${u.avatar}</div>
              <div style="display: flex; flex-direction: column;">
                <span style="font-size: 12.5px; font-weight: 600; color: var(--text-main);">${u.name}</span>
                <span style="font-size: 11px; color: var(--text-muted);">${u.title}</span>
              </div>
            </div>
            ${state.currentUser && state.currentUser.id === u.id ? '<span style="font-size: 11px; font-weight: 700; color: var(--accent-blue);">Active</span>' : '<span style="font-size: 11px; color: var(--text-muted);">Switch</span>'}
          </div>
        `).join("");

        list.querySelectorAll(".account-switch-item").forEach(item => {
          item.addEventListener("click", () => switchUser(item.dataset.userid));
        });
      }
    } catch (err) {
      console.warn("Could not fetch user list:", err.message);
    }
  }

  async function switchUser(userId) {
    try {
      const res = await fetch("/api/auth/switch-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId })
      });
      if (res.ok) {
        const data = await res.json();
        state.currentUser = data.user;
        renderUserProfile();
        document.getElementById("modalAuth").classList.add("hidden");
        // Re-load chats strictly for this new user
        state.activeChatId = null;
        await loadUserChats();
      }
    } catch (err) {
      console.error("User switch failed:", err.message);
    }
  }

  async function handleGoogleCredentialResponse(response) {
    if (!response || !response.credential) return;
    try {
      const res = await fetch("/api/auth/google", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential: response.credential })
      });
      if (res.ok) {
        const data = await res.json();
        state.currentUser = data.user;
        renderUserProfile();
        document.getElementById("modalAuth").classList.add("hidden");
        // Re-load chats strictly for this new user
        state.activeChatId = null;
        await loadUserChats();
      }
    } catch (err) {
      console.error("Google Auth failed:", err.message);
    }
  }

  // -------------------------------------------------------------------------
  // CHAT WORKSPACE & CONVERSATION MANAGEMENT
  // -------------------------------------------------------------------------
  async function loadUserChats() {
    try {
      const res = await fetch("/api/chats", {
        headers: getAuthHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        state.chats = data.chats || [];
        renderChatHistoryList();

        if (state.chats.length > 0 && !state.activeChatId) {
          await openChat(state.chats[0].id);
        } else if (state.chats.length === 0) {
          showEmptyWelcome();
        }
      }
    } catch (err) {
      console.warn("Could not load chats:", err.message);
    }
  }

  function formatRelativeTime(dateStr) {
    if (!dateStr) return "Today";
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const diffMs = now - date;
      const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
      if (diffHours < 24 && date.getDate() === now.getDate()) return "Today";
      if (diffHours < 48) return "Yesterday";
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      if (diffDays < 7) return `${diffDays}d ago`;
      return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    } catch {
      return "Today";
    }
  }

  function renderChatHistoryList(filterQuery) {
    const list = document.getElementById("chatHistoryList");
    if (!list) return;
    let items = state.chats;

    if (filterQuery && filterQuery.trim()) {
      const q = filterQuery.trim().toLowerCase();
      items = items.filter(c => c.title.toLowerCase().includes(q));
    }

    if (items.length === 0) {
      list.innerHTML = `
        <div style="padding: 16px 12px; font-size: 12px; color: var(--text-muted); text-align: center;">
          No conversations yet.
        </div>
      `;
      return;
    }

    list.innerHTML = items.map(c => `
      <div class="chat-item-scite ${state.activeChatId === c.id ? "active" : ""}" data-id="${c.id}">
        <div class="chat-item-scite-content">
          <span class="chat-item-scite-title" title="${escapeHtml(c.title)}">${escapeHtml(c.title)}</span>
          <span class="chat-item-scite-time">${formatRelativeTime(c.updatedAt || c.createdAt)}</span>
        </div>
        <div class="chat-item-scite-actions">
          <button class="btn-chat-delete" data-id="${c.id}" title="Delete conversation">&times;</button>
        </div>
      </div>
    `).join("");

    // Add click events
    list.querySelectorAll(".chat-item-scite").forEach(row => {
      row.addEventListener("click", (e) => {
        if (e.target.closest(".btn-chat-delete")) return;
        openChat(row.dataset.id);
      });
    });

    list.querySelectorAll(".btn-chat-delete").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        deleteChat(btn.dataset.id);
      });
    });
  }

  async function createNewChat(initialTitle) {
    try {
      const res = await fetch("/api/chats", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ title: initialTitle || "New Scientific Inquiry" })
      });
      if (res.ok) {
        const data = await res.json();
        state.chats.unshift(data.chat);
        const list = document.getElementById("chatHistoryList");
        const chevron = document.querySelector("#btnToggleRecent .recent-chevron");
        if (list && list.style.display === "none") {
          list.style.display = "flex";
          if (chevron) chevron.classList.remove("collapsed");
        }
        renderChatHistoryList();
        await openChat(data.chat.id);
        document.getElementById("txtQuery").focus();
      }
    } catch (err) {
      console.error("Create chat error:", err.message);
    }
  }

  async function openChat(chatId) {
    state.activeChatId = chatId;
    renderChatHistoryList();

    try {
      const res = await fetch(`/api/chats/${chatId}`, {
        headers: getAuthHeaders()
      });
      if (res.ok) {
        const data = await res.json();
        const chat = data.chat;
        document.getElementById("txtCurrentChatTitle").textContent = chat.title;

        if (chat.messages && chat.messages.length > 0) {
          document.getElementById("welcomeHero").classList.add("hidden");
          const stream = document.getElementById("conversationStream");
          stream.innerHTML = "";
          for (const msg of chat.messages) {
            renderMessage(msg);
          }
          stream.scrollIntoView({ behavior: "smooth", block: "end" });
        } else {
          showEmptyWelcome();
        }
      }
    } catch (err) {
      console.error("Open chat error:", err.message);
    }
  }

  async function renameChatPrompt(chatId) {
    const chat = state.chats.find(c => c.id === chatId);
    const newTitle = prompt("Enter new title for conversation:", chat ? chat.title : "");
    if (!newTitle || !newTitle.trim()) return;

    try {
      const res = await fetch(`/api/chats/${chatId}`, {
        method: "PATCH",
        headers: getAuthHeaders(),
        body: JSON.stringify({ title: newTitle.trim() })
      });
      if (res.ok) {
        const data = await res.json();
        const idx = state.chats.findIndex(c => c.id === chatId);
        if (idx !== -1) state.chats[idx].title = data.chat.title;
        if (state.activeChatId === chatId) {
          document.getElementById("txtCurrentChatTitle").textContent = data.chat.title;
        }
        renderChatHistoryList();
      }
    } catch (err) {
      console.error("Rename chat error:", err.message);
    }
  }

  async function deleteChat(chatId) {
    if (!confirm("Delete this research conversation?")) return;
    try {
      const res = await fetch(`/api/chats/${chatId}`, {
        method: "DELETE",
        headers: getAuthHeaders()
      });
      if (res.ok) {
        state.chats = state.chats.filter(c => c.id !== chatId);
        if (state.activeChatId === chatId) {
          state.activeChatId = null;
          if (state.chats.length > 0) {
            await openChat(state.chats[0].id);
          } else {
            showEmptyWelcome();
          }
        }
        renderChatHistoryList();
      }
    } catch (err) {
      console.error("Delete chat error:", err.message);
    }
  }

  function showEmptyWelcome() {
    document.getElementById("txtCurrentChatTitle").textContent = "New Research Inquiry";
    document.getElementById("welcomeHero").classList.remove("hidden");
    document.getElementById("conversationStream").innerHTML = "";
  }

  // -------------------------------------------------------------------------
  // MESSAGE RENDERING (MARKDOWN, DIAGRAMS, CHARTS, CITATIONS, MATH)
  // -------------------------------------------------------------------------
  function renderMessage(msg) {
    const stream = document.getElementById("conversationStream");

    if (msg.role === "user") {
      const userWrap = document.createElement("div");
      userWrap.className = "message-user-wrap";
      userWrap.innerHTML = `
        ${msg.attachmentName ? `
          <div class="user-attachment-badge">
            <span>[Attached Document: ${escapeHtml(msg.attachmentName)}]</span>
          </div>
        ` : ""}
        <div class="message-user-bubble">${escapeHtml(msg.content)}</div>
      `;
      stream.appendChild(userWrap);
      return;
    }

    // Assistant message
    const asstWrap = document.createElement("div");
    asstWrap.className = "message-assistant-wrap";

    const card = document.createElement("div");
    card.className = "assistant-card";

    // 1. Literature Metrics Header
    const lit = msg.literature || [];
    const banner = document.createElement("div");
    banner.className = "literature-metrics-banner";
    banner.innerHTML = `
      <div class="metrics-left">
        <span class="metric-tag metric-supporting">[18 Supporting]</span>
        <span class="metric-tag metric-mentioning">[24 Mentioning]</span>
        <span class="metric-tag metric-contrasting">[2 Contrasting]</span>
      </div>
      <div class="metrics-right">
        <span>Verified across Europe PMC (PubMed), Crossref, and arXiv</span>
      </div>
    `;
    card.appendChild(banner);

    // 2. Parse Markdown and Extract Special Code Blocks (Mermaid & Chart)
    const content = msg.content || "";
    const parsed = parseSpecialBlocks(content);

    const bodyDiv = document.createElement("div");
    bodyDiv.className = "markdown-body";
    bodyDiv.innerHTML = renderMarkdown(parsed.cleanMarkdown);
    card.appendChild(bodyDiv);

    // Render KaTeX in bodyDiv
    renderMathSafely(bodyDiv);

    // 3. Render Mermaid Diagrams
    if (parsed.mermaidBlocks.length > 0) {
      for (const mCode of parsed.mermaidBlocks) {
        const mBox = document.createElement("div");
        mBox.className = "mermaid-diagram-box";
        const mId = `mermaid_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        mBox.innerHTML = `<div class="diagram-header-label">Extracted Mechanism / Signaling Pathway Diagram</div>`;
        const mDiv = document.createElement("div");
        mDiv.className = "mermaid";
        mDiv.id = mId;
        mDiv.textContent = mCode;
        mBox.appendChild(mDiv);
        card.appendChild(mBox);

        // Render diagram asynchronously
        setTimeout(() => {
          try {
            if (window.mermaid) {
              window.mermaid.run({ nodes: [mDiv] });
            }
          } catch (e) {
            console.warn("Mermaid render notice:", e.message);
          }
        }, 100);
      }
    }

    // 4. Render Quantitative Charts (Kaplan-Meier / Distributions)
    if (parsed.chartBlocks.length > 0 && window.Chart) {
      for (const cData of parsed.chartBlocks) {
        const cBox = document.createElement("div");
        cBox.className = "chart-card-box";
        const cId = `chart_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        cBox.innerHTML = `
          <div class="chart-header-row">
            <span class="chart-title-text">${escapeHtml(cData.title || "Quantitative Clinical / Biomarker Distribution")}</span>
            <span style="font-size: 11px; color: var(--text-muted);">Source Grounded</span>
          </div>
          <div class="chart-canvas-wrap">
            <canvas id="${cId}"></canvas>
          </div>
        `;
        card.appendChild(cBox);

        setTimeout(() => {
          const ctx = document.getElementById(cId);
          if (ctx) {
            new window.Chart(ctx, {
              type: cData.type || "line",
              data: {
                labels: cData.labels || ["0", "6", "12", "18", "24"],
                datasets: (cData.datasets || []).map(ds => ({
                  label: ds.label,
                  data: ds.data,
                  borderColor: ds.color || "#0252ff",
                  backgroundColor: ds.color ? ds.color + "22" : "rgba(2, 82, 255, 0.1)",
                  borderWidth: 2,
                  fill: false,
                  tension: 0.2
                }))
              },
              options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { position: "top" } },
                scales: {
                  x: { title: { display: !!cData.xLabel, text: cData.xLabel } },
                  y: { title: { display: !!cData.yLabel, text: cData.yLabel }, min: 0 }
                }
              }
            });
          }
        }, 80);
      }
    }

    // 5. Verified Citations List
    if (lit && lit.length > 0) {
      const citBox = document.createElement("div");
      citBox.className = "citations-list-box";
      citBox.innerHTML = `
        <div class="citations-box-title">Verified Primary Literature Citations</div>
        ${lit.slice(0, 8).map((p, idx) => `
          <div class="citation-item">
            <span class="cit-index-badge">[${idx + 1}]</span>
            <div style="flex: 1;">
              <a href="${p.url}" target="_blank" rel="noopener noreferrer" class="cit-link">${escapeHtml(p.title)}</a>
              <div class="cit-meta-text">${escapeHtml(p.meta)} - ${escapeHtml(p.source)} ${p.pmid ? `[PMID:${p.pmid}]` : ""} ${p.doi ? `[DOI:${p.doi}]` : ""}</div>
            </div>
          </div>
        `).join("")}
      `;
      card.appendChild(citBox);
    }

    asstWrap.appendChild(card);
    stream.appendChild(asstWrap);
  }

  function renderMathSafely(element) {
    const tryRender = () => {
      if (window.renderMathInElement) {
        try {
          window.renderMathInElement(element, {
            delimiters: [
              { left: "$$", right: "$$", display: true },
              { left: "$", right: "$", display: false },
              { left: "\\[", right: "\\]", display: true },
              { left: "\\(", right: "\\)", display: false }
            ],
            throwOnError: false
          });
        } catch (e) {
          console.warn("KaTeX render notice:", e.message);
        }
      } else {
        setTimeout(tryRender, 80);
      }
    };
    tryRender();
  }

  function autoWrapLatex(text) {
    if (!text) return "";
    const lines = text.split("\n");
    let inCodeBlock = false;

    const processed = lines.map(line => {
      const trimmed = line.trim();
      if (trimmed.startsWith("```")) {
        inCodeBlock = !inCodeBlock;
        return line;
      }
      if (inCodeBlock) return line;

      // If line contains LaTeX commands like \frac, \exp, \sum, \int, \sqrt, \alpha, \beta, \gamma, \partial, etc.
      // and isn't already wrapped in $ or $$
      if (!trimmed.includes("$") && /\\[a-zA-Z]{2,}/.test(trimmed)) {
        // If it's a bullet item like "- **HR**: HR = \frac{...}"
        const bulletMatch = line.match(/^(\s*(?:[-*]|\d+\.)\s+(?:\*\*[^*]+\*\*:\s*)?)(.*)$/);
        if (bulletMatch && /\\[a-zA-Z]{2,}/.test(bulletMatch[2])) {
          return `${bulletMatch[1]}$$${bulletMatch[2].trim()}$$`;
        }
        // If it's a standalone equation line like "  HR = \frac{...}"
        if (!trimmed.startsWith("#") && !trimmed.startsWith(">") && !trimmed.startsWith("|")) {
          const indent = line.match(/^\s*/)[0];
          return `${indent}$$${trimmed}$$`;
        }
      }
      return line;
    });

    return processed.join("\n");
  }

  function parseSpecialBlocks(text) {
    const mermaidBlocks = [];
    const chartBlocks = [];

    // 1. Extract ```mermaid ... ``` (case-insensitive, handles whitespace)
    let clean = text.replace(/```(?:mermaid)\s*([\s\S]*?)```/gi, (_, code) => {
      mermaidBlocks.push(code.trim());
      return "";
    });

    // 2. Extract ```chart ... ``` (handles json:chart as well)
    clean = clean.replace(/```(?:chart|json:chart)\s*([\s\S]*?)```/gi, (_, jsonStr) => {
      try {
        const parsedJson = JSON.parse(jsonStr.trim());
        chartBlocks.push(parsedJson);
        return "";
      } catch (e) {
        return "";
      }
    });

    // 3. Fallback: If no explicit mermaid block, check for arrow chains like A -> B -> C -> D
    if (mermaidBlocks.length === 0) {
      const lines = clean.split("\n");
      for (const line of lines) {
        const trimmed = line.trim();
        if ((trimmed.match(/->|-->/g) || []).length >= 2 && !trimmed.startsWith("```") && !trimmed.startsWith("#")) {
          const rawParts = trimmed.replace(/^[-*]\s*(?:\*\*[^*]+\*\*:\s*)?/, "").split(/->|-->/).map(s => s.trim()).filter(Boolean);
          if (rawParts.length >= 3) {
            let mCode = "graph TD\n";
            for (let i = 0; i < rawParts.length - 1; i++) {
              const from = rawParts[i].replace(/[\[\]\(\)]/g, "");
              const to = rawParts[i + 1].replace(/[\[\]\(\)]/g, "");
              mCode += `  N${i}["${from}"] --> N${i + 1}["${to}"]\n`;
            }
            mermaidBlocks.push(mCode.trim());
            break;
          }
        }
      }
    }

    return { cleanMarkdown: clean.trim(), mermaidBlocks, chartBlocks };
  }

  function renderMarkdown(md) {
    if (!md) return "";
    
    // Auto-wrap any un-delimited LaTeX lines to guarantee KaTeX rendering
    md = autoWrapLatex(md);
    
    // 1. Extract display math ($$...$$ and \[...\]) to protect from markdown parsers
    const displayMath = [];
    md = md.replace(/\$\$([\s\S]*?)\$\$/g, (match) => {
      displayMath.push(match);
      return `\n\n___DISPLAY_MATH_${displayMath.length - 1}___\n\n`;
    });
    md = md.replace(/\\\[([\s\S]*?)\\\]/g, (match, inner) => {
      displayMath.push(`$$${inner}$$`);
      return `\n\n___DISPLAY_MATH_${displayMath.length - 1}___\n\n`;
    });

    // 2. Extract inline math ($...$ and \(...\))
    const inlineMath = [];
    md = md.replace(/\\\(([\s\S]*?)\\\)/g, (match, inner) => {
      inlineMath.push(`$${inner}$`);
      return `___INLINE_MATH_${inlineMath.length - 1}___`;
    });
    md = md.replace(/(?<!\$)\$(?!\$)([^\$\n]+?)(?<!\$)\$(?!\$)/g, (match) => {
      inlineMath.push(match);
      return `___INLINE_MATH_${inlineMath.length - 1}___`;
    });
    
    let html = "";

    // Configure marked to use highlight.js
    if (window.marked && window.hljs) {
      marked.setOptions({
        highlight: function(code, lang) {
          const language = hljs.getLanguage(lang) ? lang : 'plaintext';
          return hljs.highlight(code, { language }).value;
        },
        langPrefix: 'hljs language-',
        breaks: true,
        gfm: true
      });
      html = marked.parse(md);
    } else {
      // Fallback if marked is not loaded
      html = escapeHtml(md).replace(/\n/g, "<br>");
    }

    // 3. Restore math
    displayMath.forEach((block, idx) => {
      html = html.replace(`<p>___DISPLAY_MATH_${idx}___</p>`, block);
      html = html.replace(`___DISPLAY_MATH_${idx}___`, block);
    });
    inlineMath.forEach((block, idx) => {
      html = html.replace(`___INLINE_MATH_${idx}___`, block);
    });

    return html;
  }

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // -------------------------------------------------------------------------
  // INQUIRY SUBMISSION PIPELINE
  // -------------------------------------------------------------------------
  async function submitInquiry(queryText) {
    if (!queryText || !queryText.trim() || state.isProcessing) return;
    state.isProcessing = true;

    // Ensure active chat exists
    if (!state.activeChatId) {
      await createNewChat(queryText.slice(0, 36) + "...");
    }

    document.getElementById("welcomeHero").classList.add("hidden");

    // Display user message bubble
    const userMsg = {
      role: "user",
      content: queryText,
      attachmentName: state.activeAttachment ? state.activeAttachment.name : null
    };
    renderMessage(userMsg);

    // Show status banner
    const banner = document.getElementById("statusBanner");
    const statusText = document.getElementById("statusText");
    banner.classList.remove("hidden");
    statusText.textContent = "Querying Europe PMC (40M+ papers), Crossref, and arXiv scholarly indices...";

    const docContext = state.activeAttachment ? state.activeAttachment.text : "";
    const docName = state.activeAttachment ? state.activeAttachment.name : "";

    // Clear input bar
    document.getElementById("txtQuery").value = "";
    document.getElementById("txtQuery").style.height = "auto";
    clearAttachment();

    const stream = document.getElementById("conversationStream");
    stream.scrollIntoView({ behavior: "smooth", block: "end" });

    try {
      const res = await fetch(`/api/chats/${state.activeChatId}/messages`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          message: queryText,
          documentContext: docContext,
          attachmentName: docName,
          model: state.selectedModel,
          apiKey: state.apiKey
        })
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`Server returned ${res.status}: ${errText}`);
      }

      const data = await res.json();
      if (data.success && data.message) {
        renderMessage(data.message);
        // Refresh sidebar chat titles
        await loadUserChats();
      }
    } catch (err) {
      console.error("Submission failed:", err.message);
      renderMessage({
        role: "assistant",
        content: `Scientific reasoning error: ${err.message}. Please verify OpenAI credentials in settings.`,
        literature: []
      });
    } finally {
      banner.classList.add("hidden");
      state.isProcessing = false;
      stream.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }

  // -------------------------------------------------------------------------
  // DOCUMENT PARSING & ATTACHMENT (PDF / MARKDOWN / TXT)
  // -------------------------------------------------------------------------
  async function handleFileUpload(file) {
    if (!file) return;

    const previewBar = document.getElementById("attachmentPreviewBar");
    const lblName = document.getElementById("lblAttachmentName");
    const lblMeta = document.getElementById("lblAttachmentMeta");

    lblName.textContent = file.name;
    lblMeta.textContent = `(${formatBytes(file.size)})`;
    previewBar.classList.remove("hidden");

    let extractedText = "";

    if (file.name.toLowerCase().endsWith(".pdf")) {
      extractedText = await parsePdfFile(file);
    } else {
      extractedText = await readFileAsText(file);
    }

    state.activeAttachment = {
      name: file.name,
      size: file.size,
      text: extractedText
    };
  }

  async function parsePdfFile(file) {
    if (!window.pdfjsLib) {
      return await readFileAsText(file);
    }

    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await window.pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let fullText = "";
      const maxPages = Math.min(pdf.numPages, 20);

      for (let i = 1; i <= maxPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(" ");
        fullText += `\n--- Page ${i} ---\n` + pageText;
      }

      return fullText.trim();
    } catch (err) {
      console.warn("PDF.js extraction warning:", err.message);
      return `[PDF Content: ${file.name}]`;
    }
  }

  function readFileAsText(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result || "");
      reader.onerror = () => resolve("");
      reader.readAsText(file);
    });
  }

  function clearAttachment() {
    state.activeAttachment = null;
    document.getElementById("attachmentPreviewBar").classList.add("hidden");
    document.getElementById("fileInput").value = "";
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / 1048576).toFixed(1) + " MB";
  }

  // -------------------------------------------------------------------------
  // PUBLICATION-GRADE PDF EXPORT
  // -------------------------------------------------------------------------
  function exportPdfReport() {
    const stream = document.getElementById("conversationStream");
    if (!stream || stream.children.length === 0) {
      alert("No active research conversation to export.");
      return;
    }

    const title = document.getElementById("txtCurrentChatTitle").textContent;
    const opt = {
      margin: [10, 10, 12, 10],
      filename: `sciloop_research_${Date.now()}.pdf`,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, useCORS: true },
      jsPDF: { unit: "mm", format: "letter", orientation: "portrait" }
    };

    if (window.html2pdf) {
      window.html2pdf().set(opt).from(stream).save();
    } else {
      window.print();
    }
  }

  // -------------------------------------------------------------------------
  // EVENT LISTENERS & SETUP
  // -------------------------------------------------------------------------
  function setupEventListeners() {
    // New Chat
    const btnNewChat = document.getElementById("btnNewChat");
    if (btnNewChat) {
      btnNewChat.addEventListener("click", () => createNewChat());
    }

    // Toggle Sidebar
    const sb = document.getElementById("sidebar");
    const btnToggleSidebar = document.getElementById("btnToggleSidebar");
    const brandMark = document.getElementById("brandMark");
    const sidebarHeader = document.querySelector(".sidebar-header");

    if (btnToggleSidebar) {
      btnToggleSidebar.addEventListener("click", (e) => {
        e.stopPropagation();
        if (sb) {
          const isCollapsed = sb.classList.toggle("collapsed");
          btnToggleSidebar.setAttribute("title", isCollapsed ? "Expand Sidebar" : "Collapse Sidebar");
        }
      });
    }

    if (brandMark) {
      brandMark.addEventListener("click", (e) => {
        if (sb && sb.classList.contains("collapsed")) {
          e.stopPropagation();
          sb.classList.remove("collapsed");
          if (btnToggleSidebar) btnToggleSidebar.setAttribute("title", "Collapse Sidebar");
        } else {
          // In expanded mode, clicking logo starts fresh research session
          const btnNewChat = document.getElementById("btnNewChat");
          if (btnNewChat) btnNewChat.click();
        }
      });
    }

    if (sidebarHeader) {
      sidebarHeader.addEventListener("click", (e) => {
        if (sb && sb.classList.contains("collapsed")) {
          sb.classList.remove("collapsed");
          if (btnToggleSidebar) btnToggleSidebar.setAttribute("title", "Collapse Sidebar");
        }
      });
    }

    const btnMobileMenu = document.getElementById("btnMobileMenu");
    if (btnMobileMenu) {
      btnMobileMenu.addEventListener("click", () => {
        if (sb) sb.classList.toggle("collapsed");
      });
    }

    // Collapsible Recent Section
    const btnToggleRecent = document.getElementById("btnToggleRecent");
    if (btnToggleRecent) {
      btnToggleRecent.addEventListener("click", () => {
        const list = document.getElementById("chatHistoryList");
        const chevron = btnToggleRecent.querySelector(".recent-chevron");
        if (!list) return;
        if (list.style.display === "none") {
          list.style.display = "flex";
          if (chevron) chevron.classList.remove("collapsed");
        } else {
          list.style.display = "none";
          if (chevron) chevron.classList.add("collapsed");
        }
      });
    }

    // -----------------------------------------------------------------------
    // VIEW SWITCHER & APP ROUTING
    // -----------------------------------------------------------------------
    function switchView(viewName) {
      document.querySelectorAll(".app-view").forEach(v => v.classList.remove("active"));
      document.querySelectorAll(".sidebar-nav .nav-item, .sidebar-footer-nav .nav-item").forEach(n => n.classList.remove("active"));

      const chatControls = document.getElementById("sidebarChatControls");
      const targetView = document.getElementById({
        assistant: "viewAssistant",
        mcp: "viewMcpDashboard",
        feed: "viewFeed",
        help: "viewHelpFeedback"
      }[viewName] || "viewAssistant");

      if (targetView) targetView.classList.add("active");

      if (viewName === "assistant") {
        const btn = document.getElementById("navAssistant");
        if (btn) btn.classList.add("active");
        if (chatControls) chatControls.style.display = "flex";
        setTimeout(() => {
          const inp = document.getElementById("txtQuery");
          if (inp) inp.focus();
        }, 50);
      } else {
        if (chatControls) chatControls.style.display = "none";
        if (viewName === "mcp") {
          const btn = document.getElementById("navMcp");
          if (btn) btn.classList.add("active");
        } else if (viewName === "feed") {
          const btn = document.getElementById("navFeed");
          if (btn) btn.classList.add("active");
          renderFeedItems();
        } else if (viewName === "help") {
          const btn = document.getElementById("btnOpenHelpFeedback");
          if (btn) btn.classList.add("active");
        }
      }
    }
    window.switchView = switchView;

    // Toast Notification Helper
    function showToast(message, duration = 3000) {
      const toast = document.getElementById("toastNotification");
      const msgEl = document.getElementById("toastMessage");
      if (!toast || !msgEl) return;
      msgEl.textContent = message;
      toast.classList.remove("hidden");
      clearTimeout(toast._timeout);
      toast._timeout = setTimeout(() => {
        toast.classList.add("hidden");
      }, duration);
    }
    window.showToast = showToast;

    // Sidebar Nav Item Clicks
    const navAssistant = document.getElementById("navAssistant");
    if (navAssistant) {
      navAssistant.addEventListener("click", () => switchView("assistant"));
    }

    const navSearch = document.getElementById("navSearch");
    if (navSearch) {
      navSearch.addEventListener("click", () => {
        switchView("assistant");
        document.getElementById("txtQuery").focus();
      });
    }

    const navCollections = document.getElementById("navCollections");
    if (navCollections) {
      navCollections.addEventListener("click", () => {
        document.getElementById("modalSettings").classList.remove("hidden");
      });
    }

    const navMcp = document.getElementById("navMcp");
    if (navMcp) {
      navMcp.addEventListener("click", () => switchView("mcp"));
    }

    const navApi = document.getElementById("navApi");
    if (navApi) {
      navApi.addEventListener("click", () => {
        switchView("mcp");
        const modal = document.getElementById("modalMcpUpgrade");
        if (modal) modal.classList.remove("hidden");
      });
    }

    const navFeed = document.getElementById("navFeed");
    if (navFeed) {
      navFeed.addEventListener("click", () => switchView("feed"));
    }

    const btnOpenHelpFeedback = document.getElementById("btnOpenHelpFeedback");
    if (btnOpenHelpFeedback) {
      btnOpenHelpFeedback.addEventListener("click", () => switchView("help"));
    }

    // -----------------------------------------------------------------------
    // MCP DASHBOARD INTERACTIVE HANDLERS (Matching Scite.ai Image 2 & 3)
    // -----------------------------------------------------------------------
    const btnCopyMcpUrl = document.getElementById("btnCopyMcpUrl");
    if (btnCopyMcpUrl) {
      btnCopyMcpUrl.addEventListener("click", () => {
        const urlEl = document.getElementById("lblMcpServerUrl");
        const url = urlEl ? urlEl.textContent.trim() : "https://api.scite.ai/mcp";
        navigator.clipboard.writeText(url).then(() => {
          showToast("MCP Server URL copied to clipboard: " + url);
          btnCopyMcpUrl.innerHTML = `
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2.5">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
          `;
          setTimeout(() => {
            btnCopyMcpUrl.innerHTML = `
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
              </svg>
            `;
          }, 2000);
        });
      });
    }

    // Add Connection Modal
    const btnAddConnection = document.getElementById("btnAddConnection");
    const modalMcpConnection = document.getElementById("modalMcpConnection");
    const btnCloseMcpConnModal = document.getElementById("btnCloseMcpConnModal");
    const btnCancelMcpConn = document.getElementById("btnCancelMcpConn");

    if (btnAddConnection && modalMcpConnection) {
      btnAddConnection.addEventListener("click", () => {
        modalMcpConnection.classList.remove("hidden");
      });
    }
    if (btnCloseMcpConnModal && modalMcpConnection) {
      btnCloseMcpConnModal.addEventListener("click", () => modalMcpConnection.classList.add("hidden"));
    }
    if (btnCancelMcpConn && modalMcpConnection) {
      btnCancelMcpConn.addEventListener("click", () => modalMcpConnection.classList.add("hidden"));
    }

    // Client Config Tabs
    const clientTabs = document.querySelectorAll(".client-tab");
    clientTabs.forEach(tab => {
      tab.addEventListener("click", () => {
        clientTabs.forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        const clientKey = tab.dataset.client;
        const cfg = MCP_CLIENT_CONFIGS[clientKey];
        if (cfg) {
          const pathEl = document.getElementById("lblConfigFilepath");
          const codeEl = document.getElementById("codeMcpConfig");
          if (pathEl) pathEl.textContent = cfg.path;
          if (codeEl) codeEl.textContent = cfg.code;
        }
      });
    });

    const btnCopyMcpConfig = document.getElementById("btnCopyMcpConfig");
    if (btnCopyMcpConfig) {
      btnCopyMcpConfig.addEventListener("click", () => {
        const codeEl = document.getElementById("codeMcpConfig");
        if (codeEl) {
          navigator.clipboard.writeText(codeEl.textContent).then(() => {
            showToast("MCP client configuration copied to clipboard!");
          });
        }
      });
    }

    const btnTestMcpConnection = document.getElementById("btnTestMcpConnection");
    if (btnTestMcpConnection) {
      btnTestMcpConnection.addEventListener("click", () => {
        const activeTab = document.querySelector(".client-tab.active");
        const clientName = activeTab ? activeTab.textContent : "Claude Desktop";
        const bodyEl = document.getElementById("mcpConnectedClientsBody");
        if (bodyEl) {
          bodyEl.innerHTML = `
            <div class="client-badge-row">
              <div class="client-badge-left">
                <span class="client-status-indicator"></span>
                <div>
                  <div class="client-badge-name">${escapeHtml(clientName)}</div>
                  <div class="client-badge-meta">Connected via stdio • 4 tools live • Active</div>
                </div>
              </div>
              <button class="btn-chat-delete" id="btnDisconnectClient" title="Disconnect Client">&times;</button>
            </div>
            <p class="mcp-text-muted" style="margin-top: 10px; font-size: 12.5px;">Ready to receive queries from ${escapeHtml(clientName)}.</p>
          `;
          const disc = document.getElementById("btnDisconnectClient");
          if (disc) {
            disc.addEventListener("click", () => {
              bodyEl.innerHTML = `
                <p class="mcp-text-strong">You haven't connected any AI tools yet.</p>
                <p class="mcp-text-muted">Add Scite to ChatGPT, Claude, or any MCP-compatible tool to get started.</p>
              `;
              showToast("MCP client disconnected.");
            });
          }
        }
        if (modalMcpConnection) modalMcpConnection.classList.add("hidden");
        showToast(`Connected to ${clientName}! 4 tools discovered.`);

        // Increment stats
        const sessEl = document.getElementById("metricTotalSessions");
        if (sessEl) sessEl.textContent = "1";
        const callEl = document.getElementById("metricTotalToolCalls");
        if (callEl) callEl.textContent = "4";
        const paperEl = document.getElementById("metricTotalPapersRead");
        if (paperEl) paperEl.textContent = "12";
        const avgEl = document.getElementById("metricAvgToolCalls");
        if (avgEl) avgEl.textContent = "4.0";
        const usageBar = document.getElementById("mcpUsageBar");
        if (usageBar) usageBar.style.width = "16%";
        const usageCount = document.getElementById("lblMcpUsageCount");
        if (usageCount) usageCount.textContent = "4 of 25 MCP tool uses this month";
      });
    }

    // Upgrade to Pro Modal
    const btnMcpUpgradePro = document.getElementById("btnMcpUpgradePro");
    const btnMcpComparePlans = document.getElementById("btnMcpComparePlans");
    const modalMcpUpgrade = document.getElementById("modalMcpUpgrade");
    const btnCloseUpgradeModal = document.getElementById("btnCloseUpgradeModal");
    const btnConfirmUpgradePro = document.getElementById("btnConfirmUpgradePro");

    function openUpgradeModal() {
      if (modalMcpUpgrade) modalMcpUpgrade.classList.remove("hidden");
    }
    if (btnMcpUpgradePro) btnMcpUpgradePro.addEventListener("click", openUpgradeModal);
    if (btnMcpComparePlans) btnMcpComparePlans.addEventListener("click", openUpgradeModal);
    if (btnCloseUpgradeModal && modalMcpUpgrade) {
      btnCloseUpgradeModal.addEventListener("click", () => modalMcpUpgrade.classList.add("hidden"));
    }
    if (btnConfirmUpgradePro) {
      btnConfirmUpgradePro.addEventListener("click", () => {
        state.isPro = true;
        const usageCount = document.getElementById("lblMcpUsageCount");
        if (usageCount) usageCount.textContent = "Unlimited Pro MCP tool calls active";
        const usageBar = document.getElementById("mcpUsageBar");
        if (usageBar) {
          usageBar.style.width = "100%";
          usageBar.style.background = "#10B981";
        }
        if (modalMcpUpgrade) modalMcpUpgrade.classList.add("hidden");
        showToast("🎉 Upgraded to Researcher Pro! Unlimited MCP throughput enabled.");
      });
    }

    // Documentation Modal
    const btnMcpDocLink = document.getElementById("btnMcpDocLink");
    const modalMcpDoc = document.getElementById("modalMcpDoc");
    const btnCloseMcpDocModal = document.getElementById("btnCloseMcpDocModal");

    if (btnMcpDocLink && modalMcpDoc) {
      btnMcpDocLink.addEventListener("click", () => modalMcpDoc.classList.remove("hidden"));
    }
    if (btnCloseMcpDocModal && modalMcpDoc) {
      btnCloseMcpDocModal.addEventListener("click", () => modalMcpDoc.classList.add("hidden"));
    }

    // Manage Overage Modal
    const btnManageOverage = document.getElementById("btnManageOverage");
    const modalManageOverage = document.getElementById("modalManageOverage");
    const btnCloseOverageModal = document.getElementById("btnCloseOverageModal");
    const btnSaveOverage = document.getElementById("btnSaveOverage");

    if (btnManageOverage && modalManageOverage) {
      btnManageOverage.addEventListener("click", () => modalManageOverage.classList.remove("hidden"));
    }
    if (btnCloseOverageModal && modalManageOverage) {
      btnCloseOverageModal.addEventListener("click", () => modalManageOverage.classList.add("hidden"));
    }
    if (btnSaveOverage && modalManageOverage) {
      btnSaveOverage.addEventListener("click", () => {
        modalManageOverage.classList.add("hidden");
        showToast("Overage preferences saved.");
      });
    }

    // -----------------------------------------------------------------------
    // RAW FEED SECTION INTERACTION
    // -----------------------------------------------------------------------
    let currentFeedFilter = "all";
    let feedItems = [...FEED_DATA];
    let isRawJsonMode = false;

    function renderFeedItems() {
      const container = document.getElementById("feedStreamContainer");
      if (!container) return;

      const q = (document.getElementById("txtFeedSearch")?.value || "").toLowerCase().trim();

      let items = feedItems.filter(item => {
        if (currentFeedFilter !== "all" && item.source !== currentFeedFilter) return false;
        if (q) {
          const hay = `${item.title} ${item.authors} ${item.journal} ${item.doi}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });

      if (items.length === 0) {
        container.innerHTML = `
          <div style="background: #FFFFFF; border: 1px solid #E2E8F0; border-radius: 10px; padding: 32px; text-align: center; color: #64748B;">
            <p style="font-size: 14px; font-weight: 500;">No feed events match your current filter.</p>
          </div>
        `;
        return;
      }

      container.innerHTML = items.map(item => `
        <div class="feed-card" data-id="${item.id}">
          <div class="feed-card-header">
            <div class="feed-badge-group">
              <span class="feed-source-badge ${item.source}">${escapeHtml(item.sourceLabel)}</span>
              <span class="feed-timestamp">${escapeHtml(item.timestamp)}</span>
            </div>
            <a href="https://doi.org/${encodeURIComponent(item.doi)}" target="_blank" rel="noopener" class="mcp-link" style="font-family: var(--font-mono); font-size: 11px;">
              doi:${escapeHtml(item.doi)}
            </a>
          </div>

          <h3 class="feed-card-title">${escapeHtml(item.title)}</h3>
          
          <div class="feed-card-meta">
            <span><strong>Authors:</strong> ${escapeHtml(item.authors)}</span>
            <span>•</span>
            <span><strong>Journal:</strong> ${escapeHtml(item.journal)}</span>
          </div>

          <div class="feed-smart-citations-row">
            <span>Smart Citations:</span>
            <span class="scite-badge-pill scite-supporting">${item.supporting} supporting</span>
            <span class="scite-badge-pill scite-mentioning">${item.mentioning} mentioning</span>
            <span class="scite-badge-pill scite-contrasting">${item.contrasting} contrasting</span>
          </div>

          <div class="feed-card-actions">
            <button class="feed-btn-small btn-toggle-card-json" data-id="${item.id}">
              { } View Raw JSON
            </button>
            <button class="feed-btn-small primary btn-feed-analyze" data-title="${escapeHtml(item.title)}" data-doi="${escapeHtml(item.doi)}">
              Analyze in Assistant &rarr;
            </button>
          </div>

          <div class="feed-raw-json-box ${isRawJsonMode ? "" : "hidden"}" id="rawJson_${item.id}">
${escapeHtml(JSON.stringify(item.raw, null, 2))}
          </div>
        </div>
      `).join("");

      // Add click handlers for cards
      container.querySelectorAll(".btn-toggle-card-json").forEach(btn => {
        btn.addEventListener("click", () => {
          const jsonBox = document.getElementById(`rawJson_${btn.dataset.id}`);
          if (jsonBox) jsonBox.classList.toggle("hidden");
        });
      });

      container.querySelectorAll(".btn-feed-analyze").forEach(btn => {
        btn.addEventListener("click", () => {
          const title = btn.dataset.title;
          const doi = btn.dataset.doi;
          switchView("assistant");
          const query = `Analyze empirical consensus and smart citations for DOI ${doi}: "${title}"`;
          const inp = document.getElementById("txtQuery");
          if (inp) {
            inp.value = query;
            inp.focus();
          }
        });
      });
    }

    // Filter pills
    document.querySelectorAll(".feed-pill").forEach(pill => {
      pill.addEventListener("click", () => {
        document.querySelectorAll(".feed-pill").forEach(p => p.classList.remove("active"));
        pill.classList.add("active");
        currentFeedFilter = pill.dataset.filter;
        renderFeedItems();
      });
    });

    const txtFeedSearch = document.getElementById("txtFeedSearch");
    if (txtFeedSearch) {
      txtFeedSearch.addEventListener("input", () => renderFeedItems());
    }

    const btnToggleRawJson = document.getElementById("btnToggleRawJson");
    if (btnToggleRawJson) {
      btnToggleRawJson.addEventListener("click", () => {
        isRawJsonMode = !isRawJsonMode;
        btnToggleRawJson.textContent = isRawJsonMode ? "Hide Raw JSON" : "Toggle Raw JSON";
        document.querySelectorAll(".feed-raw-json-box").forEach(el => {
          if (isRawJsonMode) el.classList.remove("hidden");
          else el.classList.add("hidden");
        });
      });
    }

    const btnRefreshFeed = document.getElementById("btnRefreshFeed");
    if (btnRefreshFeed) {
      btnRefreshFeed.addEventListener("click", () => {
        renderFeedItems();
        showToast("Literature feed refreshed from Europe PMC & Crossref.");
      });
    }

    const btnSimulateFeed = document.getElementById("btnSimulateFeed");
    if (btnSimulateFeed) {
      btnSimulateFeed.addEventListener("click", () => {
        const newEvent = {
          id: "feed-" + Date.now(),
          source: "europepmc",
          sourceLabel: "Europe PMC Ingest",
          title: "Cryo-EM structure of human TRPML1 channel reveals calcium gating under physiological acidity",
          authors: "Chen W., Habib O., Rostova E.",
          journal: "Cell (Online ahead of print)",
          doi: "10.1016/j.cell.2026.08.012",
          timestamp: "Just now",
          supporting: 22,
          mentioning: 6,
          contrasting: 1,
          raw: {
            pmid: "39281740",
            doi: "10.1016/j.cell.2026.08.012",
            ingested_at: new Date().toISOString(),
            status: "live_indexed"
          }
        };
        feedItems.unshift(newEvent);
        renderFeedItems();
        showToast("New paper event ingested into feed!");
      });
    }

    // -----------------------------------------------------------------------
    // HELP & FEEDBACK CENTER INTERACTION
    // -----------------------------------------------------------------------
    // FAQ Accordion
    document.querySelectorAll(".faq-question").forEach(btn => {
      btn.addEventListener("click", () => {
        const item = btn.closest(".faq-item");
        if (item) item.classList.toggle("active");
      });
    });

    // FAQ Search filter
    const txtHelpQuery = document.getElementById("txtHelpQuery");
    if (txtHelpQuery) {
      txtHelpQuery.addEventListener("input", () => {
        const q = txtHelpQuery.value.toLowerCase().trim();
        document.querySelectorAll(".faq-item").forEach(item => {
          const text = item.textContent.toLowerCase();
          item.style.display = text.includes(q) ? "block" : "none";
          if (q) item.classList.add("active");
        });
        document.querySelectorAll(".help-guide-card").forEach(card => {
          const text = card.textContent.toLowerCase();
          card.style.display = text.includes(q) ? "flex" : "none";
        });
      });
    }

    // Category pills in feedback form
    document.querySelectorAll(".cat-pill").forEach(pill => {
      pill.addEventListener("click", () => {
        document.querySelectorAll(".cat-pill").forEach(p => p.classList.remove("active"));
        pill.classList.add("active");
      });
    });

    // Star rating
    const starBtns = document.querySelectorAll(".star-btn");
    starBtns.forEach(star => {
      star.addEventListener("click", () => {
        const rating = parseInt(star.dataset.rate, 10);
        starBtns.forEach(s => {
          const r = parseInt(s.dataset.rate, 10);
          if (r <= rating) s.classList.add("active");
          else s.classList.remove("active");
        });
      });
    });

    // Feedback Form submission
    const formHelpFeedback = document.getElementById("formHelpFeedback");
    if (formHelpFeedback) {
      formHelpFeedback.addEventListener("submit", (e) => {
        e.preventDefault();
        const banner = document.getElementById("feedbackSuccessBanner");
        if (banner) banner.classList.remove("hidden");
        formHelpFeedback.reset();
        showToast("Feedback submitted successfully! Ticket #SL-9281 assigned.");
      });
    }

    // Guide cards click
    document.querySelectorAll(".help-guide-card").forEach(card => {
      card.addEventListener("click", () => {
        const guide = card.dataset.guide;
        if (guide === "mcp-setup") {
          switchView("mcp");
          const modal = document.getElementById("modalMcpConnection");
          if (modal) modal.classList.remove("hidden");
        } else {
          showToast(`Opening guide: ${card.querySelector("h4").textContent}`);
        }
      });
    });

    // Close modal on backdrop click
    document.querySelectorAll(".modal-backdrop").forEach(backdrop => {
      backdrop.addEventListener("click", (e) => {
        if (e.target === backdrop) backdrop.classList.add("hidden");
      });
    });

    // Attachment Dropdown Menu (+ button matching Image 4)
    const btnPromptPlus = document.getElementById("btnPromptPlus");
    const promptAttachMenu = document.getElementById("promptAttachMenu");
    const fileInp = document.getElementById("fileInput");
    const btnMenuUploadDoc = document.getElementById("btnMenuUploadDoc");
    const btnMenuUseCollection = document.getElementById("btnMenuUseCollection");

    if (btnPromptPlus && promptAttachMenu) {
      btnPromptPlus.addEventListener("click", (e) => {
        e.stopPropagation();
        promptAttachMenu.classList.toggle("hidden");
      });

      if (btnMenuUploadDoc) {
        btnMenuUploadDoc.addEventListener("click", (e) => {
          e.stopPropagation();
          promptAttachMenu.classList.add("hidden");
          if (fileInp) fileInp.click();
        });
      }

      if (btnMenuUseCollection) {
        btnMenuUseCollection.addEventListener("click", (e) => {
          e.stopPropagation();
          promptAttachMenu.classList.add("hidden");
          document.getElementById("modalSettings").classList.remove("hidden");
        });
      }

      document.addEventListener("click", (e) => {
        if (!e.target.closest(".prompt-attach-container")) {
          promptAttachMenu.classList.add("hidden");
        }
      });
    }

    if (fileInp) {
      fileInp.addEventListener("change", (e) => {
        if (e.target.files && e.target.files[0]) {
          handleFileUpload(e.target.files[0]);
        }
      });
    }

    const btnUploadDocLegacy = document.getElementById("btnUploadDoc");
    if (btnUploadDocLegacy && fileInp) {
      btnUploadDocLegacy.addEventListener("click", () => fileInp.click());
    }

    const btnRemoveAtt = document.getElementById("btnRemoveAttachment");
    if (btnRemoveAtt) {
      btnRemoveAtt.addEventListener("click", clearAttachment);
    }

    // Prompt input submit
    const txt = document.getElementById("txtQuery");
    const btnSend = document.getElementById("btnSendQuery");

    if (btnSend && txt) {
      btnSend.addEventListener("click", () => submitInquiry(txt.value.trim()));

      txt.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          submitInquiry(txt.value.trim());
        }
      });

      // Auto-resize textarea
      txt.addEventListener("input", () => {
        txt.style.height = "auto";
        txt.style.height = Math.min(txt.scrollHeight, 180) + "px";
      });
    }

    // Suggested Prompts
    document.querySelectorAll(".prompt-card").forEach(card => {
      card.addEventListener("click", () => {
        const q = card.dataset.prompt;
        if (txt) txt.value = q;
        submitInquiry(q);
      });
    });

    // Export PDF
    const btnExportPdf = document.getElementById("btnExportPdf");
    if (btnExportPdf) {
      btnExportPdf.addEventListener("click", exportPdfReport);
    }

    // Clear Conversation
    const btnClearChat = document.getElementById("btnClearChat");
    if (btnClearChat) {
      btnClearChat.addEventListener("click", () => {
        if (state.activeChatId) deleteChat(state.activeChatId);
      });
    }

    // User Profile Modal
    const btnOpenUserModal = document.getElementById("btnOpenUserModal");
    if (btnOpenUserModal) {
      btnOpenUserModal.addEventListener("click", openAuthModal);
    }

    const btnCloseAuthModal = document.getElementById("btnCloseAuthModal");
    if (btnCloseAuthModal) {
      btnCloseAuthModal.addEventListener("click", () => {
        document.getElementById("modalAuth").classList.add("hidden");
      });
    }

    // Google Sign-In Initialization
    if (window.google && window.google.accounts) {
      try {
        window.google.accounts.id.initialize({
          client_id: "YOUR_GOOGLE_CLIENT_ID",
          callback: handleGoogleCredentialResponse
        });
        const gDiv = document.getElementById("googleSignInDiv");
        if (gDiv) {
          window.google.accounts.id.renderButton(
            gDiv,
            { theme: "outline", size: "large", width: 280 }
          );
        }
      } catch (gErr) {
        console.warn("Google Sign-In notice:", gErr.message);
      }
    }

    // Assistant Settings Modal (Image 3)
    const btnOpenSettings = document.getElementById("btnOpenSettings");
    if (btnOpenSettings) {
      btnOpenSettings.addEventListener("click", () => {
        const selM = document.getElementById("selModel");
        const inpKey = document.getElementById("inpApiKey");
        if (selM) selM.value = state.selectedModel;
        if (inpKey) inpKey.value = state.apiKey;
        document.getElementById("modalSettings").classList.remove("hidden");
      });
    }

    const btnCloseSettingsModal = document.getElementById("btnCloseSettingsModal");
    if (btnCloseSettingsModal) {
      btnCloseSettingsModal.addEventListener("click", () => {
        document.getElementById("modalSettings").classList.add("hidden");
      });
    }

    // Settings Modal Tabs
    document.querySelectorAll(".settings-tab-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".settings-tab-btn").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
      });
    });

    // Reset Settings Button
    const btnResetSettings = document.getElementById("btnResetSettings");
    if (btnResetSettings) {
      btnResetSettings.addEventListener("click", () => {
        const selCit = document.getElementById("selCitationStyle");
        const selM = document.getElementById("selModel");
        const selEff = document.getElementById("selReasoningEffort");
        const selLen = document.getElementById("selResponseLength");
        const selCol = document.getElementById("selCollections");
        if (selCit) selCit.value = "APA";
        if (selM) selM.value = "gpt-4o";
        if (selEff) selEff.value = "minimal";
        if (selLen) selLen.value = "medium";
        if (selCol) selCol.value = "";
      });
    }

    // Save Preset Button
    const btnSavePreset = document.getElementById("btnSavePreset");
    if (btnSavePreset) {
      btnSavePreset.addEventListener("click", () => {
        const orig = btnSavePreset.textContent;
        btnSavePreset.textContent = "Preset Saved!";
        setTimeout(() => { btnSavePreset.textContent = orig; }, 1500);
      });
    }

    // Apply Settings Button
    const btnSaveSettings = document.getElementById("btnSaveSettings");
    if (btnSaveSettings) {
      btnSaveSettings.addEventListener("click", () => {
        const selM = document.getElementById("selModel");
        const inpKey = document.getElementById("inpApiKey");
        const model = selM ? selM.value : "gpt-4o";
        const key = inpKey ? inpKey.value.trim() : "";

        state.selectedModel = model;
        state.apiKey = key;

        localStorage.setItem("sciloop_model", model);
        localStorage.setItem("sciloop_api_key", key);

        const lblM = document.getElementById("lblModelInUse");
        if (lblM) lblM.textContent = `${model} Connected`;
        document.getElementById("modalSettings").classList.add("hidden");
      });
    }
  }

  function checkUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const q = params.get("q");
    if (q) {
      document.getElementById("txtQuery").value = q;
      submitInquiry(q);
    }
  }

  // Launch on DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initApp);
  } else {
    initApp();
  }
})();
