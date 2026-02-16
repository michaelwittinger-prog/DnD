/**
 * intentPlanner.mjs — Converts PlayerIntents into concrete DeclaredActions.
 *
 * This is the bridge between flexible human intent and rigid engine actions.
 * It uses game state, pathfinding, ability catalogue, and entity data to
 * produce valid, ordered sequences of DeclaredActions.
 *
 * Safety guarantees:
 *   - ONLY produces whitelisted DeclaredAction shapes
 *   - NEVER modifies GameState (reads only)
 *   - Engine still validates everything — planner is best-effort
 *   - All entity/ability resolution is deterministic
 */

import { INTENT_TYPES, DIRECTIONS, TARGET_SELECTORS, isTacticalSelector } from "./intentTypes.mjs";
import { findPath, findPathToAdjacent, isAdjacent, getHostileEntities } from "../engine/pathfinding.mjs";
import { ABILITY_CATALOGUE } from "../engine/abilities.mjs";

// ── Main Entry Point ─────────────────────────────────────────────────

/**
 * Convert a PlayerIntent into an ActionPlan (ordered DeclaredActions).
 *
 * @param {object} state  — current GameState (read-only)
 * @param {object} intent — PlayerIntent from parser
 * @returns {ActionPlan}
 *
 * @typedef {Object} ActionPlan
 * @property {boolean} ok           — true if at least one action was planned
 * @property {object[]} actions     — ordered DeclaredAction array
 * @property {string}  narrationHint — human summary of what was planned
 * @property {string}  [error]      — why planning failed (if !ok)
 */
export function planFromIntent(state, intent) {
  if (!state || !intent) {
    return fail("Missing state or intent");
  }

  const allEntities = getAllEntities(state);
  const subjectId = resolveSubject(state, intent.subject, allEntities);

  switch (intent.type) {
    case INTENT_TYPES.START_COMBAT:
      return planStartCombat();

    case INTENT_TYPES.END_TURN:
      return planEndTurn(state, subjectId);

    case INTENT_TYPES.MOVE_TO:
      return planMoveTo(state, subjectId, intent.x, intent.y, allEntities);

    case INTENT_TYPES.MOVE_DIRECTION:
      return planMoveDirection(state, subjectId, intent.direction, intent.distance, allEntities);

    case INTENT_TYPES.APPROACH:
      return planApproach(state, subjectId, intent.target, allEntities);

    case INTENT_TYPES.FLEE:
      return planFlee(state, subjectId, intent.from, allEntities);

    case INTENT_TYPES.ATTACK:
      return planAttack(state, subjectId, intent.target, allEntities);

    case INTENT_TYPES.USE_ABILITY:
      return planUseAbility(state, subjectId, intent.ability, intent.target, allEntities);

    case INTENT_TYPES.DEFEND:
      return planDefend(state, subjectId);

    case INTENT_TYPES.COMPOUND:
      return planCompound(state, intent.steps, allEntities);

    case INTENT_TYPES.UNKNOWN:
      return fail(intent.hint || "Could not understand the command");

    default:
      return fail(`Unhandled intent type: ${intent.type}`);
  }
}

// ── Individual Planners ──────────────────────────────────────────────

function planStartCombat() {
  return ok(
    [{ type: "ROLL_INITIATIVE" }],
    "Rolling initiative to start combat"
  );
}

function planEndTurn(state, subjectId) {
  const entityId = subjectId || state.combat.activeEntityId;
  if (!entityId) {
    return fail("No active entity to end turn for — start combat first");
  }
  return ok(
    [{ type: "END_TURN", entityId }],
    `Ending ${entityId}'s turn`
  );
}

function planMoveTo(state, subjectId, x, y, allEntities) {
  const entity = allEntities.find(e => e.id === subjectId);
  if (!entity) return fail(`Could not determine who to move`);

  if (entity.position.x === x && entity.position.y === y) {
    return fail(`${entity.name} is already at (${x}, ${y})`);
  }

  // Find full path WITHOUT speed cap — we truncate to speed afterward
  const result = findPath(state, entity.position, { x, y }, { entityId: subjectId });
  const path = result?.path;
  if (!path || path.length === 0) {
    return fail(`No valid path from ${entity.name} to (${x}, ${y})`);
  }

  // Trim path to movement speed
  const speed = entity.stats?.movementSpeed ?? 6;
  const trimmedPath = path.slice(0, speed);
  const arrived = trimmedPath.length === path.length;
  const dest = trimmedPath[trimmedPath.length - 1];
  const hint = arrived
    ? `Moving ${entity.name} to (${dest.x}, ${dest.y})`
    : `Moving ${entity.name} toward (${x}, ${y}) — reached (${dest.x}, ${dest.y}), ${path.length - trimmedPath.length} steps remaining`;

  return ok(
    [{ type: "MOVE", entityId: subjectId, path: trimmedPath }],
    hint
  );
}

