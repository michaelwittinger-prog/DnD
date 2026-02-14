/**
 * applyAction.mjs — MIR 1.4 Core State Transition Function.
 *
 * Validation order:
 *   1. Validate schema (MIR 1.2)
 *   2. Validate invariants (MIR 1.2)
 *   3. Validate action preconditions
 *   4. Clone state, apply mutation
 *   5. Validate invariants on result
 *   6. Return { nextState, events, success, errors? }
 *
 * Contract (see docs/mir_engine_contract.md):
 *   - Success: returns nextState with 1+ EngineEvents appended to log.
 *   - Action-level failure: returns clone with exactly 1 ACTION_REJECTED event.
 *   - State-level failure: returns previousState unchanged, no events.
 *
 * No partial mutations. No side effects.
 */

import { validateGameState, validateInvariants } from "../state/validation/index.mjs";
import { ErrorCode, makeError } from "./errors.mjs";
import { applyMove } from "./movement.mjs";
import { applyAttack } from "./attack.mjs";
import { applyRollInitiative, applyEndTurn } from "./initiative.mjs";
import { checkCombatEnd } from "./combatEnd.mjs";
import { applyCondition } from "./conditions.mjs";
import { applyAbility } from "./abilities.mjs";

/**
 * @typedef {
 *   | { type: "MOVE"; entityId: string; path: { x: number; y: number }[] }
 *   | { type: "ATTACK"; attackerId: string; targetId: string }
 *   | { type: "END_TURN"; entityId: string }
 *   | { type: "ROLL_INITIATIVE" }
 *   | { type: "SET_SEED"; seed: string }
 * } DeclaredAction
 */

const VALID_ACTION_TYPES = new Set(["MOVE", "ATTACK", "DEFEND", "USE_ABILITY", "END_TURN", "ROLL_INITIATIVE", "SET_SEED"]);

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
    case "DEFEND":
      if (!action.entityId) return [makeError(ErrorCode.INVALID_ACTION, "DEFEND requires entityId")];
      break;
    case "USE_ABILITY":
      if (!action.casterId) return [makeError(ErrorCode.INVALID_ACTION, "USE_ABILITY requires casterId")];
      if (!action.abilityId) return [makeError(ErrorCode.INVALID_ACTION, "USE_ABILITY requires abilityId")];
      if (!action.targetId) return [makeError(ErrorCode.INVALID_ACTION, "USE_ABILITY requires targetId")];
      break;
    case "END_TURN":
      if (!action.entityId) return [makeError(ErrorCode.INVALID_ACTION, "END_TURN requires entityId")];
      break;
    case "ROLL_INITIATIVE":
      break;
    case "SET_SEED":
      if (typeof action.seed !== "string" || !action.seed) {
        return [makeError(ErrorCode.INVALID_ACTION, "SET_SEED requires a non-empty seed string")];
      }
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
    else if (action.type === "DEFEND") actingId = action.entityId;
    else if (action.type === "USE_ABILITY") actingId = action.casterId;

    if (actingId && combat.activeEntityId !== actingId) {
      errors.push(makeError(ErrorCode.NOT_YOUR_TURN, `It is not "${actingId}"'s turn (active: "${combat.activeEntityId}")`));
    }
  }

  return errors;
}

// ── Turn Budget Defaults ────────────────────────────────────────────────

/** @returns {{ movementUsed: number, actionUsed: number, bonusActionUsed: number }} */
export function defaultTurnBudget() {
  return { movementUsed: 0, actionUsed: 0, bonusActionUsed: 0 };
}

/**
 * Ensure combat.turnBudget exists (backwards-compat with old states).
 * @param {object} state
 */
function ensureTurnBudget(state) {
  if (state.combat.mode === "combat" && !state.combat.turnBudget) {
    state.combat.turnBudget = defaultTurnBudget();
  }
}

/**
 * Validate action budget for combat actions.
 * Rejects MOVE if movement already used, ATTACK if action already used.
 * @param {object} state
 * @param {DeclaredAction} action
 * @returns {Array<{code:string,message:string}>}
 */
function validateActionBudget(state, action) {
  if (state.combat.mode !== "combat") return [];
  const budget = state.combat.turnBudget;
  if (!budget) return []; // backwards compat — no budget field yet

  if (action.type === "MOVE" && budget.movementUsed >= 1) {
    return [makeError(ErrorCode.BUDGET_EXHAUSTED ?? "BUDGET_EXHAUSTED", "Movement already used this turn")];
  }
  if (action.type === "ATTACK" && budget.actionUsed >= 1) {
    return [makeError(ErrorCode.BUDGET_EXHAUSTED ?? "BUDGET_EXHAUSTED", "Action already used this turn")];
  }
  if (action.type === "DEFEND" && budget.actionUsed >= 1) {
    return [makeError(ErrorCode.BUDGET_EXHAUSTED ?? "BUDGET_EXHAUSTED", "Action already used this turn")];
  }
  if (action.type === "USE_ABILITY" && budget.actionUsed >= 1) {
    return [makeError(ErrorCode.BUDGET_EXHAUSTED ?? "BUDGET_EXHAUSTED", "Action already used this turn")];
  }
  return [];
}

