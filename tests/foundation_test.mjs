/**
 * foundation_test.mjs — Tests for MIR Foundation Infrastructure.
 *
 * Tests: structured logger, runtime assertions, barrel exports.
 */

import {
  createLogger, setLogLevel, getLogLevel, setLogSink, resetLogSink,
  muteAll, unmuteAll, correlationId,
} from "../src/core/logger.mjs";

import {
  MirAssertionError, mirAssert, mirAssertDefined, mirAssertType,
  mirAssertNonEmptyString, mirAssertNonNegativeInt, mirAssertArray,
  mirAssertOneOf, mirAssertNonEmpty, mirUnreachable,
} from "../src/core/assert.mjs";

// Barrel export test imports
import { V, ALL_CODES } from "../src/core/index.mjs";
import { applyAction, ErrorCode } from "../src/engine/index.mjs";
import { parseAiAction } from "../src/ai/index.mjs";
import { validateAll, explorationExample } from "../src/state/index.mjs";

console.log("\n╔══════════════════════════════════════╗");
console.log("║  MIR Foundation — Infrastructure Tests ║");
console.log("╚══════════════════════════════════════╝\n");

let passed = 0, failed = 0;
const check = (c, l) => { if (c) { console.log(`  ✅ ${l}`); passed++; } else { console.log(`  ❌ ${l}`); failed++; } };

// ════════════════════════════════════════════════════════════════════
// SECTION 1: Structured Logger
// ════════════════════════════════════════════════════════════════════
console.log("[Section 1] Structured Logger");

// Test 1.1: Create logger with valid module
console.log("\n[Test 1.1] Create logger — valid modules");
{
  const validModules = ["engine", "ai", "ui", "state", "core", "replay", "scenario", "pipeline", "server", "validation"];
  for (const mod of validModules) {
    const log = createLogger(mod);
    check(typeof log.debug === "function", `createLogger("${mod}") has debug()`);
    check(typeof log.info === "function", `createLogger("${mod}") has info()`);
    check(typeof log.warn === "function", `createLogger("${mod}") has warn()`);
    check(typeof log.error === "function", `createLogger("${mod}") has error()`);
    check(typeof log.timed === "function", `createLogger("${mod}") has timed()`);
  }
}

// Test 1.2: Create logger with invalid module
console.log("\n[Test 1.2] Create logger — invalid module throws");
{
  let threw = false;
  try { createLogger("invalid-module"); } catch (e) { threw = true; }
  check(threw, "createLogger('invalid-module') throws");

  threw = false;
  try { createLogger(""); } catch (e) { threw = true; }
  check(threw, "createLogger('') throws");
}

// Test 1.3: Log level filtering
console.log("\n[Test 1.3] Log level filtering");
{
  const entries = [];
  setLogSink((entry) => entries.push(entry));

  const log = createLogger("engine");

  // At info level: debug suppressed, info/warn/error pass
  setLogLevel("info");
  entries.length = 0;
  log.debug("DBG_TEST", { x: 1 });
  log.info("INFO_TEST", { x: 2 });
  log.warn("WARN_TEST", { x: 3 });
  log.error("ERR_TEST", { x: 4 });
  check(entries.length === 3, `info level: 3 entries (got ${entries.length})`);
  check(entries[0].event === "INFO_TEST", "First entry is INFO");
  check(entries[1].event === "WARN_TEST", "Second entry is WARN");
  check(entries[2].event === "ERR_TEST", "Third entry is ERROR");

  // At debug level: all pass
  setLogLevel("debug");
  entries.length = 0;
  log.debug("DBG", { x: 1 });
  log.info("INF", { x: 2 });
  check(entries.length === 2, `debug level: 2 entries`);

  // At warn level: debug+info suppressed
  setLogLevel("warn");
  entries.length = 0;
  log.debug("DBG", {});
  log.info("INF", {});
  log.warn("WRN", {});
  log.error("ERR", {});
  check(entries.length === 2, `warn level: 2 entries`);

  // At error level: only error
  setLogLevel("error");
  entries.length = 0;
  log.debug("D", {}); log.info("I", {}); log.warn("W", {}); log.error("E", {});
  check(entries.length === 1, `error level: 1 entry`);

  // At silent level: nothing
  setLogLevel("silent");
  entries.length = 0;
  log.debug("D", {}); log.info("I", {}); log.warn("W", {}); log.error("E", {});
  check(entries.length === 0, `silent level: 0 entries`);

  // Reset
  setLogLevel("info");
  resetLogSink();
}

