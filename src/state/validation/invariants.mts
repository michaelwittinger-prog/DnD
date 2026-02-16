/**
 * invariants.mjs — MIR 2.2 Game-Logic Invariant Validator.
 *
 * Pure JavaScript, zero dependencies. Works in Node and browser.
 * Checks the 25 MIR invariants defined in docs/mir_state_invariants.md.
 *
 * This is the single source of truth for invariant validation.
 */

function allEntities(state) {
  const { players = [], npcs = [], objects = [] } = state.entities ?? {};
  return [...players, ...npcs, ...objects];
}

/**
 * Validate all 25 MIR invariants.
 * @param {object} state — Should be structurally valid first.
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateInvariants(state) {
  const errors = [];
  const e = (code, msg) => errors.push(`[${code}] ${msg}`);

  const entities = allEntities(state);
  const entityIds = new Set();
  const { width, height } = state.map?.grid?.size ?? { width: 0, height: 0 };

  // Build blocked set
  const blockedSet = new Set();
  for (const t of state.map?.terrain ?? []) {
    if (t.blocksMovement) blockedSet.add(`${t.x},${t.y}`);
  }

  const occupiedCells = new Map();

  // 1. UNIQUE_ENTITY_IDS
  for (const ent of entities) {
    if (entityIds.has(ent.id)) e("UNIQUE_ENTITY_IDS", `Duplicate entity id "${ent.id}"`);
    entityIds.add(ent.id);
  }

  // 2. ENTITY_KIND_MATCH
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
    // 3. HP_BOUNDS
    if (ent.stats.hpCurrent < 0 || ent.stats.hpCurrent > ent.stats.hpMax) {
      e("HP_BOUNDS", `"${ent.id}": hpCurrent ${ent.stats.hpCurrent} not in [0, ${ent.stats.hpMax}]`);
    }
    // 4. HP_MAX_POSITIVE
    if (ent.stats.hpMax < 1) e("HP_MAX_POSITIVE", `"${ent.id}": hpMax ${ent.stats.hpMax} < 1`);
    // 5. POSITION_IN_BOUNDS
    const { x, y } = ent.position;
    if (x < 0 || x >= width || y < 0 || y >= height) {
      e("POSITION_IN_BOUNDS", `"${ent.id}" at (${x},${y}) outside ${width}x${height}`);
    }
    // 6. NO_SOLID_OVERLAP
    const ck = `${x},${y}`;
    if (occupiedCells.has(ck)) {
      e("NO_SOLID_OVERLAP", `"${occupiedCells.get(ck)}" and "${ent.id}" both at (${x},${y})`);
    }
    occupiedCells.set(ck, ent.id);
    // 7. NO_ENTITY_ON_BLOCKED
    if (blockedSet.has(ck)) e("NO_ENTITY_ON_BLOCKED", `"${ent.id}" at (${x},${y}) on blocked tile`);
    // 8. CONDITIONS_NON_EMPTY_STRINGS
    for (let ci = 0; ci < ent.conditions.length; ci++) {
      if (typeof ent.conditions[ci] !== "string" || !ent.conditions[ci]) {
        e("CONDITIONS_NON_EMPTY_STRINGS", `"${ent.id}" conditions[${ci}] is empty`);
      }
    }
    // 9. INVENTORY_IDS_UNIQUE_PER_ENTITY
    const itemIds = new Set();
    for (const item of ent.inventory) {
      if (itemIds.has(item.id)) e("INVENTORY_IDS_UNIQUE_PER_ENTITY", `"${ent.id}" duplicate item id "${item.id}"`);
      itemIds.add(item.id);
      // 10. INVENTORY_QTY_POSITIVE
      if (item.qty < 1) e("INVENTORY_QTY_POSITIVE", `"${ent.id}" item "${item.id}" qty ${item.qty} < 1`);
    }
  }

  // Combat invariants
  const combat = state.combat;
  // 11. COMBAT_MODE_CONSISTENCY
  if (combat.mode === "exploration") {
    if (combat.round !== 0) e("COMBAT_MODE_CONSISTENCY", `Exploration but round=${combat.round}`);
    if (combat.activeEntityId !== null) e("COMBAT_MODE_CONSISTENCY", `Exploration but activeEntityId="${combat.activeEntityId}"`);
    if (combat.initiativeOrder.length) e("COMBAT_MODE_CONSISTENCY", `Exploration but initiativeOrder not empty`);
  }
  // 12. COMBAT_ACTIVE_ENTITY_EXISTS
  if (combat.mode === "combat") {
    if (!combat.activeEntityId) e("COMBAT_ACTIVE_ENTITY_EXISTS", "Combat but activeEntityId is null");
    else if (!entityIds.has(combat.activeEntityId)) e("COMBAT_ACTIVE_ENTITY_EXISTS", `activeEntityId "${combat.activeEntityId}" not found`);
  }
  // 13. COMBAT_INITIATIVE_ENTITIES_EXIST
  for (const id of combat.initiativeOrder) {
    if (!entityIds.has(id)) e("COMBAT_INITIATIVE_ENTITIES_EXIST", `"${id}" in initiativeOrder not found`);
  }
  // 14. COMBAT_ACTIVE_IN_INITIATIVE
  if (combat.mode === "combat" && combat.activeEntityId) {
    if (!combat.initiativeOrder.includes(combat.activeEntityId)) {
      e("COMBAT_ACTIVE_IN_INITIATIVE", `activeEntityId "${combat.activeEntityId}" not in initiativeOrder`);
    }
  }
  // 15. COMBAT_INITIATIVE_UNIQUE
  const initSet = new Set();
  for (const id of combat.initiativeOrder) {
    if (initSet.has(id)) e("COMBAT_INITIATIVE_UNIQUE", `Duplicate "${id}" in initiativeOrder`);
    initSet.add(id);
  }
  // 16. COMBAT_ROUND_POSITIVE
  if (combat.mode === "combat" && combat.round < 1) e("COMBAT_ROUND_POSITIVE", `Combat but round=${combat.round}`);

  // Map invariants
  const terrainCoords = new Set();
  for (const t of state.map?.terrain ?? []) {
    // 17. TERRAIN_IN_BOUNDS
    if (t.x < 0 || t.x >= width || t.y < 0 || t.y >= height) {
      e("TERRAIN_IN_BOUNDS", `Terrain (${t.x},${t.y}) outside ${width}x${height}`);
    }
    // 18. TERRAIN_NO_DUPLICATES
    const tk = `${t.x},${t.y}`;
    if (terrainCoords.has(tk)) e("TERRAIN_NO_DUPLICATES", `Duplicate terrain at (${t.x},${t.y})`);
    terrainCoords.add(tk);
  }
  // 19. MAP_SIZE_POSITIVE
  if (width < 1 || height < 1) e("MAP_SIZE_POSITIVE", `Map size ${width}x${height} invalid`);

  // Log invariants
  const logIds = new Set();
  const events = state.log?.events ?? [];
  for (const evt of events) {
    // 20. LOG_IDS_UNIQUE
    if (logIds.has(evt.id)) e("LOG_IDS_UNIQUE", `Duplicate log id "${evt.id}"`);
    logIds.add(evt.id);
  }
  // 21. LOG_CHRONOLOGICAL
  for (let i = 1; i < events.length; i++) {
    if (events[i].timestamp < events[i - 1].timestamp) {
      e("LOG_CHRONOLOGICAL", `"${events[i].id}" timestamp before previous`);
    }
  }

  // RNG invariants
  // 22. RNG_SEED_REQUIRED_WHEN_SEEDED
  if (state.rng.mode === "seeded" && (typeof state.rng.seed !== "string" || !state.rng.seed)) {
    e("RNG_SEED_REQUIRED_WHEN_SEEDED", "Seeded mode but seed is null/empty");
  }
  // 23. RNG_ROLL_VALUES_VALID
  for (let i = 0; i < (state.rng.lastRolls ?? []).length; i++) {
    const roll = state.rng.lastRolls[i];
    if (typeof roll.resultTotal !== "number") {
      e("RNG_ROLL_VALUES_VALID", `lastRolls[${i}]: resultTotal is not a number`);
    }
  }

  // UI invariants
  // 24. UI_SELECTED_ENTITY_EXISTS
  if (state.ui.selectedEntityId !== null && !entityIds.has(state.ui.selectedEntityId)) {
    e("UI_SELECTED_ENTITY_EXISTS", `selectedEntityId "${state.ui.selectedEntityId}" not found`);
  }
  // 25. UI_HOVERED_CELL_IN_BOUNDS
  if (state.ui.hoveredCell) {
    const { x: hx, y: hy } = state.ui.hoveredCell;
    if (hx < 0 || hx >= width || hy < 0 || hy >= height) {
      e("UI_HOVERED_CELL_IN_BOUNDS", `hoveredCell (${hx},${hy}) outside ${width}x${height}`);
    }
  }

  return { ok: errors.length === 0, errors };
}
