/**
 * sprint1_test.mjs — MIR Sprint 1 Tests.
 *
 * Tests for:
 *   S1.1: Ability system (Firebolt, Healing Word, Sneak Attack, Poison Strike, Shield Bash)
 *   S1.2: Condition system (apply, remove, duration, start/end of turn effects)
 *   S1.4: Range validation
 */

import {
  applyCondition, removeCondition, hasCondition,
  processStartOfTurn, processEndOfTurn,
  getAcModifier, getAttackModifier, hasAttackDisadvantage, shouldSkipTurn,
  CONDITION_DEFS,
} from "../src/engine/conditions.mjs";

import {
  applyAbility, ABILITY_CATALOGUE, tickCooldowns,
} from "../src/engine/abilities.mjs";

// ── Test harness ────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) { passed++; }
  else { failed++; console.error(`  ✗ ${msg}`); }
}

function section(name) { console.log(`\n── ${name} ──`); }

// ── Test state factory ──────────────────────────────────────────────────

function makeState(overrides = {}) {
  const base = {
    schemaVersion: "0.1.0",
    timestamp: "T0",
    map: {
      name: "Test Arena",
      grid: { size: { width: 10, height: 10 } },
    },
    entities: {
      players: [
        {
          id: "player1", name: "Seren", kind: "player",
          position: { x: 2, y: 2 },
          stats: { hpCurrent: 20, hpMax: 20, ac: 12, movementSpeed: 6 },
          conditions: [], conditionDurations: {},
        },
        {
          id: "player2", name: "Lyra", kind: "player",
          position: { x: 3, y: 2 },
          stats: { hpCurrent: 15, hpMax: 15, ac: 10, movementSpeed: 6 },
          conditions: [], conditionDurations: {},
        },
      ],
      npcs: [
        {
          id: "goblin1", name: "Goblin", kind: "npc",
          position: { x: 3, y: 3 },
          stats: { hpCurrent: 8, hpMax: 8, ac: 10, movementSpeed: 6 },
          conditions: [], conditionDurations: {},
        },
        {
          id: "goblin2", name: "Goblin Scout", kind: "npc",
          position: { x: 7, y: 7 },
          stats: { hpCurrent: 6, hpMax: 6, ac: 11, movementSpeed: 6 },
          conditions: [], conditionDurations: {},
        },
      ],
      objects: [],
    },
    combat: { mode: "combat", round: 1, initiativeOrder: ["player1", "goblin1", "player2", "goblin2"], activeEntityId: "player1" },
    rng: { mode: "seeded", seed: "test-sprint1", counter: 0 },
    log: { events: [] },
    ui: { selectedEntityId: null },
    map: {
      name: "Test Arena",
      grid: { size: { width: 10, height: 10 } },
      terrain: [],
    },
  };

  // Deep merge overrides
  const state = JSON.parse(JSON.stringify(base));
  if (overrides.playerHp !== undefined) state.entities.players[0].stats.hpCurrent = overrides.playerHp;
  if (overrides.npcHp !== undefined) state.entities.npcs[0].stats.hpCurrent = overrides.npcHp;
  if (overrides.playerPos) state.entities.players[0].position = { ...overrides.playerPos };
  if (overrides.npcPos) state.entities.npcs[0].position = { ...overrides.npcPos };
  if (overrides.seed) state.rng.seed = overrides.seed;
  return state;
}

// ════════════════════════════════════════════════════════════════════════
// S1.2: Condition System
// ════════════════════════════════════════════════════════════════════════

section("S1.2 — Condition Definitions");

assert(CONDITION_DEFS.dead.skipTurn === true, "dead skips turn");
assert(CONDITION_DEFS.dead.permanent === true, "dead is permanent");
assert(CONDITION_DEFS.stunned.skipTurn === true, "stunned skips turn");
assert(CONDITION_DEFS.stunned.acMod === -2, "stunned gives -2 AC");
assert(CONDITION_DEFS.poisoned.attackDisadvantage === true, "poisoned gives attack disadvantage");
assert(CONDITION_DEFS.blessed.attackMod === 2, "blessed gives +2 attack");
assert(CONDITION_DEFS.burning.dotDice[0] === 1 && CONDITION_DEFS.burning.dotDice[1] === 4, "burning does 1d4");

section("S1.2 — Apply/Remove Conditions");

