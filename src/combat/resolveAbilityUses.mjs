/**
 * resolveAbilityUses.mjs — Phase 6.2 Deterministic Ability Resolver.
 *
 * Converts validated ability_uses into tactical_events deterministically.
 * Pure function — never mutates original state.
 *
 * @module resolveAbilityUses
 */

import { V } from "../core/violationCodes.mjs";

let _eventCounter = 0;
function nextEventId(useId) {
  return `${useId}-evt-${++_eventCounter}`;
}

/**
 * @param {object}   state        - Current game state (NOT mutated)
 * @param {object[]} abilityUses  - Validated ability_uses array
 * @returns {{ tacticalEvents: object[], updatedState: object, violations: { code: string, message: string, path: string }[] }}
 */
export function resolveAbilityUses(state, abilityUses) {
  if (!abilityUses || abilityUses.length === 0) {
    return { tacticalEvents: [], updatedState: state, violations: [] };
  }

  // Deep clone — pure function
  const next = JSON.parse(JSON.stringify(state));
  const catalogue = next.abilities_catalogue ?? {};
  const entityMap = new Map((next.entities ?? []).map((e) => [e.id, e]));

  const tacticalEvents = [];
  const violations = [];
  _eventCounter = 0;

  for (let i = 0; i < abilityUses.length; i++) {
    const use = abilityUses[i];
    const path = `ability_uses[${i}]`;
    const abilityDef = catalogue[use.ability_id];

    if (!abilityDef) {
      violations.push({ code: V.ABILITY_RESOLUTION_FAILED, message: `Ability "${use.ability_id}" not in catalogue during resolution`, path });
      continue;
    }

    const actor = entityMap.get(use.actor_id);
    if (!actor) {
      violations.push({ code: V.ABILITY_RESOLUTION_FAILED, message: `Actor "${use.actor_id}" not found during resolution`, path });
      continue;
    }

    // ── Deduct costs from cloned state ─────────────────────────────
    const cost = abilityDef.cost ?? {};
    if (!actor.resources) actor.resources = {};
    if (cost.mana != null) actor.resources.mana = (actor.resources.mana ?? 0) - cost.mana;
    if (cost.ap != null) actor.resources.ap = (actor.resources.ap ?? 0) - cost.ap;
    if (cost.cooldown != null && cost.cooldown > 0) {
      if (!actor.cooldowns) actor.cooldowns = {};
      actor.cooldowns[use.ability_id] = cost.cooldown;
    }

    // ── Resolve effects into tactical_events ───────────────────────
    const effects = abilityDef.effects ?? [];
    let useOk = true;

    for (const effect of effects) {
      try {
        const events = resolveEffect(effect, use, actor, entityMap, next, path);
        tacticalEvents.push(...events);
      } catch (err) {
        violations.push({ code: V.ABILITY_RESOLUTION_FAILED, message: err.message, path });
        useOk = false;
        break;
      }
    }

    if (!useOk) {
      // Rollback: don't apply partial effects for this use
      // (events already pushed will be discarded because violations make the result invalid)
    }
  }

  return { tacticalEvents, updatedState: next, violations };
}

// ── Effect resolvers ───────────────────────────────────────────────────

function resolveEffect(effect, use, actor, entityMap, state, path) {
  switch (effect.type) {
    case "DAMAGE":
      return resolveDamage(effect, use, actor, entityMap, state);
    case "HEAL":
      return resolveHeal(effect, use, actor, entityMap, state);
    case "APPLY_STATUS":
      return resolveApplyStatus(effect, use, actor, entityMap, state);
    case "REMOVE_STATUS":
      return resolveRemoveStatus(effect, use, actor, entityMap, state);
    case "FORCED_MOVE":
      return resolveForcedMove(effect, use, actor, entityMap, state);
    default:
      throw new Error(`Unknown effect type "${effect.type}" in ability "${use.ability_id}"`);
  }
}

function getTargets(use, entityMap) {
  return (use.targets ?? []).map((id) => entityMap.get(id)).filter(Boolean);
}

function resolveDamage(effect, use, actor, entityMap, state) {
  const events = [];
  const targets = getTargets(use, entityMap);
  const value = effect.value ?? (use.parameters?.damage ?? 0);

  for (const target of targets) {
    const currentHp = target.stats?.hp ?? 0;
    const newHp = Math.max(0, currentHp - value);
    target.stats.hp = newHp;

    events.push({
      event_id: nextEventId(use.use_id),
      type: "DAMAGE",
      actor_id: actor.id,
      target_id: target.id,
      value,
    });
  }
  return events;
}

function resolveHeal(effect, use, actor, entityMap, state) {
  const events = [];
  const targets = use.targets?.length ? getTargets(use, entityMap) : [actor]; // SELF default
  const value = effect.value ?? (use.parameters?.heal ?? 0);

  for (const target of targets) {
    const currentHp = target.stats?.hp ?? 0;
    const maxHp = target.stats?.maxHp ?? currentHp;
    const newHp = Math.min(maxHp, currentHp + value);
    target.stats.hp = newHp;

    // Emit as negative DAMAGE (heal) — no HEAL tactical_event type exists,
    // so we re-use DAMAGE with a note. The engine is deterministic.
    events.push({
      event_id: nextEventId(use.use_id),
      type: "DAMAGE",
      actor_id: actor.id,
      target_id: target.id,
      value: -(newHp - currentHp), // negative = heal
    });
  }
  return events;
}

function resolveApplyStatus(effect, use, actor, entityMap, state) {
  const events = [];
  const targets = use.targets?.length ? getTargets(use, entityMap) : [actor];
  const status = effect.status;
  const duration = effect.duration ?? 1;

  for (const target of targets) {
    if (!target.conditions) target.conditions = [];
    if (!target.conditions.includes(status)) {
      target.conditions.push(status);
    }

    events.push({
      event_id: nextEventId(use.use_id),
      type: "STATUS_APPLY",
      actor_id: actor.id,
      target_id: target.id,
      status,
      duration,
    });
  }
  return events;
}

function resolveRemoveStatus(effect, use, actor, entityMap, state) {
  const events = [];
  const targets = use.targets?.length ? getTargets(use, entityMap) : [actor];
  const status = effect.status;

  for (const target of targets) {
    if (target.conditions) {
      target.conditions = target.conditions.filter((c) => c !== status);
    }

    events.push({
      event_id: nextEventId(use.use_id),
      type: "STATUS_REMOVE",
      actor_id: actor.id,
      target_id: target.id,
      status,
    });
  }
  return events;
}

function resolveForcedMove(effect, use, actor, entityMap, state) {
  const events = [];
  const targets = getTargets(use, entityMap);
  const distance = effect.distance ?? 1;
  const direction = effect.direction ?? "push"; // push or pull

  for (const target of targets) {
    if (!target.position || !actor.position) continue;

    const dx = target.position.x - actor.position.x;
    const dy = target.position.y - actor.position.y;
    const mag = Math.max(Math.abs(dx), Math.abs(dy));
    if (mag === 0) continue;

    const nx = dx / mag;
    const ny = dy / mag;
    const sign = direction === "pull" ? -1 : 1;

    const before = { x: target.position.x, y: target.position.y };
    const after = {
      x: Math.max(0, Math.round(target.position.x + sign * nx * distance)),
      y: Math.max(0, Math.round(target.position.y + sign * ny * distance)),
    };

    target.position = after;

    events.push({
      event_id: nextEventId(use.use_id),
      type: "MOVE",
      actor_id: target.id,
      position_before: before,
      position_after: after,
    });
  }
  return events;
}
