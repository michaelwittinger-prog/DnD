/**
 * scenarioBuilder.mjs — MIR Tier 6.4 Scenario Builder.
 *
 * Programmatic scenario construction from party + encounter + map components.
 * Combines character creator, encounter generator, and map templates
 * into complete ScenarioBundle objects.
 *
 * Pure functions. No side effects.
 */

import { createParty, createFromPreset } from "./characterCreator.mjs";
import { generateEncounter } from "./encounterGenerator.mjs";

// ── Map Templates ───────────────────────────────────────────────────────

export const MAP_TEMPLATES = {
  arena: {
    templateId: "arena",
    name: "Gladiator Arena",
    description: "An open 10×10 fighting pit.",
    grid: { size: { width: 10, height: 10 } },
    terrain: [],
    playerSpawns: [{ x: 2, y: 8 }, { x: 4, y: 8 }, { x: 6, y: 8 }, { x: 8, y: 8 }],
    npcSpawnZone: { xMin: 1, xMax: 8, yMin: 1, yMax: 4 },
  },
  dungeon_corridor: {
    templateId: "dungeon_corridor",
    name: "Dungeon Corridor",
    description: "A narrow 12×6 stone corridor with pillars.",
    grid: { size: { width: 12, height: 6 } },
    terrain: [
      { x: 3, y: 2, type: "wall" }, { x: 3, y: 3, type: "wall" },
      { x: 8, y: 2, type: "wall" }, { x: 8, y: 3, type: "wall" },
    ],
    playerSpawns: [{ x: 0, y: 2 }, { x: 0, y: 3 }, { x: 1, y: 2 }, { x: 1, y: 3 }],
    npcSpawnZone: { xMin: 9, xMax: 11, yMin: 1, yMax: 4 },
  },
  forest_clearing: {
    templateId: "forest_clearing",
    name: "Forest Clearing",
    description: "An 8×8 wooded clearing with difficult terrain.",
    grid: { size: { width: 8, height: 8 } },
    terrain: [
      { x: 1, y: 1, type: "difficult" }, { x: 2, y: 1, type: "difficult" },
      { x: 5, y: 5, type: "difficult" }, { x: 6, y: 5, type: "difficult" },
      { x: 0, y: 0, type: "wall" }, { x: 7, y: 0, type: "wall" },
      { x: 0, y: 7, type: "wall" }, { x: 7, y: 7, type: "wall" },
    ],
    playerSpawns: [{ x: 1, y: 6 }, { x: 2, y: 6 }, { x: 3, y: 6 }, { x: 4, y: 6 }],
    npcSpawnZone: { xMin: 2, xMax: 6, yMin: 0, yMax: 3 },
  },
  tavern: {
    templateId: "tavern",
    name: "Tavern Interior",
    description: "A 10×8 tavern with tables as obstacles.",
    grid: { size: { width: 10, height: 8 } },
    terrain: [
      { x: 2, y: 2, type: "wall" }, { x: 3, y: 2, type: "wall" },
      { x: 6, y: 4, type: "wall" }, { x: 7, y: 4, type: "wall" },
      { x: 4, y: 6, type: "difficult" }, { x: 5, y: 6, type: "difficult" },
    ],
    playerSpawns: [{ x: 1, y: 7 }, { x: 2, y: 7 }, { x: 3, y: 7 }, { x: 4, y: 7 }],
    npcSpawnZone: { xMin: 5, xMax: 9, yMin: 0, yMax: 3 },
  },
};

// ── Query Functions ─────────────────────────────────────────────────────

export function getMapTemplate(templateId) {
  return MAP_TEMPLATES[templateId] ?? null;
}

export function listMapTemplates() {
  return Object.values(MAP_TEMPLATES).map(m => ({
    templateId: m.templateId,
    name: m.name,
    description: m.description,
    size: m.grid.size,
  }));
}

// ── Builder ─────────────────────────────────────────────────────────────

