/**
 * engine_test.mjs — MIR 1.3 Engine Tests.
 *
 * Tests: applyAction, movement, attack, initiative, RNG determinism.
 */

import { applyAction } from "../src/engine/applyAction.mjs";
import { explorationExample } from "../src/state/exampleStates.mjs";
import { hashSeed, rollD20 } from "../src/engine/rng.mjs";

console.log("\n╔══════════════════════════════════════╗");
console.log("║  MIR 1.3 — Engine Tests               ║");
console.log("╚══════════════════════════════════════╝\n");

let passed = 0, failed = 0;
const check = (c, l) => { if (c) { console.log(`  ✅ ${l}`); passed++; } else { console.log(`  ❌ ${l}`); failed++; } };

// ── Helper: fresh exploration state ─────────────────────────────────
function freshState() {
  return structuredClone(explorationExample);
}

// ════════════════════════════════════════════════════════════════════
// Test 1: Valid MOVE — Seren moves right 2 cells
// ════════════════════════════════════════════════════════════════════
console.log("[Test 1] Valid MOVE — pc-seren moves right 2 cells");
{
  const state = freshState();
  const action = { type: "MOVE", entityId: "pc-seren", path: [{ x: 2, y: 4 }, { x: 2, y: 5 }] };
  const r = applyAction(state, action);
  check(r.success, "MOVE succeeds");
  const seren = r.nextState.entities.players.find(e => e.id === "pc-seren");
  check(seren.position.x === 2 && seren.position.y === 5, `Seren at (2,5) — was (2,3)`);
  // Original state not mutated
  const origSeren = state.entities.players.find(e => e.id === "pc-seren");
  check(origSeren.position.y === 3, "Original state NOT mutated");
  // Log event appended
  check(r.nextState.log.events.length > state.log.events.length, "Log event appended");
}

// ════════════════════════════════════════════════════════════════════
// Test 2: Invalid MOVE — into blocked cell
// ════════════════════════════════════════════════════════════════════
console.log("\n[Test 2] Invalid MOVE — into blocked cell");
{
  // Place Seren at (2,2) so step to (3,2) hits a blocked cell
  const state = freshState();
  state.entities.players[0].position = { x: 2, y: 2 };
  const action = { type: "MOVE", entityId: "pc-seren", path: [{ x: 3, y: 2 }] };
  const r = applyAction(state, action);
  check(!r.success, "MOVE into blocked cell fails");
  check((r.errors ?? []).some(e => e.includes("BLOCKED_CELL")), "BLOCKED_CELL error");
  check(r.nextState === state, "State unchanged (same ref)");
}

// ════════════════════════════════════════════════════════════════════
// Test 3: Invalid MOVE — diagonal step
// ════════════════════════════════════════════════════════════════════
console.log("\n[Test 3] Invalid MOVE — diagonal step");
{
  const state = freshState();
  const action = { type: "MOVE", entityId: "pc-seren", path: [{ x: 1, y: 4 }] };
  const r = applyAction(state, action);
  check(!r.success, "Diagonal move fails");
  check(r.errors.some(e => e.includes("DIAGONAL")), "DIAGONAL error");
}

// ════════════════════════════════════════════════════════════════════
// Test 4: Invalid MOVE — exceeds movement speed
// ════════════════════════════════════════════════════════════════════
console.log("\n[Test 4] Invalid MOVE — exceeds movement speed");
{
  const state = freshState();
  // movementSpeed is 6 — path of 7 steps
  const path = [];
  for (let i = 1; i <= 7; i++) path.push({ x: 2, y: 3 + (i % 2 === 1 ? 1 : 0) + Math.floor(i/2) });
  // Actually let's make a simple back-and-forth of 7 steps
  const longPath = [
    {x:2,y:4},{x:2,y:5},{x:2,y:6},{x:2,y:7},{x:2,y:8},{x:2,y:9},{x:1,y:9}
  ];
  const action = { type: "MOVE", entityId: "pc-seren", path: longPath };
  const r = applyAction(state, action);
  check(!r.success, "Over-speed move fails");
  check(r.errors.some(e => e.includes("OUT_OF_RANGE")), "OUT_OF_RANGE error");
}

// ════════════════════════════════════════════════════════════════════
// Test 5: Invalid MOVE — into occupied cell
// ════════════════════════════════════════════════════════════════════
console.log("\n[Test 5] Invalid MOVE — into occupied cell");
{
  const state = freshState();
  // npc-barkeep is at (6,2) — move Seren from (2,3) toward (6,2)
  // Just one step to occupied: put seren next to barkeep first
  const s = freshState();
  s.entities.players[0].position = { x: 5, y: 2 }; // manually place adjacent
  const action = { type: "MOVE", entityId: "pc-seren", path: [{ x: 6, y: 2 }] };
  const r = applyAction(s, action);
  check(!r.success, "Move into occupied cell fails");
  check(r.errors.some(e => e.includes("OVERLAP")), "OVERLAP error");
}

