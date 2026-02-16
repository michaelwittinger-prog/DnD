/**
 * listScenarios.mjs — MIR 4.2 Scenario Lister.
 *
 * Reads all .scenario.json files from the scenarios/ folder
 * and returns their metadata without loading full state.
 *
 * Node-only (uses fs). The browser UI fetches a manifest instead.
 */

import { readdirSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCENARIOS_DIR = resolve(__dirname, "../../scenarios");

/**
 * List all available scenarios with metadata.
 *
 * @returns {{ filename: string, meta: object }[]}
 */
export function listScenarios() {
  const files = readdirSync(SCENARIOS_DIR).filter((f) => f.endsWith(".scenario.json"));
  const results = [];

  for (const filename of files) {
    try {
      const raw = readFileSync(resolve(SCENARIOS_DIR, filename), "utf-8");
      const bundle = JSON.parse(raw);
      if (bundle.meta && bundle.initialState) {
        results.push({ filename, meta: bundle.meta });
      }
    } catch {
      // Skip invalid files silently
    }
  }

  return results;
}
