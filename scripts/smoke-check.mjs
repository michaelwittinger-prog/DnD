#!/usr/bin/env node
/**
 * smoke-check — Quick integration smoke test for the local API server.
 *
 * Requires the API server to be running on the configured port.
 *
 * Steps:
 *   1. GET /health
 *   2. POST /turn with legal fixture  → expects ok: true
 *   3. POST /turn with illegal fixture → expects ok: false
 *
 * Exit 0 if all pass, 1 if any fail.
 */
import http from "http";

const PORT = parseInt(process.env.PORT || "3030", 10);
const BASE = `http://127.0.0.1:${PORT}`;

let passed = 0;
let failed = 0;

function request(method, path, body) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE);
    const opts = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method,
      headers: {},
    };

    let payload = null;
    if (body) {
      payload = JSON.stringify(body);
      opts.headers["Content-Type"] = "application/json";
      opts.headers["Content-Length"] = Buffer.byteLength(payload);
    }

    const req = http.request(opts, (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString();
        try {
          resolve({ status: res.statusCode, body: JSON.parse(raw) });
        } catch {
          resolve({ status: res.statusCode, body: raw });
        }
      });
    });

    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function check(name, ok) {
  if (ok) {
    console.log(`  ✅ ${name}`);
    passed++;
  } else {
    console.log(`  ❌ ${name}`);
    failed++;
  }
}

async function main() {
  console.log(`\nSmoke Check → ${BASE}\n`);

  // 1. Health
  try {
    const h = await request("GET", "/health");
    check("GET /health returns ok", h.status === 200 && h.body.ok === true);
    check("GET /health returns port", h.body.port === PORT);
  } catch (err) {
    console.error(`  ❌ Cannot connect to ${BASE} — is the API server running?`);
    console.error(`     Start it with: npm run api`);
    process.exit(1);
  }

  // 2. POST /turn with legal fixture
  try {
    const legal = await request("POST", "/turn", {
      intent: { player_id: "pc-01", action: "move east", free_text: "move east" },
      useFixture: "fixtures/ai_response_legal_move.json",
    });
    check("POST /turn legal fixture → ok: true", legal.body.ok === true);
    check("POST /turn legal fixture → has requestId", !!legal.body.requestId);
    check("POST /turn legal fixture → has bundleName", !!legal.body.bundleName);
  } catch (err) {
    check("POST /turn legal fixture", false);
    console.error("    ", err.message);
  }

  // 3. POST /turn with illegal fixture
  try {
    const illegal = await request("POST", "/turn", {
      intent: { player_id: "pc-01", action: "collide", free_text: "collide" },
      useFixture: "fixtures/ai_response_illegal_collision.json",
    });
    check("POST /turn illegal fixture → ok: false", illegal.body.ok === false);
    check("POST /turn illegal fixture → has violations", Array.isArray(illegal.body.violations) && illegal.body.violations.length > 0);
    check("POST /turn illegal fixture → has requestId", !!illegal.body.requestId);
  } catch (err) {
    check("POST /turn illegal fixture", false);
    console.error("    ", err.message);
  }

  // Summary
  console.log();
  if (failed === 0) {
    console.log(`PASS: ${passed}/${passed + failed} checks passed`);
    process.exit(0);
  } else {
    console.log(`FAIL: ${passed}/${passed + failed} passed, ${failed} failed`);
    process.exit(1);
  }
}

main();
