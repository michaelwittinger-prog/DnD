# Changelog

> Chronological record of all development sessions. Updated after each task.
> Convention: newest entries at the top.

---

## 2026-02-12 — Session 11: Sprint 3 + Tier 5/6 Groundwork (WIP)

**Commit:** `793f6a8` | **Tests:** 995 + 34 new (broadcast) | **Status:** IN PROGRESS

### Built (complete)
- **Game Handbook** (`docs/mir_game_handbook.md`) — Full player reference: rules, abilities, conditions, difficulty, scenarios, controls
- **S3.1 WebSocket Event Broadcast** (`src/net/eventBroadcast.mjs`) — Room management, client registry, message protocol (encode/decode), event fan-out, action authorization (GM/player/spectator), state sync, turn notifications. **34/34 tests passing.**

### Built (modules done, tests pending)
- **Tier 6.3 Monster Manual** (`src/content/monsterManual.mjs`) — 15 monster templates across 4 CR tiers (minion/standard/elite/boss). Query by CR, tag, name search. `instantiateMonster()` and `instantiateGroup()` factory functions.
- **Tier 5.5 Model Adapter** (`src/ai/modelAdapter.mjs`) — Adapter registry pattern for multiple AI providers. Mock, OpenAI, and local LLM adapter factories. Active adapter selection + `callActiveAdapter()`.
- **Tier 5.1 AI Memory Context** (`src/ai/memoryContext.mjs`) — Context builder: roster summary, recent events, combat state, narrative beats, map summary. `buildFullContext()` + `estimateTokens()`.

### ⚠ RESUME HERE NEXT SESSION
1. Write tests: `tests/monster_manual_test.mjs`, `tests/model_adapter_test.mjs`, `tests/memory_context_test.mjs`
2. Add all new test files to `package.json` `test:all` script
3. Run full regression (should be ~1100+ tests)
4. Update CHANGELOG, mir_mvp_status, PROJECT_CONTEXT with final counts
5. Continue with remaining Sprint 3 items (S3.2–S3.6)

---

## 2026-02-12 — Session 10: Tier 5.3 AI Difficulty Presets

**Commits:** `15b5279`, `04f04e8` | **Tests:** 995 | **Modules:** 21 engine + 2 persistence

### Built
- **Tier 5.3: AI Difficulty Presets** (`src/engine/difficulty.mjs`) — 4 difficulty levels: Easy, Normal, Hard, Deadly. Configures NPC combat behavior: attack probability, ability usage, target selection strategy, movement strategy, attack/damage/AC modifiers, HP multiplier.
- **Difficulty Functions** — `getDifficulty()`, `listDifficulties()`, `applyDifficultyToEntities()`, `selectTarget()`, `shouldAttack()`, `shouldUseAbility()`, modifier getters. All pure functions with deterministic RNG injection.
- **UI Difficulty Selector** — Dropdown in welcome panel (Easy/Normal/Hard/Deadly). Applied on demo encounter load and scenario load. HP scaling for NPCs, difficulty label in narration.

### Test delta: +31 (964 → 995)
- `tests/difficulty_test.mjs` — 31 tests: presets (5), getDifficulty (4), listDifficulties (1), applyDifficultyToEntities (7), selectTarget (6), shouldAttack (2), shouldUseAbility (2), modifier getters (4)

### Commits in this session
- `15b5279` feat: Tier 5.3 — AI difficulty presets (easy/normal/hard/deadly) + 31 tests (995 total)
- `04f04e8` feat: wire difficulty selector into UI — dropdown applies to encounters + scenarios

---

## 2026-02-12 — Session 9: Sprint 1+2 Completion + Sprint 3 Groundwork

**Commits:** `44eef60`, `a59ac93`, `1185c15` | **Tests:** 964 | **Modules:** 20 engine + 2 persistence

### Built
- **S2.2+S2.4 Campaign Persistence** — Campaign model with character roster persistence across sessions. Roster snapshots on session end, restore on session start.
- **S1.5 Fog of War** (`src/engine/visibility.mjs`) — Pure visibility system with Bresenham line-of-sight raycasting. Per-faction vision computation, vision-blocking terrain, dead entities excluded.
- **Fog UI Integration** — Dark overlay on non-visible cells, NPC token hiding in fog, fog toggle button in header bar.
- **Engine Barrel Export** — `visibility.mjs` functions exported via `engine/index.mjs`.

### Test delta: +18 (946 → 964)
- `tests/visibility_test.mjs` — 18 tests: fog disabled, basic vision, vision blocking, dead entities, faction filtering, multi-entity merge, edge cases

