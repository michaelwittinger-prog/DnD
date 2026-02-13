/**
 * encounterGenerator.mjs — MIR Tier 5.4 Encounter Generation.
 *
 * Auto-generates balanced combat encounters based on:
 *   - Party level and size
 *   - Difficulty preset (easy/normal/hard/deadly)
 *   - Monster manual catalogue
 *
 * Pure functions. No side effects.
 */

import { MONSTER_CATALOGUE, instantiateMonster, filterByCR } from "./monsterManual.mjs";

// ── CR Budget Tables ────────────────────────────────────────────────────

/**
 * XP values by CR tier (simplified D&D 5e-inspired).
 */
export const CR_XP = {
  minion:   25,
  standard: 100,
  elite:    450,
  boss:     1100,
};

/**
 * Per-player XP budget by difficulty.
 */
export const DIFFICULTY_XP_BUDGET = {
  easy:   50,
  normal: 100,
  hard:   200,
  deadly: 350,
};

/**
 * Group composition templates — how to spend the XP budget.
 */
export const GROUP_TEMPLATES = [
  { name: "swarm",      weights: { minion: 0.8, standard: 0.2, elite: 0, boss: 0 } },
  { name: "balanced",   weights: { minion: 0.3, standard: 0.5, elite: 0.2, boss: 0 } },
  { name: "elite_guard",weights: { minion: 0.2, standard: 0.2, elite: 0.6, boss: 0 } },
  { name: "boss_fight", weights: { minion: 0.3, standard: 0.1, elite: 0, boss: 0.6 } },
];

// ── Core Functions ──────────────────────────────────────────────────────

/**
 * Calculate the XP budget for an encounter.
 *
 * @param {number} partySize — number of players (1–6)
 * @param {string} difficulty — "easy"|"normal"|"hard"|"deadly"
 * @returns {number} total XP budget
 */
export function calculateXpBudget(partySize, difficulty) {
  const perPlayer = DIFFICULTY_XP_BUDGET[difficulty] ?? DIFFICULTY_XP_BUDGET.normal;
  const size = Math.max(1, Math.min(6, partySize));
  return perPlayer * size;
}

/**
 * Select a group template based on difficulty and rng.
 *
 * @param {string} difficulty
 * @param {function} [rng] — random 0–1
 * @returns {object} group template
 */
export function selectGroupTemplate(difficulty, rng = Math.random) {
  if (difficulty === "easy") return GROUP_TEMPLATES[0]; // swarm
  if (difficulty === "deadly") return GROUP_TEMPLATES[3]; // boss_fight

  // Normal/hard — weighted random between balanced and elite_guard
  const r = rng();
  if (difficulty === "hard" && r > 0.5) return GROUP_TEMPLATES[2]; // elite_guard
  return GROUP_TEMPLATES[1]; // balanced
}

/**
 * Fill an XP budget with monsters from the catalogue.
 *
 * @param {number} budget — XP to spend
 * @param {object} template — group template (weights per CR)
 * @param {object} [options]
 * @param {function} [options.rng] — random 0–1
 * @param {string[]} [options.tags] — filter monsters by tag
 * @param {number} [options.maxMonsters] — cap on total monsters
 * @returns {Array<{templateId: string, cr: string, xp: number}>}
 */
export function fillEncounterSlots(budget, template, options = {}) {
  const rng = options.rng ?? Math.random;
  const maxMonsters = options.maxMonsters ?? 8;
  const tags = options.tags ?? null;

  const slots = [];
  let remaining = budget;

  // Determine CR allocation order (highest weight first for better budget use)
  const crOrder = Object.entries(template.weights)
    .filter(([, w]) => w > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([cr]) => cr);

  // Pass 1: Fill by weight proportion
  for (const cr of crOrder) {
    const weight = template.weights[cr];
    const crBudget = Math.floor(budget * weight);
    const xpCost = CR_XP[cr];
    if (xpCost === 0) continue;

    const candidates = getMonstersByCr(cr, tags);
    if (candidates.length === 0) continue;

    let spent = 0;
    while (spent + xpCost <= crBudget && slots.length < maxMonsters && remaining >= xpCost) {
      const monster = candidates[Math.floor(rng() * candidates.length)];
      slots.push({ templateId: monster.templateId, cr, xp: xpCost });
      spent += xpCost;
      remaining -= xpCost;
    }
  }

  // Pass 2: Fill leftover budget with minions
  if (remaining > 0 && slots.length < maxMonsters) {
    const minions = getMonstersByCr("minion", tags);
    const minionXp = CR_XP.minion;
    while (remaining >= minionXp && slots.length < maxMonsters && minions.length > 0) {
      const m = minions[Math.floor(rng() * minions.length)];
      slots.push({ templateId: m.templateId, cr: "minion", xp: minionXp });
      remaining -= minionXp;
    }
  }

  return slots;
}

/**
 * Place entities on a grid with tactical spacing.
 *
 * @param {Array<object>} entities — instantiated monsters
 * @param {object} gridSize — { width, height }
 * @param {object} [options]
 * @param {function} [options.rng]
 * @param {{ x: number, y: number }[]} [options.occupied] — already occupied cells
 * @param {string} [options.placement] — "clustered"|"spread"|"flanking"
 * @returns {Array<object>} entities with position set
 */
