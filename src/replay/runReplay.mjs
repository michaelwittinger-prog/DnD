/**
 * runReplay.mjs — MIR 3.4 Deterministic Replay Runner.
 *
 * Replays a ReplayBundle step-by-step through the engine,
 * validating schema, invariants, events, and state hashes.
 *
 * No AI calls. Fully offline and deterministic.
 */

import { applyAction } from "../engine/applyAction.mjs";
import { validateGameState, validateInvariants } from "../state/validation/index.mjs";
import { stateHash } from "./hash.mjs";

/**
 * @typedef {Object} ReplayStep
 * @property {object} action — DeclaredAction
 * @property {object[]} [expectedEvents] — expected EngineEvents
 * @property {string} [expectedStateHash] — expected state hash after this step
 */

/**
 * @typedef {Object} ReplayBundle
 * @property {object} meta — { id, createdAt, schemaVersion, engineVersion, notes? }
 * @property {object} initialState — GameState
 * @property {ReplayStep[]} steps
 * @property {object} [final] — { expectedStateHash?, expectedKeyFields? }
 */

/**
 * @typedef {Object} ReplayReport
 * @property {boolean} ok
 * @property {number} stepsRun
 * @property {number|null} failingStep — index of first failure (null if ok)
 * @property {string[]} errors
 * @property {string} finalStateHash
 * @property {object[]} eventLog — all produced events
 */

/**
 * Run a replay bundle through the engine.
 *
 * @param {ReplayBundle} bundle
 * @returns {ReplayReport}
 */
export function runReplay(bundle) {
  const errors = [];

  // ── Validate bundle structure ──────────────────────────────────────
  if (!bundle || typeof bundle !== "object") {
    return { ok: false, stepsRun: 0, failingStep: null, errors: ["Bundle must be a non-null object"], finalStateHash: "", eventLog: [] };
  }
  if (!bundle.initialState) {
    return { ok: false, stepsRun: 0, failingStep: null, errors: ["Bundle missing initialState"], finalStateHash: "", eventLog: [] };
  }
  if (!Array.isArray(bundle.steps)) {
    return { ok: false, stepsRun: 0, failingStep: null, errors: ["Bundle missing steps array"], finalStateHash: "", eventLog: [] };
  }

  // ── Validate initial state ─────────────────────────────────────────
  let state = structuredClone(bundle.initialState);

  const schemaResult = validateGameState(state);
  if (!schemaResult.ok) {
    return {
      ok: false, stepsRun: 0, failingStep: null,
      errors: schemaResult.errors.map((e) => `[INITIAL_SCHEMA] ${e}`),
      finalStateHash: stateHash(state), eventLog: [],
    };
  }

  const invResult = validateInvariants(state);
  if (!invResult.ok) {
    return {
      ok: false, stepsRun: 0, failingStep: null,
      errors: invResult.errors.map((e) => `[INITIAL_INVARIANT] ${e}`),
      finalStateHash: stateHash(state), eventLog: [],
    };
  }

  // ── Run steps ──────────────────────────────────────────────────────
  const allEvents = [];

  for (let i = 0; i < bundle.steps.length; i++) {
    const step = bundle.steps[i];

    if (!step.action || typeof step.action !== "object") {
      errors.push(`Step ${i}: missing or invalid action`);
      return {
        ok: false, stepsRun: i, failingStep: i, errors,
        finalStateHash: stateHash(state), eventLog: allEvents,
      };
    }

    const result = applyAction(state, step.action);

    // Collect events
    const produced = result.events || [];
    allEvents.push(...produced);

    // Check success/failure
    if (!result.success && step.action._expectReject !== true) {
      // If the step expects a rejection (has expectedEvents with ACTION_REJECTED), that's fine
      const expectsRejection = step.expectedEvents?.some((e) => e.type === "ACTION_REJECTED");
      if (!expectsRejection) {
        errors.push(`Step ${i}: engine rejected action ${step.action.type}: ${result.errors?.join(", ")}`);
        return {
          ok: false, stepsRun: i, failingStep: i, errors,
          finalStateHash: stateHash(result.nextState), eventLog: allEvents,
        };
      }
    }

    state = result.nextState;

    // ── Compare events if expected ───────────────────────────────────
    if (step.expectedEvents) {
      if (produced.length !== step.expectedEvents.length) {
        errors.push(`Step ${i}: expected ${step.expectedEvents.length} events, got ${produced.length}`);
        return {
          ok: false, stepsRun: i + 1, failingStep: i, errors,
          finalStateHash: stateHash(state), eventLog: allEvents,
        };
      }
      for (let e = 0; e < step.expectedEvents.length; e++) {
        const exp = step.expectedEvents[e];
        const got = produced[e];
        if (exp.type && got.type !== exp.type) {
          errors.push(`Step ${i}, event ${e}: expected type "${exp.type}", got "${got.type}"`);
          return {
            ok: false, stepsRun: i + 1, failingStep: i, errors,
            finalStateHash: stateHash(state), eventLog: allEvents,
          };
        }
      }
    }

    // ── Compare state hash if expected ───────────────────────────────
    if (step.expectedStateHash) {
      const actual = stateHash(state);
      if (actual !== step.expectedStateHash) {
        errors.push(`Step ${i}: state hash mismatch — expected "${step.expectedStateHash}", got "${actual}"`);
        return {
          ok: false, stepsRun: i + 1, failingStep: i, errors,
          finalStateHash: actual, eventLog: allEvents,
        };
      }
    }

    // ── Post-step invariant check ────────────────────────────────────
    const postInv = validateInvariants(state);
    if (!postInv.ok) {
      errors.push(`Step ${i}: post-step invariant violation: ${postInv.errors.join(", ")}`);
      return {
        ok: false, stepsRun: i + 1, failingStep: i, errors,
        finalStateHash: stateHash(state), eventLog: allEvents,
      };
    }
  }

  // ── Final hash check ───────────────────────────────────────────────
  const finalHash = stateHash(state);

  if (bundle.final?.expectedStateHash) {
    if (finalHash !== bundle.final.expectedStateHash) {
      errors.push(`Final state hash mismatch — expected "${bundle.final.expectedStateHash}", got "${finalHash}"`);
      return {
        ok: false, stepsRun: bundle.steps.length, failingStep: null, errors,
        finalStateHash: finalHash, eventLog: allEvents,
      };
    }
  }

  return {
    ok: true,
    stepsRun: bundle.steps.length,
    failingStep: null,
    errors: [],
    finalStateHash: finalHash,
    eventLog: allEvents,
  };
}
