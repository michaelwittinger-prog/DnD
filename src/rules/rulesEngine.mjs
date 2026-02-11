/**
 * rulesEngine.mjs — Deterministic rules engine for Phase 3 + Phase 5.2.
 *
 * AI proposes actions. The rules engine decides whether they are legal.
 * Illegal proposals are rejected BEFORE any state mutation, with clear,
 * reproducible reasons.
 *
 * Phase 5.2 additions:
 *   - Pre-rules schema validation (AI_RESPONSE_SCHEMA_INVALID)
 *   - Entity ID authority check (UNKNOWN_ENTITY_ID)
 *   - Direct mutation guard (ILLEGAL_AI_STATE_MUTATION)
 *
 * Exports:
 *   evaluateProposal({ state, aiResponse }) → { ok, violations, allowedOps, failureGate }
 *   applyAllowedOps({ state, allowedOps })  → nextState
 */

import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { applyAiResponse } from "../pipeline/applyAiResponse.mjs";
import { V } from "../core/violationCodes.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..", "..");
const require = createRequire(resolve(ROOT, "package.json"));

// ── Load CJS schema validator ──────────────────────────────────────────
const { validateAiGmResponse } = require("./validate_ai_gm_response");

// ── Constants ──────────────────────────────────────────────────────────

const DEFAULT_MAP_WIDTH = 20;
const DEFAULT_MAP_HEIGHT = 15;
const DEFAULT_MOVEMENT_BUDGET = 6;

/** Allowed top-level keys in AI response (defense-in-depth). */
const ALLOWED_AI_RESPONSE_KEYS = new Set([
  "narration", "adjudication", "map_updates", "state_updates", "questions",
]);

// ── RuleViolation factory ──────────────────────────────────────────────

/**
 * @param {string} code       Machine-readable, stable identifier (from V registry)
 * @param {string} message    One-sentence human explanation
 * @param {string} path       Location, e.g. "map_updates[0]"
 * @param {"error"|"warning"} severity
 * @returns {{ code: string, message: string, path: string, severity: string }}
 */
function violation(code, message, pathStr, severity = "error") {
  return { code, message, path: pathStr, severity };
}

// ── Helpers ────────────────────────────────────────────────────────────

function getMapBounds(state) {
  const w = state.map?.dimensions?.width ?? DEFAULT_MAP_WIDTH;
  const h = state.map?.dimensions?.height ?? DEFAULT_MAP_HEIGHT;
  return { width: w, height: h };
}

function inBounds(pos, bounds) {
  return pos.x >= 0 && pos.x < bounds.width && pos.y >= 0 && pos.y < bounds.height;
}

function findEntity(state, id) {
  return (state.entities ?? []).find((e) => e.id === id);
}

/** Build a Set of "x,y" strings for all occupied positions */
function buildOccupancySet(state) {
  const set = new Set();
  for (const e of state.entities ?? []) {
    if (e.position) {
      set.add(`${e.position.x},${e.position.y}`);
    }
  }
  return set;
}

function posKey(pos) {
  return `${pos.x},${pos.y}`;
}

function gridDistance(from, to) {
  // Chebyshev distance (diagonal movement allowed)
  return Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y));
}

function getEntitySpeed(entity) {
  return entity?.stats?.speed ?? DEFAULT_MOVEMENT_BUDGET;
}

function getEntityHp(entity) {
  return entity?.stats?.hp;
}

function buildLogIdSet(state) {
  const set = new Set();
  for (const log of state.logs ?? []) {
    set.add(log.id);
  }
  return set;
}

function buildEntityIdSet(state) {
  const set = new Set();
  for (const e of state.entities ?? []) {
    set.add(e.id);
  }
  return set;
}

// ── Phase 5.2 — Boundary guards ────────────────────────────────────────

/**
 * Task 1 — Strict AI Response Schema Validation.
 * Validates the AI response against ai_gm_response.schema.json BEFORE
 * any rules evaluation. Returns violations or empty array.
 */
function checkSchema(aiResponse) {
  const result = validateAiGmResponse(aiResponse);
  if (result.valid) return [];

  return (result.errors || []).map((err, i) => violation(
    V.AI_RESPONSE_SCHEMA_INVALID,
    `Schema: ${err.instancePath || "(root)"} ${err.message}`,
    `schema_error[${i}]`
  ));
}

/**
 * Task 2 — Entity ID Authority.
 * Scans ALL operations for entity_id references and rejects any
 * that reference IDs not present in the current game state.
 * Spawn ops are excluded (they create new IDs — but are blocked
 * by SPAWN_NO_GM_AUTHORITY anyway).
 */
