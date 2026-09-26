/**
 * SciLoop — General Scientific Engine: Reproducibility Engine
 * Phase 7: General Scientific Engine
 *
 * Tracks, guarantees, and audits computational reproducibility across all experiments.
 *
 * Responsibilities:
 *   - Capture execution provenance: container image digest, git commit, random seed,
 *     hardware/OS configuration, and full input parameters
 *   - Compute cryptographic SHA-256 hashes of inputs, parameters, and outputs
 *   - Audit and compare runs for exact or statistical reproducibility
 *   - Generate standalone replay bundles (Docker CLI, seed, configs)
 *   - Detect simulation drift and numerical divergence across hardware architectures
 */

import { createHash, randomUUID } from "node:crypto";

export class ReproducibilityEngine {
  constructor() {
    /** @type {Map<string, object>} Run ID → reproducibility record */
    this.records = new Map();

    /** @type {Array<object>} History of verification events */
    this.auditLog = [];
  }

  /**
   * Deterministically hash any serializable object using SHA-256.
   * Keys are sorted recursively to guarantee hash stability.
   */
  static computeCanonicalHash(data) {
    if (data === null || data === undefined) {
      return createHash("sha256").update("null").digest("hex");
    }

    const sortObject = (obj) => {
      if (typeof obj !== "object" || obj === null) {
        return obj;
      }
      if (Array.isArray(obj)) {
        return obj.map(sortObject);
      }
      return Object.keys(obj)
        .sort()
        .reduce((acc, key) => {
          acc[key] = sortObject(obj[key]);
          return acc;
        }, {});
    };

    const canonicalJson = JSON.stringify(sortObject(data));
    return createHash("sha256").update(canonicalJson).digest("hex");
  }

  /**
   * Register an experimental run with complete provenance metadata.
   *
   * @param {object} params
   * @param {string} params.campaign_id
   * @param {string} params.experiment_id
   * @param {string} params.experiment_type
   * @param {object} params.input_data — Input candidate, structures, or datasets
   * @param {object} params.parameters — Hyperparameters, grid box, steps, temperature, etc.
   * @param {number} params.random_seed — Random generator seed
   * @param {string} [params.container_image] — Docker image tag or digest
   * @param {string} [params.git_commit] — Git commit SHA
   * @param {object} [params.output_data] — Resulting metrics, poses, trajectories
   * @param {object} [params.hardware_info] — OS, CPU architecture, GPU model
   * @returns {object} Stored reproducibility record
   */
  registerRun({
    campaign_id,
    experiment_id,
    experiment_type,
    input_data,
    parameters,
    random_seed = 42,
    container_image = "sciloop/engine:latest",
    git_commit = "unknown",
    output_data = {},
    hardware_info = {},
  }) {
    const runId = randomUUID();
    const inputHash = ReproducibilityEngine.computeCanonicalHash(input_data);
    const parameterHash = ReproducibilityEngine.computeCanonicalHash(parameters);
    const outputHash = ReproducibilityEngine.computeCanonicalHash(output_data);

    // Combined execution fingerprint
    const fingerprintString = `${inputHash}:${parameterHash}:${container_image}:${git_commit}:${random_seed}`;
    const executionFingerprint = createHash("sha256").update(fingerprintString).digest("hex");

    const record = {
      run_id: runId,
      campaign_id,
      experiment_id,
      experiment_type,
      random_seed,
      container_image,
      git_commit,
      hashes: {
        input_hash: inputHash,
        parameter_hash: parameterHash,
        output_hash: outputHash,
        execution_fingerprint: executionFingerprint,
      },
      provenance: {
        input_data,
        parameters,
        output_data,
        hardware_info: {
          platform: process.platform,
          arch: process.arch,
          node_version: process.version,
          ...hardware_info,
        },
      },
      created_at: new Date().toISOString(),
    };

    this.records.set(runId, record);

    this.auditLog.push({
      event: "run_registered",
      run_id: runId,
      fingerprint: executionFingerprint,
      timestamp: record.created_at,
    });

    return record;
  }

