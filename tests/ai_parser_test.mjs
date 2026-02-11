/**
 * ai_parser_test.mjs — MIR 3.2 Parser Contract Tests.
 *
 * Tests aiActionParser.mjs safety layer:
 *   - Accept valid MOVE, ATTACK, END_TURN, ROLL_INITIATIVE JSON
 *   - Reject non-JSON
 *   - Reject unknown types
 *   - Reject missing fields
 *   - Strip unknown fields
 *   - Reject state mutation injection attempts
 *
 * No network calls. Pure unit tests.
 */

import { parseAiAction } from "../src/ai/aiActionParser.mjs";

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
console.log("║  MIR 3.2 — AI Parser Contract Tests  ║");
console.log("╚══════════════════════════════════════╝");
console.log();

// ═══════════════════════════════════════════════════════════════════════
// 1. Accept valid actions
// ═══════════════════════════════════════════════════════════════════════

console.log("[Test 1] Accept valid MOVE");
{
  const r = parseAiAction('{"type":"MOVE","entityId":"pc-seren","path":[{"x":3,"y":3},{"x":4,"y":3}]}');
  assert(r.ok === true, "ok is true");
  assert(r.action.type === "MOVE", "type is MOVE");
  assert(r.action.entityId === "pc-seren", "entityId preserved");
  assert(Array.isArray(r.action.path), "path is array");
  assert(r.action.path.length === 2, "path has 2 steps");
  assert(r.action.path[0].x === 3 && r.action.path[0].y === 3, "first step correct");
}
console.log();

console.log("[Test 2] Accept valid ATTACK");
{
  const r = parseAiAction('{"type":"ATTACK","attackerId":"pc-seren","targetId":"npc-barkeep-01"}');
  assert(r.ok === true, "ok is true");
  assert(r.action.type === "ATTACK", "type is ATTACK");
  assert(r.action.attackerId === "pc-seren", "attackerId preserved");
  assert(r.action.targetId === "npc-barkeep-01", "targetId preserved");
}
console.log();

console.log("[Test 3] Accept valid END_TURN");
{
  const r = parseAiAction('{"type":"END_TURN","entityId":"pc-miri"}');
  assert(r.ok === true, "ok is true");
  assert(r.action.type === "END_TURN", "type is END_TURN");
  assert(r.action.entityId === "pc-miri", "entityId preserved");
}
console.log();

console.log("[Test 4] Accept valid ROLL_INITIATIVE");
{
  const r = parseAiAction('{"type":"ROLL_INITIATIVE"}');
  assert(r.ok === true, "ok is true");
  assert(r.action.type === "ROLL_INITIATIVE", "type is ROLL_INITIATIVE");
  assert(Object.keys(r.action).length === 1, "no extra fields");
}
console.log();

// ═══════════════════════════════════════════════════════════════════════
// 2. Reject non-JSON
// ═══════════════════════════════════════════════════════════════════════

console.log("[Test 5] Reject empty string");
{
  const r = parseAiAction("");
  assert(r.ok === false, "ok is false");
  assert(r.reason.includes("Empty"), "reason mentions empty");
}
console.log();

console.log("[Test 6] Reject null/undefined");
{
  const r1 = parseAiAction(null);
  assert(r1.ok === false, "null rejected");
  const r2 = parseAiAction(undefined);
  assert(r2.ok === false, "undefined rejected");
}
console.log();

console.log("[Test 7] Reject plain text");
{
  const r = parseAiAction("I think the player should move to the right");
  assert(r.ok === false, "ok is false");
  assert(r.reason.includes("Invalid JSON"), "reason mentions invalid JSON");
}
console.log();

console.log("[Test 8] Reject array JSON (inner object extracted, missing fields)");
{
  const r = parseAiAction('[{"type":"MOVE"}]');
  assert(r.ok === false, "array content rejected");
  // Parser extracts inner {}, then MOVE fails missing entityId
  assert(r.reason.includes("entityId") || r.reason.includes("JSON object"), "rejected for shape or missing fields");
}
console.log();

console.log("[Test 9] Reject number JSON");
{
  const r = parseAiAction("42");
  assert(r.ok === false, "number rejected");
}
console.log();

// ═══════════════════════════════════════════════════════════════════════
// 3. Reject unknown types
// ═══════════════════════════════════════════════════════════════════════

