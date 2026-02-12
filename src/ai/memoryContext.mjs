/**
 * memoryContext.mjs — MIR Tier 5.1 AI Memory Context.
 *
 * Builds summarized context for AI prompts from game history.
 * Instead of sending full chat history (expensive), we send:
 *   1. Entity roster summary (who's alive, HP, conditions)
 *   2. Recent events summary (last N events, compressed)
 *   3. Narrative beats (key story moments)
 *   4. Combat state summary
 *
 * All functions are pure. No side effects.
 */

// ── Entity Roster Summary ───────────────────────────────────────────────

/**
 * Build a compact entity roster summary.
 *
 * @param {object} state — GameState
 * @returns {string} — human-readable roster
 */
export function buildRosterSummary(state) {
  const lines = [];
  const players = state.entities?.players ?? [];
  const npcs = state.entities?.npcs ?? [];

  if (players.length > 0) {
    lines.push("## Players");
    for (const p of players) {
      const status = p.conditions.includes("dead") ? "💀 DEAD" : `HP ${p.stats.hpCurrent}/${p.stats.hpMax}`;
      const conditions = p.conditions.filter(c => c !== "dead").join(", ");
      const condStr = conditions ? ` [${conditions}]` : "";
      lines.push(`- ${p.name} (${p.id}): ${status}, AC ${p.stats.ac}, pos (${p.position.x},${p.position.y})${condStr}`);
    }
  }

  if (npcs.length > 0) {
    lines.push("## NPCs");
    for (const n of npcs) {
      const status = n.conditions.includes("dead") ? "💀 DEAD" : `HP ${n.stats.hpCurrent}/${n.stats.hpMax}`;
      const conditions = n.conditions.filter(c => c !== "dead").join(", ");
      const condStr = conditions ? ` [${conditions}]` : "";
      lines.push(`- ${n.name} (${n.id}): ${status}, AC ${n.stats.ac}, pos (${n.position.x},${n.position.y})${condStr}`);
    }
  }

  return lines.join("\n");
}

// ── Recent Events Summary ───────────────────────────────────────────────

/**
 * Summarize the last N events into compact text.
 *
 * @param {object} state — GameState
 * @param {number} [maxEvents=10] — how many recent events to include
 * @returns {string}
 */
export function buildRecentEventsSummary(state, maxEvents = 10) {
  const events = state.log?.events ?? [];
  const recent = events.slice(-maxEvents);

  if (recent.length === 0) return "No events yet.";

  const lines = [];
  for (const evt of recent) {
    lines.push(summarizeEvent(evt));
  }

  return lines.join("\n");
}

/**
 * Summarize a single event into a compact one-liner.
 *
 * @param {object} evt — EngineEvent
 * @returns {string}
 */
export function summarizeEvent(evt) {
  const p = evt.payload || {};

  switch (evt.type) {
    case "MOVE_APPLIED":
      return `→ ${p.entityId} moved to (${p.finalPosition?.x},${p.finalPosition?.y})`;

    case "ATTACK_RESOLVED":
      if (p.hit) {
        return `⚔ ${p.attackerId} hit ${p.targetId} for ${p.damage} dmg (d20:${p.rawRoll}+${p.attackModifier}=${p.attackRoll} vs AC ${p.effectiveAc}) → HP ${p.targetHpAfter}`;
      }
      return `⚔ ${p.attackerId} missed ${p.targetId} (d20:${p.rawRoll}+${p.attackModifier}=${p.attackRoll} vs AC ${p.effectiveAc})`;

    case "INITIATIVE_SET":
      return `🎲 Initiative rolled: ${(p.order || []).join(", ")}`;

    case "TURN_ENDED":
      return `⏭ ${p.entityId} ended turn → next: ${p.nextEntityId || "?"}`;

    case "ABILITY_USED":
      if (p.abilityType === "attack") {
        return p.hit
          ? `✨ ${p.casterId} used ${p.abilityName} on ${p.targetId}: ${p.damage} dmg → HP ${p.targetHpAfter}`
          : `✨ ${p.casterId} used ${p.abilityName} on ${p.targetId}: missed`;
      }
      return `✨ ${p.casterId} used ${p.abilityName} on ${p.targetId}: healed ${p.actualHeal || p.healRoll} → HP ${p.targetHpAfter}`;

    case "CONDITION_DAMAGE":
      return `🔥 ${p.entityId} took ${p.damage} ${p.condition} damage → HP ${p.hpAfter}`;

    case "CONDITION_EXPIRED":
      return `✓ ${p.entityId} is no longer ${p.condition}`;

    case "COMBAT_END":
      return `🏁 Combat ended: ${p.result || "unknown result"}`;

    case "session_start":
      return `📖 ${p.message || "Session started"}`;

    case "combat_start":
      return `⚔ Combat started`;

    default:
      return `[${evt.type}] ${JSON.stringify(p).slice(0, 80)}`;
  }
}