{
  const ent = { conditions: [], conditionDurations: {} };
  applyCondition(ent, "stunned", 2);
  assert(hasCondition(ent, "stunned"), "stunned applied");
  assert(ent.conditionDurations.stunned === 2, "duration set to 2");

  // Applying again doesn't duplicate
  applyCondition(ent, "stunned", 3);
  assert(ent.conditions.filter(c => c === "stunned").length === 1, "no duplicate condition");
  assert(ent.conditionDurations.stunned === 3, "duration updated to 3");

  removeCondition(ent, "stunned");
  assert(!hasCondition(ent, "stunned"), "stunned removed");
  assert(ent.conditionDurations.stunned === undefined, "duration cleaned up");
}

{
  const ent = { conditions: [], conditionDurations: {} };
  applyCondition(ent, "poisoned");
  assert(hasCondition(ent, "poisoned"), "poisoned applied with default duration");
  assert(ent.conditionDurations.poisoned === 3, "default duration from CONDITION_DEFS");
}

{
  const ent = { conditions: [], conditionDurations: {} };
  applyCondition(ent, "prone");
  assert(hasCondition(ent, "prone"), "prone applied");
  assert(ent.conditionDurations.prone === undefined || ent.conditionDurations.prone === 0, "prone has no auto-duration");
}

section("S1.2 — Condition Modifiers");

{
  const ent = { conditions: ["stunned", "blessed"] };
  assert(getAcModifier(ent) === -2, "stunned gives -2 AC");
  assert(getAttackModifier(ent) === 2, "blessed gives +2 attack");
  assert(!hasAttackDisadvantage(ent), "no disadvantage from stunned+blessed");
  assert(shouldSkipTurn(ent), "stunned should skip turn");
}

{
  const ent = { conditions: ["poisoned"] };
  assert(hasAttackDisadvantage(ent), "poisoned has attack disadvantage");
  assert(!shouldSkipTurn(ent), "poisoned does not skip turn");
  assert(getAcModifier(ent) === 0, "poisoned has no AC mod");
}

{
  const ent = { conditions: ["dead"] };
  assert(shouldSkipTurn(ent), "dead should skip turn");
}

{
  const ent = { conditions: [] };
  assert(getAcModifier(ent) === 0, "no conditions = 0 AC mod");
  assert(getAttackModifier(ent) === 0, "no conditions = 0 attack mod");
  assert(!shouldSkipTurn(ent), "no conditions = don't skip");
}

section("S1.2 — End-of-Turn Duration Countdown");

{
  const state = makeState({ seed: "eot-test" });
  const ent = state.entities.players[0];
  applyCondition(ent, "stunned", 2);
  applyCondition(ent, "poisoned", 1);

  // End turn 1: stunned 2→1, poisoned 1→0 (expires)
  const r1 = processEndOfTurn(state, "player1");
  assert(hasCondition(ent, "stunned"), "stunned still active after 1 tick");
  assert(ent.conditionDurations.stunned === 1, "stunned decremented to 1");
  assert(!hasCondition(ent, "poisoned"), "poisoned expired after 1 tick");
  assert(r1.expired.includes("poisoned"), "poisoned in expired list");
  assert(r1.events.length === 1, "1 expiry event");
  assert(r1.events[0].type === "CONDITION_EXPIRED", "event type is CONDITION_EXPIRED");

  // End turn 2: stunned 1→0 (expires)
  const r2 = processEndOfTurn(state, "player1");
  assert(!hasCondition(ent, "stunned"), "stunned expired after 2 ticks");
  assert(r2.expired.includes("stunned"), "stunned in expired list");
}

section("S1.2 — Start-of-Turn Burning Damage");

{
  const state = makeState({ seed: "burn-test", playerHp: 10 });
  const ent = state.entities.players[0];
  applyCondition(ent, "burning", 3);

  const r = processStartOfTurn(state, "player1");
  assert(r.events.length === 1, "1 burning damage event");
  assert(r.events[0].type === "CONDITION_DAMAGE", "event type is CONDITION_DAMAGE");
  assert(r.events[0].payload.condition === "burning", "condition is burning");
  assert(r.events[0].payload.damage >= 1 && r.events[0].payload.damage <= 4, "damage in 1d4 range");
  assert(ent.stats.hpCurrent < 10, "HP reduced by burning");
}

