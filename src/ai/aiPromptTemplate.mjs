/**
 * aiPromptTemplate.mjs — MIR 3.1 AI Prompt Builder.
 *
 * Formats a structured prompt for the AI that includes:
 *   - Sanitized GameState summary (no raw RNG seed)
 *   - Allowed DeclaredAction schema
 *   - Strict instruction: output JSON only
 *
 * The AI never sees the RNG seed or internal engine state.
 * It can only propose DeclaredActions that the engine will validate.
 */

/**
 * Allowed DeclaredAction types and their required fields.
 * This is the whitelist — the AI can only propose these.
 */
const ACTION_SCHEMA = [
  {
    type: "MOVE",
    description: "Move an entity along a cardinal path (no diagonals).",
    fields: {
      entityId: "string — id of the entity to move",
      path: "array of {x,y} — each step must be cardinal-adjacent",
    },
  },
  {
    type: "ATTACK",
    description: "One entity attacks another.",
    fields: {
      attackerId: "string — id of the attacking entity",
      targetId: "string — id of the target entity",
    },
  },
  {
    type: "END_TURN",
    description: "End the current entity's turn (combat only).",
    fields: {
      entityId: "string — id of the entity ending its turn (must be active)",
    },
  },
  {
    type: "ROLL_INITIATIVE",
    description: "Start combat by rolling initiative for all entities.",
    fields: {},
  },
];

/**
 * Build a sanitized state summary for the AI.
 * Strips RNG internals and minimizes payload size.
 *
 * @param {object} state — GameState
 * @returns {object} — sanitized summary
 */
function sanitizeState(state) {
  const allEntities = [
    ...state.entities.players,
    ...state.entities.npcs,
    ...state.entities.objects,
  ];

  return {
    map: {
      name: state.map.name,
      grid: state.map.grid.size,
      terrain: state.map.terrain.filter((t) => t.blocksMovement).map((t) => ({
        x: t.x,
        y: t.y,
        type: t.type,
      })),
    },
    entities: allEntities.map((e) => ({
      id: e.id,
      name: e.name,
      kind: e.kind,
      position: { x: e.position.x, y: e.position.y },
      hp: `${e.stats.hpCurrent}/${e.stats.hpMax}`,
      ac: e.stats.ac,
      speed: e.stats.movementSpeed,
      conditions: e.conditions,
    })),
    combat: {
      mode: state.combat.mode,
      round: state.combat.round,
      activeEntityId: state.combat.activeEntityId,
      initiativeOrder: state.combat.initiativeOrder,
    },
  };
}

/**
 * Build the system prompt (role instructions).
 *
 * @returns {string}
 */
export function buildSystemPrompt() {
  return `You are a game engine assistant for a tabletop RPG. Your ONLY job is to translate a player's natural language command into a structured DeclaredAction JSON object.

RULES:
1. You MUST output exactly ONE valid JSON object. No markdown, no explanation, no extra text.
2. You can ONLY propose actions from the allowed action types listed below.
3. You CANNOT generate random numbers, modify state, or invent new action types.
4. You MUST use entity IDs from the provided state, not names.
5. If the player's request cannot be mapped to a valid action, output:
   {"type":"INVALID","reason":"<brief explanation>"}

ALLOWED ACTIONS:
${ACTION_SCHEMA.map(
  (a) =>
    `- ${a.type}: ${a.description}\n  Fields: ${JSON.stringify(a.fields)}`
).join("\n")}

OUTPUT FORMAT:
A single JSON object with "type" and the required fields. Nothing else.`;
}

/**
 * Build the user prompt with state context and player input.
 *
 * @param {object} state — GameState
 * @param {string} playerInput — natural language command
 * @returns {string}
 */
export function buildUserPrompt(state, playerInput) {
  const summary = sanitizeState(state);

  return `CURRENT STATE:
${JSON.stringify(summary, null, 2)}

PLAYER COMMAND: "${playerInput}"

Respond with a single JSON DeclaredAction object.`;
}

/**
 * Build complete message array for OpenAI chat completion.
 *
 * @param {object} state — GameState
 * @param {string} playerInput — natural language command
 * @returns {Array<{role: string, content: string}>}
 */
export function buildMessages(state, playerInput) {
  return [
    { role: "system", content: buildSystemPrompt() },
    { role: "user", content: buildUserPrompt(state, playerInput) },
  ];
}
