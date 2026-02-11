/**
 * npcTurnStrategy.mjs — MIR NPC Auto-Turn Decision Engine.
 *
 * Pure function: given a game state and an NPC entity ID, returns the
 * sequence of DeclaredActions to execute for that NPC's turn.
 *
 * Strategy (simple aggressive):
 *   1. If adjacent to a hostile → ATTACK nearest hostile
 *   2. Else → pathfind to nearest reachable hostile and MOVE toward them
 *      2a. If now adjacent after move → also ATTACK
 *   3. If no reachable hostile → END_TURN
 *   4. Always END_TURN at the end
 *
 * This module does NOT execute actions — it returns an action plan.
 * The caller (combatController) executes them via applyAction.
 *
 * All dependencies are pure functions with no side effects.
 */

import { findPathToAdjacent, isAdjacent, getHostileEntities } from "./pathfinding.mjs";

/**
 * @typedef {Object} TurnPlan
 * @property {Array<import("./applyAction.mjs").DeclaredAction>} actions
 * @property {string} reasoning — human-readable explanation for debugging/narration
 */

/**
 * Decide what an NPC should do on their turn.
 *
 * @param {object} state — current GameState (read-only)
 * @param {string} entityId — NPC entity ID
 * @returns {TurnPlan}
 */
export function planNpcTurn(state, entityId) {
  const actions = [];
  const reasons = [];

  // Find the NPC
  const npc = (state.entities?.npcs ?? []).find((e) => e.id === entityId);
  if (!npc) {
    return { actions: [{ type: "END_TURN", entityId }], reasoning: "NPC not found" };
  }

  // Dead NPCs shouldn't act
  if (npc.conditions.includes("dead")) {
    return { actions: [{ type: "END_TURN", entityId }], reasoning: "NPC is dead" };
  }

  // Find hostile targets (players)
  const hostiles = getHostileEntities(state, entityId);
  if (hostiles.length === 0) {
    reasons.push("No hostile targets");
    actions.push({ type: "END_TURN", entityId });
    return { actions, reasoning: reasons.join("; ") };
  }

  // Sort hostiles by Manhattan distance (nearest first)
  const npcPos = npc.position;
  const sorted = hostiles
    .map((h) => ({
      entity: h,
      dist: Math.abs(h.position.x - npcPos.x) + Math.abs(h.position.y - npcPos.y),
    }))
    .sort((a, b) => a.dist - b.dist);

  // Check if already adjacent to any hostile
  const adjacentHostile = sorted.find((h) => h.dist === 1);

  if (adjacentHostile) {
    // Already adjacent → attack
    reasons.push(`Adjacent to ${adjacentHostile.entity.name}, attacking`);
    actions.push({
      type: "ATTACK",
      attackerId: entityId,
      targetId: adjacentHostile.entity.id,
    });
    actions.push({ type: "END_TURN", entityId });
    return { actions, reasoning: reasons.join("; ") };
  }

  // Not adjacent — try to path toward nearest hostile
  let moved = false;
  for (const { entity: target } of sorted) {
    const pathResult = findPathToAdjacent(state, entityId, target.id);
    if (pathResult && pathResult.path.length > 0) {
      reasons.push(`Moving toward ${target.name} (${pathResult.cost} steps)`);
      actions.push({
        type: "MOVE",
        entityId,
        path: pathResult.path,
      });

      // After moving, check if now adjacent to target
      const finalPos = pathResult.path[pathResult.path.length - 1];
      if (isAdjacent(finalPos, target.position)) {
        reasons.push(`Now adjacent to ${target.name}, attacking`);
        actions.push({
          type: "ATTACK",
          attackerId: entityId,
          targetId: target.id,
        });
      }

      moved = true;
      break;
    }
  }

  if (!moved) {
    reasons.push("No reachable hostile targets");
  }

  actions.push({ type: "END_TURN", entityId });
  return { actions, reasoning: reasons.join("; ") };
}

/**
 * Check if an entity is an NPC.
 *
 * @param {object} state
 * @param {string} entityId
 * @returns {boolean}
 */
export function isNpc(state, entityId) {
  return (state.entities?.npcs ?? []).some((e) => e.id === entityId);
}

/**
 * Check if the current active entity in combat is an NPC.
 *
 * @param {object} state
 * @returns {boolean}
 */
export function isNpcTurn(state) {
  if (state.combat.mode !== "combat") return false;
  const activeId = state.combat.activeEntityId;
  if (!activeId) return false;
  return isNpc(state, activeId);
}
