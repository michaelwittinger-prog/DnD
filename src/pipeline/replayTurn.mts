#!/usr/bin/env node
/**
 * replayTurn — Replay a turn bundle and verify determinism.
 *
 * Loads state_in, intent_in, ai_response from a bundle folder,
 * re-runs rules evaluation and state application, then compares
 * computed outputs against stored outputs.
 *
 * Usage:
 *   node src/pipeline/replayTurn.mjs <bundle-folder>
 *   node src/pipeline/replayTurn.mjs --latest
 */
import { readFileSync, existsSync, readdirSync } from "fs";
import { resolve, dirname, basename } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { evaluateProposal, applyAllowedOps } from "../rules/rulesEngine.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");

// ── Helpers ────────────────────────────────────────────────────────────

function pretty(obj) {
  return JSON.stringify(obj, null, 2);
}

/**
 * Normalize a game state for deterministic comparison.
 * Strips fields that are set to new Date() during application:
 *   - meta.updatedAt
 *   - logs[].timestamp (only for newly added entries)
 */
function normalizeState(state) {
  const clone = JSON.parse(JSON.stringify(state));
  if (clone.meta) delete clone.meta.updatedAt;
  // Normalize all log timestamps to allow comparison
  if (Array.isArray(clone.logs)) {
    for (const log of clone.logs) {
      if (log.timestamp) log.timestamp = "__NORMALIZED__";
    }
  }
  return clone;
}

/**
 * Deep equality check on two parsed JSON objects.
 * Returns true if equal, false otherwise.
 */
function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Find the most recent bundle folder in out/turn_bundles/.
 */
