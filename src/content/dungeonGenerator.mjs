/**
 * dungeonGenerator.mjs — Procedural Dungeon Generator (Tier 6 Package D)
 *
 * Deterministic dungeon generation using seeded RNG.
 * Same seed always produces identical layout.
 *
 * Features:
 * - BSP (Binary Space Partition) room placement
 * - Corridor connections between rooms
 * - Encounter placement in rooms
 * - Door/trap/treasure placement
 * - Seed-reproducible output
 */

// ── Seeded RNG ─────────────────────────────────────────────────────────

export function createRng(seed) {
  let s = seed | 0;
  return {
    seed,
    next() { s = (s * 1103515245 + 12345) & 0x7fffffff; return s; },
    nextInt(min, max) { return min + (this.next() % (max - min + 1)); },
    nextFloat() { return this.next() / 0x7fffffff; },
    pick(arr) { return arr[this.next() % arr.length]; },
    shuffle(arr) {
      const a = [...arr];
      for (let i = a.length - 1; i > 0; i--) {
        const j = this.next() % (i + 1);
        [a[i], a[j]] = [a[j], a[i]];
      }
      return a;
    },
  };
}

// ── Tile Types ─────────────────────────────────────────────────────────

export const TILE = {
  WALL: 'wall',
  FLOOR: 'floor',
  CORRIDOR: 'corridor',
  DOOR: 'door',
  STAIRS_DOWN: 'stairs_down',
  STAIRS_UP: 'stairs_up',
  TRAP: 'trap',
  TREASURE: 'treasure',
  WATER: 'water',
};

// ── Grid Helpers ───────────────────────────────────────────────────────

export function createGrid(width, height, fill = TILE.WALL) {
  return Array.from({ length: height }, () => Array(width).fill(fill));
}

function setTile(grid, x, y, tile) {
  if (y >= 0 && y < grid.length && x >= 0 && x < grid[0].length) {
    grid[y][x] = tile;
  }
}

function getTile(grid, x, y) {
  if (y >= 0 && y < grid.length && x >= 0 && x < grid[0].length) {
    return grid[y][x];
  }
  return null;
}

// ── Room Generation (BSP) ──────────────────────────────────────────────

function splitSpace(x, y, w, h, rng, minSize, depth, maxDepth) {
  if (depth >= maxDepth || w < minSize * 2 + 3 || h < minSize * 2 + 3) {
    // Leaf node — place a room
    const roomW = rng.nextInt(minSize, Math.max(minSize, w - 2));
    const roomH = rng.nextInt(minSize, Math.max(minSize, h - 2));
    const roomX = rng.nextInt(x + 1, Math.max(x + 1, x + w - roomW - 1));
    const roomY = rng.nextInt(y + 1, Math.max(y + 1, y + h - roomH - 1));
    return [{ x: roomX, y: roomY, w: roomW, h: roomH }];
  }

  const horizontal = rng.nextFloat() > 0.5;
  const rooms = [];

  if (horizontal && h >= minSize * 2 + 3) {
    const split = rng.nextInt(y + minSize + 1, y + h - minSize - 1);
    rooms.push(...splitSpace(x, y, w, split - y, rng, minSize, depth + 1, maxDepth));
    rooms.push(...splitSpace(x, split, w, y + h - split, rng, minSize, depth + 1, maxDepth));
  } else if (!horizontal && w >= minSize * 2 + 3) {
    const split = rng.nextInt(x + minSize + 1, x + w - minSize - 1);
    rooms.push(...splitSpace(x, y, split - x, h, rng, minSize, depth + 1, maxDepth));
    rooms.push(...splitSpace(split, y, x + w - split, h, rng, minSize, depth + 1, maxDepth));
  } else {
    const roomW = rng.nextInt(minSize, Math.max(minSize, w - 2));
    const roomH = rng.nextInt(minSize, Math.max(minSize, h - 2));
    const roomX = rng.nextInt(x + 1, Math.max(x + 1, x + w - roomW - 1));
    const roomY = rng.nextInt(y + 1, Math.max(y + 1, y + h - roomH - 1));
    rooms.push({ x: roomX, y: roomY, w: roomW, h: roomH });
  }

  return rooms;
}

