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

  // Roll to hit (d20 vs AC)
  const hitRoll = rollD20(state, `${attacker.name} attack roll vs ${target.name}`);
  // Copy rng state back (rollD20 returns a new state, we apply rng changes to our clone)
  state.rng = hitRoll.nextState.rng;
  const hitResult = hitRoll.result;
  const hit = hitResult >= target.stats.ac;

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

  // Append log event
  const eventId = `evt-${(state.log.events.length + 1).toString().padStart(4, "0")}`;
  state.log.events.push({
    id: eventId,
    timestamp: state.timestamp,
    type: "attack",
    payload: {
      attackerId,
      targetId,
      attackRoll: hitResult,
      targetAc: target.stats.ac,
      hit,
      damage,
      targetHpAfter: target.stats.hpCurrent,
    },
  });

  return { ok: true, errors: [] };
}