console.log("[Test 10] Reject unknown action type");
{
  const r = parseAiAction('{"type":"FLY","entityId":"pc-seren","destination":{"x":10,"y":10}}');
  assert(r.ok === false, "ok is false");
  assert(r.reason.includes("Disallowed"), "reason mentions disallowed");
}
console.log();

console.log("[Test 11] Reject SET_SEED from AI (not whitelisted)");
{
  const r = parseAiAction('{"type":"SET_SEED","seed":"hacked"}');
  assert(r.ok === false, "SET_SEED rejected");
  assert(r.reason.includes("Disallowed"), "reason mentions disallowed");
}
console.log();

console.log("[Test 12] Reject SPAWN_ENTITY from AI");
{
  const r = parseAiAction('{"type":"SPAWN_ENTITY","entityId":"evil-demon","position":{"x":0,"y":0}}');
  assert(r.ok === false, "SPAWN_ENTITY rejected");
}
console.log();

console.log("[Test 13] Handle INVALID type gracefully");
{
  const r = parseAiAction('{"type":"INVALID","reason":"Cannot fly"}');
  assert(r.ok === false, "INVALID type rejected");
  assert(r.reason.includes("AI declined"), "reason says AI declined");
  assert(r.reason.includes("Cannot fly"), "includes AI's reason");
}
console.log();

// ═══════════════════════════════════════════════════════════════════════
// 4. Reject missing fields
// ═══════════════════════════════════════════════════════════════════════

console.log("[Test 14] MOVE without entityId");
{
  const r = parseAiAction('{"type":"MOVE","path":[{"x":3,"y":3}]}');
  assert(r.ok === false, "rejected");
  assert(r.reason.includes("entityId"), "reason mentions entityId");
}
console.log();

console.log("[Test 15] MOVE without path");
{
  const r = parseAiAction('{"type":"MOVE","entityId":"pc-seren"}');
  assert(r.ok === false, "rejected");
  assert(r.reason.includes("path"), "reason mentions path");
}
console.log();

console.log("[Test 16] MOVE with empty path");
{
  const r = parseAiAction('{"type":"MOVE","entityId":"pc-seren","path":[]}');
  assert(r.ok === false, "rejected");
  assert(r.reason.includes("empty"), "reason mentions empty");
}
console.log();

console.log("[Test 17] MOVE with invalid path step");
{
  const r = parseAiAction('{"type":"MOVE","entityId":"pc-seren","path":[{"x":"three","y":3}]}');
  assert(r.ok === false, "rejected");
  assert(r.reason.includes("numeric"), "reason mentions numeric");
}
console.log();

console.log("[Test 18] ATTACK without attackerId");
{
  const r = parseAiAction('{"type":"ATTACK","targetId":"npc-barkeep-01"}');
  assert(r.ok === false, "rejected");
  assert(r.reason.includes("attackerId"), "reason mentions attackerId");
}
console.log();

console.log("[Test 19] ATTACK without targetId");
{
  const r = parseAiAction('{"type":"ATTACK","attackerId":"pc-seren"}');
  assert(r.ok === false, "rejected");
  assert(r.reason.includes("targetId"), "reason mentions targetId");
}
console.log();

console.log("[Test 20] END_TURN without entityId");
{
  const r = parseAiAction('{"type":"END_TURN"}');
  assert(r.ok === false, "rejected");
  assert(r.reason.includes("entityId"), "reason mentions entityId");
}
console.log();

console.log("[Test 21] Missing type field");
{
  const r = parseAiAction('{"entityId":"pc-seren","path":[{"x":3,"y":3}]}');
  assert(r.ok === false, "rejected");
  assert(r.reason.includes("type"), "reason mentions type");
}
console.log();

// ═══════════════════════════════════════════════════════════════════════
// 5. Strip unknown fields
// ═══════════════════════════════════════════════════════════════════════

console.log("[Test 22] Strip extra fields from MOVE");
{
  const r = parseAiAction('{"type":"MOVE","entityId":"pc-seren","path":[{"x":3,"y":3}],"narration":"walks forward","damage":10}');
  assert(r.ok === true, "accepted");
  assert(r.action.narration === undefined, "narration stripped");
  assert(r.action.damage === undefined, "damage stripped");
  assert(r.action.entityId === "pc-seren", "entityId kept");
  assert(Array.isArray(r.action.path), "path kept");
}
console.log();

