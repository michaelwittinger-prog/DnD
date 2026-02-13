/**
 * encounter_generator_test.mjs — Tests for Tier 5.4 Encounter Generation.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CR_XP, DIFFICULTY_XP_BUDGET, GROUP_TEMPLATES,
  calculateXpBudget, selectGroupTemplate, fillEncounterSlots,
  placeEntities, generateEncounter, estimateDifficulty,
} from "../src/content/encounterGenerator.mjs";

function seededRng(seed = 0.5) {
  let s = seed;
  return () => { s = (s * 16807 + 0.5) % 1; return s; };
}

// ── Constants ───────────────────────────────────────────────────────────

describe("CR_XP", () => {
  it("defines XP for all CR tiers", () => {
    assert.equal(CR_XP.minion, 25);
    assert.equal(CR_XP.standard, 100);
    assert.equal(CR_XP.elite, 450);
    assert.equal(CR_XP.boss, 1100);
  });
});

describe("DIFFICULTY_XP_BUDGET", () => {
  it("defines per-player XP for all difficulties", () => {
    assert.ok(DIFFICULTY_XP_BUDGET.easy < DIFFICULTY_XP_BUDGET.normal);
    assert.ok(DIFFICULTY_XP_BUDGET.normal < DIFFICULTY_XP_BUDGET.hard);
    assert.ok(DIFFICULTY_XP_BUDGET.hard < DIFFICULTY_XP_BUDGET.deadly);
  });
});

describe("GROUP_TEMPLATES", () => {
  it("has 4 templates", () => {
    assert.equal(GROUP_TEMPLATES.length, 4);
  });
  it("each template has name and weights", () => {
    for (const t of GROUP_TEMPLATES) {
      assert.ok(t.name);
      assert.ok(t.weights);
      assert.equal(typeof t.weights.minion, "number");
    }
  });
  it("weights sum to ~1.0", () => {
    for (const t of GROUP_TEMPLATES) {
      const sum = Object.values(t.weights).reduce((a, b) => a + b, 0);
      assert.ok(Math.abs(sum - 1.0) < 0.01, `${t.name} weights sum to ${sum}`);
    }
  });
});

// ── calculateXpBudget ───────────────────────────────────────────────────

describe("calculateXpBudget", () => {
  it("scales with party size", () => {
    const b1 = calculateXpBudget(1, "normal");
    const b4 = calculateXpBudget(4, "normal");
    assert.equal(b4, b1 * 4);
  });

  it("scales with difficulty", () => {
    const easy = calculateXpBudget(4, "easy");
    const deadly = calculateXpBudget(4, "deadly");
    assert.ok(deadly > easy);
  });

  it("clamps party size to 1–6", () => {
    assert.equal(calculateXpBudget(0, "normal"), calculateXpBudget(1, "normal"));
    assert.equal(calculateXpBudget(10, "normal"), calculateXpBudget(6, "normal"));
  });

  it("defaults to normal for unknown difficulty", () => {
    assert.equal(calculateXpBudget(4, "impossible"), calculateXpBudget(4, "normal"));
  });
});

// ── selectGroupTemplate ─────────────────────────────────────────────────

describe("selectGroupTemplate", () => {
  it("easy → swarm", () => {
    assert.equal(selectGroupTemplate("easy").name, "swarm");
  });

  it("deadly → boss_fight", () => {
    assert.equal(selectGroupTemplate("deadly").name, "boss_fight");
  });

  it("normal → balanced", () => {
    assert.equal(selectGroupTemplate("normal", () => 0.3).name, "balanced");
  });

  it("hard with high rng → elite_guard", () => {
    assert.equal(selectGroupTemplate("hard", () => 0.8).name, "elite_guard");
  });

  it("hard with low rng → balanced", () => {
    assert.equal(selectGroupTemplate("hard", () => 0.2).name, "balanced");
  });
});

// ── fillEncounterSlots ──────────────────────────────────────────────────

describe("fillEncounterSlots", () => {
  it("fills within budget", () => {
    const budget = 400;
    const template = GROUP_TEMPLATES[1]; // balanced
    const slots = fillEncounterSlots(budget, template, { rng: seededRng() });
    const totalXp = slots.reduce((s, e) => s + e.xp, 0);
    assert.ok(totalXp <= budget, `Spent ${totalXp} > budget ${budget}`);
    assert.ok(slots.length > 0, "Should have at least one monster");
  });

  it("respects maxMonsters cap", () => {
    const slots = fillEncounterSlots(1000, GROUP_TEMPLATES[0], { rng: seededRng(), maxMonsters: 3 });
    assert.ok(slots.length <= 3);
  });

  it("returns empty for zero budget", () => {
    assert.equal(fillEncounterSlots(0, GROUP_TEMPLATES[0], { rng: seededRng() }).length, 0);
  });

  it("fills minions for leftover budget", () => {
    const slots = fillEncounterSlots(200, GROUP_TEMPLATES[0], { rng: seededRng() }); // swarm
    const minions = slots.filter(s => s.cr === "minion");
    assert.ok(minions.length > 0, "Swarm should have minions");
  });

  it("each slot has templateId, cr, xp", () => {
    const slots = fillEncounterSlots(400, GROUP_TEMPLATES[1], { rng: seededRng() });
    for (const s of slots) {
      assert.ok(s.templateId);
      assert.ok(s.cr);
      assert.ok(typeof s.xp === "number");
    }
  });
});

// ── placeEntities ───────────────────────────────────────────────────────

describe("placeEntities", () => {
  const entities = [
    { id: "a", name: "A" },
    { id: "b", name: "B" },
    { id: "c", name: "C" },
  ];

  it("places all entities with unique positions (spread)", () => {
    const placed = placeEntities([...entities.map(e => ({...e}))], { width: 10, height: 10 }, { rng: seededRng(), placement: "spread" });
    assert.equal(placed.length, 3);
    const positions = placed.map(e => `${e.position.x},${e.position.y}`);
    assert.equal(new Set(positions).size, 3, "All positions unique");
  });

  it("places with clustered placement", () => {
    const placed = placeEntities([...entities.map(e => ({...e}))], { width: 10, height: 10 }, { rng: seededRng(), placement: "clustered" });
    assert.equal(placed.length, 3);
    for (const e of placed) {
      assert.ok(e.position.x >= 0 && e.position.x < 10);
      assert.ok(e.position.y >= 0 && e.position.y < 10);
    }
  });

  it("places with flanking placement", () => {
    const placed = placeEntities([...entities.map(e => ({...e}))], { width: 10, height: 10 }, { rng: seededRng(), placement: "flanking" });
    assert.equal(placed.length, 3);
  });

  it("avoids occupied cells", () => {
    const occupied = [{ x: 5, y: 5 }, { x: 6, y: 5 }];
    const placed = placeEntities([{ id: "x", name: "X" }], { width: 10, height: 10 }, { rng: seededRng(), occupied });
    assert.notDeepEqual(placed[0].position, { x: 5, y: 5 });
    assert.notDeepEqual(placed[0].position, { x: 6, y: 5 });
  });

  it("positions are within grid bounds", () => {
    const placed = placeEntities(
      Array.from({ length: 6 }, (_, i) => ({ id: `e${i}`, name: `E${i}` })),
      { width: 5, height: 5 },
      { rng: seededRng() },
    );
    for (const e of placed) {
      assert.ok(e.position.x >= 0 && e.position.x < 5);
      assert.ok(e.position.y >= 0 && e.position.y < 5);
    }
  });
});

// ── generateEncounter ───────────────────────────────────────────────────

describe("generateEncounter", () => {
  it("generates entities for a normal encounter", () => {
    const result = generateEncounter({ partySize: 4, difficulty: "normal", rng: seededRng() });
    assert.ok(result.entities.length > 0, "Should have monsters");
    assert.ok(result.budget > 0);
    assert.ok(result.template);
    assert.ok(result.slots.length > 0);
  });

  it("generates more monsters for larger parties", () => {
    const small = generateEncounter({ partySize: 1, difficulty: "normal", rng: seededRng(0.3) });
    const large = generateEncounter({ partySize: 6, difficulty: "normal", rng: seededRng(0.3) });
    assert.ok(large.entities.length >= small.entities.length);
  });

  it("all entities have positions", () => {
    const result = generateEncounter({ partySize: 4, difficulty: "hard", rng: seededRng() });
    for (const e of result.entities) {
      assert.ok(e.position, `Entity ${e.id} missing position`);
      assert.ok(typeof e.position.x === "number");
      assert.ok(typeof e.position.y === "number");
    }
  });

  it("respects player positions (no overlap)", () => {
    const playerPositions = [{ x: 5, y: 5 }, { x: 6, y: 5 }];
    const result = generateEncounter({ partySize: 2, difficulty: "normal", rng: seededRng(), playerPositions });
    for (const e of result.entities) {
      const overlaps = playerPositions.some(p => p.x === e.position.x && p.y === e.position.y);
      assert.ok(!overlaps, `Entity ${e.id} overlaps player at ${e.position.x},${e.position.y}`);
    }
  });

  it("easy encounter has lower XP budget than deadly", () => {
    const easyBudget = calculateXpBudget(4, "easy");
    const deadlyBudget = calculateXpBudget(4, "deadly");
    assert.ok(deadlyBudget > easyBudget, `Deadly budget (${deadlyBudget}) should exceed easy (${easyBudget})`);
  });

  it("entities have stats and name from monster manual", () => {
    const result = generateEncounter({ partySize: 4, difficulty: "normal", rng: seededRng() });
    for (const e of result.entities) {
      assert.ok(e.name, "Entity missing name");
      assert.ok(e.stats, "Entity missing stats");
      assert.ok(e.stats.hpMax > 0, "Entity hpMax should be > 0");
      assert.ok(e.stats.hpCurrent > 0, "Entity hpCurrent should be > 0");
    }
  });
});

// ── estimateDifficulty ──────────────────────────────────────────────────

describe("estimateDifficulty", () => {
  it("low XP is trivial", () => {
    assert.equal(estimateDifficulty(10, 4), "trivial");
  });

  it("matches easy threshold", () => {
    const budget = DIFFICULTY_XP_BUDGET.easy * 4;
    assert.equal(estimateDifficulty(budget, 4), "easy");
  });

  it("matches normal threshold", () => {
    const budget = DIFFICULTY_XP_BUDGET.normal * 4;
    assert.equal(estimateDifficulty(budget, 4), "normal");
  });

  it("matches hard threshold", () => {
    const budget = DIFFICULTY_XP_BUDGET.hard * 4;
    assert.equal(estimateDifficulty(budget, 4), "hard");
  });

  it("high XP is deadly", () => {
    assert.equal(estimateDifficulty(10000, 4), "deadly");
  });

  it("handles party size 1", () => {
    assert.equal(estimateDifficulty(DIFFICULTY_XP_BUDGET.normal, 1), "normal");
  });
});