// Test 1.4: Log entry structure
console.log("\n[Test 1.4] Log entry structure");
{
  const entries = [];
  setLogSink((entry) => entries.push(entry));
  setLogLevel("debug");

  const log = createLogger("ai");
  log.info("AI_CALL_START", { model: "gpt-4o-mini" }, { correlationId: "cid-123", durationMs: 42 });

  check(entries.length === 1, "One entry logged");
  const e = entries[0];
  check(typeof e.timestamp === "string", "Has timestamp");
  check(e.level === "info", "Level is info");
  check(e.module === "ai", "Module is ai");
  check(e.event === "AI_CALL_START", "Event is AI_CALL_START");
  check(e.payload.model === "gpt-4o-mini", "Payload has model");
  check(e.correlationId === "cid-123", "Has correlationId");
  check(e.durationMs === 42, "Has durationMs");

  setLogLevel("info");
  resetLogSink();
}

// Test 1.5: Mute/Unmute
console.log("\n[Test 1.5] Mute/Unmute");
{
  const entries = [];
  setLogSink((entry) => entries.push(entry));

  const log = createLogger("core");
  muteAll();
  log.info("SHOULD_NOT_APPEAR", {});
  log.error("ALSO_NOT", {});
  check(entries.length === 0, "Muted: 0 entries");

  unmuteAll();
  log.info("SHOULD_APPEAR", {});
  check(entries.length === 1, "Unmuted: 1 entry");

  resetLogSink();
}

// Test 1.6: getLogLevel
console.log("\n[Test 1.6] getLogLevel");
{
  setLogLevel("warn");
  check(getLogLevel() === "warn", "getLogLevel returns 'warn'");
  setLogLevel("debug");
  check(getLogLevel() === "debug", "getLogLevel returns 'debug'");
  setLogLevel("info"); // reset
}

// Test 1.7: setLogLevel with invalid value
console.log("\n[Test 1.7] setLogLevel — invalid throws");
{
  let threw = false;
  try { setLogLevel("verbose"); } catch { threw = true; }
  check(threw, "setLogLevel('verbose') throws");
}

// Test 1.8: setLogSink with non-function
console.log("\n[Test 1.8] setLogSink — non-function throws");
{
  let threw = false;
  try { setLogSink("not a function"); } catch { threw = true; }
  check(threw, "setLogSink('string') throws");
}

// Test 1.9: correlationId uniqueness
console.log("\n[Test 1.9] correlationId uniqueness");
{
  const ids = new Set();
  for (let i = 0; i < 100; i++) ids.add(correlationId());
  check(ids.size === 100, "100 unique correlationIds");

  const custom = correlationId("action");
  check(custom.startsWith("action-"), "Custom prefix works");
}

// Test 1.10: timed() logs duration
console.log("\n[Test 1.10] timed() logs duration");
{
  const entries = [];
  setLogSink((entry) => entries.push(entry));

  const log = createLogger("engine");
  const result = await log.timed("PROCESS_ACTION", () => 42, { extra: "data" });
  check(result === 42, "timed() returns function result");
  check(entries.length === 1, "timed() logged 1 entry");
  check(entries[0].durationMs != null, "Entry has durationMs");
  check(entries[0].payload.status === "ok", "Payload has status: ok");
  check(entries[0].payload.extra === "data", "Payload includes extra data");

  resetLogSink();
}