function checkEntityIdAuthority(aiResponse, entityIds) {
  const violations = [];

  // Collect all entity_id references from operations
  const refs = [];

  for (let i = 0; i < (aiResponse.map_updates ?? []).length; i++) {
    const op = aiResponse.map_updates[i];
    if (op.op === "spawn_entity") continue; // spawn creates new IDs
    if (op.entity_id) {
      refs.push({ id: op.entity_id, path: `map_updates[${i}]` });
    }
  }

  for (let i = 0; i < (aiResponse.state_updates ?? []).length; i++) {
    const op = aiResponse.state_updates[i];
    if (op.entity_id) {
      refs.push({ id: op.entity_id, path: `state_updates[${i}]` });
    }
    // advance_turn references active_entity_id
    if (op.active_entity_id) {
      refs.push({ id: op.active_entity_id, path: `state_updates[${i}].active_entity_id` });
    }
  }

  for (const ref of refs) {
    if (!entityIds.has(ref.id)) {
      violations.push(violation(
        V.UNKNOWN_ENTITY_ID,
        `Entity ID "${ref.id}" is not present in the current game state. AI cannot introduce unknown IDs.`,
        ref.path
      ));
    }
  }

  return violations;
}

/**
 * Task 3 — Prohibit Direct State Mutation from AI.
 * Defense-in-depth guard: checks that the AI response only contains
 * allowed top-level keys and does not attempt to directly inject
 * state data (entities, map, hp fields, position overrides, etc.).
 */
function checkNoDirectMutation(aiResponse) {
  const violations = [];

  if (typeof aiResponse !== "object" || aiResponse === null || Array.isArray(aiResponse)) {
    violations.push(violation(
      V.ILLEGAL_AI_STATE_MUTATION,
      "AI response must be a plain object, not an array or primitive.",
      "(root)"
    ));
    return violations;
  }

  for (const key of Object.keys(aiResponse)) {
    if (!ALLOWED_AI_RESPONSE_KEYS.has(key)) {
      violations.push(violation(
        V.ILLEGAL_AI_STATE_MUTATION,
        `AI response contains forbidden top-level key "${key}". AI may only produce proposals via narration, adjudication, map_updates, state_updates, questions.`,
        key
      ));
    }
  }

  return violations;
}

// ── Rule checks per operation ──────────────────────────────────────────

function checkMoveEntity(op, opIdx, state, bounds, occupancy, moveCountPerEntity) {
  const violations = [];
  const path = `map_updates[${opIdx}]`;

  // Entity must exist
  const entity = findEntity(state, op.entity_id);
  if (!entity) {
    violations.push(violation(
      V.MOVE_ENTITY_NOT_FOUND,
      `Entity "${op.entity_id}" does not exist.`,
      path
    ));
    return violations; // no further checks possible
  }

  // Target must be in bounds
  if (!inBounds(op.to, bounds)) {
    violations.push(violation(
      V.MOVE_OUT_OF_BOUNDS,
      `Target (${op.to.x}, ${op.to.y}) is outside map bounds (${bounds.width}x${bounds.height}).`,
      path
    ));
  }

  // Target must not be occupied by another entity
  const targetKey = posKey(op.to);
  if (occupancy.has(targetKey)) {
    // Check it's not the entity itself
    const selfKey = entity.position ? posKey(entity.position) : null;
    if (targetKey !== selfKey) {
      violations.push(violation(
        V.MOVE_TILE_OCCUPIED,
        `Target (${op.to.x}, ${op.to.y}) is already occupied by another entity.`,
        path
      ));
    }
  }

  // Movement distance must be within budget
  if (entity.position) {
    const dist = gridDistance(entity.position, op.to);
    const budget = getEntitySpeed(entity);
    if (dist > budget) {
      violations.push(violation(
        V.MOVE_EXCEEDS_BUDGET,
        `Movement distance ${dist} exceeds budget ${budget} for entity "${op.entity_id}".`,
        path
      ));
    }
  }

  // Cannot move more than once per turn
  const moveCount = moveCountPerEntity.get(op.entity_id) ?? 0;
  if (moveCount >= 1) {
    violations.push(violation(
      V.MOVE_DUPLICATE,
      `Entity "${op.entity_id}" is being moved more than once in this proposal.`,
      path
    ));
  }
  moveCountPerEntity.set(op.entity_id, moveCount + 1);

  return violations;
}

