/**
 * combatController.mjs — MIR Combat Orchestrator.
 *
 * High-level combat loop that coordinates:
 *   - Initiative rolling
 *   - Turn-by-turn execution
 *   - NPC auto-turns via planNpcTurn
 *   - Event narration
 *   - Combat end detection (handled automatically by applyAction)
 *
 * All functions are pure or produce side effects only through applyAction.
 */

import { applyAction } from "./applyAction.mjs";
import { planNpcTurn, isNpcTurn } from "./npcTurnStrategy.mjs";
import { narrateEvent } from "./narrateEvent.mjs";

/**
 * Execute an NPC's turn automatically.
 * Plans actions via planNpcTurn, then executes each via applyAction.
 *
 * @param {object} state — current GameState
 * @param {string} entityId — NPC entity ID
 * @returns {{ state: object, events: object[], narration: string[], success: boolean, errors: string[] }}
 */
export function executeNpcTurn(state, entityId) {
  const plan = planNpcTurn(state, entityId);
  const allEvents = [];
  const allNarration = [];
  let currentState = state;
  let success = true;
  const errors = [];

  for (const action of plan.actions) {
    const result = applyAction(currentState, action);
    allEvents.push(...result.events);

    if (result.success) {
      currentState = result.nextState;
      for (const evt of result.events) {
        allNarration.push(narrateEvent(evt, currentState));
      }
    } else {
      currentState = result.nextState;
      for (const evt of result.events) {
        allNarration.push(narrateEvent(evt, currentState));
      }
      if (action.type === "END_TURN") {
        success = false;
        errors.push(...(result.errors ?? []));
        break;
      }
      // Non-END_TURN failures are non-critical; continue to END_TURN
      errors.push(...(result.errors ?? []));
    }

    // If combat ended mid-turn, stop executing further actions
    if (currentState.combat.mode !== "combat") break;
  }

  return { state: currentState, events: allEvents, narration: allNarration, success, errors };
}

/**
 * Run a full combat simulation from a state in exploration mode.
 * Rolls initiative, then runs all NPC turns automatically while
 * auto-ending player turns (for testing/demo purposes only).
 *
 * @param {object} initialState — GameState in exploration mode
 * @param {object} [opts]
 * @param {number} [opts.maxRounds=10] — safety limit
 * @param {function} [opts.onPlayerTurn] — callback(state, entityId) → DeclaredAction[]
 *   If not provided, players auto-END_TURN.
 * @returns {{ state: object, events: object[], narration: string[], rounds: number }}
 */
export function simulateCombat(initialState, opts = {}) {
  const { maxRounds = 10, onPlayerTurn } = opts;
  const allEvents = [];
  const allNarration = [];

  // Roll initiative
  const initResult = applyAction(initialState, { type: "ROLL_INITIATIVE" });
  if (!initResult.success) {
    return { state: initialState, events: [], narration: ["Failed to start combat."], rounds: 0 };
  }

  let state = initResult.nextState;
  allEvents.push(...initResult.events);
  for (const evt of initResult.events) {
    allNarration.push(narrateEvent(evt, state));
  }

  let rounds = 0;
  let turnCount = 0;
  const maxTurns = maxRounds * (state.combat.initiativeOrder?.length ?? 4);

  while (state.combat.mode === "combat" && turnCount < maxTurns) {
    turnCount++;
    const activeId = state.combat.activeEntityId;
    if (!activeId) break;

    const currentRound = state.combat.round;
    if (currentRound > rounds) rounds = currentRound;
    if (rounds > maxRounds) break;

    if (isNpcTurn(state)) {
      // NPC auto-turn
      const result = executeNpcTurn(state, activeId);
      state = result.state;
      allEvents.push(...result.events);
      allNarration.push(...result.narration);
    } else {
      // Player turn
      if (onPlayerTurn) {
        const actions = onPlayerTurn(state, activeId);
        for (const action of actions) {
          const result = applyAction(state, action);
          allEvents.push(...result.events);
          if (result.success) {
            state = result.nextState;
            for (const evt of result.events) {
              allNarration.push(narrateEvent(evt, state));
            }
          } else {
            state = result.nextState;
            for (const evt of result.events) {
              allNarration.push(narrateEvent(evt, state));
            }
          }
          if (state.combat.mode !== "combat") break;
        }
      } else {
        // Auto-end player turn (testing mode)
        const result = applyAction(state, { type: "END_TURN", entityId: activeId });
        allEvents.push(...result.events);
        if (result.success) {
          state = result.nextState;
          for (const evt of result.events) {
            allNarration.push(narrateEvent(evt, state));
          }
        } else {
          break;
        }
      }
    }
  }

  return { state, events: allEvents, narration: allNarration, rounds };
}
