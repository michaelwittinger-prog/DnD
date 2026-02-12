# Changelog

> Chronological record of all development sessions. Updated after each task.
> Convention: newest entries at the top.

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
