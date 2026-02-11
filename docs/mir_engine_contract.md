# MIR Engine Contract

> MIR 1.4 · System Design Layer

## Purpose

This document defines the **exact interface and guarantees** of `applyAction` — the single entry point through which all game-state transitions flow. Any code that changes GameState must go through this function. There are no exceptions.

## Function Signature

```js
applyAction(previousState: GameState, declaredAction: DeclaredAction)
  → { nextState: GameState, events: EngineEvent[], success: boolean, errors?: string[] }
```

| Parameter | Description |
|-----------|-------------|
| `previousState` | The current, valid GameState. Must pass schema and invariant validation. |
| `declaredAction` | A DeclaredAction object (see `mir_action_model.md`). |

| Return field | Description |
|--------------|-------------|
| `nextState` | The resulting GameState. On success, a new object with mutations applied. On action-level failure, a clone with only the ACTION_REJECTED event appended. On state-level failure, the same `previousState` reference. |
| `events` | Array of EngineEvents produced. On success, one or more events. On action-level failure, exactly one ACTION_REJECTED. On state-level failure, empty array. |
| `success` | `true` if the action was accepted. `false` otherwise. |
| `errors` | Human-readable error strings. Present only when `success === false`. |

## Contract Rules

### C1 — Single entry point

`applyAction` is the **only** function that accepts a DeclaredAction and produces a state transition. Nothing else may propose, validate, or apply actions.

### C2 — State validation gate

Before evaluating the action, `applyAction` validates `previousState` against the JSON schema and all invariants. If the state itself is invalid, the function returns immediately:

```js
{ nextState: previousState, events: [], success: false, errors: [...] }
```

No events are emitted. The state is returned by reference, unmodified. This is not an action rejection — it is a precondition failure.

### C3 — Success path

When the action passes all validation and the handler executes successfully:

1. The handler mutates a **deep clone** of `previousState` (never the original).
2. One or more EngineEvents are appended to `clone.log.events`.
3. Post-mutation invariants are validated on the clone.
4. If post-invariants pass, `applyAction` returns:

```js
{ nextState: clone, events: [/* new events */], success: true }
```

### C4 — Failure path (action rejected)

When the input state is valid but the action fails (bad shape, wrong turn, handler rejects, post-invariant violation):

1. A fresh deep clone of `previousState` is created.
2. Exactly one `ACTION_REJECTED` event is appended to the clone's log.
3. No other state fields are modified.
4. `applyAction` returns:

```js
{ nextState: clone, events: [rejectionEvent], success: false, errors: [...] }
```

Game-meaningful state (entities, combat, map, RNG) is identical to `previousState`. Only `log.events` has one additional entry.

### C5 — Reproducibility

Every EngineEvent payload must contain enough data to reproduce the identical `nextState` from `previousState` without re-executing any logic or RNG. Specifically:

- **MOVE_APPLIED**: `finalPosition` is sufficient to set the entity's position.
- **ATTACK_RESOLVED**: `attackRoll`, `damage`, `hit`, `targetHpAfter` fully describe the outcome.
- **INITIATIVE_ROLLED**: `order` (with rolls) fully determines `initiativeOrder` and `activeEntityId`.
- **TURN_ENDED**: `nextEntityId` and `round` fully determine the next combat state.
- **ACTION_REJECTED**: No mutation needed — the payload is for audit only.

### C6 — Immutability of input

`previousState` is **never** mutated by `applyAction`. All work is done on a `structuredClone`. The caller can safely continue using the original state reference after the call returns.

### C7 — Immutability of events

Once an event is appended to `state.log.events`, it is never modified or removed. Events are append-only.

### C8 — No silent mutations

Every change to GameState must be traceable to an EngineEvent in `state.log.events`. If a field changed between `previousState` and `nextState`, there must be a corresponding event whose payload explains that change.

## Determinism Guarantee

```
state + DeclaredAction + seed → identical events + identical nextState
```

Given the same `previousState`, the same `DeclaredAction`, and the same `rng.seed`, `applyAction` will **always** produce:

1. The same `events` array (same types, same payloads, same order).
2. The same `nextState` (byte-for-byte identical when serialized to JSON).

This is enforced by:

- **Seeded PRNG**: All randomness flows through `rng.mjs` using a deterministic LCG seeded from `state.rng.seed`. No `Math.random()` usage.
- **Stable sort**: Initiative ties are broken by entity id (ascending), not by insertion order.
- **No external I/O**: `applyAction` reads no files, makes no network calls, uses no system clock for logic (timestamps come from the state object).
- **structuredClone**: Deep cloning prevents any shared-reference non-determinism.

### Replay verification

The `replayTurn.mjs` pipeline can re-run any stored turn bundle and verify that the computed output matches the stored output. This is the runtime proof of determinism.

## Validation Order

`applyAction` validates in this strict sequence:

| Step | Check | Failure behavior |
|------|-------|-----------------|
| 1 | Schema validation of `previousState` | Return `previousState` unchanged, no events |
| 2 | Invariant validation of `previousState` | Return `previousState` unchanged, no events |
| 3a | Action shape validation | Reject with ACTION_REJECTED event |
| 3b | Turn-order preconditions | Reject with ACTION_REJECTED event |
| 4 | Handler execution (move/attack/initiative/end_turn) | Reject with ACTION_REJECTED event |
| 5 | Post-mutation invariant validation | Reject with ACTION_REJECTED event (rollback) |
| 6 | ✓ Success | Return clone with events |

