# AI GM RPG — Hybrid Analog Tabletop RPG with AI Game Master

## Quick Start

```bash
npm install
npm test
```

### Start the battlemap client (React + Canvas)

```bash
node scripts/run-client.mjs
# → http://127.0.0.1:5173
```

### Start the server (Express API)

```bash
node scripts/run-server.mjs
# → http://127.0.0.1:3001
```

> **⚠ Always use `127.0.0.1`, never `localhost`.** Node.js v24+ resolves
> `localhost` to IPv6 `[::1]` which Chrome cannot reach. All configs and
> launcher scripts already enforce this. See [PROJECT_CONTEXT.md](PROJECT_CONTEXT.md)
> for full details.

## Repository cleanup governance

- Cleanup policy and subproject lifecycle: [`docs/repo_cleanup_governance.md`](docs/repo_cleanup_governance.md)
- GitLens reviewer routine for cleanup PRs: [`docs/gitlens_routine_checklist.md`](docs/gitlens_routine_checklist.md)
- Root hygiene checks:
  - `npm run check:subprojects`
  - `npm run check:temp`
  - `npm run report:seams`

## Phase 2 — AI Wiring & Battlemap Viewer

### Prerequisites

| Variable | Required | Description |
|---|---|---|
| `OPENAI_API_KEY` | **Yes** | Your OpenAI API key |
| `OPENAI_MODEL` | No | Model to use (default: `gpt-4o`) |

Set them in your shell before running the turn pipeline:

```bash
# Bash / Git Bash
export OPENAI_API_KEY="sk-..."
export OPENAI_MODEL="gpt-4o"      # optional

# PowerShell
$env:OPENAI_API_KEY = "sk-..."
$env:OPENAI_MODEL = "gpt-4o"
```

Or copy `.env.example` to `.env` and fill in the values (note: the pipeline reads from the shell environment, not from `.env` automatically).

### Run a turn (AI pipeline)

```bash
npm run turn
```

This will:

1. Load `game_state.example.json` and `player_intent.example.json`
2. Call the ChatGPT adapter with structured output
3. Write the AI response to `out/ai_response.latest.json`
4. Apply the response to produce a candidate next game state
5. Write the next state to `out/game_state.latest.json`
6. Run the gatekeeper (schema + invariant validation)
7. Copy the latest state to `viewer/public/game_state.view.json`

You can pass custom files:

```bash
node src/pipeline/runTurn.mjs --state my_state.json --intent my_intent.json --seed 42
```

### Battlemap Viewer

First install the viewer dependencies (one time):

```bash
npm run viewer:install
```

Then start the viewer dev server:

```bash
npm run view
```

Open **http://127.0.0.1:5174** in your browser to see the battlemap grid with entity tokens.

### Viewer Panels (Phase 4.0 — Observability UI)

The viewer is a **debug/observability UI**, not a gameplay interface. It makes rules-driven behavior and AI decisions immediately inspectable.

| Panel | Purpose |
|---|---|
| **Battlemap** | Grid with clickable tokens. Hover highlights cells; click selects. |
| **Entity Inspector** | Side panel showing id, name, type, position, HP, stats of selected token. Click empty space to deselect. |
| **Turn Indicator** | Small badge in the header showing the current turn index. |
| **AI Proposal** | Shows narration + operation table (op type, target, details). Violated ops are highlighted with ⛔. |
| **Rules Report** | Grouped errors/warnings with codes, messages, paths. Shows "✅ All rules passed" when clean. |
| **Event Log** | Collapsible panel showing last 10 log entries with timestamps. |
| **Debug Panel** | Schema version, entity count, map size, last load time. |

### Viewer JSON Files

The viewer loads three files from `viewer/public/`:

| File | Source | Required |
|---|---|---|
| `game_state.view.json` | `out/game_state.latest.json` | Yes |
| `ai_response.view.json` | `out/ai_response.latest.json` | No (optional) |
| `rules_report.view.json` | `out/rules_report.latest.json` | No (optional) |

If a required file fails to load, an error banner is shown. Optional files gracefully degrade (panels hidden).

### Sync state to viewer

After running a turn, the state is automatically synced. To sync manually:

```bash
npm run view:sync
```

## Phase 3.5 — Deterministic Replay & Turn Bundles

