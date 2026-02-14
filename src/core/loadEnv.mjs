/**
 * loadEnv.mjs — Loads .env file into process.env on import.
 *
 * Zero-dependency .env loader. Searches for .env starting from
 * the project root (two levels up from this file: src/core/ → root).
 *
 * Import this at the very top of any entry point that needs env vars:
 *   import "./core/loadEnv.mjs";
 *
 * Rules:
 *   - Lines starting with # are comments
 *   - Empty lines are skipped
 *   - KEY=VALUE format (no quotes stripping needed for simple values)
 *   - Does NOT overwrite vars already set in the environment
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");
const envPath = resolve(ROOT, ".env");

try {
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
  // .env file not found — silently continue
}
