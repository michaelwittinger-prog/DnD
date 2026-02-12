# Canonical Project Context

## Project Summary

We are building a state driven AI Game Master for a hybrid analog tabletop RPG.

Players play primarily offline and analog.
A digital battlemap and an AI GM support the game by managing:

- Explicit game state
- Rules adjudication
- NPC behavior
- Short narrative output

The AI is not freeform.
It operates strictly on explicit state and machine readable contracts.

## Core Principles (Non Negotiable)

- Analog first
- State driven logic
- Deterministic interfaces
- Strict JSON schemas
- Cost predictable design
- MVP discipline

## MVP Scope

### Included

- Static grid battlemap
- Tokens
- Turn based play
- Text based AI GM
- Optional browser native text to speech
- Manual text input from players

### Excluded

- Speech to text
- Animations
- Fog of war
- Full DnD rules
- Asset generation
- Multimodal input
- Persistent campaigns

## Architecture

### Components

- Client: React + TypeScript
- Server: Node.js + TypeScript
- AI GM: Stateless, schema bound

### The AI receives

- Game state snapshot
- Compact event log
- Player action
- Rule profile

### The AI returns

- Narration
- Rule adjudication
- Structured map updates
- Structured state updates

## Repository Structure (Authoritative)

```
ai-gm-rpg/
├─ client/
├─ server/
├─ shared/
│  ├─ schemas/
│  │  ├─ gameState.schema.json
│  │  └─ aiResponse.schema.json
│  ├─ types/
│  └─ rules/
├─ tsconfig.base.json
├─ package.json
└─ PROJECT_CONTEXT.md
```

## Game State

- Single source of truth
- Compact
- Light stats only
- No flavor text
- Event log capped

The Game State Schema already exists and must be used as is.

## AI GM Response Contract (CRITICAL)

The AI GM Response Schema (JSON Schema, draft 2020-12) is finalized.

Rules:

- JSON only
- No markdown
- No extra fields
- No missing fields
- Strict validation

This schema is a hard contract, not a suggestion.

## Cost Control

- No chat history
- State snapshot only
- Event log limited
- Narration length limited
- One AI call per action

## Known Caveats (IMPORTANT)

### 1. IPv6 vs IPv4 — "localhost" is broken on Node.js v24+

Node.js v24+ resolves `localhost` to IPv6 `[::1]` by default.
Chrome tries IPv4 `127.0.0.1` first.
This causes `ERR_CONNECTION_REFUSED` even though the server is running.

**Rule:** Never use `"localhost"` in any server bind, proxy target, or URL.
Always use `"127.0.0.1"` explicitly.

Affected locations (all already fixed):
- `client/vite.config.ts` → `host: '127.0.0.1'`, proxy target `http://127.0.0.1:3001`
- `viewer/vite.config.js` → `host: '127.0.0.1'`
- `server/src/index.ts` → `app.listen(PORT, '127.0.0.1', ...)`

### 2. The `D&D` directory name breaks Windows shell commands

The `&` in `D&D` is interpreted as a command separator by `cmd.exe`.
Commands like `cd D&D && npm run dev` silently fail.

**Rule:** Never use `cd <path> && <command>` in scripts or docs.
All dev servers use Node.js launcher scripts in `scripts/`:
- `scripts/run-client.mjs` — starts Vite client on port 5173
- `scripts/run-server.mjs` — starts Express server on port 3001
- `scripts/run-viewer.mjs` — starts Vite viewer on port 5174

Root `package.json` scripts call these launchers, never `cd && npm run`.

### 3. Dev server URLs

| App    | URL                         | Launcher                    |
|--------|-----------------------------|-----------------------------|
| Client | http://127.0.0.1:5173      | `node scripts/run-client.mjs` |
| Server | http://127.0.0.1:3001      | `node scripts/run-server.mjs` |
| Viewer | http://127.0.0.1:5174      | `node scripts/run-viewer.mjs` |

Always use `127.0.0.1`, never `localhost`.

### 4. Server routes — no /api prefix

The Express server registers routes without an `/api` prefix:
`/state`, `/action`, `/ai-gm`, `/reset`.

The client Vite proxy strips `/api` from requests before forwarding:
`/api/state` → `http://127.0.0.1:3001/state`.

**Rule:** Server routes must never include `/api`. The proxy handles the prefix.

## Phase 3 — Rules Engine (Engine Dominance)

The rules engine sits between AI proposals and state mutation.
It makes illegal AI actions impossible to apply.

### Architecture

```
AI Response → Rules Engine (evaluateProposal) → allowed? → applyAllowedOps → Gatekeeper
                                               → denied?  → violation report, no mutation
```

