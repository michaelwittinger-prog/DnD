/**
 * executeTurn — Core turn pipeline logic, callable from CLI or API.
 *
 * Returns a result object instead of calling process.exit().
 * Always writes turn bundle. Writes latest files. Syncs to viewer.
 *
 * @param {object} opts
 * @param {string}  opts.statePath    - Path to game state JSON
 * @param {string}  opts.intentPath   - Path to intent JSON (mutually exclusive with intentObject)
 * @param {object}  opts.intentObject - Intent as JS object (used by API; mutually exclusive with intentPath)
 * @param {number}  [opts.seed]       - Optional seed
 * @param {string}  [opts.fixturePath]- If set, use this file as AI response instead of calling OpenAI
 * @param {boolean} [opts.sync=true]  - Whether to sync latest files to viewer/public
 * @returns {Promise<object>} result
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { randomBytes } from "crypto";
import { generateAiGmResponse } from "../adapters/chatgptAdapter.mjs";
import { evaluateProposal, applyAllowedOps } from "../rules/rulesEngine.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");

function pretty(obj) {
  return JSON.stringify(obj, null, 2);
}

function ts() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

function shortId() {
  return randomBytes(3).toString("hex");
}

function getGitCommit() {
  try {
    return execSync("git rev-parse HEAD", { encoding: "utf-8", cwd: ROOT }).trim();
  } catch {
    return null;
  }
}

export { ROOT };

export async function executeTurn(opts = {}) {
  const {
    statePath = resolve(ROOT, "game_state.example.json"),
    intentPath,
    intentObject,
    seed,
    fixturePath,
    sync = true,
  } = opts;

  const log = [];
  const push = (msg) => log.push(msg);

  // ── Setup output dirs ────────────────────────────────────────────
  const outDir = resolve(ROOT, "out");
  mkdirSync(outDir, { recursive: true });

  const bundleName = `${ts()}_${shortId()}`;
  const bundleDir = resolve(outDir, "turn_bundles", bundleName);
  mkdirSync(bundleDir, { recursive: true });

  const meta = {
    createdAt: new Date().toISOString(),
    openaiModel: fixturePath ? "fixture" : (process.env.OPENAI_MODEL || "gpt-4o"),
    seed: seed ?? null,
    inputStatePath: statePath,
    inputIntentPath: intentPath || "(from API)",
    aiResponseSource: fixturePath ? "fixture" : "openai",
    gatekeeperResult: null,
    failureGate: null,
    gitCommit: getGitCommit(),
  };

  const result = {
    ok: false,
    bundlePath: bundleDir,
    bundleName,
    gatekeeperResult: null,
    failureGate: null,
    violations: [],
    log,
    latestFiles: {
      state: resolve(outDir, "game_state.latest.json"),
      aiResponse: resolve(outDir, "ai_response.latest.json"),
      rulesReport: resolve(outDir, "rules_report.latest.json"),
    },
  };

  try {
    // 1. Load inputs
    push(`Loading state: ${statePath}`);
    const state = JSON.parse(readFileSync(statePath, "utf-8"));

    let playerIntent;
    if (intentObject) {
      playerIntent = intentObject;
      push("Using intent from API");
    } else {
      const iPath = intentPath || resolve(ROOT, "player_intent.example.json");
      push(`Loading intent: ${iPath}`);
      playerIntent = JSON.parse(readFileSync(iPath, "utf-8"));
    }

    // Write inputs to bundle
    writeFileSync(resolve(bundleDir, "state_in.json"), pretty(state), "utf-8");
    writeFileSync(resolve(bundleDir, "intent_in.json"), pretty(playerIntent), "utf-8");

    // 2. Get AI response
    let aiResponse;
    if (fixturePath) {
      push(`Loading AI response fixture: ${fixturePath}`);
      aiResponse = JSON.parse(readFileSync(fixturePath, "utf-8"));
    } else {
      push("Calling ChatGPT adapter...");
      aiResponse = await generateAiGmResponse({ state, playerIntent, seed });
    }

    // Write AI response
    writeFileSync(resolve(bundleDir, "ai_response.json"), pretty(aiResponse), "utf-8");
    writeFileSync(result.latestFiles.aiResponse, pretty(aiResponse), "utf-8");
    push("AI response written");

    // 3. Rules evaluation
    push("Evaluating rules legality...");
    const rulesReport = evaluateProposal({ state, aiResponse });

    writeFileSync(resolve(bundleDir, "rules_report.json"), pretty(rulesReport), "utf-8");
    writeFileSync(result.latestFiles.rulesReport, pretty(rulesReport), "utf-8");

    if (!rulesReport.ok) {
      meta.gatekeeperResult = "failed";
      meta.failureGate = rulesReport.failureGate || "rules";
      writeFileSync(resolve(bundleDir, "meta.json"), pretty(meta), "utf-8");

      result.gatekeeperResult = "failed";
      result.failureGate = rulesReport.failureGate || "rules";
      result.violations = rulesReport.violations.map((v) => ({
        code: v.code,
        message: v.message,
        path: v.path,
        severity: v.severity,
      }));
      push(`Rules FAILED: ${rulesReport.violations.length} violation(s)`);
      return result;
    }

    push("Rules passed");

    // 4. Apply allowed ops
    const nextState = applyAllowedOps({ state, allowedOps: rulesReport.allowedOps });
    writeFileSync(result.latestFiles.state, pretty(nextState), "utf-8");
    push("State applied");

    // 5. Gatekeeper
    push("Running gatekeeper...");
    try {
      const gatekeeperCmd = `node "${resolve(ROOT, "gatekeeper.js")}" --response "${result.latestFiles.aiResponse}" --state "${result.latestFiles.state}" --rules-report "${result.latestFiles.rulesReport}"`;
      execSync(gatekeeperCmd, { encoding: "utf-8", cwd: ROOT });
      meta.gatekeeperResult = "passed";
    } catch (err) {
      const out = (err.stdout || "") + (err.stderr || "");
      // Check each gate line for FAIL (must be on the same line)
      if (/\[1\/5\].*FAIL/.test(out)) meta.failureGate = "ai_schema";
      else if (/\[2\/5\].*FAIL/.test(out)) meta.failureGate = "rules";
      else if (/\[3\/5\].*FAIL/.test(out)) meta.failureGate = "schema_version";
      else if (/\[4\/5\].*FAIL/.test(out)) meta.failureGate = "state_schema";
      else if (/\[5\/5\].*FAIL/.test(out)) meta.failureGate = "invariants";
      else meta.failureGate = "unknown";

      meta.gatekeeperResult = "failed";
      writeFileSync(resolve(bundleDir, "meta.json"), pretty(meta), "utf-8");

      result.gatekeeperResult = "failed";
      result.failureGate = meta.failureGate;
      push(`Gatekeeper FAILED at: ${meta.failureGate}`);
      return result;
    }

    // Write success bundle
    writeFileSync(resolve(bundleDir, "state_out.json"), pretty(nextState), "utf-8");
    meta.gatekeeperResult = "passed";
    meta.failureGate = null;
    writeFileSync(resolve(bundleDir, "meta.json"), pretty(meta), "utf-8");

    // 6. Sync to viewer
    if (sync) {
      try {
        execSync(`node "${resolve(ROOT, "scripts", "sync-state.mjs")}"`, { encoding: "utf-8", cwd: ROOT });
        push("Synced to viewer");
      } catch {
        push("Viewer sync skipped (non-fatal)");
      }
    }

    result.ok = true;
    result.gatekeeperResult = "passed";
    push("Turn completed successfully");
    return result;
  } catch (err) {
    // Unexpected error — still write meta
    meta.gatekeeperResult = "failed";
    meta.failureGate = "error";
    try { writeFileSync(resolve(bundleDir, "meta.json"), pretty(meta), "utf-8"); } catch {}
    result.failureGate = "error";
    result.gatekeeperResult = "failed";
    push(`Pipeline error: ${err.message}`);
    result.error = err.message;
    return result;
  }
}
