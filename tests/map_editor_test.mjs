/**
 * map_editor_test.mjs — Map Editor Module Tests (Tier 6.1)
 * 
 * Tests for the map editor core domain module:
 * - Map asset creation and validation
 * - Terrain tile manipulation
 * - Import/export functionality
 * - Conversion to game state format
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createMapAsset,
  validateMapAsset,
  setTerrainTile,
  clearTerrainTile,
  exportMapAsset,
  importMapAsset,
  mapAssetToStateMap,
} from "../src/content/mapEditor.mjs";

// ── Test Suite: Map Asset Creation ─────────────────────────────────────

test("createMapAsset: creates valid map with default values", () => {
  const map = createMapAsset({
    id: "test-map-1",
    name: "Test Map",
    width: 10,
    height: 10,
  });

  assert.equal(map.meta.id, "test-map-1");
  assert.equal(map.meta.name, "Test Map");
  assert.equal(map.grid.size.width, 10);
  assert.equal(map.grid.size.height, 10);
  assert.equal(map.grid.cellSize, 5);
  assert.ok(Array.isArray(map.terrain));
  assert.equal(map.terrain.length, 0);
});

test("createMapAsset: validates width/height bounds", () => {
  assert.throws(() => {
    createMapAsset({ id: "bad", name: "Bad", width: 3, height: 10 });
  }, /Width must be between 5 and 50/);

  assert.throws(() => {
    createMapAsset({ id: "bad", name: "Bad", width: 10, height: 60 });
  }, /Height must be between 5 and 50/);
});

// ── Test Suite: Map Asset Validation ───────────────────────────────────

test("validateMapAsset: accepts valid map", () => {
  const map = createMapAsset({
    id: "valid",
    name: "Valid Map",
    width: 10,
    height: 10,
  });

  const result = validateMapAsset(map);
  assert.equal(result.valid, true);
  assert.equal(result.errors.length, 0);
});

test("validateMapAsset: rejects null map", () => {
  const result = validateMapAsset(null);
  assert.equal(result.valid, false);
  assert.ok(result.errors.length > 0);
});

test("validateMapAsset: rejects out-of-bounds terrain", () => {
  const map = createMapAsset({
    id: "test",
    name: "Test",
    width: 10,
    height: 10,
  });

  // Manually add out-of-bounds terrain
  map.terrain.push({ x: 15, y: 5, type: "blocked" });

  const result = validateMapAsset(map);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some(e => e.includes("out of bounds")));
});

// ── Test Suite: Terrain Tile Manipulation ──────────────────────────────

test("setTerrainTile: adds terrain tile", () => {
  const map = createMapAsset({
    id: "test",
    name: "Test",
    width: 10,
    height: 10,
  });

  const updated = setTerrainTile(map, 5, 5, "blocked", true, true);

  assert.equal(updated.terrain.length, 1);
  assert.equal(updated.terrain[0].x, 5);
  assert.equal(updated.terrain[0].y, 5);
  assert.equal(updated.terrain[0].type, "blocked");
  assert.equal(updated.terrain[0].blocksMovement, true);
  assert.equal(updated.terrain[0].blocksVision, true);
});

test("setTerrainTile: replaces existing tile", () => {
  let map = createMapAsset({
    id: "test",
    name: "Test",
    width: 10,
    height: 10,
  });

  map = setTerrainTile(map, 3, 3, "water", true, false);
  map = setTerrainTile(map, 3, 3, "lava", true, true);

  assert.equal(map.terrain.length, 1);
  assert.equal(map.terrain[0].type, "lava");
});

test("setTerrainTile: rejects out-of-bounds coordinates", () => {
  const map = createMapAsset({
    id: "test",
    name: "Test",
    width: 10,
    height: 10,
  });

  assert.throws(() => {
    setTerrainTile(map, 15, 5, "blocked", true, true);
  }, /out of bounds/);
});

test("clearTerrainTile: removes terrain tile", () => {
  let map = createMapAsset({
    id: "test",
    name: "Test",
    width: 10,
    height: 10,
  });

  map = setTerrainTile(map, 5, 5, "blocked", true, true);
  assert.equal(map.terrain.length, 1);

  map = clearTerrainTile(map, 5, 5);
  assert.equal(map.terrain.length, 0);
});

test("clearTerrainTile: no-op if tile doesn't exist", () => {
  const map = createMapAsset({
    id: "test",
    name: "Test",
    width: 10,
    height: 10,
  });

  const updated = clearTerrainTile(map, 5, 5);
  assert.equal(updated.terrain.length, 0);
});

// ── Test Suite: Import/Export ──────────────────────────────────────────

test("exportMapAsset: produces valid JSON string", () => {
  const map = createMapAsset({
    id: "test",
    name: "Test",
    width: 10,
    height: 10,
  });

  const json = exportMapAsset(map);
  assert.ok(typeof json === "string");
  
  const parsed = JSON.parse(json);
  assert.equal(parsed.meta.id, "test");
  assert.equal(parsed.meta.name, "Test");
});

test("importMapAsset: accepts valid JSON", () => {
  const map = createMapAsset({
    id: "test",
    name: "Test",
    width: 10,
    height: 10,
  });

  const json = exportMapAsset(map);
  const result = importMapAsset(json);

  assert.equal(result.ok, true);
  assert.ok(result.mapAsset);
  assert.equal(result.mapAsset.meta.id, "test");
});

test("importMapAsset: rejects invalid JSON", () => {
  const result = importMapAsset("not valid json");
  assert.equal(result.ok, false);
  assert.ok(result.errors.length > 0);
});

test("importMapAsset: rejects malformed map", () => {
  const badMap = { meta: {}, terrain: "not an array" };
  const json = JSON.stringify(badMap);
  const result = importMapAsset(json);

  assert.equal(result.ok, false);
  assert.ok(result.errors.length > 0);
});

test("export/import roundtrip: preserves data", () => {
  let map = createMapAsset({
    id: "roundtrip",
    name: "Roundtrip Test",
    width: 15,
    height: 12,
  });

  map = setTerrainTile(map, 3, 3, "water", true, false);
  map = setTerrainTile(map, 7, 8, "lava", true, true);

  const json = exportMapAsset(map);
  const result = importMapAsset(json);

  assert.equal(result.ok, true);
  assert.equal(result.mapAsset.meta.id, "roundtrip");
  assert.equal(result.mapAsset.grid.size.width, 15);
  assert.equal(result.mapAsset.grid.size.height, 12);
  assert.equal(result.mapAsset.terrain.length, 2);
});

// ── Test Suite: Conversion to State Map ────────────────────────────────

test("mapAssetToStateMap: produces valid state map format", () => {
  const map = createMapAsset({
    id: "convert-test",
    name: "Convert Test",
    width: 5,
    height: 5,
  });

  const stateMap = mapAssetToStateMap(map);

  assert.equal(stateMap.id, "convert-test");
  assert.equal(stateMap.name, "Convert Test");
  assert.equal(stateMap.width, 5);
  assert.equal(stateMap.height, 5);
  assert.ok(Array.isArray(stateMap.cells));
  assert.equal(stateMap.cells.length, 25); // 5x5 grid
});

test("mapAssetToStateMap: applies terrain modifications", () => {
  let map = createMapAsset({
    id: "terrain-test",
    name: "Terrain Test",
    width: 5,
    height: 5,
  });

  map = setTerrainTile(map, 2, 2, "blocked", true, true);
  map = setTerrainTile(map, 3, 3, "water", false, false);

  const stateMap = mapAssetToStateMap(map);

  // Find the blocked cell
  const blockedCell = stateMap.cells.find(c => c.x === 2 && c.y === 2);
  assert.ok(blockedCell);
  assert.equal(blockedCell.passable, false);
  assert.equal(blockedCell.opaque, true);

  // Find the water cell
  const waterCell = stateMap.cells.find(c => c.x === 3 && c.y === 3);
  assert.ok(waterCell);
  assert.equal(waterCell.passable, true);
  assert.equal(waterCell.opaque, false);
});

test("mapAssetToStateMap: defaults all cells to passable", () => {
  const map = createMapAsset({
    id: "default-test",
    name: "Default Test",
    width: 5,
    height: 5,
  });

  const stateMap = mapAssetToStateMap(map);

  // All cells should be passable and transparent by default
  const allPassable = stateMap.cells.every(c => c.passable === true && c.opaque === false);
  assert.ok(allPassable);
});

console.log("✓ All map editor tests passed");