### Gate order (gatekeeper.js)

1. AI GM Response Schema
2. Rules Legality (new)
3. Schema Version
4. Game State Schema
5. Invariants

### Rules implemented

| Operation       | Rules                                                          |
|-----------------|----------------------------------------------------------------|
| move_entity     | Entity exists, in bounds, not occupied, within budget, max 1x  |
| spawn_entity    | In bounds, empty tile, unique ID, GM authority (always denied)  |
| remove_entity   | Entity exists, HP must be 0 (no GM authority available)        |
| set_hp          | Entity exists, integer ≥ 0, no increases (no healing in schema)|
| add_event_log   | Unique log ID                                                  |
| advance_turn    | At most once per proposal                                      |

### Key files

- `src/rules/rulesEngine.mjs` — evaluateProposal + applyAllowedOps
- `out/rules_report.latest.json` — written after every turn evaluation
- `viewer/public/rules_report.view.json` — synced for viewer display

### Violation codes

Machine-readable, stable codes like `MOVE_TILE_OCCUPIED`, `SPAWN_NO_GM_AUTHORITY`, etc.
Each violation includes: code, message, path, severity (error/warning).

## Phase 3.5 — Deterministic Replay & Turn Bundles

Every turn writes a bundle folder under `out/turn_bundles/<timestamp>_<id>/` containing:
- `state_in.json`, `intent_in.json` — exact inputs
- `ai_response.json` — AI output (or fixture)
- `rules_report.json` — rules evaluation
- `state_out.json` — output state (only on success)
- `meta.json` — model, seed, git commit, gate result

### Key files

- `src/pipeline/runTurn.mjs` — writes bundles on every turn
- `src/pipeline/replayTurn.mjs` — replays a bundle and verifies determinism
- `fixtures/turn_bundles_demo/legal_move_demo/` — deterministic demo bundle

### Replay

`npm run replay -- <bundle-path>` or `npm run replay:latest` re-runs rules + state application on stored inputs and compares outputs. Non-deterministic fields (timestamps) are normalized before comparison.

### `--fixture` flag

`node src/pipeline/runTurn.mjs --fixture <path>` bypasses OpenAI and uses a JSON file as the AI response, making turns fully deterministic.

## Phase 5.0 — Player Intent Capture & One-Click Turn Execution

The viewer now supports one-click turn execution via a local API server.

### Architecture

```
Viewer UI → POST /api/turn → localApiServer.mjs → executeTurn() → gatekeeper → sync → response
```

### Key files

- `src/pipeline/executeTurn.mjs` — Core turn logic, callable from CLI or API (no process.exit)
- `src/pipeline/runTurn.mjs` — Thin CLI wrapper over executeTurn
- `src/server/localApiServer.mjs` — Native Node.js HTTP server, port 3030
- `scripts/run-dev.mjs` — Parallel launcher for API + viewer

### API endpoints

| Method | Path | Description |
|--------|---------|-------------|
| GET | /health | Health check |
| POST | /turn | Execute turn with intent from body |
| GET | /latest | Latest state, AI response, rules report |

### Viewer Intent Panel

- Textarea for free-text intent
- Fixture dropdown (legal move, illegal collision, illegal spawn, or None/OpenAI)
- Seed input
- ▶ Run Turn button → POST /api/turn → toast with PASS/FAIL + bundle name

### Data loading