{
  // Burning can kill
  const state = makeState({ seed: "burn-kill", playerHp: 1 });
  const ent = state.entities.players[0];
  applyCondition(ent, "burning", 3);

  processStartOfTurn(state, "player1");
  assert(ent.stats.hpCurrent === 0, "burning can reduce to 0");
  assert(hasCondition(ent, "dead"), "entity dies from burning");
}

{
  // No burning = no event
  const state = makeState({ seed: "no-burn" });
  const r = processStartOfTurn(state, "player1");
  assert(r.events.length === 0, "no events without burning");
}

// ════════════════════════════════════════════════════════════════════════
// S1.1: Ability System
// ════════════════════════════════════════════════════════════════════════

section("S1.1 — Ability Catalogue");

assert(Object.keys(ABILITY_CATALOGUE).length >= 5, "at least 5 abilities in catalogue");
assert(ABILITY_CATALOGUE.firebolt.range === 6, "firebolt range is 6");
assert(ABILITY_CATALOGUE.healing_word.type === "heal", "healing_word is heal type");
assert(ABILITY_CATALOGUE.sneak_attack.range === 1, "sneak_attack is melee range");
assert(ABILITY_CATALOGUE.poison_strike.conditionApply.condition === "poisoned", "poison_strike applies poisoned");
assert(ABILITY_CATALOGUE.shield_bash.conditionApply.condition === "stunned", "shield_bash applies stunned");

section("S1.1 — Firebolt (Ranged Attack)");

{
  // Firebolt at range: player1 at (2,2), goblin2 at (7,7) → distance 5, within range 6
  const state = makeState({ seed: "firebolt-hit" });
  const r = applyAbility(state, { casterId: "player1", abilityId: "firebolt", targetId: "goblin2" });
  assert(r.ok, "firebolt resolves ok");
  assert(r.events.length === 1, "1 ability event");
  assert(r.events[0].type === "ABILITY_USED", "event type ABILITY_USED");
  assert(r.events[0].payload.abilityName === "Firebolt", "ability name in event");
  assert(r.events[0].payload.abilityType === "attack", "ability type in event");
}

{
  // Firebolt out of range
  const state = makeState({ seed: "firebolt-oor" });
  state.entities.npcs[1].position = { x: 9, y: 9 }; // distance 7 from (2,2)
  const r = applyAbility(state, { casterId: "player1", abilityId: "firebolt", targetId: "goblin2" });
  assert(!r.ok, "firebolt out of range rejected");
  assert(r.errors[0].code === "OUT_OF_RANGE", "error code is OUT_OF_RANGE");
}

{
  // Firebolt on ally = rejected
  const state = makeState({ seed: "firebolt-ally" });
  const r = applyAbility(state, { casterId: "player1", abilityId: "firebolt", targetId: "player2" });
  assert(!r.ok, "firebolt on ally rejected");
  assert(r.errors[0].message.includes("enemies"), "error says targets enemies");
}

section("S1.1 — Healing Word (Heal)");

{
  const state = makeState({ seed: "heal-1" });
  state.entities.players[1].stats.hpCurrent = 5; // Lyra wounded
  const r = applyAbility(state, { casterId: "player1", abilityId: "healing_word", targetId: "player2" });
  assert(r.ok, "healing_word resolves ok");
  assert(r.events[0].payload.abilityType === "heal", "heal type in event");
  assert(r.events[0].payload.actualHeal > 0, "actual heal > 0");
  assert(state.entities.players[1].stats.hpCurrent > 5, "Lyra HP increased");
}

{
  // Healing cannot exceed max HP
  const state = makeState({ seed: "heal-max" });
  // player2 at full HP (15/15)
  const r = applyAbility(state, { casterId: "player1", abilityId: "healing_word", targetId: "player2" });
  assert(r.ok, "heal at full HP still resolves");
  assert(state.entities.players[1].stats.hpCurrent === 15, "HP doesn't exceed max");
  assert(r.events[0].payload.actualHeal === 0, "actual heal is 0 when full");
}

{
  // Healing an enemy = rejected
  const state = makeState({ seed: "heal-enemy" });
  const r = applyAbility(state, { casterId: "player1", abilityId: "healing_word", targetId: "goblin1" });
  assert(!r.ok, "healing enemy rejected");
  assert(r.errors[0].message.includes("allies"), "error says targets allies");
}

