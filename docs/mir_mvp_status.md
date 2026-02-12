# MIR MVP Status

> Last updated: 2026-02-12 · Sprint 1 complete · 932 tests passing

---

## Stability Metrics

| Metric | Value |
|--------|-------|
| Total automated tests | 932 |
| Engine tests | 95 |
| AI parser tests | 82 |
| AI prompt tests | 50 |
| AI bridge tests | 78 |
| Replay tests | 40 |
| MVP integration tests | 43 |
| Scenario tests | 53 |
| Foundation tests | 154 |
| Pathfinding tests | 95 |
| Death/combat end tests | 48 |
| NPC strategy tests | 54 |
| Narration/controller tests | 44 |
| Sprint 1 tests (abilities, conditions, range) | 96 |
| Schema invariants | 25 |
| Scenarios | 3 |
| Replay bundles | 3 |
| Engine modules | 17 |
| Zero-dependency modules | All engine + validation |

---

## Features Included ✓

### Core Engine
- [x] DeclaredAction → EngineEvent → StateMutation pipeline
- [x] MOVE, ATTACK, ROLL_INITIATIVE, END_TURN actions
- [x] Deterministic seeded RNG (same seed = same result)
- [x] Full state immutability (engine never mutates input)
- [x] ACTION_REJECTED as explicit event with reasons
- [x] Append-only event log

### Pathfinding (S0.3)
- [x] A* pathfinding with cardinal movement
- [x] Blocked terrain avoidance
- [x] Occupied cell detection
- [x] Path-to-adjacent helper for attack range
- [x] Movement speed budget validation

### Death & Combat End (S0.4)
- [x] HP 0 → dead condition applied automatically
- [x] Dead entities skipped in initiative
- [x] Faction elimination detection (all players dead / all NPCs dead)
- [x] Combat end event generation
- [x] Next-living-entity lookup

### NPC Strategy (S0.5)
- [x] Automatic NPC turn planning (chase + attack)
- [x] Target selection (nearest hostile)
- [x] Movement toward nearest hostile if not adjacent
- [x] Attack when adjacent
- [x] End turn when no valid action

### Event Narration (S0.6)
- [x] Human-readable descriptions for all event types
- [x] MOVE, ATTACK, INITIATIVE, END_TURN, COMBAT_END narration
- [x] Miss/hit/kill variation in attack narration
- [x] Batch narration for event arrays

### Combat Controller (S0.7)
- [x] Full NPC turn execution loop
- [x] Multi-round combat simulation
- [x] Event accumulation across turns
- [x] Combat termination detection

### Ability System (S1.1)
- [x] 5 abilities: Firebolt, Healing Word, Sneak Attack, Poison Strike, Shield Bash
- [x] USE_ABILITY action with range/targeting/cooldown validation
- [x] Attack abilities: d20 + bonus vs AC, damage dice
- [x] Heal abilities: dice roll, HP cap at max, ally targeting
- [x] Cooldown system with per-turn tick management
- [x] Condition application on hit (poisoned, stunned)

### Condition System (S1.2)
- [x] 6 conditions: dead, stunned, poisoned, prone, blessed, burning
- [x] Duration tracking via conditionDurations map
- [x] Start-of-turn processing (burning DoT)
- [x] End-of-turn duration countdown + automatic expiry
- [x] AC modifier query (stunned: -2)
- [x] Attack modifier query (blessed: +2)
- [x] Attack disadvantage query (poisoned)
- [x] Skip-turn query (dead, stunned)

### Range Validation (S1.4)
- [x] Chebyshev distance for all abilities
- [x] Melee range 1 (diagonal = adjacent)
- [x] Ranged abilities with configurable range
- [x] Targeting validation (enemy-only, ally-only)

### Validation
- [x] JSON Schema validation (pre-compiled, zero runtime deps)
- [x] 25 game-logic invariants
- [x] Unified validateAll() for both schema + invariants
- [x] Works identically in Node and browser