function planMoveDirection(state, subjectId, direction, distance, allEntities) {
  const entity = allEntities.find(e => e.id === subjectId);
  if (!entity) return fail("Could not determine who to move");

  const speed = entity.stats?.movementSpeed ?? 6;
  const steps = Math.min(distance || speed, speed);
  const delta = directionDelta(direction);

  const path = [];
  let cx = entity.position.x;
  let cy = entity.position.y;

  for (let i = 0; i < steps; i++) {
    cx += delta.dx;
    cy += delta.dy;
    // Basic bounds check — engine will validate fully
    if (cx < 0 || cy < 0) break;
    if (state.map?.grid?.size) {
      if (cx >= state.map.grid.size.width || cy >= state.map.grid.size.height) break;
    }
    path.push({ x: cx, y: cy });
  }

  if (path.length === 0) {
    return fail(`Cannot move ${direction} — edge of map`);
  }

  return ok(
    [{ type: "MOVE", entityId: subjectId, path }],
    `Moving ${entity.name} ${direction} ${path.length} cell${path.length > 1 ? "s" : ""}`
  );
}

function planApproach(state, subjectId, targetRef, allEntities) {
  const entity = allEntities.find(e => e.id === subjectId);
  if (!entity) return fail("Could not determine who to move");

  const targetId = resolveTarget(state, subjectId, targetRef, allEntities);
  if (!targetId) return fail(`Could not find target: "${targetRef}"`);

  const target = allEntities.find(e => e.id === targetId);
  if (!target) return fail(`Target entity not found: ${targetId}`);

  if (isAdjacent(entity.position, target.position)) {
    return fail(`${entity.name} is already adjacent to ${target.name}`);
  }

  const adjResult = findPathToAdjacent(state, subjectId, targetId);
  const path = adjResult?.path;
  if (!path || path.length === 0) {
    return fail(`No path from ${entity.name} to ${target.name}`);
  }

  // Trim to movement speed
  const speed = entity.stats?.movementSpeed ?? 6;
  const trimmedPath = path.slice(0, speed);

  return ok(
    [{ type: "MOVE", entityId: subjectId, path: trimmedPath }],
    `Moving ${entity.name} toward ${target.name}`
  );
}

function planFlee(state, subjectId, fromRef, allEntities) {
  const entity = allEntities.find(e => e.id === subjectId);
  if (!entity) return fail("Could not determine who to move");

  // Find what we're fleeing from
  const threatId = resolveTarget(state, subjectId, fromRef || TARGET_SELECTORS.NEAREST_HOSTILE, allEntities);
  const threat = threatId ? allEntities.find(e => e.id === threatId) : null;

  if (!threat) {
    return fail("No threat to flee from");
  }

  // Move in the opposite direction from the threat
  const dx = entity.position.x - threat.position.x;
  const dy = entity.position.y - threat.position.y;
  const speed = entity.stats?.movementSpeed ?? 6;

  // Compute flee destination (away from threat)
  let targetX, targetY;
  if (Math.abs(dx) >= Math.abs(dy)) {
    targetX = entity.position.x + (dx >= 0 ? speed : -speed);
    targetY = entity.position.y;
  } else {
    targetX = entity.position.x;
    targetY = entity.position.y + (dy >= 0 ? speed : -speed);
  }

  // Clamp to map bounds
  if (state.map?.grid?.size) {
    targetX = Math.max(0, Math.min(state.map.grid.size.width - 1, targetX));
    targetY = Math.max(0, Math.min(state.map.grid.size.height - 1, targetY));
  }

  const fleeResult = findPath(state, entity.position, { x: targetX, y: targetY }, { entityId: subjectId });
  const fleePath = fleeResult?.path;
  if (!fleePath || fleePath.length === 0) {
    return fail(`${entity.name} cannot flee — no valid escape path`);
  }

  const trimmedPath = fleePath.slice(0, speed);

  return ok(
    [{ type: "MOVE", entityId: subjectId, path: trimmedPath }],
    `${entity.name} flees away from ${threat.name}`
  );
}

