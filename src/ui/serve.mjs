/**
 * serve.mjs — Minimal static file server for MIR UI.
 *
 * Serves the project root so browser ES modules can import engine files.
 * No dependencies beyond Node built-ins.
 *
 * Features:
 *   - Auto-kills stale process on the port before binding
 *   - Graceful shutdown on SIGINT/SIGTERM
 *   - Cross-platform (Windows + Unix)
 *
 * Usage: node src/ui/serve.mjs
 */

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "../..");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

const PORT = parseInt(process.env.MIR_UI_PORT || "3001", 10);

// ── Auto-kill stale process on port ─────────────────────────────────────

function killStalePort(port) {
  const isWin = process.platform === "win32";
  try {
    if (isWin) {
      // Find PID listening on the port
      const out = execSync(`netstat -aon | findstr :${port} | findstr LISTENING`, {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      // Parse PIDs from netstat output (last column)
      const pids = new Set();
      for (const line of out.trim().split("\n")) {
        const parts = line.trim().split(/\s+/);
        const pid = parts[parts.length - 1];
        if (pid && /^\d+$/.test(pid) && pid !== "0") pids.add(pid);
      }
      for (const pid of pids) {
        try {
          execSync(`cmd.exe /c "taskkill /F /PID ${pid}"`, {
            encoding: "utf-8",
            stdio: ["pipe", "pipe", "pipe"],
          });
          console.log(`  ⚡ Killed stale process PID ${pid} on port ${port}`);
        } catch {
          // Process may have already exited
        }
      }
      if (pids.size > 0) {
        // Brief wait for port release
        execSync("timeout /t 1 /nobreak >nul 2>&1", { stdio: "pipe" });
      }
    } else {
      // Unix: lsof + kill
      const out = execSync(`lsof -ti :${port}`, {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      for (const pid of out.trim().split("\n").filter(Boolean)) {
        try {
          execSync(`kill -9 ${pid}`, { stdio: "pipe" });
          console.log(`  ⚡ Killed stale process PID ${pid} on port ${port}`);
        } catch { /* already gone */ }
      }
    }
  } catch {
    // No process on port — this is the happy path
  }
}

// Kill any stale process before we try to bind
killStalePort(PORT);

// ── Server ──────────────────────────────────────────────────────────────

const server = createServer(async (req, res) => {
  let urlPath = req.url.split("?")[0];

  // Default route → UI index
  if (urlPath === "/") urlPath = "/src/ui/index.html";

  const filePath = resolve(ROOT, "." + urlPath);

  // Security: stay within project root
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const content = await readFile(filePath);
    const ext = extname(filePath);
    res.writeHead(200, { "Content-Type": MIME[ext] || "application/octet-stream" });
    res.end(content);
  } catch {
    res.writeHead(404);
    res.end("Not found: " + urlPath);
  }
});

// ── Graceful shutdown ───────────────────────────────────────────────────

function shutdown(signal) {
  console.log(`\n  🛑 ${signal} received — shutting down...`);
  server.close(() => {
    console.log("  ✓ Server closed cleanly.");
    process.exit(0);
  });
  // Force exit after 3s if connections hang
  setTimeout(() => process.exit(0), 3000);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// Windows: handle Ctrl+C in terminal
if (process.platform === "win32") {
  process.on("SIGHUP", () => shutdown("SIGHUP"));
}

// ── Start ───────────────────────────────────────────────────────────────

server.listen(PORT, () => {
  console.log(`\n╔══════════════════════════════════════╗`);
  console.log(`║  MIR 2.1 — Tabletop Engine UI        ║`);
  console.log(`╚══════════════════════════════════════╝`);
  console.log(`\n  http://localhost:${PORT}`);
  console.log(`  Press Ctrl+C to stop\n`);
});
