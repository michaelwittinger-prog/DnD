const fs = require("fs");
const path = require("path");

// LEGACY/FROZEN COMPATIBILITY MODULE
// Retained for root-script compatibility. Prefer canonical validation paths under src/state/.

const EXPECTED_VERSION = "1.0.0";

/**
 * Checks schema-version compatibility.
 * Returns { ok: true, warn?: string } or { ok: false, message: string }.
 */
function checkSchemaVersion(state) {
  const stateVersion = state.meta && state.meta.schemaVersion;
  if (!stateVersion) {
    return { ok: false, message: "game state is missing meta.schemaVersion" };
  }

  const [expectedMajor, expectedMinor] = EXPECTED_VERSION.split(".").map(Number);
  const [stateMajor, stateMinor] = stateVersion.split(".").map(Number);

  if (stateMajor !== expectedMajor) {
    return {
      ok: false,
      message: `major version mismatch — state has ${stateVersion}, expected ${EXPECTED_VERSION}`,
    };
  }

  let warn;
  if (stateMinor !== expectedMinor) {
    warn = `minor version mismatch — state has ${stateVersion}, expected ${EXPECTED_VERSION}`;
  }

  return { ok: true, version: stateVersion, expected: EXPECTED_VERSION, warn };
}

module.exports = { checkSchemaVersion, EXPECTED_VERSION };

if (require.main === module) {
  const stateFile = process.argv[2] || "game_state.example.json";
  const statePath = path.resolve(stateFile);
  const state = JSON.parse(fs.readFileSync(statePath, "utf-8"));

  const result = checkSchemaVersion(state);
  if (!result.ok) {
    console.log(`FAIL: ${result.message}`);
    process.exit(1);
  }
  if (result.warn) {
    console.log(`WARN: ${result.warn}`);
  }
  console.log(`PASS: schema version ${result.version} is compatible with ${result.expected}`);
  process.exit(0);
}
