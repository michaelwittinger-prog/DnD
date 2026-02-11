/**
 * logger.mjs — MIR Structured Logger.
 *
 * Replaces ad-hoc console.log with structured, filterable log entries.
 *
 * Every log entry includes:
 *   - timestamp (ISO 8601)
 *   - level (debug | info | warn | error)
 *   - module (engine | ai | ui | state | core | ws | persistence)
 *   - event (machine-readable string: "MOVE_VALIDATED", "AI_CALL_START")
 *   - payload (structured data)
 *   - correlationId (optional, ties logs in one action chain)
 *   - durationMs (optional, for timed operations)
 *
 * Usage:
 *   import { createLogger } from "../core/logger.mjs";
 *   const log = createLogger("engine");
 *   log.info("MOVE_VALIDATED", { entityId: "pc-seren", path: [...] });
 *   log.error("INVARIANT_FAILED", { errors: [...] });
 *   log.debug("STATE_CLONED", { hash: "abc123" });
 *
 * Configuration:
 *   setLogLevel("warn");    // suppress debug + info
 *   setLogSink(customFn);   // redirect output (testing, file, remote)
 *   muteAll();              // silence everything (tests)
 *   unmuteAll();            // restore output
 */

// ── Log Levels ──────────────────────────────────────────────────────────

const LEVELS = Object.freeze({
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
});

const LEVEL_NAMES = Object.freeze(["debug", "info", "warn", "error", "silent"]);

// ── Global State ────────────────────────────────────────────────────────

let currentLevel = LEVELS.info;
let muted = false;

/**
 * Default sink: writes to console with level-appropriate method.
 * @param {object} entry — structured log entry
 */
function defaultSink(entry) {
  const method = entry.level === "error" ? "error"
    : entry.level === "warn" ? "warn"
    : entry.level === "debug" ? "debug"
    : "log";
  const prefix = `[${entry.module}] ${entry.event}`;
  const meta = entry.correlationId ? ` cid=${entry.correlationId}` : "";
  const dur = entry.durationMs != null ? ` (${entry.durationMs}ms)` : "";
  console[method](`${prefix}${meta}${dur}`, entry.payload ?? "");
}

let sink = defaultSink;

// ── Configuration API ───────────────────────────────────────────────────

/**
 * Set the minimum log level. Messages below this level are suppressed.
 * @param {"debug"|"info"|"warn"|"error"|"silent"} level
 */
export function setLogLevel(level) {
  if (!(level in LEVELS)) {
    throw new Error(`Invalid log level: "${level}". Valid: ${LEVEL_NAMES.join(", ")}`);
  }
  currentLevel = LEVELS[level];
}

/**
 * Get the current log level name.
 * @returns {string}
 */
export function getLogLevel() {
  return LEVEL_NAMES[currentLevel];
}

/**
 * Replace the log sink function. Useful for testing or remote logging.
 * @param {function} fn — receives a structured log entry object
 */
export function setLogSink(fn) {
  if (typeof fn !== "function") throw new Error("Log sink must be a function");
  sink = fn;
}

/**
 * Reset the log sink to the default console output.
 */
export function resetLogSink() {
  sink = defaultSink;
}

/**
 * Mute all log output (e.g. during tests).
 */
export function muteAll() {
  muted = true;
}

/**
 * Unmute log output.
 */
export function unmuteAll() {
  muted = false;
}

// ── Core Emit ───────────────────────────────────────────────────────────

/**
 * Emit a structured log entry.
 * @param {string} level
 * @param {string} module
 * @param {string} event
 * @param {object} [payload]
 * @param {object} [opts]
 * @param {string} [opts.correlationId]
 * @param {number} [opts.durationMs]
 */
function emit(level, module, event, payload, opts) {
  if (muted) return;
  if (LEVELS[level] < currentLevel) return;

  const entry = {
    timestamp: new Date().toISOString(),
    level,
    module,
    event,
    ...(payload !== undefined && payload !== null ? { payload } : {}),
    ...(opts?.correlationId ? { correlationId: opts.correlationId } : {}),
    ...(opts?.durationMs != null ? { durationMs: opts.durationMs } : {}),
  };

  sink(entry);
}

// ── Logger Factory ──────────────────────────────────────────────────────

/**
 * Valid module names for structured logging.
 */
const VALID_MODULES = new Set([
  "engine", "ai", "ui", "state", "core", "ws", "persistence",
  "replay", "scenario", "pipeline", "server", "validation",
]);

/**
 * Create a logger bound to a specific module.
 *
 * @param {string} module — module name (e.g. "engine", "ai", "state")
 * @returns {{ debug, info, warn, error, timed }}
 */
export function createLogger(module) {
  if (!VALID_MODULES.has(module)) {
    throw new Error(
      `Invalid logger module: "${module}". Valid: ${[...VALID_MODULES].join(", ")}`
    );
  }

  return {
    /**
     * Debug-level log. Suppressed at info level and above.
     * @param {string} event
     * @param {object} [payload]
     * @param {object} [opts]
     */
    debug(event, payload, opts) {
      emit("debug", module, event, payload, opts);
    },

    /**
     * Info-level log. Default visible level.
     * @param {string} event
     * @param {object} [payload]
     * @param {object} [opts]
     */
    info(event, payload, opts) {
      emit("info", module, event, payload, opts);
    },

    /**
     * Warning-level log.
     * @param {string} event
     * @param {object} [payload]
     * @param {object} [opts]
     */
    warn(event, payload, opts) {
      emit("warn", module, event, payload, opts);
    },

    /**
     * Error-level log.
     * @param {string} event
     * @param {object} [payload]
     * @param {object} [opts]
     */
    error(event, payload, opts) {
      emit("error", module, event, payload, opts);
    },

    /**
     * Execute an async or sync function and log its duration.
     * Returns the function's result.
     *
     * @param {string} event
     * @param {function} fn — sync or async function to time
     * @param {object} [payload] — additional log payload
     * @param {object} [opts]
     * @returns {*} — result of fn()
     */
    async timed(event, fn, payload, opts) {
      const t0 = Date.now();
      try {
        const result = await fn();
        const durationMs = Date.now() - t0;
        emit("info", module, event, { ...payload, status: "ok" }, { ...opts, durationMs });
        return result;
      } catch (err) {
        const durationMs = Date.now() - t0;
        emit("error", module, event, { ...payload, status: "error", error: err.message }, { ...opts, durationMs });
        throw err;
      }
    },
  };
}

// ── Correlation ID Helper ───────────────────────────────────────────────

let cidCounter = 0;

/**
 * Generate a unique correlation ID for tracing an action chain.
 * @param {string} [prefix="cid"]
 * @returns {string}
 */
export function correlationId(prefix = "cid") {
  cidCounter++;
  return `${prefix}-${Date.now()}-${cidCounter}`;
}