### AI Integration
- [x] AI proposes actions, engine validates
- [x] Mock AI parser (offline, no API key needed)
- [x] Real AI via OpenAI bridge (when API key provided)
- [x] AI action whitelist (MOVE, ATTACK, END_TURN, ROLL_INITIATIVE only)
- [x] Rate limiting (30 req/10 min)
- [x] Transparent mode labeling (mock vs real)

### Scenarios
- [x] ScenarioBundle format (meta + initialState + suggestedReplays)
- [x] 3 scenarios: Tavern Skirmish, Corridor Ambush, Open Field Duel
- [x] Scenario loader with full validation
- [x] UI scenario selector

### Replay System
- [x] Deterministic replay bundles (JSON)
- [x] Hash verification (state hashes at each step)
- [x] Export from UI session
- [x] Import and playback in UI
- [x] CLI replay runner

### UI
- [x] Grid-based battlemap renderer
- [x] Token display with click selection
- [x] **Click-to-move** with pathfinding validation
- [x] **Click-to-attack** with adjacency validation
- [x] **HP bars** on all tokens
- [x] **NPC auto-turns** via combat controller
- [x] **Narration panel** with styled event descriptions
- [x] **Damage floaters** (animated)
- [x] **Turn indicator** (whose turn)
- [x] Action buttons (Roll Init, End Turn, Attack)
- [x] AI command input with feedback
- [x] Event log (last 10 events)
- [x] Initiative order display
- [x] Scenario + Replay selectors
- [x] State indicators (mode, active entity, seed)
- [x] Deterministic engine badge
- [x] Single-command startup (`npm run ui`)

### DevOps
- [x] Auto-kill stale port on server startup
- [x] Graceful shutdown (SIGINT/SIGTERM)
- [x] `npm run ui:stop` convenience script
- [x] Dev practices documentation

---

## Features Intentionally Excluded ✗

| Feature | Reason |
|---------|--------|
| Difficult terrain mechanics | Tracked in state; pathfinding cost not yet enforced |
| Fog of War | Planned for Sprint 2+ |
| Real-time multiplayer | Out of scope |
| Character creation | Focus is on engine, not content |
| Map editor | Scenarios are hand-authored JSON |
| Persistent campaigns | Sessions are standalone |
| Authentication / accounts | Local-first design |
| Art / animations | Engineering demo, not visual product |
| Mobile support | Desktop browser only |
| Undo / redo | Events are append-only by design |
| Ability UI | Engine supports abilities; UI buttons not yet wired |

---

## Known Limitations

1. **Mock AI is pattern-matching only** — understands "move X to Y,Z" and "attack X" patterns but not natural language
2. **Real AI requires OpenAI API key** — set `OPENAI_API_KEY` in `.env`
3. **Single browser session** — no sync between tabs or devices
4. **Difficult terrain costs** — tracked in state but not enforced in pathfinding movement cost
5. **Initiative is re-rolled fresh** — no persistent initiative across encounters
6. **Scenario list is static in UI** — new scenarios require updating the SCENARIO_FILES array in main.mjs
7. **Abilities not yet in UI** — engine system complete but no UI buttons to trigger USE_ABILITY
8. **Conditions not integrated in attack/move** — condition modifiers (stunned AC penalty, poisoned disadvantage) defined but not yet wired into applyAttack/applyMove

---

## Architecture Health

| Guarantee | Status |
|-----------|--------|
| No silent mutations | ✓ Enforced |
| All state via events | ✓ Enforced |
| Append-only log | ✓ Enforced |
| GameState is single source of truth | ✓ Enforced |
| Deterministic replay | ✓ Hash-verified |
| AI cannot bypass engine | ✓ Whitelist + validation |
| Schema matches runtime | ✓ Pre-compiled validator |
| Graceful server shutdown | ✓ SIGINT/SIGTERM handlers |
| Auto-port recovery | ✓ Stale process kill on startup |
