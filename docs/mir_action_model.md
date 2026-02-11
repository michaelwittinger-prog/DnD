# MIR Action Model — DeclaredAction

> MIR 1.4 · System Design Layer

## Purpose

A **DeclaredAction** is the single, structured way for a player or AI to express intent to change game state. Actions are *proposals* — they carry no authority to mutate state on their own. The engine validates, resolves, and either accepts or rejects every action.

## Hard Rules

| # | Rule |
|---|------|
| A1 | Only `applyAction(state, action)` may interpret a DeclaredAction. |
| A2 | The caller never mutates GameState directly — it hands an action to the engine and receives a result. |
| A3 | Actions are pure data (JSON-serializable objects). No callbacks, no side effects. |
| A4 | An action's `type` field determines which engine handler processes it. Unknown types are rejected immediately. |

## Action Catalogue

### MOVE

Move an entity along a cardinal path on the grid.

```jsonc
{
  "type": "MOVE",
  "entityId": "pc-seren",          // entity to move
  "path": [                        // ordered list of cells, each one cardinal step from the previous
    { "x": 2, "y": 4 },
    { "x": 2, "y": 5 }
  ]
}
```

**Preconditions checked by engine:**

| Check | Error code |
|-------|-----------|
| Entity exists | `ENTITY_NOT_FOUND` |
| Entity is not dead | `DEAD_ENTITY` |
| Path length ≤ `movementSpeed` | `OUT_OF_RANGE` |
| Every step is cardinal (Manhattan distance 1) | `DIAGONAL_MOVE` |
| Every cell is within map bounds | `OUT_OF_RANGE` |
| No cell is blocked terrain | `BLOCKED_CELL` |
| No cell is occupied by another entity | `OVERLAP` |
| (Combat) It is this entity's turn | `NOT_YOUR_TURN` |

### ATTACK

One entity attacks another.

```jsonc
{
  "type": "ATTACK",
  "attackerId": "pc-seren",        // who attacks
  "targetId": "npc-barkeep"        // who is attacked
}
```

**Preconditions checked by engine:**

| Check | Error code |
|-------|-----------|
| Attacker ≠ target | `SELF_ATTACK` |
| Attacker exists | `ENTITY_NOT_FOUND` |
| Target exists | `ENTITY_NOT_FOUND` |
| Attacker is not dead | `DEAD_ENTITY` |
| Target is not dead | `TARGET_DEAD` |
| (Combat) It is the attacker's turn | `NOT_YOUR_TURN` |

### ROLL_INITIATIVE

Transition from exploration to combat. Rolls initiative for all living players and NPCs.

```jsonc
{
  "type": "ROLL_INITIATIVE"
}
```

**Preconditions checked by engine:**

| Check | Error code |
|-------|-----------|
| Not already in combat | `COMBAT_ALREADY_ACTIVE` |
| At least one living participant | `NO_PARTICIPANTS` |

### END_TURN

End the current entity's turn and advance to the next in initiative order.

```jsonc
{
  "type": "END_TURN",
  "entityId": "pc-seren"           // whose turn is ending
}
```

**Preconditions checked by engine:**

| Check | Error code |
|-------|-----------|
| Combat is active | `COMBAT_NOT_ACTIVE` |
| It is this entity's turn | `NOT_YOUR_TURN` |

## Type Definition (JSDoc)

```js
/**
 * @typedef {
 *   | { type: "MOVE";            entityId: string; path: { x: number; y: number }[] }
 *   | { type: "ATTACK";          attackerId: string; targetId: string }
 *   | { type: "END_TURN";        entityId: string }
 *   | { type: "ROLL_INITIATIVE" }
 * } DeclaredAction
 */
```

## Who Creates Actions?

| Source | Flow |
|--------|------|
| **Human player** | UI or CLI → DeclaredAction → `applyAction()` |
| **AI GM** | AI response → pipeline extracts DeclaredAction → `applyAction()` |

In both cases the action passes through the same engine validation. There is no privileged path.

## Extending the Action Set

To add a new action type:

1. Add the type string to `VALID_ACTION_TYPES` in `applyAction.mjs`.
2. Add shape validation in `validateActionShape()`.
3. Implement a handler function (`applyXxx`) that mutates a cloned state and appends one or more `EngineEvent` entries to `state.log.events`.
4. Add a `case` in the `applyAction` switch.
5. Document the action in this file and the corresponding event(s) in `mir_event_model.md`.
6. Add tests in `tests/engine_test.mjs`.
