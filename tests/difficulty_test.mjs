/**
 * difficulty_test.mjs — MIR Tier 5.3 AI Difficulty Preset Tests.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DIFFICULTY_PRESETS,
  getDifficulty,
  listDifficulties,
  applyDifficultyToEntities,
  selectTarget,
  shouldAttack,
  shouldUseAbility,
  getAttackDifficultyModifier,
  getDamageDifficultyModifier,
  getAcDifficultyModifier,
} from "../src/engine/difficulty.mjs";

// ── Helpers ─────────────────────────────────────────────────────────────

function makeEntities() {
  return {
    players: [
      { id: "pc-1", kind: "player", stats: { hpCurrent: 20, hpMax: 20, ac: 15, movementSpeed: 6 }, conditions: [] },
    ],
    npcs: [
      { id: "npc-1", kind: "npc", stats: { hpCurrent: 10, hpMax: 10, ac: 12, movementSpeed: 6 }, conditions: [] },
      { id: "npc-2", kind: "npc", stats: { hpCurrent: 15, hpMax: 15, ac: 13, movementSpeed: 6 }, conditions: [] },
    ],
    objects: [],
  };
}

function makeHostiles() {
  return [
    { id: "pc-1", stats: { hpCurrent: 20, hpMax: 20 }, conditions: [] },
    { id: "pc-2", stats: { hpCurrent: 5, hpMax: 20 }, conditions: [] },
    { id: "pc-3", stats: { hpCurrent: 12, hpMax: 20 }, conditions: [] },
  ];
}

// ── Presets ──────────────────────────────────────────────────────────────

describe("difficulty — presets", () => {
  it("has 4 difficulty levels", () => {
    assert.equal(Object.keys(DIFFICULTY_PRESETS).length, 4);
    assert.ok(DIFFICULTY_PRESETS.easy);
    assert.ok(DIFFICULTY_PRESETS.normal);
    assert.ok(DIFFICULTY_PRESETS.hard);
    assert.ok(DIFFICULTY_PRESETS.deadly);
  });

  it("each preset has required fields", () => {
    for (const [key, p] of Object.entries(DIFFICULTY_PRESETS)) {
      assert.equal(p.id, key, `${key} id matches key`);
      assert.ok(p.label, `${key} has label`);
      assert.ok(p.description, `${key} has description`);
      assert.equal(typeof p.attackProbability, "number");
      assert.equal(typeof p.abilityUseProbability, "number");
      assert.ok(["random", "weakest", "lowest_hp"].includes(p.targetSelection), `${key} valid target selection`);
      assert.equal(typeof p.attackModifier, "number");
      assert.equal(typeof p.damageModifier, "number");
      assert.equal(typeof p.hpMultiplier, "number");
    }
  });

  it("normal is baseline (all modifiers 0, multiplier 1)", () => {
    const n = DIFFICULTY_PRESETS.normal;
    assert.equal(n.attackModifier, 0);
    assert.equal(n.damageModifier, 0);
    assert.equal(n.acModifier, 0);
    assert.equal(n.hpMultiplier, 1.0);
  });

  it("easy has negative attack modifier", () => {
    assert.ok(DIFFICULTY_PRESETS.easy.attackModifier < 0);
  });

  it("deadly has highest modifiers", () => {
    const d = DIFFICULTY_PRESETS.deadly;
    assert.ok(d.attackModifier >= 2);
    assert.ok(d.damageModifier >= 2);
    assert.ok(d.hpMultiplier >= 1.5);
  });
});

// ── getDifficulty ───────────────────────────────────────────────────────

describe("difficulty — getDifficulty", () => {
  it("returns normal by default", () => {
    const d = getDifficulty({});
    assert.equal(d.id, "normal");
  });

  it("returns preset matching state.difficulty", () => {
    assert.equal(getDifficulty({ difficulty: "easy" }).id, "easy");
    assert.equal(getDifficulty({ difficulty: "hard" }).id, "hard");
    assert.equal(getDifficulty({ difficulty: "deadly" }).id, "deadly");
  });

  it("returns normal for invalid difficulty", () => {
    assert.equal(getDifficulty({ difficulty: "impossible" }).id, "normal");
  });

  it("returns normal for null state", () => {
    assert.equal(getDifficulty(null).id, "normal");
  });
});

// ── listDifficulties ────────────────────────────────────────────────────

describe("difficulty — listDifficulties", () => {
  it("returns 4 items with id, label, description", () => {
    const list = listDifficulties();
    assert.equal(list.length, 4);
    for (const item of list) {
      assert.ok(item.id);
      assert.ok(item.label);
      assert.ok(item.description);
    }
  });
});

// ── applyDifficultyToEntities ───────────────────────────────────────────

describe("difficulty — applyDifficultyToEntities", () => {
  it("normal returns entities unchanged", () => {
    const ents = makeEntities();
    const result = applyDifficultyToEntities(ents, "normal");
    assert.equal(result, ents, "same reference for multiplier 1.0");
  });

  it("easy reduces NPC HP", () => {
    const ents = makeEntities();
    const result = applyDifficultyToEntities(ents, "easy");
    assert.ok(result.npcs[0].stats.hpMax < 10, "HP max reduced");
    assert.ok(result.npcs[0].stats.hpCurrent <= result.npcs[0].stats.hpMax, "current <= max");
  });

  it("hard increases NPC HP", () => {
    const ents = makeEntities();
    const result = applyDifficultyToEntities(ents, "hard");
    assert.ok(result.npcs[0].stats.hpMax > 10, "HP max increased");
  });

  it("deadly increases NPC HP by 50%", () => {
    const ents = makeEntities();
    const result = applyDifficultyToEntities(ents, "deadly");
    assert.equal(result.npcs[0].stats.hpMax, 15, "10 × 1.5 = 15");
  });

  it("does not mutate original entities", () => {
    const ents = makeEntities();
    applyDifficultyToEntities(ents, "deadly");
    assert.equal(ents.npcs[0].stats.hpMax, 10, "original unchanged");
  });

  it("does not modify player entities", () => {
    const ents = makeEntities();
    const result = applyDifficultyToEntities(ents, "deadly");
    assert.equal(result.players[0].stats.hpMax, 20, "player HP unchanged");
  });

  it("HP min is 1", () => {
    const ents = { ...makeEntities(), npcs: [{ id: "weak", kind: "npc", stats: { hpCurrent: 1, hpMax: 1, ac: 10, movementSpeed: 6 }, conditions: [] }] };
    const result = applyDifficultyToEntities(ents, "easy");
    assert.ok(result.npcs[0].stats.hpMax >= 1);
    assert.ok(result.npcs[0].stats.hpCurrent >= 1);
  });
});

// ── selectTarget ────────────────────────────────────────────────────────

describe("difficulty — selectTarget", () => {
  it("returns null for empty hostiles", () => {
    assert.equal(selectTarget([], DIFFICULTY_PRESETS.normal), null);
    assert.equal(selectTarget(null, DIFFICULTY_PRESETS.normal), null);
  });

  it("skips dead hostiles", () => {
    const hostiles = [{ id: "pc-1", stats: { hpCurrent: 0 }, conditions: ["dead"] }];
    assert.equal(selectTarget(hostiles, DIFFICULTY_PRESETS.normal), null);
  });

  it("'weakest' picks lowest HP", () => {
    const hostiles = makeHostiles();
    const target = selectTarget(hostiles, DIFFICULTY_PRESETS.normal);
    assert.equal(target.id, "pc-2", "pc-2 has 5 HP — lowest");
  });

  it("'random' with deterministic RNG picks correctly", () => {
    const hostiles = makeHostiles();
    // RNG always returns 0 → picks index 0
    const target = selectTarget(hostiles, DIFFICULTY_PRESETS.easy, () => 0);
    assert.equal(target.id, "pc-1");
  });

  it("'random' with high RNG picks last", () => {
    const hostiles = makeHostiles();
    const target = selectTarget(hostiles, DIFFICULTY_PRESETS.easy, () => 0.99);
    assert.equal(target.id, "pc-3");
  });

  it("'lowest_hp' focus fires on lowest", () => {
    const hostiles = makeHostiles();
    const target = selectTarget(hostiles, DIFFICULTY_PRESETS.deadly);
    assert.equal(target.id, "pc-2", "deadly focuses on weakest (5 HP)");
  });
});

// ── shouldAttack ────────────────────────────────────────────────────────

describe("difficulty — shouldAttack", () => {
  it("normal always attacks (probability 1.0)", () => {
    assert.ok(shouldAttack(DIFFICULTY_PRESETS.normal, () => 0.99));
  });

  it("easy skips attack 40% of the time", () => {
    // RNG = 0.7 > 0.6 → skip
    assert.ok(!shouldAttack(DIFFICULTY_PRESETS.easy, () => 0.7));
    // RNG = 0.5 < 0.6 → attack
    assert.ok(shouldAttack(DIFFICULTY_PRESETS.easy, () => 0.5));
  });
});

// ── shouldUseAbility ────────────────────────────────────────────────────

describe("difficulty — shouldUseAbility", () => {
  it("deadly always uses abilities (probability 1.0)", () => {
    assert.ok(shouldUseAbility(DIFFICULTY_PRESETS.deadly, () => 0.99));
  });

  it("easy rarely uses abilities (probability 0.2)", () => {
    assert.ok(!shouldUseAbility(DIFFICULTY_PRESETS.easy, () => 0.3));
    assert.ok(shouldUseAbility(DIFFICULTY_PRESETS.easy, () => 0.1));
  });
});

// ── Modifier getters ────────────────────────────────────────────────────

describe("difficulty — modifier getters", () => {
  it("getAttackDifficultyModifier returns correct values", () => {
    assert.equal(getAttackDifficultyModifier(DIFFICULTY_PRESETS.easy), -1);
    assert.equal(getAttackDifficultyModifier(DIFFICULTY_PRESETS.normal), 0);
    assert.equal(getAttackDifficultyModifier(DIFFICULTY_PRESETS.hard), 1);
    assert.equal(getAttackDifficultyModifier(DIFFICULTY_PRESETS.deadly), 2);
  });

  it("getDamageDifficultyModifier returns correct values", () => {
    assert.equal(getDamageDifficultyModifier(DIFFICULTY_PRESETS.easy), 0);
    assert.equal(getDamageDifficultyModifier(DIFFICULTY_PRESETS.normal), 0);
    assert.equal(getDamageDifficultyModifier(DIFFICULTY_PRESETS.hard), 1);
    assert.equal(getDamageDifficultyModifier(DIFFICULTY_PRESETS.deadly), 2);
  });

  it("getAcDifficultyModifier returns correct values", () => {
    assert.equal(getAcDifficultyModifier(DIFFICULTY_PRESETS.easy), 0);
    assert.equal(getAcDifficultyModifier(DIFFICULTY_PRESETS.normal), 0);
    assert.equal(getAcDifficultyModifier(DIFFICULTY_PRESETS.hard), 1);
    assert.equal(getAcDifficultyModifier(DIFFICULTY_PRESETS.deadly), 2);
  });

  it("returns 0 for null preset", () => {
    assert.equal(getAttackDifficultyModifier(null), 0);
    assert.equal(getDamageDifficultyModifier(null), 0);
    assert.equal(getAcDifficultyModifier(null), 0);
  });
});
