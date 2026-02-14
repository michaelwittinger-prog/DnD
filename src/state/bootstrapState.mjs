/**
 * bootstrapState.mjs — ONE-TIME converter: pipeline state → engine state.
 *
 * Converts a pipeline-format game state (game_state.example.json) into
 * an engine-format state that applyAction() and the engine modules expect.
 *
 * This runs ONCE to seed the canonical engine state. After that, engine
 * state evolves on its own via applyAction(). This is NOT bidirectional.
 *
 * See docs/implementation_report.md §5 for the field mapping reference.
 *
 * @module bootstrapState
 */

/**
 * Convert a pipeline state to engine state.
 *
 * @param {object} pipelineState - state in pipeline format (game_state.example.json shape)
 * @returns {object} engine-format state
 */
export function bootstrapEngineState(pipelineState) {
  const ps = pipelineState;

  // ── Map ────────────────────────────────────────────────────────────
  const width = ps.map?.dimensions?.width ?? 20;
  const height = ps.map?.dimensions?.height ?? 15;

  const terrain = (ps.map?.tiles ?? []).map((t) => ({
    x: t.x,
    y: t.y,
    type: mapTerrainType(t.terrain),
    blocksMovement: isBlockingTerrain(t.terrain),
    blocksVision: isBlockingTerrain(t.terrain),
  }));

  const map = {
    id: `map-${(ps.map?.name ?? "unknown").toLowerCase().replace(/\s+/g, "-")}`,
    name: ps.map?.name ?? "Unknown Map",
    grid: {
      type: "square",
      size: { width, height },
      cellSize: 5,
    },
    terrain,
    fogOfWarEnabled: false,
  };

  // ── Entities ───────────────────────────────────────────────────────
  const flatEntities = ps.entities ?? [];
  const players = [];
  const npcs = [];
  const objects = [];

  for (const e of flatEntities) {
    const engineEntity = convertEntity(e);
    if (e.type === "player" || e.role === "pc") {
      players.push(engineEntity);
    } else if (e.type === "npc" || e.role === "enemy" || e.role === "ally" || e.role === "neutral") {
      npcs.push(engineEntity);
    } else {
      objects.push(engineEntity);
    }
  }

  // ── Combat ─────────────────────────────────────────────────────────
  const combat = convertCombat(ps, [...players, ...npcs]);

  // ── RNG ────────────────────────────────────────────────────────────
  const rng = {
    mode: ps.rng?.seed ? "seeded" : "manual",
    seed: ps.rng?.seed ? String(ps.rng.seed) : null,
    lastRolls: [],
  };

  // ── Log ────────────────────────────────────────────────────────────
  const events = (ps.logs ?? []).map((log, i) => ({
    id: log.id ?? `evt-bootstrap-${i + 1}`,
    timestamp: log.timestamp ?? ps.meta?.updatedAt ?? new Date().toISOString(),
    type: "BOOTSTRAP_LOG",
    payload: { message: log.message ?? "" },
  }));

  return {
    schemaVersion: "0.1.0",
    campaignId: ps.session?.id ?? "campaign-bootstrap",
    sessionId: ps.session?.id ?? "session-bootstrap",
    timestamp: ps.meta?.updatedAt ?? new Date().toISOString(),
    rng,
    map,
    entities: { players, npcs, objects },
    combat,
    log: { events },
    ui: { selectedEntityId: null, hoveredCell: null },
  };
}

// ── Entity converter ───────────────────────────────────────────────────

function convertEntity(e) {
  const hp = e.stats?.hp ?? e.stats?.hpCurrent ?? 20;
  const maxHp = e.stats?.maxHp ?? e.stats?.hpMax ?? hp;
  const speed = e.stats?.speed ?? e.stats?.movementSpeed ?? 6;
  const ac = e.stats?.ac ?? 14;

  const kind = e.type === "player" ? "player" : e.type === "npc" ? "npc" : "object";

  return {
    id: e.id,
    kind,
    name: e.name ?? e.id,
    position: { x: e.position?.x ?? 0, y: e.position?.y ?? 0 },
    size: "M",
    stats: {
      hpCurrent: hp,
      hpMax: maxHp,
      ac,
      movementSpeed: speed,
    },
    conditions: Array.isArray(e.conditions) ? [...e.conditions] : [],
    inventory: [],
    token: { style: "mini", spriteKey: null },
    controller: {
      type: kind === "player" ? "human" : "ai",
      playerId: kind === "player" ? e.id : null,
    },
  };
}

// ── Combat converter ───────────────────────────────────────────────────

function convertCombat(ps, allEntities) {
  const c = ps.combat;
  if (!c || !c.active) {
    return {
      mode: "exploration",
      round: 0,
      activeEntityId: null,
      initiativeOrder: [],
    };
  }

  // Pipeline uses active_index + initiative_order, engine uses activeEntityId
  const order = c.initiative_order ?? [];
  const activeIdx = c.active_index ?? 0;
  const activeEntityId = order[activeIdx] ?? null;

  return {
    mode: "combat",
    round: c.round ?? 1,
    activeEntityId,
    initiativeOrder: [...order],
  };
}

// ── Terrain helpers ────────────────────────────────────────────────────

const BLOCKING_TERRAINS = new Set(["wall", "rock", "pillar", "blocked"]);

function isBlockingTerrain(terrainName) {
  if (!terrainName) return false;
  return BLOCKING_TERRAINS.has(terrainName.toLowerCase());
}

function mapTerrainType(terrainName) {
  if (!terrainName) return "normal";
  const lower = terrainName.toLowerCase();
  if (BLOCKING_TERRAINS.has(lower)) return "blocked";
  if (["water", "mud", "rubble", "difficult"].includes(lower)) return "difficult";
  return "normal";
}
