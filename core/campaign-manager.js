/**
 * SciLoop — Campaign Manager
 * Phase 2: Closed-Loop Agent
 *
 * Orchestrates the full closed-loop research cycle:
 *   plan → execute → observe → critique → re-plan → repeat
 *
 * This is the top-level controller that coordinates the hypothesis engine,
 * belief updater, experiment selector, and policy engine into a coherent
 * research campaign.
 *
 * Responsibilities:
 *   - Initialize campaigns from research questions
 *   - Run the iterative research loop
 *   - Enforce approval gates
 *   - Track campaign state and history
 *   - Enforce stopping criteria
 *   - Support pause/resume
 */

import { randomUUID } from "node:crypto";
import { PolicyEngine } from "./policy-engine.js";
import { HypothesisEngine } from "./hypothesis-engine.js";
import { BeliefUpdater } from "./belief-updater.js";
import { ExperimentSelector } from "./experiment-selector.js";
import { CandidateOptimizer } from "./candidate-optimizer.js";
import { SelectivityEngine } from "./selectivity-engine.js";
import { AdmetEngine } from "./admet-engine.js";
import { ParetoFrontier } from "./pareto-frontier.js";

// ─────────────────────────────────────────────────────────────────────────────
// Campaign phases (in typical order, but the loop can revisit any phase)
// ─────────────────────────────────────────────────────────────────────────────
const PHASE_ORDER = [
  "planning",
  "evidence_gathering",
  "target_assessment",
  "structure_analysis",
  "candidate_search",
  "candidate_filtering",
  "candidate_scoring",
  "selectivity_screening",
  "admet_profiling",
  "candidate_optimization",
  "criticism",
  "awaiting_approval",
  "re_planning",
  "report_generation",
  "completed",
];

