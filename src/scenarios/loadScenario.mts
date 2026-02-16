/**
 * loadScenario.mjs — MIR 4.2 Scenario Loader.
 *
 * Loads a scenario bundle from file, validates the initialState
 * against schema + invariants, and returns a validated copy.
 *
 * Node-only (uses fs). Browser loads via fetch from UI server.
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { validateAll } from "../state/validation/index.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCENARIOS_DIR = resolve(__dirname, "../../scenarios");

/**
 * @typedef {Object} ScenarioBundle
 * @property {{ id: string, name: string, description: string, recommendedPlayers: number, difficulty: string, tags: string[] }} meta
 * @property {object} initialState — valid GameState
 * @property {string[]} [suggestedReplays]
 */

/**
 * Load and validate a scenario bundle.
 *
 * @param {string} filename — e.g. "tavern_skirmish.scenario.json"
 * @returns {{ ok: true, bundle: ScenarioBundle } | { ok: false, errors: string[] }}
 */
export function loadScenario(filename) {
  // Validate filename shape
  if (!filename || typeof filename !== "string") {
    return { ok: false, errors: ["filename must be a non-empty string"] };
  }
  if (!filename.endsWith(".scenario.json")) {
    return { ok: false, errors: ["filename must end with .scenario.json"] };
  }

  // Read file
  let raw;
  try {
    raw = readFileSync(resolve(SCENARIOS_DIR, filename), "utf-8");
  } catch (err) {
    return { ok: false, errors: [`File not found: ${filename}`] };
  }

  // Parse JSON
  let bundle;
  try {
    bundle = JSON.parse(raw);
  } catch (err) {
    return { ok: false, errors: [`Invalid JSON in ${filename}: ${err.message}`] };
  }

  // Validate meta structure
  if (!bundle.meta || typeof bundle.meta !== "object") {
    return { ok: false, errors: ["Missing or invalid meta field"] };
  }
  const requiredMeta = ["id", "name", "description", "recommendedPlayers", "difficulty", "tags"];
  const missingMeta = requiredMeta.filter((k) => bundle.meta[k] == null);
  if (missingMeta.length > 0) {
    return { ok: false, errors: [`Missing meta fields: ${missingMeta.join(", ")}`] };
  }

  // Validate initialState exists
  if (!bundle.initialState || typeof bundle.initialState !== "object") {
    return { ok: false, errors: ["Missing or invalid initialState"] };
  }

  // Validate initialState against schema + invariants
  const validation = validateAll(bundle.initialState);
  if (!validation.ok) {
    return { ok: false, errors: validation.errors.map((e) => `[validation] ${e}`) };
  }

  return { ok: true, bundle };
}
