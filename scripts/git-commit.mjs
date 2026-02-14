#!/usr/bin/env node
/**
 * git-commit.mjs — MIR Safe Commit Helper.
 *
 * Runs all pre-commit gate checks first as normal Node processes,
 * THEN commits with --no-verify (since we already validated).
 *
 * This avoids the Husky pre-commit hook timeout issue when
 * committing from IDE tools or automated pipelines.
 *
 * Usage:
 *   node scripts/git-commit.mjs "commit message here"
 *   npm run gc -- "commit message here"
 */

import { execSync } from "child_process";

const message = process.argv.slice(2).join(" ");
if (!message) {
  console.error("❌ Usage: node scripts/git-commit.mjs \"commit message\"");
  process.exit(1);
}

function run(cmd, label) {
  try {
    console.log(`⏳ ${label}...`);
    execSync(cmd, { stdio: "inherit", timeout: 30000 });
    console.log(`✅ ${label} passed`);
  } catch (err) {
    console.error(`❌ ${label} FAILED`);
    process.exit(1);
  }
}

// ── Gate Checks (same as .husky/pre-commit) ──
console.log("🔒 Running pre-commit gates...\n");

run("npm run validate", "Schema validation");
run("npm run smoke", "Smoke test");
run("npm run invariants", "Invariant check");
run("npm run fixtures", "Fixture expectations");

console.log("\n✅ All gates passed.\n");

// ── Stage + Commit (no-verify since we already checked) ──
try {
  execSync("git add -A", { stdio: "inherit" });
  execSync(`git commit --no-verify -m "${message.replace(/"/g, '\\"')}"`, { stdio: "inherit" });
  console.log(`\n✅ Committed: "${message}"`);
} catch (err) {
  console.error("❌ Git commit failed:", err.message);
  process.exit(1);
}
