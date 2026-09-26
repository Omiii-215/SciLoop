/**
 * SciLoop — General Scientific Engine: Domain Adapter
 * Phase 7: General Scientific Engine
 *
 * Bridges domain-specific scientific logic to the generic closed-loop research engine.
 * Wraps any registered domain descriptor to provide uniform APIs for:
 *   - Hypothesis generation within the domain's hypothesis space
 *   - Candidate schema and integrity validation
 *   - Multi-property evaluation and scoring dispatch
 *   - Evidence trust weighting and calibration
 */

import { randomUUID } from "node:crypto";
import { DomainRegistry, BUILTIN_DOMAINS } from "./domain-registry.js";

export class DomainAdapter {
  /**
   * @param {object} descriptor Domain specification (from DomainRegistry)
   * @param {DomainRegistry} [registry] Optional reference to registry for hooks/tools
   */
  constructor(descriptor, registry = null) {
    if (!descriptor) {
      throw new Error("DomainAdapter requires a valid domain descriptor.");
    }
    this.descriptor = descriptor;
    this.registry = registry;
    this.domainId = descriptor.id;

    // Build evidence lookup map
    this.evidenceWeights = new Map();
    if (descriptor.evidence_hierarchy) {
      for (const ev of descriptor.evidence_hierarchy) {
        this.evidenceWeights.set(ev.type, {
          trust_rank: ev.trust_rank,
          base_weight: ev.base_weight,
        });
      }
    }
  }

  /**
   * Factory method: instantiate adapter by domain ID from registry.
   */
  static forDomain(domainId, registry = null) {
    const reg = registry || new DomainRegistry();
    const descriptor = reg.getDomain(domainId);
    if (!descriptor) {
      throw new Error(`Domain not found in registry: ${domainId}`);
    }
    return new DomainAdapter(descriptor, reg);
  }

  /**
   * Generate hypothesis templates suitable for this domain.
   *
   * @param {string} researchQuestion
   * @param {object} [context]
   * @returns {object[]} Structured hypothesis proposals
   */
  generateHypothesisProposals(researchQuestion, context = {}) {
    const proposals = [];
    const hypothesisTypes = this.descriptor.hypothesis_types || [];

    for (const hType of hypothesisTypes) {
      const proposal = {
        id: `hyp-${this.domainId}-${randomUUID().slice(0, 8)}`,
        domain_id: this.domainId,
        hypothesis_type: hType,
        statement: `Proposed ${hType.replace(/_/g, " ")} mechanism addressing: ${researchQuestion}`,
        target_entity: context.target_entity || "Primary System Target",
        confidence: 0.5,
        status: "proposed",
        evidence_chain: [],
        domain_context: {
          candidate_representation: this.descriptor.candidate_representation,
          primary_metrics: this.descriptor.primary_metrics,
        },
        created_at: new Date().toISOString(),
      };
      proposals.push(proposal);
    }

    return proposals;
  }

  /**
   * Validate a domain candidate (e.g. molecule, crystal, genetic sequence).
   *
   * @param {object} candidate
   * @returns {{ valid: boolean, errors: string[] }}
   */
  validateCandidate(candidate) {
    const errors = [];
    if (!candidate || typeof candidate !== "object") {
      return { valid: false, errors: ["Candidate must be an object."] };
    }

    if (!candidate.id) {
      errors.push("Candidate must have an 'id'.");
    }

    const rep = this.descriptor.candidate_representation;
    if (rep === "SMILES") {
      if (!candidate.smiles || typeof candidate.smiles !== "string") {
        errors.push("Chemical candidate must have a string 'smiles' property.");
      }
    } else if (rep === "CIF/POSCAR") {
      if (!candidate.structure_file && !candidate.composition && !candidate.cif) {
        errors.push("Materials candidate must have 'structure_file', 'composition', or 'cif'.");
      }
    } else if (rep === "FASTA/GenBank") {
      if (!candidate.sequence || typeof candidate.sequence !== "string") {
        errors.push("Biological candidate must have a string 'sequence'.");
      }
    }

    // Call domain hook if registered
    if (this.registry) {
      const hookResult = this.registry.executeHook(
        this.domainId,
        "validate_candidate",
        { candidate, errors }
      );
      if (hookResult && hookResult.errors) {
        return { valid: hookResult.errors.length === 0, errors: hookResult.errors };
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Evaluate a domain candidate across the domain's primary metrics.
   *
   * @param {object} candidate
   * @param {object} [simulationResults]
   * @returns {object} Scored candidate profile with normalized composite score
   */
  evaluateCandidate(candidate, simulationResults = {}) {
    const validation = this.validateCandidate(candidate);
    if (!validation.valid) {
      throw new Error(`Invalid candidate for domain ${this.domainId}: ${validation.errors.join("; ")}`);
    }

    const metricScores = {};
    const primaryMetrics = this.descriptor.primary_metrics || [];

    for (const metric of primaryMetrics) {
      if (simulationResults[metric] !== undefined) {
        metricScores[metric] = simulationResults[metric];
      } else if (candidate[metric] !== undefined) {
        metricScores[metric] = candidate[metric];
      } else {
        // Fallback default placeholder
        metricScores[metric] = null;
      }
    }

    // Call domain evaluation hook if registered
    let compositeScore = 0.5;
    if (this.registry) {
      const hookEvaluation = this.registry.executeHook(
        this.domainId,
        "custom_scoring",
        { candidate, metricScores, simulationResults }
      );
      if (hookEvaluation && typeof hookEvaluation.composite_score === "number") {
        compositeScore = hookEvaluation.composite_score;
      }
    }

    return {
      candidate_id: candidate.id,
      domain_id: this.domainId,
      metric_scores: metricScores,
      composite_score: compositeScore,
      evaluated_at: new Date().toISOString(),
    };
  }

  /**
   * Retrieve the base confidence weight and trust rank for an evidence type in this domain.
   *
   * @param {string} evidenceType
   * @returns {{ trust_rank: number, base_weight: number }}
   */
  getEvidenceInfo(evidenceType) {
    if (this.evidenceWeights.has(evidenceType)) {
      return this.evidenceWeights.get(evidenceType);
    }
    // Default fallback
    return { trust_rank: 1, base_weight: 0.20 };
  }

  /**
   * Get all tools configured for this domain.
   */
  getAvailableTools() {
    if (this.registry) {
      return this.registry.getTools(this.domainId);
    }
    return this.descriptor.tools || [];
  }
}

export default DomainAdapter;
