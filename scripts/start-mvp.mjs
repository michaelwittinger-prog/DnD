/**
 * start-mvp.mjs — MIR 4.1 Single Command Startup.
 *
 * Spawns both the UI server (port 3001) and AI bridge (port 3002)
 * in a single process, forwarding logs with color-coded prefixes.
 *
 * Usage: node scripts/start-mvp.mjs
 *        npm run start:mvp
 */

import { spawn } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const UI_SCRIPT = resolve(ROOT, "src/ui/serve.mjs");
const BRIDGE_SCRIPT = resolve(ROOT, "src/server/aiBridge.mjs");

// ANSI colors
const CYAN = "\x1b[36m";
const MAGENTA = "\x1b[35m";
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const GREEN = "\x1b[32m";

console.log(`\n${BOLD}╔══════════════════════════════════════╗${RESET}`);
console.log(`${BOLD}║  MIR 4.1 — Make It Real MVP           ║${RESET}`);
console.log(`${BOLD}╚══════════════════════════════════════╝${RESET}`);
console.log();
console.log(`  ${GREEN}Starting UI server + AI bridge...${RESET}`);
console.log();

function spawnProcess(label, color, scriptPath) {
  const child = spawn("node", [scriptPath], {
    cwd: ROOT,
    env: { ...process.env },
    stdio: ["ignore", "pipe", "pipe"],
  });

  const prefix = `${color}[${label}]${RESET}`;

  child.stdout.on("data", (data) => {
    const lines = data.toString().split("\n").filter((l) => l.trim());
    for (const line of lines) {
      console.log(`${prefix} ${line}`);
    }
  });

  child.stderr.on("data", (data) => {
    const lines = data.toString().split("\n").filter((l) => l.trim());
    for (const line of lines) {
      console.error(`${prefix} ${line}`);
    }
  });

  child.on("exit", (code) => {
    console.log(`${prefix} Process exited (code ${code})`);
  });

  return child;
}

const uiChild = spawnProcess("UI  ", CYAN, UI_SCRIPT);
const bridgeChild = spawnProcess("AI  ", MAGENTA, BRIDGE_SCRIPT);

// After a short delay, print the user-facing summary
setTimeout(() => {
  console.log();
  console.log(`  ${BOLD}${GREEN}✓ Ready!${RESET}`);
  console.log();
  console.log(`  ${BOLD}Open in browser:${RESET}  http://localhost:3001`);
  console.log(`  ${BOLD}AI bridge:${RESET}        http://localhost:3002/api/propose`);
  console.log(`  ${BOLD}AI mode:${RESET}          ${process.env.OPENAI_API_KEY ? "real (key found)" : "mock (set OPENAI_API_KEY for real AI)"}`);
  console.log();
  console.log(`  Press Ctrl+C to stop both servers.`);
  console.log();
}, 500);

// Clean shutdown
function cleanup() {
  console.log(`\n  Shutting down...`);
  uiChild.kill();
  bridgeChild.kill();
  process.exit(0);
}

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);
