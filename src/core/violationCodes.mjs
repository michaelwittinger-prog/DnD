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

  // ── Combat ───────────────────────────────────────────────────────────
  COMBAT_ALREADY_ACTIVE:        "COMBAT_ALREADY_ACTIVE",
  COMBAT_NOT_ACTIVE:            "COMBAT_NOT_ACTIVE",
  COMBAT_PARTICIPANT_NOT_FOUND: "COMBAT_PARTICIPANT_NOT_FOUND",
  COMBAT_TOO_FEW_PARTICIPANTS:  "COMBAT_TOO_FEW_PARTICIPANTS",
  NOT_YOUR_TURN:                "NOT_YOUR_TURN",
  END_TURN_WRONG_ENTITY:        "END_TURN_WRONG_ENTITY",

  // ── Unknown operations ───────────────────────────────────────────────
  UNKNOWN_MAP_OP:               "UNKNOWN_MAP_OP",
  UNKNOWN_STATE_OP:             "UNKNOWN_STATE_OP",

  // ── Tactical events (Phase 6.1) ─────────────────────────────────────
  TACTICAL_DUPLICATE_EVENT_ID:  "TACTICAL_DUPLICATE_EVENT_ID",
  TACTICAL_ACTOR_NOT_FOUND:     "TACTICAL_ACTOR_NOT_FOUND",
  TACTICAL_TARGET_NOT_FOUND:    "TACTICAL_TARGET_NOT_FOUND",
  TACTICAL_MOVE_MISSING_POS:    "TACTICAL_MOVE_MISSING_POS",
  TACTICAL_DAMAGE_MISSING_TARGET: "TACTICAL_DAMAGE_MISSING_TARGET",
  TACTICAL_DAMAGE_NEGATIVE:     "TACTICAL_DAMAGE_NEGATIVE",
  TACTICAL_STATUS_MISSING:      "TACTICAL_STATUS_MISSING",
  TACTICAL_STATUS_DURATION:     "TACTICAL_STATUS_DURATION",
  TACTICAL_TURN_HAS_MOVEMENT:   "TACTICAL_TURN_HAS_MOVEMENT",
  TACTICAL_TURN_HAS_DAMAGE:     "TACTICAL_TURN_HAS_DAMAGE",
  TACTICAL_HP_BELOW_ZERO:       "TACTICAL_HP_BELOW_ZERO",
  TACTICAL_POSITION_COLLISION:  "TACTICAL_POSITION_COLLISION",
});

/** All codes as a Set for quick membership checks. */
export const ALL_CODES = new Set(Object.values(V));
