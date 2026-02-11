#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const Ajv2020 = require("ajv/dist/2020");
const addFormats = require("ajv-formats");

const root = path.resolve(__dirname, "..");

function loadJSON(filePath) {
  const abs = path.resolve(root, filePath);
  const raw = fs.readFileSync(abs, "utf-8");
  return JSON.parse(raw);
}

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);

const pairs = [
  {
    label: "game_state.example.json vs game_state.schema.json",
    data: "game_state.example.json",
    schema: "game_state.schema.json"
  },
  {
    label: "ai_gm/example_output.json vs shared/schemas/aiResponse.schema.json",
    data: "ai_gm/example_output.json",
    schema: "shared/schemas/aiResponse.schema.json"
  }
];

let failed = false;

for (const pair of pairs) {
  const schema = loadJSON(pair.schema);
  const data = loadJSON(pair.data);
  const validate = ajv.compile(schema);
  const valid = validate(data);

  if (valid) {
    console.log("PASS  " + pair.label);
  } else {
    console.error("FAIL  " + pair.label);
    for (const err of validate.errors) {
      console.error("  " + err.instancePath + " " + err.message);
      if (err.params) {
        console.error("    params: " + JSON.stringify(err.params));
      }
    }
    failed = true;
  }
}

if (failed) {
  console.error("\nValidation failed.");
  process.exit(1);
} else {
  console.log("\nAll validations passed.");
  process.exit(0);
}
