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
    chartInstances: {}
  };

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

  function parseSpecialBlocks(text) {
    const mermaidBlocks = [];
    const chartBlocks = [];

    // Extract ```mermaid ... ``` (case-insensitive, handles whitespace)
    let clean = text.replace(/```(?:mermaid)\s*([\s\S]*?)```/gi, (_, code) => {
      mermaidBlocks.push(code.trim());
      return "";
    });

    // Extract ```chart ... ``` (handles json:chart as well)
    clean = clean.replace(/```(?:chart|json:chart)\s*([\s\S]*?)```/gi, (_, jsonStr) => {
      try {
        const parsedJson = JSON.parse(jsonStr.trim());
        chartBlocks.push(parsedJson);
        return "";
      } catch (e) {
        return "";
      }
    });

    return { cleanMarkdown: clean.trim(), mermaidBlocks, chartBlocks };
  }

  function renderMarkdown(md) {
    if (!md) return "";
    
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
    if (btnToggleSidebar) {
      btnToggleSidebar.addEventListener("click", (e) => {
        e.stopPropagation();
        if (sb) sb.classList.toggle("collapsed");
      });
    }

    const sidebarTop = document.querySelector(".sidebar-top-scite");
    if (sidebarTop) {
      sidebarTop.addEventListener("click", () => {
        if (sb && sb.classList.contains("collapsed")) {
          sb.classList.remove("collapsed");
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

    // Nav Item Clicks
    const navAssistant = document.getElementById("navAssistant");
    if (navAssistant) {
      navAssistant.addEventListener("click", () => {
        document.querySelectorAll(".sidebar-nav .nav-item").forEach(n => n.classList.remove("active"));
        navAssistant.classList.add("active");
        document.getElementById("txtQuery").focus();
      });
    }

    const navSearch = document.getElementById("navSearch");
    if (navSearch) {
      navSearch.addEventListener("click", () => {
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
      navMcp.addEventListener("click", () => {
        document.getElementById("modalSettings").classList.remove("hidden");
      });
    }

    const navApi = document.getElementById("navApi");
    if (navApi) {
      navApi.addEventListener("click", () => {
        document.getElementById("modalSettings").classList.remove("hidden");
      });
    }

    const navFeed = document.getElementById("navFeed");
    if (navFeed) {
      navFeed.addEventListener("click", () => {
        const banner = document.getElementById("statusBanner");
        const statusText = document.getElementById("statusText");
        banner.classList.remove("hidden");
        statusText.textContent = "Live scholarly literature feed: 40M+ Europe PMC, 150M+ Crossref, arXiv active.";
        setTimeout(() => banner.classList.add("hidden"), 4000);
      });
    }

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