export function placeEntities(entities, gridSize, options = {}) {
  const rng = options.rng ?? Math.random;
  const occupied = new Set((options.occupied ?? []).map(p => `${p.x},${p.y}`));
  const placement = options.placement ?? "spread";
  const w = gridSize.width ?? 10;
  const h = gridSize.height ?? 10;

  const placed = [];

  if (placement === "clustered") {
    // Place in a cluster on one side
    const centerX = Math.floor(w * 0.7);
    const centerY = Math.floor(h / 2);
    for (const entity of entities) {
      const pos = findNearbyFreeCell(centerX, centerY, w, h, occupied, rng, 3);
      entity.position = pos;
      occupied.add(`${pos.x},${pos.y}`);
      placed.push(entity);
    }
  } else if (placement === "flanking") {
    // Split into two groups on opposite sides
    const half = Math.ceil(entities.length / 2);
    for (let i = 0; i < entities.length; i++) {
      const isGroupB = i >= half;
      const cx = isGroupB ? Math.floor(w * 0.8) : Math.floor(w * 0.6);
      const cy = isGroupB ? Math.floor(h * 0.2) : Math.floor(h * 0.8);
      const pos = findNearbyFreeCell(cx, cy, w, h, occupied, rng, 3);
      entities[i].position = pos;
      occupied.add(`${pos.x},${pos.y}`);
      placed.push(entities[i]);
    }
  } else {
    // "spread" — distribute evenly
    for (let i = 0; i < entities.length; i++) {
      const cx = Math.floor(w * (0.5 + 0.3 * Math.cos((2 * Math.PI * i) / entities.length)));
      const cy = Math.floor(h * (0.5 + 0.3 * Math.sin((2 * Math.PI * i) / entities.length)));
      const pos = findNearbyFreeCell(cx, cy, w, h, occupied, rng, 4);
      entities[i].position = pos;
      occupied.add(`${pos.x},${pos.y}`);
      placed.push(entities[i]);
    }
  }

  return placed;
}

/**
 * Generate a full encounter: select monsters, instantiate, place on grid.
 *
 * @param {object} params
 * @param {number} params.partySize — number of players
 * @param {string} params.difficulty — "easy"|"normal"|"hard"|"deadly"
 * @param {object} [params.gridSize] — { width, height }
 * @param {function} [params.rng]
 * @param {string[]} [params.tags] — monster tag filter
 * @param {string} [params.placement] — "clustered"|"spread"|"flanking"
 * @param {{ x: number, y: number }[]} [params.playerPositions] — existing player positions
 * @returns {{ entities: Array<object>, slots: Array<object>, budget: number, template: object }}
 */
export function generateEncounter(params) {
  const {
    partySize = 4,
    difficulty = "normal",
    gridSize = { width: 10, height: 10 },
    rng = Math.random,
    tags = null,
    placement = "spread",
    playerPositions = [],
  } = params;

  const budget = calculateXpBudget(partySize, difficulty);
  const template = selectGroupTemplate(difficulty, rng);
  const slots = fillEncounterSlots(budget, template, { rng, tags });

  // Instantiate monsters from slots
  const entities = slots.map((slot, i) => {
    const entityId = `${slot.templateId}-${i + 1}`;
    const monster = instantiateMonster(slot.templateId, entityId, { x: 0, y: 0 });
    return monster;
  }).filter(Boolean);

  // Place on grid
  const occupied = playerPositions.map(p => ({ x: p.x, y: p.y }));
  const placed = placeEntities(entities, gridSize, { rng, occupied, placement });

  return { entities: placed, slots, budget, template };
}

/**
 * Estimate encounter difficulty label from XP total vs party budget.
 *
 * @param {number} totalXp — sum of monster XP
 * @param {number} partySize
 * @returns {string} — "trivial"|"easy"|"normal"|"hard"|"deadly"
 */
export function estimateDifficulty(totalXp, partySize) {
  const size = Math.max(1, partySize);
  const perPlayer = totalXp / size;

  if (perPlayer <= DIFFICULTY_XP_BUDGET.easy * 0.5) return "trivial";
  if (perPlayer <= DIFFICULTY_XP_BUDGET.easy) return "easy";
  if (perPlayer <= DIFFICULTY_XP_BUDGET.normal) return "normal";
  if (perPlayer <= DIFFICULTY_XP_BUDGET.hard) return "hard";
  return "deadly";
}

// ── Internal Helpers ────────────────────────────────────────────────────

function getMonstersByCr(cr, tags) {
  let monsters = filterByCR(cr);
  if (tags && tags.length > 0) {
    monsters = monsters.filter(m =>
      tags.some(t => m.tags?.includes(t))
    );
  }
  return monsters.length > 0 ? monsters : filterByCR(cr);
}

function findNearbyFreeCell(cx, cy, w, h, occupied, rng, radius) {
  // Try center first
  for (let r = 0; r <= radius + 5; r++) {
    for (let attempt = 0; attempt < 8 + r * 4; attempt++) {
      const dx = Math.floor(rng() * (r * 2 + 1)) - r;
      const dy = Math.floor(rng() * (r * 2 + 1)) - r;
      const x = Math.max(0, Math.min(w - 1, cx + dx));
      const y = Math.max(0, Math.min(h - 1, cy + dy));
      const key = `${x},${y}`;
      if (!occupied.has(key)) return { x, y };
    }
  }
  // Fallback: scan entire grid
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      if (!occupied.has(`${x},${y}`)) return { x, y };
    }
  }
  return { x: cx, y: cy }; // last resort
}
