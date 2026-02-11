/**
 * ai/index.mjs — MIR AI Module Barrel Export.
 *
 * Single entry point for all AI functionality.
 * External modules should import from here, not from internal files.
 *
 * Usage:
 *   import { proposeActionMock, parseAiAction } from "../ai/index.mjs";
 */

export { proposeAction, proposeActionMock, AI_CONFIG } from "./aiClient.mjs";
export { parseAiAction } from "./aiActionParser.mjs";
export { buildMessages } from "./aiPromptTemplate.mjs";
