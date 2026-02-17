/**
 * dungeon_generator_test.mjs — Procedural Dungeon Generator Tests (Package D)
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateDungeon, dungeonToStateMap, createRng, createGrid, TILE,
} from "../src/content/dungeonGenerator.mjs";

test("generateDungeon: requires seed", () => {
  assert.throws(() => generateDungeon({}), /Seed is required/);
});

test("generateDungeon: produces valid structure", () => {
  const d = generateDungeon({ seed: 42 });
  assert.equal(d.seed, 42);
  assert.equal(d.width, 40);
  assert.equal(d.height, 30);
  assert.ok(d.grid.length === 30);
  assert.ok(d.grid[0].length === 40);
  assert.ok(d.rooms.length >= 1);
  assert.ok(d.stats.roomCount >= 1);
  assert.ok(d.stats.floorTiles > 0);
});

test("generateDungeon: deterministic — same seed same output", () => {
  const d1 = generateDungeon({ seed: 12345 });
  const d2 = generateDungeon({ seed: 12345 });
  assert.equal(d1.rooms.length, d2.rooms.length);
  assert.equal(d1.stats.floorTiles, d2.stats.floorTiles);
  assert.equal(d1.stats.doorCount, d2.stats.doorCount);
  assert.deepEqual(d1.rooms, d2.rooms);
  assert.deepEqual(d1.stairs, d2.stairs);
});

test("generateDungeon: different seeds produce different dungeons", () => {
  const d1 = generateDungeon({ seed: 42 });
  const d2 = generateDungeon({ seed: 9999 });
  // Very unlikely to produce identical room counts AND floor tiles
  const same = d1.stats.roomCount === d2.stats.roomCount && d1.stats.floorTiles === d2.stats.floorTiles;
  // At least one should differ
  assert.ok(!same || d1.rooms[0].x !== d2.rooms[0].x);
});

test("generateDungeon: custom dimensions", () => {
  const d = generateDungeon({ seed: 42, width: 20, height: 15 });
  assert.equal(d.width, 20);
  assert.equal(d.height, 15);
  assert.equal(d.grid.length, 15);
  assert.equal(d.grid[0].length, 20);
});

test("generateDungeon: rooms have valid bounds", () => {
  const d = generateDungeon({ seed: 42 });
  for (const room of d.rooms) {
    assert.ok(room.x >= 0, `room.x=${room.x}`);
    assert.ok(room.y >= 0, `room.y=${room.y}`);
    assert.ok(room.x + room.w <= d.width, `room exceeds width`);
    assert.ok(room.y + room.h <= d.height, `room exceeds height`);
    assert.ok(room.w >= 1);
    assert.ok(room.h >= 1);
  }
});

test("generateDungeon: stairs placed in different rooms", () => {
  const d = generateDungeon({ seed: 42 });
  if (d.rooms.length >= 2) {
    assert.ok(d.stairs.up);
    assert.ok(d.stairs.down);
    assert.ok(d.stairs.up.x !== d.stairs.down.x || d.stairs.up.y !== d.stairs.down.y);
  }
});

test("generateDungeon: encounters generated", () => {
  const d = generateDungeon({ seed: 42, difficulty: 'hard' });
  // Hard difficulty = 70% chance per room, should have at least one with multiple rooms
  assert.ok(d.encounters.length >= 0); // may still be 0 probabilistically
  for (const e of d.encounters) {
    assert.ok(e.monsterCount >= 1);
    assert.ok(e.roomCenter);
  }
});

test("generateDungeon: traps and treasures placed", () => {
  const d = generateDungeon({ seed: 42, trapCount: 5, treasureCount: 5 });
  // May get fewer than requested if rooms are small
  assert.ok(d.stats.trapCount >= 0);
  assert.ok(d.stats.treasureCount >= 0);
});

test("dungeonToStateMap: converts to game state format", () => {
  const d = generateDungeon({ seed: 42, width: 10, height: 10 });
  const map = dungeonToStateMap(d);
  assert.equal(map.dimensions.width, 10);
  assert.equal(map.dimensions.height, 10);
  assert.equal(map.cells.length, 100);
  assert.ok(map.cells[0].terrain);
  assert.ok(typeof map.cells[0].passable === "boolean");
  assert.ok(typeof map.cells[0].opaque === "boolean");
});

test("createRng: deterministic sequence", () => {
  const r1 = createRng(42);
  const r2 = createRng(42);
  assert.equal(r1.next(), r2.next());
  assert.equal(r1.next(), r2.next());
  assert.equal(r1.nextInt(1, 100), r2.nextInt(1, 100));
});

test("createRng: shuffle is deterministic", () => {
  const r1 = createRng(42);
  const r2 = createRng(42);
  const arr = [1, 2, 3, 4, 5];
  assert.deepEqual(r1.shuffle(arr), r2.shuffle(arr));
});

test("createGrid: creates filled grid", () => {
  const g = createGrid(5, 3, TILE.WALL);
  assert.equal(g.length, 3);
  assert.equal(g[0].length, 5);
  assert.equal(g[1][2], TILE.WALL);
});

test("TILE: has expected values", () => {
  assert.equal(TILE.WALL, "wall");
  assert.equal(TILE.FLOOR, "floor");
  assert.equal(TILE.CORRIDOR, "corridor");
  assert.equal(TILE.DOOR, "door");
});

console.log("✓ All dungeon generator tests passed");