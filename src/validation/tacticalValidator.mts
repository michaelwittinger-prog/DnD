/**
 * tacticalValidator.mjs — Phase 6.1 Deterministic Tactical Events Validator.
 *
 * Validates an optional tactical_events array from an AI GM response
 * against the current game state. Purely additive — if the array is
 * absent, validation is skipped entirely (backward compatible).
 *
 * @module tacticalValidator
 */

import { V } from "../core/violationCodes.mjs";

/**
 * @param {object[]} events  - The tactical_events array
 * @param {object}   state   - Current game state
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateTacticalEvents(events, state) {
  const errors = [];

  if (!Array.isArray(events)) {
    errors.push("tactical_events must be an array.");
    return { valid: false, errors };
  }

  const entityIds = new Set((state.entities ?? []).map((e) => e.id));
  const seenEventIds = new Set();

  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    const path = `tactical_events[${i}]`;

    // ── Required fields ────────────────────────────────────────────
    if (!ev.event_id || typeof ev.event_id !== "string") {
      errors.push(`${path}: missing or invalid event_id`);
      continue;
    }
    if (!ev.type || typeof ev.type !== "string") {
      errors.push(`${path}: missing or invalid type`);
      continue;
    }
    if (!ev.actor_id || typeof ev.actor_id !== "string") {
      errors.push(`${path}: missing or invalid actor_id`);
      continue;
    }

    // ── Duplicate event_id ─────────────────────────────────────────
    if (seenEventIds.has(ev.event_id)) {
      errors.push(`${path}: duplicate event_id "${ev.event_id}" [${V.TACTICAL_DUPLICATE_EVENT_ID}]`);
    }
    seenEventIds.add(ev.event_id);

    // ── actor_id must exist in state ───────────────────────────────
    if (!entityIds.has(ev.actor_id)) {
      errors.push(`${path}: actor_id "${ev.actor_id}" not found in game state [${V.TACTICAL_ACTOR_NOT_FOUND}]`);
    }

    // ── Type-specific validation ───────────────────────────────────
    switch (ev.type) {
      case "MOVE":
        if (!ev.position_before || typeof ev.position_before.x !== "number" || typeof ev.position_before.y !== "number") {
          errors.push(`${path}: MOVE requires position_before {x,y} [${V.TACTICAL_MOVE_MISSING_POS}]`);
        }
        if (!ev.position_after || typeof ev.position_after.x !== "number" || typeof ev.position_after.y !== "number") {
          errors.push(`${path}: MOVE requires position_after {x,y} [${V.TACTICAL_MOVE_MISSING_POS}]`);
        }
        break;

      case "ATTACK":
        // ATTACK may reference a target_id (optional but recommended)
        if (ev.target_id && !entityIds.has(ev.target_id)) {
          errors.push(`${path}: target_id "${ev.target_id}" not found [${V.TACTICAL_TARGET_NOT_FOUND}]`);
        }
        break;

      case "DAMAGE":
        if (!ev.target_id) {
          errors.push(`${path}: DAMAGE requires target_id [${V.TACTICAL_DAMAGE_MISSING_TARGET}]`);
        } else if (!entityIds.has(ev.target_id)) {
          errors.push(`${path}: target_id "${ev.target_id}" not found [${V.TACTICAL_TARGET_NOT_FOUND}]`);
        }
        if (typeof ev.value !== "number" || ev.value < 0) {
          errors.push(`${path}: DAMAGE requires value >= 0 [${V.TACTICAL_DAMAGE_NEGATIVE}]`);
        }
        break;

      case "STATUS_APPLY":
        if (!ev.status || typeof ev.status !== "string") {
          errors.push(`${path}: STATUS_APPLY requires status string [${V.TACTICAL_STATUS_MISSING}]`);
        }
        if (typeof ev.duration !== "number" || ev.duration < 1) {
          errors.push(`${path}: STATUS_APPLY requires duration > 0 [${V.TACTICAL_STATUS_DURATION}]`);
        }
        break;

      case "STATUS_REMOVE":
        if (!ev.status || typeof ev.status !== "string") {
          errors.push(`${path}: STATUS_REMOVE requires status string [${V.TACTICAL_STATUS_MISSING}]`);
        }
        break;

      case "TURN_START":
      case "TURN_END":
        if (ev.position_before || ev.position_after) {
          errors.push(`${path}: ${ev.type} must not contain movement data [${V.TACTICAL_TURN_HAS_MOVEMENT}]`);
        }
        if (typeof ev.value === "number") {
          errors.push(`${path}: ${ev.type} must not contain damage data [${V.TACTICAL_TURN_HAS_DAMAGE}]`);
        }
        break;

      case "ROUND_END":
        // No additional constraints beyond required fields
        break;

      default:
        errors.push(`${path}: unknown tactical event type "${ev.type}"`);
    }
  }

  return { valid: errors.length === 0, errors: errors.length > 0 ? errors : undefined };
}