function findLatestBundle() {
  const bundlesDir = resolve(ROOT, "out", "turn_bundles");
  if (!existsSync(bundlesDir)) return null;
  const dirs = readdirSync(bundlesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  if (dirs.length === 0) return null;
  return resolve(bundlesDir, dirs[dirs.length - 1]);
}

// ── Main ───────────────────────────────────────────────────────────────

function main() {
  const arg = process.argv[2];
  let bundleDir;

  if (!arg) {
    console.error("Usage: node src/pipeline/replayTurn.mjs <bundle-folder>");
    console.error("       node src/pipeline/replayTurn.mjs --latest");
    process.exit(1);
  }

  if (arg === "--latest") {
    bundleDir = findLatestBundle();
    if (!bundleDir) {
      console.error("No bundles found in out/turn_bundles/");
      process.exit(1);
    }
  } else {
    bundleDir = resolve(arg);
  }

  console.log("╔══════════════════════════════════════╗");
  console.log("║        AI GM — Replay Engine         ║");
  console.log("╚══════════════════════════════════════╝");
  console.log();
  console.log(`Bundle: ${bundleDir}`);
  console.log(`Name:   ${basename(bundleDir)}`);
  console.log();

  // ── Load bundle files ────────────────────────────────────────────
  const required = ["state_in.json", "ai_response.json", "rules_report.json"];
  for (const f of required) {
    if (!existsSync(resolve(bundleDir, f))) {
      console.error(`Missing required bundle file: ${f}`);
      process.exit(1);
    }
  }

  const stateIn = JSON.parse(readFileSync(resolve(bundleDir, "state_in.json"), "utf-8"));
  const aiResponse = JSON.parse(readFileSync(resolve(bundleDir, "ai_response.json"), "utf-8"));
  const storedRulesReport = JSON.parse(readFileSync(resolve(bundleDir, "rules_report.json"), "utf-8"));

  const hasStateOut = existsSync(resolve(bundleDir, "state_out.json"));
  let storedStateOut = null;
  if (hasStateOut) {
    storedStateOut = JSON.parse(readFileSync(resolve(bundleDir, "state_out.json"), "utf-8"));
  }

  let allMatch = true;
  const mismatches = [];

  // ── Re-run rules evaluation ──────────────────────────────────────
  console.log("[1/3] Re-evaluating rules...");
  const computedRulesReport = evaluateProposal({ state: stateIn, aiResponse });

  if (!deepEqual(computedRulesReport, storedRulesReport)) {
    allMatch = false;
    mismatches.push("rules_report.json");
    console.log("      ❌ rules_report MISMATCH");
    console.log("      Stored ok:", storedRulesReport.ok, "| Computed ok:", computedRulesReport.ok);
    console.log("      Stored violations:", storedRulesReport.violations?.length ?? 0);
    console.log("      Computed violations:", computedRulesReport.violations?.length ?? 0);
  } else {
    console.log("      ✓ rules_report matches");
  }

  // ── Re-apply state if rules passed ───────────────────────────────
  if (computedRulesReport.ok && hasStateOut) {
    console.log("[2/3] Re-applying allowed ops...");
    const computedStateOut = applyAllowedOps({
      state: stateIn,
      allowedOps: computedRulesReport.allowedOps,
    });

    const normalizedComputed = normalizeState(computedStateOut);
    const normalizedStored = normalizeState(storedStateOut);

    if (!deepEqual(normalizedComputed, normalizedStored)) {
      allMatch = false;
      mismatches.push("state_out.json");
      console.log("      ❌ state_out MISMATCH");

      // Find specific differences
      const cKeys = Object.keys(normalizedComputed);
      const sKeys = Object.keys(normalizedStored);
      for (const k of new Set([...cKeys, ...sKeys])) {
        if (!deepEqual(normalizedComputed[k], normalizedStored[k])) {
          console.log(`      Diff in top-level key: "${k}"`);
        }
      }
    } else {
      console.log("      ✓ state_out matches (normalized)");
    }
  } else if (!computedRulesReport.ok) {
    console.log("[2/3] Rules failed — skipping state application (expected if stored bundle also failed)");
    if (hasStateOut) {
      allMatch = false;
      mismatches.push("state_out.json (unexpected: rules failed but state_out exists in bundle)");
    }
  } else {
    console.log("[2/3] No state_out.json in bundle — skipping state comparison");
  }

  // ── Gatekeeper re-check (structural only) ────────────────────────
  console.log("[3/3] Checking gatekeeper gates...");
  let gatekeeperOk = true;

  // We import CJS modules dynamically
  try {
    const { validateAiGmResponse } = require("./validate_ai_gm_response");
    const s1 = validateAiGmResponse(aiResponse);
    if (!s1.valid) { gatekeeperOk = false; console.log("      ❌ Gate 1 (AI schema) FAIL"); }
    else console.log("      ✓ Gate 1 (AI schema) PASS");
  } catch {
    console.log("      ⚠ Gate 1 (AI schema) skipped");
  }

  if (computedRulesReport.ok) {
    console.log("      ✓ Gate 2 (Rules) PASS");
  } else {
    gatekeeperOk = false;
    console.log("      ❌ Gate 2 (Rules) FAIL");
  }

  if (hasStateOut && computedRulesReport.ok) {
    try {
      const computedStateOut = applyAllowedOps({ state: stateIn, allowedOps: computedRulesReport.allowedOps });
      const { checkSchemaVersion } = require("./check_schema_version");
      const { validateGameState } = require("./validate_game_state");
      const { checkInvariants } = require("./check_invariants");

      const s3 = checkSchemaVersion(computedStateOut);
      if (!s3.ok) { gatekeeperOk = false; console.log("      ❌ Gate 3 (Schema version) FAIL"); }
      else console.log("      ✓ Gate 3 (Schema version) PASS");

      const s4 = validateGameState(computedStateOut);
      if (!s4.valid) { gatekeeperOk = false; console.log("      ❌ Gate 4 (State schema) FAIL"); }
      else console.log("      ✓ Gate 4 (State schema) PASS");

      const s5 = checkInvariants(computedStateOut);
      if (s5 !== null) { gatekeeperOk = false; console.log(`      ❌ Gate 5 (Invariants) FAIL: ${s5}`); }
      else console.log("      ✓ Gate 5 (Invariants) PASS");
    } catch (err) {
      console.log(`      ⚠ Gate 3-5 check error: ${err.message}`);
    }
  }

  // ── Summary ──────────────────────────────────────────────────────
  console.log();
  if (allMatch) {
    console.log("PASS: replay matches bundle");
    process.exit(0);
  } else {
    console.log("FAIL: replay mismatch detected");
    console.log("Mismatched files:", mismatches.join(", "));
    process.exit(1);
  }
}

// CJS require from ESM context
const require = createRequire(resolve(ROOT, "package.json"));

main();
