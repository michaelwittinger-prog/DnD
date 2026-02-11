/**
 * aiClient.mjs — MIR 3.2 AI Proposal Client.
 *
 * Orchestrates the AI proposal loop:
 *   1. Build prompt from state + player input
 *   2. Call OpenAI API (or mock for browser/offline)
 *   3. Parse and validate response via safety layer
 *   4. Return validated DeclaredAction (or rejection)
 *
 * Hard constraints:
 *   - AI cannot mutate GameState
 *   - AI only produces DeclaredAction proposals
 *   - Engine remains authoritative
 *   - No direct AI access to RNG
 *   - All AI outputs logged in redacted form
 *
 * Node: uses proposeAction() with real OpenAI API
 * Browser: uses proposeActionMock() with keyword matching
 */

import { getClient } from "../adapters/openaiClient.mjs";
import { buildMessages } from "./aiPromptTemplate.mjs";
import { parseAiAction } from "./aiActionParser.mjs";

// ── Configuration ───────────────────────────────────────────────────────

/**
 * AI client configuration. Immutable defaults, overridable per-call.
 */
export const AI_CONFIG = Object.freeze({
  /** Model name — override with OPENAI_MODEL env var */
  model: "gpt-4o-mini",
  /** Temperature — fixed low for determinism. 0 = greedy */
  temperature: 0,
  /** Max response tokens — hard cap to prevent runaway */
  maxTokens: 256,
  /** Response format — force JSON output */
  responseFormat: "json_object",
});

// ── Logging / Redaction ─────────────────────────────────────────────────

/**
 * Redact raw AI text for safe logging.
 * Truncates long responses and masks potential PII patterns.
 *
 * @param {string} raw
 * @param {number} [maxLen=500]
 * @returns {string}
 */
function redactForLog(raw, maxLen = 500) {
  if (!raw) return "(empty)";
  let safe = raw.replace(/sk-[A-Za-z0-9]{20,}/g, "sk-***REDACTED***");
  if (safe.length > maxLen) {
    safe = safe.slice(0, maxLen) + `… [truncated, ${raw.length} chars total]`;
  }
  return safe;
}

/**
 * Log an AI proposal result in a safe, redacted way.
 *
 * @param {string} playerInput
 * @param {object} result — AiProposalResult
 * @param {"real"|"mock"} mode
 */
function logProposal(playerInput, result, mode) {
  const tag = mode === "real" ? "[AI:real]" : "[AI:mock]";
  console.log(`${tag} Input: "${playerInput}"`);
  console.log(`${tag} Raw:   ${redactForLog(result.rawText)}`);
  console.log(`${tag} Parse: ok=${result.ok}${result.reason ? " — " + result.reason : ""}`);
  if (result.ok) {
    console.log(`${tag} Action: ${JSON.stringify(result.action)}`);
  }
  console.log(`${tag} Duration: ${result.durationMs}ms`);
}

// ── Types ───────────────────────────────────────────────────────────────

/**
 * @typedef {Object} AiProposalResult
 * @property {boolean} ok        — true if a valid DeclaredAction was produced
 * @property {object}  [action]  — the validated DeclaredAction (if ok)
 * @property {string}  [reason]  — rejection reason (if !ok)
 * @property {string}  rawText   — raw AI response text (redacted for display)
 * @property {number}  durationMs — API call duration in milliseconds
 * @property {"real"|"mock"} mode — which path produced this result
 */

// ── Real OpenAI Client (Node) ───────────────────────────────────────────

/**
 * Propose a DeclaredAction from natural language player input via OpenAI API.
 *
 * @param {object} state       — current GameState (read-only, not modified)
 * @param {string} playerInput — natural language command from the player
 * @param {object} [opts]      — optional overrides
 * @param {string} [opts.model]       — model name override
 * @param {number} [opts.maxTokens]   — max response tokens
 * @param {number} [opts.temperature] — temperature (clamped to 0–0.3)
 * @returns {Promise<AiProposalResult>}
 */
