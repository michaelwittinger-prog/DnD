/**
 * visibility_test.mjs — MIR S1.5 Fog of War / Visibility Tests.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeVisibleCells, isCellVisible, getVisionRange } from "../src/engine/visibility.mjs";

// ── Helpers ─────────────────────────────────────────────────────────────

function makeState({ fogEnabled = true, width = 10, height = 10, terrain = [], players = [], npcs = [] } = {}) {
  return {
    map: {
      grid: { type: "square", size: { width, height }, cellSize: 5 },
      terrain,
      fogOfWarEnabled: fogEnabled,
    },
    entities: {
      players: players.map(p => ({
        id: p.id || "pc-1", kind: "player", name: p.name || "Player",
        position: p.position, size: "M",
        stats: { hpCurrent: 20, hpMax: 20, ac: 15, movementSpeed: 6, ...(p.stats || {}) },
        conditions: p.conditions || [],
        inventory: [], token: { style: "mini", spriteKey: null },
        controller: { type: "human", playerId: p.id || "pc-1" },
      })),
      npcs: npcs.map(n => ({
        id: n.id || "npc-1", kind: "npc", name: n.name || "NPC",
        position: n.position, size: "M",
        stats: { hpCurrent: 10, hpMax: 10, ac: 12, movementSpeed: 6, ...(n.stats || {}) },
        conditions: n.conditions || [],
        inventory: [], token: { style: "mini", spriteKey: null },
        controller: { type: "ai", playerId: null },
      })),
      objects: [],
    },
  };
}

// ── Fog disabled ────────────────────────────────────────────────────────

describe("visibility — fog disabled", () => {
  it("all cells visible when fogOfWarEnabled is false", () => {
    const state = makeState({ fogEnabled: false, width: 5, height: 5 });
    const visible = computeVisibleCells(state, "players");
    assert.equal(visible.size, 25, "5×5 = 25 cells all visible");
  });

  it("isCellVisible returns true for any cell when fog disabled", () => {
    const state = makeState({ fogEnabled: false, width: 5, height: 5 });
    assert.ok(isCellVisible(state, 4, 4, "players"));
    assert.ok(isCellVisible(state, 0, 0, "npcs"));
  });
});

// ── Basic visibility ────────────────────────────────────────────────────

describe("visibility — basic", () => {
  it("entity can see its own cell", () => {
    const state = makeState({
      players: [{ position: { x: 5, y: 5 } }],
    });
    const visible = computeVisibleCells(state, "players");
    assert.ok(visible.has("5,5"), "own cell visible");
  });

  it("entity can see adjacent cells", () => {
    const state = makeState({
      players: [{ position: { x: 5, y: 5 } }],
    });
    const visible = computeVisibleCells(state, "players");
    assert.ok(visible.has("4,4"));
    assert.ok(visible.has("5,4"));
    assert.ok(visible.has("6,6"));
    assert.ok(visible.has("4,5"));
    assert.ok(visible.has("6,5"));
  });

  it("entity cannot see beyond vision range", () => {
    const state = makeState({
      width: 30, height: 30,
      players: [{ position: { x: 5, y: 5 }, stats: { visionRange: 3 } }],
    });
    const visible = computeVisibleCells(state, "players");
    assert.ok(visible.has("5,5"), "own cell");
    assert.ok(visible.has("8,5"), "3 cells right");
    assert.ok(!visible.has("9,5"), "4 cells right — beyond range");
    assert.ok(!visible.has("20,20"), "far away — invisible");
  });

  it("default vision range is 8", () => {
    const ent = { stats: {} };
    assert.equal(getVisionRange(ent), 8);
  });

  it("custom vision range overrides default", () => {
    const ent = { stats: { visionRange: 4 } };
    assert.equal(getVisionRange(ent), 4);
  });
});

// ── Vision blocking ─────────────────────────────────────────────────────

describe("visibility — vision blocking terrain", () => {
  it("wall blocks vision to cells behind it", () => {
    const state = makeState({
      players: [{ position: { x: 2, y: 2 } }],
      terrain: [
        { x: 4, y: 2, type: "blocked", blocksMovement: true, blocksVision: true },
      ],
    });
    const visible = computeVisibleCells(state, "players");
    assert.ok(visible.has("3,2"), "cell before wall is visible");
    assert.ok(!visible.has("5,2"), "cell directly behind wall is hidden");
    assert.ok(!visible.has("6,2"), "cell 2 behind wall is hidden");
  });

  it("non-vision-blocking terrain does not block sight", () => {
    const state = makeState({
      players: [{ position: { x: 2, y: 2 } }],
      terrain: [
        { x: 4, y: 2, type: "difficult", blocksMovement: false, blocksVision: false },
      ],
    });
    const visible = computeVisibleCells(state, "players");
    assert.ok(visible.has("5,2"), "cell past difficult terrain is visible");
  });

  it("pillar (blocksVision:false, blocksMovement:true) does not block sight", () => {
    const state = makeState({
      players: [{ position: { x: 2, y: 2 } }],
      terrain: [
        { x: 4, y: 2, type: "blocked", blocksMovement: true, blocksVision: false },
      ],
    });
    const visible = computeVisibleCells(state, "players");
    assert.ok(visible.has("5,2"), "can see past movement-only blocker");
  });
});

// ── Dead entities ───────────────────────────────────────────────────────

describe("visibility — dead entities", () => {
  it("dead entity does not contribute vision", () => {
    const state = makeState({
      width: 20, height: 20,
      players: [
        { id: "pc-1", position: { x: 5, y: 5 }, conditions: ["dead"], stats: { visionRange: 3 } },
      ],
    });
    const visible = computeVisibleCells(state, "players");
    // Dead entity should not contribute any vision
    assert.equal(visible.size, 0, "no visible cells from dead entity");
  });

  it("living entity still provides vision when teammate is dead", () => {
    const state = makeState({
      players: [
        { id: "pc-1", position: { x: 2, y: 2 }, conditions: ["dead"], stats: { visionRange: 2 } },
        { id: "pc-2", position: { x: 5, y: 5 }, conditions: [], stats: { visionRange: 2 } },
      ],
    });
    const visible = computeVisibleCells(state, "players");
    assert.ok(visible.has("5,5"), "living entity sees own cell");
    assert.ok(visible.has("6,6"), "living entity sees adjacent");
    assert.ok(!visible.has("2,2"), "dead entity's area not auto-visible if out of living range");
  });
});

// ── Faction filtering ───────────────────────────────────────────────────

describe("visibility — faction filtering", () => {
  it("'players' only uses player entities", () => {
    const state = makeState({
      width: 20, height: 20,
      players: [{ id: "pc-1", position: { x: 2, y: 2 }, stats: { visionRange: 2 } }],
      npcs: [{ id: "npc-1", position: { x: 15, y: 15 }, stats: { visionRange: 2 } }],
    });
    const visible = computeVisibleCells(state, "players");
    assert.ok(visible.has("2,2"), "player cell visible");
    assert.ok(!visible.has("15,15"), "NPC cell not visible to players");
  });

  it("'npcs' only uses NPC entities", () => {
    const state = makeState({
      width: 20, height: 20,
      players: [{ id: "pc-1", position: { x: 2, y: 2 }, stats: { visionRange: 2 } }],
      npcs: [{ id: "npc-1", position: { x: 15, y: 15 }, stats: { visionRange: 2 } }],
    });
    const visible = computeVisibleCells(state, "npcs");
    assert.ok(!visible.has("2,2"), "player cell not visible to npcs");
    assert.ok(visible.has("15,15"), "NPC cell visible");
  });

  it("'all' uses both factions", () => {
    const state = makeState({
      width: 20, height: 20,
      players: [{ id: "pc-1", position: { x: 2, y: 2 }, stats: { visionRange: 2 } }],
      npcs: [{ id: "npc-1", position: { x: 15, y: 15 }, stats: { visionRange: 2 } }],
    });
    const visible = computeVisibleCells(state, "all");
    assert.ok(visible.has("2,2"), "player cell visible");
    assert.ok(visible.has("15,15"), "NPC cell visible");
  });
});

// ── Multiple entities combine vision ────────────────────────────────────

describe("visibility — multi-entity vision merge", () => {
  it("two players combine their visible areas", () => {
    const state = makeState({
      width: 20, height: 20,
      players: [
        { id: "pc-1", position: { x: 2, y: 2 }, stats: { visionRange: 3 } },
        { id: "pc-2", position: { x: 15, y: 15 }, stats: { visionRange: 3 } },
      ],
    });
    const visible = computeVisibleCells(state, "players");
    assert.ok(visible.has("2,2"), "first player area");
    assert.ok(visible.has("15,15"), "second player area");
    assert.ok(visible.has("4,4"), "within first player range");
    assert.ok(visible.has("13,13"), "within second player range");
  });
});

// ── Edge cases ──────────────────────────────────────────────────────────

describe("visibility — edge cases", () => {
  it("entity at map corner sees valid cells only", () => {
    const state = makeState({
      width: 5, height: 5,
      players: [{ position: { x: 0, y: 0 }, stats: { visionRange: 3 } }],
    });
    const visible = computeVisibleCells(state, "players");
    assert.ok(visible.has("0,0"));
    assert.ok(visible.has("3,3"));
    // Should not contain out-of-bounds cells
    for (const key of visible) {
      const [x, y] = key.split(",").map(Number);
      assert.ok(x >= 0 && x < 5, `x in bounds: ${x}`);
      assert.ok(y >= 0 && y < 5, `y in bounds: ${y}`);
    }
  });

  it("empty state (no entities) produces no visible cells", () => {
    const state = makeState({ players: [], npcs: [] });
    const visible = computeVisibleCells(state, "players");
    assert.equal(visible.size, 0);
  });
});
