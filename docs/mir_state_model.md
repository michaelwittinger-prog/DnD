# MIR GameState Model

This document describes the canonical MIR GameState structure as defined in `schemas/mir_gamestate.schema.json`.

## Top-Level Fields

| Field | Type | Description |
|-------|------|-------------|
| `schemaVersion` | string | Semver version of the schema (e.g., `"0.1.0"`). Used for migration detection. |
| `campaignId` | string | Identifies the campaign this state belongs to. |
| `sessionId` | string | Identifies the current play session. |
| `timestamp` | ISO 8601 string | When this state snapshot was last persisted. |
| `rng` | object | Random number generation configuration and audit trail. |
| `map` | object | The battlemap: grid, terrain, fog of war. |
| `entities` | object | All game entities: players, npcs, objects. |
| `combat` | object | Combat state machine: mode, round, initiative. |
| `log` | object | Immutable event log. |
| `ui` | object | Transient UI state (selection, hover). |

## RNG

| Field | Type | Description |
|-------|------|-------------|
| `mode` | `"manual"` or `"seeded"` | Manual = physical dice, seeded = deterministic PRNG. |
| `seed` | string or null | PRNG seed. Required when mode is seeded. |
| `lastRolls` | array | Audit trail of recent rolls (value, max, label). Newest first. Max 50. |

## Map

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Map identifier. |
| `name` | string | Human-readable map name. |
| `grid.type` | `"square"` | Grid type (only square for now). |
| `grid.size` | `{width, height}` | Grid dimensions in cells. |
| `grid.cellSize` | integer | Physical size per cell in game units (e.g., 5 for 5ft). |
| `terrain` | array of tiles | Sparse terrain list. Unlisted cells are implicitly `"open"`. |
| `fogOfWarEnabled` | boolean | Whether fog of war is active. Default false. |

### Terrain representation

We use a **sparse list** rather than a 2D array. This is more efficient for typical maps where most tiles are open, easier to validate, and simpler to diff.

Each terrain tile has `{x, y, terrain}` where terrain is one of: `"open"`, `"blocked"`, `"difficult"`, `"water"`, `"pit"`.

## Entities

Entities are organized into three typed arrays:

| Array | Entity kind | Typical examples |
|-------|------------|-----------------|
| `players` | `"player"` | PCs controlled by human players |
| `npcs` | `"npc"` | Monsters, allies, NPCs controlled by AI |
| `objects` | `"object"` | Doors, chests, traps, furniture |

### Entity Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Globally unique across all entity arrays. |
| `kind` | enum | Must match the array: `"player"`, `"npc"`, or `"object"`. |
| `name` | string | Display name. |
| `position` | `{x, y, facing?}` | Grid position. Facing is optional (compass direction or null). |
| `size` | `"S"`, `"M"`, `"L"` | Token footprint. S/M = 1 cell, L = 2×2. |
| `stats.hpCurrent` | integer | Current hit points. `0 ≤ hpCurrent ≤ hpMax`. |
| `stats.hpMax` | integer | Maximum hit points. `≥ 1`. |
| `stats.ac` | integer | Armor class. |
| `stats.movementSpeed` | integer | Cells per turn. |
| `conditions` | string[] | Active conditions (e.g., `"prone"`, `"poisoned"`). Free-form, each non-empty. |
| `inventory` | array | Items carried: `{id, name, qty, tags?}`. |
| `token.style` | enum | Physical representation: `"standee"`, `"mini"`, `"pawn"`. |
| `token.spriteKey` | string or null | Sprite asset reference. Null for unstyled. |
| `controller.type` | `"human"` or `"ai"` | Who controls this entity. |
| `controller.playerId` | string or null | Human player id. Null for AI. |

## Combat

| Field | Type | Description |
|-------|------|-------------|
| `mode` | `"exploration"` or `"combat"` | Current game phase. |
| `round` | integer | Current round number. 0 in exploration. |
| `activeEntityId` | string or null | Whose turn it is. Null in exploration. |
| `initiativeOrder` | string[] | Turn order (entity ids). Empty in exploration. |

### Mode transitions

- **exploration → combat**: Set mode to `"combat"`, round to 1, populate `initiativeOrder`, set `activeEntityId` to first in order.
- **combat → exploration**: Set mode to `"exploration"`, round to 0, clear `initiativeOrder`, set `activeEntityId` to null.

## Log

Immutable append-only event log. Each event has:

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique event identifier. |
| `timestamp` | ISO 8601 | When the event occurred. |
| `type` | string | Event classification (e.g., `"move"`, `"attack"`, `"turn_end"`). |
| `payload` | object | Event-specific data. Structure varies by type. |

Events are never deleted or modified. They form the audit trail.

## UI

Transient client-side state. Not part of the game logic but included for completeness and serialization.

| Field | Type | Description |
|-------|------|-------------|
| `selectedEntityId` | string or null | Currently selected entity in the UI. |
| `hoveredCell` | `{x, y}` or null | Cell the cursor is over. |
