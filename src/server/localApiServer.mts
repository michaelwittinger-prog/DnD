#!/usr/bin/env node
// Load .env file FIRST — before any other imports read process.env
import "../core/loadEnv.mjs";

/**
 * localApiServer — Minimal local API for the viewer UI.
 *
 * Endpoints:
 *   GET  /health   → { ok, version, port }
 *   GET  /state    → canonical engine state (bootstraps on first call)
 *   POST /action   → apply a DeclaredAction directly to engine state
 *   POST /turn     → execute a turn (LLM pipeline, intent from body)
 *   GET  /latest   → latest pipeline state, AI response, rules report
 *   POST /replay   → replay a turn bundle
 *
 * Port: env PORT or 3030
 * Listens on 127.0.0.1 only (IPv4).
 */
import http from "http";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { randomBytes } from "crypto";
import { execSync } from "child_process";
import { executeTurn, ROOT } from "../pipeline/executeTurn.mjs";
import { preflight } from "../core/envCheck.mjs";
import { bootstrapEngineState } from "../state/bootstrapState.mjs";
import { applyAction } from "../engine/applyAction.mjs";
import { createLogger } from "../core/logger.mjs";

const log = createLogger("server");

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.env.PORT || "3030", 10);

// ── Engine State Persistence ───────────────────────────────────────────
// Engine state is the canonical source of truth (see docs/implementation_report.md).
// It persists as out/engine_state.canonical.json.
// On first boot, it's bootstrapped from game_state.example.json.

const ENGINE_STATE_PATH = resolve(ROOT, "out", "engine_state.canonical.json");

function loadEngineState() {
  if (existsSync(ENGINE_STATE_PATH)) {
    return JSON.parse(readFileSync(ENGINE_STATE_PATH, "utf-8"));
  }
  // Bootstrap from pipeline state on first boot
  log.info("ENGINE_BOOTSTRAP", { source: "game_state.example.json" });
  const pipelineState = JSON.parse(readFileSync(resolve(ROOT, "game_state.example.json"), "utf-8"));
  const engineState = bootstrapEngineState(pipelineState);
  saveEngineState(engineState);
  log.info("ENGINE_BOOTSTRAP_DONE");
  return engineState;
}

function saveEngineState(state) {
  mkdirSync(resolve(ROOT, "out"), { recursive: true });
  writeFileSync(ENGINE_STATE_PATH, JSON.stringify(state, null, 2), "utf-8");
}

// ── Preflight Check ────────────────────────────────────────────────────
{
  const check = preflight({ rootDir: ROOT });
  if (!check.ok) {
    log.error("PREFLIGHT_FAIL", { report: check.report });
    process.exit(1);
  }
  // Print warnings even if ok
  if (check.result.warnings.length > 0) {
    for (const w of check.result.warnings) {
      log.warn("PREFLIGHT_WARN", { warning: w });
    }
  }
}

// ── Helpers ────────────────────────────────────────────────────────────

function generateRequestId() {
  const ts = Date.now().toString(36);
  const rand = randomBytes(4).toString("hex");
  return `${ts}-${rand}`;
}

