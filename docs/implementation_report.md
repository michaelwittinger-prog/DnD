# Implementation Report — Architecture Consolidation

> **Created:** 2026-02-14  
> **Purpose:** Prevent re-doing failed approaches. Single source of truth for architectural decisions.  
> **Status:** Living document — update after every major change.

---

## 1. The Two-Universe Problem

The codebase contains **two independent game engines operating on incompatible state schemas**. This is the root cause of instability and confusion.

### Universe 1: "Engine" (`src/engine/` + `src/ui/`)

The engine is the **complete, playable game**. It has click-to-move, click-to-attack, NPC AI, combat controller, conditions, abilities, pathfinding, fog of war, initiative, turn budgets, persistence, sound, zoom, and more.

**State shape (canonical):**

```json
{
  "schemaVersion": "0.1.0",
  "map": {
    "grid": { "type": "square", "size": { "width": 15, "height": 10 } },
    "terrain": [
      { "x": 3, "y": 0, "type": "blocked", "blocksMovement": true }
    ]
  },
  "entities": {
    "players": [
      {
        "id": "pc-seren", "kind": "player", "name": "Seren Ashford",
        "position": { "x": 2, "y": 3 },
        "stats": { "hpCurrent": 22, "hpMax": 28, "ac": 16, "movementSpeed": 6 },
        "conditions": [], "inventory": []
      }
    ],
    "npcs": [ ... ],
    "objects": [ ... ]
  },
  "combat": {
    "mode": "exploration",
    "round": 0,
    "activeEntityId": null,
    "initiativeOrder": [],
    "turnBudget": { "movementUsed": 0, "actionUsed": 0, "bonusActionUsed": 0 }
  },
  "rng": { "mode": "seeded", "seed": "...", "lastRolls": [] },
  "log": { "events": [ ... ] },
  "ui": { "selectedEntityId": null }
}
```

**Key characteristics:**
- Entities categorized: `entities.players[]`, `entities.npcs[]`, `entities.objects[]`
- Entity type field: `kind` ("player" | "npc" | "object")
- HP: `stats.hpCurrent` / `stats.hpMax`
- Speed: `stats.movementSpeed`
- Map size: `map.grid.size.width` / `map.grid.size.height`
- Terrain: `map.terrain[]` with `blocksMovement` boolean
- Combat mode: `combat.mode` ("combat" | "exploration")
- Active entity: `combat.activeEntityId` (string ID)
- Log: `log.events[]`

**Modules (17 files, 1181+ tests):**
- `src/engine/applyAction.mjs` — Core state transition (MOVE, ATTACK, END_TURN, ROLL_INITIATIVE, SET_SEED)
- `src/engine/movement.mjs` — Path validation, cardinal-only, collision checks
- `src/engine/attack.mjs` — d20 rolls, AC, conditions, damage, death
- `src/engine/pathfinding.mjs` — A* with terrain costs, movement speed cap
- `src/engine/initiative.mjs` — d20 initiative, stable sort, turn cycling
- `src/engine/combatEnd.mjs` — Death, faction elimination, combat end
- `src/engine/combatController.mjs` — NPC turn execution, multi-round simulation
- `src/engine/npcTurnStrategy.mjs` — Chase nearest hostile, attack if adjacent
- `src/engine/conditions.mjs` — 6 conditions, duration, start/end-of-turn
- `src/engine/abilities.mjs` — 5 abilities, cooldowns, range validation
- `src/engine/visibility.mjs` — Bresenham LOS, fog of war
- `src/engine/difficulty.mjs` — Easy/normal/hard/deadly presets
- `src/engine/narrateEvent.mjs` — Human-readable event descriptions
- `src/engine/rng.mjs` — Deterministic seeded RNG
- `src/engine/multiActionTurn.mjs` — Multi-action turn support
- `src/engine/errors.mjs` — Error codes
- `src/engine/index.mjs` — Barrel export

**UI:** `src/ui/main.mjs` (vanilla JS, canvas-based, port 3001 via `src/ui/serve.mjs`)

### Universe 2: "Pipeline" (`src/pipeline/` + `src/rules/` + `viewer/`)

The pipeline handles LLM integration: OpenAI generates proposals, rules engine validates them, gatekeeper runs 5-gate checks, turn bundles are written for audit/replay.

**State shape (legacy):**

