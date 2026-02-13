/**
 * memory_context_test.mjs — Tests for Tier 5.1 AI Memory Context.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildRosterSummary,
  buildRecentEventsSummary,
  summarizeEvent,
  buildCombatSummary,
  extractNarrativeBeats,
  buildMapSummary,
  buildFullContext,
  estimateTokens,
} from "../src/ai/memoryContext.mjs";

// ── Test Fixtures ───────────────────────────────────────────────────────

function makeState(overrides = {}) {
  return {
    entities: {
      players: [
        {
          id: "pc-seren", name: "Seren", position: { x: 2, y: 3 },
          stats: { hpCurrent: 18, hpMax: 20, ac: 14, movementSpeed: 6 },
          conditions: [],
        },
      ],
      npcs: [
        {
          id: "npc-goblin-1", name: "Goblin", position: { x: 5, y: 3 },
          stats: { hpCurrent: 5, hpMax: 7, ac: 13, movementSpeed: 6 },
          conditions: [],
        },
      ],
    },
    combat: { mode: "combat", round: 2, activeEntityId: "pc-seren", initiativeOrder: ["pc-seren", "npc-goblin-1"] },
    map: {
      name: "Test Arena",
      grid: { size: { width: 10, height: 10 } },
      terrain: [],
      fogOfWarEnabled: false,
    },
    log: { events: [] },
    ...overrides,
  };
}

// ── buildRosterSummary ──────────────────────────────────────────────────

describe("buildRosterSummary", () => {
  it("lists players with HP and position", () => {
    const summary = buildRosterSummary(makeState());
    assert.ok(summary.includes("Seren"));
    assert.ok(summary.includes("HP 18/20"));
    assert.ok(summary.includes("(2,3)"));
  });

  it("lists NPCs", () => {
    const summary = buildRosterSummary(makeState());
    assert.ok(summary.includes("Goblin"));
    assert.ok(summary.includes("HP 5/7"));
  });

  it("marks dead entities with skull", () => {
    const state = makeState();
    state.entities.npcs[0].conditions = ["dead"];
    const summary = buildRosterSummary(state);
    assert.ok(summary.includes("DEAD"));
  });

  it("shows non-dead conditions", () => {
    const state = makeState();
    state.entities.players[0].conditions = ["poisoned", "blessed"];
    const summary = buildRosterSummary(state);
    assert.ok(summary.includes("poisoned"));
    assert.ok(summary.includes("blessed"));
  });
});

// ── buildRecentEventsSummary ────────────────────────────────────────────

describe("buildRecentEventsSummary", () => {
  it("returns 'No events yet.' for empty log", () => {
    const result = buildRecentEventsSummary(makeState());
    assert.equal(result, "No events yet.");
  });

  it("respects maxEvents limit", () => {
    const state = makeState();
    state.log.events = Array.from({ length: 20 }, (_, i) => ({
      type: "TURN_ENDED", payload: { entityId: `e${i}`, nextEntityId: `e${i + 1}` },
    }));
    const result = buildRecentEventsSummary(state, 5);
    const lines = result.split("\n");
    assert.equal(lines.length, 5);
  });

  it("formats multiple event types", () => {
    const state = makeState();
    state.log.events = [
      { type: "MOVE_APPLIED", payload: { entityId: "pc-seren", finalPosition: { x: 3, y: 4 } } },
      { type: "ATTACK_RESOLVED", payload: { attackerId: "pc-seren", targetId: "npc-goblin-1", hit: true, damage: 5, rawRoll: 14, attackModifier: 2, attackRoll: 16, effectiveAc: 13, targetHpAfter: 2 } },
    ];
    const result = buildRecentEventsSummary(state);
    assert.ok(result.includes("moved to"));
    assert.ok(result.includes("hit"));
  });
});

// ── summarizeEvent ──────────────────────────────────────────────────────

describe("summarizeEvent", () => {
  it("summarizes MOVE_APPLIED", () => {
    const s = summarizeEvent({ type: "MOVE_APPLIED", payload: { entityId: "pc-seren", finalPosition: { x: 3, y: 4 } } });
    assert.ok(s.includes("pc-seren"));
    assert.ok(s.includes("(3,4)"));
  });

  it("summarizes ATTACK_RESOLVED hit", () => {
    const s = summarizeEvent({
      type: "ATTACK_RESOLVED",
      payload: { attackerId: "pc-seren", targetId: "npc-g1", hit: true, damage: 7, rawRoll: 18, attackModifier: 2, attackRoll: 20, effectiveAc: 13, targetHpAfter: 0 },
    });
    assert.ok(s.includes("hit"));
    assert.ok(s.includes("7"));
  });

  it("summarizes ATTACK_RESOLVED miss", () => {
    const s = summarizeEvent({
      type: "ATTACK_RESOLVED",
      payload: { attackerId: "pc-seren", targetId: "npc-g1", hit: false, rawRoll: 3, attackModifier: 2, attackRoll: 5, effectiveAc: 13 },
    });
    assert.ok(s.includes("missed"));
  });

  it("summarizes INITIATIVE_SET", () => {
    const s = summarizeEvent({ type: "INITIATIVE_SET", payload: { order: ["pc-seren", "npc-g1"] } });
    assert.ok(s.includes("Initiative"));
  });

  it("summarizes TURN_ENDED", () => {
    const s = summarizeEvent({ type: "TURN_ENDED", payload: { entityId: "pc-seren", nextEntityId: "npc-g1" } });
    assert.ok(s.includes("pc-seren"));
    assert.ok(s.includes("npc-g1"));
  });

  it("summarizes ABILITY_USED attack", () => {
    const s = summarizeEvent({
      type: "ABILITY_USED",
      payload: { casterId: "pc-seren", abilityName: "Firebolt", abilityType: "attack", targetId: "npc-g1", hit: true, damage: 8, targetHpAfter: 0 },
    });
    assert.ok(s.includes("Firebolt"));
    assert.ok(s.includes("8"));
  });

  it("summarizes ABILITY_USED heal", () => {
    const s = summarizeEvent({
      type: "ABILITY_USED",
      payload: { casterId: "pc-seren", abilityName: "Healing Word", abilityType: "heal", targetId: "pc-seren", actualHeal: 5, targetHpAfter: 20 },
    });
    assert.ok(s.includes("Healing Word"));
    assert.ok(s.includes("healed"));
  });

  it("summarizes CONDITION_DAMAGE", () => {
    const s = summarizeEvent({ type: "CONDITION_DAMAGE", payload: { entityId: "npc-g1", condition: "burning", damage: 3, hpAfter: 4 } });
    assert.ok(s.includes("burning"));
    assert.ok(s.includes("3"));
  });

  it("summarizes CONDITION_EXPIRED", () => {
    const s = summarizeEvent({ type: "CONDITION_EXPIRED", payload: { entityId: "npc-g1", condition: "stunned" } });
    assert.ok(s.includes("stunned"));
  });

  it("summarizes COMBAT_END", () => {
    const s = summarizeEvent({ type: "COMBAT_END", payload: { result: "players_win" } });
    assert.ok(s.includes("Combat ended"));
  });

  it("summarizes unknown event type with JSON fallback", () => {
    const s = summarizeEvent({ type: "CUSTOM_EVENT", payload: { foo: "bar" } });
    assert.ok(s.includes("CUSTOM_EVENT"));
  });
});

// ── buildCombatSummary ──────────────────────────────────────────────────

describe("buildCombatSummary", () => {
  it("reports not in combat when mode != combat", () => {
    const state = makeState();
    state.combat.mode = "exploration";
    const s = buildCombatSummary(state);
    assert.ok(s.includes("Not in combat"));
  });

  it("shows round, active entity, initiative order", () => {
    const s = buildCombatSummary(makeState());
    assert.ok(s.includes("Round 2"));
    assert.ok(s.includes("pc-seren"));
    assert.ok(s.includes("npc-goblin-1"));
  });

  it("handles missing combat", () => {
    const state = makeState();
    state.combat = null;
    const s = buildCombatSummary(state);
    assert.ok(s.includes("Not in combat"));
  });
});

// ── extractNarrativeBeats ───────────────────────────────────────────────

describe("extractNarrativeBeats", () => {
  it("extracts kill via attack", () => {
    const state = makeState();
    state.log.events = [
      { type: "ATTACK_RESOLVED", payload: { attackerId: "pc-seren", targetId: "npc-g1", hit: true, targetHpAfter: 0 } },
    ];
    const beats = extractNarrativeBeats(state);
    assert.equal(beats.length, 1);
    assert.ok(beats[0].includes("slew"));
  });

  it("extracts kill via ability", () => {
    const state = makeState();
    state.log.events = [
      { type: "ABILITY_USED", payload: { casterId: "pc-seren", targetId: "npc-g1", abilityName: "Firebolt", hit: true, targetHpAfter: 0 } },
    ];
    const beats = extractNarrativeBeats(state);
    assert.ok(beats.some(b => b.includes("killed") && b.includes("Firebolt")));
  });

  it("extracts condition infliction", () => {
    const state = makeState();
    state.log.events = [
      { type: "ABILITY_USED", payload: { casterId: "pc-seren", targetId: "npc-g1", abilityName: "Poison Strike", conditionApplied: "poisoned" } },
    ];
    const beats = extractNarrativeBeats(state);
    assert.ok(beats.some(b => b.includes("poisoned")));
  });

  it("extracts combat start and end", () => {
    const state = makeState();
    state.log.events = [
      { type: "combat_start", payload: {} },
      { type: "COMBAT_END", payload: { result: "npcs_win" } },
    ];
    const beats = extractNarrativeBeats(state);
    assert.ok(beats.some(b => b.includes("Combat began")));
    assert.ok(beats.some(b => b.includes("Combat ended")));
  });

  it("respects maxBeats limit", () => {
    const state = makeState();
    state.log.events = Array.from({ length: 10 }, () => ({
      type: "ATTACK_RESOLVED", payload: { attackerId: "a", targetId: "b", hit: true, targetHpAfter: 0 },
    }));
    const beats = extractNarrativeBeats(state, 3);
    assert.equal(beats.length, 3);
  });
});

// ── buildMapSummary ─────────────────────────────────────────────────────

describe("buildMapSummary", () => {
  it("returns 'No map loaded.' when no map", () => {
    const state = makeState();
    state.map = null;
    assert.equal(buildMapSummary(state), "No map loaded.");
  });

  it("shows map name and size", () => {
    const s = buildMapSummary(makeState());
    assert.ok(s.includes("Test Arena"));
    assert.ok(s.includes("10×10"));
  });

  it("shows blocked terrain, difficult terrain, fog status", () => {
    const state = makeState();
    state.map.terrain = [
      { type: "wall", blocksMovement: true },
      { type: "wall", blocksMovement: true },
      { type: "difficult", blocksMovement: false },
    ];
    state.map.fogOfWarEnabled = true;
    const s = buildMapSummary(state);
    assert.ok(s.includes("Blocked cells: 2"));
    assert.ok(s.includes("Difficult terrain: 1"));
    assert.ok(s.includes("Fog of war: enabled"));
  });
});

// ── buildFullContext ─────────────────────────────────────────────────────

describe("buildFullContext", () => {
  it("produces a combined context string with all sections", () => {
    const state = makeState();
    state.log.events = [
      { type: "ATTACK_RESOLVED", payload: { attackerId: "pc-seren", targetId: "npc-g1", hit: true, targetHpAfter: 0 } },
    ];
    const ctx = buildFullContext(state);
    assert.ok(ctx.includes("Game Context"));
    assert.ok(ctx.includes("Test Arena"));
    assert.ok(ctx.includes("Seren"));
    assert.ok(ctx.includes("Recent Events"));
    assert.ok(ctx.includes("Key Moments"));
  });

  it("respects maxEvents and maxBeats options", () => {
    const state = makeState();
    state.log.events = Array.from({ length: 20 }, (_, i) => ({
      type: "TURN_ENDED", payload: { entityId: `e${i}` },
    }));
    const ctx = buildFullContext(state, { maxEvents: 3, maxBeats: 1 });
    // Should only have 3 recent event lines
    const recentSection = ctx.split("## Recent Events")[1];
    const lines = recentSection.trim().split("\n").filter(l => l.trim().length > 0);
    assert.ok(lines.length <= 5); // 3 events + possible section headers
  });
});

// ── estimateTokens ──────────────────────────────────────────────────────

describe("estimateTokens", () => {
  it("estimates based on ~4 chars per token", () => {
    const tokens = estimateTokens("This is a test string of forty characters.");
    assert.ok(tokens > 0);
    assert.equal(tokens, Math.ceil("This is a test string of forty characters.".length / 4));
  });

  it("returns 0 for empty string", () => {
    assert.equal(estimateTokens(""), 0);
  });
});
