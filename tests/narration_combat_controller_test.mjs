/**
 * narration_combat_controller_test.mjs — MIR Event Narration + Combat Controller Tests.
 */

import { narrateEvent, narrateEvents } from "../src/engine/narrateEvent.mjs";
import { executeNpcTurn, simulateCombat } from "../src/engine/combatController.mjs";
import { applyAction } from "../src/engine/applyAction.mjs";
import { explorationExample } from "../src/state/exampleStates.mjs";

console.log("\n╔══════════════════════════════════════╗");
console.log("║  MIR S0.7 — Narration + Controller     ║");
console.log("╚══════════════════════════════════════╝\n");

let passed = 0, failed = 0;
const check = (c, l) => { if (c) { console.log(`  ✅ ${l}`); passed++; } else { console.log(`  ❌ ${l}`); failed++; } };

// ── Narration Tests ─────────────────────────────────────────────────

console.log("[Test 1] narrateEvent — MOVE_APPLIED");
{
  const evt = {
    type: "MOVE_APPLIED",
    payload: { entityId: "pc-seren", path: [{ x: 3, y: 4 }, { x: 3, y: 5 }], finalPosition: { x: 3, y: 5 } },
  };
  const state = structuredClone(explorationExample);
  const text = narrateEvent(evt, state);
  check(typeof text === "string", "Returns string");
  check(text.includes("Seren"), "Uses entity name");
  check(text.includes("2 step"), "Mentions step count");
  check(text.includes("(3, 5)"), "Mentions destination");
}

console.log("\n[Test 2] narrateEvent — ATTACK_RESOLVED (hit)");
{
  const evt = {
    type: "ATTACK_RESOLVED",
    payload: { attackerId: "pc-seren", targetId: "npc-barkeep", attackRoll: 15, targetAc: 10, hit: true, damage: 4, targetHpAfter: 6 },
  };
  const text = narrateEvent(evt, structuredClone(explorationExample));
  check(text.includes("Seren"), "Has attacker name");
  check(text.includes("HIT"), "Says HIT");
  check(text.includes("4 damage"), "Shows damage");
  check(text.includes("15"), "Shows roll");
}

console.log("\n[Test 3] narrateEvent — ATTACK_RESOLVED (miss)");
{
  const evt = {
    type: "ATTACK_RESOLVED",
    payload: { attackerId: "pc-seren", targetId: "npc-barkeep", attackRoll: 5, targetAc: 10, hit: false, damage: 0, targetHpAfter: 10 },
  };
  const text = narrateEvent(evt, structuredClone(explorationExample));
  check(text.includes("MISS"), "Says MISS");
}

console.log("\n[Test 4] narrateEvent — ATTACK_RESOLVED (kill)");
{
  const evt = {
    type: "ATTACK_RESOLVED",
    payload: { attackerId: "pc-seren", targetId: "npc-barkeep", attackRoll: 18, targetAc: 10, hit: true, damage: 6, targetHpAfter: 0 },
  };
  const text = narrateEvent(evt, structuredClone(explorationExample));
  check(text.includes("falls"), "Kill narration");
}

console.log("\n[Test 5] narrateEvent — INITIATIVE_ROLLED");
{
  const evt = {
    type: "INITIATIVE_ROLLED",
    payload: { order: [{ entityId: "pc-seren", roll: 18 }, { entityId: "npc-barkeep", roll: 12 }] },
  };
  const text = narrateEvent(evt, structuredClone(explorationExample));
  check(text.includes("Combat begins"), "Has combat start text");
  check(text.includes("Seren"), "Has entity names");
  check(text.includes("18"), "Has roll values");
}

console.log("\n[Test 6] narrateEvent — TURN_ENDED");
{
  const evt = {
    type: "TURN_ENDED",
    payload: { entityId: "pc-seren", nextEntityId: "npc-barkeep", round: 2 },
  };
  const text = narrateEvent(evt, structuredClone(explorationExample));
  check(text.includes("Seren"), "Current entity");
  check(text.includes("is up"), "Next entity indicator");
  check(text.includes("round 2"), "Round number");
}

console.log("\n[Test 7] narrateEvent — COMBAT_ENDED");
{
  const evt = {
    type: "COMBAT_ENDED",
    payload: { winner: "players", finalRound: 3, livingPlayers: ["pc-seren"], livingNpcs: [] },
  };
  const text = narrateEvent(evt);
  check(text.includes("heroes"), "Winner text");
  check(text.includes("3 round"), "Round count");
}

