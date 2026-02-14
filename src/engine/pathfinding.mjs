/**
 * pathfinding.mjs — MIR A* Grid Pathfinding.
 *
 * Pure function: takes game state + start + goal → returns shortest legal path.
 *
 * Constraints respected:
 *   - Cardinal movement only (no diagonal)
 *   - Blocked terrain (blocksMovement === true)
 *   - Occupied cells (other entities, excluding the moving entity)
 *   - Map bounds (0..width-1, 0..height-1)
 *   - Movement speed limit (optional cap on path length)
 *
 * Returns:
 *   - { path: [{x,y}...], cost: number } — shortest path (excluding start)
 *   - null — if unreachable
 *
 * The path is compatible with DeclaredAction MOVE: it contains each step
 * from start (exclusive) to goal (inclusive), cardinal-only.
 */

// ── A* Implementation ───────────────────────────────────────────────────

/**
 * Cardinal directions: up, down, left, right.
 */
const DIRECTIONS = [
  { dx: 0, dy: -1 }, // up
  { dx: 0, dy: 1 },  // down
  { dx: -1, dy: 0 }, // left
  { dx: 1, dy: 0 },  // right
];

/**
 * Manhattan distance heuristic (admissible for cardinal-only movement).
 * @param {number} x1
 * @param {number} y1
 * @param {number} x2
 * @param {number} y2
 * @returns {number}
 */
function manhattan(x1, y1, x2, y2) {
  return Math.abs(x1 - x2) + Math.abs(y1 - y2);
}

/**
 * Cell key for set/map lookups.
 * @param {number} x
 * @param {number} y
 * @returns {string}
 */
function key(x, y) {
  return `${x},${y}`;
}

/**
 * Simple priority queue using sorted insertion.
 * Good enough for grid sizes up to ~50x50 (2500 cells).
 * For larger grids, swap to a binary heap.
 */
class PriorityQueue {
  constructor() {
    /** @type {Array<{key:string, x:number, y:number, f:number}>} */
    this._items = [];
  }

  push(item) {
    // Binary search for insertion point
    let lo = 0, hi = this._items.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (this._items[mid].f < item.f) lo = mid + 1;
      else hi = mid;
    }
    this._items.splice(lo, 0, item);
  }

  pop() {
    return this._items.shift();
  }

  get size() {
    return this._items.length;
  }
}

/**
 * Build the set of blocked cells from terrain.
 * @param {object} state
 * @returns {Set<string>}
 */
function buildBlockedSet(state) {
  const set = new Set();
  for (const t of state.map?.terrain ?? []) {
    if (t.blocksMovement) set.add(key(t.x, t.y));
  }
  return set;
}

/**
 * Build a map of terrain movement costs.
 * Normal cells cost 1. Difficult terrain costs 2.
 * @param {object} state
 * @returns {Map<string, number>}
 */
function buildTerrainCostMap(state) {
  const costs = new Map();
  for (const t of state.map?.terrain ?? []) {
    if (!t.blocksMovement && t.type === "difficult") {
      costs.set(key(t.x, t.y), 2);
    }
  }
  return costs;
}

/**
 * Build the set of occupied cells (players + NPCs, excluding the moving entity).
 * Objects (furniture, tables, etc.) do NOT block movement — only living entities do.
 * @param {object} state
 * @param {string} [excludeId] — entity to exclude (the one moving)
 * @returns {Set<string>}
 */
function buildOccupiedSet(state, excludeId) {
  const set = new Set();
  // Only players and NPCs block movement, NOT objects (furniture, terrain features)
  const all = [
    ...(state.entities?.players ?? []),
    ...(state.entities?.npcs ?? []),
  ];
  for (const e of all) {
    if (e.id !== excludeId && !e.conditions?.includes("dead")) {
      set.add(key(e.position.x, e.position.y));
    }
  }
  return set;
}

