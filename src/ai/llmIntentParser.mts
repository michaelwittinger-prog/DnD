/**
 * llmIntentParser.mjs — LLM-powered intent parsing.
 *
 * Sends player input + game state context to an LLM via the model adapter,
 * receives a structured PlayerIntent JSON back.
 *
 * SAFETY GUARANTEES:
 *   1. LLM output is validated against intentTypes.validateIntent()
 *   2. Falls back to mockIntentParser on any failure (network, parse, validation)
 *   3. LLM never sees RNG seeds or internal engine state
 *   4. Output is inert data — only the engine can modify GameState
 *
 * The LLM understands; the engine decides.
 */

import { validateIntent, INTENT_TYPES } from "./intentTypes.mjs";
import { parseIntent as mockParseIntent } from "./mockIntentParser.mjs";
import { buildIntentMessages } from "./intentPromptBuilder.mjs";

// ── Main Entry Point ─────────────────────────────────────────────────

/**
 * Parse player input into a PlayerIntent using an LLM.
 *
 * @param {string} playerInput — natural language command
 * @param {object} state — current GameState (for context)
 * @param {object} adapter — ModelAdapter with .call(prompt, state, options)
 * @param {object} [options]
 * @param {number} [options.temperature=0.1] — low temp for classification
 * @param {number} [options.maxTokens=200] — intents are small JSON
 * @param {boolean} [options.fallbackToMock=true] — use mock parser on failure
 * @returns {Promise<LLMParseResult>}
 *
 * @typedef {Object} LLMParseResult
 * @property {object} intent — the PlayerIntent object
 * @property {"llm"|"mock"} source — which parser produced it
 * @property {boolean} validated — whether it passed validateIntent()
 * @property {string|null} error — error message if LLM failed
 * @property {number} latencyMs — time for the LLM call
 * @property {object} [usage] — token usage from the adapter
 */
export async function parseLLMIntent(playerInput, state, adapter, options = {}) {
  const {
    temperature = 0.1,
    maxTokens = 200,
    fallbackToMock = true,
  } = options;

  const t0 = Date.now();

  // ── Guard: no adapter ──────────────────────────────────────────
  if (!adapter || typeof adapter.call !== "function") {
    if (fallbackToMock) {
      return mockFallback(playerInput, "No adapter available", Date.now() - t0);
    }
    return {
      intent: { type: INTENT_TYPES.UNKNOWN, hint: "No AI adapter available", raw: playerInput },
      source: "mock",
      validated: true,
      error: "No adapter available",
      latencyMs: Date.now() - t0,
    };
  }

  // ── Build prompt ───────────────────────────────────────────────
  const messages = buildIntentMessages(playerInput, state);
  const prompt = messages.map(m => `[${m.role}]\n${m.content}`).join("\n\n");

  try {
    // ── Call LLM ───────────────────────────────────────────────
    const result = await adapter.call(prompt, state, { temperature, maxTokens });

    if (!result.ok) {
      if (fallbackToMock) {
        return mockFallback(playerInput, result.error || "LLM call failed", Date.now() - t0);
      }
      return {
        intent: { type: INTENT_TYPES.UNKNOWN, hint: result.error, raw: playerInput },
        source: "llm",
        validated: false,
        error: result.error,
        latencyMs: Date.now() - t0,
        usage: result.usage,
      };
    }

    // ── Parse response ─────────────────────────────────────────
    const intent = extractIntent(result.response);

    if (!intent) {
      if (fallbackToMock) {
        return mockFallback(playerInput, "Could not parse LLM response as intent", Date.now() - t0);
      }
      return {
        intent: { type: INTENT_TYPES.UNKNOWN, hint: "Unparseable LLM output", raw: playerInput },
        source: "llm",
        validated: false,
        error: "Could not parse LLM response",
        latencyMs: Date.now() - t0,
        usage: result.usage,
      };
    }

    // ── Validate intent ────────────────────────────────────────
    const validation = validateIntent(intent);

    if (!validation.ok) {
      if (fallbackToMock) {
        return mockFallback(playerInput, `LLM intent invalid: ${validation.reason}`, Date.now() - t0);
      }
      return {
        intent,
        source: "llm",
        validated: false,
        error: `Validation failed: ${validation.reason}`,
        latencyMs: Date.now() - t0,
        usage: result.usage,
      };
    }

    // ── Success ────────────────────────────────────────────────
    // Attach raw input for logging
    intent.raw = playerInput;

    return {
      intent,
      source: "llm",
      validated: true,
      error: null,
      latencyMs: Date.now() - t0,
      usage: result.usage,
    };

  } catch (err) {
    if (fallbackToMock) {
      return mockFallback(playerInput, `LLM exception: ${err.message}`, Date.now() - t0);
    }
    return {
      intent: { type: INTENT_TYPES.UNKNOWN, hint: err.message, raw: playerInput },
      source: "llm",
      validated: false,
      error: err.message,
      latencyMs: Date.now() - t0,
    };
  }
}

// ── Response Extraction ─────────────────────────────────────────────

/**
 * Extract a PlayerIntent from the LLM response.
 * Handles both raw object responses and string responses.
 *
 * @param {object|string} response — LLM adapter response
 * @returns {object|null} — PlayerIntent or null
 */
export function extractIntent(response) {
  if (!response) return null;

  // If adapter already parsed it as an object with a type
  if (typeof response === "object" && response.type) {
    return response;
  }

  // If it's an object with a nested intent
  if (typeof response === "object") {
    // Some adapters wrap in { intent: {...} }
    if (response.intent && typeof response.intent === "object") {
      return response.intent;
    }
    // Some adapters return { actions: [...] } — try first action
    if (Array.isArray(response.actions) && response.actions[0]?.type) {
      return response.actions[0];
    }
    // Try text field
    if (typeof response.text === "string") {
      return extractIntentFromString(response.text);
    }
    if (typeof response.content === "string") {
      return extractIntentFromString(response.content);
    }
    return null;
  }

  // If it's a string, try to parse JSON from it
  if (typeof response === "string") {
    return extractIntentFromString(response);
  }

  return null;
}

/**
 * Extract JSON intent from a string (may contain markdown fences, extra text).
 *
 * @param {string} text
 * @returns {object|null}
 */
function extractIntentFromString(text) {
  if (!text || typeof text !== "string") return null;

  // Strip markdown code fences if present
  let cleaned = text.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, "").replace(/\n?```\s*$/i, "");

  // Try direct parse
  try {
    const obj = JSON.parse(cleaned);
    if (obj && typeof obj === "object" && obj.type) return obj;
  } catch { /* continue */ }

  // Try to find JSON object in the text
  const jsonMatch = cleaned.match(/\{[\s\S]*?\}/);
  if (jsonMatch) {
    try {
      const obj = JSON.parse(jsonMatch[0]);
      if (obj && typeof obj === "object" && obj.type) return obj;
    } catch { /* continue */ }
  }

  return null;
}

// ── Mock Fallback ───────────────────────────────────────────────────

/**
 * Fall back to the mock parser when LLM fails.
 *
 * @param {string} playerInput
 * @param {string} reason — why LLM failed
 * @param {number} elapsedMs
 * @returns {LLMParseResult}
 */
function mockFallback(playerInput, reason, elapsedMs) {
  const intent = mockParseIntent(playerInput);
  return {
    intent,
    source: "mock",
    validated: true,
    error: `Fallback: ${reason}`,
    latencyMs: elapsedMs,
  };
}