{
  // Healing out of range
  const state = makeState({ seed: "heal-oor" });
  state.entities.players[1].position = { x: 9, y: 9 }; // distance 7
  const r = applyAbility(state, { casterId: "player1", abilityId: "healing_word", targetId: "player2" });
  assert(!r.ok, "heal out of range rejected");
}

section("S1.1 — Sneak Attack (Melee)");

{
  // Adjacent: player1(2,2), goblin1(3,3) → distance 1
  const state = makeState({ seed: "sneak-hit" });
  const r = applyAbility(state, { casterId: "player1", abilityId: "sneak_attack", targetId: "goblin1" });
  assert(r.ok, "sneak_attack resolves ok");
  assert(r.events[0].payload.abilityName === "Sneak Attack", "name in event");
}

{
  // Not adjacent
  const state = makeState({ seed: "sneak-far" });
  const r = applyAbility(state, { casterId: "player1", abilityId: "sneak_attack", targetId: "goblin2" });
  assert(!r.ok, "sneak_attack at range rejected");
}

section("S1.1 — Poison Strike (Applies Condition)");

{
  const state = makeState({ seed: "poison-apply" });
  // Need adjacent: set goblin to adjacent
  state.entities.npcs[0].position = { x: 3, y: 2 };
  const npc = state.entities.npcs[0];
  const r = applyAbility(state, { casterId: "player1", abilityId: "poison_strike", targetId: "goblin1" });
  assert(r.ok, "poison_strike resolves");
  // If hit and target alive, poisoned should be applied
  if (r.events[0].payload.hit && npc.stats.hpCurrent > 0) {
    assert(hasCondition(npc, "poisoned"), "target poisoned on hit");
    assert(r.events[0].payload.conditionApplied === "poisoned", "condition in event payload");
  }
}

section("S1.1 — Shield Bash (Applies Stunned)");

{
  const state = makeState({ seed: "bash-stun" });
  state.entities.npcs[0].position = { x: 3, y: 2 }; // adjacent
  state.entities.npcs[0].stats.hpCurrent = 20; // high HP so they survive
  state.entities.npcs[0].stats.hpMax = 20;
  const npc = state.entities.npcs[0];
  const r = applyAbility(state, { casterId: "player1", abilityId: "shield_bash", targetId: "goblin1" });
  assert(r.ok, "shield_bash resolves");
  if (r.events[0].payload.hit && npc.stats.hpCurrent > 0) {
    assert(hasCondition(npc, "stunned"), "target stunned on hit");
  }
}

section("S1.1 — Ability Validation Errors");

{
  // Unknown ability
  const state = makeState({ seed: "unk-ability" });
  const r = applyAbility(state, { casterId: "player1", abilityId: "fireball_9000", targetId: "goblin1" });
  assert(!r.ok, "unknown ability rejected");
}

{
  // Caster not found
  const state = makeState({ seed: "no-caster" });
  const r = applyAbility(state, { casterId: "nobody", abilityId: "firebolt", targetId: "goblin1" });
  assert(!r.ok, "missing caster rejected");
}

{
  // Target not found
  const state = makeState({ seed: "no-target" });
  const r = applyAbility(state, { casterId: "player1", abilityId: "firebolt", targetId: "nobody" });
  assert(!r.ok, "missing target rejected");
}

{
  // Dead caster
  const state = makeState({ seed: "dead-cast" });
  state.entities.players[0].conditions.push("dead");
  const r = applyAbility(state, { casterId: "player1", abilityId: "firebolt", targetId: "goblin1" });
  assert(!r.ok, "dead caster rejected");
}

{
  // Dead target for attack
  const state = makeState({ seed: "dead-target" });
  state.entities.npcs[0].conditions.push("dead");
  const r = applyAbility(state, { casterId: "player1", abilityId: "firebolt", targetId: "goblin1" });
  assert(!r.ok, "attack on dead target rejected");
}

section("S1.1 — Cooldown System");

