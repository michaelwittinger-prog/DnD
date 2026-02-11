/**
 * validateShim.mjs — Browser-compatible validation shim for MIR engine.
 *
 * The real validateGameState.mjs uses Node-only deps (ajv, fs, path).
 * This shim provides the same exports for browser use:
 *   - validateGameState: no-op (schema check skipped in browser)
 *   - validateInvariants: full pure-JS invariant checker (copied from source)
 *
 * The HTML importmap redirects /src/state/validateGameState.mjs here.
 */

// ── Schema validation — no-op in browser ───────────────────────────────

export function validateGameState(_state) {
  return { ok: true, errors: [] };
}

// ── Invariant validation — pure JS, no Node deps ──────────────────────

function allEntities(state) {
  const { players = [], npcs = [], objects = [] } = state.entities ?? {};
  return [...players, ...npcs, ...objects];
}

export function validateInvariants(state) {
  const errors = [];
  const e = (code, msg) => errors.push(`[${code}] ${msg}`);

  const entities = allEntities(state);
  const entityIds = new Set();
  const { width, height } = state.map?.grid?.size ?? { width: 0, height: 0 };

  const blockedSet = new Set();
  for (const t of state.map?.terrain ?? []) {
    if (t.blocksMovement) blockedSet.add(`${t.x},${t.y}`);
  }

  const occupiedCells = new Map();

  for (const ent of entities) {
    if (entityIds.has(ent.id)) e("UNIQUE_ENTITY_IDS", `Duplicate entity id "${ent.id}"`);
    entityIds.add(ent.id);
  }

  for (const p of state.entities?.players ?? []) {
    if (p.kind !== "player") e("ENTITY_KIND_MATCH", `"${p.id}" in players has kind "${p.kind}"`);
  }
  for (const n of state.entities?.npcs ?? []) {
    if (n.kind !== "npc") e("ENTITY_KIND_MATCH", `"${n.id}" in npcs has kind "${n.kind}"`);
  }
  for (const o of state.entities?.objects ?? []) {
    if (o.kind !== "object") e("ENTITY_KIND_MATCH", `"${o.id}" in objects has kind "${o.kind}"`);
  }

  for (const ent of entities) {
    if (ent.stats.hpCurrent < 0 || ent.stats.hpCurrent > ent.stats.hpMax) {
      e("HP_BOUNDS", `"${ent.id}": hpCurrent ${ent.stats.hpCurrent} not in [0, ${ent.stats.hpMax}]`);
    }
    if (ent.stats.hpMax < 1) e("HP_MAX_POSITIVE", `"${ent.id}": hpMax ${ent.stats.hpMax} < 1`);
    const { x, y } = ent.position;
    if (x < 0 || x >= width || y < 0 || y >= height) {
      e("POSITION_IN_BOUNDS", `"${ent.id}" at (${x},${y}) outside ${width}x${height}`);
    }
    const ck = `${x},${y}`;
    if (occupiedCells.has(ck)) {
      e("NO_SOLID_OVERLAP", `"${occupiedCells.get(ck)}" and "${ent.id}" both at (${x},${y})`);
    }
    occupiedCells.set(ck, ent.id);
    if (blockedSet.has(ck)) e("NO_ENTITY_ON_BLOCKED", `"${ent.id}" at (${x},${y}) on blocked tile`);
    for (let ci = 0; ci < ent.conditions.length; ci++) {
      if (typeof ent.conditions[ci] !== "string" || !ent.conditions[ci]) {
        e("CONDITIONS_NON_EMPTY_STRINGS", `"${ent.id}" conditions[${ci}] is empty`);
      }
    }
    const itemIds = new Set();
    for (const item of ent.inventory) {
      if (itemIds.has(item.id)) e("INVENTORY_IDS_UNIQUE_PER_ENTITY", `"${ent.id}" duplicate item id "${item.id}"`);
      itemIds.add(item.id);
      if (item.qty < 1) e("INVENTORY_QTY_POSITIVE", `"${ent.id}" item "${item.id}" qty ${item.qty} < 1`);
    }
  }

  const combat = state.combat;
  if (combat.mode === "exploration") {
    if (combat.round !== 0) e("COMBAT_MODE_CONSISTENCY", `Exploration but round=${combat.round}`);
    if (combat.activeEntityId !== null) e("COMBAT_MODE_CONSISTENCY", `Exploration but activeEntityId="${combat.activeEntityId}"`);
    if (combat.initiativeOrder.length) e("COMBAT_MODE_CONSISTENCY", `Exploration but initiativeOrder not empty`);
  }
  if (combat.mode === "combat") {
    if (!combat.activeEntityId) e("COMBAT_ACTIVE_ENTITY_EXISTS", "Combat but activeEntityId is null");
    else if (!entityIds.has(combat.activeEntityId)) e("COMBAT_ACTIVE_ENTITY_EXISTS", `activeEntityId "${combat.activeEntityId}" not found`);
  }
  for (const id of combat.initiativeOrder) {
    if (!entityIds.has(id)) e("COMBAT_INITIATIVE_ENTITIES_EXIST", `"${id}" in initiativeOrder not found`);
  }
  if (combat.mode === "combat" && combat.activeEntityId) {
    if (!combat.initiativeOrder.includes(combat.activeEntityId)) {
      e("COMBAT_ACTIVE_IN_INITIATIVE", `activeEntityId "${combat.activeEntityId}" not in initiativeOrder`);
    }
  }
  const initSet = new Set();
  for (const id of combat.initiativeOrder) {
    if (initSet.has(id)) e("COMBAT_INITIATIVE_UNIQUE", `Duplicate "${id}" in initiativeOrder`);
    initSet.add(id);
  }
  if (combat.mode === "combat" && combat.round < 1) e("COMBAT_ROUND_POSITIVE", `Combat but round=${combat.round}`);

  const terrainCoords = new Set();
  for (const t of state.map?.terrain ?? []) {
    if (t.x < 0 || t.x >= width || t.y < 0 || t.y >= height) {
      e("TERRAIN_IN_BOUNDS", `Terrain (${t.x},${t.y}) outside ${width}x${height}`);
    }
    const tk = `${t.x},${t.y}`;
    if (terrainCoords.has(tk)) e("TERRAIN_NO_DUPLICATES", `Duplicate terrain at (${t.x},${t.y})`);
    terrainCoords.add(tk);
  }
  if (width < 1 || height < 1) e("MAP_SIZE_POSITIVE", `Map size ${width}x${height} invalid`);

  const logIds = new Set();
  const events = state.log?.events ?? [];
  for (const evt of events) {
    if (logIds.has(evt.id)) e("LOG_IDS_UNIQUE", `Duplicate log id "${evt.id}"`);
    logIds.add(evt.id);
  }
  for (let i = 1; i < events.length; i++) {
    if (events[i].timestamp < events[i - 1].timestamp) {
      e("LOG_CHRONOLOGICAL", `"${events[i].id}" timestamp before previous`);
    }
  }

  if (state.rng.mode === "seeded" && (typeof state.rng.seed !== "string" || !state.rng.seed)) {
    e("RNG_SEED_REQUIRED_WHEN_SEEDED", "Seeded mode but seed is null/empty");
  }
  for (let i = 0; i < (state.rng.lastRolls ?? []).length; i++) {
    const roll = state.rng.lastRolls[i];
    if (typeof roll.resultTotal !== "number") {
      e("RNG_ROLL_VALUES_VALID", `lastRolls[${i}]: resultTotal is not a number`);
    }
  }

  if (state.ui.selectedEntityId !== null && !entityIds.has(state.ui.selectedEntityId)) {
    e("UI_SELECTED_ENTITY_EXISTS", `selectedEntityId "${state.ui.selectedEntityId}" not found`);
  }
  if (state.ui.hoveredCell) {
    const { x: hx, y: hy } = state.ui.hoveredCell;
    if (hx < 0 || hx >= width || hy < 0 || hy >= height) {
      e("UI_HOVERED_CELL_IN_BOUNDS", `hoveredCell (${hx},${hy}) outside ${width}x${height}`);
    }
  }

  return { ok: errors.length === 0, errors };
}

export function validateAll(state) {
  const sr = validateGameState(state);
  if (!sr.ok) return { ok: false, errors: sr.errors.map((e) => `[schema] ${e}`) };
  return validateInvariants(state);
}