Every turn is reproducible and auditable. The pipeline writes a per-turn bundle that captures all inputs and outputs.

### Turn bundles

Each `npm run turn` (or `npm run turn:bundle`) creates a bundle folder:

```
out/turn_bundles/20260211_030500_a1b2c3/
  state_in.json         # exact input state
  intent_in.json        # exact player intent
  ai_response.json      # AI response (from OpenAI or fixture)
  rules_report.json     # rules evaluation result
  state_out.json        # output state (only if turn passed)
  meta.json             # metadata (model, seed, git commit, etc.)
```

Bundle folders are named `<YYYYMMDD_HHMMSS>_<shortid>` for chronological sorting.

### Using fixture AI responses

You can bypass OpenAI and use a fixture file as the AI response:

```bash
node src/pipeline/runTurn.mjs --fixture fixtures/ai_response_legal_move.json
```

This makes turns fully deterministic and reproducible.

### Replay a bundle

```bash
npm run replay -- out/turn_bundles/<bundle>/
npm run replay:latest
```

Replay re-runs rules evaluation and state application on the stored inputs, then compares computed outputs against stored outputs. Non-deterministic fields (`meta.updatedAt`, log timestamps) are normalized before comparison.

Use replay to:
- Verify determinism after rules engine changes
- Debug regressions after prompt or schema updates
- Audit past turns for correctness

### meta.json fields

| Field | Description |
|---|---|
| `createdAt` | ISO timestamp of turn execution |
| `openaiModel` | Model used, or `"fixture"` |
| `seed` | Seed value if provided |
| `inputStatePath` | Path to input state file |
| `inputIntentPath` | Path to intent file |
| `aiResponseSource` | `"openai"` or `"fixture"` |
| `gatekeeperResult` | `"passed"` or `"failed"` |
| `failureGate` | Which gate failed, or `null` |
| `gitCommit` | Git HEAD hash, or `null` |

---

## Phase 5.0 — Player Intent Capture & One-Click Turn Execution

Stop editing JSON files by hand. From the viewer, enter intent, click **Run Turn**, and the app executes a full turn locally.

### Start the local API server

```bash
npm run api
# → http://127.0.0.1:3030
```

### Start API + viewer together (dev mode)

```bash
npm run dev
```

This starts both the local API (port 3030) and the viewer (port 5174) in parallel.

### API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Returns `{ ok, version, port }` |
| `POST` | `/turn` | Execute a turn (see below) |
| `GET` | `/latest` | Returns latest state, AI response, rules report |

### POST /turn body

```json
{
  "intent": { "player_id": "pc-01", "action": "move east", "free_text": "I move east" },
  "useFixture": "fixtures/ai_response_legal_move.json",
  "seed": 42
}
```

- `intent` (required) — player intent object
- `useFixture` (optional) — path to fixture file, bypasses OpenAI
- `seed` (optional) — deterministic seed
- `statePath` (optional) — path to game state, defaults to `game_state.example.json`

### POST /turn response

```json
{
  "ok": true,
  "bundlePath": "C:\\...\\out\\turn_bundles\\20260211_035233_9bf813",
  "bundleName": "20260211_035233_9bf813",
  "gatekeeperResult": "passed",
  "failureGate": null,
  "violations": [],
  "log": ["..."],
  "error": null
}
```

### Viewer Intent Panel

The viewer includes an **Intent Panel** in the side column:

- **Textarea** for free-text player intent
- **Fixture dropdown** to select a fixture AI response (bypasses OpenAI) or "None" for real AI
- **Seed input** (optional)
- **▶ Run Turn** button — executes the turn via the local API

After a turn:
- A **toast banner** shows ✅ PASS or ❌ FAIL with violation codes
- The **bundle name** is shown with a copy button
- The viewer **auto-refreshes** state, AI proposal, and rules report

### Data loading strategy

- If the API is running, the viewer fetches data from `GET /latest`
- If the API is not reachable, falls back to loading static files from `viewer/public/`
- The header shows **API ●** (green) or **API ○** (red) to indicate connectivity
- If API is offline, the Run Turn button is disabled with instructions to start `npm run api`

### No OPENAI_API_KEY required for fixture mode

The OpenAI client is lazy-initialized. When using `--fixture` or `useFixture`, no API key is needed.

---

## Phase 3 — Rules Engine (Engine Dominance)