/**
 * Consume budget after a successful action.
 * @param {object} state — mutated in place
 * @param {DeclaredAction} action
 */
function consumeBudget(state, action) {
  if (state.combat.mode !== "combat") return;
  if (!state.combat.turnBudget) return;
  if (action.type === "MOVE") state.combat.turnBudget.movementUsed += 1;
  if (action.type === "ATTACK") state.combat.turnBudget.actionUsed += 1;
  if (action.type === "DEFEND") state.combat.turnBudget.actionUsed += 1;
  if (action.type === "USE_ABILITY") state.combat.turnBudget.actionUsed += 1;
}

/**
 * Build a summary of a DeclaredAction for the rejection event payload.
 * Includes `type` and any identifying fields, but omits bulky data like paths.
 * @param {DeclaredAction} action
 * @returns {object}
 */
function summarizeAction(action) {
  if (!action || typeof action !== "object") return { type: "UNKNOWN" };
  const summary = { type: action.type ?? "UNKNOWN" };
  if (action.entityId) summary.entityId = action.entityId;
  if (action.attackerId) summary.attackerId = action.attackerId;
  if (action.targetId) summary.targetId = action.targetId;
  return summary;
}

/**
 * Build an ACTION_REJECTED result. Clones previousState, appends exactly one
 * ACTION_REJECTED event to the log, and returns the contract-compliant shape.
 *
 * @param {object} previousState
 * @param {DeclaredAction} action
 * @param {Array<{code:string,message:string}|string>} rawErrors
 * @returns {{ nextState: object, events: object[], success: false, errors: string[] }}
 */
function rejectAction(previousState, action, rawErrors) {
  const clone = structuredClone(previousState);
  const errorStrings = rawErrors.map((e) =>
    typeof e === "string" ? e : `[${e.code}] ${e.message}`
  );
  const eventId = `evt-${(clone.log.events.length + 1).toString().padStart(4, "0")}`;
  const rejectionEvent = {
    id: eventId,
    timestamp: clone.timestamp,
    type: "ACTION_REJECTED",
    payload: {
      action: summarizeAction(action),
      reasons: errorStrings,
    },
  };
  clone.log.events.push(rejectionEvent);
  return {
    nextState: clone,
    events: [rejectionEvent],
    success: false,
    errors: errorStrings,
  };
}

/**
 * Apply DEFEND: entity takes a defensive posture, gaining +2 AC (dodging condition)
 * for 1 round. Costs the entity's action for this turn.
 *
 * @param {object} state — cloned GameState (mutated in place)
 * @param {{ type: "DEFEND"; entityId: string }} action
 * @returns {{ ok: boolean, errors?: Array<{code:string,message:string}> }}
 */
function applyDefend(state, action) {
  const { entityId } = action;

  // Find entity
  const allEntities = [
    ...(state.entities?.players ?? []),
    ...(state.entities?.npcs ?? []),
  ];
  const entity = allEntities.find((e) => e.id === entityId);
  if (!entity) {
    return { ok: false, errors: [makeError(ErrorCode.ENTITY_NOT_FOUND, `Entity "${entityId}" not found`)] };
  }

  // Dead check
  if (entity.conditions.includes("dead")) {
    return { ok: false, errors: [makeError(ErrorCode.DEAD_ENTITY, `Entity "${entityId}" is dead`)] };
  }

  // Apply "dodging" condition (+2 AC for 1 round)
  applyCondition(entity, "dodging", 1);

  // Heal 2 HP (capped at hpMax) — defensive recovery
  const hpBefore = entity.stats.hpCurrent;
  entity.stats.hpCurrent = Math.min(entity.stats.hpCurrent + 2, entity.stats.hpMax);
  const hpHealed = entity.stats.hpCurrent - hpBefore;

  // Log DEFEND_APPLIED event
  const eventId = `evt-${(state.log.events.length + 1).toString().padStart(4, "0")}`;
  state.log.events.push({
    id: eventId,
    timestamp: state.timestamp,
    type: "DEFEND_APPLIED",
    payload: {
      entityId,
      condition: "dodging",
      acBonus: 2,
      duration: 1,
      effectiveAc: entity.stats.ac + 2,
      hpHealed,
      hpAfter: entity.stats.hpCurrent,
    },
  });

  return { ok: true, errors: [] };
}

