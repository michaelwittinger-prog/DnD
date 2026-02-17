const fs = require("fs");
const path = require("path");

// LEGACY/FROZEN COMPATIBILITY MODULE
// Retained for root-script compatibility. Prefer canonical validation paths under src/state/.

/**
 * Checks logical invariants on a game state object that cannot be
 * expressed in JSON Schema alone.  Returns null on success or a
 * string describing the first violated invariant.
 */
function checkInvariants(state) {
  const mapW = state.map.dimensions.width;
  const mapH = state.map.dimensions.height;

  // 1. HP must be an integer >= 0 for every entity that has it
  for (const entity of state.entities) {
    if (entity.stats && entity.stats.hp !== undefined) {
      if (!Number.isInteger(entity.stats.hp) || entity.stats.hp < 0) {
        return `Entity "${entity.id}" has invalid HP: ${entity.stats.hp} (must be integer >= 0)`;
      }
    }
  }

  // 2. Entity positions must be within map bounds
  for (const entity of state.entities) {
    if (entity.position) {
      const { x, y } = entity.position;
      if (x < 0 || x >= mapW || y < 0 || y >= mapH) {
        return `Entity "${entity.id}" position (${x}, ${y}) is out of map bounds (${mapW}x${mapH})`;
      }
    }
  }

  // 3. Entity IDs must be unique
  const entityIds = new Set();
  for (const entity of state.entities) {
    if (entityIds.has(entity.id)) {
      return `Duplicate entity ID: "${entity.id}"`;
    }
    entityIds.add(entity.id);
  }

  // 4. Log entry IDs must be unique
  const logIds = new Set();
  for (const log of state.logs) {
    if (logIds.has(log.id)) {
      return `Duplicate log entry ID: "${log.id}"`;
    }
    logIds.add(log.id);
  }

  return null; // all invariants hold
}

// Allow importing as a module
module.exports = { checkInvariants };

// Run standalone when executed directly
if (require.main === module) {
  const stateFile = process.argv[2] || "game_state.example.json";
  const statePath = path.resolve(stateFile);
  const state = JSON.parse(fs.readFileSync(statePath, "utf-8"));

  const error = checkInvariants(state);
  if (error) {
    console.log("FAIL: invariant violated");
    console.log(`  ${error}`);
    process.exit(1);
  } else {
    console.log("PASS: all invariants hold");
    process.exit(0);
  }
}
