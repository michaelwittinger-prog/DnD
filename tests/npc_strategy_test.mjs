/**
 * npc_strategy_test.mjs — MIR NPC Auto-Turn Strategy Tests.
 *
 * Tests: planNpcTurn, isNpc, isNpcTurn, action plan correctness.
 */

import { planNpcTurn, isNpc, isNpcTurn } from "../src/engine/npcTurnStrategy.mjs";
import { applyAction } from "../src/engine/applyAction.mjs";
import { explorationExample } from "../src/state/exampleStates.mjs";

console.log("\n╔══════════════════════════════════════╗");
console.log("║  MIR S0.6 — NPC Strategy Tests         ║");
console.log("╚══════════════════════════════════════╝\n");

let passed = 0, failed = 0;
const check = (c, l) => { if (c) { console.log(`  ✅ ${l}`); passed++; } else { console.log(`  ❌ ${l}`); failed++; } };

// ── Helper: minimal state for NPC strategy testing ──────────────────
function minState(width, height, blocked, entities) {
  return {
    schemaVersion: "0.1.0",
    campaignId: "test", sessionId: "test",
    timestamp: new Date().toISOString(),
    map: {
      grid: { size: { width, height } },
      terrain: (blocked || []).map(([x, y]) => ({ x, y, type: "blocked", blocksMovement: true })),
    },
    entities: {
      players: entities.filter(e => e.kind === "player"),
      npcs: entities.filter(e => e.kind === "npc"),
      objects: [],
    },
    combat: { mode: "exploration", round: 0, activeEntityId: null, initiativeOrder: [] },
    rng: { mode: "seeded", seed: "strat-test", lastRolls: [] },
    log: { events: [] },
    ui: { selectedEntityId: null, hoveredCell: null },
  };
}

function makeEnt(id, kind, x, y, speed = 6) {
  return {
    id, kind, name: id, position: { x, y },
    stats: { hpCurrent: 10, hpMax: 10, ac: 10, movementSpeed: speed, attackBonus: 5, damageDice: "1d6" },
    conditions: [],
  };
}

// ════════════════════════════════════════════════════════════════════
// Test 1: NPC adjacent to player → ATTACK + END_TURN
// ════════════════════════════════════════════════════════════════════
console.log("[Test 1] Adjacent to hostile → ATTACK + END_TURN");
{
  const state = minState(10, 10, [], [
    makeEnt("npc-a", "npc", 3, 3),
    makeEnt("pc-a", "player", 3, 4),
  ]);
  const plan = planNpcTurn(state, "npc-a");
  check(plan.actions.length === 2, `2 actions (got ${plan.actions.length})`);
  check(plan.actions[0].type === "ATTACK", "First action is ATTACK");
  check(plan.actions[0].attackerId === "npc-a", "Attacker is npc-a");
  check(plan.actions[0].targetId === "pc-a", "Target is pc-a");
  check(plan.actions[1].type === "END_TURN", "Second action is END_TURN");
  check(plan.reasoning.includes("Adjacent"), "Reasoning mentions adjacent");
}

// ════════════════════════════════════════════════════════════════════
// Test 2: NPC far from player → MOVE + END_TURN (or MOVE + ATTACK + END_TURN)
// ════════════════════════════════════════════════════════════════════
console.log("\n[Test 2] Far from hostile → MOVE toward + END_TURN");
{
  // NPC with speed 6 can path toward player 10 away (won't reach adjacent but moves 6 steps)
  const state = minState(20, 20, [], [
    makeEnt("npc-a", "npc", 0, 0, 6),
    makeEnt("pc-a", "player", 5, 0), // 5 away, speed 6, can reach adjacent (4 steps)
  ]);
  const plan = planNpcTurn(state, "npc-a");
  check(plan.actions.length >= 2, `At least 2 actions (got ${plan.actions.length})`);
  check(plan.actions[0].type === "MOVE", "First action is MOVE");
  check(plan.actions[0].entityId === "npc-a", "Mover is npc-a");
  check(plan.actions[0].path.length > 0, "Path has steps");
  check(plan.actions[0].path.length <= 6, `Path within speed (${plan.actions[0].path.length})`);
  check(plan.actions[plan.actions.length - 1].type === "END_TURN", "Last action is END_TURN");
  check(plan.reasoning.includes("Moving"), "Reasoning mentions moving");
}

// ════════════════════════════════════════════════════════════════════
// Test 3: NPC close enough to move adjacent + attack
// ════════════════════════════════════════════════════════════════════
console.log("\n[Test 3] Close enough → MOVE + ATTACK + END_TURN");
{
  const state = minState(10, 10, [], [
    makeEnt("npc-a", "npc", 3, 3, 6),
    makeEnt("pc-a", "player", 3, 6),
  ]);
  const plan = planNpcTurn(state, "npc-a");
  check(plan.actions.length === 3, `3 actions: MOVE+ATTACK+END (got ${plan.actions.length})`);
  check(plan.actions[0].type === "MOVE", "MOVE");
  check(plan.actions[1].type === "ATTACK", "ATTACK");
  check(plan.actions[2].type === "END_TURN", "END_TURN");
  // Verify move ends adjacent to player
  const lastStep = plan.actions[0].path[plan.actions[0].path.length - 1];
  const dist = Math.abs(lastStep.x - 3) + Math.abs(lastStep.y - 6);
  check(dist === 1, `Move ends adjacent to player (dist=${dist})`);
}

