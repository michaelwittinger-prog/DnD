/**
 * replay_test.mjs — MIR 3.4 Replay Runner Tests.
 *
 * Tests:
 *   - Replay passes for valid bundle
 *   - Replay fails on hash mismatch
 *   - Replay fails on invariant violation
 *   - Hash function stable across runs
 *   - Bundle structure validation
 *   - Rejected action replay
 */

import { runReplay } from "../src/replay/runReplay.mjs";
import { stateHash, canonicalStringify } from "../src/replay/hash.mjs";
import { applyAction } from "../src/engine/applyAction.mjs";
import { explorationExample } from "../src/state/exampleStates.mjs";

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

console.log("╔══════════════════════════════════════╗");
console.log("║  MIR 3.4 — Replay Runner Tests        ║");
console.log("╚══════════════════════════════════════╝");
console.log();

// Build a seeded state for deterministic replays
function makeSeededState() {
  const s = structuredClone(explorationExample);
  s.rng.mode = "seeded";
  s.rng.seed = "replay-test-seed";
  return s;
}

// ═══════════════════════════════════════════════════════════════════════
// 1. Hash stability
// ═══════════════════════════════════════════════════════════════════════

console.log("[Test 1] Hash is stable across runs");
{
  const state = makeSeededState();
  const h1 = stateHash(state);
  const h2 = stateHash(state);
  const h3 = stateHash(structuredClone(state));
  assert(h1 === h2, "same object → same hash");
  assert(h1 === h3, "cloned object → same hash");
  assert(typeof h1 === "string", "hash is string");
  assert(h1.length === 16, "hash is 16 chars");
}
console.log();

console.log("[Test 2] Hash changes when state changes");
{
  const s1 = makeSeededState();
  const s2 = makeSeededState();
  s2.combat.round = 99;
  assert(stateHash(s1) !== stateHash(s2), "different state → different hash");
}
console.log();

console.log("[Test 3] Canonical stringify sorts keys");
{
  const a = canonicalStringify({ z: 1, a: 2, m: 3 });
  const b = canonicalStringify({ a: 2, m: 3, z: 1 });
  assert(a === b, "different key order → same string");
  assert(a.indexOf('"a"') < a.indexOf('"m"'), "keys sorted alphabetically");
}
console.log();

// ═══════════════════════════════════════════════════════════════════════
// 2. Valid replay bundle
// ═══════════════════════════════════════════════════════════════════════

console.log("[Test 4] Valid replay: MOVE then ROLL_INITIATIVE");
{
  const initState = makeSeededState();
  const bundle = {
    meta: { id: "test-replay-1", createdAt: "2026-02-11", schemaVersion: "0.1.0", engineVersion: "1.4" },
    initialState: initState,
    steps: [
      { action: { type: "MOVE", entityId: "pc-seren", path: [{ x: 2, y: 4 }, { x: 2, y: 5 }] }, expectedEvents: [{ type: "MOVE_APPLIED" }] },
      { action: { type: "ROLL_INITIATIVE" }, expectedEvents: [{ type: "INITIATIVE_ROLLED" }] },
    ],
  };
  const report = runReplay(bundle);
  assert(report.ok === true, "replay passes");
  assert(report.stepsRun === 2, "2 steps run");
  assert(report.failingStep === null, "no failing step");
  assert(report.errors.length === 0, "no errors");
  assert(typeof report.finalStateHash === "string", "has final hash");
  assert(report.finalStateHash.length === 16, "hash is 16 chars");
  assert(report.eventLog.length === 2, "2 events produced");
}
console.log();

console.log("[Test 5] Valid replay with hash verification");
{
  // First run to get the hash
  const initState = makeSeededState();
  const steps = [
    { action: { type: "MOVE", entityId: "pc-seren", path: [{ x: 2, y: 4 }] } },
  ];
  const r1 = runReplay({ meta: {}, initialState: initState, steps });
  assert(r1.ok === true, "first run ok");

  // Second run with expected hash
  const r2 = runReplay({
    meta: {},
    initialState: makeSeededState(),
    steps: [{ action: { type: "MOVE", entityId: "pc-seren", path: [{ x: 2, y: 4 }] }, expectedStateHash: r1.finalStateHash }],
    final: { expectedStateHash: r1.finalStateHash },
  });
  assert(r2.ok === true, "second run with hash passes");
  assert(r2.finalStateHash === r1.finalStateHash, "hashes match across runs");
}
console.log();

// ═══════════════════════════════════════════════════════════════════════
// 3. Hash mismatch detection
// ═══════════════════════════════════════════════════════════════════════

console.log("[Test 6] Fails on step hash mismatch");
{
  const bundle = {
    meta: {},
    initialState: makeSeededState(),
    steps: [
      { action: { type: "MOVE", entityId: "pc-seren", path: [{ x: 2, y: 4 }] }, expectedStateHash: "0000000000000000" },
    ],
  };
  const report = runReplay(bundle);
  assert(report.ok === false, "replay fails");
  assert(report.failingStep === 0, "fails at step 0");
  assert(report.errors[0].includes("hash mismatch"), "error mentions hash");
}
console.log();