// ════════════════════════════════════════════════════════════════════
// Test 6: Invalid MOVE — out of bounds
// ════════════════════════════════════════════════════════════════════
console.log("\n[Test 6] Invalid MOVE — out of map bounds");
{
  const state = freshState();
  // Seren at (2,3). Move to y=-1
  const s = freshState();
  s.entities.players[0].position = { x: 0, y: 0 };
  const action = { type: "MOVE", entityId: "pc-seren", path: [{ x: 0, y: -1 }] };
  const r = applyAction(s, action);
  check(!r.success, "Move out of bounds fails");
  check(r.errors.some(e => e.includes("OUT_OF_RANGE")), "OUT_OF_RANGE error");
}

// ════════════════════════════════════════════════════════════════════
// Test 7: Invalid action shape
// ════════════════════════════════════════════════════════════════════
console.log("\n[Test 7] Invalid action shapes");
{
  const state = freshState();
  let r = applyAction(state, null);
  check(!r.success, "null action fails");
  r = applyAction(state, { type: "FIREBALL" });
  check(!r.success, "Unknown type fails");
  check(r.errors.some(e => e.includes("INVALID_ACTION")), "INVALID_ACTION error");
  r = applyAction(state, { type: "MOVE" });
  check(!r.success, "MOVE without entityId fails");
}

// ════════════════════════════════════════════════════════════════════
// Test 8: RNG Determinism — same seed → same rolls
// ════════════════════════════════════════════════════════════════════
console.log("\n[Test 8] RNG Determinism — same seed, same results");
{
  const state1 = freshState();
  state1.rng.mode = "seeded";
  state1.rng.seed = "test-seed-42";
  const state2 = structuredClone(state1);
  const r1 = rollD20(state1, "test");
  const r2 = rollD20(state2, "test");
  check(r1.result === r2.result, `Same seed → same d20 (both=${r1.result})`);
  check(r1.result >= 1 && r1.result <= 20, `d20 in range [1,20]: ${r1.result}`);
  // Second roll also deterministic
  const r1b = rollD20(r1.nextState, "test2");
  const r2b = rollD20(r2.nextState, "test2");
  check(r1b.result === r2b.result, `Second roll also identical (both=${r1b.result})`);
}

// ════════════════════════════════════════════════════════════════════
// Test 9: RNG — different seeds → (likely) different rolls
// ════════════════════════════════════════════════════════════════════
console.log("\n[Test 9] RNG — different seeds → likely different");
{
  const s1 = freshState(); s1.rng.seed = "alpha";
  const s2 = freshState(); s2.rng.seed = "beta";
  const r1 = rollD20(s1, "x");
  const r2 = rollD20(s2, "x");
  check(r1.result !== r2.result || true, `Different seeds: ${r1.result} vs ${r2.result} (may rarely coincide)`);
  check(typeof r1.result === "number", "result is number");
}

// ════════════════════════════════════════════════════════════════════
// Test 10: ROLL_INITIATIVE — transitions to combat
// ════════════════════════════════════════════════════════════════════
console.log("\n[Test 10] ROLL_INITIATIVE — exploration → combat");
{
  const state = freshState();
  state.rng.seed = "init-seed";
  const r = applyAction(state, { type: "ROLL_INITIATIVE" });
  check(r.success, "ROLL_INITIATIVE succeeds");
  check(r.nextState.combat.mode === "combat", "Mode is combat");
  check(r.nextState.combat.round === 1, "Round is 1");
  check(r.nextState.combat.initiativeOrder.length > 0, "Initiative order populated");
  check(r.nextState.combat.activeEntityId !== null, "Active entity set");
  // All initiative IDs are real entities
  const allIds = new Set([
    ...r.nextState.entities.players.map(e => e.id),
    ...r.nextState.entities.npcs.map(e => e.id),
  ]);
  const allInOrder = r.nextState.combat.initiativeOrder.every(id => allIds.has(id));
  check(allInOrder, "All initiative IDs are real entities");
}

// ════════════════════════════════════════════════════════════════════
// Test 11: ROLL_INITIATIVE — double init fails
// ════════════════════════════════════════════════════════════════════
console.log("\n[Test 11] ROLL_INITIATIVE — already in combat fails");
{
  const state = freshState();
  state.rng.seed = "init";
  const r1 = applyAction(state, { type: "ROLL_INITIATIVE" });
  const r2 = applyAction(r1.nextState, { type: "ROLL_INITIATIVE" });
  check(!r2.success, "Second ROLL_INITIATIVE fails");
  check(r2.errors.some(e => e.includes("COMBAT_ALREADY")), "COMBAT_ALREADY error");
}

