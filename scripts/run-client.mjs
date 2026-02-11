#!/usr/bin/env node
/**
 * Launches the client Vite dev server on port 5173.
 *
 * Workaround: npm scripts break on Windows when the parent path contains '&'
 * (e.g. D&D), so we spawn node with the vite binary directly.
 */
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const clientRoot = resolve(__dirname, "..", "client");
const viteBin = resolve(clientRoot, "node_modules", "vite", "bin", "vite.js");

console.log("Starting client dev server…");
console.log(`  Client root : ${clientRoot}`);
console.log(`  Expected URL: http://127.0.0.1:5173/`);
console.log();

const child = spawn(process.execPath, [viteBin], {
  cwd: clientRoot,
  stdio: "inherit",
  env: { ...process.env },
});

child.on("close", (code) => {
  if (code !== 0) {
    console.error(`\n❌  Client exited with code ${code}.`);
  }
  process.exit(code ?? 1);
});

child.on("error", (err) => {
  console.error("❌  Failed to start client:", err.message);
  process.exit(1);
});
