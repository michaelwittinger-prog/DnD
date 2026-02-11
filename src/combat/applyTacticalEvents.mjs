/**
 * applyTacticalEvents.mjs — Phase 6.1 State Safety Guard.
 *
 * Pure function that applies a validated tactical_events array to a
 * combat state, producing a new state. Never mutates the original.
 *
 * Throws on illegal state transitions (HP < 0, actor not found,
 * illegal position overlap).
 *
 * @module applyTacticalEvents
 */

/**
 * @param {object}   state   - Current game state (NOT mutated)
 * @param {object[]} events  - Validated tactical_events array
 * @returns {object}         - New game state with events applied
 * @throws {Error}           - On illegal state transition
 */
export function applyTacticalEvents(state, events) {
  if (!events || events.length === 0) return state;

  // Deep clone — no mutation of original
  const next = JSON.parse(JSON.stringify(state));

  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    const path = `tactical_events[${i}]`;

    switch (ev.type) {
      case "MOVE":
        applyMove(next, ev, path);
        break;
      case "DAMAGE":
        applyDamage(next, ev, path);
        break;
      case "STATUS_APPLY":
        applyStatusApply(next, ev, path);
        break;
      case "STATUS_REMOVE":
        applyStatusRemove(next, ev, path);
        break;
      case "ATTACK":
      case "TURN_START":
      case "TURN_END":
      case "ROUND_END":
        // These are informational / hooks — no state mutation needed
        break;
      default:
        // Unknown types are ignored (schema validation catches them upstream)
        break;
    }
  }

  return next;
}

// ── Helpers ────────────────────────────────────────────────────────────

function findEntity(state, id) {
  return (state.entities ?? []).find((e) => e.id === id);
}

function applyMove(state, ev, path) {
  const entity = findEntity(state, ev.actor_id);
  if (!entity) {
    throw new Error(`${path}: actor "${ev.actor_id}" not found in state`);
  }

  // Check for position collision
  const targetKey = `${ev.position_after.x},${ev.position_after.y}`;
  for (const other of state.entities ?? []) {
    if (other.id === ev.actor_id) continue;
    if (other.position && `${other.position.x},${other.position.y}` === targetKey) {
      throw new Error(`${path}: position collision at (${ev.position_after.x},${ev.position_after.y}) with entity "${other.id}"`);
    }
  }

  entity.position = { x: ev.position_after.x, y: ev.position_after.y };
}

function applyDamage(state, ev, path) {
  const target = findEntity(state, ev.target_id);
  if (!target) {
    throw new Error(`${path}: target "${ev.target_id}" not found in state`);
  }

  const currentHp = target.stats?.hp;
  if (currentHp === undefined) {
    throw new Error(`${path}: target "${ev.target_id}" has no HP stat`);
  }

  const newHp = currentHp - ev.value;
  if (newHp < 0) {
    throw new Error(`${path}: HP would drop below 0 (${currentHp} - ${ev.value} = ${newHp}) for "${ev.target_id}"`);
  }

  target.stats.hp = newHp;
}

function applyStatusApply(state, ev, path) {
  const entity = findEntity(state, ev.actor_id);
  if (!entity) {
    throw new Error(`${path}: actor "${ev.actor_id}" not found in state`);
  }

  // Add status to a conditions-like array if it exists, or create one
  if (!entity.conditions) entity.conditions = [];
  if (!entity.conditions.includes(ev.status)) {
    entity.conditions.push(ev.status);
  }
}

function applyStatusRemove(state, ev, path) {
  const entity = findEntity(state, ev.actor_id);
  if (!entity) {
    throw new Error(`${path}: actor "${ev.actor_id}" not found in state`);
  }

  if (entity.conditions) {
    entity.conditions = entity.conditions.filter((c) => c !== ev.status);
  }
}
