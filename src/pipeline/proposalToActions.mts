/**
 * proposalToActions.mjs — One-way translator: AI response ops → engine DeclaredActions.
 *
 * This is the bridge between the LLM pipeline (Universe 2) and the engine (Universe 1).
 * It translates AI response operations (move_entity, set_hp, etc.) into engine
 * DeclaredAction objects (MOVE, ATTACK, END_TURN, ROLL_INITIATIVE) that can be
 * applied via applyAction().
 *
 * ONE-WAY ONLY. Never converts engine state back to pipeline state.
 *
 * See docs/implementation_report.md §6 for the full mapping table.
 *
 * @module proposalToActions
 */

import { findPath } from "../engine/pathfinding.mjs";

// ── Helpers ────────────────────────────────────────────────────────────

/**
 * Find an entity in engine state by ID.
 * Engine state has entities categorized: players[], npcs[], objects[].
 */
function findEngineEntity(engineState, entityId) {
  const all = [
    ...(engineState.entities?.players ?? []),
    ...(engineState.entities?.npcs ?? []),
    ...(engineState.entities?.objects ?? []),
  ];
  return all.find((e) => e.id === entityId) ?? null;
}

// ── Translators per op type ────────────────────────────────────────────

/**
 * Translate move_entity → MOVE DeclaredAction.
 * Uses A* pathfinding on engine state to compute the full path.
 *
 * @param {object} op - { op: "move_entity", entity_id, from, to }
 * @param {object} engineState - canonical engine state
 * @returns {{ action: object|null, warning: string|null }}
 */
function translateMoveEntity(op, engineState) {
  const entity = findEngineEntity(engineState, op.entity_id);
  if (!entity) {
    return {
      action: null,
      warning: `move_entity: entity "${op.entity_id}" not found in engine state`,
    };
  }

  const start = entity.position;
  const goal = op.to;

  // If already at target, produce a no-op move
  if (start.x === goal.x && start.y === goal.y) {
    return {
      action: null,
      warning: `move_entity: entity "${op.entity_id}" already at (${goal.x},${goal.y})`,
    };
  }

  // Compute path using engine's A* pathfinding
  const maxCost = entity.stats?.movementSpeed ?? 6;
  const pathResult = findPath(engineState, start, goal, {
    entityId: op.entity_id,
    maxCost,
  });

  if (!pathResult) {
    return {
      action: null,
      warning: `move_entity: no valid path from (${start.x},${start.y}) to (${goal.x},${goal.y}) for "${op.entity_id}"`,
    };
  }

  return {
    action: {
      type: "MOVE",
      entityId: op.entity_id,
      path: pathResult.path,
    },
    warning: null,
  };
}

/**
 * Translate advance_turn → END_TURN DeclaredAction.
 * Uses the currently active entity from engine combat state.
 */
function translateAdvanceTurn(op, engineState) {
  const activeId = engineState.combat?.activeEntityId;
  if (!activeId) {
    return {
      action: null,
      warning: `advance_turn: no active entity in combat (mode: ${engineState.combat?.mode})`,
    };
  }

  return {
    action: {
      type: "END_TURN",
      entityId: activeId,
    },
    warning: null,
  };
}

/**
 * Translate end_turn → END_TURN DeclaredAction.
 */
function translateEndTurn(op, engineState) {
  const entityId = op.entity_id;
  if (!entityId) {
    // Fall back to active entity
    return translateAdvanceTurn(op, engineState);
  }

  return {
    action: {
      type: "END_TURN",
      entityId,
    },
    warning: null,
  };
}

/**
 * Translate start_combat → ROLL_INITIATIVE DeclaredAction.
 * Engine handles participant selection automatically from living entities.
 */
function translateStartCombat(op, engineState) {
  if (engineState.combat?.mode === "combat") {
    return {
      action: null,
      warning: "start_combat: combat already active in engine state",
    };
  }

  return {
    action: {
      type: "ROLL_INITIATIVE",
    },
    warning: null,
  };
}

// ── Ops that don't map to engine actions ───────────────────────────────

const NARRATION_ONLY_OPS = new Set([
  "set_hp",           // Engine uses deterministic attack rolls, not direct HP mutation
  "add_event_log",    // Engine generates its own events
  "spawn_entity",     // No GM authority in engine
  "remove_entity",    // Engine handles death via HP → 0
  "add_condition",    // Future: could map to condition system
  "remove_condition", // Future: could map to condition system
  "set_active_entity",// Engine manages active entity via initiative
  "update_summary",   // Narrative only
]);

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Translate an AI response into engine DeclaredActions.
 *
 * ONE-WAY translation: AI proposal ops → engine actions.
 * Pure function, no side effects.
 *
 * @param {object} aiResponse - validated AI GM response
 * @param {object} engineState - canonical engine state (read-only, used for pathfinding)
 * @returns {{
 *   actions: Array<object>,    // DeclaredAction objects ready for applyAction()
 *   skipped: Array<string>,    // Op descriptions that were intentionally skipped
 *   warnings: Array<string>,   // Problems encountered during translation
 *   narration: string|null,    // AI narration text (pass-through)
 *   adjudication: string|null  // AI adjudication text (pass-through)
 * }}
 */
export function translateProposal(aiResponse, engineState) {
  const actions = [];
  const skipped = [];
  const warnings = [];

  // ── Translate map_updates ──────────────────────────────────────────
  for (const op of aiResponse.map_updates ?? []) {
    switch (op.op) {
      case "move_entity": {
        const result = translateMoveEntity(op, engineState);
        if (result.action) actions.push(result.action);
        if (result.warning) warnings.push(result.warning);
        if (!result.action && !result.warning) {
          skipped.push(`move_entity for ${op.entity_id}`);
        }
        break;
      }
      default:
        if (NARRATION_ONLY_OPS.has(op.op)) {
          skipped.push(`${op.op} (narration-only, no engine equivalent)`);
        } else {
          warnings.push(`Unknown map op: ${op.op}`);
        }
    }
  }

  // ── Translate state_updates ────────────────────────────────────────
  for (const op of aiResponse.state_updates ?? []) {
    switch (op.op) {
      case "advance_turn": {
        const result = translateAdvanceTurn(op, engineState);
        if (result.action) actions.push(result.action);
        if (result.warning) warnings.push(result.warning);
        break;
      }
      case "end_turn": {
        const result = translateEndTurn(op, engineState);
        if (result.action) actions.push(result.action);
        if (result.warning) warnings.push(result.warning);
        break;
      }
      case "start_combat": {
        const result = translateStartCombat(op, engineState);
        if (result.action) actions.push(result.action);
        if (result.warning) warnings.push(result.warning);
        break;
      }
      default:
        if (NARRATION_ONLY_OPS.has(op.op)) {
          skipped.push(`${op.op} for ${op.entity_id || "?"} (narration-only)`);
        } else {
          warnings.push(`Unknown state op: ${op.op}`);
        }
    }
  }

  return {
    actions,
    skipped,
    warnings,
    narration: aiResponse.narration ?? null,
    adjudication: aiResponse.adjudication ?? null,
  };
}