- API available → fetch from GET /latest
- API unavailable → fallback to viewer/public/*.view.json files
- API status shown in header (green/red badge)

### Lazy OpenAI client

`openaiClient.mjs` now uses lazy initialization. The API key is only required when actually calling OpenAI. Fixture mode works without any API key.

## Phase 4.0 — Viewer Interaction & Observability

The viewer is now a debug/observability UI with interactive panels:

- **Clickable tokens** → Entity Inspector side panel (id, name, type, position, stats)
- **Turn badge** in header showing current turn index
- **AI Proposal panel** listing operations, narration, and ⛔ markers on violated ops
- **Rules Report panel** with grouped errors/warnings and "All rules passed" state
- **Event Log panel** (collapsible, last 10 entries)
- **Error banners** for failed data loads (not silent blank screens)

### Viewer data files

| File | Loaded from | Required |
|------|-------------|----------|
| `game_state.view.json` | `out/game_state.latest.json` | Yes |
| `ai_response.view.json` | `out/ai_response.latest.json` | No |
| `rules_report.view.json` | `out/rules_report.latest.json` | No |

`scripts/sync-state.mjs` copies all three files.

## Phase S0 — Engine Depth (Foundation → Interactive Combat)

Built the engine modules needed for a real playable game:

### Key files

- `src/core/logger.mjs` — Structured logging (info/warn/error)
- `src/core/assert.mjs` — Runtime assertion helpers
- `src/engine/pathfinding.mjs` — A* pathfinding (cardinal, blocked terrain, occupied cells)
- `src/engine/combatEnd.mjs` — Death handling, faction elimination, combat end detection
- `src/engine/npcTurnStrategy.mjs` — NPC AI: chase nearest hostile, attack if adjacent
- `src/engine/narrateEvent.mjs` — Human-readable event descriptions
- `src/engine/combatController.mjs` — Full NPC turn execution loop, multi-round simulation

### UI upgrades (S0.5–S0.8)

- Click-to-move with pathfinding validation
- Click-to-attack with adjacency validation
- HP bars on all tokens
- NPC auto-turns via combat controller
- Narration panel with styled messages
- Damage floaters (animated)
- Turn indicator

## Phase S1 — Abilities, Conditions, Range

### Key files

- `src/engine/conditions.mjs` — 6 conditions (dead, stunned, poisoned, prone, blessed, burning), duration tracking, start/end-of-turn processing, modifier queries
- `src/engine/abilities.mjs` — 5 abilities (Firebolt, Healing Word, Sneak Attack, Poison Strike, Shield Bash), USE_ABILITY action, range/targeting/cooldown validation
- `src/engine/index.mjs` — Barrel export for all 17 engine modules

## DevOps

### Port management

`serve.mjs` auto-kills stale processes on port 3001 before binding.
Graceful shutdown on SIGINT/SIGTERM/SIGHUP.

### Convenience scripts

| Script | Purpose |
|--------|---------|
| `npm run ui` | Start UI server (auto-kills stale port) |
| `npm run ui:stop` | Kill whatever is on port 3001 |
| `npm run test:all` | Run all 16 test suites (995 tests) |

## Documentation Concept

Three-layer documentation system:

1. **Living status docs** — Updated after each task:
   - `CHANGELOG.md` — Session-by-session record of what was built
   - `docs/mir_mvp_status.md` — Current features, test counts, limitations
   - `PROJECT_CONTEXT.md` — Architecture, phases, key files

2. **Technical specs** — Updated when the spec changes:
   - `docs/mir_action_model.md`, `mir_event_model.md`, `mir_engine_contract.md`, etc.

3. **Operational docs** — Updated when new patterns are learned:
   - `docs/mir_dev_practices.md` — Session timeout prevention, module checklist

### Post-task discipline
After every task completion:
1. Update `CHANGELOG.md` with session summary
2. Update `mir_mvp_status.md` test counts + features if changed
3. Update `PROJECT_CONTEXT.md` phase status if a new phase completed
4. Update `mir_overview.md` file map if new modules were added

## Roadmap Status

- Phase 0: complete
- Phase 1: complete
- Phase 2: complete
- Phase 3: complete (rules engine + engine dominance)
- Phase 3.5: complete (deterministic replay + turn bundles)
- Phase 4.0: complete (viewer interaction + observability)
- Phase 5.0: complete (player intent capture + one-click turn execution)
- Phase S0: complete (pathfinding, death/combat end, NPC strategy, narration, combat controller, UI upgrade)
- Phase S1: complete (ability system, condition system, range validation, zoom/pan, sounds, initiative tracker, scenario polish — 932 tests)
- Phase S1.5: complete (fog of war visibility, Bresenham LOS — 964 tests)
- Phase S2: complete (session save/load, auto-save, import/export, campaign model, character persistence — 964 tests)
- Tier 5.3: complete (AI difficulty presets: easy/normal/hard/deadly, UI selector — 995 tests)
- Phase S3+: pending (see `docs/mir_product_roadmap.md`)

## Phase S2 — Persistence

### Key files

- `src/persistence/sessionStore.mjs` — IndexedDB CRUD for sessions (save, load, list, delete, clear), auto-save helper, session export/import
- `src/persistence/campaignStore.mjs` — Campaign model (ordered session lists, entity roster), CRUD, roster apply/update, campaign export/import
- `tests/persistence_test.mjs` — 14 tests: roster apply, campaign export/import, module structure

### Features

- **S2.1** Session save/load via IndexedDB
- **S2.2** Campaign model with ordered session list + shared entity roster
- **S2.3** Auto-save on every dispatch (2s throttle)
- **S2.4** Character persistence across sessions (roster snapshot + restore)
- **S2.5** Session import/export as JSON files (`mir-session` format)
- **UI** Save/Load sidebar section with manual save, load list, delete, export, import buttons
