# MIR Game Handbook

> Version 0.10 · February 2026 · 995 tests passing
> A complete player reference for the MIR Tabletop Engine.

---

## Table of Contents

1. [What is MIR?](#1-what-is-mir)
2. [Quick Start](#2-quick-start)
3. [The Interface](#3-the-interface)
4. [Characters](#4-characters)
5. [Game Modes](#5-game-modes)
6. [Movement](#6-movement)
7. [Combat](#7-combat)
8. [Abilities](#8-abilities)
9. [Conditions](#9-conditions)
10. [Difficulty Settings](#10-difficulty-settings)
11. [Terrain](#11-terrain)
12. [Fog of War](#12-fog-of-war)
13. [AI Commands](#13-ai-commands)
14. [Saving & Loading](#14-saving--loading)
15. [Scenarios](#15-scenarios)
16. [Controls Reference](#16-controls-reference)

---

## 1. What is MIR?

MIR is a hybrid analog-first tabletop RPG engine with an AI Game Master. You play on a digital battlemap with turn-based combat, deterministic dice rolls, and AI-driven NPCs. Every dice roll, every move, every decision is auditable and reproducible.

**Core principles:**
- **Deterministic** — Same seed = same result. Every session is replayable.
- **State-driven** — All changes flow through the engine. No hidden mutations.
- **AI-assisted** — The AI proposes actions; the engine validates them. The AI cannot cheat.

---

## 2. Quick Start

```
npm run ui
```

Open **http://127.0.0.1:3001** in your browser.

1. Select a **scenario** from the dropdown (or click **⚔ Start Demo Encounter**)
2. Choose a **difficulty** level (Easy / Normal / Hard / Deadly)
3. Click **⚔ Roll Initiative** to begin combat
4. Click your character tokens to select, click cells to move, click enemies to attack
5. Click **⏭ End Turn** when done — NPCs play automatically

---

## 3. The Interface

### Header Bar
| Element | Purpose |
|---------|---------|
| **MIR — Tabletop Engine** | Title |
| Map name | Current map (e.g., "The Rusty Tankard") |
| Combat status | 🌿 Exploration or ⚔ Combat (with round number) |
| 🔊 Sound ON/OFF | Toggle sound effects |
| 🌫 Fog ON/OFF | Toggle fog of war visibility |

### Battlemap (Center)
- Grid-based map with terrain
- Colored tokens: 🟦 Players, 🟥 NPCs, 🟤 Objects
- HP bars displayed below each token
- Path preview shown on hover (blue dots)
- Red highlight on attackable enemies
- Zoom controls in bottom-right corner (+, −, ⟳)

### Sidebar (Right)
| Section | Purpose |
|---------|---------|
| 🎲 Getting Started | Scenario selector, difficulty, demo encounter |
| Selected | Info about clicked token (name, HP, AC, conditions) |
| Actions | Roll Initiative, End Turn, Attack buttons |
| AI Command | Type natural language commands |
| RNG Seed | View/set deterministic seed |
| 📜 Narration | Play-by-play event descriptions |
| ⚔ Initiative Tracker | Turn order with HP bars and conditions |
| 💾 Save / Load | Session persistence |
| Replay | Export/import replay files |
| Event Log | Raw event stream |

---

## 4. Characters

### Player Characters

| Name | Role | HP | AC | Speed | Equipment |
|------|------|----|----|-------|-----------|
| **Seren Ashford** | Paladin | 28 | 16 | 6 | Longsword, Shield |
| **Miri Thistledown** | Ranger | 22 | 13 | 6 | Shortbow, 20 Arrows |

### Common NPCs

| Name | HP | AC | Speed | Appears In |
|------|----|----|-------|------------|
| Old Haggard (Barkeep) | 8 | 10 | 6 | Tavern Skirmish, Demo |
| Goblin Sneak | 10–12 | 13 | 6 | Tavern Skirmish, Demo |
| Bandit Thug | 14 | 12 | 6 | Corridor Ambush |
| Bandit Archer | 10 | 11 | 6 | Corridor Ambush |
| Dark Knight | 20 | 15 | 6 | Open Field Duel |
| Squire | 12 | 11 | 6 | Open Field Duel |

### Stats Explained

| Stat | Meaning |
|------|---------|
| **HP** (Hit Points) | Health. Reach 0 = dead. |
| **AC** (Armor Class) | Defense. Attacker must roll ≥ AC to hit. |
| **Speed** | Maximum cells of movement per turn. |

---

## 5. Game Modes

### Exploration Mode 🌿
- No turn order — move freely
- Click any player token, then click a destination cell
- Path is computed automatically via A* pathfinding
- No attacks possible

### Combat Mode ⚔
- Turn-based with initiative order
- Started by clicking **⚔ Roll Initiative**
- Each entity gets one turn per round (move + action)
- NPCs play automatically when it's their turn
- Combat ends when all players or all NPCs are dead

---

## 6. Movement

### Rules
- **Cardinal only** — Up, Down, Left, Right. No diagonal movement.
- **Speed limit** — Maximum cells = entity's movement speed (usually 6)
- **Blocked cells** — Walls and obstacles cannot be entered
- **Occupied cells** — Cannot move through or onto another entity
- **Difficult terrain** — Costs 2 movement points to enter (shown as tan cells)

### How to Move
1. **Select** your token (click it)
2. **Hover** over the destination — a blue path preview appears
3. **Click** the destination cell — movement executes
4. Path is validated by the engine. Invalid moves are rejected.

---

## 7. Combat

### Starting Combat
Click **⚔ Roll Initiative**. All entities roll a d20 — highest goes first.

### Turn Structure
On your turn, you can:
1. **Move** — Click a destination cell (within speed budget)
2. **Attack** — Click an adjacent enemy token (melee range = 1 cell, including diagonals)
3. **End Turn** — Click **⏭ End Turn** to pass

### Attack Resolution
```
d20 + attack modifier  vs  target AC + AC modifier
```

1. Roll a d20
2. Add attacker's condition bonuses (e.g., Blessed: +2)
3. If attacker is Poisoned: roll twice, take lower (disadvantage)
4. Compare to target's AC (modified by conditions, e.g., Stunned: −2)
5. **Hit:** Roll 1d6 damage, subtract from target HP
6. **Miss:** No damage

### Death
- HP reaches 0 → **Dead** condition applied
- Dead entities are skipped in initiative
- Token grayed out with 💀 indicator
- **Combat ends** when all players OR all NPCs are dead

### NPC Auto-Turns
NPCs play automatically with a short delay:
- They move toward the nearest player using pathfinding
- When adjacent, they attack
- If no valid action exists, they end their turn

---

## 8. Abilities

Five abilities are available in the engine. Each has a type, range, and effect:

### Attack Abilities

| Ability | Range | Damage | Attack Bonus | Cooldown | Special |
|---------|-------|--------|-------------|----------|---------|
| **Firebolt** 🔥 | 6 cells | 1d10 | +0 | None | Ranged fire bolt |
| **Sneak Attack** 🗡 | 1 cell | 2d6 | +2 | None | Devastating melee strike |
| **Poison Strike** ☠ | 1 cell | 1d4 | +0 | 2 turns | Applies **Poisoned** for 2 turns |
| **Shield Bash** 🛡 | 1 cell | 1d4 | +1 | 2 turns | Applies **Stunned** for 1 turn |

### Heal Abilities

| Ability | Range | Heal | Cooldown | Special |
|---------|-------|------|----------|---------|
| **Healing Word** ✨ | 4 cells | 1d6 | 1 turn | Ally only, capped at max HP |

### Targeting Rules
- **Enemy abilities** (attack type) — Can only target hostile entities
- **Ally abilities** (heal type) — Can only target friendly entities
- **Range** — Measured in Chebyshev distance (diagonals = 1 cell)
- **Dead entities** — Cannot be targeted by attacks; cannot cast abilities

### Cooldowns
Some abilities have a cooldown (turns before reuse). Cooldowns tick down at the end of each turn.

---

## 9. Conditions

Conditions modify entity behavior. They are applied by abilities, scenarios, or combat events.

| Condition | Icon | Effect | Duration |
|-----------|------|--------|----------|
| **Dead** | 💀 | Skip turn. Permanent. Cannot act or be targeted. | Permanent |
| **Stunned** | 💫 | Skip turn. −2 to AC (easier to hit). | 1 round |
| **Poisoned** | ☠ | Disadvantage on attacks (roll 2d20, take lower). | 3 rounds |
| **Prone** | ⬇ | Melee attacks against you have advantage. | Until removed |
| **Blessed** | ✨ | +2 to attack rolls. | 3 rounds |
| **Burning** | 🔥 | Take 1d4 fire damage at the **start** of your turn. | 3 rounds |

### Condition Processing
- **Start of turn:** Burning damage is applied
- **End of turn:** All condition durations tick down by 1. When reaching 0, the condition is removed.
- **Stacking:** Conditions don't stack — reapplying refreshes duration

---

## 10. Difficulty Settings

Choose a difficulty before loading a scenario or demo encounter. This adjusts NPC stats and behavior.

| Setting | NPC HP | Attack Mod | Damage Mod | AC Mod | Target Selection | Ability Use |
|---------|--------|-----------|-----------|--------|-----------------|-------------|
| **Easy** 🟢 | ×0.8 | −1 | +0 | +0 | Random target | 20% chance |
| **Normal** 🟡 | ×1.0 | +0 | +0 | +0 | Weakest target | 50% chance |
| **Hard** 🟠 | ×1.2 | +1 | +1 | +1 | Weakest target | 80% chance |
| **Deadly** 🔴 | ×1.5 | +2 | +2 | +2 | Focus-fire lowest HP | 100% chance |

**Easy** is forgiving — NPCs sometimes skip attacks and pick random targets.
**Deadly** is ruthless — NPCs have 50% more HP, +2 to everything, and always focus the weakest player.

---

## 11. Terrain

The battlemap uses different terrain types:

| Terrain | Color | Movement | Vision | Effect |
|---------|-------|----------|--------|--------|
| **Open** | Dark green | ✅ Normal | ✅ Clear | No effect |
| **Blocked** (Wall) | Dark gray | ❌ Impassable | ❌ Blocks vision | Cannot enter or see through |
| **Difficult** | Tan/brown | ⚠ Costs 2× movement | ✅ Clear | Slows movement |
| **Water** | Blue | ✅ Normal | ✅ Clear | Cosmetic only |

---

## 12. Fog of War

Toggle fog with the **🌫 Fog** button in the header.

### When Enabled:
- Players can only see cells within **line of sight** (8 cell range)
- **Walls block vision** — you can't see behind obstacles
- **NPC tokens are hidden** if not in a player's visible area
- Dark overlay covers non-visible cells
- Multiple player characters share vision (union of all player sight)

### When Disabled:
- Full map visibility — all entities and terrain visible

---

## 13. AI Commands

Type natural language commands in the **AI Command** input:

| Command Example | What Happens |
|----------------|--------------|
| `"move Seren to 5,3"` | Pathfinding move to (5,3) |
| `"attack the goblin"` | Melee attack the goblin (fuzzy name matching) |
| `"attack barkeep"` | Attack Old Haggard |
| `"end turn"` | End current entity's turn |
| `"roll initiative"` | Start combat |

### AI Modes
- **Mock** (default) — Pattern-matching parser, works offline
- **Bridge** — Real OpenAI GPT-4o via `npm run ai:bridge` (requires API key)
- **Offline** — Bridge not running, fallback to mock

The current AI mode is shown in the status bar: `🤖 mock` / `🤖 bridge` / `🤖 offline`

---

## 14. Saving & Loading

### Session Persistence
| Action | How |
|--------|-----|
| **Save** | Click 💾 Save — stores to browser IndexedDB |
| **Load** | Click 📂 on any save in the list |
| **Delete** | Click 🗑 on any save |
| **Export** | Click 📤 Export — downloads `.json` file |
| **Import** | Click 📥 Import — upload a `.json` file |

### Auto-Save
Every game action triggers an auto-save (2-second debounce). Your session is never lost.

### Replay Export
Click **📥 Export Replay** to save the complete session as a deterministic replay bundle. This captures every action for exact replay later.

---

## 15. Scenarios

Three pre-built scenarios are available:

### 🍺 Tavern Skirmish (Easy)
*"A goblin lurks in The Rusty Tankard."*

- **Map:** 15×10 grid, walls and tables
- **Players:** Seren (blessed), Miri
- **NPCs:** Old Haggard (barkeep), Goblin Sneak (poisoned)
- **Terrain:** Blocked walls, difficult terrain patches
- **Notes:** Seren starts blessed (+2 attack). The goblin is poisoned (disadvantage on attacks). Good tutorial encounter.

### 🏰 Narrow Corridor Ambush (Medium)
*"A dungeon corridor with pillars forces careful movement."*

- **Map:** 12×5 grid, narrow with pillars
- **Players:** Seren, Miri (starting on left side)
- **NPCs:** Bandit Thug (prone), Bandit Archer
- **Terrain:** Pillars block movement (not vision), difficult terrain rubble in center
- **Notes:** The lead bandit stumbled and is prone. Use the narrow corridor to funnel enemies.

### ⚔ Open Field Duel (Medium)
*"Two sides face off across muddy grass."*

- **Map:** 10×8 grid, mostly open
- **Players:** Seren (full HP), Miri (full HP)
- **NPCs:** Dark Knight (blessed), Squire (burning)
- **Terrain:** Corner walls, 2×2 mud patch (difficult terrain) in center
- **Notes:** The Dark Knight has blessed (+2 attack). The Squire is burning (1d4 damage per turn). Focus the Squire before the Knight's bless wears off.

---

## 16. Controls Reference

### Mouse Controls
| Action | How |
|--------|-----|
| **Select token** | Click on a token |
| **Move** | Click destination cell (path preview on hover) |
| **Attack** | Click adjacent enemy token (red highlight) |
| **Zoom** | Mouse wheel on battlemap |

### Buttons
| Button | Action |
|--------|--------|
| ⚔ Roll Initiative | Start combat (rolls d20 for all entities) |
| ⏭ End Turn | Pass to next entity in initiative |
| 🗡 Attack Target | Attack selected target |
| 🤖 Propose | Send AI command |
| 🔊 Sound ON/OFF | Toggle sound effects |
| 🌫 Fog ON/OFF | Toggle fog of war |
| +/−/⟳ | Zoom in/out/reset |
| 💾 Save | Save current session |
| 📤 Export | Export session to file |
| 📥 Import | Import session from file |

### Keyboard
| Key | Action |
|-----|--------|
| Enter (in AI input) | Send AI command |

---

## Appendix: Dice Notation

| Notation | Meaning | Example |
|----------|---------|---------|
| d20 | Roll a 20-sided die | Attack rolls |
| 1d6 | Roll one 6-sided die | Basic attack damage |
| 2d6 | Roll two 6-sided dice, sum them | Sneak Attack damage |
| 1d10 | Roll one 10-sided die | Firebolt damage |
| 1d4 | Roll one 4-sided die | Poison Strike, Shield Bash, Burning |

All dice rolls use a **deterministic seeded RNG**. Same seed = same results. You can set the seed manually in the RNG Seed section.

---

*This handbook reflects the current engine state as of Session 10 (995 tests, 21 engine modules). Features are being actively developed — see `docs/mir_product_roadmap.md` for the full plan.*
