const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const { validateGameState } = require("./validate_game_state");
const { checkInvariants } = require("./check_invariants");
const { validateAiGmResponse } = require("./validate_ai_gm_response");

const FIXTURES_DIR = path.join(__dirname, "fixtures");

// Load the reference game state for rules evaluation
const REFERENCE_STATE_PATH = path.join(__dirname, "game_state.example.json");
const referenceState = JSON.parse(
  fs.readFileSync(REFERENCE_STATE_PATH, "utf-8")
);

// Dynamic import for the ESM rules engine
let evaluateProposal;

const files = fs
  .readdirSync(FIXTURES_DIR)
  .filter((f) => f.endsWith(".json"))
  .sort();

let total = 0;
let passed = 0;
let failed = 0;

function report(file, expectation, actualPass, detail) {
  total++;
  const match = expectation === actualPass;
  const tag = match ? "OK" : "MISMATCH";
  if (match) {
    passed++;
    console.log(`  ${tag}  ${file}`);
  } else {
    failed++;
    console.log(
      `  ${tag}  ${file}  (expected ${expectation ? "pass" : "fail"}, got ${actualPass ? "pass" : "fail"})`
    );
    if (detail) console.log(`        ${detail}`);
  }
}

async function loadRulesEngine() {
  const mod = await import("./src/rules/rulesEngine.mjs");
  evaluateProposal = mod.evaluateProposal;
}

function runGameStateFixtures() {
  console.log("=== Game State Fixtures ===");
  for (const file of files) {
    if (!file.startsWith("state_")) continue;

    const filePath = path.join(FIXTURES_DIR, file);
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));

    if (file.startsWith("state_valid_")) {
      // Must pass schema AND invariants
      const schemaResult = validateGameState(data);
      const invariantError = checkInvariants(data);
      const allPass = schemaResult.valid && invariantError === null;
      let detail;
      if (!schemaResult.valid) detail = "schema failed";
      if (invariantError) detail = `invariant: ${invariantError}`;
      report(file, true, allPass, detail);
    } else if (file.startsWith("state_invalid_schema_")) {
      // Must fail schema validation
      const schemaResult = validateGameState(data);
      report(file, false, schemaResult.valid);
    } else if (file.startsWith("state_invalid_invariant_")) {
      // Must pass schema but fail invariants
      const schemaResult = validateGameState(data);
      const invariantError = checkInvariants(data);
      if (!schemaResult.valid) {
        report(
          file,
          false,
          false,
          "unexpectedly failed schema (should only fail invariants)"
        );
      } else if (invariantError === null) {
        report(file, false, true, "invariants passed unexpectedly");
      } else {
        // Schema passed, invariant failed — correct
        report(file, false, false);
      }
    }
  }
}

function runAiResponseFixtures() {
  console.log("");
  console.log("=== AI GM Response Fixtures ===");
  for (const file of files) {
    if (!file.startsWith("ai_response_")) continue;
    // Skip rules fixtures — handled separately
    if (
      file.startsWith("ai_response_illegal_") ||
      file.startsWith("ai_response_legal_")
    )
      continue;

    const filePath = path.join(FIXTURES_DIR, file);
    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));

    if (file.startsWith("ai_response_valid_")) {
      const result = validateAiGmResponse(data);
      report(file, true, result.valid);
    } else if (file.startsWith("ai_response_invalid_")) {
      const result = validateAiGmResponse(data);
      report(file, false, result.valid);
    }
  }
}

function runRulesFixtures() {
  console.log("");
  console.log("=== Rules Engine Fixtures ===");
  for (const file of files) {
    if (
      !file.startsWith("ai_response_illegal_") &&
      !file.startsWith("ai_response_legal_")
    )
      continue;

    const filePath = path.join(FIXTURES_DIR, file);
    const aiResponse = JSON.parse(fs.readFileSync(filePath, "utf-8"));

    // First check schema validity (must pass schema to reach rules gate)
    const schemaResult = validateAiGmResponse(aiResponse);
    if (!schemaResult.valid) {
      if (file.startsWith("ai_response_illegal_")) {
        report(file, false, false, "failed at schema level (before rules)");
      } else {
        report(
          file,
          true,
          false,
          "schema validation failed unexpectedly"
        );
      }
      continue;
    }

    // Evaluate rules
    const result = evaluateProposal({
      state: referenceState,
      aiResponse,
    });

    if (file.startsWith("ai_response_legal_")) {
      // Must pass rules
      let detail;
      if (!result.ok) {
        const codes = result.violations
          .filter((v) => v.severity === "error")
          .map((v) => v.code)
          .join(", ");
        detail = `rules failed: ${codes}`;
      }
      report(file, true, result.ok, detail);
    } else if (file.startsWith("ai_response_illegal_")) {
      // Must fail rules
      let detail;
      if (result.ok) {
        detail = "rules passed unexpectedly (should have failed)";
      }
      report(file, false, result.ok, detail);
    }
  }
}

function runReplayFixtures() {
  console.log("");
  console.log("=== Replay Bundle Fixtures ===");
  const demoBundlesDir = path.join(__dirname, "fixtures", "turn_bundles_demo");
  if (!fs.existsSync(demoBundlesDir)) {
    console.log("  (no demo bundles found — skipped)");
    return;
  }
  const bundles = fs.readdirSync(demoBundlesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  for (const bundleName of bundles) {
    const bundlePath = path.join(demoBundlesDir, bundleName);
    try {
      execSync(
        `node "${path.join(__dirname, "src", "pipeline", "replayTurn.mjs")}" "${bundlePath}"`,
        { encoding: "utf-8", stdio: "pipe" }
      );
      report(`replay:${bundleName}`, true, true);
    } catch (err) {
      const output = (err.stdout || "") + (err.stderr || "");
      report(`replay:${bundleName}`, true, false, output.split("\n").pop());
    }
  }
}

async function main() {
  await loadRulesEngine();

  runGameStateFixtures();
  runAiResponseFixtures();
  runRulesFixtures();
  runReplayFixtures();

  console.log("");
  console.log(`Results: ${passed}/${total} passed, ${failed} failed`);

  if (failed > 0) {
    console.log("FAIL: some fixture expectations were not met");
    process.exit(1);
  } else {
    console.log("PASS: all fixture expectations met");
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("Fixture runner error:", err);
  process.exit(1);
});
