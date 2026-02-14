/**
 * multiActionTurn.mjs — MIR Tier 5.2 Multi-Action Turn Planner.
 *
 * Extends NPC turn planning with D&D-style action economy:
 *   - Movement (up to speed budget)
 *   - Action (attack or ability)
 *   - Bonus action (certain abilities only)
 *
 * Pure functions. No side effects. No state mutation.
 * Integrates with: npcTurnStrategy, abilities, difficulty, pathfinding.
 */

import { findPathToAdjacent, isAdjacent, getHostileEntities } from "./pathfinding.mjs";

// ── Action Economy ──────────────────────────────────────────────────────

/**
 * Action budget for a standard turn.
 */
export const ACTION_BUDGET = {
  movement: 1,     // one MOVE action per turn
  action: 1,       // one main action (ATTACK or USE_ABILITY)
  bonusAction: 1,  // one bonus action (certain abilities)
};

/**
 * Ability tags that classify abilities into action slots.
 */
export const ABILITY_SLOT = {
  action: "action",        // uses the main action
  bonusAction: "bonus",    // uses the bonus action
};

/**
 * Built-in ability classification.
 * Maps ability names to their action slot.
 */
export const ABILITY_SLOTS = {
  firebolt: "action",
  sneak_attack: "action",
  poison_strike: "action",
  shield_bash: "action",
  healing_word: "bonus",
};

/**
 * Get the action slot for an ability.
 * @param {string} abilityName
 * @returns {"action"|"bonus"|null}
 */
export function getAbilitySlot(abilityName) {
  return ABILITY_SLOTS[abilityName] ?? null;
}

// ── Turn Plan Builder ───────────────────────────────────────────────────

/**
 * @typedef {Object} MultiActionPlan
 * @property {Array<object>} actions — ordered DeclaredActions
 * @property {string} reasoning — human-readable explanation
 * @property {object} budget — remaining action budget after planning
 */

/**
 * Plan a multi-action NPC turn with full action economy.
 *
 * Strategy:
 * 1. If has ranged ability and hostile in range but not adjacent → USE_ABILITY (ranged)
 * 2. If not adjacent → MOVE toward nearest hostile
 * 3. If adjacent → ATTACK (or melee ability)
 * 4. If bonus action available → use bonus ability (e.g. Healing Word on injured ally)
 * 5. END_TURN
 *
 * @param {object} state — GameState
 * @param {string} entityId — NPC entity ID
 * @param {object} [options]
 * @param {object} [options.difficulty] — difficulty preset from difficulty.mjs
 * @param {function} [options.rng] — random function (0–1) for decisions
 * @returns {MultiActionPlan}
 */
export function planMultiActionTurn(state, entityId, options = {}) {
  const rng = options.rng ?? Math.random;
  const difficulty = options.difficulty ?? null;

  const actions = [];
  const reasons = [];
  const budget = { movement: 1, action: 1, bonusAction: 1 };

  // Find the NPC
  const npc = findEntity(state, entityId);
  if (!npc) {
    return result([{ type: "END_TURN", entityId }], "NPC not found", budget);
  }

  if (npc.conditions?.includes("dead")) {
    return result([{ type: "END_TURN", entityId }], "NPC is dead", budget);
  }

  if (npc.conditions?.includes("stunned")) {
    return result([{ type: "END_TURN", entityId }], "NPC is stunned", budget);
  }

  const hostiles = getHostileEntities(state, entityId);
  if (hostiles.length === 0) {
    return result([{ type: "END_TURN", entityId }], "No hostile targets", budget);
  }

  const npcAbilities = npc.abilities ?? [];
  const npcPos = npc.position;

  // Sort hostiles by distance
  const sorted = sortByDistance(hostiles, npcPos);

  // ── Phase 1: Pre-movement ranged ability ──
  if (budget.action > 0 && npcAbilities.length > 0) {
    const rangedAbility = findUsableRangedAbility(npc, npcAbilities, sorted, state);
    if (rangedAbility && !isAdjacentToAny(npcPos, hostiles)) {
      const abilitySlot = getAbilitySlot(rangedAbility.ability.name);
      if (abilitySlot === "action" && budget.action > 0) {
        actions.push({
          type: "USE_ABILITY",
          casterId: entityId,
          abilityName: rangedAbility.ability.name,
          targetId: rangedAbility.target.id,
        });
        budget.action -= 1;
        reasons.push(`Cast ${rangedAbility.ability.name} on ${rangedAbility.target.name}`);
      }
    }
  }

  // ── Phase 2: Movement ──
  if (budget.movement > 0) {
    const adjacentHostile = sorted.find(h => isAdjacent(npcPos, h.entity.position));

    if (!adjacentHostile && budget.action > 0) {
      // Not adjacent and have action left — move toward nearest
      for (const { entity: target } of sorted) {
        const pathResult = findPathToAdjacent(state, entityId, target.id);
        if (pathResult && pathResult.path.length > 0) {
          actions.push({ type: "MOVE", entityId, path: pathResult.path });
          budget.movement -= 1;
          reasons.push(`Move toward ${target.name} (${pathResult.cost} steps)`);
          break;
        }
      }
    }
  }

  // ── Phase 3: Main action (melee attack or ability) ──
  if (budget.action > 0) {
    // Recalculate adjacency after potential move
    const currentPos = getEffectivePosition(actions, entityId, npcPos);
    const adjacentAfterMove = sorted.find(h => isAdjacent(currentPos, h.entity.position));

    if (adjacentAfterMove) {
      // Try melee ability first (if difficulty allows)
      const meleeAbility = findUsableMeleeAbility(npc, npcAbilities, adjacentAfterMove.entity, difficulty, rng);
      if (meleeAbility) {
        actions.push({
          type: "USE_ABILITY",
          casterId: entityId,
          abilityName: meleeAbility.name,
          targetId: adjacentAfterMove.entity.id,
        });
        reasons.push(`Use ${meleeAbility.name} on ${adjacentAfterMove.entity.name}`);
      } else {
        actions.push({
          type: "ATTACK",
          attackerId: entityId,
          targetId: adjacentAfterMove.entity.id,
        });
        reasons.push(`Attack ${adjacentAfterMove.entity.name}`);
      }
      budget.action -= 1;
    }
  }

  // ── Phase 4: Bonus action ──
  if (budget.bonusAction > 0 && npcAbilities.length > 0) {
    const bonusAbility = findUsableBonusAbility(npc, npcAbilities, state, entityId);
    if (bonusAbility) {
      actions.push({
        type: "USE_ABILITY",
        casterId: entityId,
        abilityName: bonusAbility.ability.name,
        targetId: bonusAbility.target.id,
      });
      budget.bonusAction -= 1;
      reasons.push(`Bonus: ${bonusAbility.ability.name} on ${bonusAbility.target.name}`);
    }
  }

  actions.push({ type: "END_TURN", entityId });
  return result(actions, reasons.join("; ") || "No actions available", budget);
}