/**
 * Apply SET_SEED: change the RNG seed and log the event.
 * Allowed in any mode (exploration or combat).
 *
 * @param {object} state — cloned GameState (mutated in place)
 * @param {{ type: "SET_SEED"; seed: string }} action
 * @returns {{ ok: boolean, errors?: Array<{code:string,message:string}> }}
 */
function applySetSeed(state, action) {
  const previousSeed = state.rng.seed;
  const previousMode = state.rng.mode;

  state.rng.seed = action.seed;
  state.rng.mode = "seeded";
  state.rng.lastRolls = [];

  const eventId = `evt-${(state.log.events.length + 1).toString().padStart(4, "0")}`;
  state.log.events.push({
    id: eventId,
    timestamp: state.timestamp,
    type: "RNG_SEED_SET",
    payload: {
      previousSeed: previousSeed ?? null,
      previousMode,
      nextSeed: action.seed,
      mode: "seeded",
    },
  });

  return { ok: true };
}

/**
 * Core state transition function.
 *
 * @param {object} previousState — current GameState
 * @param {DeclaredAction} declaredAction
 * @returns {{ nextState: object, events: object[], success: boolean, errors?: string[] }}
 */
export function applyAction(previousState, declaredAction) {
  // 1. Validate schema — state-level failure, no events
  const schemaResult = validateGameState(previousState);
  if (!schemaResult.ok) {
    return {
      nextState: previousState,
      events: [],
      success: false,
      errors: schemaResult.errors.map((e) => `[SCHEMA] ${e}`),
    };
  }

  // 2. Validate invariants on input state — state-level failure, no events
  const preInvResult = validateInvariants(previousState);
  if (!preInvResult.ok) {
    return {
      nextState: previousState,
      events: [],
      success: false,
      errors: preInvResult.errors.map((e) => `[PRE_INVARIANT] ${e}`),
    };
  }

  // 3a. Validate action shape — action-level failure, ACTION_REJECTED
  const shapeErrors = validateActionShape(declaredAction);
  if (shapeErrors.length > 0) {
    return rejectAction(previousState, declaredAction, shapeErrors);
  }

  // 3b. Validate turn-order preconditions — action-level failure, ACTION_REJECTED
  const turnErrors = validateTurnOrder(previousState, declaredAction);
  if (turnErrors.length > 0) {
    return rejectAction(previousState, declaredAction, turnErrors);
  }

  // 3c. Validate action budget — action-level failure, ACTION_REJECTED
  const budgetErrors = validateActionBudget(previousState, declaredAction);
  if (budgetErrors.length > 0) {
    return rejectAction(previousState, declaredAction, budgetErrors);
  }

  // 4. Clone state and apply mutation
  const clone = structuredClone(previousState);
  ensureTurnBudget(clone);
  const eventsBefore = clone.log.events.length;
  let result;

  switch (declaredAction.type) {
    case "MOVE":
      result = applyMove(clone, declaredAction);
      break;
    case "ATTACK":
      result = applyAttack(clone, declaredAction);
      break;
    case "DEFEND":
      result = applyDefend(clone, declaredAction);
      break;
    case "USE_ABILITY":
      result = applyAbility(clone, declaredAction);
      break;
    case "ROLL_INITIATIVE":
      result = applyRollInitiative(clone);
      break;
    case "END_TURN":
      result = applyEndTurn(clone, declaredAction);
      break;
    case "SET_SEED":
      result = applySetSeed(clone, declaredAction);
      break;
    default:
      return rejectAction(previousState, declaredAction, [
        makeError(ErrorCode.INVALID_ACTION, "Unhandled action type"),
      ]);
  }

  if (!result.ok) {
    return rejectAction(previousState, declaredAction, result.errors);
  }

  // 4a. Consume action budget on success
  consumeBudget(clone, declaredAction);

  // 4b. Check if combat should end (after ATTACK kills last enemy, etc.)
  if (clone.combat.mode === "combat") {
    checkCombatEnd(clone);
  }

  // 5. Validate invariants on resulting state
  const postInvResult = validateInvariants(clone);
  if (!postInvResult.ok) {
    // Rollback: reject with post-invariant errors
    return rejectAction(
      previousState,
      declaredAction,
      postInvResult.errors.map((e) => makeError(ErrorCode.POST_INVARIANT, e))
    );
  }

  // 6. Return success with events
  const newEvents = clone.log.events.slice(eventsBefore);
  return { nextState: clone, events: newEvents, success: true };
}
