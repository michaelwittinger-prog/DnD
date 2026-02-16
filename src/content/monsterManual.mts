/**
 * monsterManual.mjs — MIR Tier 6.3 Monster Manual.
 *
 * Pre-built NPC stat blocks for encounter building.
 * Each entry defines a complete entity template that can be
 * instantiated into a GameState.
 *
 * Pure data + factory functions. No side effects.
 */

/**
 * Challenge Rating (CR) categories.
 */
export const CR = {
  MINION: "minion",       // CR 0–0.25 — cannon fodder
  STANDARD: "standard",   // CR 0.5–1  — regular threat
  ELITE: "elite",         // CR 2–4    — tough fight
  BOSS: "boss",           // CR 5+     — encounter ender
};

/**
 * Monster catalogue.
 * Each entry is a template — use `instantiateMonster()` to create entity instances.
 */
export const MONSTER_CATALOGUE = {
  // ── Minions (CR 0–0.25) ──────────────────────────────────────────────
  goblin: {
    templateId: "goblin",
    name: "Goblin",
    cr: CR.MINION,
    stats: { hpMax: 7, ac: 13, movementSpeed: 6, attackBonus: 0, damageDice: [1, 4], attackRange: 1 },
    size: "S",
    abilities: ["sneak_attack"],
    conditions: [],
    tags: ["humanoid", "goblinoid"],
    description: "A small, vicious humanoid that lurks in shadows.",
  },
  rat: {
    templateId: "rat",
    name: "Giant Rat",
    cr: CR.MINION,
    stats: { hpMax: 4, ac: 10, movementSpeed: 6, attackBonus: -1, damageDice: [1, 2], attackRange: 1 },
    size: "S",
    abilities: [],
    conditions: [],
    tags: ["beast"],
    description: "An oversized rat with yellowed teeth.",
  },
  skeleton: {
    templateId: "skeleton",
    name: "Skeleton",
    cr: CR.MINION,
    stats: { hpMax: 8, ac: 11, movementSpeed: 6, attackBonus: 0, damageDice: [1, 6], attackRange: 1 },
    size: "M",
    abilities: [],
    conditions: [],
    tags: ["undead"],
    description: "Animated bones held together by dark magic.",
  },
  zombie: {
    templateId: "zombie",
    name: "Zombie",
    cr: CR.MINION,
    stats: { hpMax: 12, ac: 8, movementSpeed: 4, attackBonus: 0, damageDice: [1, 6], attackRange: 1 },
    size: "M",
    abilities: [],
    conditions: [],
    tags: ["undead"],
    description: "A shambling corpse with unnatural resilience.",
  },

  // ── Standard (CR 0.5–1) ──────────────────────────────────────────────
  bandit: {
    templateId: "bandit",
    name: "Bandit",
    cr: CR.STANDARD,
    stats: { hpMax: 11, ac: 12, movementSpeed: 6, attackBonus: 1, damageDice: [1, 6], attackRange: 1 },
    size: "M",
    abilities: [],
    conditions: [],
    tags: ["humanoid"],
    description: "A rough-looking outlaw wielding a scimitar.",
  },
  wolf: {
    templateId: "wolf",
    name: "Wolf",
    cr: CR.STANDARD,
    stats: { hpMax: 11, ac: 13, movementSpeed: 8, attackBonus: 1, damageDice: [1, 6], attackRange: 1 },
    size: "M",
    abilities: [],
    conditions: [],
    tags: ["beast", "pack"],
    description: "A grey wolf with keen senses and pack instincts.",
  },
  cultist: {
    templateId: "cultist",
    name: "Cultist",
    cr: CR.STANDARD,
    stats: { hpMax: 9, ac: 12, movementSpeed: 6, attackBonus: 0, damageDice: [1, 4], attackRange: 1 },
    size: "M",
    abilities: ["poison_strike"],
    conditions: [],
    tags: ["humanoid", "cult"],
    description: "A hooded figure murmuring dark prayers.",
  },
  guard: {
    templateId: "guard",
    name: "Town Guard",
    cr: CR.STANDARD,
    stats: { hpMax: 14, ac: 14, movementSpeed: 6, attackBonus: 1, damageDice: [1, 6], attackRange: 1 },
    size: "M",
    abilities: ["shield_bash"],
    conditions: [],
    tags: ["humanoid", "guard"],
    description: "A trained soldier in chainmail with a spear and shield.",
  },

  // ── Elite (CR 2–4) ───────────────────────────────────────────────────
  ogre: {
    templateId: "ogre",
    name: "Ogre",
    cr: CR.ELITE,
    stats: { hpMax: 30, ac: 11, movementSpeed: 6, attackBonus: 3, damageDice: [2, 6], attackRange: 1 },
    size: "L",
    abilities: ["shield_bash"],
    conditions: [],
    tags: ["giant"],
    description: "A hulking brute with a massive club.",
  },
  dark_knight: {
    templateId: "dark_knight",
    name: "Dark Knight",
    cr: CR.ELITE,
    stats: { hpMax: 25, ac: 16, movementSpeed: 6, attackBonus: 2, damageDice: [1, 8], attackRange: 1 },
    size: "M",
    abilities: ["shield_bash"],
    conditions: [],
    tags: ["humanoid", "knight"],
    description: "A heavily armored warrior radiating menace.",
  },
  mage: {
    templateId: "mage",
    name: "Dark Mage",
    cr: CR.ELITE,
    stats: { hpMax: 18, ac: 12, movementSpeed: 6, attackBonus: 2, damageDice: [1, 6], attackRange: 1 },
    size: "M",
    abilities: ["firebolt", "poison_strike"],
    conditions: [],
    tags: ["humanoid", "spellcaster"],
    description: "A robed figure crackling with arcane energy.",
  },

  // ── Boss (CR 5+) ─────────────────────────────────────────────────────
  troll: {
    templateId: "troll",
    name: "Troll",
    cr: CR.BOSS,
    stats: { hpMax: 45, ac: 12, movementSpeed: 6, attackBonus: 3, damageDice: [2, 6], attackRange: 1 },
    size: "L",
    abilities: [],
    conditions: [],
    tags: ["giant", "regenerating"],
    description: "A towering creature with rubbery green skin and terrifying claws.",
  },
  dragon_wyrmling: {
    templateId: "dragon_wyrmling",
    name: "Red Dragon Wyrmling",
    cr: CR.BOSS,
    stats: { hpMax: 52, ac: 17, movementSpeed: 6, attackBonus: 4, damageDice: [2, 8], attackRange: 1 },
    size: "M",
    abilities: ["firebolt"],
    conditions: [],
    tags: ["dragon", "fire"],
    description: "A young dragon barely larger than a horse, but already deadly.",
  },
  lich: {
    templateId: "lich",
    name: "Lich",
    cr: CR.BOSS,
    stats: { hpMax: 60, ac: 15, movementSpeed: 6, attackBonus: 5, damageDice: [2, 8], attackRange: 1 },
    size: "M",
    abilities: ["firebolt", "poison_strike", "healing_word"],
    conditions: [],
    tags: ["undead", "spellcaster"],
    description: "An ancient undead sorcerer sustained by dark magic and a hidden phylactery.",
  },
};

