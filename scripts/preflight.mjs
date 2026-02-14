#!/usr/bin/env node
/**
 * preflight — Verify environment configuration before starting the app.
 *
 * Run manually:   node scripts/preflight.mjs
 * Or via npm:     npm run preflight
 *
 * Exit 0 if all required env vars are set, 1 if any are missing.
 */
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { preflight } from "../src/core/envCheck.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

// Load .env file if present (same as the server does)
try {
  const { readFileSync } = await import("fs");
  const envPath = resolve(ROOT, ".env");
  const content = readFileSync(envPath, "utf-8");
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    if (key && !(key in process.env)) {
      process.env[key] = val;
    }
  }
} catch {
  // .env file not found — that's fine, checkEnv will flag it
}

console.log("\n  Preflight Environment Check\n");

const { ok, report } = preflight({ rootDir: ROOT });
console.log(report);
console.log();

process.exit(ok ? 0 : 1);