console.log("\n[Test 8] narrateEvent — ACTION_REJECTED");
{
  const evt = {
    type: "ACTION_REJECTED",
    payload: { action: { type: "MOVE" }, reasons: ["[BLOCKED_CELL] Can't move there"] },
  };
  const text = narrateEvent(evt);
  check(text.includes("rejected"), "Has rejection text");
  check(text.includes("MOVE"), "Has action type");
}

console.log("\n[Test 9] narrateEvent — null/undefined");
{
  check(narrateEvent(null) === "Something happened.", "null → fallback");
  check(narrateEvent(undefined) === "Something happened.", "undefined → fallback");
  check(narrateEvent({}) === "Something happened.", "empty → fallback");
}

console.log("\n[Test 10] narrateEvent — unknown type");
{
  const text = narrateEvent({ type: "CUSTOM_EVENT", payload: {} });
  check(text.includes("CUSTOM_EVENT"), "Shows event type");
}

console.log("\n[Test 11] narrateEvent — without state (fallback to IDs)");
{
  const evt = {
    type: "MOVE_APPLIED",
    payload: { entityId: "pc-seren", path: [{ x: 1, y: 1 }], finalPosition: { x: 1, y: 1 } },
  };
  const text = narrateEvent(evt); // No state
  check(text.includes("pc-seren"), "Falls back to entity ID");
}

console.log("\n[Test 12] narrateEvents — batch narration");
{
  const events = [
    { type: "INITIATIVE_ROLLED", payload: { order: [{ entityId: "pc-seren", roll: 15 }] } },
    { type: "MOVE_APPLIED", payload: { entityId: "pc-seren", path: [{ x: 1, y: 1 }], finalPosition: { x: 1, y: 1 } } },
  ];
  const texts = narrateEvents(events, structuredClone(explorationExample));
  check(Array.isArray(texts), "Returns array");
  check(texts.length === 2, "One per event");
  check(texts.every(t => typeof t === "string"), "All strings");
}

// ── Combat Controller Tests ─────────────────────────────────────────

console.log("\n[Test 13] executeNpcTurn — produces events and narration");
{
  const state = structuredClone(explorationExample);
  state.combat.mode = "combat";
  state.combat.round = 1;
  state.combat.initiativeOrder = ["npc-barkeep", "pc-seren", "pc-miri"];
  state.combat.activeEntityId = "npc-barkeep";

  const result = executeNpcTurn(state, "npc-barkeep");
  check(result.state !== state, "Returns new state");
  check(result.events.length > 0, `Has events (${result.events.length})`);
  check(result.narration.length > 0, `Has narration (${result.narration.length})`);
  check(result.narration.every(n => typeof n === "string"), "Narration is strings");
}

console.log("\n[Test 14] simulateCombat — runs full combat simulation");
{
  const state = structuredClone(explorationExample);
  const result = simulateCombat(state, { maxRounds: 3 });
  check(result.events.length > 0, `Has events (${result.events.length})`);
  check(result.narration.length > 0, `Has narration (${result.narration.length})`);
  check(result.rounds > 0, `Ran ${result.rounds} rounds`);
  check(result.narration[0].includes("Combat begins"), "Starts with initiative narration");
}

console.log("\n[Test 15] simulateCombat — respects maxRounds");
{
  const state = structuredClone(explorationExample);
  const result = simulateCombat(state, { maxRounds: 1 });
  check(result.rounds <= 2, `Rounds capped (got ${result.rounds})`);
}

console.log("\n[Test 16] simulateCombat — with player callback");
{
  const state = structuredClone(explorationExample);
  let playerTurnCalled = false;
  const result = simulateCombat(state, {
    maxRounds: 2,
    onPlayerTurn: (s, entityId) => {
      playerTurnCalled = true;
      return [{ type: "END_TURN", entityId }];
    },
  });
  check(playerTurnCalled, "Player callback was called");
  check(result.events.length > 0, "Events produced");
}

console.log("\n[Test 17] simulateCombat — narration is human-readable");
{
  const state = structuredClone(explorationExample);
  const result = simulateCombat(state, { maxRounds: 2 });
  // Check that narration lines are reasonable
  for (const line of result.narration.slice(0, 5)) {
    check(line.length > 5, `Narration line has content: "${line.slice(0, 50)}..."`);
  }
}

// ════════════════════════════════════════════════════════════════════
console.log(`\n══════════════════════════════════════════════════`);
console.log(`Results: ${passed}/${passed + failed} passed, ${failed} failed`);
console.log(failed === 0 ? "PASS: all Narration + Controller tests passed" : "FAIL: some tests failed");
if (failed) process.exit(1);
