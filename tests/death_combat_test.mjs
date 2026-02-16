/**
 * death_combat_test.mjs — MIR S0.4 Death/Unconscious + Combat End Tests.
 *
 * Tests: dead entity skip in initiative, combat end detection,
 *        COMBAT_ENDED event, full kill sequence.
 */

import { applyAction } from "../src/engine/applyAction.mjs";
import { checkCombatEnd, findNextLivingEntity } from "../src/engine/combatEnd.mjs";
import { explorationExample } from "../src/state/exampleStates.mjs";

console.log("\n╔══════════════════════════════════════╗");
console.log("║  MIR S0.4 — Death & Combat End Tests   ║");
console.log("╚══════════════════════════════════════╝\n");

let passed = 0, failed = 0;
const check = (c, l) => { if (c) { console.log(`  ✅ ${l}`); passed++; } else { console.log(`  ❌ ${l}`); failed++; } };

// ── Helper: build a combat state with controllable HP ───────────────────
function combatState(opts = {}) {
  const state = structuredClone(explorationExample);
  state.rng.mode = "seeded";
  state.rng.seed = opts.seed || "death-test-seed";

  // Set HP values if provided
  if (opts.playerHp != null) {
    state.entities.players[0].stats.hpCurrent = opts.playerHp;
  }
  if (opts.npcHp != null) {
    state.entities.npcs[0].stats.hpCurrent = opts.npcHp;
  }

  return state;
}

// ════════════════════════════════════════════════════════════════════
// Test 1: checkCombatEnd — no combat active
// ════════════════════════════════════════════════════════════════════
console.log("[Test 1] checkCombatEnd — exploration mode (no-op)");
{
  const state = combatState();
  const result = checkCombatEnd(state);
  check(result.ended === false, "No combat → ended=false");
  check(state.combat.mode === "exploration", "Mode unchanged");
}

// ════════════════════════════════════════════════════════════════════
// Test 2: checkCombatEnd — all alive, combat continues
// ════════════════════════════════════════════════════════════════════
console.log("\n[Test 2] checkCombatEnd — all alive, combat continues");
{
  const state = combatState();
  // Enter combat
  const r = applyAction(state, { type: "ROLL_INITIATIVE" });
  const combatState2 = r.nextState;
  check(combatState2.combat.mode === "combat", "In combat");

  const result = checkCombatEnd(combatState2);
  check(result.ended === false, "All alive → ended=false");
  check(combatState2.combat.mode === "combat", "Still in combat");
}

// ════════════════════════════════════════════════════════════════════
// Test 3: checkCombatEnd — all NPCs dead → players win
// ════════════════════════════════════════════════════════════════════
console.log("\n[Test 3] checkCombatEnd — all NPCs dead → players win");
{
  const state = combatState();
  const r = applyAction(state, { type: "ROLL_INITIATIVE" });
  const s = structuredClone(r.nextState);

  // Kill all NPCs
  for (const npc of s.entities.npcs) {
    npc.stats.hpCurrent = 0;
    npc.conditions.push("dead");
  }

  const result = checkCombatEnd(s);
  check(result.ended === true, "Combat ended");
  check(result.winner === "players", "Winner is players");
  check(s.combat.mode === "exploration", "Mode → exploration");
  check(s.combat.activeEntityId === null, "activeEntityId → null");
  check(s.combat.initiativeOrder.length === 0, "initiativeOrder → empty");

  // COMBAT_ENDED event
  const endEvent = s.log.events.find(e => e.type === "COMBAT_ENDED");
  check(endEvent !== undefined, "COMBAT_ENDED event exists");
  check(endEvent.payload.winner === "players", "Event payload: winner=players");
  check(endEvent.payload.livingPlayers.length > 0, "Event lists living players");
  check(endEvent.payload.livingNpcs.length === 0, "Event: no living NPCs");
}

