# MIR Event Model — EngineEvent

> MIR 1.4 · System Design Layer

## Purpose

An **EngineEvent** records *what actually happened* when the engine processed a DeclaredAction. Events capture resolved RNG outputs, computed damage, final positions — everything needed to reproduce the resulting state from the prior state without re-running any logic.

Events are the **single mechanism** through which GameState changes. If a change is not represented by an event, it did not happen.

## Hard Rules

| # | Rule |
|---|------|
| E1 | Events are **append-only**. Once written to `state.log.events`, an event is never modified or deleted. |
| E2 | Events are **immutable**. Their payloads are frozen at creation time. |
| E3 | Every event must contain enough payload data to **deterministically reproduce** the same state mutation given the same prior state. |
| E4 | No state mutation may occur outside the application of an event. Silent mutations are forbidden. |
| E5 | Every successful `applyAction` call appends **one or more** EngineEvents. |
| E6 | Every failed `applyAction` call (where the input state is valid) appends **exactly one** `ACTION_REJECTED` event. |

## Event Structure

All events share this envelope (defined in `mir_types.schema.json` as `logEvent`):

```jsonc
{
  "id":        "evt-0001",                    // unique, sequential
  "timestamp": "2026-02-11T18:00:00.000Z",   // ISO 8601
  "type":      "ATTACK_RESOLVED",             // event discriminator
  "payload":   { /* type-specific data */ }
}
```

## Event Catalogue

### MOVE_APPLIED

Emitted when a MOVE action succeeds. The entity has been relocated.

```jsonc
{
  "type": "MOVE_APPLIED",
  "payload": {
    "entityId":      "pc-seren",
    "path":          [{ "x": 2, "y": 4 }, { "x": 2, "y": 5 }],
    "finalPosition": { "x": 2, "y": 5 }
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `entityId` | string | The entity that moved. |
| `path` | `{x,y}[]` | The exact path walked (each step cardinal). |
| `finalPosition` | `{x,y}` | Where the entity ended up. Redundant with last path entry, included for convenience. |

**Reproducibility:** Given prior state, set `entity.position = finalPosition`.

### ATTACK_RESOLVED

Emitted when an ATTACK action succeeds (regardless of hit or miss). Contains all RNG outputs.

```jsonc
{
  "type": "ATTACK_RESOLVED",
  "payload": {
    "attackerId":    "pc-seren",
    "targetId":      "npc-barkeep",
    "attackRoll":    17,
    "targetAc":      10,
    "hit":           true,
    "damage":        4,
    "targetHpAfter": 4
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `attackerId` | string | Who attacked. |
| `targetId` | string | Who was attacked. |
| `attackRoll` | integer | The d20 result (1–20). |
| `targetAc` | integer | Target's AC at the time of the attack. |
| `hit` | boolean | `attackRoll >= targetAc`. |
| `damage` | integer | Damage dealt (0 on miss). |
| `targetHpAfter` | integer | Target's `hpCurrent` after damage application. |

**Reproducibility:** Given prior state:
1. If `hit`: set `target.stats.hpCurrent = targetHpAfter`. If `targetHpAfter === 0`, add `"dead"` condition.
2. If `!hit`: no entity state changes.
3. RNG audit trail is updated via the recorded roll values.

### INITIATIVE_ROLLED

Emitted when ROLL_INITIATIVE transitions the game from exploration to combat.

```jsonc
{
  "type": "INITIATIVE_ROLLED",
  "payload": {
    "order": [
      { "entityId": "pc-seren",     "roll": 18 },
      { "entityId": "npc-barkeep",  "roll": 12 }
    ]
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `order` | `{entityId, roll}[]` | Participants sorted by descending roll, ties broken by entity id ascending. |

**Reproducibility:** Given prior state:
1. Set `combat.mode = "combat"`, `combat.round = 1`.
2. Set `combat.initiativeOrder = order.map(o => o.entityId)`.
3. Set `combat.activeEntityId = order[0].entityId`.

### TURN_ENDED

Emitted when END_TURN advances the initiative to the next entity.

```jsonc
{
  "type": "TURN_ENDED",
  "payload": {
    "entityId":     "pc-seren",
    "nextEntityId": "npc-barkeep",
    "round":        1
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `entityId` | string | Whose turn just ended. |
| `nextEntityId` | string | Whose turn it now is. |
| `round` | integer | The round number after advancement (increments when wrapping). |

**Reproducibility:** Given prior state:
1. Set `combat.activeEntityId = nextEntityId`.
2. Set `combat.round = round`.

### ACTION_REJECTED

Emitted when a valid input state receives an action that fails validation or execution.

```jsonc
{
  "type": "ACTION_REJECTED",
  "payload": {
    "action":  { "type": "MOVE", "entityId": "pc-seren" },
    "reasons": [
      "[BLOCKED_CELL] Step 0: (3,2) is blocked terrain"
    ]
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `action` | object | Summary of the rejected action (always includes `type`, may include identifying fields). |
| `reasons` | `string[]` | Human-readable rejection reasons with error codes. |

**Reproducibility:** No state mutation. Game-meaningful state (entities, combat, map, RNG) is identical to prior state. Only the log has the new rejection entry.

## Event Flow Diagram

```
DeclaredAction
      │
      ▼
 ┌─────────────┐
 │ applyAction  │
 │  (engine)    │
 └──────┬──────┘
        │
   ┌────┴────┐
   │         │
success    failure
   │         │
   ▼         ▼
1+ events   1 ACTION_REJECTED
   │         │
   ▼         ▼
append to state.log.events
   │
   ▼
return { nextState, events, success }
```

## StateMutation — The Third Layer

A **StateMutation** is the deterministic application of an EngineEvent's payload to GameState. It is not a separate data structure — it is the code path inside each engine handler that writes to the cloned state.

The contract is:

```
StateMutation(priorState, event) → nextState
```

Given the same `priorState` and the same `event`, the resulting `nextState` is **always identical**. There is no hidden randomness at the mutation layer — all RNG is resolved before the event is created.

| Event | Mutation |
|-------|----------|
| `MOVE_APPLIED` | `entity.position = finalPosition` |
| `ATTACK_RESOLVED` | `target.stats.hpCurrent = targetHpAfter`; conditionally add `"dead"` |
| `INITIATIVE_ROLLED` | `combat.mode = "combat"`, `round = 1`, populate `initiativeOrder`, set `activeEntityId` |
| `TURN_ENDED` | `combat.activeEntityId = nextEntityId`, `combat.round = round` |
| `ACTION_REJECTED` | No game-state change. Log entry only. |

## Extending the Event Set

To add a new event type:

1. Choose a descriptive `UPPER_CASE` name ending in a past-tense verb (e.g., `SPELL_CAST`, `CONDITION_APPLIED`).
2. Define the payload fields in this document with types and descriptions.
3. Write the "Reproducibility" section — this is the mutation contract.
4. Ensure the handler appends the event to `state.log.events`.
5. Add the corresponding DeclaredAction to `mir_action_model.md`.