// ── Combat State Summary ────────────────────────────────────────────────

/**
 * Build a compact combat state summary.
 *
 * @param {object} state — GameState
 * @returns {string}
 */
export function buildCombatSummary(state) {
  const combat = state.combat;
  if (!combat || combat.mode !== "combat") {
    return "Not in combat (exploration mode).";
  }

  const lines = [];
  lines.push(`Combat Round ${combat.round}`);
  lines.push(`Active: ${combat.activeEntityId || "none"}`);

  if (combat.initiativeOrder?.length > 0) {
    lines.push(`Initiative: ${combat.initiativeOrder.join(" → ")}`);
  }

  return lines.join("\n");
}

// ── Narrative Beats ─────────────────────────────────────────────────────

/**
 * Extract key narrative beats from the event log.
 * Picks out significant moments: kills, combat start/end, abilities.
 *
 * @param {object} state — GameState
 * @param {number} [maxBeats=5] — max narrative beats to return
 * @returns {string[]} — array of narrative beat strings
 */
export function extractNarrativeBeats(state, maxBeats = 5) {
  const events = state.log?.events ?? [];
  const beats = [];

  for (const evt of events) {
    const p = evt.payload || {};

    // Kill events
    if (evt.type === "ATTACK_RESOLVED" && p.hit && p.targetHpAfter === 0) {
      beats.push(`${p.attackerId} slew ${p.targetId}`);
    }
    if (evt.type === "ABILITY_USED" && p.hit && p.targetHpAfter === 0) {
      beats.push(`${p.casterId} killed ${p.targetId} with ${p.abilityName}`);
    }

    // Condition applications
    if (evt.type === "ABILITY_USED" && p.conditionApplied) {
      beats.push(`${p.casterId} inflicted ${p.conditionApplied} on ${p.targetId}`);
    }

    // Combat start/end
    if (evt.type === "combat_start") {
      beats.push("Combat began");
    }
    if (evt.type === "COMBAT_END") {
      beats.push(`Combat ended: ${p.result || "unknown"}`);
    }
  }

  return beats.slice(-maxBeats);
}

// ── Map Summary ─────────────────────────────────────────────────────────

/**
 * Build a compact map summary for the AI.
 *
 * @param {object} state — GameState
 * @returns {string}
 */
export function buildMapSummary(state) {
  const map = state.map;
  if (!map) return "No map loaded.";

  const lines = [];
  lines.push(`Map: ${map.name} (${map.grid.size.width}×${map.grid.size.height})`);

  const blocked = (map.terrain || []).filter(t => t.blocksMovement).length;
  const difficult = (map.terrain || []).filter(t => t.type === "difficult").length;
  if (blocked > 0) lines.push(`Blocked cells: ${blocked}`);
  if (difficult > 0) lines.push(`Difficult terrain: ${difficult} cells`);
  if (map.fogOfWarEnabled) lines.push("Fog of war: enabled");

  return lines.join("\n");
}

// ── Full Context Builder ────────────────────────────────────────────────

/**
 * Build the complete memory context for an AI prompt.
 * Combines all summaries into a single structured string.
 *
 * @param {object} state — GameState
 * @param {object} [options]
 * @param {number} [options.maxEvents=10]
 * @param {number} [options.maxBeats=5]
 * @returns {string}
 */
export function buildFullContext(state, options = {}) {
  const maxEvents = options.maxEvents ?? 10;
  const maxBeats = options.maxBeats ?? 5;

  const sections = [
    "# Game Context\n",
    buildMapSummary(state),
    "",
    buildCombatSummary(state),
    "",
    buildRosterSummary(state),
    "",
    "## Recent Events",
    buildRecentEventsSummary(state, maxEvents),
  ];

  const beats = extractNarrativeBeats(state, maxBeats);
  if (beats.length > 0) {
    sections.push("");
    sections.push("## Key Moments");
    sections.push(beats.map(b => `- ${b}`).join("\n"));
  }

  return sections.join("\n");
}

/**
 * Estimate token count for a context string.
 * Rough approximation: ~4 characters per token.
 *
 * @param {string} text
 * @returns {number}
 */
export function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}
