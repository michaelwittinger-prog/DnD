const fs = require("fs");
const path = require("path");
const { validateAiGmResponse } = require("./validate_ai_gm_response");
const { checkSchemaVersion } = require("./check_schema_version");
const { validateGameState } = require("./validate_game_state");
const { checkInvariants } = require("./check_invariants");

// ── Parse CLI args ───────────────────────────────────────────────────
function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--response" && argv[i + 1]) {
      args.response = argv[++i];
    } else if (argv[i] === "--state" && argv[i + 1]) {
      args.state = argv[++i];
    } else if (argv[i] === "--rules-report" && argv[i + 1]) {
      args.rulesReport = argv[++i];
    }
  }
  return args;
}

const args = parseArgs(process.argv);

if (!args.response || !args.state) {
  console.error(
    "Usage: node gatekeeper.js --response <ai-response.json> --state <game-state.json> [--rules-report <rules-report.json>]"
  );
  process.exit(1);
}

const responsePath = path.resolve(args.response);
const statePath = path.resolve(args.state);

const responseData = JSON.parse(fs.readFileSync(responsePath, "utf-8"));
const stateData = JSON.parse(fs.readFileSync(statePath, "utf-8"));

// Rules report is optional — if provided, we check it; if not, skip the gate
let rulesReportData = null;
if (args.rulesReport) {
  const rulesReportPath = path.resolve(args.rulesReport);
  if (fs.existsSync(rulesReportPath)) {
    rulesReportData = JSON.parse(fs.readFileSync(rulesReportPath, "utf-8"));
  }
}

let allPassed = true;
const TOTAL_GATES = 5;

function printErrors(errors) {
  for (const err of errors) {
    const loc = err.instancePath || "(root)";
    console.log(`    - instancePath: ${loc}`);
    console.log(`      message:      ${err.message}`);
    console.log(`      schemaPath:   ${err.schemaPath}`);
  }
}

// ── Stage 1: AI GM Response Schema ───────────────────────────────────
const stage1 = validateAiGmResponse(responseData);
if (stage1.valid) {
  console.log(`[1/${TOTAL_GATES}] AI GM Response Schema ... PASS`);
} else {
  console.log(`[1/${TOTAL_GATES}] AI GM Response Schema ... FAIL`);
  printErrors(stage1.errors);
  allPassed = false;
}

// ── Stage 2: Rules Legality ──────────────────────────────────────────
if (rulesReportData) {
  if (rulesReportData.ok) {
    const warnCount = (rulesReportData.violations || []).filter(
      (v) => v.severity === "warning"
    ).length;
    if (warnCount > 0) {
      console.log(
        `[2/${TOTAL_GATES}] Rules Legality ........... PASS (${warnCount} warning(s))`
      );
    } else {
      console.log(`[2/${TOTAL_GATES}] Rules Legality ........... PASS`);
    }
  } else {
    console.log(`[2/${TOTAL_GATES}] Rules Legality ........... FAIL`);
    for (const v of rulesReportData.violations || []) {
      if (v.severity === "error") {
        console.log(`    - [${v.code}] ${v.message} (${v.path})`);
      }
    }
    allPassed = false;
  }
} else {
  console.log(`[2/${TOTAL_GATES}] Rules Legality ........... SKIP (no report)`);
}

// ── Stage 3: Schema Version ──────────────────────────────────────────
const stage3 = checkSchemaVersion(stateData);
if (stage3.ok) {
  if (stage3.warn) {
    console.log(
      `[3/${TOTAL_GATES}] Schema Version ........... PASS (WARN: ${stage3.warn})`
    );
  } else {
    console.log(`[3/${TOTAL_GATES}] Schema Version ........... PASS`);
  }
} else {
  console.log(
    `[3/${TOTAL_GATES}] Schema Version ........... FAIL — ${stage3.message}`
  );
  allPassed = false;
}

// ── Stage 4: Game State Schema ───────────────────────────────────────
const stage4 = validateGameState(stateData);
if (stage4.valid) {
  console.log(`[4/${TOTAL_GATES}] Game State Schema ........ PASS`);
} else {
  console.log(`[4/${TOTAL_GATES}] Game State Schema ........ FAIL`);
  printErrors(stage4.errors);
  allPassed = false;
}

// ── Stage 5: Invariants ──────────────────────────────────────────────
const stage5 = checkInvariants(stateData);
if (stage5 === null) {
  console.log(`[5/${TOTAL_GATES}] Invariants ............... PASS`);
} else {
  console.log(`[5/${TOTAL_GATES}] Invariants ............... FAIL — ${stage5}`);
  allPassed = false;
}

// ── Summary ──────────────────────────────────────────────────────────
console.log("");
if (allPassed) {
  console.log("RESULT: ALL GATES PASSED");
  process.exit(0);
} else {
  console.log("RESULT: GATE FAILED");
  process.exit(1);
}