// ════════════════════════════════════════════════════════════════════
// Test 4: No hostiles → END_TURN only
// ════════════════════════════════════════════════════════════════════
console.log("\n[Test 4] No hostiles → END_TURN only");
{
  const state = minState(10, 10, [], [
    makeEnt("npc-a", "npc", 3, 3),
    makeEnt("npc-b", "npc", 5, 5), // Another NPC, not hostile
  ]);
  const plan = planNpcTurn(state, "npc-a");
  check(plan.actions.length === 1, "1 action");
  check(plan.actions[0].type === "END_TURN", "Only END_TURN");
  check(plan.reasoning.includes("No hostile"), "Reasoning: no hostile");
}

// ════════════════════════════════════════════════════════════════════
// Test 5: Dead NPC → END_TURN only
// ════════════════════════════════════════════════════════════════════
console.log("\n[Test 5] Dead NPC → END_TURN");
{
  const ent = makeEnt("npc-dead", "npc", 3, 3);
  ent.conditions.push("dead");
  const state = minState(10, 10, [], [
    ent,
    makeEnt("pc-a", "player", 3, 4),
  ]);
  const plan = planNpcTurn(state, "npc-dead");
  check(plan.actions.length === 1, "1 action");
  check(plan.actions[0].type === "END_TURN", "Only END_TURN");
  check(plan.reasoning.includes("dead"), "Reasoning: dead");
}

// ════════════════════════════════════════════════════════════════════
// Test 6: Nonexistent NPC → END_TURN
// ════════════════════════════════════════════════════════════════════
console.log("\n[Test 6] Nonexistent NPC → END_TURN");
{
  const state = minState(10, 10, [], [makeEnt("pc-a", "player", 0, 0)]);
  const plan = planNpcTurn(state, "npc-ghost");
  check(plan.actions.length === 1, "1 action");
  check(plan.actions[0].type === "END_TURN", "Only END_TURN");
}

// ════════════════════════════════════════════════════════════════════
// Test 7: Multiple hostiles → targets nearest
// ════════════════════════════════════════════════════════════════════
console.log("\n[Test 7] Multiple hostiles → targets nearest");
{
  const state = minState(20, 20, [], [
    makeEnt("npc-a", "npc", 5, 5),
    makeEnt("pc-far", "player", 15, 15),
    makeEnt("pc-near", "player", 5, 6),  // adjacent
  ]);
  const plan = planNpcTurn(state, "npc-a");
  check(plan.actions[0].type === "ATTACK", "Attacks the adjacent one");
  check(plan.actions[0].targetId === "pc-near", "Targets nearest (pc-near)");
}

// ════════════════════════════════════════════════════════════════════
// Test 8: Unreachable hostile (blocked) → END_TURN
// ════════════════════════════════════════════════════════════════════
console.log("\n[Test 8] Unreachable hostile → END_TURN");
{
  // Surround the player with walls so NPC can't reach
  const state = minState(10, 10, [
    [4, 4], [4, 6], [3, 5], [5, 5],
  ], [
    makeEnt("npc-a", "npc", 0, 0),
    makeEnt("pc-a", "player", 4, 5),
  ]);
  const plan = planNpcTurn(state, "npc-a");
  check(plan.actions[plan.actions.length - 1].type === "END_TURN", "Ends turn");
  check(plan.reasoning.includes("No reachable"), "Reasoning: no reachable");
}

// ════════════════════════════════════════════════════════════════════
// Test 9: Path around obstacles
// ════════════════════════════════════════════════════════════════════
console.log("\n[Test 9] Path around obstacles");
{
  const state = minState(10, 10, [
    [3, 0], [3, 1], [3, 2], [3, 3], [3, 4],
  ], [
    makeEnt("npc-a", "npc", 2, 2, 10),
    makeEnt("pc-a", "player", 4, 2),
  ]);
  const plan = planNpcTurn(state, "npc-a");
  check(plan.actions[0].type === "MOVE", "Moves around wall");
  // Path should avoid blocked cells
  const path = plan.actions[0].path;
  const blocked = new Set(["3,0", "3,1", "3,2", "3,3", "3,4"]);
  const noBlocked = path.every(s => !blocked.has(`${s.x},${s.y}`));
  check(noBlocked, "Path avoids walls");
}

