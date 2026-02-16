/**
 * intentTypes.mjs — PlayerIntent type definitions and constants.
 *
 * A PlayerIntent represents WHAT the player wants to happen,
 * not HOW to achieve it mechanically. The Intent Planner converts
 * intents into concrete DeclaredActions using game state + rules.
 *
 * Safety: Intents are inert data — they cannot modify state.
 * Only the engine (via DeclaredActions) can change GameState.
 */

// ── Intent Type Constants ────────────────────────────────────────────

/** All recognized intent types. */
export const INTENT_TYPES = Object.freeze({
  /** Move to a specific coordinate */
  MOVE_TO:        "move_to",
  /** Move in a cardinal direction by N cells */
  MOVE_DIRECTION: "move_direction",
  /** Get adjacent to a target entity */
  APPROACH:       "approach",
  /** Maximize distance from a threat */
  FLEE:           "flee",
  /** Basic melee/ranged attack */
  ATTACK:         "attack",
  /** Use a named ability on a target */
  USE_ABILITY:    "use_ability",
  /** Multiple steps in sequence (move then attack, etc.) */
  COMPOUND:       "compound",
  /** End the current turn */
  END_TURN:       "end_turn",
  /** Start combat (roll initiative) */
  START_COMBAT:   "start_combat",
  /** Defend / take defensive posture */
  DEFEND:         "defend",
  /** Player said something we can't interpret */
  UNKNOWN:        "unknown",
});

// ── Target Selector Constants ────────────────────────────────────────

/** Special target selectors resolved by the planner at runtime. */
export const TARGET_SELECTORS = Object.freeze({
  ACTIVE:              "active",           // whoever's turn it is
  SELF:                "self",             // the subject itself
  NEAREST_HOSTILE:     "nearest_hostile",
  WEAKEST_HOSTILE:     "weakest_hostile",
  STRONGEST_HOSTILE:   "strongest_hostile",
  MOST_INJURED_ALLY:   "most_injured_ally",
  NEAREST_ALLY:        "nearest_ally",
});

/** Direction constants for MOVE_DIRECTION intents. */
export const DIRECTIONS = Object.freeze({
  NORTH: "north",  // y - 1
  SOUTH: "south",  // y + 1
  EAST:  "east",   // x + 1
  WEST:  "west",   // x - 1
});

// ── Intent Validation ────────────────────────────────────────────────

const VALID_TYPES = new Set(Object.values(INTENT_TYPES));
const VALID_SELECTORS = new Set(Object.values(TARGET_SELECTORS));
const VALID_DIRECTIONS = new Set(Object.values(DIRECTIONS));

/**
 * Validate a PlayerIntent structure.
 *
 * @param {object} intent
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
export function validateIntent(intent) {
  if (!intent || typeof intent !== "object") {
    return { ok: false, reason: "Intent must be a non-null object" };
  }
  if (!intent.type || !VALID_TYPES.has(intent.type)) {
    return { ok: false, reason: `Unknown intent type: "${intent.type}"` };
  }

  switch (intent.type) {
    case INTENT_TYPES.MOVE_TO:
      if (typeof intent.x !== "number" || typeof intent.y !== "number") {
        return { ok: false, reason: "MOVE_TO requires numeric x, y" };
      }
      break;

    case INTENT_TYPES.MOVE_DIRECTION:
      if (!intent.direction || !VALID_DIRECTIONS.has(intent.direction)) {
        return { ok: false, reason: `MOVE_DIRECTION requires valid direction, got "${intent.direction}"` };
      }
      if (intent.distance !== undefined && (typeof intent.distance !== "number" || intent.distance < 1)) {
        return { ok: false, reason: "MOVE_DIRECTION distance must be >= 1" };
      }
      break;

    case INTENT_TYPES.APPROACH:
      if (!intent.target) {
        return { ok: false, reason: "APPROACH requires a target" };
      }
      break;

    case INTENT_TYPES.ATTACK:
      if (!intent.target) {
        return { ok: false, reason: "ATTACK requires a target" };
      }
      break;

    case INTENT_TYPES.USE_ABILITY:
      if (!intent.ability) {
        return { ok: false, reason: "USE_ABILITY requires an ability name" };
      }
      break;

    case INTENT_TYPES.COMPOUND:
      if (!Array.isArray(intent.steps) || intent.steps.length === 0) {
        return { ok: false, reason: "COMPOUND requires a non-empty steps array" };
      }
      for (let i = 0; i < intent.steps.length; i++) {
        const sub = validateIntent(intent.steps[i]);
        if (!sub.ok) return { ok: false, reason: `COMPOUND step[${i}]: ${sub.reason}` };
      }
      break;

    case INTENT_TYPES.FLEE:
      // from is optional — defaults to nearest_hostile
      break;

    case INTENT_TYPES.END_TURN:
    case INTENT_TYPES.START_COMBAT:
    case INTENT_TYPES.DEFEND:
    case INTENT_TYPES.UNKNOWN:
      break;
  }

  return { ok: true };
}

/**
 * Check if a target string is a tactical selector (resolved at runtime)
 * versus a fuzzy entity name.
 */
export function isTacticalSelector(target) {
  return VALID_SELECTORS.has(target);
}