function planAttack(state, subjectId, targetRef, allEntities) {
  const entity = allEntities.find(e => e.id === subjectId);
  if (!entity) return fail("Could not determine the attacker");

  const targetId = resolveTarget(state, subjectId, targetRef, allEntities);
  if (!targetId) return fail(`Could not find attack target: "${targetRef}"`);

  const target = allEntities.find(e => e.id === targetId);
  if (!target) return fail(`Target entity not found: ${targetId}`);

  const actions = [];
  let hint = "";

  // If not adjacent, try to move adjacent first
  if (!isAdjacent(entity.position, target.position)) {
    const approachResult = findPathToAdjacent(state, subjectId, targetId);
    const approachPath = approachResult?.path;
    if (approachPath && approachPath.length > 0) {
      const speed = entity.stats?.movementSpeed ?? 6;
      const trimmedPath = approachPath.slice(0, speed);
      actions.push({ type: "MOVE", entityId: subjectId, path: trimmedPath });

      // Check if we'll be adjacent after moving
      const finalPos = trimmedPath[trimmedPath.length - 1];
      if (!isAdjacent(finalPos, target.position)) {
        hint = `Moving ${entity.name} toward ${target.name} (not close enough to attack yet)`;
        return ok(actions, hint);
      }
      hint = `${entity.name} moves to ${target.name} and attacks`;
    } else {
      return fail(`${entity.name} can't reach ${target.name}`);
    }
  } else {
    hint = `${entity.name} attacks ${target.name}`;
  }

  actions.push({ type: "ATTACK", attackerId: subjectId, targetId });
  return ok(actions, hint);
}

function planUseAbility(state, subjectId, abilityRef, targetRef, allEntities) {
  const entity = allEntities.find(e => e.id === subjectId);
  if (!entity) return fail("Could not determine who uses the ability");

  // Resolve ability key from fuzzy name
  const abilityId = resolveAbility(abilityRef, entity);
  if (!abilityId) {
    return fail(`Unknown ability: "${abilityRef}". Known: ${Object.keys(ABILITY_CATALOGUE).join(", ")}`);
  }

  const ability = ABILITY_CATALOGUE[abilityId];

  // Resolve target
  let targetId = null;
  if (ability.targeting === "ally") {
    targetId = resolveTarget(state, subjectId, targetRef || TARGET_SELECTORS.MOST_INJURED_ALLY, allEntities, "ally");
  } else {
    targetId = resolveTarget(state, subjectId, targetRef || TARGET_SELECTORS.NEAREST_HOSTILE, allEntities, "hostile");
  }

  if (!targetId) {
    return fail(`No valid target for ${ability.name}`);
  }

  const target = allEntities.find(e => e.id === targetId);
  const actions = [];
  let hint = "";

  // Check range — if melee ability and not adjacent, approach first
  if (ability.range <= 1 && target && !isAdjacent(entity.position, target.position)) {
    const abilityApproach = findPathToAdjacent(state, subjectId, targetId);
    const abilityPath = abilityApproach?.path;
    if (abilityPath && abilityPath.length > 0) {
      const speed = entity.stats?.movementSpeed ?? 6;
      const trimmedPath = abilityPath.slice(0, speed);
      actions.push({ type: "MOVE", entityId: subjectId, path: trimmedPath });

      const finalPos = trimmedPath[trimmedPath.length - 1];
      if (!isAdjacent(finalPos, target.position)) {
        hint = `Moving ${entity.name} toward ${target.name} to use ${ability.name} (not close enough yet)`;
        return ok(actions, hint);
      }
    } else {
      return fail(`${entity.name} can't reach ${target.name} for ${ability.name}`);
    }
  }

  actions.push({
    type: "USE_ABILITY",
    entityId: subjectId,
    abilityId,
    targetId,
  });

  hint = `${entity.name} uses ${ability.name} on ${target?.name || targetId}`;
  return ok(actions, hint);
}

function planDefend(state, subjectId) {
  const entityId = subjectId || state.combat?.activeEntityId;
  if (!entityId) {
    return fail("No active entity to defend");
  }
  return ok(
    [{ type: "DEFEND", entityId }],
    `${entityId} takes a defensive posture (+2 AC until next turn)`
  );
}

