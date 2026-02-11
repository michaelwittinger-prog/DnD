# MIR MVP Quickstart

> MIR 4.1 · Playable Core Layer

## Prerequisites

- **Node.js 18+** (tested with v24)
- **npm** (comes with Node)
- No other tools required

## Quick Start (2 minutes)

```bash
# 1. Clone and install
git clone https://github.com/michaelwittinger-prog/DnD.git
cd DnD
npm install

# 2. Start everything
npm run start:mvp
```

This single command starts:
- **UI server** on http://localhost:3001
- **AI bridge** on http://localhost:3002

Open **http://localhost:3001** in your browser.

## First Time User Flow

When you open the UI, you'll see a **Getting Started** panel:

### 1. Start Demo Encounter
Click **"⚔ Start Demo Encounter"** to load a pre-built tavern scene with:
- 2 player characters (Seren Ashford, Miri Thistledown)
- 2 NPCs (Old Haggard the barkeep, Goblin Sneak)
- Blocked and difficult terrain
- Seeded RNG for deterministic combat

### 2. Play the Encounter
- **Click tokens** to select them
- **⚔ Roll Initiative** — enters combat mode
- **Right-click a cell** to move the active entity
- **🗡 Attack Target** — select attacker, then click target
- **⏭ End Turn** — advances to next entity in initiative
- **AI Command** — type natural language (e.g. "attack the goblin")

### 3. Load and Run a Replay
Click **"📂 Load Replay"** to see available replay bundles, then **"▶ Run Replay"** to watch it play step-by-step.

Available replays:
| Replay | Steps | Description |
|--------|-------|-------------|
| combat_flow.replay.json | 4 | MOVE → ROLL_INITIATIVE → ATTACK → END_TURN |
| rejected_move.replay.json | 2 | Rejected move (blocked) → Valid move |

## Enable Real AI

By default, the AI uses a **mock parser** (keyword matching, no API calls).

To use OpenAI:

```bash
# Set your API key
export OPENAI_API_KEY=sk-your-key-here

# Start
npm run start:mvp
```

The AI bridge will automatically detect the key and switch to real mode.
The UI shows `[real]` or `[mock]` next to AI responses.

## Available npm Scripts

| Script | Description |
|--------|-------------|
| `npm run start:mvp` | Start UI + AI bridge (the main entry point) |
| `npm run ui` | Start UI server only |
| `npm run ai:bridge` | Start AI bridge only |
| `npm run test:all` | Run all tests (345 total) |
| `npm run replay:verify` | Verify all replay bundles |
| `npm run test:engine` | Run engine tests only |

## Architecture at a Glance

```
Player → UI → DeclaredAction → Engine → EngineEvents → GameState
                                  ↑
AI → Proposal → Parser → Engine validates
```

- **GameState** is the single source of truth
- **Engine** validates all actions, produces events
- **Events** are append-only and immutable
- **AI** can only propose actions, never mutate state
- **Seeded RNG** ensures full determinism

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Blank battlefield | Refresh browser (Ctrl+R) |
| AI says "mock" | Set OPENAI_API_KEY and restart |
| Port in use | Kill old processes: check for node on ports 3001/3002 |
| Tests fail | Run `npm install` then `npm run test:all` |
