/**
 * state/index.mjs — MIR State Module Barrel Export.
 *
 * Single entry point for all state validation and example data.
 * External modules should import from here, not from internal files.
 *
 * Usage:
 *   import { validateAll, validateGameState, validateInvariants } from "../state/index.mjs";
 */

export {
  validateGameState,
  validateInvariants,
  validateAll,
} from "./validation/index.mjs";

export {
  explorationExample,
  combatExample,
  demoEncounter,
  invalidExample,
} from "./exampleStates.mjs";
