/**
 * ai/index.mjs — MIR AI Module Barrel Export.
 *
 * Single entry point for all AI functionality.
 * External modules should import from here, not from internal files.
 *
 * Usage:
 *   import { executeIntent, parseIntent, planFromIntent } from "../ai/index.mjs";
 */

// ── Intent-Based AI Pipeline (new, preferred) ───────────────────────
export { INTENT_TYPES, DIRECTIONS, TARGET_SELECTORS, validateIntent, isTacticalSelector } from "./intentTypes.mjs";
export { parseIntent } from "./mockIntentParser.mjs";
export { planFromIntent } from "./intentPlanner.mjs";
export { executeIntent, executePlan } from "./intentExecutor.mjs";

// ── LLM-Powered Intent Parsing (organic language) ───────────────────
export { parseLLMIntent, extractIntent } from "./llmIntentParser.mjs";
export { buildIntentMessages, buildIntentSystemPrompt, summarizeStateForParsing } from "./intentPromptBuilder.mjs";

// ── Legacy AI Client (OpenAI direct action proposal) ────────────────
export { proposeAction, proposeActionMock, AI_CONFIG } from "./aiClient.mjs";
export { parseAiAction } from "./aiActionParser.mjs";
export { buildMessages } from "./aiPromptTemplate.mjs";
