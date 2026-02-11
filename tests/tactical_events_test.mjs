/**
 * tactical_events_test.mjs — Phase 6.1 Tactical Events Test Suite.
 *
 * Tests:
 *   1. Backward Compatibility — no tactical_events → passes
 *   2. Valid MOVE — passes validation
 *   3. Invalid MOVE — missing position_after → fails
 *   4. DAMAGE Negative — value < 0 → fails
 *   5. Duplicate event_id → fails
 *   6. Deterministic Order — MOVE → ATTACK → DAMAGE → TURN_END → valid
 *   7. State Safety — DAMAGE exceeding HP → engine throws
 */

import { validateTacticalEvents } from "../src/validation/tacticalValidator.mjs";
import { applyTacticalEvents } from "../src/combat/applyTacticalEvents.mjs";

// ── Test state ─────────────────────────────────────────────────────────

function makeState() {
  return {
    entities: [
      { id: "pc-01", name: "Seren", position: { x: 3, y: 4 }, stats: { hp: 25, maxHp: 25, ac: 15, speed: 6 }, conditions: [] },
      { id: "npc-01", name: "Goblin", position: { x: 5, y: 4 }, stats: { hp: 10, maxHp: 10, ac: 12, speed: 6 }, conditions: [] },
      { id: "pc-02", name: "Miri", position: { x: 2, y: 2 }, stats: { hp: 20, maxHp: 20, ac: 14, speed: 6 }, conditions: [] },
      { id: "npc-02", name: "Orc", position: { x: 8, y: 8 }, stats: { hp: 15, maxHp: 15, ac: 13, speed: 6 }, conditions: [] },
    ],
    map: { dimensions: { width: 20, height: 15 } },
    logs: [],
    meta: { updatedAt: "2026-01-01T00:00:00Z" },
    timeline: { turn: 0 },
  };
}

// ── Test harness ───────────────────────────────────────────────────────

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

function assertThrows(fn, label) {
  try {
    fn();
    console.log(`  ❌ ${label} (expected throw, none received)`);
    failed++;
  } catch (e) {
    console.log(`  ✅ ${label} (threw: ${e.message.slice(0, 60)}...)`);
    passed++;
  }
}

// ── Tests ──────────────────────────────────────────────────────────────

console.log("");
console.log("╔══════════════════════════════════════╗");
console.log("║  Phase 6.1 — Tactical Events Tests   ║");
console.log("╚══════════════════════════════════════╝");
console.log("");

// ── Test 1: Backward Compatibility ─────────────────────────────────────
console.log("[Test 1] Backward Compatibility — no tactical_events");
{
  const state = makeState();
  // No tactical_events at all — validateTacticalEvents should not be called,
  // but if called with undefined/empty, it should handle gracefully
  const result = validateTacticalEvents([], state);
  assert(result.valid === true, "empty tactical_events passes");

  // applyTacticalEvents with no events returns original state
  const next = applyTacticalEvents(state, []);
  assert(next === state, "no events returns same state ref");

  const next2 = applyTacticalEvents(state, undefined);
  assert(next2 === state, "undefined events returns same state ref");

  const next3 = applyTacticalEvents(state, null);
  assert(next3 === state, "null events returns same state ref");
}
console.log("");

// ── Test 2: Valid MOVE ─────────────────────────────────────────────────
console.log("[Test 2] Valid MOVE event");
{
  const state = makeState();
  const events = [
    {
      event_id: "evt-1",
      type: "MOVE",
      actor_id: "pc-01",
      position_before: { x: 3, y: 4 },
      position_after: { x: 4, y: 4 },
    },
  ];
  const result = validateTacticalEvents(events, state);
  assert(result.valid === true, "valid MOVE passes validation");

  const next = applyTacticalEvents(state, events);
  assert(next.entities[0].position.x === 4, "position updated to x=4");
  assert(next.entities[0].position.y === 4, "position y stays 4");
  assert(state.entities[0].position.x === 3, "original state NOT mutated");
}
console.log("");

// ── Test 3: Invalid MOVE — missing position_after ──────────────────────
console.log("[Test 3] Invalid MOVE — missing position_after");
{
  const state = makeState();
  const events = [
    {
      event_id: "evt-2",
      type: "MOVE",
      actor_id: "pc-01",
      position_before: { x: 3, y: 4 },
      // position_after is missing
    },
  ];
  const result = validateTacticalEvents(events, state);
  assert(result.valid === false, "missing position_after fails");
  assert(result.errors.some((e) => e.includes("TACTICAL_MOVE_MISSING_POS")), "error includes TACTICAL_MOVE_MISSING_POS");
}
console.log("");

// ── Test 4: DAMAGE Negative ────────────────────────────────────────────
console.log("[Test 4] DAMAGE with negative value");
{
  const state = makeState();
  const events = [
    {
      event_id: "evt-3",
      type: "DAMAGE",
      actor_id: "pc-01",
      target_id: "npc-01",
      value: -5,
    },
  ];
  const result = validateTacticalEvents(events, state);
  assert(result.valid === false, "negative damage fails");
  assert(result.errors.some((e) => e.includes("TACTICAL_DAMAGE_NEGATIVE")), "error includes TACTICAL_DAMAGE_NEGATIVE");
}
console.log("");

