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
const rawSchema = JSON.parse(
  readFileSync(join(ROOT, "ai_gm_response.schema.json"), "utf-8")
);

// ── Model selection ────────────────────────────────────────────────────
const DEFAULT_MODEL = "gpt-4o";
function getModel() {
  return process.env.OPENAI_MODEL || DEFAULT_MODEL;
}

// ── Schema transform for OpenAI structured output ──────────────────────
/**
 * Transforms the JSON-Schema so it is accepted by OpenAI's structured-output
 * endpoint (strict mode).  Key changes:
 *   • Remove $schema / $id (not allowed)
 *   • oneOf  → anyOf
 *   • Every object gets all properties in "required"
 *   • additionalProperties that carry a sub-schema → false
 */
function transformForOpenAI(schema) {
  const s = JSON.parse(JSON.stringify(schema)); // deep clone
  delete s.$schema;
  delete s.$id;
  return walk(s);
}

function walk(node) {
  if (typeof node !== "object" || node === null) return node;
  if (Array.isArray(node)) return node.map(walk);

  const out = {};
  for (const [k, v] of Object.entries(node)) {
    if (k === "oneOf") {
      out.anyOf = walk(v);
    } else {
      out[k] = walk(v);
    }
  }

  // Ensure all object properties are listed in required (strict-mode rule)
  if (out.type === "object" && out.properties) {
    out.required = Object.keys(out.properties);
    // If additionalProperties is a schema object (not boolean), force false
    if (
      typeof out.additionalProperties === "object" &&
      out.additionalProperties !== null
    ) {
      out.additionalProperties = false;
    }
    if (out.additionalProperties === undefined) {
      out.additionalProperties = false;
    }
  }

  return out;
}

const openAiSchema = transformForOpenAI(rawSchema);

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
