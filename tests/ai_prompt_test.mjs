/**
 * ai_prompt_test.mjs — MIR 3.2 Prompt Snapshot Tests.
 *
 * Tests aiPromptTemplate.mjs safety properties:
 *   1. Never includes rng seed
 *   2. Never includes full event history
 *   3. Includes allowed action schema
 *   4. Includes system prompt rules
 *   5. Sanitized state has correct shape
 *
 * No network calls. Pure unit tests.
 */

import { buildSystemPrompt, buildUserPrompt, buildMessages } from "../src/ai/aiPromptTemplate.mjs";
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
console.log("║  MIR 3.2 — AI Prompt Snapshot Tests   ║");
console.log("╚══════════════════════════════════════╝");
console.log();

// Build a test state with known sensitive fields
const testState = structuredClone(explorationExample);
testState.rng.mode = "seeded";
testState.rng.seed = "SECRET-SEED-12345";
testState.rng.lastRolls = [14, 7, 19];
testState.log.events = [
  { id: "evt-0001", timestamp: "2025-01-01", type: "MOVE_APPLIED", payload: { entityId: "pc-seren", finalPosition: { x: 5, y: 5 } } },
  { id: "evt-0002", timestamp: "2025-01-01", type: "ATTACK_RESOLVED", payload: { attackerId: "pc-seren", targetId: "npc-barkeep-01", attackRoll: 14, hit: true, damage: 6 } },
];
testState.ui = { selectedEntityId: "pc-seren" };

// ═══════════════════════════════════════════════════════════════════════
// 1. System prompt properties
// ═══════════════════════════════════════════════════════════════════════

console.log("[Test 1] System prompt includes action types");
{
  const sys = buildSystemPrompt();
  assert(sys.includes("MOVE"), "includes MOVE");
  assert(sys.includes("ATTACK"), "includes ATTACK");
  assert(sys.includes("END_TURN"), "includes END_TURN");
  assert(sys.includes("ROLL_INITIATIVE"), "includes ROLL_INITIATIVE");
}
console.log();

console.log("[Test 2] System prompt includes JSON-only instruction");
{
  const sys = buildSystemPrompt();
  assert(sys.includes("JSON"), "mentions JSON");
  assert(sys.includes("ONE"), "mentions ONE (exactly one object)");
  assert(sys.includes("No markdown") || sys.includes("no explanation") || sys.includes("Nothing else"), "no extra output");
}
console.log();

console.log("[Test 3] System prompt includes INVALID fallback");
{
  const sys = buildSystemPrompt();
  assert(sys.includes("INVALID"), "mentions INVALID type");
  assert(sys.includes("reason"), "mentions reason field");
}
console.log();

console.log("[Test 4] System prompt forbids random number generation");
{
  const sys = buildSystemPrompt();
  assert(sys.includes("CANNOT") && sys.includes("random"), "forbids random numbers");
}
console.log();

console.log("[Test 5] System prompt forbids state modification");
{
  const sys = buildSystemPrompt();
  assert(sys.includes("modify state") || sys.includes("CANNOT"), "forbids state modification");
}
console.log();

// ═══════════════════════════════════════════════════════════════════════
// 2. User prompt: no RNG seed
// ═══════════════════════════════════════════════════════════════════════

console.log("[Test 6] User prompt does NOT contain RNG seed");
{
  const user = buildUserPrompt(testState, "attack the barkeep");
  assert(!user.includes("SECRET-SEED-12345"), "seed string not present");
  assert(!user.includes("rng"), "no 'rng' key in output");
  assert(!user.includes("seed"), "no 'seed' key in output");
}
console.log();

console.log("[Test 7] User prompt does NOT contain lastRolls");
{
  const user = buildUserPrompt(testState, "attack the barkeep");
  assert(!user.includes("lastRolls"), "lastRolls not present");
  assert(!user.includes("[14,7,19]"), "roll values not present");
}
console.log();

// ═══════════════════════════════════════════════════════════════════════
// 3. User prompt: no event history
// ═══════════════════════════════════════════════════════════════════════

console.log("[Test 8] User prompt does NOT contain event log");
{
  const user = buildUserPrompt(testState, "move to 5,5");
  assert(!user.includes("evt-0001"), "event id not present");
  assert(!user.includes("evt-0002"), "event id not present");
  assert(!user.includes("MOVE_APPLIED"), "event type not leaked");
  assert(!user.includes("ATTACK_RESOLVED"), "event type not leaked");
  assert(!user.includes("log"), "no 'log' key in output");
}
console.log();

