const fs = require("fs");
const path = require("path");
const Ajv2020 = require("ajv/dist/2020");
const addFormats = require("ajv-formats");

// LEGACY/FROZEN COMPATIBILITY MODULE
// Retained for root-script compatibility. Prefer canonical validation paths under src/state/.

const SCHEMA_PATH = path.join(__dirname, "game_state.schema.json");

/**
 * Validates a game-state object against game_state.schema.json.
 * Returns { valid: true } or { valid: false, errors: [...] }.
 */
function validateGameState(state) {
  const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, "utf-8"));
  const ajv = new Ajv2020({ allErrors: true, allowUnionTypes: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  const valid = validate(state);
  return valid ? { valid: true } : { valid: false, errors: validate.errors };
}

module.exports = { validateGameState };

if (require.main === module) {
  const stateFile = process.argv[2] || "game_state.example.json";
  const statePath = path.resolve(stateFile);
  const state = JSON.parse(fs.readFileSync(statePath, "utf-8"));

  const result = validateGameState(state);
  if (result.valid) {
    console.log("PASS: game state is valid");
    process.exit(0);
  } else {
    console.log("FAIL: game state is invalid");
    for (const err of result.errors) {
      const loc = err.instancePath || "(root)";
      console.log(`  - instancePath: ${loc}`);
      console.log(`    message:      ${err.message}`);
      console.log(`    schemaPath:   ${err.schemaPath}`);
    }
    process.exit(1);
  }
}