console.log("[Test 7] Fails on final hash mismatch");
{
  const bundle = {
    meta: {},
    initialState: makeSeededState(),
    steps: [
      { action: { type: "MOVE", entityId: "pc-seren", path: [{ x: 2, y: 4 }] } },
    ],
    final: { expectedStateHash: "ffffffffffffffff" },
  };
  const report = runReplay(bundle);
  assert(report.ok === false, "replay fails");
  assert(report.errors[0].includes("Final state hash"), "error mentions final hash");
}
console.log();

// ═══════════════════════════════════════════════════════════════════════
// 4. Rejected action replay
// ═══════════════════════════════════════════════════════════════════════

console.log("[Test 8] Replay with expected rejected action");
{
  const bundle = {
    meta: {},
    initialState: makeSeededState(),
    steps: [
      {
        action: { type: "MOVE", entityId: "pc-seren", path: [{ x: 3, y: 0 }] }, // blocked cell
        expectedEvents: [{ type: "ACTION_REJECTED" }],
      },
    ],
  };
  const report = runReplay(bundle);
  assert(report.ok === true, "replay passes (rejection expected)");
  assert(report.eventLog[0].type === "ACTION_REJECTED", "rejection event produced");
}
console.log();

console.log("[Test 9] Unexpected rejection fails replay");
{
  const bundle = {
    meta: {},
    initialState: makeSeededState(),
    steps: [
      {
        action: { type: "MOVE", entityId: "pc-seren", path: [{ x: 3, y: 0 }] }, // blocked, but no expectedEvents
      },
    ],
  };
  const report = runReplay(bundle);
  assert(report.ok === false, "replay fails (unexpected rejection)");
  assert(report.failingStep === 0, "fails at step 0");
  assert(report.errors[0].includes("rejected"), "error mentions rejection");
}
console.log();

// ═══════════════════════════════════════════════════════════════════════
// 5. Event type mismatch
// ═══════════════════════════════════════════════════════════════════════

console.log("[Test 10] Fails on event type mismatch");
{
  const bundle = {
    meta: {},
    initialState: makeSeededState(),
    steps: [
      { action: { type: "MOVE", entityId: "pc-seren", path: [{ x: 2, y: 4 }] }, expectedEvents: [{ type: "ATTACK_RESOLVED" }] },
    ],
  };
  const report = runReplay(bundle);
  assert(report.ok === false, "replay fails");
  assert(report.errors[0].includes("expected type"), "error mentions type mismatch");
}
console.log();

// ═══════════════════════════════════════════════════════════════════════
// 6. Bundle validation
// ═══════════════════════════════════════════════════════════════════════

console.log("[Test 11] Rejects null bundle");
{
  const r = runReplay(null);
  assert(r.ok === false, "null rejected");
  assert(r.errors[0].includes("non-null"), "helpful error");
}
console.log();

console.log("[Test 12] Rejects missing initialState");
{
  const r = runReplay({ meta: {}, steps: [] });
  assert(r.ok === false, "missing state rejected");
}
console.log();

console.log("[Test 13] Rejects missing steps");
{
  const r = runReplay({ meta: {}, initialState: makeSeededState() });
  assert(r.ok === false, "missing steps rejected");
}
console.log();

console.log("[Test 14] Empty steps array is valid");
{
  const r = runReplay({ meta: {}, initialState: makeSeededState(), steps: [] });
  assert(r.ok === true, "empty steps ok");
  assert(r.stepsRun === 0, "0 steps run");
  assert(typeof r.finalStateHash === "string", "has hash");
}
console.log();

// ═══════════════════════════════════════════════════════════════════════
// 7. Determinism: same bundle always same result
// ═══════════════════════════════════════════════════════════════════════

console.log("[Test 15] Same bundle → same hash (determinism)");
{
  const makeBundle = () => ({
    meta: {},
    initialState: makeSeededState(),
    steps: [
      { action: { type: "SET_SEED", seed: "determinism-test" } },
      { action: { type: "MOVE", entityId: "pc-seren", path: [{ x: 2, y: 4 }, { x: 2, y: 5 }] } },
      { action: { type: "ROLL_INITIATIVE" } },
      { action: { type: "END_TURN", entityId: undefined } }, // will get active entity
    ],
  });

  // Actually let's do steps that always work
  const bundle1 = {
    meta: {},
    initialState: makeSeededState(),
    steps: [
      { action: { type: "SET_SEED", seed: "det-test" } },
      { action: { type: "MOVE", entityId: "pc-seren", path: [{ x: 2, y: 4 }, { x: 2, y: 5 }] } },
      { action: { type: "ROLL_INITIATIVE" } },
    ],
  };
  const bundle2 = structuredClone(bundle1);

  const r1 = runReplay(bundle1);
  const r2 = runReplay(bundle2);
  assert(r1.ok === true, "run 1 ok");
  assert(r2.ok === true, "run 2 ok");
  assert(r1.finalStateHash === r2.finalStateHash, "identical hashes");
  assert(r1.eventLog.length === r2.eventLog.length, "identical event counts");
}
console.log();

// ═══════════════════════════════════════════════════════════════════════

console.log("══════════════════════════════════════════════════");
console.log(`Results: ${passed}/${passed + failed} passed, ${failed} failed`);
console.log(failed === 0 ? "PASS: all MIR 3.4 replay tests passed" : "FAIL: some tests failed");
process.exit(failed > 0 ? 1 : 0);
