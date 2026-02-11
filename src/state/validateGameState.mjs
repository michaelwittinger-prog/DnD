/**
 * validateGameState.mjs — MIR 1.2 GameState Validator.
 *
 * Two-layer validation:
 *   1. Schema validation — JSON Schema 2020-12 via Ajv
 *   2. Invariant validation — 25 game-logic invariants
 *
 * Usage:
 *   node src/state/validateGameState.mjs          # runs self-test against example states
 *   import { validateGameState, validateInvariants } from './validateGameState.mjs'
 *
 * @module validateGameState
 */

import Ajv from "ajv";
import addFormats from "ajv-formats";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "../..");

// ── Load schema ────────────────────────────────────────────────────────

const schema = JSON.parse(readFileSync(resolve(ROOT, "schemas/mir_gamestate.schema.json"), "utf-8"));

// Ajv 8.x does not ship with the 2020-12 meta-schema.
// Disable meta-schema validation to avoid the lookup error.
// The schema features we use (additionalProperties, oneOf, etc.) all work in Ajv 8.
const ajv = new Ajv({ allErrors: true, strict: false, validateSchema: false });
addFormats(ajv);
const compiledValidate = ajv.compile(schema);

// ── Schema validation ──────────────────────────────────────────────────

/**
 * Validate a GameState against the JSON Schema.
 * @param {object} state
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateSchema(state) {
  const valid = compiledValidate(state);
  if (valid) return { ok: true, errors: [] };
  const errors = (compiledValidate.errors ?? []).map(
    (e) => `${e.instancePath || "/"} ${e.message}${e.params ? " " + JSON.stringify(e.params) : ""}`
  );
  return { ok: false, errors };
}

// ── Invariant validation ───────────────────────────────────────────────

/**
 * Collect all entities from the three arrays.
 */
function allEntities(state) {
  const { players = [], npcs = [], objects = [] } = state.entities ?? {};
  return [...players, ...npcs, ...objects];
}

/**
 * Validate all 25 MIR invariants (see docs/mir_state_invariants.md).
 * @param {object} state — Must be structurally valid (pass schema first).
 * @returns {{ ok: boolean, errors: { code: string, message: string }[] }}
 */
