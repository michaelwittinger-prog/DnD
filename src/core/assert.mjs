/**
 * assert.mjs — MIR Runtime Assertion Module.
 *
 * Provides assertions that throw with module + function + what failed.
 * Game errors are returned as data (never thrown) — but programming errors
 * (null state, missing fields, impossible conditions) should crash loud.
 *
 * Usage:
 *   import { mirAssert, mirAssertType, mirAssertDefined } from "../core/assert.mjs";
 *
 *   mirAssert(state != null, "applyAction", "state is null");
 *   mirAssertType(action.type, "string", "applyAction", "action.type");
 *   mirAssertDefined(entity, "applyMove", "entity lookup");
 *
 * All assertions include the function name for fast debugging.
 * In production: these become error reports.
 * In dev: immediate crash with full context.
 */

/**
 * Custom error class for MIR assertion failures.
 * Includes structured context for error tracking.
 */
export class MirAssertionError extends Error {
  /**
   * @param {string} fn — function name where assertion failed
   * @param {string} what — description of what failed
   * @param {*} [actual] — the actual value (optional)
   */
  constructor(fn, what, actual) {
    const msg = `[MIR:${fn}] Assertion failed: ${what}`;
    super(actual !== undefined ? `${msg} (got: ${stringify(actual)})` : msg);
    this.name = "MirAssertionError";
    this.fn = fn;
    this.what = what;
    this.actual = actual;
  }
}

/**
 * Safe stringify for error messages. Handles circular refs and long values.
 * @param {*} value
 * @returns {string}
 */
function stringify(value) {
  if (value === null) return "null";
  if (value === undefined) return "undefined";
  if (typeof value === "string") {
    return value.length > 100 ? `"${value.slice(0, 100)}…"` : `"${value}"`;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `Array(${value.length})`;
  if (typeof value === "object") {
    try {
      const s = JSON.stringify(value);
      return s.length > 100 ? s.slice(0, 100) + "…" : s;
    } catch {
      return "[Object]";
    }
  }
  return String(value);
}

// ── Assertion Functions ─────────────────────────────────────────────────

/**
 * Assert that a condition is truthy.
 *
 * @param {*} condition — value to check (truthy/falsy)
 * @param {string} fn — function name for context
 * @param {string} what — description of what's being asserted
 * @throws {MirAssertionError} if condition is falsy
 */
export function mirAssert(condition, fn, what) {
  if (!condition) {
    throw new MirAssertionError(fn, what);
  }
}

/**
 * Assert that a value is not null or undefined.
 *
 * @param {*} value — value to check
 * @param {string} fn — function name
 * @param {string} what — description
 * @returns {*} — the value (for chaining)
 * @throws {MirAssertionError}
 */
export function mirAssertDefined(value, fn, what) {
  if (value === null || value === undefined) {
    throw new MirAssertionError(fn, `${what} must not be ${value === null ? "null" : "undefined"}`, value);
  }
  return value;
}

/**
 * Assert that a value has the expected type (via typeof).
 *
 * @param {*} value
 * @param {string} expectedType — "string", "number", "object", "boolean", "function"
 * @param {string} fn — function name
 * @param {string} what — description
 * @throws {MirAssertionError}
 */
export function mirAssertType(value, expectedType, fn, what) {
  const actual = typeof value;
  if (actual !== expectedType) {
    throw new MirAssertionError(fn, `${what} must be ${expectedType}, got ${actual}`, value);
  }
}

/**
 * Assert that a value is a non-empty string.
 *
 * @param {*} value
 * @param {string} fn
 * @param {string} what
 * @throws {MirAssertionError}
 */
export function mirAssertNonEmptyString(value, fn, what) {
  if (typeof value !== "string" || value.length === 0) {
    throw new MirAssertionError(fn, `${what} must be a non-empty string`, value);
  }
}

/**
 * Assert that a value is a non-negative integer.
 *
 * @param {*} value
 * @param {string} fn
 * @param {string} what
 * @throws {MirAssertionError}
 */
export function mirAssertNonNegativeInt(value, fn, what) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new MirAssertionError(fn, `${what} must be a non-negative integer`, value);
  }
}

/**
 * Assert that a value is an array.
 *
 * @param {*} value
 * @param {string} fn
 * @param {string} what
 * @throws {MirAssertionError}
 */
export function mirAssertArray(value, fn, what) {
  if (!Array.isArray(value)) {
    throw new MirAssertionError(fn, `${what} must be an array`, value);
  }
}

/**
 * Assert that a value is one of an allowed set.
 *
 * @param {*} value
 * @param {Set|Array} allowed — Set or Array of allowed values
 * @param {string} fn
 * @param {string} what
 * @throws {MirAssertionError}
 */
export function mirAssertOneOf(value, allowed, fn, what) {
  const set = allowed instanceof Set ? allowed : new Set(allowed);
  if (!set.has(value)) {
    throw new MirAssertionError(
      fn,
      `${what} must be one of [${[...set].join(", ")}]`,
      value
    );
  }
}

/**
 * Assert that an array/collection produced at least one result.
 * Useful after engine operations that should always produce events.
 *
 * @param {Array} arr
 * @param {string} fn
 * @param {string} what
 * @throws {MirAssertionError}
 */
export function mirAssertNonEmpty(arr, fn, what) {
  if (!Array.isArray(arr) || arr.length === 0) {
    throw new MirAssertionError(fn, `${what} must be a non-empty array`, arr);
  }
}

/**
 * Unreachable code guard. Call this in switch default cases
 * or impossible branches.
 *
 * @param {string} fn
 * @param {string} what — description of what was unexpected
 * @param {*} [value] — the unexpected value
 * @throws {MirAssertionError}
 */
export function mirUnreachable(fn, what, value) {
  throw new MirAssertionError(fn, `Unreachable: ${what}`, value);
}