function json(res, status, body) {
  const data = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString();
      if (!raw || raw.trim().length === 0) {
        return reject(new Error("Empty request body"));
      }
      try {
        resolve(JSON.parse(raw));
      } catch (e) {
        reject(new Error("Invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}

function readJsonFile(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

// ── Routes ─────────────────────────────────────────────────────────────

async function handleHealth(_req, res) {
  json(res, 200, { ok: true, version: "5.1", port: PORT });
}

async function handleTurn(req, res) {
  const requestId = generateRequestId();

  // ── Parse body ────────────────────────────────────────────────
  let body;
  try {
    body = await readBody(req);
  } catch (e) {
    return json(res, 400, {
      ok: false,
      error: "INVALID_REQUEST",
      message: e.message,
      requestId,
    });
  }

  // ── Validate request structure ────────────────────────────────
  if (!body || typeof body !== "object") {
    return json(res, 400, {
      ok: false,
      error: "INVALID_REQUEST",
      message: "Request body must be a JSON object.",
      requestId,
    });
  }

  if (!body.intent || typeof body.intent !== "object") {
    return json(res, 400, {
      ok: false,
      error: "INVALID_REQUEST",
      message: "Missing required field: intent (must be an object).",
      requestId,
    });
  }

  if (!body.intent.player_id && !body.intent.playerId) {
    return json(res, 400, {
      ok: false,
      error: "INVALID_REQUEST",
      message: "Missing required field: intent.player_id or intent.playerId.",
      requestId,
    });
  }

  // ── Resolve fixture ───────────────────────────────────────────
  const { intent, statePath, seed, useFixture } = body;
  let fixturePath = undefined;
  if (useFixture) {
    fixturePath = resolve(ROOT, useFixture);
    if (!existsSync(fixturePath)) {
      return json(res, 400, {
        ok: false,
        error: "INVALID_REQUEST",
        message: `Fixture not found: ${useFixture}`,
        requestId,
      });
    }
  }

  log.info("REQUEST_TURN", { requestId, intent: JSON.stringify(intent).slice(0, 80), fixture: useFixture || null });

  // ── Resolve state path (chain turns) ──────────────────────────
  // If no explicit statePath from the request, use the latest output
  // from a previous turn (enables multi-turn chaining). Fall back to
  // the example state for the very first turn.
  let resolvedStatePath;
  if (statePath) {
    resolvedStatePath = resolve(ROOT, statePath);
  } else {
    const latestState = resolve(ROOT, "out", "game_state.latest.json");
    resolvedStatePath = existsSync(latestState)
      ? latestState
      : resolve(ROOT, "game_state.example.json");
  }
  log.debug("TURN_STATE_PATH", { requestId, statePath: resolvedStatePath });

  // ── Execute turn ──────────────────────────────────────────────
  try {
    const result = await executeTurn({
      statePath: resolvedStatePath,
      intentObject: intent,
      seed: seed !== undefined ? Number(seed) : undefined,
      fixturePath,
      sync: true,
    });

    // Append requestId to bundle meta.json (Task 4)
    try {
      const metaPath = resolve(result.bundlePath, "meta.json");
      if (existsSync(metaPath)) {
        const meta = JSON.parse(readFileSync(metaPath, "utf-8"));
        meta.requestId = requestId;
        writeFileSync(metaPath, JSON.stringify(meta, null, 2), "utf-8");
      }
    } catch {
      // non-fatal
    }

    log.info("TURN_RESULT", { requestId, ok: result.ok, bundle: result.bundleName });

    json(res, 200, {
      ok: result.ok,
      requestId,
      bundlePath: result.bundlePath,
      bundleName: result.bundleName,
      gatekeeperResult: result.gatekeeperResult,
      failureGate: result.failureGate,
      violations: result.violations,
      log: result.log,
      error: result.error || null,
    });
  } catch (err) {
    log.error("TURN_ERROR", { requestId, error: err.message });
    json(res, 500, { ok: false, error: err.message, requestId });
  }
}

async function handleLatest(_req, res) {
  const outDir = resolve(ROOT, "out");
  // Return the latest state from a previous turn, or fall back to the
  // example state so the viewer always has something to render.
  const latestState = readJsonFile(resolve(outDir, "game_state.latest.json"));
  const gameState = latestState || readJsonFile(resolve(ROOT, "game_state.example.json"));
  json(res, 200, {
    gameState,
    aiResponse: readJsonFile(resolve(outDir, "ai_response.latest.json")),
    rulesReport: readJsonFile(resolve(outDir, "rules_report.latest.json")),
  });
}

async function handleState(_req, res) {
  try {
    const engineState = loadEngineState();
    json(res, 200, { ok: true, state: engineState });
  } catch (err) {
    json(res, 500, { ok: false, error: err.message });
  }
}

async function handleAction(req, res) {
  const requestId = generateRequestId();

  let body;
  try {
    body = await readBody(req);
  } catch (e) {
    return json(res, 400, { ok: false, error: "INVALID_REQUEST", message: e.message, requestId });
  }

  // Body must be a DeclaredAction: { type: "MOVE"|"ATTACK"|"END_TURN"|"ROLL_INITIATIVE", ... }
  if (!body || !body.type) {
    return json(res, 400, {
      ok: false,
      error: "INVALID_REQUEST",
      message: "Missing required field: type (MOVE, ATTACK, END_TURN, ROLL_INITIATIVE, USE_ABILITY, SET_SEED).",
      requestId,
    });
  }

  log.info("REQUEST_ACTION", { requestId, type: body.type, entityId: body.entityId || null });

  try {
    const currentState = loadEngineState();
    const result = applyAction(currentState, body);

    if (result.success !== false) {
      // Success — persist the new state
      saveEngineState(result.nextState);
      log.info("ACTION_OK", { requestId, eventCount: (result.events || []).length });
      json(res, 200, {
        ok: true,
        requestId,
        events: result.events || [],
        state: result.nextState,
      });
    } else {
      // Engine returned errors (array of strings or error objects)
      const errorMessages = (result.errors || []).map(e => String(e));
      log.warn("ACTION_REJECTED", { requestId, errors: errorMessages });
      json(res, 200, {
        ok: false,
        requestId,
        errors: result.errors || [],
      });
    }
  } catch (err) {
    log.error("ACTION_ERROR", { requestId, error: err.message });
    json(res, 500, { ok: false, error: err.message, requestId });
  }
}

async function handleReplay(req, res) {
  const requestId = generateRequestId();

  let body;
  try {
    body = await readBody(req);
  } catch (e) {
    return json(res, 400, {
      ok: false,
      error: "INVALID_REQUEST",
      message: e.message,
      requestId,
    });
  }

  if (!body || !body.bundlePath) {
    return json(res, 400, {
      ok: false,
      error: "INVALID_REQUEST",
      message: "Missing required field: bundlePath.",
      requestId,
    });
  }

  const bundlePath = resolve(ROOT, body.bundlePath);
  if (!existsSync(bundlePath)) {
    return json(res, 400, {
      ok: false,
      error: "INVALID_REQUEST",
      message: `Bundle path not found: ${body.bundlePath}`,
      requestId,
    });
  }

  log.info("REQUEST_REPLAY", { requestId, bundle: body.bundlePath });

  try {
    const replayScript = resolve(ROOT, "src", "pipeline", "replayTurn.mjs");
    const output = execSync(
      `node "${replayScript}" "${bundlePath}"`,
      { encoding: "utf-8", cwd: ROOT, stdio: "pipe" }
    );

    log.info("REPLAY_PASS", { requestId });
    json(res, 200, {
      ok: true,
      requestId,
      output: output.trim(),
      violations: [],
    });
  } catch (err) {
    const output = ((err.stdout || "") + (err.stderr || "")).trim();
    log.warn("REPLAY_FAIL", { requestId });
    json(res, 200, {
      ok: false,
      requestId,
      output,
      violations: [],
    });
  }
}

// ── Server ─────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    return res.end();
  }

  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const path = url.pathname;

  try {
    if (path === "/health" && req.method === "GET") return await handleHealth(req, res);
    if (path === "/state" && req.method === "GET") return await handleState(req, res);
    if (path === "/action" && req.method === "POST") return await handleAction(req, res);
    if (path === "/turn" && req.method === "POST") return await handleTurn(req, res);
    if (path === "/latest" && req.method === "GET") return await handleLatest(req, res);
    if (path === "/replay" && req.method === "POST") return await handleReplay(req, res);

    json(res, 404, { error: `Not found: ${req.method} ${path}` });
  } catch (err) {
    log.error("SERVER_ERROR", { error: err.message });
    json(res, 500, { error: err.message });
  }
});

// ── Graceful shutdown ──────────────────────────────────────────────────

function shutdown(signal) {
  log.info("SERVER_SHUTDOWN", { signal });
  server.close(() => {
    log.info("SERVER_CLOSED");
    process.exit(0);
  });
  // Force exit after 5s if close hangs
  setTimeout(() => {
    log.warn("SERVER_FORCED_EXIT");
    process.exit(1);
  }, 5000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// ── Start ──────────────────────────────────────────────────────────────

server.listen(PORT, "127.0.0.1", () => {
  log.info("SERVER_START", {
    name: "AI GM — Local API Server",
    url: `http://127.0.0.1:${PORT}`,
    endpoints: ["GET /health", "GET /state", "POST /action", "POST /turn", "GET /latest", "POST /replay"],
  });
});
