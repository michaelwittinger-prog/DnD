/**
 * pathfinding_test.mjs — MIR A* Pathfinding Tests.
 *
 * Tests: findPath, findPathForEntity, findPathToAdjacent, isAdjacent,
 *        getHostileEntities, edge cases, performance.
 */

import { findPath, findPathForEntity, findPathToAdjacent, isAdjacent, getHostileEntities } from "../src/engine/pathfinding.mjs";
import { explorationExample, demoEncounter } from "../src/state/exampleStates.mjs";

console.log("\n╔══════════════════════════════════════╗");
console.log("║  MIR S0.5 — Pathfinding Tests          ║");
console.log("╚══════════════════════════════════════╝\n");

let passed = 0, failed = 0;
const check = (c, l) => { if (c) { console.log(`  ✅ ${l}`); passed++; } else { console.log(`  ❌ ${l}`); failed++; } };

// ── Helper: minimal state for testing ───────────────────────────────────
function minState(width, height, blocked = [], entities = []) {
  return {
    map: {
      grid: { size: { width, height } },
      terrain: blocked.map(([x, y]) => ({ x, y, type: "blocked", blocksMovement: true })),
    },
    entities: {
      players: entities.filter(e => e.kind === "player"),
      npcs: entities.filter(e => e.kind === "npc"),
      objects: entities.filter(e => e.kind === "object"),
    },
  };
}

function makeEnt(id, kind, x, y, speed = 6) {
  return {
    id, kind, name: id, position: { x, y },
    stats: { hpCurrent: 10, hpMax: 10, ac: 10, movementSpeed: speed },
    conditions: [],
  };
}

// ════════════════════════════════════════════════════════════════════
// Test 1: Simple straight-line path
// ════════════════════════════════════════════════════════════════════
console.log("[Test 1] Simple straight-line path");
{
  const state = minState(10, 10);
  const result = findPath(state, { x: 0, y: 0 }, { x: 3, y: 0 });
  check(result !== null, "Path found");
  check(result.cost === 3, `Cost is 3 (got ${result.cost})`);
  check(result.path.length === 3, `Path has 3 steps (got ${result.path.length})`);
  check(result.path[0].x === 1 && result.path[0].y === 0, "Step 1: (1,0)");
  check(result.path[1].x === 2 && result.path[1].y === 0, "Step 2: (2,0)");
  check(result.path[2].x === 3 && result.path[2].y === 0, "Step 3: (3,0)");
}

// ════════════════════════════════════════════════════════════════════
// Test 2: Path with turn (L-shape)
// ════════════════════════════════════════════════════════════════════
console.log("\n[Test 2] L-shaped path");
{
  const state = minState(10, 10);
  const result = findPath(state, { x: 0, y: 0 }, { x: 2, y: 3 });
  check(result !== null, "Path found");
  check(result.cost === 5, `Cost is 5 (got ${result.cost})`);
  // Verify all steps are cardinal (Manhattan distance 1 between each)
  let prev = { x: 0, y: 0 };
  let allCardinal = true;
  for (const step of result.path) {
    const d = Math.abs(step.x - prev.x) + Math.abs(step.y - prev.y);
    if (d !== 1) allCardinal = false;
    prev = step;
  }
  check(allCardinal, "All steps are cardinal");
  check(result.path[result.path.length - 1].x === 2 && result.path[result.path.length - 1].y === 3, "Ends at goal");
}

// ════════════════════════════════════════════════════════════════════
// Test 3: Already at goal
// ════════════════════════════════════════════════════════════════════
console.log("\n[Test 3] Already at goal");
{
  const state = minState(10, 10);
  const result = findPath(state, { x: 5, y: 5 }, { x: 5, y: 5 });
  check(result !== null, "Result returned (not null)");
  check(result.cost === 0, "Cost is 0");
  check(result.path.length === 0, "Path is empty");
}

