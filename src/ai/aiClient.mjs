/**
 * aiClient.mjs — MIR 3.1 AI Proposal Client.
 *
 * Orchestrates the AI proposal loop:
 *   1. Build prompt from state + player input
 *   2. Call OpenAI API
 *   3. Parse and validate response
 *   4. Return validated DeclaredAction (or rejection)
 *
 * Hard constraints:
 *   - AI cannot mutate GameState
 *   - AI only produces DeclaredAction proposals
 *   - Engine remains authoritative
 *   - No direct AI access to RNG
 *
 * This module works in Node (server-side). The browser UI calls it
 * via the local API server or uses a mock for offline testing.
 */

import { getClient } from "../adapters/openaiClient.mjs";
import { buildMessages } from "./aiPromptTemplate.mjs";
import { parseAiAction } from "./aiActionParser.mjs";

/**
 * @typedef {Object} AiProposalResult
 * @property {boolean} ok       — true if a valid DeclaredAction was produced
 * @property {object}  [action] — the validated DeclaredAction (if ok)
 * @property {string}  [reason] — rejection reason (if !ok)
 * @property {string}  rawText  — raw AI response text (for debugging)
 * @property {number}  durationMs — API call duration in milliseconds
 */

/** Default model — can be overridden by OPENAI_MODEL env var */
const DEFAULT_MODEL = "gpt-4o-mini";

/**
 * Propose a DeclaredAction from natural language player input.
 *
 * @param {object} state       — current GameState (read-only, not modified)
 * @param {string} playerInput — natural language command from the player
 * @param {object} [opts]      — optional overrides
 * @param {string} [opts.model]       — model name override
 * @param {number} [opts.maxTokens]   — max response tokens (default 256)
 * @param {number} [opts.temperature] — temperature (default 0 for determinism)
 * @returns {Promise<AiProposalResult>}
 */
export async function proposeAction(state, playerInput, opts = {}) {
  const model = opts.model || process.env.OPENAI_MODEL || DEFAULT_MODEL;
  const maxTokens = opts.maxTokens ?? 256;
  const temperature = opts.temperature ?? 0;

  const messages = buildMessages(state, playerInput);
  const t0 = Date.now();
  let rawText = "";

  try {
    const client = getClient();
    const response = await client.chat.completions.create({
      model,
      messages,
      max_tokens: maxTokens,
      temperature,
    });

    rawText = response.choices?.[0]?.message?.content ?? "";
    const durationMs = Date.now() - t0;

    // Parse and validate the AI response
    const parseResult = parseAiAction(rawText);

    if (parseResult.ok) {
      return {
        ok: true,
        action: parseResult.action,
        rawText,
        durationMs,
      };
    } else {
      return {
        ok: false,
        reason: parseResult.reason,
        rawText,
        durationMs,
      };
    }
  } catch (err) {
    const durationMs = Date.now() - t0;
    return {
      ok: false,
      reason: `API error: ${err.message}`,
      rawText,
      durationMs,
    };
  }
}

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

  // Simple keyword matching for common commands
  let action = null;

  if (input.startsWith("roll initiative") || input.startsWith("start combat")) {
    action = { type: "ROLL_INITIATIVE" };
  } else if (input.startsWith("end turn")) {
    const activeId = state.combat.activeEntityId;
    if (activeId) {
      action = { type: "END_TURN", entityId: activeId };
    }
  } else if (input.includes("attack")) {
    // "attack <name>" or "attack <id>"
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
    // "move <entity> to x,y" or "move to x,y"
    const coordMatch = input.match(/(\d+)\s*[,\s]\s*(\d+)/);
    if (coordMatch) {
      const tx = parseInt(coordMatch[1], 10);
      const ty = parseInt(coordMatch[2], 10);
      // Determine which entity to move
      let mover = state.combat.mode === "combat"
        ? state.combat.activeEntityId
        : state.entities.players[0]?.id;

      // Check if a specific entity name is mentioned
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
  const rawText = action ? JSON.stringify(action) : `{"type":"INVALID","reason":"Could not parse: ${playerInput}"}`;

  if (action) {
    return { ok: true, action, rawText, durationMs };
  }
  return { ok: false, reason: `Mock parser could not understand: "${playerInput}"`, rawText, durationMs };
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
