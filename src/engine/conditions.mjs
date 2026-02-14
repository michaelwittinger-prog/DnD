/**
 * conditions.mjs — MIR S1.2 Condition System.
 *
 * Manages combat conditions with duration tracking:
 *   - stunned: skip turn, -2 AC
 *   - poisoned: disadvantage on attacks (roll twice, take lower)
 *   - prone: melee attacks against have advantage, ranged have disadvantage
 *   - blessed: +2 to attack rolls
 *   - burning: take 1d4 damage at start of turn
 *
 * Conditions are stored in entity.conditions[] as strings.
 * Durations are tracked in entity.conditionDurations = { conditionName: roundsRemaining }
 *
 * All functions are pure — they mutate a pre-cloned state.
 */

import { rollDice } from "./rng.mjs";

/**
 * Known condition definitions.
 * Each defines its mechanical effects for the engine to query.
 */
export const CONDITION_DEFS = {
  dead: { skipTurn: true, permanent: true },
  stunned: { skipTurn: true, acMod: -2, duration: 1 },
  poisoned: { attackDisadvantage: true, duration: 3 },
  prone: { meleeAdvantageAgainst: true, rangedDisadvantageAgainst: true, duration: 0 },
  blessed: { attackMod: 2, duration: 3 },
  burning: { dotDice: [1, 4], dotType: "fire", duration: 3 },
  dodging: { acMod: 2, duration: 1 },  // Defend action: +2 AC until start of next turn
};

/**
 * Apply a condition to an entity.
 * Does NOT check if the condition is already present — caller should check.
 *
 * @param {object} entity — entity to modify (mutated)
 * @param {string} condName — condition name
 * @param {number} [duration] — rounds remaining (0 = until manually removed)
 */
export function applyCondition(entity, condName, duration) {
  if (!entity.conditions.includes(condName)) {
    entity.conditions.push(condName);
  }
  if (!entity.conditionDurations) entity.conditionDurations = {};
  const def = CONDITION_DEFS[condName];
  const dur = duration ?? def?.duration ?? 0;
  if (dur > 0) {
    entity.conditionDurations[condName] = dur;
  }
}

/**
 * Remove a condition from an entity.
 *
 * @param {object} entity
 * @param {string} condName
 */
export function removeCondition(entity, condName) {
  entity.conditions = entity.conditions.filter((c) => c !== condName);
  if (entity.conditionDurations) {
    delete entity.conditionDurations[condName];
  }
}

/**
 * Check if an entity has a condition.
 *
 * @param {object} entity
 * @param {string} condName
 * @returns {boolean}
 */
export function hasCondition(entity, condName) {
  return entity.conditions.includes(condName);
}

/**
 * Process start-of-turn effects for an entity.
 * Called at the beginning of an entity's turn.
 * Handles: burning (DoT damage), etc.
 *
 * @param {object} state — cloned GameState (mutated)
 * @param {string} entityId
 * @returns {{ events: object[] }}
 */
export function processStartOfTurn(state, entityId) {
  const events = [];
  const entity = findEntityMut(state, entityId);
  if (!entity) return { events };

  // Burning: take 1d4 fire damage
  if (hasCondition(entity, "burning")) {
    const def = CONDITION_DEFS.burning;
    const dmgRoll = rollDice(state, def.dotDice[0], def.dotDice[1], `${entity.name} burning damage`);
    state.rng = dmgRoll.nextState.rng;
    const damage = dmgRoll.result;
    entity.stats.hpCurrent = Math.max(0, entity.stats.hpCurrent - damage);

    const eventId = `evt-${(state.log.events.length + 1).toString().padStart(4, "0")}`;
    events.push({
      id: eventId,
      timestamp: state.timestamp,
      type: "CONDITION_DAMAGE",
      payload: {
        entityId,
        condition: "burning",
        damage,
        hpAfter: entity.stats.hpCurrent,
      },
    });
    state.log.events.push(events[events.length - 1]);

    // Check death
    if (entity.stats.hpCurrent === 0 && !entity.conditions.includes("dead")) {
      entity.conditions.push("dead");
    }
  }

  return { events };
}

/**
 * Process end-of-turn condition expiry.
 * Called at the end of an entity's turn.
 * Decrements durations; removes expired conditions.
 *
 * @param {object} state — cloned GameState (mutated)
 * @param {string} entityId
 * @returns {{ expired: string[], events: object[] }}
 */
export function processEndOfTurn(state, entityId) {
  const expired = [];
  const events = [];
  const entity = findEntityMut(state, entityId);
  if (!entity || !entity.conditionDurations) return { expired, events };

  for (const [condName, remaining] of Object.entries(entity.conditionDurations)) {
    if (remaining <= 0) continue; // permanent or manual removal

    const newRemaining = remaining - 1;
    if (newRemaining <= 0) {
      // Condition expires
      removeCondition(entity, condName);
      expired.push(condName);

      const eventId = `evt-${(state.log.events.length + 1).toString().padStart(4, "0")}`;
      const evt = {
        id: eventId,
        timestamp: state.timestamp,
        type: "CONDITION_EXPIRED",
        payload: { entityId, condition: condName },
      };
      events.push(evt);
      state.log.events.push(evt);
    } else {
      entity.conditionDurations[condName] = newRemaining;
    }
  }

  return { expired, events };
}

/**
 * Get the effective AC modifier from conditions.
 *
 * @param {object} entity
 * @returns {number}
 */
export function getAcModifier(entity) {
  let mod = 0;
  for (const cond of entity.conditions) {
    const def = CONDITION_DEFS[cond];
    if (def?.acMod) mod += def.acMod;
  }
  return mod;
}

/**
 * Get the effective attack roll modifier from conditions.
 *
 * @param {object} entity
 * @returns {number}
 */
export function getAttackModifier(entity) {
  let mod = 0;
  for (const cond of entity.conditions) {
    const def = CONDITION_DEFS[cond];
    if (def?.attackMod) mod += def.attackMod;
  }
  return mod;
}

/**
 * Check if an entity has attack disadvantage from conditions.
 *
 * @param {object} entity
 * @returns {boolean}
 */
export function hasAttackDisadvantage(entity) {
  return entity.conditions.some((c) => CONDITION_DEFS[c]?.attackDisadvantage);
}

/**
 * Check if an entity should skip its turn.
 *
 * @param {object} entity
 * @returns {boolean}
 */
export function shouldSkipTurn(entity) {
  return entity.conditions.some((c) => CONDITION_DEFS[c]?.skipTurn);
}

// ── Internal ────────────────────────────────────────────────────────────

function findEntityMut(state, id) {
  const all = [
    ...(state.entities?.players ?? []),
    ...(state.entities?.npcs ?? []),
  ];
  return all.find((e) => e.id === id) || null;
}
