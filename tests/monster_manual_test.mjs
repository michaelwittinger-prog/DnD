/**
 * monster_manual_test.mjs — Tests for Tier 6.3 Monster Manual.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CR,
  MONSTER_CATALOGUE,
  getMonster,
  listMonsters,
  filterByCR,
  filterByTag,
  searchMonsters,
  instantiateMonster,
  instantiateGroup,
} from "../src/content/monsterManual.mjs";

// ── CR Constants ────────────────────────────────────────────────────────

describe("CR constants", () => {
  it("exports all 4 CR tiers", () => {
    assert.equal(CR.MINION, "minion");
    assert.equal(CR.STANDARD, "standard");
    assert.equal(CR.ELITE, "elite");
    assert.equal(CR.BOSS, "boss");
  });
});

// ── Catalogue Integrity ─────────────────────────────────────────────────

describe("MONSTER_CATALOGUE integrity", () => {
  const allMonsters = Object.values(MONSTER_CATALOGUE);

  it("contains exactly 14 monsters", () => {
    assert.equal(allMonsters.length, 14);
  });

  it("every monster has required fields", () => {
    for (const m of allMonsters) {
      assert.ok(m.templateId, `Missing templateId on ${JSON.stringify(m)}`);
      assert.ok(m.name, `Missing name on ${m.templateId}`);
      assert.ok(m.cr, `Missing cr on ${m.templateId}`);
      assert.ok(m.stats, `Missing stats on ${m.templateId}`);
      assert.ok(m.size, `Missing size on ${m.templateId}`);
      assert.ok(Array.isArray(m.abilities), `abilities not array on ${m.templateId}`);
      assert.ok(Array.isArray(m.tags), `tags not array on ${m.templateId}`);
      assert.ok(m.description, `Missing description on ${m.templateId}`);
    }
  });

  it("every monster has valid stats", () => {
    for (const m of allMonsters) {
      assert.ok(m.stats.hpMax > 0, `hpMax <= 0 on ${m.templateId}`);
      assert.ok(m.stats.ac >= 0, `ac < 0 on ${m.templateId}`);
      assert.ok(m.stats.movementSpeed > 0, `movementSpeed <= 0 on ${m.templateId}`);
      assert.ok(Array.isArray(m.stats.damageDice), `damageDice not array on ${m.templateId}`);
      assert.equal(m.stats.damageDice.length, 2, `damageDice not [count, sides] on ${m.templateId}`);
    }
  });

  it("every monster has a valid CR tier", () => {
    const validCR = new Set(Object.values(CR));
    for (const m of allMonsters) {
      assert.ok(validCR.has(m.cr), `Invalid CR "${m.cr}" on ${m.templateId}`);
    }
  });

  it("templateId matches catalogue key", () => {
    for (const [key, m] of Object.entries(MONSTER_CATALOGUE)) {
      assert.equal(key, m.templateId, `Key "${key}" != templateId "${m.templateId}"`);
    }
  });
});

// ── getMonster ──────────────────────────────────────────────────────────

describe("getMonster", () => {
  it("returns a valid monster by templateId", () => {
    const goblin = getMonster("goblin");
    assert.ok(goblin);
    assert.equal(goblin.name, "Goblin");
    assert.equal(goblin.cr, CR.MINION);
  });

  it("returns null for unknown templateId", () => {
    assert.equal(getMonster("beholder"), null);
    assert.equal(getMonster(""), null);
  });

  it("can retrieve all 14 monsters", () => {
    const keys = Object.keys(MONSTER_CATALOGUE);
    for (const key of keys) {
      assert.ok(getMonster(key), `getMonster("${key}") returned null`);
    }
  });
});

// ── listMonsters ────────────────────────────────────────────────────────

describe("listMonsters", () => {
  it("returns 14 entries", () => {
    const list = listMonsters();
    assert.equal(list.length, 14);
  });

  it("each entry has templateId, name, cr", () => {
    for (const entry of listMonsters()) {
      assert.ok(entry.templateId);
      assert.ok(entry.name);
      assert.ok(entry.cr);
      // Should NOT have full stats (summary only)
      assert.equal(entry.stats, undefined);
    }
  });
});

// ── filterByCR ──────────────────────────────────────────────────────────

describe("filterByCR", () => {
  it("returns 4 minions", () => {
    assert.equal(filterByCR(CR.MINION).length, 4);
  });

  it("returns 4 standard", () => {
    assert.equal(filterByCR(CR.STANDARD).length, 4);
  });

  it("returns 3 elite", () => {
    assert.equal(filterByCR(CR.ELITE).length, 3);
  });

  it("returns 3 boss", () => {
    assert.equal(filterByCR(CR.BOSS).length, 3);
  });

  it("returns empty for invalid CR", () => {
    assert.equal(filterByCR("legendary").length, 0);
  });
});

// ── filterByTag ─────────────────────────────────────────────────────────

describe("filterByTag", () => {
  it("finds undead monsters (skeleton, zombie, lich)", () => {
    const undead = filterByTag("undead");
    assert.equal(undead.length, 3);
    const ids = undead.map(m => m.templateId).sort();
    assert.deepEqual(ids, ["lich", "skeleton", "zombie"]);
  });

  it("finds beast monsters (rat, wolf)", () => {
    const beasts = filterByTag("beast");
    assert.equal(beasts.length, 2);
  });

  it("returns empty for unknown tag", () => {
    assert.equal(filterByTag("celestial").length, 0);
  });
});

// ── searchMonsters ──────────────────────────────────────────────────────

describe("searchMonsters", () => {
  it("matches by name (case-insensitive)", () => {
    const results = searchMonsters("goblin");
    assert.ok(results.length >= 1);
    assert.equal(results[0].templateId, "goblin");
  });

  it("matches by description", () => {
    const results = searchMonsters("phylactery");
    assert.equal(results.length, 1);
    assert.equal(results[0].templateId, "lich");
  });

  it("returns empty for no match", () => {
    assert.equal(searchMonsters("xyzzy_nomatch").length, 0);
  });
});

// ── instantiateMonster ──────────────────────────────────────────────────

describe("instantiateMonster", () => {
  it("creates a valid entity from template", () => {
    const entity = instantiateMonster("goblin", "npc-g1", { x: 3, y: 4 });
    assert.ok(entity);
    assert.equal(entity.id, "npc-g1");
    assert.equal(entity.kind, "npc");
    assert.equal(entity.name, "Goblin");
    assert.deepEqual(entity.position, { x: 3, y: 4 });
    assert.equal(entity.stats.hpCurrent, 7);
    assert.equal(entity.stats.hpMax, 7);
    assert.equal(entity.stats.ac, 13);
    assert.equal(entity.stats.movementSpeed, 6);
    assert.deepEqual(entity.conditions, []);
    assert.deepEqual(entity.inventory, []);
    assert.equal(entity.controller.type, "ai");
  });

  it("sets HP = hpMax on instantiation", () => {
    const entity = instantiateMonster("troll", "npc-t1", { x: 0, y: 0 });
    assert.equal(entity.stats.hpCurrent, entity.stats.hpMax);
    assert.equal(entity.stats.hpCurrent, 45);
  });

  it("applies stat overrides", () => {
    const entity = instantiateMonster("goblin", "npc-g1", { x: 0, y: 0 }, {
      name: "Goblin Boss",
      stats: { hpMax: 20, hpCurrent: 20 },
    });
    assert.equal(entity.name, "Goblin Boss");
    assert.equal(entity.stats.hpMax, 20);
    assert.equal(entity.stats.hpCurrent, 20);
  });

  it("applies size override", () => {
    const entity = instantiateMonster("goblin", "npc-g1", { x: 0, y: 0 }, { size: "M" });
    assert.equal(entity.size, "M");
  });

  it("returns null for unknown template", () => {
    assert.equal(instantiateMonster("beholder", "npc-b1", { x: 0, y: 0 }), null);
  });
});

// ── instantiateGroup ────────────────────────────────────────────────────

describe("instantiateGroup", () => {
  it("creates the requested number of entities", () => {
    const group = instantiateGroup("goblin", 3, [
      { x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 },
    ]);
    assert.equal(group.length, 3);
  });

  it("numbers names when count > 1", () => {
    const group = instantiateGroup("skeleton", 2, [{ x: 0, y: 0 }, { x: 1, y: 0 }]);
    assert.equal(group[0].name, "Skeleton 1");
    assert.equal(group[1].name, "Skeleton 2");
  });

  it("maps positions correctly", () => {
    const group = instantiateGroup("rat", 2, [{ x: 5, y: 3 }, { x: 6, y: 3 }]);
    assert.deepEqual(group[0].position, { x: 5, y: 3 });
    assert.deepEqual(group[1].position, { x: 6, y: 3 });
  });

  it("uses custom idPrefix", () => {
    const group = instantiateGroup("wolf", 2, [{ x: 0, y: 0 }, { x: 1, y: 0 }], "pack");
    assert.equal(group[0].id, "npc-pack-1");
    assert.equal(group[1].id, "npc-pack-2");
  });

  it("defaults missing positions to (0,0)", () => {
    const group = instantiateGroup("goblin", 2, [{ x: 1, y: 1 }]);
    assert.deepEqual(group[0].position, { x: 1, y: 1 });
    assert.deepEqual(group[1].position, { x: 0, y: 0 });
  });
});