function planCompound(state, steps, allEntities) {
  const allActions = [];
  const hints = [];

  // Project state forward between sub-steps so each step plans
  // from the correct entity positions (e.g., "go north 3 then east 2")
  let projectedState = state;

  for (const step of steps) {
    const subPlan = planFromIntent(projectedState, step);
    if (subPlan.ok) {
      allActions.push(...subPlan.actions);
      hints.push(subPlan.narrationHint);

      // Project entity positions forward for next sub-step
      projectedState = projectStateAfterActions(projectedState, subPlan.actions);
    }
    // Continue even if a sub-step fails — partial execution is fine
  }

  if (allActions.length === 0) {
    return fail("No valid actions in compound command");
  }

  return ok(allActions, hints.join(", then "));
}

/**
 * Create a lightweight projected state after applying MOVE actions.
 * Only updates entity positions — does NOT run full engine validation.
 * Used by planCompound to give each sub-step the correct starting position.
 */
function projectStateAfterActions(state, actions) {
  let projected = state;

  for (const action of actions) {
    if (action.type === "MOVE" && action.path?.length > 0) {
      const finalPos = action.path[action.path.length - 1];
      projected = projectEntityPosition(projected, action.entityId, finalPos);
    }
  }

  return projected;
}

/**
 * Return a new state with one entity's position updated.
 * Shallow-clones only the necessary layers (entities → players/npcs arrays → entity).
 */
function projectEntityPosition(state, entityId, newPos) {
  const updateList = (list) =>
    list?.map(e => e.id === entityId ? { ...e, position: { ...newPos } } : e) ?? [];

  return {
    ...state,
    entities: {
      ...state.entities,
      players: updateList(state.entities?.players),
      npcs: updateList(state.entities?.npcs),
      objects: state.entities?.objects ?? [],
    },
  };
}

// ── Entity Resolution ────────────────────────────────────────────────

/**
 * Get all living entities from state.
 */
function getAllEntities(state) {
  return [
    ...(state.entities?.players ?? []),
    ...(state.entities?.npcs ?? []),
    ...(state.entities?.objects ?? []),
  ];
}

/**
 * Resolve the subject (who performs the action).
 * Returns entity ID.
 */
function resolveSubject(state, subjectRef, allEntities) {
  if (!subjectRef || subjectRef === TARGET_SELECTORS.ACTIVE) {
    // In combat → active entity; in exploration → first player
    return state.combat?.mode === "combat"
      ? state.combat.activeEntityId
      : state.entities?.players?.[0]?.id ?? null;
  }
  if (subjectRef === TARGET_SELECTORS.SELF) {
    return state.combat?.activeEntityId ?? state.entities?.players?.[0]?.id ?? null;
  }

  // Fuzzy match
  const entity = findEntityFuzzy(allEntities, subjectRef);
  return entity?.id ?? null;
}

/**
 * Resolve a target reference to an entity ID.
 * Handles tactical selectors and fuzzy name matching.
 *
 * @param {string} [preference] — "hostile" or "ally" to filter
 */
function resolveTarget(state, subjectId, targetRef, allEntities, preference) {
  if (!targetRef) return null;

  const subject = allEntities.find(e => e.id === subjectId);
  if (!subject) return null;

  const living = allEntities.filter(e =>
    !e.conditions?.includes("dead") &&
    e.id !== subjectId &&
    e.kind !== "object"
  );

  // Determine factions
  const subjectFaction = subject.kind; // "player" or "npc"
  const hostiles = living.filter(e => e.kind !== subjectFaction);
  const allies = living.filter(e => e.kind === subjectFaction);

  // Tactical selectors
  if (isTacticalSelector(targetRef)) {
    switch (targetRef) {
      case TARGET_SELECTORS.NEAREST_HOSTILE:
        return nearest(subject, hostiles)?.id ?? null;
      case TARGET_SELECTORS.WEAKEST_HOSTILE:
        return weakest(hostiles)?.id ?? null;
      case TARGET_SELECTORS.STRONGEST_HOSTILE:
        return strongest(hostiles)?.id ?? null;
      case TARGET_SELECTORS.MOST_INJURED_ALLY:
        return mostInjured(allies)?.id ?? null;
      case TARGET_SELECTORS.NEAREST_ALLY:
        return nearest(subject, allies)?.id ?? null;
      default:
        return null;
    }
  }

  // Fuzzy name match — prefer the right faction if specified
  const preferred = preference === "ally" ? allies :
                    preference === "hostile" ? hostiles :
                    living;
  const match = findEntityFuzzy(preferred, targetRef) || findEntityFuzzy(living, targetRef);
  return match?.id ?? null;
}