// ════════════════════════════════════════════════════════════════════
// Test 4: Path around a wall
// ════════════════════════════════════════════════════════════════════
console.log("\n[Test 4] Path around a wall");
{
  // Wall at x=3, y=0..3 — must go around
  const state = minState(10, 10, [
    [3, 0], [3, 1], [3, 2], [3, 3],
  ]);
  const result = findPath(state, { x: 2, y: 2 }, { x: 4, y: 2 });
  check(result !== null, "Path found");
  check(result.cost > 2, `Cost > 2 because of wall (got ${result.cost})`);
  // Path should go up to y=4 area or down to avoid wall
  const lastStep = result.path[result.path.length - 1];
  check(lastStep.x === 4 && lastStep.y === 2, "Reaches goal");
  // No step should be on a blocked cell
  const blocked = new Set(["3,0", "3,1", "3,2", "3,3"]);
  const noBlocked = result.path.every(s => !blocked.has(`${s.x},${s.y}`));
  check(noBlocked, "Path avoids all blocked cells");
}

// ════════════════════════════════════════════════════════════════════
// Test 5: Completely blocked — no path
// ════════════════════════════════════════════════════════════════════
console.log("\n[Test 5] Completely blocked — no path");
{
  // Surround the goal with walls
  const state = minState(5, 5, [
    [2, 1], [2, 3], [1, 2], [3, 2],
  ]);
  const result = findPath(state, { x: 0, y: 0 }, { x: 2, y: 2 });
  check(result === null, "Returns null (unreachable)");
}

// ════════════════════════════════════════════════════════════════════
// Test 6: Goal on blocked terrain
// ════════════════════════════════════════════════════════════════════
console.log("\n[Test 6] Goal on blocked terrain");
{
  const state = minState(10, 10, [[5, 5]]);
  const result = findPath(state, { x: 0, y: 0 }, { x: 5, y: 5 });
  check(result === null, "Returns null (goal is blocked)");
}

// ════════════════════════════════════════════════════════════════════
// Test 7: Goal occupied by another entity
// ════════════════════════════════════════════════════════════════════
console.log("\n[Test 7] Goal occupied by entity");
{
  const state = minState(10, 10, [], [
    makeEnt("pc-a", "player", 0, 0),
    makeEnt("npc-b", "npc", 3, 0),
  ]);
  // Default: occupied goal is rejected
  const result = findPath(state, { x: 0, y: 0 }, { x: 3, y: 0 }, { entityId: "pc-a" });
  check(result === null, "Returns null (goal occupied)");

  // With allowOccupiedGoal
  const result2 = findPath(state, { x: 0, y: 0 }, { x: 3, y: 0 }, { entityId: "pc-a", allowOccupiedGoal: true });
  check(result2 !== null, "With allowOccupiedGoal: path found");
  check(result2.cost === 3, "Cost is 3");
}

// ════════════════════════════════════════════════════════════════════
// Test 8: Path avoids occupied cells
// ════════════════════════════════════════════════════════════════════
console.log("\n[Test 8] Path avoids occupied cells");
{
  const state = minState(10, 10, [], [
    makeEnt("pc-a", "player", 0, 0),
    makeEnt("npc-b", "npc", 1, 0), // blocks direct east path
  ]);
  const result = findPath(state, { x: 0, y: 0 }, { x: 2, y: 0 }, { entityId: "pc-a" });
  check(result !== null, "Path found");
  check(result.cost > 2, `Cost > 2 to go around (got ${result.cost})`);
  const noOccupied = result.path.every(s => !(s.x === 1 && s.y === 0));
  check(noOccupied, "Path avoids npc-b at (1,0)");
}

// ════════════════════════════════════════════════════════════════════
// Test 9: maxCost limits path length
// ════════════════════════════════════════════════════════════════════
console.log("\n[Test 9] maxCost limits path length");
{
  const state = minState(20, 20);
  // Goal is 10 steps away, but maxCost is 5
  const result = findPath(state, { x: 0, y: 0 }, { x: 10, y: 0 }, { maxCost: 5 });
  check(result === null, "Returns null (too far for budget)");

  // Same goal but maxCost is 10 — should work
  const result2 = findPath(state, { x: 0, y: 0 }, { x: 10, y: 0 }, { maxCost: 10 });
  check(result2 !== null, "With maxCost=10: path found");
  check(result2.cost === 10, `Cost is 10 (got ${result2.cost})`);
}

