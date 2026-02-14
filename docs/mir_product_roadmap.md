# MIR Product Roadmap

> Master plan for evolving MIR from MVP to full market product.
> Last updated: 2026-02-12 · Session 18 · Tests: 1600

---

## Table of Contents

1. [Vision & Core Thesis](#vision--core-thesis)
2. [Current State Assessment](#current-state-assessment)
3. [Architectural Pillars](#architectural-pillars)
4. [Sprint Pipeline](#sprint-pipeline)
5. [Full Product Tiers](#full-product-tiers)
6. [Debuggability & Observability](#debuggability--observability)
7. [Infrastructure & Scaling](#infrastructure--scaling)
8. [Aspects Beyond Engineering](#aspects-beyond-engineering)
9. [Target Folder Structure](#target-folder-structure)
10. [Risk Register](#risk-register)

---

## 1. Vision & Core Thesis

> Most AI game tools ask: "How do we make AI creative?"
> MIR asks: **"How do we make AI trustworthy?"**

MIR is a deterministic, event-sourced game engine for hybrid analog-first tabletop RPGs with an AI Game Master. The AI proposes actions; the engine validates and executes. Every state change is explicit, logged, and reproducible.

**Product goal:** A platform where solo players and groups can run D&D-style combat encounters with an AI GM they can trust — because every dice roll, every move, every decision is auditable and deterministic.

---

## 2. Current State Assessment (Session 18 — 2026-02-12)

### What's Built — Full Inventory

| Area | Status | Tests | Module(s) |
|------|--------|-------|-----------|
| **Core Engine** (MOVE, ATTACK, ROLL_INITIATIVE, END_TURN, USE_ABILITY, SET_SEED) | ✅ | 95 | `engine/applyAction`, `movement`, `attack`, `initiative` |
| **Action→Event→State Pipeline** (deterministic, hash-verified) | ✅ | — | `engine/applyAction`, `replay/hash` |
| **A* Pathfinding** (cardinal, diagonal, terrain cost, blocked cells) | ✅ | 40+ | `engine/pathfinding` |
| **Death & Combat End** (HP→0 elimination, faction win detection) | ✅ | 30+ | `engine/combatEnd` |
| **NPC Strategy** (chase-and-attack, auto-turn execution) | ✅ | 30+ | `engine/npcTurnStrategy`, `combatController` |
| **Ability System** (Firebolt, Healing Word, Sneak Attack, Poison Strike, Shield Bash) | ✅ | 96 | `engine/abilities` |
| **Condition System** (dead, stunned, poisoned, prone, blessed, burning + duration) | ✅ | — | `engine/conditions` |
| **Fog of War** (Bresenham LOS, per-faction vision, terrain blocking) | ✅ | 18 | `engine/visibility` |
| **Difficulty Presets** (Easy/Normal/Hard/Deadly — NPC stat/behavior scaling) | ✅ | 31 | `engine/difficulty` |
| **Multi-Action Turn Planner** (D&D action economy: move + action + bonus) | ✅ | 31 | `engine/multiActionTurn` |
| **Event Narration** (human-readable descriptions for all event types) | ✅ | — | `engine/narrateEvent` |
| **Schema Validation** (JSON Schema 2020-12, pre-compiled, 25 invariants) | ✅ | 25 | `state/validation` |
| **AI Prompt Builder** (OpenAI message format, state context) | ✅ | 50 | `ai/aiPromptTemplate` |
| **AI Action Parser** (safety parser, schema validation) | ✅ | 82 | `ai/aiActionParser` |
| **AI Bridge Server** (HTTP bridge to OpenAI, rate limiting) | ✅ | 78 | `server/aiBridge` |
| **Intent System** (Parse→Plan→Execute pipeline, 11 intent types) | ✅ | 199 | `ai/intentTypes`, `mockIntentParser`, `intentPlanner`, `intentExecutor` |
| **LLM Intent Parser** (organic language → intent via OpenAI adapter) | ✅ | 112 | `ai/llmIntentParser`, `intentPromptBuilder` |
| **Model Adapter Registry** (mock, OpenAI, local LLM adapter pattern) | ✅ | 27 | `ai/modelAdapter` |
| **AI Memory Context** (roster, events, combat, narrative, map summary) | ✅ | 33 | `ai/memoryContext` |
| **Monster Manual** (14 templates, 4 CR tiers, query/instantiate) | ✅ | 32 | `content/monsterManual` |
| **Character Creator** (5 classes, 5 presets, party builder) | ✅ | 30 | `content/characterCreator` |
| **Scenario Builder** (4 map templates, party + encounter → scenario) | ✅ | 21 | `content/scenarioBuilder` |
| **Encounter Generator** (XP-budgeted, group templates, grid placement) | ✅ | 26 | `content/encounterGenerator` |
| **Replay System** (deterministic bundles, hash verification, runner) | ✅ | 40 | `replay/hash`, `replay/runReplay` |
| **Scenario System** (3 loadable scenarios + custom builder) | ✅ | 53 | `scenarios/`, scenario JSON files |
| **Persistence** (IndexedDB save/load, auto-save, import/export) | ✅ | 14 | `persistence/sessionStore`, `campaignStore` |
| **WebSocket Broadcast** (rooms, roles, permissions, fog, conflict resolution) | ✅ | 128 | `net/eventBroadcast` |
| **Browser UI** (grid, tokens, HP bars, click-to-move/attack, sounds, zoom, fog, initiative tracker, narration, difficulty, encounter builder, save/load) | ✅ | — | `ui/*` |
| **Foundation** (structured logger, runtime assertions, barrel exports) | ✅ | — | `core/*` |
| **Total automated tests** | **1600** | — | 28 test files |

### Sprint Completion Status

| Sprint | Status | Key Deliverables |
|--------|--------|-----------------|
| Sprint -1: Foundation | ✅ COMPLETE | Logger, assertions, barrel exports (TS migration deferred) |
| Sprint 0: Playable Demo | ✅ COMPLETE | Pathfinding, click-to-move/attack, NPC auto-turns, narration, death, HP bars, auto-flow combat |
| Sprint 1: Solid Game | ✅ COMPLETE | Abilities (5), conditions (6), difficult terrain, range validation, fog of war, zoom/pan, scenarios, sounds, initiative tracker, dice detail |
| Sprint 2: Persistence | ✅ COMPLETE | Session save/load, campaign model, auto-save, character persistence, import/export |
| Sprint 3: Multiplayer | ✅ COMPLETE | WebSocket broadcast, roles/permissions, join codes, per-player fog, turn notifications, conflict resolution |

### Tier Completion Status

| Tier | Status | What's Built | What Remains |
|------|--------|-------------|-------------|
| **Tier 5: Advanced AI** | ✅ 5/5 | Memory context, multi-action turns, difficulty presets, encounter gen, model adapter | — |
| **Tier 6: Content & Tools** | 🟡 3/7 | Character creator, monster manual, scenario builder | Map editor, rule modules, community sharing, procedural dungeons |
| **Tier 7: NLP Pipeline** | ✅ 2/2 | Intent system (mock parser), LLM intent parser (organic language) | — |
| Tier 8: Visual Polish | ⬜ 0/7 | — | Token sprites, terrain tiles, animations, themes |
| Tier 9: Analog Hybrid | ⬜ 0/5 | — | Voice input, TTS, dice camera, GM screen |
| Tier 10: World Interaction | ⬜ 0/9 | — | SEARCH, INTERACT, TALK_TO, INSPECT, REST, ASK_GM, DECLARE, EMOTE, STRATEGY intents |

### Current Architecture — What's Wired vs What's Built

```
┌─────────────────────────────────────────────────────────────────┐
│                        BROWSER UI                                │
│  Text Input ──→ onAiPropose() ──→ executeIntent() ──→ render()  │
│  Canvas Click ──→ dispatch(MOVE/ATTACK) ──→ render()             │
│  Buttons ──→ dispatch(ROLL_INITIATIVE/END_TURN) ──→ render()     │
└───────────────────────┬─────────────────────────────────────────┘
                        │
              ┌─────────▼─────────┐
              │   Intent System    │  ← PRIMARY (always used)
              │  Parse → Plan →    │
              │  Execute → State   │
              │  (mock parser)     │
              └─────────┬─────────┘
                        │
        ┌───────────────┼───────────────┐
        ▼               ▼               ▼
  ┌──────────┐   ┌──────────┐   ┌──────────┐
  │ applyAction│  │pathfinding│  │ conditions│
  │ (engine)  │  │   (A*)   │  │ abilities │
  └──────────┘   └──────────┘   └──────────┘

  WIRED AND ACTIVE:
  ├── ✅ LLM Parser (parseLLMIntent) — selectable in UI via adapter toggle
  ├── ✅ Multi-Action Turns — NPCs with abilities use action economy (move+action+bonus)
  ├── ✅ Memory Context — feeds into LLM prompts via intentPromptBuilder
  └── ⬜ WebSocket Broadcast — no live server instance yet
```

### Next Priority: Integration Wiring

The biggest gap is NOT missing features — it's **connecting built systems to the live UI**:

| Priority | What | Impact | Effort |
|----------|------|--------|--------|
| **P1** | Wire LLM parser as selectable mode in UI | Narrative language works | ✅ DONE |
| **P2** | Wire multi-action turns into NPC combat controller | Smarter NPCs | ✅ DONE (was already wired; stats field bug fixed Session 23) |
| **P3** | Content UI (encounter generator, character creator buttons) | Use Tier 5/6 systems | Medium |
| **P4** | Wire memory context into LLM prompts | Better AI understanding | ✅ DONE (was already wired in intentPromptBuilder) |
| **P5** | Live WebSocket server for multiplayer | Sprint 3 goes live | High |

---

## 3. Architectural Pillars

These are non-negotiable from this point forward. Every Sprint 0+ feature must conform.

### 3.1 TypeScript Everywhere

All new code in TypeScript. Migration of existing `.mjs` to `.ts` is Sprint -1 priority.

- All interfaces typed: `DeclaredAction`, `EngineEvent`, `GameState`, `AiProposalResult`
- Compiler catches shape mismatches that currently surface only at runtime
- Enables IDE autocomplete — faster development forever

### 3.2 Event Sourcing as Core Architecture

Already 80% built. Commit fully:

- GameState is **always derivable** from initial state + event sequence
- Save = save events. Load = replay events.
- Multiplayer sync = broadcast events.
- Time-travel debugging = step through events forward/backward.

### 3.3 Module Boundaries via Barrel Exports

Each module has ONE entry point (`index.ts`) exporting its public API:

```
src/engine/index.ts  → exports { applyAction, ActionResult, DeclaredAction }
src/ai/index.ts      → exports { proposeAction, AiProposalResult }
src/state/index.ts   → exports { validateAll, GameState }
src/net/index.ts     → exports { createServer, createClient }  // future
```

No reaching into internal files from outside a module.

### 3.4 Structured Logging

Replace all `console.log` with structured logger:

```typescript
{
  timestamp: string,
  level: "debug" | "info" | "warn" | "error",
  module: "engine" | "ai" | "ui" | "ws" | "persistence",
  correlationId: string,   // ties all logs in one action chain
  event: string,           // machine-readable: "MOVE_VALIDATED", "AI_CALL_START"
  payload: object,         // structured data
  durationMs?: number
}
```

### 3.5 Test Pyramid

| Layer | What | Run When | Budget |
|-------|------|----------|--------|
| Unit | Pure function tests | Every save | < 1 sec |
| Integration | Engine + AI + state | Pre-commit | < 5 sec |
| Scenario | Full encounter replay | Pre-push | < 15 sec |
| E2E | Browser automation | CI only | < 60 sec |

### 3.6 Error Boundaries & Runtime Assertions

```typescript
function applyAction(state: GameState, action: DeclaredAction): ActionResult {
  assert(state != null, "applyAction: state is null");
  assert(action?.type, "applyAction: action has no type");
  const result = /* ... */;
  assert(result.events.length > 0, "applyAction: produced zero events");
  return result;
}
```

Assertions throw with module + function + what failed. In production: error reports. In dev: immediate crash with context.

---

## 4. Sprint Pipeline

### Sprint -1: Foundation (3 days)

*Goal: Scalable framework before adding features.*

| ID | Task | Purpose |
|----|------|---------|
| F.1 | TypeScript migration of `src/engine/`, `src/ai/`, `src/state/` | Type safety for all core logic |
| F.2 | Structured logger (`src/core/logger.ts`) | Debuggability, replaces console.log |
| F.3 | Module barrel exports (`index.ts` per directory) | Clean boundaries |
| F.4 | CI pipeline (GitHub Actions: lint → typecheck → test) | Never ship broken code |
| F.5 | Error boundary module (`src/core/assert.ts`) | Crash loud, not silent |

### Sprint 0: Playable Demo (7 days)

*Goal: Someone loads the app, plays a combat encounter via chat, and says "this works."*

| ID | Feature | Why Critical | Days |
|----|---------|-------------|------|
| S0.1 | **Real OpenAI integration polished** — GPT-4o-mini understands "move Seren north and attack the goblin", returns structured action + narration | Mock parser is toy-level. Real AI makes the magic. | 1 |
| S0.2 | **NPC auto-turns via AI** — when it's an NPC's turn, AI proposes their move+attack automatically | Without this there's no opponent. | 1.5 |
| S0.3 | **Narration per action** — every event gets 1–2 sentence flavor text | This is the "wow" factor. | 1 |
| S0.4 | **Death/unconscious** — HP→0 removes from initiative, token grayed out, combat ends when side eliminated | Without this combat has no stakes or ending. | 0.5 |
| S0.5 | **Pathfinding (A\*)** — click destination cell, engine computes legal path | "move to 3,4" is terrible UX. | 1 |
| S0.6 | **Click-to-attack** — select token, click enemy, attack resolves | Same — keyboard-only kills the flow. | 0.5 |
| S0.7 | **Visual feedback** — hit/miss flash, damage number popup, HP bars on tokens | Makes combat readable at a glance. | 1 |
| S0.8 | **Auto-flow combat** — NPC turns play automatically with delay, then prompt player | Makes it feel like a game, not a CLI. | 0.5 |

### Sprint 1: Solid Game (Week 2–3)

*Goal: Full encounter feels mechanically correct and interesting.*

| ID | Feature | Days |
|----|---------|------|
| S1.1 | Spell/ability system (3+ abilities per character: Firebolt, Healing Word, Sneak Attack) | 2 |
| S1.2 | Conditions (poisoned, stunned, prone) with duration countdown | 1 |
| S1.3 | Difficult terrain costs 2x movement | 0.5 |
| S1.4 | Range validation (melee 5ft vs ranged 60ft) | 0.5 |
| S1.5 | Fog of war (visible radius per entity) | 1.5 |
| S1.6 | Map zoom + pan (mouse wheel, drag canvas) | 1 |
| S1.7 | 3 polished scenarios (tutorial, skirmish, boss fight) | 1 |
| S1.8 | Sound effects (hit, miss, initiative, death — 4 clips, HTML5 Audio) | 0.5 |
| S1.9 | Initiative tracker sidebar (visual turn order, current highlighted) | 0.5 |
| S1.10 | Combat log with dice detail ("d20(14)+5=19 vs AC 13 → HIT 7 dmg") | 0.5 |

### Sprint 2: Persistence (Week 3–4)

| ID | Feature | Days |
|----|---------|------|
| S2.1 | Session save/load (IndexedDB or file export) | 1.5 |
| S2.2 | Campaign model (ordered session list, shared entity roster) | 1 |
| S2.3 | Auto-save on every state transition | 0.5 |
| S2.4 | Character persistence across sessions | 1 |
| S2.5 | Import/Export (full campaign as JSON) | 0.5 |

### Sprint 3: Multiplayer (Week 4–6)

| ID | Feature | Days |
|----|---------|------|
| S3.1 | WebSocket event broadcast server | 2 |
| S3.2 | Player roles (GM vs Player, permission model) | 1 |
| S3.3 | Session join via code or link | 1 |
| S3.4 | Per-player fog of war | 2 |
| S3.5 | Turn notifications | 0.5 |
| S3.6 | Conflict resolution (optimistic UI + server authority) | 1.5 |

---

## 5. Full Product Tiers

Beyond Sprint 3, features are organized into tiers rather than sprints — work can be parallelized.

### Tier 5: Advanced AI ✅ COMPLETE

| ID | Feature | Status |
|----|---------|--------|
| 5.1 | AI memory (summarized context: last N events + entity roster + narrative beats) | ✅ `ai/memoryContext` |
| 5.2 | Multi-action turns (AI proposes move + attack + bonus action in one call) | ✅ `engine/multiActionTurn` |
| 5.3 | AI difficulty presets (easy/normal/hard controlling NPC aggression) | ✅ `engine/difficulty` |
| 5.4 | Encounter generation (AI creates balanced encounters from party data) | ✅ `content/encounterGenerator` |
| 5.5 | Model selection (GPT-4o, Claude, local LLM via adapter pattern) | ✅ `ai/modelAdapter` |

### Tier 6: Content & Tools (3/7)

| ID | Feature | Status |
|----|---------|--------|
| 6.1 | Map editor (visual grid editor: paint terrain, place objects) | ⬜ |
| 6.2 | Character creator (stats, abilities, equipment from templates) | ✅ `content/characterCreator` |
| 6.3 | Monster manual (pre-built NPC stat blocks) | ✅ `content/monsterManual` |
| 6.4 | Scenario editor (combine map + entities + AI instructions) | ✅ `content/scenarioBuilder` |
| 6.5 | Rule module system (pluggable rule sets: D&D 5e, PF2e, homebrew) | ⬜ |
| 6.6 | Community sharing (upload/download scenarios, maps, characters) | ⬜ |
| 6.7 | Procedural dungeon generator | ⬜ |

### Tier 7: NLP Pipeline ✅ COMPLETE (was "Visual Polish")

> **Note:** Tier 7 was repurposed. The original "Visual Polish" items moved to Tier 8.

| ID | Feature | Status |
|----|---------|--------|
| 7.1 | Intent system — 11 intent types, mock parser, planner, executor | ✅ `ai/intent*` |
| 7.2 | LLM intent parser — organic language comprehension via OpenAI adapter | ✅ `ai/llmIntentParser`, `intentPromptBuilder` |

### Tier 8: Visual Polish

| ID | Feature | Priority |
|----|---------|----------|
| 8.1 | Token sprites (character art replacing circles) | Medium |
| 8.2 | Terrain tiles (stone, wood, grass, water) | Medium |
| 8.3 | Move animation (smooth slide) | Medium |
| 8.4 | Attack animation (shake, flash) | Low |
| 8.5 | Particle effects (spell impacts) | Low |
| 8.6 | Dark/light theme | Low |
| 8.7 | Minimap | Low |

### Tier 9: Analog Hybrid Bridge

| ID | Feature | Priority |
|----|---------|----------|
| 9.1 | Voice-to-text input (browser Speech API or Whisper) | High |
| 9.2 | Text-to-speech narration (browser TTS for AI output) | Medium |
| 9.3 | Dice camera recognition (phone camera → OCR physical dice) | Low |
| 9.4 | GM screen mode (second-screen UI for table) | Medium |
| 9.5 | Quick NPC override (GM adjusts HP/position mid-combat) | Medium |

### Tier 10: World Interaction (Future)

> Extends the intent schema beyond combat into exploration, roleplay, and world manipulation.
> Requires: skill check system, object interaction model, NPC dialogue, LLM narration.

| ID | Feature | Engine Dependency | Priority |
|----|---------|------------------|----------|
| 10.1 | ASK_GM intent (player asks questions, LLM answers from state) | None (LLM narration only) | Low |
| 10.2 | INSPECT intent (examine objects/entities, reveal information) | Vision system (built) | Low |
| 10.3 | REST intent (short/long rest, HP recovery, cooldown reset) | Simple engine rules | Low |
| 10.4 | EMOTE/DECLARE intents (narrative RP, no mechanical effect) | None (logged + narrated) | Low |
| 10.5 | SEARCH intent (search room/body for traps/loot) | Skill check system | Medium |
| 10.6 | INTERACT intent (open chest, pull lever, light torch) | Object interaction model | Medium |
| 10.7 | TALK_TO intent (NPC dialogue, persuasion, intimidation) | NPC dialogue + skill checks | High |
| 10.8 | STRATEGY intent (AI suggests tactical positions) | AI analysis | Medium |
| 10.9 | Skill check system (generic d20+modifier for all checks) | New engine action type | Medium |

---

## 6. Debuggability & Observability

### How Bugs Get Found and Fixed

| Scenario | Detection | Time to Fix |
|----------|-----------|-------------|
| Wrong event shape | TypeScript compiler error | Instant |
| AI returns bad action | Parser type guard + assertion | Seconds (log shows exact field) |
| State corruption | Invariant check on every transition + hash verification | Minutes (replay exact events) |
| Race condition (multiplayer) | Correlation ID in logs → trace event ordering | Minutes |
| "It worked yesterday" | Deterministic replay → re-run exact inputs → diff | Minutes |
| Production crash | Structured error log with full context | Hour (reproduce locally) |

### Debug Tooling

| Tool | When Built | Purpose |
|------|-----------|---------|
| Structured logger | Sprint -1 | Filter by module, trace action chains |
| Runtime assertions | Sprint -1 | Crash loud with context |
| Deterministic replay | ✅ Built | Reproduce any session exactly |
| State hash verification | ✅ Built | Detect corruption immediately |
| Event log viewer | ✅ Built | Inspect game history |
| UI debug panel | Sprint 1 | Live log stream with filter in browser |
| Error tracking (Sentry) | Sprint 3+ | Production crash reports |

---

## 7. Infrastructure & Scaling

### Near-Term (Sprint -1 to Sprint 1)

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Language | TypeScript (strict mode) | Type safety, refactoring confidence |
| Build | tsc + esbuild (or tsup) | Fast compilation, tree-shaking |
| Test runner | Node built-in test runner | Zero-dep, fast |
| CI | GitHub Actions | Lint → typecheck → test on every push |
| Linting | ESLint + Prettier (already present) | Code consistency |

### Medium-Term (Sprint 2–3)

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Persistence | IndexedDB (browser) + SQLite (server) | Session/campaign storage |
| Real-time | WebSocket (ws library or native) | Multiplayer event broadcast |
| State sync | Event-sourced (broadcast EngineEvents) | Efficient, deterministic |
| Auth | OAuth2 (Google/Discord) | User identity |

### Long-Term (Tier 6+)

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Database | PostgreSQL | Campaigns, users, shared content |
| Hosting | Vercel (frontend) + Railway/Fly.io (API + WS) | Scalable deployment |
| CDN | Cloudflare | Static assets, map tiles |
| AI billing | Token tracking middleware | Per-user AI cost control |
| Monitoring | Sentry + structured log aggregation | Production observability |
| Backup | Automated DB snapshots | Data safety |

### Scaling Model

```
Phase 1 (local):   Browser ←→ Node server (same machine)
Phase 2 (hosted):  Browser ←→ API server ←→ DB + AI provider
Phase 3 (scaled):  Browser ←→ CDN + Edge ←→ API cluster ←→ DB + AI provider + WS cluster
```

The event-sourced architecture means:
- **Horizontal scaling** of read-only state: any server can replay events to rebuild state
- **WebSocket fan-out**: single event write, broadcast to N clients
- **AI calls are stateless**: can be load-balanced across API servers
- **State is portable**: export a campaign = export its event log

---

## 8. Aspects Beyond Engineering

### Monetization

| Tier | What | Price Point |
|------|------|-------------|
| Free | Solo play, mock AI, 1 save slot | $0 |
| Pro | Real AI (monthly token budget), unlimited saves, multiplayer hosting | $5–10/mo |
| GM Tier | Unlimited AI tokens, priority API, custom model selection, scenario sharing | $15–20/mo |
| Content Packs | Pre-built campaigns, monster manuals, map collections | $3–5 each |

AI token budgeting: track OpenAI spend per user, enforce monthly limits, show usage dashboard.

### Accessibility

- Screen reader (ARIA labels on grid, tokens, events)
- Keyboard navigation (tab entities, arrow-key movement)
- Color-blind modes (pattern terrain, high-contrast tokens)
- Font size controls
- Reduced motion option (disable animations)

### Localization (i18n)

- UI strings externalized to JSON locale files
- AI prompts localized (system prompt per language)
- Date/number formatting per locale
- RTL support (Arabic/Hebrew)

### Content Safety & Moderation

- AI output filtering (no slurs, configurable violence level)
- User content review pipeline (for community sharing)
- Report mechanism for shared scenarios
- Age-appropriate content ratings (E10+, T, M)

### Legal

- Terms of Service
- Privacy Policy + GDPR compliance (data export, deletion)
- License audit for open-source dependencies
- D&D OGL/SRD compliance review (if using official terminology)
- Content ownership (user-created scenarios remain user-owned)

### Developer Experience / API

- Public REST/WS API for third-party integrations
- Plugin system (custom actions, custom renderers)
- SDK for scenario creation
- OpenAPI spec documentation
- Developer portal with API keys and usage tracking

### Offline / PWA

- Service worker for offline play
- IndexedDB state persistence
- PWA manifest (install prompt)
- Sync when back online (event queue)

---

## 9. Target Folder Structure

```
src/
  core/             — logger, assert, types, config, constants
  engine/           — applyAction, movement, attack, initiative, RNG (pure, no I/O)
    index.ts        — public API barrel export
    pathfinding.ts  — A* grid pathfinding (Sprint 0)
  ai/               — prompt builder, parser, client, bridge
    index.ts        — public API
  state/            — validation, schemas, serialization
    index.ts        — public API
  net/              — WebSocket server/client (Sprint 3)
    index.ts
  persistence/      — save/load, IndexedDB, campaign model (Sprint 2)
    index.ts
  ui/               — renderer, input, components, styles
  scenarios/        — loader, lister
  replay/           — hash, runner
tests/
  unit/             — fast pure function tests (< 1 sec)
  integration/      — engine + AI pipeline tests (< 5 sec)
  scenario/         — full encounter replays (< 15 sec)
  e2e/              — browser automation via Playwright (CI only)
docs/
  mir_product_roadmap.md  — this file
  mir_overview.md
  mir_state_model.md
  mir_engine_contract.md
  mir_action_model.md
  mir_event_model.md
  mir_ai_integration.md
  mir_replay_format.md
  mir_state_invariants.md
  ...
schemas/
  mir_gamestate.schema.json
  mir_types.schema.json
scenarios/
  *.scenario.json
replays/
  *.replay.json
fixtures/
  test data
```

---

## 10. Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| OpenAI API cost spirals | High | Token budgeting, mock fallback, local LLM adapter |
| TypeScript migration breaks tests | Medium | Migrate module-by-module, run tests after each |
| AI returns unusable actions | Medium | Parser whitelist + engine validation (already built) |
| Multiplayer state desync | High | Event sourcing + server authority + hash verification |
| D&D IP/OGL legal issues | High | Use generic terms ("hit points" not D&D-specific) |
| Scope creep delays MVP | High | Sprint 0 is locked: 8 features, 7 days, no additions |
| Single developer bottleneck | Medium | Clean module boundaries enable parallel work |
| Browser performance with large maps | Medium | Canvas rendering (already chosen), viewport culling |

---

## Execution Summary

### Completed (Sessions 1–17, Feb 9–12 2026)

```
✅ Sprint -1  — Foundation (logger, assertions, barrel exports)
✅ Sprint 0   — Playable demo (pathfinding, click-to-play, NPC turns, narration, death, HP bars)
✅ Sprint 1   — Solid game (abilities, conditions, terrain, fog, zoom, sounds, scenarios, dice detail)
✅ Sprint 2   — Persistence (save/load, campaigns, auto-save, import/export)
✅ Sprint 3   — Multiplayer (WebSocket, roles, join codes, fog, turn notifications, conflict resolution)
✅ Tier 5     — Advanced AI (memory context, multi-action turns, difficulty, encounters, model adapter)
✅ Tier 6     — Content (3/7: character creator, monster manual, scenario builder)
✅ Tier 7     — NLP Pipeline (intent system, LLM intent parser)
   Total:       1600 automated tests, 28 test files, 17 sessions
```

### Next Priorities (Updated Session 23 — 2026-02-14)

```
✅ DONE:    P1 — LLM parser wired into UI (selectable mock/LLM mode)
✅ DONE:    P2 — Multi-action turns wired into NPC combat controller
✅ DONE:    P4 — Memory context wired into LLM prompts
✅ DONE:    Versioning framework (Husky pre-commit, semver, CI, branch protection guide)

NEXT:     P3 — Content UI (encounter generator, character creator buttons in browser)
NEXT:     P7 — Ability UI buttons (USE_ABILITY clickable in combat)
NEXT:     P5 — Live WebSocket server for multiplayer
THEN:     F1 — TypeScript migration (start with src/engine/)
THEN:     L1 — Replace console.log with structured logger
LATER:    Tier 6 remaining — Map editor, rule modules, procedural dungeons
LATER:    Tier 8  — Visual polish (sprites, terrain tiles, animations)
LATER:    Tier 9  — Analog hybrid (voice input, TTS, dice camera)
FUTURE:   Tier 10 — World interaction (SEARCH, INTERACT, TALK_TO, REST, etc.)
ONGOING:  Testing, accessibility, legal, monetization design
```

**Current priority: Content UI → TypeScript migration → Polish → Market.**
