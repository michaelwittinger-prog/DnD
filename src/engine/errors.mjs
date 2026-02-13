/**
 * errors.mjs — MIR 1.3 Structured error codes.
 *
 * Game errors are returned as data, never thrown.
 */

export const ErrorCode = Object.freeze({
  INVALID_ACTION:   "INVALID_ACTION",
  OUT_OF_RANGE:     "OUT_OF_RANGE",
  BLOCKED_CELL:     "BLOCKED_CELL",
  NOT_YOUR_TURN:    "NOT_YOUR_TURN",
  DEAD_ENTITY:      "DEAD_ENTITY",
  SCHEMA_INVALID:   "SCHEMA_INVALID",
  INVARIANT_FAILED: "INVARIANT_FAILED",
  ENTITY_NOT_FOUND: "ENTITY_NOT_FOUND",
  OVERLAP:          "OVERLAP",
  DIAGONAL_MOVE:    "DIAGONAL_MOVE",
  COMBAT_NOT_ACTIVE:"COMBAT_NOT_ACTIVE",
  COMBAT_ALREADY:   "COMBAT_ALREADY_ACTIVE",
  NO_PARTICIPANTS:  "NO_PARTICIPANTS",
  SELF_ATTACK:      "SELF_ATTACK",
  TARGET_DEAD:      "TARGET_DEAD",
  PATH_EMPTY:       "PATH_EMPTY",
  POST_INVARIANT:   "POST_INVARIANT_FAILED",
  BUDGET_EXHAUSTED: "BUDGET_EXHAUSTED",
});

/**
 * Build a structured error.
 * @param {string} code — one of ErrorCode values
 * @param {string} message
 * @returns {{ code: string, message: string }}
 */
export function makeError(code, message) {
  return { code, message };
}