  /**
   * Compare two execution runs for reproducibility.
   *
   * @param {string} originalRunId
   * @param {string} replicationRunId
   * @param {object} [options]
   * @param {number} [options.numerical_tolerance=0.01] Max acceptable relative difference for float outputs
   * @returns {object} Comparison outcome
   */
  compareRuns(originalRunId, replicationRunId, options = {}) {
    const orig = this.records.get(originalRunId);
    const repl = this.records.get(replicationRunId);

    if (!orig || !repl) {
      throw new Error(`One or both runs not found: ${originalRunId}, ${replicationRunId}`);
    }

    const tolerance = options.numerical_tolerance ?? 0.01;
    const sameInputs = orig.hashes.input_hash === repl.hashes.input_hash;
    const sameParameters = orig.hashes.parameter_hash === repl.hashes.parameter_hash;
    const sameSeed = orig.random_seed === repl.random_seed;
    const sameContainer = orig.container_image === repl.container_image;
    const sameOutputHash = orig.hashes.output_hash === repl.hashes.output_hash;

    // Compare continuous metrics
    const metricComparisons = {};
    let allWithinTolerance = true;
    const origOutputs = orig.provenance.output_data || {};
    const replOutputs = repl.provenance.output_data || {};

    const allKeys = new Set([...Object.keys(origOutputs), ...Object.keys(replOutputs)]);
    for (const key of allKeys) {
      const v1 = origOutputs[key];
      const v2 = replOutputs[key];

      if (typeof v1 === "number" && typeof v2 === "number") {
        const delta = Math.abs(v1 - v2);
        const relDiff = v1 !== 0 ? delta / Math.abs(v1) : delta;
        const within = relDiff <= tolerance;
        if (!within) allWithinTolerance = false;

        metricComparisons[key] = {
          original: v1,
          replication: v2,
          absolute_delta: delta,
          relative_difference: Math.round(relDiff * 10000) / 10000,
          within_tolerance: within,
        };
      }
    }

    let status = "divergent";
    if (sameOutputHash) {
      status = "bit_exact";
    } else if (sameInputs && sameParameters && sameSeed && allWithinTolerance) {
      status = "statistically_reproduced";
    } else if (!sameInputs || !sameParameters) {
      status = "configuration_mismatch";
    }

    const result = {
      original_run_id: originalRunId,
      replication_run_id: replicationRunId,
      status,
      is_reproduced: status === "bit_exact" || status === "statistically_reproduced",
      comparisons: {
        same_inputs: sameInputs,
        same_parameters: sameParameters,
        same_seed: sameSeed,
        same_container: sameContainer,
        same_output_hash: sameOutputHash,
      },
      metric_comparisons: metricComparisons,
      tolerance_used: tolerance,
      compared_at: new Date().toISOString(),
    };

    return result;
  }

  /**
   * Generate an execution replay bundle to run the experiment in an identical container.
   *
   * @param {string} runId
   * @returns {object} Replay bundle with runnable CLI command and configuration
   */
  generateReplayBundle(runId) {
    const record = this.records.get(runId);
    if (!record) {
      throw new Error(`Run not found: ${runId}`);
    }

    const dockerCommand = [
      "docker run --rm",
      `--env SCILOOP_SEED=${record.random_seed}`,
      `--env SCILOOP_RUN_ID=${record.run_id}`,
      `-v $(pwd)/inputs:/workspace/inputs`,
      `-v $(pwd)/outputs:/workspace/outputs`,
      record.container_image,
      `python /app/runner.py --experiment-type ${record.experiment_type} --params /workspace/inputs/params.json`,
    ].join(" ");

    return {
      run_id: runId,
      docker_command: dockerCommand,
      input_hash: record.hashes.input_hash,
      parameter_hash: record.hashes.parameter_hash,
      random_seed: record.random_seed,
      container_image: record.container_image,
      git_commit: record.git_commit,
      input_data: record.provenance.input_data,
      parameters: record.provenance.parameters,
      created_at: new Date().toISOString(),
    };
  }

  /**
   * Get run record by ID.
   */
  getRun(runId) {
    return this.records.get(runId) || null;
  }
}

export default ReproducibilityEngine;
