/**
 * validation/index.mjs — MIR 2.2 Unified Validation Module.
 *
 * Single source of truth for GameState validation.
 * Used by BOTH Node engine and browser UI — identical schema enforcement.
 *
 * Schema validation:  Pre-compiled standalone validator (zero runtime deps).
 * Invariant validation: Pure JS logic (zero deps).
 *
 * Neither layer requires Ajv at runtime. Schema changes require
 * regeneration: node scripts/compile-schemas.mjs
 *
 * Exports:
 *   validateGameState(state)  — JSON Schema check
 *   validateInvariants(state) — 25 game-logic invariants
 *   validateAll(state)        — both layers merged
 */

import { validate as compiledValidate } from "./compiledValidate.mjs";
import { validateInvariants } from "./invariants.mjs";

/**
 * Validate a GameState against the JSON Schema.
 * Uses the pre-compiled standalone validator.
 *
 * @param {object} state
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateGameState(state) {
  const valid = compiledValidate(state);
  if (valid) return { ok: true, errors: [] };
  const errors = (compiledValidate.errors ?? []).map(
    (e) =>
      `${e.instancePath || "/"} ${e.message}${e.params ? " " + JSON.stringify(e.params) : ""}`
  );
  return { ok: false, errors };
}

// Re-export invariants from the canonical source
export { validateInvariants };

/**
 * Full validation: schema + invariants merged.
 * @param {object} state
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateAll(state) {
  const sr = validateGameState(state);
  if (!sr.ok) return { ok: false, errors: sr.errors.map((e) => `[schema] ${e}`) };
  return validateInvariants(state);
}