export function validateInvariants(state) {
  const errors = [];
  const e = (code, message) => errors.push({ code, message });

  const entities = allEntities(state);
  const entityIds = new Set();
  const { width, height } = state.map?.grid?.size ?? { width: 0, height: 0 };

  // Build blocked set
  const blockedSet = new Set();
  for (const t of state.map?.terrain ?? []) {
    if (t.terrain === "blocked") blockedSet.add(`${t.x},${t.y}`);
  }

  // Build occupied cells set (for overlap check)
  const occupiedCells = new Map(); // "x,y" -> entity id

  // ── 1. UNIQUE_ENTITY_IDS ─────────────────────────────────────────
  for (const ent of entities) {
    if (entityIds.has(ent.id)) {
      e("UNIQUE_ENTITY_IDS", `Duplicate entity id "${ent.id}"`);
    }
    entityIds.add(ent.id);
  }

  // ── 2. ENTITY_KIND_MATCH ─────────────────────────────────────────
  for (const p of state.entities?.players ?? []) {
    if (p.kind !== "player") e("ENTITY_KIND_MATCH", `Entity "${p.id}" in players has kind "${p.kind}", expected "player"`);
  }
  for (const n of state.entities?.npcs ?? []) {
    if (n.kind !== "npc") e("ENTITY_KIND_MATCH", `Entity "${n.id}" in npcs has kind "${n.kind}", expected "npc"`);
  }
  for (const o of state.entities?.objects ?? []) {
    if (o.kind !== "object") e("ENTITY_KIND_MATCH", `Entity "${o.id}" in objects has kind "${o.kind}", expected "object"`);
  }

  for (const ent of entities) {
    // ── 3. HP_BOUNDS ───────────────────────────────────────────────
    if (ent.stats.hpCurrent < 0 || ent.stats.hpCurrent > ent.stats.hpMax) {
      e("HP_BOUNDS", `Entity "${ent.id}": hpCurrent ${ent.stats.hpCurrent} not in [0, ${ent.stats.hpMax}]`);
    }

    // ── 4. HP_MAX_POSITIVE ─────────────────────────────────────────
    if (ent.stats.hpMax < 1) {
      e("HP_MAX_POSITIVE", `Entity "${ent.id}": hpMax ${ent.stats.hpMax} < 1`);
    }

    // ── 5. POSITION_IN_BOUNDS ──────────────────────────────────────
    const { x, y } = ent.position;
    if (x < 0 || x >= width || y < 0 || y >= height) {
      e("POSITION_IN_BOUNDS", `Entity "${ent.id}" at (${x},${y}) is outside map bounds (${width}x${height})`);
    }

    // ── 6. NO_SOLID_OVERLAP ────────────────────────────────────────
    const cellKey = `${x},${y}`;
    if (occupiedCells.has(cellKey)) {
      e("NO_SOLID_OVERLAP", `Entities "${occupiedCells.get(cellKey)}" and "${ent.id}" both occupy cell (${x},${y})`);
    }
    occupiedCells.set(cellKey, ent.id);

    // ── 7. NO_ENTITY_ON_BLOCKED ────────────────────────────────────
    if (blockedSet.has(cellKey)) {
      e("NO_ENTITY_ON_BLOCKED", `Entity "${ent.id}" at (${x},${y}) is on a blocked tile`);
    }

    // ── 8. CONDITIONS_NON_EMPTY_STRINGS ────────────────────────────
    for (let ci = 0; ci < ent.conditions.length; ci++) {
      if (typeof ent.conditions[ci] !== "string" || ent.conditions[ci].length === 0) {
        e("CONDITIONS_NON_EMPTY_STRINGS", `Entity "${ent.id}" conditions[${ci}] is empty or not a string`);
      }
    }

    // ── 9. INVENTORY_IDS_UNIQUE_PER_ENTITY ─────────────────────────
    const itemIds = new Set();
    for (const item of ent.inventory) {
      if (itemIds.has(item.id)) {
        e("INVENTORY_IDS_UNIQUE_PER_ENTITY", `Entity "${ent.id}" has duplicate inventory item id "${item.id}"`);
      }
      itemIds.add(item.id);

      // ── 10. INVENTORY_QTY_NON_NEGATIVE ───────────────────────────
      if (item.qty < 0) {
        e("INVENTORY_QTY_NON_NEGATIVE", `Entity "${ent.id}" item "${item.id}" has qty ${item.qty} < 0`);
      }
    }
  }

  // ── Combat invariants ────────────────────────────────────────────────
  const combat = state.combat;

  // ── 11. COMBAT_MODE_CONSISTENCY ──────────────────────────────────
  if (combat.mode === "exploration") {
    if (combat.round !== 0) e("COMBAT_MODE_CONSISTENCY", `Exploration mode but round is ${combat.round}, expected 0`);
    if (combat.activeEntityId !== null) e("COMBAT_MODE_CONSISTENCY", `Exploration mode but activeEntityId is "${combat.activeEntityId}", expected null`);
    if (combat.initiativeOrder.length !== 0) e("COMBAT_MODE_CONSISTENCY", `Exploration mode but initiativeOrder is not empty`);
  }

  // ── 12. COMBAT_ACTIVE_ENTITY_EXISTS ──────────────────────────────
  if (combat.mode === "combat") {
    if (combat.activeEntityId === null) {
      e("COMBAT_ACTIVE_ENTITY_EXISTS", "Combat mode but activeEntityId is null");
    } else if (!entityIds.has(combat.activeEntityId)) {
      e("COMBAT_ACTIVE_ENTITY_EXISTS", `Combat mode but activeEntityId "${combat.activeEntityId}" not found in entities`);
    }
  }

  // ── 13. COMBAT_INITIATIVE_ENTITIES_EXIST ─────────────────────────
  for (const id of combat.initiativeOrder) {
    if (!entityIds.has(id)) {
      e("COMBAT_INITIATIVE_ENTITIES_EXIST", `Initiative order contains "${id}" which is not an existing entity`);
    }
  }

  // ── 14. COMBAT_ACTIVE_IN_INITIATIVE ──────────────────────────────
  if (combat.mode === "combat" && combat.activeEntityId !== null) {
    if (!combat.initiativeOrder.includes(combat.activeEntityId)) {
      e("COMBAT_ACTIVE_IN_INITIATIVE", `activeEntityId "${combat.activeEntityId}" is not in initiativeOrder`);
    }
  }

  // ── 15. COMBAT_INITIATIVE_UNIQUE ─────────────────────────────────
  const initSet = new Set();
  for (const id of combat.initiativeOrder) {
    if (initSet.has(id)) {
      e("COMBAT_INITIATIVE_UNIQUE", `Duplicate id "${id}" in initiativeOrder`);
    }
    initSet.add(id);
  }

  // ── 16. COMBAT_ROUND_POSITIVE ────────────────────────────────────
  if (combat.mode === "combat" && combat.round < 1) {
    e("COMBAT_ROUND_POSITIVE", `Combat mode but round is ${combat.round}, expected ≥ 1`);
  }

  // ── Map invariants ───────────────────────────────────────────────────
  const terrainCoords = new Set();

  for (const t of state.map?.terrain ?? []) {
    // ── 17. TERRAIN_IN_BOUNDS ──────────────────────────────────────
    if (t.x < 0 || t.x >= width || t.y < 0 || t.y >= height) {
      e("TERRAIN_IN_BOUNDS", `Terrain tile at (${t.x},${t.y}) is outside map bounds (${width}x${height})`);
    }

    // ── 18. TERRAIN_NO_DUPLICATES ──────────────────────────────────
    const tk = `${t.x},${t.y}`;
    if (terrainCoords.has(tk)) {
      e("TERRAIN_NO_DUPLICATES", `Duplicate terrain entry at (${t.x},${t.y})`);
    }
    terrainCoords.add(tk);
  }

  // ── 19. MAP_SIZE_POSITIVE ────────────────────────────────────────
  if (width < 1 || height < 1) {
    e("MAP_SIZE_POSITIVE", `Map size ${width}x${height} is invalid (must be ≥ 1x1)`);
  }

  // ── Log invariants ───────────────────────────────────────────────────
  const logIds = new Set();
  const events = state.log?.events ?? [];

  for (const evt of events) {
    // ── 20. LOG_IDS_UNIQUE ─────────────────────────────────────────
    if (logIds.has(evt.id)) {
      e("LOG_IDS_UNIQUE", `Duplicate log event id "${evt.id}"`);
    }
    logIds.add(evt.id);
  }

  // ── 21. LOG_CHRONOLOGICAL ────────────────────────────────────────
  for (let i = 1; i < events.length; i++) {
    if (events[i].timestamp < events[i - 1].timestamp) {
      e("LOG_CHRONOLOGICAL", `Log event "${events[i].id}" timestamp ${events[i].timestamp} is before previous ${events[i - 1].timestamp}`);
    }
  }

  // ── RNG invariants ───────────────────────────────────────────────────

  // ── 22. RNG_SEED_REQUIRED_WHEN_SEEDED ────────────────────────────
  if (state.rng.mode === "seeded") {
    if (typeof state.rng.seed !== "string" || state.rng.seed.length === 0) {
      e("RNG_SEED_REQUIRED_WHEN_SEEDED", "RNG mode is seeded but seed is null or empty");
    }
  }

  // ── 23. RNG_ROLL_VALUES_VALID ────────────────────────────────────
  for (let i = 0; i < (state.rng.lastRolls ?? []).length; i++) {
    const roll = state.rng.lastRolls[i];
    if (roll.value < 1 || roll.value > roll.max) {
      e("RNG_ROLL_VALUES_VALID", `lastRolls[${i}]: value ${roll.value} not in [1, ${roll.max}]`);
    }
  }

  // ── UI invariants ────────────────────────────────────────────────────

  // ── 24. UI_SELECTED_ENTITY_EXISTS ────────────────────────────────
  if (state.ui.selectedEntityId !== null && !entityIds.has(state.ui.selectedEntityId)) {
    e("UI_SELECTED_ENTITY_EXISTS", `ui.selectedEntityId "${state.ui.selectedEntityId}" is not an existing entity`);
  }

  // ── 25. UI_HOVERED_CELL_IN_BOUNDS ────────────────────────────────
  if (state.ui.hoveredCell !== null) {
    const { x: hx, y: hy } = state.ui.hoveredCell;
    if (hx < 0 || hx >= width || hy < 0 || hy >= height) {
      e("UI_HOVERED_CELL_IN_BOUNDS", `ui.hoveredCell (${hx},${hy}) is outside map bounds (${width}x${height})`);
    }
  }

  return { ok: errors.length === 0, errors };
}

