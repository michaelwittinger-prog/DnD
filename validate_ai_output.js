const fs = require("fs");
const path = require("path");
const Ajv2020 = require("ajv/dist/2020");
const addFormats = require("ajv-formats");
const { checkInvariants } = require("./check_invariants");

// Require a file path argument
const stateFile = process.argv[2];
if (!stateFile) {
  console.error("Usage: node validate_ai_output.js <state-file.json>");
  process.exit(1);
}

const schemaPath = path.join(__dirname, "game_state.schema.json");
const statePath = path.resolve(stateFile);

const schema = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));
const state = JSON.parse(fs.readFileSync(statePath, "utf-8"));

// --- Step 1: Schema validation ---
const ajv = new Ajv2020({ allErrors: true, allowUnionTypes: true });
addFormats(ajv);

const validate = ajv.compile(schema);
const schemaValid = validate(state);

if (!schemaValid) {
  console.log("AI OUTPUT REJECTED");
  console.log("Schema validation failed:");
  for (const err of validate.errors) {
    const loc = err.instancePath || "(root)";
    console.log(`  - instancePath: ${loc}`);
    console.log(`    message:      ${err.message}`);
    console.log(`    schemaPath:   ${err.schemaPath}`);
  }
  process.exit(1);
}

// --- Step 2: Invariant checks ---
const invariantError = checkInvariants(state);

if (invariantError) {
  console.log("AI OUTPUT REJECTED");
  console.log(`Invariant violation: ${invariantError}`);
  process.exit(1);
}

console.log("AI OUTPUT ACCEPTED");
process.exit(0);