{
  const state = makeState({ seed: "cooldown-1" });
  state.entities.npcs[0].position = { x: 3, y: 2 }; // adjacent
  
  // First use: should work
  const r1 = applyAbility(state, { casterId: "player1", abilityId: "poison_strike", targetId: "goblin1" });
  assert(r1.ok, "first poison_strike works");

  // Second use: on cooldown
  const r2 = applyAbility(state, { casterId: "player1", abilityId: "poison_strike", targetId: "goblin1" });
  assert(!r2.ok, "second poison_strike rejected (cooldown)");
  assert(r2.errors[0].message.includes("cooldown"), "error mentions cooldown");
}

{
  // Tick cooldowns
  const ent = { abilityCooldowns: { poison_strike: 2, shield_bash: 1 } };
  tickCooldowns(ent);
  assert(ent.abilityCooldowns.poison_strike === 1, "poison_strike ticked to 1");
  assert(ent.abilityCooldowns.shield_bash === undefined, "shield_bash expired and cleaned");

  tickCooldowns(ent);
  assert(ent.abilityCooldowns.poison_strike === undefined, "poison_strike expired");
}

{
  // No cooldowns = no crash
  const ent = { conditions: [] };
  tickCooldowns(ent); // should not throw
  assert(true, "tickCooldowns on entity without cooldowns doesn't crash");
}

section("S1.1 — Ability Events in State Log");

{
  const state = makeState({ seed: "log-check" });
  applyAbility(state, { casterId: "player1", abilityId: "firebolt", targetId: "goblin1" });
  const lastEvt = state.log.events[state.log.events.length - 1];
  assert(lastEvt.type === "ABILITY_USED", "ABILITY_USED in state log");
  assert(lastEvt.payload.casterId === "player1", "caster in log");
  assert(lastEvt.payload.abilityId === "firebolt", "ability in log");
}

// ════════════════════════════════════════════════════════════════════════
// S1.4: Range Validation (via abilities)
// ════════════════════════════════════════════════════════════════════════

section("S1.4 — Range Checks");

{
  // Exact range boundary: firebolt range 6, distance 6
  const state = makeState({ seed: "range-exact" });
  state.entities.npcs[0].position = { x: 8, y: 2 }; // distance 6 from (2,2)
  const r = applyAbility(state, { casterId: "player1", abilityId: "firebolt", targetId: "goblin1" });
  assert(r.ok, "firebolt at exact max range works");
}

{
  // One past range: distance 7
  const state = makeState({ seed: "range-past" });
  state.entities.npcs[0].position = { x: 9, y: 2 }; // distance 7
  const r = applyAbility(state, { casterId: "player1", abilityId: "firebolt", targetId: "goblin1" });
  assert(!r.ok, "firebolt at range+1 rejected");
}

{
  // Melee range = 1 (Chebyshev): diagonal still counts
  const state = makeState({ seed: "melee-diag" });
  // player1(2,2), goblin1(3,3) → Chebyshev distance 1
  const r = applyAbility(state, { casterId: "player1", abilityId: "sneak_attack", targetId: "goblin1" });
  assert(r.ok, "melee at diagonal 1 works");
}

{
  // Melee at distance 2 = rejected
  const state = makeState({ seed: "melee-2" });
  state.entities.npcs[0].position = { x: 4, y: 4 }; // distance 2
  const r = applyAbility(state, { casterId: "player1", abilityId: "sneak_attack", targetId: "goblin1" });
  assert(!r.ok, "melee at distance 2 rejected");
}

{
  // Healing word range 4
  const state = makeState({ seed: "heal-range" });
  state.entities.players[1].position = { x: 6, y: 2 }; // distance 4
  state.entities.players[1].stats.hpCurrent = 5;
  const r = applyAbility(state, { casterId: "player1", abilityId: "healing_word", targetId: "player2" });
  assert(r.ok, "healing_word at range 4 works");
}

{
  const state = makeState({ seed: "heal-range-5" });
  state.entities.players[1].position = { x: 7, y: 2 }; // distance 5
  const r = applyAbility(state, { casterId: "player1", abilityId: "healing_word", targetId: "player2" });
  assert(!r.ok, "healing_word at range 5 rejected");
}

// ════════════════════════════════════════════════════════════════════════
// Results
// ════════════════════════════════════════════════════════════════════════

console.log(`\nResults: ${passed}/${passed + failed} passed, ${failed} failed`);
if (failed > 0) {
  console.error("FAIL: some Sprint 1 tests failed");
  process.exit(1);
} else {
  console.log("PASS: all Sprint 1 tests passed");
}