/**
 * Get a summary of what actions a plan contains.
 *
 * @param {MultiActionPlan} plan
 * @returns {{ moves: number, attacks: number, abilities: number, total: number }}
 */
export function summarizePlan(plan) {
  let moves = 0, attacks = 0, abilities = 0;
  for (const a of plan.actions) {
    if (a.type === "MOVE") moves++;
    else if (a.type === "ATTACK") attacks++;
    else if (a.type === "USE_ABILITY") abilities++;
  }
  return { moves, attacks, abilities, total: moves + attacks + abilities };
}

/**
 * Check if a plan uses more actions than the budget allows.
 *
 * @param {MultiActionPlan} plan
 * @returns {boolean}
 */
export function isPlanWithinBudget(plan) {
  const s = summarizePlan(plan);
  return s.moves <= ACTION_BUDGET.movement &&
         (s.attacks + s.abilities) <= (ACTION_BUDGET.action + ACTION_BUDGET.bonusAction);
}

// ── Internal Helpers ────────────────────────────────────────────────────

function result(actions, reasoning, budget) {
  return { actions, reasoning, budget };
}

function findEntity(state, entityId) {
  const all = [...(state.entities?.players ?? []), ...(state.entities?.npcs ?? [])];
  return all.find(e => e.id === entityId) || null;
}

function sortByDistance(hostiles, pos) {
  return hostiles
    .map(h => ({
      entity: h,
      dist: Math.abs(h.position.x - pos.x) + Math.abs(h.position.y - pos.y),
    }))
    .sort((a, b) => a.dist - b.dist);
}

function isAdjacentToAny(pos, entities) {
  return entities.some(e => isAdjacent(pos, e.position));
}

function getEffectivePosition(actions, entityId, originalPos) {
  for (let i = actions.length - 1; i >= 0; i--) {
    if (actions[i].type === "MOVE" && actions[i].entityId === entityId && actions[i].path?.length) {
      return actions[i].path[actions[i].path.length - 1];
    }
  }
  return originalPos;
}

function findUsableRangedAbility(npc, abilities, sortedHostiles, state) {
  for (const ab of abilities) {
    if (ab.range > 1 && (ab.cooldownRemaining ?? 0) === 0 && ab.targeting !== "ally") {
      for (const { entity: target, dist } of sortedHostiles) {
        if (dist <= ab.range && dist > 1) {
          return { ability: ab, target };
        }
      }
    }
  }
  return null;
}

function findUsableMeleeAbility(npc, abilities, target, difficulty, rng) {
  // Only use abilities sometimes based on difficulty
  const useProb = difficulty?.abilityUseProbability ?? 0.5;
  if (rng() > useProb) return null;

  for (const ab of abilities) {
    if ((ab.range ?? 1) <= 1 && (ab.cooldownRemaining ?? 0) === 0) {
      const slot = getAbilitySlot(ab.name);
      if (slot === "action") return ab;
    }
  }
  return null;
}

function findUsableBonusAbility(npc, abilities, state, entityId) {
  for (const ab of abilities) {
    const slot = getAbilitySlot(ab.name);
    if (slot !== "bonus") continue;
    if ((ab.cooldownRemaining ?? 0) > 0) continue;

    // Healing? Find injured ally
    if (ab.targeting === "ally") {
      const allies = (state.entities?.npcs ?? []).filter(
        e => e.id !== entityId && !e.conditions?.includes("dead") &&
             (e.stats?.hpCurrent ?? e.stats?.hp) < (e.stats?.hpMax ?? e.stats?.maxHp)
      );
      if (allies.length > 0) {
        // Heal the most injured
        const mostInjured = allies.sort((a, b) =>
          ((a.stats.hpCurrent ?? a.stats.hp) / (a.stats.hpMax ?? a.stats.maxHp)) -
          ((b.stats.hpCurrent ?? b.stats.hp) / (b.stats.hpMax ?? b.stats.maxHp))
        )[0];
        return { ability: ab, target: mostInjured };
      }
    }
  }
  return null;
}
