import Ajv2020 from "ajv/dist/2020.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.log("Skipping AI GM integration test. OPENAI_API_KEY is not set.");
  process.exit(0);
}

const root = resolve(new URL("../../..", import.meta.url).pathname);
const statePath = resolve(root, "game_state.example.json");
const aiSchemaPath = resolve(root, "shared/schemas/aiResponse.schema.json");
const stateSchemaPath = resolve(root, "game_state.schema.json");

const state = JSON.parse(readFileSync(statePath, "utf-8"));
const aiSchema = JSON.parse(readFileSync(aiSchemaPath, "utf-8"));
const stateSchema = JSON.parse(readFileSync(stateSchemaPath, "utf-8"));

const ajv = new Ajv2020({ allErrors: true, strict: false });
const validateAi = ajv.compile(aiSchema);
const validateState = ajv.compile(stateSchema);

// Use 127.0.0.1 instead of "localhost" — Node.js v24+ resolves localhost to IPv6.
// Route is /ai-gm (no /api prefix) — see PROJECT_CONTEXT.md caveat #4.
const response = await fetch("http://127.0.0.1:3001/ai-gm", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    state,
    player_input: "Seren moves to 6,6 and attacks Captain Voss."
  })
});

if (!response.ok) {
  const text = await response.text();
  console.error("Request failed", response.status, text);
  process.exit(1);
}

const payload = await response.json();

if (!validateAi(payload.ai_response)) {
  console.error("AI response failed schema validation", validateAi.errors);
  process.exit(1);
}

if (!validateState(payload.updated_state)) {
  console.error("Updated state failed schema validation", validateState.errors);
  process.exit(1);
}

console.log("AI GM integration test passed");
