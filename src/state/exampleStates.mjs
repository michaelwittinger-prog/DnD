/**
 * exampleStates.mjs — MIR 1.2 Example GameState instances.
 *
 * Exports:
 * - explorationExample: 2 players, 1 NPC, 1 object in exploration mode
 * - combatExample: 2 players, 2 NPCs in combat with initiative
 * - invalidExample: Intentionally broken state (duplicate id, out-of-bounds, broken combat)
 */

function makeEntity(id, kind, name, x, y, overrides = {}) {
  return {
    id, kind, name,
    position: { x, y },
    size: "M",
    stats: { hpCurrent: 20, hpMax: 20, ac: 14, movementSpeed: 6 },
    conditions: [],
    inventory: [],
    token: { style: "mini", spriteKey: null },
    controller: { type: kind === "player" ? "human" : "ai", playerId: kind === "player" ? id : null },
    ...overrides,
  };
}

// ── Exploration example ────────────────────────────────────────────────

export const explorationExample = {
  schemaVersion: "0.1.0",
  campaignId: "campaign-alpha",
  sessionId: "session-001",
  timestamp: "2026-02-11T12:00:00Z",
  rng: {
    mode: "manual",
    seed: null,
    lastRolls: [],
  },
  map: {
    id: "map-tavern",
    name: "The Rusty Tankard",
    grid: { type: "square", size: { width: 15, height: 10 }, cellSize: 5 },
    terrain: [
      { x: 3, y: 0, type: "blocked", blocksMovement: true, blocksVision: true },
      { x: 3, y: 1, type: "blocked", blocksMovement: true, blocksVision: true },
      { x: 3, y: 2, type: "blocked", blocksMovement: true, blocksVision: true },
      { x: 7, y: 4, type: "difficult", blocksMovement: false },
      { x: 7, y: 5, type: "difficult", blocksMovement: false },
      { x: 8, y: 4, type: "difficult", blocksMovement: false },
    ],
    fogOfWarEnabled: false,
  },
  entities: {
    players: [
      makeEntity("pc-seren", "player", "Seren Ashford", 2, 3, {
        stats: { hpCurrent: 22, hpMax: 28, ac: 16, movementSpeed: 6 },
        inventory: [
          { id: "item-longsword", name: "Longsword", qty: 1, tags: ["weapon", "melee"] },
          { id: "item-shield", name: "Shield", qty: 1, tags: ["armor"] },
        ],
        token: { style: "mini", spriteKey: "seren-paladin" },
      }),
      makeEntity("pc-miri", "player", "Miri Thistledown", 4, 6, {
        stats: { hpCurrent: 18, hpMax: 22, ac: 13, movementSpeed: 6 },
        inventory: [
          { id: "item-shortbow", name: "Shortbow", qty: 1, tags: ["weapon", "ranged"] },
          { id: "item-arrows", name: "Arrows", qty: 20, tags: ["ammo"] },
        ],
        token: { style: "standee", spriteKey: "miri-ranger" },
      }),
    ],
    npcs: [
      makeEntity("npc-barkeep", "npc", "Old Haggard", 6, 2, {
        stats: { hpCurrent: 8, hpMax: 8, ac: 10, movementSpeed: 6 },
      }),
    ],
    objects: [
      makeEntity("obj-table1", "object", "Wooden Table", 5, 4, {
        stats: { hpCurrent: 15, hpMax: 15, ac: 5, movementSpeed: 0 },
        token: { style: "pawn", spriteKey: null },
        controller: { type: "ai", playerId: null },
      }),
    ],
  },
  combat: {
    mode: "exploration",
    round: 0,
    activeEntityId: null,
    initiativeOrder: [],
  },
  log: {
    events: [
      {
        id: "evt-001",
        timestamp: "2026-02-11T11:55:00Z",
        type: "session_start",
        payload: { message: "Session began in The Rusty Tankard." },
      },
    ],
  },
  ui: { selectedEntityId: null, hoveredCell: null },
};

// ── Combat example ─────────────────────────────────────────────────────

