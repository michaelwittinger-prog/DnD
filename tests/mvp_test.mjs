/**
 * mvp_test.mjs — MIR 4.1 MVP Integration Tests.
 *
 * Confirms:
 *   1. start:mvp script exists and references correct files
 *   2. demoEncounter validates schema and invariants
 *   3. demoEncounter has 2 PCs, 2 NPCs, blocked terrain
 *   4. Replay bundles still pass deterministically
 *   5. Demo encounter works with engine (full combat sequence)
 */

import { readFileSync, existsSync } from "node:fs";
import { demoEncounter, explorationExample } from "../src/state/exampleStates.mjs";
import { applyAction } from "../src/engine/applyAction.mjs";
import { runReplay } from "../src/replay/runReplay.mjs";

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}`);
    failed++;
  }
}

console.log(`\n╔══════════════════════════════════════╗`);
console.log(`║  MIR 4.1 — MVP Integration Tests      ║`);
console.log(`╚══════════════════════════════════════╝\n`);

// ── Test 1: start:mvp script exists and references correct files ────

console.log("[Test 1] start:mvp script exists and references correct files");
{
  const pkg = JSON.parse(readFileSync("package.json", "utf-8"));
  assert(pkg.scripts["start:mvp"] != null, "start:mvp script exists in package.json");
  assert(pkg.scripts["start:mvp"].includes("start-mvp"), "references start-mvp script");

  const scriptExists = existsSync("scripts/start-mvp.mjs");
  assert(scriptExists, "scripts/start-mvp.mjs file exists");

  const scriptContent = readFileSync("scripts/start-mvp.mjs", "utf-8");
  assert(scriptContent.includes("serve.mjs"), "script references UI server (serve.mjs)");
  assert(scriptContent.includes("aiBridge.mjs"), "script references AI bridge (aiBridge.mjs)");
  assert(scriptContent.includes("3001") || scriptContent.includes("UI"), "script mentions UI port or label");
  assert(scriptContent.includes("3002") || scriptContent.includes("AI"), "script mentions AI port or label");
}

// ── Test 2: demoEncounter validates schema shape and invariants ──────

console.log("\n[Test 2] demoEncounter validates schema shape and invariants");
{
  const s = demoEncounter;
  assert(s.schemaVersion === "0.1.0", "schemaVersion is 0.1.0");
  assert(typeof s.campaignId === "string", "campaignId is string");
  assert(typeof s.sessionId === "string", "sessionId is string");
  assert(typeof s.timestamp === "string", "timestamp is string");
  assert(s.rng && s.rng.mode === "seeded", "RNG is seeded");
  assert(typeof s.rng.seed === "string", "RNG seed is string");
  assert(s.map && s.map.grid, "map with grid exists");
  assert(s.entities.players.length > 0, "has players");
  assert(s.entities.npcs.length > 0, "has NPCs");
  assert(s.combat && s.combat.mode, "combat section exists");
  assert(s.log && Array.isArray(s.log.events), "log.events is array");
  assert(s.ui != null, "ui section exists");

  // Invariant: no duplicate IDs
  const allIds = [
    ...s.entities.players.map((e) => e.id),
    ...s.entities.npcs.map((e) => e.id),
    ...s.entities.objects.map((e) => e.id),
  ];
  const uniqueIds = new Set(allIds);
  assert(uniqueIds.size === allIds.length, "no duplicate entity IDs");

  // Invariant: all entities in bounds
  const { width, height } = s.map.grid.size;
  const allEnts = [...s.entities.players, ...s.entities.npcs, ...s.entities.objects];
  const allInBounds = allEnts.every(
    (e) => e.position.x >= 0 && e.position.x < width && e.position.y >= 0 && e.position.y < height
  );
  assert(allInBounds, "all entities in map bounds");

  // Invariant: no entity on blocked cell
  const blockedSet = new Set(
    s.map.terrain.filter((t) => t.blocksMovement).map((t) => `${t.x},${t.y}`)
  );
  const noneBlocked = allEnts.every((e) => !blockedSet.has(`${e.position.x},${e.position.y}`));
  assert(noneBlocked, "no entity on blocked cell");
}

// ── Test 3: demoEncounter has 2 PCs, 2 NPCs, blocked terrain ────────

console.log("\n[Test 3] demoEncounter has 2 PCs, 2 NPCs, blocked terrain");
{
  const s = demoEncounter;
  assert(s.entities.players.length === 2, `2 PCs (got ${s.entities.players.length})`);
  assert(s.entities.npcs.length === 2, `2 NPCs (got ${s.entities.npcs.length})`);

  const blockedTerrain = s.map.terrain.filter((t) => t.blocksMovement);
  assert(blockedTerrain.length >= 1, `at least 1 blocked terrain (got ${blockedTerrain.length})`);

  // Check names are consistent
  assert(s.entities.players[0].name === "Seren Ashford", "PC1 is Seren Ashford");
  assert(s.entities.players[1].name === "Miri Thistledown", "PC2 is Miri Thistledown");
  assert(typeof s.entities.npcs[0].name === "string" && s.entities.npcs[0].name.length > 0, "NPC1 has name");
  assert(typeof s.entities.npcs[1].name === "string" && s.entities.npcs[1].name.length > 0, "NPC2 has name");
}

// ── Test 4: Replay bundles still pass deterministically ─────────────

console.log("\n[Test 4] Replay bundles still pass deterministically");
{
  const combatBundle = JSON.parse(readFileSync("replays/combat_flow.replay.json", "utf-8"));
  const r1 = runReplay(combatBundle);
  assert(r1.ok, "combat_flow.replay passes");
  assert(r1.stepsRun === 4, `combat_flow: 4 steps (got ${r1.stepsRun})`);

  const rejectedBundle = JSON.parse(readFileSync("replays/rejected_move.replay.json", "utf-8"));
  const r2 = runReplay(rejectedBundle);
  assert(r2.ok, "rejected_move.replay passes");
  assert(r2.stepsRun === 2, `rejected_move: 2 steps (got ${r2.stepsRun})`);

  // Run combat_flow again → same hash (determinism)
  const r1b = runReplay(combatBundle);
  assert(r1b.finalStateHash === r1.finalStateHash, "combat_flow hash is deterministic");
}

// ── Test 5: Demo encounter works with engine (full combat sequence) ──

console.log("\n[Test 5] Demo encounter full combat sequence via engine");
{
  let s = structuredClone(demoEncounter);

  // Move Seren
  const moveResult = applyAction(s, { type: "MOVE", entityId: "pc-seren", path: [{ x: 2, y: 4 }] });
  assert(moveResult.success, "MOVE pc-seren succeeds");
  s = moveResult.nextState;

  // Roll initiative
  const initResult = applyAction(s, { type: "ROLL_INITIATIVE" });
  assert(initResult.success, "ROLL_INITIATIVE succeeds");
  s = initResult.nextState;
  assert(s.combat.mode === "combat", "mode is combat");
  assert(s.combat.initiativeOrder.length >= 4, `initiative has 4+ entities (got ${s.combat.initiativeOrder.length})`);

  // Attack from active entity
  const active = s.combat.activeEntityId;
  const targets = s.combat.initiativeOrder.filter((id) => id !== active);
  // Move attacker adjacent to target for melee range
  const allEnts = [...s.entities.players, ...s.entities.npcs];
  const targetEnt = allEnts.find(e => e.id === targets[0]);
  const activeEnt = allEnts.find(e => e.id === active);
  activeEnt.position = { x: targetEnt.position.x - 1, y: targetEnt.position.y };
  const atkResult = applyAction(s, { type: "ATTACK", attackerId: active, targetId: targets[0] });
  assert(atkResult.success, `ATTACK ${active} → ${targets[0]} succeeds`);
  s = atkResult.nextState;

  // End turn
  const endResult = applyAction(s, { type: "END_TURN", entityId: active });
  assert(endResult.success, "END_TURN succeeds");
  s = endResult.nextState;
  assert(s.combat.activeEntityId !== active, "turn advanced to next entity");

  // Rejected move (blocked cell)
  const blocked = s.map.terrain.find((t) => t.blocksMovement);
  if (blocked) {
    const next = s.combat.activeEntityId;
    const badMove = applyAction(s, { type: "MOVE", entityId: next, path: [{ x: blocked.x, y: blocked.y }] });
    assert(!badMove.success, "move into blocked cell rejected");
    const rejEvt = badMove.events?.[0];
    assert(rejEvt?.type === "ACTION_REJECTED", "rejection event generated");
  }
}

// ── Summary ─────────────────────────────────────────────────────────

console.log(`\n══════════════════════════════════════════════════`);
console.log(`Results: ${passed}/${passed + failed} passed, ${failed} failed`);
if (failed === 0) {
  console.log("PASS: all MIR 4.1 MVP tests passed");
} else {
  console.log("FAIL: some tests failed");
  process.exit(1);
}