// ════════════════════════════════════════════════════════════════════
// Test 10: Out of bounds
// ════════════════════════════════════════════════════════════════════
console.log("\n[Test 10] Out of bounds");
{
  const state = minState(5, 5);
  check(findPath(state, { x: -1, y: 0 }, { x: 2, y: 2 }) === null, "Start OOB left");
  check(findPath(state, { x: 0, y: -1 }, { x: 2, y: 2 }) === null, "Start OOB top");
  check(findPath(state, { x: 5, y: 0 }, { x: 2, y: 2 }) === null, "Start OOB right");
  check(findPath(state, { x: 0, y: 5 }, { x: 2, y: 2 }) === null, "Start OOB bottom");
  check(findPath(state, { x: 0, y: 0 }, { x: 5, y: 0 }) === null, "Goal OOB right");
  check(findPath(state, { x: 0, y: 0 }, { x: 0, y: -1 }) === null, "Goal OOB top");
}

// ════════════════════════════════════════════════════════════════════
// Test 11: Adjacent cells — Manhattan distance 1
// ════════════════════════════════════════════════════════════════════
console.log("\n[Test 11] Adjacent cells");
{
  const state = minState(10, 10);
  const result = findPath(state, { x: 5, y: 5 }, { x: 5, y: 6 });
  check(result !== null, "Path to adjacent cell found");
  check(result.cost === 1, "Cost is 1");
  check(result.path.length === 1, "1 step");
}

// ════════════════════════════════════════════════════════════════════
// Test 12: No diagonal steps in path
// ════════════════════════════════════════════════════════════════════
console.log("\n[Test 12] No diagonal steps ever");
{
  const state = minState(20, 20);
  // Diagonal goal
  const result = findPath(state, { x: 0, y: 0 }, { x: 7, y: 7 });
  check(result !== null, "Path found");
  check(result.cost === 14, `Manhattan cost 14 (got ${result.cost})`);
  let prev = { x: 0, y: 0 };
  let allCardinal = true;
  for (const step of result.path) {
    const d = Math.abs(step.x - prev.x) + Math.abs(step.y - prev.y);
    if (d !== 1) { allCardinal = false; break; }
    prev = step;
  }
  check(allCardinal, "All 14 steps are cardinal");
}

// ════════════════════════════════════════════════════════════════════
// Test 13: findPathForEntity
// ════════════════════════════════════════════════════════════════════
console.log("\n[Test 13] findPathForEntity");
{
  const state = structuredClone(explorationExample);
  // pc-seren is at (2,3) with movementSpeed 6
  const result = findPathForEntity(state, "pc-seren", { x: 2, y: 6 });
  check(result !== null, "Path found for pc-seren");
  check(result.cost === 3, `Cost is 3 (got ${result.cost})`);
  check(result.path.length === 3, "3 steps");

  // Goal too far for speed
  const farResult = findPathForEntity(state, "pc-seren", { x: 2, y: 10 });
  // Distance is 7, speed is 6 — but y=10 is outside map (height=10 → max y=9)
  // Actually (2,9) is 6 steps from (2,3) — exact speed
  const exactResult = findPathForEntity(state, "pc-seren", { x: 2, y: 9 });
  check(exactResult !== null, "Exact speed distance reachable");
  check(exactResult.cost === 6, `Cost is 6 (got ${exactResult?.cost})`);

  // Nonexistent entity
  const noEnt = findPathForEntity(state, "npc-ghost", { x: 0, y: 0 });
  check(noEnt === null, "Nonexistent entity returns null");
}

// ════════════════════════════════════════════════════════════════════
// Test 14: findPathToAdjacent
// ════════════════════════════════════════════════════════════════════
console.log("\n[Test 14] findPathToAdjacent");
{
  const state = structuredClone(explorationExample);
  // pc-seren at (2,3), npc-barkeep at (6,2)
  const result = findPathToAdjacent(state, "pc-seren", "npc-barkeep");
  check(result !== null, "Adjacent path found");
  check(result.cost > 0, `Cost > 0 (got ${result.cost})`);
  // Result cell should be adjacent to barkeep (6,2)
  const dist = Math.abs(result.cell.x - 6) + Math.abs(result.cell.y - 2);
  // If the mover ends up in the result cell, they should be adjacent to target
  // But if path is empty (already adjacent), cell is mover's current position
  if (result.path.length > 0) {
    const finalPos = result.path[result.path.length - 1];
    const adjDist = Math.abs(finalPos.x - 6) + Math.abs(finalPos.y - 2);
    check(adjDist === 1, `Final position is adjacent to target (dist=${adjDist})`);
  } else {
    check(dist === 1, "Already adjacent");
  }
}

