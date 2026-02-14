/**
 * e2e_pipeline_test — End-to-end smoke tests for the full turn pipeline.
 *
 * Runs executeTurn() with game_state.example.json + each fixture.
 * This single test catches schema↔rules↔applier↔gatekeeper mismatches.
 *
 * Usage: node tests/e2e_pipeline_test.mjs
 */
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { executeTurn } from "../src/pipeline/executeTurn.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const STATE = resolve(ROOT, "game_state.example.json");

// ── Test helpers ───────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures = [];

function assert(cond, msg, detail) {
  if (cond) {
    passed++;
    console.log(`  ✅ ${msg}`);
  } else {
    failed++;
    const full = detail ? `${msg} — ${detail}` : msg;
    failures.push(full);
    console.log(`  ❌ ${msg}`);
    if (detail) console.log(`     ${detail}`);
  }
}

// ── Test cases ─────────────────────────────────────────────────────────

const FIXTURES = [
  {
    name: "Legal move + attack",
    fixture: "fixtures/ai_response_legal_move.json",
    expectOk: true,
    checks: (result) => {
      assert(!result.error, "No pipeline error", result.error);
      assert(result.gatekeeperResult === "passed", "Gatekeeper passed", `got: ${result.gatekeeperResult}`);
      assert(result.violations.length === 0, "No violations", `violations: ${JSON.stringify(result.violations)}`);
    },
  },
  {
    name: "Illegal collision",
    fixture: "fixtures/ai_response_illegal_collision.json",
    expectOk: false,
    checks: (result) => {
      assert(!result.error, "No pipeline crash", result.error);
      assert(result.violations.length > 0, "Has violations");
    },
  },
  {
    name: "Illegal spawn (no GM authority)",
    fixture: "fixtures/ai_response_illegal_spawn_no_gm.json",
    expectOk: false,
    checks: (result) => {
      assert(!result.error, "No pipeline crash", result.error);
      assert(result.violations.length > 0, "Has violations");
    },
  },
  {
    name: "Start combat",
    fixture: "fixtures/ai_response_start_combat.json",
    expectOk: true,
    checks: (result) => {
      assert(!result.error, "No pipeline error", result.error);
      assert(result.gatekeeperResult === "passed", "Gatekeeper passed", `got: ${result.gatekeeperResult}, gate: ${result.failureGate}`);
    },
  },
  {
    name: "End turn",
    fixture: "fixtures/ai_response_end_turn.json",
    // end_turn requires combat to be active, so this will fail on example state
    expectOk: false,
    checks: (result) => {
      assert(!result.error, "No pipeline crash", result.error);
    },
  },
];

// ── Runner ─────────────────────────────────────────────────────────────

const INTENT = {
  player_id: "pc-01",
  action: "test intent",
  free_text: "E2E smoke test",
};

console.log("═══════════════════════════════════════════");
console.log("  E2E Pipeline Smoke Test");
console.log("═══════════════════════════════════════════\n");

for (const tc of FIXTURES) {
  const fixturePath = resolve(ROOT, tc.fixture);
  console.log(`▸ ${tc.name} (${tc.fixture})`);

  try {
    const result = await executeTurn({
      statePath: STATE,
      intentObject: INTENT,
      fixturePath,
      sync: false, // don't sync to viewer during tests
    });

    assert(result.ok === tc.expectOk,
      `ok=${result.ok} (expected ${tc.expectOk})`,
      result.ok !== tc.expectOk
        ? `failureGate=${result.failureGate}, violations=${result.violations?.map(v => v.code).join(", ")}`
        : undefined
    );

    tc.checks(result);
  } catch (err) {
    failed++;
    failures.push(`${tc.name}: THREW ${err.message}`);
    console.log(`  ❌ Pipeline threw: ${err.message}`);
  }

  console.log();
}

// ── Summary ────────────────────────────────────────────────────────────

console.log("═══════════════════════════════════════════");
console.log(`  Results: ${passed} passed, ${failed} failed`);
if (failures.length > 0) {
  console.log("\n  Failures:");
  for (const f of failures) console.log(`    ✗ ${f}`);
}
console.log("═══════════════════════════════════════════");

process.exit(failed > 0 ? 1 : 0);
