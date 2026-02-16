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

import { buildMessages } from "./aiPromptTemplate.mjs";
import { parseAiAction } from "./aiActionParser.mjs";
import { createLogger } from "../core/logger.mjs";

const log = createLogger("ai");

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
  const level = result.ok ? "info" : "warn";
  log[level]("AI_PROPOSAL", {
    mode,
    input: playerInput,
    ok: result.ok,
    ...(result.ok ? { action: result.action } : { reason: result.reason }),
    raw: redactForLog(result.rawText),
    durationMs: result.durationMs,
  });
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
    // Dynamic import: keeps browser module tree clean (no npm "openai" dep)
    const { getClient } = await import("../adapters/openaiClient.mjs");
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
  let hint = "";

  // ── Initiative ──
  if (input.startsWith("roll initiative") || input.startsWith("start combat") || input === "initiative") {
    action = { type: "ROLL_INITIATIVE" };

  // ── End Turn ──
  } else if (input.startsWith("end turn") || input === "end" || input === "next" || input === "pass") {
    const activeId = state.combat.activeEntityId;
    if (activeId) {
      action = { type: "END_TURN", entityId: activeId };
    } else {
      hint = "No active entity — start combat first with 'roll initiative'";
    }

  // ── Attack ──
  } else if (/\b(attack|hit|strike|fight|slash|swing at|shoot)\b/.test(input)) {
    const attackMatch = input.match(/(?:attack|hit|strike|fight|slash|swing at|shoot)\s+(?:the\s+)?(.+)/);
    if (attackMatch) {
      const target = findEntityFuzzy(allEntities, attackMatch[1].trim());
      const attacker = state.combat.mode === "combat"
        ? state.combat.activeEntityId
        : state.entities.players[0]?.id;
      if (target && attacker) {
        action = { type: "ATTACK", attackerId: attacker, targetId: target.id };
      } else if (!target) {
        const names = allEntities.map(e => e.name).join(", ");
        hint = `Could not find target "${attackMatch[1]}". Known: ${names}`;
      }
    }

  // ── Move ──
  } else if (/\b(move|go|walk|run|step|advance)\b/.test(input) || input.match(/\d+\s*[,\s]\s*\d+/)) {
    const coordMatch = input.match(/(\d+)\s*[,\s]\s*(\d+)/);
    if (coordMatch) {
      const tx = parseInt(coordMatch[1], 10);
      const ty = parseInt(coordMatch[2], 10);
      let mover = state.combat.mode === "combat"
        ? state.combat.activeEntityId
        : state.entities.players[0]?.id;

      // Check if a specific entity is named
      for (const ent of allEntities) {
        if (matchesEntity(input, ent)) {
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
          } else {
            hint = `${ent.name} is already at (${tx},${ty})`;
          }
        }
      } else {
        hint = "No entity to move — load a scenario first";
      }
    } else {
      hint = "Move needs coordinates, e.g. 'move seren to 3,4'";
    }
  } else {
    hint = "Try: 'move seren to 3,4', 'attack goblin', 'roll initiative', 'end turn'";
  }

  const durationMs = Date.now() - t0;
  const rawText = action
    ? JSON.stringify(action)
    : `{"type":"INVALID","reason":"Could not parse: ${playerInput}"}`;

  const result = action
    ? { ok: true, action, rawText, durationMs, mode: "mock" }
    : { ok: false, reason: hint || `Try: 'move seren to 3,4', 'attack goblin', 'roll initiative', 'end turn'`, rawText, durationMs, mode: "mock" };

  logProposal(playerInput, result, "mock");
  return result;
}

// ── Helpers ─────────────────────────────────────────────────────────────

/**
 * Fuzzy entity match: exact > partial name > partial id > first-word match.
 * Strips "the", trims, and lowercases before comparison.
 */
function findEntityFuzzy(entities, query) {
  const q = query.toLowerCase().replace(/^the\s+/, "").trim();
  if (!q) return null;

  // 1. Exact name or id
  const exact = entities.find(
    (e) => e.id.toLowerCase() === q || e.name.toLowerCase() === q
  );
  if (exact) return exact;

  // 2. Partial: name includes query or query includes name fragment
  const partial = entities.find((e) => {
    const name = e.name.toLowerCase();
    const id = e.id.toLowerCase();
    return name.includes(q) || id.includes(q) || q.includes(name);
  });
  if (partial) return partial;

  // 3. First-word match (e.g. "goblin" matches "Goblin Sneak")
  const firstWord = entities.find((e) => {
    const words = e.name.toLowerCase().split(/\s+/);
    return words.some((w) => w === q || q === w);
  });
  if (firstWord) return firstWord;

  // 4. ID fragment without prefix (e.g. "miri" matches "pc-miri")
  const idFrag = entities.find((e) => {
    const idParts = e.id.toLowerCase().split("-");
    return idParts.some((p) => p === q || p.includes(q));
  });
  return idFrag || null;
}

/**
 * Check if the input text mentions this entity by name or id (partial match).
 */
function matchesEntity(input, ent) {
  const name = ent.name.toLowerCase();
  const id = ent.id.toLowerCase();
  // Check full name, first name, or id
  if (input.includes(name) || input.includes(id)) return true;
  const firstName = name.split(/\s+/)[0];
  if (firstName.length >= 3 && input.includes(firstName)) return true;
  // Check id without prefix (e.g. "seren" from "pc-seren")
  const idSuffix = id.split("-").pop();
  if (idSuffix && idSuffix.length >= 3 && input.includes(idSuffix)) return true;
  return false;
}

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
