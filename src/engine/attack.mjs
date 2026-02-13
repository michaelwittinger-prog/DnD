/**
 * attack.mjs — MIR 1.3 Attack Logic.
 *
 * Rules:
 * - Roll d20 via deterministic RNG
 * - Compare to target AC
 * - On hit: apply fixed damage (1d6)
 * - Update hpCurrent; add "dead" condition if hp reaches 0
 * - Append attack event to log
 */

import { ErrorCode, makeError } from "./errors.mjs";
import { rollD20, rollDice } from "./rng.mjs";
import { getAcModifier, getAttackModifier, hasAttackDisadvantage, shouldSkipTurn } from "./conditions.mjs";

/**
 * Chebyshev distance (diagonal = 1 cell).
 */
function gridDistance(a, b) {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/**
 * Validate and apply an ATTACK action.
 *
 * @param {object} state — cloned GameState (will be mutated)
 * @param {{ attackerId: string, targetId: string }} action
 * @returns {{ ok: boolean, errors: Array<{code:string,message:string}> }}
 */
export function applyAttack(state, action) {
  const { attackerId, targetId } = action;

  if (attackerId === targetId) {
    return { ok: false, errors: [makeError(ErrorCode.SELF_ATTACK, `Entity "${attackerId}" cannot attack itself`)] };
  }

  // Find entities
  const allEntities = [
    ...(state.entities?.players ?? []),
    ...(state.entities?.npcs ?? []),
    ...(state.entities?.objects ?? []),
  ];
  const attacker = allEntities.find((e) => e.id === attackerId);
  const target = allEntities.find((e) => e.id === targetId);

  if (!attacker) return { ok: false, errors: [makeError(ErrorCode.ENTITY_NOT_FOUND, `Attacker "${attackerId}" not found`)] };
  if (!target) return { ok: false, errors: [makeError(ErrorCode.ENTITY_NOT_FOUND, `Target "${targetId}" not found`)] };

  if (attacker.conditions.includes("dead")) {
    return { ok: false, errors: [makeError(ErrorCode.DEAD_ENTITY, `Attacker "${attackerId}" is dead`)] };
  }
  if (target.conditions.includes("dead")) {
    return { ok: false, errors: [makeError(ErrorCode.TARGET_DEAD, `Target "${targetId}" is already dead`)] };
  }

  // Stunned attacker cannot attack
  if (shouldSkipTurn(attacker) && !attacker.conditions.includes("dead")) {
    return { ok: false, errors: [makeError(ErrorCode.INVALID_ACTION, `Attacker "${attackerId}" is stunned and cannot act`)] };
  }

  // Range check — weapon range defaults to 1 (melee) if not specified
  const dist = gridDistance(attacker.position, target.position);
  const attackRange = attacker.stats.attackRange ?? 1;
  if (dist > attackRange) {
    return { ok: false, errors: [makeError(ErrorCode.OUT_OF_RANGE, `Target at distance ${dist}, attack range is ${attackRange}`)] };
  }

  // Roll to hit (d20 vs AC, with condition modifiers)
  let hitRoll1 = rollD20(state, `${attacker.name} attack roll vs ${target.name}`);
  state.rng = hitRoll1.nextState.rng;
  let rawRoll = hitRoll1.result;

  // Disadvantage: roll twice, take lower (poisoned attacker)
  if (hasAttackDisadvantage(attacker)) {
    const hitRoll2 = rollD20(state, `${attacker.name} disadvantage re-roll`);
    state.rng = hitRoll2.nextState.rng;
    rawRoll = Math.min(rawRoll, hitRoll2.result);
  }

  // Apply attacker's condition bonuses (blessed: +2)
  const attackMod = getAttackModifier(attacker);
  const hitResult = rawRoll + attackMod;

  // Apply target's condition AC modifiers (stunned: -2)
  const acMod = getAcModifier(target);
  const effectiveAc = target.stats.ac + acMod;

  const hit = hitResult >= effectiveAc;

  let damage = 0;
  if (hit) {
    // Roll damage (1d6 — simple fixed rule)
    const dmgRoll = rollDice(state, 1, 6, `${attacker.name} damage vs ${target.name}`);
    state.rng = dmgRoll.nextState.rng;
    damage = dmgRoll.result;

    // Apply damage
    target.stats.hpCurrent = Math.max(0, target.stats.hpCurrent - damage);

    // Apply "dead" condition if hp reaches 0
    if (target.stats.hpCurrent === 0 && !target.conditions.includes("dead")) {
      target.conditions.push("dead");
    }
  }

  // Append log event with full dice detail
  const eventId = `evt-${(state.log.events.length + 1).toString().padStart(4, "0")}`;
  state.log.events.push({
    id: eventId,
    timestamp: state.timestamp,
    type: "ATTACK_RESOLVED",
    payload: {
      attackerId,
      targetId,
      rawRoll: rawRoll,
      attackModifier: attackMod,
      attackRoll: hitResult,
      targetBaseAc: target.stats.ac,
      acModifier: acMod,
      effectiveAc: effectiveAc,
      disadvantage: hasAttackDisadvantage(attacker),
      hit,
      damage,
      targetHpAfter: target.stats.hpCurrent,
    },
  });

  return { ok: true, errors: [] };
}
