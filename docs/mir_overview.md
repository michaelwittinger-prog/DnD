# MIR — Make It Real: Overview

## What is MIR?

MIR is the canonical game state model for a hybrid analog-first tabletop RPG with an AI Game Master. The digital system represents tabletop reality — it does not invent hidden rules or replace the physical game. Every piece of state is something that exists on the table or in the shared fiction.

## Architecture Principles

1. **Hybrid analog-first.** The digital system mirrors the physical table. If something is not on the table, it is not in the state.

2. **Determinism.** Same inputs always produce the same state transitions. No hidden randomness unless explicitly seeded.

3. **Schema validates structure, not logic.** The JSON Schema (`mir_gamestate.schema.json`) checks data types, required fields, and value ranges. It does not enforce game rules.

4. **Invariants enforce game rules.** Business logic constraints (e.g., "no two entities on the same cell") are checked by `validateInvariants()`, separate from schema validation. This separation keeps the schema stable and portable.

5. **Everything is JSON-serializable.** The full game state can be saved, loaded, diffed, and transmitted as JSON.

6. **Naming is boring and explicit.** We prefer `hpCurrent` over `hp` and `movementSpeed` over `speed`. No clever inference.

## How GameState Relates to the AI GM Response Schema

The **AI GM Response Schema** (`ai_gm_response.schema.json`) defines what the AI is allowed to *propose*: narration, map updates, state updates, tactical events, ability uses.

The **MIR GameState Schema** (`mir_gamestate.schema.json`) defines the *canonical truth* — the current state of the world.

The flow:
```
Player Intent → AI GM → AI Response (proposal) → Rules Engine → Validated → Apply → New GameState
```

The AI never writes directly to GameState. It proposes changes. The engine validates those proposals against the rules, applies valid ones, and rejects invalid ones. The GameState is always the single source of truth.

## Two-Layer Validation

| Layer | What it checks | Tool |
|-------|---------------|------|
| **Schema validation** | Structure: types, required fields, value ranges, formats | Ajv against `mir_gamestate.schema.json` |
| **Invariant validation** | Logic: unique ids, positions in bounds, combat consistency, HP bounds | `validateInvariants()` in `src/state/validateGameState.mjs` |

Both layers must pass for a state to be considered valid. Schema validation is fast and generic. Invariant validation is game-specific and catches semantic errors that structural validation cannot.

## File Map

```
schemas/
  mir_gamestate.schema.json   — Canonical GameState schema (JSON Schema 2020-12)
  mir_types.schema.json       — Shared type definitions
docs/
  mir_overview.md             — This file
  mir_state_model.md          — Detailed state model documentation
  mir_state_invariants.md     — 25 testable invariants
  mir_action_model.md         — DeclaredAction definitions (MIR 1.4)
  mir_event_model.md          — EngineEvent definitions (MIR 1.4)
  mir_engine_contract.md      — Engine contract and determinism guarantee (MIR 1.4)
src/engine/
  applyAction.mjs             — Core state transition function
  movement.mjs                — MOVE handler
  attack.mjs                  — ATTACK handler
  initiative.mjs              — ROLL_INITIATIVE / END_TURN handlers
  rng.mjs                     — Deterministic PRNG
  errors.mjs                  — Structured error codes
src/state/
  validateGameState.mjs       — Schema + invariant validator
  exampleStates.mjs           — Example states for testing
```