The rules engine is a deterministic layer between AI proposals and state mutation. AI proposes actions; the engine decides whether they are legal. Illegal proposals are rejected **before** any state change occurs.

### How it works

```
AI Response → evaluateProposal() → legal?   → applyAllowedOps() → gatekeeper
                                  → illegal? → violation report, state untouched
```

### Violation report

Every turn writes `out/rules_report.latest.json`:

```json
{
  "ok": false,
  "violations": [
    {
      "code": "MOVE_TILE_OCCUPIED",
      "message": "Target (7, 6) is already occupied by another entity.",
      "path": "map_updates[0]",
      "severity": "error"
    }
  ],
  "allowedOps": []
}
```

- **code** — machine-readable, stable identifier (e.g. `MOVE_TILE_OCCUPIED`)
- **message** — one-sentence human explanation
- **path** — location in the AI response (e.g. `map_updates[0]`)
- **severity** — `"error"` blocks the turn; `"warning"` is informational only

### Violation codes reference

| Code | Trigger |
|---|---|
| `MOVE_ENTITY_NOT_FOUND` | Entity ID doesn't exist |
| `MOVE_OUT_OF_BOUNDS` | Target outside map dimensions |
| `MOVE_TILE_OCCUPIED` | Another entity at target position |
| `MOVE_EXCEEDS_BUDGET` | Distance > movement budget (default 6) |
| `MOVE_DUPLICATE` | Same entity moved twice in one proposal |
| `SPAWN_NO_GM_AUTHORITY` | No GM authority field in AI schema → always denied |
| `SPAWN_OUT_OF_BOUNDS` | Spawn position outside map |
| `SPAWN_TILE_OCCUPIED` | Spawn position already occupied |
| `SPAWN_DUPLICATE_ID` | Entity ID already exists |
| `REMOVE_ENTITY_NOT_FOUND` | Entity ID doesn't exist |
| `REMOVE_NOT_DEAD_NO_GM` | HP ≠ 0 and no GM authority |
| `SET_HP_ENTITY_NOT_FOUND` | Entity ID doesn't exist |
| `SET_HP_INVALID` | HP not integer ≥ 0 |
| `SET_HP_INCREASE_FORBIDDEN` | HP increase without healing concept |
| `LOG_DUPLICATE_ID` | Log entry ID already exists |
| `ADVANCE_TURN_DUPLICATE` | advance_turn used more than once |

### Gate order (gatekeeper.js)

1. AI GM Response Schema
2. **Rules Legality** ← new
3. Schema Version
4. Game State Schema
5. Invariants

### Rules fixtures

| Fixture | Expected |
|---|---|
| `ai_response_illegal_collision.json` | FAIL — move into occupied tile |
| `ai_response_illegal_spawn_no_gm.json` | FAIL — spawn without GM authority |
| `ai_response_legal_move.json` | PASS — valid move + HP decrease |

---

## Validation & Guardrail Scripts

### Run the full test suite

```bash
npm test
```

This runs **all** validation stages in sequence:

1. `npm run validate` — validates `game_state.example.json` against the game-state JSON Schema
2. `npm run smoke` — applies realistic mutations to the example state and re-validates
3. `npm run invariants` — checks logical invariants (HP ≥ 0, positions in bounds, unique IDs, …)
4. `npm run fixtures` — runs all fixture files and asserts expected pass/fail outcomes

### Validate a specific game-state file

```bash
node validate_game_state.js path/to/state.json
```

### Validate an AI GM response file

```bash
node validate_ai_gm_response.js path/to/response.json
# or via npm:
npm run ai:response:validate -- path/to/response.json
```

### Run the Gatekeeper (full pipeline for AI output)

The gatekeeper validates both the AI GM response **and** the resulting game state in one command:

```bash
node gatekeeper.js --response fixtures/ai_response_valid_1.json --state fixtures/state_valid_1.json
```

It checks four stages:
1. AI GM Response Schema validation
2. Schema version compatibility
3. Game State Schema validation
4. Logical invariants

### Check schema version compatibility

```bash
node check_schema_version.js path/to/state.json
```

## npm Scripts Reference

