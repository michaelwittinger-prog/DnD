# Changelog

> Chronological record of all development sessions. Updated after each task.
> Convention: newest entries at the top.

---

## 2026-02-13 — Session 19: DevOps — Git Cleanup + TypeScript + CI/CD

**Commit:** pending | **Tests:** 1600 | **Status:** Infrastructure

### Git Commit Cleanup
- Committed all pending work from Sessions 12–18 (previously uncommitted) into 4 clean, logical commits:
  - `79ca0c6` Sessions 12-13: Sprint 3 complete + Tier 5/6 tests (+186 tests)
  - `198f100` Sessions 14-15: Content systems (multi-action, encounter, character, scenario)
  - `4ce3c88` Sessions 16-17: Tier 7 NLP pipeline (intent system + LLM parser)
  - `ae919b0` Session 18: Roadmap refresh + UI intent wiring + docs
- Repo now has clean linear history, no uncommitted work

### TypeScript Infrastructure
- **`tsconfig.json`** — ESM-aware config with `allowJs: true`, `checkJs: true` for progressive JSDoc-based type checking. Excludes auto-generated files, tests, and DOM-heavy UI files.
- **`npm run typecheck`** — Runs `tsc --noEmit` against src/ business logic
- **Baseline:** 276 TS errors (mostly untyped parameters in dynamic JS patterns). Progressive annotation path — no file renames needed.
- **Dependencies:** `typescript@^5.9.3`, `@types/node` added as devDependencies

### CI/CD Pipeline
- **`.github/workflows/ci.yml`** — GitHub Actions workflow on push/PR to main:
  - **Gate 1 (blocking):** Schema validation, smoke test, invariants, fixtures
  - **Gate 2 (blocking):** Full test suite (`npm run test:all` — 1600+ tests, 26 test files)
  - **Gate 3 (advisory):** TypeScript type-check (non-blocking, `continue-on-error`)
  - **Quality job:** TS error count + test count in GitHub Step Summary
  - **Matrix:** Node.js 20 + 22
- **`npm run test:all`** — Now uses `node --test` runner with all 26 test files in one command (faster parallel execution)
- Added 6 missing individual test scripts: `test:intent`, `test:llm-parser`, `test:multi-action`, `test:encounter`, `test:character`, `test:scenario-builder`

---

## 2026-02-12 — Session 18: Roadmap Refresh + UI Intent Wiring

**Commit:** pending | **Tests:** 1600 | **Status:** Integration Phase

### Roadmap Overhaul
- **`docs/mir_product_roadmap.md`** — Complete rewrite of Section 2 (Current State Assessment) with full inventory of 30+ built systems, sprint completion status (all 5 sprints ✅), tier completion matrix. Added architecture diagram showing wired vs unwired systems.
- **Tier renumbering** — Tier 7 repurposed from "Visual Polish" to "NLP Pipeline" (✅ complete). Original visual polish → Tier 8. Added Tier 9 (Analog Hybrid) and **Tier 10: World Interaction** (SEARCH, INTERACT, TALK_TO, INSPECT, REST, ASK_GM, DECLARE, EMOTE, STRATEGY).
- **Integration Priority List** — P1–P5 prioritization for connecting built systems to live UI. Phase 2 world intents deferred to Tier 10 (needs skill check system, object model, NPC dialogue).
- **Execution Summary** — Updated from planned sprints to completed sprints + next priorities.

### UI Wiring Cleanup
- **Intent system is now the PRIMARY path** — Removed legacy bridge-first logic from `main.mjs`. Previously: text input → try HTTP bridge (1.5s timeout) → fallback to intent system. Now: text input → intent system directly. No wasted network probe.
- **Removed bridge probe IIFE** — Eliminated startup probe that tried to reach `localhost:3002` and always failed (no bridge server running). Replaced with simple indicator assignment.
- **AI mode indicator** — Set to `"🤖 intent"` immediately on load (no async probe delay).
- **Architecture is now clean:**
  ```
  BEFORE: text → try bridge (1.5s timeout) → fallback to executeIntent()
  AFTER:  text → executeIntent() directly → done
  ```
- Bridge concept preserved in Sprint 3 multiplayer code (`net/eventBroadcast.mjs`) for future server deployment.

### What this enables
- Text input in the browser now goes through the full Parse → Plan → Execute pipeline with zero network delay
- AI mode indicator shows "intent" immediately (no flicker from failed probe)
- ~50 lines of dead code removed from main.mjs
- Clean separation: local play uses intent system, multiplayer will use WebSocket broadcast

---