/**
 * Find the shortest path from start to goal on the game map.
 *
 * @param {object} state — current GameState (read-only)
 * @param {{x:number, y:number}} start — starting position
 * @param {{x:number, y:number}} goal — target position
 * @param {object} [opts] — options
 * @param {string} [opts.entityId] — entity ID (excluded from collision)
 * @param {number} [opts.maxCost] — maximum path length (movementSpeed cap)
 * @param {boolean} [opts.allowOccupiedGoal] — if true, goal cell can be occupied (for "move adjacent" logic)
 * @returns {{ path: Array<{x:number, y:number}>, cost: number } | null}
 */
export function findPath(state, start, goal, opts = {}) {
  const { entityId, maxCost, allowOccupiedGoal = false } = opts;
  const { width, height } = state.map.grid.size;

  // Quick validation
  if (start.x < 0 || start.x >= width || start.y < 0 || start.y >= height) return null;
  if (goal.x < 0 || goal.x >= width || goal.y < 0 || goal.y >= height) return null;

  // Already there
  if (start.x === goal.x && start.y === goal.y) {
    return { path: [], cost: 0 };
  }

  const blocked = buildBlockedSet(state);
  const occupied = buildOccupiedSet(state, entityId);
  const terrainCosts = buildTerrainCostMap(state);

  // Goal itself blocked by terrain → unreachable
  if (blocked.has(key(goal.x, goal.y))) return null;

  // Goal occupied by another entity (unless explicitly allowed)
  if (!allowOccupiedGoal && occupied.has(key(goal.x, goal.y))) return null;

  // A* search
  const startKey = key(start.x, start.y);
  const goalKey = key(goal.x, goal.y);

  const gScore = new Map(); // key → best cost from start
  const cameFrom = new Map(); // key → parent key
  const closed = new Set();

  gScore.set(startKey, 0);

  const pq = new PriorityQueue();
  pq.push({ key: startKey, x: start.x, y: start.y, f: manhattan(start.x, start.y, goal.x, goal.y) });

  while (pq.size > 0) {
    const current = pq.pop();

    if (current.key === goalKey) {
      // Reconstruct path
      return reconstructPath(cameFrom, current.key, start, gScore.get(goalKey));
    }

    if (closed.has(current.key)) continue;
    closed.add(current.key);

    const currentG = gScore.get(current.key);

    // If we've exceeded maxCost, don't explore further from this node
    if (maxCost != null && currentG >= maxCost) continue;

    for (const { dx, dy } of DIRECTIONS) {
      const nx = current.x + dx;
      const ny = current.y + dy;
      const nk = key(nx, ny);

      // Bounds check
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;

      // Already processed
      if (closed.has(nk)) continue;

      // Blocked terrain
      if (blocked.has(nk)) continue;

      // Occupied cell (except goal if allowOccupiedGoal)
      if (occupied.has(nk)) {
        if (!(allowOccupiedGoal && nk === goalKey)) continue;
      }

      const stepCost = terrainCosts.get(nk) ?? 1;
      const tentativeG = currentG + stepCost;

      // maxCost check: path to neighbor exceeds budget
      if (maxCost != null && tentativeG > maxCost) continue;

      if (tentativeG < (gScore.get(nk) ?? Infinity)) {
        gScore.set(nk, tentativeG);
        cameFrom.set(nk, current.key);
        const f = tentativeG + manhattan(nx, ny, goal.x, goal.y);
        pq.push({ key: nk, x: nx, y: ny, f });
      }
    }
  }

  // No path found
  return null;
}

/**
 * Reconstruct the path from A* cameFrom map.
 * Returns path as array of {x,y} steps (excluding start, including goal).
 *
 * @param {Map<string,string>} cameFrom
 * @param {string} goalKey
 * @param {{x:number,y:number}} start
 * @param {number} cost
 * @returns {{ path: Array<{x:number,y:number}>, cost: number }}
 */
function reconstructPath(cameFrom, goalKey, start, cost) {
  const keys = [];
  let current = goalKey;
  const startKey = key(start.x, start.y);

  while (current !== startKey) {
    keys.push(current);
    current = cameFrom.get(current);
    if (current === undefined) break; // safety
  }

  keys.reverse();

  const path = keys.map((k) => {
    const [x, y] = k.split(",").map(Number);
    return { x, y };
  });

  return { path, cost };
}