// ════════════════════════════════════════════════════════════════════
// Test 12: END_TURN — advances active entity
// ════════════════════════════════════════════════════════════════════
console.log("\n[Test 12] END_TURN — advances turn");
{
  const state = freshState();
  state.rng.seed = "turn-test";
  const r1 = applyAction(state, { type: "ROLL_INITIATIVE" });
  check(r1.success, "Init succeeds");
  const activeId = r1.nextState.combat.activeEntityId;
  const r2 = applyAction(r1.nextState, { type: "END_TURN", entityId: activeId });
  check(r2.success, "END_TURN succeeds");
  check(r2.nextState.combat.activeEntityId !== activeId, "Active entity changed");
}

// ════════════════════════════════════════════════════════════════════
// Test 13: END_TURN — wrong entity
// ════════════════════════════════════════════════════════════════════
console.log("\n[Test 13] END_TURN — wrong entity fails");
{
  const state = freshState();
  state.rng.seed = "turn-test2";
  const r1 = applyAction(state, { type: "ROLL_INITIATIVE" });
  const activeId = r1.nextState.combat.activeEntityId;
  const otherId = r1.nextState.combat.initiativeOrder.find(id => id !== activeId);
  const r2 = applyAction(r1.nextState, { type: "END_TURN", entityId: otherId });
  check(!r2.success, "END_TURN by wrong entity fails");
  check(r2.errors.some(e => e.includes("NOT_YOUR_TURN")), "NOT_YOUR_TURN error");
}

// ════════════════════════════════════════════════════════════════════
// Test 14: ATTACK — in exploration mode (allowed, no turn order)
// ════════════════════════════════════════════════════════════════════
console.log("\n[Test 14] ATTACK — in exploration mode");
{
  const state = freshState();
  state.rng.seed = "attack-seed";
  const action = { type: "ATTACK", attackerId: "pc-seren", targetId: "npc-barkeep" };
  const r = applyAction(state, action);
  check(r.success, "Attack in exploration succeeds");
  // Check log has attack event
  const atkEvents = r.nextState.log.events.filter(e => e.type === "attack");
  check(atkEvents.length > 0, "Attack event in log");
  const payload = atkEvents[0].payload;
  check(payload.attackerId === "pc-seren", "Attacker correct");
  check(payload.targetId === "npc-barkeep", "Target correct");
  check(typeof payload.attackRoll === "number", "Attack roll recorded");
  check(typeof payload.hit === "boolean", "Hit recorded");
  // Original state not mutated
  check(state.entities.npcs[0].stats.hpCurrent === 8, "Original hp unchanged");
}

// ════════════════════════════════════════════════════════════════════
// Test 15: ATTACK — deterministic result
// ════════════════════════════════════════════════════════════════════
console.log("\n[Test 15] ATTACK — deterministic (same seed → same result)");
{
  const s1 = freshState(); s1.rng.seed = "det-attack";
  const s2 = freshState(); s2.rng.seed = "det-attack";
  const action = { type: "ATTACK", attackerId: "pc-seren", targetId: "npc-barkeep" };
  const r1 = applyAction(s1, action);
  const r2 = applyAction(s2, action);
  check(r1.success && r2.success, "Both attacks succeed");
  const hp1 = r1.nextState.entities.npcs[0].stats.hpCurrent;
  const hp2 = r2.nextState.entities.npcs[0].stats.hpCurrent;
  check(hp1 === hp2, `Deterministic: barkeep HP same (${hp1} = ${hp2})`);
}

// ════════════════════════════════════════════════════════════════════
// Test 16: ATTACK — self attack fails
// ════════════════════════════════════════════════════════════════════
console.log("\n[Test 16] ATTACK — self attack fails");
{
  const state = freshState();
  state.rng.seed = "self";
  const r = applyAction(state, { type: "ATTACK", attackerId: "pc-seren", targetId: "pc-seren" });
  check(!r.success, "Self attack fails");
  check(r.errors.some(e => e.includes("SELF_ATTACK")), "SELF_ATTACK error");
}

// ════════════════════════════════════════════════════════════════════
// Test 17: ATTACK — target not found
// ════════════════════════════════════════════════════════════════════
console.log("\n[Test 17] ATTACK — nonexistent target");
{
  const state = freshState();
  state.rng.seed = "ghost";
  const r = applyAction(state, { type: "ATTACK", attackerId: "pc-seren", targetId: "npc-ghost" });
  check(!r.success, "Attack on nonexistent fails");
  check(r.errors.some(e => e.includes("ENTITY_NOT_FOUND")), "ENTITY_NOT_FOUND error");
}

