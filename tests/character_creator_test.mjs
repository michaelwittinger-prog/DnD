/**
 * character_creator_test.mjs — Tests for Tier 6.2 Character Creator.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CLASS, CLASS_TEMPLATES, PRESET_CHARACTERS,
  getClassTemplate, listClasses, filterClassesByTag,
  getPreset, listPresets,
  createCharacter, createFromPreset, createParty,
  validateCharacter,
} from "../src/content/characterCreator.mjs";

// ── Constants ───────────────────────────────────────────────────────────

describe("CLASS", () => {
  it("has 5 classes", () => {
    assert.equal(Object.keys(CLASS).length, 5);
  });
  it("values match template keys", () => {
    for (const key of Object.values(CLASS)) {
      assert.ok(CLASS_TEMPLATES[key], `Missing template for ${key}`);
    }
  });
});

describe("CLASS_TEMPLATES", () => {
  it("has 5 templates", () => {
    assert.equal(Object.keys(CLASS_TEMPLATES).length, 5);
  });
  it("each template has required fields", () => {
    for (const [key, t] of Object.entries(CLASS_TEMPLATES)) {
      assert.ok(t.classId, `${key}: missing classId`);
      assert.ok(t.name, `${key}: missing name`);
      assert.ok(t.baseStats, `${key}: missing baseStats`);
      assert.ok(t.baseStats.hpMax > 0, `${key}: hpMax must be > 0`);
      assert.ok(t.baseStats.ac > 0, `${key}: ac must be > 0`);
      assert.ok(Array.isArray(t.abilities), `${key}: abilities must be array`);
      assert.ok(Array.isArray(t.startingEquipment), `${key}: equipment must be array`);
      assert.ok(Array.isArray(t.tags), `${key}: tags must be array`);
    }
  });
});

describe("PRESET_CHARACTERS", () => {
  it("has 5 presets", () => {
    assert.equal(Object.keys(PRESET_CHARACTERS).length, 5);
  });
  it("each preset references a valid class", () => {
    for (const [key, p] of Object.entries(PRESET_CHARACTERS)) {
      assert.ok(CLASS_TEMPLATES[p.classId], `${key}: unknown class ${p.classId}`);
      assert.ok(p.name, `${key}: missing name`);
      assert.ok(p.presetId, `${key}: missing presetId`);
    }
  });
});

// ── Query Functions ─────────────────────────────────────────────────────

describe("getClassTemplate", () => {
  it("returns template for valid class", () => {
    const t = getClassTemplate("fighter");
    assert.equal(t.classId, "fighter");
    assert.equal(t.name, "Fighter");
  });
  it("returns null for unknown class", () => {
    assert.equal(getClassTemplate("bard"), null);
  });
});

describe("listClasses", () => {
  it("returns all 5 classes with summary info", () => {
    const list = listClasses();
    assert.equal(list.length, 5);
    assert.ok(list[0].classId);
    assert.ok(list[0].name);
    assert.ok(list[0].description);
  });
});

describe("filterClassesByTag", () => {
  it("finds martial classes", () => {
    const martial = filterClassesByTag("martial");
    assert.ok(martial.length >= 2);
    assert.ok(martial.every(c => c.tags.includes("martial")));
  });
  it("finds caster classes", () => {
    const casters = filterClassesByTag("caster");
    assert.ok(casters.length >= 2);
  });
  it("returns empty for unknown tag", () => {
    assert.equal(filterClassesByTag("necromancer").length, 0);
  });
});

describe("getPreset", () => {
  it("returns preset for valid ID", () => {
    const p = getPreset("seren");
    assert.equal(p.name, "Seren Ashford");
  });
  it("returns null for unknown preset", () => {
    assert.equal(getPreset("gandalf"), null);
  });
});

describe("listPresets", () => {
  it("returns all 5 presets", () => {
    const list = listPresets();
    assert.equal(list.length, 5);
    assert.ok(list[0].presetId);
    assert.ok(list[0].name);
    assert.ok(list[0].classId);
  });
});

// ── Factory: createCharacter ────────────────────────────────────────────

describe("createCharacter", () => {
  it("creates valid player entity from class", () => {
    const c = createCharacter("fighter", "pc-test", "Test Fighter", { x: 3, y: 4 });
    assert.equal(c.id, "pc-test");
    assert.equal(c.kind, "player");
    assert.equal(c.name, "Test Fighter");
    assert.deepEqual(c.position, { x: 3, y: 4 });
    assert.equal(c.stats.hpMax, 28);
    assert.equal(c.stats.hpCurrent, 28);
    assert.equal(c.stats.ac, 16);
    assert.deepEqual(c.abilities, ["shield_bash"]);
    assert.deepEqual(c.inventory, ["longsword", "chain_mail", "shield"]);
    assert.equal(c.controller.type, "human");
  });

  it("returns null for unknown class", () => {
    assert.equal(createCharacter("bard", "pc-x", "X", { x: 0, y: 0 }), null);
  });

  it("applies stat overrides", () => {
    const c = createCharacter("wizard", "pc-wiz", "Wiz", { x: 0, y: 0 }, {
      stats: { hpMax: 20, ac: 15 },
    });
    assert.equal(c.stats.hpMax, 20);
    assert.equal(c.stats.ac, 15);
    assert.equal(c.stats.hpCurrent, 20);
  });

  it("applies ability overrides", () => {
    const c = createCharacter("fighter", "pc-f", "F", { x: 0, y: 0 }, {
      abilities: ["firebolt", "healing_word"],
    });
    assert.deepEqual(c.abilities, ["firebolt", "healing_word"]);
  });

  it("caps hpCurrent at hpMax", () => {
    const c = createCharacter("fighter", "pc-f", "F", { x: 0, y: 0 }, {
      stats: { hpMax: 10, hpCurrent: 50 },
    });
    assert.equal(c.stats.hpCurrent, 10);
  });
});

// ── Factory: createFromPreset ───────────────────────────────────────────

describe("createFromPreset", () => {
  it("creates Seren from preset", () => {
    const c = createFromPreset("seren", { x: 2, y: 3 });
    assert.equal(c.id, "pc-seren");
    assert.equal(c.name, "Seren Ashford");
    assert.equal(c.kind, "player");
    assert.equal(c.stats.hpMax, 22);
    assert.equal(c.stats.ac, 13);
    assert.deepEqual(c.abilities, ["firebolt"]);
  });

  it("creates Thorin from preset", () => {
    const c = createFromPreset("thorin", { x: 0, y: 0 });
    assert.equal(c.stats.hpMax, 32);
    assert.equal(c.stats.ac, 17);
  });

  it("returns null for unknown preset", () => {
    assert.equal(createFromPreset("unknown", { x: 0, y: 0 }), null);
  });

  it("accepts extra overrides on top of preset", () => {
    const c = createFromPreset("elara", { x: 1, y: 1 }, { stats: { hpMax: 30 } });
    assert.equal(c.stats.hpMax, 30);
  });
});

// ── Factory: createParty ────────────────────────────────────────────────

describe("createParty", () => {
  it("creates multiple characters", () => {
    const party = createParty(
      ["seren", "thorin", "miri"],
      [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }],
    );
    assert.equal(party.length, 3);
    assert.equal(party[0].name, "Seren Ashford");
    assert.equal(party[1].name, "Thorin Ironforge");
    assert.equal(party[2].name, "Miri Thistledown");
  });

  it("skips unknown presets", () => {
    const party = createParty(["seren", "unknown", "thorin"], [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }]);
    assert.equal(party.length, 2);
  });

  it("assigns default positions when not enough provided", () => {
    const party = createParty(["seren", "thorin"], [{ x: 5, y: 5 }]);
    assert.deepEqual(party[0].position, { x: 5, y: 5 });
    assert.deepEqual(party[1].position, { x: 1, y: 0 }); // fallback
  });

  it("all entities have unique IDs", () => {
    const party = createParty(["seren", "thorin", "miri", "elara", "finn"],
      [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }, { x: 3, y: 0 }, { x: 4, y: 0 }]);
    const ids = party.map(p => p.id);
    assert.equal(new Set(ids).size, ids.length);
  });
});

// ── Validation ──────────────────────────────────────────────────────────

describe("validateCharacter", () => {
  it("validates a correct character", () => {
    const c = createCharacter("fighter", "pc-test", "Test", { x: 0, y: 0 });
    const result = validateCharacter(c);
    assert.equal(result.valid, true);
    assert.equal(result.errors.length, 0);
  });

  it("rejects null entity", () => {
    const result = validateCharacter(null);
    assert.equal(result.valid, false);
    assert.ok(result.errors.includes("Entity is null"));
  });

  it("catches missing fields", () => {
    const result = validateCharacter({ kind: "npc" });
    assert.equal(result.valid, false);
    assert.ok(result.errors.length >= 3);
  });

  it("catches wrong kind", () => {
    const c = createCharacter("fighter", "pc-test", "Test", { x: 0, y: 0 });
    c.kind = "npc";
    const result = validateCharacter(c);
    assert.equal(result.valid, false);
    assert.ok(result.errors.some(e => e.includes("Kind")));
  });

  it("catches invalid stats", () => {
    const c = createCharacter("fighter", "pc-test", "Test", { x: 0, y: 0 });
    c.stats.hpMax = -5;
    const result = validateCharacter(c);
    assert.equal(result.valid, false);
  });
});
