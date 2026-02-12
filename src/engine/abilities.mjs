/**
 * abilities.mjs — MIR S1.1 Ability System.
 *
 * Defines abilities and handles USE_ABILITY action type.
 * Three starter abilities:
 *   - firebolt: Ranged attack (range 6), 1d10 fire damage
 *   - healing_word: Heal ally (range 4), 1d6 HP restored
 *   - sneak_attack: Melee (range 1), 2d6 extra damage (requires adjacent)
 *
 * All functions are pure — they mutate a pre-cloned state.
 */

import { rollD20, rollDice } from "./rng.mjs";
import { ErrorCode, makeError } from "./errors.mjs";
import { applyCondition } from "./conditions.mjs";

/**
 * Ability catalogue.
 * Each ability defines: name, range, cost, effects, targeting.
 */
export const ABILITY_CATALOGUE = {
  firebolt: {
    name: "Firebolt",
    type: "attack",
    range: 6,
    targeting: "enemy",
    damageDice: [1, 10],
    attackBonus: 0,
    description: "A bolt of fire streaks toward a target within range.",
    cooldown: 0,
    apCost: 1,
    conditionApply: null,
  },
  healing_word: {
    name: "Healing Word",
    type: "heal",
    range: 4,
    targeting: "ally",
    healDice: [1, 6],
    description: "A soothing word of power restores vitality to an ally.",
    cooldown: 1,
    apCost: 1,
    conditionApply: null,
  },
  sneak_attack: {
    name: "Sneak Attack",
    type: "attack",
    range: 1,
    targeting: "enemy",
    damageDice: [2, 6],
    attackBonus: 2,
    description: "A devastating strike from the shadows deals extra damage.",
    cooldown: 0,
    apCost: 1,
    conditionApply: null,
  },
  poison_strike: {
    name: "Poison Strike",
    type: "attack",
    range: 1,
    targeting: "enemy",
    damageDice: [1, 4],
    attackBonus: 0,
    description: "A venomous strike that poisons the target.",
    cooldown: 2,
    apCost: 1,
    conditionApply: { condition: "poisoned", duration: 2 },
  },
  shield_bash: {
    name: "Shield Bash",
    type: "attack",
    range: 1,
    targeting: "enemy",
    damageDice: [1, 4],
    attackBonus: 1,
    description: "A heavy shield blow that stuns the target.",
    cooldown: 2,
    apCost: 1,
    conditionApply: { condition: "stunned", duration: 1 },
  },
};

/**
 * Chebyshev distance (diagonal movement = 1 cell).
 */
