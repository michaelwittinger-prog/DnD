/**
 * narrateEvent.mjs — MIR Event Narration.
 *
 * Pure function: converts EngineEvents into human-readable narrative strings.
 * Used by UI and logging to show what happened in natural language.
 *
 * No side effects. No state mutation. Just text generation.
 */

/**
 * Generate a human-readable narrative for an engine event.
 *
 * @param {object} event — EngineEvent from log.events
 * @param {object} [state] — optional GameState for entity name lookups
 * @returns {string} — narrative text
 */
export function narrateEvent(event, state) {
  if (!event || !event.type) return "Something happened.";

  const lookup = state ? buildNameLookup(state) : {};

  switch (event.type) {
    case "MOVE_APPLIED":
      return narrateMove(event, lookup);
    case "ATTACK_RESOLVED":
      return narrateAttack(event, lookup);
    case "INITIATIVE_ROLLED":
      return narrateInitiative(event, lookup);
    case "TURN_ENDED":
      return narrateTurnEnd(event, lookup);
    case "COMBAT_ENDED":
      return narrateCombatEnd(event, lookup);
    case "ACTION_REJECTED":
      return narrateRejection(event, lookup);
    case "RNG_SEED_SET":
      return "The threads of fate shift...";
    default:
      return `[${event.type}] occurred.`;
  }
}

/**
 * Narrate multiple events in sequence.
 *
 * @param {Array<object>} events
 * @param {object} [state]
 * @returns {string[]}
 */
export function narrateEvents(events, state) {
  return (events ?? []).map((e) => narrateEvent(e, state));
}

// ── Internal Narration Functions ────────────────────────────────────

function buildNameLookup(state) {
  const map = {};
  for (const e of state.entities?.players ?? []) map[e.id] = e.name;
  for (const e of state.entities?.npcs ?? []) map[e.id] = e.name;
  for (const e of state.entities?.objects ?? []) map[e.id] = e.name;
  return map;
}

function name(id, lookup) {
  return lookup[id] || id;
}

function narrateMove(event, lookup) {
  const p = event.payload;
  const who = name(p.entityId, lookup);
  const dest = p.finalPosition;
  const steps = p.path?.length ?? 0;
  return `${who} moves ${steps} step${steps !== 1 ? "s" : ""} to (${dest.x}, ${dest.y}).`;
}

function narrateAttack(event, lookup) {
  const p = event.payload;
  const attacker = name(p.attackerId, lookup);
  const target = name(p.targetId, lookup);

  if (p.hit) {
    const killText = p.targetHpAfter === 0 ? ` ${target} falls!` : "";
    return `${attacker} attacks ${target} — rolls ${p.attackRoll} vs AC ${p.targetAc}: HIT for ${p.damage} damage!${killText}`;
  } else {
    return `${attacker} attacks ${target} — rolls ${p.attackRoll} vs AC ${p.targetAc}: MISS.`;
  }
}

function narrateInitiative(event, lookup) {
  const p = event.payload;
  const entries = p.order.map(
    (o) => `${name(o.entityId, lookup)} (${o.roll})`
  );
  return `Combat begins! Initiative: ${entries.join(", ")}.`;
}

function narrateTurnEnd(event, lookup) {
  const p = event.payload;
  const who = name(p.entityId, lookup);
  const next = name(p.nextEntityId, lookup);
  return `${who}'s turn ends. ${next} is up (round ${p.round}).`;
}

function narrateCombatEnd(event, lookup) {
  const p = event.payload;
  const winnerMap = { players: "The heroes", npcs: "The enemies", none: "No one" };
  const winner = winnerMap[p.winner] || p.winner;
  return `${winner} prevail! Combat ends after ${p.finalRound} round${p.finalRound !== 1 ? "s" : ""}.`;
}

function narrateRejection(event, lookup) {
  const p = event.payload;
  const actionType = p.action?.type ?? "UNKNOWN";
  const reason = p.reasons?.[0] ?? "unknown reason";
  return `Action ${actionType} was rejected: ${reason}.`;
}
