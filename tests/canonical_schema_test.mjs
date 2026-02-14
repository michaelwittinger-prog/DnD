/**
 * canonical_schema_test.mjs — MIR Canonical Schema Declaration.
 *
 * PURPOSE: This test exists to enforce a single, explicit truth about
 * which state schema is canonical in the MIR project.
 *
 * CANONICAL RUNTIME: src/engine/ (ESM)
 * CANONICAL SCHEMA:  schemas/mir_gamestate.schema.json
 * CANONICAL VALIDATOR: src/state/validation/ (pre-compiled, zero-dep)
 *
 * LEGACY ADAPTER LAYER (pipeline):
 *   - game_state.schema.json (root) — pipeline proposal format
 *   - src/pipeline/ — translates AI proposals → engine DeclaredActions
 *   - src/rules/rulesEngine.mjs — validates proposals in pipeline format
 *   - Root .js files (gatekeeper.js, etc.) — CJS, validate pipeline format
 *
 * The pipeline format is NOT the canonical state. It is an adapter layer
 * for LLM proposal validation. The engine never consumes pipeline state.
 *
 * If any of these tests fail, something is violating the canonical boundary.
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { validateGameState, validateInvariants, validateAll } from "../src/state/validation/index.mjs";
import { applyAction } from "../src/engine/applyAction.mjs";
import { explorationExample, combatExample, demoEncounter } from "../src/state/exampleStates.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ── Helper ──────────────────────────────────────────────────────────────

function loadJson(relPath) {
  return JSON.parse(readFileSync(resolve(ROOT, relPath), "utf-8"));
}

// ── 1. Canonical Schema Structure ───────────────────────────────────────

describe("Canonical Schema Declaration", () => {

  it("schemas/mir_gamestate.schema.json is the canonical schema file", () => {
    const schema = loadJson("schemas/mir_gamestate.schema.json");
    assert.equal(schema.title, "MIR GameState", "Schema title must be 'MIR GameState'");
    assert.ok(schema.required.includes("schemaVersion"), "Must require schemaVersion");
    assert.ok(schema.required.includes("entities"), "Must require entities");
    assert.ok(schema.required.includes("combat"), "Must require combat");
    assert.ok(schema.required.includes("map"), "Must require map");
    assert.ok(schema.required.includes("log"), "Must require log");
    assert.ok(schema.required.includes("ui"), "Must require ui");
    assert.ok(schema.required.includes("rng"), "Must require rng");
  });

  it("canonical entities shape is categorized (players/npcs/objects), NOT a flat array", () => {
    const schema = loadJson("schemas/mir_gamestate.schema.json");
    const entities = schema.properties.entities;
    assert.equal(entities.type, "object", "entities must be an object");
    assert.ok(entities.properties.players, "entities must have players");
    assert.ok(entities.properties.npcs, "entities must have npcs");
    assert.ok(entities.properties.objects, "entities must have objects");
  });

  it("canonical combat shape uses mode (string), NOT active (boolean)", () => {
    const schema = loadJson("schemas/mir_gamestate.schema.json");
    const combat = schema.properties.combat;
    assert.ok(combat.properties.mode, "combat must have mode");
    assert.ok(combat.properties.activeEntityId, "combat must have activeEntityId");
    assert.ok(combat.properties.initiativeOrder, "combat must have initiativeOrder");
    assert.equal(combat.properties.active, undefined, "combat must NOT have 'active' boolean (that's pipeline format)");
    assert.equal(combat.properties.active_index, undefined, "combat must NOT have 'active_index' (that's pipeline format)");
  });

  it("canonical map shape uses grid.size, NOT dimensions", () => {
    const schema = loadJson("schemas/mir_gamestate.schema.json");
    const map = schema.properties.map;
    assert.ok(map.properties.grid, "map must have grid");
    assert.equal(map.properties.dimensions, undefined, "map must NOT have 'dimensions' (that's pipeline format)");
  });

  it("pipeline schema (game_state.schema.json) is a DIFFERENT schema — not canonical", () => {
    const pipeline = loadJson("game_state.schema.json");
    const engine = loadJson("schemas/mir_gamestate.schema.json");

    // They must be structurally different — this test will fail if someone
    // accidentally makes them the same, which would hide the boundary
    assert.notDeepStrictEqual(
      pipeline.required.sort(),
      engine.required.sort(),
      "Pipeline and engine schemas must have different required fields"
    );
  });
});

// ── 2. Canonical Validator Accepts Canonical State ──────────────────────

describe("Canonical Validator (src/state/validation/)", () => {

  it("validates explorationExample as OK", () => {
    const result = validateAll(explorationExample);
    assert.ok(result.ok, `Exploration example should validate: ${result.errors.join(", ")}`);
  });

  it("validates combatExample as OK", () => {
    const result = validateAll(combatExample);
    assert.ok(result.ok, `Combat example should validate: ${result.errors.join(", ")}`);
  });

  it("validates demoEncounter as OK", () => {
    const result = validateAll(demoEncounter);
    assert.ok(result.ok, `Demo encounter should validate: ${result.errors.join(", ")}`);
  });

  it("rejects a pipeline-format state", () => {
    const pipelineState = {
      meta: { schemaVersion: "1.0", createdAt: "2026-01-01T00:00:00Z" },
      session: { id: "s1", name: "Test", status: "active" },
      ruleset: { system: "5e", edition: "2024" },
      timeline: { currentTime: "dawn", turn: 0 },
      world: { name: "Faerun" },
      map: { name: "Test", dimensions: { width: 10, height: 10 } },
      entities: [{ id: "e1", name: "Test", type: "pc" }],
      inventory: { items: [] },
      quests: [],
      flags: {},
      rng: { seed: 42, lastRoll: { sides: 20, result: 15 } },
      logs: [],
    };

    const result = validateGameState(pipelineState);
    assert.ok(!result.ok, "Pipeline-format state must be REJECTED by canonical validator");
  });
});

// ── 3. Canonical Engine Accepts Canonical State ─────────────────────────

describe("Canonical Engine (src/engine/applyAction)", () => {

  it("accepts a valid action on canonical exploration state", () => {
    const result = applyAction(explorationExample, {
      type: "MOVE",
      entityId: "pc-seren",
      path: [{ x: 2, y: 4 }],
    });
    assert.ok(result.success, `Engine should accept MOVE: ${(result.errors || []).join(", ")}`);
    assert.ok(result.nextState, "Must return nextState");
    assert.ok(result.events.length > 0, "Must produce events");
  });

  it("accepts a valid action on canonical combat state", () => {
    // Use END_TURN which is always valid for the active entity
    const result = applyAction(combatExample, {
      type: "END_TURN",
      entityId: combatExample.combat.activeEntityId,
    });
    assert.ok(result.success, `Engine should accept END_TURN: ${(result.errors || []).join(", ")}`);
  });

  it("engine output is still canonical (round-trip)", () => {
    const result = applyAction(explorationExample, {
      type: "MOVE",
      entityId: "pc-seren",
      path: [{ x: 2, y: 4 }],
    });
    assert.ok(result.success);

    // The output state must also pass canonical validation
    const validation = validateAll(result.nextState);
    assert.ok(validation.ok, `Engine output must validate: ${validation.errors.join(", ")}`);
  });
});

// ── 4. Canonical State Shape Contract ───────────────────────────────────

describe("Canonical State Shape Contract", () => {

  it("entities.players is an array of objects with kind='player'", () => {
    for (const p of explorationExample.entities.players) {
      assert.equal(p.kind, "player", `Player ${p.id} must have kind='player'`);
      assert.ok(p.position, "Player must have position");
      assert.ok(p.stats, "Player must have stats");
      assert.ok(p.stats.hpCurrent !== undefined, "Player must have hpCurrent");
      assert.ok(p.stats.hpMax !== undefined, "Player must have hpMax");
      assert.ok(p.stats.ac !== undefined, "Player must have ac");
      assert.ok(p.stats.movementSpeed !== undefined, "Player must have movementSpeed");
    }
  });

  it("entities.npcs is an array of objects with kind='npc'", () => {
    for (const n of explorationExample.entities.npcs) {
      assert.equal(n.kind, "npc", `NPC ${n.id} must have kind='npc'`);
    }
  });

  it("combat.mode is 'exploration' or 'combat' (never a boolean)", () => {
    assert.equal(typeof explorationExample.combat.mode, "string");
    assert.ok(["exploration", "combat"].includes(explorationExample.combat.mode));
    assert.equal(typeof combatExample.combat.mode, "string");
    assert.ok(["exploration", "combat"].includes(combatExample.combat.mode));
  });

  it("map uses grid.size.width/height (not dimensions.width/height)", () => {
    assert.ok(explorationExample.map.grid.size.width > 0);
    assert.ok(explorationExample.map.grid.size.height > 0);
    assert.equal(explorationExample.map.dimensions, undefined);
  });

  it("log uses events[] (not logs[])", () => {
    assert.ok(Array.isArray(explorationExample.log.events));
    assert.equal(explorationExample.logs, undefined);
  });
});
