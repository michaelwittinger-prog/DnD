/**
 * combatEnd.mjs — MIR Combat End Detection.
 *
 * Checks if combat should end after any state change:
 *   - All players are dead → NPCs win → COMBAT_ENDED
 *   - All NPCs are dead → Players win → COMBAT_ENDED
 *   - Only one side remains alive → COMBAT_ENDED
 *
 * When combat ends:
 *   - combat.mode → "exploration"
 *   - combat.activeEntityId → null
 *   - combat.initiativeOrder → []
 *   - COMBAT_ENDED event appended to log
 *
 * This function mutates the cloned state (called from applyAction
 * after a successful action, before post-invariant check).
 */

/**
 * Check if combat should end and apply the transition if so.
 * Only runs if currently in combat mode.
 *
 * @param {object} state — cloned GameState (will be mutated if combat ends)
 * @returns {{ ended: boolean, winner?: "players"|"npcs"|"none" }}
 */
export function checkCombatEnd(state) {
  if (state.combat.mode !== "combat") {
    return { ended: false };
  }

  const livingPlayers = (state.entities?.players ?? []).filter(
    (e) => !e.conditions.includes("dead")
  );
  const livingNpcs = (state.entities?.npcs ?? []).filter(
    (e) => !e.conditions.includes("dead")
  );

  let winner = null;

  if (livingPlayers.length === 0 && livingNpcs.length === 0) {
    winner = "none"; // Everyone dead — mutual annihilation
  } else if (livingNpcs.length === 0) {
    winner = "players";
  } else if (livingPlayers.length === 0) {
    winner = "npcs";
  }

  if (winner === null) {
    return { ended: false };
  }

  // End combat
  const previousRound = state.combat.round;
  state.combat.mode = "exploration";
  state.combat.activeEntityId = null;
  state.combat.initiativeOrder = [];
  state.combat.round = 0; // Invariant: exploration requires round=0

  // Append COMBAT_ENDED event
  const eventId = `evt-${(state.log.events.length + 1).toString().padStart(4, "0")}`;
  state.log.events.push({
    id: eventId,
    timestamp: state.timestamp,
    type: "COMBAT_ENDED",
    payload: {
      winner,
      finalRound: previousRound,
      livingPlayers: livingPlayers.map((e) => e.id),
      livingNpcs: livingNpcs.map((e) => e.id),
    },
  });

  return { ended: true, winner };
}

/**
 * Find the next living entity in initiative order starting from a given index.
 * Skips dead entities. Returns null if no living entities remain.
 *
 * @param {object} state
 * @param {number} startIdx — index to start searching from (inclusive)
 * @param {number} maxSteps — maximum steps to search (prevents infinite loop)
 * @returns {{ entityId: string, index: number, wrapped: boolean } | null}
 */
export function findNextLivingEntity(state, startIdx, maxSteps) {
  const order = state.combat.initiativeOrder;
  if (order.length === 0) return null;

  const allEntities = [
    ...(state.entities?.players ?? []),
    ...(state.entities?.npcs ?? []),
  ];

  const limit = maxSteps ?? order.length;
  let wrapped = false;

  for (let i = 0; i < limit; i++) {
    const idx = (startIdx + i) % order.length;
    if (idx < startIdx && i > 0) wrapped = true;

    const entityId = order[idx];
    const entity = allEntities.find((e) => e.id === entityId);

    if (entity && !entity.conditions.includes("dead")) {
      return { entityId, index: idx, wrapped: wrapped || (idx < startIdx && i > 0) };
    }
  }

  return null; // All dead
}