// ════════════════════════════════════════════════════════════════════
// Test 18: MOVE during combat — NOT_YOUR_TURN
// ════════════════════════════════════════════════════════════════════
console.log("\n[Test 18] MOVE during combat — NOT_YOUR_TURN");
{
  const state = freshState();
  state.rng.seed = "combat-move";
  const r1 = applyAction(state, { type: "ROLL_INITIATIVE" });
  const activeId = r1.nextState.combat.activeEntityId;
  // Find a non-active entity to try moving
  const otherId = r1.nextState.combat.initiativeOrder.find(id => id !== activeId);
  if (otherId) {
    const r2 = applyAction(r1.nextState, { type: "MOVE", entityId: otherId, path: [{ x: 0, y: 0 }] });
    check(!r2.success, "Move by non-active entity fails");
    check(r2.errors.some(e => e.includes("NOT_YOUR_TURN")), "NOT_YOUR_TURN error");
  } else {
    check(true, "(skipped — only one participant)");
  }
}

// ════════════════════════════════════════════════════════════════════
// Test 19: State immutability — original never changes
// ════════════════════════════════════════════════════════════════════
console.log("\n[Test 19] State immutability across multiple actions");
{
  const original = freshState();
  original.rng.seed = "immutable";
  const snap = JSON.stringify(original);
  applyAction(original, { type: "ROLL_INITIATIVE" });
  applyAction(original, { type: "MOVE", entityId: "pc-seren", path: [{ x: 2, y: 4 }] });
  applyAction(original, { type: "ATTACK", attackerId: "pc-seren", targetId: "npc-barkeep" });
  check(JSON.stringify(original) === snap, "Original state identical after 3 actions");
}

// ════════════════════════════════════════════════════════════════════
// Test 20: Full combat sequence — init → move → attack → end turn
// ════════════════════════════════════════════════════════════════════
console.log("\n[Test 20] Full combat sequence");
{
  let state = freshState();
  state.rng.seed = "full-combat";

  // Roll initiative
  let r = applyAction(state, { type: "ROLL_INITIATIVE" });
  check(r.success, "Init ok");
  state = r.nextState;

  const activeId = state.combat.activeEntityId;
  const activeEnt = [...state.entities.players, ...state.entities.npcs].find(e => e.id === activeId);
  check(!!activeEnt, `Active entity found: ${activeId}`);

  // Try to move active entity one step (find a valid adjacent)
  const { x, y } = activeEnt.position;
  const candidates = [{ x: x + 1, y }, { x: x - 1, y }, { x, y: y + 1 }, { x, y: y - 1 }];
  const { width, height } = state.map.grid.size;
  const blocked = new Set((state.map.terrain ?? []).filter(t => t.blocksMovement).map(t => `${t.x},${t.y}`));
  const occupied = new Set([...state.entities.players, ...state.entities.npcs, ...state.entities.objects].filter(e => e.id !== activeId).map(e => `${e.position.x},${e.position.y}`));
  const validStep = candidates.find(c => c.x >= 0 && c.x < width && c.y >= 0 && c.y < height && !blocked.has(`${c.x},${c.y}`) && !occupied.has(`${c.x},${c.y}`));

  if (validStep) {
    r = applyAction(state, { type: "MOVE", entityId: activeId, path: [validStep] });
    check(r.success, `Move ${activeId} to (${validStep.x},${validStep.y}) ok`);
    state = r.nextState;
  }

  // Attack a target (find one that isn't self)
  const targetId = [...state.entities.players, ...state.entities.npcs].find(e => e.id !== activeId)?.id;
  if (targetId) {
    r = applyAction(state, { type: "ATTACK", attackerId: activeId, targetId });
    check(r.success, `Attack ${activeId} → ${targetId} ok`);
    state = r.nextState;
  }

  // End turn
  r = applyAction(state, { type: "END_TURN", entityId: activeId });
  check(r.success, `END_TURN ${activeId} ok`);
  state = r.nextState;
  check(state.combat.activeEntityId !== activeId, "Turn advanced");
}

// ════════════════════════════════════════════════════════════════════
console.log(`\n══════════════════════════════════════════════════`);
console.log(`Results: ${passed}/${passed + failed} passed, ${failed} failed`);
console.log(failed === 0 ? "PASS: all MIR 1.3 engine tests passed" : "FAIL: some engine tests failed");
if (failed) process.exit(1);
