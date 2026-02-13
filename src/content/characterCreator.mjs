/**
 * characterCreator.mjs — MIR Tier 6.2 Character Creator.
 *
 * Create player characters from class templates with stats, abilities,
 * and equipment. Mirrors the monster manual pattern for player entities.
 *
 * Pure data + factory functions. No side effects.
 */

// ── Class Templates ─────────────────────────────────────────────────────

/**
 * Player class archetypes.
 */
export const CLASS = {
  FIGHTER: "fighter",
  ROGUE: "rogue",
  WIZARD: "wizard",
  CLERIC: "cleric",
  RANGER: "ranger",
};

/**
 * Class template catalogue.
 * Each defines base stats, abilities, starting equipment, and progression hints.
 */
export const CLASS_TEMPLATES = {
  fighter: {
    classId: "fighter",
    name: "Fighter",
    description: "A master of martial combat, tough and versatile.",
    baseStats: { hpMax: 28, ac: 16, movementSpeed: 6, attackBonus: 5, damageDice: [1, 8], attackRange: 1 },
    size: "M",
    abilities: ["shield_bash"],
    startingEquipment: ["longsword", "chain_mail", "shield"],
    tags: ["martial", "melee"],
  },
  rogue: {
    classId: "rogue",
    name: "Rogue",
    description: "A cunning trickster who strikes from the shadows.",
    baseStats: { hpMax: 20, ac: 14, movementSpeed: 7, attackBonus: 6, damageDice: [1, 6], attackRange: 1 },
    size: "M",
    abilities: ["sneak_attack"],
    startingEquipment: ["shortsword", "leather_armor", "thieves_tools"],
    tags: ["martial", "melee", "stealth"],
  },
  wizard: {
    classId: "wizard",
    name: "Wizard",
    description: "A scholarly spellcaster wielding arcane power.",
    baseStats: { hpMax: 16, ac: 12, movementSpeed: 6, attackBonus: 2, damageDice: [1, 4], attackRange: 1 },
    size: "M",
    abilities: ["firebolt"],
    startingEquipment: ["quarterstaff", "robes", "spellbook"],
    tags: ["caster", "ranged"],
  },
  cleric: {
    classId: "cleric",
    name: "Cleric",
    description: "A divine healer and protector of the faithful.",
    baseStats: { hpMax: 22, ac: 15, movementSpeed: 6, attackBonus: 3, damageDice: [1, 6], attackRange: 1 },
    size: "M",
    abilities: ["healing_word"],
    startingEquipment: ["mace", "scale_mail", "holy_symbol"],
    tags: ["caster", "healer", "melee"],
  },
  ranger: {
    classId: "ranger",
    name: "Ranger",
    description: "A wilderness warrior skilled with bow and blade.",
    baseStats: { hpMax: 24, ac: 14, movementSpeed: 7, attackBonus: 4, damageDice: [1, 8], attackRange: 6 },
    size: "M",
    abilities: ["firebolt"],  // Flavored as "arrow volley" in narration
    startingEquipment: ["longbow", "leather_armor", "quiver"],
    tags: ["martial", "ranged"],
  },
};

// ── Preset Characters ───────────────────────────────────────────────────

/**
 * Pre-built named characters for quick play.
 */
export const PRESET_CHARACTERS = {
  seren: {
    presetId: "seren",
    name: "Seren Ashford",
    classId: "wizard",
    statOverrides: { hpMax: 22, ac: 13, attackBonus: 4 },
    abilityOverrides: ["firebolt"],
    backstory: "An elven scholar who left the academy to study magic in the wild.",
  },
  miri: {
    presetId: "miri",
    name: "Miri Thistledown",
    classId: "rogue",
    statOverrides: { hpMax: 18, ac: 14 },
    abilityOverrides: ["sneak_attack", "poison_strike"],
    backstory: "A halfling thief with a heart of gold and quick fingers.",
  },
  thorin: {
    presetId: "thorin",
    name: "Thorin Ironforge",
    classId: "fighter",
    statOverrides: { hpMax: 32, ac: 17 },
    abilityOverrides: ["shield_bash"],
    backstory: "A dwarven veteran of a hundred battles.",
  },
  elara: {
    presetId: "elara",
    name: "Elara Brightwater",
    classId: "cleric",
    statOverrides: { hpMax: 24, ac: 16 },
    abilityOverrides: ["healing_word"],
    backstory: "A human priestess devoted to healing the wounded.",
  },
  finn: {
    presetId: "finn",
    name: "Finn Greenleaf",
    classId: "ranger",
    statOverrides: {},
    abilityOverrides: ["firebolt"],
    backstory: "A wood elf tracker who speaks with the forest creatures.",
  },
};

// ── Query Functions ─────────────────────────────────────────────────────

/**
 * Get a class template by ID.
 * @param {string} classId
 * @returns {object|null}
 */
export function getClassTemplate(classId) {
  return CLASS_TEMPLATES[classId] ?? null;
}