| Script | Description |
|---|---|
| `npm run dev:client` | Start battlemap client → http://127.0.0.1:5173 |
| `npm run dev:server` | Start Express API server → http://127.0.0.1:3001 |
| `npm test` | Full test suite (validate + smoke + invariants + fixtures) |
| `npm run validate` | Schema-validate the example game state |
| `npm run smoke` | Mutation smoke test |
| `npm run invariants` | Logical invariant checks |
| `npm run fixtures` | Run fixture test suite |
| `npm run ai:response:validate -- <file>` | Validate an AI GM response JSON file |
| `npm run gate -- --response <file> --state <file>` | Full gatekeeper pipeline |
| `npm run turn` | Run AI turn pipeline + sync to viewer |
| `npm run turn:bundle` | Run turn pipeline (bundle only, no viewer sync) |
| `npm run replay -- <path>` | Replay a turn bundle and verify determinism |
| `npm run replay:latest` | Replay the most recent turn bundle |
| `npm run api` | Start local API server → http://127.0.0.1:3030 |
| `npm run dev` | Start API + viewer together (parallel) |
| `npm run dev:api` | Start local API server only |
| `npm run dev:viewer` | Start viewer only |
| `npm run view` | Start the battlemap viewer → http://127.0.0.1:5174 |
| `npm run view:sync` | Copy latest state to viewer |
| `npm run viewer:install` | Install viewer dependencies |

## Fixtures

Test fixtures live in the `fixtures/` directory. Naming conventions:

| Prefix | Expected outcome |
|---|---|
| `state_valid_*` | Must pass both schema validation and invariants |
| `state_invalid_schema_*` | Must fail JSON Schema validation |
| `state_invalid_invariant_*` | Must pass schema but fail invariant checks |
| `ai_response_valid_*` | Must pass AI GM response schema validation |
| `ai_response_invalid_*` | Must fail AI GM response schema validation |
| `ai_response_legal_*` | Must pass schema AND rules engine evaluation |
| `ai_response_illegal_*` | Must pass schema but fail rules engine evaluation |

Run all fixtures:

```bash
npm run fixtures
# or
node run_fixtures.js
```

## Project Structure (Phase 5.0)

```
src/
  adapters/
    openaiClient.mjs        # Lazy OpenAI SDK wrapper (Phase 5.0)
    chatgptAdapter.mjs       # AI GM response generator
  pipeline/
    executeTurn.mjs          # Core turn logic, callable from CLI or API (Phase 5.0)
    runTurn.mjs              # CLI wrapper for executeTurn
    applyAiResponse.mjs      # Low-level state applier (no legality checks)
    replayTurn.mjs           # Replay engine for bundle verification (Phase 3.5)
  rules/
    rulesEngine.mjs          # Deterministic rules engine (Phase 3)
  server/
    localApiServer.mjs       # Minimal local API for viewer UI (Phase 5.0)
scripts/
  run-client.mjs             # Client dev server launcher
  run-server.mjs             # Server launcher
  run-viewer.mjs             # Viewer dev server launcher
  run-dev.mjs                # Parallel API + viewer launcher (Phase 5.0)
  sync-state.mjs             # Copy out state + AI response + rules report → viewer
viewer/                      # Vite + React observability viewer (Phase 4.0)
  public/
    game_state.view.json     # State file loaded by viewer
    ai_response.view.json    # AI proposal loaded by viewer
    rules_report.view.json   # Rules report loaded by viewer
  src/
    App.jsx                  # Viewer: battlemap, inspector, intent, proposals, log
    App.css                  # All panel styling
fixtures/
  turn_bundles_demo/         # Deterministic replay fixtures (Phase 3.5)
    legal_move_demo/         # One complete bundle with known-good outputs
out/                         # Generated turn output (gitignored)
  ai_response.latest.json
  game_state.latest.json
  rules_report.latest.json
  turn_bundles/              # Per-turn audit bundles (Phase 3.5)
    <YYYYMMDD_HHMMSS>_<id>/
```

## Pre-commit Hook

A Git pre-commit hook (`.git/hooks/pre-commit`) is installed that runs `npm test` before every commit. If any validation fails, the commit is blocked with a clear error message.

> **Note:** Husky was not used because the `&` character in the project directory name (`D&D`) causes path issues on Windows. The fallback `.git/hooks/pre-commit` script provides identical functionality.

To bypass the hook (e.g. for WIP commits):

```bash
git commit --no-verify -m "WIP: work in progress"
```
