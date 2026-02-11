/**
 * abilityValidator.mjs — Phase 6.2 Ability System Validator.
 *
 * Validates ability_uses from an AI GM response against current state
 * and abilities catalogue. Purely additive — if absent, skipped entirely.
 *
 * @module abilityValidator
 */

import { V } from "../core/violationCodes.mjs";

/**
 * Chebyshev distance (diagonal movement).
 */
function gridDistance(a, b) {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/**
 * @param {object[]} abilityUses     - The ability_uses array from AI response
 * @param {object}   state           - Current game state
 * @returns {{ valid: boolean, errors: { code: string, message: string, path: string }[] }}
 */
export function validateAbilityUses(abilityUses, state) {
  const errors = [];
  if (!Array.isArray(abilityUses)) {
    errors.push({ code: V.ABILITY_RESOLUTION_FAILED, message: "ability_uses must be an array", path: "ability_uses" });
    return { valid: false, errors };
  }

  const entityMap = new Map((state.entities ?? []).map((e) => [e.id, e]));
  const catalogue = state.abilities_catalogue ?? {};
  const seenIds = new Set();

  // Build actor cooldown/resource snapshot (will be consumed as we validate in order)
  const resourceSnap = new Map();
  const cooldownSnap = new Map();
  for (const e of state.entities ?? []) {
    resourceSnap.set(e.id, { ...(e.resources ?? {}) });
    cooldownSnap.set(e.id, { ...(e.cooldowns ?? {}) });
  }

  for (let i = 0; i < abilityUses.length; i++) {
    const use = abilityUses[i];
    const path = `ability_uses[${i}]`;

    // ── Duplicate use_id ───────────────────────────────────────────
    if (seenIds.has(use.use_id)) {
      errors.push({ code: V.ABILITY_DUPLICATE_USE_ID, message: `Duplicate use_id "${use.use_id}"`, path });
    }
    seenIds.add(use.use_id);

    // ── Actor must exist ───────────────────────────────────────────
    const actor = entityMap.get(use.actor_id);
    if (!actor) {
      errors.push({ code: V.ABILITY_ACTOR_NOT_FOUND, message: `Actor "${use.actor_id}" not found`, path });
      continue; // can't validate further
    }

    // ── Ability must be known ──────────────────────────────────────
    const abilityDef = catalogue[use.ability_id];
    if (!abilityDef) {
      errors.push({ code: V.ABILITY_NOT_KNOWN, message: `Ability "${use.ability_id}" not in catalogue`, path });
      continue;
    }

    // ── Actor must have this ability ───────────────────────────────
    const actorAbilities = actor.ability_ids ?? [];
    if (!actorAbilities.includes(use.ability_id)) {
      errors.push({ code: V.ABILITY_NOT_KNOWN, message: `Actor "${use.actor_id}" does not have ability "${use.ability_id}"`, path });
      continue;
    }

    // ── Targeting validation ───────────────────────────────────────
    const targeting = abilityDef.targeting ?? "SELF";
    const targets = use.targets ?? [];

    if (targeting === "SELF") {
      // No targets needed
    } else if (targeting === "SINGLE_ENEMY" || targeting === "SINGLE_ALLY") {
      if (targets.length !== 1) {
        errors.push({ code: V.ABILITY_TARGET_COUNT_INVALID, message: `${targeting} requires exactly 1 target, got ${targets.length}`, path });
      } else if (!entityMap.has(targets[0])) {
        errors.push({ code: V.ABILITY_TARGET_INVALID, message: `Target "${targets[0]}" not found`, path });
      }
    } else if (targeting === "MULTI") {
      for (const t of targets) {
        if (!entityMap.has(t)) {
          errors.push({ code: V.ABILITY_TARGET_INVALID, message: `Target "${t}" not found`, path });
        }
      }
    } else if (targeting === "AREA" || targeting === "POSITION") {
      const positions = use.target_positions ?? [];
      if (positions.length === 0) {
        errors.push({ code: V.ABILITY_TARGET_COUNT_INVALID, message: `${targeting} requires at least 1 target_position`, path });
      }
    }

    // ── Range validation ───────────────────────────────────────────
    const range = abilityDef.range ?? {};
    if (range.type && range.type !== "SELF" && range.distance != null && actor.position) {
      for (const tid of targets) {
        const target = entityMap.get(tid);
        if (target?.position) {
          const dist = gridDistance(actor.position, target.position);
          if (dist > range.distance) {
            errors.push({ code: V.ABILITY_RANGE_INVALID, message: `Target "${tid}" at distance ${dist} exceeds range ${range.distance}`, path });
          }
        }
      }
    }

    // ── Cost validation ────────────────────────────────────────────
    const cost = abilityDef.cost ?? {};
    const actorRes = resourceSnap.get(use.actor_id) ?? {};

    if (cost.mana != null) {
      const current = actorRes.mana ?? 0;
      if (current < cost.mana) {
        errors.push({ code: V.ABILITY_COST_INSUFFICIENT, message: `Actor "${use.actor_id}" has ${current} mana, needs ${cost.mana}`, path });
      } else {
        actorRes.mana = current - cost.mana; // consume for subsequent validations
      }
    }
    if (cost.ap != null) {
      const current = actorRes.ap ?? 0;
      if (current < cost.ap) {
        errors.push({ code: V.ABILITY_COST_INSUFFICIENT, message: `Actor "${use.actor_id}" has ${current} ap, needs ${cost.ap}`, path });
      } else {
        actorRes.ap = current - cost.ap;
      }
    }

    // ── Cooldown validation ────────────────────────────────────────
    if (cost.cooldown != null && cost.cooldown > 0) {
      const cd = cooldownSnap.get(use.actor_id) ?? {};
      const remaining = cd[use.ability_id] ?? 0;
      if (remaining > 0) {
        errors.push({ code: V.ABILITY_COOLDOWN_ACTIVE, message: `Ability "${use.ability_id}" on cooldown (${remaining} turns remaining)`, path });
      } else {
        cd[use.ability_id] = cost.cooldown; // set cooldown for subsequent validations
        cooldownSnap.set(use.actor_id, cd);
      }
    }
  }

  return { valid: errors.length === 0, errors: errors.length > 0 ? errors : [] };
}