// Test 1.11: timed() logs error on throw
console.log("\n[Test 1.11] timed() logs error on throw");
{
  const entries = [];
  setLogSink((entry) => entries.push(entry));

  const log = createLogger("engine");
  let threw = false;
  try {
    await log.timed("FAILING_OP", () => { throw new Error("boom"); });
  } catch { threw = true; }
  check(threw, "timed() rethrows");
  check(entries.length === 1, "timed() logged 1 error entry");
  check(entries[0].level === "error", "Entry level is error");
  check(entries[0].payload.status === "error", "Payload has status: error");
  check(entries[0].payload.error === "boom", "Payload has error message");

  resetLogSink();
}

// ════════════════════════════════════════════════════════════════════
// SECTION 2: Runtime Assertions
// ════════════════════════════════════════════════════════════════════
console.log("\n[Section 2] Runtime Assertions");

// Test 2.1: mirAssert — truthy passes
console.log("\n[Test 2.1] mirAssert — truthy passes");
{
  let threw = false;
  try { mirAssert(true, "test", "should pass"); } catch { threw = true; }
  check(!threw, "mirAssert(true) does not throw");

  threw = false;
  try { mirAssert(1, "test", "nonzero"); } catch { threw = true; }
  check(!threw, "mirAssert(1) does not throw");

  threw = false;
  try { mirAssert("hello", "test", "string"); } catch { threw = true; }
  check(!threw, "mirAssert('hello') does not throw");
}

// Test 2.2: mirAssert — falsy throws
console.log("\n[Test 2.2] mirAssert — falsy throws");
{
  let threw = false;
  let err = null;
  try { mirAssert(false, "myFn", "should be true"); } catch (e) { threw = true; err = e; }
  check(threw, "mirAssert(false) throws");
  check(err instanceof MirAssertionError, "Error is MirAssertionError");
  check(err.fn === "myFn", "Error has fn='myFn'");
  check(err.what === "should be true", "Error has correct what");
  check(err.message.includes("[MIR:myFn]"), "Message includes [MIR:myFn]");

  threw = false;
  try { mirAssert(null, "x", "y"); } catch { threw = true; }
  check(threw, "mirAssert(null) throws");

  threw = false;
  try { mirAssert(0, "x", "y"); } catch { threw = true; }
  check(threw, "mirAssert(0) throws");

  threw = false;
  try { mirAssert("", "x", "y"); } catch { threw = true; }
  check(threw, "mirAssert('') throws");

  threw = false;
  try { mirAssert(undefined, "x", "y"); } catch { threw = true; }
  check(threw, "mirAssert(undefined) throws");
}

// Test 2.3: mirAssertDefined
console.log("\n[Test 2.3] mirAssertDefined");
{
  const val = mirAssertDefined(42, "fn", "test");
  check(val === 42, "Returns value on success");

  const obj = mirAssertDefined({ a: 1 }, "fn", "obj");
  check(obj.a === 1, "Returns object on success");

  let threw = false;
  try { mirAssertDefined(null, "fn", "test"); } catch (e) {
    threw = true;
    check(e.message.includes("null"), "null message");
  }
  check(threw, "null throws");

  threw = false;
  try { mirAssertDefined(undefined, "fn", "test"); } catch (e) {
    threw = true;
    check(e.message.includes("undefined"), "undefined message");
  }
  check(threw, "undefined throws");

  // 0, false, "" are defined (not null/undefined)
  threw = false;
  try { mirAssertDefined(0, "fn", "zero"); } catch { threw = true; }
  check(!threw, "0 does not throw");

  threw = false;
  try { mirAssertDefined(false, "fn", "false"); } catch { threw = true; }
  check(!threw, "false does not throw");
}