export const combatExample = {
  schemaVersion: "0.1.0",
  campaignId: "campaign-alpha",
  sessionId: "session-002",
  timestamp: "2026-02-11T14:30:00Z",
  rng: {
    mode: "seeded",
    seed: "combat-seed-42",
    lastRolls: [
      { id: "roll-1", timestamp: "2026-02-11T14:25:01Z", formula: "1d20+3", resultTotal: 18, source: "Seren initiative" },
      { id: "roll-2", timestamp: "2026-02-11T14:25:02Z", formula: "1d20+1", resultTotal: 12, source: "Miri initiative" },
      { id: "roll-3", timestamp: "2026-02-11T14:25:03Z", formula: "1d20+2", resultTotal: 15, source: "Goblin A initiative" },
      { id: "roll-4", timestamp: "2026-02-11T14:25:04Z", formula: "1d20+2", resultTotal: 7, source: "Goblin B initiative" },
    ],
  },
  map: {
    id: "map-forest-clearing",
    name: "Forest Clearing",
    grid: { type: "square", size: { width: 20, height: 15 }, cellSize: 5 },
    terrain: [
      { x: 5, y: 3, type: "difficult", blocksMovement: false },
      { x: 5, y: 4, type: "difficult", blocksMovement: false },
      { x: 10, y: 0, type: "blocked", blocksMovement: true, blocksVision: true },
      { x: 10, y: 1, type: "blocked", blocksMovement: true, blocksVision: true },
      { x: 12, y: 8, type: "water", blocksMovement: false },
      { x: 12, y: 9, type: "water", blocksMovement: false },
    ],
    fogOfWarEnabled: false,
  },
  entities: {
    players: [
      makeEntity("pc-seren", "player", "Seren Ashford", 3, 5, {
        stats: { hpCurrent: 20, hpMax: 28, ac: 16, movementSpeed: 6 },
        inventory: [
          { id: "item-longsword", name: "Longsword", qty: 1, tags: ["weapon", "melee"] },
        ],
        token: { style: "mini", spriteKey: "seren-paladin" },
      }),
      makeEntity("pc-miri", "player", "Miri Thistledown", 4, 7, {
        stats: { hpCurrent: 15, hpMax: 22, ac: 13, movementSpeed: 6 },
        conditions: ["prone"],
        inventory: [
          { id: "item-shortbow", name: "Shortbow", qty: 1, tags: ["weapon", "ranged"] },
          { id: "item-arrows", name: "Arrows", qty: 17, tags: ["ammo"] },
        ],
        token: { style: "standee", spriteKey: "miri-ranger" },
      }),
    ],
    npcs: [
      makeEntity("npc-goblin-a", "npc", "Goblin Scrapper", 7, 5, {
        stats: { hpCurrent: 5, hpMax: 12, ac: 13, movementSpeed: 6 },
      }),
      makeEntity("npc-goblin-b", "npc", "Goblin Archer", 9, 8, {
        stats: { hpCurrent: 10, hpMax: 10, ac: 12, movementSpeed: 6 },
      }),
    ],
    objects: [],
  },
  combat: {
    mode: "combat",
    round: 2,
    activeEntityId: "pc-seren",
    initiativeOrder: ["pc-seren", "npc-goblin-a", "pc-miri", "npc-goblin-b"],
  },
  log: {
    events: [
      { id: "evt-c01", timestamp: "2026-02-11T14:25:00Z", type: "combat_start", payload: { participants: ["pc-seren", "pc-miri", "npc-goblin-a", "npc-goblin-b"] } },
      { id: "evt-c02", timestamp: "2026-02-11T14:26:00Z", type: "attack", payload: { attacker: "pc-seren", target: "npc-goblin-a", damage: 7, hit: true } },
      { id: "evt-c03", timestamp: "2026-02-11T14:27:00Z", type: "move", payload: { entityId: "npc-goblin-b", from: { x: 8, y: 7 }, to: { x: 9, y: 8 } } },
    ],
  },
  ui: { selectedEntityId: "pc-seren", hoveredCell: { x: 7, y: 5 } },
};

// ── Invalid example (intentionally broken) ─────────────────────────────

export const invalidExample = {
  schemaVersion: "0.1.0",
  campaignId: "campaign-broken",
  sessionId: "session-bad",
  timestamp: "2026-02-11T00:00:00Z",
  rng: { mode: "manual", seed: null, lastRolls: [] },
  map: {
    id: "map-tiny",
    name: "Tiny Room",
    grid: { type: "square", size: { width: 5, height: 5 }, cellSize: 5 },
    terrain: [
      { x: 2, y: 2, type: "blocked", blocksMovement: true },
    ],
    fogOfWarEnabled: false,
  },
  entities: {
    players: [
      makeEntity("dup-01", "player", "Alice", 1, 1),
      makeEntity("dup-01", "player", "Bob", 3, 3),
    ],
    npcs: [
      makeEntity("npc-oob", "npc", "Ghost", 10, 10),
      makeEntity("npc-blocked", "npc", "Stuck", 2, 2),
    ],
    objects: [],
  },
  combat: {
    mode: "combat",
    round: 0,
    activeEntityId: null,
    initiativeOrder: [],
  },
  log: { events: [] },
  ui: { selectedEntityId: "nonexistent-entity", hoveredCell: { x: 99, y: 99 } },
};
