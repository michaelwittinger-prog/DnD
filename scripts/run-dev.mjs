#!/usr/bin/env node
/**
 * run-dev — starts both the local API server and the viewer in parallel.
 * Cross-platform (Windows Git Bash compatible).
 */
import { spawn } from "child_process";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

function run(label, cmd, args, cwd) {
  const proc = spawn("node", [cmd, ...args], {
    cwd,
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
  });

  proc.stdout.on("data", (d) => {
    for (const line of d.toString().split("\n").filter(Boolean)) {
      console.log(`[${label}] ${line}`);
    }
  });

  proc.stderr.on("data", (d) => {
    for (const line of d.toString().split("\n").filter(Boolean)) {
      console.error(`[${label}] ${line}`);
    }
  });

  proc.on("exit", (code) => {
    console.log(`[${label}] exited with code ${code}`);
  });

  return proc;
}

console.log("Starting API server + Viewer in parallel...\n");

const api = run("API", resolve(ROOT, "src/server/localApiServer.mjs"), [], ROOT);
const viewer = run("VIEW", resolve(ROOT, "scripts/run-viewer.mjs"), [], ROOT);

process.on("SIGINT", () => {
  api.kill();
  viewer.kill();
  process.exit(0);
});
