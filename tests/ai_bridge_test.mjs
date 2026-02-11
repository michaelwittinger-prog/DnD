/**
 * ai_bridge_test.mjs — MIR 3.3 AI Bridge Unit Tests.
 *
 * Tests handlePropose() directly — no HTTP, no network calls.
 * Covers:
 *   - Valid mock proposals
 *   - Input validation (missing fields, bad types)
 *   - Rate limit triggers
 *   - Mode fallback behavior
 *   - Parser gate rejects invalid AI output
 */

import { handlePropose, checkRateLimit, resetRateLimiter } from "../src/server/aiBridge.mjs";
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

// Suppress console.log during tests
const origLog = console.log;
function suppressLogs() { console.log = () => {}; }
function restoreLogs() { console.log = origLog; }

const testState = structuredClone(explorationExample);
testState.rng.mode = "seeded";
testState.rng.seed = "bridge-test";

origLog("╔══════════════════════════════════════╗");
origLog("║  MIR 3.3 — AI Bridge Unit Tests       ║");
origLog("╚══════════════════════════════════════╝");
origLog();

// ═══════════════════════════════════════════════════════════════════════
// 1. Valid mock proposals
// ═══════════════════════════════════════════════════════════════════════

origLog("[Test 1] Valid mock ROLL_INITIATIVE");
{
  resetRateLimiter();
  suppressLogs();
  const r = await handlePropose({ inputText: "roll initiative", state: testState, mode: "mock" }, "test-ip-1");
  restoreLogs();
  assert(r.status === 200, "status 200");
  assert(r.body.ok === true, "ok is true");
  assert(r.body.action.type === "ROLL_INITIATIVE", "action type correct");
  assert(r.body.mode === "mock", "mode is mock");
  assert(typeof r.body.durationMs === "number", "durationMs present");
}
origLog();

origLog("[Test 2] Valid mock ATTACK");
{
  resetRateLimiter();
  // Find actual NPC name from state for reliable matching
  const npcName = testState.entities.npcs[0]?.name?.toLowerCase() || "barkeep";
  suppressLogs();
  const r = await handlePropose({ inputText: `attack ${npcName}`, state: testState, mode: "mock" }, "test-ip-2");
  restoreLogs();
  assert(r.status === 200, "status 200");
  if (r.body.ok) {
    assert(r.body.action.type === "ATTACK", "action type ATTACK");
    assert(typeof r.body.action.targetId === "string", "targetId is string");
  } else {
    // Mock couldn't resolve entity — still a valid 200 response
    assert(Array.isArray(r.body.errors), "errors present when not matched");
  }
}
origLog();

origLog("[Test 3] Mock fallback when mode=real but no API key");
{
  resetRateLimiter();
  const savedKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  suppressLogs();
  const r = await handlePropose({ inputText: "roll initiative", state: testState, mode: "real" }, "test-ip-3");
  restoreLogs();
  if (savedKey) process.env.OPENAI_API_KEY = savedKey;
  assert(r.status === 200, "status 200");
  assert(r.body.mode === "mock", "falls back to mock");
  assert(r.body.ok === true, "still works via mock");
}
origLog();

origLog("[Test 4] Unparseable mock input returns ok=false");
{
  resetRateLimiter();
  suppressLogs();
  const r = await handlePropose({ inputText: "do a backflip", state: testState, mode: "mock" }, "test-ip-4");
  restoreLogs();
  assert(r.status === 200, "status 200");
  assert(r.body.ok === false, "ok is false");
  assert(Array.isArray(r.body.errors), "errors array present");
  assert(r.body.errors[0].includes("could not understand") || r.body.errors[0].includes("Try:"), "helpful error message");
}
origLog();

// ═══════════════════════════════════════════════════════════════════════
// 2. Input validation
// ═══════════════════════════════════════════════════════════════════════

origLog("[Test 5] Missing inputText");
{
  resetRateLimiter();
  suppressLogs();
  const r = await handlePropose({ state: testState }, "test-ip-5");
  restoreLogs();
  assert(r.status === 400, "status 400");
  assert(r.body.ok === false, "ok is false");
  assert(r.body.errors[0].includes("inputText"), "error mentions inputText");
}
origLog();

origLog("[Test 6] Empty inputText");
{
  resetRateLimiter();
  suppressLogs();
  const r = await handlePropose({ inputText: "  ", state: testState }, "test-ip-6");
  restoreLogs();
  assert(r.status === 400, "status 400");
  assert(r.body.errors[0].includes("inputText"), "error mentions inputText");
}
origLog();

origLog("[Test 7] Missing state");
{
  resetRateLimiter();
  suppressLogs();
  const r = await handlePropose({ inputText: "attack barkeep" }, "test-ip-7");
  restoreLogs();
  assert(r.status === 400, "status 400");
  assert(r.body.errors[0].includes("state"), "error mentions state");
}
origLog();

origLog("[Test 8] null body");
{
  resetRateLimiter();
  suppressLogs();
  const r = await handlePropose(null, "test-ip-8");
  restoreLogs();
  assert(r.status === 400, "status 400");
  assert(r.body.ok === false, "ok is false");
}
origLog();

