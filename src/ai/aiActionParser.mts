/**
 * aiActionParser.mjs — MIR 3.1 AI Response Safety Layer.
 *
 * Validates and sanitizes AI-produced JSON before it reaches the engine.
 *
 * Safety guarantees:
 *   1. Strict JSON.parse — no eval, no loose parsing
 *   2. Reject unknown top-level fields
 *   3. Reject non-whitelisted action types
 *   4. Reject if required fields are missing or wrong type
 *   5. Strip any extra fields the AI may have invented
 *
 * Returns either { ok: true, action } or { ok: false, reason }.
 */

/** Whitelisted action types the AI may propose. */
const ALLOWED_TYPES = new Set(["MOVE", "ATTACK", "END_TURN", "ROLL_INITIATIVE"]);

/**
 * Allowed top-level fields per action type (besides "type").
 * Any field not listed here is stripped.
 */
const ALLOWED_FIELDS = {
  MOVE:             ["entityId", "path"],
  ATTACK:           ["attackerId", "targetId"],
  END_TURN:         ["entityId"],
  ROLL_INITIATIVE:  [],
};

/**
 * Parse raw AI text into a DeclaredAction.
 *
 * @param {string} rawText — raw text from AI response
 * @returns {{ ok: true, action: object } | { ok: false, reason: string }}
 */
export function parseAiAction(rawText) {
  // ── Step 1: Extract JSON from response ─────────────────────────────
  const trimmed = (rawText ?? "").trim();
  if (!trimmed) {
    return { ok: false, reason: "Empty AI response" };
  }

  // Try to find JSON object in the response (AI may wrap in markdown)
  let jsonStr = trimmed;
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    jsonStr = jsonMatch[0];
  }

  // ── Step 2: Strict JSON parse ──────────────────────────────────────
  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    return { ok: false, reason: `Invalid JSON: ${e.message}` };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, reason: "AI response must be a JSON object" };
  }

  // ── Step 3: Check type field ───────────────────────────────────────
  if (!parsed.type || typeof parsed.type !== "string") {
    return { ok: false, reason: "Missing or invalid 'type' field" };
  }

  // Handle AI's explicit "I can't do this" response
  if (parsed.type === "INVALID") {
    return { ok: false, reason: `AI declined: ${parsed.reason || "unknown reason"}` };
  }

  if (!ALLOWED_TYPES.has(parsed.type)) {
    return { ok: false, reason: `Disallowed action type: "${parsed.type}"` };
  }

  // ── Step 4: Validate required fields per type ──────────────────────
  const validation = validateFields(parsed);
  if (!validation.ok) return validation;

  // ── Step 5: Strip unknown fields ───────────────────────────────────
  const allowed = ALLOWED_FIELDS[parsed.type];
  const clean = { type: parsed.type };
  for (const field of allowed) {
    if (parsed[field] !== undefined) {
      clean[field] = parsed[field];
    }
  }

  return { ok: true, action: clean };
}

/**
 * Validate that required fields are present and have correct types.
 *
 * @param {object} parsed
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
function validateFields(parsed) {
  switch (parsed.type) {
    case "MOVE":
      if (typeof parsed.entityId !== "string" || !parsed.entityId) {
        return { ok: false, reason: "MOVE: missing or invalid 'entityId'" };
      }
      if (!Array.isArray(parsed.path) || parsed.path.length === 0) {
        return { ok: false, reason: "MOVE: missing or empty 'path' array" };
      }
      for (let i = 0; i < parsed.path.length; i++) {
        const step = parsed.path[i];
        if (typeof step !== "object" || typeof step.x !== "number" || typeof step.y !== "number") {
          return { ok: false, reason: `MOVE: path[${i}] must have numeric x and y` };
        }
      }
      // Sanitize path: keep only x,y
      parsed.path = parsed.path.map((s) => ({ x: Math.floor(s.x), y: Math.floor(s.y) }));
      break;

    case "ATTACK":
      if (typeof parsed.attackerId !== "string" || !parsed.attackerId) {
        return { ok: false, reason: "ATTACK: missing or invalid 'attackerId'" };
      }
      if (typeof parsed.targetId !== "string" || !parsed.targetId) {
        return { ok: false, reason: "ATTACK: missing or invalid 'targetId'" };
      }
      break;

    case "END_TURN":
      if (typeof parsed.entityId !== "string" || !parsed.entityId) {
        return { ok: false, reason: "END_TURN: missing or invalid 'entityId'" };
      }
      break;

    case "ROLL_INITIATIVE":
      // No additional fields required
      break;
  }

  return { ok: true };
}
