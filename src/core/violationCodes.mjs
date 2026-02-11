/**
 * violationCodes.mjs — Unified registry of all violation codes.
 *
 * Every failure code in the system MUST be defined here.
 * No hard-coded string codes elsewhere.
 *
 * Convention: CATEGORY_DETAIL (uppercase, underscored).
 */

export const V = Object.freeze({
  // ── Schema & AI boundary ─────────────────────────────────────────────
  AI_RESPONSE_SCHEMA_INVALID:   "AI_RESPONSE_SCHEMA_INVALID",
  UNKNOWN_ENTITY_ID:            "UNKNOWN_ENTITY_ID",
  ILLEGAL_AI_STATE_MUTATION:    "ILLEGAL_AI_STATE_MUTATION",

  // ── Move entity ──────────────────────────────────────────────────────
  MOVE_ENTITY_NOT_FOUND:        "MOVE_ENTITY_NOT_FOUND",
  MOVE_OUT_OF_BOUNDS:           "MOVE_OUT_OF_BOUNDS",
  MOVE_TILE_OCCUPIED:           "MOVE_TILE_OCCUPIED",
  MOVE_EXCEEDS_BUDGET:          "MOVE_EXCEEDS_BUDGET",
  MOVE_DUPLICATE:               "MOVE_DUPLICATE",

  // ── Spawn entity ─────────────────────────────────────────────────────
  SPAWN_MISSING_ENTITY:         "SPAWN_MISSING_ENTITY",
  SPAWN_NO_GM_AUTHORITY:        "SPAWN_NO_GM_AUTHORITY",
  SPAWN_OUT_OF_BOUNDS:          "SPAWN_OUT_OF_BOUNDS",
  SPAWN_TILE_OCCUPIED:          "SPAWN_TILE_OCCUPIED",
  SPAWN_DUPLICATE_ID:           "SPAWN_DUPLICATE_ID",

  // ── Remove entity ────────────────────────────────────────────────────
  REMOVE_ENTITY_NOT_FOUND:      "REMOVE_ENTITY_NOT_FOUND",
  REMOVE_NOT_DEAD_NO_GM:        "REMOVE_NOT_DEAD_NO_GM",

  // ── Set HP ───────────────────────────────────────────────────────────
  SET_HP_ENTITY_NOT_FOUND:      "SET_HP_ENTITY_NOT_FOUND",
  SET_HP_INVALID:               "SET_HP_INVALID",
  SET_HP_INCREASE_FORBIDDEN:    "SET_HP_INCREASE_FORBIDDEN",

  // ── Log ──────────────────────────────────────────────────────────────
  LOG_MISSING_EVENT:            "LOG_MISSING_EVENT",
  LOG_DUPLICATE_ID:             "LOG_DUPLICATE_ID",

  // ── Turn ─────────────────────────────────────────────────────────────
  ADVANCE_TURN_DUPLICATE:       "ADVANCE_TURN_DUPLICATE",

  // ── Unknown operations ───────────────────────────────────────────────
  UNKNOWN_MAP_OP:               "UNKNOWN_MAP_OP",
  UNKNOWN_STATE_OP:             "UNKNOWN_STATE_OP",
});

/** All codes as a Set for quick membership checks. */
export const ALL_CODES = new Set(Object.values(V));
