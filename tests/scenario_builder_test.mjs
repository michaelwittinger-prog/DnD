/**
 * scenario_builder_test.mjs — Tests for Tier 6.4 Scenario Builder.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MAP_TEMPLATES, getMapTemplate, listMapTemplates,
  buildScenario, quickBuild,
} from "../src/content/scenarioBuilder.mjs";

// ── Map Templates ───────────────────────────────────────────────────────

describe("MAP_TEMPLATES", () => {
  it("has 4 map templates", () => {
    assert.equal(Object.keys(MAP_TEMPLATES).length, 4);
  });
  it("each template has required fields", () => {
    for (const [key, m] of Object.entries(MAP_TEMPLATES)) {
      assert.ok(m.templateId, `${key}: missing templateId`);
      assert.ok(m.name, `${key}: missing name`);
      assert.ok(m.grid?.size?.width > 0, `${key}: invalid grid width`);
      assert.ok(m.grid?.size?.height > 0, `${key}: invalid grid height`);
      assert.ok(Array.isArray(m.terrain), `${key}: terrain must be array`);
      assert.ok(Array.isArray(m.playerSpawns), `${key}: playerSpawns must be array`);
      assert.ok(m.playerSpawns.length >= 2, `${key}: need at least 2 spawn points`);
      assert.ok(m.npcSpawnZone, `${key}: missing npcSpawnZone`);
    }
  });
});

describe("getMapTemplate", () => {
  it("returns template for valid ID", () => {
    const m = getMapTemplate("arena");
    assert.equal(m.templateId, "arena");
  });
  it("returns null for unknown ID", () => {
    assert.equal(getMapTemplate("volcano"), null);
  });
});

describe("listMapTemplates", () => {
  it("lists all 4 templates with summary", () => {
    const list = listMapTemplates();
    assert.equal(list.length, 4);
    assert.ok(list[0].templateId);
    assert.ok(list[0].name);
    assert.ok(list[0].size);
  });
});

// ── buildScenario ───────────────────────────────────────────────────────

describe("buildScenario", () => {
  it("builds a valid scenario from components", () => {
    const { scenario, errors } = buildScenario({
      name: "Test Scenario",
      description: "A test encounter.",
      mapTemplateId: "arena",
      partyPresetIds: ["seren", "thorin"],
      difficulty: "normal",
      seed: 42,
    });
    assert.equal(errors.length, 0);
    assert.ok(scenario);
    assert.equal(scenario.format, "mir-scenario");
    assert.equal(scenario.version, "1.0.0");
    assert.equal(scenario.meta.name, "Test Scenario");
    assert.equal(scenario.meta.difficulty, "normal");
    assert.equal(scenario.meta.partySize, 2);
    assert.ok(scenario.meta.monsterCount > 0);
  });

  it("scenario has valid initialState structure", () => {
    const { scenario } = buildScenario({
      name: "State Test",
      mapTemplateId: "arena",
      partyPresetIds: ["seren"],
      seed: 99,
    });
    const state = scenario.initialState;
    assert.ok(state.map);
    assert.ok(state.map.grid.size.width > 0);
    assert.ok(state.entities.players.length === 1);
    assert.ok(state.entities.npcs.length > 0);
    assert.ok(Array.isArray(state.entities.objects));
    assert.ok(state.combat);
    assert.equal(state.combat.active, false);
    assert.ok(Array.isArray(state.eventLog));
    assert.ok(state.rng);
  });

  it("places players at map spawn points", () => {
    const { scenario } = buildScenario({
      name: "Spawn Test",
      mapTemplateId: "arena",
      partyPresetIds: ["seren", "thorin"],
      seed: 42,
    });
    const players = scenario.initialState.entities.players;
    assert.deepEqual(players[0].position, { x: 2, y: 8 });
    assert.deepEqual(players[1].position, { x: 4, y: 8 });
  });

  it("NPCs do not overlap player positions", () => {
    const { scenario } = buildScenario({
      name: "Overlap Test",
      mapTemplateId: "arena",
      partyPresetIds: ["seren", "thorin", "miri"],
      seed: 42,
    });
    const playerPosSet = new Set(
      scenario.initialState.entities.players.map(p => `${p.position.x},${p.position.y}`)
    );
    for (const npc of scenario.initialState.entities.npcs) {
      const key = `${npc.position.x},${npc.position.y}`;
      assert.ok(!playerPosSet.has(key), `NPC at ${key} overlaps player`);
    }
  });

  it("includes terrain from map template", () => {
    const { scenario } = buildScenario({
      name: "Terrain Test",
      mapTemplateId: "dungeon_corridor",
      partyPresetIds: ["seren"],
      seed: 42,
    });
    const terrain = scenario.initialState.map.terrain;
    assert.ok(Object.keys(terrain).length > 0);
    assert.ok(terrain["3,2"]); // wall pillar
    assert.equal(terrain["3,2"].type, "wall");
    assert.equal(terrain["3,2"].blocksMovement, true);
  });

  it("returns errors for missing name", () => {
    const { errors } = buildScenario({
      mapTemplateId: "arena",
      partyPresetIds: ["seren"],
    });
    assert.ok(errors.some(e => e.includes("name")));
  });

  it("returns errors for unknown map", () => {
    const { scenario, errors } = buildScenario({
      name: "Bad Map",
      mapTemplateId: "volcano",
      partyPresetIds: ["seren"],
    });
    assert.equal(scenario, null);
    assert.ok(errors.some(e => e.includes("Unknown map")));
  });

  it("returns errors for empty party", () => {
    const { errors } = buildScenario({
      name: "Empty Party",
      mapTemplateId: "arena",
      partyPresetIds: [],
    });
    assert.ok(errors.some(e => e.includes("party member")));
  });

  it("handles different difficulties", () => {
    const easy = buildScenario({
      name: "Easy", mapTemplateId: "arena",
      partyPresetIds: ["seren", "thorin"], difficulty: "easy", seed: 42,
    });
    const deadly = buildScenario({
      name: "Deadly", mapTemplateId: "arena",
      partyPresetIds: ["seren", "thorin"], difficulty: "deadly", seed: 42,
    });
    assert.equal(easy.errors.length, 0);
    assert.equal(deadly.errors.length, 0);
    assert.equal(easy.scenario.meta.difficulty, "easy");
    assert.equal(deadly.scenario.meta.difficulty, "deadly");
  });

  it("works with all map templates", () => {
    for (const mapId of Object.keys(MAP_TEMPLATES)) {
      const { scenario, errors } = buildScenario({
        name: `${mapId} test`,
        mapTemplateId: mapId,
        partyPresetIds: ["seren", "thorin"],
        seed: 42,
      });
      assert.equal(errors.length, 0, `Failed for map: ${mapId}: ${errors.join(", ")}`);
      assert.ok(scenario, `No scenario for map: ${mapId}`);
    }
  });
});

// ── quickBuild ──────────────────────────────────────────────────────────

describe("quickBuild", () => {
  it("builds a scenario with minimal params", () => {
    const { scenario, errors } = quickBuild("arena", ["seren", "thorin"]);
    assert.equal(errors.length, 0);
    assert.ok(scenario);
    assert.ok(scenario.meta.name.includes("Arena"));
  });

  it("accepts difficulty parameter", () => {
    const { scenario } = quickBuild("forest_clearing", ["miri"], "hard");
    assert.equal(scenario.meta.difficulty, "hard");
  });

  it("returns errors for bad map", () => {
    const { errors } = quickBuild("nonexistent", ["seren"]);
    assert.ok(errors.length > 0);
  });
});