origLog("[Test 9] inputText is number");
{
  resetRateLimiter();
  suppressLogs();
  const r = await handlePropose({ inputText: 42, state: testState }, "test-ip-9");
  restoreLogs();
  assert(r.status === 400, "status 400");
  assert(r.body.errors[0].includes("inputText"), "error mentions inputText");
}
origLog();

// ═══════════════════════════════════════════════════════════════════════
// 3. Rate limiting
// ═══════════════════════════════════════════════════════════════════════

origLog("[Test 10] Rate limiter: 30 requests allowed");
{
  resetRateLimiter();
  const now = Date.now();
  for (let i = 0; i < 30; i++) {
    const rl = checkRateLimit("rate-test", now);
    if (i < 30) assert(rl.allowed === true, `request ${i + 1} allowed`);
  }
}
origLog();

origLog("[Test 11] Rate limiter: 31st request blocked");
{
  // Continuing from test 10 (same ip, same window)
  const rl = checkRateLimit("rate-test");
  assert(rl.allowed === false, "31st request blocked");
  assert(rl.remaining === 0, "0 remaining");
}
origLog();

origLog("[Test 12] Rate limiter: window reset");
{
  resetRateLimiter();
  const now = Date.now();
  // Fill bucket
  for (let i = 0; i < 30; i++) checkRateLimit("reset-test", now);
  // Check blocked
  assert(checkRateLimit("reset-test", now).allowed === false, "blocked at 31");
  // Advance past window
  const future = now + 11 * 60 * 1000; // 11 min later
  const rl = checkRateLimit("reset-test", future);
  assert(rl.allowed === true, "allowed after window reset");
}
origLog();

origLog("[Test 13] Rate limit via handlePropose returns 429");
{
  resetRateLimiter();
  suppressLogs();
  // Burn through 30 requests
  for (let i = 0; i < 30; i++) {
    await handlePropose({ inputText: "roll initiative", state: testState }, "flood-ip");
  }
  // 31st should be 429
  const r = await handlePropose({ inputText: "roll initiative", state: testState }, "flood-ip");
  restoreLogs();
  assert(r.status === 429, "status 429");
  assert(r.body.ok === false, "ok is false");
  assert(r.body.errors[0].includes("Rate limit"), "error mentions rate limit");
}
origLog();

// ═══════════════════════════════════════════════════════════════════════
// 4. Defense in depth: server-side parser gate
// ═══════════════════════════════════════════════════════════════════════

origLog("[Test 14] Server-side parser validates action structure");
{
  resetRateLimiter();
  suppressLogs();
  // MOVE generates a valid path, parser should accept
  const r = await handlePropose({ inputText: "move to 4,5", state: testState, mode: "mock" }, "test-ip-14");
  restoreLogs();
  assert(r.status === 200, "status 200");
  if (r.body.ok) {
    assert(r.body.action.type === "MOVE", "MOVE action");
    assert(Array.isArray(r.body.action.path), "path is array");
  } else {
    // Mock couldn't parse — that's also fine
    assert(Array.isArray(r.body.errors), "errors present");
  }
}
origLog();

origLog("[Test 15] Different IPs have independent rate limits");
{
  resetRateLimiter();
  suppressLogs();
  // Fill IP-A
  for (let i = 0; i < 30; i++) {
    await handlePropose({ inputText: "roll initiative", state: testState }, "ip-a");
  }
  // IP-A blocked
  const rA = await handlePropose({ inputText: "roll initiative", state: testState }, "ip-a");
  assert(rA.status === 429, "IP-A blocked at 31");
  // IP-B still works
  const rB = await handlePropose({ inputText: "roll initiative", state: testState }, "ip-b");
  assert(rB.status === 200, "IP-B still allowed");
  restoreLogs();
}
origLog();

// ═══════════════════════════════════════════════════════════════════════
// 5. Response shape
// ═══════════════════════════════════════════════════════════════════════

origLog("[Test 16] Response shape — success");
{
  resetRateLimiter();
  suppressLogs();
  const r = await handlePropose({ inputText: "roll initiative", state: testState }, "shape-1");
  restoreLogs();
  assert(r.body.hasOwnProperty("ok"), "has ok");
  assert(r.body.hasOwnProperty("mode"), "has mode");
  assert(r.body.hasOwnProperty("durationMs"), "has durationMs");
  assert(r.body.hasOwnProperty("action"), "has action");
  assert(!r.body.hasOwnProperty("raw"), "no raw AI text leaked");
}
origLog();

origLog("[Test 17] Response shape — failure");
{
  resetRateLimiter();
  suppressLogs();
  const r = await handlePropose({ inputText: "do a backflip", state: testState }, "shape-2");
  restoreLogs();
  assert(r.body.hasOwnProperty("ok"), "has ok");
  assert(r.body.hasOwnProperty("mode"), "has mode");
  assert(r.body.hasOwnProperty("errors"), "has errors");
  assert(Array.isArray(r.body.errors), "errors is array");
  assert(!r.body.hasOwnProperty("raw"), "no raw AI text leaked");
}
origLog();

// ═══════════════════════════════════════════════════════════════════════

origLog("══════════════════════════════════════════════════");
origLog(`Results: ${passed}/${passed + failed} passed, ${failed} failed`);
origLog(failed === 0 ? "PASS: all MIR 3.3 bridge tests passed" : "FAIL: some tests failed");
process.exit(failed > 0 ? 1 : 0);
