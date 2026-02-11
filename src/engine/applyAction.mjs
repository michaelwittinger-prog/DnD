/**
 * applyAction.mjs — MIR 1.3 Core State Transition Function.
 *
 * Validation order:
 *   1. Validate schema (MIR 1.2)
 *   2. Validate invariants (MIR 1.2)
 *   3. Validate action preconditions
 *   4. Clone state, apply mutation
 *   5. Validate invariants on result
 *   6. Return { nextState, success, errors? }
 *
 * No partial mutations. No side effects.
 */

import { validateGameState, validateInvariants } from "../state/validateGameState.mjs";
import { ErrorCode, makeError } from "./errors.mjs";
import { applyMove } from "./movement.mjs";
import { applyAttack } from "./attack.mjs";
import { applyRollInitiative, applyEndTurn } from "./initiative.mjs";

/**
 * @typedef {
 *   | { type: "MOVE"; entityId: string; path: { x: number; y: number }[] }
 *   | { type: "ATTACK"; attackerId: string; targetId: string }
 *   | { type: "END_TURN"; entityId: string }
 *   | { type: "ROLL_INITIATIVE" }
 * } DeclaredAction
 */

const VALID_ACTION_TYPES = new Set(["MOVE", "ATTACK", "END_TURN", "ROLL_INITIATIVE"]);

/**
 * Validate that a declared action has the correct shape.
 * @param {DeclaredAction} action
 * @returns {Array<{code:string,message:string}>}
 */
function validateActionShape(action) {
  if (!action || typeof action !== "object") {
    return [makeError(ErrorCode.INVALID_ACTION, "Action must be a non-null object")];
  }
  if (!VALID_ACTION_TYPES.has(action.type)) {
    return [makeError(ErrorCode.INVALID_ACTION, `Unknown action type "${action.type}"`)];
  }
  switch (action.type) {
    case "MOVE":
      if (!action.entityId) return [makeError(ErrorCode.INVALID_ACTION, "MOVE requires entityId")];
      if (!Array.isArray(action.path)) return [makeError(ErrorCode.INVALID_ACTION, "MOVE requires path array")];
      break;
    case "ATTACK":
      if (!action.attackerId) return [makeError(ErrorCode.INVALID_ACTION, "ATTACK requires attackerId")];
      if (!action.targetId) return [makeError(ErrorCode.INVALID_ACTION, "ATTACK requires targetId")];
      break;
    case "END_TURN":
      if (!action.entityId) return [makeError(ErrorCode.INVALID_ACTION, "END_TURN requires entityId")];
      break;
    case "ROLL_INITIATIVE":
      break;
  }
  return [];
}

/**
 * Check turn-order preconditions for combat actions.
 * @param {object} state
 * @param {DeclaredAction} action
 * @returns {Array<{code:string,message:string}>}
 */
function validateTurnOrder(state, action) {
  const errors = [];
  const combat = state.combat;

  // During combat, MOVE and ATTACK require it to be the acting entity's turn
  if (combat.mode === "combat") {
    let actingId = null;
    if (action.type === "MOVE") actingId = action.entityId;
    else if (action.type === "ATTACK") actingId = action.attackerId;

    if (actingId && combat.activeEntityId !== actingId) {
      errors.push(makeError(ErrorCode.NOT_YOUR_TURN, `It is not "${actingId}"'s turn (active: "${combat.activeEntityId}")`));
    }
  }

  return errors;
}

/**
 * Core state transition function.
 *
 * @param {object} previousState — current GameState
 * @param {DeclaredAction} declaredAction
 * @returns {{ nextState: object, success: boolean, errors?: string[] }}
 */
export function applyAction(previousState, declaredAction) {
  // 1. Validate schema
  const schemaResult = validateGameState(previousState);
  if (!schemaResult.ok) {
    return {
      nextState: previousState,
      success: false,
      errors: schemaResult.errors.map((e) => `[SCHEMA] ${e}`),
    };
  }

  // 2. Validate invariants on input state
  const preInvResult = validateInvariants(previousState);
  if (!preInvResult.ok) {
    return {
      nextState: previousState,
      success: false,
      errors: preInvResult.errors.map((e) => `[PRE_INVARIANT] ${e}`),
    };
  }

  // 3a. Validate action shape
  const shapeErrors = validateActionShape(declaredAction);
  if (shapeErrors.length > 0) {
    return {
      nextState: previousState,
      success: false,
      errors: shapeErrors.map((e) => `[${e.code}] ${e.message}`),
    };
  }

  // 3b. Validate turn-order preconditions
  const turnErrors = validateTurnOrder(previousState, declaredAction);
  if (turnErrors.length > 0) {
    return {
      nextState: previousState,
      success: false,
      errors: turnErrors.map((e) => `[${e.code}] ${e.message}`),
    };
  }

  // 4. Clone state and apply mutation
  const clone = structuredClone(previousState);
  let result;

  switch (declaredAction.type) {
    case "MOVE":
      result = applyMove(clone, declaredAction);
      break;
    case "ATTACK":
      result = applyAttack(clone, declaredAction);
      break;
    case "ROLL_INITIATIVE":
      result = applyRollInitiative(clone);
      break;
    case "END_TURN":
      result = applyEndTurn(clone, declaredAction);
      break;
    default:
      return {
        nextState: previousState,
        success: false,
        errors: [`[INVALID_ACTION] Unhandled action type`],
      };
  }

  if (!result.ok) {
    return {
      nextState: previousState,
      success: false,
      errors: result.errors.map((e) => `[${e.code}] ${e.message}`),
    };
  }

  // Append move event to log (ATTACK and INITIATIVE handle their own logging)
  if (declaredAction.type === "MOVE") {
    const eventId = `evt-${(clone.log.events.length + 1).toString().padStart(4, "0")}`;
    const entity = [
      ...(clone.entities?.players ?? []),
      ...(clone.entities?.npcs ?? []),
      ...(clone.entities?.objects ?? []),
    ].find((e) => e.id === declaredAction.entityId);
    clone.log.events.push({
      id: eventId,
      timestamp: clone.timestamp,
      type: "move",
      payload: {
        entityId: declaredAction.entityId,
        path: declaredAction.path,
        finalPosition: entity ? { x: entity.position.x, y: entity.position.y } : null,
      },
    });
  }

  // 5. Validate invariants on resulting state
  const postInvResult = validateInvariants(clone);
  if (!postInvResult.ok) {
    // Rollback: return original state
    return {
      nextState: previousState,
      success: false,
      errors: postInvResult.errors.map((e) => `[POST_INVARIANT] ${e}`),
    };
  }

  // 6. Return success
  return { nextState: clone, success: true };
}