```json
{
  "meta": { "schemaVersion": "1.0.0" },
  "map": {
    "dimensions": { "width": 20, "height": 15 },
    "tiles": [ { "x": 3, "y": 4, "terrain": "cobblestone" } ]
  },
  "entities": [
    {
      "id": "pc-01", "name": "Seren", "type": "player",
      "position": { "x": 5, "y": 6 },
      "stats": { "hp": 24, "maxHp": 24, "ac": 16, "speed": 6 },
      "conditions": []
    }
  ],
  "timeline": { "turn": 12 },
  "logs": [ ... ],
  "rng": { "seed": 987654321 }
}
```

**Key characteristics:**
- Entities: FLAT array `entities[]` (no categorization)
- Entity type field: `type` ("player" | "npc")
- HP: `stats.hp` (single field)
- Speed: `stats.speed`
- Map size: `map.dimensions.width` / `map.dimensions.height`
- Terrain: `map.tiles[]` with `terrain` string (no `blocksMovement`)
- Combat: `combat.active` (boolean), `combat.active_index` (number, not entity ID)
- Log: `logs[]` (top-level, different structure)

**Modules:**
- `src/pipeline/executeTurn.mjs` — Full turn pipeline (load → LLM → rules → apply → gatekeeper → bundle)
- `src/pipeline/applyAiResponse.mjs` — Applies AI ops to pipeline state
- `src/rules/rulesEngine.mjs` — evaluateProposal (schema, authority, per-op rules)
- `gatekeeper.js` — 5-gate post-validation
- `src/server/localApiServer.mjs` — HTTP API (port 3030)

**UI:** `viewer/src/App.jsx` (React, port 5174) — observability panels, no game interaction

### Universe 3: "Client" (`client/`)

**Status: DEAD CODE.** Uses yet another state shape (has `map.grid`, `map.entities_on_map`, `entity.hp.current/hp.max`). Fetches from `/api/state` which doesn't exist on any server. Non-functional.

---

## 2. Canonical Architecture Decision

> **Engine state (Universe 1) is the single source of truth.**  
> **Pipeline state (Universe 2) is demoted to a derived export/audit format.**

**Rationale:**
- Engine has 17 modules, 1181+ tests, and ALL gameplay features
- Pipeline has valuable LLM integration and validation, but its state shape is simpler and loses information
- A bidirectional adapter between the two shapes is impractical (different entity categorization, HP models, combat models, naming conventions — round-trip fidelity is impossible)

**Implications:**
1. `applyAction()` is the ONLY state transition function for all deterministic actions
2. LLM proposals get translated ONE-WAY into engine `DeclaredAction` objects
3. Engine state persists to disk as engine state (not pipeline format)
4. Turn bundles can export pipeline-format snapshots for audit, but these are derived artifacts
5. The gatekeeper validates engine state post-transition (adapter or parallel checker)

---

## 3. Front-End Decision

| Front-end | Status | Reason |
|-----------|--------|--------|
| `src/ui/` (vanilla JS, port 3001) | **PRIMARY** | Has all game features: click-to-move, combat, NPC AI, etc. |
| `viewer/` (React, port 5174) | **DEBUG ONLY** | Useful for inspecting turn bundles and rules reports |
| `client/` (React TS, port 5173) | **DEPRECATED** | Dead code, non-functional, wrong API endpoint |

---

## 4. Action Flow Diagrams

### Flow A: Player Click (deterministic, no LLM)
```
User clicks tile in src/ui/
  → inputController builds DeclaredAction { type: "MOVE", entityId, path }
  → dispatch(action)
  → applyAction(engineState, action)
  → validates (schema, invariants, turn order, budget)
  → mutates cloned state
  → returns { nextState, events, success }
  → UI re-renders
  → POST /action to server (persist to disk, write bundle)
```

### Flow B: LLM Narrative Action (via API)
```
User types text in src/ui/
  → POST /turn to localApiServer
  → executeTurn() calls OpenAI
  → LLM returns AI response (move_entity, set_hp, etc.)
  → rulesEngine.evaluateProposal() validates
  → proposalToActions() translates to DeclaredAction[]
  → for each action: applyAction(engineState, action)
  → persist engine state, write bundle
  → return result to UI
```

---

## 5. Field Mapping Reference (Pipeline → Engine)