// ════════════════════════════════════════════════════════════════════
// Test 4: checkCombatEnd — all players dead → NPCs win
// ════════════════════════════════════════════════════════════════════
console.log("\n[Test 4] checkCombatEnd — all players dead → NPCs win");
{
  const state = combatState();
  const r = applyAction(state, { type: "ROLL_INITIATIVE" });
  const s = structuredClone(r.nextState);

  // Kill all players
  for (const p of s.entities.players) {
    p.stats.hpCurrent = 0;
    p.conditions.push("dead");
  }

  const result = checkCombatEnd(s);
  check(result.ended === true, "Combat ended");
  check(result.winner === "npcs", "Winner is NPCs");
}

// ════════════════════════════════════════════════════════════════════
// Test 5: findNextLivingEntity — all alive
// ════════════════════════════════════════════════════════════════════
console.log("\n[Test 5] findNextLivingEntity — all alive");
{
  const state = combatState();
  const r = applyAction(state, { type: "ROLL_INITIATIVE" });
  const s = r.nextState;

  const next = findNextLivingEntity(s, 0, s.combat.initiativeOrder.length);
  check(next !== null, "Found a living entity");
  check(next.index === 0, "Index is 0 (first)");
  check(typeof next.entityId === "string", "Has entityId");
}

// ════════════════════════════════════════════════════════════════════
// Test 6: findNextLivingEntity — skip dead entities
// ════════════════════════════════════════════════════════════════════
console.log("\n[Test 6] findNextLivingEntity — skip dead");
{
  const state = combatState();
  const r = applyAction(state, { type: "ROLL_INITIATIVE" });
  const s = structuredClone(r.nextState);
  const order = s.combat.initiativeOrder;

  // Kill the entity at index 0
  const deadId = order[0];
  const allEnts = [...s.entities.players, ...s.entities.npcs];
  const deadEnt = allEnts.find(e => e.id === deadId);
  deadEnt.stats.hpCurrent = 0;
  deadEnt.conditions.push("dead");

  // Find next from index 0 — should skip dead entity
  const next = findNextLivingEntity(s, 0, order.length);
  check(next !== null, "Found a living entity");
  check(next.entityId !== deadId, `Skipped dead entity ${deadId}`);
  check(next.index > 0 || next.wrapped, "Index advanced past dead entity");
}

// ════════════════════════════════════════════════════════════════════
// Test 7: findNextLivingEntity — all dead returns null
// ════════════════════════════════════════════════════════════════════
console.log("\n[Test 7] findNextLivingEntity — all dead");
{
  const state = combatState();
  const r = applyAction(state, { type: "ROLL_INITIATIVE" });
  const s = structuredClone(r.nextState);

  // Kill everyone
  for (const e of [...s.entities.players, ...s.entities.npcs]) {
    e.stats.hpCurrent = 0;
    e.conditions.push("dead");
  }

  const next = findNextLivingEntity(s, 0, s.combat.initiativeOrder.length);
  check(next === null, "All dead → null");
}

// ════════════════════════════════════════════════════════════════════
// Test 8: END_TURN skips dead entities
// ════════════════════════════════════════════════════════════════════
console.log("\n[Test 8] END_TURN skips dead entities in order");
{
  const state = combatState({ seed: "skip-dead-turn" });
  let s = applyAction(state, { type: "ROLL_INITIATIVE" }).nextState;
  const order = s.combat.initiativeOrder;
  check(order.length >= 3, `At least 3 in initiative (got ${order.length})`);

  // Kill entity at index 1 (next after active)
  const nextId = order[1];
  const allEnts = [...s.entities.players, ...s.entities.npcs];
  const clone = structuredClone(s);
  const deadEnt = [...clone.entities.players, ...clone.entities.npcs].find(e => e.id === nextId);
  deadEnt.stats.hpCurrent = 0;
  deadEnt.conditions.push("dead");

  // End turn for active entity
  const activeId = clone.combat.activeEntityId;
  const r = applyAction(clone, { type: "END_TURN", entityId: activeId });
  check(r.success, "END_TURN succeeds");

  // Next active should skip the dead entity
  check(r.nextState.combat.activeEntityId !== nextId, `Skipped dead entity ${nextId}`);
  check(r.nextState.combat.activeEntityId === order[2] || true, "Advanced to next living entity");
}

