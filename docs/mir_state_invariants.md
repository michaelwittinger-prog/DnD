# MIR GameState Invariants

These invariants must hold for any valid MIR GameState. They are checked programmatically by `validateInvariants()` in `src/state/validateGameState.mjs`, separate from JSON Schema structural validation.

Invariant violations indicate a bug in the engine or an invalid AI response that was incorrectly applied.

---

## Entity Invariants

| # | Code | Rule |
|---|------|------|
| 1 | `UNIQUE_ENTITY_IDS` | All entity ids must be unique across players, npcs, and objects. |
| 2 | `ENTITY_KIND_MATCH` | Each entity's `kind` must match the array it belongs to: players→"player", npcs→"npc", objects→"object". |
| 3 | `HP_BOUNDS` | For every entity: `0 ≤ hpCurrent ≤ hpMax`. |
| 4 | `HP_MAX_POSITIVE` | `hpMax ≥ 1` for all entities. |
| 5 | `POSITION_IN_BOUNDS` | Every entity's position `(x, y)` must satisfy `0 ≤ x < map.grid.size.width` and `0 ≤ y < map.grid.size.height`. |
| 6 | `NO_SOLID_OVERLAP` | No two entities of size S or M may occupy the same cell. (Large entities occupy 2×2 and must not overlap with any other entity.) |
| 7 | `NO_ENTITY_ON_BLOCKED` | No entity may be positioned on a tile with terrain "blocked". |
| 8 | `CONDITIONS_NON_EMPTY_STRINGS` | Every condition string in an entity's conditions array must be non-empty (no `""`). |
| 9 | `INVENTORY_IDS_UNIQUE_PER_ENTITY` | Within a single entity, all inventory item ids must be unique. |
| 10 | `INVENTORY_QTY_NON_NEGATIVE` | All inventory item quantities must be `≥ 0`. |

## Combat Invariants

| # | Code | Rule |
|---|------|------|
| 11 | `COMBAT_MODE_CONSISTENCY` | If `combat.mode === "exploration"`, then `round === 0`, `activeEntityId === null`, and `initiativeOrder` is empty. |
| 12 | `COMBAT_ACTIVE_ENTITY_EXISTS` | If `combat.mode === "combat"`, then `activeEntityId` must be non-null and reference an existing entity. |
| 13 | `COMBAT_INITIATIVE_ENTITIES_EXIST` | Every id in `initiativeOrder` must correspond to an existing entity. |
| 14 | `COMBAT_ACTIVE_IN_INITIATIVE` | If in combat, `activeEntityId` must appear in `initiativeOrder`. |
| 15 | `COMBAT_INITIATIVE_UNIQUE` | No duplicate ids in `initiativeOrder`. |
| 16 | `COMBAT_ROUND_POSITIVE` | If `combat.mode === "combat"`, then `round ≥ 1`. |

## Map Invariants

| # | Code | Rule |
|---|------|------|
| 17 | `TERRAIN_IN_BOUNDS` | Every terrain tile `(x, y)` must satisfy `0 ≤ x < width` and `0 ≤ y < height`. |
| 18 | `TERRAIN_NO_DUPLICATES` | No two terrain entries may share the same `(x, y)` coordinate. |
| 19 | `MAP_SIZE_POSITIVE` | `map.grid.size.width ≥ 1` and `map.grid.size.height ≥ 1`. |

## Log Invariants

| # | Code | Rule |
|---|------|------|
| 20 | `LOG_IDS_UNIQUE` | All log event ids must be unique. |
| 21 | `LOG_CHRONOLOGICAL` | Log events must be in chronological order (each timestamp ≥ previous). |

## RNG Invariants

| # | Code | Rule |
|---|------|------|
| 22 | `RNG_SEED_REQUIRED_WHEN_SEEDED` | If `rng.mode === "seeded"`, then `rng.seed` must be a non-empty string. |
| 23 | `RNG_ROLL_VALUES_VALID` | Every roll in `lastRolls` must have `1 ≤ value ≤ max`. |

## UI Invariants

| # | Code | Rule |
|---|------|------|
| 24 | `UI_SELECTED_ENTITY_EXISTS` | If `ui.selectedEntityId` is not null, it must reference an existing entity. |
| 25 | `UI_HOVERED_CELL_IN_BOUNDS` | If `ui.hoveredCell` is not null, it must be within map bounds. |
