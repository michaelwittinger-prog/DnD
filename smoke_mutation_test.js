const fs = require("fs");
const path = require("path");
const Ajv2020 = require("ajv/dist/2020");
const addFormats = require("ajv-formats");

const schemaPath = path.join(__dirname, "game_state.schema.json");
const examplePath = path.join(__dirname, "game_state.example.json");

const schema = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));
const state = JSON.parse(fs.readFileSync(examplePath, "utf-8"));

// Deep copy
const mutated = JSON.parse(JSON.stringify(state));

// Mutate first entity: new position and HP
mutated.entities[0].position = { x: 6, y: 6 };
mutated.entities[0].stats.hp = 20;

// Append a log entry
mutated.logs.push({
  id: "log-test",
  message: "Test",
  level: "info",
  timestamp: mutated.meta.createdAt,
});

// Validate
const ajv = new Ajv2020({ allErrors: true, allowUnionTypes: true });
addFormats(ajv);

const validate = ajv.compile(schema);
const valid = validate(mutated);

if (valid) {
  console.log("PASS: mutated game state is valid");
  process.exit(0);
} else {
  console.log("FAIL: mutated game state is invalid");
  for (const err of validate.errors) {
    const loc = err.instancePath || "(root)";
    console.log(`  - instancePath: ${loc}`);
    console.log(`    message:      ${err.message}`);
    console.log(`    schemaPath:   ${err.schemaPath}`);
  }
  process.exit(1);
}