// ── Test 5: Duplicate event_id ─────────────────────────────────────────
console.log("[Test 5] Duplicate event_id");
{
  const state = makeState();
  const events = [
    { event_id: "dup-1", type: "TURN_START", actor_id: "pc-01" },
    { event_id: "dup-1", type: "TURN_END", actor_id: "pc-01" },
  ];
  const result = validateTacticalEvents(events, state);
  assert(result.valid === false, "duplicate event_id fails");
  assert(result.errors.some((e) => e.includes("TACTICAL_DUPLICATE_EVENT_ID")), "error includes TACTICAL_DUPLICATE_EVENT_ID");
}
console.log("");

// ── Test 6: Deterministic Order ────────────────────────────────────────
console.log("[Test 6] Deterministic Order — MOVE → ATTACK → DAMAGE → TURN_END");
{
  const state = makeState();
  const events = [
    {
      event_id: "seq-1",
      type: "MOVE",
      actor_id: "pc-01",
      position_before: { x: 3, y: 4 },
      position_after: { x: 4, y: 4 },
    },
    {
      event_id: "seq-2",
      type: "ATTACK",
      actor_id: "pc-01",
      target_id: "npc-01",
    },
    {
      event_id: "seq-3",
      type: "DAMAGE",
      actor_id: "pc-01",
      target_id: "npc-01",
      value: 5,
    },
    {
      event_id: "seq-4",
      type: "TURN_END",
      actor_id: "pc-01",
    },
  ];
  const result = validateTacticalEvents(events, state);
  assert(result.valid === true, "MOVE→ATTACK→DAMAGE→TURN_END passes");

  const next = applyTacticalEvents(state, events);
  assert(next.entities[0].position.x === 4, "pc-01 moved to x=4");
  assert(next.entities[1].stats.hp === 5, "npc-01 HP reduced to 5");
  assert(state.entities[1].stats.hp === 10, "original npc-01 HP unchanged");
}
console.log("");

// ── Test 7: State Safety — DAMAGE exceeding HP ─────────────────────────
console.log("[Test 7] State Safety — DAMAGE exceeding HP throws");
{
  const state = makeState();
  const events = [
    {
      event_id: "overkill-1",
      type: "DAMAGE",
      actor_id: "pc-01",
      target_id: "npc-01",
      value: 999,
    },
  ];
  // Validation should pass (value >= 0), but state application should throw
  const result = validateTacticalEvents(events, state);
  assert(result.valid === true, "validation passes (value >= 0)");

  assertThrows(
    () => applyTacticalEvents(state, events),
    "applyTacticalEvents throws for HP < 0"
  );
}
console.log("");

// ── Test 8: STATUS_APPLY and STATUS_REMOVE ─────────────────────────────
console.log("[Test 8] STATUS_APPLY and STATUS_REMOVE");
{
  const state = makeState();
  const applyEvents = [
    { event_id: "st-1", type: "STATUS_APPLY", actor_id: "pc-01", status: "poisoned", duration: 3 },
  ];
  const r1 = validateTacticalEvents(applyEvents, state);
  assert(r1.valid === true, "STATUS_APPLY with duration passes");

  const next = applyTacticalEvents(state, applyEvents);
  assert(next.entities[0].conditions.includes("poisoned"), "poisoned added to conditions");

  const removeEvents = [
    { event_id: "st-2", type: "STATUS_REMOVE", actor_id: "pc-01", status: "poisoned" },
  ];
  const r2 = validateTacticalEvents(removeEvents, state);
  assert(r2.valid === true, "STATUS_REMOVE passes");

  const next2 = applyTacticalEvents(next, removeEvents);
  assert(!next2.entities[0].conditions.includes("poisoned"), "poisoned removed from conditions");
}
console.log("");

// ── Test 9: TURN_START/TURN_END must not have movement/damage data ─────
console.log("[Test 9] TURN_START/TURN_END cannot have movement or damage");
{
  const state = makeState();
  const events = [
    { event_id: "bad-ts", type: "TURN_START", actor_id: "pc-01", position_before: { x: 3, y: 4 } },
  ];
  const r = validateTacticalEvents(events, state);
  assert(r.valid === false, "TURN_START with position fails");
  assert(r.errors.some((e) => e.includes("TACTICAL_TURN_HAS_MOVEMENT")), "error includes TACTICAL_TURN_HAS_MOVEMENT");

  const events2 = [
    { event_id: "bad-te", type: "TURN_END", actor_id: "pc-01", value: 10 },
  ];
  const r2 = validateTacticalEvents(events2, state);
  assert(r2.valid === false, "TURN_END with value fails");
  assert(r2.errors.some((e) => e.includes("TACTICAL_TURN_HAS_DAMAGE")), "error includes TACTICAL_TURN_HAS_DAMAGE");
}
console.log("");

// ── Summary ────────────────────────────────────────────────────────────
console.log("══════════════════════════════════════════════════");
console.log(`Results: ${passed}/${passed + failed} passed, ${failed} failed`);
if (failed === 0) {
  console.log("PASS: all tactical events tests passed");
} else {
  console.log("FAIL: some tactical events tests failed");
  process.exit(1);
}
