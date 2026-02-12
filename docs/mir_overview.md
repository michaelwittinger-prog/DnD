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
| **Schema validation** | Structure: types, required fields, value ranges, formats | Pre-compiled standalone validator (zero runtime deps) |
| **Invariant validation** | Logic: unique ids, positions in bounds, combat consistency, HP bounds | `validateInvariants()` in `src/state/validation/invariants.mjs` |

Both layers must pass for a state to be considered valid. Schema validation is fast and generic. Invariant validation is game-specific and catches semantic errors that structural validation cannot.

### Isomorphic Validation (MIR 2.2)

As of MIR 2.2, schema validation uses a **pre-compiled standalone validator** (`src/state/validation/compiledValidate.mjs`) with zero runtime dependencies. This module works identically in Node and the browser — no importmap shims, no Ajv at runtime.

- **Compile**: `node scripts/compile-schemas.mjs` — run whenever schemas change
- **Canonical module**: `src/state/validation/index.mjs` — exports `validateGameState()`, `validateInvariants()`, `validateAll()`
- Old files (`src/state/validateGameState.mjs`, `src/ui/validateShim.mjs`) are kept as deprecated re-exports

### AI Integration (MIR 3.1)

As of MIR 3.1, the system includes an AI proposal layer that converts natural language
player commands into structured DeclaredAction objects. The AI cannot mutate state — it
only proposes actions that the engine validates and executes. See `docs/mir_ai_integration.md`.

- `src/ai/aiPromptTemplate.mjs` — builds sanitized prompt (no RNG seed exposed)
- `src/ai/aiActionParser.mjs` — safety layer: strict JSON parse, type whitelist, field stripping
- `src/ai/aiClient.mjs` — orchestrates AI→parser→engine flow (API + mock modes)
- `src/server/aiBridge.mjs` — local HTTP bridge (MIR 3.3): keeps API key server-side, rate limiting, CORS

## File Map

> Last updated: 2026-02-12 (932 tests, 17 engine modules)

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
  mir_ai_integration.md       — AI proposal flow and safety layer (MIR 3.1)
  mir_replay_format.md        — Replay bundle format and runner (MIR 3.4)
  mir_mvp_status.md           — Living status: features, test counts, limitations
  mir_mvp_quickstart.md       — Quick start guide
  mir_product_roadmap.md      — Full market pipeline from MVP to production
  mir_demo_script.md          — Live demo walkthrough
  mir_positioning.md          — Market positioning
  mir_dev_practices.md        — AI session practices, timeout prevention

CHANGELOG.md                  — Session-by-session development record

src/core/
  logger.mjs                  — Structured logging (info/warn/error)
  assert.mjs                  — Runtime assertion helpers
  violationCodes.mjs          — Machine-readable violation codes
  index.mjs                   — Core barrel export

src/engine/
  index.mjs                   — Engine barrel export (all 17 modules)
  applyAction.mjs             — Core state transition function (action router)
  movement.mjs                — MOVE handler (cardinal, bounds, blocked, overlap)
  attack.mjs                  — ATTACK handler (d20 vs AC, damage, death)
  initiative.mjs              — ROLL_INITIATIVE / END_TURN handlers
  rng.mjs                     — Deterministic PRNG (seeded, counter-based)
  errors.mjs                  — Structured error codes
  pathfinding.mjs             — A* pathfinding (cardinal, blocked terrain, occupied cells)
  combatEnd.mjs               — Death handling, faction elimination, combat end detection
  npcTurnStrategy.mjs         — NPC AI: chase nearest hostile, attack if adjacent
  narrateEvent.mjs            — Human-readable event descriptions
  combatController.mjs        — Full NPC turn execution loop, multi-round simulation
  conditions.mjs              — 6 conditions, duration tracking, start/end-of-turn processing
  abilities.mjs               — 5 abilities, USE_ABILITY action, range/targeting/cooldown

src/ai/
  aiPromptTemplate.mjs        — Prompt builder (sanitized state + action schema)
  aiActionParser.mjs          — Safety layer: JSON parse, type whitelist, field strip
  aiClient.mjs                — AI proposal orchestrator (API + mock modes)
  index.mjs                   — AI barrel export

src/server/
  aiBridge.mjs                — Local AI bridge server (MIR 3.3, port 3002)
  localApiServer.mjs          — Local API server (port 3030)

src/replay/
  hash.mjs                    — Deterministic state hashing (FNV-1a, canonical JSON)
  runReplay.mjs               — Replay runner (schema + invariant + hash verification)

src/state/
  validateGameState.mjs       — DEPRECATED: re-exports from validation/index.mjs
  exampleStates.mjs           — Example states for testing
  index.mjs                   — State barrel export
  validation/
    index.mjs                 — Unified validation: validateGameState, validateInvariants, validateAll
    invariants.mjs            — 25 game-rule invariant checks
    compiledValidate.mjs      — AUTO-GENERATED standalone schema validator (zero deps)

src/scenarios/
  listScenarios.mjs           — Scenario file listing
  loadScenario.mjs            — Scenario loader with validation

src/ui/
  index.html                  — Browser UI shell
  main.mjs                    — UI entry point (wires engine + renderers + input)
  inputController.mjs         — Input handler (click-to-move/attack, dispatches actions)
  renderGrid.mjs              — Grid renderer (terrain, highlights)
  renderTokens.mjs            — Token renderer (HP bars, selection, damage floaters)
  styles.css                  — UI styles (narration panel, HP bars, floaters)
  validateShim.mjs            — DEPRECATED: re-exports from validation/index.mjs
  serve.mjs                   — Dev server (auto-kill stale port, graceful shutdown)

scripts/
  compile-schemas.mjs         — Pre-compiles schemas into compiledValidate.mjs
  run-replay.mjs              — CLI replay runner
  start-mvp.mjs               — Single-command MVP launcher
  gen-demo-replay.mjs         — Demo replay generator

tests/                         — 932 tests across 13 suites
  engine_test.mjs             — 95 engine contract tests
  ai_parser_test.mjs          — 82 parser contract tests
  ai_prompt_test.mjs          — 50 prompt snapshot tests
  ai_bridge_test.mjs          — 78 bridge unit tests
  replay_test.mjs             — 40 replay runner tests
  mvp_test.mjs                — 43 MVP integration tests
  scenario_test.mjs           — 53 scenario tests
  foundation_test.mjs         — 154 foundation tests (logger, assert, exports)
  pathfinding_test.mjs        — 95 pathfinding tests
  death_combat_test.mjs       — 48 death/combat end tests
  npc_strategy_test.mjs       — 54 NPC strategy tests
  narration_combat_controller_test.mjs — 44 narration + controller tests
  sprint1_test.mjs            — 96 ability, condition, range tests

scenarios/
  tavern_skirmish.scenario.json   — 3v2 tavern brawl
  corridor_ambush.scenario.json   — Narrow corridor encounter
  open_field_duel.scenario.json   — Open 1v1 duel

replays/
  combat_flow.replay.json     — Full combat flow replay (4 steps)
  rejected_move.replay.json   — Rejected + valid move replay (2 steps)
  demo_showcase.replay.json   — Demo showcase replay
```