function carveRoom(grid, room) {
  for (let dy = 0; dy < room.h; dy++) {
    for (let dx = 0; dx < room.w; dx++) {
      setTile(grid, room.x + dx, room.y + dy, TILE.FLOOR);
    }
  }
}

function roomCenter(room) {
  return { x: Math.floor(room.x + room.w / 2), y: Math.floor(room.y + room.h / 2) };
}

// ── Corridor Generation ────────────────────────────────────────────────

function carveCorridor(grid, from, to, rng) {
  let { x, y } = from;
  const tx = to.x, ty = to.y;
  const horizontalFirst = rng.nextFloat() > 0.5;

  if (horizontalFirst) {
    while (x !== tx) { setTile(grid, x, y, TILE.CORRIDOR); x += x < tx ? 1 : -1; }
    while (y !== ty) { setTile(grid, x, y, TILE.CORRIDOR); y += y < ty ? 1 : -1; }
  } else {
    while (y !== ty) { setTile(grid, x, y, TILE.CORRIDOR); y += y < ty ? 1 : -1; }
    while (x !== tx) { setTile(grid, x, y, TILE.CORRIDOR); x += x < tx ? 1 : -1; }
  }
  setTile(grid, tx, ty, TILE.CORRIDOR);
}

// ── Feature Placement ──────────────────────────────────────────────────

function placeDoors(grid, rooms, rng) {
  const doors = [];
  for (const room of rooms) {
    // Check edges for corridor adjacency → place door
    const edges = [];
    for (let dx = 0; dx < room.w; dx++) {
      if (getTile(grid, room.x + dx, room.y - 1) === TILE.CORRIDOR) edges.push({ x: room.x + dx, y: room.y });
      if (getTile(grid, room.x + dx, room.y + room.h) === TILE.CORRIDOR) edges.push({ x: room.x + dx, y: room.y + room.h - 1 });
    }
    for (let dy = 0; dy < room.h; dy++) {
      if (getTile(grid, room.x - 1, room.y + dy) === TILE.CORRIDOR) edges.push({ x: room.x, y: room.y + dy });
      if (getTile(grid, room.x + room.w, room.y + dy) === TILE.CORRIDOR) edges.push({ x: room.x + room.w - 1, y: room.y + dy });
    }
    if (edges.length > 0) {
      const doorPos = rng.pick(edges);
      setTile(grid, doorPos.x, doorPos.y, TILE.DOOR);
      doors.push(doorPos);
    }
  }
  return doors;
}

function placeTraps(grid, rooms, rng, count) {
  const traps = [];
  const candidates = rooms.filter(r => r.w * r.h >= 9);
  for (let i = 0; i < count && candidates.length > 0; i++) {
    const room = rng.pick(candidates);
    const tx = rng.nextInt(room.x + 1, room.x + room.w - 2);
    const ty = rng.nextInt(room.y + 1, room.y + room.h - 2);
    if (getTile(grid, tx, ty) === TILE.FLOOR) {
      setTile(grid, tx, ty, TILE.TRAP);
      traps.push({ x: tx, y: ty });
    }
  }
  return traps;
}

function placeTreasure(grid, rooms, rng, count) {
  const treasures = [];
  for (let i = 0; i < count && rooms.length > 0; i++) {
    const room = rng.pick(rooms);
    const tx = rng.nextInt(room.x, room.x + room.w - 1);
    const ty = rng.nextInt(room.y, room.y + room.h - 1);
    if (getTile(grid, tx, ty) === TILE.FLOOR) {
      setTile(grid, tx, ty, TILE.TREASURE);
      treasures.push({ x: tx, y: ty });
    }
  }
  return treasures;
}