// ── Query Functions ─────────────────────────────────────────────────────

/**
 * Get a monster template by ID.
 * @param {string} templateId
 * @returns {object|null}
 */
export function getMonster(templateId) {
  return MONSTER_CATALOGUE[templateId] || null;
}

/**
 * List all monster templates.
 * @returns {Array<{templateId: string, name: string, cr: string}>}
 */
export function listMonsters() {
  return Object.values(MONSTER_CATALOGUE).map(m => ({
    templateId: m.templateId,
    name: m.name,
    cr: m.cr,
  }));
}

/**
 * Filter monsters by challenge rating.
 * @param {string} cr — CR constant
 * @returns {object[]}
 */
export function filterByCR(cr) {
  return Object.values(MONSTER_CATALOGUE).filter(m => m.cr === cr);
}

/**
 * Filter monsters by tag.
 * @param {string} tag — e.g. "undead", "beast", "humanoid"
 * @returns {object[]}
 */
export function filterByTag(tag) {
  return Object.values(MONSTER_CATALOGUE).filter(m => m.tags.includes(tag));
}

/**
 * Search monsters by name (case-insensitive substring).
 * @param {string} query
 * @returns {object[]}
 */
export function searchMonsters(query) {
  const q = query.toLowerCase();
  return Object.values(MONSTER_CATALOGUE).filter(m =>
    m.name.toLowerCase().includes(q) || m.description.toLowerCase().includes(q)
  );
}

// ── Instantiation ───────────────────────────────────────────────────────

/**
 * Create a GameState-compatible entity from a monster template.
 *
 * @param {string} templateId — monster template ID
 * @param {string} entityId — unique entity ID for this instance
 * @param {{x: number, y: number}} position — starting position
 * @param {object} [overrides] — optional stat/property overrides
 * @returns {object|null} — entity object or null if template not found
 */
export function instantiateMonster(templateId, entityId, position, overrides = {}) {
  const template = MONSTER_CATALOGUE[templateId];
  if (!template) return null;

  const stats = {
    hpCurrent: template.stats.hpMax,
    hpMax: template.stats.hpMax,
    ac: template.stats.ac,
    movementSpeed: template.stats.movementSpeed,
    ...overrides.stats,
  };

  return {
    id: entityId,
    kind: "npc",
    name: overrides.name || template.name,
    position: { x: position.x, y: position.y },
    size: overrides.size || template.size,
    stats,
    conditions: [...template.conditions],
    inventory: [],
    token: { style: "mini", spriteKey: null },
    controller: { type: "ai", playerId: null },
  };
}

/**
 * Create multiple instances of the same monster template.
 *
 * @param {string} templateId
 * @param {number} count
 * @param {{x: number, y: number}[]} positions — one per instance
 * @param {string} [idPrefix] — prefix for entity IDs (default: templateId)
 * @returns {object[]} — array of entity objects
 */
export function instantiateGroup(templateId, count, positions, idPrefix) {
  const prefix = idPrefix || templateId;
  const result = [];
  for (let i = 0; i < count; i++) {
    const pos = positions[i] || { x: 0, y: 0 };
    const entity = instantiateMonster(templateId, `npc-${prefix}-${i + 1}`, pos);
    if (entity) {
      if (count > 1) entity.name = `${entity.name} ${i + 1}`;
      result.push(entity);
    }
  }
  return result;
}
