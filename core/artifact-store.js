/**
 * SciLoop — Artifact Store
 * Phase 3: Distributed Execution
 *
 * Manages storage of large scientific artifacts in object storage (MinIO/S3).
 * Artifacts include: structure files, molecule sets, reports, experiment logs.
 *
 * Features:
 *   - Content-addressed storage (SHA-256 hash keys)
 *   - Metadata tagging for provenance
 *   - Lifecycle management (TTL, archival)
 *   - Campaign-scoped namespacing
 */

import { randomUUID, createHash } from "node:crypto";

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────
const CONFIG = {
  endpoint: process.env.MINIO_ENDPOINT || "localhost",
  port: parseInt(process.env.MINIO_PORT || "9000", 10),
  access_key: process.env.MINIO_ACCESS_KEY || "sciloop",
  secret_key: process.env.MINIO_SECRET_KEY || "sciloop_dev_secret",
  use_ssl: process.env.MINIO_USE_SSL === "true",
  default_bucket: "artifacts",
};

// ─────────────────────────────────────────────────────────────────────────────
// Bucket layout
// ─────────────────────────────────────────────────────────────────────────────
const BUCKETS = {
  structures: "structures",   // PDB files, CIF files, AlphaFold predictions
  molecules: "molecules",     // SMILES lists, SDF files, filtered sets
  reports: "reports",         // Generated research reports
  logs: "logs",               // Experiment execution logs
  artifacts: "artifacts",     // General artifacts
};

export class ArtifactStore {
  constructor(config = {}) {
    this.config = { ...CONFIG, ...config };

    /**
     * In-memory store for local development.
     * In production, replace with MinIO/S3 client (e.g., minio-js).
     * @type {Map<string, { data: Buffer|string, metadata: object }>}
     */
    this.store = new Map();

    /** @type {Array<object>} Audit log of all storage operations */
    this.auditLog = [];
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Store operations
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Store an artifact with content-addressed key.
   *
   * @param {object} params
   * @param {string} params.bucket — Target bucket ('structures', 'molecules', 'reports', etc.)
   * @param {string} params.campaign_id — Parent campaign
   * @param {string|Buffer} params.data — Artifact content
   * @param {string} params.content_type — MIME type (e.g., 'application/json', 'chemical/x-pdb')
   * @param {object} [params.metadata={}] — Additional metadata tags
   * @param {number} [params.ttl_days] — Time-to-live in days (null = permanent)
   * @returns {object} Storage record with key, hash, and URL
   */
  async put({ bucket, campaign_id, data, content_type, metadata = {}, ttl_days = null }) {
    const bucketName = BUCKETS[bucket] || bucket;
    const dataStr = typeof data === "string" ? data : data.toString("utf-8");

    // Content-addressed key
    const contentHash = createHash("sha256").update(dataStr).digest("hex");
    const key = `${campaign_id}/${contentHash.slice(0, 16)}`;
    const fullKey = `${bucketName}/${key}`;

    // Store with metadata
    const record = {
      key: fullKey,
      bucket: bucketName,
      campaign_id,
      content_hash: contentHash,
      content_type,
      size_bytes: Buffer.byteLength(dataStr, "utf-8"),
      metadata: {
        ...metadata,
        campaign_id,
        content_hash: contentHash,
        stored_at: new Date().toISOString(),
        ttl_days,
        expires_at: ttl_days
          ? new Date(Date.now() + ttl_days * 86400000).toISOString()
          : null,
      },
      created_at: new Date().toISOString(),
    };

    this.store.set(fullKey, { data: dataStr, metadata: record.metadata });

    this._logOperation("put", record);

    return {
      key: fullKey,
      content_hash: contentHash,
      size_bytes: record.size_bytes,
      url: `${this.config.use_ssl ? "https" : "http"}://${this.config.endpoint}:${this.config.port}/${fullKey}`,
      metadata: record.metadata,
    };
  }

  /**
   * Retrieve an artifact by key.
   *
   * @param {string} key — Full artifact key (bucket/campaign_id/hash)
   * @returns {object | null} { data, metadata } or null if not found
   */
  async get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;

    // Check TTL
    if (entry.metadata.expires_at && new Date(entry.metadata.expires_at) < new Date()) {
      this.store.delete(key);
      return null;
    }

    this._logOperation("get", { key });
    return { data: entry.data, metadata: entry.metadata };
  }