// ════════════════════════════════════════════════════════════════════
// Test 10: isNpc / isNpcTurn
// ════════════════════════════════════════════════════════════════════
console.log("\n[Test 10] isNpc and isNpcTurn");
{
  const state = minState(10, 10, [], [
    makeEnt("npc-a", "npc", 0, 0),
    makeEnt("pc-a", "player", 1, 0),
  ]);
  check(isNpc(state, "npc-a") === true, "npc-a is NPC");
  check(isNpc(state, "pc-a") === false, "pc-a is not NPC");
  check(isNpc(state, "ghost") === false, "ghost is not NPC");

  // Not in combat → not NPC turn
  check(isNpcTurn(state) === false, "Exploration → not NPC turn");

  // In combat with NPC active
  state.combat.mode = "combat";
  state.combat.activeEntityId = "npc-a";
  state.combat.round = 1;
  state.combat.initiativeOrder = ["npc-a", "pc-a"];
  check(isNpcTurn(state) === true, "NPC active → NPC turn");

  // In combat with player active
  state.combat.activeEntityId = "pc-a";
  check(isNpcTurn(state) === false, "Player active → not NPC turn");
}

// ════════════════════════════════════════════════════════════════════
// Test 11: Plan actions are well-formed
// ════════════════════════════════════════════════════════════════════
console.log("\n[Test 11] Action shapes are valid");
{
  const state = minState(10, 10, [], [
    makeEnt("npc-a", "npc", 0, 0, 6),
    makeEnt("pc-a", "player", 3, 0),
  ]);
  const plan = planNpcTurn(state, "npc-a");
  for (const action of plan.actions) {
    check(typeof action.type === "string", `Action has type: ${action.type}`);
    if (action.type === "MOVE") {
      check(typeof action.entityId === "string", "MOVE has entityId");
      check(Array.isArray(action.path), "MOVE has path array");
      check(action.path.every(s => typeof s.x === "number" && typeof s.y === "number"), "Path steps valid");
    }
    if (action.type === "ATTACK") {
      check(typeof action.attackerId === "string", "ATTACK has attackerId");
      check(typeof action.targetId === "string", "ATTACK has targetId");
    }
    if (action.type === "END_TURN") {
      check(typeof action.entityId === "string", "END_TURN has entityId");
    }
  }
}

// ════════════════════════════════════════════════════════════════════
// Test 12: Plan executes through applyAction without errors
// ════════════════════════════════════════════════════════════════════
console.log("\n[Test 12] Plan executes via applyAction");
{
  // Use full schema-valid state for engine execution
  const state = structuredClone(explorationExample);
  state.combat.mode = "combat";
  state.combat.round = 1;
  state.combat.initiativeOrder = ["npc-barkeep", "pc-seren", "pc-miri"];
  state.combat.activeEntityId = "npc-barkeep";

  const plan = planNpcTurn(state, "npc-barkeep");
  let s = state;
  let allOk = true;
  for (const action of plan.actions) {
    const r = applyAction(s, action);
    if (!r.success) {
      console.log(`  ⚠️ Action ${action.type} failed: ${r.errors?.join("; ")}`);
      allOk = false;
      break;
    }
    s = r.nextState;
  }
  check(allOk, "All planned actions executed successfully");
}

// ════════════════════════════════════════════════════════════════════
// Test 13: Plan on real game state (explorationExample)
// ════════════════════════════════════════════════════════════════════
console.log("\n[Test 13] Plan on real game state");
{
  const state = structuredClone(explorationExample);
  const plan = planNpcTurn(state, "npc-barkeep");
  check(plan.actions.length > 0, `Has actions (got ${plan.actions.length})`);
  check(plan.actions[plan.actions.length - 1].type === "END_TURN", "Always ends with END_TURN");
  check(typeof plan.reasoning === "string", "Has reasoning string");
  check(plan.reasoning.length > 0, "Reasoning not empty");
}

// ════════════════════════════════════════════════════════════════════
// Test 14: Dead hostile not targeted
// ════════════════════════════════════════════════════════════════════
console.log("\n[Test 14] Dead hostile not targeted");
{
  const deadPlayer = makeEnt("pc-dead", "player", 3, 4);
  deadPlayer.conditions.push("dead");
  const state = minState(10, 10, [], [
    makeEnt("npc-a", "npc", 3, 3, 8),
    deadPlayer,
    makeEnt("pc-alive", "player", 6, 3),
  ]);
  const plan = planNpcTurn(state, "npc-a");
  // Should NOT attack dead player even though adjacent
  const attacks = plan.actions.filter(a => a.type === "ATTACK");
  if (attacks.length > 0) {
    check(attacks[0].targetId !== "pc-dead", "Does not target dead player");
    check(attacks[0].targetId === "pc-alive", "Targets alive player");
  } else {
    // Moves toward alive player
    check(plan.actions[0].type === "MOVE", "Moves toward alive player");
  }
}

// ════════════════════════════════════════════════════════════════════
console.log(`\n══════════════════════════════════════════════════`);
console.log(`Results: ${passed}/${passed + failed} passed, ${failed} failed`);
console.log(failed === 0 ? "PASS: all NPC Strategy tests passed" : "FAIL: some NPC Strategy tests failed");
if (failed) process.exit(1);