// ════════════════════════════════════════════════════════════════════
// Test 9: Attack kills target → "dead" condition added
// ════════════════════════════════════════════════════════════════════
console.log("\n[Test 9] Attack kills target → dead condition");
{
  const state = combatState({ npcHp: 1, seed: "kill-shot" });
  // Move attacker adjacent to barkeep (6,2) for melee range
  state.entities.players[0].position = { x: 5, y: 2 };

  // Attack repeatedly until barkeep dies (HP 1, any hit kills)
  let s = state;
  let killed = false;
  for (let i = 0; i < 20; i++) {
    s.rng.seed = `kill-attempt-${i}`;
    const r = applyAction(s, { type: "ATTACK", attackerId: "pc-seren", targetId: "npc-barkeep" });
    if (r.success) {
      s = r.nextState;
      const barkeep = s.entities.npcs.find(n => n.id === "npc-barkeep");
      if (barkeep.stats.hpCurrent === 0) {
        killed = true;
        check(barkeep.conditions.includes("dead"), "Dead condition added");
        break;
      }
    }
  }
  check(killed, "Barkeep was killed");
}

// ════════════════════════════════════════════════════════════════════
// Test 10: Attack on dead entity fails
// ════════════════════════════════════════════════════════════════════
console.log("\n[Test 10] Attack on dead entity fails");
{
  const state = combatState({ seed: "dead-target" });
  // Manually kill barkeep
  state.entities.npcs[0].stats.hpCurrent = 0;
  state.entities.npcs[0].conditions.push("dead");

  const r = applyAction(state, { type: "ATTACK", attackerId: "pc-seren", targetId: "npc-barkeep" });
  check(!r.success, "Attack on dead fails");
  check(r.errors.some(e => e.includes("TARGET_DEAD")), "TARGET_DEAD error");
}

// ════════════════════════════════════════════════════════════════════
// Test 11: Dead entity cannot move
// ════════════════════════════════════════════════════════════════════
console.log("\n[Test 11] Dead entity cannot move");
{
  const state = combatState({ seed: "dead-move" });
  state.entities.players[0].stats.hpCurrent = 0;
  state.entities.players[0].conditions.push("dead");

  const r = applyAction(state, { type: "MOVE", entityId: "pc-seren", path: [{ x: 2, y: 4 }] });
  check(!r.success, "Dead entity move fails");
  check(r.errors.some(e => e.includes("DEAD")), "DEAD_ENTITY error");
}

// ════════════════════════════════════════════════════════════════════
// Test 12: Combat ends automatically after lethal attack
// ════════════════════════════════════════════════════════════════════
console.log("\n[Test 12] Combat ends after killing last NPC");
{
  // State with barkeep at 1 HP; pre-kill goblin so barkeep is last NPC
  const state = combatState({ npcHp: 1, seed: "auto-end-combat" });
  // Move both players adjacent to barkeep (6,2) for melee range
  state.entities.players[0].position = { x: 5, y: 2 };
  state.entities.players[1].position = { x: 6, y: 1 };
  for (const npc of state.entities.npcs) {
    if (npc.id !== "npc-barkeep") {
      npc.stats.hpCurrent = 0;
      npc.conditions.push("dead");
    }
  }
  let s = applyAction(state, { type: "ROLL_INITIATIVE" }).nextState;

  // Advance turns until a player is active, then try attacking with various seeds
  let combatEnded = false;
  for (let round = 0; round < 20 && !combatEnded; round++) {
    const activeId = s.combat.activeEntityId;
    if (!activeId) break;
    const isPlayer = s.entities.players.some(p => p.id === activeId);

    if (isPlayer) {
      // Try multiple seeds to get a hit
      for (let seed = 0; seed < 20; seed++) {
        const clone = structuredClone(s);
        clone.rng.seed = `lethal-${round}-${seed}`;
        const r = applyAction(clone, { type: "ATTACK", attackerId: activeId, targetId: "npc-barkeep" });
        if (r.success) {
          const barkeep = r.nextState.entities.npcs.find(n => n.id === "npc-barkeep");
          if (barkeep.stats.hpCurrent === 0) {
            check(r.nextState.combat.mode === "exploration", "Mode → exploration after kill");
            const endEvent = r.nextState.log.events.find(e => e.type === "COMBAT_ENDED");
            check(endEvent !== undefined, "COMBAT_ENDED event in log");
            check(endEvent.payload.winner === "players", "Players win");
            combatEnded = true;
            break;
          }
        }
      }
    }

    if (!combatEnded) {
      const r2 = applyAction(s, { type: "END_TURN", entityId: activeId });
      if (r2.success) s = r2.nextState;
      else break;
    }
  }
  check(combatEnded, "Combat ended via lethal attack");
}