console.log("[Test 23] Strip extra fields from ATTACK");
{
  const r = parseAiAction('{"type":"ATTACK","attackerId":"pc-seren","targetId":"npc-barkeep-01","damage":99,"critical":true}');
  assert(r.ok === true, "accepted");
  assert(r.action.damage === undefined, "damage stripped");
  assert(r.action.critical === undefined, "critical stripped");
  assert(r.action.attackerId === "pc-seren", "attackerId kept");
  assert(r.action.targetId === "npc-barkeep-01", "targetId kept");
}
console.log();

console.log("[Test 24] Strip extra fields from ROLL_INITIATIVE");
{
  const r = parseAiAction('{"type":"ROLL_INITIATIVE","order":["pc-seren","pc-miri"],"round":5}');
  assert(r.ok === true, "accepted");
  assert(r.action.order === undefined, "order stripped");
  assert(r.action.round === undefined, "round stripped");
  assert(Object.keys(r.action).length === 1, "only type remains");
}
console.log();

console.log("[Test 25] Path steps sanitized to integer x,y only");
{
  const r = parseAiAction('{"type":"MOVE","entityId":"pc-seren","path":[{"x":3.7,"y":2.1,"z":5,"label":"step1"}]}');
  assert(r.ok === true, "accepted");
  assert(r.action.path[0].x === 3, "x floored to int");
  assert(r.action.path[0].y === 2, "y floored to int");
  assert(r.action.path[0].z === undefined, "z stripped from path step");
  assert(r.action.path[0].label === undefined, "label stripped from path step");
}
console.log();

// ═══════════════════════════════════════════════════════════════════════
// 6. Reject state mutation injection
// ═══════════════════════════════════════════════════════════════════════

console.log("[Test 26] Reject direct HP mutation attempt");
{
  const r = parseAiAction('{"type":"SET_HP","entityId":"pc-seren","hpCurrent":0}');
  assert(r.ok === false, "SET_HP rejected");
  assert(r.reason.includes("Disallowed"), "reason mentions disallowed");
}
console.log();

console.log("[Test 27] Reject position override attempt");
{
  const r = parseAiAction('{"type":"SET_POSITION","entityId":"pc-seren","x":0,"y":0}');
  assert(r.ok === false, "SET_POSITION rejected");
}
console.log();

console.log("[Test 28] Reject combat mode override");
{
  const r = parseAiAction('{"type":"SET_COMBAT_MODE","mode":"exploration"}');
  assert(r.ok === false, "SET_COMBAT_MODE rejected");
}
console.log();

console.log("[Test 29] Reject __proto__ injection");
{
  const r = parseAiAction('{"type":"ROLL_INITIATIVE","__proto__":{"admin":true}}');
  assert(r.ok === true, "accepted (type is valid)");
  assert(r.action.__proto__ === undefined || !r.action.admin, "__proto__ stripped");
  assert(Object.keys(r.action).length === 1, "only type remains");
}
console.log();

console.log("[Test 30] Reject constructor injection");
{
  const r = parseAiAction('{"type":"ATTACK","attackerId":"pc-seren","targetId":"npc-barkeep-01","constructor":{"prototype":{"evil":true}}}');
  assert(r.ok === true, "accepted (valid action)");
  assert(r.action.constructor === undefined || typeof r.action.constructor === "function", "constructor not injected as data");
  assert(r.action.evil === undefined, "evil not injected");
}
console.log();

// ═══════════════════════════════════════════════════════════════════════
// 7. Edge cases: markdown-wrapped JSON
// ═══════════════════════════════════════════════════════════════════════

console.log("[Test 31] Accept JSON wrapped in markdown code block");
{
  const r = parseAiAction('```json\n{"type":"ROLL_INITIATIVE"}\n```');
  assert(r.ok === true, "markdown-wrapped JSON accepted");
  assert(r.action.type === "ROLL_INITIATIVE", "type correct");
}
console.log();

console.log("[Test 32] Accept JSON with leading text");
{
  const r = parseAiAction('Here is the action: {"type":"ATTACK","attackerId":"pc-seren","targetId":"npc-barkeep-01"}');
  assert(r.ok === true, "leading text tolerated");
  assert(r.action.type === "ATTACK", "type correct");
}
console.log();

// ═══════════════════════════════════════════════════════════════════════

console.log("══════════════════════════════════════════════════");
console.log(`Results: ${passed}/${passed + failed} passed, ${failed} failed`);
console.log(failed === 0 ? "PASS: all MIR 3.2 parser contract tests passed" : "FAIL: some tests failed");
process.exit(failed > 0 ? 1 : 0);
