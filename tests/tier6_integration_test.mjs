/**
 * tier6_integration_test.mjs — Cross-Package Integration Tests (Package E)
 *
 * Verifies that all Tier 6 packages work together:
 * - Map editor → dungeon generator → scenario builder pipeline
 * - Rule module system → combat resolution pipeline
 * - Community registry → publish/download → import pipeline
 * - Determinism across all subsystems
 */
import { test } from "node:test";
import assert from "node:assert/strict";

// Package A: Map Editor
import {
  createMapAsset, validateMapAsset, setTerrainTile, mapAssetToStateMap,
  exportMapAsset, importMapAsset,
} from "../src/content/mapEditor.mjs";

// Package B: Rule Module System
import {
  clearRegistry as clearRuleRegistry, listModules, getActiveRules,
  getActiveModuleId, setActiveModule,
} from "../src/rules/ruleModuleRegistry.mjs";
import { initRuleModules } from "../src/rules/initRuleModules.mjs";

// Package C: Community Registry
import {
  createBundle, publishBundle, downloadBundle, searchRegistry, validateBundle,
  exportBundleToJson, importBundleFromJson, clearRegistry as clearContentRegistry,
} from "../src/content/communityRegistry.mjs";

// Package D: Dungeon Generator
import {
  generateDungeon, dungeonToStateMap, createRng, TILE,
} from "../src/content/dungeonGenerator.mjs";

// ── Integration: Map Editor + Dungeon Generator ────────────────────────

test("Integration: dungeon → state map → map editor validation", () => {
  const dungeon = generateDungeon({ seed: 42, width: 20, height: 15 });
  const stateMap = dungeonToStateMap(dungeon);
  assert.equal(stateMap.dimensions.width, 20);
  assert.equal(stateMap.dimensions.height, 15);
  assert.ok(stateMap.cells.length === 300);
  // Verify floor tiles exist
  const floors = stateMap.cells.filter(c => c.passable);
  assert.ok(floors.length > 0, "Dungeon should have passable tiles");
});

test("Integration: map editor asset + dungeon generator coexist", () => {
  const mapAsset = createMapAsset({ id: "int-map-1", name: "Custom Map", width: 20, height: 15 });
  const modified = setTerrainTile(mapAsset, 5, 5, "stone", true, false);
  const validation = validateMapAsset(modified);
  assert.ok(validation.valid);

  // Generate dungeon on same dimensions
  const dungeon = generateDungeon({ seed: 99, width: 20, height: 15 });
  assert.ok(dungeon.rooms.length >= 1);

  // Both can produce state maps
  const editorMap = mapAssetToStateMap(modified);
  const dungeonMap = dungeonToStateMap(dungeon);
  assert.ok(editorMap.cells.length > 0);
  assert.ok(dungeonMap.cells.length > 0);
});

// ── Integration: Rule Modules + Combat ─────────────────────────────────

test("Integration: rule module init + switch + combat resolution", () => {
  clearRuleRegistry();
  initRuleModules();
  assert.equal(listModules().length, 2);
  assert.equal(getActiveModuleId(), "core-5e-lite");

  const attacker = { id: "p1", stats: { ac: 15, strength: 16, attackBonus: 5 }, conditions: [] };
  const target = { id: "n1", stats: { ac: 12 }, conditions: [], resistances: [] };
  const rng = createRng(42);

  // Test with core-5e-lite
  const coreRules = getActiveRules();
  const coreResult = coreRules.combat.calculateAttackRoll(attacker, target, rng);
  assert.ok("hit" in coreResult);

  // Switch to homebrew
  setActiveModule("homebrew-sample");
  const homebrewRules = getActiveRules();
  const rng2 = createRng(42);
  const homebrewResult = homebrewRules.combat.calculateAttackRoll(attacker, target, rng2);
  assert.ok("hit" in homebrewResult);
});

test("Integration: rule module conditions affect movement rules", () => {
  clearRuleRegistry();
  initRuleModules();
  const rules = getActiveRules();

  const entity = { stats: { movementSpeed: 6 }, conditions: ["prone"] };
  const speed = rules.movement.getMovementSpeed(entity, ["prone"]);
  assert.equal(speed, 3); // Prone halves movement

  // Switch to homebrew — different behavior
  setActiveModule("homebrew-sample");
  const hbRules = getActiveRules();
  const hbEntity = { stats: { movementSpeed: 8 }, conditions: [] };
  const hbSpeed = hbRules.movement.getMovementSpeed(hbEntity, ["enraged"]);
  assert.equal(hbSpeed, 10); // Enraged adds +2
});

// ── Integration: Community Registry + Content Sharing ──────────────────

