# MIR Canonical Architecture

> Package 5 deliverable — documents the module ownership and extension policy after seam burn-down.

## Extension Policy

| Extension | Role | Build coverage |
|-----------|------|---------------|
| `.mjs` | **Canonical source** — all runtime imports reference `.mjs` | Included in `tsconfig.json` for type-checking |
| `.mts` | **Diverged variant** — only kept when content genuinely differs from `.mjs` | NOT included in `tsconfig.json` |
| `.js` | **Root legacy entrypoint** — thin CLI wrappers calling into `src/` | Not type-checked |
| `.ts` | **Server/client app code** — used in `server/`, `client/`, `viewer/` sub-packages | Covered by sub-package tsconfigs |

## Seam Budget

After Package 5 Workstream A, the repo has **2 remaining `.mjs/.mts` sibling pairs** (down from 52):

| Module | Reason kept |
|--------|-------------|
| `src/ui/main` | `.mts` has TypeScript casts, different character creator, monster browser UI |
| `src/server/localApiServer` | `.mts` has minor differences (~50 bytes) |

The seam budget is enforced in CI via `npm run check:seams` (threshold: 5 max pairs).

## Directory Structure

```
root/
├── src/                    # Canonical .mjs source modules
│   ├── adapters/           # External API adapters (OpenAI, ChatGPT)
│   ├── ai/                 # AI integration (intent system, LLM parsers, memory)
│   ├── combat/             # Tactical combat subsystem
│   ├── content/            # Content generation (characters, encounters, dungeons, monsters)
│   ├── core/               # Foundation (logger, assert, violation codes)
│   ├── engine/             # Game engine (combat, movement, pathfinding, visibility)
│   ├── net/                # Network layer (event broadcast, WebSocket)
│   ├── persistence/        # Save/load (session store, campaign store)
│   ├── pipeline/           # Turn pipeline (AI response → actions → state)
│   ├── replay/             # Replay system (hash, run)
│   ├── rules/              # Rules engine + pluggable rule modules
│   ├── scenarios/          # Scenario loading
│   ├── server/             # Local API server
│   ├── state/              # Game state management + validation
│   ├── ui/                 # Browser UI (canvas, input, sounds)
│   └── validation/         # Cross-cutting validators
├── client/                 # React client (Vite + TypeScript)
├── server/                 # Express server (TypeScript)
├── viewer/                 # Replay viewer (Vite)
├── shared/                 # Shared schemas and types
├── tests/                  # All test files (flat, *_test.mjs convention)
├── fixtures/               # Test fixture JSON files
├── scenarios/              # Scenario definition files
├── schemas/                # JSON Schema definitions
├── scripts/                # Dev tooling and CI scripts
├── docs/                   # Documentation
├── subprojects/            # Cleanup governance tracking
└── ai_gm/                  # AI GM prompt engineering assets
```

## Root Legacy Files

These root-level `.js` files are **legacy CLI entrypoints** with substantial inline logic. They are scheduled for refactoring into thin wrappers delegating to `src/` modules:

| File | Lines | Target delegation |
|------|-------|-------------------|
| `validate_game_state.js` | 38 | `src/state/validateGameState.mjs` |
| `check_invariants.js` | 58 | `src/state/validation/invariants.mjs` |
| `check_schema_version.js` | 48 | `src/state/validation/` (new module) |
| `validate_ai_gm_response.js` | 42 | `src/validation/` (new module) |
| `validate_ai_output.js` | 44 | `src/validation/` (new module) |
| `gatekeeper.js` | ~60 | `src/pipeline/` or dedicated gate module |
| `run_fixtures.js` | ~80 | Test infrastructure |
| `smoke_mutation_test.js` | ~30 | Test infrastructure |

## CI Quality Gates

The following gates run on every push/PR to `main`:

1. **check:subprojects** — ensures no references to finalized subproject artifacts
2. **check:temp** — detects temporary/generated files that shouldn't be committed
3. **check:seams** — enforces `.mjs/.mts` sibling pair budget (max 5)
4. **validate** — JSON Schema validation of game state
5. **smoke** — mutation smoke test
6. **invariants** — game state invariant checks
7. **fixtures** — fixture regression tests
8. **test:all** — full test suite (1600+ tests)
9. **typecheck** — TypeScript type-check (advisory, non-blocking)

## Migration Path

When converting a root legacy file to a thin wrapper:
1. Extract logic into appropriate `src/` module
2. Replace root file content with `import { main } from './src/...'; main();`
3. Verify `npm test` still passes
4. Update `package.json` script to point to new `src/` module
5. Add deprecation notice to root file header