function gridDistance(a, b) {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/**
 * Validate and apply a USE_ABILITY action.
 *
 * @param {object} state — cloned GameState (will be mutated)
 * @param {{ casterId: string, abilityId: string, targetId: string }} action
 * @returns {{ ok: boolean, errors: Array<{code:string,message:string}>, events: object[] }}
 */
export function applyAbility(state, action) {
  const { casterId, abilityId, targetId } = action;
  const events = [];

  // Look up ability
  const ability = ABILITY_CATALOGUE[abilityId];
  if (!ability) {
    return { ok: false, errors: [makeError(ErrorCode.INVALID_ACTION, `Unknown ability "${abilityId}"`)], events };
  }

  // Find entities
  const allEntities = [
    ...(state.entities?.players ?? []),
    ...(state.entities?.npcs ?? []),
    ...(state.entities?.objects ?? []),
  ];
  const caster = allEntities.find((e) => e.id === casterId);
  const target = allEntities.find((e) => e.id === targetId);

  if (!caster) return { ok: false, errors: [makeError(ErrorCode.ENTITY_NOT_FOUND, `Caster "${casterId}" not found`)], events };
  if (!target) return { ok: false, errors: [makeError(ErrorCode.ENTITY_NOT_FOUND, `Target "${targetId}" not found`)], events };

  // Dead checks
  if (caster.conditions.includes("dead")) {
    return { ok: false, errors: [makeError(ErrorCode.DEAD_ENTITY, `Caster "${casterId}" is dead`)], events };
  }
  if (target.conditions.includes("dead") && ability.type === "attack") {
    return { ok: false, errors: [makeError(ErrorCode.TARGET_DEAD, `Target "${targetId}" is already dead`)], events };
  }

  // Range check
  const dist = gridDistance(caster.position, target.position);
  if (dist > ability.range) {
    return { ok: false, errors: [makeError(ErrorCode.OUT_OF_RANGE, `Target at distance ${dist}, ability range is ${ability.range}`)], events };
  }

  // Targeting validation
  if (ability.targeting === "enemy") {
    if (caster.kind === target.kind) {
      return { ok: false, errors: [makeError(ErrorCode.INVALID_ACTION, `${ability.name} targets enemies, not allies`)], events };
    }
  } else if (ability.targeting === "ally") {
    if (caster.kind !== target.kind) {
      return { ok: false, errors: [makeError(ErrorCode.INVALID_ACTION, `${ability.name} targets allies, not enemies`)], events };
    }
  }

  // Cooldown check
  if (ability.cooldown > 0) {
    if (!caster.abilityCooldowns) caster.abilityCooldowns = {};
    const remaining = caster.abilityCooldowns[abilityId] || 0;
    if (remaining > 0) {
      return { ok: false, errors: [makeError(ErrorCode.INVALID_ACTION, `${ability.name} on cooldown (${remaining} turns)`)], events };
    }
  }

  // ── Resolve ability ───────────────────────────────────────────────

  if (ability.type === "attack") {
    const result = resolveAttackAbility(state, caster, target, ability, abilityId);
    events.push(...result.events);
  } else if (ability.type === "heal") {
    const result = resolveHealAbility(state, caster, target, ability, abilityId);
    events.push(...result.events);
  }

  // Set cooldown
  if (ability.cooldown > 0) {
    if (!caster.abilityCooldowns) caster.abilityCooldowns = {};
    caster.abilityCooldowns[abilityId] = ability.cooldown;
  }

  // Add events to state log
  for (const evt of events) {
    state.log.events.push(evt);
  }

  return { ok: true, errors: [], events };
}

/**
 * Resolve an attack-type ability.
 */
function resolveAttackAbility(state, caster, target, ability, abilityId) {
  const events = [];

  // Roll to hit
  const hitRoll = rollD20(state, `${caster.name} ${ability.name} attack roll`);
  state.rng = hitRoll.nextState.rng;
  const rollValue = hitRoll.result + (ability.attackBonus || 0);
  const hit = rollValue >= target.stats.ac;

  let damage = 0;
  if (hit) {
    const dmgRoll = rollDice(state, ability.damageDice[0], ability.damageDice[1], `${caster.name} ${ability.name} damage`);
    state.rng = dmgRoll.nextState.rng;
    damage = dmgRoll.result;

    target.stats.hpCurrent = Math.max(0, target.stats.hpCurrent - damage);

    if (target.stats.hpCurrent === 0 && !target.conditions.includes("dead")) {
      target.conditions.push("dead");
    }

    // Apply condition if defined
    if (ability.conditionApply && target.stats.hpCurrent > 0) {
      applyCondition(target, ability.conditionApply.condition, ability.conditionApply.duration);
    }
  }

  const eventId = `evt-${(state.log.events.length + 1).toString().padStart(4, "0")}`;
  events.push({
    id: eventId,
    timestamp: state.timestamp,
    type: "ABILITY_USED",
    payload: {
      casterId: caster.id,
      targetId: target.id,
      abilityId,
      abilityName: ability.name,
      abilityType: "attack",
      attackRoll: rollValue,
      targetAc: target.stats.ac,
      hit,
      damage,
      targetHpAfter: target.stats.hpCurrent,
      conditionApplied: hit && ability.conditionApply ? ability.conditionApply.condition : null,
    },
  });

  return { events };
}

/**
 * Resolve a heal-type ability.
 */
function resolveHealAbility(state, caster, target, ability, abilityId) {
  const events = [];

  const healRoll = rollDice(state, ability.healDice[0], ability.healDice[1], `${caster.name} ${ability.name} heal`);
  state.rng = healRoll.nextState.rng;
  const healAmount = healRoll.result;

  const hpBefore = target.stats.hpCurrent;
  target.stats.hpCurrent = Math.min(target.stats.hpMax, target.stats.hpCurrent + healAmount);
  const actualHeal = target.stats.hpCurrent - hpBefore;

  const eventId = `evt-${(state.log.events.length + 1).toString().padStart(4, "0")}`;
  events.push({
    id: eventId,
    timestamp: state.timestamp,
    type: "ABILITY_USED",
    payload: {
      casterId: caster.id,
      targetId: target.id,
      abilityId,
      abilityName: ability.name,
      abilityType: "heal",
      healRoll: healAmount,
      actualHeal,
      targetHpAfter: target.stats.hpCurrent,
    },
  });

  return { events };
}

/**
 * Tick all ability cooldowns for an entity (call at end of turn).
 *
 * @param {object} entity
 */
export function tickCooldowns(entity) {
  if (!entity.abilityCooldowns) return;
  for (const [abilityId, remaining] of Object.entries(entity.abilityCooldowns)) {
    if (remaining > 0) {
      entity.abilityCooldowns[abilityId] = remaining - 1;
    }
    if (entity.abilityCooldowns[abilityId] <= 0) {
      delete entity.abilityCooldowns[abilityId];
    }
  }
}