Early exits at steps 1–2 do not produce events because the state itself is broken — the action was never evaluated.

## Worked Examples

### Example 1: Successful Attack

**Prior state (relevant fields):**
```jsonc
{
  "rng": { "mode": "seeded", "seed": "combat-42", "lastRolls": [] },
  "combat": { "mode": "exploration", "round": 0, "activeEntityId": null, "initiativeOrder": [] },
  "entities": {
    "players": [{
      "id": "pc-seren", "name": "Seren",
      "stats": { "hpCurrent": 12, "hpMax": 12, "ac": 15, "movementSpeed": 6 },
      "conditions": [],
      "position": { "x": 2, "y": 3 }
    }],
    "npcs": [{
      "id": "npc-barkeep", "name": "Barkeep",
      "stats": { "hpCurrent": 8, "hpMax": 8, "ac": 10, "movementSpeed": 4 },
      "conditions": [],
      "position": { "x": 6, "y": 2 }
    }]
  },
  "log": { "events": [] }
}
```

**DeclaredAction:**
```json
{ "type": "ATTACK", "attackerId": "pc-seren", "targetId": "npc-barkeep" }
```

**Engine processing:**

| Step | Result |
|------|--------|
| 1. Schema check | ✓ |
| 2. Invariant check | ✓ |
| 3a. Shape check | ✓ (ATTACK with attackerId + targetId) |
| 3b. Turn order | ✓ (exploration — no turn restriction) |
| 4. Handler | Attacker exists ✓, target exists ✓, neither dead ✓ |
| | Roll d20 (seed-based) → **17** |
| | Compare 17 ≥ target AC 10 → **hit** |
| | Roll 1d6 → **4** |
| | Apply: barkeep hpCurrent = max(0, 8 − 4) = **4** |
| 5. Post-invariant check | ✓ (hpCurrent 4 ≤ hpMax 8) |

**EngineEvent emitted:**
```json
{
  "id": "evt-0001",
  "timestamp": "2026-02-11T18:00:00.000Z",
  "type": "ATTACK_RESOLVED",
  "payload": {
    "attackerId": "pc-seren",
    "targetId": "npc-barkeep",
    "attackRoll": 17,
    "targetAc": 10,
    "hit": true,
    "damage": 4,
    "targetHpAfter": 4
  }
}
```

**Return value:**
```js
{
  nextState: /* clone with barkeep.hpCurrent=4, event appended */,
  events: [/* the ATTACK_RESOLVED event above */],
  success: true
}
```

---

### Example 2: Rejected Move — Blocked Cell

**Prior state (relevant fields):**
```jsonc
{
  "map": {
    "grid": { "type": "square", "size": { "width": 10, "height": 10 }, "cellSize": 5 },
    "terrain": [
      { "x": 3, "y": 2, "type": "blocked", "blocksMovement": true }
    ]
  },
  "entities": {
    "players": [{
      "id": "pc-seren", "name": "Seren",
      "stats": { "hpCurrent": 12, "hpMax": 12, "ac": 15, "movementSpeed": 6 },
      "conditions": [],
      "position": { "x": 2, "y": 2 }
    }]
  },
  "log": { "events": [] }
}
```

**DeclaredAction:**
```json
{ "type": "MOVE", "entityId": "pc-seren", "path": [{ "x": 3, "y": 2 }] }
```

**Engine processing:**

| Step | Result |
|------|--------|
| 1. Schema check | ✓ |
| 2. Invariant check | ✓ |
| 3a. Shape check | ✓ (MOVE with entityId + path) |
| 3b. Turn order | ✓ (exploration — no turn restriction) |
| 4. Handler | Entity exists ✓, not dead ✓, path length 1 ≤ speed 6 ✓ |
| | Step 0: (2,2)→(3,2) is cardinal ✓ |
| | Step 0: (3,2) in bounds ✓ |
| | Step 0: (3,2) is **blocked terrain** ✗ |

**EngineEvent emitted:**
```json
{
  "id": "evt-0001",
  "timestamp": "2026-02-11T18:00:00.000Z",
  "type": "ACTION_REJECTED",
  "payload": {
    "action": { "type": "MOVE", "entityId": "pc-seren" },
    "reasons": ["[BLOCKED_CELL] Step 0: (3,2) is blocked terrain"]
  }
}
```

**Return value:**
```js
{
  nextState: /* clone of previousState with only the rejection event appended to log */,
  events: [/* the ACTION_REJECTED event above */],
  success: false,
  errors: ["[BLOCKED_CELL] Step 0: (3,2) is blocked terrain"]
}
```

Seren's position remains `(2, 2)`. No entity, combat, map, or RNG fields changed. Only `log.events` has the rejection record.

## File Map

```
src/engine/
  applyAction.mjs    — applyAction() — single entry point
  movement.mjs       — applyMove()   — MOVE handler, emits MOVE_APPLIED
  attack.mjs         — applyAttack() — ATTACK handler, emits ATTACK_RESOLVED
  initiative.mjs     — applyRollInitiative(), applyEndTurn() — emits INITIATIVE_ROLLED, TURN_ENDED
  rng.mjs            — rollD20(), rollDice() — deterministic PRNG
  errors.mjs         — ErrorCode enum, makeError()
docs/
  mir_action_model.md   — DeclaredAction definitions
  mir_event_model.md    — EngineEvent definitions
  mir_engine_contract.md — This file
```