## 2026-02-12 — Session 17: Tier 7.2 (LLM Intent Parser — Organic Language Comprehension)

**Commit:** pending | **Tests:** 1600 | **Status:** Tier 7 deepening

### Built
- **Tier 7.2: LLM Intent Parser** — Bridges OpenAI models into the intent pipeline:
  - `src/ai/intentPromptBuilder.mjs` — State summarizer (strips RNG/internals, concise entity list), system prompt teaching LLM all 11 intent types + tactical selectors + compound commands, user prompt builder with game state context
  - `src/ai/llmIntentParser.mjs` — `parseLLMIntent(text, state, adapter)`: calls LLM via model adapter, extracts JSON from any response format (raw object, string, markdown-fenced, nested .intent/.actions/.text/.content), validates against `validateIntent()`, automatic mock fallback on any failure (network, parse, validation)
  - `extractIntent()` — Robust multi-format response extractor (handles LLM quirks: markdown fences, extra text, nested wrappers)
- **UI Contract Fix** — `intentExecutor.mjs` now returns `.state`/`.events`/`.actions`/`.actionsExecuted` aliases alongside canonical names (both success and failure paths). Prevents UI crash from property name mismatch.
- **UI Contract Test** — Section 6 in `intent_system_test.mjs`: 30 assertions verify executeIntent() always returns all 9 UI-required keys

### Architecture — "The LLM understands; the engine decides."
```
Player Input → LLM (classify) → PlayerIntent JSON → Planner → DeclaredActions → Engine
                ↓ (on failure)
           Mock Parser (fallback)
```
- LLM output MUST pass `validateIntent()` — same schema as mock parser
- Planner + Executor unchanged — LLM is a drop-in parser replacement
- Fallback to mock parser on any failure: no adapter, API error, timeout, unparseable response, invalid intent
- LLM never sees RNG seeds or engine internals (sanitized state summary)
- Temperature 0.1 for classification (deterministic), max 200 tokens (intents are small JSON)

### Narrative Language Now Possible
The mock parser handles "attack the goblin" but fails on narrative input. With the LLM parser:
- *"I cautiously approach the dark figure"* → `{ type: "approach", target: "barkeep" }`
- *"I ready my blade and charge the nearest foe"* → `{ type: "attack", target: "nearest_hostile" }`
- *"Miri, fall back! Get behind Seren!"* → `{ type: "compound", steps: [flee, approach] }`
- *"I whisper a healing prayer over my wounded companion"* → `{ type: "use_ability", ability: "healing_word", target: "most_injured_ally" }`
- *"That's enough talking. Let steel do the rest."* → `{ type: "start_combat" }`

### Test delta: +142 (1458 → 1600)
- `tests/llm_intent_parser_test.mjs` — 112 tests (NEW): prompt builder (22), response extraction (17), LLM success (17), fallback (14), output contract (15), narrative language classification (12), + 5 edge cases
- `tests/intent_system_test.mjs` — 199 tests (+30 UI contract tests in Section 6)

---

## 2026-02-12 — Session 16: Tier 7.1 (Intent System — Natural Language → Engine Actions)

**Commit:** pending | **Tests:** 1458 | **Status:** Tier 7 started

### Built
- **Tier 7.1: Intent System** — Complete 3-stage NLP-to-action pipeline:
  - `src/ai/intentTypes.mjs` — 11 PlayerIntent types (MOVE_TO, ATTACK, USE_ABILITY, FLEE, DEFEND, COMPOUND, etc.), direction/target constants, tactical selectors (nearest_hostile, weakest_hostile, most_injured_ally), intent validation
  - `src/ai/mockIntentParser.mjs` — Keyword-based parser: conjugated verbs, tactical target phrases, ability patterns (firebolt, healing_word, sneak_attack, shield_bash), compound commands ("move then attack"), subject extraction ("Seren attacks the goblin"), coordinate/direction parsing
  - `src/ai/intentPlanner.mjs` — Converts intents → ordered DeclaredActions using pathfinding (A*), fuzzy entity resolution, ability catalogue lookup, tactical selectors, movement-speed trimming, auto-approach before attack/ability
  - `src/ai/intentExecutor.mjs` — Feeds planned actions through applyAction() sequentially, accumulates events/narration, graceful partial-success on compound commands, timing metadata
- Updated `src/ai/index.mjs` — barrel exports for full intent pipeline + legacy AI client

### Test delta: +169 (1289 → 1458)
- `tests/intent_system_test.mjs` — 169 tests (NEW): intent types & validation (13), mock parser (63), intent planner (28), executor (55), edge cases (10)

