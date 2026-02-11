/**
 * eventApplier.ts
 *
 * Applies AI GM response operations (map_updates + state_updates)
 * to the authoritative game state.
 *
 * State shape must conform to shared/schemas/gameState.schema.json:
 *   - session  (round, turn_index, active_entity_id, …)
 *   - map.entities_on_map[]  (entity_id, pos, token)
 *   - entities[]  (id, hp, conditions, …)
 *   - log_compact  (summary, events[])
 */

// ── Map update types ───────────────────────────────────────────────────

interface Pos {
  x: number;
  y: number;
}

interface MapUpdateMoveEntity {
  op: "move_entity";
  entity_id: string;
  from: Pos;
  to: Pos;
}

type MapUpdate = MapUpdateMoveEntity;

// ── State update types ─────────────────────────────────────────────────

interface StateUpdateSetHp {
  op: "set_hp";
  entity_id: string;
  current: number;
}

interface StateUpdateAddCondition {
  op: "add_condition";
  entity_id: string;
  condition: string;
}

interface StateUpdateRemoveCondition {
  op: "remove_condition";
  entity_id: string;
  condition: string;
}

interface StateUpdateSetActiveEntity {
  op: "set_active_entity";
  entity_id: string;
}

interface StateUpdateAdvanceTurn {
  op: "advance_turn";
  round: number;
  turn_index: number;
  active_entity_id: string;
}

interface StateUpdateAddEventLog {
  op: "add_event_log";
  event: {
    i: number;
    actor_id: string;
    intent: string;
    input: string;
    result: string;
    delta: string;
  };
}

interface StateUpdateUpdateSummary {
  op: "update_summary";
  summary: string;
}

type StateUpdate =
  | StateUpdateSetHp
  | StateUpdateAddCondition
  | StateUpdateRemoveCondition
  | StateUpdateSetActiveEntity
  | StateUpdateAdvanceTurn
  | StateUpdateAddEventLog
  | StateUpdateUpdateSummary;

// ── AI response envelope ───────────────────────────────────────────────

interface AiGmResponse {
  map_updates: MapUpdate[];
  state_updates: StateUpdate[];
}

// ── Helpers ────────────────────────────────────────────────────────────

function clone<T>(value: T): T {
  return structuredClone(value);
}

function assertArray(value: unknown, name: string): any[] {
  if (!Array.isArray(value)) {
    throw new Error(`State field "${name}" is missing or not an array`);
  }
  return value;
}

function assertObject(value: unknown, name: string): Record<string, any> {
  if (!value || typeof value !== "object") {
    throw new Error(`State field "${name}" is missing or not an object`);
  }
  return value as Record<string, any>;
}

// ── Map update appliers ────────────────────────────────────────────────

function applyMoveEntity(state: any, update: MapUpdateMoveEntity): void {
  const map = assertObject(state?.map, "map");
  const entitiesOnMap = assertArray(map.entities_on_map, "map.entities_on_map");

  const entry = entitiesOnMap.find(
    (e: any) => e.entity_id === update.entity_id
  );
  if (!entry) {
    throw new Error(
      `move_entity: entity "${update.entity_id}" not found in map.entities_on_map`
    );
  }

  entry.pos = { x: update.to.x, y: update.to.y };
}

// ── State update appliers ──────────────────────────────────────────────

function applySetHp(state: any, update: StateUpdateSetHp): void {
  const entities = assertArray(state?.entities, "entities");
  const entity = entities.find((e: any) => e.id === update.entity_id);
  if (!entity) {
    throw new Error(`set_hp: entity "${update.entity_id}" not found`);
  }

  const hp = assertObject(entity.hp, `entities[${update.entity_id}].hp`);
  hp.current = update.current;
}

function applyAddCondition(state: any, update: StateUpdateAddCondition): void {
  const entities = assertArray(state?.entities, "entities");
  const entity = entities.find((e: any) => e.id === update.entity_id);
  if (!entity) {
    throw new Error(`add_condition: entity "${update.entity_id}" not found`);
  }

  const conditions = assertArray(entity.conditions, `entities[${update.entity_id}].conditions`);
  if (!conditions.includes(update.condition)) {
    conditions.push(update.condition);
  }
}

function applyRemoveCondition(state: any, update: StateUpdateRemoveCondition): void {
  const entities = assertArray(state?.entities, "entities");
  const entity = entities.find((e: any) => e.id === update.entity_id);
  if (!entity) {
    throw new Error(`remove_condition: entity "${update.entity_id}" not found`);
  }

  const conditions = assertArray(entity.conditions, `entities[${update.entity_id}].conditions`);
  const idx = conditions.indexOf(update.condition);
  if (idx !== -1) {
    conditions.splice(idx, 1);
  }
}

function applySetActiveEntity(state: any, update: StateUpdateSetActiveEntity): void {
  const session = assertObject(state?.session, "session");
  session.active_entity_id = update.entity_id;
}

function applyAdvanceTurn(state: any, update: StateUpdateAdvanceTurn): void {
  const session = assertObject(state?.session, "session");
  session.round = update.round;
  session.turn_index = update.turn_index;
  session.active_entity_id = update.active_entity_id;
}

function applyAddEventLog(state: any, update: StateUpdateAddEventLog): void {
  const logCompact = assertObject(state?.log_compact, "log_compact");
  const events = assertArray(logCompact.events, "log_compact.events");
  events.push({ ...update.event });
}

function applyUpdateSummary(state: any, update: StateUpdateUpdateSummary): void {
  const logCompact = assertObject(state?.log_compact, "log_compact");
  logCompact.summary = update.summary;
}

// ── Public API ─────────────────────────────────────────────────────────

const SUPPORTED_MAP_OPS = new Set(["move_entity"]);
const SUPPORTED_STATE_OPS = new Set([
  "set_hp",
  "add_condition",
  "remove_condition",
  "set_active_entity",
  "advance_turn",
  "add_event_log",
  "update_summary",
]);

export function applyAiEvents(state: unknown, response: AiGmResponse): unknown {
  const nextState: any = clone(state);

  const mapUpdates = response.map_updates ?? [];
  const stateUpdates = response.state_updates ?? [];

  // Pre-validate all ops before applying any
  for (const update of mapUpdates) {
    if (!SUPPORTED_MAP_OPS.has(update.op)) {
      throw new Error(`Unsupported map update op: "${update.op}"`);
    }
  }
  for (const update of stateUpdates) {
    if (!SUPPORTED_STATE_OPS.has(update.op)) {
      throw new Error(`Unsupported state update op: "${update.op}"`);
    }
  }

  // Apply map updates
  for (const update of mapUpdates) {
    switch (update.op) {
      case "move_entity":
        applyMoveEntity(nextState, update);
        break;
    }
  }

  // Apply state updates
  for (const update of stateUpdates) {
    switch (update.op) {
      case "set_hp":
        applySetHp(nextState, update);
        break;
      case "add_condition":
        applyAddCondition(nextState, update);
        break;
      case "remove_condition":
        applyRemoveCondition(nextState, update);
        break;
      case "set_active_entity":
        applySetActiveEntity(nextState, update);
        break;
      case "advance_turn":
        applyAdvanceTurn(nextState, update);
        break;
      case "add_event_log":
        applyAddEventLog(nextState, update);
        break;
      case "update_summary":
        applyUpdateSummary(nextState, update);
        break;
    }
  }

  return nextState;
}
