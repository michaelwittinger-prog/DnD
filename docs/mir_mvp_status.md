# MIR MVP Status

> MIR 4.3 · Feature Inventory & Known Limitations

---

## Stability Metrics

| Metric | Value |
|--------|-------|
| Total automated tests | 441 |
| Engine tests | 95 |
| AI parser tests | 82 |
| AI prompt tests | 50 |
| AI bridge tests | 78 |
| Replay tests | 40 |
| MVP integration tests | 43 |
| Scenario tests | 53 |
| Schema invariants | 25 |
| Scenarios | 3 |
| Replay bundles | 2 |
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
- [x] Action buttons (Roll Init, End Turn, Attack)
- [x] AI command input with feedback
- [x] Event log (last 10 events)
- [x] Initiative order display
- [x] Scenario + Replay selectors
- [x] State indicators (mode, active entity, seed)
- [x] Deterministic engine badge
- [x] Single-command startup (`npm run start:mvp`)

---

## Features Intentionally Excluded ✗

| Feature | Reason |
|---------|--------|
| Fog of War | Planned for future milestone |
| Real-time multiplayer | Out of scope for MVP |
| Character creation | Focus is on engine, not content |
| Spell system / abilities | Engine supports the pattern; content not built |
| Map editor | Scenarios are hand-authored JSON |
| Persistent campaigns | Sessions are standalone |
| Authentication / accounts | Local-first design |
| Art / animations | Engineering demo, not visual product |
| Mobile support | Desktop browser only |
| Undo / redo | Events are append-only by design |

---

## Known Limitations

1. **Mock AI is pattern-matching only** — understands "move X to Y,Z" and "attack X" patterns but not natural language
2. **Real AI requires OpenAI API key** — set `OPENAI_API_KEY` in `.env`
3. **No pathfinding** — MOVE validates the path but doesn't compute one
4. **Single browser session** — no sync between tabs or devices
5. **Terrain is visual only** — difficult terrain is tracked but not mechanically enforced beyond blocking
6. **No death / unconscious handling** — HP can reach 0 but no status effects trigger
7. **Initiative is re-rolled fresh** — no persistent initiative across encounters
8. **Scenario list is static in UI** — new scenarios require updating the SCENARIO_FILES array in main.mjs

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
