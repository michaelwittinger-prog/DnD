/**
 * scenario_test.mjs — MIR 4.2 Scenario System Tests.
 *
 * Confirms:
 *   1. Each scenario file validates schema + invariants
 *   2. Each scenario has 2+ PCs, 2+ NPCs, terrain, seeded RNG
 *   3. listScenarios returns all scenario files
 *   4. loadScenario validates and returns bundle
 *   5. loadScenario rejects invalid inputs
 *   6. UI scenario list references all scenarios
 */

import { readFileSync } from "node:fs";
import { listScenarios } from "../src/scenarios/listScenarios.mjs";
import { loadScenario } from "../src/scenarios/loadScenario.mjs";
import { validateAll } from "../src/state/validation/index.mjs";
import { applyAction } from "../src/engine/applyAction.mjs";

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
console.log(`║  MIR 4.2 — Scenario System Tests      ║`);
console.log(`╚══════════════════════════════════════╝\n`);

// ── Test 1: Each scenario validates schema + invariants ─────────────

console.log("[Test 1] Each scenario validates schema + invariants");
{
  const scenarios = listScenarios();
  for (const { filename } of scenarios) {
    const result = loadScenario(filename);
    assert(result.ok, `${filename}: validates ok`);
    if (result.ok) {
      const v = validateAll(result.bundle.initialState);
      assert(v.ok, `${filename}: invariants pass`);
    }
  }
}

// ── Test 2: Each scenario has 2+ PCs, 2+ NPCs, terrain, seeded RNG ─

console.log("\n[Test 2] Each scenario has required content");
{
  const scenarios = listScenarios();
  for (const { filename } of scenarios) {
    const { bundle } = loadScenario(filename);
    const s = bundle.initialState;
    assert(s.entities.players.length >= 2, `${filename}: 2+ PCs (${s.entities.players.length})`);
    assert(s.entities.npcs.length >= 2, `${filename}: 2+ NPCs (${s.entities.npcs.length})`);
    assert(s.map.terrain.length >= 1, `${filename}: has terrain (${s.map.terrain.length})`);
    assert(s.rng.mode === "seeded", `${filename}: seeded RNG`);
    assert(typeof s.rng.seed === "string" && s.rng.seed.length > 0, `${filename}: has seed`);
  }
}

// ── Test 3: listScenarios returns all 3 scenario files ──────────────

console.log("\n[Test 3] listScenarios returns all scenario files");
{
  const scenarios = listScenarios();
  assert(scenarios.length >= 3, `found ${scenarios.length} scenarios (need ≥3)`);
  const names = scenarios.map((s) => s.filename);
  assert(names.includes("tavern_skirmish.scenario.json"), "tavern_skirmish found");
  assert(names.includes("corridor_ambush.scenario.json"), "corridor_ambush found");
  assert(names.includes("open_field_duel.scenario.json"), "open_field_duel found");
  for (const s of scenarios) {
    assert(s.meta && typeof s.meta.name === "string", `${s.filename} has meta.name`);
    assert(s.meta && typeof s.meta.id === "string", `${s.filename} has meta.id`);
  }
}

// ── Test 4: loadScenario returns valid bundle ───────────────────────

console.log("\n[Test 4] loadScenario returns valid bundle");
{
  const r = loadScenario("tavern_skirmish.scenario.json");
  assert(r.ok, "loads tavern_skirmish ok");
  assert(r.bundle.meta.id === "tavern-skirmish", "meta.id correct");
  assert(r.bundle.meta.name === "Tavern Skirmish", "meta.name correct");
  assert(r.bundle.initialState != null, "initialState present");
  assert(Array.isArray(r.bundle.meta.tags), "meta.tags is array");
}

// ── Test 5: loadScenario rejects invalid inputs ─────────────────────

console.log("\n[Test 5] loadScenario rejects invalid inputs");
{
  const r1 = loadScenario(null);
  assert(!r1.ok, "null filename rejected");
  assert(r1.errors[0].includes("non-empty"), "helpful error for null");

  const r2 = loadScenario("bad.json");
  assert(!r2.ok, "non-.scenario.json rejected");
  assert(r2.errors[0].includes(".scenario.json"), "helpful error for extension");

  const r3 = loadScenario("nonexistent.scenario.json");
  assert(!r3.ok, "nonexistent file rejected");
  assert(r3.errors[0].includes("not found") || r3.errors[0].includes("File"), "helpful error for missing");

  const r4 = loadScenario("");
  assert(!r4.ok, "empty string rejected");
}

// ── Test 6: Engine works with each scenario ─────────────────────────

console.log("\n[Test 6] Engine works with each scenario (ROLL_INITIATIVE)");
{
  const scenarios = listScenarios();
  for (const { filename } of scenarios) {
    const { bundle } = loadScenario(filename);
    const s = structuredClone(bundle.initialState);
    const result = applyAction(s, { type: "ROLL_INITIATIVE" });
    assert(result.success, `${filename}: ROLL_INITIATIVE succeeds`);
    assert(result.nextState.combat.mode === "combat", `${filename}: enters combat`);
  }
}

// ── Test 7: UI main.mjs references all scenarios ────────────────────

console.log("\n[Test 7] UI main.mjs references all scenarios");
{
  const mainContent = readFileSync("src/ui/main.mjs", "utf-8");
  assert(mainContent.includes("tavern_skirmish.scenario.json"), "UI lists tavern_skirmish");
  assert(mainContent.includes("corridor_ambush.scenario.json"), "UI lists corridor_ambush");
  assert(mainContent.includes("open_field_duel.scenario.json"), "UI lists open_field_duel");
  assert(mainContent.includes("scenario-select"), "UI has scenario-select element");
}

// ── Summary ─────────────────────────────────────────────────────────

console.log(`\n══════════════════════════════════════════════════`);
console.log(`Results: ${passed}/${passed + failed} passed, ${failed} failed`);
if (failed === 0) {
  console.log("PASS: all MIR 4.2 scenario tests passed");
} else {
  console.log("FAIL: some tests failed");
  process.exit(1);
}