export async function proposeAction(state, playerInput, opts = {}) {
  const model = opts.model || process.env.OPENAI_MODEL || AI_CONFIG.model;
  const maxTokens = opts.maxTokens ?? AI_CONFIG.maxTokens;
  // Clamp temperature to safe range [0, 0.3] — no creative hallucinations
  const temperature = Math.min(Math.max(opts.temperature ?? AI_CONFIG.temperature, 0), 0.3);

  const messages = buildMessages(state, playerInput);
  const t0 = Date.now();
  let rawText = "";

  try {
    const client = getClient();

    const requestParams = {
      model,
      messages,
      max_tokens: maxTokens,
      temperature,
    };

    // Enforce JSON response format when supported by the model
    if (AI_CONFIG.responseFormat === "json_object") {
      requestParams.response_format = { type: "json_object" };
    }

    const response = await client.chat.completions.create(requestParams);

    rawText = response.choices?.[0]?.message?.content ?? "";
    const durationMs = Date.now() - t0;

    // Parse and validate through safety layer
    const parseResult = parseAiAction(rawText);

    const result = parseResult.ok
      ? { ok: true, action: parseResult.action, rawText, durationMs, mode: "real" }
      : { ok: false, reason: parseResult.reason, rawText, durationMs, mode: "real" };

    logProposal(playerInput, result, "real");
    return result;
  } catch (err) {
    const durationMs = Date.now() - t0;
    const result = {
      ok: false,
      reason: `API error: ${err.message}`,
      rawText,
      durationMs,
      mode: "real",
    };
    logProposal(playerInput, result, "real");
    return result;
  }
}

// ── Mock Client (Browser / Offline) ─────────────────────────────────────

/**
 * Mock proposal for offline / browser testing.
 * Attempts a simple keyword-based parse without calling any API.
 *
 * @param {object} state       — current GameState
 * @param {string} playerInput — natural language command
 * @returns {AiProposalResult}
 */
export function proposeActionMock(state, playerInput) {
  const t0 = Date.now();
  const input = playerInput.toLowerCase().trim();

  const allEntities = [
    ...state.entities.players,
    ...state.entities.npcs,
    ...state.entities.objects,
  ];

  let action = null;

  if (input.startsWith("roll initiative") || input.startsWith("start combat")) {
    action = { type: "ROLL_INITIATIVE" };
  } else if (input.startsWith("end turn")) {
    const activeId = state.combat.activeEntityId;
    if (activeId) {
      action = { type: "END_TURN", entityId: activeId };
    }
  } else if (input.includes("attack")) {
    const match = input.match(/attack\s+(.+)/);
    if (match) {
      const target = findEntityByNameOrId(allEntities, match[1].trim());
      const attacker = state.combat.mode === "combat"
        ? state.combat.activeEntityId
        : state.entities.players[0]?.id;
      if (target && attacker) {
        action = { type: "ATTACK", attackerId: attacker, targetId: target.id };
      }
    }
  } else if (input.includes("move") || input.includes("go to")) {
    const coordMatch = input.match(/(\d+)\s*[,\s]\s*(\d+)/);
    if (coordMatch) {
      const tx = parseInt(coordMatch[1], 10);
      const ty = parseInt(coordMatch[2], 10);
      let mover = state.combat.mode === "combat"
        ? state.combat.activeEntityId
        : state.entities.players[0]?.id;

      for (const ent of allEntities) {
        if (input.includes(ent.name.toLowerCase()) || input.includes(ent.id.toLowerCase())) {
          mover = ent.id;
          break;
        }
      }

      if (mover) {
        const ent = allEntities.find((e) => e.id === mover);
        if (ent) {
          const path = buildCardinalPath(ent.position, { x: tx, y: ty });
          if (path.length > 0) {
            action = { type: "MOVE", entityId: mover, path };
          }
        }
      }
    }
  }

  const durationMs = Date.now() - t0;
  const rawText = action
    ? JSON.stringify(action)
    : `{"type":"INVALID","reason":"Could not parse: ${playerInput}"}`;

  const result = action
    ? { ok: true, action, rawText, durationMs, mode: "mock" }
    : { ok: false, reason: `Mock parser could not understand: "${playerInput}"`, rawText, durationMs, mode: "mock" };

  logProposal(playerInput, result, "mock");
  return result;
}

// ── Helpers ─────────────────────────────────────────────────────────────

function findEntityByNameOrId(entities, query) {
  const q = query.toLowerCase();
  return entities.find(
    (e) => e.id.toLowerCase() === q || e.name.toLowerCase() === q
  ) || null;
}

function buildCardinalPath(from, to) {
  const path = [];
  let { x, y } = from;
  while (x !== to.x) {
    x += x < to.x ? 1 : -1;
    path.push({ x, y });
  }
  while (y !== to.y) {
    y += y < to.y ? 1 : -1;
    path.push({ x, y });
  }
  return path;
}
