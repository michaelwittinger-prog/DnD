#!/usr/bin/env node
/**
 * Launches the Express server via tsx on port 3001.
 *
 * Workaround: npm scripts break on Windows when the parent path contains '&'
 * (e.g. D&D), so we spawn node directly with the correct cwd.
 */
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverRoot = resolve(__dirname, "..", "server");
const entryPoint = resolve(serverRoot, "src", "index.ts");

console.log("Starting server…");
console.log(`  Server root : ${serverRoot}`);
console.log(`  Expected URL: http://127.0.0.1:3001/`);
console.log();

const child = spawn(
  process.execPath,
  ["--import", "tsx", entryPoint],
  {
    cwd: serverRoot,
    stdio: "inherit",
    env: { ...process.env },
  }
);

child.on("close", (code) => {
  if (code !== 0) {
    console.error(`\n❌  Server exited with code ${code}.`);
  }
  process.exit(code ?? 1);
});

child.on("error", (err) => {
  console.error("❌  Failed to start server:", err.message);
  process.exit(1);
});
