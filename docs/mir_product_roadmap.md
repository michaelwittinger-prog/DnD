# MIR Product Roadmap

> Master plan for evolving MIR from MVP to full market product.
> Last updated: 2026-02-17 · Session 25 · Tests: 1600+
>
> **Changelog:** Restructured into 3 detail levels (L0 Quick View / L1 Planning View / L2 Execution View) for intuitive navigation.

---

## How to Read This Roadmap

This document is organized into **three detail levels**. Jump to the one that fits your need:

| Level | Name | For whom | Time to read |
|-------|------|----------|-------------|
| **[L0 — Quick View](#l0--quick-view)** | Executive snapshot | Anyone checking status | 30 seconds |
| **[L1 — Planning View](#l1--planning-view)** | Sprint & Tier status matrix | Decision-makers, sprint planning | 3 minutes |
| **[L2 — Execution View](#l2--execution-view)** | Full feature breakdown, architecture, risks | Implementers, deep review | 15+ minutes |

**Status labels used throughout:**

| Label | Meaning |
|-------|---------|
| ✅ Complete | Implemented, tested, merged |
| 🟡 In Progress | Partially done or integration pending |
| ⬜ Not Started | Defined but no code yet |
| ⛔ Blocked | Cannot proceed (dependency/decision needed) |

[↑ back to top](#mir-product-roadmap)

---

# L0 — Quick View

> **One-screen summary. Where are we? What's next?**

## Overall Progress

```
Sprints:  ██████████████████████████████████████████  5/5  (100%)
Tiers:    ████████████████████░░░░░░░░░░░░░░░░░░░░░  3/6  (50%)
```

| Block | Status | Items |
|-------|--------|-------|
| Sprint -1 Foundation | ✅ Complete | Logger, assertions, barrel exports |
| Sprint 0 Playable Demo | ✅ Complete | Pathfinding, click-to-play, NPC turns, narration, death |
| Sprint 1 Solid Game | ✅ Complete | Abilities, conditions, fog, zoom, sounds, scenarios |
| Sprint 2 Persistence | ✅ Complete | Save/load, campaigns, auto-save, import/export |
| Sprint 3 Multiplayer | ✅ Complete | WebSocket, roles, join codes, fog, conflict resolution |
| Tier 5 Advanced AI | ✅ Complete | Memory, multi-action turns, difficulty, encounters, model adapter |
| Tier 6 Content & Tools | ✅ Complete | Char creator, monsters, scenarios, map editor, rules, community, dungeons |
| Tier 7 NLP Pipeline | ✅ Complete | Intent system (11 types), LLM intent parser |
| **Tier 8 Visual Polish** | **⬜ Not Started** | Sprites, terrain tiles, animations, themes, minimap |
| **Tier 9 Analog Hybrid** | **⬜ Not Started** | Voice input, TTS, dice camera, GM screen |
| **Tier 10 World Interaction** | **⬜ Not Started** | SEARCH, INTERACT, TALK_TO, REST, skill checks |

## Now / Next / Later

| NOW | NEXT | LATER |
|-----|------|-------|
| Content UI buttons in browser (P3) | Tier 8: Visual Polish — sprites & animations | Tier 10: World interaction intents |
| Ability UI buttons (P7) | Tier 9: Analog Hybrid — voice & TTS | Monetization & deployment |
| Live WebSocket server (P5) | TypeScript migration | Accessibility & i18n |

## Top 3 Blockers

1. No live WebSocket server instance yet (Sprint 3 code built but not deployed)
2. TypeScript migration not started (all code still `.mjs`)
3. No CI browser-automation tests yet (E2E layer empty)

[↑ back to top](#mir-product-roadmap)

---

# L1 — Planning View

> **Tier & Sprint status matrix. Enough detail for sprint planning decisions.**

## Sprint Completion Matrix

| Sprint | Status | Key Deliverables | Tests | Sessions |
|--------|--------|-----------------|-------|----------|
| Sprint -1: Foundation | ✅ Complete | Logger, assertions, barrel exports (TS migration deferred) | — | 1–2 |
| Sprint 0: Playable Demo | ✅ Complete | Pathfinding, click-to-move/attack, NPC auto-turns, narration, death, HP bars, auto-flow | ~100 | 3–6 |
| Sprint 1: Solid Game | ✅ Complete | 5 abilities, 6 conditions, terrain, fog of war, zoom/pan, scenarios, sounds, initiative, dice detail | ~200 | 7–10 |
| Sprint 2: Persistence | ✅ Complete | IndexedDB save/load, campaign model, auto-save, character persistence, import/export | 14 | 11–12 |
| Sprint 3: Multiplayer | ✅ Complete | WebSocket broadcast, roles/permissions, join codes, per-player fog, turn notifications, conflict resolution | 128 | 13–15 |

## Tier Completion Matrix

| Tier | Status | Done | Total | % | Remaining Items |
|------|--------|------|-------|---|----------------|
| **Tier 5: Advanced AI** | ✅ Complete | 5 | 5 | 100% | — |
| **Tier 6: Content & Tools** | ✅ Complete | 7 | 7 | 100% | — |
| **Tier 7: NLP Pipeline** | ✅ Complete | 2 | 2 | 100% | — |
| **Tier 8: Visual Polish** | ⬜ Not Started | 0 | 7 | 0% | Sprites, terrain tiles, move anim, attack anim, particles, themes, minimap |
| **Tier 9: Analog Hybrid** | ⬜ Not Started | 0 | 5 | 0% | Voice input, TTS, dice camera, GM screen, quick NPC override |
| **Tier 10: World Interaction** | ⬜ Not Started | 0 | 9 | 0% | ASK_GM, INSPECT, REST, EMOTE, SEARCH, INTERACT, TALK_TO, STRATEGY, skill checks |

## Priority Queue (Updated Session 25)

| Priority | Item | Status | Impact |
|----------|------|--------|--------|
| P1 | LLM parser wired into UI | ✅ Done | Narrative language works |
| P2 | Multi-action turns in NPC controller | ✅ Done | Smarter NPCs |
| P3 | Content UI (encounter gen, char creator buttons) | 🟡 Wired, needs browser smoke | Use Tier 5/6 in browser |
| P4 | Memory context in LLM prompts | ✅ Done | Better AI understanding |
| P5 | Live WebSocket server for multiplayer | ⬜ Not Started | Sprint 3 goes live |
| P7 | Ability UI buttons (USE_ABILITY clickable) | ⬜ Not Started | Abilities usable in combat |
| F1 | TypeScript migration (start with engine/) | ⬜ Not Started | Type safety, IDE support |
| L1 | Replace console.log with structured logger | ⬜ Not Started | Debuggability |

## Wiring Status (What's Built vs What's Connected)

```
WIRED AND ACTIVE:
├── ✅ LLM Parser (parseLLMIntent) — selectable in UI
├── ✅ Multi-Action Turns — NPCs use action economy
├── ✅ Memory Context — feeds into LLM prompts
├── ✅ Content panels — character creator, monsters, dungeons, rules, community
└── ⬜ WebSocket Broadcast — code built, no live server instance
```

[↑ back to top](#mir-product-roadmap)

---

# L2 — Execution View

> **Full feature breakdown, architecture, dependencies, risks. For implementers.**

---

## Vision & Core Thesis

> Most AI game tools ask: "How do we make AI creative?"
> MIR asks: **"How do we make AI trustworthy?"**

MIR is a deterministic, event-sourced game engine for hybrid analog-first tabletop RPGs with an AI Game Master. The AI proposes actions; the engine validates and executes. Every state change is explicit, logged, and reproducible.

**Product goal:** A platform where solo players and groups can run D&D-style combat encounters with an AI GM they can trust — because every dice roll, every move, every decision is auditable and deterministic.

[↑ back to top](#mir-product-roadmap)

---

## Full Inventory (What's Built)

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
| **Map Editor** (visual grid editor: paint terrain, place objects) | ✅ | — | `content/mapEditor` |
| **Rule Module System** (pluggable rule sets: core 5e lite, homebrew) | ✅ | — | `rules/ruleModuleRegistry`, `rules/modules/*` |
| **Community Registry** (upload/download scenarios, maps, characters) | ✅ | — | `content/communityRegistry` |
| **Procedural Dungeon Generator** | ✅ | — | `content/dungeonGenerator` |
| **Replay System** (deterministic bundles, hash verification, runner) | ✅ | 40 | `replay/hash`, `replay/runReplay` |
| **Scenario System** (3 loadable scenarios + custom builder) | ✅ | 53 | `scenarios/`, scenario JSON files |
| **Persistence** (IndexedDB save/load, auto-save, import/export) | ✅ | 14 | `persistence/sessionStore`, `campaignStore` |
| **WebSocket Broadcast** (rooms, roles, permissions, fog, conflict resolution) | ✅ | 128 | `net/eventBroadcast` |
| **Browser UI** (grid, tokens, HP bars, click-to-move/attack, sounds, zoom, fog, initiative tracker, narration, difficulty, encounter builder, save/load) | ✅ | — | `ui/*` |
| **Foundation** (structured logger, runtime assertions, barrel exports) | ✅ | — | `core/*` |
| **Total automated tests** | **1600+** | — | 28+ test files |

[↑ back to top](#mir-product-roadmap)

---

## Sprint Details

### Sprint -1: Foundation ✅

| ID | Task | Purpose |
|----|------|---------|
| F.1 | TypeScript migration of `src/engine/`, `src/ai/`, `src/state/` | Type safety for all core logic |
| F.2 | Structured logger (`src/core/logger.ts`) | Debuggability, replaces console.log |
| F.3 | Module barrel exports (`index.ts` per directory) | Clean boundaries |
| F.4 | CI pipeline (GitHub Actions: lint → typecheck → test) | Never ship broken code |
| F.5 | Error boundary module (`src/core/assert.ts`) | Crash loud, not silent |

### Sprint 0: Playable Demo ✅

| ID | Feature | Days |
|----|---------|------|
| S0.1 | Real OpenAI integration polished | 1 |
| S0.2 | NPC auto-turns via AI | 1.5 |
| S0.3 | Narration per action | 1 |
| S0.4 | Death/unconscious (HP→0, combat end) | 0.5 |
| S0.5 | Pathfinding (A*) | 1 |
| S0.6 | Click-to-attack | 0.5 |
| S0.7 | Visual feedback (hit/miss, damage, HP bars) | 1 |
| S0.8 | Auto-flow combat | 0.5 |

### Sprint 1: Solid Game ✅

| ID | Feature | Days |
|----|---------|------|
| S1.1 | Spell/ability system (5 abilities) | 2 |
| S1.2 | Conditions (6 types + duration countdown) | 1 |
| S1.3 | Difficult terrain (2x movement cost) | 0.5 |
| S1.4 | Range validation (melee 5ft vs ranged 60ft) | 0.5 |
| S1.5 | Fog of war (Bresenham LOS) | 1.5 |
| S1.6 | Map zoom + pan | 1 |
| S1.7 | 3 polished scenarios | 1 |
| S1.8 | Sound effects (4 clips) | 0.5 |
| S1.9 | Initiative tracker sidebar | 0.5 |
| S1.10 | Combat log with dice detail | 0.5 |

### Sprint 2: Persistence ✅

| ID | Feature | Days |
|----|---------|------|
| S2.1 | Session save/load (IndexedDB or file export) | 1.5 |
| S2.2 | Campaign model | 1 |
| S2.3 | Auto-save on every state transition | 0.5 |
| S2.4 | Character persistence across sessions | 1 |
| S2.5 | Import/Export (full campaign as JSON) | 0.5 |

### Sprint 3: Multiplayer ✅

| ID | Feature | Days |
|----|---------|------|
| S3.1 | WebSocket event broadcast server | 2 |
| S3.2 | Player roles (GM vs Player, permission model) | 1 |
| S3.3 | Session join via code or link | 1 |
| S3.4 | Per-player fog of war | 2 |
| S3.5 | Turn notifications | 0.5 |
| S3.6 | Conflict resolution (optimistic UI + server authority) | 1.5 |

[↑ back to top](#mir-product-roadmap)

---

## Tier Details

### Tier 5: Advanced AI ✅ Complete (5/5)

| ID | Feature | Status | Module |
|----|---------|--------|--------|
| 5.1 | AI memory (summarized context) | ✅ | `ai/memoryContext` |
| 5.2 | Multi-action turns (move + action + bonus) | ✅ | `engine/multiActionTurn` |
| 5.3 | AI difficulty presets (easy/normal/hard/deadly) | ✅ | `engine/difficulty` |
| 5.4 | Encounter generation (XP-budgeted) | ✅ | `content/encounterGenerator` |
| 5.5 | Model selection (adapter pattern) | ✅ | `ai/modelAdapter` |

### Tier 6: Content & Tools ✅ Complete (7/7)

| ID | Feature | Status | Module |
|----|---------|--------|--------|
| 6.1 | Map editor (visual grid editor) | ✅ | `content/mapEditor` |
| 6.2 | Character creator (stats, abilities, equipment) | ✅ | `content/characterCreator` |
| 6.3 | Monster manual (14 templates, 4 CR tiers) | ✅ | `content/monsterManual` |
| 6.4 | Scenario editor (map + entities + AI instructions) | ✅ | `content/scenarioBuilder` |
| 6.5 | Rule module system (pluggable rule sets) | ✅ | `rules/ruleModuleRegistry`, `rules/modules/*` |
| 6.6 | Community sharing (upload/download) | ✅ | `content/communityRegistry` |
| 6.7 | Procedural dungeon generator | ✅ | `content/dungeonGenerator` |

### Tier 7: NLP Pipeline ✅ Complete (2/2)

| ID | Feature | Status | Module |
|----|---------|--------|--------|
| 7.1 | Intent system (11 types, mock parser, planner, executor) | ✅ | `ai/intent*` |
| 7.2 | LLM intent parser (organic language via OpenAI) | ✅ | `ai/llmIntentParser`, `intentPromptBuilder` |

### Tier 8: Visual Polish ⬜ Not Started (0/7)

| ID | Feature | Priority | Dependencies |
|----|---------|----------|-------------|
| 8.1 | Token sprites (character art replacing circles) | Medium | Asset pipeline |
| 8.2 | Terrain tiles (stone, wood, grass, water) | Medium | Asset pipeline |
| 8.3 | Move animation (smooth slide between cells) | Medium | Canvas renderer refactor |
| 8.4 | Attack animation (shake, flash on hit/miss) | Low | Canvas renderer refactor |
| 8.5 | Particle effects (spell impacts, fire, healing) | Low | Canvas renderer refactor |
| 8.6 | Dark/light theme toggle | Low | CSS variables |
| 8.7 | Minimap (overview of full grid) | Low | Canvas secondary viewport |

### Tier 9: Analog Hybrid Bridge ⬜ Not Started (0/5)

| ID | Feature | Priority | Dependencies |
|----|---------|----------|-------------|
| 9.1 | Voice-to-text input (browser Speech API or Whisper) | High | Intent system (✅ built) |
| 9.2 | Text-to-speech narration (browser TTS for AI output) | Medium | Narration system (✅ built) |
| 9.3 | Dice camera recognition (phone camera → OCR physical dice) | Low | External library / API |
| 9.4 | GM screen mode (second-screen UI for table) | Medium | UI layout system |
| 9.5 | Quick NPC override (GM adjusts HP/position mid-combat) | Medium | Permission model (✅ built) |

### Tier 10: World Interaction ⬜ Not Started (0/9)

> Extends the intent schema beyond combat into exploration, roleplay, and world manipulation.
> Requires: skill check system, object interaction model, NPC dialogue, LLM narration.

| ID | Feature | Engine Dependency | Priority |
|----|---------|------------------|----------|
| 10.1 | ASK_GM intent (player asks questions, LLM answers) | None (LLM narration only) | Low |
| 10.2 | INSPECT intent (examine objects/entities) | Vision system (✅ built) | Low |
| 10.3 | REST intent (short/long rest, HP recovery) | Simple engine rules | Low |
| 10.4 | EMOTE/DECLARE intents (narrative RP, no mechanical effect) | None (logged + narrated) | Low |
| 10.5 | SEARCH intent (search room/body for traps/loot) | Skill check system | Medium |
| 10.6 | INTERACT intent (open chest, pull lever, light torch) | Object interaction model | Medium |
| 10.7 | TALK_TO intent (NPC dialogue, persuasion, intimidation) | NPC dialogue + skill checks | High |
| 10.8 | STRATEGY intent (AI suggests tactical positions) | AI analysis | Medium |
| 10.9 | Skill check system (generic d20+modifier) | New engine action type | Medium |

[↑ back to top](#mir-product-roadmap)

---

## Architectural Pillars

These are non-negotiable from this point forward. Every feature must conform.

### TypeScript Everywhere
All new code in TypeScript. Migration of existing `.mjs` to `.ts` is a tracked priority.

### Event Sourcing as Core Architecture
GameState is **always derivable** from initial state + event sequence. Save = save events. Load = replay events. Multiplayer sync = broadcast events.

### Module Boundaries via Barrel Exports
Each module has ONE entry point (`index.ts`) exporting its public API. No reaching into internal files.

### Structured Logging
Replace all `console.log` with structured logger: `{ timestamp, level, module, correlationId, event, payload, durationMs }`.

### Test Pyramid

| Layer | What | Run When | Budget |
|-------|------|----------|--------|
| Unit | Pure function tests | Every save | < 1 sec |
| Integration | Engine + AI + state | Pre-commit | < 5 sec |
| Scenario | Full encounter replay | Pre-push | < 15 sec |
| E2E | Browser automation | CI only | < 60 sec |

### Error Boundaries & Runtime Assertions
Assertions throw with module + function + what failed. In production: error reports. In dev: immediate crash with context.

[↑ back to top](#mir-product-roadmap)

---

## Architecture Diagram

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
              │  (mock or LLM)     │
              └─────────┬─────────┘
                        │
        ┌───────────────┼───────────────┐
        ▼               ▼               ▼
  ┌──────────┐   ┌──────────┐   ┌──────────┐
  │ applyAction│  │pathfinding│  │ conditions│
  │ (engine)  │  │   (A*)   │  │ abilities │
  └──────────┘   └──────────┘   └──────────┘
```

[↑ back to top](#mir-product-roadmap)

---

## Infrastructure & Scaling

### Near-Term

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Language | TypeScript (strict mode) | Type safety |
| Build | tsc + esbuild | Fast compilation |
| Test runner | Node built-in test runner | Zero-dep |
| CI | GitHub Actions | Lint → typecheck → test |

### Medium-Term

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Persistence | IndexedDB (browser) + SQLite (server) | Storage |
| Real-time | WebSocket (ws library) | Multiplayer |
| Auth | OAuth2 (Google/Discord) | User identity |

### Long-Term

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Database | PostgreSQL | Campaigns, users |
| Hosting | Vercel + Railway/Fly.io | Scalable deployment |
| CDN | Cloudflare | Static assets |
| AI billing | Token tracking middleware | Cost control |
| Monitoring | Sentry + structured logs | Observability |

### Scaling Model

```
Phase 1 (local):   Browser ←→ Node server (same machine)
Phase 2 (hosted):  Browser ←→ API server ←→ DB + AI provider
Phase 3 (scaled):  Browser ←→ CDN + Edge ←→ API cluster ←→ DB + AI + WS cluster
```

[↑ back to top](#mir-product-roadmap)

---

## Debuggability & Observability

| Scenario | Detection | Time to Fix |
|----------|-----------|-------------|
| Wrong event shape | TypeScript compiler error | Instant |
| AI returns bad action | Parser type guard + assertion | Seconds |
| State corruption | Invariant check + hash verification | Minutes |
| Race condition | Correlation ID logs → trace ordering | Minutes |
| "It worked yesterday" | Deterministic replay → diff | Minutes |

| Debug Tool | Status | Purpose |
|------------|--------|---------|
| Structured logger | ✅ Built | Filter by module, trace chains |
| Runtime assertions | ✅ Built | Crash loud with context |
| Deterministic replay | ✅ Built | Reproduce any session |
| State hash verification | ✅ Built | Detect corruption |
| Event log viewer | ✅ Built | Inspect history |

[↑ back to top](#mir-product-roadmap)

---

## Beyond Engineering

### Monetization

| Tier | What | Price Point |
|------|------|-------------|
| Free | Solo play, mock AI, 1 save slot | $0 |
| Pro | Real AI, unlimited saves, multiplayer | $5–10/mo |
| GM Tier | Unlimited AI tokens, priority API, custom models | $15–20/mo |
| Content Packs | Pre-built campaigns, monsters, maps | $3–5 each |

### Accessibility
- Screen reader (ARIA labels), keyboard navigation, color-blind modes, font size controls, reduced motion option

### Localization (i18n)
- UI strings → JSON locale files, AI prompts per language, RTL support

### Content Safety
- AI output filtering, user content review pipeline, report mechanism, age ratings

### Legal
- ToS, Privacy Policy + GDPR, OGL/SRD compliance, content ownership

### Developer API
- Public REST/WS API, plugin system, SDK, OpenAPI spec, developer portal

### Offline / PWA
- Service worker, IndexedDB persistence, PWA manifest, sync-on-reconnect

[↑ back to top](#mir-product-roadmap)

---

## Target Folder Structure

```
src/
  core/             — logger, assert, types, config
  engine/           — applyAction, movement, attack, initiative (pure, no I/O)
  ai/               — prompt builder, parser, client, bridge, intent system
  state/            — validation, schemas, serialization
  net/              — WebSocket server/client
  persistence/      — save/load, IndexedDB, campaigns
  content/          — character creator, monster manual, map editor, dungeons
  rules/            — rule module registry, pluggable rule sets
  scenarios/        — loader, lister
  replay/           — hash, runner
  ui/               — renderer, input, components, styles
  server/           — API server, AI bridge
  adapters/         — model adapters (OpenAI, ChatGPT, etc.)
tests/
docs/
schemas/
scenarios/
replays/
fixtures/
```

[↑ back to top](#mir-product-roadmap)

---

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| OpenAI API cost spirals | High | Token budgeting, mock fallback, local LLM adapter |
| TypeScript migration breaks tests | Medium | Migrate module-by-module, test after each |
| AI returns unusable actions | Medium | Parser whitelist + engine validation (built) |
| Multiplayer state desync | High | Event sourcing + server authority + hash verification |
| D&D IP/OGL legal issues | High | Use generic terms |
| Scope creep delays progress | High | Locked sprint scope, tier-based parallelization |
| Single developer bottleneck | Medium | Clean module boundaries enable parallel work |
| Browser performance (large maps) | Medium | Canvas rendering, viewport culling |

[↑ back to top](#mir-product-roadmap)

---

## Execution Summary

### Completed

```
✅ Sprint -1  — Foundation
✅ Sprint 0   — Playable demo
✅ Sprint 1   — Solid game
✅ Sprint 2   — Persistence
✅ Sprint 3   — Multiplayer
✅ Tier 5     — Advanced AI (5/5)
✅ Tier 6     — Content & Tools (7/7)
✅ Tier 7     — NLP Pipeline (2/2)
   Total:       1600+ automated tests, 28+ test files, 25 sessions
```

### Next Priorities (Updated Session 25 — 2026-02-17)

```
NOW:      P3 — Content UI buttons in browser
NOW:      P7 — Ability UI buttons (USE_ABILITY clickable)
NOW:      P5 — Live WebSocket server for multiplayer
NEXT:     Tier 8 — Visual polish (sprites, terrain tiles, animations)
NEXT:     Tier 9 — Analog hybrid (voice input, TTS, dice camera)
NEXT:     F1  — TypeScript migration (start with src/engine/)
NEXT:     L1  — Replace console.log with structured logger
LATER:    Tier 10 — World interaction (SEARCH, INTERACT, TALK_TO, REST, etc.)
ONGOING:  Testing, accessibility, legal, monetization design
```

**Current priority: Content UI → Visual Polish → Analog Hybrid → World Interaction → Market.**

[↑ back to top](#mir-product-roadmap)