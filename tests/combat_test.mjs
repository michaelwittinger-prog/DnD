/**
 * combat_test.mjs — Comprehensive combat state machine test.
 *
 * Covers:
 *   1. start_combat with 4 entities, initiative tie (deterministic sort)
 *   2. end_turn cycling across entities
 *   3. NOT_YOUR_TURN rejection for out-of-turn moves
 *   4. Full 3-round cycle with deterministic expected order
 *   5. COMBAT_ALREADY_ACTIVE rejection
 *   6. COMBAT_NOT_ACTIVE rejection for end_turn without combat
 *   7. END_TURN_WRONG_ENTITY rejection
 *
 * Usage: node tests/combat_test.mjs
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { evaluateProposal, applyAllowedOps } from "../src/rules/rulesEngine.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ── Helpers ────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function assert(cond, label) {
  if (cond) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}`);
    failed++;
  }
}

function loadState() {
  return JSON.parse(readFileSync(resolve(ROOT, "fixtures/state_combat_4entities.json"), "utf8"));
}

function makeAiResponse(stateUpdates, mapUpdates = []) {
  return {
    narration: "Test narration.",
    adjudication: "Test adjudication.",
    map_updates: mapUpdates,
    state_updates: stateUpdates,
    questions: [],
  };
}

// ── Test 1: Start combat with 4 entities + initiative tie ──────────────

console.log("\n╔══════════════════════════════════════╗");
console.log("║    Phase 6.0 — Combat Test Suite      ║");
console.log("╚══════════════════════════════════════╝\n");

console.log("[Test 1] Start combat — 4 entities, initiative tie");
{
  const state = loadState();

  // Initiatives: npc-02=18, pc-01=15, npc-01=15 (TIE!), pc-02=12
  // Tie broken by entity_id lexicographic ascending: npc-01 < pc-01
  // Expected order: npc-02(18), npc-01(15), pc-01(15), pc-02(12)
  const aiResp = makeAiResponse([
    {
      op: "start_combat",
      participants: [
        { entity_id: "pc-01", initiative: 15 },
        { entity_id: "pc-02", initiative: 12 },
        { entity_id: "npc-01", initiative: 15 },
        { entity_id: "npc-02", initiative: 18 },
      ],
    },
  ]);

  const result = evaluateProposal({ state, aiResponse: aiResp });
  assert(result.ok === true, "start_combat passes rules");
  assert(result.violations.length === 0, "no violations");

  const nextState = applyAllowedOps({ state, allowedOps: result.allowedOps });
  assert(nextState.combat !== undefined, "combat object exists");
  assert(nextState.combat.active === true, "combat is active");
  assert(nextState.combat.round === 1, "round is 1");
  assert(nextState.combat.active_index === 0, "active_index is 0");

  // Check deterministic initiative order with tie-breaking
  const order = nextState.combat.initiative_order;
  assert(order[0] === "npc-02", "1st: npc-02 (init 18)");
  assert(order[1] === "npc-01", "2nd: npc-01 (init 15, tie broken by id)");
  assert(order[2] === "pc-01", "3rd: pc-01 (init 15, tie broken by id)");
  assert(order[3] === "pc-02", "4th: pc-02 (init 12)");
}

// ── Test 2: End turn cycling — full 3 rounds ──────────────────────────

console.log("\n[Test 2] End turn cycling — 3 full rounds (12 end_turn calls)");
{
  let state = loadState();

  // Start combat
  const startResp = makeAiResponse([
    {
      op: "start_combat",
      participants: [
        { entity_id: "pc-01", initiative: 15 },
        { entity_id: "pc-02", initiative: 12 },
        { entity_id: "npc-01", initiative: 15 },
        { entity_id: "npc-02", initiative: 18 },
      ],
    },
  ]);
  const startResult = evaluateProposal({ state, aiResponse: startResp });
  state = applyAllowedOps({ state, allowedOps: startResult.allowedOps });

  // Expected order: npc-02, npc-01, pc-01, pc-02
  const expectedOrder = ["npc-02", "npc-01", "pc-01", "pc-02"];

  // 3 rounds × 4 entities = 12 end_turn calls
  for (let round = 1; round <= 3; round++) {
    for (let turn = 0; turn < 4; turn++) {
      const activeId = expectedOrder[turn];
      const expectedRound = round;
      const expectedIndex = turn;

      // Verify active entity
      assert(
        state.combat.initiative_order[state.combat.active_index] === activeId,
        `R${round}T${turn + 1}: active is ${activeId}`
      );
      assert(state.combat.round === expectedRound, `R${round}T${turn + 1}: round=${expectedRound}`);

      // End turn
      const endResp = makeAiResponse([{ op: "end_turn", entity_id: activeId }]);
      const endResult = evaluateProposal({ state, aiResponse: endResp });
      assert(endResult.ok === true, `R${round}T${turn + 1}: end_turn ok`);
      state = applyAllowedOps({ state, allowedOps: endResult.allowedOps });
    }
  }

  // After 3 full rounds (12 end_turns), should be round 4, active_index 0
  assert(state.combat.round === 4, "After 3 rounds: round is 4");
  assert(state.combat.active_index === 0, "After 3 rounds: active_index is 0");
  assert(
    state.combat.initiative_order[0] === "npc-02",
    "After 3 rounds: active entity is npc-02 (back to start)"
  );
}

// ── Test 3: NOT_YOUR_TURN — out-of-turn move rejected ──────────────────

console.log("\n[Test 3] NOT_YOUR_TURN — out-of-turn move rejected");
{
  let state = loadState();

  // Start combat — npc-02 goes first
  const startResp = makeAiResponse([
    {
      op: "start_combat",
      participants: [
        { entity_id: "pc-01", initiative: 15 },
        { entity_id: "pc-02", initiative: 12 },
        { entity_id: "npc-01", initiative: 15 },
        { entity_id: "npc-02", initiative: 18 },
      ],
    },
  ]);
  state = applyAllowedOps({ state, allowedOps: evaluateProposal({ state, aiResponse: startResp }).allowedOps });

  // Active entity is npc-02 (highest initiative)
  assert(state.combat.initiative_order[state.combat.active_index] === "npc-02", "Active: npc-02");

  // Try to move pc-01 (not their turn)
  const moveResp = makeAiResponse([], [
    {
      op: "move_entity",
      entity_id: "pc-01",
      from: { x: 2, y: 3 },
      to: { x: 3, y: 3 },
    },
  ]);
  const moveResult = evaluateProposal({ state, aiResponse: moveResp });
  assert(moveResult.ok === false, "out-of-turn move rejected");
  assert(
    moveResult.violations.some((v) => v.code === "NOT_YOUR_TURN"),
    "NOT_YOUR_TURN violation present"
  );

  // Try to move npc-02 (their turn) — should work
  const legalMove = makeAiResponse([], [
    {
      op: "move_entity",
      entity_id: "npc-02",
      from: { x: 10, y: 5 },
      to: { x: 11, y: 5 },
    },
  ]);
  const legalResult = evaluateProposal({ state, aiResponse: legalMove });
  assert(legalResult.ok === true, "in-turn move by npc-02 passes");
}

// ── Test 4: COMBAT_ALREADY_ACTIVE — cannot start combat twice ──────────

console.log("\n[Test 4] COMBAT_ALREADY_ACTIVE");
{
  let state = loadState();

  // Start combat
  const startResp = makeAiResponse([
    {
      op: "start_combat",
      participants: [
        { entity_id: "pc-01", initiative: 15 },
        { entity_id: "npc-02", initiative: 18 },
      ],
    },
  ]);
  state = applyAllowedOps({ state, allowedOps: evaluateProposal({ state, aiResponse: startResp }).allowedOps });

  // Try to start again
  const secondStart = makeAiResponse([
    {
      op: "start_combat",
      participants: [
        { entity_id: "pc-01", initiative: 10 },
        { entity_id: "npc-01", initiative: 12 },
      ],
    },
  ]);
  const result = evaluateProposal({ state, aiResponse: secondStart });
  assert(result.ok === false, "second start_combat rejected");
  assert(
    result.violations.some((v) => v.code === "COMBAT_ALREADY_ACTIVE"),
    "COMBAT_ALREADY_ACTIVE violation"
  );
}

// ── Test 5: COMBAT_NOT_ACTIVE — cannot end_turn without combat ─────────

console.log("\n[Test 5] COMBAT_NOT_ACTIVE");
{
  const state = loadState();

  const endResp = makeAiResponse([{ op: "end_turn", entity_id: "pc-01" }]);
  const result = evaluateProposal({ state, aiResponse: endResp });
  assert(result.ok === false, "end_turn without combat rejected");
  assert(
    result.violations.some((v) => v.code === "COMBAT_NOT_ACTIVE"),
    "COMBAT_NOT_ACTIVE violation"
  );
}

// ── Test 6: END_TURN_WRONG_ENTITY ──────────────────────────────────────

console.log("\n[Test 6] END_TURN_WRONG_ENTITY");
{
  let state = loadState();

  const startResp = makeAiResponse([
    {
      op: "start_combat",
      participants: [
        { entity_id: "pc-01", initiative: 15 },
        { entity_id: "npc-02", initiative: 18 },
      ],
    },
  ]);
  state = applyAllowedOps({ state, allowedOps: evaluateProposal({ state, aiResponse: startResp }).allowedOps });

  // Active is npc-02, try end_turn as pc-01
  const endResp = makeAiResponse([{ op: "end_turn", entity_id: "pc-01" }]);
  const result = evaluateProposal({ state, aiResponse: endResp });
  assert(result.ok === false, "end_turn by wrong entity rejected");
  assert(
    result.violations.some((v) => v.code === "END_TURN_WRONG_ENTITY"),
    "END_TURN_WRONG_ENTITY violation"
  );
}

// ── Test 7: COMBAT_PARTICIPANT_NOT_FOUND ───────────────────────────────

console.log("\n[Test 7] COMBAT_PARTICIPANT_NOT_FOUND");
{
  const state = loadState();

  const startResp = makeAiResponse([
    {
      op: "start_combat",
      participants: [
        { entity_id: "pc-01", initiative: 15 },
        { entity_id: "fake-entity-999", initiative: 10 },
      ],
    },
  ]);
  const result = evaluateProposal({ state, aiResponse: startResp });
  assert(result.ok === false, "start_combat with fake entity rejected");
  assert(
    result.violations.some((v) => v.code === "COMBAT_PARTICIPANT_NOT_FOUND"),
    "COMBAT_PARTICIPANT_NOT_FOUND violation"
  );
}

// ── Test 8: Non-combat moves still work without combat active ──────────

console.log("\n[Test 8] Non-combat moves work without combat");
{
  const state = loadState();

  const moveResp = makeAiResponse([], [
    {
      op: "move_entity",
      entity_id: "pc-01",
      from: { x: 2, y: 3 },
      to: { x: 3, y: 3 },
    },
  ]);
  const result = evaluateProposal({ state, aiResponse: moveResp });
  assert(result.ok === true, "move without combat active passes (no NOT_YOUR_TURN)");
}

// ── Summary ────────────────────────────────────────────────────────────

console.log(`\n${"═".repeat(50)}`);
console.log(`Results: ${passed}/${passed + failed} passed, ${failed} failed`);
if (failed > 0) {
  console.log("FAIL: some combat tests did not pass");
  process.exit(1);
} else {
  console.log("PASS: all combat tests passed");
  process.exit(0);
}
