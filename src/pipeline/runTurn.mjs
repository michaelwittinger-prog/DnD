#!/usr/bin/env node
/**
 * runTurn — CLI wrapper for executeTurn.
 *
 * Usage:
 *   node src/pipeline/runTurn.mjs [--state <file>] [--intent <file>] [--seed <n>] [--fixture <ai-response.json>]
 */
import { resolve } from "path";
import "../core/loadEnv.mjs";
import { executeTurn, ROOT } from "./executeTurn.mjs";

function parseArgs() {
  const args = { statePath: undefined, intentPath: undefined, seed: undefined, fixturePath: undefined };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--state" && argv[i + 1]) args.statePath = resolve(argv[++i]);
    if (argv[i] === "--intent" && argv[i + 1]) args.intentPath = resolve(argv[++i]);
    if (argv[i] === "--seed" && argv[i + 1]) args.seed = Number(argv[++i]);
    if (argv[i] === "--fixture" && argv[i + 1]) args.fixturePath = resolve(argv[++i]);
  }
  return args;
}

async function main() {
  const args = parseArgs();

  console.log("╔══════════════════════════════════════╗");
  console.log("║        AI GM — Turn Pipeline         ║");
  console.log("╚══════════════════════════════════════╝");
  console.log();

  const result = await executeTurn({
    statePath: args.statePath,
    intentPath: args.intentPath,
    seed: args.seed,
    fixturePath: args.fixturePath,
    sync: true,
  });

  // Print log
  for (const msg of result.log) console.log(`  ${msg}`);

  if (result.violations.length > 0) {
    console.log("");
    console.log(`❌  ${result.violations.length} violation(s):`);
    for (const v of result.violations) {
      console.log(`    [${v.severity.toUpperCase()}] ${v.code} @ ${v.path}`);
      console.log(`           ${v.message}`);
    }
  }

  console.log(`\n📦 Bundle: ${result.bundlePath}`);

  if (result.ok) {
    console.log("\n✅  PASS — turn completed successfully.");
    process.exit(0);
  } else {
    console.log(`\n❌  FAIL — ${result.failureGate || "unknown"}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("\n❌  Pipeline error:", err.message || err);
  process.exit(1);
});