// ── Convenience Functions ───────────────────────────────────────────────

/**
 * Find path for a specific entity (auto-fills start position and speed cap).
 *
 * @param {object} state — current GameState
 * @param {string} entityId — entity to path for
 * @param {{x:number, y:number}} goal — target position
 * @param {object} [opts] — additional options
 * @param {boolean} [opts.allowOccupiedGoal]
 * @returns {{ path: Array<{x:number, y:number}>, cost: number } | null}
 */
export function findPathForEntity(state, entityId, goal, opts = {}) {
  const all = [
    ...(state.entities?.players ?? []),
    ...(state.entities?.npcs ?? []),
    ...(state.entities?.objects ?? []),
  ];
  const entity = all.find((e) => e.id === entityId);
  if (!entity) return null;

  return findPath(state, entity.position, goal, {
    entityId,
    maxCost: entity.stats.movementSpeed,
    ...opts,
  });
}

/**
 * Find the cells adjacent to a target entity that the mover can reach.
 * Useful for "move next to enemy then attack" logic.
 *
 * @param {object} state
 * @param {string} moverId — entity that wants to move
 * @param {string} targetId — entity to get adjacent to
 * @returns {{ cell: {x:number,y:number}, path: Array<{x:number,y:number}>, cost: number } | null}
 *   Returns the best (shortest) reachable adjacent cell, or null if none reachable.
 */
export function findPathToAdjacent(state, moverId, targetId) {
  const all = [
    ...(state.entities?.players ?? []),
    ...(state.entities?.npcs ?? []),
    ...(state.entities?.objects ?? []),
  ];
  const mover = all.find((e) => e.id === moverId);
  const target = all.find((e) => e.id === targetId);
  if (!mover || !target) return null;

  const { width, height } = state.map.grid.size;
  const tx = target.position.x;
  const ty = target.position.y;

  // Check if already adjacent
  const dist = manhattan(mover.position.x, mover.position.y, tx, ty);
  if (dist === 1) {
    return { cell: { x: mover.position.x, y: mover.position.y }, path: [], cost: 0 };
  }

  // Find all 4 adjacent cells to target
  const adjacentCells = DIRECTIONS
    .map(({ dx, dy }) => ({ x: tx + dx, y: ty + dy }))
    .filter((c) => c.x >= 0 && c.x < width && c.y >= 0 && c.y < height);

  // Find shortest path to any adjacent cell (NO speed cap — planner truncates)
  let best = null;
  for (const cell of adjacentCells) {
    const result = findPath(state, mover.position, cell, {
      entityId: moverId,
      // No maxCost — find the actual shortest path, planner will trim to speed
    });
    if (result && (best === null || result.cost < best.cost)) {
      best = { cell, path: result.path, cost: result.cost };
    }
  }

  return best;
}

/**
 * Check if two positions are adjacent (Manhattan distance === 1).
 *
 * @param {{x:number, y:number}} a
 * @param {{x:number, y:number}} b
 * @returns {boolean}
 */
export function isAdjacent(a, b) {
  return manhattan(a.x, a.y, b.x, b.y) === 1;
}

/**
 * Get all entities hostile to a given entity.
 * Players are hostile to NPCs and vice versa.
 * Dead entities are excluded.
 *
 * @param {object} state
 * @param {string} entityId
 * @returns {Array<object>}
 */
export function getHostileEntities(state, entityId) {
  const all = [
    ...(state.entities?.players ?? []),
    ...(state.entities?.npcs ?? []),
  ];
  const entity = all.find((e) => e.id === entityId);
  if (!entity) return [];

  const isPlayer = state.entities.players.some((e) => e.id === entityId);
  const hostileList = isPlayer ? state.entities.npcs : state.entities.players;

  return hostileList.filter((e) => !e.conditions.includes("dead"));
}