### Architecture
- **Parse → Plan → Execute**: Free-form text → PlayerIntent → ActionPlan → engine-validated state transitions
- Planner never mutates state; engine validates everything; partial execution supported
- Mock parser handles ~80% of common phrases without LLM; can be swapped for OpenAI intent parser later

---

## 2026-02-12 — Session 15: Tier 6.2 + 6.4 (Character Creator + Scenario Builder)

**Commit:** pending | **Tests:** 1289 | **Status:** Tier 6 progressing

### Built
- **Tier 6.2: Character Creator** (`src/content/characterCreator.mjs`) — 5 class templates (Fighter, Rogue, Wizard, Cleric, Ranger) with base stats, abilities, starting equipment. 5 preset named characters (Seren, Miri, Thorin, Elara, Finn). Factory functions: `createCharacter()`, `createFromPreset()`, `createParty()`. Character validation. Query by class, tag, preset.
- **Tier 6.4: Scenario Builder** (`src/content/scenarioBuilder.mjs`) — 4 map templates (Arena, Dungeon Corridor, Forest Clearing, Tavern) with terrain, player spawns, NPC spawn zones. `buildScenario()` combines party + encounter + map into complete ScenarioBundle. `quickBuild()` for one-call generation. Terrain mapping (walls block movement/vision, difficult terrain).

### Test delta: +51 (1238 → 1289)
- `tests/character_creator_test.mjs` — 30 tests (NEW): class constants, templates, presets, queries, createCharacter, createFromPreset, createParty, validateCharacter
- `tests/scenario_builder_test.mjs` — 21 tests (NEW): map templates, queries, buildScenario (structure, spawns, overlap, terrain, errors, difficulties, all maps), quickBuild

### Tier 6 Status: 3/7
- 6.2 Character Creator ✅ | 6.3 Monster Manual ✅ | 6.4 Scenario Builder ✅
- 6.1 Map Editor ⬜ | 6.5 Rule Modules ⬜ | 6.6 Community Sharing ⬜ | 6.7 Procedural Dungeon ⬜

---

## 2026-02-12 — Session 14: Tier 5.2 + 5.4 (Multi-Action Turns + Encounter Generation)

**Commit:** pending | **Tests:** 1238 | **Status:** Tier 5 nearing completion

### Built
- **Tier 5.2: Multi-Action Turn Planner** (`src/engine/multiActionTurn.mjs`) — D&D-style action economy for NPC turns: movement + action + bonus action per turn. Phase-based planning: ranged abilities at distance → move toward hostile → melee attack/ability when adjacent → bonus action (healing word on injured ally). Difficulty-aware ability usage probability. Budget tracking and validation.
- **Tier 5.4: Encounter Generator** (`src/content/encounterGenerator.mjs`) — XP-budgeted encounter creation from monster manual. CR-weighted group templates (swarm, balanced, elite_guard, boss_fight). Auto-instantiation from catalogue with tactical grid placement (spread, clustered, flanking). Difficulty estimation from XP totals.
- **Engine barrel export** — `multiActionTurn.mjs` functions added to `engine/index.mjs`

### Exported API
- `planMultiActionTurn(state, entityId, options)` — full action-economy NPC planning
- `summarizePlan(plan)` / `isPlanWithinBudget(plan)` — plan analysis
- `calculateXpBudget()` / `selectGroupTemplate()` / `fillEncounterSlots()` — encounter building blocks
- `generateEncounter(params)` — one-call encounter generation with placement
- `estimateDifficulty(totalXp, partySize)` — encounter difficulty labeling

### Test delta: +57 (1181 → 1238)
- `tests/multi_action_turn_test.mjs` — 31 tests (NEW): action budget, ability slots, basic/movement/ranged/bonus/melee planning, summarize, budget validation
- `tests/encounter_generator_test.mjs` — 26 tests (NEW): CR/XP tables, templates, budget calc, group template selection, slot filling, entity placement, full generation, difficulty estimation

### Tier 5 Status: 4/5 COMPLETE
- 5.1 AI Memory Context ✅ | 5.2 Multi-Action Turns ✅ | 5.3 Difficulty Presets ✅
- 5.4 Encounter Generation ✅ | 5.5 Model Adapter ✅

---

## 2026-02-12 — Session 13: Sprint 3 Complete (S3.4 + S3.6)

**Commit:** pending | **Tests:** 1181 | **Status:** Sprint 3 COMPLETE ✅