// Test 2.4: mirAssertType
console.log("\n[Test 2.4] mirAssertType");
{
  let threw = false;
  try { mirAssertType("hello", "string", "fn", "val"); } catch { threw = true; }
  check(!threw, "string matches string");

  threw = false;
  try { mirAssertType(42, "number", "fn", "val"); } catch { threw = true; }
  check(!threw, "number matches number");

  threw = false;
  try { mirAssertType(42, "string", "fn", "val"); } catch (e) {
    threw = true;
    check(e.message.includes("must be string, got number"), "Correct mismatch message");
  }
  check(threw, "number vs string throws");
}

// Test 2.5: mirAssertNonEmptyString
console.log("\n[Test 2.5] mirAssertNonEmptyString");
{
  let threw = false;
  try { mirAssertNonEmptyString("hello", "fn", "val"); } catch { threw = true; }
  check(!threw, "'hello' passes");

  threw = false;
  try { mirAssertNonEmptyString("", "fn", "val"); } catch { threw = true; }
  check(threw, "'' throws");

  threw = false;
  try { mirAssertNonEmptyString(42, "fn", "val"); } catch { threw = true; }
  check(threw, "42 throws");
}

// Test 2.6: mirAssertNonNegativeInt
console.log("\n[Test 2.6] mirAssertNonNegativeInt");
{
  let threw = false;
  try { mirAssertNonNegativeInt(0, "fn", "val"); } catch { threw = true; }
  check(!threw, "0 passes");

  threw = false;
  try { mirAssertNonNegativeInt(42, "fn", "val"); } catch { threw = true; }
  check(!threw, "42 passes");

  threw = false;
  try { mirAssertNonNegativeInt(-1, "fn", "val"); } catch { threw = true; }
  check(threw, "-1 throws");

  threw = false;
  try { mirAssertNonNegativeInt(3.5, "fn", "val"); } catch { threw = true; }
  check(threw, "3.5 throws");

  threw = false;
  try { mirAssertNonNegativeInt("0", "fn", "val"); } catch { threw = true; }
  check(threw, "'0' throws");
}

// Test 2.7: mirAssertArray
console.log("\n[Test 2.7] mirAssertArray");
{
  let threw = false;
  try { mirAssertArray([], "fn", "val"); } catch { threw = true; }
  check(!threw, "[] passes");

  threw = false;
  try { mirAssertArray([1, 2, 3], "fn", "val"); } catch { threw = true; }
  check(!threw, "[1,2,3] passes");

  threw = false;
  try { mirAssertArray("not array", "fn", "val"); } catch { threw = true; }
  check(threw, "string throws");

  threw = false;
  try { mirAssertArray({}, "fn", "val"); } catch { threw = true; }
  check(threw, "{} throws");
}

// Test 2.8: mirAssertOneOf
console.log("\n[Test 2.8] mirAssertOneOf");
{
  const allowed = new Set(["MOVE", "ATTACK", "END_TURN"]);
  let threw = false;
  try { mirAssertOneOf("MOVE", allowed, "fn", "action"); } catch { threw = true; }
  check(!threw, "'MOVE' passes");

  threw = false;
  try { mirAssertOneOf("FIREBALL", allowed, "fn", "action"); } catch (e) {
    threw = true;
    check(e.message.includes("must be one of"), "Error lists allowed values");
  }
  check(threw, "'FIREBALL' throws");

  // Also works with arrays
  threw = false;
  try { mirAssertOneOf("ATTACK", ["MOVE", "ATTACK"], "fn", "action"); } catch { threw = true; }
  check(!threw, "Array argument works");
}

// Test 2.9: mirAssertNonEmpty
console.log("\n[Test 2.9] mirAssertNonEmpty");
{
  let threw = false;
  try { mirAssertNonEmpty([1], "fn", "events"); } catch { threw = true; }
  check(!threw, "[1] passes");

  threw = false;
  try { mirAssertNonEmpty([], "fn", "events"); } catch { threw = true; }
  check(threw, "[] throws");

  threw = false;
  try { mirAssertNonEmpty(null, "fn", "events"); } catch { threw = true; }
  check(threw, "null throws");
}