### Sprint Status
- **Sprint 1:** ✅ COMPLETE (S1.1–S1.10 all done)
- **Sprint 2:** ✅ COMPLETE (S2.1–S2.5 all done)
- **Next:** Sprint 3 (Multiplayer) + Tier 5 (Advanced AI)

### Commits in this session
- `44eef60` feat: S2.2+S2.4 — campaign model + character persistence (946 tests)
- `a59ac93` feat: S1.5 — fog of war visibility system + Bresenham LOS + UI wiring (964 tests)
- `1185c15` feat: S1.5 fog toggle button + barrel export + CSS (964 tests)

---

## 2026-02-12 — Session 8: Sprint 1 Polish + Sprint 2 Persistence

**Commit:** `pending` | **Tests:** 946 | **Modules:** 19 engine + 2 persistence

### Built
- **S1.6 Map Zoom/Pan** — Mouse wheel zoom (50%–250%), zoom buttons, reset. Canvas transforms with `transformOrigin: top left`.
- **S1.8 Sound Effects** — Synthesized audio via Web Audio API: move, hit, miss, kill, initiative, turn start, error, combat end. Toggle button. No external audio files.
- **S1.9 Initiative Tracker** — Rich sidebar component with HP bars, condition icons (💫☠⬇✨🔥), active turn highlighting, dead entity styling.
- **S1.7 Scenario Polish** — All 3 scenarios enhanced with conditions: tavern (blessed Seren, poisoned goblin), corridor (prone bandit), field (blessed knight, burning squire).
- **S2.1 Session Save/Load** (`src/persistence/sessionStore.mjs`) — IndexedDB CRUD for game sessions. Save, load, list, delete, clear.
- **S2.3 Auto-Save** — Throttled auto-save (2s debounce) after every dispatch. Visual feedback in UI.
- **S2.5 Import/Export** — Session export to JSON file download, import from file upload. `mir-session` format with version.
- **S2.2 Campaign Model** (`src/persistence/campaignStore.mjs`) — Campaign CRUD, ordered session lists, shared entity roster. Export/import campaign bundles.
- **S2.4 Character Persistence** — `updateRosterFromState()` snapshots players after sessions (strips "dead"). `applyRosterToState()` restores characters for next session.
- **Save/Load UI** — Sidebar section with save/load/export/import buttons, save list with timestamps, load/delete per entry.

### Test delta: +14 (932 → 946)
- `tests/persistence_test.mjs` — 14 tests: applyRosterToState (6), exportCampaign (2), importCampaign (4), module structure (2)

### Commits in this session
- `d914e5c` feat: S1.6+S1.8+S1.9 — zoom/pan, sounds, initiative tracker
- `10cedf1` feat: S1.7 — polished scenarios with conditions
- `497bc8f` feat: S2.1+S2.3+S2.5 — session persistence
- `pending` feat: S2.2+S2.4 — campaign model + character persistence

---

## 2026-02-12 — Session 7: Sprint 1 Integration + Documentation System

**Commit:** `4034104` | **Tests:** 932 | **Modules:** 17 engine

### Built
- **S1.2 Combat Integration** — Conditions wired into attack.mjs: stunned blocks attacks, poisoned gives disadvantage (roll twice take lower), blessed gives +2 attack, stunned gives -2 AC to target.
- **Turn Processing** — End-of-turn: cooldown tick + condition expiry. Start-of-turn: burning DoT damage.
- **S1.3 Difficult Terrain** — Pathfinding now costs 2 movement to enter difficult terrain cells.
- **S1.10 Combat Log Dice Detail** — Attack events now include: `d20(14)+2=16 [disadv] vs AC 13(-2→11)`. Full dice breakdown in narration.
- **Documentation System** — Created `CHANGELOG.md`, refreshed `mir_mvp_status.md`, `PROJECT_CONTEXT.md`, `mir_overview.md`. Defined 3-layer doc concept + post-task discipline.
- **DevOps** — Auto-kill stale port, graceful shutdown, `npm run ui:stop`.

### Commits in this session
- `8a350d5` docs: full documentation refresh
- `f7a9231` feat: S1.2 integration — conditions wired into combat
- `8ffd812` feat: S1.3 — difficult terrain costs 2x
- `4034104` feat: S1.10 — combat log with dice detail

---

## 2026-02-12 — Session 6: Sprint 1 + DevOps Fixes

**Commit:** `08c1928` | **Tests:** 932 | **Modules:** 17 engine

