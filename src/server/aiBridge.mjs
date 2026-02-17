/**
 * aiBridge.mjs — MIR 3.3 Local AI Bridge Server.
 *
 * Minimal HTTP bridge so the browser UI can use the real AI client
 * without exposing OPENAI_API_KEY to browser code.
 *
 * POST /api/propose
 *   body: { inputText: string, state: object, mode?: "real"|"mock" }
 *   resp: { ok, action?, errors?, mode, durationMs }
 *
 * Security:
 *   - API key stays server-side only
 *   - Request payload size limited (200KB)
 *   - Rate limited: 30 req / 10 min per IP
 *   - Parser enforced server-side (defense in depth)
 *   - CORS restricted to localhost origins
 *
 * No dependencies beyond Node built-ins + project modules.
 */

import { createServer } from "node:http";
import "../core/loadEnv.mjs";
import { proposeAction, proposeActionMock } from "../ai/aiClient.mjs";
import { parseAiAction } from "../ai/aiActionParser.mjs";
import { createLogger } from "../core/logger.mjs";

const log = createLogger("server");

// ── Configuration ───────────────────────────────────────────────────────

const PORT = parseInt(process.env.MIR_AI_PORT || "3002", 10);
const MAX_BODY_BYTES = 200 * 1024; // 200KB payload limit
const RATE_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const RATE_MAX_REQUESTS = 30; // max requests per window per IP

// ── Rate Limiter ────────────────────────────────────────────────────────

/** @type {Map<string, { count: number, resetAt: number }>} */
const rateBuckets = new Map();

/**
 * Check rate limit for an IP. Returns { allowed: boolean, remaining: number }.
 * Exported for testing.
 *
 * @param {string} ip
 * @param {number} [now]
 * @returns {{ allowed: boolean, remaining: number }}
 */
export function checkRateLimit(ip, now = Date.now()) {
  let bucket = rateBuckets.get(ip);
  if (!bucket || now >= bucket.resetAt) {
    bucket = { count: 0, resetAt: now + RATE_WINDOW_MS };
    rateBuckets.set(ip, bucket);
  }
  bucket.count++;
  const remaining = Math.max(0, RATE_MAX_REQUESTS - bucket.count);
  return { allowed: bucket.count <= RATE_MAX_REQUESTS, remaining };
}

/** Reset rate limiter (for testing). */
export function resetRateLimiter() {
  rateBuckets.clear();
}

// ── Request Parsing ─────────────────────────────────────────────────────

/**
 * Read and parse JSON body from request with size limit.
 *
 * @param {import("node:http").IncomingMessage} req
 * @returns {Promise<{ ok: true, data: object } | { ok: false, error: string }>}
 */
function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0;

    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        req.destroy();
        resolve({ ok: false, error: `Payload too large (max ${MAX_BODY_BYTES} bytes)` });
      } else {
        chunks.push(chunk);
      }
    });

    req.on("end", () => {
      if (size > MAX_BODY_BYTES) return; // already resolved
      const raw = Buffer.concat(chunks).toString("utf-8");
      if (!raw.trim()) {
        resolve({ ok: false, error: "Empty request body" });
        return;
      }
      try {
        const data = JSON.parse(raw);
        resolve({ ok: true, data });
      } catch (e) {
        resolve({ ok: false, error: `Invalid JSON: ${e.message}` });
      }
    });

    req.on("error", (e) => {
      resolve({ ok: false, error: `Request error: ${e.message}` });
    });
  });
}

// ── Core Handler ────────────────────────────────────────────────────────

/**
 * Handle a /api/propose request. Exported for direct testing.
 *
 * @param {{ inputText: string, state: object, mode?: "real"|"mock" }} body
 * @param {string} ip — client IP for rate limiting
 * @returns {Promise<{ status: number, body: object }>}
 */
export async function handlePropose(body, ip) {
  // Rate limit
  const rl = checkRateLimit(ip);
  if (!rl.allowed) {
    return {
      status: 429,
      body: { ok: false, errors: ["Rate limit exceeded (30 requests per 10 minutes). Try again later."], mode: "rejected" },
    };
  }

  // Validate request shape
  if (!body || typeof body !== "object") {
    return { status: 400, body: { ok: false, errors: ["Request body must be a JSON object"], mode: "error" } };
  }

  const { inputText, state, mode } = body;

  if (typeof inputText !== "string" || !inputText.trim()) {
    return { status: 400, body: { ok: false, errors: ["inputText must be a non-empty string"], mode: "error" } };
  }

  if (!state || typeof state !== "object") {
    return { status: 400, body: { ok: false, errors: ["state must be a valid GameState object"], mode: "error" } };
  }

  // Determine AI mode
  const hasKey = !!process.env.OPENAI_API_KEY;
  const useReal = mode === "real" && hasKey;
  const actualMode = useReal ? "real" : "mock";

  try {
    let result;
    if (useReal) {
      result = await proposeAction(state, inputText.trim());
    } else {
      result = proposeActionMock(state, inputText.trim());
    }

    // Defense in depth: re-validate through parser even though client already has it
    if (result.ok && result.action) {
      const recheck = parseAiAction(JSON.stringify(result.action));
      if (!recheck.ok) {
        return {
          status: 200,
          body: { ok: false, errors: [`Server-side parser rejected: ${recheck.reason}`], mode: actualMode, durationMs: result.durationMs },
        };
      }
    }

    if (result.ok) {
      return {
        status: 200,
        body: { ok: true, action: result.action, mode: actualMode, durationMs: result.durationMs },
      };
    } else {
      return {
        status: 200,
        body: { ok: false, errors: [result.reason], mode: actualMode, durationMs: result.durationMs },
      };
    }
  } catch (err) {
    return {
      status: 500,
      body: { ok: false, errors: [`Server error: ${err.message}`], mode: actualMode },
    };
  }
}

// ── HTTP Server ─────────────────────────────────────────────────────────

function setCorsHeaders(res, origin) {
  // Only allow localhost origins
  if (origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Max-Age", "86400");
}

const server = createServer(async (req, res) => {
  const origin = req.headers.origin || "";
  setCorsHeaders(res, origin);

  // CORS preflight
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // Only POST /api/propose
  if (req.method !== "POST" || req.url?.split("?")[0] !== "/api/propose") {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, errors: ["Not found. Use POST /api/propose"] }));
    return;
  }

  // Read body
  const bodyResult = await readBody(req);
  if (!bodyResult.ok) {
    const status = bodyResult.error.includes("too large") ? 413 : 400;
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: false, errors: [bodyResult.error] }));
    return;
  }

  // Handle
  const ip = req.socket.remoteAddress || "unknown";
  const result = await handlePropose(bodyResult.data, ip);

  res.writeHead(result.status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(result.body));
});

// Only start listening if run directly (not imported for testing)
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/"))) {
  server.listen(PORT, () => {
    const hasKey = !!process.env.OPENAI_API_KEY;
    log.info("SERVER_START", {
      name: "MIR 3.3 — AI Bridge Server",
      url: `http://localhost:${PORT}/api/propose`,
      aiMode: hasKey ? "real (key found)" : "mock (no OPENAI_API_KEY)",
      rateLimit: `${RATE_MAX_REQUESTS} req / ${RATE_WINDOW_MS / 60000} min`,
    });
  });
}

export { server };