export class CampaignManager {
  constructor() {
    /** @type {Map<string, object>} Campaign ID → campaign record */
    this.campaigns = new Map();

    /** @type {Map<string, object>} Campaign ID → runtime state */
    this.runtimes = new Map();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Campaign lifecycle
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Initialize a new research campaign.
   *
   * @param {object} params
   * @param {string} params.research_question — The core scientific question
   * @param {string} [params.target_gene] — Primary target gene (if known)
   * @param {string} [params.target_disease] — Primary disease context (if known)
   * @param {object} [params.policy_overrides] — Campaign-specific policy overrides
   * @returns {object} The initialized campaign with its engines
   */
  initializeCampaign({
    research_question,
    target_gene = null,
    target_disease = null,
    policy_overrides = {},
  }) {
    const campaignId = randomUUID();
    const startTime = new Date().toISOString();

    // Create campaign record
    const campaign = {
      id: campaignId,
      research_question,
      target_gene,
      target_disease,
      status: "active",
      current_iteration: 1,
      current_phase: "planning",
      config: {
        policy_overrides,
        created_by: "campaign_manager",
      },
      created_at: startTime,
      updated_at: startTime,
    };

    // Initialize all engines for this campaign
    const policy = PolicyEngine.createPolicy(campaignId, policy_overrides);
    const policyEngine = new PolicyEngine(policy);
    const hypothesisEngine = new HypothesisEngine();
    const beliefUpdater = new BeliefUpdater(hypothesisEngine);
    const experimentSelector = new ExperimentSelector(policyEngine);

    // Create runtime state
    const runtime = {
      campaign_id: campaignId,
      policy,
      policyEngine,
      hypothesisEngine,
      beliefUpdater,
      experimentSelector,
      state_history: [],
      experiments: [],
      evidence: [],
      candidates: [],
      approvals: [],
      start_time: Date.now(),
      budget_used: {
        literature_queries: 0,
        database_queries: 0,
        sandbox_executions: 0,
        total_api_calls: 0,
        elapsed_seconds: 0,
      },
    };

    this.campaigns.set(campaignId, campaign);
    this.runtimes.set(campaignId, runtime);

    // Save initial state snapshot
    this._saveStateSnapshot(campaignId);

    return {
      campaign,
      policy,
      message: `Campaign initialized. Research question: "${research_question}". ` +
               `Use advanceCampaign() to progress through the research loop.`,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Research loop advancement
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Advance the campaign by one step.
   * This is the core method that implements the closed-loop:
   *   1. Evaluate current state
   *   2. Check stopping criteria
   *   3. Select next experiment (or request approval, or generate report)
   *   4. Return what the agent should do next
   *
   * @param {string} campaignId
   * @returns {object} Next action for the agent to take
   */
  advanceCampaign(campaignId) {
    const campaign = this._getCampaign(campaignId);
    const runtime = this._getRuntime(campaignId);

    // Update elapsed time
    runtime.budget_used.elapsed_seconds = (Date.now() - runtime.start_time) / 1000;

    // Check stopping criteria
    const stateSnapshot = this.getCampaignState(campaignId);
    const stopCheck = runtime.policyEngine.evaluateStoppingCriteria(stateSnapshot);

    if (stopCheck.should_stop) {
      campaign.current_phase = "report_generation";
      campaign.updated_at = new Date().toISOString();

      return {
        action: "generate_report",
        campaign_id: campaignId,
        phase: "report_generation",
        reasoning: `Stopping criteria met: ${stopCheck.reasons.join("; ")}`,
        state: stateSnapshot,
      };
    }

    // Determine next action based on current phase
    return this._determineNextAction(campaignId);
  }

  /**
   * Record a completed experiment and advance the campaign.
   *
   * @param {string} campaignId
   * @param {object} experiment — Completed experiment record
   * @param {object[]} evidenceItems — Evidence produced by the experiment
   * @param {object[]} [candidateItems] — Candidates produced (if any)
   * @returns {object} Updated campaign state and next action
   */
  recordExperiment(campaignId, experiment, evidenceItems = [], candidateItems = []) {
    const runtime = this._getRuntime(campaignId);

    // Record the experiment
    const experimentRecord = {
      id: experiment.id || randomUUID(),
      campaign_id: campaignId,
      experiment_type: experiment.experiment_type,
      description: experiment.description,
      inputs: experiment.inputs || {},
      outputs: experiment.outputs || {},
      execution: experiment.execution || {},
      status: "completed",
      created_at: new Date().toISOString(),
    };

    runtime.experiments.push(experimentRecord);
    runtime.experimentSelector.recordCompletedExperiment(experimentRecord);

    // Track evidence
    for (const evidence of evidenceItems) {
      runtime.evidence.push({
        id: evidence.id || randomUUID(),
        campaign_id: campaignId,
        ...evidence,
        created_at: evidence.created_at || new Date().toISOString(),
      });
    }

    // Track candidates
    for (const candidate of candidateItems) {
      runtime.candidates.push({
        id: candidate.id || randomUUID(),
        campaign_id: campaignId,
        ...candidate,
        created_at: candidate.created_at || new Date().toISOString(),
      });
    }

    // Update budget tracking
    this._updateBudgetUsage(runtime, experiment.experiment_type);

    // Update beliefs based on evidence
    const hypothesisIds = runtime.hypothesisEngine
      .getCampaignHypotheses(campaignId)
      .map((h) => h.id);

    let beliefUpdate = null;
    if (hypothesisIds.length > 0 && evidenceItems.length > 0) {
      beliefUpdate = runtime.beliefUpdater.processExperimentResults({
        campaign_id: campaignId,
        experiment_id: experimentRecord.id,
        experiment_type: experiment.experiment_type,
        evidence_items: evidenceItems,
        hypothesis_ids: hypothesisIds,
      });
    }

    // Save state snapshot
    this._saveStateSnapshot(campaignId);

    // Get next action
    const nextAction = this.advanceCampaign(campaignId);

    return {
      experiment: experimentRecord,
      belief_update: beliefUpdate,
      next_action: nextAction,
      state: this.getCampaignState(campaignId),
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Hypothesis management (delegated to engine)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Add hypotheses to the campaign.
   * @param {string} campaignId
   * @param {string[]} statements — Hypothesis statement strings
   * @returns {object[]} Created hypotheses
   */
  addHypotheses(campaignId, statements) {
    const runtime = this._getRuntime(campaignId);
    const campaign = this._getCampaign(campaignId);

    const hypotheses = runtime.hypothesisEngine.generateHypotheses(
      campaignId,
      campaign.research_question,
      statements
    );

    // Transition all to under_investigation
    for (const h of hypotheses) {
      try {
        runtime.hypothesisEngine.transitionStatus(
          h.id,
          "under_investigation",
          "Campaign investigation started"
        );
      } catch {
        // Already in a valid state
      }
    }

    return hypotheses;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Approval gates
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Record a human approval decision at a gate.
   *
   * @param {string} campaignId
   * @param {string} gateName — 'research_plan' | 'candidate_ranking' | 'final_report'
   * @param {boolean} approved — Whether the human approved
   * @param {string} [notes] — Human reviewer notes
   * @returns {object} The approval record and next action
   */
  recordApproval(campaignId, gateName, approved, notes = "") {
    const runtime = this._getRuntime(campaignId);
    const campaign = this._getCampaign(campaignId);

    const approvalRecord = {
      id: randomUUID(),
      campaign_id: campaignId,
      gate_name: gateName,
      approved,
      approved_by: "human_reviewer",
      notes,
      context: {
        iteration: campaign.current_iteration,
        phase: campaign.current_phase,
        hypothesis_count: runtime.hypothesisEngine.getCampaignHypotheses(campaignId).length,
        evidence_count: runtime.evidence.length,
        candidate_count: runtime.candidates.length,
      },
      created_at: new Date().toISOString(),
    };

    runtime.approvals.push(approvalRecord);

    if (!approved) {
      // If not approved, mark for re-planning
      campaign.current_phase = "re_planning";
      campaign.updated_at = new Date().toISOString();

      return {
        approval: approvalRecord,
        next_action: {
          action: "re_plan",
          campaign_id: campaignId,
          reasoning: `Human reviewer rejected at '${gateName}' gate. Notes: ${notes}. ` +
                     `Re-planning required.`,
        },
      };
    }

    // Advance to next phase after approval
    campaign.updated_at = new Date().toISOString();
    const nextAction = this.advanceCampaign(campaignId);

    return {
      approval: approvalRecord,
      next_action: nextAction,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Re-planning
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Start a new iteration of the research loop.
   * Called after criticism or when the planner decides more investigation is needed.
   *
   * @param {string} campaignId
   * @param {string} reasoning — Why re-planning is needed
   * @returns {object} New iteration state
   */
  startNewIteration(campaignId, reasoning) {
    const campaign = this._getCampaign(campaignId);
    const runtime = this._getRuntime(campaignId);

    // Check if we've exceeded max iterations
    const iterationCheck = runtime.policyEngine.checkBudget(
      "iterations",
      campaign.current_iteration
    );

    if (!iterationCheck.allowed) {
      campaign.current_phase = "report_generation";
      campaign.updated_at = new Date().toISOString();

      return {
        action: "generate_report",
        campaign_id: campaignId,
        reasoning: `Maximum iterations (${iterationCheck.limit}) reached. Generating final report.`,
        iteration: campaign.current_iteration,
      };
    }

    // Advance to next iteration
    campaign.current_iteration += 1;
    campaign.current_phase = "evidence_gathering";
    campaign.updated_at = new Date().toISOString();

    // Reset the experiment selector's iteration tracker
    runtime.experimentSelector.startNewIteration();

    // Save state snapshot
    this._saveStateSnapshot(campaignId);

    return {
      action: "continue_research",
      campaign_id: campaignId,
      iteration: campaign.current_iteration,
      reasoning,
      belief_state: runtime.beliefUpdater.getBeliefState(campaignId),
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Campaign state queries
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get the current campaign state as a snapshot.
   * @param {string} campaignId
   * @returns {object}
   */
  getCampaignState(campaignId) {
    const campaign = this._getCampaign(campaignId);
    const runtime = this._getRuntime(campaignId);

    const hypotheses = runtime.hypothesisEngine.getCampaignHypotheses(campaignId);
    const hypothesisSnapshot = runtime.hypothesisEngine.getSnapshot(campaignId);

    runtime.budget_used.elapsed_seconds = (Date.now() - runtime.start_time) / 1000;
    const budgetRemaining = runtime.policyEngine.getBudgetRemaining(runtime.budget_used);

    return {
      id: randomUUID(),
      campaign_id: campaignId,
      iteration: campaign.current_iteration,
      phase: campaign.current_phase,
      status: campaign.status,

      total_hypotheses: hypotheses.length,
      supported_hypotheses: hypotheses.filter((h) => h.status === "supported").length,
      refuted_hypotheses: hypotheses.filter((h) => h.status === "refuted").length,
      total_evidence: runtime.evidence.length,
      total_experiments_run: runtime.experiments.length,
      total_candidates: runtime.candidates.length,
      candidates_passing_filters: runtime.candidates.filter(
        (c) => c.filters?.pass_all || c.pass_all
      ).length,

      budget_used: { ...runtime.budget_used },
      budget_remaining: budgetRemaining,
      hypothesis_snapshot: hypothesisSnapshot,

      belief_state: runtime.beliefUpdater.getBeliefState(campaignId),
      policy_violations: runtime.policyEngine.getViolations(),

      created_at: new Date().toISOString(),
    };
  }

  /**
   * Get the full campaign record.
   * @param {string} campaignId
   * @returns {object}
   */
  getCampaign(campaignId) {
    return { ...this._getCampaign(campaignId) };
  }

  /**
   * Get all experiments for a campaign.
   * @param {string} campaignId
   * @returns {object[]}
   */
  getExperiments(campaignId) {
    const runtime = this._getRuntime(campaignId);
    return [...runtime.experiments];
  }

  /**
   * Get all evidence for a campaign.
   * @param {string} campaignId
   * @returns {object[]}
   */
  getEvidence(campaignId) {
    const runtime = this._getRuntime(campaignId);
    return [...runtime.evidence];
  }

  /**
   * Get all candidates for a campaign.
   * @param {string} campaignId
   * @returns {object[]}
   */
  getCandidates(campaignId) {
    const runtime = this._getRuntime(campaignId);
    return [...runtime.candidates];
  }

  /**
   * Get the state history (all snapshots) for a campaign.
   * @param {string} campaignId
   * @returns {object[]}
   */
  getStateHistory(campaignId) {
    const runtime = this._getRuntime(campaignId);
    return [...runtime.state_history];
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Campaign status management
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Pause a campaign (e.g. waiting for human input).
   */
  pauseCampaign(campaignId, reason = "Paused by user") {
    const campaign = this._getCampaign(campaignId);
    campaign.status = "paused";
    campaign.updated_at = new Date().toISOString();
    return { campaign_id: campaignId, status: "paused", reason };
  }

  /**
   * Resume a paused campaign.
   */
  resumeCampaign(campaignId) {
    const campaign = this._getCampaign(campaignId);
    campaign.status = "active";
    campaign.updated_at = new Date().toISOString();
    return this.advanceCampaign(campaignId);
  }

  /**
   * Complete a campaign.
   */
  completeCampaign(campaignId, reason = "Campaign completed successfully") {
    const campaign = this._getCampaign(campaignId);
    campaign.status = "completed";
    campaign.current_phase = "completed";
    campaign.updated_at = new Date().toISOString();
    this._saveStateSnapshot(campaignId);
    return { campaign_id: campaignId, status: "completed", reason };
  }

  /**
   * Fail a campaign.
   */
  failCampaign(campaignId, reason) {
    const campaign = this._getCampaign(campaignId);
    campaign.status = "failed";
    campaign.current_phase = "failed";
    campaign.updated_at = new Date().toISOString();
    this._saveStateSnapshot(campaignId);
    return { campaign_id: campaignId, status: "failed", reason };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Internal: Next action determination
  // ─────────────────────────────────────────────────────────────────────────

  _determineNextAction(campaignId) {
    const campaign = this._getCampaign(campaignId);
    const runtime = this._getRuntime(campaignId);
    const state = this.getCampaignState(campaignId);

    switch (campaign.current_phase) {
      case "planning": {
        // Need to generate hypotheses and create a research plan
        campaign.current_phase = "evidence_gathering";
        campaign.updated_at = new Date().toISOString();

        return {
          action: "create_research_plan",
          campaign_id: campaignId,
          phase: "planning",
          requires_approval: runtime.policyEngine.requiresApproval("research_plan"),
          reasoning: "Campaign initialized. Create hypotheses and present research plan.",
        };
      }

      case "awaiting_approval": {
        return {
          action: "wait_for_approval",
          campaign_id: campaignId,
          phase: "awaiting_approval",
          reasoning: "Waiting for human reviewer approval.",
        };
      }

      case "re_planning": {
        return {
          action: "re_plan",
          campaign_id: campaignId,
          phase: "re_planning",
          iteration: campaign.current_iteration,
          belief_state: runtime.beliefUpdater.getBeliefState(campaignId),
          reasoning: "Re-evaluating research plan based on current findings.",
        };
      }

      case "report_generation": {
        return {
          action: "generate_report",
          campaign_id: campaignId,
          phase: "report_generation",
          requires_approval: runtime.policyEngine.requiresApproval("final_report"),
          state,
          reasoning: "All research complete. Generate final report.",
        };
      }

      case "completed":
      case "failed": {
        return {
          action: "none",
          campaign_id: campaignId,
          phase: campaign.current_phase,
          reasoning: `Campaign is ${campaign.current_phase}. No further actions.`,
        };
      }

      default: {
        // For all active research phases, use the experiment selector
        const selected = runtime.experimentSelector.selectNextExperiment(state);

        if (!selected) {
          // No more experiments available — check if we should request approval
          if (state.total_candidates > 0 && !runtime.approvals.some(
            (a) => a.gate_name === "candidate_ranking" && a.approved
          )) {
            campaign.current_phase = "awaiting_approval";
            campaign.updated_at = new Date().toISOString();

            return {
              action: "request_approval",
              campaign_id: campaignId,
              gate_name: "candidate_ranking",
              phase: "awaiting_approval",
              reasoning: "Candidates scored and ranked. Presenting for human approval.",
              state,
            };
          }

          // Move to report generation
          campaign.current_phase = "report_generation";
          campaign.updated_at = new Date().toISOString();

          return {
            action: "generate_report",
            campaign_id: campaignId,
            phase: "report_generation",
            reasoning: "All available experiments exhausted. Moving to report generation.",
          };
        }

        // Update phase based on selected experiment
        campaign.current_phase = this._experimentTypeToPhase(selected.experiment_type);
        campaign.updated_at = new Date().toISOString();

        return {
          action: "run_experiment",
          campaign_id: campaignId,
          phase: campaign.current_phase,
          experiment: selected,
          iteration: campaign.current_iteration,
          reasoning: selected.reasoning,
        };
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Internal helpers
  // ─────────────────────────────────────────────────────────────────────────

  _getCampaign(id) {
    const c = this.campaigns.get(id);
    if (!c) throw new Error(`Campaign not found: ${id}`);
    return c;
  }

  _getRuntime(id) {
    const r = this.runtimes.get(id);
    if (!r) throw new Error(`Campaign runtime not found: ${id}`);
    return r;
  }

  _saveStateSnapshot(campaignId) {
    const runtime = this._getRuntime(campaignId);
    const snapshot = this.getCampaignState(campaignId);
    runtime.state_history.push(snapshot);
  }

  _updateBudgetUsage(runtime, experimentType) {
    const categoryMap = {
      literature_search: "literature_queries",
      scientific_critique: "literature_queries",
      contradiction_search: "literature_queries",
      target_assessment: "database_queries",
      structure_retrieval: "database_queries",
      compound_search: "database_queries",
      molecular_filtering: "sandbox_executions",
      molecular_scoring: "sandbox_executions",
    };

    const category = categoryMap[experimentType];
    if (category && runtime.budget_used[category] !== undefined) {
      runtime.budget_used[category] += 1;
    }
    runtime.budget_used.total_api_calls += 1;
  }

  _experimentTypeToPhase(experimentType) {
    const phaseMap = {
      literature_search: "evidence_gathering",
      target_assessment: "target_assessment",
      structure_retrieval: "structure_analysis",
      compound_search: "candidate_search",
      molecular_filtering: "candidate_filtering",
      molecular_scoring: "candidate_scoring",
      selectivity_screening: "selectivity_screening",
      admet_profiling: "admet_profiling",
      candidate_optimization: "candidate_optimization",
      pareto_ranking: "candidate_scoring",
      scientific_critique: "criticism",
      contradiction_search: "criticism",
      hypothesis_generation: "planning",
      re_planning: "re_planning",
    };
    return phaseMap[experimentType] || "evidence_gathering";
  }
}

export default CampaignManager;
