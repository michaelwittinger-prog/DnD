/**
 * applyAiResponse — applies an AI GM response to a game state, producing
 * a new (candidate) game state.
 *
 * Supported operations (minimal set for wiring demo):
 *   map_updates  : move_entity, spawn_entity, remove_entity
 *   state_updates: set_hp, add_event_log, advance_turn
 *
 * All other ops are logged as warnings and skipped.
 */

/**
 * @param {object} opts
 * @param {object} opts.state       Current game-state (will NOT be mutated)
 * @param {object} opts.aiResponse  Validated AI GM response
 * @returns {object}                New game-state
 */
export function applyAiResponse({ state, aiResponse }) {
  // Deep clone so we never mutate the input
  const next = JSON.parse(JSON.stringify(state));

  // Bump updatedAt
  next.meta.updatedAt = new Date().toISOString();

  // ── Apply map_updates ──────────────────────────────────────────────
  for (const op of aiResponse.map_updates ?? []) {
    switch (op.op) {
      case "move_entity":
        applyMoveEntity(next, op);
        break;
      case "spawn_entity":
        applySpawnEntity(next, op);
        break;
      case "remove_entity":
        applyRemoveEntity(next, op);
        break;
      default:
        console.warn(`[applyAiResponse] skipping unsupported map op: ${op.op}`);
    }
  }

  // ── Apply state_updates ────────────────────────────────────────────
  for (const op of aiResponse.state_updates ?? []) {
    switch (op.op) {
      case "set_hp":
        applySetHp(next, op);
        break;
      case "add_event_log":
        applyAddEventLog(next, op);
        break;
      case "advance_turn":
        applyAdvanceTurn(next, op);
        break;
      case "start_combat":
        applyStartCombatOp(next, op);
        break;
      case "end_turn":
        applyEndTurnOp(next, op);
        break;
      case "add_condition":
        applyAddCondition(next, op);
        break;
      case "remove_condition":
        applyRemoveCondition(next, op);
        break;
      case "set_active_entity":
        applySetActiveEntity(next, op);
        break;
      case "update_summary":
        applyUpdateSummary(next, op);
        break;
      default:
        console.warn(`[applyAiResponse] skipping unsupported state op: ${op.op}`);
    }
  }

  return next;
}

// ── Helpers ────────────────────────────────────────────────────────────

function findEntity(state, id) {
  return state.entities.find((e) => e.id === id);
}

function applyMoveEntity(state, op) {
  const entity = findEntity(state, op.entity_id);
  if (!entity) {
    console.warn(`[move_entity] entity not found: ${op.entity_id}`);
    return;
  }
  entity.position = { x: op.to.x, y: op.to.y };
}

function applySpawnEntity(state, op) {
  const e = op.entity;
  const newEntity = {
    id: e.id,
    name: e.name,
    type: e.type,
    stats: {
      hp: e.hp.current,
      maxHp: e.hp.max,
      ac: e.stats.ac,
      speed: e.stats.speed,
      attack_bonus: e.stats.attack_bonus,
      damage: e.stats.damage,
      role: e.role,
    },
    position: { x: e.pos.x, y: e.pos.y },
  };
  state.entities.push(newEntity);
}

function applyRemoveEntity(state, op) {
  const idx = state.entities.findIndex((e) => e.id === op.entity_id);
  if (idx === -1) {
    console.warn(`[remove_entity] entity not found: ${op.entity_id}`);
    return;
  }
  state.entities.splice(idx, 1);
}

function applySetHp(state, op) {
  const entity = findEntity(state, op.entity_id);
  if (!entity) {
    console.warn(`[set_hp] entity not found: ${op.entity_id}`);
    return;
  }
  if (!entity.stats) entity.stats = {};
  entity.stats.hp = op.current;
}

function applyAddEventLog(state, op) {
  const ev = op.event;
  const logEntry = {
    id: `log-event-${ev.i}`,
    message: `[${ev.actor_id}] ${ev.intent}: ${ev.result} (${ev.delta})`,
    level: "info",
    timestamp: new Date().toISOString(),
  };
  state.logs.push(logEntry);
}

function applyAdvanceTurn(state, op) {
  state.timeline.turn = op.turn_index;
}

/**
 * Phase 6.0 — Start Combat.
 * Sort participants by initiative (desc), ties broken by entity_id (asc lexicographic).
 * Set combat state on the game state object.
 */
function applyStartCombatOp(state, op) {
  // Sort: highest initiative first, then entity_id ascending for ties
  const sorted = [...op.participants].sort((a, b) => {
    if (b.initiative !== a.initiative) return b.initiative - a.initiative;
    return a.entity_id < b.entity_id ? -1 : a.entity_id > b.entity_id ? 1 : 0;
  });

  const combatId = `combat-${Date.now()}`;

  state.combat = {
    active: true,
    combat_id: combatId,
    round: 1,
    initiative_order: sorted.map((p) => p.entity_id),
    active_index: 0,
    started_at_iso: new Date().toISOString(),
  };
}

/**
 * Phase 6.0 — End Turn.
 * Advance active_index. If it wraps past the end, increment round.
 */
function applyEndTurnOp(state, op) {
  if (!state.combat?.active) return;

  const order = state.combat.initiative_order;
  let nextIdx = state.combat.active_index + 1;

  if (nextIdx >= order.length) {
    nextIdx = 0;
    state.combat.round += 1;
  }

  state.combat.active_index = nextIdx;
}

/**
 * add_condition — Adds a condition string to an entity's conditions array.
 */
function applyAddCondition(state, op) {
  const entity = findEntity(state, op.entity_id);
  if (!entity) {
    console.warn(`[add_condition] entity not found: ${op.entity_id}`);
    return;
  }
  if (!entity.conditions) entity.conditions = [];
  if (!entity.conditions.includes(op.condition)) {
    entity.conditions.push(op.condition);
  }
}

/**
 * remove_condition — Removes a condition string from an entity's conditions array.
 */
function applyRemoveCondition(state, op) {
  const entity = findEntity(state, op.entity_id);
  if (!entity) {
    console.warn(`[remove_condition] entity not found: ${op.entity_id}`);
    return;
  }
  if (!entity.conditions) return;
  entity.conditions = entity.conditions.filter((c) => c !== op.condition);
}

/**
 * set_active_entity — Sets which entity is currently active (e.g. for turn focus).
 */
function applySetActiveEntity(state, op) {
  if (!state.combat) state.combat = {};
  // Find the index in initiative_order, or just store active_entity_id
  if (state.combat.initiative_order) {
    const idx = state.combat.initiative_order.indexOf(op.entity_id);
    if (idx !== -1) state.combat.active_index = idx;
  }
  state.combat.active_entity_id = op.entity_id;
}

/**
 * update_summary — Updates the session/narrative summary text.
 */
function applyUpdateSummary(state, op) {
  if (!state.session) state.session = {};
  state.session.summary = op.summary || op.text || "";
}
