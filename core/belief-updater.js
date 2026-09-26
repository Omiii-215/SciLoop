/**
 * SciLoop — Belief Updater
 * Phase 2: Closed-Loop Agent
 *
 * Updates the scientific state based on experimental observations.
 * Takes experiment results and updates hypothesis confidence, aggregates
 * evidence, computes the current "belief state", and logs every change
 * for full reproducibility.
 *
 * The belief updater is the bridge between raw observations and the
 * hypothesis engine — it decides HOW observations translate into
 * confidence changes.
 */

import { randomUUID } from "node:crypto";

export class BeliefUpdater {
  /**
   * @param {import('./hypothesis-engine.js').HypothesisEngine} hypothesisEngine
   */
  constructor(hypothesisEngine) {
    this.hypothesisEngine = hypothesisEngine;

    /** @type {Array<object>} Complete audit trail of all belief updates */
    this.updateLog = [];
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Core update methods
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Process the results of a completed experiment and update relevant hypotheses.
   *
   * @param {object} params
   * @param {string} params.campaign_id
   * @param {string} params.experiment_id
   * @param {string} params.experiment_type — Type of experiment that was run
   * @param {object[]} params.evidence_items — Evidence produced by the experiment
   * @param {string[]} params.hypothesis_ids — Hypotheses this experiment relates to
   * @returns {object} Update summary with affected hypotheses and changes
   */
  processExperimentResults({
    campaign_id,
    experiment_id,
    experiment_type,
    evidence_items,
    hypothesis_ids,
  }) {
    const updates = [];

    for (const hypothesisId of hypothesis_ids) {
      const hypothesis = this.hypothesisEngine.getHypothesis(hypothesisId);
      if (!hypothesis) continue;

      const previousConfidence = hypothesis.confidence;
      const previousStatus = hypothesis.status;

      // Classify each evidence item as supporting or contradicting
      for (const evidence of evidence_items) {
        const classification = this._classifyEvidence(hypothesis, evidence);

        if (classification.direction === "supporting") {
          this.hypothesisEngine.addSupportingEvidence(hypothesisId, {
            evidence_id: evidence.id || randomUUID(),
            source_type: evidence.source_type || evidence.evidence_type,
            relevance: classification.relevance,
            confidence: evidence.confidence || 0.5,
          });
        } else if (classification.direction === "contradicting") {
          this.hypothesisEngine.addContradictingEvidence(hypothesisId, {
            evidence_id: evidence.id || randomUUID(),
            source_type: evidence.source_type || evidence.evidence_type,
            relevance: classification.relevance,
            confidence: evidence.confidence || 0.5,
          });
        }
      }

      // Get updated hypothesis
      const updated = this.hypothesisEngine.getHypothesis(hypothesisId);

      // Auto-transition status based on confidence thresholds
      const statusUpdate = this._evaluateStatusTransition(updated);
      if (statusUpdate.should_transition) {
        try {
          this.hypothesisEngine.transitionStatus(
            hypothesisId,
            statusUpdate.new_status,
            statusUpdate.reasoning
          );
        } catch {
          // Transition not valid from current state — that's fine
        }
      }

      const finalHypothesis = this.hypothesisEngine.getHypothesis(hypothesisId);

      const update = {
        id: randomUUID(),
        campaign_id,
        hypothesis_id: hypothesisId,
        experiment_id,
        previous_confidence: previousConfidence,
        new_confidence: finalHypothesis.confidence,
        delta: finalHypothesis.confidence - previousConfidence,
        previous_status: previousStatus,
        new_status: finalHypothesis.status,
        trigger_type: "experiment_completed",
        triggering_evidence_ids: evidence_items.map((e) => e.id).filter(Boolean),
        reasoning: this._generateUpdateReasoning(
          hypothesis, finalHypothesis, experiment_type, evidence_items
        ),
        provenance: {
          tool_name: "belief_updater",
          experiment_type,
          experiment_id,
        },
        created_at: new Date().toISOString(),
      };

      this.updateLog.push(update);
      updates.push(update);
    }

    return {
      campaign_id,
      experiment_id,
      updates,
      summary: this._summarizeUpdates(updates),
    };
  }

  /**
   * Process critic review results and update hypotheses.
   *
   * @param {object} params
   * @param {string} params.campaign_id
   * @param {object} params.criticism — The critic's structured assessment
   * @param {string[]} params.hypothesis_ids — Hypotheses reviewed
   * @returns {object} Update summary
   */
  processCriticReview({ campaign_id, criticism, hypothesis_ids }) {
    const updates = [];

    for (const hypothesisId of hypothesis_ids) {
      const hypothesis = this.hypothesisEngine.getHypothesis(hypothesisId);
      if (!hypothesis) continue;

      const previousConfidence = hypothesis.confidence;

      // Contradictory evidence from critic
      if (criticism.contradictory_evidence) {
        for (const contra of criticism.contradictory_evidence) {
          this.hypothesisEngine.addContradictingEvidence(hypothesisId, {
            evidence_id: randomUUID(),
            source_type: contra.pmid ? "literature" : "model_hypothesis",
            relevance: contra.claim,
            confidence: 0.7,
          });
        }
      }

      // Weaknesses identified may reduce confidence
      const weaknessCount = (criticism.weaknesses || []).length;
      if (weaknessCount > 0) {
        // Each weakness applies a small penalty
        const penaltyPerWeakness = 0.03;
        const totalPenalty = Math.min(weaknessCount * penaltyPerWeakness, 0.15);
        const updated = this.hypothesisEngine.getHypothesis(hypothesisId);

        // We don't directly set confidence — that's the engine's job
        // But we can add a model_hypothesis evidence representing the criticism
        this.hypothesisEngine.addContradictingEvidence(hypothesisId, {
          evidence_id: randomUUID(),
          source_type: "model_hypothesis",
          relevance: `Critic identified ${weaknessCount} weaknesses: ${criticism.weaknesses.join("; ")}`,
          confidence: Math.min(0.3 + totalPenalty, 0.6),
        });
      }

      const finalHypothesis = this.hypothesisEngine.getHypothesis(hypothesisId);

      const update = {
        id: randomUUID(),
        campaign_id,
        hypothesis_id: hypothesisId,
        experiment_id: null,
        previous_confidence: previousConfidence,
        new_confidence: finalHypothesis.confidence,
        delta: finalHypothesis.confidence - previousConfidence,
        previous_status: hypothesis.status,
        new_status: finalHypothesis.status,
        trigger_type: "critic_review",
        triggering_evidence_ids: [],
        reasoning: `Critic review: ${criticism.overall_assessment || "No assessment provided"}`,
        provenance: {
          tool_name: "belief_updater",
          trigger: "scientific_critic",
        },
        created_at: new Date().toISOString(),
      };

      this.updateLog.push(update);
      updates.push(update);
    }

    return {
      campaign_id,
      updates,
      summary: this._summarizeUpdates(updates),
    };
  }

  /**
   * Process human feedback and update hypotheses.
   *
   * @param {object} params
   * @param {string} params.campaign_id
   * @param {string} params.hypothesis_id
   * @param {string} params.feedback — What the human said
   * @param {number} [params.confidence_override] — If the human explicitly sets confidence
   * @returns {object} The belief update record
   */
  processHumanFeedback({ campaign_id, hypothesis_id, feedback, confidence_override }) {
    const hypothesis = this.hypothesisEngine.getHypothesis(hypothesis_id);
    if (!hypothesis) {
      throw new Error(`Hypothesis not found: ${hypothesis_id}`);
    }

    const previousConfidence = hypothesis.confidence;

    if (confidence_override !== undefined) {
      // Human directly overrides confidence — we record this but don't fight it
      // The hypothesis engine will recalculate on next evidence addition
      const h = this.hypothesisEngine.hypotheses.get(hypothesis_id);
      h.confidence = Math.max(0.05, Math.min(0.95, confidence_override));
      h.updated_at = new Date().toISOString();
    }

    const finalHypothesis = this.hypothesisEngine.getHypothesis(hypothesis_id);

    const update = {
      id: randomUUID(),
      campaign_id,
      hypothesis_id,
      experiment_id: null,
      previous_confidence: previousConfidence,
      new_confidence: finalHypothesis.confidence,
      delta: finalHypothesis.confidence - previousConfidence,
      previous_status: hypothesis.status,
      new_status: finalHypothesis.status,
      trigger_type: "human_feedback",
      triggering_evidence_ids: [],
      reasoning: `Human feedback: ${feedback}`,
      provenance: {
        tool_name: "belief_updater",
        trigger: "human_reviewer",
      },
      created_at: new Date().toISOString(),
    };

    this.updateLog.push(update);
    return update;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Belief state queries
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get the current "belief state" — a summary of all hypotheses and their confidences.
   * @param {string} campaignId
   * @returns {object} Current belief state
   */
  getBeliefState(campaignId) {
    const hypotheses = this.hypothesisEngine.getCampaignHypotheses(campaignId);

    const byStatus = {
      proposed: [],
      under_investigation: [],
      supported: [],
      refuted: [],
      inconclusive: [],
    };

    for (const h of hypotheses) {
      (byStatus[h.status] || []).push({
        id: h.id,
        statement: h.statement,
        confidence: h.confidence,
        evidence_for: h.evidence_for.length,
        evidence_against: h.evidence_against.length,
      });
    }

    const avgConfidence = hypotheses.length > 0
      ? hypotheses.reduce((sum, h) => sum + h.confidence, 0) / hypotheses.length
      : 0;

    return {
      campaign_id: campaignId,
      total_hypotheses: hypotheses.length,
      average_confidence: Math.round(avgConfidence * 1000) / 1000,
      by_status: byStatus,
      unresolved_count: hypotheses.filter(
        (h) => !["supported", "refuted", "inconclusive"].includes(h.status)
      ).length,
      update_count: this.updateLog.filter((u) => u.campaign_id === campaignId).length,
      last_update: this.updateLog
        .filter((u) => u.campaign_id === campaignId)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0]?.created_at || null,
    };
  }

  /**
   * Get the full update log for a campaign.
   * @param {string} campaignId
   * @returns {object[]}
   */
  getUpdateLog(campaignId) {
    return this.updateLog
      .filter((u) => u.campaign_id === campaignId)
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Internal helpers
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Classify a piece of evidence as supporting or contradicting a hypothesis.
   * Uses simple heuristics — in production this would use NLI or similar.
   */
  _classifyEvidence(hypothesis, evidence) {
    // If the evidence explicitly marks direction, use it
    if (evidence.direction) {
      return {
        direction: evidence.direction,
        relevance: evidence.claim || evidence.relevance || "Explicit direction",
      };
    }

    // Default: assume supporting (the agent's skills should set direction)
    return {
      direction: "supporting",
      relevance: evidence.claim || "Evidence related to hypothesis",
    };
  }

  /**
   * Evaluate whether a hypothesis should automatically transition status.
   */
  _evaluateStatusTransition(hypothesis) {
    // Only auto-transition from under_investigation
    if (hypothesis.status !== "under_investigation") {
      return { should_transition: false };
    }

    // Strong support: confidence > 0.8 with at least 3 supporting evidence
    if (hypothesis.confidence > 0.8 && hypothesis.evidence_for.length >= 3) {
      return {
        should_transition: true,
        new_status: "supported",
        reasoning: `High confidence (${hypothesis.confidence.toFixed(2)}) with ${hypothesis.evidence_for.length} supporting evidence items`,
      };
    }

    // Strong refutation: confidence < 0.2 with contradicting evidence
    if (hypothesis.confidence < 0.2 && hypothesis.evidence_against.length >= 2) {
      return {
        should_transition: true,
        new_status: "refuted",
        reasoning: `Low confidence (${hypothesis.confidence.toFixed(2)}) with ${hypothesis.evidence_against.length} contradicting evidence items`,
      };
    }

    return { should_transition: false };
  }

  /**
   * Generate a human-readable reasoning string for a belief update.
   */
  _generateUpdateReasoning(before, after, experimentType, evidenceItems) {
    const delta = after.confidence - before.confidence;
    const direction = delta > 0 ? "increased" : delta < 0 ? "decreased" : "unchanged";
    const evidenceCount = evidenceItems.length;
    const types = [...new Set(evidenceItems.map((e) => e.source_type || e.evidence_type))];

    return (
      `Experiment '${experimentType}' produced ${evidenceCount} evidence item(s) ` +
      `(types: ${types.join(", ")}). ` +
      `Confidence ${direction} from ${before.confidence.toFixed(3)} to ${after.confidence.toFixed(3)} ` +
      `(Δ = ${delta >= 0 ? "+" : ""}${delta.toFixed(3)}).`
    );
  }

  /**
   * Summarize a batch of updates for logging.
   */
  _summarizeUpdates(updates) {
    if (updates.length === 0) return "No hypotheses updated";

    const increased = updates.filter((u) => u.delta > 0).length;
    const decreased = updates.filter((u) => u.delta < 0).length;
    const unchanged = updates.filter((u) => u.delta === 0).length;
    const statusChanges = updates.filter((u) => u.previous_status !== u.new_status);

    return (
      `Updated ${updates.length} hypothesis/hypotheses: ` +
      `${increased} strengthened, ${decreased} weakened, ${unchanged} unchanged. ` +
      `${statusChanges.length} status transition(s).`
    );
  }
}

export default BeliefUpdater;
