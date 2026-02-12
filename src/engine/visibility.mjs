/**
 * visibility.mjs — MIR S1.5 Fog of War / Visibility System.
 *
 * Pure functions for computing visible cells from entity positions.
 * Uses simple radius-based visibility with Bresenham line-of-sight
 * checks against vision-blocking terrain.
 *
 * No state mutation. No side effects.
 */

/**
 * Default visibility radius (in cells) for entities.
 * Can be overridden per-entity via entity.stats.visionRange.
 */
const DEFAULT_VISION_RANGE = 8;

/**
 * Compute the set of visible cells for a given faction.
 *
 * @param {object} state — GameState
 * @param {"players"|"npcs"|"all"} faction — whose vision to compute
 * @returns {Set<string>} — set of "x,y" keys for visible cells
 */
export function computeVisibleCells(state, faction = "players") {
  const visible = new Set();
  const { width, height } = state.map.grid.size;

  // If fog of war is disabled, everything is visible
  if (!state.map.fogOfWarEnabled) {
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        visible.add(`${x},${y}`);
      }
    }
    return visible;
  }

  // Gather entities whose vision we care about
  let entities = [];
  if (faction === "players" || faction === "all") {
    entities.push(...(state.entities?.players ?? []));
  }
  if (faction === "npcs" || faction === "all") {
    entities.push(...(state.entities?.npcs ?? []));
  }

  // Build vision-blocking terrain lookup
  const blocksVision = buildVisionBlockMap(state);

  // For each entity, compute visible cells via raycasting
  for (const ent of entities) {
    if (ent.conditions?.includes("dead")) continue;
    const range = ent.stats?.visionRange ?? DEFAULT_VISION_RANGE;
    const origin = ent.position;

    // Always see your own cell
    visible.add(`${origin.x},${origin.y}`);

    // Cast rays to perimeter of vision circle
    computeEntityVision(origin, range, width, height, blocksVision, visible);
  }

  return visible;
}

/**
 * Check if a specific cell is visible to the given faction.
 *
 * @param {object} state
 * @param {number} x
 * @param {number} y
 * @param {"players"|"npcs"|"all"} faction
 * @returns {boolean}
 */
export function isCellVisible(state, x, y, faction = "players") {
  if (!state.map.fogOfWarEnabled) return true;
  const visible = computeVisibleCells(state, faction);
  return visible.has(`${x},${y}`);
}

/**
 * Get visibility radius for an entity.
 * @param {object} entity
 * @returns {number}
 */
export function getVisionRange(entity) {
  return entity?.stats?.visionRange ?? DEFAULT_VISION_RANGE;
}

// ── Internal ────────────────────────────────────────────────────────────

/**
 * Build a Set of "x,y" keys for cells that block vision.
 */
function buildVisionBlockMap(state) {
  const blocks = new Set();
  for (const t of state.map.terrain ?? []) {
    if (t.blocksVision) {
      blocks.add(`${t.x},${t.y}`);
    }
  }
  return blocks;
}

/**
 * Compute visible cells from an origin point using raycasting.
 * Casts rays to each cell on the perimeter of the vision square,
 * using Bresenham's line algorithm to check for blockers.
 */
function computeEntityVision(origin, range, mapW, mapH, blocksVision, visible) {
  const ox = origin.x;
  const oy = origin.y;

  // Scan every cell in the vision bounding box
  const minX = Math.max(0, ox - range);
  const maxX = Math.min(mapW - 1, ox + range);
  const minY = Math.max(0, oy - range);
  const maxY = Math.min(mapH - 1, oy + range);

  for (let tx = minX; tx <= maxX; tx++) {
    for (let ty = minY; ty <= maxY; ty++) {
      // Check distance (Chebyshev for grid)
      const dx = Math.abs(tx - ox);
      const dy = Math.abs(ty - oy);
      if (Math.max(dx, dy) > range) continue;

      // Check line of sight
      if (hasLineOfSight(ox, oy, tx, ty, blocksVision)) {
        visible.add(`${tx},${ty}`);
      }
    }
  }
}

/**
 * Bresenham line-of-sight check.
 * Returns true if no vision-blocking cell lies on the line
 * from (x0,y0) to (x1,y1), excluding the start and end points.
 */
function hasLineOfSight(x0, y0, x1, y1, blocksVision) {
  // Same cell
  if (x0 === x1 && y0 === y1) return true;

  let dx = Math.abs(x1 - x0);
  let dy = Math.abs(y1 - y0);
  let sx = x0 < x1 ? 1 : -1;
  let sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  let cx = x0;
  let cy = y0;

  while (true) {
    // Move to next cell
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; cx += sx; }
    if (e2 < dx) { err += dx; cy += sy; }

    // Reached destination
    if (cx === x1 && cy === y1) return true;

    // Check if this intermediate cell blocks vision
    if (blocksVision.has(`${cx},${cy}`)) return false;
  }
}
