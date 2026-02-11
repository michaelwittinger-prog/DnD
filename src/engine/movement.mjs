/**
 * movement.mjs — MIR 1.3 Movement Logic.
 *
 * Rules:
 * - Path length <= movementSpeed
 * - All cells inside map bounds
 * - No movement into blocked terrain (blocksMovement)
 * - No overlapping with other solid entities
 * - No diagonal movement (only cardinal steps)
 */

import { ErrorCode, makeError } from "./errors.mjs";

/**
 * Build a set of occupied cell keys excluding a specific entity.
 * @param {object} state
 * @param {string} excludeId
 * @returns {Set<string>}
 */
function occupiedCells(state, excludeId) {
  const set = new Set();
  const all = [
    ...(state.entities?.players ?? []),
    ...(state.entities?.npcs ?? []),
    ...(state.entities?.objects ?? []),
  ];
  for (const e of all) {
    if (e.id !== excludeId) set.add(`${e.position.x},${e.position.y}`);
  }
  return set;
}

/**
 * Build a set of blocked cell keys from terrain.
 * @param {object} state
 * @returns {Set<string>}
 */
function blockedCells(state) {
  const set = new Set();
  for (const t of state.map?.terrain ?? []) {
    if (t.blocksMovement) set.add(`${t.x},${t.y}`);
  }
  return set;
}

/**
 * Validate and apply a MOVE action.
 *
 * @param {object} state — cloned GameState (will be mutated)
 * @param {{ entityId: string, path: {x:number,y:number}[] }} action
 * @returns {{ ok: boolean, errors: Array<{code:string,message:string}> }}
 */
export function applyMove(state, action) {
  const errors = [];
  const { entityId, path } = action;

  if (!path || path.length === 0) {
    errors.push(makeError(ErrorCode.PATH_EMPTY, `MOVE path is empty`));
    return { ok: false, errors };
  }

  // Find entity
  const allEntities = [
    ...(state.entities?.players ?? []),
    ...(state.entities?.npcs ?? []),
    ...(state.entities?.objects ?? []),
  ];
  const entity = allEntities.find((e) => e.id === entityId);
  if (!entity) {
    errors.push(makeError(ErrorCode.ENTITY_NOT_FOUND, `Entity "${entityId}" not found`));
    return { ok: false, errors };
  }

  // Dead check
  if (entity.conditions.includes("dead")) {
    errors.push(makeError(ErrorCode.DEAD_ENTITY, `Entity "${entityId}" is dead`));
    return { ok: false, errors };
  }

  // Movement speed check
  if (path.length > entity.stats.movementSpeed) {
    errors.push(makeError(ErrorCode.OUT_OF_RANGE, `Path length ${path.length} exceeds movementSpeed ${entity.stats.movementSpeed}`));
    return { ok: false, errors };
  }

  const { width, height } = state.map.grid.size;
  const blocked = blockedCells(state);
  const occupied = occupiedCells(state, entityId);

  // Validate each step
  let prev = { x: entity.position.x, y: entity.position.y };
  for (let i = 0; i < path.length; i++) {
    const step = path[i];
    const dx = step.x - prev.x;
    const dy = step.y - prev.y;

    // No diagonal
    if (Math.abs(dx) + Math.abs(dy) !== 1) {
      errors.push(makeError(ErrorCode.DIAGONAL_MOVE, `Step ${i}: (${prev.x},${prev.y})→(${step.x},${step.y}) is not cardinal`));
      return { ok: false, errors };
    }

    // Bounds
    if (step.x < 0 || step.x >= width || step.y < 0 || step.y >= height) {
      errors.push(makeError(ErrorCode.OUT_OF_RANGE, `Step ${i}: (${step.x},${step.y}) outside map ${width}x${height}`));
      return { ok: false, errors };
    }

    // Blocked
    const ck = `${step.x},${step.y}`;
    if (blocked.has(ck)) {
      errors.push(makeError(ErrorCode.BLOCKED_CELL, `Step ${i}: (${step.x},${step.y}) is blocked terrain`));
      return { ok: false, errors };
    }

    // Overlap (only check final position for other entities, but also intermediate)
    if (occupied.has(ck)) {
      errors.push(makeError(ErrorCode.OVERLAP, `Step ${i}: (${step.x},${step.y}) is occupied`));
      return { ok: false, errors };
    }

    prev = step;
  }

  // Apply: update entity position to final path cell
  const finalPos = path[path.length - 1];
  entity.position.x = finalPos.x;
  entity.position.y = finalPos.y;

  return { ok: true, errors: [] };
}
