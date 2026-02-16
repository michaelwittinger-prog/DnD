/**
 * ChatGPT adapter — calls the OpenAI Responses API with structured output
 * constrained to ai_gm_response.schema.json.
 *
 * Export: generateAiGmResponse({ state, playerIntent, seed })
 */
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { getClient } from "./openaiClient.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");

// ── Load static assets once ────────────────────────────────────────────
const systemPrompt = readFileSync(join(ROOT, "ai_gm", "system_prompt.md"), "utf-8");
const rulesIndex = readFileSync(join(ROOT, "ai_gm", "rules_index.json"), "utf-8");

// Use the pre-built, CI-validated OpenAI strict-mode schema.
// This schema is hand-crafted and validated by tests/openai_schema_test.mjs
// to guarantee 100% compliance with OpenAI structured-output strict mode.
// No runtime transformation needed.
const openAiSchema = JSON.parse(
  readFileSync(join(ROOT, "shared", "schemas", "aiResponse.openai.strict.json"), "utf-8")
);

// ── Model selection ────────────────────────────────────────────────────
const DEFAULT_MODEL = "gpt-4o";
function getModel() {
  return process.env.OPENAI_MODEL || DEFAULT_MODEL;
}

// ── Prompt assembly (per prompt_builder.md) ────────────────────────────
function buildPrompt(state, playerInput) {
  const stateJson = JSON.stringify(state, null, 2);

  return [
    `=== SYSTEM ===\n${systemPrompt}\n=== END SYSTEM ===`,
    `=== RULES ===\n${rulesIndex}\n=== END RULES ===`,
    `=== STATE ===\n${stateJson}\n=== END STATE ===`,
    `=== PLAYER_INPUT ===\n${playerInput}\n=== END PLAYER_INPUT ===`,
  ].join("\n\n");
}

// ── Public API ─────────────────────────────────────────────────────────
/**
 * Calls ChatGPT and returns a parsed AI GM response object.
 *
 * @param {object}  opts
 * @param {object}  opts.state         Current game-state JSON
 * @param {object}  opts.playerIntent  Player intent JSON (must have .intent)
 * @param {number} [opts.seed]         Optional deterministic seed
 * @returns {Promise<object>}          Parsed AI GM response
 */
export async function generateAiGmResponse({ state, playerIntent, seed }) {
  const model = getModel();
  const userMessage = buildPrompt(state, playerIntent.intent);

  console.log(`[adapter] model=${model}  seed=${seed ?? "none"}`);

  let response;
  try {
    const params = {
      model,
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "ai_gm_response",
          schema: openAiSchema,
          strict: true,
        },
      },
    };
    if (seed !== undefined && seed !== null) {
      params.seed = seed;
    }

    response = await getClient().responses.create(params);
  } catch (err) {
    throw new Error(
      `[adapter] OpenAI API call failed: ${err.message}\n` +
        (err.response ? JSON.stringify(err.response.data, null, 2) : "")
    );
  }

  // Extract the text from the response
  const rawText = response.output_text;
  if (!rawText) {
    throw new Error(
      "[adapter] No output_text in response. Raw response:\n" +
        JSON.stringify(response, null, 2)
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch (err) {
    throw new Error(
      `[adapter] Failed to parse model output as JSON: ${err.message}\n` +
        `Raw output:\n${rawText}`
    );
  }

  return parsed;
}
