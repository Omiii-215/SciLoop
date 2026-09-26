/**
 * SciLoop — Task Queue Worker
 * Phase 3: Distributed Execution
 *
 * Redis-backed task queue for distributing experiments across workers.
 * Each worker process picks up tasks, executes them, and writes results
 * back to Redis and PostgreSQL.
 *
 * Task types:
 *   - molecular_filtering: Run rdkit_filter.py on a batch of SMILES
 *   - molecular_scoring: Run molecule_score.py on filtered candidates
 *   - literature_search: Execute PubMed search via MCP
 *   - structure_retrieval: Fetch structures via MCP
 *   - compound_search: Query ChEMBL via MCP
 *
 * Features:
 *   - Configurable concurrency
 *   - Exponential backoff retry
 *   - Dead letter queue for failed tasks
 *   - Task progress tracking
 *   - Graceful shutdown
 */

import { randomUUID } from "node:crypto";

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────
const CONFIG = {
  redis_url: process.env.REDIS_URL || "redis://localhost:6379",
  concurrency: parseInt(process.env.WORKER_CONCURRENCY || "3", 10),
  queue_name: "sciloop:tasks",
  processing_queue: "sciloop:processing",
  completed_queue: "sciloop:completed",
  failed_queue: "sciloop:failed",
  dead_letter_queue: "sciloop:dead_letter",
  max_retries: 3,
  base_retry_delay_ms: 1000,
  task_timeout_ms: 300000, // 5 minutes
  poll_interval_ms: 1000,
};

// ─────────────────────────────────────────────────────────────────────────────
// Task Queue — In-memory implementation (Redis adapter pattern)
// In production, replace InMemoryQueue with a Redis-backed implementation
// using ioredis or similar. The interface remains identical.
// ─────────────────────────────────────────────────────────────────────────────

