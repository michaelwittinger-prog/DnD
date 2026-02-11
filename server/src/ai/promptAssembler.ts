import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "../../..");
const systemPromptPath = resolve(root, "ai_gm/system_prompt.md");
const rulesIndexPath = resolve(root, "ai_gm/rules_index.json");

function loadText(filePath: string): string {
  return readFileSync(filePath, "utf-8");
}

function loadJson(filePath: string): unknown {
  const raw = readFileSync(filePath, "utf-8");
  return JSON.parse(raw);
}

export interface PromptAssembly {
  systemPrompt: string;
  userPrompt: string;
}

export function assemblePrompt(state: unknown, playerInput: string): PromptAssembly {
  const systemPrompt = loadText(systemPromptPath).trim();
  const rulesIndex = loadJson(rulesIndexPath);

  const rulesBlock = JSON.stringify(rulesIndex, null, 2);
  const stateBlock = JSON.stringify(state, null, 2);

  const userPrompt = [
    "=== RULES ===",
    rulesBlock,
    "=== END RULES ===",
    "",
    "=== STATE ===",
    stateBlock,
    "=== END STATE ===",
    "",
    "=== PLAYER_INPUT ===",
    playerInput,
    "=== END PLAYER_INPUT ==="
  ].join("\n");

  const systemBlock = ["=== SYSTEM ===", systemPrompt, "=== END SYSTEM ==="].join("\n");
  return { systemPrompt: systemBlock, userPrompt };
}
