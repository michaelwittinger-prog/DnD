#!/usr/bin/env node
/**
 * sync-state — copies pipeline output files to the viewer's public dir:
 *   out/game_state.latest.json    → viewer/public/game_state.view.json
 *   out/ai_response.latest.json   → viewer/public/ai_response.view.json
 *   out/rules_report.latest.json  → viewer/public/rules_report.view.json
 */
import { copyFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// ── Game state ──────────────────────────────────────────────────────
const stateSrc = resolve(ROOT, "out", "game_state.latest.json");
const stateDest = resolve(ROOT, "viewer", "public", "game_state.view.json");

if (!existsSync(stateSrc)) {
  console.error(`Source file not found: ${stateSrc}`);
  console.error("Run 'npm run turn' first to generate the latest state.");
  process.exit(1);
}

copyFileSync(stateSrc, stateDest);
console.log(`✓ Copied ${stateSrc}\n  → ${stateDest}`);

// ── AI response (optional) ──────────────────────────────────────────
const aiSrc = resolve(ROOT, "out", "ai_response.latest.json");
const aiDest = resolve(ROOT, "viewer", "public", "ai_response.view.json");

if (existsSync(aiSrc)) {
  copyFileSync(aiSrc, aiDest);
  console.log(`✓ Copied ${aiSrc}\n  → ${aiDest}`);
} else {
  console.log("ℹ No AI response found — skipped.");
}

// ── Rules report (optional) ─────────────────────────────────────────
const rulesSrc = resolve(ROOT, "out", "rules_report.latest.json");
const rulesDest = resolve(ROOT, "viewer", "public", "rules_report.view.json");

if (existsSync(rulesSrc)) {
  copyFileSync(rulesSrc, rulesDest);
  console.log(`✓ Copied ${rulesSrc}\n  → ${rulesDest}`);
} else {
  console.log("ℹ No rules report found — skipped.");
}