export class TaskQueue {
  constructor(config = {}) {
    this.config = { ...CONFIG, ...config };

    /** @type {Array<object>} Pending tasks */
    this.pending = [];

    /** @type {Map<string, object>} Tasks currently being processed */
    this.processing = new Map();

    /** @type {Array<object>} Completed tasks */
    this.completed = [];

    /** @type {Array<object>} Failed tasks (exhausted retries) */
    this.deadLetter = [];

    /** @type {Map<string, Function>} Registered task handlers */
    this.handlers = new Map();

    /** @type {boolean} Whether the worker is running */
    this.running = false;

    /** @type {number} Active concurrent tasks */
    this.activeCount = 0;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Task submission
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Submit a new task to the queue.
   *
   * @param {object} params
   * @param {string} params.type — Task type (must have a registered handler)
   * @param {string} params.campaign_id — Parent campaign
   * @param {object} params.payload — Task-specific input data
   * @param {number} [params.priority=0] — Higher = processed sooner
   * @returns {object} The created task record
   */
  enqueue({ type, campaign_id, payload, priority = 0 }) {
    if (!this.handlers.has(type)) {
      throw new Error(`No handler registered for task type: ${type}`);
    }

    const task = {
      id: randomUUID(),
      type,
      campaign_id,
      payload,
      priority,
      status: "pending",
      attempts: 0,
      max_retries: this.config.max_retries,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      result: null,
      error: null,
    };

    this.pending.push(task);

    // Sort by priority (higher first)
    this.pending.sort((a, b) => b.priority - a.priority);

    return { ...task };
  }

  /**
   * Submit a batch of tasks.
   *
   * @param {object[]} tasks — Array of { type, campaign_id, payload, priority }
   * @returns {object[]} Created task records
   */
  enqueueBatch(tasks) {
    return tasks.map((t) => this.enqueue(t));
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Task handler registration
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Register a handler function for a task type.
   *
   * @param {string} type — Task type name
   * @param {Function} handler — async (payload) => result
   */
  registerHandler(type, handler) {
    this.handlers.set(type, handler);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Worker loop
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Start the worker loop.
   * Continuously polls the queue and processes tasks up to concurrency limit.
   */
  async start() {
    this.running = true;
    console.log(
      `[TaskQueue] Worker started. Concurrency: ${this.config.concurrency}. ` +
      `Handlers: ${[...this.handlers.keys()].join(", ")}`
    );

    while (this.running) {
      // Process tasks up to concurrency limit
      while (this.activeCount < this.config.concurrency && this.pending.length > 0) {
        const task = this.pending.shift();
        if (task) {
          this._processTask(task); // Fire and forget (tracked internally)
        }
      }

      // Poll interval
      await this._sleep(this.config.poll_interval_ms);
    }

    // Wait for active tasks to complete on shutdown
    while (this.activeCount > 0) {
      await this._sleep(100);
    }

    console.log("[TaskQueue] Worker stopped gracefully.");
  }

  /**
   * Stop the worker loop gracefully.
   */
  stop() {
    this.running = false;
    console.log("[TaskQueue] Shutdown requested. Waiting for active tasks...");
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Task processing
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Process a single task with retry logic.
   */
  async _processTask(task) {
    this.activeCount++;
    task.status = "processing";
    task.attempts++;
    task.updated_at = new Date().toISOString();
    this.processing.set(task.id, task);

    const handler = this.handlers.get(task.type);
    const startTime = Date.now();

    try {
      // Execute with timeout
      const result = await this._withTimeout(
        handler(task.payload),
        this.config.task_timeout_ms
      );

      // Success
      task.status = "completed";
      task.result = result;
      task.updated_at = new Date().toISOString();
      task.duration_ms = Date.now() - startTime;

      this.processing.delete(task.id);
      this.completed.push(task);

      console.log(
        `[TaskQueue] ✓ Task ${task.id.slice(0, 8)} (${task.type}) completed in ${task.duration_ms}ms`
      );
    } catch (error) {
      task.error = {
        message: error.message,
        stack: error.stack,
        attempt: task.attempts,
      };
      task.updated_at = new Date().toISOString();
      task.duration_ms = Date.now() - startTime;

      this.processing.delete(task.id);

      if (task.attempts < task.max_retries) {
        // Retry with exponential backoff
        const delay = this.config.base_retry_delay_ms * Math.pow(2, task.attempts - 1);
        console.log(
          `[TaskQueue] ⟳ Task ${task.id.slice(0, 8)} (${task.type}) failed (attempt ${task.attempts}/${task.max_retries}). ` +
          `Retrying in ${delay}ms. Error: ${error.message}`
        );

        task.status = "pending";
        await this._sleep(delay);
        this.pending.unshift(task); // Re-queue at front
      } else {
        // Exhausted retries — send to dead letter queue
        task.status = "dead_letter";
        this.deadLetter.push(task);
        console.error(
          `[TaskQueue] ✗ Task ${task.id.slice(0, 8)} (${task.type}) failed permanently after ${task.max_retries} attempts. ` +
          `Error: ${error.message}`
        );
      }
    } finally {
      this.activeCount--;
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Queue status
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Get current queue statistics.
   * @returns {object}
   */
  getStats() {
    return {
      pending: this.pending.length,
      processing: this.processing.size,
      completed: this.completed.length,
      dead_letter: this.deadLetter.length,
      active_workers: this.activeCount,
      max_concurrency: this.config.concurrency,
      registered_handlers: [...this.handlers.keys()],
    };
  }

  /**
   * Get tasks by campaign ID.
   * @param {string} campaignId
   * @returns {object}
   */
  getTasksByCampaign(campaignId) {
    const filterByCampaign = (tasks) =>
      tasks.filter((t) => t.campaign_id === campaignId);

    return {
      pending: filterByCampaign(this.pending),
      processing: filterByCampaign([...this.processing.values()]),
      completed: filterByCampaign(this.completed),
      dead_letter: filterByCampaign(this.deadLetter),
    };
  }

  /**
   * Get a specific task by ID.
   * @param {string} taskId
   * @returns {object | null}
   */
  getTask(taskId) {
    return (
      this.pending.find((t) => t.id === taskId) ||
      this.processing.get(taskId) ||
      this.completed.find((t) => t.id === taskId) ||
      this.deadLetter.find((t) => t.id === taskId) ||
      null
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────────────

  _sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  _withTimeout(promise, ms) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Task timed out after ${ms}ms`)), ms);
      promise
        .then((result) => { clearTimeout(timer); resolve(result); })
        .catch((error) => { clearTimeout(timer); reject(error); });
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Default task handlers for SciLoop experiment types
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_HANDLERS = {
  /**
   * Molecular filtering task — batch SMILES through rdkit_filter.py
   */
  molecular_filtering: async (payload) => {
    const { smiles_list } = payload;
    // In production: execute rdkit_filter.py via sandbox API
    return {
      experiment_type: "molecular_filtering",
      input_count: smiles_list.length,
      status: "completed",
      note: "Task handler stub — replace with actual sandbox execution",
    };
  },

  /**
   * Molecular scoring task — score filtered candidates
   */
  molecular_scoring: async (payload) => {
    const { candidates } = payload;
    return {
      experiment_type: "molecular_scoring",
      input_count: candidates.length,
      status: "completed",
      note: "Task handler stub — replace with actual sandbox execution",
    };
  },

  /**
   * Literature search task — search PubMed for evidence
   */
  literature_search: async (payload) => {
    const { query, max_results } = payload;
    return {
      experiment_type: "literature_search",
      query,
      max_results,
      status: "completed",
      note: "Task handler stub — replace with MCP tool call",
    };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Worker entrypoint
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const queue = new TaskQueue();

  // Register default handlers
  for (const [type, handler] of Object.entries(DEFAULT_HANDLERS)) {
    queue.registerHandler(type, handler);
  }

  // Graceful shutdown
  process.on("SIGTERM", () => queue.stop());
  process.on("SIGINT", () => queue.stop());

  console.log("[TaskQueue] SciLoop Task Worker starting...");
  console.log(`[TaskQueue] Redis URL: ${CONFIG.redis_url}`);
  console.log(`[TaskQueue] Concurrency: ${CONFIG.concurrency}`);

  await queue.start();
}

// Run if executed directly
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop())) {
  main().catch(console.error);
}

export default TaskQueue;
