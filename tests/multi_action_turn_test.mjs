/**
 * multi_action_turn_test.mjs — Tests for Tier 5.2 Multi-Action Turn Planner.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ACTION_BUDGET, ABILITY_SLOTS, getAbilitySlot,
  planMultiActionTurn, summarizePlan, isPlanWithinBudget,
} from "../src/engine/multiActionTurn.mjs";

// ── Test State Factory ──────────────────────────────────────────────────

function makeState(overrides = {}) {
  return {
    map: {
      grid: { size: { width: 10, height: 10 } },
      width: 10, height: 10,
      terrain: Array.from({ length: 100 }, () => ({ type: "floor", blocked: false })),
    },
    entities: {
      players: overrides.players ?? [
        { id: "pc-seren", name: "Seren", faction: "players", position: { x: 1, y: 1 }, conditions: [], stats: { hp: 20, maxHp: 20, ac: 13, attackBonus: 3, damage: "1d6" }, abilities: [] },
      ],
      npcs: overrides.npcs ?? [
        { id: "npc-g1", name: "Goblin", faction: "npcs", position: { x: 3, y: 1 }, conditions: [], stats: { hp: 10, maxHp: 10, ac: 11, attackBonus: 2, damage: "1d4" }, abilities: [], speed: 6 },
      ],
    },
    combat: { mode: "combat", round: 1, initiativeOrder: [], activeEntityId: "npc-g1" },
    ...overrides,
  };
}

function seededRng(seed = 0.5) {
  return () => seed;
}

// ── Constants ───────────────────────────────────────────────────────────

describe("ACTION_BUDGET", () => {
  it("has movement, action, bonusAction", () => {
    assert.equal(ACTION_BUDGET.movement, 1);
    assert.equal(ACTION_BUDGET.action, 1);
    assert.equal(ACTION_BUDGET.bonusAction, 1);
  });
});

describe("ABILITY_SLOTS", () => {
  it("classifies known abilities", () => {
    assert.equal(ABILITY_SLOTS.firebolt, "action");
    assert.equal(ABILITY_SLOTS.healing_word, "bonus");
    assert.equal(ABILITY_SLOTS.shield_bash, "action");
  });
});

describe("getAbilitySlot", () => {
  it("returns slot for known ability", () => {
    assert.equal(getAbilitySlot("firebolt"), "action");
    assert.equal(getAbilitySlot("healing_word"), "bonus");
  });
  it("returns null for unknown ability", () => {
    assert.equal(getAbilitySlot("unknown_spell"), null);
  });
});

// ── planMultiActionTurn ─────────────────────────────────────────────────

describe("planMultiActionTurn — basic", () => {
  it("returns END_TURN for missing NPC", () => {
    const state = makeState();
    const plan = planMultiActionTurn(state, "npc-ghost");
    assert.equal(plan.actions.length, 1);
    assert.equal(plan.actions[0].type, "END_TURN");
    assert.match(plan.reasoning, /not found/);
  });

  it("returns END_TURN for dead NPC", () => {
    const state = makeState({
      npcs: [{ id: "npc-g1", name: "Goblin", faction: "npcs", position: { x: 3, y: 1 }, conditions: ["dead"], stats: { hp: 0 }, abilities: [] }],
    });
    const plan = planMultiActionTurn(state, "npc-g1");
    assert.equal(plan.actions.length, 1);
    assert.match(plan.reasoning, /dead/);
  });

  it("returns END_TURN for stunned NPC", () => {
    const state = makeState({
      npcs: [{ id: "npc-g1", name: "Goblin", faction: "npcs", position: { x: 3, y: 1 }, conditions: ["stunned"], stats: { hp: 10 }, abilities: [] }],
    });
    const plan = planMultiActionTurn(state, "npc-g1");
    assert.match(plan.reasoning, /stunned/);
  });

  it("returns END_TURN when no hostiles", () => {
    const state = makeState({ players: [] });
    const plan = planMultiActionTurn(state, "npc-g1");
    assert.match(plan.reasoning, /No hostile/);
  });
});

describe("planMultiActionTurn — movement + attack", () => {
  it("moves toward and attacks adjacent hostile", () => {
    // NPC at 5,1, player at 1,1 — should move then attack
    const state = makeState({
      npcs: [{ id: "npc-g1", name: "Goblin", faction: "npcs", position: { x: 5, y: 1 }, conditions: [], stats: { hp: 10, maxHp: 10, ac: 11, attackBonus: 2, damage: "1d4" }, abilities: [], speed: 6 }],
    });
    const plan = planMultiActionTurn(state, "npc-g1", { rng: seededRng() });
    const types = plan.actions.map(a => a.type);
    assert.ok(types.includes("MOVE"), "Should include MOVE");
    assert.ok(types.includes("ATTACK") || types.includes("USE_ABILITY"), "Should include attack action");
    assert.equal(types[types.length - 1], "END_TURN");
  });

  it("attacks immediately if already adjacent", () => {
    // NPC at 2,1, player at 1,1 — already adjacent
    const state = makeState({
      npcs: [{ id: "npc-g1", name: "Goblin", faction: "npcs", position: { x: 2, y: 1 }, conditions: [], stats: { hp: 10, maxHp: 10, ac: 11, attackBonus: 2, damage: "1d4" }, abilities: [], speed: 6 }],
    });
    const plan = planMultiActionTurn(state, "npc-g1", { rng: seededRng() });
    const types = plan.actions.map(a => a.type);
    assert.ok(!types.includes("MOVE"), "Should not move when adjacent");
    assert.ok(types.includes("ATTACK") || types.includes("USE_ABILITY"));
  });
});

describe("planMultiActionTurn — ranged abilities", () => {
  it("uses ranged ability when not adjacent and in range", () => {
    const state = makeState({
      npcs: [{
        id: "npc-g1", name: "Goblin Mage", faction: "npcs",
        position: { x: 5, y: 1 }, conditions: [],
        stats: { hp: 10, maxHp: 10, ac: 11, attackBonus: 2, damage: "1d4" },
        abilities: [{ name: "firebolt", range: 6, cooldownRemaining: 0, targeting: "enemy" }],
        speed: 6,
      }],
    });
    const plan = planMultiActionTurn(state, "npc-g1", { rng: seededRng(0.1) });
    const abilityAction = plan.actions.find(a => a.type === "USE_ABILITY");
    assert.ok(abilityAction, "Should use ranged ability");
    assert.equal(abilityAction.abilityName, "firebolt");
  });

  it("skips ranged ability on cooldown", () => {
    const state = makeState({
      npcs: [{
        id: "npc-g1", name: "Goblin Mage", faction: "npcs",
        position: { x: 5, y: 1 }, conditions: [],
        stats: { hp: 10, maxHp: 10, ac: 11, attackBonus: 2, damage: "1d4" },
        abilities: [{ name: "firebolt", range: 6, cooldownRemaining: 2, targeting: "enemy" }],
        speed: 6,
      }],
    });
    const plan = planMultiActionTurn(state, "npc-g1", { rng: seededRng() });
    const abilityAction = plan.actions.find(a => a.type === "USE_ABILITY" && a.abilityName === "firebolt");
    assert.equal(abilityAction, undefined);
  });
});

describe("planMultiActionTurn — bonus action", () => {
  it("uses healing_word as bonus action on injured ally", () => {
    const state = makeState({
      npcs: [
        {
          id: "npc-g1", name: "Goblin Healer", faction: "npcs",
          position: { x: 2, y: 1 }, conditions: [],
          stats: { hp: 10, maxHp: 10, ac: 11, attackBonus: 2, damage: "1d4" },
          abilities: [{ name: "healing_word", range: 6, cooldownRemaining: 0, targeting: "ally" }],
          speed: 6,
        },
        {
          id: "npc-g2", name: "Goblin Warrior", faction: "npcs",
          position: { x: 4, y: 1 }, conditions: [],
          stats: { hp: 3, maxHp: 10, ac: 11, attackBonus: 2, damage: "1d4" },
          abilities: [],
          speed: 6,
        },
      ],
    });
    const plan = planMultiActionTurn(state, "npc-g1", { rng: seededRng() });
    const bonusAbility = plan.actions.find(a => a.type === "USE_ABILITY" && a.abilityName === "healing_word");
    assert.ok(bonusAbility, "Should use healing_word as bonus action");
    assert.equal(bonusAbility.targetId, "npc-g2");
  });

  it("skips bonus action when no injured allies", () => {
    const state = makeState({
      npcs: [{
        id: "npc-g1", name: "Goblin Healer", faction: "npcs",
        position: { x: 2, y: 1 }, conditions: [],
        stats: { hp: 10, maxHp: 10, ac: 11, attackBonus: 2, damage: "1d4" },
        abilities: [{ name: "healing_word", range: 6, cooldownRemaining: 0, targeting: "ally" }],
        speed: 6,
      }],
    });
    const plan = planMultiActionTurn(state, "npc-g1", { rng: seededRng() });
    const bonus = plan.actions.find(a => a.abilityName === "healing_word");
    assert.equal(bonus, undefined);
  });
});

describe("planMultiActionTurn — melee ability with difficulty", () => {
  it("uses melee ability when difficulty allows (low rng)", () => {
    const state = makeState({
      npcs: [{
        id: "npc-g1", name: "Goblin", faction: "npcs",
        position: { x: 2, y: 1 }, conditions: [],
        stats: { hp: 10, maxHp: 10, ac: 11, attackBonus: 2, damage: "1d4" },
        abilities: [{ name: "poison_strike", range: 1, cooldownRemaining: 0, targeting: "enemy" }],
        speed: 6,
      }],
    });
    const plan = planMultiActionTurn(state, "npc-g1", {
      rng: seededRng(0.1), // Below default 0.5 threshold
      difficulty: { abilityUseProbability: 0.8 },
    });
    const ability = plan.actions.find(a => a.abilityName === "poison_strike");
    assert.ok(ability, "Should use melee ability");
  });

  it("falls back to ATTACK when rng exceeds ability probability", () => {
    const state = makeState({
      npcs: [{
        id: "npc-g1", name: "Goblin", faction: "npcs",
        position: { x: 2, y: 1 }, conditions: [],
        stats: { hp: 10, maxHp: 10, ac: 11, attackBonus: 2, damage: "1d4" },
        abilities: [{ name: "poison_strike", range: 1, cooldownRemaining: 0, targeting: "enemy" }],
        speed: 6,
      }],
    });
    const plan = planMultiActionTurn(state, "npc-g1", {
      rng: seededRng(0.9), // Above threshold
      difficulty: { abilityUseProbability: 0.3 },
    });
    assert.ok(plan.actions.find(a => a.type === "ATTACK"), "Should fall back to ATTACK");
  });
});

// ── summarizePlan ───────────────────────────────────────────────────────

describe("summarizePlan", () => {
  it("counts action types", () => {
    const plan = {
      actions: [
        { type: "MOVE" }, { type: "ATTACK" }, { type: "USE_ABILITY" }, { type: "END_TURN" },
      ],
    };
    const s = summarizePlan(plan);
    assert.equal(s.moves, 1);
    assert.equal(s.attacks, 1);
    assert.equal(s.abilities, 1);
    assert.equal(s.total, 3);
  });

  it("handles empty actions", () => {
    assert.equal(summarizePlan({ actions: [{ type: "END_TURN" }] }).total, 0);
  });
});

// ── isPlanWithinBudget ──────────────────────────────────────────────────

describe("isPlanWithinBudget", () => {
  it("accepts plan within budget", () => {
    const plan = { actions: [{ type: "MOVE" }, { type: "ATTACK" }, { type: "END_TURN" }] };
    assert.equal(isPlanWithinBudget(plan), true);
  });

  it("accepts plan with ability + bonus", () => {
    const plan = { actions: [{ type: "MOVE" }, { type: "USE_ABILITY" }, { type: "USE_ABILITY" }, { type: "END_TURN" }] };
    assert.equal(isPlanWithinBudget(plan), true); // 1 move, 2 abilities = action + bonus
  });

  it("rejects plan with too many moves", () => {
    const plan = { actions: [{ type: "MOVE" }, { type: "MOVE" }, { type: "END_TURN" }] };
    assert.equal(isPlanWithinBudget(plan), false);
  });
});