// ── Combined validator ─────────────────────────────────────────────────

/**
 * Full validation: schema + invariants.
 * @param {object} state
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateGameState(state) {
  const schemaResult = validateSchema(state);
  if (!schemaResult.ok) {
    return { ok: false, errors: schemaResult.errors.map((e) => `[schema] ${e}`) };
  }

  const invResult = validateInvariants(state);
  if (!invResult.ok) {
    return { ok: false, errors: invResult.errors.map((e) => `[${e.code}] ${e.message}`) };
  }

  return { ok: true, errors: [] };
}

// ── Self-test when run directly ────────────────────────────────────────

// Robust isMain for ESM on Windows (D&D path has & which breaks argv[1])
const isMain = import.meta.url.endsWith("/state/validateGameState.mjs") &&
  (!process.argv[1] || process.argv[1].includes("validateGameState"));

if (isMain) {
  const { explorationExample, combatExample, invalidExample } = await import("./exampleStates.mjs");

  console.log("");
  console.log("╔══════════════════════════════════════╗");
  console.log("║  MIR 1.2 — GameState Validator Test   ║");
  console.log("╚══════════════════════════════════════╝");
  console.log("");

  let passed = 0;
  let failed = 0;

  function check(cond, label) {
    if (cond) { console.log(`  ✅ ${label}`); passed++; }
    else { console.log(`  ❌ ${label}`); failed++; }
  }

  // ── Exploration example ────────────────────────────────────────────
  console.log("[1] Exploration example — should be fully valid");
  {
    const r = validateGameState(explorationExample);
    check(r.ok === true, "schema + invariants pass");
    if (!r.ok) r.errors.forEach((e) => console.log(`     ⚠ ${e}`));
  }
  console.log("");

  // ── Combat example ─────────────────────────────────────────────────
  console.log("[2] Combat example — should be fully valid");
  {
    const r = validateGameState(combatExample);
    check(r.ok === true, "schema + invariants pass");
    if (!r.ok) r.errors.forEach((e) => console.log(`     ⚠ ${e}`));
  }
  console.log("");

  // ── Invalid example — schema should pass (structure is valid) ──────
  console.log("[3] Invalid example — schema passes, invariants fail");
  {
    const sr = validateSchema(invalidExample);
    check(sr.ok === true, "schema passes (structure is valid)");

    const ir = validateInvariants(invalidExample);
    check(ir.ok === false, "invariants fail");
    check(ir.errors.some((e) => e.code === "UNIQUE_ENTITY_IDS"), "UNIQUE_ENTITY_IDS detected");
    check(ir.errors.some((e) => e.code === "POSITION_IN_BOUNDS"), "POSITION_IN_BOUNDS detected");
    check(ir.errors.some((e) => e.code === "NO_ENTITY_ON_BLOCKED"), "NO_ENTITY_ON_BLOCKED detected");
    check(ir.errors.some((e) => e.code === "COMBAT_ACTIVE_ENTITY_EXISTS"), "COMBAT_ACTIVE_ENTITY_EXISTS detected");
    check(ir.errors.some((e) => e.code === "COMBAT_ROUND_POSITIVE"), "COMBAT_ROUND_POSITIVE detected");
    check(ir.errors.some((e) => e.code === "UI_SELECTED_ENTITY_EXISTS"), "UI_SELECTED_ENTITY_EXISTS detected");
    check(ir.errors.some((e) => e.code === "UI_HOVERED_CELL_IN_BOUNDS"), "UI_HOVERED_CELL_IN_BOUNDS detected");

    console.log(`     (${ir.errors.length} invariant violations found)`);
  }
  console.log("");

  // ── Full validation of invalid example ─────────────────────────────
  console.log("[4] Invalid example — full validateGameState reports errors");
  {
    const r = validateGameState(invalidExample);
    check(r.ok === false, "full validation fails");
    check(r.errors.length > 0, `${r.errors.length} errors reported`);
  }
  console.log("");

  console.log("══════════════════════════════════════════════════");
  console.log(`Results: ${passed}/${passed + failed} passed, ${failed} failed`);
  if (failed === 0) {
    console.log("PASS: all MIR GameState validator tests passed");
  } else {
    console.log("FAIL: some tests failed");
    process.exit(1);
  }
}