| Pipeline Field | Engine Field | Notes |
|---|---|---|
| `entities[]` (flat) | `entities.players[]` + `entities.npcs[]` + `entities.objects[]` | Split by `type`/`kind` |
| `entity.type` | `entity.kind` | "player" → "player", "npc" → "npc" |
| `stats.hp` | `stats.hpCurrent` | |
| `stats.maxHp` | `stats.hpMax` | |
| `stats.speed` | `stats.movementSpeed` | |
| `map.dimensions.width` | `map.grid.size.width` | |
| `map.dimensions.height` | `map.grid.size.height` | |
| `map.tiles[]` | `map.terrain[]` | Tiles have no `blocksMovement`; terrain does |
| `combat.active` | `combat.mode === "combat"` | Boolean vs string |
| `combat.active_index` | `combat.activeEntityId` | Index vs entity ID |
| `combat.initiative_order[]` | `combat.initiativeOrder[]` | Underscore vs camelCase |
| `timeline.turn` | `combat.round` | Different concept scope |
| `logs[]` | `log.events[]` | Different structure entirely |

---

## 6. AI Response Op → Engine Action Mapping

| AI Response Op | Engine DeclaredAction | Translation Notes |
|---|---|---|
| `move_entity { entity_id, to }` | `{ type: "MOVE", entityId, path }` | Path computed by A* pathfinding from current position to target |
| `set_hp { entity_id, current }` | *(no direct equivalent)* | Engine uses deterministic attack rolls; HP changes are side effects of ATTACK, not direct mutations. Logged as narration only. |
| `advance_turn` | `{ type: "END_TURN", entityId }` | Uses current active entity |
| `start_combat { participants }` | `{ type: "ROLL_INITIATIVE" }` | Engine handles participant selection automatically |
| `end_turn { entity_id }` | `{ type: "END_TURN", entityId }` | Direct mapping |
| `spawn_entity` | *(blocked)* | No GM authority — always rejected by rules engine |
| `remove_entity` | *(skipped)* | Engine handles death via HP reaching 0 |
| `add_event_log` | *(skipped)* | Engine generates its own events |
| `add_condition` | *(future)* | Could map to a USE_ABILITY or direct condition add |
| `remove_condition` | *(future)* | Could map to condition removal |

---

## 7. What Has Been Tried and Why It Failed

### Attempt: "Add click-to-move to viewer"
**Problem:** The viewer uses pipeline state (flat entities, `map.dimensions`). Pathfinding uses engine state (`entities.players/npcs`, `map.grid.size`). Adding click-to-move to the viewer would require either:
1. Rewriting pathfinding for pipeline state (duplicates logic, diverges)
2. A bidirectional state adapter (complex, fragile, impossible round-trip)

**Outcome:** Neither approach is viable. The correct answer is to use `src/ui/` which already has click-to-move working with engine state.

### Attempt: "Make all three front-ends work"
**Problem:** Three codebases, three state shapes, three sets of assumptions. Every change must be replicated three times. Bugs bifurcate.

**Outcome:** Pick one. `src/ui/` wins because it has the most features and uses the canonical state.

---

## 8. Risk Log

| Risk | Mitigation |
|---|---|
| Existing 15 e2e pipeline tests break when pipeline flow changes | Keep `evaluateProposal()` working on pipeline state; only change what happens AFTER rules pass |
| `set_hp` from LLM can't map to engine action | Log it as narration; actual HP changes come from engine ATTACK actions |
| State on disk format changes | Version the file; bootstrap converter runs once for migration |
| Gatekeeper assumes pipeline schema | Create parallel invariant checker for engine state; migrate gatekeeper later |

---

## 9. File Inventory

### Canonical (keep, engine-based)
- `src/engine/*.mjs` — 17 modules
- `src/ui/*.mjs` + `src/ui/index.html` + `src/ui/styles.css` — primary game UI
- `src/ai/*.mjs` — intent system (works with engine state)
- `src/state/*.mjs` — state management
- `src/core/*.mjs` — logging, assertions, env
- `src/content/*.mjs` — monster manual, character creator, scenario builder, encounter generator
- `src/persistence/*.mjs` — IndexedDB session/campaign stores
- `src/replay/*.mjs` — replay system (engine state)

### Pipeline (keep for LLM, demoted)
- `src/pipeline/*.mjs` — turn execution, AI response application
- `src/rules/rulesEngine.mjs` — proposal validation (valuable, keep)
- `src/server/localApiServer.mjs` — API server (modify to serve engine state)
- `src/adapters/*.mjs` — OpenAI integration
- `gatekeeper.js` — 5-gate validation (migrate to engine state later)

### Deprecated (remove)
- `client/` — dead code, non-functional
- `server/` — separate Express server, unused by either universe

### Debug-only
- `viewer/` — observability tool for turn bundles, not the game UI