/**
 * List all available class templates.
 * @returns {Array<{classId: string, name: string, description: string}>}
 */
export function listClasses() {
  return Object.values(CLASS_TEMPLATES).map(c => ({
    classId: c.classId,
    name: c.name,
    description: c.description,
  }));
}

/**
 * Filter classes by tag.
 * @param {string} tag
 * @returns {object[]}
 */
export function filterClassesByTag(tag) {
  return Object.values(CLASS_TEMPLATES).filter(c => c.tags?.includes(tag));
}

/**
 * Get a preset character by ID.
 * @param {string} presetId
 * @returns {object|null}
 */
export function getPreset(presetId) {
  return PRESET_CHARACTERS[presetId] ?? null;
}

/**
 * List all preset characters.
 * @returns {Array<{presetId: string, name: string, classId: string}>}
 */
export function listPresets() {
  return Object.values(PRESET_CHARACTERS).map(p => ({
    presetId: p.presetId,
    name: p.name,
    classId: p.classId,
  }));
}

// ── Factory Functions ───────────────────────────────────────────────────

/**
 * Create a player entity from a class template.
 *
 * @param {string} classId — class template key
 * @param {string} entityId — unique entity ID (e.g. "pc-seren")
 * @param {string} name — character display name
 * @param {{x: number, y: number}} position — starting grid position
 * @param {object} [overrides] — optional overrides
 * @param {object} [overrides.stats] — stat overrides
 * @param {string[]} [overrides.abilities] — override ability list
 * @param {string[]} [overrides.equipment] — override equipment
 * @param {string} [overrides.size] — size override
 * @returns {object|null} — player entity or null if class not found
 */
export function createCharacter(classId, entityId, name, position, overrides = {}) {
  const template = CLASS_TEMPLATES[classId];
  if (!template) return null;

  const stats = {
    hpCurrent: overrides.stats?.hpMax ?? template.baseStats.hpMax,
    hpMax: template.baseStats.hpMax,
    ac: template.baseStats.ac,
    movementSpeed: template.baseStats.movementSpeed,
    attackBonus: template.baseStats.attackBonus,
    damageDice: [...template.baseStats.damageDice],
    ...overrides.stats,
  };

  // Ensure hpCurrent doesn't exceed hpMax
  if (stats.hpCurrent > stats.hpMax) stats.hpCurrent = stats.hpMax;

  return {
    id: entityId,
    kind: "player",
    name,
    position: { x: position.x, y: position.y },
    size: overrides.size ?? template.size,
    stats,
    conditions: [],
    abilities: overrides.abilities ?? [...template.abilities],
    inventory: overrides.equipment ?? [...template.startingEquipment],
    token: { style: "mini", spriteKey: null },
    controller: { type: "human", playerId: entityId },
  };
}

/**
 * Create a player entity from a preset character.
 *
 * @param {string} presetId — preset key
 * @param {{x: number, y: number}} position — starting grid position
 * @param {object} [extraOverrides] — additional overrides on top of preset
 * @returns {object|null} — player entity or null if preset not found
 */
export function createFromPreset(presetId, position, extraOverrides = {}) {
  const preset = PRESET_CHARACTERS[presetId];
  if (!preset) return null;

  const entityId = `pc-${presetId}`;
  return createCharacter(preset.classId, entityId, preset.name, position, {
    stats: { ...preset.statOverrides, ...extraOverrides.stats },
    abilities: extraOverrides.abilities ?? preset.abilityOverrides,
    ...extraOverrides,
  });
}

/**
 * Create a full party from preset IDs.
 *
 * @param {string[]} presetIds — array of preset character IDs
 * @param {{x: number, y: number}[]} positions — one position per character
 * @returns {object[]} — array of player entities (skips nulls)
 */
export function createParty(presetIds, positions) {
  return presetIds
    .map((id, i) => createFromPreset(id, positions[i] ?? { x: i, y: 0 }))
    .filter(Boolean);
}

/**
 * Validate that a character entity has all required fields.
 *
 * @param {object} entity
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateCharacter(entity) {
  const errors = [];

  if (!entity) return { valid: false, errors: ["Entity is null"] };
  if (!entity.id) errors.push("Missing id");
  if (!entity.name) errors.push("Missing name");
  if (entity.kind !== "player") errors.push("Kind must be 'player'");
  if (!entity.position || typeof entity.position.x !== "number") errors.push("Invalid position");
  if (!entity.stats) errors.push("Missing stats");
  else {
    if (typeof entity.stats.hpMax !== "number" || entity.stats.hpMax <= 0) errors.push("hpMax must be > 0");
    if (typeof entity.stats.hpCurrent !== "number") errors.push("hpCurrent required");
    if (typeof entity.stats.ac !== "number") errors.push("ac required");
    if (typeof entity.stats.movementSpeed !== "number") errors.push("movementSpeed required");
  }
  if (!Array.isArray(entity.conditions)) errors.push("conditions must be array");
  if (!entity.controller) errors.push("Missing controller");

  return { valid: errors.length === 0, errors };
}