function checkSpawnEntity(op, opIdx, state, bounds, occupancy, entityIds) {
  const violations = [];
  const path = `map_updates[${opIdx}]`;
  const e = op.entity;

  if (!e) {
    violations.push(violation(
      V.SPAWN_MISSING_ENTITY,
      "spawn_entity op is missing the entity payload.",
      path
    ));
    return violations;
  }

  // Target position must be in bounds
  if (e.pos && !inBounds(e.pos, bounds)) {
    violations.push(violation(
      V.SPAWN_OUT_OF_BOUNDS,
      `Spawn position (${e.pos.x}, ${e.pos.y}) is outside map bounds.`,
      path
    ));
  }

  // Target tile must be empty
  if (e.pos && occupancy.has(posKey(e.pos))) {
    violations.push(violation(
      V.SPAWN_TILE_OCCUPIED,
      `Spawn position (${e.pos.x}, ${e.pos.y}) is already occupied.`,
      path
    ));
  }

  // Spawned id must be unique
  if (e.id && entityIds.has(e.id)) {
    violations.push(violation(
      V.SPAWN_DUPLICATE_ID,
      `Entity ID "${e.id}" already exists.`,
      path
    ));
  }

  // GM authority required — no actorRole field exists in AI response schema → deny
  violations.push(violation(
    V.SPAWN_NO_GM_AUTHORITY,
    "spawn_entity requires GM authority, which cannot be determined from the AI response schema.",
    path
  ));

  return violations;
}

function checkRemoveEntity(op, opIdx, state) {
  const violations = [];
  const path = `map_updates[${opIdx}]`;

  // Entity must exist
  const entity = findEntity(state, op.entity_id);
  if (!entity) {
    violations.push(violation(
      V.REMOVE_ENTITY_NOT_FOUND,
      `Entity "${op.entity_id}" does not exist.`,
      path
    ));
    return violations;
  }

  // Allowed only if HP == 0 or GM authority
  const hp = getEntityHp(entity);
  if (hp !== 0) {
    // No GM authority field exists → deny
    violations.push(violation(
      V.REMOVE_NOT_DEAD_NO_GM,
      `Entity "${op.entity_id}" HP is ${hp ?? "undefined"}, not 0. Removal requires HP=0 or GM authority (not available).`,
      path
    ));
  }

  return violations;
}

function checkSetHp(op, opIdx, state) {
  const violations = [];
  const path = `state_updates[${opIdx}]`;

  // Entity must exist
  const entity = findEntity(state, op.entity_id);
  if (!entity) {
    violations.push(violation(
      V.SET_HP_ENTITY_NOT_FOUND,
      `Entity "${op.entity_id}" does not exist.`,
      path
    ));
    return violations;
  }

  // HP must be integer >= 0
  if (!Number.isInteger(op.current) || op.current < 0) {
    violations.push(violation(
      V.SET_HP_INVALID,
      `HP value ${op.current} is not a valid integer >= 0.`,
      path
    ));
  }

  // HP increase is forbidden (no healing concept in schema)
  const currentHp = getEntityHp(entity);
  if (currentHp !== undefined && op.current > currentHp) {
    violations.push(violation(
      V.SET_HP_INCREASE_FORBIDDEN,
      `HP increase from ${currentHp} to ${op.current} is forbidden (no healing concept in schema).`,
      path
    ));
  }

  return violations;
}

function checkAddEventLog(op, opIdx, state, logIds) {
  const violations = [];
  const path = `state_updates[${opIdx}]`;

  if (!op.event) {
    violations.push(violation(
      V.LOG_MISSING_EVENT,
      "add_event_log op is missing the event payload.",
      path
    ));
    return violations;
  }

  // Log id must be unique
  const logId = `log-event-${op.event.i}`;
  if (logIds.has(logId)) {
    violations.push(violation(
      V.LOG_DUPLICATE_ID,
      `Log entry ID "${logId}" already exists.`,
      path
    ));
  }
  // Track it so subsequent ops in the same proposal also detect duplicates
  logIds.add(logId);

  return violations;
}

function checkAdvanceTurn(op, opIdx, advanceTurnCount) {
  const violations = [];
  const path = `state_updates[${opIdx}]`;

  // May appear at most once per proposal
  if (advanceTurnCount.value >= 1) {
    violations.push(violation(
      V.ADVANCE_TURN_DUPLICATE,
      "advance_turn may appear at most once per proposal.",
      path
    ));
  }
  advanceTurnCount.value++;

  return violations;
}

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Evaluate all operations in an AI response for legality.
 * Deterministic, side-effect free.
 *
 * Phase 5.2: evaluateProposal now includes pre-rules boundary checks:
 *   1. Schema validation (AI_RESPONSE_SCHEMA_INVALID)
 *   2. Direct mutation guard (ILLEGAL_AI_STATE_MUTATION)
 *   3. Entity ID authority (UNKNOWN_ENTITY_ID)
 *   4. Per-operation rules (existing Phase 3 logic)
 *
 * @param {{ state: object, aiResponse: object }} opts
 * @returns {{ ok: boolean, violations: object[], allowedOps: object[], failureGate: string|null }}
 */