### Built
- **S3.4 Per-Player Fog of War** — `getEventPosition()`, `isEventVisible()` (global/spatial event classification), `filterEventsForClient()` (GM/spectator bypass, entity vision check), `prepareFogAwareBroadcast()` (per-client event filtering with injected visibility function), `redactStateForPlayer()` (NPC position redaction for hidden entities)
- **S3.6 Conflict Resolution** — `createActionQueue()`, `enqueueAction()`/`dequeueAction()` (FIFO with sequence numbers), `resolveQueueEntry()`, `getQueueDepth()`, `pruneQueue()`, `checkStaleAction()` (eventSeq-based staleness with tolerance), `validateTurnAuthority()` (server-authoritative turn enforcement), `prepareOptimisticAck()`, `processIncomingAction()` (full pipeline: permissions → turn authority → staleness → enqueue)

### Test delta: +47 (1134 → 1181)
- `tests/event_broadcast_test.mjs` — 128 tests (+47 for S3.4/S3.6)

### Sprint 3 Status: 6/6 COMPLETE ✅
- S3.1 WebSocket broadcast ✅ | S3.2 Roles & permissions ✅ | S3.3 Join codes ✅
- S3.4 Per-player fog ✅ | S3.5 Turn notifications ✅ | S3.6 Conflict resolution ✅

---

## 2026-02-12 — Session 12: Tests + Sprint 3.2/3.3/3.5

**Commit:** pending | **Tests:** 1134 | **Status:** Sprint 3 in progress

### Built
- **Tier 6.3 Monster Manual Tests** (`tests/monster_manual_test.mjs`) — 32 tests: CR constants, catalogue integrity, getMonster, listMonsters, filterByCR, filterByTag, searchMonsters, instantiateMonster, instantiateGroup
- **Tier 5.5 Model Adapter Tests** (`tests/model_adapter_test.mjs`) — 27 tests: register/get/list/unregister/clear adapters, mock/OpenAI/local adapter factories, active adapter selection
- **Tier 5.1 AI Memory Context Tests** (`tests/memory_context_test.mjs`) — 33 tests: roster summary, recent events, event summarization (11 event types), combat summary, narrative beats, map summary, full context, token estimation
- **S3.2 Player Roles & Permissions** — `ACTION_PERMISSIONS` matrix (9 action types × 3 roles), `canPerformAction()`, `validateActionPermission()` (role + action type + entity ownership), `assignEntityToClient()`, `unassignEntity()`, `getEntityController()`
- **S3.3 Session Join via Code** — `generateRoomCode()` (6-char unambiguous), `createRoomRegistry()`, `registryCreateRoom()` (auto-assigns code), `findRoomByCode()` (case-insensitive), `listRooms()`, `registryRemoveRoom()`, `joinRoomByCode()`
- **S3.5 Turn Notifications** — `prepareYourTurnNotification()` (targeted to controlling player), `prepareCombatEndNotification()` (broadcast), `prepareRoundStartNotification()` (broadcast with initiative order). New MessageTypes: `SERVER_YOUR_TURN`, `SERVER_COMBAT_END`, `SERVER_ROUND_START`

### Test delta: +139 (995 → 1134)
- `tests/monster_manual_test.mjs` — 32 tests (NEW)
- `tests/model_adapter_test.mjs` — 27 tests (NEW)
- `tests/memory_context_test.mjs` — 33 tests (NEW)
- `tests/event_broadcast_test.mjs` — 81 tests (+47 for S3.2/S3.3/S3.5)

---

## 2026-02-12 — Session 11: Sprint 3 + Tier 5/6 Groundwork

**Commit:** `793f6a8` | **Tests:** 995 + 34 new (broadcast)

### Built
- **Game Handbook** (`docs/mir_game_handbook.md`) — Full player reference: rules, abilities, conditions, difficulty, scenarios, controls
- **S3.1 WebSocket Event Broadcast** (`src/net/eventBroadcast.mjs`) — Room management, client registry, message protocol (encode/decode), event fan-out, action authorization (GM/player/spectator), state sync, turn notifications. **34/34 tests passing.**
- **Tier 6.3 Monster Manual** (`src/content/monsterManual.mjs`) — 14 monster templates across 4 CR tiers (minion/standard/elite/boss). Query by CR, tag, name search. `instantiateMonster()` and `instantiateGroup()` factory functions.
- **Tier 5.5 Model Adapter** (`src/ai/modelAdapter.mjs`) — Adapter registry pattern for multiple AI providers. Mock, OpenAI, and local LLM adapter factories. Active adapter selection + `callActiveAdapter()`.
- **Tier 5.1 AI Memory Context** (`src/ai/memoryContext.mjs`) — Context builder: roster summary, recent events, combat state, narrative beats, map summary. `buildFullContext()` + `estimateTokens()`.

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