  /**
   * Check if an artifact exists (by content hash).
   * Enables deduplication — don't store the same content twice.
   *
   * @param {string} bucket
   * @param {string} campaignId
   * @param {string} contentHash — SHA-256 hash
   * @returns {string | null} Key if exists, null otherwise
   */
  async exists(bucket, campaignId, contentHash) {
    const bucketName = BUCKETS[bucket] || bucket;
    const key = `${bucketName}/${campaignId}/${contentHash.slice(0, 16)}`;
    return this.store.has(key) ? key : null;
  }

  /**
   * List all artifacts in a bucket for a campaign.
   *
   * @param {string} bucket
   * @param {string} campaignId
   * @returns {object[]} List of artifact metadata records
   */
  async list(bucket, campaignId) {
    const bucketName = BUCKETS[bucket] || bucket;
    const prefix = `${bucketName}/${campaignId}/`;
    const results = [];

    for (const [key, entry] of this.store) {
      if (key.startsWith(prefix)) {
        results.push({
          key,
          ...entry.metadata,
        });
      }
    }

    return results;
  }

  /**
   * Delete an artifact by key.
   *
   * @param {string} key
   * @returns {boolean} Whether the artifact was deleted
   */
  async delete(key) {
    const existed = this.store.delete(key);
    if (existed) {
      this._logOperation("delete", { key });
    }
    return existed;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Convenience methods for common artifact types
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Store a protein structure file (PDB/CIF).
   */
  async storeStructure(campaignId, pdbId, structureData, format = "pdb") {
    return this.put({
      bucket: "structures",
      campaign_id: campaignId,
      data: structureData,
      content_type: format === "pdb" ? "chemical/x-pdb" : "chemical/x-cif",
      metadata: { pdb_id: pdbId, format, artifact_type: "protein_structure" },
    });
  }

  /**
   * Store a molecule set (SMILES list or SDF).
   */
  async storeMoleculeSet(campaignId, molecules, label = "candidates") {
    const data = JSON.stringify(molecules, null, 2);
    return this.put({
      bucket: "molecules",
      campaign_id: campaignId,
      data,
      content_type: "application/json",
      metadata: { label, count: molecules.length, artifact_type: "molecule_set" },
    });
  }

  /**
   * Store a research report.
   */
  async storeReport(campaignId, reportContent, reportType = "final") {
    return this.put({
      bucket: "reports",
      campaign_id: campaignId,
      data: reportContent,
      content_type: "text/markdown",
      metadata: { report_type: reportType, artifact_type: "research_report" },
    });
  }

  /**
   * Store an experiment execution log.
   */
  async storeLog(campaignId, experimentId, logContent) {
    return this.put({
      bucket: "logs",
      campaign_id: campaignId,
      data: typeof logContent === "string" ? logContent : JSON.stringify(logContent, null, 2),
      content_type: "application/json",
      metadata: { experiment_id: experimentId, artifact_type: "experiment_log" },
      ttl_days: 90, // Logs expire after 90 days
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Lifecycle management
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Clean up expired artifacts.
   * @returns {number} Number of artifacts cleaned
   */
  async cleanExpired() {
    const now = new Date();
    let cleaned = 0;

    for (const [key, entry] of this.store) {
      if (entry.metadata.expires_at && new Date(entry.metadata.expires_at) < now) {
        this.store.delete(key);
        this._logOperation("expired", { key });
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Get storage statistics.
   * @returns {object}
   */
  getStats() {
    let totalSize = 0;
    const bucketCounts = {};

    for (const [key, entry] of this.store) {
      totalSize += Buffer.byteLength(entry.data, "utf-8");
      const bucket = key.split("/")[0];
      bucketCounts[bucket] = (bucketCounts[bucket] || 0) + 1;
    }

    return {
      total_artifacts: this.store.size,
      total_size_bytes: totalSize,
      total_size_mb: Math.round((totalSize / 1024 / 1024) * 100) / 100,
      by_bucket: bucketCounts,
      operations_logged: this.auditLog.length,
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Internal
  // ─────────────────────────────────────────────────────────────────────────

  _logOperation(operation, details) {
    this.auditLog.push({
      operation,
      details,
      timestamp: new Date().toISOString(),
    });
  }
}

export default ArtifactStore;