// Test 2.10: mirUnreachable
console.log("\n[Test 2.10] mirUnreachable");
{
  let threw = false;
  let err = null;
  try { mirUnreachable("switchCase", "unknown action type", "TELEPORT"); } catch (e) { threw = true; err = e; }
  check(threw, "mirUnreachable always throws");
  check(err.message.includes("Unreachable"), "Message says Unreachable");
  check(err.message.includes("TELEPORT"), "Message includes the value");
}

// Test 2.11: MirAssertionError properties
console.log("\n[Test 2.11] MirAssertionError properties");
{
  const err = new MirAssertionError("myFunc", "value out of range", 999);
  check(err.name === "MirAssertionError", "name is MirAssertionError");
  check(err.fn === "myFunc", "fn is myFunc");
  check(err.what === "value out of range", "what is correct");
  check(err.actual === 999, "actual is 999");
  check(err instanceof Error, "extends Error");
  check(err.message.includes("999"), "message includes actual value");
}

// ════════════════════════════════════════════════════════════════════
// SECTION 3: Barrel Exports
// ════════════════════════════════════════════════════════════════════
console.log("\n[Section 3] Barrel Exports");

// Test 3.1: Core barrel
console.log("\n[Test 3.1] Core barrel export");
{
  check(typeof V === "object", "V exported from core/index");
  check(V.MOVE_TILE_OCCUPIED === "MOVE_TILE_OCCUPIED", "V has violation codes");
  check(ALL_CODES instanceof Set, "ALL_CODES is a Set");
  check(ALL_CODES.size > 0, "ALL_CODES has entries");
}

// Test 3.2: Engine barrel
console.log("\n[Test 3.2] Engine barrel export");
{
  check(typeof applyAction === "function", "applyAction exported from engine/index");
  check(typeof ErrorCode === "object", "ErrorCode exported from engine/index");
  check(ErrorCode.INVALID_ACTION === "INVALID_ACTION", "ErrorCode values correct");
}

// Test 3.3: AI barrel
console.log("\n[Test 3.3] AI barrel export");
{
  check(typeof parseAiAction === "function", "parseAiAction exported from ai/index");
  const r = parseAiAction('{"type":"MOVE","entityId":"pc-seren","path":[{"x":1,"y":1}]}');
  check(r.ok === true, "parseAiAction works through barrel");
  check(r.action.type === "MOVE", "Parsed action is MOVE");
}

// Test 3.4: State barrel
console.log("\n[Test 3.4] State barrel export");
{
  check(typeof validateAll === "function", "validateAll exported from state/index");
  check(typeof explorationExample === "object", "explorationExample exported");
  check(explorationExample.map.name === "The Rusty Tankard", "explorationExample has correct map");
  const vr = validateAll(explorationExample);
  check(vr.ok === true, "explorationExample validates through barrel");
}

// Test 3.5: Barrel → engine integration
console.log("\n[Test 3.5] Barrel integration: engine works through barrel");
{
  const state = structuredClone(explorationExample);
  state.rng.mode = "seeded";
  state.rng.seed = "barrel-test";
  const r = applyAction(state, { type: "MOVE", entityId: "pc-seren", path: [{ x: 2, y: 4 }] });
  check(r.success, "applyAction succeeds through barrel imports");
  check(r.events[0].type === "MOVE_APPLIED", "Event correct through barrel");
}

// ════════════════════════════════════════════════════════════════════
console.log(`\n══════════════════════════════════════════════════`);
console.log(`Results: ${passed}/${passed + failed} passed, ${failed} failed`);
console.log(failed === 0 ? "PASS: all Foundation tests passed" : "FAIL: some Foundation tests failed");
if (failed) process.exit(1);
