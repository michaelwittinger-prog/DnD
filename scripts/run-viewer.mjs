#!/usr/bin/env node
/**
 * Launches the viewer Vite dev server on port 5174 (strict).
 *
 * Workaround: npm scripts break on Windows when the parent path contains '&'
 * (e.g. D&D), so we spawn node with the vite binary directly.
 *
 * If port 5174 is occupied, Vite exits non-zero thanks to strictPort: true
 * in viewer/vite.config.js.  This script forwards that exit code.
 */
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const viewerRoot = resolve(__dirname, "..", "viewer");
const viteBin = resolve(viewerRoot, "node_modules", "vite", "bin", "vite.js");

console.log("Starting battlemap viewer…");
console.log(`  Viewer root : ${viewerRoot}`);
console.log(`  Expected URL: http://127.0.0.1:5174/`);
console.log();

const child = spawn(process.execPath, [viteBin], {
  cwd: viewerRoot,
  stdio: "inherit",
  env: { ...process.env },
});

child.on("close", (code) => {
  if (code !== 0) {
    console.error(
      `\n❌  Viewer exited with code ${code}.` +
        `\n   If port 5174 is in use, stop the other process first.`
    );
  }
  process.exit(code ?? 1);
});

child.on("error", (err) => {
  console.error("❌  Failed to start viewer:", err.message);
  process.exit(1);
});