// ── Ability Resolution ───────────────────────────────────────────────

/**
 * Resolve a fuzzy ability reference to a catalogue key.
 * Checks entity's abilities first, then falls back to global catalogue.
 */
function resolveAbility(abilityRef, entity) {
  if (!abilityRef) return null;
  const ref = abilityRef.toLowerCase().replace(/[\s_-]+/g, "");

  // Direct catalogue match
  for (const [key, ability] of Object.entries(ABILITY_CATALOGUE)) {
    const normKey = key.toLowerCase().replace(/[\s_-]+/g, "");
    const normName = ability.name.toLowerCase().replace(/[\s_-]+/g, "");
    if (normKey === ref || normName === ref || normKey.includes(ref) || ref.includes(normKey)) {
      return key;
    }
  }

  // Check entity's own abilities (if they have ability IDs)
  if (entity?.abilities) {
    for (const abilityId of entity.abilities) {
      const normId = abilityId.toLowerCase().replace(/[\s_-]+/g, "");
      if (normId === ref || normId.includes(ref) || ref.includes(normId)) {
        return abilityId;
      }
    }
  }

  return null;
}

// ── Fuzzy Entity Matching ────────────────────────────────────────────

/**
 * Fuzzy entity match: exact > partial name > partial id > first-word.
 */
function findEntityFuzzy(entities, query) {
  if (!query || !entities?.length) return null;
  const q = query.toLowerCase().replace(/^the\s+/, "").trim();
  if (!q) return null;

  // 1. Exact name or id
  const exact = entities.find(e =>
    e.id.toLowerCase() === q || e.name.toLowerCase() === q
  );
  if (exact) return exact;

  // 2. Partial: name includes query or query includes name fragment
  const partial = entities.find(e => {
    const name = e.name.toLowerCase();
    const id = e.id.toLowerCase();
    return name.includes(q) || id.includes(q) || q.includes(name);
  });
  if (partial) return partial;

  // 3. First-word match (e.g. "goblin" matches "Goblin Sneak")
  const firstWord = entities.find(e => {
    const words = e.name.toLowerCase().split(/\s+/);
    return words.some(w => w === q || q === w);
  });
  if (firstWord) return firstWord;

  // 4. ID fragment without prefix (e.g. "miri" matches "pc-miri")
  const idFrag = entities.find(e => {
    const idParts = e.id.toLowerCase().split("-");
    return idParts.some(p => p === q || p.includes(q));
  });
  return idFrag || null;
}

// ── Tactical Helpers ─────────────────────────────────────────────────

function chebyshev(a, b) {
  return Math.max(Math.abs(a.position.x - b.position.x), Math.abs(a.position.y - b.position.y));
}

function nearest(subject, candidates) {
  if (!candidates.length) return null;
  return candidates.reduce((best, c) =>
    chebyshev(subject, c) < chebyshev(subject, best) ? c : best
  );
}

function weakest(candidates) {
  if (!candidates.length) return null;
  return candidates.reduce((best, c) =>
    (c.stats?.hpCurrent ?? Infinity) < (best.stats?.hpCurrent ?? Infinity) ? c : best
  );
}

function strongest(candidates) {
  if (!candidates.length) return null;
  return candidates.reduce((best, c) =>
    (c.stats?.hpCurrent ?? 0) > (best.stats?.hpCurrent ?? 0) ? c : best
  );
}

function mostInjured(candidates) {
  if (!candidates.length) return null;
  return candidates.reduce((best, c) => {
    const cRatio = (c.stats?.hpCurrent ?? 0) / (c.stats?.hpMax ?? 1);
    const bRatio = (best.stats?.hpCurrent ?? 0) / (best.stats?.hpMax ?? 1);
    return cRatio < bRatio ? c : best;
  });
}

function directionDelta(direction) {
  switch (direction) {
    case DIRECTIONS.NORTH: return { dx: 0, dy: -1 };
    case DIRECTIONS.SOUTH: return { dx: 0, dy: 1 };
    case DIRECTIONS.EAST:  return { dx: 1, dy: 0 };
    case DIRECTIONS.WEST:  return { dx: -1, dy: 0 };
    default: return { dx: 0, dy: 0 };
  }
}

// ── Result Builders ──────────────────────────────────────────────────

function ok(actions, narrationHint) {
  return { ok: true, actions, narrationHint };
}

function fail(error) {
  return { ok: false, actions: [], narrationHint: "", error };
}
