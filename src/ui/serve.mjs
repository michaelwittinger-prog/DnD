/**
 * serve.mjs — Minimal static file server for MIR UI.
 *
 * Serves the project root so browser ES modules can import engine files.
 * No dependencies beyond Node built-ins.
 *
 * Usage: node src/ui/serve.mjs
 */

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

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

server.listen(PORT, () => {
  console.log(`\n╔══════════════════════════════════════╗`);
  console.log(`║  MIR 2.1 — Tabletop Engine UI        ║`);
  console.log(`╚══════════════════════════════════════╝`);
  console.log(`\n  http://localhost:${PORT}\n`);
});
