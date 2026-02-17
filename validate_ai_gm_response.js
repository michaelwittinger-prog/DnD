const fs = require("fs");
const path = require("path");
const Ajv2020 = require("ajv/dist/2020");
const addFormats = require("ajv-formats");

// LEGACY/FROZEN COMPATIBILITY MODULE
// Retained for root-script compatibility. Prefer canonical validation paths under src/.

const SCHEMA_PATH = path.join(__dirname, "ai_gm_response.schema.json");

/**
 * Validates an AI GM response object against ai_gm_response.schema.json.
 * Returns { valid: true } or { valid: false, errors: [...] }.
 */
function validateAiGmResponse(data) {
  const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, "utf-8"));
  const ajv = new Ajv2020({ allErrors: true, allowUnionTypes: true });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  const valid = validate(data);
  return valid ? { valid: true } : { valid: false, errors: validate.errors };
}

module.exports = { validateAiGmResponse };

if (require.main === module) {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: node validate_ai_gm_response.js <response-file.json>");
    process.exit(1);
  }

  const filePath = path.resolve(file);
  const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));

  const result = validateAiGmResponse(data);
  if (result.valid) {
    console.log("PASS: AI GM response is valid");
    process.exit(0);
  } else {
    console.log("FAIL: AI GM response is invalid");
    for (const err of result.errors) {
      const loc = err.instancePath || "(root)";
      console.log(`  - instancePath: ${loc}`);
      console.log(`    message:      ${err.message}`);
      console.log(`    schemaPath:   ${err.schemaPath}`);
    }
    process.exit(1);
  }
}
