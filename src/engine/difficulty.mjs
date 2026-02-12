/**
 * difficulty.mjs — MIR Tier 5.3 AI Difficulty Presets.
 *
 * Configures NPC combat behavior: aggression, target selection,
 * ability usage, and movement strategy based on difficulty level.
 *
 * Pure functions. No state mutation. No side effects.
 */

/**
 * Available difficulty levels with their behavior modifiers.
 */
export const DIFFICULTY_PRESETS = {
  easy: {
    id: "easy",
    label: "Easy",
    description: "NPCs are cautious and make suboptimal choices.",
    /** Chance (0–1) that NPC attacks vs ends turn when in range */
    attackProbability: 0.6,
    /** Chance (0–1) that NPC uses ability vs basic attack */
    abilityUseProbability: 0.2,
    /** NPC picks random valid target (not weakest) */
    targetSelection: "random",
    /** NPC moves toward nearest enemy (not most strategic) */
    movementStrategy: "nearest",
    /** Bonus/penalty to NPC attack rolls (flat modifier) */
    attackModifier: -1,
    /** Bonus/penalty to NPC damage rolls */
    damageModifier: 0,
    /** NPC AC adjustment */
    acModifier: 0,
    /** NPC HP multiplier (applied when encounter starts) */
    hpMultiplier: 0.8,
  },

  normal: {
    id: "normal",
    label: "Normal",
    description: "NPCs play competently using standard tactics.",
    attackProbability: 1.0,
    abilityUseProbability: 0.5,
    targetSelection: "weakest",
    movementStrategy: "optimal",
    attackModifier: 0,
    damageModifier: 0,
    acModifier: 0,
    hpMultiplier: 1.0,
  },

  hard: {
    id: "hard",
    label: "Hard",
    description: "NPCs are aggressive and make tactically sound decisions.",
    attackProbability: 1.0,
    abilityUseProbability: 0.8,
    targetSelection: "weakest",
    movementStrategy: "optimal",
    attackModifier: 1,
    damageModifier: 1,
    acModifier: 1,
    hpMultiplier: 1.2,
  },

  deadly: {
    id: "deadly",
    label: "Deadly",
    description: "NPCs are ruthless, focus-fire, and exploit weaknesses.",
    attackProbability: 1.0,
    abilityUseProbability: 1.0,
    targetSelection: "lowest_hp",
    movementStrategy: "flank",
    attackModifier: 2,
    damageModifier: 2,
    acModifier: 2,
    hpMultiplier: 1.5,
  },
};

/** Default difficulty if none specified */
const DEFAULT_DIFFICULTY = "normal";

/**
 * Get the difficulty preset for the current game state.
 * Falls back to 'normal' if not set or invalid.
 *
 * @param {object} state — GameState (reads state.difficulty or defaults)
 * @returns {object} — difficulty preset object
 */
export function getDifficulty(state) {
  const id = state?.difficulty || DEFAULT_DIFFICULTY;
  return DIFFICULTY_PRESETS[id] || DIFFICULTY_PRESETS[DEFAULT_DIFFICULTY];
}

/**
 * Get list of all available difficulty presets.
 * @returns {Array<{id: string, label: string, description: string}>}
 */
export function listDifficulties() {
  return Object.values(DIFFICULTY_PRESETS).map(p => ({
    id: p.id,
    label: p.label,
    description: p.description,
  }));
}

/**
 * Apply difficulty HP multiplier to all NPC entities.
 * Used when loading a scenario with a specific difficulty.
 * Returns a new entities object (no mutation).
 *
 * @param {object} entities — state.entities
 * @param {string} difficultyId — "easy" | "normal" | "hard" | "deadly"
 * @returns {object} — new entities object with adjusted NPC HP
 */
export function applyDifficultyToEntities(entities, difficultyId) {
  const preset = DIFFICULTY_PRESETS[difficultyId] || DIFFICULTY_PRESETS[DEFAULT_DIFFICULTY];
  if (preset.hpMultiplier === 1.0) return entities;

  return {
    ...entities,
    npcs: entities.npcs.map(npc => {
      const newMax = Math.max(1, Math.round(npc.stats.hpMax * preset.hpMultiplier));
      const newCurrent = Math.min(npc.stats.hpCurrent, newMax);
      return {
        ...npc,
        stats: {
          ...npc.stats,
          hpMax: newMax,
          hpCurrent: Math.max(1, Math.round(npc.stats.hpCurrent * preset.hpMultiplier)),
        },
      };
    }),
    players: entities.players,
    objects: entities.objects,
  };
}

/**
 * Select a target for an NPC based on difficulty settings.
 *
 * @param {Array} hostiles — array of hostile entities (alive, in range)
 * @param {object} preset — difficulty preset
 * @param {function} [rngFn] — optional RNG function returning 0–1, defaults to Math.random
 * @returns {object|null} — selected target entity or null
 */
export function selectTarget(hostiles, preset, rngFn) {
  if (!hostiles || hostiles.length === 0) return null;
  const rng = rngFn || Math.random;

  const alive = hostiles.filter(h => !h.conditions?.includes("dead"));
  if (alive.length === 0) return null;

  switch (preset.targetSelection) {
    case "random":
      return alive[Math.floor(rng() * alive.length)];

    case "weakest":
      // Target with lowest current HP
      return alive.reduce((a, b) => a.stats.hpCurrent <= b.stats.hpCurrent ? a : b);

    case "lowest_hp":
      // Target with lowest absolute HP (focus fire to eliminate)
      return alive.reduce((a, b) => a.stats.hpCurrent < b.stats.hpCurrent ? a : b);

    default:
      return alive[0];
  }
}

/**
 * Decide whether the NPC should attack or skip (end turn early).
 *
 * @param {object} preset — difficulty preset
 * @param {function} [rngFn] — optional RNG function returning 0–1
 * @returns {boolean} — true if NPC should attack
 */
export function shouldAttack(preset, rngFn) {
  const rng = rngFn || Math.random;
  return rng() < preset.attackProbability;
}

/**
 * Decide whether the NPC should use an ability vs basic attack.
 *
 * @param {object} preset — difficulty preset
 * @param {function} [rngFn] — optional RNG function returning 0–1
 * @returns {boolean} — true if NPC should try to use an ability
 */
export function shouldUseAbility(preset, rngFn) {
  const rng = rngFn || Math.random;
  return rng() < preset.abilityUseProbability;
}

/**
 * Get the attack modifier for the current difficulty.
 * @param {object} preset
 * @returns {number}
 */
export function getAttackDifficultyModifier(preset) {
  return preset?.attackModifier ?? 0;
}

/**
 * Get the damage modifier for the current difficulty.
 * @param {object} preset
 * @returns {number}
 */
export function getDamageDifficultyModifier(preset) {
  return preset?.damageModifier ?? 0;
}

/**
 * Get the AC modifier for the current difficulty.
 * @param {object} preset
 * @returns {number}
 */
export function getAcDifficultyModifier(preset) {
  return preset?.acModifier ?? 0;
}