export function evaluateProposal({ state, aiResponse }) {

  // ── Gate 0: Schema validation (Task 1) ───────────────────────────
  const schemaViolations = checkSchema(aiResponse);
  if (schemaViolations.length > 0) {
    return {
      ok: false,
      violations: schemaViolations,
      allowedOps: [],
      failureGate: "schema",
    };
  }

  // ── Gate 1: Direct mutation guard (Task 3) ───────────────────────
  const mutationViolations = checkNoDirectMutation(aiResponse);
  if (mutationViolations.length > 0) {
    return {
      ok: false,
      violations: mutationViolations,
      allowedOps: [],
      failureGate: "schema",
    };
  }

  // ── Gate 2: Entity ID authority (Task 2) ─────────────────────────
  const entityIds = buildEntityIdSet(state);
  const entityIdViolations = checkEntityIdAuthority(aiResponse, entityIds);
  // Entity ID violations are collected but don't short-circuit (continue checking rules)

  // ── Gate 3: Per-operation rules (existing Phase 3) ───────────────
  const allViolations = [...entityIdViolations];
  const bounds = getMapBounds(state);
  const occupancy = buildOccupancySet(state);
  const logIds = buildLogIdSet(state);
  const moveCountPerEntity = new Map();
  const advanceTurnCount = { value: 0 };

  // ── Check map_updates ────────────────────────────────────────────
  const mapUpdates = aiResponse.map_updates ?? [];
  for (let i = 0; i < mapUpdates.length; i++) {
    const op = mapUpdates[i];
    switch (op.op) {
      case "move_entity":
        allViolations.push(...checkMoveEntity(op, i, state, bounds, occupancy, moveCountPerEntity));
        // Update occupancy optimistically for subsequent collision checks
        if (findEntity(state, op.entity_id)?.position) {
          occupancy.delete(posKey(findEntity(state, op.entity_id).position));
        }
        occupancy.add(posKey(op.to));
        break;
      case "spawn_entity":
        allViolations.push(...checkSpawnEntity(op, i, state, bounds, occupancy, entityIds));
        break;
      case "remove_entity":
        allViolations.push(...checkRemoveEntity(op, i, state));
        break;
      default:
        allViolations.push(violation(
          V.UNKNOWN_MAP_OP,
          `Unknown map update operation: "${op.op}".`,
          `map_updates[${i}]`
        ));
    }
  }

  // ── Check state_updates ──────────────────────────────────────────
  const stateUpdates = aiResponse.state_updates ?? [];
  for (let i = 0; i < stateUpdates.length; i++) {
    const op = stateUpdates[i];
    switch (op.op) {
      case "set_hp":
        allViolations.push(...checkSetHp(op, i, state));
        break;
      case "add_event_log":
        allViolations.push(...checkAddEventLog(op, i, state, logIds));
        break;
      case "advance_turn":
        allViolations.push(...checkAdvanceTurn(op, i, advanceTurnCount));
        break;
      default:
        allViolations.push(violation(
          V.UNKNOWN_STATE_OP,
          `Unknown state update operation: "${op.op}".`,
          `state_updates[${i}]`
        ));
    }
  }

  // ── Decision ─────────────────────────────────────────────────────
  const hasError = allViolations.some((v) => v.severity === "error");
  const allOps = [...mapUpdates, ...stateUpdates];

  return {
    ok: !hasError,
    violations: allViolations,
    allowedOps: hasError ? [] : allOps,
    failureGate: hasError ? "rules" : null,
  };
}

/**
 * Apply only pre-validated ops to the state.
 * This calls the low-level applyAiResponse with a synthetic AI response
 * containing only the allowed ops.
 *
 * @param {{ state: object, allowedOps: object[] }} opts
 * @returns {object} nextState
 */
export function applyAllowedOps({ state, allowedOps }) {
  // Partition back into map_updates and state_updates
  const mapOps = ["move_entity", "spawn_entity", "remove_entity", "add_object", "update_object_state", "remove_object"];
  const map_updates = allowedOps.filter((op) => mapOps.includes(op.op));
  const state_updates = allowedOps.filter((op) => !mapOps.includes(op.op));

  // Build a minimal AI response envelope for the low-level applier
  const syntheticResponse = {
    narration: "",
    adjudication: "",
    map_updates,
    state_updates,
    questions: [],
  };

  return applyAiResponse({ state, aiResponse: syntheticResponse });
}