function placeStairs(grid, rooms, rng) {
  if (rooms.length < 2) return { up: null, down: null };
  const shuffled = rng.shuffle(rooms);
  const upRoom = shuffled[0];
  const downRoom = shuffled[shuffled.length - 1];
  const up = { x: Math.floor(upRoom.x + upRoom.w / 2), y: Math.floor(upRoom.y + upRoom.h / 2) };
  const down = { x: Math.floor(downRoom.x + downRoom.w / 2), y: Math.floor(downRoom.y + downRoom.h / 2) };
  setTile(grid, up.x, up.y, TILE.STAIRS_UP);
  setTile(grid, down.x, down.y, TILE.STAIRS_DOWN);
  return { up, down };
}

function generateEncounters(rooms, rng, difficulty = 'medium') {
  const diffMultiplier = { easy: 0.3, medium: 0.5, hard: 0.7 };
  const ratio = diffMultiplier[difficulty] ?? 0.5;
  const encounters = [];
  for (const room of rooms) {
    if (rng.nextFloat() < ratio) {
      const center = roomCenter(room);
      const monsterCount = rng.nextInt(1, Math.max(1, Math.floor(room.w * room.h / 12)));
      encounters.push({
        roomCenter: center,
        monsterCount,
        difficulty,
        roomSize: room.w * room.h,
      });
    }
  }
  return encounters;
}

// ── Main Generator ─────────────────────────────────────────────────────

/**
 * Generate a procedural dungeon
 * @param {Object} opts
 * @param {number} opts.seed - RNG seed (deterministic)
 * @param {number} [opts.width=40] - Grid width
 * @param {number} [opts.height=30] - Grid height
 * @param {number} [opts.minRoomSize=4] - Minimum room dimension
 * @param {number} [opts.maxDepth=4] - BSP recursion depth
 * @param {number} [opts.trapCount=3] - Number of traps
 * @param {number} [opts.treasureCount=3] - Number of treasures
 * @param {string} [opts.difficulty='medium'] - Encounter difficulty
 * @returns {DungeonResult}
 */
export function generateDungeon({
  seed,
  width = 40,
  height = 30,
  minRoomSize = 4,
  maxDepth = 4,
  trapCount = 3,
  treasureCount = 3,
  difficulty = 'medium',
} = {}) {
  if (seed === undefined) throw new Error('Seed is required for deterministic generation');

  const rng = createRng(seed);
  const grid = createGrid(width, height);

  // Generate rooms via BSP
  const rooms = splitSpace(0, 0, width, height, rng, minRoomSize, 0, maxDepth);

  // Carve rooms
  for (const room of rooms) carveRoom(grid, room);

  // Connect rooms with corridors
  for (let i = 1; i < rooms.length; i++) {
    carveCorridor(grid, roomCenter(rooms[i - 1]), roomCenter(rooms[i]), rng);
  }

  // Place features
  const doors = placeDoors(grid, rooms, rng);
  const traps = placeTraps(grid, rooms, rng, trapCount);
  const treasures = placeTreasure(grid, rooms, rng, treasureCount);
  const stairs = placeStairs(grid, rooms, rng);
  const encounters = generateEncounters(rooms, rng, difficulty);

  return {
    seed,
    width,
    height,
    grid,
    rooms,
    doors,
    traps,
    treasures,
    stairs,
    encounters,
    stats: {
      roomCount: rooms.length,
      doorCount: doors.length,
      trapCount: traps.length,
      treasureCount: treasures.length,
      encounterCount: encounters.length,
      floorTiles: grid.flat().filter(t => t !== TILE.WALL).length,
    },
  };
}

/**
 * Convert dungeon grid to game state map format
 * @param {DungeonResult} dungeon
 * @returns {Object} Game state compatible map
 */
export function dungeonToStateMap(dungeon) {
  const cells = [];
  for (let y = 0; y < dungeon.height; y++) {
    for (let x = 0; x < dungeon.width; x++) {
      const tile = dungeon.grid[y][x];
      cells.push({
        x, y,
        terrain: tile,
        passable: tile !== TILE.WALL,
        opaque: tile === TILE.WALL || tile === TILE.DOOR,
      });
    }
  }
  return {
    dimensions: { width: dungeon.width, height: dungeon.height },
    cells,
    rooms: dungeon.rooms,
    encounters: dungeon.encounters,
    stairs: dungeon.stairs,
  };
}