// ════════════════════════════════════════════════════════════════════
// Test 15: findPathToAdjacent — already adjacent
// ════════════════════════════════════════════════════════════════════
console.log("\n[Test 15] findPathToAdjacent — already adjacent");
{
  const state = minState(10, 10, [], [
    makeEnt("pc-a", "player", 3, 3),
    makeEnt("npc-b", "npc", 3, 4),
  ]);
  const result = findPathToAdjacent(state, "pc-a", "npc-b");
  check(result !== null, "Result returned");
  check(result.cost === 0, "Cost is 0 (already adjacent)");
  check(result.path.length === 0, "Path is empty");
}

// ════════════════════════════════════════════════════════════════════
// Test 16: findPathToAdjacent — nonexistent entities
// ════════════════════════════════════════════════════════════════════
console.log("\n[Test 16] findPathToAdjacent — nonexistent entities");
{
  const state = minState(10, 10, [], [makeEnt("pc-a", "player", 0, 0)]);
  check(findPathToAdjacent(state, "pc-a", "npc-ghost") === null, "Missing target returns null");
  check(findPathToAdjacent(state, "ghost", "pc-a") === null, "Missing mover returns null");
}

// ════════════════════════════════════════════════════════════════════
// Test 17: isAdjacent
// ════════════════════════════════════════════════════════════════════
console.log("\n[Test 17] isAdjacent");
{
  check(isAdjacent({ x: 3, y: 3 }, { x: 3, y: 4 }) === true, "(3,3)↔(3,4) adjacent");
  check(isAdjacent({ x: 3, y: 3 }, { x: 4, y: 3 }) === true, "(3,3)↔(4,3) adjacent");
  check(isAdjacent({ x: 3, y: 3 }, { x: 2, y: 3 }) === true, "(3,3)↔(2,3) adjacent");
  check(isAdjacent({ x: 3, y: 3 }, { x: 3, y: 2 }) === true, "(3,3)↔(3,2) adjacent");
  check(isAdjacent({ x: 3, y: 3 }, { x: 4, y: 4 }) === false, "(3,3)↔(4,4) not adjacent (diagonal)");
  check(isAdjacent({ x: 3, y: 3 }, { x: 5, y: 3 }) === false, "(3,3)↔(5,3) not adjacent (2 apart)");
  check(isAdjacent({ x: 3, y: 3 }, { x: 3, y: 3 }) === false, "Same cell not adjacent");
}

// ════════════════════════════════════════════════════════════════════
// Test 18: getHostileEntities
// ════════════════════════════════════════════════════════════════════
console.log("\n[Test 18] getHostileEntities");
{
  const state = structuredClone(demoEncounter);
  // pc-seren is a player → hostiles are living NPCs
  const hostiles = getHostileEntities(state, "pc-seren");
  check(hostiles.length === 2, `2 hostile NPCs (got ${hostiles.length})`);
  check(hostiles.every(h => h.kind === "npc"), "All hostiles are NPCs");

  // npc-barkeep → hostiles are living players
  const npcHostiles = getHostileEntities(state, "npc-barkeep");
  check(npcHostiles.length === 2, `2 hostile players (got ${npcHostiles.length})`);
  check(npcHostiles.every(h => h.kind === "player"), "All hostiles are players");

  // Dead entities excluded
  state.entities.npcs[0].conditions.push("dead");
  const hostiles2 = getHostileEntities(state, "pc-seren");
  check(hostiles2.length === 1, `1 hostile NPC after death (got ${hostiles2.length})`);

  // Nonexistent entity
  const ghost = getHostileEntities(state, "npc-ghost");
  check(ghost.length === 0, "Nonexistent entity → empty list");
}