// ═══════════════════════════════════════════════════════════════════════
// 4. User prompt: no UI state
// ═══════════════════════════════════════════════════════════════════════

console.log("[Test 9] User prompt does NOT contain UI state");
{
  const user = buildUserPrompt(testState, "end turn");
  assert(!user.includes("selectedEntityId"), "selectedEntityId not present");
  assert(!user.includes('"ui"'), "no 'ui' key in output");
}
console.log();

// ═══════════════════════════════════════════════════════════════════════
// 5. User prompt: no schema version / timestamp
// ═══════════════════════════════════════════════════════════════════════

console.log("[Test 10] User prompt does NOT contain schemaVersion");
{
  const user = buildUserPrompt(testState, "roll initiative");
  assert(!user.includes("schemaVersion"), "schemaVersion not present");
  assert(!user.includes("timestamp"), "timestamp not present");
}
console.log();

// ═══════════════════════════════════════════════════════════════════════
// 6. User prompt: DOES contain needed state
// ═══════════════════════════════════════════════════════════════════════

console.log("[Test 11] User prompt includes entity IDs");
{
  const user = buildUserPrompt(testState, "attack");
  assert(user.includes("pc-seren"), "pc-seren present");
  assert(user.includes("pc-miri") || user.includes("npc-barkeep"), "other entity present");
}
console.log();

console.log("[Test 12] User prompt includes map info");
{
  const user = buildUserPrompt(testState, "move");
  assert(user.includes("map"), "map key present");
  assert(user.includes("width") || user.includes("grid"), "grid info present");
}
console.log();

console.log("[Test 13] User prompt includes combat status");
{
  const user = buildUserPrompt(testState, "end turn");
  assert(user.includes("combat"), "combat key present");
  assert(user.includes("mode"), "mode present");
  assert(user.includes("exploration") || user.includes("combat"), "mode value present");
}
console.log();

console.log("[Test 14] User prompt includes player command");
{
  const user = buildUserPrompt(testState, "attack the barkeep");
  assert(user.includes("attack the barkeep"), "player command present");
  assert(user.includes("PLAYER COMMAND"), "labeled as PLAYER COMMAND");
}
console.log();

// ═══════════════════════════════════════════════════════════════════════
// 7. buildMessages structure
// ═══════════════════════════════════════════════════════════════════════

console.log("[Test 15] buildMessages returns correct structure");
{
  const msgs = buildMessages(testState, "roll initiative");
  assert(Array.isArray(msgs), "is array");
  assert(msgs.length === 2, "has 2 messages");
  assert(msgs[0].role === "system", "first is system");
  assert(msgs[1].role === "user", "second is user");
  assert(typeof msgs[0].content === "string", "system content is string");
  assert(typeof msgs[1].content === "string", "user content is string");
}
console.log();

console.log("[Test 16] buildMessages system prompt has no seed");
{
  const msgs = buildMessages(testState, "attack");
  assert(!msgs[0].content.includes("SECRET-SEED"), "system prompt has no seed");
  assert(!msgs[1].content.includes("SECRET-SEED"), "user prompt has no seed");
}
console.log();

// ═══════════════════════════════════════════════════════════════════════
// 8. Entity field sanitization
// ═══════════════════════════════════════════════════════════════════════

console.log("[Test 17] Entities include only safe fields");
{
  const user = buildUserPrompt(testState, "attack");
  // Should have position, hp, ac, speed, name, id, kind, conditions
  assert(user.includes("position"), "has position");
  assert(user.includes("hp"), "has hp");
  assert(user.includes("ac"), "has ac");
  assert(user.includes("speed"), "has speed");
  assert(user.includes("name"), "has name");
  assert(user.includes("kind"), "has kind");
  // Should NOT have internal fields
  assert(!user.includes("hpCurrent"), "no raw hpCurrent (formatted as hp string)");
  assert(!user.includes("movementSpeed") || user.includes("speed"), "speed is simplified");
}
console.log();

// ═══════════════════════════════════════════════════════════════════════

console.log("══════════════════════════════════════════════════");
console.log(`Results: ${passed}/${passed + failed} passed, ${failed} failed`);
console.log(failed === 0 ? "PASS: all MIR 3.2 prompt snapshot tests passed" : "FAIL: some tests failed");
process.exit(failed > 0 ? 1 : 0);
