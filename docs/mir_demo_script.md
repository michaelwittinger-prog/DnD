# MIR Demo Script

> MIR 4.3 · 2-Minute Guided Walkthrough

## Before You Start

```bash
npm run start:mvp
# Open http://localhost:3001
```

---

## The 2-Minute Demo

### 1. Load a Scenario (0:00–0:15)

1. **Point out** the "Getting Started" panel at top of sidebar
2. Select **"tavern skirmish"** from the scenario dropdown
3. Click **📋 Load**
4. **Emphasize:** "Every scenario is a validated JSON bundle. Schema + 25 invariants checked before load."

> 💡 Note the **"🔒 Deterministic Engine"** badge and seed display — these stay visible throughout.

### 2. Roll Initiative (0:15–0:30)

1. Click **⚔ Roll Initiative**
2. **Point out** the initiative order in the sidebar
3. **Emphasize:** "Same seed always produces the same initiative order. This is deterministic."

> 💡 Note the state indicators update: mode switches to ⚔ combat, active entity appears.

### 3. Move a Token (0:30–0:50)

1. Click on the active entity's token
2. Click a valid destination cell (adjacent, non-blocked)
3. **Point out** the MOVE_APPLIED event in the Event Log
4. **Emphasize:** "The engine validates every move — bounds, blocked cells, movement speed, turn order."

### 4. Attack (0:50–1:10)

1. Click on an enemy token to select as target
2. Click **🗡 Attack Target**
3. **Point out** the ATTACK_RESOLVED event showing roll, hit/miss, damage
4. **Emphasize:** "Attack roll, hit calculation, and damage are all deterministic given the same seed."

### 5. Demonstrate Rejection (1:10–1:30)

1. Try to move to a **blocked cell** (wall/pillar)
2. **Point out** the ACTION_REJECTED event in the log
3. **Emphasize:** "The engine doesn't silently fail. Every rejection is an explicit, logged event with reasons."

### 6. Try AI (optional, 1:30–1:50)

1. Type in the AI Command box: `move seren to 3,4`
2. Press **🤖 Propose**
3. **Point out:** AI mode shows "mock" or "bridge" — transparent about what's real
4. **Emphasize:** "AI proposes actions, engine validates. AI cannot bypass rules."

### 7. Replay Proof (1:50–2:00)

1. Click **📥 Export Replay**
2. **Say:** "This replay bundle contains the initial state + every action. Anyone can re-run it and get the exact same result, verified by hash."

---

## Key Messages to Deliver

| Point | When to Say It |
|-------|---------------|
| **Determinism** | "Same state + same action + same seed = same result. Always." |
| **Transparency** | "Every state change is an explicit event in an append-only log." |
| **AI Safety** | "AI proposes, engine decides. No silent mutations." |
| **Validation** | "25 invariants checked. Schema enforced. Rejections are events." |
| **Reproducibility** | "Export a replay, send it to anyone, they get the same outcome." |

## What NOT to Demo

- Don't show the raw JSON schemas
- Don't deep-dive into code architecture
- Don't promise features that aren't built yet (fog of war, multiplayer, etc.)
- Don't spend time on CSS/visual polish — focus on the engineering guarantees

## Suggested AI Prompts (if using real AI mode)

```
move seren to 3,4
attack the goblin
end turn
roll initiative
move miri north 2
```