/**
 * Build a complete scenario from components.
 *
 * @param {object} params
 * @param {string} params.name — scenario display name
 * @param {string} [params.description] — scenario description
 * @param {string} params.mapTemplateId — map template key
 * @param {string[]} params.partyPresetIds — preset character IDs
 * @param {string} [params.difficulty="normal"] — encounter difficulty
 * @param {number} [params.seed=42] — RNG seed for encounter generation
 * @param {object} [params.mapOverrides] — override map template fields
 * @returns {{ scenario: object, errors: string[] }}
 */
export function buildScenario(params) {
  const errors = [];
  const {
    name,
    description = "",
    mapTemplateId,
    partyPresetIds,
    difficulty = "normal",
    seed = 42,
    mapOverrides = {},
  } = params;

  if (!name) errors.push("Scenario name is required");
  if (!partyPresetIds?.length) errors.push("At least one party member required");

  // Resolve map
  const mapTemplate = MAP_TEMPLATES[mapTemplateId];
  if (!mapTemplate) {
    errors.push(`Unknown map template: ${mapTemplateId}`);
    return { scenario: null, errors };
  }

  // Build party
  const spawns = mapOverrides.playerSpawns ?? mapTemplate.playerSpawns;
  const party = createParty(partyPresetIds, spawns);
  if (party.length === 0) {
    errors.push("No valid party members created");
    return { scenario: null, errors };
  }

  // Generate encounter
  const zone = mapOverrides.npcSpawnZone ?? mapTemplate.npcSpawnZone;
  const gridSize = mapOverrides.grid?.size ?? mapTemplate.grid.size;
  const playerPositions = party.map(p => p.position);

  let encounter;
  try {
    encounter = generateEncounter({
      partySize: party.length,
      difficulty,
      gridSize,
      playerPositions,
      spawnZone: zone,
      seed,
    });
  } catch (e) {
    errors.push(`Encounter generation failed: ${e.message}`);
    return { scenario: null, errors };
  }

  // Build terrain map
  const terrainCells = mapOverrides.terrain ?? mapTemplate.terrain;
  const terrainMap = {};
  for (const t of terrainCells) {
    terrainMap[`${t.x},${t.y}`] = { type: t.type, blocksMovement: t.type === "wall", blocksVision: t.type === "wall" };
  }

  // Assemble state
  const initialState = {
    schemaVersion: "0.5.0",
    meta: { sessionId: `scenario-${Date.now()}`, createdAt: new Date().toISOString() },
    map: {
      grid: mapOverrides.grid ?? mapTemplate.grid,
      terrain: terrainMap,
      fogOfWar: { enabled: true },
    },
    entities: {
      players: party,
      npcs: encounter.entities,
      objects: [],
    },
    combat: {
      active: false,
      round: 0,
      initiativeOrder: [],
      activeEntityId: null,
    },
    eventLog: [],
    rng: { seed, current: seed },
  };

  const scenario = {
    format: "mir-scenario",
    version: "1.0.0",
    meta: {
      name,
      description,
      author: "Scenario Builder",
      difficulty,
      partySize: party.length,
      monsterCount: encounter.entities.length,
      mapTemplate: mapTemplateId,
      estimatedDifficulty: encounter.estimatedDifficulty,
    },
    initialState,
    suggestedReplays: [],
  };

  return { scenario, errors };
}

/**
 * Quick-build a scenario with minimal params.
 *
 * @param {string} mapTemplateId
 * @param {string[]} partyPresetIds
 * @param {string} [difficulty="normal"]
 * @returns {{ scenario: object, errors: string[] }}
 */
export function quickBuild(mapTemplateId, partyPresetIds, difficulty = "normal") {
  const mapTemplate = MAP_TEMPLATES[mapTemplateId];
  const mapName = mapTemplate?.name ?? mapTemplateId;
  return buildScenario({
    name: `${mapName} Encounter`,
    description: `Auto-generated ${difficulty} encounter in ${mapName}.`,
    mapTemplateId,
    partyPresetIds,
    difficulty,
    seed: Math.floor(Math.random() * 100000),
  });
}
