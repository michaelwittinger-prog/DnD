/**
 * intentExecutor.mjs — Executes ActionPlans from the Intent Planner.
 *
 * Takes an ActionPlan (ordered DeclaredActions) and runs them through
 * the engine sequentially. Handles partial success: if an action fails,
 * continues with remaining actions where possible.
 *
 * This is the top-level orchestrator for the intent pipeline:
 *   parseIntent() → planFromIntent() → executeIntentPlan()
 *
 * Safety: Engine is ALWAYS the authority. Failed actions are logged,
 * not retried with modified parameters (that would bypass validation).
 */

import { applyAction } from "../engine/applyAction.mjs";
import { parseIntent } from "./mockIntentParser.mjs";
import { planFromIntent } from "./intentPlanner.mjs";

// ── Main Entry Point ─────────────────────────────────────────────────

/**
 * Full intent pipeline: parse → plan → execute.
 *
 * @param {object} state       — current GameState
 * @param {string} playerInput — natural language text
 * @returns {IntentResult}
 *
 * @typedef {Object} IntentResult
 * @property {boolean} ok            — true if at least one action succeeded
 * @property {object}  finalState    — the state after all successful actions
 * @property {object[]} results      — per-action results (success/failure)
 * @property {object[]} allEvents    — all engine events accumulated
 * @property {string}  narrationHint — human-readable summary
 * @property {object}  intent        — the parsed PlayerIntent
 * @property {object}  plan          — the ActionPlan
 * @property {"mock"|"real"} mode    — which parser produced the intent
 * @property {number}  durationMs    — total pipeline duration
 */
export function executeIntent(state, playerInput) {
  const t0 = Date.now();

  // ── Step 1: Parse intent ────────────────────────────────────────
  const intent = parseIntent(playerInput);

  // ── Step 2: Plan actions ────────────────────────────────────────
  const plan = planFromIntent(state, intent);

  if (!plan.ok) {
    return {
      ok: false,
      finalState: state,
      state,
      results: [],
      allEvents: [],
      events: [],
      actions: [],
      actionsExecuted: 0,
      narrationHint: plan.error || "Could not plan any actions",
      intent,
      plan,
      mode: "mock",
      durationMs: Date.now() - t0,
    };
  }

  // ── Step 3: Execute actions sequentially ────────────────────────
  const executionResult = executePlan(state, plan);

  return {
    ...executionResult,
    intent,
    plan,
    mode: "mock",
    durationMs: Date.now() - t0,
  };
}

/**
 * Execute a pre-built ActionPlan against the engine.
 * Useful when the intent was parsed by the LLM instead of the mock parser.
 *
 * @param {object} state — current GameState
 * @param {object} plan  — ActionPlan from planFromIntent()
 * @returns {object} — partial IntentResult (without intent/plan/mode)
 */
export function executePlan(state, plan) {
  if (!plan.ok || !plan.actions.length) {
    return {
      ok: false,
      finalState: state,
      results: [],
      allEvents: [],
      narrationHint: plan.error || "No actions to execute",
    };
  }

  let currentState = state;
  const results = [];
  const allEvents = [];
  let anySuccess = false;

  for (const action of plan.actions) {
    const result = applyAction(currentState, action);

    results.push({
      action,
      success: result.success,
      errors: result.errors ?? [],
      events: result.events ?? [],
    });

    if (result.success) {
      currentState = result.nextState;
      allEvents.push(...(result.events ?? []));
      anySuccess = true;
    } else {
      // Log failure but continue — partial execution is valid
      // (e.g., "move and attack" — move succeeds, attack fails because out of range)
      allEvents.push(...(result.events ?? []));
      // Don't update state on failure — engine returns unchanged state
    }
  }

  // Build narration hint
  let narrationHint = plan.narrationHint;
  const failedCount = results.filter(r => !r.success).length;
  if (failedCount > 0 && anySuccess) {
    narrationHint += ` (${failedCount} action${failedCount > 1 ? "s" : ""} failed)`;
  } else if (!anySuccess) {
    const reasons = results.flatMap(r => r.errors).join("; ");
    narrationHint = `Failed: ${reasons || "unknown error"}`;
  }

  const actionsExecuted = results.filter(r => r.success).length;

  return {
    ok: anySuccess,
    // Canonical names
    finalState: currentState,
    results,
    allEvents,
    narrationHint,
    // UI-compatible aliases (main.mjs reads these)
    state: currentState,
    events: allEvents,
    actions: plan.actions,
    actionsExecuted,
  };
}

/**
 * Convenience: parse intent only (no planning/execution).
 * Useful for testing or UI preview.
 */
export { parseIntent } from "./mockIntentParser.mjs";
export { planFromIntent } from "./intentPlanner.mjs";