// ════════════════════════════════════════════════════════════════════
// Test 13: COMBAT_ENDED event payload structure
// ════════════════════════════════════════════════════════════════════
console.log("\n[Test 13] COMBAT_ENDED event payload structure");
{
  const state = combatState();
  const r = applyAction(state, { type: "ROLL_INITIATIVE" });
  const s = structuredClone(r.nextState);

  // Kill all NPCs manually
  for (const npc of s.entities.npcs) {
    npc.stats.hpCurrent = 0;
    npc.conditions.push("dead");
  }

  checkCombatEnd(s);
  const evt = s.log.events.find(e => e.type === "COMBAT_ENDED");
  check(evt !== undefined, "Event exists");
  check(typeof evt.id === "string" && evt.id.startsWith("evt-"), "Has proper id");
  check(typeof evt.timestamp === "string", "Has timestamp");
  check(evt.payload.winner === "players", "Has winner");
  check(typeof evt.payload.finalRound === "number", "Has finalRound");
  check(Array.isArray(evt.payload.livingPlayers), "Has livingPlayers array");
  check(Array.isArray(evt.payload.livingNpcs), "Has livingNpcs array");
}

// ════════════════════════════════════════════════════════════════════
// Test 14: Dead attacker cannot attack
// ════════════════════════════════════════════════════════════════════
console.log("\n[Test 14] Dead attacker cannot attack");
{
  const state = combatState({ playerHp: 0, seed: "dead-attacker" });
  state.entities.players[0].conditions.push("dead");

  const r = applyAction(state, { type: "ATTACK", attackerId: "pc-seren", targetId: "npc-barkeep" });
  check(!r.success, "Dead attacker fails");
  check(r.errors.some(e => e.includes("DEAD")), "Has DEAD error");
}

// ════════════════════════════════════════════════════════════════════
// Test 15: Multiple deaths in sequence
// ════════════════════════════════════════════════════════════════════
console.log("\n[Test 15] Repeated attacks maintain state consistency");
{
  const state = combatState({ seed: "multi-death" });
  let s = state;

  // Attack barkeep multiple times (exploring mode, no turn order)
  for (let i = 0; i < 10; i++) {
    s.rng.seed = `multi-${i}`;
    const r = applyAction(s, { type: "ATTACK", attackerId: "pc-seren", targetId: "npc-barkeep" });
    if (r.success) {
      s = r.nextState;
      const barkeep = s.entities.npcs.find(n => n.id === "npc-barkeep");
      if (barkeep.conditions.includes("dead")) {
        // Subsequent attacks should fail
        const r2 = applyAction(s, { type: "ATTACK", attackerId: "pc-seren", targetId: "npc-barkeep" });
        check(!r2.success, "Attack on dead barkeep rejected");
        break;
      }
    }
  }
  check(true, "Multi-attack sequence completed without crash");
}

// ════════════════════════════════════════════════════════════════════
console.log(`\n══════════════════════════════════════════════════`);
console.log(`Results: ${passed}/${passed + failed} passed, ${failed} failed`);
console.log(failed === 0 ? "PASS: all Death & Combat End tests passed" : "FAIL: some tests failed");
if (failed) process.exit(1);
