/**
 * initiative.mjs — MIR 1.3 Initiative Logic.
 *
 * Rules:
 * - Roll d20 for each combat participant
 * - Stable sort descending by roll, ties broken by entity id (ascending)
 * - Populate combat.initiativeOrder
 * - Set activeEntityId to first in order
 */

import { ErrorCode, makeError } from "./errors.mjs";
import { rollD20 } from "./rng.mjs";

/**
 * Roll initiative and transition to combat mode.
 *
 * @param {object} state — cloned GameState (will be mutated)
 * @returns {{ ok: boolean, errors: Array<{code:string,message:string}> }}
 */
export function applyRollInitiative(state) {
  if (state.combat.mode === "combat") {
    return { ok: false, errors: [makeError(ErrorCode.COMBAT_ALREADY, "Combat is already active")] };
  }

  // All living players and npcs participate (not objects, not dead)
  const participants = [
    ...(state.entities?.players ?? []),
    ...(state.entities?.npcs ?? []),
  ].filter((e) => !e.conditions.includes("dead"));

  if (participants.length === 0) {
    return { ok: false, errors: [makeError(ErrorCode.NO_PARTICIPANTS, "No living entities to participate in combat")] };
  }

  // Roll initiative for each participant
  const rolls = [];
  let currentState = state;
  for (const p of participants) {
    const roll = rollD20(currentState, `${p.name} initiative`);
    // Apply rng changes to our state clone
    state.rng = roll.nextState.rng;
    rolls.push({ id: p.id, roll: roll.result });
  }

  // Stable sort: descending by roll, ties broken by id ascending
  rolls.sort((a, b) => {
    if (b.roll !== a.roll) return b.roll - a.roll;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });

  // Set combat state
  state.combat.mode = "combat";
  state.combat.round = 1;
  state.combat.initiativeOrder = rolls.map((r) => r.id);
  state.combat.activeEntityId = rolls[0].id;

  // Append log event
  const eventId = `evt-${(state.log.events.length + 1).toString().padStart(4, "0")}`;
  state.log.events.push({
    id: eventId,
    timestamp: state.timestamp,
    type: "roll_initiative",
    payload: {
      order: rolls.map((r) => ({ entityId: r.id, roll: r.roll })),
    },
  });

  return { ok: true, errors: [] };
}

/**
 * End current entity's turn and advance to next in initiative.
 *
 * @param {object} state — cloned GameState (will be mutated)
 * @param {{ entityId: string }} action
 * @returns {{ ok: boolean, errors: Array<{code:string,message:string}> }}
 */
export function applyEndTurn(state, action) {
  if (state.combat.mode !== "combat") {
    return { ok: false, errors: [makeError(ErrorCode.COMBAT_NOT_ACTIVE, "No combat is active")] };
  }

  if (state.combat.activeEntityId !== action.entityId) {
    return { ok: false, errors: [makeError(ErrorCode.NOT_YOUR_TURN, `It is not "${action.entityId}"'s turn (active: "${state.combat.activeEntityId}")`)] };
  }

  const order = state.combat.initiativeOrder;
  const idx = order.indexOf(action.entityId);
  const nextIdx = (idx + 1) % order.length;
  state.combat.activeEntityId = order[nextIdx];

  // If we wrapped around, advance the round
  if (nextIdx === 0) {
    state.combat.round += 1;
  }

  // Append log event
  const eventId = `evt-${(state.log.events.length + 1).toString().padStart(4, "0")}`;
  state.log.events.push({
    id: eventId,
    timestamp: state.timestamp,
    type: "end_turn",
    payload: { entityId: action.entityId, nextEntityId: state.combat.activeEntityId, round: state.combat.round },
  });

  return { ok: true, errors: [] };
}
