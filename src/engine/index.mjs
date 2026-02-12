/**
 * engine/index.mjs — MIR Engine Module Barrel Export.
 *
 * Single entry point for all engine functionality.
 * External modules should import from here, not from internal files.
 *
 * Usage:
 *   import { applyAction } from "../engine/index.mjs";
 */

export { applyAction } from "./applyAction.mjs";
export { applyMove } from "./movement.mjs";
export { applyAttack } from "./attack.mjs";
export { applyRollInitiative, applyEndTurn } from "./initiative.mjs";
export { rollD20, rollDice, hashSeed } from "./rng.mjs";
export { ErrorCode, makeError } from "./errors.mjs";
export { findPath, findPathToAdjacent, isAdjacent, getHostileEntities } from "./pathfinding.mjs";
export { checkCombatEnd, findNextLivingEntity } from "./combatEnd.mjs";
export { planNpcTurn, isNpc, isNpcTurn } from "./npcTurnStrategy.mjs";
export { narrateEvent, narrateEvents } from "./narrateEvent.mjs";
export { executeNpcTurn, simulateCombat } from "./combatController.mjs";
export {
  applyCondition, removeCondition, hasCondition,
  processStartOfTurn, processEndOfTurn,
  getAcModifier, getAttackModifier, hasAttackDisadvantage, shouldSkipTurn,
  CONDITION_DEFS,
} from "./conditions.mjs";
export { applyAbility, ABILITY_CATALOGUE, tickCooldowns } from "./abilities.mjs";
export { computeVisibleCells, isCellVisible, getVisionRange } from "./visibility.mjs";
export {
  DIFFICULTY_PRESETS, getDifficulty, listDifficulties,
  applyDifficultyToEntities, selectTarget, shouldAttack, shouldUseAbility,
  getAttackDifficultyModifier, getDamageDifficultyModifier, getAcDifficultyModifier,
} from "./difficulty.mjs";
