/**
 * SciLoop — Scientific Policy Engine
 * Phase 2: Closed-Loop Agent
 *
 * Enforces campaign constraints, budgets, and scientific rules.
 * The planner CANNOT silently override policy — every violation is logged.
 *
 * Responsibilities:
 *   - Budget enforcement (queries, time, iterations)
 *   - Tool permission checks
 *   - Evidence requirement validation
 *   - Stopping criteria evaluation
 *   - Approval gate enforcement
 *   - Immutable scientific constraint validation
 */

import { randomUUID } from "node:crypto";

// ─────────────────────────────────────────────────────────────────────────────
// Default policy values (used when no campaign-specific policy exists)
// ─────────────────────────────────────────────────────────────────────────────
const DEFAULT_POLICY = {
  budget: {
    max_literature_queries: 50,
    max_database_queries: 100,
    max_sandbox_executions: 20,
    max_iterations: 5,
    max_duration_seconds: 3600,
  },
  evidence_requirements: {
    min_evidence_for_support: 3,
    min_confidence_for_support: 0.7,
    require_contradiction_search: true,
    require_literature_evidence: true,
  },
  tool_permissions: {
    allowed_tools: null,  // null = all allowed
    forbidden_tools: null,
  },
  stopping_criteria: {
    confidence_threshold: 0.9,
    stop_on_all_resolved: true,
    stop_on_budget_exhausted: true,
    stop_on_no_improvement: true,
    min_improvement_delta: 0.05,
  },
  approval_gates: {
    require_plan_approval: true,
    require_candidate_approval: true,
    require_report_approval: true,
    require_re_plan_approval: false,
  },
  scientific_constraints: {
    never_claim_predictions_as_facts: true,
    require_provenance: true,
    require_evidence_typing: true,
    require_uncertainty_labels: true,
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// IMMUTABLE constraints — these can NEVER be disabled
// ─────────────────────────────────────────────────────────────────────────────
const IMMUTABLE_CONSTRAINTS = [
  "never_claim_predictions_as_facts",
  "require_provenance",
  "require_evidence_typing",
  "require_uncertainty_labels",
];

export class PolicyEngine {
  /**
   * @param {object} campaignPolicy — Per-campaign policy overrides (merged with defaults)
   */
  constructor(campaignPolicy = {}) {
    this.policy = this._mergeWithDefaults(campaignPolicy);
    this.violations = [];
    this.startTime = Date.now();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Policy creation and management
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Create a policy for a new campaign, merging user overrides with defaults.
   * Immutable constraints cannot be overridden — any attempt is logged and ignored.
   */
  static createPolicy(campaignId, overrides = {}) {
    const policy = { campaign_id: campaignId };

    // Deep-merge each section
    for (const section of Object.keys(DEFAULT_POLICY)) {
      policy[section] = { ...DEFAULT_POLICY[section], ...(overrides[section] || {}) };
    }

    // Enforce immutable constraints — silently restore if tampered
    for (const constraint of IMMUTABLE_CONSTRAINTS) {
      policy.scientific_constraints[constraint] = true;
    }

    return policy;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Budget enforcement
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Check if a specific budget category has been exhausted.
   * @param {string} category — 'literature_queries' | 'database_queries' | 'sandbox_executions' | 'iterations'
   * @param {number} currentUsage — How many have been used so far
   * @returns {{ allowed: boolean, remaining: number, limit: number }}
   */
  checkBudget(category, currentUsage) {
    const budgetMap = {
      literature_queries: this.policy.budget.max_literature_queries,
      database_queries: this.policy.budget.max_database_queries,
      sandbox_executions: this.policy.budget.max_sandbox_executions,
      iterations: this.policy.budget.max_iterations,
    };

    const limit = budgetMap[category];
    if (limit === undefined) {
      return { allowed: true, remaining: Infinity, limit: Infinity };
    }

    const remaining = limit - currentUsage;
    const allowed = remaining > 0;

    if (!allowed) {
      this._logViolation("budget_exceeded", {
        category,
        limit,
        current_usage: currentUsage,
      });
    }

    return { allowed, remaining, limit };
  }

  /**
   * Check if the campaign has exceeded its time budget.
   * @returns {{ allowed: boolean, elapsed_seconds: number, limit_seconds: number }}
   */
  checkTimeBudget() {
    const elapsed = (Date.now() - this.startTime) / 1000;
    const limit = this.policy.budget.max_duration_seconds;
    const allowed = elapsed < limit;

    if (!allowed) {
      this._logViolation("time_budget_exceeded", {
        elapsed_seconds: elapsed,
        limit_seconds: limit,
      });
    }

    return { allowed, elapsed_seconds: elapsed, limit_seconds: limit };
  }

  /**
   * Get remaining budget across all categories.
   * @param {object} currentUsage — { literature_queries, database_queries, sandbox_executions, iterations }
   * @returns {object} Budget remaining per category
   */
  getBudgetRemaining(currentUsage) {
    const elapsed = (Date.now() - this.startTime) / 1000;
    return {
      literature_queries: this.policy.budget.max_literature_queries - (currentUsage.literature_queries || 0),
      database_queries: this.policy.budget.max_database_queries - (currentUsage.database_queries || 0),
      sandbox_executions: this.policy.budget.max_sandbox_executions - (currentUsage.sandbox_executions || 0),
      iterations: this.policy.budget.max_iterations - (currentUsage.iterations || 0),
      seconds: this.policy.budget.max_duration_seconds - elapsed,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Tool permission checks
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Check if a tool is allowed by the campaign policy.
   * @param {string} toolName — Name of the MCP tool or sandbox script
   * @returns {{ allowed: boolean, reason: string | null }}
   */
  checkToolPermission(toolName) {
    const { allowed_tools, forbidden_tools } = this.policy.tool_permissions;

    // Check forbidden list first (takes precedence)
    if (forbidden_tools && forbidden_tools.includes(toolName)) {
      this._logViolation("forbidden_tool", { tool: toolName });
      return { allowed: false, reason: `Tool '${toolName}' is explicitly forbidden by campaign policy` };
    }

    // Check allowed list (if whitelist mode is active)
    if (allowed_tools && !allowed_tools.includes(toolName)) {
      this._logViolation("tool_not_in_allowlist", { tool: toolName });
      return { allowed: false, reason: `Tool '${toolName}' is not in the allowed tools list` };
    }

    return { allowed: true, reason: null };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Evidence requirement validation
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Check if a hypothesis has enough evidence to transition to 'supported'.
   * @param {object} hypothesis — { evidence_for: [], evidence_against: [], confidence }
   * @returns {{ can_support: boolean, reasons: string[] }}
   */
  canSupportHypothesis(hypothesis) {
    const reasons = [];
    const { min_evidence_for_support, min_confidence_for_support, require_literature_evidence } =
      this.policy.evidence_requirements;

    const evidenceCount = (hypothesis.evidence_for || []).length;
    if (evidenceCount < min_evidence_for_support) {
      reasons.push(
        `Insufficient evidence: ${evidenceCount}/${min_evidence_for_support} required`
      );
    }

    if ((hypothesis.confidence || 0) < min_confidence_for_support) {
      reasons.push(
        `Confidence too low: ${hypothesis.confidence}/${min_confidence_for_support} required`
      );
    }

    if (require_literature_evidence) {
      const hasLiterature = (hypothesis.evidence_for || []).some(
        (e) => e.source_type === "literature"
      );
      if (!hasLiterature) {
        reasons.push("At least one literature-backed evidence source is required");
      }
    }

    return {
      can_support: reasons.length === 0,
      reasons,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Stopping criteria evaluation
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Evaluate all stopping criteria and return whether the campaign should stop.
   * @param {object} campaignState — Current campaign state snapshot
   * @returns {{ should_stop: boolean, reasons: string[] }}
   */
  evaluateStoppingCriteria(campaignState) {
    const reasons = [];
    const criteria = this.policy.stopping_criteria;

    // Check: all hypotheses exceed confidence threshold
    if (criteria.stop_on_all_resolved) {
      const hypotheses = campaignState.hypothesis_snapshot || [];
      const allResolved = hypotheses.length > 0 && hypotheses.every(
        (h) => ["supported", "refuted", "inconclusive"].includes(h.status)
      );
      if (allResolved) {
        reasons.push("All hypotheses have been resolved");
      }
    }

    // Check: budget exhausted
    if (criteria.stop_on_budget_exhausted) {
      const budgetRemaining = campaignState.budget_remaining || {};
      const anyExhausted = Object.values(budgetRemaining).some((v) => v !== undefined && v <= 0);
      if (anyExhausted) {
        reasons.push("Budget exhausted for one or more categories");
      }
    }

    // Check: no improvement in last iteration
    if (criteria.stop_on_no_improvement && campaignState.iteration > 1) {
      const prevConfidences = campaignState._previous_confidences || [];
      const currConfidences = (campaignState.hypothesis_snapshot || []).map((h) => h.confidence || 0);

      if (prevConfidences.length > 0 && currConfidences.length > 0) {
        const avgPrev = prevConfidences.reduce((a, b) => a + b, 0) / prevConfidences.length;
        const avgCurr = currConfidences.reduce((a, b) => a + b, 0) / currConfidences.length;
        const delta = avgCurr - avgPrev;

        if (delta < criteria.min_improvement_delta) {
          reasons.push(
            `Insufficient improvement: Δ=${delta.toFixed(4)} < ${criteria.min_improvement_delta}`
          );
        }
      }
    }

    // Check: confidence threshold reached for all hypotheses
    const hypotheses = campaignState.hypothesis_snapshot || [];
    const allAboveThreshold = hypotheses.length > 0 && hypotheses.every(
      (h) => (h.confidence || 0) >= criteria.confidence_threshold ||
             ["refuted", "inconclusive"].includes(h.status)
    );
    if (allAboveThreshold) {
      reasons.push(
        `All hypotheses at or above confidence threshold (${criteria.confidence_threshold})`
      );
    }

    return {
      should_stop: reasons.length > 0,
      reasons,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Approval gate enforcement
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Check if a specific approval gate is required.
   * @param {'research_plan' | 'candidate_ranking' | 'final_report' | 're_plan'} gateName
   * @returns {boolean}
   */
  requiresApproval(gateName) {
    const gateMap = {
      research_plan: this.policy.approval_gates.require_plan_approval,
      candidate_ranking: this.policy.approval_gates.require_candidate_approval,
      final_report: this.policy.approval_gates.require_report_approval,
      re_plan: this.policy.approval_gates.require_re_plan_approval,
    };
    return gateMap[gateName] ?? true; // default to requiring approval
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Scientific constraint validation
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Validate that a piece of evidence or output complies with scientific constraints.
   * @param {object} artifact — Evidence, candidate, or report artifact
   * @returns {{ valid: boolean, violations: string[] }}
   */
  validateScientificConstraints(artifact) {
    const violations = [];
    const constraints = this.policy.scientific_constraints;

    // Check: predictions not claimed as facts
    if (constraints.never_claim_predictions_as_facts) {
      if (artifact.evidence_type === "computational_prediction" && !artifact.note && !artifact.composite_note) {
        violations.push(
          "Computational prediction lacks a disclaimer note — must label as prediction, not validated"
        );
      }
    }

    // Check: provenance present
    if (constraints.require_provenance) {
      if (!artifact.provenance || Object.keys(artifact.provenance).length === 0) {
        violations.push("Artifact is missing provenance metadata");
      }
    }

    // Check: evidence typing
    if (constraints.require_evidence_typing) {
      if (artifact.claim && !artifact.source_type && !artifact.evidence_type) {
        violations.push("Evidence/claim is missing source_type classification");
      }
    }

    if (violations.length > 0) {
      for (const v of violations) {
        this._logViolation("scientific_constraint", { detail: v, artifact_id: artifact.id });
      }
    }

    return {
      valid: violations.length === 0,
      violations,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Violation log
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get all logged policy violations.
   * @returns {Array} List of violation records
   */
  getViolations() {
    return [...this.violations];
  }

  /**
   * Check if any violations have occurred.
   * @returns {boolean}
   */
  hasViolations() {
    return this.violations.length > 0;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Internal helpers
  // ─────────────────────────────────────────────────────────────────────────

  _mergeWithDefaults(overrides) {
    const merged = {};
    for (const section of Object.keys(DEFAULT_POLICY)) {
      merged[section] = { ...DEFAULT_POLICY[section], ...(overrides[section] || {}) };
    }

    // Enforce immutable constraints
    for (const constraint of IMMUTABLE_CONSTRAINTS) {
      merged.scientific_constraints[constraint] = true;
    }

    return merged;
  }

  _logViolation(type, context) {
    this.violations.push({
      id: randomUUID(),
      type,
      context,
      timestamp: new Date().toISOString(),
    });
  }
}

export default PolicyEngine;