// ════════════════════════════════════════════════════════════════════
// Test 19: Path through narrow corridor
// ════════════════════════════════════════════════════════════════════
console.log("\n[Test 19] Path through narrow corridor");
{
  // Walls form a corridor: only y=2 row is passable from x=0 to x=6
  const walls = [];
  for (let x = 0; x <= 6; x++) {
    if (x !== 0 && x !== 6) { // leave start/end columns open
      walls.push([x, 1]);
      walls.push([x, 3]);
    }
  }
  const state = minState(10, 5, walls);
  const result = findPath(state, { x: 0, y: 2 }, { x: 6, y: 2 });
  check(result !== null, "Path found through corridor");
  check(result.cost === 6, `Cost is 6 (got ${result.cost})`);
  // All steps should be at y=2
  const allY2 = result.path.every(s => s.y === 2);
  check(allY2, "All steps are on corridor row y=2");
}

// ════════════════════════════════════════════════════════════════════
// Test 20: Path on real game state (explorationExample)
// ════════════════════════════════════════════════════════════════════
console.log("\n[Test 20] Path on explorationExample state");
{
  const state = structuredClone(explorationExample);
  // pc-seren at (2,3), move to (8,3) — should navigate around blocked terrain at (3,0..2)
  const result = findPath(state, { x: 2, y: 3 }, { x: 8, y: 3 }, { entityId: "pc-seren" });
  check(result !== null, "Path found");
  check(result.cost === 6, `Straight east 6 steps (got ${result.cost})`);
  // No step on blocked terrain
  const blockedSet = new Set(["3,0", "3,1", "3,2"]);
  const noneBlocked = result.path.every(s => !blockedSet.has(`${s.x},${s.y}`));
  check(noneBlocked, "Avoids blocked terrain");
}

// ════════════════════════════════════════════════════════════════════
// Test 21: Performance — 20x15 grid (300 cells) worst case
// ════════════════════════════════════════════════════════════════════
console.log("\n[Test 21] Performance — 20x15 grid");
{
  const state = minState(20, 15);
  const t0 = Date.now();
  const result = findPath(state, { x: 0, y: 0 }, { x: 19, y: 14 });
  const ms = Date.now() - t0;
  check(result !== null, "Path found on 20x15");
  check(result.cost === 33, `Cost is 33 (got ${result.cost})`);
  check(ms < 100, `Completed in ${ms}ms (< 100ms)`);
}

// ════════════════════════════════════════════════════════════════════
// Test 22: entityId exclusion — entity doesn't block itself
// ════════════════════════════════════════════════════════════════════
console.log("\n[Test 22] Entity doesn't block itself");
{
  const state = minState(10, 10, [], [
    makeEnt("pc-a", "player", 2, 2),
  ]);
  // Path starts from pc-a's position — pc-a should not block itself
  const result = findPath(state, { x: 2, y: 2 }, { x: 5, y: 2 }, { entityId: "pc-a" });
  check(result !== null, "Path found (self not blocking)");
  check(result.cost === 3, `Cost is 3 (got ${result.cost})`);
}

// ════════════════════════════════════════════════════════════════════
// Test 23: Maze with single solution
// ════════════════════════════════════════════════════════════════════
console.log("\n[Test 23] Maze with single solution");
{
  // Simple maze:
  // S . # . .
  // # . # . .
  // # . . . #
  // # # # . .
  // . . . . G
  const walls = [
    [2, 0], [0, 1], [2, 1], [0, 2], [4, 2],
    [0, 3], [1, 3], [2, 3],
  ];
  const state = minState(5, 5, walls);
  const result = findPath(state, { x: 0, y: 0 }, { x: 4, y: 4 });
  check(result !== null, "Maze solvable");
  check(result.path[result.path.length - 1].x === 4, "Reaches x=4");
  check(result.path[result.path.length - 1].y === 4, "Reaches y=4");
  // No step on a wall
  const wallSet = new Set(walls.map(([x, y]) => `${x},${y}`));
  const noWall = result.path.every(s => !wallSet.has(`${s.x},${s.y}`));
  check(noWall, "Path avoids all walls");
}

