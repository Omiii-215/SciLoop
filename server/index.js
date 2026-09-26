/**
 * SciLoop — Local Web Server & Interactive Scientific Dashboard
 *
 * Provides a local HTTP server and REST API for launching, tracking,
 * and inspecting autonomous research campaigns.
 *
 * Runs natively on Node.js without external server dependencies.
 */

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { DomainRegistry } from "../core/domain-registry.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const REPORTS_DIR = path.join(ROOT_DIR, "reports");

if (!fs.existsSync(REPORTS_DIR)) {
  fs.mkdirSync(REPORTS_DIR, { recursive: true });
}

const domainRegistry = new DomainRegistry();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(JSON.stringify(data));
}

function sendHtml(res, html) {
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(html);
}

const HTML_DASHBOARD = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SciLoop — Autonomous Scientific Research Campaign Agent</title>
  <style>
    :root {
      --bg: #090d16;
      --card-bg: rgba(18, 24, 38, 0.7);
      --border: rgba(255, 255, 255, 0.08);
      --border-accent: rgba(56, 189, 248, 0.3);
      --text: #f1f5f9;
      --text-muted: #94a3b8;
      --cyan: #38bdf8;
      --emerald: #10b981;
      --amber: #f59e0b;
      --rose: #f43f5e;
      --indigo: #6366f1;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body { background: var(--bg); color: var(--text); padding: 24px; min-height: 100vh; background-image: radial-gradient(circle at 15% 15%, rgba(56, 189, 248, 0.06) 0%, transparent 40%), radial-gradient(circle at 85% 85%, rgba(99, 102, 241, 0.06) 0%, transparent 40%); }
    header { display: flex; justify-content: space-between; align-items: center; padding-bottom: 20px; border-bottom: 1px solid var(--border); margin-bottom: 28px; }
    .logo { display: flex; align-items: center; gap: 12px; font-size: 24px; font-weight: 700; color: #fff; letter-spacing: -0.5px; }
    .badge { background: rgba(56, 189, 248, 0.15); color: var(--cyan); padding: 4px 10px; border-radius: 9999px; font-size: 12px; font-weight: 600; border: 1px solid var(--border-accent); }
    .nav-links a { color: var(--cyan); text-decoration: none; font-size: 14px; font-weight: 500; margin-left: 16px; transition: opacity 0.2s; }
    .nav-links a:hover { opacity: 0.8; text-decoration: underline; }
    .grid { display: grid; grid-template-columns: 360px 1fr; gap: 24px; }
    .card { background: var(--card-bg); backdrop-filter: blur(12px); border: 1px solid var(--border); border-radius: 14px; padding: 20px; box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3); }
    .card h2 { font-size: 16px; font-weight: 600; margin-bottom: 16px; color: #e2e8f0; display: flex; align-items: center; gap: 8px; }
    label { display: block; font-size: 13px; font-weight: 500; color: var(--text-muted); margin-bottom: 6px; }
    input, textarea, select { width: 100%; background: rgba(15, 23, 42, 0.8); border: 1px solid var(--border); border-radius: 8px; color: #fff; padding: 10px 12px; font-size: 14px; margin-bottom: 16px; outline: none; transition: border-color 0.2s; }
    input:focus, textarea:focus, select:focus { border-color: var(--cyan); }
    button.btn-primary { width: 100%; background: linear-gradient(135deg, #0284c7, #2563eb); color: white; border: none; border-radius: 8px; padding: 12px; font-size: 14px; font-weight: 600; cursor: pointer; transition: all 0.2s; box-shadow: 0 4px 14px rgba(37, 99, 235, 0.3); }
    button.btn-primary:hover { opacity: 0.95; transform: translateY(-1px); }
    button:disabled { opacity: 0.5; cursor: not-allowed; }
    .step-log { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 12px; line-height: 1.6; background: rgba(10, 15, 26, 0.9); border: 1px solid var(--border); border-radius: 8px; padding: 14px; max-height: 480px; overflow-y: auto; color: #cbd5e1; }
    .status-pill { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; padding: 3px 8px; border-radius: 6px; font-weight: 500; }
    .status-green { background: rgba(16, 185, 129, 0.15); color: var(--emerald); border: 1px solid rgba(16, 185, 129, 0.3); }
    .status-amber { background: rgba(245, 158, 11, 0.15); color: var(--amber); border: 1px solid rgba(245, 158, 11, 0.3); }
    .candidate-card { background: rgba(255, 255, 255, 0.03); border: 1px solid var(--border); border-radius: 10px; padding: 14px; margin-bottom: 12px; transition: border-color 0.2s; }
    .candidate-card:hover { border-color: var(--border-accent); }
    .candidate-title { font-weight: 600; font-size: 14px; color: #fff; margin-bottom: 6px; display: flex; justify-content: space-between; }
    .candidate-smiles { font-family: monospace; font-size: 11px; color: var(--text-muted); word-break: break-all; margin-bottom: 8px; }
    .metrics-row { display: flex; gap: 12px; font-size: 12px; color: #cbd5e1; }
    .metric-item { background: rgba(15, 23, 42, 0.6); padding: 4px 8px; border-radius: 4px; }
  </style>
</head>
<body>
  <header>
    <div class="logo">
      <span>🧬</span> SciLoop
      <span class="badge">v1.0.0 · Local Active</span>
    </div>
    <div class="nav-links">
      <a href="http://localhost:8790" target="_blank">🔗 TrueForge UI (:8790)</a>
      <a href="/api/health" target="_blank">🩺 API Health</a>
      <a href="/api/domains" target="_blank">🌐 Domains</a>
    </div>
  </header>

  <div class="grid">
    <div class="card">
      <h2>🚀 Campaign Setup</h2>
      <label for="gene">Target Gene</label>
      <input type="text" id="gene" value="EGFR">

      <label for="disease">Disease Indication</label>
      <input type="text" id="disease" value="Non-Small Cell Lung Cancer (NSCLC)">

      <label for="domain">Scientific Domain</label>
      <select id="domain">
        <option value="small_molecule_drug_discovery" selected>Small Molecule Drug Discovery (SMILES)</option>
        <option value="materials_discovery">Materials Discovery (CIF/POSCAR)</option>
        <option value="synthetic_biology">Synthetic Biology (FASTA/GenBank)</option>
      </select>

      <label for="question">Research Question</label>
      <textarea id="question" rows="4">Investigate whether EGFR is a computationally viable therapeutic target for Non-Small Cell Lung Cancer (NSCLC) and discover lead candidate molecules.</textarea>

      <button id="runBtn" class="btn-primary" onclick="launchCampaign()">⚡ Run Autonomous Campaign</button>

      <div style="margin-top: 20px; font-size: 12px; color: var(--text-muted); line-height: 1.5;">
        <strong>Closed-Loop Flow:</strong><br>
        1. Hypothesis proposals<br>
        2. In silico docking (AutoDock Vina)<br>
        3. ADMET & selectivity screening<br>
        4. NSGA-II Pareto optimization<br>
        5. Molecular dynamics simulation<br>
        6. Wet-lab experimental calibration<br>
        7. SHA-256 reproducibility fingerprint
      </div>
    </div>

    <div class="card">
      <h2>📊 Live Campaign Execution & Results</h2>
      <div id="statusBanner" style="margin-bottom: 16px; font-size: 13px; color: var(--text-muted);">
        Ready to launch research campaign.
      </div>
      <div id="stepLog" class="step-log">Hit "Run Autonomous Campaign" to begin closed-loop execution.</div>

      <div id="resultsSection" style="margin-top: 20px; display: none;">
        <h3 style="font-size: 14px; font-weight: 600; margin-bottom: 12px; color: var(--cyan);">⭐ Lead Candidates (Pareto Rank 1)</h3>
        <div id="candidateList"></div>
      </div>
    </div>
  </div>

  <script>
    async function launchCampaign() {
      const btn = document.getElementById("runBtn");
      const log = document.getElementById("stepLog");
      const statusBanner = document.getElementById("statusBanner");
      const resultsSection = document.getElementById("resultsSection");
      const candidateList = document.getElementById("candidateList");

      btn.disabled = true;
      btn.innerText = "⏳ Running Campaign...";
      statusBanner.innerHTML = '<span class="status-pill status-amber">⚡ Executing closed-loop scientific cycle...</span>';
      log.innerText = "Initializing Campaign Engines, Domain Registry, and Provenance Tracker...\n";
      resultsSection.style.display = "none";
      candidateList.innerHTML = "";

      const payload = {
        gene: document.getElementById("gene").value,
        disease: document.getElementById("disease").value,
        question: document.getElementById("question").value,
        domain: document.getElementById("domain").value
      };

      try {
        const res = await fetch("/api/campaigns/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        const data = await res.json();
        btn.disabled = false;
        btn.innerText = "⚡ Run Autonomous Campaign";

        if (!data.success) {
          statusBanner.innerHTML = '<span class="status-pill status-amber">❌ Execution Error</span>';
          log.innerText += "\\nError: " + (data.error || "Unknown error occurred");
          return;
        }

        statusBanner.innerHTML = '<span class="status-pill status-green">✔ Completed in ' + (data.duration_ms / 1000).toFixed(2) + 's</span>';
        log.innerText = data.output;

        if (data.report && data.report.lead_candidates) {
          resultsSection.style.display = "block";
          data.report.lead_candidates.forEach(cand => {
            const el = document.createElement("div");
            el.className = "candidate-card";
            el.innerHTML = \`
              <div class="candidate-title">
                <span>\${cand.name || cand.id}</span>
                <span class="status-pill status-green">Pareto Rank 1</span>
              </div>
              <div class="candidate-smiles">\${cand.smiles || "N/A"}</div>
              <div class="metrics-row">
                <span class="metric-item">ΔG_bind: <strong>\${cand.docking_affinity} kcal/mol</strong></span>
                <span class="metric-item">Selectivity: <strong>\${(cand.selectivity_score * 100).toFixed(0)}%</strong></span>
                <span class="metric-item">ADMET: <strong>\${cand.traffic_light}</strong></span>
              </div>
            \`;
            candidateList.appendChild(el);
          });
        }
      } catch (err) {
        btn.disabled = false;
        btn.innerText = "⚡ Run Autonomous Campaign";
        statusBanner.innerHTML = '<span class="status-pill status-amber">❌ Network Error</span>';
        log.innerText += "\\nNetwork error: " + err.message;
      }
    }
  </script>
</body>
</html>`;

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const pathname = url.pathname;

  // CORS Preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    res.end();
    return;
  }

  // Dashboard UI
  if (pathname === "/" && req.method === "GET") {
    sendHtml(res, HTML_DASHBOARD);
    return;
  }

  // Health API
  if (pathname === "/api/health" && req.method === "GET") {
    sendJson(res, 200, {
      status: "healthy",
      service: "sciloop-core",
      version: "1.0.0",
      timestamp: new Date().toISOString(),
      engines: [
        "CampaignManager",
        "HypothesisEngine",
        "BeliefUpdater",
        "DockingEngine",
        "SimulationEngine",
        "HypothesisDiscriminator",
        "CandidateOptimizer",
        "SelectivityEngine",
        "AdmetEngine",
        "ParetoFrontier",
        "ExperimentalFeedbackEngine",
        "PredictionCalibrator",
        "DomainRegistry",
        "ReproducibilityEngine",
      ],
      trueforge_status: "listening_on_localhost_8790",
    });
    return;
  }

  // Domains API
  if (pathname === "/api/domains" && req.method === "GET") {
    sendJson(res, 200, {
      domains: domainRegistry.listDomains(),
    });
    return;
  }

  // List Campaign Reports API
  if (pathname === "/api/campaigns" && req.method === "GET") {
    try {
      const files = fs.readdirSync(REPORTS_DIR).filter((f) => f.endsWith(".json"));
      const summaries = files.map((file) => {
        const raw = fs.readFileSync(path.join(REPORTS_DIR, file), "utf-8");
        const json = JSON.parse(raw);
        return {
          filename: file,
          campaign_id: json.campaign_id,
          research_question: json.research_question,
          completed_at: json.completed_at,
        };
      });
      sendJson(res, 200, { campaigns: summaries });
    } catch (err) {
      sendJson(res, 500, { error: err.message });
    }
    return;
  }

  // Run Campaign API
  if (pathname === "/api/campaigns/run" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      try {
        const payload = body ? JSON.parse(body) : {};
        const gene = payload.gene || "EGFR";
        const disease = payload.disease || "Non-Small Cell Lung Cancer";
        const question = payload.question || `Investigate ${gene} as target for ${disease}`;

        const scriptPath = path.join(ROOT_DIR, "scripts", "run-campaign.js");
        const childArgs = ["--gene", gene, "--disease", disease, "--question", question, "--auto-approve"];

        const startExec = Date.now();
        execFile("node", [scriptPath, ...childArgs], { cwd: ROOT_DIR }, (error, stdout, stderr) => {
          const duration = Date.now() - startExec;
          if (error) {
            sendJson(res, 500, {
              success: false,
              error: error.message,
              output: stdout + "\n" + stderr,
            });
            return;
          }

          // Find newest report in reports directory
          let latestReport = null;
          try {
            const files = fs.readdirSync(REPORTS_DIR)
              .filter((f) => f.endsWith(".json"))
              .map((f) => ({ f, mtime: fs.statSync(path.join(REPORTS_DIR, f)).mtime }))
              .sort((a, b) => b.mtime - a.mtime);

            if (files.length > 0) {
              const content = fs.readFileSync(path.join(REPORTS_DIR, files[0].f), "utf-8");
              latestReport = JSON.parse(content);
            }
          } catch (e) {
            // report reading non-fatal
          }

          sendJson(res, 200, {
            success: true,
            duration_ms: duration,
            output: stdout,
            report: latestReport,
          });
        });
      } catch (err) {
        sendJson(res, 400, { success: false, error: err.message });
      }
    });
    return;
  }

  // 404 fallback
  sendJson(res, 404, { error: "Not Found", path: pathname });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`\n=======================================================`);
  console.log(`🧬 SciLoop Local Server listening on http://localhost:${PORT}`);
  console.log(`🌐 TrueForge Harness active on   http://localhost:8790`);
  console.log(`=======================================================\n`);
});

export default server;