### Built
- **S1.1 Ability System** (`src/engine/abilities.mjs`) — 5 abilities: Firebolt, Healing Word, Sneak Attack, Poison Strike, Shield Bash. Full USE_ABILITY action with range/targeting/cooldown validation.
- **S1.2 Condition System** (`src/engine/conditions.mjs`) — 6 conditions: dead, stunned, poisoned, prone, blessed, burning. Duration tracking, start/end-of-turn processing, modifier queries.
- **S1.4 Range Validation** — Chebyshev distance for all abilities (melee=1, ranged configurable).
- **Auto-kill stale port** — `serve.mjs` now auto-kills orphaned processes on port 3001 before binding.
- **Graceful shutdown** — SIGINT/SIGTERM handlers for clean port release.
- **`npm run ui:stop`** — Convenience script to kill port 3001.
- **Dev practices doc** (`docs/mir_dev_practices.md`) — Session timeout prevention, module checklist.

### Test delta: +96 (836 → 932)

---

## 2026-02-11 — Session 5: UI Upgrade + Interactive Combat

**Commit:** `f2d0e60` | **Tests:** 836 | **Modules:** 14 engine

### Built
- **Click-to-move** — Click grid cells to move selected entity (pathfinding-validated)
- **Click-to-attack** — Click enemy tokens to attack (adjacency-validated)
- **HP bars** — Visual HP overlays on all tokens
- **NPC auto-turns** — NPCs execute automatically via combatController
- **Narration panel** — Real-time event narration with styled messages
- **Damage floaters** — Animated damage/heal numbers on the grid
- **Turn indicator** — Shows whose turn it is

---

## 2026-02-11 — Session 4: Engine Depth (Phases S0.3–S0.7)

**Commit:** `41aa9a4` | **Tests:** 740 | **Modules:** 11 engine

### Built
- **A* Pathfinding** (`src/engine/pathfinding.mjs`) — Cardinal movement, blocked terrain, occupied cells
- **Death & Combat End** (`src/engine/combatEnd.mjs`) — HP 0 → dead, faction elimination detection
- **NPC Strategy** (`src/engine/npcTurnStrategy.mjs`) — Chase-and-attack AI for NPCs
- **Event Narration** (`src/engine/narrateEvent.mjs`) — Human-readable descriptions for all event types
- **Combat Controller** (`src/engine/combatController.mjs`) — Full NPC turn execution loop
- **Foundation modules** (`src/core/logger.mjs`, `src/core/assert.mjs`) — Structured logging, assertion helpers

---

## 2026-02-10 — Session 3: Product Roadmap & Polish

**Commit:** `ea9bda1` | **Tests:** 441

### Built
- **Product Roadmap** (`docs/mir_product_roadmap.md`) — Full market pipeline from MVP to production
- **Demo Script** (`docs/mir_demo_script.md`) — Walkthrough for live demos
- **Positioning Doc** (`docs/mir_positioning.md`) — Market positioning
- **Mock AI improvements** — Fuzzy name matching, more command keywords

---

## 2026-02-10 — Session 2: Scenario System & MVP Core

**Commits:** `474e62b`..`0e756c5` | **Tests:** 441

### Built
- **Playable Core** (MIR 4.1) — Single-command `npm run start:mvp`, guided UI, demo encounter
- **Scenario System** (MIR 4.2) — 3 loadable scenarios (Tavern Skirmish, Corridor Ambush, Open Field Duel)
- **Product Readiness** (MIR 4.3) — UI polish, state indicators, scenario/replay selectors

---

## 2026-02-09 — Session 1: Foundation through AI Bridge

**Commits:** `598d3be`..`a7fde73` | **Tests:** ~350

### Built
- **GameState Model** (MIR 1.2) — Schema, invariants, validator, 25 testable invariants
- **State Mutation Engine** (MIR 1.3) — applyAction, movement, attack, initiative, seeded RNG
- **Action→Event→State Architecture** (MIR 1.4) — Locked pipeline
- **Battlemap UI** (MIR 2.1) — Minimal render-only browser UI
- **Isomorphic Validation** (MIR 2.2) — Pre-compiled zero-dep schema validator
- **AI Proposal Loop** (MIR 3.1) — Safety parser, mock client
- **OpenAI Integration** (MIR 3.2) — Real API calls, parser contract tests
- **AI Bridge Server** (MIR 3.3) — Local HTTP bridge, rate limiting
- **Replay System** (MIR 3.4) — Deterministic trace bundles, hash verification

---

## Pre-MIR — Legacy Phases

**Commits:** `e4e5c0f`..`77177b5`

### Built
- Phase 5.1: Server robustness & determinism hardening
- Phase 5.2: Strict Schema & AI Boundary Enforcement
- Phase 6.0: Combat State Machine (Initiative + Turn Advancement)
- Phase 6.1: Deterministic Tactical Events Layer
- Phase 6.2: Ability System Formalization (legacy, superseded by Sprint 1)
