/**
 * intentPromptBuilder.mjs — Builds prompts for LLM-based intent parsing.
 *
 * The LLM's job is ONLY to understand what the player wants and output
 * a structured PlayerIntent JSON. It does NOT decide game mechanics,
 * roll dice, or modify state. That's the engine's job.
 *
 * Key design: The output schema matches intentTypes.mjs exactly,
 * so the existing planner + executor work unchanged.
 */

import { INTENT_TYPES, DIRECTIONS, TARGET_SELECTORS } from "./intentTypes.mjs";

// ── State Summarizer ────────────────────────────────────────────────────

/**
 * Build a concise state summary for the LLM context window.
 * Strips internal IDs, RNG seeds, and irrelevant data.
 * Keeps entity names, positions, HP, conditions, and combat state.
 *
 * @param {object} state — GameState
 * @returns {string} — human-readable state summary
 */
export function summarizeStateForParsing(state) {
  if (!state) return "(no game state available)";

  const lines = [];

  // Map
  const { width, height } = state.map?.grid?.size ?? { width: 0, height: 0 };
  lines.push(`Map: "${state.map?.name || "unknown"}" (${width}×${height})`);

  // Combat mode
  const mode = state.combat?.mode || "exploration";
  if (mode === "combat") {
    lines.push(`Mode: COMBAT — Round ${state.combat.round}`);
    if (state.combat.activeEntityId) {
      lines.push(`Active turn: ${state.combat.activeEntityId}`);
    }
    if (state.combat.initiativeOrder?.length) {
      lines.push(`Turn order: ${state.combat.initiativeOrder.join(" → ")}`);
    }
  } else {
    lines.push(`Mode: EXPLORATION`);
  }

  // Entities
  const allEntities = [
    ...(state.entities?.players ?? []),
    ...(state.entities?.npcs ?? []),
    ...(state.entities?.objects ?? []),
  ];

  lines.push(`\nEntities (${allEntities.length}):`);
  for (const e of allEntities) {
    const hp = `${e.stats.hpCurrent}/${e.stats.hpMax}`;
    const cond = e.conditions?.length ? ` [${e.conditions.join(", ")}]` : "";
    const kind = e.kind === "player" ? "PC" : e.kind === "npc" ? "NPC" : "OBJ";
    lines.push(`  ${kind} "${e.name}" (${e.id}) at (${e.position.x},${e.position.y}) HP:${hp} AC:${e.stats.ac} Speed:${e.stats.movementSpeed}${cond}`);
  }

  return lines.join("\n");
}

// ── System Prompt ───────────────────────────────────────────────────────

/**
 * Build the system prompt that instructs the LLM on intent classification.
 *
 * @returns {string}
 */
export function buildIntentSystemPrompt() {
  return `You are an intent parser for a tabletop RPG game engine called MIR.

Your ONLY job: Given a player's natural language input and the current game state, output a structured JSON intent object. You do NOT execute actions, roll dice, or narrate. You CLASSIFY what the player wants.

OUTPUT FORMAT: A single JSON object. No markdown fences, no explanation, no extra text.

INTENT TYPES (output exactly one):

1. MOVE TO COORDINATES
   {"type":"move_to","subject":"<entity_name>","x":<number>,"y":<number>}

2. MOVE IN DIRECTION
   {"type":"move_direction","subject":"<entity_name>","direction":"<north|south|east|west>","distance":<number>}
   - distance defaults to 1 if not specified
   - north=y-1, south=y+1, east=x+1, west=x-1
   - "left"=west, "right"=east, "up"=north, "down"=south

3. APPROACH TARGET
   {"type":"approach","subject":"<entity_name>","target":"<target_name>"}
   - For "move to the goblin", "walk toward the chest", "get close to the door"

4. ATTACK
   {"type":"attack","subject":"<entity_name>","target":"<target_name>"}
   - For "attack", "hit", "strike", "slash", "stab", "shoot"

5. USE ABILITY
   {"type":"use_ability","subject":"<entity_name>","ability":"<ability_id>","target":"<target_name>"}
   - Known abilities: firebolt, healing_word, sneak_attack, shield_bash, second_wind, hunters_mark

6. COMPOUND (multiple steps)
   {"type":"compound","steps":[<intent1>,<intent2>,...]}
   - For "move north then attack the goblin", "approach the chest and search it"

7. FLEE
   {"type":"flee","subject":"<entity_name>","from":"<threat_name>"}
   - For "run away", "flee", "retreat", "escape"

8. START COMBAT
   {"type":"start_combat"}
   - For "roll initiative", "start combat", "let's fight", "begin battle"

9. END TURN
   {"type":"end_turn","subject":"<entity_name>"}
   - For "end turn", "done", "pass", "next", "skip"

10. DEFEND
    {"type":"defend","subject":"<entity_name>"}
    - For "defend", "dodge", "take cover", "brace"

11. UNKNOWN
    {"type":"unknown","hint":"<what you think they meant>"}
    - ONLY if the input truly cannot map to any game action

RULES:
- "subject" = who is performing the action. Default to "active" (whoever's turn it is).
- If the player names a specific character (e.g. "Seren moves north"), use their name as subject.
- "target" = match entity names from the state. Use lowercase. If ambiguous, use tactical selectors:
  - "nearest_hostile" — closest enemy
  - "weakest_hostile" — lowest HP enemy  
  - "strongest_hostile" — highest HP enemy
  - "most_injured_ally" — ally with most HP missing
  - "nearest_ally" — closest friendly
- For narrative/roleplay language, extract the TACTICAL intent:
  - "I cautiously approach the dark figure" → approach
  - "I ready my blade and charge" → attack (nearest_hostile)
  - "Cover me!" → not a command for the speaker; output unknown with hint
- Prefer SPECIFIC intents over unknown. Only output unknown if truly uninterpretable.
- Word numbers: "three"=3, "five"=5, "a couple"=2, "a few"=3, "several"=4
- Resolve pronouns: "him/her/it/them" → the most recently mentioned entity`;
}

// ── User Prompt ─────────────────────────────────────────────────────────

/**
 * Build the user prompt with state context and player input.
 *
 * @param {string} playerInput — natural language command
 * @param {object} state — GameState
 * @returns {string}
 */
export function buildIntentUserPrompt(playerInput, state) {
  const summary = summarizeStateForParsing(state);
  return `GAME STATE:\n${summary}\n\nPLAYER INPUT: "${playerInput}"\n\nRespond with a single JSON intent object.`;
}

/**
 * Build complete messages array for chat completion API.
 *
 * @param {string} playerInput
 * @param {object} state
 * @returns {Array<{role: string, content: string}>}
 */
export function buildIntentMessages(playerInput, state) {
  return [
    { role: "system", content: buildIntentSystemPrompt() },
    { role: "user", content: buildIntentUserPrompt(playerInput, state) },
  ];
}