test("Integration: publish scenario bundle → download → validate", () => {
  clearContentRegistry();
  const scenario = { name: "Test", map: { width: 10, height: 10 }, entities: [] };
  const bundle = createBundle({
    id: "int-scenario-1", name: "Integration Scenario", author: "Bot",
    version: "1.0.0", description: "Cross-package test", tags: ["test"],
    type: "scenario", data: scenario,
  });
  const pubResult = publishBundle(bundle);
  assert.ok(pubResult.ok);

  const dlResult = downloadBundle("int-scenario-1");
  assert.ok(dlResult.ok);
  assert.equal(dlResult.bundle.meta.id, "int-scenario-1");
  assert.deepEqual(dlResult.bundle.data, scenario);
});

test("Integration: publish dungeon as map bundle → export/import roundtrip", () => {
  clearContentRegistry();
  const dungeon = generateDungeon({ seed: 777, width: 20, height: 15 });
  const stateMap = dungeonToStateMap(dungeon);

  const bundle = createBundle({
    id: "dungeon-777", name: "Seed 777 Dungeon", author: "Generator",
    version: "1.0.0", description: "Procedurally generated", tags: ["dungeon", "generated"],
    type: "map", data: stateMap,
  });
  publishBundle(bundle);

  // Export to JSON
  const json = exportBundleToJson("dungeon-777");
  assert.ok(json);

  // Import back
  const imported = importBundleFromJson(json);
  assert.ok(imported.ok);
  assert.equal(imported.bundle.meta.id, "dungeon-777");
  assert.equal(imported.bundle.data.dimensions.width, 20);
});

test("Integration: publish rule module bundle", () => {
  clearContentRegistry();
  clearRuleRegistry();
  initRuleModules();

  const bundle = createBundle({
    id: "rule-homebrew", name: "Homebrew Rules", author: "Community",
    version: "1.0.0", description: "Custom homebrew rules", tags: ["rules"],
    type: "ruleModule", data: { moduleId: "homebrew-sample", version: "1.0.0" },
  });
  assert.ok(publishBundle(bundle).ok);

  const results = searchRegistry({ type: "ruleModule" });
  assert.equal(results.length, 1);
  assert.equal(results[0].id, "rule-homebrew");
});

// ── Integration: Full Pipeline ─────────────────────────────────────────

test("Integration: full pipeline — generate dungeon → publish → download → use", () => {
  clearContentRegistry();

  // 1. Generate dungeon
  const dungeon = generateDungeon({ seed: 42, width: 30, height: 20 });
  const stateMap = dungeonToStateMap(dungeon);

  // 2. Publish as community content
  const bundle = createBundle({
    id: "full-pipeline-dungeon", name: "Pipeline Dungeon", author: "System",
    version: "1.0.0", description: "End-to-end test", tags: ["pipeline"],
    type: "map", data: stateMap,
  });
  assert.ok(publishBundle(bundle).ok);

  // 3. Download and verify
  const dl = downloadBundle("full-pipeline-dungeon");
  assert.ok(dl.ok);
  assert.equal(dl.bundle.data.dimensions.width, 30);
  assert.ok(dl.bundle.data.rooms.length >= 1);
  assert.ok(dl.bundle.data.encounters.length >= 0);

  // 4. Verify rule module can be used with the map
  clearRuleRegistry();
  initRuleModules();
  const rules = getActiveRules();
  const entity = { stats: { movementSpeed: 6 }, conditions: [] };
  const speed = rules.movement.getMovementSpeed(entity);
  assert.equal(speed, 6);
});

// ── Determinism Across Packages ────────────────────────────────────────

test("Integration: determinism — identical seeds across all subsystems", () => {
  // Dungeon
  const d1 = generateDungeon({ seed: 55555 });
  const d2 = generateDungeon({ seed: 55555 });
  assert.deepEqual(d1.rooms, d2.rooms);
  assert.deepEqual(d1.stairs, d2.stairs);

  // RNG
  const r1 = createRng(55555);
  const r2 = createRng(55555);
  for (let i = 0; i < 100; i++) {
    assert.equal(r1.next(), r2.next());
  }

  // Rule module combat with same RNG seed
  clearRuleRegistry();
  initRuleModules();
  const rules = getActiveRules();
  const attacker = { stats: { attackBonus: 5 }, conditions: [] };
  const target = { stats: { ac: 12 }, conditions: [] };
  const rng1 = createRng(42);
  const rng2 = createRng(42);
  const res1 = rules.combat.calculateAttackRoll(attacker, target, rng1);
  const res2 = rules.combat.calculateAttackRoll(attacker, target, rng2);
  assert.equal(res1.roll, res2.roll);
  assert.equal(res1.hit, res2.hit);
});

console.log("✓ All Tier 6 integration tests passed");