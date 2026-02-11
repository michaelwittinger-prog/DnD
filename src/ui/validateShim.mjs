/**
 * validateShim.mjs — DEPRECATED (MIR 2.2).
 *
 * The browser validation gap is resolved. Schema validation now runs
 * identically in Node and browser via the pre-compiled standalone validator
 * at src/state/validation/compiledValidate.mjs (zero runtime deps).
 *
 * This shim is kept only as a re-export for backward compatibility.
 * The canonical source is: src/state/validation/index.mjs
 */

export { validateGameState, validateInvariants, validateAll } from "../state/validation/index.mjs";
