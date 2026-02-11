# MIR Product Roadmap

> Master plan for evolving MIR from MVP to full market product.
> Last updated: 2026-02-11 · Commit: post-MIR 4.3

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

## 2. Current State Assessment

### What's Built (MIR 0.1–4.3)

| Area | Status | Key Metrics |
|------|--------|-------------|
| Core engine (MOVE, ATTACK, ROLL_INITIATIVE, END_TURN) | ✅ Complete | 95 engine tests |
| DeclaredAction → EngineEvent → StateMutation pipeline | ✅ Complete | Deterministic, hash-verified |
| Schema validation (JSON Schema 2020-12, pre-compiled) | ✅ Complete | 25 invariants |
| AI proposal layer (mock + OpenAI bridge) | ✅ Complete | 82 parser + 50 prompt + 78 bridge tests |
| Replay system (deterministic bundles with hash verification) | ✅ Complete | 40 replay tests |
| Scenario system (3 loadable encounter bundles) | ✅ Complete | 53 scenario tests |
| Browser UI (grid, tokens, action buttons, AI chat) | ✅ Complete | Canvas-based, single-page |
| Single-command startup (`npm run start:mvp`) | ✅ Complete | UI + AI bridge |
| **Total automated tests** | **441** | All passing |

### What's Missing for a Convincing Product

| Gap | Impact | Sprint |
|-----|--------|--------|
| No NPC auto-turns (combat is one-sided) | **Critical** — no opponent | S0 |
| Mock AI is pattern-matching only | **Critical** — doesn't feel intelligent | S0 |
| No narration (dry event log) | **High** — feels like a spreadsheet | S0 |
| No death/unconscious mechanics | **High** — combat has no stakes | S0 |
| No pathfinding (must type coordinates) | **High** — terrible UX | S0 |
| No click-to-move / click-to-attack | **High** — keyboard-only flow | S0 |
| No visual feedback (hit/miss/damage) | **Medium** — can't read combat at a glance | S0 |
| No TypeScript (all .mjs, no type safety) | **High** — bug surface grows with codebase | S-1 |
| No structured logging (console.log only) | **Medium** — can't trace bugs in production | S-1 |
| No CI/CD pipeline | **Medium** — can ship broken code | S-1 |
| No spell/ability system | **Medium** — combat is repetitive | S1 |
| No fog of war | **Medium** — full visibility removes tension | S1 |
| No persistence (session lost on refresh) | **Medium** — can't resume play | S2 |
| No multiplayer | **Low for MVP** — solo play is primary | S3 |

### Original Roadmap Reconciliation

| Original Phase | Original Status | Actual MIR Status | Notes |
|----------------|-----------------|-------------------|-------|
| 0.1 Environment | ✅ | ⚠ Diverged | No Next.js/Tailwind. Pure ESM + canvas. This is fine — lighter architecture. |
| 0.2 AI Setup | ✅ | ✅ MIR 3.1–3.3 | Schema, OpenAI, temperature, prompt versioning all done. No streaming. |
| 1.1 Core Design | ✅ | ✅ MIR 1.4 | State model, combat, initiative, RNG pipeline locked. |
| 1.2 AI GM Logic | ✅ | ✅ MIR 3.1–3.3 | AI boundaries enforced. Memory persistence NOT built (stateless per-call). |
| 1.3 Battlemap | ✅ | ✅ MIR 2.1 | Grid, coords, tokens, terrain. Visibility NOT built. |
| 2.1 Backend Engine | ✅ | ✅ MIR 1.4 | Full state machine, turn cycle, combat, dice, event log. |
| 2.2 AI Integration | ✅ | ✅ MIR 3.1–3.3 | JSON output, schema validation, reconciliation. Rollback implicit (immutability). |
| 2.3 Battlemap MVP | ✅ | ⚠ Partial | Grid + tokens ✓. Drag-and-drop NOT built. Fog of war NOT built. |
| 3 Analog Hybrid | ⚠ | ⚠ Minimal | Text input ✓. Speech NOT built. Dice recognition NOT built. |
| 4 Advanced | ❌ | ❌ | Animations, sound, procedural gen, campaigns, save, multiplayer — all pending. |
| 5 Polish | ⚠ | ⚠ Strong partial | 441 tests, determinism audit. No exploit testing, UX refinement, or perf measurement. |

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

### Tier 5: Advanced AI

| ID | Feature | Priority |
|----|---------|----------|
| 5.1 | AI memory (summarized context: last N events + entity roster + narrative beats) | High |
| 5.2 | Multi-action turns (AI proposes move + attack + bonus action in one call) | Medium |
| 5.3 | AI difficulty presets (easy/normal/hard controlling NPC aggression) | Medium |
| 5.4 | Encounter generation (AI creates balanced encounters from party data) | Low |
| 5.5 | Model selection (GPT-4o, Claude, local LLM via adapter pattern) | Medium |

### Tier 6: Content & Tools

| ID | Feature | Priority |
|----|---------|----------|
| 6.1 | Map editor (visual grid editor: paint terrain, place objects) | High |
| 6.2 | Character creator (stats, abilities, equipment from templates) | High |
| 6.3 | Monster manual (pre-built NPC stat blocks) | Medium |
| 6.4 | Scenario editor (combine map + entities + AI instructions) | Medium |
| 6.5 | Rule module system (pluggable rule sets: D&D 5e, PF2e, homebrew) | High |
| 6.6 | Community sharing (upload/download scenarios, maps, characters) | Low |
| 6.7 | Procedural dungeon generator | Low |

### Tier 7: Visual Polish

| ID | Feature | Priority |
|----|---------|----------|
| 7.1 | Token sprites (character art replacing circles) | Medium |
| 7.2 | Terrain tiles (stone, wood, grass, water) | Medium |
| 7.3 | Move animation (smooth slide) | Medium |
| 7.4 | Attack animation (shake, flash) | Low |
| 7.5 | Particle effects (spell impacts) | Low |
| 7.6 | Dark/light theme | Low |
| 7.7 | Minimap | Low |

### Tier 8: Analog Hybrid Bridge

| ID | Feature | Priority |
|----|---------|----------|
| 8.1 | Voice-to-text input (browser Speech API or Whisper) | High |
| 8.2 | Text-to-speech narration (browser TTS for AI output) | Medium |
| 8.3 | Dice camera recognition (phone camera → OCR physical dice) | Low |
| 8.4 | GM screen mode (second-screen UI for table) | Medium |
| 8.5 | Quick NPC override (GM adjusts HP/position mid-combat) | Medium |

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

```
IMMEDIATE: Sprint -1 (3 days) — TypeScript, logger, CI, module boundaries
WEEK 1:   Sprint 0 (7 days)  — Playable demo: real AI, NPC turns, click-to-play
WEEK 2-3: Sprint 1 (7 days)  — Spells, conditions, fog of war, polish
WEEK 3-4: Sprint 2 (5 days)  — Save/load, campaigns
WEEK 4-6: Sprint 3 (8 days)  — Multiplayer
WEEK 6+:  Tiers 5–8          — Advanced AI, content tools, visual polish, analog bridge
ONGOING:  Testing, accessibility, legal, monetization design
```

**Priority order: Framework → Demo → Mechanics → Persistence → Multiplayer → Content → Market.**