// ════════════════════════════════════════════════════════════════════
// Test 24: Optimal path (shortest among alternatives)
// ════════════════════════════════════════════════════════════════════
console.log("\n[Test 24] Optimal path — shortest among alternatives");
{
  // Wall blocks direct path, two routes exist: one short (around bottom), one long (around top)
  // . . . # . .
  // . . . # . .
  // S . . . . G
  const state = minState(6, 3, [[3, 0], [3, 1]]);
  const result = findPath(state, { x: 0, y: 2 }, { x: 5, y: 2 });
  check(result !== null, "Path found");
  check(result.cost === 5, `Optimal cost is 5 (straight through row 2, got ${result.cost})`);
}

// ════════════════════════════════════════════════════════════════════
// Test 25: 1x1 grid — start is goal
// ════════════════════════════════════════════════════════════════════
console.log("\n[Test 25] 1x1 grid");
{
  const state = minState(1, 1);
  const result = findPath(state, { x: 0, y: 0 }, { x: 0, y: 0 });
  check(result !== null, "Same cell");
  check(result.cost === 0, "Cost 0");
  check(result.path.length === 0, "Empty path");
}

// ════════════════════════════════════════════════════════════════════
// Test 26: Path compatibility with engine MOVE action
// ════════════════════════════════════════════════════════════════════
console.log("\n[Test 26] Path compatible with DeclaredAction MOVE");
{
  const state = minState(10, 10, [], [makeEnt("pc-a", "player", 2, 2)]);
  const result = findPath(state, { x: 2, y: 2 }, { x: 5, y: 2 }, { entityId: "pc-a", maxCost: 6 });
  check(result !== null, "Path found");
  // Path should work as DeclaredAction MOVE path
  // Each step must have x and y as numbers
  const allValid = result.path.every(s => typeof s.x === "number" && typeof s.y === "number");
  check(allValid, "All steps have numeric x and y");
  // First step is adjacent to start
  if (result.path.length > 0) {
    const d = Math.abs(result.path[0].x - 2) + Math.abs(result.path[0].y - 2);
    check(d === 1, "First step is adjacent to start position");
  }
}

// ════════════════════════════════════════════════════════════════════
// Test 27: findPathForEntity respects movement speed
// ════════════════════════════════════════════════════════════════════
console.log("\n[Test 27] findPathForEntity respects movementSpeed");
{
  const state = minState(20, 20, [], [
    makeEnt("slow-guy", "player", 0, 0, 3), // speed 3
  ]);
  // 3 steps away — reachable
  const near = findPathForEntity(state, "slow-guy", { x: 3, y: 0 });
  check(near !== null, "3 steps: reachable with speed 3");
  check(near.cost === 3, "Cost is 3");

  // 4 steps away — unreachable
  const far = findPathForEntity(state, "slow-guy", { x: 4, y: 0 });
  check(far === null, "4 steps: unreachable with speed 3");
}

// ════════════════════════════════════════════════════════════════════
// Test 28: Multiple entities — path threads through them
// ════════════════════════════════════════════════════════════════════
console.log("\n[Test 28] Path threads through multiple entities");
{
  // Row of entities at y=0, x=1..4 — mover at x=0, goal at x=5
  const state = minState(10, 5, [], [
    makeEnt("mover", "player", 0, 0),
    makeEnt("block1", "npc", 1, 0),
    makeEnt("block2", "npc", 2, 0),
    makeEnt("block3", "npc", 3, 0),
    makeEnt("block4", "npc", 4, 0),
  ]);
  const result = findPath(state, { x: 0, y: 0 }, { x: 5, y: 0 }, { entityId: "mover" });
  check(result !== null, "Path found around row of entities");
  check(result.cost > 5, `Cost > 5 due to detour (got ${result.cost})`);
}

// ════════════════════════════════════════════════════════════════════
console.log(`\n══════════════════════════════════════════════════`);
console.log(`Results: ${passed}/${passed + failed} passed, ${failed} failed`);
console.log(failed === 0 ? "PASS: all Pathfinding tests passed" : "FAIL: some Pathfinding tests failed");
if (failed) process.exit(1);
