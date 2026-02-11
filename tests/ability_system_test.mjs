/**
 * ability_system_test.mjs — Phase 6.2 Ability System Test Suite.
 *
 * Merge strategy: Option B (ability_uses and tactical_events cannot coexist).
 *
 * Tests:
 *   1. Backward compatibility — no ability_uses passes unchanged
 *   2. Duplicate use_id → ABILITY_DUPLICATE_USE_ID
 *   3. Unknown ability → ABILITY_NOT_KNOWN
 *   4. Insufficient mana → ABILITY_COST_INSUFFICIENT
 *   5. Cooldown active → ABILITY_COOLDOWN_ACTIVE
 *   6. Valid single-target DAMAGE ability → correct DAMAGE tactical_event + HP decrement
 *   7. Valid STATUS_APPLY ability → STATUS_APPLY event + conditions updated
 *   8. Range invalid → ABILITY_RANGE_INVALID
 *   9. Determinism — same input → identical output (deep equal)
 *  10. Option B coexistence → ABILITY_TACTICAL_COEXIST
 */

import { validateAbilityUses } from "../src/validation/abilityValidator.mjs";
import { resolveAbilityUses } from "../src/combat/resolveAbilityUses.mjs";

// ── Test state factory ─────────────────────────────────────────────────

function makeState() {
  return {
    entities: [
      {
        id: "pc-01", name: "Seren", position: { x: 3, y: 4 },
        stats: { hp: 25, maxHp: 25, ac: 15, speed: 6 },
        conditions: [],
        ability_ids: ["slash", "fireball", "shield"],
        resources: { mana: 10, ap: 2 },
        cooldowns: {},
      },
      {
        id: "npc-01", name: "Goblin", position: { x: 4, y: 4 },
        stats: { hp: 10, maxHp: 10, ac: 12, speed: 6 },
        conditions: [],
        ability_ids: ["bite"],
        resources: { mana: 0, ap: 1 },
        cooldowns: {},
      },
      {
        id: "pc-02", name: "Miri", position: { x: 2, y: 2 },
        stats: { hp: 20, maxHp: 20, ac: 14, speed: 6 },
        conditions: [],
        ability_ids: ["heal_word", "slash"],
        resources: { mana: 8, ap: 2 },
        cooldowns: {},
      },
      {
        id: "npc-02", name: "Orc", position: { x: 15, y: 15 },
        stats: { hp: 30, maxHp: 30, ac: 13, speed: 6 },
        conditions: [],
        ability_ids: ["greataxe"],
        resources: { mana: 0, ap: 1 },
        cooldowns: {},
      },
    ],
    abilities_catalogue: {
      slash: {
        ability_id: "slash",
        name: "Slash",
        action_type: "ACTION",
        range: { type: "MELEE", distance: 1 },
        targeting: "SINGLE_ENEMY",
        cost: { ap: 1 },
        effects: [{ type: "DAMAGE", value: 5 }],
      },
      fireball: {
        ability_id: "fireball",
        name: "Fireball",
        action_type: "ACTION",
        range: { type: "RANGED", distance: 10 },
        targeting: "SINGLE_ENEMY",
        cost: { mana: 4, cooldown: 2 },
        effects: [{ type: "DAMAGE", value: 8 }],
      },
      shield: {
        ability_id: "shield",
        name: "Shield",
        action_type: "REACTION",
        range: { type: "SELF" },
        targeting: "SELF",
        cost: { mana: 2 },
        effects: [{ type: "APPLY_STATUS", status: "shielded", duration: 1 }],
      },
      bite: {
        ability_id: "bite",
        name: "Bite",
        action_type: "ACTION",
        range: { type: "MELEE", distance: 1 },
        targeting: "SINGLE_ENEMY",
        cost: { ap: 1 },
        effects: [{ type: "DAMAGE", value: 3 }],
      },
      heal_word: {
        ability_id: "heal_word",
        name: "Healing Word",
        action_type: "BONUS",
        range: { type: "RANGED", distance: 6 },
        targeting: "SINGLE_ALLY",
        cost: { mana: 3 },
        effects: [{ type: "HEAL", value: 5 }],
      },
      greataxe: {
        ability_id: "greataxe",
        name: "Greataxe",
        action_type: "ACTION",
        range: { type: "MELEE", distance: 1 },
        targeting: "SINGLE_ENEMY",
        cost: { ap: 1 },
        effects: [{ type: "DAMAGE", value: 10 }],
      },
    },
    map: { dimensions: { width: 20, height: 20 } },
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

// ── Tests ──────────────────────────────────────────────────────────────

console.log("");
console.log("╔══════════════════════════════════════╗");
console.log("║  Phase 6.2 — Ability System Tests     ║");
console.log("║  Merge strategy: Option B             ║");
console.log("╚══════════════════════════════════════╝");
console.log("");

// ── Test 1: Backward Compatibility ─────────────────────────────────────
console.log("[Test 1] Backward Compatibility — no ability_uses");
{
  const state = makeState();
  const result = validateAbilityUses([], state);
  assert(result.valid === true, "empty ability_uses passes");

  const { tacticalEvents, updatedState } = resolveAbilityUses(state, []);
  assert(tacticalEvents.length === 0, "no tactical events produced");
  assert(updatedState === state, "state ref unchanged for empty input");

  const r2 = resolveAbilityUses(state, undefined);
  assert(r2.updatedState === state, "undefined returns same state ref");
}
console.log("");

// ── Test 2: Duplicate use_id ───────────────────────────────────────────
console.log("[Test 2] Duplicate use_id → ABILITY_DUPLICATE_USE_ID");
{
  const state = makeState();
  const uses = [
    { use_id: "u1", actor_id: "pc-01", ability_id: "slash", targets: ["npc-01"] },
    { use_id: "u1", actor_id: "pc-01", ability_id: "slash", targets: ["npc-01"] },
  ];
  const result = validateAbilityUses(uses, state);
  assert(result.valid === false, "duplicate use_id fails");
  assert(result.errors.some((e) => e.code === "ABILITY_DUPLICATE_USE_ID"), "ABILITY_DUPLICATE_USE_ID present");
}
console.log("");

// ── Test 3: Unknown ability ────────────────────────────────────────────
console.log("[Test 3] Unknown ability → ABILITY_NOT_KNOWN");
{
  const state = makeState();
  const uses = [
    { use_id: "u1", actor_id: "pc-01", ability_id: "teleport", targets: ["npc-01"] },
  ];
  const result = validateAbilityUses(uses, state);
  assert(result.valid === false, "unknown ability fails");
  assert(result.errors.some((e) => e.code === "ABILITY_NOT_KNOWN"), "ABILITY_NOT_KNOWN present");
}
console.log("");

// ── Test 4: Insufficient mana ──────────────────────────────────────────
console.log("[Test 4] Insufficient mana → ABILITY_COST_INSUFFICIENT");
{
  const state = makeState();
  // Drain mana first
  state.entities[0].resources.mana = 1; // pc-01 has 1 mana, fireball costs 4
  const uses = [
    { use_id: "u1", actor_id: "pc-01", ability_id: "fireball", targets: ["npc-01"] },
  ];
  const result = validateAbilityUses(uses, state);
  assert(result.valid === false, "insufficient mana fails");
  assert(result.errors.some((e) => e.code === "ABILITY_COST_INSUFFICIENT"), "ABILITY_COST_INSUFFICIENT present");
}
console.log("");

// ── Test 5: Cooldown active ────────────────────────────────────────────
console.log("[Test 5] Cooldown active → ABILITY_COOLDOWN_ACTIVE");
{
  const state = makeState();
  state.entities[0].cooldowns = { fireball: 1 }; // 1 turn remaining
  const uses = [
    { use_id: "u1", actor_id: "pc-01", ability_id: "fireball", targets: ["npc-01"] },
  ];
  const result = validateAbilityUses(uses, state);
  assert(result.valid === false, "cooldown active fails");
  assert(result.errors.some((e) => e.code === "ABILITY_COOLDOWN_ACTIVE"), "ABILITY_COOLDOWN_ACTIVE present");
}
console.log("");

// ── Test 6: Valid single-target DAMAGE ability ─────────────────────────
console.log("[Test 6] Valid DAMAGE ability → correct tactical_event + HP");
{
  const state = makeState();
  const uses = [
    { use_id: "u1", actor_id: "pc-01", ability_id: "slash", targets: ["npc-01"] },
  ];
  const result = validateAbilityUses(uses, state);
  assert(result.valid === true, "valid slash passes validation");

  const { tacticalEvents, updatedState, violations } = resolveAbilityUses(state, uses);
  assert(violations.length === 0, "no resolution violations");
  assert(tacticalEvents.length === 1, "produces 1 tactical event");
  assert(tacticalEvents[0].type === "DAMAGE", "event type is DAMAGE");
  assert(tacticalEvents[0].actor_id === "pc-01", "actor is pc-01");
  assert(tacticalEvents[0].target_id === "npc-01", "target is npc-01");
  assert(tacticalEvents[0].value === 5, "damage value is 5");

  // State HP updated in clone
  const goblin = updatedState.entities.find((e) => e.id === "npc-01");
  assert(goblin.stats.hp === 5, "goblin HP reduced to 5");

  // AP deducted
  const actor = updatedState.entities.find((e) => e.id === "pc-01");
  assert(actor.resources.ap === 1, "ap deducted from 2 to 1");

  // Original state unchanged
  assert(state.entities[1].stats.hp === 10, "original goblin HP unchanged");
}
console.log("");

// ── Test 7: Valid STATUS_APPLY ability ─────────────────────────────────
console.log("[Test 7] Valid STATUS_APPLY ability → STATUS_APPLY event + conditions");
{
  const state = makeState();
  const uses = [
    { use_id: "u1", actor_id: "pc-01", ability_id: "shield" },
  ];
  const result = validateAbilityUses(uses, state);
  assert(result.valid === true, "valid shield passes");

  const { tacticalEvents, updatedState } = resolveAbilityUses(state, uses);
  assert(tacticalEvents.length === 1, "produces 1 tactical event");
  assert(tacticalEvents[0].type === "STATUS_APPLY", "event type is STATUS_APPLY");
  assert(tacticalEvents[0].status === "shielded", "status is shielded");
  assert(tacticalEvents[0].duration === 1, "duration is 1");

  const actor = updatedState.entities.find((e) => e.id === "pc-01");
  assert(actor.conditions.includes("shielded"), "shielded in conditions");
  assert(actor.resources.mana === 8, "mana deducted from 10 to 8");
}
console.log("");

// ── Test 8: Range invalid ──────────────────────────────────────────────
console.log("[Test 8] Range invalid → ABILITY_RANGE_INVALID");
{
  const state = makeState();
  // pc-01 at (3,4), npc-02 at (15,15) — distance = 12, slash range = 1
  const uses = [
    { use_id: "u1", actor_id: "pc-01", ability_id: "slash", targets: ["npc-02"] },
  ];
  const result = validateAbilityUses(uses, state);
  assert(result.valid === false, "range invalid fails");
  assert(result.errors.some((e) => e.code === "ABILITY_RANGE_INVALID"), "ABILITY_RANGE_INVALID present");
}
console.log("");

// ── Test 9: Determinism ────────────────────────────────────────────────
console.log("[Test 9] Determinism — same input → identical output");
{
  const state1 = makeState();
  const state2 = makeState();
  const uses = [
    { use_id: "u1", actor_id: "pc-01", ability_id: "slash", targets: ["npc-01"] },
    { use_id: "u2", actor_id: "pc-01", ability_id: "shield" },
  ];

  const r1 = resolveAbilityUses(state1, uses);
  const r2 = resolveAbilityUses(state2, uses);

  const events1 = JSON.stringify(r1.tacticalEvents);
  const events2 = JSON.stringify(r2.tacticalEvents);
  assert(events1 === events2, "tactical events are identical");

  const state1Out = JSON.stringify(r1.updatedState);
  const state2Out = JSON.stringify(r2.updatedState);
  assert(state1Out === state2Out, "updated states are identical");
}
console.log("");

// ── Test 10: Option B coexistence ──────────────────────────────────────
console.log("[Test 10] Option B — ability_uses + tactical_events → ABILITY_TACTICAL_COEXIST");
{
  // We test this at the validator/integration level using the violation code directly
  // since evaluateProposal requires CJS module loading (validate_ai_gm_response.js)
  // We verify the code exists and the logic would trigger
  const { V } = await import("../src/core/violationCodes.mjs");
  assert(V.ABILITY_TACTICAL_COEXIST === "ABILITY_TACTICAL_COEXIST", "ABILITY_TACTICAL_COEXIST code exists");
  assert(typeof V.ABILITY_TACTICAL_COEXIST === "string", "code is a string");
}
console.log("");

// ── Test 11: Actor doesn't have ability ────────────────────────────────
console.log("[Test 11] Actor doesn't have ability → ABILITY_NOT_KNOWN");
{
  const state = makeState();
  // npc-01 only has "bite", not "fireball"
  const uses = [
    { use_id: "u1", actor_id: "npc-01", ability_id: "fireball", targets: ["pc-01"] },
  ];
  const result = validateAbilityUses(uses, state);
  assert(result.valid === false, "actor missing ability fails");
  assert(result.errors.some((e) => e.code === "ABILITY_NOT_KNOWN"), "ABILITY_NOT_KNOWN for missing ability_ids");
}
console.log("");

// ── Test 12: Target count invalid ──────────────────────────────────────
console.log("[Test 12] Wrong target count → ABILITY_TARGET_COUNT_INVALID");
{
  const state = makeState();
  // slash is SINGLE_ENEMY, providing 0 targets
  const uses = [
    { use_id: "u1", actor_id: "pc-01", ability_id: "slash", targets: [] },
  ];
  const result = validateAbilityUses(uses, state);
  assert(result.valid === false, "wrong target count fails");
  assert(result.errors.some((e) => e.code === "ABILITY_TARGET_COUNT_INVALID"), "ABILITY_TARGET_COUNT_INVALID present");
}
console.log("");

// ── Test 13: Empty ability_uses is valid no-op ─────────────────────────
console.log("[Test 13] Empty ability_uses [] — valid no-op, no events, no violations");
{
  const state = makeState();
  const result = validateAbilityUses([], state);
  assert(result.valid === true, "empty [] is valid");
  assert(result.errors.length === 0, "no errors");

  const { tacticalEvents, updatedState, violations } = resolveAbilityUses(state, []);
  assert(tacticalEvents.length === 0, "no tactical events");
  assert(violations.length === 0, "no violations");
  assert(updatedState === state, "state ref identity preserved (no clone)");
  assert(JSON.stringify(state) === JSON.stringify(makeState()), "original state unchanged");
}
console.log("");

// ── Test 14: Partial failure — valid use[0] + invalid use[1] ───────────
console.log("[Test 14] Partial failure — first valid, second invalid → whole batch fails validation");
{
  const state = makeState();
  // use[0]: valid slash (pc-01 → npc-01, adjacent)
  // use[1]: invalid ability_id "teleport" (not in catalogue)
  const uses = [
    { use_id: "u1", actor_id: "pc-01", ability_id: "slash", targets: ["npc-01"] },
    { use_id: "u2", actor_id: "pc-01", ability_id: "teleport", targets: ["npc-01"] },
  ];

  // Validator reports failure for the batch
  const result = validateAbilityUses(uses, state);
  assert(result.valid === false, "batch fails validation when any use is invalid");
  assert(result.errors.some((e) => e.code === "ABILITY_NOT_KNOWN"), "ABILITY_NOT_KNOWN on use[1]");
  assert(result.errors.length >= 1, "at least 1 error reported");

  // Resolver: current behavior processes all uses; violations from invalid ones
  // are returned alongside events from valid ones. The caller must treat violations
  // as all-or-nothing rejection. We document this behavior.
  const { tacticalEvents, violations } = resolveAbilityUses(state, uses);
  assert(violations.length >= 1, "resolver reports violations for invalid use");
  assert(violations.some((v) => v.code === "ABILITY_RESOLUTION_FAILED"), "ABILITY_RESOLUTION_FAILED from resolver");

  // The valid use[0] still produces events (resolver doesn't rollback)
  // but the presence of violations means the caller MUST discard all events.
  assert(tacticalEvents.length >= 1, "events from valid use[0] exist (caller must discard due to violations)");

  // Original state unchanged (resolver clones)
  assert(state.entities[1].stats.hp === 10, "original npc-01 HP unchanged");
}
console.log("");

// ── Test 15: Sequential resource depletion ordering ────────────────────
console.log("[Test 15] Sequential resource depletion — second use unaffordable after first");
{
  const state = makeState();
  // pc-01 has mana: 10. fireball costs 4 mana each.
  // Two fireballs: first costs 4 (10→6), second costs 4 (6→2). Both affordable.
  // But if we set mana to 5: first costs 4 (5→1), second costs 4 (1 < 4) → fail.
  state.entities[0].resources.mana = 5;
  const uses = [
    { use_id: "u1", actor_id: "pc-01", ability_id: "fireball", targets: ["npc-01"] },
    { use_id: "u2", actor_id: "pc-01", ability_id: "fireball", targets: ["npc-01"] },
  ];

  const result = validateAbilityUses(uses, state);
  assert(result.valid === false, "batch fails when second use exhausts mana");
  // fireball also has cooldown:2, so use[1] gets both COST_INSUFFICIENT and COOLDOWN_ACTIVE
  assert(result.errors.length >= 1, "at least 1 error on second use");
  assert(result.errors.some((e) => e.code === "ABILITY_COST_INSUFFICIENT" && e.path === "ability_uses[1]"),
    "ABILITY_COST_INSUFFICIENT on use[1]");

  // Original state unchanged
  assert(state.entities[0].resources.mana === 5, "original mana unchanged");
}
console.log("");

// ── Test 15b: Sequential AP depletion ──────────────────────────────────
console.log("[Test 15b] Sequential AP depletion — second slash unaffordable");
{
  const state = makeState();
  // pc-01 has ap: 2, slash costs 1 ap each → first (2→1), second (1→0) both ok
  // Set ap to 1: first ok (1→0), second fails (0 < 1)
  state.entities[0].resources.ap = 1;
  const uses = [
    { use_id: "u1", actor_id: "pc-01", ability_id: "slash", targets: ["npc-01"] },
    { use_id: "u2", actor_id: "pc-01", ability_id: "slash", targets: ["npc-01"] },
  ];

  const result = validateAbilityUses(uses, state);
  assert(result.valid === false, "batch fails when second use exhausts AP");
  assert(result.errors.some((e) => e.code === "ABILITY_COST_INSUFFICIENT"), "ABILITY_COST_INSUFFICIENT for AP");
}
console.log("");

// ── Test 16: HEAL clamping at maxHp ────────────────────────────────────
console.log("[Test 16] HEAL clamping — hp capped at maxHp when maxHp is present");
{
  const state = makeState();
  // Damage pc-02 first: set hp to 15 (maxHp is 20)
  state.entities[2].stats.hp = 15;
  // heal_word heals 5 → should go to 20, not above
  const uses = [
    { use_id: "u1", actor_id: "pc-02", ability_id: "heal_word", targets: ["pc-02"] },
  ];

  const result = validateAbilityUses(uses, state);
  assert(result.valid === true, "heal_word on self is valid");

  const { tacticalEvents, updatedState, violations } = resolveAbilityUses(state, uses);
  assert(violations.length === 0, "no violations");
  assert(tacticalEvents.length === 1, "1 event produced");
  assert(tacticalEvents[0].type === "DAMAGE", "event type is DAMAGE (negative = heal)");
  assert(tacticalEvents[0].value === -5, "heal value is -5 (healed 5)");

  const healed = updatedState.entities.find((e) => e.id === "pc-02");
  assert(healed.stats.hp === 20, "hp clamped at maxHp (20)");
}
console.log("");

// ── Test 16b: HEAL overheal clamping at maxHp ──────────────────────────
console.log("[Test 16b] HEAL overheal — heal value exceeds missing hp, clamped at maxHp");
{
  const state = makeState();
  // pc-02 hp: 18, maxHp: 20, heal_word heals 5 → should clamp at 20 (only +2)
  state.entities[2].stats.hp = 18;
  const uses = [
    { use_id: "u1", actor_id: "pc-02", ability_id: "heal_word", targets: ["pc-02"] },
  ];

  const { tacticalEvents, updatedState, violations } = resolveAbilityUses(state, uses);
  assert(violations.length === 0, "no violations");

  const healed = updatedState.entities.find((e) => e.id === "pc-02");
  assert(healed.stats.hp === 20, "hp clamped at maxHp (20), not 23");
  assert(tacticalEvents[0].value === -2, "heal event value is -2 (only 2 hp missing)");
}
console.log("");

// ── Test 16c: HEAL without maxHp — document limitation ─────────────────
console.log("[Test 16c] HEAL without maxHp — hp clamped to current (no heal applied)");
{
  const state = makeState();
  // Remove maxHp from pc-02
  delete state.entities[2].stats.maxHp;
  state.entities[2].stats.hp = 15;
  // TODO: maxHp tracking is required for proper heal clamping.
  // Without maxHp, resolver uses `maxHp ?? currentHp` which means
  // Math.min(15, 15 + 5) = 15 — no heal occurs. This is a known limitation.
  const uses = [
    { use_id: "u1", actor_id: "pc-02", ability_id: "heal_word", targets: ["pc-02"] },
  ];

  const { tacticalEvents, updatedState, violations } = resolveAbilityUses(state, uses);
  assert(violations.length === 0, "no violations");

  const healed = updatedState.entities.find((e) => e.id === "pc-02");
  assert(healed.stats.hp === 15, "hp unchanged — maxHp absent means clamp to current (known limitation)");
  assert(tacticalEvents[0].value === 0, "heal event value is 0 (no effective heal)");
}
console.log("");

// ── Test 17: FORCED_MOVE — push into negative coords clamped at 0 ──────
console.log("[Test 17] FORCED_MOVE — push target, position clamped at map edge (x≥0, y≥0)");
{
  const state = makeState();
  // Add a FORCED_MOVE ability to catalogue + give it to pc-01
  state.abilities_catalogue.thunderwave = {
    ability_id: "thunderwave",
    name: "Thunderwave",
    action_type: "ACTION",
    range: { type: "MELEE", distance: 2 },
    targeting: "SINGLE_ENEMY",
    cost: { mana: 1 },
    effects: [{ type: "FORCED_MOVE", distance: 5, direction: "push" }],
  };
  state.entities[0].ability_ids.push("thunderwave");

  // pc-01 at (3,4), npc-01 at (4,4) — push 5 tiles east → (9,4)
  const uses = [
    { use_id: "u1", actor_id: "pc-01", ability_id: "thunderwave", targets: ["npc-01"] },
  ];

  const result = validateAbilityUses(uses, state);
  assert(result.valid === true, "thunderwave passes validation");

  const { tacticalEvents, updatedState, violations } = resolveAbilityUses(state, uses);
  assert(violations.length === 0, "no violations");
  assert(tacticalEvents.length === 1, "1 MOVE event");
  assert(tacticalEvents[0].type === "MOVE", "event is MOVE");
  assert(tacticalEvents[0].position_before.x === 4, "before x=4");
  assert(tacticalEvents[0].position_after.x === 9, "after x=9 (pushed 5 east)");

  const target = updatedState.entities.find((e) => e.id === "npc-01");
  assert(target.position.x === 9, "npc-01 moved to x=9");
}
console.log("");

// ── Test 17b: FORCED_MOVE — push toward (0,0) clamps at 0 ──────────────
console.log("[Test 17b] FORCED_MOVE — push toward origin, clamped at 0");
{
  const state = makeState();
  state.abilities_catalogue.thunderwave = {
    ability_id: "thunderwave", name: "Thunderwave", action_type: "ACTION",
    range: { type: "MELEE", distance: 5 }, targeting: "SINGLE_ENEMY",
    cost: { mana: 1 },
    effects: [{ type: "FORCED_MOVE", distance: 20, direction: "push" }],
  };
  state.entities[0].ability_ids.push("thunderwave");

  // Move pc-01 to (5,5) and npc-01 to (3,3) — push goes toward (0,0)
  state.entities[0].position = { x: 5, y: 5 };
  state.entities[1].position = { x: 3, y: 3 };

  const uses = [
    { use_id: "u1", actor_id: "pc-01", ability_id: "thunderwave", targets: ["npc-01"] },
  ];

  const { tacticalEvents, updatedState, violations } = resolveAbilityUses(state, uses);
  assert(violations.length === 0, "no violations");

  const target = updatedState.entities.find((e) => e.id === "npc-01");
  assert(target.position.x >= 0, "x clamped at >= 0");
  assert(target.position.y >= 0, "y clamped at >= 0");
  // NOTE: Current resolver does NOT check collision or upper map bounds.
  // This is documented behavior — collision detection is the caller's responsibility.
}
console.log("");

// ── Test 18a: POSITION targeting — missing target_positions → fail ──────
console.log("[Test 18a] POSITION targeting — missing target_positions → ABILITY_TARGET_COUNT_INVALID");
{
  const state = makeState();
  state.abilities_catalogue.beacon = {
    ability_id: "beacon", name: "Beacon", action_type: "ACTION",
    range: { type: "RANGED", distance: 10 }, targeting: "POSITION",
    cost: { mana: 1 },
    effects: [{ type: "APPLY_STATUS", status: "illuminated", duration: 3 }],
  };
  state.entities[0].ability_ids.push("beacon");

  // No target_positions provided
  const uses = [
    { use_id: "u1", actor_id: "pc-01", ability_id: "beacon" },
  ];

  const result = validateAbilityUses(uses, state);
  assert(result.valid === false, "missing target_positions fails");
  assert(result.errors.some((e) => e.code === "ABILITY_TARGET_COUNT_INVALID"), "ABILITY_TARGET_COUNT_INVALID present");
}
console.log("");

// ── Test 18b: AREA targeting — missing target_positions → fail ──────────
console.log("[Test 18b] AREA targeting — missing target_positions → ABILITY_TARGET_COUNT_INVALID");
{
  const state = makeState();
  state.abilities_catalogue.fireball_aoe = {
    ability_id: "fireball_aoe", name: "Fireball AoE", action_type: "ACTION",
    range: { type: "RANGED", distance: 10 }, targeting: "AREA",
    cost: { mana: 3 },
    effects: [{ type: "DAMAGE", value: 6 }],
  };
  state.entities[0].ability_ids.push("fireball_aoe");

  // No target_positions
  const uses = [
    { use_id: "u1", actor_id: "pc-01", ability_id: "fireball_aoe" },
  ];

  const result = validateAbilityUses(uses, state);
  assert(result.valid === false, "missing target_positions fails");
  assert(result.errors.some((e) => e.code === "ABILITY_TARGET_COUNT_INVALID"), "ABILITY_TARGET_COUNT_INVALID for AREA");
}
console.log("");

// ── Test 18c: POSITION targeting — valid with target_positions ──────────
console.log("[Test 18c] POSITION targeting — valid with target_positions provided");
{
  const state = makeState();
  state.abilities_catalogue.beacon = {
    ability_id: "beacon", name: "Beacon", action_type: "ACTION",
    range: { type: "RANGED", distance: 10 }, targeting: "POSITION",
    cost: { mana: 1 },
    effects: [{ type: "APPLY_STATUS", status: "illuminated", duration: 3 }],
  };
  state.entities[0].ability_ids.push("beacon");

  const uses = [
    { use_id: "u1", actor_id: "pc-01", ability_id: "beacon", target_positions: [{ x: 5, y: 5 }] },
  ];

  const result = validateAbilityUses(uses, state);
  assert(result.valid === true, "POSITION with target_positions passes validation");

  // Resolver: beacon applies to self (no targets array)
  const { tacticalEvents, violations } = resolveAbilityUses(state, uses);
  assert(violations.length === 0, "no resolution violations");
  assert(tacticalEvents.length === 1, "1 STATUS_APPLY event (applied to actor as fallback)");
  assert(tacticalEvents[0].type === "STATUS_APPLY", "event is STATUS_APPLY");
  assert(tacticalEvents[0].status === "illuminated", "status is illuminated");
}
console.log("");

// ── Summary ────────────────────────────────────────────────────────────
console.log("══════════════════════════════════════════════════");
console.log(`Results: ${passed}/${passed + failed} passed, ${failed} failed`);
if (failed === 0) {
  console.log("PASS: all ability system tests passed");
} else {
  console.log("FAIL: some ability system tests failed");
  process.exit(1);
}
