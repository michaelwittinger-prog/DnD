/**
 * run-replay.mjs — MIR 3.4 CLI Replay Runner.
 *
 * Usage:
 *   node scripts/run-replay.mjs replays/combat_flow.replay.json
 *   node scripts/run-replay.mjs replays/*.replay.json
 */

import { readFileSync, readdirSync } from "node:fs";
import { resolve, basename } from "node:path";
import { runReplay } from "../src/replay/runReplay.mjs";

const args = process.argv.slice(2);

if (args.length === 0) {
  // Default: run all .replay.json files in /replays
  const dir = resolve(process.cwd(), "replays");
  try {
    const files = readdirSync(dir).filter((f) => f.endsWith(".replay.json"));
    if (files.length === 0) {
      console.log("No .replay.json files found in /replays");
      process.exit(1);
    }
    args.push(...files.map((f) => resolve(dir, f)));
  } catch {
    console.log("No /replays directory found");
    process.exit(1);
  }
}

console.log("╔══════════════════════════════════════╗");
console.log("║  MIR 3.4 — Replay Runner              ║");
console.log("╚══════════════════════════════════════╝");
console.log();

let allOk = true;

for (const filePath of args) {
  const name = basename(filePath);
  let bundle;

  try {
    const raw = readFileSync(resolve(filePath), "utf-8");
    bundle = JSON.parse(raw);
  } catch (err) {
    console.log(`  ❌ ${name} — Failed to read/parse: ${err.message}`);
    allOk = false;
    continue;
  }

  const report = runReplay(bundle);
  const meta = bundle.meta || {};

  if (report.ok) {
    console.log(`  ✅ ${name}`);
    console.log(`     ${meta.notes || "(no notes)"}`);
    console.log(`     Steps: ${report.stepsRun} | Events: ${report.eventLog.length} | Hash: ${report.finalStateHash}`);
  } else {
    console.log(`  ❌ ${name}`);
    console.log(`     ${meta.notes || "(no notes)"}`);
    console.log(`     Failed at step: ${report.failingStep ?? "initial"}`);
    for (const err of report.errors) {
      console.log(`     → ${err}`);
    }
    allOk = false;
  }
  console.log();
}

console.log("══════════════════════════════════════════════════");
console.log(allOk ? "PASS: all replays verified" : "FAIL: some replays failed");
process.exit(allOk ? 0 : 1);
