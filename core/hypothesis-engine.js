/**
 * SciLoop — Hypothesis Engine
 * Phase 2: Closed-Loop Agent
 *
 * Manages the lifecycle of scientific hypotheses within a campaign.
 * Handles creation, evidence attachment, confidence scoring, state
 * transitions, and hypothesis branching (parent → child refinement).
 *
 * Hypothesis states: proposed → under_investigation → supported | refuted | inconclusive
 */

import { randomUUID } from "node:crypto";

// ─────────────────────────────────────────────────────────────────────────────
// Valid state transitions
// ─────────────────────────────────────────────────────────────────────────────
const VALID_TRANSITIONS = {
  proposed: ["under_investigation"],
  under_investigation: ["supported", "refuted", "inconclusive"],
  supported: ["under_investigation"],    // Can be re-opened if new contradictory evidence
  refuted: ["under_investigation"],      // Can be re-opened if refutation was wrong
  inconclusive: ["under_investigation"], // Can be re-investigated with more data
};

export class HypothesisEngine {
  constructor() {
    /** @type {Map<string, object>} Hypothesis ID → hypothesis object */
    this.hypotheses = new Map();

    /** @type {Array<object>} History of all state changes */
    this.history = [];
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Hypothesis creation
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Create a new hypothesis from a research question.
   * @param {object} params
   * @param {string} params.campaign_id
   * @param {string} params.statement — The testable claim
   * @param {string} [params.evidence_type='model_hypothesis'] — How this hypothesis was generated
   * @param {number} [params.initial_confidence=0.5] — Starting confidence (0-1)
   * @param {string} [params.parent_hypothesis_id=null] — If derived from another hypothesis
   * @returns {object} The created hypothesis
   */
  createHypothesis({
    campaign_id,
    statement,
    evidence_type = "model_hypothesis",
    initial_confidence = 0.5,
    parent_hypothesis_id = null,
  }) {
    const hypothesis = {
      id: randomUUID(),
      campaign_id,
      statement,
      evidence_type,
      confidence: initial_confidence,
      status: "proposed",
      parent_hypothesis_id,
      evidence_for: [],
      evidence_against: [],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    this.hypotheses.set(hypothesis.id, hypothesis);

    this._recordHistory(hypothesis.id, {
      action: "created",
      previous_status: null,
      new_status: "proposed",
      previous_confidence: null,
      new_confidence: initial_confidence,
      reasoning: `Hypothesis generated from research question (${evidence_type})`,
    });

    return { ...hypothesis };
  }

  /**
   * Generate a set of hypotheses from a research question.
   * Returns structured hypotheses ready for investigation.
   * @param {string} campaignId
   * @param {string} researchQuestion
   * @param {string[]} hypothesisStatements — Array of hypothesis statement strings
   * @returns {object[]} Created hypotheses
   */
  generateHypotheses(campaignId, researchQuestion, hypothesisStatements) {
    return hypothesisStatements.map((statement) =>
      this.createHypothesis({
        campaign_id: campaignId,
        statement,
        evidence_type: "model_hypothesis",
        initial_confidence: 0.5,
      })
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Evidence management
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Add supporting evidence to a hypothesis.
   * @param {string} hypothesisId
   * @param {object} evidence — { evidence_id, source_type, relevance, confidence }
   * @returns {object} Updated hypothesis
   */
  addSupportingEvidence(hypothesisId, evidence) {
    const hypothesis = this._getHypothesis(hypothesisId);

    const evidenceRef = {
      evidence_id: evidence.evidence_id || evidence.id,
      source_type: evidence.source_type,
      relevance: evidence.relevance || "Supports hypothesis",
      confidence: evidence.confidence,
      added_at: new Date().toISOString(),
    };

    hypothesis.evidence_for.push(evidenceRef);
    hypothesis.updated_at = new Date().toISOString();

    // Recalculate confidence based on evidence
    const previousConfidence = hypothesis.confidence;
    hypothesis.confidence = this._recalculateConfidence(hypothesis);

    this._recordHistory(hypothesisId, {
      action: "evidence_added",
      direction: "supporting",
      evidence_ref: evidenceRef,
      previous_confidence: previousConfidence,
      new_confidence: hypothesis.confidence,
      reasoning: `Supporting evidence added: ${evidence.relevance || "N/A"}`,
    });

    return { ...hypothesis };
  }

  /**
   * Add contradicting evidence to a hypothesis.
   * @param {string} hypothesisId
   * @param {object} evidence — { evidence_id, source_type, relevance, confidence }
   * @returns {object} Updated hypothesis
   */
  addContradictingEvidence(hypothesisId, evidence) {
    const hypothesis = this._getHypothesis(hypothesisId);

    const evidenceRef = {
      evidence_id: evidence.evidence_id || evidence.id,
      source_type: evidence.source_type,
      relevance: evidence.relevance || "Contradicts hypothesis",
      confidence: evidence.confidence,
      added_at: new Date().toISOString(),
    };

    hypothesis.evidence_against.push(evidenceRef);
    hypothesis.updated_at = new Date().toISOString();

    // Recalculate confidence
    const previousConfidence = hypothesis.confidence;
    hypothesis.confidence = this._recalculateConfidence(hypothesis);

    this._recordHistory(hypothesisId, {
      action: "evidence_added",
      direction: "contradicting",
      evidence_ref: evidenceRef,
      previous_confidence: previousConfidence,
      new_confidence: hypothesis.confidence,
      reasoning: `Contradicting evidence added: ${evidence.relevance || "N/A"}`,
    });

    return { ...hypothesis };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // State transitions
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Transition a hypothesis to a new state.
   * Validates that the transition is allowed.
   * @param {string} hypothesisId
   * @param {string} newStatus — Target state
   * @param {string} reasoning — Why this transition is happening
   * @returns {object} Updated hypothesis
   * @throws {Error} If the transition is not valid
   */
  transitionStatus(hypothesisId, newStatus, reasoning) {
    const hypothesis = this._getHypothesis(hypothesisId);
    const allowed = VALID_TRANSITIONS[hypothesis.status] || [];

    if (!allowed.includes(newStatus)) {
      throw new Error(
        `Invalid hypothesis transition: ${hypothesis.status} → ${newStatus}. ` +
        `Allowed: ${allowed.join(", ")}`
      );
    }

    const previousStatus = hypothesis.status;
    hypothesis.status = newStatus;
    hypothesis.updated_at = new Date().toISOString();

    this._recordHistory(hypothesisId, {
      action: "status_transition",
      previous_status: previousStatus,
      new_status: newStatus,
      previous_confidence: hypothesis.confidence,
      new_confidence: hypothesis.confidence,
      reasoning,
    });

    return { ...hypothesis };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Hypothesis branching (refinement)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Create a refined child hypothesis from a parent.
   * Used when an initial hypothesis needs to be narrowed or modified.
   * @param {string} parentHypothesisId
   * @param {string} refinedStatement — The more specific hypothesis
   * @param {string} reasoning — Why this refinement was needed
   * @returns {object} The child hypothesis
   */
  refineHypothesis(parentHypothesisId, refinedStatement, reasoning) {
    const parent = this._getHypothesis(parentHypothesisId);

    const child = this.createHypothesis({
      campaign_id: parent.campaign_id,
      statement: refinedStatement,
      evidence_type: "model_hypothesis",
      initial_confidence: parent.confidence * 0.8, // Start slightly lower than parent
      parent_hypothesis_id: parent.id,
    });

    this._recordHistory(parentHypothesisId, {
      action: "refined",
      child_hypothesis_id: child.id,
      reasoning,
    });

    return child;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Queries
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get a hypothesis by ID.
   * @param {string} hypothesisId
   * @returns {object | null}
   */
  getHypothesis(hypothesisId) {
    const h = this.hypotheses.get(hypothesisId);
    return h ? { ...h } : null;
  }

  /**
   * Get all hypotheses for a campaign.
   * @param {string} campaignId
   * @returns {object[]}
   */
  getCampaignHypotheses(campaignId) {
    return [...this.hypotheses.values()]
      .filter((h) => h.campaign_id === campaignId)
      .map((h) => ({ ...h }));
  }

  /**
   * Get hypotheses that are still unresolved (not supported/refuted/inconclusive).
   * @param {string} campaignId
   * @returns {object[]}
   */
  getUnresolvedHypotheses(campaignId) {
    return this.getCampaignHypotheses(campaignId).filter(
      (h) => !["supported", "refuted", "inconclusive"].includes(h.status)
    );
  }

  /**
   * Get the full audit history for a hypothesis.
   * @param {string} hypothesisId
   * @returns {object[]}
   */
  getHistory(hypothesisId) {
    return this.history.filter((h) => h.hypothesis_id === hypothesisId);
  }

  /**
   * Get a snapshot of all hypotheses for the campaign state.
   * @param {string} campaignId
   * @returns {object[]}
   */
  getSnapshot(campaignId) {
    return this.getCampaignHypotheses(campaignId).map((h) => ({
      hypothesis_id: h.id,
      statement: h.statement,
      status: h.status,
      confidence: h.confidence,
      evidence_count_for: h.evidence_for.length,
      evidence_count_against: h.evidence_against.length,
    }));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Confidence calculation
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Recalculate hypothesis confidence from its evidence.
   *
   * The formula weights evidence by source type:
   *   - literature: 1.0 weight (peer-reviewed, highest trust)
   *   - computational_prediction: 0.6 weight (useful but not validated)
   *   - model_hypothesis: 0.3 weight (agent reasoning, lowest trust)
   *
   * Confidence = (weighted_for - weighted_against) / max_possible, scaled to [0, 1]
   */
  _recalculateConfidence(hypothesis) {
    const WEIGHT_MAP = {
      literature: 1.0,
      computational_prediction: 0.6,
      model_hypothesis: 0.3,
    };

    const calcWeightedSum = (evidenceList) =>
      evidenceList.reduce((sum, e) => {
        const typeWeight = WEIGHT_MAP[e.source_type] || 0.3;
        const confidenceWeight = e.confidence || 0.5;
        return sum + typeWeight * confidenceWeight;
      }, 0);

    const weightedFor = calcWeightedSum(hypothesis.evidence_for);
    const weightedAgainst = calcWeightedSum(hypothesis.evidence_against);

    const totalWeight = weightedFor + weightedAgainst;

    if (totalWeight === 0) {
      return 0.5; // No evidence → neutral confidence
    }

    // Scale to [0.05, 0.95] to avoid absolute certainty
    const raw = weightedFor / totalWeight;
    return Math.max(0.05, Math.min(0.95, raw));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Internal helpers
  // ─────────────────────────────────────────────────────────────────────────

  _getHypothesis(id) {
    const h = this.hypotheses.get(id);
    if (!h) {
      throw new Error(`Hypothesis not found: ${id}`);
    }
    return h;
  }

  _recordHistory(hypothesisId, entry) {
    this.history.push({
      hypothesis_id: hypothesisId,
      timestamp: new Date().toISOString(),
      ...entry,
    });
  }
}

export default HypothesisEngine;
